import { GoogleGenAI } from "@google/genai";
import { isExhausted, quotaScope, recordQuotaError, recordSuccess } from "./quota";
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

/** No key at all: neither the server's GEMINI_API_KEY nor one from the visitor. */
export class GeminiConfigError extends Error {}
/** Google rejected the key (invalid, expired or not allowed). */
export class GeminiAuthError extends Error {
  constructor(public readonly userKey: boolean) {
    super(userKey ? "The provided Gemini API key was rejected." : "The server's Gemini API key was rejected.");
  }
}
/** Every model was overloaded or out of quota. */
export class GeminiBusyError extends Error {}
/** Every model has used its free daily quota; nothing will work until the reset. */
export class GeminiQuotaExhaustedError extends GeminiBusyError {}

let sharedClient: GoogleGenAI | null = null;

/**
 * A visitor's own key gets a fresh client for this request only (never cached or
 * logged); otherwise the server's shared key is used.
 */
function getClient(userApiKey?: string): GoogleGenAI {
  if (userApiKey) return new GoogleGenAI({ apiKey: userApiKey });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiConfigError("No Gemini API key configured.");
  sharedClient ??= new GoogleGenAI({ apiKey });
  return sharedClient;
}

export function hasServerKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function configuredModels(): string[] {
  const fromEnv = (process.env.GEMINI_MODELS ?? process.env.GEMINI_MODEL ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_MODELS;
}

function isAuthError(err: unknown): boolean {
  const { status, message } = err as { status?: number; message?: string };
  return status === 401 || status === 403 || (status === 400 && /api[_ ]?key/i.test(message ?? ""));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Progress reported while generating: output started, or moving to a backup model. */
export type GenerationEvent = "writing" | "fallback";

/**
 * Sends the conversation to Gemini and returns the raw JSON text plus the model used.
 * The output is streamed only to report progress through `onEvent`; callers still
 * get the complete text, so it can be checked before anyone sees it.
 */
export async function generateJson(
  systemPrompt: string,
  history: ChatMessage[],
  userApiKey?: string,
  onEvent?: (event: GenerationEvent) => void,
): Promise<{ text: string; model: string }> {
  const ai = getClient(userApiKey);
  const scope = quotaScope(userApiKey);
  let lastError: unknown;
  let allOutOfQuota = true;
  let failedOver = false;

  for (const model of configuredModels()) {
    if (isExhausted(scope, model)) continue; // known to be out of daily quota: don't wait on it
    allOutOfQuota = false;
    if (failedOver) onEvent?.("fallback");
    for (let attempt = 0; attempt <= NETWORK_RETRIES; attempt++) {
      try {
        const stream = await ai.models.generateContentStream({
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
        let text = "";
        for await (const chunk of stream) {
          const part = chunk.text;
          if (!part) continue;
          if (!text) onEvent?.("writing");
          text += part;
        }
        recordSuccess(scope, model);
        return { text, model };
      } catch (err) {
        lastError = err;
        if (isAuthError(err)) throw new GeminiAuthError(Boolean(userApiKey));
        const { status, name } = err as { status?: number; name?: string };
        if (status === 429) recordQuotaError(scope, model, err);
        const timedOut = name === "AbortError" || name === "TimeoutError";
        if (status === undefined && !timedOut) {
          await sleep(500); // network blip: one quick retry on the same model
          continue;
        }
        // Overloaded, out of quota, retired or too slow: move on to the next model.
        if (timedOut || status === 429 || status === 404 || (status ?? 0) >= 500) {
          failedOver = true;
          break;
        }
        throw err; // bad request etc.: another model won't help
      }
    }
  }
  if (allOutOfQuota || configuredModels().every((m) => isExhausted(scope, m))) {
    throw new GeminiQuotaExhaustedError("The free Gemini quota is used up for every model today.");
  }
  throw new GeminiBusyError(
    `All Gemini models are busy or unavailable: ${(lastError as Error)?.message ?? "unknown"}`,
  );
}

/**
 * Checks a visitor's key by listing models, which costs no generation quota.
 * Returns false if Google rejects the key; throws on network or server errors.
 */
export async function verifyApiKey(apiKey: string): Promise<boolean> {
  try {
    await getClient(apiKey).models.list({ config: { pageSize: 1, httpOptions: { timeout: TIMEOUT_MS } } });
    return true;
  } catch (err) {
    if (isAuthError(err)) return false;
    throw err;
  }
}
