import { useEffect, useId, useRef, useState } from "react";
import { DEFAULT_ROLE, ROLES } from "../../shared/settings";
import { Icon } from "./icons";

/** The roles whose name contains `query` (any case); all of them for an empty query. */
export function filterRoles(query: string): string[] {
  const q = query.trim().toLowerCase();
  return q ? ROLES.filter((r) => r.toLowerCase().includes(q)) : [...ROLES];
}

/**
 * The Role box: a combobox over ROLES (shared/settings.ts). Typing filters the list
 * (substring, any case); ↑ ↓ move, Enter or a click picks, Esc closes. Free text is
 * never committed: leaving the box with an unfinished entry puts the last picked
 * role back. The small button resets to DEFAULT_ROLE.
 */
export function RoleCombobox({ value, onChange }: { value: string; onChange: (role: string) => void }) {
  const id = useId();
  const inputId = `${id}-input`;
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  // What is in the box while the list is open; null until the candidate types (then the whole list shows).
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const options = filterRoles(query ?? "");

  // Keep the highlighted role in view while the arrow keys move it.
  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function show(fromQuery: string | null) {
    const list = filterRoles(fromQuery ?? "");
    setOpen(true);
    // The whole list starts on the current role; a filtered one on its first match.
    setActive(fromQuery === null ? Math.max(list.indexOf(value), 0) : list.length ? 0 : -1);
  }

  function close() {
    setOpen(false);
    setQuery(null);
    setActive(-1);
  }

  function pick(role: string) {
    onChange(role);
    close();
    // The box keeps the focus (Enter, a click): select the role, so typing starts a new search.
    requestAnimationFrame(() => {
      if (document.activeElement === inputRef.current) inputRef.current?.select();
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return show(query);
      if (!options.length) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i < 0 ? 0 : (i + step + options.length) % options.length));
    } else if (e.key === "Enter") {
      if (open && options[active]) {
        e.preventDefault();
        pick(options[active]);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        close();
      }
    } else if (e.key === "Home" || e.key === "End") {
      if (open && options.length) {
        e.preventDefault();
        setActive(e.key === "Home" ? 0 : options.length - 1);
      }
    }
  }

  const activeId = open && active >= 0 ? `${id}-opt-${active}` : undefined;
  return (
    <div className="field">
      <label className="field-label" htmlFor={inputId}>
        Role
      </label>
      <div className="field-box combo">
        <input
          id={inputId}
          ref={inputRef}
          className="text-input combo-input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          autoComplete="off"
          spellCheck={false}
          value={query ?? value}
          placeholder="Type to search roles"
          onFocus={(e) => {
            e.currentTarget.select();
            show(null);
          }}
          onClick={() => !open && show(null)}
          onChange={(e) => {
            setQuery(e.target.value);
            show(e.target.value);
          }}
          onKeyDown={onKeyDown}
          // An unfinished entry is not a role: the last picked one comes back.
          onBlur={close}
        />
        <span className={`combo-chevron ${open ? "open" : ""}`} aria-hidden="true">
          <Icon name="expandMore" size={18} />
        </span>
        <button
          className="reset-btn"
          onClick={() => pick(DEFAULT_ROLE)}
          disabled={value === DEFAULT_ROLE}
          aria-label={`Reset role to "${DEFAULT_ROLE}"`}
          title={`Reset to "${DEFAULT_ROLE}"`}
        >
          <Icon name="refresh" size={16} />
        </button>
        {open && (
          <ul className="combo-list" id={listId} role="listbox" aria-label="Roles" ref={listRef}>
            {options.map((role, i) => (
              <li
                key={role}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={role === value}
                className={`combo-option ${i === active ? "active" : ""}`}
                // Keep the focus in the box, so the click is not lost to its blur.
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => i !== active && setActive(i)}
                onClick={() => pick(role)}
              >
                <span>{role}</span>
                {role === value && <Icon name="check" size={16} />}
              </li>
            ))}
            {!options.length && (
              <li className="combo-empty" role="presentation">
                No role matches "{query?.trim()}". Pick one from the list.
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
