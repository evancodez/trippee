// Small helpers for writing patterns as data. A pattern file only states what differs from the defaults.
const rad = d => d * Math.PI / 180;

// Stripes: k cycles per frame-height unit (the frame is 2 units high), lines perpendicular to direction deg.
export const plane = (k, deg = 90, o = {}) => ({ x: k * Math.cos(rad(deg)), y: k * Math.sin(rad(deg)), ...o });
// Rings even in radius / even in log radius, spokes, and spirals, about pole 1 unless j = 2.
export const ring = (k, o = {}, j = 1) => ({ [`r${j}`]: k, ...o });
export const logring = (k, o = {}, j = 1) => ({ [`l${j}`]: k, ...o });
export const spokes = (n, o = {}, j = 1) => ({ [`t${j}`]: n, ...o });
export const spiral = (k, n, o = {}, j = 1) => ({ [`l${j}`]: k, [`t${j}`]: n, ...o });
// Three plane families whose sines concur: triangles. ph sums to 1/4. alpha 120 = equilateral.
export const triLattice = (k, deg = 90, alpha = 120, o = {}) => {
  const a = rad(deg), b = rad(deg + alpha);
  const c1 = [k * Math.cos(a), k * Math.sin(a)], c2 = [k * Math.cos(b), k * Math.sin(b)];
  return [
    { x: c1[0], y: c1[1], ph: 0.25, ...o },
    { x: c2[0], y: c2[1], ...o },
    { x: -c1[0] - c2[0], y: -c1[1] - c2[1], ...o },
  ];
};
