'use client';

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'buffer-motion-paused';
const CHANGE_EVENT = 'buffer-motion-change';
let memoryPaused = false;
const serverSnapshot = () => false;

function pausedSnapshot() {
  try { return localStorage.getItem(STORAGE_KEY) === 'true' || memoryPaused; }
  catch { return memoryPaused; }
}
function subscribePaused(onChange: () => void) {
  const changed = () => {
    try { memoryPaused = localStorage.getItem(STORAGE_KEY) === 'true'; } catch { /* In-memory preference still works when storage is unavailable. */ }
    onChange();
  };
  window.addEventListener('storage', changed);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => { window.removeEventListener('storage', changed); window.removeEventListener(CHANGE_EVENT, onChange); };
}
function setPaused(value: boolean) {
  memoryPaused = value;
  try { localStorage.setItem(STORAGE_KEY, String(value)); } catch { /* Persistence is optional for decorative motion. */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
const toggleMotion = () => setPaused(!pausedSnapshot());

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    onChange => {
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    serverSnapshot,
  );
}

export function useMotionPreference() {
  const paused = useSyncExternalStore(subscribePaused, pausedSnapshot, serverSnapshot);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  return { paused, setPaused, toggleMotion, reducedMotion };
}
