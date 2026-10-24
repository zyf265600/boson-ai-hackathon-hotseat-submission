import { useEffect, useState } from "react";

// Two pages, switched without reloading: "/" is the home page and "/prep" the
// prep room (difficulty, length, camera check, then the call). Vite serves
// index.html for any path, so both URLs also work when opened directly.

export const HOME = "/";
export const PREP = "/prep";

const listeners = new Set<() => void>();

/** Go to `path` and add it to the browser history, so Back returns here. */
export function navigate(path: string): void {
  if (location.pathname === path) return;
  history.pushState(null, "", path);
  window.scrollTo(0, 0);
  listeners.forEach((l) => l());
}

/** The current path; re-renders on navigate() and on the browser's Back / Forward. */
export function usePath(): string {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const update = () => setPath(location.pathname);
    listeners.add(update);
    window.addEventListener("popstate", update);
    return () => {
      listeners.delete(update);
      window.removeEventListener("popstate", update);
    };
  }, []);
  return path;
}
