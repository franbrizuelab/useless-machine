import { M } from "../model.mjs";
const RAD = M.RAD;
const turn = ([u, v], x, z, a) => [x + u * Math.cos(a) - v * Math.sin(a), z + u * Math.sin(a) + v * Math.cos(a)];
const H = { X0: -36, X1: 30, XK: -17.5, Yw: 12.2, Yn: 22.4, Yf: 31 };
const GAP = 0.4;
const HY = 31, HZ = 63.9, Z0 = 60, Z1 = 63;
const yBack = (x) => (x <= H.XK - GAP ? H.Yw + GAP : H.Yn + GAP);
// arm z-intervals at x
function zIntervals(ring, x) {
  const hits = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if ((a[0] - x) * (b[0] - x) < 0 || (a[0] === x)) {
      const t = (x - a[0]) / (b[0] - a[0] || 1e-9);
      hits.push(a[1] + (b[1] - a[1]) * t);
    }
  }
  hits.sort((p, q) => p - q);
  const out = [];
  for (let i = 0; i + 1 < hits.length; i += 2) out.push([hits[i], hits[i + 1]]);
  return out;
}
// is a point (y,z) inside the door slice at angle a (with clearance c)?
function inside(y, z, yb, a, c) {
  const dy = y - HY, dz = z - HZ;
  const yp = dy * Math.cos(a) - dz * Math.sin(a) + HY;
  const zp = dy * Math.sin(a) + dz * Math.cos(a) + HZ;
  return yp > yb - c && yp < H.Yf - GAP + c && zp > Z0 - c && zp < Z1 + c;
}
function rectPoints(y0, y1, z0, z1) {
  const pts = [];
  for (let y = y0; y <= y1 + 1e-9; y += Math.min(0.25, y1 - y0)) for (let z = z0; z <= z1 + 1e-9; z += Math.max(0.05, Math.min(0.25, z1 - z0))) pts.push([y, z]);
  return pts;
}
export function doorAngle(phi, c = 0.25) {
  const ring = M.ARM_SHAPE.ring.map((p) => turn(p, M.S[0], M.S[1], phi));
  const [px, pz] = M.pinAt(phi);
  const pts = [];
  for (let x = H.X0 + GAP; x <= H.X1 - GAP; x += 0.25) {
    const yb = yBack(x);
    for (const [z0, z1] of zIntervals(ring, x)) if (z1 > Z0 - 1) for (const p of rectPoints(M.Y.arm[0], M.Y.arm[1], Math.max(z0, Z0 - 1), z1)) pts.push([...p, yb]);
    const dx = x - px;
    if (Math.abs(dx) < M.PIN.r) {
      const h = Math.sqrt(M.PIN.r ** 2 - dx * dx);
      if (pz + h > Z0 - 1) for (const p of rectPoints(M.Y.pin[0], M.Y.pin[1], Math.max(pz - h, Z0 - 1), pz + h)) pts.push([...p, yb]);
    }
  }
  for (let a = 0; a <= 110 * RAD; a += 0.1 * RAD) if (!pts.some(([y, z, yb]) => inside(y, z, yb, a, c))) return a;
  return NaN;
}
if (process.argv[1].endsWith("door.mjs")) {
  let prev = 0, maxJump = 0;
  const rows = [];
  for (let d = 180; d >= 84; d -= 0.5) {
    const a = doorAngle(d * RAD) / RAD;
    maxJump = Math.max(maxJump, Math.abs(a - prev));
    prev = a;
    if (Math.abs(d % 4) < 1e-9) rows.push(`${d}:${a.toFixed(1)}`);
  }
  console.log(rows.join("  "));
  console.log("max jump per 0.5deg", maxJump.toFixed(2));
}
