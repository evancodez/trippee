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
  const R = new Renderer(c);
  await R.whenReady();
  return R;
})();

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
const shot = (R, score, t, W, H, px) => {
  R.resize(W, H, 1);
  const f = frame(score, t, R, null);
  R.draw();
  R.gl.readPixels(0, 0, W, H, R.gl.RGBA, R.gl.UNSIGNED_BYTE, px);
  return f;
};
const horizon = G => Math.max((G.arcEnd ?? G.t1) - G.t0, 1e-3);
const when = (G, u) => G.t0 + horizon(G) * u;
// The gesture alone, on the film's clock, with no song on it and nothing to morph into. A copy, so that nothing on screen can see it stopped.
const alone = (G, over) => ({ ...G, freezeEase: null, thaw: null, morph: 0, plan: null, planning: null, ...over });
// At one point of its long move, whatever the clock says
const lookAt = (R, score, G, u, { W, H, px }, ph = 0) => {
  shot(R, { gestures: [alone(G, { freezeU: u })], phi: (t, g) => score.phi(t, g) + ph }, when(G, u), W, H, px);
  return measure(px, W, H);
};
// As it will really play, riding `ride` ({ range, arcs, phiTrack...}), x of the way through
const lookAlong = (R, score, G, x, ride, { W, H, px }) => {
  shot(R, { gestures: [alone(G, { freezeU: null, ...ride })], phi: score.phi, react: score.react }, G.t0 + horizon(G) * x, W, H, px);
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
  const pair = { gestures: [{ ...A, ...fresh, rise }, { ...B, ...fresh }], phi: score.phi, react: score.react };
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
export async function rehearse(score, until, onProgress = () => {}) {
  const t0 = performance.now();
  const R = await getRig();
  const aspect = score.aspect ?? (globalThis.app?.canvas?.width && app.canvas.height ? app.canvas.width / app.canvas.height : 16 / 9);
  const stage = globalThis.app?.stage, live = () => stage?.score === score;

  // Don't hold up what's on screen: a film that isn't showing yet can have most of the time, one that's playing very little.
  const ch = new MessageChannel();
  let wake = null, last = performance.now();
  ch.port1.onmessage = () => { const w = wake; wake = null; w?.(); };
  const breathe = async () => {
    if (performance.now() - last < (live() ? 4 : 16)) return;
    await new Promise(r => { wake = r; ch.port2.postMessage(0); });
    last = performance.now();
  };

  const gestures = score.gestures, rides = [], ways = [];
  if (flag('range')) {
    const W = Math.round(LOOK_H * aspect), H = LOOK_H, px = new Uint8Array(W * H * 4);
    // What will be morphed into soon has its plan already, and what's showing is showing. Only what's still ahead changes.
    const nowT = () => globalThis.app?.pictureT?.() ?? globalThis.app?.t ?? 0;
    const firstSeen = G => { const k = gestures.indexOf(G); return k > 0 ? gestures[k - 1].t1 - (gestures[k - 1].morph || 0) : k === 0 ? G.t0 : -Infinity; };
    const mayChangeFor = G => () => !live() || firstSeen(G) > nowT() + 3;
    // The film's own last gesture, which has no move of its own, can't go wrong by riding it. A gesture a director has fixed in time (G.fixedRange) keeps what it's been given.
    const todo = gestures.filter(G => G.t0 < until && !G.fixedRange && !(G.arcs && !G.arcs.length && !G.pattern.drive));
    for (let n = 0; n < todo.length; n++) {
      const G = todo[n];
      rides.push(await rehearseGesture(R, score, G, { W, H, px, aspect, breathe, mayChange: mayChangeFor(G) }));
      onProgress(0.25 * (n + 1) / todo.length);
    }
    // Anything but the first gesture, which may be what the user asked for, and this film will be composed again without it. No need to look any further at this one.
    const again = rides.filter(r => r.sitsOut && r.id !== gestures[0].pattern.id).map(r => r.id);
    if (again.length) { ch.port1.close(); return { jumps: [], bad: [...new Set(again)], rides, ways, sitOut: [...new Set(again)], rangeSeconds: (performance.now() - t0) / 1000, seconds: (performance.now() - t0) / 1000 }; }
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

  const H = JUMP_H, W = Math.max(8, Math.round(H * aspect)), px = new Uint8Array(W * H * 4);
  const n = Math.ceil(until / STEP), jumps = [];
  let prev = null;
  for (let i = 0; i <= n; i++) {
    const t = i * STEP, f = shot(R, score, t, W, H, px);
    let s = 0;
    for (let k = 1; k < px.length; k += 4) s += px[k];
    const L = s / (W * H) / 255;
    if (prev !== null && Math.abs(L - prev) >= JUMP) jumps.push({ t: +t.toFixed(2), by: +(L - prev).toFixed(3), id: f.G.pattern.id });
    prev = L;
    if (i % 25 === 0) onProgress(0.5 + 0.5 * clamp(i / n));
    await breathe();
  }
  ch.port1.close();
  const sitOut = [...new Set(rides.filter(r => r.sitsOut).map(r => r.id))];
  return { jumps, bad: [...new Set([...sitOut, ...jumps.map(j => j.id)])], rides, ways, sitOut, rangeSeconds, seconds: (performance.now() - t0) / 1000 };
}
