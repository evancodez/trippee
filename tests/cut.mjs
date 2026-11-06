// A hand cut, through and through. Each song gets a fresh page, as a person dropping one would. Muted: the song never plays out loud. See docs/DIRECTION.md section 7.
//   node tools/lab.mjs tests/cut.mjs --size 1280,720 --out lab-out/cut        both cuts
//   QUERY='?cut=restless'   another cut of the song.  SONGS=mgmt   only that one.  SKIP=format,flash,seek,end,strips   not those.  SEED=7   the film under it (a cut doesn't depend on it)
//
// Fails, and says why, on any of these:
//   refused     score.refused isn't empty, once it's loaded and once it's been rehearsed
//   identity    a film composed with no cut changes in any way because a cut has been composed
//   format      a made-up cut: a wrong hash and an unknown pattern aren't laid; an unknown lane, move or via is refused and the rest plays; a move by name gets its options and times; coin, shockout, a shock's turn, q and the pulse lane get there
//   flash       the judge's count on the whole film, at 12 fps and 30 fps through every transformation: whole 0, tile at most 2
//   pops        one frame's change of the whole frame's brightness that the frames round it don't explain: a hard cut, which a flash count can't see
//   seek        landing on a frame by a seek gives the same bytes as playing up to it, with every plan forgotten in between
//   end         the song played out in real time, muted, from near its end: the film rests with nothing thrown
// Writes <song>.strip.jpg (every 8 bars) and <song>.hits.jpg (each transformation, from its start to where it lands, with its hit marked). Those are for looking at. No number says a cut's any good.
import { createHash } from 'node:crypto';

const SONGS = (process.env.SONGS || 'mgmt,ppp').split(','), SKIP = new Set((process.env.SKIP || '').split(',')), SEED = +(process.env.SEED || 7);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const r2 = x => +(+x).toFixed(2);

function swingsOf(series) {
  const out = []; let dir = 0, pivot = series[0];
  series.forEach((v, i) => {
    if (dir >= 0 && v > pivot) { pivot = v; dir = 1; }
    if (dir <= 0 && v < pivot) { pivot = v; dir = -1; }
    if (dir === 1 && pivot - v >= 25.5) { out.push(i); dir = -1; pivot = v; }
    else if (dir === -1 && v - pivot >= 25.5) { out.push(i); dir = 1; pivot = v; }
  });
  return out;
}
function worstOf(series, fps, times, limit) {
  const sw = swingsOf(series), spans = []; let worst = 0;
  for (let a = 0; a < sw.length; a++) { let b = a; while (b < sw.length && sw[b] - sw[a] < fps) b++; const n = Math.floor((b - a) / 2); worst = Math.max(worst, n); if (n > limit) spans.push({ t: times[sw[a]], n }); }
  return { worst, spans };
}

export default async ({ page, save, log }) => {
  const failed = [], fail = (song, what) => { failed.push(`${song}: ${what}`); log(`  FAIL ${what}`); };
  for (const song of SONGS) {
    log(`\n=== ${song}`);
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await page.goto('http://localhost:5300/' + (process.env.QUERY || ''));
    for (let i = 0; i < 240; i++) { if (await page.eval('typeof window.trippee !== "undefined" && window.trippee.ready === true')) break; await sleep(250); }
    const logsAt = page.logs.length;
    await page.eval(async s => { await app.song.load(`/media/${s}.mp3`, { seed: 7 }); app.song.pause(); app.ui?.song?.show?.(false); }, song);

    // ------------------------------------------------- composed, identity, rehearsed
    const made = await page.eval(async ({ SEED }) => {
      const here = u => new URL(u, location.href).href;
      const [{ compose }, { rehearse }, { cutFor }, { auditCut }] = await Promise.all(['src/score/compose.js', 'src/music/rehearse.js', 'src/score/cuts/index.js', 'src/score/cut.js'].map(u => import(here(u))));
      const A = app.song.analysis, aspect = 16 / 9, o = { patterns: app.patterns, aspect };
      const prints = sc => JSON.stringify(sc.gestures.map(G => [G.t0, G.t1, G.pattern.id, G.morph ?? 0, G.xform?.id ?? null, (G.moves ?? []).map(m => m.id)]));
      const cut = await cutFor(A.hash);
      const before = prints(compose(A, SEED, o));
      const sc = compose(A, SEED, { ...o, cut });
      const after = prints(compose(A, SEED, o));
      window.__sc = sc;
      const atLoad = sc.refused.slice();
      const t0 = performance.now();
      const r = await rehearse(sc, Math.min(A.duration, 1200), () => {}, { lastTry: true });
      auditCut(sc, r);
      app.song.score = sc; app.stage.setScore(sc);
      return { hash: A.hash, name: cut?.name, line: cut?.line, same: before === after, atLoad, refused: sc.refused, seconds: (performance.now() - t0) / 1000, duration: A.duration, fixes: r.flash?.fixes, left: r.flash?.left, jumps: r.jumps, ways: r.ways,
        windows: sc.time?.windows ?? [], ambient: Array.from({ length: Math.ceil(A.duration) }, (_, t) => sc.ambient(sc.time ? sc.time(t) : t)),
        gestures: sc.gestures.map(G => ({ t0: r2(G.t0), t1: r2(G.t1), morph: r2(G.morph || 0), id: G.pattern.id, moves: (G.moves || []).map(m => m.id), xform: G.xform?.id, peak: G.peak, rise: G.rise, label: G.label, visit: G.visit })), cast: sc.cast, hits: sc.sheet?.hits };
      function r2(x) { return +(+x).toFixed(2); }
    }, { SEED });
    log(`${made.name}: ${made.line}`);
    log(`rehearsal ${made.seconds.toFixed(1)} s, jumps ${made.jumps?.length}, flash left ${JSON.stringify(made.left)}, fixes ${JSON.stringify(made.fixes)}`);
    log(`rests ${JSON.stringify(made.windows.map(w => [r2(w.from), r2(w.a), r2(w.b), r2(w.paid)]))}`);
    log(made.gestures.map(g => `  ${g.t0}-${g.t1} morph ${g.morph} ${g.id} [${g.moves.join(',')}] ${g.xform ?? ''}${g.rise != null ? (g.rise ? ' rise' : ' dive') : ''}${g.peak ? ` hit ${r2(g.peak.hit)} q${g.peak.q}` : ''} ${g.label ?? ''}${g.visit ?? ''}`).join('\n'));
    const under = made.ambient.filter(x => x < 0.9).length / made.ambient.length;
    log(`ambient under .9: ${(under * 100).toFixed(0)}% of the film`);
    if (!made.same) fail(song, 'composing a cut changed what a film with no cut is');
    if (made.atLoad.length) fail(song, `refused at load: ${JSON.stringify(made.atLoad)}`);
    if (made.refused.length > made.atLoad.length) fail(song, `refused by the rehearsal: ${JSON.stringify(made.refused.slice(made.atLoad.length))}`);

    // ------------------------------------------------- the format: what else a cut can ask for, and what happens when it can't have it
    if (!SKIP.has('format')) {
      const f = await page.eval(async () => {
        const here = u => new URL(u, location.href).href;
        const [{ compose }, { MOVES }] = await Promise.all(['src/score/compose.js', 'src/score/moves/index.js'].map(u => import(here(u))));
        const A = app.song.analysis, o = { patterns: app.patterns, aspect: 16 / 9 }, had = app.stage.score, out = {};
        const whole = { at: 0, id: 'lines.river' };
        out.wrong = compose(A, 7, { ...o, cut: { hash: 'nope', shots: [whole] } }).refused;
        out.unknown = compose(A, 7, { ...o, cut: { hash: A.hash, shots: [{ at: 0, id: 'no.such' }] } }).refused;
        let asked = null;
        MOVES.__t = { id: '__t', cue(m, c) { asked = { land: m.land, hits: m.hits, lane: m.lane, own: m.own, shot: c.shot?.at, bar: c.bar }; return m; }, write(out, { m }) { m.ran = true; } };
        const cut = { hash: A.hash, name: 'format', line: 'a test', shots: [
          { at: 0, id: 'lines.river', lanes: { scale: [[0, 1], [20, 2]], 'no.such': [[0, 1], [5, 2]] }, moves: [{ id: 'nobody' }, { id: '__t', own: 3, lane: [[5, 1], [9, 2, 'hit']], times: { land: 10, hits: [11, 12] } }] },
          { at: 30, from: 22, via: 'shockout', id: 'checks.vega', turn: 0.4 },
          { at: 50, from: 44, via: 'no such way', id: 'still.wheel', moves: [{ id: 'moire', k: 11, turn: [[52, 0], [66, 0.5]] }, { id: 'vertigo' }] },
          { at: 70, from: 62, via: 'rise', id: 'lines.fall', coin: { land: 100, beats: 16, pour: 0.5 }, q: 1.2, tail: 3, pulse: [[70, 0]] },
          { at: 110, from: 106, via: 'fall', id: 'checks.floor', countdown: { L: 120 } },
        ] };
        const sc = compose(A, 7, { ...o, cut });
        out.refused = sc.refused; out.asked = asked; out.line = sc.cut?.line; out.sheet = sc.sheet?.by; out.hits = sc.sheet?.hits?.length;
        out.moves = sc.gestures.map(G => (G.moves ?? []).map(m => m.id).join('+'));
        out.peaks = sc.gestures.map(G => G.peak?.q ?? null);
        out.turn = sc.gestures[0].xform?.turn;
        out.pulse = [sc.pulseLane(0), sc.pulseLane(75), sc.pulseLane(135)].map(x => +x.toFixed(2));
        // Every kind of frame draws, on a film nobody's rehearsed
        app.stage.setScore(sc); const T = window.trippee; let drew = 0;
        for (let t = 1; t < 125; t += 3) { T.seek(t); drew++; }
        out.drew = drew; out.ran = sc.gestures[0].moves.find(m => m.id === '__t')?.ran;
        delete MOVES.__t; app.stage.setScore(had);
        return out;
      });
      log(`FORMAT ${JSON.stringify(f).slice(0, 1500)}`);
      const why = f.refused.map(r => r.what).join(' | ');
      if (!f.wrong.length || !f.unknown.length) fail(song, 'a cut for another recording or an unknown pattern was laid');
      for (const w of ['lane no.such', 'move nobody', 'via no such way', 'move vertigo on still.wheel', 'fall into a countdown', 'countdown on checks.floor']) if (!why.includes(w)) fail(song, `no refusal for ${w}: ${why}`);
      if (!f.ran || f.asked?.own !== 3 || f.asked?.hits?.length !== 2 || f.asked?.lane?.[1]?.[2] !== 'hit' || !f.asked?.bar) fail(song, `a move by name didn't get what it was given: ${JSON.stringify(f.asked)}`);
      if (!f.moves[2]?.includes('moire') || !f.moves[3]?.includes('coin')) fail(song, `what a shot wears is wrong: ${f.moves}`);
      if (f.turn !== 0.4) fail(song, `a shock's turn didn't get there: ${f.turn}`);
      if (f.pulse[1] !== 0 || f.pulse[2] !== 1) fail(song, `the pulse lane says ${f.pulse}`);
    }

    // ------------------------------------------------- strips, while it's big enough to see
    if (!SKIP.has('strips')) {
      const sheets = await page.eval(async () => {
        const T = window.trippee, sc = window.__sc, A = app.song.analysis, g = sc.gestures;
        app.manual = true; app.governor.enabled = false; app.R.drawScale = 1; app.paused = false;
        const song = t => t;   // a caption's time is the picture's, which is the song's except just after a rest
        const sheet = (times, cols, tw, th, cap) => {
          const c = document.createElement('canvas'); c.width = cols * tw; c.height = Math.ceil(times.length / cols) * th; const x = c.getContext('2d'); x.font = '12px monospace';
          times.forEach((t, i) => {
            T.seek(t);
            const X = (i % cols) * tw, Y = (i / cols | 0) * th;
            x.drawImage(T.canvas, X, Y, tw - 2, th - 2);
            const lab = cap(t, i), w = x.measureText(lab).width + 6;
            x.fillStyle = '#000'; x.fillRect(X, Y, w, 15); x.fillStyle = '#f44'; x.fillText(lab, X + 3, Y + 11);
          });
          return c.toDataURL('image/jpeg', 0.85);
        };
        const every = 8 * (sc.song?.meter ?? 4) / (A.bpm / 60), times = [];
        for (let t = 0.5; t < A.duration; t += every) times.push(t);
        const strip = sheet(times, 8, 240, 135, t => `${t.toFixed(1)} ${app.lastFrame?.G?.pattern?.id ?? ''}`);
        // Each transformation, seven frames, the middle one on its hit
        const rows = [], caps = [];
        for (let i = 0; i + 1 < g.length; i++) {
          const G = g[i];
          if (!G.morph) continue;
          const a = G.t1 - G.morph, h = G.peak?.hit ?? G.t1, b = G.t1;
          for (const u of [0, 1 / 3, 2 / 3]) rows.push(a - 0.5 + (h - a + 0.5) * u), caps.push('');
          rows.push(h), caps.push('HIT');
          for (const u of [1 / 3, 2 / 3, 1]) rows.push(h + (b + 0.5 - h) * u), caps.push('');
        }
        const hits = sheet(rows, 7, 200, 113, (t, i) => `${caps[i]} ${t.toFixed(2)}`);
        return { strip, hits };
      });
      save(`${song}.strip.jpg`, sheets.strip); save(`${song}.hits.jpg`, sheets.hits);
    }

    // ------------------------------------------------- flashes and pops, small and fast, the judge's way
    if (!SKIP.has('flash')) {
      await page.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 360, deviceScaleFactor: 1, mobile: false });
      await sleep(300);
      const scan = await page.eval(async () => {
        const T = window.trippee, sc = window.__sc, g = sc.gestures, dur = app.song.duration;
        app.manual = true; app.governor.enabled = false; app.R.drawScale = 1;
        const c = document.createElement('canvas'); c.width = 320; c.height = 180; const x = c.getContext('2d', { willReadFrequently: true }), W = 320, H = 180;
        const look = () => {
          x.drawImage(T.canvas, 0, 0, W, H); const d = x.getImageData(0, 0, W, H).data; let sum = 0;
          const L = new Uint8Array(W * H); for (let k = 0; k < L.length; k++) { const v = (d[k * 4] * 0.2126 + d[k * 4 + 1] * 0.7152 + d[k * 4 + 2] * 0.0722) | 0; L[k] = v; sum += v; }
          const tiles = []; for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) { let s = 0, n = 0; for (let y = (ty * H / 4) | 0; y < ((ty + 1) * H / 4 | 0); y += 3) for (let X = (tx * W / 4) | 0; X < ((tx + 1) * W / 4 | 0); X += 3) { s += L[y * W + X]; n++; } tiles.push(+(s / n).toFixed(1)); }
          return { mean: +(sum / L.length).toFixed(2), tiles };
        };
        const walk = async (a, b, fps) => {
          const o = { mean: [], tiles: [], time: [], kinds: [] }, n = Math.floor((b - a) * fps);
          for (let i = 0; i < n; i++) { const t = a + i / fps; T.seek(t); const v = look(); o.mean.push(v.mean); o.tiles.push(v.tiles); o.time.push(+t.toFixed(3)); o.kinds.push(`${app.lastFrame?.kind ?? ''} ${app.lastFrame?.G?.pattern?.id ?? ''}`); if (i % 40 === 0) await new Promise(r => setTimeout(r)); }
          return o;
        };
        const whole = await walk(0, dur, 12), morphs = [];
        for (let i = 0; i + 1 < g.length; i++) if (g[i].morph) morphs.push({ a: g[i].t1 - g[i].morph - 1, ...(await walk(g[i].t1 - g[i].morph - 1, g[i].t1 + 1, 30)) });
        return { whole, morphs };
      });
      const judge = (o, fps) => {
        const w = worstOf(o.mean, fps, o.time, 0), tiles = Array.from({ length: 16 }, (_, k) => worstOf(o.tiles.map(a => a[k]), fps, o.time, 2));
        return { whole: w, tile: Math.max(...tiles.map(t => t.worst)), spots: [...w.spans.map(s => ({ ...s, who: 'whole' })), ...tiles.flatMap((t, k) => t.spans.map(s => ({ ...s, who: 't' + k })))].sort((a, b) => a.t - b.t) };
      };
      const J = judge(scan.whole, 12);
      log(`FLASH ${song} 12 fps: whole ${J.whole.worst} tile ${J.tile}`);
      for (const s of J.spots.slice(0, 12)) { const i = scan.whole.time.findIndex(t => t >= s.t); log(`  ${r2(s.t)} x${s.n} ${s.who} [${scan.whole.kinds[i]}]`); }
      if (J.whole.worst > 0) fail(song, `whole-frame flashes at 12 fps: ${J.whole.worst}`);
      if (J.tile > 2) fail(song, `tile flashes at 12 fps: ${J.tile}`);
      let worstM = 0, worstT = 0;
      for (const m of scan.morphs) { const q = judge(m, 30); worstM = Math.max(worstM, q.whole.worst); worstT = Math.max(worstT, q.tile); for (const s of q.spots.slice(0, 4)) log(`  morph ${r2(s.t)} x${s.n} ${s.who}`); }
      log(`FLASH ${song} 30 fps through ${scan.morphs.length} transformations: whole ${worstM} tile ${worstT}`);
      if (worstM > 0) fail(song, `whole-frame flashes in a transformation: ${worstM}`);
      if (worstT > 2) fail(song, `tile flashes in a transformation: ${worstT}`);
      // A pop: this frame's step in brightness against what's usual just round it. Printed; only a real jump fails.
      const steps = scan.whole.mean.map((v, i, a) => (i ? Math.abs(v - a[i - 1]) : 0)), tilesteps = scan.whole.tiles.map((v, i, a) => (i ? Math.max(...v.map((x, k) => Math.abs(x - a[i - 1][k]))) : 0));
      const top = steps.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v).slice(0, 5), topT = tilesteps.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v).slice(0, 5);
      log(`biggest steps, whole: ${top.map(p => `${scan.whole.time[p.i]}:${p.v.toFixed(1)}`).join('  ')}`);
      log(`biggest steps, a tile: ${topT.map(p => `${scan.whole.time[p.i]}:${p.v.toFixed(0)} [${scan.whole.kinds[p.i]}]`).join('  ')}`);
      if (top[0].v >= 40) fail(song, `a pop of ${top[0].v.toFixed(0)} of 255 at ${scan.whole.time[top[0].i]}`);
      await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
      await sleep(300);
    }

    // ------------------------------------------------- a seek lands on the same bytes as play
    if (!SKIP.has('seek')) {
      const seek = await page.eval(async () => {
        const T = window.trippee, sc = window.__sc, g = sc.gestures, dur = app.song.duration;
        app.manual = true; app.governor.enabled = false; app.R.drawScale = 1;
        const enc = new TextEncoder(), sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
        // Inside every transformation and body, on and off the hits
        const times = [];
        for (let i = 0; i + 1 < g.length; i++) { const G = g[i]; times.push((G.t0 + G.t1) / 2 + 0.013); if (G.morph) times.push(G.t1 - G.morph / 2, G.peak?.hit ?? G.t1 - 1, G.t1 + 0.25); }
        times.push(dur - 1);
        const forget = () => { for (const G of g) { delete G.plan; delete G.planFor; delete G.planning; for (const m of G.moves ?? []) if (m.id === 'star') delete m._path; } };
        const out = [];
        for (const t of times) {
          // play: 2 seconds up to it, at 30 fps
          for (let u = Math.max(0, t - 2); u < t - 1e-6; u += 1 / 30) T.seek(u);
          T.seek(t);
          const a = await sha(T.capture());
          // ...and from nothing, from somewhere else
          forget();
          T.seek((t + dur / 2) % dur);
          forget();
          T.seek(t);
          const b = await sha(T.capture());
          out.push({ t: +t.toFixed(3), same: a === b, kind: app.lastFrame?.kind ?? null });
          await new Promise(r => setTimeout(r));
        }
        return out;
      });
      const bad = seek.filter(s => !s.same);
      log(`SEEK ${song}: ${seek.length - bad.length} of ${seek.length} the same bytes${bad.length ? `; differ at ${bad.map(s => `${s.t}[${s.kind}]`).join(' ')}` : ''}`);
      if (bad.length) fail(song, `a seek didn't land on the same bytes at ${bad.map(s => s.t).join(', ')}`);
    }

    // ------------------------------------------------- the end, in real time, muted
    if (!SKIP.has('end')) {
      const end = await page.eval(async () => {
        const s = app.song, dur = s.duration;
        window.trippee.run(); app.paused = false;
        s.seek(dur - 12); s.play();
        await new Promise(r => setTimeout(r, 200));
        const a = s.time(); let rested = false, frames = 0, tick = () => { frames++; }; app.onFrame.push(tick);
        for (let i = 0; i < 200; i++) { await new Promise(r => setTimeout(r, 100)); if (s.resting) { rested = true; break; } }
        app.onFrame.splice(app.onFrame.indexOf(tick), 1);
        return { from: a, to: s.time(), rested, frames, state: s.contextState() };
      });
      log(`END ${song}: played from ${r2(end.from)} to ${r2(end.to)} of ${r2(made.duration)}, ${end.frames} frames, rested ${end.rested}, audio ${end.state}`);
      if (!end.rested) fail(song, "it never came to rest after the song's end");
    }
    const thrown = page.logs.slice(logsAt).filter(l => l.startsWith('[exception]') || l.startsWith('[error]'));
    if (thrown.length) fail(song, `the page complained: ${thrown.slice(0, 3).join(' | ').slice(0, 500)}`);
  }
  log(failed.length ? `\nCUT FAILED\n  ${failed.join('\n  ')}` : '\nCUT OK');
  if (failed.length) throw new Error(`${failed.length} failed`);
};
