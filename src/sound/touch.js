// The hands on the music. What a tool does to the sound directly, on top of whatever the picture it changed goes on to play. It runs from the
// brain's _controls, so it answers with the picture's clock stopped: paused, static, or in one of colour's stops. It only reads what the tools
// have left in app.edits (and where the pointer is, for a drag). With nothing being touched every number here is neutral.
//
//   zoom         register moves at once, and the filter leans the way you're going
//   line weight  narrower pulses and a darker filter as the lines thin
//   comb         a strum: a note per stretch of travel, by height, panned by where it is; the echoes run long while the dents heal
//   twist        the whole band bends, and the voices wind apart
//   pinch        darker, higher, shorter.   bulge: brighter, lower, a little louder
//   hand         the pad rises with it and follows it round; a fist plays one low note and shuts the filter until it opens
//   rotation     sweeps the pad across the room
import { clamp } from '../score/curves.js';
import { flag } from '../score/flags.js';

const STRUM_EVERY = 0.12;    // picture units of travel per note
const STRUM_MAX = 12;        // notes per second, at most
const HEAL = 20;             // seconds for a dent to relax by 1/e, as the comb has it (tools/input.js MEMORY)
const FAST = 0.25;           // how quickly the register follows while the zoom is moving
const BUSY_TAIL = 0.5;       // a hand counts as still there for this long after it stops moving
const MOIRE_MAX = 40;        // cents apart, for the pad. Past this it stops being a beat and becomes a different chord
const LEVEL_BULGE = Math.pow(10, 1.5 / 20);   // +1.5 dB

export class Touch {
  constructor() {
    this.lastJ = null; this.lastD = null; this.lastSig = null; this.lastHandX = null; this.lastHandY = null; this.lastSheet = null;
    this.vJ = 0; this.vD = 0;
    this.fastUntil = -1; this.busyUntil = -1;
    this.combX = null; this.combY = null; this.travel = 0; this.lastStrum = -1; this.strums = [];
    this.heal = 0;
    this.fisted = false; this.fistEvent = 0;     // +1 closed this frame, -1 opened this frame
    this.rot0 = null; this.sweep = 0;
    this.neutral();
  }

  neutral() {
    this.cut = 1; this.center = 0; this.gate = 1; this.pad = 1; this.level = 1; this.bend = 0; this.moire = 0;
    this.pan = 0; this.pw = 0.5; this.feedback = 0; this.fast = false; this.busy = false;
    this.band = 1;   // the same lean, on the whole band and not just the pad. Under 1 it closes, over 1 it opens
  }

  update(F, dt, now) {
    this.neutral();
    this.fistEvent = 0;
    if (!flag('toolsound')) { this.fisted = false; this.strums.length = 0; return; }
    const ease = tau => 1 - Math.exp(-dt / tau);

    // ------------------------------------------------------------ zoom: how fast it's going, not just how far
    const J = F.journey || 0;
    const vJ = this.lastJ == null ? 0 : (J - this.lastJ) / Math.max(dt, 1e-3);
    this.lastJ = J;
    this.vJ += (clamp(vJ, -4, 4) - this.vJ) * ease(0.05);
    const zooming = Math.abs(this.vJ) > 0.03;
    if (zooming) this.fastUntil = now + FAST;
    this.fast = now < this.fastUntil;
    const lean = Math.exp(0.35 * this.vJ);
    this.cut *= lean; this.band *= lean;

    // ------------------------------------------------------------ line weight
    const d = F.duty || 0;
    const vD = this.lastD == null ? 0 : (d - this.lastD) / Math.max(dt, 1e-3);
    this.lastD = d;
    this.vD += (clamp(vD, -4, 4) - this.vD) * ease(0.05);
    this.pw = clamp(0.5 - 0.35 * d, 0.14, 0.5);
    this.cut *= Math.exp(-0.8 * d);
    this.band *= Math.exp(-1 * d);

    // ------------------------------------------------------------ twist, pinch, bulge
    const w = F.warp;
    if (w) {
      const tw = w.twist || 0, p = w.pinch || 0;
      this.bend = 60 * Math.tanh(tw / 3);
      this.moire = Math.min(8 * Math.abs(tw), MOIRE_MAX);
      if (p > 0) { const k = Math.exp(-1.1 * p); this.cut *= k; this.band *= k; this.center += 6 * p; this.gate *= 1 - 0.4 * Math.min(p, 2); }
      else if (p < 0) { const q = -p, k = Math.exp(1.6 * q); this.cut *= k; this.band *= k; this.center -= 6 * q; this.level *= 1 + (LEVEL_BULGE - 1) * Math.min(q / 0.8, 1); }
    }

    // ------------------------------------------------------------ the hand
    const h = F.hand;
    const press = h ? clamp((h.curl - 0.15) / 0.9) : 0, on = h ? h.on : 0;
    if (h) {
      this.pad *= 1 + 0.6 * on;
      this.center += 8 * clamp(h.y, -1, 1) * on;
      this.pan += clamp(h.x / 1.7, -1, 1) * 0.7 * on;
      const k = Math.exp(-1.5 * press * on);
      this.cut *= k; this.band *= k;
    }
    if (!this.fisted && h && press > 0.55) { this.fisted = true; this.fistEvent = 1; }
    else if (this.fisted && (!h || press < 0.3)) { this.fisted = false; this.fistEvent = -1; }

    // ------------------------------------------------------------ the comb: a stretch of travel is a note
    const c = F.comb;
    if (c && c.on) {
      if (this.combX == null) { this.combX = c.x; this.combY = c.y; this.travel = 0; }
      const go = Math.hypot(c.x - this.combX, c.y - this.combY);
      this.combX = c.x; this.combY = c.y;
      this.travel = Math.min(this.travel + go, STRUM_EVERY * 2);      // a wild drag doesn't owe notes for later
      this.heal = Math.min(1, this.heal + go * 1.2);
      if (this.travel >= STRUM_EVERY && now - this.lastStrum >= 1 / STRUM_MAX) {
        this.travel -= STRUM_EVERY;
        this.lastStrum = now;
        this.strums.push({ x: c.x, y: c.y, vel: clamp(0.42 + go * 2.2, 0.42, 0.68) });
      }
    } else { this.combX = null; this.combY = null; this.travel = 0; }
    this.heal *= Math.exp(-dt / HEAL);
    if (this.heal < 1e-3) this.heal = 0;
    this.feedback = 0.15 * Math.min(1, this.heal * 2.5);

    // ------------------------------------------------------------ rotation: a knob on the view, or the spin knob
    // Its own count of how far the spin knob has gone, in real seconds, so it sweeps with the clock stopped, and comes back to the middle when let go.
    const spin = F.spinRate || 0;
    if (spin) this.sweep += spin * dt * 1.6; else this.sweep *= Math.exp(-dt / 1.2);
    let rot = this.sweep;
    if (F.overRot != null) {
      if (this.rot0 == null) this.rot0 = F.overRot;
      rot += F.overRot - this.rot0;
    } else this.rot0 = null;
    this.pan += 0.65 * Math.sin(rot);

    // ------------------------------------------------------------ is a hand actually on it?
    // A stopped picture has no clock of its own, so while something's touching it the read line goes on across it by itself.
    let moving = zooming || Math.abs(this.vD) > 0.02 || !!(c && c.on) || this.fisted;
    if (w && (Math.abs(w.twist || 0) > 0.05 || Math.abs(w.pinch || 0) > 0.05)) moving = true;
    if (h) {
      if (this.lastHandX != null && Math.hypot(h.x - this.lastHandX, h.y - this.lastHandY) > 0.25 * dt && on > 0.3) moving = true;
      this.lastHandX = h.x; this.lastHandY = h.y;
    } else { this.lastHandX = null; this.lastHandY = null; }
    if (F.sheet > 0) {
      const sig = (F.sheetRot || 0) * 57 + (F.sheetX || 0) + (F.sheetY || 0);
      if (this.lastSheet != null && Math.abs(sig - this.lastSheet) > 1e-4) moving = true;
      this.lastSheet = sig;
    } else this.lastSheet = null;
    if (this.lastSig != null && Math.abs(F.knobs - this.lastSig) > 1e-4) moving = true;
    this.lastSig = F.knobs;
    if (moving) this.busyUntil = now + BUSY_TAIL;
    this.busy = now < this.busyUntil;
  }
}
