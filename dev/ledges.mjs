import { M } from "../model.mjs";
const turn = ([u, v], x, z, a) => [x + u * Math.cos(a) - v * Math.sin(a), z + u * Math.sin(a) + v * Math.cos(a)];
const boxes = { left: { x: [-38, -35], z: [58.5, 60], y: [13.6, 19.6] }, right: { x: [29, 32], z: [58.5, 60], y: [23.6, 29.6] } };
let worst = { left: 99, right: 99 };
for (let d = 84; d <= 180; d += 0.1) {
  const phi = d * M.RAD;
  const ring = M.ARM_SHAPE.ring.map((p) => turn(p, M.S[0], M.S[1], phi));
  const [px, pz] = M.pinAt(phi);
  for (const [name, b] of Object.entries(boxes)) {
    const dist = (x, z) => Math.hypot(Math.max(b.x[0] - x, 0, x - b.x[1]), Math.max(b.z[0] - z, 0, z - b.z[1]));
    if (!(b.y[1] < M.Y.arm[0] || b.y[0] > M.Y.arm[1])) for (const [x, z] of ring) worst[name] = Math.min(worst[name], dist(x, z));
    if (!(b.y[1] < M.Y.pin[0] || b.y[0] > M.Y.pin[1])) worst[name] = Math.min(worst[name], dist(px, pz) - M.PIN.r);
  }
}
console.log("closest approach to ledges", worst);
