// Retina's inks. All display values (sRGB, 0..1), mixed the way the film mixes black and white, so an edge pixel weighs what it does in the film.
//
// The inducers: the two zones' inks for the 16 to 24 seconds before a big arrival. Black lines print in the deep ink, white lines in the pale one. What matters is the zone's average, because
// that's what the eye gets used to, and when the colour runs out the eye answers with its opposite on the black and white. So each rung is named for what it leaves behind, not for what it shows.
// Never a saturated red: the deepest warm ink here is a brown and the reddest a rose. Every deep ink is above the Dark measure's black (relative luminance .03, tools/look.mjs), so a build has no empty black in it at all.
//   glow    a warm glow for a bright, major chorus: a teal middle and violet round it, which leave rose in the middle and gold-green outside
//   dawn    in between: a blue middle and jade round it, which leave amber and pink
//   frost   a cool glow for a dark, minor chorus: an amber middle and rose round it, which leave blue and green
export const RUNGS = {
  glow: { mid: { deep: [0.0, 0.33, 0.37], pale: [0.55, 0.93, 0.9] }, out: { deep: [0.26, 0.09, 0.5], pale: [0.8, 0.7, 1.0] }, leaves: 'rose in the middle, gold-green round it' },
  dawn: { mid: { deep: [0.06, 0.18, 0.5], pale: [0.62, 0.78, 1.0] }, out: { deep: [0.0, 0.3, 0.18], pale: [0.62, 0.95, 0.75] }, leaves: 'amber in the middle, pink round it' },
  frost: { mid: { deep: [0.4, 0.2, 0.0], pale: [1.0, 0.86, 0.56] }, out: { deep: [0.4, 0.04, 0.28], pale: [1.0, 0.75, 0.88] }, leaves: 'blue in the middle, green round it' },
};
export const ORDER = ['glow', 'dawn', 'frost'];

// The fringe: a couple of pixels along every edge, dark on its black side and light on its white side. Two pairs, matched in brightness, so a swap changes hue and not light.
export const FRINGE = [
  { dark: [0.15, 0.04, 0.27], light: [1.0, 0.87, 0.7] },     // violet on the black side, orange on the white
  { dark: [0.22, 0.09, 0.0], light: [0.87, 0.86, 1.0] },      // and the other way about: brown on the black side, lavender on the white
];

export const ZONE = 0.55;     // the middle disc's radius, in frame heights from the middle (y runs -1..1)

// The strip's chips: the first rung's four inks.
const hex = c => c.map(v => Math.round(v * 255));
export const chips = [hex(RUNGS.glow.mid.pale), hex(RUNGS.glow.mid.deep), hex(RUNGS.glow.out.deep), hex(RUNGS.glow.out.pale)];

// Which rung suits a chorus: how much of its first eight bars is in a minor chord, and how bright it sounds against the rest of the song.
export function rungFor(A, M, H) {
  const bar = M.bar || 2, a = H, b = H + 8 * bar;
  let minor = 0, all = 0;
  for (const r of M.runs ?? []) { const x = Math.max(a, r.t0), y = Math.min(b, r.t1); if (y > x) { all += y - x; if (r.c & 1) minor += y - x; } }
  const m = all ? minor / all : 0.5;
  const at = (arr, t) => (arr ? arr[Math.max(0, Math.min(arr.length - 1, Math.round(t * A.fps)))] || 0 : 0);
  let here = 0, n = 0; for (let t = a; t < b; t += 0.25) { here += at(A.bright, t); n++; }
  here /= Math.max(n, 1);
  const every = A.bright ? Array.from(A.bright).filter((_, i) => i % 16 === 0).sort((x, y) => x - y) : [], mid = every[Math.floor(every.length / 2)] ?? here;
  const bright = here >= mid;
  const name = m < 0.4 && bright ? 'glow' : m > 0.6 && !bright ? 'frost' : m < 0.5 ? 'glow' : m > 0.6 ? 'frost' : 'dawn';
  return { name, minor: +m.toFixed(2), bright };
}
