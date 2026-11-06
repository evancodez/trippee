# The engine, as built

**Patterns transform into each other, never through a solid and never through a flat shape.** In the last `morph` seconds of a gesture
`frame.js` plans one of: `slide` (same kind of pattern: its numbers glide to the next one's), `bend` (flat patterns whose families all
have partners: each line travels to its partner, phase by phase), or `dive` / `rise` (the general case: a flight into one element of the
pattern, found by rendering it small, with the next pattern inside that element; or the reverse). In a flight the two are XOR-ed, so the outer
pattern's edge is only a flip in the inner one's phase, and its element is never a slab of one colour: the inner pattern opens out of a solid
everywhere at once, and by the end the frame is wholly in the element and one pattern is left. While it happens both patterns' clocks
ease to rest, so only the transformation moves. A handover (a song arriving, another take, a seek) only ever flies in, because a film's clock
can't stop for a rise. A slide looks before it leaves: its lines can't stray more than 3 times from the steady path between the two sizes, and
at no point can it be mostly one colour, mostly grey or have a big element in it (`slideStaysBusy`), or it's a flight. Surfaces only slide between
the same surface. A family with a huge duty is a constant (the dots' lift): it stays one through a slide. `tests/pops.mjs` looks for pops and the biggest step in a morph,
`tests/flat.mjs` for large joined areas of one colour with room for a big disc.

**The song acts on the sheet** (`src/score/react.js`, built by the composer, read in `frame()`): flow surges on the beat, lines fatten on
it and the middle swells; the melody travels out through the lines; each chord is three lenses that arrive exactly with it; brightness
moves line density. `edits.reactAmt` scales all of it. A song moves through up to three families, one per kind of section.

`pol0`, `pol1`,
`inDur` and `outDur` below no longer exist. `stage.go`, `stage.snapshot` + `stage.morphFrom`, and `stage.setStatic` are how anything
changes what's showing. Nothing is ever empty: past a surface or matte the same lines carry on flat, turned by `bg.rot` (`bg.on` 1 by
default). Floors (a plane or a slab) can't tip far enough to show their horizon. A gesture only rides the part of its long move that stays bold
(`BOLD` in frame.js; a pattern with `fine: true` is exempt).

**A film is watched for flashes before anyone sees it** (`guardFlashes` in `src/music/rehearse.js`, flag `flashGuard`). The rehearsal's last pass plays the whole film small at 10 fps and counts what `tests/judge.mjs` counts: opposing swings of 10% of full scale, none in a second for the whole frame, two per second per tile. Whatever goes over gets the least it needs, on that one gesture, and each change is kept only if it helps: what flows flows slower (`G.regear(range, arcs, slower)`, or `G.phiScale` on a hero), then the song lifts it less (`G.calm`); a glide becomes a flight (`G.noGlide`); a fall or a shock becomes a plain transformation; a flight turns round, then takes longer. `tests/flash.mjs` says where a film flashes and why, `AT=a-b` gives close frames with their numbers.

The song's rings are per slot (`F_SPARE`.z, .w): a slot that's shut holds none, so what's showing can let go over the very start of a click's flight while what it's flying into stays closed.

**Version 2 adds** the effects bar, static, the hand, colour and pattern music, all below in "The modes".

This overrides section 2 of `DESIGN.md` wherever they differ. The rest of `DESIGN.md` (music, transition grammar, pattern
ideas, tools, acceptance tests) is still the intent, adapted to what's here.

## How a frame is made

`score` + `t` → `src/score/frame.js` writes numbers into the renderer's block → `src/gl/shader.js` draws them.

- **One shader, one signed field, one threshold.** All mixing is on the field, so a grey crossfade can't happen.
- **Pure:** the frame depends only on (score, t, edits). `Math.random` and `Date.now` must not affect the picture. Use `rng(seed)` from `src/score/curves.js`.
- **Ink:** 1 is white, 0 is black. `theta = +solid` is solid black, `theta = -solid` is solid white. Lowering theta from +solid grows white specks on black.
- **Coordinates:** origin at centre, y up, y runs -1..1, x runs -aspect..aspect. Phase is in cycles.

## A pattern is data

A family file `src/pattern/families/<family>.js` default-exports an array of patterns. No GLSL needed:

```js
import { plane, ring, logring, spokes, spiral, triLattice } from '../kit.js';
import { Q } from '../genome.js';

{ id: 'lattice.master',  // family.name
  name: 'Master Lattice', family: 'lattice',
  solid: 2/3,            // theta at which it is fully solid. Default 1. Triangles need 2/3.
  g: {                   // the numbers. Anything unstated takes its default (see DEFAULTS in src/pattern/genome.js)
    fams: triLattice(3, 90),            // up to 4 XOR-ed families
    round: 0,                           // 0 sharp, 1 dots (product of waves). Both reach solid.
    wob: 0.05, wobF: 1.5,               // hand-cut wobble: size in cycles, frequency in frame units. The film's macro shapes need this.
    bend1: { a: 0.1, f: 3, ang: 0 },    // any warp, see below
  },
  flow: { 'f0.ph': 1, 'f1.ph': -1 },    // what advances per cycle of the clock Phi. Integers, so the picture returns to itself.
  arcs: [                               // the long move, ridden once per gesture, eased
    { path: 'scale', from: .25, to: 3.5, log: true },
    { path: 'wobT', from: 0, to: 4 },
    { path: 'swirl.a', from: 0, to: 1.2, at: [.3, .9] },      // at: only during this part of the gesture
  ],
  axes: [ { id: 'k', name: 'lines', path: 'freq', min: .2, max: 6, log: true } ],   // what the knobs panel offers. Paths as below.
  lambda: .08,           // element size in frame widths at scale 1, used to pick a tempo gear
  drive(out, { u, t, phi, OFF }) {},    // optional, for what arcs can't express (e.g. Shepard layering). Pure. Writes into the float array.
}
```

**Every number** is named in `src/pattern/layout.js`. Read it. Families: `f0.x y z ph r1 l1 t1 d r2 l2 t2`. Poles: `p1.x y q ay`
(q: 0 round, 1 square, -1 diamond). `round sum theta invert`. View: `scale rot tx ty`. `freq`, `wob wobF wobT`.

**Warps**, applied in this fixed order after the view: `fold` (n >= 2; change n only while solid), `lens`, `swirl`, `bulge`,
`squeeze`, `bowtie`, `bend1`, `bend2`, `ripple`, `zig`, `teeth`, `conf` (pole garden), `droste`. `sheet` runs before the view.
Amount 0 means skipped.

**Mattes that wrap the pattern:** `ribbon`, `blobs`. **Frame-level matte:** `matte.kind` 1 superellipse, 2 crack. `matte.outside`
says what shows beyond it (0 black, 1 white, 2 the other slot). `G.matte(t, G)` on a gesture returns matte numbers over time.

**Surfaces:** `surf.kind` 0 flat, 1 quadric (`q: Q.plane / Q.sphere(r) / Q.tube(r) / Q.tunnel(r) / Q.saddle(c) / Q.bowl(c)`, and they
interpolate), 2 room. `cam.pitch yaw roll dist`. `surf.map` 0 solid texture, 1 wrap round z (tunnel), 2 Mercator (sphere; lattices stay
conformal), 3 wrap round y (tube). When wrapped, make the around-count a whole number of cycles: x coefficient times `surf.mapR` must be an integer.

On a surface wrapped by angle (`surf.kind` 1 with `surf.map` 1, 2 or 3) the view acts on the camera like a lens, not on the texture, so
`scale`, `rot`, `tx`, `ty`, a film's "turn" and the hand's zoom can't break the whole-number count and open a seam. `freq` only changes
what runs along the surface. Mattes on those patterns stay on the lens with it. Where any surface gets finer than a pixel, its lines close up
into solid black instead of averaging to grey; exact solids aren't affected.

There is no lighting anywhere and there never will be. Depth comes only from how the pattern foreshortens.

## Scores

```js
Score = { gestures: [Gesture], phi: (t, G) => cycles, song, colors }
Gesture = { t0, t1,       // seconds. Gestures run end to end, no gaps.
  pattern,                // a pattern object
  pol0, pol1,             // +1 black solid, -1 white solid, 0 none: the solid it comes out of and lands in
  inDur, outDur,          // seconds of the duty sweep out of and into those solids. It lands exactly at t1.
  arcEnd,                 // when its arcs finish; defaults to t1. Keep fixed if t1 is rewritten.
  period,                 // if set, arcs swing back and forth with this period instead of running once
  arcs, flow,             // optional overrides of the pattern's
  thetaBody,              // optional Track of the threshold during the body (default 0)
  over,                   // { path: value } fixed overrides
  matte, inset,           // optional hard shape over time, and a pattern shown inside it in slot B
}
```

`src/score/frame.js` evaluates this. `src/score/curves.js` has `smoother`, `evalTrack` (C2 quintic tracks) and `rng`.
`src/stage.js` holds the current score: an endless wander with no song, a song's film when given one (`stage.setScore`), and
`stage.go(id, t)`, which takes the picture to a pattern by morphing there.

## The modes

**One shader, built eight ways** (`src/gl/renderer.js`). `#ifdef HAND`, `PLATES` and `FLIGHT` in `shader.js` decide what's in a program, and
`R.draw` picks the smallest one this frame's numbers need (`R.variant`). This matters a lot: a GPU pays for what a program declares on every
pixel, drawn from or not. At 1080p on an M4 the flight branch alone took a plain frame from 60 fps to 24. Anything new and expensive in the
shader goes behind its own `#ifdef`. `R.whenReady()` means the plain and flight programs are built; `R.whenAllReady()` means all eight are,
which is what `trippee.ready` waits for.

**Static** (`stage.setStatic`). `stage.staticG` is a gesture with `freezeU` set; `frame()` shows it instead of the score, whatever the time is.
It still flows, and a song's film carries on underneath it. Its long move runs out over 1.5 s going in, and picks up over 1.5 s coming out (`freezeEase`, `thaw`). `stage.go` while static morphs by handover and stays. Asked for mid-morph, the
morph finishes within 4 seconds first. The hand's zoom and line weight don't ease back in static, even with a song.

**Effects** (`src/tools/effects.js`, `src/ui/effects.js`). `edits.ripples` (up to 8 `{x, y, radius, height}`), `edits.warp` (`{x, y, r, twist, pinch}`)
and `edits.hand` (`{x, y, on, height, curl, spread, turn, size}`). All run through springs and real seconds, so they work while paused, static or
in a song. The hand is applied once, to the coordinates, before the slots, so it survives a morph. It is the same pattern in negative across its whole silhouette, with a hard edge on anything; the outline is smoothed from how close each ray came to it.

**Colour** (`src/beyond/beyond.js`, `app.beyond`). A second plate made from phases already computed, with no family evaluated again. `plate.y` 0
takes the plain path, byte-identical to black and white. The plates open to an eighth of a period at most: a misregistered print, never a poster. It can rest the picture's clock for a few seconds (the quadrature stop), which is only
ever a lag: `edits.beyond.time(t, score)`. **The stage runs on that clock, so anything that plans a change uses `app.pictureT()`, not `app.t`.**
A stop only counts if it starts after colour came on and after this score came up, and turning colour off in a stop waits for the clock to catch up.

**Pattern music** (`src/sound/`, `app.sound`). `read.js` copies the picture down to 64 x 36 through the GPU with no stall, `brain.js` turns a read line
crossing it into notes, `theory.js` keeps one key signature per session with a mode per family, and `synth.js` is the Web Audio graph. It only
reads the picture; it never writes to it. `g` makes the AudioContext, so nothing can sound before that. While it's on, a loaded song is
`app.song.aside`: paused, and the wander takes the screen. `standDown` puts back the latest take and the song's clock, unless it was ejected or ran
out meanwhile. A song that starts playing any other way wins, and the music steps aside.

**Recording** (`src/tools/record.js`). One audio track, mixed from the song and the music as each turns up, so a recording can start before either.

## The app object

`window.app` (see `src/main.js`): `R` (renderer), `stage`, `patterns`, `byId`, `families`, `canvas`, `t`, `pictureT()`, `paused`, `manual`, `clock`
(when a song plays, a function returning its seconds), `edits` (below), `brush`, `onFrame` (callbacks per frame), `song`, `sound`, `beyond`, `hand`, `ui`.

These modules start themselves: `src/music/song.js`, `src/tools/input.js`, `src/ui/ui.js`, `src/beyond/beyond.js` and `src/sound/sound.js` each `export function init(app)`.

`app.edits`, read by `frame()` every frame: `journey` (log zoom), `jx jy` (pan, in pattern units), `spin`, `duty` (added to theta),
`over` (path→value, the knobs), `pressX pressY press pressR` (the ball under the sheet), `sheetX sheetY sheetRot sheet` (a lifted copy
XOR-ed on top), `ripples`, `warp`, `hand`, `staticG`, `beyond`, `plate`, `invert`. `app.brush` = `{ x, y, r, dx, dy, on, heal }` paints a push for one frame (x, y in 0..1 from bottom left).

`app.governor` (`src/gl/governor.js`) lowers `R.drawScale` if the frame rate stays under 55 fps, straight to the tier its measurement says will fit,
and tries going back up after 30 calm seconds. Each program variant remembers its own tier, so a plain picture stays sharp and a flight draws smaller only
while it's flying. `R.draw` then renders to a smaller target and stretches it to fill. `canvas.width` and `canvas.height` never change for this.

## Testing

`http://localhost:5300` is served already. `tools/lab.mjs` drives a real GPU-backed Chrome:

```bash
PATTERN=lattice.master node tools/lab.mjs tests/pattern.mjs --out lab-out/<you>   # one whole gesture, as a contact sheet
node tools/lab.mjs tests/atlas.mjs --out lab-out/<you>                            # all patterns at once
```

Also `tests/v2.mjs` (`STAGE=boot,static,hand,music,clock,film,fps`: the bar and every mode together, with real input), `tests/effects.mjs`, `tests/beyond.mjs`,
`tests/sound.mjs`, `tests/integrate.mjs` (boot, a real song through a real file drop, a recording), `tests/hand.mjs` (every verb), `tests/songend.mjs`,
`tests/pops.mjs` (pops at the ends of morphs), `tests/flat.mjs` (morphs passing through one colour), `tests/fps.mjs`, `tests/governor.mjs` and `tests/film.mjs` (a film in real time, as a sheet). The lab always mutes Chrome.
Then look at the image with the Read tool. `tools/look.mjs` gives contact sheets, time-slices and measurements; write your own lab
script when you need to. Always use your own `--out lab-out/<you>` folder. Local songs for testing are in `media/` and served at
`/media/ppp.mp3`, `/media/wildflower.mp3`, `/media/disclosure.mp3`, `/media/mgmt.mp3`. Never commit songs or video.
