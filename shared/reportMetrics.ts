// The report's delivery metrics (doc/report-design.zh.md section 2.3), computed
// in code from the inspector's events and the transcript; the judge never
// counts anything.

import type { DeliveryMetrics, ReportEvent, ReportInput } from "./report";

/** Placeholder the interview saves for a turn with nothing said (src/interview.ts). */
export const NO_ANSWER = "(no answer)";

/** Below this much speech a words-per-minute figure means nothing. */
const MIN_SPEAKING_MS = 10_000;

/**
 * Filler sounds and phrases. "like" and "so" are left out: in a transcript they
 * are usually real words. Higgs STT may drop um and uh altogether.
 */
const FILLERS = /\b(?:u+m+|u+h+|e+r+m+|you know|i mean)\b/gi;

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

interface AnswerTiming {
  latencyMs: number | null;
  speakingMs: number;
}

/**
 * Each candidate turn, from turn_listen to turn_end. Speech runs from a
 * turn_speech to the next turn_pause, less that pause's `ms` (the silence it
 * had already counted), or to turn_end if no pause came first.
 */
function answerTimings(events: ReportEvent[]): AnswerTiming[] {
  const answers: AnswerTiming[] = [];
  let opened: number | null = null;
  let firstWord: number | null = null;
  let talkingSince: number | null = null;
  let speakingMs = 0;
  for (const e of events) {
    switch (e.type) {
      case "turn_listen":
        opened = e.t - e.silentMs;
        firstWord = null;
        talkingSince = null;
        speakingMs = 0;
        break;
      case "turn_speech":
        if (opened === null) break;
        firstWord ??= e.t;
        talkingSince ??= e.t;
        break;
      case "turn_pause":
        if (talkingSince !== null) speakingMs += Math.max(0, e.t - e.ms - talkingSince);
        talkingSince = null;
        break;
      case "turn_end":
        if (opened === null) break;
        if (talkingSince !== null) speakingMs += e.t - talkingSince;
        answers.push({ latencyMs: firstWord !== null ? firstWord - opened : null, speakingMs });
        opened = null;
        break;
    }
  }
  return answers;
}

export function deliveryMetrics(input: ReportInput): DeliveryMetrics | null {
  const events = input.events;
  if (!events || events.length === 0) return null;
  const timings = answerTimings(events);
  const speakingMs = timings.reduce((sum, a) => sum + a.speakingMs, 0);
  const said = input.transcript
    .filter((t) => t.speaker === "candidate" && t.text !== NO_ANSWER)
    .map((t) => t.text)
    .join(" ");
  const wordCount = words(said);
  const fillers = said.match(FILLERS)?.length ?? 0;
  const minutes = speakingMs / 60_000;
  const enough = speakingMs >= MIN_SPEAKING_MS;
  const count = (type: ReportEvent["type"]) => events.filter((e) => e.type === type).length;
  const intents = (intent: string) => events.filter((e) => e.type === "intent" && e.intent === intent).length;
  return {
    answers: timings.length,
    medianLatencyMs: median(timings.flatMap((a) => (a.latencyMs === null ? [] : [a.latencyMs]))),
    speakingMs,
    words: wordCount,
    wpm: enough ? Math.round(wordCount / minutes) : null,
    fillers,
    fillersPerMinute: enough ? Math.round((fillers / minutes) * 10) / 10 : null,
    silencePrompts: count("silence_prompt"),
    unanswered: count("unanswered"),
    repeats: intents("repeat"),
    clarifications: intents("clarify"),
    bargeIns: count("barge_in"),
    connectionLost: count("connection_lost"),
    panelMs: typeof input.panelMs === "number" ? input.panelMs : null,
  };
}
