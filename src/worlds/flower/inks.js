// Flower Power's inks: flat, hot, no black. A line wears one ink of a set on each side, so a band can never take the ink of the band beside it.
// Parted: the blooms are light and the grounds are deep, and the poster is calm. Equal: every ink at about the same luminance, so the eye's motion channel can't find an edge and the borders buzz (Moscoso, Livingstone).
// Tension slides each from one to the other, the blooms falling and the grounds rising, so brightness holds. All in sRGB here; the table is linear.
//
// A song goes through several sets, and never all at once: a line wears the set that was up when it was born, so a new set comes out of the flowers ring by ring and the old one goes out at the edges. The same goes for a colour run.
const lin = c => c.map(v => Math.pow(v / 255, 2.2));
const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
// The same hue at the luminance everything meets at when it buzzes. Too bright, it darkens. Too dark, it goes towards white.
const EQUAL = 0.33;
// Darkening a yellow only makes it olive, so what comes down is its green, as the first set's hand-picked inks do: yellow goes to orange, aqua to blue, mint to lilac. Red keeps enough green not to be saturated red.
const level = rgb => {
  const c = lin(rgb), Y = lum(c);
  if (Y <= EQUAL) { const k = (EQUAL - Y) / (1 - Y); return c.map(v => v + (1 - v) * k); }
  const g = Math.max((EQUAL - 0.2126 * c[0] - 0.0722 * c[2]) / 0.7152, 0.27 * c[0]);
  return [c[0], g, c[2]];
};
const ink = rgb => ({ a: lin(rgb), b: level(rgb) });

// A bloom is what a line wears for the note it was born on, by that note's place round the circle of fifths from home. Warm near home, cool the far way.
//                  name          parted            equal
const BLOOMS = [
  /* 0 */  ['lemon',      [255, 226, 0],    [255, 140, 40]],
  /* 1 */  ['tangerine',  [255, 140, 0],    [255, 125, 90]],
  /* 2 */  ['hot pink',   [255, 92, 170],   [255, 90, 170]],
  /* 3 */  ['rose',       [255, 150, 200],  [240, 85, 200]],
  /* 4 */  ['lilac',      [205, 140, 255],  [220, 85, 245]],
  /* 5 */  ['aqua',       [0, 225, 215],    [0, 185, 190]],
  /* 6 */  ['sky',        [90, 200, 255],   [0, 170, 220]],
  /* 7 */  ['lime',       [175, 235, 0],    [200, 145, 0]],
];
// A ground is what the other side wears for the chord in the air, by its place from home, and whether it's gone minor. Equal, all of them are cool and the blooms are hot, so whichever two meet, they fight.
// A cadence moves every ink at once, so what it does to the whole frame's red-against-cyan is the sum of how far each one moves: none of them goes far, or that's half a whole-frame flash. tests/flashworld.mjs reads it.
// None of the inks is saturated red by WCAG's measure (red over .8 of the three, linear), the plan's vermilion included: a band of that passing a tile is a red flash every time, at the rate of the rings. So equal is at Y about .33, where an orange can be not quite red.
const GROUNDS = [
  /* 0 home */   ['violet',     [104, 20, 200],   [175, 125, 255]],
  /* +1 */       ['wine',       [170, 0, 120],    [150, 135, 255]],
  /* +2 */       ['teal',       [0, 110, 135],    [0, 175, 175]],
  /* -1 */       ['ultramarine',[70, 40, 215],    [70, 150, 255]],
  /* -2 */       ['emerald',    [0, 120, 90],     [0, 180, 90]],
  /* minor */    ['plum',       [130, 0, 140],    [200, 120, 255]],
];
// buzz: how far along to equal a set goes. Inks of nearly one hue at one luminance are only mud, and pale ones go first.
const made = (B, G, buzz) => ({ blooms: B.map(ink), grounds: G.map(ink), buzz });
export const SETS = [
  // Sunshine: the poster everyone knows.
  { name: 'sunshine', blooms: BLOOMS.map(([, a, b]) => ({ a: lin(a), b: lin(b) })), grounds: GROUNDS.map(([, a, b]) => ({ a: lin(a), b: lin(b) })) },
  // Pop: primaries and a lot of cream, Warhol's screen colours.
  { name: 'pop', ...made([[255, 232, 0], [255, 244, 220], [255, 60, 150], [255, 150, 190], [0, 190, 255], [0, 215, 200], [120, 210, 255], [255, 150, 0]], [[0, 60, 200], [30, 45, 150], [190, 0, 110], [0, 110, 170], [0, 125, 100], [90, 0, 160]], 0.75) },
  // Candy: pastels on raspberry and periwinkle. What's quiet.
  { name: 'candy', ...made([[255, 238, 150], [255, 205, 165], [255, 175, 215], [255, 205, 225], [215, 190, 255], [170, 245, 215], [170, 220, 255], [205, 245, 150]], [[125, 105, 230], [215, 60, 135], [40, 150, 170], [85, 110, 225], [50, 165, 125], [175, 80, 205]], 0.4) },
  // Harvest: mustard and avocado on chocolate, the end of the decade.
  { name: 'harvest', ...made([[238, 185, 25], [232, 128, 30], [245, 160, 110], [250, 232, 195], [190, 195, 60], [120, 195, 170], [150, 180, 190], [205, 205, 40]], [[110, 58, 34], [140, 72, 34], [25, 100, 105], [65, 68, 125], [88, 100, 26], [112, 42, 82]], 0.25) },
  // Acid: everything turned up. Where the song's biggest.
  { name: 'acid', ...made([[210, 255, 0], [255, 170, 0], [255, 60, 225], [255, 130, 240], [190, 110, 255], [0, 245, 240], [60, 200, 255], [0, 255, 130]], [[70, 0, 215], [205, 0, 165], [0, 110, 130], [0, 45, 190], [0, 130, 50], [125, 0, 175]], 0.8) },
  // Lagoon: the far side of the wheel, for a change of air.
  { name: 'lagoon', ...made([[150, 255, 210], [255, 225, 190], [255, 135, 115], [255, 175, 150], [175, 175, 255], [0, 225, 215], [90, 200, 255], [235, 245, 120]], [[0, 70, 145], [120, 35, 130], [0, 110, 135], [40, 40, 165], [0, 120, 100], [70, 30, 150]], 0.6) },
];
// A bloom and a ground of nearly one colour, at either end of what this set does, would lose a whole line's edge: a ray would go missing. So each pair that would is given the nearest ground that doesn't.
const gam = c => c.map(v => Math.pow(v, 0.4545));
const apart = (x, y, buzz) => { const at = (i, k) => i.a.map((v, n) => v + (i.b[n] - v) * k), D = (p, q) => gam(p).reduce((sum, v, n) => sum + Math.abs(v - gam(q)[n]), 0); return Math.min(D(x.a, y.a), D(at(x, buzz), at(y, buzz))); };
const CLOSE = 0.5;
for (const S of SETS) S.alt = S.blooms.map(W => S.grounds.map((G, g) => { const buzz = S.buzz ?? 1; if (apart(W, G, buzz) >= CLOSE) return g; let best = g, top = -1; S.grounds.forEach((O, o) => { const d = apart(W, O, buzz); if (d > top) { top = d; best = o; } }); return best; }));
export const blooms = SETS[0].blooms;
export const grounds = SETS[0].grounds;
// Runs: a line wears its place in a cycle, and not the note it was born on. Two to a line, so the bands go through the whole of it.
const RUN = c => c.map(ink);
export const RUNS = {
  rainbow: RUN([[255, 120, 80], [255, 155, 30], [255, 200, 0], [250, 235, 40], [175, 225, 30], [50, 205, 100], [0, 205, 195], [40, 170, 250], [80, 110, 240], [135, 85, 235], [185, 80, 220], [245, 85, 185]]),
  fire: RUN([[255, 232, 60], [255, 195, 20], [255, 150, 10], [255, 115, 70], [245, 70, 130], [190, 25, 140], [120, 20, 150], [190, 25, 140], [245, 70, 130], [255, 115, 70], [255, 150, 10], [255, 195, 20]]),
  sea: RUN([[200, 255, 225], [120, 240, 215], [40, 215, 215], [30, 170, 225], [40, 120, 225], [55, 75, 200], [80, 45, 170], [55, 75, 200], [40, 120, 225], [30, 170, 225], [40, 215, 215], [120, 240, 215]]),
  stick: RUN([[255, 70, 165], [255, 240, 225]]),
};
export const chips = [BLOOMS[0][1], BLOOMS[2][1], GROUNDS[0][1], BLOOMS[7][1]];

// q: places round the circle of fifths from home, -5..6
export const groundOf = (q, minor) => (q === 0 ? (minor ? 5 : 0) : q === 1 ? 1 : q === 2 ? 2 : q >= 3 ? 5 : q === -1 ? 3 : 4);

const R = 32;
export const ROWS = R;
// Paints the table. inkAt(n) says what line n wears: [bloom, ground, set, run, place], and tensionOf(n) how far along parted to equal it is. Only the window of lines that can be showing is filled, each in its row n mod R, so a line's row is fixed for its whole life.
export function paint(tex, nLow, tensionOf, inkAt) {
  const id = inkAt.id ?? '', was = (tex.was ??= { n: new Float64Array(R).fill(NaN), k: new Float32Array(R), run: new Array(R).fill(null), id: null }), fresh = was.id !== id;
  was.id = id;
  let changed = false;
  for (let n = nLow; n < nLow + R; n++) {
    const r = ((n % R) + R) % R, k = Math.round(tensionOf(n) * 256) / 256;
    const [w, g, s, run, at] = inkAt(n);
    if (!fresh && was.n[r] === n && was.k[r] === k && was.run[r] === run) continue;
    was.n[r] = n; was.k[r] = k; was.run[r] = run; changed = true;
    const L = run ? RUNS[run] : null, place = L ? ((at % L.length) + L.length) % L.length : 0, K = L ? k * 0.3 : k * (SETS[s].buzz ?? 1);
    const W = L ? L[place] : SETS[s].blooms[w], G = L ? L[(place + 1) % L.length] : SETS[s].grounds[SETS[s].alt[w][g]];
    tex.set(r, 0, W.a[0] + (W.b[0] - W.a[0]) * K, W.a[1] + (W.b[1] - W.a[1]) * K, W.a[2] + (W.b[2] - W.a[2]) * K);
    tex.set(r, 1, G.a[0] + (G.b[0] - G.a[0]) * K, G.a[1] + (G.b[1] - G.a[1]) * K, G.a[2] + (G.b[2] - G.a[2]) * K);
  }
  return changed;
}
