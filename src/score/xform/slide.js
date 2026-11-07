// A slide: the same kind of pattern, whose numbers glide to the next one's, so warps grow and lines straighten.
import { OFF, FAMILIES, SLOT_FLOATS, SNAP } from '../../pattern/layout.js';
import { lerp } from '../curves.js';
import { biggestElement } from './flight.js';
import { flag } from '../flags.js';

const WHIP = 3;   // how far a slide's lines can stray from the steady path between the two sizes
const GLIDE_LOOKS_OLD = [0.2, 0.35, 0.5, 0.65, 0.8, 0.9], GLIDE_LOOKS = [0.1, 0.2, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9];
const GREY_MAX = 0.4;   // in a probe at 180 px high, what share can be edges and lines too fine to tell before a slide counts as going grey

// A slide whose numbers pass through a place with nothing much in it would fill the frame with one colour on the way, and numbers crossing
// zero would blow the lines up huge and shrink them again. Look before leaving: its size has to stay near the straight path between the two.
const slA = new Float32Array(SLOT_FLOATS), slB = new Float32Array(SLOT_FLOATS);
function slideStaysBusy(a, b, plan, ctx) {
  // Only the lines that go somewhere can whip: a family opening or closing has one size all the way.
  const fine = (s, i) => {
    const g = n => Math.abs(s[OFF[`f${i}.${n}`]]);
    return Math.max(Math.hypot(g('x'), g('y')) + g('r1') + g('r2') + (g('l1') + g('l2')) / 0.7 + (g('t1') + g('t2')) / 4, 1e-3) * Math.max(s[OFF.freq], 1e-3) / Math.max(s[OFF.scale], 1e-4);
  };
  for (let i = 0; i < FAMILIES; i++) {
    const j = plan.pair[i];
    if (j < 0) continue;
    const ka = Math.log(fine(a, i)), kb = Math.log(fine(b, j));
    for (const T of [0.15, 0.3, 0.4, 0.5, 0.6, 0.7, 0.85]) {
      slA.set(a); slB.set(b);
      applySlide(slA, slB, plan, T);
      if (Math.abs(Math.log(fine(slA, i)) - lerp(ka, kb, T)) > Math.log(WHIP)) return false;
    }
  }
  // Looked at closely enough to see it swing: where a family's gradient passes near nothing its lines blow up to the size of the frame, and the smallest change then turns half the frame over.
  // A slide that goes back and forth in brightness, or gets to one big shape on the way, is a flash and not a glide. tests/flash.mjs found these on lines.fall into checks.target.
  const guard = flag('flashGuard'), looks = guard ? GLIDE_LOOKS : GLIDE_LOOKS_OLD;
  let dir = 0, pivot = null, turns = 0;
  for (const T of looks) {
    slA.set(a); slB.set(b);
    applySlide(slA, slB, plan, T);
    const { W, H, px } = ctx.R.probe(slA, ctx.aspect);
    let sum = 0, grey = 0;
    for (let i = 0; i < W * H; i++) { sum += px[i * 4]; if (px[i * 4] > 40 && px[i * 4] < 215) grey++; }
    const white = sum / (W * H * 255);
    if (white < 0.12 || white > 0.88) return false;
    if (grey / (W * H) > GREY_MAX) return false;
    if (biggestElement(ctx.R, slA, ctx.aspect, { W, H, px }).r > (guard ? 0.65 : 0.8)) return false;
    if (guard) {
      if (pivot === null) pivot = white;
      if (dir >= 0 && white > pivot) { pivot = white; dir = 1; }
      if (dir <= 0 && white < pivot) { pivot = white; dir = -1; }
      if (dir === 1 && pivot - white >= 0.1) { turns++; dir = -1; pivot = white; }
      else if (dir === -1 && white - pivot >= 0.1) { turns++; dir = 1; pivot = white; }
      if (turns >= 2) return false;
    }
  }
  return true;
}

const lim2 = new Float32Array(SLOT_FLOATS);
export function applySlide(A, B, plan, T) {
  // Glide A's numbers to B's, family by family, where each family's partner is. B's own numbers are left alone.
  lim2.set(B);
  for (let i = 0; i < FAMILIES; i++) {
    const j = plan.pair[i];
    if (j < 0) continue;
    const sign = plan.flip[j] ? -1 : 1;
    for (const n of ['x', 'y', 'z', 'ph', 'r1', 'l1', 't1', 'r2', 'l2', 't2']) lim2[OFF[`f${i}.${n}`]] = sign * B[OFF[`f${j}.${n}`]] + (n === 'ph' ? plan.offset[j] : 0);
    lim2[OFF[`f${i}.d`]] = B[OFF[`f${j}.d`]]; lim2[OFF[`f${i}.on`]] = 1;
    // what each family takes of the slip and the field goes by its place, so it goes with the family
    lim2[OFF[`slip.m${i}`]] = B[OFF[`slip.m${j}`]]; lim2[OFF[`field.k${i}`]] = B[OFF[`field.k${j}`]];
  }
  for (const i of plan.close) { for (const n of ['x', 'y', 'z', 'ph', 'r1', 'l1', 't1', 'r2', 'l2', 't2']) lim2[OFF[`f${i}.${n}`]] = A[OFF[`f${i}.${n}`]]; lim2[OFF[`f${i}.d`]] = -1; lim2[OFF[`f${i}.on`]] = 1; }
  // A new family needs a place of its own, and starts closed. A family with a huge duty is only a constant, nothing at all to the XOR, and the dots use one
  // to lift their level. It keeps its place and stays one: gliding its duty to zero would open it up and flip the whole picture.
  const NUMS = ['x', 'y', 'z', 'ph', 'r1', 'l1', 't1', 'r2', 'l2', 't2'];
  const isConst = (s, i) => s[OFF[`f${i}.on`]] > 0.5 && Math.abs(s[OFF[`f${i}.d`]]) > 1.01;
  const used = new Set(plan.pair.map((j, i) => (j >= 0 ? i : -1)).concat(plan.close));
  const moved = [];
  const place = (j, closed) => {
    let free = 0; while (used.has(free) && free < FAMILIES - 1) free++;
    used.add(free);
    for (const n of NUMS) { A[OFF[`f${free}.${n}`]] = B[OFF[`f${j}.${n}`]]; lim2[OFF[`f${free}.${n}`]] = B[OFF[`f${j}.${n}`]]; }
    A[OFF[`f${free}.d`]] = closed; lim2[OFF[`f${free}.d`]] = B[OFF[`f${j}.d`]]; A[OFF[`f${free}.on`]] = 1; lim2[OFF[`f${free}.on`]] = 1;
    A[OFF[`slip.m${free}`]] = lim2[OFF[`slip.m${free}`]] = B[OFF[`slip.m${j}`]]; A[OFF[`field.k${free}`]] = lim2[OFF[`field.k${free}`]] = B[OFF[`field.k${j}`]];
    return free;
  };
  const keep = [];
  for (let i = 0; i < FAMILIES; i++) if (!used.has(i) && isConst(A, i)) { keep.push(i); used.add(i); }
  for (const j of plan.open) moved.push([j, place(j, -1)]);
  // ...and one the next pattern needs that a family of this one is sitting on goes somewhere else
  for (let j = 0; j < FAMILIES; j++) if (isConst(B, j) && !keep.includes(j) && (plan.pair[j] >= 0 || plan.close.includes(j))) moved.push([j, place(j, -1)]);
  for (const [j, at] of moved) if (at !== j && !used.has(j)) lim2[OFF[`f${j}.on`]] = 0;
  plan.places = moved;   // colour's second plate needs to know where each went
  for (const i of keep) { for (const n of NUMS) lim2[OFF[`f${i}.${n}`]] = A[OFF[`f${i}.${n}`]]; lim2[OFF[`f${i}.d`]] = A[OFF[`f${i}.d`]]; lim2[OFF[`f${i}.on`]] = 1; }
  const s0 = A[OFF.scale], s1 = B[OFF.scale];
  for (let i = 0; i < FAMILIES; i++) if (lim2[OFF[`f${i}.on`]] > 0.5 && A[OFF[`f${i}.on`]] < 0.5) { A[OFF[`f${i}.d`]] = -1; A[OFF[`f${i}.on`]] = 1; for (const n of ['x', 'y', 'z', 'ph', 'r1', 'l1', 't1', 'r2', 'l2', 't2']) A[OFF[`f${i}.${n}`]] = lim2[OFF[`f${i}.${n}`]]; }
  for (let n = 0; n < SLOT_FLOATS; n++) if (!SNAP.has(n)) A[n] = A[n] + (lim2[n] - A[n]) * T;
  A[OFF.scale] = s0 * Math.pow(s1 / s0, T);
}

export default {
  id: 'slide',
  plan(a, b, ctx) {
    const { m, D } = ctx;
    if (!(m.plain && m.same('surf.kind') && a[OFF['surf.map']] < 0.5 && b[OFF['surf.map']] < 0.5 && m.fewExtras && m.closeEnough && D >= (ctx.quick ? 2.5 : 6))) return null;
    const { pair, flip, offset, close, open, ratio } = m;
    const plan = { kind: 'slide', pair, flip, offset, close, open, ratio };
    if (!slideStaysBusy(a, b, plan, ctx)) return null;
    // A slide ends with the next pattern's families in this one's places. XOR doesn't mind, but each family's hand-cut wobble goes by its place and its sign,
    // so if the next pattern wobbles, the picture would twitch the frame it lands. Then it's a bend or a flight.
    const moved = pair.some((j, i) => j >= 0 && (j !== i || flip[j])) || (plan.places || []).some(([j, at]) => j !== at);
    return moved && Math.abs(b[OFF.wob]) > 1e-4 ? null : plan;
  },
  enter(st) {
    st.theta = lerp(st.thA, st.thB, st.T); st.solid = lerp(st.sa, st.sb, st.T);
    st.moveA = true; st.moveB = true;
  },
  write(st, A, B) {
    A[OFF.theta] = st.theta; B[OFF.theta] = st.theta;
    applySlide(A, B, st.plan, st.T);
    st.two = false;
  },
};
