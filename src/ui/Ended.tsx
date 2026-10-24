import type { Turn } from "../api";
import type { Speaker } from "../../shared/panel";
import type { Person } from "../../shared/people";
import { ReportView, type ReportMeta, type ReportState } from "./Report";

interface EndedProps {
  /** Names and colors per speaker, as chosen in the prep room. */
  people: Record<Speaker, Person>;
  turns: Turn[];
  /** The panel closed the interview, as opposed to the candidate hanging up. */
  finished: boolean;
  /** The post-interview report: being written, ready, failed, or none (nothing answered). */
  report: ReportState;
  /** The interview the report is on: its id, language and times. */
  reportMeta: ReportMeta | null;
  onRetryReport: () => void;
  onRejoin: () => void;
  onHome: () => void;
}

export function Ended({ people, turns, finished, report, reportMeta, onRetryReport, onRejoin, onHome }: EndedProps) {
  return (
    <div className="ended">
      <h1>{finished ? "The interview is over" : "You left the interview"}</h1>
      <div className="ended-actions">
        <button className="ghost" onClick={onRejoin}>
          Rejoin
        </button>
        <button className="join" onClick={onHome}>
          Back to the prep room
        </button>
      </div>

      {/* The transcript is a tab of the report, or shown alone when there is no report. */}
      <ReportView
        state={report}
        meta={reportMeta}
        people={people}
        turns={turns}
        onRetry={onRetryReport}
        onPracticeAgain={onRejoin}
      />
    </div>
  );
}
