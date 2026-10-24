import type { Panelist } from "../../shared/panel";
import { readMp4Header, type Mp4Header } from "../../shared/mp4";
import type { Playhead } from "../audio/playback";
import { errorOf } from "../api";

/** The clip never started. Nothing was shown or heard, so the line can be spoken as TTS audio instead. */
export class AvatarUnavailable extends Error {}

/** A question's video stream, requested as soon as its text is known (it may start during the handoff line). */
export interface ClipRequest {
  response: Promise<Response>;
  /** Stops the request, and the clip once it plays. */
  abort: AbortController;
  /** performance.now() when the request went out, for the timings. */
  startedAt: number;
}

/** Moments of one streamed clip, for the inspector (A6: how fast Higgs Avatar answers). */
export interface ClipEvents {
  /** ms from the request to the first video bytes. */
  bytes?: (ms: number) => void;
  /** ms from the request until the face is moving on screen, and the codecs it plays. */
  frame?: (ms: number, codecs: string) => void;
  /** All of the clip has arrived: its size, and its length in seconds. */
  received?: (bytes: number, seconds: number) => void;
  /** The clip broke off after it had started; the rest of the line is lost. */
  broken?: (reason: string) => void;
}

/** Give up on a stream whose header has not arrived within this many bytes. */
const MAX_HEADER_BYTES = 2 * 1024 * 1024;

/**
 * Seconds of video to buffer before playing. Higgs Avatar streams slightly
 * slower than real time (A6, 2026-10-22: 10.5 s of video over 11.35 s), in
 * fragments of ~0.8 s. Replaying that clip at that pace, playing on the first
 * fragment froze face and voice 4 times, 1.5 s of headroom once, 2 s never.
 */
const START_BUFFER_SECONDS = 2;

const PANELISTS: Panelist[] = ["technical_lead", "mentor"];

interface Clip {
  speaker: Panelist;
  abort: AbortController;
  /** A streamed clip's SourceBuffer, once the stream has started; null for a whole clip. */
  buffer: SourceBuffer | null;
  /** All of the clip has arrived. */
  complete: boolean;
}

/**
 * The two TTS panelists' talking heads (part 2, AVATAR=true). Each seat keeps
 * one <video> for the whole interview, because a media element can be wired
 * into Web Audio only once; the seat's tile mounts it over the still portrait.
 * Fixed lines play as whole MP4s from the cache (playClip). A question streams
 * Higgs Avatar's fragmented MP4 through Media Source Extensions (speak), so the
 * face starts moving before the clip is fully generated.
 */
export class AvatarStage {
  private readonly videos = Object.fromEntries(PANELISTS.map((p) => [p, createVideo()])) as Record<
    Panelist,
    HTMLVideoElement
  >;
  /** Each video's current object URL, revoked when the next clip replaces it. */
  private readonly urls = new Map<Panelist, string>();
  private readonly sound = new Map<Panelist, { gain: GainNode; analyser: AnalyserNode }>();
  private readonly levelBuf = new Float32Array(1024);
  private volume = 1;
  private clip: Clip | null = null;

  /** `audioContext` is the RingPlayer's, already allowed to play by the Join click. */
  constructor(private readonly audioContext: () => AudioContext | null) {}

  video(speaker: Panelist): HTMLVideoElement {
    return this.videos[speaker];
  }

  /** A clip is loading or playing; its sound and progress stand in for the audio player's. */
  get active(): boolean {
    return this.clip !== null;
  }

  /** RMS loudness of the clip playing now, for the speaking ring. */
  level(): number {
    const analyser = this.clip && this.sound.get(this.clip.speaker)?.analyser;
    if (!analyser) return 0;
    analyser.getFloatTimeDomainData(this.levelBuf);
    let sum = 0;
    for (const sample of this.levelBuf) sum += sample * sample;
    return Math.sqrt(sum / this.levelBuf.length);
  }

  /** Where the clip has got, for the captions and for the words heard before a cut-in. */
  playhead(): Playhead {
    const clip = this.clip;
    if (!clip) return { played: 0, total: 0, complete: false };
    const video = this.videos[clip.speaker];
    if (!clip.buffer) {
      const total = Number.isFinite(video.duration) ? video.duration : 0;
      return { played: video.currentTime, total, complete: total > 0 };
    }
    try {
      const total = bufferedEnd(clip.buffer);
      return { played: Math.min(video.currentTime, total), total, complete: clip.complete };
    } catch {
      // The SourceBuffer was just detached by the next clip.
      return { played: 0, total: 0, complete: false };
    }
  }

  /** Output volume, 1 = as received: lowered while the candidate may be cutting in, like the audio player. */
  setVolume(volume: number): void {
    this.volume = volume;
    const ctx = this.audioContext();
    if (!ctx) return;
    for (const { gain } of this.sound.values()) gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.003);
  }

  /** The candidate cut in: stop the clip at once, and return how many ms of it were played. */
  cut(): number {
    const clip = this.clip;
    if (!clip) return 0;
    const ms = Math.round(this.videos[clip.speaker].currentTime * 1000);
    this.stop();
    return ms;
  }

  /**
   * Play a whole MP4 (a fixed line from the cache) in `speaker`'s tile. Resolves
   * once it has been seen and heard, or stopped; throws AvatarUnavailable if it
   * would not start.
   */
  async playClip(speaker: Panelist, mp4: Blob): Promise<void> {
    this.stop();
    const clip: Clip = { speaker, abort: new AbortController(), buffer: null, complete: true };
    this.clip = clip;
    const video = this.videos[speaker];
    this.connectSound(speaker);
    this.setSource(speaker, URL.createObjectURL(mp4));
    try {
      try {
        await video.play();
      } catch (err) {
        if (clip.abort.signal.aborted) return;
        throw new AvatarUnavailable(`avatar: the browser would not play the video (${(err as Error).message})`);
      }
      video.classList.add("on");
      await playedOut(video, clip.abort.signal);
    } finally {
      if (this.clip === clip) {
        this.clip = null;
        // Fade back to the still portrait, like a panelist who stopped to listen.
        video.classList.remove("on");
      }
    }
  }

  /**
   * Stream one line (a question) into `speaker`'s tile. Resolves once it has been
   * seen and heard, with the clip's bytes for a replay, or null if it was stopped
   * or broke off. Throws AvatarUnavailable if it never started, including when no
   * frame was ready `firstFrameMs` after the request.
   */
  async speak(
    speaker: Panelist,
    request: ClipRequest,
    on: ClipEvents = {},
    firstFrameMs = Infinity,
  ): Promise<Blob | null> {
    this.stop();
    const clip: Clip = { speaker, abort: request.abort, buffer: null, complete: false };
    this.clip = clip;
    const video = this.videos[speaker];
    const since = () => Math.round(performance.now() - request.startedAt);
    let started = false;
    let timedOut = false;
    const watchdog = Number.isFinite(firstFrameMs)
      ? window.setTimeout(
          () => {
            if (started) return;
            timedOut = true;
            request.abort.abort();
          },
          Math.max(0, firstFrameMs - since()),
        )
      : 0;
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    try {
      const res = await request.response;
      if (!res.ok || !res.body)
        throw new AvatarUnavailable(`avatar: ${res.ok ? "empty response" : await errorOf(res)}`);
      const reader = res.body.getReader();
      // Aborting a fetch ends its body, but a stream that merely stalls would leave a read hanging.
      const cancel = () => void reader.cancel().catch(() => {});
      if (clip.abort.signal.aborted) cancel();
      else clip.abort.signal.addEventListener("abort", cancel, { once: true });
      const { header, head } = await readHeader(reader, () => on.bytes?.(since()));
      chunks.push(head);
      const codecs = header.codecs.join(", ");
      const mime = `video/mp4; codecs="${codecs}"`;
      if (!window.MediaSource?.isTypeSupported(mime)) {
        throw new AvatarUnavailable(`avatar: this browser cannot stream ${mime}`);
      }

      this.connectSound(speaker);
      const source = new MediaSource();
      this.setSource(speaker, URL.createObjectURL(source));
      await new Promise((resolve) => source.addEventListener("sourceopen", resolve, { once: true }));
      const buffer = source.addSourceBuffer(mime);
      clip.buffer = buffer;
      let bytes = head.length;
      let done = false;
      const next = async () => {
        const chunk = await reader.read();
        if (chunk.done) done = true;
        else {
          bytes += chunk.value.length;
          chunks.push(chunk.value);
          await append(buffer, chunk.value);
        }
      };
      await append(buffer, head);
      // Hold play() until there is some headroom (or the whole clip, if shorter).
      while (!done && bufferedEnd(buffer) < START_BUFFER_SECONDS) await next();
      if (clip.abort.signal.aborted) throw new Error("stopped before it played");
      if (buffer.buffered.length === 0) throw new AvatarUnavailable("avatar: the stream held no frames");

      video.addEventListener("playing", () => on.frame?.(since(), codecs), { once: true });
      try {
        await video.play();
      } catch (err) {
        throw new AvatarUnavailable(`avatar: the browser would not play the video (${(err as Error).message})`);
      }
      started = true;
      video.classList.add("on");
      const finished = playedOut(video, clip.abort.signal);

      while (!done) await next();
      // Cut into or stopped while it was still arriving.
      if (clip.abort.signal.aborted) return null;
      clip.complete = true;
      on.received?.(bytes, bufferedEnd(buffer));
      if (source.readyState === "open") source.endOfStream();
      await finished;
      // Cut into or stopped while it played.
      if (clip.abort.signal.aborted) return null;
      if (video.error) {
        on.broken?.(`the video could not be decoded (${video.error.message || video.error.code})`);
        return null;
      }
      return new Blob(chunks, { type: "video/mp4" });
    } catch (err) {
      if (timedOut) throw new AvatarUnavailable(`avatar: no video within ${firstFrameMs / 1000} s`);
      // Stopped by a cut-in, a hang-up or the next clip: nothing to report.
      if (clip.abort.signal.aborted) return null;
      if (!started)
        throw err instanceof AvatarUnavailable ? err : new AvatarUnavailable(`avatar: ${(err as Error).message}`);
      on.broken?.((err as Error).message);
      return null;
    } finally {
      window.clearTimeout(watchdog);
      if (this.clip === clip) {
        this.clip = null;
        // Fade back to the still portrait, like a panelist who stopped to listen.
        video.classList.remove("on");
      }
    }
  }

  /** Stop the clip playing now, if any; its playClip / speak resolves. */
  stop(): void {
    const clip = this.clip;
    if (!clip) return;
    this.clip = null;
    clip.abort.abort();
    const video = this.videos[clip.speaker];
    video.pause();
    video.classList.remove("on");
  }

  /** Hang-up: stop, and let go of both videos and their sound. */
  close(): void {
    this.stop();
    for (const video of Object.values(this.videos)) {
      video.removeAttribute("src");
      video.load();
      video.remove();
    }
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
    for (const { gain, analyser } of this.sound.values()) {
      gain.disconnect();
      analyser.disconnect();
    }
    this.sound.clear();
  }

  /** Point `speaker`'s video at a new object URL, letting go of the one before. */
  private setSource(speaker: Panelist, url: string): void {
    const old = this.urls.get(speaker);
    if (old) URL.revokeObjectURL(old);
    this.urls.set(speaker, url);
    this.videos[speaker].src = url;
  }

  /** Route a seat's video through the shared AudioContext (once): volume control and a loudness meter. */
  private connectSound(speaker: Panelist): void {
    if (this.sound.has(speaker)) return;
    const ctx = this.audioContext();
    // No context: no meter or ducking, but the video still plays its own sound.
    if (!ctx) return;
    const gain = ctx.createGain();
    gain.gain.value = this.volume;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = this.levelBuf.length;
    ctx.createMediaElementSource(this.videos[speaker]).connect(gain);
    gain.connect(analyser);
    analyser.connect(ctx.destination);
    this.sound.set(speaker, { gain, analyser });
  }
}

function createVideo(): HTMLVideoElement {
  const video = document.createElement("video");
  video.className = "tile-avatar-video";
  video.playsInline = true;
  video.disablePictureInPicture = true;
  video.preload = "auto";
  return video;
}

/** Read until the MP4 header is complete; returns it with every byte read so far. */
async function readHeader(
  reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>,
  onFirstBytes: () => void,
): Promise<{ header: Mp4Header; head: Uint8Array<ArrayBuffer> }> {
  let head = new Uint8Array(0);
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) throw new AvatarUnavailable("avatar: the stream ended before the video header");
    if (head.length === 0 && chunk.value.length > 0) onFirstBytes();
    const joined = new Uint8Array(head.length + chunk.value.length);
    joined.set(head);
    joined.set(chunk.value, head.length);
    head = joined;
    let header: Mp4Header | null;
    try {
      header = readMp4Header(head);
    } catch (err) {
      throw new AvatarUnavailable(`avatar: ${(err as Error).message}`);
    }
    if (header) return { header, head };
    if (head.length > MAX_HEADER_BYTES) throw new AvatarUnavailable("avatar: no video header in the first 2 MB");
  }
}

/** Append one chunk and wait until the SourceBuffer has taken it. */
function append(buffer: SourceBuffer, bytes: Uint8Array<ArrayBuffer>): Promise<void> {
  return new Promise((resolve, reject) => {
    const taken = () => {
      buffer.removeEventListener("error", failed);
      resolve();
    };
    const failed = () => {
      buffer.removeEventListener("updateend", taken);
      reject(new Error("the browser could not decode the video"));
    };
    buffer.addEventListener("updateend", taken, { once: true });
    buffer.addEventListener("error", failed, { once: true });
    buffer.appendBuffer(bytes);
  });
}

/** Resolves when `video` plays to its end, fails to decode, or `signal` aborts. */
function playedOut(video: HTMLVideoElement, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("ended", done);
      video.removeEventListener("error", done);
      signal.removeEventListener("abort", done);
      resolve();
    };
    if (signal.aborted) return resolve();
    video.addEventListener("ended", done);
    video.addEventListener("error", done);
    signal.addEventListener("abort", done);
  });
}

function bufferedEnd(buffer: SourceBuffer): number {
  const ranges = buffer.buffered;
  return ranges.length ? ranges.end(ranges.length - 1) : 0;
}
