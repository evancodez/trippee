// The read: the picture, small. A 64 x 36 copy of what was actually drawn, taken through the GPU so the big buffer never comes back
// to the CPU: blit down, read into a pixel buffer, pick it up a frame or two later when the fence says it's there. No stall, no hitch.
//
// With colour's plates open the red channel means nothing: vermilion's dark ink has plenty of red in it, teal's light ink has none. Each pixel
// is judged by the ink it's nearest to. The first plate is the black and white picture: paper and the dark ink are where it's off, white and the
// light ink are where it's on. So colour plays the same notes.
import { FRAME } from '../pattern/layout.js';
import { flag } from '../score/flags.js';

export const W = 64, H = 36;
const INKS = [FRAME.paper, FRAME.band2, FRAME.ink, FRAME.band1];    // paper, dark, white, light: order as the shader mixes them

export class Reader {
  constructor(R) {
    const gl = this.gl = R.gl;
    this.R = R;
    this.fbo = gl.createFramebuffer();
    this.rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, W, H);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, this.rb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.pbo = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, W * H * 4, gl.STREAM_READ);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.fence = null;
    this.rgba = new Uint8Array(W * H * 4);
    this.grid = new Uint8Array(W * H);   // 0..255, row 0 at the bottom of the picture, so a higher row is a higher note
    this.plates = false;                 // colour's plates are open in what's being read
    this.inks = new Float32Array(12);    // the four inks as they come out on screen
    this.white = 0.5;  // how much of the picture is white
    this.tv = 2;       // edges per column, on average: how finely it's cut going up the picture
    this.th = 2;       // edges per row: how finely going across
    this.reads = 0;
  }

  // Call right after a render, in the same task: the drawing buffer is only there until the task ends.
  _blit() {
    const gl = this.gl, c = this.R.canvas;
    this._lookAtInks();
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fbo);
    gl.blitFramebuffer(0, 0, c.width, c.height, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.LINEAR);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fbo);
  }

  // The live path, in two halves, and neither waits on the GPU. This one goes right after a render, and asks for the pixels.
  request() {
    const gl = this.gl;
    if (this.fence) return;
    this._blit();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
  }

  // This one goes in a later task, and picks them up once the fence says they're there.
  pickup() {
    const gl = this.gl;
    if (!this.fence || gl.getSyncParameter(this.fence, gl.SYNC_STATUS) !== gl.SIGNALED) return false;
    gl.deleteSync(this.fence);
    this.fence = null;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.rgba);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this._parse();
    return true;
  }

  // For tests that step the picture by hand: the same numbers, straight away.
  now() {
    const gl = this.gl;
    this._blit();
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, this.rgba);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this._parse();
  }

  // What the frame just drawn was printed in. The shader raises its inks to .4545 on the way out.
  _lookAtInks() {
    const F = this.R.frame;
    this.plates = !!F && F[FRAME.plate * 4 + 1] !== 0 && flag('readInks');
    if (!this.plates) return;
    INKS.forEach((v, k) => { for (let c = 0; c < 3; c++) this.inks[k * 3 + c] = 255 * Math.pow(Math.max(F[v * 4 + c], 0), 0.4545); });
  }

  // Each pixel to its nearest ink. With one ink doing both jobs (vermilion alone) a coloured pixel could be either side of the first plate's
  // edge, and the pixels round it say which: the edge stays in the middle of the band, where black and white has it.
  _classify() {
    const { rgba, grid, inks: I } = this;
    const dk = (I[3] - I[9]) ** 2 + (I[4] - I[10]) ** 2 + (I[5] - I[11]) ** 2;
    const same = dk < 900;
    let open = null;
    for (let i = 0, n = W * H; i < n; i++) {
      const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
      let best = 0, bd = Infinity;
      for (let k = 0; k < 4; k++) {
        const d = (r - I[k * 3]) ** 2 + (g - I[k * 3 + 1]) ** 2 + (b - I[k * 3 + 2]) ** 2;
        if (d < bd) { bd = d; best = k; }
      }
      if (same && (best === 1 || best === 3)) { grid[i] = 127; (open ||= []).push(i); }
      else grid[i] = best >= 2 ? 255 : 0;
    }
    if (open) {
      const said = open.map(i => {
        const y = Math.floor(i / W), x = i - y * W;
        let on = 0, off = 0;
        const see = j => { const v = grid[j]; if (v === 255) on++; else if (v === 0) off++; };
        if (x > 0) see(i - 1);
        if (x < W - 1) see(i + 1);
        if (y > 0) see(i - W);
        if (y < H - 1) see(i + W);
        return on === off ? ((x + y) & 1 ? 255 : 0) : on > off ? 255 : 0;
      });
      open.forEach((i, n) => { grid[i] = said[n]; });
    }
  }

  _parse() {
    const { rgba, grid } = this;
    let sum = 0, tv = 0, th = 0;
    if (this.plates) { this._classify(); for (let i = 0, n = W * H; i < n; i++) sum += grid[i]; }
    else for (let i = 0, n = W * H; i < n; i++) { const v = rgba[i * 4]; grid[i] = v; sum += v; }
    for (let y = 0; y < H; y++) {
      let prev = grid[y * W] > 127;
      for (let x = 1; x < W; x++) { const w = grid[y * W + x] > 127; if (w !== prev) { th++; prev = w; } }
    }
    for (let x = 0; x < W; x++) {
      let prev = grid[x] > 127;
      for (let y = 1; y < H; y++) { const w = grid[y * W + x] > 127; if (w !== prev) { tv++; prev = w; } }
    }
    this.white = sum / (W * H * 255);
    this.tv = tv / W;
    this.th = th / H;
    this.reads++;
  }

  dispose() {
    const gl = this.gl;
    if (this.fence) { gl.deleteSync(this.fence); this.fence = null; }
    gl.deleteBuffer(this.pbo); gl.deleteFramebuffer(this.fbo); gl.deleteRenderbuffer(this.rb);
  }
}

// Everything the music looks at, from the picture and the hand, once a frame.
// comb: where a drag is, if there is one. Only sound.js knows, by watching the pointer itself.
export function features(app, reader, comb = null) {
  const f = app.lastFrame, e = app.edits, h = app.hand;
  // Anything a knob has hold of, as one number: it only has to say whether something moved
  let knobs = (h?.speed ?? 1) * 1.37 + (h?.spinRate ?? 0) * 3.1;
  if (e.over) for (const k in e.over) knobs += k === 'scale' ? e.over[k] / Math.exp(e.journey || 0) : k === 'rot' ? e.over[k] - (e.spin || 0) : e.over[k];
  const A = (f.from ?? f.G).pattern;
  const B = f.N ? f.N.pattern : null;
  return {
    phi: f.phi, T: B ? f.T : 0, A, B,
    grid: reader.grid, W, H, white: reader.white, tv: reader.tv, th: reader.th,
    theta: f.solid ? f.theta / f.solid : 0,
    journey: e.journey || 0, press: Math.abs(e.press || 0) / 0.46,
    sheet: e.sheet || 0, sheetRot: e.sheetRot || 0, sheetX: e.sheetX || 0, sheetY: e.sheetY || 0, ripples: e.ripples || null,
    duty: f.solid ? (e.duty || 0) / f.solid : 0, warp: e.warp || null, hand: e.hand || null, spinRate: h?.spinRate ?? 0, overRot: e.over?.rot == null ? null : e.over.rot - (e.spin || 0),
    knobs, comb,
  };
}
