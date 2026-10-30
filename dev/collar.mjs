import { M } from "../model.mjs";
const TOG = { x: M.LEVER.x, y: M.Y.toggle };
const rim = M.LEVER.pivotZ - Math.sqrt(2.6 ** 2 - 4) - 0.01;
const turn = ([u, v], x, z, a) => [x + u * Math.cos(a) - v * Math.sin(a), z + u * Math.sin(a) + v * Math.cos(a)];
let worstPin = Infinity, worstArm = Infinity, at = null;
for (let d = 180; d >= M.STOP_OUT / M.RAD - 0.5; d -= 0.25) {
  const phi = d * M.RAD;
  const [px, pz] = M.pinAt(phi);
  // pin: a cylinder along y (r 1.5) over y 14.4..24; the collar spans y TOG.y±3.3, so they share y. Gap in the xz plane
  // between the pin's circle and the collar's rectangle x∈[TOG.x−3.3, TOG.x+3.3], z ≤ rim.
  const dx = Math.max(0, Math.abs(px - TOG.x) - 3.3);
  const dz = Math.max(0, pz - rim);
  const gap = Math.hypot(dx, dz) - M.PIN.r;
  if (gap < worstPin) { worstPin = gap; at = d; }
  // arm: y 24..27, the collar ends at TOG.y + 3.3 = 17.8 — no shared y, so it cannot touch.
}
console.log("rim", rim.toFixed(3), "pin to collar min gap", worstPin.toFixed(2), "at", at, "deg; arm y", M.Y.arm, "collar y", [TOG.y - 3.3, TOG.y + 3.3]);
