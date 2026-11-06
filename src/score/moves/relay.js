// Relay. Pattern to pattern, endlessly, with no flight and nothing laid over anything: one family of lines closes as another opens, and between them the picture is one pattern after
// another. A family closed at d = -1 is nothing at all to the XOR, so while it's shut it can be rewritten into anything, unseen. One family is always at d = 0, half and half, and then
// whatever the others do the frame stays half white: there's no brightness to flash.
//
// A sequence names its voices (each a family's numbers) and the states it goes through, as strings of voice names: 'ab' is a and b both open. Each state has to share a voice with the next,
// and the last with the first. What's in both stays put at half; what's only in the one before closes; what's only in the one after opens. 'ab' to 'bc': a closes through b as c opens.
// 'ab' to 'b' to 'bc' takes the same voices through plain b on the way.
//
// Two clocks, and the same picture on either:
//   By hand, or a pick from the library: a step every `each` cycles of the clock, so it's as fast as what it's on.
//   From a cut, in song seconds: G.moves = [relayMove('whirl', { on: [t, t, t...] })]. Each `on` is the moment the next state arrives: the changing families cross at their fastest exactly
//     there, half open, and coast the rest of the way in `tail` seconds. Nothing's fastest before its moment and nothing has stopped by it. `lead` is how long before it starts. tail: 0 for
//     the opening to finish there and stop, which is the slowest frame on the moment and only for a song that really does stop.
//   relayChords(M, a, b) gives the chord starts of a passage, to pass as on.
//
// A sequence may carry lanes: numbers that wander with the relay, [[step, value], ...], going round with the sequence. They run steadily, not in steps, so they keep moving through a hold.
// See src/pattern/families/relays.js for the patterns these are worn on, and tests/relay.mjs.
import { OFF } from '../../pattern/layout.js';
import { clamp, smoother, evalTrack } from '../curves.js';
import { plane, ring, logring, spokes, spiral } from '../../pattern/kit.js';
import { Q } from '../../pattern/genome.js';

const COEF = ['x', 'y', 'z', 'r1', 'l1', 't1', 'r2', 'l2', 't2'];
const SLOTS = [0, 1, 2, 3].map(i => ({ ph: OFF[`f${i}.ph`], d: OFF[`f${i}.d`], on: OFF[`f${i}.on`], c: COEF.map(n => OFF[`f${i}.${n}`]) }));

// Which way the lines run: flow is in cycles of the clock.
const go = (v, flow) => ({ ...v, flow });

export const SEQS = {
  // Square tiles, slanted tiles, diamonds, slanted the other way. Lattices only, so each is a real tiling, and with three half open there are triangles on the way through. The sheet hangs loose and swings.
  weave: {
    voices: { a: go(plane(1.5, 0), 0.5), b: go(plane(1.5, 90), -0.5), c: go(plane(1.7, 45), 0.5), d: go(plane(1.7, 135), -0.5) },
    states: ['ab', 'bc', 'cd', 'da'],
    g: { wob: 0.04, wobF: 1.1 },
    lanes: { 'bend1.a': [[0, 0.04], [1, 0.26], [2, 0.04], [3, -0.26], [4, 0.04]], 'bend2.a': [[0, 0.2], [2, -0.2], [4, 0.2]] },
    fixed: { 'bend1.f': 0.8, 'bend1.ang': 1.5708, 'bend2.f': 0.6, 'bend2.ang': 0 },
    arcs: [{ path: 'rot', from: -0.3, to: 0.3 }, { path: 'scale', from: 0.9, to: 1.3, log: true }],
  },
  // The spec's own: a checker thins to stripes, rings open through the stripes, the stripes close, spokes open through the rings: a dartboard, then rays, then rays through diagonals, and back to the check.
  tour: {
    voices: { x: go(plane(2.6, 0), 0.7), y: go(plane(2.6, 90), -0.7), r: go(ring(3.1), -1.2), s: go(spokes(14), 0.5), d: go(plane(2.2, 45), 0.8) },
    states: ['xy', 'y', 'yr', 'r', 'rs', 's', 'sd', 'd', 'dx', 'x'],
    arcs: [{ path: 'rot', from: -0.3, to: 0.3 }],
  },
  // Everything about one point, even in log radius, so every state is the same cells turned: a target, a pinwheel one way, a rosette of diamonds, a pinwheel the other way, and rings alone. It winds tighter as it goes.
  whirl: {
    voices: { l: go(logring(3), -0.45), s: go(spokes(12), 0.25), p: go(spiral(2.1, 12), -0.4), q: go(spiral(2.1, -12), 0.4), w: go(spiral(1.05, 6), -0.5) },
    states: ['ls', 'sp', 'pq', 'ql', 'l', 'lw', 'wq', 'qs'],
    lanes: { 'swirl.log': [[0, 0], [2, 0.5], [4, 0], [6, -0.5], [8, 0]] },
    arcs: [{ path: 'scale', from: 0.8, to: 1.5, log: true }],
  },
  // Rings about two points. Each lot alone, then the two through each other in a moire you could hang on a wall, then what they add up to: ellipses through hyperbolas, a checker curved round both.
  dipole: {
    voices: { a: go(ring(3.2), -1.2), b: go(ring(3.2, {}, 2), -1.2), e: go({ r1: 2.5, r2: 2.5 }, -1), h: go({ r1: 2.5, r2: -2.5 }, 0.5) },
    states: ['a', 'ab', 'be', 'eh', 'ha'],
    g: { p1: { x: -0.85, y: 0 }, p2: { x: 0.85, y: 0 } },
    lanes: { 'p1.x': [[0, -0.85], [2.5, -1.15], [5, -0.85]], 'p2.x': [[0, 0.85], [2.5, 1.15], [5, 0.85]], 'p1.y': [[0, 0], [1.25, 0.25], [3.75, -0.25], [5, 0]], 'p2.y': [[0, 0], [1.25, -0.25], [3.75, 0.25], [5, 0]] },
    arcs: [{ path: 'rot', from: -0.2, to: 0.2 }],
  },
  // A kaleidoscope: the same relay in six mirrored wedges, so stripes are a star, rings are petals, spokes are a burst and a check is a snowflake. The mirrors turn slowly and the middle swirls.
  star: {
    voices: { a: go(plane(2.9, 20), 0.4), b: go(plane(2.9, 110), -0.4), r: go(ring(3.2), -0.6), c: go(plane(2.5, 65), 0.4), s: go(spokes(18), 0.25) },
    states: ['ab', 'br', 'rc', 'cs', 'sa'],
    g: { fold: { n: 6 } },
    lanes: { 'swirl.a': [[0, 0], [1.25, 1.1], [2.5, 0], [3.75, -1.1], [5, 0]] },
    fixed: { 'swirl.sig': 1.1 },
    arcs: [{ path: 'fold.rot', from: -0.5, to: 0.5 }, { path: 'scale', from: 0.95, to: 1.25, log: true }],
  },
  // Sawteeth: everything goes through a zigzag, so stripes are chevrons, rings are cogs and the check is a herringbone. The teeth grow and shrink as the voices change.
  saw: {
    voices: { y: go(plane(2.8, 90), -0.55), x: go(plane(2.2, 0), 0.45), r: go(ring(2.8), -0.6), d: go(plane(2.4, 45), 0.5), u: go(plane(2.4, 135), -0.5) },
    states: ['yx', 'xr', 'rd', 'du', 'uy'],
    g: { zig: { c: 1.1, b: 0, n: 0 } },
    lanes: { 'zig.a': [[0, 0.16], [1.25, 0.42], [2.5, 0.2], [3.75, 0.5], [5, 0.16]] },
    arcs: [{ path: 'rot', from: -0.16, to: 0.16 }, { path: 'scale', from: 1.2, to: 0.85, log: true }],
  },
  // Rooms: rings with corners about a point that wanders. Nested squares thin out to spokes, turn to diamonds behind your back, and come back as nested diamonds through a check.
  rooms: {
    voices: { r: go(ring(2.3), -0.6), s: go(spokes(8, { ph: 0.25 }), 0.3), x: go(plane(2, 0), 0.4), y: go(plane(2, 90), -0.4), t: go(ring(1.4), 0.6) },
    states: ['rs', 's', 'sx', 'xy', 'yt', 'tr'],
    g: { p1: { q: 1, ay: 1.4 } },
    lanes: { 'p1.q': [[0, 1], [2, 1], [3, -1], [5, -1], [6, 1]], 'p1.x': [[0, -0.2], [3, 0.2], [6, -0.2]], 'p1.y': [[0, 0.1], [3, -0.1], [6, 0.1]] },
    arcs: [{ path: 'rot', from: -0.15, to: 0.15 }],
  },
  // A floor. The same relay in perspective, the camera swinging over it: check, rings like a pool, rays out of a point on the ground. Tipped only as far as the far lines stay lines.
  floor: {
    voices: { x: go(plane(1.5, 0), 0.5), y: go(plane(1.5, 90), -0.5), r: go(ring(1.9), -0.9), s: go(spokes(10), 0.3), d: go(plane(1.3, 45), 0.6) },
    states: ['xy', 'yr', 'rs', 'sd', 'dx'],
    g: { surf: { kind: 1, map: 0 }, q: Q.plane, cam: { pitch: 0.7, dist: 1.6, yaw: 0, roll: 0 } },
    lanes: { 'cam.pitch': [[0, 0.45], [2.5, 0.85], [5, 0.45]], 'cam.yaw': [[0, -0.4], [2.5, 0.4], [5, -0.4]], 'cam.roll': [[0, 0.12], [2.5, -0.12], [5, 0.12]] },
    arcs: [{ path: 'scale', from: 0.9, to: 1.3, log: true }],
  },
};

// What a sequence is, worked out once: which voice is where, and which family it has while it's open. Slots go round in the order voices open, so nothing moves slot while it's open.
export function compile(seq) {
  if (seq._c) return seq._c;
  const states = seq.states.map(s => [...s]), L = states.length;
  for (let p = 0; p < L; p++) if (!states[p].some(v => states[(p + 1) % L].includes(v))) throw new Error(`relay: ${seq.states[p]} shares no voice with ${seq.states[(p + 1) % L]}`);
  const at = states.map(() => ({}));
  let N = 0;
  for (let p = 0; p < L; p++) for (const v of states[p]) {
    if (states[(p - 1 + L) % L].includes(v)) continue;
    const j = N++;
    for (let k = 0; k < L && states[(p + k) % L].includes(v); k++) at[(p + k) % L][v] = { j, back: p + k >= L ? -1 : 0 };
  }
  for (const v of new Set(states.flat())) if (states.every(s => s.includes(v))) throw new Error(`relay: voice ${v} never closes, so it needs no relay`);
  const mod = (a, n) => ((a % n) + n) % n;
  const clash = n => {
    for (let i = 0; i < 4 * L * n; i++) {
      const p = mod(i, L), q = mod(i + 1, L), seen = new Set();
      for (const v of new Set([...states[p], ...states[q]])) {
        const e = at[p][v] ?? at[q][v], loop = Math.floor((at[p][v] ? i : i + 1) / L), s = mod((loop + e.back) * N + e.j, n);
        if (seen.has(s)) return true;
        seen.add(s);
      }
    }
    return false;
  };
  let slots = 2;
  while (slots < 4 && clash(slots)) slots++;
  if (clash(slots)) throw new Error('relay: more than four families open at once');
  const voices = {};
  for (const v of new Set(states.flat())) {
    const o = seq.voices[v];
    if (!o) throw new Error(`relay: no voice ${v}`);
    voices[v] = { c: COEF.map(n => o[n] ?? 0), ph: o.ph ?? 0, flow: o.flow ?? 0 };
  }
  // Going round: lanes are smooth through their knots, and through the seam
  const lanes = Object.entries(seq.lanes ?? {}).map(([path, keys]) => {
    const per = keys.at(-1)[0] - keys[0][0], n = keys.length - 1;
    const slope = i => (keys[i + 1][1] - keys[i][1]) / (keys[i + 1][0] - keys[i][0]);
    const track = keys.map((k, i) => {
      const a = slope(i === 0 || i === n ? n - 1 : i - 1), b = slope(i === 0 || i === n ? 0 : i);
      return { t: k[0], x: k[1], v: a * b > 0 ? 2 * a * b / (a + b) : 0 };     // harmonic: nothing overshoots and nothing stops at a knot it's moving through
    });
    return { off: OFF[path], track, t0: keys[0][0], per };
  });
  const fixed = Object.entries(seq.fixed ?? {}).map(([path, x]) => [OFF[path], x]);
  return (seq._c = { states, L, at, N, slots, voices, lanes, fixed, mod });
}

// Half open exactly at x = h and at its fastest there, going in and coasting out; at rest at both ends. tail = 1 - h decides how fast. From the morph's own `peaked` (docs/DIRECTION.md, Timing).
export function crossT(x, h = 0.65, q = 2) {
  x = clamp(x);
  h = clamp(h, 0.2, 0.92);
  const p = q * h / (1 - h), w = x < h ? 0.5 * Math.pow(x / h, p) : 1 - 0.5 * Math.pow((1 - x) / (1 - h), q);
  return smoother(w);
}

// The picture at state i, T of the way to state i + 1, s steps along for the lanes.
export function writeRelay(out, seq, i, T, s, phi) {
  const c = compile(seq), { states, L, at, N, slots, voices, mod } = c;
  const p = mod(i, L), q = mod(i + 1, L), loop = Math.floor(i / L), loopQ = Math.floor((i + 1) / L);
  for (let k = 0; k < slots; k++) {
    const F = SLOTS[k];
    out[F.on] = 1; out[F.d] = -1; out[F.ph] = 0;
    for (let n = 0; n < COEF.length; n++) out[F.c[n]] = 0;
    out[F.c[0]] = 1;       // something for a shut family to be, or it has no size at all
  }
  const put = (v, e, lp, d) => {
    const F = SLOTS[mod((lp + e.back) * N + e.j, slots)], o = voices[v];
    out[F.d] = d;
    out[F.ph] = o.ph + o.flow * phi;
    for (let n = 0; n < COEF.length; n++) out[F.c[n]] = o.c[n];
  };
  for (const v of states[p]) put(v, at[p][v], loop, states[q].includes(v) ? 0 : -T);
  for (const v of states[q]) if (!states[p].includes(v)) put(v, at[q][v], loopQ, T - 1);
  for (const [off, x] of c.fixed) out[off] = x;
  for (const l of c.lanes) { const w = l.t0 + mod(s - l.t0, l.per); out[l.off] = evalTrack(l.track, w); }
}

// By hand: a step every `each` cycles of the clock, busy for this share of it.
export function handRelay(out, seq, phi, { each = 1, busy = 0.72, h = 0.68, from = 0 } = {}) {
  const s = phi / each + from, i = Math.floor(s), f = s - i;
  writeRelay(out, seq, i, crossT((f - (1 - busy)) / busy, h), s, phi);
}

// When each change runs. A change can't take up more than its share of the time either side of its moment, so nothing overlaps however close the chords are.
function timetable(m) {
  if (m._w) return m._w;
  const on = m.on, n = on.length, lead = m.lead ?? 2, tail = m.tail ?? 1, w = [];
  for (let k = 0; k < n; k++) {
    const before = k ? on[k] - on[k - 1] : Infinity, after = k + 1 < n ? on[k + 1] - on[k] : Infinity;
    const l = Math.max(Math.min(lead, 0.62 * before), 1e-3), r = Math.max(Math.min(tail, 0.3 * after), 0);
    w.push({ a: on[k] - l, hit: on[k], b: on[k] + r, h: l / (l + r) });
  }
  // The lanes' steps: one between each moment and the next, smooth through all of them
  const first = m.from ?? 0, track = on.map((t, k) => {
    const a = k ? 1 / (t - on[k - 1]) : 1 / ((on[1] ?? t + 4) - t), b = k + 1 < n ? 1 / (on[k + 1] - t) : a;
    return { t, x: first + k + 1, v: 2 * a * b / (a + b) };
  });
  return (m._w = { w, track, first });
}

export function timedRelay(out, seq, m, t, phi) {
  const { w, track, first } = timetable(m);
  let lo = -1, hi = w.length - 1;
  while (lo < hi) { const c = (lo + hi + 1) >> 1; if (w[c].a <= t) lo = c; else hi = c - 1; }
  let i = first, T = 0;
  if (lo >= 0) {
    const e = w[lo];
    if (t >= e.b) i = first + lo + 1;
    else { i = first + lo; T = e.b > e.hit ? crossT((t - e.a) / (e.b - e.a), e.h) : smoother((t - e.a) / (e.b - e.a)); }
  }
  writeRelay(out, seq, i, T, evalTrack(track, t), phi);
}

// How a cut asks for one, or anyone else who's building a gesture. Song seconds, already through score.time if the film has rests.
//   on     when each next state arrives
//   lead   seconds a change starts before its moment. Default 2
//   tail   seconds it coasts after. Default 1. 0: it finishes on its moment.
//   from   which state it starts on
export const relayMove = (seq, { on, lead, tail, from = 0 } = {}) => ({ id: 'relay', seq, on, lead, tail, from });

// The chord starts between a and b, for on. A chord under `shortest` seconds is passing through; `gap` keeps them this far apart (a step takes time to be seen); `every` takes every nth.
export function relayChords(M, a, b, { shortest = 1.2, gap = 1.5, every = 1 } = {}) {
  const out = [];
  let n = 0;
  for (const r of M.runs ?? []) {
    if (r.t0 <= a || r.t0 >= b || r.t1 - r.t0 < shortest) continue;
    if (out.length && r.t0 - out.at(-1) < gap) continue;
    if (n++ % every === 0) out.push(r.t0);
  }
  return out;
}

export default {
  id: 'relay',
  needs: () => true,
  // How a cut asks, by name: moves: [{ id: 'relay', seq: 'whirl', times: { on: [...] } }], or chords: true for the chord starts of the shot, or bars: n for a change every n bars from where it starts.
  // every, gap, shortest as relayChords. leadBars, tailBars as lead and tail, in bars. Leave seq out on a relay.* pattern and it's that pattern's.
  cue(m, { M, G, at, bar }) {
    const end = (G.morph ? G.t1 - G.morph : G.t1) - bar;
    if (m.chords) m.on = relayChords(M, G.t0, end, { every: m.every, gap: m.gap, shortest: m.shortest });
    else if (m.bars) {
      const lines = M.bars ?? [], near = t => lines.reduce((b, x) => (Math.abs(x - t) < Math.abs(b - t) ? x : b), t);
      m.on = [];
      for (let t = G.t0 + m.bars * bar; t < end; t += m.bars * bar) m.on.push(near(t));     // on the song's own bar lines, where it has them
    }
    else if (!m.on?.length) return m;      // no times: it runs on the shot's own clock, a step a cycle
    if (m.chords) m.on = m.on.map(at);
    if (m.leadBars != null) m.lead = m.leadBars * bar;
    if (m.tailBars != null) m.tail = m.tailBars * bar;
    return m.on.length ? m : null;
  },
  write(out, { t, phi, G, m }) {
    const seq = typeof m.seq === 'string' ? SEQS[m.seq] : m.seq ?? SEQS[G.pattern.relay];
    if (!seq) return;
    if (m.on?.length) timedRelay(out, seq, m, t, phi);
    else handRelay(out, seq, phi, m);
  },
};
