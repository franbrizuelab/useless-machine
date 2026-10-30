import { DurableObject } from "cloudflare:workers";

// One global count of the flips visitors make, kept in a single Durable Object, so increments from everywhere are
// applied one at a time and never lost.
//   GET  /count  → { count }
//   POST /flip   → { count, counted }  (429 when the same address flips again within GAP_MS)
const SITE = "https://franbrizuelab.github.io";
const GAP_MS = 1500; // a real use runs the motor for about 2.3 s, so one flip per 1.5 s per address is plenty
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export class Counter extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // addresses are kept in memory only, for the rate limit; they are never stored
    this.recent = new Map();
  }
  async count() {
    return (await this.ctx.storage.get("count")) ?? 0;
  }
  async flip(address) {
    const now = Date.now();
    const count = await this.count();
    if (now - (this.recent.get(address) ?? 0) < GAP_MS) return { count, counted: false };
    this.recent.set(address, now);
    if (this.recent.size > 5000) for (const [key, at] of this.recent) if (now - at >= GAP_MS) this.recent.delete(key);
    await this.ctx.storage.put("count", count + 1);
    return { count: count + 1, counted: true };
  }
}

// the page on GitHub Pages, a local server, or a file opened from disk (Origin "null") may use it
const allowedOrigin = (origin) => origin === SITE || origin === "null" || LOCAL.test(origin ?? "");

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const cors = {
      "Access-Control-Allow-Origin": origin && allowedOrigin(origin) ? origin : SITE,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const counter = env.COUNTER.get(env.COUNTER.idFromName("global"));
    const { pathname } = new URL(request.url);
    if (pathname === "/count" && request.method === "GET") return json({ count: await counter.count() });
    if (pathname === "/flip" && request.method === "POST") {
      if (origin && !allowedOrigin(origin)) return json({ error: "origin not allowed" }, 403);
      const result = await counter.flip(request.headers.get("CF-Connecting-IP") ?? "unknown");
      return json(result, result.counted ? 200 : 429);
    }
    return json({ error: "not found" }, 404);
  },
};
