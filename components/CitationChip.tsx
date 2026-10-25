"use client";

import { useState } from "react";
import type { Citation } from "@/lib/schema";

/** "§4.2(b) Casual Leave" chip that expands to show the verbatim policy text. */
export function CitationChip({ citation }: { citation: Citation }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="w-full sm:w-auto">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-soft transition hover:border-accent hover:text-accent"
      >
        <span className="font-semibold text-accent">§{citation.section}</span>
        <span>{citation.heading}</span>
        <span aria-hidden className={`transition ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>
      {open && (
        <blockquote className="mt-2 rounded-lg border-l-4 border-accent bg-accent-soft px-3 py-2 text-sm leading-relaxed text-ink">
          “{citation.quote}”
        </blockquote>
      )}
    </div>
  );
}
