import { GoogleGenAI } from "@google/genai";
import { isExhausted, recordQuotaError, recordSuccess } from "./quota";
import { responseJsonSchema, type ChatMessage } from "./schema";

/**
 * Models tried in order. Free-tier models are regularly overloaded (503) or out of
 * quota (429), so a single model is not reliable enough for a demo; the "-latest"
 * aliases track Google's current Flash models. Override with GEMINI_MODELS.
 */
export const DEFAULT_MODELS = [
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
];

/** Per-call cap, so an overloaded model fails over quickly instead of hanging. */
const TIMEOUT_MS = 20_000;
/** Extra attempts on the same model, only for network errors. */
const NETWORK_RETRIES = 1;

export class GeminiConfigError extends Error {}
/** Every model was overloaded or out of quota. */
export class GeminiBusyError extends Error {}
/** Every model has used its free daily quota; nothing will work until the reset. */
export class GeminiQuotaExhaustedError extends GeminiBusyError {}

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiConfigError("GEMINI_API_KEY is not set.");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

export function configuredModels(): string[] {
  const fromEnv = (process.env.GEMINI_MODELS ?? process.env.GEMINI_MODEL ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_MODELS;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sends the conversation to Gemini and returns the raw JSON text plus the model used. */
export async function generateJson(
  systemPrompt: string,
  history: ChatMessage[],
): Promise<{ text: string; model: string }> {
  const ai = getClient();
  let lastError: unknown;
  let allOutOfQuota = true;

  for (const model of configuredModels()) {
    if (isExhausted(model)) continue; // known to be out of daily quota: don't wait on it
    allOutOfQuota = false;
    for (let attempt = 0; attempt <= NETWORK_RETRIES; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: history.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: "application/json",
            responseJsonSchema,
            httpOptions: { timeout: TIMEOUT_MS },
            // Temperature is left at the model default: Google recommends 1.0 for
            // Gemini 3 models. Grounding comes from the prompt and guardrails instead.
            ...(process.env.GEMINI_TEMPERATURE
              ? { temperature: Number(process.env.GEMINI_TEMPERATURE) }
              : {}),
          },
        });
        recordSuccess(model);
        return { text: response.text ?? "", model };
      } catch (err) {
        lastError = err;
        const { status, name } = err as { status?: number; name?: string };
        if (status === 429) recordQuotaError(model, err);
        const timedOut = name === "AbortError" || name === "TimeoutError";
        if (status === undefined && !timedOut) {
          await sleep(500); // network blip: one quick retry on the same model
          continue;
        }
        // Overloaded, out of quota, retired or too slow: move on to the next model.
        if (timedOut || status === 429 || status === 404 || (status ?? 0) >= 500) break;
        throw err; // auth, bad request, etc.: another model won't help
      }
    }
  }
  const models = configuredModels();
  if (allOutOfQuota || models.every(isExhausted)) {
    throw new GeminiQuotaExhaustedError("Today's free Gemini quota is used up for every model.");
  }
  throw new GeminiBusyError(
    `All Gemini models are busy or unavailable: ${(lastError as Error)?.message ?? "unknown"}`,
  );
}
