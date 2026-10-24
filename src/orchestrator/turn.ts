import { FRAME_MS } from "../audio/vad";

// Thresholds on Silero's speech probability, from @ricky0123/vad-web's defaults for
// v5: at or above START is speech, below END is silence, in between keeps the state.
export const START = 0.3;
const END = 0.25;
/** This much speech before it counts as the candidate talking (skips clicks and short noises). */
const MIN_SPEECH_MS = 250;
/** This much silence after speech counts as a pause worth checking. */
export const PAUSE_MS = 500;
/** After the candidate cut into the handoff to add to an answer, they get longer pauses (doc/orchestrator.zh.md 3.3). */
export const LONG_PAUSE_MS = 1000;

export interface TurnHooks {
  /** The candidate started (or went back to) talking. */
  speech(): void;
  /** The candidate has been silent for PAUSE_MS after talking. */
  pause(): void;
}

/**
 * Turns Silero's per-frame speech probabilities into "started talking" and
 * "paused" events for the candidate's turn. Deciding whether a pause ends the
 * answer is the Interview's job (deepseek-flash, see shared/turn.ts).
 */
export class TurnDetector {
  private listening = false;
  private talking = false;
  private speechMs = 0;
  private silenceMs = 0;
  private pauseMs = PAUSE_MS;

  constructor(private readonly hooks: TurnHooks) {}

  /**
   * A candidate turn starts: nobody has spoken yet, or, with `talking`, the
   * candidate already is (they cut into the panel). `pauseMs`: the silence that
   * counts as a pause.
   */
  start(talking = false, pauseMs = PAUSE_MS): void {
    this.listening = true;
    this.talking = talking;
    this.speechMs = 0;
    this.silenceMs = 0;
    this.pauseMs = pauseMs;
  }

  stop(): void {
    this.listening = false;
  }

  isTalking(): boolean {
    return this.talking;
  }

  /** One 32 ms frame's speech probability, from SileroVad. */
  frame(probability: number): void {
    if (!this.listening) return;
    if (probability >= START) {
      this.silenceMs = 0;
      this.speechMs += FRAME_MS;
      if (!this.talking && this.speechMs >= MIN_SPEECH_MS) {
        this.talking = true;
        this.hooks.speech();
      }
    } else if (probability < END) {
      this.silenceMs += FRAME_MS;
      if (!this.talking) this.speechMs = 0;
      else if (this.silenceMs >= this.pauseMs) {
        this.talking = false;
        this.speechMs = 0;
        this.hooks.pause();
      }
    }
  }
}
