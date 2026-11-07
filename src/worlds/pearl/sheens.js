// Pearl's colour: how a film of a given thickness looks. A thin film's colours come round in order as it thickens, and go paler the thicker it gets: the plan's real interference fit gave that much, and on its own only pink and green, with olive in the deep side.
// So the order and the paling are the physics, and what comes round is chosen, a sheen at a time. Two sides: side 0 is what coverage calls white, side 1 what it calls black, always a deeper version of the same place in the cycle, so that melting one into the other stays a colour and never goes grey.
// The table is linear light. A cell is 16 nm: thickness 0 to 4080 nm.
export const NM = 16, CELLS = 256;
const lin = v => Math.pow(v / 255, 2.2);
const rgb = h => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
// Round a closed list of stops, smoothly. In display values, so it's even to the eye.
function cycle(stops, u) {
  const n = stops.length, x = (((u % 1) + 1) % 1) * n, i = Math.floor(x), f = x - i;
  const p = [stops[(i + n - 1) % n], stops[i], stops[(i + 1) % n], stops[(i + 2) % n]];
  return [0, 1, 2].map(k => { const [a, b, c, d] = p.map(s => s[k]); return 0.5 * (2 * b + (c - a) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (3 * b - a - 3 * c + d) * f * f * f); });
}
const PERIOD = 640;      // nm a colour takes to come round. Where nothing's moving the frame sees about two of these
function bake(S) {
  const light = S.light.map(rgb), deep = S.deep.map(rgb), a = new Float32Array(CELLS * 3), b = new Float32Array(CELLS * 3);
  for (let i = 0; i < CELLS; i++) {
    const o = i * NM, u = o / PERIOD;
    // Thick film is pale, thin film is rich. It's where a song's energy is going to take it.
    const keep = Math.max(0.42, Math.min(1, 1.25 - (o - 900) / 2600)), A = cycle(light, u), B = cycle(deep, u + (S.lag ?? 0));
    const pale = (c, white, k) => c.map((v, n) => lin(Math.max(0, Math.min(255, white[n] + (v - white[n]) * k))));
    const pa = pale(A, S.white ?? [255, 248, 246], keep), pb = pale(B, S.mist ?? [176, 170, 200], 0.35 + 0.65 * keep);
    for (let n = 0; n < 3; n++) { a[i * 3 + n] = pa[n]; b[i * 3 + n] = pb[n]; }
  }
  return { ...S, a, b };
}
// The sets a song goes through. None has a black in it, and none a flat colour. Named for what they're made to feel like.
export const SHEENS = [
  // Pearl: nearly white, with blush and sea-foam, over dusty rose and hazy blue.
  bake({ name: 'pearl', light: [0xfff1ea, 0xffd6e2, 0xe9d3ff, 0xcfe4ff, 0xbdf2e4, 0xf7f4cf], deep: [0xc98ab2, 0xa38bd8, 0x77a3da, 0x5cb6b4, 0x8fb8c8, 0xdca0ae] }),
  // Abalone: the shell's inside. Jewel green and violet over ink-blue.
  bake({ name: 'abalone', light: [0x7df2d6, 0x6dc6ff, 0xb19bff, 0xff9ed4, 0x9bf0ff, 0x74f0b4], deep: [0x124a66, 0x1c2f7c, 0x41208a, 0x6b1f7c, 0x123f7a, 0x0e5f60], mist: [40, 60, 110], white: [205, 245, 250] }),
  // Victorialand: ice. Cold, silver, a little lilac.
  bake({ name: 'ice', light: [0xf2f8ff, 0xd8e9ff, 0xe8e0ff, 0xcdf3f7, 0xeaf6ff], deep: [0x7f9ecb, 0x8d8fd4, 0x6caac4, 0xa2b5dc, 0x7a8fc0], mist: [160, 178, 206], white: [248, 251, 255] }),
  // Heaven: neon through rain. Rose and amber with aqua and blue behind.
  bake({ name: 'heaven', light: [0xffcfa4, 0xffa3c4, 0xe99aff, 0xffb9d6, 0xffdc9c], deep: [0x2a8fae, 0x2a60b6, 0x5a3eb6, 0xa23a8c, 0x1f7f9e], mist: [70, 90, 150], white: [255, 232, 232] }),
  // Milk: warm, blush and butter, over clay and mauve.
  bake({ name: 'milk', light: [0xfff5de, 0xffe5d0, 0xffdce0, 0xf7e2ec, 0xfff0c7], deep: [0xdba78e, 0xcf98a8, 0xba9ac2, 0xd59a96, 0xe2b98a], mist: [214, 190, 186], white: [255, 250, 240] }),
  // Bluebell: violet and silver, with a little rose and sea in the deep.
  bake({ name: 'bluebell', light: [0xdcd3ff, 0xb9c5ff, 0xcbe1ff, 0xecd2ff, 0xc4ccff, 0xf3dcf2], deep: [0x6a5bcb, 0x4f70c8, 0x8a56c4, 0xb066b0, 0x4f8fc0, 0x7055c8], mist: [130, 130, 190], white: [242, 240, 255] }),
  // Treasure: gold leaf over wine and old blue.
  bake({ name: 'treasure', light: [0xf9e6b6, 0xf5cfa8, 0xeeb4ae, 0xf6d6c6, 0xdde6c0, 0xfbe8b8], deep: [0x96477c, 0x6a4398, 0x3f6f90, 0x9a4f68, 0xa8607c, 0x7d4a92], mist: [130, 90, 130], white: [255, 240, 214] }),
];
export const chips = [[250, 226, 232], [176, 232, 220], [202, 190, 248], [255, 244, 222]];
// By how big the moment is.
export const CALM = [0, 4, 2], MIDDLE = [5, 0, 6], BIG = [1, 3, 6];
