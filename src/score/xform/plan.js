// Worked out once per transition, from the two patterns as they stand when it starts: which families are partners, and so which kinds of
// transformation are open to them. The director's choice goes first (G.xform), then the usual order: slide, bend, a flight.
import { OFF, FAMILIES } from '../../pattern/layout.js';
import { fineness } from '../slot.js';
import { flag } from '../flags.js';
import { XFORMS } from './index.js';
import slide from './slide.js';
import bend from './bend.js';
import flight from './flight.js';

const winding = (s, i) => {
  const k = n => Math.abs(s[OFF[`f${i}.${n}`]]);
  if (k('t1') + k('t2') > 1e-6) return true;
  if (s[OFF['droste.lnS']] !== 0) return true;
  return s[OFF['surf.kind']] === 1 && s[OFF['surf.map']] > 0.5 && k('x') > 1e-6;   // the around-count on a wrapped surface
};
const coef = (s, i) => ['x', 'y', 'r1', 'l1', 'r2', 'l2'].map(n => s[OFF[`f${i}.${n}`]]);

// Mirrors in front of a sheet can't glide away to nothing, but two sheets under the same mirrors can glide into each other, and the mirrors go where they're going as they do.
const sameFold = (a, b) => {
  const on = s => s[OFF['sf.on']] > 0.5, shape = s => [s[OFF['sf.n']], s[OFF['sf.reps']], s[OFF['sf.par']], s[OFF['sf.S']] > 0, s[OFF['fan.al']] > 0, s[OFF['lf.b']] > s[OFF['lf.a']], s[OFF['mob.ax']] !== 0 || s[OFF['mob.dx']] !== 0].join();
  return !on(a) && !on(b) || (on(a) && on(b) && shape(a) === shape(b));
};

// The partners, and what they allow. Goes to each transformation's plan as ctx.m.
export function matchFamilies(a, b) {
  const A = [], B = [];
  // A family with a huge duty isn't lines at all, just a constant some patterns use to lift their level. It stays out of this.
  const real = (s, i) => s[OFF[`f${i}.on`]] >= 0.5 && Math.abs(s[OFF[`f${i}.d`]]) <= 1.01;
  for (let i = 0; i < FAMILIES; i++) { if (real(a, i)) A.push(i); if (real(b, i)) B.push(i); }
  const pair = [-1, -1, -1, -1], flip = [false, false, false, false], offset = [0, 0, 0, 0], taken = new Set();
  const options = [];
  for (const i of A) for (const j of B) {
    if (winding(a, i) !== winding(b, j)) continue;
    if (winding(a, i)) {
      const same = ['t1', 't2'].every(n => Math.abs(a[OFF[`f${i}.${n}`]] - b[OFF[`f${j}.${n}`]]) < 1e-6);
      if (!same) continue;
    }
    const ca = coef(a, i), cb = coef(b, j);
    const na = Math.hypot(...ca) || 1, nb = Math.hypot(...cb) || 1;
    options.push({ i, j, dot: ca.reduce((s, v, n) => s + v * cb[n], 0) / (na * nb) });
  }
  options.sort((p, q) => Math.abs(q.dot) - Math.abs(p.dot));
  for (const o of options) {
    if (pair[o.i] >= 0 || taken.has(o.j)) continue;
    pair[o.i] = o.j; taken.add(o.j); flip[o.j] = o.dot < 0;
    // Whole cycles are invisible, so start with the two phases as close as they can be, or the lines would whip across.
    const pa = a[OFF[`f${o.i}.ph`]], pb = (o.dot < 0 ? -1 : 1) * b[OFF[`f${o.j}.ph`]];
    offset[o.j] = Math.round(pa - pb);
  }
  const close = A.filter(i => pair[i] < 0), open = B.filter(j => !taken.has(j));
  const ratio = fineness(a) / fineness(b);
  const same = n => a[OFF[n]] === b[OFF[n]];
  const shaped = s => s[OFF['ribbon.on']] > 0.5 || s[OFF['blobs.on']] > 0.5 || s[OFF['matte.kind']] > 0.5;
  // A surface can't glide into a different surface: part way there the rays miss it, or it fills the frame.
  const sameBody = ['q.xx', 'q.xy', 'q.xz', 'q.xw', 'q.yy', 'q.yz', 'q.yw', 'q.zz', 'q.zw', 'q.ww'].every(n => Math.abs(a[OFF[n]] - b[OFF[n]]) < 1e-3);
  return {
    pair, flip, offset, close, open, ratio, same,
    closeEnough: ratio < 6 && ratio > 1 / 6,
    allPaired: !close.length && !open.length,
    fewExtras: close.length + open.length <= 2 && pair.some(p => p >= 0),
    // A field draws differently for different numbers, and they snap: gliding across them would be a cut.
    plain: sameFold(a, b) && !shaped(a) && !shaped(b) && sameBody && same('fold.n') && a[OFF['droste.lnS']] === 0 && b[OFF['droste.lnS']] === 0 && a[OFF['conf.amt']] === b[OFF['conf.amt']]
      && same('field.kind') && same('field.a') && same('field.b')
      // ...and so does how a sheet's cut into bands: gliding into a dial that's come apart would keep the old cuts to the last frame, and then the whole picture jumps.
      && same('slip.kind') && same('slip.n') && same('space.kind'),
  };
}

// The ink rule (docs/MODES.md, section 4), only when a world numbers its lines. matchFamilies's whole cycles are invisible to coverage, but not to floor(phase): a line's number would jump at the landing.
// A family that carries numbers keeps its place and doesn't flip, and it ends its travel a whole number of rows from where it started, so the frame after the landing has the same inks. If it can't, it's a flight, which adds nothing.
// With ink.roll the ladder's slow enough to take the difference up itself (src/worlds/engine.js), so the offset stays.
function inkFits(m, a, b, ink) {
  const real = (s, i) => s[OFF[`f${i}.on`]] >= 0.5 && Math.abs(s[OFF[`f${i}.d`]]) <= 1.01;
  for (const i of ink.fams) {
    if (!real(a, i) && !real(b, i)) continue;
    if (m.pair[i] !== i || m.flip[i]) return false;
    if (!ink.roll) m.offset[i] = ink.R * Math.round(m.offset[i] / ink.R);
  }
  return true;
}

// ctx: { R, aspect, D, rise, xform, noGlide, ink }. The same kind of thing: its numbers can simply glide. Otherwise lines can bend into lines if they're near
// enough in size. Otherwise it's a flight, which works between anything.
export function makePlan(a, b, ctx) {
  const m = matchFamilies(a, b), c = { ...ctx, m };
  if (ctx.ink) m.inkBars = !inkFits(m, a, b, ctx.ink);
  const want = ctx.xform && XFORMS[ctx.xform.id];
  if (want && flag(want.id) && !(m.inkBars && (want === slide || want === bend))) { const p = want.plan(a, b, c); if (p) return p; }
  // A rehearsal that's watched a slide flash rules out gliding between these two (ctx.noGlide), and then it's a flight.
  return (ctx.noGlide || m.inkBars ? null : slide.plan(a, b, c) ?? bend.plan(a, b, c)) ?? flight.plan(a, b, c);
}

// The same plan, one look per frame, so nothing stalls the film. Every look at the patterns is a draw read back, and a plan can want eight. Run this
// up to where it needs a look it hasn't got, go and get that without waiting for the GPU, and next time run it again with that one in hand. A
// transformation's plan stays a plain function this way, whichever it is. With hurry.now set, it takes whatever looks are left at once and finishes.
const LOOK = Symbol('look');
export function planSteps(a, b, ctx, hurry) {
  return walk(a.slice(), b.slice(), ctx, hurry);    // the caller's two are only lent, and this takes several frames
}
function* walk(a, b, ctx, hurry) {
  const R0 = ctx.R, seen = [];
  for (;;) {
    let n = 0, wanted = null;
    const R = Object.create(R0);
    R.probe = (slot, aspect) => {
      if (n < seen.length) return seen[n++];
      if (hurry.now) { seen.push(R0.probe(slot, aspect)); return seen[n++]; }
      wanted = [slot.slice(), aspect];
      throw LOOK;
    };
    try { return makePlan(a, b, { ...ctx, R }); }
    catch (e) { if (e !== LOOK) throw e; }
    const look = R0.probeStart(...wanted);
    for (;;) {
      yield;
      if (hurry.now) { R0.probeDrop(look); break; }
      const got = R0.probeDone(look);
      if (got) { seen.push(got); break; }
    }
  }
}
