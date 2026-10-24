// Confetti when the interview ends, while the report is being written (src/ui/Report.tsx):
// three bursts shot up from the bottom of the screen (left, right, then middle), 0.7 s
// apart, that reach the top and drift down slowly over the whole screen. One full-screen
// canvas that ignores the pointer and removes itself when the last piece has fallen.
// The motion is in seconds, not frames: it moved twice as fast on a 120 Hz screen, and
// with drag on the way up the pieces stopped at about half height (2026-10-23, the user
// asked for slower, from the bottom up to the whole screen).

const COLORS = ["#3563c9", "#2a9d78", "#7fd3e3", "#5b8df0", "#f5c542", "#ef6f8f", "#a77bf3", "#ffffff"];
/** Each burst: where on the bottom edge it leaves (share of the width) and which way it leans (degrees from straight up). */
const BURSTS = [
  { at: 0.2, lean: 12 },
  { at: 0.8, lean: -12 },
  { at: 0.5, lean: 0 },
];
const BURST_GAP_S = 0.7;
const PIECES_PER_BURST = 140;
/** Seconds a piece takes to rise to the top of the screen. */
const RISE_S = 1.6;
/** Falling speed, pixels per second: pieces flutter down instead of dropping. */
const FALL_MIN = 90;
const FALL_MAX = 170;
/** How fast sideways speed dies away (per second), so a burst fans out and then hangs. */
const SIDE_DRAG = 0.9;
/** Longest run before the canvas goes regardless. */
const MAX_S = 16;

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fall: number;
  sway: number;
  phase: number;
  angle: number;
  spin: number;
  w: number;
  h: number;
  color: string;
  round: boolean;
  /** Seconds before it leaves the bottom: its burst's start plus a little spread. */
  delay: number;
}

export function confetti(): void {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, { position: "fixed", inset: "0", zIndex: "60", pointerEvents: "none" });
  document.body.appendChild(canvas);
  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas.remove();
  ctx.scale(dpr, dpr);

  // Gravity so that a piece launched to the full height gets there in RISE_S.
  const gravity = (2 * height) / RISE_S ** 2;
  const pieces: Piece[] = BURSTS.flatMap(({ at, lean }, burst) =>
    Array.from({ length: PIECES_PER_BURST }, () => {
      // Each piece peaks somewhere between 55% of the way up and the top edge.
      const rise = height * (0.55 + Math.random() * 0.5);
      const speed = Math.sqrt(2 * gravity * rise);
      const angle = ((-90 + lean + (Math.random() - 0.5) * 50) * Math.PI) / 180;
      return {
        x: width * at + (Math.random() - 0.5) * 80,
        y: height + 10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        fall: FALL_MIN + Math.random() * (FALL_MAX - FALL_MIN),
        sway: 20 + Math.random() * 40,
        phase: Math.random() * Math.PI * 2,
        angle: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 8,
        w: 6 + Math.random() * 6,
        h: 4 + Math.random() * 5,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        round: Math.random() < 0.25,
        delay: burst * BURST_GAP_S + Math.random() * 0.2,
      };
    }),
  );

  const started = performance.now();
  let last = started;
  const frame = (now: number) => {
    const t = (now - started) / 1000;
    // Capped, so a hidden tab coming back does not jump the pieces.
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, width, height);
    let alive = 0;
    for (const p of pieces) {
      if (t < p.delay) {
        alive++;
        continue;
      }
      p.vx *= Math.exp(-SIDE_DRAG * dt);
      // Up under gravity alone, then down no faster than its fall speed.
      p.vy = Math.min(p.vy + gravity * dt, p.fall);
      p.x += (p.vx + (p.vy > 0 ? Math.sin(t * 2.2 + p.phase) * p.sway : 0)) * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
      // Gone once it falls back below the screen (after rising).
      if (p.y > height + 20 && p.vy > 0) continue;
      alive++;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      // Flutter: the piece seems to turn over as it falls.
      ctx.scale(1, Math.cos(p.angle * 2));
      ctx.fillStyle = p.color;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.h / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    }
    if (alive > 0 && t < MAX_S) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
