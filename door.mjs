import { M } from "./model.mjs";

export const DOOR = { X0: -36, X1: 30, XKb: -22, XKt: -12, Yw: 12.2, Yn: 22.4, Yf: 31, gap: 0.4, z0: 60, z1: 63, hy: 31.6, hz: 63.9, kr: 0.9 };

export function roundEach(points, radii, steps = 4) {
  const out = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const here = points[i];
    const next = points[(i + 1) % n];
    const r = radii[i];
    if (!r) {
      out.push(here);
      continue;
    }
    const toPrev = [prev[0] - here[0], prev[1] - here[1]];
    const toNext = [next[0] - here[0], next[1] - here[1]];
    const lp = Math.hypot(toPrev[0], toPrev[1]);
    const lnx = Math.hypot(toNext[0], toNext[1]);
    const cut = Math.min(r, lp * 0.48, lnx * 0.48);
    const a = [here[0] + (toPrev[0] / lp) * cut, here[1] + (toPrev[1] / lp) * cut];
    const b = [here[0] + (toNext[0] / lnx) * cut, here[1] + (toNext[1] / lnx) * cut];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      out.push([(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * here[0] + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * here[1] + t * t * b[1]]);
    }
  }
  return out;
}

const DG = DOOR.gap;
// The step between the wide and the narrow part runs along the view, so its face on the door never faces the viewer.
const DIAG_LEN = Math.hypot(DOOR.XKt - DOOR.XKb, DOOR.Yn - DOOR.Yw);
const DIAG_U = [(DOOR.XKt - DOOR.XKb) / DIAG_LEN, (DOOR.Yn - DOOR.Yw) / DIAG_LEN];
const DIAG_N = [-DIAG_U[1], DIAG_U[0]];
export const diagX = (y, g) => DOOR.XKb + DIAG_N[0] * g + (y - DOOR.Yw - DIAG_N[1] * g) * (DIAG_U[0] / DIAG_U[1]);
export const diagY = (x, g) => DOOR.Yw + DIAG_N[1] * g + (x - DOOR.XKb - DIAG_N[0] * g) * (DIAG_U[1] / DIAG_U[0]);
const doorCorners = (g, front) => [
  [DOOR.X0 + g, DOOR.Yw + g],
  [diagX(DOOR.Yw + g, g), DOOR.Yw + g],
  [diagX(DOOR.Yn + g, g), DOOR.Yn + g],
  [DOOR.X1 - g, DOOR.Yn + g],
  [DOOR.X1 - g, front],
  [DOOR.X0 + g, front],
];
export const DOOR_CORNERS = doorCorners(DG, DOOR.Yf - DG);
export const DOOR_RING = roundEach(DOOR_CORNERS, [1.2, 1.0, 1.0, 0.3, 0.6, 0.6]);
export const DOOR_INSET = roundEach(doorCorners(DG + 1.8, 26.8), [0.8, 0.8, 0.8, 0.8, 0.8, 0.8]);
export const doorBack = (x) => {
  if (x <= diagX(DOOR.Yw + DG, DG)) return DOOR.Yw + DG;
  if (x >= diagX(DOOR.Yn + DG, DG)) return DOOR.Yn + DG;
  return diagY(x, DG);
};
export const HINGE = {
  knuckles: [
    { x: [-35.2, -25.2], on: "lid" },
    { x: [-20.8, 15.2], on: "door" },
    { x: [19.6, 29.2], on: "lid" },
  ],
  springs: [{ x: [-24.9, -21.1] }, { x: [15.5, 19.3] }],
  pinR: 0.4,
  coilR: 0.85,
  turns: 5.5,
  doorLeaf: { x: [-25.4, 19.8], y: [28.2, 30.9], h: 0.5 },
  lidLeaves: [
    { x: [-35.2, -20.6], y: [32.3, 35.0], h: 0.5 },
    { x: [15.0, 29.2], y: [32.3, 35.0], h: 0.5 },
  ],
};

export function doorFrame(alpha) {
  const c = Math.cos(alpha);
  const s = Math.sin(alpha);
  const { hy, hz } = DOOR;
  return { o: [0, hy - hy * c - hz * s, hz + hy * s - hz * c], u: [1, 0, 0], v: [0, c, -s], a: [0, s, c] };
}
export const inDoor = (F, x, y, z) => [F.o[0] + x * F.u[0] + y * F.v[0] + z * F.a[0], F.o[1] + x * F.u[1] + y * F.v[1] + z * F.a[1], F.o[2] + x * F.u[2] + y * F.v[2] + z * F.a[2]];

export function doorAt(table, phi) {
  if (!table) return 0;
  const deg = phi / M.RAD;
  const at = (deg - table.from) / table.step;
  const i = Math.max(0, Math.min(table.deg.length - 2, Math.floor(at)));
  const t = Math.max(0, Math.min(1, at - i));
  return (table.deg[i] * (1 - t) + table.deg[i + 1] * t) * M.RAD;
}
