import type { Phase } from "../interview";
import { ASKERS, type Difficulty, type Speaker } from "../../shared/panel";
import type { Turn } from "../api";
import { AUDIO_RATE } from "../realtime/sessionConfig";
import { DEFAULT_SETTINGS, SEATS, peopleFor, voiceLabel } from "../../shared/settings";
import { REPORT_EVENTS, type ReportEvent, type ReportQuestion } from "../../shared/report";
import {
  CHANNEL,
  modeLabel,
  type ChannelMessage,
  type DebugEvent,
  FLOOR_LABELS,
  PHASE_LABELS,
  RESUME_LABELS,
  type InspectorState,
  type Interviewer,
  type SeatState,
} from "./types";

const INTERVIEWERS: Interviewer[] = ["moderator", "technical_lead", "mentor"];
const MAX_LOG = 300;

/** A DebugEvent of a REPORT_EVENTS type, as the report keeps it: its time and only the fields it reads. */
function reportEvent(e: DebugEvent): ReportEvent {
  const t = Date.now();
  switch (e.type) {
    case "turn_listen":
      return { t, type: e.type, silentMs: e.silentMs };
    case "turn_pause":
      return { t, type: e.type, ms: e.ms };
    case "turn_end":
      return { t, type: e.type, reason: e.reason };
    case "silence_prompt":
      return { t, type: e.type, seconds: e.seconds };
    case "intent":
      return { t, type: e.type, intent: e.intent };
    case "turn_speech":
    case "unanswered":
    case "barge_in":
    case "connection_lost":
      return { t, type: e.type };
    default:
      throw new Error(`not a report event: ${e.type}`);
  }
}

const idleSeat = (): SeatState => ({ status: "idle", emotion: "", line: "", note: "" });

function emptyState(): InspectorState {
  return {
    sessionId: "",
    interviewId: null,
    startedAt: null,
    endedAt: null,
    endReason: "",
    llm: { test: null, provider: null },
    difficulties: [],
    settings: DEFAULT_SETTINGS,
    phase: "idle",
    floor: null,
    seats: { moderator: idleSeat(), technical_lead: idleSeat(), mentor: idleSeat() },
    tts: null,
    questions: [],
    scripts: [],
    memory: [],
    candidateLive: "",
    turn: { manual: null, talking: false, quietSince: null, checks: [] },
    log: [],
    meters: { panel: 0, mic: 0, played: 0, total: 0, complete: true },
  };
}

type Meters = () => InspectorState["meters"];

/**
 * Lives in the interview window. Folds everything the interview reports into
 * one InspectorState and broadcasts it, so an inspector window opened at any
 * time gets the full picture.
 */
export class InspectorHub {
  private state = emptyState();
  private readonly channel = new BroadcastChannel(CHANNEL);
  private timer: number | null = null;
  /** Test mode: write this session's record to hotseat/logs/ when it ends. */
  private record = false;
  /** The structured events the post-interview report reads (REPORT_EVENTS), in every mode. */
  private reportEvents: ReportEvent[] = [];
  /** How long an interviewer has had the floor so far, and since when the current one has (for the report). */
  private panelMs = 0;
  private panelSince: number | null = null;

  constructor(private readonly meters: Meters) {
    this.channel.onmessage = (e: MessageEvent<ChannelMessage>) => {
      if (e.data.type === "hello") this.publish();
    };
    // Closing or reloading the call window also ends the session.
    window.addEventListener("pagehide", () => this.ended("The interview window was closed", true));
  }

  /**
   * A new interview is starting with the difficulties picked in the lobby.
   * `record`: a test-mode session, saved to hotseat/logs/ when it ends.
   * `llm`: mode and Orchestrator provider from the LLM check that let this interview start.
   */
  reset(sessionId: string, difficulties: Difficulty[], record = false, llm = emptyState().llm): void {
    this.stopMeters();
    this.record = record;
    this.state = { ...emptyState(), sessionId, startedAt: Date.now(), difficulties, llm };
    this.reportEvents = [];
    this.panelMs = 0;
    this.panelSince = null;
    this.say("Interview started");
    this.say(`Mode: ${modeLabel(llm.test)} · Orchestrator on ${llm.provider ?? "unknown"}`);
    // The follow-up difficulty is logged with the panel's names once the settings arrive (interview_settings).
    this.startMeters();
  }

  /** The panel with this interview's names (the prep room's settings). */
  private get people() {
    return peopleFor(this.state.settings);
  }

  phase(phase: Phase): void {
    this.state.phase = phase;
    this.say(`Stage → ${PHASE_LABELS[phase]}`);
  }

  floor(speaker: Speaker | null): void {
    this.panelFloor(speaker !== null && speaker !== "candidate");
    this.state.floor = speaker;
    for (const s of INTERVIEWERS) {
      const seat = this.state.seats[s];
      if (speaker === "candidate") {
        seat.status = "listening";
      } else if (seat.status === "speaking" && s !== speaker) {
        seat.status = "idle";
      }
    }
    if (speaker === "moderator") this.state.seats.moderator.status = "speaking";
    this.say(`Speaker → ${speaker ? this.people[speaker].name : "nobody"}`);
  }

  turn(turn: Turn): void {
    this.state.memory = [...this.state.memory, turn];
    if (turn.speaker === "candidate") this.state.candidateLive = "";
    this.publish();
  }

  /** A line already in the log was rewritten (cut to the part heard). */
  turnUpdate(turn: Turn): void {
    this.state.memory = this.state.memory.map((t) => (t.id === turn.id ? turn : t));
    this.publish();
  }

  candidateLive(text: string): void {
    this.state.candidateLive = text;
    this.publish();
  }

  error(message: string): void {
    this.say(`Error: ${message}`, true);
  }

  debug(e: DebugEvent): void {
    const { seats } = this.state;
    if (REPORT_EVENTS.has(e.type)) this.reportEvents.push(reportEvent(e));
    switch (e.type) {
      case "interview_settings": {
        const { settings } = e;
        this.state.settings = settings;
        this.say(
          `Panel: ${SEATS.map((seat) => `${settings.seats[seat].name} (${this.people[seat].role}, voice ${voiceLabel(settings.seats[seat].voice)})`).join(", ")}` +
            ` · language ${settings.language} · role ${settings.role}${settings.company ? ` at ${settings.company}` : ""}`,
        );
        this.say(
          `Follow-up difficulty: ${this.state.difficulties.map((d, i) => `${ASKERS[i] ? this.people[ASKERS[i].speaker].name : `asker ${i + 1}`} ${d}`).join(", ")}`,
        );
        break;
      }
      case "realtime_connected":
        this.say(
          `Realtime connected in ${e.ms} ms; ${this.people.moderator.name} speaks in voice ${voiceLabel(e.voice)}`,
        );
        break;
      case "voice_refused":
        this.say(
          e.fallback
            ? `Realtime refused ${this.people.moderator.name}'s voice ${voiceLabel(e.voice)} (${e.error}); using ${e.fallback} instead, for Realtime and the moderator's fixed lines`
            : `Realtime could not check ${this.people.moderator.name}'s voice ${voiceLabel(e.voice)} just now (${e.error}); trying it again in 2 s (retry ${e.retry ?? 1})`,
          true,
        );
        break;
      case "prepared": {
        const ready = [
          e.interview ? "interview row created" : "interview row NOT created",
          `${e.lines.done} of ${e.lines.total} fixed lines and backup questions`,
          ...(e.videos.total ? [`${e.videos.done} of ${e.videos.total} avatar videos`] : []),
          e.realtime ? "Realtime connected" : "Realtime NOT connected yet",
          e.vad ? "VAD loaded" : "VAD not loaded yet",
        ].join(", ");
        this.say(
          e.timedOut
            ? `Prepare step: cap reached after ${e.ms} ms; ready: ${ready}. The rest keeps loading in the background`
            : `Prepare step done in ${e.ms} ms: ${ready}`,
          e.timedOut || !e.interview || !e.realtime,
        );
        break;
      }
      case "interview_created":
        this.state.interviewId = e.interviewId;
        this.say(`Interview #${e.interviewId} created in the database`);
        break;
      case "company_pronunciation":
        this.say(
          e.source === "llm"
            ? e.say === e.company
              ? `Company "${e.company}" is read right as written (deepseek-flash, ${e.ms} ms)`
              : `Company "${e.company}" is said as "${e.say}" in TTS and the opening (deepseek-flash, ${e.ms} ms)`
            : `Company "${e.company}" kept as typed: no pronunciation in time (${e.error ?? "error"}, ${e.ms} ms)`,
          e.source !== "llm",
        );
        break;
      case "opening_prepared":
        this.say(
          e.lost
            ? `${this.people.moderator.name}'s opening could not be made ahead (connection lost after ${e.ms} ms); it is said live at the start`
            : e.complete
              ? `${this.people.moderator.name}'s opening made ahead on the waiting screen in ${e.ms} ms, from: ${e.task}`
              : `${this.people.moderator.name}'s opening still being made after ${e.ms} ms; the rest streams in while it plays. From: ${e.task}`,
          e.lost,
        );
        break;
      case "moderator_start":
        seats.moderator = { ...seats.moderator, status: "speaking", line: "…", note: e.task };
        this.say(`${this.people.moderator.name} (moderator) is told what to say: ${e.task}`);
        break;
      case "moderator_transcript":
        seats.moderator.line = e.text;
        this.say(`${this.people.moderator.name}'s full line arrived (text comes before the audio ends)`);
        break;
      case "question_start":
        seats[e.speaker] = {
          ...seats[e.speaker],
          status: "thinking",
          note: `Orchestrator round ${e.round} · ${e.difficulty} · ${e.mode}${e.early ? " · asked at the pause" : ""}${e.ahead ? " · written ahead" : ""}`,
        };
        this.state.questions = [
          ...this.state.questions,
          {
            round: e.round,
            mode: e.mode,
            difficulty: e.difficulty,
            speaker: e.speaker,
            startedAt: Date.now(),
            ms: null,
            result: null,
          },
        ];
        this.say(
          `Orchestrator writing the round ${e.round} question for ${this.people[e.speaker].name} (${e.difficulty}, ${e.mode} mode${e.early ? ", asked at the pause" : ""}${e.ahead ? ", written ahead while the candidate answers" : ""})`,
        );
        break;
      case "question_done": {
        const call = this.state.questions.find((c) => c.round === e.round && c.ms === null);
        if (call) Object.assign(call, { ms: e.ms, result: e.result });
        seats[e.result.speaker].emotion = e.result.emotion;
        this.say(
          `Orchestrator: round ${e.round} question ready in ${e.ms} ms on ${e.result.provider ?? "unknown"}; ` +
            `last answer ${e.result.assessment ?? "not judged"} → emotion <${e.result.emotion}>`,
        );
        // TEST=true must never leave DeepSeek; flag it loudly if it ever does.
        if (this.state.llm.test && !e.result.provider?.startsWith("deepseek")) {
          this.error(`TEST=true, but round ${e.round} was answered by ${e.result.provider ?? "an unknown model"}`);
        }
        break;
      }
      case "question_backup": {
        const call = this.state.questions.find((c) => c.round === e.round && c.ms === null);
        if (call) Object.assign(call, { ms: e.ms, result: { ...e.result, provider: "backup question" } });
        this.say(`Orchestrator: round ${e.round} gave no question (${e.reason}); asking the backup question`, true);
        break;
      }
      case "tts_failed":
        this.say(
          `TTS failed for ${this.people[e.speaker].name}'s question (${e.reason}); Realtime reads it instead`,
          true,
        );
        break;
      case "line":
        seats[e.speaker] = { ...seats[e.speaker], status: "speaking", line: e.text, note: "fixed line (cached TTS)" };
        this.say(`${this.people[e.speaker].name} says a fixed line${e.emotion ? ` <${e.emotion}>` : ""}: "${e.text}"`);
        break;
      case "line_failed":
        this.say(`Fixed line skipped, no audio for ${this.people[e.speaker].name}: "${e.text}" (${e.error})`, true);
        break;
      case "lines_loaded":
        this.say(
          `Fixed lines and backup questions ready: ${e.count - e.failed} of ${e.count} in ${e.ms} ms` +
            (e.failed ? `; ${e.failed} failed and will be retried when used` : ""),
          e.failed > 0,
        );
        break;
      case "cameras":
        this.say(
          !e.enabled
            ? "Avatar off: AVATAR=true is not set in the server's .env (restart the server after setting it)"
            : e.on.length
              ? `Avatar on: ${e.on.map((p) => this.people[p].name).join(" and ")} speak as video`
              : "Avatar on, but no TTS panelist has a portrait (preset voices): voices only",
          !e.enabled,
        );
        break;
      case "avatar_lines_loaded":
        this.say(
          `Avatar videos of the fixed lines ready: ${e.count - e.failed} of ${e.count} in ${e.ms} ms` +
            (e.failed ? `; ${e.failed} failed, and those lines are said as audio` : ""),
          e.failed > 0,
        );
        break;
      case "avatar_line":
        seats[e.speaker] = { ...seats[e.speaker], status: "speaking", line: e.text, note: "fixed line (avatar video)" };
        this.say(`${this.people[e.speaker].name} says a fixed line as video${e.log ? ` (logs/avatar/${e.log})` : ""}`);
        break;
      case "avatar_start":
        seats[e.speaker] = { ...seats[e.speaker], status: "synthesizing", emotion: e.emotion, line: e.text };
        this.say(`Avatar video requested for ${this.people[e.speaker].name}'s question, emotion <${e.emotion}>`);
        break;
      case "avatar_bytes":
        this.say(`${this.people[e.speaker].name}'s first video bytes arrived ${e.ms} ms after the request`);
        break;
      case "avatar_frame":
        seats[e.speaker] = { ...seats[e.speaker], status: "speaking", note: "question (avatar video)" };
        this.say(`${this.people[e.speaker].name}'s face started moving ${e.ms} ms after the request (${e.codecs})`);
        break;
      case "avatar_received":
        this.say(
          `All of ${this.people[e.speaker].name}'s video received: ${e.seconds.toFixed(1)} s, ${Math.round(e.bytes / 1024)} KB` +
            (e.log ? ` (logs/avatar/${e.log})` : ""),
        );
        break;
      case "avatar_broken":
        this.say(`${this.people[e.speaker].name}'s avatar video broke off: ${e.reason}`, true);
        break;
      case "camera_off":
        this.say(
          `${this.people[e.speaker].name}'s camera is off for the rest of the interview (voice only): ${e.reason}`,
          true,
        );
        break;
      case "tts_start":
        seats[e.speaker] = { ...seats[e.speaker], status: "synthesizing", emotion: e.emotion, line: e.text };
        this.state.tts = {
          speaker: e.speaker,
          text: e.text,
          emotion: e.emotion,
          startedAt: Date.now(),
          firstByteMs: null,
          bytes: 0,
          received: false,
        };
        this.say(`TTS request for ${this.people[e.speaker].name}, emotion <${e.emotion}>`);
        break;
      case "tts_chunk": {
        const tts = this.state.tts;
        if (!tts) break;
        if (tts.firstByteMs === null) {
          tts.firstByteMs = Date.now() - tts.startedAt;
          seats[tts.speaker].status = "speaking";
          this.say(`${this.people[tts.speaker].name}'s first audio arrived after ${tts.firstByteMs} ms`);
        }
        tts.bytes += e.bytes;
        break;
      }
      case "tts_received":
        if (this.state.tts) {
          this.state.tts.received = true;
          const seconds = this.state.tts.bytes / 2 / AUDIO_RATE;
          this.say(
            `All of ${this.people[this.state.tts.speaker].name}'s audio received: ${seconds.toFixed(1)} s` +
              (e.file ? ` · saved to logs/tts/${e.file}` : ""),
          );
        }
        break;
      case "script":
        this.say(`Simulated candidate: ${e.text}`);
        break;
      case "transcription":
        this.say(`Transcription: ${e.text}`);
        break;
      case "script_started": {
        const { project, length, text } = e;
        this.state.scripts = [...this.state.scripts, { project, length, text, startedAt: Date.now() }];
        break;
      }
      case "turn_mode":
        this.state.turn.manual = e.manual;
        this.say(`Turn detection: ${e.note}`);
        break;
      case "turn_listen":
        this.state.turn = { ...this.state.turn, talking: false, quietSince: Date.now() - e.silentMs };
        this.say("Turn detection: listening for the answer");
        break;
      case "turn_speech":
        this.state.turn = { ...this.state.turn, talking: true, quietSince: null };
        this.say("Turn detection: candidate talking");
        break;
      case "turn_pause":
        this.state.turn = { ...this.state.turn, talking: false, quietSince: Date.now() - e.ms };
        this.say(`Turn detection: silent for ${e.ms} ms, checking whether the answer is finished`);
        break;
      case "turn_empty":
        this.say("Turn detection: nothing was transcribed in that pause (a noise?); still waiting");
        break;
      case "turn_check": {
        const { type: _type, ...check } = e;
        this.state.turn = { ...this.state.turn, checks: [...this.state.turn.checks, { t: Date.now(), ...check }] };
        const via = e.source === "deepseek" ? "deepseek-flash" : `the fallback rule (${e.reason ?? "no reason"})`;
        this.say(
          `Turn detection: ${e.finished ? "finished" : "not finished"} by ${via} in ${e.ms} ms` +
            (e.stale ? "; ignored, the candidate spoke again" : ""),
        );
        break;
      }
      case "turn_end":
        this.state.turn = { ...this.state.turn, talking: false, quietSince: null };
        this.say(`Answer ended: ${e.reason}`);
        break;
      case "clarify":
        this.say(
          e.taken
            ? `Intent: clarification request number ${e.count}, over the limit of 2`
            : `Intent: clarification request (${e.count} of 2); ${this.people.moderator.name} explains the question`,
        );
        break;
      case "intent":
        this.say(
          `Intent: ${e.intent}${e.by ? ` by ${e.by}` : ""}${e.text ? ` ("${e.text.length > 80 ? `${e.text.slice(0, 80)}…` : e.text}")` : ""}`,
        );
        break;
      case "silence_prompt":
        this.say(`Silent for ${e.seconds} s: "${e.text}"`);
        break;
      case "interview_length":
        this.say(`Interview length: ${e.minutes} min; the moderator closes after the first answer that ends past it`);
        break;
      case "time_up":
        this.say(
          `Interview length (${e.minutes} min) reached after ${(e.elapsedMs / 60_000).toFixed(1)} min: the moderator closes now`,
        );
        break;
      case "time_buyer_again":
        this.say(`Second Time Buyer: ${e.reason}`);
        break;
      case "unanswered":
        this.say(`Marked unanswered: ${e.reason}`);
        break;
      case "connection_lost":
        this.say(
          `Realtime connection lost (code ${e.code}${e.reason ? `, ${e.reason}` : ""}); the call is paused. ` +
            `Once it is back: ${RESUME_LABELS[e.resume]}`,
          true,
        );
        break;
      case "reconnect_attempt":
        this.say(`Reconnecting to Realtime: attempt ${e.attempt}`);
        break;
      case "reconnect_failed":
        this.say(`Reconnect attempt ${e.attempt} failed (${e.error}); next try in ${e.retryInMs / 1000} s`, true);
        break;
      case "reconnected":
        this.say(`Realtime reconnected after ${e.attempts} attempt(s), ${(e.ms / 1000).toFixed(1)} s offline`);
        break;
      case "resume":
        this.say(`Resuming the interview: ${RESUME_LABELS[e.case]}`);
        break;
      case "barge_mode":
        this.say(
          e.on
            ? "Barge-in on (headphones): the candidate may cut in while the panel speaks"
            : "Barge-in off (no headphones): the panel is not listened to while it speaks",
        );
        break;
      case "barge_duck":
        this.say(`Barge-in: voice for ${e.ms} ms during ${FLOOR_LABELS[e.what]}; panel volume lowered to 80%`);
        break;
      case "barge_none":
        // Only worth a line when there was some voice: it shows why it was not taken as a cut-in.
        if (e.voicedMs > 0 || e.peak >= 0.1)
          this.say(
            `Barge-in: none during ${FLOOR_LABELS[e.what]}; the VAD heard ${e.voicedMs} ms of voice in all ` +
              `(highest speech probability ${e.peak.toFixed(2)}; 0.2 s in a row lowers the volume)`,
          );
        break;
      case "barge_release":
        this.say(
          `Barge-in: voice ended after ${e.ms} ms with no real word ` +
            `(${e.words.length ? `recognizer heard "${e.words.join(" ")}"` : "recognizer heard nothing"}); volume restored`,
        );
        break;
      case "barge_in":
        this.say(
          `Barge-in confirmed ${e.ms} ms after the voice started ` +
            `(${e.by === "word" ? `real word "${e.word}"` : "voice still going, no real word from the recognizer"}): ` +
            `${FLOOR_LABELS[e.what]} stopped, the candidate's turn`,
        );
        break;
      case "question_dropped": {
        const call = this.state.questions.find((c) => c.round === e.round && c.ms === null);
        if (call) call.ms = e.ms;
        this.say(`Orchestrator: round ${e.round} question dropped; the candidate is adding to the answer`);
        break;
      }
      case "turn_cut":
        this.say(`Log: ${this.people[e.speaker].name}'s line cut to what was heard: "${e.text}"`);
        break;
    }
    this.publish();
  }

  /** The candidate hung up or the panel closed: keep the record, stop polling. */
  ended(reason: string, unloading = false): void {
    if (this.state.startedAt === null || this.state.endedAt !== null) return;
    this.state.endedAt = Date.now();
    this.state.endReason = reason;
    // Nobody is talking or listening any more; lines and emotions stay as the record.
    this.panelFloor(false);
    this.state.floor = null;
    for (const s of INTERVIEWERS) this.state.seats[s].status = "idle";
    this.state.candidateLive = "";
    this.state.turn = { ...this.state.turn, talking: false, quietSince: null };
    this.stopMeters();
    this.state.meters = { panel: 0, mic: 0, played: 0, total: 0, complete: true };
    this.say(reason);
    if (this.record) this.saveLog(unloading);
  }

  /** Test mode: POST the final record; the server writes it to hotseat/logs/. */
  private saveLog(unloading: boolean): void {
    const body = JSON.stringify(this.state);
    // A closing page cannot finish a normal request; a beacon (≤64 KB) still goes out.
    if (unloading) {
      navigator.sendBeacon("/api/test-logs", new Blob([body], { type: "application/json" }));
      return;
    }
    fetch("/api/test-logs", { method: "POST", headers: { "Content-Type": "application/json" }, body }).catch(
      () => undefined,
    );
  }

  /**
   * What the post-interview report needs from this interview that only the browser
   * recorded: its row id, the Orchestrator's calls (each question and the live
   * judgment of the answer before it) and the turn events. Null before the row exists.
   */
  reportInput(): {
    interviewId: number;
    questions: ReportQuestion[];
    events: ReportEvent[];
    panelMs: number;
    startedAt: number | null;
    endedAt: number | null;
  } | null {
    const { interviewId, questions, startedAt, endedAt } = this.state;
    if (interviewId === null) return null;
    return {
      interviewId,
      panelMs: this.panelMs + (this.panelSince === null ? 0 : Date.now() - this.panelSince),
      startedAt,
      endedAt,
      questions: questions.map(({ round, difficulty, speaker, result }) => ({
        round,
        difficulty,
        speaker,
        result: result && { question: result.question, assessment: result.assessment, reason: result.reason },
      })),
      events: this.reportEvents,
    };
  }

  /** Add up the time an interviewer holds the floor: `on` when one starts, off when the floor passes on. */
  private panelFloor(on: boolean): void {
    const now = Date.now();
    if (this.panelSince !== null && !on) {
      this.panelMs += now - this.panelSince;
      this.panelSince = null;
    } else if (this.panelSince === null && on) {
      this.panelSince = now;
    }
  }

  close(): void {
    this.stopMeters();
    this.channel.close();
  }

  private say(text: string, error = false): void {
    this.state.log = [...this.state.log, { t: Date.now(), text, error }].slice(-MAX_LOG);
    this.publish();
  }

  private startMeters(): void {
    this.stopMeters();
    this.timer = window.setInterval(() => {
      this.state.meters = this.meters();
      this.publish();
    }, 150);
  }

  private stopMeters(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private publish(): void {
    const msg: ChannelMessage = { type: "state", state: this.state };
    this.channel.postMessage(msg);
  }
}
