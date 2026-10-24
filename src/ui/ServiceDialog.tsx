import { useEffect, useRef } from "react";
import { Icon } from "./icons";
import type { LlmStatus } from "../api";

interface ServiceDialogProps {
  /** Check again and join if the service is back. */
  onRetry: () => void;
  onClose: () => void;
  /** A retry is running. */
  checking: boolean;
  /** The failed check: why each provider failed, and whether only DeepSeek was allowed. */
  status: LlmStatus | null;
}

/** Shown instead of joining when none of the Orchestrator's LLM providers works. */
export function ServiceDialog({ onRetry, onClose, checking, status }: ServiceDialogProps) {
  const retryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    retryRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="service-dialog-title"
        aria-describedby="service-dialog-text"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="dialog-icon">
          <Icon name="cloudOff" size={26} />
        </span>
        <h2 id="service-dialog-title">Service temporarily unavailable</h2>
        <p id="service-dialog-text" className="muted">
          {status?.test
            ? "The server runs with TEST=true, which uses DeepSeek only, and DeepSeek did not answer. No other model is tried."
            : "None of the Orchestrator's language models answered."}{" "}
          Please try again in a few minutes.
        </p>
        {status && status.errors.length > 0 && <pre className="dialog-errors">{status.errors.join("\n")}</pre>}
        <div className="dialog-actions">
          <button className="test-join" onClick={onClose}>
            Close
          </button>
          <button ref={retryRef} className="join" onClick={onRetry} disabled={checking}>
            {checking ? "Checking…" : "Try again"}
          </button>
        </div>
      </div>
    </div>
  );
}
