// Disclosure, by hand: the restless end of the scale. Times, pattern ids and numbers, and nothing else. See docs/DIRECTION.md section 7. Bars are 1-based on A.bars; the comments are for whoever changes it.
// Nobody has heard these. The times come from the bass, loudness and tone per bar. The song is one thing: the bass comes in, the bass goes out, four times.
export default {
  hash: '74d3369b18c08b32b582f783e54cf61a', name: 'disclosure', v: 5,
  line: "One board on a machine. When the bass comes in it's bent round into a dartboard and clicks; when the bass goes out it falls slack and its teeth close, tighter each time. Each time the bass comes back the dartboard holds less well, until it turns inside out into a kaleidoscope. As the song drains it is only a board.",
  shots: [
    { at: 0, id: 'riot.wring',                                          // bars 1-16. No bass. A huge plain board comes down to size as the drums come up, and the wringing starts from nothing
      lanes: { scale: [[0, 3.4], [15.13, 1.7], [28.56, 1.1]], rot: [[0, -0.14], [28.56, 0.1]] },
      moves: [{ id: 'wring', beats: 'half', lead: 0, coast: 1, amp: [[0, 0.05], [15.13, 0.5], [26.77, 1.2]] }],
      gear: [[0, 16]], ambient: [[0, 0.4], [13.34, 0.4], [15.13, 1]] },
    { at: 28.56, from: 24.08, via: 'shock', id: 'riot.ratchet',         // bars 17-33. The bass. The board is bent round, and it clicks, and its eye goes for a walk
      lanes: { 'p1.x': [[30.35, -0.6], [46.92, 0.6], [53.64, 0]], 'p1.y': [[30.35, 0.1], [41.1, -0.2], [53.64, 0]], scale: [[50.05, 1], [57.22, 1.5]] },
      moves: [{ id: 'ratchet', beats: 'half', times: { from: 26.77 } }, { id: 'wring', beats: 'half', coast: 1, times: { from: 44.23 }, amp: [[44.23, 0], [50.05, 0.7]] }] },     // bar 30 gets brighter, and the first wringing comes back on top of the clicks
    { at: 57.22, from: 52.3, via: 'shock', id: 'relay.weave', arcs: [{ path: 'rot', from: -0.3, to: 0.3 }, { path: 'scale', from: 1.5, to: 1.15, log: true }],   // bars 34-42. No bass, bright. It falls slack and comes apart into tiles, one way and another, and ends up diamonds
      moves: [{ id: 'relay', times: { on: [61.25, 66.17] }, leadBars: 1.5, tailBars: 0.75 }],
      gear: [[57.22, 16]], pulse: [[57.22, 0.4]] },
    { at: 71.55, from: 68, id: 'riot.scissor',                          // bars 43-50. The emptiest bars, and then three bars of riser. The diamonds close like lazy tongs: teeth one way, and teeth the other on the bass
      moves: [{ id: 'scissor', beats: 'half', times: { from: 71.55, to: 87.67, teeth: [76.92, 82.29] }, sides: [1, -1], coast: 1 }],
      gear: [[71.55, 8]] },
    { at: 85.88, from: 80.5, q: 1, id: 'riot.ratchet',    // bars 51-66. The bass again, the same dartboard, and this time it's winding round into a pinwheel
      lanes: { 'swirl.log': [[87.67, 0], [96.62, 0.45], [110.95, 0.9]], rot: [[85.88, 0], [112.29, -0.5]] },
      moves: [{ id: 'ratchet', beats: 'half', turn: -1, times: { from: 84.08 } }] },
    { at: 112.29, from: 107.37, via: 'shock', id: 'riot.wring',   // bars 67-76. It falls out again. The first board, wrung as it was, and now columns bunching and thinning through it
      lanes: { scale: [[112.29, 1.4], [128.86, 1.05]] },
      moves: [{ id: 'wring', beats: 'half', coast: 1, times: { from: 112.29 }, amp: [[114.08, 0.2], [121.25, 0.9], [128.86, 0.6]] }, { id: 'bellows', beats: 'half', f: 3.53, times: { from: 114.08 }, amp: [[119.46, 0], [125.28, 0.6]] }],
      gear: [[112.29, 8]] },
    { at: 128.86, from: 125.28, via: 'shock', id: 'riot.scissor',                     // bars 77-82. Nine seconds of no bass getting brighter. Tighter than last time, a stroke every two bars
      moves: [{ id: 'scissor', beats: 'half', times: { from: 128.86, to: 141.4, teeth: [132.44, 136.03, 139.61] }, sides: [-1, 1, -1], coast: 1 }],
      gear: [[128.86, 6]] },
    { at: 139.61, from: 134.23, q: 1, id: 'riot.ratchet',               // bars 83-89. The bass again. For six bars it's what it was, the eye walking back
      lanes: { 'p1.x': [[139.61, 0.45], [145.13, 0]], 'p1.y': [[139.61, -0.2], [145.13, 0]] },
      moves: [{ id: 'ratchet', beats: 'half', times: { from: 137.82, to: 152.14 } }] },
    { at: 150.35, from: 145.3, tail: 0.75, q: 0, id: 'riot.ratchet',    // bars 90-96. Then it won't hold: still clicking, it goes to long arms, then blades, then a dartboard twice as tight, which is what the Iris rolls up. The change into this shot is between two of the same picture, so nobody sees it: it's only here so the bass can land on a glide
      lanes: { scale: [[151.69, 1], [161.1, 1.4]] },
      moves: [{ id: 'relay', seq: { voices: { L: { l1: 1.59 }, S: { t1: 10 }, p: { l1: 3, t1: 8, flow: -0.3 }, s: { t1: 12 }, l: { l1: 3 } }, states: ['LS', 'Sp', 'ps', 'sl', 'lL'] }, times: { on: [152.14, 155.73, 159.31] }, leadBars: 1.2, tailBars: 0.6 },
        { id: 'ratchet', beats: 'half', times: { from: 148.56, to: 155.73 }, coast: 1 }],
      gear: [[150.35, 8]] },
    { at: 168.26, via: 'iris', D: 12, id: 'relay.star', arcs: [{ path: 'fold.rot', from: -0.5, to: 0.5 }, { path: 'scale', from: 1.1, to: 0.95, log: true }],     // bars 99-115. Bar 98 is a hole in the song. Inside out on the far side of it, into what hasn't been seen: the same thing in six mirrors
      moves: [{ id: 'relay', times: { on: [175.43, 182.59, 189.76, 194.24] }, leadBars: 1.6, tailBars: 0.6 }],
      gear: [[168.26, 16]], ambient: [[168.26, 0.6]], pulse: [[168.26, 0.5]] },
    { at: 200.5, from: 196.92, via: 'shock', id: 'riot.ratchet',         // bars 117-121. The band stops for a moment on bar 116. The first dartboard, whipped through as it comes back, the biggest it's been
      arcs: [{ path: 'scale', from: 1.4, to: 3, log: true }],
      moves: [{ id: 'ramp', times: { hit: 200.5 } }, { id: 'ratchet', beats: 'half', rings: 2, spokes: 2, times: { from: 198.71 } }, { id: 'wring', beats: 'half', coast: 1, times: { from: 204.09, to: 209.46 }, amp: [[204.09, 0], [207.67, 0.6]] }] },
    { at: 209.46, from: 204.09, via: 'shock', id: 'riot.wring',         // bars 122-. The bass goes for the last time, and it drains. Only a board, and it opens up till there are a few squares and nothing moves
      lanes: { scale: [[211.76, 1.2], [218.41, 3.4]], rot: [[209.46, 0.1], [218.41, 0]] },
      moves: [{ id: 'wring', beats: 'bar', coast: 1, times: { from: 209.46, to: 216.62 }, amp: [[209.46, 0.5], [216.62, 0]] }],
      gear: [[209.46, 32]], ambient: [[209.46, 0.3]] },
  ],
};
