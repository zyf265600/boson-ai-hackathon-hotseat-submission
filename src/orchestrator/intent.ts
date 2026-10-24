// What the candidate's finished turn was: an answer, or something else the panel
// has to handle first (doc/orchestrator.zh.md section 6). Rules only, no LLM call:
// lowercase the transcript and take the first match, top to bottom. The word lists
// are the interview language's (corpus/lang/<code>.ts `rules`).
import { pack } from "../../corpus/lang";
import { joinUnits, plainText, units, type Language } from "../../shared/languages";

export type Intent =
  /** Asked to stop the interview. */
  | "end"
  /** Nothing but a backchannel ("mm", "okay") or a cough: as if nothing happened. */
  | "noise"
  /** Nothing was transcribed at all. */
  | "empty"
  /** Asked to hear the question again. */
  | "repeat"
  /** Asked what the question or a word in it means. */
  | "clarify"
  /** Does not know, or wants to skip: the question is marked unanswered. */
  | "skip"
  /** Said yes or no to "Do you need more time?" / "Would you like to move on?" and wants to keep thinking. */
  | "wait"
  | "answer";

/** The silence prompt said last, in seconds; 0 when none is pending. */
export type LastPrompt = 0 | 8 | 15 | 25;

/**
 * Longer than this it is an answer, even if "what do you mean" appears in it, unless it opens by
 * asking (longClarify). Counted in words, or characters for Chinese and Japanese (shared/languages.ts).
 */
const MAX_UNITS = 20;
/** "I don't know" in a longer turn is usually the start of an answer, so it needs a short turn. */
const MAX_SKIP_UNITS = 8;

/** Pieces of `text` between spaces and punctuation, after plainText: "mm-hm, okay" is "mm", "hm", "okay". */
const pieces = (text: string) => plainText(text).split(" ").filter(Boolean);

/** Nothing but backchannel words ("mm-hm", "okay"; "嗯", "好的"), in the interview language. */
export function onlyBackchannel(text: string, lang: Language): boolean {
  const list = new Set(pack(lang).rules.backchannel);
  const parts = pieces(text);
  return parts.length > 0 && parts.every((w) => list.has(w));
}

export function classify(text: string, lastPrompt: LastPrompt = 0, lang: Language = "en"): Intent {
  const r = pack(lang).rules;
  const t = text.toLowerCase().trim();
  const words = units(t, lang);
  // No letter or digit at all: Whisper writes "-" or "- - -" for noise (2026-10-23).
  if (words.length === 0 || !/[\p{L}\p{N}]/u.test(t)) return "empty";

  // Right after "Do you need more time?" (15 s) or "Would you like to move on?" (25 s),
  // a short yes or no answers that question.
  if ((lastPrompt === 15 || lastPrompt === 25) && words.length <= 8 && r.holdOn.test(t)) return "wait";
  if ((lastPrompt === 15 || lastPrompt === 25) && words.length <= 4) {
    const bare = plainText(t);
    if (r.yes.test(bare)) return lastPrompt === 25 ? "skip" : "wait";
    if (r.no.test(bare)) return "wait";
  }

  if (words.length > MAX_UNITS) {
    return r.longClarify.test(joinUnits(words.slice(0, 8), lang)) ? "clarify" : "answer";
  }
  if (r.end.some((re) => re.test(t))) return "end";
  if (pieces(t).length <= 3 && onlyBackchannel(t, lang)) return "noise";
  if (r.repeat.some((re) => re.test(t))) return "repeat";
  if (r.clarify.some((re) => re.test(t))) return "clarify";
  if (r.skip.some((re) => re.test(t))) return "skip";
  const said = units(
    pieces(t)
      .filter((w) => !r.filler.test(w))
      .join(" "),
    lang,
  );
  if (said.length <= MAX_SKIP_UNITS && r.dontKnow.some((re) => re.test(t))) return "skip";
  return "answer";
}
