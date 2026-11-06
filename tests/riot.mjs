// Look at a riot move on a real song's film, with no sound at all: the analysis is read from lab-out/form/, and the film stepped frame by frame.
//   MOVE=ratchet SONG=mgmt FROM=77.75 SECS=16 BEATS=strong node tools/lab.mjs tests/riot.mjs --out lab-out/v3
//   MOVE=scissor ... OPTS='{"every":8}'    settings for the move
//   HAND=1 ...                             no list: the pattern as a pick has it, with the song up
//   NOSONG=1 ...                           no song at all
// Writes <name>.sheet.jpg and <name>.slices.jpg, and prints flash, jerk and how close each hit's fastest frame is to the hit.
import { watch, analyse } from '../tools/look.mjs';
const env = process.env;
export default async ({ page, save, log }) => {
  const move = env.MOVE || 'ratchet', song = env.SONG || 'mgmt', from = +(env.FROM ?? 77.75), secs = +(env.SECS ?? 16), pat = env.PATTERN || `riot.${move}`, beatSpec = env.BEATS ? (env.BEATS.startsWith('[') ? JSON.parse(env.BEATS) : env.BEATS) : 'strong', opts = JSON.parse(env.OPTS || '{}'), fps = +(env.FPS || 60), name = env.NAME || `${song}-${pat.replace('riot.', '')}${env.HAND ? '-hand' : ''}${env.NOSONG ? '-nosong' : ''}`;
  await page.eval(`window.__env = { pulse: ${env.PULSE ?? 'null'}, ambient: ${env.AMBIENT ?? 'null'} }`);
  const info = await page.eval(async ({ move, song, from, secs, pat, beatSpec, opts, hand, nosong }) => {
    const T = window.trippee, app = T.app;
    app.governor.enabled = false; app.R.drawScale = 1; app.manual = true; app.paused = false;
    const { MOVES } = await import('/src/score/moves/index.js');
    const riot = (await import('/src/pattern/families/riot.js')).default;
    for (const p of riot) if (!app.byId[p.id]) { app.byId[p.id] = p; app.patterns.push(p); }
    for (const id of ['ratchet', 'scissor', 'bellows', 'wring']) if (!MOVES[id]) MOVES[id] = (await import(`/src/score/moves/${id}.js`)).default;
    const pattern = app.byId[pat];
    if (nosong) { T.load(pat); app.t = from; return { beats: [], bpm: 0 }; }
    const A = await (await fetch(`/lab-out/form/${song}.json`)).json();
    const { compose } = await import('/src/score/compose.js');
    const { hitsFor } = await import('/src/score/moves/surge.js');
    const { patterns } = await import('/src/pattern/library.js');
    const score = compose(A, 7, { patterns, aspect: 16 / 9 });
    app.stage.setScore(score);
    window.__score = score;
    const lo = from - 6, hi = from + secs + 6, g = score.gestures;
    const G = { ...g.find(x => x.t1 > from), t0: lo, t1: hi, arcEnd: hi, pattern, arcs: [], morph: 0, range: [0, 1], phiTrack: null, gears: [], plan: null, planFor: null, planning: null, xform: null, moves: undefined };
    let beats = hitsFor(beatSpec, { score, A, from, to: from + secs });
    if (!hand) {
      const raw = { id: move, beats: beatSpec, from, to: from + secs, lead: 1, coast: 1, ...opts };
      if (raw.teeth) raw.teeth = raw.teeth.map(score.time);
      const m = MOVES[move].cue ? MOVES[move].cue(raw, { score, A, G, at: score.time, bar: 1.92, beat: 0.48 }) : raw;
      if (!m) throw new Error('refused');
      G.moves = [m]; beats = m.beats;
    }
    delete G.flow; delete G.flowOver; delete G.thetaBody; delete G.over;
    const i = g.findIndex(x => x.t1 > lo);
    if (g[i].t1 >= hi) g.splice(i + 1, 0, { ...g[i], t0: hi, plan: null, planFor: null, planning: null });
    let k = i + 1; while (g[k].t1 < hi) k++;
    g[i].t1 = lo; g[i].morph = 0;
    g[k].t0 = hi;
    g.splice(i + 1, k - i - 1, G);
    if (window.__env?.pulse != null) score.pulseLane = () => window.__env.pulse;
    if (window.__env?.ambient != null) score.ambient = () => window.__env.ambient;
    app.t = from;
    T.seek(from);
    const P = score.react.pulses.filter(t => t >= from && t < from + secs);
    return { beats, pulses: P, bpm: A.bpm, strong: P.length > 1 ? (P.at(-1) - P[0]) / (P.length - 1) : 0, needs: true };
  }, { move, song, from, secs, pat, beatSpec, opts, hand: !!env.HAND, nosong: !!env.NOSONG });
  log(name, 'bpm', info.bpm, 'strong every', info.strong?.toFixed?.(3), 'hits', info.beats.length, 'needs', info.needs);
  const w = await watch(page, save, { name, seconds: secs, fps, cols: +(env.COLS || 10), rows: +(env.ROWS || 6) });
  const a = analyse(w);
  const med = (x) => [...x].sort((p, q) => p - q)[x.length >> 1];
  let worst = 0, at = 0;
  for (let i = fps; i < w.diff.length - fps; i++) { const m = Math.max(med(w.diff.slice(i - fps, i + fps + 1)), 0.5), q = w.diff[i] / m; if (q > worst) { worst = q; at = w.time[i]; } }
  // Is the fastest moment on the hit? The diff from frame i-1 to frame i. Look at a window of half the gap around each hit.
  const off = [];
  const hits = info.beats.length ? info.beats : (info.pulses ?? []);
  for (let h = 0; h < hits.length; h++) {
    const c = hits[h], gap = (hits[h + 1] ?? hits[h - 1] + 2 * (c - (hits[h - 1] ?? c - 1))) - c, half = Math.abs(gap) * 0.4;
    let best = -1, bi = -1;
    w.time.forEach((t, i) => { if (Math.abs(t - c) <= half && w.diff[i] > best) { best = w.diff[i]; bi = i; } });
    if (bi >= 0) off.push(+((w.time[bi] - c) * fps).toFixed(1));
  }
  const whites = w.white, minW = Math.min(...whites), maxW = Math.max(...whites), means = w.mean, minM = Math.min(...means), maxM = Math.max(...means);
  log(JSON.stringify({ flashWhole: a.flashesPerSecondWholeFrame, flashTile: a.flashesPerSecondAnyTile, jerkWorst: +worst.toFixed(2), jerkAt: +at.toFixed(2), medianDiff: a.medianDiff, maxDiff: a.maxDiff, stepMean: a.largestLuminanceStepPerFrame, mean: [+minM.toFixed(0), +maxM.toFixed(0)], white: [+minW.toFixed(2), +maxW.toFixed(2)], edges: a.edgeRange, grey: a.p95GreyAtNativeRes, framesFromHit: off.slice(0, 24) }));
  const errors = page.logs.filter(l => /\[error\]|\[exception\]/.test(l));
  if (errors.length) log('errors', errors.slice(0, 5));
  // With the song's own reactions off: is the picture on one hit exactly the picture on the next, or the one after, and how different is it half way between? Share of full scale.
  if (hits.length > 5) log('exactly itself', JSON.stringify(await page.eval(hits => {
    const T = window.trippee, app = T.app, W = 320, H = 180, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }), at = t => { T.seek(t); g.drawImage(T.canvas, 0, 0, W, H); return g.getImageData(0, 0, W, H).data; };
    const dif = (a, b) => { let d = 0; for (let i = 0; i < a.length; i += 4) d += Math.abs(a[i] - b[i]); return +(d / (W * H) / 255).toFixed(4); };
    const was = app.edits.reactAmt; app.edits.reactAmt = 0;
    const a = at(hits[2]), b = at(hits[3]), d = at(hits[4]), m = at((hits[2] + hits[3]) / 2);
    app.edits.reactAmt = was;
    return { nextHit: dif(a, b), twoHits: dif(a, d), halfWay: dif(a, m) };
  }, hits)));
  // A full frame at the hit and at a half-way point, for looking at it properly
  for (const [i, t] of [hits[2] ?? from + 1, (hits[2] ?? from + 1) + (((hits[3] ?? from + 3) - (hits[2] ?? from + 1)) / 2)].entries()) {
    const url = await page.eval(tt => { const T = window.trippee; T.seek(tt); return T.capture(); }, t);
    save(`${name}.frame${i}.png`, url);
  }
};
