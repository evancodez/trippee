# The engine, as built

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
`stage.go(id, t)`, which takes the picture to a pattern through a solid.

## The app object

`window.app` (see `src/main.js`): `R` (renderer), `stage`, `patterns`, `byId`, `families`, `canvas`, `t`, `paused`, `manual`, `clock`
(when a song plays, a function returning its seconds), `edits` (below), `brush`, `onFrame` (callbacks per frame).

Three modules start themselves: `src/music/song.js`, `src/tools/input.js` and `src/ui/ui.js` each `export function init(app)`.

`app.edits`, read by `frame()` every frame: `journey` (log zoom), `jx jy` (pan, in pattern units), `spin`, `duty` (added to theta),
`over` (path→value, the knobs), `pressX pressY press pressR` (the ball under the sheet), `sheetX sheetY sheetRot sheet` (a lifted copy
XOR-ed on top), `plate`, `invert`. `app.brush` = `{ x, y, r, dx, dy, on, heal }` paints a push for one frame (x, y in 0..1 from bottom left).

## Testing

`http://localhost:5300` is served already. `tools/lab.mjs` drives a real GPU-backed Chrome:

```bash
PATTERN=lattice.master node tools/lab.mjs tests/pattern.mjs --out lab-out/<you>   # one whole gesture, as a contact sheet
node tools/lab.mjs tests/atlas.mjs --out lab-out/<you>                            # all patterns at once
```

Then look at the image with the Read tool. `tools/look.mjs` gives contact sheets, time-slices and measurements; write your own lab
script when you need to. Always use your own `--out lab-out/<you>` folder. Local songs for testing are in `media/` and served at
`/media/ppp.mp3`, `/media/wildflower.mp3`, `/media/disclosure.mp3`, `/media/mgmt.mp3`. Never commit songs or video.
