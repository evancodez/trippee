// Owns the GPU: one program, one block of numbers, a brush texture, and a canvas whose size only changes when the window does.
import { VERT, FRAG, BRUSH_FRAG } from './shader.js';
import { SLOT_FLOATS, FRAME_VEC4, FRAME } from '../pattern/layout.js';

const BLOCK_FLOATS = 2 * SLOT_FLOATS + FRAME_VEC4 * 4;

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
  constructor(canvas) {
    this.canvas = canvas;
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
    this.drawScale = 1;
    this.parallel = gl.getExtension('KHR_parallel_shader_compile');
    this.floatOk = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    this._pending = { vs, fs, prog: link(gl, vs, fs) };
    this._whenReady = new Promise(res => { this._resolveReady = res; });
    this._poll();
  }

  whenReady() { return this._whenReady; }

  _poll() {
    const gl = this.gl, { prog, vs, fs } = this._pending;
    const done = !this.parallel || gl.getProgramParameter(prog, this.parallel.COMPLETION_STATUS_KHR);
    if (!done) { setTimeout(() => this._poll(), 16); return; }
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getShaderInfoLog(fs) || '';
      const lines = FRAG.split('\n');
      const where = /ERROR: \d+:(\d+)/.exec(log);
      console.error('Shader failed:', log, where ? `\nline: ${lines[+where[1] - 1]}` : '', gl.getProgramInfoLog(prog));
      throw new Error('Shader failed to compile');
    }
    this.prog = prog;
    const ix = gl.getUniformBlockIndex(prog, 'Block');
    gl.uniformBlockBinding(prog, ix, 0);
    this.ubo = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo);
    gl.bufferData(gl.UNIFORM_BUFFER, this.block.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.ubo);
    gl.useProgram(prog);
    gl.uniform1i(gl.getUniformLocation(prog, 'uPush'), 0);
    this._initBrush();
    this.ready = true;
    this._resolveReady();
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

  resize(cssW, cssH, dpr) {
    const w = Math.max(2, Math.round(cssW * dpr)), h = Math.max(2, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; return true; }
    return false;
  }

  // Slots and frame numbers have already been written into this.block
  draw() {
    const gl = this.gl, c = this.canvas;
    const F = this.frame, res = FRAME.res * 4;
    F[res] = c.width; F[res + 1] = c.height; F[res + 2] = c.width / c.height; F[res + 3] = this.pushOn ? 1 : 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, c.width, c.height);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    if (this.brushOk) gl.bindTexture(gl.TEXTURE_2D, this.brushA.tex);
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, this.block);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
