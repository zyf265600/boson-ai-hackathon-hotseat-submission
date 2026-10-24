// Test mode: the interview window streams its internal state to an inspector
// window over a BroadcastChannel. These are the messages both sides share.

import type { FloorKind, Phase, ResumeCase } from "../interview";
import type { Confirmed } from "../orchestrator/bargeIn";
import type { Difficulty, Panelist, Speaker } from "../../shared/panel";
import type { QuestionMode, NextQuestion } from "../../shared/questions";
import type { Turn } from "../api";
import type { TurnVerdict } from "../../shared/turn";
import type { Intent } from "../orchestrator/intent";
import type { CompanyPronunciation, InterviewSettings } from "../../shared/settings";

export const CHANNEL = "hotseat-inspector";

/** Plain-words names for the interview phases, as the inspector shows them. */
export const PHASE_LABELS: Record<Phase, string> = {
  idle: "not started",
  panel: "interviewer speaking",
  candidate: "candidate speaking",
  thinking: "generating question",
  reconnecting: "reconnecting to Realtime",
  done: "ended",
};

/** Plain-words names for how the interview picks up after a lost connection. */
export const RESUME_LABELS: Record<ResumeCase, string> = {
  answerAgain: "the candidate answers the last question again (the part already said is dropped)",
  askAgain: "the current question is asked again",
  nextQuestion: "the next question was not ready; it is waited for and asked",
};

/** Plain-words names for what the candidate cut into. */
export const FLOOR_LABELS: Record<FloorKind, string> = {
  handoff: "the handoff line",
  question: "the question",
  opening: "Realtime's opening",
  timeBuyer: "Realtime's Time Buyer question",
  clarify: "Realtime's explanation",
  resume: "Realtime's resume line",
  prompt: "a silence prompt",
};

/** Plain-words name for the TEST vs product setting (TEST in hotseat/.env). */
export const modeLabel = (test: boolean | null) =>
  test === null ? "unknown" : test ? "TEST (DeepSeek only)" : "PRODUCT (LLM fallback on)";

export type Interviewer = Exclude<Speaker, "candidate">;

/** Raised by Interview at the moments the inspector cares about. */
export type DebugEvent =
  /** The prep room's settings for this interview: language, role, company, each seat's voice and name. */
  | { type: "interview_settings"; settings: InterviewSettings }
  | { type: "interview_created"; interviewId: number }
  /** How the company name is said (server/pronounce.ts): sent to TTS and given to Realtime for the opening. */
  | ({ type: "company_pronunciation" } & CompanyPronunciation)
  /** Realtime is connected; `voice`: the moderator's voice it speaks in. */
  | { type: "realtime_connected"; voice: string; ms: number }
  /**
   * Realtime refused the moderator's `voice` (ModeratorClient voiceRefusal). `fallback`: the
   * preset used instead; null when the voice only could not be checked just then (the
   * voices API's 429), so the same voice is tried again (`retry`: the how-manyth time).
   */
  | { type: "voice_refused"; voice: string; fallback: string | null; error: string; retry?: number }
  /**
   * The prepare step before the interview is over: everything was ready, or the 30 s cap
   * was reached (`timedOut`) and the rest goes on loading in the background.
   */
  | {
      type: "prepared";
      ms: number;
      timedOut: boolean;
      interview: boolean;
      lines: { done: number; total: number };
      /** AVATAR=true: the on-camera seats' fixed-line videos (total 0 when nobody is on camera). */
      videos: { done: number; total: number };
      realtime: boolean;
      vad: boolean;
    }
  | { type: "moderator_start"; task: string }
  /** AVATAR=true: the TTS panelists' fixed lines as avatar videos are in (or failed). */
  | { type: "avatar_lines_loaded"; count: number; failed: number; ms: number }
  /** A fixed line is said as avatar video rather than audio; `log`: its copy under logs/avatar/ (TEST=true). */
  | { type: "avatar_line"; speaker: Panelist; text: string; log: string | null }
  /** A question's avatar video was requested, and its moments: first bytes, face moving, all in. */
  | { type: "avatar_start"; speaker: Panelist; text: string; emotion: string }
  | { type: "avatar_bytes"; speaker: Panelist; ms: number }
  | { type: "avatar_frame"; speaker: Panelist; ms: number; codecs: string }
  | { type: "avatar_received"; speaker: Panelist; bytes: number; seconds: number; log: string | null }
  /** The video broke off after it had started. */
  | { type: "avatar_broken"; speaker: Panelist; reason: string }
  /** A seat's video failed: its camera goes off and it speaks as audio for the rest of the interview. */
  | { type: "camera_off"; speaker: Panelist; reason: string }
  /** Which TTS panelists are on camera (have a portrait) when the interview starts; `enabled`: AVATAR=true on the server. */
  | { type: "cameras"; on: Panelist[]; enabled: boolean }
  /** The opening was made on the waiting screen (prepare), to play at once when the call starts. */
  /** `complete`: all of it was generated before the call could start (else the rest streams in while it plays). */
  | { type: "opening_prepared"; task: string; ms: number; lost: boolean; complete: boolean }
  | { type: "moderator_transcript"; text: string }
  /**
   * `early`: asked at the candidate's pause, before the answer was known to be finished.
   * `ahead`: written ahead, while the other asker's question (or the Time Buyer) is answered.
   */
  | {
      type: "question_start";
      round: number;
      mode: QuestionMode;
      difficulty: Difficulty;
      speaker: Panelist;
      early?: boolean;
      ahead?: boolean;
    }
  | { type: "question_done"; round: number; ms: number; result: NextQuestion }
  /** The Orchestrator's question did not come in time or failed: the round's backup question is asked. */
  | { type: "question_backup"; round: number; ms: number; reason: string; result: NextQuestion }
  /** TTS failed for a question (HTTP error or no audio within 2 s): Realtime reads it instead. */
  | { type: "tts_failed"; speaker: Panelist; reason: string }
  /** A fixed line (handoff, silence prompt, …) is played from the cache. */
  | { type: "line"; speaker: Interviewer; text: string; emotion?: string }
  /** A fixed line's audio could not be had; the line is skipped. */
  | { type: "line_failed"; speaker: Interviewer; text: string; error: string }
  /** The fixed lines and backup questions loaded at the start. */
  | { type: "lines_loaded"; count: number; failed: number; ms: number }
  | { type: "tts_start"; speaker: Panelist; text: string; emotion: string }
  | { type: "tts_chunk"; bytes: number }
  /** `file`: where the server saved this audio (TEST=true, under logs/tts/). */
  | { type: "tts_received"; file?: string }
  /** Test mode: the simulated candidate started, paused, resumed or finished a script. */
  | { type: "script"; text: string }
  /** A long answer is transcribed in segments: one was sent, or its text came back. */
  | { type: "transcription"; text: string }
  | { type: "script_started"; project: string; length: string; text: string }
  /** Turn detection: how answers end this interview (VAD loaded, or Done answering). */
  | { type: "turn_mode"; manual: boolean; note: string }
  /** The candidate's turn opened and the VAD is listening; `silentMs`: silence already counted. */
  | { type: "turn_listen"; silentMs: number }
  | { type: "turn_speech" }
  /** Silent for `ms` after talking: a "finished?" check starts. */
  | { type: "turn_pause"; ms: number }
  /** The pause had nothing transcribed (a cough, a click); still waiting. */
  | { type: "turn_empty" }
  /** `stale`: the candidate spoke again (or the turn ended) before the verdict came back. */
  | ({ type: "turn_check"; answer: string; stale: boolean } & TurnVerdict)
  | { type: "turn_end"; reason: string }
  /** The candidate asked what the question means; `taken`: over the limit, so the question is marked unanswered. */
  | { type: "clarify"; text: string; count: number; taken: boolean }
  /** What the finished turn was (src/orchestrator/intent.ts). */
  | { type: "intent"; intent: Intent; by?: "deepseek-flash" | "rule"; text: string }
  /** The candidate was silent this long after the question; the asker says `text`. */
  | { type: "silence_prompt"; seconds: number; text: string }
  /** Realtime asks a second Time Buyer: round 1's avatar video was still rendering (askTimeBuyerAgain). */
  | { type: "time_buyer_again"; reason: string }
  /** The question is marked unanswered and the interview moves on. */
  | { type: "unanswered"; reason: string }
  /** The interview length chosen in the lobby (at the start), and when it ran out (between answers). */
  | { type: "interview_length"; minutes: number }
  | { type: "time_up"; minutes: number; elapsedMs: number }
  /** Realtime's connection closed without us closing it; the call pauses. `resume`: how it will pick up. */
  | { type: "connection_lost"; code: number; reason: string; resume: ResumeCase }
  | { type: "reconnect_attempt"; attempt: number }
  | { type: "reconnect_failed"; attempt: number; error: string; retryInMs: number }
  /** `ms`: how long the connection was down. */
  | { type: "reconnected"; attempts: number; ms: number }
  /** Back online: the resume line is said and the interview picks up this way. */
  | { type: "resume"; case: ResumeCase }
  /** Barge-in on ("I'm wearing headphones" ticked) or off for this interview. */
  | { type: "barge_mode"; on: boolean }
  /** `ms` of the candidate's voice while the panel spoke: its volume is lowered. */
  | { type: "barge_duck"; what: FloorKind; ms: number }
  /** The voice ended after `ms` without a real word (`words`: what the recognizer heard): volume restored. */
  | { type: "barge_release"; what: FloorKind; ms: number; words: string[] }
  /** `what` ended with no cut-in; the VAD heard `voicedMs` of voice in all, at most `peak` probability. */
  | { type: "barge_none"; what: FloorKind; voicedMs: number; peak: number }
  /** The candidate cut in: `what` stopped, `ms` after their voice started. */
  | ({ type: "barge_in"; what: FloorKind } & Confirmed)
  /** The question written for the handoff the candidate cut into is dropped. */
  | { type: "question_dropped"; round: number; ms: number }
  /** A line in the log was cut to the part heard. */
  | { type: "turn_cut"; speaker: Speaker; text: string };

export interface TurnCheck extends TurnVerdict {
  t: number;
  answer: string;
  stale: boolean;
}

export type SeatStatus = "idle" | "listening" | "thinking" | "synthesizing" | "speaking";

export interface SeatState {
  status: SeatStatus;
  /** Last emotion tag used (TTS panelists only). */
  emotion: string;
  /** What this seat is saying or last said. */
  line: string;
  /** Extra detail, e.g. "Orchestrator round 2 · fast". */
  note: string;
}

export interface TtsState {
  speaker: Panelist;
  text: string;
  emotion: string;
  startedAt: number;
  /** ms from request to the first audio byte; null until it arrives. */
  firstByteMs: number | null;
  bytes: number;
  /** All audio has arrived from the server. */
  received: boolean;
}

export interface QuestionCall {
  round: number;
  mode: QuestionMode;
  difficulty: Difficulty;
  speaker: Panelist;
  startedAt: number;
  ms: number | null;
  result: NextQuestion | null;
}

export interface LogLine {
  t: number;
  text: string;
  error?: boolean;
}

export interface InspectorState {
  /** One id per interview; each inspector window follows exactly one session. */
  sessionId: string;
  /** Row id in the `interviews` table, once created. */
  interviewId: number | null;
  startedAt: number | null;
  /** Set once the call is over; the inspector freezes its clock here. */
  endedAt: number | null;
  endReason: string;
  /** From the LLM check before Join: TEST or product setting, and who answers the Orchestrator. null = unknown. */
  llm: { test: boolean | null; provider: string | null };
  /** Difficulty picked in the lobby for each round's follow-up (index 0 = round 1). */
  difficulties: Difficulty[];
  /** The prep room's settings (names and voices of the panel), from the interview_settings event. */
  settings: InterviewSettings;
  phase: Phase;
  floor: Speaker | null;
  seats: Record<Interviewer, SeatState>;
  tts: TtsState | null;
  questions: QuestionCall[];
  /** Test mode: scripts the simulated candidate started, in order, to compare with the transcripts. */
  scripts: { project: string; length: string; text: string; startedAt: number }[];
  /** The speaker-labeled log the Orchestrator reads (same rows as the `turns` table). */
  memory: Turn[];
  candidateLive: string;
  /** Turn detection: null mode = not known yet. `quietSince`: the candidate has been silent since then (null while talking or not their turn). */
  turn: { manual: boolean | null; talking: boolean; quietSince: number | null; checks: TurnCheck[] };
  log: LogLine[];
  /** Polled from the interview window ~7 times a second. */
  meters: { panel: number; mic: number; played: number; total: number; complete: boolean };
}

export type ChannelMessage = { type: "hello" } | { type: "state"; state: InspectorState };
