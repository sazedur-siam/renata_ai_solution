import { generateJson } from "./gemini";
import { enforce } from "./guardrails";
import { loadPolicy } from "./policy";
import { buildSystemPrompt } from "./prompt";
import { ModelOutput, type AssistantReply, type ChatMessage, type Stage } from "./schema";

export const MAX_QUESTION_CHARS = 500;
export const MAX_HISTORY_MESSAGES = 6;

/**
 * Answers the latest user message in `history`. `userApiKey` is a
 * visitor's own Gemini key; without it the server's key is used. `onStage` reports
 * progress for the UI; the reply itself is returned only after the guardrails ran.
 */
export async function answerQuestion(
  history: ChatMessage[],
  userApiKey?: string,
  onStage?: (stage: Stage) => void,
): Promise<AssistantReply> {
  const policy = loadPolicy();
  const systemPrompt = buildSystemPrompt(policy);
  const trimmed = history.slice(-MAX_HISTORY_MESSAGES);
  while (trimmed[0]?.role === "assistant") trimmed.shift();

  // One retry if the model returns malformed JSON; after that, fail closed.
  for (let attempt = 0; attempt < 2; attempt++) {
    onStage?.("reading");
    const { text, model } = await generateJson(systemPrompt, trimmed, userApiKey, onStage);
    onStage?.("checking");
    const parsed = safeParse(text);
    if (parsed) return { ...enforce(policy, parsed), model };
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
