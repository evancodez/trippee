// Does the film's form follow the song's? In node, no browser: compose all four songs, with the form and the spread on and off, and say what each does.
//
//   node tests/form.mjs                  uses lab-out/form/<song>.json if tests/form-dump.mjs has saved them (the browser's own analysis), else the node analyses tests/understand.mjs keeps
//   VERBOSE=1 node tests/form.mjs        every gesture
//   SEEDS=1,2,3,7 node tests/form.mjs    other takes
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compose, lookOf } from '../src/score/compose.js';
import { patterns } from '../src/pattern/library.js';
import { understand } from '../src/music/understand.js';
import { flags, setFlag } from '../src/score/flags.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SONGS = ['ppp', 'wildflower', 'disclosure', 'mgmt'];
const seeds = (process.env.SEEDS || '7').split(',').map(Number);
let failed = 0;
const check = (ok, what) => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); };
const pct = x => `${Math.round(x * 100)}%`;

const load = name => {
  for (const f of [join(ROOT, 'lab-out/form', `${name}.json`), join(tmpdir(), 'trippee-understand', `${name}.json`)]) if (existsSync(f)) return JSON.parse(readFileSync(f));
  throw new Error(`no analysis for ${name}: run tests/form-dump.mjs or tests/understand.mjs first`);
};
const longestRun = (G, key) => { let best = 0, run = 0, last = null; for (const g of G) { const k = key(g.pattern); run = k === last ? run + (g.t1 - g.t0) : g.t1 - g.t0; last = k; best = Math.max(best, run); } return best; };
const shares = (G, key, total) => { const o = {}; for (const g of G) { const k = key(g.pattern); o[k] = (o[k] || 0) + (g.t1 - g.t0) / total; } return o; };
const top = o => Math.max(...Object.values(o));
const show = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v)}`).join(' ');

for (const name of SONGS) {
  const A = load(name), M = understand(A);
  console.log(`\n${name}: ${A.duration.toFixed(0)} s, home ${M.home.name}, breath ${M.breath.seconds.toFixed(2)} s (${M.breath.bars} bars from bar ${M.breath.bar0}), ${M.rests.length} rests, arrivals ${M.arrivals(0.3).map(p => `${p.t.toFixed(1)}(${p.a.toFixed(2)})`).join(' ')}`);
  for (const seed of seeds) {
    setFlag('form', false); setFlag('spread', false);
    const old = compose(A, seed, { patterns, aspect: 16 / 9 });
    setFlag('form', true); setFlag('spread', true);
    const S = compose(A, seed, { patterns, aspect: 16 / 9 });
    const G = S.gestures.slice(0, -1), OG = old.gestures.slice(0, -1), total = G.at(-1).t1;
    const L = S.landings.slice(0, -1);
    if (process.env.VERBOSE) for (const g of G) console.log(`  ${g.t0.toFixed(1).padStart(6)} ${g.t1.toFixed(1).padStart(6)} ${(g.t1 - g.t0).toFixed(1).padStart(5)} ${g.pattern.id.padEnd(22)} ${lookOf(g.pattern).padEnd(8)} ${g.label} ${g.replayOf != null ? 'r' + g.replayOf : '  '} ${g.kindOut.padEnd(6)} morph ${g.morph.toFixed(1).padStart(4)} a ${(g.arrival ?? 0).toFixed(2)} rise ${g.rise ?? '-'}`);
    console.log(` seed ${seed}. gestures ${OG.length} -> ${G.length}, median ${old.stats.medianLen} -> ${S.stats.medianLen} s, shortest ${old.stats.minLen} -> ${S.stats.minLen}, boundaries ${old.stats.boundaryLanded} -> ${S.stats.boundaryLanded}, on a breath ${S.stats.onBreath}, arrivals ${S.stats.arrivalsLanded}, rests ${S.stats.restsLanded}`);
    const fO = shares(OG, p => p.family, total), fN = shares(G, p => p.family, total), lO = shares(OG, lookOf, total), lN = shares(G, lookOf, total);
    console.log(`  families before ${show(fO)}\n  families now    ${show(fN)}\n  looks before    ${show(lO)}\n  looks now       ${show(lN)}\n  longest in one family ${longestRun(OG, p => p.family).toFixed(0)} -> ${longestRun(G, p => p.family).toFixed(0)} s, look ${longestRun(OG, lookOf).toFixed(0)} -> ${longestRun(G, lookOf).toFixed(0)} s`);

    // A landing at a rest can cost a section change too close after it to fit a gesture in
    check(+S.stats.boundaryLanded.split('/')[0] >= +old.stats.boundaryLanded.split('/')[0] - S.landings.filter(l => l.rest).length, `${name}: boundaries still landed (${old.stats.boundaryLanded} -> ${S.stats.boundaryLanded}, ${S.landings.filter(l => l.rest).length} at rests)`);
    // Two arrivals closer than a gesture can't both be landed on: the second one counts as covered if a landing is close enough to have crowded it out.
    check(M.arrivals(0.5).every(p => S.landings.some(l => Math.abs(l.B - p.t) < Math.max(1.5 * M.bar, M.arrivals(0.5).some(q => q !== p && Math.abs(q.t - p.t) < 12) ? 6.5 : 0))), `${name}: every arrival of .5 or more has a landing within a bar and a half`);
    // A section boundary or an arrival lands where it is. Everything else is free to land anywhere, and should choose a breath.
    const free = L.filter(l => !A.segments.some(x => Math.abs(x.t0 - l.B) < 2 * M.beat) && !M.arrivals(0.3).some(p => Math.abs(p.t - l.B) < 0.3) && !l.rest);
    check(free.filter(l => l.breath).length >= 0.6 * free.length, `${name}: landings with nothing else to land on fall on a breath (${free.filter(l => l.breath).length}/${free.length}; all landings ${L.filter(l => l.breath).length}/${L.length})`);
    check(M.rests.every(r => S.landings.some(l => l.rest?.a === r.a) || !S.landings.some(l => Math.abs(l.B - r.a) < 1.5 * M.bar)), `${name}: no landing is left near a rest except on it`);
    // No morph starts while the clock isn't the song's
    const bad = (S.time.windows ?? []).flatMap(w => G.filter(g => { const t0 = g.t1 - g.morph; return t0 > w.from && t0 < w.paid; }).map(g => `${g.pattern.id} ${(g.t1 - g.morph).toFixed(1)}`));
    check(!bad.length, `${name}: no morph starts before the lag is paid${bad.length ? ': ' + bad.join(', ') : ''}`);
    check(G.every(g => g.morph >= 5.4 && g.morph <= 0.75 * (g.t1 - g.t0) + 0.01), `${name}: every morph leaves the gesture its body`);
    check(top(fN) <= 0.45, `${name}: no family has more than 45% of the film (${pct(top(fN))}, was ${pct(top(fO))})`);
    check(Object.keys(fN).length >= 4, `${name}: at least 4 families (${Object.keys(fN).length}, was ${Object.keys(fO).length})`);
    check(longestRun(G, p => p.family) <= 62, `${name}: no more than a minute in one family (${longestRun(G, p => p.family).toFixed(0)} s)`);
    // What breathes on its own clock is on the breath: a sine at its whitest, a Snap crossing
    const off = G.filter(g => g.pattern.drive && /snap/.test(g.pattern.id)).flatMap(g => M.breath.t.filter(t => t > g.t0 && t < g.t1 - g.morph).map(t => { const x = S.phi(t, g), r = Math.abs(x - Math.round(x)); return r; }));
    check(!off.length || Math.max(...off) < 0.08, `${name}: a Snap crosses on the breath${off.length ? ` (${off.length} crossings, worst ${Math.max(...off).toFixed(3)} of a cycle)` : ' (none in this film)'}`);
    // Same input, same film
    const again = compose(A, seed, { patterns, aspect: 16 / 9 });
    check(JSON.stringify(again.landings) === JSON.stringify(S.landings) && again.gestures.every((g, i) => g.pattern === S.gestures[i].pattern), `${name}: the same again`);
  }
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exitCode = failed ? 1 : 0;
