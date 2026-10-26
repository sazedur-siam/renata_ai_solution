"use client";

import { useRef, useState } from "react";

/** Text field for naming a chat. Enter or leaving the field saves; Esc cancels. */
export function RenameField({
  initial,
  onDone,
  className = "",
}: {
  initial: string;
  /** The new name, or null when cancelled or unchanged. */
  onDone: (name: string | null) => void;
  className?: string;
}) {
  const [value, setValue] = useState(initial);
  const finished = useRef(false);

  function finish(save: boolean) {
    if (finished.current) return;
    finished.current = true;
    const name = value.trim();
    onDone(save && name && name !== initial ? name : null);
  }

  return (
    <input
      autoFocus
      value={value}
      maxLength={60}
      aria-label="Chat name"
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finish(true);
        } else if (e.key === "Escape") {
          // Keep Esc from also closing the surrounding dialog.
          e.preventDefault();
          e.stopPropagation();
          finish(false);
        }
      }}
      className={`min-w-0 rounded-sm border border-accent bg-background px-2 py-1 text-ink outline-none ${className}`}
    />
  );
}

/** The open chat's name above the messages, with a button to rename it. */
export function ChatTitle({
  title,
  onRename,
}: {
  title: string;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <RenameField
        initial={title}
        onDone={(name) => {
          if (name) onRename(name);
          setEditing(false);
        }}
        className="w-full text-base font-semibold"
      />
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <h2 className="truncate text-base font-semibold text-ink" title={title}>
        {title}
      </h2>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="shrink-0 rounded-sm px-1.5 py-0.5 text-xs font-semibold text-ink-soft hover:bg-muted-soft hover:text-accent"
      >
        Rename
      </button>
    </div>
  );
}
