import type { AssistantReply, ChatEvent, Stage } from "./schema";

export type ApiError = Error & { code?: string };

function apiError(message: string, code?: string): ApiError {
  return Object.assign(new Error(message), { code });
}

/**
 * Reads a /api/chat response: reports each progress stage through `onStage` and
 * resolves with the checked reply, or throws the server's error message and code.
 */
export async function readChatResponse(
  res: Response,
  onStage: (stage: Stage) => void,
): Promise<AssistantReply> {
  // Requests rejected before answering (bad key, rate limit, ...) are plain JSON.
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw apiError(data.error ?? "Something went wrong.", data.code);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += value;
    const lines = buffer.split("\n");
    buffer = done ? "" : (lines.pop() ?? "");
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as ChatEvent;
      if (event.type === "stage") onStage(event.stage);
      else if (event.type === "reply") return event.reply;
      else throw apiError(event.error, event.code);
    }
    if (done) break;
  }
  throw apiError("The connection closed before the answer arrived. Please try again.");
}
