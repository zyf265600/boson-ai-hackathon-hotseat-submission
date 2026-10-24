import { access, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ASKERS, type Speaker } from "../shared/panel";
import { DEFAULT_SETTINGS, SEATS, peopleFor, voiceLabel, type InterviewSettings } from "../shared/settings";

/** hotseat/logs/ (git-ignored): one record per test-mode session. */
export const LOG_DIR = fileURLToPath(new URL("../logs/", import.meta.url));

/** The part of the inspector's InspectorState that goes into a log (see src/inspector/types.ts). */
export interface SessionRecord {
  sessionId: string;
  interviewId: number | null;
  startedAt: number | null;
  endedAt: number | null;
  endReason: string;
  difficulties: string[];
  llm?: { backup: boolean | null; provider: string | null };
  /** The prep room's settings (language, role, company, each seat's voice and name); older records have none. */
  settings?: InterviewSettings;
  memory: { id: number; speaker: Speaker; text: string }[];
  questions: {
    round: number;
    mode: string;
    difficulty: string;
    speaker: Speaker;
    ms: number | null;
    result: {
      question: string;
      emotion: string;
      assessment?: string;
      reason?: string;
      angle?: string;
      provider?: string;
    } | null;
  }[];
  log: { t: number; text: string; error?: boolean }[];
  scripts?: { project: string; length: string; text: string; startedAt: number }[];
  turn?: {
    manual: boolean | null;
    checks: {
      t: number;
      answer: string;
      finished: boolean;
      source: string;
      ms: number;
      reason?: string;
      stale: boolean;
    }[];
  };
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

function stamp(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** mm:ss.mmm since the session started, as in the inspector's event log. */
function offset(t: number, start: number): string {
  const ms = Math.max(0, t - start);
  return `${pad(Math.floor(ms / 60000))}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`;
}

function markdown(r: SessionRecord): string {
  const start = r.startedAt ?? r.log[0]?.t ?? 0;
  const settings = r.settings ?? DEFAULT_SETTINGS;
  // This interview's names for the panel seats.
  const PEOPLE = peopleFor(settings);
  const lines = [
    `# Test session ${r.sessionId}${r.interviewId !== null ? ` · interview #${r.interviewId}` : ""}`,
    "",
    `- Started: ${stamp(start)}`,
    `- Ended: ${r.endedAt ? `${stamp(r.endedAt)} (${((r.endedAt - start) / 1000).toFixed(1)} s) · ${r.endReason}` : "—"}`,
    `- Follow-up difficulty: ${r.difficulties.map((d, i) => `${ASKERS[i] ? PEOPLE[ASKERS[i].speaker].name : `asker ${i + 1}`} ${d}`).join(", ")}`,
    `- Panel: ${SEATS.map((seat) => `${settings.seats[seat].name} (${PEOPLE[seat].role}, voice ${voiceLabel(settings.seats[seat].voice)})`).join(", ")}`,
    `- Language: ${settings.language} · Role: ${settings.role}${settings.company ? ` at ${settings.company}` : ""}`,
    `- LLMs: ${r.llm?.backup === undefined || r.llm.backup === null ? "unknown" : r.llm.backup ? "backup LLMs on" : "DeepSeek only"} · Orchestrator on ${r.llm?.provider ?? "unknown"}`,
    "",
    "## Conversation (what the Orchestrator reads)",
    "",
    ...r.memory.flatMap((t, i) => [
      `${i + 1}. **${PEOPLE[t.speaker].name}** (${PEOPLE[t.speaker].role}, ${t.text.length} chars): ${t.text}`,
    ]),
    "",
    "## Orchestrator question calls",
    "",
    "| Round | Difficulty | Thinking | LLM | Asked by | Time | Last answer | Emotion | Angle | Question |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...r.questions.map(
      (c) =>
        `| ${c.round} | ${c.difficulty} | ${c.mode === "fast" ? "off" : "on"} | ${c.result?.provider ?? "—"} | ${PEOPLE[c.speaker].name} | ${c.ms === null ? "—" : `${c.ms} ms`} | ${c.result?.assessment ? `${c.result.assessment}: ${(c.result.reason ?? "").replace(/\|/g, "\\|")}` : "—"} | ${c.result?.emotion ?? "—"} | ${c.result?.angle ?? "—"} | ${(c.result?.question ?? "—").replace(/\|/g, "\\|")} |`,
    ),
    "",
    ...(r.turn?.checks.length
      ? [
          "## Turn detection checks (has the candidate finished?)",
          "",
          "| Time | Verdict | By | Time taken | Answer so far (end) |",
          "|---|---|---|---|---|",
          ...r.turn.checks.map(
            (c) =>
              `| ${offset(c.t, start)} | ${c.finished ? "finished" : "not finished"}${c.stale ? " (ignored: spoke again)" : ""} | ${c.source === "deepseek" ? "deepseek-flash" : `rule: ${c.reason ?? ""}`.replace(/\|/g, "\\|")} | ${c.ms} ms | …${c.answer.slice(-120).replace(/\|/g, "\\|")} |`,
          ),
          "",
        ]
      : []),
    ...(r.scripts?.length
      ? [
          "## Scripts read by the simulated candidate",
          "",
          ...r.scripts.flatMap((s) => [
            `### ${offset(s.startedAt, start)} · ${s.project} (${s.length}, ${s.text.length} chars)`,
            "",
            ...s.text.split("\n\n").map((p) => `> ${p}\n>`),
            "",
          ]),
        ]
      : []),
    "## Event log",
    "",
    "```",
    ...r.log.map((l) => `${offset(l.t, start)} ${l.text}`),
    "```",
    "",
  ];
  return lines.join("\n");
}

/** Write <date>_<time>_<session>.md (to read) and .json (the raw record); returns the base name. */
export async function saveSessionLog(r: SessionRecord): Promise<string> {
  const d = new Date(r.startedAt ?? Date.now());
  const base = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}_${r.sessionId}`;
  await mkdir(LOG_DIR, { recursive: true });
  await writeFile(`${LOG_DIR}${base}.md`, markdown(r));
  await writeFile(`${LOG_DIR}${base}.json`, JSON.stringify(r, null, 2));
  return base;
}

/**
 * TEST=true: keep a panelist question's TTS audio as heard, to listen to later
 * (a question once came out in another voice). Returns the file name under
 * logs/tts/; `save` writes it once the stream has ended.
 */
export function ttsLog(speaker: Speaker, voice: string, emotion = "") {
  const stamp = new Date().toLocaleString("sv-SE").replace(" ", "_").replaceAll(":", "");
  const name = `${stamp}_${speaker}_${voiceLabel(voice)}${emotion ? `_${emotion}` : ""}.wav`;
  return {
    name,
    async save(pcm: Buffer): Promise<void> {
      await mkdir(`${LOG_DIR}tts/`, { recursive: true });
      await writeFile(`${LOG_DIR}tts/${name}`, Buffer.concat([wavHeader(pcm.length), pcm]));
    },
  };
}

/**
 * TEST=true: where a streamed avatar question is saved (logs/avatar/), like ttsLog for
 * audio. Returns the file name under logs/avatar/; `save` writes it once the stream has ended.
 */
export function avatarLog(speaker: Speaker, voice: string, emotion = "") {
  const stamp = new Date().toLocaleString("sv-SE").replace(" ", "_").replaceAll(":", "");
  const name = `${stamp}_${speaker}_${voiceLabel(voice)}${emotion ? `_${emotion}` : ""}.mp4`;
  return {
    name,
    async save(mp4: Buffer): Promise<void> {
      await mkdir(`${LOG_DIR}avatar/`, { recursive: true });
      await writeFile(`${LOG_DIR}avatar/${name}`, mp4);
    },
  };
}

/**
 * TEST=true: a fixed line's avatar video, copied to logs/avatar/lines/ under its cache
 * name the first time it is served (the same clip is reused by every interview).
 * Returns its name under logs/avatar/.
 */
export async function saveAvatarLine(file: string, mp4: Buffer): Promise<string> {
  const name = `lines/${file}`;
  const path = `${LOG_DIR}avatar/${name}`;
  const exists = await access(path).then(
    () => true,
    () => false,
  );
  if (!exists) {
    await mkdir(`${LOG_DIR}avatar/lines/`, { recursive: true });
    await writeFile(path, mp4);
  }
  return name;
}

/** A 44-byte WAV header for PCM16 / 24 kHz / mono, the format Higgs TTS streams. */
function wavHeader(bytes: number): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + bytes, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(24000, 24);
  h.writeUInt32LE(24000 * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(bytes, 40);
  return h;
}
