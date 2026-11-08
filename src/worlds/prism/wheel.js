// Prism's two colour wheels, worked out once. A hue is a place round OKLCH's wheel, so every hue is as vivid as the screen can make it at its own lightness, and none of them goes grey or brown between two others.
// The light wheel is what the side c calls white wears, the deep wheel what the black side wears. The deep wheel is already turned half way round: at one hue it holds the opposite colour, so wherever the two sides meet they're complements, and every edge buzzes.
// Linear RGB, as the ink table wants. Pure: nothing here knows about the page.
export const HUES = 256;

const cube = x => x * x * x;
// OKLab (Ottosson) to linear sRGB
export function oklchToLin(L, C, h) {
  const a = C * Math.cos(h * 2 * Math.PI), b = C * Math.sin(h * 2 * Math.PI);
  const l = cube(L + 0.3963377774 * a + 0.2158037573 * b), m = cube(L - 0.1055613458 * a - 0.0638541728 * b), s = cube(L - 0.0894841775 * a - 1.2914855480 * b);
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
}
const inGamut = c => c.every(v => v >= -1e-4 && v <= 1 + 1e-4);
// The most chroma this hue can have at this lightness
function most(L, h) {
  let lo = 0, hi = 0.4;
  for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (inGamut(oklchToLin(L, m, h))) lo = m; else hi = m; }
  return lo;
}
// The lightness where this hue is most vivid: yellow's is near white, blue's is deep. A hue's inks lean towards it, so a deep yellow is gold and not olive, and a light blue is still blue.
function cusp(h) {
  let best = 0.5, top = 0;
  for (let L = 0.3; L <= 0.98; L += 0.01) { const c = most(L, h); if (c > top) { top = c; best = L; } }
  return best;
}
const clip = c => c.map(v => Math.max(0, Math.min(1, v)));
// h in turns. lean: how far towards the hue's own best lightness. Chroma a little inside the edge of the gamut, and never past what reads as ink rather than light.
const red = c => c[0] / Math.max(c[0] + c[1] + c[2], 1e-6);
const at = (L, h, cap) => clip(oklchToLin(L, Math.min(cap, 0.97 * most(L, h)), h));
// One wheel. Each hue's lightness leans from L0 towards where that hue is most vivid (lean), and further for gold's hues (a deep yellow is only olive otherwise).
// And never a saturated red that counts (WCAG's measure: red over .8 of the three, linear, weighted by how much redder than the rest it is): a band of that going by a tile is a red flash every time. A light red rises to coral, a deep one sinks to maroon, which hardly counts,
// and its neighbours go with it a little, so the wheel has no step in it.
const redness = c => (red(c) >= 0.8 ? Math.max(0, c[0] - c[1] - c[2]) * 320 : 0);
function wheel({ L: L0, lean, cap, gold = 0, sink = false }, hueOf) {
  const near = (h, c, w) => { const d = Math.min(Math.abs(h - c), 1 - Math.abs(h - c)); return Math.exp(-((d / w) ** 2)); };
  const hues = Array.from({ length: HUES }, (_, i) => hueOf(i / HUES));
  const L = hues.map(h => L0 + (cusp(h) - L0) * (lean + gold * near(h, 0.26, 0.1)));
  const step = sink ? -0.005 : 0.005, bad = (l, h) => (sink ? redness(at(l, h, cap)) > 45 : red(at(l, h, cap)) >= 0.75);
  const need = hues.map((h, i) => { let l = L[i]; while (bad(l, h) && l > 0.34 && l < 0.92) l += step; return Math.abs(l - L[i]); });
  const SPREAD = 22;
  const move = need.map((_, i) => { let m = 0; for (let j = -SPREAD; j <= SPREAD; j++) { const n = need[(i + j + HUES) % HUES]; if (n) m = Math.max(m, n * Math.cos((Math.PI / 2) * (j / (SPREAD + 1))) ** 2); } return m; });
  return hues.map((h, i) => at(L[i] + Math.sign(step) * move[i], h, cap));
}
// Light: high and clear. Deep: low and rich, and never black, so there's no large empty dark anywhere.
export const LIGHT = { L: 0.8, lean: 0.4, cap: 0.24 }, DEEP = { L: 0.4, lean: 0.3, cap: 0.22, gold: 0.5, sink: true };
// The deep wheel is the light one seen in a mirror whose axis is about red-orange (MIRROR is twice its angle, in turns): yellow meets magenta, green meets violet, blue meets teal, red meets orange.
// Every pair is as red as it is cyan on both sides, so a band going by changes a tile's red against cyan hardly at all (tests/flashworld.mjs reads that channel), where true complements swung it by 210 out of 255 on average.
export const MIRROR = 0.19;
let made = null;
export function wheels() {
  if (made) return made;
  return made = { light: wheel(LIGHT, h => h), deep: wheel(DEEP, h => (((MIRROR - h) % 1) + 1) % 1) };
}
const toByte = v => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
export const sRGB = c => c.map(toByte);
