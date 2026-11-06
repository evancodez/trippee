// Numbers in absolute time, which is how a hand cut says what a pattern does: src/score/cut.js compiles a shot's lanes to this. Each is { off, log, track }: a track of evalTrack knots, ln x on a log lane.
// Before its first knot and after its last a lane holds still. Told to stay, a gesture stays where its long move has got to, as a slip's travel does.
import { evalTrack } from '../curves.js';

export default {
  id: 'cue',
  needs: () => true,
  write(out, { u, t, uT, G, m }) {
    const at = G.freezeU != null ? G.t0 + u * ((G.arcEnd ?? G.t1) - G.t0) : uT ?? t;      // uT: a cut's long move walks with everything else (hearing 1)
    for (const L of m.lanes) { const v = evalTrack(L.track, at); out[L.off] = L.log ? Math.exp(v) : v; }
  },
};
