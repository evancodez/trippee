// Ramp: a long move that hangs, draws back, whips through, crosses its moment at top speed and coasts. STAGE=numbers,body,landing,flash node tools/lab.mjs tests/ramp.mjs --size 1280,720 --out lab-out/v1-ramp
//   numbers   10 pairs, landing on a flight: the fastest frame of what's arriving is within a frame of the landing and under 1.2 ln/s. Then the same patterns with the moment inside the gesture.
//   body      PATS=a,b  sheets and time-slices of a moment inside a gesture
//   landing   PAIRS=a>b,c>d  sheets and time-slices through a real flight into a Ramp, against the same flight without one
//   flash     the judge's count for the hand patterns and a few body ramps
import { watch, analyse } from '../tools/look.mjs';
const STAGES = (process.env.STAGE || 'numbers').split(',');
const sleep = ms => new Promise(r => setTimeout(r, ms));
export const TEN = [['lines.river', 'checks.twist'], ['checks.vega', 'lattice.master'], ['lattice.master', 'rooms.nested'], ['rooms.room', 'lines.fall'], ['waves.current', 'checks.cloth'], ['lattice.teeth', 'rooms.stair'], ['checks.crush', 'pole.dipole'], ['pole.garden', 'lattice.pinwheel'], ['dials.board', 'rooms.dive'], ['rooms.hall', 'checks.target']];

const inPage = async ({ TEN, hit, D }) => {
  const { SLOT_FLOATS } = await import(new URL('src/pattern/layout.js', location.href).href);
  const { fillSlot } = await import(new URL('src/score/slot.js', location.href).href);
  const { rampTrack, CAP, moveReads, moveStep } = await import(new URL('src/score/moves/ramp.js', location.href).href);
  const { byId } = await import(new URL('src/pattern/library.js', location.href).href);
  const easeIn = (t, t1, stop) => (t >= t1 ? t : t1 - stop * (x => x - x * x / 2)(Math.min(1, (t1 - t) / stop)));
  const out = [], s = new Float32Array(SLOT_FLOATS), dt = 1 / 60;
  for (const [a, b] of TEN) {
    const N = { t0: hit, t1: hit + 40, arcEnd: hit + 40, pattern: byId[b] };
    if (!N.pattern) { out.push({ a, b, missing: true }); continue; }
    const K = rampTrack(N, { hit: D ? hit + D : hit });
    if (!K) { out.push({ a, b, none: true }); continue; }
    N.uTrack = K;
    const stop = 3.2, at = t => (D ? t : easeIn(t, hit, stop));
    const tOf = i => hit - 6 + i * dt;
    let prev = null, peak = 0, peakAt = 0, onIt = 0;
    for (let i = 0; i < 60 * 30; i++) {
      const t = tOf(i);
      fillSlot(s, N, at(t), N.pattern, { phi: 0 });
      const r = moveReads(s);
      if (prev) { const v = moveStep(r, prev) / dt; if (v > peak) { peak = v; peakAt = t - dt / 2; } if (Math.abs(t - dt / 2 - (D ? hit + D : hit)) <= dt) onIt = Math.max(onIt, v); }
      prev = r;
    }
    out.push({ a, b, peak: +peak.toFixed(3), share: +(onIt / Math.max(peak, 1e-6)).toFixed(3), off: +(peakAt - (D ? hit + D : hit)).toFixed(4), knots: K.map(k => [+k.t.toFixed(2), +k.x.toFixed(3), +(k.v ?? 0).toFixed(3)]) });
  }
  return { out, CAP };
};

export default async ({ page, save, log }) => {
  for (let i = 0; i < 400 && !(await page.eval('window.trippee?.ready===true')); i++) await sleep(100);
  await page.eval(`app.governor.enabled=false; app.R.drawScale=1; document.querySelector('#hints')&&(document.querySelector('#hints').hidden=true);`);
  const errors = () => page.logs.filter(l => /\[error\]|\[exception\]/.test(l));

  if (STAGES.includes('numbers')) {
    let bad = 0;
    for (const [what, D] of [['landing', 0], ['inside', 12]]) {
      const { out, CAP } = await page.eval(inPage, { TEN, hit: 20, D });
      for (const r of out) {
        if (r.missing || r.none) { log('  -- ', what, r.b, r.missing ? 'no such pattern' : 'no long move'); continue; }
        const ok = (Math.abs(r.off) <= 1 / 60 + 1e-6 || r.share >= 0.995) && r.peak <= CAP + 1e-3;      // a long flat top: the moment is on it
        if (!ok) bad++;
        log(ok ? 'ok  ' : 'FAIL', what.padEnd(8), r.b.padEnd(20), 'peak', String(r.peak).padEnd(6), 'ln/s, off the moment by', r.off, 's, at the moment', r.share, JSON.stringify(r.knots));
      }
    }
    log(bad ? `FAIL ${bad}` : 'ok   every ramp is at top speed on its moment, under 1.2');
  }

  // Between 0 and 40 s: the moment at 16 s
  const setBody = (id, hit, arcs = '') => page.eval(`(async () => { const { rampTrack } = await import(new URL('src/score/moves/ramp.js', location.href).href);
    const s = app.stage, p = app.byId[${JSON.stringify(id)}], G = { t0: 0, t1: 3600, arcEnd: 40, pattern: p, ${arcs} };
    s.score = { gestures: [G], phi: t => t / 8, song: null, handover: null }; s.hold = true; G.uTrack = rampTrack(G, { hit: ${hit} }); window.__K = G.uTrack; app.t = 0; trippee.seek(0); return G.uTrack; })()`);
  if (STAGES.includes('body')) {
    for (const id of (process.env.PATS || 'lattice.master,rooms.nested,checks.twist').split(',')) {
      const K = await setBody(id, 16, process.env.ARCS || '');
      const w = await watch(page, save, { name: `body-${id}`, seconds: 28, fps: 30, cols: 8, rows: 5 });
      const a = analyse(w), i = w.diff.indexOf(Math.max(...w.diff));
      log(id.padEnd(18), 'most change at', w.time[i], 'whole', a.flashesPerSecondWholeFrame, 'tile', a.flashesPerSecondAnyTile, 'white', Math.min(...w.white).toFixed(2), Math.max(...w.white).toFixed(2), JSON.stringify(K?.map(k => [+k.t.toFixed(2), +k.x.toFixed(3)])), errors().slice(0, 2).join(' | '));
    }
  }

  // A real flight, with the same film with and without the ramp
  if (STAGES.includes('landing')) {
    for (const pair of (process.env.PAIRS || 'checks.vega>lattice.master,lines.river>rooms.nested').split(',')) {
      const [a, b] = pair.split('>');
      for (const ramped of [0, 1]) {
        await page.eval(`(async () => { const { rampTrack } = await import(new URL('src/score/moves/ramp.js', location.href).href);
          const s = app.stage, A = { t0: -20, t1: 16, arcEnd: 16, pattern: app.byId[${JSON.stringify(a)}], morph: 8, rise: false }, N = { t0: 16, t1: 3600, arcEnd: 60, pattern: app.byId[${JSON.stringify(b)}] };
          s.score = { gestures: [A, N], phi: t => t / 8, song: null, handover: null }; s.hold = true; if (${ramped}) N.uTrack = rampTrack(N, { hit: 16 }); app.t = 0; trippee.seek(4); })()`);
        const w = await watch(page, save, { name: `land-${a}-${b}-${ramped ? 'ramp' : 'plain'}`, seconds: 20, fps: 60, cols: 8, rows: 4, setup: 'trippee.seek(5)' });
        const a2 = analyse(w), at = t => w.diff[w.time.findIndex(x => x >= t)];
        log(pair.padEnd(30), ramped ? 'ramp ' : 'plain', 'diff at landing -.5 0 +.5 +1:', at(15.5), at(16), at(16.5), at(17), 'whole', a2.flashesPerSecondWholeFrame, 'tile', a2.flashesPerSecondAnyTile, errors().slice(0, 2).join(' | '));
      }
    }
  }

  if (STAGES.includes('flash')) {
    const ids = (process.env.PATS || '').split(',').filter(Boolean);
    for (const id of ids) {
      await page.eval(`(() => { const s = app.stage; s.score = { gestures: [{ t0: 0, t1: 3600, arcEnd: 44, period: 44, pattern: app.byId[${JSON.stringify(id)}] }], phi: t => t * 76 / 480, song: null, handover: null }; s.hold = true; app.t = 0; trippee.seek(0); })()`);
      const w = await watch(page, save, { name: `flash-${id}`, seconds: +(process.env.SECS || 24), fps: 30, cols: 8, rows: 3 });
      const a = analyse(w);
      log(id.padEnd(16), 'whole', a.flashesPerSecondWholeFrame, 'tile', a.flashesPerSecondAnyTile, 'white', Math.min(...w.white).toFixed(2), Math.max(...w.white).toFixed(2), errors().slice(0, 2).join(' | '));
    }
  }
  log(errors().slice(0, 5).join('\n') || 'no page errors');
};
