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
//
// It also keeps the messages visitors send from the page's footer. A message needs the same proof of work, and each
// visitor may send MESSAGES_EACH in all (by a random id their browser keeps) and each address ADDRESS_PER_DAY a day
// (stored only as a keyed hash). The owner reads and deletes them at /inbox/<INBOX_KEY>, and can reset every limit.
//   POST /message    { name, message, visitor, challenge, sig, nonce } → { sent, left } or { error }
// the site's home, plus the GitHub Pages address it had before the domain
const SITE = "https://sparsefocus.com";
const SITES = [SITE, "https://www.sparsefocus.com", "https://franbrizuelab.github.io"];
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const BITS = 17;
const CHALLENGE_MS = 120000;
const GAP_MS = 2000;
const BUCKET = { size: 30, refillMs: 5000 };
const MESSAGES_EACH = 2;
const ADDRESS_PER_DAY = 4;
const DAY_MS = 86400000;
const NAME_MAX = 60;
const MESSAGE_MAX = 500;

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

export class Inbox extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, name TEXT, body TEXT)");
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS senders (key TEXT PRIMARY KEY, count INTEGER, since INTEGER)");
  }
  sender(key) {
    return this.ctx.storage.sql.exec("SELECT count, since FROM senders WHERE key = ?", key).toArray()[0] ?? null;
  }
  async post(visitor, address, name, body) {
    const now = Date.now();
    const mine = this.sender(visitor);
    const sent = mine ? mine.count : 0;
    if (sent >= MESSAGES_EACH) return { error: "limit", left: 0 };
    const net = this.sender(address);
    const today = net && now - net.since < DAY_MS ? net.count : 0;
    if (today >= ADDRESS_PER_DAY) return { error: "busy", left: MESSAGES_EACH - sent };
    this.ctx.storage.sql.exec("INSERT INTO messages (at, name, body) VALUES (?, ?, ?)", now, name, body);
    this.ctx.storage.sql.exec("INSERT INTO senders (key, count, since) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET count = excluded.count, since = excluded.since", visitor, sent + 1, mine ? mine.since : now);
    this.ctx.storage.sql.exec("INSERT INTO senders (key, count, since) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET count = excluded.count, since = excluded.since", address, today + 1, today ? net.since : now);
    return { sent: true, left: MESSAGES_EACH - sent - 1 };
  }
  async list() {
    return this.ctx.storage.sql.exec("SELECT id, at, name, body FROM messages ORDER BY id DESC").toArray();
  }
  async remove(id) {
    this.ctx.storage.sql.exec("DELETE FROM messages WHERE id = ?", id);
  }
  // the owner's reset: every visitor and every address may send again
  async reset() {
    this.ctx.storage.sql.exec("DELETE FROM senders");
  }
}

// text from the form: normalised, control characters dropped (line breaks kept), counted in characters, not bytes
const cleanText = (text, max, lines) => {
  if (typeof text !== "string") return null;
  const clean = text.normalize("NFC").replace(lines ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, "").trim();
  const length = [...clean].length;
  return length >= 1 && length <= max ? clean : null;
};
const escapeHtml = (text) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function inboxPage(messages, key) {
  const rows = messages
    .map(
      (m) =>
        `<article><header><b>${escapeHtml(m.name)}</b><time>${new Date(m.at).toISOString().replace("T", " ").slice(0, 16)} UTC</time><form method="post" action="/inbox/${key}/delete"><input type="hidden" name="id" value="${m.id}"><button>Delete</button></form></header><p>${escapeHtml(m.body)}</p></article>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Useless machine · inbox</title><style>body{margin:0;background:#f2f2ef;color:#18181a;font:15px/1.55 ui-sans-serif,system-ui,sans-serif}main{width:min(720px,100% - 32px);margin:40px auto}h1{display:flex;align-items:baseline;font-size:18px;margin:0 0 18px}h1 form{margin-left:auto}h1 span{color:#8c8c90;font:12px ui-monospace,monospace;letter-spacing:.06em;margin-left:8px}article{background:#fbfbfa;border-radius:12px;box-shadow:0 0 0 1px #c9c9d0;padding:14px 18px;margin:0 0 12px}article header{display:flex;align-items:baseline;gap:12px}time{color:#8c8c90;font:12px ui-monospace,monospace}form{margin-left:auto}button{border:1px solid #c9c9d0;border-radius:8px;background:#fff;padding:3px 10px;font:12px ui-monospace,monospace;cursor:pointer}p{margin:8px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}.none{color:#8c8c90}</style></head><body><main><h1>Messages<span>${messages.length}</span><form class="reset" method="post" action="/inbox/${key}/reset"><button title="Lets every visitor and every network send again">Reset send limits</button></form></h1>${rows || '<p class="none">No messages yet.</p>'}</main></body></html>`;
}

// the site, a local server, or a file opened from disk (Origin "null") may use it
const allowedOrigin = (origin) => SITES.includes(origin) || origin === "null" || LOCAL.test(origin ?? "");

async function validProof(body, secret) {
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
      if (!(await validProof(body, env.SECRET))) return json({ error: "bad or stale proof" }, 400);
      const result = await counter.flip(request.headers.get("CF-Connecting-IP") ?? "unknown", body.challenge);
      return json(result, result.counted ? 200 : 429);
    }
    if (pathname === "/message" && request.method === "POST") {
      if (origin && !allowedOrigin(origin)) return json({ error: "origin not allowed" }, 403);
      const body = await request.json().catch(() => null);
      if (!(await validProof(body, env.SECRET))) return json({ error: "proof" }, 400);
      const name = cleanText(body.name, NAME_MAX, false);
      const message = cleanText(body.message, MESSAGE_MAX, true);
      if (!name || !message || typeof body.visitor !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(body.visitor)) return json({ error: "invalid" }, 400);
      const inbox = env.INBOX.get(env.INBOX.idFromName("inbox"));
      const address = await sign(env.SECRET, `address:${request.headers.get("CF-Connecting-IP") ?? "unknown"}`);
      const result = await inbox.post(`visitor:${body.visitor}`, `address:${address}`, name, message);
      return json(result, result.sent ? 200 : 429);
    }
    const box = /^\/inbox\/([^/]+)(\/delete|\/reset)?$/.exec(pathname);
    if (box && env.INBOX_KEY && sameText(box[1], env.INBOX_KEY)) {
      const inbox = env.INBOX.get(env.INBOX.idFromName("inbox"));
      const page = (status = 200) => inbox.list().then((list) => new Response(inboxPage(list, box[1]), { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } }));
      if (box[2] === "/reset" && request.method === "POST") {
        await inbox.reset();
        return Response.redirect(new URL(`/inbox/${box[1]}`, request.url).href, 303);
      }
      if (box[2] === "/delete" && request.method === "POST") {
        const id = Number((await request.formData()).get("id"));
        if (Number.isInteger(id)) await inbox.remove(id);
        return Response.redirect(new URL(`/inbox/${box[1]}`, request.url).href, 303);
      }
      if (!box[2] && request.method === "GET") return page();
    }
    return json({ error: "not found" }, 404);
  },
};
