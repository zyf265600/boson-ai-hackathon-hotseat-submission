// Everything an interview says, asks for or listens for, in one language. Each
// language is one file in this folder (en.ts, zh.ts, …), so all of it switches
// together; shared/languages.ts lists the languages.
import type { Difficulty, Panelist, Speaker } from "../../shared/panel";

export type Seat = Exclude<Speaker, "candidate">;

/** What the candidate's last turn was, for the moderator's handoff. */
export type HandoffAfter = "introduction" | "addition" | "unanswered";

export interface LanguagePack {
  /** Role names, as spoken and as written in prompts and transcripts. */
  roles: Record<Speaker, string>;

  // ---- Fixed lines spoken with TTS (src/interview.ts loads their audio at the start) ----

  /** Said by whoever asked the current question: after 8, 15, 25 s of silence (src/interview.ts SILENCE_STEPS), and at 180 s of answering. */
  askerLines: Record<Seat, { silence: { 8: string; 15: string; 25: string }; wrapUp: string }>;
  /** The moderator seat's closing: time up (the usual end), or the early end if Realtime says nothing. */
  closing: { timeUp: string; endEarly: string };
  /** The opening question on its own, replayed when the candidate asks to hear it again. */
  openingQuestion: string;
  /** Asked when the Orchestrator gives no question in time: three per asker and difficulty, used in turn. */
  backupQuestions: Record<Panelist, Record<Difficulty, string[]>>;

  // ---- Higgs Realtime, the moderator seat (corpus/realtime.ts) ----

  /** The session instructions, sent again in front of every task; says to speak only this language. */
  moderatorPrompt: string;
  /**
   * The opening task: greet, introduce the panel, say what the practice is for (`role`,
   * and `company` if not ""), ask for one project. `say`: how the company name should
   * sound (server/pronounce.ts); when it differs from `company`, Realtime is told to
   * pronounce the name that way. `names`: this interview's names (the prep room's), so the
   * moderator says hers and the panel's; told only "introduce the panel", Realtime said
   * "I'm the moderator, joined by our Technical Lead and Mentor" with no names (2026-10-23).
   */
  opening(role: string, company: string, say: string, names: PanelNames): string;
  /**
   * The candidate spoke during or right after the opening (cut in, or asked about it):
   * reply to what they said, then ask briefly for a project. `role`, `company` and `say`
   * are given as facts, and Realtime is told not to repeat its earlier words: quoted
   * the whole opening as `heard`, it read it all again, and cut in before the company it
   * could not name it (2026-10-23).
   */
  openingReply(said: string, heard: string, names: PanelNames, role: string, company: string, say: string): string;
  /** Read aloud word for word. `next`: the next asker's name. */
  handoff(after: HandoffAfter, next: string): string;
  /**
   * After the project introduction (`said`), Realtime thanks the candidate and asks one light
   * background question, while round 1's question is written (src/interview.ts askTimeBuyer).
   * `next`: the Technical Lead's name in this interview, who asks the deep questions next.
   */
  timeBuyer(said: string, next: string): string;
  /**
   * A second Time Buyer, only when round 1's avatar video is still being rendered as the
   * first one's answer ends (src/interview.ts askTimeBuyerAgain): `said` the introduction,
   * `asked` Realtime's first background question, `answer` the candidate's answer to it.
   */
  timeBuyerAgain(said: string, asked: string, answer: string, next: string): string;
  sayAgain: string;
  missedPart: string;
  resume: string;
  answerAgain: string;
  endEarly(said: string): string;
  readAloud(line: string): string;
  substituteQuestion(role: string, question: string): string;
  /** `asker`: the role that asked, or null when the moderator did. */
  clarify(asker: string | null, question: string, said: string, lengthMin: number): string;

  // ---- The Orchestrator writing the next question (server/questions.ts) ----

  questions: {
    system: string;
    persona: string;
    difficulty: Record<Difficulty, string>;
    /**
     * One is picked at random per question. The first BACKGROUND_ANGLES easy ones (their own
     * part, their role on the team) are left out after the Time Buyer (server/questions.ts).
     */
    angles: Record<Difficulty, string[]>;
    /** Each asker's goals, one per question it asks, in turn; `easyGoal` when it is set to easy. */
    goals: Record<Panelist, { goal: string; easyGoal: string }[]>;
    followUp(round: number, asker: string, persona: string): string;
    /**
     * The role (and company, "" if none) the candidate practises for, from the prep room:
     * context for the question, which must still follow from what they just said.
     */
    practising(role: string, company: string): string;
    freshTopic: string;
    goal(goal: string): string;
    difficultyLine(guide: string): string;
    angle(angle: string): string;
    priority: string;
    unanswered(question: string): string;
    /**
     * Written ahead (src/interview.ts askAhead): the other asker's `question` is being answered
     * now, and the new question builds on the answer before it. `asker`: that asker's role.
     */
    pending(asker: string, question: string): string;
    /**
     * Realtime's Time Buyer (src/interview.ts askTimeBuyer): `asked`, its words once said, else
     * "" while it is being asked (round 1 is written meanwhile): then its possible topics.
     */
    background(asked: string): string;
    earlierSkipped(questions: string[]): string;
    alreadyAsked: string;
    transcript: string;
    repeated(draft: string, earlier: string): string;
  };

  // ---- deepseek-flash judging a pause (server/turn.ts) ----

  turn: {
    system: string;
    question: string;
    cutInto: string;
    prompt: string;
    candidate: string;
  };

  // ---- Rules: the fallback when there is no LLM verdict, and barge-in's backchannel test ----

  rules: {
    end: RegExp[];
    /** Said while listening, not to take the floor: "mm-hm", "okay". Compared after plainText. */
    backchannel: string[];
    /**
     * A whole tail of politeness that does not change what was said before it ("Thank you.",
     * "okay"), matched against plainText of the words added after the last pause: then the
     * model's intent for the words before still holds (src/interview.ts judgedIntent).
     */
    courtesy: RegExp;
    repeat: RegExp[];
    clarify: RegExp[];
    dontKnow: RegExp[];
    skip: RegExp[];
    /** A reply to "Do you need more time?" / "Would you like to move on?", after plainText. */
    yes: RegExp;
    no: RegExp;
    holdOn: RegExp;
    /** One filler unit ("um"), not counted in a short "I don't know". */
    filler: RegExp;
    /** A long turn that opens by asking which reading of the question is meant. */
    longClarify: RegExp;
    /** Last words (after plainText) that mean the sentence is not over. */
    trailing: string[];
    /** The sentence ends on "let me think" and the like. */
    thinking: RegExp;
    /** A second ask joined to the first (", and how …"); cut there. */
    secondAsk: RegExp;
    /** Words too common to tell two questions apart (repeat check). */
    stopWords: string[];
  };
}

/** The three seats' names in this interview. */
export type PanelNames = Record<Seat, string>;
