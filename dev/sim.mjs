import { M } from "./model.mjs";
const s = M.fresh();
console.log("lever x", M.LEVER.x.toFixed(2), "contact", M.CONTACT_X, "flatZ", M.SWITCH.flatZ.toFixed(2), "foot", M.FOOT.map((n) => n.toFixed(2)), "pinReach", M.PIN.reach.toFixed(2));
console.log("gear centres", Object.fromEntries(Object.entries(M.CENTRE).map(([k, v]) => [k, v.map((n) => +n.toFixed(1))])));
M.flipOn(s);
let t = 0, minGap = 99, log = [];
for (let i = 0; i < 60 * 8; i++) {
  M.step(s, 1 / 60);
  t += 1 / 60;
  const [px, pz] = M.pinAt(s.phi);
  const rise = pz - M.LEVER.pivotZ;
  const surfOff = M.LEVER.x + rise * Math.tan(s.th * M.RAD) - M.LEVER.half;
  const gap = surfOff - (px + M.PIN.r);
  if (s.th > 20) minGap = Math.min(minGap, gap);
  if (i % 12 === 0) log.push(`${t.toFixed(2)}s phi=${(s.phi / M.RAD).toFixed(1)} th=${s.th.toFixed(1)} V=${s.volts.toFixed(2)} tilt=${(M.leafTilt(s.phi) / M.RAD).toFixed(1)} LS=${M.limitClosed(s.phi) ? "closed" : "open"} pin=(${px.toFixed(1)},${pz.toFixed(1)}) gap=${gap.toFixed(2)}`);
}
console.log(log.join("\n"));
console.log("min gap after flip", minGap);
