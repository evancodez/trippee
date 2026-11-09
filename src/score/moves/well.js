// Time Well (well11, v3.0). The screen trick (screen.js), with each window another moment of the song. A window is cut in the sheet and the sheet inside it draws back into it, and another in that, and the camera flies on
// through them, as the screen does. But going down is going through time:
//   in a build the inner windows run ahead: before a strong beat the deepest window turns first, then the next one out, then the next, a ripple climbing toward you that reaches the frame on the beat.
//   in a breakdown it runs the other way: each beat starts at the frame and falls inward, and the middle holds the last bars as moving echoes, like old video feedback.
//   on a landing the delay passes through zero, and the whole tower turns as one.
// It's all the table of other moments (src/score/time-sheet.js) read by window instead of by place: chunks/time.js wellAt, called from inside the screen's fold. Nothing's kept from frame to frame.
// Its way in is the screen's: the first window is cut from the sheet. Its way out is the screen's too, and cast to a gesture's change it doesn't shut: the change is a Window (src/score/xform/window.js) and the camera flies on into the next pattern.
//
//   G.moves = [{ id: 'well', S, turn, speed, kick, ahead, back, ... }]     and the options in cueFold (foldkit.js)
//     kick   radians the sheet turns through each strong beat, one way and back the next, surging: what you see each window do at its own moment. Default .42
//     ahead  seconds a level the inner windows run ahead, in a build. Default one beat
//     back   seconds a level they fall behind, in a breakdown. Default half a bar
// By hand (a pattern's drive and time): wellWith.
import { OFF } from '../../pattern/layout.js';
import { clamp, smoother, lerp, evalTrack } from '../curves.js';
import { clockOf } from './surge.js';
import { momentsOf } from '../hear.js';
import screen, { screenWith } from './screen.js';
import { songNow, inBy } from './foldkit.js';
import { timeClock } from './time.js';

// The table has 48 moments. Four to a level, and the first four before the first window, so the frame's own pixels (which are part way to the first window as the camera flies) are near now and never off the end.
const STEP = 4 / 47, NOW = 4 / 47;

// How far behind (+) or ahead (-) each level is, seconds, through the song: behind by default, ahead in the bars before each landing, and through zero on it.
function delayLane(m, ctx) {
  const { A, M, bar } = ctx, beat = bar / 4, ahead = m.ahead ?? beat, back = m.back ?? bar / 2;
  const lands = A && M?.bar ? momentsOf(A, M).filter(x => x.sign > 0 && x.s >= 0.45 && x.t > m.from - bar && x.t < m.to + 6 * bar).map(x => x.t).sort((a, b) => a - b) : [];
  const K = [[m.from - 4 * bar, back]];
  let last = -Infinity;
  for (const tb of lands) {
    if (tb - last < 6 * bar) continue;      // one build to one landing
    const pre = Math.max(tb - 6 * bar, K.at(-1)[0] + bar);
    if (pre >= tb - 1.5 * bar) continue;
    K.push([pre, back], [tb - 3 * bar, -ahead], [tb - bar, -ahead], [tb + bar, back], [tb + 5 * bar, back]);      // the last two bars into it run ahead, then from a bar before to a bar after it crosses: through zero on the hit at its fastest
    last = tb;
  }
  return K;
}
const laneAt = (K, t) => {
  if (t <= K[0][0]) return K[0][1];
  for (let i = 1; i < K.length; i++) if (t < K[i][0]) { const [a, x] = K[i - 1], [b, y] = K[i]; return lerp(x, y, smoother((t - a) / (b - a))); }
  return K.at(-1)[1];
};
// The turn on the strong beats: a twist one way through one, back through the next, so it never winds up and can go back to nothing at either end.
// wellfix12: a sine on the plain beat clock, not a zigzag on the surged one. The zigzag turned round at full speed on every strong beat, a jerk.
// This one is fastest on the beat, as the zigzag was, but slows to turn round between beats, so it never reverses at speed. Through one beat one way, through the next back: it still never winds up.
const zig = s => 0.5 * Math.sin(Math.PI * s);
const wantWell = (want, dl) => { want.map = 'well'; want.now = NOW; want.step = STEP; want.D = dl / STEP; };

// By hand there's no song to read: it looks ahead and back by turns, sixteen seconds round, through zero each way.
export const wellWith = (o = {}) => {
  const drive = screenWith(o), kick = o.kick ?? 0.42;
  return (out, c) => {
    if (c.G.moves?.some(m => m.id === 'well' || m.id === 'screen')) return;
    drive(out, c);
    out[OFF.rot] += kick * zig(timeClock(c));
  };
};
export const wellTime = { id: 'well' };

export default {
  id: 'well',
  needs: slot => slot[OFF['surf.kind']] < 0.5,      // turning the frame about on a floor would show its horizon
  cue(m, ctx) {
    m.kick ??= 0.42;
    const done = screen.cue(m, ctx);
    if (!done) return null;
    globalThis.app?.R?._wantTime?.(0);      // and its time program, while the film's still coming
    done._lane = delayLane(done, ctx);
    return done;
  },
  write(out, c) {
    screen.write(out, c);
    const { m, t } = c, k = m.into ? inBy({ ...m, close: 0 }, t) : inBy(m, t);
    if (k > 0) out[OFF.rot] += m.kick * k * zig(evalTrack(clockOf(m), t));
  },
  sheet(want, m, c) {
    if (c.hand) {
      const up = smoother((c.t - c.begin) / 4), S = songNow(c);
      const dl = up * c.fade * (S.P || 0.5) * Math.sin((c.t - c.begin) * Math.PI / 8);
      if (Math.abs(dl) > 1e-4) wantWell(want, dl);
      return;
    }
    // In by how far the windows are open: shut, there's nothing to be another moment of
    const t = c.t, k = smoother(clamp((t - m.from) / m.open)) * (m.into ? 1 : smoother(clamp((m.to - t) / m.close)));
    const dl = laneAt(m._lane, t) * k * c.fade;
    if (Math.abs(dl) > 1e-4) wantWell(want, dl);
  },
};
