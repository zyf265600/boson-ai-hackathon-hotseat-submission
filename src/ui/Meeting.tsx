import { useEffect, useRef, useState } from "react";
import type { Phase, Reconnecting } from "../interview";
import type { Speaker } from "../../shared/panel";
import type { Turn } from "../api";
import type { Playhead } from "../audio/playback";
import { TILE_ORDER, type Person } from "../../shared/people";
import { Tile, type Face } from "./Tile";
import { Captions } from "./Captions";
import { Icon } from "./icons";

interface MeetingProps {
  /** Who is who in this call: the seats carry the names chosen in the prep room (peopleFor). */
  people: Record<Speaker, Person>;
  phase: Phase;
  speaker: Speaker | null;
  turns: Turn[];
  /** Rough live text of the answer the candidate is giving now. */
  candidateLive: string;
  error: string;
  micMuted: boolean;
  camera: { stream: MediaStream | null; on: boolean; start: () => Promise<void>; stop: () => void };
  /** Loudness sources, polled every animation frame. */
  panelLevel: () => number;
  micLevel: () => number;
  /** Where the panel line playing now has got, for the captions; polled every animation frame. */
  panelPlayhead: () => Playhead;
  /**
   * AVATAR=true: the TTS panelists on camera, with their still portrait, their listening loop
   * and the <video> their lines play in. Everyone else (the moderator, a seat whose camera went off) shows
   * the usual camera-off tile.
   */
  faces: Partial<Record<Speaker, Face>>;
  onToggleMic: () => void;
  /** Turn detection is off (the backup) or failed to load: Done answering is the only way to end an answer. */
  manualTurns: boolean;
  /** The answer has run for 2 minutes: ask the candidate to wrap up. */
  wrapHint: boolean;
  /** Realtime's connection was lost: the call is paused while it reconnects; null when connected. */
  reconnecting: Reconnecting | null;
  onDoneAnswering: () => void;
  onHangUp: () => void;
  /** Test mode: the inspector window is open. */
  testMode: boolean;
  onToggleTest: () => void;
  /** Admins only: the bug button that opens the inspector. */
  canTest: boolean;
}

/** RMS of speech sits around 0.01–0.2; spread that over 0..1 for the ring. */
const toLevel = (rms: number) => Math.min(1, Math.sqrt(rms) * 2.2);

function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);
  return now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function Meeting(props: MeetingProps) {
  const { phase, speaker, turns, micMuted, camera, panelLevel, micLevel } = props;
  const [showCaptions, setShowCaptions] = useState(true);
  const [showTranscript, setShowTranscript] = useState(false);
  const tiles = useRef(new Map<Speaker, HTMLDivElement>());
  const floor = useRef(speaker);
  floor.current = speaker;
  const transcriptEnd = useRef<HTMLLIElement>(null);
  const clock = useClock();

  // One animation loop drives every speaking ring through the --level CSS variable.
  useEffect(() => {
    const smooth = new Map<Speaker, number>();
    let raf = 0;
    const tick = () => {
      const panel = toLevel(panelLevel());
      for (const s of TILE_ORDER) {
        const target = s === "candidate" ? toLevel(micLevel()) : s === floor.current ? panel : 0;
        // Rise fast, fall slowly, like Meet's ring.
        const prev = smooth.get(s) ?? 0;
        const level = target > prev ? target : prev * 0.88;
        smooth.set(s, level);
        const el = tiles.current.get(s);
        if (el) {
          el.style.setProperty("--level", level.toFixed(3));
          el.classList.toggle("speaking", level > 0.12);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [panelLevel, micLevel]);

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, showTranscript]);

  const banner =
    phase === "candidate"
      ? props.wrapHint
        ? "Two minutes in — please start wrapping up your answer"
        : props.manualTurns
          ? "Your turn — answer, then press Done answering"
          : "Your turn — the panel replies when you finish, or press Done answering"
      : phase === "thinking"
        ? "The panel is thinking…"
        : phase === "panel" && speaker === null
          ? "Connecting to the panel…"
          : "";

  return (
    <div className="meeting">
      {banner && <div className="banner">{banner}</div>}

      <div className={`stage ${showTranscript ? "with-panel" : ""}`}>
        <div className="grid">
          {TILE_ORDER.map((s) => (
            <Tile
              key={s}
              ref={(el) => {
                if (el) tiles.current.set(s, el);
                else tiles.current.delete(s);
              }}
              speaker={s}
              person={props.people[s]}
              muted={s === "candidate" && micMuted}
              video={s === "candidate" ? camera.stream : null}
              face={props.faces[s]}
            />
          ))}
        </div>

        {showTranscript && (
          <aside className="side-panel">
            <div className="side-head">
              <h3>Transcript</h3>
              <button className="icon-btn" onClick={() => setShowTranscript(false)} title="Close">
                <Icon name="close" size={20} />
              </button>
            </div>
            <ol className="side-list">
              {turns.length === 0 && <li className="muted">Nothing said yet.</li>}
              {turns.map((t) => (
                <li key={t.id}>
                  <span className="side-who" style={{ color: props.people[t.speaker].color }}>
                    {props.people[t.speaker].name}
                  </span>
                  <p>{t.text}</p>
                </li>
              ))}
              <li ref={transcriptEnd} aria-hidden="true" />
            </ol>
          </aside>
        )}
      </div>

      {showCaptions && (turns.length > 0 || props.candidateLive) && (
        <Captions
          people={props.people}
          turns={turns}
          candidateLive={props.candidateLive}
          playhead={props.panelPlayhead}
        />
      )}

      {props.error && <div className="toast">{props.error}</div>}

      {/* Covers the call but not the bar, so the candidate can still hang up. */}
      {props.reconnecting && (
        <div className="reconnect-backdrop">
          <div
            className="dialog"
            role="alertdialog"
            aria-labelledby="reconnect-title"
            aria-describedby="reconnect-text"
          >
            <span className="dialog-icon">
              <Icon name="cloudOff" size={26} />
            </span>
            <h2 id="reconnect-title">Meeting interrupted</h2>
            <p id="reconnect-text" className="muted">
              The connection to the panel was lost. Reconnecting… The interview picks up where it stopped once the
              connection is back.
            </p>
            <p className="reconnect-attempt">
              <span className="reconnect-spinner" aria-hidden="true" />
              {props.reconnecting.attempt === 0 ? "Reconnecting" : `Attempt ${props.reconnecting.attempt}`}
              {props.reconnecting.error && ` · last attempt failed: ${props.reconnecting.error}`}
            </p>
          </div>
        </div>
      )}

      <footer className="bar">
        <div className="bar-left">
          {clock}
          <span className="bar-sep">|</span>
          HotSeat panel interview
        </div>

        <div className="bar-center">
          <button
            className={`round ${micMuted ? "off" : ""}`}
            onClick={props.onToggleMic}
            title={micMuted ? "Turn on microphone" : "Turn off microphone"}
          >
            <Icon name={micMuted ? "micOff" : "mic"} />
          </button>
          <button
            className={`round ${camera.on ? "" : "off"}`}
            onClick={() => (camera.on ? camera.stop() : void camera.start())}
            title={camera.on ? "Turn off camera" : "Turn on camera"}
          >
            <Icon name={camera.on ? "cam" : "camOff"} />
          </button>
          <button
            className={`round ${showCaptions ? "on" : ""}`}
            onClick={() => setShowCaptions((v) => !v)}
            title="Captions"
          >
            <Icon name="captions" />
          </button>
          {phase === "candidate" && (
            <button className="pill" onClick={props.onDoneAnswering}>
              <Icon name="check" size={20} /> Done answering
            </button>
          )}
          <button className="hangup" onClick={props.onHangUp} title="Leave interview">
            <Icon name="hangUp" />
          </button>
        </div>

        <div className="bar-right">
          {props.canTest && (
            <button
              className={`icon-btn ${props.testMode ? "on" : ""}`}
              onClick={props.onToggleTest}
              title={props.testMode ? "Close the inspector window" : "Test mode: open the inspector window"}
            >
              <Icon name="bug" />
            </button>
          )}
          <button
            className={`icon-btn ${showTranscript ? "on" : ""}`}
            onClick={() => setShowTranscript((v) => !v)}
            title="Transcript"
          >
            <Icon name="transcript" />
          </button>
        </div>
      </footer>
    </div>
  );
}
