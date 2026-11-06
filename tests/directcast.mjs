// What the director casts, in node, no browser: every song and many takes. One hero at a time, four kinds, one by 90 s, never twice running; takes and songs differ.
//   node tests/directcast.mjs       SEEDS=1,2,3 V=1      Uses lab-out/form/<song>.json from tests/form-dump.mjs.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compose } from '../src/score/compose.js';
import { patterns } from '../src/pattern/library.js';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const seeds = (process.env.SEEDS || Array.from({ length: 16 }, (_, i) => i + 1).join(',')).split(',').map(Number);
let bad = 0;
const fail = m => { bad++; console.log('FAIL', m); };
for (const name of ['ppp', 'wildflower', 'disclosure', 'mgmt']) {
  const A = JSON.parse(readFileSync(join(ROOT, 'lab-out/form', `${name}.json`)));
  const films = new Set(), counts = {};
  for (const seed of seeds) {
    const S = compose(A, seed, { patterns, aspect: 16 / 9 }), g = S.gestures.slice(0, -1);
    const heroes = []; for (const G of S.gestures) for (const k of [G.hero, G.xform?.id, ...(G.moves || []).map(m => m.id)].filter(Boolean)) heroes.push({ t: G.t0, k });
    const names = [...new Set(heroes.map(h => h.k))], twice = heroes.filter((h, i) => i && heroes[i - 1].k === h.k);
    if (names.length < 4) fail(`${name} ${seed}: only ${names.length} kinds: ${names}`);
    if (twice.length) fail(`${name} ${seed}: twice running ${twice.map(h => h.k + '@' + h.t.toFixed(0))}`);
    if (!heroes.length || heroes[0].t > 90) fail(`${name} ${seed}: first hero at ${heroes[0]?.t}`);
    for (const k of ['countdown', 'star']) if (!names.includes(k)) fail(`${name} ${seed}: no ${k}: ${S.stats.cast}`);
    if (!names.includes('coin')) console.log(`note ${name} ${seed}: no coin: ${S.stats.cast}`);
    // Gestures end to end
    for (let i = 1; i < g.length; i++) if (Math.abs(g[i].t0 - g[i - 1].t1) > 1e-6) fail(`${name} ${seed}: gap at ${g[i].t0}`);
    for (const G of g) if (G.morph > G.t1 - G.t0) fail(`${name} ${seed}: morph longer than ${G.pattern.id} at ${G.t0}`);
    // No fall on a rest
    for (const G of g) if (G.xform?.id === 'fall' && S.react.M.rests.some(r => Math.abs(S.time(r.a) - G.t1) < 0.05)) fail(`${name} ${seed}: a fall on a rest at ${G.t1}`);
    const key = S.cast.map(h => h.kind + h.id).join(' ');
    films.add(key);
    for (const h of S.cast) counts[h.kind] = (counts[h.kind] || 0) + 1;
    if (process.env.V) console.log(`${name} ${seed}: ${S.stats.cast}`);
  }
  console.log(`${name}: ${films.size} different films of ${seeds.length}. Per film: ${Object.entries(counts).map(([k, v]) => `${k} ${(v / seeds.length).toFixed(1)}`).join(', ')}`);
  if (films.size < 0.7 * seeds.length) fail(`${name}: only ${films.size} different films`);
}
console.log(bad ? `${bad} failures` : 'all good');
