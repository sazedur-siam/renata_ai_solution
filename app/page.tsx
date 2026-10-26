"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiKeyDialog } from "@/components/ApiKeyDialog";
import { ChatDrawer, ChatSidebar } from "@/components/ChatHistory";
import { ChatMessage, PendingReply, type UiMessage } from "@/components/ChatMessage";
import { ChatTitle } from "@/components/ChatTitle";
import { Disclaimer } from "@/components/Disclaimer";
import { SampleQuestions } from "@/components/SampleQuestions";
import {
  deleteChat,
  newChatId,
  renameChat,
  saveMessages,
  setActiveChat,
  useChats,
} from "@/lib/chatStore";
import { readChatResponse, type ApiError } from "@/lib/chatEvents";
import { maskKey, useApiKey } from "@/lib/keyStore";
import type { ChatMessage as ApiMessage, Stage } from "@/lib/schema";
import { API_KEY_HEADER } from "@/lib/userKey";

const MAX_CHARS = 500;
const HISTORY_SENT = 6;

const NO_MESSAGES: UiMessage[] = [];

export default function Home() {
  const apiKey = useApiKey();
  const { chats, activeId } = useChats();
  const active = chats.find((c) => c.id === activeId) ?? null;
  const messages = active?.messages ?? NO_MESSAGES;
  const [input, setInput] = useState("");
  /** The chat waiting for an answer, if any. */
  const [pendingId, setPendingId] = useState<string | null>(null);
  const loading = pendingId !== null;
  const [stage, setStage] = useState<Stage>("reading");
  /** The reply that has just arrived and is being typed out. */
  const [typing, setTyping] = useState<{ chatId: string; index: number } | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [serverKey, setServerKey] = useState<boolean | null>(null);
  /** null = closed; otherwise the dialog is open, optionally with a notice. */
  const [keyDialog, setKeyDialog] = useState<{ notice?: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const keyHeaders: Record<string, string> = apiKey ? { [API_KEY_HEADER]: apiKey } : {};

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Keep a reply that is being typed out in view as it grows.
  const followTyping = useCallback(() => bottomRef.current?.scrollIntoView({ block: "end" }), []);
  const typingDone = useCallback(() => setTyping(null), []);

  // Ask once whether the site has a shared key; without one, visitors must add their own.
  useEffect(() => {
    fetch("/api/quota")
      .then((res) => (res.ok ? res.json() : null))
      .then((q: { serverKeyConfigured: boolean } | null) => {
        if (q) setServerKey(q.serverKeyConfigured);
      })
      .catch(() => {});
  }, []);

  const needsKey = serverKey === false && !apiKey;

  function openChat(id: string | null) {
    setActiveChat(id);
    setError(null);
    setTyping(null);
  }

  async function ask(question: string) {
    const text = question.trim();
    if (!text || loading) return;
    if (needsKey) {
      setInput(text);
      setKeyDialog({ notice: "Add your Gemini API key to start asking questions." });
      return;
    }

    const id = active?.id ?? newChatId();
    const firstQuestion = messages[0]?.content ?? text;
    const next: UiMessage[] = [...messages, { role: "user", content: text }];
    saveMessages(id, next, firstQuestion);
    setInput("");
    setError(null);
    setPendingId(id);
    setStage("reading");
    setTyping(null);

    const history: ApiMessage[] = next
      .slice(-HISTORY_SENT)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...keyHeaders },
        body: JSON.stringify({ messages: history }),
      });
      const reply = await readChatResponse(res, setStage);
      setTyping({ chatId: id, index: next.length });
      saveMessages(
        id,
        [...next, { role: "assistant", content: reply.answer, reply }],
        firstQuestion,
      );
    } catch (err) {
      const e = err as ApiError;
      // Take the unanswered question back out, and drop a chat it would have started.
      if (messages.length > 0) saveMessages(id, messages, firstQuestion);
      else deleteChat(id);
      setInput(text);
      if (e.code === "key_required" || e.code === "key_invalid") {
        setKeyDialog({ notice: e.message });
      } else {
        setError(e);
      }
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex min-h-dvh">
      <ChatSidebar chats={chats} activeId={activeId} onOpen={openChat} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b-[3px] border-highlight bg-brand-dark text-[#f8f9fa]">
          <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                aria-label="Show chats"
                className="rounded-sm border border-[#f8f9fa]/40 p-1.5 transition hover:bg-[#f8f9fa]/10 md:hidden"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden>
                  <path d="M3 5h14v2H3zm0 4h14v2H3zm0 4h14v2H3z" />
                </svg>
              </button>
              <div>
                <h1 className="text-lg font-semibold tracking-tight">Leave Policy Assistant</h1>
                <p className="text-xs font-light text-[#f8f9fa]/80">
                  XYZ Company · HR-POL-004 v2.0 (sample)
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
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
                  onClick={() => openChat(null)}
                  className="rounded-sm border border-[#f8f9fa]/40 px-3 py-1.5 text-xs font-semibold transition hover:bg-[#f8f9fa]/10 md:hidden"
                >
                  New chat
                </button>
              )}
            </div>
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4">
          <main className="flex flex-1 flex-col gap-4 py-5">
            {active && (
              <ChatTitle
                key={active.id}
                title={active.title}
                onRename={(name) => renameChat(active.id, name)}
              />
            )}
            {messages.length === 0 ? (
              <div className="my-auto space-y-5">
                <div className="space-y-2">
                  <h2 className="text-3xl font-light text-accent">
                    Ask about leave at XYZ Company
                  </h2>
                  <p className="text-sm text-ink-soft">
                    Every answer quotes and cites the policy section it comes from. If the policy
                    doesn&apos;t cover something, I&apos;ll say so rather than guess.
                  </p>
                </div>
                {needsKey && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-line border-l-4 border-l-highlight bg-surface px-4 py-3 text-sm">
                    <span>
                      This site has no shared AI key. Add your free Gemini API key to start.
                    </span>
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
              messages.map((m, i) => (
                <ChatMessage
                  key={i}
                  message={m}
                  animate={typing?.chatId === activeId && typing.index === i}
                  onGrow={followTyping}
                  onDone={typingDone}
                />
              ))
            )}
            {pendingId !== null && pendingId === activeId && <PendingReply stage={stage} />}
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
      </div>

      {historyOpen && (
        <ChatDrawer
          chats={chats}
          activeId={activeId}
          onOpen={openChat}
          onClose={() => setHistoryOpen(false)}
        />
      )}

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
