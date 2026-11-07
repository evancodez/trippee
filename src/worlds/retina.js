// Retina: the colour happens in your eyes. docs/MODES.md, and the plan's big idea 1 (.wt/reports/next-level-plan.md).
//
// Most of the time it's the black-and-white film, the film's own patterns and direction and tricks, with a faint warm-and-cool fringe along every edge, so the white shapes seem tinted.
// The fringe's two colours swap sides on a chord change.
// For 16 to 24 s before one of the song's biggest arrivals it prints in two inks laid out in zones that hold still on the screen, a disc round the middle and everything else, while the camera
// pushes in. On the hit the colour runs out from the middle to the rim, and the chorus lands in black and white, which the eye then tints with the opposite of what it was looking at.
// Once a song the Afterspin: a board of rings turning against each other, which stops dead in line on the band's stop, and goes on turning the other way in your eyes.
import { COLOR } from './retina/color.js';
import { chips, FRINGE, ZONE } from './retina/inks.js';
import { dropsAt } from './retina/drops.js';
import { direct, dress, swayAt, HEAR } from './retina/direct.js';
import './retina/afterspin.js';
import { fineness } from '../score/slot.js';
import { OFF } from '../pattern/layout.js';

const put = (a, i, c) => { a[i] = c[0]; a[i + 1] = c[1]; a[i + 2] = c[2]; a[i + 3] = 1; };
const SWEEP = 1, REACH = 2.2;      // a fringe swap's front: seconds from the middle to the farthest corner
const NO_SONG = 11;                // with no song, the pair swaps this often

export default {
  id: 'retina', name: 'Retina', chips,
  pool: [], borrow: [], ink: null, pass: null, needs: [],      // the film's own patterns, drawn as the film draws them
  glsl: { color: COLOR },
  direct,
  dressCamera: dress,
  uniforms(U, ctx) {
    const a = U.a, t = ctx.t, plan = ctx.score?.retina ?? null, d = dropsAt(plan, t);
    a[0] = d.arrive; a[1] = d.leave; a[2] = ZONE; a[3] = 0;
    put(a, 4, d.rung.mid.deep); put(a, 8, d.rung.mid.pale); put(a, 12, d.rung.out.deep); put(a, 16, d.rung.out.pale);
    // The fringe's pair, and how far the front of its last swap has got
    let n = 0, since = 0;
    if (plan) {
      const C = plan.chords; let lo = 0, hi = C.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (C[m] <= t) lo = m + 1; else hi = m; }
      n = lo; since = lo ? t - C[lo - 1] : 99;
    } else { n = Math.floor(t / NO_SONG); since = t - n * NO_SONG; }
    a[20] = d.fringe; a[21] = n % 2; a[22] = REACH * since / SWEEP; a[23] = 0;
    put(a, 24, FRINGE[0].dark); put(a, 28, FRINGE[0].light); put(a, 32, FRINGE[1].dark); put(a, 36, FRINGE[1].light);
    // The song's sway, turn and lift step back for a drop's push in and the spin's still camera. Its push in and out stays.
    const k = swayAt(plan, t), F = ctx.F;
    if (k < 1) { F[HEAR + 1] *= k; F[HEAR + 2] *= k; F[HEAR + 3] *= k; }
  },
  // src/score/woah.js casts the film's own fold and time tricks between its big moments, never on them. The ones that go small only on a bold sheet, as in Flyer.
  woah: { tricks: ['forever', 'limit', 'screen', 'pearls', 'fan', 'crumple', 'roll', 'slit', 'ghost', 'fringe', 'echo', 'ouchi'], gap: [24, 40], least: 6,
    fits: (id, G, S) => !G.retina && S[OFF['surf.kind']] < 0.5 && !((id === 'screen' || id === 'limit' || id === 'forever') && fineness(S) > 2.45) },
};
