import { useState } from "react";
import { initials } from "./interviewers";
import { OWN_PORTRAIT_DIR } from "../../shared/settings";

/**
 * A round portrait (shared/settings.ts photoFor); initials on `color` when there is none
 * (the preset voices, one catalog voice without pictures) or it fails to load. Our own
 * photos are 4:3 with the person seated at a desk, so the circle is cut around the face
 * (.own-photo).
 */
export function VoiceAvatar({
  src,
  name,
  color = "var(--m-tile)",
  className,
}: {
  src?: string;
  /** The initials come from it ("The Calm Helpdesk" -> "CH"). */
  name: string;
  color?: string;
  className: string;
}) {
  const [failed, setFailed] = useState(false);
  if (src && !failed)
    return (
      <img
        className={`${className} ${src.startsWith(OWN_PORTRAIT_DIR) ? "own-photo" : ""}`}
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  return (
    <span className={className} style={{ background: color }} aria-hidden="true">
      {initials(name.replace(/^The /, ""))}
    </span>
  );
}
