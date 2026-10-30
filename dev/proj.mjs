import * as k from "/home/franciscobrizuela/.claude/skills/anatomy/kit/iso-kit.mjs";
import { M } from "../model.mjs";
const BOX = { x: -64, y: -42, w: 128, d: 84, r: 3 };
const P = k.fitProjection([...k.boxCorners(BOX, -3, 63), [M.LEVER.x, 14.5, 85], [M.LEVER.x, 14.5, 85]], 980, 640, { pad: 96, azimuth: 50, elevation: 30 });
const pts = { origin: [0, 0, 0], ex: [10, 0, 0], ey: [0, 10, 0], ez: [0, 0, 10], boardBR: [36, -31, 5], motorRear: [42.8, -17, 28], toggleLug: [5.5, 12.3, 45], limitR: [-17, 25.5, 23], frontRight: [50, 36, 5], plateTopL: [0, 15.5, 44], cornerBR: [64, -42, 0], cornerFR: [64, 42, 0] };
for (const [n, p] of Object.entries(pts)) console.log(n.padEnd(12), k.iso(p, P).map((v) => v.toFixed(0)).join(", "));
console.log("depth V", JSON.stringify(k.towardViewer ? k.towardViewer(P) : null));
