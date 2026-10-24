// The Orchestrator's request mode and reply, shared by the server
// (server/questions.ts) and the browser (src/api.ts).

import type { Panelist } from "./panel";

/** "deep" thinks before answering (slow); "fast" answers directly. */
export type QuestionMode = "deep" | "fast";

/** The Orchestrator's judgment of the candidate's last answer (plan section 7). */
export type Assessment = "solid" | "vague" | "inconsistent";

export const ASSESSMENTS: Assessment[] = ["solid", "vague", "inconsistent"];

/**
 * Each asker's TTS emotion tag, fixed (2026-10-22). The question and the line
 * before it (handoff, move-on, after the introduction) use it. Chosen as the
 * pairs least likely to come out in another speaker's voice: oliver +
 * contemplation 1 of 152 takes, nora + contentment 0 of 25; confusion and
 * determination drifted about half the time, so do not use them (a pitch check
 * that re-synthesized drifted takes was removed with them). Until then
 * the tag followed the judgment of the answer, and the handoff waited for it.
 */
export const TONE: Record<Panelist, string> = {
  technical_lead: "contemplation",
  mentor: "contentment",
};

/** One follow-up question from the Orchestrator. */
export interface NextQuestion {
  speaker: Panelist;
  question: string;
  emotion: string;
  /** How the last answer was judged; it shapes the question, not its tone (TONE). Missing on backup questions. */
  assessment?: Assessment;
  /** One sentence on why, for the inspector and test logs only; never spoken. */
  reason?: string;
  /** The angle the Orchestrator was given, e.g. "how they built one specific part" (shown in the inspector and test logs). */
  angle?: string;
  /** Who answered, e.g. "deepseek (deepseek-v4-pro)"; added by the next-question route. */
  provider?: string;
}
