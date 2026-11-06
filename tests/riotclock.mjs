// Does a riot move's clock do what it says, on all four songs? In node, no browser, no sound: on every hit s is whole; the fastest frame is on the hit, to within a frame at 60 fps, but for one or two hits where the gap more than doubles, because a rest took some out; it never stops or goes back between hits.
//   node tests/riotclock.mjs
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compose } from '../src/score/compose.js';
import { patterns } from '../src/pattern/library.js';
import { beatClock, hitsFor, surged, PEAK } from '../src/score/moves/surge.js';
import { evalTrack } from '../src/score/curves.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let bad = 0;
const check = (ok, what) => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); };
for (const song of ['ppp', 'wildflower', 'disclosure', 'mgmt']) {
  const A = JSON.parse(readFileSync(join(ROOT, 'lab-out/form', `${song}.json`))), score = compose(A, 7, { patterns, aspect: 16 / 9 });
  for (const spec of ['strong', 'half', 'bar']) {
    const hits = hitsFor(spec, { score, A }), K = beatClock(hits, { lead: 2, coast: 4 }), at = t => surged(evalTrack(K, t));
    let whole = 0, offFrames = 0, stops = Infinity, back = 0; const off = [];
    hits.forEach((h, i) => {
      whole = Math.max(whole, Math.abs(at(h) - i));
      const prev = hits[i - 1], next = hits[i + 1];
      if (prev == null || next == null) return;
      // Sampled on a frame clock that doesn't line up with the hit: the worst case
      let best = -1, bt = 0;
      for (let t = h - (h - prev) * 0.45; t <= h + (next - h) * 0.45; t += 1 / 240) { const v = (at(t + 1 / 480) - at(t - 1 / 480)) * 240; if (v > best) { best = v; bt = t; } if (v < stops) stops = v; if (v < 0) back++; }
      if (Math.abs(bt - h) * 60 > 1) off.push(`${h.toFixed(1)} (gaps ${(h - prev).toFixed(2)}, ${(next - h).toFixed(2)})`); else offFrames = Math.max(offFrames, Math.abs(bt - h) * 60);
    });
    const gaps = hits.slice(1).map((t, i) => t - hits[i]).sort((a, b) => a - b);
    check(whole < 1e-6 && off.length <= 0.02 * hits.length && back === 0 && stops > 0, `${song} ${spec}: ${hits.length} hits, every ${gaps[gaps.length >> 1].toFixed(2)} s; furthest from whole on a hit ${whole.toExponential(1)}; fastest frame within ${offFrames.toFixed(2)} frames${off.length ? ', but not where the rhythm more than doubles: ' + off.join(', ') : ''}; slowest ${stops.toFixed(3)} steps/s, going back ${back}`);
  }
}
console.log(bad ? `${bad} failed` : 'all well', `(peak ${PEAK})`);
process.exit(bad ? 1 : 0);
