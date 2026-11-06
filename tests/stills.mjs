// No two worlds alike, from one still frame. docs/MODES.md section 7.
//
//   WORLDS=film,beyond,mirror SONGS=mgmt,ppp node tools/lab.mjs tests/stills.mjs --out lab-out/<lane>      20 frames per world per song, measured at 640x360. Muted.
//   node tests/stills.mjs --selftest                                                                       no browser: can it tell worlds apart, can it fail, and does it know a recolour?
//   node tests/stills.mjs lab-out/<lane>/stills.json                                                       judges a saved run again
//
// Features: hue histogram, saturation, luma histogram, edge sharpness, band width. Nearest centroid, leave one out: at least 90% right, and no pair over 10% confusion.
// Recolour: conditional entropy of colour given coverage, in bits, at least 1 for a world. A recolour is a function of c, so it's 0.
// Then a contact sheet with the names off, stills-blind.jpg, for the owner to name; stills-key.json is the answer, and stills-named.jpg is the same frames with their names on, for whoever made it.
// 'film' is no world and 'beyond' is colour on the film: both are in the table in section 3a, so both are in the running, but neither is held to the recolour bar (film is a recolour by definition).
import { readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LIMITS = { accuracy: 0.9, pair: 0.1, entropy: 1 };
const r3 = x => +(+x).toFixed(3);

// rgba bytes -> feature vector. Self-contained, so it can go to the page as text. Stands alone: 12 hue bins weighted by chroma, mean chroma, 4 chroma bins, 8 luma bins, 3 on edges, 2 on band width, 1 on how few colours cover the frame.
export function featuresOf(d, W, H) {
  const hue = new Float64Array(12), sat = new Float64Array(4), luma = new Float64Array(8), L = new Float32Array(W * H), cells = new Map();
  let chromaSum = 0, chromaW = 0;
  const n = W * H;
  for (let i = 0; i < n; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
    const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b; L[i] = Y;
    luma[Math.min(7, (Y / 32) | 0)]++;
    sat[Math.min(3, (c / 64) | 0)]++;
    chromaSum += c;
    if (c > 8) { let h = mx === r ? ((g - b) / c + 6) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4; hue[Math.min(11, (h * 2) | 0)] += c; chromaW += c; }
    const q = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4); cells.set(q, (cells.get(q) || 0) + 1);
  }
  for (let i = 0; i < 12; i++) hue[i] /= Math.max(chromaW, 1);
  const f = [...hue, chromaSum / n / 255, ...Array.from(sat, v => v / n), ...Array.from(luma, v => v / n)];
  // Edges: how hard they are. Of the pixel steps that aren't flat, how big, and how much is hard against soft.
  let big = 0, soft = 0, sum = 0, cnt = 0;
  for (let y = 0; y < H; y += 2) for (let x = 1; x < W; x++) { const s = Math.abs(L[y * W + x] - L[y * W + x - 1]); if (s > 4) { sum += s; cnt++; if (s > 48) big++; else soft++; } }
  for (let x = 0; x < W; x += 2) for (let y = 1; y < H; y++) { const s = Math.abs(L[y * W + x] - L[(y - 1) * W + x]); if (s > 4) { sum += s; cnt++; if (s > 48) big++; else soft++; } }
  f.push(cnt ? sum / cnt / 255 : 0, cnt ? big / cnt : 0, Math.log1p(soft / (W * H)) );
  // Band width: the median run on one side of the frame's mean, across and down, as a share of the height, logged. And how spread those runs are.
  let m = 0; for (let i = 0; i < n; i++) m += L[i]; m /= n;
  const runs = [];
  for (let y = 2; y < H; y += 4) { let start = 0, side = L[y * W] > m; for (let x = 1; x < W; x++) { const s = L[y * W + x] > m; if (s !== side) { runs.push(x - start); start = x; side = s; } } }
  for (let x = 2; x < W; x += 4) { let start = 0, side = L[x] > m; for (let y = 1; y < H; y++) { const s = L[y * W + x] > m; if (s !== side) { runs.push(y - start); start = y; side = s; } } }
  runs.sort((a, b) => a - b);
  const med = runs.length ? runs[runs.length >> 1] : H, p90 = runs.length ? runs[Math.floor(runs.length * 0.9)] : H;
  f.push(Math.log(med / H + 1e-3), Math.log(p90 / H + 1e-3));
  // How many of the 4096 coarse colours it takes to cover 90%: a flat poster's few, a continuous dye's many
  const counts = [...cells.values()].sort((a, b) => b - a); let run = 0, k = 0; for (const c of counts) { run += c; k++; if (run >= 0.9 * n) break; }
  f.push(Math.log(k));
  return f;
}

// H(colour | c) in bits. c: coverage bytes, quantised to 16; colour: 8 levels per channel. rgba, and c read from any channel of the coverage draw's rgba.
export function entropyGivenC(d, cov, W, H) {
  const n = W * H, joint = new Map(), byC = new Float64Array(16);
  for (let i = 0; i < n; i++) {
    const c = cov[i * 4 + 1] >> 4, col = (d[i * 4] >> 5) << 6 | (d[i * 4 + 1] >> 5) << 3 | (d[i * 4 + 2] >> 5), key = c << 9 | col;
    joint.set(key, (joint.get(key) || 0) + 1); byC[c]++;
  }
  let h = 0;
  for (const [key, v] of joint) { const c = key >> 9; h -= (v / n) * Math.log2(v / byC[c]); }
  return h;
}

// Standardise on everything, then nearest centroid, leaving each frame out of its own world's centroid. samples: [{ world, f }]
export function nearestCentroid(samples) {
  const worlds = [...new Set(samples.map(s => s.world))], D = samples[0].f.length, n = samples.length;
  const mu = new Float64Array(D), sd = new Float64Array(D);
  for (const s of samples) for (let i = 0; i < D; i++) mu[i] += s.f[i] / n;
  for (const s of samples) for (let i = 0; i < D; i++) sd[i] += (s.f[i] - mu[i]) ** 2 / n;
  for (let i = 0; i < D; i++) sd[i] = Math.sqrt(sd[i]) || 1;
  const X = samples.map(s => Float64Array.from(s.f, (v, i) => (v - mu[i]) / sd[i]));
  const sum = {}, cnt = {};
  for (const w of worlds) { sum[w] = new Float64Array(D); cnt[w] = 0; }
  samples.forEach((s, k) => { cnt[s.world]++; for (let i = 0; i < D; i++) sum[s.world][i] += X[k][i]; });
  const conf = Object.fromEntries(worlds.map(a => [a, Object.fromEntries(worlds.map(b => [b, 0]))]));
  let right = 0;
  samples.forEach((s, k) => {
    let best = null, bd = Infinity;
    for (const w of worlds) {
      const c = cnt[w] - (w === s.world ? 1 : 0); if (!c) continue;
      let dist = 0;
      for (let i = 0; i < D; i++) { const u = (sum[w][i] - (w === s.world ? X[k][i] : 0)) / c; dist += (X[k][i] - u) ** 2; }
      if (dist < bd) { bd = dist; best = w; }
    }
    conf[s.world][best]++; if (best === s.world) right++;
  });
  const pairs = [];
  for (let i = 0; i < worlds.length; i++) for (let j = i + 1; j < worlds.length; j++) {
    const a = worlds[i], b = worlds[j], x = Math.max(conf[a][b] / cnt[a], conf[b][a] / cnt[b]);
    pairs.push({ a, b, confusion: r3(x) });
  }
  pairs.sort((p, q) => q.confusion - p.confusion);
  return { worlds, accuracy: r3(right / n), conf, pairs, worst: pairs[0] ?? null };
}

export function judge(samples, entropies, limits = LIMITS) {
  const nc = nearestCentroid(samples), fails = [];
  if (nc.accuracy < limits.accuracy) fails.push(`accuracy ${nc.accuracy}, want ${limits.accuracy}+`);
  for (const p of nc.pairs) if (p.confusion > limits.pair) fails.push(`${p.a} and ${p.b} confused ${p.confusion}, limit ${limits.pair}`);
  const ent = {};
  for (const [w, v] of Object.entries(entropies)) { const m = v.reduce((s, x) => s + x, 0) / Math.max(v.length, 1); ent[w] = r3(m); if (w !== 'film' && w !== 'beyond' && m < limits.entropy) fails.push(`${w} is a recolour: H(colour|c) ${r3(m)} bits, want ${limits.entropy}+`); }
  return { ...nc, entropy: ent, fails, pass: !fails.length };
}

// ---------------------------------------------------------------- in the page
const grabInPage = async ({ times, featSrc, entSrc, covered, world, song }) => {
  const T = window.trippee, feat = (0, eval)(`(${featSrc})`), ent = (0, eval)(`(${entSrc})`);
  const W = T.canvas.width, H = T.canvas.height, gl = app.R.gl, px = new Uint8Array(W * H * 4), cv = new Uint8Array(W * H * 4), out = [];
  const flipInto = (src, dst) => { for (let y = 0; y < H; y++) dst.set(src.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4); return dst; };
  const top = new Uint8ClampedArray(W * H * 4), th = document.createElement('canvas'); th.width = 320; th.height = 180; const tg = th.getContext('2d');
  for (let i = 0; i < times.length; i++) {
    T.seek(times[i]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    tg.drawImage(T.canvas, 0, 0, 320, 180);
    let h = 0;
    if (covered && window.__coverage) { window.__coverage(); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, cv); h = ent(px, cv, W, H); }
    else h = ent(px, px, W, H);
    flipInto(px, top);
    out.push({ t: times[i], f: feat(top, W, H), h: +h.toFixed(3), thumb: th.toDataURL('image/jpeg', 0.8), pattern: app.lastFrame?.G?.pattern?.id, kind: app.lastFrame?.kind ?? null });
    if (i % 2 === 0) await new Promise(r => setTimeout(r));
  }
  return out;
};
const sheetInPage = async ({ items, cols, named }) => {
  const TW = 320, TH = 180, rows = Math.ceil(items.length / cols), c = document.createElement('canvas'); c.width = cols * TW; c.height = rows * TH;
  const g = c.getContext('2d'); g.font = '13px monospace';
  for (let i = 0; i < items.length; i++) {
    const im = new Image(); im.src = items[i].thumb; await im.decode();
    const x = (i % cols) * TW, y = ((i / cols) | 0) * TH; g.drawImage(im, x, y, TW - 2, TH - 2);
    const label = named ? `${items[i].world} ${items[i].song}` : items[i].label;
    g.fillStyle = '#000'; g.fillRect(x, y, g.measureText(label).width + 6, 16); g.fillStyle = '#fff'; g.fillText(label, x + 3, y + 12);
  }
  return c.toDataURL('image/jpeg', 0.85);
};

export default async ({ page, log, save, sleep }) => {
  const { dropSong, enterWorld } = await import('../tools/look.mjs');
  // No world first: each song's page starts on the film, and the way back from a world isn't what's being tested here.
  const rank = w => (w === 'film' ? 0 : w === 'beyond' ? 1 : 2), worlds = (process.env.WORLDS || 'film,beyond').split(',').sort((a, b) => rank(a) - rank(b)), songs = (process.env.SONGS || 'mgmt').split(','), N = +(process.env.N || 20);
  await page.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 360, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  const samples = [], entropies = {}, frames = [];
  for (const song of songs) {
    await page.goto(await page.eval('location.href'));      // each song from a fresh page, so a world's programs and a song's film don't carry over
    for (let i = 0; i < 120; i++) { if (await page.eval('window.trippee?.ready === true')) break; await sleep(250); }
    await page.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 360, deviceScaleFactor: 1, mobile: false });
    await sleep(300);
    await dropSong(page, `media/${song}.mp3`, { resolvePath: resolve, sleep });
    for (const world of worlds) {
      if (world === 'beyond') await page.eval(`app.t=0;app.beyond.on();app.beyond.snap(0.6)`);
      else { await page.eval(`app.beyond.off();app.beyond.snap(null)`); if (world !== 'film') await enterWorld(page, world, log); }
      const duration = await page.eval('app.song.duration');
      const times = Array.from({ length: N }, (_, i) => +(duration * (0.04 + 0.92 * (i + 0.5) / N)).toFixed(2));
      const got = await page.eval(grabInPage, { times, featSrc: featuresOf.toString(), entSrc: entropyGivenC.toString(), covered: world !== 'film' && world !== 'beyond', world, song });
      for (const g of got) { samples.push({ world, song, t: g.t, f: g.f }); (entropies[world] ??= []).push(g.h); frames.push({ world, song, t: g.t, thumb: g.thumb, pattern: g.pattern }); }
      log(`${world} on ${song}: ${got.length} frames, mean H(colour|c) ${r3(got.reduce((s, g) => s + g.h, 0) / got.length)} bits`);
    }
    await page.eval(`app.beyond.off();app.beyond.snap(null)`);
  }
  save('stills.json', JSON.stringify({ samples, entropies }));
  const J = judge(samples, entropies);
  report(J, log);
  save('stills-verdict.json', JSON.stringify(J, null, 1));
  // A blind sheet: one frame per world per song, shuffled by a fixed seed, with letters.
  let seed = 90210; const rnd = n => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed >>> 8) % n; };
  const picks = []; for (const w of worlds) for (const s of songs) { const these = frames.filter(f => f.world === w && f.song === s); if (these.length) { picks.push(these[Math.floor(these.length * 0.25)]); picks.push(these[Math.floor(these.length * 0.65)]); } }
  for (let i = picks.length - 1; i > 0; i--) { const j = rnd(i + 1); [picks[i], picks[j]] = [picks[j], picks[i]]; }
  const items = picks.map((p, i) => ({ ...p, label: `${i + 1}` }));
  save('stills-blind.jpg', await page.eval(sheetInPage, { items, cols: 6, named: false }));
  save('stills-named.jpg', await page.eval(sheetInPage, { items, cols: 6, named: true }));
  save('stills-key.json', JSON.stringify(items.map(({ label, world, song, t, pattern }) => ({ label, world, song, t, pattern })), null, 1));
  const errs = page.logs.filter(l => /\[error\]|\[exception\]/.test(l));
  if (errs.length) log('page errors', errs.slice(0, 4));
};

function report(J, log) {
  log(`Stills: ${J.pass ? 'PASS' : 'FAIL'}. Nearest centroid, leave one out: ${J.accuracy} right over ${J.worlds.length} worlds (want ${LIMITS.accuracy}+). Worst pair: ${J.worst ? `${J.worst.a} and ${J.worst.b} at ${J.worst.confusion}` : 'none'} (limit ${LIMITS.pair}).`);
  log(`H(colour|c): ${JSON.stringify(J.entropy)} (a world wants ${LIMITS.entropy}+)`);
  for (const a of J.worlds) log(`  ${a.padEnd(10)} ${J.worlds.map(b => `${b}:${J.conf[a][b]}`).join(' ')}`);
  for (const f of J.fails) log('  fails: ' + f);
}

// ---------------------------------------------------------------- made-up pictures, to know it can see and can fail
export function selftest() {
  let seed = 4242; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const W = 160, H = 90, bands = (fr, ang, ink) => {
    const d = new Uint8Array(W * H * 4), c = new Uint8Array(W * H * 4), a = Math.cos(ang), b = Math.sin(ang), ph = rnd();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = (x * a + y * b) / W * fr + ph, n = Math.floor(u), on = (u - n) < 0.5, k = (y * W + x) * 4, col = ink(on, n, x, y);
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255; c[k] = c[k + 1] = c[k + 2] = on ? 255 : 0; c[k + 3] = 255;
    }
    return { d, c };
  };
  const inks = [[255, 62, 20], [255, 0, 190], [0, 132, 255], [0, 158, 70]], ladder = [[160, 70, 30], [230, 130, 30], [220, 180, 60], [120, 130, 50], [240, 225, 190]];
  const worlds = {
    film: () => bands(6 + rnd() * 6, rnd() * 3, on => (on ? [255, 255, 255] : [0, 0, 0])),
    plum: () => bands(6 + rnd() * 6, rnd() * 3, on => (on ? [238, 200, 190] : [74, 49, 72])),                    // a recolour: a function of c
    flower: () => bands(5 + rnd() * 4, rnd() * 3, (on, n) => inks[((n + (on ? 0 : 1)) % 4 + 4) % 4]),
    earth: () => bands(3 + rnd() * 2, rnd() * 3, (on, n) => ladder[((n * 2 + (on ? 0 : 1)) % 5 + 5) % 5]),
    dusk: () => { const r = bands(4 + rnd() * 2, rnd() * 3, (on, n, x, y) => { const v = 0.3 + 0.7 * ((x / W + y / H) * 2 % 1); return [255 * v, 120 * v * v, 110 * v]; }); return r; },
  };
  const make = (names, each = 20) => { const s = [], e = {}; for (const w of names) for (let i = 0; i < each; i++) { const { d, c } = worlds[w.replace(/2$/, '')](); s.push({ world: w, f: featuresOf(d, W, H) }); (e[w] ??= []).push(entropyGivenC(d, c, W, H)); } return { s, e }; };
  let ok = true;
  const say = (good, line) => { if (!good) ok = false; console.log(`${good ? 'ok  ' : 'BAD '} ${line}`); };
  const a = make(['film', 'flower', 'earth', 'dusk']), A = judge(a.s, a.e);
  say(A.accuracy >= 0.9 && A.pass, `four different worlds: ${A.accuracy} right, worst pair ${JSON.stringify(A.worst)}, entropy ${JSON.stringify(A.entropy)}${A.fails.length ? ' ' + A.fails.join('; ') : ''}`);
  const b = make(['flower', 'flower2', 'film']), B = judge(b.s, b.e);
  say(!B.pass && B.worst.confusion > 0.1, `one world under two names can't be told apart: worst pair ${JSON.stringify(B.worst)}, fails`);
  const c = make(['plum', 'flower']), C = judge(c.s, c.e);
  say(C.entropy.plum < 0.01 && C.fails.some(f => /plum is a recolour/.test(f)) && C.entropy.flower >= 1, `a recolour is caught: plum ${C.entropy.plum} bits, flower ${C.entropy.flower}`);
  return ok;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2];
  if (arg === '--selftest') process.exit(selftest() ? 0 : 1);
  if (!arg) { console.error('usage: node tests/stills.mjs <stills.json> | --selftest'); process.exit(2); }
  const { samples, entropies } = JSON.parse(readFileSync(arg, 'utf8'));
  report(judge(samples, entropies), console.log);
}
