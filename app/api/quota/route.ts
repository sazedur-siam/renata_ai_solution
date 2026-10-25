import { connection } from "next/server";
import { configuredModels } from "@/lib/gemini";
import { snapshot } from "@/lib/quota";

/** GET /api/quota → estimated free-tier answers left today (see lib/quota.ts). */
export async function GET() {
  await connection(); // per-request value: never prerender or cache
  return Response.json(snapshot(configuredModels()));
}
