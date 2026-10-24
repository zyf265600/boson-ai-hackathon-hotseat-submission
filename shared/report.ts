// The post-interview report (doc/report-design.zh.md): its rubric, its input
// and its shape. Shared by the server, which builds it (server/report.ts), and
// the browser, which shows it.

import type { Language } from "./languages";
import type { Panelist, Speaker } from "./panel";

/** The five content dimensions, scored 1-4 by the report's judge. */
export type DimensionId = "depth" | "tradeoffs" | "results" | "ownership" | "communication";

export interface Dimension {
  id: DimensionId;
  label: string;
  /** Share of the overall score; the weights add up to 1. */
  weight: number;
  /** Where in the interview it shows most; told to the judge. */
  focus: string;
  /** What a 1, 2, 3 and 4 look like: observable behavior, not adjectives. */
  anchors: [string, string, string, string];
}

/**
 * Behaviorally anchored, on a 1-4 scale so an unsure judge cannot default to a
 * middle score. Each kind of follow-up (ASKERS in shared/panel.ts: the Technical
 * Lead alternates a deep dive and a challenge, the Mentor follows up) mainly
 * probes one dimension; the introduction shows ownership.
 */
export const DIMENSIONS: Dimension[] = [
  {
    id: "depth",
    label: "Technical depth",
    weight: 0.25,
    focus: "The Technical Lead's deep-dive questions, and any answer that explains how something works",
    anchors: [
      "Only names tools or components, with nothing on how they work",
      "Walks through the steps, but cannot say why or how one step works",
      "Explains how one part works and where its data or inputs come from",
      "Explains the mechanism with concrete numbers and its limits or edge cases",
    ],
  },
  {
    id: "tradeoffs",
    label: "Trade-offs and judgment",
    weight: 0.25,
    focus: "The Technical Lead's challenge questions (an assumption, a trade-off or a failure condition)",
    anchors: [
      "Avoids the challenge or denies there is a problem",
      "Admits the problem but offers no way to handle it",
      "Names an alternative or a fix, with a reason",
      "Compares the costs of options and says when they would choose differently",
    ],
  },
  {
    id: "results",
    label: "Results and validation",
    weight: 0.2,
    focus: "The Mentor's follow-ups and the introduction",
    anchors: [
      'No result, or only "it worked well"',
      "A result, but nothing to compare it with",
      "A metric and the baseline it is measured against",
      "Metric and baseline, how they know their change caused it, and its limits",
    ],
  },
  {
    id: "ownership",
    label: "Personal contribution",
    weight: 0.15,
    focus: "The introduction, and any answer about who did what",
    anchors: [
      'Only "we": cannot say what they did themselves',
      "Says what their part was, but only in general terms",
      "Clearly separates their own part from the team's",
      "Their own part, plus a key decision they made and why",
    ],
  },
  {
    id: "communication",
    label: "Clarity and relevance",
    weight: 0.15,
    focus: "Every answer",
    anchors: [
      "Does not answer the question asked",
      "On topic, but long-winded or jumping around",
      "Leads with the answer, then the details; mostly on topic",
      "Clear structure, right length, offers an example without being asked",
    ],
  },
];

/** The overall verdict, from the weighted score. */
export type Band = "ready" | "nearly" | "practice" | "redo";

export const BANDS: { band: Band; label: string; min: number }[] = [
  { band: "ready", label: "Ready to interview", min: 3.5 },
  { band: "nearly", label: "Nearly there", min: 2.75 },
  { band: "practice", label: "Needs practice", min: 2 },
  { band: "redo", label: "Start again", min: 0 },
];

export function bandOf(score: number): Band {
  return BANDS.find((b) => score >= b.min)!.band;
}

/**
 * The weighted average of the scored dimensions, with the weights of the
 * unscored ones shared out among the rest; null if none was scored.
 */
export function overallScore(scores: Partial<Record<DimensionId, number | null>>): number | null {
  let sum = 0;
  let weights = 0;
  for (const d of DIMENSIONS) {
    const s = scores[d.id];
    if (typeof s !== "number") continue;
    sum += s * d.weight;
    weights += d.weight;
  }
  return weights > 0 ? sum / weights : null;
}

// ---------- Input ----------

/** The most résumé text an interview keeps (characters); longer text is cut. */
export const MAX_RESUME_CHARS = 20_000;

/**
 * The structured inspector events the delivery metrics read (src/inspector/types.ts),
 * each stamped with when the hub got it. The hub keeps only these for the report.
 */
export type ReportEvent = { t: number } & (
  | { type: "turn_listen"; silentMs: number }
  | { type: "turn_speech" }
  | { type: "turn_pause"; ms: number }
  | { type: "turn_end"; reason: string }
  | { type: "silence_prompt"; seconds: number }
  | { type: "unanswered" }
  | { type: "intent"; intent: string }
  | { type: "barge_in" }
  | { type: "connection_lost" }
);

export const REPORT_EVENTS = new Set<string>([
  "turn_listen",
  "turn_speech",
  "turn_pause",
  "turn_end",
  "silence_prompt",
  "unanswered",
  "intent",
  "barge_in",
  "connection_lost",
]);

/** One Orchestrator call, as the inspector records it (InspectorState.questions). */
export interface ReportQuestion {
  round: number;
  difficulty: string;
  speaker: Speaker;
  result: { question: string; assessment?: string; reason?: string } | null;
}

export interface ReportInput {
  /** The speaker-labeled conversation, in order (the turns table). */
  transcript: { speaker: Speaker; text: string }[];
  questions: ReportQuestion[];
  /** The resume as plain text; only checked against, never used to ask questions. */
  resume?: string;
  /** The interview's language: the report is written in it. English if missing. */
  language?: Language;
  /** Missing for sessions recorded before the hub kept them: no delivery metrics then. */
  events?: ReportEvent[];
  /** How long the panel had the floor, measured in the browser (src/inspector/hub.ts). */
  panelMs?: number;
}

// ---------- Output ----------

/** A short verbatim quote of the candidate, checked against the transcript. */
export interface Evidence {
  quote: string;
  note: string;
}

export interface DimensionScore {
  id: DimensionId;
  /** 1-4, or null when not scored. */
  score: number | null;
  /**
   * "not_probed": nothing in the interview gave a chance to show it.
   * "no_evidence": the judge scored it, but none of its quotes was found in the transcript.
   */
  status: "scored" | "not_probed" | "no_evidence";
  evidence: Evidence[];
  comment: string;
  /** The comment in under 7 words, for the skills list. */
  headline: string;
}

/** The opening question (round 0) or one of the follow-ups. */
export interface RoundCard {
  round: number;
  speaker: Speaker;
  difficulty: string | null;
  question: string;
  /** Everything the candidate said before the next question. */
  answer: string;
  unanswered: boolean;
  summary: string;
  wentWell: string;
  improve: string;
  /** 3-4 points a stronger answer would cover. */
  betterOutline: string[];
}

export type ClaimStatus = "verified" | "shallow" | "mismatch" | "not_discussed";

export interface ClaimCheck {
  claim: string;
  status: ClaimStatus;
  /** What they said about it, when they did. */
  quote?: string;
  /** For a mismatch: "resume: ... / interview: ...". */
  note: string;
}

/**
 * STAR, checked on the opening answer only. Shown on the report, never
 * scored: the action and the result already count in "ownership" and
 * "results", so scoring them again would count them twice.
 */
export type StarPart = "situation" | "task" | "action" | "result";

export const STAR_PARTS: { part: StarPart; letter: string; label: string; meaning: string }[] = [
  {
    part: "situation",
    letter: "S",
    label: "Situation",
    meaning: "the context and the problem: what was wrong or needed, and for whom",
  },
  { part: "task", letter: "T", label: "Task", meaning: "their own goal or responsibility in it" },
  { part: "action", letter: "A", label: "Action", meaning: "what they did themselves" },
  { part: "result", letter: "R", label: "Result", meaning: "the outcome, ideally measured" },
];

/** "no_evidence": the judge said covered or vague, but its quote is not in the opening answer. */
export type StarStatus = "covered" | "vague" | "missing" | "no_evidence";

export interface StarCheck {
  part: StarPart;
  status: StarStatus;
  /** Their words from the opening, checked word for word; none when missing. */
  quote?: string;
  /** Under 15 words. */
  note: string;
}

/** One thing to practice before the next interview, tied to the project and the resume line behind it. */
export interface PracticeDrill {
  /** An instruction under 8 words. */
  title: string;
  /** Null for the drill the report adds when the opening misses the situation or the task. */
  dimension: DimensionId | null;
  /** The STAR parts the drill fixes, for that added drill. */
  star?: StarPart[];
  /** The round it comes from, when it comes from one. */
  round: number | null;
  /** The resume line it rests on, word for word; only when a resume was given and the line is in it. */
  resumeLine?: string;
  /** What happened in the interview, in one sentence. */
  issue: string;
  /** Their words that show it, when found in the transcript; otherwise empty. */
  quote: string;
  /** 2-3 facts to have ready; [brackets] mark what only the candidate can fill in. */
  haveReady: string[];
  /** A stronger answer, with [placeholders] for the facts they did not state. */
  trySaying: string;
  /** The follow-up a panelist would likely ask next time, to rehearse. */
  question: { speaker: Panelist | "moderator"; text: string };
}

/** Computed in code from the events and the transcript (shared/reportMetrics.ts), never by the judge. */
export interface DeliveryMetrics {
  answers: number;
  /** Median time from the turn opening to the candidate's first word. */
  medianLatencyMs: number | null;
  speakingMs: number;
  words: number;
  /** Words per minute of speaking; null when there was too little speech to tell. */
  wpm: number | null;
  /** um, uh, erm, "you know", "I mean": only meaningful if the transcriber keeps them. */
  fillers: number;
  fillersPerMinute: number | null;
  silencePrompts: number;
  unanswered: number;
  repeats: number;
  clarifications: number;
  bargeIns: number;
  /** Answers cut by a lost connection: not held against the candidate. */
  connectionLost: number;
  /** How long the panel had the floor (browser-measured); null for sessions recorded before it was kept. */
  panelMs: number | null;
}

export interface Report {
  overall: { score: number | null; band: Band | null; summary: string };
  /** A short name for the project the candidate talked about, e.g. "Canary functions in RAG poisoning". */
  project: string;
  dimensions: DimensionScore[];
  /** The judge's three things most worth practicing, most important first, then the opening's STAR drill if one is needed. */
  practice: PracticeDrill[];
  /** STAR coverage of the opening answer, shown only; null when the opening went unanswered. */
  star: StarCheck[] | null;
  rounds: RoundCard[];
  /** Only when a resume was given. */
  claims: ClaimCheck[] | null;
  /** Projects and jobs on the resume that the interview did not cover, to pick next time; only with a resume. */
  otherProjects: string[] | null;
  /** Only when the session recorded the events. */
  delivery: DeliveryMetrics | null;
  /**
   * What each interviewer says to the candidate (plan P1); `text` is one or two spoken
   * sentences (played on the report in the seat's voice), `headline` its gist in under 7 words.
   */
  debrief: { speaker: Panelist | "moderator"; text: string; headline: string }[];
  /** e.g. "deepseek (deepseek-flash)". */
  model: string;
  createdAt: string;
}
