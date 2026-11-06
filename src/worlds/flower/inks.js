// Flower Power's inks: flat, hot, no black. Two sets, one per side of a line, so a band can never take the ink of the band beside it.
// Parted: the blooms are light and the grounds are deep, and the poster is calm. Equal: every ink at about the same luminance, so the eye's motion channel can't find an edge and the borders buzz (Moscoso, Livingstone).
// Tension slides each from one to the other, the blooms falling and the grounds rising, so brightness holds. All in sRGB here; the table is linear.
const lin = c => c.map(v => Math.pow(v / 255, 2.2));

// A bloom is what a line wears for the note it was born on, by that note's place round the circle of fifths from home. Warm near home, cool the far way.
//                  name          parted            equal
const BLOOMS = [
  /* 0 */  ['lemon',      [255, 226, 0],    [255, 140, 40]],
  /* 1 */  ['tangerine',  [255, 140, 0],    [255, 125, 90]],
  /* 2 */  ['hot pink',   [255, 92, 170],   [255, 90, 170]],
  /* 3 */  ['rose',       [255, 150, 200],  [255, 70, 190]],
  /* 4 */  ['lilac',      [205, 140, 255],  [235, 70, 235]],
  /* 5 */  ['aqua',       [0, 225, 215],    [0, 185, 190]],
  /* 6 */  ['sky',        [90, 200, 255],   [0, 170, 220]],
  /* 7 */  ['lime',       [175, 235, 0],    [220, 135, 0]],
];
// A ground is what the other side wears for the chord in the air, by its place from home, and whether it's gone minor. Equal, all of them are cool and the blooms are hot, so whichever two meet, they fight.
// None of the inks is saturated red by WCAG's measure (red over .8 of the three, linear), the plan's vermilion included: a band of that passing a tile is a red flash every time, at the rate of the rings. So equal is at Y about .33, where an orange can be not quite red.
const GROUNDS = [
  /* 0 home */   ['violet',     [104, 20, 200],   [175, 125, 255]],
  /* +1 */       ['wine',       [190, 0, 110],    [110, 150, 255]],
  /* +2 */       ['teal',       [0, 110, 135],    [0, 175, 175]],
  /* -1 */       ['ultramarine',[70, 40, 215],    [40, 160, 255]],
  /* -2 */       ['emerald',    [0, 120, 90],     [0, 180, 90]],
  /* minor */    ['plum',       [130, 0, 140],    [200, 120, 255]],
];
export const blooms = BLOOMS.map(([n, a, b]) => ({ name: n, a: lin(a), b: lin(b) }));
export const grounds = GROUNDS.map(([n, a, b]) => ({ name: n, a: lin(a), b: lin(b) }));
export const chips = [BLOOMS[0][1], BLOOMS[2][1], GROUNDS[0][1], BLOOMS[7][1]];

// q: places round the circle of fifths from home, -5..6
export const groundOf = (q, minor) => (q === 0 ? (minor ? 5 : 0) : q === 1 ? 1 : q === 2 ? 2 : q >= 3 ? 5 : q === -1 ? 3 : 4);

const R = 32;
export const ROWS = R;
// Paints the table. inkAt(n) says what line n wears, as [bloom, ground]. Only the window of lines that can be showing is filled, each in its row n mod R, so a line's row is fixed for its whole life.
export function paint(tex, nLow, tension, inkAt) {
  const k = Math.round(tension * 256) / 256, key = `${nLow}|${k}|${inkAt.id ?? ''}`;
  if (tex.key === key) return false;
  tex.key = key;
  for (let n = nLow; n < nLow + R; n++) {
    const r = ((n % R) + R) % R, [w, g] = inkAt(n), W = blooms[w], G = grounds[g];
    tex.set(r, 0, W.a[0] + (W.b[0] - W.a[0]) * k, W.a[1] + (W.b[1] - W.a[1]) * k, W.a[2] + (W.b[2] - W.a[2]) * k);
    tex.set(r, 1, G.a[0] + (G.b[0] - G.a[0]) * k, G.a[1] + (G.b[1] - G.a[1]) * k, G.a[2] + (G.b[2] - G.a[2]) * k);
  }
  return true;
}
