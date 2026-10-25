"use client";

import { useEffect, useRef, useState } from "react";
import { clearApiKey, isRemembered, maskKey, saveApiKey } from "@/lib/keyStore";
import { API_KEY_HEADER, isPlausibleApiKey } from "@/lib/userKey";

type Props = {
  currentKey: string | null;
  /** Why the dialog opened, e.g. "Google rejected your Gemini API key." */
  notice?: string | null;
  /** False when the server has no key of its own, so a visitor key is required. */
  sharedKeyAvailable: boolean;
  onClose: () => void;
};

/** Mounted only while open; uses the native <dialog> for focus trapping and Esc. */
export function ApiKeyDialog({ currentKey, notice, sharedKeyAvailable, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState("");
  const [remember, setRemember] = useState(() => (currentKey ? isRemembered() : true));
  const [show, setShow] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  async function save() {
    const key = draft.trim();
    if (!isPlausibleApiKey(key)) {
      setMessage("That doesn't look like a Gemini API key. Keys usually start with “AIza”.");
      return;
    }
    setChecking(true);
    setMessage(null);
    try {
      const res = await fetch("/api/key/verify", {
        method: "POST",
        headers: { [API_KEY_HEADER]: key },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't check the key. Please try again.");
      if (!data.valid) {
        setMessage("Google rejected this key. Please copy it again from AI Studio.");
        return;
      }
      saveApiKey(key, remember);
      onClose();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="api-key-title"
      className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-sm border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-[#03366e]/50"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="space-y-4 p-5"
      >
        <div className="space-y-1">
          <h2 id="api-key-title" className="text-lg font-semibold text-accent">
            Use your own Gemini API key
          </h2>
          <p className="text-sm text-ink-soft">
            {sharedKeyAvailable
              ? "This demo runs on a shared free key with a small daily limit. Add your own free key to keep asking questions at your convenience."
              : "This site needs a Gemini API key to answer questions. Add your own free key to get started."}
          </p>
        </div>

        {notice && (
          <p role="alert" className="rounded-sm bg-warn-soft px-3 py-2 text-sm text-warn">
            {notice}
          </p>
        )}

        {currentKey && (
          <div className="flex items-center justify-between gap-3 rounded-sm border border-line bg-muted-soft px-3 py-2 text-sm">
            <span>
              Current key: <code className="font-mono">{maskKey(currentKey)}</code>
            </span>
            <button
              type="button"
              onClick={() => {
                clearApiKey();
                onClose();
              }}
              className="text-xs font-semibold text-danger hover:underline"
            >
              Remove key
            </button>
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="api-key" className="text-sm font-semibold">
            {currentKey ? "Replace with a new key" : "API key"}
          </label>
          <div className="flex gap-2">
            <input
              id="api-key"
              type={show ? "text" : "password"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="AIza…"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              className="min-w-0 flex-1 rounded-sm border border-line bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="rounded-sm border border-line px-3 text-xs font-semibold text-ink-soft hover:border-accent hover:text-accent"
            >
              {show ? "Hide" : "Show"}
            </button>
          </div>
          <p className="text-xs text-ink-soft">
            Get a free key at{" "}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-accent underline"
            >
              aistudio.google.com/apikey
            </a>
            .
          </p>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="mt-0.5 accent-[#054f9f]"
          />
          <span>
            Remember on this device
            <span className="block text-xs text-ink-soft">
              Saved in this browser&apos;s local storage. Untick to forget it when you close the
              tab.
            </span>
          </span>
        </label>

        {message && (
          <p role="alert" className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">
            {message}
          </p>
        )}

        <p className="text-xs leading-relaxed text-ink-soft">
          Your key stays in your browser. It is sent only to this site&apos;s server with each
          question, used for that request, and never logged or stored on the server. Anyone using
          this browser profile could read it, so remove it on shared computers.
        </p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-line px-4 py-2 text-sm font-semibold text-ink-soft hover:border-accent hover:text-accent"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={checking || !draft.trim()}
            className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:opacity-90 disabled:opacity-40"
          >
            {checking ? "Checking…" : "Save & verify"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
