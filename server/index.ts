import "dotenv/config";
import { Readable } from "node:stream";
import express from "express";
import { CANDIDATE_VOICE, VOICES, DIFFICULTIES, SPEAKERS, type Difficulty, type Speaker } from "../shared/panel";
import { languageOr } from "../shared/languages";
import {
  ALLOWED_VOICES,
  DEFAULT_ROLE,
  DEFAULT_SETTINGS,
  SEATS,
  checkSettings,
  portraitFor,
  type InterviewSettings,
  type Seat,
} from "../shared/settings";
import type { QuestionMode } from "../shared/questions";
import {
  addTurn,
  createInterview,
  interviewResume,
  interviewSettings,
  listTurns,
  migrate,
  saveReport,
  savedReport,
  setSeatVoice,
  updateTurn,
} from "./db";
import { MAX_RESUME_CHARS, REPORT_EVENTS, type Report, type ReportEvent, type ReportQuestion } from "../shared/report";
import { NothingToJudge, buildReport } from "./report";
import { EMOTIONS, nextQuestion } from "./questions";
import { judgeTurn } from "./turn";
import { transcribe } from "./whisper";
import { BosonError, createRealtimeToken, lineAudio, lineVideo, streamAvatar, streamSpeech } from "./boson";
import { checkProviders, llmStatus, providerName } from "./llm";
import { companyPronunciation, spokenText } from "./pronounce";
import { avatarLog, saveAvatarLine, saveSessionLog, ttsLog, type SessionRecord } from "./testLogs";
import { AVATAR, TEST } from "./config";

const PORT = Number(process.env.PORT ?? 3100);

const app = express();
// Express 5 forwards errors thrown in async handlers to its default handler.
// Room for a test-mode session record (POST /api/test-logs).
app.use(express.json({ limit: "2mb" }));

/**
 * GET /api/token — mint a short-lived Realtime key for the browser, so the
 * real Boson key never leaves this server (pattern from higgs-realtime-tutorial).
 */
app.get("/api/token", async (_req, res) => {
  try {
    return res.json({ value: await createRealtimeToken() });
  } catch (err) {
    if (err instanceof BosonError) return res.status(err.status).json({ error: err.message });
    return res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * The interview `interviewId` names in a request body, if any: its settings
 * (voices, names, language), or the HTTP status and error to answer with. Without
 * an id: null, and the preset panel (VOICES) is used. Voices are always looked up
 * here, never taken from the browser.
 */
async function interviewOf(
  interviewId: unknown,
): Promise<{ settings: InterviewSettings | null } | { status: number; error: string }> {
  if (interviewId === undefined || interviewId === null) return { settings: null };
  const id = Number(interviewId);
  if (!Number.isInteger(id) || id < 1) return { status: 400, error: "interviewId must be a whole number from 1" };
  const settings = await interviewSettings(id);
  if (!settings) return { status: 404, error: `no interview ${id}` };
  return { settings };
}

/** `text` as TTS gets it (pronounce.ts spokenText: the company respelled); logged when it changed. */
function forTts(route: string, speaker: string, text: string, settings: InterviewSettings | null): string {
  const spoken = spokenText(text, settings);
  if (spoken !== text)
    console.log(`${route} ${speaker}: company "${settings?.company}" sent to TTS as "${settings?.companySay}"`);
  return spoken;
}

/** The voice a panel seat speaks in: the interview's choice if it has settings, else the preset. */
function seatVoice(seat: Seat, settings: InterviewSettings | null): string {
  const voice = settings?.seats[seat].voice ?? VOICES[seat];
  // Rows are only written with checked voices; a row edited by hand falls back to the preset.
  return ALLOWED_VOICES.has(voice) ? voice : VOICES[seat];
}

/**
 * POST /api/tts { speaker, text, emotion, language?, interviewId? } — stream a panelist's
 * line (or, in test mode, the simulated candidate's answer) as raw
 * PCM16 / 24 kHz / mono, the same format Higgs Realtime outputs, so the
 * browser plays both through one player. With `interviewId`, a panelist speaks in
 * that interview's voice for the seat; without it, in the preset voice. The candidate
 * is always CANDIDATE_VOICE; the X-Voice header names the voice used. TEST=true: a panelist's audio is also saved to logs/tts/, and the X-Tts-Log
 * header names the file. The company name in `text` is sent to TTS as the interview's
 * companySay (pronounce.ts); the text shown and saved stays as written.
 */
app.post("/api/tts", async (req, res) => {
  const { speaker, text, emotion, language, interviewId } = req.body as {
    speaker: Speaker;
    text: string;
    emotion?: string;
    language?: unknown;
    interviewId?: unknown;
  };
  if (speaker !== "technical_lead" && speaker !== "mentor" && speaker !== "candidate") {
    return res.status(400).json({ error: "speaker must be a TTS panelist or the candidate" });
  }
  if (!text) return res.status(400).json({ error: "text is required" });
  const found = await interviewOf(interviewId);
  if ("error" in found) return res.status(found.status).json({ error: found.error });
  const voice = speaker === "candidate" ? CANDIDATE_VOICE : seatVoice(speaker, found.settings);
  const lang = languageOr(language ?? found.settings?.language);

  try {
    const spoken = forTts("tts", speaker, text, found.settings);
    const audio = Readable.fromWeb((await streamSpeech(spoken, voice, emotion, lang)) as never);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("X-Voice", voice);
    if (TEST && speaker !== "candidate") {
      const log = ttsLog(speaker, voice, emotion);
      res.setHeader("X-Tts-Log", log.name);
      const chunks: Buffer[] = [];
      audio.on("data", (chunk: Buffer) => chunks.push(chunk));
      audio.on("end", () => void log.save(Buffer.concat(chunks)).catch((e) => console.error("tts log:", e)));
    }
    audio.pipe(res);
  } catch (err) {
    if (err instanceof BosonError) return res.status(err.status).json({ error: err.message });
    return res.status(502).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/line { speaker, text, emotion?, language?, interviewId? } — a fixed line's whole audio (raw
 * PCM16 / 24 kHz / mono) in that seat's voice, from the disk cache after the
 * first time (corpus/panelist-lines.ts, backup questions). With `interviewId`, the
 * voice that interview chose for the seat (the moderator seat's too); without it, the
 * preset (the moderator seat uses chloe). `emotion`: a TTS emotion tag, e.g. the
 * asker's tone (shared/questions.ts TONE). The X-Voice header names the voice used. The
 * company name is sent to TTS as companySay, as in /api/tts (so it is part of the cache key).
 */
app.post("/api/line", async (req, res) => {
  const { speaker, text, emotion, language, interviewId } = req.body as {
    speaker: Speaker;
    text: string;
    emotion?: string;
    language?: unknown;
    interviewId?: unknown;
  };
  if (!SPEAKERS.includes(speaker) || speaker === "candidate") {
    return res.status(400).json({ error: "speaker must be a panel seat" });
  }
  if (!text) return res.status(400).json({ error: "text is required" });
  if (emotion !== undefined && !EMOTIONS.includes(emotion as never)) {
    return res.status(400).json({ error: `unknown emotion: ${emotion}` });
  }
  const found = await interviewOf(interviewId);
  if ("error" in found) return res.status(found.status).json({ error: found.error });
  const voice = seatVoice(speaker, found.settings);
  try {
    const spoken = forTts("line", speaker, text, found.settings);
    const audio = await lineAudio(spoken, voice, emotion, languageOr(language ?? found.settings?.language));
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("X-Voice", voice);
    res.send(audio);
  } catch (err) {
    if (err instanceof BosonError) return res.status(err.status).json({ error: err.message });
    return res.status(502).json({ error: (err as Error).message });
  }
});

/**
 * An avatar request's interview, seat and line, checked (AVATAR=true): the voice, language
 * and portrait come from the interview, never from the browser. A string is the 400 error;
 * a missing interview gives its own status.
 */
async function avatarLine(body: unknown): Promise<
  | {
      speaker: "technical_lead" | "mentor";
      text: string;
      emotion?: string;
      voice: string;
      portrait: string;
      settings: InterviewSettings;
    }
  | { status: number; error: string }
> {
  if (!AVATAR) return { status: 400, error: "the avatar is off (AVATAR in .env)" };
  const { speaker, text, emotion, interviewId } = body as {
    speaker?: unknown;
    text?: unknown;
    emotion?: string;
    interviewId?: unknown;
  };
  if (speaker !== "technical_lead" && speaker !== "mentor")
    return { status: 400, error: "speaker must be a TTS panelist" };
  if (typeof text !== "string" || !text) return { status: 400, error: "text is required" };
  if (emotion !== undefined && !EMOTIONS.includes(emotion as never))
    return { status: 400, error: `unknown emotion: ${emotion}` };
  if (interviewId === undefined) return { status: 400, error: "interviewId is required" };
  const found = await interviewOf(interviewId);
  if ("error" in found) return found;
  const settings = found.settings ?? DEFAULT_SETTINGS;
  const voice = seatVoice(speaker, settings);
  const portrait = portraitFor(voice);
  if (!portrait) return { status: 400, error: `voice ${voice} has no portrait: this seat is voice only` };
  return { speaker, text, emotion, voice, portrait, settings };
}

/**
 * POST /api/avatar { interviewId, speaker, text, emotion? } — AVATAR=true: stream a
 * panelist's question as Higgs Avatar talking-head video on the portrait of the seat's
 * voice, in the interview's language: fragmented MP4 with the voice inside, so the
 * browser can start playing before the clip is done. The company name is spoken as
 * companySay, as in /api/tts. TEST=true: the video is also saved to logs/avatar/, and
 * the X-Avatar-Log header names the file.
 */
app.post("/api/avatar", async (req, res) => {
  const line = await avatarLine(req.body);
  if ("error" in line) return res.status(line.status).json({ error: line.error });
  try {
    const spoken = forTts("avatar", line.speaker, line.text, line.settings);
    const { id, body } = await streamAvatar(spoken, line.voice, line.emotion, line.settings.language, line.portrait);
    const video = Readable.fromWeb(body as never);
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("X-Voice", line.voice);
    if (id) res.setHeader("X-Video-Id", id);
    if (TEST) {
      const log = avatarLog(line.speaker, line.voice, line.emotion);
      res.setHeader("X-Avatar-Log", log.name);
      const chunks: Buffer[] = [];
      video.on("data", (chunk: Buffer) => chunks.push(chunk));
      video.on("end", () => void log.save(Buffer.concat(chunks)).catch((e) => console.error("avatar log:", e)));
    }
    // A browser that hangs up (a cut-in, the next question) cancels the upstream stream too.
    res.on("close", () => video.destroy());
    video.pipe(res);
  } catch (err) {
    if (err instanceof BosonError) return res.status(err.status).json({ error: err.message });
    return res.status(502).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/avatar/line { interviewId, speaker, text, emotion? } — AVATAR=true: a fixed
 * line (the same as POST /api/line) as one finished MP4 on the seat's portrait, driven by
 * the line's cached audio; rendered once (10–25 s), then served from .cache/avatar/.
 * TEST=true: also copied to logs/avatar/lines/, named in the X-Avatar-Log header.
 */
app.post("/api/avatar/line", async (req, res) => {
  const line = await avatarLine(req.body);
  if ("error" in line) return res.status(line.status).json({ error: line.error });
  try {
    const spoken = forTts("avatar line", line.speaker, line.text, line.settings);
    const { mp4, cached, file } = await lineVideo(
      spoken,
      line.voice,
      line.emotion,
      line.settings.language,
      line.portrait,
    );
    if (!cached) console.log(`avatar line rendered: ${line.speaker} "${line.text}"`);
    if (TEST) res.setHeader("X-Avatar-Log", await saveAvatarLine(file, mp4));
    res.type("video/mp4").send(mp4);
  } catch (err) {
    if (err instanceof BosonError) return res.status(err.status).json({ error: err.message });
    return res.status(502).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/transcribe?language=<code> <raw PCM16 / 24 kHz / mono> — transcribe one answer
 * segment with Whisper (server/whisper.ts), the first choice; Higgs's transcript is the backup.
 * { text } or 503 when Whisper is not running or fails.
 */
app.post("/api/transcribe", express.raw({ type: "application/octet-stream", limit: "5mb" }), async (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: "audio is required" });
  try {
    res.json({ text: await transcribe(req.body, languageOr(req.query.language)) });
  } catch (err) {
    res.status(503).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/turn-verdict { question, answer, cutInto?, prompt?, language? } — the candidate paused:
 * have they finished, and is it an answer or a request? `cutInto`: the panel's words
 * before the candidate cut in, if they did; `prompt`: the silence prompt just said, if any.
 * Always answers, within ~1.5 s (server/turn.ts).
 */
app.post("/api/turn-verdict", async (req, res) => {
  const {
    question = "",
    answer = "",
    cutInto = "",
    prompt = "",
    language,
  } = req.body as Record<string, string | undefined>;
  res.json(await judgeTurn(question, answer, cutInto, prompt, languageOr(language)));
});

/**
 * POST /api/test-logs <InspectorState> — test mode: a session ended; write its
 * record to hotseat/logs/<date>_<time>_<session>.md and .json.
 */
app.post("/api/test-logs", async (req, res) => {
  const record = req.body as SessionRecord;
  if (!/^[a-z0-9]{1,32}$/.test(record?.sessionId ?? "")) {
    return res.status(400).json({ error: "bad session id" });
  }
  const file = await saveSessionLog(record);
  console.log(`test log saved: logs/${file}.md`);
  res.json({ file });
});

/**
 * POST /api/llm-check — pick the first LLM provider that works (see llm.ts).
 * The lobby calls it when it opens, and Join waits for { ok: true } before the
 * interview starts. Also returns { test, provider, errors } for the inspector
 * and for the error the lobby shows when nothing works.
 */
app.post("/api/llm-check", async (_req, res) => {
  const ok = await checkProviders();
  res.json({ ok, ...llmStatus() });
});

/**
 * POST /api/interviews { settings?, resume? } — a new interview with the prep room's settings
 * (shared/settings.ts): language, role, company, and each seat's voice (only voices on
 * ALLOWED_VOICES) and name. No body or no settings: DEFAULT_SETTINGS. 400 with the
 * reason if they do not pass checkSettings (e.g. a role not on ROLES). With a company,
 * deepseek-flash first infers how TTS should be given its name (pronounce.ts, at most
 * ~1.5 s; the name as typed on a timeout or an error), stored as companySay. Answers
 * { id, settings, pronunciation } as stored; `pronunciation` is null without a company.
 * `resume`: the prep room's résumé as plain text, kept (up to MAX_RESUME_CHARS) for the
 * post-interview report only.
 */
app.post("/api/interviews", async (req, res) => {
  const body = req.body as { settings?: unknown; resume?: unknown } | undefined;
  const input = body?.settings;
  const resume = typeof body?.resume === "string" ? body.resume.trim().slice(0, MAX_RESUME_CHARS) : "";
  const checked = input === undefined ? DEFAULT_SETTINGS : checkSettings(input);
  if (typeof checked === "string") return res.status(400).json({ error: checked });
  const pronunciation = checked.company ? await companyPronunciation(checked.company, checked.language) : null;
  const settings: InterviewSettings = pronunciation ? { ...checked, companySay: pronunciation.say } : checked;
  if (pronunciation) {
    console.log(
      `company "${pronunciation.company}" (${settings.language}) said as "${pronunciation.say}" · ${pronunciation.source} in ${pronunciation.ms} ms${pronunciation.error ? ` (${pronunciation.error})` : ""}`,
    );
  }
  // `avatar`: AVATAR in .env, so the browser shows the TTS panelists' faces (portraitFor).
  res.json({ id: await createInterview(settings, resume), settings, pronunciation, avatar: AVATAR });
});

/** GET /api/interviews/:id — the interview's settings. */
app.get("/api/interviews/:id", async (req, res) => {
  const found = await interviewOf(req.params.id);
  if ("error" in found) return res.status(found.status).json({ error: found.error });
  res.json({ id: Number(req.params.id), settings: found.settings });
});

/**
 * PUT /api/interviews/:id/seats/:seat/voice { voice } — change one seat's voice for the
 * rest of the interview: the browser does this when Realtime refuses the moderator's
 * voice and falls back to a preset (src/interview.ts connectRealtime). Only voices on
 * ALLOWED_VOICES.
 */
app.put("/api/interviews/:id/seats/:seat/voice", async (req, res) => {
  const seat = req.params.seat as Seat;
  const { voice } = req.body as { voice?: unknown };
  if (!SEATS.includes(seat)) return res.status(400).json({ error: "seat must be a panel seat" });
  if (typeof voice !== "string" || !ALLOWED_VOICES.has(voice)) {
    return res.status(400).json({ error: `voice not allowed: ${String(voice)}` });
  }
  const found = await interviewOf(req.params.id);
  if ("error" in found) return res.status(found.status).json({ error: found.error });
  // The whole panel is checked again, so two seats never end up with one voice. Only the
  // seats: a row from before the role list may hold a role that is not on it.
  const current = { ...(found.settings ?? DEFAULT_SETTINGS), role: DEFAULT_ROLE };
  const checked = checkSettings({ ...current, seats: { ...current.seats, [seat]: { ...current.seats[seat], voice } } });
  if (typeof checked === "string") return res.status(400).json({ error: checked });
  await setSeatVoice(Number(req.params.id), seat, voice);
  res.json({ seat, voice });
});

/** The report's events from the browser, kept only if they have a known type and a time. */
function reportEvents(value: unknown): ReportEvent[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (e): e is ReportEvent =>
      typeof e === "object" && e !== null && REPORT_EVENTS.has((e as ReportEvent).type) && typeof e.t === "number",
  );
}

/** The Orchestrator's calls from the browser (the inspector's record), kept only if well formed. */
function reportQuestions(value: unknown): ReportQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (q): q is ReportQuestion =>
      typeof q === "object" &&
      q !== null &&
      typeof q.round === "number" &&
      SPEAKERS.includes(q.speaker) &&
      (q.result === null || typeof q.result?.question === "string"),
  );
}

/**
 * POST /api/interviews/:id/report { questions, events, panelMs } — the post-interview report
 * (server/report.ts), built once and then served from the reports table. The
 * transcript, the résumé and the language come from the interview's row; the browser
 * sends what only it recorded: the Orchestrator's calls (each question and its live
 * judgment) and the turn events for the delivery metrics. 422 when the candidate
 * answered nothing. Takes 1–2 minutes the first time; a second request while one is
 * being written waits for that one instead of calling the judge again.
 */
const writingReports = new Map<number, Promise<Report>>();

app.post("/api/interviews/:id/report", async (req, res) => {
  const id = Number(req.params.id);
  const found = await interviewOf(id);
  if ("error" in found) return res.status(found.status).json({ error: found.error });
  const saved = await savedReport(id);
  if (saved) return res.json(saved);
  const body = req.body as { questions?: unknown; events?: unknown; panelMs?: unknown } | undefined;
  const language = found.settings?.language ?? "en";
  const started = Date.now();
  let writing = writingReports.get(id);
  if (!writing) {
    writing = (async () => {
      const transcript = (await listTurns(id)).map(({ speaker, text }) => ({ speaker, text }));
      const resume = (await interviewResume(id)) || undefined;
      const report = await buildReport({
        transcript,
        questions: reportQuestions(body?.questions),
        events: reportEvents(body?.events),
        panelMs: typeof body?.panelMs === "number" && body.panelMs >= 0 ? body.panelMs : undefined,
        resume,
        language,
      });
      await saveReport(id, report);
      console.log(
        `report for interview ${id} (${language}${resume ? ", with résumé" : ""}) by ${report.model} in ${Date.now() - started} ms`,
      );
      return report;
    })().finally(() => writingReports.delete(id));
    writingReports.set(id, writing);
  }
  try {
    res.json(await writing);
  } catch (err) {
    if (err instanceof NothingToJudge) return res.status(422).json({ error: err.message });
    console.error(`report for interview ${id} failed after ${Date.now() - started} ms:`, err);
    res.status(502).json({ error: (err as Error).message });
  }
});

app.get("/api/interviews/:id/turns", async (req, res) => {
  res.json(await listTurns(Number(req.params.id)));
});

/** POST /api/interviews/:id/turns { speaker, text } — append to the shared conversation log. */
app.post("/api/interviews/:id/turns", async (req, res) => {
  const { speaker, text } = req.body as { speaker: Speaker; text: string };
  if (!SPEAKERS.includes(speaker) || !text) {
    return res.status(400).json({ error: "speaker and text are required" });
  }
  res.json(await addTurn(Number(req.params.id), speaker, text));
});

/**
 * PATCH /api/interviews/:id/turns/:turnId { text } — rewrite one line, e.g. a panel
 * line the candidate cut into: only the part heard, plus " [interrupted]".
 */
app.patch("/api/interviews/:id/turns/:turnId", async (req, res) => {
  const { text } = req.body as { text: string };
  if (!text) return res.status(400).json({ error: "text is required" });
  const turn = await updateTurn(Number(req.params.id), Number(req.params.turnId), text);
  if (!turn) return res.status(404).json({ error: "no such turn" });
  res.json(turn);
});

/**
 * POST /api/interviews/:id/next-question { round, mode, difficulty, unanswered, answer, skipped, language, pending, timeBuyer } —
 * the Orchestrator reads the whole log and writes the next panelist question,
 * told the role (and company) the candidate practises for, from the interview's row.
 * `difficulty` (easy | medium | hard) defaults to medium; `unanswered`: the
 * question the candidate could not answer, if they could not; `answer`: the
 * candidate's answer when it is not in the log yet (asked at a pause, before
 * the answer is known to be finished); `pending` { speaker, question }: written ahead, while
 * the other asker's question is answered (src/interview.ts askAhead); `timeBuyer`: the moderator's
 * Time Buyer question, "" while it is being asked.
 */
app.post("/api/interviews/:id/next-question", async (req, res) => {
  const {
    round,
    mode,
    difficulty = "medium",
    unanswered,
    answer,
    skipped,
    language,
    pending,
    timeBuyer,
  } = req.body as {
    round: number;
    mode: QuestionMode;
    difficulty?: Difficulty;
    unanswered?: string;
    answer?: string;
    skipped?: unknown;
    language?: unknown;
    pending?: { speaker?: unknown; question?: unknown };
    timeBuyer?: unknown;
  };
  if (!(Number.isInteger(round) && round >= 1)) {
    return res.status(400).json({ error: "round must be a whole number from 1" });
  }
  if (!DIFFICULTIES.includes(difficulty)) {
    return res.status(400).json({ error: `difficulty must be one of ${DIFFICULTIES.join(", ")}` });
  }
  const startedAt = Date.now();
  try {
    const [turns, settings] = await Promise.all([
      listTurns(Number(req.params.id)),
      interviewSettings(Number(req.params.id)),
    ]);
    if (typeof answer === "string" && answer) {
      turns.push({ id: 0, speaker: "candidate", text: answer, created_at: new Date().toISOString() });
    }
    const next = await nextQuestion(
      turns,
      round,
      mode === "deep" ? "deep" : "fast",
      difficulty,
      typeof unanswered === "string" && unanswered ? unanswered : undefined,
      Array.isArray(skipped) ? skipped.filter((q): q is string => typeof q === "string" && q !== "") : [],
      languageOr(language ?? settings?.language),
      // The role and company from the prep room give the question its context.
      settings ? { role: settings.role, company: settings.company } : undefined,
      (pending?.speaker === "technical_lead" || pending?.speaker === "mentor") &&
        typeof pending.question === "string" &&
        pending.question
        ? { speaker: pending.speaker, question: pending.question }
        : undefined,
      typeof timeBuyer === "string" ? timeBuyer : undefined,
    );
    // Who answered, so the inspector shows it next to each question.
    const provider = await providerName();
    console.log(`next-question round ${round} (${mode}, ${difficulty}) on ${provider} in ${Date.now() - startedAt} ms`);
    res.json({ ...next, provider });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

await migrate();
app.listen(PORT, () => {
  console.log(
    `HotSeat server on http://localhost:${PORT}${TEST ? " · TEST=true: Orchestrator on DeepSeek only" : ""}${AVATAR ? " · AVATAR=true: talking-head panelists" : ""}`,
  );
});
