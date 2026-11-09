// Window (trans9): how a Screen ends. The camera has been flying through a picture that holds a smaller, turned picture of itself, and so on down (src/score/moves/screen.js). Here the
// next pattern is in there too, deep in the middle, and it comes up through the windows towards you, one window at a time, while the camera flies on in. Then the camera lands inside the
// window that holds it: that window fills the frame exactly, untouched and unturned, and that's the next pattern on the plain path. Nothing shrinks, and nothing is laid over anything:
// each pixel is either in that window, where it's the next pattern, or outside it, where it's still the screen.
//   A flight mode, so no new program. uF[F_DIVE] w: 5 (the iris's two-sheet path).   uF[F_XF2] x: -1 (this, not an iris); y: how many windows in from the camera the next pattern starts.
//   The flight itself is the screen's own number, sf.tau in A's slot, which this takes over from the clock that's coming to rest. The shader's half is in src/gl/chunks/main.js.
import { OFF, FRAME } from '../../pattern/layout.js';
import { clamp, lerp, smoother } from '../curves.js';

const DEEP = 10;            // how deep it starts: past nine levels a window's under two pixels across at 1080p, so it's there before anyone can see it
const RISE = 0.55;          // the share of the way it takes to come up to where the camera's going
const EASE = 0.55;          // how much of the flight's speed goes on the ease at each end
const along = x => lerp(x, smoother(x), EASE);
export const isScreen = a => a[OFF['sf.on']] > 0.5 && a[OFF['sf.S']] > 0;
// fx10: the same for a Forever (src/score/moves/forever.js). Its tunnel goes on flying in, and the next pattern is the sheet inside one of its rings, deep in the middle: that ring comes out
// towards you with the rest of the tunnel, one ring among the others, and the camera flies through it. The ring fills the frame and its edge goes out past the corners, and that's the next pattern, plain.
export const isTunnel = a => a[OFF['sf.on']] > 0.5 && a[OFF['lf.b']] > a[OFF['lf.a']];
const LAND = 0.85;      // ln of the ring's radius at the landing: the frame's corners are at .71
// tunnel11: where it starts. Not the sixth ring in, which is 1.4 px across at 1080p and comes out of the vanishing point as a dot: the deepest ring that's still 40 px or so across (ln r -3.4, a half-height being 1),
// which with forever's own rings is the third. And the next pattern in it is a far wall behind the ring: it comes towards you at DEPTH of the ring's pace, so it starts readable, at about an eighth of its size, not a sixtieth, and grows with the flight to exactly itself at the landing.
const LMIN = -2.5, DEPTH = 0.5;

export default {
  id: 'window',
  long: false,
  plan(a, b, ctx) {
    if (!isScreen(a)) return isTunnel(a) ? { kind: 'window', tunnel: true, close: [0] } : null;
    // Two levels on is the frame exactly as it was, and a level a second and a half or so is the screen's own pace
    const K = 2 * Math.max(1, Math.round((ctx.D ?? 4) / 3));
    return { kind: 'window', K, close: [0] };
  },
  enter(st) {
    st.theta = lerp(st.thA, st.thB, st.T); st.solid = lerp(st.sa, st.sb, st.T);
    st.moveA = true; st.moveB = true;
  },
  write(st, A, B, F) {
    if (st.plan.tunnel) return tunnel(st, A, B, F);
    const { plan, x, T } = st, Dv = FRAME.dive * 4, X2 = FRAME.xf2 * 4, y = clamp(along(x));
    const W = lerp(A[OFF['sf.tau']] || 0, plan.K, y), tau = W - 2 * Math.floor(W / 2), done = W - tau;      // levels flown, from where the screen's own flight came to rest: a whole number of levels, so tau 0 at both ends, and at the end the camera's in window K
    const rise = Math.round(DEEP * (1 - smoother(clamp(x / RISE))));
    A[OFF['sf.tau']] = tau; A[OFF['sf.d_']] = 0;
    F[Dv] = A[OFF['sf.dx']]; F[Dv + 1] = A[OFF['sf.dy']]; F[Dv + 2] = 1; F[Dv + 3] = 5;
    F[X2] = -1; F[X2 + 1] = x >= 1 ? 0 : Math.max(0, plan.K - done + rise);
    const by = st.theta - lerp(st.thA, st.thB, T);
    A[OFF.theta] = st.thA + by; B[OFF.theta] = st.thB + by;
    F[FRAME.weight * 4 + 1] = F[FRAME.weight * 4];
  },
};

// fx10. The ring the next pattern's in has ln radius R, and the tunnel's rings are where ln r = a + jD - off, so the tunnel flies with it: the sixth ring in from where the flight came to rest is always the one holding it.
// Inside it, the next pattern at its own scale times e^(LAND - R): exactly itself at the landing.
function tunnel(st, A, B, F) {
  const { x, T } = st, Dv = FRAME.dive * 4, X2 = FRAME.xf2 * 4, y = clamp(along(x));
  const a = A[OFF['lf.a']], D = A[OFF['lf.b']] - a, R0 = a - Math.max(1, Math.floor((a - LMIN) / D)) * D, R = lerp(R0, LAND, y);
  A[OFF['lf.off']] = R0 - R; A[OFF['lf._1']] = 0;
  A[OFF['lf.tw']] *= 1 - smoother(clamp(x / 0.3));      // the rings go round before the one that holds it is big enough to see, so its edge is a ring of the tunnel
  F[Dv] = A[OFF['lf.x']]; F[Dv + 1] = A[OFF['lf.y']]; F[Dv + 2] = 1; F[Dv + 3] = 5;
  F[X2] = -2; F[X2 + 1] = x >= 1 ? 9 : R; F[X2 + 2] = R + DEPTH * (LAND - R);      // the shader scales the sheet inside by e^(z - y)
  const by = st.theta - lerp(st.thA, st.thB, T);
  A[OFF.theta] = st.thA + by; B[OFF.theta] = st.thB + by;
  F[FRAME.weight * 4 + 1] = F[FRAME.weight * 4];
}
