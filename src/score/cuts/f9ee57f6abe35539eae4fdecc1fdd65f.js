// PPP, by hand. Times, pattern ids and numbers, and nothing else. See docs/DIRECTION.md section 7. Bars are 1-based on A.bars; the comments are for whoever changes it.
export default {
  hash: 'f9ee57f6abe35539eae4fdecc1fdd65f', name: 'ppp', v: 5,
  line: 'One dartboard shatters and builds itself twice; the floor tips under it; the chorus is one flower that comes back; the long vamp is one sheet growing until it turns inside out into the board again.',
  shots: [
    { at: 0, id: 'dials.board',                                      // bars 1-26. A whisper gets one slow move. It shatters on the first crest, with nothing to change first because it's the same board, and the last ring falls on bar 16, the strongest arrival, and lets go there
      lanes: { scale: [[0, 1.75], [13, 1.46]], rot: [[0, -0.2], [13, 0.1]] }, countdown: { L: 25.69, start: 13.1 }, gear: [[25.69, 4], [29.12, 8]],
      ambient: [[0, 0.3], [25.69, 0.3], [27.4, 1]],
      pulse: [[0, 0], [25.69, 0], [29.12, 1]] },                     // nothing on the beat until the first lock
    { at: 44.56, from: 34.27, via: 'rise', id: 'checks.floor',       // bars 27-39. Nearly square-on, the calmest picture since bar 16, so bar 32 has somewhere to go. Camera tips on bar 32, new axis on bar 36
      lanes: { 'cam.pitch': [[46, 0.05], [53.14, 0.4, 'hit'], [58.29, 1.2], [60.01, 1.3], [66, 1.6]], 'cam.yaw': [[46, -0.05], [60.01, -0.05, 'hit'], [66, 0.45]], scale: [[46, 1], [66, 1.5]] },
      gear: [[46, 12], [53.14, 6], [60.01, 6]], ambient: [[44.56, 1], [53.14, 1]] },
    { at: 66.87, from: 60.01, via: 'shock', id: 'waves.current',     // bars 40-65. Bold before the Cm. It tries on bar 43, draws back on 45, and the flower opens on bar 49 and rolls dead centre on bar 51, the first home that holds
      star: { landOn: 82.31, freq: [2.3, 1.2], size: [2.2, 2.8], lead: 1, schedule: [[72.02, 7], [75.45, 18], [78.88, 8], [82.31, 3.2], [85.75, 2.8]] },
      gear: [[66.87, 8.77], [72.02, 16], [90, 32]], ambient: [[66.87, 0.7], [104.62, 0.7], [111.49, 0.5]] },
    { at: 111.49, from: 107.71, via: 'dive', id: 'dials.board',      // bars 66-86. The biggest fall. The whisper again, the board bigger, and it builds itself again half as big once more: new information, not a mirror
      lanes: { scale: [[113, 1.4], [122.5, 1.2]], rot: [[113, 0.1], [122.5, -0.1]] }, countdown: { L: 137.23, start: 124.5, grow: 1.5 }, gear: [[137.23, 6], [140.66, 8]],
      ambient: [[111.49, 0.5], [137.23, 0.5], [138.95, 1]] },
    { at: 147.52, from: 142.38, via: 'rise', id: 'checks.floor',     // bars 87-111. The floor picks up where it stopped. Thins on the drop at bar 98
      lanes: { 'cam.pitch': [[150, 1.6], [166.4, 2.2], [178, 1.2]], 'cam.yaw': [[150, 0.45], [178, -0.3]], scale: [[150, 1.5], [178, 2.2]] },
      gear: [[150, 6], [166.4, 12], [176.7, 6]] },
    { at: 190.42, from: 183.56, via: 'shock', id: 'waves.current', star: { landOn: 199.0, freq: [2.3, 1.6], size: [2.2, 2.8], lead: 0.5, mirror: true },   // bars 112-127. The same flower. On the lift at 190.4, not the flat section edge at 188.7
      gear: [[190.42, 8.77], [195, 16], [205, 32]], ambient: [[190.42, 0.7], [199, 0.7], [201, 0.5], [210.15, 0.5], [217.88, 1]] },
    { at: 217.88, from: 210.15, via: 'rise', q: 0.7, tail: 3, id: 'lattice.master',   // bars 128-181. One sheet growing for 90 s, its clock doubling every 16 bars. Something accumulates
      lanes: { scale: [[219, 0.55], [245.34, 0.9], [272.79, 1.4], [300.25, 2.1], [303, 2.2]], rot: [[219, -0.2], [303, 0.5]] },
      gear: [[219, 48], [245.34, 24], [272.79, 12], [300.25, 6]] },
    { at: 310.54, via: 'iris', D: 12, id: 'dials.board',             // bars 182-201. Inside out on the climax, and it opens on the board
      lanes: { scale: [[318, 0.9], [344.86, 1.4]], rot: [[318, -0.3], [344.86, 0.4]] }, gear: [[310.54, 4], [327.7, 8]] },
    { at: 344.86, from: 338.0, tail: 1, via: 'slide', id: 'dials.board',   // bars 202-. The whisper. One ring opens to fill the frame as the sound dies, and then nothing moves
      lanes: { scale: [[347, 1.4], [355.16, 1.8], [358.59, 5.5], [360, 5.6]], rot: [[347, 0.4], [360, 0.5]] }, gear: [[344.86, 32], [355.16, 64]],
      ambient: [[344.86, 1], [347, 0.3]] },
  ],
};
