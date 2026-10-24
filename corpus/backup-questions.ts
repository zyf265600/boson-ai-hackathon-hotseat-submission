// Asked when the Orchestrator's question call times out or fails. They fit any
// project, so their TTS audio can be made when the interview starts. Several per
// asker and difficulty, used in turn (backupQuestion), since an asker may ask many
// questions now that the panel takes turns until time is up; each is a single
// question. The words are in the interview's language (corpus/lang/).
import { askerTurn, type Difficulty, type Panelist } from "../shared/panel";
import type { Language } from "../shared/languages";
import { pack } from "./lang";

/** One asker's backup questions at one difficulty, in the order they are used. */
export const backupQuestions = (lang: Language, speaker: Panelist, difficulty: Difficulty) =>
  pack(lang).backupQuestions[speaker][difficulty];

/** The backup question for follow-up `round`, asked by `speaker`: its next unused one, then round again. */
export function backupQuestion(lang: Language, speaker: Panelist, difficulty: Difficulty, round: number): string {
  const list = backupQuestions(lang, speaker, difficulty);
  return list[askerTurn(round) % list.length];
}
