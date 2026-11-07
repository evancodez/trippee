// What this world does while it's on a pattern. Each a pure function of the song's hits, starting and ending as the plain pattern. G.moves = [{ id, hits, lead, coast }].
import { OFF } from '../../pattern/layout.js';
import { evalTrack } from '../../score/curves.js';
import { MOVES } from '../../score/moves/index.js';
import { beatClock, surged } from '../../score/moves/surge.js';

const ease = u => { u = Math.min(1, Math.max(0, u)); return u * u * u * (u * (u * 6 - 15) + 10); };
const clockOf = m => (m._clock ??= beatClock(m.hits, { lead: m.lead ?? 0, coast: m.coast ?? 0 }));
const ampAt = (m, t) => { const n = m.hits.length, a = m.hits[0] - (m.lead || 1), b = m.hits[n - 1] + (m.coast || 1); return ease((t - a) / (m.lead || 1)) * ease((b - t) / (m.coast || 1)); };
const POLES = [['blobs.x1', 'blobs.y1', 'blobs.r1'], ['blobs.x2', 'blobs.y2', 'blobs.r2'], ['blobs.x3', 'blobs.y3', 'blobs.r3'], ['p1.x', 'p1.y', 'p1.q'], ['p2.x', 'p2.y', 'p2.q']].map(p => p.map(n => OFF[n]));
const COEFS = ['x', 'y', 'r1', 'l1', 't1'], GHOSTS = [{ l1: 2.4, t1: 6 }, { x: 2.2, y: 1.2 }, { t1: 14 }, { r1: 2.6 }, { x: -1.6, y: 2 }, { l1: -2, t1: 5 }];
const own = {
  // Chorus: the same lines opened a second time, a little detuned, and what you see is what neither of them has: broad fringes where the two agree and disagree. A chorus, in space. Each strong beat slips one against the other.
  chorus: { write(out, { t, m }) {
    const a = ampAt(m, t);
    if (a <= 0) return;
    const s = surged(evalTrack(clockOf(m), t)), de = (m.detune ?? 0.09) * (1 + 0.5 * Math.sin(s * 0.7));
    const k = out[OFF['field.k0']], x = out[OFF['f0.x']], y = out[OFF['f0.y']];
    out[OFF['f2.on']] = 1; out[OFF['f2.d']] = -1 + a; out[OFF['f2.x']] = x * (1 + de); out[OFF['f2.y']] = y * (1 + de);
    out[OFF['f2.r1']] = out[OFF['f0.r1']] * (1 + de); out[OFF['f2.l1']] = out[OFF['f0.l1']] * (1 + de); out[OFF['f2.t1']] = out[OFF['f0.t1']];
    out[OFF['field.k2']] = k * (1 + de);
    out[OFF['f2.ph']] = out[OFF['f0.ph']] * (1 + de) + 0.2 * s;
  } },
  // Lead: one contact takes the frame and passes it on, and the rest make room.
  'pearl.lead': { write(out, { t, m }) {
    const s = surged(evalTrack(clockOf(m), t)), a = ampAt(m, t) * (m.amp ?? 0.5), on = POLES.filter(p => out[p[2]] > 0);
    on.forEach((p, i) => { out[p[2]] *= Math.exp(a * Math.cos(Math.PI * (s / 2 - (2 * i) / on.length))); });
  } },
  // Waltz: everything floats round the middle of the frame, a little further on each hit.
  'pearl.waltz': { write(out, { t, m }) {
    const s = surged(evalTrack(clockOf(m), t)), ang = (m.turn ?? 0.34) * Math.max(0, s + 0.5) * ease((t - m.hits[0] + (m.lead || 1)) / (m.lead || 1)), c = Math.cos(ang), n = Math.sin(ang);
    for (const p of POLES) { const x = out[p[0]], y = out[p[1]]; out[p[0]] = c * x - n * y; out[p[1]] = n * x + c * y; }
  } },
  // Ghost voice: a family with no lines at all, rewritten while it isn't showing. A whole other pattern that exists only in the colour, comes up through the lines and goes, one after another: nothing that isn't colour moves, and the eye can hardly say where it is.
  'pearl.ghost': { write(out, { t, m }) {
    const a = ampAt(m, t);
    if (a <= 0) return;
    const s = evalTrack(clockOf(m), t) / (m.each ?? 4), k = Math.floor(s), u = s - k, v = GHOSTS[((k % GHOSTS.length) + GHOSTS.length) % GHOSTS.length];
    for (const n of COEFS) out[OFF[`f1.${n}`]] = v[n] ?? 0;
    out[OFF['f1.on']] = 1; out[OFF['f1.d']] = -1; out[OFF['f1.ph']] = 0.4 * surged(s * (m.each ?? 4));
    out[OFF['spare.d']] = a * Math.sin(Math.PI * u) ** 2 * (m.amt ?? 300);
  } },
};
// Named as its own: plain 'ghost', 'lead' and 'waltz' are the film's and Flower's, and these went over them for everyone once Pearl had loaded.
for (const k in own) MOVES[k] = { id: k, needs: () => true, ...own[k] };
