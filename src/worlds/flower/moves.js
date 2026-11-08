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

const COEFS = ['x', 'y', 'r1', 'l1', 't1'], VOICES = [{ x: 1.55, y: 1.55 }, { x: 1.55, y: -1.55 }, { t1: 10 }, { x: 2.2 }, { l1: 1.6, t1: 8 }];
const own = {
  // The film's star sphere, on anything in this world. It marks a slot's field.b for its own reasons, and here that number says what the flowers are.
  ball: { write(out, ctx) { const kinds = out[OFF['field.b']]; MOVES.star.write(out, ctx); out[OFF['field.b']] = kinds; } },
  // Wind: the petals wind up into a pinwheel one way and straighten through a daisy on the beat, and wind up the other way.
  wind: { write(out, { t, m }) { out[OFF['field.scale']] += (m.amp ?? 1.7) * ampAt(m, t) * swing(evalTrack(clockOf(m), t)); } },
  // Pump: every flower shuts to a circle and opens again, whatever it is: a heart goes round and comes back a heart. Round on the hit.
  pump: { write(out, { t, m }) { const s = evalTrack(clockOf(m), t), v = Math.abs(swing(s)); out[OFF['field.ph']] *= 1 - ampAt(m, t) * (m.amp ?? 0.6) * (1 - v) * (1 - v); } },
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
  // Turnover: on wallpaper, every other tile slides half a ring on the hit, so what was on one side of each line is on the other, and back. It's Op, and there's no flash in it: half the tiles go one way at a time, and the frame stays half and half.
  turnover: { write(out, { t, m }) { const s = surged(evalTrack(clockOf(m), t)), a = ampAt(m, t); out[OFF['blobs.t']] = out[OFF['blobs.t']] * (1 - a) + a * (s - 2 * Math.floor(s / 2) < 1 ? s - Math.floor(s) : 1 - (s - Math.floor(s))); } },
  // Voices: a relay, in this world's way. The rings stay, because they carry the inks. A third family is rewritten while it's shut, and opens through them as one thing after another: a diagonal, the other diagonal, spokes, upright. Each one is a different picture that nobody drew, and it costs nothing, because shut it's nothing at all to the XOR.
  voices: { write(out, { t, m }) {
    const a = ampAt(m, t);
    if (a <= 0) return;
    const s = evalTrack(clockOf(m), t) / (m.each ?? 2), k = Math.floor(s), u = s - k, freeP1 = out[OFF['p1.q']] <= 0, V = (freeP1 ? VOICES : VOICES.filter(v => !v.t1)), v = V[((k % V.length) + V.length) % V.length];
    for (const n of COEFS) out[OFF[`f2.${n}`]] = v[n] ?? 0;
    out[OFF['f2.on']] = 1; out[OFF['f2.d']] = -1 + a * Math.sin(Math.PI * u) ** 2; out[OFF['f2.ph']] = 0.3 * surged(s * (m.each ?? 2));
    if (v.t1) out[OFF['p1.ay']] = 1;
  } },
  // Swirl: on the strong beats the sheet is dragged round every flower, one way, and lets go, and then the other way, so petals sweep into paisley curls and straighten through the daisy they were. Slowest on the hit, the way a pendulum is at the top of its swing.
  swirl: { write(out, { t, m }) { out[OFF['star._2']] += (m.amp ?? 1.1) * ampAt(m, t) * swing(evalTrack(clockOf(m), t)); } },
  // Puff: every petal swells fat and round on the beat, and draws in thin and pointed after it, a flower breathing.
  puff: { write(out, { t, m }) { const s = evalTrack(clockOf(m), t), v = Math.abs(swing(s)); out[OFF['field._2']] *= Math.exp(ampAt(m, t) * (m.amp ?? 0.9) * (2 * v - 1)); } },
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
