// PPP, ?cut=time in the address: the rest of src/score/moves/time.js by name, laid out by the clock and not by the song. A demo, and something to count flashes on. It isn't the film.
export default {
  hash: 'f9ee57f6abe35539eae4fdecc1fdd65f', name: 'ppp-time', v: 1,
  line: 'A still picture that turns, a disc that floats, a spiral of time, two moments interleaved, late bands, a wave of delay.',
  shots: [
    { at: 0, id: 'time.snakes', moves: [{ id: 'snakes', beats: 'strong', amp: [[4, 0], [12, 1], [34, 1], [38, 0]] }], gear: [[0, 64]] },
    { at: 46, from: 38, id: 'time.ouchi', moves: [{ id: 'ouchi', beats: 'strong' }], gear: [[46, 64]] },
    { at: 86, from: 78, id: 'time.spiral', moves: [{ id: 'slit', map: 'spiral', arms: 1, wind: 0.9, D: [[86, 0], [96, 3], [116, 3], [120, 0]], turn: 0.5, push: 0.2, beats: 'strong' }] },
    { at: 128, from: 120, id: 'time.cells', moves: [{ id: 'slit', map: 'cells', wave: 1.1, ang: 0.3, D: [[128, 0], [136, 2], [156, 2], [160, 0]], turn: 0.55, spin: 0.1, beats: 'strong' }] },
    { at: 168, from: 160, id: 'time.venetian', moves: [{ id: 'slit', map: 'sweep', bands: 9, D: [[168, 0], [176, 2.4], [196, 2.4], [200, 0]], turn: 0.6, spin: 0.1, beats: 'strong' }] },
    { at: 208, from: 200, id: 'time.wave', moves: [{ id: 'slit', map: 'wave', wave: 3, waveV: 1.4, ang: 0.4, D: [[208, 0], [216, 1.6]], turn: 0.4, spin: 0.15, beats: 'strong' }] },
  ],
};
