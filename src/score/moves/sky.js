// The sheet as a world, as stretches of a song: kinds 9 to 11 of the sheet in space (src/gl/chunks/sky.js), on the slot's own space numbers, so arcs, knobs, slides, flights and the song all work on it as on the others.
// Each comes up out of the flat sheet and goes back into it: with nothing up, it's looked straight down at from the height of its own lens, and that's exactly the frame.
//
//   G.moves = [{ id: 'dome' }]     the floor curls up all round you into a ball you're inside, closing overhead, and the sheet pours out of the point up there, down the walls and under you. loop: { a, b }, song
//                                  seconds: between them the camera tips back and looks up into it, banking one way and the other, so the floor curls over into the sky, highest at the middle: put that on a hit.
//                                  (It went right over at first, and the point it all closes into went through the middle of the frame at speed: a tile flashed three times a second.)
//   G.moves = [{ id: 'planet' }]   the sheet gathers into a ball under you, in a sky that's the same sheet gathered round it, and you go round it, leaning out to see its edge against the sky
//   G.moves = [{ id: 'canyon' }]   the sheet folds into steps going up either side of a floor, and you go down into it and fly along it. The steps jump up on the strong beats
//   G.moves = [{ id: 'skim' }]     low between a floor and a ceiling of the same sheet that curve towards each other ahead, going opposite ways. A strong beat closes them on you a little
//
// Every one of them: from, to (song seconds; by default the shot's body), lead, coast (how long it takes to come up, and to go back), fly (how fast it travels), heave (how hard it surges into each strong beat),
// lift (how much each strong beat lifts it). As in space.js, the strong beats are the song's own, the tune leans the camera, and none of it changes how bright anything is.
import { clamp, smoother } from '../curves.js';
import { writeSpace, kickAt, surgeAt, tuneAt } from './space.js';
import { OFF, FAMILIES } from '../../pattern/layout.js';

const LENS = 2.4;      // the lens a flat sheet is looked at with: from this high, straight down, it's exactly the frame
const TAU = 2 * Math.PI;
const I = s => s * s * s * s * (s * (s - 3) + 2.5);      // the integral of smoother from 0 to s

// Its life, 0 flat to 1 fully up, and how far it has travelled: the integral of that, so it picks up speed as it comes up and comes to rest as it goes flat, and never lurches.
// With no `to` on a library pattern it stays up; a library pattern's own round says when it goes back.
export function lifeOf(G, t, m, lead0, coast0) {
  const from = m.from ?? G?.t0 ?? 0, lead = m.lead ?? lead0, coast = m.coast ?? coast0;
  const endless = m.to == null && (G?.t1 ?? 1e9) > 3000;
  const to = m.to ?? (G.morph ? G.t1 - G.morph : G.t1), top = Math.max(from + lead, to - coast);
  const a = clamp((t - from) / lead), b = endless ? 0 : clamp((t - top) / coast);
  const k = smoother(a) * (1 - smoother(b));
  const d = t <= from ? 0 : lead * I(a) + Math.max(0, Math.min(t, top) - (from + lead)) + (endless ? 0 : coast * (b - I(b)));
  return { k, d, from, to };
}

// How big the sheet's biggest cells are, in frame units: half the longest period of its sets of stripes. Flying low over cells as big as a quarter of the frame, each one going by is a quarter of the frame
// going black and white, so how low and how fast is reckoned from this (a cut can say H and fly itself). Rings and spokes don't count.
export function cellOf(s) {
  let cell = 0;
  for (let i = 0; i < FAMILIES; i++) {
    if (s[OFF[`f${i}.on`]] < 0.5) continue;
    const k = Math.hypot(s[OFF[`f${i}.x`]], s[OFF[`f${i}.y`]]) * Math.abs(s[OFF.freq] || 1) / Math.max(Math.abs(s[OFF.scale] || 1), 1e-3);
    if (k > 0.05) cell = Math.max(cell, 0.5 / k);
  }
  return clamp(cell || 0.2, 0.06, 1.2);
}
// How low and how fast over sheet s, for a cut or a film to put on the move: low enough to be flying, and high enough that the cells under you are a few to a quarter of the frame, slow enough that they go by at a
// few a second at most
export const flightOver = (id, s) => {
  const c = cellOf(s);
  if (id === 'canyon') return { H: clamp(5.2 * c, 0.6, 2.6), fly: clamp(1.6 * c, 0.1, 0.45), W: clamp(2.6 * c, 0.4, 1.4), floor: clamp(3 * c, 0.4, 1.6), Q: clamp(1.3 * c, 0.2, 0.6) };
  if (id === 'skim') return { H: clamp(3.4 * c, 0.5, 1.6), fly: clamp(2.6 * c, 0.15, 0.75), sky: clamp(3.4 * c, 0.5, 1.6) * 2.6 };
  if (id === 'dome') return { H: clamp(3.6 * c, 0.85, 1.5), fly: clamp(2.2 * c, 0.15, 0.5) };
  return {};
};

// ---------------------------------------------------------------- the dome
// You're inside: the floor curls up on every side, and the walls close over you to a point. The camera goes down and looks ahead along the floor, which goes by under you and up the wall behind.
// The ball breathes on each strong beat, and you surge forward into it. In a loop it rises towards the middle of the ball and looks up into it, so the sheet's the sky.
export function domeNumbers(G, t, c, m = {}) {
  const { k, d } = lifeOf(G, t, m, 7, 7), kick = kickAt(t), tune = tuneAt(c);
  const curl = smoother(k / 0.6), look = smoother((k - 0.25) / 0.75);
  const lp = m.loop ? clamp((t - m.loop.a) / Math.max(m.loop.b - m.loop.a, 0.5)) : 0, up = Math.sin(Math.PI * lp) ** 2, bank = Math.sin(2 * Math.PI * smoother(lp));
  const K = (m.K ?? 0.42) * curl * (1 + (m.lift ?? 0.1) * kick * k);
  const R = K > 1e-6 ? 1 / K : Infinity;
  // Looking up, it rises towards the middle of the ball, so all of it's about as far off
  const h = LENS + ((m.H ?? 0.85) - LENS) * look + (Number.isFinite(R) ? Math.max(0.45 * R - (m.H ?? 0.85), 0) * up * look : 0);
  const lens = LENS + ((m.lens ?? 1.3) - LENS) * look;
  // Looking up into it, the sheet up there is crowded and it pours more slowly, or it shimmers (PPP 95 to 97 s: frames 100/255 apart). Its speed is k less most of up: a position, so it never stops or lurches
  const T = m.loop ? Math.max(m.loop.b - m.loop.a, 0.5) : 0, slow = T * (lp / 2 - Math.sin(2 * Math.PI * lp) / (4 * Math.PI)) * (m.calm ?? 0.75);
  const fly = (m.fly ?? 0.42) * (d - slow) + (m.heave ?? 0.4) * surgeAt(t) * k * (1 - 0.75 * up);
  return {
    kind: 9, amp: K,
    pitch: ((m.P ?? 1.45) + ((m.up ?? 1.78) - (m.P ?? 1.45)) * up) * look + 0.05 * tune * look, yaw: 0.22 * tune * look, roll: ((m.bank ?? 0.22) * bank + 0.06 * tune) * look, dist: lens,
    x: 0, y: 0, z: h,
    bowl: 0, q: fly,
  };
}

// ---------------------------------------------------------------- the planet
// The sheet gathers into a ball under you, the top of it still the sheet you were looking at, and round it a sky: the same sheet gathered into a bigger ball, its lines turned and as bold, further off.
// You go round it: the camera leans out over its side, so you see its edge against the sky, and goes round it, always looking at its middle. It turns under you, and the sky goes the other way, slower.
// A strong beat brings you in a little.
export function planetNumbers(G, t, c, m = {}) {
  const { k, d } = lifeOf(G, t, m, 8, 8), kick = kickAt(t), tune = tuneAt(c);
  const gather = smoother(k / 0.7), orbit = smoother((k - 0.4) / 0.6);
  const K = (m.K ?? 1.0) * gather, h = LENS, H = m.sky ?? 3.4;
  const lat = (m.lat ?? 0.8) * orbit * (1 + 0.12 * Math.sin(0.11 * d)), lon = ((m.yaw ?? 0) + (m.spin ?? 0.05) * d + 0.2 * tune) * orbit;
  let x = 0, y = 0, z = h, sky = 1;
  if (K > 1e-6) {
    const R = 1 / K, D = R + h / (1 + (m.lift ?? 0.08) * kick * k);
    x = D * Math.sin(lat) * Math.sin(lon); y = -D * Math.sin(lat) * Math.cos(lon); z = -R + D * Math.cos(lat);
    sky = (m.bold ?? 0.85) * (D + R + H) / h;      // the sky's lines as big as the ball's top, from as far off as its bottom is
  }
  const fly = (m.fly ?? 0.3) * d + (m.heave ?? 0.25) * surgeAt(t) * k, way = m.way ?? 0.5;
  return {
    kind: 10, amp: K, f: H, ph: m.skyTurn ?? Math.PI / 4,
    pitch: lat, yaw: lon, roll: 0.04 * tune * orbit, dist: h,
    x, y, z, a: sky,
    bowl: Math.cos(way) * fly, q: Math.sin(way) * fly, pix: -0.35 * Math.sin(way) * fly, w: 0.35 * Math.cos(way) * fly,
  };
}

// ---------------------------------------------------------------- the canyon
// The sheet folds into steps: a floor, and steps going up either side of it, the sheet unfolded across every tread and down every wall so it lies flat on each. From above that's bands of the sheet
// coming apart, then the camera goes down into it and looks along it, and flies, weaving and leaning. The world curves up ahead, so there's no horizon. The steps jump up on the strong beats, their walls
// stretching to it so the lines on the treads stay where they are.
export function canyonNumbers(G, t, c, m = {}) {
  const { k, d } = lifeOf(G, t, m, 7, 7), kick = kickAt(t), tune = tuneAt(c);
  const fold = smoother(k / 0.85), look = smoother((k - 0.12) / 0.88);      // the camera comes up out of the canyon over the whole of the way back: quicker, the floor swept across the frame (MGMT 142 s, the guard swapped it)
  const q0 = (m.Q ?? 0.22) * fold, q = q0 * (1 + (m.lift ?? 0.1) * kick * k);
  const lens = LENS + ((m.lens ?? 1.3) - LENS) * look, h = LENS + ((m.H ?? 0.87) - LENS) * look;
  const sway = Math.sin(0.11 * d), fly = (m.fly ?? 0.27) * d + (m.heave ?? 0.15) * surgeAt(t) * k;
  return {
    kind: 11, amp: q, f: m.W ?? 0.43, ph: q0,
    pitch: (m.P ?? 1.15) * look + 0.03 * tune * look, yaw: (0.16 * sway + 0.07 * tune) * look, roll: -0.12 * sway * look, dist: lens,
    x: (m.weave ?? 0.12) * Math.sin(0.11 * d - 0.6) * look, y: 0, z: h, a: (m.bowl ?? 0.16) * look,
    bowl: 0, q: fly, pix: m.floor ?? 0.5,
  };
}

// ---------------------------------------------------------------- skimming
// Low over a ball so big its edge is only a little way off, and under its sky, close overhead: a floor and a ceiling of the same sheet, turned against each other, curving towards each other ahead into one edge.
// The floor rushes at you and the ceiling goes the other way, slower. On a strong beat the ceiling comes down on you a little, so they close like jaws, and open again. The sky's laid out about its top here (a below 0),
// which is where it's flat over you, and the point it closes up into is under the ball.
export function skimNumbers(G, t, c, m = {}) {
  const { k, d } = lifeOf(G, t, m, 7, 7), kick = kickAt(t), tune = tuneAt(c);
  const bend = smoother(k / 0.6), look = smoother((k - 0.25) / 0.75);
  const K = (m.K ?? 0.4) * bend, h = LENS + ((m.H ?? 0.7) - LENS) * look;
  const H = (LENS + 0.6 + ((m.sky ?? 1.35) - LENS - 0.6) * look) * (1 - (m.lift ?? 0.12) * kick * k);
  const lens = LENS + ((m.lens ?? 1.3) - LENS) * look, sway = Math.sin(0.1 * d);
  const fly = (m.fly ?? 0.6) * d + (m.heave ?? 0.4) * surgeAt(t) * k;
  return {
    kind: 10, amp: K, f: H, ph: m.skyTurn ?? Math.PI / 2,
    pitch: (m.P ?? 1.38) * look + 0.03 * tune * look, yaw: (0.12 * sway + 0.08 * tune) * look, roll: (0.1 * Math.sin(0.1 * d + 1.2) + 0.04 * tune) * look, dist: lens,
    x: 0, y: 0, z: h, a: -(m.bold ?? 0.22),
    bowl: 0, q: fly, pix: 0, w: -0.2 * fly,
  };
}

const write = (out, n) => {
  if (!(n.amp > 0)) {
    // Nothing up: exactly flat, looked at straight down from the height of the lens, moved by how far it's gone
    writeSpace(out, n.kind, { dist: LENS, z: LENS, bowl: n.bowl, q: n.q });
    return;
  }
  writeSpace(out, n.kind, n);
};
const move = (id, numbers) => ({
  id, flies: true,      // src/score/moves/index.js: at the end of its time it's flat, but not where it started
  needs() { return true; },
  write(out, { t, c, G, m }) { write(out, numbers(G, t, c ?? t, m)); },
});

// With no song, or picked by hand: an endless round. Flat for a few seconds, up, travelling, back down, and flat again, and where it had got to carries on into the next round.
// Each round is `L` long; `at` says when in it the dome goes over.
function round(numbers, L, lead, coast, more = () => ({})) {
  return (out, t, t0) => {
    const n = Math.floor((t - t0) / L), s = t0 + n * L, from = s + 3, to = s + L - 3;
    const m = { from, to, lead, coast, ...more(s, n) };
    const N = numbers(null, t, t, m);
    // where it had got to, every round before this one
    const fwd = numbers(null, to + 1, to + 1, { ...m, to }), last = numbers(null, from - 1, from - 1, m);
    const carry = [fwd.bowl - last.bowl, fwd.q - last.q, (fwd.pix ?? 0) - (last.pix ?? 0), (fwd.w ?? 0) - (last.w ?? 0)];
    N.bowl += n * carry[0]; N.q += n * carry[1]; if (N.pix != null) N.pix += n * carry[2]; if (N.w != null) N.w += n * carry[3];
    write(out, N);
  };
}
export const domeRound = round(domeNumbers, 34, 7, 7, s => ({ loop: { a: s + 15.5, b: s + 23.5 } }));
export const planetRound = round(planetNumbers, 38, 9, 8);
export const canyonRound = round(canyonNumbers, 32, 7, 7);
export const skimRound = round(skimNumbers, 30, 7, 7);

export default {
  dome: move('dome', domeNumbers),
  planet: move('planet', planetNumbers),
  canyon: move('canyon', canyonNumbers),
  skim: move('skim', skimNumbers),
};
