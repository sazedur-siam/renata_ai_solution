import { verifyApiKey } from "@/lib/gemini";
import { isRateLimited } from "@/lib/rateLimit";
import { readUserApiKey } from "@/lib/userKey";

/**
 * POST /api/key/verify with header x-gemini-api-key → { valid: boolean }
 * Asks Google to list models with the key, which uses no generation quota.
 * The key is not logged or stored.
 */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (isRateLimited(ip)) {
    return Response.json({ error: "Too many attempts. Please wait a few minutes." }, { status: 429 });
  }

  const key = readUserApiKey(request);
  if (!key) return Response.json({ valid: false });

  try {
    return Response.json({ valid: await verifyApiKey(key) });
  } catch {
    return Response.json(
      { error: "Couldn't reach Google to check the key. Please try again." },
      { status: 502 },
    );
  }
}
