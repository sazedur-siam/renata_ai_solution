import { z } from "zod";
import {
  answerQuestion,
  MAX_HISTORY_MESSAGES,
  MAX_QUESTION_CHARS,
  ModelOutputError,
} from "@/lib/assistant";
import { GeminiConfigError, GeminiRateLimitError } from "@/lib/gemini";
import { PolicyNotConfiguredError } from "@/lib/policy";
import { isRateLimited } from "@/lib/rateLimit";

const Body = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(50),
});

/**
 * POST /api/chat  { messages: [{ role, content }, ...] }  → AssistantReply
 *
 * Messages are not logged or stored: the conversation lives only in the browser.
 */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (isRateLimited(ip)) {
    return error(429, "You're sending questions quickly. Please wait a few minutes and try again.");
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error(400, "Invalid request.");

  const messages = parsed.data.messages.slice(-MAX_HISTORY_MESSAGES);
  const last = messages[messages.length - 1];
  if (last.role !== "user") return error(400, "The last message must be a question.");
  if (last.content.length > MAX_QUESTION_CHARS) {
    return error(400, `Please keep your question under ${MAX_QUESTION_CHARS} characters.`);
  }

  try {
    return Response.json(await answerQuestion(messages));
  } catch (err) {
    if (err instanceof PolicyNotConfiguredError) {
      return error(503, "The leave policy is not configured on this server, so I can't answer yet.");
    }
    if (err instanceof GeminiConfigError) {
      return error(503, "The assistant is not configured (missing API key).");
    }
    if (err instanceof GeminiRateLimitError) {
      return error(503, "The assistant is busy right now (AI quota reached). Please try again in a minute.");
    }
    if (err instanceof ModelOutputError) {
      return error(502, "I couldn't produce a reliable answer just now. Please try again.");
    }
    console.error("chat error:", (err as Error).message);
    return error(500, "Something went wrong. Please try again.");
  }
}

function error(status: number, message: string) {
  return Response.json({ error: message }, { status });
}
