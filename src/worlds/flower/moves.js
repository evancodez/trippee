// What this world does while it's on a pattern, besides what the film's moves do. Each is a pure function of the song's hits, and each starts and ends as the plain pattern. G.moves = [{ id, hits: [...], lead, coast }]. A hit is where it goes fastest, and it never stops.
import { OFF } from '../../pattern/layout.js';
import { evalTrack } from '../../score/curves.js';
import { MOVES } from '../../score/moves/index.js';
import { beatClock, surged } from '../../score/moves/surge.js';

const ease = u => { u = Math.min(1, Math.max(0, u)); return u * u * u * (u * (u * 6 - 15) + 10); };
const clockOf = m => (m._clock ??= beatClock(m.hits, { lead: m.lead ?? 0, coast: m.coast ?? 0 }));
const ampAt = (m, t) => { const n = m.hits.length, a = m.hits[0] - (m.lead || 1), b = m.hits[n - 1] + (m.coast || 1); return ease((t - a) / (m.lead || 1)) * ease((b - t) / (m.coast || 1)); };
// Crosses 0 on the whole numbers, going the other way each time.
const swing = s => { const k = Math.floor(s); return (((k % 2) + 2) % 2 ? -1 : 1) * Math.sin(Math.PI * (s - k)); };
const POLES = [['blobs.x1', 'blobs.y1', 'blobs.r1'], ['blobs.x2', 'blobs.y2', 'blobs.r2'], ['blobs.x3', 'blobs.y3', 'blobs.r3'], ['p1.x', 'p1.y', 'p1.q'], ['p2.x', 'p2.y', 'p2.q']].map(p => p.map(n => OFF[n]));

const own = {
  // Wind: the petals wind up into a pinwheel one way and straighten through a daisy on the beat, and wind up the other way.
  wind: { write(out, { t, m }) { out[OFF['field.scale']] += (m.amp ?? 2.4) * ampAt(m, t) * swing(evalTrack(clockOf(m), t)); } },
  // Pump: every flower shuts to a circle and opens again, whatever it is: a heart goes round and comes back a heart. Round on the hit.
  pump: { write(out, { t, m }) { const s = evalTrack(clockOf(m), t), v = Math.abs(swing(s)); out[OFF['field.ph']] *= 1 - ampAt(m, t) * (m.amp ?? 0.8) * (1 - v) * (1 - v); } },
  // Lead: one flower takes the frame and passes it on. The rest make room.
  lead: { write(out, { t, m }) {
    const s = surged(evalTrack(clockOf(m), t)), a = ampAt(m, t) * (m.amp ?? 0.42), on = POLES.filter(p => out[p[2]] > 0);
    on.forEach((p, i) => { out[p[2]] *= Math.exp(a * Math.cos(Math.PI * (s / 2 - (2 * i) / on.length))); });
  } },
  // Waltz: all the flowers go round each other, about the middle of the frame, a little further on each hit.
  waltz: { write(out, { t, m }) {
    const s = surged(evalTrack(clockOf(m), t)), ang = (m.turn ?? 0.42) * Math.max(0, s + 0.5) * ease((t - m.hits[0] + (m.lead || 1)) / (m.lead || 1)), c = Math.cos(ang), n = Math.sin(ang);
    for (const p of POLES) { const x = out[p[0]], y = out[p[1]]; out[p[0]] = c * x - n * y; out[p[1]] = n * x + c * y; }
  } },
  // Beads: bead strings come through every other band, on the petals and in between, run round the flowers and go again. On the strong beats. Anything with flowers can wear it.
  beads: { write(out, { t, m }) {
    const a = ampAt(m, t);
    if (a <= 0) return;
    const s = evalTrack(clockOf(m), t);
    out[OFF['f1.on']] = 1; out[OFF['f1.y']] = 0.001; out[OFF['f1.d']] = a - 1;        // closed at the ends (-1, nothing at all to the XOR), half and half in the middle
    out[OFF['f1.ph']] = (m.step ?? 0.5) * surged(s); out[OFF['ribbon.a']] = m.count ?? 14; out[OFF['blobs.k']] = m.every ?? 2;
  } },
};
for (const k in own) MOVES[k] = { id: k, needs: () => true, ...own[k] };
export const BARE = Object.keys(own);
