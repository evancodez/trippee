// The Stop: the band stops, a film that never stops freezes on one exact frame, and the sound coming back picks it up.
//   SONG=media/mgmt.mp3 STAGE=info,raw,film,purity,live,beyond,flagoff,click node tools/lab.mjs tests/stop.mjs --out lab-out/t
// Always muted (the lab runs Chrome with --mute-audio). Looks at the real film of a real song, dropped in as a person would.
// Writes stop-<song>.film.sheet.jpg (close frames through the rest), .slices.jpg (time-slices: a stop is a flat stretch), .diff.json (frame-to-frame change at 60 fps).
import { resolve, basename } from 'node:path';
import { watch } from '../tools/look.mjs';

export default async ({ page, log, save, sleep }) => {
  const song = process.env.SONG || 'media/mgmt.mp3', name = basename(song).replace(/\.\w+$/, '');
  const stages = (process.env.STAGE || 'info,raw,film,purity,live,beyond,flagoff,click').split(',');
  const want = s => stages.includes(s);
  const fails = [], check = (ok, what) => { log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
  const errs = () => page.logs.filter(l => l.startsWith('[exception]') || l.startsWith('[error]'));

  const data = { items: [], files: [resolve(song)], dragOperationsMask: 1 };
  await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 640, y: 360, data });
  await page.send('Input.dispatchDragEvent', { type: 'drop', x: 640, y: 360, data });
  for (let i = 0; i < 600; i++) { if (await page.eval('app.ui.song?.state==="ready"')) break; await sleep(100); }
  for (let i = 0; i < 300; i++) { if (await page.eval('!!app.song?.score?.react')) break; await sleep(100); }
  await page.eval(`app.ui.song.show(false);document.querySelector('#hints').hidden=true;window.__rests=(app.song.score.react.M.rests||[]);`);
  const info = await page.eval(() => {
    const sc = app.song.score, M = sc.react.M, near = [];
    for (const r of M.rests) near.push(sc.gestures.filter(g => g.t1 > r.a - 15 && g.t0 < r.b + 15).map(g => ({ t0: +g.t0.toFixed(2), t1: +g.t1.toFixed(2), morph: +(g.morph || 0).toFixed(2), pat: g.pattern.id })));
    return { rests: M.rests, beat: M.beat, bar: M.bar, windows: sc.time.windows ?? null, near, duration: app.song.duration, stop: app.beyond.stopAt?.(0) ?? null, stopRaw: null };
  });
  if (want('info')) {
    log(name, 'rests', JSON.stringify(info.rests), 'beat', info.beat, 'bar', info.bar);
    log('windows', JSON.stringify(info.windows));
    log('near', JSON.stringify(info.near));
  }
  if (!info.rests.length) { log('no rests in this song'); return; }
  const r0 = +(process.env.REST || 0), { a, b } = info.rests[r0], W = info.windows?.[r0];

  // ---- What the sound does at the edges of the rest, from the decoded audio. Nothing plays: it's only decoded.
  if (want('raw')) {
    const raw = await page.eval(async ({ url, a, b }) => {
      const buf = await (await fetch(url)).arrayBuffer();
      const ctx = new OfflineAudioContext(1, 1, 44100), au = await ctx.decodeAudioData(buf), sr = au.sampleRate, x = au.getChannelData(0);
      const rms = (t, w = 0.01) => { const i0 = Math.round(t * sr), n = Math.round(w * sr); let s = 0; for (let i = i0; i < i0 + n; i++) s += x[i] * x[i]; return 10 * Math.log10(s / n + 1e-12); };
      const row = (t0, t1, step) => { const o = []; for (let t = t0; t < t1; t += step) o.push(+rms(t, step).toFixed(0)); return o; };
      return { edgeA: row(a - 0.6, a + 0.3, 0.03), edgeB: row(b - 0.3, b + 0.3, 0.02), inside: +rms(a, b - a).toFixed(1), before: +rms(a - 2, 2).toFixed(1), after: +rms(b, 2).toFixed(1) };
    }, { url: '/' + song, a, b });
    log('dB (30 ms steps from a-.6):', raw.edgeA.join(' '));
    log('dB (20 ms steps from b-.3):', raw.edgeB.join(' '));
    log('rest', raw.inside, 'dB; 2 s before', raw.before, 'after', raw.after);
  }

  // ---- The film through the rest, at 60 fps on a fixed clock
  if (want('film')) {
    const t0 = a - 8, secs = Math.max(W ? W.paid + 3 : 0, b + 10) - t0;
    const w = await watch(page, save, { name: `stop-${name}.film`, seconds: secs, fps: 60, cols: 10, rows: 9, setup: `(()=>{const T=window.trippee;T.seek(${t0 - 2});for(let i=0;i<120;i++)T.step(1/60);})()` });
    save(`stop-${name}.diff.json`, JSON.stringify({ a, b, paid: W?.paid, time: w.time, diff: w.diff }));
    const of = (x, y) => w.diff.filter((_, i) => w.time[i] > x && w.time[i] <= y);
    const med = v => { const s = [...v].sort((p, q) => p - q); return s[s.length >> 1] ?? 0; };
    const before = med(of(a - 3, a - info.beat)), inside = Math.max(...of(a + 1 / 60, b)), afterAll = of(b, b + 0.5);
    const surround = med([...of(a - 8, a - 1), ...of(b + 3, b + 10)]);      // as the judge has it
    log(`diff median before ${before}, around ${surround}, biggest in the rest ${inside}, biggest in .5 s after ${Math.max(...afterAll)}`);
    log('diff through the slowing beat:', of(a - info.beat, a + 0.05).filter((_, i) => i % 3 === 0).join(' '));
    log('diff from the sound coming back:', of(b - 0.05, b + 0.5).filter((_, i) => i % 2 === 0).join(' '));
    log('worst step anywhere', Math.max(...w.diff), 'at', w.time[w.diff.indexOf(Math.max(...w.diff))], 'median', med(w.diff));
    check(inside === 0, 'not one pixel moves in the rest');
    check(Math.max(...afterAll) > 0.5 * surround, 'within .5 s of the sound coming back it moves over half what it did');
    // a jump is one frame far above the frames either side of it
    let jump = 0, jumpAt = 0; for (let i = 1; i + 1 < w.diff.length; i++) { const q = w.diff[i] - Math.max(w.diff[i - 1], w.diff[i + 1]); if (q > jump) { jump = q; jumpAt = w.time[i]; } }
    log('biggest one-frame jump', +jump.toFixed(2), 'at', jumpAt);
    check(jump <= Math.max(2, 0.5 * med(w.diff)), `nothing jumps in the film round the rest (${+jump.toFixed(2)} at ${jumpAt})`);
    // a sheet of close frames, tighter on the edges of the rest
    const near = await page.eval(async ({ times }) => {
      const T = window.trippee, W = 320, H = 180, cols = 8, rows = Math.ceil(times.length / cols);
      const s = document.createElement('canvas'); s.width = cols * W; s.height = rows * H; const g = s.getContext('2d'); g.font = '13px monospace';
      times.forEach((t, i) => { T.seek(t); const x = i % cols * W, y = (i / cols | 0) * H; g.drawImage(T.canvas, x, y, W, H); g.fillStyle = '#f22'; g.fillRect(x, y, 62, 16); g.fillStyle = '#fff'; g.fillText(t.toFixed(2), x + 3, y + 12); });
      return s.toDataURL('image/jpeg', 0.85);
    }, { times: [-1.5, -1, -0.75, -0.5, -0.4, -0.3, -0.2, -0.1, -0.05, 0, 0.3, b - a - 0.02, b - a, b - a + 0.05, b - a + 0.1, b - a + 0.15, b - a + 0.2, b - a + 0.3, b - a + 0.4, b - a + 0.5, b - a + 0.75, b - a + 1, b - a + 1.5, b - a + 2].map(x => a + x) });
    save(`stop-${name}.edges.jpg`, near);
  }

  // ---- Purity: the same frame however you got there
  if (want('purity')) {
    const r = await page.eval(async ({ a, b, paid }) => {
      const T = window.trippee, c = document.createElement('canvas'); c.width = 320; c.height = 180; const g = c.getContext('2d', { willReadFrequently: true });
      const hash = () => { g.drawImage(T.canvas, 0, 0, 320, 180); const d = g.getImageData(0, 0, 320, 180).data; let h = 2166136261; for (let i = 0; i < d.length; i += 4) { h ^= d[i]; h = Math.imul(h, 16777619); h ^= d[i + 1]; h = Math.imul(h, 16777619); } return h >>> 0; };
      const times = [a - 1, a - 0.5, a - 0.2, a, a + 0.001, (a + b) / 2, b - 0.001, b, b + 0.1, b + 0.3, b + 0.6, b + 1.5, paid - 0.5, paid, paid + 1, paid + 4];
      const run = o => { const h = {}; for (const i of o) { T.seek(times[i]); h[i] = hash(); } return h; };
      const ids = times.map((_, i) => i), A = run(ids), B = run([...ids].reverse()), mix = [...ids]; for (let i = mix.length - 1; i > 0; i--) { const j = (i * 7 + 3) % (i + 1); [mix[i], mix[j]] = [mix[j], mix[i]]; }
      const C = run(mix), same = ids.filter(i => A[i] === B[i] && A[i] === C[i]).length;
      // and the rest itself is one frame, played or sought
      T.seek(a - 0.1); for (let i = 0; i < 6; i++) T.step(1 / 60);
      return { same, n: ids.length, restOne: new Set([A[3], A[4], A[5], A[6], A[7]]).size };
    }, { a, b, paid: W?.paid ?? b + 4 });
    log('purity', JSON.stringify(r));
    check(r.same === r.n, `the same frame in any order (${r.same}/${r.n})`);
    check(r.restOne === 1, 'the whole rest is one frame');
  }

  // ---- In real time, with the real clock and the real loop
  if (want('live')) {
    const lead = 5, tail = Math.max(4, (W?.paid ?? b + 4) - b + 1.5);
    await page.eval(({ t }) => { window.trippee.run(); app.song.seek(t); if (!app.song.playing) app.song.play(); }, { t: a - lead });
    const r = await page.eval(async ({ a, b, until }) => {
      const c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d', { willReadFrequently: true });
      const rows = []; let prev = null, nHeard = 0;
      await new Promise(res => {
        const on = () => {
          g.drawImage(app.canvas, 0, 0, 160, 90);
          const d = g.getImageData(0, 0, 160, 90).data; let s = 0;
          if (prev) for (let i = 0; i < d.length; i += 4) s += Math.abs(d[i] - prev[i]);
          prev = d;
          rows.push([+app.t.toFixed(3), +app.pictureT().toFixed(3), +(s / 14400).toFixed(2), +app.song.time().toFixed(3)]);
          if (app.t > until || ++nHeard > 5000) { app.onFrame.splice(app.onFrame.indexOf(on), 1); res(); }
        };
        app.onFrame.push(on);
      });
      return rows;
    }, { a, b, until: b + tail });
    save(`stop-${name}.live.json`, JSON.stringify(r));
    const inRest = r.filter(x => x[0] > a + 0.04 && x[0] < b), first = r.find(x => x[0] >= b && x[2] > 0), lagEnd = r.at(-1);
    log(`live: ${r.length} frames, ${inRest.length} in the rest, biggest step there ${Math.max(...inRest.map(x => x[2]))}, picture held ${[...new Set(inRest.map(x => x[1]))].join(',')}; first move at ${first?.[0]} (sound back at ${b}); clock at the end ${lagEnd[0]} picture ${lagEnd[1]}`);
    check(inRest.length > 5 && Math.max(...inRest.map(x => x[2])) === 0, 'live: the rest is one frame');
    check(Math.abs(lagEnd[0] - lagEnd[1]) < 1e-3, 'live: the lag has been paid');
  }

  // ---- Colour: the plates stand still too, and colour's own stop lying over a rest. Its stop lags the picture for about 39 s, so on most songs a rest falls somewhere in one.
  if (want('beyond')) {
    const r = await page.eval(async ({ a, b }) => {
      const P = window.trippee, c = document.createElement('canvas'); c.width = 320; c.height = 180; const g = c.getContext('2d', { willReadFrequently: true });
      const grab = t => { P.seek(t); g.drawImage(P.canvas, 0, 0, 320, 180); return g.getImageData(0, 0, 320, 180).data; };
      const diff = (x, y) => { let s = 0; for (let i = 0; i < x.length; i += 4) s += Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2]); return s / (x.length / 4) / 3; };
      app.song.pause?.();
      const score = app.stage.score;
      P.seek(1); app.beyond.on();
      const stop = app.beyond.stopAt(1);
      // the plates open for real, on the frame count
      const open = t => { P.seek(t); for (let i = 0; i < 380; i++) P.step(1 / 60); };
      const run = (t0, t1) => {
        const out = []; let pp = grab(t0);
        for (let i = 1; t0 + i / 60 < t1; i++) { const t = t0 + i / 60, f = grab(t); out.push({ t, d: diff(pp, f), p: app.pictureT(t), c: app.lastFrame.c }); pp = f; }
        return out;
      };
      const worst = (rows, x, y) => rows.filter(o => o.t > x && o.t < y).reduce((m, o) => (o.d > m.d ? o : m), { d: 0, t: 0 });
      const med = rows => rows.map(o => o.d).sort((x, y) => x - y)[rows.length >> 1];
      const nearby = (rows, o) => { const i = rows.indexOf(o); return rows.slice(Math.max(0, i - 3), i + 4).map(q => +q.d.toFixed(1)).join(' '); };
      open(Math.max(1.5, a - 12));
      const rows = run(a - 1, b + 2), w = worst(rows, a - 1, b + 2);
      const own = { stop, lagAtRest: +(a - app.pictureT(a)).toFixed(3), inRest: +worst(rows, a + 0.02, b - 0.02).d.toFixed(3), worst: +w.d.toFixed(2), at: +w.t.toFixed(2), med: +med(rows).toFixed(2), near: nearby(rows, w), kind: null };
      if (!stop) { app.beyond.off(); return { own }; }
      // A rest laid over colour's own stop, in each place it could fall.
      const { buildTime } = await import('/src/score/time.js');
      const was = { time: score.time, rests: score.react.M.rests }, cases = [];
      open(Math.max(1.5, stop - 14));
      const plain = run(stop - 4, stop + 16);
      for (const [what, x] of [['in its slowing', -1.5], ['just before its hold', -0.3], ['in its hold', 2], ['leaving its hold', 5.2], ['in its catching up', 9], ['near its end', 30]]) {
        const ra = stop + x, rb = ra + 1;
        score.react.M.rests = [{ a: ra, b: rb }];
        score.time = buildTime({ beat: 0.5, rests: score.react.M.rests, C: t => (t < ra ? t : t < rb ? ra : t - 1) });
        const q = run(ra - 1, rb + 4);
        let back = 0; for (let i = 1; i < q.length; i++) back = Math.min(back, (q[i].c - q[i - 1].c) * 60);
        const W = worst(q, ra - 1, rb + 4);
        cases.push({ what, at: +ra.toFixed(2), worstStep: +W.d.toFixed(2), worstAt: +W.t.toFixed(2), near: nearby(q, W), med: +med(q).toFixed(2), inRest: +worst(q, ra + 0.02, rb - 0.02).d.toFixed(3), tablesBackward: +back.toFixed(2) });
      }
      score.time = was.time; score.react.M.rests = was.rests;
      const pw = worst(plain, stop - 4, stop + 16);
      app.beyond.off();
      return { own, cases, plain: { worst: +pw.d.toFixed(2), at: +pw.t.toFixed(2), near: nearby(plain, pw), med: +med(plain).toFixed(2) } };
    }, { a, b });
    log('colour, the real rest', JSON.stringify(r.own));
    log('colour stop with no rest', JSON.stringify(r.plain));
    for (const c of r.cases || []) log('  ', JSON.stringify(c));
    check(r.own.inRest === 0, 'colour: the plates stand still in the rest');
    for (const c of r.cases || []) check(c.inRest === 0, `colour stop, rest ${c.what}: frozen`);
  }

  // ---- With the flag off a film has no stops at all: its clock is the song's, and no table waits
  if (want('flagoff')) {
    const r = await page.eval(async ({ a, b }) => {
      const { setFlag } = await import('/src/score/flags.js'), { same } = await import('/src/score/time.js');
      const song = app.song, T = window.trippee;
      const take = async () => { const was = song.rehearsal; song.rebuild({}); for (let i = 0; i < 200 && song.rehearsal === was; i++) await new Promise(r => setTimeout(r, 100)); };
      setFlag('rests', false);
      await take();
      const sc = song.score, c = document.createElement('canvas'); c.width = 320; c.height = 180; const g = c.getContext('2d', { willReadFrequently: true });
      const out = { identity: sc.time === same, rests: sc.react.M.rests.length, pictureT: app.pictureT((a + b) / 2) === (a + b) / 2 };
      let pf = null, z = 0, n = 0;
      T.seek(a - 0.1);
      for (let i = 0; i < 90; i++) { T.step(1 / 60); g.drawImage(T.canvas, 0, 0, 320, 180); const f = g.getImageData(0, 0, 320, 180).data; if (pf) { let same_ = true; for (let k = 0; k < f.length; k += 4) if (f[k] !== pf[k]) { same_ = false; break; } if (same_) z++; n++; } pf = f; }
      out.stillFrames = z; out.frames = n; out.cIsT = app.lastFrame.c === app.t;
      setFlag('rests', true);
      await take();
      out.back = song.score.react.M.rests.length;
      return out;
    }, { a, b });
    log('flag off', JSON.stringify(r));
    check(r.identity && r.rests === 0 && r.pictureT && r.cIsT, 'rests off: the clock is the identity itself');
    check(r.stillFrames === 0, 'rests off: the film runs straight through where the rest was');
    check(r.back === info.rests.length, 'rests on again: the rest is back');
  }

  // ---- A real click on a real tile, in the middle of the rest. It runs on real seconds, so a rest can't stall it.
  if (want('click')) {
    const mouse = (type, x, y, o = {}) => page.send('Input.dispatchMouseEvent', { type, x, y, button: o.button ?? 'none', buttons: o.buttons ?? 0, clickCount: o.clickCount ?? 0 });
    await page.eval(() => {
      window.trippee.run();
      app.ui.library.show(true);
      window.__tile = id => { const t = app.ui.library.tiles.get(id); t.b.scrollIntoView({ block: 'center' }); const r = t.b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2 - 8]; };
      const c = document.createElement('canvas'); c.width = 96; c.height = 54; const g = c.getContext('2d', { willReadFrequently: true });
      let prev = null;
      window.__trace = [];
      window.__on = () => {
        g.drawImage(app.canvas, 0, 0, 96, 54); const d = g.getImageData(0, 0, 96, 54).data; let s = 0;
        if (prev) for (let i = 0; i < d.length; i += 4) s += Math.abs(d[i] - prev[i]);
        prev = d;
        const f = app.lastFrame;
        window.__trace.push([+app.t.toFixed(3), +app.pictureT().toFixed(3), +(s / (96 * 54)).toFixed(2), f.G.pattern.id, f.N?.pattern.id ?? '', f.kind ?? '', +(f.T || 0).toFixed(3)]);
      };
      app.onFrame.push(window.__on);
    });
    const ids = await page.eval(() => app.patterns.filter(p => p.pool !== false).map(p => p.id));
    const used = new Set();
    for (const when of ['rest', 'slowing', 'catching']) {
      const lead = 4, at = when === 'rest' ? (a + b) / 2 : when === 'slowing' ? a - info.beat / 2 : b + 0.8;
      await page.eval(({ t }) => { window.__trace.length = 0; app.song.seek(t); if (!app.song.playing) app.song.play(); }, { t: a - lead });
      for (let i = 0; i < 400; i++) { if (await page.eval(`app.t < ${a - lead + 1.5}`)) break; await sleep(15); }     // the seek has to have happened
      for (let i = 0; i < 800; i++) { if (await page.eval(`app.t >= ${at - 0.75}`)) break; await sleep(15); }         // a click takes a little to arrive
      const seen = await page.eval('[app.lastFrame.G.pattern.id, app.lastFrame.N?.pattern.id, ...app.song.score.gestures.slice(0, 40).map(g => g.pattern.id)]');
      const target = ids.find(id => !seen.includes(id) && !used.has(id) && !/^body|^void/.test(id)) ?? ids.find(id => id !== seen[0] && id !== seen[1] && !used.has(id));
      used.add(target);
      const [x, y] = await page.eval(`__tile(${JSON.stringify(target)})`);
      await mouse('mouseMoved', x, y);
      for (let i = 0; i < 400; i++) { if (await page.eval(`app.t >= ${at - 0.02}`)) break; await sleep(4); }
      await mouse('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: 1 });
      await mouse('mouseReleased', x, y, { button: 'left', clickCount: 1 });
      const clicked = await page.eval('({t:app.t,pt:app.pictureT(),e:app.stage.score.handover?.e??null,still:app.stage.score.handover?.still??null})');
      let done = null;
      for (let i = 0; i < 90; i++) {
        await sleep(200);
        done = await page.eval(`({t:app.t,pat:app.lastFrame.G.pattern.id,moving:app.stage.morphing(app.pictureT()),want:!!app.stage.want})`);
        if (done.pat === target && !done.moving && !done.want) break;
      }
      const tr = await page.eval('window.__trace.slice()');
      const during = tr.filter(r => r[0] > clicked.t && r[0] < clicked.t + 11), top = [...during].sort((p, q) => q[2] - p[2]).slice(0, 3).map(r => `${r[2]}@${r[0]}`);
      const med = (v => v[v.length >> 1])(during.map(r => r[2]).sort((p, q) => p - q));
      const iTop = tr.indexOf(tr.find(r => r[0] === +top[0]?.split('@')[1]));
      if (iTop >= 0 && +top[0].split('@')[0] > 3 * med) log('  around the biggest step:', tr.slice(Math.max(0, iTop - 2), iTop + 3).map(r => r.join(' ')).join(' | '));
      const iClick = tr.findIndex(r => r[0] >= clicked.t);
      if (when === 'rest') log('  frames round the click:', tr.slice(Math.max(0, iClick - 2), iClick + 7).map(r => `${r[0]} d${r[2]} ${r[3]}>${r[4]} ${r[5]} T${r[6]}`).join(' | '));
      const stillInRest = tr.filter(r => r[0] > Math.max(a, clicked.t + 0.25) && r[0] < b && r[5]);
      log(`  click ${when}: at song ${clicked.t.toFixed(2)} picture ${clicked.pt.toFixed(2)} (rest ${a}..${b}), handover e=${clicked.e} still=${clicked.still}; ${done.pat}, moving ${done.moving} at ${done.t.toFixed(2)}; in the rest it flew ${stillInRest.length} frames, T ${stillInRest[0]?.[6]}..${stillInRest.at(-1)?.[6]}; biggest steps ${top.join(' ')}, median ${med}`);
      check(done.pat === target && !done.moving && done.t - clicked.t < 11, `click while ${when}: it got there, in ${(done.t - clicked.t).toFixed(1)} s`);
      if (when === 'rest') check(stillInRest.length > 0 && stillInRest.at(-1)[6] >= stillInRest[0][6], 'the transformation ran on through the rest');
      await sleep(300);
    }
    await page.eval(() => { app.onFrame.splice(app.onFrame.indexOf(window.__on), 1); app.ui.library.show(false); app.song.pause?.(); });
  }

  const E = errs();
  log('errors', E.length ? E.slice(0, 5) : 'none');
  log(fails.length ? `FAILED ${fails.length}: ${fails.join('; ')}` : 'all passed');
};
