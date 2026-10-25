"use client";

import { useEffect, useRef, useState } from "react";
import { ChatMessage, type UiMessage } from "@/components/ChatMessage";
import { Disclaimer } from "@/components/Disclaimer";
import { QuotaBadge } from "@/components/QuotaBadge";
import { SampleQuestions } from "@/components/SampleQuestions";
import type { QuotaSnapshot } from "@/lib/quota";
import type { AssistantReply, ChatMessage as ApiMessage } from "@/lib/schema";

const MAX_CHARS = 500;
const HISTORY_SENT = 6;

export default function Home() {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    fetch("/api/quota")
      .then((res) => (res.ok ? res.json() : null))
      .then((q: QuotaSnapshot | null) => q && setQuota(q))
      .catch(() => {});
  }, []);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || loading) return;

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const data = await res.json();
      if (data.quota) setQuota(data.quota as QuotaSnapshot);
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      const reply = data as AssistantReply;
      setMessages([...next, { role: "assistant", content: reply.answer, reply }]);
    } catch (err) {
      setError((err as Error).message);
      setMessages(messages);
      setInput(text);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b-[3px] border-highlight bg-brand-dark text-[#f8f9fa]">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Leave Policy Assistant</h1>
            <p className="text-xs font-light text-[#f8f9fa]/80">
              XYZ Company · HR-POL-004 v2.0 (sample)
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <QuotaBadge quota={quota} />
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
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
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
    </div>
  );
}
