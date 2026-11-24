// GET /api/status: what this visitor's next round can do. With the judges' pass, real thinking from the judges' pool;
// otherwise real thinking while the public pool is open and has room for a round, and a recorded round to watch once
// it is closed or spent.

import { isJudge } from "@/server/judge.ts";
import { liveAllowed } from "@/server/meta.ts";
import { grainUsd } from "@/server/mind.ts";
import { getStore, publicOpen } from "@/server/store.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const judge = isJudge(req);
  let open = publicOpen();
  try {
    const store = getStore();
    if (open && store.kind === "redis") {
      const pub = await store.totals("public");
      open = pub.spent + grainUsd() / 4 < pub.cap;
    }
  } catch {
    // If the store cannot be reached, let thoughts try (each one is still checked when it is reserved).
  }
  return Response.json({ ok: true, live: liveAllowed(), judge, open, replay: !judge && !open });
}
