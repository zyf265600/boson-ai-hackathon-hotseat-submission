import { useEffect, useRef, useState } from "react";
import type { InterviewSettings } from "../../shared/settings";
import type { PrepareProgress } from "../interview";
import { Icon } from "./icons";

interface WaitingProps {
  settings: InterviewSettings;
  /** null until the first report. */
  progress: PrepareProgress | null;
  /** prepare() is done and MIN_WAIT_MS has passed: "ready, joining" shows for READY_HOLD_MS. */
  ready: boolean;
  /** prepare() failed: its message; "" while it runs. */
  error: string;
  onCancel: () => void;
  onRetry: () => void;
}

const STAGES: Record<PrepareProgress["stage"], string> = {
  interview: "Setting up the interview",
  lines: "Recording the panel's lines",
  realtime: "Connecting the moderator",
  opening: "Preparing the moderator's opening",
  videos: "Loading the interviewers' videos",
};

/** The screen shows at least this long, and the bar takes this long to fill even if everything is ready at once. */
export const MIN_WAIT_MS = 3000;
/** Then "Preparation complete, joining the meeting" shows this long before the call opens. */
export const READY_HOLD_MS = 2000;

/**
 * The share of the bar from which the whole logo flashes, through ready (2026-10-23, the
 * user's request: a sign the call is about to open, in place of the small "Joining the
 * meeting in 3, 2, 1" count that came before the call's own 3-2-1 countdown).
 */
const FLASH_AT = 0.8;

/** Bars in the progress wave. */
const BARS = 36;

/** Each bar's height (0..1): a fixed sum of sines, so the bar row looks like a sound wave. */
const HEIGHTS = Array.from({ length: BARS }, (_, i) => {
  const v = 0.5 * Math.sin(i * 0.45 + 0.6) + 0.3 * Math.sin(i * 1.1 + 2.1) + 0.2 * Math.sin(i * 2.3 + 0.3);
  return 0.22 + 0.78 * (0.5 + 0.5 * v);
});

/** The logo's rounded square and its "H" (public/favicon.svg), as outlines. */
const SQUARE = { width: 64, height: 64, rx: 19 };
const H_PATH = "M19 16h7.5v12.5h11V16H45v32h-7.5V35h-11v13H19z";

/**
 * Between Join and the call: the interview is created and the panel's first
 * lines are made while this shows. A bright segment runs around the logo, and
 * a sound-wave bar fills from left to right with prepare()'s progress, never
 * faster than MIN_WAIT_MS. From FLASH_AT on, the whole logo flashes; once ready,
 * "joining the meeting" shows for READY_HOLD_MS, then the call's 3-2-1 countdown
 * runs (App.tsx prepareAndStart).
 */
export function Waiting({ settings, progress, ready, error, onCancel, onRetry }: WaitingProps) {
  const now = useClock(!error);
  const shownAt = useRef(now);

  const done = progress && progress.total > 0 ? Math.min(1, progress.done / progress.total) : 0;
  // The bar is the slower of the real progress and the MIN_WAIT_MS clock.
  const share = ready ? 1 : Math.min(done, (now - shownAt.current) / MIN_WAIT_MS);
  const percent = Math.round(share * 100);
  const filled = Math.round(share * BARS);
  const { moderator, technical_lead, mentor } = settings.seats;
  const action = useRef<HTMLButtonElement>(null);

  // Keep the keyboard on the screen's one action: Cancel, or Retry after an error.
  useEffect(() => action.current?.focus(), [error]);

  return (
    <div className="lobby prep waiting">
      <main className="waiting-main" aria-busy={!error}>
        <svg
          className={`waiting-logo ${error ? "stopped" : share >= FLASH_AT ? "flash" : ""}`}
          viewBox="-6 -6 76 76"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="waiting-run" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" style={{ stopColor: "var(--navy-bright)" }} />
              <stop offset="1" style={{ stopColor: "var(--ink-bright)" }} />
            </linearGradient>
          </defs>
          <rect className="logo-base" {...SQUARE} />
          <path className="logo-base h" d={H_PATH} />
          {/* Two segments on each outline leave the top-right corner together, one each way round, and meet at the bottom-left. */}
          <rect className="logo-run cw" {...SQUARE} pathLength={100} />
          <rect className="logo-run ccw" {...SQUARE} pathLength={100} />
          <path className="logo-run h cw" d={H_PATH} pathLength={100} />
          <path className="logo-run h ccw" d={H_PATH} pathLength={100} />
        </svg>

        {error ? (
          <>
            <h1>We could not get your interviewers ready</h1>
            <p className="waiting-error" role="alert">
              {error}
            </p>
            <div className="dialog-actions">
              <button className="test-join" onClick={onCancel}>
                <Icon name="chevronLeft" size={18} />
                Back to the prep room
              </button>
              <button ref={action} className="join" onClick={onRetry}>
                Retry
              </button>
            </div>
          </>
        ) : (
          <>
            <h1>{ready ? "Your interviewers are ready" : "Preparing your interviewers…"}</h1>
            <p className="muted waiting-who">
              {moderator.name}, {technical_lead.name} and {mentor.name}{" "}
              {ready ? "are in their seats." : "are taking their seats."}
            </p>
            <div
              className={`wave-progress ${ready ? "ready" : ""}`}
              role="progressbar"
              aria-label="Preparing the interview"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-valuetext={ready ? "Ready" : progress ? `${percent}%: ${STAGES[progress.stage]}` : "Starting"}
            >
              {HEIGHTS.map((h, i) => (
                <i
                  key={i}
                  className={i < filled ? "on" : ""}
                  style={
                    {
                      height: `${Math.round(h * 100)}%`,
                      animationDelay: `${(i % 9) * -0.13}s`,
                      "--mix": `${Math.round((i / (BARS - 1)) * 100)}%`,
                    } as React.CSSProperties
                  }
                />
              ))}
            </div>
            <p className={`waiting-status ${ready ? "ready" : ""}`} aria-live="polite">
              {ready ? (
                <>
                  <span className="waiting-count">100%</span>
                  Preparation complete. Joining the meeting…
                </>
              ) : progress ? (
                <>
                  <span className="waiting-count">{percent}%</span>
                  {STAGES[progress.stage]}
                </>
              ) : (
                "Starting…"
              )}
            </p>
            <button ref={action} className="test-join" onClick={onCancel}>
              Cancel
            </button>
          </>
        )}
      </main>
    </div>
  );
}

/** performance.now(), updated every 50 ms while `running`. */
function useClock(running: boolean): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(performance.now()), 50);
    return () => clearInterval(id);
  }, [running]);
  return now;
}
