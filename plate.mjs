import { iso, pathOf, cameraOf } from "./kit-link.mjs";

const LIGHT_UP = 1.2;
const BANDS = [0, 0.2, 0.42, 0.62];
export const bandIn = (score) => {
  let tone = 0;
  while (tone < BANDS.length && score >= BANDS[tone]) tone++;
  return tone;
};
export const toward = (P) => {
  const { sinA, cosA, sinE, cosE } = cameraOf(P);
  const light = [-sinA, cosA, LIGHT_UP];
  const norm = Math.hypot(light[0], light[1], light[2]);
  return { V: [cosA * cosE, sinA * cosE, sinE], L: [light[0] / norm, light[1] / norm, light[2] / norm] };
};
export const dotv = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const orient = (points) => {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    area += x0 * y1 - x1 * y0;
  }
  return area >= 0 ? points : [...points].reverse();
};

export function plateOf(ring, pose, P) {
  const { x = 0, z = 0, a = 0, y0, y1 } = pose;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const world = ring.map(([u, v]) => [x + u * ca - v * sa, z + u * sa + v * ca]);
  let area = 0;
  for (let i = 0; i < world.length; i++) {
    const [xa, za] = world[i];
    const [xb, zb] = world[(i + 1) % world.length];
    area += xa * zb - xb * za;
  }
  const pts = area >= 0 ? world : [...world].reverse();
  const n = pts.length;
  const front = pts.map(([px, pz]) => iso([px, y1, pz], P));
  const back = pts.map(([px, pz]) => iso([px, y0, pz], P));
  const { V, L } = toward(P);
  const buckets = [[], [], [], [], []];
  const quads = [];
  const seen = [];
  const normals = [];
  for (let j = 0; j < n; j++) {
    const [xa, za] = pts[j];
    const [xb, zb] = pts[(j + 1) % n];
    const dx = xb - xa;
    const dz = zb - za;
    const len = Math.hypot(dx, dz) || 1;
    const normal = [dz / len, 0, -dx / len];
    normals.push(normal);
    const visible = dotv(normal, V) > 1e-6;
    seen.push(visible);
    if (visible) {
      const quad = pathOf(orient([front[j], front[(j + 1) % n], back[(j + 1) % n], back[j]]), true);
      buckets[bandIn(dotv(normal, L))].push(quad);
      quads.push(quad);
    }
  }
  const lines = [];
  for (let j = 0; j < n; j++) {
    const prev = (j - 1 + n) % n;
    if (seen[j]) lines.push(pathOf([back[j], back[(j + 1) % n]]));
    const sharp = dotv(normals[prev], normals[j]) < Math.cos(0.45);
    if (seen[j] !== seen[prev] || (seen[j] && seen[prev] && sharp)) lines.push(pathOf([front[j], back[j]]));
  }
  const cap = pathOf(orient(front), true);
  const capTone = bandIn(dotv([0, 1, 0], L));
  return {
    fill: [cap, ...quads].join(""),
    shades: buckets.slice(0, 4).map((list) => list.join("")),
    top: buckets[4].join(""),
    cap: { d: cap, tone: capTone },
    back: lines.join(""),
    outline: pathOf(front, true),
    front,
  };
}

export function plateParts(paths, { tone = "hi" } = {}) {
  return [
    { c: "iso-fill", d: paths.fill },
    ...paths.shades.map((d, shade) => ({ c: "iso-shade", s: shade, d })),
    { c: "iso-top", d: paths.top },
    { c: "iso-line iso-edge", t: tone, d: paths.back },
    paths.cap.tone >= 4 ? { c: "iso-top", d: paths.cap.d } : { c: "iso-shade", s: paths.cap.tone, d: paths.cap.d },
    { c: "iso-line iso-edge", t: tone, d: paths.outline },
  ];
}

export const partMarkup = (descs) => descs.map((p) => `<path class="${p.c}"${p.s !== undefined ? ` data-shade="${p.s}"` : ""}${p.t ? ` data-tone="${p.t}"` : ""} d="${p.d}"/>`).join("");
export function partSvg(part) {
  return `<g class="iso-solid"${part.lit ? " data-lit" : ""}>${partMarkup(part.solid)}</g>${partMarkup(part.lines)}`;
}
export const partDs = (part) => [...part.solid, ...part.lines].map((p) => p.d);
export const partRows = (part) => ({ lit: part.lit, solid: part.solid.length, lines: part.lines.length });

export const onPlate = (points, y, P, closed = false) => pathOf(points.map(([x, z]) => iso([x, y, z], P)), closed);
export const turnPoint = ([u, v], x, z, a) => [x + u * Math.cos(a) - v * Math.sin(a), z + u * Math.sin(a) + v * Math.cos(a)];
export const circlePoly = (r, steps = 28, cx = 0, cz = 0) => Array.from({ length: steps }, (_, i) => [cx + r * Math.cos((i / steps) * Math.PI * 2), cz + r * Math.sin((i / steps) * Math.PI * 2)]);
export const ringOnPlate = (x, z, r, y, P, steps = 24) => onPlate(circlePoly(r, steps, x, z), y, P, true);

export function rectPoly(u0, v0, u1, v1, r = 0, steps = 4) {
  if (!r) return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  const out = [];
  const corner = (cx, cz, from) => {
    for (let i = 0; i <= steps; i++) {
      const t = from + (i / steps) * (Math.PI / 2);
      out.push([cx + r * Math.cos(t), cz + r * Math.sin(t)]);
    }
  };
  corner(u1 - r, v0 + r, -Math.PI / 2);
  corner(u1 - r, v1 - r, 0);
  corner(u0 + r, v1 - r, Math.PI / 2);
  corner(u0 + r, v0 + r, Math.PI);
  return out;
}

export function gearPoly(teeth, module, phase = 0) {
  const rp = (module * teeth) / 2;
  const root = rp - 1.25 * module;
  const tip = rp + module;
  const pitch = (Math.PI * 2) / teeth;
  const out = [];
  for (let k = 0; k < teeth; k++) {
    const c = phase + k * pitch;
    out.push([root, c - 0.3 * pitch], [tip, c - 0.12 * pitch], [tip, c + 0.12 * pitch], [root, c + 0.3 * pitch], [root, c + 0.5 * pitch]);
  }
  return out.map(([r, t]) => [r * Math.cos(t), r * Math.sin(t)]);
}

export function roundPoly(points, r, steps = 5) {
  const out = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const here = points[i];
    const next = points[(i + 1) % n];
    const toPrev = [prev[0] - here[0], prev[1] - here[1]];
    const toNext = [next[0] - here[0], next[1] - here[1]];
    const lp = Math.hypot(...toPrev);
    const ln = Math.hypot(...toNext);
    const cut = Math.min(r, lp * 0.48, ln * 0.48);
    const a = [here[0] + (toPrev[0] / lp) * cut, here[1] + (toPrev[1] / lp) * cut];
    const b = [here[0] + (toNext[0] / ln) * cut, here[1] + (toNext[1] / ln) * cut];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      out.push([(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * here[0] + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * here[1] + t * t * b[1]]);
    }
  }
  return out;
}
