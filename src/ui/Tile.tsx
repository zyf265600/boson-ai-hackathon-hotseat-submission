import { forwardRef, useEffect, useRef, useState } from "react";
import type { Speaker } from "../../shared/panel";
import type { Person } from "../../shared/people";
import { Icon } from "./icons";

/**
 * AVATAR=true: a panelist on camera: the still portrait, the silent listening loop played over
 * it while they are quiet (shared/settings.ts idleLoopFor; none without our own photo), and the
 * <video> their lines play in (AvatarStage owns it; the tile mounts it over the others).
 */
export interface Face {
  portrait: string;
  idle?: string;
  video: HTMLVideoElement;
}

interface TileProps {
  speaker: Speaker;
  /** Name, role and color shown for this seat. */
  person: Person;
  /** Holds the floor in the interview script (e.g. "thinking" badge, captions). */
  status?: string;
  muted?: boolean;
  video?: MediaStream | null;
  /** AVATAR=true: this panelist is on camera. */
  face?: Face;
}

/**
 * One participant, Meet style. The parent writes the live loudness into the
 * `--level` CSS variable (0..1) on this element every animation frame; the
 * ring around the avatar, the tile outline and the corner bars all read it,
 * so React never re-renders at 60 fps.
 */
export const Tile = forwardRef<HTMLDivElement, TileProps>(function Tile(
  { speaker, person, status, muted, video, face },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const faceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = video ?? null;
  }, [video]);

  // Mount the panelist's talking-head <video> over their portrait while they are on camera.
  const avatarVideo = face?.video;
  useEffect(() => {
    const box = faceRef.current;
    if (!box || !avatarVideo) return;
    box.appendChild(avatarVideo);
    return () => avatarVideo.remove();
  }, [avatarVideo]);

  return (
    <div ref={ref} className="tile" style={{ "--avatar": person.color } as React.CSSProperties}>
      {video ? (
        <video ref={videoRef} className="tile-video" autoPlay playsInline muted />
      ) : face ? (
        <div ref={faceRef} className="tile-face">
          <img className="tile-portrait" src={face.portrait} alt="" />
          {face.idle && <IdleLoop src={face.idle} speaking={face.video} />}
        </div>
      ) : (
        <div className="avatar-wrap">
          <div className="avatar-ring" />
          <div className="avatar">{person.name.charAt(0)}</div>
        </div>
      )}

      <div className="tile-corner">
        {muted ? (
          <span className="tile-muted" title="Microphone off">
            <Icon name="micOff" size={18} />
          </span>
        ) : (
          <span className="tile-bars" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}
      </div>

      {status && <div className="tile-status">{status}</div>}

      <div className="tile-name">
        {person.name}
        {speaker !== "candidate" && <span className="tile-role"> · {person.role}</span>}
      </div>
    </div>
  );
});

/**
 * A panelist's silent listening loop over their still portrait (Peize's idle loops from
 * feat/avatar-natural-transitions; the file already loops seamlessly, so one <video loop>).
 * Shown once it plays; paused while their line video is on (AvatarStage's .on) or the tab is
 * hidden, so it picks up where it was. Reduced motion or a file that fails to load: the still
 * portrait stays.
 */
function IdleLoop({ src, speaking }: { src: string; speaking: HTMLVideoElement }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [shown, setShown] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      if (still.matches || document.hidden || speaking.classList.contains("on")) video.pause();
      // Autoplay of a muted video is allowed; a refusal just leaves the still portrait.
      else void video.play().catch(() => {});
    };
    const observer = new MutationObserver(sync);
    observer.observe(speaking, { attributes: true, attributeFilter: ["class"] });
    document.addEventListener("visibilitychange", sync);
    still.addEventListener("change", sync);
    sync();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      still.removeEventListener("change", sync);
      video.pause();
    };
  }, [src, speaking]);

  if (failed) return null;
  return (
    <video
      ref={ref}
      className={`tile-idle${shown ? " on" : ""}`}
      src={src}
      muted
      loop
      playsInline
      preload="auto"
      disablePictureInPicture
      aria-hidden="true"
      onPlaying={() => setShown(true)}
      onError={() => setFailed(true)}
    />
  );
}
