// The stage: what's playing now. It holds a score (a film of a song, or an endless wander with no song) and lets the user step in
// at any moment. Every change of pattern is a transformation: the lines of one bend and weave into the next.
//
// One way in for every mode: pick(). A transformation already running is hurried to its end on real seconds; then what's showing, at its own time,
// hands over to where the pick is going, on real seconds too, so nothing can stop it: a pause, a rest in the song or a colour stop all leave it running.
import { patterns, byId } from './pattern/library.js';
import { rng } from './score/curves.js';
import { arcU, boldRange } from './score/frame.js';
import { morphAt, clockOfTo, handoverOn } from './score/morphclock.js';

const GHOST_BPM = 76;   // with no song, things still flow on a steady, slow clock
const MORPH = [8, 12];   // seconds, when it's wandering
const PICKED = 8;        // seconds, when someone picks a pattern
const RUSH = 2.5;        // seconds at most for a transformation to finish when a pick comes in the middle of it
const SETTLE = 1.5;      // ...and for anything else that needs it finished (a seek, another take, a song arriving)
const DWELL = 10;        // seconds a picked pattern gets to itself in a film before the film's next transformation starts
const HEAD_MIN = 2, HEAD_MORPH = 0.6;      // what's left of a gesture a pick cut short: under this many seconds it has no morph of its own, and otherwise this share of it at most

export class Stage {
  constructor(seed = 7) {
    this.rand = rng(seed);
    this.hold = false;         // true when the user has chosen a pattern and it should stay
    this.staticG = null;       // static mode: this gesture is shown, frozen in its long move, however long, song or no song
    this.staticOn = false;
    this.want = null;          // a pick waiting for what's running to finish: { pat, dur, hold }. The last click wins.
    this.waiting = [];         // anything else waiting for that
    this.rebuild = null;       // set by the song: another film of it, with this pattern
    this.now = null;           // set by the app: the picture's time, which a new score can change
    this.onLeave = null;       // set by the hand: what it's done to a gesture stays on it as it's left, and nothing moves
    this.score = { gestures: [], phi: t => (t * GHOST_BPM / 60) / 8, song: null };
    this._extend(0);
  }

  // Keep an endless wander going: one family for a while, then another, as the film does.
  _nextPattern() {
    const open = patterns.filter(p => p.pool !== false);
    if (!this._fam || this._famLeft <= 0) {
      const fams = [...new Set(open.map(p => p.family))];
      const others = fams.filter(f => f !== this._fam);
      this._fam = this.rand.pick(others.length ? others : fams);
      this._famLeft = this.rand.int(3, 5);
    }
    this._famLeft--;
    const pool = open.filter(p => p.family === this._fam && p !== this._last);
    const pat = this.rand.pick(pool.length ? pool : open);
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

  // t: the picture's time. dtReal: real seconds since the last frame, which is what picks and hurried transformations run on.
  update(t, dtReal = 0) {
    this._clock(t, dtReal);
    if (this.want || this._wantStatic || this._staticOff || this._wanderNext || this.waiting.length) {
      if (this.morphing(t)) this._rush(t, this.want ? RUSH : this.waiting.length ? SETTLE : 4);
      else this._settled(t);
    }
    if (this.score.song) return;
    const g = this.score.gestures;
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

  _clock(t, dt) {
    const h = this.score.handover;
    if (h?.wall) h.e += dt;
    this._moving = t !== this._tSeen; this._tSeen = t;
    const H = this._rushed;
    if (H) {
      if (this._running(t)?.holder !== H) { delete H.rush; this._rushed = null; }
      else { H.rush.e += dt; if (H.rush.e >= H.rush.D) this._land(H, t); }
    }
    if (h?.wall && !h.rush && !handoverOn(h, t) && this.score.handover === h) this.score.handover = null;
  }

  // Everything that was waiting for the frame to hold one pattern.
  _settled(t) {
    if (this._staticOff) { this._staticOff = false; if (this.want) this.want.hold = false; this._leaveStatic(t); }
    if (this._wantStatic) this._enterStatic(t);
    if (this.morphing(t)) return;
    const fn = this.waiting.shift();
    if (fn) { try { fn(); } catch (e) { console.error(e); } return; }
    if (this.want) { const w = this.want; this.want = null; this._arrive(w, t); return; }
    if (this._wanderNext) { this._wanderNext = false; this._wander(t); }
  }

  current(t) {
    if (this.staticG) return this.staticG;
    const g = this.score.gestures;
    let lo = 0, hi = g.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (g[m].t0 <= t) lo = m; else hi = m - 1; }
    return g[lo];
  }

  _running(t) {
    const G = this.current(t), g = this.score.gestures;
    return morphAt(this.score, G, this.staticG ? null : g[g.indexOf(G) + 1], t);
  }

  morphing(t) { return !!this._running(t); }
  handingOver(t) { return !!this._running(t)?.handover; }

  // Hurry what's running to its end, from just where it is. It takes the time it had left, if that's shorter.
  _rush(t, rest) {
    const m = this._running(t);
    if (!m || m.holder.rush) return;
    const left = Math.max((1 - m.x) * m.D, 1e-3), D = Math.min(rest, left);
    const going = m.holder.wall || this._moving;
    m.holder.rush = { x0: m.x, e: 0, D, m: going ? D / left : 0 };
    this._rushed = m.holder;
  }

  // A hurried transformation has arrived, ahead of its time. A handover just stops. A gesture's own morph has arrived early, so the next gesture starts
  // now, with its flow carrying on from where it had got to in the morph, which is behind the film's clock.
  _land(H, t) {
    delete H.rush; this._rushed = null;
    if (H === this.score.handover) { this.score.handover = null; return; }
    const g = this.score.gestures, N = g[g.indexOf(H) + 1], by = clockOfTo(H, t) - t;
    H.t1 = t; N.t0 = t;
    if (by) {
      N.phiShift = (N.phiShift || 0) + by;
      const sc = this.score;
      if (!sc.__shifts) {
        sc.__shifts = true;
        const wrap = f => (tt, G) => f(G?.phiShift ? tt + G.phiShift : tt, G);
        if (sc.__hand) sc.__hand.orig = wrap(sc.__hand.orig); else sc.phi = wrap(sc.phi);
      }
    }
  }

  // Run this once one pattern is showing: now, if it is already, or after hurrying what's running to its end.
  settle(t, fn, rest = SETTLE) {
    if (!this.morphing(t) && !this.want) { fn(); return; }
    this.waiting.push(fn);
    this._rush(t, rest);
  }

  // Go to a pattern: what's showing becomes it. The last click wins.
  pick(id, t, { dur = PICKED, hold = true } = {}) {
    const pat = typeof id === 'string' ? byId[id] : id;
    if (!pat) return;
    this.want = { pat, dur, hold };
    this._wanderNext = false;
    this._last = pat;
    if (this.morphing(t)) this._rush(t, RUSH);
    else if (!this._wantStatic) this._settled(t);
  }

  go(id, t, opts) { this.pick(id, t, opts); }

  _arrive({ pat, dur, hold }, t) {
    const from = this.current(t);
    if (from.pattern === pat) { this._stay(from, t, hold); return; }
    // ringsEnd: when the song's rings would have let go, or they'd seem to come back for a moment as it leaves
    const S = { ...from, plan: null, planFor: null, morph: 0, ringsEnd: from.morph ? from.t1 - from.morph : null }, phi = this.score.phi, rings = !!this.score.react, ambient = this.score.ambient?.(t) ?? 1;
    delete S.rush;
    this.onLeave?.(S);
    const fresh = (t0, t1) => ({ t0, t1, arcEnd: t0 + 44, period: hold ? 44 : 0, pattern: pat, morph: 0, melMode: S.melMode });
    if (this.staticG) {
      // Static: stay static, on the new one. Held at the middle of the part of its long move that stays bold.
      const G = fresh(t, t + 3600), [lo, hi] = boldRange(G);
      G.freezeU = (lo + hi) / 2;
      this.staticG = G;
    } else if (this.score.song) this._intoFilm(pat, t, dur, S);
    else {
      const g = this.score.gestures;
      g.length = 0;
      this.hold = hold;
      if (hold) g.push(fresh(t, t + 3600));
      else { const G = fresh(t, t + 30); G.morph = this.rand.range(MORPH[0], MORPH[1]); G.arcEnd = t + 30; g.push(G); this._extend(t); }
    }
    // A picture standing still (paused, or in a rest) stays still while it's flown out of. Its clock starting up at full speed on a click would be a kick.
    this.score.handover = { G: S, ts: t, phi, wall: true, e: 0, D: dur, plan: null, still: !this._moving, rings, ambient };
  }

  // A pattern that's showing already stays, if that's what was asked for. A film just carries on.
  _stay(G, t, hold) {
    if (this.staticG || this.score.song || !hold) return;
    const g = this.score.gestures;
    this.hold = true;
    g.length = g.indexOf(G) + 1;
    G.morph = 0; G.t1 = Math.max(G.t1, t + 600);
  }

  // The same song, another film with this pattern as its motif, and this pattern right now: it replaces what the film had coming, up to a landing far
  // enough off that it gets some time to itself. The clock doesn't stop, and the film lands on the music as before.
  _intoFilm(pat, t, dur, from) {
    this.rebuild?.({ pattern: pat, quiet: true });
    t = this.now?.() ?? t;
    const sc = this.score, g = sc.gestures;
    let i = g.indexOf(this.current(t)), k = i;
    while (k < g.length - 1 && g[k].t1 - (g[k].morph || 0) < t + dur + DWELL) k++;
    const last = g[k], like = g.find(x => x.pattern === pat && x.arcs?.length) ?? g.find(x => x.pattern === pat);
    const G = {
      ...last, t0: t, t1: last.t1, pattern: pat, arcs: like?.arcs ?? pat.arcs, arcEnd: Math.min(last.t1, t + 44), plan: null, planFor: null, range: null,
      phiTrack: [{ t: sc.tau ? sc.tau(t) : t, x: 0, v: 1 / (like?.gears?.[0] || 16) }], gears: like?.gears ?? [], thetaBody: null, replayOf: null, change: null, flow: like?.flow, flowOver: like?.flowOver,
      melMode: from.melMode ?? 0,       // the way the tune runs through the sheet doesn't change in the middle of it: that would jump
    };
    delete G.moves; delete G.xform; delete G.over;
    // What came before stays as it was, up to now. Its morph has to fit in what's left of it, or seeking back into it would start part way through a transformation.
    const headLen = t - g[i].t0, head = headLen > 0 ? [{ ...g[i], t1: t, morph: headLen >= HEAD_MIN ? Math.min(g[i].morph || 0, HEAD_MORPH * headLen) : 0, plan: null, planFor: null, planning: null }] : [];
    g.splice(i, k - i + 1, ...head, G);
  }

  wander(t) {
    this.want = null;
    this.setStatic(false, t);
    this.hold = false;
    this._wanderNext = true;
    if (this.morphing(t)) this._rush(t, 4); else if (!this._staticOff) { this._wanderNext = false; this._wander(t); }
  }

  _wander(t) {
    const g = this.score.gestures, cur = this.current(t);
    if (cur.t1 > t + 10) { cur.t1 = t + 10; cur.morph = cur.morph || this.rand.range(MORPH[0], MORPH[1]); cur.morph = Math.min(cur.morph, 10); delete cur.plan; }
    g.length = g.indexOf(cur) + 1;
    this._extend(t);
  }

  // Static mode: no more automatic transitions. What's showing stays, and stops making its long move. It still flows.
  setStatic(on, t) {
    this.staticOn = on;
    if (on) {
      this._staticOff = false;
      if (this.staticG) return;
      this._wantStatic = true;
      if (this.morphing(t)) this._rush(t, 4); else this._enterStatic(t);
      return;
    }
    this._wantStatic = false;
    if (!this.staticG) return;
    this._staticOff = true;
    if (this.morphing(t)) this._rush(t, 4); else { this._staticOff = false; this._leaveStatic(t); }
  }

  _leaveStatic(t) {
    const held = this.staticG;
    if (!held) return;
    this.staticG = null;
    if (this.score.song) { this._handover(held, t, 6); this._clearRunway(t, 6); if (held.melMode != null) this.current(t).melMode = held.melMode; return; }
    // Pick up the long move from where it was frozen. A gesture rides only the bold part of its move, so that's what u is measured in.
    const G = { ...held, freezeU: null, period: 0, plan: null };
    const [lo, hi] = boldRange(G);
    const u = hi > lo ? Math.min(1, Math.max(0, (arcU(held, t) - lo) / (hi - lo))) : 0;
    const len = 30, ease = 1.5 / len / 2;
    G.t0 = t - (u - ease) * len; G.arcEnd = G.t0 + len; G.t1 = t + Math.max(10, len * (1 - u)); G.morph = 10;
    G.thaw = { t0: t, tau: 1.5, a: ease };
    const g = this.score.gestures;
    g.length = 0; g.push(G);
    this.hold = false;
    this._extend(t);
  }

  _enterStatic(t) {
    this._wantStatic = false;
    const G = this.current(t), u = arcU(G, t), a = (arcU(G, t + 0.1) - u) / 0.1 * 0.75;    // 0.75: half the seconds it takes to come to rest
    this.staticG = { ...G, freezeU: Math.min(1, Math.max(0, u + a)), freezeEase: { t0: t, tau: 1.5, a }, morph: 0, plan: null };
  }

  _handover(from, t, dur) {
    this.score.handover = { G: { ...from, plan: null, planFor: null, morph: 0 }, ts: t, phi: this.score.phi, wall: true, e: 0, D: dur, plan: null, rings: !!this.score.react };
  }

  // A handover wants to finish before the film's next transformation starts, and with the film's gesture still the one it's going to.
  _clearRunway(t, dur) {
    if (this.staticG) return;
    const g = this.score.gestures, i = g.indexOf(this.current(t)), cur = g[i];
    while (g[i + 1] && cur.t1 < t + dur + 6) { const n = g[i + 1]; cur.t1 = n.t1; cur.morph = n.morph; g.splice(i + 1, 1); delete cur.plan; }
    if (cur.morph && cur.t1 - cur.morph < t + dur) { cur.morph = Math.max(0, cur.t1 - (t + dur)); delete cur.plan; }
  }

  // What's showing now, so that it can bend into whatever comes next (a song's film, another take, a seek). Nothing cuts. Asked for in the middle of a
  // transformation, when it can't be helped (settle() can wait for the end of it), it's whichever of the two is nearer.
  snapshot(t) {
    const m = this._running(t);
    if (m?.x > 0.5 && !m.handover) return { G: m.to, score: this.score, t: clockOfTo(m.holder, t) };
    if (m && m.x <= 0.5 && m.handover) return { G: m.from, score: { phi: m.phiFrom ?? this.score.phi }, t: m.tf };
    return { G: this.current(t), score: this.score, t };
  }

  // A song's film arriving is on the song's clock (clocked), so the film stays a pure function of its time. Anything by hand runs on real seconds.
  morphFrom(snap, t, dur = 6, { clocked = false } = {}) {
    if (!snap) return;
    const S = { ...snap.G, plan: null, planFor: null, morph: 0 }, rings = !!snap.score.react && snap.score.songFades == null;
    delete S.rush;
    this.score.handover = clocked
      ? { G: S, t0: t, t1: t + dur, dt: snap.t - t, phi: snap.score.phi, plan: null, rings, ts: snap.t }
      : { G: S, ts: snap.t, phi: snap.score.phi, wall: true, e: 0, D: dur, plan: null, rings };
    // the film's own next morph waits until this one is done
    this._clearRunway(t, dur);
    if (S.melMode != null) this.current(t).melMode = S.melMode;
  }

  setScore(score) { this.score = score; this.hold = false; }
}
