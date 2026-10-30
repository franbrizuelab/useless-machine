const D = __DATA__;
const camP = D.P;
const root = document.querySelector(".um");
const stage = root.querySelector(".um-stage");
const svg = stage.querySelector("svg");
const engine = svg.querySelector(".um-engine");
const over = svg.querySelector(".um-over");
const readout = root.querySelector("[data-readout]");
const note = root.querySelector("[data-note]") || { textContent: "" };
const flipBtn = root.querySelector("[data-flip]");
const apartBtn = root.querySelector("[data-apart]");
const stepButtons = [...root.querySelectorAll("[data-step]")];
const autoBtn = root.querySelector("[data-auto]");
const infoBtn = root.querySelector("[data-info]");
const infoBox = root.querySelector(".um-info");
const partButtons = [...root.querySelectorAll(".um-part")];
const cc = root.querySelector(".um-circuit svg");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clampTo = (value, low, high) => Math.min(high, Math.max(low, value));
const ids = Object.keys(D.pieces);
const STEPS = D.stages || [{ id: "z", name: "apart", order: D.stagger, rides: Object.fromEntries(ids.map((id) => [id, D.pieces[id].move])), fit: D.expl }];
const springs = STEPS.map((step) => Object.fromEntries(Object.keys(step.rides).map((ride) => [ride, { x: 0, v: 0, target: 0, pending: null }])));
const piece = springs[0];
const goals = STEPS.map(() => 0);
let stepTarget = 0;
const SVGNS = "http://www.w3.org/2000/svg";
const dotV = (m) => m[0] * D.V[0] + m[1] * D.V[1] + m[2] * D.V[2];

const nodes = [...engine.querySelectorAll(".it")].map((el) => {
  const m = el.dataset.m.split(",").map(Number);
  const rides = STEPS.map((step, s) => (s ? el.dataset[`r${step.id}`] || null : el.dataset.piece));
  const moves = STEPS.map((step, s) => (s ? (rides[s] ? step.rides[rides[s]] : [0, 0, 0]) : m));
  const keys = STEPS.map((step, s) => Number(s ? el.dataset[`k${step.id}`] : el.dataset.k));
  return { el, key: keys[0], m, piece: el.dataset.piece, lift: dotV(m), rides, moves, keys, lifts: moves.map(dotV), shown: "", calls: (el.dataset.c || "").split(" ").filter(Boolean) };
});
const shareIn = (s, ride) => (ride && springs[s][ride] ? springs[s][ride].x : 0);
const stepBusy = (s) => Object.values(springs[s]).some((one) => Math.abs(one.x - one.target) > 0.002 || one.pending || Math.abs(one.v) > 0.002);
const stepUsed = (s) => Object.values(springs[s]).some((one) => Math.abs(one.x) > 1e-4 || one.target || one.pending);
const sortStep = () => {
  for (let s = STEPS.length - 1; s > 0; s--) if (stepUsed(s)) return s;
  return 0;
};
let order = nodes.map((_, index) => index);

const dyn = {};
engine.querySelectorAll("[data-dyn]").forEach((el) => {
  dyn[el.dataset.dyn] = [...el.querySelectorAll("path")];
});
for (const name of ["pinion", "stage", "second", "out"]) if (!dyn[name]) dyn[name] = [];
const doorEl = D.v2 ? engine.querySelector('[data-dyn="door"]') : null;
const doorPaths = doorEl ? [...doorEl.querySelectorAll("path")] : [];
const doorDots = doorEl ? [...doorEl.querySelectorAll("circle")] : [];
let lastDoor = 0;
const doorNow = () => (D.v2 ? doorAt(D.door, st.phi) : 0);

const st = M.fresh();
let lastPhi = null;
let lastTh = null;
let pendingFlip = false;
let selected = null;
let pinned = null;
let last = 0;
let clock = 0;
let frame = 0;
let visible = false;
let lastInput = -1e9;
let tourTimer = 0;
let auto = !D.v3;
const now = () => performance.now();

function paintDynamic() {
  if (st.phi !== lastPhi) {
    const parts = dynamicParts(camP, { phi: st.phi, th: st.th, fine: D.v3 });
    for (const name of ["pinion", "stage", "second", "out", "arm", "pin", "leaf"]) writeDs(name, partDs(parts[name]));
    lastPhi = st.phi;
  }
  if (st.th !== lastTh) {
    writeDs("lever", partDs(leverPart(camP, st.th, D.v3)));
    lastTh = st.th;
  }
  if (doorEl) {
    const alpha = doorNow();
    if (Math.abs(alpha - lastDoor) > 1e-5) {
      const part = doorPart(camP, alpha, { hooks: D.v3 });
      const ds = doorDsOf(part);
      for (let i = 0; i < ds.length; i++) if (doorPaths[i].getAttribute("d") !== ds[i]) doorPaths[i].setAttribute("d", ds[i]);
      part.dots.forEach(([x, y], i) => {
        doorDots[i].setAttribute("cx", x.toFixed(1));
        doorDots[i].setAttribute("cy", y.toFixed(1));
      });
      lastDoor = alpha;
    }
  }
}
function writeDs(name, ds) {
  const paths = dyn[name];
  for (let i = 0; i < ds.length; i++) if (paths[i].getAttribute("d") !== ds[i]) paths[i].setAttribute("d", ds[i]);
}

const camView = () => {
  let fit = D.base || { s: 1, tx: 0, ty: 0 };
  let cam = 0;
  STEPS.forEach((step, s) => {
    const t = clampTo(springs[s][step.order[0]].x, 0, 1.25);
    cam = Math.max(cam, t);
    fit = { s: fit.s + (step.fit.s - fit.s) * t, tx: fit.tx + (step.fit.tx - fit.tx) * t, ty: fit.ty + (step.fit.ty - fit.ty) * t };
  });
  const k = fit.s;
  return { cam, k, ox: (D.W / 2) * (1 - k) + fit.tx, oy: (D.H / 2) * (1 - k) + fit.ty };
};
const screenOf = (world, id, view, rides = null) => {
  const s = piece[id].x;
  const m = D.pieces[id].move;
  const w = [world[0] + m[0] * s, world[1] + m[1] * s, world[2] + m[2] * s];
  if (rides)
    STEPS.forEach((step, t) => {
      const ride = t && rides[step.id];
      if (!ride) return;
      const share = shareIn(t, ride);
      for (let i = 0; i < 3; i++) w[i] += step.rides[ride][i] * share;
    });
  const p = iso(w, camP);
  return [p[0] * view.k + view.ox, p[1] * view.k + view.oy];
};

function place() {
  for (const node of nodes) {
    let tx = 0;
    let ty = 0;
    let moved = false;
    for (let s = 0; s < STEPS.length; s++) {
      const share = shareIn(s, node.rides[s]);
      if (!share) continue;
      const m = node.moves[s];
      tx += (D.EX[0] * m[0] + D.EY[0] * m[1] + D.EZ[0] * m[2]) * share;
      ty += (D.EX[1] * m[0] + D.EY[1] * m[1] + D.EZ[1] * m[2]) * share;
      moved = true;
    }
    const text = !moved ? "" : `translate(${tx.toFixed(2)} ${ty.toFixed(2)})`;
    if (text !== node.shown) {
      node.shown = text;
      if (text) node.el.setAttribute("transform", text);
      else node.el.removeAttribute("transform");
    }
  }
  const at = sortStep();
  const sortKey = (node) => node.keys[at] + node.lifts[at] * shareIn(at, node.rides[at]);
  const next = nodes.map((_, index) => index).sort((a, b) => sortKey(nodes[a]) - sortKey(nodes[b]));
  if (next.some((index, at) => index !== order[at])) {
    const fragment = document.createDocumentFragment();
    for (const index of next) fragment.appendChild(nodes[index].el);
    engine.appendChild(fragment);
    order = next;
  }
  const view = camView();
  if (view.cam === 0 && !D.base) engine.removeAttribute("transform");
  else engine.setAttribute("transform", `translate(${view.ox.toFixed(2)} ${view.oy.toFixed(2)}) scale(${view.k.toFixed(4)})`);
  paintCalls(view);
}

const calls = D.calls.map((call) => {
  const g = document.createElementNS(SVGNS, "g");
  g.setAttribute("class", "um-call");
  g.dataset.c = call.id;
  g.innerHTML = `<path d=""/><circle class="um-dot" r="1.7"/><g class="um-badge"><circle r="9.2"/><text>${call.id}</text></g>`;
  over.appendChild(g);
  return { ...call, g, line: g.querySelector("path"), dot: g.querySelector(".um-dot"), badge: g.querySelector(".um-badge") };
});
const hit = document.createElementNS(SVGNS, "circle");
hit.setAttribute("class", "um-hit");
hit.setAttribute("r", "15");
over.appendChild(hit);

const worldOf = (call) => {
  if (call.dyn === "arm") {
    const [x, z] = turnPoint(M.ARM_SHAPE.centre(31), M.S[0], M.S[1], st.phi);
    return [x, M.Y.arm[1], z];
  }
  if (call.dyn === "pin") {
    const [x, z] = M.pinAt(st.phi);
    return [x, M.Y.arm[1], z];
  }
  if (call.dyn === "door") return inDoor(doorFrame(doorNow()), -27, 17, DOOR.z1);
  if (call.dyn === "lever") {
    const [x, z] = turnPoint([M.LEVER.length - 0.6, 0], M.LEVER.x, M.LEVER.pivotZ, Math.PI / 2 - st.th * M.RAD);
    return [x, M.Y.lever[1], z];
  }
  return call.anchor;
};

// v3 leaders are horizontal. Each callout has a spine (polylines on the part's visible face, in world units); the
// badges of a column are packed apart at the heights their spines allow, and each leader lands on its spine at its
// badge's height. Badges glide to new heights, so a column that reorders as parts move does not jump.
// later[s] replaces a callout's spine and anchor once take-apart step s is more than half done.
const laterOf = (call) => {
  if (!call.later) return null;
  for (let s = STEPS.length - 1; s > 0; s--) if (call.later[s] && springs[s][STEPS[s].order[0]].x > 0.5) return call.later[s];
  return null;
};
const prefOf = (call) => {
  if (call.dyn === "arm") return worldOf(call);
  if (call.dyn === "pin") {
    const [x, z] = M.pinAt(st.phi);
    return [x, M.Y.pin[0] + 1.6, z];
  }
  if (call.dyn === "lever") {
    const [x, z] = turnPoint([M.LEVER.length - 1.2, 0], M.LEVER.x, M.LEVER.pivotZ, Math.PI / 2 - st.th * M.RAD);
    return [x, M.Y.lever[1], z];
  }
  return (laterOf(call) || call).anchor;
};
const spineOf = (call) => {
  if (call.dyn === "arm") {
    const points = [];
    for (let s = 12; s <= 40; s += 4) {
      const [x, z] = turnPoint(M.ARM_SHAPE.centre(s), M.S[0], M.S[1], st.phi);
      points.push([x, M.Y.arm[1], z]);
    }
    return [points];
  }
  if (call.dyn === "pin") {
    const [x, z] = M.pinAt(st.phi);
    return [[[x, M.Y.pin[0] + 0.4, z], [x, M.Y.pin[0] + 4.6, z]]];
  }
  if (call.dyn === "lever") {
    const a = Math.PI / 2 - st.th * M.RAD;
    return [[4.6, M.LEVER.length - 0.6].map((u) => {
      const [x, z] = turnPoint([u, 0], M.LEVER.x, M.LEVER.pivotZ, a);
      return [x, M.Y.lever[1], z];
    })];
  }
  return (laterOf(call) || call).spine;
};
function landOn(call, y, side) {
  let best = null;
  for (const line of call.lines)
    for (let j = 0; j < Math.max(1, line.length - 1); j++) {
      const a = line[j];
      const b = line[j + 1] || a;
      const dy = b[1] - a[1];
      const t = Math.abs(dy) < 1e-6 ? 0.5 : clampTo((y - a[1]) / dy, 0, 1);
      const p = [a[0] + (b[0] - a[0]) * t, a[1] + dy * t];
      const score = Math.abs(p[1] - y) * 1000 + (side < 0 ? p[0] : D.W - p[0]);
      if (!best || score < best.score) best = { p, score };
    }
  return best.p;
}
let callClock = 0;
let callsEasing = false;
// A column starts in the order of its preferred heights; a neighbour swap is kept when it lets more leaders stay
// level (a short spine boxed in by a long one packs better on the other side of it).
function packColumn(column, gap, top, bottom) {
  column.sort((a, b) => a.pref[1] - b.pref[1] || a.id - b.id);
  let best = packOrder(column, gap, top, bottom);
  for (let pass = 0; pass < 3 && best.cost > 0.5; pass++)
    for (let i = 1; i < column.length; i++) {
      [column[i - 1], column[i]] = [column[i], column[i - 1]];
      const trial = packOrder(column, gap, top, bottom);
      if (trial.cost < best.cost - 0.5) best = trial;
      else [column[i - 1], column[i]] = [column[i], column[i - 1]];
    }
  column.forEach((call, i) => (call.goal = best.y[i]));
}
function packOrder(column, gap, top, bottom) {
  const lo = column.map((call) => Math.min(Math.max(call.lo, top), bottom));
  const hi = column.map((call, i) => Math.max(Math.min(call.hi, bottom), lo[i]));
  const y = column.map((call, i) => clampTo(call.pref[1], lo[i], hi[i]));
  for (let round = 0; round < 80; round++) {
    let moved = false;
    for (let i = 1; i < y.length; i++) {
      const short = y[i - 1] + gap - y[i];
      if (short < 0.01) continue;
      const roomUp = Math.max(0, y[i - 1] - lo[i - 1]);
      const roomDown = Math.max(0, hi[i] - y[i]);
      let up = short / 2;
      let down = short / 2;
      if (up > roomUp) [down, up] = [down + up - roomUp, roomUp];
      if (down > roomDown) [up, down] = [Math.min(roomUp, up + down - roomDown), roomDown];
      if (up + down < 0.01) continue;
      y[i - 1] -= up;
      y[i] += down;
      moved = true;
    }
    if (!moved) break;
  }
  for (let i = 1; i < y.length; i++) y[i] = Math.max(y[i], y[i - 1] + gap);
  if (y.length && y[y.length - 1] > bottom) {
    y[y.length - 1] = bottom;
    for (let i = y.length - 2; i >= 0; i--) y[i] = Math.min(y[i], y[i + 1] - gap);
  }
  const cost = y.reduce((sum, v, i) => sum + Math.max(0, lo[i] - v, v - hi[i]) * 10 + Math.abs(v - column[i].pref[1]) * 0.01, 0);
  return { y, cost };
}
function paintCalls3(view) {
  const time = now();
  const dt = callClock ? Math.min(0.05, (time - callClock) / 1000) : 0;
  callClock = time;
  const columns = { L: [], R: [] };
  for (const call of calls) {
    call.lines = spineOf(call).map((line) => line.map((w) => screenOf(w, call.piece, view, call.rides)));
    call.pref = screenOf(prefOf(call), call.piece, view, call.rides);
    call.lo = Math.min(...call.lines.flat().map((p) => p[1]));
    call.hi = Math.max(...call.lines.flat().map((p) => p[1]));
    columns[call.side].push(call);
  }
  // keep the columns clear of the corner text above and the round buttons below, which do not scale with the drawing
  const px = D.W / Math.max(1, stage.clientWidth);
  const gap = (badgeK > 1 ? 21 : 25) * badgeK;
  for (const column of Object.values(columns)) packColumn(column, gap, Math.max(64, 40 * px), D.H - Math.max(64, 58 * px));
  // A badge follows its goal exactly while the goal moves smoothly; when a column reorders, the goals jump, and the
  // jump is carried as an offset that decays, so the badges glide to their new places.
  const decay = still.matches || !dt ? 0 : Math.exp(-dt / 0.07);
  callsEasing = false;
  for (const call of calls) {
    if (call.shownY === undefined || !dt) call.offset = 0;
    else {
      const jump = call.goal - call.lastGoal;
      call.offset = (Math.abs(jump) > 4 * badgeK ? call.offset - jump : call.offset) * decay;
    }
    if (Math.abs(call.offset) < 0.05) call.offset = 0;
    else callsEasing = true;
    call.lastGoal = call.goal;
    call.shownY = call.goal + call.offset;
    const side = call.side === "L" ? -1 : 1;
    const edge = Math.max(46, 9.2 * badgeK + 10);
    const x = side < 0 ? edge : D.W - edge;
    const y = call.shownY;
    const [px, py] = landOn(call, y, side);
    const from = x - side * 9.2 * badgeK;
    const bend = Math.abs(py - y) > 0.4 ? `H${(px + side * 10).toFixed(1)}L${px.toFixed(1)} ${py.toFixed(1)}` : `H${px.toFixed(1)}`;
    call.line.setAttribute("d", `M${from.toFixed(1)} ${y.toFixed(1)}${bend}`);
    call.dot.setAttribute("cx", px.toFixed(1));
    call.dot.setAttribute("cy", py.toFixed(1));
    call.badge.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${badgeK.toFixed(3)})`);
  }
  if (callsEasing) run();
}

let badgeK = 1;
const readScale = () => {
  badgeK = clampTo((0.8 * D.W) / Math.max(1, stage.clientWidth), 1, 2.3);
};
new ResizeObserver(() => {
  readScale();
  callClock = 0;
  place();
}).observe(stage);

function paintCalls(view) {
  if (D.v3) {
    paintCalls3(view);
    paintHit(view);
    return;
  }
  const left = [];
  const right = [];
  for (const call of calls) {
    const p = screenOf(worldOf(call), call.piece, view, call.rides);
    call.p = p;
    call.y = p[1] + call.dy;
    (call.side === "L" ? left : right).push(call);
  }
  for (const column of [left, right]) {
    column.sort((a, b) => a.y - b.y);
    const gap = 25 * badgeK;
    const top = 64;
    const bottom = D.H - 64;
    column.forEach((call, index) => {
      call.y = Math.max(call.y, index ? column[index - 1].y + gap : top);
    });
    for (let index = column.length - 1; index >= 0; index--) {
      const limit = index === column.length - 1 ? bottom : column[index + 1].y - gap;
      column[index].y = Math.min(column[index].y, limit);
    }
  }
  for (const call of calls) {
    const side = call.side === "L" ? -1 : 1;
    const edge = Math.max(46, 9.2 * badgeK + 10);
    const x = side < 0 ? edge : D.W - edge;
    const [px, py] = call.p;
    call.line.setAttribute("d", `M${(x - side * 9.2 * badgeK).toFixed(1)} ${call.y.toFixed(1)}H${(x - side * (9.2 * badgeK + 16)).toFixed(1)}L${px.toFixed(1)} ${py.toFixed(1)}`);
    call.dot.setAttribute("cx", px.toFixed(1));
    call.dot.setAttribute("cy", py.toFixed(1));
    call.badge.setAttribute("transform", `translate(${x.toFixed(1)} ${call.y.toFixed(1)}) scale(${badgeK.toFixed(3)})`);
  }
  paintHit(view);
}
function paintHit(view) {
  const tip = turnPoint([M.LEVER.length * 0.55, 0], M.LEVER.x, M.LEVER.pivotZ, Math.PI / 2 - st.th * M.RAD);
  const [hx, hy] = screenOf([tip[0], M.Y.lever[1], tip[1]], "lid", view);
  hit.setAttribute("cx", hx.toFixed(1));
  hit.setAttribute("cy", hy.toFixed(1));
}

const SEG = {
  on: ["railTopA", "aUp", "aLevUp", "wireA", "motor", "wireB", "bLevDn", "bDn", "railBotB", "railBotA", "bat"],
  off: ["bat", "railTopA", "railTopB", "lsTop", "lsClosed", "bUp", "bLevUp", "wireB", "motor", "wireA", "aLevDn", "aDn", "railBotA"],
};
const segs = {};
cc.querySelectorAll("[data-seg]").forEach((el) => (segs[el.dataset.seg] = [...(segs[el.dataset.seg] || []), el]));
const paintedCircuit = { key: "" };
const CC2 = D.v2
  ? {
      a: cc.querySelector('[data-blade="a"]'),
      b: cc.querySelector('[data-blade="b"]'),
      ls: cc.querySelector('[data-blade="ls"]'),
      gang: cc.querySelector("[data-gang]"),
      glow: Object.fromEntries(["on", "off"].map((loop) => [loop, cc.querySelector(`.cc-glow[data-loop="${loop}"]`)])),
      flow: Object.fromEntries(["on", "off"].map((loop) => [loop, cc.querySelector(`.cc-flow[data-loop="${loop}"]`)])),
      volts: cc.querySelector("[data-volts]"),
      dir: cc.querySelector("[data-dir]"),
      pole: 1,
      limit: 1,
      march: 0,
      shown: "",
    }
  : null;
const bladeAt = (pivot, from, to, t, length) => {
  const a = from + (to - from) * t;
  return [pivot[0] + length * Math.cos(a), pivot[1] + length * Math.sin(a)];
};
const POLE_A = { pivot: [140, 100], on: Math.atan2(-22, -28), off: Math.atan2(22, -28) - 2 * Math.PI, length: Math.hypot(28, 22) };
const POLE_B = { pivot: [190, 100], on: Math.atan2(-22, 28), off: Math.atan2(22, 28), length: Math.hypot(28, 22) };
const LIMIT_BLADE = { pivot: [292, 112], on: -Math.PI / 2, off: -Math.PI / 2 - 0.42, length: 24 };
const circuitMoving = () => Boolean(CC2) && (Math.abs(CC2.pole - (st.th < 0 ? 0 : 1)) > 1e-3 || Math.abs(CC2.limit - (M.limitClosed(st.phi) ? 0 : 1)) > 1e-3);
function paintCircuit2(dt) {
  const snap = still.matches ? 1 : 1 - Math.exp(-dt / 0.022);
  CC2.pole += ((st.th < 0 ? 0 : 1) - CC2.pole) * snap;
  CC2.limit += ((M.limitClosed(st.phi) ? 0 : 1) - CC2.limit) * snap;
  const v = st.volts;
  CC2.march = (CC2.march + (Math.abs(v) / M.VOLTS) * 34 * dt) % 1000;
  const a = bladeAt(POLE_A.pivot, POLE_A.on, POLE_A.off, CC2.pole, POLE_A.length);
  const b = bladeAt(POLE_B.pivot, POLE_B.on, POLE_B.off, CC2.pole, POLE_B.length);
  const ls = bladeAt(LIMIT_BLADE.pivot, LIMIT_BLADE.on, LIMIT_BLADE.off, CC2.limit, LIMIT_BLADE.length);
  const ga = bladeAt(POLE_A.pivot, POLE_A.on, POLE_A.off, CC2.pole, POLE_A.length * 0.86);
  const gb = bladeAt(POLE_B.pivot, POLE_B.on, POLE_B.off, CC2.pole, POLE_B.length * 0.86);
  const f = (n) => n.toFixed(2);
  CC2.a.setAttribute("d", `M${POLE_A.pivot.join(" ")}L${f(a[0])} ${f(a[1])}`);
  CC2.b.setAttribute("d", `M${POLE_B.pivot.join(" ")}L${f(b[0])} ${f(b[1])}`);
  CC2.ls.setAttribute("d", `M${LIMIT_BLADE.pivot.join(" ")}L${f(ls[0])} ${f(ls[1])}`);
  CC2.gang.setAttribute("d", `M${f(ga[0])} ${f(ga[1])}L${f(gb[0])} ${f(gb[1])}`);
  const level = { on: Math.max(0, Math.min(1, v / M.VOLTS)), off: Math.max(0, Math.min(1, -v / M.VOLTS)) };
  for (const loop of ["on", "off"]) {
    CC2.glow[loop].style.opacity = (level[loop] * 0.9).toFixed(3);
    CC2.flow[loop].style.opacity = level[loop].toFixed(3);
    CC2.flow[loop].style.strokeDashoffset = (-CC2.march).toFixed(2);
  }
  const text = `${v < -0.005 ? "−" : v > 0.005 ? "+" : ""}${Math.abs(v).toFixed(1)} V`;
  const dir = v > 0.05 ? " · arm out" : v < -0.05 ? " · arm back" : " · stopped";
  if (text + dir !== CC2.shown) {
    CC2.shown = text + dir;
    CC2.volts.textContent = text;
    CC2.dir.textContent = dir;
  }
}
function paintCircuit(dt = 1) {
  if (CC2) return paintCircuit2(dt);
  const on = st.th < 0;
  const closed = M.limitClosed(st.phi);
  const v = st.volts;
  const flow = v > 0.05 ? "on" : v < -0.05 ? "off" : "none";
  const key = `${on}|${closed}|${flow}|${v.toFixed(1)}`;
  if (key === paintedCircuit.key) return;
  paintedCircuit.key = key;
  const live = new Set(flow === "none" ? [] : SEG[flow]);
  for (const [name, els] of Object.entries(segs)) for (const el of els) el.toggleAttribute("data-live", live.has(name));
  const hide = { aLevUp: !on, aLevDn: on, bLevUp: on, bLevDn: !on, lsClosed: !closed, lsOpen: closed };
  for (const [name, off] of Object.entries(hide)) for (const el of segs[name] || []) el.toggleAttribute("data-off", off);
  cc.querySelector("[data-volts]").textContent = `${v < -0.005 ? "−" : v > 0.005 ? "+" : ""}${Math.abs(v).toFixed(1)} V`;
  cc.querySelector("[data-dir]").textContent = flow === "on" ? "arm out" : flow === "off" ? "arm back" : "stopped";
}

const idle = () => Math.abs(st.w) < 1e-3 && Math.abs(st.volts) < 0.02 && st.th > 0 && st.phi >= M.STOP_HOME - 1e-3;
const assembled = () => springs.every((group) => Object.values(group).every((one) => Math.abs(one.x) < 0.003 && !one.pending && one.target === 0));
const springsMoving = () => springs.some((group) => Object.values(group).some((one) => Math.abs(one.x - one.target) > 0.002 || one.pending));
const stepsOut = () => goals.filter(Boolean).length;
let apart = false;
let wantApart = false;

function setStep(target) {
  stepTarget = clampTo(target, 0, STEPS.length);
  wantApart = stepTarget > 0;
  if (wantApart && !goals[0] && !idle()) {
    say("waiting for the arm to finish");
    note.textContent = "taking apart once the arm is home";
  }
  labelApart();
  describe();
  run();
}
const setApart = (on) => setStep(on ? STEPS.length : 0);
const nextStep = () => setStep(stepTarget >= STEPS.length ? 0 : stepTarget + 1);
function labelApart() {
  stepButtons.forEach((button) => button.setAttribute("aria-pressed", String(Number(button.dataset.step) === stepTarget)));
  if (!apartBtn) return;
  const text = stepTarget >= STEPS.length ? "Put it together" : STEPS.length === 1 || stepTarget === 0 ? "Take apart" : `Next: ${STEPS[stepTarget].name}`;
  if (apartBtn.textContent !== text) apartBtn.textContent = text;
}
function launch(s, goal) {
  goals[s] = goal;
  let index = 0;
  const group = springs[s];
  for (const id of goal ? STEPS[s].order : [...STEPS[s].order].reverse()) {
    if (!group[id]) continue;
    if (group[id].target === goal) group[id].pending = null;
    else group[id].pending = { value: goal, at: clock + (still.matches ? 0 : index++ * D.spring.stagger) };
  }
  apart = goals[0] === 1;
  flipBtn.disabled = false;
  describe();
}
// v3 chains the stages on the way to a far one: the next stage starts as the last one is within 3% of its goal, so a
// jump from 1 to 4 plays as one movement.
const stepNear = (s, goal) => Object.values(springs[s]).every((one) => !one.pending && one.target === goal && Math.abs(one.x - goal) < 0.03 && Math.abs(one.v) < 0.6);
const stepHeld = (s, goal) => (D.v3 ? !stepNear(s, goal) : stepBusy(s));
function driveSteps() {
  const out = stepsOut();
  if (stepTarget > out) {
    if (out === 0 ? !idle() : stepHeld(out - 1, 1)) return;
    launch(out, 1);
  } else if (stepTarget < out) {
    if (out < STEPS.length && stepHeld(out, 0)) return;
    launch(out - 1, 0);
  }
}

function flip(fromTour = false) {
  if (!fromTour) lastInput = now();
  if (apart || stepTarget > 0 || !assembled()) {
    pendingFlip = true;
    setApart(false);
    note.textContent = "closing up first";
    run();
    return;
  }
  if (st.th < 0) return;
  M.flipOn(st);
  say("switch on");
  run();
}

function select(id) {
  if (selected === id) return;
  selected = id;
  for (const node of nodes) {
    if (id !== null && node.calls.includes(String(id))) node.el.setAttribute("data-on", "");
    else node.el.removeAttribute("data-on");
  }
  if (id !== null) {
    stage.setAttribute("data-focus", "");
    over.setAttribute("data-focus", "");
  } else {
    stage.removeAttribute("data-focus");
    over.removeAttribute("data-focus");
  }
  for (const call of calls) (String(call.id) === String(id) ? call.g.setAttribute("data-on", "") : call.g.removeAttribute("data-on"));
  partButtons.forEach((button) => (button.dataset.c === String(id) ? button.setAttribute("data-on", "") : button.removeAttribute("data-on")));
  showInfo(id);
  describe();
}

// v3: the box under the controls shows the part whose number is under the pointer; it keeps its height, so nothing
// below it moves.
const info = infoBox
  ? { card: infoBox.querySelector("[data-info-card]"), empty: infoBox.querySelector("[data-info-empty]"), num: infoBox.querySelector("[data-info-num]"), name: infoBox.querySelector("[data-info-name]"), say: infoBox.querySelector("[data-info-say]"), shown: null }
  : null;
let showCalls = true;
function showInfo(id) {
  if (!info) return;
  const call = id === null ? null : D.calls.find((c) => String(c.id) === String(id));
  if (call && info.shown !== call.id) {
    info.num.textContent = call.id;
    info.name.textContent = call.name;
    info.say.textContent = call.say;
    info.card.classList.remove("um-in");
    void info.card.offsetWidth;
    info.card.classList.add("um-in");
  }
  info.shown = call ? call.id : null;
  infoBox.toggleAttribute("data-show", Boolean(call));
  info.empty.textContent = showCalls ? "Hover over a number to see information about the piece." : "Numbers are hidden. Turn them on with the i button to see information about each piece.";
}

function say(text) {
  if (readout && readout.textContent !== text) readout.textContent = text;
}
function describe() {
  const call = selected ? D.calls.find((c) => String(c.id) === String(selected)) : null;
  const out = stepsOut();
  const apartText = STEPS.length > 1 ? `Apart, step ${out} of ${STEPS.length}: ${STEPS.slice(0, out).map((step) => step.name).join(", then ")}.` : "Apart: lid, mechanism, battery pack and base.";
  const text = call ? `${call.id} ${call.name}. ${call.say}` : apart ? apartText : st.th < 0 ? "Switch on." : "Switch off, arm home.";
  if (stage.getAttribute("aria-description") !== text) stage.setAttribute("aria-description", text);
}

function status() {
  const swing = ((M.HOME - st.phi) / M.RAD);
  if (STEPS.length > 1) {
    const out = stepsOut();
    const busy = springsMoving();
    if (busy && stepTarget < out) return `closing up · step ${out} of ${STEPS.length} · ${STEPS[out - 1].name}`;
    if (busy && out) return `taking apart · step ${out} of ${STEPS.length} · ${STEPS[out - 1].name}`;
    if (busy) return "closing up";
    if (out) return `apart · step ${out} of ${STEPS.length} · ${STEPS[out - 1].name}`;
  }
  if (springsMoving() && !apart) return "closing up";
  if (springsMoving()) return "taking apart";
  if (apart) return "apart · 4 assemblies";
  const closed = M.limitClosed(st.phi);
  if (idle()) return "arm home · switch off · 0.0 V";
  const sign = st.volts > 0.05 ? "+" : st.volts < -0.05 ? "−" : "";
  return `arm ${Math.max(0, swing).toFixed(0)}° · motor ${sign}${Math.abs(st.volts).toFixed(1)} V · limit ${closed ? "closed" : "open"}`;
}
let phase = "";
function announce() {
  const text = idle() ? "arm home" : st.volts > 0.05 ? "arm rising" : st.volts < -0.05 ? "arm retracting" : "";
  if (text && text !== phase) {
    phase = text;
    if (!wantApart || !apart) note.textContent = text;
  }
  if (!text) phase = "";
}

function advance(dt) {
  let left = dt;
  while (left > 1e-6) {
    const h = Math.min(left, 1 / 240);
    M.step(st, h);
    left -= h;
  }
}

function steer(state, dt, calm) {
  if (state.pending && clock >= state.pending.at) {
    state.target = state.pending.value;
    state.pending = null;
  }
  if (calm) {
    state.x = state.target;
    state.v = 0;
    return false;
  }
  for (let index = 0; index < D.spring.substeps; index++) {
    const h = dt / D.spring.substeps;
    state.v += ((state.target - state.x) * D.spring.stiffness - state.v * D.spring.damping) * h;
    state.x += state.v * h;
  }
  if (Math.abs(state.target - state.x) < 2e-4 && Math.abs(state.v) < 2e-4) {
    state.x = state.target;
    state.v = 0;
    return state.pending !== null;
  }
  return true;
}

function tick(time) {
  const dt = last ? Math.min((time - last) / 1000, 1 / 30) : 1 / 60;
  last = time;
  clock += dt;
  const calm = still.matches;
  let moving = false;
  for (const group of springs) for (const id of Object.keys(group)) moving = steer(group[id], dt, calm) || moving;
  driveSteps();
  const lidZ = D.pieces.lid.move[2] * piece.lid.x;
  const mechZ = D.pieces.mech.move[2] * piece.mech.x;
  st.dz = lidZ - mechZ;
  if (pendingFlip && assembled() && idle()) {
    pendingFlip = false;
    note.textContent = "";
    M.flipOn(st);
  }
  advance(dt);
  paintDynamic();
  place();
  paintCircuit(dt);
  say(status());
  announce();
  flipBtn.setAttribute("data-state", st.th < 0 ? "on" : "off");
  const busy = moving || springsMoving() || !idle() || stepTarget !== stepsOut() || pendingFlip || circuitMoving() || callsEasing;
  frame = visible && busy ? requestAnimationFrame(tick) : 0;
  if (!busy) afterIdle();
}

function run() {
  if (!frame && visible) {
    last = 0;
    frame = requestAnimationFrame(tick);
  }
}

// v1 and v2 run an idle tour when nobody touches the figure; v3 runs only while its play button is on, and then
// flips the switch again a moment after the arm comes home.
function afterIdle() {
  clearTimeout(tourTimer);
  if ((still.matches && !D.v3) || !auto || apart || stepTarget > 0) return;
  const wait = D.v3 ? 1100 : Math.max(1800, lastInput + 3600 - now());
  tourTimer = setTimeout(() => {
    if (visible && auto && idle() && assembled() && (D.v3 || now() - lastInput > 3500)) flip(true);
    else afterIdle();
  }, wait);
}
function setAuto(on) {
  auto = on;
  if (autoBtn) {
    autoBtn.setAttribute("aria-pressed", String(on));
    autoBtn.setAttribute("aria-label", on ? "Pause: stop running on its own" : "Run the machine on its own");
  }
  if (on && (idle() || stepTarget > 0 || !assembled())) flip(true);
  run();
  afterIdle();
}
function setCalls(on) {
  showCalls = on;
  if (infoBtn) infoBtn.setAttribute("aria-pressed", String(on));
  over.classList.toggle("um-calls-off", !on);
  if (!on) {
    pinned = null;
    select(null);
  }
  showInfo(null);
}

new IntersectionObserver(
  (entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible) {
      run();
      afterIdle();
    }
  },
  { rootMargin: "120px 0px" },
).observe(stage);

hit.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  flip();
});
flipBtn.addEventListener("click", () => flip());
if (apartBtn)
  apartBtn.addEventListener("click", () => {
    lastInput = now();
    nextStep();
  });
stepButtons.forEach((button) =>
  button.addEventListener("click", () => {
    lastInput = now();
    const n = Number(button.dataset.step);
    setStep(stepTarget === n ? 0 : n);
  }),
);
const settingsBtn = root.querySelector("[data-settings]");
if (settingsBtn)
  settingsBtn.addEventListener("click", () => {
    const open = settingsBtn.getAttribute("aria-expanded") !== "true";
    settingsBtn.setAttribute("aria-expanded", String(open));
    settingsBtn.parentElement.toggleAttribute("data-open", open);
  });
if (autoBtn) autoBtn.addEventListener("click", () => setAuto(!auto));
if (infoBtn) infoBtn.addEventListener("click", () => setCalls(!showCalls));
partButtons.forEach((button) => {
  const id = button.dataset.c;
  button.addEventListener("pointerenter", () => !pinned && select(id));
  button.addEventListener("pointerleave", () => !pinned && select(null));
  button.addEventListener("focus", () => !pinned && select(id));
  button.addEventListener("blur", () => !pinned && select(null));
  button.addEventListener("click", () => {
    pinned = pinned === id ? null : id;
    select(pinned ?? id);
  });
});
for (const call of calls) {
  call.g.style.pointerEvents = "all";
  call.g.style.cursor = "pointer";
  call.g.addEventListener("pointerenter", () => !pinned && select(String(call.id)));
  call.g.addEventListener("pointerleave", () => !pinned && select(null));
}
stage.addEventListener("keydown", (event) => {
  lastInput = now();
  const key = event.key;
  const current = selected ? Number(selected) : 0;
  if (key === " " || key === "Enter") {
    event.preventDefault();
    flip();
  } else if (key === "e" || key === "E") {
    nextStep();
  } else if (key === "ArrowRight" || key === "ArrowDown") {
    event.preventDefault();
    pinned = String((current % D.calls.length) + 1);
    select(pinned);
  } else if (key === "ArrowLeft" || key === "ArrowUp") {
    event.preventDefault();
    pinned = String(((current + D.calls.length - 2) % D.calls.length) + 1);
    select(pinned);
  } else if (key === "Escape") {
    pinned = null;
    select(null);
    setApart(false);
  }
});

readScale();
paintDynamic();
paintCircuit();
place();
say(status());
describe();
labelApart();
showInfo(null);
// v3 zoom: a pinch on a touch screen, a trackpad pinch or Ctrl + wheel over the drawing zooms into it, up to ZOOM_MAX,
// around the fingers or the pointer. The page itself does not zoom. When the gesture ends the drawing eases back to
// its normal size. The card clips it, and a thin mask fades it out before the card's edge.
const viewBox = stage.querySelector(".um-view");
const ZOOM_MAX = 2.6;
const zoom = { z: 1, x: 0, y: 0, frame: 0, wheel: 0, pinch: null, base: 1 };
function applyZoom() {
  const { z, x, y } = zoom;
  svg.style.transform = z === 1 && !x && !y ? "" : `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${z.toFixed(4)})`;
  stage.toggleAttribute("data-zoomed", z > 1.01);
}
function clampPan() {
  const w = viewBox.clientWidth;
  const h = viewBox.clientHeight;
  zoom.x = clampTo(zoom.x, w - w * zoom.z, 0);
  zoom.y = clampTo(zoom.y, h - h * zoom.z, 0);
}
const localOf = (clientX, clientY) => {
  const r = viewBox.getBoundingClientRect();
  return [clientX - r.left, clientY - r.top];
};
function zoomAt([px, py], z) {
  const next = clampTo(z, 1, ZOOM_MAX);
  zoom.x = px - ((px - zoom.x) * next) / zoom.z;
  zoom.y = py - ((py - zoom.y) * next) / zoom.z;
  zoom.z = next;
  clampPan();
  applyZoom();
}
function holdZoom() {
  cancelAnimationFrame(zoom.frame);
  zoom.frame = 0;
}
function releaseZoom() {
  holdZoom();
  if (still.matches) {
    Object.assign(zoom, { z: 1, x: 0, y: 0 });
    return applyZoom();
  }
  let last = performance.now();
  const back = (time) => {
    const f = 1 - Math.exp(-Math.min(0.05, (time - last) / 1000) / 0.09);
    last = time;
    zoom.z += (1 - zoom.z) * f;
    zoom.x -= zoom.x * f;
    zoom.y -= zoom.y * f;
    const done = zoom.z - 1 < 0.002 && Math.abs(zoom.x) < 0.3 && Math.abs(zoom.y) < 0.3;
    if (done) Object.assign(zoom, { z: 1, x: 0, y: 0 });
    applyZoom();
    zoom.frame = done ? 0 : requestAnimationFrame(back);
  };
  zoom.frame = requestAnimationFrame(back);
}
if (viewBox) {
  // trackpad pinches arrive as wheel events with ctrlKey set (Chrome, Edge, Firefox); a mouse needs Ctrl held
  viewBox.addEventListener(
    "wheel",
    (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      holdZoom();
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      zoomAt(localOf(event.clientX, event.clientY), zoom.z * Math.exp(-delta * 0.01));
      clearTimeout(zoom.wheel);
      zoom.wheel = setTimeout(releaseZoom, 180);
    },
    { passive: false },
  );
  // Safari's trackpad pinch; on iOS the touch handlers below do the work and these only stop the page zooming
  viewBox.addEventListener("gesturestart", (event) => {
    event.preventDefault();
    if (zoom.pinch) return;
    holdZoom();
    zoom.base = zoom.z;
  });
  viewBox.addEventListener("gesturechange", (event) => {
    event.preventDefault();
    if (!zoom.pinch) zoomAt(localOf(event.clientX, event.clientY), zoom.base * event.scale);
  });
  viewBox.addEventListener("gestureend", (event) => {
    event.preventDefault();
    if (!zoom.pinch) releaseZoom();
  });
  const pinchOf = (touches) => {
    const [a, b] = [touches[0], touches[1]];
    return { at: localOf((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2), d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) };
  };
  viewBox.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length !== 2) return;
      event.preventDefault();
      holdZoom();
      const { at, d } = pinchOf(event.touches);
      zoom.pinch = { d, z: zoom.z, cx: (at[0] - zoom.x) / zoom.z, cy: (at[1] - zoom.y) / zoom.z };
    },
    { passive: false },
  );
  viewBox.addEventListener(
    "touchmove",
    (event) => {
      if (!zoom.pinch || event.touches.length < 2) return;
      event.preventDefault();
      const { at, d } = pinchOf(event.touches);
      zoom.z = clampTo((zoom.pinch.z * d) / Math.max(1, zoom.pinch.d), 1, ZOOM_MAX);
      zoom.x = at[0] - zoom.pinch.cx * zoom.z;
      zoom.y = at[1] - zoom.pinch.cy * zoom.z;
      clampPan();
      applyZoom();
    },
    { passive: false },
  );
  const endPinch = (event) => {
    if (!zoom.pinch || event.touches.length >= 2) return;
    zoom.pinch = null;
    releaseZoom();
  };
  viewBox.addEventListener("touchend", endPinch);
  viewBox.addEventListener("touchcancel", endPinch);
}

// probe(world, piece, rides): the callout ids of the part painted on top at a world point (glass skipped), for checks.
const probe = (world, id, rides = null) => {
  const [x, y] = screenOf(world, id, camView(), rides);
  const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
  const hits = [...new Set(document.elementsFromPoint(p.x, p.y).map((el) => el.closest(".it")).filter(Boolean))];
  const top = hits.find((it) => !it.querySelector(".um-glass"));
  return top ? top.dataset.c || `-${top.dataset.i}` : "";
};
window.__um = { st, piece, springs, flip, setApart, setStep, nextStep, select, idle, assembled, setAuto, setCalls, calls, probe, zoom };
