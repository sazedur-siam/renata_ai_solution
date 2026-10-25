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
 * POST /api/chat  { messages: [{ role, content }, ...] }  → AssistantReply + quota
 * Optional header x-gemini-api-key: the visitor's own Gemini key.
 *
 * Messages and keys are not logged or stored: the conversation lives in the browser.
 */
export async function POST(request: Request) {
  const userKey = readUserApiKey(request);
  const scope = quotaScope(userKey ?? undefined);
  const error = (status: number, message: string, code?: ErrorCode) =>
    Response.json(
      { error: message, code, quota: snapshot(configuredModels(), scope) },
      { status },
    );

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

  try {
    const reply = await answerQuestion(messages, userKey);
    return Response.json({ ...reply, quota: snapshot(configuredModels(), scope) });
  } catch (err) {
    if (err instanceof GeminiQuotaExhaustedError) {
      const hours = snapshot(configuredModels(), scope).resetsInHours;
      const whose = userKey ? "your API key" : "this demo";
      return error(
        503,
        `Today's free AI quota for ${whose} is used up. It resets in about ${hours} hour${hours === 1 ? "" : "s"}.` +
          (userKey ? "" : " You can add your own free Gemini API key to keep going."),
        "quota_exhausted",
      );
    }
    if (err instanceof PolicyNotConfiguredError) {
      return error(503, "The leave policy is not configured on this server, so I can't answer yet.");
    }
    if (err instanceof GeminiConfigError) {
      return error(401, "Please add your Gemini API key to use this assistant.", "key_required");
    }
    if (err instanceof GeminiAuthError) {
      return err.userKey
        ? error(401, "Google rejected your Gemini API key. Please check it or remove it.", "key_invalid")
        : error(503, "The assistant's API key is not working. Please add your own Gemini API key.", "key_required");
    }
    if (err instanceof GeminiBusyError) {
      return error(503, "The AI service is busy right now. Please try again in a minute.");
    }
    if (err instanceof ModelOutputError) {
      return error(502, "I couldn't produce a reliable answer just now. Please try again.");
    }
    console.error("chat error:", (err as Error).message);
    return error(500, "Something went wrong. Please try again.");
  }
}
