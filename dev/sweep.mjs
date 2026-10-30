import { M } from "../model.mjs";
const RAD = M.RAD;
const turn = ([u, v], x, z, a) => [x + u * Math.cos(a) - v * Math.sin(a), z + u * Math.sin(a) + v * Math.cos(a)];
// x-extent of arm polygon within z band [60,63], and pin
let xmin = 1e9, xmax = -1e9, pinMin = 1e9, pinMax = -1e9;
const zl = 60, zh = 63;
for (let d = 84; d <= 180; d += 0.25) {
  const phi = d * RAD;
  const ring = M.ARM_SHAPE.ring.map((p) => turn(p, M.S[0], M.S[1], phi));
  // sample edges
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    for (let t = 0; t <= 1; t += 0.05) {
      const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      if (z >= zl - 0.01 && z <= zh + 2) { xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); }
    }
  }
  const [px, pz] = M.pinAt(phi);
  if (pz + M.PIN.r >= zl && pz - M.PIN.r <= zh + 2) { pinMin = Math.min(pinMin, px - M.PIN.r); pinMax = Math.max(pinMax, px + M.PIN.r); }
}
console.log("arm x in lid band", xmin.toFixed(2), xmax.toFixed(2), "pin x", pinMin.toFixed(2), pinMax.toFixed(2));
console.log("TOG x", M.LEVER.x.toFixed(2), "Y", JSON.stringify(M.Y), "flatZ", M.SWITCH.flatZ.toFixed(2), "S", M.S, "CENTRE", JSON.stringify(M.CENTRE));
for (const d of [180, 170, 160, 157, 150, 140, 130, 120, 110, 100, 90, 84]) {
  const phi = d * RAD;
  const [px, pz] = M.pinAt(phi);
  const ring = M.ARM_SHAPE.ring.map((p) => turn(p, M.S[0], M.S[1], phi));
  const top = Math.max(...ring.map((p) => p[1]));
  console.log(d, "pin", px.toFixed(1), pz.toFixed(1), "arm top z", top.toFixed(1));
}
