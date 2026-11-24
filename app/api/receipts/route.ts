// GET /api/receipts: the public pool's totals and its latest receipts (no prompts, no visitors), plus what
// development spent before the pool opened.

import { getStore } from "@/server/store.ts";
import dev from "../../../reports/usage-dev.json" with { type: "json" };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const summary = await getStore().summary(300);
    return Response.json({ ok: true, summary, dev });
  } catch (e) {
    return Response.json({ ok: false, message: (e as Error).message, dev }, { status: 500 });
  }
}
