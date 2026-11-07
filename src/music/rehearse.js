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
import { Renderer, TIME } from '../gl/renderer.js';
import { frame } from '../score/frame.js';
import { flag, hearing } from '../score/flags.js';
import { fillSlot, noHorizon, withTravel } from '../score/slot.js';
import { OFF, SLOT_FLOATS } from '../pattern/layout.js';
import { clamp, evalTrack, smoother } from '../score/curves.js';
import { XFORMS } from '../score/xform/index.js';
import { slowCamera } from '../score/camera.js';
import FOLD_SET from '../score/moves/folds.js';

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
const FLASH_SWING = 22, FLASH_SWING_WHOLE = 19, FLASH_WHOLE = 0, FLASH_TILE = 2, FLASH_SUB = 2, FLASH_H = 36, FLASH_H_FILM = 90, FLASH_LONGEST = 600, FLASH_ROUNDS = 4, FLASH_SLOWEST = 8, FLASH_MORPH = 15, FLASH_CALM = 0.35, FLASH_MORPH_FPS = 30;
// The judge's own swing, and a little inside its second. A smaller swing isn't a stricter count, only another count: on a slow rise and a quick fall it finishes the rise sooner, so the two come out further than a second apart where the judge's are inside it. So a film's looked at both ways.
const JUDGE_SWING = 25.5, JUDGE_WITHIN = 1.15;
// A film's looks. The whole film small and quick, at 30 a second, for anywhere that might be flashing; then whatever that finds is looked at again at twice the size again, the way the judge counts, and only a flash that's still there gets anything done about it.
// Reads are batched (Eyes), which is why this can look so much more often than a read a look could and take less time: GPU_BATCH looks to one wait for the GPU.
const FILM_SUB = 6, CLOSE_H = 180, CLOSE_FPS = 30, CLOSE_FPS_MORPH = 60, REAL_SWING = 24, REAL_WITHIN = 1.05, FILM_SWING_WHOLE = 19, REAL_SWING_WHOLE = 21.5, GUARD_LOOKS = 42, GUARD_MOST = 10000, GUARD_LOOKS_ALL = 80, SCAN_LOOK = 0.4, GPU_BATCH = 64, GPU_BATCH_CLOSE = 32, GPU_BATCH_GENTLE = 32;     // GUARD_LOOKS: close looks, per second of film, for it to spend, so a film with twice the changes takes no longer. A coarse look costs SCAN_LOOK of one. GPU_BATCH_GENTLE: behind a film that's playing, a wait for the GPU every 8 looks spent most of each frame's share waiting (the hand cut took 49 s behind MGMT; at 32 it takes 15, with no worse frames)
// What it may do. A loud stretch never drops below half its flow, however stubborn the flash; a quiet one, a quarter. Both only for the seconds it flashes, easing there and back.
const SLOW_LOUD = 2, SLOW_QUIET = 4, SLOW_RAMP = 1.2, SLOW_AROUND = 0.6, LONGER_MOST = 1.35;
// How long a song's film takes to fly in, as song.js has it unless the flight needs longer: a first gesture's morph can't start before that, or stage._clearRunway cuts it short after it's been looked at.
const FLASH_ARRIVAL = 7;
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
// A rehearsal looks at the film, not the layer that follows the song over it (src/score/hear.js): what it might change for a flash is the film's own, and it mustn't slow a film down over something that layer's doing. A test's look sees all of it.
const FILM_ONLY = { hear: 0 };
const drawn = (R, score, t, W, H, colour = false, edits = FILM_ONLY) => {
  R.resize(W, H, 1);
  const h = score.world ? score.handover : null;
  if (h) score.handover = null;
  const f = frame(score, t, R, edits);
  if (h) score.handover = h;
  const wp = R.wp;
  if (wp && !colour) wp.block[0] = 1;
  R.draw();
  if (wp) wp.block[0] = 0;
  return f;
};
const shot = (R, score, t, W, H, px, colour = false, edits = FILM_ONLY) => {
  const f = drawn(R, score, t, W, H, colour, edits);
  R.gl.readPixels(0, 0, W, H, R.gl.RGBA, R.gl.UNSIGNED_BYTE, px);
  return f;
};
// The same frame, except that a transformation's plan that isn't there yet is worked out a look at a time, with the page going on between its looks (src/score/xform/plan.js planSteps),
// instead of all of them at once inside this one frame: up to eight waits for the GPU, which behind a film that's playing was a frame of 60 to 120 ms. It's the same plan either way, so what's drawn is the same. A world plans as it did.
const LATER = new WeakMap(), LATER_NONE = { planLater: true }, PLAN_WAITS = 4000;
const laterOf = edits => { if (!edits) return LATER_NONE; let e = LATER.get(edits); if (!e) LATER.set(edits, e = { ...edits, planLater: true }); return e; };
const waiter = (task, breathe) => async () => { await task(); await breathe(); };
// And it's drawn with the program it asks for. One the rehearsal hasn't needed yet (a fold or a sheet in space that a swap has just brought in) was built while the frame went without it, so what
// was looked at, and what the guard did about it, depended on how quickly the GPU built it: the same film rehearsed twice came out two ways. It waits for it, a few seconds at most.
const PROGRAM_WAIT = 4000;
const built = async (R, v) => {
  if (R.noWait?.has(v)) return;      // one that didn't come in time isn't waited for again
  const ok = await Promise.race([R.whenBuilt([v]).then(() => true), new Promise(res => setTimeout(() => res(false), PROGRAM_WAIT))]);
  if (!ok) (R.noWait ??= new Set()).add(v);
};
async function drawnSoon(R, score, t, W, H, colour, edits, wait) {
  if (score.world) return drawn(R, score, t, W, H, colour, edits);
  const e = laterOf(edits);
  let f = drawn(R, score, t, W, H, colour, e);
  let want = R._variantOf(R.frame) | (R.timeOn ? TIME : 0);
  if (!f.waiting && R.variant === want) return f;
  for (let n = 0; n < PLAN_WAITS && f.waiting; n++) { await wait(); f = frame(score, t, R, e); }
  want = R._variantOf(R.frame) | (R.timeOn ? TIME : 0);
  if (!R.progs[want]) await built(R, want);
  return drawn(R, score, t, W, H, colour, edits);
}
const shotSoon = async (R, score, t, W, H, px, wait) => { const f = await drawnSoon(R, score, t, W, H, false, FILM_ONLY, wait); R.gl.readPixels(0, 0, W, H, R.gl.RGBA, R.gl.UNSIGNED_BYTE, px); return f; };
// Many looks and one wait. A plain readPixels makes the page wait for the GPU process every time, and that wait is most of what a small look costs: .59 ms against .12 ms at 160 x 90. So each frame is copied into a buffer
// on the GPU's side as it's drawn, and the whole batch is read in one go once a fence says it's done. A fence only passes between tasks, so flush has to be awaited. The pixels handed over are good only inside the call.
class Eyes {
  constructor(R, W, H, K, task) {
    const gl = R.gl;
    Object.assign(this, { gl, W, H, K, task, size: W * H * 4, q: [], pbo: gl.createBuffer(), buf: new Uint8Array(W * H * 4 * K) });
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, this.buf.length, gl.STREAM_READ);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  }
  // A guard asks for these many times over, at the same two sizes, and the buffers are megabytes each. So they're kept, for the rig, which is kept too.
  static of(R, W, H, K, task) {
    const kept = (R.eyes ??= new Map()), key = `${W}x${H}x${K}`;
    let e = kept.get(key);
    if (!e) kept.set(key, e = new Eyes(R, W, H, K, task));
    e.task = task; e.q.length = 0;
    return e;
  }
  // After a draw at this size. Says whether the batch is full.
  read(take) {
    const { gl, W, H } = this;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, this.q.length * this.size);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.q.push(take);
    return this.q.length >= this.K;
  }
  async flush() {
    const { gl, q, size, buf } = this;
    if (!q.length) return;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    for (let i = 0; i < 2000 && gl.getSyncParameter(sync, gl.SYNC_STATUS) !== gl.SIGNALED; i++) await this.task();
    gl.deleteSync(sync);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, buf, 0, q.length * size);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    q.forEach((take, j) => take(buf.subarray(j * size, (j + 1) * size)));
    q.length = 0;
  }
  free() { this.gl.deleteBuffer(this.pbo); this.buf = null; }     // only one made with new
}
const horizon = G => Math.max((G.arcEnd ?? G.t1) - G.t0, 1e-3);
// A look at part of a film is in that film's world, or its own fields wouldn't draw. Nothing at all for the film.
const worldOf = score => (score.world ? { world: score.world, tables: score.tables } : null);
const when = (G, u) => G.t0 + horizon(G) * u;
// The gesture alone, on the film's clock, with no song on it and nothing to morph into. A copy, so that nothing on screen can see it stopped.
// ...and with none of src/score/woah.js's tricks, which aren't what's being asked about here: is this pattern any good to ride, as itself.
const alone = (G, over) => ({ ...G, freezeEase: null, thaw: null, morph: 0, plan: null, planning: null, ...(G.moves?.some(m => m.woah) ? { moves: G.moves.filter(m => !m.woah) } : null), ...over });
// At one point of its long move, whatever the clock says
const lookAt = async (R, score, G, u, { W, H, px, task, breathe }, ph = 0) => {
  await shotSoon(R, { gestures: [alone(G, { freezeU: u })], phi: (t, g) => score.phi(t, g) + ph, ...worldOf(score) }, when(G, u), W, H, px, waiter(task, breathe));
  return measure(px, W, H);
};
// As it will really play, riding `ride` ({ range, arcs, phiTrack...}), x of the way through
const lookAlong = async (R, score, G, x, ride, { W, H, px, task, breathe }) => {
  await shotSoon(R, { gestures: [alone(G, { freezeU: null, ...ride })], phi: score.phi, react: score.react, ...worldOf(score) }, G.t0 + horizon(G) * x, W, H, px, waiter(task, breathe));
  return measure(px, W, H);
};

// The first thing that goes wrong playing it for real, or null. Going a bit too white or too black is only wrong if it lasts: the judge gives it 3 s, and these looks are about 2 s apart.
async function firstBad(R, score, G, ride, ctx) {
  let lone = false;
  for (const x of PATH) {
    const m = await lookAlong(R, score, G, x, ride, ctx), tone = m.why === 'white' || m.why === 'tiles';
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
      const m = await lookAt(R, score, G, i / n, ctx, ph);
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
async function flightOf(R, score, A, B, rise, { W, H, px, breathe, task }) {
  const fresh = { plan: null, planFor: null, planning: null };
  const pair = { gestures: [{ ...A, ...fresh, rise }, { ...B, ...fresh }], phi: score.phi, react: score.react, ...worldOf(score) };
  const t0 = A.t1 - A.morph, step = A.morph / SAMPLES;
  let kind = null, noise = 0, colour = 0, runN = 0, runC = 0;
  for (let i = 1; i < SAMPLES; i++) {     // the two ends are the gestures themselves, and those have been looked at
    const f = await drawnSoon(R, pair, t0 + i * step, W, H, false, FILM_ONLY, waiter(task, breathe));
    R.gl.readPixels(0, 0, W, H, R.gl.RGBA, R.gl.UNSIGNED_BYTE, px);
    const m = measure(px, W, H);
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

const shownShot = (R, score, t, W, H, px, colour = false) => shot(R, score, t, W, H, px, colour, null), shownDrawn = (R, score, t, W, H, colour = false) => drawn(R, score, t, W, H, colour, null);
export { getRig, shownShot as shot, shownDrawn as drawn, Eyes, slowedTrack };    // for tests: the same eyes, at any moment of a film

// Returns { jumps: [{ t, by, id }], bad: [pattern ids], rides: [what each gesture rides], ways: [each transformation], sitOut: [no good run], seconds }
// stale: asked between looks. Once it says yes the rehearsal stops where it is, by throwing, because someone's made another film and this one will never be shown.
// gentle: a film's playing in front of this one, so it takes less of each frame.
// opening: the seconds a long arrival has just taken (stage._clearRunway). Only the film's first two gestures are looked at again, and only for flashes.
export async function rehearse(score, until, onProgress = () => {}, { lastTry = false, stale = null, gentle = false, opening = 0, keep = null } = {}) {
  const t0 = performance.now();
  const R = await getRig();
  // A world's programs on this renderer too, all of them: as with the film's, anything not built yet would be judged as a different picture. If it fails to build it draws as the film, as it would on screen.
  if (score.world) { await R.prepareWorld(score.world); await R.worldPrograms.get(score.world).whenAll; }
  if (score.world && score.gestures.some(G => G.moves?.some(m => FOLD_SET[m.id]))) await R.whenFoldReady();      // the same for a film with a fold in it
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

  const task = () => new Promise(r => { wake = r; ch.port2.postMessage(0); }), soon = waiter(task, breathe);
  const gestures = score.gestures, rides = [], ways = [];
  if (!opening && score.woah) await buildFor(R, score, until, breathe);
  // A jump in brightness makes a whole new film, so it's looked for first, before anything's spent on this one. And one inside a trick is the trick's: it's the trick that goes.
  if (score.woah && !opening && !lastTry && !score.world && !score.cut && flag('flashGuard') && until <= FLASH_LONGEST) {
    const early = await jumpsFirst(R, score, until, { aspect, breathe, task, batch: live() || gentle ? GPU_BATCH_GENTLE : GPU_BATCH });
    if (early.filter(j => j.id !== keep).length) { ch.port1.close(); return { jumps: early, bad: [...new Set(early.map(j => j.id))], rides: [], ways: [], sitOut: [], rangeSeconds: 0, seconds: (performance.now() - t0) / 1000, early: true }; }
  }
  // What will be morphed into soon has its plan already, and what's showing is showing. Only what's still ahead changes.
  const nowT = () => globalThis.app?.pictureT?.() ?? globalThis.app?.t ?? 0;
  const firstSeen = G => { const k = gestures.indexOf(G); return k > 0 ? gestures[k - 1].t1 - (gestures[k - 1].morph || 0) : k === 0 ? G.t0 : -Infinity; };
  const mayChangeFor = G => () => !live() || firstSeen(G) > nowT() + 3;
  if (flag('range') && !opening) {
    const W = Math.round(LOOK_H * aspect), H = LOOK_H, px = new Uint8Array(W * H * 4);
    // The film's own last gesture, which has no move of its own, can't go wrong by riding it. A gesture a director has fixed in time (G.fixedRange) keeps what it's been given.
    const todo = gestures.filter(G => G.t0 < until && !G.fixedRange && !(G.arcs && !G.arcs.length && !G.pattern.drive));
    for (let n = 0; n < todo.length; n++) {
      const G = todo[n];
      rides.push(await rehearseGesture(R, score, G, { W, H, px, aspect, breathe, task, mayChange: mayChangeFor(G) }));
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
        ways.push(await chooseWay(R, score, A, B, { W, H, px, breathe, task, mayChange: mayChangeFor(B) }));
        onProgress(0.25 + 0.25 * (n + 1) / pairs.length);
      }
    }
  }
  const rangeSeconds = (performance.now() - t0) / 1000;

  // With the flash guard on the same pass also keeps every frame's brightness and tiles, at a rate that can see a flash. A very long piece only gets looked at for jumps.
  const guard = flag('flashGuard') && until <= FLASH_LONGEST;
  const colour = guard && !!score.world && score.world.id !== 'mirror';     // the mirror world draws exactly the film, so its film must be exactly the film's, guard and all
  // At 36 rows a fine stretch reads a third of full scale brighter than it shows, and its swings aren't the ones on screen. At 90 the count comes out the judge's. And a bold ring going by every quarter second is more than ten looks a second can see: it reads as a slow drift, and the judge's sixty count it. A world and a hand cut stay as they were.
  const onFilm = guard && !colour && !score.cut, batched = guard && !colour;
  const sub = guard ? (onFilm ? FILM_SUB : FLASH_SUB) : 1;
  const H = guard ? (onFilm ? FLASH_H_FILM : FLASH_H) : JUMP_H, W = Math.max(8, Math.round(H * aspect)), px = new Uint8Array(W * H * 4);
  const n = Math.ceil(until / STEP) * sub, jumps = [];
  const seen = guard ? new FlashSeen(n + 1, W, H, sub / STEP, colour, onFilm) : null;
  const batch = live() || gentle ? GPU_BATCH_GENTLE : GPU_BATCH;
  if (batched) {
    const eyes = Eyes.of(R, W, H, batch, task);
    for (let i = 0; i <= n; i++) {
      const f = await drawnSoon(R, score, i * STEP / sub, W, H, false, FILM_ONLY, soon), o = { from: f.from, G: f.G, kind: f.kind };     // what the frame was, now: the pixels come later
      if (eyes.read(p => seen.take(i, p, o, gestures))) await eyes.flush();
      if (i % 25 === 0) onProgress(0.5 + 0.4 * clamp(i / n));
      await breathe();
    }
    await eyes.flush();
    for (let i = sub; i <= n; i += sub) { const by = (seen.mean[i] - seen.mean[i - sub]) / 255; if (Math.abs(by) >= JUMP) jumps.push({ t: +(i * STEP / sub).toFixed(2), by: +by.toFixed(3), id: gestures[Math.max(seen.who[i], 0)].pattern.id }); }
  } else {
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
  }
  const ctxG = { W, H, px, breathe, task, mayChangeFor, opening, aspect, batch };
  const clocked = { scan: (performance.now() - t0) / 1000 - rangeSeconds }, lap = (k, was) => { clocked[k] = +((performance.now() - was) / 1000).toFixed(2); };
  let was = performance.now();
  // A jump inside a trick is the trick's, and it's the trick that goes, not the pattern and a whole new film
  if (batched && onFilm && jumps.length && score.woah && !opening) await swapForJumps(R, score, seen, jumps, ctxG);
  const flash = guard && (!jumps.length || lastTry) ? await (onFilm ? guardFilm : guardFlashes)(R, score, seen, ctxG) : null;
  lap('guard', was); was = performance.now();
  if (flash && onFilm && score.woah && !opening) flash.swaps = await guardWoah(R, score, seen, flash, ctxG);
  lap('swaps', was); was = performance.now();
  if (flash && score.hear && hearing.on) await guardHeard(R, score, until, colour, ctxG);
  lap('heard', was);
  ch.port1.close();
  const sitOut = [...new Set(rides.filter(r => r.sitsOut).map(r => r.id))];
  return { jumps, bad: [...new Set([...sitOut, ...jumps.map(j => j.id)])], rides, ways, flash, sitOut, rangeSeconds, clocked, seconds: (performance.now() - t0) / 1000 };
}

// ---------------------------------------------------------------- flashes
// The limits on flashing protect whoever's watching, so they're not a matter of taste: no pair of opposing swings of the whole frame's brightness within a second, and at most two per second in any one
// sixteenth of it (see tests/judge.mjs). Why any one film flashes can't be told from the numbers: it's bold rings flowing out faster than their brightness can settle, a slide that blows its lines up huge on
// the way past, a flight rushing big solids by. So it's looked at. The whole film, small; and whatever flashes gets the least it needs, on that one gesture: what flows flows slower, a glide
// becomes a flight, a flight goes the other way or takes longer over it. Each change is kept only if it helps, and the rest of the film is left exactly as it was.
export class FlashSeen {
  // world: read true colour through three channels. Left off, this is what the film has always done, reading green.
  // judged: count at the judge's swing too. Off for a hand cut, whose film stays what it is.
  constructor(n, W, H, fps, world = false, judged = false) {
    this.judged = judged;
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
  overIn(get, limit, swing, out, a = 0, b = this.n, within = 1) {
    const sw = []; let dir = 0, pivot = get(a);
    for (let i = a; i < b; i++) {
      const v = get(i);
      if (dir >= 0 && v > pivot) { pivot = v; dir = 1; }
      if (dir <= 0 && v < pivot) { pivot = v; dir = -1; }
      if (dir === 1 && pivot - v >= swing) { sw.push(i); dir = -1; pivot = v; }
      else if (dir === -1 && v - pivot >= swing) { sw.push(i); dir = 1; pivot = v; }
    }
    for (let s = 0; s < sw.length; s++) { let e = s; while (e < sw.length && sw[e] - sw[s] < this.fps * within) e++; if (Math.floor((e - s) / 2) > limit) out.push(sw[e - 1]); }
  }
  over(a = 0, b = this.n, wholeOnly = false) {
    const out = [];
    if (this.world) {
      this.overIn(i => this.mean[i], FLASH_WHOLE, WORLD_SWING_WHOLE.luma, out, a, b);
      if (!wholeOnly) for (let k = 0; k < 16; k++) this.overIn(i => this.tiles[i * 16 + k], WORLD_TILE, WORLD_SWING.luma, out, a, b);
      for (const c of ['red', 'rc']) {
        const v = this[c];
        this.overIn(i => v[i * 17 + 16], FLASH_WHOLE, WORLD_SWING_WHOLE[c], out, a, b);
        if (!wholeOnly) for (let k = 0; k < 16; k++) this.overIn(i => v[i * 17 + k], WORLD_TILE, WORLD_SWING[c], out, a, b);
      }
      return out;
    }
    this.overIn(i => this.mean[i], FLASH_WHOLE, this.judged ? FILM_SWING_WHOLE : FLASH_SWING_WHOLE, out, a, b);
    for (let k = 0; k < 16; k++) this.overIn(i => this.tiles[i * 16 + k], FLASH_TILE, FLASH_SWING, out, a, b);
    if (this.judged) {
      this.overIn(i => this.mean[i], FLASH_WHOLE, JUDGE_SWING, out, a, b, JUDGE_WITHIN);
      for (let k = 0; k < 16; k++) this.overIn(i => this.tiles[i * 16 + k], FLASH_TILE, JUDGE_SWING, out, a, b, JUDGE_WITHIN);
    }
    return out;
  }
  // What the judge would count, close up: its limits and its swing, the smallest bit inside it for the difference in size. The frames are the last swing of each run, as in overIn.
  real(a = 0, b = this.n, strict = false) {
    const out = [];
    this.overIn(i => this.mean[i], FLASH_WHOLE, strict ? JUDGE_SWING : REAL_SWING_WHOLE, out, a, b, REAL_WITHIN);      // the whole frame has no allowance, so it's read further inside the judge's 25.5
    const whole = out.length;
    for (let k = 0; k < 16; k++) this.overIn(i => this.tiles[i * 16 + k], FLASH_TILE, strict ? JUDGE_SWING : REAL_SWING, out, a, b, REAL_WITHIN);
    return { frames: out, whole };
  }
}
const forget = G => { if (G) G.plan = G.planFor = G.planning = null; };

// ---------------------------------------------------------------- the layer that follows the song
// Everything above looks at the film with this layer off. So here it's on: the film as it's seen, and for the second or so around whatever's still flashing, the layer itself gives way (score.hear.ease), a little more each time it doesn't clear, and nowhere else. It takes nothing from the rest of the song. What flashes with it all the way down is the film's own.
const HEAR_ROUNDS = [0.55, 0.3, 0.12], HEAR_EDGE = 0.35, HEAR_SUB_WORLD = 2, HEAR_LOOKS = 8, HEAR_MOST = 2000;      // HEAR_LOOKS: close looks it has to spend, per second of film
const CAM_TRIES = 5, CAM_RATE = 0.3;
async function guardHeard(R, score, until, colour, ctx) {
  const H = score.hear, g = score.gestures, edits = { hear: 1 }, fps = (colour ? HEAR_SUB_WORLD : FILM_SUB) / STEP, HH = colour ? FLASH_H : FLASH_H_FILM, W = Math.max(8, Math.round(HH * ctx.aspect)), n = Math.ceil(until * fps);
  const seen = new FlashSeen(n + 1, W, HH, fps, colour, !colour);
  const look = async (a, b) => {
    a = Math.max(0, a); b = Math.min(n + 1, b);
    const eyes = Eyes.of(R, W, HH, ctx.batch, ctx.task);
    for (let i = a; i < b; i++) {
      const f = await drawnSoon(R, score, i / fps, W, HH, colour, edits, waiter(ctx.task, ctx.breathe)), o = { from: f.from, G: f.G, kind: f.kind };
      if (eyes.read(p => seen.take(i, p, o, g))) await eyes.flush();
      await ctx.breathe();
    }
    await eyes.flush();
  };
  await look(0, n + 1);
  // What it's got to look with. Past that, whatever's left is said by the judge and not by this, and a film's load time doesn't depend on how much it has going on.
  let spent = 0;
  const allowed = score.woah ? Math.min(HEAR_LOOKS * until, HEAR_MOST) : Infinity, count = k => { spent += k; }, close = (a, b, strict = false) => (spent > allowed ? { at: [], whole: 0 } : lookClose(R, score, a, b, ctx, count, edits, strict));
  const dips = H.dips = [];
  const dip = (a, b, to) => { for (let i = Math.max(0, Math.floor((a - HEAR_EDGE) * H.hz)), e = Math.min(H.n - 1, Math.ceil((b + HEAR_EDGE) * H.hz)); i <= e; i++) { const t = i / H.hz, k = smoother((t - (a - HEAR_EDGE)) / HEAR_EDGE) * smoother((b + HEAR_EDGE - t) / HEAR_EDGE); H.ease[i] = Math.min(H.ease[i], 1 - (1 - to) * k); } };
  const fine = new Set();
  let left = 0;
  for (const to of HEAR_ROUNDS) {
    left = 0;
    // In a world only the whole frame, at the small size it's looked at here: read this coarsely a tile's mostly false alarms, and giving way for those would be most of the film.
    for (const w of stretches(seen.over(0, seen.n, colour), fps)) {
      const key = w.b.toFixed(1);
      if (fine.has(key)) continue;
      const at = colour ? [w.b - 0.5] : (await close(w.a, w.b)).at;
      if (!at.length) { fine.add(key); continue; }
      left++;
      H.ease ??= new Float32Array(H.n).fill(1);
      const a = Math.min(...at) - 1.05, b = Math.max(...at) + 0.1;
      dip(a, b, to);
      dips.push({ a: +a.toFixed(2), b: +b.toFixed(2), to });
      const f0 = Math.floor((a - 1.5) * fps), f1 = Math.ceil((b + 1.5) * fps);
      await look(f0, f1); count((f1 - f0) * SCAN_LOOK);
    }
    if (!left) break;
  }
  // What's still flashing by the judge's own count with the layer nearly gone is the film's own. Giving way there has done nothing but leave a dead second, so the layer has it back.
  if (left) {
    const stuck = [];
    for (const w of stretches(seen.over(0, seen.n, colour), fps)) if (!fine.has(w.b.toFixed(1))) stuck.push(...(colour ? [w.b - 0.5] : (await close(w.a, w.b, true)).at));      // what the judge itself would count: anything less and the dip's doing its job
    const keep = dips.filter(d => !stuck.some(t => d.b > t - 1.3 && d.a < t + 0.2));
    if (keep.length < dips.length) { H.ease.fill(1); dips.length = 0; for (const d of keep) { dips.push(d); dip(d.a, d.b, d.to); } }
  }
  // And the camera (src/score/camera.js): whatever's left, it goes more slowly past, and keeps that only if it helped.
  if (score.camera && !colour) {
    let tried = 0;
    H.camSlowed = [];
    for (const w of stretches(seen.over(0, seen.n, false), fps)) {
      if (tried >= (score.woah ? 3 : CAM_TRIES) || fine.has(w.b.toFixed(1))) continue;
      const was = await close(w.a, w.b);
      if (!was.at.length) continue;
      tried++;
      const a = Math.min(...was.at) - 1, b = Math.max(...was.at) + 0.2, kept = score.camera.lag?.slice() ?? null;
      slowCamera(score.camera, a, b, CAM_RATE);
      for (const G of g) if (G.t0 < b + 8 && G.t1 > a - 8) forget(G);
      const now = await close(w.a, w.b);
      if (now.at.length < was.at.length || now.whole < was.whole) { H.camSlowed.push({ a: +a.toFixed(2), b: +b.toFixed(2), was: was.at.length, now: now.at.length }); await look(Math.floor((a - 1.5) * fps), Math.ceil((b + 8) * fps)); }
      else { score.camera.lag = kept; for (const G of g) if (G.t0 < b + 8 && G.t1 > a - 8) forget(G); }
    }
  }
  return dips;
}

// ---------------------------------------------------------------- what a film will draw with
// Each trick's program is only built when it's first asked for, which on screen would be a hitch. So the film's walked, with nothing drawn, for what it's going to ask for: both renderers build those, and neither has to stop for one.
async function buildFor(R, score, until, breathe) {
  const want = new Set(), t0 = performance.now(), W = score.world, on = W ? R.worldPrograms?.get(W) : R;
  R.resize(16, 9, 1);
  for (let t = 0; t < until; t += 0.25) {
    for (const edits of [FILM_ONLY, null]) { drawnNot(R, score, t, edits); want.add((W ? on.variantOf(R.frame) : R._variantOf(R.frame)) | (R.timeOn ? TIME : 0)); }
    await breathe();
  }
  const list = [...want], shown = globalThis.app?.R, there = W ? shown?.worldPrograms?.get(W) : shown;
  there?.whenBuilt?.(list);
  await on.whenBuilt(list);
  score.woahPrograms = { list, seconds: +((performance.now() - t0) / 1000).toFixed(2) };
}
const drawnNot = (R, score, t, edits) => { const h = score.world ? score.handover : null; if (h) score.handover = null; frame(score, t, R, edits); if (h) score.handover = h; };

// ---------------------------------------------------------------- a trick the guard can't clear
// It's swapped for the next thing that could go there, and what clears it most is kept. It's never dropped: what's least bad stays, and all of it's in score.refused.
// SWAP_TRIES: for any one slot; SWAP_ALL: for the film. SWAP_FILM: how many the flash guard tries on a slot first, before anything that would slow it.
const SWAP_TRIES = 3, SWAP_ALL = 10, SWAP_FOR = 3, SWAP_FILM = 3, JUMP_SWAPS = 6;
function swapLooks(R, score, seen, ctx) {
  const g = score.gestures, fps = seen.fps;
  const scan = async ([a, b]) => {
    const eyes = Eyes.of(R, seen.W, seen.H, ctx.batch, ctx.task);
    for (let i = a; i < b; i++) {
      const f = await drawnSoon(R, score, i / fps, seen.W, seen.H, false, FILM_ONLY, waiter(ctx.task, ctx.breathe)), o = { from: f.from, G: f.G, kind: f.kind };
      if (eyes.read(p => seen.take(i, p, o, g))) await eyes.flush();
      await ctx.breathe();
    }
    await eyes.flush();
  };
  const frames = (a, b) => [Math.max(0, Math.floor(a * fps)), Math.min(seen.n, Math.ceil(b * fps) + 1)];
  return { scan, frames };
}
async function swapForJumps(R, score, seen, jumps, ctx) {
  const W = score.woah, sub = FILM_SUB, { scan, frames } = swapLooks(R, score, seen, ctx), done = new Set();
  const jumpsIn = ([a, b]) => { const out = []; for (let i = Math.max(a, sub); i < b; i += sub) if (Math.abs(seen.mean[i] - seen.mean[i - sub]) / 255 >= JUMP) out.push(i); return out; };
  for (const j of [...jumps]) {
    const slot = W.slots.find(s => j.t >= s.from - 0.5 && j.t <= s.to + 0.5);
    if (!slot || done.has(slot)) continue;
    done.add(slot);
    const range = frames(slot.from - 1, slot.to + 1), before = jumpsIn(range).length, was = slot.id;
    let cleared = false;
    for (const alt of W.altsFor(slot).slice(0, JUMP_SWAPS)) {
      const undo = W.swap(slot, alt);
      if (!undo) continue;
      const kept = seen.keep(range);
      await scan(range);
      if (jumpsIn(range).length < before) { cleared = true; (score.refused ??= []).push({ t: +j.t.toFixed(2), what: `${was} became ${alt}`, why: 'a jump in brightness' }); break; }
      undo();
      seen.back(range, kept);
    }
    if (cleared) for (let i = jumps.length - 1; i >= 0; i--) if (jumps[i].t >= slot.from - 1 && jumps[i].t <= slot.to + 1) jumps.splice(i, 1);
  }
}
async function jumpsFirst(R, score, until, ctx) {
  const H = JUMP_H, W = Math.max(8, Math.round(H * ctx.aspect)), g = score.gestures, n = Math.ceil(until / STEP), mean = new Float32Array(n + 1), who = new Int32Array(n + 1), eyes = Eyes.of(R, W, H, ctx.batch, ctx.task);
  const look = async (a, b) => {
    for (let i = a; i < b; i++) {
      const f = await drawnSoon(R, score, i * STEP, W, H, false, FILM_ONLY, waiter(ctx.task, ctx.breathe)), G = f.from ?? f.G;
      who[i] = g.indexOf(G);
      if (eyes.read(p => { let s = 0; for (let k = 1; k < p.length; k += 4) s += p[k]; mean[i] = s / (W * H); })) await eyes.flush();
      await ctx.breathe();
    }
    await eyes.flush();
  };
  await look(0, n + 1);
  const jumpsIn = (a, b) => { const out = []; for (let i = Math.max(a, 1); i < b; i++) { const by = (mean[i] - mean[i - 1]) / 255; if (Math.abs(by) >= JUMP) out.push({ t: +(i * STEP).toFixed(2), by: +by.toFixed(3), id: g[Math.max(who[i], 0)].pattern.id }); } return out; };
  const W2 = score.woah, done = new Set();
  if (W2) for (const j of jumpsIn(0, n + 1)) {
    const slot = W2.slots.find(s => j.t >= s.from - 0.5 && j.t <= s.to + 0.5);
    if (!slot || done.has(slot)) continue;
    done.add(slot);
    const a = Math.max(0, Math.floor((slot.from - 1) / STEP)), b = Math.min(n + 1, Math.ceil((slot.to + 1) / STEP)), was = slot.id, before = jumpsIn(a, b).length;
    let cleared = false;
    for (const alt of [...W2.altsFor(slot).slice(0, JUMP_SWAPS), null]) {
      const undo = W2.swap(slot, alt);
      if (!undo) continue;
      await look(a, b);
      if (jumpsIn(a, b).length < before) { (score.refused ??= []).push({ t: j.t, what: alt ? `${was} became ${alt}` : `${was} taken off`, why: 'a jump in brightness' }); cleared = true; break; }
      undo();
    }
    if (!cleared) await look(a, b);
  }
  return jumpsIn(0, n + 1);
}
async function guardWoah(R, score, seen, flash, ctx) {
  const W = score.woah, { scan, frames } = swapLooks(R, score, seen, ctx), refused = (score.refused ??= []), swaps = [], g = score.gestures, fps = seen.fps;
  const realIn = async range => { const out = { at: [], whole: 0 }; for (const w of stretches(seen.over(...range), fps)) { const r = await lookClose(R, score, w.a, w.b, ctx); out.at.push(...r.at); out.whole += r.whole; } return out; };
  const worse = r => r.whole * 100 + r.at.length;
  const at = t => flash.left.some(x => x >= t.a && x <= t.b);
  const slots = W.slots.map(slot => ({ slot, a: slot.from - 1, b: slot.to + 1 })).filter(at);
  let all = 0;
  for (const { slot, a, b } of slots) {
    let best = await realIn(frames(a, b)), cur = slot.id, tries = 0;
    if (!best.whole && best.at.length < SWAP_FOR) continue;       // a tile a little over isn't worth another trick, and it's reported as it is
    // Only around what's wrong: what it's swapped for has the rest of its time looked at with everything else, by guardHeard
    const range = frames(Math.max(a, Math.min(...best.at) - 3.2), Math.min(b, Math.max(...best.at) + 1.5));
    best = await realIn(range);
    const first = cur;
    for (const alt of W.altsFor(slot)) {
      if (!worse(best) || tries >= SWAP_TRIES + (best.whole ? 2 : 0) || all >= SWAP_ALL) break;
      if (alt === cur) continue;
      const undo = W.swap(slot, alt);
      if (!undo) continue;
      tries++; all++;
      const kept = seen.keep(range);
      await scan(range);
      const now = await realIn(range);
      if (worse(now) < worse(best)) { best = now; cur = alt; }
      else { undo(); seen.back(range, kept); }
    }
    // Never taken off: a slot cast as nothing is a hole in the film, and what's least bad of what could go there stays, and is reported
    if (cur !== first) { swaps.push({ t: +slot.from.toFixed(2), was: first, now: cur, left: best.at.length }); refused.push({ t: +slot.from.toFixed(2), what: `${first} became ${cur}`, why: best.at.length ? `it flashed, and this flashes less (${best.at.length} left)` : 'it flashed, and this does not' }); }
    else if (tries) refused.push({ t: +slot.from.toFixed(2), what: first, why: `flash left: ${best.at.length}${best.whole ? ', whole frame' : ''}, ${tries} tried and none was better` });
    else refused.push({ t: +slot.from.toFixed(2), what: first, why: `flash left: ${best.at.length}, and nothing else can go here` });
  }
  return swaps;
}

// ---------------------------------------------------------------- is it really flashing?
// A stretch of a film at the size the judge reads and at its rate, with a transformation twice that. Returns the seconds of what it counts, and whether any of that's the whole frame.
async function lookClose(R, score, a, b, { aspect, task, breathe, batch }, count = () => {}, edits = FILM_ONLY, strict = false) {
  const g = score.gestures, H = CLOSE_H, W = Math.round(H * aspect);
  // At a hit a change goes by too quickly for 30 a second to be sure of it
  const crossing = g.some(G => G.morph && G.peak?.q && G.peak.hit > a - 1 && G.peak.hit < b + 1), fps = crossing ? CLOSE_FPS_MORPH : CLOSE_FPS, n = Math.max(2, Math.ceil((b - a) * fps));
  const s = new FlashSeen(n, W, H, fps), eyes = Eyes.of(R, W, H, Math.min(batch, GPU_BATCH_CLOSE), task);
  for (let i = 0; i < n; i++) {
    const f = await drawnSoon(R, score, a + i / fps, W, H, false, edits, waiter(task, breathe)), o = { from: f.from, G: f.G, kind: f.kind };
    if (eyes.read(p => s.take(i, p, o, g))) await eyes.flush();
    await breathe();
  }
  await eyes.flush();
  count(n);
  const r = s.real(0, s.n, strict);
  return { at: r.frames.map(i => a + i / fps), whole: r.whole, kinds: r.frames.map(i => ({ k: s.who[i], kind: s.kind[i] })) };
}
// A run of frames a coarse look flagged, as stretches of seconds: from a bit before the first, since a run of swings ends at the frame it's reported on, to a bit after the last.
const stretches = (frames, fps) => {
  const sorted = [...new Set(frames)].sort((a, b) => a - b), out = [];
  // It starts a long way before the first, because a count starting part way up a swing doesn't count that swing.
  for (const i of sorted) { const t = i / fps, l = out.at(-1); if (l && t < l.b + 0.6) l.b = t + 0.5; else out.push({ a: Math.max(0, t - 2.6), b: t + 0.5 }); }
  return out;
};

// ---------------------------------------------------------------- the film's guard
// What it softens is only what's really flashing (lookClose), only for the seconds it flashes, and it writes each thing down in score.refused. A stretch louder than the song's middle keeps at least half its flow and every transformation, and if that leaves a flash, the flash stays and is reported: the
// film isn't dulled to pass. Reading film seconds as song seconds here is close enough: this only asks which side of the song's middle a stretch is on.
const loudness = score => {
  const R = score.react, e = R?.energy;
  if (!e?.length) return () => true;
  const sorted = Float32Array.from(e).sort(), mid = sorted[sorted.length >> 1], hz = R.hz || 50;
  return t => { const a = Math.max(0, Math.floor((t - 4) * hz)), b = Math.min(e.length, Math.ceil((t + 4) * hz)); let s = 0; for (let i = a; i < b; i++) s += e[i]; return b > a && s / (b - a) > mid; };
};
const flowOf = (track, s, h = 1e-3) => (evalTrack(track, s + h) - evalTrack(track, s - h)) / (2 * h);
// A gesture's flow, 1/by of itself from a to b, easing down over a ramp before and back over one after. Everything else in the track stays where it is, a gear change on its bar included. The cycles it falls behind by stay behind for the rest of the gesture;
// or, for a pattern that breathes on the clock (pay), they're made up over the next few seconds, at most about a third faster, so that everything past that is exactly as it was. No room for that: null.
function slowedTrack(G, tau, a, b, by, pay) {
  const was = G.phiTrack ?? [{ t: tau(G.t0), x: tau(G.t0) / 8, v: 1 / 8 }];
  const ta = tau(a - SLOW_RAMP), tb = tau(a), tc = tau(b), td = tau(b + SLOW_RAMP), slow = 1 - 1 / by;
  const fall = (tb - ta) * slow / 2 + (tc - tb) * slow + (td - tc) * slow / 2;
  // How far the clock has come by s, and how fast it's going there, against what it was
  const lateIn = (s, p, q) => (q - p) * slow * smootherArea(clamp((s - p) / (q - p)));
  const warp = s => {
    if (s <= tb) return s - lateIn(s, ta, tb);
    const atB = (tb - ta) * slow / 2;
    if (s <= tc) return s - atB - (s - tb) * slow;
    return s - atB - (tc - tb) * slow - (td - tc) * slow * (0.5 - smootherArea((td - s) / (td - tc)));
  };
  const rate = s => (s <= tb ? 1 - slow * smoother((s - ta) / (tb - ta)) : s <= tc ? 1 / by : 1 - slow * smoother((td - s) / (td - tc)));
  const knots = [];
  for (const k of was) if (k.t < ta - 1e-6) knots.push(k);
  const put = (s, w, r) => knots.push({ t: s, x: evalTrack(was, w), v: flowOf(was, w) * r });
  const steps = [[ta, tb, 3], [tb, tc, Math.max(1, Math.ceil(b - a))], [tc, td, 3]];
  for (const [p, q, m] of steps) for (let i = p === ta ? 0 : 1; i <= m; i++) { const s = p + (q - p) * i / m; put(s, warp(s), rate(s)); }
  let te = td;
  if (pay) {
    const L = fall / 0.2, stop = tau(G.t1 - (G.morph || 0));
    if (td + L > stop) return null;
    te = td + L;
    const back = u => fall * (0.5 - 0.5 * Math.cos(Math.PI * u)), m = 4;     // the cycles made up, u of the way along
    for (let i = 1; i <= m; i++) { const u = i / m, s = td + L * u; put(s, s - fall + back(u), 1 + (Math.PI / 2) * (fall / L) * Math.sin(Math.PI * u)); }
    for (const k of was) if (k.t > te + 1e-6) knots.push(k);
    return knots;
  }
  const behind = evalTrack(was, td) - evalTrack(was, td - fall);
  knots[knots.length - 1].v = flowOf(was, td);
  for (const k of was) if (k.t > td + 1e-6) knots.push({ ...k, x: k.x - behind });
  if (!was.some(k => k.t > td + 1e-6)) knots.push({ t: td + 1, x: evalTrack(was, td + 1) - behind, v: flowOf(was, td + 1) });
  return knots;
}
// The integral of smoother over 0..u, as a share of u = 1: how far a clock easing by smoother has fallen behind
const smootherArea = u => u * u * u * u * (u * (u - 3) + 2.5);

async function guardFilm(R, score, seen, ctx) {
  const { breathe, mayChangeFor, opening = 0 } = ctx, g = score.gestures, t0 = performance.now(), fixes = [], refused = score.refused ??= [], tau = score.tau ?? (t => t), isLoud = loudness(score), fps = seen.fps;
  const allowed = score.woah ? Math.min(Math.round(GUARD_LOOKS * seen.n / fps), GUARD_MOST) : Math.round(GUARD_LOOKS_ALL * seen.n / fps);      // ?woah=0 is the film as it was, with what it had to look with
  let looks = allowed, falseAlarms = 0, unlooked = false;
  const spent = n => { looks -= n; }, tried = [];
  const lands = opening || FLASH_ARRIVAL;
  const clock = { scan: 0, close: 0, scans: 0 };
  const scan = async ([a, b]) => {
    const was = performance.now(), eyes = Eyes.of(R, seen.W, seen.H, ctx.batch, ctx.task);
    for (let i = a; i < b; i++) {
      const f = await drawnSoon(R, score, i / fps, seen.W, seen.H, false, FILM_ONLY, waiter(ctx.task, ctx.breathe)), o = { from: f.from, G: f.G, kind: f.kind };
      if (eyes.read(p => seen.take(i, p, o, g))) await eyes.flush();
      await breathe();
    }
    await eyes.flush();
    clock.scan += performance.now() - was; clock.scans += b - a; spent((b - a) * SCAN_LOOK);
  };
  // What's really flashing in a range of frames, as they stand now: coarse first, and only what that flags close up. What's been looked at closely stays known until a change is kept.
  let known = new Map();
  const closely = async (a, b, remember) => {
    const key = `${a.toFixed(2)}:${b.toFixed(2)}`, had = remember ? known.get(key) : null;
    if (had) return had;
    const was = performance.now(), r = await lookClose(R, score, a, b, ctx, spent);
    clock.close += performance.now() - was;
    if (remember) known.set(key, r);
    return r;
  };
  const realIn = async ([a, b], remember = false) => {
    const out = { at: [], whole: 0 };
    for (const w of stretches(seen.over(a, b), fps)) {
      const r = await closely(w.a, Math.min(w.b, b / fps + 1), remember);
      out.at.push(...r.at); out.whole += r.whole;
      if (!r.at.length) falseAlarms++;
    }
    return out;
  };
  const worse = r => r.whole * 100 + r.at.length;     // the whole frame has no allowance, so clearing it is worth more than any tile
  const frames = (a, b) => [Math.max(0, Math.floor(a * fps)), Math.min(seen.n, Math.ceil(b * fps) + 1)];
  const say = (t, what, why) => refused.push({ t: +t.toFixed(2), what, why });

  const todo = [], swapped = new Set();
  // What might be the whole frame first, then the rest while there's anything left to look with: it's the whole frame that has no allowance
  const wholeFrames = []; seen.overIn(i => seen.mean[i], FLASH_WHOLE, FILM_SWING_WHOLE, wholeFrames);
  const flagged = stretches(seen.over(), fps).map(w => ({ ...w, wholeAt: wholeFrames.some(i => i / fps >= w.a && i / fps <= w.b) })).sort((x, y) => y.wholeAt - x.wholeAt || x.a - y.a);
  for (const w of flagged) {
    if (looks <= 0.25 * allowed && !w.wholeAt) { unlooked = true; break; }      // ...and some kept back to do something about what it finds
    const r = await lookClose(R, score, w.a, w.b, ctx, spent);
    if (r.at.length) todo.push({ ...w, ...r }); else falseAlarms++;
  }
  // The whole frame first: it's the one with no allowance at all
  todo.sort((x, y) => y.whole - x.whole || x.a - y.a);
  for (const spot of todo) {
    if (looks <= 0) { unlooked = true; break; }
    spot.reached = true;
    const tHit = spot.at[0], { k, kind } = spot.kinds[0], G = g[k], N = g[k + 1];
    if (!G || (opening && k > 1) || !mayChangeFor(G)()) continue;
    const what = `${G.pattern.id}${kind && N ? '>' + N.pattern.id : ''}`, loud = isLoud(tHit), first = Math.min(...spot.at) - 1, last = Math.max(...spot.at) + SLOW_AROUND;
    let still = spot.at.length;
    const around = frames(first - 2.6, last + 1);
    // A change: make it, look at the frames it touches, and keep it only if less is really flashing there. Otherwise undo it and put back what was seen. The flash itself is looked at first, so what doesn't help costs little.
    const change = async (range0, apply, undo, did, why) => {
      const range = [Math.min(range0[0], around[0]), Math.max(range0[1], around[1])];
      const before = worse(await realIn(range, true)), kept = seen.keep(range), near = [range[0], Math.min(range[1], around[1] + Math.ceil(2 * fps))];
      if (!before) { still = 0; return false; }
      apply(); forget(G); forget(g[k - 1]);
      await scan(near);
      let now = await realIn(near);
      if (worse(now) < before && near[1] < range[1]) { await scan([near[1], range[1]]); now = await realIn(range); }
      tried.push({ t: +tHit.toFixed(2), did, before, after: worse(now) });
      if (worse(now) < before) {
        known = new Map();
        still = now.at.filter(t => t >= first - 0.5 && t <= last + 0.5).length;
        fixes.push({ t: +tHit.toFixed(2), id: G.pattern.id, kind: kind ?? 'body', did });
        if (!still) spot.cleared = true;
        say(tHit, what, `flashed: ${why}`);
        return true;
      }
      undo(); forget(G); forget(g[k - 1]);
      seen.back(range, kept);
      return false;
    };
    // In a trick's slot it's the trick that's flashing, so another of the same weight goes there first, before anything that would slow it or calm it
    const slot = score.woah?.slots?.find(s => tHit >= s.from - 0.5 && tHit <= s.to + 0.5);
    if (slot && !swapped.has(slot) && !opening) {
      swapped.add(slot);
      const Wo = score.woah;
      let n = 0;
      for (const alt of Wo.altsFor(slot)) {
        if (!still || n >= SWAP_FILM || looks <= 0) break;
        const was = slot.id, u = Wo.swap(slot, alt);
        if (!u) continue;
        u(); n++;
        let undo = null;
        await change(frames(slot.from - 1, slot.to + 1), () => { undo = Wo.swap(slot, alt); }, () => { undo?.(); }, `${was} became ${alt}`, `${was} became ${alt}`);
      }
      if (!still) { spot.cleared = true; continue; }
    }
    // For those seconds only, the song lifts the sheet less
    const calmer = () => {
      if (G.calm != null && G.calm < 1) return false;      // 1 is a move saying the song carries on as it was
      const was = G.calm;
      return change(frames(first - 3.5, last + 3.5), () => { G.calm = FLASH_CALM; G.calmWin = [first - 1.5, last + 1.5]; }, () => { if (was == null) delete G.calm; else G.calm = was; delete G.calmWin; }, 'calmer', `the song's push at ${FLASH_CALM} from ${first.toFixed(1)} to ${last.toFixed(1)}`);
    };
    if (!kind) {
      // Its flow, there and only there. A pattern that breathes on the clock pays the time back afterwards if it has room, so it's at its whitest on the breath again, and one that remembers its clock when it lets go isn't touched.
      const hasHold = (G.moves ?? []).some(m => m.hold), pay = !!G.pattern.drive;
      const a = Math.max(first, G.t0 + SLOW_RAMP), b = Math.min(last, G.t1 - (G.morph || 0) - SLOW_RAMP), range = frames(a - SLOW_RAMP - 0.5, G.t1 + 0.5);
      const flow = async by => {
        if (hasHold || b <= a) return false;
        // Falling behind for the rest of the gesture can stir up the rest of it. Paying the time back can't, if there's room for it.
        for (const pays of pay ? [true, false] : [false, true]) {
          const T = slowedTrack(G, tau, a, b, by, pays), was = G.phiTrack;
          if (T && await change(range, () => { G.phiTrack = T; }, () => { G.phiTrack = was; }, `flow /${by} from ${a.toFixed(1)} to ${b.toFixed(1)}`, `flow at 1/${by} from ${a.toFixed(1)} to ${b.toFixed(1)}`)) return true;
        }
        return false;
      };
      const flowed = await flow(SLOW_LOUD);
      if (still) await calmer();
      if (still && !flowed && !loud) await flow(SLOW_QUIET);
    } else if (N) {
      // Frames through the landing: nothing past that has changed, unless a transformation's been taken away
      const across = extra => frames(G.t1 - G.morph * extra - 1, G.t1 + 1);
      // Some other way of crossing, before anything that takes something away
      if (!G.flashTurned && (kind === 'dive' || kind === 'rise') && !G.xform) {
        const rise = G.rise;
        await change(across(1), () => { G.flashTurned = true; G.rise = kind !== 'rise'; }, () => { G.rise = rise; delete G.flashTurned; }, `turned to ${kind !== 'rise' ? 'rise' : 'dive'}`, `flies the other way, as a ${kind !== 'rise' ? 'rise' : 'dive'}`);
      }
      if (still && (kind === 'slide' || kind === 'bend') && !G.noGlide && !G.xform) await change(across(1), () => { G.noGlide = true; }, () => { delete G.noGlide; }, 'no glide', 'a flight in place of a glide');
      // What's showing still flows for the start of a transformation, until it's come to rest. Close up, that can be most of the frame. For those seconds it flows slower: no landing's left for it to be late for.
      if (still && !(G.moves ?? []).some(m => m.hold)) {
        const from = G.t1 - G.morph, stop = Math.min(G.morph * 0.4, 3.5), a = Math.max(from - 0.2, G.t0 + SLOW_RAMP), b = from + stop / 2 + 0.3, was = G.phiTrack;
        for (const by of loud ? [SLOW_LOUD] : [SLOW_LOUD, SLOW_QUIET]) {
          if (!still || b <= a) break;
          const T = slowedTrack(G, tau, a, b, by, false);
          if (T) await change(frames(a - SLOW_RAMP - 0.5, G.t1 + 1), () => { G.phiTrack = T; }, () => { G.phiTrack = was; }, `flow /${by} into the morph`, `flow at 1/${by} from ${a.toFixed(1)} to ${b.toFixed(1)}, into its transformation`);
        }
      }
      if (still) await calmer();
      // Still on its hit, a little less steep. Then a little longer over it, and last of all at its own pace.
      const peak0 = G.peak;
      if (still && peak0?.q > 1) await change(across(1), () => { G.peak = { hit: peak0.hit, q: 1 }; }, () => { G.peak = peak0; }, 'softened to q 1', `crossing its hit at ${peak0.hit.toFixed(2)} less steeply`);
      if (still) {
        const m0 = G.morph, most = Math.min(FLASH_MORPH, 0.75 * (G.t1 - G.t0), G.t0 < lands ? G.t1 - lands : Infinity), longer = Math.min(m0 * LONGER_MOST, most);
        if (longer > m0 + 0.05) await change(across(LONGER_MOST), () => { G.morph = longer; }, () => { G.morph = m0; }, `morph ${m0.toFixed(1)} to ${longer.toFixed(1)}`, `${m0.toFixed(1)} s across becomes ${longer.toFixed(1)}`);
      }
      const p = G.peak;
      if (still && p?.q) await change(across(1), () => { G.peak = { hit: p.hit, q: 0 }; }, () => { G.peak = p; }, 'softened to q 0', `off its hit at ${p.hit.toFixed(2)}`);
      // A transformation only goes where it's quiet, or where the whole frame's flashing and nothing else cleared it: a whole-frame flash is the one thing with no allowance at all.
      if (still && G.xform && !G.xform.woah && (!loud || spot.whole)) {      // a trick isn't taken away here: it gets swapped for another (guardWoah)
        const was = { xform: G.xform, carry: N.carry }, end = frames(0, N.t1)[1];
        await change([across(1)[0], end], () => { delete G.xform; delete N.carry; }, () => { G.xform = was.xform; if (was.carry) N.carry = was.carry; }, `no ${was.xform.id}`, `no ${was.xform.id}`);
      }
    }
  }
  // What's left. Nothing's dulled to clear it, and it's said out loud. Once the looks have run out, what was found and not cleared is still left: it's what a trick's swap (guardWoah) works from, so saying nothing there would leave it all in.
  const left = [];
  let w0 = 0;
  const ws = stretches(seen.over(), fps);
  for (; w0 < ws.length; w0++) {
    const w = ws[w0];
    if (looks <= -0.2 * allowed) { unlooked = true; break; }
    const r = await closely(w.a, w.b, true);
    for (const t of r.at) left.push(+t.toFixed(1));
    if (r.at.length) say(r.at[0], g.find(G => G.t0 <= r.at[0] && r.at[0] < G.t1)?.pattern.id ?? '?', `flash left in${r.whole ? ', whole frame' : ''}: ${unlooked ? 'out of looks before getting to it, perhaps' : 'nothing cleared it without dulling the stretch'}`);
  }
  if (w0 < ws.length) {
    const from = ws[w0].a;
    for (const spot of todo) if (!spot.cleared && spot.b >= from) for (const t of spot.at) if (t >= from) left.push(+t.toFixed(1));
  }
  return { fixes, left: [...new Set(left)].sort((a, b) => a - b), seconds: +((performance.now() - t0) / 1000).toFixed(2), falseAlarms, looked: allowed - looks, allowed, tried, clock };
}

async function guardFlashes(R, score, seen, { W, H, px, breathe, mayChangeFor, opening = 0, task, aspect, batch }) {
  const g = score.gestures, t0 = performance.now(), fixes = [], stuck = new Set();
  const span = k => {    // the frames a change to gesture k can touch: from the morph into it to the end of the morph out of it
    const P = g[k - 1], from = P ? P.t1 - (P.morph || 0) : g[k].t0;
    return [Math.max(0, Math.floor((from - 2) * seen.fps)), Math.min(seen.n, Math.ceil((g[k].t1 + 2) * seen.fps) + 1)];
  };
  const colour = seen.world, lands = score.cut || colour ? 0 : opening || FLASH_ARRIVAL;     // when the flight in lands: what's showing then can't start transforming sooner. A hand cut and a world stay as they were.
  // A hand cut's guard acts only on what's really flashing, as the film's does. A world still goes by its own three channels.
  const closeCtx = { aspect, task, breathe, batch };
  const anyReal = async (frames, fps) => { for (const w of stretches(frames, fps)) if ((await lookClose(R, score, w.a, w.b, closeCtx)).at.length) return true; return false; };
  const realOnly = async frames => { if (colour) return frames; const fps = seen.fps, keep = []; for (const w of stretches(frames, fps)) if ((await lookClose(R, score, w.a, w.b, closeCtx)).at.length) keep.push(...frames.filter(i => i / fps >= w.a && i / fps <= w.b)); return keep; };
  // Many looks to one wait for the GPU (Eyes), not a wait a look: the same frames, read in the same order. A world reads its colour as it did.
  const frames = async (Wl, Hl, pl, a, b, at, take) => {
    if (colour) { for (let i = a; i < b; i++) { const f = shot(R, score, at(i), Wl, Hl, pl, colour); take(i, pl, f); await breathe(); } return; }
    const eyes = Eyes.of(R, Wl, Hl, batch, task);
    for (let i = a; i < b; i++) { const f = await drawnSoon(R, score, at(i), Wl, Hl, false, FILM_ONLY, waiter(task, breathe)), o = { from: f.from, G: f.G, kind: f.kind }; if (eyes.read(p => take(i, p, o))) await eyes.flush(); await breathe(); }
    await eyes.flush();
  };
  const look = ([a, b]) => frames(W, H, px, a, b, i => i / seen.fps, (i, p, f) => seen.take(i, p, f, g));
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
  for (let k = 0; k < g.length - 1 && !(opening && k > 1); k++) {
    const G = g[k];
    if (!G.morph || !mayChangeFor(G)()) continue;
    // Crossing at speed on a hit (land.js), bold shapes go by too quickly for that look to be sure of them: it looks twice as often, and twice as big.
    const close = G.peak?.q ? 2 : 1, fps = FLASH_MORPH_FPS * close, Wc = W * close, Hc = H * close, pc = close > 1 ? new Uint8Array(Wc * Hc * 4) : px;
    const watch = async () => {
      const a = G.t1 - G.morph, n = Math.ceil(G.morph * fps), s = new FlashSeen(n, Wc, Hc, fps, colour, !score.cut);
      await frames(Wc, Hc, pc, 0, n, i => a + i / fps, (i, p, f) => s.take(i, p, f, g));
      return s;
    };
    const s = await watch(), hits = s.over();
    let over = hits.length;
    if (!over || !(colour || await anyReal(hits.map(i => i + (G.t1 - G.morph) * fps), fps))) continue;
    const kind = s.kind[hits[0]] ?? 'dive', t = G.t1 - G.morph + hits[0] / fps;
    const tryIt = async (_, __, undo) => { const now = (await watch()).over().length; if (now < over) { over = now; return true; } undo(); return false; };
    let changed = false;
    for (let step = 0; step < 3 && over; step++) {
      const did = await easeMorph(G, g[k + 1], kind, { g, k, span, tryIt, score, lands });
      if (!did) break;
      changed = true; fixes.push({ t: +t.toFixed(2), id: G.pattern.id, kind, did });
    }
    if (changed) { const [a, b] = span(k), [, c] = g[k + 1] ? span(k + 1) : [a, b]; await look([a, Math.max(b, c)]); }
  }
  for (let round = 0; round < FLASH_ROUNDS; round++) {
    const over = await realOnly(seen.over());
    if (!over.length) break;
    const hit = new Map();
    for (const i of over) { const k = seen.who[i]; if (k < 0) continue; const key = `${k}:${seen.kind[i] ?? ''}`; hit.set(key, { k, kind: seen.kind[i], n: (hit.get(key)?.n ?? 0) + 1, t: i / seen.fps }); }
    let tried = 0;
    for (const { k, kind, t } of hit.values()) {
      const G = g[k], N = g[k + 1], key = `${k}:${kind ?? ''}`;
      if (stuck.has(key) || !G || !mayChangeFor(G)()) continue;
      const ctx = { g, k, span, tryIt, score, lands };
      // A morph that can't be helped may still be flashing because of what's going on in the start of it: the song first, since there its flow is already coming to rest. The film only: a hand cut and a world stay as they were.
      const again = await (kind ? easeMorph : easeBody)(G, N, kind, ctx) || (kind && !score.cut && !seen.world ? await calmer(G, ctx) || await slowerBody(G, ctx) : null);
      if (again) { tried++; fixes.push({ t: +t.toFixed(2), id: G.pattern.id, kind: kind ?? 'body', did: again }); }
      else stuck.add(key);
    }
    if (!tried) break;
  }
  const left = [...new Set((await realOnly(seen.over())).map(i => +(i / seen.fps).toFixed(1)))].sort((a, b) => a - b);
  return { fixes, left, seconds: +((performance.now() - t0) / 1000).toFixed(2) };
}
// What flows, slower. It's a gesture's own flow only, so its moves and its landings stay where they are.
async function easeBody(G, N, kind, ctx) {
  const did = await slowerBody(G, ctx);
  if (did) return did;
  // Going slower doesn't help, so what's left of it is the song lifting the whole sheet: on a few big shapes the phrase's breath and the strong beats can be most of a flash. This one breathes less.
  return calmer(G, ctx);
}
async function calmer(G, { k, span, tryIt }) {
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
async function easeMorph(G, N, kind, { g, k, span, tryIt, score, lands }) {
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
  // A world can say a transformation is what it is, and can't be taken away (motion.keep). What it has instead is what the transformation itself offers (xform.levers), and then taking longer. A lever: (G) => undo, or nothing if there's nothing to try.
  const W = score?.world, own = G.xform ?? W?._xform, kept = own && W?.motion?.keep?.includes(own.id);
  if (kept) {
    for (const [name, lever] of Object.entries(XFORMS[own.id]?.levers ?? {})) {
      if (G.leversTried?.has(name)) continue;
      (G.leversTried ??= new Set()).add(name);
      const undo = lever(G, N);
      if (!undo) continue;
      forget(G);
      if (await tryIt(k, wide, () => { undo(); forget(G); })) return name;
    }
  } else if (G.xform) {
    const was = { xform: G.xform, carry: N?.carry };
    delete G.xform; if (N) delete N.carry; forget(G);
    if (await tryIt(k, wide, () => { G.xform = was.xform; if (N && was.carry) N.carry = was.carry; forget(G); })) {
      score?.refused?.push({ t: +(G.peak?.hit ?? G.t1).toFixed(2), what: `${G.pattern.id}>${N?.pattern.id}`, why: `flashed: no ${was.xform.id}` });
      return `no ${was.xform.id}`;
    }
    return null;
  }
  if (!kept && (kind === 'slide' || kind === 'bend')) {
    G.noGlide = true; forget(G);
    if (await tryIt(k, wide, () => { delete G.noGlide; forget(G); })) return 'no glide';
    return null;
  }
  if (!G.flashTurned && !kept) {
    const was = G.rise;
    G.flashTurned = true; G.rise = kind !== 'rise'; forget(G);
    if (await tryIt(k, wide, () => { G.rise = was; forget(G); })) return `turned to ${G.rise ? 'rise' : 'dive'}`;
  }
  const most = Math.min(FLASH_MORPH, 0.75 * (G.t1 - G.t0), G.t0 < lands ? G.t1 - lands : Infinity);
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
