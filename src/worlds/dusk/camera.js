// Dusk's camera: someone with their head against a train window. It doesn't spin. It rides, cranes up to see further, leans, and pushes slowly toward the light. What it does is by the kind of section, so a verse is one way of looking and a chorus another, and they come back as themselves, further on.
//   train   the sheet goes by faster or slower with how much song there is: spare.b, so the near hills pass the far ones
//   crane   how far up you've got: more sky, and less land
//   push    how close
//   lean    a sheet that isn't a landscape tips, and a little roll goes with it. A landscape stays level
import { OFF } from '../../pattern/layout.js';
import { clamp, evalTrack, rng } from '../../score/curves.js';
import { writeTip } from '../../score/camera.js';

const HZ = 30, SPEED = [0.12, 0.8];       // how far along a second the train goes, on top of its own clock, from quiet to loud
const trackOf = keys => { const n = keys.length, slope = i => (keys[i + 1][1] - keys[i][1]) / Math.max(keys[i + 1][0] - keys[i][0], 1e-3), out = []; for (let i = 0; i < n; i++) { let v = 0; if (i > 0 && i < n - 1) { const a = slope(i - 1), b = slope(i); v = a * b > 0 ? 2 * a * b / (a + b) : 0; } out.push({ t: keys[i][0], x: keys[i][1], v }); } return out; };
const LANG = {
  // The whole frame's going by, head on.
  ride: (i, way) => ({ crane: 0.06 * (i % 2 ? 1 : -1), push: 0.04, lean: 0.12 * way, roll: 0 }),
  // Up, to see further than you could.
  rise: (i, way) => ({ crane: [0.14, 0.42, 0.24][i % 3], push: [-0.08, -0.22, -0.12][i % 3], lean: 0.1 * way, roll: 0.05 * way }),
  // Slowly toward the light.
  near: (i, way) => ({ crane: -0.05, push: [0.2, 0.42, 0.1][i % 3], lean: 0.2 * way, roll: 0.08 * way }),
  // Leaning out: a sheet tips, and comes level.
  lean: (i, way) => ({ crane: 0.08, push: 0.14, lean: (i % 2 ? 0.2 : 0.62) * way, roll: 0.16 * way }),
  // Looking down, and away.
  sink: (i, way) => ({ crane: [-0.2, -0.34, -0.1][i % 3], push: [0.05, -0.1, 0.2][i % 3], lean: 0.3 * way, roll: -0.08 * way }),
};
const ROUTINE = { quiet: ['ride', 'near', 'rise', 'ride'], mid: ['near', 'lean', 'sink', 'rise'], loud: ['rise', 'lean', 'near', 'sink'] };

export function wearDuskCamera(film, A, M, seed = 7) {
  const dur = A.duration, n = Math.ceil((dur + 12) * HZ) + 2, bar = M?.bar || 2, rand = rng((seed ^ 0xd05c) >>> 0 || 1), segs = A.segments?.length ? A.segments : [{ t0: 0, t1: dur, label: 'A' }], time = film.time ?? (t => t);
  const at = (a, t) => (a ? a[Math.max(0, Math.min(a.length - 1, Math.round(t * A.fps)))] || 0 : 0);
  // Each kind of section's own routine.
  const kinds = new Map();
  for (const s of segs) { const k = kinds.get(s.label) ?? { e: 0, c: 0, way: rand() < 0.5 ? 1 : -1 }; for (let t = s.t0; t < s.t1; t += 0.5) { k.e += at(A.E, t); k.c++; } kinds.set(s.label, k); }
  const order = [...kinds.keys()].sort((a, b) => kinds.get(a).e / kinds.get(a).c - kinds.get(b).e / kinds.get(b).c), keys = { crane: [[0, 0]], push: [[0, 0]], lean: [[0, 0]], roll: [[0, 0]] }, seen = new Map(), phrase = bar * 4 >= 5.5 ? 4 : 8;
  let rollAt = 0;
  segs.forEach((seg, si) => {
    const rank = order.length > 1 ? order.indexOf(seg.label) / (order.length - 1) : 0.5, routine = ROUTINE[rank < 0.34 ? 'quiet' : rank > 0.67 ? 'loud' : 'mid'], visit = seen.get(seg.label) ?? 0, way = kinds.get(seg.label).way * (visit % 2 ? -1 : 1), big = 1 + 0.25 * visit;
    seen.set(seg.label, visit + 1);
    const span = seg.t1 - seg.t0, count = Math.max(1, Math.round(span / (phrase * bar)));
    for (let i = 0; i < count; i++) {
      const lang = routine[(si + i + visit) % routine.length], k = LANG[lang](i + visit, way), when = time(seg.t0 + (span * (i + 1)) / count);
      rollAt += k.roll * big;
      for (const [name, v] of [['crane', k.crane * big], ['push', k.push * big], ['lean', clamp(k.lean * big, -0.8, 0.8)], ['roll', rollAt]]) if (when > keys[name].at(-1)[0] + 0.05) keys[name].push([when, v]);
    }
  });
  const T = {}; for (const k in keys) { T[k] = new Float32Array(n); const tr = trackOf(keys[k]); for (let i = 0; i < n; i++) T[k][i] = evalTrack(tr, i / HZ); }
  // How far the train's gone: the integral of how much song there is, so a chorus goes by faster.
  const dist = new Float32Array(n); let d = 0;
  for (let i = 1; i < n; i++) { const e = clamp(at(A.E, i / HZ)); d += (SPEED[0] + (SPEED[1] - SPEED[0]) * e * e) / HZ; dist[i] = d; }
  const rd = (a, t) => { const x = clamp(t * HZ, 0, n - 1.001), i = Math.floor(x); return a[i] + (a[i + 1] - a[i]) * (x - i); };
  const write = (out, t, G) => {
    const p = G.pattern, camKind = p.cam ?? 'sheet', crane = rd(T.crane, t), push = rd(T.push, t);
    if (camKind === 'train') {
      out[OFF['spare.b']] += rd(dist, t) * 0.35;
      out[OFF.ty] += crane * 0.55;
      out[OFF.scale] *= Math.exp(push * 0.5);
      return;
    }
    // A wall stays a wall: the light moves on it, and you only breathe.
    if (camKind === 'wall') {
      out[OFF.scale] *= Math.exp(push * 0.4);
      out[OFF.ty] += crane * 0.2;
      return;
    }
    if (camKind === 'anchor') {
      out[OFF.scale] *= Math.exp(push);
      out[OFF.tx] += 0.1 * Math.sin(rd(dist, t) * 0.5);
      out[OFF.ty] += crane * 0.4;
      return;
    }
    out[OFF.scale] *= Math.exp(push);
    out[OFF.tx] += rd(dist, t) * 0.14;
    out[OFF.ty] += crane;
    out[OFF.rot] += rd(T.roll, t) * (p.g?.fams?.[0]?.t1 ? 0.3 : 1);
    if (out[OFF['surf.kind']] < 0.5 || out[OFF['q.zw']] === 0.5) writeTip(out, rd(T.lean, t), rd(T.roll, t) + 0.6, 2.4);
  };
  for (const G of film.gestures) G.cam = write;
  film.duskCamera = { T, dist, write };
  return write;
}
