// Two test worlds. Neither is ever shown to anyone without ?worlds=test.
//
// Mirror: the whole of a world's machinery, drawing exactly what the film draws. Its frames are byte-identical to the film's, and what it costs over program 0 is what a world's programs cost just for existing.
export default {
  id: 'mirror', name: 'mirror', chips: [[0, 0, 0], [255, 255, 255]],
  pool: [], borrow: [], ink: null, table: null, pass: null, needs: [],
  woah: 'film',      // cast exactly as the film is (src/score/woah.js): a world that changes nothing changes nothing there either
  glsl: { color: 'vec3 worldColor(int k0,int k1,float c){ return film(c); }\n' },
};

// Numbers: a line's ink is its number, one ink pair per row, so a wrong number shows as the wrong colour. It's what the ink rule and lineRows are proved on.
const lin = c => c.map(v => Math.pow(v / 255, 2.2));
export const ROWS = 8;
export const WHITE = [[255, 80, 40], [255, 210, 40], [120, 230, 60], [40, 220, 200], [60, 150, 255], [170, 90, 255], [255, 70, 190], [240, 240, 240]];
export const BLACK = [[90, 10, 0], [80, 60, 0], [10, 70, 10], [0, 70, 70], [0, 30, 110], [50, 0, 110], [100, 0, 60], [60, 60, 60]];
export const numbers = {
  id: 'numbers', name: 'numbers', chips: [WHITE[0], WHITE[2], WHITE[4], WHITE[6]],
  pool: [], borrow: [], pass: null, needs: [],
  ink: { R: ROWS, roll: false, fams: [0, 1, 2], weights: [1, 2, 3, 5] },
  table: { h: 2, fill(tex) { if (tex.filled) return false; for (let i = 0; i < ROWS; i++) { tex.set(i, 0, ...lin(WHITE[i])); tex.set(i, 1, ...lin(BLACK[i])); } tex.filled = true; return true; } },
  glsl: { color: 'vec3 worldColor(int k0,int k1,float c){ ivec2 n=lineRows(k0,k1); return gamma(mix(inkRow(n.y,1),inkRow(n.x,0),c)); }\n' },
};
