"use client";

import { useEffect, useRef, useState } from "react";
import { ApiKeyDialog } from "@/components/ApiKeyDialog";
import { ChatMessage, type UiMessage } from "@/components/ChatMessage";
import { Disclaimer } from "@/components/Disclaimer";
import { QuotaBadge } from "@/components/QuotaBadge";
import { SampleQuestions } from "@/components/SampleQuestions";
import { maskKey, useApiKey } from "@/lib/keyStore";
import type { QuotaSnapshot } from "@/lib/quota";
import type { AssistantReply, ChatMessage as ApiMessage } from "@/lib/schema";
import { API_KEY_HEADER } from "@/lib/userKey";

const MAX_CHARS = 500;
const HISTORY_SENT = 6;

type ApiError = Error & { code?: string };

export default function Home() {
  const apiKey = useApiKey();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);
  const [serverKey, setServerKey] = useState<boolean | null>(null);
  /** null = closed; otherwise the dialog is open, optionally with a notice. */
  const [keyDialog, setKeyDialog] = useState<{ notice?: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const keyHeaders: Record<string, string> = apiKey ? { [API_KEY_HEADER]: apiKey } : {};

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Quota is per key, so refresh it whenever the visitor adds, changes or removes one.
  useEffect(() => {
    fetch("/api/quota", { headers: apiKey ? { [API_KEY_HEADER]: apiKey } : {} })
      .then((res) => (res.ok ? res.json() : null))
      .then((q: (QuotaSnapshot & { serverKeyConfigured: boolean }) | null) => {
        if (!q) return;
        setQuota(q);
        setServerKey(q.serverKeyConfigured);
      })
      .catch(() => {});
  }, [apiKey]);

  const needsKey = serverKey === false && !apiKey;

  async function ask(question: string) {
    const text = question.trim();
    if (!text || loading) return;
    if (needsKey) {
      setInput(text);
      setKeyDialog({ notice: "Add your Gemini API key to start asking questions." });
      return;
    }

    const next: UiMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setError(null);
    setLoading(true);

    const history: ApiMessage[] = next
      .slice(-HISTORY_SENT)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...keyHeaders },
        body: JSON.stringify({ messages: history }),
      });
      const data = await res.json();
      if (data.quota) setQuota(data.quota as QuotaSnapshot);
      if (!res.ok) {
        throw Object.assign(new Error(data.error ?? "Something went wrong."), { code: data.code });
      }
      const reply = data as AssistantReply;
      setMessages([...next, { role: "assistant", content: reply.answer, reply }]);
    } catch (err) {
      const e = err as ApiError;
      setMessages(messages);
      setInput(text);
      if (e.code === "key_required" || e.code === "key_invalid") {
        setKeyDialog({ notice: e.message });
      } else {
        setError(e);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b-[3px] border-highlight bg-brand-dark text-[#f8f9fa]">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Leave Policy Assistant</h1>
            <p className="text-xs font-light text-[#f8f9fa]/80">
              XYZ Company · HR-POL-004 v2.0 (sample)
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!needsKey && <QuotaBadge quota={quota} />}
            <button
              type="button"
              onClick={() => setKeyDialog({})}
              title={apiKey ? `Using your key ${maskKey(apiKey)}` : "Use your own Gemini API key"}
              className="rounded-sm border border-[#f8f9fa]/40 px-3 py-1.5 text-xs font-semibold transition hover:bg-[#f8f9fa]/10"
            >
              {apiKey ? "✓ Your API key" : "Use your API key"}
            </button>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setMessages([]);
                  setError(null);
                }}
                className="rounded-sm border border-[#f8f9fa]/40 px-3 py-1.5 text-xs font-semibold transition hover:bg-[#f8f9fa]/10"
              >
                New chat
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4">
        <main className="flex flex-1 flex-col gap-4 py-5">
          {messages.length === 0 ? (
            <div className="my-auto space-y-5">
              <div className="space-y-2">
                <h2 className="text-3xl font-light text-accent">Ask about leave at XYZ Company</h2>
                <p className="text-sm text-ink-soft">
                  Every answer quotes and cites the policy section it comes from. If the policy
                  doesn&apos;t cover something, I&apos;ll say so rather than guess.
                </p>
              </div>
              {needsKey && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-line border-l-4 border-l-highlight bg-surface px-4 py-3 text-sm">
                  <span>This site has no shared AI key. Add your free Gemini API key to start.</span>
                  <button
                    type="button"
                    onClick={() => setKeyDialog({})}
                    className="rounded-sm bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent hover:opacity-90"
                  >
                    Add API key
                  </button>
                </div>
              )}
              <SampleQuestions onPick={ask} disabled={loading} />
            </div>
          ) : (
            messages.map((m, i) => <ChatMessage key={i} message={m} />)
          )}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-ink-soft" role="status">
              <span className="size-2 animate-pulse rounded-full bg-accent" />
              Checking the policy…
            </div>
          )}
          <div ref={bottomRef} />
        </main>

        <footer className="sticky bottom-0 space-y-3 bg-background pt-2 pb-4">
          {error && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger"
            >
              <span>{error.message}</span>
              {error.code === "quota_exhausted" && !apiKey && (
                <button
                  type="button"
                  onClick={() => setKeyDialog({})}
                  className="rounded-sm bg-accent px-3 py-1 text-xs font-semibold text-on-accent hover:opacity-90"
                >
                  Add your API key
                </button>
              )}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
            className="flex items-end gap-2 rounded-md border border-line bg-surface p-2 shadow-sm focus-within:border-accent"
          >
            <label htmlFor="question" className="sr-only">
              Your question
            </label>
            <textarea
              id="question"
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, MAX_CHARS))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask(input);
                }
              }}
              rows={1}
              placeholder="e.g. Can I carry forward unused annual leave?"
              className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] text-ink outline-none placeholder:text-ink-soft"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition hover:opacity-90 disabled:opacity-40"
            >
              Ask
            </button>
          </form>
          <div className="flex justify-between gap-3 text-[11px] text-ink-soft">
            <span>Enter to send · Shift+Enter for a new line</span>
            <span>
              {input.length}/{MAX_CHARS}
            </span>
          </div>
          <Disclaimer />
        </footer>
      </div>

      {keyDialog && (
        <ApiKeyDialog
          currentKey={apiKey}
          notice={keyDialog.notice}
          sharedKeyAvailable={serverKey !== false}
          onClose={() => {
            setKeyDialog(null);
            setError(null);
          }}
        />
      )}
    </div>
  );
}
