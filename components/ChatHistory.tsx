"use client";

import { useEffect, useRef, useState } from "react";
import {
  clearChats,
  deleteChat,
  renameChat,
  setSidebarCollapsed,
  useSidebarCollapsed,
  type Chat,
} from "@/lib/chatStore";
import { RenameField } from "./ChatTitle";

type ListProps = {
  chats: Chat[];
  activeId: string | null;
  /** Opens a saved chat, or starts a new one with null. */
  onOpen: (id: string | null) => void;
};

function when(ts: number): string {
  const d = new Date(ts);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "New chat" plus the saved chats, each with rename and delete. */
export function ChatList({ chats, activeId, onOpen }: ListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-3 pt-3 pb-2">
        <button
          type="button"
          onClick={() => onOpen(null)}
          className="w-full rounded-sm bg-accent px-3 py-2 text-sm font-semibold text-on-accent hover:opacity-90"
        >
          + New chat
        </button>
      </div>

      <h2 className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
        Your chats
      </h2>
      {chats.length === 0 ? (
        <p className="px-4 py-1 text-sm text-ink-soft">No saved chats yet.</p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
          {chats.map((chat) => {
            const current = chat.id === activeId;
            return (
              <li
                key={chat.id}
                className={`group flex items-center rounded-sm ${current ? "bg-accent-soft" : "hover:bg-muted-soft"}`}
              >
                {editingId === chat.id ? (
                  <div className="flex-1 p-1.5">
                    <RenameField
                      initial={chat.title}
                      onDone={(name) => {
                        if (name) renameChat(chat.id, name);
                        setEditingId(null);
                      }}
                      className="w-full text-sm"
                    />
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onOpen(chat.id)}
                      aria-current={current ? "true" : undefined}
                      title={chat.title}
                      className="min-w-0 flex-1 px-2.5 py-2 text-left"
                    >
                      <span
                        className={`block truncate text-sm ${current ? "font-semibold text-accent" : "text-ink"}`}
                      >
                        {chat.title}
                      </span>
                      <span className="block text-[11px] text-ink-soft">
                        {when(chat.updatedAt)}
                      </span>
                    </button>
                    {/* Always shown on touch screens; on hover or focus elsewhere. */}
                    <div
                      className={`flex shrink-0 pr-1 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100 ${current ? "[@media(hover:hover)]:opacity-100" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => setEditingId(chat.id)}
                        aria-label={`Rename “${chat.title}”`}
                        title="Rename"
                        className="rounded-sm p-1.5 text-ink-soft hover:text-accent"
                      >
                        <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden>
                          <path d="M13.6 2.6a2 2 0 0 1 2.8 2.8l-9 9-3.7.9.9-3.7 9-9Z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Delete “${chat.title}”?`)) deleteChat(chat.id);
                        }}
                        aria-label={`Delete “${chat.title}”`}
                        title="Delete"
                        className="rounded-sm p-1.5 text-ink-soft hover:text-danger"
                      >
                        <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden>
                          <path d="M8 2h4a1 1 0 0 1 1 1v1h4v2H3V4h4V3a1 1 0 0 1 1-1Zm-3 6h10l-.8 9.1a1 1 0 0 1-1 .9H6.8a1 1 0 0 1-1-.9L5 8Z" />
                        </svg>
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-auto space-y-2 border-t border-line px-4 py-3">
        <p className="text-[11px] leading-relaxed text-ink-soft">
          Chats are saved only in this browser, never on the server. Anyone using this browser
          profile can see them.
        </p>
        {chats.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (confirm("Delete all saved chats? This can't be undone.")) clearChats();
            }}
            className="text-xs font-semibold text-danger hover:underline"
          >
            Delete all chats
          </button>
        )}
      </div>
    </div>
  );
}

const iconButton =
  "rounded-sm p-1.5 text-ink-soft transition hover:bg-muted-soft hover:text-accent";

function PanelIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className="size-5"
      aria-hidden
    >
      <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
      <path d="M7.5 3.5v13" />
    </svg>
  );
}

/** The chat list as a left sidebar on wider screens, collapsible to a slim rail. */
export function ChatSidebar(props: ListProps) {
  const collapsed = useSidebarCollapsed();

  return (
    <aside
      className={`sticky top-0 hidden h-dvh shrink-0 border-r border-line bg-surface md:block ${collapsed ? "w-14" : "w-64"}`}
    >
      {collapsed ? (
        <div className="flex flex-col items-center gap-2 py-3">
          <button
            type="button"
            onClick={() => setSidebarCollapsed(false)}
            aria-label="Expand sidebar"
            aria-expanded={false}
            title="Expand sidebar"
            className={iconButton}
          >
            <PanelIcon />
          </button>
          <button
            type="button"
            onClick={() => props.onOpen(null)}
            aria-label="New chat"
            title="New chat"
            className="flex size-8 items-center justify-center rounded-sm bg-accent text-lg leading-none text-on-accent hover:opacity-90"
          >
            +
          </button>
        </div>
      ) : (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-line py-2 pr-2 pl-4">
            <span className="text-sm font-semibold text-accent">Chat history</span>
            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              aria-label="Collapse sidebar"
              aria-expanded
              title="Collapse sidebar"
              className={iconButton}
            >
              <PanelIcon />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <ChatList {...props} />
          </div>
        </div>
      )}
    </aside>
  );
}

/** The chat list as a slide-in panel for small screens. Mounted only while open. */
export function ChatDrawer({ onClose, onOpen, ...props }: ListProps & { onClose: () => void }) {
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
      aria-label="Your chats"
      className="m-0 h-dvh max-h-none w-[min(20rem,calc(100%-3rem))] border-r border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-[#03366e]/50"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <span className="text-sm font-semibold text-accent">Leave Policy Assistant</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-sm px-2 py-1 text-lg leading-none text-ink-soft hover:bg-muted-soft hover:text-accent"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <ChatList
            {...props}
            onOpen={(id) => {
              onOpen(id);
              onClose();
            }}
          />
        </div>
      </div>
    </dialog>
  );
}
