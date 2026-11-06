// The hand. Placeholder keys until the verbs land.
export function init(app) {
  addEventListener('keydown', e => {
    if (e.key === ' ') { app.paused = !app.paused; e.preventDefault(); }
    if (e.key === 'ArrowRight' || e.key === 'n') app.stage.go(app.patterns[(app.patterns.indexOf(app.lastFrame.G.pattern) + 1) % app.patterns.length], app.t);
    if (e.key === 'w') app.stage.wander(app.t);
  });
}
