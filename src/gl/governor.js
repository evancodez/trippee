// Holds the frame rate up by drawing fewer pixels. Only the size drawn changes: the canvas keeps its size, so nothing that reads it
// (a recording, a resize, the hand) ever sees a thing, and the picture is stretched back up to fill it.
//
// Too slow for two seconds running: one tier down, straight away. Going back up waits for a solid frame, where nobody can see it, and
// waits longer each time going up turned out to be a mistake. If the lowest tier is no faster than full size, pixels aren't what's
// slowing it down (a 50 Hz screen, a busy machine), so it goes back to full size and stops trying until the window changes.
const TIERS = [1, 0.85, 0.7, 0.6, 0.5];
const WINDOW = 1, LOW_FPS = 55, HIGH_FPS = 58, SETTLE = 1;
const FIRST_WAIT = 30, MAX_WAIT = 480, TRIAL = 5;

export class Governor {
  constructor(R) {
    this.R = R;
    this.enabled = true;
    this.tier = 0;
    this.fps = 0;
    this.history = [];         // [{ at, tier, fps }], for looking at afterwards
    this._reset();
    this.wait = FIRST_WAIT; this.calm = 0; this.trialUntil = 0; this.fpsAtFull = 0; this.gaveUp = false; this.quietUntil = 0;
  }

  _reset() { this.n = 0; this.sum = 0; this.low = 0; this.settle = SETTLE; }

  // Something known to hold up the main thread for a moment (composing a film, say) isn't the pixels' fault.
  quiet(seconds) { this.quietUntil = Math.max(this.quietUntil, performance.now() + seconds * 1000); this._reset(); }
  // The window changed: everything measured so far is about a different number of pixels.
  resized() { this.gaveUp = false; this.fpsAtFull = 0; this.wait = FIRST_WAIT; this._reset(); }

  _set(tier, why) {
    this.tier = tier;
    this.R.drawScale = TIERS[tier];
    this.history.push({ at: +(performance.now() / 1000).toFixed(1), tier, scale: TIERS[tier], fps: +this.fps.toFixed(1), why });
    this._reset();
  }

  // dt: seconds since the last frame, from the real rAF. isSolid: the frame on screen is one flat colour.
  tick(dt, isSolid) {
    if (!this.enabled || performance.now() < this.quietUntil) return;
    if (dt <= 0 || dt > 0.25) { this._reset(); return; }  // a hidden tab, a stall: says nothing about pixels
    if (this.settle > 0) { this.settle -= dt; return; }
    this.n++; this.sum += dt;
    if (this.sum < WINDOW) {
      if (this.wantUp(dt, isSolid)) this.up();
      return;
    }
    this.fps = this.n / this.sum;
    this.n = 0; this.sum = 0;
    if (this.fps < LOW_FPS) {
      this.low++;
      this.calm = 0;
      if (this.low >= 2) this.down();
    } else {
      this.low = 0;
      if (this.fps >= HIGH_FPS) this.calm += WINDOW; else this.calm = 0;
      if (this.trialUntil && this.calm >= TRIAL) { this.trialUntil = 0; this.wait = FIRST_WAIT; }
    }
  }

  wantUp(dt, isSolid) { return isSolid && !this.gaveUp && this.tier > 0 && this.calm >= this.wait; }

  up() {
    this.calm = 0;
    this.trialUntil = 1;
    this._set(this.tier - 1, 'up');
  }

  down() {
    if (this.trialUntil) { this.trialUntil = 0; this.wait = Math.min(MAX_WAIT, this.wait * 2); }
    if (this.tier === 0) this.fpsAtFull = this.fps;
    if (this.tier < TIERS.length - 1) { this._set(this.tier + 1, 'down'); return; }
    // At the bottom and still slow. Did all this help at all?
    if (this.fps < this.fpsAtFull + 3) { this.gaveUp = true; this.enabled = false; this._set(0, 'gave up: not the pixels'); }
    else this._reset();
  }
}
