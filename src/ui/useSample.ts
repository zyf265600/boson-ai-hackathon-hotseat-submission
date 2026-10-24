import { useEffect, useState } from "react";

// Voice samples in the prep room: one plays at a time across the whole page, so
// starting a sample on a card or in the voice picker stops any other.

let audio: HTMLAudioElement | null = null;
let playing: string | null = null;
const listeners = new Set<() => void>();

function set(next: string | null) {
  playing = next;
  listeners.forEach((l) => l());
}

/** Stop whatever sample is playing. */
export function stopSample(): void {
  audio?.pause();
  set(null);
}

/** Play the sample at `url` under the key `id`, or stop it if it is the one playing. */
export function toggleSample(id: string, url: string): void {
  if (playing === id) return stopSample();
  audio?.pause();
  audio = new Audio(url);
  const mine = audio;
  const done = () => {
    if (audio === mine) set(null);
  };
  mine.addEventListener("ended", done);
  mine.addEventListener("error", done);
  set(id);
  void mine.play().catch(done);
}

/** The key of the sample playing now, or null; re-renders when it changes. */
export function usePlayingSample(): string | null {
  const [now, setNow] = useState(playing);
  useEffect(() => {
    const update = () => setNow(playing);
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);
  return now;
}
