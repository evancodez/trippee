// The whole-film check. tests/hash.mjs plays no song, so a film can change without it seeing: this prints each song's generated film and hand cut, a frame a second, and says which seconds changed since a baseline, and by how much.
//
//   node tools/lab.mjs tests/filmprint.mjs --out lab-out/print                                  prints this tree's films and reports against tests/prints/v2.5.1.json
//   TAG=v2.5.1 SAVE=1 node tools/lab.mjs tests/filmprint.mjs --url http://localhost:5300/       prints what that server has and keeps it as tests/prints/<TAG>.json: a new baseline, taken from a tagged tree
//   node tests/filmprint.mjs a.json b.json                                                      no browser: two prints against each other
//   SONGS=mgmt,ppp  only these.  WHICH=cut  only the hand cuts, or auto.  QUERY='?peak=0'  on the url.  BASE=tests/prints/x.json  another baseline.  CUTS_SAME=1  says FAIL if a hand cut has changed.
//
// A print is numbers: each frame's hash and its 16 tile means. No song and no picture goes in it. A hash says whether a frame is byte-for-byte what it was, on this machine; the tiles say by how much it isn't.
// Muted, as every lab run. Hashes are from the same GPU only: a baseline from another machine reads every frame as changed, and then it's the tile numbers that count.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..'), PRINTS = join(ROOT, 'tests', 'prints');
const STEP = 1, SEED = 7;

// ---------------------------------------------------------------- in the page: make the films and print them
const printFilms = async ({ song, which, STEP, SEED }) => {
  const here = u => new URL(u, location.href).href;
  const t00 = performance.now();
  await app.song.load(`/media/${song}.mp3`, { seed: SEED });
  const loadS = (performance.now() - t00) / 1000;
  app.song.pause(); app.ui?.song?.show?.(false);
  const [{ compose }, { rehearse }, { cutFor }, { auditCut }] = await Promise.all(['src/score/compose.js', 'src/music/rehearse.js', 'src/score/cuts/index.js', 'src/score/cut.js'].map(u => import(here(u))));
  const A = app.song.analysis, T = window.trippee, gl = app.R.gl, dur = A.duration, out = { loadS, duration: dur, films: {} };
  app.manual = true; app.governor.enabled = false; app.R.drawScale = 1; app.paused = false;
  const W = T.canvas.width, H = T.canvas.height, px = new Uint8Array(W * H * 4), words = new Uint32Array(px.buffer);
  const hash = () => { let a = 2166136261, b = 5381; for (let i = 0; i < words.length; i++) { const w = words[i]; a = Math.imul(a ^ w, 16777619); b = (Math.imul(b, 33) + w) | 0; } return (a >>> 0).toString(36) + (b >>> 0).toString(36); };
  const tiles = () => { const o = []; for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) { const x0 = (tx * W / 4) | 0, x1 = ((tx + 1) * W / 4) | 0, y0 = (ty * H / 4) | 0, y1 = ((ty + 1) * H / 4) | 0; let s = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) s += px[(y * W + x) * 4 + 1]; o.push(Math.round(s / ((x1 - x0) * (y1 - y0)))); } return o; };
  const r2 = x => +(+x).toFixed(2);
  const print = async (S, r, seconds) => {
    const frames = [];
    let i = 0;
    for (let t = 0.25; t < dur + 2; t += STEP) {
      T.seek(t);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      frames.push({ t: +t.toFixed(2), h: hash(), m: tiles(), id: app.lastFrame?.G?.pattern?.id, k: app.lastFrame?.kind ?? null });
      if (++i % 20 === 0) await new Promise(res => setTimeout(res));
    }
    return {
      seconds, refused: S.refused ?? [], fixes: r?.flash?.fixes ?? [], left: r?.flash?.left ?? [], frames,
      gestures: S.gestures.map(G => ({ t0: r2(G.t0), t1: r2(G.t1), morph: r2(G.morph || 0), id: G.pattern.id, hero: G.hero ?? null, xform: G.xform?.id ?? null, moves: (G.moves || []).map(m => m.id), rise: G.rise ?? null, calm: G.calm ?? null, peak: G.peak?.q ?? null, phiScale: G.phiScale ?? null })),
    };
  };
  if (which !== 'cut') out.films.auto = await print(app.song.score, app.song.rehearsal, app.song.rehearsal?.seconds ?? 0);
  if (which !== 'auto') {
    const cut = await cutFor(A.hash);
    if (cut) {
      const sc = compose(A, SEED, { patterns: app.patterns, aspect: W / H, cut }), t1 = performance.now(), r = await rehearse(sc, Math.min(dur, 1200), () => {}, { lastTry: true });
      auditCut(sc, r);
      app.song.score = sc; app.stage.setScore(sc);
      out.films.cut = await print(sc, r, (performance.now() - t1) / 1000);
    }
  }
  return out;
};

// ---------------------------------------------------------------- the report
const spansOf = (A, B) => {
  const n = Math.min(A.frames.length, B.frames.length), spans = [];
  let same = 0, cur = null;
  for (let i = 0; i < n; i++) {
    const x = A.frames[i], y = B.frames[i];
    if (x.h === y.h) { same++; cur = null; continue; }
    let worst = 0, sum = 0;
    for (let k = 0; k < 16; k++) { const d = Math.abs(x.m[k] - y.m[k]); worst = Math.max(worst, d); sum += d; }
    if (!cur) spans.push(cur = { a: x.t, b: x.t, worst, sum: sum / 16, n: 1, ids: new Set() }); else { cur.b = x.t; cur.worst = Math.max(cur.worst, worst); cur.sum += sum / 16; cur.n++; }
    if (x.id !== y.id) cur.ids.add(`${x.id} > ${y.id}`);
  }
  return { same, n, spans };
};
const line = G => `${G.t0}-${G.t1} morph ${G.morph} ${G.id}${G.hero ? ' hero ' + G.hero : ''}${G.xform ? ' ' + G.xform : ''}${G.moves.length ? ' [' + G.moves.join(',') + ']' : ''}${G.calm ? ' calm' : ''}${G.phiScale ? ' phi ' + G.phiScale : ''}${G.peak != null ? ' q' + G.peak : ''}`;
export function report(was, now, log = console.log, { cutsSame = false } = {}) {
  let changedCut = 0;
  for (const song of Object.keys(now.songs)) for (const which of Object.keys(now.songs[song].films)) {
    const A = was.songs[song]?.films?.[which], B = now.songs[song].films[which];
    if (!A) { log(`${song} ${which}: not in the baseline`); continue; }
    const { same, n, spans } = spansOf(A, B);
    log(`PRINT ${song} ${which}: ${same} of ${n} seconds byte-identical to ${was.tag}; ready ${was.songs[song].loadS.toFixed(1)} s then, ${now.songs[song].loadS.toFixed(1)} s now`);
    for (const s of spans) log(`  ${s.a}-${s.b} s changed: tiles by ${(s.sum / s.n).toFixed(1)} on average, ${s.worst} at most, of 255${s.ids.size ? `; now a different pattern (${[...s.ids].slice(0, 2).join('; ')})` : ''}`);
    const la = A.gestures.map(line), lb = B.gestures.map(line), sa = new Set(la), sb = new Set(lb), gone = la.filter(x => !sb.has(x)), added = lb.filter(x => !sa.has(x));
    if (gone.length || added.length) { log(`  gestures ${la.length} then, ${lb.length} now`); for (const g of gone) log(`   - ${g}`); for (const g of added) log(`   + ${g}`); }
    if (JSON.stringify(A.fixes) !== JSON.stringify(B.fixes)) { log(`  fixes then ${JSON.stringify(A.fixes)}`); log(`  fixes now  ${JSON.stringify(B.fixes)}`); }
    if (JSON.stringify(A.left) !== JSON.stringify(B.left)) log(`  flashes left: then ${JSON.stringify(A.left)}, now ${JSON.stringify(B.left)}`);
    if (which === 'cut' && spans.length) changedCut++;
  }
  if (cutsSame && changedCut) log(`FAIL ${changedCut} hand cuts changed since ${was.tag}`);
  return changedCut;
}

// ---------------------------------------------------------------- run
export default async ({ page, log, save, sleep, out }) => {
  const songs = (process.env.SONGS || 'mgmt,ppp,wildflower,disclosure').split(','), which = process.env.WHICH || 'both', tag = process.env.TAG || 'now', url = (await page.eval('location.href')) + (process.env.QUERY || '');
  const print = { tag, when: new Date().toISOString(), url, songs: {} };
  for (const song of songs) {
    await page.goto(url);
    for (let i = 0; i < 240; i++) { let ok = false; try { ok = await page.eval('typeof window.trippee !== "undefined" && window.trippee.ready === true'); } catch { /* still navigating */ } if (ok) break; await sleep(250); }
    const t0 = Date.now();
    print.songs[song] = await page.eval(printFilms, { song, which, STEP, SEED });
    log(`${song}: ${Object.keys(print.songs[song].films).join(' and ')}, ready in ${print.songs[song].loadS.toFixed(1)} s, printed in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    const errs = page.logs.filter(l => /^\[(error|exception)\]/.test(l));
    if (errs.length) log(`FAIL page errors on ${song}: ${errs.at(-1).slice(0, 300)}`);
  }
  if (process.env.SAVE) {
    mkdirSync(PRINTS, { recursive: true });
    const file = join(PRINTS, `${tag}.json`);
    writeFileSync(file, JSON.stringify(print));
    log(`saved ${file}`);
    return;
  }
  save(`${tag}.json`, JSON.stringify(print));
  const base = process.env.BASE || join(PRINTS, 'v2.5.1.json');
  if (!existsSync(base)) { log(`FAIL no baseline at ${base}`); return; }
  report(JSON.parse(readFileSync(base, 'utf8')), print, log, { cutsSame: !!process.env.CUTS_SAME });
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.length >= 4) {
  report(JSON.parse(readFileSync(process.argv[2], 'utf8')), JSON.parse(readFileSync(process.argv[3], 'utf8')));
}
