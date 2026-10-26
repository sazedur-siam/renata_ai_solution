import { z } from "zod";
import {
  answerQuestion,
  MAX_HISTORY_MESSAGES,
  MAX_QUESTION_CHARS,
  ModelOutputError,
} from "@/lib/assistant";
import {
  configuredModels,
  GeminiAuthError,
  GeminiBusyError,
  GeminiConfigError,
  GeminiQuotaExhaustedError,
} from "@/lib/gemini";
import { PolicyNotConfiguredError } from "@/lib/policy";
import { quotaScope, snapshot } from "@/lib/quota";
import { isRateLimited } from "@/lib/rateLimit";
import type { ChatEvent } from "@/lib/schema";
import { readUserApiKey } from "@/lib/userKey";

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

/** Machine-readable error codes the UI reacts to (e.g. opening the API key dialog). */
type ErrorCode = "key_required" | "key_invalid" | "quota_exhausted";

/**
 * POST /api/chat  { messages: [{ role, content }, ...] }
 * Optional header x-gemini-api-key: the visitor's own Gemini key.
 *
 * Invalid requests get a JSON error. Otherwise the response is an NDJSON stream of
 * ChatEvents: "stage" lines while the answer is prepared, then one "reply" (already
 * checked by the guardrails) or one "error".
 *
 * Messages and keys are not logged or stored: the conversation lives in the browser.
 */
export async function POST(request: Request) {
  const userKey = readUserApiKey(request);
  const scope = quotaScope(userKey ?? undefined);
  const error = (status: number, message: string, code?: ErrorCode) =>
    Response.json({ error: message, code, quota: snapshot(configuredModels(), scope) }, { status });

  if (userKey === null) {
    return error(400, "That doesn't look like a valid Gemini API key.", "key_invalid");
  }

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

  // Stream progress events while the answer is prepared, then the checked reply.
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        const reply = await answerQuestion(messages, userKey, (stage) =>
          send({ type: "stage", stage }),
        );
        send({ type: "reply", reply });
      } catch (err) {
        const { message, code } = describeError(err, userKey, scope);
        send({ type: "error", error: message, code });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

/** Turns a failure into the message and code the UI shows. */
function describeError(
  err: unknown,
  userKey: string | undefined,
  scope: string,
): { message: string; code?: ErrorCode } {
  if (err instanceof GeminiQuotaExhaustedError) {
    const hours = snapshot(configuredModels(), scope).resetsInHours;
    const whose = userKey ? "your API key" : "this demo";
    return {
      message:
        `Today's free AI quota for ${whose} is used up. It resets in about ${hours} hour${hours === 1 ? "" : "s"}.` +
        (userKey ? "" : " You can add your own free Gemini API key to keep going."),
      code: "quota_exhausted",
    };
  }
  if (err instanceof PolicyNotConfiguredError) {
    return { message: "The leave policy is not configured on this server, so I can't answer yet." };
  }
  if (err instanceof GeminiConfigError) {
    return {
      message: "Please add your Gemini API key to use this assistant.",
      code: "key_required",
    };
  }
  if (err instanceof GeminiAuthError) {
    return err.userKey
      ? {
          message: "Google rejected your Gemini API key. Please check it or remove it.",
          code: "key_invalid",
        }
      : {
          message: "The assistant's API key is not working. Please add your own Gemini API key.",
          code: "key_required",
        };
  }
  if (err instanceof GeminiBusyError) {
    return { message: "The AI service is busy right now. Please try again in a minute." };
  }
  if (err instanceof ModelOutputError) {
    return { message: "I couldn't produce a reliable answer just now. Please try again." };
  }
  console.error("chat error:", (err as Error).message);
  return { message: "Something went wrong. Please try again." };
}
