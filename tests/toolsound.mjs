// Every tool is heard, in every mode, with and without Beyond. Real mouse, wheel and keys through CDP; muted by the lab, so nothing is ever played.
//   node tools/lab.mjs tests/toolsound.mjs --out lab-out/sound-tools
//   TOOLS=zoom,weight,ripple,comb,twist,pinch,bulge,hand,sheet,knobs  MODES=wander,static,paused,stop  BEYOND=off,on  GRID=1  CELLS=1
// An AnalyserNode on synth.output, 1.5 s windows. A cell passes when the tool's window differs from the one just before it by at least one of:
//   level    1.5 dB on either channel, or between the channels    centroid   15%    notes   2 or more the tool itself caused, or that wouldn't have been there
// and, so the music moving by itself can't pass for the tool, the level or centroid change must also clear the change between two windows with
// nothing touched. A cell that fails while the music is moving a lot by itself gets one more go.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const list = (k, d) => (process.env[k] || d).split(',').filter(Boolean);
const TOOLS = list('TOOLS', 'zoom,weight,ripple,comb,twist,pinch,bulge,hand,sheet,knobs');
const MODES = list('MODES', 'wander,static,paused,stop');
const BEYOND = list('BEYOND', 'off,on');
const GRID = process.env.GRID !== '0', CELLS = process.env.CELLS !== '0';
const WIN = 1500;
const GRID_IDS = 'checks.crush,lattice.master,pole.rings,lines.river,rooms.nested,checks.vega,lines.ghost,dots.inflate,body.tunnel,waves.pond,pole.dipole,void.zebra'.split(',');
const PATS = ['lines.river', 'checks.floor', 'pole.rosette', 'dots.sheet'];

export default async ({ page, log, out }) => {
  const send = page.send;
  const mouse = (type, x, y, o = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: o.button ?? 'none', buttons: o.buttons ?? 0, clickCount: o.clickCount ?? 0, modifiers: o.modifiers ?? 0, deltaX: o.deltaX ?? 0, deltaY: o.deltaY ?? 0, pointerType: 'mouse' });
  const press = (x, y, modifiers = 0) => mouse('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: 1, modifiers });
  const release = (x, y, modifiers = 0) => mouse('mouseReleased', x, y, { button: 'left', buttons: 0, clickCount: 1, modifiers });
  const key = async (k, code, vk) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, text: k, windowsVirtualKeyCode: vk }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); };

  // ------------------------------------------------------------------------------------------- does colour read the same?
  if (GRID) {
    const res = await page.eval(async IDS => {
      const { Reader } = await import('/src/sound/read.js');
      const rd = new Reader(app.R), W = 64, H = 36;
      app.manual = true;
      const copy = () => { rd.now(); return { grid: rd.grid.slice(), rgba: rd.rgba.slice() }; };
      const rows = [];
      for (let pal = 0; pal < app.beyond.palettes.length; pal++) {
        let sum = 0, old = 0, worst = 1, worstId = '', n = 0;
        for (const id of IDS) {
          if (!app.byId[id]) continue;
          for (const u of [0.3, 0.6]) {
            trippee.still(id, u);
            app.beyond.off(); app.beyond.snap(); trippee.seek(app.t);
            const bw = copy();
            app.beyond.on(); app.beyond.setPalette(pal); app.beyond.snap(0.6); trippee.seek(app.t);
            const co = copy();
            let same = 0, sameOld = 0;
            for (let i = 0; i < W * H; i++) {
              const b = bw.grid[i] > 127;
              if ((co.grid[i] > 127) === b) same++;
              if ((co.rgba[i * 4] > 127) === b) sameOld++;
            }
            const a = same / (W * H);
            sum += a; old += sameOld / (W * H); n++;
            if (a < worst) { worst = a; worstId = id + '@' + u; }
          }
        }
        rows.push({ palette: app.beyond.palettes[pal].name, agree: +(sum / n).toFixed(3), redChannel: +(old / n).toFixed(3), worst: +worst.toFixed(3), worstId });
      }
      app.beyond.off(); app.beyond.snap(); rd.dispose();
      return rows;
    }, GRID_IDS);
    let ok = true;
    for (const r of res) { const pass = r.agree >= 0.85; ok &&= pass; log(`grid ${pass ? 'PASS' : 'FAIL'} ${r.palette.padEnd(28)} agrees ${r.agree}  (red channel alone ${r.redChannel})  worst ${r.worst} ${r.worstId}`); }
    log(`grid with Beyond open at .6: ${ok ? 'PASS' : 'FAIL'}`);
    writeFileSync(join(out, 'grid.json'), JSON.stringify(res, null, 1));
  }
  if (!CELLS) { await page.eval(() => { app.manual = false; trippee.run(); }); return; }

  // ------------------------------------------------------------------------------------------- the meter
  await page.eval(() => {
    app.manual = false; trippee.run();
    app.sound.on();
    app.sound.volume = 1;      // the worst case for clipping. The lab's profile is thrown away afterwards.
    const ctx = app.sound.context, out = app.sound.synth.output;
    const mono = new AnalyserNode(ctx, { fftSize: 4096, smoothingTimeConstant: 0 }), split = ctx.createChannelSplitter(2);
    const aL = new AnalyserNode(ctx, { fftSize: 2048, smoothingTimeConstant: 0 }), aR = new AnalyserNode(ctx, { fftSize: 2048, smoothingTimeConstant: 0 });
    out.connect(mono); out.connect(split); split.connect(aL, 0); split.connect(aR, 1);
    const bufL = new Float32Array(2048), bufR = new Float32Array(2048), spec = new Float32Array(mono.frequencyBinCount);
    window.__win = ms => new Promise(res => {
      const t0 = ctx.currentTime;
      let sL = 0, sR = 0, nS = 0, peak = 0, fm = 0, fa = 0;
      const look = () => {
        aL.getFloatTimeDomainData(bufL); aR.getFloatTimeDomainData(bufR);
        for (let i = 0; i < 2048; i++) { const a = bufL[i], b = bufR[i]; sL += a * a; sR += b * b; if (Math.abs(a) > peak) peak = Math.abs(a); if (Math.abs(b) > peak) peak = Math.abs(b); }
        nS += 2048;
        mono.getFloatFrequencyData(spec);
        const hz = ctx.sampleRate / mono.fftSize;
        for (let k = 2; k < spec.length; k++) { const m = Math.pow(10, spec[k] / 20); if (isFinite(m)) { fm += m * k * hz; fa += m; } }
      };
      const iv = setInterval(look, 45);
      setTimeout(() => {
        clearInterval(iv); look();
        const t1 = ctx.currentTime, log = app.sound.log.filter(x => x.t > t0 && x.t <= t1);
        const roles = {}; for (const n of log) roles[n.r] = (roles[n.r] || 0) + 1;
        res({ L: 10 * Math.log10(sL / nS + 1e-12), R: 10 * Math.log10(sR / nS + 1e-12), centroid: fa ? fm / fa : 0, peak, roles, cut: app.sound.synth.padLP.frequency.value, lp: app.sound.synth.handsLP.frequency.value, air: app.sound.synth.handsAir.gain.value, bend: app.sound.synth.droneA.detune.value, fb: app.sound.synth.fbs[0].gain.value, pan: app.sound.synth.padPan.pan.value, center: app.sound.brain.center, rate: app.sound.brain.rate, plates: app.sound.reader.plates, pw: app.sound.brain.pw, gate: app.sound.brain.gateK });
      }, ms);
    });
    window.__settle = async () => {
      const h = app.hand, fx = h.fx;
      h.setEffect(null); h.clear(); h.speed = 1; h.spinRate = 0;
      // the springs' long tails are the tool's own business, and tested by hand; here they only cost time
      fx?.warp?.twist?.set?.(0); fx?.warp?.pinch?.set?.(0); fx?.body?.on?.set?.(0);
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 100));
        const s = h.state();
        if (Math.abs(s.J) < 0.02 && Math.abs(s.w) < 0.01 && !app.edits.warp && !app.edits.hand && !app.edits.sheet && !h.state().knobs.length) break;
      }
    };
  });

  // ------------------------------------------------------------------------------------------- the tools, by hand
  const W = 1280, H = 720, CX = 640, CY = 360;
  const wheel = async (dx, dy, n, gap, modifiers = 0) => { for (let i = 0; i < n; i++) { await mouse('mouseWheel', CX, CY, { deltaX: dx, deltaY: dy, modifiers }); await sleep(gap); } };
  const pick = id => page.eval(id => app.hand.setEffect(id), id);
  const drag = async (x0, y0, x1, y1, ms, o = {}) => { const n = Math.max(2, Math.round(ms / 24)); for (let i = 1; i <= n; i++) { const u = i / n; await mouse('mouseMoved', x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, { buttons: 1, ...o }); await sleep(24); } };
  // Each: start() gets it going and settled, during() runs through the measured window, end() lets go.
  const tools = {
    zoom: {
      start: async () => {
        await wheel(0, -120, 3, 40);
        // A pattern with no more room that way goes the other way. There's always room in one of them.
        const J = await page.eval(() => app.hand.state().Jtarget);
        tools.zoom.dir = J > 0.2 ? -120 : 120;
      },
      during: async () => { await wheel(0, tools.zoom.dir, 11, 120); },
      end: async () => {},
    },
    weight: { start: async () => { await wheel(0, 90, 3, 40, 8); }, during: async () => { await wheel(0, 90, 2, 120, 8); }, end: async () => {} },
    ripple: {
      start: async () => { await pick('ripple'); await mouse('mouseMoved', 300, 200); },
      during: async () => { for (const [x, y] of [[300, 200], [900, 500], [640, 120], [420, 560]]) { await mouse('mouseMoved', x, y); await press(x, y); await sleep(60); await release(x, y); await sleep(300); } },
      end: async () => {},
    },
    comb: {
      start: async () => { await pick('comb'); await mouse('mouseMoved', 300, 200); await press(300, 200); await drag(300, 200, 500, 300, 120); },
      during: async () => { await drag(500, 300, 980, 560, 500); await drag(980, 560, 400, 160, 500); await drag(400, 160, 800, 420, 400); },
      end: async () => { await release(800, 420); },
    },
    twist: {
      start: async () => { await pick('twist'); await mouse('mouseMoved', CX, CY); await press(CX, CY); await drag(CX, CY, CX + 300, CY - 60, 400); },
      during: async () => { await drag(CX + 300, CY - 60, CX + 400, CY - 90, 1200); },
      end: async () => { await release(CX + 400, CY - 90); },
    },
    pinch: {
      start: async () => { await pick('pinch'); await mouse('mouseMoved', CX, CY); await press(CX, CY); await sleep(900); },
      during: async () => { await sleep(WIN); },
      end: async () => { await release(CX, CY); },
    },
    bulge: {
      start: async () => { await pick('bulge'); await mouse('mouseMoved', CX, CY); await press(CX, CY); await sleep(900); },
      during: async () => { await sleep(WIN); },
      end: async () => { await release(CX, CY); },
    },
    hand: {
      start: async () => { await pick('hand'); await mouse('mouseMoved', 950, 260); await sleep(800); },
      during: async () => { await press(950, 260); await sleep(1100); await release(950, 260); },
      end: async () => {},
    },
    sheet: {
      start: async () => { await mouse('mouseMoved', CX, CY); await press(CX, CY, 1); await drag(CX, CY, CX + 40, CY - 120, 400, { modifiers: 1 }); },
      during: async () => { await drag(CX + 40, CY - 120, CX + 120, CY - 240, 1200, { modifiers: 1 }); },
      end: async () => { await release(CX + 120, CY - 240, 1); await page.eval(() => app.hand.dropSheet()); },
    },
    knobs: {
      // The real panel, its real slider: rotation hard over, then speed.
      start: async () => {
        await page.eval(() => app.ui?.knobs?.show?.(true));
        const r = await page.eval(() => [...document.querySelectorAll('[data-rows] > *')].filter(e => /rotation|speed/.test(e.textContent)).map(e => { const t = (e.querySelector('.track') || e).getBoundingClientRect(); return { name: e.textContent.replace(/[^a-z]/g, ''), x: t.left, y: t.top + t.height / 2, w: t.width }; }));
        tools.knobs.rows = r;
        const rot = r.find(x => x.name.includes('rotation'));
        if (!rot) throw new Error('no rotation knob on the panel');
        const x = rot.x + rot.w * 0.92;
        await mouse('mouseMoved', x, rot.y); await press(x, rot.y); await sleep(40); await release(x, rot.y);
      },
      during: async () => {
        const sp = tools.knobs.rows.find(x => x.name.includes('speed')), x = sp.x + sp.w * 0.85;
        await sleep(300);
        await mouse('mouseMoved', x, sp.y); await press(x, sp.y); await sleep(40); await release(x, sp.y);
        await sleep(WIN - 400);
      },
      end: async () => { await page.eval(() => { app.ui?.knobs?.show?.(false); }); },
    },
  };

  // ------------------------------------------------------------------------------------------- the two things a window can't show
  if (process.env.DETAIL !== '0') {
    await page.eval(() => { app.paused = false; app.hand.wander(); });
    await sleep(2500);
    // The register follows the zoom within a quarter of a second
    const before = await page.eval(() => ({ c: app.sound.brain.center, J: app.edits.journey || 0 }));
    const sample = page.eval(() => new Promise(res => { const out = [], t0 = performance.now(), iv = setInterval(() => { out.push([+(performance.now() - t0).toFixed(0), +(app.edits.journey || 0).toFixed(3), +app.sound.brain.center.toFixed(2)]); if (performance.now() - t0 > 1300) { clearInterval(iv); res(out); } }, 50); }));
    await wheel(0, -200, 4, 50);
    const trace = await sample;
    let worst = 0;
    for (const [ms, J, c] of trace) { if (ms < 250) continue; const want = before.c - 3.5 * (J - before.J); const lag = Math.abs(c - want); if (lag > worst) worst = lag; }
    const moved = Math.abs(trace[trace.length - 1][2] - before.c);
    log(`zoom register ${moved > 1 && worst < 2.5 ? 'PASS' : 'FAIL'}: moved ${moved.toFixed(1)} semitones, furthest from where the zoom had got to after 250 ms ${worst.toFixed(2)}`, JSON.stringify(trace.filter((_, i) => i % 4 === 0)));
    await page.eval(() => window.__settle());
    // A fist: a low note while it's closed, the filter shut, and opening it lets go
    await pick('hand');
    await mouse('mouseMoved', 800, 300);
    await sleep(1200);
    const open0 = await page.eval(() => ({ lp: app.sound.synth.handsLP.frequency.value, fist: !!app.sound.brain.fist, pad: app.sound.synth.padLevel.gain.value }));
    await press(800, 300);
    await sleep(800);
    const shut = await page.eval(() => ({ lp: app.sound.synth.handsLP.frequency.value, fist: !!app.sound.brain.fist, n: app.sound.log.filter(x => x.r === 'fist').length, m: app.sound.log.filter(x => x.r === 'fist').slice(-1)[0]?.m }));
    await release(800, 300);
    await sleep(900);
    const open1 = await page.eval(() => ({ lp: app.sound.synth.handsLP.frequency.value, fist: !!app.sound.brain.fist }));
    log(`fist ${!open0.fist && shut.fist && !open1.fist && shut.lp < open0.lp * 0.5 && open1.lp > shut.lp * 1.5 ? 'PASS' : 'FAIL'}:`, JSON.stringify({ open0, shut, open1 }));
    await page.eval(() => window.__settle());
  }

  // ------------------------------------------------------------------------------------------- the modes
  const mode = {
    wander: { enter: async () => {
      await page.eval(() => { app.paused = false; if (app.hand.isStatic()) app.hand.setStatic(false); app.hand.wander(); });
      // Not in the middle of a flight, and none due: the music under a flight moves more than any tool does, so which cells land in one would decide which fail.
      for (let i = 0; i < 150; i++) { if (await page.eval('!app.stage.morphing(app.pictureT())')) break; await sleep(100); }
      await page.eval(() => { const s = app.stage, t = app.pictureT(), c = s.current(t); if (c.morph && c.t1 - c.morph < t + 14) { const N = s.score.gestures[s.score.gestures.indexOf(c) + 1]; c.t1 = t + 14 + c.morph; if (N) N.t0 = c.t1; } });
    } },
    static: { enter: async i => { await page.eval(i => { app.paused = false; if (app.hand.isStatic()) app.hand.setStatic(false); app.hand.go(i); app.hand.setStatic(true); }, i); } },
    paused: {
      enter: async i => {
        await page.eval(i => { app.paused = false; if (app.hand.isStatic()) app.hand.setStatic(false); app.hand.go(i); }, i);
        await sleep(300);
        await key(' ', 'Space', 32);       // the real key
        await sleep(600);
      },
      leave: async () => { await key(' ', 'Space', 32); },
    },
    stop: {
      // Colour's quadrature stop, for real: the clock comes to rest by itself. Put back to the start of the hold before each cell, which changes nothing the picture is doing.
      enter: async (i, beyond) => {
        await page.eval(() => {
          app.paused = false;
          if (app.hand.isStatic()) app.hand.setStatic(false);
          app.beyond.on(); app.beyond.snap();
          // A stop only counts if it starts after colour came on, so the next one that does, wherever the clock has got to
          const a = 150 + 300 * Math.max(0, Math.ceil((app.t + 3 - 150) / 300));
          app.t = a - 2.6;
          window.__stopHold = () => { app.t = a + 0.05; };
        });
        await sleep(3400);
        if (beyond === 'off') { await page.eval(() => { app.beyond.off(); window.__stopHold(); }); for (let i = 0; i < 5; i++) { await sleep(1800); await page.eval(() => window.__stopHold()); } }
      },
      before: async () => { await page.eval(() => window.__stopHold()); await sleep(250); },
    },
  };
  const stoppedMode = m => m === 'paused' || m === 'stop';

  const rows = [];
  let peakAll = 0;
  const dB = v => +v.toFixed(1);
  let patN = 0;
  for (const b of BEYOND) for (const m of MODES) {
    const pattern = PATS[patN++ % PATS.length];
    await page.eval(() => window.__settle());
    await page.eval(b => { if (b === 'on') { app.beyond.on(); app.beyond.snap(0.6); } else { app.beyond.off(); app.beyond.snap(); } }, m === 'stop' ? 'off' : b);
    await mode[m].enter(pattern, b);
    await sleep(stoppedMode(m) ? 1500 : 2500);
    for (const name of TOOLS) {
      const tool = tools[name];
      for (let attempt = 0; attempt < 2; attempt++) {
        if (mode[m].before) await mode[m].before();
        await sleep(stoppedMode(m) ? 300 : 0);
        // Two windows with nothing touched, for how much the music is moving by itself. With the clock stopped it hardly is, and one will do, and a stop has only so long.
        let A0 = null;
        if (!stoppedMode(m)) A0 = await page.eval(`__win(${WIN})`);
        const A1 = await page.eval(`__win(${WIN})`);
        await tool.start();
        const win = page.eval(`__win(${WIN})`);
        await tool.during();
        const B = await win;
        await tool.end();
        peakAll = Math.max(peakAll, A1.peak, B.peak);
        const level = Math.max(Math.abs(B.L - A1.L), Math.abs(B.R - A1.R));
        const natL = A0 ? Math.max(Math.abs(A1.L - A0.L), Math.abs(A1.R - A0.R)) : 0;
        const bal = Math.abs((B.L - B.R) - (A1.L - A1.R)), natB = A0 ? Math.abs((A1.L - A1.R) - (A0.L - A0.R)) : 0;
        const cent = Math.abs(Math.log(Math.max(B.centroid, 1) / Math.max(A1.centroid, 1)));
        const natC = A0 ? Math.abs(Math.log(Math.max(A1.centroid, 1) / Math.max(A0.centroid, 1))) : 0;
        const own = (B.roles.ripple || 0) + (B.roles.comb || 0) + (B.roles.fist || 0) * 2 + Math.max(0, (B.roles.pad || 0) - (A1.roles.pad || 0));
        const playing = w => (w.roles.main || 0) + (w.roles.low || 0);
        const woken = playing(B) - Math.max(playing(A1), A0 ? playing(A0) : 0);
        const byLevel = level >= 1.5 && level > natL + 0.5;
        const byBalance = bal >= 1.5 && bal > natB + 0.5;
        const byCent = cent >= Math.log(1.15) && cent > natC * 1.5;
        const byNotes = own + Math.max(woken, 0) >= 2;
        const stoppedOk = !stoppedMode(m) || A1.rate < 1e-3;      // or this cell isn't testing what it says it is
        const pass = stoppedOk && (byLevel || byBalance || byCent || byNotes);
        const row = { beyond: b, mode: m, tool: name, attempt, pass, level: dB(level), natL: dB(natL), bal: dB(bal), natB: dB(natB), centroid: [Math.round(A1.centroid), Math.round(B.centroid)], natC: +natC.toFixed(2), own, woken, by: [byLevel && 'level', byBalance && 'balance', byCent && 'centroid', byNotes && 'notes'].filter(Boolean).join('+'), peak: +B.peak.toFixed(3), cut: Math.round(B.cut), lp: Math.round(B.lp), air: +B.air.toFixed(1), bend: Math.round(B.bend), fb: +B.fb.toFixed(2), pan: +B.pan.toFixed(2), center: +B.center.toFixed(1), roles: B.roles, clockRate: +A1.rate.toFixed(3), plates: A1.plates, pw: +B.pw.toFixed(2), gate: +B.gate.toFixed(2) };
        rows.push(row);
        const noisy = natL > 1 || natC > 0.1 || natB > 1, again = !pass && noisy && attempt === 0;
        log(`${pass ? 'PASS' : again ? 'once more:' : 'FAIL'} beyond ${b.padEnd(3)} ${m.padEnd(6)} ${name.padEnd(6)} level ${String(row.level).padStart(5)} (self ${row.natL}) bal ${row.bal} (self ${row.natB})  centroid ${row.centroid[0]}>${row.centroid[1]} (self ${row.natC})  own ${own} woken ${woken}  by ${stoppedOk ? row.by || '-' : 'CLOCK NOT STOPPED'}  peak ${row.peak} cut ${row.cut} lp ${row.lp} air ${row.air} bend ${row.bend} pan ${row.pan} fb ${row.fb} pw ${row.pw} gate ${row.gate} clock ${row.clockRate} plates ${row.plates ? 1 : 0}`);
        await page.eval(() => window.__settle());
        if (mode[m].before) await mode[m].before();
        else await sleep(500);
        if (!again) break;
      }
    }
    if (mode[m].leave) await mode[m].leave();
  }
  writeFileSync(join(out, 'toolsound.json'), JSON.stringify(rows, null, 1));
  // A cell's last go is what counts
  const final = new Map(); for (const r of rows) final.set(`${r.beyond}/${r.mode}/${r.tool}`, r);
  const cells = [...final.values()], fails = cells.filter(r => !r.pass);
  const clip = peakAll >= 0.999;
  log(`cells ${cells.length - fails.length}/${cells.length} pass; loudest peak ${peakAll.toFixed(3)} at full volume, ${clip ? 'FAIL clipping' : 'no clipping'}`);
  if (fails.length) log('FAIL', fails.map(r => `${r.beyond}/${r.mode}/${r.tool}`).join(' '));
  const errs = page.logs.filter(l => /\[error\]|\[exception\]/.test(l));
  log('page errors', errs.length, errs.slice(0, 3).join(' | '));
};
