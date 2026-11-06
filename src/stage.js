// The stage: what's playing now. It holds a score (a film of a song, or an endless wander with no song) and lets the user step in
// at any moment. Every change of pattern is a morph: the lines of one bend and weave into the next.
import { patterns, byId } from './pattern/library.js';
import { rng } from './score/curves.js';
import { arcU, boldRange } from './score/frame.js';

const GHOST_BPM = 76;   // with no song, things still flow on a steady, slow clock
const MORPH = [8, 12];   // seconds, when it's wandering
const PICKED = 8;        // seconds, when someone picks a pattern

export class Stage {
  constructor(seed = 7) {
    this.rand = rng(seed);
    this.hold = false;         // true when the user has chosen a pattern and it should stay
    this.staticG = null;       // static mode: this gesture is shown, frozen in its long move, however long, song or no song
    this.staticOn = false;
    this.score = { gestures: [], phi: t => (t * GHOST_BPM / 60) / 8, song: null };
    this._extend(0);
  }

  // Keep an endless wander going: one family for a while, then another, as the film does.
  _nextPattern() {
    if (!this._fam || this._famLeft <= 0) {
      const fams = [...new Set(patterns.map(p => p.family))];
      const others = fams.filter(f => f !== this._fam);
      this._fam = this.rand.pick(others.length ? others : fams);
      this._famLeft = this.rand.int(3, 5);
    }
    this._famLeft--;
    const pool = patterns.filter(p => p.family === this._fam && p !== this._last);
    const pat = this.rand.pick(pool.length ? pool : patterns);
    this._last = pat;
    return pat;
  }

  _extend(t) {
    const g = this.score.gestures;
    while (!g.length || g[g.length - 1].t1 < t + 60) {
      const prev = g[g.length - 1];
      const t0 = prev ? prev.t1 : 0;
      const len = this.rand.range(24, 38);
      g.push({ t0, t1: t0 + len, arcEnd: t0 + len, pattern: this._nextPattern(), morph: this.rand.range(MORPH[0], MORPH[1]) });
    }
  }

  update(t) {
    const g = this.score.gestures;
    if (this._wantStatic && !this.morphing(t)) this._enterStatic(t);
    if (this._staticNext && !this.morphing(t)) { const n = this._staticNext; this._staticNext = null; this.go(n.pat, t, { dur: n.dur }); }
    if (this.score.song) return;
    if (this.hold) {
      // A held pattern never runs out. Only the last gesture can: one that's been told to land has its successor queued behind it.
      const cur = this.current(t);
      if (cur === g[g.length - 1] && cur.t1 < t + 30) { cur.t1 = t + 600; cur.arcEnd = cur.arcEnd ?? cur.t1; }
      return;
    }
    this._extend(t);
    // Old gestures can go, as long as nothing is reading them
    if (g.length > 40) g.splice(0, g.length - 40);
  }

  current(t) {
    if (this.staticG) return this.staticG;
    const g = this.score.gestures;
    let lo = 0, hi = g.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (g[m].t0 <= t) lo = m; else hi = m - 1; }
    return g[lo];
  }

  morphing(t) {
    const h = this.score.handover;
    if (h && t >= h.t0 && t < h.t1) return true;
    if (this.staticG) return false;
    const c = this.current(t);
    return !!(c.morph && t > c.t1 - c.morph && t < c.t1);
  }

  // Go to a pattern: the lines of what's showing bend into it.
  go(id, t, { dur = PICKED, hold = true } = {}) {
    const pat = typeof id === 'string' ? byId[id] : id;
    if (!pat) return;
    const fresh = (t0, t1) => ({ t0, t1, arcEnd: t0 + 44, period: hold ? 44 : 0, pattern: pat, morph: 0 });
    if (this._wantStatic) { this._staticNext = { pat, dur }; this._last = pat; return; }   // static's about to settle: this goes next
    if (this.staticG) {
      // Static: stay static, on the new one, once it has arrived. Already on the way to one: arrive there, then carry straight on to this.
      if (this.morphing(t)) { this._staticNext = { pat, dur }; this._last = pat; return; }
      const from = this.staticG;
      const G = fresh(t, t + 3600);
      // Held at the middle of the part of its long move that stays bold
      const [lo, hi] = boldRange(G);
      G.freezeU = (lo + hi) / 2;
      this.staticG = G;
      this._handover(from, t, dur);
      this._last = pat;
      return;
    }
    const g = this.score.gestures;
    let cur = this.current(t);
    if (this.morphing(t) && g[g.indexOf(cur) + 1]) {
      // Already on the way somewhere: arrive there, then carry straight on to this
      cur = g[g.indexOf(cur) + 1];
      g.length = g.indexOf(cur) + 1;
      cur.t1 = cur.t0 + dur; cur.morph = dur;
    } else {
      g.length = g.indexOf(cur) + 1;
      cur.t1 = t + dur; cur.morph = dur;
    }
    delete cur.plan;
    this.hold = hold;
    g.push(fresh(cur.t1, cur.t1 + (hold ? 3600 : 30)));
    if (!hold) { g[g.length - 1].morph = this.rand.range(MORPH[0], MORPH[1]); g[g.length - 1].arcEnd = cur.t1 + 30; }
    this._last = pat;
  }

  wander(t) {
    this.setStatic(false, t);
    this.hold = false;
    const cur = this.current(t);
    if (cur.t1 > t + 10) { cur.t1 = t + 10; cur.morph = cur.morph || this.rand.range(MORPH[0], MORPH[1]); cur.morph = Math.min(cur.morph, 10); }
    const g = this.score.gestures;
    g.length = g.indexOf(cur) + 1;
    this._extend(t);
  }

  // Static mode: no more automatic transitions. What's showing stays, and stops making its long move. It still flows.
  setStatic(on, t) {
    this.staticOn = on;
    if (on) {
      if (this.staticG) return;
      this._wantStatic = true;
      if (this.morphing(t)) this._hurry(t, 4); else this._enterStatic(t);
      return;
    }
    this._wantStatic = false;
    const held = this.staticG;
    // A pick still waiting becomes where it goes next, once this is let go
    const next = this._staticNext;
    this._staticNext = null;
    if (!held) { if (next) this.go(next.pat, t, { dur: next.dur }); return; }
    this.staticG = null;
    if (this.score.song) { this._handover(held, t, 6); return; }
    // Pick up the long move from where it was frozen. A gesture rides only the bold part of its move, so that's what u is measured in.
    const G = { ...held, freezeU: null, period: 0, plan: null };
    const [lo, hi] = boldRange(G);
    const u = hi > lo ? Math.min(1, Math.max(0, ((held.freezeU ?? lo) - lo) / (hi - lo))) : 0;
    const len = 30;
    G.t0 = t - u * len; G.arcEnd = G.t0 + len; G.t1 = t + Math.max(10, len * (1 - u)); G.morph = 10;
    const g = this.score.gestures;
    g.length = 0; g.push(G);
    this.hold = false;
    this._extend(t);
    if (next) this.go(next.pat, t, { dur: next.dur, hold: false });
  }

  // Static has been asked for in the middle of a morph, which may have a long way to go. It arrives soon, from just where it is.
  _hurry(t, rest) {
    const h = this.score.handover;
    if (h && t >= h.t0 && t < h.t1) {
      if (h.t1 - t > rest) { const x = (t - h.t0) / (h.t1 - h.t0), d = rest / (1 - x); h.t0 = t - x * d; h.t1 = t + rest; }
      return;
    }
    const g = this.score.gestures, c = this.current(t), N = g[g.indexOf(c) + 1];
    if (!N || c.t1 - t <= rest) return;
    const x = (t - (c.t1 - c.morph)) / c.morph;
    c.t1 = t + rest; c.morph = rest / (1 - x); N.t0 = c.t1;
  }

  _enterStatic(t) {
    this._wantStatic = false;
    const G = this.current(t);
    this.staticG = { ...G, freezeU: arcU(G, t), morph: 0, plan: null };
  }

  _handover(from, t, dur, dt = 0, phi = null) {
    this.score.handover = { G: from, t0: t, t1: t + dur, dt, phi, plan: null };
  }

  // What's showing now, so that it can bend into whatever comes next (a song's film, another take, a seek). Nothing cuts.
  snapshot(t) {
    const G = this.current(t);
    return { G, score: this.score, t };
  }

  morphFrom(snap, t, dur = 6) {
    if (!snap) return;
    this.score.handover = { G: { ...snap.G, plan: null, morph: 0 }, t0: t, t1: t + dur, dt: snap.t - t, phi: snap.score.phi, plan: null };
    if (this.staticG) return;
    // the film's own next morph waits until this one is done
    const cur = this.current(t);
    if (cur.morph && cur.t1 - cur.morph < t + dur) { cur.morph = Math.max(0, cur.t1 - (t + dur)); delete cur.plan; }
  }

  setScore(score) { this.score = score; this.hold = false; }
}
