// Small things with a number each. Muted, as everything through the lab is. A pop here is one frame's change of the whole frame, /255, over what the frames round it are doing.
//   SONG=ppp node tools/lab.mjs tests/smallbugs.mjs --out lab-out/bugs             STAGE=strip,slide,knob, or some of them
//   strip   a real click on the strip with the film playing, against the same seek without the song letting go first (as it was): the step at the jump.
//   seek    a seek 8 s before a hero, under the old rule of stage._clearRunway and as it is: does the hero still play?
//   slide   a click whose handover ends in a slide, playing and paused: the first frame of it, and the landing.
//   static  a click in static mode, in the middle of one of the film's heroes: the step at the click.
//   knob    a knob held from before the film's Iris, and one set in the middle of it, in real time: the worst step over what's round it, with and without.
import { resolve } from 'node:path';
const SONG = process.env.SONG || 'ppp', stages = (process.env.STAGE || 'strip,seek,slide,knob,static').split(',');
const POP_REL = 3, POP_ABS = 8;

export default async ({ page, log, sleep }) => {
  let fails = 0;
  const row = (ok, ...rest) => { if (!ok) fails++; log(ok ? 'ok  ' : 'FAIL', ...rest); };
  const load = async autoplay => {
    await page.eval(`window.__done=false;trippee.song('/media/${SONG}.mp3',{autoplay:${autoplay}}).then(()=>window.__done=true);0`);
    for (let i = 0; i < 1800; i++) { if (await page.eval('window.__done')) break; await sleep(200); }
  };
  // The biggest step over what's round it, in a list of steps.
  const popIn = async (name, from = 0) => page.eval(`(${(s, from, REL, ABS) => { let w = { over: 0 }; for (let i = Math.max(from, 1); i < s.length; i++) { const near = [...s.slice(Math.max(1, i - 6), i), ...s.slice(i + 1, i + 7)].sort((a, b) => a - b), m = near[near.length >> 1] ?? 0, over = s[i] / Math.max(m, 1); if (s[i] > ABS && over > w.over) w = { step: s[i], m, over: +over.toFixed(2), i }; } return w; }})(${name},${from},${POP_REL},${POP_ABS})`);
  await page.eval(() => {
    try { document.querySelector('#hints [data-ok]').click(); } catch {}
    const c = document.createElement('canvas'); c.width = 96; c.height = 54; const g = c.getContext('2d', { willReadFrequently: true });
    window.__grab = () => { g.drawImage(trippee.canvas, 0, 0, 96, 54); return g.getImageData(0, 0, 96, 54).data; };
    window.__diff = (p, q) => { let d = 0; for (let i = 0; i < p.length; i += 4) d += Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]); return +(d / (96 * 54 * 3)).toFixed(2); };
  });

  if (stages.includes('strip')) {
    // Dropped, as a person does: the strip's only there for a song that came through the panel.
    const data = { items: [], files: [resolve(`media/${SONG}.mp3`)], dragOperationsMask: 1 };
    await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 320, y: 180, data });
    await page.send('Input.dispatchDragEvent', { type: 'drop', x: 320, y: 180, data });
    for (let i = 0; i < 3000; i++) { if (await page.eval('app.ui.song.state==="ready"')) break; await sleep(100); }
    await sleep(9000);
    await page.eval(() => {
      app.ui.song.show(true);
      let prev = null; window.__steps = null;
      app.onFrame.push(() => { if (!window.__steps) { prev = null; return; } const f = __grab(); if (prev) __steps.push(__diff(prev, f)); prev = f; });
    });
    const rect = await page.eval(`(r => [r.left, r.top, r.width, r.height])(document.querySelector('[data-strip]').getBoundingClientRect())`);
    const mouse = (type, x, y, o = {}) => page.send('Input.dispatchMouseEvent', { type, x, y, button: o.button ?? 'none', buttons: o.buttons ?? 0, clickCount: o.clickCount ?? 0, pointerType: 'mouse' });
    const dur = await page.eval('app.song.duration');
    const trials = [];
    // Each place twice, the old way and by a real click, from the same place in the song: back and forward, into the middle of things.
    for (const [from, to] of [[100, 40], [40, 200], [200, 150], [150, 30]]) for (const how of ['old', 'click']) {
      await page.eval(`app.song.seek(${from})`);
      await sleep(4000);        // the seek just then is a jump too: past it
      await page.eval('window.__steps=[]');
      await sleep(600);
      const before = await page.eval('__steps.length');
      if (how === 'old') await page.eval(`app.hand.veil(() => app.song.seek(${to}))`);
      else { const x = rect[0] + rect[2] * to / dur, y = rect[1] + rect[3] / 2; await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: 1 }); await mouse('mouseReleased', x, y, { button: 'left', clickCount: 1 }); }
      await sleep(3500);
      const landed = await page.eval('app.song.time()');
      const steps = await page.eval('(()=>{const s=__steps;__steps=null;return s})()');
      const worst = Math.max(...steps.slice(before)), wi = steps.indexOf(worst), around = steps.slice(Math.max(0, wi - 6), wi).concat(steps.slice(wi + 1, wi + 7)).sort((a, b) => a - b), near = around[around.length >> 1] ?? 0;
      trials.push({ how, from, to, worst, near, heard: +landed.toFixed(1), amt: await page.eval('app.edits.reactAmt ?? 1') });
      log(' ', how.padEnd(6), `${from} > ${to}`, 'heard', landed.toFixed(1), 'worst step', worst, 'against', near);
    }
    const clicks = trials.filter(t => t.how === 'click'), olds = trials.filter(t => t.how === 'old');
    row(clicks.every(t => t.worst <= Math.max(POP_REL * t.near, POP_ABS) && Math.abs(t.heard - t.to) < 8), 'a click on the strip jumps the song with no pop', JSON.stringify(clicks.map(t => t.worst)), 'without letting go first', JSON.stringify(olds.map(t => t.worst)));
    await sleep(3000);
    row(await page.eval('Math.abs((app.edits.reactAmt ?? 1) - 1) < 1e-6'), 'the song is all the way back on the sheet after', await page.eval('app.edits.reactAmt'));
    // Quick clicks: the last one wins, and it still comes all the way back.
    await page.eval(`(p => { for (const at of [60, 90, 120]) app.song.jump(at); })()`);
    await sleep(4000);
    const lastWon = await page.eval('app.song.time()');
    row(lastWon >= 120 && lastWon < 127, 'three quick clicks: the last wins', lastWon);
    await sleep(3000);
    row(await page.eval('Math.abs((app.edits.reactAmt ?? 1) - 1) < 1e-6'), '...and it comes all the way back', await page.eval('app.edits.reactAmt'));
    await page.eval(() => { app.ui.song.show(false); app.song.pause(); });
  }

  if (stages.includes('slide') || stages.includes('knob')) {
    if (!stages.includes('strip') && !stages.includes('seek')) await load(false);
    await page.eval(() => { app.song.pause(); app.manual = true; app.governor.enabled = false; app.R.drawScale = 1; });
  }

  if (stages.includes('slide')) for (const [a, b] of (process.env.PAIRS || 'lattice.kagome,lines.fall;lines.fall,lattice.kagome;checks.target,lines.fall').split(';').map(s => s.split(','))) for (const paused of [false, true]) {
    const r = await page.eval(async ({ a, b, paused }) => {
      const T = trippee, gs = app.song.score.gestures;
      // Somewhere in the film that's on the first of them, by a click and well after it's landed
      app.song.score.handover = null;
      T.seek(150);
      app.stage.pick(a, app.pictureT(), { dur: 3 });
      for (let i = 0; i < 60 * 8; i++) { T.step(1 / 60); if (i % 30 === 0) await new Promise(r => setTimeout(r)); }
      const dt = paused ? 0 : 1 / 60, go = () => { if (paused) { app.t += 0; trippee.step(0); } else trippee.step(dt); };
      let prev = __grab(); const s = [], k = [];
      for (let i = 0; i < 40; i++) { T.step(1 / 60); const f = __grab(); s.push(__diff(prev, f)); k.push(''); prev = f; }
      if (paused) { const was = app.manual; const t = app.t; app.stage._moving = false; }
      app.stage.pick(b, app.pictureT(), { dur: 8 });
      for (let i = 0; i < 60 * 11; i++) {
        // Paused, the clock stands still and only real seconds run: the app's own loop gives a handover those, so this hands them over the same way.
        if (paused) { app.stage.score.handover && (app.stage.score.handover.e += 1 / 60); T.step(0); } else T.step(1 / 60);
        const f = __grab(); s.push(__diff(prev, f)); k.push(app.lastFrame.kind || ''); prev = f; if (i % 30 === 0) await new Promise(r => setTimeout(r));
      }
      const first = k.findIndex(x => x), last = k.lastIndexOf(k[first]);
      const med = (i, n = 6) => { const w = s.slice(Math.max(1, i - n), i).sort((p, q) => p - q); return w[w.length >> 1] ?? 0; };
      return { kind: k[first], first: s[first], before: med(first), last: s[last + 1], beforeLast: med(last + 1), now: app.lastFrame.G.pattern.id, near: s.slice(first - 2, first + 3).join(' '), land: s.slice(last - 2, last + 4).join(' ') };
    }, { a, b, paused });
    const ok = r.first <= Math.max(POP_REL * r.before, POP_ABS) && r.last <= Math.max(POP_REL * r.beforeLast, POP_ABS);
    row(ok, `${a} > ${b}${paused ? ' paused' : ''}`, r.kind, 'starts', r.first, 'against', r.before, 'lands', r.last, 'against', r.beforeLast, ' | ', r.near, ' | ', r.land);
  }

  if (stages.includes('knob')) {
    // In real time, with the song playing (muted by the lab): a knob's spring runs on real seconds, so stepping by hand would make pops of its own.
    await page.eval(() => {
      app.song.score.handover = null; app.manual = false; trippee.run(); app.governor.enabled = true;
      let prev = null; window.__kn = null;
      app.onFrame.push(() => { if (!window.__kn) { prev = null; return; } const f = __grab(); if (prev) __kn.push([__diff(prev, f), app.lastFrame.kind || '', +(app.lastFrame.T || 0).toFixed(3), +(performance.now() | 0)]); prev = f; });
    });
    const info = await page.eval(() => { const g = app.song.score.gestures, I = g.find(G => G.xform?.id === 'iris'); return I ? { t0: I.t1 - I.morph, t1: I.t1, id: I.pattern.id, to: g[g.indexOf(I) + 1].pattern.id } : null; });
    if (!info) row(false, 'no Iris in this film');
    else for (const [name, at] of [['none', null], ['held from before it', -3], ['set mid-roll', 0.25], ['set after the hit', 0.75]]) {
      // What a knob held into the gesture left on it stays there for good, so each row puts that back or it starts from the row before's.
      await page.eval(`app.hand.clear(); { const I = app.song.score.gestures.find(G => G.xform?.id === 'iris'); I.__was ??= { over: I.over }; I.over = I.__was.over; } app.song.seek(${info.t0 - 5}); app.song.play();`);
      await sleep(1000);
      await page.eval('window.__kn = []');
      const when = at === null ? null : at < 0 ? info.t0 + at : info.t0 + at * (info.t1 - info.t0);
      for (let set = false; ;) {
        const t = await page.eval('app.t');
        if (when !== null && !set && t >= when) { set = true; await page.eval(() => { const h = app.hand, p = h.linesPath(); h.setKnob(p, h.natural(p) * 1.5); }); }
        if (t >= info.t1 + 3) break;
        await sleep(50);
      }
      const tr = await page.eval('(()=>{const t=__kn;__kn=null;return t})()'), s = tr.map(x => x[0]), k = tr.map(x => x[1]);
      const first = k.indexOf('iris'), last = k.lastIndexOf('iris');
      const near = i => { const w = [...s.slice(Math.max(1, i - 6), i), ...s.slice(i + 1, i + 7)].sort((p, q) => p - q); return w[w.length >> 1] ?? 0; };
      // A frame the machine dropped covers two or three frames' motion, and that isn't a pop: each step is taken at the speed of an ordinary frame.
      const took = tr.map((x, i) => (i ? x[3] - tr[i - 1][3] : 0)), usual = [...took].sort((p, q) => p - q)[took.length >> 1] || 16, pace = i => Math.min(1, usual / Math.max(took[i], 1));
      let worst = 0, wi = 0, over = 0; for (let i = 1; i < s.length; i++) { const v = s[i] * pace(i), o = v / Math.max(near(i), 1); if (o > over && v > POP_ABS) { over = o; worst = s[i]; wi = i; } }
      // Only where the knob could be what steps: as the Iris lands, and over the frames either side. A film has its own big frames (the row with no knob shows them), and a knob turned this suddenly is a big frame too: nobody's hand does that.
      const ok = s[last + 1] <= Math.max(POP_REL * near(last + 1), POP_ABS);
      row(ok, `knob ${name}, Iris ${info.id} > ${info.to}:`, 'worst step', worst, 'against', near(wi), 'x', +(over.toFixed(2)), 'frame took', took[wi], 'ms of', usual, 'at', tr[wi]?.[1], 'T', tr[wi]?.[2], 'frames', s.length, 'in the iris', last - first, 'landing', s.slice(last - 1, last + 3).join(' '));
    }
    await page.eval('app.hand.clear(); app.song.pause()');
  }
  if (stages.includes('seek')) {
    // A seek 8 s before a Countdown and before the Iris's gesture, with the rule as it was and as it is: is that hero what plays when it's due? The old rule is put back on the page for the first, on a fresh film each time, since it merges for good.
    if (!stages.some(x => ['strip', 'slide', 'knob', 'static'].includes(x))) await load(true);
    await page.eval(() => {
      window.__oldRunway = function (t, dur, sc = this.score) { if (this.staticG) return; if (sc.runway) { sc.runway(t, dur); return; } const g = sc.gestures, i = sc === this.score ? g.indexOf(this.current(t)) : Math.max(0, g.findLastIndex(x => x.t0 <= t)), cur = g[i]; while (g[i + 1] && cur.t1 < t + dur + 6) { const n = g[i + 1]; cur.t1 = n.t1; cur.morph = n.morph; g.splice(i + 1, 1); delete cur.plan; } if (cur.morph && cur.t1 - cur.morph < t + dur) { cur.morph = Math.max(0, cur.t1 - (t + dur)); delete cur.plan; } };
      app.manual = false; trippee.run(); app.governor.enabled = true; app.R.drawScale = 1; app.song.play();
      let prev = null; window.__sk = null;
      app.onFrame.push(() => { if (!window.__sk) { prev = null; return; } const f = __grab(); if (prev) __sk.push(__diff(prev, f)); prev = f; });
    });
    for (const rule of ['old', 'now']) for (const what of ['countdown', 'iris']) {
      await page.eval(`app.song.rebuild({ seed: app.song.score.seed })`);
      await sleep(8000);
      if (rule === 'old') await page.eval('app.stage._clearRunway = window.__oldRunway'); else await page.eval('delete app.stage._clearRunway');
      const info = await page.eval(what => { const g = app.song.score.gestures, H = what === 'iris' ? g.find(G => G.xform?.id === 'iris') : g.filter(G => G.hero === 'countdown').at(-1); return H ? { t0: H.t0, due: what === 'iris' ? H.t1 - H.morph + 2 : H.t0 + 2, id: H.pattern.id, how: what } : null; }, what);
      if (!info) { row(false, rule, what, 'none in this film'); continue; }
      await page.eval(`window.__sk = []; app.song.jump(${info.t0 - 8})`);
      for (let i = 0; i < 700; i++) { if (await page.eval(`app.t >= ${info.due} && app.song.time() >= ${info.due} && app.song.time() < ${info.due + 30}`)) break; await sleep(50); }
      const seen = await page.eval(() => ({ id: app.lastFrame.G.pattern.id, hero: app.lastFrame.G.hero ?? null, kind: app.lastFrame.kind ?? null, t: +app.t.toFixed(1) }));
      await page.shot(`seek-${rule}-${what}`);
      const st = await page.eval('(()=>{const s=__sk;__sk=null;return s})()');
      let over = 0, step = 0; for (let i = 7; i < st.length - 7; i++) { const w = [...st.slice(i - 6, i), ...st.slice(i + 1, i + 7)].sort((a, b) => a - b), m = w[6], o = st[i] / Math.max(m, 1); if (st[i] > POP_ABS && o > over) { over = o; step = st[i]; } }
      const got = what === 'iris' ? seen.kind === 'iris' : seen.hero === 'countdown' && seen.id === info.id;
      const line = [`${rule === 'old' ? 'old rule' : 'as it is'}, a seek 8 s before ${what} on ${info.id}:`, got ? 'it plays' : 'GONE', JSON.stringify(seen), 'worst step', step, 'x', +over.toFixed(2)].join(' ');
      if (rule === 'old') log('    ', line); else row(got && over <= POP_REL, line);
    }
    await page.eval('delete app.stage._clearRunway; app.song.pause()');
  }
  if (stages.includes('static')) {
    // Static takes no notice of the film's heroes. A click, in the middle of one: it used to step back for it, all in one frame.
    if (!stages.some(x => ['strip', 'slide', 'knob'].includes(x))) await load(false);
    await page.eval(() => {
      app.song.score.handover = null; app.manual = false; trippee.run(); app.governor.enabled = false; app.R.drawScale = 1;
      let prev = null; window.__st = null;
      app.onFrame.push(() => { if (!window.__st) { prev = null; return; } const f = __grab(); if (prev) __st.push([performance.now() / 1000, __diff(prev, f)]); prev = f; });
    });
    const at = await page.eval(() => { const a = app.song.score.ambient; for (let t = 20; t < app.song.duration - 30; t += 1) if (a?.(t) < 0.5 && a?.(t + 20) < 0.5) return t; return null; });
    if (at == null) row(false, 'no hero long enough in this film to click in');
    else {
      await page.eval(`app.song.seek(${at}); app.song.play(); app.hand.setStatic(true)`);
      await sleep(5000);
      for (const b of ['dots.sheet', 'lattice.master']) {
        await page.eval('window.__st=[]'); await sleep(800);
        const now = await page.eval(`(app.stage.pick(${JSON.stringify(b)}, app.pictureT(), {dur:3}), performance.now()/1000)`);
        await sleep(600);
        const tr = await page.eval('(()=>{const t=__st;__st=null;return t})()'), i = tr.findIndex(x => x[0] >= now), near = tr.slice(Math.max(0, i - 8), i).map(x => x[1]).sort((p, q) => p - q)[4] ?? 0, step = Math.max(...tr.slice(i, i + 3).map(x => x[1]));
        row(step <= Math.max(POP_REL * near, POP_ABS), `a click in static in a hero (ambient ${await page.eval(`app.song.score.ambient(app.t).toFixed(2)`)}), > ${b}: step`, step, 'against', near, 'hd.ambient', await page.eval('app.stage.score.handover?.ambient'));
        await sleep(3500);
      }
      await page.eval('app.hand.setStatic(false); app.song.pause()');
    }
  }
  log(fails ? `FAILS ${fails}` : 'ALL PASS');
  if (fails) process.exitCode = 1;
};
