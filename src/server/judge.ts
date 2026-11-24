// The judges' pass. Judging must never find an empty jar, so the judges' rounds are paid from their own pool
// (store.ts). The pass is a code set on the server (JUDGE_PASS) and shared only with the judges; the page sends it in a
// header. A leaked pass can spend at most the judges' pool.

import { createHash, timingSafeEqual } from "node:crypto";

const digest = (s: string) => createHash("sha256").update(s).digest();

export function isJudge(req: Request): boolean {
  const want = process.env.JUDGE_PASS ?? "";
  const got = req.headers.get("x-judge-pass") ?? "";
  if (want.length < 6 || !got) return false;
  return timingSafeEqual(digest(want), digest(got));
}
