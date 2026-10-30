const RAD = Math.PI / 180;
const ARM = { length: 46, bend: 34 * RAD, hub: 7, root: 4.4, tip: 4.0 };
const KAPPA = Math.tan(ARM.bend) / ARM.length;
const TIP = [ARM.length, -0.5 * KAPPA * ARM.length * ARM.length];
const PIN = { r: 1.5, at: TIP, reach: Math.hypot(TIP[0], TIP[1]), lean: Math.atan2(TIP[1], TIP[0]) };

const armShape = () => {
  const { length, hub, root, tip } = ARM;
  const centre = (s) => [s, -0.5 * KAPPA * s * s];
  const slope = (s) => -KAPPA * s;
  const rOf = (s) => {
    if (s < 11) {
      const t = s / 11;
      return hub + (root - hub) * t * t * (3 - 2 * t);
    }
    return root + (tip - root) * ((s - 11) / (length - 11));
  };
  const dr = (s) => (rOf(s + 0.01) - rOf(s - 0.01)) / 0.02;
  const frame = (s) => {
    const m = slope(s);
    const norm = Math.hypot(1, m);
    return { t: [1 / norm, m / norm], n: [-m / norm, 1 / norm] };
  };
  const side = (s, sign) => {
    const [cx, cz] = centre(s);
    const { t, n } = frame(s);
    const r = rOf(s);
    const rp = dr(s);
    const k = Math.sqrt(Math.max(0, 1 - rp * rp));
    return [cx + r * (-rp * t[0] + sign * k * n[0]), cz + r * (-rp * t[1] + sign * k * n[1])];
  };
  const arc = (cx, cz, r, from, to, count) => Array.from({ length: count + 1 }, (_, i) => [cx + r * Math.cos(from + ((to - from) * i) / count), cz + r * Math.sin(from + ((to - from) * i) / count)]);
  const steps = 26;
  const left = Array.from({ length: steps + 1 }, (_, i) => side((length * i) / steps, 1));
  const right = Array.from({ length: steps + 1 }, (_, i) => side((length * i) / steps, -1));
  const tail = frame(length);
  const tipAngle = Math.atan2(tail.t[1], tail.t[0]);
  const head = frame(0);
  const headAngle = Math.atan2(head.t[1], head.t[0]);
  const [tx, tz] = centre(length);
  const ring = [...left, ...arc(tx, tz, rOf(length), tipAngle + Math.PI / 2, tipAngle - Math.PI / 2, 10), ...right.reverse(), ...arc(0, 0, hub, headAngle - Math.PI / 2, headAngle - Math.PI * 1.5, 14)];
  return { ring, side, centre };
};
const ARM_SHAPE = armShape();
const S = [8, 28];
const GEAR = {
  module: 1.2,
  pinion: { teeth: 8, phase: 155 * RAD },
  stage: { teeth: 24, phase: -17.5 * RAD },
  second: { teeth: 8, phase: 205 * RAD },
  out: { teeth: 24, phase: 32.5 * RAD },
};
const pitchR = (teeth) => (GEAR.module * teeth) / 2;
const SPAN = pitchR(24) + pitchR(8);
const CENTRE = {
  out: S,
  stage: [S[0] + SPAN * Math.cos(25 * RAD), S[1] + SPAN * Math.sin(25 * RAD)],
};
CENTRE.pinion = [CENTRE.stage[0] + SPAN * Math.cos(-25 * RAD), CENTRE.stage[1] + SPAN * Math.sin(-25 * RAD)];
const LEVER = { half: 1.1, length: 14, throw: 28, pivotZ: 69.6 };
LEVER.ring = [[2.2, -1.5], [4.6, -1.4], [LEVER.length - 1.4, -1.0], [LEVER.length, -0.5], [LEVER.length, 0.5], [LEVER.length - 1.4, 1.0], [4.6, 1.4], [2.2, 1.5]];
const CONTACT_Z = S[1] + PIN.reach * Math.sin(100 * RAD);
const CONTACT_X = S[0] + PIN.reach * Math.cos(100 * RAD);
LEVER.x = CONTACT_X + PIN.r + LEVER.half + (CONTACT_Z - LEVER.pivotZ) * Math.tan(LEVER.throw * RAD);
const SWITCH = { hingeX: -35, leaf: 17, tilt: 14 * RAD, sense: 2.5 * RAD, reachU: 26 };
const Y = { plate: [14, 17], g1: [17, 19.5], g2: [19.5, 22], spacer: [22, 24], arm: [24, 27], lever: [13.4, 15.6], pin: [14.4, 24], leaf: [23, 28], body: [22.3, 28.7], toggle: 14.5 };
const HOME = 180 * RAD;
const STOP_HOME = HOME;
const STOP_OUT = 84 * RAD;
const VOLTS = 4.5;
const SPEED = 70 * RAD;

const pinAt = (phi) => {
  const ang = phi + PIN.lean;
  return [S[0] + PIN.reach * Math.cos(ang), S[1] + PIN.reach * Math.sin(ang)];
};

const FOOT = ARM_SHAPE.side(SWITCH.reachU, 1);
const feeler = (phi) => {
  const u = FOOT[0];
  const v = FOOT[1];
  return [S[0] + u * Math.cos(phi) - v * Math.sin(phi), S[1] + u * Math.sin(phi) + v * Math.cos(phi)];
};
const HOME_FEELER = feeler(HOME);
SWITCH.thick = 0.9;
SWITCH.rest = 0.12;
SWITCH.flatZ = HOME_FEELER[1] - SWITCH.thick - SWITCH.rest;
SWITCH.bodyTop = SWITCH.flatZ;
SWITCH.hingeZ = SWITCH.flatZ;
const leafTilt = (phi) => {
  const [fx, fz] = feeler(phi);
  const run = Math.max(1, fx - SWITCH.hingeX);
  return Math.min(SWITCH.tilt, Math.max(0, Math.atan2(fz - SWITCH.thick - SWITCH.hingeZ, run)));
};
const limitClosed = (phi) => leafTilt(phi) > SWITCH.sense;

const fresh = () => ({ phi: STOP_HOME, w: 0, th: LEVER.throw, thw: 0, volts: 0, stalled: false, dz: 0 });

function leverPush(state) {
  const [px, pz] = pinAt(state.phi);
  const rise = pz - state.dz - LEVER.pivotZ;
  if (rise < 1.5 || rise > LEVER.length) return;
  const need = Math.atan((px + PIN.r + LEVER.half - LEVER.x) / rise) / RAD;
  if (state.th < need && need < LEVER.throw) {
    state.th = need;
    if (state.thw < 0) state.thw = 0;
  }
}

function step(state, dt) {
  const on = state.th < 0;
  const target = on ? VOLTS : limitClosed(state.phi) ? -VOLTS : 0;
  state.volts += (target - state.volts) * (1 - Math.exp(-dt / 0.03));
  if (Math.abs(state.volts - target) < 0.02) state.volts = target;
  const aim = (-state.volts / VOLTS) * SPEED;
  state.w += (aim - state.w) * (1 - Math.exp(-dt / 0.07));
  state.phi += state.w * dt;
  state.stalled = false;
  if (state.phi >= STOP_HOME) {
    state.phi = STOP_HOME;
    state.w = Math.min(state.w, 0);
  }
  if (state.phi <= STOP_OUT) {
    state.phi = STOP_OUT;
    state.w = Math.max(state.w, 0);
    state.stalled = on;
  }
  const sign = state.th >= 0 ? 1 : -1;
  const stop = sign * LEVER.throw;
  state.thw += (3200 * (stop - state.th) - 90 * state.thw) * dt;
  state.th += state.thw * dt;
  if (Math.abs(state.th) > LEVER.throw) {
    state.th = Math.sign(state.th) * LEVER.throw;
    state.thw = 0;
  }
  leverPush(state);
  return Math.abs(state.w) > 1e-3 || Math.abs(state.thw) > 1e-2 || Math.abs(state.volts - target) > 1e-3;
}

function flipOn(state) {
  if (state.th < 0) return false;
  state.th = -0.4;
  state.thw = -260;
  return true;
}

export const M = { RAD, Y, ARM, ARM_SHAPE, CONTACT_X, CONTACT_Z, KAPPA, TIP, PIN, S, GEAR, pitchR, CENTRE, LEVER, SWITCH, HOME, STOP_HOME, STOP_OUT, VOLTS, SPEED, pinAt, feeler, FOOT, leafTilt, limitClosed, fresh, step, flipOn };
