import * as k from "/home/franciscobrizuela/.claude/skills/anatomy/kit/iso-kit.mjs";
import { M } from "../model.mjs";
const BOX = { x: -64, y: -42, w: 128, d: 84, r: 3 };
const P = k.fitProjection([...k.boxCorners(BOX, -3, 63), [M.LEVER.x, 14.5, 85], [M.LEVER.x, 14.5, 85]], 980, 640, { pad: 96, azimuth: 50, elevation: 30 });
const f = (p) => k.iso(p, P).map((v) => v.toFixed(0)).join(",");
for (let d = 180; d >= 84; d -= 8) {
  const phi = d * M.RAD;
  const [px, pz] = M.pinAt(phi);
  console.log(d, "pin", f([px, M.Y.pin[0], pz]), f([px, M.Y.pin[1], pz]));
}
const T = { x: M.LEVER.x, y: M.Y.toggle };
console.log("nut", f([T.x + 4.9, T.y, 64]), "dome", f([T.x, T.y, 69.6]), "spring0", f([-23, 31.6, 63.9]), "spring1", f([17.4, 31.6, 63.9]));
console.log("toggle body front", f([T.x, T.y + 6, 50]), f([T.x, T.y + 6, 59]));
