// What a world is to the renderer and the stage: its programs, its second block of numbers and ink table, and how the picture gets from one world to another. See docs/MODES.md, section 4.
// None of this is loaded until someone asks for a world. With none chosen, the film runs exactly as if this file weren't here.
import { sourceOf, PLATES, FLIGHT, EXTRA, FOLD, TIME } from '../gl/renderer.js';
import helpers, { MACROS } from '../gl/chunks/world.js';
import { Trace } from '../gl/trace.js';
import { OFF, FRAME, FAMILIES } from '../pattern/layout.js';
import { byId } from '../pattern/library.js';
import { clamp, smoother } from '../score/curves.js';
import { handoverOn } from '../score/morphclock.js';
import { base } from '../score/slot.js';
import { wearWorlds } from '../score/frame.js';
import { reactAt } from '../score/react.js';
import { XFORMS } from '../score/xform/index.js';
import { load } from './index.js';

const HOOKS = { field: 'WORLD_FIELD', surface: 'WORLD_SURFACE', phase: 'WORLD_PHASE', warp: 'WORLD_WARP', preInk: 'WORLD_PREINK', T: 'WORLD_T' };
const FILM_COLOR = 'vec3 worldColor(int k0,int k1,float c){ return film(c); }\n';
const COVER = 16;       // a program bit of its own: the sound's coverage draw
const FULL = 32;        // and another: a world's own code that most of its patterns never draw, in #ifdef WORLD_FULL. A program pays for its peak on every pixel, whichever way a pixel goes, so that code costs what isn't using it unless it's elsewhere. W.fuller(slot) says who needs it.
const CHANGE_S = 13;    // seconds, a change of world. A flight over bold shapes in less reads up to 5 flashes a second on a tile, and at this length 1 to 3. Nothing shorter gets near a world's limit, and longer didn't get to it either (16 reads 1 to 3).
const STAGGER = 0.6;    // how wide one band's share of a change is, against the whole half. Over half of 13 seconds, about two

// ---------------------------------------------------------------- the world's own source
export function worldSource(W, v) {
  const g = W.glsl ?? {};
  let defs = '#define WORLD\n';
  for (const k in HOOKS) if (g[k]) defs += `#define ${HOOKS[k]}\n`;
  const all = Object.values(g).join('\n');
  if (/\bgX\b/.test(all)) defs += '#define WORLD_X\n';
  if (/\bgGen\b/.test(all)) defs += '#define WORLD_GEN\n';
  if (/\bgWall\b/.test(all)) defs += '#define WORLD_WALL\n';
  if (v & FLIGHT || /\b(lineRows|lineCells)\b/.test(all)) defs += '#define WORLD_CELLS\n';
  if (W.hear?.threshold != null) defs += '#define WORLD_SHARE\n';
  if (W.motion?.front) defs += '#define WORLD_FRONT\n';       // a straight front (xfU mode 3), for a world that says it has one
  if (v & COVER) defs += '#define WORLD_COVER\n';
  if (v & FULL) defs += '#define WORLD_FULL\n';
  let s = sourceOf(v & ~(COVER | FULL)).replace('\n', () => `\n${defs}`);
  const put = (mark, text) => { s = s.replace(`//@world:${mark}\n`, () => `${text ?? ''}\n`); };
  put('defs', MACROS + (g.defs ?? '')); put('field', g.field); put('surface', g.surface); put('phase', g.phase);
  put('helpers', helpers + (g.warp ?? '') + (g.preInk ?? '') + (g.T ?? '') + (g.color ?? FILM_COLOR));
  return s;
}

// ---------------------------------------------------------------- the ink table: uWT, RGBA16F, 256 wide. Each world's own.
class Table {
  constructor(gl, h = 1) {
    this.gl = gl; this.w = 256; this.h = h;
    this.data = new Float32Array(this.w * h * 4);
    this.tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this.w, h, 0, gl.RGBA, gl.FLOAT, this.data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);
  }
  set(x, y, r, g, b, a = 1) { const i = (y * this.w + x) * 4, d = this.data; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a; }
  upload() {
    const gl = this.gl;
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.w, this.h, gl.RGBA, gl.FLOAT, this.data);
  }
}

// A small RGBA8 target of the renderer's: the coverage draw's, and what a program warms on as well as the canvas.
const COVER_W = 320, COVER_H = 180;
function coverTarget(R) {
  if (R.covT) return R.covT;
  const gl = R.gl, rb = gl.createRenderbuffer(), fbo = gl.createFramebuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, COVER_W, COVER_H);
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return R.covT = { rb, fbo };
}

// ---------------------------------------------------------------- one world's programs, on one renderer
let worldsSeen = 0;
class WorldPrograms {
  constructor(R, W) {
    this.R = R; this.W = W; this.gl = R.gl;
    this.base = 64 * ++worldsSeen;     // R.variant: each has its own number, so its own governor tier. A world only slows itself.
    this.progs = {};
    this.block = new Float32Array(256);
    this.U = { e: this.block.subarray(0, 16), a: this.block.subarray(16, 136), b: this.block.subarray(136, 256), all: this.block };
    this.U.e[1] = 1; this.U.e[12] = 1; this.U.e[14] = 1;
    this.building = {};
    const gl = this.gl;
    if (!R.wubo) {
      R.wubo = gl.createBuffer();
      gl.bindBuffer(gl.UNIFORM_BUFFER, R.wubo);
      gl.bufferData(gl.UNIFORM_BUFFER, this.block.byteLength, gl.DYNAMIC_DRAW);
      gl.bindBufferBase(gl.UNIFORM_BUFFER, 1, R.wubo);
    }
    this.table = new Table(gl, W.table?.h ?? 1);
    this.trace = W.pass ? new Trace(R) : null;
    this.order = R.order.filter(v => !(v & (PLATES | FOLD)));      // a fold's programs only when someone wears one (program, below)
    if (W.fuller) this.order = [0, FLIGHT, FULL, FULL | FLIGHT, ...this.order.slice(2), ...this.order.slice(2).map(v => v | FULL)];
    this.ready = false; this.failed = null;
    this.whenReady = new Promise(res => { this._ready = res; });
    this.whenAll = new Promise(res => { this._all = res; });
    this.warmed = new Set();
    this.times = [];
    this._next();
  }

  // One at a time, behind the picture: plain, flight, then the rest.
  _next() {
    const v = this.order.find(n => !this.progs[n]);
    if (v === undefined) { this._all(this); return; }
    this._build(v, () => {
      if (v === (this.W.fuller && this.R.parallel ? FULL | FLIGHT : FLIGHT)) { this.ready = true; this._ready(this); }
      if (this.R.parallel || v === 0) this._next(); else this._all(this);
    });
  }

  _build(v, done) {
    const gl = this.gl, R = this.R, t0 = performance.now(), src = worldSource(this.W, v);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, src);
    gl.compileShader(fs);
    const prog = gl.createProgram();
    gl.attachShader(prog, R.vs); gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    const kicked = performance.now() - t0;
    const poll = () => {
      if (R.parallel && !gl.getProgramParameter(prog, R.parallel.COMPLETION_STATUS_KHR)) { setTimeout(poll, 16); return; }
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        const log = gl.getShaderInfoLog(fs) || '', where = /ERROR: \d+:(\d+)/.exec(log);
        this.failed = `${log} ${where ? `line: ${src.split('\n')[+where[1] - 1]}` : ''} ${gl.getProgramInfoLog(prog)}`;
        console.error(`world ${this.W.id} failed to build:`, this.failed);
        this._ready(this); this._all(this);
        return;
      }
      gl.uniformBlockBinding(prog, gl.getUniformBlockIndex(prog, 'Block'), 0);
      const wb = gl.getUniformBlockIndex(prog, 'WBlock');
      if (wb !== gl.INVALID_INDEX) gl.uniformBlockBinding(prog, wb, 1);
      gl.useProgram(prog);
      gl.uniform1i(gl.getUniformLocation(prog, 'uPush'), 0);
      gl.uniform1i(gl.getUniformLocation(prog, 'uWT'), 1);
      gl.uniform1i(gl.getUniformLocation(prog, 'uTrace'), 2);
      this.progs[v] = prog;
      this.times.push({ v, kicked: +kicked.toFixed(1), ms: +(performance.now() - t0).toFixed(0) });
      done();
    };
    poll();
  }

  // Linking takes nothing from the picture (tests/worlds.mjs measured no rAF gap at all), but the GPU process builds a program's pipeline at its first draw, and that stops everything for 200 to 500 ms, a film's programs just the same.
  // So the ones a change is about to need go through one scissored pixel on the real framebuffer, all in one frame, right after the click, and not in the middle of the flight or on the landing. The frame's own draw covers the pixel.
  warm() {
    const R = this.R, gl = this.gl;
    // Plain and flight always. The fuller two if the world's own patterns wear something only they have.
    const fuller = (this.W._pool ?? []).some(p => { const S = base(p); return R._extra(S); });
    const list = [0, FLIGHT, ...(fuller ? [EXTRA, EXTRA | FLIGHT] : []), ...(this.W.fuller ? [FULL, FULL | FLIGHT] : [])].filter(v => this.progs[v] && !this.warmed.has(v));
    if (!list.length) return Promise.resolve();
    return new Promise(res => {
      const before = R.warm;
      R.warm = () => {
        if (before) before();
        const small = coverTarget(R);
        gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, 1, 1);
        gl.bindBuffer(gl.UNIFORM_BUFFER, R.ubo);
        gl.bufferSubData(gl.UNIFORM_BUFFER, 0, R.block);
        this.upload();
        // To the canvas and to a target like the governor's smaller one, which the GPU may build separately.
        for (const v of list) {
          gl.useProgram(this.progs[v]);
          gl.bindFramebuffer(gl.FRAMEBUFFER, small.fbo); gl.viewport(0, 0, COVER_W, COVER_H); gl.drawArrays(gl.TRIANGLES, 0, 3);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, R.canvas.width, R.canvas.height); gl.drawArrays(gl.TRIANGLES, 0, 3);
          this.warmed.add(v);
        }
        gl.disable(gl.SCISSOR_TEST);
        R.warm = null;
        res();
      };
    });
  }

  // What a frame needs: what the film would, without colour's plates, and whatever the world says only its fuller programs have (W.fuller).
  variantOf(F) {
    const R = this.R, f = this.W.fuller;
    return (R._variantOf(F) & ~PLATES) | (f && (f(R.slotA) || f(R.slotB)) ? FULL : 0);
  }

  // The smallest program with what this frame needs. Never colour's plates: a world has its own colour.
  program(F) {
    const R = this.R; let v = this.variantOf(F);
    if (R.timeOn) { if (this.progs[v | TIME]) v |= TIME; else if (!this.building[v | TIME]) { this.building[v | TIME] = true; this._build(v | TIME, () => {}); } }      // src/gl/chunks/time.js: built the first time a frame here asks. Until it's up the frame goes without
    if (!this.progs[v] && !R.parallel) { this.order = [v, ...this.order.filter(n => n !== v)]; this._next(); }
    if (v & FOLD && !this.progs[v] && !this.building[v]) { this.building[v] = true; this._build(v, () => {}); }
    const got = this.progs[v] ? v : this.progs[v & (FLIGHT | EXTRA | FULL)] ? v & (FLIGHT | EXTRA | FULL) : this.progs[v & (FLIGHT | FULL)] ? v & (FLIGHT | FULL) : v & FLIGHT;
    R.variant = this.base + got;
    return this.progs[got];
  }

  upload() {
    const gl = this.gl, R = this.R;
    gl.bindBuffer(gl.UNIFORM_BUFFER, R.wubo);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, this.block);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.table.tex);
    if (this.tableDirty) { this.table.upload(); this.tableDirty = false; }
    gl.activeTexture(gl.TEXTURE0);
    if (this.trace) this.trace.bind();
  }

  // The planner's look: a slot on its own, in this world's fields, as coverage.
  forProbe() {
    const R = this.R, v = this.variantOf(R.frame);
    this.block[0] = 1; this.upload(); this.block[0] = 0;
    return this.progs[v] ?? this.progs[v & (FLIGHT | EXTRA | FULL)] ?? this.progs[v & FULL] ?? this.progs[0];
  }

  // The frame just drawn, again, small and as coverage, into fbo: what the sound reads. Everything that reads the picture reads it black and white, whatever it's wearing.
  // The film's picture reaches the sound by a blit down that takes two pixels each way out of many, so a line's edge stays an edge, and those average to plain coverage. A plain small draw would filter them to grey.
  // So the sound has programs of its own, without colour, that filter as sharply as that. Only someone playing the picture in a world ever builds one: scaling every line's gradient in the programs that draw the picture cost them 7 to 16% on the fuller ones.
  // Until one's built it reads the world's own program, which is close (tests/worlds.mjs has how close).
  coverProgram(v) {
    const cv = v | COVER;
    if (this.progs[cv]) return Promise.resolve(this.progs[cv]);
    return this.building[cv] ??= new Promise(res => this._build(cv, () => res(this.progs[cv])));
  }

  coverage(fbo, w, h) {
    const R = this.R, gl = this.gl, F = R.frame, res = FRAME.res * 4, saved = [F[res], F[res + 1], F[res + 2]], full = F[res];
    F[res] = w; F[res + 1] = h; F[res + 2] = w / h;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, w, h);
    const v = this.variantOf(F);
    this.coverProgram(v);
    // The sound's programs for what this world might do next as well, while nothing's happening. The GPU builds a pipeline at its first draw and stops everything to do it: that's a hitch when the music starts, and not on the first frame of a click's flight.
    const next = this.W.fuller ? [0, FLIGHT, FULL, FULL | FLIGHT] : [v & ~FLIGHT, v | FLIGHT];
    for (const n of next) this.coverProgram(n);
    this.block[0] = 1; this.block[4] = Math.min(1, 2 * w / full); this.upload(); this.block[0] = 0;
    gl.bindBuffer(gl.UNIFORM_BUFFER, R.ubo);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, R.block);
    for (const n of next) {
      const cv = n | COVER;
      if (!this.progs[cv] || this.warmed.has(cv)) continue;
      gl.useProgram(this.progs[cv]);
      gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, 1, 1); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.disable(gl.SCISSOR_TEST);
      this.warmed.add(cv);
    }
    gl.useProgram(this.progs[v | COVER] ?? this.program(F));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    F[res] = saved[0]; F[res + 1] = saved[1]; F[res + 2] = saved[2];
  }
}

// The way in for a renderer. A rehearsal's own Renderer comes through here too. Resolves when plain and flight are built.
export function prepare(R, W) {
  const all = R.worldPrograms ??= new Map();
  let wp = all.get(W);
  if (!wp) { wp = new WorldPrograms(R, adopt(W)); all.set(W, wp); }
  return wp.whenReady;
}

// A world's patterns are its own, and never in the library: the film's draws must not change. What it borrows it takes by id. A world's own transformations go where the planner can find them.
export function adopt(W) {
  if (W._adopted) return W;
  W._adopted = true;
  const borrowed = (W.borrow ?? []).map(id => byId[id]).filter(Boolean);
  W._pool = [...(W.pool ?? []), ...borrowed];
  for (const x of Object.values(W.motion?.xforms ?? {})) XFORMS[x.id] = x;
  W._xform = W.motion?.xform ? { id: W.motion.xform } : null;      // what a gesture with no transformation of its own goes by
  const ink = W.ink;
  if (ink) {
    ink.weights ??= [1, 2, 3, 5];
    // Whole-number counts: a family carrying numbers round a wrap or a pole has to come back to its own row, or the cut shows.
    for (const p of W._pool) for (const i of ink.fams) {
      const t = p.g?.fams?.[i]?.t1 ?? 0;
      if (t && t % ink.R) console.warn(`world ${W.id}: ${p.id} winds family ${i} ${t} times, and ${ink.R} rows doesn't divide that: the atan cut will show`);
    }
  }
  return W;
}

export const loadWorld = async id => { const W = await load(id); return W ? adopt(W) : null; };

// ---------------------------------------------------------------- what a frame writes, after the transformation has
const FOREIGN_KIND = 3.5, FOREIGN_SURF = 2.5;
function quietForeign(S, share) {
  // Between programs, what's a world's own can't be drawn by the other one. It lets go before the middle and takes up after, so at the middle no program can tell it was there.
  if (S[OFF['field.kind']] > FOREIGN_KIND) for (let i = 0; i < FAMILIES; i++) S[OFF[`field.k${i}`]] *= share;
  if (share === 0 && S[OFF['surf.kind']] > FOREIGN_SURF) S[OFF['surf.kind']] = 0;
}

function writeWorld(st, score, R, edits) {
  const h = score.handover, ch = h?.change && handoverOn(h, st.t) ? h.change : null;
  // From the film there's nothing to drain first: the inks start arriving straight away, over the whole flight, not after half of it in black and white.
  const x = st.plan ? st.x : 0, fresh = !!ch && !ch.from, leaving = !!ch && !fresh && x < 0.5, W = ch ? (leaving ? ch.from : ch.to) : score.world;
  if (!W) { if (R.wp) { R.wp = null; R.world = null; } return; }
  const wp = R.worldPrograms?.get(W);
  if (!wp?.ready || wp.failed) { R.wp = null; R.world = null; return; }
  R.wp = wp; R.world = W;
  const { F, A, B } = st, U = wp.U, E = U.e;
  F[FRAME.plate * 4 + 1] = 0;      // a world has no second plate
  E[0] = 0;
  E[1] = W.hear?.threshold ?? 1;
  let geo = 1;
  if (ch) {
    const out = 1 - smoother(x / 0.45), inn = smoother((x - 0.55) / 0.45);
    E[2] = fresh ? clamp((x - 0.04) / 0.96) : leaving ? clamp(x / 0.45) : clamp((x - 0.55) / 0.45);
    E[6] = leaving ? -1 : 1;
    geo = leaving ? out : inn;
    quietForeign(A, leaving ? out : 0); quietForeign(B, leaving ? 0 : inn);
  } else { E[2] = 1; E[6] = 0; }
  E[3] = STAGGER;
  E[7] = st.x;
  E[14] = geo;
  const ink = W.ink;
  if (ink) {
    // A slip runs each band a whole number of cycles and lets go of them where coverage can't see it. floor(phase) can: every line in the band would change ink at once, with none of them moving. So a family that carries numbers doesn't slip, whichever director or dial asked it to. A hand on the slot here catches them all, and the rehearsal goes through here too.
    for (const S of [A, B]) if (S[OFF['slip.kind']] > 0.5 && ink.fams.some(i => S[OFF[`slip.m${i}`]] !== 0)) S[OFF['slip.kind']] = 0;
    for (let i = 0; i < FAMILIES; i++) E[8 + i] = ink.fams.includes(i) ? (ink.weights[ink.fams.indexOf(i)] ?? 1) : 0;
    E[12] = ink.R;
    // A slide or a bend ends with its phases a whole number of cycles from the plain path's. Where the rows are a slow ladder (ink.roll) that's taken up by the row, easing, and it lands exactly.
    let roll = 0;
    if (ink.roll && st.plan?.offset) {
      for (let i = 0; i < FAMILIES; i++) roll -= E[8 + i] * st.plan.offset[i];
      roll = (roll - ink.R * Math.round(roll / ink.R)) * st.T;
    }
    E[13] = roll;
  }
  if (W.uniforms || W.table || wp.trace) {
    const ctx = { t: st.t, c: st.c, x: st.x, T: st.T, kind: st.kind, G: st.G, from: st.from, to: st.to, plan: st.plan, geo, score, A, B, F, R, edits, tables: W === score.world ? score.tables : score.tablesOf?.(W) ?? null,
      at: c => (score.react ? reactAt(score.react, c) : null), change: ch };
    W.uniforms?.(U, ctx);
    if (W.table && W.table.fill(wp.table, ctx) !== false) wp.tableDirty = true;      // after uniforms, or a table that goes by what's in the slot reads a number uniforms is about to change
    if (wp.trace) wp.trace.run(ctx);
  }
}
wearWorlds(writeWorld);

// ---------------------------------------------------------------- the way from one world to another
let ticket = 0;
const until = (cond, every = 30) => new Promise(res => { const f = () => { if (cond()) res(); else setTimeout(f, every); }; f(); });

// stage.setWorld comes here. Null is the film. Resolves when the change has begun, with false if it didn't happen.
export async function changeWorld(stage, id, opts = {}) {
  const app = stage.app, R = app.R, me = ++ticket;
  const to = id ? (typeof id === 'object' ? adopt(id) : await loadWorld(id)) : null;     // an object: a world made on the spot, by a test
  if (id && !to) { console.warn(`no world ${id}`); return false; }
  if (to) {
    const wp = await prepare(R, to);
    if (wp.failed) return false;
    if (!app.manual) await wp.warm();
    // Heard once per song. A world that can't have them comes on anyway, as it would with no song: the click still happens.
    if (to.needs?.length && app.song?.analysis && app.song.extrasReady) await app.song.extrasReady(to.needs).catch(e => console.warn('the extras could not be heard:', e));
  }
  if (me !== ticket) return false;
  // Colour shuts first: the plates can't be in the middle of a flight when the program changes. Quickly, since this is the second thing to happen.
  if (to && app.edits.beyond) {
    app.beyond?.off({ fast: 1.5 });
    await until(() => !app.edits.beyond);
    if (me !== ticket) return false;
  }
  return new Promise(res => stage.settle(app.pictureT(), () => {
    if (me !== ticket) { res(false); return; }
    change(stage, to, opts);
    guardColour(app);
    res(true);
  }));
}

function change(stage, to, opts) {
  const app = stage.app, song = app.song, t = app.pictureT(), snap = stage.snapshot(t), from = stage.world ?? null;
  if (from === to) return;
  stage.world = to;
  stage._fam = null;
  // A song gets another film in this world, with its clock running on. With a wander standing in, or a song that's finished, the wander's the one that changes.
  if (song?.analysis) song.rebuild({ quiet: true });      // its rehearsal runs behind it
  let T = app.pictureT();
  if (stage.staticG) stage.staticG = stage.heldOn(opts.pattern ?? stage._nextPattern(), T);
  else if (!stage.score.song) {
    const pat = opts.pattern ?? (stage.hold && !to?._pool?.length && !from?._pool?.length ? snap.G.pattern : stage._nextPattern()), g = stage.score.gestures;
    g.length = 0;
    if (stage.hold) g.push({ t0: T, t1: T + 3600, arcEnd: T + 44, period: 44, pattern: pat, morph: 0 });
    else {
      const m = to?.motion;
      const len = stage.rand.range(...(m?.len ?? [24, 38]));
      const G = { t0: T, t1: T + len, arcEnd: T + len, pattern: pat, morph: stage.rand.range(...(m?.morph ?? [8, 12])) };
      if (m?.glide === false) G.noGlide = true;
      if (m?.rise != null) G.rise = m.rise;
      g.push(G);
      stage._extend(T);
    }
  }
  stage.score = stage.score;      // stamped
  stage.morphFrom(snap, T, opts.dur ?? CHANGE_S, { world: from, noGlide: true });
}


// b, in a world: the film first, and colour once it's there. Colour's own key doesn't know about worlds, and shouldn't have to.
let guarded = false;
function guardColour(app) {
  if (guarded) return;
  guarded = true;
  addEventListener('keydown', e => {
    if (!app.stage.world || e.metaKey || e.ctrlKey || e.repeat || e.key.toLowerCase() !== 'b') return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    e.stopImmediatePropagation();
    colourNow(app);
  }, { capture: true });
}

// The strip's "colour", and b from a world: the film, then the plates open.
export async function colourNow(app) {
  const stage = app.stage;
  if (stage.world) {
    const began = await changeWorld(stage, null);
    if (!began) return;
    await until(() => !stage.score.handover?.change);
  }
  app.beyond?.on();
}
