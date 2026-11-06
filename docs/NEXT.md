# Tonight's build

Read this file and `docs/ENGINE.md`. Numbers are first guesses until a test says otherwise. Every new move has been seen only as stills, so judge it moving (a 20 s sheet plus `slices.jpg`, with kymograph lines unbroken) before composing it into a film. Prototypes are in `S=/private/tmp/claude-501/-Users-evansmac-Downloads-eprojects-trippy-pattern-world/bc364b04-5eba-4685-8aaf-f2c74cd89858/scratchpad`.

**Rules for every lane.** Edit only the files your lane lists; everything else is off limits, and the tempting ones are named under "Not". Lanes don't commit; the lead commits when a stage's gate passes. Use `--out lab-out/<lane>`. At most two browsers run at once, so test sparingly. If a test breaks in another lane's file, wait two minutes and retry; don't fix it. Leave the tree working after every edit. Every feature reads a flag in `src/score/flags.js`, so a failure gets switched off, not debugged at 5 am. No new `prepare` or `inkOf` call site unless measured. Pure functions of (score, t, edits). No lighting.

**Decisions.** Nothing passes through a solid; `ENGINE.md` beats `STUDY.md` here. No global pulse: strong beats travel as rings. No `ANALYSIS_VERSION` bump. Hits are singularities, not amplitudes: disorder resolves to order on the beat. Star Sphere knowingly crosses DESIGN's Möbius line, as a carrier and not a look; tell the owner.

**Do not build:** Polycrystal, torus, trefoil, impossible triangle, gyroid, stand-up, road, River's concentric lines, Time's coordinate delay, Pour, Unstir, Pleat, Barcode, Swallow, form doors, X-ray ball, Turntable, Rewind, bass groundswell. Doors and Cloth run only on a side branch, and only if the Freeze passes early.

## 1. What this becomes

trippee stops following a song and starts knowing it. It has heard the whole song before the first frame, so it can show what's coming, stop when the band stops, and treat a chorus as somewhere you arrive. **The Countdown:** a dartboard shatters 16 s before the first chorus, its rings lock one per bar from the outside in, and the last falls on the downbeat; you can count it with your eyes, and nobody has to explain it. **The Stop:** strong beats close on the centre as rings of line weight, then the band stops and a film that never stops freezes on that exact frame, still pouring in your eye, until the sound returns. **The Arrival:** the next world comes in from the rim as a ring with its lines unbroken, or the camera hangs and then falls through a door and hits the chorus at speed; at the climax the sheet rolls up, turns inside out as a flower and is swallowed.

## 2. The engine

### 2.1 Step zero: split the big files

The cut comes first, in two commits. **Commit A is a pure cut:** `src/gl/shader.js` joins chunks, and `node -e` of `sha256(FRAG)` must still start `7b6dd9b9f93b0ca1` (measured tonight). **Commit B adds stubs and reserved numbers:** pixels must match `tests/hash.mjs` (new; `MODE=save|check`; sha256 of `trippee.capture()` at 1280x720 for all patterns at u .25, .5, .75, 12 fixed morph pairs at 3 times, Beyond at `snap(0)` and `snap(.6)`, fixed ripple and warp edits, governor off).

| New file | Holds |
|---|---|
| `src/gl/chunks/{head,surface,matte,hand,prepare,ink,plates,main}.js` | cut from `shader.js` at lines 9, 30, 85, 117, 244, 392, 443, 468 through 621, keeping every byte |
| `src/gl/chunks/{moves,carry,fields,field-impossible,field-riley,song,xform,handview}.js` | stubs below |
| `src/score/slot.js` | `base, fillSlot, arcU, boldRange, fineness, thetaOf, noHorizon` (`frame.js` re-exports them) |
| `src/score/morphclock.js` | which morph is running, and its x |
| `src/score/song-sheet.js`, `hand-sheet.js` | the song block and the edits block of `frame()` |
| `src/score/xform/{index,plan,slide,bend,flight,shock,iris}.js` | `makePlan` and friends; shock and iris are stubs |
| `src/score/moves/{index,slip,star,coin,snap}.js`, `time.js`, `flags.js`, `direct.js` | stubs; `direct` is identity |
| `src/music/understand.js` | stub returning neutral data (2.5) |
| `src/pattern/families/{dials,coins,riley,impossible}.js` | `export default []`, already imported in `library.js` |

Stub call sites, all compiling away: first line of `prepare` `p=moveCarry(b,p);` (before `p0`); after the view `X.xy=carryX(b,X.xy);`; before the family loop `float sl=moveSlip(b,X.xy,b1),fS=fieldS(b,X.xy);`; in the loop `sm+=fS*uG[b+I_fieldK][i];` before `g`, then `gPh[k]=...+sl*uG[b+I_slipM][i];` after it, and `gDu[k]=abs(fb.w)<.85?clamp(fb.w+gTune*DS[i],-.85,.85):fb.w;` (a closed family must stay closed; `DS=vec4(1,-.5,.75,-.25)`). In `main`: `p=handView(p);` after the song lenses, `songField(p0);` before `th`, `T=xfT(p0,uF[0].x)` in the bend branch, with `gGr[qa]=mix(gGr[qa],gGr[qb],T)+(gPh[qb]-gPh[qa])*gDT;` moved above `gPh[qa]=mix(...)`.

Reserved once in `layout.js`, then frozen. **Slot (+10, `SLOT_VEC4` 59):** `slip[kind,n,u,ang] slip2[left,step,ease,seed] slipM[m0..m3] star[k,qx,qy,qz] star2[qw,_,_,_] carry[lathe.k,lathe.w,meta.amt,meta.k] field[kind,a,b,ph] field2[spin,scale,_,_] fieldK[k0..k3] spare`. Defaults `star.qw:1, slip.ease:1`. Add `slip.kind, slip.n, field.kind, field.a, field.b` to `SNAP`, and require those field numbers equal in `plain`. **Frame (`FRAME_VEC4` 63):** `weight:35 focus:36 wt:37(16) tune:53 tens:54(4) xf:58 xf2:59 handv:60 spare:61(2)`, with matching `#define F_*`. The block stays under 3 KB.

### 2.2 Ways of moving

A move is a pure function that writes slot numbers, so any gesture can wear any move it passes, and arcs, knobs, slides, flights, plates and the hand all work with no extra code. `R.probe` sees it because it sets the slot.

```js
// src/score/moves/<id>.js. G.moves = [{ id, ...settings }]; fillSlot runs them after drive, before G.over.
export default { id, needs(slot, G) {}, write(out, { u, t, phi, OFF, G, m }) {} };
```

**Slip** (one formula for Lock and Tumblers). Every band is an exact isometry and whole cycles vanish, so lines never thin and it works on anything with a family running along the bands. Added after the gradient, so a jump draws no outline.

```glsl
float slipAt(float n,vec4 s,vec4 c){ float l=0.;
  if(c.x>0.){ float left=max(c.x-abs(n)*c.y,0.),h=fract(sin(n*12.9898+c.w)*43758.5453),W=mix(.2,.4,h)*(fract(h*7.)<.5?-1.:1.);
    l=W*(left>c.z?left-.5*c.z:left*left/(2.*c.z)); }
  return n*s.z+l; }
float moveSlip(int b,vec2 X,vec3 b1){ vec4 s=uG[b+I_slip]; if(s.x<.5) return 0.; vec4 c=uG[b+I_slip2];
  float e=s.y*(s.x<1.5?dot(X,vec2(cos(s.w),sin(s.w))):s.x<2.5?b1.x:s.x<3.5?b1.y+4.:b1.z+.5);  // 1 straight, 2 rings, 3 log rings, 4 sectors (tumblers only)
  float n=floor(e),r=smoothstep(1.-min(fwidth(e),.5),1.,e-n);   // the last pixel of a band ramps into the next
  return mix(slipAt(n,s,c),slipAt(n+1.,s,c),r); }
```
- *Lock:* `slip.u` is a C2 `evalTrack` resting on 0, 1/4, 1/3, 1/2, 2/3, 3/4, 1 at bars 0, 2, 3, 4, 5, 6, 8 from a phrase downbeat, and only ever grows. `n=2k` gives square cells. Straight cuts only when `540*scale/n >= 90` px over the whole gesture, or it reads as aliasing; rings first. Viewer: plain stripes start to lean, then you see they're stepping; on bar 4 a checkerboard nobody drew clicks in, and on the phrase downbeat every cut closes with no seam. "What?": nothing morphed, every line only slid.
- *Tumblers:* `slip.left = tau(lockT) - tau(t)`, clamped at 0, in beats; `slip.step` is beats per band (one bar, or two if that keeps the run at 12-24 s). Whole-cycle closure: frame at lock against slip off differs by under .1/255.

**Star Sphere.** One knob, `star.k = 1/R`: at R 40 a flat checker, at 16 a crease enters at the edge, at 2.2 the frame is full of flowers. Stretch measured 1.02 at p99.9, and the fold has no seam.

```glsl
const vec3 N3=vec3(-.5,-.809017,.309017);
const mat3 CH=mat3(.008722,-.991278,-.131496,-.991278,.008722,-.131496,.131496,.131496,-.982557);  // chamber centre to the south pole; columns
vec2 moveCarry(int b,vec2 p){ float K=uG[b+I_star].x; if(K<=0.) return p;
  vec4 q=normalize(vec4(uG[b+I_star].yzw,uG[b+I_star2].x));
  vec2 z=p*K; float n=1.+dot(z,z); vec3 P=vec3(2.*z,n-2.)/n;
  P+=2.*cross(q.xyz,cross(q.xyz,P)+q.w*P); P=transpose(CH)*P;
  for(int i=0;i<6;i++){ P.xy=abs(P.xy); P-=2.*min(dot(P,N3),0.)*N3; }
  P=CH*P; return P.xy/max(1.-P.z,1e-4)/K; }
```
The `transpose(CH)` is a correction to the prototype, worked out on paper: without it the flat limit isn't the identity, and changing K pans the picture wildly. In the chamber |w| <= .22 (computed), so source radius is .22R; use only stripes and big checks. Chord map: axes in the chamber are v5=(.52573,0,.85065), v3=(0,.35682,.93417), v2=(0,0,1). Distance in fifths from home q gives the target: 0 v5, +1 v3, -1 v2, +2 v3+v5, -2 v2+v5, otherwise v2+v3, normalised; minor adds a 36° roll. Choose the rotation taking the south pole to `CH*v`, then the nearest of the 60 equivalent orientations (close the group from the three mirrors, ~20 lines), and slerp over at least 2 bars, ignoring chords under 1.2 s. Viewer: a checker; a crease slides in, black flowers drift in and turn; the chord changes, the ball rolls, a three-armed star settles at the centre. "What?": kaleidoscope axes never move, and by the second chorus you predict the next star.

**Coin.** `carryX`: `r=length(X); for 3 times { A=k*r; r=length(X-A*u); } X-=A*u;` with `u=(cos w,sin w)`. Spun coin: x is beats to landing, `k=a0*x/x0`, `w=TAU*2*log2(max(x,.02))`, so orbits complete at x = 16, 8, 4, 2, 1 at constant apex speed and it hits dead flat on the downbeat. Viewer: bold off-centre rings wobble, then become a cone leaving the screen, then settle faster and faster. Builds only, 30 s at most, chord lenses off, or it's "a wobble on one pattern".

### 2.3 Transformations

```js
// src/score/xform/<id>.js. The director sets G.xform = { id, ... }; plan.js tries it first, then the usual order. plan.kind = id.
export default { id, plan(a, b, ctx) {}, enter(st) {}, write(st, A, B, F) {} };   // plan returns null if it can't; enter sets theta, thetaB, solid, moveA, moveB
```

**Reach, measured tonight.** 150 random pairs planned as dive 108, rise 35, slide 7, bend 0. Of 3782 ordered pairs only 110 meet bend's rule; 392 have at least one family pair and are near in size. So Shock must close and open unpaired families locally, and the director must pick next patterns that allow it, or it will never appear.

**Shock.** The bend with its time made local. Lines stay continuous, so no seams.

```glsl
vec2 gDT=vec2(0.);
float xfT(vec2 p0,float T){ vec4 x=uF[F_XF]; if(x.x<.5) return T;       // x: 1 in, 2 out; y progress; z front width W=.42; w Rmax*1.15
  float R=length(p0-uF[F_XF2].xy)/x.w; if(x.x>1.5) R=1.-R;
  float u=clamp((x.y-(1.-R)*(1.-x.z))/x.z,0.,1.); T=u*u*u*(u*(u*6.-15.)+10.);
  gDT=vec2(dFdx(T),dFdy(T)); return T; }
// unpaired, only with xf on and |d|<=1.01: gDu[i]=mix(gDu[i],-1.,T) for A; gDu[FAM+j]=mix(-1.,gDu[FAM+j],T) for B. d=-1 is neutral in the XOR.
```
Set `t1 = landing + W*D/2`, so the centre's midpoint is the hit. Stretch D where phases differ a lot (`checks.vega > checks.twist` runs fast). Viewer: a ring of refraction comes in from the corners with lines passing unbroken through it, triangles become hexagons from the outside in, the centre turns on the kick.

**Fall.** Flights only, dives only, top 1-3 landings. `T=mix(smoother(x),x*x*x,a)` with `a` from arrival strength (2.5). The inner pattern carries on at the speed it arrived: `v=.35*lnZ*3a/D`, `tau=min(bar,.92/v)`, `scale*=exp(v*tau*(1-exp(-(t-t1)/tau)))` in `fillSlot` via `G.carry`. Impact about 1 ln/s, total carry under x2.5. Viewer: the flight hangs, then falls, crossing at speed exactly on the beat.

**Flight fold (first, in Stage 1).** Cost follows call sites: flight 38.7 ms at 5 sites, 4.8 ms at 4, pixel-identical. Fold the plates' `inkOf` calls too.

```glsl
float mm[2],cc[2];
for(int j=0;j<2;j++){ mm[j]=prepare(j,j*SLOT,(j==0)==bOuter?p:pz); cc[j]=mix(j==0?o:oB,inkOf(j,j*FAM,(j+1)*FAM,j==0?th:thB),mm[j]); }
```

**Iris.** A flight mode, `dive.w==5`, no new program, climax only. Focus `dv.xy`; `dv.z` is `c(x)=mix(Rmax+R0,-R1,smoother(x))`; `Rt=sqrt(R0*R0+g*g*x)` in `uF[F_XF2].z`, `R0=.3, g=.5`, `R1=Rt(1)+.05`. With `q=length(d), s=q-c`: B flat where `s>Rt`, A wound where `|s|<=Rt` at radius `c+Rt*(PI-asin(s/Rt))`, A flat inside, `irisB=aaOf(s-Rt)`, `c=mix(cA,cB,irisB)`. Ends are exact. Close the limb's hairlines to solid (`gDu+=smoothstep(.16,.42,gGn)` there, `gBreak` at the limb); it must lose the thin ring. Viewer: the sheet rolls in from the rim and turns inside out into a flower that shrinks away inside the next pattern.

### 2.4 Surfaces and fields

Three doors, none costing a pattern that doesn't use it:
- **Before the surface:** `moveCarry`. **After the view:** `carryX`. Coordinates only, amount 0 means skipped.
- **Scalar field:** `fieldS` returns S; family i adds `fieldK[i]*S` to its phase before the gradient. Since `tri(.25+.25S)=S`, a family with `ph:.25, fieldK:.25` draws S's zero set with the exact band filter, and threshold, XOR, plates and flights just work. `fields.js` dispatches on `field.kind` (0 off, 1 river, 2 arcade, 3 blaze) to `field-impossible.js` and `field-riley.js`.
- **Marched surfaces:** a new `GEO` program bit, read from `surf.kind>=3` in `_programFor`, which `R.probe` must then also use. Stretch only.

Gate for all: `DSF=2 GOV=0 tests/fps.mjs` median doesn't rise over 3% with the feature present and off; each new pattern p95 at most 17.5 ms.

### 2.5 How the song reaches the picture

`buildReact` calls `understand(A)` from the cached `A.chroma` (12 per chord step), `A.chord` (index = 2*root+minor), `A.beats`, `A.loud`, `A.E`, `A.perc`, `A.bass`, `A.m`, `A.bright`, `A.novelty`. Measured on four songs: `A.key` disagrees with the chords (right 11/20 on synthetic loops), `voiced` is nearly constant, `swellRegularity` never passes its gate, `phraseBars` is always 16. So:

```
M = { home:{root,minor}, runs:[{t0,t1,c}], place(c)->[x,y], tension(c), breath:{beats,t:[...]}, rests:[{a,b,db}],
      C(t), arrival:[per bar], gains:{drums,tune,tone,harm}(t) }      // neutral stub: C(t)=t, gains 1, no rests
```
- **Home:** chord per beat by majority, then runs. Key signature `k=argmax Σ dur*K(q)`, q the fifths from k to the chord's relative major, `K(0)=1, K(±1)=.8`, else -.3. Home is I unless vi outweighs it 1.1x, downbeats counted double.
- **Place and tension:** `P(c)=(.62q,-.46minor)`, |P|<=1.3. `τ(c)=|P|(1+.5*lead(c))`, `lead(c)=P(next run is home | c)`, learned from this song.
- **Breath:** `R(L)=mean cos(chroma_b,chroma_{b+L})` for `L=k*meter`, k<=32. Loop: smallest L of at least 2 bars with `R>=.88max`. Halve or double into 5-11 s. Offset: the bar phase with most chord changes plus 2*novelty. `lung`: attack `min(bar,.18P)` ending on the breath, decay `exp(-x/.45P)`, depth `E(next)/E(this)` clamped .5-1.5. It gives +.16 on the centre lens (R 1.6) and `theta -= .10*solid*lung`.
- **Rests:** `loud < .45*local p70` (±4 bars), local > .25, at least .9 beat. At most 4 per song, never while the band plays on. `A.loud` is normalised `log1p(30*rms)`, not dB, so the 12 dB drop is checked in the test from the decoded audio. Print the list for all four songs before enabling.
- **Arrival:** `s=2*max(0,ΔE over 4 bars)+max(0,Δperc over 2 bars)+.3*novelty`, `a=clamp((s-.35)/.5)`.
- **Conductor:** per beat, each stream's distance to the same beat one loop ago (drums 6-bin perc, tune pitch up to 5 semitones, harmony chord differs, tone brightness), normalised by p90, clamped 1.5, averaged per breath. Lead is the largest and switches only at a breath start with margin over .08. Gains: lead 1, runner-up .45, others .2, drums never under .35, eased over a bar. They replace `(1-.45*voiced)`.

**The Stop's clock.** `score.time(t)`, a table built by integrating a rate: 1→0 over the last beat before `a`, 0 to `b`, 0→1.5 over .25 s, 1.5 until the lag is paid, then 1 over 1 s. `frame()` runs `t=beyond(score.time(t))`, and `app.pictureT` does the same. Reactive signals don't lag: `buildReact` resamples them onto the collapsed axis `C(t)=t-∫rests` and `frame()` reads them at `C(beyond(tReal))`, so tables freeze in a rest and are back in step on re-entry. A landing within 1.5 bars of a rest moves to its start; no morph may start before the lag is paid.

**The weight field.** One table, phase and threshold only, so nothing folds.

```glsl
#define WT(i) uF[F_WT+(i)/4][(i)%4]
#define TS(i) uF[F_TENS+(i)/4][(i)%4]
float gBeat=0.,gTune=0.;
float wAt(float s){ float f=clamp(s*8.+32.,0.,62.99); int i=int(f); return mix(WT(i),WT(i+1),f-float(i)); }
void songField(vec2 p){ vec4 w=uF[F_WEIGHT],u=uF[F_TUNE]; if(w.x==0.&&w.y==0.&&u.x==0.) return;
  float r=length(p-uF[F_FOCUS].xy);
  if(w.z>0.) gBeat=max(wAt(r*w.z),.6*wAt(-r*w.z));     // arrives from the rim, on the beat at the centre, then leaves
  if(u.x!=0.){ float f=clamp(r*u.w,0.,14.99); int k=int(f); gTune=u.x*mix(TS(k),TS(k+1),f-float(k))*sin(TAU*(r*u.y-u.z)); } }
// main: th=uG[I_shape].z-gBeat*w.x; thB=uG[SLOT+I_shape].z-gBeat*w.y;
```
JS each frame: `wt[i]=beat(C+(i-32)/8)`, with `w.z=1/.6`, `w.x,w.y=.16*solid*gain` on moved slots only. Keep `|theta|+amount<=.9*solid`. Tune rings: `v=.55`, `λ=v*bar` (2 bars if a bar is under 1.2 s), `u.y=1/λ`, `u.z=tau/meter`, `u.w=1/(.25v)`, `u.x` up to .55, fading to 0 by x=.25 and back from x=.75 in a flight so the element can't slip. Focus is `P(t)*.45`. **Lens map** replaces `shapeOf`'s hash: three lenses at `P+.45(cos θi,sin θi)`, 120° apart, `a_i=.12+.4τ` (sign flipped on the second), R .7; slots pan `tx,ty += -.2P`. Viewer: on a dominant the centre drags right and rings of fat and thin lines spread from it; on the tonic it glides home and a disc of even lines opens from the middle. "What?": the calm is visibly something the chord did.

## 3. Stages and lanes

Each stage ends in one commit that can be pushed, named below. Shares of the night in brackets. The snapshot `c0aa315 evan snapshot 1` stays where it is.

### Stage 0, Ground (5%): v2.0.1
- **G1, the split.** Commit what's uncommitted first (`frame.js`, `ENGINE.md`, `styles.css`, `tests/v2.mjs`, `tests/flat.mjs`, this file) on top of the snapshot. Then all of 2.1. Owns all of `src/`. Not: `tests/judge.mjs`. Tests: FRAG hash, `tests/hash.mjs`, `STAGE=boot tests/v2.mjs`, `tests/integrate.mjs`.
- **G2, the judge.** Owns `tests/judge.mjs`, `tests/hash.mjs`, `tests/all.mjs`. Not: `src/`. Build the table in section 4 and capture all four songs. It must flag the known bad stretches on ppp: 93-106 s noise, 43-49 s and 62-65 s one colour, 8-25 s and 111-134 s stasis. 78-92 s must pass.

### Stage 1, Nothing broken (15%): v2.1
Enjoy: flights at full sharpness, no salt and pepper, every click lands, every tool plays.
- **R, flights.** Owns `src/gl/renderer.js`, `chunks/{main,plates}.js`, `xform/{plan,flight}.js`, `score/frame.js`. Builds: probe bug (the first two `R.probe` calls fail with `INVALID_OPERATION` and return black, because the new texture stays bound on unit 0: rebind the brush texture, one line); `probe` picks the slot's variant; flight fold; `makePlan` as a generator, one probe per frame, starting 2 s before a morph, finishing at once if time runs out (31 ms measured today). Not: `slot.js`, `stage.js`. Tests: hash identical, re-saved for later stages, first probe has lit pixels, `tests/film.mjs` `tier` unchanged through flights, p99 at most 20, max at most 50.
- **B, boldness.** Owns `music/rehearse.js`, `score/slot.js`, `score/compose.js`, existing family files (data only). Builds: rehearsal renders each gesture at 13 values of u at the real aspect and measures grey, white and tiles; `G.range` is the longest good run. No good run: the pattern sits out. Minimum travel: if the range shrinks under .3 or moves under ln 1.5, add `rot` and `scale` arcs with `at:[lo,hi]`. Add `pool:false`, kept in the library, out of films and the wander: `lines.discs waves.sea waves.dune waves.swell waves.silk waves.cloth waves.pond dots.funnel body.bowl body.vase void.diamond void.eclipse rooms.chevron pole.rain`. Set `waves.current` to family `lines`. Not: `song.js`, `frame.js`. Tests: judge on all four songs, rehearsal under 4 s.
- **H, hands.** Owns `stage.js`, `main.js`, `tools/{input,effects}.js`, `ui/library.js`, `music/song.js`, `score/{morphclock,hand-sheet}.js`, `chunks/handview.js`. Builds section 5A and 5B; honours `pool:false` in `_nextPattern`. Not: `frame.js`, `chunks/main.js`, `src/sound/*`. Tests: `tests/pick.mjs`, `tests/tools.mjs` (new), `tests/hand.mjs`, `tests/effects.mjs`.
- **S, sound.** Owns `src/sound/*`. Builds section 5C. Not: `frame.js`, `input.js`; it only reads `app.edits`. Tests: `tests/toolsound.mjs` (new), `tests/sound.mjs`.

### Stage 2, It listens (15%): v2.2
Enjoy: the sheet breathes with the phrase, knows home, stops with the band, and melody isn't drowned out.
- **U, understand.** Owns `music/understand.js`, `score/react.js`, `tests/understand.mjs`. Builds M, the collapsed arrays, and `reactAt` extended with `lung, tension, gains`. Not: `analysis.js`, `compose.js`. Tests in node on synthetic I-V-vi-IV in five keys: home 20/20, loop 20/20. Real songs, as the prototypes measured: ppp Db 6.9 s, wildflower Eb 5.9 s, disclosure C#m 7.2 s, mgmt G 7.7 s.
- **W, weight.** Owns `chunks/song.js`, `score/song-sheet.js`. Builds the weight field, tune rings, lens map, lung, conductor gains; `edits.conductor=0` for A/B and `edits.reactHarmony`. Not: `react.js`. Tests: Wave, Balance, Breath, `tests/beyond.mjs`.
- **T, the Stop.** Owns `score/time.js`, `score/frame.js` (the clock lines), `main.js` (`pictureT`). Builds `score.time`. Not: the rest of `frame.js`, `song-sheet.js`. Tests: Rest, Purity across rests, `tests/pops.mjs`.
- **K, form.** Owns `score/compose.js`. Breath replaces `phraseBars` in the swell gate, landing score and `drive`'s period; arrival joins the landing score; landings move to rests. Not: `react.js`. Test: Breath, boundaries still landed.

### Stage 3, What? (25%): v2.3
Enjoy: the Countdown, Shock, the Fall, the Coin. A hero within 90 s of every film.
- **L, slip.** Owns `chunks/moves.js`, `moves/slip.js`, `families/dials.js`. Six dials as data: `[ring(2.2),spokes(12)]`, log rings with spokes, square rooms, diamonds, sectors with rings, a sunburst. Not: `direct.js`, `compose.js`. Tests: Closure, Countdown reads, 2x crops of curved cuts at DSF 1 and 2, hairline count no worse than baseline.
- **X, shock and fall.** Owns `chunks/{xform,main}.js`, `xform/{index,plan,flight,shock}.js`, `slot.js` (`G.carry`). Not: `direct.js`. Tests: `tests/pops.mjs` per kind, a shock-feasible pair list, kymographs unbroken, `tests/beyond.mjs`.
- **O, coin.** Owns `chunks/carry.js`, `moves/coin.js`, `families/coins.js`. Not: `direct.js`. Test: lands flat on the frame (diff against k=0 under .1/255), and watch it moving.
- **D, director.** Owns `score/direct.js`, `score/compose.js`, `score/song-sheet.js` (the ambient gain). Not: any chunk, `xform/*`. Runs after gestures are built:

| Moment | Move |
|---|---|
| First landing with s >= .35 before 90 s, else the strongest there | Countdown: dial gesture from `L-bands*step` to the next landing at least 12 s past L; flow is 0 until L, then releases over a bar; slip locks at L |
| Top 3 landings | Fall |
| Build, dE > .1 for 8+ bars | Coin, once |
| Label change, feasible | Shock in; swap the next pattern within its pool to make it feasible |
| dE < -.1 | Shock out |
| Dull body (stripes, checks) | Lock |
| Replayed section | Same kind, direction mirrored |

One hero at a time, ambient channels x.3 during it. Never the same kind twice running; at least 4 kinds per film. Tests: Variety, Balance.

### Stage 4, More worlds (15%): v2.4
Each pattern joins the pool only after its gates: atlas, 20 s sheet and slices, fps, flat.
- **A, star.** Owns `chunks/moves.js`, `moves/star.js`. Plain roll first, chord map second. Not: `react.js`, Slip's code. Tests: `R` from 40 to 2.2 has no pop, same chord gives same picture, 2x crops.
- **P, Riley.** Owns `chunks/{carry,field-riley,matte}.js`, `families/riley.js`, `moves/snap.js`. **Blaze:** `{l1:5}`, `S=tri(12θ/TAU+b*ln r+ph)`, `fieldK=.32`, b 0 to 2.2, flow on `field.ph`; it seems to turn even when still. **Octagrid:** four `plane(1.7,a)` at 0, 45, 90, 135, phases moving by `cos(135°j)*phi`; rosettes swim faster than any line moves. **Metamorphosis:** `X.x+=amt*E(X.y); X.y+=amt*E(X.x)`, `E(s)=.22sin(TAUs+.4)+.09sin(2TAUs+2.2)+.05sin(3TAUs+.9)`, amt at most .85, on a check; squares grow hooks and lock into creatures. **Labyrinth:** `matte.kind 3`, `sd=dot(sin(q),cos(q.yzx))`, `q=(p*2.2,z)`, `bg.rot=π/2`. **Snap:** on dots, θ crosses 0 on a breath, so every dot touches at once. Not: `compose.js`. Test: fps, flat.
- **I, impossible.** Owns `chunks/field-impossible.js`, `families/impossible.js`. River and Arcade, parity tiles only, with the fine edge off frame: `$S/artist/modes.mjs` `hypFold` (24 steps; `S=par*clamp(e*K,0,1)`; even P only; strip scale .85-.94; `{hyp 6,4}`, `{8,3}`; `fine:true`) and modes2 `cusp2` (48 steps). One tile per 2 bars. Viewer: identical hexagons pour sideways, crushing at top and bottom, with no source, sink or reset. Not: `fields.js`. Test: fps, s+1 changes 0% of pixels, `fine` keeps the arc.
- **C, climax.** Owns `chunks/main.js`, `xform/iris.js`, `score/direct.js`. Iris at `A.climax`, plates shut on it. Not: `compose.js`. Test: hairline count, `tests/beyond.mjs`, Variety.

### Stage 5, the Freeze: section 4 (at least 20%)

## 4. Final polish: v3

Fixes and flags only. No new features. If this passes early, stretch work goes on a side branch.

- **J, films.** Owns `direct.js`, `flags.js`, numbers in `moves/*` and `xform/*`. Whole films, four songs, black and white and Beyond; look at every sheet. Try the Countdown's Beyond closure (`r=base+.25*mean out-of-register`) only now, and keep it only if it adds.
- **F, pairs.** Owns `xform/plan.js`, pattern data, `tests/pops.mjs`. All ordered pattern pairs at 160x90, about 5 minutes.
- **V, interface.** Owns `src/ui/*`, `styles.css`, `index.html`, `tests/v2.mjs`. One bar: `#bar`'s buttons join `#fx`, up when the mouse moves. A "the film may" row of flag toggles in the song panel, which recomposes. Fix stale help ("past each solid is the next pattern" should say thinner or fatter lines). Delete dead code: `takeHold`, `V`, `pol0` and `BODY`, `veil`'s close and open.
- **N, notes.** Owns `README.md`, `docs/ENGINE.md`, `docs/DESIGN.md` (a Never-build note), `docs/MORNING.md`. ENGINE gets chunks, moves, transformations, fields, flags, clocks. MORNING says plainly that no test proves a move feels musical, what to watch first, and every flag.

`node tests/all.mjs` runs all of it and writes `lab-out/final/report.txt`. `judge` drops a song like `film.mjs`, runs `watch()` over the whole song at 12 fps at 1080p, and at 60 fps within ±.5 s of every boundary, rest and lock. Thresholds are first guesses; calibrate so the bad stretches above fail and ppp 78-92 s passes.

| Test | Measure | Pass |
|---|---|---|
| Pops | `tests/pops.mjs`, all pairs, per kind | `max(start,end) <= max(2*steady,4)`; worst step of 400 <= 3x median + 2 |
| Console | every test, plus `gl.getError()` every 60 frames | none, in every mode |
| Frame rate | `GOV=0 tests/fps.mjs --size 1920,1080`; `W=1512 H=982 DSF=2 GOV=0 tests/fps.mjs --size 1512,982` (3024x1964) | every pattern p95 <= 17.5 ms; film `fps` >= 58, `p99` <= 20, `max` <= 50, `tier` unchanged |
| One colour | `tests/flat.mjs`; `white`, `tiles` | no new failures; white outside .12-.88 at most 3 s; never over 3 s with 9+ tiles under 12 or over 243 |
| Noise | `grey`, `edges` | no run over 2 s with grey > .25 or edges > 130 |
| Stasis | 12 s windows outside rests | none with edges varying under 10% and every tile moving under 8/255 |
| Jerk on pulses | `diff` ÷ rolling ±1 s median, 60 fps windows | at most 3; `largestLuminanceStepPerFrame` no worse than baseline |
| Flash | `flashesPerSecond*` | 0 whole frame, at most 2 any tile |
| Balance | channel alone (`reactPulse`, `reactMelody`, `reactTone`, `reactHarmony`), motion energy per breath | lead >= 50% in >= 80% of breaths; pulse <= 35% over the song |
| Breath | `white` autocorrelation | peak at the breath lag on 3 of 4 songs; attacks >= .5 s |
| Wave | line weight at r .2 and .9, 96x54 | inner peak ±1 frame of the beat; outer lead r/c ±2 frames; permuted beats p < .01 |
| Rest | `diff`, loudness | under 5% of surrounding median; over 50% within .5 s of re-entry; drop >= 12 dB; at most 4 |
| Closure | lock against slip off | mean diff < .1/255; each band within 1/255 of final, ±1 frame of its beat |
| Countdown reads | correlation with final frame | rises in at least 5 distinct steps |
| Purity | block hash at 100 times, sequential against random seek | identical, across rests too |
| Beyond | Jolt, Flash, Cost with Beyond on | pass; `plate.y` 0 byte-identical |
| Variety | per film | 4+ kinds, none twice running, hero by 90 s |
| Boot | fresh session | first probe lit, `integrate` and `v2` pass |
| Flags off | everything off | matches the post-Stage-1 hashes |
| Interaction | `pick`, `tools`, `toolsound` | section 5 |

## 5. Interaction that must land

**A. A click always moves there. Bugs measured tonight:** with a film playing, picking `checks.target` left `body.saddle` showing 9 s later, because `compose` only honours the pick at gesture 0. With the film paused, the handover froze at T=0 and aimed at the wrong pattern, because its clock had stopped. Mid-morph snapshots also pop. Fix, one path for every mode:

```
hand.go -> stage.pick(pat, t, { dur = 8 }): mark the tile at once; the last click wins.
A transformation running: rush it, holder.rush = { x0, e, D: min(2.5, (1-x0)*D) }, on real seconds; x = lerp(x0, 1, smoother(e/D)).
Nothing running: S = what's showing, at its own time. Destination:
  wander or held: a fresh gesture.   static: frozen at the middle of its bold range.
  film: rebuild({pattern}), then replace the gestures from t through the first ending at least dur+10 s later with one wearing pat.
score.handover = { G: S, dt: ts-t, phi, wall: true, e: 0, D: dur }.   stage.update(t, dtReal) advances e and rush.e.
morphclock: a wall handover runs on e, not t, so paused, a rest, or a Beyond stop can't stop it.
```
`tests/pick.mjs`, by real click on a real tile: {wander, held, static, film playing, film paused, film ended, film+static, make music, make music with a song waiting} x {Beyond off, on}, plus mid-flight, mid-handover, inside a rest, inside a Beyond stop, tool selected, two quick clicks. Pass: within 11 s `lastFrame.G.pattern` is it and nothing is morphing, no pop, no errors.

**B. Every tool works in every mode.** Tools: ripple, hand, twist, pinch, bulge, comb, zoom, line weight, lifted sheet, knobs. Fixes:
- Zoom and spin move to one frame-level view: `vec2 handView(vec2 p){vec4 h=uF[F_HANDV]; return h.x==0.?p:rot(-h.y)*p*h.x+h.zw;}`, `h.x=exp(-J)`. Today they move slot A's view, so a flight's element slips out from under the camera. About the cursor: `j += R*c*(z_old-z_new)`. Multiply `noHorizon`'s reach by `max(1,exp(-J))`. `periodPx` and `hand.mine` follow.
- Line weight and view knobs act on the moved slot in a flight, never the one being flown through.

`tests/tools.mjs`: every tool x the modes in A. At one t, capture with the tool on, null its edit, capture again. Pass: the local tile differs. All of `tests/effects.mjs`, `tests/hand.mjs`.

**C. In sound mode every tool audibly changes the music, with or without Beyond.** Today only zoom, ball, sheet, ripple and weight reach the music, and `read.js` takes the red channel, so Beyond's inks misread (vermilion's dark ink reads white). Fix `_parse`: with plates open, classify each pixel by its nearest ink (paper or dark is 0, ink or light is 255). All of this runs in `_controls`, so it sounds even when the clock is stopped. Add `bend` (cents on all pad and drone oscillators) to `synth.controls`.

| Tool | You hear |
|---|---|
| Zoom | register moves within .25 s (`center` τ .25 while J changes), `cut*=exp(.35*dJ/dt)` |
| Line weight | `pw=clamp(.5-.35duty,.14,.5)`, `cut*=exp(-.8duty)`, gate as now |
| Ripple | ping, as now, at the height it fell |
| Comb | a strum: a `pluck` per .12 units of travel, ladder note by y, pan by x, at most 12/s; feedback +.15 while it heals |
| Twist | `bend=60*tanh(twist/3)`, moire `max(moire,8|twist|)` |
| Pinch, bulge | pinch: `cut*=exp(-1.1p)`, `center+=6p`, gate x(1-.4p). Bulge: `cut*=exp(1.6|p|)`, `center-=6|p|`, level +1.5 dB |
| Hand | pad level x(1+.6on), `center+=8y`, pan by x; a fist plays one `sub` on the root and closes the filter, opening it lets go |
| Lifted sheet | moire, as now |
| Knobs | speed through phi, as now; rotation sweeps pan |

`tests/toolsound.mjs`: an `AnalyserNode` on `synth.output`, 1.5 s windows, each tool x {wander, static, paused, Beyond stop} x {Beyond off, on}. Pass: level moves 1.5 dB, or centroid moves 15%, or at least 2 new notes in the log. With Beyond open at .6, the grid agrees with black and white on at least 85% of cells over 12 patterns. Nothing clips.

## 6. If time runs short, cut in this order

1. River and Arcade
2. Iris
3. Star's chord map
4. Star
5. Coin
6. Conductor lead-switching (keep fixed balance)

**Never cut:** the split, Repair, section 5, rests, the weight field, Countdown, Shock, the Freeze.
