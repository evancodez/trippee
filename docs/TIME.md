# Time and illusion

Tricks with when and how the eye sees. All of it is `src/score/moves/time.js`, `src/score/xform/span.js`, `src/score/time-sheet.js` and `src/gl/chunks/time.js`, with patterns to click in `src/pattern/families/time.js`. `?cut=time` shows them on MGMT and PPP.

**The idea under most of it.** A frame is a pure function of t, so a slit-scan needs no frames kept. "The picture a moment ago" is only some numbers. `time-sheet.js` works out how the camera and each family's phase differ at 48 other moments from what they are now, the song's camera included, and each pixel picks its own moment and reads that table before the gradient, so lines stay exact. One program bit, `TIME`, and it's only built the first time a frame asks. Everything else pays one look at `G.moves` a frame.

By name, in a shot's `moves` (`src/score/cut.js`). A generated film can do the same: `MOVES[id].cue(m, ctx)` and push it on `G.moves`.

| move | what you see | suits | how to call it |
|---|---|---|---|
| `slit` | Each part of the frame sees the sheet at its own moment. Every strong beat runs across as a wave. A big moment or a lane puts it all back in register. | anything that's turning or pushing | `{ id: 'slit', map, D, turn, push, spin, bands, beats: 'strong' }`. map: `sweep` (rolling shutter), `target` (now in the middle), `wave`, `spiral` (`arms`, `wind`), `cells` (`wave` is how many). D: seconds or a lane. Flat sheets only |
| `ghost` | A hand that's only there while it moves: inside it the sheet swings away and comes back through each strong beat, and at rest it's in register and simply isn't there. Both hands on a big moment. | a groove | `{ id: 'ghost', beats: 'strong', turn: .7 }`, `how: 'slide'` for one whole cycle of the lines instead, which a surface always gets |
| `fringe` | A face in the moire of two line sets. It looks about, nods with the tune and its mouth goes with the voice. | a slow intro, a vocal | `{ id: 'fringe', beats: 'strong', amp: lane }` on `time.fringe`. Worn by anything else with two families, a face comes up in how its lines bend |
| `snakes` | Rotating Snakes on any two-family board: a picture that isn't moving drifts, most of all just after the song's camera nudges it. A big moment turns it round. | a quiet verse | `{ id: 'snakes', beats: 'strong', amp: lane }` |
| `ouchi` | A disc comes by turning, floats on a sheet that's all one piece, and a second quarter turn sends it away. | a breakdown | `{ id: 'ouchi', beats: 'strong', on: 8, off: 4 }` on `time.ouchi` |
| `echo` | The sheet XOR-ed with itself a moment ago: a rosette no line draws, that closes up on each surge and opens as the echo catches up. | a chorus | `{ id: 'echo', beats: 'strong', lag: .35, turn: .4 }`. Not on anything with big solid shapes |
| `waterfall` | Dead steady for a long while, then it stops: the still picture swims backward, in the viewer's own eye. No shader. | a chorus into a real stop | `{ id: 'waterfall', times: { stop: 92.5, go: 96.3 } }` on `time.waterfall`. It wants 20 s or more before the stop |
| `rewind` | The picture's clock turns round: what you've just watched un-happens, and it rushes forward to land on the hit with the song. The song's reactions don't go back with it. | the last bars of a build | `{ id: 'rewind', times: { hit: 192.95 }, back: 6, bars: 4 }` on any shot |

And one transformation, `via: 'span'` (`q: 0`, `xform: { ang, wander }`, D as long as a verse): the past on one side of the frame and the future on the other, all the stages of one pattern becoming another at once, sliding by. It can do what a shock can.

A `G.pattern.time` is how a clicked pattern says what it wears. It comes up over a few seconds once the flight in has landed. `G.pattern.arrive` is how a pattern asks for a way of being arrived at.

Tests: `tests/time.mjs` (dense sheets), `tests/timesong.mjs` (big frames of a cut, on the song's numbers), `tests/timecolour.mjs` (colour and a world), `tests/timecost.mjs` (GPU at 1080p), `QUERY='?cut=time' SONGS=mgmt tests/cut.mjs`.
