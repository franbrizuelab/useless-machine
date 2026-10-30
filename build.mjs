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
const { tubePieces, tubeSvg } = await load("kit/tube.mjs");
const { kitScript } = await load("scripts/inline-kit.mjs");
const { M } = await import("./model.mjs");
const { plateOf, plateParts, partSvg, partDs, onPlate, ringOnPlate, roundPoly, circlePoly, turnPoint, rectPoly } = await import("./plate.mjs");
const { dynamicParts } = await import("./draw.mjs");
const { DOOR, DOOR_RING, HINGE, roundEach, diagX } = await import("./door.mjs");
const { doorPart, doorSvgOf, DOOR_LEAF } = await import("./draw2.mjs");

const THEME = process.argv.includes("--dark") ? "dark" : "light";
const VER = process.argv.includes("--v3") ? 3 : process.argv.includes("--v2") ? 2 : 1;
const V2 = VER >= 2;
const V3 = VER >= 3;

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

function put(piece, ref, svg, { bias = 0, shapes = [], name, dyn, group, route, chunk } = {}) {
  if (route === undefined) shapes.forEach((shape) => !R.solids.includes(shape) && R.solid(shape));
  R.put({ piece, ride: piece, at: ref, bias, svg, move: PIECES[piece].move, shapes, name: name ?? R.nameFor(`${piece}.item`), dyn, group, route, chunk });
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

const PLATE_POLY = V2
  ? roundPoly([[-10, 6], [32.4, 6], [32.4, 9.8], [37.2, 9.8], [37.2, 6], [58, 6], [58, 50], [46, 58], [22, 58], [16, 49], [16, 44], [-10, 44]], 3.5, 4)
  : roundPoly([[-10, 6], [58, 6], [58, 50], [46, 58], [22, 58], [16, 49], [16, 44], [-10, 44]], 3.5, 4);
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

const DOOR_TABLE_FILE = join(HERE, "door-table.json");
let DOOR_TABLE = null;
if (V2) {
  const { doorTable } = await import("./door-table.mjs");
  const stamp = JSON.stringify([DOOR, M.ARM, M.PIN.r, M.Y.arm, M.Y.pin, M.S]);
  const cached = existsSync(DOOR_TABLE_FILE) ? JSON.parse(readFileSync(DOOR_TABLE_FILE, "utf8")) : null;
  if (cached && cached.stamp === stamp) DOOR_TABLE = cached.table;
  else {
    DOOR_TABLE = doorTable();
    writeFileSync(DOOR_TABLE_FILE, JSON.stringify({ stamp, table: DOOR_TABLE }));
  }
}
const pageName = (ver) => `useless-machine${ver > 1 ? `-v${ver}` : ""}${THEME === "light" ? "-light" : ""}.html`;

const STATE0 = M.fresh();
const parts0 = dynamicParts(P, { ...STATE0, fine: V3 });

function mechDynamicItems(gearSpec) {
  for (const [name, c, layer, r] of gearSpec) {
    const gearShape = A.disc(FRAME_Y(c[0], c[1]), layer[0], layer[1], r, { name: `mech.gear.${name}` });
    put("mech", [c[0], (layer[0] + layer[1]) / 2, c[1]], `<g data-dyn="${name}">${partSvg(parts0[name])}</g>`, { dyn: name, shapes: [gearShape], name: `mech.gear.${name}` });
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

  if (V2) lidPlateV2();
  else {
    const back = roundPoly([[BOX.x, BOX.y], [BOX.x + BOX.w, BOX.y], [BOX.x + BOX.w, SLIT[0]], [-12, SLIT[0]], [-12, 13], [BOX.x, 13]], 2.4, 3);
    const ring = back;
    const lidSvg = `<g class="um-glass">${S(k.extrude(ring, Z_LID, LID_H, P, { convex: false, bevel: 0.6 }), { tone: "hi" })}</g>` + `<g class="um-glassline">${L(k.onTop(ring.map(([x, y]) => [x, y]), Z_LID + LID_H, P, true), { tone: "faint" })}</g>`;
    const lidBackSvg = lidSvg.replace(
      L(k.onTop(ring, Z_LID + LID_H, P, true), { tone: "faint" }),
      L(k.onTop(roundPoly([[BOX.x + 5, BOX.y + 5], [BOX.x + BOX.w - 5, BOX.y + 5], [BOX.x + BOX.w - 5, SLIT[0] - 4], [-8, SLIT[0] - 4], [-8, 17], [BOX.x + 5, 17]], 1.5, 3), Z_LID + LID_H, P, true), { tone: "faint" }),
    );
    const screws = [[BOX.x + 7, BOX.y + 7], [BOX.x + BOX.w - 7, BOX.y + 7], [BOX.x + BOX.w - 7, SLIT[0] - 7], [BOX.x + 7, 19]];
    put("lid", [0, -10, Z_LID + 1.5], lidBackSvg + `<g class="um-glassline">${D(screws.map(([x, y]) => at([x, y, Z_LID + LID_H])), { size: 0.5 })}</g>`, { bias: 0.1, shapes: [A.extruded(ring, Z_LID, LID_H, { name: "lid.back" })], name: "lid.back" });
  }

  const nut = hexRing(TOG.x, TOG.y, 4.9);
  if (V3) {
    // v3: the threaded bushing rises out of the nut to a collar whose bore (r 2) seats the lever's ball, so the ball
    // rests on the bore's rim instead of hovering over the nut.
    const top = Z_LID + LID_H;
    const nutTop = top + 2.2;
    const bore = 2;
    const rim = M.LEVER.pivotZ - Math.sqrt(2.6 ** 2 - bore ** 2) - 0.01;
    const TF = G.frameAlong([TOG.x, TOG.y, 0], [0, 0, 1]);
    const threads = [0.3, 0.55, 0.8].map((t) => G.arcOf(TF, nutTop + (rim - 0.5 - nutTop) * t, 3.3, P, { steps: 24 })).join("");
    const collar = S(G.disc(nutTop, rim, 3.3, TF, P), { tone: "hi", inner: L(threads, { tone: "lo" }) });
    const nutSvg = S(k.extrude(nut, top, 2.2, P, { bevel: 0.3 }), { tone: "hi" }) + collar;
    put("lid", [TOG.x, TOG.y, Z_LID + 4], nutSvg, { bias: 0.4, shapes: [A.cylinder(TOG.x, TOG.y, 4.9, top, 2.2, { name: "lid.nut" }), A.ring(TF, top, rim, bore, 3.3, { name: "lid.bushing", owner: "lid.nut" })], name: "lid.nut" });
  } else {
    const nutSvg =
      S(k.cylinder(TOG.x, TOG.y, 3.3, Z_LID + LID_H, 4, P, 20), { tone: "mid" }) +
      S(k.extrude(nut, Z_LID + LID_H, 2.2, P, { bevel: 0.3 }), { tone: "hi" }) +
      L(k.ring(TOG.x, TOG.y, 2.9, Z_LID + LID_H + 2.2, P, 20), { tone: "faint" });
    put("lid", [TOG.x, TOG.y, Z_LID + 4], nutSvg, { bias: 0.4, shapes: [A.cylinder(TOG.x, TOG.y, 4.9, Z_LID + LID_H, 2.2, { name: "lid.nut" }), A.cylinder(TOG.x, TOG.y, 3.3, Z_LID + LID_H, 4, { name: "lid.bushing", owner: "lid.nut" })], name: "lid.nut" });
  }
  const domeC = [TOG.x, TOG.y, M.LEVER.pivotZ];
  put("lid", domeC, S(G.sphereOf(domeC, 2.6, P), { tone: "hi" }), { bias: 0.9, shapes: [A.ball(domeC, 2.6, { name: "lid.dome" })], name: "lid.dome" });
  put("lid", [TOG.x, M.Y.lever[1], M.LEVER.pivotZ + 7], `<g data-dyn="lever">${partSvg(parts0.lever)}</g>`, { dyn: "lever", bias: 1.2, shapes: [A.prism(XZ, worldRing(LEVER_RING, M.LEVER.x, M.LEVER.pivotZ, Math.PI / 2 - STATE0.th * M.RAD), M.Y.lever[0], M.Y.lever[1], { name: "lid.lever" })], name: "lid.lever" });
}

function mechFrontItems() {
  put("mech", [M.S[0], 25.5, M.S[1]], `<g data-dyn="arm">${partSvg(parts0.arm)}</g>`, { dyn: "arm", bias: 0.6, shapes: [A.prism(XZ, worldRing(M.ARM_SHAPE.ring, M.S[0], M.S[1], STATE0.phi), M.Y.arm[0], M.Y.arm[1], { name: "mech.arm" })], name: "mech.arm" });
  const pinAt = M.pinAt(STATE0.phi);
  put("mech", [pinAt[0], 19, pinAt[1]], `<g data-dyn="pin">${partSvg(parts0.pin)}</g>`, { dyn: "pin", bias: 0.5, shapes: [A.disc(FRAME_Y(pinAt[0], pinAt[1]), M.Y.pin[0], M.Y.pin[1], M.PIN.r, { name: "mech.pin" })], name: "mech.pin" });
}

function lidPlateV2() {
  const { X0, X1, XKb, XKt, Yw, Yn, Yf } = DOOR;
  const ring = roundEach([[BOX.x, BOX.y], [BOX.x + BOX.w, BOX.y], [BOX.x + BOX.w, Yn], [XKt, Yn], [XKb, Yw], [X0, Yw], [X0, Yf], [BOX.x, Yf]], [2.4, 2.4, 0, 1.0, 1.0, 1.6, 0, 0], 3);
  const inset = roundEach([[BOX.x + 5, BOX.y + 5], [BOX.x + BOX.w - 5, BOX.y + 5], [BOX.x + BOX.w - 5, Yn - 2.4], [diagX(Yn - 2.4, -2.4), Yn - 2.4], [diagX(Yw - 2.4, -2.4), Yw - 2.4], [X0 - 3, Yw - 2.4], [X0 - 3, Yf - 4.4], [BOX.x + 5, Yf - 4.4]], Array(8).fill(1.5), 3);
  const screws = [[BOX.x + 7, BOX.y + 7], [BOX.x + BOX.w - 7, BOX.y + 7], [BOX.x + BOX.w - 7, Yn - 6], [BOX.x + 7, Yf - 7]];
  const svg =
    `<g class="um-glass">${S(k.extrude(ring, Z_LID, LID_H, P, { convex: false, bevel: 0.6 }), { tone: "hi" })}</g>` +
    `<g class="um-glassline">${L(k.onTop(inset, Z_LID + LID_H, P, true), { tone: "faint" })}${D(screws.map(([x, y]) => at([x, y, Z_LID + LID_H])), { size: 0.5 })}</g>`;
  put("lid", [0, -10, Z_LID + 1.5], svg, { bias: 0.1, shapes: [A.extruded(ring, Z_LID, LID_H, { name: "lid.back" })], name: "lid.back" });
  [
    { x: X0 - 2, y: 13.6, w: 3, d: 6, r: 0.3 },
    { x: X1 - 1, y: 23.6, w: 3, d: 6, r: 0.3 },
  ].forEach((plan, index) => put("lid", [plan.x + 1.5, plan.y + 3, Z_LID - 0.75], S(k.slabOf(plan, Z_LID - 1.5, 1.5, P, 2, 0.2), { tone: "lo" }), { shapes: [slabShape(plan, Z_LID - 1.5, 1.5, `lid.ledge${index}`)], name: `lid.ledge${index}` }));
}

function lidFrontV2() {
  const { X1, Yn, Yf, hy, hz, kr } = DOOR;
  const top = Z_LID + LID_H;
  const ring = roundEach([[BOX.x, Yf], [X1, Yf], [X1, Yn], [BOX.x + BOX.w, Yn], [BOX.x + BOX.w, BOX.y + BOX.d], [BOX.x, BOX.y + BOX.d]], [0, 1.0, 0, 0, 2.4, 2.4], 3);
  const inset = roundEach([[BOX.x + 4, 36], [X1 + 4, 36], [X1 + 4, Yn + 3.6], [BOX.x + BOX.w - 4, Yn + 3.6], [BOX.x + BOX.w - 4, 38.6], [BOX.x + 4, 38.6]], [1, 1, 1, 1, 1, 1], 3);
  const svg =
    `<g class="um-glass">${S(k.extrude(ring, Z_LID, LID_H, P, { convex: false, bevel: 0.6 }), { tone: "hi" })}</g>` +
    `<g class="um-glassline">${L(k.onTop(inset, top, P, true), { tone: "faint" })}${D([[-58, 37.3], [58, 37.3], [58, Yn + 2.4]].map(([x, y]) => at([x, y, top])), { size: 0.5 })}</g>`;
  put("lid", [0, 36.5, Z_LID + 1.5], svg, { bias: 0.1, shapes: [A.extruded(ring, Z_LID, LID_H, { name: "lid.front" })], name: "lid.front" });

  put("lid", [(DOOR.X0 + DOOR.X1) / 2, 26, Z_LID + 1.5], `<g data-dyn="door">${doorSvgOf(doorPart(P, 0, { hooks: V3 }))}</g>`, {
    dyn: "door",
    bias: 0.2,
    shapes: [A.extruded(DOOR_RING, DOOR.z0, DOOR.z1 - DOOR.z0, { name: "lid.door" }), A.extruded(DOOR_LEAF, DOOR.z1, HINGE.doorLeaf.h, { name: "lid.doorleaf" })],
    name: "lid.door",
  });

  HINGE.lidLeaves.forEach((leaf, index) => {
    const plan = { x: leaf.x[0], y: leaf.y[0], w: leaf.x[1] - leaf.x[0], d: leaf.y[1] - leaf.y[0], r: 0.3 };
    const sy = (leaf.y[0] + leaf.y[1]) / 2 + 0.2;
    const sx = [leaf.x[0] + 2.4, leaf.x[1] - 2.4];
    const leafSvg =
      S(k.slabOf(plan, top, leaf.h, P, 2, 0.15), { tone: "mid" }) +
      L(sx.map((x) => k.ring(x, sy, 0.75, top + leaf.h, P, 14)).join(""), { tone: "lo" }) +
      D(sx.map((x) => at([x, sy, top + leaf.h])), { size: 0.5 });
    put("lid", [(leaf.x[0] + leaf.x[1]) / 2, sy, top + 0.25], leafSvg, { shapes: [slabShape(plan, top, leaf.h, `lid.leaf${index}`)], name: `lid.leaf${index}` });
  });

  const HF = FRAME_X(hy, hz);
  HINGE.knuckles.forEach(({ x: [x0, x1] }, index) => {
    const seam = index === 1 ? "" : "";
    put("lid", [(x0 + x1) / 2, hy, hz], S(G.disc(x0, x1, kr, HF, P), { tone: index === 1 ? "hi" : "mid", inner: seam }), { shapes: [A.disc(HF, x0, x1, kr, { name: `lid.knuckle${index}` })], name: `lid.knuckle${index}` });
  });
  const first = HINGE.knuckles[0].x[0];
  const last = HINGE.knuckles[HINGE.knuckles.length - 1].x[1];
  put("lid", [first - 0.25, hy, hz], S(G.disc(first - 0.5, first, kr * 0.72, HF, P), { tone: "mid" }), { shapes: [A.disc(HF, first - 0.5, first, kr * 0.72, { name: "lid.pinhead" })], name: "lid.pinhead" });
  put("lid", [last + 0.2, hy, hz], S(G.disc(last, last + 0.35, HINGE.pinR + 0.1, HF, P), { tone: "mid" }), { shapes: [A.disc(HF, last, last + 0.35, HINGE.pinR + 0.1, { name: "lid.pintail" })], name: "lid.pintail" });
  HINGE.springs.forEach((spring, index) => {
    const gap = [HINGE.knuckles[index].x[1], HINGE.knuckles[index + 1].x[0]];
    const c = k.coil(spring.x[0], spring.x[1], [hy, hz], HINGE.coilR, HINGE.turns, "x", P, 14);
    const leg = k.segment([spring.x[0], hy + HINGE.coilR, hz], [spring.x[0], HINGE.lidLeaves[index].y[0] + 1.2, top + HINGE.lidLeaves[index].h + 0.05], P);
    const springSvg = L(c.back, { tone: "mid" }) + S(G.disc(gap[0], gap[1], HINGE.pinR, HF, P), { tone: "hi" }) + L(c.front + leg, { tone: "mid" });
    put("lid", [(gap[0] + gap[1]) / 2, hy, hz], springSvg, { shapes: [A.disc(HF, gap[0], gap[1], HINGE.pinR, { name: `lid.pin${index}` })], name: `lid.spring${index}` });
  });
}

// v2 wiring. A small board on the base carries three vertical headers; each harness ends in a plug that lifts out of
// its header with its own assembly when the machine comes apart along Z.
const BOARD = { x: 23, y: 34.6, w: 28, d: 6, r: 0.6 };
const BOARD_Z = [5, 6.2];
const HEADER_Z = [6.2, 9.2];
const PLUG_Z = [9.2, 12.4];
const HEADER_Y = [36.0, 39.2];
const PITCH = 1.6;
const HEADERS = {
  J1: { pins: 2, x0: 24.4, piece: "battery", label: ["−", "+"] },
  J2: { pins: 4, x0: 29.8, piece: "mech", label: ["L1", "M2", "M1", "L2"] },
  J3: { pins: 6, x0: 38.6, piece: "lid", label: ["BL", "AC", "BC", "AR", "AL", "BR"] },
};
for (const h of Object.values(HEADERS)) {
  h.w = h.pins * PITCH + 0.4;
  h.x1 = h.x0 + h.w;
  h.cx = (h.x0 + h.x1) / 2;
  h.pinX = Array.from({ length: h.pins }, (_, i) => h.x0 + 0.2 + PITCH * (i + 0.5));
}
const PIN_Y = (HEADER_Y[0] + HEADER_Y[1]) / 2;
const WIRE_R = { lead: 0.35, pair: 0.75, lid: 1.0 };

function cable(name, piece, points, r, { tone = "mid", bend = 4, touch, limp = true, maxLength = 12, bias = 0.05 } = {}) {
  const route = G.fillet(points, Math.max(bend, r * 2.6), 10, { P, tube: r });
  R.route(name, route, r, { limp, touch, piece, move: PIECES[piece].move, ride: piece });
  tubePieces(route, r, P, { maxLength, spacing: Math.max(0.5, Math.min(1.6, r)) }).forEach((pc, index) =>
    put(piece, pc.mid, tubeSvg(pc, { tone }), { bias, shapes: [A.tube(pc.points, pc.radii)], name: `${name}:${index}`, route: name, chunk: index }),
  );
  return route;
}
function boxPart(piece, name, [x0, y0, z0], [x1, y1, z1], { tone = "mid", r = 0.3, bevel = 0.2, extra = "", inner = "", seam = null, bias = 0 } = {}) {
  const plan = { x: x0, y: y0, w: x1 - x0, d: y1 - y0, r };
  const seamLine = seam === null ? "" : L(k.sideSeam(plan, seam, P, 2), { tone: "faint" });
  put(piece, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], S(k.slabOf(plan, z0, z1 - z0, P, 2, bevel), { tone, inner: inner + seamLine }) + extra, { bias, shapes: [slabShape(plan, z0, z1 - z0, name)], name });
}

function wiresV2() {
  // board, standoffs, traces
  const top = BOARD_Z[1];
  const corners = [[BOARD.x + 1.3, BOARD.y + 1.2], [BOARD.x + BOARD.w - 1.3, BOARD.y + 1.2], [BOARD.x + 1.3, BOARD.y + BOARD.d - 1.2], [BOARD.x + BOARD.w - 1.3, BOARD.y + BOARD.d - 1.2]];
  corners.forEach(([x, y], index) => put("base", [x, y, 4], S(k.cylinder(x, y, 0.75, Z_BASE, BOARD_Z[0] - Z_BASE, P, 12), { tone: "mid", crease: "none" }), { shapes: [A.cylinder(x, y, 0.75, Z_BASE, BOARD_Z[0] - Z_BASE, { name: `base.standoff${index}` })], name: `base.standoff${index}` }));
  const pin = (h, i, dy) => [HEADERS[h].pinX[i], dy, top];
  const yb1 = HEADER_Y[0] - 0.9;
  const yb2 = HEADER_Y[0] - 1.7;
  const yf = [HEADER_Y[1] + 0.7, HEADER_Y[1] + 1.2, HEADER_Y[1] + 1.7];
  const trace = (points) => k.pathOf(points.map((p) => at(p)));
  const traces = [
    // − : J1.1 → J3.AL, J3.BR along the outer back track
    trace([pin("J1", 0, HEADER_Y[0]), pin("J1", 0, yb2), pin("J3", 5, yb2), pin("J3", 5, HEADER_Y[0])]),
    trace([pin("J3", 4, yb2), pin("J3", 4, HEADER_Y[0])]),
    // + : J1.2 → J3.AR on the inner back track, and → J2.L1 in front
    trace([pin("J1", 1, HEADER_Y[0]), pin("J1", 1, yb1), pin("J3", 3, yb1), pin("J3", 3, HEADER_Y[0])]),
    trace([pin("J1", 1, HEADER_Y[1]), pin("J1", 1, yf[0]), pin("J2", 0, yf[0]), pin("J2", 0, HEADER_Y[1])]),
    // J3 → J2, nested in front: BL → L2, AC → M1, BC → M2
    trace([pin("J3", 0, HEADER_Y[1]), pin("J3", 0, yf[0]), pin("J2", 3, yf[0]), pin("J2", 3, HEADER_Y[1])]),
    trace([pin("J3", 1, HEADER_Y[1]), pin("J3", 1, yf[1]), pin("J2", 2, yf[1]), pin("J2", 2, HEADER_Y[1])]),
    trace([pin("J3", 2, HEADER_Y[1]), pin("J3", 2, yf[2]), pin("J2", 1, yf[2]), pin("J2", 1, HEADER_Y[1])]),
  ].join("");
  const pads = [
    ...[yb2, yb1].flatMap((y) => []),
    pin("J1", 0, yb2), pin("J3", 5, yb2), pin("J3", 4, yb2), pin("J1", 1, yb1), pin("J3", 3, yb1),
    pin("J1", 1, yf[0]), pin("J2", 0, yf[0]), pin("J3", 0, yf[0]), pin("J2", 3, yf[0]), pin("J3", 1, yf[1]), pin("J2", 2, yf[1]), pin("J3", 2, yf[2]), pin("J2", 1, yf[2]),
  ];
  const holes = corners.map(([x, y]) => k.ring(x, y, 0.9, top, P, 12)).join("");
  const boardSvg =
    S(k.slabOf(BOARD, BOARD_Z[0], top - BOARD_Z[0], P, 3, 0.3), { tone: "lo" }) +
    L(trace([[BOARD.x + 1, BOARD.y + BOARD.d - 0.6, top], [BOARD.x + BOARD.w - 1, BOARD.y + BOARD.d - 0.6, top]]), { tone: "faint" }) +
    L(traces, { tone: "mid" }) +
    L(holes, { tone: "lo" }) +
    D(pads.map(at), { size: 0.45, tone: "hi" }) +
    D(corners.map(([x, y]) => at([x, y, top])), { size: 0.45 });
  put("base", [BOARD.x + BOARD.w / 2, BOARD.y + BOARD.d / 2, 5.6], boardSvg, { shapes: [slabShape(BOARD, BOARD_Z[0], top - BOARD_Z[0], "base.board")], name: "base.board" });

  for (const [id, h] of Object.entries(HEADERS)) {
    boxPart("base", `base.header.${id}`, [h.x0, HEADER_Y[0], HEADER_Z[0]], [h.x1, HEADER_Y[1], HEADER_Z[1]], { tone: "mid", seam: HEADER_Z[0] + 1.1 });
    const ribs = L(h.pinX.map((x) => trace([[x, HEADER_Y[1] - 0.25, PLUG_Z[0]], [x, HEADER_Y[1] - 0.25, PLUG_Z[1]]])).join(""), { tone: "faint" });
    boxPart(h.piece, `${h.piece}.plug.${id}`, [h.x0 + 0.25, HEADER_Y[0] + 0.25, PLUG_Z[0]], [h.x1 - 0.25, HEADER_Y[1] - 0.25, PLUG_Z[1]], { tone: "hi", inner: ribs });
  }

  // battery: two-core lead from the tray's front face round the foot to J1
  const r2 = WIRE_R.pair;
  const top2 = PLUG_Z[1];
  const lift = PLUG_Z[1] + 6.5;
  const floor = Z_BASE + r2 + 0.05;
  const footTop = 6 + r2 + 0.05;
  const mid = (PLUG_Z[0] + PLUG_Z[1]) / 2;
  const face = { back: HEADER_Y[0] + 0.25, left: (h) => HEADERS[h].x0 + 0.25, right: (h) => HEADERS[h].x1 - 0.25 };
  cable("wire.battery", "battery", [[-45, 8.6, floor], [-45, PIN_Y, floor], [11, PIN_Y, floor], [18.5, PIN_Y, mid], [face.left("J1"), PIN_Y, mid]], r2, { touch: ["base.plate"] });

  // motor: a boot over the two tabs on the end cap, the lead under the motor and through the bracket's notch to J2
  const MX = M.CENTRE.pinion[0];
  boxPart("mech", "mech.motorboot", [MX - 2.4, -17.0, 22.0], [MX + 2.4, -15.0, 24.6], { tone: "lo" });
  const mx = HEADERS.J2.cx + 1.5;
  const lx = HEADERS.J2.cx - 1.5;
  cable("wire.motor", "mech", [[MX, -16, 22.0], [MX, -16, floor], [MX, 0, floor], [mx, 7, floor], [mx, 12, footTop], [mx, 27, footTop], [mx, 31.5, mid], [mx, face.back, mid]], r2, { touch: ["base.plate", "mech.foot"] });

  // limit switch: a boot on its end face, the lead down to the foot and along it behind the gears to J2
  boxPart("mech", "mech.limitboot", [-17.0, 23.9, 19.4], [-14.8, 27.1, 23.4], { tone: "lo" });
  cable("wire.limit", "mech", [[-14.8, 26.3, 21.4], [-9, 26.3, 21.4], [-9, 26.3, footTop], [-9, 18.2, footTop], [lx, 18.2, footTop], [lx, 28.5, footTop], [lx, 32.5, mid], [lx, face.back, mid]], r2, { touch: ["mech.foot"], bend: 6 });

  // lid: six leads from the toggle's lugs into an inline housing, one six-core cable over the motor to J3
  const H0 = [0.2, 9.4, 33.6];
  const H1 = [12.8, 13.4, 36.6];
  boxPart("lid", "lid.housing", H0, H1, { tone: "hi", seam: H0[2] + 1.5 });
  const lugX = [-4, 0, 4].map((dx) => TOG.x + dx);
  const lugY = [TOG.y - 2.2, TOG.y + 2.2];
  lugX.forEach((x, i) => cable(`wire.lead.a${i}`, "lid", [[x, lugY[0], 45], [x, lugY[0], H1[2]]], WIRE_R.lead, { limp: false, maxLength: 20 }));
  lugX.forEach((x, i) =>
    cable(`wire.lead.b${i}`, "lid", [[x, lugY[1] - 0.6, 47.0], [x + 0.2, 14.4, 47.0], [x + 2, 12.4, 46.4], [x + 2, 11.0, 44.4], [x + 2, 11.0, H1[2]]], WIRE_R.lead, { limp: false, bend: 1.2, maxLength: 6 }),
  );
  const rl = WIRE_R.lid;
  cable("wire.lid", "lid", [[H1[0], 11.4, 35.1], [17.5, 11.4, 35.1], [24, 11.4, 42.6], [62.4, 11.4, 42.6], [62.4, 11.4, (PLUG_Z[0] + PLUG_Z[1]) / 2], [62.4, PIN_Y, (PLUG_Z[0] + PLUG_Z[1]) / 2], [HEADERS.J3.x1 - 0.25, PIN_Y, (PLUG_Z[0] + PLUG_Z[1]) / 2]], rl, { tone: "mid", bend: 6 });
}

function lidFrontItems() {
  if (V2) return lidFrontV2();
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
if (V2) wiresV2();

// The mounting foot is a 97 × 20 × 3 plate that the audit's slender rule reads as a rod of radius 10, so any lead that
// runs on it or rises off it near the headers "lands on its outline"; the leads cross it as a floor, not as a line.
const CROWD_OK = V2 ? [["wire.*", "mech.foot"]] : [];
if (V2 && process.argv.includes("--wires")) {
  const mounts = A.mountsOf(R.tubes, R.solids);
  const items = R.items;
  const wired = items.filter((item) => item.route);
  const result = {
    clearance: A.clearances(R.tubes, R.solids, { mounts }),
    terminals: A.terminals(R.tubes, R.solids, { mounts }),
    folds: A.folds(R.routes, P, { items }),
    self: A.selfOverlaps(wired, P),
    crowding: A.crowding(R.routes, P, { links: A.linksOf(R.tubes, mounts), items, allow: CROWD_OK, rods: A.slenderOf(R.solids) }),
  };
  console.log(A.report(result));
  process.exit(A.failures(result) ? 1 : 0);
}
const KEYS = join(HERE, VER > 1 ? `keys-v${VER}.json` : "keys.json");
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
const LIFT_GAP = V2 ? 0.3 : 0.02;
const lift = (item, ...behind) => {
  item.key = Math.max(item.key, ...behind.map((other) => other.key + LIFT_GAP));
};
{
  const [toggle, back, nut, dome, lever, pin, arm, front, leaf, spacer] = ["lid.toggle", "lid.back", "lid.nut", "lid.dome", "lid.lever", "mech.pin", "mech.arm", "lid.front", "mech.leaf", "mech.spacer"].map(named);
  lift(pin, toggle, back, nut, dome);
  lift(lever, toggle, back, nut, dome, pin);
  lift(arm, toggle, back, nut, dome, pin, lever, leaf, spacer, named("mech.plate"), named("mech.gear.out"), named("mech.gear.second"), named("mech.gear.stage"));
  lift(front, arm);
  if (V2) {
    const liftGroup = (group, ...behind) => {
      const floor = Math.max(...behind.map((other) => other.key)) + LIFT_GAP;
      const low = Math.min(...group.map((item) => item.key));
      if (low < floor) group.forEach((item) => (item.key += floor - low));
    };
    const door = named("lid.door");
    const hinge = R.items.filter((item) => /^lid\.(knuckle|leaf|spring|pinhead|pintail)/.test(item.name));
    const under = R.items.filter((item) => item !== door && item !== front && !hinge.includes(item));
    lift(door, ...under);
    lift(front, door);
    liftGroup(hinge, front, door);
  }
}
if (process.argv.includes("--keys")) {
  console.log(R.items.map((i) => `${i.key.toFixed(1)} ${i.name} shapes=${i.shapes.length}`).sort((a, b) => parseFloat(a) - parseFloat(b)).join("\n"));
}
R.items.sort((a, b) => a.key - b.key);

// v2 takes the machine apart in one step per axis: Z lifts the three assemblies, Y pulls the arm and the gear train
// off their shafts, X slides the cells out of their tray. Each later step is settled and audited from the pose the
// previous steps leave, with its own painter's keys.
const rideBy = (table) => (item) => {
  for (const [ride, test] of table) if (test.test(item.name)) return ride;
  return null;
};
const STAGES = [
  { id: "z", name: "lift along Z", order: STAGGER, rides: Object.fromEntries(Object.entries(PIECES).map(([id, piece]) => [id, piece.move])), of: (item) => item.piece },
  ...(V2
    ? [
        {
          id: "y",
          name: "pull along Y",
          order: ["arm", "spacer", "cap", "out", "compound", "pinion"],
          rides: { arm: [0, 64, 0], spacer: [0, 50, 0], cap: [0, 44, 0], out: [0, 38, 0], compound: [0, 24, 0], pinion: [0, 12, 0] },
          of: rideBy([["arm", /^mech\.(arm|pin)$/], ["spacer", /^mech\.spacer$/], ["cap", /^mech\.axle$/], ["out", /^mech\.gear\.out$/], ["compound", /^mech\.gear\.(stage|second)$/], ["pinion", /^mech\.(gear\.pinion|shaft\.motor)$/]]),
        },
        {
          id: "x",
          name: "slide along X",
          order: ["clip", "cell2", "cell1", "cell0"],
          rides: { clip: [52, 0, 0], cell2: [22, 0, 0], cell1: [32, 0, 0], cell0: [42, 0, 0] },
          of: rideBy([["clip", /^battery\.clip$/], ["cell0", /^battery\.cell0$/], ["cell1", /^battery\.cell1$/], ["cell2", /^battery\.cell2$/]]),
        },
      ]
    : []),
];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const moveIn = (stage, item) => {
  const ride = stage.of(item);
  return ride && stage.rides[ride] ? stage.rides[ride] : [0, 0, 0];
};
const priorOf = (item, count) => STAGES.slice(0, count).reduce((sum, stage) => add3(sum, moveIn(stage, item)), [0, 0, 0]);
for (const item of R.items) item.keys = [item.key];
const STAGE_R = [R];
const STAGE_KEYS = join(HERE, `keys-v${VER}-stages.json`);
const stageCache = V2 && process.argv.includes("--cached") && existsSync(STAGE_KEYS) ? JSON.parse(readFileSync(STAGE_KEYS, "utf8")) : null;
for (let s = 1; s < STAGES.length; s++) {
  const stage = STAGES[s];
  const Rs = A.recorder(P, { order: stage.order, spring: SPRING });
  for (const item of R.items) {
    const prior = priorOf(item, s);
    const ride = stage.of(item);
    const shapes = item.shapes.map((shape) => (R.solids.includes(shape) ? Rs.solid({ ...A.moved(shape, prior) }) : { ...A.moved(shape, prior) }));
    Rs.put({ name: item.name, piece: ride ?? "still", ride: ride ?? "still", move: moveIn(stage, item), key: item.keys[s - 1] + dot3(moveIn(STAGES[s - 1], item), V), shapes, source: item, route: item.route, chunk: item.chunk });
  }
  for (const tube of R.tubes) Rs.tubes.push({ ...A.moved(tube, priorOf(tube, s)), move: [0, 0, 0], ride: "still", piece: "still" });
  for (const route of R.routes) Rs.routes.push({ ...route, points: route.points.map((p) => add3(p, priorOf(route, s))), move: [0, 0, 0], ride: "still", piece: "still" });
  const cached = stageCache && stageCache[s] && stageCache[s].length === Rs.items.length ? stageCache[s] : null;
  if (cached) Rs.items.forEach((one, index) => (one.key = cached[index]));
  else if (!process.argv.includes("--noseatle")) A.settle(Rs, P);
  Rs.items.forEach((one) => one.source.keys.push(one.key));
  STAGE_R.push(Rs);
}
if (V2 && !stageCache && !process.argv.includes("--noseatle")) writeFileSync(STAGE_KEYS, JSON.stringify(STAGE_R.map((Rs, s) => (s ? Rs.items.map((one) => one.key) : []))));

// v3 draws the machine 20% larger: the assembled view is scaled 1.2 about the card's centre, and each take-apart stage
// gets as close to 1.2 as the card allows, clear of the badge columns.
const FIT = V3 ? { inner: [96, 44, W - 96, H - 50], cap: 1.2 } : { inner: [140, 70, W - 140, H - 70], cap: 1 };
function fitOf(count) {
  const pts = [];
  for (const item of R.items) {
    const offset = priorOf(item, count);
    for (const shape of item.shapes) {
      if (shape.ground && item.name === "base.halo") continue;
      const b = A.boundsOf(A.moved(shape, offset));
      for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) pts.push(at([x, y, z]));
    }
  }
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const { inner, cap } = FIT;
  const s = Math.min((inner[2] - inner[0]) / (box[2] - box[0]), (inner[3] - inner[1]) / (box[3] - box[1]), cap);
  const c = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
  return { s, tx: W / 2 - ((W / 2) * (1 - s) + s * c[0]), ty: H / 2 - ((H / 2) * (1 - s) + s * c[1]) };
}

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
if (V2) {
  const lid = CALLS.find((call) => call.id === 10);
  Object.assign(lid, { say: "Clear acrylic lid: a back plate with an L-shaped opening, and a front strip that carries the door hinge.", match: /^lid\.(back|front|ledge)/, anchor: [-50, 37, 63] });
  Object.assign(CALLS.find((call) => call.id === 4), { match: /^mech\.motor/ });
  Object.assign(CALLS.find((call) => call.id === 5), { match: /^mech\.(gear|axle|shaft)/, say: "Two stages, 8 teeth driving 24 teeth, twice: 9 : 1. The motor turns nine times for every turn of the arm. In the take-apart they slide off their shafts along Y." });
  for (const [id, rides] of [[3, { x: "cell2" }], [5, { y: "compound" }], [7, { y: "arm" }], [8, { y: "arm" }]]) CALLS.find((call) => call.id === id).rides = rides;
  CALLS.push({ id: 14, name: "Wiring board", say: "Small board on the base with three headers: battery (2 pins), mechanism (4) and lid (6). Its traces join them the way the circuit below does.", match: /^base\.(board|header|standoff)/, piece: "base", anchor: [BOARD.x + 4, BOARD.y + BOARD.d, BOARD_Z[1]], side: "R", dy: 36 });
  CALLS.push({ id: 15, name: "Harnesses", say: "Four leads, each with a plug that lifts out of its header with its own assembly: battery, motor, limit switch, and six wires from the toggle's lugs.", match: /^(wire\.|battery\.plug|mech\.plug|lid\.plug|mech\.(motorboot|limitboot)|lid\.housing)/, piece: "mech", anchor: [6, 25.5, 6.8], side: "L", dy: 46 });
  CALLS.push({ id: 13, name: "Door", say: "Acrylic door on a pin hinge. The arm pushes it open from below and it rests on the arm's side; two torsion springs pull it shut as the arm drops back.", match: /^lid\.(door|knuckle|leaf|spring|pinhead|pintail)/, piece: "lid", dyn: "door", side: "L", dy: -40 });
  Object.assign(CALLS.find((call) => call.id === 7), { say: `Arm, ${M.ARM.length} mm long and bent ${Math.round(M.ARM.bend / M.RAD)}°, on the output shaft. It swings up through the door in the lid.` });
  CALLS.sort((a, b) => a.id - b.id);
}
if (V3) {
  // v3 drops the callouts that only name the obvious (base plate, lid, door), adds the door's spring hinge and numbers
  // the rest in order. Each leader is horizontal: its callout carries a spine, segments that lie on the part's visible
  // face, and the page lands the leader on the spine at whatever height the badge column gives it.
  const byId = (id) => CALLS.find((call) => call.id === id);
  const blockTop = M.SWITCH.bodyTop - 10;
  const front = SWB.y + SWB.d;
  const floor = Z_BASE + WIRE_R.pair + 0.05;
  const plan = [
    [2, { spine: [[[60, -39, 24], [60, -39, 56]]], anchor: [60, -39, 42], side: "R" }],
    // the tray front left of the limit switch, until step Y pulls the arm over it; then the tray's middle
    [3, { spine: [[[-57, 8.75, 3.8], [-57, 8.75, 12.8]]], anchor: [-57, 8.75, 9], rides: undefined, later: { 1: { spine: [[[-20, 8.75, 4], [-20, 8.75, 9.6]]], anchor: [-20, 8.75, 6.8] } } }],
    [4, { spine: [[[MOTOR[0] + 6, -9, MOTOR[1] - 6.5], [MOTOR[0] + 6, -9, MOTOR[1] + 6.5]]], anchor: [MOTOR[0] + 6, -9, MOTOR[1]] }],
    [5, { spine: [[[33, M.Y.g1[1], 28], [33, M.Y.g1[1], 44]]], anchor: [33, M.Y.g1[1], 36] }],
    [6, { spine: [[[54, M.Y.plate[1], 8], [54, M.Y.plate[1], 44]]], anchor: [54, M.Y.plate[1], 20] }],
    [7, {}],
    [8, {}],
    [9, { spine: [[[-34, BLOCK.y + BLOCK.d, 7], [-34, BLOCK.y + BLOCK.d, blockTop - 0.6], [-34, front, blockTop + 0.6], [-34, front, blockTop + 9]]], anchor: [-34, front, blockTop + 5] }],
    [11, { spine: [[[TOG.x + 6, TOG.y, 50], [TOG.x + 6, TOG.y, 59.4]], [[TOG.x + 4.25, TOG.y, Z_LID + LID_H + 0.3], [TOG.x + 4.25, TOG.y, Z_LID + LID_H + 2], [TOG.x + 3.3, TOG.y, Z_LID + LID_H + 2.4], [TOG.x + 3.3, TOG.y, Z_LID + LID_H + 4.6]]], anchor: [TOG.x + 4.25, TOG.y, Z_LID + LID_H + 1.1] }],
    [12, {}],
    ["hinge", null],
    [14, { spine: [[[44, BOARD.y + BOARD.d, BOARD_Z[0] + 0.6], [44, HEADER_Y[1], PLUG_Z[1] - 0.4]]], anchor: [44, HEADER_Y[1], PLUG_Z[0]] }],
    [15, { piece: "battery", spine: [[[-45, 11, floor], [-45, PIN_Y - 3.5, floor], [-41.5, PIN_Y, floor], [6, PIN_Y, floor]]], anchor: [-45, 24, floor] }],
  ];
  const [hx0, hx1] = HINGE.springs[1].x;
  const hinge = {
    name: "Spring hinge",
    say: "The door's hinge: a pin through three knuckles, with a torsion spring coiled on the pin at each end of the door's knuckle. The arm winds them up as it pushes the door open; when the arm drops back they pull the door shut.",
    match: /^lid\.(knuckle|leaf\d|spring|pinhead|pintail)/,
    piece: "lid",
    side: "R",
    spine: [[[hx0 + 0.1, DOOR.hy, DOOR.hz], [HINGE.knuckles[2].x[1] - 0.4, DOOR.hy, DOOR.hz]]],
    anchor: [(hx0 + hx1) / 2, DOOR.hy, DOOR.hz],
  };
  const next = plan.map(([id, change], index) => ({ ...(id === "hinge" ? hinge : { ...byId(id), ...change }), id: index + 1 }));
  CALLS.splice(0, CALLS.length, ...next);
}
for (const item of R.items) item.calls = CALLS.filter((call) => call.match.test(item.name)).map((call) => call.id);

const groups = R.items.map((item, index) => {
  const [mx, my, mz] = item.move;
  const stages = V2
    ? STAGES.slice(1)
        .map((stage, s) => {
          const ride = stage.of(item);
          return ` data-k${stage.id}="${item.keys[s + 1].toFixed(2)}"${ride ? ` data-r${stage.id}="${ride}"` : ""}`;
        })
        .join("")
    : "";
  return `<g class="it" data-piece="${item.piece}" data-k="${item.key.toFixed(2)}" data-m="${mx},${my},${mz}" data-i="${index}"${stages}${item.dyn ? ` data-dyn="${item.dyn}"` : ""}${item.calls.length ? ` data-c="${item.calls.join(" ")}"` : ""}>${item.svg}</g>`;
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

// v3's global flip counter: a Cloudflare Worker (counter/) holds one count for every visitor
const COUNTER = "https://useless-machine-counter.eliluminado7.workers.dev";
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
  calls: CALLS.map(({ id, name, say, piece, anchor, dyn, side, dy, rides, spine, later }) => ({ id, name, say, piece, anchor, dyn, side, dy, rides, spine, later })),
  v2: V2,
  v3: V3,
  base: V3 ? fitOf(0) : null,
  counter: V3 ? { url: COUNTER, site: "https://franbrizuelab.github.io" } : null,
  door: V2 ? DOOR_TABLE : null,
  stages: V2 ? STAGES.map((stage, s) => ({ id: stage.id, name: stage.name, order: stage.order, rides: stage.rides, fit: fitOf(s + 1) })) : null,
};

const circuit = readFileSync(join(HERE, V2 ? "circuit-v2.svg" : "circuit.svg"), "utf8");
const css = readFileSync(join(HERE, "um.css"), "utf8");
const inline = (file) => readFileSync(join(HERE, file), "utf8").replace(/^import .*$/gm, "").replace(/^export \{[^}]*\};?$/gm, "").replace(/^export /gm, "");
const live = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));
const script = [kitScript(), inline("plate.mjs"), inline("model.mjs"), inline("draw.mjs"), ...(V2 ? [inline("door.mjs"), inline("draw2.mjs")] : []), live].join("\n");
if (process.argv.includes("--check")) new Function(script.replace(/^\s*import .*$/gm, ""));

const label = V2
  ? "A useless machine in cutaway: a box of clear acrylic with its front and right walls removed. A toggle switch on the lid, a DC gearmotor with a 9 to 1 gear train, a curved arm on the output shaft, a limit switch, three AA cells and a small wiring board. The arm pushes a spring-hinged door open in the lid, flips the toggle back off and retracts, and the door closes behind it. It comes apart in three steps, one per axis."
  : "A useless machine in cutaway: a box of clear acrylic with its front and right walls removed. A toggle switch on the lid, a DC gearmotor with a 9 to 1 gear train, a curved arm on the output shaft, a limit switch and three AA cells. The arm rises through a slit in the lid, flips the toggle back off and retracts. The lid, the mechanism and the battery pack lift apart along the vertical axis.";
const svg = k.figureSvg({ width: W, height: H, label, body: `<g class="um-engine">${groups.join("")}</g><g class="um-over"></g>` });
const parts = CALLS.map((call) => `<li><button type="button" class="um-part" data-c="${call.id}"><span class="um-num">${call.id}</span><span class="um-name">${call.name}</span><span class="um-say">${call.say}</span></button></li>`).join("");
const versions = `<nav class="um-ver" aria-label="Version">${[1, 2, 3].map((ver) => `<a href="${pageName(ver)}"${ver === VER ? ' aria-current="page"' : ""}>v${ver}</a>`).join("")}</nav>`;
const STAGE_SAY = ["the whole machine", "lid, mechanism and battery lifted apart along Z", "arm and gears pulled off their shafts along Y", "cells and clip slid out along X"];
// v3 stage buttons: 1 is the whole machine and 2-4 the take-apart stages; pressing the lit one goes back to 1.
const stepButtons = STAGES.length > 1 && V3
  ? `<div class="um-steps" role="group" aria-label="Take-apart stages"><svg class="um-steps-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4.2 8 1.6l5.5 2.6L8 6.8z"/><path d="M2.5 9.4 8 12l5.5-2.6M2.5 9.4V12L8 14.6l5.5-2.6V9.4"/></svg>${[0, ...STAGES.map((_, s) => s + 1)].map((n) => `<button type="button" class="um-step" data-step="${n}" aria-pressed="${n === 0}" aria-label="Stage ${n + 1} of ${STAGES.length + 1}: ${STAGE_SAY[n]}">${n + 1}</button>`).join("")}</div>`
  : "";
const flipButton = `<button type="button" class="um-btn" data-flip><span class="um-lamp" aria-hidden="true"></span><span data-flip-label>Flip the switch</span></button>`;
// v3 icons, drawn on their own grids: a hand tapping (flip the switch) and an eight-tooth gear (settings).
const HAND = "M9 15.8V4.5a1.5 1.5 0 0 1 3 0V11M12 11V9.6a1.5 1.5 0 0 1 3 0v1.6M15 11.2v-.8a1.5 1.5 0 0 1 3 0v1.6M18 12v-.4a1.5 1.5 0 0 1 3 0v4c0 3.5-2.7 6.1-6.2 6.1h-1.6c-2 0-3.3-.6-4.6-1.9l-4.2-4.2a1.5 1.5 0 0 1 2.1-2.1L9 15.8M7.1 2.9 5.7 2M6.9 5.4H5.3M13.9 2.9l1.4-.9M14.1 5.4h1.6";
const GEAR = (() => {
  const points = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 2 * Math.PI;
    for (const [r, t] of [[5.5, -0.62], [7.1, -0.34], [7.1, 0.34], [5.5, 0.62]]) points.push([8 + r * Math.cos(a + (t * Math.PI) / 8), 8 + r * Math.sin(a + (t * Math.PI) / 8)]);
  }
  return `M${points.map((p) => p.map((v) => v.toFixed(2)).join(" ")).join("L")}Z`;
})();
const flipIcon = `<button type="button" class="um-act" data-flip aria-label="Flip the switch"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${HAND}"/></svg></button>`;
const settings = `<div class="um-settings"><nav class="um-ver" id="um-ver" aria-label="Version">${[1, 2, 3].map((ver) => `<a href="${pageName(ver)}"${ver === VER ? ' aria-current="page"' : ""}>v${ver}</a>`).join("")}</nav><button type="button" class="um-act um-gear" data-settings aria-expanded="false" aria-controls="um-ver" aria-label="Settings"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="${GEAR}"/><circle cx="8" cy="8" r="2.2"/></svg></button></div>`;
const controls = V3
  ? `<div class="um-controls">${flipIcon}${stepButtons}${settings}</div><div class="um-info" aria-hidden="true"><p class="um-info-empty" data-info-empty>Hover over a number to see information about the piece.</p><div class="um-info-card" data-info-card><span class="um-info-num" data-info-num></span><span class="um-info-name" data-info-name></span><span class="um-info-say" data-info-say></span></div></div>`
  : `<div class="um-controls">${flipButton}<button type="button" class="um-btn" data-apart>Take apart</button><span class="um-note" data-note aria-live="polite"></span>${versions}</div>`;
const corners = V3
  ? `<div class="um-odo" data-odo hidden><b data-odo-n></b> flip<span data-odo-s>s</span> undone worldwide</div><button type="button" class="um-round um-auto" data-auto aria-pressed="false" aria-label="Run the machine on its own"><svg viewBox="0 0 16 16" aria-hidden="true"><path class="um-play" d="M5.6 3.6v8.8L12.4 8z"/><path class="um-pause" d="M4.8 3.8h2.3v8.4H4.8zM8.9 3.8h2.3v8.4H8.9z"/></svg></button><button type="button" class="um-round um-infobtn" data-info aria-pressed="true" aria-label="Show the part numbers and their leader lines"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="4.4" r="1.15"/><path d="M6.4 7h2.4v5.2h1.2v1.1H6v-1.1h1.2V8.1h-.8z"/></svg></button>`
  : "";
const caption = V3
  ? "The toggle is a DPDT switch wired across a DC motor. Flipped on, it sends the battery to the motor one way: the arm rises, pushes the door open and rests against it, and its pin pushes the lever back over centre. That reverses the motor through the limit switch, so the arm retracts, the spring hinge pulls the door shut behind it, and the arm settles on the limit switch's leaf, which opens the circuit. Every lead plugs into a small board on the base. Front and right walls removed. The numbered buttons step through four stages: 1 is the whole machine; 2 lifts the lid, mechanism and battery apart along Z; 3 slides the arm and gears off their shafts along Y; 4 slides the clip and cells out along X. Pick any stage and it plays the stages in between; press the lit one again to go back to 1."
  : V2
  ? "The toggle is a DPDT switch wired across a DC motor. Flipped on, it sends the battery to the motor one way: the arm rises, pushes the door open and rests against it, and its pin pushes the lever back over centre. That reverses the motor through the limit switch, so the arm retracts, the door's torsion springs pull it shut behind it, and the arm settles on the limit switch's leaf, which opens the circuit. Every lead plugs into a small board on the base. Front and right walls removed. It comes apart in three steps, one per axis: the lid, mechanism and battery lift along Z; the arm and gears slide off their shafts along Y; the clip and cells slide out along X."
  : "The toggle is a DPDT switch wired across a DC motor. Flipped on, it sends the battery to the motor one way and the arm rises. The arm's pin pushes the lever back over centre, which reverses the motor through the limit switch. The arm retracts until it sits on the limit switch's leaf, which opens the circuit and stops it. Front and right walls removed; the lid, mechanism and battery pack separate along the vertical axis.";
// v3's text under the figure is an owner's manual. Its numbers come from the model and a few stated part ratings: the
// motor runs about 2.3 s per use (measured in the page), the toggle is rated for 25,000 operations and every use flips
// it twice, and the motor is assumed to draw about 0.3 A.
const USE = { motor: 2.3, amps: 0.3, toggle: 25000, limit: 1000000, brushHours: 500, perDay: 10 };
const lifeUses = USE.toggle / 2;
const lifeDays = lifeUses / USE.perDay;
const lifeYears = Math.floor(lifeDays / 365.25);
const lifeMonths = Math.round((lifeDays / 365.25 - lifeYears) * 12);
const brushUses = Math.round((USE.brushHours * 3600) / USE.motor / 10000) * 10000;
// energy per use, and what it could have done instead: lift a 100 g apple, or heat water from 20 °C to boiling
const joules = M.VOLTS * USE.amps * USE.motor;
const appleMetres = joules / (0.1 * 9.81);
const yearKJ = (joules * USE.perDay * 365) / 1000;
const boilMl = (yearKJ * 1000) / (4.186 * 80);
const fmt = (n) => n.toLocaleString("en-US");
const MANUAL = [
  ["Operation", "Flip the switch. The machine flips it back. Repeat as often as you like: it will not get bored, but it will wear out (see Service life)."],
  ["Efficiency", `Each use turns ${joules.toFixed(1)} J from the batteries (${M.VOLTS} V × ${USE.amps} A × ${USE.motor} s) into 0 J of useful work: an efficiency of 0.000%. That is enough to lift an apple ${appleMetres.toFixed(1)} m, spent on putting a switch back where it was. A year at ${USE.perDay} uses a day comes to ${Math.round(yearKJ)} kJ, all of it heat: enough to bring ${Math.round(boilMl)} ml of water to the boil.`],
  ["Lubrication", "Every 2,000 uses, a thin film of PTFE silicone grease on the gear teeth (some petroleum greases soften plastic gears) and one drop of sewing-machine oil on the door's hinge pin. The motor's bearings are sealed: leave them dry. No WD-40: it is a solvent, and it washes the grease out."],
  ["Service life", `${fmt(lifeUses)} uses. The weak point is the toggle switch, rated for ${fmt(USE.toggle)} operations, and every use costs two: your flip and the arm's. At ${USE.perDay} uses a day that is about ${lifeYears} years and ${lifeMonths} months. The limit switch (${fmt(USE.limit)} operations) and the motor's brushes (about ${fmt(brushUses)} uses) will outlive it.`],
  ["Troubleshooting", "Arm stops short of the lever: batteries below 1.1 V a cell. Arm reaches the lever but cannot flip it: NiMH cells, or grease on the lever. Door stays open: a torsion spring has slipped off its rivet. Arm comes out on its own: the play button in the corner is on."],
  ["Warranty", `12 months or ${fmt(lifeUses)} uses, whichever comes first. Void if the machine is used for anything useful.`],
];
const REPO = "https://github.com/franbrizuelab/useless-machine";
const GITHUB_MARK = "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z";
const manual = `<section class="um-manual" aria-labelledby="um-manual-title"><header class="um-manual-head"><h2 id="um-manual-title">Owner's manual</h2><span>Model UM-3 · 4.5 V</span></header><dl class="um-manual-list">${MANUAL.map(([term, text]) => `<div><dt>${term}</dt><dd>${text}</dd></div>`).join("")}</dl><p class="um-manual-last">Last change · firmware v3.0.1: fixed a bug where the machine was briefly useful.</p></section>`;
const footer = `<footer class="um-foot"><span>Useless machine · model UM-3</span><a class="um-git" href="${REPO}" target="_blank" rel="noopener"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="${GITHUB_MARK}"/></svg>GitHub</a></footer>`;
const stageLabel = V3
  ? "Useless machine. Space or Enter flips the switch, E steps through the take-apart stages, the arrow keys step through the parts, Escape clears."
  : V2
    ? "Useless machine. Space or Enter flips the switch, E takes it apart one axis at a time, the arrow keys step through the parts, Escape clears."
    : "Useless machine. Space or Enter flips the switch, E takes it apart, the arrow keys step through the parts, Escape clears.";
let plate = k.plateHtml({ fig: "Fig 1", title: "Useless machine", hint: V3 ? "" : "Click the switch", readout: V3 ? "" : "ready", keys: [], caption: "", body: `<div class="iso-stage um-stage" tabindex="0" role="group" aria-label="${stageLabel}">${V3 ? `<div class="um-view">${svg}</div>` : svg}</div>${corners}` });
if (V3) plate = plate.replace(/<span class="iso-plate-corner" data-corner="readout"[^>]*><\/span>/, "");
const body = `<div class="um${V3 ? " um3" : ""}">${plate.replace("</div></figure>", `</div>${controls}</figure>`)}<div class="um-below"><div class="um-circuit">${circuit}</div><ol class="um-parts">${parts}</ol></div>${V3 ? manual + footer : `<p class="iso-caption um-caption">${caption}</p>`}</div>`;
const SITE = "https://franbrizuelab.github.io/useless-machine/";
const PREVIEW = {
  title: "Useless machine",
  say: "An interactive cutaway: flip the toggle and an arm pushes open a door in the lid, flips the switch back off and retracts. Take it apart stage by stage.",
  alt: "Isometric cutaway of a clear acrylic box: the arm has pushed the lid's door open and is flipping the toggle switch back off.",
};
const previewTags = (url) =>
  `<meta name="description" content="${PREVIEW.say}"><meta property="og:type" content="website"><meta property="og:site_name" content="${PREVIEW.title}"><meta property="og:title" content="${PREVIEW.title}"><meta property="og:description" content="${PREVIEW.say}"><meta property="og:url" content="${url}"><meta property="og:image" content="${SITE}preview.jpg"><meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${PREVIEW.alt}"><meta name="twitter:card" content="summary_large_image">`;
let page = k.pageHtml({ title: "Useless machine", theme: THEME, body: `<style>${css}</style>${body}`, script, width: V3 ? 1100 : 1000 });
// v3 drops the page's empty band above the card, and carries the link-preview tags (WhatsApp, Slack, social cards)
if (V3) page = page.replace("margin:64px auto 96px", "margin:16px auto 64px").replace("<title>Useless machine</title>", `<title>Useless machine</title>${previewTags(SITE + pageName(3))}`);
writeFileSync(join(HERE, pageName(VER)), page);
console.log("wrote", `${R.items.length} items`, `${(page.length / 1024).toFixed(0)} KB`, `fit ${fit.toFixed(2)}`);
const first = A.auditOrExit(R, P, { crowd: CROWD_OK });
if (first && V2) {
  let problems = 0;
  for (let s = 1; s < STAGE_R.length; s++) {
    const Rs = STAGE_R[s];
    if (!Rs.settled) A.settle(Rs, P);
    const result = A.audit(Rs, P, { ground: () => true, crowd: CROWD_OK });
    const count = A.failures(result);
    problems += count;
    console.log(`\nstep ${STAGES[s].id} (${STAGES[s].name}), from the pose the earlier steps leave:`);
    console.log(A.report(result));
    console.log(count ? `step ${STAGES[s].id}: ${count} problems` : `step ${STAGES[s].id}: passed`);
  }
  console.log(problems ? `steps failed: ${problems} problems` : "all steps passed");
  if (problems) process.exitCode = 1;
}
