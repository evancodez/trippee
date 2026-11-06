// MGMT, by hand. Times, pattern ids and numbers, and nothing else. See docs/DIRECTION.md section 7. Bars are 1-based on A.bars; the comments are for whoever changes it.
export default {
  hash: 'b348c58fdc8d0af2d7ecbe0b9d646db9', name: 'mgmt', v: 5,
  line: 'One hall opens, sways and winds up into a spring. The spring lets go as the chorus, a square dial. Each return goes further; the last chord shuts the hall again.',
  shots: [
    { at: 0, id: 'rooms.hall',                                       // bars 1-25. The song starts full and the picture doesn't. Crosslines open on bar 8, the first section, with no new pattern
      lanes: { 'f1.d': [[0, -0.7], [11.03, -0.7], [12.95, -0.35, 'hit'], [16.79, 0]], freq: [[0, 0.4], [32.15, 0.4], [39.83, 0.9]], 'bend1.a': [[0, 0], [32.15, 0], [39.83, 0.4]], 'cam.yaw': [[0, 0.26], [47.51, -0.26]], 'cam.roll': [[0, -0.16], [47.51, 0.16]] },
      gear: [[0, 32], [16.79, 16], [24.47, 8], [30.23, 16]],         // speeds up with the song's brightness on bars 14-16, and answers down on 17
      ambient: [[0, 0.3], [11.03, 0.3], [12.95, 1]],
      pulse: [[0, 0], [11.03, 0], [12.95, 1]] },                     // nothing on the beat before the first lift
    { at: 47.51, from: 39.83, via: 'shock', id: 'checks.twist',      // bars 26-42. One long wind-up, tightest on bar 36. The morph sits in the band's gap
      lanes: { scale: [[47.51, 1.7], [64.31, 0.36, 'hit']], 'swirl.a': [[47.51, 0], [64.31, 8, 'hit']], 'lens.c': [[47.51, 1], [64.31, 0.55]] },
      gear: [[47.51, 8], [55.19, 4], [64.31, 2], [70.07, 8]] },
    { at: 77.75, from: 70.07, via: 'fall', a: 1, id: 'dials.rooms',  // bars 43-53. Crossing at speed on bar 43, tone bright, picture radial. A chorus is for staying. The rest at 92.5 stops it
      lanes: { scale: [[77.75, 1.1], [91.19, 1.5]], rot: [[77.75, -0.3], [91.19, 0.3]] },
      gear: [[77.75, 4], [85.43, 8], [91.19, 16]] },
    { at: 98.87, from: 96.3, tail: 3, via: 'rise', id: 'rooms.hall', // bars 54-61. The verse looks like the verse, further on
      lanes: { 'f1.d': [[98.87, 0], [110.87, 0]], freq: [[98.87, 0.9], [110.87, 0.9]], 'bend1.a': [[98.87, 0.4], [110.87, 0.44]], 'cam.yaw': [[98.87, -0.26], [110.87, 0.26]], 'cam.roll': [[98.87, 0.16], [110.87, -0.16]] },
      gear: [[98.87, 8]] },
    { at: 112.79, from: 108.95, tail: 1, via: 'plain', id: 'rooms.dive', star: { landOn: 122.39, size: [2.6, 4], lead: 1 }, gear: [[112.79, 10.4], [122.39, 16]],   // bars 62-82. The one contrast, opening on the lift at bar 67
      ambient: [[112.79, 0.3], [122.39, 0.3], [124.31, 0.8], [143.03, 0.8], [151.19, 1]] },
    { at: 151.19, from: 146.63, via: 'rise', id: 'dials.rooms', countdown: { L: 173.75, mirror: true },   // bars 83-104. You saw it whole; now you watch it built, locking on chorus 2
      gear: [[151.19, 8], [173.75, 4], [177.59, 8]] },
    { at: 192.95, from: 185.27, via: 'fall', a: 1, id: 'checks.twist',   // bars 105-112. The biggest lift. The spring again, in half the time
      lanes: { scale: [[192.95, 1.5], [199, 0.55, 'hit']], 'swirl.a': [[192.95, 1], [199, 3, 'hit']] },
      gear: [[192.95, 8]] },
    { at: 206.87, via: 'iris', D: 12, id: 'dials.rooms',             // bars 113-121. Inside out on the climax, the dial at its biggest
      lanes: { scale: [[212.5, 1.0], [224.15, 1.7]], rot: [[212.5, 0.3], [224.15, -0.3]] },
      gear: [[206.87, 4], [216.47, 8]], pulse: [[216.47, 1], [220.31, 0.25]] },     // two bars with the beat let go, before the largest drop
    { at: 224.15, from: 217.0, via: 'rise', tail: 1, q: 0.7, id: 'rooms.hall',   // bars 122-. The largest drop. The last chord shuts the hall again and goes in to one stripe
      lanes: { 'f1.d': [[226.07, 0], [229.9, -0.7]], freq: [[226.07, 0.5], [231.83, 0.3]], 'cam.yaw': [[226.07, 0.2], [231.83, 0]], 'cam.roll': [[226.07, -0.1], [231.83, 0]] },
      gear: [[224.15, 32]], pulse: [[224.15, 0.25]] },
  ],
};
