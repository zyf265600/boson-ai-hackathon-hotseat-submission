// Turn detection: has the candidate finished answering, or only paused mid-thought?
// Shared by the server (which asks deepseek-flash) and the browser (which falls
// back to the rule below when the server does not answer in time).
import { pack } from "../corpus/lang";
import { LANGUAGES, plainText, type Language } from "./languages";

/**
 * What the turn is, judged by deepseek-flash alongside "finished?": an answer (or an
 * addition to one), only a backchannel, or a request to the panel. The browser's rules
 * (src/orchestrator/intent.ts) decide only when there is no such judgment (the call
 * failed, or the turn ended without a pause check), and for replies to a silence prompt.
 */
export const TURN_INTENTS = ["answer", "noise", "repeat", "clarify", "skip", "wait", "end"] as const;
export type TurnIntent = (typeof TURN_INTENTS)[number];

export interface TurnVerdict {
  finished: boolean;
  /** Only from deepseek-flash. */
  intent?: TurnIntent;
  /** "deepseek": deepseek-flash decided; "rule": the call failed or timed out, endsMidThought decided. */
  source: "deepseek" | "rule";
  ms: number;
  /** Why the rule was used, when it was. */
  reason?: string;
}

/**
 * The fallback rule: the transcript ends on a connective or a filler ("and", "um";
 * "所以", "えーと"), or on "let me think", in the interview language
 * (corpus/lang/<code>.ts `rules.trailing` and `rules.thinking`).
 */
export function endsMidThought(text: string, lang: Language = "en"): boolean {
  const { trailing, thinking } = pack(lang).rules;
  const plain = plainText(text);
  const ends = LANGUAGES[lang].countChars
    ? trailing.some((w) => plain.endsWith(w))
    : trailing.includes(plain.split(" ").at(-1) ?? "");
  return ends || thinking.test(plain);
}
