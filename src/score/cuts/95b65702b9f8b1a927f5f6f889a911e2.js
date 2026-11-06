// Wildflower, by hand: the chill set in one film. Times, pattern ids and numbers, and nothing else. See docs/DIRECTION.md section 7 and src/score/moves/moire.js, vertigo.js, confocal.js, mirror.js.
// Nobody has watched it with the song. The times come from the analysis's sections and its climax; no one has heard them.
export default {
  hash: '95b65702b9f8b1a927f5f6f889a911e2', name: 'wildflower', v: 5,
  line: 'Plain stripes find two eyes and close into rings. The rings thin into a soft wheel. One floor goes flat, curves into a ball and tips away again. A hexagon sharpens to a star on the climax, and the rings come back.',
  shots: [
    { at: 0, id: 'still.confocal', gear: [[0, 32]], ambient: [[0, 0.3]],                                 // A, B. Eyes outside the frame: nearly straight stripes. They come in, and it's rings by C. One move, 47 s
      moves: [{ id: 'confocal', k: [[0, 3.4], [47.63, 4.4]], way: [[0, -1], [47.63, -0.1]], apart: [[0, 3.2], [18.03, 1.9], [47.63, 0.85]] }] },
    { at: 47.63, from: 38, tail: 3, via: 'rise', q: 1, id: 'still.wheel', gear: [[47.63, 32], [82.4, 20]], ambient: [[47.63, 0.15]],    // C, D, D. A pinwheel of soft arms through lines that barely move. It arrives wound tight, opens to straight arms, and winds up again: broad soft areas flash in a flight, fine ones don't
      moves: [{ id: 'moire', k: 10, beat: 0, arms: 4, coil: [[47.63, 3.2], [56, 0.3], [70.56, 0.7], [78, 1], [86, 3.6]], px: [[47.63, 0], [86, 0.3]], py: [[47.63, 0], [86, -0.15]] }] },
    { at: 94.98, from: 86, tail: 6, via: 'rise', q: 1, id: 'still.ball', gear: [[94.98, 32]], ambient: [[94.98, 0.15], [103.86, 0.15], [108, 0.4]],                 // E, F, G, E. One 87 s camera move. Steep floor, slowly flat by G, the sheet curves away into a ball whose rim arrives on E's return, then it tips the other way
      moves: [{ id: 'vertigo',
        dist: [[94.98, 0.75], [125, 1], [135.67, 2], [142, 1.8], [164.53, 1.6], [182.28, 0.9]],
        tip: [[94.98, 0.98], [125, 0.9], [135.67, 0], [164.53, 0], [182.28, 0.95]],
        dir: [[94.98, 0.02], [125, 0.3], [135.67, 0.33], [164.53, 0.45], [182.28, 0.6]],
        rim: [[94.98, 40], [135.67, 40], [140, 6], [148, 2.2], [164.53, 0.92], [172, 1.5], [182.28, 40]] }] },
    { at: 182.28, from: 173, q: 1, id: 'still.mirror6', gear: [[182.28, 16]], ambient: [[182.28, 0.6]],             // F. Hexagons turn under the mirrors, and it's a six-pointed star on the climax, going on sharpening
      moves: [{ id: 'mirror', turn: [[182.28, 0.083], [189.29, 0.14], [206.7, 0.23]] }] },
    { at: 206.7, from: 198, q: 1, id: 'still.confocal', gear: [[206.7, 32], [214, 64]], ambient: [[206.7, 0.4]],   // H. The rings again as the sound goes. As lanes, not the move, so it carries on past the end of the song as it is
      lanes: { 'f0.r1': [[206.7, 6.1], [219.4, 6.22]], 'f0.r2': [[206.7, 1.2], [219.4, 0]], 'p1.x': [[206.7, -0.85]], 'p2.x': [[206.7, 0.85]] } },
  ],
};
