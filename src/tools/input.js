// The hand. Every verb writes to app.edits through a spring, once a frame, and the picture does all the moving.
//
//   move            Press    a ball under the sheet, about 250 ms behind the cursor
//   drag            Push     comb the sheet; dents stay and relax slowly
//   scroll, pinch   Journey  log zoom about the cursor
//   sideways, shift+scroll   Duty: thinner or fatter lines, stopping short of solid
//   alt+drag        Sheet    a lifted copy XOR-ed on top, with detents where the fringes lock into rosettes
// and whatever's chosen on the effects bar (./effects.js) takes the place of Press and Push.
import { OFF, SNAP, FAMILIES } from '../pattern/layout.js';
import { clamp, smoother } from '../score/curves.js';
import { fillSlot } from '../score/frame.js';
import { Spring } from './spring.js';
import { detentsFor, magnet } from './moire.js';
import { Effects } from './effects.js';

const PRESS_AMOUNT = -0.46, PRESS_R = 0.46, PRESS_LAG = 8, PRESS_IDLE = 3;   // lag: a critical spring trails a moving target by 2/w
const MEMORY = 20;                  // seconds for a dent to relax by 1/e
const HEAL_TICK = 1 / 6;            // the push texture is half-float, so it heals in steps big enough to register
const BRUSH_R = 0.1;                // in fractions of the picture's height
const J_RATE = 2.2;                 // ln-units per second, Journey's top speed
const DUTY_RATE = 0.95;             // corridor units per second. One room is 2 units.
const DWELL = 0.07;                 // how far either side of a room's end the frame sits exactly solid
const SHEET_LIFT = 0.55;            // seconds for the copy to come up or go down
const ARC_SWING = 44;               // a held pattern swings through its long move with this period

const hand = {
  app: null,
  listeners: {},
  on(name, fn) { (this.listeners[name] ||= []).push(fn); },
  emit(name, ...a) { for (const f of this.listeners[name] || []) f(...a); },
  calm: false,
  corridor: false,    // the hand has taken the threshold; the pattern is held
  speed: 1,           // flow, the knob
  spinRate: 0,        // radians per second, the knob
  readout: null,      // what the sheet's doing, for the interface
  dragging: false,
};
export { hand };

let app, canvas, stage, R, edits, fx;
const scratch = new Float32Array(4096);

// where the hand is
const m = { cx: 0, cy: 0, over: false, last: -1e9, seen: false, shift: false };
const press = { x: new Spring(0, PRESS_LAG), y: new Spring(0, PRESS_LAG), a: new Spring(0, 5) };

// Push
const push = { on: false, x: new Spring(0, 40), y: new Spring(0, 40), px: 0, py: 0, healAcc: 0, boostUntil: 0 };

// Journey
const J = { s: new Spring(0, 7), target: 0, lo: -3, hi: 5, jx: 0, jy: 0, touched: -1e9, lift: new Spring(0, 1.2), prev: 0, clearing: false };

// Duty: the threshold under the hand
const D = { s: new Spring(0, 7), target: 0, room: 0, base: 0, touched: -1e9 };

// Sheet
const S = {
  active: false, on: false, k: 0, lift: 0,
  rotH: 0, rot: new Spring(0, 30), rx: 0, ry: 0,
  shiftH: 0, perpH: 0, sx: new Spring(0, 30), sy: new Spring(0, 30),
  pivot: [0, 0], detents: [], lastCx: 0, lastCy: 0, dir: [1, 0],
};

// Knobs: path -> { s: Spring, target, release }
const knobs = new Map();
const speedS = new Spring(1, 5), spinS = new Spring(0, 2);
let clearingSpin = false;

let lastAsked = null, curPat = null, curG = null, lastNow = 0, lastT = 0, wheelAxis = null, wheelLast = -1e9;

// A veil: the threshold closes to a solid, something is swapped unseen, and it opens again. Works whatever the film is doing.
const V = { phase: 0, t: 0, pol: 1, fn: null, close: 1.5, open: 2.4 };
const nowS = () => performance.now() / 1000;

function toPicture(cx, cy) {
  const r = canvas.getBoundingClientRect();
  return [(cx - r.left - r.width / 2) / r.height * 2, -(cy - r.top - r.height / 2) / r.height * 2];
}

// The finest cycle the current numbers draw, in cycles per picture unit, before the view's scale. An estimate is enough.
function fineness(A) {
  let k = 0;
  for (let i = 0; i < 4; i++) {
    if (!A[OFF[`f${i}.on`]]) continue;
    const g = n => Math.abs(A[OFF[`f${i}.${n}`]]);
    k = Math.max(k, Math.hypot(g('x'), g('y')) + g('r1') + g('r2') + (g('l1') + g('l2')) / 0.5 + (g('t1') + g('t2')) / 3.14);
  }
  return Math.max(k * Math.max(A[OFF.freq], 1e-3), 0.2);
}
// ...and on screen, with the hand's zoom, which is a view of the whole frame and not in the numbers.
const periodPx = A => (canvas.height / 2) * Math.max(A[OFF.scale], 1e-5) * Math.exp(edits.journey || 0) / fineness(A);

// Where a point of the frame lands on the sheet, through the hand's view.
function toSheet([x, y]) {
  const z = Math.exp(-(edits.journey || 0)), c = Math.cos(edits.spin || 0), s = Math.sin(edits.spin || 0);
  return [(c * x + s * y) * z + (edits.jx || 0), (-s * x + c * y) * z + (edits.jy || 0)];
}

// ------------------------------------------------------------------------------------------------- taking hold of a pattern
// The hand takes the threshold from whatever the gesture was doing, and nothing on screen moves as it does.
function takeHold() {}

function resetForPattern(pat, announce = true) {
  curPat = pat; lastAsked = null;
  J.s.set(0); J.target = 0; J.jx = 0; J.jy = 0; J.prev = 0; J.clearing = false;
  knobs.clear();
  edits.over = {};
  if (announce) hand.emit('pattern', pat);
}

// ----------------------------------------------------------------------------------------------------------------- verbs
function dutyWheel(dx) {
  D.touched = nowS();
  D.target = clamp(D.target + dx * 0.0022, -0.85, 0.85);
}

function journeyWheel(dy, pinch) {
  J.touched = nowS(); J.clearing = false;
  let d = -dy * (pinch ? 0.012 : 0.002);
  // There's no wall. It just gets reluctant, and turning round is immediate because no slack is kept.
  const room = d > 0 ? J.hi - J.target : J.target - J.lo;
  d *= Math.max(0.015, smoother(room / 1.4));
  J.target += d;
}

function beginSheet(e) {
  const A = R.slotA;
  S.active = true;
  S.lastCx = e.clientX; S.lastCy = e.clientY;
  S.detents = detentsFor(A);
  const f = [A[OFF['f0.x']], A[OFF['f0.y']]], l = Math.hypot(f[0], f[1]);
  S.dir = l > 1e-3 ? [f[0] / l, f[1] / l] : [1, 0];
  const a = A[OFF.rot];
  S.dir = [Math.cos(a) * S.dir[0] - Math.sin(a) * S.dir[1], Math.sin(a) * S.dir[0] + Math.cos(a) * S.dir[1]];
  if (!S.on) {
    // First lift: pivot under the hand, already turned enough to show a fringe about a third of the frame across.
    S.on = true;
    S.pivot = toSheet(toPicture(e.clientX, e.clientY));
    const a0 = clamp(periodPx(A) / (0.33 * canvas.height), 2 * Math.PI / 180, 0.4);
    let best = a0, bd = 9;
    for (const d of S.detents) { if (d.a > 0 && Math.abs(d.a - a0) < bd) { bd = Math.abs(d.a - a0); best = d.a; } }
    S.rotH = best; S.rot.set(best); S.shiftH = 0; S.perpH = 0; S.sx.set(0); S.sy.set(0);
    hand.emit('sheet', true);
  }
}

function moveSheet(e) {
  const dx = e.clientX - S.lastCx, dy = e.clientY - S.lastCy;
  S.lastCx = e.clientX; S.lastCy = e.clientY;
  const h = canvas.clientHeight;
  // Vertical turns it, horizontal slides it along the lines' own normal. A pixel is a fringe's long way, so both are fine-geared.
  S.rotH += -dy * 0.0014;
  if (e.shiftKey) S.perpH += dx * (2 / h) * 0.3;
  else S.shiftH += dx * (2 / h) * 0.3;
}

function dropSheet() {
  if (!S.on) return;
  S.on = false; S.active = false;
  hand.emit('sheet', false);
}

function tickPress(dt, now) {
  const [x, y] = toPicture(m.cx, m.cy);
  const alive = m.over && now - m.last < PRESS_IDLE && !S.active && !fx.current;   // the ball is the plain hand's
  const k = push.on ? 0.45 : 1;
  press.x.step(x, dt); press.y.step(y, dt);
  press.a.step(alive ? PRESS_AMOUNT * k : 0, dt, alive ? 5 : 1.6);
  if (Math.abs(press.a.x) < 1e-4 && !alive) press.a.set(0);
  edits.pressX = press.x.x; edits.pressY = press.y.x; edits.press = press.a.x; edits.pressR = PRESS_R;
}

function tickPush(dt, now) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (push.on) {
    const tx = m.cx, ty = m.cy;
    push.x.step(tx, dt); push.y.step(ty, dt);
    const dx = push.x.x - push.px, dy = push.y.x - push.py, len = Math.hypot(dx, dy);
    if (len > 0.01) {
      const n = clamp(Math.ceil(len / (BRUSH_R * h * 0.4)), 1, 12);
      for (let i = 1; i <= n; i++) {
        const u = i / n, cx = push.px + dx * u, cy = push.py + dy * u;
        R.brush({ x: cx / w, y: 1 - cy / h, r: BRUSH_R * (fx.current === 'comb' ? 1.8 : 1), dx: -(dx / n) * (2 / h), dy: (dy / n) * (2 / h), on: true, heal: 0 });
      }
      push.px = push.x.x; push.py = push.y.x;
    }
  }
  // Relaxing, in steps a half-float can hold
  push.healAcc += dt;
  let heal = 0;
  if (!push.on && push.healAcc >= HEAL_TICK) {
    const mem = now < push.boostUntil ? 0.5 : MEMORY;
    heal = 1 - Math.exp(-push.healAcc / mem);
    push.healAcc = 0;
  }
  app.brush = { on: false, heal };
}

function tickJourney(dt, now, A) {
  const song = !!stage.score.song && !stage.staticOn;
  // Overlay during a film: it eases back on its own. In static nothing goes back on its own.
  if (song && now - J.touched > 2) J.target += (0 - J.target) * (1 - Math.exp(-dt / 2.5));
  const period = periodPx(A);
  const here = J.s.x + J.lift.x;
  const floor = hand.calm ? 12 : 2.6;
  J.lo = here - Math.log(Math.max(period / floor, 1e-3));
  J.hi = here + Math.log(2.5 * canvas.height / period);
  J.lo = Math.min(J.lo, here); J.hi = Math.max(J.hi, here);
  const before = J.s.x, liftWas = J.lift.x;
  J.s.step(J.target, dt, J.clearing ? 2.2 : 7, J_RATE);
  // Calm keeps fine lines at a comfortable size, whatever the pattern's own move is doing.
  const unlifted = period * Math.exp(-J.lift.x);
  J.lift.step(hand.calm ? Math.max(0, Math.log(12 / unlifted)) : 0, dt, 1.2);
  if (J.clearing || song && now - J.touched > 2) {
    // Going back: straight out about one point on the screen, pan and zoom arriving together. Pan on its own, zoomed right in, would whip the view sideways.
    const z0 = 1 - Math.exp(-(before + liftWas)), z1 = 1 - Math.exp(-(J.s.x + liftWas));
    const k = Math.abs(z0) > 0.02 && z1 / z0 > 0 ? Math.min(1, z1 / z0) : Math.exp(-dt * (J.clearing ? 1.8 : 0.4));
    J.jx *= k; J.jy *= k;
    if (J.clearing && Math.abs(J.s.x) < 1e-3 && Math.abs(J.jx) + Math.abs(J.jy) < 1e-4) { J.s.set(0); J.target = 0; J.jx = 0; J.jy = 0; J.clearing = false; }
  } else if (J.s.x !== before) {
    // about the cursor: keep the point under it where it is
    const [cx, cy] = m.over ? toPicture(m.cx, m.cy) : [0, 0], a = -spinS.x;
    const f = Math.exp(-(before + liftWas)) - Math.exp(-(J.s.x + liftWas));
    J.jx += (Math.cos(a) * cx - Math.sin(a) * cy) * f;
    J.jy += (Math.sin(a) * cx + Math.cos(a) * cy) * f;
  }
  edits.journey = J.s.x + J.lift.x;
  edits.jx = J.jx; edits.jy = J.jy;
  edits.aspect = canvas.width / canvas.height;
}

function tickDuty(dt, now, t, G, solid) {
  // The threshold under the hand: thinner or fatter lines, short of solid. It eases back on its own with a song playing.
  if (stage.score.song && !stage.staticOn && now - D.touched > 2) D.target += (0 - D.target) * (1 - Math.exp(-dt / 2.5));
  D.target = clamp(D.target, -0.85, 0.85);
  D.s.step(D.target, dt, 7, hand.calm ? DUTY_RATE * 0.5 : DUTY_RATE);
  edits.duty = D.s.x * solid;
}

function tickSheet(dt) {
  // It arrives in a set time and exactly, because this mixes ink: a spring's long tail would hang about as a grey ghost.
  S.k = clamp(S.k + (S.on ? dt : -dt) / SHEET_LIFT);
  S.lift = smoother(S.k);
  if (!S.on && S.k <= 0) { edits.sheet = 0; hand.readout = null; return; }
  const mg = magnet(S.rotH, S.detents.length ? S.detents : [{ a: 0, w: 0.002 }]);
  S.rot.step(mg.x, dt);
  // A shift of nothing is a detent too, a few hairs wide
  const dz = v => { const w = 0.004, a = Math.abs(v); if (a >= w) return v; const u = a / w; return Math.sign(v) * w * u * u * (2 - u); };
  const sh = dz(S.shiftH), pe = dz(S.perpH);
  S.sx.step(S.dir[0] * sh - S.dir[1] * pe, dt); S.sy.step(S.dir[1] * sh + S.dir[0] * pe, dt);
  const a = S.rot.x, c = Math.cos(a), s = Math.sin(a), [px, py] = S.pivot;
  // rotate about the pivot, then slide
  edits.sheetRot = a;
  edits.sheetX = px - (c * px - s * py) + S.sx.x;
  edits.sheetY = py - (s * px + c * py) + S.sy.x;
  edits.sheet = S.lift;
  hand.readout = S.active ? { deg: a * 180 / Math.PI, locked: mg.locked } : null;
}

function tickKnobs(dt) {
  if (!knobs.size) return;
  const nat = knobs.size ? naturals() : null;
  for (const [path, k] of knobs) {
    const off = OFF[path];
    if (k.release) {
      k.s.step(nat[off], dt, 3);
      if (Math.abs(k.s.x - nat[off]) < 1e-3 * (1 + Math.abs(nat[off]))) { knobs.delete(path); delete edits.over[path]; continue; }
    } else if (SNAP.has(off)) k.s.set(k.target);
    else k.s.step(k.target, dt, 16);
    (edits.over ||= {})[path] = k.s.x;
  }
}

function tickSpeed(dt, t, G) {
  const eff = hand.speed * (hand.calm ? 0.4 : 1);
  speedS.step(eff, dt, 4);
  const sc = stage.score;
  if (!sc.phi) return;
  let st = sc.__hand;
  if (!st || sc.phi !== st.fn) {
    if (Math.abs(speedS.x - 1) < 1e-3 && eff === 1) return;
    const orig = sc.phi;
    st = sc.__hand = { orig, a: orig(t, G), t, s: 1, fn: null };
    st.fn = sc.phi = (tt, g) => st.a + (st.orig(tt, g) - st.orig(st.t, g)) * st.s;
  }
  if (st.s !== speedS.x) { st.a = sc.phi(t, G); st.t = t; st.s = speedS.x; }
}

function tickSpin(dt) {
  if (clearingSpin) {
    spinS.step(0, dt, 1.5);
    if (Math.abs(spinS.x) < 1e-3) { spinS.set(0); clearingSpin = false; }
  } else spinS.x += hand.spinRate * dt;      // real seconds, like everything the hand does, so it still turns in a pause or a rest
  edits.spin = spinS.x;
}

function naturals() {
  const G = app.lastFrame?.G;
  if (G) fillSlot(scratch, G, app.t, G.pattern, { phi: app.lastFrame.phi });
  return scratch;
}

// What the hand has made of a pattern stays on it as it's left behind, and nothing on screen moves: the flight has to see the pattern as it stands, and
// then hold it still. From there on the knobs and the line weight are free for whatever comes next.
function leaving(G) {
  if (J.s.x || J.jx || J.jy) { J.target = 0; J.clearing = true; }
  const over = {}, was = {};
  // ...and what the pattern's own number was, which is what the song has been working from all this time (frame.js).
  if (knobs.size) fillSlot(scratch, G, app.t, G.pattern, { phi: app.lastFrame?.phi });
  for (const [path, k] of knobs) { over[path] = k.s.x; if (G.over?.[path] == null) was[path] = scratch[OFF[path]]; }
  if (Object.keys(over).length) { G.over = { ...G.over, ...over }; G.overWas = { ...G.overWas, ...was }; }
  knobs.clear();
  edits.over = {};
  const d = edits.duty || 0;
  if (d) {
    G.thetaBody = (G.thetaBody ?? [{ t: 0, x: 0 }]).map(k => ({ ...k, x: k.x + d }));
    D.s.set(0); D.target = 0; edits.duty = 0;
  }
}

// ----------------------------------------------------------------------------------------------------------------- frames
function tick(t) {
  const now = nowS(), dt = clamp(now - lastNow, 0, 0.05);
  lastNow = now; lastT = t;
  const f = app.lastFrame;
  if (!f) return;
  const A = R.slotA, G = f.G, solid = f.solid;
  if (G !== curG) {
    // A new gesture arrived. If the frame's solid, everything can change unseen; if it isn't, ease.
    curG = G;
    const changed = G.pattern !== curPat;
    if (Math.abs(f.theta) >= solid - 1e-3) {
      resetForPattern(G.pattern, changed);
      D.s.set(0); D.target = 0; D.room = 0;
      hand.corridor = false;
    } else if (changed) {
      curPat = G.pattern; J.target = 0; J.clearing = true; D.target = 0;
      // From what's just been drawn, if it's come in on the knob's say, or it's nothing to do with what's here now.
      for (const [path, k] of knobs) {
        if (!edits.inHandover && edits.overBy?.[path] == null) { knobs.delete(path); delete edits.over?.[path]; continue; }
        if (!edits.inHandover) k.s.set(A[OFF[path]]);
        k.release = true;
      }
      edits.overBy = null;
      hand.emit('pattern', G.pattern);
    }
  }
  edits.overG = G;
  // A gesture's own transformation is coming, and what the hand has done stays with the gesture. In a flight, and on the way to one, the zoom keeps inside what
  // the flight has room for (a view right out would see past the element it's flying into).
  const left = G.morph && !f.N && !stage.staticG ? G.t1 - G.morph - app.pictureT(t) : Infinity;
  if (left < 0.15) leaving(G);
  if (left < 2.5 || f.kind === 'dive' || f.kind === 'rise') {
    if (J.target < -0.25) { J.target = -0.25; J.touched = now; }
    const asp = canvas.width / canvas.height, room = 1.15 * Math.hypot(Math.max(asp, 1.9), 1) + 0.46;
    if (Math.exp(-(J.s.x + J.lift.x)) * Math.hypot(asp, 1) + Math.hypot(J.jx, J.jy) > 0.97 * room) { const k = Math.exp(-dt * 3); J.jx *= k; J.jy *= k; }
  }
  fx.tick(dt, m.over);
  tickPress(dt, now);
  tickPush(dt, now);
  tickJourney(dt, now, A);
  tickDuty(dt, now, t, G, solid);
  tickSheet(dt);
  tickKnobs(dt);
  tickSpeed(dt, t, G);
  tickSpin(dt);
}

// ----------------------------------------------------------------------------------------------------------------- actions
hand.setKnob = (path, value) => {
  let k = knobs.get(path);
  if (!k) {
    const nat = naturals();
    k = { s: new Spring(nat[OFF[path]], 16), target: value };
    knobs.set(path, k);
  }
  k.target = value; k.release = false;
};
hand.releaseKnob = path => { const k = knobs.get(path); if (k) k.release = true; };
hand.knobValue = path => {
  const k = knobs.get(path);
  return k && !k.release ? k.target : null;
};
hand.natural = path => naturals()[OFF[path]];
hand.liveValue = path => knobs.get(path)?.s.x ?? naturals()[OFF[path]];
// What the "lines" knob can move on what's showing: freq multiplies straight lines, and a pattern with none (rings, spokes, a field) can only be seen from further away.
hand.linesPath = () => {
  const n = naturals();
  if (n[OFF['field.kind']] > 3.5) return 'scale';      // a world's own field: its stripes are only there for when it's gone, and it takes away whatever freq would do
  for (let i = 0; i < FAMILIES; i++) if (n[OFF[`f${i}.on`]] >= 0.5 && Math.abs(n[OFF[`f${i}.d`]]) <= 1.01 && Math.hypot(n[OFF[`f${i}.x`]], n[OFF[`f${i}.y`]]) > 1e-3) return 'freq';
  return 'scale';
};

// Go somewhere: what's showing becomes it, whatever mode this is, and it gets there on real seconds. With a song playing, the film carries on with this
// pattern as its motif.
hand.go = (id, opts = {}) => {
  const pat = typeof id === 'string' ? app.byId[id] ?? stage.world?._pool?.find(p => p.id === id) : id;
  if (!pat) return;
  stage.pick(pat, app.pictureT(), opts);
  hand.emit('going', pat);
};

// Do something that changes what's showing (another take, a seek, a song going away), and have the old picture bend into the new one. In the middle of a
// transformation, that gets to the end of it first: a picture that's two patterns at once can't bend into anything.
hand.veil = (fn, { dur = 6 } = {}) => {
  stage.settle(app.pictureT(), () => {
    const snap = stage.snapshot(app.pictureT());
    try { fn?.(); } catch (e) { console.error(e); }
    // A seek's new time only shows on the next frame, so ask the clock
    stage.morphFrom(snap, app.pictureT(app.clock ? app.clock() : app.t), dur);
  });
};

// What the hand has made of the current pattern, as a pattern a song can be composed from.
hand.mine = () => {
  const pat = curPat ?? app.lastFrame?.G?.pattern;
  if (!pat) return null;
  const over = {};
  for (const [path, k] of knobs) if (!k.release) over[path] = k.target;
  const j = J.s.x, jx = J.jx, jy = J.jy, spin = spinS.x;
  if (!Object.keys(over).length && !j && !spin && !jx && !jy) return pat;
  return {
    ...pat,
    drive(out, ctx) {
      pat.drive?.(out, ctx);
      for (const p in over) out[OFF[p]] = over[p];
      // The hand's view is of the frame, before the pattern's own view, so in the pattern's numbers its pan goes through that view.
      const s = Math.max(out[OFF.scale], 1e-5), a = out[OFF.rot];
      out[OFF.tx] += (Math.cos(a) * jx + Math.sin(a) * jy) / s;
      out[OFF.ty] += (-Math.sin(a) * jx + Math.cos(a) * jy) / s;
      out[OFF.scale] *= Math.exp(j); out[OFF.rot] += spin;
    },
  };
};

hand.step = dir => {
  // from wherever it's already heading, so tapping N walks along the list
  const from = lastAsked ?? curPat ?? app.lastFrame.G.pattern;
  const list = app.stage.world?._pool?.length ? app.stage.world._pool : app.patterns;
  const n = list.length, i = Math.max(0, list.indexOf(from));
  const pat = list[((i + dir) % n + n) % n];
  hand.go(pat);
  lastAsked = pat;
};

hand.wander = () => {
  if (stage.score.song && app.song?.rebuild) { hand.veil(() => { stage.setStatic(false, app.pictureT()); app.song.rebuild({ pattern: null }); }); hand.emit('static', false); hand.emit('wander'); return; }
  if (app.paused && !app.clock) app.paused = false;
  stage.wander(app.pictureT());
  hand.emit('wander');
};

// Static: what's showing stays. No more automatic transitions until it's turned off.
hand.setStatic = on => { stage.setStatic(on, app.pictureT()); hand.emit('static', on); };
hand.isStatic = () => stage.staticOn;

// What the mouse does on the picture. Choosing the current one again goes back to the plain hand.
hand.setEffect = id => fx.select(id);
hand.effect = () => fx.current;

hand.offsets = OFF;
hand.isHeld = () => stage.hold || hand.corridor;

hand.clear = () => {
  J.target = 0; J.clearing = true; J.touched = nowS();
  D.target = hand.corridor ? 2 * D.room : 0;
  for (const k of knobs.values()) k.release = true;
  dropSheet();
  fx.clear();
  push.boostUntil = nowS() + 2.5;
  hand.speed = 1; hand.spinRate = 0; clearingSpin = true;
  hand.emit('cleared');
};

hand.togglePause = () => {
  const s = app.song;
  // The song has finished and the wander has taken over: play goes back to the film, under a solid.
  if (s?.resting) { hand.veil(() => s.play(), { close: 0.6, open: 1.2 }); return; }
  if (app.clock && s) {
    if (s.playing ?? (s.isPlaying && s.isPlaying())) s.pause?.();
    else (s.play || s.resume)?.call(s);
  } else app.paused = !app.paused;
  hand.emit('pause', app.paused);
};

hand.setCalm = on => { hand.calm = !!on; hand.emit('calm', hand.calm); };
hand.sheetOn = () => S.on;
hand.dropSheet = dropSheet;
hand.state = () => ({
  J: J.s.x, Jtarget: J.target, jx: J.jx, jy: J.jy, w: D.s.x, room: D.room, corridor: hand.corridor,
  sheet: S.on, sheetRot: S.rot.x, sheetLift: S.lift, press: press.a.x, pressX: press.x.x, pressY: press.y.x, pattern: curPat?.id,
  speed: speedS.x, knobs: [...knobs.keys()],
});

// ----------------------------------------------------------------------------------------------------------------- init
export function init(a) {
  if (hand.app) return;     // the interface starts it too, whichever gets here first
  app = a; hand.app = a; canvas = a.canvas; stage = a.stage; R = a.R;
  edits = a.edits; edits.over = {};
  a.hand = hand;
  fx = hand.fx = new Effects(a, hand, toPicture);
  stage.onLeave = leaving;
  lastNow = nowS(); lastT = a.t;
  curG = a.lastFrame?.G ?? null;
  curPat = curG?.pattern ?? null;
  a.onFrame.unshift(tick);

  addEventListener('pointermove', e => {
    m.cx = e.clientX; m.cy = e.clientY; m.seen = true;
    m.over = e.target === canvas || hand.dragging;
    if (m.over) m.last = nowS();
    if (hand.dragging && S.active) moveSheet(e);
    else if (m.over) fx.move(e.clientX, e.clientY);
  }, { passive: true });
  document.addEventListener('pointerleave', () => { m.over = false; });
  document.documentElement.addEventListener('mouseleave', () => { m.over = false; });

  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    canvas.setPointerCapture?.(e.pointerId);
    hand.dragging = true;
    m.cx = e.clientX; m.cy = e.clientY;
    if (e.altKey) { beginSheet(e); return; }
    if (fx.takes()) { fx.down(e.clientX, e.clientY); return; }
    push.on = true; push.boostUntil = 0;
    push.x.set(e.clientX); push.y.set(e.clientY);
    push.px = e.clientX; push.py = e.clientY;
  });
  const end = () => { hand.dragging = false; push.on = false; S.active = false; fx.up(); };
  addEventListener('pointerup', end);
  addEventListener('pointercancel', end);
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('dblclick', e => { if (e.altKey) dropSheet(); });

  addEventListener('wheel', e => {
    // A panel scrolls itself. Only the picture takes the hand's wheel.
    if (e.target !== canvas) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const dx = e.deltaX * unit, dy = e.deltaY * unit, now = nowS();
    if (e.altKey && S.on) { S.rotH += -(dy + dx) * 0.00012; return; }
    if (e.shiftKey) { dutyWheel(dx || dy); return; }
    if (now - wheelLast > 0.2) wheelAxis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'duty' : 'journey';
    wheelLast = now;
    if (e.ctrlKey || wheelAxis === 'journey') journeyWheel(dy, e.ctrlKey);
    else dutyWheel(dx);
  }, { passive: false });

  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.repeat) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    switch (e.key) {
      case ' ': hand.togglePause(); e.preventDefault(); break;
      case 'n': case 'N': case 'ArrowRight': case 'ArrowDown': hand.step(1); e.preventDefault(); break;
      case 'ArrowLeft': case 'ArrowUp': hand.step(-1); e.preventDefault(); break;
      case 'w': case 'W': hand.wander(); break;
      case 'z': case 'Z': hand.clear(); break;
    }
  });
}
