// What tipping costs on the GPU: the same pattern flat and tipped, and flat with a second sheet under it, drawn and waited for, at the page's size. Noisy if anything else is running. Muted.
//   node tools/lab.mjs tests/camcost.mjs --size 1920,1080 --out lab-out/cam
export default async ({ page, log }) => {
  log(await page.eval(async () => {
    const { writeTip } = await import(new URL('src/score/camera.js', location.href).href);
    const { OFF } = await import(new URL('src/pattern/layout.js', location.href).href);
    const gl = app.R.gl, px = new Uint8Array(4), T = window.trippee, out = [`canvas ${app.canvas.width}x${app.canvas.height}`];
    app.governor.enabled = false; app.R.drawScale = 1;
    const measure = () => { gl.finish(); const t0 = performance.now(); T.step(0); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t0; };
    const least = () => { let b = 1e9; for (let i = 0; i < 12; i++) b = Math.min(b, measure()); return b; };
    for (const id of ['checks.twist', 'lattice.master', 'relay.whirl', 'still.mirror', 'waves.current']) {
      T.load(id); app.manual = true; app.t = 8; const G = app.stage.score.gestures[0];
      G.cam = null; const flat = least();
      G.cam = out2 => writeTip(out2, 0.8, 0.4, 2); const tipped = least();
      G.cam = null;
      out.push(`${id}: flat ${flat.toFixed(2)} ms, tipped ${tipped.toFixed(2)} ms`);
    }
    return out.join('\n');
  }));
};
