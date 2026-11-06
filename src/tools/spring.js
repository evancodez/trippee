// A critically damped spring, exact for any dt. Everything the hand touches goes through one of these, so nothing jolts.
// A far target is followed at no more than vmax: the spring is only ever shown a target it can reach at that speed.
export class Spring {
  constructor(x = 0, w = 8) { this.x = x; this.v = 0; this.w = w; }
  step(target, dt, w = this.w, vmax = 0) {
    if (vmax) { const L = 2 * vmax / w, d = target - this.x; if (d > L) target = this.x + L; else if (d < -L) target = this.x - L; }
    const e = Math.exp(-w * dt), d = this.x - target, c = this.v + w * d;
    this.x = target + (d + c * dt) * e;
    this.v = (this.v - c * w * dt) * e;
    return this.x;
  }
  set(x) { this.x = x; this.v = 0; return this; }
}
