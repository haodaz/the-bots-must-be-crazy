// Where the public game keeps its money straight. On the public deployment many people play at once on servers that
// keep no files, so the shared pool, each round's grain, the per-visitor limit and the receipts live in Redis
// (Upstash, over its REST API). Locally the same questions are answered from the receipt ledger file.
//
// Every thought first reserves its worst-case cost in one atomic step: the pool, the round's grain and the visitor's
// round count are all checked together, so two visitors can never both slip past the cap. When the reply is back the
// reservation is settled to the real cost; if the call fails, it is refunded.

import { capUsd, readLedger, type Receipt } from "./budget.ts";

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
};

export type Summary = { kind: "redis" | "file"; spent: number; cap: number; thoughts: number; rounds: number; receipts: PublicReceipt[] };

export interface Store {
  kind: "redis" | "file";
  reserve(round: string, estimate: number, grain: number, visitor: string): Promise<Reserve>;
  settle(round: string, estimate: number, receipt: PublicReceipt, trace: Record<string, unknown>): Promise<void>;
  refund(round: string, estimate: number): Promise<void>;
  roundSpent(round: string): Promise<number>;
  summary(limit?: number): Promise<Summary>;
}

/** The shared pool for the public game, in US$. Kept well under the $10 of credits, which also paid for development. */
export function poolUsd() {
  return Number(process.env.PUBLIC_POOL_USD ?? 4);
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
  spent: "tbmbc:pool:spent",
  thoughts: "tbmbc:pool:thoughts",
  rounds: "tbmbc:pool:rounds",
  receipts: "tbmbc:receipts",
  trace: "tbmbc:trace",
  round: (r: string) => `tbmbc:round:${r}`,
  visitor: (v: string) => `tbmbc:visitor:${v}:${new Date().toISOString().slice(0, 13)}`,
};

/** Check the pool, the round's grain and the visitor's rounds together; reserve the estimate only if all three allow it. */
const RESERVE = `
local pool = tonumber(redis.call('GET', KEYS[1]) or '0')
local round = tonumber(redis.call('GET', KEYS[2]) or '0')
local est = tonumber(ARGV[1])
if pool + est > tonumber(ARGV[2]) then return {'pool', tostring(pool), tostring(round)} end
if round + est > tonumber(ARGV[3]) then return {'grain', tostring(pool), tostring(round)} end
local new = redis.call('SISMEMBER', KEYS[3], ARGV[4]) == 0
if new and redis.call('SCARD', KEYS[3]) >= tonumber(ARGV[5]) then return {'busy', tostring(pool), tostring(round)} end
if new then
  redis.call('SADD', KEYS[3], ARGV[4])
  redis.call('EXPIRE', KEYS[3], 3600)
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
    async reserve(round, estimate, grain, visitor) {
      const [r] = await call([["EVAL", RESERVE, 4, K.spent, K.round(round), K.visitor(visitor), K.rounds, estimate, poolUsd(), grain, round, roundsPerHour()]]);
      const [status, pool, rs] = r as [string, string, string];
      return status === "ok"
        ? { ok: true, pool: Number(pool), round: Number(rs) }
        : { ok: false, reason: status as "pool" | "grain" | "busy", pool: Number(pool), round: Number(rs) };
    },
    async settle(round, estimate, receipt, trace) {
      const diff = receipt.costUsd - estimate;
      await call([
        ["INCRBYFLOAT", K.spent, diff],
        ["INCRBYFLOAT", K.round(round), diff],
        ["INCR", K.thoughts],
        ["LPUSH", K.receipts, JSON.stringify(receipt)],
        ["LTRIM", K.receipts, 0, 4999],
        ["LPUSH", K.trace, JSON.stringify(trace)],
        ["LTRIM", K.trace, 0, 4999],
      ]);
    },
    async refund(round, estimate) {
      await call([
        ["INCRBYFLOAT", K.spent, -estimate],
        ["INCRBYFLOAT", K.round(round), -estimate],
      ]);
    },
    async roundSpent(round) {
      const [v] = await call([["GET", K.round(round)]]);
      return Number(v ?? 0);
    },
    async summary(limit = 300) {
      const [spent, thoughts, rounds, list] = await call([["GET", K.spent], ["GET", K.thoughts], ["GET", K.rounds], ["LRANGE", K.receipts, 0, limit - 1]]);
      return {
        kind: "redis",
        spent: Number(spent ?? 0),
        cap: poolUsd(),
        thoughts: Number(thoughts ?? 0),
        rounds: Number(rounds ?? 0),
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
    async summary(limit = 300) {
      const all = mindReceipts();
      const rounds = new Set(all.map((r) => r.purpose.split(":")[1]));
      return {
        kind: "file",
        spent: all.reduce((a, r) => a + r.costUsd, 0),
        cap: capUsd(),
        thoughts: all.length,
        rounds: rounds.size,
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
