// Boot order and the frame loop. The real work is elsewhere.
import { Renderer } from './gl/renderer.js';
import { frame } from './score/frame.js';
import { Stage } from './stage.js';
import { Governor } from './gl/governor.js';
import { patterns, byId, families } from './pattern/library.js';

export const VERSION = 'v1.1';
const canvas = document.getElementById('c');
const R = new Renderer(canvas);
// A different wander each visit, from a count rather than the clock, so a given seed always gives the same picture.
let visit = 1;
try { visit = (+localStorage.getItem('trippee.visit') || 0) + 1; localStorage.setItem('trippee.visit', visit); } catch { /* the first wander, then */ }
const stage = new Stage(visit * 7919 % 100000);
const governor = new Governor(R);

const app = window.app = {
  R, stage, patterns, byId, families, canvas, VERSION, governor,
  t: 0, manual: false, paused: false, edits: {}, lastFrame: null, onFrame: [],
  clock: null,    // when a song is playing, a function returning song seconds
};

let dprSeen = 0;
function fit() {
  dprSeen = devicePixelRatio;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (R.resize(canvas.clientWidth, canvas.clientHeight, dpr)) governor.resized();
}
new ResizeObserver(fit).observe(canvas);
fit();

function render() {
  stage.update(app.t);
  app.edits.staticG = stage.staticG;
  app.lastFrame = frame(stage.score, app.t, R, app.edits);
  R.brush(app.brush || {});
  app.brush = null;
  R.draw();
  for (const f of app.onFrame) f(app.t);
}

let last = 0, looping = false;
function loop(now) {
  if (app.manual) { looping = false; return; }
  if (devicePixelRatio !== dprSeen) fit();     // dragged to another screen: the CSS size is the same, the pixels aren't
  const real = (now - last) / 1000 || 0, dt = Math.min(0.05, real);
  last = now;
  if (app.clock) app.t = app.clock();
  else if (!app.paused) app.t += dt;
  render();
  const f = app.lastFrame;
  governor.tick(real, Math.abs(f.theta) >= f.solid - 1e-3);
  requestAnimationFrame(loop);
}

// The debug surface, used by tools/lab.mjs and tests
window.trippee = {
  ready: false, canvas, version: VERSION, app,
  time: () => app.t,
  step(dt) { app.manual = true; app.t += dt; render(); return app.t; },
  run() { app.manual = false; if (!looping) { looping = true; last = 0; requestAnimationFrame(loop); } },
  seek(t) { app.manual = true; app.t = t; render(); },
  list: () => patterns.map(({ id, name, family }) => ({ id, name, family })),
  // Show one pattern straight away, with no way in: for looking at a pattern on its own.
  // With sweep: true it plays one whole gesture of `len` seconds, out of a solid and into the other solid.
  load(id, { arcs = true, sweep = false, len = 26, inDur = 6, outDur = 6 } = {}) {
    const p = byId[id];
    if (!p) throw new Error('no pattern ' + id);
    stage.score.gestures = [{ t0: 0, t1: 3600, arcEnd: len, pattern: p, arcs: arcs ? undefined : [] }];
    stage.score.handover = null;
    stage.hold = !sweep; app.t = 0; render();
  },
  // One pattern becoming another, for looking at a morph on its own: it starts straight away and takes dur seconds
  morph(a, b, dur = 16, hold = 2) {
    const A = byId[a], B = byId[b];
    if (!A || !B) throw new Error('no pattern ' + a + ' or ' + b);
    stage.score.gestures = [
      { t0: -20, t1: hold + dur, arcEnd: hold + dur, pattern: A, morph: dur },
      { t0: hold + dur, t1: 3600, arcEnd: hold + dur + 26, pattern: B },
    ];
    stage.score.handover = null;
    stage.hold = true; app.t = 0; render();
  },
  // Draws one pattern at the middle of its move, for looking at many at once
  still(id, u = 0.5) { this.load(id); app.manual = true; app.t = 26 * u; render(); },
  capture() { render(); return canvas.toDataURL('image/png'); },
  metrics() { const f = app.lastFrame; return { t: app.t, pattern: f?.G?.pattern?.id, theta: f?.theta, w: canvas.width, h: canvas.height }; },
};

// Each of these owns its own files and exports init(app). A missing or failing one must not stop the picture.
async function attach(path) {
  try { const m = await import(path); await m.init?.(app); }
  catch (e) { console.error(`${path} failed to start:`, e); }
}

R.whenReady().then(async () => {
  render();
  await Promise.all(['./music/song.js', './tools/input.js', './ui/ui.js'].map(attach));
  window.trippee.ready = true;
  window.trippee.run();
});
