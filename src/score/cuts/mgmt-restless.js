// MGMT, restless: the same song and the same big moments as its hand cut, and this time the patterns never stop turning into each other. ?cut=restless in the address shows it instead of the other: it's a question for the owner, docs/DIRECTION.md section 7, last line.
// Every shot is a Relay on the song's chords or bar lines. It's still only one way of changing, and it still holds: the verses change every few bars, the choruses every bar or two, and the falls and the Iris are where it's let go.
export default {
  hash: 'b348c58fdc8d0af2d7ecbe0b9d646db9', name: 'mgmt-restless', v: 5,
  line: 'Nothing stays. One pattern closes as the next opens, on the chords, for the whole song, and at each big moment the whole sheet goes with it.',
  shots: [
    { at: 0, id: 'relay.weave', arcs: true,                                             // bars 1-25. Tiles, slowly
      moves: [{ id: 'relay', chords: true, gap: 7, leadBars: 2, tailBars: 1 }],
      gear: [[0, 32], [24.47, 16]], ambient: [[0, 0.3], [11.03, 0.3], [12.95, 1]], pulse: [[0, 0], [11.03, 0], [12.95, 1]] },
    { at: 47.51, from: 39.83, via: 'shock', id: 'relay.whirl',                          // bars 26-42. Winds up on one point: hangs, draws back and whips through bar 36
      arcs: [{ path: 'scale', from: 0.7, to: 2.4, log: true }],
      moves: [{ id: 'relay', from: 4, bars: 4, leadBars: 1.5, tailBars: 0.5 }, { id: 'ramp', times: { hit: 64.31 } }],     // from 4: what's open on the whip winds round the point, so a zoom through it can't flash the frame
      gear: [[47.51, 8], [64.31, 4], [70.07, 8]] },
    { at: 77.75, from: 70.07, via: 'fall', a: 1, id: 'relay.tour', arcs: true,          // bars 43-53. The chorus: every kind of pattern, a change every two bars, and the rest at 92.5 stops it
      moves: [{ id: 'relay', bars: 2, leadBars: 0.75, tailBars: 0.25 }],
      gear: [[77.75, 4], [91.19, 16]] },
    { at: 98.87, from: 96.3, tail: 2, via: 'rise', id: 'relay.floor', arcs: true,       // bars 54-61. Down on the floor, the camera swinging
      moves: [{ id: 'relay', bars: 2, leadBars: 1, tailBars: 0.5 }],
      gear: [[98.87, 8]] },
    { at: 112.79, from: 110, id: 'relay.rooms', arcs: true,                           // bars 62-82. The verse grows: rooms and rays, turning to diamonds behind your back
      moves: [{ id: 'relay', bars: 4, leadBars: 2, tailBars: 1 }],
      gear: [[112.79, 16], [143.03, 8]], ambient: [[112.79, 0.5], [122.39, 0.5], [124.31, 0.9], [143.03, 0.9], [151.19, 1]] },
    { at: 151.19, from: 143.03, via: 'rise', id: 'relay.star', arcs: true,              // bars 83-104. The kaleidoscope, every few bars on the way to bar 105
      moves: [{ id: 'relay', bars: 3, leadBars: 1.5, tailBars: 0.5 }],
      gear: [[151.19, 8], [173.75, 4]] },
    { at: 192.95, from: 185.27, via: 'fall', a: 1, id: 'relay.saw', arcs: true,         // bars 105-112. The biggest lift. Everything with teeth, on the bar
      moves: [{ id: 'relay', bars: 1, leadBars: 0.6, tailBars: 0.25 }],
      gear: [[192.95, 4]] },
    { at: 206.87, via: 'iris', D: 12, id: 'relay.tour', arcs: true,                     // bars 113-121. Inside out on the climax, and the tour again, on the bar
      moves: [{ id: 'relay', bars: 1, leadBars: 0.6, tailBars: 0.25 }],
      gear: [[206.87, 4], [216.47, 8]] },
    { at: 224.15, from: 217, via: 'rise', tail: 1, id: 'rooms.hall',                    // bars 122-. The largest drop. All of it stops, and one hall shuts as the last chord goes
      lanes: { 'f1.d': [[226.07, 0], [229.9, -0.7]], freq: [[226.07, 0.5], [231.83, 0.3]], 'cam.yaw': [[226.07, 0.2], [231.83, 0]], 'cam.roll': [[226.07, -0.1], [231.83, 0]] },
      gear: [[224.15, 32]] },
  ],
};
