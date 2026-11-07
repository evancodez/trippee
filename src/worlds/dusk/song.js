// What Dusk hears. A song is one evening, its reverb is how long the light lingers, its voice is the sun, and the last few seconds of it are written along every line.
const HZ = 20;
const clamp01 = x => Math.max(0, Math.min(1, x));
const up = (x, a, b) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };
const memo = new WeakMap();
const smooth = (a, sec) => { const out = Float32Array.from(a), k = Math.exp(-1 / Math.max(sec * HZ, 1e-3)); for (let i = 1; i < out.length; i++) out[i] = k * out[i - 1] + (1 - k) * out[i]; for (let i = out.length - 2; i >= 0; i--) out[i] = k * out[i + 1] + (1 - k) * out[i]; return out; };
export const read = (song, a, t) => { const x = Math.max(0, Math.min(song.n - 1.001, t * HZ)), i = Math.floor(x); return a[i] + (a[i + 1] - a[i]) * (x - i); };

// How long this room rings, in seconds, whichever way it can be told. The extras only know where there are free decays. Otherwise the sustain says how much of the song is held, and it only moves about .1 within a song, so it's stretched.
export function airOf(A) {
  const said = A.x?.air?.song;
  if (said > 0) return Math.max(0.8, Math.min(7, said));
  const s = A.x?.sustain;
  if (s?.length) { let m = 0; for (const v of s) m += v; m /= s.length; return 1.4 + 3.6 * up(m, 0.35, 0.85); }
  return 2.6;
}
// When the guitar's really tremolo: rate in Hz and how sure, per moment. Believe a yes more than a no, as extras.js says, and there's no pretending when it's no.
function tremOf(A, n) {
  const T = A.x?.trem, depth = new Float32Array(n), rate = new Float32Array(n);
  if (!T?.depth?.length) return { depth, rate };
  const hz = T.hz ?? 2;
  for (let i = 0; i < n; i++) { const f = Math.min(T.depth.length - 1, Math.floor((i / HZ) * hz)); depth[i] = T.depth[f] || 0; rate[i] = T.rate[f] || 0; }
  return { depth: smooth(depth, 1.5), rate: smooth(rate, 1.5) };
}

export function hearDusk(A, M) {
  if (memo.has(A)) return memo.get(A);
  const dur = A.duration, n = Math.ceil(dur * HZ) + 2, fps = A.fps, at = (a, t) => (a ? a[Math.max(0, Math.min(a.length - 1, Math.round(t * fps)))] || 0 : 0);
  const air = airOf(A);
  // The strip chart: quick up, and down at the room's own rate. What's written along a line is what the room held.
  const level = new Float32Array(n), fall = Math.exp(-1 / (HZ * air * 0.3));
  let v = 0;
  for (let i = 0; i < n; i++) { const x = Math.pow(at(A.loud, i / HZ), 1.3); v = x > v ? v + (x - v) * 0.5 : Math.max(x, v * fall); level[i] = v; }
  const voice = new Float32Array(n), bass = new Float32Array(n), e = new Float32Array(n);
  for (let i = 0; i < n; i++) { voice[i] = at(A.voiced, i / HZ); bass[i] = at(A.bass, i / HZ); e[i] = at(A.E, i / HZ); }
  const sunV = smooth(voice, 0.7), heave = smooth(bass, 0.5), energy = smooth(e, 1.2);
  // The evening: it moves on most at the section edges, and a little all the time. Section by section, so a chorus coming back is later than it was, and that's a different colour.
  const hash = A.hash ? parseInt(String(A.hash).slice(0, 7), 16) : 3, start = ((hash % 16) / 16) * 1.4, steps = Math.max(3, Math.min(11, dur / 32)), segs = A.segments?.length ? A.segments : [{ t0: 0, t1: dur }];
  const day = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / HZ, k = segs.findIndex(s => t >= s.t0 && t < s.t1), S = segs[Math.max(k, 0)], mid = S.t0 / dur, into = (t - S.t0) / Math.max(S.t1 - S.t0, 1);
    day[i] = start + steps * (mid + (S.t1 - S.t0) / dur * (0.3 * into));
  }
  const dayS = smooth(day, 3.5);
  // Harmony: a minor chord's a little later in the evening than a major one, so each change of chord moves the light. Held, as the conductor's tension is on top of it.
  const mood = new Float32Array(n), runs = M?.runs ?? [];
  { let k = 0; for (let i = 0; i < n; i++) { const t = i / HZ; while (k + 1 < runs.length && runs[k + 1].t0 <= t) k++; const r = runs[k]; mood[i] = r ? (r.c & 1 ? 0.2 : -0.1) : 0; } }
  const moodS = smooth(mood, 0.9);
  // Reverb, as near as the song can say: how much of it's being held. The tail is longest when nothing's stopping it.
  const held = new Float32Array(n);
  for (let i = 0; i < n; i++) held[i] = at(A.harm, i / HZ);
  const heldS = smooth(held, 1);
  const trem = tremOf(A, n);
  // The eclipse: the song's biggest arrival, once, with room for the moon to come over before it. The first of the sun comes back on the hit.
  const top = (M?.arrivals?.(0.3) ?? []).filter(a => a.t > 28 && a.t < dur - 14).sort((p, q) => q.a - p.a)[0];
  const out = { n, dur, hz: HZ, air, level, eclipse: top ? { t: top.t, a: top.a } : null, voice: sunV, heave, energy, day: dayS, mood: moodS, held: heldS, trem, id: A.hash ?? String(dur), tremHeard: A.x?.heard?.trem ?? false, whoas: holdsOf(A, M, e, air) };
  memo.set(A, out);
  return out;
}

// The whoa: the band stops or falls away. The edges hold while the tails die at the room's own rate, so you watch the reverb go, and then the guitar strikes every edge again.
// The bigger falls of the song's energy, then whatever's the end of it. No more than three.
function holdsOf(A, M, e, air) {
  const dur = A.duration, E = smooth(e, 0.25), span = 2 * HZ, drops = [];
  for (let i = span; i + span < E.length; i += 4) { const d = E[i - span] - E[i + span]; if (d > 0.14 && E[i - span] > 0.25 && i / HZ > 12 && i / HZ < dur - 6) drops.push({ t: i / HZ, d }); }
  drops.sort((a, b) => b.d - a.d);
  const out = [];
  for (const p of drops) { if (out.every(o => Math.abs(o.t - p.t) > 30) && out.length < 3) out.push(p); }
  out.sort((a, b) => a.t - b.t);
  const bars = M?.bars ?? [];
  return out.map(p => { const back = Math.min(dur, p.t + Math.max(1.5 * air, 3)), to = bars.find(b => b >= back) ?? back; return { t: p.t, d: p.d, back: Math.min(to, p.t + 9) }; });
}
export const whoaOf = (A, M) => { const w = hearDusk(A, M).whoas, best = [...w].sort((a, b) => b.d - a.d)[0]; return best ? { t: best.t, before: 4, after: best.back - best.t + 4, why: `the band falls away by ${best.d.toFixed(2)}, and the reverb's left to die` } : null; };
// How far over the moon is: -1 not begun, 0 centred on the sun, 1 gone. And how dark that makes it. It comes over in nine seconds, and it's off the sun again in six: the hit is the first of the sun coming back.
const COMES = 9, GOES = 6;
export function eclipseAt(song, t) {
  const e = song?.eclipse;
  if (!e || t < e.t - COMES || t > e.t + GOES) return null;
  const x = t < e.t ? (t - e.t) / COMES : (t - e.t) / GOES, a = Math.abs(x), dark = 1 - up(a, t < e.t ? 0.12 : 0.02, 1);
  return { x, dark };
}
// How much of the tail has gone, at this moment: 0 to 1.
export function holdAt(song, t) {
  // And the last of the song: the same thing, all the way out.
  if (t > song.dur - 6) return 0.9 * up(t, song.dur - 6, song.dur - 0.5);
  for (const w of song.whoas) { if (t < w.t || t > w.back + 1.4) continue; const a = 1 - Math.exp(-(t - w.t) / Math.max(song.air * 0.4, 0.7)); return a * (1 - up(t, w.back, w.back + 1.4)); }
  return 0;
}
