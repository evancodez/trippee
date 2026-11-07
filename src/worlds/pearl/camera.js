// How this world looks at things. Weightless: you're underwater, a little below the surface, and nothing's holding you up. It hardly turns. It goes up and down as much as along, and what it goes by is what's in focus.
import { LANG } from '../../score/camera.js';
// Float: the sheet sways a little under you, and you go with it.
LANG.float = (h, { i, way, P }, s) => {
  s.dir += way * 0.42; s.head += way * 0.38; s.spin += way * 0.05 * P;
  h({ alt: (i % 2 ? 0.18 : 0.04) * P, tip: [0.2, 0.4, 0.14, 0.32][i % 4], speed: 0.16 * P, lens: 2.7 });
};
// Sink: a long way down through it, slowly turning, with a long lens, and then you've drifted up again and you don't know when.
LANG.sink = (h, { i, way, P }, s) => {
  s.spin += way * 0.14 * P; s.dir += way * 0.3;
  h({ alt: [0.22, 0.52, 0.86, 0.3][i % 4] * P, tip: 0.14, speed: 0.09 * P, lens: 3.3 });
};
// Tideway: taken out across the sheet and brought back along the same way, leaning as you go.
LANG.tideway = (h, { i, way, P }, s) => {
  s.head += way * (i % 2 ? -2.7 : 2.9); s.dir = s.head; s.spin += way * 0.08 * P;
  h({ alt: 0.1 * P, tip: i % 2 ? 0.42 : 0.26, speed: 0.46 * P, lens: 2.2 });
};
// Rise: lifted up and over, a huge slow crane, the sheet tipping away beneath you and rolling back. For a chorus.
LANG.rise = (h, { i, way, P }, s) => {
  s.dir += way * 0.7; s.spin += way * 0.3 * P; s.head += way * 0.5;
  h({ alt: [-0.2, 0.42, -0.08, 0.66][i % 4] * P, tip: [0.74, 0.3, 0.84, 0.2][i % 4], speed: 0.42 * P, lens: [1.7, 2.8, 1.5, 3][i % 4] });
};
