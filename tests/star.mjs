// Star Sphere. STAGE=ends,walk,chords node tools/lab.mjs tests/star.mjs --out lab-out/star
//   ends     exactly flat until it starts and after it closes, under .1/255 the frame either side, and with the flag off nothing has changed
//   walk     R from 40 to 2.2 at 60 fps: a plain roll and a chord map, with no pop
//   chords   a made-up progression: the same chord gives the same picture, wherever the ball came from. Prints differences, with a sheet and time-slices
//   roll     PATS=... EXTRA='v:.4,' G="arcs:[...]," a sheet and time-slices of a plain roll
//   song     SONG=media/ppp.mp3 BODY=lines.river START=60 END=110 REACT=.3: a real film with a star placed in it as the director will, a sheet and 60 fps scans of each boundary. CLOSE=1 unrolls first.
//   bodies   white, edges and grey of each body in a made-up film. atlas: every pattern that can wear it, in flowers. stills: PATS against R.
//   leaves   every kind of transformation into and out of a rolled ball. modes: purity, colour, tools, static, a pick. rehearse: placed before the rehearsal.
//   crops, crops2  full frames on the creases, at 1 and 2 device pixels. cost: the program with the star against without, when it isn't worn. coston: what wearing it costs.
import { watch } from '../tools/look.mjs';
const STAGES = (process.env.STAGE || 'stills').split(',');
export default async ({ page, save, log, sleep }) => {
  for (let i = 0; i < 400 && !(await page.eval('window.trippee?.ready===true')); i++) await sleep(100);
  await page.eval(`app.governor.enabled=false; document.querySelector('#hints')&&(document.querySelector('#hints').hidden=true);`);
  const errors = () => page.logs.filter(l => /\[error\]|\[exception\]/.test(l));

  // A score of one gesture wearing it: t0 flat until then. Extra is the move's own numbers, as text.
  const setup = (id, extra = '', G = '') => `(async()=>{ const { starMove } = await import(new URL('src/score/moves/star.js', location.href).href);
    const s = app.stage, tau = t => t * 2, phi = t => tau(t) / 8;
    s.score = { gestures: [], phi: (t, G) => phi(t), tau, song: null, handover: null };
    const G = { t0: -5, t1: 3600, arcEnd: 60, pattern: app.byId[${JSON.stringify(id)}], ${G} moves: [starMove({ t0: 2, open: 16, seed: 3, ${extra} })] };
    s.score.gestures = [G]; s.hold = true; window.__G = G; app.t = 0; trippee.seek(0); })()`;

  if (STAGES.includes('roll')) {
    for (const id of (process.env.PATS || 'checks.twist').split(',')) {
      await page.eval(setup(id, process.env.EXTRA || '', process.env.G || ''));
      const w = await watch(page, save, { name: `roll-${id}`, seconds: +(process.env.SECS || 34), fps: +(process.env.FPS || 12), cols: +(process.env.COLS || 6), rows: +(process.env.ROWS || 6) });
      const med = [...w.diff].sort((a, b) => a - b)[w.diff.length >> 1];
      log(id, 'diff median', med, 'max', Math.max(...w.diff), 'maxgrey', Math.max(...w.grey), 'white', Math.min(...w.white), Math.max(...w.white), errors().slice(0, 3).join(' | '));
    }
  }

  if (STAGES.includes('chords')) {
    // A made-up song: I V vi IV, then ii, IV iii I, a chord every two bars at 120 bpm. Nothing else moves: the same chord must give the same picture, wherever it's come from.
    const id = process.env.PATS || 'checks.crush', bar = 2, each = +(process.env.EACH || 4);
    const prog = [0, 14, 19, 10, 0, 14, 5, 10, 9, 0, 14, 19, 10, 0];
    const runs = prog.map((c, i) => ({ t0: 18 + i * each, t1: 18 + (i + 1) * each, c }));
    runs[0].t0 = -10;
    await page.eval(setup(id, `open: 16, spin: 0, chords: { runs: ${JSON.stringify(runs)}, home: { c: 0 }, bar: ${bar} }, ${process.env.EXTRA || ''}`, `arcs: [], flow: {}, over: { scale: ${process.env.SCALE || .9}, rot: .3 },`));
    const keys = await page.eval(`(trippee.seek(40), window.__G.moves[0].keys.map(k => ({ t: k.t, c: k.c, q: k.q.map(x => +x.toFixed(3)) })))`);
    log('keys', JSON.stringify(keys));
    const r = await page.eval(async ({ keys }) => {
      const T = trippee, W = 320, H = 180, c = document.createElement('canvas'); c.width = T.canvas.width; c.height = T.canvas.height; const g = c.getContext('2d', { willReadFrequently: true });
      const grab = t => { T.seek(t); g.drawImage(T.canvas, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
      const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]); return s / (a.length / 4); };
      const im = keys.map(k => grab(k.t));
      const out = [];
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) if (keys[i].c === keys[j].c) out.push({ c: keys[i].c, a: keys[i].t, b: keys[j].t, diff: +diff(im[i], im[j]).toFixed(3) });
      const other = []; for (let i = 0; i + 1 < keys.length; i++) other.push(+diff(im[i], im[i + 1]).toFixed(1));
      const sheet = document.createElement('canvas'); sheet.width = W * 5; sheet.height = H * Math.ceil(keys.length / 5); const gs = sheet.getContext('2d'); gs.font = '13px monospace';
      keys.forEach((k, i) => { T.seek(k.t); gs.drawImage(T.canvas, (i % 5) * W, (i / 5 | 0) * H, W - 2, H - 2); gs.fillStyle = '#f22'; gs.fillText(`t${k.t} c${k.c}`, (i % 5) * W + 4, (i / 5 | 0) * H + 14); });
      return { same: out, next: other, url: sheet.toDataURL('image/jpeg', .85) };
    }, { keys });
    save('chords.jpg', r.url);
    log('same chord', JSON.stringify(r.same));
    log('next chord', JSON.stringify(r.next));
    await page.eval(`trippee.seek(16)`);
    await watch(page, save, { name: 'chords-run', seconds: 26, fps: 12, cols: 6, rows: 6 });
    log(errors().slice(0, 3).join(' | '));
  }

  // A film of three, the middle one a star placed by placeStar, on a made-up song: 120 bpm, a chord every two bars.
  const made = (id, more = '') => `(async () => {
    const { placeStar } = await import(new URL('src/score/moves/star.js', location.href).href);
    const s = app.stage, tau = t => t * 2, prog = [0, 14, 19, 10, 0, 14, 5, 10];
    const runs = Array.from({ length: 40 }, (_, i) => ({ t0: i * 4, t1: (i + 1) * 4, c: prog[i % 8] }));
    const M = { beat: 0.5, meter: 4, runs, home: { c: 0 }, arrivals: () => [] };
    const p = app.byId[${JSON.stringify(id)}], other = app.byId['lines.river'];
    const score = s.score = { gestures: [{ t0: -10, t1: 6, arcEnd: 6, pattern: other, morph: 6 }, { t0: 6, t1: 44, arcEnd: 44, pattern: other, morph: 6 }, { t0: 44, t1: 60, arcEnd: 60, pattern: other, morph: 6 }, { t0: 60, t1: 3600, arcEnd: 90, pattern: other }], phi: (t, G) => (G.phiTrack ? (G.phiTrack[0].x + G.phiTrack[0].v * (tau(t) - G.phiTrack[0].t)) : t / 4), tau, song: { meter: 4 }, handover: null };
    const G = placeStar(score, p, { start: 5, end: 43, M, seed: 3, bars: 7, ${more} });
    s.hold = true; window.__G = G; app.t = 0; trippee.seek(0); return !!G; })()`;

  if (STAGES.includes('bodies')) {
    const ids = (process.env.PATS || 'lines.river,lines.fall,waves.current,rooms.arrows,rooms.dive,pole.dipole,lattice.teeth,checks.twist,lattice.master,coins.dart,coins.ziggurat,riley.mosaic').split(',');
    for (const id of ids) {
      const ok = await page.eval(made(id));
      if (!ok) { log(id, 'no room'); continue; }
      const w = await watch(page, save, { name: `body-${id}`, seconds: 26, fps: 6, cols: 8, rows: 4, setup: 'trippee.seek(14)' });
      const sorted = a => [...a].sort((x, y) => x - y), pc = (a, p) => sorted(a)[Math.floor((a.length - 1) * p)];
      log(id.padEnd(18), 'white', pc(w.white, 0).toFixed(2), pc(w.white, 0.05).toFixed(2), pc(w.white, 0.95).toFixed(2), pc(w.white, 1).toFixed(2), 'edges', pc(w.edges, 0.5), pc(w.edges, 1), 'grey', pc(w.grey, 0.5).toFixed(3), pc(w.grey, 1).toFixed(3));
    }
    log(errors().slice(0, 3).join(' | '));
  }

  if (STAGES.includes('modes')) {
    await page.eval(made('lines.river'));
    if (process.env.BARE === '1') await page.eval('window.__G.moves = []');
    const r = await page.eval(async () => {
      const T = trippee, R = app.R, { OFF, SLOT_FLOATS } = await import(new URL('src/pattern/layout.js', location.href).href), out = {};
      const K = () => R.slotA[OFF['star.k']];
      // Purity: the same numbers whichever way you got there
      const ts = Array.from({ length: 40 }, (_, i) => 8 + i * 0.7), seq = ts.map(t => { T.seek(t); return R.block.slice(); });
      const order = ts.map((_, i) => i).sort((a, b) => ((a * 7919) % 41) - ((b * 7919) % 41));
      let worst = 0, wn = 0; for (const i of order) { app.t = 0; T.seek(ts[i]); for (let n = 0; n < R.frame.byteOffset / 4; n++) { const d = Math.abs(R.block[n] - seq[i][n]); if (d > worst) { worst = d; wn = n; } } }
      out.purityWorst = worst; out.purityAt = Object.keys(OFF).find(k => OFF[k] === (wn % SLOT_FLOATS)) + (wn >= SLOT_FLOATS ? ' of B' : '');
      // Colour on it
      T.seek(30); app.beyond.on(); app.beyond.snap(0.6); T.seek(30); out.colourShot = T.capture(); out.colourGl = R.gl.getError(); app.beyond.off(); app.beyond.snap(null);
      // Tools: zoom, a ripple, the hand's sheet
      out.gl = R.gl.getError();
      return out;
    });
    save('colour.png', r.colourShot);
    log('modes', JSON.stringify({ ...r, colourShot: 0 }));
    // A real wheel on a rolled ball: the hand's zoom goes through the frame's view, so the whole ball zooms
    const before = await page.eval(`(trippee.seek(30), trippee.capture())`);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 640, y: 360, deltaX: 0, deltaY: -400 });
    await sleep(600);
    const zoomed = await page.eval(`(() => { for (let i = 0; i < 40; i++) trippee.step(0); trippee.seek(30); return { u: trippee.capture(), J: app.edits.journey }; })()`);
    save('zoom.png', zoomed.u);
    log('wheel', 'journey', zoomed.J, 'picture changed', zoomed.u !== before);
    // Static: the ball stays where it's got to, what's on it still flows, and it's let go again without a jump. Then a pick in mid-roll: a flight, landing on what was clicked.
    const q = await page.eval(async () => {
      const T = trippee, R = app.R, S = app.stage, { OFF } = await import(new URL('src/pattern/layout.js', location.href).href), out = {};
      const nums = () => ['star.k', 'star.qx', 'star.qy', 'star.qz', 'star.qw'].map(n => +R.slotA[OFF[n]].toFixed(4));
      T.seek(29); T.step(1 / 60);
      S.setStatic?.(true, app.pictureT());
      for (let i = 0; i < 240; i++) T.step(1 / 60);    // let it run out
      const a = nums(), f0 = R.slotA[OFF['f0.ph']]; for (let i = 0; i < 120; i++) T.step(1 / 60); const b = nums(), f1 = R.slotA[OFF['f0.ph']];
      out.staticBall = [a, b]; out.staticFlows = +(f1 - f0).toFixed(3);
      { const W = 160, H = 90, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true });
        const grab = () => { g.drawImage(app.canvas, 0, 0, W, H); return g.getImageData(0, 0, W, H).data; };
        let prev = grab(); S.setStatic?.(false, app.pictureT()); const ds = [];
        for (let i = 0; i < 180; i++) { T.step(1 / 60); const f = grab(); let d = 0; for (let k = 0; k < f.length; k += 4) d += Math.abs(f[k] - prev[k]); ds.push(+(d / (W * H)).toFixed(1)); prev = f; }
        out.letGo = ds.slice(0, 12).join(' '); out.letGoMax = Math.max(...ds); }
      out.afterStatic = nums();
      // A click, by the path a click takes
      const W = 160, H = 90, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true });
      const grab = () => { g.drawImage(app.canvas, 0, 0, W, H); return g.getImageData(0, 0, W, H).data; };
      let prev = grab(), worst = 0, seen = [], wAt = 0; S.pick?.(app.byId['checks.crush'], app.pictureT());
      const ds = []; for (let i = 0; i < 660; i++) { T.step(1 / 60); const f = grab(); let d = 0; for (let k = 0; k < f.length; k += 4) d += Math.abs(f[k] - prev[k]); ds.push(d / (W * H)); prev = f; const kk = app.lastFrame.kind; if (kk && !seen.includes(kk)) seen.push(kk, i, app.lastFrame.from?.pattern?.id, app.lastFrame.from?.moves?.length, app.lastFrame.N?.pattern?.id); if (i % 60 === 0) await new Promise(q => setTimeout(q)); }
      ds.forEach((v, i) => { if (i > 0 && i < ds.length - 1) { const e = v - (ds[i - 1] + ds[i + 1]) / 2; if (e > worst) { worst = e; wAt = i; } } });
      out.pick = { kinds: seen, showing: app.lastFrame.G.pattern.id, morphing: app.lastFrame.kind, worst: +worst.toFixed(2), at: wAt, near: ds.slice(Math.max(0, wAt - 2), wAt + 3).map(v => +v.toFixed(1)).join(' ') }; out.gl = R.gl.getError();
      return out;
    });
    log('static and pick', JSON.stringify(q));
    log(errors().slice(0, 3).join(' | '));
  }

  if (STAGES.includes('letgo')) {
    await page.eval(made('lines.river'));
    const q = await page.eval(async () => {
      const T = trippee, R = app.R, S = app.stage, { OFF } = await import(new URL('src/pattern/layout.js', location.href).href), { fillSlot } = await import(new URL('src/score/slot.js', location.href).href), { matchFamilies } = await import(new URL('src/score/xform/plan.js', location.href).href);
      T.seek(29); T.step(1 / 60); S.setStatic(true, app.pictureT()); for (let i = 0; i < 300; i++) T.step(1 / 60);
      S.setStatic(false, app.pictureT()); const rows = [];
      for (let i = 0; i < 60; i++) { T.step(1 / 60); if (i % 15 === 0) { const f = app.lastFrame, g = S.score.gestures; rows.push({ i, kind: f.kind, x: +(f.T ?? 0).toFixed(3), k: +R.slotA[OFF['star.k']].toFixed(3), fb: R.slotA[OFF['field.b']], fbB: R.slotB[OFF['field.b']], n: g.length, G: f.G.pattern.id, moves: f.G.moves?.length, t: +T.time().toFixed(2), t0: +f.G.t0.toFixed(2), t1: +f.G.t1.toFixed(2), m: f.G.morph, N: g[g.indexOf(f.G) + 1]?.pattern?.id, Nm: g[g.indexOf(f.G) + 1]?.moves?.length }); } }
      const f = app.lastFrame, G = f.G, a = new Float32Array(R.slotA.length), b = new Float32Array(R.slotA.length), Ng = S.score.gestures[S.score.gestures.indexOf(G) + 1];
      fillSlot(a, G, T.time() + 1, G.pattern, { phi: 0 }); if (Ng) fillSlot(b, Ng, Ng.t0, Ng.pattern, { phi: 0 });
      const m = Ng ? matchFamilies(a, b) : null;
      return { rows, a: { k: a[OFF['star.k']], fb: a[OFF['field.b']] }, b: { k: b[OFF['star.k']], fb: b[OFF['field.b']] }, plain: m?.plain };
    });
    log(JSON.stringify(q));
  }

  if (STAGES.includes('landings')) {
    // Is there a pop on the frame a transformation lands, in a film with no star in it at all?
    const { resolve } = await import('node:path');
    const data = { items: [], files: [resolve(process.env.SONG || 'media/mgmt.mp3')], dragOperationsMask: 1 };
    await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 640, y: 360, data });
    await page.send('Input.dispatchDragEvent', { type: 'drop', x: 640, y: 360, data });
    for (let i = 0; i < 1200; i++) { if (await page.eval('app.ui.song.state==="ready"')) break; await sleep(100); }
    const r = await page.eval(async () => {
      app.ui.song.show(false); app.governor.enabled = false; app.song.pause?.();
      const T = trippee, g0 = app.song.score.gestures, W = 320, H = 180, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true });
      const grab = () => { g.drawImage(app.canvas, 0, 0, W, H); return g.getImageData(0, 0, W, H).data; };
      const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]); return s / (W * H); };
      const out = [];
      for (let i = 0; i + 1 < Math.min(g0.length - 1, 12); i++) {
        const G = g0[i], t = G.t1;
        T.seek(t - G.morph - 2.1); for (let k = 0; k < 20; k++) T.step(0.1);   // let the plan be made
        const start = T.time(), ds = []; T.seek(t - 5 / 60); let prev = grab();
        for (let k = 0; k < 10; k++) { T.step(1 / 60); const f = grab(); ds.push(+diff(prev, f).toFixed(1)); prev = f; }
        out.push({ t: +t.toFixed(2), kind: G.plan?.kind, to: g0[i + 1].pattern.id, ds: ds.join(' ') });
        await new Promise(q => setTimeout(q));
      }
      return out;
    });
    for (const o of r) log(JSON.stringify(o));
  }

  if (STAGES.includes('atlas')) {
    // Every pattern that can wear it, at the sizes a film would use, in flowers at three points of its own long move. For choosing bodies.
    const r = await page.eval(async () => {
      const T = trippee, S = await import(new URL('src/score/moves/star.js', location.href).href), L = await import(new URL('src/pattern/layout.js', location.href).href), { base } = await import(new URL('src/score/slot.js', location.href).href);
      const star = (await import(new URL('src/score/moves/index.js', location.href).href)).MOVES.star;
      const ids = app.patterns.filter(p => star.needs(base(p))).map(p => p.id), us = [0.35, 0.65, 0.95], W = 256, H = 144, cols = 9;
      const sheet = document.createElement('canvas'); sheet.width = W * cols; sheet.height = H * Math.ceil(ids.length * us.length / cols); const g = sheet.getContext('2d'); g.font = '11px monospace';
      let n = 0;
      for (const id of ids) {
        const p = app.byId[id], fine = S.fineOf(base(p)), arcs = (p.arcs || []).filter(x => x.path !== 'scale' && x.path !== 'tx' && x.path !== 'ty' && x.path !== 'rot');
        for (const u of us) {
          const G = { t0: 0, t1: 3600, arcEnd: 100, pattern: p, arcs, flow: p.flow, over: { scale: fine / 3.4, rot: S.safeTurn(p), 'star.k': 1 / 2.8, 'field.b': 1 } };
          G.freezeU = u;
          app.stage.score.gestures = [G]; app.stage.score.handover = null; app.stage.hold = true; app.t = 30; T.seek(30);
          g.drawImage(T.canvas, (n % cols) * W, (n / cols | 0) * H, W - 2, H - 2); g.fillStyle = '#f22'; g.fillText(`${id} ${u}`, (n % cols) * W + 3, (n / cols | 0) * H + 12); n++;
        }
        await new Promise(q => setTimeout(q));
      }
      return { n: ids.length, ids, url: sheet.toDataURL('image/jpeg', .85) };
    });
    save('atlas.jpg', r.url);
    log('atlas', r.n, r.ids.join(' '));
  }

  if (STAGES.includes('ends')) {
    // Both ends are exact. Flat until t0 and flat again after it closes; with the flag off, nothing has changed. Flows off, so that only the star can move anything.
    for (const id of (process.env.PATS || 'checks.crush,lines.river,lattice.master').split(',')) {
      const r = await page.eval(async ({ id }) => {
        const T = trippee, fl = await import(new URL('src/score/flags.js', location.href).href), { starMove } = await import(new URL('src/score/moves/star.js', location.href).href);
        const c = document.createElement('canvas'); c.width = T.canvas.width; c.height = T.canvas.height; const g = c.getContext('2d', { willReadFrequently: true });
        const grab = t => { T.seek(t); g.drawImage(T.canvas, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
        const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]); return s / (a.length / 4); };
        const set = moves => { const s = app.stage, tau = t => t * 2; s.score = { gestures: [{ t0: -5, t1: 3600, arcEnd: 3600, pattern: app.byId[id], arcs: [], flow: {}, over: { scale: 1, rot: 0.4 }, moves }], phi: () => 0, tau, song: null, handover: null }; s.hold = true; app.t = 0; };
        set([]); const plain = grab(20);
        const m = starMove({ t0: 2, open: 10, seed: 3, close: { t: 20, D: 8 } });
        set([m]);
        const atStart = grab(2), justAfter = grab(2 + 1 / 60), second = grab(2 + 2), mid = grab(15), justBefore = grab(28 - 1 / 60), atEnd = grab(28), after = grab(30);
        fl.setFlag('star', false); set([m]); const off = grab(15); fl.setFlag('star', true);
        return { id, flatAtT0: +diff(plain, atStart).toFixed(4), firstFrame: +diff(plain, justAfter).toFixed(4), twoSeconds: +diff(plain, second).toFixed(3), midIsNot: +diff(plain, mid).toFixed(1), lastFrame: +diff(plain, justBefore).toFixed(4), landed: +diff(plain, atEnd).toFixed(4), after: +diff(plain, after).toFixed(4), flagOff: +diff(plain, off).toFixed(4), gl: app.R.gl.getError() };
      }, { id });
      log(JSON.stringify(r), r.flatAtT0 === 0 && r.firstFrame < 0.1 && r.lastFrame < 0.1 && r.landed === 0 && r.flagOff === 0 && r.midIsNot > 10 ? 'PASS' : 'FAIL');
    }
  }

  if (STAGES.includes('walk')) {
    // R from 40 to 2.2 has no pop, at 60 fps, with nothing else moving, for a roll and a chord map
    const id = process.env.PATS || 'checks.crush';
    for (const extra of ['', 'chords: { runs: [{ t0: -9, t1: 30, c: 0 }, { t0: 30, t1: 60, c: 14 }], home: { c: 0 }, bar: 2 },']) {
      await page.eval(setup(id, `open: 20, R1: 2.2, ${extra}`, `arcs: [], flow: {}, over: { scale: 1.1, rot: .4 },`));
      const ds = await page.eval(async () => {
        const T = trippee, W = 320, H = 180, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true });
        T.seek(1.5); g.drawImage(app.canvas, 0, 0, W, H); let prev = g.getImageData(0, 0, W, H).data; const out = [];
        for (let i = 0; i < 60 * 24; i++) { T.step(1 / 60); g.drawImage(app.canvas, 0, 0, W, H); const d = g.getImageData(0, 0, W, H).data; let s = 0; for (let k = 0; k < d.length; k += 4) s += Math.abs(d[k] - prev[k]); out.push(s / (W * H)); prev = d; if (i % 120 === 0) await new Promise(r => setTimeout(r)); }
        return out;
      });
      let worst = 0, at = 0; ds.forEach((v, i) => { if (i > 0 && i < ds.length - 1) { const m = (ds[i - 1] + ds[i + 1]) / 2, e = v - m; if (e > worst) { worst = e; at = 1.5 + (i + 1) / 60; } } });
      const sorted = [...ds].sort((a, b) => a - b);
      log(extra ? 'chord map' : 'plain roll', 'median', sorted[sorted.length >> 1].toFixed(2), 'max', sorted.at(-1).toFixed(2), 'worst spike', worst.toFixed(2), 'at', at.toFixed(2), 'per 2 s', Array.from({ length: 12 }, (_, i) => (ds.slice(i * 120, (i + 1) * 120).reduce((a, b) => a + b, 0) / 120).toFixed(1)).join(' '));
    }
  }

  if (STAGES.includes('crops2')) {
    // At two device pixels to one, a quarter of the frame, on the creases
    await page.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 2, mobile: false });
    await sleep(500);
    for (const id of (process.env.PATS || 'lines.fall,lattice.master').split(',')) {
      await page.eval(setup(id, 'open: 16, ', `arcs: [{ path: 'scale', from: .55, to: .55 }], over: { rot: ${process.env.ROT || 0.45} },`));
      const u = await page.eval(`(() => { trippee.seek(${+(process.env.T || 24)}); const T = trippee, c = document.createElement('canvas'), W = 1100, H = 720; c.width = W; c.height = H; c.getContext('2d').drawImage(T.canvas, -(T.canvas.width - W) / 2, -(T.canvas.height - H) / 2); return { url: c.toDataURL('image/png'), size: [T.canvas.width, T.canvas.height] }; })()`);
      save(`crop2-${id}.png`, u.url); log(id, u.size.join());
    }
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  }

  if (STAGES.includes('rehearse')) {
    // Placed before the rehearsal, as the director will: it keeps its range and it isn't sat out, and no one else is either
    const { resolve } = await import('node:path');
    const data = { items: [], files: [resolve(process.env.SONG || 'media/ppp.mp3')], dragOperationsMask: 1 };
    await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 640, y: 360, data });
    await page.send('Input.dispatchDragEvent', { type: 'drop', x: 640, y: 360, data });
    for (let i = 0; i < 1200; i++) { if (await page.eval('app.ui.song.state==="ready"')) break; await sleep(100); }
    const r = await page.eval(async () => {
      const { placeStar } = await import(new URL('src/score/moves/star.js', location.href).href), rh = await import(new URL('src/music/rehearse.js', location.href).href);
      app.ui.song.show(false); app.governor.enabled = false; app.song.pause?.();
      const score = app.song.score, G = placeStar(score, app.byId['lines.river'], { start: 60, end: 110, M: score.react.M, seed: 3 });
      for (const g of score.gestures) { delete g.plan; delete g.planFor; delete g.planning; }
      const t0 = performance.now(), res = await rh.rehearse(score, 1200);
      trippee.seek(G.t0 + 25);
      return { seconds: +((performance.now() - t0) / 1000).toFixed(1), sitOut: res.sitOut, bad: res.bad, jumps: res.jumps?.length, range: G.range, still: score.gestures.includes(G), showing: app.lastFrame.G === G, k: +app.R.slotA[(await import(new URL('src/pattern/layout.js', location.href).href)).OFF['star.k']].toFixed(3), gl: app.R.gl.getError() };
    });
    log('rehearse', JSON.stringify(r));
  }

  if (STAGES.includes('crops')) {
    // Full size, then doubled, on the creases: is there a seam, a hairline along a wall? --size 1920,1080
    const shots = [];
    for (const id of (process.env.PATS || 'lines.river,checks.crush,lattice.master').split(',')) {
      await page.eval(setup(id, 'open: 16, ', `arcs: [{ path: 'scale', from: .5, to: .5 }], over: { rot: ${process.env.ROT || 0.45} },`));
      const u = await page.eval(`(trippee.seek(${+(process.env.T || 24)}), trippee.capture())`);
      save(`crop-${id}.png`, u); shots.push(id);
    }
    log('crops', shots.join());
  }

  if (STAGES.includes('leaves')) {
    // What a star can turn into, and from: every way out and in, by the planner, with the pops at each end. The ball rolled so far that a slide would jump.
    const others = (process.env.OTHERS || 'checks.crush,checks.target,lines.river,lattice.master,body.planet,dots.inflate').split(',');
    const id = process.env.PATS || 'lines.fall';
    const r = await page.eval(async ({ id, others, nostar }) => {
      const T = trippee, { starMove } = await import(new URL('src/score/moves/star.js', location.href).href);
      const W = 160, H = 90, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true });
      const grab = t => { T.seek(t); g.drawImage(T.canvas, 0, 0, W, H); return g.getImageData(0, 0, W, H).data; };
      const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]); return s / (a.length / 4); };
      const out = [];
      const run = (Ag, Bg, mkind) => {
        const s = app.stage; s.score = { gestures: [Ag, Bg], phi: (t) => t / 4, tau: t => t * 2, song: null, handover: null }; s.hold = true; app.t = 0;
        const t1 = Ag.t1, D = Ag.morph, t0 = t1 - D;
        grab(t0 - 0.5); let prev = grab(t0 - 0.2), steady = 0, worst = 0, at = 0, seq = [];
        for (let t = t0 - 0.2 + 1 / 30; t < t1 + 1; t += 1 / 30) { const f = grab(t), d = diff(prev, f); seq.push(d); prev = f; }
        const sorted = [...seq].sort((a, b) => a - b); steady = sorted[seq.length >> 1];
        seq.forEach((v, i) => { if (i > 0 && i < seq.length - 1) { const e = v - (seq[i - 1] + seq[i + 1]) / 2; if (e > worst) { worst = e; at = t0 - 0.2 + (i + 1) / 30; } } });
        return { kind: Ag.plan?.kind, steady: +steady.toFixed(1), spike: +worst.toFixed(1), at: +(at - t0).toFixed(2), of: D };
      };
      for (const o of others) {
        const A = { t0: -5, t1: 30, arcEnd: 30, morph: 10, pattern: app.byId[id], arcs: [{ path: 'scale', from: 0.6, to: 0.6 }], moves: nostar ? [] : [starMove({ t0: 0, open: 12, seed: 3 })], ...(nostar ? { xform: { id: 'flight' } } : {}) };
        const B = { t0: 30, t1: 3600, arcEnd: 60, pattern: app.byId[o] };
        out.push({ out: o, ...run(A, B) });
        if (nostar) continue;
        const A2 = { t0: -5, t1: 15, arcEnd: 15, morph: 10, pattern: app.byId[o] };
        const B2 = { t0: 15, t1: 3600, arcEnd: 60, pattern: app.byId[id], arcs: [{ path: 'scale', from: 0.6, to: 0.6 }], moves: [starMove({ t0: 15.5, open: 12, seed: 3 })] };
        out.push({ in: o, ...run(A2, B2) });
        await new Promise(r => setTimeout(r));
      }
      return out;
    }, { id, others, nostar: process.env.NOSTAR === '1' });
    for (const o of r) log(JSON.stringify(o));
    log('errors', errors().slice(0, 3).join(' | '));
  }

  if (STAGES.includes('song')) {
    // On a real song: a composed film with a star put into it by hand, the way the director will.
    const { resolve } = await import('node:path');
    const song = process.env.SONG || 'media/ppp.mp3', d = process.env.BODY || 'checks.twist';
    const data = { items: [], files: [resolve(song)], dragOperationsMask: 1 };
    await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 640, y: 360, data });
    await page.send('Input.dispatchDragEvent', { type: 'drop', x: 640, y: 360, data });
    for (let i = 0; i < 1200; i++) { if (await page.eval('app.ui.song.state==="ready"')) break; await sleep(100); }
    const info = await page.eval(`(async () => {
      const { placeStar } = await import(new URL('src/score/moves/star.js', location.href).href), { understand } = await import(new URL('src/music/understand.js', location.href).href);
      app.ui.song.show(false); const h = document.querySelector('#hints'); if (h) h.hidden = true; app.governor.enabled = false; app.song.pause?.();
      const score = app.song.score, M = understand(score.A ?? score.song?.A ?? score.react?.A ?? app.song.analysis ?? score.song);
      const G = placeStar(score, app.byId[${JSON.stringify(d)}], { start: ${+(process.env.START || 60)}, end: ${+(process.env.END || 110)}, M: score.react?.M ?? M, seed: 3, close: ${process.env.CLOSE === '1'}, ${process.env.MORE || ''} });
      if (!G) return { none: true };
      for (const f of ${JSON.stringify((process.env.FLAGS_OFF || '').split(',').filter(Boolean))}) (await import(new URL('src/score/flags.js', location.href).href)).setFlag(f, false);
      window.__G = G; const i = score.gestures.indexOf(G), m = G.moves[0]; if (${process.env.FLAGOFF === '1'}) (await import(new URL('src/score/flags.js', location.href).href)).setFlag('star', false); trippee.seek(G.t0 + 1);
      window.__A = score.gestures[i - 1]; window.__N = score.gestures[i + 1];
      return { t0: G.t0, t1: G.t1, morphOut: G.morph, morphIn: __A.morph, first: m.t0, open: m.open, Ap: __A.pattern.id, Np: __N?.pattern.id, bpm: score.song?.bpm, meter: score.song?.meter, hasM: !!(score.react?.M), keys: (m.keys || []).length, runs: (m.chords?.runs || []).length, home: m.chords?.home?.name };
    })()`);
    log('placed', JSON.stringify(info));
    if (!info.none) {
      const name = process.env.NAME || `song-${d}`, from = info.t0 - info.morphIn - 1, secs = +(process.env.SECS || (info.t1 - from + 2));
      await page.eval(`app.edits.reactAmt=${+(process.env.REACT ?? 1)}`);
      const w = await watch(page, save, { name, seconds: secs, fps: +(process.env.FPS || 8), cols: 8, rows: 8, setup: `window.trippee.seek(${from})` });
      log('keys', JSON.stringify(await page.eval(`(window.__G.moves[0].keys||[]).slice(0,30).map(k=>[+k.t.toFixed(1),k.c,+k.lnR.toFixed(2)])`)));
      log('white', Math.min(...w.white), Math.max(...w.white), 'maxgrey', Math.max(...w.grey), 'diff median', [...w.diff].sort((a, b) => a - b)[w.diff.length >> 1], 'max', Math.max(...w.diff));
      if (process.env.SEAM) {
        // The last frame of a transformation against the first after it: which numbers jump? The slot being flown into, then alone.
        const r = await page.eval(async ({ which }) => {
          const { OFF, SLOT_FLOATS, FRAME } = await import(new URL('src/pattern/layout.js', location.href).href), T = trippee, R = app.R, name = {}, fname = {};
          for (const k in OFF) name[OFF[k]] = k;
          for (const k in FRAME) fname[FRAME[k] * 4] = k;
          const t = which === 'in' ? __G.t0 : __G.t1, g = which === 'in' ? __A : __G;
          T.seek(t - g.morph - 2.1); for (let i = 0; i < 25; i++) T.step(0.1);
          T.seek(t - 3 / 60); T.step(1 / 60); T.step(1 / 60);
          const kind = app.lastFrame.kind, a0 = R.slotA.slice(), b0 = R.slotB.slice(), f0 = R.frame.slice(), tt0 = T.time();
          T.step(2 / 60);
          const a1 = R.slotA.slice(), b1 = R.slotB.slice(), f1 = R.frame.slice(), k1 = app.lastFrame.kind, tt1 = T.time();
          const out = [];
          for (let i = 0; i < SLOT_FLOATS; i++) if (Math.abs(b0[i] - a1[i]) > 2e-3) out.push(`${name[i]} ${b0[i].toFixed(3)}>${a1[i].toFixed(3)}`);
          const fr = []; for (let i = 0; i < f0.length; i++) if (Math.abs(f0[i] - f1[i]) > 2e-3) fr.push(`F${(i / 4 | 0)}.${i % 4} ${f0[i].toFixed(3)}>${f1[i].toFixed(3)}`);
          return { kind, k1, tt0, tt1, slot: out.join(', '), frame: fr.slice(0, 30).join(', '), plan: g.plan?.kind, inner: g.plan?.white };
        }, { which: process.env.SEAM });
        log('seam', JSON.stringify(r));
      }
      if (process.env.LANDPIC) {
        const r = await page.eval(async ({ t }) => {
          const T = trippee, W = T.canvas.width, H = T.canvas.height, c = document.createElement('canvas'); c.width = W; c.height = H * 3; const g = c.getContext('2d', { willReadFrequently: true });
          const G = __G, m = G.morph; T.seek(t - m - 2.1); for (let i = 0; i < 25; i++) T.step(0.1);
          T.seek(t - 2 / 60); T.step(1 / 60); g.drawImage(T.canvas, 0, 0); const k0 = app.lastFrame.kind, th = [...app.R.frame.slice(35 * 4, 35 * 4 + 4)];
          T.step(2 / 60); g.drawImage(T.canvas, 0, H); const k1 = app.lastFrame.kind;
          const a = g.getImageData(0, 0, W, H), b = g.getImageData(0, H, W, H);
          for (let i = 0; i < a.data.length; i += 4) { const d = Math.abs(a.data[i] - b.data[i]); a.data[i] = a.data[i + 1] = a.data[i + 2] = d; }
          g.putImageData(a, 0, 2 * H);
          return { k0, k1, th, url: c.toDataURL('image/jpeg', .85) };
        }, { t: await page.eval('__G.t1') });
        save('landpic.jpg', r.url); log('landpic', r.k0, r.k1, r.th.join());
      }
      if (process.env.RUNS) log('runs', await page.eval(`(() => { const r = app.song.score.react.M.runs, a = r.filter(x => x.t0 >= ${process.env.RUNS.split(',')[0]} && x.t0 < ${process.env.RUNS.split(',')[1]}); return JSON.stringify(a.map(x => [+x.t0.toFixed(1), +(x.t1 - x.t0).toFixed(1), x.c])); })()`));
      if (process.env.SCAN) {
        const [a, b] = process.env.SCAN.split(',').map(Number);
        const r = await page.eval(async ({ a, b }) => {
          const W = 320, H = 180, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true });
          const out = []; trippee.seek(a); g.drawImage(app.canvas, 0, 0, W, H); let prev = g.getImageData(0, 0, W, H).data, prevImg = null; const shots = [];
          for (let t = a + 1 / 60; t < b; t += 1 / 60) { trippee.step(1 / 60); g.drawImage(app.canvas, 0, 0, W, H); const d = g.getImageData(0, 0, W, H).data; let s = 0; for (let k = 0; k < d.length; k += 4) s += Math.abs(d[k] - prev[k]); out.push(+(s / (W * H)).toFixed(1)); prev = d; }
          return { out, kind: app.lastFrame.kind, plan: app.lastFrame.G.plan && { kind: app.lastFrame.G.plan.kind, lnZ: app.lastFrame.G.plan.lnZ, r: app.lastFrame.G.plan.r } };
        }, { a, b });
        log('scan', JSON.stringify(r));
      }
      log('kinds', await page.eval(`JSON.stringify({ in: window.__A.plan?.kind, out: window.__G.plan?.kind, r: window.__G.plan?.r, white: window.__G.plan?.white })`));
      const windows = { flightIn: [info.t0 - info.morphIn - 0.5, info.morphIn + 1.5], firstCrease: [info.first - 0.5, 8], flightOut: [info.t1 - info.morphOut - 0.5, info.morphOut + 1.5] };
      for (const k in windows) {
        const [a, len] = windows[k];
        const r = await page.eval(async ({ a, len }) => {
          const W = 320, H = 180, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true });
          trippee.seek(a); g.drawImage(app.canvas, 0, 0, W, H); let prev = g.getImageData(0, 0, W, H).data; const ds = [];
          for (let i = 1; i < len * 60; i++) { trippee.step(1 / 60); g.drawImage(app.canvas, 0, 0, W, H); const d = g.getImageData(0, 0, W, H).data; let s = 0; for (let k = 0; k < d.length; k += 4) s += Math.abs(d[k] - prev[k]); ds.push(s / (W * H)); prev = d; }
          return ds;
        }, { a, len });
        const sorted = [...r].sort((x, y) => x - y), med = sorted[sorted.length >> 1], mx = sorted.at(-1), at = a + (r.indexOf(mx) + 1) / 60;
        let worst = 0, wAt = 0, wI = 0; r.forEach((v, i) => { if (i > 0 && i < r.length - 1) { const m = (r[i - 1] + r[i + 1]) / 2; if (v - m > worst) { worst = v - m; wAt = a + (i + 1) / 60; wI = i; } } });
        log(k, 'median', med.toFixed(2), 'max', mx.toFixed(2), 'at', at.toFixed(2), 'worst spike', worst.toFixed(2), 'at', wAt.toFixed(2), r.slice(Math.max(0, wI - 3), wI + 4).map(v => v.toFixed(1)).join(' '));
      }
    }
    log('errors', errors().slice(0, 5).join(' | '));
  }

  if (STAGES.includes('coston')) {
    // What wearing it costs: the same pattern, the same program, with k off and on. W H DSF as tests/fps.mjs.
    const W = +(process.env.W || 1512), H = +(process.env.H || 982), DSF = +(process.env.DSF || 2);
    await page.eval('window.trippee.run()');
    await page.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DSF, mobile: false });
    await sleep(800);
    const r = await page.eval(async ({ ids }) => {
      const R = app.R, gl = R.gl, px = new Uint8Array(4), out = {}, T = trippee;
      const once = () => { gl.finish(); const t0 = performance.now(); T.step(0); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t0; };
      const med = v => [...v].sort((x, y) => x - y)[v.length >> 1];
      for (const id of ids) {
        T.load(id); app.manual = true; app.t = 13; const G = app.stage.score.gestures[0], A = [], B = [];
        for (let i = 0; i < 60; i++) { G.over = {}; once(); A.push(once()); G.over = { 'star.k': 1 / 2.8 }; once(); B.push(once()); }
        out[id] = { off: +med(A).toFixed(2), on: +med(B).toFixed(2), variantOn: R.variant, pct: +(100 * (med(B) / med(A) - 1)).toFixed(1) };
      }
      return { size: [app.canvas.width, app.canvas.height], out };
    }, { ids: (process.env.IDS || 'lines.river,lattice.master,checks.twist').split(',') });
    log('coston', JSON.stringify(r));
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  }

  if (STAGES.includes('cost')) {
    // The same page, the same frame: the program as it is against one with the star stubbed out, and with the slip stubbed out in both if NOSLIP is set. W H DSF as tests/fps.mjs.
    const W = +(process.env.W || 1512), H = +(process.env.H || 982), DSF = +(process.env.DSF || 2);
    await page.eval('window.trippee.run()');
    await page.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DSF, mobile: false });
    await sleep(800);
    const r = await page.eval(async ({ ids, base }) => {
      const { FRAG, VERT } = await import(new URL('src/gl/shader.js', location.href).href);
      const R = app.R, gl = R.gl, px = new Uint8Array(4);
      const build = defs => {
        const src = FRAG.replace('\n', '\n' + defs.map(d => `#define ${d}\n`).join(''));
        const mk = (t, c) => { const s = gl.createShader(t); gl.shaderSource(s, c); gl.compileShader(s); return s; };
        const pr = gl.createProgram(), fs = mk(gl.FRAGMENT_SHADER, src); gl.attachShader(pr, mk(gl.VERTEX_SHADER, VERT)); gl.attachShader(pr, fs); gl.linkProgram(pr);
        if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getShaderInfoLog(fs));
        gl.uniformBlockBinding(pr, gl.getUniformBlockIndex(pr, 'Block'), 0); gl.useProgram(pr); gl.uniform1i(gl.getUniformLocation(pr, 'uPush'), 0);
        return pr;
      };
      const on = build(base), off = build([...base, 'NOSTAR']), real = R.progs[0], out = {};
      const once = () => { gl.finish(); const t0 = performance.now(); trippee.step(0); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t0; };
      const med = v => [...v].sort((x, y) => x - y)[v.length >> 1];
      for (const id of ids) {
        trippee.load(id); app.manual = true; app.t = 13; once();
        const A = [], B = [];
        for (let i = 0; i < 60; i++) { R.progs[0] = on; R.prog = on; A.push(once()); R.progs[0] = off; R.prog = off; B.push(once()); }
        R.progs[0] = real; R.prog = real;
        out[id] = { withStar: +med(A).toFixed(2), without: +med(B).toFixed(2), pct: +(100 * (med(A) / med(B) - 1)).toFixed(1) };
      }
      return { size: [app.canvas.width, app.canvas.height], out };
    }, { ids: (process.env.IDS || 'lines.river,checks.crush,lattice.master,dots.inflate').split(','), base: (process.env.BASE || '').split(',').filter(Boolean) });
    log('cost', JSON.stringify(r));
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  }

  if (STAGES.includes('stills')) {
    const ids = (process.env.PATS || 'checks.crush,checks.twist,checks.vega,dials.board,lines.river,lattice.master').split(',');
    const Rs = (process.env.RS || '40,16,8,4,2.2').split(',').map(Number);
    const url = await page.eval(async ({ ids, Rs, t }) => {
      const T = trippee, W = 384, H = 216;
      const sheet = document.createElement('canvas'); sheet.width = W * Rs.length; sheet.height = H * ids.length;
      const g = sheet.getContext('2d'); g.font = '13px monospace';
      ids.forEach((id, row) => Rs.forEach((R, col) => {
        const p = app.byId[id]; if (!p) return;
        app.stage.score.gestures = [{ t0: 0, t1: 3600, arcEnd: 26, pattern: p, over: { 'star.k': 1 / R } }];
        app.stage.score.handover = null; app.stage.hold = true; app.t = t; T.seek(t);
        g.drawImage(T.canvas, col * W, row * H, W - 2, H - 2); g.fillStyle = '#f22'; g.fillText(`${id} R${R}`, col * W + 4, row * H + 14);
      }));
      return sheet.toDataURL('image/jpeg', 0.85);
    }, { ids, Rs, t: +(process.env.T || 13) });
    save('stills.jpg', url);
    log('stills.jpg', errors().slice(0, 3).join(' | '));
  }
};
