import { DurableObject } from "cloudflare:workers";

// One global count of the flips visitors make, kept in a single Durable Object, so increments from everywhere are
// applied one at a time and never lost.
//
// A script should not be able to just loop on POST. Every flip has to carry a challenge this Worker signed (valid two
// minutes, usable once) and a proof of work on it: a nonce whose SHA-256 has BITS leading zero bits, about 130,000
// hashes. A browser finds one in a background thread while the arm moves; a script pays the same for every flip. On
// top of that each address gets one flip per GAP_MS at most, from a bucket of BUCKET.size that refills one every
// BUCKET.refillMs, so no single address can add more than about 720 an hour.
//
//   GET  /count      → { count }
//   GET  /challenge  → { challenge, sig, bits }
//   POST /flip       { challenge, sig, nonce } → { count, counted }  (429 when refused)
const SITE = "https://franbrizuelab.github.io";
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const BITS = 17;
const CHALLENGE_MS = 120000;
const GAP_MS = 2000;
const BUCKET = { size: 30, refillMs: 5000 };

const encoder = new TextEncoder();
const hex = (buffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
async function sign(secret, text) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(text)));
}
function zeroBits(bytes) {
  let bits = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    return bits + Math.clz32(byte) - 24;
  }
  return bits;
}

export class Counter extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // both kept in memory only: addresses for the rate limit, spent challenges until they expire
    this.addresses = new Map();
    this.spent = new Map();
  }
  async count() {
    return (await this.ctx.storage.get("count")) ?? 0;
  }
  async flip(address, challenge) {
    const now = Date.now();
    const count = await this.count();
    for (const [key, until] of this.spent) if (until < now) this.spent.delete(key);
    if (this.spent.has(challenge)) return { count, counted: false };
    const seen = this.addresses.get(address) ?? { last: 0, tokens: BUCKET.size, at: now };
    seen.tokens = Math.min(BUCKET.size, seen.tokens + (now - seen.at) / BUCKET.refillMs);
    seen.at = now;
    this.addresses.set(address, seen);
    if (now - seen.last < GAP_MS || seen.tokens < 1) return { count, counted: false };
    seen.tokens -= 1;
    seen.last = now;
    this.spent.set(challenge, now + CHALLENGE_MS);
    if (this.addresses.size > 10000) for (const [key, one] of this.addresses) if (now - one.at > BUCKET.size * BUCKET.refillMs) this.addresses.delete(key);
    await this.ctx.storage.put("count", count + 1);
    return { count: count + 1, counted: true };
  }
}

// the page on GitHub Pages, a local server, or a file opened from disk (Origin "null") may use it
const allowedOrigin = (origin) => origin === SITE || origin === "null" || LOCAL.test(origin ?? "");

async function validFlip(body, secret) {
  if (!body || typeof body.challenge !== "string" || typeof body.sig !== "string" || typeof body.nonce !== "string") return false;
  if (body.challenge.length > 64 || body.nonce.length > 24) return false;
  const issued = Number(body.challenge.split(".")[0]);
  const age = Date.now() - issued;
  if (!(age >= 0 && age < CHALLENGE_MS)) return false;
  if ((await sign(secret, body.challenge)) !== body.sig) return false;
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(`${body.challenge}.${body.nonce}`)));
  return zeroBits(hash) >= BITS;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const cors = {
      "Access-Control-Allow-Origin": origin && allowedOrigin(origin) ? origin : SITE,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const counter = env.COUNTER.get(env.COUNTER.idFromName("global"));
    const { pathname } = new URL(request.url);
    if (pathname === "/count" && request.method === "GET") return json({ count: await counter.count() });
    if (pathname === "/challenge" && request.method === "GET") {
      const challenge = `${Date.now()}.${hex(crypto.getRandomValues(new Uint8Array(12)))}`;
      return json({ challenge, sig: await sign(env.SECRET, challenge), bits: BITS });
    }
    if (pathname === "/flip" && request.method === "POST") {
      if (origin && !allowedOrigin(origin)) return json({ error: "origin not allowed" }, 403);
      const body = await request.json().catch(() => null);
      if (!(await validFlip(body, env.SECRET))) return json({ error: "bad or stale proof" }, 400);
      const result = await counter.flip(request.headers.get("CF-Connecting-IP") ?? "unknown", body.challenge);
      return json(result, result.counted ? 200 : 429);
    }
    return json({ error: "not found" }, 404);
  },
};
