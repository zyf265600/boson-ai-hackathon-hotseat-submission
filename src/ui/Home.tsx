import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { PEOPLE } from "../../shared/people";
import { INTERVIEW_LENGTHS } from "../../shared/panel";
import { LANGUAGES } from "../../shared/languages";
import { PRESET_VOICES, VOICE_CATALOG } from "../../shared/settings";
import { LiveBars, Waveform } from "./Waveform";
import { UserMenu, saveRole, savedRole, type Role } from "./UserMenu";
import { useScrollScene } from "./useScrollScene";
import { PREP, navigate } from "../router";

// The home page is one pinned, full-screen stage that changes scene as you
// scroll. A scene holds until the scroll crosses the line to the next one
// (useScrollScene), then the next scene cuts in (a 100 ms opacity step). From
// that line to the scene's own stop, the scroll itself brings it into focus:
// the photo goes from blurred to sharp and the text rises into place, fading
// in (home.css, --progress). Not the first scene; the last one's text stays put.
//
// Photos from Unsplash (free under the Unsplash License), saved in public/home/.
// People are shown from behind or in silhouette, never as recognizable portraits.

interface Photo {
  src: string;
  by: string;
  /** The photo's Unsplash page id, for the credit. */
  page: string;
}

interface Scene {
  /** Anchor name for the header links. */
  id: string;
  photo: Photo;
  /**
   * How the figure fills the screen: CSS object-position, and a scale above 1
   * that blows it up past the screen edges so the figure dominates the frame.
   */
  focus: string;
  scale: number;
  /** Where the text sits against the figure. */
  align: "center" | "left" | "right";
  content: ReactNode;
}

const { moderator, technical_lead: lead, mentor } = PEOPLE;
const SHORTEST = INTERVIEW_LENGTHS[0];
const LONGEST = INTERVIEW_LENGTHS.at(-1);
const LANGUAGE_COUNT = Object.keys(LANGUAGES).length;
/** Every interviewer a seat can be given: the catalog voices and the presets, rounded down to "100+". */
const INTERVIEWERS = VOICE_CATALOG.length + PRESET_VOICES.length;
const INTERVIEWER_COUNT = `${Math.floor(INTERVIEWERS / 10) * 10}+`;

/**
 * A scene's text, at most two sentences of about 70 characters: each starts on
 * its own line and fits one line on a desktop; where one does not (a phone), it
 * wraps into lines of even length (home.css .home-lines), never a lone word.
 */
function Lines({ children, className }: { children: string[]; className?: string }) {
  return (
    <p className={className ? `home-lines ${className}` : "home-lines"}>
      {children.map((sentence) => (
        <span key={sentence}>{sentence}</span>
      ))}
    </p>
  );
}

function StepOut() {
  return (
    <button className="join step-out" onClick={() => navigate(PREP)}>
      Step out of your comfort zone
      <span aria-hidden="true">→</span>
    </button>
  );
}

const SCENES: Scene[] = [
  {
    id: "top",
    photo: { src: "/home/headphones-desk.jpg", by: "Gustavo Alejandro Espinosa Reyes", page: "8WtjnY3p0L4" },
    focus: "50% 28%",
    scale: 1.2,
    align: "center",
    content: (
      <div className="home-hero">
        <p className="eyebrow">
          <LiveBars />
          Live AI panel interview
        </p>
        <h1>
          Take the hot seat{" "}
          <span className="line">
            before the <span className="grad">real one.</span>
          </span>
        </h1>
        <Lines className="lobby-lede">
          {[
            `Three AI interviewers dig into a project you built and push back in real time, in any of ${LANGUAGE_COUNT} languages.`,
          ]}
        </Lines>
        <div className="home-cta">
          <StepOut />
          <a className="home-secondary" href="#how">
            See how it works
          </a>
        </div>
      </div>
    ),
  },
  {
    id: "panel",
    photo: { src: "/home/panel-silhouettes.jpg", by: "Andy Tyler", page: "cbPIFDK7NqE" },
    focus: "50% 100%",
    scale: 1.35,
    align: "center",
    content: (
      <>
        <p className="home-kicker">The panel</p>
        {/* The number of interviewers, called out large (user, 2026-10-23). */}
        <h2>
          <span className="home-stat">{INTERVIEWER_COUNT}</span>
          interviewers to choose from.
        </h2>
        <Lines>
          {[
            "A moderator runs the room; a lead and a mentor ask the follow-ups.",
            `Keep ${moderator.name}, ${lead.name} and ${mentor.name}, or give each seat a new name and voice.`,
          ]}
        </Lines>
        <Lines className="home-note">
          {["The moderator speaks through Higgs Realtime; the two interviewers through Higgs TTS 3."]}
        </Lines>
      </>
    ),
  },
  {
    id: "listens",
    photo: { src: "/home/laptop-night.jpg", by: "Chirayu Trivedi", page: "nPJFU_zTVhA" },
    focus: "70% 60%",
    scale: 1.25,
    align: "left",
    content: (
      <>
        <p className="home-kicker">It listens</p>
        <h2>Take your time. The panel waits.</h2>
        <Lines>
          {[
            "Pause to think and nobody jumps in; the panel waits until you finish.",
            "Ask for a repeat or an explanation, or cut in with headphones on.",
          ]}
        </Lines>
      </>
    ),
  },
  {
    id: "asks",
    photo: { src: "/home/desks-windows.jpg", by: "Sam", page: "xzZ0PZobjek" },
    focus: "85% 70%",
    scale: 1.4,
    align: "left",
    content: (
      <>
        <p className="home-kicker">It asks</p>
        <h2>Every question comes from your answer.</h2>
        <Lines>
          {[
            "No question bank: every follow-up builds on your own words and role.",
            "Vague answers get pressed, and nothing is asked twice.",
          ]}
        </Lines>
      </>
    ),
  },
  {
    id: "how",
    photo: { src: "/home/talking-hall.jpg", by: "Michael Shtern", page: "MN6mNZ9vgXw" },
    focus: "30% 60%",
    scale: 1.3,
    align: "right",
    content: (
      <>
        <p className="home-kicker">How it works</p>
        <h2>Pick a role. Introduce one project. Answer until time is up.</h2>
        <Lines>
          {[
            "In the prep room, set the role, company, language and difficulty.",
            `Interviews run ${SHORTEST} to ${LONGEST} minutes, and the panel closes on time.`,
          ]}
        </Lines>
      </>
    ),
  },
  {
    id: "ready",
    photo: { src: "/home/stage-mic.jpg", by: "Porus Nagare", page: "hPXnueqSTIE" },
    focus: "40% 40%",
    scale: 1.2,
    align: "center",
    content: (
      <>
        <h2>Ready when you are.</h2>
        <Lines>{["Wear headphones and bring one project you built."]}</Lines>
        <StepOut />
      </>
    ),
  },
];

/** Scroll so scene `i` is showing (the header links). */
function goTo(track: HTMLElement | null, i: number) {
  if (!track) return;
  window.scrollTo({ top: track.offsetTop + i * window.innerHeight, behavior: "smooth" });
}

/** The home page at "/": a pinned sequence of full-screen scenes, and the way into the prep room. */
export function Home() {
  const [role, setRole] = useState<Role>(savedRole);
  const track = useRef<HTMLDivElement>(null);
  const scene = useScrollScene(track, SCENES.length);

  // Each scroll ends on a scene (one stop per window height), only while the home page is shown.
  useEffect(() => {
    document.documentElement.classList.add("snap");
    return () => document.documentElement.classList.remove("snap");
  }, []);

  const link = (id: string) => ({
    href: `#${id}`,
    onClick: (e: MouseEvent) => {
      e.preventDefault();
      goTo(
        track.current,
        SCENES.findIndex((s) => s.id === id),
      );
    },
  });

  return (
    <div className="lobby home">
      <div className="home-track" ref={track} style={{ height: `${SCENES.length * 100}svh` }}>
        {/* Scroll stops, one per scene; the stage below stays pinned while they pass. */}
        {SCENES.map((s, i) => (
          <div key={s.id} id={s.id} className="home-stop" style={{ top: `${i * 100}svh` }} aria-hidden="true" />
        ))}

        <div className="home-stage" data-scene={SCENES[scene].id}>
          {/* Every scene is in the page from the start, so its photo is loaded before its cut. */}
          {SCENES.map((s, i) => (
            <section
              key={s.id}
              className={`home-scene align-${s.align}`}
              data-active={i === scene}
              aria-hidden={i !== scene}
              style={{ "--scene": i } as CSSProperties}
            >
              <div
                className={i > 0 ? "home-figure focusing" : "home-figure"}
                style={{
                  backgroundImage: `url(${s.photo.src})`,
                  backgroundPosition: s.focus,
                  transform: `scale(${s.scale})`,
                  transformOrigin: s.focus,
                }}
              />
              <div className={i === 0 ? "home-hero-wrap" : i < SCENES.length - 1 ? "home-copy rising" : "home-copy"}>
                {s.content}
              </div>
            </section>
          ))}

          {scene === 0 && <Waveform />}

          <header className="lobby-top">
            <span className="brand">
              <span className="brand-mark">H</span>
              <span className="brand-word">HotSeat</span>
            </span>
            <nav className="home-nav" aria-label="Sections">
              <a {...link("panel")}>The panel</a>
              <a {...link("listens")}>Features</a>
              <a {...link("how")}>How it works</a>
            </nav>
            <div className="lobby-top-right">
              <UserMenu
                role={role}
                onRole={(r) => {
                  setRole(r);
                  saveRole(r);
                }}
              />
            </div>
          </header>

          <ol className="home-dots" aria-label="Scenes">
            {SCENES.map((s, i) => (
              <li key={s.id}>
                <button
                  className={i === scene ? "on" : ""}
                  aria-label={`Scene ${i + 1}`}
                  aria-current={i === scene}
                  onClick={() => goTo(track.current, i)}
                />
              </li>
            ))}
          </ol>

          {scene === SCENES.length - 1 && (
            <footer className="home-footer">
              Built for the Boson AI × MScAC Higgs Audio Hackathon 2026 · Photos from Unsplash by{" "}
              {SCENES.map((s, i) => (
                <span key={s.id}>
                  <a href={`https://unsplash.com/photos/${s.photo.page}`} target="_blank" rel="noreferrer">
                    {s.photo.by}
                  </a>
                  {i < SCENES.length - 1 ? ", " : ""}
                </span>
              ))}
              <br />© 2026 Yifei Zhang, Junwei Quan, Peize Zhang and Jingwen Zhong. All rights reserved.
            </footer>
          )}
        </div>
      </div>
    </div>
  );
}
