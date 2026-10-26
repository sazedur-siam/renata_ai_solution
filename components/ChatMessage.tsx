"use client";

import { useEffect, useMemo, useState } from "react";
import type { AssistantReply, Stage, Status } from "@/lib/schema";
import { CitationChip } from "./CitationChip";

/** Badge above each answer; small talk gets none, it isn't a policy answer. */
const STATUS_LABEL: Record<Status, { text: string; className: string } | null> = {
  answered: { text: "Answered from policy", className: "bg-ok-soft text-ok" },
  partial: { text: "Partly covered by policy", className: "bg-warn-soft text-warn" },
  not_covered: { text: "Not in policy", className: "bg-muted-soft text-ink-soft" },
  own_data: { text: "Your personal records", className: "bg-muted-soft text-ink-soft" },
  privacy_refusal: { text: "Privacy protected", className: "bg-danger-soft text-danger" },
  small_talk: null,
};

const STAGE_LABEL: Record<Stage, string> = {
  reading: "Reading the policy",
  writing: "Writing the answer",
  fallback: "The main model is busy, trying a backup model",
  checking: "Checking citations against the policy",
};

/** Typing speed for a new answer: one step per tick, and never longer than ~2.4 s. */
const TICK_MS = 30;
const MAX_TICKS = 80;

export type UiMessage =
  { role: "user"; content: string } | { role: "assistant"; content: string; reply: AssistantReply };

type Props = {
  message: UiMessage;
  /** Type the answer out word by word (a reply that has just arrived). */
  animate?: boolean;
  /** Called as the typed text grows, e.g. to keep it scrolled into view. */
  onGrow?: () => void;
  /** Called once the answer is fully shown. */
  onDone?: () => void;
};

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Reveals `text` a few words at a time; the whole text at once when not animating. */
function useTypewriter(text: string, animate: boolean) {
  // Split keeping the whitespace, so line breaks survive the reveal.
  const tokens = useMemo(() => text.split(/(\s+)/), [text]);
  const [shown, setShown] = useState(() =>
    animate && !prefersReducedMotion() ? 0 : tokens.length,
  );

  useEffect(() => {
    if (shown >= tokens.length) return;
    const step = Math.max(2, Math.ceil(tokens.length / MAX_TICKS));
    const timer = setTimeout(() => setShown((n) => Math.min(tokens.length, n + step)), TICK_MS);
    return () => clearTimeout(timer);
  }, [shown, tokens.length]);

  return { text: tokens.slice(0, shown).join(""), done: shown >= tokens.length, shown };
}

export function ChatMessage({ message, animate = false, onGrow, onDone }: Props) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-md rounded-br-none bg-accent px-4 py-2.5 text-[15px] leading-relaxed text-on-accent">
          {message.content}
        </p>
      </div>
    );
  }
  return (
    <AssistantMessage reply={message.reply} animate={animate} onGrow={onGrow} onDone={onDone} />
  );
}

function AssistantMessage({
  reply,
  animate,
  onGrow,
  onDone,
}: Omit<Props, "message"> & { reply: AssistantReply }) {
  const label = STATUS_LABEL[reply.status];
  const typed = useTypewriter(reply.answer, animate ?? false);

  useEffect(() => {
    if (typed.done) onDone?.();
    else onGrow?.();
  }, [typed.shown, typed.done, onGrow, onDone]);

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[92%] rounded-md rounded-bl-none border border-line bg-surface px-4 py-3 shadow-sm">
        {label && (
          <span
            className={`mb-2 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${label.className}`}
          >
            {label.text}
          </span>
        )}
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
          {typed.text}
          {!typed.done && (
            <span
              aria-hidden
              className="ml-0.5 inline-block h-[1em] w-0.5 translate-y-0.5 animate-pulse bg-accent"
            />
          )}
        </p>
        {typed.done && reply.citations.length > 0 && (
          <div className="mt-3 border-t border-line pt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
              Policy sources
            </p>
            <div className="flex flex-wrap gap-2">
              {reply.citations.map((c) => (
                <CitationChip key={c.section} citation={c} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Placeholder bubble showing what the server is doing while the answer is prepared. */
export function PendingReply({ stage }: { stage: Stage }) {
  return (
    <div className="flex justify-start" role="status" aria-live="polite">
      <div className="flex items-center gap-3 rounded-md rounded-bl-none border border-line bg-surface px-4 py-3 shadow-sm">
        <span className="flex gap-1" aria-hidden>
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="size-1.5 animate-bounce rounded-full bg-accent"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </span>
        <span className="text-sm text-ink-soft">{STAGE_LABEL[stage]}…</span>
      </div>
    </div>
  );
}
