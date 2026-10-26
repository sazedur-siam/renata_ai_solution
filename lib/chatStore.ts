"use client";

import { useSyncExternalStore } from "react";
import type { UiMessage } from "@/components/ChatMessage";

/**
 * Keeps the visitor's chats in this browser's localStorage, like the API key in
 * keyStore.ts. Nothing is sent to the server. Storage can be unavailable or full,
 * so every access is wrapped: chats then simply last until the page is reloaded.
 */
const STORAGE_KEY = "leave-assistant:chats";
const CHANGE_EVENT = "leave-assistant:chats-change";
const MAX_CHATS = 50;
const TITLE_MAX = 60;

export type Chat = {
  id: string;
  title: string;
  messages: UiMessage[];
  createdAt: number;
  updatedAt: number;
};

export type ChatState = { chats: Chat[]; activeId: string | null };

const EMPTY: ChatState = { chats: [], activeId: null };

// useSyncExternalStore needs the same object back while storage is unchanged.
let cachedRaw: string | null = null;
let cachedState: ChatState = EMPTY;
// Used when storage is blocked, so the current session still works.
let memoryState: ChatState = EMPTY;

function read(): ChatState {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return memoryState;
  }
  if (raw === cachedRaw) return cachedState;
  cachedRaw = raw;
  try {
    const parsed = raw ? (JSON.parse(raw) as Partial<ChatState>) : null;
    cachedState = {
      chats: Array.isArray(parsed?.chats) ? parsed.chats : [],
      activeId: typeof parsed?.activeId === "string" ? parsed.activeId : null,
    };
  } catch {
    cachedState = EMPTY;
  }
  return cachedState;
}

function write(state: ChatState): void {
  const chats = [...state.chats].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CHATS);
  let next: ChatState = { ...state, chats };
  memoryState = next;
  try {
    // If storage is full, drop the oldest chats until it fits.
    for (;;) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        break;
      } catch (err) {
        if (next.chats.length <= 1) throw err;
        next = { ...next, chats: next.chats.slice(0, -1) };
      }
    }
  } catch {
    // Storage blocked: keep the chats in memory for this page only.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** A short default name taken from the first question. */
export function titleFrom(question: string): string {
  const oneLine = question.replace(/\s+/g, " ").trim();
  return oneLine.length > TITLE_MAX ? `${oneLine.slice(0, TITLE_MAX - 1)}…` : oneLine;
}

/**
 * Saves the messages of chat `id`. A new chat is named after `firstQuestion` and
 * opened; an existing one stays where it is, so a late reply never switches chats.
 */
export function saveMessages(id: string, messages: UiMessage[], firstQuestion: string): void {
  const state = read();
  const now = Date.now();
  const existing = state.chats.find((c) => c.id === id);
  const chat: Chat = existing
    ? { ...existing, messages, updatedAt: now }
    : { id, title: titleFrom(firstQuestion), messages, createdAt: now, updatedAt: now };
  write({
    chats: [chat, ...state.chats.filter((c) => c.id !== id)],
    activeId: existing ? state.activeId : id,
  });
}

export function renameChat(id: string, title: string): void {
  const name = title.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
  if (!name) return;
  const state = read();
  write({ ...state, chats: state.chats.map((c) => (c.id === id ? { ...c, title: name } : c)) });
}

export function deleteChat(id: string): void {
  const state = read();
  write({
    chats: state.chats.filter((c) => c.id !== id),
    activeId: state.activeId === id ? null : state.activeId,
  });
}

export function clearChats(): void {
  write(EMPTY);
}

/** Opens a saved chat, or starts a new one with null. */
export function setActiveChat(id: string | null): void {
  write({ ...read(), activeId: id });
}

export function newChatId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange); // other tabs
  window.addEventListener(CHANGE_EVENT, onChange); // this tab
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** All saved chats (newest first) and the open one. Always empty during server rendering. */
export function useChats(): ChatState {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

const COLLAPSED_KEY = "leave-assistant:sidebar-collapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSidebarCollapsed(collapsed: boolean): void {
  try {
    if (collapsed) localStorage.setItem(COLLAPSED_KEY, "1");
    else localStorage.removeItem(COLLAPSED_KEY);
  } catch {
    // Storage blocked: the sidebar just stays as it is.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Whether the desktop chat sidebar is collapsed. Expanded during server rendering. */
export function useSidebarCollapsed(): boolean {
  return useSyncExternalStore(subscribe, readCollapsed, () => false);
}
