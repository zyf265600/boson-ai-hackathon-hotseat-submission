import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Which scene of a pinned scroll sequence is showing. The track is `count`
 * window heights tall; scene i owns the stretch around i window heights down.
 * The answer is a whole number that only changes when the scroll position
 * crosses the halfway line between two scenes, plus `HYSTERESIS` window
 * heights, so the scene does not flicker when the page rests near a line.
 * Scrolling back crosses the same lines and restores the earlier scene.
 * The raw position is also written to the track as `--progress` (window
 * heights scrolled, a fraction), for effects that follow the scroll in CSS.
 */
const HYSTERESIS = 0.04;

export function useScrollScene(track: RefObject<HTMLElement | null>, count: number): number {
  const [scene, setScene] = useState(0);
  const current = useRef(0);

  useEffect(() => {
    // Measured right in the scroll event: one getBoundingClientRect, and React only hears of a change of scene.
    const measure = () => {
      const el = track.current;
      if (!el) return;
      const vh = window.innerHeight || 1;
      // How many window heights the track has scrolled past the top of the window.
      const progress = -el.getBoundingClientRect().top / vh;
      el.style.setProperty("--progress", progress.toFixed(4));
      const nearest = Math.min(count - 1, Math.max(0, Math.round(progress)));
      if (nearest !== current.current && Math.abs(progress - current.current) >= 0.5 + HYSTERESIS) {
        current.current = nearest;
        setScene(nearest);
      }
    };
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [track, count]);

  return scene;
}
