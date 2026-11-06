// The read: the picture, small. A 64 x 36 copy of what was actually drawn, taken through the GPU so the big buffer never comes back
// to the CPU: blit down, read into a pixel buffer, pick it up a frame or two later when the fence says it's there. No stall, no hitch.
export const W = 64, H = 36;

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
    this.white = 0.5;  // how much of the picture is white
    this.tv = 2;       // edges per column, on average: how finely it's cut going up the picture
    this.th = 2;       // edges per row: how finely going across
    this.reads = 0;
  }

  // Call right after a render, in the same task: the drawing buffer is only there until the task ends.
  _blit() {
    const gl = this.gl, c = this.R.canvas;
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

  _parse() {
    const { rgba, grid } = this;
    let sum = 0, tv = 0, th = 0;
    for (let i = 0, n = W * H; i < n; i++) { const v = rgba[i * 4]; grid[i] = v; sum += v; }
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
export function features(app, reader) {
  const f = app.lastFrame, e = app.edits;
  const A = (f.from ?? f.G).pattern;
  const B = f.N ? f.N.pattern : null;
  return {
    phi: f.phi, T: B ? f.T : 0, A, B,
    grid: reader.grid, W, H, white: reader.white, tv: reader.tv, th: reader.th,
    theta: f.solid ? f.theta / f.solid : 0,
    journey: e.journey || 0, press: Math.abs(e.press || 0) / 0.46,
    sheet: e.sheet || 0, sheetRot: e.sheetRot || 0, ripples: e.ripples || null,
  };
}
