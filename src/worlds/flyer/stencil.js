// The stencil: a shape cut with a knife, and inside it the print's the other way up. It's stored as how far each place is from its edge, in the world's table, one page a slot, so it stays hard at any size, and a word's as easy as a skull.
// A page is 256 x 126. Pure, and made once for each shape. It goes on the frame and not on the sheet, as a stencil's on the screen and not on the paper.
export const PAGE_W = 256, PAGE_H = 126, PAGE_ROWS = [2, 128], TABLE_H = 254, PAGE_ASPECT = 255 / 125;

// Felzenszwalb and Huttenlocher's distance transform, a line at a time.
function edt1(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    for (;;) { s = (f[q] + q * q - f[v[k]] - v[k] * v[k]) / (2 * (q - v[k])); if (s > z[k]) break; k--; }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const r = q - v[k]; d[q] = r * r + f[v[k]]; }
}
function edt(on, W, H) {
  const g = new Float64Array(W * H), N = Math.max(W, H), f = new Float64Array(N), d = new Float64Array(N), v = new Int32Array(N), z = new Float64Array(N + 1);
  for (let i = 0; i < W * H; i++) g[i] = on[i] ? 0 : 1e12;
  for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) f[y] = g[y * W + x]; edt1(f, H, d, v, z); for (let y = 0; y < H; y++) g[y * W + x] = d[y]; }
  for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) f[x] = g[y * W + x]; edt1(f, W, d, v, z); for (let x = 0; x < W; x++) g[y * W + x] = d[x]; }
  return g;
}

// x runs -PAGE_ASPECT..PAGE_ASPECT, y -1..1, up. fill() draws what's cut. Everything's in those units.
const drawn = {
  skull(g) {
    g.beginPath();
    // the cranium, down to the cheekbones and in to the jaw
    g.moveTo(-0.34, -0.5);
    g.bezierCurveTo(-0.44, -0.3, -0.72, -0.2, -0.72, 0.2);
    g.bezierCurveTo(-0.72, 0.68, -0.38, 0.92, 0, 0.92);
    g.bezierCurveTo(0.38, 0.92, 0.72, 0.68, 0.72, 0.2);
    g.bezierCurveTo(0.72, -0.2, 0.44, -0.3, 0.34, -0.5);
    g.lineTo(0.3, -0.86); g.lineTo(-0.3, -0.86);
    g.closePath();
    g.fillStyle = '#fff'; g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';
    // sockets, angry, a nose, and the teeth
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(s * 0.08, 0.2); g.bezierCurveTo(s * 0.12, 0.02, s * 0.5, -0.06, s * 0.54, 0.16); g.bezierCurveTo(s * 0.56, 0.36, s * 0.3, 0.42, s * 0.08, 0.2); g.fill();
    }
    g.beginPath(); g.moveTo(0, -0.04); g.lineTo(0.11, -0.28); g.lineTo(-0.11, -0.28); g.closePath(); g.fill();
    for (const x of [-0.2, -0.067, 0.067, 0.2]) { g.beginPath(); g.rect(x - 0.022, -0.86, 0.044, 0.31); g.fill(); }
    g.globalCompositeOperation = 'source-over';
  },
  bolt(g) { g.beginPath(); [[0.34, 1], [-0.42, -0.08], [-0.04, -0.08], [-0.34, -1], [0.46, 0.2], [0.06, 0.2], [0.42, 1]].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = '#fff'; g.fill(); },
  star(g) { g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.42 : 1.02, a = Math.PI / 2 + (i * Math.PI) / 5; g[i ? 'lineTo' : 'moveTo'](r * Math.cos(a), r * Math.sin(a) - 0.06); } g.closePath(); g.fillStyle = '#fff'; g.fill(); },
  spade(g) {
    g.beginPath(); g.moveTo(0, 0.98);
    g.bezierCurveTo(0.2, 0.62, 0.78, 0.28, 0.78, -0.14); g.bezierCurveTo(0.78, -0.5, 0.26, -0.56, 0.1, -0.26);
    g.bezierCurveTo(0.12, -0.5, 0.2, -0.8, 0.36, -0.94); g.lineTo(-0.36, -0.94); g.bezierCurveTo(-0.2, -0.8, -0.12, -0.5, -0.1, -0.26);
    g.bezierCurveTo(-0.26, -0.56, -0.78, -0.5, -0.78, -0.14); g.bezierCurveTo(-0.78, 0.28, -0.2, 0.62, 0, 0.98); g.closePath(); g.fillStyle = '#fff'; g.fill();
  },
  // A flying V: a body in a wedge, its neck going up and away.
  vee(g) {
    g.save(); g.rotate(-0.42);
    g.beginPath();
    g.moveTo(-0.075, -0.2);
    g.lineTo(-0.56, -0.98); g.lineTo(-0.26, -0.98); g.lineTo(-0.03, -0.56); g.lineTo(0.03, -0.56); g.lineTo(0.26, -0.98); g.lineTo(0.56, -0.98);
    g.lineTo(0.075, -0.2); g.lineTo(0.055, 0.68); g.lineTo(0.14, 0.82); g.lineTo(0.11, 1.06); g.lineTo(-0.11, 1.06); g.lineTo(-0.14, 0.82); g.lineTo(-0.055, 0.68);
    g.closePath(); g.fillStyle = '#fff'; g.fill(); g.restore();
  },
  // A raised fist of a shape anyone would know: four knuckles, a thumb across them, a wrist.
  fist(g) {
    g.fillStyle = '#fff';
    const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath(); g.fill(); };
    rr(-0.5, -0.42, 0.98, 0.62, 0.14);
    for (let i = 0; i < 4; i++) rr(-0.54 + i * 0.27, 0.12, 0.25, 0.66 + (i === 1 || i === 2 ? 0.08 : 0), 0.11);
    rr(-0.6, -0.1, 0.76, 0.27, 0.12);
    rr(-0.34, -1, 0.68, 0.62, 0.02);
    g.globalCompositeOperation = 'destination-out'; g.strokeStyle = '#000'; g.lineWidth = 0.035;
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(-0.54 + i * 0.27 - 0.01, 0.8); g.lineTo(-0.54 + i * 0.27 - 0.01, 0.2); g.stroke(); }
    g.beginPath(); g.moveTo(-0.6, -0.11); g.lineTo(0.16, -0.11); g.stroke();
    g.globalCompositeOperation = 'source-over';
  },
};

// Wood type: letters as heavy as the system has, squeezed to fill the page, as a poster's headline fills its sheet.
function words(g, text) {
  const lines = text.split('\n'), SIZE = 1.0, family = '"Impact","Haettenschweiler","Franklin Gothic Heavy","Arial Black","Helvetica Neue",sans-serif';
  const H = 2 / lines.length;
  lines.forEach((line, i) => {
    g.save();
    const y = 1 - H * (i + 0.5);
    g.translate(0, y);
    g.font = `900 100px ${family}`;
    const m = g.measureText(line), w = Math.max(m.width, 1), a = m.actualBoundingBoxAscent || 72, d = m.actualBoundingBoxDescent || 0;
    const sx = (2 * PAGE_ASPECT * 0.94) / w, sy = (H * 0.86 * SIZE) / (a + d);
    g.scale(sx, -sy);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillText(line, 0, (a - d) / 2);
    g.restore();
  });
}

const made = new Map();
const OVER = 2;
// A page: Float32Array PAGE_W * PAGE_H of how far each texel is from the edge, in texels, inside negative. Key: a shape's name above, or text after 'word:'.
export function pageOf(key) {
  if (made.has(key)) return made.get(key);
  const W = PAGE_W * OVER, H = PAGE_H * OVER;
  let out = null;
  try {
    const c = new OffscreenCanvas(W, H), g = c.getContext('2d', { willReadFrequently: true });
    g.translate(W / 2, H / 2);
    g.scale((H - 2) / 2, -(H - 2) / 2);
    if (key.startsWith('word:')) words(g, key.slice(5)); else drawn[key]?.(g);
    const px = g.getImageData(0, 0, W, H).data, inside = new Uint8Array(W * H), outside = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) { const on = px[i * 4 + 3] > 127; inside[i] = on ? 1 : 0; outside[i] = on ? 0 : 1; }
    const a = edt(inside, W, H), b = edt(outside, W, H);
    out = new Float32Array(PAGE_W * PAGE_H);
    for (let y = 0; y < PAGE_H; y++) for (let x = 0; x < PAGE_W; x++) {
      const i = y * OVER * W + x * OVER;
      out[y * PAGE_W + x] = (Math.sqrt(a[i]) - Math.sqrt(b[i])) / OVER;
    }
  } catch (e) { console.warn('flyer: no stencil', key, e); out = new Float32Array(PAGE_W * PAGE_H).fill(20); }
  made.set(key, out);
  return out;
}
export function writePage(tex, row0, key) {
  const d = pageOf(key);
  for (let y = 0; y < PAGE_H; y++) for (let x = 0; x < PAGE_W; x++) tex.set(x, row0 + y, d[y * PAGE_W + x], 0, 0, 1);
}
