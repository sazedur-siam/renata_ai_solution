"use client";

import { useSyncExternalStore } from "react";

/**
 * Keeps the visitor's own Gemini API key in the browser only: localStorage when
 * "remember on this device" is on, otherwise sessionStorage (cleared when the tab
 * closes). Storage can be unavailable (private mode, blocked site data), so every
 * access is wrapped and the app simply falls back to the shared key.
 */
const STORAGE_KEY = "leave-assistant:gemini-api-key";
const CHANGE_EVENT = "leave-assistant:key-change";

function read(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveApiKey(key: string, remember: boolean): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    (remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, key.trim());
  } catch {
    // Storage blocked: the key can't be kept, the shared key stays in use.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function clearApiKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function isRemembered(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange); // other tabs
  window.addEventListener(CHANGE_EVENT, onChange); // this tab
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** The stored key, or null. Always null during server rendering. */
export function useApiKey(): string | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

/** "AIzaSy…f3Qk": enough to recognise a key without showing it. */
export function maskKey(key: string): string {
  return key.length <= 10 ? "••••" : `${key.slice(0, 6)}…${key.slice(-4)}`;
}
