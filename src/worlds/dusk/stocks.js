// An evening, as film stock. Four stops from no light to all the light there is, low in the frame and high in the frame, in display values. Never black: the darkest stop anywhere is about Y .03.
// One song is one evening. The top of the frame is always a little further on than the bottom, so night comes down from the zenith.
const c = (r, g, b) => [r / 255, g / 255, b / 255];
export const STOCKS = [
  { name: 'afternoon', lamps: 0, low: [c(96, 56, 46), c(180, 102, 50), c(236, 168, 84), c(255, 236, 184)], high: [c(124, 88, 86), c(198, 138, 94), c(246, 198, 130), c(255, 246, 218)] },
  { name: 'golden', lamps: 0, low: [c(86, 42, 56), c(176, 72, 58), c(244, 142, 70), c(255, 218, 150)], high: [c(108, 64, 92), c(194, 102, 98), c(248, 168, 114), c(255, 230, 178)] },
  { name: 'rose', lamps: 0.04, low: [c(74, 49, 72), c(128, 58, 76), c(192, 104, 100), c(255, 238, 212)], high: [c(80, 54, 96), c(140, 72, 116), c(210, 126, 138), c(255, 228, 212)] },
  { name: 'afterglow', lamps: 0.16, gam: 1.1, low: [c(58, 40, 84), c(124, 50, 106), c(230, 94, 96), c(255, 192, 130)], high: [c(46, 46, 100), c(88, 64, 134), c(182, 100, 152), c(252, 172, 150)] },
  { name: 'blue', lamps: 0.42, gam: 1.3, low: [c(44, 46, 88), c(58, 66, 118), c(124, 108, 156), c(236, 174, 172)], high: [c(36, 44, 92), c(44, 62, 124), c(82, 100, 164), c(182, 156, 196)] },
  { name: 'night', lamps: 0.72, gam: 1.65, low: [c(40, 46, 86), c(32, 70, 96), c(52, 124, 128), c(238, 188, 124)], high: [c(36, 42, 88), c(30, 54, 100), c(44, 88, 128), c(220, 194, 146)] },
  { name: 'polaroid', lamps: 0.1, low: [c(36, 68, 78), c(60, 118, 110), c(214, 156, 106), c(250, 226, 182)], high: [c(46, 88, 108), c(88, 150, 146), c(232, 178, 136), c(254, 234, 204)] },
  { name: 'ember', lamps: 0.05, low: [c(72, 36, 52), c(152, 50, 62), c(234, 112, 84), c(255, 206, 162)], high: [c(70, 48, 84), c(136, 66, 104), c(214, 110, 112), c(252, 190, 164)] },
];
const N = STOCKS.length;
const ease = x => x * x * (3 - 2 * x);
const lerp3 = (a, b, k, out, o) => { out[o] = a[0] + (b[0] - a[0]) * k; out[o + 1] = a[1] + (b[1] - a[1]) * k; out[o + 2] = a[2] + (b[2] - a[2]) * k; };
// day: a place on the evening, any number. It goes round.
const place = day => { const d = ((day % N) + N) % N, i = Math.floor(d); return [STOCKS[i], STOCKS[(i + 1) % N], ease(d - i)]; };
export function writeStock(E, at, day, ahead = 0.3) {
  const [a, b, k] = place(day - 0.5 * ahead), [p, q, m] = place(day + 0.5 * ahead);
  for (let i = 0; i < 4; i++) { lerp3(a.low[i], b.low[i], k, E, at + i * 4); lerp3(p.high[i], q.high[i], m, E, at + 16 + i * 4); }
}
// How many lamps are on by now: they come on as the evening reaches them, and go off with the morning.
export const lampsAt = day => { const [a, b, k] = place(day); return a.lamps + (b.lamps - a.lamps) * k; };
// How much light it takes: at night the mist goes back to being dark, and only what's near an edge is lit.
export const gammaAt = day => { const [a, b, k] = place(day), g = x => x.gam ?? 1; return g(a) + (g(b) - g(a)) * k; };
export const chips = [[240, 150, 80], [192, 104, 100], [124, 50, 106], [58, 66, 118]];
