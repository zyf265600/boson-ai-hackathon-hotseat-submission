// What Higgs Realtime (the moderator seat) is asked to say. Each string goes out as
// response.instructions after the pack's moderatorPrompt. Every reply to the candidate is
// Realtime's (2026-10-23): the opening and its reply to a cut-in, the Time Buyer question
// after the introduction, the handoff to
// the next asker (also after an addition or an unanswered question), "say that
// again" when nothing could be transcribed, an answer about the question, an early
// end, and the resume line after a lost connection. It also reads a question when
// TTS fails. Lines said on a timer or at a fixed point (silence prompts, the
// 180-second wrap-up, the closing) stay TTS (panelist-lines.ts). The words are in
// the interview's language (corpus/lang/); the English pack keeps the original
// wording and the notes below explain it.
import type { Panelist, Speaker } from "../shared/panel";
import type { Language } from "../shared/languages";
import { pack, type HandoffAfter, type PanelNames } from "./lang";

export type { HandoffAfter } from "./lang";

/**
 * The opening task: greet, introduce herself and the panel by name (`names`, this interview's),
 * say this is practice for the `role` (at `company`, if any), ask for one project. `say`: how the company name should sound
 * (InterviewSettings.companySay); when it differs from the name, Realtime is told to say
 * the name that way (an instruction, not words to read out).
 */
export const openingTask = (lang: Language, names: PanelNames, role: string, company: string, say = company) =>
  pack(lang).opening(role, company, say, names);

/**
 * The candidate cut into the opening and said something (any length): Realtime
 * answers that, then asks for the project, more briefly than openingTask. Instructions
 * do not see the conversation, so the words heard before the cut (`heard`) and
 * the candidate's are quoted. Told only "do not introduce the panel again",
 * Realtime answered a thank-you with "Thank you for that kind introduction" and
 * never named the panel, cut at "I'm joined by our" (2026-10-22).
 */
export const openingReply = (
  lang: Language,
  said: string,
  heard: string,
  names: PanelNames,
  role: string,
  company: string,
  say = company,
) => pack(lang).openingReply(said, heard, names, role, company, say);

/**
 * The moderator hands the floor to the next asker, while the Orchestrator writes
 * that asker's question (the line covers the wait, as the Time Buyer was meant
 * to). The asker then only reads the question. Only after the introduction, an
 * addition or an unanswered question: otherwise the askers just take turns.
 * A fixed line, read with readAloud: worded by Realtime it once came out as a new
 * opening, "Hi, thanks for joining us. To start, could you give us an overview of
 * the project you're going to discuss?", and another time as praise of a one-line
 * answer, "Thanks, that's a great overview." (2026-10-23).
 * `nextName`: the next asker's name in this interview (the prep room's, peopleFor).
 */
export const handoffLine = (lang: Language, after: HandoffAfter, nextName: string) =>
  pack(lang).handoff(after, nextName);

/**
 * The Time Buyer (10/23 evening): after the project introduction (`said`, quoted since
 * instructions do not see the conversation), Realtime thanks the candidate and asks one
 * light background question, worded by itself so it fits what was said. While it is answered
 * the Technical Lead's first question is written and rendered (src/interview.ts askTimeBuyer).
 * `nextName`: the Technical Lead's name in this interview.
 */
export const timeBuyerTask = (lang: Language, said: string, nextName: string) => pack(lang).timeBuyer(said, nextName);

/** Nothing of the candidate's turn could be transcribed (neither Whisper nor Higgs); read with readAloud. */
export const sayAgainLine = (lang: Language) => pack(lang).sayAgain;
/** Part of a long answer could not be transcribed; the rest is kept. Read with readAloud. */
export const missedPartLine = (lang: Language) => pack(lang).missedPart;

/** The candidate asked to stop the interview; then it closes. The TTS endEarly line if Realtime says nothing. */
export const endEarly = (lang: Language, said: string) => pack(lang).endEarly(said);

/**
 * Instructions that make Realtime say `line` and nothing else. Without the
 * "already in progress" part, a handoff line came out as a greeting 3 times in 3;
 * with it, 30 of 30 lines came out word for word (2026-10-22). Still a language
 * model, so it is used only for lines that must be exact: the handoff, a question
 * TTS could not speak (substituteQuestion), "say that again" and the resume line.
 */
export const readAloud = (lang: Language, line: string) => pack(lang).readAloud(line);

/**
 * Realtime says this (through readAloud) once a lost connection is back, before
 * the interview goes on (src/interview.ts, resume()); `answerAgain` adds a request
 * to answer again, when the connection was lost during the candidate's answer.
 */
export const resumeLine = (lang: Language, answerAgain: boolean) =>
  answerAgain ? `${pack(lang).resume} ${pack(lang).answerAgain}` : pack(lang).resume;

/** Realtime reads a panelist's question (through readAloud) once TTS has failed. */
export const substituteQuestion = (lang: Language, panelist: Panelist, question: string) =>
  pack(lang).substituteQuestion(pack(lang).roles[panelist], question);

/** The question the candidate is answering. */
export interface Asked {
  speaker: Exclude<Speaker, "candidate">;
  question: string;
}

/**
 * The candidate asked about the question instead of answering. Realtime answers
 * from its own knowledge; no extra context such as word meanings is prepared
 * (decided 2026-10-22). A reply driven by instructions does not see the
 * conversation, so the question and the candidate's words are written in.
 * Tested 2026-10-22 (16 replies, first audio 0.4–0.8 s): word explanations were
 * right; "A or B?" sometimes only restated the question. The facts about the
 * interview itself are given because, asked "how long is this interview?",
 * Realtime once made up "about 30 minutes" (2026-10-23).
 */
export function clarify(lang: Language, asked: Asked, said: string, lengthMin: number): string {
  const p = pack(lang);
  return p.clarify(asked.speaker === "moderator" ? null : p.roles[asked.speaker], asked.question, said, lengthMin);
}
