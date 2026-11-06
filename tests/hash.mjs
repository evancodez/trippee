// Pixel fingerprints: is the picture still exactly what it was? sha256 of trippee.capture() at 1280x720, governor off, for
// every pattern at u .25 .5 .75, 12 fixed morph pairs at 3 times, Beyond at snap(0) and snap(.6), and fixed ripple, warp and other edits.
//
//   MODE=save  node tools/lab.mjs tests/hash.mjs --out lab-out/<lane>      writes lab-out/hash/<TAG>.json (TAG defaults to "base")
//   MODE=check node tools/lab.mjs tests/hash.mjs --out lab-out/<lane>      compares against it. Exits 1 and says which differ. MODE=check is the default.
//
//   GROUPS=pattern,morph,beyond,edits   only those groups (check only, no partial saves)
//   FLAGS=off                           every flag in src/score/flags.js off first: the "Flags off" row, with TAG=stage1
//   node tests/hash.mjs                 no browser: just the sha256 of FRAG, for a pure cut of the shader
//
// The baseline lives in lab-out/hash/, the same folder whichever --out a lane uses, and isn't committed: these are this machine's GPU's pixels.
// A pattern added later is listed as new, not a failure. A difference prints how big it is, so a rounding speck can't pass for a different picture.
// lab-out/g2/base is a copy of the tree at bf1a9d2, served at /lab-out/g2/base/, should a baseline ever need making again from before the split:
//   MODE=save node tools/lab.mjs tests/hash.mjs --url http://localhost:5300/lab-out/g2/base/ --out lab-out/g2
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TAG = process.env.TAG || 'base', MODE = process.env.MODE || 'check';
const FILE = join(process.env.HASHDIR || join(ROOT, 'lab-out', 'hash'), `${TAG}.json`);

// One of each kind the planner makes, measured at bf1a9d2. The kind is a record, and a change of kind shows up as different pixels anyway.
export const PAIRS = [
  ['checks.cloth', 'checks.target'], ['lines.fall', 'lines.squeeze'], ['rooms.nested', 'waves.swell'],                 // slides
  ['lines.ghost', 'checks.vega'],                                                                                      // a bend
  ['checks.vega', 'void.diamond'], ['body.tube', 'lines.discs'], ['lattice.master', 'body.planet'], ['rooms.room', 'waves.dune'], ['pole.garden', 'void.diamond'],  // dives
  ['waves.silk', 'rooms.hall'], ['lattice.pinwheel', 'dots.inflate'], ['checks.crush', 'rooms.tunnel'],                // rises
];

export async function fragHash(urlPath = '/') {
  const m = await import(pathToFileURL(join(ROOT, urlPath, 'src/gl/shader.js')).href + `?${Date.now()}`);
  return createHash('sha256').update(m.FRAG).digest('hex');
}

const inPage = async ({ PAIRS, groups }) => {
  const T = window.trippee, app = T.app, out = {};
  const size = [T.canvas.width, T.canvas.height];
  app.governor.enabled = false; app.R.drawScale = 1; app.manual = true; app.paused = false;
  const small = document.createElement('canvas'); small.width = 64; small.height = 36;
  const g = small.getContext('2d', { willReadFrequently: true });
  const enc = new TextEncoder();
  const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  let n = 0;
  const shoot = async (key, extra) => {
    const url = T.capture();
    g.drawImage(T.canvas, 0, 0, 64, 36);     // same task as the draw, while the drawing buffer is there
    const d = g.getImageData(0, 0, 64, 36).data, L = new Uint8Array(64 * 36);
    for (let i = 0; i < L.length; i++) L[i] = d[i * 4 + 1];
    const sha = hex(await crypto.subtle.digest('SHA-256', enc.encode(url)));
    out[key] = { sha, thumb: btoa(String.fromCharCode(...L)), ...extra };
    if (++n % 16 === 0) await new Promise(r => setTimeout(r));
    return { sha, url };
  };

  // A test mustn't hang on which plan happened to be the page's first: these three use up whatever a fresh renderer's first probes do.
  for (const [a, b] of [['lines.river', 'checks.vega'], ['checks.vega', 'lattice.master'], ['lattice.master', 'lines.river']]) { T.morph(a, b, 8, 1); T.seek(5); }

  const want = id => !groups || groups.includes(id);
  const plain = {};
  if (want('pattern')) for (const { id } of T.list()) for (const u of [0.25, 0.5, 0.75]) {
    T.still(id, u);
    plain[`${id}@${u}`] = (await shoot(`pattern ${id} u${u}`)).sha;
  }
  if (want('morph')) for (const [a, b] of PAIRS) for (const t of [2.5, 5, 7.5]) {
    T.morph(a, b, 8, 1); T.seek(t);     // each from fresh, so no plan is carried from one to the next
    await shoot(`morph ${a}>${b} t${t}`, { kind: app.stage.score.gestures[0].plan?.kind ?? app.lastFrame.kind });
  }
  const identical = [];
  if (want('beyond')) {
    app.t = 0; app.beyond.on();
    const stills = [['lines.river', 0.5], ['lattice.master', 0.5], ['checks.vega', 0.25], ['body.planet', 0.5], ['rooms.room', 0.75], ['dots.inflate', 0.5]];
    for (const open of [0, 0.6]) for (const [id, u] of stills) {
      T.still(id, u); app.beyond.snap(open);
      const { sha } = await shoot(`beyond ${open} ${id} u${u}`);
      if (open === 0 && plain[`${id}@${u}`]) identical.push([id, sha === plain[`${id}@${u}`]]);
    }
    for (const open of [0, 0.6]) for (const [a, b] of [['checks.vega', 'void.diamond'], ['waves.silk', 'rooms.hall']]) {
      T.morph(a, b, 8, 1); app.beyond.snap(open); T.seek(5); app.beyond.snap(open);
      await shoot(`beyond ${open} ${a}>${b} t5`);
    }
    app.beyond.off(); app.beyond.snap(null);
    T.still('lines.river', 0.5);
  }
  if (want('edits')) {
    // Tools write these once a frame, after frame() has read them, so each is set again just before its one capture.
    const rings = [{ x: 0.2, y: 0.1, radius: 0.5, height: 0.024 }, { x: -0.6, y: -0.3, radius: 0.9, height: 0.018 }];
    const cases = {
      ripple: E => { E.ripples = rings; },
      warp: E => { E.warp = { x: 0.1, y: -0.1, r: 0.72, twist: 2.5, pinch: 0.8 }; },
      bulge: E => { E.warp = { x: -0.2, y: 0.15, r: 0.72, twist: 0, pinch: -0.8 }; },
      hand: E => { E.hand = { x: 0.1, y: -0.2, on: 1, height: 0.055, curl: 0, spread: 0.5, turn: 0.15, size: 3 }; },
      fist: E => { E.hand = { x: 0.1, y: -0.2, on: 1, height: 0.055, curl: 1, spread: 0.5, turn: 0.15, size: 3 }; },
      zoom: E => { E.journey = 0.7; E.jx = 0.1; E.jy = -0.05; E.spin = 0.4; },
      duty: E => { E.duty = 0.22; },
      press: E => { E.pressX = 0.2; E.pressY = 0.1; E.press = 0.8; E.pressR = 0.5; },
      sheet: E => { E.sheetX = 0.03; E.sheetY = 0.01; E.sheetRot = 0.04; E.sheet = 1; },
      knob: E => { E.over = { freq: 1.6 }; },
      invert: E => { E.invert = true; },
    };
    const clear = E => { E.ripples = null; E.warp = null; E.hand = null; E.journey = 0; E.jx = 0; E.jy = 0; E.spin = 0; E.duty = 0; E.press = 0; E.sheet = 0; E.over = {}; E.invert = false; };
    for (const [id, u] of [['lines.river', 0.5], ['lattice.master', 0.5], ['body.planet', 0.5]]) for (const name in cases) {
      T.still(id, u); cases[name](app.edits);
      await shoot(`edits ${name} ${id}`);
      clear(app.edits);
    }
    // and in a flight, where these reach two slots
    for (const name of ['ripple', 'warp', 'hand']) {
      T.morph('checks.vega', 'void.diamond', 8, 1); T.seek(5); cases[name](app.edits);
      await shoot(`edits ${name} flight`);
      clear(app.edits);
    }
    T.still('lines.river', 0.5);
  }
  const errs = app.R.gl.getError();
  return { out, size, identical, glError: errs, variant: app.R.variant };
};

const thumbDiff = (a, b) => {
  if (!a || !b) return null;
  const x = Buffer.from(a, 'base64'), y = Buffer.from(b, 'base64');
  let s = 0, worst = 0;
  for (let i = 0; i < x.length; i++) { const d = Math.abs(x[i] - y[i]); s += d; worst = Math.max(worst, d); }
  return { mean: +(s / x.length).toFixed(2), worst };
};

export default async ({ page, log, save, sleep }) => {
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  const urlPath = await page.eval('location.pathname');
  const frag = await fragHash(urlPath).catch(e => `(${e.message})`);
  const groups = process.env.GROUPS ? process.env.GROUPS.split(',') : null;
  if (process.env.FLAGS === 'off') log('flags off:', await page.eval(async () => { const m = await import(new URL('src/score/flags.js', location.href).href); m.setAllFlags(false); return Object.keys(m.flags).length; }));
  const t0 = Date.now();
  const r = await page.eval(inPage, { PAIRS, groups });
  const keys = Object.keys(r.out), secs = ((Date.now() - t0) / 1000).toFixed(1);
  const errors = page.logs.filter(l => /\[error\]|\[exception\]/.test(l));
  log(`hash: ${keys.length} captures in ${secs} s at ${r.size.join('x')}, FRAG ${frag.slice(0, 16)}, from ${urlPath}`);
  if (r.size[0] !== 1280 || r.size[1] !== 720) throw new Error(`hash needs 1280x720, got ${r.size}`);
  if (r.glError) log('gl error', r.glError);
  if (errors.length) log('page errors', errors.slice(0, 5));
  const notSame = r.identical.filter(x => !x[1]).map(x => x[0]);
  if (r.identical.length) log(`Beyond snap(0) byte-identical to black and white: ${r.identical.length - notSame.length}/${r.identical.length}`, notSame.length ? notSame : '');

  if (MODE === 'save') {
    if (groups) throw new Error('save everything: unset GROUPS');
    if (errors.length) throw new Error('not saving a baseline from a page with errors');
    mkdirSync(dirname(FILE), { recursive: true });
    writeFileSync(FILE, JSON.stringify({ tag: TAG, saved: new Date().toISOString(), frag, from: urlPath, size: r.size, captures: r.out }));
    log(`saved ${FILE}`);
    const kinds = {}; for (const k of keys) if (r.out[k].kind) kinds[r.out[k].kind] = (kinds[r.out[k].kind] || 0) + 1;
    log('morph kinds', JSON.stringify(kinds));
    return;
  }

  if (!existsSync(FILE)) throw new Error(`no baseline at ${FILE}: run with MODE=save first`);
  const base = JSON.parse(readFileSync(FILE, 'utf8'));
  log(`baseline ${TAG} saved ${base.saved}, FRAG ${String(base.frag).slice(0, 16)}${base.frag === frag ? ' (FRAG identical)' : ' (FRAG differs)'}`);
  const differ = [], missing = [], fresh = [];
  const asked = k => !groups || groups.includes(k.split(' ')[0]);
  for (const k of Object.keys(base.captures)) {
    if (!asked(k)) continue;
    if (!r.out[k]) missing.push(k);
    else if (r.out[k].sha !== base.captures[k].sha) differ.push({ k, ...thumbDiff(r.out[k].thumb, base.captures[k].thumb), kindWas: base.captures[k].kind, kindNow: r.out[k].kind });
  }
  for (const k of keys) if (!base.captures[k]) fresh.push(k);
  const byGroup = {};
  for (const d of differ) { const g = d.k.split(' ')[0]; byGroup[g] = (byGroup[g] || 0) + 1; }
  save('hash-report.json', JSON.stringify({ tag: TAG, frag, baseFrag: base.frag, differ, missing, fresh }, null, 1));
  if (fresh.length) log(`new since the baseline, not compared: ${fresh.length}`);
  if (missing.length) log(`MISSING ${missing.length}:`, missing.slice(0, 12).join(' | '));
  if (differ.length) {
    differ.sort((a, b) => b.mean - a.mean);
    log(`DIFFER ${differ.length}/${keys.length}`, JSON.stringify(byGroup));
    for (const d of differ.slice(0, 16)) log(`  ${d.k}: mean ${d.mean}/255, worst ${d.worst} on a 64x36 thumbnail${d.kindWas !== d.kindNow ? `, kind ${d.kindWas} -> ${d.kindNow}` : ''}`);
  }
  if (differ.length || missing.length) throw new Error(`hash FAIL: ${differ.length} differ, ${missing.length} missing against ${TAG}`);
  log(`hash PASS: ${keys.length - fresh.length} captures identical to ${TAG}`);
};

// Run on its own, no browser: FRAG only
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(await fragHash(process.env.URLPATH || '/'));
}
