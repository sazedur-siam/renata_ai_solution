import { generateJson } from "./gemini";
import { enforce } from "./guardrails";
import { loadPolicy } from "./policy";
import { buildSystemPrompt } from "./prompt";
import { ModelOutput, type AssistantReply, type ChatMessage } from "./schema";

export const MAX_QUESTION_CHARS = 500;
export const MAX_HISTORY_MESSAGES = 6;

/**
 * Answers the latest user message in `history`. Shared by the API route and the
 * eval runner, so the evals test exactly what employees get.
 */
export async function answerQuestion(history: ChatMessage[]): Promise<AssistantReply> {
  const policy = loadPolicy();
  const systemPrompt = buildSystemPrompt(policy);
  const trimmed = history.slice(-MAX_HISTORY_MESSAGES);
  while (trimmed[0]?.role === "assistant") trimmed.shift();

  // One retry if the model returns malformed JSON; after that, fail closed.
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await generateJson(systemPrompt, trimmed);
    const parsed = safeParse(raw);
    if (parsed) return enforce(policy, parsed);
  }
  throw new ModelOutputError("Model output could not be parsed as the expected JSON.");
}

export class ModelOutputError extends Error {}

function safeParse(raw: string): ModelOutput | null {
  try {
    const result = ModelOutput.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
