import { useEffect, useRef } from "react";

/**
 * The microphone's loudness in the lobby, for the sound waves behind it. Only
 * measured in the browser: nothing is recorded or sent anywhere. Returns a ref
 * (0..1, updated every frame) so reading it does not re-render the page.
 */
export function useMicLevel(enabled: boolean) {
  const level = useRef(0);

  useEffect(() => {
    if (!enabled) {
      level.current = 0;
      return;
    }
    let stopped = false;
    let frame = 0;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    // Browsers keep a new AudioContext suspended until the page is clicked or a key is pressed.
    const resume = () => void ctx?.resume();

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        return; // No permission or no microphone: the waves keep their idle motion.
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      if (ctx.state === "suspended") {
        document.addEventListener("pointerdown", resume, { once: true });
        document.addEventListener("keydown", resume, { once: true });
      }
      const samples = new Float32Array(analyser.fftSize);
      const tick = () => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const s of samples) sum += s * s;
        const rms = Math.sqrt(sum / samples.length);
        // Same loudness curve as the call's speaking ring; the waves smooth it themselves.
        level.current = Math.min(1, Math.sqrt(rms) * 2.2);
        frame = requestAnimationFrame(tick);
      };
      tick();
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", resume);
      document.removeEventListener("keydown", resume);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
      level.current = 0;
    };
  }, [enabled]);

  return level;
}
