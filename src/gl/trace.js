// A world's small pass (Liquid Light's map, docs/MODES.md section 3), read as uTrace on unit 2. This is the stub: a one-texel map that moves nothing. W6 owns this file.
export class Trace {
  constructor(R) {
    const gl = this.gl = R.gl;
    this.tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, 1, 1, 0, gl.RG, gl.FLOAT, new Float32Array(2));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.activeTexture(gl.TEXTURE0);
  }
  // Each frame, before the draw, for a world with a pass. Pure, and nothing keeps anything between frames.
  run() {}
  bind() { const gl = this.gl; gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.activeTexture(gl.TEXTURE0); }
}
