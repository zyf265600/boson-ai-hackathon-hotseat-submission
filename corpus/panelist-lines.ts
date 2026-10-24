// Fixed lines spoken with TTS, so they are always word for word and can be
// synthesized once and replayed with no wait. The server keeps each line's audio
// on disk (POST /api/line) and the browser loads them all when the interview starts.
// They are said on a timer or at a fixed point, never in reply to the candidate:
// replies (handoffs, move-ons, "say that again", an early end) are the moderator's,
// worded by Realtime (corpus/realtime.ts), so a TTS panelist could be a pre-recorded
// avatar video (2026-10-23). The words are in the interview's language (corpus/lang/).
import type { Language } from "../shared/languages";
import { pack, type Seat } from "./lang";

/**
 * Said by whoever asked the current question; the opening question is the moderator
 * seat's, in its voice. `silence` is keyed by seconds of candidate silence after the
 * question (src/interview.ts SILENCE_STEPS; at 35 s the question is marked
 * unanswered); `wrapUp` when the candidate has been answering for 180 seconds.
 */
export const askerLines = (lang: Language, seat: Seat) => pack(lang).askerLines[seat];

/**
 * The moderator seat's closing lines, in its voice through TTS. Realtime worded
 * the closing itself until 2026-10-22, but in full interviews it opened with
 * "Hello, and thank you for joining us today" 2 times in 4 and never really closed
 * once; a fixed line is always right and plays with no wait. `timeUp` is the usual
 * end, since the panel takes turns until then; `endEarly` only if Realtime says
 * nothing (corpus/realtime.ts `endEarly`).
 */
export const closingLines = (lang: Language) => pack(lang).closing;

/**
 * The opening question on its own, in the moderator seat's voice (through TTS).
 * Realtime words the opening itself, so this is what "say that again" replays then.
 */
export const openingQuestion = (lang: Language) => pack(lang).openingQuestion;
