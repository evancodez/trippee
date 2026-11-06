// Composing a film from a song's analysis. A pure function of (analysis, seed, opts): no audio, no clock, no Math.random.
//
// It isn't audio-reactive. It's choreographed: one motif family for the whole song, long gestures that land their solid
// exactly on the song's structural moments, sections that come back move for move with one thing changed, and flow locked
// to the beat clock by position only. Nothing pulses on a drum.
import { rng, clamp, lerp, smoother, evalTrack } from './curves.js';

const AFFINITY = {          // slide, perc, tempo, harmRate
  lattice: [0, 0.8, 0.6, 0.5], poles: [1, 0, 0.3, 0.2], pole: [1, 0, 0.3, 0.2], rooms: [0.2, 0.7, 0.8, 0.6], room: [0.2, 0.7, 0.8, 0.6],
  lines: [0.8, 0.2, 0.3, 0.4], stripe: [0.8, 0.2, 0.3, 0.4], dots: [0.2, 0.2, 0.5, 0.7], bodies: [0.4, 0.5, 0.4, 0.3], body: [0.4, 0.5, 0.4, 0.3],
  checks: [0.3, 0.7, 0.6, 0.6], check: [0.3, 0.7, 0.6, 0.6], voids: [0.5, 0.3, 0.2, 0.3], waves: [0.9, 0.1, 0.3, 0.2],
};
const TARGET = 24, LMIN = 12, LMAX = 42;      // gesture length, seconds

// ---------------------------------------------------------------- the clock
// tau(t): beats since the start, closed form from the analysis table (Catmull-Rom at 100 Hz). Linear past both ends.
export function clockOf(A) {
  const T = A.tau, n = T.length, hz = A.tauHz || 100, span = Math.min(200, n - 1);
  const r0 = (T[span] - T[0]) * hz / span, r1 = (T[n - 1] - T[n - 1 - span]) * hz / span;
  const tau = t => {
    const x = t * hz;
    if (x <= 1) return T[1] + (t - 1 / hz) * r0;
    if (x >= n - 2) return T[n - 2] + (t - (n - 2) / hz) * r1;
    const i = Math.floor(x), f = x - i, a = T[i - 1], b = T[i], c = T[i + 1], d = T[i + 2];
    return b + 0.5 * f * (c - a + f * (2 * a - 5 * b + 4 * c - d + f * (3 * (b - c) + d - a)));
  };
  const rate = t => { const i = clamp(Math.round(t * hz), 0, A.rate.length - 1); return A.rate[i] || 2; };
  return { tau, rate };
}

// ---------------------------------------------------------------- reading a pattern
const arcValue = (arcs, path, u, dflt) => {
  let v = dflt;
  for (const a of arcs) {
    if (a.path !== path) continue;
    const k = a.ease === 'wave' ? 0.5 - 0.5 * Math.cos(u * Math.PI * 2 * (a.cycles || 1)) : smoother(a.at ? clamp((u - a.at[0]) / (a.at[1] - a.at[0])) : u);
    v = a.log ? a.from * Math.pow(a.to / a.from, k) : lerp(a.from, a.to, k);
  }
  return v;
};

// How far one cycle of Phi moves an edge, in frame widths, at scale 1
function lambdaOf(pat, aspect) {
  const flow = pat.flow || {}, w = 2 * aspect;
  let lam = 0, mMax = 0;
  for (const key in flow) {
    const m = /^f(\d)\.ph$/.exec(key);
    if (!m) continue;
    const c = Math.abs(flow[key]);
    mMax = Math.max(mMax, c);
    const fam = (pat.g.fams || [])[+m[1]] || {};
    const k = Math.hypot(fam.x || 0, fam.y || 0, fam.z || 0), r = Math.abs(fam.r1 || 0) + Math.abs(fam.r2 || 0), l = Math.abs(fam.l1 || 0) + Math.abs(fam.l2 || 0), tt = Math.abs(fam.t1 || 0) + Math.abs(fam.t2 || 0);
    const period = k > 0 ? 1 / k : r > 0 ? 1 / r : l > 0 ? 0.7 / l : tt > 0 ? (2 * Math.PI * 0.7) / tt : 0.3;
    lam = Math.max(lam, (period / w) * c);
  }
  if (pat.lambda) lam = pat.lambda * Math.max(mMax, 1);
  return lam || 0.1;
}

// Gears: the smallest N (one element passes per N beats) that keeps edges at or under 10% of the frame per second.
function gearFor(lamEff, rate, meter) {
  const G = meter === 3 ? [1, 3, 6, 12, 24, 48, 96, 192] : [1, 2, 4, 8, 16, 32, 64, 128];
  for (const N of G) if (N / rate >= 0.5 && lamEff * rate / N <= 0.10) return N;
  return G[G.length - 1];
}

const percentile = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };
const median = a => percentile(a, 0.5);

// ---------------------------------------------------------------- the whole film
export function compose(A, seed = 1, opts = {}) {
  // The seed and the song together: the same seed on two songs shouldn't pick the same things.
  let songHash = 0;
  for (const c of String(A.hash ?? A.duration)) songHash = (Math.imul(songHash, 31) + c.charCodeAt(0)) >>> 0;
  const rand = rng(((seed | 0) * 7919 + songHash) >>> 0);
  const patterns = opts.patterns ?? globalThis.app?.patterns ?? [];
  if (!patterns.length) throw new Error('compose: no patterns');
  const aspect = opts.aspect ?? 16 / 9;
  const { tau, rate } = clockOf(A);
  const meter = A.meter || 4, bars = A.bars, duration = A.duration, fps = A.fps;
  const beatsArr = A.beats;
  const segAt = t => A.segments.find(s => t >= s.t0 && t < s.t1) ?? A.segments[A.segments.length - 1];
  const Eat = t => A.E[clamp(Math.round(t * fps), 0, A.E.length - 1)];
  const meanE = (a, b) => { let s = 0, c = 0; for (let t = a; t < b; t += 0.1) { s += Eat(t); c++; } return c ? s / c : 0; };
  // Where is this moment's first visit? (Identity outside a repeat.)
  const canonTime = t => {
    const b = tau(t), i = Math.floor(b), f = b - i;
    if (i < 0 || i >= A.canon.length - 1) return t;
    const c = A.canon[i];
    if (c === i) return t;
    const c1 = Math.min(beatsArr.length - 1, c + 1);
    return beatsArr[c] + f * (beatsArr[c1] - beatsArr[c]);
  };

  // ----- 1. One family per song
  const byFam = new Map();
  for (const p of patterns) { if (!byFam.has(p.family)) byFam.set(p.family, []); byFam.get(p.family).push(p); }
  const ch = A.character || { slide: 0, perc: 0, tempo: 0, harmRate: 0 };
  const scored = [...byFam.keys()].map(f => {
    const aff = AFFINITY[f] || [0.3, 0.3, 0.3, 0.3];
    // A weighted mean of the song's character, so no family wins just by having larger numbers; the seed moves it a good way.
    let s = (aff[0] * ch.slide + aff[1] * ch.perc + aff[2] * ch.tempo + aff[3] * ch.harmRate) / (aff[0] + aff[1] + aff[2] + aff[3]) + 0.3 * rand();
    if (f === 'dots' && A.swellRegularity > 0.5) s += 0.5;
    const n = byFam.get(f).length;
    s += n < 3 ? -0.6 : Math.min(n, 10) * 0.02;
    return { f, s };
  }).sort((a, b) => b.s - a.s);
  const given = typeof opts.pattern === 'string' ? patterns.find(p => p.id === opts.pattern) : opts.pattern;
  const family = given?.family ?? (opts.family && byFam.has(opts.family) ? opts.family : scored[0].f);
  const shuffled = list => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  let pool = shuffled(byFam.get(family) || []);
  if (given) pool = [given, ...pool.filter(p => p !== given)];
  // A family still being written may be small: borrow from the next nearest, keeping its own first.
  for (const { f } of scored) { if (pool.length >= 3) break; if (f !== family) pool.push(...shuffled(byFam.get(f))); }

  // ----- 2. Landings: DP over the bar lines
  const tEnd = (() => {     // the last moment with sound; after that the film rests
    let t = duration;
    while (t > 1 && Eat(t) < 0.04) t -= 0.25;
    return Math.min(duration, t + 0.25);
  })();
  const nov = A.novelty, nm = nov.reduce((s, v) => s + v, 0) / Math.max(nov.length, 1);
  const nsd = Math.sqrt(nov.reduce((s, v) => s + (v - nm) ** 2, 0) / Math.max(nov.length, 1)) || 1;
  const nodes = [{ t: 0, S: 0, bar: -1 }];
  const boundaryAt = b => { let hit = null; A.segments.forEach((s, i) => { if (i > 0 && Math.abs(s.b0 - b) <= 1) hit = { s, prev: A.segments[i - 1] }; }); return hit; };
  for (let i = 0; i < bars.length; i++) {
    const t = bars[i];
    if (t < 6 || t > tEnd - 6) continue;
    const b = A.barBeats[i], bar = meter / Math.max(rate(t), 0.5);
    let nv = 0;
    for (let k = -1; k <= 1; k++) nv = Math.max(nv, nov[clamp(b + k, 0, nov.length - 1)] || 0);
    const nz = clamp((nv - nm) / nsd, 0, 3);
    const dE = meanE(t, t + 2 * bar) - meanE(t - 2 * bar, t);
    const hit = boundaryAt(b);
    const lc = hit ? (hit.s.label !== hit.prev.label ? 1 : 0.4) : 0;
    const ph = ((i - (A.phrase0 || 0)) % (A.phraseBars || 8) + (A.phraseBars || 8)) % (A.phraseBars || 8);
    const pb = ph === 0 ? 0.6 : ph === (A.phraseBars || 8) / 2 ? 0.2 : 0;
    nodes.push({ t, bar: i, b, S: nz + 2 * Math.abs(dE) + 2 * lc + pb, boundary: !!hit, dE });
  }
  nodes.push({ t: tEnd, S: 0, bar: -2 });
  const inner = nodes.slice(1, -1).map(n => n.S);
  const mandatory = percentile(inner, 0.85);

  const solve = bonus => {
    const n = nodes.length, best = new Float64Array(n).fill(Infinity), from = new Int32Array(n).fill(-1);
    best[0] = 0;
    for (let widen = 1; widen < 8 && !Number.isFinite(best[n - 1]); widen *= 1.5) {
      for (let j = 1; j < n; j++) {
        for (let i = 0; i < j; i++) {
          const L = nodes[j].t - nodes[i].t;
          if (L < LMIN / Math.min(widen, 2) || L > LMAX * widen || !Number.isFinite(best[i])) continue;
          const c = best[i] + (Math.log(L / TARGET) / 0.35) ** 2 - 1.5 * nodes[j].S - bonus[j];
          if (c < best[j]) { best[j] = c; from[j] = i; }
        }
      }
    }
    const pick = [];
    for (let j = n - 1; j > 0 && from[j] >= 0; j = from[j]) pick.push(j);
    return pick.reverse();
  };
  const bonus = nodes.map(n => (n.boundary && n.S >= mandatory ? 8 : 0));
  let chosen = solve(bonus);
  // Later visits copy the landings of the first, through the canon map
  const later = t => (segAt(t).visit || 0) > 0;
  const nearChosen = (t, set, tol) => set.some(j => Math.abs(nodes[j].t - t) <= tol);
  {
    const first = chosen.filter(j => !later(nodes[j].t));
    const bonus2 = nodes.map((n, j) => {
      if (j === 0 || j === nodes.length - 1) return 0;
      const bar = meter / Math.max(rate(n.t), 0.5);
      if (!later(n.t)) return bonus[j] + (first.includes(j) ? 4 : 0);
      return bonus[j] + (nearChosen(canonTime(n.t), first, bar * 0.6) ? 6 : -1.5);
    });
    chosen = solve(bonus2);
  }
  const land = [0, ...chosen.map(j => nodes[j].t)];
  if (land[land.length - 1] < tEnd - 1e-3) land.push(tEnd);

  // ----- 3. Which earlier gesture does each gesture replay?
  const nG = land.length - 1, spec = [];
  for (let k = 0; k < nG; k++) {
    const a = land[k], b = land[k + 1], mid = (a + b) / 2, seg = segAt(mid);
    const out = { k, a, b, seg, replayOf: null };
    if ((seg.visit || 0) > 0) {
      const d = canonTime(mid) - mid, ia = a + d, ib = b + d;
      let bestO = 0, bestK = null;
      for (let q = 0; q < k; q++) {
        const o = Math.min(ib, spec[q].b) - Math.max(ia, spec[q].a);
        if (o > bestO && spec[q].seg.label === seg.label) { bestO = o; bestK = q; }
      }
      if (bestK !== null && bestO >= 0.5 * Math.min(b - a, spec[bestK].b - spec[bestK].a)) out.replayOf = bestK;
    }
    spec.push(out);
  }

  const biggest = [...pool].sort((a, b) => {
    const big = p => { const s = (p.arcs || []).find(x => x.path === 'scale'); return s && s.from > 0 && s.to > 0 ? Math.abs(Math.log(s.to / s.from)) : 0; };
    return big(b) - big(a);
  })[0];
  let cursor = 0, lastPat = null;
  const nextPat = (a, b) => {
    if (A.climax >= a && A.climax < b && biggest && biggest !== lastPat) return biggest;
    for (let tries = 0; tries < pool.length; tries++) {
      const p = pool[cursor++ % pool.length];
      if (p !== lastPat || pool.length === 1) return p;
    }
    return pool[0];
  };
  // Patterns first, because some of them decide the colour of their own landing
  {
    let prev = null;
    for (const q of spec) {
      const src = q.replayOf !== null ? spec[q.replayOf] : null;
      // A section saying the same thing again straight away gets a sibling, not the same picture twice running
      if (src && src.pat !== prev) q.pat = src.pat;
      else { q.replayOf = null; lastPat = prev; q.pat = q.k === 0 && given ? given : nextPat(q.a, q.b); }
      prev = q.pat;
    }
    lastPat = null;
  }
  const ownMatte = p => !!(p.g.matte || p.g.ribbon || p.g.blobs);

  // ----- 4. What kind of landing, by what the music does
  // Breaks: quiet of at least 2 bars, inside the song
  const p15 = percentile(Array.from({ length: Math.floor(tEnd * 2) }, (_, i) => Eat(i / 2)), 0.15);
  const breaks = [];
  { let s = null; for (let t = 0; t < tEnd; t += 0.25) { const q = Eat(t) <= Math.max(p15, 0.08); if (q && s === null) s = t; if (!q && s !== null) { const bar = meter / Math.max(rate(s), 0.5); if (t - s >= 2 * bar && t - s <= 14 && s > 2) breaks.push({ t0: s, t1: t }); s = null; } } }
  const kindAt = B => {
    const beat = 1 / Math.max(rate(B), 0.5), bar = beat * meter;
    const brk = breaks.find(g => Math.abs(g.t0 - B) < bar * 1.5 || (B >= g.t0 && B < g.t1 - 2));
    const dE = meanE(B, B + 2 * bar) - meanE(B - 2 * bar, B);
    if (brk) return { kind: 'break', holdOut: 0, holdIn: clamp(brk.t1 - B, 0.8, 10), inDur: clamp(bar * 3, 3, 7), beat, bar, dE };
    if (dE < -0.1) return { kind: 'fall', holdOut: 0, holdIn: clamp(bar * 0.35, 0.3, 0.7), inDur: clamp(bar * 5, 4, 9), beat, bar, dE };
    if (dE > 0.1) return { kind: 'rise', holdOut: clamp(beat * 0.75, 0.25, 0.5), holdIn: 0, inDur: clamp(bar * 3, 3, 6.5), beat, bar, dE };
    return { kind: 'level', holdOut: 0.25, holdIn: 0.25, inDur: clamp(bar * 4, 3.5, 8), beat, bar, dE };
  };
  // Landing j is the one at land[j]: j = 0 is the start, j = nG is the end
  const L = land.map((B, j) => (j === 0 ? { B, kind: 'start', holdOut: 0, holdIn: 0, inDur: 6 } : { B, ...kindAt(B) }));
  // The start waits for the first sound
  { let t = 0; while (t < 12 && Eat(t) < 0.06) t += 0.1; L[0].holdIn = t; L[0].inDur = clamp((meter / Math.max(rate(t), 0.5)) * 4, 4, 8); }
  L[nG].kind = L[nG].kind === 'rise' ? 'level' : L[nG].kind;
  L[nG].holdOut = 0;

  // Colour of each solid, and its form. Plain solids stay the rule: at most about a third are hard shapes, never two running.
  L[0].pol = 1;
  let hard = 0, lastHard = -2;
  const allowHard = 0;     // no hard shapes closing over the picture: every change is a morph
  for (let j = 1; j <= nG; j++) {
    const l = L[j], before = spec[j - 1], after = spec[j];
    const src = before.replayOf !== null ? L[before.replayOf + 1] : null;
    const r = rand();
    l.pol = src ? src.pol : l.kind === 'fall' || l.kind === 'break' ? (r < 0.78 ? 1 : -1) : l.kind === 'rise' ? (r < 0.62 ? -1 : 1) : (r < 0.6 ? 1 : -1);
    // Never three of the same colour running: the solids should read as a rhythm of black and white
    if (j >= 3 && L[j - 1].pol === l.pol && L[j - 2].pol === l.pol) l.pol = -l.pol;
    if (j === nG) l.pol = 1;
    // A pattern wearing its own matte times the matte against its own t0 and t1 (see voids.js), so no held solid around it
    if (ownMatte(before.pat)) l.holdOut = 0;
    if (after && ownMatte(after.pat)) l.holdIn = 0;
    const srcEntry = after && after.replayOf !== null ? L[after.replayOf] : null;
    let form = 'duty';
    const room = before.b - before.a, roomNext = after ? after.b - after.a : 0;
    const can = hard < allowHard && j - lastHard > 1 && !ownMatte(before.pat) && !(after && ownMatte(after.pat));
    if (can && src && src.form === 'void' && room >= 13) form = 'void';
    else if (can && srcEntry && srcEntry.form === 'sliver' && roomNext >= 14 && after) form = 'sliver';
    else if (can && !src && !srcEntry) {
      const q = rand();
      if ((l.kind === 'fall' && q < 0.45 || l.kind === 'level' && q < 0.18 || j === nG && q < 0.5) && room >= 14) form = 'void';
      else if ((l.kind === 'rise' && q < 0.45 || l.kind === 'break' && q < 0.5 || l.kind === 'level' && q > 0.82) && roomNext >= 15 && after) form = 'sliver';
    }
    l.form = form;
    if (form !== 'duty') { hard++; lastHard = j; }
  }
  L[0].form = 'duty';

  // ----- 5. Build the gestures
  const journey = (pat, len) => {
    const arcs = (pat.arcs || []).map(a => ({ ...a }));
    const maxLn = 0.5 * len / 1.875;      // |d ln s/dt| <= .5/s
    const sc = arcs.find(a => a.path === 'scale');
    const cam = arcs.some(a => a.path.startsWith('cam.') || a.path === 'surf.spin');
    const turns = arcs.some(a => a.path === 'rot' && Math.abs(a.to - a.from) > 0.5);
    if (sc) {
      sc.log = sc.log ?? (sc.from > 0 && sc.to > 0);
      if (rand() < 0.5) { const f = sc.from; sc.from = sc.to; sc.to = f; }
      if (sc.log) { const ln = Math.log(sc.to / sc.from); if (Math.abs(ln) > maxLn) sc.to = sc.from * Math.exp(Math.sign(ln) * maxLn); }
    } else if (!cam && !turns && !pat.drive) {
      const base = pat.g.scale ?? 1, ratio = Math.min(rand.range(3, 8), Math.exp(maxLn)), up = rand() < 0.5;
      const lo = base / Math.sqrt(ratio), hi = base * Math.sqrt(ratio);
      arcs.push({ path: 'scale', from: up ? lo : hi, to: up ? hi : lo, log: true });
    }
    return arcs;
  };
  const CHANGES = ['wider', 'turn', 'reverse'];
  const changed = (src, seg, v) => {
    const arcs = src.arcs.map(a => ({ ...a }));
    let flow = src.flowOver, what;
    if (seg.rot) {
      what = 'lifted';
      const k = Math.pow(2, -seg.rot / 12) ** 2;
      const sc = arcs.find(a => a.path === 'scale');
      if (sc) { sc.from *= k; sc.to *= k; } else arcs.push({ path: 'scale', from: (src.pattern.g.scale ?? 1) * k, to: (src.pattern.g.scale ?? 1) * k });
    } else {
      what = CHANGES[(v - 1) % CHANGES.length];
      const sc = arcs.find(a => a.path === 'scale' && a.log);
      if (what === 'turn' && arcs.some(a => a.path === 'rot')) what = 'wider';
      if (what === 'reverse' && !src.pattern.flow) what = 'wider';
      if (what === 'wider') {
        if (sc) sc.to = sc.to * Math.pow(sc.to / sc.from, 0.45);
        else what = 'turn';
      }
      if (what === 'turn') { const r0 = src.pattern.g.rot ?? 0; arcs.push({ path: 'rot', from: r0, to: r0 + (rand() < 0.5 ? 0.8 : -0.8) }); }
      if (what === 'reverse') { flow = {}; for (const k in src.pattern.flow) flow[k] = -src.pattern.flow[k]; }
    }
    return { arcs, flow, what };
  };

  const swellable = p => p.swell ?? (p.family === 'dots' || p.family === 'bodies' || p.family === 'body' || (p.g.round ?? 0) > 0.5);
  const barIdxAt = t => { let lo = 0, hi = bars.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (bars[m] <= t) lo = m; else hi = m - 1; } return lo; };

  const gestures = [];
  for (let k = 0; k < nG; k++) {
    const s = spec[k], a = s.a, b = s.b, l0 = L[k], l1 = L[k + 1], len = b - a;
    const srcG = s.replayOf !== null ? gestures[s.replayOf] : null;
    const pat = s.pat;
    let arcs, flowOver, change = null;
    if (srcG) {
      const c = changed(srcG, s.seg, s.seg.visit || 1);
      arcs = c.arcs; flowOver = c.flow; change = c.what;
    } else {
      arcs = journey(pat, len);
    }
    // Triangles close by area, so they spend longer nearly solid: a shorter sweep keeps the solid moment the same length
    const tight = (pat.solid ?? 1) < 1 ? 0.75 : 1;
    const outDur = l1.form === 'void' ? 0.05 : clamp(Math.min(rand.range(4, 5.5), len * 0.3), 2.5, 5.5) * tight;
    const inDur = l0.form === 'sliver' ? 0.02 : clamp(l0.inDur, 2.5, len * 0.4) * tight;
    const G = {
      t0: a, t1: b, arcEnd: b, pattern: pat, arcs, kindIn: l0.kind, kindOut: l1.kind,
      // It has become the next pattern exactly on the boundary. Where the music falls away it takes longer over it; where it rises it's quicker.
      morph: clamp(len * (l1.kind === 'fall' || l1.kind === 'break' ? 0.7 : l1.kind === 'rise' ? 0.5 : 0.6), 8, 20),
      replayOf: s.replayOf, change, label: s.seg.label, visit: s.seg.visit || 0,
    };
    if (flowOver) { G.flow = flowOver; G.flowOver = flowOver; }

    // Gears: one element passes per N beats, N from lambda and the scale of the moment. Closed form: a track in tau.
    const lam = lambdaOf(pat, aspect), arcsU = u => {
      const s0 = arcValue(arcs, 'scale', u, pat.g.scale ?? 1), f0 = arcValue(arcs, 'freq', u, pat.g.freq ?? 1);
      // A lump magnifies what flows through it: the edge in the middle of a bulge travels (1 + a) times as far per cycle.
      const bulge = Math.max(0, arcValue(arcs, 'bulge.a', u, pat.g.bulge?.a ?? 0));
      return lam * s0 * (1 + bulge) / Math.max(f0, 1e-3);
    };
    const hasFamilyFlow = pat.flow && Object.keys(pat.flow).some(key => /^f\d\.ph$/.test(key));
    const first = barIdxAt(a), track = [];
    let cur = hasFamilyFlow ? gearFor(arcsU(0), rate(a), meter) : meter * 2;
    // A drive may breathe on the clock (dots inflating, merging, flipping). That needs a slow clock, one gear, and, where the song
    // breathes in phrases, the phrase itself. At the beat it would strobe.
    const breathes = !!pat.drive;
    if (breathes) {
      const r = Math.max(rate((a + b) / 2), 0.5), steps = meter === 3 ? [3, 6, 12, 24, 48, 96, 192] : [2, 4, 8, 16, 32, 64, 128];
      const slowest = pat.minPeriod ?? 5;
      let N = steps.find(n => n / r >= slowest) ?? steps[steps.length - 1];
      const phrase = (A.phraseBars || 8) * meter;
      if (A.swellRegularity > 0.5) { const P = phrase / r >= slowest && phrase / r <= 14 ? phrase : phrase * 2 / r <= 14 ? phrase * 2 : phrase / 2 / r >= slowest ? phrase / 2 : 0; if (P) N = P; }
      let worst = 0;
      for (let u = 0; u <= 1; u += 0.1) worst = Math.max(worst, gearFor(arcsU(u), r, meter));
      cur = Math.max(N, hasFamilyFlow ? worst : 0);
    }
    const tau0 = tau(a);
    let phiNow = 0, tauNow = tau0;
    track.push({ t: tau0, x: 0, v: 1 / cur });
    const list = [cur];
    if (hasFamilyFlow && !breathes) {
      for (let i = first + 1; i < bars.length && bars[i] < b - 0.5; i++) {
        const u = (bars[i] - a) / len, want = gearFor(arcsU(clamp(u + 0.05)), rate(bars[i]), meter);
        if (want === cur || tau(bars[i]) < tauNow) continue;
        // shift over at least a bar and at least 3 s, on bar lines
        let j = i + 1;
        while (j < bars.length - 1 && bars[j] - bars[i] < 3) j++;
        if (bars[j] > b) break;
        const ta = tau(bars[i]), tb = tau(bars[j]);
        phiNow += (ta - tauNow) / cur;
        track.push({ t: ta, x: phiNow, v: 1 / cur });
        const dPhi = (tb - ta) * (1 / cur + 1 / want) / 2;
        phiNow += dPhi >= 1.5 ? Math.round(dPhi) : dPhi;
        track.push({ t: tb, x: phiNow, v: 1 / want });
        tauNow = tb; cur = want; list.push(cur);
        i = j - 1;
      }
    }
    G.phiTrack = track; G.gears = list; G.tau0 = tau0;

    // Swells, where the song breathes in phrases: attack of at least .5 s ending on the phrase, then a 4 s decay
    if (A.swellRegularity > 0.5 && !pat.drive && (swellable(pat) || rand() < 0.4)) {
      const P = A.phraseBars || 8, solid = pat.solid ?? 1;
      const lo = a + (l0.holdIn || 0) + inDur + 0.8, hi = b - (l1.holdOut || 0) - outDur - 1;
      const on = [];
      for (let i = first; i < bars.length && bars[i] < hi; i++) if (bars[i] > lo && ((i - (A.phrase0 || 0)) % P + P) % P === 0) on.push(bars[i]);
      if (on.length) {
        const knots = [{ t: a, x: 0 }], amp = -0.28 * solid;
        on.forEach((o, n) => {
          const nextOn = on[n + 1] ?? Infinity, atk = Math.max(0.55, Math.min(0.8, 0.15 * (nextOn - o)));
          knots.push({ t: o - atk, x: 0 }, { t: o, x: amp }, { t: Math.min(o + 4, nextOn - atk - 0.01, hi + 0.5), x: 0 });
        });
        G.thetaBody = knots;
      }
    }

    gestures.push(G);
  }
  // After the last landing the film carries on, slowly, on its last pattern
  const finalPat = gestures.length ? gestures[gestures.length - 1].pattern : pool[0];
  gestures.push({ t0: tEnd, t1: tEnd + 3600, pattern: finalPat, arcs: [], phiTrack: [{ t: tau(tEnd), x: 0, v: 1 / 16 }], gears: [] });

  const landings = L.slice(1).map((l, j) => ({ B: +l.B.toFixed(3), kind: l.kind, form: l.form, pol: l.pol, holdOut: l.holdOut, holdIn: l.holdIn, dE: +(l.dE ?? 0).toFixed(3) }));
  const lens = gestures.slice(0, -1).map(g => g.t1 - g.t0);
  const plain = landings.filter(l => l.form === 'duty').length;
  const stats = {
    gestures: gestures.length - 1, medianLen: +median(lens).toFixed(1), minLen: +Math.min(...lens).toFixed(1), maxLen: +Math.max(...lens).toFixed(1),
    plainFraction: +(plain / Math.max(landings.length, 1)).toFixed(2),
    kinds: landings.reduce((o, l) => { o[l.kind] = (o[l.kind] || 0) + 1; return o; }, {}),
    replays: gestures.filter(g => g.replayOf != null).length,
    black: landings.filter(l => l.pol > 0).length, white: landings.filter(l => l.pol < 0).length,
    boundaryLanded: A.segments.slice(1).filter(s => landings.some(l => Math.abs(l.B - s.t0) < 0.3)).length + '/' + (A.segments.length - 1),
  };
  return {
    gestures, landings, stats, tau, rate, family, pool: pool.map(p => p.id), seed,
    phi: (t, G) => (G.phiTrack ? evalTrack(G.phiTrack, tau(t)) : tau(t) / 8),
    song: { duration, bpm: A.bpm, hash: A.hash, meter, phraseBars: A.phraseBars },
  };
}
