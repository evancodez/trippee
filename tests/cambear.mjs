// What each pattern can bear. Rows are patterns from the films, columns a hard camera state each, held still. Muted, and no song is loaded. Uses a camera function on the gesture, the interface fillSlot reads.
//   IDS=checks.twist,dials.board node tools/lab.mjs tests/cambear.mjs --out lab-out/cam
const STATES = [
  { n: 'plain' }, { n: 'tip.5', tip: 0.5 }, { n: 'tip.9', tip: 0.9 }, { n: 'tip.9 bank', tip: 0.9, dir: 0.7 }, { n: 'tip.9 wide', tip: 0.9, lens: 1.1 }, { n: 'pan2', px: 2, py: 0.7 }, { n: 'pan5', px: 5, py: -2 }, { n: 'in.8', z: 0.8 }, { n: 'out.8', z: -0.8 }, { n: 'roll1.2', spin: 1.2 },
];
const IDS = (process.env.IDS || 'checks.twist,checks.vega,checks.cloth,checks.crush,checks.floor,lattice.star,lattice.master,lattice.teeth,dots.sheet,dots.gradient,waves.current,dials.board,dials.target,dials.sunburst,dials.rooms,coins.cone,coins.dart,riley.blaze,riley.mosaic,riley.octagrid,still.confocal,still.mirror,still.mirror6,rooms.hall,rooms.corridor,rooms.dive,rooms.tunnel,relay.floor,relay.whirl,relay.tour,relay.rooms,relay.weave,relay.saw,riot.scissor,riot.bellows').split(',');
const draw = async ({ ids, states, tw, th, cols }) => {
  const { getRig, shot } = await import(new URL('src/music/rehearse.js', location.href).href);
  const { OFF, SLOT_FLOATS } = await import(new URL('src/pattern/layout.js', location.href).href);
  const { writeTip } = await import(new URL('src/score/camera.js', location.href).href);
  const { fineness } = await import(new URL('src/score/slot.js', location.href).href);
  const R = await getRig(), W = 320, H = 180, big = new Uint8Array(W * H * 4), tmp = new OffscreenCanvas(W, H), tg = tmp.getContext('2d');
  const cap = 11, c = document.createElement('canvas'); c.width = 90 + states.length * tw; c.height = 16 + ids.length * th;
  const g = c.getContext('2d'); g.fillStyle = '#161616'; g.fillRect(0, 0, c.width, c.height); g.font = '10px monospace'; g.fillStyle = '#fff';
  states.forEach((s, i) => g.fillText(s.n, 90 + i * tw + 2, 11));
  for (let r = 0; r < ids.length; r++) {
    const p = app.byId[ids[r]]; if (!p) continue;
    g.fillStyle = '#ffd23c'; g.fillText(ids[r].slice(0, 15), 2, 16 + r * th + th / 2);
    for (let i = 0; i < states.length; i++) {
      const s = states[i];
      const G = { t0: -8, t1: 3600, arcEnd: 18, pattern: p, cam(out) {
        const sc = out[OFF.scale];
        out[OFF.scale] *= Math.exp(s.z ?? 0); out[OFF.rot] += s.spin ?? 0; out[OFF.tx] += (s.px ?? 0) / sc; out[OFF.ty] += (s.py ?? 0) / sc;
        if (s.tip) writeTip(out, s.tip, s.dir ?? 0, s.lens ?? 2.4);
      } };
      const S = { gestures: [G], phi: t => t * 0.25 };
      shot(R, S, 4, W, H, big);
      const d = tg.createImageData(W, H);
      for (let y = 0; y < H; y++) d.data.set(big.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
      tg.putImageData(d, 0, 0);
      g.drawImage(tmp, 90 + i * tw + 1, 16 + r * th + 1, tw - 2, th - 2);
    }
    await new Promise(res => setTimeout(res));
  }
  return c.toDataURL('image/jpeg', 0.85);
};
export default async ({ page, log, save, sleep }) => {
  const chunk = +(process.env.CHUNK || 12);
  for (let k = 0; k * chunk < IDS.length; k++) {
    const ids = IDS.slice(k * chunk, (k + 1) * chunk);
    save(`bear-${k}.jpg`, await page.eval(draw, { ids, states: STATES, tw: 170, th: 96, cols: STATES.length }));
    log('sheet', k, ids.join(' '));
  }
};
