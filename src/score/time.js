// The Stop's clock: score.time(t), the picture's own time at song second t. A film that never stops freezes on one exact frame while the band stops, and pays the time back when it returns.
//
// It's the integral of a rate, one long curve with no steps in it. For each rest [a, b]:
//
//    rate   1 ─────╲                            ╱‾‾‾‾‾‾‾‾‾‾‾‾‾╲___ 1          1.5 until the lag is paid, which ends exactly at 0
//                   ╲_______ 0 ________________╱
//              a - beat     a                  b  b + .25
//
// Only ever a lag: the picture is at or behind the song, never ahead, and with the lag paid score.time(t) is exactly t, so the landings after it fall where they were composed.
// With no rests it's the identity itself: nothing else about a film changes. It's a pure function of M, so seeking into a rest or across one gives the same frame as playing there.
//
// time.windows says where the clock isn't the song's, for whatever plans around it: { from, a, b, paid }, all song seconds. A morph shouldn't start before paid.
// A landing on the rest itself: the picture reaches time(a), not a, by the moment the band stops, so one that has to be home for the freeze lands at time(a).
//
// time.c(t) is the clock the song's own tables read: M.C(t), which stands still for a rest and never lags, with its two corners rounded off. The tables run right up to the band stopping and
// start again with the sound, so they'd stop much more suddenly than the picture's clock: a ring of line weight going at full speed that halts in one frame is a jolt. The rounding lies outside
// the rest, so everything is still from a to b, one frame. It's a few frames, and what it loses is paid back at once, so it's in step again in half a second.
import { flag } from './flags.js';

export const same = t => t;
const UP = 0.25;              // seconds to come back up to speed: the hit starts it
const FAST = 1.5;             // how fast it pays back the lag
const SETTLE = 1;             // seconds from there back to the song's own speed
const paidBySettling = (FAST - 1) / 2 * SETTLE;       // what those seconds pay back on their own
const KNEE = 0.08;            // seconds the song's tables take to stop before a rest, or to start after one
const PAY = 0.4;              // ...and to get back what that cost them

// The integral of smoother from 0 to u, so a stretch of rate easing from r0 to r1 has an exact answer at any moment in it.
const I5 = u => u * u * u * u * (u * (u - 3) + 2.5);
const S5 = u => u * u * u * (u * (u * 6 - 15) + 10);

// One stretch: the rate eases from r0 to r1 over D seconds, and may be cut short at `end` by the next rest arriving before the lag is paid.
const rateOf = (s, t) => s.r0 + (s.r1 - s.r0) * S5((t - s.t0) / s.D);
const pictureOf = (s, t) => { const u = (t - s.t0) / s.D; return s.p0 + s.D * (s.r0 * u + (s.r1 - s.r0) * I5(u)); };

export function buildTime(M) {
  const rests = flag('rests') && M?.rests?.length ? [...M.rests].sort((x, y) => x.a - y.a) : null;
  if (!rests) return same;
  const beat = M.beat > 0 ? M.beat : 0.5, S = [], windows = [];
  const add = (t0, D, r0, r1) => {
    const last = S.at(-1), joined = last && last.end === t0;
    const s = { t0, D, r0, r1, p0: joined ? pictureOf(last, t0) : t0, end: t0 + D };
    if (D > 0) S.push(s);
    return s;
  };
  // Whatever's still catching up stops where the next rest begins to slow down, going at whatever speed it had. Returns that speed.
  const cutAt = t => {
    while (S.length && S.at(-1).t0 >= t) S.pop();
    const s = S.at(-1);
    if (!s || s.end <= t) return 1;
    s.end = t;
    return rateOf(s, t);
  };
  let was = -Infinity;
  for (const { a, b } of rests) {
    const down = Math.max(0.05, Math.min(beat, a - was));     // the band's own hits come first: it never slows down inside the rest before
    const from = a - down, r = cutAt(from);
    add(from, down, r, 0);
    add(a, b - a, 0, 0);
    const up = add(b, UP, 0, FAST);
    const lag = b + UP - pictureOf(up, b + UP), keep = Math.max(0, (lag - paidBySettling) / (FAST - 1));
    add(b + UP, keep, FAST, FAST);
    // A rest so short there's less to pay back than settling pays: settle sooner.
    const paid = b + UP + keep + (keep > 0 ? SETTLE : lag / paidBySettling * SETTLE);
    add(b + UP + keep, paid - (b + UP + keep), FAST, 1);
    windows.push({ from, a, b, paid });
    was = b;
  }
  const time = t => {
    let lo = -1, hi = S.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (S[m].t0 <= t) lo = m; else hi = m - 1; }
    if (lo < 0 || t >= S[lo].end) return t;       // nothing owing
    return pictureOf(S[lo], t);
  };
  time.windows = windows;
  // Coming to rest over w covers w/2 of the w that C would, and starting up costs the same again. So the frozen value is C(a) - w/2, and it's w behind when it's up to speed, which it pays back at once.
  const C = M.C, knees = rests.map(({ a, b }) => ({ a, b, w: Math.min(KNEE, (b - a) / 3), held: C(a) }));
  time.c = t => {
    for (const { a, b, w, held } of knees) {
      if (t <= a - w) break;
      if (t >= b + w + PAY) continue;
      if (t < a) { const u = (t - a + w) / w; return held - w + w * (u - I5(u)); }
      if (t <= b) return held - w / 2;
      if (t < b + w) return held - w / 2 + w * I5((t - b) / w);
      return C(t) - w * (1 - S5((t - b - w) / PAY));
    }
    return C(t);
  };
  return time;
}
