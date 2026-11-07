// MGMT, ?cut=time in the address: everything in src/score/moves/time.js by name, each at a moment of the song it suits. A demo, for seeing them with the song. It isn't the film.
export default {
  hash: 'b348c58fdc8d0af2d7ecbe0b9d646db9', name: 'mgmt-time', v: 2,
  line: 'Tricks with when and how the eye sees: a face in the moire, the past at the rim, a chorus that stops and goes on moving in your own eye, a hand that is only there on the beat.',
  shots: [
    { at: 0, id: 'time.fringe',                                                          // the slow intro: bands, and a face comes up in them, singing when the voice comes in
      moves: [{ id: 'fringe', beats: 'strong', lead: 2, coast: 2, amp: [[6, 0], [22, 1], [40, 1], [46, 0]] }], gear: [[0, 32]] },
    { at: 47.51, from: 39.83, via: 'shock', id: 'time.target',                           // the rim is the past. It winds up to the whip at 64.31, which puts everything back in register, and it melts again
      moves: [{ id: 'slit', map: 'target', D: [[47.51, 0], [62, 3.2], [70, 2.4], [72, 3.2]], turn: 0.55, push: 0.22, beats: 'strong' }], gear: [[47.51, 16]] },
    { at: 77.75, from: 70.07, via: 'fall', a: 1, id: 'time.waterfall',                   // the chorus: dead steady, and the rest at 92.5 stops it dead. What moves then is in your eye
      moves: [{ id: 'waterfall', times: { stop: 92.5, go: 96.3 } }] },
    { at: 98.87, from: 96.3, via: 'plain', id: 'time.ghost', moves: [{ id: 'ghost', beats: 'strong', turn: 0.8 }] },   // a hand on each strong beat, and at no other time
    { at: 124.31, from: 110, q: 0, via: 'span', xform: { ang: 0.25 }, id: 'time.echo',  // stripes become a plaid, across the frame, over the whole of the verse's first half
      moves: [{ id: 'echo', beats: 'strong', turn: 0.35, amp: [[128, 0], [132, 1], [140, 1], [143, 0]] }], gear: [[124.31, 16]] },
    { at: 151.19, from: 143.03, via: 'rise', id: 'time.rings',                           // rings out of step, further and further, and the biggest lift puts them back. Four bars before it the tape goes back
      moves: [{ id: 'slit', map: 'target', bands: 7, D: [[151.19, 0], [180, 3], [192.95, 0], [196, 2.5]], turn: 0.5, push: 0.18, beats: 'strong', register: 0.5 }, { id: 'rewind', times: { hit: 192.95 }, back: 8, bars: 4 }] },
    { at: 206.87, via: 'iris', D: 12, id: 'time.shutter',                                // the climax: the rolling shutter, as hard as it goes
      moves: [{ id: 'slit', map: 'sweep', D: [[206.87, 0], [212, 2.4]], turn: 0.5, spin: 0.15, beats: 'strong' }] },
  ],
};
