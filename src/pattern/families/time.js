// Tricks with when and how the eye sees, to click. None is in the pool: a film only wears these when a cut asks for them. See src/score/moves/time.js.
import { logring, spokes, plane } from '../kit.js';
import { surged } from '../../score/moves/surge.js';
import { writeSlit, writeFringe, writeWater, timeClock } from '../../score/moves/time.js';

const AXES = [{ id: 'zoom', name: 'zoom', path: 'scale', min: 0.4, max: 3, log: true }, { id: 'turn', name: 'turn', path: 'rot', min: -1.6, max: 1.6 }];
const item = (id, name, g, more = {}) => ({ id: `time.${id}`, name, family: 'time', pool: false, g, arcs: [], flow: {}, axes: AXES, lambda: 0.2, ...more });

// Slit, by hand: it comes up over a few seconds once the picture's arrived.
const slit = (id, name, g, opts, more) => item(id, name, g, {
  time: { id: 'slit', ...opts },
  drive(out, c) { if (c.G.moves?.some(m => m.id === 'slit')) return; writeSlit(out, opts, surged(timeClock(c)), c.t); },
  ...more,
});

export default [
  // A rolling shutter. A board of spokes and rings turns, and each row of the frame sees it a little later than the one above, as a phone's camera sees a propeller.
  slit('shutter', 'Rolling Shutter', { fams: [logring(10 / (2 * Math.PI)), spokes(12)] }, { map: 'sweep', D: 1.6, turn: 0.5, spin: 0.12, ang: Math.PI / 2 }),
  // A plain board with the same shutter, which is the most surprising thing to see bend.
  slit('flag', 'Time Flag', { fams: [plane(2.4, 0), plane(2.4, 90)] }, { map: 'sweep', D: 1.4, turn: 0.45, spin: 0.2, ang: 0.5 }),
  // The middle of the frame is now and the rim is a few seconds ago: every beat leaves the middle and runs out.
  slit('target', 'Now in the Middle', { fams: [plane(2.2, 45), plane(2.2, -45)] }, { map: 'target', D: 2.4, turn: 0.55, push: 0.25 }),
  // The same in rings, each its own moment. They fall out of step and a big moment puts them back.
  slit('rings', 'Rings out of Step', { fams: [plane(2, 0), plane(2, 90)] }, { map: 'target', D: 2.8, bands: 7, turn: 0.55, push: 0.2 }),
  // Bands across the frame, each a moment behind the next.
  slit('venetian', 'Late Bands', { fams: [spokes(10), logring(1.6)] }, { map: 'sweep', D: 2.4, bands: 9, turn: 0.6, spin: 0.1, ang: Math.PI / 2 }),
  // A wave of delay crosses the sheet.
  slit('wave', 'Delay Wave', { fams: [plane(2.4, 30), plane(2.4, 120)] }, { map: 'wave', D: 1.6, wave: 3, waveV: 1.4, turn: 0.4, spin: 0.15, ang: 0.4 }),

  // A hand that exists only while it moves. At rest there's only the sheet.
  item('ghost', 'Ghost Hand', { fams: [plane(5.5, 0)] }, { time: { id: 'ghost' } }),
  item('ghostcheck', 'Ghost on a Board', { fams: [plane(4.4, 20), plane(4.4, 110)] }, { time: { id: 'ghost' } }),

  // A face in a moire. Two line sets, a little out of step, and nothing else: it's in the bands they make.
  item('fringe', 'The Face in the Moire', { fams: [{ y: 17 }, { y: 17 }] }, {
    fine: true,
    time: { id: 'fringe' },
    drive(out, c) {
      if (c.G.moves?.some(m => m.id === 'fringe')) return;
      writeFringe(out, {}, surged(timeClock(c)));
    },
  }),

  // A still picture that turns.
  item('snakes', 'Rotating Snakes', { fams: [logring(13 / (2 * Math.PI)), spokes(26)] }, { time: { id: 'snakes' } }),

  // Dead steady for 24 seconds, and then it stops for six. What you see then isn't on the screen.
  item('waterfall', 'Waterfall', { fams: [{ l1: 3, t1: 8 }] }, {
    drive(out, c) {
      if (c.G.moves?.some(m => m.id === 'waterfall')) return;
      const k = Math.floor(c.t / 30), stops = [];
      for (let i = 0; i <= k; i++) stops.push([24 + 30 * i, 30 + 30 * i]);
      writeWater(out, { stops, ease: 0.45 }, c.t);
    },
  }),
];
