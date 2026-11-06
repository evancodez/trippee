// The moire instrument's detents: rotations where a lifted copy locks to the sheet underneath and the fringes close into a
// clean rosette. Which angles those are depends on what the sheet is made of, so they're read from the pattern's numbers.
import { OFF } from '../pattern/layout.js';

const DEG = Math.PI / 180;

function kindOf(A) {
  const dirs = [];
  for (let i = 0; i < 4; i++) {
    if (!A[OFF[`f${i}.on`]]) continue;
    const x = A[OFF[`f${i}.x`]], y = A[OFF[`f${i}.y`]];
    if (Math.hypot(x, y) > 1e-3) dirs.push(Math.atan2(y, x));
  }
  if (dirs.length >= 3) return 'tri';
  if (dirs.length === 2) return 'square';
  return 'lines';
}

// Coincidence angles: tan(a/2) = 1/n for square grids, and the matching series for triangular ones.
const squareAngles = [2, 3, 4, 5, 6, 7, 8, 10, 12, 16, 20, 24, 32, 48].map(n => 2 * Math.atan(1 / n));
const triAngles = [1, 2, 3, 4, 5, 6, 8, 10, 13, 18, 24].map(m => {
  const a = 3 * m * m + 3 * m + 0.5, b = 3 * m * m + 3 * m + 1;
  return Math.acos(a / b);
});

export function detentsFor(A) {
  const kind = kindOf(A);
  let list;
  if (kind === 'tri') list = [...triAngles, 30 * DEG, 60 * DEG];
  else if (kind === 'square') list = [...squareAngles, 45 * DEG, 90 * DEG];
  else list = [...squareAngles, 30 * DEG, 45 * DEG, 60 * DEG, 90 * DEG];
  const angles = [0, ...list, ...list.map(a => -a)].sort((a, b) => a - b);
  return angles.map((a, i) => {
    const gap = Math.min(i ? a - angles[i - 1] : 1, i < angles.length - 1 ? angles[i + 1] - a : 1);
    return { a, w: Math.min(0.009, gap * 0.32) };
  });
}

// A dead spot around each detent, joining the free range with matching slope on both sides.
export function magnet(x, detents) {
  let best = null, bd = Infinity;
  for (const d of detents) { const e = Math.abs(x - d.a); if (e < bd) { bd = e; best = d; } }
  if (best && bd < best.w) {
    const u = bd / best.w, s = Math.sign(x - best.a);
    return { x: best.a + s * best.w * u * u * (2 - u), locked: u < 0.62, at: best.a };
  }
  return { x, locked: false, at: best ? best.a : 0 };
}
