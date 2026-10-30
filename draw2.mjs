import { iso, pathOf } from "./kit-link.mjs";
import { toward, dotv, bandIn, orient } from "./plate.mjs";
import { DOOR, DOOR_RING, DOOR_INSET, HINGE, doorFrame, inDoor } from "./door.mjs";

export function slabIn(ring, F, s0, s1, P) {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const [u0, v0] = ring[i];
    const [u1, v1] = ring[(i + 1) % ring.length];
    area += u0 * v1 - u1 * v0;
  }
  const pts = area >= 0 ? ring : [...ring].reverse();
  const n = pts.length;
  const { V, L } = toward(P);
  const up = dotv(F.a, V) >= 0;
  const sNear = up ? s1 : s0;
  const sFar = up ? s0 : s1;
  const near = pts.map(([u, v]) => iso(inDoorFrame(F, u, v, sNear), P));
  const far = pts.map(([u, v]) => iso(inDoorFrame(F, u, v, sFar), P));
  const buckets = [[], [], [], [], []];
  const quads = [];
  const seen = [];
  const normals = [];
  for (let j = 0; j < n; j++) {
    const [ua, va] = pts[j];
    const [ub, vb] = pts[(j + 1) % n];
    const du = ub - ua;
    const dv = vb - va;
    const len = Math.hypot(du, dv) || 1;
    const normal = [0, 1, 2].map((k) => (dv * F.u[k] - du * F.v[k]) / len);
    normals.push(normal);
    const visible = dotv(normal, V) > 1e-6;
    seen.push(visible);
    if (visible) {
      const quad = pathOf(orient([near[j], near[(j + 1) % n], far[(j + 1) % n], far[j]]), true);
      buckets[bandIn(dotv(normal, L))].push(quad);
      quads.push(quad);
    }
  }
  const lines = [];
  for (let j = 0; j < n; j++) {
    const prev = (j - 1 + n) % n;
    if (seen[j]) lines.push(pathOf([far[j], far[(j + 1) % n]]));
    const sharp = dotv(normals[prev], normals[j]) < Math.cos(0.45);
    if (seen[j] !== seen[prev] || (seen[j] && seen[prev] && sharp)) lines.push(pathOf([near[j], far[j]]));
  }
  const cap = pathOf(orient(near), true);
  const capNormal = up ? F.a : F.a.map((c) => -c);
  return {
    fill: [cap, ...quads].join(""),
    shades: buckets.slice(0, 4).map((list) => list.join("")),
    top: buckets[4].join(""),
    cap: { d: cap, tone: bandIn(dotv(capNormal, L)) },
    back: lines.join(""),
    outline: pathOf(near, true),
  };
}
const inDoorFrame = (F, u, v, s) => inDoor(F, u, v, s);

const rectRing = (x0, x1, y0, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
export const DOOR_LEAF = rectRing(HINGE.doorLeaf.x[0], HINGE.doorLeaf.x[1], HINGE.doorLeaf.y[0], HINGE.doorLeaf.y[1]);

const solidList = (paths, tone) => [
  { c: "iso-fill", d: paths.fill },
  ...paths.shades.map((d, shade) => ({ c: "iso-shade", s: shade, d })),
  { c: "iso-top", d: paths.top },
  { c: "iso-line iso-edge", t: tone, d: paths.back },
  paths.cap.tone >= 4 ? { c: "iso-top", d: paths.cap.d } : { c: "iso-shade", s: paths.cap.tone, d: paths.cap.d },
  { c: "iso-line iso-edge", t: tone, d: paths.outline },
];
const lineOf = (d, t = "lo") => ({ c: "iso-line", t, d });

// hooks: v3 ends each spring leg on a rivet dot where it bears on the door's leaf
export function doorPart(P, alpha, { hooks = false } = {}) {
  const F = doorFrame(alpha);
  const top = DOOR.z1;
  const leafTop = top + HINGE.doorLeaf.h;
  const on = (u, v, s) => iso(inDoor(F, u, v, s), P);
  const SCREW_X = [-18, -2.6, 12.6];
  const screws = SCREW_X.map((x) => on(x, 29.55, leafTop));
  const ring = (cx, cy, r, s) => pathOf(Array.from({ length: 14 }, (_, i) => on(cx + r * Math.cos((i / 14) * Math.PI * 2), cy + r * Math.sin((i / 14) * Math.PI * 2), s)), true);
  const legs = HINGE.springs.map((spring) => pathOf([on(spring.x[1], DOOR.hy - HINGE.coilR, DOOR.hz), on(spring.x[1], HINGE.doorLeaf.y[0] + 0.7, leafTop + 0.05)]));
  const hookDots = hooks ? HINGE.springs.map((spring) => on(spring.x[1], HINGE.doorLeaf.y[0] + 0.7, leafTop + 0.05)) : [];
  return {
    groups: [
      { cls: "um-glass", solid: solidList(slabIn(DOOR_RING, F, DOOR.z0, DOOR.z1, P), "hi") },
      { cls: "", solid: solidList(slabIn(DOOR_LEAF, F, top, leafTop, P), "mid") },
    ],
    lines: [
      lineOf(pathOf(DOOR_INSET.map(([u, v]) => on(u, v, top)), true), "faint"),
      lineOf(SCREW_X.map((x) => ring(x, 29.55, 0.75, leafTop)).join(""), "lo"),
      lineOf(legs.join(""), "mid"),
    ],
    dots: [...screws, ...hookDots],
  };
}

const markupOf = (list) => list.map((p) => `<path class="${p.c}"${p.s !== undefined ? ` data-shade="${p.s}"` : ""}${p.t ? ` data-tone="${p.t}"` : ""} d="${p.d}"/>`).join("");
export function doorSvgOf(part) {
  const dots = part.dots ? `<g class="iso-dots" data-tone="mid">${part.dots.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="0.5"/>`).join("")}</g>` : "";
  return part.groups.map((g) => `${g.cls ? `<g class="${g.cls}">` : ""}<g class="iso-solid">${markupOf(g.solid)}</g>${g.cls ? "</g>" : ""}`).join("") + markupOf(part.lines) + dots;
}
export const doorDsOf = (part) => [...part.groups.flatMap((g) => g.solid.map((p) => p.d)), ...part.lines.map((p) => p.d)];
