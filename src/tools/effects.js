// What the mouse does on the picture, when it isn't being the plain hand. One effect at a time, chosen on the bar. Everything runs
// through springs and real seconds, so it works the same whether a song is playing, the picture is paused or it's static.
import { clamp, smoother } from '../score/curves.js';
import { Spring } from './spring.js';

export const EFFECTS = [
  { id: 'ripple', name: 'ripple', key: '1', tip: 'click drops a ring. hold and move to rain them' },
  { id: 'hand', name: 'hand', key: '2', tip: 'a hand comes up through the sheet. hold to make a fist' },
  { id: 'twist', name: 'twist', key: '3', tip: 'drag to wind the lines round the cursor' },
  { id: 'pinch', name: 'pinch', key: '4', tip: 'hold to draw the lines in' },
  { id: 'bulge', name: 'bulge', key: '5', tip: 'hold to swell the lines out' },
  { id: 'comb', name: 'comb', key: '6', tip: 'drag to comb the lines. the dents stay and relax slowly' },
];

// Ripples: picture units per second, and how long one lasts. Rings run for most of a screen and die away with no edge to them.
const RING = { speed: 0.3, height: 0.034, life: 13, attack: 0.9, tau: 4.6, slots: 8, die: 0.7, rain: 0.2, step: 0.1 };
const HAND = { size: 3, turn: 0.15, rest: 0.04, lift: 0.055, up: 1.3, down: 1.1, follow: 14 };
const WARP = { r: 0.72, twistHold: 0.7, twistDrag: 0.0085, twistMax: 9, pinch: 1.9, bulge: -0.8, rise: 1.5, relax: 0.42, follow: 9 };

export class Effects {
  constructor(app, hand, toPicture) {
    this.app = app; this.edits = app.edits; this.hand = hand; this.toPicture = toPicture;
    this.current = null;
    this.held = false;
    this.cx = 0; this.cy = 0;         // the cursor, over the picture
    this.seen = false;
    this.rings = [];
    this.wanted = [];                 // rings waiting for a slot
    this.lastRing = -1e9; this.ringX = 0; this.ringY = 0;
    this.time = 0;
    this.body = { on: new Spring(0, HAND.up), press: new Spring(0, 6), x: new Spring(0, HAND.follow), y: new Spring(-0.55, HAND.follow), placed: false };
    this.warp = { x: new Spring(0, WARP.follow), y: new Spring(0, WARP.follow), twist: new Spring(0, 6), pinch: new Spring(0, WARP.rise), target: 0, dragX: 0, dragY: 0 };
  }

  select(id) {
    const next = id === this.current || !EFFECTS.some(e => e.id === id) ? null : id;
    if (this.held) this.up();
    this.current = next;
    document.body.classList.toggle('fx-hand', next === 'hand');
    this.hand.emit('effect', next);
    return next;
  }

  // Does this effect take the pointer? Comb and the plain hand are the existing push.
  takes() { return !!this.current && this.current !== 'comb'; }

  pointer(cx, cy) { this.cx = cx; this.cy = cy; this.seen = true; }

  down(cx, cy) {
    this.pointer(cx, cy);
    this.held = true;
    const [x, y] = this.toPicture(cx, cy);
    if (this.current === 'ripple') { this.drop(x, y); return; }
    if (this.current === 'twist' || this.current === 'pinch' || this.current === 'bulge') {
      const w = this.warp;
      // On a sheet that's flat, start exactly here. On one still relaxing, its place glides over.
      if (Math.abs(w.twist.x) < 0.02 && Math.abs(w.pinch.x) < 0.02) { w.x.set(x); w.y.set(y); }
      w.target = w.twist.x; w.dragX = cx; w.dragY = cy;
    }
  }

  move(cx, cy) {
    this.pointer(cx, cy);
    if (!this.held) return;
    if (this.current === 'twist') {
      const w = this.warp, dx = cx - w.dragX, dy = cy - w.dragY;
      w.dragX = cx; w.dragY = cy;
      // the way you wind it: rightwards and upwards are one way round, leftwards and downwards the other
      w.target = clamp(w.target + (dx - dy) * WARP.twistDrag, -WARP.twistMax, WARP.twistMax);
    }
  }

  up() { this.held = false; }

  drop(x, y) {
    this.wanted.push({ x, y });
    if (this.wanted.length > 2) this.wanted.shift();     // rain keeps up with where the mouse is, not where it was
    this.lastRing = this.time; this.ringX = x; this.ringY = y;
  }

  clear() {
    this.up();
    this.wanted.length = 0;
    for (const r of this.rings) if (r.dying == null) r.dying = this.time;
    this.warp.target = 0;
  }

  // ---------------------------------------------------------------------------------------------------- every frame
  tick(dt, canvasOver) {
    this.time += dt;
    this.tickRings(dt);
    this.tickWarp(dt);
    this.tickHand(dt, canvasOver);
  }

  tickRings(dt) {
    const T = this.time, R = this.rings;
    if (this.held && this.current === 'ripple' && this.seen) {
      const [x, y] = this.toPicture(this.cx, this.cy);
      const far = Math.hypot(x - this.ringX, y - this.ringY) > RING.step;
      if (far && T - this.lastRing > RING.rain) this.drop(x, y);
    }
    if (this.wanted.length) {
      if (R.length < RING.slots) {
        const w = this.wanted.shift();
        R.push({ x: w.x, y: w.y, born: T, dying: null });
      } else if (!R.some(r => r.dying != null)) {
        // Nothing vanishes: the oldest goes down on its own, and its slot comes free in a moment.
        R[0].dying = T;
      }
    }
    for (let i = R.length - 1; i >= 0; i--) {
      const r = R[i], age = T - r.born;
      if (age > RING.life || (r.dying != null && T - r.dying > RING.die)) { R.splice(i, 1); continue; }
      const gone = r.dying == null ? 1 : smoother(1 - (T - r.dying) / RING.die);
      r.radius = RING.speed * age;
      r.height = RING.height * smoother(age / RING.attack) * Math.exp(-age / RING.tau) * smoother((RING.life - age) / 2.5) * gone;
    }
    this.edits.ripples = R.length ? R : null;
  }

  tickWarp(dt) {
    const w = this.warp, fx = this.current, on = this.held;
    if (on && (fx === 'twist' || fx === 'pinch' || fx === 'bulge')) {
      const [x, y] = this.toPicture(this.cx, this.cy);
      w.x.step(x, dt); w.y.step(y, dt);
    }
    const twisting = on && fx === 'twist', pinching = on && (fx === 'pinch' || fx === 'bulge');
    // Held still it keeps winding, slowly. Let go, and it unwinds where it is.
    if (twisting) w.target = clamp(w.target + Math.sign(w.target || 1) * WARP.twistHold * dt, -WARP.twistMax, WARP.twistMax);
    else w.target = w.twist.x;
    w.twist.step(twisting ? w.target : 0, dt, twisting ? 6 : WARP.relax);
    w.pinch.step(pinching ? (fx === 'pinch' ? WARP.pinch : WARP.bulge) : 0, dt, pinching ? WARP.rise : WARP.relax);
    if (Math.abs(w.twist.x) < 1e-3 && !twisting) w.twist.set(0);
    if (Math.abs(w.pinch.x) < 1e-3 && !pinching) w.pinch.set(0);
    this.edits.warp = w.twist.x || w.pinch.x ? { x: w.x.x, y: w.y.x, r: WARP.r, twist: w.twist.x, pinch: w.pinch.x } : null;
  }

  tickHand(dt, canvasOver) {
    const b = this.body, want = this.current === 'hand';
    b.on.step(want ? 1 : 0, dt, want ? HAND.up : HAND.down);
    if (!want && b.on.x < 0.002) { b.on.set(0); b.placed = false; this.edits.hand = null; return; }
    const press = b.press.step(want && this.held ? 1 : 0, dt);
    // the cursor is the wrist; off the picture it stays where it was
    if (want && this.seen && (canvasOver || this.held)) {
      const [x, y] = this.toPicture(this.cx, this.cy);
      if (!b.placed) { b.x.set(x); b.y.set(y); b.placed = true; } else { b.x.step(x, dt); b.y.step(y, dt); }
    } else { b.x.step(b.x.x, dt); b.y.step(b.y.x, dt); }
    const s = HAND.size;
    this.edits.hand = {
      x: b.x.x, y: b.y.x, on: b.on.x,
      height: (HAND.rest + HAND.lift * press) * s,   // holding lifts it straight up, and the wrist stays on the cursor
      curl: 0.15 + press * 0.9, spread: 0.95 - press * 0.65, turn: HAND.turn, size: s,
    };
  }
}
