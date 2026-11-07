// Flyer's inks: a sheet of coloured stock, one or two fluorescent spot inks and toner, in display values, multiplied. Ink's a filter: pink over blue is a third colour nobody mixed. Real stocks and real Riso drums.
//   stock       what the paper is
//   a, a2       ink A at either end of the fountain: a split fountain is two colours of ink in one duct, and the roller lays them across the sheet as a run from one to the other, the way a gig poster gets a sky. Each is what ink A is at that place on the sheet, so its colour isn't what line it's on.
//   b           ink B
//   k           toner
//   sched       how a line's number says what's on it (below)
//   sw          the fountain's way across, x and y, and where its middle is
export const EDITIONS = [
  { name: 'xerox',    stock: [238, 228, 205], a: [255, 45, 28],  a2: [255, 112, 0],  b: [255, 214, 0],   k: [24, 20, 22], sched: 0, sw: [0.5, 0.2, 0] },    // newsprint, photocopy, one drum of red
  { name: 'canary',   stock: [255, 226, 40],  a: [255, 40, 110], a2: [255, 24, 24],  b: [255, 150, 90],  k: [20, 16, 26], sched: 0, sw: [0.15, 0.55, 0] },   // canary stock, hot pink running to red, and a tint that goes orange on it
  { name: 'riso',     stock: [248, 240, 228], a: [255, 72, 176], a2: [255, 108, 47], b: [0, 120, 191],   k: [40, 44, 110], sched: 2, sw: [0.55, -0.2, 0] },  // no black at all: fluoro pink over medium blue
  { name: 'acid',     stock: [214, 255, 30],  a: [255, 0, 150],  a2: [150, 40, 255], b: [0, 90, 255],    k: [14, 14, 18], sched: 1, sw: [0.4, 0.4, 0] },     // yellow-green stock, Ben-Day dots
  { name: 'goldenrod', stock: [246, 172, 0],  a: [226, 0, 40],   a2: [130, 10, 120], b: [255, 255, 255], k: [20, 12, 10], sched: 3, sw: [0.2, 0.5, 0] },     // goldenrod, the classic: one ring in four
  { name: 'cyan',     stock: [60, 215, 245],  a: [255, 60, 150], a2: [255, 90, 60],  b: [255, 150, 210], k: [10, 10, 40], sched: 0, sw: [-0.5, 0.25, 0] },   // astrobright blue, and a pink that goes violet on it
  { name: 'pink',     stock: [255, 104, 186], a: [255, 240, 0],  a2: [255, 150, 0],  b: [0, 215, 185],   k: [24, 8, 34], sched: 1, sw: [0.3, -0.45, 0] },    // day-glo pink stock, yellow dots
  { name: 'punk',     stock: [255, 238, 0],   a: [235, 0, 40],   a2: [235, 0, 40],   b: [255, 90, 0],    k: [16, 14, 12], sched: 3, sw: [0, 0, 0] },         // God Save the Queen
  { name: 'white',    stock: [250, 248, 240], a: [0, 170, 90],   a2: [0, 110, 210],  b: [255, 60, 150],  k: [18, 18, 22], sched: 2, sw: [0.5, 0.1, 0] },     // white, green running to blue, pink
  { name: 'fire',     stock: [255, 196, 24],  a: [255, 56, 0],   a2: [190, 0, 90],   b: [255, 110, 0],   k: [22, 8, 14], sched: 0, sw: [0, -0.62, 0] },      // yellow stock, a fountain from orange to wine, up the sheet: a flame job
];
// sRGB 0..1, ready for the shader. Nothing here goes through a light: it's display values multiplied, as a press does.
const by255 = c => c.map(v => v / 255);
export const inkOf = e => ({ stock: by255(e.stock), a: by255(e.a), a2: by255(e.a2), b: by255(e.b), k: by255(e.k), sched: e.sched, sw: e.sw });
export const INKS = EDITIONS.map(inkOf);
export const chips = [EDITIONS[1].stock, EDITIONS[1].a, EDITIONS[5].stock, EDITIONS[0].k];

// What's on a line: how much of ink A, ink B and toner, each side of its edge. Eight rows, by the line's number. 0 is bare, 1 solid, and anything between is dots.
const S = (A, B, K) => [A, B, K];
export const ROWS = 8;
export const SCHEDULES = [
  // 0 the poster: toner and solids, every fourth ring fat dots
  { white: [S(1, 0, 0), S(0, 0, 0), S(0.45, 0, 0), S(0, 0, 0), S(0, 1, 0), S(0, 0, 0), S(0.72, 0, 0), S(0, 0.4, 0)],
    black: [S(0, 0, 1), S(1, 1, 0), S(0, 0, 1), S(1, 0, 0.5), S(0, 0, 1), S(0, 1, 0), S(0, 0, 1), S(1, 1, 0)] },
  // 1 Ben-Day: dots all over the light side, toner the dark
  { white: [S(0.38, 0, 0), S(0.38, 0, 0), S(0.62, 0, 0), S(0.38, 0, 0), S(1, 0, 0), S(0.38, 0, 0), S(0, 0.5, 0), S(0.38, 0, 0)],
    black: [S(0, 0, 1), S(0, 1, 0), S(0, 0, 1), S(0, 0, 0.6), S(0, 0, 1), S(0, 1, 0), S(0, 0, 1), S(1, 1, 0)] },
  // 2 two drums, no black at all: what's dark is the two laid over each other
  { white: [S(0, 0, 0), S(1, 0, 0), S(0, 0.45, 0), S(0.6, 0, 0), S(0, 0, 0), S(1, 0, 0), S(0, 0, 0), S(0, 0.7, 0)],
    black: [S(1, 1, 0), S(0, 1, 0), S(1, 1, 0), S(0, 0, 0.9), S(0, 1, 0), S(1, 0.5, 0), S(1, 1, 0), S(0, 1, 0)] },
  // 3 one ring in four: toner on the bare sheet, the way it looks when the band's only got one ink
  { white: [S(1, 0, 0), S(0, 0, 0), S(0, 0, 0), S(0, 0, 0), S(0.5, 0, 0), S(0, 0, 0), S(0, 0, 0), S(0, 0, 0)],
    black: [S(0, 0, 1), S(1, 0, 0), S(0, 0, 1), S(0, 0, 0.55), S(1, 0, 0), S(0, 0, 1), S(1, 0, 0), S(0, 0, 0.7)] },
];
export function writeSchedules(tex) {
  SCHEDULES.forEach((s, k) => { for (let i = 0; i < ROWS; i++) { tex.set(8 * k + i, 0, ...s.white[i]); tex.set(8 * k + i, 1, ...s.black[i]); } });
}
