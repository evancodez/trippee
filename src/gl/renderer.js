// Owns the GPU: one program, one block of numbers, a brush texture, and a canvas whose size only changes when the window does.
import { VERT, FRAG, BRUSH_FRAG } from './shader.js';
import { SLOT_FLOATS, FRAME_VEC4, FRAME, OFF } from '../pattern/layout.js';

const BLOCK_FLOATS = 2 * SLOT_FLOATS + FRAME_VEC4 * 4;

// One shader, built sixteen ways: with or without the hand, colour's second plate, a flight between two patterns, and the rarer moves (slip, star, coin, fields). A GPU pays for what
// a program declares on every pixel, drawn from or not (a flight's branch alone cost a plain 1080p frame more than half its speed), so each is only in the program while it's in use.
// The first four are what a film needs to run; the rest build behind it.
export const HAND = 1, PLATES = 2, FLIGHT = 4, EXTRA = 8;
export const FOLD = 64;      // mirrors in front of the sheet (chunks/fold.js). 16 and 32 are a world's own. Nothing's built for these until something asks: wantFold, by a film with one in it at compose, or by the first frame that draws one.
const ORDER = [0, FLIGHT, EXTRA, EXTRA | FLIGHT, PLATES, PLATES | FLIGHT, PLATES | EXTRA, PLATES | EXTRA | FLIGHT, HAND, HAND | FLIGHT, HAND | EXTRA, HAND | EXTRA | FLIGHT, HAND | PLATES, HAND | PLATES | FLIGHT, HAND | PLATES | EXTRA, HAND | PLATES | EXTRA | FLIGHT];
export const sourceOf = v => FRAG.replace('\n', `\n${v & HAND ? '#define HAND\n' : ''}${v & PLATES ? '#define PLATES\n' : ''}${v & FLIGHT ? '#define FLIGHT\n' : ''}${v & FOLD ? '#define FOLD\n' : ''}${v & EXTRA ? '' : '#define NOSLIP\n#define NOSTAR\n#define NORILEY\n#define NOCARRY\n'}`);

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

function link(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, vs); gl.attachShader(p, fs);
  gl.linkProgram(p);
  return p;
}

export class Renderer {
  // bare: it'll never be asked for the hand or colour, so those aren't built at all
  constructor(canvas, { bare = false } = {}) {
    this.canvas = canvas;
    this.order = bare ? ORDER.slice(0, 4) : ORDER;
    this.foldAsked = false;
    this.bare = bare;
    const gl = this.gl = canvas.getContext('webgl2', {
      antialias: false, alpha: false, depth: false, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: false, desynchronized: false,
    });
    if (!gl) throw new Error('This needs WebGL2.');
    this.block = new Float32Array(BLOCK_FLOATS);
    this.slotA = this.block.subarray(0, SLOT_FLOATS);
    this.slotB = this.block.subarray(SLOT_FLOATS, 2 * SLOT_FLOATS);
    this.frame = this.block.subarray(2 * SLOT_FLOATS);
    this.ready = false;
    this.pushOn = false;
    this.wp = null;      // the world programs in use (src/worlds/engine.js). Null is the film, and nothing below does anything else.
    this.warm = null;    // a world program waiting for its first draw
    this.drawScale = 1;
    this.parallel = gl.getExtension('KHR_parallel_shader_compile');
    // How long the GPU really took over each frame, for the governor. It knows within a few frames instead of after seconds of dropped ones. No extension, and it goes by the frame rate as before.
    this.timer = bare ? null : gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.onCost = null; this._timing = []; this._spareQ = [];
    this.floatOk = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    this.vs = compile(gl, gl.VERTEX_SHADER, VERT);
    this.progs = new Array(128).fill(null);
    this.variant = 0;
    this._start(0);
    this._whenReady = new Promise(res => { this._resolveReady = res; });
    this._whenAll = new Promise(res => { this._resolveAll = res; });
    this._whenFold = new Promise(res => { this._resolveFold = res; });
    this._poll();
  }

  // A world's programs, built behind the picture. Resolves when its plain and flight programs are ready. No world, and this file is all that ever runs.
  async prepareWorld(world) { const { prepare } = await import('../worlds/engine.js'); return prepare(this, world); }

  whenReady() { return this._whenReady; }
  whenAllReady() { return this._whenAll; }
  // Every program a fold can be drawn with. For tests, and for a rehearsal that has one to look at.
  whenFoldReady() { this.wantFold(); return this._whenFold; }
  // The ones a fold's likely to want, or just this one. It's a program's first draw that's the stall, so they're warmed one at a time with the picture carrying on, as at the start.
  wantFold(v = null) {
    if (v == null) this.foldAsked = true;
    const add = v != null ? [v] : ORDER.slice(0, this.bare ? 4 : 8).map(n => n | FOLD);       // the hand's only if it's ever drawn over one
    const more = add.filter(n => !this.order.includes(n));
    if (!more.length) return;
    this.order = [...this.order, ...more];
    if (!this._pending && !this._warming) this._next();
  }
  _next() { const next = this.order.find(n => !this.progs[n]); if (next !== undefined) { this._start(next); this._poll(); } else this._warmAll(); }

  _start(v) {
    const gl = this.gl, fs = compile(gl, gl.FRAGMENT_SHADER, sourceOf(v));
    this._pending = { v, fs, prog: link(gl, this.vs, fs) };
  }

  _poll() {
    const gl = this.gl, { v, prog, fs } = this._pending;
    const done = !this.parallel || gl.getProgramParameter(prog, this.parallel.COMPLETION_STATUS_KHR);
    if (!done) { setTimeout(() => this._poll(), 16); return; }
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getShaderInfoLog(fs) || '';
      const lines = sourceOf(v).split('\n');
      const where = /ERROR: \d+:(\d+)/.exec(log);
      console.error('Shader failed:', log, where ? `\nline: ${lines[+where[1] - 1]}` : '', gl.getProgramInfoLog(prog));
      throw new Error('Shader failed to compile');
    }
    const ix = gl.getUniformBlockIndex(prog, 'Block');
    gl.uniformBlockBinding(prog, ix, 0);
    gl.useProgram(prog);
    gl.uniform1i(gl.getUniformLocation(prog, 'uPush'), 0);
    this.progs[v] = prog;
    if (v === 0) {
      this.prog = prog;
      this.ubo = gl.createBuffer();
      gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo);
      gl.bufferData(gl.UNIFORM_BUFFER, this.block.byteLength, gl.DYNAMIC_DRAW);
      gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.ubo);
      this._initBrush();
    }
    if (v === FLIGHT) { this.ready = true; this._resolveReady(); }
    // The next one, without holding anything up. With no way to build in the background, the rest wait until each is first asked for.
    const next = this.order.find(n => !this.progs[n]);
    if (next === undefined) { this._pending = null; this._warmAll(); return; }
    if (this.parallel || v === 0) { this._start(next); this._poll(); } else { this._pending = null; this._warmAll(); }
  }

  // A program's first draw is when the GPU really builds it, up to 440 ms measured, and that would be a stall in the middle of the film the first time a flight or colour needs it.
  // So each draws one pixel now, one at a time with the picture carrying on between them, to the canvas and to the smaller target, which the GPU may build separately.
  _warmAll() {
    // ...then the ones nothing's waiting for, the same way.
    const list = this.progs.filter((p, v) => p && !(this._warm ??= new Set()).has(v) && this._warm.add(v));
    this._warming = true;
    const done = () => {
      this._warming = false;
      this._resolveAll();
      if (this.order.some(n => !this.progs[n])) { this._next(); return; }
      if (this.foldAsked) this._resolveFold();
    };
    if (!list.length) { done(); return; }
    const gl = this.gl, c = this.canvas;
    let i = 0;
    const one = () => {
      if (i >= list.length) { done(); return; }
      const low = this._lowTarget(0.5);
      gl.useProgram(list[i++]);
      gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, 1, 1);
      gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo);
      gl.bindFramebuffer(gl.FRAMEBUFFER, low.fbo); gl.viewport(0, 0, low.w, low.h); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, c.width, c.height); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.SCISSOR_TEST);
      setTimeout(one, 60);
    };
    one();
  }

  // The smallest program with what this frame needs. One still building, the frame goes without the hand or colour for a moment. They both come up slowly anyway.
  _variantOf(F) {
    return (F[FRAME.hand * 4 + 3] > 0.001 ? HAND : 0) | (F[FRAME.plate * 4 + 1] !== 0 ? PLATES : 0) | (F[FRAME.dive * 4 + 3] > 0.5 ? FLIGHT : 0) | (this._extra(this.slotA) || this._extra(this.slotB) ? EXTRA : 0) | (this.slotA[OFF['sf.on']] > 0.5 || this.slotB[OFF['sf.on']] > 0.5 ? FOLD : 0);
  }

  // Does this slot wear anything only the fuller programs have?
  _extra(S) {
    return S[OFF['slip.kind']] > .5 || S[OFF['star.k']] > 0 || (S[OFF['field.kind']] > .5 && S[OFF['field.kind']] < 3.5) || S[OFF['matte.kind']] > 2.5 || S[OFF['lathe.k']] !== 0 || S[OFF['lathe.w']] !== 0 || S[OFF['meta.amt']] !== 0;
  }

  _programFor(F) {
    if (this.wp) return this.wp.program(F);
    const v = this._variantOf(F);
    if (v & FOLD && !this.progs[v]) this.wantFold(v);
    if (!this.progs[v] && !this.parallel && !this._pending) { this._start(v); this._poll(); }
    const fold = this.progs[v & (FLIGHT | EXTRA | FOLD)] ? v & (FLIGHT | EXTRA | FOLD) : v & (FLIGHT | FOLD);      // one still building, a fold goes without whatever else it can before it goes without the fold
    const got = this.progs[v] ? v : this.progs[fold] ? fold : this.progs[v & (FLIGHT | EXTRA)] ? v & (FLIGHT | EXTRA) : v & FLIGHT;
    this.variant = got;
    return this.progs[got];
  }

  _initBrush() {
    const gl = this.gl;
    this.brushSize = [512, 320];
    const vs = compile(gl, gl.VERTEX_SHADER, VERT), fs = compile(gl, gl.FRAGMENT_SHADER, BRUSH_FRAG);
    this.brushProg = link(gl, vs, fs);
    this.uBrush = gl.getUniformLocation(this.brushProg, 'uBrush');
    this.uBrush2 = gl.getUniformLocation(this.brushProg, 'uBrush2');
    this.uPrev = gl.getUniformLocation(this.brushProg, 'uPrev');
    const makeTarget = () => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, this.brushSize[0], this.brushSize[1], 0, gl.RG, gl.HALF_FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex, fbo, ok };
    };
    this.brushA = makeTarget(); this.brushB = makeTarget();
    this.brushOk = this.floatOk && this.brushA.ok && this.brushB.ok;
    this.brushEnergy = 0;
  }

  // Paint a push (or just let it heal). x, y in 0..1 from the bottom left; dx, dy in picture units.
  brush({ x = 0, y = 0, r = 0.1, dx = 0, dy = 0, on = false, heal = 0.012 } = {}) {
    if (!this.brushOk) return;
    if (!on && this.brushEnergy <= 0.001) { this.pushOn = false; return; }
    const gl = this.gl;
    gl.useProgram(this.brushProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.brushB.fbo);
    gl.viewport(0, 0, this.brushSize[0], this.brushSize[1]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.brushA.tex);
    gl.uniform1i(this.uPrev, 0);
    gl.uniform4f(this.uBrush, x, y, r, on ? 1 : 0);
    gl.uniform4f(this.uBrush2, dx, dy, this.canvas.width / this.canvas.height, heal);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    [this.brushA, this.brushB] = [this.brushB, this.brushA];
    this.brushEnergy = on ? Math.min(1, this.brushEnergy + 0.2) : this.brushEnergy * (1 - heal);
    this.pushOn = true;
    gl.useProgram(this.prog);
  }

  clearPush() {
    if (!this.brushOk) return;
    const gl = this.gl;
    for (const t of [this.brushA, this.brushB]) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.brushEnergy = 0; this.pushOn = false;
  }

  // Draws a slot's picture very small and reads it back: how the planner finds an element to fly into. It waits for the GPU, so it can cost a frame.
  probe(slot, aspect) {
    const gl = this.gl, { W, H } = this._drawProbe(slot, aspect);
    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { W, H, px };
  }

  // The same look without waiting: the draw joins the queue now and probeDone has its pixels on a later frame, null until then. WebGL won't let a
  // fence pass within one task, so there's no waiting for one: anyone in a hurry drops it with probeDrop and calls probe.
  probeStart(slot, aspect) {
    const gl = this.gl, { W, H } = this._drawProbe(slot, aspect), pbo = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, W * H * 4, gl.STREAM_READ);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    return { W, H, pbo, sync };
  }

  probeDone(look) {
    const gl = this.gl;
    if (gl.getSyncParameter(look.sync, gl.SYNC_STATUS) !== gl.SIGNALED) return null;
    const px = new Uint8Array(look.W * look.H * 4);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, look.pbo);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, px);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.probeDrop(look);
    return { W: look.W, H: look.H, px };
  }

  probeDrop(look) { this.gl.deleteSync(look.sync); this.gl.deleteBuffer(look.pbo); }

  _drawProbe(slot, aspect) {
    const gl = this.gl, H = 180, W = Math.min(400, Math.max(40, Math.round(H * aspect)));
    if (!this.probeT) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 400, 180, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindTexture(gl.TEXTURE_2D, null);     // still bound on unit 0 it would be read while drawn to, and the draw fails
      this.probeT = { tex, fbo };
    }
    const saved = this.block.slice();
    this.slotA.set(slot);
    this.frame.fill(0);
    this.frame.set([0, 0, 0, 1], FRAME.paper * 4);
    this.frame.set([1, 1, 1, 1], FRAME.ink * 4);
    this.frame.set([W, H, W / H, 0], FRAME.res * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.probeT.fbo);
    gl.viewport(0, 0, W, H);
    gl.useProgram(this.wp ? this.wp.forProbe() : this.progs[this._variantOf(this.frame)] ?? this.prog);    // the program this slot needs, alone, with no hand, colour or flight
    gl.activeTexture(gl.TEXTURE0);
    if (this.brushOk) gl.bindTexture(gl.TEXTURE_2D, this.brushA.tex);
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, this.block);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.block.set(saved);
    return { W, H };       // still bound to the small target, for whoever reads it
  }

  resize(cssW, cssH, dpr) {
    const w = Math.max(2, Math.round(cssW * dpr)), h = Math.max(2, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; return true; }
    return false;
  }

  // Slots and frame numbers have already been written into this.block
  draw() {
    const gl = this.gl, c = this.canvas;
    const F = this.frame, res = FRAME.res * 4;
    const low = this.drawScale < 1 ? this._lowTarget() : null;
    const w = low ? low.w : c.width, h = low ? low.h : c.height;
    if (this.warm) this.warm();
    F[res] = w; F[res + 1] = h; F[res + 2] = w / h; F[res + 3] = this.pushOn ? 1 : 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, low ? low.fbo : null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this._programFor(F));
    this.costKey = this.variant + (F[FRAME.xf * 4] > 0.5 ? 0.5 : 0);     // a shock draws two patterns in a plain program: it costs what it costs, and what's plain stays sharp
    gl.activeTexture(gl.TEXTURE0);
    if (this.brushOk) gl.bindTexture(gl.TEXTURE_2D, this.brushA.tex);
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, this.block);
    if (this.wp) this.wp.upload();
    const timing = this._timeBegin(F);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (timing) gl.endQuery(this.timer.TIME_ELAPSED_EXT);
    if (low) {
      // Stretched back up to fill a canvas that hasn't changed size
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, low.fbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.blitFramebuffer(0, 0, w, h, 0, 0, c.width, c.height, gl.COLOR_BUFFER_BIT, gl.LINEAR);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  }

  // Hands in the frames the GPU has finished, then starts timing this one. A few at a time at most: a query is cheap but it isn't nothing.
  _timeBegin(F) {
    const T = this.timer;
    if (!T || !this.onCost) return false;
    const gl = this.gl;
    while (this._timing.length && gl.getQueryParameter(this._timing[0].q, gl.QUERY_RESULT_AVAILABLE)) {
      const e = this._timing.shift(), ns = gl.getQueryParameter(e.q, gl.QUERY_RESULT);
      this._spareQ.push(e.q);
      if (!gl.getParameter(T.GPU_DISJOINT_EXT)) this.onCost(e.key, e.scale, ns / 1e6);
    }
    if (this._timing.length >= 4) return false;
    const q = this._spareQ.pop() ?? gl.createQuery();
    gl.beginQuery(T.TIME_ELAPSED_EXT, q);
    this._timing.push({ q, key: this.costKey, scale: this.drawScale });
    return true;
  }

  // The smaller picture the governor draws into, remade when the size it wants changes
  _lowTarget(scale = this.drawScale) {
    const gl = this.gl, c = this.canvas;
    const w = Math.max(2, Math.round(c.width * scale)), h = Math.max(2, Math.round(c.height * scale));
    let t = this.low;
    if (t && t.w === w && t.h === h) return t;
    if (!t) { t = this.low = { fbo: gl.createFramebuffer(), rb: gl.createRenderbuffer() }; }
    gl.bindRenderbuffer(gl.RENDERBUFFER, t.rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, t.rb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    t.w = w; t.h = h;
    return t;
  }
}
