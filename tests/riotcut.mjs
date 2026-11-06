// A hand cut wearing the whole riot set on MGMT, through the real loader, with no sound: does it load with nothing refused, how does each go in and out, and is it within the flash limits?
//   node tools/lab.mjs tests/riotcut.mjs --out lab-out/v3
//   FROM=40 SECS=60 FPS=20 ...     only that stretch
// Writes riotcut.sheet.jpg and riotcut.slices.jpg. The cut's only here, and no film has it.
import { watch, analyse } from '../tools/look.mjs';
const env = process.env;
export default async ({ page, save, log }) => {
  const from = +(env.FROM ?? 40), secs = +(env.SECS ?? 175), fps = +(env.FPS ?? 20), name = env.NAME ?? 'riotcut';
  const info = await page.eval(async from => {
    const T = window.trippee, app = T.app;
    app.governor.enabled = false; app.R.drawScale = 1; app.manual = true; app.paused = false;
    const A = await (await fetch('/lab-out/form/mgmt.json')).json();
    const { compose } = await import('/src/score/compose.js');
    const { patterns } = await import('/src/pattern/library.js');
    const cut = { hash: A.hash, name: 'riot reel', line: 'The whole riot set, one after the other.', shots: [
      { at: 0, id: 'lines.river', gear: [[0, 16]] },
      { at: 47.51, from: 43.67, ambient: [[47.51, 0.5]], id: 'riot.scissor', moves: [{ id: 'scissor', beats: 'half', times: { teeth: [62.39, 77.75] } }] },
      { at: 85.43, from: 81.59, ambient: [[85.43, 0.5]], id: 'riot.ratchet', moves: [{ id: 'ratchet', beats: 'half' }] },
      { at: 112.79, from: 108.95, ambient: [[112.79, 0.5]], id: 'riot.bellows', moves: [{ id: 'bellows', beats: 'half' }] },
      { at: 151.19, from: 147.35, ambient: [[151.19, 0.5]], id: 'riot.wring', moves: [{ id: 'wring', beats: 'half' }] },
      { at: 192.95, from: 189.11, ambient: [[192.95, 0.5]], id: 'riot.scissor', moves: [{ id: 'scissor', beats: 'strong', every: 4, sides: [-1] }] },
      { at: 224.15, from: 220.31, id: 'rooms.hall' },
    ] };
    const score = compose(A, 7, { patterns, aspect: 16 / 9, cut });
    window.__score = score;
    app.stage.setScore(score);
    app.t = from; T.seek(from);
    return { refused: score.refused, gestures: score.gestures.map(g => `${g.t0.toFixed(1)} ${g.pattern.id} morph ${g.morph?.toFixed(1)} moves ${(g.moves ?? []).map(m => m.id).join()} hits ${(g.moves ?? []).find(m => m.beats)?.beats?.length ?? 0}`) };
  }, from);
  log('refused', JSON.stringify(info.refused));
  log(info.gestures.join('\n'));
  const w = await watch(page, save, { name, seconds: secs, fps, cols: +(env.COLS ?? 16), rows: +(env.ROWS ?? 14) });
  const a = analyse(w);
  log(JSON.stringify({ flashWhole: a.flashesPerSecondWholeFrame, flashTile: a.flashesPerSecondAnyTile, medianDiff: a.medianDiff, maxDiff: a.maxDiff, step: a.largestLuminanceStepPerFrame, solids: a.solids, edges: a.edgeRange }));
  // Where the tile flashes are, in 10 s bins
  const swings = series => { const out = []; let dir = 0, pivot = series[0]; series.forEach((v, i) => { if (dir >= 0 && v > pivot) { pivot = v; dir = 1; } if (dir <= 0 && v < pivot) { pivot = v; dir = -1; } if (dir === 1 && pivot - v >= 25.5) { out.push(i); dir = -1; pivot = v; } else if (dir === -1 && v - pivot >= 25.5) { out.push(i); dir = 1; pivot = v; } }); return out; };
  const worst = {};
  for (let k = 0; k < 16; k++) { const s = swings(w.tiles.map(t => t[k])); for (let i = 0; i < s.length; i++) { let j = i; while (j < s.length && s[j] - s[i] < fps) j++; const n = Math.floor((j - i) / 2), bin = Math.floor(w.time[s[i]] / 10) * 10; worst[bin] = Math.max(worst[bin] ?? 0, n); } }
  log('tile flashes per second, worst in each 10 s', JSON.stringify(worst));
  const wholeSw = swings(w.mean).map(i => w.time[i]);
  log('whole-frame swings at', JSON.stringify(wholeSw.slice(0, 30)));
  const errors = page.logs.filter(l => /\[error\]|\[exception\]/.test(l));
  if (errors.length) log('errors', errors.slice(0, 5));
};
