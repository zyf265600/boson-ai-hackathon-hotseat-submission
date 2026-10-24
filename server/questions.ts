import { roundPlan, type Difficulty, type Panelist } from "../shared/panel";
import { LANGUAGES, QUESTION_MARK, plainText, type Language } from "../shared/languages";
import { pack } from "../corpus/lang";
import { ASSESSMENTS, TONE, type Assessment, type QuestionMode, type NextQuestion } from "../shared/questions";
import type { Turn } from "./db";
import { chatJson } from "./llm";

/** Emotion tags Higgs TTS 3 accepts (docs.boson.ai/models/higgs-tts/tags). */
export const EMOTIONS = [
  "affection",
  "amusement",
  "anger",
  "arousal",
  "awe",
  "bitterness",
  "confusion",
  "contemplation",
  "contentment",
  "determination",
  "disgust",
  "elation",
  "enthusiasm",
  "fear",
  "helplessness",
  "longing",
  "pride",
  "relief",
  "sadness",
  "shame",
  "surprise",
] as const;

// The prompt is in the interview language (corpus/lang/<code>.ts `questions`); the
// English pack holds the original wording. Notes on it:
// - Both askers question the candidate the same way; only their voices and tones differ
//   (2026-10-22). The Mentor used to be "warm, never challenges, praise first": it then
//   missed contradictions and praised the statement that conflicted.
// - The follow-up focus areas come from MockBQ's interview prompt (oneTermInTerms.txt).
// - The whole panel stays friendly: even "hard" is a fair question, not a trap.
// - One angle is picked at random per question, so the same answer does not get the
//   same question every time. Worded to fit any technical field.
// - "vague" asks for a missing specific only once: with the askers taking turns, the
//   next asker asked again for what the last one had just asked for (2026-10-23).

/**
 * A question's content: its words without the common ones (the pack's stopWords), or
 * for Chinese and Japanese, which have no spaces, its pairs of neighbouring characters.
 */
function contentWords(question: string, lang: Language): Set<string> {
  const stop = new Set(pack(lang).rules.stopWords);
  const plain = plainText(question.replace(/\[interrupted\]|…/g, " "));
  if (LANGUAGES[lang].countChars) {
    const chars = [...plain.replace(/ /g, "")].filter((c) => !stop.has(c));
    return new Set(chars.slice(1).map((c, i) => chars[i] + c));
  }
  return new Set(plain.split(" ").filter((w) => w.length > 2 && !stop.has(w)));
}

/**
 * The earlier question that `question` repeats, if any: at least 70% of the two
 * questions' content words shared. Interview #169 (2026-10-23) asked "What exact
 * fields from a ticket go into the priority queue, like timestamp and price?" word
 * for word two rounds after the candidate declined it. A reworded follow-up on a
 * vague answer ("What data goes into ...?" then "What specific data from the
 * tickets goes into ...?", 67%) still passes.
 */
export function repeatOf(question: string, earlier: string[], lang: Language = "en"): string | undefined {
  const words = contentWords(question, lang);
  return earlier.find((e) => {
    const other = contentWords(e, lang);
    const shared = [...words].filter((w) => other.has(w)).length;
    const union = new Set([...words, ...other]).size;
    return union > 0 && shared / union >= 0.7;
  });
}

/** The first easy angles in every pack: their own part, and their role on the team. */
const BACKGROUND_ANGLES = 2;

function formatTranscript(turns: Turn[], lang: Language): string {
  const { roles } = pack(lang);
  return turns.map((t) => `[${roles[t.speaker]}] ${t.text}`).join("\n");
}

/** Ask the Orchestrator for the question of round `round` (1-based). */
export async function nextQuestion(
  turns: Turn[],
  round: number,
  mode: QuestionMode,
  difficulty: Difficulty = "medium",
  /** The question the candidate could not answer (silence, "I don't know", or asked to skip), if so. */
  unanswered?: string,
  /** Every question the candidate could not answer so far, `unanswered` included. */
  skipped: string[] = [],
  lang: Language = "en",
  /** The role (and company, may be empty) the candidate practises for, from the prep room. */
  target?: { role: string; company: string },
  /**
   * Written ahead: the other asker's question, being answered while this one is written. The
   * question then builds on the answer before it (to this asker's own last question).
   */
  pending?: { speaker: Panelist; question: string },
  /**
   * The moderator's Time Buyer question: its words once said, "" while it is being asked;
   * undefined when there was none. Never asked again, like the panel's own questions.
   */
  timeBuyer?: string,
): Promise<NextQuestion> {
  const p = pack(lang).questions;
  const { speaker, turn } = roundPlan(round);
  const goals = p.goals[speaker];
  const { goal, easyGoal } = goals[turn % goals.length];
  // The askers' questions so far, each once (a question cut off and then repeated in full is in the transcript twice),
  // and the moderator's Time Buyer.
  const asked = [
    ...new Set(
      turns
        .filter((t) => t.speaker === "technical_lead" || t.speaker === "mentor")
        .map((t) => t.text.replace(/\s*\[interrupted\]\s*$/, "").trim())
        .filter(Boolean),
    ),
    ...(timeBuyer ? [timeBuyer] : []),
  ];
  const earlierSkipped = skipped.filter((q) => q !== unanswered);
  // The Time Buyer asks about the background (the team, their own part), so the easy angles on
  // it are left out: round 1 still asked "how many people were on the team?" right after it,
  // on the "who they worked with" angle, though told not to (2026-10-23).
  const angles =
    timeBuyer !== undefined && difficulty === "easy" ? p.angles.easy.slice(BACKGROUND_ANGLES) : p.angles[difficulty];
  const angle = angles[Math.floor(Math.random() * angles.length)];
  const userPrompt = [
    p.followUp(round, pack(lang).roles[speaker], p.persona),
    // Context only: the question is still built on what the candidate just said.
    ...(target?.role ? [p.practising(target.role, target.company)] : []),
    // Many follow-ups now, so the same topic would come back without this.
    p.freshTopic,
    p.goal(difficulty === "easy" ? easyGoal : goal),
    p.difficultyLine(p.difficulty[difficulty]),
    p.angle(angle),
    p.priority,
    ...(unanswered ? [p.unanswered(unanswered)] : []),
    ...(pending ? [p.pending(pack(lang).roles[pending.speaker], pending.question)] : []),
    // Round 1 was written while it was asked, and asked the same "what was your own part" (2026-10-23).
    ...(timeBuyer !== undefined ? [p.background(timeBuyer)] : []),
    // Only the last one was named until 2026-10-23, and a question declined two rounds earlier came back word for word.
    ...(earlierSkipped.length ? [p.earlierSkipped(earlierSkipped)] : []),
    ...(asked.length ? [p.alreadyAsked, ...asked.map((q) => `- ${q}`)] : []),
    "",
    p.transcript,
    formatTranscript(turns, lang),
  ].join("\n");

  const draft = async (note: string) => {
    // In thinking mode the budget also covers the reasoning tokens.
    const reply = await chatJson<NextQuestion>(p.system, userPrompt + note, mode, mode === "deep" ? 8000 : 400);
    // JSON mode guarantees valid JSON, not the fields: `question` may be missing or not text.
    if (typeof reply.question !== "string" || !reply.question) throw new Error("the Orchestrator returned no question");
    return { ...reply, question: reply.question };
  };
  // A repeat is asked for once more with the repeated question named; a second repeat fails the
  // call, and the browser asks the round's backup question instead.
  let parsed = await draft("");
  const repeated = repeatOf(parsed.question, asked, lang);
  if (repeated) {
    console.warn(`Orchestrator repeated "${repeated}"; asking again: ${parsed.question}`);
    parsed = await draft(`\n\n${p.repeated(parsed.question, repeated)}`);
    if (repeatOf(parsed.question, asked, lang)) {
      throw new Error(`the Orchestrator repeated an earlier question twice: ${parsed.question}`);
    }
  }
  // One spoken question only: if the model still asked two, keep the first.
  const marks = parsed.question.match(QUESTION_MARK)?.length ?? 0;
  if (marks > 1) {
    console.warn(`Orchestrator asked ${marks} questions; kept the first: ${parsed.question}`);
    parsed.question = parsed.question.slice(0, parsed.question.search(QUESTION_MARK) + 1);
  }
  // ", and how ...", ", and what ...": a second ask joined to the first.
  const second = parsed.question.search(pack(lang).rules.secondAsk);
  if (second > 0) {
    console.warn(`Orchestrator joined two asks; kept the first: ${parsed.question}`);
    parsed.question = `${parsed.question.slice(0, second).trimEnd()}${LANGUAGES[lang].countChars ? "？" : "?"}`;
  }

  // Not judged: the project introduction (nothing earlier to compare it with) and an
  // unanswered question (nothing was said).
  const judged = round > 1 && !unanswered;
  const assessment: Assessment =
    judged && ASSESSMENTS.includes(parsed.assessment as Assessment) ? parsed.assessment! : "solid";

  return {
    speaker,
    question: parsed.question,
    emotion: TONE[speaker],
    ...(judged ? { assessment, reason: typeof parsed.reason === "string" ? parsed.reason : undefined } : {}),
    angle,
  };
}
