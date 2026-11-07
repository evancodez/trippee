# Following the song

**The picture now follows the song hard, and it's on by default.** Press `h` while a song plays to compare: the song goes on, and over a second the film goes back to how it was. Press it again and it all comes back.

Best places to see it:

- **Disclosure, 1:20 to 1:30.** The wind-up, then the drop at 1:26: the sheet draws in, lets go on the hit, and every strong beat after it pumps. Press `h` during it.
- **MGMT, from the start, then 1:17.** Watch the strong beats (1 and 3), then the big hit.
- **PPP, 0:25 and 2:17.** The biggest entrances. Quiet stretches lean on the tune instead of the beat.
- **Wildflower, 0:12 onward.** The chill end: a gentler stride, with the tune lifting and sinking the sheet.

**Tell me what you want with the song panel's sliders (`s`).** Pulse, melody and tone each go from 0 (that part's gone) to 2 (plainly a lot). They're remembered. If you find a setting you like, just tell me the three numbers.

`?hear=0` in the address starts without it. `H` (shift) hides the interface now, and so does `h` with no song on.

Nobody working on this can hear the songs, so all of this has been seen in numbers and frames and never with the music. Whether it feels musical is yours to say. Tell me if anything's ever a jolt.

---

## What it does, for whoever works on it next

All of it is `src/score/hear.js`: a layer over the film, on the song's own seconds, worked out once when the film's composed. It works on the whole sheet, as a camera and a few lenses in front of everything (`FRAME.hear`, `src/gl/chunks/main.js`), so it goes on answering through every transformation, hero and world. With `edits.hear` at 0 it writes nothing, and the film is the film it always was. A rehearsal looks at the film without it (`FILM_ONLY` in `src/music/rehearse.js`).

| What | Where you see it |
|---|---|
| Strong beats, chosen per section (`react.js`, `ears[1]`) | The sheet falls into each and pushes toward you, blooms from the middle, and a ring runs out. The flow walks to them. Gentler on a soft song, never none |
| The tune, as you hear it | High notes lift the sheet and low ones sink it. A note that jumps starts a bulge at its pitch, walking along a stave. In quiet stretches the tune leads |
| Tone | A brighter sound leans the sheet, tightens the bloom and fines the lines. A dark one spreads them |
| Moments (`momentsOf`): jumps, section edges, arrivals, stops, landings, big chords, fills | Each gets an answer whether or not the pattern changes. A build winds up (the camera draws back, the middle pinches, the flow slows) and the arrival lets go. A fall recedes. A rest holds completely still and lands as you hear it |
| The song's shape | Sections go by their rank and how many times they've come, so a chorus coming back is bigger |
| Loudness | Bigger answers, a sway that picks up speed, and a faster flow. `G.hearRate` is set when a film's composed, so `h` leaves it alone: flipping it would sweep a gesture's whole phase |
| Heroes | They can step the song down only to `HEAR_FLOOR` (.9) while this is up |

To measure it: `tests/answer.mjs` (how much answers, in real pixels, on any build) and `tests/hearkey.mjs` (the key, real time, recording, sliders, cuts, colour, a world).

The numbered changes in docs/MODES.md section 6 that aren't part of this stay behind their own flags, and they do change how a film's composed: `?hear=5`, `?hear=6,9`, `?hear=all`.

| Number | What it does |
|---|---|
| 5 | A broad bump under the sheet moves with the bass notes |
| 6 | Rings speed up on their way in and implode on the hit. (The layer has this on anyway.) |
| 7 | On a check, one direction steps on the strong beats while the other pours with the tune. Only the checks half is built |
| 9 | Whitney bars: rays on one bar line, a dartboard on the next. Once or twice a song |
| 11 | The flow turns round for a moment on the song's rarest chord |
| morph | Transformations walk too |
