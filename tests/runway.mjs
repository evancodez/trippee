// A seek doesn't take anything away from a film. In node, no browser: compose each song, seek to every place within 20 s before each thing the director has put on a gesture, and see what stage._clearRunway leaves.
//   node tests/runway.mjs       OLD=1 runs the old rule (merge whatever starts within 12 s) over the same seeks, to compare.   SEEDS=1,2,3,7
// Pass, for every seek: the gesture the flight lands on is the one it set out for, nothing transforms before it lands, what's still ahead has lost nothing, and a seek back to the start puts every gesture back as it was.
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compose } from '../src/score/compose.js';
import { patterns } from '../src/pattern/library.js';
import { Stage } from '../src/stage.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SONGS = ['ppp', 'wildflower', 'disclosure', 'mgmt'], seeds = (process.env.SEEDS || '7').split(',').map(Number), DUR = 6, OLD = !!process.env.OLD;
const load = name => { for (const f of [join(ROOT, 'lab-out/form', `${name}.json`), join(tmpdir(), 'trippee-understand', `${name}.json`)]) if (existsSync(f)) return JSON.parse(readFileSync(f)); throw new Error(`no analysis for ${name}: run tests/form-dump.mjs or tests/understand.mjs first`); };

// What it did before: anything that starts within 12 s is merged in.
function oldRunway(stage, t, dur, sc) {
  const g = sc.gestures, i = g.indexOf(stage.current(t)), cur = g[i];
  while (g[i + 1] && cur.t1 < t + dur + 6) { const n = g[i + 1]; cur.t1 = n.t1; cur.morph = n.morph; g.splice(i + 1, 1); delete cur.plan; }
  if (cur.morph && cur.t1 - cur.morph < t + dur) { cur.morph = Math.max(0, cur.t1 - (t + dur)); delete cur.plan; }
}
const wornIn = G => [G.hero, G.xform?.id, ...(G.moves ?? []).map(m => m.id)].filter(Boolean);
const worn = G => wornIn(G).length > 0;
const print = g => g.map(G => [G.t0, G.t1, G.morph ?? 0].map(v => v.toFixed(3)).concat(G.pattern.id, wornIn(G).join('+')).join(' ')).join('\n');

let failed = 0;
for (const name of SONGS) for (const seed of seeds) {
  const A = load(name), film = compose(A, seed, { patterns, aspect: 16 / 9 }), base = print(film.gestures);
  const marks = film.gestures.filter(worn), seeks = [];
  for (const G of marks) for (let d = 1; d <= 20; d += 1) for (const at of [G.t0, G.t1 - (G.morph || 0), G.t1]) if (at - d > 0) seeks.push(+(at - d).toFixed(2));
  let lost = 0, wrongLanding = 0, early = 0, notBack = 0, flown = 0, merged = 0;
  for (const t of [...new Set(seeks)]) {
    const stage = new Stage(7), g0 = film.gestures.map(G => ({ ...G })), sc = { ...film, gestures: g0 };
    stage.score = sc;
    const G0 = stage.current(t), n0 = g0.length;
    if (OLD) oldRunway(stage, t, DUR, sc); else stage._clearRunway(t, DUR, sc);
    const g = sc.gestures, land = stage.current(t);
    // Anything that was going to go on after this flight lands has to still be there, on the same gesture and ending when it did.
    const ahead = film.gestures.filter(x => worn(x) && x.t1 - (x.morph || 0) >= t + DUR);
    if (ahead.some(x => !g.some(y => y.pattern === x.pattern && wornIn(y).join() === wornIn(x).join() && Math.abs(y.t1 - x.t1) < 1e-6 && (y.morph || 0) === (x.morph || 0)))) lost++;
    if (stage.current(t + DUR - 0.01) !== land) wrongLanding++;
    if (land.morph && land.t1 - land.morph < t + DUR - 1e-6 && g[g.indexOf(land) + 1]) early++;
    if (sc.flownPast) flown++;
    if (g.length < n0) merged++;
    if (!OLD) { stage._clearRunway(0.01, 0.01, sc); const back = film.gestures.filter(worn).every(x => g.some(y => y.pattern === x.pattern && worn(y) && Math.abs(y.t0 - x.t0) < 1e-6 && Math.abs(y.t1 - x.t1) < 1e-6)); if (!back) notBack++; }
  }
  const n = new Set(seeks).size, ok = !lost && !wrongLanding && !early && !notBack;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} seed ${seed}: ${marks.length} gestures wearing something, ${n} seeks: ${lost} lost something still ahead, ${wrongLanding} changed gesture in flight, ${early} transformed before landing, ${notBack} not put back; ${flown} flew past one, ${merged} merged plain ones${OLD ? ' (old rule)' : ''}`);
  if (print(film.gestures) !== base) { failed++; console.log(`FAIL ${name}: the film itself changed`); }
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exitCode = failed && !OLD ? 1 : 0;
