// Holds the frame rate up by drawing fewer pixels. Only the size drawn changes: the canvas keeps its size, so nothing that reads it
// (a recording, a resize, the hand) ever sees a thing, and the picture is stretched back up to fill it.
//
// Each of the renderer's programs costs something different, so each remembers its own size: a plain picture stays sharp, and a flight, or
// the hand, draws smaller only while it's there.
//
// Too slow for two seconds running: down, straight away, as far as it looks like it needs. Going back up waits until it has been comfortably
// fast for a while, and waits longer each time going up turned out to be a mistake. If the lowest tier is no faster than full size, pixels
// aren't what's slowing it down (a 50 Hz screen, a busy machine), so it goes back to full size and stops trying until the window changes.
//
// Where the GPU can say how long a frame took (R.onCost) it does better: a program that doesn't fit is down to a size that does in a few frames, and one that has room goes back up when the numbers say so.
// A program it's never seen starts at the size its cost should fit, reckoned from what's been seen of the others, so a shock or colour doesn't have to drop frames to find out.
import { flag } from '../score/flags.js';

const TIERS = [1, 0.85, 0.7, 0.6, 0.5];
const WINDOW = 1, LOW_FPS = 55, HIGH_FPS = 58, SETTLE = 1;
const FIRST_WAIT = 30, MAX_WAIT = 480, TRIAL = 5;
const OVER = 15, FITS = 13, ROOM = 11.5;     // ms of GPU a frame: too much, what a new size aims for, and how little the next size up has to come to before it's tried
const OVER_FRAMES = 3, ROOM_FRAMES = 480;
// With the GPU's own times off for choosing sizes (flag gpuTiers), they still catch a program that can't fit at all: more than this much of the GPU a frame, at the size it's drawn, is a frame that
// can't make 60 however quiet the machine is. The frame rate's own test took two seconds of such frames to see it, every time one came up: a shock at 3024 x 1964 was 50 to 83 ms a frame, Flower Power's
// flights 50 to 66. It's down to the size that fits within a few frames, and that program keeps that size. Only while frames really are being missed, most of the last eight: on a GPU that's shared
// (a rehearsal behind the picture, another page) the timer reads high on frames that still made 60. With three of eight, the e key's no-pop rows failed (81 and 133 against 23 and 31 around them),
// most likely from a drop on a hiccup. Nothing that does make 60 is drawn any smaller for this.
const WAY_OVER = 17, SLOW_FRAME = 0.025, SLOW_OF_8 = 6;
// A program that's only there now and then (a ghost hand on each strong beat) used to snap the size down and back up on every one, and on fine lines each snap is a pop (PPP 92-109 s, twice a second). So a smaller size is held for a while after the program changes, and then goes back up a tier at a time.
const HOLD = 2.5, RISE = 0.4;     // seconds
// perf9: a recording takes its own share of the GPU every frame, copying the picture out and turning it into video: 2 to 4 ms at 3024 x 1964, the same whichever way the copy's made
// (measured: a 2D copy, a WebGL copy, or the canvas captured as it is). A trick that just fitted then misses frames. While recording, a program over REC_OVER with frames being missed is drawn
// at the size that leaves that room, never below the recording's own size, so the file loses nothing: it's 1080 high, and the canvas is drawn bigger than that. When the recording stops, each goes back to the size it had.
const REC_OVER = 12, REC_FITS = 11, REC_SLOW_OF_8 = 2;      // a frame in three or four missed is the stutter a recording brings: it seldom misses six running
const SHARE = { plates: 1.9, flight: 1.3, shock: 1.8, extra: 1.15, hand: 1.1 };    // how much more than a plain frame each costs, roughly. Only a first guess for a program not yet seen.
const costOf = key => { const v = Math.floor(key), w = v >= 16 ? 1 : (v & 2 ? SHARE.plates : 1) * (v & 4 ? SHARE.flight : 1) * (v & 8 ? SHARE.extra : 1) * (v & 1 ? SHARE.hand : 1); return key !== v ? w * SHARE.shock : w; };

export class Governor {
  constructor(R) {
    this.R = R;
    this.enabled = true;
    this.fps = 0;
    this.history = [];         // [{ at, tier, fps }], for looking at afterwards
    this.gaveUp = false; this.quietUntil = 0;
    this.states = new Map();
    this.v = 0; this.s = this._state(0);
    this.timed = false;        // has the GPU said anything yet?
    this.slow = 0; this.ri = 0; this.recFloor = 0;
    this.byGpu = flag('gpuTiers');
    if (R.timer) R.onCost = (key, scale, ms) => this.cost(key, scale, ms);
    this._reset();
  }

  // One frame's GPU time, in ms, a few frames after it was drawn
  cost(key, scale, ms) {
    if (!this.enabled || this.gaveUp || ms <= 0) return;
    if (this.byGpu) this.timed = true;
    // The middle of the last three: one frame held up by something else says nothing about this program
    const s = this._state(key), a = s.seen, full = ms / (scale * scale);
    a[s.at++ % 3] = full;
    const mid = s.at < 3 ? full : Math.max(Math.min(a[0], a[1]), Math.min(Math.max(a[0], a[1]), a[2]));
    s.cost = s.cost == null ? mid : s.cost + 0.25 * (mid - s.cost);
    s.typical = s.typical == null ? mid : s.typical + 0.02 * (mid - s.typical);
    if (key !== this.v || TIERS[s.tier] !== scale) return;
    const here = s.cost * scale * scale;
    if (!this.byGpu) {
      const rec = this.recFloor > 0 && here > REC_OVER && here <= WAY_OVER;      // perf9
      if ((here <= WAY_OVER && !rec) || s.tier >= TIERS.length - 1 || this.slow < (rec ? REC_SLOW_OF_8 : SLOW_OF_8)) { s.over = 0; return; }
      if (++s.over < OVER_FRAMES) return;
      s.over = 0;
      if (rec) {      // perf9: room for the recording, never smaller than the file
        let fits = TIERS.findIndex((x, i) => i > s.tier && s.cost * x * x <= REC_FITS);
        if (fits < 0) fits = TIERS.length - 1;
        while (fits > s.tier && TIERS[fits] < this.recFloor) fits--;
        if (fits <= s.tier) return;
        if (s.recFrom == null) s.recFrom = s.tier;
        this._set(fits, 'gpu: room for the recording');
        return;
      }
      if (s.trial) { s.trial = false; s.wait = Math.min(MAX_WAIT, s.wait * 2); }      // it had been tried bigger: wait longer before trying again, as the frame rate's own test does
      const fits = TIERS.findIndex((x, i) => i > s.tier && s.cost * x * x <= FITS);
      this._set(fits < 0 ? TIERS.length - 1 : fits, 'gpu: way over');
      return;
    }
    if (here > OVER) {
      s.under = 0;
      if (++s.over >= OVER_FRAMES) {
        const fits = TIERS.findIndex((x, i) => i > s.tier && s.cost * x * x <= FITS);
        if (s.tier < TIERS.length - 1) this._set(fits < 0 ? TIERS.length - 1 : fits, 'gpu');
        s.over = 0;
      }
    } else {
      s.over = 0;
      if (s.tier > 0 && s.cost * TIERS[s.tier - 1] ** 2 < ROOM) { if (++s.under >= ROOM_FRAMES) { s.under = 0; this._set(s.tier - 1, 'gpu up'); } }
      else s.under = 0;
    }
  }

  // What a program no one's seen should start at, going by what a plain frame has been taking lately
  _guess(key) {
    const s = this.states.get(0);
    if (!this.timed || s?.cost == null) return 0;
    const est = Math.max(s.cost, s.typical) * costOf(key), i = TIERS.findIndex(x => est * x * x <= FITS);
    return i < 0 ? TIERS.length - 1 : i;
  }

  _state(v) {
    let s = this.states.get(v);
    if (!s) { s = { tier: 0, wait: FIRST_WAIT, calm: 0, trial: false, fpsAtFull: 0, cost: null, typical: null, seen: [0, 0, 0], at: 0, over: 0, under: 0 }; this.states.set(v, s); }
    return s;
  }
  get tier() { return this.s.tier; }
  get calm() { return this.s.calm; }
  set calm(x) { this.s.calm = x; }
  get wait() { return this.s.wait; }
  set wait(x) { this.s.wait = x; }

  _reset() { this.n = 0; this.sum = 0; this.low = 0; this.settle = SETTLE; }

  // Something known to hold up the main thread for a moment (composing a film, say) isn't the pixels' fault.
  quiet(seconds) { this.quietUntil = Math.max(this.quietUntil, performance.now() + seconds * 1000); this._reset(); }
  // perf9: a recording starts (the file's height, in pixels) or stops (0). Stopping gives back what it took, a tier at a time, as after a hold.
  recording(fileH) {
    this.recFloor = fileH > 0 ? Math.min(1, fileH / Math.max(1, this.R.canvas.height)) : 0;
    if (fileH > 0) return;
    for (const s of this.states.values()) if (s.recFrom != null) { s.tier = Math.min(s.tier, s.recFrom); s.recFrom = null; }
  }
  // The window changed: everything measured so far is about a different number of pixels.
  resized() {
    this.gaveUp = false; this.states.clear(); this.s = this._state(this.v);
    this.R.drawScale = TIERS[0];
    this._reset();
  }

  _set(tier, why) {
    this.s.tier = tier;
    this.R.drawScale = TIERS[tier];
    this.history.push({ at: +(performance.now() / 1000).toFixed(1), v: this.v, tier, scale: TIERS[tier], fps: +this.fps.toFixed(1), why });
    this._reset();
  }

  // dt: seconds since the last frame, from the real rAF.
  tick(dt) {
    if (!this.enabled) return;
    // How many of the last 8 frames were missed
    const r = (this.recent ??= new Float32Array(8));
    this.slow += (dt > SLOW_FRAME) - (r[this.ri] > SLOW_FRAME); r[this.ri] = dt; this.ri = (this.ri + 1) % 8;
    const key = this.R.costKey ?? this.R.variant;
    if (key !== this.v) {
      const seen = this.states.has(key);
      this.v = key; this.s = this._state(key);
      if (!seen) this.s.tier = this._guess(key);
      if (!this.gaveUp) {
        const want = TIERS[this.s.tier], now = performance.now();
        if (want < this.R.drawScale) this.R.drawScale = want;
        if (this.R.drawScale < TIERS[0]) this.holdUntil = now + HOLD * 1000;
      }
      this._reset();
    }
    // Back up to what this program can have, after the hold, a tier at a time
    if (!this.gaveUp && this.R.drawScale < TIERS[this.s.tier]) {
      const now = performance.now();
      if (now >= (this.holdUntil ?? 0)) {
        const i = TIERS.findIndex(x => x <= this.R.drawScale + 1e-6);
        this.R.drawScale = Math.min(TIERS[Math.max(i - 1, 0)], TIERS[this.s.tier]);
        this.holdUntil = now + RISE * 1000;
      }
    }
    // Given up, it goes back to full size the way it does after a hold: a tier at a time. All at once, from half size, a fine sheet sharpened in one frame, which is a pop
    if (this.gaveUp && this.R.drawScale < TIERS[0] && performance.now() >= (this.holdUntil ?? 0)) {
      const i = TIERS.findIndex(x => x <= this.R.drawScale + 1e-6);
      this.R.drawScale = TIERS[Math.max(i - 1, 0)];
      this.holdUntil = performance.now() + RISE * 1000;
    }
    if (this.gaveUp || performance.now() < this.quietUntil) return;
    if (dt <= 0 || dt > 0.25) { this._reset(); return; }  // a hidden tab, a stall: says nothing about pixels
    if (this.settle > 0) { this.settle -= dt; return; }
    this.n++; this.sum += dt;
    if (this.sum < WINDOW) return;
    const s = this.s;
    this.fps = this.n / this.sum;
    this.n = 0; this.sum = 0;
    // Slow frames with the GPU well inside its time aren't the pixels' fault: something's holding up the main thread, or it's a 50 Hz screen. Smaller pictures wouldn't help.
    if (this.timed && s.cost != null && s.cost * TIERS[s.tier] ** 2 < ROOM) { this.low = 0; return; }
    if (this.fps < LOW_FPS) {
      this.low++;
      s.calm = 0;
      if (this.low >= 2) this.down();
    } else {
      this.low = 0;
      if (this.fps >= HIGH_FPS) s.calm += WINDOW; else s.calm = 0;
      if (s.trial && s.calm >= TRIAL) { s.trial = false; s.wait = FIRST_WAIT; }
      if (s.tier > 0 && !s.trial && s.calm >= s.wait && !this.timed) this.up();
    }
  }

  up() {
    this.s.calm = 0;
    this.s.trial = true;
    this._set(this.s.tier - 1, 'up');
  }

  down() {
    const s = this.s;
    if (s.trial) { s.trial = false; s.wait = Math.min(MAX_WAIT, s.wait * 2); }
    if (s.tier === 0) s.fpsAtFull = this.fps;
    if (s.tier < TIERS.length - 1) {
      // The cost goes with the pixels, so how slow it is says how far down it needs to go.
      const fits = TIERS.findIndex((x, i) => i > s.tier && this.fps * (TIERS[s.tier] / x) ** 2 >= HIGH_FPS);
      this._set(fits < 0 ? TIERS.length - 1 : fits, 'down');
      return;
    }
    // At the bottom and still slow. Did all this help at all?
    if (this.fps < s.fpsAtFull + 3) {
      this.gaveUp = true; s.tier = 0; this.holdUntil = performance.now() + RISE * 1000;
      this.history.push({ at: +(performance.now() / 1000).toFixed(1), v: this.v, tier: 0, scale: TIERS[0], fps: +this.fps.toFixed(1), why: 'gave up: not the pixels' });
      this._reset();
    }
    else this._reset();
  }
}
