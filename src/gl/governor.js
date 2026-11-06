// Holds the frame rate up by drawing fewer pixels. Only the size drawn changes: the canvas keeps its size, so nothing that reads it
// (a recording, a resize, the hand) ever sees a thing, and the picture is stretched back up to fill it.
//
// Each of the renderer's programs costs something different, so each remembers its own size: a plain picture stays sharp, and a flight, or
// the hand, draws smaller only while it's there.
//
// Too slow for two seconds running: down, straight away, as far as it looks like it needs. Going back up waits until it has been comfortably
// fast for a while, and waits longer each time going up turned out to be a mistake. If the lowest tier is no faster than full size, pixels
// aren't what's slowing it down (a 50 Hz screen, a busy machine), so it goes back to full size and stops trying until the window changes.
const TIERS = [1, 0.85, 0.7, 0.6, 0.5];
const WINDOW = 1, LOW_FPS = 55, HIGH_FPS = 58, SETTLE = 1;
const FIRST_WAIT = 30, MAX_WAIT = 480, TRIAL = 5;

export class Governor {
  constructor(R) {
    this.R = R;
    this.enabled = true;
    this.fps = 0;
    this.history = [];         // [{ at, tier, fps }], for looking at afterwards
    this.gaveUp = false; this.quietUntil = 0;
    this.states = new Map();
    this.v = 0; this.s = this._state(0);
    this._reset();
  }

  _state(v) {
    let s = this.states.get(v);
    if (!s) { s = { tier: 0, wait: FIRST_WAIT, calm: 0, trial: false, fpsAtFull: 0 }; this.states.set(v, s); }
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
    if (this.R.variant !== this.v) {
      this.v = this.R.variant; this.s = this._state(this.v);
      if (!this.gaveUp) this.R.drawScale = TIERS[this.s.tier];
      this._reset();
    }
    if (this.gaveUp || performance.now() < this.quietUntil) return;
    if (dt <= 0 || dt > 0.25) { this._reset(); return; }  // a hidden tab, a stall: says nothing about pixels
    if (this.settle > 0) { this.settle -= dt; return; }
    this.n++; this.sum += dt;
    if (this.sum < WINDOW) return;
    const s = this.s;
    this.fps = this.n / this.sum;
    this.n = 0; this.sum = 0;
    if (this.fps < LOW_FPS) {
      this.low++;
      s.calm = 0;
      if (this.low >= 2) this.down();
    } else {
      this.low = 0;
      if (this.fps >= HIGH_FPS) s.calm += WINDOW; else s.calm = 0;
      if (s.trial && s.calm >= TRIAL) { s.trial = false; s.wait = FIRST_WAIT; }
      if (s.tier > 0 && !s.trial && s.calm >= s.wait) this.up();
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
    if (this.fps < s.fpsAtFull + 3) { this.gaveUp = true; this._set(0, 'gave up: not the pixels'); }
    else this._reset();
  }
}
