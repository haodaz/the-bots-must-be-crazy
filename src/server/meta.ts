// The only door to Meta's models. Two kinds of call: think (Muse Ember, text) and paint (Muse Image).
// Every call passes the budget gate first and leaves a receipt.
//
// Live calls need three things at once: a key (META_API_KEY), an explicit switch (MODEL_LIVE=1), and not
// being on the public deployment (VERCEL unset). Anything else is a rehearsal with a fake reply that costs $0.

import { existsSync, readFileSync } from "node:fs";
import { approve, estimateTokens, record, tokenCost, worstCaseText, PRICES, type Receipt, type Usage } from "./budget.ts";

const BASE = "https://api.meta.ai/v1";

/** Read .env.local into process.env (scripts run outside Next, which would normally do this). */
export function loadEnv(path = ".env.local") {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] != null) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export function liveAllowed(): boolean {
  return Boolean(process.env.META_API_KEY) && process.env.MODEL_LIVE === "1" && !process.env.VERCEL;
}

export type Effort = "none" | "minimal" | "low" | "medium" | "high";

export type ThinkRequest = {
  purpose: string;
  /** The stable part first (world rules, style): it is what the cache can reuse. */
  instructions: string;
  input: string;
  /** If given, the reply is JSON matching this schema. */
  schema?: { name: string; schema: Record<string, unknown> };
  effort?: Effort;
  maxOutputTokens: number;
  cacheKey?: string;
  /** Force a rehearsal even if live calls are allowed. */
  mock?: boolean;
};

export type ThinkResult = { text: string; json: unknown; receipt: Receipt };

export async function think(req: ThinkRequest): Promise<ThinkResult> {
  const live = liveAllowed() && !req.mock;
  const mode = live ? "live" : "mock";
  const inputTokens = estimateTokens(req.instructions + req.input + (req.schema ? JSON.stringify(req.schema.schema) : ""));
  const estimateUsd = worstCaseText(inputTokens, req.maxOutputTokens);
  approve(estimateUsd, mode);

  let text: string;
  let usage: Usage;
  if (live) {
    const res = await fetch(`${BASE}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.META_API_KEY}` },
      body: JSON.stringify({
        model: "muse-ember-1.0",
        instructions: req.instructions,
        input: req.input,
        reasoning: { effort: req.effort ?? "minimal" },
        max_output_tokens: req.maxOutputTokens,
        prompt_cache_key: req.cacheKey,
        store: false,
        ...(req.schema ? { text: { format: { type: "json_schema", name: req.schema.name, schema: req.schema.schema, strict: true } } } : {}),
      }),
    });
    const body = (await res.json()) as {
      output?: { type: string; content?: { type: string; text?: string }[] }[];
      usage?: { input_tokens: number; output_tokens: number; input_tokens_details?: { cached_tokens?: number }; output_tokens_details?: { reasoning_tokens?: number } };
      error?: { message?: string };
    };
    usage = {
      input: body.usage?.input_tokens ?? 0,
      cached: body.usage?.input_tokens_details?.cached_tokens ?? 0,
      output: body.usage?.output_tokens ?? 0,
      reasoning: body.usage?.output_tokens_details?.reasoning_tokens ?? 0,
    };
    text = (body.output ?? [])
      .flatMap((o) => (o.type === "message" ? (o.content ?? []) : []))
      .filter((c) => c.type === "output_text")
      .map((c) => c.text ?? "")
      .join("");
    const receipt = makeReceipt(req.purpose, "live", usage, 0, estimateUsd, res.ok && !body.error, body.error?.message);
    record(receipt);
    if (!res.ok || body.error) throw new Error(`Muse Ember: ${res.status} ${body.error?.message ?? ""}`);
    return { text, json: req.schema ? safeJson(text) : null, receipt };
  }

  // Rehearsal: a reply of the right shape, and the token counts a real one would roughly have.
  const fake = req.schema ? mockFromSchema(req.schema.schema) : "ready";
  text = typeof fake === "string" ? fake : JSON.stringify(fake);
  usage = { input: inputTokens, cached: 0, output: Math.min(req.maxOutputTokens, estimateTokens(text) + 20), reasoning: 20 };
  const receipt = makeReceipt(req.purpose, "mock", usage, 0, estimateUsd, true);
  record(receipt);
  return { text, json: req.schema ? fake : null, receipt };
}

export type PaintRequest = { purpose: string; prompt: string; size?: string; mock?: boolean };
export type PaintResult = { b64: string | null; receipt: Receipt };

/** One image from Muse Image ($0.01 flat). Returns base64 webp, or null in a rehearsal. */
export async function paint(req: PaintRequest): Promise<PaintResult> {
  const live = liveAllowed() && !req.mock;
  const mode = live ? "live" : "mock";
  const estimateUsd = PRICES["muse-image-1.0"].image;
  approve(estimateUsd, mode);
  if (!live) {
    const receipt = makeReceipt(req.purpose, "mock", { input: 0, cached: 0, output: 0, reasoning: 0 }, 1, estimateUsd, true, "rehearsal: no image");
    record(receipt);
    return { b64: null, receipt };
  }
  const res = await fetch(`${BASE}/images/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.META_API_KEY}` },
    body: JSON.stringify({ model: "muse-image-1.0", prompt: req.prompt, n: 1, size: req.size ?? "1024x1024", response_format: "b64_json" }),
  });
  const body = (await res.json()) as { data?: { b64_json?: string }[]; error?: { message?: string } };
  const b64 = body.data?.[0]?.b64_json ?? null;
  const receipt = makeReceipt(req.purpose, "live", { input: 0, cached: 0, output: 0, reasoning: 0 }, b64 ? 1 : 0, estimateUsd, Boolean(b64), body.error?.message);
  record(receipt);
  if (!b64) throw new Error(`Muse Image: ${res.status} ${body.error?.message ?? ""}`);
  return { b64, receipt };
}

function makeReceipt(purpose: string, mode: "live" | "mock", usage: Usage, images: number, estimateUsd: number, ok: boolean, note?: string): Receipt {
  const costUsd = images ? images * PRICES["muse-image-1.0"].image : tokenCost(usage);
  return {
    at: new Date().toISOString(),
    model: images || purpose.startsWith("art:") ? "muse-image-1.0" : "muse-ember-1.0",
    purpose,
    mode,
    usage,
    images,
    estimateUsd,
    costUsd: mode === "live" ? costUsd : 0,
    ok,
    ...(note ? { note } : {}),
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** A plausible value for a JSON schema, for rehearsals. */
export function mockFromSchema(schema: Record<string, unknown>): unknown {
  const type = schema.type;
  if (schema.enum && Array.isArray(schema.enum)) return schema.enum[0];
  if (type === "object") {
    const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
    return Object.fromEntries(Object.entries(props).map(([k, v]) => [k, mockFromSchema(v)]));
  }
  if (type === "array") return [mockFromSchema((schema.items ?? {}) as Record<string, unknown>)];
  if (type === "number" || type === "integer") return typeof schema.minimum === "number" ? schema.minimum : 0;
  if (type === "boolean") return false;
  return typeof schema.description === "string" ? `(rehearsal) ${schema.description}` : "(rehearsal)";
}
