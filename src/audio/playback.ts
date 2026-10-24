import { LANGUAGES, spokenUnits, type Language } from "../../shared/languages";
import playbackWorkletSource from "./worklets/playback-processor.js?raw";
import { addWorkletModule } from "./loadWorklet";
import { AUDIO_RATE } from "../realtime/sessionConfig";

/** base64 text -> the raw bytes it encodes. */
function base64ToBytes(base64: string): ArrayBuffer {
  // Audio cannot travel through a JSON protocol as raw bytes, so the API
  // base64-encodes it. `atob` reverses that, giving a string whose character
  // codes are the byte values.
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** HotSeat: playback position in the current utterance, in seconds. */
export interface Playhead {
  played: number;
  total: number;
  /** All of the utterance has been queued, so `total` is final. */
  complete: boolean;
}

/** Typical speaking pace, used to pace the words until a line's full length is known. */
const SECONDS_PER_WORD = 0.38;
/** The same for a language counted in characters (Chinese, Japanese): about 4.5 characters a second. */
const SECONDS_PER_CHAR = 0.22;

/**
 * HotSeat: how many words of `text` have been heard at `head`, assuming they are
 * spread evenly over the audio. Shared by the captions and the record of a line
 * the candidate cut into.
 */
export function heardWords(text: string, head: Playhead, lang: Language = "en"): number {
  const words = spokenUnits(text, lang).length;
  // Until all the audio is in, the line's length is unknown: pace by speech rate instead.
  const perUnit = LANGUAGES[lang].countChars ? SECONDS_PER_CHAR : SECONDS_PER_WORD;
  const length = head.complete ? head.total : Math.max(head.total, words * perUnit);
  return length > 0 ? Math.min(words, Math.ceil((head.played / length) * words)) : 0;
}

/**
 * Plays the audio the model sends us.
 *
 * The interesting work happens in the worklet (see
 * `worklets/playback-processor.js`); this class is the main-thread handle for
 * it — set up the AudioContext, decode base64, hand the bytes over.
 */
export class RingPlayer {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  /** HotSeat: taps the output so the UI can draw the speaking ring. */
  private analyser: AnalyserNode | null = null;
  /** HotSeat: the output volume, lowered while the candidate may be cutting in (setVolume). */
  private gain: GainNode | null = null;
  private levelBuf: Float32Array<ArrayBuffer> | null = null;
  private initPromise: Promise<void> | null = null;
  private readonly onSpeakingChange?: (speaking: boolean) => void;
  /** Resolvers waiting for a `flushed` reply from the worklet. */
  private pendingFlush: Array<(ms: number) => void> = [];
  /** HotSeat: whether queued audio is still playing, and who waits for it to end. */
  private speaking = false;
  private drainWaiters: Array<() => void> = [];
  /** HotSeat: samples queued since reset(), when the first of them started playing, and whether all have arrived. */
  private queued = 0;
  private startedAt: number | null = null;
  private complete = false;

  constructor(onSpeakingChange?: (speaking: boolean) => void) {
    this.onSpeakingChange = onSpeakingChange;
  }

  private ensureInit(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      // Request the same rate the API is sending. If the context ran at a
      // different rate the browser would resample for us, which sounds fine but
      // breaks the sample-counting we rely on in Part 2.
      const ctx = new AudioContext({ sampleRate: AUDIO_RATE });
      await addWorkletModule(ctx, playbackWorkletSource);

      const node = new AudioWorkletNode(ctx, "playback-processor", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });

      node.port.onmessage = (e: MessageEvent) => {
        const d = e.data as { type: string; played?: number };
        if (d.type === "flushed") {
          // Samples -> milliseconds. This division is only correct because the
          // context runs at the same rate the API sends at (see AUDIO_RATE).
          const ms = ((d.played ?? 0) / AUDIO_RATE) * 1000;
          this.pendingFlush.shift()?.(ms);
          this.setSpeaking(false);
        } else if (d.type === "drained") {
          this.setSpeaking(false);
        }
      };

      const gain = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      node.connect(gain);
      gain.connect(analyser);
      analyser.connect(ctx.destination);
      this.ctx = ctx;
      this.node = node;
      this.gain = gain;
      this.analyser = analyser;
      this.levelBuf = new Float32Array(analyser.fftSize);

      if (ctx.sampleRate !== AUDIO_RATE) {
        console.warn(
          `AudioContext is running at ${ctx.sampleRate} Hz, not ${AUDIO_RATE}. ` +
            `Playback will still work, but Part 2's truncate timing will drift.`,
        );
      }
    })();
    return this.initPromise;
  }

  /**
   * Browsers refuse to start audio until the user has interacted with the page,
   * so this has to be called from inside a click handler — we call it from
   * "Connect". Creating the context outside a gesture leaves it `suspended` and
   * everything is silent with no error anywhere.
   */
  async resume(): Promise<void> {
    await this.ensureInit();
    if (this.ctx?.state === "suspended") await this.ctx.resume();
  }

  /** Hand one base64 PCM16 chunk to the ring buffer. */
  enqueueBase64(base64: string): void {
    this.enqueueBytes(base64ToBytes(base64));
  }

  /** Hand raw PCM16 bytes (even length) to the ring buffer — used for TTS audio. */
  enqueueBytes(buf: ArrayBuffer): void {
    if (!this.node) return;
    if (this.startedAt === null) this.startedAt = this.ctx!.currentTime;
    this.queued += buf.byteLength / 2;
    // The second argument transfers ownership of the buffer to the audio thread
    // instead of copying it. At ~120 chunks per reply the copies would add up.
    this.node.port.postMessage({ type: "samples", payload: buf }, [buf]);
    this.setSpeaking(true);
  }

  /**
   * HotSeat: the context this player runs in, null before resume(). The avatar
   * videos route their sound through it too, so it is already allowed to play.
   */
  audioContext(): AudioContext | null {
    return this.ctx;
  }

  /** HotSeat: RMS loudness of what is playing right now (0 when silent). */
  level(): number {
    if (!this.analyser || !this.levelBuf) return 0;
    this.analyser.getFloatTimeDomainData(this.levelBuf);
    let sum = 0;
    for (let i = 0; i < this.levelBuf.length; i++) sum += this.levelBuf[i] * this.levelBuf[i];
    return Math.sqrt(sum / this.levelBuf.length);
  }

  /** HotSeat: output volume, 1 = as received. Changes within ~10 ms, without a click. */
  setVolume(volume: number): void {
    if (this.ctx && this.gain) this.gain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.003);
  }

  /** HotSeat: the whole current utterance has been queued, so its length is now known. */
  markComplete(): void {
    this.complete = true;
  }

  /**
   * HotSeat: where playback is in the current utterance, for the captions:
   * seconds heard, seconds queued so far, and whether that is all of it.
   * Heard time is estimated from the clock, capped at what has arrived.
   */
  playhead(): Playhead {
    const total = this.queued / AUDIO_RATE;
    if (!this.ctx || this.startedAt === null) return { played: 0, total, complete: this.complete };
    const played = Math.min(total, this.ctx.currentTime - this.startedAt);
    return { played, total, complete: this.complete };
  }

  /** HotSeat: play one whole clip (a cached fixed line) as a new utterance; resolves once heard. */
  playClip(pcm: ArrayBuffer): Promise<void> {
    this.reset();
    // enqueueBytes hands the buffer to the audio thread; keep the cached copy usable.
    this.enqueueBytes(pcm.slice(0));
    this.markComplete();
    return this.waitUntilDrained();
  }

  /** Resolves once everything queued so far has been played (or flushed). */
  waitUntilDrained(): Promise<void> {
    if (!this.speaking) return Promise.resolve();
    return new Promise((resolve) => this.drainWaiters.push(resolve));
  }

  private setSpeaking(speaking: boolean): void {
    this.speaking = speaking;
    this.onSpeakingChange?.(speaking);
    if (!speaking) this.drainWaiters.splice(0).forEach((resolve) => resolve());
  }

  /**
   * Zero the played-sample counter. Call at the start of each assistant turn,
   * so `flush()` reports milliseconds into *this* reply rather than into the
   * whole session.
   */
  reset(): void {
    this.queued = 0;
    this.startedAt = null;
    this.complete = false;
    this.node?.port.postMessage({ type: "reset" });
  }

  /**
   * Stop playing immediately, discarding whatever is queued.
   *
   * Resolves with how many milliseconds were actually played since the last
   * `reset()` — the number the server needs in `conversation.item.truncate`.
   * It has to come back asynchronously because only the audio thread knows it.
   * HotSeat: the utterance then ends where it was cut, so the playhead (and the
   * caption) stops there instead of running on to the end.
   */
  flush(): Promise<number> {
    if (!this.node) return Promise.resolve(0);
    return new Promise((resolve) => {
      this.pendingFlush.push((ms) => {
        this.queued = Math.min(this.queued, Math.round((ms / 1000) * AUDIO_RATE));
        this.complete = true;
        resolve(ms);
      });
      this.node!.port.postMessage({ type: "flush" });
    });
  }

  async close(): Promise<void> {
    if (this.ctx) {
      await this.ctx.close();
      this.ctx = null;
      this.node = null;
      this.gain = null;
      this.analyser = null;
      this.initPromise = null;
    }
  }
}
