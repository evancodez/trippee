// A rehearsal: the whole film is played once, small and out of sight, before anyone sees it. Patterns are written by hand, and what any of them looks
// like at a given moment of its long move is only known by looking. So two things happen here.
//
// Each gesture is drawn at 13 points of its long move, at the real aspect, and measured the way tests/judge.mjs measures a film: grey, line count, fine
// tiles, how white, how many tiles have gone to one colour, how big a flat shape. It then rides only the longest good stretch (G.range). A gesture left
// with too little move gets a slow turn and a zoom on top, each checked by drawing it. A pattern with no good stretch sits this song out.
//
// A flight between two gestures can go either way, in or out. Where the way it chose spends too long in noise or a flat shape, the other way is tried, and the better one kept.
//
// Then the film is played through for jumps. A jump in brightness is the one thing that must never reach the screen, so a pattern that makes one sits out too.
import { Renderer } from '../gl/renderer.js';
import { frame } from '../score/frame.js';
import { flag } from '../score/flags.js';
import { fillSlot, noHorizon, withTravel } from '../score/slot.js';
import { OFF, SLOT_FLOATS } from '../pattern/layout.js';
import { clamp } from '../score/curves.js';

const JUMP_H = 54, STEP = 0.2, JUMP = 0.3;     // a jump: 30% of full scale in a fifth of a second
const LOOK_H = 360, SAMPLES = 12;              // 13 points, at a third of 1080p: enough to tell a 16 px line period at 1080p from a 45 px one

// What a good moment is. Each sits a little inside the judge's limit, because the song will still push it about: lines fatten on the beat, and brightness moves line density.
// Grey counts edge pixels too, and a third of the resolution has three times as many of them, so its limit is nearly three times the judge's .25 at native size.
const GOOD = {
  white: [0.14, 0.86],       // judge .12, .88
  tile: [14, 241], tileCount: 8,      // judge 12, 243, 9
  grey: 0.45,
  edges: 118,                // judge 130: crossings on the middle row and column of a 320 x 180 copy
  greyTile: 0.45,            // the same wash of too-fine lines in one corner of the frame: a grey patch is a grey patch, even if the rest of the picture is bold
  fine: 0.25, fineTiles: 2,  // judge .12 per pixel at 1080p, in 3 tiles, and a moire in two corners of a door is plain to see too. Measured side by side on the same frames that's about .27 here, not the .36 the sizes suggest: the far end of a floor closes up sooner
  flatArea: 0.30, flatDisc: 0.20,     // judge .35, .25: flat.mjs's big joined shape with room for a disc. Further inside than the rest, because it's the quickest to come and go between two looks
  flatAlone: 0.30,           // a disc this big is a flat shape however its joined area flickers, as thin lines cross it and let go
  flatHuge: 0.62, hugeDisc: 0.17,     // judge .70, .2: most of the frame one joined colour, even with something small floating in it. A dot field's background is joined up too, but has no room for a disc that big
};

// Dots swell on the clock, so a pattern that breathes is looked at a few times at each point, a little way round the clock. Not half way: a half turn only swaps black and white.
const BREATHING = [0, 0.37, 0.74];
const PATH = Array.from({ length: SAMPLES + 1 }, (_, i) => i / SAMPLES);    // where a ride is checked as it will really play, as x through the gesture: with the song on it, and with what flows moved on, so a target's middle disc may be open

// How long a flight may stay bad, in seconds. The judge's limits are 2 and 1.
const FLIGHT_NOISE = 1.5, FLIGHT_COLOUR = 0.7;
const FLIGHT_SHORTEST = 6, FLIGHT_TAKES = 0.7;      // and if both ways do, it goes through a bit quicker: down to this many seconds, and this much of what it was

// Flashes. A little inside the judge's 25.5 of 255, 0 for the whole frame and 2 for a tile. Looked at 10 times a second, small: every other look is also the jump pass's.
const FLASH_SWING = 22, FLASH_SWING_WHOLE = 19, FLASH_WHOLE = 0, FLASH_TILE = 2, FLASH_SUB = 2, FLASH_H = 36, FLASH_LONGEST = 600, FLASH_ROUNDS = 4, FLASH_SLOWEST = 8, FLASH_MORPH = 15, FLASH_CALM = 0.35, FLASH_MORPH_FPS = 30;
// A world reads tighter and in three channels (docs/MODES.md section 7): at most 1 a second on a tile, and the same margin inside each channel's own swing. The film never comes here.
const WORLD_TILE = 1, WORLD_SWING = { luma: 22, red: 17, rc: 22 }, WORLD_SWING_WHOLE = { luma: 19, red: 15, rc: 19 };
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) { const s = i / 255; LIN[i] = s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }

// Minimum travel: a gesture should make a real move. Under this much of its long move, or moving under this much, it gets more.
const MIN_WIDTH = 0.3, MIN_MOVE = Math.log(1.5);
const TURN = 0.7;                              // radians over the gesture
const ZOOMS = [Math.log(2), Math.log(1.5)];    // tried in this order, each both ways
const EPS = 1e-3;                              // the width of a run of one sample: its own arcs stand still, and what's added has something to run on

// How far the view numbers travel, in natural logs or roughly equivalent radians
const VIEW = [['scale', 1, true], ['freq', 1, true], ['rot', 1], ['cam.pitch', 1.5], ['cam.yaw', 1.5], ['cam.roll', 1], ['cam.dist', 1, true], ['surf.spin', 1]];

let rig = null;
const getRig = () => rig ??= (async () => {
  const c = document.createElement('canvas');
  c.width = 96; c.height = JUMP_H;
  // Plain and flight aren't everything it will be asked to draw. A slot wearing a move, a field or a coin needs the fuller programs, and until they're built it draws without them: a rehearsal
  // would be judging a different picture, and which one would depend on how fast they built. It never draws the hand or colour, so those aren't built.
  const whole = flag('flashGuard'), R = new Renderer(c, { bare: whole });
  await (whole ? R.whenAllReady() : R.whenReady());
  return R;
})();

// Built while nothing's going on, so that the first song dropped doesn't wait for it.
export const warmRehearsal = () => getRig();

// ---------------------------------------------------------------- looking at one drawn frame
const FW = 80, FH = 45, stack = new Int32Array(FW * FH), seen = new Uint8Array(FW * FH), dist = new Float32Array(FW * FH), small = new Uint8Array(FW * FH);
const tone = v => (v > 235 ? 1 : v < 20 ? 2 : 0);
// flat.mjs's measure on a very small copy: the biggest joined area of one colour, and the biggest disc of one colour that fits
function flatOf(px, W, H) {
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) small[y * FW + x] = px[(((y + 0.5) * H / FH | 0) * W + ((x + 0.5) * W / FW | 0)) * 4 + 1];
  seen.fill(0);
  let area = 0, disc = 0;
  for (let i = 0; i < FW * FH; i++) {
    if (seen[i]) continue;
    const c = tone(small[i]);
    if (!c) continue;
    let top = 0, n = 0;
    stack[top++] = i; seen[i] = 1;
    while (top) {
      const k = stack[--top], x = k % FW, y = (k / FW) | 0;
      n++;
      if (x > 0 && !seen[k - 1] && tone(small[k - 1]) === c) { seen[k - 1] = 1; stack[top++] = k - 1; }
      if (x < FW - 1 && !seen[k + 1] && tone(small[k + 1]) === c) { seen[k + 1] = 1; stack[top++] = k + 1; }
      if (y > 0 && !seen[k - FW] && tone(small[k - FW]) === c) { seen[k - FW] = 1; stack[top++] = k - FW; }
      if (y < FH - 1 && !seen[k + FW] && tone(small[k + FW]) === c) { seen[k + FW] = 1; stack[top++] = k + FW; }
    }
    if (n > area) area = n;
  }
  for (const c of [1, 2]) {
    for (let i = 0; i < FW * FH; i++) dist[i] = tone(small[i]) === c ? 1e6 : 0;
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      const i = y * FW + x;
      if (x === 0 || y === 0 || x === FW - 1 || y === FH - 1) dist[i] = Math.min(dist[i], 1.5);
      if (x > 0) dist[i] = Math.min(dist[i], dist[i - 1] + 1);
      if (y > 0) dist[i] = Math.min(dist[i], dist[i - FW] + 1);
    }
    for (let y = FH - 1; y >= 0; y--) for (let x = FW - 1; x >= 0; x--) {
      const i = y * FW + x;
      if (x < FW - 1) dist[i] = Math.min(dist[i], dist[i + 1] + 1);
      if (y < FH - 1) dist[i] = Math.min(dist[i], dist[i + FW] + 1);
      if (dist[i] > disc) disc = dist[i];
    }
  }
  return [area / (FW * FH), disc / FH];
}

const hN = new Uint32Array(16), hC = new Uint32Array(16), vN = new Uint32Array(16), vC = new Uint32Array(16), tSum = new Float64Array(16), tCount = new Uint32Array(16), tGrey = new Uint32Array(16);
export function measure(px, W, H) {
  const G = (x, y) => px[(y * W + x) * 4 + 1];
  tSum.fill(0); tCount.fill(0); tGrey.fill(0); hN.fill(0); hC.fill(0); vN.fill(0); vC.fill(0);
  let white = 0, grey = 0, n = 0;
  for (let y = 0; y < H; y += 2) {
    const ty = Math.min(3, (y * 4 / H) | 0);
    for (let x = 0; x < W; x += 2) {
      const v = G(x, y), k = ty * 4 + Math.min(3, (x * 4 / W) | 0);
      if (v > 127) white++;
      if (v > 48 && v < 208) { grey++; tGrey[k]++; }
      tSum[k] += v; tCount[k]++; n++;
    }
  }
  // Crossings on the middle row and column, at about 320 x 180: the judge's `edges`. In another aspect, the same count per sample.
  let edges = 0, samples = 0;
  for (let x = 2, cy = H >> 1; x < W; x += 2) { samples++; if ((G(x, cy) > 127) !== (G(x - 2, cy) > 127)) edges++; }
  for (let y = 2, cx = W >> 1; y < H; y += 2) { samples++; if ((G(cx, y) > 127) !== (G(cx, y - 2) > 127)) edges++; }
  edges *= 498 / Math.max(samples, 1);
  // Fine lines anywhere in the frame: crossings per pixel in each of 16 tiles, across or along, whichever is more.
  for (let y = 1; y < H - 1; y += 5) {
    const ty = Math.min(3, (y * 4 / H) | 0);
    let prev = G(0, y) > 127;
    for (let x = 1; x < W; x++) { const v = G(x, y) > 127, k = ty * 4 + Math.min(3, (x * 4 / W) | 0); hC[k]++; if (v !== prev) hN[k]++; prev = v; }
  }
  for (let x = 1; x < W - 1; x += 5) {
    const tx = Math.min(3, (x * 4 / W) | 0);
    let prev = G(x, 0) > 127;
    for (let y = 1; y < H; y++) { const v = G(x, y) > 127, k = Math.min(3, (y * 4 / H) | 0) * 4 + tx; vC[k]++; if (v !== prev) vN[k]++; prev = v; }
  }
  let fine = 0, dark = 0, light = 0, greyTile = 0;
  for (let k = 0; k < 16; k++) {
    greyTile = Math.max(greyTile, tGrey[k] / Math.max(tCount[k], 1));
    if (Math.max(hN[k] / Math.max(hC[k], 1), vN[k] / Math.max(vC[k], 1)) > GOOD.fine) fine++;
    const m = tSum[k] / Math.max(tCount[k], 1);
    if (m < GOOD.tile[0]) dark++;
    if (m > GOOD.tile[1]) light++;
  }
  const [area, disc] = flatOf(px, W, H);
  const m = { white: white / n, grey: grey / n, greyTile, edges, fine, tiles: dark + light, area, disc };
  m.why = badness(m);
  m.ok = !m.why;
  return m;
}
function badness(m) {
  if (m.white < GOOD.white[0] || m.white > GOOD.white[1]) return 'white';
  if (m.tiles >= GOOD.tileCount) return 'tiles';
  if ((m.area > GOOD.flatArea && m.disc > GOOD.flatDisc) || m.disc > GOOD.flatAlone || (m.area > GOOD.flatHuge && m.disc > GOOD.hugeDisc)) return 'flat';
  if (m.edges > GOOD.edges) return 'edges';
  if (m.fine >= GOOD.fineTiles) return 'fine';
  if (m.grey > GOOD.grey || m.greyTile > GOOD.greyTile) return 'grey';
  return '';
}
// How far past its limits a bad moment is, to choose the least bad when nothing's good
const excess = m => Math.max(GOOD.white[0] - m.white, m.white - GOOD.white[1], 0) * 4 + Math.max(m.tiles - GOOD.tileCount + 1, 0) / 8 + Math.max(m.area - GOOD.flatArea, 0) * (m.disc > GOOD.flatDisc ? 2 : 0)
  + Math.max(m.edges / GOOD.edges - 1, 0) + Math.max(m.fine - GOOD.fineTiles + 1, 0) / 8 + Math.max(m.grey - GOOD.grey, 0) + Math.max(m.greyTile - GOOD.greyTile, 0) / 2;

// ---------------------------------------------------------------- one gesture
// In a world what's looked at is its coverage, so every measure here stays what it is on the film. Only the flash pass asks for true colour.
// And a world's film may be rehearsed while a change of world is running on it: that's on real seconds, so frame() would draw the change at every time it's asked about, in the program it's leaving. What's being rehearsed is the film after it.
const shot = (R, score, t, W, H, px, colour = false) => {
  R.resize(W, H, 1);
  const h = score.world ? score.handover : null;
  if (h) score.handover = null;
  const f = frame(score, t, R, null);
  if (h) score.handover = h;
  const wp = R.wp;
  if (wp && !colour) wp.block[0] = 1;
  R.draw();
  if (wp) wp.block[0] = 0;
  R.gl.readPixels(0, 0, W, H, R.gl.RGBA, R.gl.UNSIGNED_BYTE, px);
  return f;
};
const horizon = G => Math.max((G.arcEnd ?? G.t1) - G.t0, 1e-3);
// A look at part of a film is in that film's world, or its own fields wouldn't draw. Nothing at all for the film.
const worldOf = score => (score.world ? { world: score.world, tables: score.tables } : null);
const when = (G, u) => G.t0 + horizon(G) * u;
// The gesture alone, on the film's clock, with no song on it and nothing to morph into. A copy, so that nothing on screen can see it stopped.
const alone = (G, over) => ({ ...G, freezeEase: null, thaw: null, morph: 0, plan: null, planning: null, ...over });
// At one point of its long move, whatever the clock says
const lookAt = (R, score, G, u, { W, H, px }, ph = 0) => {
  shot(R, { gestures: [alone(G, { freezeU: u })], phi: (t, g) => score.phi(t, g) + ph, ...worldOf(score) }, when(G, u), W, H, px);
  return measure(px, W, H);
};
// As it will really play, riding `ride` ({ range, arcs, phiTrack...}), x of the way through
const lookAlong = (R, score, G, x, ride, { W, H, px }) => {
  shot(R, { gestures: [alone(G, { freezeU: null, ...ride })], phi: score.phi, react: score.react, ...worldOf(score) }, G.t0 + horizon(G) * x, W, H, px);
  return measure(px, W, H);
};

// The first thing that goes wrong playing it for real, or null. Going a bit too white or too black is only wrong if it lasts: the judge gives it 3 s, and these looks are about 2 s apart.
async function firstBad(R, score, G, ride, ctx) {
  let lone = false;
  for (const x of PATH) {
    const m = lookAlong(R, score, G, x, ride, ctx), tone = m.why === 'white' || m.why === 'tiles';
    await ctx.breathe();
    if (m.why && (!tone || lone)) return { x, why: m.why };
    lone = tone;
  }
  return null;
}

const numbers = new Float32Array(SLOT_FLOATS);
function slotAt(G, u, aspect, phi = 0) {
  fillSlot(numbers, alone(G, { freezeU: u }), when(G, u), G.pattern, { phi });
  noHorizon(numbers, aspect);
  return numbers;
}
// Does it change with the clock in any way but its flow?
function breathes(G, aspect) {
  if (!G.pattern.drive) return false;
  const a = slotAt(G, 0.5, aspect, 0.25).slice(), b = slotAt(G, 0.5, aspect, 0.5);
  const flowing = new Set(Object.keys(G.flow || G.pattern.flow || {}).map(p => OFF[p]));
  return a.some((v, i) => v !== b[i] && !flowing.has(i));
}
// How much the view travels over part of a gesture's long move: the most that any one view number does
function travel(G, lo, hi, aspect) {
  const out = {};
  let last = null;
  for (let i = 0; i <= 12; i++) {
    const s = slotAt(G, lo + (hi - lo) * i / 12, aspect), now = VIEW.map(([p, , log]) => (log ? Math.log(Math.max(s[OFF[p]], 1e-5)) : s[OFF[p]]));
    if (last) VIEW.forEach(([p, w], k) => { out[p] = (out[p] || 0) + Math.abs(now[k] - last[k]) * w; });
    last = now;
  }
  return out;
}

// A number that's the same on every run and every take of a film, so a pattern always goes the same way round
const signOf = s => { let h = 7; for (const c of s) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0; return h % 2 ? 1 : -1; };

// The longest good run of samples, and which of the runs if there's a tie: the one nearest the middle of the long move
function longestRun(good) {
  let best = null;
  for (let i = 0; i < good.length; i++) {
    if (!good[i]) continue;
    let j = i;
    while (j + 1 < good.length && good[j + 1]) j++;
    const c = { lo: i, hi: j, n: j - i, off: Math.abs((i + j) / 2 - (good.length - 1) / 2) };
    if (!best || c.n > best.n || (c.n === best.n && c.off < best.off)) best = c;
    i = j;
  }
  return best;
}

// What a ride changes on a gesture: the part it rides, what's added to the move, and the gears those need
const rideOf = (G, lo, hi, arcs) => {
  const range = [lo, hi === lo ? lo + EPS : hi];
  return { range, ...(arcs ? { arcs } : {}), ...(G.regear?.(range, arcs ?? G.arcs) ?? {}) };
};

// Returns what it learned about one gesture and writes it onto the gesture, if that gesture may still be changed.
async function rehearseGesture(R, score, G, ctx) {
  const { aspect, breathe, mayChange } = ctx, n = SAMPLES;
  const samples = [], phases = breathes(G, aspect) ? BREATHING : [0];
  for (let i = 0; i <= n; i++) {
    let worst = null;
    for (const ph of phases) {
      const m = lookAt(R, score, G, i / n, ctx, ph);
      if (!worst || excess(m) > excess(worst)) worst = m;
      await breathe();
    }
    samples.push(worst);
  }
  const run = longestRun(samples.map(s => s.ok)), id = G.pattern.id, note = { id, t0: +G.t0.toFixed(2), t1: +G.t1.toFixed(2), why: samples.map(s => s.why || '.').join(' ') };
  if (!run) {
    // Nothing good. It sits out, and if it's the one the user asked for, it rides the least bad moment.
    console.info(`rehearsal: no good run in ${id} at ${note.t0} s: ${note.why}`);
    const least = samples.map(excess).reduce((b, v, i, a) => (v < a[b] ? i : b), 0);
    if (mayChange()) Object.assign(G, rideOf(G, least / n, least / n));
    return { ...note, range: G.range, sitsOut: true };
  }
  // Played for real it's at a different point of the clock at each point of the move. Whatever goes wrong there splits the run, and the longer part is kept.
  let il = run.lo, ih = run.hi, trimmed = '';
  for (let tries = 0; tries < 5 && ih > il; tries++) {
    const bad = await firstBad(R, score, G, rideOf(G, il / n, ih / n), ctx);
    if (!bad) break;
    const u = (il + (ih - il) * bad.x), up = Math.max(il + 1, Math.ceil(u)), down = Math.min(ih - 1, Math.floor(u));
    if (ih - up >= down - il) il = up; else ih = down;
    trimmed += ` ${bad.why}@${bad.x.toFixed(2)}`;
  }
  const lo = il / n, hi = ih / n, width = hi - lo, top = hi === lo ? lo + EPS : hi;
  const most = Math.max(...Object.values(travel(G, lo, top, aspect)));
  let arcs = null, added = '';
  if (width < MIN_WIDTH || most < MIN_MOVE) {
    // It needs more. Only what was drawn and passed is used, so a wider move that goes wrong just isn't taken.
    const way = signOf(id), r = slotAt(G, lo, aspect)[OFF.rot], s0 = slotAt(G, lo, aspect)[OFF.scale], s1 = slotAt(G, top, aspect)[OFF.scale];
    const dr = slotAt(G, top, aspect)[OFF.rot] - r, turn = (Math.sign(dr) || way) * Math.max(Math.abs(dr), TURN);
    const own = Math.abs(Math.log(Math.max(s1, 1e-5) / Math.max(s0, 1e-5)));
    const tries = [];
    if (own < MIN_MOVE) for (const z of ZOOMS) tries.push({ turn, zoom: way * z, what: 'zoom and turn' }, { turn, zoom: -way * z, what: 'zoom and turn' });
    tries.push({ turn, zoom: 0, what: 'turn' });
    for (const t of tries) {
      const more = withTravel(G.arcs ?? G.pattern.arcs ?? [], lo, top, { rot: [r, r + t.turn], scale: t.zoom ? [s0, s0 * Math.exp(t.zoom)] : null });
      if (!await firstBad(R, score, G, rideOf(G, lo, hi, more), ctx)) { arcs = more; added = `${t.what}${t.zoom ? ` ${t.zoom > 0 ? '+' : ''}${t.zoom.toFixed(2)}` : ''}`; break; }
    }
  }
  if (mayChange()) Object.assign(G, rideOf(G, lo, hi, arcs));
  // One good moment that can't even take a slow turn is too near the edge to stay on: that's no good run either.
  if (width === 0 && !arcs) console.info(`rehearsal: only one fragile moment in ${id} at ${note.t0} s (${trimmed.trim()}): ${note.why}`);
  return { ...note, range: [+lo.toFixed(3), +hi.toFixed(3)], width: +width.toFixed(3), moved: +most.toFixed(2), added, trimmed: trimmed.trim(), ...(width === 0 && !arcs ? { sitsOut: true } : {}) };
}

// ---------------------------------------------------------------- one transformation, looked at the way it would run
const NOISY = new Set(['edges', 'fine', 'grey']);
// The two gestures alone, so what this tries leaves no plan behind on the real ones. Returns which kind it became, and how long it stays bad.
async function flightOf(R, score, A, B, rise, { W, H, px, breathe }) {
  const fresh = { plan: null, planFor: null, planning: null };
  const pair = { gestures: [{ ...A, ...fresh, rise }, { ...B, ...fresh }], phi: score.phi, react: score.react, ...worldOf(score) };
  const t0 = A.t1 - A.morph, step = A.morph / SAMPLES;
  let kind = null, noise = 0, colour = 0, runN = 0, runC = 0;
  for (let i = 1; i < SAMPLES; i++) {     // the two ends are the gestures themselves, and those have been looked at
    const f = shot(R, pair, t0 + i * step, W, H, px), m = measure(px, W, H);
    kind = f.kind ?? kind;
    if (kind !== 'dive' && kind !== 'rise') break;     // a slide or a bend has no other way to go
    runN = NOISY.has(m.why) ? runN + step : 0; runC = m.why && !NOISY.has(m.why) ? runC + step : 0;
    noise = Math.max(noise, runN); colour = Math.max(colour, runC);
    await breathe();
  }
  return { kind, noise, colour, over: Math.max(noise - FLIGHT_NOISE, 0) + 2 * Math.max(colour - FLIGHT_COLOUR, 0) };
}
async function chooseWay(R, score, A, B, ctx) {
  const first = await flightOf(R, score, A, B, A.rise, ctx);
  const out = { id: `${A.pattern.id}>${B.pattern.id}`, t: +A.t1.toFixed(2), kind: first.kind, noise: +first.noise.toFixed(1), colour: +first.colour.toFixed(1) };
  if (!first.over || (first.kind !== 'dive' && first.kind !== 'rise')) return out;
  const other = await flightOf(R, score, A, B, first.kind !== 'rise', ctx);
  out.other = { kind: other.kind, noise: +other.noise.toFixed(1), colour: +other.colour.toFixed(1) };
  const turn = other.over < first.over - 0.2, best = turn ? other : first;
  if (!ctx.mayChange()) return out;
  if (turn) { A.rise = other.kind === 'rise'; A.plan = A.planFor = A.planning = null; out.turned = true; }
  const by = Math.max(best.noise / FLIGHT_NOISE, best.colour / FLIGHT_COLOUR);
  if (by > 1 && A.morph > FLIGHT_SHORTEST) { A.morph = Math.max(A.morph / by, A.morph * FLIGHT_TAKES, FLIGHT_SHORTEST); out.morph = +A.morph.toFixed(2); }
  return out;
}

export { getRig, shot };    // for tests: the same eyes, at any moment of a film

// Returns { jumps: [{ t, by, id }], bad: [pattern ids], rides: [what each gesture rides], ways: [each transformation], sitOut: [no good run], seconds }
// stale: asked between looks. Once it says yes the rehearsal stops where it is, by throwing, because someone's made another film and this one will never be shown.
// gentle: a film's playing in front of this one, so it takes less of each frame.
export async function rehearse(score, until, onProgress = () => {}, { lastTry = false, stale = null, gentle = false } = {}) {
  const t0 = performance.now();
  const R = await getRig();
  // A world's programs on this renderer too, all of them: as with the film's, anything not built yet would be judged as a different picture. If it fails to build it draws as the film, as it would on screen.
  if (score.world) { await R.prepareWorld(score.world); await R.worldPrograms.get(score.world).whenAll; }
  const aspect = score.aspect ?? (globalThis.app?.canvas?.width && app.canvas.height ? app.canvas.width / app.canvas.height : 16 / 9);
  const stage = globalThis.app?.stage, live = () => stage?.score === score;

  // Don't hold up what's on screen: a film that isn't showing yet can have most of the time, one that's playing very little.
  const ch = new MessageChannel();
  let wake = null, last = performance.now();
  ch.port1.onmessage = () => { const w = wake; wake = null; w?.(); };
  const breathe = async () => {
    if (stale?.()) throw new Error('stale');
    const behind = live() || gentle;
    if (performance.now() - last < (live() ? 4 : gentle ? 6 : 16)) return;
    // Behind a film that's playing it takes a little of each frame, right after the frame's been drawn, and no more however quickly the loop comes round again.
    if (behind && !document.hidden) await new Promise(r => { wake = r; requestAnimationFrame(() => ch.port2.postMessage(0)); });
    else await new Promise(r => { wake = r; ch.port2.postMessage(0); });
    last = performance.now();
  };

  const gestures = score.gestures, rides = [], ways = [];
  // What will be morphed into soon has its plan already, and what's showing is showing. Only what's still ahead changes.
  const nowT = () => globalThis.app?.pictureT?.() ?? globalThis.app?.t ?? 0;
  const firstSeen = G => { const k = gestures.indexOf(G); return k > 0 ? gestures[k - 1].t1 - (gestures[k - 1].morph || 0) : k === 0 ? G.t0 : -Infinity; };
  const mayChangeFor = G => () => !live() || firstSeen(G) > nowT() + 3;
  if (flag('range')) {
    const W = Math.round(LOOK_H * aspect), H = LOOK_H, px = new Uint8Array(W * H * 4);
    // The film's own last gesture, which has no move of its own, can't go wrong by riding it. A gesture a director has fixed in time (G.fixedRange) keeps what it's been given.
    const todo = gestures.filter(G => G.t0 < until && !G.fixedRange && !(G.arcs && !G.arcs.length && !G.pattern.drive));
    for (let n = 0; n < todo.length; n++) {
      const G = todo[n];
      rides.push(await rehearseGesture(R, score, G, { W, H, px, aspect, breathe, mayChange: mayChangeFor(G) }));
      onProgress(0.25 * (n + 1) / todo.length);
    }
    // Anything but the first gesture, which may be what the user asked for, and this film will be composed again without it. No need to look any further at this one.
    const again = rides.filter(r => r.sitsOut && r.id !== gestures[0].pattern.id).map(r => r.id);
    if (again.length && !lastTry) { ch.port1.close(); return { jumps: [], bad: [...new Set(again)], rides, ways, sitOut: [...new Set(again)], rangeSeconds: (performance.now() - t0) / 1000, seconds: (performance.now() - t0) / 1000 }; }
    // Then the ways between them, now that each gesture's end is known
    if (flag('flightWay')) {
      const pairs = gestures.slice(0, -1).map((A, k) => [A, gestures[k + 1]]).filter(([A]) => A.morph && A.t1 <= until);
      for (let n = 0; n < pairs.length; n++) {
        const [A, B] = pairs[n];
        ways.push(await chooseWay(R, score, A, B, { W, H, px, breathe, mayChange: mayChangeFor(B) }));
        onProgress(0.25 + 0.25 * (n + 1) / pairs.length);
      }
    }
  }
  const rangeSeconds = (performance.now() - t0) / 1000;

  // With the flash guard on the same pass also keeps every frame's brightness and tiles, at a rate that can see a flash. A very long piece only gets looked at for jumps.
  const guard = flag('flashGuard') && until <= FLASH_LONGEST, sub = guard ? FLASH_SUB : 1;
  const H = guard ? FLASH_H : JUMP_H, W = Math.max(8, Math.round(H * aspect)), px = new Uint8Array(W * H * 4);
  const n = Math.ceil(until / STEP) * sub, jumps = [];
  const colour = guard && !!score.world && score.world.id !== 'mirror';     // the mirror world draws exactly the film, so its film must be exactly the film's, guard and all
  const seen = guard ? new FlashSeen(n + 1, W, H, sub / STEP, colour) : null;
  let prev = null;
  for (let i = 0; i <= n; i++) {
    const t = i * STEP / sub, f = shot(R, score, t, W, H, px, colour);
    seen?.take(i, px, f, gestures);
    if (i % sub === 0) {
      if (colour && R.wp) { R.wp.block[0] = 1; R.draw(); R.wp.block[0] = 0; R.gl.readPixels(0, 0, W, H, R.gl.RGBA, R.gl.UNSIGNED_BYTE, px); }     // a jump is in coverage, as it is on the film
      let s = 0;
      for (let k = 1; k < px.length; k += 4) s += px[k];
      const L = s / (W * H) / 255;
      if (prev !== null && Math.abs(L - prev) >= JUMP) jumps.push({ t: +t.toFixed(2), by: +(L - prev).toFixed(3), id: f.G.pattern.id });
      prev = L;
    }
    if (i % 25 === 0) onProgress(0.5 + (guard ? 0.4 : 0.5) * clamp(i / n));
    await breathe();
  }
  const flash = guard && (!jumps.length || lastTry) ? await guardFlashes(R, score, seen, { W, H, px, breathe, mayChangeFor }) : null;
  ch.port1.close();
  const sitOut = [...new Set(rides.filter(r => r.sitsOut).map(r => r.id))];
  return { jumps, bad: [...new Set([...sitOut, ...jumps.map(j => j.id)])], rides, ways, flash, sitOut, rangeSeconds, seconds: (performance.now() - t0) / 1000 };
}

// ---------------------------------------------------------------- flashes
// The limits on flashing protect whoever's watching, so they're not a matter of taste: no pair of opposing swings of the whole frame's brightness within a second, and at most two per second in any one
// sixteenth of it (see tests/judge.mjs). Why any one film flashes can't be told from the numbers: it's bold rings flowing out faster than their brightness can settle, a slide that blows its lines up huge on
// the way past, a flight rushing big solids by. So it's looked at. The whole film, small; and whatever flashes gets the least it needs, on that one gesture: what flows flows slower, a glide
// becomes a flight, a flight goes the other way or takes longer over it. Each change is kept only if it helps, and the rest of the film is left exactly as it was.
export class FlashSeen {
  // world: read true colour through three channels. Left off, this is what the film has always done, reading green.
  constructor(n, W, H, fps, world = false) {
    this.n = n; this.W = W; this.H = H; this.fps = fps; this.mean = new Float32Array(n); this.tiles = new Float32Array(n * 16); this.who = new Int32Array(n).fill(-1); this.kind = new Array(n).fill(null);
    this.world = world;
    if (world) { this.red = new Float32Array(n * 17); this.rc = new Float32Array(n * 17); }     // 16 tiles, then the whole frame
  }
  takeColour(i, px, f, gestures) {
    const { W, H } = this; let all = 0, allR = 0, allC = 0;
    for (let ty = 0; ty < 4; ty++) {
      const y0 = (ty * H / 4) | 0, y1 = ((ty + 1) * H / 4) | 0;
      for (let tx = 0; tx < 4; tx++) {
        const x0 = (tx * W / 4) | 0, x1 = ((tx + 1) * W / 4) | 0; let s = 0, sr = 0, sc = 0;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          const k = (y * W + x) * 4, r = px[k], g = px[k + 1], b = px[k + 2], R = LIN[r], G = LIN[g], B = LIN[b], T = R + G + B;
          s += r * 0.2126 + g * 0.7152 + b * 0.0722;
          if (T > 0 && R / T >= 0.8 && R > G + B) sr += (R - G - B) * 320;
          sc += r - (g + b) / 2;
        }
        const c = (y1 - y0) * (x1 - x0), q = ty * 4 + tx;
        this.tiles[i * 16 + q] = s / c; this.red[i * 17 + q] = sr / c; this.rc[i * 17 + q] = sc / c;
        all += s; allR += sr; allC += sc;
      }
    }
    const a = W * H;
    this.mean[i] = all / a; this.red[i * 17 + 16] = allR / a; this.rc[i * 17 + 16] = allC / a;
    this.who[i] = gestures.indexOf(f.from ?? f.G);
    this.kind[i] = f.kind ?? null;
  }
  take(i, px, f, gestures) {
    if (this.world) return this.takeColour(i, px, f, gestures);
    const { W, H } = this; let all = 0;
    for (let ty = 0; ty < 4; ty++) {
      const y0 = (ty * H / 4) | 0, y1 = ((ty + 1) * H / 4) | 0;
      for (let tx = 0; tx < 4; tx++) {
        const x0 = (tx * W / 4) | 0, x1 = ((tx + 1) * W / 4) | 0; let s = 0;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) s += px[(y * W + x) * 4 + 1];
        all += s;
        this.tiles[i * 16 + ty * 4 + tx] = s / ((y1 - y0) * (x1 - x0));
      }
    }
    this.mean[i] = all / (W * H);
    this.who[i] = gestures.indexOf(f.from ?? f.G);
    this.kind[i] = f.kind ?? null;
  }
  keep([a, b]) { return { mean: this.mean.slice(a, b), tiles: this.tiles.slice(a * 16, b * 16), who: this.who.slice(a, b), kind: this.kind.slice(a, b), ...(this.world ? { red: this.red.slice(a * 17, b * 17), rc: this.rc.slice(a * 17, b * 17) } : {}) }; }
  back([a, b], k) { this.mean.set(k.mean, a); this.tiles.set(k.tiles, a * 16); this.who.set(k.who, a); for (let i = a; i < b; i++) this.kind[i] = k.kind[i - a]; if (this.world) { this.red.set(k.red, a * 17); this.rc.set(k.rc, a * 17); } }
  // Where a series goes over its limit, as the frame of the last swing of each run of swings. The same count as tools/look.mjs, a little inside its 25.5.
  overIn(get, limit, swing, out, a = 0, b = this.n) {
    const sw = []; let dir = 0, pivot = get(a);
    for (let i = a; i < b; i++) {
      const v = get(i);
      if (dir >= 0 && v > pivot) { pivot = v; dir = 1; }
      if (dir <= 0 && v < pivot) { pivot = v; dir = -1; }
      if (dir === 1 && pivot - v >= swing) { sw.push(i); dir = -1; pivot = v; }
      else if (dir === -1 && v - pivot >= swing) { sw.push(i); dir = 1; pivot = v; }
    }
    for (let s = 0; s < sw.length; s++) { let e = s; while (e < sw.length && sw[e] - sw[s] < this.fps) e++; if (Math.floor((e - s) / 2) > limit) out.push(sw[e - 1]); }
  }
  over(a = 0, b = this.n) {
    const out = [];
    if (this.world) {
      this.overIn(i => this.mean[i], FLASH_WHOLE, WORLD_SWING_WHOLE.luma, out, a, b);
      for (let k = 0; k < 16; k++) this.overIn(i => this.tiles[i * 16 + k], WORLD_TILE, WORLD_SWING.luma, out, a, b);
      for (const c of ['red', 'rc']) {
        const v = this[c];
        this.overIn(i => v[i * 17 + 16], FLASH_WHOLE, WORLD_SWING_WHOLE[c], out, a, b);
        for (let k = 0; k < 16; k++) this.overIn(i => v[i * 17 + k], WORLD_TILE, WORLD_SWING[c], out, a, b);
      }
      return out;
    }
    this.overIn(i => this.mean[i], FLASH_WHOLE, FLASH_SWING_WHOLE, out, a, b);
    for (let k = 0; k < 16; k++) this.overIn(i => this.tiles[i * 16 + k], FLASH_TILE, FLASH_SWING, out, a, b);
    return out;
  }
}
const forget = G => { if (G) G.plan = G.planFor = G.planning = null; };
async function guardFlashes(R, score, seen, { W, H, px, breathe, mayChangeFor }) {
  const g = score.gestures, t0 = performance.now(), fixes = [], stuck = new Set();
  const span = k => {    // the frames a change to gesture k can touch: from the morph into it to the end of the morph out of it
    const P = g[k - 1], from = P ? P.t1 - (P.morph || 0) : g[k].t0;
    return [Math.max(0, Math.floor((from - 2) * seen.fps)), Math.min(seen.n, Math.ceil((g[k].t1 + 2) * seen.fps) + 1)];
  };
  const colour = seen.world;
  const look = async ([a, b]) => { for (let i = a; i < b; i++) { const f = shot(R, score, i / seen.fps, W, H, px, colour); seen.take(i, px, f, g); await breathe(); } };
  // One change: make it, look again, keep it if there's less flashing in what it touched. Otherwise undo it and look again, so what's kept is what the film is.
  const tryIt = async (k, range, undo) => {
    const was = seen.over(...range).length, kept = seen.keep(range);
    await look(range);
    if (seen.over(...range).length < was) return true;
    undo();
    seen.back(range, kept);
    return false;
  };
  // A transformation moves far faster than a body, and its lines can go by faster than that look can see: they're watched again at three times the rate, each on its own.
  for (let k = 0; k < g.length - 1; k++) {
    const G = g[k];
    if (!G.morph || !mayChangeFor(G)()) continue;
    // Crossing at speed on a hit (land.js), bold shapes go by too quickly for that look to be sure of them: it looks twice as often, and twice as big.
    const close = G.peak?.q ? 2 : 1, fps = FLASH_MORPH_FPS * close, Wc = W * close, Hc = H * close, pc = close > 1 ? new Uint8Array(Wc * Hc * 4) : px;
    const watch = async () => {
      const a = G.t1 - G.morph, n = Math.ceil(G.morph * fps), s = new FlashSeen(n, Wc, Hc, fps, colour);
      for (let i = 0; i < n; i++) { const f = shot(R, score, a + i / fps, Wc, Hc, pc, colour); s.take(i, pc, f, g); await breathe(); }
      return s;
    };
    const s = await watch(), hits = s.over();
    let over = hits.length;
    if (!over) continue;
    const kind = s.kind[hits[0]] ?? 'dive', t = G.t1 - G.morph + hits[0] / fps;
    const tryIt = async (_, __, undo) => { const now = (await watch()).over().length; if (now < over) { over = now; return true; } undo(); return false; };
    let changed = false;
    for (let step = 0; step < 3 && over; step++) {
      const did = await easeMorph(G, g[k + 1], kind, { g, k, span, tryIt, score });
      if (!did) break;
      changed = true; fixes.push({ t: +t.toFixed(2), id: G.pattern.id, kind, did });
    }
    if (changed) { const [a, b] = span(k), [, c] = g[k + 1] ? span(k + 1) : [a, b]; await look([a, Math.max(b, c)]); }
  }
  for (let round = 0; round < FLASH_ROUNDS; round++) {
    const over = seen.over();
    if (!over.length) break;
    const hit = new Map();
    for (const i of over) { const k = seen.who[i]; if (k < 0) continue; const key = `${k}:${seen.kind[i] ?? ''}`; hit.set(key, { k, kind: seen.kind[i], n: (hit.get(key)?.n ?? 0) + 1, t: i / seen.fps }); }
    let tried = 0;
    for (const { k, kind, t } of hit.values()) {
      const G = g[k], N = g[k + 1], key = `${k}:${kind ?? ''}`;
      if (stuck.has(key) || !G || !mayChangeFor(G)()) continue;
      const again = await (kind ? easeMorph : easeBody)(G, N, kind, { g, k, span, tryIt, score });
      if (again) { tried++; fixes.push({ t: +t.toFixed(2), id: G.pattern.id, kind: kind ?? 'body', did: again }); }
      else stuck.add(key);
    }
    if (!tried) break;
  }
  const left = [...new Set(seen.over().map(i => +(i / seen.fps).toFixed(1)))].sort((a, b) => a - b);
  return { fixes, left, seconds: +((performance.now() - t0) / 1000).toFixed(2) };
}
// What flows, slower. It's a gesture's own flow only, so its moves and its landings stay where they are.
async function easeBody(G, N, kind, ctx) {
  const did = await slowerBody(G, ctx);
  if (did) return did;
  // Going slower doesn't help, so what's left of it is the song lifting the whole sheet: on a few big shapes the phrase's breath and the strong beats can be most of a flash. This one breathes less.
  const { k, span, tryIt } = ctx;
  if (G.calm) return null;
  G.calm = FLASH_CALM;
  return await tryIt(k, span(k), () => { delete G.calm; }) ? 'calmer' : null;
}
async function slowerBody(G, { g, k, span, tryIt }) {
  const own = G.regear && !G.fixedRange;
  // A slip remembers where the clock was when it let go, in the clock's own numbers
  const held = (G.moves ?? []).filter(m => m.hold), rescale = k1 => { for (const m of held) m.hold.phi *= k1; };
  for (let by = (G.flashSlower ?? 1) * 2; by <= FLASH_SLOWEST; by *= 2) {
    const was = { phiTrack: G.phiTrack, gears: G.gears, tau0: G.tau0, flashSlower: G.flashSlower, phiScale: G.phiScale }, k1 = (G.flashSlower ?? 1) / by;
    // A hero's been timed by hand, so it's only its clock that runs slower, all of it, and whatever it lands on it still lands on.
    if (own) Object.assign(G, G.regear(G.range ?? [0, 1], G.arcs, by));
    else { G.phiScale = 1 / by; rescale(k1); }
    G.flashSlower = by;
    forget(G); forget(g[k - 1]);
    if (await tryIt(k, span(k), () => { Object.assign(G, was); if (!own) rescale(1 / k1); forget(G); forget(g[k - 1]); })) return `flow /${by}`;
  }
  return null;
}
// A transformation, some other way: a glide becomes a flight, a fall or a shock an ordinary one, a flight goes the other way, and then it takes longer over it.
async function easeMorph(G, N, kind, { g, k, span, tryIt, score }) {
  const range = span(k), N2 = N ? span(k + 1) : range, wide = [range[0], Math.max(range[1], N2[1])];
  // Crossing at speed on a hit (land.js) is the first thing to give: at half the speed, still on the hit, and then at its own pace over the same time. Nothing's lost silently: score.refused is there only on a film that has it.
  if (G.peak?.q) {
    const was = G.peak;
    for (const q of was.q > 1 ? [1, 0] : [0]) {
      G.peak = { hit: was.hit, q }; forget(G);
      if (await tryIt(k, wide, () => { G.peak = was; forget(G); })) {
        score?.refused?.push({ t: +was.hit.toFixed(2), what: `${G.pattern.id}>${N?.pattern.id}`, why: `flashed crossing at speed: softened to q ${q}` });
        return `softened to q ${q}`;
      }
    }
  }
  if (G.xform) {
    const was = { xform: G.xform, carry: N?.carry };
    delete G.xform; if (N) delete N.carry; forget(G);
    if (await tryIt(k, wide, () => { G.xform = was.xform; if (N && was.carry) N.carry = was.carry; forget(G); })) {
      score?.refused?.push({ t: +(G.peak?.hit ?? G.t1).toFixed(2), what: `${G.pattern.id}>${N?.pattern.id}`, why: `flashed: no ${was.xform.id}` });
      return `no ${was.xform.id}`;
    }
    return null;
  }
  if (kind === 'slide' || kind === 'bend') {
    G.noGlide = true; forget(G);
    if (await tryIt(k, wide, () => { delete G.noGlide; forget(G); })) return 'no glide';
    return null;
  }
  if (!G.flashTurned) {
    const was = G.rise;
    G.flashTurned = true; G.rise = kind !== 'rise'; forget(G);
    if (await tryIt(k, wide, () => { G.rise = was; forget(G); })) return `turned to ${G.rise ? 'rise' : 'dive'}`;
  }
  const most = Math.min(FLASH_MORPH, 0.75 * (G.t1 - G.t0));
  for (let m = G.morph * 1.35; m <= most + 1e-6 || G.morph < most; m = G.morph * 1.35) {
    const was = G.morph, longer = Math.min(m, most), peak = G.peak;
    if (longer <= was + 0.05) return null;
    // Crossing on a hit goes as fast however long it has (1.875 / tail), so only taking longer without that is any slower.
    G.morph = longer; if (peak?.q) G.peak = { hit: peak.hit, q: 0 }; forget(G);
    if (await tryIt(k, wide, () => { G.morph = was; G.peak = peak; forget(G); })) {
      if (peak?.q) score?.refused?.push({ t: +peak.hit.toFixed(2), what: `${G.pattern.id}>${N?.pattern.id}`, why: 'flashed crossing at speed: off its hit, and longer' });
      return `morph ${was.toFixed(1)} to ${longer.toFixed(1)}`;
    }
    return null;
  }
  return null;
}
