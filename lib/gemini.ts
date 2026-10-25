import { GoogleGenAI } from "@google/genai";
import { responseJsonSchema, type ChatMessage } from "./schema";

/** "gemini-flash-latest" tracks Google's current free-tier Flash model. */
export const DEFAULT_MODEL = "gemini-flash-latest";

export class GeminiConfigError extends Error {}
export class GeminiRateLimitError extends Error {}

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiConfigError("GEMINI_API_KEY is not set.");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

/** Sends the conversation to Gemini and returns the raw JSON text it produced. */
export async function generateJson(
  systemPrompt: string,
  history: ChatMessage[],
): Promise<string> {
  try {
    const response = await getClient().models.generateContent({
      model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
      contents: history.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseJsonSchema,
        // Temperature is left at the model default: Google recommends 1.0 for
        // Gemini 3 models. Grounding comes from the prompt and guardrails instead.
        ...(process.env.GEMINI_TEMPERATURE
          ? { temperature: Number(process.env.GEMINI_TEMPERATURE) }
          : {}),
      },
    });
    return response.text ?? "";
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 429) throw new GeminiRateLimitError("Gemini rate limit reached.");
    throw err;
  }
}
