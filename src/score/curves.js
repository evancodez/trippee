// Pure maths for motion. Everything that moves goes through these, so nothing can jolt.
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoother = u => { u = clamp(u); return u * u * u * (u * (u * 6 - 15) + 10); };   // C2, zero velocity and acceleration at the ends

// A track is a list of knots { t, x, v }. Between knots: a quintic with zero acceleration at both ends, so the result is C2.
export function evalTrack(track, t) {
  if (!track || !track.length) return 0;
  if (t <= track[0].t) return track[0].x + (track[0].v || 0) * (t - track[0].t);
  const last = track[track.length - 1];
  if (t >= last.t) return last.x + (last.v || 0) * (t - last.t);
  let lo = 0, hi = track.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (track[m].t <= t) lo = m; else hi = m; }
  const a = track[lo], b = track[hi], T = b.t - a.t, u = (t - a.t) / T;
  const x0 = a.x, x1 = b.x, v0 = (a.v || 0) * T, v1 = (b.v || 0) * T;
  const d = x1 - x0;
  const c3 = 10 * d - 6 * v0 - 4 * v1, c4 = -15 * d + 8 * v0 + 7 * v1, c5 = 6 * d - 3 * v0 - 3 * v1;
  return x0 + u * (v0 + u * u * (c3 + u * (c4 + u * c5)));
}

// A small deterministic random stream. Math.random is never used in anything that affects the picture.
export function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let i = 0; i < 4; i++) next();
  return Object.assign(next, {
    range: (a, b) => a + (b - a) * next(),
    pick: list => list[Math.floor(next() * list.length) % list.length],
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    sign: () => (next() < 0.5 ? -1 : 1),
  });
}
