import { readFileSync } from "node:fs";
const { kitScript } = await import("/home/franciscobrizuela/.claude/skills/anatomy/scripts/inline-kit.mjs");
const files = process.argv.slice(2);
const decl = (src) => new Set([...src.matchAll(/^(?:export\s+)?(?:const|let|function|var|async function)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]));
const seen = new Map();
for (const [name, src] of [["kit", kitScript()], ...files.map((f) => [f, readFileSync(f, "utf8")])]) {
  for (const n of decl(src)) {
    if (seen.has(n)) console.log("CLASH", n, seen.get(n), name);
    else seen.set(n, name);
  }
}
