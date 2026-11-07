// How a generated film wears the fold set, behind directing.folds (?folds=1). A pure function of the song and the seed, like everything else that makes a film. It runs last, in compose, when everything's where it's going to be.
// One fold to a gesture, on the patterns the film's already chosen, going in and out with its body: the transformation either side of it is as it was. A section that comes back wears what it wore, and two gestures running don't wear the same one.
import { rng } from '../curves.js';
import { MOVES } from './index.js';
import { base } from '../slot.js';
import { OFF, FAMILIES } from '../../pattern/layout.js';

const ORDER = ['forever', 'crumple', 'limit', 'fan', 'screen', 'pearls'], ROLL = 'roll';
const LEAST_S = 6.5, LEAST_BARS = 3.2;       // a body any shorter than this has no room to get in, go somewhere and get out
const RELAY_LEAST_S = 12;                    // a Relay this long can give way to one, every other time
// Creases and tiles want one set of lines to work on. On a check they're only a busier check.
const LINES_ONLY = new Set(['crumple', 'limit']);
const crossed = G => { const s = base(G.pattern); let n = 0; for (let i = 0; i < FAMILIES; i++) if (s[OFF[`f${i}.on`]] >= 0.5 && Math.abs(s[OFF[`f${i}.d`]]) <= 1.01) n++; return n > 1; };

export function wearFolds(score, ctxOf, { A, bar, seed = 1 }) {
  const g = score.gestures, r = rng(seed * 7919 + 13), left = ORDER.slice();
  for (let i = left.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [left[i], left[j]] = [left[j], left[i]]; }
  const worn = new Map();
  let at = 0, prev = null, relays = 0;
  for (let i = 1; i < g.length - 1; i++) {
    const G = g[i], a = G.t0, end = G.t1 - (G.morph || 0), body = end - a;
    const relay = G.moves?.length === 1 && G.moves[0].id === 'relay' && body >= RELAY_LEAST_S && relays++ % 2 === 0;
    if (!relay && (G.moves?.length || G.hero || G.pattern.drive) || G.xform?.id === 'iris' || body < Math.max(LEAST_S, LEAST_BARS * bar)) { prev = null; continue; }
    const mid = (a + end) / 2, label = A.segments?.find(s => mid >= s.t0 && mid < s.t1)?.label ?? '';
    const said = worn.get(label);
    // A big moment in the middle of it: a roll takes it there and back, and nothing else is needed.
    const rolled = MOVES[ROLL].cue({ id: ROLL, from: a, to: end, D: Math.max(7, 3.5 * bar) }, ctxOf(G));
    if (rolled && r() < 0.35 && prev !== ROLL) { G.moves = [rolled]; prev = ROLL; continue; }
    let id = said && said !== prev ? said : left[at++ % left.length];
    for (let tries = 0; tries < left.length && (id === prev || (LINES_ONLY.has(id) && crossed(G))); tries++) id = left[at++ % left.length];
    const made = MOVES[id].cue({ id, from: a, to: end, open: Math.min(3, 0.3 * body / bar), close: Math.min(2.5, 0.22 * body / bar) }, ctxOf(G));
    if (!made) { prev = null; continue; }
    G.moves = [made]; prev = id;
    if (!said) worn.set(label, id);
  }
}
