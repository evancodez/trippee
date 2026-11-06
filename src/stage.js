// The stage: what's playing now. It holds a score (a film of a song, or an endless wander with no song) and lets the
// user step in at any moment. Every change of pattern goes through a solid, however it was asked for.
import { patterns, byId } from './pattern/library.js';
import { rng } from './score/curves.js';

const GHOST_BPM = 76;   // with no song, things still flow on a steady, slow clock

export class Stage {
  constructor(seed = 7) {
    this.rand = rng(seed);
    this.hold = false;         // true when the user has chosen a pattern and it should stay
    this.lastPol = 1;
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
      const pol0 = prev ? prev.pol1 : 1;
      const len = this.rand.range(20, 32);
      const pol1 = this.rand() < 0.42 ? -1 : 1;
      g.push({ t0, t1: t0 + len, arcEnd: t0 + len, pattern: this._nextPattern(), pol0, pol1, inDur: this.rand.range(5, 8), outDur: this.rand.range(5, 7) });
    }
  }

  update(t) {
    if (this.score.song) return;
    const g = this.score.gestures;
    if (this.hold) { const cur = this.current(t); if (cur.t1 < t + 30) { cur.t1 = t + 600; cur.arcEnd = cur.arcEnd ?? cur.t1; g.length = g.indexOf(cur) + 1; } return; }
    this._extend(t);
  }

  current(t) {
    const g = this.score.gestures;
    let lo = 0, hi = g.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (g[m].t0 <= t) lo = m; else hi = m - 1; }
    return g[lo];
  }

  // Go to a pattern: the current one closes down to a solid over `out` seconds and the new one grows out of it.
  go(id, t, { out = 3.2, into = 5, hold = true, pol } = {}) {
    const pat = typeof id === 'string' ? byId[id] : id;
    if (!pat) return;
    const g = this.score.gestures;
    const cur = this.current(t);
    const pol1 = pol ?? (this.rand() < 0.5 ? -1 : 1);
    const end = t + out;
    cur.t1 = end; cur.outDur = out; cur.pol1 = pol1;
    g.length = g.indexOf(cur) + 1;
    this.hold = hold;
    const len = hold ? 3600 : 26;
    g.push({ t0: end, t1: end + len, arcEnd: end + (hold ? 44 : len), period: hold ? 44 : 0, pattern: pat, pol0: pol1, pol1: hold ? 0 : 1, inDur: into, outDur: 6 });
    this._last = pat;
    this.score.song = this.score.song && null;
  }

  wander(t) { this.hold = false; const cur = this.current(t); cur.t1 = Math.min(cur.t1, t + 12); cur.pol1 = cur.pol1 || 1; cur.outDur = 6; this._extend(t); }

  // A new score from the composer (a song's film)
  setScore(score) { this.score = score; this.hold = false; }
}
