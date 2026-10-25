/**
 * A visitor's own Gemini key travels in this header (over HTTPS) with each request.
 * The server uses it for that request only and never logs or stores it.
 */
export const API_KEY_HEADER = "x-gemini-api-key";

const KEY_PATTERN = /^[A-Za-z0-9_.-]{20,200}$/;

/** The visitor's key, undefined if none was sent, or null if it is malformed. */
export function readUserApiKey(request: Request): string | undefined | null {
  const key = request.headers.get(API_KEY_HEADER)?.trim();
  if (!key) return undefined;
  return KEY_PATTERN.test(key) ? key : null;
}

export function isPlausibleApiKey(key: string): boolean {
  return KEY_PATTERN.test(key.trim());
}
