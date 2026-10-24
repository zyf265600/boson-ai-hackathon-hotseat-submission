import { FRAME_MS } from "../audio/vad";
import { onlyBackchannel } from "./intent";
import type { Language } from "../../shared/languages";
import { START } from "./turn";

// While the panel speaks (only with headphones on), decides whether the candidate
// is cutting in (doc/orchestrator.zh.md 3.3): voice lowers the panel's volume
// first, then a real word, or voice that goes on, stops the panel.
const END = 0.25;
/** This much voice in a row lowers the panel's volume. */
const DUCK_MS = 200;
/** This much silence after it ends the voice: a cough or an "mm-hm", so the volume comes back. */
const RELEASE_MS = 250;
/**
 * By this long after the voice started, voice still going with no words from the recognizer
 * counts as cutting in. 600 ms until 2026-10-23: noise with no words (Whisper heard only "-")
 * stopped the panel 3 times in one interview (logs/2026-10-23_221131_mvlrj26i.md); those
 * bursts lasted 0.5–0.65 s. 1 s, the user's choice (1.5 s felt too long).
 */
const WINDOW_MS = 1000;
/** Voice still going this long counts as cutting in, even if the recognizer only heard backchannel words. */
const MAX_WINDOW_MS = 1800;

/** How a cut-in was confirmed: a real word from the browser recognizer, or voice that went on. */
export type Confirmed = { by: "word"; word: string; ms: number } | { by: "voice"; ms: number };

export interface BargeInHooks {
  /** `ms` of voice so far: lower the panel's volume. */
  duck(ms: number): void;
  /** The voice ended without a real word: restore the volume. `words`: what the recognizer heard, if anything. */
  release(ms: number, words: string[]): void;
  /** The candidate is cutting in: stop the panel. */
  confirm(how: Confirmed): void;
}

/**
 * Turns Silero's per-frame speech probabilities and the browser recognizer's
 * words into "duck", "release" and "confirm" while a panel line plays. Times are
 * audio time from the first voiced frame, counted in VAD frames.
 */
export class BargeInDetector {
  private listening = false;
  /** Audio time since the voice started; null while no voice is being judged. */
  private voiceMs: number | null = null;
  private speechMs = 0;
  private silenceMs = 0;
  private ducked = false;
  /** The recognizer's words so far, and how many of them came before this voice. */
  private words: string[] = [];
  private base = 0;
  /** Over the whole line: voiced frames (probability >= START) and the highest probability. */
  private voicedTotal = 0;
  private peak = 0;

  /** `lang`: the interview language, whose backchannel words ("mm-hm", "okay"; "嗯") are not real words. */
  constructor(
    private readonly hooks: BargeInHooks,
    private readonly lang: Language = "en",
  ) {}

  /** A real word, not a backchannel: what the recognizer heard as one word (a whole phrase in Chinese or Japanese). */
  private isReal = (word: string) => !onlyBackchannel(word, this.lang) && /[\p{L}\p{N}]/u.test(word);

  /** A panel line the candidate may cut into has started. */
  start(): void {
    this.listening = true;
    this.voiceMs = null;
    this.speechMs = 0;
    this.silenceMs = 0;
    this.ducked = false;
    this.voicedTotal = 0;
    this.peak = 0;
  }

  /**
   * What the VAD heard during the line: voiced ms in all, and the highest speech
   * probability. For the log when a line ends with no cut-in, so "I spoke and
   * nothing happened" can be told apart from "the mic heard nothing".
   */
  heardDuringLine(): { voicedMs: number; peak: number } {
    return { voicedMs: Math.round(this.voicedTotal), peak: this.peak };
  }

  stop(): void {
    this.listening = false;
  }

  /** The recognizer's words heard since it started; this voice's are those past `base`. */
  heard(words: string[]): void {
    this.words = words;
    if (this.listening && this.ducked) this.judge();
  }

  /** How many recognizer words came before the voice now being judged (for the caption). */
  wordsBefore(): number {
    return this.base;
  }

  /** One 32 ms frame's speech probability, from SileroVad. */
  frame(probability: number): void {
    if (!this.listening) return;
    this.peak = Math.max(this.peak, probability);
    if (probability >= START) this.voicedTotal += FRAME_MS;
    if (this.voiceMs !== null) this.voiceMs += FRAME_MS;
    if (probability >= START) {
      if (this.voiceMs === null) {
        this.voiceMs = FRAME_MS;
        this.base = this.words.length;
      }
      this.silenceMs = 0;
      this.speechMs += FRAME_MS;
      if (!this.ducked && this.speechMs >= DUCK_MS) {
        this.ducked = true;
        this.hooks.duck(Math.round(this.voiceMs));
      }
    } else if (probability < END && this.voiceMs !== null) {
      this.silenceMs += FRAME_MS;
      if (!this.ducked) {
        // Too short to duck for (a click): forget it.
        if (this.silenceMs >= RELEASE_MS) this.voiceMs = null;
        this.speechMs = 0;
      } else if (this.silenceMs >= RELEASE_MS) {
        const ms = Math.round(this.voiceMs);
        this.ducked = false;
        this.voiceMs = null;
        this.speechMs = 0;
        this.hooks.release(ms, this.words.slice(this.base));
        return;
      }
    }
    if (this.ducked) this.judge();
  }

  private judge(): void {
    const ms = Math.round(this.voiceMs ?? 0);
    const words = this.words.slice(this.base);
    const real = words.find(this.isReal);
    if (real) return this.done({ by: "word", word: real, ms });
    // Still talking (not in a gap) past the window: no words at all, or only backchannels for too long.
    if (this.silenceMs === 0 && ms >= (words.length === 0 ? WINDOW_MS : MAX_WINDOW_MS)) this.done({ by: "voice", ms });
  }

  private done(how: Confirmed): void {
    this.listening = false;
    this.ducked = false;
    this.voiceMs = null;
    this.hooks.confirm(how);
  }
}
