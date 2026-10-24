import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons";

interface ModalProps {
  /** The dialog's heading, also its accessible name. */
  title: string;
  /** A line under the heading. */
  subtitle?: ReactNode;
  onClose: () => void;
  /** Extra class on the dialog box, e.g. for its width. */
  className?: string;
  children: ReactNode;
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex="0"]';

/**
 * A large dialog in the style of dialog.css: closes on Escape, a click outside or
 * the close button; keeps Tab inside itself and gives focus back to whatever had
 * it when it closes. Rendered on <body>, so the lobby's stacking rules do not apply.
 */
export function Modal({ title, subtitle, onClose, className = "", children }: ModalProps) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const titleId = useRef(`modal-${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    // Focus the control marked data-autofocus, else the first one after the close button.
    const controls = box.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    const marked = box.current?.querySelector<HTMLElement>("[data-autofocus]");
    (marked ?? controls?.[1] ?? controls?.[0])?.focus();
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // On the document, so Escape and Tab work wherever focus is.
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = scroll;
      opener?.focus?.();
    };
  }, []);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close.current();
      return;
    }
    if (e.key !== "Tab" || !box.current) return;
    const items = Array.from(box.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null,
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const inside = box.current.contains(document.activeElement);
    if (!inside) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={box}
        className={`dialog big-dialog ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="big-dialog-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close" title="Close">
            <Icon name="close" size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  );
}
