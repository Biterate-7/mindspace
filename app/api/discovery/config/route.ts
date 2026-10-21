import { connection } from "next/server";
import { publicConfig } from "@/lib/discovery/server/search";

/** Which Discovery capabilities are configured. Reports provider names only, never keys. */
export async function GET() {
  // Read the environment at request time rather than baking it into a prerendered response.
  await connection();
  return Response.json({ ok: true, config: publicConfig() }, { headers: { "Cache-Control": "no-store" } });
}
