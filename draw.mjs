import { iso } from "./kit-link.mjs";
import { plateOf, plateParts, partSvg, partDs, onPlate, ringOnPlate, circlePoly, rectPoly, gearPoly, turnPoint } from "./plate.mjs";
import { M } from "./model.mjs";

const ln = (d, t = "lo") => ({ c: "iso-line", t, d });

export function gearPart(P, name, alpha) {
  const spec = M.GEAR[name];
  const centre = M.CENTRE[name === "second" ? "stage" : name];
  const [cx, cz] = centre;
  const layer = name === "pinion" || name === "stage" ? M.Y.g1 : M.Y.g2;
  const paths = plateOf(gearPoly(spec.teeth, M.GEAR.module, spec.phase), { x: cx, z: cz, a: alpha, y0: layer[0], y1: layer[1] }, P);
  const y = layer[1];
  const at = (u, v) => turnPoint([u, v], cx, cz, alpha);
  const lines = [];
  if (spec.teeth === 24) {
    lines.push(ln(ringOnPlate(cx, cz, 2.4, y, P, 16), "mid"));
    for (let k = 0; k < 6; k++) {
      const t = (k / 6) * Math.PI * 2;
      const [hx, hz] = at(8.4 * Math.cos(t), 8.4 * Math.sin(t));
      lines.push(ln(ringOnPlate(hx, hz, 2.8, y, P, 14), "lo"));
    }
    lines.push(ln(ringOnPlate(cx, cz, M.pitchR(24) - 2.2, y, P, 40), "faint"));
  } else {
    lines.push(ln(ringOnPlate(cx, cz, 1.2, y, P, 12), "mid"));
  }
  return { lit: false, solid: plateParts(paths, { tone: spec.teeth === 24 ? "mid" : "hi" }), lines };
}

export function armPart(P, phi, fine = false) {
  const [sx, sz] = M.S;
  const [y0, y1] = M.Y.arm;
  const paths = plateOf(M.ARM_SHAPE.ring, { x: sx, z: sz, a: phi, y0, y1 }, P);
  const at = (u, v) => turnPoint([u, v], sx, sz, phi);
  const [tx, tz] = at(...M.TIP);
  const rib = [];
  const near = (s) => Math.hypot(M.ARM_SHAPE.centre(s)[0] - M.TIP[0], M.ARM_SHAPE.centre(s)[1] - M.TIP[1]);
  let from = 4.9;
  let to = M.ARM.length;
  for (let i = 0; i < 24; i++) {
    const mid = (from + to) / 2;
    if (near(mid) > 2.7) from = mid;
    else to = mid;
  }
  for (let s = 4.9; s < to; s += 0.8) rib.push(at(...M.ARM_SHAPE.centre(s)));
  rib.push(at(...M.ARM_SHAPE.centre(to)));
  return {
    lit: false,
    solid: plateParts(paths, { tone: "hi" }),
    lines: [ln(ringOnPlate(sx, sz, 4.9, y1, P, 36)), ln(ringOnPlate(tx, tz, 2.7, y1, P, 20)), ln(onPlate(rib, y1, P), "faint"), ln(ringOnPlate(sx, sz, 2.6, y1 + 0.8, P, 16), "mid"), ln(onPlate([at(fine ? -2.58 : -2.2, 0), at(fine ? 2.58 : 2.2, 0)], y1 + 0.8, P), "mid")],
  };
}

export function pinPart(P, phi) {
  const [px, pz] = M.pinAt(phi);
  return { lit: true, solid: plateParts(plateOf(circlePoly(M.PIN.r, 14), { x: px, z: pz, a: 0, y0: M.Y.pin[0], y1: M.Y.pin[1] }, P), { tone: "hi" }), lines: [] };
}

// fine (v3): line ends land on outlines at any size — the lever's groove runs out to the tip's edge and the slot in the
// arm's hub reaches its ring.
export function leverPart(P, thDeg, fine = false) {
  const L = M.LEVER;
  const groove = fine ? L.length : L.length - 2.2;
  const a = Math.PI / 2 - thDeg * M.RAD;
  const paths = plateOf(L.ring, { x: L.x, z: L.pivotZ, a, y0: M.Y.lever[0], y1: M.Y.lever[1] }, P);
  const along = [turnPoint([4.2, 0], L.x, L.pivotZ, a), turnPoint([groove, 0], L.x, L.pivotZ, a)];
  return { lit: true, solid: plateParts(paths, { tone: "hi" }), lines: [ln(onPlate(along, M.Y.lever[1], P), "faint")] };
}

export function leafPart(P, phi) {
  const paths = plateOf(rectPoly(0, 0, M.SWITCH.leaf, M.SWITCH.thick, 0.3, 2), { x: M.SWITCH.hingeX, z: M.SWITCH.hingeZ, a: M.leafTilt(phi), y0: M.Y.leaf[0], y1: M.Y.leaf[1] }, P);
  return { lit: false, solid: plateParts(paths, { tone: "mid" }), lines: [] };
}

export const DYN = ["pinion", "stage", "second", "out", "arm", "pin", "lever", "leaf"];
export function dynamicParts(P, state) {
  const d = state.phi - M.HOME;
  return {
    pinion: gearPart(P, "pinion", 9 * d),
    stage: gearPart(P, "stage", -3 * d),
    second: gearPart(P, "second", -3 * d),
    out: gearPart(P, "out", d),
    arm: armPart(P, state.phi, state.fine),
    pin: pinPart(P, state.phi),
    lever: leverPart(P, state.th, state.fine),
    leaf: leafPart(P, state.phi),
  };
}
export { partSvg, partDs };
