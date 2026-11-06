// Boot order and the frame loop. The real work is elsewhere.
import { Renderer } from './gl/renderer.js';
import { frame } from './score/frame.js';
import { Stage } from './stage.js';
import { patterns, byId, families } from './pattern/library.js';

export const VERSION = 'v0.1';
const canvas = document.getElementById('c');
const R = new Renderer(canvas);
const stage = new Stage(Date.now() % 100000);

const app = window.app = {
  R, stage, patterns, byId, families, canvas, VERSION,
  t: 0, manual: false, paused: false, edits: {}, lastFrame: null, onFrame: [],
  clock: null,    // when a song is playing, a function returning song seconds
};

function fit() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  R.resize(canvas.clientWidth, canvas.clientHeight, dpr);
}
new ResizeObserver(fit).observe(canvas);
fit();

function render() {
  stage.update(app.t);
  app.lastFrame = frame(stage.score, app.t, R, app.edits);
  R.brush(app.brush || {});
  app.brush = null;
  R.draw();
  for (const f of app.onFrame) f(app.t);
}

let last = 0;
function loop(now) {
  if (app.manual) return;
  const dt = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;
  if (app.clock) app.t = app.clock();
  else if (!app.paused) app.t += dt;
  render();
  requestAnimationFrame(loop);
}

// The debug surface, used by tools/lab.mjs and tests
window.trippee = {
  ready: false, canvas, version: VERSION, app,
  time: () => app.t,
  step(dt) { app.manual = true; app.t += dt; render(); return app.t; },
  seek(t) { app.manual = true; app.t = t; render(); },
  list: () => patterns.map(({ id, name, family }) => ({ id, name, family })),
  // Show one pattern straight away, with no way in: for looking at a pattern on its own.
  load(id, { arcs = true } = {}) {
    const p = byId[id];
    if (!p) throw new Error('no pattern ' + id);
    stage.score.gestures = [{ t0: 0, t1: 3600, arcEnd: 26, pattern: p, pol0: 0, pol1: 0, inDur: 1, outDur: 1, arcs: arcs ? undefined : [] }];
    stage.hold = true; app.t = 0; render();
  },
  capture() { render(); return canvas.toDataURL('image/png'); },
  metrics() { const f = app.lastFrame; return { t: app.t, pattern: f?.G?.pattern?.id, theta: f?.theta, w: canvas.width, h: canvas.height }; },
};

R.whenReady().then(() => {
  render();
  window.trippee.ready = true;
  requestAnimationFrame(loop);
});

// A few keys until the real interface lands
addEventListener('keydown', e => {
  if (e.key === ' ') { app.paused = !app.paused; e.preventDefault(); }
  if (e.key === 'ArrowRight' || e.key === 'n') stage.go(patterns[(patterns.indexOf(app.lastFrame.G.pattern) + 1) % patterns.length], app.t);
  if (e.key === 'w') stage.wander(app.t);
});
