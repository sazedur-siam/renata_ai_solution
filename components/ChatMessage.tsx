import type { AssistantReply, Status } from "@/lib/schema";
import { CitationChip } from "./CitationChip";

const STATUS_LABEL: Record<Status, { text: string; className: string }> = {
  answered: { text: "Answered from policy", className: "bg-ok-soft text-ok" },
  partial: { text: "Partly covered by policy", className: "bg-warn-soft text-warn" },
  not_covered: { text: "Not in policy", className: "bg-muted-soft text-ink-soft" },
  own_data: { text: "Your personal records", className: "bg-muted-soft text-ink-soft" },
  privacy_refusal: { text: "Privacy protected", className: "bg-danger-soft text-danger" },
};

export type UiMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; reply: AssistantReply };

export function ChatMessage({ message }: { message: UiMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-[15px] leading-relaxed text-on-accent">
          {message.content}
        </p>
      </div>
    );
  }

  const { reply } = message;
  const label = STATUS_LABEL[reply.status];
  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[92%] rounded-2xl rounded-bl-sm border border-line bg-surface px-4 py-3 shadow-sm">
        <span
          className={`mb-2 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${label.className}`}
        >
          {label.text}
        </span>
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{reply.answer}</p>
        {reply.citations.length > 0 && (
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
