import {
  SERVER,
  assistantTextItem,
  inputAudioAppend,
  inputAudioClear,
  inputAudioCommit,
  itemTruncate,
  responseCancel,
  responseCreate,
  type ClientEvent,
  type ServerEvent,
} from "./events";
import { AUDIO_RATE, buildSessionConfig, moderatorPrompt } from "./sessionConfig";
import type { Language } from "../../shared/languages";
import { VOICES } from "../../shared/panel";
import type { RingPlayer } from "../audio/playback";
import { MicCapture } from "../audio/capture";

const WS_URL = "wss://api.boson.ai/v1/realtime?model=higgs-realtime";

// Higgs STT keeps only the last ~60 s of one commit (measured 2026-10-21; not in
// Boson's docs). So a long answer is committed in pieces while the candidate
// talks: after SEGMENT_MIN_SEC at the next pause, or at SEGMENT_MAX_SEC anyway.
// The pieces' transcripts are joined in order at the end of the turn.
const SEGMENT_MIN_SEC = 20;
const SEGMENT_MAX_SEC = 40;
/** This long below QUIET_RMS counts as a pause. */
const PAUSE_SEC = 0.3;
/** Speech RMS sits around 0.01–0.2 (see Meeting's ring); below this is a gap. */
const QUIET_RMS = 0.01;
/** The server rejects commits of less than 100 ms of audio. */
const MIN_COMMIT_SEC = 0.1;
/** Past this, a segment still without a transcript counts as empty, so the interview goes on. */
const TRANSCRIPT_TIMEOUT_MS = 15000;
/** Past this, a moderator reply that never finished counts as done. */
const SPEAK_TIMEOUT_MS = 30000;
/** How much longer than its audio a reply made ahead may take to play (speakPrepared). */
const PLAY_MARGIN_MS = 3000;
/** Past this, a connection attempt (socket open + session.created) counts as failed. */
const CONNECT_TIMEOUT_MS = 10000;
/** The last this-many seconds of audio are kept, so a cut-in's first words reach the answer. */
const RECENT_SEC = 1;
/** After response.cancel, wait at most this long for response.done (until then a commit is refused). */
const CANCEL_WAIT_MS = 2000;

/**
 * Realtime refused the session's voice while connecting. `busy`: it could not check
 * the voice just then (the voices API's rate limit), so the same voice may work a
 * moment later; otherwise the voice is unknown and will not work.
 */
export class VoiceRefusedError extends Error {
  constructor(
    readonly voice: string,
    readonly busy: boolean,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Whether an `error` event that came while connecting means Realtime refused the
 * voice, and whether only for now. THE ONE PLACE TO ADJUST if the error's shape
 * changes. Measured 2026-10-23: Realtime answers the first session.update with an
 * `error` and closes the socket (code 1000) before any session.created, e.g.
 * - unknown voice: error.message "Session terminated due to Error while handling
 *   session update: Invalid voice 'voice_x': not found"
 * - any voice, chloe too, while the voices API is rate-limited (about one new session
 *   per 1–1.5 s gets through; results are not cached): "... Could not validate voice
 *   'voice_…': voices API returned HTTP 429" (the same voice worked 2–3 s later).
 * The error's type is "invalid_request_error" and code "400" in both cases.
 */
export function voiceRefusal(evt: ServerEvent): { busy: boolean; message: string } | null {
  const message = errorMessage(evt);
  if (!/\bvoice\b/i.test(message)) return null;
  return { busy: /\b429\b|rate.?limit|could not validate/i.test(message), message };
}

/** The text of an `error` event: error.message, else the whole error as JSON. */
function errorMessage(evt: ServerEvent): string {
  const error = (evt.error ?? {}) as { message?: unknown };
  return typeof error.message === "string" ? error.message : JSON.stringify(evt.error ?? evt);
}

/** One base64 PCM16 frame as samples. */
function decodePcm(base64: string): Int16Array {
  const binary = atob(base64);
  const pcm = new Int16Array(binary.length >> 1);
  for (let i = 0; i < pcm.length; i++) pcm[i] = binary.charCodeAt(2 * i) | (binary.charCodeAt(2 * i + 1) << 8);
  return pcm;
}

function rmsOf(pcm: Int16Array): number {
  let sum = 0;
  for (const v of pcm) sum += (v / 32768) ** 2;
  return pcm.length ? Math.sqrt(sum / pcm.length) : 0;
}

/** One committed piece of the current answer. */
interface Segment {
  seconds: number;
  /** Set by `input_audio_buffer.committed`, which arrives in commit order. */
  itemId: string | null;
  /** The transcript used: Whisper's, else Higgs's; null until known. */
  text: string | null;
  committedAt: number;
  /** Whisper (the first choice) is still working on it, or failed. */
  whisper?: "pending" | "failed";
  /** Higgs's transcript, kept in case Whisper fails; or why Higgs failed. */
  higgs?: { text: string } | { failed: string };
  /** Neither Whisper nor Higgs could transcribe it; `text` is then "". */
  failed?: boolean;
}

/**
 * The Higgs Realtime session that voices the moderator and hears the candidate.
 *
 * Turns are manual: the app commits each candidate turn and asks the moderator
 * to speak only when the interview script needs it. Each method resolves when
 * the matching server event arrives, so the interview flow reads top to bottom.
 */
/**
 * What Higgs sends as a "completed" transcript when its transcription gives up,
 * about 3 s after the commit (5 times by 2026-10-23, always 3.0–3.1 s). It is
 * treated as a failed transcription, so it never reaches the log as the
 * candidate's words (Realtime once answered it as if the candidate had said it).
 */
const UNAVAILABLE = /^the transcription is not available right now[.!]?$/i;

/** First and last words of a transcript, so a log shows whether the cuts lost or doubled anything. */
function ends(text: string): string {
  const words = text.trim().split(/\s+/);
  return words.length > 12 ? `${words.slice(0, 5).join(" ")} … ${words.slice(-5).join(" ")}` : words.join(" ");
}

export class ModeratorClient {
  private ws: WebSocket | null = null;
  private readonly capture: MicCapture;
  /** One pending waiter per awaited event type. */
  private waiters = new Map<string, (evt: ServerEvent) => void>();
  /** Muted from the call controls: keep the mic open but send nothing. */
  private muted = false;
  /** Test mode: a simulated candidate is answering, so the real mic is left out. */
  private scripted = false;
  /** The candidate's turn is open: track the uncommitted audio to cut it into segments. */
  private answering = false;
  private pendingSamples = 0;
  /** The audio behind pendingSamples, for Whisper. */
  private pendingAudio: Int16Array[] = [];
  private quietSec = 0;
  private segments: Segment[] = [];
  /** Turn detection is on: VAD verdicts arrive through noteVoice(). */
  private vadOn = false;
  /** The VAD heard speech in the audio not yet committed. */
  private pendingVoiced = false;
  /** Re-checked whenever a segment's transcript arrives. */
  private segmentWaiters: Array<() => void> = [];
  /** close() was called: the socket closing is ours, not a lost connection. */
  private closing = false;
  /** The panelists' lines sent so far, sent again to a new session after a reconnect. */
  private readonly context: ClientEvent[] = [];
  /** The panel is speaking and the candidate may cut in: their audio goes to the VAD too. */
  private watching = false;
  /** The last RECENT_SEC of audio sent, as sent. */
  private recent: { base64: string; samples: number }[] = [];
  /** A reply is being generated (between response.create and response.done). */
  private generating = false;
  private generated: Array<() => void> = [];
  /** The reply being said, so the candidate can cut it short (cut()). */
  private speaking: { itemId: string | null; release: () => void } | null = null;
  /** The reply was cut short: its audio still arriving is dropped. */
  private dropping = false;
  /** A reply made ahead (prepareReply) and not playing yet: its audio is kept here instead of played. */
  private ahead: PreparedReply | null = null;
  /** connect() is waiting for session.created: an error refusing the voice is kept here instead of reported. */
  private connecting = false;
  private refused: { busy: boolean; message: string } | null = null;
  /** Any other `error` that came while connecting, so the rejection says why. */
  private connectFailure = "";

  constructor(
    private readonly player: RingPlayer,
    private readonly onError: (message: string) => void,
    onMicLevel?: (rms: number) => void,
    /** Plain-words notes on answer segments, for the inspector. */
    private readonly onSegmentNote?: (text: string) => void,
    /** The candidate's audio during their turn, for turn detection; silence while muted. */
    private readonly onCandidateAudio?: (pcm: Int16Array) => void,
    /** A connected session closed without close() being called (e.g. code 1012, network down). */
    private readonly onLost?: (code: number, reason: string) => void,
    /** Whisper on this machine: transcribes every segment first; Higgs's transcript is the backup. */
    private readonly whisper?: (pcm: Int16Array) => Promise<string>,
    /** The interview language: Realtime speaks only it, and Higgs transcribes in it. */
    private readonly lang: Language = "en",
    /** The moderator's voice (the prep room's choice); setVoice() changes it for the next connect(). */
    private voice: string = VOICES.moderator,
  ) {
    this.capture = new MicCapture(
      (base64) => {
        if (this.scripted) return;
        if (!this.muted) this.appendAudio(base64);
        // Muted counts as silence, so a muted candidate still reaches the pause checks.
        else if (this.answering) this.onCandidateAudio?.(new Int16Array(decodePcm(base64).length));
      },
      (rms) => {
        if (!this.scripted) onMicLevel?.(this.muted ? 0 : rms);
      },
    );
  }

  /** The voice the next connect() asks for: the fallback once Realtime refused the chosen one. */
  setVoice(voice: string): void {
    this.voice = voice;
  }

  /** The voice the session speaks in (or will, once connected). */
  get voiceInUse(): string {
    return this.voice;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  /** Test mode: while scripted, only appendCandidateAudio() reaches the input buffer. */
  setScripted(scripted: boolean): void {
    this.scripted = scripted;
  }

  /** Test mode: the simulated candidate's audio, sent just like a microphone frame. */
  appendCandidateAudio(base64: string): void {
    this.appendAudio(base64);
  }

  /**
   * Open the socket, configure the session, start streaming the microphone.
   * Also reconnects after a lost connection, with a fresh key: the new session
   * gets the panelists' lines again. Rejects if the session is not up within 10 s,
   * with a VoiceRefusedError if Realtime refused the voice (voiceRefusal).
   */
  async connect(ephemeralKey: string): Promise<void> {
    if (this.ws) return; // StrictMode / double-click guard
    this.closing = false;
    this.connecting = true;
    this.refused = null;
    this.connectFailure = "";
    // Browsers cannot set headers on a WebSocket; the key travels as a subprotocol.
    const ws = new WebSocket(WS_URL, ["realtime", `bai-client-secret.${ephemeralKey}`]);
    this.ws = ws;
    /** The session was created; only then does a close count as a lost connection. */
    let live = false;
    ws.onmessage = (ev) => this.onMessage(JSON.parse(ev.data as string) as ServerEvent);
    ws.onclose = (ev) => {
      // A failed attempt's socket closing late must not touch the next attempt's.
      if (this.ws !== ws && this.ws !== null) return;
      this.ws = null;
      // Nothing more will arrive: release every step still waiting on the socket.
      for (const waiter of this.waiters.values()) waiter({ type: "closed", code: ev.code, reason: ev.reason });
      this.waiters.clear();
      this.generating = false;
      this.ahead = null;
      this.generated.splice(0).forEach((resolve) => resolve());
      for (const seg of this.segments) seg.text ??= "";
      this.segmentWaiters.splice(0).forEach((check) => check());
      if (!live || this.closing) return;
      // The open turn is over: what the candidate says now cannot be transcribed.
      this.answering = false;
      this.pendingSamples = 0;
      this.pendingAudio = [];
      this.onLost?.(ev.code, ev.reason);
    };
    // Closing a socket that is still connecting fails the attempt below.
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      ws.close();
    }, CONNECT_TIMEOUT_MS);
    try {
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () =>
          reject(
            new Error(
              timedOut ? `no connection within ${CONNECT_TIMEOUT_MS / 1000} s` : "Realtime socket failed to open",
            ),
          );
      });
      const created = this.waitFor("session.created");
      this.send(buildSessionConfig(this.lang, this.voice));
      const evt = await created;
      // Set by onMessage meanwhile (TypeScript still sees the null assigned above).
      const refused = this.refused as { busy: boolean; message: string } | null;
      if (evt.type !== "session.created" && refused) {
        throw new VoiceRefusedError(this.voice, refused.busy, refused.message);
      }
      if (evt.type !== "session.created") {
        throw new Error(
          timedOut
            ? `no session within ${CONNECT_TIMEOUT_MS / 1000} s`
            : `Realtime closed (${String(evt.code)}) ${String(evt.reason)} while connecting` +
              (this.connectFailure ? `: ${this.connectFailure}` : ""),
        );
      }
      live = true;
    } catch (e) {
      if (this.ws === ws) this.ws = null;
      ws.close();
      throw e;
    } finally {
      window.clearTimeout(timer);
      this.connecting = false;
    }
    this.context.forEach((item) => this.send(item));
    await this.capture.start();
  }

  /**
   * Start of a candidate turn: forget audio captured while the panel was talking.
   * `keepRecent`: the candidate cut in, so the last second of it is kept, with
   * their first words.
   */
  startCandidateTurn(keepRecent = false): void {
    this.send(inputAudioClear());
    this.answering = true;
    this.pendingSamples = 0;
    this.pendingAudio = [];
    this.quietSec = 0;
    this.segments = [];
    this.pendingVoiced = false;
    if (!keepRecent) return;
    for (const { base64, samples } of this.recent) {
      this.send(inputAudioAppend(base64));
      this.pendingSamples += samples;
      this.pendingAudio.push(decodePcm(base64));
    }
  }

  /** While the panel speaks with barge-in on: send the candidate's audio to the VAD as well. */
  setWatching(watching: boolean): void {
    this.watching = watching;
  }

  /** Drop audio buffered but not committed, e.g. a silence prompt the mic picked up. */
  clearPending(): void {
    if (this.pendingSamples > 0) this.send(inputAudioClear());
    this.pendingSamples = 0;
    this.pendingAudio = [];
    this.quietSec = 0;
    this.pendingVoiced = false;
  }

  /** One VAD frame: was it speech? Audio with no speech in it is never committed. */
  noteVoice(voiced: boolean): void {
    this.vadOn = true;
    if (voiced) this.pendingVoiced = true;
  }

  /**
   * Commit what is pending, unless the VAD heard no speech in it: Higgs STT
   * makes up words for silence ("Okay.", "I'm not sure." on 1.5 s of silence,
   * 2026-10-22), so silence is dropped instead.
   */
  private commitIfSpoken(reason: string): void {
    if (this.vadOn && !this.pendingVoiced) {
      if (this.pendingSamples > 0) this.send(inputAudioClear());
      this.pendingSamples = 0;
      this.pendingAudio = [];
      this.quietSec = 0;
    } else if (this.pendingSamples / AUDIO_RATE >= MIN_COMMIT_SEC) {
      this.commitSegment(reason);
    }
  }

  /**
   * End of a candidate turn: commit what is left and resolve with the whole
   * transcript, the segments' texts in order. Earlier segments were usually
   * transcribed while the candidate was still talking.
   */
  async commitCandidateTurn(): Promise<string> {
    this.answering = false;
    this.commitIfSpoken("end of answer");
    return this.joinedTranscript();
  }

  /** Some of this answer was said but could not be transcribed. */
  lostSpeech(): boolean {
    return this.segments.some((s) => s.failed);
  }

  /**
   * The candidate paused mid-turn: commit what they said since the last segment
   * and resolve with the whole answer so far. The turn stays open.
   */
  async transcriptSoFar(): Promise<string> {
    this.commitIfSpoken("pause");
    return this.joinedTranscript();
  }

  /**
   * Whisper transcribes the segment first (2026-10-23: Higgs STT failed on about
   * half of all segments, answering "the transcription is not available right
   * now" after 3 s). If Whisper fails or hears nothing, Higgs's transcript is used.
   */
  private transcribe(seg: Segment, index: number, audio: Int16Array): void {
    seg.whisper = "pending";
    this.whisper!(audio).then(
      (text) => {
        if (seg.text !== null) return; // Given up on meanwhile (the 15 s limit).
        const ms = Math.round(performance.now() - seg.committedAt);
        if (text.trim()) {
          seg.whisper = undefined;
          return this.settle(seg, text.trim(), `segment ${index + 1} transcribed by Whisper in ${ms} ms`);
        }
        this.whisperFailed(seg, index, "Whisper heard nothing");
      },
      (e: unknown) => {
        if (seg.text === null)
          this.whisperFailed(seg, index, `Whisper failed: ${e instanceof Error ? e.message : String(e)}`);
      },
    );
  }

  /** Whisper could not transcribe the segment: Higgs's transcript, once it is in. */
  private whisperFailed(seg: Segment, index: number, why: string): void {
    seg.whisper = "failed";
    const higgs = seg.higgs;
    if (!higgs) return this.onSegmentNote?.(`segment ${index + 1}: ${why}; waiting for Higgs`);
    if ("text" in higgs) return this.settle(seg, higgs.text, `segment ${index + 1}: ${why}; Higgs's transcript used`);
    this.settle(seg, "", `segment ${index + 1}: ${why}; ${higgs.failed} too`);
  }

  /** Higgs's transcript (or failure) for a segment arrived. */
  private higgsDone(seg: Segment, index: number, result: { text: string } | { failed: string }): void {
    seg.higgs = result;
    // Whisper has it already, or is still working on it.
    if (seg.text !== null || seg.whisper === "pending") return;
    const took = Math.round(performance.now() - seg.committedAt);
    if ("text" in result) this.settle(seg, result.text, `segment ${index + 1} transcribed by Higgs in ${took} ms`);
    else this.settle(seg, "", `segment ${index + 1}: ${result.failed}; nothing else to transcribe it`);
  }

  private settle(seg: Segment, text: string, note: string): void {
    seg.text = text;
    seg.failed = !text;
    this.onSegmentNote?.(text ? `${note} (${text.length} chars): "${ends(text)}"` : note);
    this.segmentWaiters.splice(0).forEach((check) => check());
  }

  /** Waits for every committed segment's transcript and joins them in order. */
  private async joinedTranscript(): Promise<string> {
    const started = performance.now();
    const all = new Promise<void>((resolve) => {
      const check = () => (this.segments.every((s) => s.text !== null) ? resolve() : this.segmentWaiters.push(check));
      check();
    });
    const timedOut = await Promise.race([
      all.then(() => false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(true), TRANSCRIPT_TIMEOUT_MS)),
    ]);
    if (timedOut) {
      const missing = this.segments.filter((s) => s.text === null);
      missing.forEach((s) => {
        s.text = "";
        s.failed = true;
      });
      // Another wait on the same segments (a pause check, then the end of the turn) is done too.
      this.segmentWaiters.splice(0).forEach((check) => check());
      // The interview asks the candidate to say it again (lostSpeech), so this is a note, not an error.
      if (missing.length > 0) {
        this.onSegmentNote?.(
          `${missing.length} segment(s) got no transcript within ${TRANSCRIPT_TIMEOUT_MS / 1000} s; counted as failed`,
        );
      }
    }
    if (this.segments.length > 1 && !this.answering) {
      this.onSegmentNote?.(
        `all ${this.segments.length} segments transcribed, ${Math.round(performance.now() - started)} ms after the answer ended`,
      );
    }
    return this.segments
      .map((s) => s.text!.trim())
      .filter(Boolean)
      .join(" ");
  }

  private appendAudio(base64: string): void {
    this.send(inputAudioAppend(base64));
    if (!this.answering && !this.watching) return;
    const pcm = decodePcm(base64);
    this.onCandidateAudio?.(pcm);
    this.recent.push({ base64, samples: pcm.length });
    let kept = this.recent.reduce((n, r) => n + r.samples, 0);
    while (kept - this.recent[0].samples >= RECENT_SEC * AUDIO_RATE) kept -= this.recent.shift()!.samples;
    if (!this.answering) return;
    this.pendingSamples += pcm.length;
    this.pendingAudio.push(pcm);
    this.quietSec = rmsOf(pcm) < QUIET_RMS ? this.quietSec + pcm.length / AUDIO_RATE : 0;
    const seconds = this.pendingSamples / AUDIO_RATE;
    if (seconds >= SEGMENT_MAX_SEC) this.commitSegment("no pause by 40 s");
    else if (seconds >= SEGMENT_MIN_SEC && this.quietSec >= PAUSE_SEC) this.commitSegment("cut at a pause");
  }

  private commitSegment(reason: string): void {
    const seconds = this.pendingSamples / AUDIO_RATE;
    // The socket is gone (Realtime closed it): nothing can be transcribed, so do not wait 15 s for it.
    const closed = this.ws?.readyState !== WebSocket.OPEN;
    // After the candidate cut Realtime off, the server refuses a commit until the cancelled reply is done.
    if (this.generating) this.generated.push(() => this.send(inputAudioCommit()));
    else this.send(inputAudioCommit());
    const audio = new Int16Array(this.pendingSamples);
    let at = 0;
    for (const chunk of this.pendingAudio) {
      audio.set(chunk.subarray(0, audio.length - at), at);
      at += chunk.length;
    }
    const seg: Segment = { seconds, itemId: null, text: closed ? "" : null, committedAt: performance.now() };
    this.segments.push(seg);
    if (!closed && this.whisper && audio.length > 0) this.transcribe(seg, this.segments.length - 1, audio);
    this.pendingSamples = 0;
    this.pendingAudio = [];
    this.quietSec = 0;
    this.pendingVoiced = false;
    this.onSegmentNote?.(`segment ${this.segments.length} sent for transcription: ${seconds.toFixed(1)} s (${reason})`);
  }

  /** Let the moderator know what a TTS panelist just asked. */
  addPanelistLine(label: string, text: string): void {
    const item = assistantTextItem(`[${label}] ${text}`);
    this.context.push(item);
    this.send(item);
  }

  /**
   * Have the moderator speak; resolves once it has been heard. The transcript
   * usually arrives well before playback ends, so `onTranscript` gets it then.
   */
  async speak(task: string, onTranscript: (text: string) => void): Promise<void> {
    // The socket is gone: nothing would answer, so do not wait 30 s for it.
    if (this.ws?.readyState !== WebSocket.OPEN) return onTranscript("");
    const timeout = new Promise<ServerEvent>((resolve) =>
      setTimeout(() => resolve({ type: "timeout" }), SPEAK_TIMEOUT_MS),
    );
    // The candidate cut in (cut()): stop waiting for the rest of the reply.
    let release = () => {};
    const cut = new Promise<ServerEvent>((resolve) => (release = () => resolve({ type: "cut" })));
    const speaking: { itemId: string | null; release: () => void } = { itemId: null, release };
    this.speaking = speaking;
    this.dropping = false;
    // A reply made ahead and not used (its connection was lost): new audio is this reply's.
    this.ahead = null;
    const transcript = Promise.race([this.waitFor(SERVER.audioTranscriptDone), timeout, cut]);
    const done = Promise.race([this.waitFor(SERVER.responseDone), timeout, cut]).then((evt) => {
      if (evt.type === "timeout") this.onError(`Realtime did not finish speaking within ${SPEAK_TIMEOUT_MS / 1000} s`);
      this.player.markComplete();
    });
    this.player.reset();
    this.generating = true;
    this.send(responseCreate(`${moderatorPrompt(this.lang)} ${task}`));
    const evt = await transcript;
    onTranscript(typeof evt.transcript === "string" ? evt.transcript : "");
    await done;
    await this.player.waitUntilDrained();
    if (this.speaking === speaking) this.speaking = null;
  }

  /**
   * Have Realtime make a reply now and keep its audio, to play later with speakPrepared()
   * (the opening, made on the waiting screen, 2026-10-23). `done` resolves once it is all
   * generated, or the connection closed (then `lost` is set and the reply is not used).
   */
  prepareReply(task: string): PreparedReply {
    const prepared: PreparedReply = {
      chunks: [],
      itemId: null,
      transcript: "",
      lost: false,
      done: Promise.resolve(),
    };
    if (this.ws?.readyState !== WebSocket.OPEN) {
      prepared.lost = true;
      return prepared;
    }
    const timeout = new Promise<ServerEvent>((resolve) =>
      setTimeout(() => resolve({ type: "timeout" }), SPEAK_TIMEOUT_MS),
    );
    const transcript = Promise.race([this.waitFor(SERVER.audioTranscriptDone), timeout]).then((evt) => {
      if (typeof evt.transcript === "string") prepared.transcript = evt.transcript;
    });
    const generated = Promise.race([this.waitFor(SERVER.responseDone), timeout]).then((evt) => {
      if (evt.type !== SERVER.responseDone) prepared.lost = true;
    });
    prepared.done = Promise.all([transcript, generated]).then(() => undefined);
    this.ahead = prepared;
    this.generating = true;
    this.send(responseCreate(`${moderatorPrompt(this.lang)} ${task}`));
    return prepared;
  }

  /**
   * Play a reply made with prepareReply() as speak() would play it: the audio kept so far
   * at once, the rest as it comes; the candidate can cut it short the same way (cut()).
   */
  async speakPrepared(prepared: PreparedReply, onTranscript: (text: string) => void): Promise<void> {
    let release = () => {};
    const cut = new Promise<void>((resolve) => (release = resolve));
    const speaking = { itemId: prepared.itemId, release };
    this.speaking = speaking;
    this.dropping = false;
    // Made seconds ago on the waiting screen: make sure the audio context is running.
    await this.player.resume().catch(() => undefined);
    this.player.reset();
    if (this.ahead === prepared) this.ahead = null;
    for (const chunk of prepared.chunks) this.player.enqueueBase64(chunk);
    const done = Promise.race([prepared.done, cut]).then(() => this.player.markComplete());
    await Promise.race([prepared.done, cut]);
    onTranscript(prepared.transcript);
    await done;
    // Once in 6 test calls the made-ahead opening never finished playing (the call sat
    // silent for 286 s, cause unknown; 2026-10-23): wait no longer than its length and a margin.
    const { total, played } = this.player.playhead();
    const limit = (total - played) * 1000 + PLAY_MARGIN_MS;
    const drained = await Promise.race([
      this.player.waitUntilDrained().then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), limit)),
    ]);
    if (!drained) this.onError(`the opening made ahead did not finish playing within ${Math.round(limit / 1000)} s`);
    if (this.speaking === speaking) this.speaking = null;
  }

  /**
   * The candidate cut in while Realtime was speaking. In manual mode Realtime
   * does not stop by itself: stop playing it, cancel the reply if it is still
   * being generated, and cut Realtime's own record of it to what was heard.
   * Resolves with the milliseconds heard, once a commit would be accepted, and
   * the reply's text if it only came after the cut (`late`, else "").
   */
  async cut(): Promise<{ ms: number; late: string }> {
    const speaking = this.speaking;
    this.dropping = true;
    const playedMs = await this.player.flush();
    if (!speaking) return { ms: playedMs, late: "" };
    this.speaking = null;
    // The text of a reply comes only once it is all generated; cut before that, it still
    // comes ~80 ms after the cancel (4 cut openings in 7 had no text and were missing
    // from the log). Catch it here; the waiter goes before the next reply could start.
    let late = "";
    const waitingForText = this.waiters.has(SERVER.audioTranscriptDone);
    if (waitingForText) {
      this.waiters.set(SERVER.audioTranscriptDone, (evt) => {
        late = typeof evt.transcript === "string" ? evt.transcript : "";
      });
    }
    this.waiters.delete(SERVER.responseDone);
    speaking.release();
    const generating = this.generating;
    if (generating) this.send(responseCancel());
    if (speaking.itemId) this.send(itemTruncate(speaking.itemId, Math.round(playedMs)));
    if (generating) {
      await Promise.race([
        new Promise<void>((resolve) => this.generated.push(resolve)),
        new Promise((resolve) => setTimeout(resolve, CANCEL_WAIT_MS)),
      ]);
      // No response.done in time: send what waits for it anyway.
      this.generating = false;
      this.generated.splice(0).forEach((resolve) => resolve());
    }
    // Waiters on the cancelled reply's events would catch the next reply's instead.
    if (waitingForText) this.waiters.delete(SERVER.audioTranscriptDone);
    return { ms: playedMs, late };
  }

  async close(): Promise<void> {
    this.closing = true;
    this.ws?.close(1000, "interview ended");
    await this.capture.stop();
  }

  private waitFor(type: string): Promise<ServerEvent> {
    return new Promise((resolve) => this.waiters.set(type, resolve));
  }

  private onMessage(evt: ServerEvent): void {
    if (evt.type === SERVER.outputAudioDelta && typeof evt.delta === "string") {
      if (this.ahead) {
        if (typeof evt.item_id === "string") this.ahead.itemId ??= evt.item_id;
        this.ahead.chunks.push(evt.delta);
        return;
      }
      if (this.speaking && typeof evt.item_id === "string") this.speaking.itemId ??= evt.item_id;
      if (!this.dropping) this.player.enqueueBase64(evt.delta);
    } else if (evt.type === SERVER.responseDone) {
      this.generating = false;
      this.generated.splice(0).forEach((resolve) => resolve());
    } else if (evt.type === SERVER.committed) {
      const seg = this.segments.find((s) => s.itemId === null);
      if (seg) seg.itemId = String(evt.item_id);
    } else if (evt.type === SERVER.transcriptionCompleted) {
      const index = this.segments.findIndex((s) => s.itemId === evt.item_id);
      if (index >= 0) {
        const seg = this.segments[index];
        const text = typeof evt.transcript === "string" ? evt.transcript.trim() : "";
        const took = Math.round(performance.now() - seg.committedAt);
        // Not what the candidate said: Higgs's own notice, sent as a "completed" transcript.
        if (UNAVAILABLE.test(text))
          this.higgsDone(seg, index, {
            failed: `Higgs sent "the transcription is not available right now" after ${took} ms`,
          });
        else this.higgsDone(seg, index, { text });
      }
    } else if (evt.type === SERVER.transcriptionFailed) {
      const index = this.segments.findIndex((s) => s.itemId === evt.item_id);
      if (index >= 0)
        this.higgsDone(this.segments[index], index, { failed: `Higgs failed: ${JSON.stringify(evt.error ?? "")}` });
    } else if (evt.type === SERVER.error) {
      // A refused voice is not an error to show: connect() rejects and the interview falls back.
      // Another error while connecting: the rejection of connect() carries its message.
      const refusal = this.connecting ? voiceRefusal(evt) : null;
      if (refusal) this.refused = refusal;
      else if (this.connecting) this.connectFailure = errorMessage(evt);
      else this.onError(JSON.stringify(evt.error ?? evt));
    }
    const waiter = this.waiters.get(evt.type);
    if (waiter) {
      this.waiters.delete(evt.type);
      waiter(evt);
    }
  }

  private send(evt: ClientEvent): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(evt));
  }
}

/** A reply made ahead by prepareReply(), to be played with speakPrepared(). */
export interface PreparedReply {
  /** Its audio so far (base64 PCM, as the server sent it). */
  chunks: string[];
  itemId: string | null;
  /** What it says, once generated. */
  transcript: string;
  /** The connection closed (or it timed out) before it was all generated: do not use it. */
  lost: boolean;
  done: Promise<void>;
}
