import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { Icon } from "./icons";
import { PROJECTS, SCRIPT_LENGTHS, type ScriptLength } from "../testmode/scripts";
import type { ScriptProgress, ScriptState } from "../testmode/SimulatedCandidate";

const POSITION_KEY = "hotseat.scriptPanel";
const GUTTER = 8;

interface ScriptPanelProps {
  script: ScriptState | null;
  /** Polled while a script is loaded, for the highlight and the progress bar. */
  progress: () => ScriptProgress | null;
  /** Only the candidate's turn can be answered. */
  canPlay: boolean;
  autoSubmit: boolean;
  /** Answers end with Done answering instead of turn detection. */
  manualTurns: boolean;
  onAutoSubmit: (on: boolean) => void;
  onPlay: (project: string, length: ScriptLength) => void;
  onPause: () => void;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function savedPosition(): { x: number; y: number } {
  try {
    const p = JSON.parse(localStorage.getItem(POSITION_KEY) ?? "null") as { x: number; y: number } | null;
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return p;
  } catch {
    // Storage blocked: start at the default spot.
  }
  return { x: 16, y: 64 };
}

/** The script split around what is being read now: done, the current sentence, and what comes next. */
function ScriptText({ text, heard }: { text: string; heard: number }) {
  const now = useRef<HTMLElement>(null);
  // The current sentence runs from the last sentence end before `heard` to the next one after it.
  const before = text.slice(0, heard);
  const start = Math.max(before.lastIndexOf(". "), before.lastIndexOf("\n")) + 1;
  const next = text.slice(heard).search(/\.(\s|$)/);
  const end = next < 0 ? text.length : heard + next + 1;

  useEffect(() => {
    now.current?.scrollIntoView({ block: "nearest" });
  }, [start]);

  return (
    <p className="script-text">
      <span className="script-done">{text.slice(0, start)}</span>
      <mark ref={now}>
        <span className="script-heard">{text.slice(start, heard)}</span>
        {text.slice(heard, end)}
      </mark>
      <span className="script-next">{text.slice(end)}</span>
    </p>
  );
}

/**
 * Test mode: a floating, draggable panel that reads a sample answer from
 * corpus/candidate-scripts/ in the candidate's voice. It grows to show the script, with
 * the sentence being read highlighted, once one is playing.
 */
export function ScriptPanel(props: ScriptPanelProps) {
  const { script, canPlay } = props;
  const [length, setLength] = useState<ScriptLength>("30s");
  const [pos, setPos] = useState(savedPosition);
  const [progress, setProgress] = useState<ScriptProgress | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const expanded = script !== null;

  // Follow the reading position while a script is loaded.
  useEffect(() => {
    if (!expanded) {
      setProgress(null);
      return;
    }
    setProgress(props.progress());
    const id = setInterval(() => setProgress(props.progress()), 100);
    return () => clearInterval(id);
  }, [expanded, props.progress]);

  // Keep the whole panel on screen when it grows or the window shrinks.
  useLayoutEffect(() => {
    const fit = () => {
      const el = box.current;
      if (!el) return;
      const maxX = Math.max(GUTTER, window.innerWidth - el.offsetWidth - GUTTER);
      const maxY = Math.max(GUTTER, window.innerHeight - el.offsetHeight - GUTTER);
      setPos((p) => {
        const x = Math.min(Math.max(GUTTER, p.x), maxX);
        const y = Math.min(Math.max(GUTTER, p.y), maxY);
        return x === p.x && y === p.y ? p : { x, y };
      });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [expanded]);

  function onPointerDown(e: PointerEvent<HTMLElement>) {
    if ((e.target as HTMLElement).closest("button")) return;
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent<HTMLElement>) {
    const el = box.current;
    if (!drag.current || !el) return;
    const x = Math.min(Math.max(GUTTER, e.clientX - drag.current.dx), window.innerWidth - el.offsetWidth - GUTTER);
    const y = Math.min(Math.max(GUTTER, e.clientY - drag.current.dy), window.innerHeight - el.offsetHeight - GUTTER);
    setPos({ x, y });
  }

  function onPointerUp() {
    if (!drag.current) return;
    drag.current = null;
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify(pos));
    } catch {
      // Not remembered; the panel still works.
    }
  }

  const status = script?.error
    ? `TTS failed: ${script.error}`
    : script?.status === "loading"
      ? "Synthesizing…"
      : script?.status === "paused"
        ? "Paused"
        : script?.status === "finished"
          ? props.autoSubmit
            ? "Finished · submitting"
            : props.manualTurns
              ? "Finished · press Done answering"
              : "Finished · silent, waiting for turn detection"
          : "Reading";

  return (
    <div
      ref={box}
      className={`script-panel ${expanded ? "expanded" : ""}`}
      style={{ left: pos.x, top: pos.y }}
      role="dialog"
      aria-label="Simulated candidate"
    >
      <header
        className="script-head"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <span className="script-grip" aria-hidden="true">
          ⋮⋮
        </span>
        <strong>Simulated candidate</strong>
        <span className="script-tag">test mode</span>
      </header>

      <div className="segmented script-lengths" role="radiogroup" aria-label="Answer length">
        {SCRIPT_LENGTHS.map((l) => (
          <button
            key={l.id}
            role="radio"
            aria-checked={length === l.id}
            className={length === l.id ? "on" : ""}
            onClick={() => setLength(l.id)}
          >
            {l.label}
          </button>
        ))}
      </div>

      <ul className="script-list">
        {PROJECTS.map((p) => {
          const mine = script?.project === p.id && script.length === length;
          const running = mine && (script.status === "playing" || script.status === "loading");
          return (
            <li key={p.id} className={mine ? "active" : ""}>
              <span className="script-title">{p.title}</span>
              <button
                className="script-play"
                disabled={!running && !canPlay}
                onClick={() => (running ? props.onPause() : props.onPlay(p.id, length))}
                title={running ? "Pause" : mine && script.status === "paused" ? "Resume" : "Play"}
                aria-label={running ? `Pause ${p.title}` : `Play ${p.title}`}
              >
                <Icon name={running ? "pause" : "play"} size={20} />
              </button>
            </li>
          );
        })}
      </ul>

      {expanded && progress && (
        <section className="script-now">
          <div className="script-meta">
            <span>{status}</span>
            <span>
              {clock(progress.played)} / {progress.total === null ? "…" : clock(progress.total)}
            </span>
          </div>
          <div className="script-progress">
            <div
              style={{
                width: `${progress.text.length ? Math.min(100, (progress.heard / progress.text.length) * 100) : 0}%`,
              }}
            />
          </div>
          <ScriptText text={progress.text} heard={progress.heard} />
        </section>
      )}

      <label className="script-auto">
        <input type="checkbox" checked={props.autoSubmit} onChange={(e) => props.onAutoSubmit(e.target.checked)} />
        Submit the answer when the script ends{props.manualTurns ? "" : " (skips turn detection)"}
      </label>
      {!canPlay && !expanded && <p className="script-hint">Plays during your turn to answer.</p>}
    </div>
  );
}
