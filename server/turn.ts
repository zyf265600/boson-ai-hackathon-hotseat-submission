import { TURN_INTENTS, endsMidThought, type TurnVerdict } from "../shared/turn";
import type { Language } from "../shared/languages";
import { pack } from "../corpus/lang";
import { quickJson } from "./llm";

// Tested on 2026-10-22: 30 of 30 transcripts judged right; median ~0.9–1.0 s for the
// full reply. Without the "short answers are often complete" sentence, deepseek-flash
// called 9 of 16 short complete answers unfinished.
// The intent was added after the browser's rules missed "Hold on. Can you repeat your
// question?", said cutting into a handoff line: phrasings of a request have no end.
// The instructions are the interview language's (corpus/lang/<code>.ts `turn`); the
// English pack holds the original wording.

/** Past this the browser is already waiting too long; the rule answers instead. */
const TIMEOUT_MS = 1500;

/** Has the candidate finished, and is the turn an answer or a request? Never throws: on any failure the rule in shared/turn.ts decides. */
export async function judgeTurn(
  question: string,
  answer: string,
  cutInto = "",
  prompt = "",
  lang: Language = "en",
): Promise<TurnVerdict> {
  const t = pack(lang).turn;
  const started = performance.now();
  const ms = () => Math.round(performance.now() - started);
  try {
    const reply = await quickJson<{ finished?: unknown; intent?: unknown }>(
      t.system,
      `${t.question}${question}\n` +
        (cutInto ? `${t.cutInto}${cutInto}\n` : "") +
        (prompt ? `${t.prompt}${prompt}\n` : "") +
        `${t.candidate}${answer}`,
      TIMEOUT_MS,
    );
    if (typeof reply.finished !== "boolean") throw new Error("no finished field in the reply");
    const intent = TURN_INTENTS.find((i) => i === reply.intent);
    return { finished: reply.finished, ...(intent ? { intent } : {}), source: "deepseek", ms: ms() };
  } catch (err) {
    return { finished: !endsMidThought(answer, lang), source: "rule", ms: ms(), reason: (err as Error).message };
  }
}
