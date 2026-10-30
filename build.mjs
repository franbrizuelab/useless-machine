import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL = join(homedir(), ".claude", "skills", "anatomy");
const load = (file) => import(pathToFileURL(join(SKILL, file)).href);
const k = await load("kit/iso-kit.mjs");
const G = await load("kit/lathe.mjs");
const A = await load("kit/audit.mjs");
const { kitScript } = await load("scripts/inline-kit.mjs");
const { M } = await import("./model.mjs");
const { plateOf, plateParts, partSvg, partDs, onPlate, ringOnPlate, roundPoly, circlePoly, turnPoint, rectPoly } = await import("./plate.mjs");
const { dynamicParts } = await import("./draw.mjs");

const THEME = process.argv.includes("--dark") ? "dark" : "light";

const W = 980;
const H = 640;

const BOX = { x: -64, y: -42, w: 128, d: 84, r: 3 };
const WALL = 3;
const Z_BASE = 3;
const Z_WALL = 60;
const Z_LID = 60;
const LID_H = 3;
const SLIT = [21.5, 29.5];
const CAM_AZ = 50;
const CAM_EL = 30;

const PIECES = {
  base: { name: "Box and base", move: [0, 0, 0] },
  battery: { name: "Battery pack", move: [0, 0, 16] },
  mech: { name: "Motor, gears and arm", move: [0, 0, 60] },
  lid: { name: "Lid and toggle switch", move: [0, 0, 112] },
};
const STAGGER = ["lid", "mech", "battery", "base"];
const SPRING = { stagger: 0.035, stiffness: 64, damping: 14.2, substeps: 4 };

const ASSEMBLED = [...k.boxCorners(BOX, -3, 63), [M.LEVER.x, 14.5, 85], [M.LEVER.x, 14.5, 85]];
const P = k.fitProjection(ASSEMBLED, W, H, { pad: 96, azimuth: CAM_AZ, elevation: CAM_EL });
const V = G.viewOf(P);
const at = (point) => k.iso(point, P);

const R = A.recorder(P, { order: STAGGER, spring: SPRING });
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const D3 = (points3, style) => D(points3.map(at), style);

function put(piece, ref, svg, { bias = 0, shapes = [], name, dyn, group } = {}) {
  shapes.forEach((shape) => !R.solids.includes(shape) && R.solid(shape));
  R.put({ piece, ride: piece, at: ref, bias, svg, move: PIECES[piece].move, shapes, name: name ?? R.nameFor(`${piece}.item`), dyn, group });
}
const FRAME_Y = (x, z) => G.frameAlong([x, 0, z], [0, 1, 0]);
const FRAME_X = (y, z) => G.frameAlong([0, y, z], [1, 0, 0]);
const XZ = { o: [0, 0, 0], a: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] };
const slabShape = (plan, z, h, name) => A.slab(plan, z, h, { name }, 6);
const hexRing = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => [cx + r * Math.cos((i / 6) * Math.PI * 2 + Math.PI / 6), cy + r * Math.sin((i / 6) * Math.PI * 2 + Math.PI / 6)]);

const TOG = { x: M.LEVER.x, y: M.Y.toggle };
const worldRing = (ring, x, z, a) => ring.map((point) => turnPoint(point, x, z, a));
const LEVER_RING = M.LEVER.ring;

function baseItems() {
  const halo = `<path class="iso-halo" d="${k.haloOf(BOX, -6, 3, P)}"/>`;
  put("base", [0, 0, -6], halo, { bias: -500, shapes: [A.slab(BOX, -6.2, 0.1, { name: "base.halo", ground: true }, 6)], name: "base.halo" });
  for (const [x, y] of k.corners(BOX, 12)) {
    put("base", [x, y, -1.5], S(k.cylinder(x, y, 5.5, -3, 3, P, 26), { tone: "lo" }), { shapes: [A.cylinder(x, y, 5.5, -3, 3, { name: "base.foot", ground: true })], name: "base.foot" });
  }
  const screws = k.corners(BOX, 8.5);
  const plate = S(k.slabOf(BOX, 0, Z_BASE, P, 6, 0.8), { tone: "lo" }) + L(k.planOutline(k.insetPlan(BOX, 4.5), Z_BASE, P), { tone: "faint" }) + L(screws.map(([x, y]) => k.ring(x, y, 2.2, Z_BASE, P, 16)).join(""), { tone: "lo" }) + D(screws.map(([x, y]) => at([x, y, Z_BASE])), { size: 0.5 });
  put("base", [0, 0, 1.5], plate, { shapes: [A.slab(BOX, 0, Z_BASE, { name: "base.plate", ground: true }, 6)], name: "base.plate" });

  const back = { x: BOX.x, y: BOX.y, w: BOX.w, d: WALL, r: 0.6 };
  const faceY = BOX.y + WALL;
  const backSvg =
    `<g class="um-glass">${S(k.slabOf(back, Z_BASE, Z_WALL - Z_BASE, P, 3, 0.6), { tone: "mid", inner: L(k.sideSeam(back, 12, P, 3) + k.sideSeam(back, Z_WALL - 7, P, 3), { tone: "faint" }) })}</g>` +
    D3([[-52, faceY, 7.5], [-52, faceY, Z_WALL - 3.5], [56, faceY, 7.5], [56, faceY, Z_WALL - 3.5]], { size: 0.5 });
  put("base", [0, BOX.y + 1.5, 31], backSvg, { shapes: [slabShape(back, Z_BASE, Z_WALL - Z_BASE, "base.wallback")], name: "base.wallback" });
  const plaque = { x: 16, y: faceY, w: 40, d: 0.8, r: 0.3 };
  const plaqueSvg =
    S(k.slabOf(plaque, 14, 12, P, 2, 0.3), { tone: "lo", crease: "none" }) +
    L(k.segment([19, faceY + 0.8, 17], [36, faceY + 0.8, 17], P), { tone: "lo", free: true }) +
    L(k.segment([19, faceY + 0.8, 23], [53, faceY + 0.8, 23], P), { tone: "lo", free: true }) +
    k.faceTextSvg(k.sideMatrix([19, faceY + 0.8], 21, P, "left"), "USELESS MACHINE · 4.5 V", { size: 2.3, tone: "mid" });
  put("base", [36, faceY + 0.4, 20], plaqueSvg, { bias: 0.4, shapes: [A.slab(plaque, 14, 12, { name: "base.plaque" }, 2)], name: "base.plaque" });

  const left = { x: BOX.x, y: BOX.y + WALL, w: WALL, d: BOX.d - WALL, r: 0.6 };
  const faceX = BOX.x + WALL;
  const leftSvg =
    `<g class="um-glass">${S(k.slabOf(left, Z_BASE, Z_WALL - Z_BASE, P, 3, 0.6), { tone: "mid", inner: L(k.sideSeam(left, 12, P, 3) + k.sideSeam(left, Z_WALL - 7, P, 3), { tone: "faint" }) })}</g>` +
    D3([[faceX, -33, 7.5], [faceX, -33, Z_WALL - 3.5], [faceX, 35, 7.5], [faceX, 35, Z_WALL - 3.5]], { size: 0.5 });
  put("base", [BOX.x + 1.5, 0, 31], leftSvg, { shapes: [slabShape(left, Z_BASE, Z_WALL - Z_BASE, "base.wallleft")], name: "base.wallleft" });
}

function batteryItems() {
  const tray = { x: -60, y: -38.5, w: 54.5, d: 47.1, r: 2 };
  const trayTop = Z_BASE + 5;
  const base = S(k.slabOf(tray, Z_BASE, 5, P, 4, 0.5), { tone: "lo" }) + L(k.planOutline(k.insetPlan(tray, 3), trayTop, P, 4), { tone: "faint" });
  put("battery", [-33, -15, 5.5], base, { shapes: [slabShape(tray, Z_BASE, 5, "battery.tray")], name: "battery.tray" });
  const rails = [
    { x: -60, y: -38.5, w: 54.5, d: 1.4, r: 0.5 },
    { x: -60, y: 7.5, w: 54.5, d: 1.4, r: 0.5 },
  ];
  rails.forEach((plan, index) => put("battery", [-33, plan.y + 0.7, 9.5], S(k.slabOf(plan, trayTop, 5, P, 2, 0.4), { tone: "lo" }), { shapes: [slabShape(plan, trayTop, 5, `battery.rail${index}`)], name: `battery.rail${index}` }));
  const cellZ = trayTop + 7.25;
  [-29.6, -14.8, 0].forEach((y, index) => {
    const F = FRAME_X(y, cellZ);
    F.o = [-58.5, y, cellZ];
    const profile = [[0, 6.7], [0.5, 7.25], [48.2, 7.25], [48.2, 3.1], [50.2, 3.1]];
    const body = G.solidOf(profile, F, P);
    const wrap = [G.arcOf(F, 7, 7.25, P, { steps: 28 }), G.arcOf(F, 42, 7.25, P, { steps: 28 })].join("");
    const svg = S(body, { tone: "hi", inner: L(wrap, { tone: "faint" }) });
    put("battery", [-33, y, cellZ], svg, { shapes: [R.solid(A.solid(F, profile, { name: `battery.cell${index}` }))], name: `battery.cell${index}` });
  });
  const clip = { x: -7.3, y: -37, w: 1.2, d: 44, r: 0.4 };
  put("battery", [-6.7, -15, 13], S(k.slabOf(clip, trayTop, 9, P, 2, 0.3), { tone: "mid" }) + D3([[-6.1, -29.6, trayTop + 9], [-6.1, 0, trayTop + 9]], { size: 0.5 }), { bias: 0.3, shapes: [slabShape(clip, trayTop, 9, "battery.clip")], name: "battery.clip" });
}

const PLATE_POLY = roundPoly([[-10, 6], [58, 6], [58, 50], [46, 58], [22, 58], [16, 49], [16, 44], [-10, 44]], 3.5, 4);
const FOOT = { x: -39, y: 12, w: 97, d: 20, r: 2 };
const BLOCK = { x: -39, y: 20, w: 24, d: 11, r: 1.5 };
const SWB = { x: -37, y: M.Y.body[0], w: 20, d: M.Y.body[1] - M.Y.body[0], r: 0.8 };
const MOTOR = M.CENTRE.pinion;

function mechBackItems() {
  put("mech", [10, 22, 4.5], S(k.slabOf(FOOT, Z_BASE, 3, P, 4, 0.5), { tone: "mid" }) + D3([[-34, 17, 6], [-34, 27, 6], [53, 17, 6], [53, 27, 6]], { size: 0.5 }), { shapes: [slabShape(FOOT, Z_BASE, 3, "mech.foot")], name: "mech.foot" });
  const blockTop = M.SWITCH.bodyTop - 10;
  put("mech", [-27, 25.5, 12], S(k.slabOf(BLOCK, 6, blockTop - 6, P, 3, 0.4), { tone: "mid" }) + D3([[-34, BLOCK.y + BLOCK.d, 12]], { size: 0.45 }), { shapes: [slabShape(BLOCK, 6, blockTop - 6, "mech.block")], name: "mech.block" });
  const bodyH = 10;
  const swBody =
    S(k.slabOf(SWB, blockTop, bodyH, P, 3, 0.4), { tone: "hi", inner: L(k.sideSeam(SWB, blockTop + 5, P, 3), { tone: "faint" }) }) +
    D3([[SWB.x + 4, SWB.y + SWB.d, blockTop + 2.6], [SWB.x + SWB.w - 4, SWB.y + SWB.d, blockTop + 2.6]], { size: 0.5 });
  put("mech", [-27, 25.5, blockTop + 5], swBody, { bias: 0.2, shapes: [slabShape(SWB, blockTop, bodyH, "mech.limit")], name: "mech.limit" });

  const F = FRAME_Y(MOTOR[0], MOTOR[1]);
  F.o = [MOTOR[0], 0, MOTOR[1]];
  const profile = [[-19, 3], [-15, 3], [-15, 6.5], [-13, 6.5], [-13, 8.8], [-12, 9.5], [-6, 9.5], [-6, 9], [2, 9], [2, 9.5], [7, 9.5], [8, 8.8], [8, 10.4], [10.5, 10.4], [10.5, 5.2], [14, 5.2]];
  put("mech", [MOTOR[0], -2, MOTOR[1]], S(G.solidOf(profile, F, P), { tone: "hi" }), { shapes: [A.solid(F, profile, { name: "mech.motor" })], name: "mech.motor" });

  const plateY = M.Y.plate;
  const plate = plateOf(PLATE_POLY, { x: 0, z: 0, a: 0, y0: plateY[0], y1: plateY[1] }, P);
  const sx = [[8, 28], M.CENTRE.stage, M.CENTRE.pinion];
  const rings = sx.map(([x, z], index) => ringOnPlate(x, z, [4.2, 3.4, 2.8][index], plateY[1], P, 18)).join("");
  const sc = [[-4, 12], [52, 12], [52, 46], [22, 52]];
  const plateSvgText =
    `<g class="iso-solid">${partSvg({ solid: plateParts(plate, { tone: "mid" }), lines: [] })}</g>`.replace('<g class="iso-solid"><g class="iso-solid">', '<g class="iso-solid">').replace("</g></g>", "</g>") +
    L(rings, { tone: "lo" }) +
    L(sc.map(([x, z]) => ringOnPlate(x, z, 2, plateY[1], P, 14)).join(""), { tone: "lo" }) +
    D3(sc.map(([x, z]) => [x, plateY[1], z]), { size: 0.5 });
  put("mech", [20, 15.5, 30], plateSvgText, { shapes: [A.prism(XZ, PLATE_POLY, plateY[0], plateY[1], { name: "mech.plate" })], name: "mech.plate" });

  const gearSpec = [
    ["pinion", M.CENTRE.pinion, M.Y.g1, 4.8],
    ["stage", M.CENTRE.stage, M.Y.g1, 14.4],
    ["second", M.CENTRE.stage, M.Y.g2, 4.8],
    ["out", M.CENTRE.out, M.Y.g2, 14.4],
  ];
  return gearSpec;
}

const STATE0 = M.fresh();
const parts0 = dynamicParts(P, STATE0);

function mechDynamicItems(gearSpec) {
  for (const [name, c, layer, r] of gearSpec) {
    put("mech", [c[0], (layer[0] + layer[1]) / 2, c[1]], `<g data-dyn="${name}">${partSvg(parts0[name])}</g>`, { dyn: name, shapes: [A.disc(FRAME_Y(c[0], c[1]), layer[0], layer[1], r, { name: `mech.gear.${name}` })], name: `mech.gear.${name}` });
  }
  const leafAt = [M.SWITCH.hingeX + 8, 25.5, M.SWITCH.hingeZ + 1];
  put("mech", leafAt, `<g data-dyn="leaf">${partSvg(parts0.leaf)}</g>`, { dyn: "leaf", bias: 0.4, shapes: [A.prism(XZ, worldRing(rectPoly(0, 0, M.SWITCH.leaf, 0.9, 0.3, 2), M.SWITCH.hingeX, M.SWITCH.hingeZ, 0), M.Y.leaf[0], M.Y.leaf[1], { name: "mech.leaf" })], name: "mech.leaf" });
  const stub = (c, s0, s1, r, name) => {
    const F = FRAME_Y(c[0], c[1]);
    F.o = [c[0], 0, c[1]];
    return put("mech", [c[0], s1, c[1]], S(G.disc(s0, s1, r, F, P), { tone: "mid" }), { bias: 0.5, shapes: [A.disc(F, s0, s1, r, { name })], name });
  };
  stub(M.CENTRE.pinion, M.Y.g1[1], M.Y.g1[1] + 1.4, 1.2, "mech.shaft.motor");
  stub(M.CENTRE.stage, M.Y.g2[1], M.Y.g2[1] + 1.3, 2.2, "mech.axle");
  stub(M.S, M.Y.g2[1], M.Y.spacer[1], 5, "mech.spacer");
}

function lidBackItems() {
  const body = { x: TOG.x - 6, y: TOG.y - 6, w: 12, d: 12, r: 1 };
  const bodySvg =
    S(k.slabOf(body, 49, 11, P, 3, 0.4), { tone: "hi" }) +
    L(k.segment([body.x + 1.5, body.y + body.d, 52], [body.x + body.w - 1.5, body.y + body.d, 52], P), { tone: "faint" });
  const lugs = [-4, 0, 4].flatMap((dx) => [-2.2, 2.2].map((dy) => [TOG.x + dx, TOG.y + dy]));
  lugs.forEach(([x, y], index) => put("lid", [x, y, 47], S(k.cylinder(x, y, 0.6, 45, 4, P, 8), { tone: "mid", crease: "none" }), { bias: -0.2, shapes: [A.cylinder(x, y, 0.6, 45, 4, { name: `lid.lug${index}` })], name: `lid.lug${index}` }));
  put("lid", [TOG.x, TOG.y, 54], bodySvg, { shapes: [slabShape(body, 49, 11, "lid.toggle")], name: "lid.toggle" });

  const back = roundPoly([[BOX.x, BOX.y], [BOX.x + BOX.w, BOX.y], [BOX.x + BOX.w, SLIT[0]], [-12, SLIT[0]], [-12, 13], [BOX.x, 13]], 2.4, 3);
  const ring = back;
  const lidSvg = `<g class="um-glass">${S(k.extrude(ring, Z_LID, LID_H, P, { convex: false, bevel: 0.6 }), { tone: "hi" })}</g>` + `<g class="um-glassline">${L(k.onTop(ring.map(([x, y]) => [x, y]), Z_LID + LID_H, P, true), { tone: "faint" })}</g>`;
  const lidBackSvg = lidSvg.replace(
    L(k.onTop(ring, Z_LID + LID_H, P, true), { tone: "faint" }),
    L(k.onTop(roundPoly([[BOX.x + 5, BOX.y + 5], [BOX.x + BOX.w - 5, BOX.y + 5], [BOX.x + BOX.w - 5, SLIT[0] - 4], [-8, SLIT[0] - 4], [-8, 17], [BOX.x + 5, 17]], 1.5, 3), Z_LID + LID_H, P, true), { tone: "faint" }),
  );
  const screws = [[BOX.x + 7, BOX.y + 7], [BOX.x + BOX.w - 7, BOX.y + 7], [BOX.x + BOX.w - 7, SLIT[0] - 7], [BOX.x + 7, 19]];
  put("lid", [0, -10, Z_LID + 1.5], lidBackSvg + `<g class="um-glassline">${D(screws.map(([x, y]) => at([x, y, Z_LID + LID_H])), { size: 0.5 })}</g>`, { bias: 0.1, shapes: [A.extruded(ring, Z_LID, LID_H, { name: "lid.back" })], name: "lid.back" });

  const nut = hexRing(TOG.x, TOG.y, 4.9);
  const nutSvg =
    S(k.cylinder(TOG.x, TOG.y, 3.3, Z_LID + LID_H, 4, P, 20), { tone: "mid" }) +
    S(k.extrude(nut, Z_LID + LID_H, 2.2, P, { bevel: 0.3 }), { tone: "hi" }) +
    L(k.ring(TOG.x, TOG.y, 2.9, Z_LID + LID_H + 2.2, P, 20), { tone: "faint" });
  put("lid", [TOG.x, TOG.y, Z_LID + 4], nutSvg, { bias: 0.4, shapes: [A.cylinder(TOG.x, TOG.y, 4.9, Z_LID + LID_H, 2.2, { name: "lid.nut" }), A.cylinder(TOG.x, TOG.y, 3.3, Z_LID + LID_H, 4, { name: "lid.bushing", owner: "lid.nut" })], name: "lid.nut" });
  const domeC = [TOG.x, TOG.y, M.LEVER.pivotZ];
  put("lid", domeC, S(G.sphereOf(domeC, 2.6, P), { tone: "hi" }), { bias: 0.9, shapes: [A.ball(domeC, 2.6, { name: "lid.dome" })], name: "lid.dome" });
  put("lid", [TOG.x, M.Y.lever[1], M.LEVER.pivotZ + 7], `<g data-dyn="lever">${partSvg(parts0.lever)}</g>`, { dyn: "lever", bias: 1.2, shapes: [A.prism(XZ, worldRing(LEVER_RING, M.LEVER.x, M.LEVER.pivotZ, Math.PI / 2 - STATE0.th * M.RAD), M.Y.lever[0], M.Y.lever[1], { name: "lid.lever" })], name: "lid.lever" });
}

function mechFrontItems() {
  put("mech", [M.S[0], 25.5, M.S[1]], `<g data-dyn="arm">${partSvg(parts0.arm)}</g>`, { dyn: "arm", bias: 0.6, shapes: [A.prism(XZ, worldRing(M.ARM_SHAPE.ring, M.S[0], M.S[1], STATE0.phi), M.Y.arm[0], M.Y.arm[1], { name: "mech.arm" })], name: "mech.arm" });
  const pinAt = M.pinAt(STATE0.phi);
  put("mech", [pinAt[0], 19, pinAt[1]], `<g data-dyn="pin">${partSvg(parts0.pin)}</g>`, { dyn: "pin", bias: 0.5, shapes: [A.disc(FRAME_Y(pinAt[0], pinAt[1]), M.Y.pin[0], M.Y.pin[1], M.PIN.r, { name: "mech.pin" })], name: "mech.pin" });
}

function lidFrontItems() {
  const front = { x: BOX.x, y: SLIT[1], w: BOX.w, d: BOX.y + BOX.d - SLIT[1], r: 2.4 };
  const svg =
    `<g class="um-glass">${S(k.slabOf(front, Z_LID, LID_H, P, 4, 0.6), { tone: "hi" })}</g>` +
    `<g class="um-glassline">${L(k.planOutline(k.insetPlan(front, 4), Z_LID + LID_H, P), { tone: "faint" })}${D(k.corners(front, 7).map(([x, y]) => at([x, y, Z_LID + LID_H])), { size: 0.5 })}</g>`;
  put("lid", [0, 36, Z_LID + 1.5], svg, { bias: 0.1, shapes: [slabShape(front, Z_LID, LID_H, "lid.front")], name: "lid.front" });
}

baseItems();
batteryItems();
const gears = mechBackItems();
mechDynamicItems(gears);
lidBackItems();
mechFrontItems();
lidFrontItems();

const KEYS = join(HERE, "keys.json");
const original = R.items.map((item) => item.key);
let settled = null;
if (process.argv.includes("--cached") && existsSync(KEYS)) {
  const saved = JSON.parse(readFileSync(KEYS, "utf8"));
  if (saved.length === R.items.length) R.items.forEach((item, index) => (item.key = saved[index]));
  else console.log("cached keys do not match; run without --cached");
} else if (!process.argv.includes("--noseatle")) {
  settled = A.settle(R, P);
  writeFileSync(KEYS, JSON.stringify(R.items.map((item) => item.key)));
}
const named = (name) => R.items.find((item) => item.name === name);
const lift = (item, ...behind) => {
  item.key = Math.max(item.key, ...behind.map((other) => other.key + 0.02));
};
{
  const [toggle, back, nut, dome, lever, pin, arm, front, leaf, spacer] = ["lid.toggle", "lid.back", "lid.nut", "lid.dome", "lid.lever", "mech.pin", "mech.arm", "lid.front", "mech.leaf", "mech.spacer"].map(named);
  lift(pin, toggle, back, nut, dome);
  lift(lever, toggle, back, nut, dome, pin);
  lift(arm, toggle, back, nut, dome, pin, lever, leaf, spacer, named("mech.plate"), named("mech.gear.out"), named("mech.gear.second"), named("mech.gear.stage"));
  lift(front, arm);
}
if (process.argv.includes("--keys")) {
  console.log(R.items.map((i) => `${i.key.toFixed(1)} ${i.name} shapes=${i.shapes.length}`).sort((a, b) => parseFloat(a) - parseFloat(b)).join("\n"));
}
R.items.sort((a, b) => a.key - b.key);

const CALLS = [
  { id: 1, name: "Base plate", say: "Base plate on four feet; everything bolts to it.", match: /^base\.(plate|foot|halo)/, piece: "base", anchor: [44, 38, 3], side: "R", dy: 20 },
  { id: 2, name: "Clear walls", say: "Clear acrylic walls. The front and right walls are left off so you can see in.", match: /^base\.(wall|plaque)/, piece: "base", anchor: [56, -39, 40], side: "R", dy: -26 },
  { id: 3, name: "Battery pack", say: "Three AA cells in series: 3 × 1.5 V = 4.5 V.", match: /^battery\./, piece: "battery", anchor: [-50, 0, 22.3], side: "L", dy: -30 },
  { id: 4, name: "DC gearmotor", say: "Small brushed DC motor. Reverse the voltage and it spins the other way.", match: /^mech\.(motor|shaft)/, piece: "mech", anchor: [MOTOR[0] + 2, -9, MOTOR[1] + 9.5], side: "R", dy: -4 },
  { id: 5, name: "Reduction gears", say: "Two stages, 8 teeth driving 24 teeth, twice: 9 : 1. The motor turns nine times for every turn of the arm.", match: /^mech\.(gear|axle)/, piece: "mech", anchor: [M.CENTRE.stage[0] + 6, M.Y.g1[1], M.CENTRE.stage[1] - 8], side: "R", dy: -2 },
  { id: 6, name: "Mount bracket", say: "Steel bracket that carries the motor, the gears and the limit switch.", match: /^mech\.(plate|foot)/, piece: "mech", anchor: [52, M.Y.plate[1], 14], side: "R", dy: 8 },
  { id: 7, name: "Arm", say: `Arm, ${M.ARM.length} mm long and bent ${Math.round((M.ARM.bend / M.RAD))}°, on the output shaft. It swings up through the slit in the lid.`, match: /^mech\.(arm|spacer)/, piece: "mech", dyn: "arm", side: "L", dy: 10 },
  { id: 8, name: "Pusher pin", say: "Pin on the arm tip. It sticks out sideways so it reaches the lever and not the toggle's body.", match: /^mech\.pin/, piece: "mech", dyn: "pin", side: "L", dy: -34 },
  { id: 9, name: "Limit switch", say: "Lever micro switch (SPDT). The arm sits on its leaf when it is home, which opens the motor circuit.", match: /^mech\.(limit|block|leaf)/, piece: "mech", anchor: [-27, SWB.y + SWB.d, M.SWITCH.bodyTop - 5], side: "L", dy: 26 },
  { id: 10, name: "Lid", say: "Clear acrylic lid in two halves. The slit between them is where the arm comes out.", match: /^lid\.(back|front)/, piece: "lid", anchor: [-40, 36, 63], side: "L", dy: -18 },
  { id: 11, name: "Toggle switch", say: "DPDT toggle: two switches in one body. It swaps which battery terminal goes to which motor terminal.", match: /^lid\.(toggle|lug|nut)/, piece: "lid", anchor: [TOG.x, TOG.y - 3.6, Z_LID + LID_H + 2.2], side: "R", dy: 16 },
  { id: 12, name: "Toggle lever", say: `Lever, flips ±${M.LEVER.throw}°. It snaps over centre, so the arm only has to push it halfway.`, match: /^lid\.(lever|dome)/, piece: "lid", dyn: "lever", side: "R", dy: -22 },
];
for (const item of R.items) item.calls = CALLS.filter((call) => call.match.test(item.name)).map((call) => call.id);

const groups = R.items.map((item, index) => {
  const [mx, my, mz] = item.move;
  return `<g class="it" data-piece="${item.piece}" data-k="${item.key.toFixed(2)}" data-m="${mx},${my},${mz}" data-i="${index}"${item.dyn ? ` data-dyn="${item.dyn}"` : ""}${item.calls.length ? ` data-c="${item.calls.join(" ")}"` : ""}>${item.svg}</g>`;
});

const unit = (vector) => {
  const o = at([0, 0, 0]);
  const p = at(vector);
  return [p[0] - o[0], p[1] - o[1]];
};
const screenBox = (boxes) => {
  const pts = boxes.flatMap(([x0, y0, z0, x1, y1, z1, dz]) => k.boxCorners({ x: x0, y: y0, w: x1 - x0, d: y1 - y0 }, z0 + dz, z1 + dz).map(at));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};
if (process.argv.includes("--probe")) for (const c of CALLS) if (c.anchor) console.log(c.id, at(c.anchor).map((n) => (n * 2.04).toFixed(0)).join(","));
const FLY = screenBox([
  [-64, -42, -3, 64, 42, 60, 0],
  [-60, -38.5, 3, -5, 9, 22, PIECES.battery.move[2]],
  [-39, -23, 3, 58, 32, 80, PIECES.mech.move[2]],
  [-64, -42, 45, 64, 42, 86, PIECES.lid.move[2]],
]);
const INNER = [140, 70, W - 140, H - 70];
const fit = Math.min((INNER[2] - INNER[0]) / (FLY[2] - FLY[0]), (INNER[3] - INNER[1]) / (FLY[3] - FLY[1]), 1);
const ASM = screenBox([[-64, -42, -3, 64, 42, 63, 0]]);
const centre = [(ASM[0] + ASM[2]) / 2, (ASM[1] + ASM[3]) / 2];
const flyCentre = [(FLY[0] + FLY[2]) / 2, (FLY[1] + FLY[3]) / 2];
const targetCentre = [W / 2, H / 2];
const EXPL = { s: fit, tx: targetCentre[0] - (centre[0] + (flyCentre[0] - centre[0]) * 0 - (W / 2) * (1 - fit)) - fit * 0, ty: 0 };
EXPL.tx = W / 2 - (W / 2 * (1 - fit) + fit * flyCentre[0]);
EXPL.ty = H / 2 - (H / 2 * (1 - fit) + fit * flyCentre[1]);

const DATA = {
  W,
  H,
  P,
  V,
  EX: unit([1, 0, 0]),
  EY: unit([0, 1, 0]),
  EZ: unit([0, 0, 1]),
  expl: EXPL,
  pieces: Object.fromEntries(Object.entries(PIECES).map(([id, piece]) => [id, { name: piece.name, move: piece.move }])),
  stagger: STAGGER,
  spring: SPRING,
  calls: CALLS.map(({ id, name, say, piece, anchor, dyn, side, dy }) => ({ id, name, say, piece, anchor, dyn, side, dy })),
};

const circuit = readFileSync(join(HERE, "circuit.svg"), "utf8");
const css = readFileSync(join(HERE, "um.css"), "utf8");
const inline = (file) => readFileSync(join(HERE, file), "utf8").replace(/^import .*$/gm, "").replace(/^export \{[^}]*\};?$/gm, "").replace(/^export /gm, "");
const live = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));
const script = [kitScript(), inline("plate.mjs"), inline("model.mjs"), inline("draw.mjs"), live].join("\n");
if (process.argv.includes("--check")) new Function(script.replace(/^\s*import .*$/gm, ""));

const label = "A useless machine in cutaway: a box of clear acrylic with its front and right walls removed. A toggle switch on the lid, a DC gearmotor with a 9 to 1 gear train, a curved arm on the output shaft, a limit switch and three AA cells. The arm rises through a slit in the lid, flips the toggle back off and retracts. The lid, the mechanism and the battery pack lift apart along the vertical axis.";
const svg = k.figureSvg({ width: W, height: H, label, body: `<g class="um-engine">${groups.join("")}</g><g class="um-over"></g>` });
const parts = CALLS.map((call) => `<li><button type="button" class="um-part" data-c="${call.id}"><span class="um-num">${call.id}</span><span class="um-name">${call.name}</span><span class="um-say">${call.say}</span></button></li>`).join("");
const controls = `<div class="um-controls"><button type="button" class="um-btn" data-flip><span class="um-lamp" aria-hidden="true"></span><span data-flip-label>Flip the switch</span></button><button type="button" class="um-btn" data-apart>Take apart</button><span class="um-note" data-note aria-live="polite"></span></div>`;
const caption =
  "The toggle is a DPDT switch wired across a DC motor. Flipped on, it sends the battery to the motor one way and the arm rises. The arm's pin pushes the lever back over centre, which reverses the motor through the limit switch. The arm retracts until it sits on the limit switch's leaf, which opens the circuit and stops it. Front and right walls removed; the lid, mechanism and battery pack separate along the vertical axis.";
const body = `<div class="um">${k.plateHtml({ fig: "Fig 1", title: "Useless machine", hint: "Click the switch", readout: "ready", keys: [], caption: "", body: `<div class="iso-stage um-stage" tabindex="0" role="group" aria-label="Useless machine. Space or Enter flips the switch, E takes it apart, the arrow keys step through the parts, Escape clears.">${svg}</div>` }).replace("</div></figure>", `</div>${controls}</figure>`)}<div class="um-below"><div class="um-circuit">${circuit}</div><ol class="um-parts">${parts}</ol></div><p class="iso-caption um-caption">${caption}</p></div>`;
const page = k.pageHtml({ title: "Useless machine", theme: THEME, body: `<style>${css}</style>${body}`, script, width: 1000 });
writeFileSync(join(HERE, `useless-machine${THEME === "light" ? "-light" : ""}.html`), page);
console.log("wrote", `${R.items.length} items`, `${(page.length / 1024).toFixed(0)} KB`, `fit ${fit.toFixed(2)}`);
A.auditOrExit(R, P, {});
