// One-frame pops anywhere in a film, not only around its boundaries: the whole film by seek at 60 fps, small, the same every run. Muted: the song never plays.
//   SONG=media/mgmt.mp3 SEED=9 node tools/lab.mjs tests/filmpops.mjs --out lab-out/me           lists every step over 3x what's around it and over 8/255, with what was showing
// A pop is a frame that changes far more than the frames either side of it. Exits 1 if there are any.
import { resolve } from 'node:path';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LIMIT_REL = 3, LIMIT_ABS = 8, AROUND = 6;
export default async ({ page, log, save }) => {
  const song = process.env.SONG || 'media/ppp.mp3', seed = process.env.SEED;
  const data = { items: [], files: [resolve(song)], dragOperationsMask: 1 };
  await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 640, y: 360, data });
  await page.send('Input.dispatchDragEvent', { type: 'drop', x: 640, y: 360, data });
  for (let i = 0; i < 1800; i++) { if (await page.eval('app.ui.song.state==="ready"')) break; await sleep(100); }
  if (seed) await page.eval(`app.song.prepareTake({seed:${+seed}}).then(s=>{s?.();})`);
  await page.eval(`app.song.pause();app.ui.song.show(false);app.manual=true;app.governor.enabled=false;app.R.drawScale=1;try{document.querySelector('#hints').hidden=true}catch{}`);
  const r = await page.eval(async ({ AROUND, LIMIT_REL, LIMIT_ABS }) => {
    const T = window.trippee, W = 96, H = 54, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true });
    const d = app.song.duration, steps = new Float32Array(Math.ceil(d * 60) + 1), who = new Array(steps.length);
    let prev = null;
    for (let i = 0; i < steps.length; i++) {
      T.seek(i / 60); g.drawImage(T.canvas, 0, 0, W, H);
      const px = g.getImageData(0, 0, W, H).data; let s = 0;
      if (prev) for (let k = 1; k < px.length; k += 4) s += Math.abs(px[k] - prev[k]);
      prev = px; steps[i] = s / (W * H);
      const f = app.lastFrame; who[i] = `${f.kind || 'body'} ${f.kind ? f.T.toFixed(2) + ' ' : ''}${(f.from ?? f.G).pattern.id}${f.N ? '>' + f.N.pattern.id : ''}`;
      if (i % 60 === 0) await new Promise(r => setTimeout(r));
    }
    const pops = [];
    for (let i = 1; i < steps.length; i++) {
      const around = []; for (let k = i - AROUND; k <= i + AROUND; k++) if (k !== i && k >= 1 && k < steps.length) around.push(steps[k]);
      around.sort((a, b) => a - b);
      const med = around[around.length >> 1] ?? 0;
      if (steps[i] > LIMIT_ABS && steps[i] > LIMIT_REL * Math.max(med, 0.5)) pops.push({ t: +(i / 60).toFixed(3), step: +steps[i].toFixed(1), around: +med.toFixed(1), who: who[i] });
    }
    const sorted = Array.from(steps).sort((a, b) => a - b);
    // Not pops, but worth seeing: stretches where the whole picture is changing a lot every frame, which is lines going by too fast to follow.
    const fast = []; let run = null;
    for (let i = 1; i < steps.length; i++) {
      if (steps[i] > 25) { if (!run) run = { a: i, n: 0, s: 0, top: 0, who: who[i] }; run.n++; run.s += steps[i]; run.top = Math.max(run.top, steps[i]); run.b = i; }
      else if (run && i - run.b > 30) { if (run.b - run.a > 45) fast.push({ from: +(run.a / 60).toFixed(1), to: +(run.b / 60).toFixed(1), mean: +(run.s / run.n).toFixed(1), top: +run.top.toFixed(1), who: run.who }); run = null; }
    }
    return { d, frames: steps.length, median: +sorted[sorted.length >> 1].toFixed(2), p99: +sorted[Math.floor(sorted.length * 0.99)].toFixed(2), max: +sorted.at(-1).toFixed(1), pops, fast, film: app.stage.score.stats?.cast, seed: app.stage.score.seed };
  }, { AROUND, LIMIT_REL, LIMIT_ABS });
  log(`${song} seed ${r.seed}: ${r.frames} frames, step median ${r.median}, p99 ${r.p99}, max ${r.max}, ${r.pops.length} pops. ${r.film}`);
  for (const p of r.pops) log(`  ${p.t} s  ${p.step}/255 against ${p.around}  ${p.who}`);
  for (const f of r.fast) log(`  fast ${f.from}-${f.to} s  mean ${f.mean}, top ${f.top}/255 a frame  ${f.who}`);
  const errors = page.logs.filter(l => /\[error\]|\[exception\]/.test(l));
  log('errors', errors);
  if (r.pops.length || errors.length) process.exitCode = 1;
};
