import { useEffect, useRef, type RefObject } from "react";

// Decorative sound wave behind the lobby: a row of rounded bars, like the
// waveform of a voice message. A slow sum of sines drifts along the row so it
// moves on its own; the microphone's loudness makes the bars taller.

/** Bar width and the gap between bars, in CSS pixels. */
const BAR = 7;
const GAP = 6;
/** Bar height at rest, and at full loudness, as a share of the canvas height. */
const IDLE = 0.22;
const LOUD = 0.95;
/**
 * Damping, per frame at 60 fps: the loudness eases toward the microphone's
 * value, then each bar eases toward its own target, so nothing jumps.
 */
const LEVEL_EASE = 0.05;
const BAR_EASE = 0.1;
/** How far the pattern drifts per second, in bars. */
const DRIFT = 1.2;

/** The bar's share of the full height at row position `x` (in bars) and time `t` (seconds). */
function shape(x: number, t: number): number {
  const p = x - t * DRIFT;
  const v = 0.5 * Math.sin(p * 0.11 + 0.4) + 0.3 * Math.sin(p * 0.27 + 1.7) + 0.2 * Math.sin(p * 0.53 + t * 0.9 + 2.9);
  // 0..1, never quite zero so every bar shows as a dot at least.
  return 0.12 + 0.88 * (0.5 + 0.5 * v) ** 1.6;
}

/** `level`: microphone loudness 0..1 (useMicLevel); without it the bars only drift. */
export function Waveform({ level }: { level?: RefObject<number> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let heights: number[] = [];
    let loud = 0;
    let frame = 0;
    const start = performance.now();

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Start at the resting shape, so the first frame already shows the wave.
      const t = still ? 0 : (performance.now() - start) / 1000;
      heights = Array.from({ length: Math.ceil(width / (BAR + GAP)) + 1 }, (_, i) => shape(i, t) * IDLE * height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const draw = () => {
      const t = still ? 0 : (performance.now() - start) / 1000;
      loud += ((level?.current ?? 0) - loud) * LEVEL_EASE;
      ctx.clearRect(0, 0, width, height);
      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, "rgba(53, 99, 201, 0.28)");
      gradient.addColorStop(0.5, "rgba(42, 157, 120, 0.32)");
      gradient.addColorStop(1, "rgba(53, 99, 201, 0.28)");
      ctx.fillStyle = gradient;
      const mid = height / 2;
      for (let i = 0; i < heights.length; i++) {
        const target = shape(i, t) * (IDLE + (LOUD - IDLE) * loud) * height;
        heights[i] += (target - heights[i]) * BAR_EASE;
        const h = Math.max(BAR, heights[i]);
        ctx.beginPath();
        ctx.roundRect(i * (BAR + GAP), mid - h / 2, BAR, h, BAR / 2);
        ctx.fill();
      }
      frame = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [level]);

  return (
    <div className="waveform" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}

/** Five bars that rise and fall like a live audio meter. */
export function LiveBars() {
  return (
    <span className="live-bars" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <i key={i} style={{ animationDelay: `${i * -0.18}s` }} />
      ))}
    </span>
  );
}
