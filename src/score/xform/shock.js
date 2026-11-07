// Shock: the bend with its time made local. A ring comes in from the rim (or goes out from the centre), and behind it is the next pattern. Lines with a partner travel to it
// through the ring, unbroken, and the ring is where they crowd. A family with no partner closes up as the ring passes, or opens. Nothing is laid over anything.
//
// Each pixel still draws from both patterns' own numbers, so nothing about either has to be interpolated, and that's why this reaches so much further than a bend: it doesn't need
// them to be the same kind of surface or to have the same warps, only one family that can travel to another with no hidden seam.
//
//   canShock(a, b, aspect)     what a shock between these two slots would be, or null
//   shockFit(G, N, opts)       the same for two gestures: for choosing a next pattern that allows one
//   wearShock(G, N, landing, opts)     the director's way in: see below
import { OFF, FAMILIES, FRAME, SLOT_FLOATS } from '../../pattern/layout.js';
import { clamp, lerp, smoother } from '../curves.js';
import { fineness, fillSlot } from '../slot.js';
import { openFamilies } from '../song-sheet.js';
import { flag } from '../flags.js';

const NUMS = ['x', 'y', 'z', 'ph', 'r1', 'l1', 't1', 'r2', 'l2', 't2'];
export const WIDTH = 0.42;      // the front's width, as a share of the whole move. It widens if the lines would crowd too much.
const WIDTH_MAX = 0.8;
const TIGHT = 0.5;              // how wide it is at the centre, as a share of its width at the rim
const REACH = 1.15;             // it starts this far past the farthest corner, so it comes in from off the frame
const CROWD = 34;               // how fine a front may make its lines, in cycles per picture unit. At 720p that's a period of about 10 px, and it's over in moments
const FINE = 1.875;             // the steepest slope of T against u
const SPEED = 5;                // how many lines a second can go past as they travel to their partners, at the strong beats' fastest. Any faster and they strobe rather than move.
const RATIO_MAX = 8;
const PUSH = 0.07;              // how far the front pushes the sheet aside, in picture units
const SURGE = 0.5;              // how much the front's speed swings with the strong beats

const fam = (s, i, n) => s[OFF[`f${i}.${n}`]];
const realFam = (s, i) => fam(s, i, 'on') >= 0.5 && Math.abs(fam(s, i, 'd')) <= 1.01;

function poleAt(s, n, X, Y) {
  const x = X - s[OFF[`p${n}.x`]], y = (Y - s[OFF[`p${n}.y`]]) * s[OFF[`p${n}.ay`]], q = s[OFF[`p${n}.q`]], l = Math.hypot(x, y);
  const rho = q > 0 ? lerp(l, Math.max(Math.abs(x), Math.abs(y)), q) : q < 0 ? lerp(l, (Math.abs(x) + Math.abs(y)) * 0.70711, -q) : l;
  return Math.max(rho, 0.12);       // right at a pole a log runs away, over a few pixels nobody can see
}
// A family's phase at a place in the frame, near enough: its smooth part, with the warps left out. Only used to see how far two families are apart.
function phaseAt(s, i, px, py, scale) {
  const r = s[OFF.rot], c = Math.cos(r), n = Math.sin(r), X = (c * px + n * py) / scale + s[OFF.tx], Y = (-n * px + c * py) / scale + s[OFF.ty], f = s[OFF.freq];
  const rho1 = poleAt(s, 1, X, Y), rho2 = poleAt(s, 2, X, Y);
  return f * (fam(s, i, 'x') * X + fam(s, i, 'y') * Y) + fam(s, i, 'r1') * rho1 + fam(s, i, 'l1') * Math.log(rho1) + fam(s, i, 'r2') * rho2 + fam(s, i, 'l2') * Math.log(rho2) + fam(s, i, 'ph');
}

// A hidden seam: the phase jumps by a whole number somewhere, which nobody can see until it's mixed with something else, when it becomes a part of a cycle.
// These can open and close, but they can't travel, unless the partner jumps by the same amount in the same place.
const around = (s, i) => s[OFF['surf.kind']] > 0.5 && s[OFF['surf.map']] > 0.5 && Math.abs(fam(s, i, 'x')) > 1e-6;        // what runs round a wrapped surface. What runs along it is fine.
const warpJumps = s => s[OFF['droste.lnS']] !== 0 || s[OFF['conf.amt']] !== 0;
const turns = (s, i) => Math.abs(fam(s, i, 't1')) + Math.abs(fam(s, i, 't2')) > 1e-6;
function canTravel(a, i, b, j) {
  if (around(a, i) || around(b, j) || warpJumps(a) || warpJumps(b)) return false;
  if (!turns(a, i) && !turns(b, j)) return true;
  const same = n => Math.abs(a[OFF[n]] - b[OFF[n]]) < 1e-4;
  const sameView = same('scale') && same('rot') && same('tx') && same('ty');
  return sameView && [1, 2].every(n => Math.abs(fam(a, i, `t${n}`) - fam(b, j, `t${n}`)) < 1e-6 && (fam(a, i, `t${n}`) === 0 || (same(`p${n}.x`) && same(`p${n}.y`) && same(`p${n}.q`) && same(`p${n}.ay`))));
}

const GRID = [];
for (let y = -1; y <= 1.001; y += 0.5) for (let x = -1; x <= 1.001; x += 0.5) GRID.push([x, y]);

// Which family of a goes to which of b, how far apart they'd be, and so how wide the front has to be. Null if there's nothing a shock can do with them.
// ink: a world numbers its lines (src/score/xform/plan.js has the rule): a family that carries numbers stays in its place, doesn't flip and ends a whole number of rows on, or there's no shock.
export function canShock(a, b, aspect = 16 / 9, { centre = [0, 0], any = false, D = 10, ink = null } = {}) {
  // Patterns that lean on a sum need every family to count, and closing one up doesn't take it out of the sum.
  if (Math.abs(a[OFF.sum]) > 2e-3 || Math.abs(b[OFF.sum]) > 2e-3) return null;
  const A = [], B = [];
  for (let i = 0; i < FAMILIES; i++) { if (realFam(a, i)) A.push(i); if (realFam(b, i)) B.push(i); }
  const pos = (s, i) => fam(s, i, 'on') >= 0.5 && fam(s, i, 'd') > 1.01;        // something that flips the whole picture. Nothing does yet, and it couldn't be got rid of locally.
  for (let i = 0; i < FAMILIES; i++) if (pos(a, i) || pos(b, i)) return null;
  const ratio = clamp(fineness(a) / fineness(b), 1 / RATIO_MAX, RATIO_MAX), sqr = Math.sqrt(ratio);
  const sa = a[OFF.scale] * sqr, sb = b[OFF.scale] / sqr;
  const options = [];
  for (const i of A) for (const j of B) {
    if (!canTravel(a, i, b, j)) continue;
    if (ink && i !== j && (ink.fams.includes(i) || ink.fams.includes(j))) continue;
    for (const sign of (turns(a, i) || Math.abs(b[OFF.wob]) > 1e-5 ? [1] : [1, -1])) {     // a flip can't take the hand-cut wobble with it, or the landing would twitch
      if (ink && sign < 0 && ink.fams.includes(i)) continue;
      const base = phaseAt(a, i, centre[0], centre[1], sa) - sign * phaseAt(b, j, centre[0], centre[1], sb);
      let spread = 0;
      for (const [gx, gy] of GRID) {
        const px = gx * aspect, py = gy;
        spread = Math.max(spread, Math.abs(phaseAt(a, i, px, py, sa) - sign * phaseAt(b, j, px, py, sb) - base));
      }
      if (a[OFF['surf.kind']] > 0.5 || b[OFF['surf.kind']] > 0.5) spread *= 1.5;       // that took no account of a surface, which crowds them somewhere
      options.push({ i, j, sign, spread, offset: Math.round(base) });
    }
  }
  options.sort((p, q) => p.spread - q.spread);
  const pair = [-1, -1, -1, -1], flip = [false, false, false, false], offset = [0, 0, 0, 0], taken = new Set();
  let worst = 0, pairs = 0;
  const hurry = FINE * (1 + SURGE) / (SPEED * D), spreadMax = WIDTH_MAX / hurry;      // past this no width would do: the family closes instead of travelling
  for (const o of options) {
    if (pair[o.i] >= 0 || taken.has(o.j) || o.spread > spreadMax) continue;
    pair[o.i] = o.j; taken.add(o.j); flip[o.j] = o.sign < 0; offset[o.j] = o.offset; worst = Math.max(worst, o.spread); pairs++;
  }
  if (!pairs && !any) return null;
  if (ink) for (const i of ink.fams) {
    if (!realFam(a, i) && !realFam(b, i)) continue;
    if (pair[i] !== i) return null;
    if (!ink.roll) offset[i] = ink.R * Math.round(offset[i] / ink.R);
  }
  const Rmax = Math.hypot(aspect + Math.abs(centre[0]), 1 + Math.abs(centre[1])), reach = Rmax * REACH;
  // The crowding is the steepest slope of T across the frame times how far apart the phases are: FINE * (1 - W) / (W * reach) * spread.
  // The speed is its steepest slope in time times the same: FINE / (W * D) * spread. Each says how wide the front has to be.
  const k = FINE * worst / reach;
  const W = clamp(Math.max(k / (CROWD + k), hurry * worst), WIDTH, WIDTH_MAX);
  return {
    kind: 'shock', pair, flip, offset, pairs, W, reach, centre,
    close: A.filter(i => pair[i] < 0), open: B.filter(j => !taken.has(j)),
    ratio: pairs ? ratio : 1, worst,
  };
}

const slotA = new Float32Array(SLOT_FLOATS), slotB = new Float32Array(SLOT_FLOATS);
// Where each will have come to rest, as near as can be told before the end has been moved: what the plan will see when it looks
const stillSlots = (G, N, D, phiOf) => {
  const stop = Math.min(D * 0.4, 3.5), tA = G.t1 - D + stop / 2, tB = N.t0 - stop / 2;
  fillSlot(slotA, G, tA, G.pattern, { phi: phiOf?.(tA, G) ?? 0 });
  fillSlot(slotB, N, tB, N.pattern, { phi: phiOf?.(tB, N) ?? 0 });
  return [slotA, slotB];
};

// The director's way in. G becomes N by a shock that hits its centre exactly on `landing`: this moves where G ends, so don't lay out anything against G.t1 until after it.
//   dir 1 in from the rim (a label change, an arrival). dir 2 out from the centre (the song falling away).
//   Returns what it'll be ({ W, pairs, close, open, ... }), or null if these two can't, in which case nothing has been touched.
export function shockFit(G, N, { D = G.morph || 10, aspect = 16 / 9, centre = [0, 0], phiOf, any = false } = {}) {
  const [a, b] = stillSlots(G, N, D, phiOf);
  return canShock(a, b, aspect, { centre, any, D });
}
export function wearShock(G, N, landing, { dir = 1, D = G.morph || 10, aspect = 16 / 9, centre = [0, 0], push = PUSH, phiOf, any = false, beats = null, surge = SURGE, turn = 0, leave = 7 } = {}) {
  if (!flag('shock')) return null;
  D = Math.min(D, landing - G.t0 - 0.5);      // it can't start before G has
  if (D < 4) return null;
  const fit = shockFit(G, N, { D, aspect, centre, phiOf, any });
  if (!fit) return null;
  // In from the rim, the centre is halfway through its turn at 1 - W0/2 of the way along. Out from the centre, that's W0/2 of the way along.
  const W0 = fit.W * TIGHT, t1 = landing + (dir === 1 ? W0 * D / 2 : D * (1 - W0 / 2));
  if (N.t1 - t1 < (N.morph ? leave : 2)) return null;      // N would have no time left of its own, and its own transformation has to start after this one's over
  G.t1 = t1; N.t0 = t1; G.morph = D;
  if (N.morph) { N.morph = Math.min(N.morph, N.t1 - N.t0 - 1); delete N.plan; delete N.planFor; delete N.planning; }     // nor can the next one's start before this one has finished
  delete G.plan; delete G.planFor; delete G.planning;
  const t0 = t1 - D, inside = beats ? beats.filter(b => b > t0 && b < t1).map(b => (b - t0) / D) : [];
  G.xform = { id: 'shock', dir, centre, push, W: fit.W, any, beats: inside.length >= 2 ? inside : null, surge, turn };
  return fit;
}

// The front goes by the song's strong beats: it surges into each and eases off after, the same distance on average, so nothing about where it lands changes, and a strong beat is where
// it's going fastest. y is how far along the front is, x how far along the move. The speed swings by `surge` either way, so it never stops and never goes back.
function frontAt(x, beats, surge) {
  if (!beats || !surge) return x;
  const n = beats.length;
  let k = 0; while (k < n - 2 && beats[k + 1] <= x) k++;
  const P = beats[k + 1] - beats[k], phase = (x - beats[k]) / P;
  return x + surge * P / (2 * Math.PI) * Math.sin(2 * Math.PI * phase) * smoother(x / 0.12) * smoother((1 - x) / 0.12);
}

export default {
  id: 'shock',
  plan(a, b, ctx) {
    const o = ctx.xform || {};
    if (ctx.D < 4) return null;
    // The director laid out the landing for a width and an answer. A plan looks at the patterns where they've actually come to rest, and it mustn't move the hit or change its mind.
    const fit = canShock(a, b, ctx.aspect, { centre: o.centre ?? [0, 0], any: o.any || !!o.W, D: ctx.D, ink: ctx.ink });
    if (!fit) return null;
    if (o.W) fit.W = o.W;
    fit.dir = o.dir ?? 1; fit.push = o.push ?? PUSH; fit.beats = o.beats ?? null; fit.surge = o.surge ?? SURGE; fit.turn = o.turn ?? 0;
    // A front with its centre off the frame would spend the first of its move on nothing at all.
    const c = fit.centre, off = Math.hypot(Math.max(Math.abs(c[0]) - ctx.aspect, 0), Math.max(Math.abs(c[1]) - 1, 0));
    fit.y0 = fit.dir === 2 ? (off / fit.reach) * (1 - fit.W) : 0;
    return fit;
  },
  enter(st) {
    st.theta = lerp(st.thA, st.thB, st.T); st.solid = lerp(st.sa, st.sb, st.T);
    st.moveA = true; st.moveB = true;
  },
  write(st, A, B, F) {
    const { plan, T, x } = st;
    // The song takes a share of the brightness per family, and these two needn't have as many. By the end it has to be what the next pattern will take on the plain path.
    if (st.pulse) st.theta += st.pulse * (st.solid || 1) * (1 / openFamilies(A) - 1 / lerp(openFamilies(A), openFamilies(B), T));
    for (let j = 0; j < FAMILIES; j++) {
      if (fam(B, j, 'on') < 0.5) continue;
      if (plan.flip[j]) {
        for (const n of NUMS) B[OFF[`f${j}.${n}`]] = -B[OFF[`f${j}.${n}`]];
        B[OFF[`field.k${j}`]] = -B[OFF[`field.k${j}`]]; B[OFF[`slip.m${j}`]] = -B[OFF[`slip.m${j}`]];
      }
      B[OFF[`f${j}.ph`]] += plan.offset[j];
    }
    // both zoom towards each other, so at every moment the two have about the same size of element
    A[OFF.scale] *= Math.pow(plan.ratio, T);
    B[OFF.scale] *= Math.pow(1 / plan.ratio, 1 - T);
    // ...and the whole sheet can turn while it happens: it's a long move, and it lands where it would have
    if (plan.turn) { A[OFF.rot] += plan.turn * T; B[OFF.rot] -= plan.turn * (1 - T); }
    A[OFF.theta] = st.theta; B[OFF.theta] = st.theta;
    const P = FRAME.pair * 4;
    for (let i = 0; i < 4; i++) F[P + i] = plan.pair[i];
    F[FRAME.compose * 4] = T; F[FRAME.compose * 4 + 1] = 1;
    const X = FRAME.xf * 4, X2 = FRAME.xf2 * 4;
    F[X] = plan.dir; F[X + 1] = lerp(plan.y0, 1, frontAt(x, plan.beats, plan.surge)); F[X + 2] = plan.W; F[X + 3] = plan.reach;
    F[X2 + 2] = plan.W * TIGHT;
    F[X2] = plan.centre[0]; F[X2 + 1] = plan.centre[1]; F[X2 + 3] = plan.push * (1 + 6 * (st.pulse ?? 0));       // the strong beats kick it
  },
};
