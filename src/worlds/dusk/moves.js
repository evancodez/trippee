// What Dusk does while it's on a pattern, besides what the sheet does. Each is a pure function of the song's hits, starts and ends as the plain pattern, and is at its fastest on a hit.
import { OFF } from '../../pattern/layout.js';
import { evalTrack } from '../../score/curves.js';
import { MOVES } from '../../score/moves/index.js';
import { beatClock, surged } from '../../score/moves/surge.js';

const ease = u => { u = Math.min(1, Math.max(0, u)); return u * u * u * (u * (u * 6 - 15) + 10); };
const clockOf = m => (m._clock ??= beatClock(m.hits, { lead: m.lead ?? 0, coast: m.coast ?? 0 }));
const ampAt = (m, t) => { const n = m.hits.length, a = m.hits[0] - (m.lead || 1), b = m.hits[n - 1] + (m.coast || 1); return ease((t - a) / (m.lead || 1)) * ease((b - t) / (m.coast || 1)); };
const swing = s => { const k = Math.floor(s); return (((k % 2) + 2) % 2 ? -1 : 1) * Math.sin(Math.PI * (s - k)); };

const own = {
  // A gust: a long wave goes through the whole sheet along the way the train's going, one a bar, like wind through wheat.
  'dusk.gust': { write(out, { t, m }) { const a = ampAt(m, t), s = evalTrack(clockOf(m), t); if (out[OFF['bend2.a']] !== 0) return; out[OFF['bend2.a']] = 0.09 * a; out[OFF['bend2.f']] = 1.7; out[OFF['bend2.ang']] = 0.12; out[OFF['bend2.ph']] = -2 * Math.PI * surged(s) * 0.5; } },
  // A sway: the sheet leans one way and the other, through upright on the hit.
  'dusk.sway': { write(out, { t, m }) { const a = ampAt(m, t), s = evalTrack(clockOf(m), t); if (out[OFF['bend1.a']] !== 0) return; out[OFF['bend1.a']] = 0.07 * a * swing(s); out[OFF['bend1.f']] = 1.1; out[OFF['bend1.ang']] = 0; out[OFF['bend1.ph']] = 0.6; } },
  // A breath: the land rises and falls together, and goes back to where it was.
  'dusk.breath': { write(out, { t, m }) { const a = ampAt(m, t), s = evalTrack(clockOf(m), t), v = 0.5 - 0.5 * Math.cos(Math.PI * s); out[OFF.scale] *= Math.exp(0.09 * a * v); out[OFF.ty] += 0.06 * a * v; } },
};
for (const k in own) MOVES[k] = { id: k, needs: () => true, ...own[k] };
