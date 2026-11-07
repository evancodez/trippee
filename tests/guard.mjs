// The film's guard, src/music/rehearse.js. Muted, as every lab run; the song never plays.
//
//   SONGS=mgmt,ppp node tools/lab.mjs tests/guard.mjs --out lab-out/guard
//
//   Eyes     a batch of reads hands over exactly the pixels a read at a time would
//   Slowed   a flow slowed for a few seconds: its clock never steps, never runs back, is at 1/by where it should be and unchanged away from there, and a gear change stays on its bar
//   Film     what the guard did to each song's film: nothing on the whole gesture, no flow under half in a stretch louder than the middle of the song, no transformation gone from a loud stretch unless the whole frame flashed, all of it in score.refused
import { resolve } from 'node:path';

export default async ({ page, log, sleep }) => {
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
  const songs = (process.env.SONGS || 'mgmt,ppp').split(',');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 360, deviceScaleFactor: 1, mobile: false });
  await sleep(300);

  const slowed = await page.eval(async () => {
    const here = u => new URL(u, location.href).href;
    const [{ slowedTrack }, { evalTrack }] = await Promise.all(['src/music/rehearse.js', 'src/score/curves.js'].map(u => import(here(u))));
    // In beats at 2 a second: 1/4 a beat, with a gear change at 60 s to 1/8 over 3 s. Slowed from 20 to 24 s.
    const tau = t => t * 2, was = [{ t: 0, x: 0, v: 0.25 }, { t: 120, x: 30, v: 0.25 }, { t: 126, x: 31.125, v: 0.125 }];
    const out = {};
    for (const pay of [false, true]) {
      const T = slowedTrack({ phiTrack: was, t0: 0, t1: 100, morph: 8 }, tau, 20, 24, 2, pay), rate = t => (evalTrack(T, tau(t) + 0.001) - evalTrack(T, tau(t) - 0.001)) / 0.002 / 2 / 0.5;       // how fast against 1/4 a beat
      let back = 0, step = 0;
      for (let t = 0; t < 100; t += 0.01) { const d = evalTrack(T, tau(t + 0.01)) - evalTrack(T, tau(t)); if (d < -1e-9) back++; step = Math.max(step, Math.abs(d)); }
      let topAccel = 0;
      for (let t = 0; t < 100; t += 0.01) topAccel = Math.max(topAccel, Math.abs(rate(t + 0.01) - rate(t)) / 0.01);
      const lag = t => evalTrack(was, tau(t)) - evalTrack(T, tau(t));
      out[pay ? 'pay' : 'plain'] = { back, step, topAccel, before: rate(10), lagBefore: lag(10), mid: rate(22), after: rate(40), lag30: lag(30), lag50: lag(50), lag90: lag(90), top: Math.max(...Array.from({ length: 600 }, (_, i) => rate(20 + i * 0.05))) };
    }
    return out;
  });
  for (const [k, r] of Object.entries(slowed)) {
    say(!r.back, `Slowed, ${k}: the clock never runs back`);
    say(Math.abs(r.mid - 0.5) < 0.02, `Slowed, ${k}: half speed in the window (${r.mid.toFixed(3)})`);
    say(Math.abs(r.before - 1) < 1e-3 && Math.abs(r.lagBefore) < 1e-6, `Slowed, ${k}: nothing changes before it`);
    say(Math.abs(r.after - 1) < 0.02 || k === 'pay', `Slowed, ${k}: back to full speed after it (${r.after.toFixed(3)})`);
    say(r.topAccel < 1.5, `Slowed, ${k}: speed changes smoothly, at most ${r.topAccel.toFixed(2)} of full speed a second`);
    say(k === 'pay' ? Math.abs(r.lag90) < 1e-6 : Math.abs(r.lag50 - r.lag30) < 1e-6 && r.lag30 > 0, `Slowed, ${k}: ${k === 'pay' ? 'the time is paid back, and at 90 s it\'s exactly where it was' : `stays ${r.lag30.toFixed(3)} cycles behind`}`);
    if (k === 'pay') say(r.top < 1.4, `Slowed, pay: at most ${r.top.toFixed(2)} of full speed paying it back`);
  }

  for (const song of songs) {
    const data = { items: [], files: [resolve(`media/${song}.mp3`)], dragOperationsMask: 1 };
    await page.goto(await page.eval('location.href'));
    for (let i = 0; i < 200; i++) { let ok = false; try { ok = await page.eval('window.trippee?.ready===true'); } catch { /* still navigating */ } if (ok) break; await sleep(250); }
    await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 320, y: 180, data });
    await page.send('Input.dispatchDragEvent', { type: 'drop', x: 320, y: 180, data });
    for (let i = 0; i < 3000; i++) { if (await page.eval('app.ui.song.state==="ready"')) break; await sleep(100); }
    const r = await page.eval(async () => {
      const here = u => new URL(u, location.href).href;
      const { getRig, shot, drawn, Eyes, FlashSeen } = await import(here('src/music/rehearse.js'));
      app.song.pause();
      const R = await getRig(), S = app.song.score, g = S.gestures, dur = app.song.duration, W = 160, H = 90, n = 200, px = new Uint8Array(W * H * 4);
      const a = new FlashSeen(n, W, H, 30), b = new FlashSeen(n, W, H, 30), when = i => 5 + i * (dur - 10) / n;
      for (let i = 0; i < n; i++) { const f = shot(R, S, when(i), W, H, px); a.take(i, px, f, g); }
      const task = () => new Promise(res => setTimeout(res));
      const eyes = new Eyes(R, W, H, 32, task);
      for (let i = 0; i < n; i++) { const f = drawn(R, S, when(i), W, H), o = { from: f.from, G: f.G, kind: f.kind }; if (eyes.read(p => b.take(i, p, o, g))) await eyes.flush(); }
      await eyes.flush(); eyes.free();
      let differ = 0;
      for (let i = 0; i < n * 16; i++) if (a.tiles[i] !== b.tiles[i]) differ++;
      const E = S.react?.energy, hz = S.react?.hz || 50, sorted = E ? Float32Array.from(E).sort() : null, mid = sorted?.[sorted.length >> 1];
      const louder = t => { if (!E) return true; const i0 = Math.max(0, Math.floor((t - 4) * hz)), i1 = Math.min(E.length, Math.ceil((t + 4) * hz)); let s = 0; for (let i = i0; i < i1; i++) s += E[i]; return s / (i1 - i0) > mid; };
      const r = app.song.rehearsal;
      return {
        differ, seconds: r.seconds, flash: { ...r.flash, tried: undefined }, refused: S.refused,
        whole: g.filter(G => G.phiScale || G.flashSlower).map(G => G.pattern.id),
        fixes: (r.flash?.fixes ?? []).map(f => ({ ...f, loud: louder(f.t) })),
      };
    });
    say(!r.differ, `${song}, Eyes: batched reads are the same as one at a time on all 200 looks (${r.differ} tile values differ)`);
    say(!r.whole.length, `${song}, Film: no gesture slowed whole ${r.whole.join(' ')}`);
    const under = r.fixes.filter(f => f.loud && /flow \/([3-9]|\d\d)/.test(f.did)), gone = r.fixes.filter(f => f.loud && /^no /.test(f.did));
    say(!under.length, `${song}, Film: nothing loud under half its flow ${JSON.stringify(under)}`);
    log(`${gone.length ? '    ' : 'ok  '} ${song}, Film: ${gone.length} transformations gone from a loud stretch, which only a whole-frame flash can do ${JSON.stringify(gone)}`);
    const said = r.fixes.filter(f => !(r.refused ?? []).some(x => Math.abs(x.t - f.t) < 0.01));
    say(!said.length, `${song}, Film: every change is in score.refused ${JSON.stringify(said)}`);
    log(`     ${song}: rehearsal ${r.seconds.toFixed(1)} s, guard ${r.flash.seconds} s, ${r.flash.falseAlarms} false alarms looked at and left alone, ${r.fixes.length} softenings: ${r.fixes.map(f => `${f.t} ${f.id} ${f.did}`).join('; ')}. Left in: ${JSON.stringify(r.flash.left)}`);
  }
  const errs = page.logs.filter(l => /^\[(error|exception)\]/.test(l));
  say(!errs.length, `page errors: ${errs.length} ${errs.at(-1)?.slice(0, 300) ?? ''}`);
  log(bad ? `FAIL ${bad} not as they should be` : 'all as they should be');
  if (bad) process.exitCode = 1;
};
