import type { Difficulty, Panelist, Speaker } from "../shared/panel";
import type { QuestionMode, NextQuestion } from "../shared/questions";
import { endsMidThought, type TurnVerdict } from "../shared/turn";
import type { Language } from "../shared/languages";
import type { CompanyPronunciation, InterviewSettings, Seat } from "../shared/settings";
import type { Report, ReportEvent, ReportQuestion } from "../shared/report";
import type { RingPlayer } from "./audio/playback";

export interface Turn {
  id: number;
  speaker: Speaker;
  text: string;
}

/** The server's LLM check: backup LLMs on or not (BACKUP), the provider in use, why others failed. */
export interface LlmStatus {
  ok: boolean;
  /** BACKUP=true on the server; null when the server did not answer. */
  backup: boolean | null;
  provider: string | null;
  errors: string[];
}

/**
 * Why a request failed: the server's `{ error }` text, else the HTTP status.
 * The body is not JSON when, for example, the HotSeat server is down and the
 * dev proxy answers instead.
 */
export async function errorOf(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const { error } = JSON.parse(text) as { error?: unknown };
    if (error) return typeof error === "string" ? error : JSON.stringify(error);
  } catch {
    // Not JSON; fall through to the status.
  }
  return `HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`;
}

async function post<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`${url}: ${await errorOf(res)}`);
  return res.json() as Promise<T>;
}

export async function fetchToken(): Promise<string> {
  const res = await fetch("/api/token");
  if (!res.ok) throw new Error(`token: ${await errorOf(res)}`);
  const data = (await res.json()) as { value?: string };
  if (!data.value) throw new Error("token: the server returned no key");
  return data.value;
}

/**
 * Whether the Orchestrator has a working LLM; the server tries its
 * providers in order. An unreachable server counts as unavailable too.
 */
export async function checkLlm(): Promise<LlmStatus> {
  try {
    return await post<LlmStatus>("/api/llm-check", {});
  } catch (err) {
    return {
      ok: false,
      backup: null,
      provider: null,
      errors: [`The HotSeat server did not answer: ${(err as Error).message}`],
    };
  }
}

/**
 * A new interview row with the prep room's settings; the server checks them (400 with the
 * reason if invalid). The settings come back as stored, with companySay when there is a
 * company; `pronunciation`: how that was inferred (null without a company).
 */
export const createInterview = (settings: InterviewSettings, resume?: string) =>
  post<{
    id: number;
    settings: InterviewSettings;
    pronunciation: CompanyPronunciation | null;
    /** AVATAR=true on the server: the TTS panelists with a portrait speak as video. */
    avatar?: boolean;
  }>("/api/interviews", {
    settings,
    resume,
  });

/**
 * The post-interview report (server/report.ts): built on the first call (20–60 s),
 * then served as saved. Resolves null when the candidate answered nothing (no report);
 * rejects with the server's reason on any other failure.
 */
export async function buildReport(
  interviewId: number,
  questions: ReportQuestion[],
  events: ReportEvent[],
  panelMs: number,
): Promise<Report | null> {
  const res = await fetch(`/api/interviews/${interviewId}/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questions, events, panelMs }),
  });
  if (res.status === 422) return null;
  if (!res.ok) throw new Error(await errorOf(res));
  return res.json() as Promise<Report>;
}

/** Change one seat's voice for the rest of the interview (after Realtime refused the moderator's). */
export async function setSeatVoice(interviewId: number, seat: Seat, voice: string): Promise<void> {
  const res = await fetch(`/api/interviews/${interviewId}/seats/${seat}/voice`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ voice }),
  });
  if (!res.ok) throw new Error(`seat voice: ${await errorOf(res)}`);
}

export const addTurn = (interviewId: number, speaker: Speaker, text: string) =>
  post<Turn>(`/api/interviews/${interviewId}/turns`, { speaker, text });

/** Rewrite one line of the log (a panel line the candidate cut into). */
export async function updateTurn(interviewId: number, turnId: number, text: string): Promise<Turn> {
  const res = await fetch(`/api/interviews/${interviewId}/turns/${turnId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`update turn: ${await errorOf(res)}`);
  return res.json() as Promise<Turn>;
}

export const nextQuestion = (
  interviewId: number,
  round: number,
  mode: QuestionMode,
  difficulty: Difficulty,
  /** The question the candidate could not answer, if they could not. */
  unanswered: string | undefined,
  /** The candidate's answer when it is not saved yet (asked at a pause). */
  answer: string | undefined,
  /** Every question the candidate could not answer so far in this interview. */
  skipped: string[],
  /** The interview language: the question is written in it. */
  language: Language,
  signal?: AbortSignal,
  /** Written ahead: the other asker's question, being answered meanwhile. */
  pending?: { speaker: Panelist; question: string },
  /** The moderator's Time Buyer question, "" while it is being asked; undefined if there was none. */
  timeBuyer?: string,
) =>
  post<NextQuestion>(
    `/api/interviews/${interviewId}/next-question`,
    { round, mode, difficulty, unanswered, answer, skipped, language, pending, timeBuyer },
    signal,
  );

/**
 * A fixed line's whole audio (PCM16 / 24 kHz) in that seat's voice and emotion; cached on the server's disk.
 * `interviewId`: the server uses that interview's voice for the seat; without it, the preset voice.
 */
export async function fetchLine(
  speaker: Exclude<Speaker, "candidate">,
  text: string,
  emotion?: string,
  language: Language = "en",
  interviewId?: number,
): Promise<ArrayBuffer> {
  const res = await fetch("/api/line", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ speaker, text, emotion, language, interviewId }),
  });
  if (!res.ok) throw new Error(`line: ${await errorOf(res)}`);
  return res.arrayBuffer();
}

/**
 * AVATAR=true: a fixed line as Higgs Avatar video (one MP4) on the seat's portrait, in the
 * interview's voice and language; rendered once and cached on the server's disk. `log`: where
 * the server saved a copy (TEST=true), for the inspector.
 */
export async function fetchLineVideo(
  interviewId: number,
  speaker: Panelist,
  text: string,
  emotion?: string,
): Promise<{ video: Blob; log: string | null }> {
  const res = await fetch("/api/avatar/line", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ interviewId, speaker, text, emotion }),
  });
  if (!res.ok) throw new Error(`avatar line: ${await errorOf(res)}`);
  return { video: await res.blob(), log: res.headers.get("X-Avatar-Log") };
}

/** AVATAR=true: start a question as Higgs Avatar video; the response body is the fragmented-MP4 stream. */
export function openAvatar(interviewId: number, q: NextQuestion, signal: AbortSignal): Promise<Response> {
  return fetch("/api/avatar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ interviewId, speaker: q.speaker, text: q.question, emotion: q.emotion }),
    signal,
  });
}

/** Transcribe one answer segment in `language` with Whisper (the first choice; Higgs is the backup); rejects if Whisper is not running. */
export async function transcribeWhisper(pcm: Int16Array, language: Language = "en"): Promise<string> {
  const res = await fetch(`/api/transcribe?language=${language}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: pcm.slice().buffer as ArrayBuffer,
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(await errorOf(res));
  return ((await res.json()) as { text: string }).text;
}

/**
 * The candidate paused: have they finished, and is it an answer or a request?
 * `cutInto`: the panel's words before the candidate cut in; `prompt`: the silence prompt just said. Never rejects: if the server does not
 * answer within 2.5 s (it gives up on DeepSeek itself after 1.5 s), the same
 * fallback rule decides here.
 */
export async function turnVerdict(
  question: string,
  answer: string,
  cutInto = "",
  prompt = "",
  language: Language = "en",
): Promise<TurnVerdict> {
  const started = performance.now();
  try {
    const res = await fetch("/api/turn-verdict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, answer, cutInto, prompt, language }),
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) throw new Error(await errorOf(res));
    return (await res.json()) as TurnVerdict;
  } catch (e) {
    const ms = Math.round(performance.now() - started);
    return {
      finished: !endsMidThought(answer, language),
      source: "rule",
      ms,
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Stream a panelist's question through TTS into the player; resolves with the
 * whole audio once it has been heard, so "say that again" can replay it.
 * Aborting `signal` stops the stream; nothing more is played.
 */
export async function speakAsPanelist(
  player: RingPlayer,
  q: NextQuestion,
  /**
   * Test mode: each network chunk's size, then one call with null once all audio
   * has arrived, with the file the server saved it to (TEST=true, logs/tts/).
   */
  onStream?: (bytes: number | null, file?: string) => void,
  signal?: AbortSignal,
  /** The interview language, so TTS reads numbers and units in it. */
  language: Language = "en",
  /** The server speaks in this interview's voice for the asker; without it, the preset voice. */
  interviewId?: number,
): Promise<ArrayBuffer> {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ speaker: q.speaker, text: q.question, emotion: q.emotion, language, interviewId }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`tts: ${res.ok ? "empty response" : await errorOf(res)}`);

  player.reset();
  const reader = res.body.getReader();
  const heard: Uint8Array[] = [];
  // A network chunk can end in the middle of a 2-byte PCM16 sample; carry the odd byte over.
  let carry: Uint8Array = new Uint8Array(0);
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    onStream?.(value.length);
    const bytes = new Uint8Array(carry.length + value.length);
    bytes.set(carry);
    bytes.set(value, carry.length);
    const even = bytes.length - (bytes.length % 2);
    carry = bytes.slice(even);
    if (even > 0) {
      heard.push(bytes.slice(0, even));
      player.enqueueBytes(bytes.slice(0, even).buffer);
    }
  }
  onStream?.(null, res.headers.get("X-Tts-Log") ?? undefined);
  player.markComplete();
  await player.waitUntilDrained();
  const all = new Uint8Array(heard.reduce((n, b) => n + b.length, 0));
  heard.reduce((at, b) => (all.set(b, at), at + b.length), 0);
  return all.buffer;
}
