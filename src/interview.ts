import { RingPlayer, heardWords, type Playhead } from "./audio/playback";
import { ModeratorClient, VoiceRefusedError, type PreparedReply } from "./realtime/ModeratorClient";
import { LiveTranscript } from "./audio/liveTranscript";
import { AvatarStage, AvatarUnavailable, type ClipRequest } from "./avatar/AvatarStage";
import {
  ASKERS,
  DEFAULT_DIFFICULTIES,
  DEFAULT_LENGTH,
  difficultyFor,
  roundPlan,
  type Difficulty,
  type Panelist,
  type Speaker,
} from "../shared/panel";
import { TONE, type NextQuestion } from "../shared/questions";
import * as api from "./api";
import type { DebugEvent } from "./inspector/types";
import { SimulatedCandidate, type ScriptState } from "./testmode/SimulatedCandidate";
import {
  clarify,
  endEarly,
  handoffLine,
  missedPartLine,
  openingReply,
  openingTask,
  readAloud,
  resumeLine,
  sayAgainLine,
  substituteQuestion,
  timeBuyerAgainTask,
  timeBuyerTask,
  type Asked,
} from "../corpus/realtime";
import { askerLines, closingLines, openingQuestion } from "../corpus/panelist-lines";
import { backupQuestion, backupQuestions } from "../corpus/backup-questions";
import { videoLines } from "../corpus/avatar-lines";
import { pack } from "../corpus/lang";
import { DEFAULT_SETTINGS, fallbackVoice, peopleFor, portraitFor, type InterviewSettings } from "../shared/settings";
import type { Person } from "../shared/people";
import { LANGUAGES, joinUnits, plainText, spokenUnits, units, type Language } from "../shared/languages";
import { SileroVad } from "./audio/vad";
import { LONG_PAUSE_MS, PAUSE_MS, START as VOICED, TurnDetector } from "./orchestrator/turn";
import { classify, type LastPrompt } from "./orchestrator/intent";
import type { TurnIntent } from "../shared/turn";
import { BargeInDetector, type Confirmed } from "./orchestrator/bargeIn";

/**
 * Backup: VITE_MANUAL_TURNS=true in .env turns turn detection off; the candidate
 * then ends each answer with Done answering. Also used if the VAD fails to load.
 */
export const MANUAL_TURNS = import.meta.env.VITE_MANUAL_TURNS === "true";
/**
 * After a "not finished" verdict, wait this long for more before taking the answer anyway.
 * 3 s until 2026-10-22: an introduction whose last segment came out as "I also help."
 * then took 4.6 s from the candidate's last word to the handoff line.
 */
const MORE_MS = 2000;
/**
 * The same after the candidate cut into the handoff to add to an answer: only a
 * deepseek-flash "finished" ends it at a pause (doc/orchestrator.zh.md 3.3); this
 * long a silence still ends it, so a candidate who stopped is not left waiting.
 */
const ADDED_MORE_MS = 6000;
/** The panel's volume while the candidate may be cutting in (doc/orchestrator.zh.md 3.3). */
const DUCK_VOLUME = 0.8;
/**
 * Candidate silence after a question, in ms, at which the asker says a prompt
 * (corpus/panelist-lines.ts); at the last one the question is marked unanswered.
 * The clock starts when the question has finished playing and stops while a
 * prompt plays, so each gap is counted from the end of the panel's last words:
 * 8 s after the question, then 7, 10 and 10 s after each prompt.
 * 4 / 10 / 15 / 20 s until 2026-10-23: with the prompts' own playing time on top,
 * the 10 s prompt came 12–13 s after the question and the candidate felt rushed.
 */
const SILENCE_STEPS = [8000, 15000, 25000, 35000];
const UNANSWERED_MS = 35000;
/** Realtime explains a question at most this often; a third request marks it unanswered. */
const MAX_CLARIFY = 2;
/**
 * Wait this long for the Orchestrator's question, or until the line covering the
 * wait has been heard if that is later; then ask the round's backup question.
 * 2.5 s sent 3 of 13 real questions to the backup once the answer is judged first
 * (the Orchestrator takes 1.4–2.6 s); 3.5 s leaves about a second after the handoff.
 */
const QUESTION_TIMEOUT_MS = 3500;
/**
 * TTS normally starts within 0.7–1.5 s; no audio by this time counts as failed.
 */
const TTS_FIRST_AUDIO_MS = 2000;
/** A long answer: show a "please wrap up" hint, then have the asker close it. */
const WRAP_HINT_MS = 120_000;
const WRAP_UP_MS = 180_000;
/** Fixed lines synthesized at once while the interview starts. */
const LINE_LOADS = 4;
/** AVATAR=true: fixed-line videos fetched at once; the server renders 2 at a time anyway, 10–25 s each the first time. */
const LINE_VIDEO_LOADS = 2;
/**
 * AVATAR=true: a question's video counts as failed if no frame is ready this long after it
 * was requested; the seat's camera then goes off and the question is said as TTS audio.
 * Avatar took 3.5–6.9 s to the first bytes, plus 2 s of buffering (PR #4, test A6).
 */
const AVATAR_FIRST_FRAME_MS = 12_000;
/**
 * prepare() resolves after this long even if something is still loading; the rest
 * goes on in the background, and start() waits for what it cannot do without. Only a
 * guard against something that never finishes: the waiting screen waits for everything,
 * however long (the user, 2026-10-23: a first render of the avatar videos takes 1–2
 * minutes). 30 s until then. Each avatar render gives up after 2 minutes on the server.
 */
const PREPARE_CAP_MS = 5 * 60_000;
/**
 * How long the waiting screen waits for the opening made ahead (makeOpening): the whole of
 * it took 3.1–3.5 s in tests, and a longer wait is fine (the user, 2026-10-23). Past it the
 * call starts anyway: the opening plays what has come and the rest streams in behind.
 */
const OPENING_AHEAD_WAIT_MS = 8000;
/**
 * Realtime could not check the voice just then (the voices API answered 429; about one
 * new session per 1–1.5 s gets through, for any voice, chloe too): wait this long and
 * try the same voice again, at most VOICE_RETRIES times, before falling back to a preset.
 */
const VOICE_RETRY_MS = 2000;
const VOICE_RETRIES = 3;
/** After a lost connection, wait 1, 2, 4, 5, 5… s before each attempt to reconnect. */
const RECONNECT_FIRST_MS = 1000;
const RECONNECT_MAX_MS = 5000;

/** A transcript's words alone, to compare two transcripts of the same speech. */
const plainWords = plainText;

/**
 * Whether a question asked with the answer up to a pause still fits the whole
 * answer: the same, or with a few words more at the end. The last bit of audio,
 * committed when the answer ends, once added "So this is.", and the question was
 * asked again, holding the handoff back 1.5 s for its judgment.
 */
const sameAnswer = (atPause: string, whole: string, lang: Language) =>
  whole.startsWith(atPause) && units(whole.slice(atPause.length), lang).length <= 4;

/** Resolves with null after `ms`. */
const wait = (ms: number) => new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));

export type Phase = "idle" | "panel" | "candidate" | "thinking" | "reconnecting" | "done";

/**
 * prepare()'s progress: `done` of `total` pieces have finished (or failed), and `stage`
 * is the kind of the piece that just did. The pieces: the interview row (1), each
 * fixed line and backup question, and the Realtime connection (1).
 */
export interface PrepareProgress {
  done: number;
  total: number;
  stage: "interview" | "lines" | "realtime" | "opening" | "videos";
}

/**
 * How the interview picks up once a lost connection is back: the candidate
 * answers the last question again (lost during their answer; the part already
 * said is dropped), the asker asks the current question again (lost while it,
 * or anything else before the candidate's turn, was said), or the next question,
 * not decided yet when the connection was lost, is waited for and asked.
 */
export type ResumeCase = "answerAgain" | "askAgain" | "nextQuestion";

/**
 * What the panel is saying when the candidate may cut in (barge-in on): the
 * handoff line before a question (the candidate adds to their answer), the
 * question (TTS, or Realtime reading it), Realtime's opening, its explanation of
 * a question or its resume line, or a silence prompt / "say that again"; also Realtime's
 * Time Buyer question after the introduction (askTimeBuyer).
 */
export type FloorKind = "handoff" | "question" | "opening" | "timeBuyer" | "clarify" | "resume" | "prompt";

/** A panel line the candidate may cut into, while it plays. */
interface Floor {
  kind: FloorKind;
  /** Realtime is saying it, so cutting it also cancels the reply (ModeratorClient.cut). */
  realtime: boolean;
  /** The line as written to the log, and the row it was saved as; filled in once Realtime's text is in. */
  text: string;
  record: Promise<api.Turn> | null;
  /** Cutting in drops the next question: the candidate is adding to the answer they just gave. */
  addition: boolean;
}

/** The reconnect loop's progress, for the "meeting interrupted" overlay. */
export interface Reconnecting {
  /** Attempts started so far; 0 while waiting for the first. */
  attempt: number;
  /** Why the last attempt failed; "" before the first has failed. */
  error: string;
}

/** A panel seat: the moderator (Realtime, or its voice through TTS for fixed lines) or a TTS panelist. */
type Seat = Exclude<Speaker, "candidate">;

/** A fixed line to load: seat, text, emotion. */
type LineSpec = [Seat, string, string?];

/** A fixed line's key, for its audio and its avatar video. */
const lineKey = (seat: Seat, text: string, emotion?: string) => `${seat}\n${text}\n${emotion ?? ""}`;

/** How an answer ended, apart from the normal way. */
type Ending = "answer" | "unanswered" | "wrapUp";

/** An Orchestrator call for the next question. */
interface QuestionCall {
  round: number;
  /** The unsaved answer it was asked with, if it was asked at a pause. */
  answer?: string;
  started: number;
  abort: AbortController;
  /** The question, or why there is none; never rejects. */
  result: Promise<NextQuestion | Error>;
  /** How long the Orchestrator took (null while waiting). */
  ms: number | null;
  /**
   * Written ahead (askAhead, askTimeBuyer), while another question was answered: it does
   * not depend on the answer being given.
   */
  ahead?: boolean;
}

export interface InterviewCallbacks {
  onTurn: (turn: api.Turn) => void;
  /** A line already in the log was rewritten: a panel line the candidate cut into, to the part heard. */
  onTurnUpdate?: (turn: api.Turn) => void;
  /** Who holds the floor right now. */
  onSpeaker: (speaker: Speaker | null) => void;
  onPhase: (phase: Phase) => void;
  onError: (message: string) => void;
  /** Rough live text of the candidate's answer so far; "" when they are not answering. */
  onCandidateLive?: (text: string) => void;
  /** Candidate microphone loudness (RMS), ~10 times a second; 0 while muted. */
  onMicLevel?: (rms: number) => void;
  /** Test mode: internal steps (Orchestrator question calls, TTS stream) for the inspector window. */
  onDebug?: (event: DebugEvent) => void;
  /** Test mode: the simulated candidate started, paused or finished a script. */
  onScript?: (state: ScriptState | null) => void;
  /** true: the candidate ends answers with Done answering (backup); false: turn detection. */
  onTurnMode?: (manual: boolean) => void;
  /** The answer has run for 2 minutes: show a "please wrap up" hint; false hides it. */
  onWrapHint?: (on: boolean) => void;
  /** Realtime's connection was lost and is being reconnected; null once it is back. */
  onReconnecting?: (state: Reconnecting | null) => void;
  /** AVATAR=true: the TTS panelists on camera now (a seat whose video fails goes off). */
  onCameras?: (on: Panelist[]) => void;
}

/**
 * The interview script: moderator opening, then the two panelists take turns asking
 * follow-ups (ASKERS) until the length chosen in the lobby runs out, then the
 * moderator closing (doc/orchestrator.zh.md). Turn detection ends each answer:
 * Silero VAD finds a pause, deepseek-flash judges whether the answer is finished
 * (Done answering is the backup, MANUAL_TURNS). A finished turn is classified
 * first (src/orchestrator/intent.ts): only an answer or an unanswered question
 * moves the script on. Fixed lines are TTS audio loaded when the interview starts.
 */
export class Interview {
  private readonly player = new RingPlayer();
  private readonly moderator: ModeratorClient;
  private readonly live: LiveTranscript;
  /** The browser recognizer's words since it started; the caption shows those from captionFrom on. */
  private liveWords: string[] = [];
  private captionFrom = 0;
  private readonly barge: BargeInDetector;
  /** The panel line playing now that the candidate may cut into; null when none (or barge-in is off). */
  private floor: Floor | null = null;
  /**
   * The candidate cut into the handoff and is adding to their answer: until it
   * is taken, pauses are 1 s and only deepseek-flash ends it; the moderator's
   * handoff then thanks them for adding it.
   */
  private added = false;
  private micMuted = false;
  /** Test mode: a simulated candidate is reading its answer instead of the mic. */
  private scripted = false;
  /** It is the candidate's turn and the answer has not been submitted yet. */
  private answering = false;
  /**
   * The call was left (hang-up or rejoin). A step already running, e.g. a question
   * call, must not go on to buy TTS or reopen the candidate's turn afterwards.
   */
  private stopped = false;
  private interviewId = 0;
  private round = 0;
  /** What the candidate is answering, for the "finished?" check and Realtime's explanation. */
  private asked: Asked;
  /** Realtime's opening (or its reply to a cut-in) was cut into: a short remark next gets a reply. */
  private openingCut = false;
  /** The panel's words heard before the candidate cut in, in this turn ("" if they did not). */
  private cutInto = "";
  /** deepseek-flash's intent at the last pause of this turn and the words it judged; null once the candidate speaks again. */
  private judged: { text: string; intent: TurnIntent | null } | null = null;
  /** The asked question's TTS audio, replayed when the candidate asks to hear it again. */
  private askedAudio: ArrayBuffer | null = null;
  /** The same when the question was said as avatar video. */
  private askedVideo: Blob | null = null;
  /**
   * AVATAR=true: the TTS panelists' talking heads (adapted from Junwei's PR #4). Each
   * seat speaks as video only while it is on camera (see cameras).
   */
  readonly avatar = new AvatarStage(() => this.player.audioContext());
  /**
   * The TTS panelists on camera: AVATAR=true and the seat's voice has a portrait. A seat
   * whose video fails goes off for the rest of the interview and speaks as audio, like
   * an interviewer whose camera broke (the user, 2026-10-23).
   */
  private cameras = new Set<Panelist>();
  /** Fixed lines' videos by lineKey, each fetched once; and those already in, to play with no wait. */
  private readonly lineVideos = new Map<string, Promise<{ video: Blob; log: string | null }>>();
  private readonly readyVideos = new Map<string, { video: Blob; log: string | null }>();
  /** How many times Realtime has explained the current question. */
  private clarifications = 0;
  /** The silence prompt said last, so a following yes / no is read as its answer. */
  private lastPrompt: LastPrompt = 0;
  /** Every question the candidate could not answer so far: the Orchestrator must not come back to any of them. */
  private readonly skipped: string[] = [];
  /** Fixed lines' audio by seat and text, each fetched once. */
  private readonly lines = new Map<string, Promise<ArrayBuffer>>();
  private manual = MANUAL_TURNS;
  private vad: SileroVad | null = null;
  private readonly turn: TurnDetector;
  /** Bumped whenever a pending "finished?" check or timer must be ignored (see doc/orchestrator.zh.md 7.1). */
  private turnGen = 0;
  private turnTimer: number | null = null;
  /** The VAD has heard real speech in this turn; until then the silence clock runs. */
  private heard = false;
  /** Candidate silence counted so far in this turn, and since when it is running (null: paused). */
  private silenceMs = 0;
  private silenceSince: number | null = null;
  /** After a yes / no to a prompt the clock restarts without the first (8 s) prompt. */
  private skipFirstPrompt = false;
  private silenceTimer: number | null = null;
  /** The 120 s hint and the 180 s wrap-up of a long answer. */
  private answerTimers: number[] = [];
  /** The next question, asked at the candidate's last pause with the answer so far. */
  private early: QuestionCall | null = null;
  /**
   * The next round's question, written ahead while the current one is said and answered
   * (askAhead), or round 1's while the Time Buyer is (askTimeBuyer).
   */
  private ahead: QuestionCall | null = null;
  /** The question just left unanswered, for the next question written ahead: the same asker's. */
  private aheadUnanswered: string | undefined;
  /** Realtime has asked the Time Buyer after the introduction (askTimeBuyer). */
  private timeBought = false;
  /** The project introduction, for a second Time Buyer (askTimeBuyerAgain). */
  private introduction = "";
  /** The first Time Buyer's words once a second one is asked (askTimeBuyerAgain); never twice more. */
  private timeBuyerFirst: string | undefined;
  /** Round `round`'s question written ahead, and whether its avatar video has finished rendering (or failed). */
  private aheadVideo: { round: number; settled: boolean } | null = null;
  /**
   * The Time Buyer's words, for every question written after it ("" while it is being asked,
   * when round 1 is written): never asked again. Undefined if there was none.
   */
  private timeBuyerQuestion: string | undefined;
  private vadReady: Promise<void> = Promise.resolve();
  /** Realtime's connection is lost: the call is paused while reconnect() runs. */
  private offline = false;
  /** Bumped when the connection is lost: steps started before then stop at their next check (halted). */
  private epoch = 0;
  /** How to pick the interview up if the connection is lost now. */
  private resumeAt: ResumeCase = "askAgain";
  /** The current round's question call until its question is decided; it outlives a lost connection. */
  private roundCall: QuestionCall | null = null;
  /** The question decided for this round, until it has been heard in full; asked again after a lost connection. */
  private unheard: { q: NextQuestion; backup: boolean } | null = null;
  /** The TTS stream of the question being said, cut when the connection is lost. */
  private tts: AbortController | null = null;
  /** The closing has started: a lost connection no longer matters. */
  private closing = false;
  /** When start() ran, for the interview length chosen in the lobby. */
  private startedAt = 0;
  /** This interview's prep-room settings; the moderator's voice changes if Realtime refuses it. */
  private readonly settings: InterviewSettings;
  /** The interview language (settings.language). */
  private readonly lang: Language;
  /** The panel with this interview's names. */
  private readonly people: Record<Speaker, Person>;
  /** prepare(), once started; start() runs it if the UI did not. */
  private prepared: Promise<void> | null = null;
  /** The interview row's id, once created (prepare). */
  private created: Promise<number> | null = null;
  /** Realtime connected (prepare); replaced if the connection drops before the opening. */
  private connected: Promise<void> = Promise.resolve();
  /** The opening made on the waiting screen (makeOpening), until start() plays it. */
  private openingAhead: PreparedReply | null = null;
  /** start() has begun the opening: from then on a lost connection pauses the call. */
  private begun = false;
  /** Test mode: reads a sample answer from corpus/candidate-scripts/ in the candidate's place. */
  readonly candidateScript: SimulatedCandidate;

  constructor(
    private readonly cb: InterviewCallbacks,
    /** Difficulty of each round's follow-up, chosen in the lobby. */
    private readonly difficulties: Difficulty[] = DEFAULT_DIFFICULTIES,
    /**
     * "I'm wearing headphones" was ticked: the candidate may cut into the panel.
     * Off, the panel is not listened to while it speaks: through speakers its own
     * voice would cut it off.
     */
    private readonly bargeInOn = false,
    /**
     * Interview length in minutes, chosen in the lobby. Past it the moderator
     * closes once the candidate finishes the current answer; nobody is cut off.
     */
    private readonly lengthMin = DEFAULT_LENGTH,
    /**
     * The prep room's settings (shared/settings.ts): the interview language (what is
     * heard, said and asked, and every instruction to Realtime and the LLMs, is in it),
     * the role and company, and each seat's voice and name.
     */
    settings: InterviewSettings = DEFAULT_SETTINGS,
    /** The prep room's résumé text, stored with the interview for the post-interview report only. */
    private readonly resumeText?: string,
  ) {
    this.settings = { ...settings, seats: { ...settings.seats } };
    const lang = settings.language;
    this.lang = lang;
    this.people = peopleFor(settings);
    this.asked = { speaker: "moderator", question: openingQuestion(lang) };
    this.turn = new TurnDetector({ speech: () => this.onSpeech(), pause: () => void this.onPause() });
    this.barge = new BargeInDetector(
      {
        duck: (ms) => {
          if (!this.floor) return;
          this.setPanelVolume(DUCK_VOLUME);
          cb.onDebug?.({ type: "barge_duck", what: this.floor.kind, ms });
        },
        release: (ms, words) => {
          this.setPanelVolume(1);
          if (this.floor) cb.onDebug?.({ type: "barge_release", what: this.floor.kind, ms, words });
        },
        confirm: (how) => this.bargeIn(how),
      },
      lang,
    );
    this.moderator = new ModeratorClient(
      this.player,
      cb.onError,
      cb.onMicLevel,
      (text) => cb.onDebug?.({ type: "transcription", text }),
      (pcm) => this.vad?.push(pcm),
      (code, reason) => this.onLost(code, reason),
      (pcm) => api.transcribeWhisper(pcm, lang),
      lang,
      settings.seats.moderator.voice,
    );
    this.live = new LiveTranscript((text) => {
      this.liveWords = text.split(/\s+/).filter(Boolean);
      this.barge.heard(this.liveWords);
      // While the panel speaks the recognizer only listens for a cut-in; the caption is the answer's.
      if (!this.answering && text) return;
      // While a script is read, the caption follows the script instead.
      if (!this.scripted) cb.onCandidateLive?.(this.micMuted ? "" : this.liveWords.slice(this.captionFrom).join(" "));
    }, LANGUAGES[lang].browser);
    this.candidateScript = new SimulatedCandidate({
      sendAudio: (base64) => this.moderator.appendCandidateAudio(base64),
      setActive: (active) => {
        this.scripted = active;
        this.moderator.setScripted(active);
      },
      level: (rms) => cb.onMicLevel?.(rms),
      caption: (text) => cb.onCandidateLive?.(text),
      finished: () => void this.finishAnswer("the simulated candidate's script ended (auto-submit)"),
      changed: (state) => cb.onScript?.(state),
      log: (text) => cb.onDebug?.({ type: "script", text }),
      started: (script) => cb.onDebug?.({ type: "script_started", ...script }),
    });
  }

  /** Loudness of the panel audio playing right now, for the speaking ring (an avatar video's, while one plays). */
  panelLevel(): number {
    return this.avatar.active ? this.avatar.level() : this.player.level();
  }

  /** Where the panel line playing now has got, for the captions. */
  panelPlayhead(): Playhead {
    return this.avatar.active ? this.avatar.playhead() : this.player.playhead();
  }

  /** The panel's volume, audio and avatar video alike (lowered while the candidate may be cutting in). */
  private setPanelVolume(volume: number): void {
    this.player.setVolume(volume);
    this.avatar.setVolume(volume);
  }

  setMicMuted(muted: boolean): void {
    this.micMuted = muted;
    this.moderator.setMuted(muted);
  }

  /**
   * Everything the interview needs before it starts, while the prep room's waiting
   * screen shows: the interview row with the settings, the VAD, every fixed line and
   * backup question in this interview's voices and language, and Realtime (with a
   * preset voice if it refuses the moderator's, connectRealtime). Resolves once all of
   * it is ready or after PREPARE_CAP_MS, whichever is first; the rest keeps loading in
   * the background. Rejects when the interview row or Realtime failed before the cap
   * (the server refused the settings, Realtime refused every voice), so the waiting
   * screen shows the error instead of a call that never starts. `onProgress` is called
   * after each piece. Called again, it returns the same promise. Best called from a
   * click handler, so the browser lets audio start.
   */
  prepare(onProgress?: (p: PrepareProgress) => void): Promise<void> {
    this.prepared ??= this.runPrepare(onProgress);
    return this.prepared;
  }

  private async runPrepare(onProgress?: (p: PrepareProgress) => void): Promise<void> {
    const started = performance.now();
    void this.player.resume().catch(() => undefined);
    this.cb.onDebug?.({ type: "interview_settings", settings: this.settings });
    const lines = this.wantedLines();
    // Grows by the on-camera seats' videos once the server says whether the avatar is on.
    let total = lines.length + 3;
    let done = 0;
    const ready = { interview: false, realtime: false, vad: false, lines: 0, videos: 0, videoTotal: 0 };
    const progress = (stage: PrepareProgress["stage"]) => onProgress?.({ done: ++done, total, stage });

    this.created = api
      .createInterview(this.settings, this.resumeText)
      .then(({ id, settings, pronunciation, avatar }) => {
        this.interviewId = id;
        if (avatar) this.startCameras();
        else this.cb.onDebug?.({ type: "cameras", on: [], enabled: false });
        // How the company name should sound (server/pronounce.ts), for the opening.
        this.settings.companySay = settings.companySay;
        ready.interview = true;
        this.cb.onDebug?.({ type: "interview_created", interviewId: id });
        if (pronunciation) this.cb.onDebug?.({ type: "company_pronunciation", ...pronunciation });
        return id;
      });
    this.created.then(
      () => progress("interview"),
      () => progress("interview"),
    );
    this.vadReady = this.loadVad().then(() => void (ready.vad = true));
    this.connected = this.connectRealtime().then(() => void (ready.realtime = true));
    this.connected.then(
      () => progress("realtime"),
      () => progress("realtime"),
    );
    // The lines need the row (the server reads the seats' voices from it).
    const linesLoaded = this.created.then(
      () =>
        this.loadLines(lines, () => {
          ready.lines += 1;
          progress("lines");
        }),
      () => undefined,
    );
    // AVATAR=true: the on-camera seats' fixed-line videos, loaded here like the lines' audio
    // (rendered once ever and kept on the server's disk; then each comes in well under a second).
    const videosLoaded = this.created.then(
      () => {
        if (!this.cameras.size) return;
        ready.videoTotal = this.videoLineSpecs().length;
        total += ready.videoTotal;
        return this.loadLineVideos(() => {
          ready.videos += 1;
          progress("videos");
        });
      },
      () => undefined,
    );
    // The opening, made now by Realtime and kept, so it plays the moment the call starts
    // (2026-10-23, the user's request). It needs the row (the company's pronunciation) and Realtime.
    const openingMade = Promise.all([this.created, this.connected]).then(
      () => this.makeOpening().then(() => progress("opening")),
      () => progress("opening"),
    );
    // Why the interview cannot start, if the row or Realtime failed.
    const failures: string[] = [];
    const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));
    this.created.catch((e: unknown) => failures.push(`could not create the interview: ${reason(e)}`));
    this.connected.catch((e: unknown) => failures.push(`could not connect to Realtime: ${reason(e)}`));
    const all = Promise.allSettled([
      this.created,
      this.connected,
      this.vadReady,
      linesLoaded,
      videosLoaded,
      openingMade,
    ]).then(() => false);
    let cap = 0;
    const timedOut = await Promise.race([
      all,
      new Promise<boolean>((resolve) => (cap = window.setTimeout(() => resolve(true), PREPARE_CAP_MS))),
    ]);
    window.clearTimeout(cap);
    this.cb.onDebug?.({
      type: "prepared",
      ms: Math.round(performance.now() - started),
      timedOut,
      interview: ready.interview,
      lines: { done: ready.lines, total: lines.length },
      videos: { done: ready.videos, total: ready.videoTotal },
      realtime: ready.realtime,
      vad: ready.vad,
    });
    // 2026-10-23: a refused setting used to leave the call on "Connecting to the panel…" for good.
    if (!timedOut && failures.length) throw new Error(failures.join("; "));
  }

  /**
   * The opening, then the rest of the interview. Runs prepare() first if the UI did not
   * (then it should run inside a click handler, so the browser lets audio start), and
   * waits for what the opening needs: the interview row and Realtime.
   */
  async start(): Promise<void> {
    await this.run(async () => {
      this.cb.onPhase("panel");
      await this.player.resume();
      await this.prepare();
      if (this.stopped) return;
      // Still loading if prepare() hit its cap; a failure is reported (run) and the interview does not start.
      await this.created;
      for (let connected = this.connected; ; connected = this.connected) {
        await connected;
        // Lost and reconnecting before the opening (onLost): wait for the new connection.
        if (connected === this.connected) break;
      }
      if (this.stopped) return;
      this.begun = true;
      this.startedAt = performance.now();
      this.cb.onDebug?.({ type: "interview_length", minutes: this.lengthMin });
      this.cb.onDebug?.({ type: "barge_mode", on: this.bargeInOn });
      // Lost during the opening: the moderator seat asks the opening question after the resume line.
      const epoch = this.epoch;
      // Without the VAD there is no cut-in, so wait for it while Realtime connects.
      if (this.bargeInOn) await this.vadReady;
      // Made on the waiting screen if it could be (makeOpening); otherwise Realtime says it now.
      const ahead = this.openingAhead && !this.openingAhead.lost ? this.openingAhead : null;
      this.openingAhead = null;
      const opening = await this.moderatorSays(this.openingTask(), true, this.floorFor("opening", true), ahead);
      if (this.halted(epoch)) return;
      this.asked = { speaker: "moderator", question: opening };
      this.askedAudio = null;
      this.askedVideo = null;
      await this.vadReady;
      if (this.halted(epoch)) return;
      this.candidateTurn("new");
    });
  }

  /**
   * Connect Realtime with a fresh key, in the moderator's voice (also each reconnect).
   * If Realtime refuses the voice (ModeratorClient voiceRefusal): when it only could not
   * check it just then (busy, the voices API's 429), the same voice is tried again after
   * VOICE_RETRY_MS, up to VOICE_RETRIES times; when the voice is unknown, or still busy
   * after that, the moderator seat falls back to a preset (fallbackVoice), for Realtime
   * and its TTS fixed lines alike, and connects again (with the same retries if busy).
   */
  private async connectRealtime(): Promise<void> {
    const started = performance.now();
    let busyTries = 0;
    for (;;) {
      try {
        const key = await api.fetchToken();
        if (this.stopped) throw new Error("the call was left");
        await this.moderator.connect(key);
        break;
      } catch (e) {
        if (!(e instanceof VoiceRefusedError)) throw e;
        if (e.busy && busyTries < VOICE_RETRIES) {
          busyTries += 1;
          this.cb.onDebug?.({
            type: "voice_refused",
            voice: e.voice,
            fallback: null,
            error: e.message,
            retry: busyTries,
          });
          await wait(VOICE_RETRY_MS);
          continue;
        }
        // The fallback itself refused: nothing left to fall back to.
        if (e.voice === fallbackVoice(this.settings)) throw e;
        await this.useFallbackVoice(e);
        busyTries = 0;
      }
    }
    // Left while the last attempt was connecting.
    if (this.stopped) return void this.moderator.close();
    this.cb.onDebug?.({
      type: "realtime_connected",
      voice: this.moderator.voiceInUse,
      ms: Math.round(performance.now() - started),
    });
  }

  /** Realtime refused the moderator's voice: the seat speaks in a preset from now on, fixed lines included. */
  private async useFallbackVoice(refused: VoiceRefusedError): Promise<void> {
    const fallback = fallbackVoice(this.settings);
    this.cb.onDebug?.({ type: "voice_refused", voice: refused.voice, fallback, error: refused.message });
    this.moderator.setVoice(fallback);
    this.settings.seats.moderator = { ...this.settings.seats.moderator, voice: fallback };
    // The server reads the seat's voice from the row, so the fixed lines follow.
    try {
      if (this.created) await api.setSeatVoice(await this.created, "moderator", fallback);
    } catch (e) {
      console.warn("could not switch the moderator's fixed lines to the fallback voice:", e);
    }
    // Lines already fetched in the refused voice are fetched again (only after a reconnect;
    // while preparing, the moderator's lines wait for Realtime).
    const stale = [...this.lines.keys()].filter((key) => key.startsWith("moderator\n"));
    stale.forEach((key) => this.lines.delete(key));
    if (stale.length) void this.loadLines(this.wantedLines().filter(([seat]) => seat === "moderator"));
  }

  /**
   * The candidate's turn is over; `reason` says how that was decided, for the
   * inspector. `ending`: silent for 35 s (unanswered) or cut at 180 s (wrapUp).
   */
  async finishAnswer(reason = "Done answering pressed", ending: Ending = "answer"): Promise<void> {
    // Turn detection, Done answering, the timers and the script's auto-submit can all land; submit once.
    if (!this.answering) return;
    this.answering = false;
    this.endListening();
    this.cb.onDebug?.({ type: "turn_end", reason });
    this.candidateScript.reset();
    // Until the transcript is in, a lost connection means answering again (resumeAt is still "answerAgain").
    const epoch = this.epoch;
    await this.run(async () => {
      this.cb.onPhase("thinking");
      this.cb.onSpeaker(null);
      this.live.stop();
      const answer = await this.moderator.commitCandidateTurn();
      if (this.halted(epoch)) return;

      if (ending === "unanswered") {
        await this.save("candidate", answer || "(no answer)");
        if (this.halted(epoch)) return;
        this.cb.onDebug?.({ type: "unanswered", reason: `silent for ${UNANSWERED_MS / 1000} s` });
        return this.nextRound(true);
      }
      if (ending === "wrapUp") {
        await this.save("candidate", answer || "(no speech detected)");
        if (this.halted(epoch)) return;
        return this.nextRound(false, {
          seat: this.asked.speaker,
          text: askerLines(this.lang, this.asked.speaker).wrapUp,
        });
      }

      const ruled = classify(answer, this.lastPrompt, this.lang);
      // deepseek-flash decides, judged on these very words (judgedIntent). The rules only
      // stand in without its judgment, and for a yes / no to a silence prompt.
      const byRule = ruled === "empty" || (this.lastPrompt >= 15 && ["wait", "skip"].includes(ruled));
      const judged = byRule ? null : this.judgedIntent(answer);
      this.judged = null;
      const intent = judged ?? ruled;
      const by = judged ? "deepseek-flash" : "rule";
      this.cutInto = "";
      this.lastPrompt = 0;
      this.cb.onDebug?.({ type: "intent", intent, by, text: answer });
      if (intent === "noise") return this.candidateTurn("resume");
      if (intent === "empty") {
        this.resumeAt = "askAgain";
        this.cb.onPhase("panel");
        await this.moderatorSays(readAloud(this.lang, sayAgainLine(this.lang)), true, this.floorFor("prompt", true));
        if (this.halted(epoch)) return;
        return this.candidateTurn("new");
      }
      if (this.moderator.lostSpeech()) {
        // Part of the answer was said but not transcribed: keep the rest, and ask for it again.
        await this.save("candidate", answer);
        if (this.halted(epoch)) return;
        this.resumeAt = "askAgain";
        this.cb.onPhase("panel");
        await this.moderatorSays(readAloud(this.lang, missedPartLine(this.lang)), true, this.floorFor("prompt", true));
        if (this.halted(epoch)) return;
        return this.candidateTurn("new");
      }

      await this.save("candidate", answer);
      if (this.halted(epoch)) return;
      if (this.openingCut) {
        this.openingCut = false;
        // The words of the opening heard before the cut (bargeIn).
        const heard = this.asked.question;
        this.asked = { speaker: "moderator", question: openingQuestion(this.lang) };
        // Whatever the candidate said when cutting into the opening, however long, Realtime answers
        // it and then asks briefly for the project (2026-10-23; until then 30 words or more counted
        // as the introduction itself). Also a request about the opening ("Can you repeat the company
        // name?"): replaying the fixed opening question answered it with a line that has no company,
        // twice in a row (2026-10-23), so Realtime answers from the words it had said.
        if (intent === "answer" || intent === "repeat" || intent === "clarify")
          return this.replyToOpening(answer, heard);
      }
      switch (intent) {
        case "wait":
          return this.candidateTurn("wait");
        case "repeat":
          // The opening, said by Realtime: it answers from its own words (above), not the fixed line.
          if (this.asked.speaker === "moderator" && !this.timeBought)
            return this.replyToOpening(answer, this.asked.question);
          // After cutting into the handoff, the answer to the repeated question is a new one, not an addition.
          this.added = false;
          this.resumeAt = "askAgain";
          await this.repeatQuestion();
          if (this.halted(epoch)) return;
          return this.candidateTurn("new");
        case "clarify": {
          const taken = this.clarifications >= MAX_CLARIFY;
          this.cb.onDebug?.({ type: "clarify", text: answer, count: this.clarifications + 1, taken });
          if (taken) {
            this.cb.onDebug?.({ type: "unanswered", reason: `asked about the question a ${MAX_CLARIFY + 1}rd time` });
            return this.nextRound(true);
          }
          this.clarifications += 1;
          this.added = false;
          this.resumeAt = "askAgain";
          this.cb.onPhase("panel");
          await this.moderatorSays(
            clarify(this.lang, this.asked, answer, this.lengthMin),
            true,
            this.floorFor("clarify", true),
          );
          if (this.halted(epoch)) return;
          return this.candidateTurn("new");
        }
        case "skip":
          this.cb.onDebug?.({ type: "unanswered", reason: "the candidate does not know or asked to skip" });
          return this.nextRound(true);
        case "end":
          this.cb.onPhase("panel");
          return this.closeInterview(closingLines(this.lang).endEarly, endEarly(this.lang, answer));
        default:
          // The project introduction: Realtime asks the Time Buyer while round 1's question is written.
          // Already past the length (2 minutes, a long introduction): nextRound closes instead.
          if (this.round === 0 && !this.timeBought && !this.overTime()) return this.askTimeBuyer(answer);
          // Its answer ended before round 1's video was rendered: one more background question first.
          if (this.round === 0 && this.timeBought && this.timeBuyerFirst === undefined && this.round1VideoPending())
            return this.askTimeBuyerAgain(answer);
          return this.nextRound(false, undefined, this.takeEarly(answer));
      }
    });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.answering = false;
    this.endListening();
    this.dropEarly();
    this.dropAhead();
    this.roundCall?.abort.abort();
    this.roundCall = null;
    await this.candidateScript.close();
    this.live.stop();
    await this.moderator.close();
    // Before the player: the videos' sound runs through the player's AudioContext.
    this.avatar.close();
    await this.player.close();
  }

  /**
   * Move to the next round: after the introduction, an addition or an unanswered
   * question the moderator (Realtime) hands over to the next asker, covering the
   * wait while the Orchestrator writes the question (`cover`, the asker's 180 s
   * wrap-up through TTS, replaces it); past the interview length, close.
   * `early`: the question was already asked at the pause with this answer.
   */
  private async nextRound(
    unanswered: boolean,
    cover?: { seat: Seat; text: string },
    early?: QuestionCall | null,
  ): Promise<void> {
    const epoch = this.epoch;
    this.dropEarly();
    this.round += 1;
    // The length chosen in the lobby is only checked here, between answers, so an answer is never cut off.
    // The panel takes turns until then (2026-10-23; until then three fixed rounds).
    if (this.overTime()) {
      this.closing = true;
      const elapsedMs = Math.round(performance.now() - this.startedAt);
      this.cb.onDebug?.({ type: "time_up", minutes: this.lengthMin, elapsedMs });
      this.cb.onPhase("panel");
      if (cover) await this.sayLine(cover.seat, cover.text);
      return this.closeInterview(closingLines(this.lang).timeUp);
    }
    const round = this.round;
    const { speaker } = roundPlan(round);
    const difficulty = difficultyFor(this.difficulties, round);
    // After the project introduction Realtime asked the Time Buyer (askTimeBuyer); without it
    // (the introduction was skipped) the handoff thanks them for it. After the candidate cut
    // into the handoff to add to the answer, it thanks them for that.
    const after = unanswered
      ? "unanswered"
      : this.added
        ? "addition"
        : round === 1 && !this.timeBought
          ? "introduction"
          : null;
    this.added = false;
    const started = performance.now();
    if (unanswered) this.skipped.push(this.asked.question);
    // The question after this one is the same asker's as the unanswered one: written ahead, it avoids it.
    this.aheadUnanswered = unanswered ? this.asked.question : undefined;
    // Written ahead while the last question was answered (askAhead); else written now.
    const ahead = this.takeAhead(round);
    const call = ahead ?? early ?? this.askQuestion(round, unanswered ? this.asked.question : undefined);
    this.roundCall = call;
    this.resumeAt = "nextQuestion";
    if (!ahead) this.cb.onDebug?.({ type: "question_start", round, mode: "fast", difficulty, speaker, early: !!early });

    // The moderator speaks between rounds only after the introduction, an addition or an
    // unanswered question; otherwise the next asker just asks, after a short pause
    // (2026-10-23: a handoff after every answer sounded stiff).
    // The 180 s wrap-up and the move-on handoff cannot be cut into; the others can (the candidate adds to the answer).
    if (cover) {
      this.cb.onPhase("panel");
      await this.sayLine(cover.seat, cover.text);
    } else if (after) {
      this.cb.onPhase("panel");
      await this.moderatorSays(
        readAloud(this.lang, handoffLine(this.lang, after, this.people[speaker].name)),
        true,
        unanswered ? null : this.floorFor("handoff", true),
      );
    }
    if (this.halted(epoch)) return;
    await this.askRound(call, started);
  }

  /**
   * Wait for the round's question, at most QUESTION_TIMEOUT_MS after `started`
   * (else the round's backup question); the asker says it and the candidate's
   * turn opens.
   */
  private async askRound(call: QuestionCall, started: number): Promise<void> {
    const epoch = this.epoch;
    const { round } = call;
    const { speaker } = roundPlan(round);
    const difficulty = difficultyFor(this.difficulties, round);
    const left = Math.max(0, QUESTION_TIMEOUT_MS - (performance.now() - started));
    const got = await Promise.race([call.result, wait(left)]);
    if (this.halted(epoch)) return;

    const ms = call.ms ?? Math.round(performance.now() - call.started);
    let q: NextQuestion;
    let backup = false;
    if (got && !(got instanceof Error)) {
      q = got;
      this.cb.onDebug?.({ type: "question_done", round, ms, result: q });
    } else {
      call.abort.abort();
      backup = true;
      q = { speaker, question: backupQuestion(this.lang, speaker, difficulty, round), emotion: TONE[speaker] };
      const reason = got ? got.message : `no question within ${QUESTION_TIMEOUT_MS / 1000} s`;
      this.cb.onDebug?.({ type: "question_backup", round, ms, reason, result: q });
    }

    this.roundCall = null;
    this.asked = { speaker: q.speaker, question: q.question };
    this.askedAudio = null;
    this.askedVideo = null;
    this.unheard = { q, backup };
    this.resumeAt = "askAgain";
    this.clarifications = 0;
    this.cb.onPhase("panel");
    this.cb.onSpeaker(q.speaker);
    // The caption shows the question now; start its playhead at 0, not at the last line's end.
    this.player.reset();
    const saved = this.save(q.speaker, q.question);
    // The other asker's next question is written (and rendered) while this one is said and answered.
    void saved.then(
      () => this.askAhead(round + 1, q),
      () => undefined,
    );
    this.moderator.addPanelistLine(pack(this.lang).roles[q.speaker], q.question);
    const audio = await this.speakQuestion(q, backup, saved);
    if (this.halted(epoch)) return;
    this.askedAudio = audio;
    this.unheard = null;
    await saved;
    if (this.halted(epoch)) return;
    this.candidateTurn("new");
  }

  /**
   * Say a panelist's question. A backup question plays from the fixed-line cache
   * (as video if its clip is in and the seat is on camera). Otherwise, on camera, it
   * streams as avatar video; if that never starts, the camera goes off and TTS streams
   * it; on an HTTP error, or no audio within 2 s, the late stream is dropped and
   * Realtime reads the question instead. Resolves with the audio heard, for a repeat
   * (null if Realtime read it, or it was said as video: then askedVideo holds it).
   * `record`: the question's row in the log, cut to the part heard if the candidate cuts in.
   */
  private async speakQuestion(
    q: NextQuestion,
    backup: boolean,
    record: Promise<api.Turn> | null = null,
  ): Promise<ArrayBuffer | null> {
    const epoch = this.epoch;
    const floor = this.floorFor("question", false, q.question, record);
    this.askedVideo = null;
    if (backup) {
      try {
        const audio = await this.line(q.speaker, q.question, q.emotion);
        if (!this.halted(epoch))
          await this.speaking(floor, () => this.playLine(q.speaker, q.question, q.emotion, audio));
        return audio;
      } catch {
        // Not cached: stream it like any question.
      }
    }
    // Written ahead, its video was rendered meanwhile (startAhead): play it whole, with no wait.
    const ready = this.readyVideos.get(lineKey(q.speaker, q.question, q.emotion));
    if (ready && this.cameras.has(q.speaker)) {
      try {
        this.cb.onDebug?.({ type: "avatar_line", speaker: q.speaker, text: q.question, log: ready.log });
        await this.speaking(floor, () => this.avatar.playClip(q.speaker, ready.video));
        this.askedVideo = ready.video;
        return null;
      } catch (e) {
        if (!(e instanceof AvatarUnavailable)) throw e;
        // Nothing was heard: TTS says it below.
        this.cameraOff(q.speaker, e.message);
      }
    }
    if (this.cameras.has(q.speaker)) {
      if (await this.askOnVideo(q, floor)) return null;
      if (this.halted(epoch)) return null;
    }
    const tts = new AbortController();
    this.tts = tts;
    let heard = false;
    const watchdog = window.setTimeout(() => {
      if (!heard) tts.abort(new Error(`no audio within ${TTS_FIRST_AUDIO_MS / 1000} s`));
    }, TTS_FIRST_AUDIO_MS);
    this.cb.onDebug?.({ type: "tts_start", speaker: q.speaker, text: q.question, emotion: q.emotion });
    try {
      return await this.speaking(floor, () =>
        api.speakAsPanelist(
          this.player,
          q,
          (bytes, file) => {
            if (bytes !== null) heard = true;
            this.cb.onDebug?.(bytes === null ? { type: "tts_received", file } : { type: "tts_chunk", bytes });
          },
          tts.signal,
          this.lang,
          this.interviewId,
        ),
      );
    } catch (e) {
      if (this.halted(epoch)) return null;
      const reason = tts.signal.aborted ? String(tts.signal.reason?.message ?? tts.signal.reason) : String(e);
      this.cb.onDebug?.({ type: "tts_failed", speaker: q.speaker, reason });
      // A stream that broke midway may have queued part of the question; drop it.
      await this.player.flush();
      await this.moderatorSays(
        readAloud(this.lang, substituteQuestion(this.lang, q.speaker, q.question)),
        false,
        this.floorFor("question", true, q.question, record),
      );
      return null;
    } finally {
      window.clearTimeout(watchdog);
      if (this.tts === tts) this.tts = null;
    }
  }

  /**
   * The candidate spoke about the opening (cut into it, or asked to hear part of it again):
   * Realtime answers what they said, quoting `heard` (its own words so far, since instructions
   * do not see the conversation), then asks briefly for the project.
   */
  private async replyToOpening(answer: string, heard: string): Promise<void> {
    const epoch = this.epoch;
    const { role, company, companySay } = this.settings;
    this.added = false;
    this.resumeAt = "askAgain";
    this.cb.onPhase("panel");
    const said = await this.moderatorSays(
      openingReply(this.lang, answer, heard, this.panelNames(), role, company, companySay),
      true,
      this.floorFor("opening", true),
    );
    if (this.halted(epoch)) return;
    if (said) this.asked = { speaker: "moderator", question: said };
    return this.candidateTurn("new");
  }

  /**
   * The Time Buyer: after the project introduction (`intro`), Realtime thanks the candidate
   * and asks one light background question of its own. Round 1's question is written (and,
   * on camera, rendered) meanwhile, so the Technical Lead asks it as soon as this answer
   * ends. From then on the askers buy each other time (askAhead). If Realtime says nothing,
   * round 1 starts at once.
   */
  private async askTimeBuyer(intro: string): Promise<void> {
    const epoch = this.epoch;
    this.timeBought = true;
    this.introduction = intro;
    this.timeBuyerQuestion = "";
    this.dropEarly();
    this.startAhead(1);
    // Lost before it is heard: round 1 instead (resume).
    this.resumeAt = "nextQuestion";
    this.cb.onPhase("panel");
    const said = await this.moderatorSays(
      timeBuyerTask(this.lang, intro, this.people.technical_lead.name),
      true,
      this.floorFor("timeBuyer", true),
    );
    if (this.halted(epoch)) return;
    this.timeBuyerQuestion = said || undefined;
    if (!said) return this.nextRound(false);
    this.asked = { speaker: "moderator", question: said };
    this.askedAudio = null;
    this.askedVideo = null;
    this.clarifications = 0;
    this.resumeAt = "askAgain";
    return this.candidateTurn("new");
  }

  /**
   * True when the Technical Lead is on camera and round 1's question, written ahead during
   * the Time Buyer, is still being written or rendered as avatar video. A whole render takes
   * about 10–15 s after the question is in, so a short answer to the Time Buyer ends first;
   * the question would then stream, with about 5 s before the first frame (2026-10-24).
   */
  private round1VideoPending(): boolean {
    if (this.overTime() || !this.cameras.has(roundPlan(1).speaker)) return false;
    return this.ahead?.round === 1 && this.aheadVideo?.round === 1 && !this.aheadVideo.settled;
  }

  /**
   * A second Time Buyer (2026-10-24, the user's request): the first one's answer ended while
   * round 1's avatar video was still rendering, so Realtime asks one more light background
   * question, and the Technical Lead's first question is then seen and heard together.
   * Asked once at most; if its answer also ends first, round 1 streams as before.
   */
  private async askTimeBuyerAgain(answer: string): Promise<void> {
    const epoch = this.epoch;
    const first = this.timeBuyerQuestion ?? "";
    this.timeBuyerFirst = first;
    this.dropEarly();
    this.cb.onDebug?.({ type: "time_buyer_again", reason: "round 1's avatar video is still rendering" });
    this.resumeAt = "nextQuestion";
    this.cb.onPhase("panel");
    const said = await this.moderatorSays(
      timeBuyerAgainTask(this.lang, this.introduction, first, answer, this.people.technical_lead.name),
      true,
      this.floorFor("timeBuyer", true),
    );
    if (this.halted(epoch)) return;
    if (!said) return this.nextRound(false);
    // Both background questions, so no later question asks them again.
    this.timeBuyerQuestion = [first, said].filter(Boolean).join(" ") || undefined;
    this.asked = { speaker: "moderator", question: said };
    this.askedAudio = null;
    this.askedVideo = null;
    this.clarifications = 0;
    this.resumeAt = "askAgain";
    return this.candidateTurn("new");
  }

  /** The opening's instructions for Realtime, with this interview's names, role, company and its pronunciation. */
  private openingTask(): string {
    const { role, company, companySay } = this.settings;
    return openingTask(this.lang, this.panelNames(), role, company, companySay);
  }

  /** Have Realtime make the opening now (on the waiting screen) and keep its audio for start(). */
  private async makeOpening(): Promise<void> {
    const started = performance.now();
    const task = this.openingTask();
    const ahead = this.moderator.prepareReply(task);
    this.openingAhead = ahead;
    let complete = false;
    await Promise.race([
      ahead.done.then(() => void (complete = true)),
      new Promise((resolve) => setTimeout(resolve, OPENING_AHEAD_WAIT_MS)),
    ]);
    this.cb.onDebug?.({
      type: "opening_prepared",
      task,
      ms: Math.round(performance.now() - started),
      lost: ahead.lost,
      complete,
    });
  }

  /** This interview's names for the three seats (the prep room's), for the opening. */
  private panelNames() {
    const { moderator, technical_lead, mentor } = this.people;
    return { moderator: moderator.name, technical_lead: technical_lead.name, mentor: mentor.name };
  }

  /** "Could you repeat that?": replay the question as it was heard. */
  private async repeatQuestion(): Promise<void> {
    const epoch = this.epoch;
    const { speaker, question } = this.asked;
    this.cb.onPhase("panel");
    if (speaker === "moderator") {
      // The Time Buyer, worded by Realtime: read again as it was said.
      if (this.timeBought) {
        await this.moderatorSays(readAloud(this.lang, question), true, this.floorFor("timeBuyer", true, question));
        return;
      }
      return this.sayLine("moderator", openingQuestion(this.lang), undefined, "question");
    }
    if (this.askedVideo && this.cameras.has(speaker)) {
      // Said as avatar video: replay that clip; if it will not play, the camera goes off and TTS says it below.
      this.cb.onSpeaker(speaker);
      const saved = this.save(speaker, question);
      const video = this.askedVideo;
      try {
        await this.speaking(this.floorFor("question", false, question, saved), () =>
          this.avatar.playClip(speaker, video),
        );
        await saved;
        return;
      } catch (e) {
        if (!(e instanceof AvatarUnavailable)) throw e;
        this.cameraOff(speaker, e.message);
        // Nothing was heard: say it again as TTS audio, into the row just written.
        const audio = await this.speakQuestion({ speaker, question, emotion: TONE[speaker] }, false, saved);
        if (this.halted(epoch)) return;
        this.askedAudio = audio;
        await saved;
        return;
      }
    }
    if (this.askedAudio) {
      this.cb.onSpeaker(speaker);
      const saved = this.save(speaker, question);
      const audio = this.askedAudio;
      // A backup question's clip, if it is in, plays as video (playLine); any other audio as audio.
      await this.speaking(this.floorFor("question", false, question, saved), () =>
        this.playLine(speaker, question, TONE[speaker], audio),
      );
      await saved;
      return;
    }
    if (this.unheard) {
      // The candidate cut into it the first time: say it in full now.
      const { q, backup } = this.unheard;
      this.cb.onSpeaker(speaker);
      this.player.reset();
      const saved = this.save(speaker, question);
      const audio = await this.speakQuestion(q, backup, saved);
      if (this.halted(epoch)) return;
      this.askedAudio = audio;
      this.unheard = null;
      await saved;
      return;
    }
    // TTS failed for this question, so Realtime read it; it reads it again.
    await this.moderatorSays(
      readAloud(this.lang, substituteQuestion(this.lang, speaker, question)),
      true,
      this.floorFor("question", true, question),
    );
  }

  /** The moderator seat says a closing line (TTS, in its voice) and the call ends. */
  /** The moderator closes: `line` through TTS, or Realtime's words for `task` if given (`line` if it says nothing). */
  private async closeInterview(line: string, task?: string): Promise<void> {
    this.closing = true;
    this.dropEarly();
    this.dropAhead();
    const said = task ? await this.moderatorSays(task) : "";
    if (!said) await this.sayLine("moderator", line);
    await this.moderator.close();
    this.cb.onSpeaker(null);
    this.cb.onPhase("done");
  }

  /**
   * Open the candidate's turn. `silence`: "new" starts the silence clock at 0;
   * "wait" too, but without the first (8 s) prompt (after a yes / no to a prompt);
   * "resume" carries on from where it was (after a backchannel or a cough).
   * `talking`: the candidate cut into the panel and is already talking.
   */
  private candidateTurn(silence: "new" | "wait" | "resume", talking = false): void {
    if (this.stopped || this.offline) return;
    this.dropEarly();
    this.answering = true;
    this.resumeAt = "answerAgain";
    this.heard = false;
    this.judged = null;
    // bargeIn() sets cutInto just before opening a turn with the candidate talking.
    if (!talking) this.cutInto = "";
    // A cut-in keeps the last second of audio, so its first words are transcribed too.
    this.moderator.startCandidateTurn(talking);
    if (this.live.running) {
      // Kept running from the panel's line (barge-in on): the caption starts with this answer.
      this.captionFrom = talking ? this.barge.wordsBefore() : this.liveWords.length;
    } else {
      this.captionFrom = 0;
      this.live.start();
    }
    this.cb.onSpeaker("candidate");
    this.cb.onPhase("candidate");
    if (silence !== "resume") {
      this.silenceMs = 0;
      this.skipFirstPrompt = silence === "wait";
    }
    if (!this.manual) {
      // Mid-speech the VAD's memory of it is kept.
      if (!talking) this.vad?.reset();
      this.turn.start(talking, this.added ? LONG_PAUSE_MS : PAUSE_MS);
      this.turnGen += 1;
      this.cb.onDebug?.({ type: "turn_listen", silentMs: Math.round(this.silenceMs) });
      this.armSilence();
    }
  }

  /** Start the silence clock towards the next prompt. Only before the candidate has said anything. */
  private armSilence(): void {
    this.clearSilence();
    if (this.manual || this.heard || !this.answering) return;
    const next = SILENCE_STEPS.find((at) => at > this.silenceMs && !(this.skipFirstPrompt && at === SILENCE_STEPS[0]));
    if (next === undefined) return;
    this.silenceSince = performance.now();
    const gen = this.turnGen;
    this.silenceTimer = window.setTimeout(() => {
      if (gen !== this.turnGen || !this.answering) return;
      this.silenceMs = next;
      this.silenceSince = null;
      void this.onSilence(next);
    }, next - this.silenceMs);
  }

  /** Stop the silence clock, keeping the time counted so far. */
  private pauseSilence(): void {
    if (this.silenceSince !== null) this.silenceMs += performance.now() - this.silenceSince;
    this.silenceSince = null;
    this.clearSilence();
  }

  private clearSilence(): void {
    if (this.silenceTimer !== null) window.clearTimeout(this.silenceTimer);
    this.silenceTimer = null;
  }

  /** The candidate has been silent for `at` ms: say that prompt, or mark the question unanswered. */
  private async onSilence(at: number): Promise<void> {
    if (at >= UNANSWERED_MS) {
      void this.finishAnswer(`silent for ${UNANSWERED_MS / 1000} s: marked unanswered`, "unanswered");
      return;
    }
    const seconds = (at / 1000) as 8 | 15 | 25;
    const seat = this.asked.speaker;
    const text = askerLines(this.lang, seat).silence[seconds];
    this.lastPrompt = seconds;
    this.cb.onDebug?.({ type: "silence_prompt", seconds, text });
    // Stop listening while the prompt plays, so the speakers are not taken for the candidate.
    // With headphones the candidate may cut into it instead (bargeIn).
    this.turn.stop();
    const gen = this.turnGen;
    await this.sayLine(seat, text, undefined, "prompt");
    if (gen !== this.turnGen || !this.answering || this.stopped) return;
    this.moderator.clearPending();
    this.vad?.reset();
    this.turn.start();
    this.cb.onSpeaker("candidate");
    this.armSilence();
  }

  /** Load Silero VAD; if it fails, fall back to Done answering for this interview. */
  private async loadVad(): Promise<void> {
    if (!this.manual) {
      try {
        let failed = false;
        this.vad = await SileroVad.load(
          (p) => {
            this.moderator.noteVoice(p >= VOICED);
            this.turn.frame(p);
            this.barge.frame(p);
          },
          // Every later frame would fail the same way: report once and switch to the button.
          (m) => {
            if (failed) return;
            failed = true;
            this.cb.onError(m);
            this.toManual(`the VAD failed while running (${m}); Done answering instead`);
          },
        );
        this.cb.onDebug?.({
          type: "turn_mode",
          manual: false,
          note: "Silero VAD loaded; deepseek-flash judges pauses",
        });
      } catch (e) {
        this.toManual(`VAD failed to load (${e instanceof Error ? e.message : String(e)}); Done answering instead`);
        return;
      }
    } else {
      this.cb.onDebug?.({ type: "turn_mode", manual: true, note: "VITE_MANUAL_TURNS=true: Done answering" });
    }
    this.cb.onTurnMode?.(this.manual);
  }

  private toManual(note: string): void {
    this.manual = true;
    this.turn.stop();
    this.clearTurnTimer();
    this.clearSilence();
    this.cb.onDebug?.({ type: "turn_mode", manual: true, note });
    this.cb.onTurnMode?.(true);
  }

  /** The candidate started talking again: any pending check or timer is out of date. */
  private onSpeech(): void {
    if (!this.answering) return;
    this.turnGen += 1;
    this.judged = null;
    this.clearTurnTimer();
    this.dropEarly();
    if (!this.heard) {
      this.heard = true;
      this.pauseSilence();
      this.startAnswerTimers();
    }
    this.cb.onDebug?.({ type: "turn_speech" });
  }

  /** The candidate paused: transcribe what they said so far and ask whether they are done. */
  private async onPause(): Promise<void> {
    if (!this.answering) return;
    const gen = ++this.turnGen;
    this.cb.onDebug?.({ type: "turn_pause", ms: this.added ? LONG_PAUSE_MS : PAUSE_MS });
    // Judged on Higgs's text only. Judging the browser's own speech recognition first was
    // 0.2–0.7 s sooner, but its words can miss the end: "oh sorry sorry" for "Oh, sorry, sorry.
    // Can you repeat your question?" was judged a finished answer (2026-10-22).
    const answer = await this.moderator.transcriptSoFar();
    if (gen !== this.turnGen || !this.answering) return;
    if (!answer.trim() && this.moderator.lostSpeech()) {
      // Said, but neither Whisper nor Higgs could transcribe it: the moderator (Realtime) asks them to say it again.
      void this.finishAnswer("the transcription failed");
      return;
    }
    if (!answer.trim()) {
      // A cough or a click: nothing was said yet, so the silence clock goes on.
      this.cb.onDebug?.({ type: "turn_empty" });
      this.heard = false;
      this.clearAnswerTimers();
      this.armSilence();
      return;
    }
    // deepseek-flash called "Yes, please." and "No." unfinished, adding 3 s each time.
    if (this.lastPrompt >= 15 && ["wait", "skip"].includes(classify(answer, this.lastPrompt, this.lang))) {
      void this.finishAnswer("a yes / no to the silence prompt");
      return;
    }
    // Ask for the next question now, alongside the "finished?" check: if the answer
    // ends here, its judgment (and so the handoff's tone) is in about a second sooner.
    this.askEarly(answer);
    // After "Do you need more time?" a reply like "Give me more minutes" is read as an answer to it.
    const prompt = this.lastPrompt ? askerLines(this.lang, this.asked.speaker).silence[this.lastPrompt] : "";
    const verdict = await api.turnVerdict(this.asked.question, answer, this.cutInto, prompt, this.lang);
    this.cb.onDebug?.({ type: "turn_check", answer, ...verdict, stale: gen !== this.turnGen || !this.answering });
    if (gen !== this.turnGen || !this.answering) return;
    // "Let me think" mid-answer is not a request: "wait" only answers a silence prompt.
    if (verdict.intent === "wait" && !this.lastPrompt) verdict.intent = "answer";
    this.judged = { text: answer, intent: verdict.intent ?? null };
    // A request to the panel ("Hold on. Can you repeat your question?") is answered at once, finished or not.
    const request = verdict.intent && verdict.intent !== "answer" && verdict.intent !== "noise";
    // Adding to an answer after cutting in: the fallback rule's "finished" is not enough.
    if (request || (verdict.finished && (!this.added || verdict.source === "deepseek"))) {
      void this.finishAnswer(
        request ? `a request to the panel (${verdict.intent})` : `judged finished (${verdict.source})`,
      );
    } else if (this.added) {
      this.armTurnTimer(
        ADDED_MORE_MS,
        "adding to the answer: not judged finished by deepseek-flash, then silent for 6 s",
      );
    } else {
      this.armTurnTimer(MORE_MS, `judged not finished, then silent for ${MORE_MS / 1000} s`);
    }
  }

  private armTurnTimer(ms: number, reason: string): void {
    this.clearTurnTimer();
    const gen = this.turnGen;
    this.turnTimer = window.setTimeout(() => {
      if (gen === this.turnGen && this.answering) void this.finishAnswer(reason);
    }, ms);
  }

  private clearTurnTimer(): void {
    if (this.turnTimer !== null) window.clearTimeout(this.turnTimer);
    this.turnTimer = null;
  }

  /**
   * deepseek-flash's intent for the finished turn `answer`, if it judged these very words,
   * or these words and only politeness after them (rules.courtesy: "finish the test" and then
   * "Thank you." was left to the rules, which missed the request, 2026-10-23). Other words
   * added after the last pause (the final commit) leave it to the rules.
   */
  private judgedIntent(answer: string): TurnIntent | null {
    const judged = this.judged;
    if (!judged) return null;
    const said = plainWords(judged.text);
    const whole = plainWords(answer);
    if (said === whole) return judged.intent;
    const tail = whole.startsWith(said) ? whole.slice(said.length).trim() : null;
    return tail && pack(this.lang).rules.courtesy.test(tail) ? judged.intent : null;
  }

  /**
   * Ask the Orchestrator for round `round`'s question. Every round answers without
   * thinking: on deepseek-v4-pro that is ~2.6 s from the end of the answer to the
   * first audio, against ~11 s with thinking (2026-10-22).
   */
  private askQuestion(
    round: number,
    unanswered: string | undefined,
    answer?: string,
    pending?: { speaker: Panelist; question: string },
  ): QuestionCall {
    const difficulty = difficultyFor(this.difficulties, round);
    const abort = new AbortController();
    const call: QuestionCall = {
      round,
      answer,
      started: performance.now(),
      abort,
      result: Promise.resolve(new Error()),
      ms: null,
    };
    call.result = api
      .nextQuestion(
        this.interviewId,
        round,
        "fast",
        difficulty,
        unanswered,
        answer,
        this.skipped,
        this.lang,
        abort.signal,
        pending,
        this.timeBuyerQuestion,
      )
      .then((q): NextQuestion | Error => q)
      .catch((e: unknown) => (e instanceof Error ? e : new Error(String(e))))
      .finally(() => (call.ms = Math.round(performance.now() - call.started)));
    return call;
  }

  /** The interview has run past the length chosen in the lobby. */
  private overTime(): boolean {
    return this.startedAt > 0 && performance.now() - this.startedAt >= this.lengthMin * 60_000;
  }

  /** The candidate paused with `answer`: ask the next round's question with it already. */
  private askEarly(answer: string): void {
    this.dropEarly();
    // Written ahead already (askAhead): it does not depend on this answer.
    if (this.ahead?.round === this.round + 1) return;
    // Past the length the next step is the closing, so no question is needed.
    if (!this.overTime()) this.early = this.askQuestion(this.round + 1, undefined, answer);
  }

  /** The question asked at the pause, if it was asked with this very answer; any other is dropped. */
  private takeEarly(answer: string): QuestionCall | null {
    const early = this.early;
    this.early = null;
    if (
      early &&
      early.round === this.round + 1 &&
      early.answer !== undefined &&
      sameAnswer(early.answer, answer, this.lang)
    ) {
      return early;
    }
    early?.abort.abort();
    return null;
  }

  private dropEarly(): void {
    this.early?.abort.abort();
    this.early = null;
  }

  /**
   * Write round `round`'s question now, while `pending` (the other asker's question) is said
   * and answered. It builds on the answer before, to this asker's own last question, so it is
   * ready (and on camera rendered) when that answer ends: the askers buy each other time
   * (2026-10-23). Each asker's questions follow up on each other; the two askers' need not.
   */
  private askAhead(round: number, pending: NextQuestion): void {
    // Past the length the next step is the closing; after a lost connection the call is already there.
    if (this.stopped || this.closing || this.overTime() || this.ahead?.round === round) return;
    this.startAhead(round, { speaker: pending.speaker, question: pending.question });
  }

  /** Start writing round `round`'s question ahead; on camera its video is rendered once it is in. */
  private startAhead(round: number, pending?: { speaker: Panelist; question: string }): void {
    this.dropAhead();
    const call = this.askQuestion(round, this.aheadUnanswered, undefined, pending);
    call.ahead = true;
    this.aheadUnanswered = undefined;
    this.ahead = call;
    const video = { round, settled: false };
    this.aheadVideo = video;
    const { speaker } = roundPlan(round);
    const difficulty = difficultyFor(this.difficulties, round);
    this.cb.onDebug?.({ type: "question_start", round, mode: "fast", difficulty, speaker, ahead: true });
    void call.result.then((q) => {
      if (q instanceof Error || this.stopped || !this.cameras.has(q.speaker)) return void (video.settled = true);
      // Rendered whole like a fixed line (10–25 s); speakQuestion plays it if it is in by then, else streams.
      this.lineVideo(q.speaker, q.question, q.emotion)
        .catch(() => undefined)
        .finally(() => (video.settled = true));
    });
  }

  /** The question written ahead for round `round`, if any; one for another round is dropped. */
  private takeAhead(round: number): QuestionCall | null {
    const ahead = this.ahead;
    this.ahead = null;
    if (ahead?.round === round) return ahead;
    ahead?.abort.abort();
    return null;
  }

  private dropAhead(): void {
    this.ahead?.abort.abort();
    this.ahead = null;
  }

  /** From the first words of an answer: a hint at 120 s, and the asker closes it at 180 s. */
  private startAnswerTimers(): void {
    this.clearAnswerTimers();
    this.answerTimers = [
      window.setTimeout(() => {
        if (this.answering) this.cb.onWrapHint?.(true);
      }, WRAP_HINT_MS),
      window.setTimeout(() => {
        if (this.answering) void this.finishAnswer("answered for 180 s", "wrapUp");
      }, WRAP_UP_MS),
    ];
  }

  private clearAnswerTimers(): void {
    this.answerTimers.forEach((id) => window.clearTimeout(id));
    this.answerTimers = [];
    this.cb.onWrapHint?.(false);
  }

  private endListening(): void {
    this.turn.stop();
    this.turnGen += 1;
    this.clearTurnTimer();
    this.pauseSilence();
    this.clearAnswerTimers();
  }

  /**
   * AVATAR=true (the server said so when the interview was created): the TTS panelists
   * whose voice has a portrait go on camera; prepare() then loads their fixed lines' videos.
   * A preset voice has no portrait, so that seat stays voice only.
   */
  private startCameras(): void {
    for (const { speaker } of ASKERS) if (portraitFor(this.settings.seats[speaker].voice)) this.cameras.add(speaker);
    this.cb.onDebug?.({ type: "cameras", on: [...this.cameras], enabled: true });
    this.cb.onCameras?.([...this.cameras]);
  }

  /** The on-camera seats' fixed lines (corpus/avatar-lines.ts), with each seat's difficulty for its backup questions. */
  private videoLineSpecs(): [Panelist, string, string?][] {
    return ASKERS.flatMap(({ speaker }, i): [Panelist, string, string?][] =>
      this.cameras.has(speaker)
        ? videoLines(this.lang, speaker, this.difficulties[i] ?? "medium").map(({ text, emotion }) => [
            speaker,
            text,
            emotion,
          ])
        : [],
    );
  }

  /** A seat's video failed: its camera goes off for the rest of the interview, and it speaks as audio. */
  private cameraOff(seat: Panelist, reason: string): void {
    if (!this.cameras.delete(seat)) return;
    this.cb.onDebug?.({ type: "camera_off", speaker: seat, reason });
    this.cb.onCameras?.([...this.cameras]);
  }

  /**
   * Fetch the on-camera seats' fixed lines as avatar videos, a few at a time; `onEach` after
   * each one (loaded or failed). prepare() waits for them like the lines' audio (up to its
   * cap): a video rendered before comes from the server's disk at once; one never rendered
   * takes 10–25 s the first time. A line whose video is still not in when it is said is
   * said as audio; the rest keep loading.
   */
  private async loadLineVideos(onEach?: () => void): Promise<void> {
    const queue = this.videoLineSpecs();
    const count = queue.length;
    const started = performance.now();
    let failed = 0;
    await Promise.all(
      Array.from({ length: LINE_VIDEO_LOADS }, async () => {
        for (let next = queue.shift(); next && !this.stopped; next = queue.shift()) {
          await this.lineVideo(...next).catch(() => (failed += 1));
          onEach?.();
        }
      }),
    );
    if (!this.stopped)
      this.cb.onDebug?.({ type: "avatar_lines_loaded", count, failed, ms: Math.round(performance.now() - started) });
  }

  /** A fixed line's avatar video, fetched (and rendered, the first time ever) once per interview. */
  private lineVideo(seat: Panelist, text: string, emotion?: string): Promise<{ video: Blob; log: string | null }> {
    const key = lineKey(seat, text, emotion);
    let video = this.lineVideos.get(key);
    if (!video) {
      video = api.fetchLineVideo(this.interviewId, seat, text, emotion);
      // A failed fetch is not kept, so the next use tries again.
      video.then(
        (got) => this.readyVideos.set(key, got),
        () => this.lineVideos.delete(key),
      );
      this.lineVideos.set(key, video);
    }
    return video;
  }

  /**
   * Play a fixed line: as avatar video if the seat is on camera and the clip is already
   * in, else its audio. Nobody waits for a video still being rendered. A clip that will
   * not play turns the seat's camera off, and the line is said as audio.
   */
  private async playLine(seat: Seat, text: string, emotion: string | undefined, audio: ArrayBuffer): Promise<void> {
    if (seat !== "moderator" && this.cameras.has(seat)) {
      const ready = this.readyVideos.get(lineKey(seat, text, emotion));
      if (ready) {
        try {
          this.cb.onDebug?.({ type: "avatar_line", speaker: seat, text, log: ready.log });
          return await this.avatar.playClip(seat, ready.video);
        } catch (e) {
          if (!(e instanceof AvatarUnavailable)) throw e;
          this.cameraOff(seat, e.message);
        }
      }
    }
    await this.player.playClip(audio);
  }

  /**
   * Say the question as streamed avatar video; askedVideo then holds it for a repeat. False
   * if the video never started (Avatar busy or too slow, a codec the browser cannot
   * stream): the seat's camera goes off and the caller says it as TTS audio.
   */
  private async askOnVideo(q: NextQuestion, floor: Floor): Promise<boolean> {
    const { speaker } = q;
    const request = this.requestQuestionVideo(q);
    const log = request.response.then(
      (res) => res.headers.get("X-Avatar-Log"),
      () => null,
    );
    try {
      this.askedVideo = await this.speaking(floor, () =>
        this.avatar.speak(
          speaker,
          request,
          {
            bytes: (ms) => this.cb.onDebug?.({ type: "avatar_bytes", speaker, ms }),
            frame: (ms, codecs) => this.cb.onDebug?.({ type: "avatar_frame", speaker, ms, codecs }),
            received: (bytes, seconds) =>
              void log.then((file) =>
                this.cb.onDebug?.({ type: "avatar_received", speaker, bytes, seconds, log: file }),
              ),
            broken: (reason) => {
              this.cb.onDebug?.({ type: "avatar_broken", speaker, reason });
              this.cameraOff(speaker, `the video broke off: ${reason}`);
            },
          },
          AVATAR_FIRST_FRAME_MS,
        ),
      );
      return true;
    } catch (e) {
      if (!(e instanceof AvatarUnavailable)) throw e;
      this.cameraOff(speaker, e.message);
      return false;
    }
  }

  /** Request `q`'s avatar video now; avatar.speak reads the stream. */
  private requestQuestionVideo(q: NextQuestion): ClipRequest {
    const abort = new AbortController();
    this.cb.onDebug?.({ type: "avatar_start", speaker: q.speaker, text: q.question, emotion: q.emotion });
    const response = api.openAvatar(this.interviewId, q, abort.signal);
    // A request stopped by a cut-in or a hang-up rejects; that is expected.
    response.catch(() => {});
    return { response, abort, startedAt: performance.now() };
  }

  /** A fixed line's audio, fetched (and synthesized, the first time ever) once per interview. */
  private line(seat: Seat, text: string, emotion?: string): Promise<ArrayBuffer> {
    const key = lineKey(seat, text, emotion);
    let audio = this.lines.get(key);
    if (!audio) {
      audio = api.fetchLine(seat, text, emotion, this.lang, this.interviewId || undefined);
      // A failed fetch is not kept, so the next use tries again.
      audio.catch(() => this.lines.delete(key));
      this.lines.set(key, audio);
    }
    return audio;
  }

  /** Every fixed line and backup question this interview may use. */
  private wantedLines(): LineSpec[] {
    const wanted: LineSpec[] = [];
    for (const seat of ["moderator", "technical_lead", "mentor"] as const) {
      const { silence, wrapUp } = askerLines(this.lang, seat);
      for (const text of [silence[8], silence[15], silence[25], wrapUp]) wanted.push([seat, text]);
    }
    wanted.push(
      ["moderator", openingQuestion(this.lang)],
      ["moderator", closingLines(this.lang).timeUp],
      ["moderator", closingLines(this.lang).endEarly],
    );
    ASKERS.forEach(({ speaker }, i) => {
      for (const text of backupQuestions(this.lang, speaker, this.difficulties[i] ?? "medium"))
        wanted.push([speaker, text, TONE[speaker]]);
    });
    return wanted;
  }

  /**
   * Fetch `wanted` lines, a few at a time; `onEach` after each one (loaded or failed).
   * The moderator seat's wait for Realtime to connect: if it refuses the moderator's
   * voice, they are made in the fallback voice instead (useFallbackVoice).
   */
  private async loadLines(wanted: LineSpec[], onEach?: () => void): Promise<void> {
    const started = performance.now();
    let failed = 0;
    const load = (queue: LineSpec[]) =>
      Promise.all(
        Array.from({ length: LINE_LOADS }, async () => {
          for (let next = queue.shift(); next && !this.stopped; next = queue.shift()) {
            await this.line(...next).catch(() => (failed += 1));
            onEach?.();
          }
        }),
      );
    await Promise.all([
      load(wanted.filter(([seat]) => seat !== "moderator")),
      this.connected.catch(() => undefined).then(() => load(wanted.filter(([seat]) => seat === "moderator"))),
    ]);
    this.cb.onDebug?.({
      type: "lines_loaded",
      count: wanted.length,
      failed,
      ms: Math.round(performance.now() - started),
    });
  }

  /**
   * A panel seat says a fixed line through TTS (each seat in this interview's voice for
   * it, the moderator seat's too), in `emotion` if given. If its audio cannot be had, the line is
   * skipped and the interview goes on. `cut`: the candidate may cut into it.
   */
  private async sayLine(seat: Seat, text: string, emotion?: string, cut?: FloorKind): Promise<void> {
    const epoch = this.epoch;
    let audio: ArrayBuffer;
    try {
      audio = await this.line(seat, text, emotion);
    } catch (e) {
      this.cb.onDebug?.({
        type: "line_failed",
        speaker: seat,
        text,
        error: e instanceof Error ? e.message : String(e),
      });
      return;
    }
    if (this.halted(epoch)) return;
    this.cb.onSpeaker(seat);
    this.cb.onDebug?.({ type: "line", speaker: seat, text, emotion });
    // Play at once and write the log alongside: a slow database write once held a line back 5 s.
    const saved = this.save(seat, text);
    const play = () => this.playLine(seat, text, emotion, audio);
    await (cut ? this.speaking(this.floorFor(cut, false, text, saved), play) : play());
    await saved;
  }

  /**
   * Resolves with what the moderator said, once it has been heard (or cut into).
   * `save`: write it to the log. `cut`: the candidate may cut into it.
   */
  private async moderatorSays(
    task: string,
    save = true,
    cut: Floor | null = null,
    ahead: PreparedReply | null = null,
  ): Promise<string> {
    this.cb.onSpeaker("moderator");
    this.cb.onDebug?.({ type: "moderator_start", task });
    // Save while the audio is still playing, so the caption keeps up with it.
    let saved: Promise<unknown> = Promise.resolve();
    let line = "";
    const onTranscript = (text: string) => {
      this.cb.onDebug?.({ type: "moderator_transcript", text });
      line = text;
      // Empty when the connection was lost (or the candidate cut in) before Realtime said anything.
      if (save && text) {
        const record = this.save("moderator", text);
        saved = record;
        if (cut) Object.assign(cut, { text, record });
      }
    };
    // `ahead`: made earlier with prepareReply (the opening); it plays from what was kept.
    const speak = () =>
      ahead ? this.moderator.speakPrepared(ahead, onTranscript) : this.moderator.speak(task, onTranscript);
    await (cut ? this.speaking(cut, speak) : speak());
    await saved;
    return line;
  }

  /** A line the candidate may cut into; `text` and `record` as in Floor. */
  private floorFor(kind: FloorKind, realtime: boolean, text = "", record: Promise<api.Turn> | null = null): Floor {
    return { kind, realtime, text, record, addition: kind === "handoff" };
  }

  /**
   * Play a panel line with the candidate able to cut into it (barge-in on and
   * the VAD running): their voice is listened to meanwhile, and bargeIn() stops
   * the line if they do cut in, so `play` then returns early.
   */
  private async speaking<T>(floor: Floor, play: () => Promise<T>): Promise<T> {
    if (!this.bargeInOn || this.manual || !this.vad) return play();
    this.floor = floor;
    this.moderator.setWatching(true);
    // During a silence prompt the turn's VAD state is kept; otherwise start fresh.
    if (!this.answering) this.vad.reset();
    this.barge.start();
    if (!this.live.running) {
      this.captionFrom = 0;
      this.live.start();
    }
    try {
      return await play();
    } finally {
      // Not cut into: stop listening for a cut-in and undo any lowered volume.
      if (this.floor === floor) {
        const { voicedMs, peak } = this.barge.heardDuringLine();
        this.cb.onDebug?.({ type: "barge_none", what: floor.kind, voicedMs, peak });
        this.floor = null;
        this.barge.stop();
        this.moderator.setWatching(false);
        this.setPanelVolume(1);
      }
    }
  }

  /**
   * The candidate cut into the panel (doc/orchestrator.zh.md 3.3). The line stops
   * at once; the steps saying it stop at their next check (halted), as after a
   * lost connection; the log keeps only the part heard, plus " [interrupted]".
   * Then it is the candidate's turn, already talking: after a handoff line they
   * are adding to the answer just given, so the next question is dropped.
   */
  private bargeIn(how: Confirmed): void {
    const floor = this.floor;
    if (!floor || this.stopped || this.offline) return;
    this.floor = null;
    this.barge.stop();
    this.moderator.setWatching(false);
    this.epoch += 1;
    const head = this.panelPlayhead();
    this.tts?.abort(new Error("the candidate cut in"));
    // Realtime is cancelled in the background; a commit waits for it (ModeratorClient.commitSegment).
    // An avatar video pauses at once and fades back to the still portrait, as if the panelist stopped to listen.
    const played = floor.realtime
      ? this.moderator.cut()
      : this.avatar.active
        ? Promise.resolve({ ms: this.avatar.cut(), late: "" })
        : this.player.flush().then((ms) => ({ ms, late: "" }));
    this.setPanelVolume(1);
    void played.then(({ ms, late }) => this.cutRecord(floor, { ...head, played: ms / 1000 }, late));
    this.cb.onDebug?.({ type: "barge_in", what: floor.kind, ...how });
    // Realtime's text may not be in yet; then "".
    const words = spokenUnits(floor.text, this.lang);
    const heard = heardWords(floor.text, head, this.lang);
    this.cutInto = joinUnits(words.slice(0, heard), this.lang);

    if (floor.addition && this.roundCall) {
      // The answer is not over: drop the question written for it, and ask it again once the addition ends.
      const { round } = this.roundCall;
      if (this.roundCall.ahead) {
        // Written ahead, it does not depend on this answer: kept for when the addition ends.
        this.ahead = this.roundCall;
      } else {
        this.roundCall.abort.abort();
        this.cb.onDebug?.({
          type: "question_dropped",
          round,
          ms: Math.round(performance.now() - this.roundCall.started),
        });
      }
      this.roundCall = null;
      this.round = round - 1;
      this.added = true;
    }
    // Realtime's own words: the question to repeat or explain is what it had said.
    if (floor.kind === "timeBuyer" && floor.text) {
      this.asked = { speaker: "moderator", question: floor.text };
      // Cut into the second Time Buyer: the first is still one not to ask again.
      this.timeBuyerQuestion = [this.timeBuyerFirst, floor.text].filter(Boolean).join(" ");
    }
    if (floor.kind === "opening") {
      // Cut before the last sentence (the ask for a project): the candidate has not been asked yet,
      // so "has the answer ended?" is judged against the words heard ("say that again" plays the opening question).
      const ask = floor.text.match(/[^.!?。！？]+[.!?。！？]*\s*$/)?.[0] ?? "";
      const beforeAsk = heard < words.length - spokenUnits(ask, this.lang).length + 3;
      // Also after the ask: "Sure, I can do that." and a pause is not the introduction either.
      this.openingCut = true;
      this.asked = {
        speaker: "moderator",
        question: beforeAsk ? this.cutInto : floor.text || openingQuestion(this.lang),
      };
    }
    if (this.answering) {
      // A silence prompt: the turn goes on, now with the candidate talking.
      this.turn.start(true, this.added ? LONG_PAUSE_MS : PAUSE_MS);
      this.cb.onSpeaker("candidate");
    } else {
      this.candidateTurn("new", true);
    }
    this.onSpeech();
  }

  /**
   * Rewrite a line the candidate cut into to the words heard by `head`, plus
   * " [interrupted]". `late`: Realtime's text, when it only came after the cut;
   * the line was not logged yet, so it is logged cut.
   */
  private cutRecord(floor: Floor, head: Playhead, late = ""): void {
    const text = floor.record ? floor.text : late;
    if (!text) return;
    const words = spokenUnits(text, this.lang);
    const cut = `${joinUnits(words.slice(0, heardWords(text, head, this.lang)), this.lang)} [interrupted]`.trim();
    if (!floor.record) {
      void this.save("moderator", cut).catch((e: unknown) => {
        if (!this.stopped) this.cb.onError(e instanceof Error ? e.message : String(e));
      });
      this.cb.onDebug?.({ type: "turn_cut", speaker: "moderator", text: cut });
      return;
    }
    const { record } = floor;
    void record
      .then((turn) => api.updateTurn(this.interviewId, turn.id, cut))
      .then((turn) => {
        this.cb.onTurnUpdate?.(turn);
        this.cb.onDebug?.({ type: "turn_cut", speaker: turn.speaker, text: turn.text });
      })
      .catch((e: unknown) => {
        if (!this.stopped) this.cb.onError(e instanceof Error ? e.message : String(e));
      });
  }

  /**
   * Realtime's connection was lost (e.g. close code 1012): pause the call where
   * it is and reconnect in the background. Steps already running stop at their
   * next check (halted); a round's question call that is not decided yet keeps
   * running, for resume().
   */
  private onLost(code: number, reason: string): void {
    if (this.stopped || this.closing || this.offline) return;
    if (!this.begun) {
      // Lost while preparing or on the waiting screen: nothing to pause; start() waits for the new connection.
      this.cb.onDebug?.({ type: "reconnect_attempt", attempt: 1 });
      this.connected = this.connectRealtime();
      this.connected.catch(() => undefined);
      return;
    }
    this.offline = true;
    this.epoch += 1;
    const resume = this.resumeAt;
    this.floor = null;
    this.barge.stop();
    this.moderator.setWatching(false);
    this.setPanelVolume(1);
    this.answering = false;
    this.endListening();
    this.dropEarly();
    this.tts?.abort(new Error("the connection was lost"));
    this.candidateScript.reset();
    this.live.stop();
    this.cb.onCandidateLive?.("");
    void this.player.flush();
    // A video playing stops too; the line is said again on resume, as with audio.
    this.avatar.stop();
    this.cb.onSpeaker(null);
    this.cb.onPhase("reconnecting");
    this.cb.onReconnecting?.({ attempt: 0, error: "" });
    this.cb.onDebug?.({ type: "connection_lost", code, reason, resume });
    void this.reconnect(resume);
  }

  /** Reconnect with a fresh key, waiting 1, 2, 4, 5, 5… s before each attempt, until it works or the call is left. */
  private async reconnect(resume: ResumeCase): Promise<void> {
    const epoch = this.epoch;
    const lostAt = performance.now();
    let attempt = 0;
    let error = "";
    for (;;) {
      await wait(Math.min(RECONNECT_MAX_MS, RECONNECT_FIRST_MS * 2 ** attempt));
      if (this.halted(epoch)) return;
      attempt += 1;
      this.cb.onReconnecting?.({ attempt, error });
      this.cb.onDebug?.({ type: "reconnect_attempt", attempt });
      try {
        // A fresh key each time; the voice falls back to a preset if Realtime refuses it.
        await this.connectRealtime();
        break;
      } catch (e) {
        if (this.halted(epoch)) return;
        error = e instanceof Error ? e.message : String(e);
        const retryInMs = Math.min(RECONNECT_MAX_MS, RECONNECT_FIRST_MS * 2 ** attempt);
        this.cb.onDebug?.({ type: "reconnect_failed", attempt, error, retryInMs });
      }
    }
    // Hung up while the last attempt was connecting.
    if (this.halted(epoch)) return void this.moderator.close();
    this.offline = false;
    this.cb.onReconnecting?.(null);
    this.cb.onDebug?.({ type: "reconnected", attempts: attempt, ms: Math.round(performance.now() - lostAt) });
    await this.run(() => this.resume(resume));
  }

  /**
   * Back online: Realtime says RESUME_LINE (with ANSWER_AGAIN_LINE if the
   * candidate was answering), then the interview goes on as `resume` says. If
   * Realtime does not say it, the interview goes on anyway.
   */
  private async resume(resume: ResumeCase): Promise<void> {
    const epoch = this.epoch;
    this.cb.onDebug?.({ type: "resume", case: resume });
    this.cb.onPhase("panel");
    this.lastPrompt = 0;
    // Cut into, the candidate just goes on; if the next question was not asked yet, they are adding to the answer.
    const floor = this.floorFor("resume", true);
    floor.addition = resume === "nextQuestion";
    await this.moderatorSays(readAloud(this.lang, resumeLine(this.lang, resume === "answerAgain")), true, floor);
    // Lost during the opening, the candidate's turn still needs the VAD.
    await this.vadReady;
    if (this.halted(epoch)) return;
    if (resume === "answerAgain") return this.candidateTurn("new");
    // Lost before the Time Buyer was heard: round 1, written meanwhile, instead.
    if (resume === "nextQuestion" && !this.roundCall && this.round === 0 && this.timeBought)
      return this.nextRound(false);
    if (resume === "nextQuestion" && this.roundCall) return this.askRound(this.roundCall, this.roundCall.started);
    if (this.unheard) {
      // Cut off while it was said: say it again (TTS; Realtime if TTS fails). It is in the log already.
      const { q, backup } = this.unheard;
      this.cb.onSpeaker(q.speaker);
      this.player.reset();
      const audio = await this.speakQuestion(q, backup);
      if (this.halted(epoch)) return;
      this.askedAudio = audio;
      this.unheard = null;
    } else {
      await this.repeatQuestion();
      if (this.halted(epoch)) return;
    }
    this.candidateTurn("new");
  }

  /**
   * The call was left, or the connection was lost (or the candidate cut into the
   * panel) after `epoch` was read: a running step must not go on.
   */
  private halted(epoch: number): boolean {
    return this.stopped || epoch !== this.epoch;
  }

  private async save(speaker: Speaker, text: string): Promise<api.Turn> {
    const turn = await api.addTurn(this.interviewId, speaker, text);
    this.cb.onTurn(turn);
    return turn;
  }

  private async run(step: () => Promise<void>): Promise<void> {
    try {
      await step();
    } catch (e) {
      // After a hang-up, failures of the abandoned steps are expected; do not report them.
      if (!this.stopped) this.cb.onError(e instanceof Error ? e.message : String(e));
    }
  }
}
