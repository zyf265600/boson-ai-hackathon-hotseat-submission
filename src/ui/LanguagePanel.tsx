import { LANGUAGES, type Language } from "../../shared/languages";
import { Icon } from "./icons";
import { Modal } from "./Modal";

const CODES = Object.keys(LANGUAGES) as Language[];

/** The interview language as a grid of cards; picking one closes the panel. */
export function LanguagePanel({
  language,
  onPick,
  onClose,
}: {
  language: Language;
  onPick: (language: Language) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Interview language"
      subtitle="The panel listens, speaks and asks in this language for the whole interview. Interviewer names stay in English."
      onClose={onClose}
      className="language-dialog"
    >
      <div className="language-grid" role="radiogroup" aria-label="Interview language">
        {CODES.map((code) => {
          const on = code === language;
          return (
            <button
              key={code}
              role="radio"
              aria-checked={on}
              data-autofocus={on ? "" : undefined}
              className={`language-card ${on ? "on" : ""}`}
              onClick={() => onPick(code)}
            >
              <span className="language-code">{code.toUpperCase()}</span>
              <span className="language-label">{LANGUAGES[code].label}</span>
              {on && <Icon name="check" size={18} />}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
