// Camouflage: you're in the film, but only while you move. This is the camera; src/score/time-sheet.js and src/gl/chunks/time.js are what it does to the picture.
//
// The webcam at 320 x 180, shrunk to 160 x 90 in grey. For its first two seconds it learns the empty room (it asks you to step out of shot), and after that it goes on learning,
// slowly, wherever nothing moves. Wherever the picture isn't the room is you: a mask with hysteresis, smoothed, rid of specks, and made into a distance field of your outline in frame
// units, with how much of you shows. Those two numbers a cell are all that reach the GPU (R.setCamo). Nothing leaves this machine, and nothing is kept.
// Inside your outline the sheet slides along itself, by up to half a step, and slides back. Back where it was, it's the sheet again, so a still frame is only ever plain op art:
//   no song      while some of a figure moves, all of it is there and the tear's held open; stop, and it closes within about half a second, with no seam
//   a song       all of you, slid half a step and back through each strong beat, from the film's own pulses (time-sheet.js): you appear on the 1 and the 3 and vanish in between
// Two people are two figures. A dark room lit by the screen: if the room can't be learned it compares each frame with the one before, so you show only where you're moving.
//
// The rehearsal that watches a film for flashes can't see a camera, so the limits are built in: any bit of you fades in and out over FADE, an outline that shows moves no faster than
// GROW frame units a second, and the slide never goes faster than SPEED steps a second or further than half a step.
//
//   toggle(app, { fake })   on, or off (it settles first). fake: a scripted silhouette in place of the camera, for tests: 'wave', 'two', 'still', 'dark'. Off, this file isn't even loaded and no camera is asked for.
//   app.camo                { on(), state, stats(), stop() } once it's been loaded
import { clamp, smoother } from '../score/curves.js';
import { TIME, FLIGHT } from '../gl/renderer.js';

export const W = 160, H = 90, N = W * H;
const CAM_W = 320, CAM_H = 180;
const LEARN = 2;                    // seconds of the empty room
const FADE = 0.4;                   // seconds for a bit of you to come all the way in, and to go: how much of the tear it shows
const W_MIN = 0.02;                 // less than this of it showing is none
const SMOOTH = 0.06;                // seconds the outline takes to follow the camera, which steadies it
const ACTIVE = 0.6, REACH = 3;      // with no song only a figure that's moving is you: a cell that moved, and REACH cells round it, counts as moving this long
const STIRS = 10;                   // how many of a figure's cells have to be moving for all of it to be
const HI = 0.12, LO = 0.07;         // how far from the room a cell has to be to come in, and to stay in (grey, 0..1)
const STILL_ROOM = 5, STILL_YOU = 24;     // seconds for the room to take up a change where nothing moves: where you aren't, and where you are. Stand still long enough and you're part of the room
const GROW = 1.6;                   // frame units a second the outline can move where any of the tear shows, either way
const FAR = 0.6;                    // the field's reach in frame units. Farther than this from you is just far
const SPEED = 0.9, ACC = 10;         // the slide: steps a second at most, and steps a second squared getting going or stopping
const OPEN = 0.33, CRAWL = 0.12;    // while you move the tear's held this far open, of a step, and the lines inside you crawl this far either way of it: up to half a step
const SPECK = 30;                   // a bit of you smaller than this many cells is the camera's noise, and so is a hole that small
const HOLD = 0.5;                   // comparing frames with the one before: how long a cell that moved stays you
const INF = 1e20;

let S = null;      // the one running, if any

export async function toggle(app, opts = {}) {
  if (S && !S.leaving) { leave(); return false; }
  if (S?.leaving) { S.leaving = false; say(app, 'camouflage stays on'); return true; }
  return start(app, opts);
}
export const isOn = () => !!S && !S.leaving;

async function start(app, { fake = null } = {}) {
  const s = S = fresh(app, fake);
  app.camo = api;
  if (!fake) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: CAM_W }, height: { ideal: CAM_H }, facingMode: 'user', frameRate: { ideal: 30 } }, audio: false });
      if (S !== s) { stream.getTracks().forEach(k => k.stop()); return false; }
      const v = s.video = document.createElement('video');
      v.muted = true; v.playsInline = true; v.srcObject = stream;
      s.stream = stream;
      await v.play();
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      s.cx2d = c.getContext('2d', { willReadFrequently: true });
    } catch (e) {
      console.warn('camouflage: no camera', e);
      say(app, 'camouflage needs the camera, and it isn\'t available', 2600);
      stop();
      return false;
    }
  }
  wantPrograms(app.R);
  app.onFrame.push(s.tick);
  say(app, fake ? 'camouflage, with a pretend camera' : 'camouflage: step out of shot for two seconds while it learns the room. nothing leaves this machine', 4200);
  dispatchEvent(new Event('trippee:camo'));
  return true;
}

function leave() { if (!S) return; S.leaving = true; dispatchEvent(new Event('trippee:camo')); }

function stop() {
  const s = S;
  if (!s) return;
  S = null;
  const app = s.app, i = app.onFrame.indexOf(s.tick);
  if (i >= 0) app.onFrame.splice(i, 1);
  s.stream?.getTracks().forEach(k => k.stop());
  if (s.video) s.video.srcObject = null;
  if (app.edits.camo === s.out) app.edits.camo = null;
  app.R.setCamo?.(null);
  dispatchEvent(new Event('trippee:camo'));
}

const say = (app, text, ms = 2400) => app.ui?.say?.(text, ms);

const api = {
  on: isOn,
  get state() { return S ? { mode: S.mode, learning: S.learning, leaving: S.leaving, armed: S.out.armed, area: +S.out.area.toFixed(4), slide: +S.D.toFixed(4), v: +S.v.toFixed(3), motion: +S.motion.toFixed(4), fake: S.fake?.name ?? null, t: +S.clock.toFixed(3) } : null; },
  stats() { if (!S) return null; const c = S.cost; return { frames: c.n, meanMs: +(c.sum / Math.max(c.n, 1)).toFixed(3), maxMs: +c.max.toFixed(3), camFrames: c.cam, camMeanMs: +(c.camSum / Math.max(c.cam, 1)).toFixed(3), camMaxMs: +c.camMax.toFixed(3) }; },
  resetStats() { if (S) S.cost = { n: 0, sum: 0, max: 0, cam: 0, camSum: 0, camMax: 0 }; },
  stop,
};

// The time programs, built before anything can slide: one arriving in the middle of a slide would pop the figure in. Asked for once for the film's renderer and once for each world's.
const asked = new WeakSet();
function wantPrograms(R) {
  const who = R.wp ?? R;
  if (asked.has(who)) return;
  asked.add(who);
  if (R.wp) R.wp.whenBuilt([TIME, FLIGHT | TIME]);
  else R.whenBuilt?.([TIME, FLIGHT | TIME]);
}
function programsReady(R) {
  const P = R.wp ? R.wp.progs : R.progs;
  return !!(P[TIME] && P[FLIGHT | TIME]);
}

function fresh(app, fake) {
  const s = {
    app, fake: fake ? { name: fake, s: 0, next: 0 } : null, video: null, stream: null, cx2d: null,
    learning: true, learnT: 0, learnN: 0, mode: 'room', wrongFor: 0, leaving: false, shown: false,
    g: new Float32Array(N), gb: new Float32Array(N), bg: new Float32Array(N), prev: new Float32Array(N), on: new Uint8Array(N), hist: new Float32Array(N),
    act: new Float32Array(N), mv: new Uint8Array(N), mv2: new Uint8Array(N), lab: new Int32Array(N), stack: new Int32Array(N), memb: new Int32Array(N), cnt: new Int32Array(N + 1), moving: false, crawl: 0,
    f: new Float32Array(N), tmp: new Float32Array(N), tmp2: new Float32Array(N), now: new Uint8Array(N), w: new Float32Array(N), wx: new Float32Array(N), wr: new Float32Array(N), pack: new Float32Array(2 * N), wasShown: false,
    sdT: new Float32Array(N).fill(FAR), sdS: new Float32Array(N).fill(FAR), sd: new Float32Array(N).fill(FAR),
    a: new Float64Array(N), b: new Float64Array(N), d1: new Float64Array(Math.max(W, H)), v1: new Int32Array(Math.max(W, H)), z1: new Float64Array(Math.max(W, H) + 1), f1: new Float64Array(Math.max(W, H)),
    hx: new Uint32Array(256),
    D: 0, v: 0, motion: 0, mlev: 0, clock: 0, lastNow: performance.now() / 1000, lastT: app.t, lastVideo: -1, camDt: 0,
    cost: { n: 0, sum: 0, max: 0, cam: 0, camSum: 0, camMax: 0 },
    out: { field: null, w: W, h: H, slide: 0, armed: false, shown: false, area: 0, cx: 0, cy: 0, would: 0, fam: -1, song: false },
  };
  s.out.field = s.pack;
  s.tick = () => tick(s);
  return s;
}

// ---------------------------------------------------------------- every frame
function tick(s) {
  const t0 = performance.now(), app = s.app, now = t0 / 1000;
  // Real seconds, or the stepped ones when a test steps the picture by hand: a pretend camera has to run on the clock the test is watching.
  const dt = app.manual ? clamp(app.t - s.lastT, 0, 0.25) : clamp(now - s.lastNow, 0, 0.1);
  s.lastNow = now; s.lastT = app.t;
  s.clock += dt;
  let cam = false;
  if (s.fake) {
    s.camDt += dt;
    if (s.clock >= s.fake.next - 1e-6) { const f0 = performance.now(); fakeGrey(s.fake.name, s.clock, s.g); s.fakeMs = performance.now() - f0; s.fake.next = s.clock + 1 / 30; cam = true; }
  } else if (s.video && s.video.readyState >= 2 && s.video.currentTime !== s.lastVideo) {
    s.lastVideo = s.video.currentTime;
    s.camDt += dt;
    const g0 = performance.now(); grab(s); s.grabMs = performance.now() - g0;
    cam = true;
  } else s.camDt += dt;
  if (cam) {
    const c0 = performance.now();
    see(s, Math.min(s.camDt, 0.25));
    s.camDt = 0;
    const ms = performance.now() - c0 + (s.grabMs ?? 0); s.cost.cam++; s.cost.camSum += ms; s.cost.camMax = Math.max(s.cost.camMax, ms);
  }
  follow(s, dt);
  slide(s, dt);
  const o = s.out;
  // Armed only once the time programs are there, and only between slides: a figure can't start halfway through one.
  if (!o.armed && programsReady(app.R) && Math.abs(o.would) < 1e-3) o.armed = true;
  if (!programsReady(app.R)) { o.armed = false; wantPrograms(app.R); }
  o.slide = s.D; o.shown = s.shown;
  app.edits.camo = o;
  app.R.setCamo?.(s.pack, W, H);
  // Off, once there's nothing left of you to see
  if (s.leaving && !s.shown && Math.abs(o.would) < 1e-3 && s.v === 0) stop();
  // What it costs the processor a frame: everything, the real camera's read included, but not a pretend camera drawing its pretend person
  const ms = performance.now() - t0 - (cam && s.fake ? s.fakeMs : 0); s.cost.n++; s.cost.sum += ms; s.cost.max = Math.max(s.cost.max, ms);
}

// The camera's frame, cropped to 16:9 and shrunk to 160 x 90, in grey.
function grab(s) {
  const v = s.video, vw = v.videoWidth || CAM_W, vh = v.videoHeight || CAM_H, k = Math.min(vw / 16, vh / 9), cw = 16 * k, ch = 9 * k;
  s.cx2d.drawImage(v, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, W, H);
  const d = s.cx2d.getImageData(0, 0, W, H).data, g = s.g;
  for (let i = 0; i < N; i++) g[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
}

// ---------------------------------------------------------------- what's you, once a camera frame
function see(s, dtc) {
  box3(s.g, s.gb, s.tmp);
  const g = s.gb, bg = s.bg, prev = s.prev;
  if (s.learning) {
    s.learnN++;
    const k = 1 / s.learnN;
    for (let i = 0; i < N; i++) bg[i] += (g[i] - bg[i]) * k;
    prev.set(g);
    s.learnT += dtc;
    if (s.learnT >= LEARN) {
      s.learning = false;
      let m = 0, q = 0; for (let i = 0; i < N; i++) { m += bg[i]; q += bg[i] * bg[i]; }
      m /= N; const sd = Math.sqrt(Math.max(0, q / N - m * m));
      // Too dark, or too flat to tell anyone from: compare frames with each other instead
      if (m < 0.1 || sd < 0.02) s.mode = 'diff';
      if (!s.fake) say(s.app, s.mode === 'diff' ? 'camouflage: a dark room. you show where you move' : 'camouflage: step in. you show only while you move', 3000);
    }
    return;
  }
  // How much a cell changes from one frame to the next when nothing's there: the camera's own noise, from the median. Moving is well over that.
  const hx = s.hx; hx.fill(0);
  for (let i = 0; i < N; i++) hx[Math.min(255, (Math.abs(g[i] - prev[i]) * 2560) | 0)]++;
  let acc = 0, med = 0; for (; med < 256; med++) { acc += hx[med]; if (acc >= N / 2) break; }
  const moveT = clamp(7 * (med + 0.5) / 2560, 0.016, 0.08);      // about 4.5 of the noise's own deviations: the noise alone hardly ever gets there
  // The screen lights the room, and a camera sets its own exposure: what isn't you gets brighter or darker all over by one factor.
  let sb = 0, sg = 0, nb = 0, big = 0;
  for (let i = 0; i < N; i++) { if (!s.on[i]) { sb += bg[i]; sg += g[i]; nb++; } if (Math.abs(g[i] - prev[i]) > moveT) big++; }
  const gain = nb > N * 0.2 && sg > 1e-3 ? clamp(sb / sg, 0.5, 2) : 1;
  const flood = big > 0.5 * N;      // the lights, or the exposure jumping: nothing is learned from that frame, and nothing changes
  // What's moving, and a little round it: a frame's difference only sees the edges of a moving arm, and the arm's between them. Only where a few cells moved together: one on its own is noise.
  const mv = s.mv, act = s.act, m2 = s.mv2;
  for (let i = 0; i < N; i++) m2[i] = !flood && Math.abs(g[i] - prev[i]) > moveT ? 1 : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; let n = 0;
    if (m2[i]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H) n += m2[Y * W + X]; }
    mv[i] = n >= 3 ? 1 : 0;
  }
  dilate(mv, m2, REACH);
  for (let i = 0; i < N; i++) act[i] = mv[i] ? 1 : Math.max(0, act[i] - dtc / ACTIVE);
  const sc = s.app.stage.score, song = !!sc.song && sc.react?.pulses?.length > 1;
  let moved = 0, cover = 0;
  for (let i = 0; i < N; i++) {
    const v = g[i] * gain, d = Math.abs(v - bg[i]), mo = Math.abs(g[i] - prev[i]), still = mo < moveT * 0.6;
    if (!flood) {
      if (s.mode === 'room') s.on[i] = s.on[i] ? (d > LO ? 1 : 0) : (d > HI ? 1 : 0);
      else { s.hist[i] = mo > moveT ? 1 : Math.max(0, s.hist[i] - dtc / HOLD); s.on[i] = s.hist[i] > 0 ? 1 : 0; }
      if (still) bg[i] += (v - bg[i]) * Math.min(1, dtc / (s.on[i] ? STILL_YOU : STILL_ROOM));
    }
    if (s.on[i]) { cover++; if (mv[i]) moved++; }
  }
  prev.set(g);
  // A room that's wrong (the camera moved, the lights changed for good) says most of the frame is you. After a while of that it compares frames instead.
  if (s.mode === 'room' && cover > 0.6 * N) s.wrongFor += dtc; else s.wrongFor = 0;
  if (s.wrongFor > 1.5) { s.mode = 'diff'; s.wrongFor = 0; s.on.fill(0); s.hist.fill(0); }
  s.motion = moved / N;
  // With a song all of you is there for the beats to slide. With none, a figure is there only while some of it's moving, and then all of it is: lift an arm and you're there, stand still and you're not.
  // Two people are two figures, each on its own.
  const lab = s.lab, cnt = s.cnt, f = s.f;
  if (!song) {
    const st = s.stack; let L = 0;
    lab.fill(0);
    for (let i0 = 0; i0 < N; i0++) {
      if (!s.on[i0] || lab[i0]) continue;
      L++; cnt[L] = 0; let top = 0; st[top++] = i0; lab[i0] = L;
      while (top) {
        const i = st[--top], x = i % W;
        if (act[i] > 0) cnt[L]++;
        if (x > 0 && s.on[i - 1] && !lab[i - 1]) { lab[i - 1] = L; st[top++] = i - 1; }
        if (x < W - 1 && s.on[i + 1] && !lab[i + 1]) { lab[i + 1] = L; st[top++] = i + 1; }
        if (i >= W && s.on[i - W] && !lab[i - W]) { lab[i - W] = L; st[top++] = i - W; }
        if (i < N - W && s.on[i + W] && !lab[i + W]) { lab[i + W] = L; st[top++] = i + W; }
      }
    }
  }
  for (let i = 0; i < N; i++) s.tmp2[i] = !s.leaving && s.on[i] && (song || cnt[lab[i]] >= STIRS) ? 1 : 0;
  // Smoothed, so the outline is a curve and not the camera's cells, and without its specks and small holes
  blur5(s.tmp2, f, s.tmp);
  const now = s.now;
  for (let i = 0; i < N; i++) now[i] = f[i] > 0.5 ? 1 : 0;
  specks(s, now, 1); specks(s, now, 0);
  shape(s);
}

// Where the tear can be: what's you now, and whatever of you hasn't faded yet. As a distance field, negative inside, in frame units, FAR at most: exact away from the outline (Felzenszwalb's),
// and read off the smooth mask close to it, so the outline is a curve.
function shape(s) {
  const f = s.f, a = s.a, b = s.b, m = s.mv, now = s.now, w = s.w, q = s.tmp2;
  // smoothed as well, or where you've just been is ragged: each cell fades on its own time
  for (let i = 0; i < N; i++) q[i] = now[i] ? 1 : clamp(w[i] / (2 * W_MIN));
  blur5(q, f, s.tmp);
  for (let i = 0; i < N; i++) m[i] = f[i] > 0.5 || now[i] ? 1 : 0;
  specks(s, m, 1); specks(s, m, 0);
  let area = 0, sx = 0, sy = 0, any = 0;
  for (let i = 0; i < N; i++) { const inside = m[i] === 1; a[i] = inside ? 0 : INF; b[i] = inside ? INF : 0; if (inside) any++; if (now[i]) { area++; sx += i % W; sy += (i / W) | 0; } }
  const R = s.app.R, aspect = R.canvas ? R.canvas.width / R.canvas.height : 16 / 9, hc = Math.max(1, aspect / (W / H)), cs = 2 * hc / H;      // a cell's size in frame units: the camera's picture covers the frame
  const sdT = s.sdT;
  s.out.area = area / N;
  if (!any) { sdT.fill(FAR); return; }
  edt(s, a); edt(s, b);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, inside = m[i] === 1;
    let d = inside ? -(Math.sqrt(b[i]) - 0.5) : Math.sqrt(a[i]) - 0.5;
    if (Math.abs(d) < 2.5 && (f[i] > 0.5) === inside) {
      const gx = (f[y * W + Math.min(W - 1, x + 1)] - f[y * W + Math.max(0, x - 1)]) / 2, gy = (f[Math.min(H - 1, y + 1) * W + x] - f[Math.max(0, y - 1) * W + x]) / 2;
      const near = (0.5 - f[i]) / Math.max(Math.hypot(gx, gy), 0.08), k = clamp(2.5 - Math.abs(d));
      d = d + (clamp(near, -2.5, 2.5) - d) * k;
    }
    sdT[i] = clamp(d * cs, -FAR, FAR);
  }
  // Where you are, in frame units, the way the picture shows you: a mirror
  if (area) { s.out.cx = -((sx / area + 0.5) / W * 2 - 1) * hc * (W / H); s.out.cy = (1 - (sy / area + 0.5) / H * 2) * hc; }
}

// Bits of m that are `val` and smaller than SPECK cells become the other: specks of you go, and so do holes in you (a hole that touches the frame's edge is the room, and stays).
function specks(s, m, val) {
  const lab = s.lab, st = s.stack, members = s.memb;
  lab.fill(0);
  for (let i0 = 0; i0 < N; i0++) {
    if (m[i0] !== val || lab[i0]) continue;
    let n = 0, top = 0, edge = false; st[top++] = i0; lab[i0] = 1;
    while (top) {
      const i = st[--top], x = i % W, y = (i / W) | 0; members[n++] = i;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;
      if (x > 0 && m[i - 1] === val && !lab[i - 1]) { lab[i - 1] = 1; st[top++] = i - 1; }
      if (x < W - 1 && m[i + 1] === val && !lab[i + 1]) { lab[i + 1] = 1; st[top++] = i + 1; }
      if (y > 0 && m[i - W] === val && !lab[i - W]) { lab[i - W] = 1; st[top++] = i - W; }
      if (y < H - 1 && m[i + W] === val && !lab[i + W]) { lab[i + W] = 1; st[top++] = i + W; }
    }
    if (n <= SPECK && !(val === 0 && edge)) for (let k = 0; k < n; k++) m[members[k]] = 1 - val;
  }
}
// m, spread by r cells each way (a square), with tmp to work in.
function dilate(m, tmp, r) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let k = Math.max(0, x - r); k <= Math.min(W - 1, x + r) && !v; k++) v = m[y * W + k]; tmp[y * W + x] = v; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let k = Math.max(0, y - r); k <= Math.min(H - 1, y + r) && !v; k++) v = tmp[k * W + x]; m[y * W + x] = v; }
}

// Squared distance to the nearest cell that's 0, in place, in cells. Rows, then columns.
function edt(s, g) {
  const f = s.f1, d = s.d1;
  for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) f[x] = g[y * W + x]; edt1(s, W); for (let x = 0; x < W; x++) g[y * W + x] = d[x]; }
  for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) f[y] = g[y * W + x]; edt1(s, H); for (let y = 0; y < H; y++) g[y * W + x] = d[y]; }
}
function edt1(s, n) {
  const f = s.f1, d = s.d1, v = s.v1, z = s.z1;
  let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let r = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (r <= z[k]) { k--; r = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = r; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}

function box3(src, dst, tmp) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; tmp[i] = (src[y * W + Math.max(0, x - 1)] + src[i] + src[y * W + Math.min(W - 1, x + 1)]) / 3; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) dst[y * W + x] = (tmp[Math.max(0, y - 1) * W + x] + tmp[y * W + x] + tmp[Math.min(H - 1, y + 1) * W + x]) / 3;
}
function blur5(src, dst, tmp) {
  const k = (a, b, c, d, e) => (a + 4 * b + 6 * c + 4 * d + e) / 16;
  for (let y = 0; y < H; y++) { const r = y * W; for (let x = 0; x < W; x++) tmp[r + x] = k(src[r + Math.max(0, x - 2)], src[r + Math.max(0, x - 1)], src[r + x], src[r + Math.min(W - 1, x + 1)], src[r + Math.min(W - 1, x + 2)]); }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) dst[y * W + x] = k(tmp[Math.max(0, y - 2) * W + x], tmp[Math.max(0, y - 1) * W + x], tmp[y * W + x], tmp[Math.min(H - 1, y + 1) * W + x], tmp[Math.min(H - 1, y + 2) * W + x]);
}

// ---------------------------------------------------------------- what's shown, every frame
// Each bit of you fades in and out over FADE: how much of the tear it shows. Where it shows anything the outline moves no faster than GROW; where it shows nothing, the outline can be anywhere.
// Up to the GPU as two numbers a cell: the distance to the outline, and how much shows, carried a couple of cells out past the outline so it's still all there at the edge.
function follow(s, dt) {
  const w = s.w, now = s.now, x = s.wx, r = s.wr, sd = s.sd, sdS = s.sdS, sdT = s.sdT, P = s.pack, k = dt / FADE, step = GROW * dt, sm = 1 - Math.exp(-dt / SMOOTH);
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let i = 0; i < N; i++) {
    const v = w[i] = clamp(w[i] + (now[i] ? k : -k));
    if (v > 0) { const X = i % W, Y = (i / W) | 0; if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; }
  }
  s.shown = x1 >= 0;
  // out past the edge: cells where none of you is take the most of their neighbours', two cells each way. Only round where you are.
  if (s.shown || s.wasShown) {
    x.fill(0);
    if (s.shown) {
      x0 = Math.max(0, x0 - 2); x1 = Math.min(W - 1, x1 + 2); y0 = Math.max(0, y0 - 2); y1 = Math.min(H - 1, y1 + 2);
      for (let y = y0; y <= y1; y++) for (let X = x0; X <= x1; X++) { let v = 0; for (let d = Math.max(0, X - 2); d <= Math.min(W - 1, X + 2); d++) if (w[y * W + d] > v) v = w[y * W + d]; r[y * W + X] = v; }
      for (let y = y0; y <= y1; y++) for (let X = x0; X <= x1; X++) { const i = y * W + X; if (w[i] > W_MIN) { x[i] = w[i]; continue; } let v = 0; for (let d = Math.max(0, y - 2); d <= Math.min(H - 1, y + 2); d++) if (r[d * W + X] > v) v = r[d * W + X]; x[i] = v; }
    }
  }
  s.wasShown = s.shown;
  for (let i = 0; i < N; i++) {
    sdS[i] += (sdT[i] - sdS[i]) * sm;
    sd[i] = x[i] < 0.02 ? sdS[i] : sd[i] + clamp(sdS[i] - sd[i], -step, step);
    P[2 * i] = sd[i]; P[2 * i + 1] = x[i];
  }
}

// ---------------------------------------------------------------- the slide, with no song
// You start moving, and the sheet inside you slides, up to half a step: the tear's open, and held open while you move, with the lines inside you crawling to and fro. You stop, and
// it slides back to where it was, and you're gone. Never faster than SPEED, and never more than half a step, so how much of it shows can fade without a jump. With a song,
// time-sheet.js slides you on the beats instead, and this only comes to rest.
function slide(s, dt) {
  const sc = s.app.stage.score, song = !!sc.song && sc.react?.pulses?.length > 1;
  const m = s.leaving || song ? 0 : s.motion;
  s.mlev += (m - s.mlev) * (1 - Math.exp(-dt / (m > s.mlev ? 0.04 : 0.025)));
  s.moving = s.moving ? s.mlev > 0.0008 : s.mlev > 0.002;
  let to = 0;
  if (s.moving) { s.crawl += dt * 0.45 * smoother(s.mlev / 0.02); to = OPEN - CRAWL * Math.cos(2 * Math.PI * s.crawl); }
  else if (!s.D && !s.v) return;
  const left = to - s.D, vt = Math.sign(left) * Math.min(SPEED, Math.sqrt(2 * ACC * Math.abs(left)));
  s.v = clamp(s.v + clamp(vt - s.v, -1.5 * ACC * dt, 1.5 * ACC * dt), -SPEED, SPEED);
  s.D = clamp(s.D + s.v * dt, 0, 0.5);
  if (!s.moving && (s.D <= 1e-3 || Math.sign(-s.D) !== Math.sign(left))) { s.D = 0; s.v = 0; }       // it lands where it was, never past it
}

// ---------------------------------------------------------------- a pretend camera, for tests
// A person in a room, in the camera's own units (x across -16/9..16/9, y up -1..1), drawn soft-edged with a little noise, so the whole of the above runs on it. Pure in s, seconds since it started.
const FAKE_PERSON = 0.28, FAKE_ROOM = 0.62;
function person(x0, s, { wave = 0, walk = 0, lift = 0 } = {}) {
  const C = [];
  const cap = (ax, ay, bx, by, r) => C.push([ax, ay, bx, by, r]);
  const sw = walk ? 0.12 * Math.sin(2 * Math.PI * 1.6 * s) : 0;
  cap(x0, 0.62, x0, 0.62, 0.13);                               // the head
  cap(x0, 0.42, x0, -0.12, 0.19);                              // the body
  cap(x0 - 0.07, -0.2, x0 + 0.07, -0.2, 0.16);                 // the hips
  cap(x0 - 0.09, -0.25, x0 - 0.1 + sw, -0.95, 0.075); cap(x0 + 0.09, -0.25, x0 + 0.1 - sw, -0.95, 0.075);     // the legs
  cap(x0 - 0.23, 0.32, x0 - 0.3 - sw * 0.5, -0.22, 0.062);     // one arm hangs
  // the other waves: up from the shoulder, the forearm swinging over the head
  if (wave || lift) {
    const ex = x0 + 0.42, ey = 0.38 + 0.12 * lift, a = Math.PI / 2 + (wave ? 0.55 * Math.sin(2 * Math.PI * 2.5 * s) : 0);
    cap(x0 + 0.23, 0.32, ex, ey, 0.062); cap(ex, ey, ex + 0.32 * Math.cos(a), ey + 0.32 * Math.sin(a), 0.058);
  } else cap(x0 + 0.23, 0.32, x0 + 0.3 + sw * 0.5, -0.22, 0.062);
  return C;
}
// The scripts. wave: learns the room (to 2.5 s), walks in (to 4), waves an arm fast (to 8), stands still (to 12), walks off (to 15). two: two people, one of them waving. still: walks in and stands. dark: wave, in a dark room.
export const FAKE_TIMES = { wave: { still: 8, off: 12, gone: 15 }, dark: { still: 8, off: 12, gone: 15 } };
function fakeScene(name, s) {
  const walkIn = x => x + (1.6 - x) * (1 - smoother((s - 2.5) / 1.5)), off = x => x - 2.6 * smoother((s - 12) / 3);
  if (s < 2.5) return [];
  if (name === 'two') return [...person(walkIn(-0.75), s, { wave: s > 4 && s < 8 ? 1 : 0, walk: s < 4 }), ...person(walkIn(0.8), s, { walk: s < 4, lift: smoother((s - 5) / 2) })];
  if (name === 'still') return person(walkIn(0), s, { walk: s < 4 });
  const x = off(walkIn(0));
  return person(x, s, { wave: s > 4 && s < 8 ? 1 : 0, walk: s < 4 || (s > 12 && s < 15) });
}
function fakeGrey(name, s, g) {
  const C = fakeScene(name, s), dark = name === 'dark', frame = Math.round(s * 30);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = ((i + 0.5) / W * 2 - 1) * (W / H), y = 1 - (j + 0.5) / H * 2;
    // the room: a wall, a darker band of furniture, a doorway
    let v = FAKE_ROOM + 0.08 * y + (y < -0.45 ? -0.18 : 0) + (x > 1.05 && x < 1.45 && y > -0.6 ? -0.22 : 0);
    let d = 1e3;
    for (const [ax, ay, bx, by, r] of C) {
      const px = x - ax, py = y - ay, qx = bx - ax, qy = by - ay, h = clamp((px * qx + py * qy) / Math.max(qx * qx + qy * qy, 1e-9));
      d = Math.min(d, Math.hypot(px - qx * h, py - qy * h) - r);
    }
    const cover = clamp(0.5 - d / (2 / H));
    v += ((y < -0.22 ? 0.12 : FAKE_PERSON) - v) * cover;      // dark trousers
    if (dark) v = 0.03 + 0.06 * v;
    // the camera's noise: a hash of the cell and the frame
    let h = (i * 374761393 + j * 668265263 + frame * 2246822519) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    g[j * W + i] = clamp(v + ((h & 1023) / 1023 - 0.5) * (dark ? 0.012 : 0.03));
  }
}
