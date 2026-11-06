# trippee: the design

This is the build document. A team builds from it with no other briefing. Where it gives a number, use that number until
a test in section 8 says otherwise. `docs/STUDY.md` holds the measurements of the reference film and is assumed reading.

Status of the numbers: the coverage, XOR, slew and gear formulas below were checked by brute force in node. Nothing here
has yet run on a GPU, so all timings are estimates until `T.metrics()` measures them.

---

## 1. The core idea

Every frame is one decision per pixel: is this point of a scalar field above a level? Every pattern is a point in one
continuous space of such fields, and every change happens inside the field, before the decision, so a grey crossfade
cannot occur and one pattern can only become another by lines shrinking, splitting, merging or swelling. Because the app
has heard the whole song before it draws, the song is treated as a place rather than a signal: each pixel reads the score
at its own moment. A change starts early at the frame's edges and converges to land on the exact frame of the downbeat.
Rings carry the last few seconds of loudness in their weight. A chorus waits on the horizon before you reach it. Nothing
ever pulses. The hand works on the same field: move one sheet of lines by one pixel and a fringe runs a hundred pixels,
then drop a song on what you made and it becomes that song's film.

**What makes this new rather than a better old app:**

1. **The song is in the space, not just the clock.** Old: `param = f(audio(t))`. New: `pixel = f(score(t + s(x,y)))`.
2. **Moiré is an instrument in the hand.** It is the main tool, not a side effect of fine lines.
3. **A picture your eye finishes.** Colour separates out of 1-bit by misregistration, so zero offset is exactly the
   black-and-white film. The Hold stops the frame on a musical rest while it still pours backward in your eyes.

**The look comes first.** The contact sheets show the film's strength: bold half-and-half shapes, one idea per gesture,
hairlines only as a passage. Any feature that pulls the picture toward thin lines, maths-poster ornament or several things
moving at once is wrong even if it is clever.

---

## 2. Architecture

### 2.1 Modules

Plain HTML, ES modules, WebGL2. No build step and no runtime dependencies. One owner per file. Every path is relative to
the repo root.

| File | Single job |
|---|---|
| `index.html`, `style.css` | Page shell: one `<canvas id="c">`, one `<div id="ui">`. |
| `src/main.js` | Boot order only. Wires modules together. No logic. |
| `src/version.js` | `export const VERSION = 'v1'`. |
| `src/api.js` | Builds `window.trippee`. Calls other modules, owns nothing. |
| `src/core/types.js` | JSDoc typedefs from 2.5, and the constants `N_FAM=5, N_POLE=4, N_SLOT=2, N_PLATE=3`. |
| `src/core/genome.js` | Defaults, clone, validate, `lerpGenome`, `alignFamilies`, encode/decode. |
| `src/core/curves.js` | `land()` quintic, `Track` evaluation, binary-search lookups. Pure maths. |
| `src/core/rng.js` | Seeded hash and stream. `Math.random` is banned everywhere. |
| `src/core/fieldjs.js` | JS twin of the unwarped field: white-fraction tables, `thetaSolid`, speed bound, crest solver. |
| `src/core/frame.js` | `frame(score, edits, t)` returns `FrameState`. Pure. |
| `src/transitions/<kind>.js` | One file per transition kind. `apply(tr, t, state)`. Pure. |
| `src/engine/gl.js` | Context, extensions, FBOs, UBO helpers, parallel compile and polling. |
| `src/engine/shader.js` | Assembles the fragment source from `src/glsl/*` and every registered chunk. |
| `src/engine/pack.js` | `FrameState` into the UBO `Float32Array`. The only file that knows std140 offsets. |
| `src/engine/renderer.js` | Render graph: BrushPass, InkPass, DisplayPass, tier viewport, capture. |
| `src/engine/governor.js` | Chooses the resolution tier from frame timing. |
| `src/engine/metrics.js` | GPU timer, frame stats, on-demand readback for white, chroma, edges. |
| `src/glsl/prelude.glsl.js` | Constants, helpers, UBO declaration, globals. |
| `src/glsl/field.glsl.js` | Poles, families, `inkBand`, `inkSoft`. |
| `src/glsl/surface.glsl.js` | Rays, quadric hit, flat surface. |
| `src/glsl/main.glsl.js` | Ink pass `main()`: local time, slots, matte, plates. |
| `src/glsl/display.glsl.js` | Display pass: re-sharpen and inks. |
| `src/patterns/manifest.js` | Fixed list of pattern and scene files. Written once at Stage 1 (section 9). |
| `src/patterns/kit.js` | `plane, ring, logring, spokes, spiral, triLattice, pole, G`. |
| `src/patterns/<family>/<name>.js` | One pattern. See 2.7. |
| `src/scenes/<name>.js` | One scene. |
| `src/chunks/manifest.js` | Fixed list of GLSL chunks with their bank order. Written once at Stage 1. |
| `src/chunks/warp/<id>.js` | One warp. |
| `src/chunks/matte/<id>.js` | One matte. |
| `src/chunks/surface/<id>.js` | One surface. |
| `src/chunks/phase/<id>.js`, `src/chunks/field/<id>.js` | One phase term, or one non-family field. |
| `src/music/dsp.js` | FFT, Hann, spectrogram, median-filter HPSS, chroma. Ported from the old `src/listen.js`. |
| `src/music/melody.js` | Salience and 20-cent Viterbi melody. Ported. |
| `src/music/clock.js` | Tempogram, beats, downbeats, phrase length, `tau(t)`. New. |
| `src/music/structure.js` | Beat features, novelty, recurrence, Smith-Waterman, labels, `canon`. New. |
| `src/music/analyse.js` | Runs the above in order. Returns `Analysis`. No DOM. |
| `src/music/analyse.worker.js` | Worker entry. |
| `src/music/player.js` | Decode, resample, playback, output clock. |
| `src/music/cache.js` | IndexedDB cache of `Analysis` and baked score, keyed by SHA-256 of the file. |
| `src/score/cues.js` | Family ladders and cue table. Data. |
| `src/score/landings.js` | Landing DP and landing kinds. |
| `src/score/gears.js` | Symmetry clock: gears, shifts, closed-form `Phi(tau)`. |
| `src/score/gesture.js` | Backward solve of one gesture. |
| `src/score/compose.js` | `compose(analysis, seed, patch)` returns `Score`. Pure. |
| `src/score/bake.js` | Writes the score texture, closes the white-fraction loop. |
| `src/score/audit.js` | Luminance slew and flash audit. |
| `src/tools/input.js` | Pointer, wheel and key events into verb calls. |
| `src/tools/verbs.js` | Press, Push, Journey, Duty, Pole, Sheet. Appends to the edit log. |
| `src/tools/detents.js` | Rational-ratio magnets for Sheet. |
| `src/tools/edits.js` | Edit log, closed-form overlay used by `frame()`, undo. |
| `src/tools/patch.js` | Save, load, link encoding. |
| `src/ui/*.js` | Library, Knobs, Song strip, First run, hint line, cursor. |
| `tests/*.mjs`, `tests/lib/*` | Acceptance scripts run through `tools/lab.mjs`. |
| `tools/check.mjs` | Runs every test for a version and prints pass or fail. |

`tools/lab.mjs`, `tools/look.mjs` and `tools/serve.mjs` exist already and are not changed. Songs for tests are the local
symlinks in `media/` (gitignored), served at `/media/*.mp3`.

### 2.2 Render graph

```
frame(score, edits, t)  [JS, pure]  ->  FrameState  ->  pack  ->  UBOs (about 2.5 kB)
   |
   |- BrushPass    only on frames with new stamps. Gaussian stamps added into Psi (RG16F, 512x320). No feedback.
   |- InkPass      fullscreen triangle into Ink (RGBA8, allocated at full size, tier = viewport sub-rect).
   |               R, G, B = coverage of plates 0, 1, 2. In pure mode G = B = R and only R is computed.
   `- DisplayPass  Ink into canvas at native pixels: re-sharpen, then inks.
```

There are no other render targets. The canvas size never changes for tier changes, so a recording never sees a resize.

Context: `getContext('webgl2', {alpha:false, antialias:false, depth:false, stencil:false, powerPreference:'high-performance', preserveDrawingBuffer:false})`.
Drawing buffer size comes from a `ResizeObserver` on `device-pixel-content-box`, so one canvas pixel is one device pixel.
Macs in scaled display modes resample the canvas whatever we do, which is why Stage 0 includes looking at the real panel.

### 2.3 Units

- **Frame coordinates `p`:** origin at centre, y up, `p.y` in [-1, 1], `p.x` in [-a, a] with `a = W/H`. The frame is 2 units
  high. `pxUnit = H/2` device pixels per unit.
- **Phase:** cycles. 1.0 is one full period. Radians never appear in pattern data.
- **`g`:** cycles per device pixel, `|∇φ|` in device pixels. Period in pixels is `1/g`.
- **Speed:** quoted as % of frame width per second, as in STUDY.md.
- **Time:** `t` in seconds of song. `tau` in beats. `Phi` in cycles.
- **Ink:** 1 is white, 0 is black.

### 2.4 The field

For each slot:

```
q  = camera2D(p)                         pan, zoom, rotate the whole frame
X  = surface(q)                          (q,0) when flat; a ray hit otherwise
X  = bank0(X)                            frame-space warps, fixed order
Y  = s * R(r) * (X - o)                  lattice transform
Y  = bank1(Y)                            lattice-space warps, fixed order

sm_i = c_i·Y + Σ_j( rho_ij*ρ_j + ln_ij*lnρ_j ) + ph_i + flowL_i*Phi_L + bend_i*m_L + wob_i·N + pt_i*phaseTerm(Y)
φ_i  = sm_i + Σ_j n_ij*Θ_j               Θ_j in cycles, n_ij integers
d_i' = d_i + dE_i*(E_L - 0.5)            per-pixel duty
a_i  = wave(φ_i) - d_i'
ink  = f > θ                             f is built from the a_i, see below
```

Where `ρ_j = ‖M_j(Y - P_j)‖_q`, `Θ_j = atan2(v_j)/2π`, and `N` is two slow noises.

`f` has three forms, chosen per slot by uniforms:

- **Band path** (`round = 0, sum = 0`): `f = sign(Π a_i) * min |a_i|`, with `wave = tri`. This is the default and the sharpest.
- **Soft path** (`round > 0` or `sum > 0` or a level-set morph): `f = mix( mix(s*min|a_i|, Π a_i, round), Σamp_i a_i/Σamp_i, sum )`,
  with `wave = mix(tri, -cos(2πφ), round)`.
- **Field plugin** (V3 heroes only): `f` comes from a chunk.

`θ` is `mix(θ_slow, pol*θ_solid, T_L)`. `T_L` is the transition envelope read at this pixel's own moment (2.6).

`θ = +θ_solid` is solid black. `θ = -θ_solid` is solid white. `θ_solid` is 1 for one or two families, sharp or round, and 2/3
for the triangle tile. Do not hard-code it: `fieldjs.thetaSolid(genome)` measures it.

**Coverage facts to rely on (checked numerically, θ: white):**

| θ | .9 | .75 | .5 | .25 | .1 | 0 | -.25 | -.5 | -.75 | -.9 |
|---|---|---|---|---|---|---|---|---|---|---|
| Stripes | .05 | .125 | .25 | .375 | .45 | .5 | .625 | .75 | .875 | .95 |
| Checker, sharp, `(1-θ)²/2` | .005 | .03 | .125 | .28 | .405 | .5 | .72 | .875 | .97 | .995 |
| Triangle tile, sharp | 0 | 0 | .03 | .2 | .37 | .5 | .8 | .97 | 1 | 1 |
| Dots, round N=2 | .035 | .09 | .18 | .30 | .41 | .5 | .70 | .82 | .91 | .965 |

XOR with any 50% family stays 50% white, so the film's median balance comes for free.

**Triangle rule.** Three plane families with `c1+c2+c3 = 0`: with the `tri` wave they concur into triangles when
`ph1+ph2+ph3 ≡ 1/4 (mod 1/2)`, and form kagome (trihexagons) when the sum `≡ 0 (mod 1/2)`. Sliding one phase morphs between them.

### 2.5 Data model

```js
/** One family of lines. All coefficients in cycles. */
Family = {
  c: [cx, cy, cz],        // plane coefficient per unit of Y
  rho: [r0, r1, r2, r3],  // per-pole coefficient on ρ_j
  ln:  [l0, l1, l2, l3],  // per-pole coefficient on ln ρ_j
  th:  [n0, n1, n2, n3],  // per-pole coefficient on Θ_j. Integers. Change only while the family is closed or the frame is solid.
  ph: 0,      // phase offset
  d: 0,       // duty offset in [-1, 1]. ±1 = closed: this family draws nothing and leaves the metric.
  flow: 0,    // integer. Cycles per unit of the slot's clock Phi. Applied in JS into ph.
  flowL: 0,   // integer. Cycles per unit of the per-pixel clock Phi_L. Used by emission only.
  bend: 0,    // cycles per semitone of per-pixel melody
  dE: 0,      // duty change per unit of per-pixel loudness, |dE| <= .6
  wob: [0,0], // hand-cut weight on the slot's two noises, cycles. .03 to .06 at macro scale.
  slip: 0,    // cycles of phase jump, alternating per slip cell. Applied after gradients.
  amp: 1,     // weight in the sum path
  pt: 0,      // weight of the slot's phase term
  pair: -1    // index of a later family this one forms a sheet pair with, or -1. See 2.6.
}

Pole = { x, y, q: 2, m: [1,0,0,1] }   // q in [1, 32]; q >= 32 means L-infinity exactly. m is a 2x2 matrix.

Genome = {
  v: 1,
  fams: [Family],               // 0 to 5
  poles: [Pole],                // 0 to 4
  theta: 0,                     // slow threshold
  invert: 0,
  round: 0, sum: 0,             // 0 to 1
  lat: { s: 1, r: 0, ox: 0, oy: 0 },
  warps: { [id]: { a:[x,y,z,w], b:[x,y,z,w] } },   // absent = identity. a.w is the amount; a.w = 0 is skipped.
  slipGrid: { c: 0, e: 0 },     // slip cell = floor(c*Y.x + e)
  noise: { f: 3, rate: .2, seed: 0 },   // hand-cut noise frequency in frame units, time rate
  phase: { id: null, a:[0,0,0,0], b:[0,0,0,0] },
  surface: { id: 'flat', a:[0,0,0,0], b:[0,0,0,0], Q: null, voidInk: 0 },   // voidInk: colour beyond a silhouette
  field: null                   // { id, a, b } for field plugins only
}

Pattern = {                     // default export of src/patterns/<family>/<name>.js
  id: 'lattice.master', name: 'Master Lattice', family: 'lattice', ver: 1,
  genome: Genome,
  axes: [ { id, name, path, min, max, log:false, step:0 } ],  // what the Knobs panel shows; path like 'fams.1.d'
  arcs: [ { path, from, to } ],    // the long move this pattern is best at; the composer rides these
  clock: { flowVector: [1,-1,0], period: 1 },   // integer flows on Phi; frame(Phi+period) = frame(Phi)
  lambda: g => number,             // optional. Element size in frame widths, used by gears. Default: 1/(largest |c| * s * 2a).
  channels: ['flow'],              // music channels this pattern can carry, see 3.3
  heavy: false
}

Scene = {                       // default export of src/scenes/<name>.js, or built by the composer
  id: 'scene.twin-planets', name,
  a: { pattern: id, over: PartialGenome },
  b: null | { pattern: id, over: PartialGenome },
  matte: null | { id, a, b, mode: 'void'|'reveal'|'xor'|'over', voidInk: 0 },
                                // void: outside is slot A, inside is solid. reveal: inside is slot B. xor: toggles.
                                // over: slot B is drawn where its own surface silhouette g_cover > 0. No matte id needed.
  cam: { zoom:1, r:0, pan:[0,0], pos:[0,0,3], rot:[0,0,0], f:1 },
  route: Route
}

Route = { lnS:[from,to], rot:[from,to], focus:'crest'|'centre'|'pole0', cam:Track, arcs:[{path,from,to}] }

Transition = {
  kind: 'duty'|'sliver'|'scale'|'lerp'|'reconnect'|'levelset'|'tune'|'void'|'crack'|'front',
  t0, t1,        // seconds; the span in which it acts
  land,          // the exact second it lands. Solid reached, or last old pixel gone.
  pol: 1|-1|0,   // +1 black solid, -1 white solid, 0 no solid
  from, to,      // scene or genome references
  params: {}     // per kind, see section 4
}

Gesture = {
  t0, t1, label, visit, cue, rung,
  scene: Scene,
  steps: [ { t0, t1, to: PartialGenome } ],    // continuous morphs inside the gesture, on phrase starts
  tracks: { thetaSlow: Track, lnS: Track, rot: Track, cam: Track, plates: Track, poses: Track },
  flow: [ { tau0, tau1, N0, N1, Phi0 } ],      // closed-form Phi(tau), see 3.2
  exit: Transition
}
Track = [ { t, x, v } ]   // quintic between knots, zero acceleration at knots, so C2 everywhere

Score = {
  seed, songHash, duration, family,
  analysis,               // reference
  gestures: [Gesture], transitions: [Transition], landings: [Landing],
  tex: Float32Array,      // 4096 x H, RGBA32F, 60 texels per second: T, Phi_L, m, E. Whole song, never slides.
                          // Phi_L runs unbroken through the song, under 2000 cycles, so 32-bit precision is about .0001 cycle.
  hz: 60
}

Edits = {
  stamps: [ { t, x, y, dx, dy, r } ],      // Push
  decayTau: 20,                            // Memory knob, seconds; Infinity = permanent
  press: Sampled, journey: Sampled, duty: Sampled, tilt: Sampled,   // spring outputs sampled at 60 Hz as recorded
  poles: [ { t0, t1, x, y, rate } ], sheet: Sampled
}
```

`FrameState` is what `frame()` returns and `pack.js` consumes: resolved `slots[2]` (genomes with phases and all arcs applied),
`thetaSlow[2]`, `thetaEnd[2]` (`pol*θ_solid` per slot), `scoreNow` (the four row values at `t`), `local` (2.6), `tSwap`,
`levelset`, `matte`, `cam`, `plates[3]`, `inks[3]`, `tier`, `pure`.

**Lerp rules for `lerpGenome(a, b, t)`:** numbers lerp. `th`, `pair`, `surface.id`, `phase.id` and warp `n` do not lerp: they
may differ only if the transition passes through a solid, and they switch at the swap. A warp present on one side only lerps
from `a.w = 0`. `alignFamilies(a, b)` picks the family assignment minimising total coefficient distance before any lerp.

**Purity.** `frame()` takes no clock, has no accumulators, and uses no `Math.random` or `Date.now`. Seek is O(log gestures).
Only Push holds GPU state, and it is closed form: `ψ(x,t) = exp(-(t-t_ref)/decayTau) * Ψ(x)`, where stamps are written
weighted by `exp((t_s-t_ref)/decayTau)`. There is no feedback pass. On a backward seek, clear `Ψ` and replay the stamps.

### 2.6 The shader

One program for ink, one for display. Both compile once, at boot.

**UBOs (std140).** `pack.js` owns the offsets.

```glsl
struct Fam  { vec4 c;   /* cx,cy,cz,ph */  vec4 rho; vec4 ln; vec4 th;
              vec4 m0;  /* d, flowL, bend, dE */  vec4 m1;  /* wob0, wob1, slip, amp */
              vec4 m2;  /* partner index or -1, pt, 1 if an earlier family names this one, 0 */ };
struct Pole { vec4 pos; /* x,y,q,0 */  vec4 m; };
struct Warp { vec4 a; vec4 b; };
struct Slot {
  Fam fam[5]; Pole pole[4]; Warp w[N_WARPS];
  vec4 lat;  /* s*cos r, s*sin r, ox, oy */    vec4 misc; /* nf, npole, round, sum */
  vec4 th;   /* thetaSlow, thetaEnd, invert, s */
  vec4 grid; /* slip c, slip e, noise f, noise t */
  vec4 surf; /* surface id, voidInk, phase id, field id */
  vec4 surfA, surfB, phA, phB; vec4 Q[4];
};
layout(std140) uniform Slots { Slot uS[2]; };
layout(std140) uniform Frame {
  vec4 uRes;     // inkW, inkH, aspect, pxUnit
  vec4 uCam;     // zoom*cos r, zoom*sin r, panX, panY
  vec4 uCamPos;  vec4 uCamRot[3];   // ray camera; uCamPos.w = focal
  vec4 uNow;     // T, Phi_L, m, E at t (used when local time is off)
  vec4 uLT0;     // constant s, radial gain, depth gain, on (0|1)
  vec4 uLT1;     // centre x, y, metric q, Rmax
  vec4 uLT2;     // tilt x, y (s per unit), contour gain, hash gain
  vec4 uLT3;     // T is local (0|1), score length in texels, 0, 0
  vec4 uFront;   // t (score seconds), tSwap, levelset T, slots in use (1|2)
  vec4 uMatte;   // matte id, mode, voidInk, 0
  vec4 uMatteA;  vec4 uMatteB;
  vec4 uPlate[3];   // shift x, shift y (device px), spin (px per unit), phase reg (cycles)
  vec4 uPlate2[3];  // time offset (s), duty offset, 0, 0
  vec4 uMode;       // plates in use (1|2|3), 0, 0, 0
};
uniform highp sampler2D uScore;   // RGBA32F, NEAREST, read with texelFetch
uniform sampler2D uPsi;           // RG16F, LINEAR
```

The display pass uses plain uniforms: `uInk`, `uTier`, `uPure`, `uI[3]`.

**Prelude helpers available to every chunk:**

```glsl
const float TAU=6.283185307, PI=3.141592654;
float tri(float x){ return 1.-4.*abs(fract(x)-.5); }
float triD(float x){ return fract(x)<.5 ? 4. : -4.; }
mat2  rot2(float a){ float c=cos(a), s=sin(a); return mat2(c,s,-s,c); }
float hash21(vec2 p);                 // stable, no sin
float n2(vec2 p, float t);            // value noise, C2 quintic, range [-1,1]
vec2  cmul(vec2 a, vec2 b), cdiv(vec2 a, vec2 b), cexp(vec2 z), clog(vec2 z);   // clog imag part in (-PI, PI]
int   gK;                             // the slot being evaluated
vec2  polePos(int j);                 // uS[gK].pole[j].pos.xy
float g_conf;                         // a conformal warp sets this to |w'|. Reset to -1 for each slot.
float g_cover;                        // a surface sets this: > 0 on the surface. Reset to 1 for each slot.
bool  g_hasJ; vec3 g_dX, g_dY;        // a surface may supply exact d(X)/dx and d(X)/dy per device pixel.
```

**Coverage: this is the heart of the look.** Width never comes from a finite difference of the wave. It comes from the
phase gradient. In the band path the pixel integral is exact.

```glsl
// Exact box filter of a periodic band. The band is centred on fract(x)=.5 and fills fraction h of the cycle.
// g = cycles per device pixel.
float bandI(float x,float h){ float f=floor(x); return f*h+clamp(x-f-.5+.5*h,0.,h); }
float band(float x,float h,float g){ return clamp((bandI(x+.5*g,h)-bandI(x-.5*g,h))/g,0.,1.); }
```

This one function gives a one-pixel ramp at period >= 4 px, hairlines that fade by true area rather than twinkling, exact
solids with no overshoot (`h=0` is exactly 0, `h=1` is exactly 1), and a clean limit at the true duty below Nyquist. It has
no cusp problem because it never looks at the derivative of `tri`.

```glsl
struct FS { float phi[5]; vec2 grad[5]; float g[5]; float d[5]; };
FS gS[2];

// th: per-pixel threshold. D: plate shift in device px at this pixel. reg: plate phase reg.
float inkBand(int K, float th, vec2 D, float reg, float dd){
  float T=abs(th), P=1., Q=1.;
  int nf=int(uS[K].misc.x);
  for(int i=0;i<5;i++){
    if(i>=nf) break;
    if(uS[K].fam[i].m2.z>.5) continue;                 // handled by the family that names it
    float d=gS[K].d[i]+dd;
    float t=T*(1.-smoothstep(.85,1.,abs(d)));          // a closed family leaves the metric
    float x=gS[K].phi[i]+dot(gS[K].grad[i],D)+reg;
    float p,n; int j=int(uS[K].fam[i].m2.x);
    if(j>=0){                                          // sheet pair: exact XOR of near-parallel gratings
      float xj=gS[K].phi[j]+dot(gS[K].grad[j],D)+reg;
      float S=x+xj, Dl=xj-x, h=2.*abs(Dl-round(Dl)), L=1.-2.*h+d;
      float gs=max(length(gS[K].grad[i]+gS[K].grad[j]),1e-5);
      p=band(S+.5, clamp(.5*(1.+L-t),0.,1.), gs);
      n=band(S,    clamp(.5*(1.-L-t),0.,1.), gs);
    } else {
      float g=gS[K].g[i];
      p=band(x,    clamp(.5*(1.-t-d),0.,1.), g);       // tri(x)-d >  t
      n=band(x+.5, clamp(.5*(1.-t+d),0.,1.), g);       // tri(x)-d < -t
    }
    P*=p+n; Q*=p-n;
  }
  float ink = th>=0. ? .5*(P+Q) : 1.-.5*(P-Q);
  return uS[K].th.z>.5 ? 1.-ink : ink;
}
```

- `P` and `Q` are the probability forms of "no family in its band" and parity. With independent per-family coverage they
  equal the true `f > θ` to within .005 mean per pixel, checked by brute force, and are continuous at `θ = 0`.
- **Why sheet pairs exist.** XOR of two gratings computed independently leaves a grey line (.5) on every edge when the sheets
  coincide, so a moiré can never tune to solid. The pair form replaces them with one grating at `φi+φj` whose duty is
  `2|Δ|`. Identical sheets give exactly solid white, half-cycle sheets exactly solid black, and brute force agrees to .001.
  Use a pair whenever two families are within 30% in frequency and 20° in direction. Pairs work in the band path only; `compose.js` and `G()` reject a pair with `round` or `sum` above 0.

```glsl
// Soft path: analytic gradient of f. Used for dots, reconnection and level-set morphs.
void softF(int K, vec2 D, float reg, float dd, out float f, out vec2 gf){
  float rnd=uS[K].misc.z, sm=uS[K].misc.w;
  float mn=9., sg=1., pr=1., su=0., am=0.; vec2 gm=vec2(0), gp=vec2(0), gs=vec2(0);
  for each family i < nf {
    float x=phi+dot(grad,D)+reg, d=gS[K].d[i]+dd;
    float a=mix(tri(x),-cos(TAU*x),rnd)-d;
    vec2 da=mix(triD(x),TAU*sin(TAU*x),rnd)*grad;
    float off=smoothstep(.85,1.,abs(d));
    float sa=a<0.?-1.:1.;
    sg*=sa;
    if(abs(a)+2.*off<mn){ mn=abs(a)+2.*off; gm=sa*da*(1.-off); }
    float a2=mix(a,sa,off); vec2 da2=da*(1.-off);
    gp=gp*a2+pr*da2; pr*=a2;
    su+=amp*a; gs+=amp*da; am+=amp;
  }
  f =mix(mix(sg*mn,pr,rnd),su/am,sm);
  gf=mix(mix(sg*gm,gp,rnd),gs/am,sm);
}
float inkSoft(int K, float f, vec2 gf, float th){
  float g1,g2;                                       // the two largest g among open families; g2=g1 if only one
  float H=19.74*g1*g1*max(uS[K].misc.z,uS[K].misc.w);// 2π²g²: curvature floor, stops the ramp collapsing at a crest
  float w=sqrt(dot(gf,gf)+H*H);
  float c=clamp(.5+(f-th)/w,0.,1.);
  float A=(1.-abs(th))/(6.283*g1*g2);                // element area in px²
  float gain=clamp(A/.5,0.,1.);                      // a vanishing speck keeps true area, and is exactly gone at |θ|=1
  c = th>=0. ? c*gain : 1.-(1.-c)*gain;
  c = mix(c, .5*(1.-th), smoothstep(.22,.45,g1));    // below Nyquist, true duty
  return uS[K].th.z>.5 ? 1.-c : c;
}
```

**Ink pass `main()`:**

```glsl
vec4 scoreAt(float t){
  float x=clamp(t*60.,0.,uLT3.y-1.001); int i=int(x);
  vec4 a=texelFetch(uScore,ivec2(i%4096,i/4096),0), b=texelFetch(uScore,ivec2((i+1)%4096,(i+1)/4096),0);
  return mix(a,b,x-float(i));
}
void main(){
  vec2 p=(gl_FragCoord.xy-.5*uRes.xy)/uRes.w;
  float t=uFront.x, tL=t; vec4 S=uNow;
  if(uLT0.w>.5){ tL+=sField(p); S=scoreAt(tL); }      // sField: uLT0.x + uLT0.y*R(p) + uLT0.z*depth(p) + dot(uLT2.xy,p)
  bool frontOn = uLT0.w>.5 && uLT3.x>.5;              // E, m and Phi_L can be local while the envelope T stays global
  float tT = frontOn ? tL : t;

  prepareSlot(0,p,S);                                 // surface, warps, lattice, Jacobian, poles, noise, families
  if(uFront.w>1.5) prepareSlot(1,p,S);

  for each plate k < uMode.x {
    float Tk = uPlate2[k].x!=0. ? scoreAt(tT-uPlate2[k].x).x : (frontOn ? S.x : uNow.x);
    vec2  D  = uPlate[k].xy + uPlate[k].z*vec2(-p.y,p.x);
    float reg= uPlate[k].w, dd=uPlate2[k].y;
    a = inkOf(0, mix(uS[0].th.x,uS[0].th.y,Tk), D, reg, dd);
    b = uFront.w>1.5 ? inkOf(1, mix(uS[1].th.x,uS[1].th.y,Tk), D, reg, dd) : a;
    c = tT<uFront.y ? a : b;                          // the per-pixel swap, always under a solid wall
    c = applyMatte(c, ...);                           // matte coverage from its own gradient, composed last
    out[k]=c;
  }
  frag = vec4(out0, plates>1?out1:out0, plates>2?out2:out0, 1.);
}
```

`inkOf` picks band or soft by uniform. Level-set morph (uniform `uFront.z`) computes `softF` on both slots, mixes `f` and `gf`, then
calls `inkSoft` once.

**`prepareSlot` rules:**

- Take all `dFdx/dFdy` here, in uniform control flow. Uniform `if` and `switch` are fine; per-pixel branches around a derivative are forbidden.
- Compute `Yx=dFdx(Y), Yy=dFdy(Y)` once. If `g_hasJ`, use the surface's `g_dX, g_dY` scaled by `s*R` instead, so seam-bearing
  surfaces (room, planet) never produce a grey line at a seam.
- `gradPlane = vec2(dot(c,Yx), dot(c,Yy))`. For the smooth non-plane part use `dFdx(sm - planePart)`. Then `g[i] = max(length(grad[i]), 1e-5)`.
- Pole `Θ` gradients are analytic, so `atan`'s cut never spikes: `dΘ = (v.x*dv.y - v.y*dv.x)/(TAU*dot(v,v))` where `dv = m*(Yx.xy)` and `m*(Yy.xy)`.
- `slip` is added to `phi` after gradients. A slip seam is a true jump and must not widen the filter.
- If `g_conf >= 0.`, set `g[i] = length(c.xy)*s*g_conf/uRes.w`. Only valid when no lattice-space warp is active.
- `lnρ` is `log(ρ + 1e-3)`. `ρ` for `q<32` is `m*pow(pow(ax/m,q)+pow(ay/m,q),1./q)` with `m=max(ax,ay,1e-6)`; `q>=32` is `max(ax,ay)`.
  `q=2` uses `length`. `q` is uniform, so these are uniform branches.
- `N = vec2(n2(X.xy*f + seed, t*rate), n2(X.xy*f + seed + 37., t*rate))`. Frame-space, so wobble is hand-cut on macro shapes and
  invisible on fine ones: a fixed .04 cycles moves an edge by .04 of its own period.

**Display pass:**

```glsl
vec3 ink=texture(uInk,uv*uTier).rgb;
ink=clamp(.5+(ink-.5)/uTier,0.,1.);       // re-sharpen: the coverage ramp behaves like a distance field
vec3 c = uPure ? ink.rrr : ink.r*uI[0]+ink.g*uI[1]+ink.b*uI[2];
```

Inks always satisfy `I0+I1+I2 = (1,1,1)` (section 6), which is why aligned plates collapse exactly to white-on-black.

**Hard limits per frame:** at most 2 non-solid fields, 5 families per slot, 4 poles per slot, 3 plates. `compose.js` rejects
anything over. A void into a solid colour costs no extra field.

**Fine-line rule.** Single families stay at period >= 4 device pixels over most of the frame. Sheet pairs keep a carrier period
>= 6 device pixels, because the lines of an XOR run at twice the carrier frequency: a 4 px carrier means 2 px lines, which twinkle when they move. Below that a family must close, or be renamed an octave down under a solid or by Shepard layering. Poles,
horizons and lens centres may go finer locally, and the band filter takes them to true-duty grey (the film has these grey
cores too), but flat grey over more than 1% of the frame fails test 4. Never rely on aliasing against the pixel grid.

### 2.7 How pattern authors work in parallel

**Most patterns are data.** A new pattern is one file with no GLSL:

```js
// src/patterns/pole/target.js
import { G, ring, spokes, pole } from '../kit.js';
export default {
  id: 'pole.target', name: 'Target', family: 'pole', ver: 1,
  genome: G({ poles:[pole(0,0)], fams:[ ring(0,5,{flow:1, wob:[.04,0]}), spokes(0,24,{wob:[0,.03]}) ] }),
  axes: [ {id:'rings', name:'rings', path:'fams.0.rho.0', min:1, max:48, log:true},
          {id:'rays',  name:'rays',  path:'fams.1.th.0',  min:4, max:72, step:4} ],
  arcs: [ {path:'lat.s', from:.5, to:6} ],
  clock: { flowVector:[1,0], period:1 },
  channels: ['flow'],
};
```

Kit:

```js
plane(k, deg, o)            // c = k*(cos deg, sin deg, 0)
triLattice(k, deg, alpha=120, o)   // three families with c3 = -c1-c2, ph summed to 1/4
ring(j, k, o)               // rho[j] = k
logring(j, k, o)            // ln[j] = k, cycles per unit of ln ρ
spokes(j, n, o)             // th[j] = n, integer
spiral(j, k, n, o)          // ln[j] = k, th[j] = n
pole(x, y, {q, m})
G(partial)                  // fills every default; a pattern file never lists defaults
// o = { ph, d, flow, flowL, bend, dE, wob, slip, amp, pt, pair }
```

**When a pattern needs new maths, the author writes one chunk file.** Five extension points:

```js
// src/chunks/warp/star.js
export default { kind:'warp', id:'star', glsl:`
vec3 w_star(vec3 X, vec4 a, vec4 b){ /* a=(n,c,0,amt) b=(cx,cy,0,0) */ ... }` };
```

```glsl
vec3  w_<id>(vec3 X, vec4 a, vec4 b);    // warp. Continuous, or folds only. Identity at a.w = 0. No derivatives.
float m_<id>(vec2 p, vec4 a, vec4 b);    // matte. Signed distance in frame units, negative inside.
vec3  s_<id>(vec3 ro, vec3 rd, vec4 a, vec4 b);   // surface. Returns X. Sets g_cover. May set g_hasJ, g_dX, g_dY. Derivatives allowed.
float ph_<id>(vec3 Y, vec4 a, vec4 b);   // phase term in cycles. Continuous.
float fd_<id>(vec3 Y, vec4 a, vec4 b);   // field in [-1,1]. Continuous. For V3 heroes only.
```

**Rules that keep authors out of each other's way:**

1. Touch only your own file. The manifests are written once at Stage 1 and list every id planned through V3. The loader
   `import()`s each entry and logs a warning on a missing file, so unwritten patterns simply don't appear.
2. Prefix every GLSL name with the chunk's own prefix, e.g. `w_star_helper`. Use only prelude helpers and your own names.
3. Loop bounds are constants, at most 16. No texture reads. Warps, mattes and phase terms take no derivatives.
4. Warp bank order is fixed in `src/chunks/manifest.js`: `order < 100` runs in frame space (bank0), `order >= 100` in lattice
   space (bank1). A warp is applied only if `a.w != 0`. Authors do not choose order.
5. Pattern files declare `heavy: true` if they exceed 3 families or use a field plugin or a marching surface. The composer then
   keeps them single-slot.
6. `PATTERN=<id> node tools/lab.mjs tests/pattern_check.mjs` must pass before merging: loads, compiles, renders a contact sheet with
   `look.mjs`, reaches both solids, stays bold, and its `flowVector` returns the frame to itself.

**A new id after Stage 1** adds one line to a manifest. Lines are in id order, one per line, so merges are clean.

### 2.8 Shader compile without hitches

One ink program and one display program. No per-scene code generation, ever, so a live tweak or an any-to-any morph can never
trigger a compile.

1. `shader.js` assembles the source: prelude, `N_WARPS` from the manifest, every chunk prefixed by `#line 1 <moduleIndex>`
   so errors name the file, then generated `bank0`, `bank1`, surface, matte, phase and field dispatch on uniforms.
2. `gl.js` calls `compileShader` and `linkProgram`, then polls `COMPLETION_STATUS_KHR` (`KHR_parallel_shader_compile`) once per
   rAF. It never queries `LINK_STATUS` before completion. Without the extension it links once, behind the same black opening.
3. Until the program is ready the page is black. Nothing else draws.
4. After link, draw once at 1x1 to an RGBA8 FBO and once to the default framebuffer, so Metal builds its pipelines off-screen.
5. Only then does `T.ready` become true and the picture appear, already moving.

Targets: under 1 s on M4, under 6 s on Windows, no frame blocked over 50 ms after first paint. If ANGLE's D3D backend flattens the
warp branches and a 1080p integrated GPU can't hold 55 fps after the governor, compile a second program at score time with only the
warps that song uses (`#define` the rest away), same UBO layout, swapped under a solid. Do not build this until test 17 asks for it.

### 2.9 Tiers and budget

Tiers are viewport fractions `{1, .84, .71, .6, .5}` of the Ink target. Governor: use `EXT_disjoint_timer_query_webgl2` if present,
else rAF intervals. Drop a tier when p90 exceeds 13 ms for 30 frames. Rise after 5 s under 7 ms. A change waits for the next solid or
4 s, whichever comes first, and is immediate above 20 ms. Export and `T.tier(x)` lock it.

Budget at 3024x1964 on M4 (estimates, based on a stand-in shader that measured 2.17 ms for 3 waves and 6 poles):

| Item | Typical | Worst |
|---|---|---|
| JS frame and UBO | .5 ms | 1.5 ms |
| Ink, one slot | 2 ms | 4 ms |
| Ink, two slots, two plates | 5 ms | 9 ms |
| Display | .3 ms | .5 ms |

### 2.10 The debug API: `window.trippee`

`tools/lab.mjs` waits for `window.trippee.ready === true`. `tools/look.mjs` uses `step`, `canvas` and `time`. Everything is available
from boot; song calls are async. `T` below means `window.trippee`.

```js
T.ready                 // boolean. True after compile, warm draws and the first frame.
T.version               // 'v1'
T.canvas                // the canvas element

T.time()                // current t in seconds
T.seek(t)               // sets t and renders one frame, synchronously
T.step(dt)              // advances t by dt, renders one frame synchronously, returns t. First call enters manual clock.
T.manual(on=true)       // detaches from rAF and audio. Determinism tests use this.
T.play(); T.pause();

T.list()                // { patterns:[{id,name,family}], scenes:[{id,name}] }
T.load(id, {travel=false})   // pattern or scene id, synchronous. travel:true goes there by a duty sweep.
T.current()             // { pattern, scene, gesture, transition }
T.genome(); T.setGenome(g); T.set(path, value)

T.song(src, {seed})     // src: URL, ArrayBuffer or File. Promise of { duration, bpm, labels, landings, gestures }
T.film({seed})          // silent film from a synthetic analysis
T.analysis(); T.score(); T.audit()

T.mode('pure'|'beyond'); T.calm(bool); T.tier(x|null); T.size(w,h)
T.verb(name, args)      // scripted Press, Push, Journey, Duty, Pole, Sheet, so tools are testable

T.capture(type='image/png', quality)   // renders now, returns canvas.toDataURL in the same task
T.pixels({w,h})         // renders to an FBO and reads: { w, h, data: Uint8Array }. No preserveDrawingBuffer.
T.hash()                // FNV-1a hex of native ink pixels
T.metrics()             // { t, frame, fps, jsMs, gpuMs, tier, w, h, mode, pattern, scene, gesture, transition,
                        //   beat, bar, label, visit, family, compile:{state,ms},
                        //   white, chroma, edges, grey, solid }  last five read back at 320x180 when called
```

Automated runs must use the real GPU (`lab.mjs` passes `--use-angle=metal`), never SwiftShader. To test at retina size use
`--size 3024,1964`, since `lab.mjs` fixes device scale at 1. Read the canvas in the same task as `step`, because the buffer is not preserved.

---

## 3. The music system

The film is a pure function of `(Analysis, seed, patch)`. Drums help only the clock and never touch amplitude. The picture locks
to the music through position, shape and landing.

### 3.1 Analysis

Decode with `decodeAudioData`, resample to mono 22050 Hz with `OfflineAudioContext`, transfer to the worker. Target under 20 s
for a 5-minute song on M4. The picture keeps travelling during analysis. All curves are filtered forward and backward, so
they are smooth with no lag.

```js
Analysis = {
  version: 4, duration, hash, fps: 43.066,     // raw curves at 22050/512
  loud, harm, perc, bright, bass: Float32Array,
  pitch, voiced: Float32Array,
  m: Float32Array,       // semitones about a 16-bar local mean, ±12, 100 ms smoothing, held and decaying through gaps
  E: Float32Array,       // loudness, forward-backward low-passed at .3 s, 0..1
  chroma, chord, chordStep, key, minor,
  beats: Float64Array, tau: Float64Array, rate: Float32Array,   // tau and rate at 100 Hz
  meter: 3|4, downbeat, bars: Float64Array, phraseBars: 2|4|8|16,
  novelty: Float32Array, segments: [{ b0, b1, t0, t1, label, visit }],
  canon: Int32Array,     // per beat: the matching beat of the first visit, or itself
  arc: Float32Array, climax, swellRegularity,
  character: { slide, perc, tempo, harmRate }  // each 0..1
}
```

**Port from the old `src/listen.js` unchanged:** STFT, median-filter HPSS, melody salience and 20-cent Viterbi (its best part),
chord Viterbi, key. **Replace:** global BPM, hard-coded `meter = 4`, 2 Hz section features, and `kind` labels, which have no identity
so a chorus can't return.

**Do not repeat these old bugs:** `score.js` tested `an.down?.length` on an integer, so scene changes never snapped to bars.
`director.js` planned forward with `Math.random` and couldn't land or seek. `music.js` multiplied `outputLatency` by 0.

**Clock `tau(t)`:**

1. Tempogram: 12 s Hann windows at 1 s hop, Viterbi over 120 log-spaced tempos from 50 to 200 BPM.
2. Ellis DP beat tracking using `period(t)`.
3. Downbeats: Viterbi on bar position for meters 3 and 4, scored on chord change and bass onset. Keep the better meter.
4. Phrase length `P` in {2,4,8,16} bars, from autocorrelation of bar-level novelty.
5. Smooth: beat intervals, 9-beat median, Gaussian σ=8 beats, integrate, add back the residual low-passed at σ=16 beats. Sample at
   100 Hz and look up with Catmull-Rom. Rate jitter above .5 Hz must stay under .5%, because tracker noise shows as velocity wobble.

**Sections and repetition**, on beat-synchronous features (12 harmonic chroma, 13 DCT of log-mel, loudness, percussive ratio,
voicing, register):

1. Foote novelty at 16 and 64 beats. Peaks snapped to the bar grid give segments.
2. Recurrence `R`: mutual nearest neighbours (top 5%), with chroma taking the best of 12 rotations so a chorus lifted a step still
   matches. Diagonal median filter over 16 beats.
3. Smith-Waterman through `R` for each segment pair. A normalised score >= .6 gives the same label, via union-find.
4. The alignment path gives `canon[beat]`. This map matters more than the label, because it lets the film replay.

**Also:** `arc(t)`, peak 16-bar energy with a climax weighted to the last two thirds; `swellRegularity`, chord-onset autocorrelation at phrase lag.

**Output clock.** `player.js`: `audio = getOutputTimestamp().contextTime - startedAt + offset + visualLead`, with `visualLead = .025`, adjustable
by key. Each rAF: `tEst += dtRaf; err = audio - tEst; tEst += clamp(err*.05, -.002, .002)`. Snap only on seek or if `|err| > .25`. If the
context is suspended after a drop, wait on black with one word, "play", until a click or Space.

### 3.2 The symmetry clock: lock with no pulse

Every pattern declares integer flows on `Phi`, so the picture at `Phi+1` is pixel-identical to the picture at `Phi`. Driving
`Phi = tau/N` makes the frame return to itself every `N` beats at constant speed. It feels locked and nothing pulses. No
amplitude anywhere is synced to a beat.

**Gears.** Edge speed `= λ·rate/N`, with `λ` the element period in frame widths and `rate` in beats per second. The film's 5 to 10%/s
band is exactly one octave, so powers of 2 always have a gear in band for `λ >= .05`, checked at 60 to 180 BPM:

```
N = smallest allowed N with λ·rate/N <= .10
allowed N: 1,2,4,8,16,32,64,128 for meter 4;  1,3,6,12,24,48,96 for meter 3
floor: N/rate >= .5 s, so at most 2 cycles/s at any pixel
```

A scale journey therefore climbs the metre. At 120 BPM: λ=.05 is N=1, .1 is N=2, .2 is N=4, .4 is N=8. Hairlines pass by the beat, giants by the phrase.

**Gear shifts** sit on bar lines, take at least 1 bar, and land on an integer: quintic `land` in `tau` from `(Phi_a, 1/N1)` to `(Phi_b, 1/N2)` with
`Phi_b = round(Phi_a + (tau_b-tau_a)*(1/N1+1/N2)/2)`. Each slot's `Phi` resets at its swap under a solid, so it stays small. The score's `Phi_L` never resets (see the Score type).
`gears.js` returns a closed form; no integration at runtime.

**An edge crosses focus on the beat.** Each gesture's `Phi0` is chosen so a crest of family 0 crosses the focus point at a beat. `fieldjs` solves this for plane
families. Other families use `Phi0 = 0`.

### 3.3 Channels and the mapping at every timescale

| Unit | Source | Picture |
|---|---|---|
| Song | `character`, climax | One family. Scale ceiling. Biggest move on the last visit. |
| Section | label, visit | Cue: rung of the ladder and route. Returns on the next visit, move for move. |
| Gesture, about 22 s | landings | White arc, scale journey >= ln 8 on most gestures, one continuous movement. |
| Phrase, 8 to 16 s | `phraseBars` | Camera knot. Continuous morph step. Moiré fringe crossing (V3). Swell where regular. |
| Chord | `chord` (V2) | Warp pose. A four-chord loop becomes a visible loop of shapes. |
| Bar and beat | `tau` | Position only. |
| Note | `m(t)` (V2) | Line shape, on staves only. |

**The cap: at most 2 visible channels per cue, counting flow and camera as one.** Flow, pose, melody, swell, camera and fringes all at once
is the old noise. `compose.js` rejects a cue that breaks this.

The channels:

- **`flow`** Always on. `Phi = tau/N`.
- **`record`** (V1) Each ring is one cycle of the clock, born at the focus on its own beat, and it keeps the loudness of that moment as it moves out at speed `c`:
  `φ = Phi_L(t - ρ/c)`, `d' = dE*(E(t - ρ/c) - .5)`. Ring spacing is `c/f` for clock rate `f`. Because the phase is the real song clock and not a fixed `k`, ring spacing also records
  gear shifts and tempo drift. At 120 BPM, `N=2`, `c=.25` units/s: rings every .25 units, moving at 7% of frame width per second, with about 8 s of song from centre to corner. `E` and `Phi_L` are local here while `T` stays global.
- **`swell`** (V1) Only where `swellRegularity > .5`, on inflating motifs. .5 s attack that *ends* on the phrase onset, then 4 s decay. ΔW at most .3.
- **`pose`** (V2) Warp parameters of the `lens` warp hashed from (chord relative to key, cue). Spline arrives *at* each chord change, so the move happens during the chord before.
  Displacement at most .1 frame. At most one pose per bar.
- **`staves`** (V2) `s(p) = p.x/c`, `bend` on a plane family. Each line's shape is the melody contour: the next 6 s to the right, the last 6 s to the left. A slide is seen coming
  and reaches the centre as it's heard. `bend` is set per song so p95 line slope is 1. Test on 3 real songs; if it reads as an oscilloscope, low-pass `m` further and lower `bend`.
- **`fringe`** (V3) Two clocks. Sheet pair with phases `tau/N` and `tau/N + tau/M`. Lines keep the beat while a fringe crosses once per `M` beats.

A cue with its own local time (`record`, `staves`, `song.horizon`) exits by a global solid, or by a front that uses that same `s`. It never gets a second time field.

Limits for all of it: flow median 5 to 10%/s, cap 20. `|d ln s/dt| <= .5/s`. Camera tilt <= .05 rad/s. Pixel reversal <= 3 Hz. Every curve comes from a
`Track` or `land`, so it is C2.

Melody never drives flow speed. Speed wobble reads as jitter and breaks the lock.

### 3.4 Composing

**A solid is a stateless reset.** While the frame is solid, motif, camera and colour can all change unseen. So each gesture is solved alone,
backward from its exit.

1. **Family.** Score each family: `dot(character, affinity) + .25*rng`, plus .5 to `dots` if `swellRegularity > .5`. Affinities in order (slide, perc, tempo, harmRate):
   lattice (0,.8,.6,.5), pole (1,0,.3,.2), room (.2,.7,.8,.6), stripe (.8,.2,.3,.4), dots (.2,.2,.5,.7), body (.4,.5,.4,.3). One family per song. "Drop a song on your
   pattern" skips this and builds the ladder from the patch with `autoLadder`.

2. **Landings.** DP over phrase starts, on first visits only.
   ```
   S(B) = noveltyZ(B) + .5*|ΔE(B)| + labelChange(B)
   cost(L,B) = (ln(L/22)/.4)^2 - 1.5*S(B),   L in [10,48] s
   ```
   Any `B` with `S` above the song's p85 is mandatory. Later visits copy their landings through `canon`.

3. **Landing kind at boundary B:**

   | Music at B | Test | Solid | Then |
   |---|---|---|---|
   | Falls | ΔE < -.1 | reached exactly at B, held 1 to 2 bars | emerge over 4 to 8 bars |
   | Rises | ΔE > +.1 | reached one beat early | first speck exactly at B, half duty in 2 to 4 bars |
   | Level | otherwise | centred on B, at most 1.5 s | emerge over 4 bars |
   | Break | E below p15 for 2+ bars | spans the gap, at most 10 s | emerge as the music returns |

   Form of the landing, by seeded hash over the song: **at least 70% are global solids**, reached by duty or by void. One in four of those uses a hard matte (void or crack)
   whose edge reaches the far corner exactly at B. **At most 30% are time-fronts**, and no two in a row. This ratio keeps the median solid gap near the gesture length (test 6). Solid
   colour: 60% black, 40% white, as in the film; falls prefer black, rises prefer white.

4. **Backward from B:**
   - **Exit.** `W(t) = land(W_c, 0, W_e, 0)` over `D` seconds ending at the kind's solid time. `D` about 5 s, and `D >= 3*|ΔW|`. Baked into row `T` so that the shader's `mix(θ_c, θ_end, T)` produces exactly that `W`: `T = (Θ(W) - θ_c)/(θ_end - θ_c)`, where `Θ` is the pattern's white-to-threshold table.
   - **Scale.** Pick the exit scale, then the entry scale. Ratio >= 8 on at least 60% of gestures. A scale-sweep exit zooms toward a crest under the focus at B, which `fieldjs` finds exactly for plane families because `Phi(B)` is closed form.
   - **Camera.** Pose knots on phrase starts, placed backward from B.
   - **Gears.** Derived from `lnS(t)` and `lambda`.
   - **Anti-boredom gate.** Each gesture shifts spatial frequency by at least 1 octave or orientation by at least 30°.

5. **Repeats.** Later visits evaluate the first visit's tracks at `canon(tau)`, so a chorus replays move for move. One thing changes per visit, and only in the last quarter of the section: a wider journey (visit 2), a fringe or inverted polarity (visit 3), colour opening further (Beyond). The film never brings a picture back; this does.

6. **Inside a gesture.** Continuous morphs only, at phrase starts, walking the rung: lattice shear (square to hex), `q` from circles to squares, warp amount, family opening by sliver. At least one structural change in every gesture.

7. **Bake.** `bake.js` fills the score texture at 60 Hz: `T`, `Phi_L`, `m`, `E`. Then it closes the loop, because duty tables don't survive warps: render the whole song at 160x90 at 10 Hz through the real program, read white, and correct `T` in cruise and exit by `.8*(W_meas - W_target)*dθ/dW`. One pass, about 3 s per 5-minute song. Landing knots are never moved. Playback stays pure. Cache the result by (file hash, seed, patch hash).

8. **Audit.** `audit.js` reads the same low-res pass. Any `|ΔL| > .35` per .5 s, or 3 or more opposing swings of >= .1 in a second, whole-frame or in any 4x4 tile, stretches the offending segment by 1.5 and resolves that gesture. Three tries, then force a global duty sweep with `D` doubled.

**The cue table** in `src/score/cues.js` is data:

```js
Cue = { id, family, rung, scene, route, channels:['flow','record'], exits:['duty','void','front'] }
```

Each label gets the next rung of the family's ladder, assigned so the climax label gets the biggest rung. Ladders are in section 5.

**Silent film.** `T.film()` and the boot picture compose from a synthetic analysis: 96 BPM, 8-bar phrases, ABABCB over 6 minutes, ending on the same solid it starts from so it wraps. So the picture is always travelling, with no song and no user.

---

## 4. The transition grammar

No crossfades, no grey. All curves use:

```
land(x0,v0,x1,v1,D,u) = x0*H0(u) + x1*H5(u) + D*(v0*H1(u) + v1*H4(u)),  u = (t-t0)/D
H0 = 1-10u³+15u⁴-6u⁵    H1 = u-6u³+8u⁴-3u⁵    H4 = -4u³+7u⁴-3u⁵    H5 = 10u³-15u⁴+6u⁵
```

Peak rate is `1.875*|Δ|/D`. A full black-to-white swing over `D=3` gives .307 per .5 s and .0104 per 1/60 s (limits .35 and .025). Over `D=2.5` it fails. So **any white-fraction move takes `D >= 3*|ΔW|` seconds**, and solid-to-solid takes at least 3 s.

**All solids are envelopes.** Every landing writes `T(t)` into the score. Each slot's threshold is `θ = mix(θ_slow, pol*θ_solid, T(t + s(p)))`. A global solid has `s = 0`. A time-front has `s != 0`. Nothing else differs. `θ_slow` stays a per-frame uniform, so only the envelope is local and there is no ramp-in problem. Exit: `T` from 0 to 1. Swap at `tSwap` while `T = 1`. Entry: `T` from 1 to 0. Polarity is the same on both sides.

| Kind | Exact formula | Duration | Notes |
|---|---|---|---|
| **duty** (main) | `T` as above, global, `s=0`. Swap under the solid. | exit about 5 s, entry 4 to 8 bars | Elements shrink or merge, solid, next pattern comes as specks. Solid is exact: at `|θ| >= θ_solid`, `h` is 0 or 1. |
| **sliver** | Family `i`: `d_i = land(-1,0,d_end,0)`. Enters as hairlines at `tri = -1`, widening, `d_end = 0`. | >= 4 s | Stripes into checks into triangles, or a crack in a solid. At `d = ±1` the family is closed. `-1` to `+1` flips polarity. |
| **scale** | `lnS = land(lnS0,v0,lnS1,0)`, zoom about focus `o`, `|d lnS/dt| <= .5/s`. Rename an octave (`s/2`, coefficients ×2) under a solid. | 8 to 30 s | Hairline to larger than the frame. Stops at period 4 px. |
| **lerp** | `g = lerpGenome(gA,gB,land(0,0,1,0))`. Stretch `D` until `|∂φ/∂t|/|∇φ| <= 15%` of frame width per second on a 5x5 grid, using `fieldjs`. | >= 4 s | Lines bend into rings. If the midpoint looks wrong, the planner routes through a solid instead. |
| **reconnect** | `sum = 1, round = 1, amp1 = 1-T, amp2 = T`, `T = land(0,0,1,0)`. At `T=.5` exactly a diamond checker of the rotated lattice, because `cos a + cos b = 2 cos((a+b)/2) cos((a-b)/2)`. | >= 6 s | Stripes reconnect into stripes at 90°. White is exactly .5 throughout, because `f(φ+½) = -f`. **No solid needed.** |
| **levelset** (V2) | `f = mix(fA,fB,T)`, one threshold. Commensurate pairs only: lattice ratio p/q with p, q <= 3. | >= 6 s | Hybrids, never grey. Incommensurate pairs make blobs, so route them through a solid. |
| **tune** (V2) | Sheet pair: `c_j = c_i + δ*c_H`, `ph_j = ph_i + off`. `δ = land(1,0,0,0)` to a solid (`off=0` white, `off=.5` black), swap `H` under it, `δ = land(0,0,1,0)` into the next `H`. | >= 4 s per side, `D >= 3*|ΔW|` | Fine lines fall into tune and the frame resolves; the next pattern arrives as beats. `H` may use planes, `ρ` and `lnρ`. Best new morph here. |
| **void** | `sd(p) = shape(M(p-c)) - R(t) + w*n2(3p,.2t)`, `R = land(R0,0,R1,0)`, `R1` = distance to the far corner plus margin, reached exactly at B. | 6 to 20 s | A hard shape grows until it covers everything (the black square at 1726 s). |
| **crack** | `g(p) = p.y - Σ a_i sin(ω_i p.x + φ_i)`, matte `|g| < ε(t)`, `ε = land(0,0,ε1,0)`. Three sines, `ω` 1 to 5. | 8 to 20 s | A hairline of the next pattern opens in the solid and widens. Several merge into a field (1729 to 1745 s). |
| **emission** | Not a transition, a state: the `record` channel, or a ring family with integer `flow`. New rings are born at the pole and push the rest out. Never resized. | continuous | Woo. The ring rate is the gear. |
| **front** | See below. | `S` 4 to 8 s | The new one. |
| **shepard** (V2) | See `lattice.shepard`. | continuous | Endless zoom with no reset and no grey. |

**The time-front.**

```
s(p) = sign * S * R(p),   R in [0,1]
R(p) = ‖p-c‖_q / Rmax                  'ring' (q=2) or 'room' (q=∞)
R(p) = clamp(depth(p)/depthMax,0,1)    'depth', on a floor: the change comes in from the horizon
R(p) = |a_0| of the next pattern       'contour' (V2): the wave runs along that pattern's lines
```

- **Converge** (`sign = +1`): edges read the future. A pixel at `R` hits the wall at `t = B - S*R`. The last old pixel vanishes at the focus on exactly `t = B`. Use this on falls and rises.
- **Diverge** (`sign = -1`): the first new speck appears at the focus on exactly `t = B` and the wall spreads. Use this on level boundaries and for emission.
- **Speed.** `c = Rmax/S <= 15%` of frame width per second. So for a corner-to-centre `Rmax` of .57W, `S >= 3.8 s`. Default `S = 6`.
- **Wall.** The `T = 1` plateau lasts `2*hw` seconds, `hw = 1`. Converge: the plateau is `[B, B+2hw]` in local time, so `T` reaches 1 at the focus exactly at `t = B`. Diverge: the plateau is `[B-2hw, B]`, so `T` leaves 1 at the focus exactly at `t = B`. The solid wall is `2*hw*c` thick, about 15% of the frame at `c = 7.5%/s`. A straight wall is a PowerPoint wipe, so `R` is never a linear gradient.
- **Swap.** `tSwap` is the middle of the plateau. Per pixel: `tL < tSwap` shows slot A, else slot B. Both are solid in the same colour there, so no seam can show. During a front both slots are live.
- **Window.** `s` is active only while a pixel can see the change: converge `[B-D-S, B+2hw+De]`, diverge `[B-2hw-D, B+De+S]`. Because only the envelope `T` is local and `T = 0` outside the window, switching it on is invisible. A pixel reading local time must not reach a neighbouring landing's ramp, so require the gesture on the far side to be at least `D + De + S + 2*hw + 2` seconds long, or the planner uses a global landing.
- **Slot clocks.** Each slot's phases are uniforms evaluated at real `t`, including slot B's before it lands (its `Phi` extends backward in closed form). So a front never bends lines. If phase followed local time, a steady clock would add `f*s(p)` cycles and turn the picture into rings. `Phi_L` is used only by `flowL`.

**Choosing a transition.** Most landings: duty. Stripes to rotated stripes with no solid wanted: reconnect. Adding structure inside a gesture: sliver or lerp. A long ride: scale. A hard ending: void or crack. A big boundary, up to 30% of landings: front.

**One-frame rule.** Whatever the form, the landing moment in the plan is hit within one frame, or test 7 fails.

---

## 5. The pattern library

Notation is `kit.js`. `λ` is how big the elements are. Each entry gives the genome, the long ride (ARC) and the clock (FLOW, integer flows on `Phi`). **Unless noted, there is no GLSL beyond the warps in 5.1.** Ver is the version it ships in. Hand-cut wobble (`wob .03 to .06`, growing once an element passes a quarter of the frame) applies on all macro passages.

### 5.1 The warp bank

```glsl
// order 5, frame. Written by Push. a=(decay,0,0,amt). psi() is a 4-tap B-spline read of uPsi.
vec3 w_liquify(vec3 X,vec4 a,vec4 b){ X.xy+=a.w*a.x*psi(X.xy); return X; }
// order 8, frame. Press. a=(cx,cy,sigma,amp). Ball under the sheet.
vec3 w_press(vec3 X,vec4 a,vec4 b){ vec2 v=X.xy-a.xy; X.xy-=v*a.w*exp(-dot(v,v)/(a.z*a.z)); return X; }
// order 10, frame. Rolling sheet: 3 parallax fixed-point steps. Wrong answers read as cloth folds. a=(qx,qy,ph,amt) b=(vx,vy,h2,ph2)
vec3 w_sheet(vec3 X,vec4 a,vec4 b){ vec2 p=X.xy,y=p; for(int i=0;i<3;i++){
    float h=sin(dot(y,a.xy)+a.z)+b.z*sin(dot(y,a.yx*vec2(-1.7,1.3))+b.w); y=p+a.w*b.xy*h; } X.xy=y; return X; }
// order 15, frame. Bow-tie. Spacing at frame edge is unchanged, the waist crushes. a=(x0,eps,Rx,amt)
vec3 w_bowtie(vec3 X,vec4 a,vec4 b){ X.y=mix(X.y,X.y*(a.z+a.y)/(abs(X.x-a.x)+a.y),a.w); return X; }
// order 20, frame. Squeeze band. Frequency multiplies by 1+amt*A/w at x0. a=(A,x0,w,amt)
vec3 w_squeeze(vec3 X,vec4 a,vec4 b){ X.x+=a.w*a.x*atan((X.x-a.y)/a.z); return X; }
// order 25, frame. Waves. a=(A,om,ph,amt) b=(B,om2,ph2,0)
vec3 w_wave(vec3 X,vec4 a,vec4 b){ X.y+=a.w*a.x*sin(TAU*a.y*X.x+a.z); X.x+=a.w*b.x*sin(TAU*b.y*X.y+b.z); return X; }
// order 35, frame. Swirl: conformal twist plus a local drag. a=(beta,Om,r0,amt) b=(sigma,cx,cy,0)
vec3 w_swirl(vec3 X,vec4 a,vec4 b){ vec2 z=X.xy-b.yz; float r=max(length(z),1e-3);
  float g=a.w*(a.x*log(r)+a.y*exp(-pow((r-a.z)/b.x,2.))); X.xy=b.yz+rot2(g)*z; return X; }
// order 40, frame, V2. Three lenses on a triangle, the chord pose. a=(amp0,amp1,amp2,amt) b=(angle,radius,sigma,0)
vec3 w_lens(vec3 X,vec4 a,vec4 b){ vec2 p=X.xy,d=vec2(0); for(int j=0;j<3;j++){ float t=b.x+float(j)*TAU/3.;
    vec2 v=p-b.y*vec2(cos(t),sin(t)); d+=v*a[j]*exp(-dot(v,v)/(b.z*b.z)); } X.xy-=a.w*d; return X; }
// order 45, frame. Star lens. n integer, changes only under a solid. a=(n,c,0,amt) b=(cx,cy,0,0)
vec3 w_star(vec3 X,vec4 a,vec4 b){ vec2 z=X.xy-b.xy; float r=max(length(z),1e-4), t=atan(z.y,z.x), s=TAU/a.x;
  t=abs(mod(t,s)-.5*s); X.xy=b.xy+mix(z,pow(r,a.y)*vec2(cos(t),sin(t)),a.w); return X; }
// order 50, frame. Pole garden: w = Σ c_j B_λ(z-a_j), B_λ(z) = (z^λ-1)/λ, log z at λ=0. a=(lambda,gamma,0,amt) b=(c0,c1,c2,c3)
vec3 w_garden(vec3 X,vec4 a,vec4 b){ vec2 w=vec2(0),dw=vec2(0); for(int j=0;j<4;j++){ if(b[j]==0.) continue;
    vec2 z=X.xy-polePos(j); float r=max(length(z),1e-4),t=atan(z.y,z.x),L=log(r);
    vec2 e=abs(a.x)<1e-3?vec2(L,t):(exp(a.x*L)*vec2(cos(a.x*t),sin(a.x*t))-vec2(1,0))/a.x;
    w+=b[j]*e; dw+=b[j]*exp((a.x-1.)*L)*vec2(cos((a.x-1.)*t),sin((a.x-1.)*t)); }
  w=rot2(-a.y)*w; if(a.w>=1.) g_conf=length(dw); X.xy=mix(X.xy,w,a.w); return X; }
// order 55, frame, V3. Stereokinetic skew. a=(ux,uy,k,amt)
vec3 w_cone(vec3 X,vec4 a,vec4 b){ X.xy-=a.w*a.z*length(X.xy)*a.xy; return X; }
// order 110, lattice. Chevron: y += A*tri(c*x+e). a=(A,c,e,amt)
vec3 w_chevron(vec3 X,vec4 a,vec4 b){ X.y+=a.w*a.x*tri(a.y*X.x+a.z); return X; }
// order 120, lattice, V2. Teeth: columns stretch. a=(A,c,e,amt)
vec3 w_teeth(vec3 X,vec4 a,vec4 b){ X.y*=exp(a.w*a.x*tri(a.y*X.x+a.z)); return X; }
// order 130, lattice, V2. Twisting ribbon. a=(A,om,t,amt) b=(W,sigma,0,0). Matte m_ribbon uses the same geometry.
vec3 w_ribbon(vec3 X,vec4 a,vec4 b){ float s=X.x,c=a.x*sin(a.y*s+a.z),w=b.x*cos(b.y*s);
  w=(w<0.?-1.:1.)*max(abs(w),1e-3); X.xy=mix(X.xy,vec2(s,asin(clamp((X.y-c)/w,-1.,1.))),a.w); return X; }
```

In `w_garden`, the poles are read as frame-space centres. `w_garden` is the only warp with a true branch cut, and it uses `g_conf`, so the cut never widens the filter.

**Surfaces.** `flat` and `quadric` are built in (`src/glsl/surface.glsl.js`). Everything from a floor to a saddle is one homogeneous `Q`, so they morph by lerping `Q`:

```glsl
float hitQuadric(mat4 Q,vec3 ro,vec3 rd,out float disc){
  vec4 o=vec4(ro,1.), Qd=Q*vec4(rd,0.);
  float a=dot(rd,Qd.xyz), b=dot(o,Qd), c=dot(o,Q*o);
  disc=b*b-a*c;
  float q=-(b+(b<0.?-1.:1.)*sqrt(max(disc,0.)));
  return nearestPositive(q/a,c/q);   // c/q stays exact as a->0, so a plane is just a flat quadric
}
```

`Q` values: plane z=0 has `Q[2][3]=Q[3][2]=.5`, rest 0. Sphere `diag(1,1,1,-R²)`. Tube `diag(1,0,1,-R²)`. Bowl `x²+y²-2cz`. Saddle `x²-y²-2cz`. The hit point feeds the families directly as a solid texture, with no UV seams or pole pinch. `disc` is the silhouette, with `voidInk` beyond it. Lines crowd into moiré at the limb, as in the film. **There is no lighting anywhere, no normals used for shading, no gradient. Chrome is impossible by construction.**

### 5.2 Patterns

**Family `lattice`**: Drunk in LA, Lemon Glow, Girl of the Year. Ladder: stripes, slits, checks, triangles, macro hand-cut, specks, star lens.

| Id | Ver | Genome | ARC | FLOW |
|---|---|---|---|---|
| `lattice.master` | 1 | `triLattice(6,10)`, families 2 and 3 start at `d=-1`. Open them by sliver. | `d`; alpha 90 to 120°; `lat.s` over 6 octaves | (1,-1,0) |
| `lattice.kagome` | 1 | `triLattice(6,10)`, all open. Triangle at `Σph=¼`, kagome at `Σph=0`. | `ph1` slides ¼: triangles open into hexagons without travelling | (1,0,0), period ½ |
| `lattice.checker` | 1 | `plane(5,0), plane(5,90)`, `squeeze{A:1.2,x0:0,w:.12}` | `amt` 0 to 1 (A/w to 10); `x0` travels | (1,0) |
| `lattice.star` | 1 | `triLattice(10,0)`, `star{n:6,c:.45}`. Triangles run huge to hairline at centre. | `c` .9 to .35 | (1,-1,0) |
| `lattice.dots` | 1 | `round:1`, `pole(1.4,-.85)`, `logring(0,5), spokes(0,30)`. Conformal dots, elements huge far away and tiny at the pole, as at 262 to 280 s. | θ sweeps W 0 to 1 and back, >= 4 s per sweep, so dots inflate, merge, invert | (1,0) |
| `lattice.sheetdots` | 1 | `round:1`, `plane(9,30), plane(9,120)`, `sheet{q:(2.1,1.3),v:(.25,.4),h2:.5}` | sheet amount, phases roll | (1,0) |
| `lattice.teeth` | 2 | `triLattice(8,90)`, `teeth{A:1.5,c:1.5}`, `slipGrid.c=1.5`, family 1 `slip:.25`. Stretched triangles in columns with hard seams. | A 0 to 2 | slip grows with `Phi` |
| `lattice.shepard` | 2 | `XOR_{l<4}[ L(2^(l+f)Y) ]` where layer `l` has duty `E(l+f)=.5 sin²(π(l+f)/4)`, `f=fract(tau/64)`. Band path loops the families per layer, `ink = ½(1+Π(2 ink_l - 1))`. Infinite zoom, no reset. Layers enter as specks and leave as hairlines. | zoom rate | `f` |

**Family `pole`**: Woo. Ladder: one blob, tangent pair, spiral, two poles, grazing pools. Nested circles tangent at a point are parallel stripes under 1/z, and emission is the stripe phase scrolling.

| Id | Ver | Genome | ARC | FLOW |
|---|---|---|---|---|
| `pole.garden` | 1 | `plane(2.5,90)`, two poles, `garden{lambda:-1,gamma:0,c:[1,1,0,0]}`. λ=1 stripes, 0 rings with γ turning them through spirals to spokes, -1 tangent circles, 2 hyperbolas. Non-integer λ opens a branch seam that reads as a paper cut. | λ, γ, pole positions orbit | (1) rings are born, never resize |
| `pole.pools` | 1 | Same, on quadric plane `z=0`, camera pitch 0 to 86° over 40 s. | pitch | (1) |
| `pole.target` | 1 | `pole(0,0)`, `ring(0,5), spokes(0,24)`, `wob .04`. The Lemon Glow target. | `lat.s`; rings/rays | (1,0) |
| `pole.emit` | 1 | One family with no plane or pole terms: `{flowL:1, dE:.5}`, local time on with `s = -S*R(p)`, `R` ring-shaped, `S = Rmax/c`, `T` global. Every ring is a beat, and its weight records the song. | `c` from 5 to 10%/s; a second focus needs `pole.garden` | `Phi_L` |
| `pole.spiral` | 1 | `pole(0,0)`, `spiral(0,5,3)`. Log spiral. | `k`, `n` under solid | (1) |
| `pole.necklace` | 3 | Field chunk: `Im cot(x+iy) = -sinh2y/(cosh2y-cos2x)`, `φ = k*Im cot(πz/d)+Phi`. XOR a rotated copy for a lattice of poles. | `d` | (1) |

**Family `room`**: Dive, Drunk in LA's end. Ladder: chevrons hairline to huge, square rooms, spiral, inset diamond.

| Id | Ver | Genome | ARC | FLOW |
|---|---|---|---|---|
| `room.nested` | 1 | `pole(0,0,{q:32})`, `logring(0,6)`, `swirl{beta:0}`. `q=1` diamonds, 2 rings, >=8 squares. | `q`, `beta` | (1) |
| `room.chevron` | 1 | `plane(8,90)`, `chevron{A:.06,c:4}`. Lattice-space, so teeth scale with lines. | `lat.s` over 5 octaves | (1) |
| `room.stair` | 1 | `pole(0,0,{q:32})`, `spiral(0,6,2)`. One continuous corridor; a Droste stair with no `mod`, so no seam. | `k` | (1) |
| `room.insets` | 2 | Scene. Slot A `plane(5,0),plane(5,90)` with `swirl{Om}`; slot B finer lattice, `lat.r` opposite; matte square. Dragged by the inset; `Om` reverses on an eased 16-bar cycle, winding within ±π. | inset size | `Om`, not `Phi` |
| `room.box` | 2 | Surface `room`: closed-form slab minimum, walls carry orthogonal stripes, exact `g_dX,g_dY`, no drawn seam. Matte door. | dolly, door | (1) depth stripes |
| `room.recursive` | 3 | Surface `room`, back-wall door re-enters scaled by `s`, up to 4 bounces. | door width | dolly `s^(tau/16)` |

**Family `stripe`**: Dark Spring. Ladder: bending stripes, bow-tie, folds, moiré ghosts.

| Id | Ver | Genome | ARC | FLOW |
|---|---|---|---|---|
| `stripe.river` | 1 | `plane(7,90)`, `wave{A:.15,om:.6,B:.08,om2:.4}`. | A, om; `lat.r` | (1) |
| `stripe.bowtie` | 1 | `plane(8,90)`, `bowtie{x0:0,eps:.06,Rx:a}`. | eps 1 to .02; `x0` travels | (1) |
| `stripe.ghost` | 1 | Sheet pair: `plane(k,90,{pair:1}), plane(k*(1+δ),90+ε)`, `k = pxUnit/6` at load, so carrier period is 6 px. A huge lattice from nothing. | δ 0 to .1, ε 0 to 3° | (1,1) |
| `stripe.ghostrings` | 2 | Sheet pair of rings: `pole(0,0), pole(.02,0)`, `ring(0,k,{pair:1}), ring(1,k)`. Fringes are the two-pole pattern, drawn in beats. Moiré discs. | second pole moves | (1,1) |
| `stripe.cloth` | 3 | Warp: `uv = p + A*∇h`, `h = Σ_{i<4} a_i sin(q_i·p+ω_i t)`. When A times the Hessian's negative eigenvalue exceeds 1 the map folds and stripes mirror at real fold lines. | A across that threshold | `ω_i` integer multiples of bar rate |
| `stripe.lens` | 3 | `φ = k*(x + A0 sin²(πx/W) sin(ωy+βx))`. Crowding reads as false ridges. | A0, β | (1) |

**Family `void`**: Black Car, L'Inconnue. Ladder: void closing, sliver, ribbons, zebra lump. Silhouettes are the pattern stopping.

| Id | Ver | Genome | ARC | FLOW |
|---|---|---|---|---|
| `void.frame` | 1 | Scene. `plane(9,0)` with matte `rect` void, `voidInk:0`. | rect grows to cover (1726 s) | (1) |
| `void.sliver` | 1 | Scene. `plane(24,75)`, matte `crack`. Fine zebra inside three wandering cracks. | `ε` 0 to frame | (1) |
| `void.ribbon` | 2 | `plane(6,0),plane(6,90)`, `ribbon{A:.5,om:1.3,W:.35,sigma:1.1}`, matte `ribbon` on white, family 0 `slip:.5` where `cos<0` (back side). Checkered ribbon crawling, twisting into cloth. | sigma | `t` in `a.z` |
| `void.zebra` | 2 | Phase chunk `ph_blob`: `G_i=r_i²/|p-c_i|²`, `G=ΣG_i`, `u=Σ(G_i/G) k (p-c_i)·e(a_i)`, `φ=u+β/G`. Matte `G>1` on black. Poles hold `c_i`, `r_i`. Stripes bend over implied lumps and shear where they merge. | `r_i`, β | (1) |

**Family `body`**: true 3D, no light. Ladder: planet in black, planet bigger than frame, floor, saddle.

| Id | Ver | Genome | ARC | FLOW |
|---|---|---|---|---|
| `body.planet` | 1 | Surface chunk `s_planet`: sphere hit, `X=(lon/TAU+spin, ln tan(lat/2+π/4)/TAU, 0)`, exact Jacobian from `dFdx(n)`, longitude cut safe. `plane(24,0),plane(24,90)`, `round:1`. `c.x` integer and `lat.s=1`, so the longitude closes. Conformal: dots stay round and crush only at the limb. | radius past frame size | spin |
| `body.floor` | 1 | Quadric plane. `plane(2,0),plane(2,90)`. Checker floor to the horizon. | pitch, dolly | (1,0) |
| `body.saddle` | 2 | Quadric saddle, `c=1.5`. | pitch, `c` | (1,0) |
| `body.tube` | 2 | Quadric tube, camera inside, looking along the axis. `plane(4,90)`: bands around the tube. Tunnel. | dolly | (1) |
| `body.torus` | 3 | Marching surface, hero, heavy. `X=(2P,|P|²-1)/(|P|²+1)`, rotate in XW and YZ, `A=atan2(X.y,X.x), B=atan2(X.w,X.z), eta=atan2(|X.zw|,|X.xy|)`, step `d=(eta-eta0)(1+|P|²)/2`, at most 14 steps. `φ=mA+nB`, `m=n` draws Villarceau circles. The XW rotation turns the tube inside out around you while squares stay square. Ships only if 14 steps fits the budget. | `a` | A, B |

**Family `song`**: places made of the score. Songs only.

| Id | Ver | Genome | Notes |
|---|---|---|---|
| `song.horizon` | 2 | Quadric plane, depth means future: `s = +depth/c`. `dE`, `bend` on. The chorus swells on the horizon 10 s before it arrives. Nothing reacts; you fly into the score. | `depth(p)` from the camera ray. V1 already has `depth` for fronts. |
| `song.staves` | 2 | `plane(6,90,{bend})`, `s = p.x/c`. The melody channel. | One motif, judged by eye on 3 songs. |

**Family `illusion`**: natively 1-bit, cheap. Numbers assume 57 cm viewing, about 100 device px per degree on a 14" retina.

| Id | Ver | Genome | Notes |
|---|---|---|---|
| `illusion.logflow` | 2 | `spiral(0,6,12)`, `φ = 12Θ + 6 ln ρ - Phi`. Temporal frequency uniform, scale follows the retina, and it can't be pursued by eye. | The Hold's carrier. Flow rate = `rate/N` nearest 2.5 Hz within 3 Hz; `N=½` allowed here only. |
| `illusion.relief` | 2 | Phase chunk `ph_relief`: `h = smoothstep(σ,-σ,sd(p))`, `φ = f*y + g*h`. `g=.5, σ→0` is an abutting-grating contour, a shape with no edge. `g>1, σ≈.3` is a Riley bulge. One "hardness" knob runs hill to phantom. | Gate `g` from 0 to .5 over 1 s and a shape condenses out of nothing. |
| `illusion.cone` | 3 | `pole(0,0)`, `ring(0,5)`, `cone{u:(cos wt,sin wt),k:.2}`. Flat rings become a deep cone with no shading. | Rings must stay untextured. One revolution per bar. Needs >= 25 s with no scale change in the first 15 s. |
| `illusion.barber` | 3 | `plane(8,45)` with flow inside a matte of aspect >= 3:1. Rotate the matte over a phrase and the perceived current turns while stripes don't. | Tool: drag the opening to steer the river. |
| `illusion.magnifier` | 3 | Sheet pair with `c_j=(1+d)c_i`. `M=1/d`. `d=.04`: lines creep .1°/s, beats move 2.5°/s. | 8/10 on retina, 5/10 at 1x. |

**Family `inf`**: heroes, V3, one at a time, with budget checks.

| Id | Genome |
|---|---|
| `inf.river` | Field chunk. `w=(π/2)p+(vt,0); z=tanh(w/2)`, fold to {7,3}. `f = parity*edge distance`. Tiles pour along a centreline and crush to hairline at top and bottom; the translation is an exact isometry. |
| `inf.cusp` | Field chunk. Up to 32 steps: `x-=round(x); if(|z|²<1){ z=(-x,y)/|z|²; n++ }`. `f=(-1)^n sign(x) min(|x|,.5-|x|,|z|²-1)`. Giant triangles at top, infinitely fine at the bottom edge: the whole scale journey in one frame. |
| `inf.phason` | `sum:1`, five `plane(k, 72j)`, `ph_j = g·e_{2j}`. `g` moves in perpendicular space, so nothing translates and tiles flip in place. Data only. |

That is 21 patterns in V1, 13 more in V2, and 11 more in V3.

**Hypnotic versus busy, as rules authors follow:**

1. One thing moves. At most 2 independent motions.
2. Expected, never completed. The eye predicts and is proved right, indefinitely. Summed sines have no direction to predict.
3. A frequency gradient: at least 3 octaves of local scale in a hero frame, with a convergence point. Uniform frequency is wallpaper.
4. Conformal or foreshortened, not noise. Checks under 1/z read as space. The same checks under noise warp read as a defect.
5. At most 4 edge crossings per second per pixel outside moiré.
6. Half-and-half contrast, then patience.

---

## 6. The modes

Both modes run the same score, so the toggle never re-plans a film. It changes only the plates and the inks. Key: `B`.

### 6.1 Pure

- `uPure = 1`. Display writes `ink.rrr`, so maximum channel difference is exactly 0 (test 1).
- One plate computed, `uMode.x = 1`.
- Everything field-based stays available: fronts, Hold, moiré, rings. They are 1-bit.
- The film is the rule set: one family, half-and-half, hard edges, long gestures.
- No palette exists in this path. Plate shifts in the score are ignored.

### 6.2 Beyond: colour that separates out of black and white

**Plates.** The field is printed two or three times, and colour exists only where plates disagree. Each plate has a shift, a spin, a phase reg, a time offset and a duty offset (`uPlate`, `uPlate2`):

```
φ_i^k = φ_i + dot(∇φ_i, D_k(p)) + reg_k        first order, no extra field evaluation
D_k(p) = shift_k + spin_k * perp(p)            spin: misregistration grows from a pole
θ_k    = mix(θ_slow, θ_end, T(tL - dt_k)) + dd_k
c = ink0*I0 + ink1*I1 + ink2*I2,   I0+I1+I2 = (1,1,1) exactly, byte-wise
```

- **Zero offset is the film, by algebra.** If all plates are equal, `c = ink*(I0+I1+I2) = ink`. Because the ink target is 8-bit, this is byte-identical to pure mode (test 2).
- **Two plates, four inks by default.** With `I2 = 0`: black, `I0`, `I1`, white. Raw RGB corners read as CGA and RGB-split glitch, so they are not used.
- **Inks** (bytes; each set sums to 255 per channel):

  | Name | I0 | I1 |
  |---|---|---|
  | `cobalt` | 16,48,255 | 239,207,0 |
  | `vermilion` | 255,56,16 | 0,199,239 |
  | `hotpink` | 255,0,128 | 0,255,127 |
  | `violet` | 96,0,255 | 159,255,0 |
  | `print`, three plates | 230,40,0 and 25,175,40 | 0,40,215 |

  The palette changes only while the frame is solid, and the score picks one per label. Pure-red-heavy palettes never change more than 25% of the frame per .33 s (test 16).

- **Colour follows scale, for free.** Shift is in device pixels, so at macro scale it is a tiny fraction of a period: huge black and white shapes with a coloured hairline at their edges. On fine lines the same shift is a large fraction of a period, so the lines mix optically into a coloured wash. The scale journey is the colour journey.
- **Song form.** A `plates` track in each gesture. Plates re-register at every landing, stay shut in verses, and open across choruses over at least 4 s. Maximum shift 1% of frame width, or reg `¼`.
- **Time plates.** `dt_1 > 0`: a duty sweep or a front arrives in one plate, then the next, a chromatic wavefront. Black, red specks, yellow, white. At most one landing in three; on those, test 7 checks plate 0.
- **Third plate.** Opens once per song, at the climax.

**Quadrature stop.** Two plates at `reg = ¼` with `cobalt` give bands in the order black, blue, white, yellow. That is the luminance order that drives peripheral-drift illusions. On a held chord, stop real motion for 4 to 6 s, and the frozen picture should crawl in your peripheral vision. At most once per song. Strength needs the owner's eyes; if it doesn't read, remove it.

### 6.3 The Hold (both modes)

The only real illusion with a musical payoff, and it runs on 1-bit. Other visualizers never stop; this one stops and keeps moving.

1. The planner chooses at most 2 moments per song, at least 90 s apart, at the biggest thinning of the music. Having heard the whole song, it commits to a flow direction 35 s before each one.
2. For those 25 to 40 s, the sign of the radial or rotary flow stays constant across gestures. Everything else keeps changing: duty, warp, elements. **Hold the direction, not the pattern.**
3. At the moment: `Phi` eases to rest over .5 s and the frame freezes for 3 to 6 s. The still picture pours backward.
4. Flow restarts, in the new section, over .5 s, or the frame goes solid.

The frame freezes with `illusion.logflow`, or with any family using `flowVector` on a pole. A frozen frame cannot flash. Calm mode removes the Hold.

### 6.4 Calm, and the warning

The look cannot meet stripe guidance such as Ofcom's, so we warn. First run shows one plain screen (see 7.5). `prefers-reduced-motion` starts in Calm. Calm means: minimum period 1.5% of frame width, flow cap 5%/s, sweeps 1.5x longer, no Hold, no time-fronts, no sway. The limits in test 8 and test 9 apply in every mode, including to the hand: user tools pass through the same slew limit (`dW/dt <= .7/s`).

---

## 7. Tools and interface

**The picture is the interface.** On first load there is no splash and nothing to read. Stripes are already moving. The sheet bulges under your cursor. You scroll into a hairline shimmer, slide sideways, it swallows to black, and specks come out as something new.

### 7.1 Verbs

| Input | Verb | What it does |
|---|---|---|
| Move, no button | **Press** | A ball under the sheet follows the cursor with about 250 ms of spring lag (`press` warp, `σ=.35, amp=.35`). Stripes read as 3D within a second. Nothing persists. Fades out 3 s after the mouse stops. |
| Drag | **Push** | Writes displacement to `Ψ`. You comb lines by hand. Stamps are Gaussians, radius .2 units, weighted by drag speed. They relax over Memory (default 20 s; `∞` bakes into the patch). |
| Scroll, pinch | **Journey** | Log zoom about the cursor, hairline (period 4 px) to larger than the frame. `lat.s *= exp(-dy*.002)`, spring-eased, at most 2 ln-units/s. |
| Two-finger sideways, `Alt`+scroll, or `[` `]` | **Duty** | Slides `θ` at most `dW/dt=.7/s`. Past the solid is the next pattern, so the axis is an endless corridor. The film's grammar is built into the hand. |
| Press and hold .5 s | **Pole** | Adds `Q*ln ρ` to family 0 at the cursor, `Q` rising at .5 per second. A ring opens about every 2 s, pushing the others outward. Poles persist and interfere. Up to 4. Double-click removes one over 1 s. |
| `Shift`+drag | **Sheet** | Lifts a copy and lays it on top as a sheet pair. Horizontal drag shifts it, vertical rotates it, `Shift`+scroll detunes. Fringe period is `p²/Δp`: at `p=12, Δp=.1` px, one pixel of hand moves a fringe about 120 px. **Detents:** magnets at ratios 1:1, 2:3, 3:4 and at zero rotation, ±.4% wide, where fringes lock into a clean rosette. It feels like tuning a radio. |
| Drop a song | **Score** | What you made becomes that song's family. `autoLadder(patch)`: rung 0 the patch, then a new family by sliver, duty flips, the scale extreme, then a warp variant. |
| `Alt`+drag (V3) | **Cut** | Draw a closed shape. Inside it, a different genome. Baked to an SDF texture. No solver. |
| Mouse in film, `T` to arm (V2) | **Time tilt** | Left of the frame is 8 s ago, right is the future. Springs back over 2 s. One uniform. |

**Why someone loses an hour:** leverage (the 120x moiré response), no failure state (everything is continuous and reversible, never a blank canvas), and the loop: drop a song on what you made, watch four minutes of your pattern as a film, go back and fix it.

**During a film:** Press and Push always apply. Journey and Duty are overlays that ease back over 8 s. In Explore they change the pattern for good. After 20 s idle in Explore, the film resumes from whatever is on screen.

**Undo.** `Z` and `Shift+Z`. Each verb release is one snapshot.

### 7.2 Panels

Nothing is visible by default except the picture. All panels overlay; the canvas never resizes.

- **Library** (left, 256 px; `L` or hover at the left edge). Families as plain headers, patterns as live 128x72 thumbnails rendered once at boot through the real program, then static. Click travels there by a duty sweep. A "mine" group holds saved patches.
- **Knobs** (right, 256 px; `K` or hover at the right edge). The pattern's `axes`, then the universal knobs: scale, rotation, duty, flow gear, hand-cut, memory. Double-click a knob to reset. Save, copy link. A link holds the genome, base64 of gzipped JSON via `CompressionStream`. `Ψ` is saved only in a patch file, at 128x80.
- **Song strip** (bottom, 28 px; appears when a song is loaded; `S` or hover). Blocks by label, letters A B C. Landing ticks: a black or white square for a solid, a diagonal for a front. One-pixel inverted playhead. Click seeks. Hover names the cue and time. In V4 the strip's background is the song's kymograph poster.
- **Listening.** A one-pixel progress line along the bottom edge and the word `listening`. The picture keeps travelling. No spinner.
- **Atlas** (V3; zoom out past hairline). Your pattern is the centre tile among live neighbours in one screen, `genome(cell) = mutate(me, hash(cell), strength ∝ |cell|)`. Adjacent tiles are one gene off. Mutations move only along `axes` and curated moves (open a family at 60°, swap a plane for a ring, change a warp within range); every mutant must pass the boldness check, because random genomes are junk. Clicking flies you in, arriving through a duty sweep. Your path stays on the map as a trail, so undo is flying back. Drawn as one scissored draw per tile.

### 7.3 Keyboard

| Key | Action | Key | Action |
|---|---|---|---|
| `Space` | play, pause | `L` `K` `S` | Library, Knobs, Song strip |
| `←` `→` | seek 5 s | `H` | hide everything |
| `N` `P` | next, previous pattern, by duty sweep | `F` | fullscreen |
| `B` | Pure or Beyond | `M` | Calm |
| `[` `]` | Duty | `Z`, `Shift+Z` | undo, redo |
| `,` `.` | visual lead ±10 ms | `R` | one gene off, inside the pattern's axes |
| `?` | one line of help per verb | `Esc` | close panels |

### 7.4 How it looks

The interface belongs to the film: 1-bit, hard-edged, patient.

- Solid black panels with a 1-device-pixel white hairline. No rounded corners, translucency, blur, shadow, gradient or colour. In Beyond the interface stays black and white.
- Type: `ui-monospace, "SF Mono", Menlo, monospace`, 11 px, lowercase, tabular figures, generous line height. No icons except a few hard 1-bit glyphs.
- Knob: a 1 px full-width line, 3 px thick on the filled side, a 1x11 px vertical thumb, a tick at the default. Label left, value right.
- Hover inverts a row, instantly. No easing anywhere in the interface: things appear and disappear in one frame, while the picture does all the moving.
- Cursor: `cursor:none`, a 13 px plus in `mix-blend-mode:difference`, so it's always visible on any pattern.
- Everything hides after 2.5 s without mouse movement, except during a drag.
- On first load, one line at the bottom: `move · drag · scroll · hold · shift-drag · drop a song`. It leaves after the first drag or 12 s and never returns.

### 7.5 First run

Black screen, one paragraph, two words:

> This is high-contrast moving stripes. If you're sensitive to flashing or to patterns, use calm, or don't continue.
>
> `continue`    `calm`

Remembered in `localStorage`, wrapped in try/catch.

---

## 8. Acceptance tests

Run on the real GPU at 3024x1964 via `T.pixels`, on full films of 3 real songs from `media/` plus synthetic ABABCB audio made in `tests/lib/synth.js`: a click with a ±5% tempo ramp, ABABCB with a transposed last chorus, and a 12-semitone slide. Calibrate shared measures on the film first. Thresholds are starting values. `tools/check.mjs vN` runs each version's list and prints pass or fail.

| Done | # | Test | Pass | From |
|---|---|---|---|---|
| [ ] | 1 | Chroma in pure mode | Maximum channel difference is 0, exactly | V1 |
| [ ] | 2 | Plates at zero offset vs pure mode | Byte-identical | V2 |
| [ ] | 3 | Edge grey: non-0/255 mask eroded by 1 px | <= .5% of frame, excluding period < 4 px | V1 |
| [ ] | 4 | Flat grey: 16x16 blocks, mean .25 to .75, SD < .15 | <= 1% of frame | V1 |
| [ ] | 5 | White fraction per song | Non-solid median .3 to .6; p5 <= .1, p95 >= .9 | V1 |
| [ ] | 6 | Solids (white <= .001 or >= .999) | Median gap 18 to 30 s, median length 1 to 2 s, longest <= 10.5 s, both colours | V1 |
| [ ] | 7 | Landing: first solid, or last old pixel on a front | ±1 frame of plan; median <= .25 s from true boundary; circular-shift test p < .01 | V1 |
| [ ] | 8 | Flash: whole frame and 4x4 tiles | Whole-frame `|ΔL|` <= .025 per 1/60 s and <= .35 per .5 s; solid-to-solid >= 3 s; on both, under 3 opposing >= .1 swings per second | V1 |
| [ ] | 9 | Per-pixel reversal | p99 <= 6 flips/s, excluding period < 4 px | V1 |
| [ ] | 10 | Twinkle: flip and return within 3 frames at 60 fps | <= .2% of pixels, <= 1% in moiré regions | V1 |
| [ ] | 11 | Motion, STUDY measures | Flow median 5 to 10%/s, cap 20; no step in second difference > 3x local median; `|r(speed, onsets)|` <= .25 | V1 |
| [ ] | 12 | Lock | Kymograph FFT peak within 1% of `1/(NT)`, SNR >= 10 dB; frame correlation >= .9 at `NT`, <= .3 at `NT/2`. Measured on cruise with `|d lnS/dt| < .02/s`. | V1 |
| [ ] | 13 | Travel | Median correlation at 26 s lag <= .2; edge density ratio >= 8 in >= 60% of gestures | V1 |
| [ ] | 14 | Boldness | Over half the area at period < .5% of width in <= 15% of frames | V1 |
| [ ] | 15 | Return, ABABCB | A1 to A2 correlation >= .8, A to B <= .2 | V1 |
| [ ] | 16 | Colour | <= 2% off-palette excluding ramps; palette changes only under solids; saturated red area <= 25% change per .33 s | V2 |
| [ ] | 17 | Frame rate | M4: rAF p99 <= 17.5 ms, <= 1 drop per 1000 frames at 60, top tier >= 99% of time, no frame blocked > 50 ms by compile. 1080p integrated: >= 55 fps after governor | V1 |
| [ ] | 18 | Determinism | 100 random seeks hash equal to linear playback (`seek(k/60)` both ways, empty edits) | V1 |

**Music analysis tests** (synthetic ground truth, V1):

| Done | Test | Pass |
|---|---|---|
| [ ] | Beat F-measure at ±70 ms | >= .95 |
| [ ] | Rate jitter above .5 Hz | < .5% |
| [ ] | Pairwise label F, including transposed chorus | >= .9 |
| [ ] | Edge crossing focus vs beat | p95 <= 1 frame |
| [ ] | Coverage and speed power at beat rate vs neighbouring frequencies | <= 3 dB |
| [ ] | Another song's audio (chance test) | Landing and lock scores collapse |

**Tests needing the owner's eyes:**

- [ ] **Blind (V1).** 3 songs, true score vs lock offset half a beat and landings moved 2 bars. He picks the true one in at least 5 of 6. If not, the music system hasn't earned its complexity, and we simplify before V2.
- [ ] **Hold (V2).** The owner and 2 others report reverse flow on a first viewing.
- [ ] **No instructions (V1).** Push, Journey and Duty found within 60 s.
- [ ] **Side by side (V1).** 12 film frames and their motion reproduced: 255 s dots, 275 s dots, 460 s target, 490 s squeezed checker, 960 s triangles, 972 s macro hand-cut, 1000 s star lens, 1180 s spiral rooms, 1500 s chevrons, 1726 s void, 2200 s two poles, 2225 s pools. If families and warps can't reach a frame, add a chunk.

**Per pattern (`tests/pattern_check.mjs`):** compiles; reaches both solids under `T`; flowVector returns the frame (correlation >= .99 at `Phi+period`, warps static); at most 15% of frames bold-fail along its arc; no flat grey > 1% in cruise.

---

## 9. Version roadmap

Each version is a real leap that can be pushed and tried alone. To release: `node tools/check.mjs vN`, bump `src/version.js`, commit, `git tag vN`, push to `https://github.com/evancodez/trippee.git`, then tell the owner in three lines what's new and what to try first. The owner asked to be told every time.

### Stage 0, before anything: the edge lab (one day, one file)

`tools/edgelab.html`, no app. **Biggest technical risk: clean edges in motion across the whole scale range.**

- **Clips, at native pixels:** checker zoom from macro to 3 px; dots swept to last specks; triangle lattice at `θ→±θ_solid`; fine stripes rotating 3°/s; rings into a pole; two 6 px gratings slowly detuning.
- **Strategies:** A, finite-difference ramp on `f` (baseline). B, the band filter of 2.6. C, soft path with curvature floor and speck gain (the dots).
- **Scoring:** tests 4 and 10, computed from `T.pixels`-style readback, then **look at the real panel** in both its default and a scaled display mode, because captures can't show the compositor resampling.

Run it through `lab.mjs` with `--url http://localhost:5300/tools/edgelab.html`; the page sets `window.trippee = {ready:true}`.

Expected result: B wins. If it doesn't, stop and fix this before building anything else, because everything rests on it. The first fallback is the virtual lattice: per family, `ph += smoothstep(.33,.5,g*cell)*dot(grad,snap)` with `snap = (floor(px/cell)+.5)*cell - px` and `cell = 2`, which point-samples hairlines at a coarse grid. It is pixel-locked, so it is a fallback only.

### Stage 1: contracts (one person, one day)

The lead writes and freezes: `src/core/types.js`, `src/core/genome.js`, `src/patterns/kit.js`, `src/patterns/manifest.js`, `src/chunks/manifest.js`, the UBO layout in `src/engine/pack.js`, `src/glsl/prelude.glsl.js`, an API stub in `src/api.js` and an empty `src/main.js`. After this, `genome.js` and `pack.js` change only by additive request to the lead. `src/main.js`, `src/api.js`, `index.html` belong to the integrator.

### V1: "The Film and the Hand"

The owner opens it and it's already moving. He pushes stripes around, runs a moiré fringe across the screen with a one-pixel move, drops a song on it, and 20 seconds later it's a film: pure black and white, the first speck landing on the first downbeat, lines locked to the tempo with no pulse, a chorus coming back as the same picture, big changes arriving as a wall that converges to land on the exact frame, rings wearing the last seconds of loudness.

**Contains:**

- **Engine:** Ink and Display, band and soft paths, sheet pairs, tiers, governor, per-pixel `T`, `Phi_L`, `m`, `E` from the score texture, local time with ring, room and depth shapes.
- **Patterns (21):** `lattice.master, kagome, checker, star, dots, sheetdots`; `pole.garden, pools, target, emit, spiral`; `room.nested, chevron, stair`; `stripe.river, bowtie, ghost`; `void.frame, sliver`; `body.planet, floor`.
- **Scenes:** `scene.twin-planets` (`over` mode, two `body.planet`, as at 255 s), `scene.void-floor`, `scene.void-frame`, `scene.sliver`.
- **Chunks:** warps `liquify, press, sheet, bowtie, squeeze, wave, swirl, star, garden, chevron`; mattes `rect, disc, crack`; surface `planet`.
- **Transitions:** `duty, sliver, scale, lerp, reconnect, void, crack, front`, plus emission.
- **Music:** full analysis; gears; landing DP and kinds; gesture solver; `canon` replays; channels `flow, record, swell`; bake loop; audit; silent film.
- **Composer families:** lattice, pole, room, stripe, dots, body.
- **Tools:** Press, Push, Journey, Duty, Pole, Sheet with detents, drop a song on your pattern, undo, save and link.
- **Interface:** Library, Knobs, Song strip, Listening, first run, keyboard.
- **Calm.**
- **Tests:** 1, 3 to 15, 17, 18; music tests; pattern check; Blind, No instructions, Side by side.

**Lanes in parallel (no shared files):**

| Lane | Files | Depends on |
|---|---|---|
| E, engine | `src/engine/*`, `src/glsl/*` | Stage 0, 1 |
| C, core | `src/core/frame.js, curves.js, rng.js, fieldjs.js`, `src/transitions/*` (one person per file) | Stage 1 |
| P, patterns, any number of authors | `src/patterns/<family>/<name>.js`, `src/chunks/*/<id>.js`, `src/scenes/*`, one file each | Stage 1; a stub engine is enough to start, E's first render to judge |
| M, music | `src/music/*` | nothing; tested in node and worker on `media/` |
| S, score | `src/score/*` | `Analysis` shape in 3.1 (M can be mocked); `Track` from `curves.js` |
| T, tools | `src/tools/*` | Stage 1; `edits` overlay is read by `frame.js` through `edits.js`'s pure function |
| U, interface | `src/ui/*`, `style.css` | `T` API |
| Q, tests | `tests/*`, `tools/check.mjs` | `T` API |
| I, integrator | `index.html`, `src/main.js`, `src/api.js`, `src/version.js` | everyone |

The critic placed the per-pixel score in V2. It moves to V1, in minimal form, because V1 must show the new idea with music. The rest of the critic's V2 stays in V2.

### V2: "Beyond"

Colour separates out of the black and white. The Hold. Moiré as a transition. Chords and melody take shape.

- **Plates:** shift, spin, reg, time offset, duty offset; four palettes; three-plate climax; quadrature stop. The `B` key does something.
- **The Hold**, with the direction planner.
- **Transitions:** `tune`, `levelset`, `shepard`, contour-shaped fronts, hash-shaped local time ("each dot swells at its own moment").
- **Music channels:** `pose`, `staves`.
- **Tools:** Time tilt.
- **Patterns (13):** `lattice.teeth, shepard`; `room.insets, box`; `void.ribbon, zebra`; `body.saddle, tube`; `song.horizon, staves`; `illusion.logflow, relief`; `stripe.ghostrings`.
- **Chunks:** warps `lens, teeth, ribbon`; mattes `ribbon`; phases `blob, relief`; surface `room`.
- **Composer family:** void.
- **Tests:** 2, 16, Hold.

| Lane | Files touched |
|---|---|
| Plates | `src/glsl/main.glsl.js`, `src/glsl/display.glsl.js`, `src/engine/pack.js` (plate fields already reserved), `src/score/plates.js` (new) |
| Hold | `src/score/hold.js` (new), called from `compose.js` |
| Transitions | `src/transitions/tune.js, levelset.js` (new), `src/glsl/field.glsl.js` (Shepard layer loop) |
| Channels | `src/score/channels.js` (new) |
| Patterns | new pattern and chunk files only |
| Tools | `src/tools/verbs.js`, `src/ui/*` |

`compose.js` and `field.glsl.js` each have one editor at a time. Everything else is independent.

### V3: "Atlas"

The way to explore. The way to keep what you found. The heroes.

- **Cut.** SDF baked from a freehand closed stroke to R16F 512x320, read as a matte.
- **Atlas with trail.**
- **Export.** Offline stepping into WebCodecs with a hand-written fMP4 muxer (about 250 lines) plus the song's audio. It can't drop frames, and it proves determinism. Tool gestures from the edit log re-render exactly.
- **Heroes (11):** `body.torus, room.recursive, inf.river, inf.cusp, inf.phason, stripe.cloth, stripe.lens, illusion.cone, illusion.barber, illusion.magnifier, pole.necklace`. Each ships only after its budget check.
- **`fringe` channel.**
- **Field plugin path** in `shader.js`.

Lanes: Atlas `src/atlas/*` + small hook in `renderer.js`. Export `src/export/*`. Cut `src/tools/cut.js`, `src/chunks/matte/cut.js`. Heroes: own files; lead merges the field path. No conflicts apart from `renderer.js`, one editor.

### V4: "Instrument"

The picture makes sound. You can play it.

- **Record.** Hold `R`, capture your motions, loop them as a gesture quantised to the phrase.
- **Read Head.** `L`: draw a line. The field along it renders to a 2048x1 target, read back through a PBO and `fenceSync`. Edge list goes to an AudioWorklet that synthesises pulses with polyBLEP. Stripes crossed set the harmonic, duty is pulse width, a solid is silence. Quantised to the song's key, low-passed near 2 kHz. A one-day spike decides it; the raw version is a dentist's drill. Keep only if it's an instrument.
- **Cursor audio.** A second source plays the moment the cursor points at, -14 dB, panned by x. Goes with Time tilt.
- **Poster.** Centre column every 1/30 s into a 9000x2160 1-bit PNG, via the same stepping as export. Also the Song strip's background.

Lanes: `src/record/*`, `src/readhead/*`, `src/export/poster.js`. No shared files except `src/tools/input.js`, one editor.

### V5: "Living and Lab"

Things that might be wonderful and must prove it by eye. Each is a spike with a keep-or-drop gate, and each drops without loss.

- **Living handover.** Swift-Hohenberg (R32F, 512x288, explicit, `q²=.4, r=.1, dt=.06`, 4 substeps) as a 4 to 10 s handover only: set `u0 = Z(now)` so the picture doesn't change, raise the living layer, then pull toward the next lattice. The crystal melts and recrystallises as something else. From a fixed seed, re-simulated on seek, so determinism holds. Two-day spike. As a whole scene it's a fingerprint screensaver, so it never becomes one.
- **Stir** (from the artist's list): a half-res UV buffer, `U'(p)=U(p-v*dt)`, a blinking vortex swapping centres every 2 bars, and the finger as another vortex. Stripes go to hairline in about 6 blinks, then a landing resets it. It holds state, so it re-simulates on seek from the last solid.
- **Virtual-lattice aliasing** as an optional crunch look, if the fallback in Stage 0 turned out to look good.
- **Composer timeline:** edit the song's map, per section. Not asked for. Only if the owner wants it.
- **Phase advection and motion fields**, only if plain `ψ` feels dead.
- **Sheet mesh** with MSAA, only if true fold-over is missed.
- **Level-set matte solver and knife**, if analytic mattes run out.
- **Illusion presets in the lab:** kinetic depth dots, motion-only form, Pinna-Brelstaff by zoom, neon veil, afterimage fill, equiluminant stop, chromostereopsis stop, Ouchi sway, and `det` colour moiré (it risks an oil-slick look close to the rejected chrome). Each is a preset until proven by the owner's eyes.
- **Live mic, recall, hum.** Same shader, `uSign=-1` only, PLL clock. These give up the whole-song advantage, so they are a separate input mode.

All in new directories: `src/living/*`, `src/lab/*`, `src/live/*`.

### V6: Figures, optional and separate

The hand and the face from the old app, made cooler. **Kept strictly apart.** Figures enter only as a matte input (`src/chunks/matte/figure.js` reading a baked SDF texture), so nothing else needs to know about them. `src/figures/*` holds the bake and the hand's cursor logic.

- Hard silhouette that cuts against what's behind it. The pattern decides how it looks, and it lies flat. No chrome, no highlights, no own stripes.
- The hand's reference: closed fist when held, a short wrist, a forearm sloping into a wide melted flare. The cursor sets the wrist, and clicking must not throw it forward. The face: a mask lying in the sheet, with parts above and parts sunk below, no round skull.
- **Phase-shift hand:** abutting gratings via `ph_relief`, so the hand has no outline, only an illusory contour. New.
- **Stripe mirror:** webcam luminance bending stripes, `φ = k*y + A*L`. Local only, nothing uploaded. In this lane because it's a party trick.
- Never in songs unless asked. Fewer and better.

### Never build

The earlier proposals contain these. They were tried on paper and rejected. Do not bring them back.

- **Engine:** per-pixel `switch` interpreter or user-ordered warp stack (breaks derivatives and any-to-any lerp). Generated per-scene shaders. Ray-marched SDF scenes, lighting, normals, bloom, TAA.
- **Living things:** Gray-Scott, CGL, wave tank, XOR feedback, fluid. Blobs, flicker, screensaver.
- **Music:** band-to-parameter mapping, note triggers, anything beat-synced in amplitude, melody FM, plate modes as a pattern, viewer model, section `kind` pools, chord-to-hue.
- **Patterns:** `Schottky Pearls`; the old ornament looks (Cymatics, Julia, Mandala, Khatam, Rosette, Lace, Truchet, Silk, Chrome, Colonnade, Menger, Gyroid, Penrose, Möbius, Pulsar, Pin Art, Ink, Living, Agate).
- **Colour:** orientation-to-hue, palette swatches, hue rate, glow.
- **Illusions:** McCollough (hours of altered vision, and it corrupts judging pure mode), Pulfrich, Benham, reverse-phi, four-stroke, scanimation, double-drift, stereograms, anaglyph, WebXR, phone decoders, 3D prints.
- **Tools:** breeding screen, abstract map, solid-of-song view.
