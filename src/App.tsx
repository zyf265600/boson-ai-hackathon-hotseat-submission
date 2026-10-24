import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Interview, MANUAL_TURNS, type Phase, type PrepareProgress, type Reconnecting } from "./interview";
import type { Panelist, Speaker } from "../shared/panel";
import { buildReport, checkLlm, type LlmStatus, type Turn } from "./api";
import { useCamera } from "./ui/useCamera";
import { Lobby } from "./ui/Lobby";
import { Meeting } from "./ui/Meeting";
import type { Face } from "./ui/Tile";
import { Ended } from "./ui/Ended";
import type { ReportMeta, ReportState } from "./ui/Report";
import { savedResumeText } from "./ui/ResumeStep";
import { MIN_WAIT_MS, READY_HOLD_MS, Waiting } from "./ui/Waiting";
import { Countdown } from "./ui/Countdown";
import { saveSettings, savedSettings } from "./ui/interviewers";
import { ScriptPanel } from "./ui/ScriptPanel";
import { ServiceDialog } from "./ui/ServiceDialog";
import { saveRole, savedRole, type Role } from "./ui/UserMenu";
import type { ScriptState, SimulatedCandidate } from "./testmode/SimulatedCandidate";
import { InspectorHub } from "./inspector/hub";
import { DEFAULT_DIFFICULTIES, DEFAULT_LENGTH, INTERVIEW_LENGTHS, type Difficulty } from "../shared/panel";
import {
  DEFAULT_SETTINGS,
  checkSettings,
  idleLoopFor,
  peopleFor,
  portraitFor,
  type InterviewSettings,
} from "../shared/settings";

// One per asker (two); a saved list of three is per round, from before 2026-10-23, and is dropped.
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The 3-2-1 over the blurred call before the interview starts: one tick a second from this. */
const COUNTDOWN_FROM = 3;

const DIFFICULTY_KEY = "hotseat.difficulties";
const HEADPHONES_KEY = "hotseat.headphones";
const LENGTH_KEY = "hotseat.length";

declare global {
  interface Window {
    /** Test mode: test scripts drive the simulated candidate from the page, e.g. to cut into the panel. */
    hotseatTest?: SimulatedCandidate;
  }
}

/** Remember the last choice in this browser; fall back to the defaults. */
function savedDifficulties(): Difficulty[] {
  try {
    const saved = JSON.parse(localStorage.getItem(DIFFICULTY_KEY) ?? "null") as Difficulty[] | null;
    if (Array.isArray(saved) && saved.length === DEFAULT_DIFFICULTIES.length) return saved;
  } catch {
    // Storage blocked or bad JSON: use the defaults.
  }
  return DEFAULT_DIFFICULTIES;
}

/** The interview length (minutes) picked last time in this browser; the default if none or not a choice. */
function savedLength(): number {
  try {
    const saved = Number(localStorage.getItem(LENGTH_KEY));
    if (INTERVIEW_LENGTHS.includes(saved)) return saved;
  } catch {
    // Storage blocked: use the default.
  }
  return DEFAULT_LENGTH;
}

/** Whether "I'm wearing headphones" was ticked last time in this browser; off by default. */
function savedHeadphones(): boolean {
  try {
    return localStorage.getItem(HEADPHONES_KEY) === "true";
  } catch {
    return false;
  }
}

/** lobby (prep room) -> waiting (prepare) -> meeting -> ended. */
type View = "lobby" | "waiting" | "meeting" | "ended";

export default function App() {
  const interview = useRef<Interview | null>(null);
  const micRms = useRef(0);
  const camera = useCamera();
  const [view, setView] = useState<View>("lobby");
  const [phase, setPhase] = useState<Phase>("idle");
  const [speaker, setSpeaker] = useState<Speaker | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [candidateLive, setCandidateLive] = useState("");
  const [error, setError] = useState("");
  const [micMuted, setMicMuted] = useState(false);
  const [testMode, setTestMode] = useState(false);
  /** This call was started with "Join in test mode": show the simulated candidate. */
  const [testSession, setTestSession] = useState(false);
  const [script, setScript] = useState<ScriptState | null>(null);
  // With turn detection on, the script's end should go through it too, so auto-submit starts off.
  const [autoSubmit, setAutoSubmit] = useState(MANUAL_TURNS);
  /** The candidate ends answers with Done answering: the backup, or the VAD failed to load. */
  const [manualTurns, setManualTurns] = useState(MANUAL_TURNS);
  /** The answer has run for 2 minutes. */
  const [wrapHint, setWrapHint] = useState(false);
  /** Realtime's connection was lost: the call is paused while it reconnects. */
  const [reconnecting, setReconnecting] = useState<Reconnecting | null>(null);
  /** AVATAR=true: the TTS panelists on camera (portrait and talking-head video in their tiles). */
  const [cameras, setCameras] = useState<Panelist[]>([]);
  const [difficulties, setDifficulties] = useState<Difficulty[]>(savedDifficulties);
  /** The candidate wears headphones, so they may cut into the panel (barge-in). */
  const [headphones, setHeadphones] = useState(savedHeadphones);
  /** Interview length in minutes: past it the moderator closes after the current answer. */
  const [lengthMin, setLengthMin] = useState(savedLength);
  /** Language, role, company and the three interviewers, from the prep room (remembered in this browser). */
  const [settings, setSettings] = useState<InterviewSettings>(savedSettings);
  const people = useMemo(() => peopleFor(settings), [settings]);
  /** What prepare() last reported on the waiting screen; null before its first report. */
  const [progress, setProgress] = useState<PrepareProgress | null>(null);
  /** prepare() failed: shown on the waiting screen with Retry and Back. */
  const [prepError, setPrepError] = useState("");
  /** prepare() is done and MIN_WAIT_MS has passed: the waiting screen says so for READY_HOLD_MS, then the call opens. */
  const [prepReady, setPrepReady] = useState(false);
  /** User or admin, picked from the session menu; only an admin sees test mode. */
  const [role, setRole] = useState<Role>(savedRole);
  const inspectorWindow = useRef<Window | null>(null);
  const hub = useRef<InspectorHub | null>(null);
  const sessionId = useRef("");
  /** Join is waiting for the LLM check. */
  const [checking, setChecking] = useState(false);
  /** No LLM works: the "service unavailable" dialog is open; true if the join was in test mode. */
  const [unavailableFor, setUnavailableFor] = useState<boolean | null>(null);
  /** The last LLM check: shown in the dialog when it failed, and in the inspector. */
  const [llm, setLlm] = useState<LlmStatus | null>(null);
  /** The post-interview report on the end screen. */
  const [report, setReport] = useState<ReportState>({ status: "none" });
  /** The interview the report is on: id, language and times, for the report's header, voices and downloads. */
  const [reportMeta, setReportMeta] = useState<ReportMeta | null>(null);
  /** The number shown over the blurred call before it starts; null when not counting down. */
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => () => void interview.current?.stop(), []);

  // The hub always records the interview, so the inspector can be opened mid-call.
  if (!hub.current) {
    hub.current = new InspectorHub(() => {
      const iv = interview.current;
      const head = iv?.panelPlayhead() ?? { played: 0, total: 0, complete: true };
      return { panel: iv?.panelLevel() ?? 0, mic: micRms.current, ...head };
    });
  }

  // Closing the inspector window by hand turns test mode off.
  useEffect(() => {
    if (!testMode) return;
    const id = setInterval(() => {
      if (inspectorWindow.current?.closed) {
        inspectorWindow.current = null;
        setTestMode(false);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [testMode]);

  // The panel finished its closing line: leave the call like Meet does when the host ends it.
  useEffect(() => {
    if (phase === "done" && view === "meeting") {
      hub.current?.ended("The panel closed the interview");
      setView("ended");
      requestReport();
    }
  }, [phase, view]);

  /**
   * Build the report of the interview that just ended (server/report.ts). A result
   * that comes back after another interview started is dropped.
   */
  function requestReport() {
    const input = hub.current?.reportInput();
    if (!input) {
      setReport({ status: "none" });
      return;
    }
    const session = sessionId.current;
    setReportMeta({
      interviewId: input.interviewId,
      language: settings.language,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
    });
    setReport({ status: "loading" });
    buildReport(input.interviewId, input.questions, input.events, input.panelMs).then(
      (built) => {
        if (sessionId.current === session)
          setReport(built ? { status: "ready", report: built } : { status: "unscored" });
      },
      (err: Error) => {
        if (sessionId.current === session) setReport({ status: "error", message: err.message });
      },
    );
  }

  /**
   * One inspector window per session: a new interview opens a new window and
   * leaves the old one showing its closed session.
   * Must run inside a click: browsers only allow popups from a user gesture.
   */
  function openInspector(session: string) {
    const win = window.open(
      `/?view=inspector&session=${session}`,
      `hotseat-inspector-${session}`,
      "popup,width=1280,height=860",
    );
    inspectorWindow.current = win;
    setTestMode(win !== null);
    if (!win) setError("The browser blocked the inspector window; allow popups for this site.");
  }

  function toggleInspector() {
    if (testMode) {
      inspectorWindow.current?.close();
      inspectorWindow.current = null;
      setTestMode(false);
    } else {
      openInspector(sessionId.current);
    }
  }

  // Check the LLMs as soon as the lobby opens, so Join usually finds a fresh result.
  useEffect(() => {
    if (view === "lobby") void checkLlm().then(setLlm);
  }, [view]);

  /**
   * Join only when the Orchestrator has a working LLM; otherwise explain
   * why nothing started. A fresh check answers at once, so the click's
   * permission to start audio and open the inspector popup still holds.
   */
  async function tryJoin(withInspector = testMode) {
    if (checking) return;
    setChecking(true);
    const status = await checkLlm();
    setLlm(status);
    setChecking(false);
    if (!status.ok) {
      setUnavailableFor(withInspector);
      return;
    }
    setUnavailableFor(null);
    join(withInspector, status);
  }

  /**
   * Must run inside the Join click: the inspector popup opens here. The call
   * starts after the waiting screen, once prepare() is done.
   */
  function join(withInspector = testMode, status = llm) {
    setTurns([]);
    setCandidateLive("");
    setError("");
    setSpeaker(null);
    setScript(null);
    setWrapHint(false);
    setReconnecting(null);
    setCameras([]);
    setReport({ status: "none" });
    setTestSession(withInspector);
    micRms.current = 0;
    // A rejoin abandons the previous call without a hang-up click. A call the
    // panel closed still holds its speakers' audio; release it.
    void interview.current?.stop();
    hub.current?.ended("A new interview started");
    sessionId.current = Date.now().toString(36);
    const h = hub.current!;
    const valid = checkSettings(settings);
    const checked = typeof valid === "string" ? DEFAULT_SETTINGS : valid;
    h.reset(sessionId.current, difficulties, withInspector, {
      test: status?.test ?? null,
      provider: status?.provider ?? null,
    });
    const iv = new Interview(
      {
        onTurn: (t) => {
          setTurns((prev) => [...prev, t]);
          h.turn(t);
        },
        onTurnUpdate: (t) => {
          setTurns((prev) => prev.map((old) => (old.id === t.id ? t : old)));
          h.turnUpdate(t);
        },
        onSpeaker: (s) => {
          setSpeaker(s);
          h.floor(s);
        },
        onPhase: (p) => {
          setPhase(p);
          h.phase(p);
        },
        onError: (m) => {
          setError(m);
          h.error(m);
        },
        onCandidateLive: (text) => {
          setCandidateLive(text);
          h.candidateLive(text);
        },
        onMicLevel: (rms) => (micRms.current = rms),
        onDebug: (e) => h.debug(e),
        onScript: setScript,
        onTurnMode: (manual) => {
          setManualTurns(manual);
          // Without turn detection only the button or the script's end can submit a scripted answer.
          if (manual) {
            setAutoSubmit(true);
            if (interview.current) interview.current.candidateScript.autoSubmit = true;
          }
        },
        onWrapHint: setWrapHint,
        onReconnecting: setReconnecting,
        onCameras: setCameras,
      },
      difficulties,
      headphones,
      lengthMin,
      checked,
      savedResumeText(),
    );
    iv.candidateScript.autoSubmit = autoSubmit;
    if (withInspector) window.hotseatTest = iv.candidateScript;
    else delete window.hotseatTest;
    iv.setMicMuted(micMuted);
    interview.current = iv;
    setView("waiting");
    if (withInspector) openInspector(sessionId.current);
    void prepareAndStart(iv);
  }

  /** The waiting screen: prepare the interview, then start it, unless it was cancelled meanwhile. */
  async function prepareAndStart(iv: Interview) {
    setProgress(null);
    setPrepError("");
    setPrepReady(false);
    try {
      // Resolves when ready or after 30 s; rejects if the interview row or Realtime failed (then the error and Retry / Back show).
      // The screen stays at least MIN_WAIT_MS even when everything was cached, so the bar always runs from 0 to 100 %.
      await Promise.all([
        iv.prepare((p) => {
          if (interview.current === iv) setProgress(p);
        }),
        delay(MIN_WAIT_MS),
      ]);
    } catch (e) {
      if (interview.current !== iv) return;
      const message = e instanceof Error ? e.message : String(e);
      setPrepError(message || "Something went wrong while preparing the interview.");
      hub.current?.error(`prepare failed: ${message}`);
      return;
    }
    if (interview.current !== iv) return;
    // "Preparation complete, joining now" for a moment before the call opens.
    setPrepReady(true);
    await delay(READY_HOLD_MS);
    if (interview.current !== iv) return;
    // The call opens blurred under a 3-2-1; the interview starts when it ends.
    setView("meeting");
    for (let n = COUNTDOWN_FROM; n > 0; n--) {
      setCountdown(n);
      await delay(1000);
      if (interview.current !== iv) return;
    }
    setCountdown(null);
    void iv.start();
  }

  /** Cancel (or Back after an error) on the waiting screen: stop the interview and return to the prep room. */
  function cancelWaiting() {
    void interview.current?.stop();
    interview.current = null;
    micRms.current = 0;
    hub.current?.ended("Cancelled while the panel was preparing");
    setPhase("idle");
    setView("lobby");
  }

  function hangUp() {
    setCountdown(null);
    void interview.current?.stop();
    interview.current = null;
    micRms.current = 0;
    hub.current?.ended("The candidate hung up");
    setView("ended");
    requestReport();
  }

  function toggleMic() {
    const next = !micMuted;
    setMicMuted(next);
    interview.current?.setMicMuted(next);
  }

  const panelLevel = useCallback(() => interview.current?.panelLevel() ?? 0, []);
  const micLevel = useCallback(() => micRms.current, []);
  /**
   * The tiles of the panelists on camera: the still portrait, the listening loop played over it
   * while they are quiet, and the <video> AvatarStage plays their lines in.
   */
  const faces = useMemo(() => {
    const avatar = interview.current?.avatar;
    const out: Partial<Record<Speaker, Face>> = {};
    for (const seat of cameras) {
      const voice = settings.seats[seat].voice;
      const portrait = portraitFor(voice);
      if (avatar && portrait) out[seat] = { portrait, idle: idleLoopFor(voice), video: avatar.video(seat) };
    }
    return out;
  }, [cameras, settings]);
  const panelPlayhead = useCallback(
    () => interview.current?.panelPlayhead() ?? { played: 0, total: 0, complete: true },
    [],
  );
  const scriptProgress = useCallback(() => interview.current?.candidateScript.progress() ?? null, []);

  if (view === "meeting") {
    return (
      <>
        <Meeting
          people={people}
          phase={phase}
          speaker={speaker}
          turns={turns}
          candidateLive={candidateLive}
          error={error}
          micMuted={micMuted}
          camera={camera}
          panelLevel={panelLevel}
          micLevel={micLevel}
          panelPlayhead={panelPlayhead}
          faces={faces}
          onToggleMic={toggleMic}
          manualTurns={manualTurns}
          wrapHint={wrapHint}
          reconnecting={reconnecting}
          onDoneAnswering={() => void interview.current?.finishAnswer()}
          onHangUp={hangUp}
          testMode={testMode}
          onToggleTest={toggleInspector}
          canTest={role === "admin" || testSession}
        />
        {testSession && (
          <ScriptPanel
            script={script}
            progress={scriptProgress}
            canPlay={phase === "candidate"}
            autoSubmit={autoSubmit}
            manualTurns={manualTurns}
            onAutoSubmit={(on) => {
              setAutoSubmit(on);
              if (interview.current) interview.current.candidateScript.autoSubmit = on;
            }}
            // Inside the click, so the speakers' AudioContext may start.
            onPlay={(project, length) => void interview.current?.candidateScript.play(project, length)}
            onPause={() => interview.current?.candidateScript.pause()}
          />
        )}
        {countdown !== null && <Countdown value={countdown} />}
      </>
    );
  }

  const dialog = unavailableFor !== null && (
    <ServiceDialog
      checking={checking}
      status={llm}
      onRetry={() => void tryJoin(unavailableFor)}
      onClose={() => setUnavailableFor(null)}
    />
  );

  if (view === "waiting") {
    return (
      <>
        <Waiting
          settings={settings}
          progress={progress}
          ready={prepReady}
          error={prepError}
          onCancel={cancelWaiting}
          onRetry={() => {
            cancelWaiting();
            void tryJoin(testSession);
          }}
        />
        {dialog}
      </>
    );
  }

  if (view === "ended") {
    return (
      <>
        <Ended
          people={people}
          turns={turns}
          finished={phase === "done"}
          report={report}
          reportMeta={reportMeta}
          onRetryReport={requestReport}
          onRejoin={() => void tryJoin()}
          onHome={() => {
            setPhase("idle");
            setView("lobby");
          }}
        />
        {dialog}
      </>
    );
  }

  return (
    <>
      <Lobby
        camera={camera}
        micMuted={micMuted}
        onToggleMic={toggleMic}
        onJoin={() => void tryJoin()}
        onJoinTest={() => void tryJoin(true)}
        checking={checking}
        difficulties={difficulties}
        onDifficulty={(asker, d) => {
          const next = difficulties.map((old, i) => (i === asker ? d : old));
          setDifficulties(next);
          try {
            localStorage.setItem(DIFFICULTY_KEY, JSON.stringify(next));
          } catch {
            // Not remembered across reloads; the choice still applies now.
          }
        }}
        lengthMin={lengthMin}
        onLength={(minutes) => {
          setLengthMin(minutes);
          try {
            localStorage.setItem(LENGTH_KEY, String(minutes));
          } catch {
            // Storage blocked: the choice lasts for this page only.
          }
        }}
        settings={settings}
        onSettings={(next) => {
          setSettings(next);
          saveSettings(next);
        }}
        role={role}
        onRole={(r) => {
          setRole(r);
          saveRole(r);
        }}
        headphones={headphones}
        onHeadphones={(on) => {
          setHeadphones(on);
          try {
            localStorage.setItem(HEADPHONES_KEY, String(on));
          } catch {
            // Not remembered across reloads; the choice still applies now.
          }
        }}
      />
      {dialog}
    </>
  );
}
