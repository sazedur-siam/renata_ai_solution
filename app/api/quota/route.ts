import { connection } from "next/server";
import { configuredModels, hasServerKey } from "@/lib/gemini";
import { quotaScope, snapshot } from "@/lib/quota";
import { readUserApiKey } from "@/lib/userKey";

/**
 * GET /api/quota → estimated free-tier answers left today (see lib/quota.ts), for the
 * visitor's own key if the x-gemini-api-key header is sent, else for the shared key.
 */
export async function GET(request: Request) {
  await connection(); // per-request value: never prerender or cache
  const userKey = readUserApiKey(request) ?? undefined;
  return Response.json({
    ...snapshot(configuredModels(), quotaScope(userKey)),
    serverKeyConfigured: hasServerKey(),
  });
}
