// The fixed lines a TTS panelist says on camera (AVATAR=true), as src/interview.ts says
// them and so as their videos are keyed: the silence prompts and the 180 s wrap-up without
// an emotion tag, the backup questions in the seat's tone (TONE). Like the audio of every
// fixed line, each video is rendered once and kept on the server's disk (.cache/avatar/).
import { DIFFICULTIES, type Difficulty, type Panelist } from "../shared/panel";
import { TONE } from "../shared/questions";
import type { Language } from "../shared/languages";
import { askerLines } from "./panelist-lines";
import { backupQuestions } from "./backup-questions";

export interface VideoLine {
  text: string;
  emotion?: string;
}

/**
 * `seat`'s fixed lines in `lang`. `difficulty`: only that difficulty's backup questions (one
 * interview); all three when omitted (scripts/avatar-lines.ts renders them ahead).
 */
export function videoLines(lang: Language, seat: Panelist, difficulty?: Difficulty): VideoLine[] {
  const { silence, wrapUp } = askerLines(lang, seat);
  const lines: VideoLine[] = [silence[8], silence[15], silence[25], wrapUp].map((text) => ({ text }));
  for (const d of difficulty ? [difficulty] : DIFFICULTIES)
    for (const text of backupQuestions(lang, seat, d)) lines.push({ text, emotion: TONE[seat] });
  return lines;
}
