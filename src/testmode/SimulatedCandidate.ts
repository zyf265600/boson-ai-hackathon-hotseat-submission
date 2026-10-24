import { RingPlayer } from "../audio/playback";
import { errorOf } from "../api";
import { base64FromBuffer } from "../audio/capture";
import { AUDIO_RATE } from "../realtime/sessionConfig";
import { PROJECTS, scriptParagraphs, type ScriptLength } from "./scripts";

/** Rough speaking rate, to place the highlight in a paragraph whose audio is still arriving. */
const CHARS_PER_SECOND = 15;
/** Silence between paragraphs, so they do not run together. */
const PARAGRAPH_GAP_SEC = 0.35;
/** Audio goes out in ~100 ms frames, like the microphone's. */
const TICK_MS = 100;
/** Sent ahead of real time when playback starts, so the speakers never run dry between frames. */
const LEAD_MS = 200;

const secs = (samples: number) => `${(samples / AUDIO_RATE).toFixed(1)} s`;

/**
 * One script synthesized with Higgs TTS 3, a paragraph per request, in order.
 * Kept for the whole page, so playing it again costs no credits.
 */
class ScriptAudio {
  pcm = new Int16Array(AUDIO_RATE * 30);
  samples = 0;
  complete = false;
  error = "";
  /** Where each paragraph's audio starts and ends; `end` is null while it streams. */
  readonly spans: { start: number; end: number | null }[] = [];

  /** `pcm`: ready-made audio (e.g. noise) shown as `paragraphs[0]`, instead of synthesizing the text. */
  constructor(
    readonly paragraphs: string[],
    pcm?: Int16Array<ArrayBuffer>,
  ) {
    if (!pcm) {
      void this.synthesize();
      return;
    }
    this.pcm = pcm;
    this.samples = pcm.length;
    this.spans.push({ start: 0, end: pcm.length });
    this.complete = true;
  }

  private append(chunk: Int16Array): void {
    if (this.samples + chunk.length > this.pcm.length) {
      const bigger = new Int16Array(Math.max(this.pcm.length * 2, this.samples + chunk.length));
      bigger.set(this.pcm.subarray(0, this.samples));
      this.pcm = bigger;
    }
    this.pcm.set(chunk, this.samples);
    this.samples += chunk.length;
  }

  private async synthesize(): Promise<void> {
    try {
      for (const [i, text] of this.paragraphs.entries()) {
        if (i > 0) this.append(new Int16Array(Math.round(PARAGRAPH_GAP_SEC * AUDIO_RATE)));
        const span: { start: number; end: number | null } = { start: this.samples, end: null };
        this.spans.push(span);
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ speaker: "candidate", text }),
        });
        if (!res.ok || !res.body) throw new Error(`tts: ${res.ok ? "empty response" : await errorOf(res)}`);
        const reader = res.body.getReader();
        // A network chunk can end in the middle of a 2-byte sample; carry the odd byte over.
        let carry: Uint8Array = new Uint8Array(0);
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          const bytes = new Uint8Array(carry.length + value.length);
          bytes.set(carry);
          bytes.set(value, carry.length);
          const even = bytes.length - (bytes.length % 2);
          carry = bytes.slice(even);
          if (even > 0) this.append(new Int16Array(bytes.slice(0, even).buffer));
        }
        span.end = this.samples;
      }
      this.complete = true;
    } catch (err) {
      this.error = (err as Error).message;
    }
  }

  /** The script as shown in the panel: paragraphs separated by a blank line. */
  text(): string {
    return this.paragraphs.join("\n\n");
  }

  /** How many characters of text() have been heard once `cursor` samples have played. */
  heardChars(cursor: number): number {
    let offset = 0;
    for (const [i, span] of this.spans.entries()) {
      const len = this.paragraphs[i].length;
      if (cursor <= span.start) return offset;
      if (span.end !== null && cursor >= span.end) {
        offset += len + 2;
        continue;
      }
      const fraction =
        span.end !== null
          ? (cursor - span.start) / (span.end - span.start)
          : ((cursor - span.start) / AUDIO_RATE) * (CHARS_PER_SECOND / len);
      return offset + Math.min(len, Math.round(fraction * len));
    }
    return Math.min(offset, this.text().length);
  }
}

const cache = new Map<string, ScriptAudio>();

export type ScriptStatus = "loading" | "playing" | "paused" | "finished";

export interface ScriptState {
  project: string;
  /** null for a single line or noise (say(), noise()). */
  length: ScriptLength | null;
  status: ScriptStatus;
  error: string;
}

/** Polled by the panel to draw the highlight and the progress bar. */
export interface ScriptProgress {
  text: string;
  /** Characters of `text` already read out. */
  heard: number;
  played: number;
  /** Seconds; null until all audio has arrived. */
  total: number | null;
}

export interface ScriptHooks {
  /** Append audio to the Realtime input buffer, exactly as the microphone does. */
  sendAudio(base64: string): void;
  /** A script is being read: keep the real microphone out of the answer. */
  setActive(active: boolean): void;
  level(rms: number): void;
  caption(text: string): void;
  /** The whole script has been heard and auto-submit is on. */
  finished(): void;
  changed(state: ScriptState | null): void;
  log(text: string): void;
  /** A script started from the top: what is about to be read, for the session log. */
  started(script: { project: string; length: string; text: string }): void;
}

/**
 * Test mode: reads a sample answer from corpus/candidate-scripts/ as the candidate. The
 * audio goes to Higgs Realtime in real time, frame by frame, and to the
 * speakers, so pausing simply stops the frames and playing resumes from there.
 */
export class SimulatedCandidate {
  /**
   * End the answer by itself once the script has been read out. When off, the
   * candidate goes quiet instead: silence keeps flowing, as from a real mic, so
   * turn detection hears the pause. Pausing the script sends silence too.
   */
  autoSubmit = true;
  private readonly player = new RingPlayer();
  private current: (ScriptState & { audio: ScriptAudio; cursor: number }) | null = null;
  private timer: number | null = null;
  private lastTick = 0;
  private lastCaption = "";
  /** The last frame has gone out; waiting for the speakers to finish it. */
  private finishing = false;

  constructor(private readonly hooks: ScriptHooks) {}

  state(): ScriptState | null {
    if (!this.current) return null;
    const { project, length, status, error } = this.current;
    return { project, length, status, error };
  }

  progress(): ScriptProgress | null {
    const cur = this.current;
    if (!cur) return null;
    return {
      text: cur.audio.text(),
      heard: cur.audio.heardChars(cur.cursor),
      played: cur.cursor / AUDIO_RATE,
      total: cur.audio.complete ? cur.audio.samples / AUDIO_RATE : null,
    };
  }

  /** Start a script, or resume the paused one. Must run inside a click so the speakers can start. */
  async play(project: string, length: ScriptLength): Promise<void> {
    await this.player.resume();
    const cur = this.current;
    if (cur && cur.project === project && cur.length === length && cur.status === "paused" && !cur.error) {
      this.hooks.log(`resumed at ${secs(cur.cursor)}`);
    } else {
      this.reset();
      const key = `${project}.${length}`;
      let audio = cache.get(key);
      if (!audio || audio.error) {
        audio = new ScriptAudio(scriptParagraphs(project, length));
        cache.set(key, audio);
      }
      this.current = { project, length, status: "loading", error: "", audio, cursor: 0 };
      const title = PROJECTS.find((p) => p.id === project)?.title ?? project;
      this.hooks.started({ project, length, text: audio.text() });
      const chars = audio.text().length;
      this.hooks.log(`reading "${title}" (${length}, ${chars} chars)${audio.complete ? " from cached audio" : ""}`);
    }
    this.begin();
  }

  /**
   * Say one short line, e.g. "Mm-hm." or a cut-in, at any time, also while the
   * panel speaks (called by test scripts through window.hotseatTest). The audio
   * is synthesized once and kept, like a script's.
   */
  async say(text: string): Promise<void> {
    await this.player.resume();
    this.reset();
    const key = `say:${text}`;
    let audio = cache.get(key);
    if (!audio || audio.error) {
      audio = new ScriptAudio([text]);
      cache.set(key, audio);
    }
    this.current = { project: "say", length: null, status: "loading", error: "", audio, cursor: 0 };
    this.hooks.started({ project: "say", length: "line", text });
    this.hooks.log(`saying "${text}"${audio.complete ? " from cached audio" : ""}`);
    this.begin();
  }

  /** Synthesize lines for say() ahead, so they start at once (test scripts). */
  prepare(texts: string[]): void {
    for (const text of texts) if (!cache.has(`say:${text}`)) cache.set(`say:${text}`, new ScriptAudio([text]));
  }

  /** Like say(), but `ms` of white noise at loudness `rms` (no speech in it). */
  async noise(ms: number, rms = 0.05): Promise<void> {
    await this.player.resume();
    this.reset();
    const pcm = new Int16Array(Math.round((ms / 1000) * AUDIO_RATE));
    // Uniform noise in [-a, a] has RMS a / sqrt(3).
    const peak = rms * Math.sqrt(3) * 32767;
    for (let i = 0; i < pcm.length; i++) pcm[i] = Math.round((Math.random() * 2 - 1) * peak);
    const text = `(noise, ${ms} ms)`;
    const audio = new ScriptAudio([text], pcm);
    this.current = { project: "noise", length: null, status: "loading", error: "", audio, cursor: 0 };
    this.hooks.started({ project: "noise", length: "noise", text });
    this.hooks.log(`making ${ms} ms of noise`);
    this.begin();
  }

  /** Start sending the current audio, frame by frame. */
  private begin(): void {
    this.hooks.setActive(true);
    this.current!.status = "loading";
    this.hooks.changed(this.state());
    this.player.reset();
    this.stopTimer();
    this.lastTick = performance.now() - LEAD_MS;
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  pause(): void {
    const cur = this.current;
    if (!cur || (cur.status !== "playing" && cur.status !== "loading")) return;
    // The timer keeps running and sends silence, like a candidate who stopped to think.
    void this.player.flush();
    this.hooks.level(0);
    this.setStatus("paused");
    this.hooks.log(`paused at ${secs(cur.cursor)}`);
  }

  /** The turn is over or the call closed: drop the current script (its audio stays cached). */
  reset(): void {
    this.stopTimer();
    this.finishing = false;
    if (!this.current) return;
    void this.player.flush();
    this.current = null;
    this.lastCaption = "";
    this.hooks.level(0);
    this.hooks.setActive(false);
    this.hooks.changed(null);
  }

  async close(): Promise<void> {
    this.reset();
    await this.player.close();
  }

  private tick(): void {
    const cur = this.current;
    if (!cur) return;
    const { audio } = cur;
    if (audio.error) {
      this.stopTimer();
      cur.error = audio.error;
      this.setStatus("paused");
      this.hooks.log(`TTS failed: ${audio.error}`);
      return;
    }

    const now = performance.now();
    const budget = Math.round(((now - this.lastTick) / 1000) * AUDIO_RATE);
    this.lastTick = now;
    if (cur.status === "paused" || cur.status === "finished" || (audio.complete && cur.cursor >= audio.samples)) {
      if (budget > 0) this.hooks.sendAudio(base64FromBuffer(new Int16Array(budget).buffer));
      if (cur.status !== "paused" && cur.status !== "finished" && !this.finishing) {
        this.finishing = true;
        void this.finish();
      }
      return;
    }
    const end = Math.min(audio.samples, cur.cursor + budget);
    if (end > cur.cursor) {
      const frame = audio.pcm.slice(cur.cursor, end);
      this.hooks.sendAudio(base64FromBuffer(frame.buffer));
      this.player.enqueueBytes(frame.buffer);
      cur.cursor = end;
      this.setStatus("playing");
    } else if (!audio.complete) {
      // Speaking faster than TTS delivers: wait for the next paragraph.
      this.setStatus("loading");
    }
    this.hooks.level(this.player.level());

    const text = audio.text();
    const heard = text.slice(0, audio.heardChars(cur.cursor));
    // Whole words only, like a caption.
    const caption = (heard.length < text.length ? heard.slice(0, heard.lastIndexOf(" ") + 1) : heard)
      .replace(/\s+/g, " ")
      .trim();
    if (caption !== this.lastCaption) {
      this.lastCaption = caption;
      this.hooks.caption(caption);
    }
  }

  private async finish(): Promise<void> {
    await this.player.waitUntilDrained();
    this.finishing = false;
    const cur = this.current;
    if (!cur) return;
    this.setStatus("finished");
    this.hooks.level(0);
    if (this.autoSubmit) {
      this.stopTimer();
      this.hooks.setActive(false);
      this.hooks.log(`finished after ${secs(cur.cursor)}, submitting the answer`);
      this.hooks.finished();
    } else {
      this.hooks.log(`finished after ${secs(cur.cursor)}; silent until the answer ends`);
    }
  }

  private setStatus(status: ScriptStatus): void {
    if (!this.current || this.current.status === status) return;
    this.current.status = status;
    this.hooks.changed(this.state());
  }

  private stopTimer(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }
}
