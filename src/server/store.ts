// Where the public game keeps its money straight. On the public deployment many people play at once on servers that
// keep no files, so the shared pool, each round's grain, the per-visitor limit and the receipts live in Redis
// (Upstash, over its REST API). Locally the same questions are answered from the receipt ledger file.
//
// There are two pools. The public pool is shared by everyone who plays; it can be closed (PUBLIC_POOL_OPEN=0), and then
// public visitors watch a recorded round instead. The judges' pool is kept apart, so judging never finds an empty jar;
// it is reached only with the judges' pass, and has no hourly limit (its own cap is the limit).
//
// Every thought first reserves its worst-case cost in one atomic step: the pool, the round's grain and the visitor's
// round count are all checked together, so two visitors can never both slip past the cap. When the reply is back the
// reservation is settled to the real cost; if the call fails, it is refunded.

import { capUsd, readLedger, type Receipt } from "./budget.ts";

export type PoolName = "public" | "judge";

export type Reserve =
  | { ok: true; pool: number; round: number }
  | { ok: false; reason: "pool" | "grain" | "busy"; pool: number; round: number };

/** One line on the public receipts page. */
export type PublicReceipt = {
  at: string;
  round: string;
  bot: number;
  year: number;
  choice: string;
  lang: string;
  input: number;
  cached: number;
  output: number;
  reasoning: number;
  costUsd: number;
  /** Which pool paid; missing on receipts from before the judges' pool existed (they are all public). */
  pool?: PoolName;
};

export type PoolTotals = { spent: number; cap: number; thoughts: number; rounds: number };

export type Summary = PoolTotals & { kind: "redis" | "file"; open: boolean; judge: PoolTotals; receipts: PublicReceipt[] };

export interface Store {
  kind: "redis" | "file";
  reserve(round: string, estimate: number, grain: number, visitor: string, pool?: PoolName): Promise<Reserve>;
  settle(round: string, estimate: number, receipt: PublicReceipt, trace: Record<string, unknown>, pool?: PoolName): Promise<void>;
  refund(round: string, estimate: number, pool?: PoolName): Promise<void>;
  roundSpent(round: string): Promise<number>;
  /** The pool's totals only (cheap): used to tell a visitor whether the public pool can still pay for a round. */
  totals(pool: PoolName): Promise<PoolTotals>;
  summary(limit?: number): Promise<Summary>;
}

/** The shared pool for the public game, in US$. Kept well under the $10 of credits, which also paid for development. */
export function poolUsd() {
  return Number(process.env.PUBLIC_POOL_USD ?? 4);
}

/** The judges' pool, in US$: at least 20 rounds at one grain each. */
export function judgeUsd() {
  return Number(process.env.JUDGE_POOL_USD ?? 1);
}

/** The public pool can be closed by hand (PUBLIC_POOL_OPEN=0), for example once testing is done, to keep the rest. */
export function publicOpen() {
  return process.env.PUBLIC_POOL_OPEN !== "0";
}

export function capOf(pool: PoolName) {
  return pool === "judge" ? judgeUsd() : poolUsd();
}

/** How many new rounds one visitor may start in an hour. */
export function roundsPerHour() {
  return Number(process.env.ROUNDS_PER_HOUR ?? 6);
}

function redisEnv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

export function hasSharedStore() {
  return redisEnv() != null;
}

export function getStore(): Store {
  const env = redisEnv();
  return env ? redisStore(env.url, env.token) : fileStore();
}

// ---- Redis ----

const K = {
  spent: (p: PoolName = "public") => (p === "judge" ? "tbmbc:judge:spent" : "tbmbc:pool:spent"),
  thoughts: (p: PoolName = "public") => (p === "judge" ? "tbmbc:judge:thoughts" : "tbmbc:pool:thoughts"),
  rounds: (p: PoolName = "public") => (p === "judge" ? "tbmbc:judge:rounds" : "tbmbc:pool:rounds"),
  receipts: "tbmbc:receipts",
  trace: "tbmbc:trace",
  round: (r: string) => `tbmbc:round:${r}`,
  visitor: (v: string) => `tbmbc:visitor:${v}:${new Date().toISOString().slice(0, 13)}`,
};

/** Check the pool, the round's grain and the visitor's rounds (when limited: ARGV[5] > 0) together; reserve the estimate only if all three allow it. */
const RESERVE = `
local pool = tonumber(redis.call('GET', KEYS[1]) or '0')
local round = tonumber(redis.call('GET', KEYS[2]) or '0')
local est = tonumber(ARGV[1])
if pool + est > tonumber(ARGV[2]) then return {'pool', tostring(pool), tostring(round)} end
if round + est > tonumber(ARGV[3]) then return {'grain', tostring(pool), tostring(round)} end
if tonumber(ARGV[5]) > 0 then
  local new = redis.call('SISMEMBER', KEYS[3], ARGV[4]) == 0
  if new and redis.call('SCARD', KEYS[3]) >= tonumber(ARGV[5]) then return {'busy', tostring(pool), tostring(round)} end
  if new then
    redis.call('SADD', KEYS[3], ARGV[4])
    redis.call('EXPIRE', KEYS[3], 3600)
  end
end
if round == 0 then redis.call('INCR', KEYS[4]) end
redis.call('INCRBYFLOAT', KEYS[1], ARGV[1])
redis.call('INCRBYFLOAT', KEYS[2], ARGV[1])
redis.call('EXPIRE', KEYS[2], 172800)
return {'ok', tostring(pool + est), tostring(round + est)}
`;

function redisStore(url: string, token: string): Store {
  const call = async (cmds: (string | number)[][]): Promise<unknown[]> => {
    const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(cmds.map((c) => c.map(String))),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Redis: ${res.status}`);
    const out = (await res.json()) as { result?: unknown; error?: string }[];
    const bad = out.find((o) => o.error);
    if (bad) throw new Error(`Redis: ${bad.error}`);
    return out.map((o) => o.result);
  };
  return {
    kind: "redis",
    async reserve(round, estimate, grain, visitor, pool = "public") {
      const limit = pool === "judge" ? 0 : roundsPerHour();
      const [r] = await call([["EVAL", RESERVE, 4, K.spent(pool), K.round(round), K.visitor(visitor), K.rounds(pool), estimate, capOf(pool), grain, round, limit]]);
      const [status, ps, rs] = r as [string, string, string];
      return status === "ok"
        ? { ok: true, pool: Number(ps), round: Number(rs) }
        : { ok: false, reason: status as "pool" | "grain" | "busy", pool: Number(ps), round: Number(rs) };
    },
    async settle(round, estimate, receipt, trace, pool = "public") {
      const diff = receipt.costUsd - estimate;
      await call([
        ["INCRBYFLOAT", K.spent(pool), diff],
        ["INCRBYFLOAT", K.round(round), diff],
        ["INCR", K.thoughts(pool)],
        ["LPUSH", K.receipts, JSON.stringify({ ...receipt, pool })],
        ["LTRIM", K.receipts, 0, 4999],
        ["LPUSH", K.trace, JSON.stringify(trace)],
        ["LTRIM", K.trace, 0, 4999],
      ]);
    },
    async refund(round, estimate, pool = "public") {
      await call([
        ["INCRBYFLOAT", K.spent(pool), -estimate],
        ["INCRBYFLOAT", K.round(round), -estimate],
      ]);
    },
    async roundSpent(round) {
      const [v] = await call([["GET", K.round(round)]]);
      return Number(v ?? 0);
    },
    async totals(pool) {
      const [spent, thoughts, rounds] = await call([["GET", K.spent(pool)], ["GET", K.thoughts(pool)], ["GET", K.rounds(pool)]]);
      return { spent: Number(spent ?? 0), cap: capOf(pool), thoughts: Number(thoughts ?? 0), rounds: Number(rounds ?? 0) };
    },
    async summary(limit = 300) {
      const [pub, judge, [list]] = await Promise.all([this.totals("public"), this.totals("judge"), call([["LRANGE", K.receipts, 0, limit - 1]])]);
      return {
        kind: "redis",
        ...pub,
        open: publicOpen(),
        judge,
        receipts: ((list as string[]) ?? []).map((s) => JSON.parse(s) as PublicReceipt),
      };
    },
  };
}

// ---- Local file (development) ----

function fileStore(): Store {
  const mindReceipts = (): Receipt[] => readLedger().filter((r) => r.mode === "live" && r.purpose.startsWith("mind:"));
  const spentIn = (round: string) =>
    mindReceipts()
      .filter((r) => r.purpose.startsWith(`mind:${round}:`))
      .reduce((a, r) => a + r.costUsd, 0);
  return {
    kind: "file",
    async reserve(round, estimate, grain) {
      // Locally the project-wide cap is checked by the budget gate on every call; here only the round's grain.
      const r = spentIn(round);
      return r + estimate > grain ? { ok: false, reason: "grain", pool: 0, round: r } : { ok: true, pool: 0, round: r + estimate };
    },
    async settle() {
      // The receipt is already in the ledger file (budget.record) and the trace in data/local/trace.jsonl.
    },
    async refund() {},
    async roundSpent(round) {
      return spentIn(round);
    },
    async totals() {
      const all = mindReceipts();
      return { spent: all.reduce((a, r) => a + r.costUsd, 0), cap: capUsd(), thoughts: all.length, rounds: new Set(all.map((r) => r.purpose.split(":")[1])).size };
    },
    async summary(limit = 300) {
      const all = mindReceipts();
      return {
        kind: "file",
        ...(await this.totals("public")),
        open: publicOpen(),
        judge: { spent: 0, cap: judgeUsd(), thoughts: 0, rounds: 0 },
        receipts: all
          .slice(-limit)
          .reverse()
          .map((r) => {
            const [, round, bot] = r.purpose.split(":");
            return {
              at: r.at,
              round,
              bot: Number(bot?.replace("bot-", "") ?? 0),
              year: 0,
              choice: "",
              lang: "",
              input: r.usage.input,
              cached: r.usage.cached,
              output: r.usage.output,
              reasoning: r.usage.reasoning,
              costUsd: r.costUsd,
            };
          }),
      };
    },
  };
}
