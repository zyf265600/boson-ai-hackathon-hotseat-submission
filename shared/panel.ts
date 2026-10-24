// The panel: who sits on it and what each seat sounds like. Shared by the
// browser (seat labels, moderator voice) and the server (TTS voices).

export type Speaker = "moderator" | "technical_lead" | "mentor" | "candidate";

export const SPEAKERS: Speaker[] = ["moderator", "technical_lead", "mentor", "candidate"];

/** The two panelists voiced by Higgs TTS 3. The moderator is Higgs Realtime. */
export type Panelist = "technical_lead" | "mentor";

export const LABELS: Record<Speaker, string> = {
  moderator: "Moderator",
  technical_lead: "Technical Lead",
  mentor: "Mentor",
  candidate: "You",
};

/** Preset voices (docs.boson.ai/models/higgs-tts/voices). Realtime accepts them too. */
export const VOICES: Record<Exclude<Speaker, "candidate">, string> = {
  moderator: "chloe",
  technical_lead: "oliver",
  // nora + contentment: 0 of 25 takes in another voice (jake was the Mentor until 2026-10-22).
  mentor: "nora",
};

/** Test mode only: the voice that reads the sample answers in corpus/candidate-scripts/ as the candidate. */
export const CANDIDATE_VOICE = "marcus";

/**
 * The two panelists ask in turn, Technical Lead first, until the interview length
 * runs out (2026-10-23; until then three fixed rounds). `label` is the short name
 * shown in the lobby. Each asker cycles through its own goals, one per question it
 * asks; the goals are worded in the interview language (corpus/lang/<code>.ts
 * `questions.goals`): the Technical Lead alternates a deep dive and a challenge,
 * the Mentor follows up.
 */
export const ASKERS: { speaker: Panelist; label: string }[] = [
  { speaker: "technical_lead", label: "Deep dive and challenge" },
  { speaker: "mentor", label: "Follow-up" },
];

/** Which asker (index in ASKERS) asks follow-up `round` (1-based). */
export const askerIndex = (round: number) => (round - 1) % ASKERS.length;

/** How many questions this asker has asked before follow-up `round`. */
export const askerTurn = (round: number) => Math.floor((round - 1) / ASKERS.length);

/** Who asks follow-up `round`, and how many questions they asked before it (which goal is next). */
export function roundPlan(round: number): { speaker: Panelist; turn: number } {
  return { speaker: ASKERS[askerIndex(round)].speaker, turn: askerTurn(round) };
}

/** How hard an asker's follow-ups are; chosen per asker in the lobby. */
export type Difficulty = "easy" | "medium" | "hard";

export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

/** One per asker, in ASKERS order. */
export const DEFAULT_DIFFICULTIES: Difficulty[] = ASKERS.map(() => "medium");

/** The difficulty picked for whoever asks follow-up `round`. */
export const difficultyFor = (difficulties: Difficulty[], round: number): Difficulty =>
  difficulties[askerIndex(round)] ?? "medium";

/**
 * Interview length choices in the lobby, in minutes. Past the chosen length the
 * moderator closes the interview once the candidate finishes the current answer.
 * 2 and 4 added on 2026-10-24 (the user's request; not 1). In 2 minutes the opening and
 * the introduction alone may use it up: then the moderator closes right after the
 * introduction, without the Time Buyer (src/interview.ts finishAnswer).
 */
export const INTERVIEW_LENGTHS = [2, 3, 4, 5, 7, 10, 15];

export const DEFAULT_LENGTH = 3;
