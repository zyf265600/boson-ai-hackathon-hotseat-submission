import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

/** Who is using this browser: admins also get test mode and the inspector. */
export type Role = "user" | "admin";

const ROLE_KEY = "hotseat.role";

/** The role picked last time in this browser (shared by the home page and the prep room); user by default. */
export function savedRole(): Role {
  try {
    return localStorage.getItem(ROLE_KEY) === "admin" ? "admin" : "user";
  } catch {
    return "user";
  }
}

export function saveRole(role: Role): void {
  try {
    localStorage.setItem(ROLE_KEY, role);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
}

const ROLES: { role: Role; name: string; note: string }[] = [
  { role: "user", name: "User", note: "Practice interviews" },
  { role: "admin", name: "Admin", note: "Also shows test mode and the inspector" },
];

/** The session chip in the lobby's top right; opens a menu to switch between user and admin. */
export function UserMenu({ role, onRole }: { role: Role; onRole: (role: Role) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Close on a click outside the menu or on Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = ROLES.find((r) => r.role === role) ?? ROLES[0];

  return (
    <div className="user-menu" ref={box}>
      <button
        className={`user-chip ${open ? "open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className={`user-avatar ${role}`}>
          <Icon name={role === "admin" ? "shield" : "person"} size={16} />
        </span>
        <span className="user-name">{current.name}</span>
        <Icon name="expandMore" size={18} />
      </button>
      {open && (
        <div className="user-pop" role="menu">
          <p className="user-pop-head">Signed in on this browser as</p>
          {ROLES.map((r) => (
            <button
              key={r.role}
              role="menuitemradio"
              aria-checked={r.role === role}
              className={`user-option ${r.role === role ? "on" : ""}`}
              onClick={() => {
                onRole(r.role);
                setOpen(false);
              }}
            >
              <span className={`user-avatar ${r.role}`}>
                <Icon name={r.role === "admin" ? "shield" : "person"} size={16} />
              </span>
              <span className="user-option-text">
                <strong>{r.name}</strong>
                <small>{r.note}</small>
              </span>
              {r.role === role && <Icon name="check" size={18} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
