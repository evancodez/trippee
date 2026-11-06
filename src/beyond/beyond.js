// Beyond: colour that separates out of black and white. The pattern is printed twice, and colour exists only where the two printings
// disagree. Nothing is tinted, nothing glows, nothing cycles: four flat inks, hard edges, and at zero offset it IS the black and white
// film, because the shader doesn't even take the plate path then.
//
// The second plate is the same phases moved (shader: plateMove), so it costs no extra evaluation of the families and runs straight
// through a morph. Each family moves by its own share, so a lattice translates instead of breaking up, and near-parallel pairs move
// against each other, which slides their moire fringes a long way: a tiny offset, huge bands of colour.
//
// All the numbers come from pure functions of the score and the time. The only state is what the person has asked for.
import { FRAME, OFF, FAMILIES } from '../pattern/layout.js';
import { base } from '../score/frame.js';
import { clamp, lerp, smoother, evalTrack } from '../score/curves.js';

// Along each period the plates give black, dark ink, paper-white, light ink, in that order: the luminance staircase that makes a still
// picture crawl (Kitaoka's snakes are black, blue, white, yellow). So every palette keeps a dark ink and a light ink, and they're chosen
// as a printer would choose them, never as RGB corners.
export const palettes = [
  { name: 'ultramarine and coral', paper: [0, 0, 0], dark: [20, 30, 196], ink: [255, 255, 255], light: [255, 92, 70] },
  { name: 'red and teal on cream', paper: [0, 0, 0], dark: [150, 20, 26], ink: [247, 238, 216], light: [26, 152, 128] },
  { name: 'cobalt and yellow', paper: [0, 0, 0], dark: [14, 56, 226], ink: [255, 255, 255], light: [250, 214, 20] },
  { name: 'violet and gold', paper: [0, 0, 0], dark: [84, 22, 170], ink: [250, 248, 240], light: [255, 178, 44] },
  { name: 'vermilion alone', paper: [0, 0, 0], dark: [226, 50, 20], ink: [250, 244, 232], light: [226, 50, 20], max: 0.62 },   // one ink, and mostly red would be a hard thing to look at
  { name: 'magenta and mint on night', paper: [10, 8, 40], dark: [176, 14, 100], ink: [240, 244, 236], light: [100, 214, 172] },
];
const lin = c => c.map(v => Math.pow(v / 255, 2.2));   // the shader raises to .4545, so a flat area comes back as exactly this byte
for (const p of palettes) p.lin = [...lin(p.paper), ...lin(p.dark), ...lin(p.ink), ...lin(p.light)];

const R_MAX = 0.12;       // an eighth of a period at most: a misregistered print, with the black and white still the picture, and never a four-band poster
const SHIFT = 0.0016;     // the plate's actual shift, as a share of the frame's height. Gives fine lines their wash
const FLOOR = 0.25;       // in a song's quietest sections: all but shut, a hairline of ink on each edge, so the mode is still plainly on

// ---------------------------------------------------------------- how far each family's second plate runs ahead
const weightCache = new WeakMap();
function weightsOf(pat) {
  let w = weightCache.get(pat);
  if (w) return w;
  const s = base(pat);
  w = [0, 0, 0, 0];
  const real = [], lines = [];
  for (let i = 0; i < FAMILIES; i++) {
    if (s[OFF[`f${i}.on`]] < 0.5 || Math.abs(s[OFF[`f${i}.d`]]) > 1.01) continue;
    const c = n => s[OFF[`f${i}.${n}`]];
    const v = [c('x'), c('y'), c('r1') + c('r2'), c('l1') + c('l2'), c('t1') + c('t2')];
    real.push({ i, v, len: Math.hypot(...v) || 1 });
    const flat = Math.hypot(c('x'), c('y'));
    if (Math.abs(c('r1')) + Math.abs(c('l1')) + Math.abs(c('t1')) + Math.abs(c('r2')) + Math.abs(c('l2')) + Math.abs(c('t2')) > 1e-6 || flat < 1e-6) w[i] = 1;   // rings, spokes, spirals: just ahead
    else lines.push({ i, x: c('x'), y: c('y'), len: flat });
  }
  // Two families saying nearly the same thing make fringes. Moved against each other, a small offset slides the fringes a long way.
  let beat = null;
  for (let a = 0; a < real.length && !beat; a++) for (let b = a + 1; b < real.length; b++) {
    const A = real[a], B = real[b], cos = A.v.reduce((sum, x, n) => sum + x * B.v[n], 0) / (A.len * B.len);
    if (Math.abs(cos) > 0.96) { beat = [A, B, Math.sign(cos)]; break; }
  }
  if (beat) { w[beat[0].i] = 0.5; w[beat[1].i] = -0.5 * beat[2]; }
  else if (lines.length) {
    // Otherwise the whole lattice slides one way, a true translation, in whichever direction moves its least-moved family the most.
    let best = -1, dx = 1, dy = 0;
    for (let n = 0; n < 48; n++) {
      const c = Math.cos(n * Math.PI / 48), z = Math.sin(n * Math.PI / 48);
      const m = Math.min(...lines.map(l => Math.abs(l.x * c + l.y * z) / l.len));
      if (m > best + 1e-4) { best = m; dx = c; dy = z; }
    }
    const top = Math.max(...lines.map(l => Math.abs(l.x * dx + l.y * dy))) || 1;
    for (const l of lines) w[l.i] = (l.x * dx + l.y * dy) / top;
  }
  // The staircase should crawl the way the pattern flows, so a held picture seems to carry on. (More phase runs with less picture.)
  const flow = pat.flow || {};
  const lean = w.reduce((sum, v, i) => sum + v * (flow[`f${i}.ph`] || 0), 0);
  if (lean > 0) w = w.map(v => -v);
  weightCache.set(pat, w);
  return w;
}
// A slide happens all in one slot, its numbers gliding family by family to their partners'. So the weights go the same way: each family
// ends up where its partner's weight says, or the plates would jump when the next pattern takes over. (Places as in frame.js applySlide.)
function slideWeights(wa, wb, plan) {
  const w = wa.slice();
  plan.pair.forEach((j, i) => { if (j >= 0) w[i] = plan.flip[j] ? -wb[j] : wb[j]; });
  for (const [j, at] of plan.places || []) w[at] = wb[j];
  return w;
}
// Four weights in one number, whole steps of 1/14, for one float of the block
const pack = (w, flip) => w.reduce((sum, v, i) => sum + Math.round(((flip?.[i] ? -v : v) + 1) * 14) * 2 ** (5 * i), 0);

// ---------------------------------------------------------------- when the plates are open
// A song opens them across what sounds like a chorus: the labels with the most energy, in the song's own terms. The quietest stay shut.
const songTables = new WeakMap();
function songTable(A) {
  let tab = songTables.get(A);
  if (tab) return tab;
  const segs = A.segments || [], fps = A.fps || 1, arc = A.arc;
  const energy = (a, b) => { if (!arc) return 0.5; let e = 0, n = 0; for (let f = Math.floor(a * fps); f < b * fps && f < arc.length; f += 4) { e += arc[f]; n++; } return n ? e / n : 0; };
  const byLabel = new Map();
  for (const s of segs) { const e = byLabel.get(s.label) || { sum: 0, len: 0 }; const l = s.t1 - s.t0; e.sum += energy(s.t0, s.t1) * l; e.len += l; byLabel.set(s.label, e); }
  const ranked = [...byLabel.entries()].map(([label, e]) => ({ label, e: e.sum / Math.max(e.len, 1e-3), len: e.len })).sort((a, b) => a.e - b.e);
  const total = ranked.reduce((a, r) => a + r.len, 0) || 1;
  const level = new Map();
  let run = 0;
  for (const r of ranked) { const mid = (run + r.len / 2) / total; run += r.len; level.set(r.label, FLOOR + (1 - FLOOR) * smoother((mid - 0.3) / 0.45)); }
  // Slow ramps across each boundary, and a chorus keeps opening as it goes
  const knots = [];
  let prev = FLOOR;
  segs.forEach((s, n) => {
    const len = s.t1 - s.t0, L = level.get(s.label) ?? 0;
    const ramp = clamp(len * 0.5, 6, 12);
    const a = Math.max(s.t0 - ramp / 2, knots.length ? knots[knots.length - 1].t + 0.1 : -1e3), b = s.t0 + ramp / 2;
    knots.push({ t: a, x: prev }, { t: Math.max(b, a + 0.1), x: L * 0.72 });
    const end = n + 1 < segs.length ? s.t1 - Math.min(len * 0.2, 5) : s.t1;
    if (end > b + 0.2) knots.push({ t: end, x: L });
    prev = knots[knots.length - 1].x;
  });
  // At most one stop in a song: the start of its quietest long stretch, long enough to catch up again before anything lands.
  let stop = null, low = Infinity;
  const need = DEC + STOP_LEN;
  if (arc) for (let a = A.duration * 0.15; a + need < A.duration * 0.95; a += 2) {
    const e = energy(a, a + need);
    if (e < low) { low = e; stop = a + DEC; }
  }
  tab = { knots, stop };
  songTables.set(A, tab);
  return tab;
}

// With no song they breathe, on two slow waves that never quite line up. They never quite shut: this is the mode you asked for.
const breath = t => 0.3 + 0.7 * smoother(0.5 + 0.5 * (0.72 * Math.sin(t * 2 * Math.PI / 47 - 0.8) + 0.28 * Math.sin(t * 2 * Math.PI / 71 + 1.4)));

// ---------------------------------------------------------------- the quadrature stop
// Everything comes to rest for a few seconds with the plates at exactly a quarter period, then catches up. Only ever a lag, so nothing
// can jump. The picture keeps crawling in your peripheral vision, if the staircase does its work.
const DEC = 2.5, HOLD = 5.5, RES = 2.5, FAST = 0.3, END = 6;
const LAG1 = DEC / 2 + HOLD + RES * (1 - FAST) / 2;
const CRUISE = (LAG1 - FAST * END / 2) / FAST;
const I5 = u => u * u * u * u * (u * (u - 3) + 2.5);    // the integral of smoother
function lagOf(t, a) {
  if (t <= a - DEC) return 0;
  if (t < a) return DEC * I5((t - a + DEC) / DEC);
  if (t < a + HOLD) return DEC / 2 + t - a;
  let x = t - a - HOLD;
  if (x < RES) { const u = x / RES; return DEC / 2 + HOLD + RES * (u - (1 + FAST) * I5(u)); }
  x -= RES;
  if (x < CRUISE) return LAG1 - FAST * x;
  x -= CRUISE;
  if (x < END) { const v = x / END; return Math.max(0, LAG1 - FAST * CRUISE - FAST * END * (v - I5(v))); }
  return 0;
}
const STOP_LEN = DEC + HOLD + RES + CRUISE + END;
const wanderStop = t => { const n = Math.floor((t - 150 + 60) / 300); return 150 + 300 * Math.max(n, 0); };   // the nearest one that could matter
const stopEnv = (t, a) => (a == null ? 0 : smoother((t - a + 7) / 7) * (1 - smoother((t - a - HOLD) / 7)));

// ---------------------------------------------------------------- start
export function init(app) {
  let active = false, level = 0, pinned = null, force = null, paused = 0;
  // A stop only counts if its rest starts while colour is on and this score is up. Anything else would make the clock suddenly lag.
  let from = Infinity, until = Infinity, seen = null;
  let shown = palettes[0].lin.slice(), fadeFrom = null, fade = 1;

  const analysis = score => (score?.song && app.song?.analysis?.hash === score.song.hash ? app.song.analysis : null);
  const stopFor = (t, score) => {
    if (score !== seen) { seen = score; from = t; }
    const A = score?.song ? analysis(score) : null;
    const a = score?.song ? (A ? songTable(A).stop : null) : wanderStop(t);
    return a == null || a - DEC < from || a - DEC >= until ? null : a;
  };
  function openAt(t, score) {
    if (force != null) return force;
    const A = analysis(score);
    let x = A ? evalTrack(songTable(A).knots, t) : breath(t);
    const env = Math.max(stopEnv(t, stopFor(t, score)), paused);
    x = 1 - (1 - clamp(x)) * (1 - env);
    return x;
  }

  // Which palette a gesture is printed in. By section in a song, so a chorus comes back in its own inks. Otherwise it wanders, a change
  // every few gestures. Either way it only ever changes on the way through a morph.
  function inkOf(G, score) {
    if (pinned != null) return pinned;
    if (G.inkN == null) {
      if (G.label != null) {
        const labels = score.inkLabels ??= [...new Set(score.gestures.map(g => g.label).filter(l => l != null))].sort();
        // A very long section moves on to the next inks rather than sitting in one for minutes
        const seg = analysis(score)?.segments?.find(x => G.t0 >= x.t0 - 0.5 && G.t0 < x.t1);
        G.inkN = (Math.max(labels.indexOf(G.label), 0) + (seg ? Math.floor(Math.max(G.t0 - seg.t0, 0) / 100) : 0)) % palettes.length;
      } else G.inkN = Math.floor(Math.max(G.t0, 0) / 95) % palettes.length;
    }
    return G.inkN;
  }

  const F_ = n => FRAME[n] * 4;
  const engine = {
    // the score's clock, with the stops taken out of it
    time(t, score) {
      if (force != null) return t;
      const a = stopFor(t, score);
      return a == null || t > a + STOP_LEN ? t : t - lagOf(t, a);
    },
    write(F, t, score, ga, gb, T, plan) {
      let open = openAt(t, score) * smoother(level);
      if (open < 1e-4) return;          // shut: no plate numbers at all, so this frame takes the black and white path
      const a = palettes[inkOf(ga, score)], b = gb ? palettes[inkOf(gb, score)] : a;
      open *= lerp(a.max ?? 1, b.max ?? 1, T);
      const r = R_MAX * open;
      const c = app.R, h = c.canvas.height * c.drawScale;
      const ang = 0.9 + engine.time(t, score) * 0.031, s = SHIFT * h * open;      // it rests during a stop like everything else
      F[F_('plate') + 1] = r;
      F[F_('plate') + 2] = s * Math.cos(ang);
      F[F_('paper') + 3] = s * Math.sin(ang);
      F[F_('band1') + 3] = pack(weightsOf(ga.pattern));
      F[F_('band2') + 3] = gb ? (plan?.kind === 'slide' ? pack(slideWeights(weightsOf(ga.pattern), weightsOf(gb.pattern), plan)) : pack(weightsOf(gb.pattern), plan?.flip)) : 0;
      // In a slide this is how far the weights have gone. In a flight, how open the outer pattern's plates are: a plate that's a quarter
      // period out wouldn't be filling the frame when the flight says its element is, so they shut on the way in and open on the way out.
      F[F_('ink') + 3] = plan?.kind === 'slide' ? T : plan?.kind === 'dive' ? 1 - smoother(T / 0.8) : plan?.kind === 'rise' ? smoother((T - 0.2) / 0.8) : 0;
      // The inks: this gesture's, or on the way to the next one's through the morph, and slowly to anything picked by hand
      for (let i = 0; i < 12; i++) {
        const v = lerp(a.lin[i], b.lin[i], T);
        shown[i] = fadeFrom ? lerp(fadeFrom[i], v, smoother(fade)) : v;
      }
      // Paper and white are only ever black and white when shut, and arrive at their inks as the plates open.
      const k = smoother(open / 0.3);
      for (let i = 0; i < 3; i++) {
        F[F_('paper') + i] = k * shown[i];
        F[F_('band2') + i] = shown[3 + i];       // the dark ink: comes first going up the phase
        F[F_('ink') + i] = lerp(1, shown[6 + i], k);
        F[F_('band1') + i] = shown[9 + i];       // the light ink
      }
    },
  };

  const b = app.beyond = {
    palettes,
    get active() { return active; },
    get palette() { return pinned ?? (app.lastFrame?.G ? inkOf(app.lastFrame.G, app.stage.score) : 0); },
    stopAt: t => stopFor(t, app.stage.score),
    openAt: t => openAt(t, app.stage.score),
    // Still catching up from a stop, turning it off and on again changes nothing. Otherwise the stops count from now.
    on() { if (!(app.edits.beyond && engine.time(app.t, app.stage.score) !== app.t)) from = app.t; until = Infinity; active = true; app.edits.beyond = engine; },
    off() { active = false; until = app.t; },
    toggle() { if (active) b.off(); else b.on(); return active; },
    setPalette(i) { pinned = ((i % palettes.length) + palettes.length) % palettes.length; fadeFrom = shown.slice(); fade = 0; },
    // for looking at it: all the way there at once, at a chosen opening
    snap(open = null) { level = active ? 1 : 0; force = open; fade = 1; fadeFrom = null; if (active) app.edits.beyond = engine; else app.edits.beyond = null; },
  };

  // How far "on" this is moves a little each frame, about six seconds, and any pick by hand about two, so the mix of two inks doesn't linger.
  app.onFrame.push(() => {
    level = clamp(level + (active ? 1 : -1) / 360);
    if (fade < 1) { fade = Math.min(1, fade + 1 / 130); if (fade === 1) fadeFrom = null; }
    paused = clamp(paused + (active && app.paused && !app.clock ? 1 : -1) / 180);
    // Turned off in the middle of a stop, its clock still has to catch up before it can let go, or the picture would jump.
    app.edits.beyond = active || level > 0 || (app.edits.beyond && engine.time(app.t, app.stage.score) !== app.t) ? engine : null;
  });

  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.repeat || e.key.toLowerCase() !== 'b') return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.shiftKey) { if (!active) b.on(); b.setPalette(b.palette + 1); app.ui?.say?.(palettes[b.palette].name); return; }
    app.ui?.say?.(b.toggle() ? 'colour' : 'black and white');
  });
}
