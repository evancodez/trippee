# Worlds: the plan

The owner asked for modes that are worlds, plus music that is more engaging. This is the plan to build both. It's reviewed against the code as it stood on 6 Nov 2026 (tree at `e7dee12` plus uncommitted work), but nothing here has been run. **Every cost is an estimate and every threshold a first guess until a test says otherwise.** The bar for a world: one still frame names it, and no two can be mistaken for each other.

With no world on, the black and white film and Beyond stay byte-identical. `docs/DESIGN.md`'s "Never build" list and `docs/NEXT.md`'s "Do not build" list don't bind a world's own contents. They still bind the film. The owner's standing taste binds everything (below, and `docs/ENGINE.md`).

## 1. What the review changed

The designers' reports were checked against the code. These are the changes that matter.

**Bugs in the plan, found in the code**

- **Line numbers jump at every slide and bend landing.** `matchFamilies` (`xform/plan.js`) adds a whole number of cycles, `offset`, to each paired family, because "whole cycles are invisible". They aren't invisible to `floor(phase)`. A slide or bend ends at `ph_B + offset`, and the next frame's plain path has `ph_B`, so every line's ink would change at once. `flip` reverses the numbers, and `pair[i] != i` puts a different family in the place the colour reads. The engine report caught only the last. The fix is the ink rule in section 4.
- **`floor(2*ph+.5)` is wrong when duty or threshold isn't 0.** It flips where `tri(x)=0`, not where the edge is, which leaves slivers of the wrong ink on every fattened line. The exact form is in `lineRows`, section 4.
- **Every world needs a real coverage `c`.** The planner's `R.probe`, the rehearsal's `measure`, the sound reader and the hand all read the picture as black and white. So `c` stays exact in every world, and a world's colour is computed beside it, never instead of it. Two designs changed:
  - Dusk no longer replaces `inkBand`. Its tails are worked out in the colour stage.
  - Polariscope can't be family-free. Its fringe order becomes a field going into a family's phase, which raises its cost from "3-5 ms" to about 8.
- **Cut's wiggle can't go in before the gradient.** `u=floor(b)+a` jumps by a whole turn at each groove, and `dFdx` there makes a grey line along every groove. The wiggle is added after the gradient, the way angles already are.
- **`voiced` can't drive anything.** The choreography report says it's nearly constant on the test songs. Dusk's sun takes the conductor's tune gain instead.
- **Rests are rare.** They fire 0, 0, 1 and 1 times on the four test songs (reported, not rechecked), and three whoas depended on them. Each now has a trigger that always exists: `M.arrivals`, or the new `M.ending`.

**Taste corrections**

- **Flyer's snare on 2 and 4** plus a kick on 1 and 3 is every beat, which is exactly what the owner rejected. The snare's slip now falls once per bar, on the 4, moving into the 1. The designer's own failure note saw the jitter.
- **Flyer's Scope pattern is rejected.** Stacked waveform rows are the stock oscilloscope look and one famous album cover.
- **Pearl's first-order colour is out.** Gold and peacock at luminance .26 to .97 read as oil or metal, and the owner has said no chrome. Pearl's depth stops at second order.
- **Pearl held too still** for "keep travelling". It gets a slow camera.
- **Acid's velvet is capped.** A line on violet-black at few echoes is large empty black, so echoes never fall below 2, and velvet stays under 35% of the frame with no big disc.
- **Flyer's hit is softened** from 120/70/300 ms to 200/120/400 ms, and it has to pass Jerk.
- **The flash limit tightens.** Worlds must read under 2 per second on a tile, so 1 at most in any second. The judge's `flashTile` for the film stays as it is.

**Disagreements resolved**

- **History buffer: dropped.** The engine report offered a feedback pass, and every designer who needed trails found a pure way instead (Acid's lag, Dusk's analytic tail, Liquid Light's traced map). Purity is what makes seek, rehearsal and recording work, so nothing needs it. That saves a lane and 48 MB.
- **Pair programs: dropped.** The engine report built one program per pair of worlds, so that a mode change could mix two colour methods from one `c`. Instead, a mode change passes through the film at the middle of its flight: world A's inks drain band by band, the frame is exactly black and white at `x=.5`, the programs swap there with no pixel changing, and world B's inks arrive band by band. That means no combinatorial compiles, and the swap can be proved by hash. Mixing two worlds directly can come later if the owner wants it.
- **`ANALYSIS_VERSION`: not bumped.** Rock and Dream both add analysis. All new analysis goes in a sidecar, `src/music/extras.js`, with its own cache key, so the film's analysis and its cached copies are untouched. Three designers each wanted an echo measure (`A.wet`, `A.echo`, `A.echoLag`); there is now one.
- **Brake and Stride edit the same function** (`surgedBeats`). They merge: Perception's shape, with Choreography's table as its depth.
- **Held breath and Wind and release are one idea at two scales.** They merge. Both warp `phi` only and never `score.time`, so landings don't move.
- **The ladder and the tune floor.** The ladder multiplies drums, rings and stride, and never takes the tune below its floor while the tune is playing.
- **Spring goes to reserve.** Its echo lines repeat Acid's and Dusk's method, and it would be the fourth flat poster. Its best ideas are kept in section 3.
- **Pearl and Polariscope are both interference colour.** They're kept apart by rule (see Polariscope), and Polariscope is the first thing cut. It can't ship if the still test confuses the two.

## 2. Taste that binds every world

- Transitions are transformative and natural. No overlay, no cross-dissolve, no solid frame between patterns, no shape spawning and growing at the camera.
- No large empty black, and no horizon showing too much infinity.
- Bold shapes rather than hairline wallpaper. Long smooth travel. Never jolty.
- Pulse on strong beats only: 1 and 3 in 4/4, the 1 in 3/4, chosen per song. Melody and tone are never overshadowed by drums. Balance.
- No chrome or metallic lighting. No normals, no highlights. Colour never comes from a surface's slope, except Liquid Light's rims, and those only ever darken.
- Whole-frame flashes at zero. Local flashes under 2 per second. No strobe, even in rock.
- Sound never plays out loud in tests. Never commit songs or video. Plain programs stay under about 16 ms at 3024x1964.

## 3. The worlds, in build order

A note on names in the code below: `gX[K]` is the pattern coordinate after the warps, captured for world programs. `lineRows`, `inkRow` and `film` are the engine helpers in section 4. Everything named `A.x.*` comes from the extras sidecar.

---

### 1. Flower Power

**Still.** Flat hot inks, no black: thick echo-bands swelling round a few big flowers, borders buzzing.

**How it was made.** Moscoso's posters put opposite colours at equal value and intensity, in standard inks, not fluorescent. Motion vision is colourblind (Livingstone), so the closer the luminance, the more an edge shimmers. Wilson filled the sheet and treated gaps as shapes.

**Colour: a line's ink is the note that was sounding when it was born.**
```glsl
ivec2 n=lineRows(0,k1);                 // the row the white side wears, the row the black side wears
vec3 W=inkRow(n.x,0),B=inkRow(n.y,1);   // texelFetch(uWT,ivec2(row&31,side),0): linear RGB
col=gamma(mix(B,W,c));                  // coverage is the only anti-aliasing, so edges are hard
```
Each frame `uniforms` fills 32 rows. For a line number n, it finds the time that line was born by inverting the flow clock, then the melody at that time, then the note's place round the circle of fifths from home, then one of the inks. A line's row is fixed for its whole life, so the outgoing rings are the last bars of the tune.

Inks in sRGB at Y about .25: vermilion 255,62,20; magenta 255,0,190; blue 0,132,255; green 0,158,70. Checked by hand. Parted, for low tension: orange 255,160,0 (Y .46), violet 120,20,200 (.09). Duty stays under .7.

**Patterns.** All use one new field, kind 4. Its poles sit in the idle `blobs.*` numbers and `p1`, `p2`, five motifs at most.

`d=sqrt(ρ²+ε²)/(1+a·g(nθ+κ·lnρ)); S=-ln(Σd^-β)/β`

ε (about .1) is a correction, so a flower's centre is a bold cap and not a pit of hairlines going to grey. `a` lives in `field.ph`, `n` in `field.spin` (rounded in the shader), κ in `field.scale`, β in `field._1`, g's sharpness in `field._2`. `field.a` and `field.b` are `SNAP` and force a flight if they differ, so they stay constant across the world.

- Daisy Chain: n 6-8, κ 0.
- Paisley: n 1, sharp g, κ .8.
- Whiplash: a 0, `S=Σ±lnρ`. Lines pinch at saddles and curl round vortices.
- Flames: bent lines, duty 0, gap equals form, existing warps.

**Motion.** Rings are born at each flower and push outward, about one a second and never over 1.5, each narrower than a tile. Flowers orbit, the sheet turns slowly, inks stay on their bands. The whole film runs one flow clock, so `offset` is 0 at every landing and a ring keeps its birth ink through a Bud.

**Music.** Suits sung tunes with real changes: sunshine pop, garage psych. Test on mgmt.
- Melody: ink at birth (above). `slideLines` stays off, so numbers stay stable.
- Tension slides each ink from parted to equal Y, half rising and half falling so brightness holds. Harmony's pull is the buzz, and the cadence stills it.
- Strong beats: the existing weight rings fatten bands. Lung: petal depth `a`.
- Extras: `voices`, the chroma bins above half the peak, as a bar mean: 2 to 6 inks in use.

**Transition: Bud.** A world xform in the `XFORMS` shape. Every flower closes to a circle (`a` to 0 by T=.5), `n` changes unseen at T=.5, and it opens as another, with rings still running. Flames goes through the existing bend.

**Cost.** About +2 ms, so 9 ms plain, 13 bend, 14 flight. Unmeasured.

**Fails if.** Motifs are small (clip art), or the buzz is held (it hurts, so it comes only with tension). Equal Y varies by display. Red-blue alternation at equal luminance is invisible to a luma flash check, so the chroma channel must pass.

**Whoa.** Across a bridge the poster crawls with nothing but rings moving. The chord resolves, the buzz stops dead, and the next ring out is the note just sung.

---

### 2. Dusk (wistful)

**Still.** Long exposure from a train at dusk: plum hills and wires, crisp on the leading edge, trailing through wine, rose and peach. Never black.

**How it was made.** Eastmancolor fading loses cyan and yellow first, and magenta remains. Halation: light bounces back into the red layer. In a long exposure, brightness records how long since the light passed. No reliable source was found for tremolo on the reference records; reverb and slide are documented.

**Colour: time since an edge passed.** One hard edge per period, then an exponential tail, exactly box-filtered:
```glsl
L=tau*h/(1.-h); e=exp(-1./L); m=L-e/(1.-e);    // h: the family's duty, as tail length. L clamped to 8
I(x)=floor(x)*m+(L*(1.-exp(-fract(x)/L))-fract(x)*e)/(1.-e);
v=(I(x+g/2.)-I(x-g/2.))/g;                     // x: phase, signed by flow. Families XOR softly into E
v=mix(v,1.,smoothstep(.9,1.,h));               // correction: exact where a family closes up
X=pow(vec3(E),vec3(.42,1.,1.55))+leak*vec3(.5,.14,.03);
T=exp(-(1.-min(X,1.))*vec3(3.,3.9,2.7)*(1.-age*vec3(.42,.05,.3)));
col=VEIL+PAPER*T+grain;
```
The integral was checked by hand. E from 0 to 1 gives 74,49,72; 124,59,75; 182,101,100; 255,238,212. This runs in the colour stage from `gPh`, `gGn`, `gDu`. `c` stays exact for the planner, and in a flight each slot works out its own E.

**Patterns.** Flat, one or two families only, because three soft XORs go grey.
- Ridgeline: lines plus field `ridge`, three sines of x and y. The tail is valley mist.
- Wires: lines plus field `sag`, a·(2·fract(nx)−1)². Poles pass.
- Slide: six broad strings, `squeeze.x0` on the tune, a moving bottleneck.
- Night Drive: off-centre `l1` rings, tails streaming inward.

**Motion.** One-way lateral travel at a third of the film's clock, never rotating. Tails breathe slowly, and age creeps up.

**Music.** Slow, wet songs. Test on ppp, wildflower.
- Reverb sets tail length literally: flow rate times `A.x.air` seconds.
- Tremolo adds ribs: `v*=1+depth*cos(TAU*1.2*rate*f)`, riding the lines, so it's written in space and never flickered. Uses `A.x.trem`.
- Strong beats lengthen tails through `gBeat`, with an attack of at least a beat. The threshold stays untouched (engine hook: `gBeat` is computed with the threshold's share at 0).
- The voice is a low sun: a rim light leak, height from `melSlow`, strength from the conductor's tune gain.
- Tension raises `age`.
- Extras: `trem` (log band envelopes, 2 s windows, complex spectra Z; tremolo is coherent across bands, |ΣZ|/Σ|Z| near 1; reject when flux shares the rate, which is strumming; the designer's own idea, needs testing). `air` (fastest 20% of free decays over 8 s, falling back to low-over-high modulation energy, because sustained music gives few free decays).

**Transition: the dusk line.** A `bend` with a straight terminator front (`xfU` mode 3), 16-30 s. A red band, `leak=16u²(1-u)²`, crosses and lines bend into partners behind it. Native patterns are authored as partners, and tail signs follow `flip` (a flip declines to a flight).

**Cost.** Body 8-9 ms, dusk line 12-13.

**Fails if.** Tau falls under .2 (flat plum), tails are short (sepia), or flow goes over .25 cycles/s.

**Whoa.** The band stops, or the song ends (`M.ending`), or at the last big decay before a section. Edges hold while tails dim at the measured decay, and you watch the room's reverb die. Then the guitar re-strikes every edge.

---

### 3. Flyer (rock)

**Still.** A gig flyer: black toner and one fluoro ink on dirty newsprint, a giant target with ring edges squared off by the song's waveshape, every fourth ring fat halftone.

**How it was made.** Xerography piles toner at a solid's edges, where charge gradients are steepest, leaving hollow middles. Chantry's posters: Xerox and X-Acto. Riso: one stencil drum per ink, misregistered, overprinting.

**Colour: overprint. Ink multiplies; nothing is lit.**
```glsl
ivec2 n=lineRows(0,k1);
vec2 q=rot(PI/4.)*gX[0]*SCREEN;                                // a 45-degree screen riding the sheet
float h=.5+.25*(cos(TAU*q.x)+cos(TAU*q.y));
float spot=clamp(.5+(TONE[n.x&3]-h)/fwidth(h),0.,1.);
spot=spot+beam-2.*spot*beam;                                   // a par can flips the plate, never lights it
float e=abs(tri(gPh[0])-gDu[0])/(4.*gGn[0]);                   // correction: true pixels from the edge at any duty
float K=(1.-c)*(1.-step(grain,hollow*smoothstep(12.,40.,e)));  // toner piles at edges, the middle of a solid goes hollow
col=paper*mix(vec3(1.),fluoro,spot)*mix(vec3(1.),toner,K);
```
Beams are wedges from two dot products, crossing any point once a bar at most. Plates are hard; only anti-aliasing is soft. Grain stays on the paper, fixed in the frame.

**Patterns.** All take new field 4 (a world's field numbers are its own), `S=W(n*theta/TAU)`, or on lines `W(k*dot(X,t))`, where W is a 64-point table in `uWT`.
- Cone: `r1` rings, `bulge` at centre, small solid cap.
- Stack: field 5, `S=length(fract(kX)-.5)`: rings round every cell, mitred, seamless.
- Power Chord: `plane(f)` XOR `plane(1.5f)`, a fifth's 3:2. The root moves `scale` by its true ratio, gliding .3 s.
- Checker (replaces Scope): `plane` XOR `plane` with W edges and `slip`, the flyer's checkerboard.

**Motion.** With no song: ratchet flow, `x+.9*sin(2πx)/2π` at an invented 104 bpm, smooth, nearly stopping between surges. Beams sweep slowly. Edges stay round.

**Music.** Suits garage, punk, classic rock. **There's no rock song in `media/` yet: the owner needs to add one.**
- Kick on the 1, and the 3 only if it plays there: the cone. Known future gives anticipation: back 200 ms, out 120, ringing 400.
- Snare: `slip.u` by half a step, once per bar, on the 4, moving into the 1: stripes open into a checker and close whole on the downbeat. Area-neutral, a groove and not a flicker.
- Distortion: `W=mix(sine1,clamp(gain*wave,-1,1),drive)`. Loudness lands in edge shape, not brightness. Correction: at drive 0 it is the wave's own first harmonic, so edges really are round.
- Melody: a fret bend. `bend1`, one half-wave across the frame, bows all lines as pitch climbs.
- `A.rate` over its median, times 8, on flow: the sheet rushes with the drummer.
- Quiet verse: drive falls to 0, like a rolled-back volume knob. Spot plate shrinks to one ring in four, snare to a small sway, and the vocal gets the bend.
- Extras:
  - `snare`: per-beat flux at 180-400 Hz and 2-6 kHz, minus bass.
  - `clip`: inverse crest factor plus 1-5 kHz flatness, normalised within the song (untested; falls back to `A.E`).
  - `wave`: every 250 ms, autocorrelate the period, resample one cycle to 64 points, rotate the first harmonic to phase 0. It stands still like a triggered scope, and being periodic it closes round a ring. 60 KB a song.
  - `fill`: onset density over 1.6 times median.

**Transition: The Fill.** A flight whose zoom surges on the drummer's actual fill hits, landing on the crash. No fill: a bend whose local T steps strip by strip on the 4s.

**Cost.** 9 ms plain, flights 2 ms more. Hits move geometry; ink area changes only per section.

**Fails if.** Flecks read as a grunge filter, cone plus slip plus bend read as jitter, or dense mixes turn W to mush. Fluoro red needs the red-flash channel.

**Whoa.** Before a big arrival the cone is held back, frozen, beams crawling to one point. On the downbeat it fires and every round edge goes square as the guitars come in.

---

### 4. Pearl (dream pop)

**Still.** A lens an inch from watered silk or shell: pale pink and sea-green folds, one band razor-sharp, the rest melted.

**How it was made.** Soap-film reflection, 2R(1−cos(2π·OPD/λ)) over the spectrum, via the Belcour-Barla fit used in glTF iridescence. Moire antique: pressed ribbed layers. Grierson shot inks in a water tank. Guthrie: chorus nearly always, stacked delays over reverb. So Pearl hears chorus and echoes.

**Colour: film thickness from the pattern.**
```glsl
film(o)=.22+.39*(1.-sens(o));   // sens: the fit, normalised to 1 at 0. May bake to a uWT row if that's cheaper
o=H0+W*dot(p0,down)+swirl+R*tri(ph0)+B*tri(ph0-ph1);
col=mix(film(o),film(o+270.),c)+dither;   // c: coverage steps the film
gGn[k]*=1.+coc(p0);             // before inkOf: an exact box blur, so free depth of field. Off in a coverage draw
```
Hard in focus, melted out of it. Computed: 300 nm straw, 400 gold, 550 violet, 800 green, 1000 pink, 2000 pale pink, 2400 sea-green. Luminance swings .53-.68 at 2000-2800 nm. **H0 stays at or above 800 nm**, so first order never shows: no gold, no metal. No slope ever enters `o`.

**Patterns.**
- Newton's Rings: field `gap`, k·|X−P|², two or three contact poles.
- Watered Silk: planes at 89° and 91°, 60 cycles, field `grain` (slow sines) with fieldK +a, −a. Fringes follow its contours. Ribs under 12% contrast; `fine: true`. What reads is the fringes, which are bold.
- Nacre: one family on `grain`, thickness from `floor(phase)`: flat terraces.
- Drape: ribs with `sheet` folds; colour bunches in creases.
- Ink Tank: `swirl`, `bend1`, `bend2`, broad stirred bands.

**Motion.** Shapes hold against each other and colour travels, the opposite of Dusk. The film drains at 30-60 nm/s, and focus racks every 40 s. Correction: the camera always drifts, 3-5% of the frame per second on one long move, so it never reads as merely subtle.

**Music.** Chorus, high voices. Test on ppp, wildflower.
- Chorus sets the plates' detune. A moire is a chorus in space.
- Pitch nudges one plate, so rivers run; the focus band follows `melSlow`.
- Echoes: onset rings in OPD, repeating at the delay.
- Energy thins H0 from pearl toward deeper second-order colour, never below 800 nm.
- Strong beats: a closing ring of 60 nm, hue and not brightness.
- Tension tilts `down`.
- Extras: `shim`, band spectra at 0.4-6 Hz times (1−coherence). `width`, side over mid, from the stereo buffer. `echo`, flux autocorrelation at 80-700 ms: lag and feedback.

**Transition: a breath across the film.** A `bend` on the radial front, 8-12 s, with OPD bump `1200·16u²(1-u)²`, whose contours are true Newton's rings.

**Cost.** Body 9-10 ms, transition 13-15.

**Flash caps.** H0 at most 200 nm/s below 1200 nm, wedge spanning an order, rivers under one width per second.

**Fails if.** It goes past 3000 nm (flat and pale), holds constant orders 1-2 (oil-slick cliché), or looks metallic in any frame. The owner's eye is the test for that last one.

**Whoa.** On a held high note, a one-semitone slide sends a river across the frame while no line moves its own width. Then the chorus lands and pastel deepens over 8 s.

---

### 5. Acid (70s)

**Still.** A saturated tunnel burning on violet-black velvet, each bold line dragging a stepped staircase of flat fluorescent inks.

**How it was made.** Bressloff and Cowan: V1 activity stripes become tunnels, funnels and spirals through the complex log map; lattices become honeycombs and cobwebs. Schwartz's log(z+a) keeps the fovea finite. LSD trails are reported as discrete snapshots about 67 ms apart, not smears. Sandin-era camera-monitor feedback is repeated zoom-and-turn, a translation in log-polar: the same geometry. Blacklight posters: fluorescent ink, black flock.

**Colour: the line's own past, in steps.** No persistent buffer: on log-polar patterns a lag is exactly a phase difference between frame() numbers at t and t−Δ.

One family (the default, about 8 ms):
```glsl
float g=gGn[0],f=fract(gPh[0]-edge),s=floor(f/lag);   // which print: 0 the line, 1.. its echoes, past NE velvet
int row=int(mod(floor(gPh[0]),R));
vec3 a=print(s,row);                                  // texelFetch(uWT,ivec2(s,row),0), or VELVET
// exact neighbour areas at the stair's edges, as Supergraphic does, so they stay hard and never twinkle
```
Several families (Honeycomb only, NE at most 3, 12-13 ms, in a loop so there's one `inkOf` site):
```glsl
vec3 col=VELVET;
for(int e=NE;e>=0;e--){
  for(k) gPh[k]=ph[k]-float(e)*(lag[k]+dl[k]*lnR+dt[k]*thT+dot(gGr[k],sh0+shM*p));
  float cv=inkBand(0,k1,th);
  int row=int(mod(floor(gPh[0])+2.*floor(gPh[1]),R));
  col=mix(col,texelFetch(uWT,ivec2(e,row),0).rgb,cv);
}
```
R must divide `t1`, or the atan cut shows. Red stays off the brightest rung.

**Patterns.**
- Roll: new field `S=.5*log(r²+a²)` via `fieldK`, plus `t1`. With `fold` centred on the pole there's no atan cut, so `t1` may be any real and (l,t) turns rings through chevrons to rays.
- Spiral: whole `t1`, wound by `swirl.log`.
- Honeycomb: (a,n), (−a,n), (0,−2n), a=√3n/2π. Checked by hand: three equal vectors at 120° in log-polar.
- Tie-dye: six wedges; field kind 3 wound hard serrates the edges.
- Feedback: untwisted `droste`, generation `floor((lnR+off)/lnS)` added to the ink row (engine hook: `gGen[K]`).

**Motion.** Rings flow out from the fovea. The gaze (pole and fold centre) wanders on a 25-second Lissajous. `lens.c` breathes. `wob` crawls surfaces.

**Music.** Psych, krautrock, dub, long jams. Test on mgmt.
- Time on one chord (`M.runs`) opens echoes 2 to 4 over eight bars.
- Strong beats surge the flow; trail length is speed, so beats stretch trails, not brightness.
- `melSlow` winds `swirl.log`: a bent note twists the tunnel.
- `px,py` move the gaze; home is dead centre.
- Extras: `echo` (shared with Pearl): per section, autocorrelate harmonic-band flux at 1/16, 1/8, dotted 1/8 and 1/4 beat. The best lag spaces the echoes, so tracers are the record's own tape delay. Dry songs floor at 67 ms.

**Transition: Chronophotograph.** A slide of (l,t), where `dl`, `dt` make each echo the same move at an earlier moment. Fresh ink arrives first, old inks hold the old shape; rings unzip into rays in four colours. Its span stays under a bar, or it reads as overlay.

**Cost.** 8 ms analytic, 12-13 with prints.

**Fails if.** It's a Winamp rainbow (inks are a chosen ladder, never a hue wheel), or velvet shows large.

**Whoa.** A long held chord: trails grow until the black is gone. At a rest, or the top of a wind (section 6), speed falls to zero and every trail collapses into one still line. The hit returns and everything throws outward.

---

### 6. Liquid Light (60s light show)

**Still.** Translucent dye pools from overlapping round dishes fill the frame, deep where thick, pale where pressed, dark-rimmed, overlaps making third colours.

**How it was made.** The Joshua Light Show pressed a small clock face into a larger one, pushing oil and dye into smoky trails timed to the music. Lamp heat boils water dye into bubbles. Physics: thin gaps are low-Reynolds. Fingers form only where thinner fluid pushes thicker (on release, by inference), and Taylor's dyed glycerine unmixes when stirring reverses.

**No feedback buffer.** Dye needs history, the GPU doesn't. A thin gap has no turbulence, so a prescribed flow is accurate. Each frame a small pass traces every texel back up to 32 steps (8 s) through vortices, tilt and presses from `R.pulses`: one map per plate, read where `uPush` is read. Patterns stay sharp, `frame()` stays pure, seeks are free.

Corrections: start at 512x320, not 768x500. Store displacement in RG16F, not position in RG32F, because linear filtering of float is unconfirmed on this GPU and displacement keeps precision. Read with a 4-tap B-spline.

**Colour: projected filters, soft by right.**
```glsl
float J=abs(determinant(mat2(dFdx(X),dFdy(X))))*res2;  // clamped, and held to a tile's mean through a press
float h=depth*sqrt(edge(fract(ph)))*J;                 // dye conserved: wider is paler
vec3 T=exp(-A*h)*exp(-rim*dot(gh,gh));                 // absorbance; a meniscus bends light away
col=L1*T1*T2+L2*gel(wheel,p)*T3;                       // a dish multiplies, projectors add
```
Rims are dark and even: no light direction, no chrome. One `prepare` carries plate 1, so `c` exists. The other two plates are native scalar fields, no second `prepare`.

**Patterns (plates).**
- Clock Glass: one huge pool per dish.
- Fingers: `S=ρ-R(1+f·Σa_n cos(nθ+φ_n))`; f grows only on release.
- Vapour: packed hex discs, lenses bending what's behind.
- Crown: an alcohol drop's spiked front.
- Poured: any library pattern, turned to smoke.

**Motion.** Slow vortices, dish tilt, plates counter-turning, seeded presses, slow gel wheel. The lamp never modulates.

**Music.** Solos, jams, organ, live recordings; weak on tight dance. Test on mgmt.
- Strong beats: a press at the harmony's focus; smooth pale swell, fingers on release.
- Melody tilts its own plate, so drums can't cover it.
- Conductor: the leader's dye lies deepest.
- Harmony: gel wheel turns round the circle of fifths; tension deepens A.
- Tone: focus. Lung: heat. Arrivals: Crown.
- Extras: `sustain`, bar mean of harm/(harm+perc): held notes raise the heat.

**Transition: Stir and Unstir.** One plate's history lengthens to 8 s, the existing bend runs at its finest, then history shrinks to zero, which is the stirring reversed, and the next pattern condenses exactly. Other plates keep the frame busy. This is the one place the governor may draw smaller, and smoke hides it.

**Cost.** Maps 2 ms, one `prepare` 7, two native plates and composite 3: 12 ms. Unstir 15-17 at full size. A second `prepare` in the plain path breaks budget.

**Fails if.** Blobs are uniform (lava lamp), a rim brightens (chrome), three dyes stack (mud), or stretching outruns the map (twinkle).

**Fallback if the map pass fails.** Keep the colour and plates, and move the smoke with `swirl`, `bend1`, `bend2`, `sheet`. Weaker, and the world still ships.

**Whoa.** Eight bars of smoke. On the last bar it runs backward, and on the chorus downbeat the smoke is the exact next pattern.

---

### 7. Station Point (way different)

**Still.** Flat shards of one bold figure across a room's surfaces, a different ink on each, nearly lining up.

**How it was made.** Felice Varini: project a form from one fixed spot and paint what lands. One step aside and it fragments.

**Colour: each wall has its own inks; the figure is whole from one place only.**
```glsl
// surf.kind 3, new
d=roomHit(C,rd)-V;
X=vec3(F*d.xy/max(-d.z,.25),0.);   // back through the station. At C=V this is exactly p, so the figure is whole
col=mix(PAPER[wall],INK[wall],pow(c,.4545));   // gWall[K], engine hook
```

**Patterns.** Target (`r1`), Nested Squares (`l1`, `p1.q`), Big Triangles (`triLattice`), One Arm (`spiral`). Correction: figures are concentric and fill the frame, never one outline on an empty wall. Rooms: Corner, Ribbed Corridor, Columns (four boxes). A back wall always, so no void and no horizon.

**Motion.** A long orbit round the station, closing about every 30 s.

**Music.** Needs nothing new. Suits songs with cadences; one-chord songs fall back to breaths.
- Camera offset is `px, py`: fifths sideways, minor vertical, arriving with its chord. `M.place(home)` is exactly the origin.
- Tune is height, lung is dolly, beats are weight rings on the vanishing point.
- It closes fully only on arrivals at home. The orbit is scheduled to be at zero at those times.

**Transition.** Off-station nobody can read the figure, so a slide or bend runs there, hidden by its own shards. You leave a circle and come back to a square.

**Cost.** Plain plus about 1 ms; Columns 1 more. 8-9 ms. Flash low; `guardFlashes` caps camera speed.

**Fails if.** Figures are fine (a textured room), or the camera outruns the chords (seasick).

**Whoa.** Shards swing through four bars of dominant, and on the chorus downbeat the room closes into one perfect circle.

---

### 8. Supergraphic (way different)

**Still.** Fat flat bands of rust, orange, mustard, avocado and cream, no gap, no black, swinging in parallel round huge rounded corners like one stroke across a room.

**How it was made.** Solomon at Sea Ranch: flat colour at architectural scale. Panton's Mira-Spectrum: check, circle, curve, square, stripe, in sequential colour variations. So distance fields, whose offset curves keep constant width where sine warps pinch, and an ordered ladder.

**Colour: a 32-ink ladder, one road through the 70s, there and back so it's cyclic. Colour changes only by bands travelling.**
```glsl
float x=gPh[0],g=gGn[0],n=floor(x),f=x-n;
float up=clamp((f+.5*g-1.)/g,0.,1.),dn=clamp((.5*g-f)/g,0.,1.); // exact neighbour areas
float i=n+CELL*floor(gPh[1])+roll;                              // whole tiles; roll from the ink rule
col=(1.-up-dn)*L(i)+up*L(i+1.)+dn*L(i-1.);
col=mix(col,MEAN,smoothstep(.22,.45,g));
```
Edges fall at whole numbers, so this draws one edge per cycle where coverage has two. `edgesPerCycle: 1` tells the judge's fineness measures.

**Patterns.** New fields, phase=N·S.
- Track, multi-stripe Truchet: `q=fract(kX); if(flip) q.x=1.-q.x; S=par*(min(length(q),length(1.-q))-.5)`, par ±1 by parity of floor(kX) plus flip. Rechecked by hand across both kinds of join: bands never break.
- Racetrack: `q=abs(X)-b; S=length(max(q,0.))+min(max(q.x,q.y),0.)`.
- Swing: `u=a*f*cos(f*x); S=(y-a*sin(f*x))/sqrt(1.+u*u)`.
- Spectrum: tiles f1,f2, rings ‖fract(kX)−.5‖p inside, p sliding circle to square.
- Room: a new `surf.kind` with an unfolded map, so oblique stripes continue across corners.

**Motion: The Ride.** The wall holds still; the camera follows one band's centreline, heading eased over 3 s so it banks. A JS twin of the field gives the path; a per-gesture hash of tile flips stops it circling a bullseye. Fails if it lurches.

**Music.** Funk, disco, soul. Test on disclosure.
- Extras: `bassPitch`: Goertzel at semitones, MIDI 28-60, 8192-sample windows, Viterbi as for melody. Each note glides the stack.
- Tune: `φ+=a*sin(TAU*(φ/M−pitch))`, so a fat stripe climbs with the melody.
- Strong beats surge the ride and swell that fat. Area moves, brightness barely.
- `px` rolls the stack by whole bands, landing on the chord.

**Transition: Round the corner.** A `bend` whose new planar front crosses along the ride's heading. `world.direct` aligns φB by whole cycles at compose time, so `offset` is 0 mod 32, roll is 0, and each stripe keeps its colour swinging onto the next course.

**Cost.** 6-8 ms; bend 12-14. Lowest flash risk: ladder neighbours under 10% luminance apart, so a passing band isn't a transition.

**Fails if.** Beige kitchen, worm-sized tiles, or a flat patch where phases cancel.

**Whoa.** Forty seconds riding what reads as a flat graphic (a room, square-on to one wall). On the chorus downbeat the camera turns its head: stripes run across the corner, onto the ceiling, no line drawn. It was all one stroke.

---

### 9. Cut (way different)

**Still.** One bold spiral of lines wiggling with a real waveform, hard rings of ink marking sections: a record from millimetres away.

**How it was made.** A lacquer lathe: lateral swing is L+R, vertical L−R, and a preview head opens spacing before loud passages. Fischinger's Ornament Sound: the drawn shape is the sound. (`NEXT.md` listed Turntable as do-not-build for that night's film. This isn't in the film.)

**Colour: ink by song position.**
```glsl
a=atan(q.y,q.x)/TAU; b=wind(length(q))-a; u=floor(b)+a; // song position. u is continuous round the turn, jumps at a groove
s=cut(u);                                               // mid, side: one fetch
// the family's phase is b, with its gradient from the spiral alone. Hook worldPhase, after the gradient:
gPh[k]+=AMP*s.x;  gGn[k]*=1.+AMP*abs(cutSlope(u))*turnsPerUnit;
gDu[k]=-.5*abs(s.y);                                    // the groove's width is the stereo. inkBand makes c from these, so c stays exact
// and in the colour stage:
col=mix(LAND[section(u)],(u<uNow?INK:TINT)[chord(u)],pow(c,.4545));   // nearest texel: hard. Played grooves are inked
```

**Patterns.** Lathe (one turn per bar, so beats stand as spokes). Tree Rings (closed). Seed Head (`lens.c` 2, spirals 13, 21, one floret per beat). Weave (warp pitch class, weft eighth note).

**Motion.** The disc holds still and the camera glides. A lens (`F_POSE`) carries now along the groove, one turn per bar. No song: blank lacquer with slow test sweeps. Never ride the groove at true speed: a 40 Hz wave moves 2/3 of a wavelength per 60 Hz frame at any zoom. Whole-disc is hairlines, so it only opens and closes at the start and end, and stays close otherwise.

**Music.** Suits anything with dynamics.
- The waveform is the recording. Extras: `cut`: mid and side low-passed near 120 Hz, resampled on `A.tau` at 512 samples a bar into an RG8 texture. Bass shows as real oscillation, about 80 wiggles a bar at 40 Hz.
- The tune bends the lines at five times the drums' swing (melody contour added to mid).
- Strong beats: the lens crosses standing spokes.
- Inks follow the circle of fifths from home.

**Transition.** The next pattern is already cut further round. T comes from u, and you arrive on its bar (engine hook `worldT`).

**Cost.** 6-8 ms. Flash near zero: displacement adds no ink, so tile means hold.

**Whoa.** Before a note plays you can point to where the song gets big. The groove spreads ahead and the chorus lands there. (Dragging the needle to bend the audio is the first thing cut, and is tested muted.)

---

### 10. Polariscope (way different, first to cut)

**Still.** A magenta sheet of clear plastic, rainbow fringes crowding at contact points, crossed by dark brushes.

**How it was made.** Photoelastic stress analysis, I = sin²2α·sin²(πδ/λ). A sensitive-tint plate turns black to magenta. Granular force-chain experiments. The stress formula was checked: a Flamant point load adds as a spin-2 vector.

**Colour.**
```glsl
T=T0; // tint plate: never black
for(loads){ d=p-L.xy; r2=dot(d,d)+e; T-=L.z*dot(d,L.n)*vec2(d.x*d.x-d.y*d.y,2.*d.x*d.y)/(r2*r2); }
D=length(T); k=D*vec3(.85,1.04,1.22); // 550/lambda
I=.5-.5*cos(TAU*k)*sinc(fwidth(k))*exp(-D*D/18.); // box-filtered
col=I*pow(cross2(T,P)/D,2.);
```
Correction: D also goes into one family's phase through a field, so `c` exists for the planner and the sound.

**Kept apart from Pearl by rule.** Polariscope always has a saturated magenta ground and dark isoclinic brushes, shows no lines of any library pattern, and fringes only near contacts. Pearl never has black or magenta ground, and always has lines and focus blur. If the still test still confuses them, Polariscope doesn't ship.

**Patterns.** New field: Load Train, Four-Point Beam (`T=κ(x)y`), Crack (`K sinθ/√r`), Force Chains (disc lattice), Thin Section (grains darkening as the stage turns).

**Motion.** Loads creep, the tint drifts, the sheet travels on long pans.

**Music.** Slow, heavy, building music. Needs nothing new. Tension is load: far from home, more orders. The tune is the strongest contact, sliding along the top edge by pitch. Strong beats press a second, attack ahead of the beat. Lung moves the tint.

**Transition: Anneal.** One load eases off as the next takes up; fringes are born at contacts and run outward. A slide of `blobs.*`.

**Cost.** About 8 ms. **Flash medium:** cap fringe travel at 1 order/s beyond contacts, tint at 0.1. **Fails** as oil-slick tie-dye if most of the frame passes 4 orders.

**Whoa.** Press the picture and fringes crowd round your finger. Then a cadence lets the whole sheet go, over two bars, to calm magenta.

---

### In reserve, not in any lane

- **Spring (surf).** A 1964 poster moving: flat turquoise, foam and coral swells, crests trailing echo lines round a low hot sun. Split-fountain ink along a level set: `ink=mix(RAMP(id),RAMP(id+1.),pull)`. Worth keeping: the Break, an iris with a straight front, `s=dot(p-o,n)`, where the sheet curls into a tube peeling across the frame. Its snare ripple would need moving to strong beats. Comes back only if the owner asks for surf.
- **Stand Still.** Hard rings among blurred rings, like a strobe tuner: a sounding note stops its ring. Needs per-pitch-class activity.
- **Second Colour.** Neutral stripes that look rose (Cruz-Diez): a green-biased verse adapts the eye, so the viewer makes the chorus's colour.
- **Just.** Whitney's differential dynamics, planned so home lands on a simple ratio. Partly lives on as Whitney bars in section 6.

## 3a. No two alike

| World | Colour is | Line character | Motion | What it hears |
|---|---|---|---|---|
| Film | Coverage only | Hard, bold, every family | Long moves, flights | Strong beats, tune, harmony, phrase |
| Beyond | Disagreement of two plates | The same, edges split | The same, plus quadrature stop | Sections open the plates |
| Flower Power | Ink by line number, at equal luminance, no black | Thick swelling echo bands round flowers, buzzing edges | Rings born at flowers, pushing out | Pitch at each ring's birth; tension as buzz |
| Dusk | Time since an edge passed, through film dye | One crisp edge, long soft tail | One-way lateral train travel, no rotation | Reverb decay, tremolo, voice as sun |
| Flyer | Overprint: toner times fluoro times paper, halftone by ring | Fat rings crenellated by the waveform; hollow solids | Ratchet: surges, nearly stops | Kick, snare, distortion, waveshape, drummer's fills |
| Pearl | Film thickness: high-order interference pastels | Razor in focus, melted out of it | Colour travels, focus racks, slow drift | Chorus, stereo width, echoes, high voice |
| Acid | The line's past, in flat fluorescent steps, on velvet | Bold line dragging 2-4 stepped trails | Tunnel flowing from a wandering gaze | Time on one chord, tape delay, bent notes |
| Liquid Light | Absorbance of dye, layers multiplying | No lines: pools, smoke, dark rims | Prescribed vortices, presses, unmixing | Sustain, solos, circle of fifths as gel |
| Station Point | One ink pair per wall | Shards of a figure, broken at corners | Orbit round one point, closing | Cadence: resolution is closure |
| Supergraphic | Earth-toned ladder; colour moves only with bands | Fat, parallel, constant width, no pinch, no gap | Camera rides one band, banking | Bass notes; melody as a climbing fat stripe |
| Cut | Song position: played or not, by section and chord | One spiral groove wiggling with the recording | Disc still, lens carries now | The recording itself, ahead of time |
| Polariscope | Stress birefringence on magenta, dark brushes | No lines: fringes crowding at contacts | Loads creep, long pans | Tension as load; tune as a contact |

Two worlds share a column only where it doesn't show: Flower and Supergraphic both number their lines, but one is hard equal-luminance and the other an earth ladder with one edge per cycle. Acid and Dusk both read distance behind an edge, but one in flat neon steps on velvet and the other in a continuous dye response with no dark. `tests/stills.mjs` checks this instead of trusting the table.

## 4. The engine

**The core.** A world is a lazily imported module. With none chosen, no world code loads and no world program is built. The new work is a few falsy JS checks. The world's patterns live in the world, never in `src/pattern/library.js`, or the film's random draws would change.

### Programs

Never add world code to the 16. `R.prepareWorld(world)` builds separate programs for that world, up to 8 (`HAND`, `FLIGHT`, `EXTRA`), never with `PLATES`. Order: plain, flight, then the rest behind the picture, one at a time through `KHR_parallel_shader_compile`, each warmed by a one-pixel scissored draw on the real framebuffer. Each has its own `R.variant`, so its own governor tier. A world only slows itself. Why River cost 3-4 times on every pattern is unproven (the guess is private-memory spill); this structure means it no longer matters. If link blocks the frame in today's Chrome (a 2023 WebKit report says it can), build when the strip opens.

### Source

`#ifdef WORLD` hooks in `head.js`, `fields.js`, `surface.js`, `prepare.js`, `xform.js` and `main.js`, plus comment anchors the world's GLSL replaces. The hooks world lanes will need, all made in Stage 0, because a world lane may not touch these files:

- `head`: `layout(std140) uniform WBlock { vec4 uW[64]; };`, `uniform sampler2D uWT;` on unit 1, `uTrace` on unit 2.
- `fieldS`: `kind>=4` goes to `worldField(b,X,f)`, also in programs built with `NORILEY`. `_extra()` must not count `kind>=4`.
- `surface`: `kind>=3` goes to `worldSurface(b,p,cover,parity)`, which may write `gWall[K]`.
- `prepare`: capture `gX[K]`, `gGen[K]` (droste generation); `worldPhase(K,i,X)` after the gradient.
- `main`:
  - `worldWarp(p0,p)` where `uPush` is read.
  - `worldPreInk(K)` before `inkOf`.
  - `gBeat` computed even with threshold share 0.
  - `worldT(p0,T)` in the bend, and a straight front in `xfU` (mode 3).
  - At the end, the colour stage below.

```glsl
// the colour stage, in world programs only. Hand and sheet have already acted on c.
#ifdef FLIGHT
vec3 a=worldColor(outer run,c),b=worldColor(inner run,c);  col=mix(a,b,flightShare(outer cell number));   // one c, so one pattern shows
#else
col=worldColor(0,k1,c);
#endif
col=mix(film(c),col,changeShare());            // draining into, or arriving out of, the film
if(uW[0].x>.5) col=film(c);                    // the coverage draw
```

### Helpers (`src/gl/chunks/world.js`)

```glsl
// Which line, on each side of the nearest edge. Hard, because coverage is the anti-aliasing. Exact through duty, threshold and XOR.
// For each family a=floor(x) numbers the nearest white band and b=floor(x+.5) the nearest black band (checked against band(): p is centred on .5, q on 0).
// side s: tri(x)>d. This cell uses s?a:b for that family. The cell across the nearest edge flips the family with the smallest |tri(x)-d|/(4g).
// Parity of the sides says which of the two is the white one.
ivec2 lineRows(int k0,int k1);  // row for the white side, row for the black side, from uW weights per family, mod ink.R
vec3 inkRow(int row,int side);  // texelFetch(uWT,...)
vec3 film(float c);             // vec3(pow(c,.4545)): exactly what the film draws
```

### The ink rule

This is the fix for the first bug in section 1. It lives in `plan.js`, only when `ctx.ink` is set. `xform/shock.js` does its own pairing with its own `offset` (lines 80-99), so the same filter is applied there:

- A family that carries numbers must keep its place and not flip. If `pair[i]!=i` or `flip` for it, slide and bend decline and it's a flight.
- `offset` for it snaps to the nearest multiple of `ink.R`. At `R` of 8 or less that's at most 4 cycles extra travel over a whole transformation, about what flow does anyway.
- With `ink.roll` (Supergraphic, `R` 32), `offset` stays as it is, and the row gets a fractional `roll` easing from 0 to `-offset mod R` over T, landing exactly. Ladder neighbours are close, so it's a slow tide.
- A wrapped surface or `t1`: `R` must divide the whole-number count.

Flights and the iris never add an offset. Stateless: `frame()` stays pure, and seeking needs no chain of past plans.

### Uniforms

Second UBO, binding 1, 64 vec4s. 0-3 engine (`x` coverage flag, `y` threshold share, `z` change share, `w` band stagger; then focus and row weights), 4-33 slot A, 34-63 slot B. `uWT` is RGBA16F, 256 wide, for ink tables, W, film LUTs.

### The world's shape

```js
export default {
  id, name, chips: [ /* sRGB, for the strip */ ],
  pool: [ /* its own patterns, ordinary pattern objects */ ], borrow: [ /* ids from the library */ ],
  glsl: { defs, field, surface, phase, warp, preInk, T, color },   // strings, each optional
  ink: { R, roll: false, fams: [0] } | null,   // line-number worlds. null: no numbers, no rule
  table: { h, fill(tex, ctx) } | null,         // uWT rows, pure
  pass: { size: [512, 320], glsl, uniforms(U, ctx) } | null,    // Liquid Light's map. Pure. Nothing keeps anything between frames.
  motion: { len, morph, slower, glide, rise, flow, xforms: { bud: { id, plan, enter, write } } },
  hear: { pulse, melody, tone, harmony, lung, on: { hearBeat: 0.8, hearWind: true } },   // section 6
  needs: ['wave', 'snare'],                    // from the extras
  soft: false, edgesPerCycle: 2,               // what the judge should expect of coverage
  tables(A, M), uniforms(U, ctx), direct(score, A, M),   // ctx: t, c, x, kind, G, its tables, at(c) = reactAt anywhere in the song
};
```

### Runtime

- `stage.setWorld(id|null)` is the only way in. It stamps `score.world` on every score through an accessor, which catches song end, sound standing in, and eject.
- `frame()`: `const W = score.world`. Falsy means today's path, one check. With a world it sets `R.world`, and after the transformation writes calls `W.uniforms`.
- `compose(A, seed, { patterns: W.pool, world: W })`: constants read `motion`, then `(W.direct ?? direct)(...)`. Heroes skip when absent (a test confirms). `songSheet` gains fall back to `W.hear`, eased by `hx`. No world leaves `rand` untouched, so films stay identical.
- The wander reads `stage.pool()` and `motion`.

### A mode change

`stage.settle`, then the another-take path: snapshot, set the world, `song.rebuild({ world })` or a fresh wander, `morphFrom(snap, t, 9, { world: from, noGlide: true })`. Always a dive, on real seconds. A song's clock never stops.

- Over `x` 0 to .45 world A drains: `s=smoother((x'(1+w)-stagger)/w)`, stagger from distance to the dive's focus plus a hash of band number, each band in about 1.5 s.
- At `x=.5` the frame is the film's flight, byte for byte, and the program changes.
- Over .55 to 1 world B's inks arrive the same way.
- From or to the film, only one half runs.
- Beyond shuts first (`b.off({ fast: 1.5 })`, new and not otherwise reachable), waiting for `app.edits.beyond` to clear. Static picks a pool pattern and stays static. Rehearsal runs behind it.

### Everything else

- Sound: `Reader._blit` redraws the frame small with the coverage flag, so the brain is unchanged.
- Planner: `R.probe` uses the world's program with the coverage flag, so own fields draw.
- Rehearsal: its own `Renderer` calls `prepareWorld` too. `measure` reads the coverage draw, and the flash pass reads true colour.
- Hand: all before colour.
- Recording: unchanged.

**Display P3 is not in Stage 0.** Switching `drawingBufferColorSpace` on a live canvas may reallocate the buffer, and the recorder and flash measure assume sRGB. Worlds are designed in sRGB. P3 is a later try, and only if it passes the hash and shows no hitch.

### Control

The fx bar's `colour` button becomes `world`, opening one strip: black and white, colour, then the worlds with ink chips. Hover starts building. `v` is next world, `b` stays. Boot is always the film.

### Must be proved before any world is built, each before the next

1. **Hooks.** FRAG with WORLD blocks stripped hashes as today; `tests/hash.mjs` identical, `FLAGS` on and off.
2. **Compile.** Longest rAF gap during `prepareWorld` under 50 ms, else build on strip open.
3. **Mirror world.** A test world whose `worldColor` is `film(c)`: byte-identical to the film on stills and morph pairs; plain cost within 5% of program 0 at 3024x1964. This answers the River question for good.
4. **Numbers.** A test world colouring by `lineRows`: no wrong-ink slivers at duty .3 and threshold .2 on a 2-family check and a triangle lattice; no ink jump on the first frame after any landing (slide, bend, flight, shock, iris); same frame after seek as after play.
5. **Change.** First and last frames equal the single-world frames; the `x=.5` frame equals the film's; `pops` and `flat` clean; flashes zero whole-frame and under 2 local; song clock unmoved; seek mid-change.
6. **Compose.** No world: judge unchanged. Small pools don't throw.
7. **Sound, hand, recording.** Sound notes match the film's with the mirror world; every hand verb; a recording across a change plays to its end.
8. **Strip.** A first-time click-through.

Then Flower Power, because it needs one field, no pass and only one small extra (it runs at a fixed 4 inks until `voices` lands), and proves cell colours through bend, Bud and flight.

## 5. Costs

At 3024x1964; plain is about 7 ms today; budget about 16. All unmeasured.

| World | Plain | Transition | Note |
|---|---|---|---|
| Flower Power | 9 | 13-14 | |
| Dusk | 8-9 | 12-13 | |
| Flyer | 9 | 11-13 | |
| Pearl | 9-10 | 13-15 | |
| Acid | 8 | 12-13 | Honeycomb 12-13 plain, NE 3 |
| Liquid Light | 12 | 15-17 | governor may draw .85 during Unstir |
| Station Point | 8-9 | 12-13 | |
| Supergraphic | 6-8 | 12-14 | |
| Cut | 6-8 | 12 | |
| Polariscope | 8 | 11 | |

## 6. The music plan

For every mode, including black and white. Diagnosis (from code and saved captures, nothing rendered): 4.7% of the frame is within 100 ms of its beat, and the mean pixel shows one 1.76 s early. Mean tune age is 1.7 s. A loud beat moves local white about 8 points. In 4/4 from about 106 bpm the pulse never chooses 1 and 3. `pow(g,3.5)` leaves second place .061 and the rest .0036, while drums never fall under .58. Every channel is on from bar 1, which is the real flatness. The code facts were checked (`SPEED`, `MEL_SPEED`, `SHARP`, `want`, `DRUMS_MIN`).

**All of these change black and white output, so all sit behind flags that are off for the film.** They go in a separate `hearing` object in `flags.js`, so `setAllFlags` can't reach them. `hearOn(score, id)` is `score.world?.hear?.on?.[id] ?? hearing[id]`. Each world sets its own. Plain film opts in only if the owner says so after seeing `?hear=1`. Off, `tests/hash.mjs` is identical.

| # | Change | What you see | Where | Test |
|---|---|---|---|---|
| 1 | **Real 1 and 3, and flow that falls into them.** Ship with 2. | The whole sheet falls into each strong beat, nearly stops, sets off again. Tappable across a room. Big sections walk, small ones pour. | `react.js`: `want` lerp(1.3,.9,big); the 3 counts at .55; quiet sections get shallower gait, not slower rate. `surgedBeats`: speed `.15+x^1.5`, normalised, braked over the last 80 ms, C1, same phase per interval. Depth table .35 to 1 from section size and `A.perc`, at .35+.65·drums; 0 on plain stripes. `compose.js`: `gearFor` headroom. Peak about 2.1x mean. Slow gears add a 1% lens rebound. | Follow. No pulse gap over 2 s above 80 bpm. Jerk under 3. |
| 2 | **The tune in the present, with a floor.** | High notes lift the sheet and low ones sink it as you hear them. The melody never disappears. | `chunks/song.js`: read history by age `.57r³`, flagged through `F_MEL.w` so a film program draws the same. `song-sheet.js`: gain `.3+.7·g^3.5`; prefer `melMode` 1/2, one sign everywhere. `understand.js`: score tune by presence and contour as well as newness. `direct.js`: long heroes .5, not .3. Under .1 ms. | Melody decode per breath. Tune 15%+ of motion in every voiced breath, tone 8%+ per song. |
| 3 | **Wind, hold, release on arrival peaks.** | Up to 16 bars before a peak the sheet draws in, lines go finer, rings bunch, flow slows to .4. In the last beat it hangs at .12. On the hit a lens blooms, flow pays back at 1.5. | `understand.js`: `M.holds`, peaks over .5 the director left plain, at most five, 30 s apart. `react.js`: `wind=a·x^2.5` from the last `A.E` minimum, decay 1.5 bars. `compose.js`: warp the value of `surged` only, never `score.time`, lag at most about 6 s, so landings don't move. `song-sheet.js`: +.22W then −.12a on the 4th `F_POSE` lens; `freq` relaxes over 2 bars, never on the hit. | Motion after/before at least 3. Blind owner comparison. |
| 4 | **The ladder.** | Intro: lung and bass. Verse: tune. Pre-chorus: rings. Chorus: stride. Chorus two: Whitney bars. Last chorus: everything. Song gets a shape. | `react.js`: rung = label's rank by mean `A.E` + `seg.visit`, one table per voice, eased over the bar before a section. `song-sheet.js`: multiplies `mPulse` etc., never the tune below its floor. `compose.js`: `SHARE.appearances`, `changed()` so a chorus returns on its pattern and compounds "wider". `direct.js`. Cost 0. | Motion by channel differs by section. A chorus's patterns recur. |
| 5 | **Bass under the sheet.** | A broad bump moves up and down with the bass notes. | `react.js`: chord root from `M.runs`, nearest octave, .05 per semitone, arriving over a beat; strength to −.28 from `A.bass` smoothed .4 s, so the kick can't get in. `song-sheet.js`: `uF[6]`. `hand-sheet.js` around line 54 stops zeroing it unless the hand is pressing. Walking bass waits for extras. Under .1 ms. | Bump height correlates with root; not with kick. |
| 6 | **Collapse the rings.** | One ring at a time accelerates in and implodes on the hit. | `chunks/song.js`: `s=.35r⁴`; `song-sheet.js`: `WT` at 16 Hz, ±2 s; same `CLOSED`, `GATHER` retuned. `tests/judge.mjs`: Wave row takes the new speed law when on. | 25%+ of tiles peak within 120 ms of the beat. |
| 7 | **Each voice its own carrier.** | On a check, columns step on strong beats while rows pour with the tune. On lines, a closed partner opens beside them and fringes appear; the tune slides them, and each chord is a figure you learn. | `song-sheet.js`: `voicesOf(S)` replaces `slideLines`; partner = f0 + Δk, Δk = Δ0 + .8·(px,py). `react.js`: call and response. `chunks/song.js`: `F_SPARE+1`. Closes with `plainRings`. About 1 ms where a partner is open. | Frame white .49-.51 at every Δk. No whole-frame flash. |
| 8 | **The last chord.** | A stop: focus glides home, the last ring closes, the clock stops on the last hit and holds 5 s. A fade: flow follows energy to zero. | `understand.js`: `M.ending`. `time.js`: a terminal window. `react.js`. | `tests/songend.mjs` with the flag. |
| 9 | **Whitney bars.** | Rays on the bar line, a dartboard or checker on the next, spirals scattering between. | `moves/slip.js`, `direct.js`: C2 staircase in `slip.u`. Under .5 ms. | Outer ring under 4 edge crossings a second. |
| 10 | **Loudness is approach.** | A build pulls you in; a fall lets you drift. | `compose.js`: re-time each arc, `du/dt ∝ 1+k·max(0,dE/dt)`, normalised to finish on time. | Correlation of d ln scale/dt with dE/dt at least .5; near 0 when shifted. |
| 11 | **Surprise where the song surprises.** | After regular pulsing, the flow turns round on the song's rarest chord. | `understand.js`: −log P(chord|previous) from `M.runs`, after four repeating bars, at most six, 20 s apart. `compose.js`. Never in a hero. | Blind real against random chords. |

**What each world takes**

| World | 1 depth | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| Flower Power | .5 | yes | yes | yes | no | yes | no (ink carries the tune) |
| Dusk | 0 | yes | mild | yes | yes | no | moire, slow |
| Flyer | 1 (or ratchet) | yes | full | yes | no | no | no |
| Pearl | 0 | yes | mild | yes | no | no | moire |
| Acid | .8 | yes | full | yes | yes | yes | no |
| Liquid Light | 0 | yes | yes | yes | yes | no | no |
| Station Point | .35 | yes | full | yes | no | yes | no |
| Supergraphic | 1 | yes | yes | yes | own (notes) | no | no |
| Cut | 0 | yes | no | no | no | no | no |
| Polariscope | 0 | yes | full | yes | no | no | no |

**Extras (new analysis).** `src/music/extras.js`, run in `extras.worker.js` after the main analysis from the stereo `decoded` buffer, cached under its own key `EXTRAS_VERSION:hash`. Fields: `wave, snare, clip, fill, trem, air, shim, width, echo, voices, sustain, bassPitch, cut`. The film's `A` is untouched. A world with `needs` waits for them before its mode change starts, and its strip chip says so.

## 7. Objective tests

Run on `ppp, wildflower, disclosure, mgmt`, and on a rock song and a slow reverb-heavy song once the owner adds them. Browsers always run with `--mute-audio`.

- **Identity (`tests/hash.mjs`).** With all this code in the tree, no world, all `hearing` off: identical to the saved baseline, film and Beyond at `snap(0)` and `snap(.6)`.
- **Mirror (`tests/worlds.mjs`).** Proofs 1-8 above.
- **Flash (`tests/flashworld.mjs`, `tests/judge.mjs`).** Real pixels through three channels per tile: gamma luma as `look.mjs` counts it; WCAG's saturated red term (R/(R+G+B) at least .8, change in (R−G−B)×320 over 20); and red-minus-cyan at the same limits, for equal-luminance alternation. Whole-frame 0, any tile under 2 per second. `FlashSeen.take` reads the green channel and `shot` passes `null` edits today, so both move to a world path; for the film they stay exactly as they are.
- **Ink carry (`tests/inkcarry.mjs`).** At each landing in a film, the colour difference across the landing frame is no bigger than the frames around it. Play and seek give the same bytes.
- **Dark.** No large empty black: share of pixels under Y .03 under 35%, biggest disc of it under .25 of the height.
- **Geometry (existing rows, on the coverage draw).** White, Tile, Noise, One colour, Stasis; `flat`, `pops`, Jolt, Jerk. `soft` and `edgesPerCycle` set what Noise and fine expect. Jolt and Jerk also on true colour.
- **Cost (`tests/fps.mjs`).** Per world at 3024x1964, governor off: plain p95 under 16 ms. Governor on: a film holds 55+ fps.
- **Stills (`tests/stills.mjs`).**
  - 20 frames per world, per song. Features: hue histogram, saturation, luma histogram, edge sharpness, band width.
  - Nearest centroid, leave one out: at least 90%, no pair over 10% confusion.
  - Recolour: conditional entropy of colour given `c` at least 1 bit (a recolour is 0).
  - Then a contact sheet the owner names, blind.
- **Follow (`tests/follow.mjs`, a row in `tests/judge.mjs`).** At 60 fps on 96x54, per tile, m(t)=mean |ΔL|; impact v(t)=Σmax(0,m(t−50 ms)−m(t+50 ms)). Peak-pick, then beat-tracking F at ±70 ms against `R.pulses`, and again with the grid half a bar off. Pass: F at least .7, shifted at most .35, per-beat AUC at least .85. Pure, and re-runs on saved captures. Today's captures score AUC ppp .41, wildflower .71, mgmt .80 (10 beats each, indicative).
- **Decode.** From 12 fps tiles, cross-validated ridge by section for melody, energy, tension; R² against circularly shifted tables.
- **Balance.** Tune and tone shares of motion, as in change 2.
- **Whoa (`tests/whoa.mjs`, `WORLD=`).** Finds that world's moment in the song by its trigger and writes a contact sheet and slices around it. Whoas don't rest on `M.rests` alone.
- **Human.** Muted 20 s clip at 3 m, two audio tracks, one half a bar off: 75%+ correct. The owner watches each world moving, on a song that suits it. Chrome, "too subtle" and "jolty" are the owner's call and no test overrides them.

## 8. Lanes

Rules as in `NEXT.md`: edit only your files; lanes don't commit; the lead commits when a gate passes, and pushes and announces each stage as a version; own `--out lab-out/<lane>`; at most two browsers at once; every feature reads a flag; pure functions; no lighting. Worlds never touch shared files. A missing hook goes to the lead, who makes it in one commit between lanes. Start from a commit, after the work now in the tree has landed, with `MODE=save` of `tests/hash.mjs` taken there.

### Stage 0: the engine, proved. 2 lanes.

| Lane | Owns | Proof |
|---|---|---|
| **E Engine** | New: `src/worlds/index.js` (all ten ids, hidden until a file loads), `src/worlds/engine.js`, `src/worlds/mirror.js`, `src/gl/chunks/world.js`, `src/gl/trace.js` (stub), `src/ui/worlds.js`, `tests/worlds.mjs`, `tests/worldfrag.mjs`. Edit: `src/gl/renderer.js`, `shader.js`, `chunks/{head,fields,surface,prepare,xform,main}.js`; `src/score/frame.js`, `xform/plan.js`, `xform/shock.js`, `compose.js`, `song-sheet.js` (only what section 4 says); `src/beyond/beyond.js` (`off({ fast })` only); `src/stage.js`, `src/main.js`, `src/music/song.js`, `src/sound/read.js`, `src/ui/effects.js`, `ui.js`, `library.js`, `src/tools/input.js`. | Proofs 1-8, on the record. |
| **J Judge** | `src/music/rehearse.js`, `tools/look.mjs`, `tests/judge.mjs`, `tests/flash.mjs`, new `tests/flashworld.mjs`, `tests/stills.mjs`, `tests/inkcarry.mjs`, `tests/follow.mjs`, `tests/whoa.mjs`. Works to the interfaces in section 4. | A synthetic equal-luminance red-blue flash is caught; the film's numbers don't change by a byte; Follow reproduces the saved AUCs. |

### Stage 1: the first world, and the two long lanes begin. 4 lanes.

| Lane | Owns | Proof |
|---|---|---|
| **W1 Flower Power** | `src/worlds/flower.js`, `src/worlds/flower/*`, `tests/world-flower.mjs` | Every test in section 7 on mgmt and one other song; a 20 s sheet and slices; the whoa sheet. **Then the owner looks at it moving before Stage 2 if they're around.** Any change this teaches the engine goes in now. |
| **X Extras** | `src/music/extras.js`, `src/music/extras.worker.js`, `tests/extras.mjs` | Each field checked on the four songs and on synthetic signals with known tremolo, delay, reverb and bass line; base `A` byte-identical; under 10 s for a 4-minute song; cache works. |
| **M Music** | `src/score/react.js`, `src/music/understand.js`, `src/score/song-sheet.js`, `hand-sheet.js`, `time.js`, `compose.js`, `direct.js`, `moves/slip.js`, `flags.js`, `src/gl/chunks/song.js`, `tests/hear*.mjs` | Identity with flags off after each change. Changes 1-2 together first: Follow from today's numbers to its pass marks, Jerk and Jolt under limits, with a side-by-side for the owner. Then one at a time, each on its own flag with its own test. |
| **J Judge** | as above | Rows on Flower Power. |

### Stage 2: the named worlds. 8 lanes.

W2 Dusk, W3 Flyer, W4 Pearl, W5 Acid, W6 Liquid Light, with M, X, J. Each world owns only `src/worlds/<id>.js`, `src/worlds/<id>/*`, `tests/world-<id>.mjs`; W6 also owns `src/gl/trace.js`. Each must show:

- every test in section 7 on two suitable songs;
- a 20 s sheet and slices;
- the whoa sheet;
- its cost table;
- `stills` against every world already in.

W6 must also show the map's cost, a seek landing on the same bytes, and Unstir ending on the exact next pattern. W3 needs a rock song from the owner.

### Stage 3: the way-different ones. 6 lanes.

W7 Station Point, W8 Supergraphic, W9 Cut, W10 Polariscope, with M and J. Same ownership and proof. W7 must show closure: at the arrival frame, the figure equals the same pattern drawn flat, within anti-aliasing. W8 must show no band break anywhere in a Track at 3024x1964. W9 must show no grey groove lines. W10 must pass `stills` against Pearl or stop.

## 9. What to cut first

In this order. Stop as soon as there's time enough.

1. Polariscope. The list then still has three way-different worlds.
2. Display P3, needle drag on Cut, Thin Section, Ribbed Corridor, Columns.
3. Music 11, then 10, then 9.
4. Acid's Honeycomb and print loop, leaving the analytic stair only. Chronophotograph falls back to a plain flight.
5. `A.x.clip`, `A.x.shim`, `A.x.width`: those worlds fall back to `A.E` and detune by energy.
6. Flyer's `wave` falls back to a fixed square-to-sine table driven by `A.E`. Weaker, and it's the world's best idea, so this is late.
7. Supergraphic's Room and Round the corner, leaving Track, Ride and bends.
8. Liquid Light's map, to the fallback in its spec. Not the world.
9. Music 7, then 6.

Never cut: the ink rule, the identity test, the flash channels, or music changes 1-3. The six named worlds and three way-different ones are the minimum. Going below that needs the owner's word.

## 10. Needed from the owner

- A rock song and a slow, reverb-heavy song in `media/` (symlinks, never committed). The four there are house, psych-pop and dream pop.
- Whether plain black and white opts into the new music, after seeing it side by side.
- A look at Flower Power moving before the rest are built, if they're around.

## Sources

From the designers' reports, for technique only. Not rechecked here.

- Flower Power: [Moscoso](https://victormoscoso.pro/faqs), [Livingstone](https://news.harvard.edu/gazette/story/2012/11/ways-of-seeing), [equal-luminance flash, the 1997 episode](https://en.wikipedia.org/wiki/Denn%C5%8D_Senshi_Porygon).
- Liquid Light: [Joshua Light Show](https://www.joshualightshow.com/about-classic/joshua-light-show-1967-68), [liquid light shows](https://en.wikipedia.org/wiki/Liquid_light_show), [Taylor](https://mechanicsandmachines.com/?p=468).
- Acid: [Bressloff and Cowan](https://pubmed.ncbi.nlm.nih.gov/11316482/), [Schwartz's map](https://www.frontiersin.org/journals/computational-neuroscience/articles/10.3389/fncom.2015.00003/full), [LSD trails](https://pmc.ncbi.nlm.nih.gov/articles/PMC3091843/), [blacklight posters](https://en.wikipedia.org/wiki/Blacklight_poster), [spiral tie-dye](https://www.dharmatrading.com/blogs/t/the-spiral-tie-dye-basics).
- Flash: [WCAG](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html).
- Supergraphic: [Solomon](https://www.tclf.org/pioneer/barbara-stauffacher-solomon), [Mira-Spectrum](https://www-3.collection.cooperhewitt.org/objects/1108806915), [sequential variations](https://www.metmuseum.org/art/collection/search/491744).
- Flyer: [xerography](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/5899596), [Chantry](https://creativepro.com/type-talk-art-chantry/), [riso](https://blogs.brighton.ac.uk/viscommtech/risograph-printing).
- Spring: [split fountain](https://en.wikipedia.org/wiki/Split-fount_inking), [spring reverb](https://uaudio.com/webzine/2006/april/text/content2.html), [Day-Glo](https://si.edu/object/original-poster-endless-summer-created-john-van-hamersveld:nmah_1761100).
- Dusk: [Eastmancolor fade](https://filmcare.org/vd_dyefade.php), [halation](https://www.cined.com/chasing-the-glow-understanding-halation-and-why-filmmakers-keep-coming-back-to-it/), [Ratnam](https://www.ee.columbia.edu/~dpwe/papers/Ratnam03-reverb.pdf), [Santos](https://sonicfield.org/library/toward-blind-reverberation-time-estimation-for-non-speech-signals), [few free decays](https://arxiv.org/pdf/2010.11167).
- Pearl: [Belcour-Barla in glTF](https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Renderer/main/source/Renderer/shaders/iridescence.glsl), [moire antique](https://patents.google.com/patent/US5337460), [Grierson](https://eyemagazine.com/feature/article/23-envelope-ambience-and-inner-space), [Guthrie](https://xlr8r.com/?p=93082).
- Cut, Station Point, Polariscope: [Whitney](https://microfest.org/visual-microtonality), [Fischinger](https://www.centerforvisualmusic.org/Fischinger/SoundOrnaments.htm), [Varini](https://en.wikipedia.org/wiki/Felice_Varini), [strobe tuners](https://en.wikipedia.org/wiki/Electronic_tuner), [force chains](https://arxiv.org/pdf/1902.11213).
- Music:
  - Perception: [binding](https://pmc.ncbi.nlm.nih.gov/articles/PMC4744562), [silencing](https://suchow.io/silencing/), [capture](https://link.springer.com/article/10.3758/BF03193623), [transients](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC2871056/), [conductors](https://cspeech.ucd.ie/rppw/rppw10/luck/abstract.html), [bouncing ball](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4493690/), [tactus](https://cdn.carleton.edu/uploads/sites/721/2021/12/London-2011-Tactus-vs-Tempo.pdf), [pitch mappings](https://pmc.ncbi.nlm.nih.gov/articles/PMC2920420), [surprise](https://cms.mus.cam.ac.uk/publications/cheung-uncertainty-surprise/), [beat alignment](https://arxiv.org/pdf/2101.08779).
  - Choreography: kar.kent.ac.uk/93493, create.routenote.com/blog/how-to-create-impactful-edm-drops-5-top-tips, ticketfairy.com/blog/kinetic-festival-lighting-without-chaos-movement-cues-for-drops.
- Engine: [Apple GPU talk](https://developer.apple.com/kr/videos/play/tech-talks/111431/), [Beyond3D thread](https://forum.beyond3d.com/threads/apple-dynamic-caching-on-m3-gpu.63419/), [WebKit bug](https://www2.webkit.org/show_bug.cgi?id=251514).
