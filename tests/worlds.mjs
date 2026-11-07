// Worlds: proofs 1-8 of docs/MODES.md section 4, each before the next.
//   STAGE=boot,compile,mirror,numbers,change,compose,sound,strip node tools/lab.mjs tests/worlds.mjs --out lab-out/e-worlds
//   STAGE=cost  the mirror world's cost against program 0 at 3024x1964. Runs on its own: nothing else should be drawing.
const sleep = ms => new Promise(r => setTimeout(r, ms));
const want = (process.env.STAGE || 'boot,compile,mirror').split(',');
let failed = 0;
const check = (log, name, ok, more = '') => { log(`${ok ? 'PASS' : 'FAIL'} ${name}${more ? ': ' + more : ''}`); if (!ok) failed++; };
const worldScripts = `performance.getEntriesByType('resource').map(e => e.name).filter(n => /worlds?\\/|chunks\\/world|gl\\/trace/.test(n))`;

// Shared helpers, in the page
const helpers = () => {
  const T = window.trippee, app = T.app;
  window.W_ = {
    enc: new TextEncoder(),
    hex: b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''),
    async sha() { const url = T.capture(); return this.hex(await crypto.subtle.digest('SHA-256', this.enc.encode(url))); },
    // the frame's pixels as bytes
    px() {
      const gl = app.R.gl, w = app.canvas.width, h = app.canvas.height, d = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, d);
      return { w, h, d };
    },
    diff(a, b, tol = 0) {
      let n = 0, sum = 0, worst = 0;
      for (let i = 0; i < a.d.length; i += 4) {
        const e = Math.max(Math.abs(a.d[i] - b.d[i]), Math.abs(a.d[i + 1] - b.d[i + 1]), Math.abs(a.d[i + 2] - b.d[i + 2]));
        if (e > tol) n++;
        sum += e; if (e > worst) worst = e;
      }
      return { n, mean: +(sum / (a.d.length / 4)).toFixed(4), worst };
    },
    still(id, u = .5) { T.still(id, u); },
    settleManual() { app.governor.enabled = false; app.R.drawScale = 1; app.manual = true; app.paused = false; },
  };
};

export default async ({ page, log, save, sleep: _s, out }) => {
  await page.eval(helpers);
  const has = s => want.includes(s);

  // ---- 1. Hooks: no world, no world code, and every program is what it was
  if (has('boot')) {
    const scripts = await page.eval(worldScripts);
    check(log, 'no world code loads at boot', scripts.length === 0, scripts.join(' ') || 'none of src/worlds, chunks/world.js or gl/trace.js');
    const v = await page.eval(async () => {
      for (let i = 0; i < 400 && (app.R._pending || app.R._warming || app.R.order.some(n => !app.R.progs[n])); i++) await new Promise(r => setTimeout(r, 25));      // up to 10 s for what builds behind the picture to settle
      return { progs: app.R.progs.filter(Boolean).length, worlds: !!app.R.worldPrograms, wp: app.R.wp, world: app.stage.world, stamped: 'world' in app.stage.score, parallel: !!app.R.parallel && !app.R.bare };
    });
    // Sixteen, and once those are warm the four the sheet in space wants first (SPACE_LATER), where programs build behind the picture
    check(log, 'sixteen film programs (and space\'s four) and no world programs', (v.progs === 16 || (v.parallel && v.progs === 20)) && !v.worlds && !v.wp && !v.world && !v.stamped, JSON.stringify(v));
  }

  // ---- 2. Compile: the longest gap in the frames while a world's programs build
  if (has('compile')) {
    const r = await page.eval(async () => {
      app.governor.enabled = false; app.R.drawScale = 1;
      trippee.run();
      trippee.load('lines.river');
      app.manual = false; trippee.run();
      await new Promise(r => setTimeout(r, 1500));
      const gaps = [];
      let last = performance.now(), on = true;
      const tick = now => { gaps.push(now - last); last = now; if (on) requestAnimationFrame(tick); };
      requestAnimationFrame(n => { last = n; requestAnimationFrame(tick); });
      await new Promise(r => setTimeout(r, 2000));
      const before = gaps.splice(0);
      const t0 = performance.now();
      const m = await import(new URL('src/worlds/engine.js', location.href).href), idx = await import(new URL('src/worlds/index.js', location.href).href);
      const loaded = performance.now() - t0;
      // A world nobody has built on this machine, so nothing's cached: what a person sees the first time. Otherwise the system keeps the compiled shader, and this all takes a few frames.
      const fresh = (await m.loadWorld('mirror')), W = m.adopt({ ...fresh, _adopted: false, id: 'fresh', glsl: { color: `vec3 worldColor(int k0,int k1,float c){ return film(c)*(uW[0].x>2.?${1 + Math.random()}:1.); }\n` } });
      const t1 = performance.now();
      const wp = await app.R.prepareWorld(W);
      const ready = performance.now() - t1;
      await wp.whenAll;
      const all = performance.now() - t1;
      await new Promise(r => setTimeout(r, 300));
      const during = gaps.splice(0);
      // The first draw of plain and flight: what a click costs, once per world
      await wp.warm();
      await new Promise(r => setTimeout(r, 1500));     // long enough for the frame after it to come back, however late
      on = false;
      return { before: { n: before.length, max: +Math.max(...before).toFixed(1) }, during: { n: during.length, max: +Math.max(...during).toFixed(1), over25: during.filter(g => g > 25).map(g => +g.toFixed(0)) }, warmGap: +Math.max(...gaps).toFixed(0), loaded: +loaded.toFixed(0), ready: +ready.toFixed(0), all: +all.toFixed(0), times: wp.times, built: Object.keys(wp.progs).length };
    });
    log('compile', JSON.stringify(r));
    check(log, 'eight programs link with the longest rAF gap under 50 ms', r.built === 8 && r.during.max < 50, `longest ${r.during.max} ms (before ${r.before.max} ms), plain and flight in ${r.ready} ms, all in ${r.all} ms`);
    log(`warming plain and flight, the one stall a world costs: a rAF gap of ${r.warmGap} ms, once per world per page. Not a pass or a fail: the film's own programs do the same at their first use`);
    await page.eval(() => { app.manual = true; });
  }

  // ---- 3. Mirror: byte-identical to the film, on stills and morph pairs
  if (has('mirror')) {
    const { PAIRS } = await import('./hash.mjs');
    const r = await page.eval(async PAIRS => {
      const T = trippee;
      W_.settleManual();
      const m = await import(new URL('src/worlds/engine.js', location.href).href);
      const W = await m.loadWorld('mirror'), wp = await app.R.prepareWorld(W);
      await wp.whenAll;
      const put = on => { app.stage.world = on ? W : null; app.stage.score = app.stage.score; };
      const ids = T.list().map(p => p.id).filter(id => !id.startsWith('space.')), bad = [], kinds = {}; let n = 0;      // a world draws no sheet in space: no world's pool has one
      for (const id of ids) for (const u of [.25, .5, .75]) {
        put(false); T.still(id, u); const a = await W_.sha();
        put(true); T.still(id, u); const b = await W_.sha(); n++;
        if (a !== b || app.R.variant < 16) bad.push(`${id}@${u} v${app.R.variant}`);
        if (n % 32 === 0) await new Promise(r => setTimeout(r));
      }
      // Flights through a slot's move, the bend, the slide: each from fresh, on both sides
      const badM = [];
      for (const [a, b] of PAIRS) for (const t of [2.5, 5, 7.5]) {
        put(false); T.morph(a, b, 8, 1); T.seek(t); const A = await W_.sha(), k = app.lastFrame.kind;
        put(true); T.morph(a, b, 8, 1); T.seek(t); const B = await W_.sha(), k2 = app.lastFrame.kind; n++;
        kinds[k] = (kinds[k] || 0) + 1;
        if (A !== B || k !== k2) badM.push(`${a}>${b}@${t} ${k}/${k2} v${app.R.variant}`);
      }
      // ...the hand, and in a flight
      const badH = [];
      for (const [id, u] of [['lines.river', .5], ['lattice.master', .5]]) {
        const hand = E => { E.hand = { x: .1, y: -.2, on: 1, height: .055, curl: 0, spread: .5, turn: .15, size: 3 }; };
        put(false); T.still(id, u); hand(app.edits); const A = await W_.sha();
        put(true); T.still(id, u); hand(app.edits); const B = await W_.sha(); app.edits.hand = null; n++;
        if (A !== B) badH.push(id);
      }
      put(false); T.still('lines.river', .5);
      return { n, bad, badM, badH, kinds };
    }, PAIRS);
    log('mirror', r.n, 'frames', JSON.stringify(r.kinds));
    check(log, 'mirror stills byte-identical', !r.bad.length, r.bad.slice(0, 8).join(' '));
    check(log, 'mirror morphs byte-identical', !r.badM.length, r.badM.slice(0, 8).join(' '));
    check(log, 'mirror with the hand byte-identical', !r.badH.length, r.badH.join(' '));
  }

  // ---- 3a. Every hook a world may use, all at once: they build in every program, and with their numbers at nothing they do nothing
  if (has('hooks')) {
    const r = await page.eval(async () => {
      const T = trippee, R = app.R, stage = app.stage;
      W_.settleManual();
      const eng = await import(new URL('src/worlds/engine.js', location.href).href);
      const lin = c => c.map(v => Math.pow(v / 255, 2.2));
      const amp = { v: 0 };
      const W = eng.adopt({
        id: 'allhooks', name: 'all hooks', chips: [[255, 0, 0]], pool: [], borrow: [], ink: { R: 4, fams: [0] }, needs: [],
        pass: { size: [512, 320] },
        table: { h: 2, fill(tex, ctx) { for (let i = 0; i < 4; i++) { tex.set(i, 0, ...lin([255, 40 * i, 0])); tex.set(i, 1, ...lin([0, 40 * i, 80])); } return !tex.once && (tex.once = true); } },
        uniforms(U, ctx) { U.a[0] = amp.v; U.b[0] = amp.v; U.a[1] = ctx.geo; },
        glsl: {
          defs: 'float hookAmp(int K){ return uW[4+K*30].x; }\n',
          field: 'float worldField(int b,vec2 X,vec4 f){ return sin(X.x*4.)*hookAmp(b==0?0:1); }\n',
          surface: 'vec3 worldSurface(int b,vec2 p,inout float cover,inout float parity){ gWall[b==0?0:1]=step(0.,p.x); return vec3(p,0.); }\n',
          phase: 'void worldPhase(int K,int i,vec3 X){ gPh[K*FAM+i]+=hookAmp(K)*.25*sin(X.y*3.); }\n',
          warp: 'vec2 worldWarp(vec2 p0,vec2 p){ return p+hookAmp(0)*.05*vec2(sin(p0.y*5.),0.); }\n',
          preInk: 'void worldPreInk(int K){ for(int k=K*FAM;k<(K+1)*FAM;k++) gGn[k]*=1.+hookAmp(K<2?K:0); }\n',
          T: 'float worldT(vec2 p0,float T){ return T; }\n',
          color: `vec3 worldColor(int k0,int k1,float c){
  if(uW[4+(k0/FAM)*30].x==0.) return film(c);
  ivec2 n=lineRows(k0,k1);
  vec3 col=gamma(mix(inkRow(n.y,1),inkRow(n.x,0),c));
  return col*(1.+.0001*(gX[k0/FAM].x+gGen[k0/FAM]+gWall[k0/FAM]+texture(uTrace,vec2(.5)).x));
}\n`,
        },
      });
      const wp = await R.prepareWorld(W); await wp.whenAll;
      const put = on => { stage.world = on ? W : null; stage.score = stage.score; };
      const out = { failed: wp.failed, built: Object.keys(wp.progs).length, same: [], moved: [], glError: 0 };
      for (const id of ['lines.river', 'lattice.master', 'checks.vega']) {
        put(false); T.still(id, .5); const a = await W_.sha();
        amp.v = 0; put(true); T.still(id, .5); const b = await W_.sha();
        amp.v = .6; T.still(id, .5); const c = await W_.sha(); out.url = T.capture(); amp.v = 0;
        out.same.push(a === b); out.moved.push(a !== c);
      }
      amp.v = 0; put(false); T.morph('checks.vega', 'void.diamond', 8, 1); T.seek(5); const fa = await W_.sha();
      put(true); T.morph('checks.vega', 'void.diamond', 8, 1); T.seek(5); const fb = await W_.sha();
      out.flight = fa === fb;
      amp.v = .6; T.seek(5); out.flightUrl = T.capture(); amp.v = 0;
      out.glError = R.gl.getError();
      put(false); T.still('lines.river', .5);
      return out;
    });
    if (r.url) save('allhooks.png', r.url);
    if (r.flightUrl) save('allhooks-flight.png', r.flightUrl);
    log('hooks', JSON.stringify({ ...r, url: undefined, flightUrl: undefined }));
    check(log, 'every hook builds in all eight programs', !r.failed && r.built === 8, r.failed ?? '');
    check(log, 'with their numbers at nothing they do nothing, byte for byte', r.same.every(Boolean) && r.flight, JSON.stringify([r.same, r.flight]));
    check(log, 'and with them on, they do something', r.moved.every(Boolean));
    check(log, 'no GL error', !r.glError, String(r.glError));
  }

  // ---- 3b. What a world's program costs just for existing, at 3024x1964
  if (has('cost')) {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1512, height: 982, deviceScaleFactor: 2, mobile: false });
    await sleep(800);
    const r = await page.eval(async () => {
      const T = trippee;
      W_.settleManual();
      const m = await import(new URL('src/worlds/engine.js', location.href).href);
      const W = await m.loadWorld(window.COST_WORLD || 'mirror'), wp = await app.R.prepareWorld(W);
      await wp.whenAll;
      const gl = app.R.gl, px = new Uint8Array(4);
      const put = on => { app.stage.world = on ? W : null; app.stage.score = app.stage.score; };
      let cpu = 0;
      const measure = () => { gl.finish(); const t0 = performance.now(); T.step(0); cpu = performance.now() - t0; gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t0; };
      const rows = [];
      for (const [id, u] of [['lines.river', .5], ['checks.vega', .5], ['lattice.master', .5], ['waves.silk', .5], ['body.planet', .5], ['rooms.room', .5]]) {
        const film = [], world = [], cpuF = [], cpuW = [], ratio = [];
        for (let i = 0; i < 32; i++) {
          // Alternating, so that anything slow going on elsewhere lands on both
          put(false); T.still(id, u); measure(); film.push(measure()); cpuF.push(cpu);
          put(true); T.still(id, u); measure(); world.push(measure()); cpuW.push(cpu);
          ratio.push(world[world.length - 1] / film[film.length - 1]);
          if (i % 3 === 2) await new Promise(r => setTimeout(r, 30));
        }
        cpuF.sort((a, b) => a - b); cpuW.sort((a, b) => a - b); ratio.sort((a, b) => a - b);
        film.sort((a, b) => a - b); world.sort((a, b) => a - b);
        const med = a => a[a.length >> 1];
        rows.push({ id, v: app.R.variant, film: +med(film).toFixed(2), world: +med(world).toFixed(2), filmMin: +film[0].toFixed(2), worldMin: +world[0].toFixed(2), cpuF: +med(cpuF).toFixed(2), cpuW: +med(cpuW).toFixed(2), ratio: +med(ratio).toFixed(3) });
      }
      // A flight, which draws two patterns and two colours: film, the mirror, and a world that really does number its lines, where the rule leaves it a flight
      const N = await m.loadWorld('numbers'), wpN = await app.R.prepareWorld(N); await wpN.whenAll;
      const flights = [];
      for (const [a, b] of [['checks.vega', 'void.diamond'], ['lattice.master', 'body.planet']]) {
        const on = W => { app.stage.world = W; app.stage.score = app.stage.score; T.morph(a, b, 8, 1); T.seek(5); };
        const f = [], w = [], n = [];
        for (let i = 0; i < 12; i++) {
          on(null); measure(); f.push(measure());
          on(W); measure(); w.push(measure());
          on(N); measure(); n.push(measure());
          if (i % 3 === 2) await new Promise(r => setTimeout(r, 30));
        }
        const med = x => { x.sort((p, q) => p - q); return +x[x.length >> 1].toFixed(2); };
        flights.push({ pair: a + '>' + b, film: med(f), mirror: med(w), numbers: med(n) });
      }
      // And a plain frame in a world that numbers its lines, which is about what the first real world will cost
      const plainN = [];
      for (const [id, u] of [['lines.river', .5], ['checks.vega', .5], ['lattice.master', .5]]) {
        const f = [], n = [];
        for (let i = 0; i < 12; i++) {
          app.stage.world = null; app.stage.score = app.stage.score; T.still(id, u); measure(); f.push(measure());
          app.stage.world = N; app.stage.score = app.stage.score; T.still(id, u); measure(); n.push(measure());
          if (i % 3 === 2) await new Promise(r => setTimeout(r, 30));
        }
        const med = x => { x.sort((p, q) => p - q); return +x[x.length >> 1].toFixed(2); };
        plainN.push({ id, film: med(f), numbers: med(n) });
      }
      put(false);
      return { size: [app.canvas.width, app.canvas.height], rows, flights, plainN };
    });
    log('cost at', r.size.join('x'));
    let sumF = 0, sumW = 0, sumFm = 0, sumWm = 0;
    for (const x of r.rows) { log(`  ${x.id} v${x.v}: film ${x.film} ms, world ${x.world} ms (min ${x.filmMin} / ${x.worldMin}, cpu ${x.cpuF} / ${x.cpuW}): medians ${((x.world / x.film - 1) * 100).toFixed(1)}%, median of the pairs ${((x.ratio - 1) * 100).toFixed(1)}%`); sumF += x.film; sumW += x.world; sumFm += x.filmMin; sumWm += x.worldMin; }
    const pct = (sumW / sumF - 1) * 100, pctM = (sumWm / sumFm - 1) * 100;
    const pair = (r.rows.reduce((n, x) => n + x.ratio, 0) / r.rows.length - 1) * 100;
    check(log, 'mirror within 5% of program 0', Math.abs(pair) <= 5, `mean of each pattern's median pair ${pair.toFixed(1)}%, of medians ${pct.toFixed(1)}%, of mins ${pctM.toFixed(1)}%`);
    log('flights', JSON.stringify(r.flights)); log('plain, numbering its lines', JSON.stringify(r.plainN));
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await sleep(500);
  }

  // ---- 3c. River. Is the code itself what's slow, whichever program it's in? Its half of the field code, in a world's fuller programs only, against the film's fuller programs, on patterns that don't use it.
  if (has('river')) {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1512, height: 982, deviceScaleFactor: 2, mobile: false });
    await sleep(800);
    const r = await page.eval(async () => {
      const T = trippee, stage = app.stage, R = app.R, gl = R.gl, px = new Uint8Array(4);
      W_.settleManual();
      const eng = await import(new URL('src/worlds/engine.js', location.href).href);
      const mirror = await eng.loadWorld('mirror');
      const W = eng.adopt({ ...mirror, _adopted: false, id: 'river', glsl: { ...mirror.glsl, defs: '#define FIELD_RIVER\n' } });
      const wp = await R.prepareWorld(W); await wp.whenAll;
      const wm = await R.prepareWorld(mirror); await wm.whenAll;
      const measure = () => { gl.finish(); const t0 = performance.now(); T.step(0); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t0; };
      const put = w => { stage.world = w; stage.score = stage.score; };
      const rows = [];
      for (const id of ['lines.river', 'checks.vega', 'lattice.master']) {
        // The same pattern, wearing a field that reaches no family, so the fuller programs draw it and nothing about the picture changes
        const p = app.byId[id], q = { ...p, id: p.id + '+f', g: { ...p.g, field: { kind: 3, a: 2, b: 0, k0: 0, k1: 0, k2: 0, k3: 0 } } };
        const show = () => { stage.score.gestures = [{ t0: 0, t1: 3600, arcEnd: 26, pattern: q }]; stage.score.handover = null; stage.hold = true; app.t = 13; T.step(0); };
        const a = [], b = [], c = [];
        for (let i = 0; i < 20; i++) {
          put(null); show(); measure(); a.push(measure());
          put(mirror); show(); measure(); b.push(measure());
          put(W); show(); measure(); c.push(measure());
          if (i % 3 === 2) await new Promise(r => setTimeout(r, 30));
        }
        const med = x => { x.sort((m, n) => m - n); return +x[x.length >> 1].toFixed(2); };
        rows.push({ id, v: R.variant, filmFuller: med(a), mirrorFuller: med(b), riverFuller: med(c) });
      }
      // ...and the plain programs of that world, which don't have it
      const plain = [];
      for (const id of ['lines.river', 'checks.vega']) {
        const a = [], c = [];
        for (let i = 0; i < 16; i++) { put(null); T.still(id, .5); measure(); a.push(measure()); put(W); T.still(id, .5); measure(); c.push(measure()); }
        const med = x => { x.sort((m, n) => m - n); return +x[x.length >> 1].toFixed(2); };
        plain.push({ id, film: med(a), riverWorldPlain: med(c) });
      }
      put(null); T.still('lines.river', .5);
      return { rows, plain, build: wp.times };
    });
    log('river in its own world program', JSON.stringify(r));
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await sleep(500);
  }

  // ---- 4. Numbers: lineRows is exact, and no ink jumps at a landing
  if (has('numbers')) {
    const r = await page.eval(async () => {
      const T = trippee, R = app.R;
      W_.settleManual();
      const eng = await import(new URL('src/worlds/engine.js', location.href).href), mir = await import(new URL('src/worlds/mirror.js', location.href).href), kit = await import(new URL('src/pattern/kit.js', location.href).href), lay = await import(new URL('src/pattern/layout.js', location.href).href);
      const N = mir.numbers, O = lay.OFF, wp = await R.prepareWorld(N); await wp.whenAll;
      // A control: the same world with the sides taken at tri(x)=0, the formula section 1 says is wrong. If this test can't see that, it can't see anything.
      const naive = eng.adopt({ ...N, _adopted: false, id: 'naive', glsl: { color: `vec2 naiveCells(int k0,int k1){ float here=0.,swap=0.,best=1e9; bool odd=false;
  for(int k=k0;k<k1;k++){ if(!gOn[k]) continue; float x=gPh[k],w=WEIGHTS[k%FAM],v=tri(x),a=floor(x),b=floor(x+.5); bool s=v>0.; if(!s) odd=!odd; here+=w*(s?a:b); float e=abs(v)/(4.*gGn[k]); if(e<best){ best=e; swap=w*(s?b-a:a-b); } }
  return odd?vec2(here+swap,here):vec2(here,here+swap); }
vec3 worldColor(int k0,int k1,float c){ ivec2 n=ivec2(mod(naiveCells(k0,k1),WROWS)); return gamma(mix(inkRow(n.y,1),inkRow(n.x,0),c)); }\n` } });
      const wpN = await R.prepareWorld(naive); await wpN.whenAll;
      const put = W => { app.stage.world = W; app.stage.score = app.stage.score; };
      const srgb = c => c.map(v => Math.round(255 * Math.pow(Math.pow(v / 255, 2.2), .4545)));
      const WHITE = mir.WHITE.map(srgb), BLACK = mir.BLACK.map(srgb);
      // The truth, worked out in JS from the numbers the slot was given: every pixel more than 2 px from a true edge has exactly one right ink.
      const truth = (px, tag) => {
        const A = R.slotA, th = A[O.theta], T0 = Math.abs(th), scale = A[O.scale], rot = A[O.rot], tx = A[O.tx], ty = A[O.ty], freq = A[O.freq], c = Math.cos(-rot), s = Math.sin(-rot);
        const F = [0, 1, 2, 3].filter(i => A[O[`f${i}.on`]] >= .5).map(i => ({ i, x: A[O[`f${i}.x`]] * freq, y: A[O[`f${i}.y`]] * freq, ph: A[O[`f${i}.ph`]], d: A[O[`f${i}.d`]], w: N.ink.weights[i] }));
        const { w, h, d } = px;
        let checked = 0, wrong = 0, skipped = 0;
        const tri = x => 1 - 4 * Math.abs(x - Math.floor(x) - .5);
        for (let py = 0; py < h; py += 1) for (let pxx = 0; pxx < w; pxx += 1) {
          const pX = (pxx + .5 - .5 * w) / h * 2, pY = (py + .5 - .5 * h) / h * 2;
          const X = (c * pX - s * pY) / scale + tx, Y = (s * pX + c * pY) / scale + ty;
          let here = 0, odd = false, dead = 0, across = 0, near = false;
          for (const f of F) {
            const x = f.x * X + f.y * Y + f.ph, v = tri(x) - f.d, side = v > 0, a = Math.floor(x), b = Math.floor(x + .5), g = Math.hypot(f.x, f.y) / scale * 2 / h;
            if (!side) odd = !odd;
            here += f.w * (side ? a : b);
            const e = (Math.abs(v) - T0) / (4 * g);
            if (Math.abs(e) < 2 || Math.abs(Math.abs(v) / (4 * g)) < 2) near = true;
            if (e < 0) { dead++; across = f.w * (side ? b - a : a - b); }
          }
          if (near || dead > 1) { skipped++; continue; }
          // th>0: a filled zone is black. th<0: white. Otherwise parity says.
          let white = !odd, n = here;
          if (dead === 1) { const want = th < 0; if (white !== want) n = here + across; white = want; }
          const row = ((n % N.ink.R) + N.ink.R) % N.ink.R, ink = (white ? WHITE : BLACK)[row], o = (py * w + pxx) * 4;
          checked++;
          if (Math.abs(d[o] - ink[0]) > 6 || Math.abs(d[o + 1] - ink[1]) > 6 || Math.abs(d[o + 2] - ink[2]) > 6) wrong++;
        }
        return { tag, checked, wrong, skipped };
      };
      const pat = (id, fams) => ({ id, name: id, family: 't', g: { fams }, arcs: [], flow: {} });
      const cases = [
        ['2-family check', pat('t.check', [kit.plane(4.3, 12, { d: .3 }), kit.plane(4.3, 102, { d: .3 })])],
        ['triangle lattice', pat('t.tri', kit.triLattice(3.1, 80, 120, { d: .3 }))],
      ];
      const slivers = [], stills = [];
      for (const [name, p] of cases) for (const th of [.2, -.2]) for (const W of [N, naive]) {
        put(W);
        app.stage.score.gestures = [{ t0: 0, t1: 3600, arcEnd: 26, pattern: p, arcs: [], thetaBody: [{ t: -100, x: th, v: 0 }, { t: 5000, x: th, v: 0 }] }];
        app.stage.score.handover = null; app.stage.hold = true; app.t = 1;
        T.step(0);
        const url = T.capture();
        const res = truth(W_.px(), `${name} th ${th} ${W.id}`);
        // readPixels straight after capture's own frame
        slivers.push({ ...res, thetaWas: +R.slotA[O.theta].toFixed(3), v: R.variant });
        if (W === N && th === .2) stills.push({ name, url });
      }
      return { slivers, stills };
    });
    for (const s of r.slivers) log(`  ${s.tag}: ${s.checked} px checked, ${s.wrong} wrong (${s.skipped} near an edge, skipped), theta ${s.thetaWas}, v${s.v}`);
    for (const s of r.stills) save(`numbers-${s.name.replace(/\W+/g, '-')}.png`, s.url);
    const real = r.slivers.filter(s => !/naive/.test(s.tag)), ctl = r.slivers.filter(s => /naive/.test(s.tag));
    check(log, 'no wrong-ink slivers at duty .3, threshold .2', real.every(s => s.wrong === 0 && s.checked > 1e5));
    check(log, 'the control (floor(2*ph+.5)-style sides) is caught', ctl.every(s => s.wrong > 0) && ctl.reduce((n, s) => n + s.wrong, 0) > 1000, ctl.map(s => s.wrong).join(' '));

    // ---- a landing: the frames across it, for each kind there is
    const land = await page.eval(async () => {
      const T = trippee, R = app.R;
      W_.settleManual();
      const mir = await import(new URL('src/worlds/mirror.js', location.href).href), N = mir.numbers;
      await R.prepareWorld(N);
      const put = W => { app.stage.world = W; app.stage.score = app.stage.score; };
      const dt = 1 / 60;
      const small = document.createElement('canvas'); small.width = 320; small.height = 180;
      const g = small.getContext('2d', { willReadFrequently: true });
      const grab = () => { g.drawImage(T.canvas, 0, 0, 320, 180); return g.getImageData(0, 0, 320, 180).data; };
      // How many pixels changed hue-worth between two frames
      const moved = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 90) n++; return n / (a.length / 4); };
      const across = (a, b, xform, tamper) => {
        T.morph(a, b, 8, 1);
        const G = app.stage.score.gestures[0];
        if (xform) { G.xform = xform; delete G.plan; delete G.planFor; delete G.planning; }
        const t1 = 9;
        T.seek(t1 - 6 * dt);
        const kind = G.plan?.kind ?? app.lastFrame.kind;
        if (tamper && G.plan?.offset) G.plan.offset[0] += 1;
        const fr = [];
        for (let k = 0; k <= 11; k++) { T.seek(t1 - 6 * dt + k * dt); fr.push(grab()); }
        const steps = []; for (let k = 1; k < fr.length; k++) steps.push(moved(fr[k - 1], fr[k]));
        // the landing is between index 5 and 6 of steps (t1 falls between frames k=6 and k=7)
        const at = steps[5] + steps[6] > steps[4] + steps[7] ? Math.max(steps[5], steps[6]) : Math.max(steps[5], steps[6]);
        const around = [...steps.slice(0, 5), ...steps.slice(7)].sort((x, y) => x - y)[Math.floor((steps.length - 2) / 2)];
        return { pair: `${a}>${b}`, kind, landing: +at.toFixed(4), around: +around.toFixed(4), worst: +Math.max(...steps).toFixed(4) };
      };
      put(N);
      const out = [];
      // Slides and bends with the ink rule on; which pairs get to keep them is the rule's business, so these are several of each
      const tries = [['lines.fall', 'lines.squeeze'], ['checks.cloth', 'checks.target'], ['rooms.nested', 'waves.swell'], ['lines.ghost', 'checks.vega'], ['waves.silk', 'lines.fall'], ['lines.river', 'lines.fall'], ['lines.fall', 'lines.river'], ['waves.swell', 'waves.silk'], ['checks.vega', 'checks.target'], ['checks.target', 'checks.vega'], ['lines.squeeze', 'lines.ghost'],
        ['checks.vega', 'void.diamond'], ['lattice.master', 'body.planet'], ['waves.silk', 'rooms.hall'], ['lattice.pinwheel', 'dots.inflate']];
      for (const [a, b] of tries) out.push(across(a, b));
      for (const [a, b] of [['lines.river', 'lines.fall'], ['lines.fall', 'lines.squeeze'], ['waves.silk', 'waves.swell'], ['lines.fall', 'waves.silk']]) out.push(across(a, b, { id: 'bend' }));
      for (const [a, b] of [['lines.river', 'lines.fall'], ['lines.ghost', 'waves.swell'], ['lines.fall', 'waves.silk']]) out.push(across(a, b, { id: 'shock', dir: 1, centre: [0, 0], any: true }));
      for (const [a, b] of [['lines.river', 'checks.vega'], ['checks.vega', 'lines.fall'], ['lines.fall', 'lines.river']]) out.push(across(a, b, { id: 'iris', focus: [0, 0], surge: 0, way: 1 }));
      // The control: a whole cycle added to what the rule worked out must show.
      const ctl = [];
      for (const [a, b] of [['lines.fall', 'lines.squeeze'], ['lines.river', 'lines.fall'], ['checks.vega', 'checks.target']]) { const c = across(a, b, null, true); if (c.kind === 'slide' || c.kind === 'bend') ctl.push(c); }
      // Seek and play give the same bytes
      const seekPlay = [];
      for (const [a, b] of [['lines.fall', 'lines.squeeze'], ['lines.river', 'lines.fall'], ['checks.vega', 'void.diamond'], ['waves.silk', 'rooms.hall']]) for (const t of [2.5, 5.5, 8.5, 9.5]) {
        T.morph(a, b, 8, 1); T.seek(t); const A = await W_.sha(), k = app.lastFrame.kind;
        T.morph(a, b, 8, 1); for (let x = 0; x < t - 1e-9;) { x = Math.min(t, x + 1 / 30); T.seek(x); } const B = await W_.sha();
        seekPlay.push({ pair: `${a}>${b}@${t}`, kind: k, same: A === B });
      }
      put(null); T.still('lines.river', .5);
      return { out, ctl, seekPlay };
    });
    for (const o of land.out) log(`  ${o.pair} ${o.kind}: ${(o.landing * 100).toFixed(2)}% of pixels change ink across the landing, ${(o.around * 100).toFixed(2)}% around it, worst step ${(o.worst * 100).toFixed(2)}%`);
    const kinds = {}; for (const o of land.out) kinds[o.kind] = (kinds[o.kind] || 0) + 1;
    log('  kinds', JSON.stringify(kinds));
    const jumps = land.out.filter(o => o.landing > Math.max(o.around * 2, .02));
    check(log, 'no ink jump on the frame after any landing', !jumps.length, jumps.map(o => o.pair + ' ' + o.kind).join(' | '));
    check(log, 'every kind of landing was looked at', ['slide', 'bend', 'dive', 'rise', 'shock', 'iris'].every(k => kinds[k]), JSON.stringify(kinds));
    for (const o of land.ctl) log(`  control ${o.pair} ${o.kind}: ${(o.landing * 100).toFixed(2)}% with a whole cycle added`);
    check(log, 'the control (an offset the rule would not allow) is caught', land.ctl.length > 0 && land.ctl.every(o => o.landing > .02), `${land.ctl.length} controls`);
    const diffS = land.seekPlay.filter(s => !s.same);
    check(log, 'same frame after seek as after play', !diffS.length, diffS.map(s => s.pair + ' ' + s.kind).join(' | '));
  }

  // ---- 5. A change of world: it drains through the film at the middle of a flight
  if (has('change')) {
    const { makeChannels, flashThree, WORLD_FLASH } = await import('../tools/look.mjs');
    const r = await page.eval(async chanSrc => {
      const T = trippee, stage = app.stage, R = app.R, byId = app.byId;
      W_.settleManual();
      const eng = await import(new URL('src/worlds/engine.js', location.href).href), mir = await import(new URL('src/worlds/mirror.js', location.href).href);
      const N = mir.numbers, wp = await R.prepareWorld(N); await wp.whenAll;
      // A world with a field of its own: at the middle of a change the program it's in can't draw the other world's field, so nothing's own may show there.
      const O = eng.adopt({ ...N, _adopted: false, id: 'fieldy', pool: [], ink: null, glsl: { ...N.glsl, field: 'float worldField(int b,vec2 X,vec4 f){ return .6*sin(3.*X.x)*sin(3.*X.y); }\n' } });
      await R.prepareWorld(O); await R.worldPrograms.get(O).whenAll;
      const fieldPat = { id: 't.fieldy', name: 'fieldy', family: 't', g: { fams: [{ x: 3, y: 0 }, { x: 0, y: 3 }], field: { kind: 4, k0: 1.5, k1: 1.5 } }, arcs: [], flow: {} };
      const dur = 9;
      const reset = W => {
        stage.score.handover = null; stage.staticG = null;
        stage.world = W; stage.score = stage.score;
        T.load('lines.river'); app.t = 13; T.step(0);
      };
      // The plan comes in over a few frames, with no time passing: only its looks are waited for, so where it starts doesn't depend on how long they took.
      const ready = async () => { const h = stage.score.handover; for (let i = 0; i < 400 && !h.plan; i++) { T.step(0); await new Promise(r => setTimeout(r, 4)); } h.e = 0; h.e0 = 0; return h; };
      const at = async (h, x) => { h.e = h.e0 + x * h.D; T.step(0); return { sha: await W_.sha(), px: (T.capture(), W_.px()), v: R.variant, x: app.lastFrame.T }; };
      const XS = [.46, .4999, .5, .5001, .54];
      // The film's own flight, the same two patterns from the same place
      const filmRun = async pat => {
        reset(null);
        const t = app.pictureT(), snap = stage.snapshot(t), g = stage.score.gestures;
        g.length = 0; g.push({ t0: t, t1: t + 3600, arcEnd: t + 44, period: 44, pattern: pat, morph: 0 });
        stage.morphFrom(snap, t, dur, { noGlide: true });
        const h = await ready(), out = {};
        for (const x of XS) out[x] = (await at(h, x)).sha;
        return out;
      };
      const worldRun = async (from, to, pat) => {
        reset(from);
        const before = (T.capture(), W_.px());
        const ok = await stage.setWorld(to, { pattern: pat, dur });
        if (ok !== true) return { error: 'setWorld gave ' + ok };
        const h = await ready(), out = {}, vs = {};
        const f0 = await at(h, 0);
        for (const x of XS) { const f = await at(h, x); out[x] = f.sha; vs[x] = f.v; }
        const last = await at(h, .9999);
        h.e = h.e0 + h.D; T.step(0);     // the frame it ends on, and then the plain path
        const ended = !stage.score.handover?.change;
        T.step(0);
        const after = (T.capture(), W_.px()), landed = R.variant;
        const first = W_.diff(before, f0.px, 8), end = W_.diff(last.px, after, 8);
        return { out, vs, first, end, ended, landed, worldNow: stage.world?.id ?? null, wp: R.wp?.W?.id ?? null };
      };
      const vega = byId['checks.vega'];
      const film = await filmRun(vega);
      const a = await worldRun(null, 'numbers', vega);
      // A world's own field through the middle of a change: neither the film's program nor the other world's can draw it, so it lets go first, and at the middle no program can tell.
      const filmF = await filmRun(fieldPat), fld = await worldRun(null, O, fieldPat);
      const fieldLanded = (T.capture(), W_.px());
      stage.world = null; stage.score = stage.score;
      T.load('lines.river'); app.t = 13;
      const filmFlat = { sha: null };
      stage.world = null; // world to film, from the numbers world
      const b = await worldRun(N, null, vega);
      const c = await worldRun(N, 'mirror', vega);
      // A sheet of the film going into numbers, for looking at
      reset(null);
      await stage.setWorld('numbers', { pattern: vega, dur });
      const hs = await ready(), sheet = [];
      for (const x of [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, .95, 1]) { hs.e = hs.e0 + x * hs.D; T.step(0); sheet.push({ x, url: T.capture() }); }
      // Mid-change, a seek: nothing throws, the change carries on and lands on the world
      reset(null);
      await stage.setWorld('numbers', { pattern: vega, dur });
      const hk = await ready(); hk.e = hk.e0 + .3 * hk.D; T.step(0);
      // The song's clock jumping, which is what a seek is. A wall handover runs on real seconds, so it isn't moved.
      app.t += 7; T.step(0); const midA = stage.score.handover?.change ? 1 : 0;
      app.t -= 3; T.step(0); const midB = stage.score.handover?.change ? 1 : 0;
      hk.e = hk.e0 + hk.D; T.step(0); T.step(0);
      const seekOK = { midA, midB, landed: R.variant, world: stage.world?.id, change: !!stage.score.handover?.change };
      // The whole of one, at 30 fps, read the way the judge reads a film: its three flash channels per tile, one frame's step, big flat areas.
      const W_S = 160, H_S = 90;
      const cv = document.createElement('canvas'); cv.width = W_S; cv.height = H_S;
      const g2 = cv.getContext('2d', { willReadFrequently: true });
      const channels = (0, eval)(`(${chanSrc})`)();
      const watch = async (fromW, to, pat, control = false) => {
        reset(fromW);
        if (control) {
          const t = app.pictureT(), snap = stage.snapshot(t), g = stage.score.gestures;
          g.length = 0; g.push({ t0: t, t1: t + 3600, arcEnd: t + 44, period: 44, pattern: pat, morph: 0 });
          stage.morphFrom(snap, t, dur, { noGlide: true });
        } else await stage.setWorld(to, { pattern: pat, dur });
        const chan = { luma: [], red: [], rc: [], whole: { luma: [], red: [], rc: [] } }, steps = [];
        let prev = null, biggest = 0, biggestAt = 0, disc = 0;
        const seen = new Int32Array(W_S * H_S), stack = new Int32Array(W_S * H_S), dist = new Float32Array(W_S * H_S);
        const n = Math.round((dur + 1) * 30);
        for (let k = 0; k < n; k++) {
          T.step(1 / 30);
          g2.drawImage(T.canvas, 0, 0, W_S, H_S);
          const d = g2.getImageData(0, 0, W_S, H_S).data, c = channels(d, W_S, H_S);
          chan.luma.push(c.luma); chan.red.push(c.red); chan.rc.push(c.rc);
          for (const name of ['luma', 'red', 'rc']) chan.whole[name].push(c.whole[name]);
          if (prev) { let step = 0; for (let i = 0; i < d.length; i += 4) step += Math.abs(d[i] - prev[i]) + Math.abs(d[i + 1] - prev[i + 1]) + Math.abs(d[i + 2] - prev[i + 2]); steps.push(step / (3 * W_S * H_S)); }
          // The biggest joined area of one colour, with room for how big a disc: flat.mjs's measure, in colour. The picture's mid values, an edge or lines too fine to tell, join nothing.
          seen.fill(0);
          for (let i = 0; i < W_S * H_S; i++) {
            if (seen[i]) continue;
            let top = 0, count = 0; stack[top++] = i; seen[i] = i + 1;
            const r0 = d[i * 4], g0 = d[i * 4 + 1], b0 = d[i * 4 + 2];
            while (top) {
              const p = stack[--top]; count++;
              const x = p % W_S, y = (p / W_S) | 0;
              for (const m of [x > 0 ? p - 1 : -1, x < W_S - 1 ? p + 1 : -1, y > 0 ? p - W_S : -1, y < H_S - 1 ? p + W_S : -1]) {
                if (m < 0 || seen[m]) continue;
                if (Math.abs(d[m * 4] - r0) + Math.abs(d[m * 4 + 1] - g0) + Math.abs(d[m * 4 + 2] - b0) < 24) { seen[m] = i + 1; stack[top++] = m; }
              }
            }
            if (count > biggest) {
              biggest = count; biggestAt = k;
              // Room for what disc: distance from the edge of this region
              for (let q = 0; q < W_S * H_S; q++) dist[q] = seen[q] === i + 1 ? 1e6 : 0;
              for (let y = 0; y < H_S; y++) for (let x = 0; x < W_S; x++) { const q = y * W_S + x; if (x > 0) dist[q] = Math.min(dist[q], dist[q - 1] + 1); if (y > 0) dist[q] = Math.min(dist[q], dist[q - W_S] + 1); }
              let top2 = 0;
              for (let y = H_S - 1; y >= 0; y--) for (let x = W_S - 1; x >= 0; x--) { const q = y * W_S + x; if (x < W_S - 1) dist[q] = Math.min(dist[q], dist[q + 1] + 1); if (y < H_S - 1) dist[q] = Math.min(dist[q], dist[q + W_S] + 1); if (dist[q] > top2) top2 = dist[q]; }
              disc = top2 / H_S;
            }
          }
          prev = d;
          if (k % 16 === 15) await new Promise(r => setTimeout(r));
        }
        const sorted = [...steps].sort((x, y) => x - y);
        return { chan, fps: 30, stepMax: +sorted[sorted.length - 1].toFixed(2), stepMed: +sorted[sorted.length >> 1].toFixed(2), flat: +(biggest / (W_S * H_S)).toFixed(3), disc: +disc.toFixed(3), flatAt: biggestAt };
      };
      const watchA = await watch(null, 'numbers', vega), controlA = await watch(null, null, vega, true);
      const watchB = await watch(N, null, byId['lattice.master']), controlB = await watch(null, null, byId['lattice.master'], true);
      reset(null);
      return { film, a, b, c, sheet, seekOK, watchA, watchB, controlA, controlB, filmF, fld };
    }, makeChannels.toString());
    const dump = o => JSON.stringify({ first: o.first, end: o.end, ended: o.ended, landed: o.landed, world: o.worldNow, wp: o.wp, vs: o.vs });
    log('film into numbers', dump(r.a)); log('numbers into film', dump(r.b)); log('numbers into mirror', dump(r.c));
    if (r.a.error || r.b.error || r.c.error) log('errors', r.a.error, r.b.error, r.c.error);
    for (const [name, o] of [['film into numbers', r.a], ['numbers into film', r.b], ['numbers into mirror', r.c]]) {
      const diff = Object.keys(r.film).filter(x => r.film[x] !== o.out?.[x]);
      check(log, `${name}: from x .46 to .54 the frame is the film's flight, byte for byte, across the program change`, !diff.length, diff.length ? `differs at ${diff.join(' ')}` : `programs ${Object.values(o.vs).join(' ')}`);
      check(log, `${name}: lands on the world's plain program`, o.ended && o.landed === (o.worldNow ? o.landed : 0) && (o.worldNow ? o.landed >= 16 : o.landed < 16));
    }
    {
      const diff = Object.keys(r.filmF).filter(x => r.filmF[x] !== r.fld.out?.[x]);
      check(log, `a world's own field is out of the way across the program change, byte for byte`, !diff.length && !r.fld.error, diff.length ? `differs at ${diff.join(' ')}` : `programs ${Object.values(r.fld.vs).join(' ')}, landed v${r.fld.landed}, ${r.fld.error ?? ''}`);
    }
    r.sheet.forEach(s => save(`change-x${s.x.toFixed(2)}.png`, s.url));
    log('seek mid-change', JSON.stringify(r.seekOK));
    check(log, 'a seek mid-change carries on and lands', r.seekOK.midA === 1 && r.seekOK.midB === 1 && r.seekOK.world === 'numbers' && !r.seekOK.change && r.seekOK.landed >= 16);
    for (const [name, w, c] of [['film into numbers', r.watchA, r.controlA], ['numbers into film', r.watchB, r.controlB]]) {
      const fl = flashThree(w, WORLD_FLASH), flC = flashThree(c, WORLD_FLASH);
      log(name, JSON.stringify({ luma: fl.luma, red: fl.red, rc: fl.rc, step: [w.stepMax, w.stepMed], flat: w.flat, disc: w.disc, flatAt: w.flatAt }), '| the film\'s own flight:', JSON.stringify({ luma: flC.luma, red: flC.red, rc: flC.rc, step: [c.stepMax, c.stepMed], flat: c.flat, disc: c.disc, flatAt: c.flatAt }));
      const worse = n => fl[n].tile > Math.max(1, flC[n].tile) || fl[n].whole > flC[n].whole;
      check(log, `${name}: no whole-frame flash in any channel`, fl.luma.whole === 0 && fl.red.whole === 0 && fl.rc.whole === 0, JSON.stringify(fl.over));
      check(log, `${name}: under 2 a second on a tile, or no worse than the film's own flight`, !worse('luma') && !worse('red') && !worse('rc'), JSON.stringify(fl.over));
      check(log, `${name}: no pop: the biggest step is under 4x the median, or no bigger than the film's own flight's`, w.stepMax < Math.max(4 * w.stepMed, 1.05 * c.stepMax), `${w.stepMax} / ${w.stepMed}, the film's ${c.stepMax} / ${c.stepMed}`);
      check(log, `${name}: never a big flat area (over .35 of the frame with room for a disc of .25)`, !(w.flat > .35 && w.disc > .25), `biggest joined colour ${w.flat}, disc ${w.disc}, frame ${w.flatAt}`);
    }
  }

  // ---- 6. Compose: no world touches nothing, and a small pool doesn't throw
  if (has('compose')) {
    const r = await page.eval(async () => {
      const T = trippee, stage = app.stage, R = app.R, byId = app.byId;
      const song = app.song;
      W_.settleManual();
      await song.load('/media/mgmt.mp3', { seed: 7 });
      const A = song.analysis;
      const { compose } = await import(new URL('src/score/compose.js', location.href).href);
      const eng = await import(new URL('src/worlds/engine.js', location.href).href);
      const sig = F => JSON.stringify(F.gestures.map(g => [g.pattern.id, +g.t0.toFixed(3), +g.t1.toFixed(3), +(g.morph || 0).toFixed(3), g.xform?.id ?? null, g.rise ?? null, g.noGlide ?? null]));
      const aspect = 16 / 9, none = compose(A, 7, { patterns: app.patterns, aspect }), again = compose(A, 7, { patterns: app.patterns, aspect });
      const mirror = await eng.loadWorld('mirror');
      const withMirror = compose(A, 7, { patterns: app.patterns, aspect, world: mirror });
      const out = { same: sig(none) === sig(again), mirrorSame: sig(none) === sig(withMirror), gestures: none.gestures.length, small: [] };
      // Pools of one, two and three, drawn from different kinds, through compose, every frame's numbers and a seek through the whole film
      const pools = [['lines.river'], ['checks.vega', 'lines.fall'], ['lattice.master', 'waves.silk', 'body.planet'], ['dots.inflate']];
      for (const ids of pools) {
        const pool = ids.map(id => byId[id]), W = eng.adopt({ id: 'small' + ids.length + ids[0], name: 'small', chips: [], pool, borrow: [], ink: null, table: null, motion: { len: [18, 30], morph: [7, 10] }, hear: { pulse: .5, melody: 1.2 }, glsl: mirror.glsl });
        const row = { ids: ids.join(' '), threw: null };
        try {
          const film = compose(A, 7, { patterns: pool, aspect, world: W });
          row.gestures = film.gestures.length;
          const seen = new Set(film.gestures.map(g => g.pattern.id));
          row.outside = [...seen].filter(id => !ids.includes(id));
          await R.prepareWorld(W); await R.worldPrograms.get(W).whenAll;
          stage.world = W; stage.setScore(film);
          stage.score.handover = null;
          for (let t = 0; t < A.duration; t += 2.7) T.seek(t);
          row.world = R.wp?.W?.id ?? null;
        } catch (e) { row.threw = String(e?.stack ?? e).slice(0, 300); }
        out.small.push(row);
      }
      // A pattern picked by hand before the world came on, which isn't one of the world's own
      {
        const pool = [byId['lines.river'], byId['checks.vega']], W = eng.adopt({ id: 'foreign', name: 'foreign', chips: [], pool, borrow: [], ink: null, table: null, glsl: mirror.glsl });
        await R.prepareWorld(W); await R.worldPrograms.get(W).whenAll;
        stage.world = W;
        let threw = null, ids = [];
        try { const f = song.rebuild({ pattern: byId['lattice.master'], quiet: true }); ids = [...new Set(f.gestures.map(g => g.pattern.id))]; } catch (e) { threw = String(e); }
        out.foreign = { threw, ids };
        song.rebuild({ pattern: null, quiet: true });
      }
      // The wander on one pattern
      const one = eng.adopt({ id: 'wander1', name: 'one', chips: [], pool: [byId['lines.fall']], borrow: [], ink: null, table: null, motion: { len: [12, 14], morph: [6, 7] }, glsl: mirror.glsl });
      await R.prepareWorld(one); await R.worldPrograms.get(one).whenAll;
      song.eject();
      stage.world = one; stage.score = stage.score;
      stage.hold = false; stage.score.gestures.length = 0; stage.score.handover = null; stage._fam = null; stage._extend(app.t);
      let wanderThrew = null; try { for (let i = 0; i < 300; i++) T.step(.2); } catch (e) { wanderThrew = String(e); }
      out.wander = { threw: wanderThrew, patterns: [...new Set(stage.score.gestures.map(g => g.pattern.id))] };
      stage.world = null; stage.score = stage.score; stage.score.gestures.length = 0; stage._extend(app.t); T.step(0);
      return out;
    });
    log('compose', JSON.stringify(r));
    check(log, 'compose is the same each time, and with the mirror world it is the same film', r.same && r.mirrorSame, `${r.gestures} gestures`);
    check(log, 'small pools do not throw, and nothing from outside the pool turns up', r.small.every(x => !x.threw && !x.outside?.length), JSON.stringify(r.small.filter(x => x.threw || x.outside?.length)));
    check(log, 'a pattern picked by hand before the world came on does not throw, and stays out', !r.foreign.threw && !r.foreign.ids.includes('lattice.master'), JSON.stringify(r.foreign));
    check(log, 'a wander on one pattern does not throw', !r.wander.threw, JSON.stringify(r.wander));
  }

  // ---- 7. Sound, hand, recording
  if (has('sound')) {
    const r = await page.eval(async () => {
      const T = trippee, stage = app.stage, R = app.R;
      W_.settleManual();
      const eng = await import(new URL('src/worlds/engine.js', location.href).href), mir = await import(new URL('src/worlds/mirror.js', location.href).href);
      const { Reader, features } = await import(new URL('src/sound/read.js', location.href).href), { Brain } = await import(new URL('src/sound/brain.js', location.href).href);
      const mirror = await eng.loadWorld('mirror'), N = await eng.loadWorld('numbers');
      // A colour nothing could read as coverage: paper bright, ink dark, the wrong way up. No numbers, so it plans what the film plans.
      const tint = eng.adopt({ id: 'tint', name: 'tint', chips: [], pool: [], borrow: [], ink: null, table: null, glsl: { color: 'vec3 worldColor(int k0,int k1,float c){ return gamma(mix(vec3(1.,.6,.1),vec3(.02,.0,.2),c)); }\n' } });
      for (const W of [mirror, N, tint]) { await R.prepareWorld(W); const w = R.worldPrograms.get(W); await w.whenAll; if (window.COVER_LATE !== true) for (const v of [0, 4, 8, 12]) await w.coverProgram(v); }
      const put = W => { stage.world = W; stage.score = stage.score; };
      const reader = new Reader(R), out = {};
      // What the reader sees: the same grid?
      const grids = [];
      for (const id of ['lines.river', 'checks.vega', 'lattice.master', 'waves.silk', 'body.planet', 'dots.inflate', 'rooms.room', 'pole.garden']) {
        const read = W => { put(W); T.still(id, .5); reader.now(); return { g: reader.grid.slice(), white: reader.white, tv: reader.tv, th: reader.th }; };
        const a = read(null), b = read(mirror), c = read(tint);
        const agree = (x, y) => { let n = 0; for (let i = 0; i < x.g.length; i++) if ((x.g[i] > 127) === (y.g[i] > 127)) n++; return +(n / x.g.length).toFixed(3); };
        grids.push({ id, mirror: agree(a, b), numbers: agree(a, c), white: [+a.white.toFixed(3), +b.white.toFixed(3), +c.white.toFixed(3)], tv: [+a.tv.toFixed(2), +b.tv.toFixed(2)], th: [+a.th.toFixed(2), +b.th.toFixed(2)] });
      }
      out.grids = grids;
      // The notes: the same brain, fed the same frames
      const stub = new Proxy({}, { get: (t, k) => (k === 'note' ? () => true : () => ({})) });
      const notes = W => {
        put(W); T.load('lines.river'); stage.hold = false; app.t = 0; stage.score.gestures.length = 0; stage.rand = stage.rand;
        T.morph('lines.river', 'checks.vega', 8, 6);
        const b = new Brain(stub, 7);
        for (let k = 0; k < 16 * 30; k++) { T.step(1 / 30); reader.now(); b.frame(k / 30, features(app, reader, null)); }
        return b.log.map(n => `${n.t}:${n.m}:${n.v}`);
      };
      const nA = notes(null), nB = notes(mirror), nC = notes(tint);
      const match = (a, b) => { const s = new Set(a); let n = 0; for (const x of b) if (s.has(x)) n++; return +(n / Math.max(1, Math.max(a.length, b.length))).toFixed(3); };
      // The same notes, leaving when they fall out of it: how much of the sequence of pitches they share
      const lcs = (a, b) => { const x = a.map(s => s.split(':').slice(1).join(':')), y = b.map(s => s.split(':').slice(1).join(':')); let p = new Array(y.length + 1).fill(0); for (const v of x) { const q = [0]; for (let j = 1; j <= y.length; j++) q[j] = v === y[j - 1] ? p[j - 1] + 1 : Math.max(p[j], q[j - 1]); p = q; } return +(p[y.length] / Math.max(1, Math.max(a.length, b.length))).toFixed(3); };
      out.notes = { film: nA.length, mirror: nB.length, tint: nC.length, mirrorExact: match(nA, nB), mirrorSequence: lcs(nA, nB), tintVsMirror: match(nB, nC) };
      // Every hand verb, and everything else a tool writes: the mirror draws them byte for byte, so they happened before colour
      const rings = [{ x: .2, y: .1, radius: .5, height: .024 }];
      const cases = {
        open: E => { E.hand = { x: .1, y: -.2, on: 1, height: .055, curl: 0, spread: .5, turn: .15, size: 3 }; },
        fist: E => { E.hand = { x: .1, y: -.2, on: 1, height: .055, curl: 1, spread: .5, turn: .15, size: 3 }; },
        spread: E => { E.hand = { x: .1, y: -.2, on: 1, height: .055, curl: 0, spread: 1, turn: 0, size: 3 }; },
        lift: E => { E.hand = { x: -.3, y: .2, on: .6, height: .09, curl: .4, spread: .2, turn: -.4, size: 2 }; },
        ripple: E => { E.ripples = rings; },
        warp: E => { E.warp = { x: .1, y: -.1, r: .72, twist: 2.5, pinch: .8 }; },
        zoom: E => { E.journey = .7; E.jx = .1; E.jy = -.05; E.spin = .4; },
        duty: E => { E.duty = .22; },
        press: E => { E.pressX = .2; E.pressY = .1; E.press = .8; E.pressR = .5; },
        sheet: E => { E.sheetX = .03; E.sheetY = .01; E.sheetRot = .04; E.sheet = 1; },
        knob: E => { E.over = { freq: 1.6 }; },
        invert: E => { E.invert = true; },
      };
      const clear = E => { E.ripples = null; E.warp = null; E.hand = null; E.journey = 0; E.jx = 0; E.jy = 0; E.spin = 0; E.duty = 0; E.press = 0; E.sheet = 0; E.over = {}; E.invert = false; };
      const bad = [];
      for (const name in cases) for (const flight of [false, true]) {
        const shot = async W => {
          put(W);
          if (flight) { T.morph('checks.vega', 'void.diamond', 8, 1); T.seek(5); } else T.still('lattice.master', .5);
          cases[name](app.edits);
          const sha = await W_.sha(); clear(app.edits);
          return sha;
        };
        const a = await shot(null), b = await shot(mirror);
        if (a !== b) bad.push(`${name}${flight ? ' in a flight' : ''}`);
      }
      out.handBad = bad; out.handN = Object.keys(cases).length * 2;
      put(null); T.still('lines.river', .5);
      reader.dispose();
      return out;
    });
    log('reader', JSON.stringify(r.grids));
    log('notes', JSON.stringify(r.notes));
    const worst = Math.min(...r.grids.map(g => g.mirror));
    const tintWorst = Math.min(...r.grids.map(g => g.numbers));
    check(log, 'the sound reads what it reads in the film (grid agreement over .95 on every pattern)', worst > .95, `worst ${worst}`);
    check(log, 'a colour nothing could read as coverage reads exactly as the mirror does', tintWorst === worst && r.notes.tintVsMirror === 1, `grid ${tintWorst}, notes ${r.notes.tintVsMirror}`);
    check(log, 'notes in the mirror world match the film', r.notes.mirrorSequence > .95, JSON.stringify(r.notes));
    check(log, `every hand verb and tool (${r.handN}) byte-identical in the mirror`, !r.handBad.length, r.handBad.join(' | '));

    // A recording across a change, in real time
    const rec = await page.eval(async () => {
      const stage = app.stage, r = app.ui.recorder, wait = ms => new Promise(res => setTimeout(res, ms));
      app.manual = false; trippee.run(); app.governor.enabled = true;
      r.autosave = false;
      stage.world = null; stage.score = stage.score;
      trippee.load('lines.river'); app.manual = false; trippee.run();
      await wait(500);
      r.start();
      await wait(2000);
      const ok = await stage.setWorld('numbers', { dur: 4 });
      await wait(6000);
      const inWorld = stage.world?.id, frames = r.frames, secs = r.seconds();
      const blob = await r.stop();
      const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.src = URL.createObjectURL(blob);
      await new Promise((res, no) => { v.onloadedmetadata = res; v.onerror = () => no(new Error('video would not load: ' + v.error?.message)); });
      let dur = v.duration;
      if (!isFinite(dur)) { v.currentTime = 1e7; await new Promise(res => { v.ondurationchange = () => { if (isFinite(v.duration)) res(); }; setTimeout(res, 3000); }); dur = v.duration; }
      const c = document.createElement('canvas'); c.width = 320; c.height = 180; const g = c.getContext('2d', { willReadFrequently: true });
      const seen = [], images = [];
      for (const f of [.05, .3, .5, .7, .9, .995]) {
        v.currentTime = f * dur;
        await new Promise((res, no) => { const tm = setTimeout(() => no(new Error('seek never landed at ' + f)), 8000); v.onseeked = () => { clearTimeout(tm); res(); }; });
        await new Promise(requestAnimationFrame);
        g.drawImage(v, 0, 0, 320, 180);
        const d = g.getImageData(0, 0, 320, 180).data; let chroma = 0; for (let i = 0; i < d.length; i += 40) chroma += Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
        seen.push({ at: +(f * dur).toFixed(2), chroma: +(chroma / (d.length / 40) / 255).toFixed(3) });
        images.push(c.toDataURL('image/jpeg', .7));
      }
      stage.setWorld(null, { dur: 1 });
      await wait(1800);
      return { ok, inWorld, frames, secs: +secs.toFixed(1), dur: +dur.toFixed(2), size: blob.size, seen, images };
    });
    log('recording', JSON.stringify({ ...rec, images: undefined }));
    rec.images.forEach((u, i) => save(`rec-${i}.jpg`, u));
    check(log, 'a recording across a change plays to its end, black and white into colour', rec.ok === true && rec.dur > rec.secs - 1.5 && rec.seen[0].chroma < .02 && rec.seen.at(-1).chroma > .1, `${rec.dur} s of ${rec.secs} s, chroma ${rec.seen.map(s => s.chroma).join(' ')}`);
  }

  // ---- 5b. A change under a song: its clock doesn't move, a seek in the middle, static, song end. Real time, muted.
  if (has('song')) {
    const r = await page.eval(async () => {
      const stage = app.stage, song = app.song, wait = ms => new Promise(res => setTimeout(res, ms)), out = {};
      app.manual = false; trippee.run();
      await song.load('/media/mgmt.mp3', { seed: 7, autoplay: true });
      await wait(1500);
      out.film0 = { gestures: stage.score.gestures.length, world: stage.score.world ?? null };
      // How far the picture's clock strays from what's heard, every frame
      // A frame that comes late is late, and the picture's clock is free-running, so it catches up on the frame after. What's asked is that it's with the sound once it has.
      let worst = 0, n = 0, last = null, back = 0, seekAt = -1, lastNow = 0, gap = 0, gapAt = 0, lateFor = 0;
      const f = () => {
        const now = performance.now(), dt = now - lastNow; lastNow = now;
        if (dt > gap && n > 2) { gap = dt; gapAt = now; }
        if (dt > 60) lateFor = 3;
        const d = Math.abs(app.t - song.time() - song.lead);
        if (song.playing && !lateFor && d > worst && now > seekAt + 300) worst = d;
        if (lateFor) lateFor--;
        if (last != null && app.t < last - .05 && now > seekAt + 300) back++;
        last = app.t; n++;
      };
      app.onFrame.push(f);
      await wait(1000);
      const worstBefore = worst;
      const t0 = app.t;
      gap = 0;
      const tClick = performance.now();
      const began = await stage.setWorld('numbers');
      out.clickMs = +(performance.now() - tClick).toFixed(0);
      const sc = stage.score;
      out.change = { began, tAtClick: +t0.toFixed(2), scoreIsFilm: !!sc.song, world: sc.world?.id, handover: !!sc.handover?.change, noGlide: sc.handover?.noGlide };
      await wait(3000);
      out.gapAfterClick = +gap.toFixed(0);
      out.mid = { x: +((sc.handover?.e ?? 0) / (sc.handover?.D ?? 1)).toFixed(2), kind: app.lastFrame.kind, wp: app.R.wp?.W?.id ?? null };
      // A seek in the middle of the change
      seekAt = performance.now(); song.seek(60);
      await wait(800);
      out.afterSeek = { t: +app.t.toFixed(2), heard: +song.time().toFixed(2), change: !!stage.score.handover?.change, wp: app.R.wp?.W?.id ?? null };
      for (let i = 0; i < 80 && stage.score.handover?.change; i++) await wait(150);
      await wait(300);
      out.landed = { t: +app.t.toFixed(2), heard: +song.time().toFixed(2), world: stage.world?.id, wp: app.R.wp?.W?.id ?? null, score: stage.score.world?.id, v: app.R.variant };
      out.worstBefore = +worstBefore.toFixed(3); out.worst = +worst.toFixed(3); out.back = back; out.frames = n;
      // The song runs into its own next transformation in this world
      const g = stage.score.gestures, i = g.indexOf(stage.current(app.pictureT())), nx = g[i]?.t1 - (g[i]?.morph ?? 0);
      out.nextMorphIn = +(nx - app.pictureT()).toFixed(1);
      // Static: stays static, and it's another change
      stage.setStatic(true, app.pictureT());
      await wait(2500);
      const was = stage.staticG?.pattern?.id;
      await stage.setWorld('mirror');
      await wait(200);
      out.static = { was, now: stage.staticG?.pattern?.id, still: !!stage.staticG, change: !!stage.score.handover?.change };
      for (let i = 0; i < 80 && stage.score.handover?.change; i++) await wait(150);
      out.static.landed = app.R.wp?.W?.id ?? null;
      stage.setStatic(false, app.pictureT());
      await wait(2000);
      // Back to the film, under the song, and the song's film is the film again
      await stage.setWorld(null);
      for (let i = 0; i < 80 && stage.score.handover?.change; i++) await wait(150);
      await wait(300);
      out.home = { world: stage.world, wp: app.R.wp, stamped: stage.score.world ?? null, v: app.R.variant, playing: song.playing };
      // Eject in a world: the wander that follows wears it
      await stage.setWorld('numbers');
      await wait(500);
      song.eject();
      await wait(500);
      out.eject = { scoreWorld: stage.score.world?.id, song: !!stage.score.song, change: !!stage.score.handover?.change };
      app.onFrame.splice(app.onFrame.indexOf(f), 1);
      for (let i = 0; i < 80 && stage.score.handover?.change; i++) await wait(150);
      await stage.setWorld(null);
      return out;
    });
    log(JSON.stringify(r));
    check(log, 'a change under a song is a flight into a film in that world', r.change.began === true && r.change.scoreIsFilm && r.change.world === 'numbers' && r.change.handover && r.change.noGlide);
    check(log, 'the song\'s clock does not move: the picture stays with what\'s heard', r.worst < .3 && r.back === 0, `worst ${r.worst} s (before the change ${r.worstBefore} s), ran backward ${r.back} times, over ${r.frames} frames. Longest frame in the 3 s after the click: ${r.gapAfterClick} ms, and the click took ${r.clickMs} ms to begin`);
    check(log, 'a seek in the middle of a change lands in the world, at the right time', r.landed.world === 'numbers' && r.landed.wp === 'numbers' && r.landed.score === 'numbers' && Math.abs(r.afterSeek.t - r.afterSeek.heard) < .3, JSON.stringify(r.afterSeek));
    check(log, 'static stays static through a change', r.static.still && r.static.change && r.static.landed === 'mirror', JSON.stringify(r.static));
    check(log, 'and home to the film', !r.home.world && !r.home.wp && !r.home.stamped && r.home.v < 16, JSON.stringify(r.home));
    check(log, 'an eject leaves the wander wearing the world', r.eject.scoreWorld === 'numbers' && !r.eject.song, JSON.stringify(r.eject));
  }

  // ---- 8. The strip: a first-time click-through, with real input
  if (has('strip')) {
    await page.goto((process.env.LAB_URL || 'http://localhost:5300/') + '?worlds=test');
    for (let i = 0; i < 120; i++) { if (await page.eval('typeof window.trippee !== "undefined" && window.trippee.ready === true')) break; await sleep(250); }
    await page.eval(helpers);
    const move = (x, y) => page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    const click = async (x, y) => { await move(x, y); await sleep(60); await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); };
    const key = async k => { await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: 'Key' + k.toUpperCase(), text: k, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) }); await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: 'Key' + k.toUpperCase(), windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) }); };
    const rect = sel => page.eval(`(()=>{const b=document.querySelector(${JSON.stringify(sel)});if(!b||b.hidden)return null;const r=b.getBoundingClientRect();return r.width?[r.left+r.width/2,r.top+r.height/2]:null})()`);
    const state = () => page.eval(`({world:app.stage.world?.id??null,colour:!!app.beyond.active,change:!!app.stage.score.handover?.change,strip:!document.querySelector('#worlds')?.hidden&&!!document.querySelector('#worlds'),now:document.querySelector('#worlds .now')?.dataset.w??null,wp:app.R.wp?.W?.id??null,variant:app.R.variant})`);
    await page.eval(`document.querySelector('#hints [data-ok]')?.click()`);
    await move(640, 300); await sleep(300);
    const none = await page.eval(worldScripts);
    check(log, 'before anything is asked for, no world code has loaded', none.length === 0, none.join(' '));
    log('bar', await page.eval(`[...document.querySelectorAll('#fx [data-fx]')].map(b=>b.textContent.trim()).join(' | ')`));
    await page.shot('strip-0-bar');
    const w = await rect('[data-world]');
    check(log, 'there is a world button', !!w);
    await click(...w); await sleep(800);
    await page.shot('strip-1-open');
    log('strip', await page.eval(`[...document.querySelectorAll('#worlds [data-w]')].map(b=>b.textContent.trim()).join(' | ')`));
    let s = await state();
    check(log, 'it opens the strip, on black and white', s.strip && s.now === 'film' && !s.world, JSON.stringify(s));
    const n = await rect('[data-w=numbers]');
    await move(...n); await sleep(1200);
    const built = await page.eval(`[...(app.R.worldPrograms?.values()??[])].map(w=>[w.W.id,Object.keys(w.progs).length])`);
    check(log, 'pointing at a world starts building it', built.some(b => b[0] === 'numbers' && b[1] > 0), JSON.stringify(built));
    await click(...n); await sleep(1000);
    s = await state(); log('clicked numbers', JSON.stringify(s));
    check(log, 'clicking it starts the change', s.world === 'numbers' && s.change);
    await sleep(4000); await page.shot('strip-2-mid');
    for (let i = 0; i < 80 && (await state()).change; i++) await sleep(250);      // a change takes 9 seconds, or longer if it's been looked at and flashed
    await sleep(400);
    s = await state();
    check(log, 'it arrives', s.world === 'numbers' && !s.change && s.wp === 'numbers' && s.now === 'numbers', JSON.stringify(s));
    await page.shot('strip-3-numbers');
    const landed = async ms => { const t0 = Date.now(); for (;;) { const q = await state(); if (!q.change && Date.now() - t0 > 1200) return q; if (Date.now() - t0 > ms) return q; await sleep(250); } };
    // Round to the last world there is. There were only the test worlds when this was written.
    const after = await page.eval(`(ids=>ids.slice(ids.indexOf('numbers')+1))([...document.querySelectorAll('#worlds [data-w]')].map(b=>b.dataset.w))`);
    for (const id of after) { await key('v'); await sleep(1500); s = await landed(22000); check(log, `v goes on to ${id}`, s.world === id, JSON.stringify(s)); }
    await key('v'); await sleep(1500);
    s = await state(); log('v, from the last world', JSON.stringify(s));
    check(log, 'v from the last world goes round to the film', s.world === null && s.change);
    s = await landed(16000);
    await key('v'); await sleep(1500);
    s = await state(); log('v again', JSON.stringify(s));
    check(log, 'v from the film goes to the first world', s.world === 'mirror' && s.change);
    s = await landed(16000);
    await page.shot('strip-4-v');
    await key('b'); await sleep(1000);
    s = await state(); log('b', JSON.stringify(s));
    check(log, 'b in a world goes to the film first', s.world === null && !s.colour && s.change, JSON.stringify(s));
    for (let i = 0; i < 80 && (await state()).change; i++) await sleep(250);
    await sleep(600);
    s = await state(); log('b landed', JSON.stringify(s));
    check(log, 'and then colour opens', s.colour && !s.world && !s.change, JSON.stringify(s));
    await move(640, 300); await sleep(200);
    await page.shot('strip-5-colour');
    const nn = await rect('[data-w=numbers]') ?? (await click(...(await rect('[data-world]'))), await sleep(300), await rect('[data-w=numbers]'));
    await page.eval('app.beyond.snap(.8)'); await sleep(200);
    await click(...nn); await sleep(500);
    s = await state(); log('numbers from colour', JSON.stringify(s));
    check(log, 'colour shuts first, then the world', !s.colour && s.world === null, JSON.stringify(s));
    const tc = Date.now();
    for (let i = 0; i < 60 && (await state()).world !== 'numbers'; i++) await sleep(250);
    log(`the change began ${((Date.now() - tc) / 1000).toFixed(1)} s after colour started shutting`);
    await sleep(1500);
    s = await landed(16000);
    check(log, 'and that world arrives', s.world === 'numbers' && !s.change, JSON.stringify(s));
    const f = await rect('[data-w=film]') ?? (await click(...(await rect('[data-world]'))), await sleep(300), await rect('[data-w=film]'));
    await click(...f); await sleep(1500);
    s = await landed(16000);
    check(log, 'black and white takes it home', !s.world && !s.colour && !s.change && !s.wp && s.variant < 16, JSON.stringify(s));
    await page.shot('strip-6-home');
  }

  if (failed) throw new Error(`${failed} failed`);
  log('worlds: all passed that ran');
};
