// Which pairs of patterns a shock can do, as they'd stand at the end of a gesture and the start of the next: node tests/shockpairs.mjs [--list]
// In node, no browser: this only reads numbers. Prints how many, per kind of pair, and with --list every ordered pair as "from to pairs close open W".
import { patterns } from '../src/pattern/library.js';
import { fillSlot, boldRange } from '../src/score/slot.js';
import { SLOT_FLOATS } from '../src/pattern/layout.js';
import { canShock } from '../src/score/xform/shock.js';
const pool = patterns.filter(p => p.pool !== false && !process.argv.includes('--all') || process.argv.includes('--all'));
const slot = (p, u) => { const s = new Float32Array(SLOT_FLOATS), G = { t0: 0, t1: 26, arcEnd: 26, pattern: p, freezeU: null }; G.range = [0, 1]; G.freezeU = u; fillSlot(s, G, 13, p, { phi: 0 }); return s; };
const rows = [], tally = { pairs: 0, none: 0, wide: 0, total: 0 };
for (const a of pool) for (const b of pool) {
  if (a === b) continue;
  tally.total++;
  const f = canShock(slot(a, 0.75), slot(b, 0.25));
  if (!f) { tally.none++; continue; }
  tally.pairs++; if (f.W > 0.45) tally.wide++;
  rows.push({ a: a.id, b: b.id, pairs: f.pairs, close: f.close.length, open: f.open.length, W: +f.W.toFixed(2), ratio: +f.ratio.toFixed(2), worst: +f.worst.toFixed(1) });
}
console.log(`${pool.length} patterns, ${tally.total} ordered pairs: ${tally.pairs} can shock with lines travelling (${tally.wide} of them with a wider front), ${tally.none} can't`);
const per = {}; for (const r of rows) (per[r.a] ??= []).push(r);
const out = pool.map(p => [p.id, per[p.id]?.length ?? 0]).sort((x, y) => x[1] - y[1]);
console.log('how many next patterns each can shock into:', out.map(([id, n]) => `${id} ${n}`).join(', '));
if (process.argv.includes('--list')) for (const r of rows) console.log(r.a, r.b, r.pairs, r.close, r.open, r.W, r.ratio, r.worst);
