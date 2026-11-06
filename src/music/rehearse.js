// A rehearsal: the whole film is played once, small and out of sight, before anyone sees it. Patterns are written by hand and any of
// them can do something sudden in a moment nobody looked at (a tear changing colour in one frame, say). A jump in brightness is the
// one thing that must never reach the screen, so a pattern that makes one sits this song out.
import { Renderer } from '../gl/renderer.js';
import { frame } from '../score/frame.js';

const W = 96, H = 54, STEP = 0.2, JUMP = 0.3;     // a jump: 30% of full scale in a fifth of a second

let rig = null;
const getRig = () => rig ??= (async () => {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const R = new Renderer(c);
  await R.whenReady();
  R.resize(W, H, 1);
  return R;
})();

// Returns { jumps: [{ t, by, id }], bad: [pattern ids], seconds }
export async function rehearse(score, until, onProgress = () => {}) {
  const t0 = performance.now();
  const R = await getRig(), gl = R.gl, px = new Uint8Array(W * H * 4);
  const n = Math.ceil(until / STEP), jumps = [];
  let prev = null;
  for (let i = 0; i <= n; i++) {
    const t = i * STEP, f = frame(score, t, R, null);
    R.draw();
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let s = 0;
    for (let k = 1; k < px.length; k += 4) s += px[k];
    const L = s / (W * H) / 255;
    if (prev !== null && Math.abs(L - prev) >= JUMP) jumps.push({ t: +t.toFixed(2), by: +(L - prev).toFixed(3), id: f.G.pattern.id });
    prev = L;
    if (i % 50 === 0) { onProgress(i / n); await new Promise(r => setTimeout(r, 0)); }
  }
  return { jumps, bad: [...new Set(jumps.map(j => j.id))], seconds: (performance.now() - t0) / 1000 };
}
