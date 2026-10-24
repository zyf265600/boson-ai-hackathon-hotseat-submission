import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Turn } from "../api";
import { heardWords, type Playhead } from "../audio/playback";
import type { Speaker } from "../../shared/panel";
import type { Person } from "../../shared/people";

interface CaptionsProps {
  /** Names and colors per speaker, as chosen in the prep room. */
  people: Record<Speaker, Person>;
  turns: Turn[];
  /** Rough live text of the candidate's answer in progress; "" when none. */
  candidateLive: string;
  /** Where the panel line playing now has got; polled every animation frame. */
  playhead: () => Playhead;
}

/** Scrolled within this many pixels of the bottom counts as following along. */
const STICK_PX = 24;

/**
 * Live captions: everything said so far, scrollable back to the start. The
 * newest panel line appears word by word as it is heard; the candidate's answer
 * shows a rough live transcript until the real one replaces it.
 */
export function Captions({ people, turns, candidateLive, playhead }: CaptionsProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const last = turns[turns.length - 1];
  const [shown, setShown] = useState(0);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
  }, [turns.length, shown, candidateLive]);

  return (
    <div
      ref={boxRef}
      className="captions"
      onScroll={(e) => {
        const el = e.currentTarget;
        following.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
      }}
    >
      {turns.map((t) => (
        <p key={t.id} className="caption-line">
          <span className="caption-who" style={{ color: people[t.speaker].color }}>
            {people[t.speaker].name}
          </span>
          {t === last && t.speaker !== "candidate" ? (
            <LiveText key={t.id} text={t.text} playhead={playhead} onWords={setShown} />
          ) : (
            t.text
          )}
        </p>
      ))}
      {candidateLive && (
        <p className="caption-line">
          <span className="caption-who" style={{ color: people.candidate.color }}>
            {people.candidate.name}
          </span>
          {candidateLive}
        </p>
      )}
    </div>
  );
}

/** The words of `text` heard so far. */
function LiveText({
  text,
  playhead,
  onWords,
}: {
  text: string;
  playhead: () => Playhead;
  onWords: (n: number) => void;
}) {
  const words = text.split(/\s+/).filter(Boolean);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const target = heardWords(text, playhead());
      // Never take words back, e.g. when the next line resets the playhead.
      setShown((n) => Math.max(n, target));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, playhead]);

  useEffect(() => onWords(shown), [shown, onWords]);

  return <>{words.slice(0, shown).join(" ")}</>;
}
