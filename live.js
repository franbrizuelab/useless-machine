const D = __DATA__;
const camP = D.P;
const root = document.querySelector(".um");
const stage = root.querySelector(".um-stage");
const svg = stage.querySelector("svg");
const engine = svg.querySelector(".um-engine");
const over = svg.querySelector(".um-over");
const readout = root.querySelector("[data-readout]");
const note = root.querySelector("[data-note]");
const flipBtn = root.querySelector("[data-flip]");
const apartBtn = root.querySelector("[data-apart]");
const partButtons = [...root.querySelectorAll(".um-part")];
const cc = root.querySelector(".um-circuit svg");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clampTo = (value, low, high) => Math.min(high, Math.max(low, value));
const ids = Object.keys(D.pieces);
const piece = Object.fromEntries(ids.map((id) => [id, { x: 0, v: 0, target: 0, pending: null }]));
const SVGNS = "http://www.w3.org/2000/svg";

const nodes = [...engine.querySelectorAll(".it")].map((el) => {
  const m = el.dataset.m.split(",").map(Number);
  return { el, key: Number(el.dataset.k), m, piece: el.dataset.piece, lift: m[0] * D.V[0] + m[1] * D.V[1] + m[2] * D.V[2], shown: "", calls: (el.dataset.c || "").split(" ").filter(Boolean) };
});
let order = nodes.map((_, index) => index);

const dyn = {};
engine.querySelectorAll("[data-dyn]").forEach((el) => {
  dyn[el.dataset.dyn] = [...el.querySelectorAll("path")];
});
for (const name of ["pinion", "stage", "second", "out"]) if (!dyn[name]) dyn[name] = [];

const st = M.fresh();
let lastPhi = null;
let lastTh = null;
let apart = false;
let wantApart = false;
let pendingFlip = false;
let selected = null;
let pinned = null;
let last = 0;
let clock = 0;
let frame = 0;
let visible = false;
let lastInput = -1e9;
let tourTimer = 0;
const now = () => performance.now();

function paintDynamic() {
  if (st.phi !== lastPhi) {
    const parts = dynamicParts(camP, { phi: st.phi, th: st.th });
    for (const name of ["pinion", "stage", "second", "out", "arm", "pin", "leaf"]) writeDs(name, partDs(parts[name]));
    lastPhi = st.phi;
  }
  if (st.th !== lastTh) {
    writeDs("lever", partDs(leverPart(camP, st.th)));
    lastTh = st.th;
  }
}
function writeDs(name, ds) {
  const paths = dyn[name];
  for (let i = 0; i < ds.length; i++) if (paths[i].getAttribute("d") !== ds[i]) paths[i].setAttribute("d", ds[i]);
}

const camView = () => {
  const cam = clampTo(piece.lid.x, 0, 1.25);
  const k = 1 + (D.expl.s - 1) * cam;
  return { cam, k, ox: (D.W / 2) * (1 - k) + D.expl.tx * cam, oy: (D.H / 2) * (1 - k) + D.expl.ty * cam };
};
const screenOf = (world, id, view) => {
  const s = piece[id].x;
  const m = D.pieces[id].move;
  const p = iso([world[0] + m[0] * s, world[1] + m[1] * s, world[2] + m[2] * s], camP);
  return [p[0] * view.k + view.ox, p[1] * view.k + view.oy];
};

function place() {
  for (const node of nodes) {
    const share = piece[node.piece].x;
    const tx = (D.EX[0] * node.m[0] + D.EY[0] * node.m[1] + D.EZ[0] * node.m[2]) * share;
    const ty = (D.EX[1] * node.m[0] + D.EY[1] * node.m[1] + D.EZ[1] * node.m[2]) * share;
    const text = share === 0 ? "" : `translate(${tx.toFixed(2)} ${ty.toFixed(2)})`;
    if (text !== node.shown) {
      node.shown = text;
      if (text) node.el.setAttribute("transform", text);
      else node.el.removeAttribute("transform");
    }
  }
  const next = nodes.map((_, index) => index).sort((a, b) => nodes[a].key + nodes[a].lift * piece[nodes[a].piece].x - (nodes[b].key + nodes[b].lift * piece[nodes[b].piece].x));
  if (next.some((index, at) => index !== order[at])) {
    const fragment = document.createDocumentFragment();
    for (const index of next) fragment.appendChild(nodes[index].el);
    engine.appendChild(fragment);
    order = next;
  }
  const view = camView();
  engine.setAttribute("transform", view.cam === 0 ? "" : `translate(${view.ox.toFixed(2)} ${view.oy.toFixed(2)}) scale(${view.k.toFixed(4)})`);
  if (view.cam === 0) engine.removeAttribute("transform");
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
  if (call.dyn === "lever") {
    const [x, z] = turnPoint([M.LEVER.length - 0.6, 0], M.LEVER.x, M.LEVER.pivotZ, Math.PI / 2 - st.th * M.RAD);
    return [x, M.Y.lever[1], z];
  }
  return call.anchor;
};

let badgeK = 1;
const readScale = () => {
  badgeK = clampTo((0.8 * D.W) / Math.max(1, stage.clientWidth), 1, 2.3);
};
new ResizeObserver(() => {
  readScale();
  place();
}).observe(stage);

function paintCalls(view) {
  const left = [];
  const right = [];
  for (const call of calls) {
    const p = screenOf(worldOf(call), call.piece, view);
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
function paintCircuit() {
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
const assembled = () => ids.every((id) => Math.abs(piece[id].x) < 0.003 && !piece[id].pending && piece[id].target === 0);
const springsMoving = () => ids.some((id) => Math.abs(piece[id].x - piece[id].target) > 0.002 || piece[id].pending);

function setApart(on) {
  wantApart = on;
  if (apart === on) {
    if (!on) pendingFlip = pendingFlip && true;
    describe();
    return;
  }
  if (!idle()) {
    say("waiting for the arm to finish");
    note.textContent = on ? "taking apart once the arm is home" : "";
    run();
    return;
  }
  apart = on;
  const goal = on ? 1 : 0;
  let index = 0;
  for (const id of on ? D.stagger : [...D.stagger].reverse()) {
    if (!piece[id]) continue;
    if (piece[id].target === goal) piece[id].pending = null;
    else piece[id].pending = { value: goal, at: clock + (still.matches ? 0 : index++ * D.spring.stagger) };
  }
  apartBtn.textContent = on ? "Put it together" : "Take apart";
  flipBtn.disabled = false;
  describe();
  run();
}

function flip(fromTour = false) {
  if (!fromTour) lastInput = now();
  if (apart || !assembled()) {
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
  describe();
}

function say(text) {
  if (readout.textContent !== text) readout.textContent = text;
}
function describe() {
  const call = selected ? D.calls.find((c) => String(c.id) === String(selected)) : null;
  const text = call ? `${call.id} ${call.name}. ${call.say}` : apart ? "Apart: lid, mechanism, battery pack and base." : st.th < 0 ? "Switch on." : "Switch off, arm home.";
  if (stage.getAttribute("aria-description") !== text) stage.setAttribute("aria-description", text);
}

function status() {
  const swing = ((M.HOME - st.phi) / M.RAD);
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
  for (const id of ids) moving = steer(piece[id], dt, calm) || moving;
  const leaving = wantApart && !apart && idle();
  if (leaving) setApart(true);
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
  paintCircuit();
  say(status());
  announce();
  flipBtn.setAttribute("data-state", st.th < 0 ? "on" : "off");
  const busy = moving || !idle() || (wantApart !== apart) || pendingFlip;
  frame = visible && busy ? requestAnimationFrame(tick) : 0;
  if (!busy) afterIdle();
}

function run() {
  if (!frame && visible) {
    last = 0;
    frame = requestAnimationFrame(tick);
  }
}

function afterIdle() {
  clearTimeout(tourTimer);
  if (still.matches || apart || wantApart) return;
  const wait = Math.max(1800, lastInput + 3600 - now());
  tourTimer = setTimeout(() => {
    if (visible && idle() && assembled() && now() - lastInput > 3500) flip(true);
    else afterIdle();
  }, wait);
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
apartBtn.addEventListener("click", () => {
  lastInput = now();
  setApart(!wantApart);
});
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
    setApart(!wantApart);
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
window.__um = { st, piece, flip, setApart, select, idle, assembled };
