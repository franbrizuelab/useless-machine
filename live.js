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
const cc = root.querySelector("svg.cc");
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
// v3 opens fully apart and, a second after the figure first comes into view, puts itself together; from then on only
// the reader moves it, and any input before that second is up cancels it.
let openPending = false;
let opening = 0;
function userTook() {
  openPending = false;
  clearTimeout(opening);
}

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
  if (!fromTour) {
    lastInput = now();
    userTook();
  }
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
// The box empties a beat after the pointer leaves a number, so it can be reached; while the pointer is over it, it
// keeps what it shows.
let infoClear = 0;
let overBox = false;
function showInfo(id) {
  if (!info) return;
  clearTimeout(infoClear);
  if (id === null && info.shown !== null) {
    infoClear = setTimeout(() => !overBox && paintInfo(null), 320);
    return;
  }
  paintInfo(id);
}
function paintInfo(id) {
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
  const touch = matchMedia("(hover: none)").matches;
  info.empty.textContent = showCalls ? `${touch ? "Tap" : "Hover over"} a number to see the piece and what it does.` : "Numbers are hidden. Turn them on with the i button to see each piece.";
  showPiece(call ? call.id : null);
}
if (infoBox) {
  infoBox.addEventListener("pointerenter", () => (overBox = true));
  infoBox.addEventListener("pointerleave", () => {
    overBox = false;
    if (!selected) showInfo(null);
  });
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
  userTook();
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
      if (openPending) {
        openPending = false;
        opening = setTimeout(() => setStep(0), 1000);
      }
      run();
      afterIdle();
    }
  },
  { rootMargin: "120px 0px" },
).observe(stage);

// v3: the number of flips visitors have made, everywhere, from the counter Worker. It appears once the first read
// succeeds and refreshes every 30 s while the figure is on screen. Only flips made by hand on the published page are
// posted, so local copies and automated checks never add to it.
const odo = D.counter ? { el: root.querySelector("[data-odo]"), n: root.querySelector("[data-odo-n]"), s: root.querySelector("[data-odo-s]"), count: 0, read: 0 } : null;
function showCount(count) {
  if (!odo || typeof count !== "number" || count < odo.count) return;
  odo.count = count;
  odo.n.textContent = count.toLocaleString("en-US");
  odo.s.hidden = count === 1;
  odo.el.hidden = false;
}
async function readCount() {
  try {
    const response = await fetch(`${D.counter.url}/count`, { cache: "no-store" });
    showCount((await response.json()).count);
  } catch {}
}
// The counter only takes a flip with a proof of work on a challenge it signed: a nonce whose SHA-256, after the
// challenge, starts with `bits` zero bits. A background worker finds it while the arm moves.
const PROOF_WORKER = `
const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
const m = new Uint32Array(64);
// the first word of SHA-256 of an ASCII string
function firstWord(text) {
  const n = text.length;
  const blocks = ((n + 9 + 63) >> 6) << 4;
  const w = new Uint32Array(blocks);
  for (let i = 0; i < n; i++) w[i >> 2] |= text.charCodeAt(i) << (24 - (i & 3) * 8);
  w[n >> 2] |= 0x80 << (24 - (n & 3) * 8);
  w[blocks - 1] = n * 8;
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  for (let b = 0; b < blocks; b += 16) {
    for (let t = 0; t < 16; t++) m[t] = w[b + t];
    for (let t = 16; t < 64; t++) {
      const x = m[t - 15], y = m[t - 2];
      m[t] = (m[t - 16] + (((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)) + m[t - 7] + (((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10))) | 0;
    }
    let [a, bb, c, d, e, f, g, hh] = h;
    for (let t = 0; t < 64; t++) {
      const t1 = (hh + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[t] + m[t]) | 0;
      const t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + bb) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }
  return h[0];
}
onmessage = ({ data: { challenge, bits } }) => {
  let nonce = 0;
  while (Math.clz32(firstWord(challenge + "." + nonce)) < bits) nonce++;
  postMessage(String(nonce));
};`;
let prover = null;
const proveOf = (challenge, bits) =>
  new Promise((done) => {
    prover ??= new Worker(URL.createObjectURL(new Blob([PROOF_WORKER], { type: "text/javascript" })));
    prover.onmessage = ({ data }) => done(data);
    prover.postMessage({ challenge, bits });
  });
let posting = false;
async function postFlip() {
  if (!odo || posting || location.origin !== D.counter.site) return;
  posting = true;
  try {
    const { challenge, sig, bits } = await (await fetch(`${D.counter.url}/challenge`, { cache: "no-store" })).json();
    const nonce = await proveOf(challenge, bits);
    const response = await fetch(`${D.counter.url}/flip`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challenge, sig, nonce }) });
    showCount((await response.json()).count);
  } catch {}
  posting = false;
}
if (odo) {
  readCount();
  odo.read = setInterval(() => visible && document.visibilityState === "visible" && readCount(), 30000);
}
// a flip by hand: counted when it starts a cycle (or queues one behind closing up)
function handFlip() {
  const started = st.th < 0 || pendingFlip;
  flip();
  if (!started && (st.th < 0 || pendingFlip)) postFlip();
}

hit.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  handFlip();
});
flipBtn.addEventListener("click", () => handFlip());
if (apartBtn)
  apartBtn.addEventListener("click", () => {
    lastInput = now();
    nextStep();
  });
stepButtons.forEach((button) =>
  button.addEventListener("click", () => {
    lastInput = now();
    userTook();
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
// v3 on a touch screen: a tap selects and the selection stays until the same number is tapped again or a tap lands
// anywhere else; there is no hover to end it.
const touchy = (event) => D.v3 && event.pointerType === "touch";
function enterPart(event, id) {
  if (pinned) return;
  if (touchy(event) && selected === id) return select(null);
  select(id);
}
const leavePart = (event) => !pinned && !touchy(event) && select(null);
// v3: a line of the parts list is selected while the pointer is over it (or while it has keyboard focus); a click
// does not pin it. v1 and v2 pin on click.
partButtons.forEach((button) => {
  const id = button.dataset.c;
  button.addEventListener("pointerenter", (event) => enterPart(event, id));
  button.addEventListener("pointerleave", leavePart);
  button.addEventListener("focus", () => !pinned && (!D.v3 || button.matches(":focus-visible")) && select(id));
  button.addEventListener("blur", () => !pinned && select(null));
  if (!D.v3)
    button.addEventListener("click", () => {
      pinned = pinned === id ? null : id;
      select(pinned ?? id);
    });
});
for (const call of calls) {
  call.g.style.pointerEvents = "all";
  call.g.style.cursor = "pointer";
  call.g.addEventListener("pointerenter", (event) => enterPart(event, String(call.id)));
  call.g.addEventListener("pointerleave", leavePart);
}
if (D.v3)
  document.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch" && selected && !pinned && !event.target.closest(".um-call, .um-part, [data-info-box]")) select(null);
  });
stage.addEventListener("keydown", (event) => {
  lastInput = now();
  userTook();
  const key = event.key;
  const current = selected ? Number(selected) : 0;
  if (key === " " || key === "Enter") {
    event.preventDefault();
    handFlip();
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

// v3 piece view: the part under the pointer, alone, turning steadily one way about the vertical through its centre.
// It is meshed once from the true shapes the build exports (D.shapes) and drawn on a canvas every frame by the kit's
// rules: each face shaded in the same four bands by its facing to a light fixed to the camera, an outline wherever a
// face turns away (silhouette) or meets its neighbour at a crease, everything painted far to near.
const TURN_S = 12;
const CREASE = Math.cos((35 * Math.PI) / 180);
const CAM = (() => {
  const a = (camP.azimuth * Math.PI) / 180;
  const e = (camP.elevation * Math.PI) / 180;
  const l = [-Math.sin(a), Math.cos(a), 1.2];
  const ll = Math.hypot(...l);
  return { sinA: Math.sin(a), cosA: Math.cos(a), sinE: Math.sin(e), cosE: Math.cos(e), V: [Math.cos(a) * Math.cos(e), Math.sin(a) * Math.cos(e), Math.sin(e)], L: l.map((x) => x / ll) };
})();
const BAND = [0, 0.2, 0.42, 0.62];
const norm3 = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
function meshOf(parts) {
  const verts = [];
  const faces = [];
  const add = (points) => {
    const start = verts.length;
    verts.push(...points);
    return start;
  };
  // soft faces (tubes) draw only their silhouettes: a cable is many short chunks, and a crease at every joint and
  // end cap would string it with rings
  const groups = [];
  const face = (idx, n, part, shape, soft = false) => {
    faces.push({ idx, n: norm3(n), part, shape, soft });
    groups[groups.length - 1].faces.push(faces.length - 1);
  };
  parts.forEach((part, p) => {
    part.shapes.forEach((sh, si) => {
      const shape = `${p}.${si}`;
      groups.push({ kind: sh.k, part: p, faces: [], decals: [] });
      if (sh.k === "p") {
        const [o, a, u, v] = sh.F;
        const at = ([x, y], s) => [0, 1, 2].map((i) => o[i] + a[i] * s + u[i] * x + v[i] * y);
        const n = sh.poly.length;
        let area = 0;
        for (let i = 0; i < n; i++) area += sh.poly[i][0] * sh.poly[(i + 1) % n][1] - sh.poly[(i + 1) % n][0] * sh.poly[i][1];
        const ccw = area > 0 ? 1 : -1;
        const b0 = add(sh.poly.map((q) => at(q, sh.s[0])));
        const b1 = add(sh.poly.map((q) => at(q, sh.s[1])));
        face(sh.poly.map((_, i) => b0 + i), a.map((x) => -x), p, shape);
        face(sh.poly.map((_, i) => b1 + i), a, p, shape);
        groups[groups.length - 1].caps = [faces.length - 2, faces.length - 1];
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          const dx = sh.poly[j][0] - sh.poly[i][0];
          const dy = sh.poly[j][1] - sh.poly[i][1];
          face([b0 + i, b0 + j, b1 + j, b1 + i], [0, 1, 2].map((k) => ccw * (u[k] * dy - v[k] * dx)), p, shape);
        }
      } else if (sh.k === "b") {
        const [o, a, u, v] = sh.F;
        const N = 28;
        const prof = sh.poly;
        let area = 0;
        for (let i = 0; i < prof.length; i++) area += prof[i][0] * prof[(i + 1) % prof.length][1] - prof[(i + 1) % prof.length][0] * prof[i][1];
        const ccw = area > 0 ? 1 : -1;
        const ring = (j) => {
          const t = (j / N) * 2 * Math.PI;
          return [0, 1, 2].map((k) => u[k] * Math.cos(t) + v[k] * Math.sin(t));
        };
        const base = prof.map(([sv, r]) => add(Array.from({ length: N }, (_, j) => [0, 1, 2].map((k) => o[k] + a[k] * sv + ring(j)[k] * r))));
        for (let i = 0; i < prof.length; i++) {
          const q = (i + 1) % prof.length;
          if (prof[i][1] <= 0 && prof[q][1] <= 0) continue;
          const ds = prof[q][0] - prof[i][0];
          const dr = prof[q][1] - prof[i][1];
          for (let j = 0; j < N; j++) {
            const e = ring(j + 0.5);
            face([base[i] + j, base[i] + ((j + 1) % N), base[q] + ((j + 1) % N), base[q] + j], [0, 1, 2].map((k) => ccw * (a[k] * dr - e[k] * ds)), p, shape);
          }
        }
      } else if (sh.k === "s") {
        const [la, lo] = [10, 18];
        const at = (i, j) => {
          const th = (i / la) * Math.PI;
          const ph = (j / lo) * 2 * Math.PI;
          return [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
        };
        const b = add(Array.from({ length: (la + 1) * lo }, (_, k) => at(Math.floor(k / lo), k % lo).map((x, m) => sh.o[m] + x * sh.r)));
        for (let i = 0; i < la; i++)
          for (let j = 0; j < lo; j++) face([b + i * lo + j, b + i * lo + ((j + 1) % lo), b + (i + 1) * lo + ((j + 1) % lo), b + (i + 1) * lo + j], at(i + 0.5, j + 0.5), p, shape);
      } else if (sh.k === "t") {
        const N = 10;
        const pts = sh.points;
        let ref = null;
        const rings = pts.map((pt, i) => {
          const t = norm3([0, 1, 2].map((k) => pts[Math.min(i + 1, pts.length - 1)][k] - pts[Math.max(i - 1, 0)][k]));
          const seed = ref && Math.abs(ref[0] * t[0] + ref[1] * t[1] + ref[2] * t[2]) < 0.99 ? ref : Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
          const d = seed[0] * t[0] + seed[1] * t[1] + seed[2] * t[2];
          const e1 = norm3([0, 1, 2].map((k) => seed[k] - d * t[k]));
          const e2 = [t[1] * e1[2] - t[2] * e1[1], t[2] * e1[0] - t[0] * e1[2], t[0] * e1[1] - t[1] * e1[0]];
          ref = e1;
          const dirs = Array.from({ length: N }, (_, j) => {
            const c = Math.cos((j / N) * 2 * Math.PI);
            const s2 = Math.sin((j / N) * 2 * Math.PI);
            return [0, 1, 2].map((k) => e1[k] * c + e2[k] * s2);
          });
          return { start: add(dirs.map((dv) => [0, 1, 2].map((k) => pt[k] + dv[k] * sh.radii[i]))), dirs, t };
        });
        for (let i = 0; i + 1 < rings.length; i++)
          for (let j = 0; j < N; j++) {
            const jj = (j + 1) % N;
            face([rings[i].start + j, rings[i].start + jj, rings[i + 1].start + jj, rings[i + 1].start + j], [0, 1, 2].map((k) => rings[i].dirs[j][k] + rings[i].dirs[jj][k] + rings[i + 1].dirs[j][k] + rings[i + 1].dirs[jj][k]), p, shape, true);
          }
        const first = rings[0];
        const last = rings[rings.length - 1];
        face(Array.from({ length: N }, (_, j) => first.start + j), first.t.map((x) => -x), p, shape, true);
        face(Array.from({ length: N }, (_, j) => last.start + j), last.t, p, shape, true);
        faces[faces.length - 1].cap = faces[faces.length - 2].cap = true;
      }
    });
    const host = groups.find((g) => g.part === p);
    for (const decal of part.decals)
      for (const loop of decal.loops) {
        faces.push({ idx: Array.from({ length: loop.length }, (_, i) => add([loop[i]])), n: decal.n, part: p, decal: true });
        host.decals.push(faces.length - 1);
      }
  });
  // neighbours across each edge, within a shape, for silhouettes and creases
  const owner = new Map();
  faces.forEach((f, fi) => {
    if (f.decal) return;
    f.edges = f.idx.map((a, i) => {
      const b = f.idx[(i + 1) % f.idx.length];
      const key = `${f.shape}:${Math.min(a, b)}:${Math.max(a, b)}`;
      const list = owner.get(key) || [];
      list.push(fi);
      owner.set(key, list);
      return key;
    });
  });
  for (const f of faces) if (f.edges) f.next = f.edges.map((key) => owner.get(key).find((g) => faces[g] !== f) ?? -1);
  const xs = verts.map((v) => v[0]);
  const ys = verts.map((v) => v[1]);
  const zs = verts.map((v) => v[2]);
  const c = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
  const R = Math.max(...verts.map((v) => Math.hypot(v[0] - c[0], v[1] - c[1])));
  // each shape's vertices and box, for ordering whole shapes
  for (const g of groups) {
    g.verts = [...new Set(g.faces.flatMap((fi) => faces[fi].idx))];
    g.min = [0, 1, 2].map((k) => Math.min(...g.verts.map((v) => verts[v][k])));
    g.max = [0, 1, 2].map((k) => Math.max(...g.verts.map((v) => verts[v][k])));
    g.mid = [0, 1, 2].map((k) => (g.min[k] + g.max[k]) / 2);
  }
  return { verts, faces, parts, c, R, zh: (Math.max(...zs) - Math.min(...zs)) / 2, groups, planes: new Map() };
}
// A plane with one shape on each side decides which is in front from any direction, so it is found once per pair
// (the first time the two overlap on screen) and kept: a plane between their boxes along an axis, else one of either
// shape's own face planes. Pairs without one (gears meshing in one layer) fall back to their centres' depths.
const SEP_EPS = 0.06;
function separationOf(mesh, A, B) {
  for (let k = 0; k < 3; k++) {
    const n = [0, 0, 0];
    n[k] = 1;
    if (A.max[k] <= B.min[k] + SEP_EPS) return { n, back: "A" };
    if (B.max[k] <= A.min[k] + SEP_EPS) return { n, back: "B" };
  }
  const dot = (n, v) => n[0] * v[0] + n[1] * v[1] + n[2] * v[2];
  const outside = (own, other, name) => {
    const seen = [];
    for (const fi of own.faces) {
      const f = mesh.faces[fi];
      if (seen.some((m) => m[0] * f.n[0] + m[1] * f.n[1] + m[2] * f.n[2] > 0.9999)) continue;
      seen.push(f.n);
      const d = dot(f.n, mesh.verts[f.idx[0]]);
      if (own.verts.every((v) => dot(f.n, mesh.verts[v]) <= d + SEP_EPS) && other.verts.every((v) => dot(f.n, mesh.verts[v]) >= d - SEP_EPS)) return { n: f.n, back: name };
    }
    return null;
  };
  return outside(A, B, "A") || outside(B, A, "B");
}
const pieceBox = {
  view: root.querySelector("[data-piece-view]"),
  canvas: root.querySelector("[data-piece-canvas]"),
  box: root.querySelector("[data-info-box]"),
  bolt: root.querySelector("[data-circuit]"),
};
const turner = { mesh: null, id: null, angle: 0, frame: 0, onScreen: true, zoom: { z: 1, x: 0, y: 0 }, cache: new Map(), colours: null };
function coloursOf() {
  const css = getComputedStyle(root);
  const v = (name) => css.getPropertyValue(name).trim();
  return { fill: [v("--anatomy-shade-0"), v("--anatomy-shade-1"), v("--anatomy-shade-2"), v("--anatomy-shade-3"), v("--anatomy-top") || "#fff"], line: { hi: v("--anatomy-hi"), mid: v("--anatomy-mid"), lo: v("--anatomy-lo"), faint: v("--anatomy-faint") } };
}
function drawPiece() {
  const { canvas } = pieceBox;
  const mesh = turner.mesh;
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!mesh || !w) return;
  turner.colours ??= coloursOf();
  const { sinA, cosA, sinE, cosE, V, L } = CAM;
  const k = Math.min((w / 2 - 22) / mesh.R, (h / 2 - 22) / (mesh.R * sinE + mesh.zh * cosE));
  const { z, x: zx, y: zy } = turner.zoom;
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (zx + (w / 2) * z), dpr * (zy + (h / 2) * z));
  const ca = Math.cos(turner.angle);
  const sa = Math.sin(turner.angle);
  const [cx, cy, cz] = mesh.c;
  const n = mesh.verts.length;
  const X = new Float32Array(n);
  const Y = new Float32Array(n);
  const Dp = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const [vx, vy, vz] = mesh.verts[i];
    const rx = (vx - cx) * ca - (vy - cy) * sa;
    const ry = (vx - cx) * sa + (vy - cy) * ca;
    const rz = vz - cz;
    X[i] = (rx * sinA - ry * cosA) * k;
    Y[i] = ((rx * cosA + ry * sinA) * sinE - rz * cosE) * k;
    Dp[i] = (rx * cosA + ry * sinA) * cosE + rz * sinE;
  }
  const turned = (nv) => [nv[0] * ca - nv[1] * sa, nv[0] * sa + nv[1] * ca, nv[2]];
  const facing = mesh.faces.map((f) => {
    const t = turned(f.n);
    return { t, front: t[0] * V[0] + t[1] * V[1] + t[2] * V[2] > 1e-4 };
  });
  const depthOfFace = (fi) => {
    let d = 0;
    for (const i of mesh.faces[fi].idx) d += Dp[i];
    return d / mesh.faces[fi].idx.length;
  };
  // the view direction in the piece's own (unturned) frame
  const Vo = [V[0] * ca + V[1] * sa, -V[0] * sa + V[1] * ca, V[2]];
  const shown = [];
  mesh.groups.forEach((g, gi) => {
    if (!g.faces.some((fi) => facing[fi].front)) return;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const v of g.verts) {
      if (X[v] < x0) x0 = X[v];
      if (X[v] > x1) x1 = X[v];
      if (Y[v] < y0) y0 = Y[v];
      if (Y[v] > y1) y1 = Y[v];
    }
    const m = g.mid;
    const mx = m[0] - cx;
    const my = m[1] - cy;
    shown.push({ gi, box: [x0, y0, x1, y1], depth: (mx * ca - my * sa) * cosA * cosE + (mx * sa + my * ca) * sinA * cosE + (m[2] - cz) * sinE, after: [], before: 0 });
  });
  for (let i = 0; i < shown.length; i++)
    for (let j = i + 1; j < shown.length; j++) {
      const a = shown[i];
      const b = shown[j];
      if (a.box[2] < b.box[0] || b.box[2] < a.box[0] || a.box[3] < b.box[1] || b.box[3] < a.box[1]) continue;
      const key = `${a.gi}:${b.gi}`;
      if (!mesh.planes.has(key)) mesh.planes.set(key, separationOf(mesh, mesh.groups[a.gi], mesh.groups[b.gi]));
      const plane = mesh.planes.get(key);
      let aFirst;
      if (plane) {
        const toward = plane.n[0] * Vo[0] + plane.n[1] * Vo[1] + plane.n[2] * Vo[2];
        if (Math.abs(toward) < 1e-6) continue;
        // the shape on the plane's back side is drawn first when the viewer is on its front side
        aFirst = (plane.back === "A") === toward > 0;
      } else aFirst = a.depth < b.depth;
      const [first, next] = aFirst ? [a, b] : [b, a];
      first.after.push(next);
      next.before++;
    }
  // far to near: shapes with nothing left to wait for, farthest first; a cycle falls back to depth
  const ready = shown.filter((g) => !g.before);
  const order = [];
  const left = new Set(shown);
  while (left.size) {
    let pick = null;
    for (const g of ready) if (left.has(g) && (!pick || g.depth < pick.depth)) pick = g;
    if (!pick) for (const g of left) if (!pick || g.depth < pick.depth) pick = g;
    left.delete(pick);
    order.push(pick);
    for (const g of pick.after) if (--g.before <= 0 && left.has(g)) ready.push(g);
  }
  const { fill, line } = turner.colours;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const paintFace = (fi) => {
    const f = mesh.faces[fi];
    const part = mesh.parts[f.part];
    const path = new Path2D();
    f.idx.forEach((i, m) => (m ? path.lineTo(X[i], Y[i]) : path.moveTo(X[i], Y[i])));
    path.closePath();
    if (f.decal) {
      ctx.globalAlpha = 1;
      ctx.lineWidth = 0.7 / z;
      ctx.strokeStyle = line.lo;
      ctx.stroke(path);
      return;
    }
    const t = facing[fi].t;
    const score = t[0] * L[0] + t[1] * L[1] + t[2] * L[2];
    let band = 0;
    while (band < BAND.length && score >= BAND[band]) band++;
    ctx.globalAlpha = part.glass ? 0.5 : 1;
    ctx.fillStyle = fill[Math.min(band, 4)];
    ctx.strokeStyle = fill[Math.min(band, 4)];
    ctx.lineWidth = 0.6 / z;
    ctx.fill(path);
    ctx.stroke(path);
    ctx.globalAlpha = 1;
    const edges = new Path2D();
    let any = false;
    f.idx.forEach((a, m) => {
      const g = f.next[m];
      const away = g < 0 || !facing[g].front;
      const draw = f.soft ? away && g >= 0 && !mesh.faces[g].cap : away || facing[g].t[0] * t[0] + facing[g].t[1] * t[1] + facing[g].t[2] * t[2] < CREASE;
      if (!draw) return;
      const b = f.idx[(m + 1) % f.idx.length];
      edges.moveTo(X[a], Y[a]);
      edges.lineTo(X[b], Y[b]);
      any = true;
    });
    if (any) {
      ctx.lineWidth = 0.9 / z;
      ctx.strokeStyle = line[part.tone] || line.mid;
      ctx.stroke(edges);
    }
  };
  for (const { gi } of order) {
    const g = mesh.groups[gi];
    // an extrusion is drawn sides first and its near cap last: that is exact for any prism, toothed or bent
    const caps = g.caps || [];
    const sides = g.faces.filter((fi) => facing[fi].front && !caps.includes(fi)).map((fi) => [depthOfFace(fi), fi]);
    sides.sort((p, q) => p[0] - q[0]);
    for (const [, fi] of sides) paintFace(fi);
    for (const fi of caps) if (facing[fi].front) paintFace(fi);
    for (const fi of g.decals) if (facing[fi].front) paintFace(fi);
  }
}
function spinPiece() {
  cancelAnimationFrame(turner.frame);
  turner.frame = 0;
  const live = turner.mesh && pieceBox.box.hasAttribute("data-show") && !pieceBox.box.hasAttribute("data-circuit") && turner.onScreen;
  if (!live) return;
  if (still.matches) return drawPiece();
  let last = performance.now();
  const step = (time) => {
    turner.angle += (Math.min(0.05, (time - last) / 1000) * 2 * Math.PI) / TURN_S;
    last = time;
    drawPiece();
    turner.frame = requestAnimationFrame(step);
  };
  turner.frame = requestAnimationFrame(step);
}
function showPiece(id) {
  if (!pieceBox.view) return;
  if (id !== null && String(id) !== turner.id) {
    turner.id = String(id);
    if (!turner.cache.has(turner.id)) turner.cache.set(turner.id, meshOf(D.shapes[turner.id]));
    turner.mesh = turner.cache.get(turner.id);
    turner.angle = 0;
  }
  drawPiece();
  spinPiece();
}
if (pieceBox.view) {
  zoomable(pieceBox.view, pieceBox.canvas, pieceBox.view, (zoom) => {
    turner.zoom = zoom;
    if (still.matches || !turner.frame) drawPiece();
  });
  new ResizeObserver(() => drawPiece()).observe(pieceBox.view);
  new IntersectionObserver((entries) => {
    turner.onScreen = entries[entries.length - 1].isIntersecting;
    spinPiece();
  }).observe(pieceBox.view);
  pieceBox.bolt.addEventListener("click", () => {
    const on = !pieceBox.box.hasAttribute("data-circuit");
    pieceBox.box.toggleAttribute("data-circuit", on);
    pieceBox.bolt.setAttribute("aria-pressed", String(on));
    pieceBox.bolt.setAttribute("aria-label", on ? "Show the pieces again" : "Show the circuit");
    spinPiece();
  });
}

// v3: the footer's message form. Two messages per visitor: the browser keeps a random visitor id and a count, and the
// counter Worker holds each id to two (and each address to a few a day). A message needs the same proof of work as a
// flip. The 500-character limit counts characters, not bytes, so accents, other scripts and emoji all count as one.
const MAIL_MAX = 500;
const MAIL_EACH = 2;
const mail = D.counter
  ? {
      open: root.querySelector("[data-mail]"),
      dialog: root.querySelector("[data-mail-dialog]"),
      form: root.querySelector("[data-mail-form]"),
      name: root.querySelector("[data-mail-name]"),
      text: root.querySelector("[data-mail-text]"),
      count: root.querySelector("[data-mail-count]"),
      status: root.querySelector("[data-mail-status]"),
      send: root.querySelector("[data-mail-send]"),
    }
  : null;
const stored = (key, fallback) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const store = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};
const visitorId = () => {
  let id = stored("um-visitor", "");
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) {
    id = crypto.randomUUID ? crypto.randomUUID() : [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
    store("um-visitor", id);
  }
  return id;
};
function mailLeft() {
  return Math.max(0, MAIL_EACH - Number(stored("um-messages", "0")));
}
function mailState(text = "") {
  const left = mailLeft();
  mail.status.textContent = text || (left ? `You can send ${left} message${left === 1 ? "" : "s"}.` : "You have sent your 2 messages. Thank you!");
  const locked = !left;
  mail.name.disabled = mail.text.disabled = locked;
  mail.send.disabled = locked || ![...mail.text.value.trim()].length || !mail.name.value.trim();
}
function mailCount() {
  const chars = [...mail.text.value];
  if (chars.length > MAIL_MAX) mail.text.value = chars.slice(0, MAIL_MAX).join("");
  mail.count.textContent = `${Math.min(chars.length, MAIL_MAX)} / ${MAIL_MAX}`;
  mail.count.toggleAttribute("data-full", chars.length >= MAIL_MAX);
}
if (mail && mail.dialog) {
  mail.open.addEventListener("click", () => {
    mailCount();
    mailState();
    mail.dialog.showModal();
    (mailLeft() ? mail.name : mail.dialog.querySelector("[data-mail-close]")).focus();
  });
  mail.dialog.querySelector("[data-mail-close]").addEventListener("click", () => mail.dialog.close());
  mail.dialog.addEventListener("keydown", (event) => event.key === "Escape" && mail.dialog.close());
  // a click on the dimmed backdrop (the dialog element itself, outside the form) closes it
  mail.dialog.addEventListener("click", (event) => event.target === mail.dialog && mail.dialog.close());
  mail.text.addEventListener("input", () => {
    mailCount();
    mailState(mail.status.dataset.keep ? mail.status.textContent : "");
  });
  mail.name.addEventListener("input", () => mailState());
  mail.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = mail.name.value.trim();
    const message = mail.text.value.trim();
    if (!name || !message || !mailLeft()) return;
    mail.send.disabled = true;
    mail.status.textContent = "Sending…";
    try {
      const { challenge, sig, bits } = await (await fetch(`${D.counter.url}/challenge`, { cache: "no-store" })).json();
      const nonce = await proveOf(challenge, bits);
      const response = await fetch(`${D.counter.url}/message`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, message, visitor: visitorId(), challenge, sig, nonce }) });
      const result = await response.json();
      if (result.sent) {
        store("um-messages", String(MAIL_EACH - result.left));
        mail.text.value = "";
        mailCount();
        mailState(`Sent. Thank you!${result.left ? ` You can send ${result.left} more.` : ""}`);
      } else if (result.error === "limit") {
        store("um-messages", String(MAIL_EACH));
        mailState();
      } else mailState(result.error === "busy" ? "Too many messages from your network today. Try again tomorrow." : "That did not go through. Please try again.");
    } catch {
      mailState("Could not send. Check your connection and try again.");
    }
  });
}

// v3: the parts list scrolls inside a short box with no scrollbar; its edges fade where there is more to see
const partsList = D.v3 ? root.querySelector(".um-partsfold .um-parts") : null;
if (partsList) {
  const edges = () => {
    partsList.toggleAttribute("data-more-above", partsList.scrollTop > 2);
    partsList.toggleAttribute("data-more-below", partsList.scrollTop + partsList.clientHeight < partsList.scrollHeight - 2);
  };
  partsList.addEventListener("scroll", edges, { passive: true });
  new ResizeObserver(edges).observe(partsList);
  edges();
}

// v3: the parts list and the manual fold open and shut with their height eased, not snapped
for (const fold of root.querySelectorAll(".um-fold")) {
  const head = fold.querySelector("summary");
  const body = fold.querySelector(".um-fold-body");
  let motion = null;
  head.addEventListener("click", (event) => {
    if (still.matches || !body.animate) return;
    event.preventDefault();
    const opening = !fold.open || fold.hasAttribute("data-shut");
    // a closed <details> still reports its content's height in some browsers; from shut, start at 0
    const from = fold.open ? body.getBoundingClientRect().height : 0;
    if (motion) motion.cancel();
    if (opening) {
      fold.open = true;
      fold.removeAttribute("data-shut");
    } else fold.setAttribute("data-shut", "");
    const to = opening ? body.scrollHeight : 0;
    motion = body.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 420, easing: "cubic-bezier(.32,.72,0,1)" });
    motion.onfinish = () => {
      motion = null;
      if (!opening) {
        fold.open = false;
        fold.removeAttribute("data-shut");
      }
    };
  });
}

if (D.v3 && STEPS.length > 1) {
  for (const group of springs) for (const one of Object.values(group)) Object.assign(one, { x: 1, v: 0, target: 1, pending: null });
  goals.fill(1);
  stepTarget = STEPS.length;
  apart = wantApart = openPending = true;
}
readScale();
paintDynamic();
paintCircuit();
place();
say(status());
describe();
labelApart();
showInfo(null);
stage.setAttribute("data-ready", "");
// v3 zoom: a pinch on a touch screen, a trackpad pinch or Ctrl + wheel over a drawing zooms into it, up to ZOOM_MAX,
// around the fingers or the pointer. The page itself does not zoom. When the gesture ends the drawing eases back to
// its normal size. Its box clips it, and a thin mask fades it out before the edge. The main figure and the piece view
// each get one.
const ZOOM_MAX = 2.6;
// paint(zoom), when given, redraws the content itself (a canvas) instead of scaling it with a CSS transform
function zoomable(view, content, host, paint = null) {
  const zoom = { z: 1, x: 0, y: 0, frame: 0, wheel: 0, pinch: null, base: 1 };
  const apply = () => {
    const { z, x, y } = zoom;
    if (paint) paint(zoom);
    else content.style.transform = z === 1 && !x && !y ? "" : `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${z.toFixed(4)})`;
    host.toggleAttribute("data-zoomed", z > 1.01);
  };
  const clampPan = () => {
    const w = view.clientWidth;
    const h = view.clientHeight;
    zoom.x = clampTo(zoom.x, w - w * zoom.z, 0);
    zoom.y = clampTo(zoom.y, h - h * zoom.z, 0);
  };
  const localOf = (clientX, clientY) => {
    const r = view.getBoundingClientRect();
    return [clientX - r.left, clientY - r.top];
  };
  const zoomAt = ([px, py], z) => {
    const next = clampTo(z, 1, ZOOM_MAX);
    zoom.x = px - ((px - zoom.x) * next) / zoom.z;
    zoom.y = py - ((py - zoom.y) * next) / zoom.z;
    zoom.z = next;
    clampPan();
    apply();
  };
  const hold = () => {
    cancelAnimationFrame(zoom.frame);
    zoom.frame = 0;
  };
  const release = () => {
    hold();
    if (still.matches) {
      Object.assign(zoom, { z: 1, x: 0, y: 0 });
      return apply();
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
      apply();
      zoom.frame = done ? 0 : requestAnimationFrame(back);
    };
    zoom.frame = requestAnimationFrame(back);
  };
  // trackpad pinches arrive as wheel events with ctrlKey set (Chrome, Edge, Firefox); a mouse needs Ctrl held
  view.addEventListener(
    "wheel",
    (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      hold();
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      zoomAt(localOf(event.clientX, event.clientY), zoom.z * Math.exp(-delta * 0.01));
      clearTimeout(zoom.wheel);
      zoom.wheel = setTimeout(release, 180);
    },
    { passive: false },
  );
  // Safari's trackpad pinch; on iOS the touch handlers below do the work and these only stop the page zooming
  view.addEventListener("gesturestart", (event) => {
    event.preventDefault();
    if (zoom.pinch) return;
    hold();
    zoom.base = zoom.z;
  });
  view.addEventListener("gesturechange", (event) => {
    event.preventDefault();
    if (!zoom.pinch) zoomAt(localOf(event.clientX, event.clientY), zoom.base * event.scale);
  });
  view.addEventListener("gestureend", (event) => {
    event.preventDefault();
    if (!zoom.pinch) release();
  });
  const pinchOf = (touches) => {
    const [a, b] = [touches[0], touches[1]];
    return { at: localOf((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2), d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) };
  };
  view.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length !== 2) return;
      event.preventDefault();
      hold();
      const { at, d } = pinchOf(event.touches);
      zoom.pinch = { d, z: zoom.z, cx: (at[0] - zoom.x) / zoom.z, cy: (at[1] - zoom.y) / zoom.z };
    },
    { passive: false },
  );
  view.addEventListener(
    "touchmove",
    (event) => {
      if (!zoom.pinch || event.touches.length < 2) return;
      event.preventDefault();
      const { at, d } = pinchOf(event.touches);
      zoom.z = clampTo((zoom.pinch.z * d) / Math.max(1, zoom.pinch.d), 1, ZOOM_MAX);
      zoom.x = at[0] - zoom.pinch.cx * zoom.z;
      zoom.y = at[1] - zoom.pinch.cy * zoom.z;
      clampPan();
      apply();
    },
    { passive: false },
  );
  const endPinch = (event) => {
    if (!zoom.pinch || event.touches.length >= 2) return;
    zoom.pinch = null;
    release();
  };
  view.addEventListener("touchend", endPinch);
  view.addEventListener("touchcancel", endPinch);
  return zoom;
}
const viewBox = stage.querySelector(".um-view");
const zoom = viewBox ? zoomable(viewBox, svg, stage) : null;

// probe(world, piece, rides): the callout ids of the part painted on top at a world point (glass skipped), for checks.
const probe = (world, id, rides = null) => {
  const [x, y] = screenOf(world, id, camView(), rides);
  const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
  const hits = [...new Set(document.elementsFromPoint(p.x, p.y).map((el) => el.closest(".it")).filter(Boolean))];
  const top = hits.find((it) => !it.querySelector(".um-glass"));
  return top ? top.dataset.c || `-${top.dataset.i}` : "";
};
// pieceAt(degrees): stop the piece view's turn and draw it at that angle, for stills
const pieceAt = (degrees) => {
  cancelAnimationFrame(turner.frame);
  turner.frame = 0;
  turner.angle = (degrees * Math.PI) / 180;
  drawPiece();
};
window.__um = { st, piece, springs, flip, setApart, setStep, nextStep, select, idle, assembled, setAuto, setCalls, calls, probe, zoom, prove: proveOf, pieceAt };
