// What this world does while it's on a pattern. Pure functions of the song's hits. Each starts and ends as the plain pattern. G.moves = [{ id, hits, lead, coast }]. A hit is where it goes fastest, and it never stops.
import { OFF } from '../../pattern/layout.js';
import { evalTrack } from '../../score/curves.js';
import { MOVES } from '../../score/moves/index.js';
import { beatClock, surged } from '../../score/moves/surge.js';

const ease = u => { u = Math.min(1, Math.max(0, u)); return u * u * u * (u * (u * 6 - 15) + 10); };
const clockOf = m => (m._clock ??= beatClock(m.hits, { lead: m.lead ?? 0, coast: m.coast ?? 0 }));
const ampAt = (m, t) => { const n = m.hits.length, a = m.hits[0] - (m.lead || 1), b = m.hits[n - 1] + (m.coast || 1); return ease((t - a) / (m.lead || 1)) * ease((b - t) / (m.coast || 1)); };
const swing = s => { const k = Math.floor(s); return (((k % 2) + 2) % 2 ? -1 : 1) * Math.sin(Math.PI * (s - k)); };
const POLES = [['blobs.x1', 'blobs.y1', 'blobs.r1'], ['blobs.x2', 'blobs.y2', 'blobs.r2'], ['blobs.x3', 'blobs.y3', 'blobs.r3'], ['p1.x', 'p1.y', 'p1.q'], ['p2.x', 'p2.y', 'p2.q']].map(p => p.map(n => OFF[n]));

const own = {
  // Upstroke: a stripe's a half-open check. A second family opens through the lines on the backbeat, stripes to checks, and shuts whole on the downbeat. Half the frame's always one way up, so there's no flash in it, and it's a groove.
  upstroke: { write(out, { t, m }) {
    const a = ampAt(m, t);
    if (a <= 0) return;
    const s = evalTrack(clockOf(m), t), u = s - Math.floor(s), open = Math.sin(Math.PI * u) ** 2;
    out[OFF['f2.on']] = 1; out[OFF['f2.x']] = m.fx ?? 2.3; out[OFF['f2.y']] = m.fy ?? 0; out[OFF['f2.d']] = -1 + a * open;
    out[OFF['f2.ph']] = 0.25 * Math.floor(s);
  } },
  // Windmill: Townshend's arm. The whole sheet goes a long way round on each strong beat, and hangs between.
  windmill: { write(out, { t, m }) { const s = surged(evalTrack(clockOf(m), t)), a = ease((t - m.hits[0] + (m.lead || 1)) / (m.lead || 1)), z = ease((m.hits.at(-1) + (m.coast || 1) - t) / (m.coast || 1)); out[OFF.rot] += (m.turn ?? 0.32) * a * s * (m.way ?? 1) * (z * 0 + 1); } },
  // Headbang: the sheet drops on the beat and comes back up slowly. A long way down, a long way back, and no shake in it.
  headbang: { write(out, { t, m }) {
    const s = evalTrack(clockOf(m), t), u = s - Math.floor(s), a = ampAt(m, t), v = 0.5 - 0.5 * Math.cos(2 * Math.PI * (u < 0.28 ? 0.5 * u / 0.28 : 0.5 + 0.5 * (u - 0.28) / 0.72));
    out[OFF.ty] += (m.size ?? 0.16) * a * (v - 0.5) * 2 * (out[OFF.scale] || 1);
    out[OFF.scale] *= Math.exp((m.push ?? 0.05) * a * v);
  } },
  // Crank: the depth of the edges goes up in steps with the hits, and rolls off and starts again.
  crank: { write(out, { t, m }) { const s = evalTrack(clockOf(m), t), a = ampAt(m, t), k = ((Math.floor(s) % 4) + 4) % 4; out[OFF['field.ph']] *= 1 + a * (0.25 + (m.amp ?? 0.8) * (k + (s - Math.floor(s))) / 4); } },
  // Lead: one cone takes the frame and passes it on.
  lead: { write(out, { t, m }) {
    const s = surged(evalTrack(clockOf(m), t)), a = ampAt(m, t) * (m.amp ?? 0.5), on = POLES.filter(p => out[p[2]] > 0);
    on.forEach((p, i) => { out[p[2]] *= Math.exp(a * Math.cos(Math.PI * (s / 2 - (2 * i) / on.length))); });
  } },
  // Rotator: every cone turns the sheet about itself, as a Leslie does a sound. On the hit it's fastest.
  rotator: { write(out, { t, m }) { const s = surged(evalTrack(clockOf(m), t)), a = ampAt(m, t), ang = (m.turn ?? 0.6) * s * a; for (const p of POLES) { if (out[p[2]] <= 0) continue; const x = out[p[0]], y = out[p[1]], c = Math.cos(ang), n = Math.sin(ang); out[p[0]] = c * x - n * y; out[p[1]] = n * x + c * y; } } },
};
for (const k in own) MOVES[k] = { id: k, needs: () => true, ...own[k] };
export const OWN = Object.keys(own);
