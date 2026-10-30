import { M } from "./model.mjs";
import { DOOR, doorBack } from "./door.mjs";

const turnAbout = ([u, v], x, z, a) => [x + u * Math.cos(a) - v * Math.sin(a), z + u * Math.sin(a) + v * Math.cos(a)];

function zSpans(ring, x) {
  const hits = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if ((a[0] < x) !== (b[0] < x)) hits.push(a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]));
  }
  hits.sort((p, q) => p - q);
  const out = [];
  for (let i = 0; i + 1 < hits.length; i += 2) out.push([hits[i], hits[i + 1]]);
  return out;
}

function edgePoints(y0, y1, z0, z1, step = 0.2) {
  const out = [];
  const ny = Math.max(1, Math.ceil((y1 - y0) / step));
  const nz = Math.max(1, Math.ceil((z1 - z0) / step));
  for (let i = 0; i <= ny; i++) out.push([y0 + ((y1 - y0) * i) / ny, z0], [y0 + ((y1 - y0) * i) / ny, z1]);
  for (let j = 1; j < nz; j++) out.push([y0, z0 + ((z1 - z0) * j) / nz], [y1, z0 + ((z1 - z0) * j) / nz]);
  return out;
}

// The door turns about its hinge axis; a world point p is inside the door at angle a when p turned by +a lies in the
// door's rest cross-section. For each point that is one interval of a, solved exactly.
function forbidden(dy, dz, a1, a2, b1, b2) {
  const rho = Math.hypot(dy, dz);
  if (rho < 1e-6) return null;
  const theta = Math.atan2(dz, dy);
  if (-a2 / rho > 1 || -b2 / rho > 1) return null;
  const tA0 = Math.acos(Math.min(1, -a1 / rho));
  const tA1 = Math.acos(-a2 / rho);
  const tB0 = Math.asin(-b2 / rho);
  const tB1 = Math.asin(Math.min(1, -b1 / rho));
  const lo = Math.max(tA0, tB0);
  const hi = Math.min(tA1, tB1);
  if (hi <= lo) return null;
  let start = Math.PI + lo - theta;
  while (start > Math.PI) start -= 2 * Math.PI;
  while (start < -Math.PI) start += 2 * Math.PI;
  return [start, start + (hi - lo)];
}

export function doorAngleOf(phi, { clear = 0.3, step = 0.2 } = {}) {
  const ring = M.ARM_SHAPE.ring.map((p) => turnAbout(p, M.S[0], M.S[1], phi));
  const [px, pz] = M.pinAt(phi);
  const g = DOOR.gap;
  const spans = [];
  for (let x = DOOR.X0 + g - clear; x <= DOOR.X1 - g + clear + 1e-9; x += step) {
    const yb = Math.min(doorBack(x - clear), doorBack(x + clear));
    const a1 = yb - DOOR.hy - clear;
    const a2 = DOOR.Yf - g - DOOR.hy + clear;
    const b1 = DOOR.z0 - DOOR.hz - clear;
    const b2 = DOOR.z1 - DOOR.hz + clear;
    const rects = zSpans(ring, x).map(([z0, z1]) => [M.Y.arm[0], M.Y.arm[1], z0, z1]);
    const dx = x - px;
    if (Math.abs(dx) < M.PIN.r) {
      const h = Math.sqrt(M.PIN.r ** 2 - dx * dx);
      rects.push([M.Y.pin[0], M.Y.pin[1], pz - h, pz + h]);
    }
    for (const [y0, y1, z0, z1] of rects) {
      if (z1 < DOOR.z0 - 2) continue;
      for (const [y, z] of edgePoints(y0, y1, Math.max(z0, DOOR.z0 - 2), z1)) {
        const span = forbidden(y - DOOR.hy, z - DOOR.hz, a1, a2, b1, b2);
        if (span) spans.push(span, [span[0] + 2 * Math.PI, span[1] + 2 * Math.PI]);
      }
    }
  }
  spans.sort((p, q) => p[0] - q[0]);
  let alpha = 0;
  for (const [s0, s1] of spans) {
    if (s1 <= alpha) continue;
    if (s0 > alpha + 1e-9) break;
    alpha = s1;
  }
  return alpha;
}

export function doorTable({ from = M.STOP_OUT / M.RAD - 1, to = 180, step = 0.1 } = {}) {
  const deg = [];
  for (let d = from; d <= to + 1e-9; d += step) deg.push(+(doorAngleOf(d * M.RAD) / M.RAD).toFixed(2));
  return { from, step, deg };
}

if (process.argv[1] && process.argv[1].endsWith("door-table.mjs")) {
  const started = Date.now();
  const t = doorTable();
  let jump = 0;
  for (let i = 1; i < t.deg.length; i++) jump = Math.max(jump, Math.abs(t.deg[i] - t.deg[i - 1]));
  const show = [];
  for (let d = 180; d >= 84; d -= 1) {
    const i = Math.round((d - t.from) / t.step);
    if (t.deg[i] !== undefined && (d % 4 === 0 || (d > 150 && d < 168))) show.push(`${d}:${t.deg[i]}`);
  }
  console.log(show.join("  "));
  console.log("entries", t.deg.length, "max jump per step", jump.toFixed(2), "ms", Date.now() - started);
}
