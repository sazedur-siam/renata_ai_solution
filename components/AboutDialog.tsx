"use client";

import { useEffect, useRef } from "react";

/** Explains what the assistant can and can't answer. Mounted only while open. */
export function AboutDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // A click on the backdrop lands on the <dialog> itself.
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="about-title"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(30rem,calc(100%-2rem))] overflow-y-auto rounded-sm border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-[#03366e]/50"
    >
      <div className="space-y-4 p-5">
        <h2 id="about-title" className="text-lg font-semibold text-accent">
          What this assistant knows
        </h2>

        <p className="text-sm leading-relaxed">
          This assistant currently has <strong>only the XYZ Company Leave Policy</strong>{" "}
          (HR-POL-004, Version 2.0). It has no other company documents or outside knowledge.
        </p>

        <div className="space-y-2 rounded-sm border border-line border-l-4 border-l-ok bg-ok-soft/40 px-4 py-3 text-sm">
          <p className="font-semibold text-ok">It can answer</p>
          <p className="leading-relaxed">
            Questions about the leave policy, such as leave types and how many days you get,
            carrying leave forward, medical certificates, notice periods, how to apply and
            unpaid leave. Every answer cites the policy section it comes from.
          </p>
        </div>

        <div className="space-y-2 rounded-sm border border-line border-l-4 border-l-highlight bg-warn-soft/40 px-4 py-3 text-sm">
          <p className="font-semibold text-warn">It can&apos;t answer</p>
          <p className="leading-relaxed">
            Anything outside the leave policy, such as salary, benefits, other HR policies or
            general labour law. It doesn&apos;t have that information, so instead of guessing it
            replies <strong>&ldquo;I don&apos;t know, please contact HR.&rdquo;</strong>
          </p>
          <p className="leading-relaxed">
            It also can&apos;t see anyone&apos;s personal leave records, including your own
            balance, and it won&apos;t share information about other employees.
          </p>
        </div>

        <p className="text-sm leading-relaxed text-ink-soft">
          For anything it can&apos;t help with, contact the HR Department at{" "}
          <a href="mailto:hr@xyz-company.example" className="font-semibold text-accent underline">
            hr@xyz-company.example
          </a>
          .
        </p>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:opacity-90"
          >
            Got it
          </button>
        </div>
      </div>
    </dialog>
  );
}
