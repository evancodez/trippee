# Direction: from a film that lands to a film someone cut

The owner says the film is about 75% of what they want: smooth, but not always in line with the music's vibe and energy, and less interesting than a hand-directed, hand-timed music video. This is the plan to close that gap. Checked against the tree at `b7465c0` plus the work in progress on 6 Nov 2026. Line numbers are at `b7465c0`, and other lanes are moving them. **Nobody here has watched this move or heard a song.** Everything below is numbers and stills. The owner's eyes are the test, so the plan gets something in front of them first.

Build order in one line: fast frames on the hits, a hand cut of two songs, one key to compare them with the generated film, and only then, if they say yes, a generator that writes films like the cuts.

Where it stands: Stage A shipped in v2.4. The hit timing is behind `?peak=1` for the generated film and always on in a cut. MGMT and PPP have hand cuts, Wildflower has a chill one, and `?cut=restless` shows MGMT's restless one. The generator waits for the owner's answer.

## 1. The diagnosis

All numbers are seed 7 from `tests/shotlist.mjs`, unless marked.

**The film does the same thing to every song.** PPP at 105 bpm, Wildflower, Disclosure and MGMT all get 2.4 to 2.8 changes a minute and spend 33 to 38% of the time transforming. Energy against change rate is r -0.02 to +0.39. PPP's loudest third changes less than its quietest (2.6 against 3.1 a minute). Disclosure's four drops, the same music each time, shrink: edge/flow/fineness 5.4/9.7/1.3, then 2.0/2.0/3.4, 2.9/2.2/4.5, 2.3/.4/6.0.

**The hit is the slowest frame.** This is the biggest single thing, and it's in the code. In `morphclock.js`, `T = smoother(x)` with `x` linear, so a transformation's fastest moment is exactly half a morph before its landing, and at the landing `T` has come to rest and the next pattern's long move hasn't started (`arcU` picks up over 3 s). The numbers say it happens:

- A change lands exactly on 36 to 62% of the strongest moments. Any bar line manages 5 to 8%.
- The picture visibly answers only 20 to 55% of them. Any bar line visibly answers 22 to 33%. By eye, the timing is no better than chance.
- A transformation's fastest moment comes a median 1.3 to 3.2 s before its hit. Only 0 to 29% peak within a beat of it.
- Falls, the one move that crosses at speed, show 5.0 to 7.2 times the usual rate of change on their moment. Everything else combined shows 0.4 to 0.8.

**It doesn't repeat what the music repeats.** Only 3 of the 17 sections that come back wear what they wore. The chorus doesn't look like the chorus. PPP tours 13 patterns in 15 gestures, where STUDY's reference keeps one family per song. Top family is 23 to 34% of screen time, because `SHARE` caps it.

**It reads as a generator.**
- Metronome: PPP lands at 243.6, 264.2, 284.8, 305.4, 326.0, exactly 12 bars apart. 43 to 67% of morphs are within 15% of the median, because `compose.js` 532 clamps them to 7-13 s.
- Casting by quota: "at least four kinds", "one by 90 s", "never twice running" (`direct.js` 500-519).
- Nothing withheld: rings every bar from bar 1. 212 pulses on PPP at 1.07x, uniform and invisible.
- The song turned down where it sings: `score.ambient` under .9 for 54 to 63% of the film, .30 through most of both PPP choruses.
- Nothing saved: 24 to 36% of heroes fall after the 65% mark, just their share of the time. The climax is held on: PPP 310.5 shows .7, with the Iris hit 5 s early.
- Finest on the loudest: MGMT 193-208, E .9, is tiny dots.

**What's already good, and stays:** the smoothness, every transformation, the flash guard, the reactions, the patterns. Nothing here replaces those.

**Limits of this diagnosis.** "Visible" counts fast pixel change, so a small lock can read to the eye and not here. It can't tell a good picture from a bad one. A film can be pushed to pass it with a zoom on every bar, which is why section 8 pairs it with controls.

## 2. The designs, scored

Five is best. Risk: 5 is low risk.

| | A person directed this | Follows very different songs | Stays smooth | Provable | Risk |
|---|---|---|---|---|---|
| **Treatment** (top down) | 4 | 3 | 4 | 5 | 4 |
| **Choreographer** (bottom up) | 4.5 | 3.5 | 3.5 | 3 | 2 |
| **Human Take** (one sheet) | 4 | 3.5 | 4 | 4 | 4 |

**Treatment.** Its structure wins: a pure planner in front of `compose`, with all its line numbers checked and right (131, 227, 249, 330, 467, 505, 532, 696; `direct.js` 500-519). Planning backward from ranked moments is how a person works. Problems found:
- Its classifier doesn't do what it says. `idea.mjs` as written calls Wildflower `burn` (maxJ 5.0), not Drift, and gives 1.7 to 2.9 gestures a minute, not 1.3 to 4.
- Its push is gentler than it sounds (peak .29 ln/s, within the composer's .5 limit), but `handSheet` returns on null edits and `shot()` passes null, so written where it proposes, the rehearsal and the flash guard would never see it. It belongs in `frame()`.
- A push on every hit is the new tic. It's kept for one job: a moment that shouldn't change the pattern.

**Choreographer.** Two ideas are the best in any design. Timing by warping `x`, which I rendered (below). And *depth*: a moment sorts into a change, a turn or a tick, so something happening doesn't automatically mean a new pattern. Problems:
- It replaces `solve`, `spreadPick`, `morphFor` and `journey` at once and bypasses `boldRange`. Too much before anyone has seen a result.
- Instruments owning elements is the part most likely to read as audio-reactive, which STUDY warns against. Its own numbers show the streams are guesses: only 12 of 28 stream events meet a jump on Wildflower, and PPP has none for 197 s. Cut as a system; kept as one tick, bound to one bar.
- Register margin .02 between PPP and Wildflower.

**Human Take.** Two ideas win. One file written by hand and machine, so the machine's job is to write what a person would. And `score.refused`, so nothing fails silently. Its honest finding stays: jumps at one per 8 bars find only 9 of 18 editor moments, so half of hand timing isn't in the signal. Cut: logistic regression on taps (a few songs can't train it) and the live recorder until the owner has said yes.

**The result:** Treatment's structure, Human Take's contract, Choreographer's timing and depth. Hand cuts come first, and routines get extracted from the cuts they approve rather than written blind.

**What would still look like a generator, and goes:**
- A fixed count of hits per 8 bars. On PPP's vamp it gives gaps with a spread of .15, a metronome (my recomputation). Hits are gated by strength.
- "Something motivated every 12 s" (all three designs). That's a clock. Replaced by a ceiling of 16 bars with no event outside a declared stay, and a test that gaps vary.
- "Quiet changes less than loud, 2x" as a test. A hand cut fails it on purpose: PPP's cut changes .7 a minute in its loud third and 2.7 in its quiet third, because a chorus is for staying and the vamp is one long move. Energy shows up in edge speed instead (r +.45 to +.57 on the cuts, +.39 today).
- Picking a film idea by a threshold alone. Worlds and an owner key can override it, and its choices print in one line.
- Up to 25 patterns on a restless song. At most 13, and 60% of changes one way of changing, so restlessness reads as one idea.

### What was checked by running it

A scratch copy of the tree, nothing in the real one. Nobody watched it.

**The warp, on the film as it is.** 40 lines (section 3, Timing). Every plain landing got a 2-bar coast past its hit, with the fastest frame on the hit. Rim Shocks landed .35 past. Falls and the Iris were untouched. Before and after:

| | PPP | Wildflower | Disclosure | MGMT |
|---|---|---|---|---|
| Changes visible on their moment, % | 24 → 47 | 22 → 67 | 33 → 56 | 22 → 56 |
| Non-Fall kinds, how much they show | .7 → 1.4 | .8 → 2.2 | .4 → 1.4 | .6 → 1.8 |
| Strongest moments visible, % | 23 → 46 | 20 → 40 | 40 → 60 | 55 → 64 |
| Any bar line visible (control), % | 27 → 24 | 22 → 23 | 29 → 27 | 34 → 33 |
| Peak within a beat of hit, % | 7 → 46 | 17 → 17 | 29 → 43 | 0 → 13 |
| Time transforming, % | 33 → 38 | 34 → 39 | 35 → 40 | 38 → 43 |

The picture answers roughly twice as often and the control doesn't move. What it costs:
- Faster peaks flash more. On the first run the guard couldn't clear one flash on MGMT and one on Disclosure.
- With a step added to the guard that softens a hit before anything else, MGMT clears; Disclosure keeps one at 216.2 (today's film keeps one on Wildflower at 200.5). Six hits softened, two Shocks lost, across four songs. That softening is why peak-within-a-beat stays low.
- Strongest-moments visible stays under 70% because about 40% of those moments have no change on them. Only the sheet fixes that.

**The cuts below, on the engine as it is.** About 150 lines of loader, a new `cue` move, no shader work. Both ran on the first try, with no refusal. Flash scan (`tests/flash.mjs`):

| | Whole-frame | Tile |
|---|---|---|
| MGMT, cut | 0 | 3, only at 2.75, the arrival flight from the wander |
| MGMT, today's film | 1 | 2 |
| PPP, cut | 0 | 3, only at 1.33, the same arrival |
| PPP, today's film | 1 | 3, the same arrival |

The arrival isn't the cut's doing. It needs fixing before the owner sees it, in either film.

From the stills: bold throughout, no hairline wallpaper, and the refrains are plain to see. The MGMT chorus at 77.7 and 173.7 are one dial. PPP goes board, floor, flower, board, floor, flower, sheet, board. Numbers on the cuts against today:

| | MGMT | PPP |
|---|---|---|
| Patterns | 4 (was 9) | 4 (was 13) |
| Sections back wearing what they wore | 1 of 3 (was 0) | 4 of 7 (was 2) |
| Morphs within 15% of median, % | 14 (was 56) | 44 (was 67) |
| Peak within a beat of hit, % | 57 (was 0) | 33 (was 7) |
| Energy against edge speed, r | +.57 (was +.39) | +.45 (was +.39) |
| Changes visible on their moment, % | 67 (was 22) | 36 (was 24) |

PPP's 36% is low for two known reasons: a Countdown's release starts a second or two after its lock, and the flower's opening has no schedule yet. Both are named options in section 6. The first cut of MGMT had its climax Iris removed by the guard, silently. That's exactly why `score.refused` is required.

## 3. The director

### What it reads

`understand(A)` as now, plus a new pure `phrasing(A, M)` (section 5): jumps, ride, register inputs. Nothing bumps `ANALYSIS_VERSION`.

### What it decides

For a whole film:
- **The idea:** one sentence anyone could say. It's printed, and shown when a cut is chosen.
- **The register:** chill, travel or riot. A budget for the song, overridable.
- **The wardrobe:** one pattern per section label, with what changes on each return.
- **The climax look:** one thing unseen until then.

For each moment, ranked by size, climax forced top, walking from last to first:
- **Depth:**
  - *change*: a new pattern, top ranks only.
  - *turn*: a whip inside the same pattern, such as a camera tip, gear change or push.
  - *tick*: one element opens or shuts.
- **Shape:**
  - *cross*: fastest frame on the hit, long decay.
  - *lock*: everything arrives on the hit, then releases at once.
  - *release*: a hold ends on the hit.
- **Prep:** two bars at half motion before a top hit, with no morph peaking, pulses off.
- **After:** nothing new for 4 to 12 bars, or two-thirds of the section.
- **Tier:** nothing before the climax shows bigger.

Collisions trim the lower rank, which drops a depth.

### The data: one sheet

The hand and the machine write the same shape. A cut is a sheet with everything filled in; `treat()` fills what's blank.

```js
S = {
  hash, by: 'auto' | 'cut' | 'tap',
  line: 'one sentence',                // the idea
  register: 'chill' | 'travel' | 'riot',
  ride: [[t, 0..4]],                   // whisper, verse, lift, chorus, peak. Seconds
  hits: [{ t, size, sign, depth, shape, prep, after, wear, tier, why }],
  shots: [{ at, id, from, via, tail, lanes, gear, ambient, countdown, star, coin }],   // section 7
  rhymes: { label: { id, via, grow } },   // what a returning section wears, and what's further this time
  stays: [[t0, t1]],                   // deliberately nothing new
  close: { id: 'opening', t },
};
```
`score.sheet = S`. `score.refused = [{ t, what, why }]`: every cue that couldn't run and every hero the guard softened or removed, printed in the song panel and read by tests.

A **routine** is a cut with its times replaced by roles (first lift, return, strip, climax, end), and it declares one hit, compiled backward through the bar table. The first two get extracted from the MGMT and PPP cuts the owner approves: "Spring" (a sheet winds up, lets go as the chorus) and "Burn" (one sheet grows until it turns inside out into the opening). Don't write twelve blind.

### How it fits

New pure module `src/score/treat.js`: `treat(A, M, P, { world, given }) -> S`.

**`compose.js`**, only where `S` is non-null:
- 131: `S` is made here, before any gesture.
- 192-199: hits join `places`, as off-bar breaths do.
- 227 `lengthWanted`, 240 `ONE_MORE`: read the ride and register.
- 249-255: `bonus` gets `8 + 24 * size` per hit; a stay gets a penalty.
- 330 `spreadPick`: rhymes first, `SHARE` from the register, so a motif can reach 60%.
- 467 `changed()`: gains "further", which starts where the last visit ended.
- 505 and 532: `MORPH_SHORTEST` and the 7-13 clamp come from the ride, in bars.
- 696: passes `S`.

**`direct.js`:**
- A first pass, `obey()`, calls `putCountdown`, `fallOn`, `shockOn`, `putCoin`, `irisOn` per hit. `fallOn` and `shockOn` get hoisted out of their flag blocks with no change in behaviour.
- A refusal goes in `score.refused` and drops a depth.
- Under `S` the quotas at 500-519 and the search loops at 214-222, 317, 404-426, 460-481 and 484-496 are skipped.
- 535: ambient floors by ride.

**`src/score/land.js`**, new, runs last, after every placement: the timing below.

### Timing

```js
// morphclock.js: x as it goes in, warped so T is fastest at G.peak.hit. C1 at the hit; q 2 makes the decay long.
export function peaked(G, x) {
  const k = G.peak;
  if (!k || !k.q || !G.morph) return x;
  const t0 = G.t1 - G.morph, h = clamp((k.hit - t0) / G.morph, 0.2, 0.92), q = k.q, p = q * h / (1 - h);
  const w = x < h ? 0.5 * Math.pow(x / h, p) : 1 - 0.5 * Math.pow((1 - x) / (1 - h), q);
  const lnZ = G.plan?.lnZ ?? 0, slope = 0.5 * q / (1 - h);
  if (!lnZ) return w;
  // A flight can't outrun what a fall is allowed: it blends back towards plain until the camera's under 1.5 ln/s.
  const a = clamp((1.5 * G.morph / (1.875 * lnZ) - 1) / Math.max(slope - 1, 1e-3));
  return x + (w - x) * a;
}
```

`land()`, by kind:
- **Plain, slide, bend, flight:** `t1 = hit + tail`, `morph = hit - from + tail`, `G.peak = { hit, q: 2 }`. Tail is 2 bars by default, limited by `N.t1 - N.morph - N.t0 - 4`. `N.t0` moves with it.
- **Rim Shock:** a ring sweeps most area near the rim, so its centre arriving on the hit is the least visible moment. `t1 = hit + .35 * morph`, with `beats` recomputed.
- **Fall, Iris:** already cross at speed. Untouched.
- **Countdown, Coin:** both need a *release*. Flow lets go on the hit, in half a bar, not a bar later (`coinFlow`, Countdown's `hold.release`).

`G.peak.hit` is what tests read as the hit. In `guardFlashes`, the first thing `easeMorph` tries on a flashing hit is `q: 0`, which it logs to `score.refused`. A hero the guard removes from a cut is logged too.

### The flag

```js
// flags.js. Off means the film is exactly the film. setAllFlags can't reach these, the same reason as MODES' `hearing`.
export const directing = { peak: false, sheet: false };
```
`?direct=1` turns both on, `?peak=1` the timing alone. Off: `S` is null, `land()` doesn't run, no `rand` draw changes. A new test fingerprints each film's gestures (`t0 t1 id morph xform`) against a saved baseline, alongside `tests/hash.mjs`. A hand cut is asked for through `opts.cut` and needs no flag; without it, `compose` is untouched.

### With the colour worlds

`docs/MODES.md` already has `compose(A, seed, { patterns: W.pool, world: W })` and `(W.direct ?? direct)(...)`. A world sets temperament with one more field in `motion`:

```js
motion: { ..., temper: { lean: +0.2, hit: 1.3, routines: ['spring'], wears: [...], plateBy: 'ride', sync: 'locked' } }
```
`lean` shifts the register. `hit` scales size. `plateBy: 'ride'` opens Beyond's or a world's plates by level rather than by section label (`songTable`, `beyond.js` 88). A hot world leans restless; a cool one trades pushes for holds and tilts. A world's own `direct` receives `S`. In a world, a cut's times survive; ids outside its pool go through `rhymes` and get logged.

**Avoiding two conductors.** MODES section 6 overlaps this, and it must read the sheet, not derive its own:

| MODES music change | Reads from the sheet |
|---|---|
| 3, Wind and release (`M.holds`) | `hit.prep` |
| 4, The ladder | `ride` |
| 8, The last chord | `close` |
| 10, Loudness is approach | `ride` plus `hits` |

Those lanes wait for the sheet's shape to be committed.

Also: MODES reserves `field.kind >= 4` for worlds (`renderer.js` 137 stops counting there), so the Chladni pattern below can't take kind 4 in the film's programs.

## 4. Vibe and energy to pace

**Overruled in part on 6 Nov 2026.** The owner: "not nearly reactive enough to music... stays on an individual pattern too long almost always. Sometimes fair to hold on it but only if you're doing cool stuff/it fits." So the long holds, the withholding, "nothing new for 4 to 12 bars" and the table below's 1.4 to 3.7 changes a minute are out. The vocabulary stays. What the generated film does now is in `src/score/pace.js`, behind `directing.pace`, with `?pace=0` for the old film: a change every 2 to 4 bars on the loud parts, every 4 to 8 in the middle and every 8 to 16 when quiet, one way of changing per passage (Relay, the riot moves, the still moves, a suite of patterns), one wardrobe per kind of section, and no plain hold past 8 bars.

**Ride inside a song, register across songs.** Register is the budget, ride spends it.

| Ride | Bars per pattern, shortest: chill / travel / riot | Morph, bars | Edge speed, %/s | Pulses | Song's share | Fineness, most |
|---|---|---|---|---|---|---|
| 0 whisper | 32 / 16 / 16 | 8-32 | under 2.5 | none, lung only | as the shot says, may be .3 | 8 |
| 1 verse | 24 / 16 / 8 | 4-16 | under 5 | 4-bar swells | .6+ | 10 |
| 2 lift | 16 / 8 / 8 | 2-8 | under 7 | 2-bar | .7+ | 10 |
| 3 chorus | 12 / 8 / 4, and it stays two-thirds through | 1-4 | under 10 | 2-bar, visible | .7+ | 8 |
| 4 peak | 8 / 4 / 4 | 1-4 | under 10 | as chosen | 1 | 6 |

All first guesses. Run through the Choreographer's table these spread 1.4 to 3.7 changes a minute (today 2.36 to 2.84), but that's a table, not a film.

Pattern count: chill 2-5, travel 4-9 with a motif family plus one contrast, riot up to 13 with 60% one way of changing.

**Rules for every register:**
- Loud is bold and faster on the eye, not necessarily more changes.
- A return is never slower or finer than its last visit.
- Withhold: no pulses before the first lift. Save one look for the climax.
- One dead stillness per film at most, earned, on the deepest fall or a rest.
- End with the sound: the last gesture wears the opening's family and goes in to one element as the note dies.

**A chill treatment stays interesting by going somewhere, not by changing.**
- One long move a passage, 16-32 bars, ending on a chosen frame on a phrase line: hairline to huge, a 40 s tilt, with speed peaks on breaths.
- Events inside one world that cost no frame time: Moire Wheel, Confocal, Vertigo, Turntable (section 6).
- One withheld element, opened once by something entering (a tick).
- Where energy is flat it follows tone. Today nothing does, |r| at most .19. Two levers:
  - White share, leaning dark .4 to bright .6. STUDY's median is .5, but .3 in Black Car and Last Ride.
  - Gear, on the slow curve of brightness.
- A slow transformation is a move in itself. A duty relay over 16 bars isn't "nothing happening".

Chill must never read as subtle. The owner has already rejected a wobble on one pattern.

**A restless treatment changes constantly and still reads as one idea.**
- One way of changing applied to everything: Relay, pattern into pattern on chords or bars, with nothing laid over anything.
- Morphs of 1-4 bars, so a Ratchet or a Relay swap can land every bar in a pounding chorus.
- Holds are what make it restless and not busy: nothing new for 4 bars after a top hit, a two-bar hang before one.
- Escalates by opening more, not by getting finer.

**Where the film's own rate shouldn't change:** a chorus. Both editors independently said a chorus is for staying, so the energy goes into speed, boldness and letting the song fully on, not a new pattern.

## 5. New listening

A new pure `src/music/phrasing.js`, memoised like `understand`, from cached fields. No version bump. The numbers below were recomputed on `lab-out/form/*.json` and are fitted to four songs.

**Per bar.** `per[k]`: bar means of `A.loud, bright, bass, perc, voiced`.

**Jumps.** `J[k](i) = mean(per[k], i..i+2) - mean(per[k], i-2..i)`, over that stream's SD across the song.
- `up = J.loud+ + .5 J.bright+ + .7 J.bass+ + .5 J.perc+ + .3 J.voiced+`. `dn` the same on the negatives, with bright at .4. `s = max(up, dn)`, with its sign.
- A peak is the greatest within 4 bars either way, away from the ends.
- Then refine: snap to a section start or an `M.arrival` peak within 2 bars (PPP's b80 135.5 becomes b81 137.23), or for a fall, the biggest single-bar drop within 2 bars (MGMT's b123 226.1 becomes b122 224.15).

It finds what `M.arrivals` misses:
- **PPP:** b66 -9.9, b202 -8.9, b80 +8.7, b16 +7.8, b98 -4.6, b32 +4.3 (the missed 53.1), b49 +4.3.
- **MGMT:** b123 -10.4, b50 -6.0, b43 +5.4, b105 +4.3.
- **Disclosure:** four falls at -7, three lifts at +3.8 to +5.9.
- **Wildflower:** nothing above 3.3, which is itself its character.

Use: **hits are `s >= 2.5` (PPP 15, Wildflower 7, Disclosure 9, MGMT 6), never a quota.** `A.climax` is added and forced top: PPP's 310.5 isn't a jump at all.

**Vamps.** Four or more peaks evenly spaced to within a bar are the song's own pulse, not hits. PPP's b128 to b192 runs at 2.1-2.9 every 8 bars. They become one `stay` with steps inside it: gear doubling, one long move.

**Ride.**
- Heat per bar: `z(loud) + .5 z(bright) * clamp(loud / .4) + .4 z(perc)`. Without the `clamp`, PPP's bright, silent b66-72 reads as a verse.
- Four-bar mean, cut at the song's own 15/40/70/90%.
- Runs under 4 bars join their nearest neighbour.
- Edges snap to a jump within 4 bars, because the mean runs late. Otherwise PPP's whisper starts at b70, not b66.

It reads sensibly. MGMT:
```
1-5:0   6-12:1   13-20:2   21-24:0   25-30:1   31-42:2   43-49:3   50-64:1
65-84:2   85-95:3   96-99:4   100-104:2   105-110:3   111-120:4   121-126:0
```
That's the editor's cut: the dip at b21-24, the chorus at b43. PPP's vamp reads as rising, 2 to 3 to 4. Because quantiles force a level 0, MGMT has a "whisper" at loudness .42. The budget is the point there, and the absolute loudness is kept beside it.

**Register.** Mean of four numbers scaled between these songs' extremes:

| | perc | notes/s | held chords/min | jumps ≥ 4 per min | Score | Register |
|---|---|---|---|---|---|---|
| Wildflower | .46 | 1.72 | 10.7 | 0 | .00 | chill |
| PPP | .52 | 1.92 | 19.9 | 1.14 | .50 | travel |
| MGMT | .54 | 3.06 | 16.3 | 1.03 | .65 | travel |
| Disclosure | .63 | 2.60 | 22.5 | 1.59 | .91 | riot |

Chill under .25, riot over .75. The gaps are wider than either other design's, but four songs can't validate anything. It defaults to travel when unclear, the owner's key overrides it per song, and their labels retune it. MGMT is deliberately not riot here: the editor's cut stays in a chorus, and it's a warm song by its numbers. This is the thinnest guess in the plan.

**Other tables.**
- **One recurring chord move:** the commonest pair in `M.runs` used 3-8 times, which gets one small recurring image. PPP Gb>Ab x8. Wildflower Eb>Gm x6. Disclosure Abm>Dbm x6. MGMT Em>Am x7.
- **Entries:** perc, bass and voiced on and off, with hysteresis and a 2-bar minimum. Used only to place single ticks, never to cast elements. They're guesses from one mix.
- **Tone curve:** `bright` smoothed over 8 bars, for passages with no jump over 2 for 16 bars.

## 6. New transformations

Ranked by how directly they answer the feedback. Eleven of the twelve have prototypes in the real shader, in a scratch copy; none has been seen moving or against a song. Sheets: `/private/tmp/claude-501/-Users-evansmac-Downloads-eprojects-trippy-pattern-world/bc364b04-5eba-4685-8aaf-f2c74cd89858/scratchpad/xf/out/arcs.jpg` and `.../xf/out/shader.jpg`. Plain frame 7.2 to 7.8 ms at 3024x1964.

### Arcs only (no shader change, 0 ms)

1. **Ramp.** Any long move hangs, draws back a hair, whips through, crosses the landing at top speed and coasts. It's `peaked` for arcs: `G.uTrack` read in `arcU` through `evalTrack`, capped at the Fall's 1.2 ln/s. Every big moment. Not prototyped.
2. **Relay.** Pattern to pattern, endlessly: a checker thins to stripes, rings open through them, the stripes close, diagonals open. Arcs on `f.d` in `at` windows; one family always stays half and half, so XOR pins brightness; a shut family gets rewritten unseen. Openings finish on chord starts. The restless film's engine.
3. **Moire Wheel.** Lines barely move while huge soft chevrons wheel through them. Families k 12 and 13.2, one swinging 5 degrees either way. The chill that isn't boring.
4. **Vertigo.** A ball looms out of its sheet, or a floor flattens from steep perspective to plan, with the middle keeping its size. A log arc on `cam.dist`. Build or held note. Not tunnels.
5. **Ratchet.** A dartboard zooms and turns exactly one ring and one spoke per strong beat. It must surge like `frontAt`, not stop, or it's jolty. Pounding chorus.
6. **Scissor.** Squares close like lazy tongs into rhombi, then long teeth, then open. A build with teeth on the downbeat. Stop above 6 degrees, because at 0 XOR goes solid.
7. **Turntable.** Nothing shows, then a disc of brick checks turns, visible only because it moves. At 90 degrees it's the Ouchi illusion: the picture stops and the disc should still swim. One stillness per film, both ends on `M.rests`. The rim is a hard edge, so the owner must rule on it.
8. **Bellows.** Lines bunch and thin in waves crossing the sheet, a pulse that moves no brightness. `a*k` under .9 (.26 at k 5 gave 7 local flashes).
9. **Confocal.** Hyperbolas, rings, ellipses, unbroken. 20 s at least. A slow, wistful song.

### Shader work (behind its own `#ifdef`, plain hash unchanged)

1. **Sky Roll.** One line in `moveCarry`. The sheet's infinity rolls into frame as a knot, stripes curl into tangent circles. 6.6 ms. Unsolved: the knot greys and aliases.
2. **Flutes, then Slats.** Five lines, ten more for Slats. K under 1 is reeded glass, K over 1 louvres: a wave of slats turns A into B. 6.1 and 6.9 ms. Lines step at flute edges, against "unbroken", and slats are briefly black bars. The owner rules.
3. **Chladni.** One line. Contours of a vibrating plate, each chord a mode, same chord, same figure. 5.8 ms. It needs a different field number from the one proposed, because `kind >= 4` is reserved for worlds.

### Options on what exists, needed before any of these

These come first, because the cuts need them:
- Countdown release on the hit.
- A Star schedule: petal radius as a lane, so it can try, retreat and bloom (PPP b41-51).
- Coin pours on the landing.
- A `pulse` lane separate from `ambient` in `songSheet`, one line.
- Shock with a `turn` on the hit (`fit.turn` exists, nobody passes it).

## 7. The hand-cut experiment

**The point:** learn from the owner's eyes, within hours, whether this is what they mean, before anyone builds a generator for it.

### The format

`src/score/cuts/<A.hash>.js`, where the hash is `song.hash`, the first 32 hex of the file's SHA-256, and `src/score/cuts/index.js` maps hash to lazy import. **Times, pattern ids and the names and numbers of moves, and nothing else: no audio, no copied analysis, not even a bar list.** Safe to commit.

```js
export default {
  hash, name, v,   // v: ANALYSIS_VERSION the times were read against
  line,            // the idea, in a sentence
  shots: [{
    at,            // song seconds: the hit, where this pattern arrives
    id,            // pattern id
    from,          // when the change starts. Default at - 4 bars
    via,           // 'plain' (the planner picks), 'slide', 'rise', 'dive', 'fall', 'shock', 'shockout', 'iris'
    tail,          // bars it coasts past the hit. Default 2
    a, D, centre,  // the via's own options
    lanes,         // { path: [[t, x, 'hit'?], ...] }: numbers from layout.js, in seconds. 'hit' is a knot crossed at speed
    gear,          // [[t, N], ...]: one element per N beats
    ambient,       // [[t, gain], ...]: how much of the song the sheet takes
    countdown,     // { L, mirror, grow } on this shot's dial
    star,          // { landOn, freq, size, lead, mirror } on this shot's sheet
  }],
};
```

Rules:
- Seconds are the recording's, so they outlive the analysis. At load, each is snapped to a bar or beat if within .06 s, otherwise left literal.
- A cut is refused only on a hash mismatch or an unknown pattern id.
- Song times go through `score.time`.
- `compose` runs as normal, then `applyCut(score, cut, A, M)` replaces the gestures, so the seed's draws are untouched.
- Everything goes through the guard, and what it changes goes in `score.refused`.
- Each gesture takes `label` and `visit` from `A.segments`, because Beyond reads `G.label`.

### How it's chosen

- At `song.load`, if `cuts/index.js` has the hash, the generated film is composed and rehearsed as now, then the cut film is composed and rehearsed behind the picture. Only songs with a cut pay for it. Rehearsing both first matters: `rebuild` rehearses after the swap, and a cut shown unrehearsed isn't the cut.
- **`d`** switches between them, through `hand.veil` (already a flight, not a solid). The clock doesn't stop.
- **`D`** switches and goes back to where the last switch happened, so the same passage plays in the other film.
- **`=` and `-`** log yes and no against the film and the time, to `localStorage` under `trippee.compare.<hash>`. Costs them nothing.
- The song panel gets a button beside "another take", only when a cut exists, saying which film is showing.
- `?blind=1` shows only A and B, assigned once per song by a stored coin, revealed by `?`.
- `say()` shows the cut's `line` once.

`d` is free (taken: `n w z p l 1-6 k s r c f h m b g ?`; MODES takes `v`).

### The cuts

Both ran on the engine in the scratch copy. They draw on the two editors, neither of whom heard the songs. Bars are 1-based on `A.bars`.

Real work still owed on these:
- The first 30 s of each still needs the arrival flight fixed.
- PPP needs the Countdown release and Star schedule to read.
- What's after each editor's first 90 s is mine, following their rules.

**MGMT, `b348c58fdc8d0af2d7ecbe0b9d646db9`:**
```js
export default {
  hash: 'b348c58fdc8d0af2d7ecbe0b9d646db9', name: 'mgmt', v: 5,
  line: 'One hall opens, sways and winds up into a spring. The spring lets go as the chorus, a square dial. Each return goes further; the last chord shuts the hall again.',
  shots: [
    { at: 0, id: 'rooms.hall',                                       // bars 1-25. The song starts full and the picture doesn't. Crosslines open on bar 8, the first section, with no new pattern
      lanes: { 'f1.d': [[0, -0.7], [11.03, -0.7], [12.95, -0.35, 'hit'], [16.79, 0]], freq: [[0, 0.4], [32.15, 0.4], [39.83, 0.9]], 'bend1.a': [[0, 0], [32.15, 0], [39.83, 0.4]], 'cam.yaw': [[0, 0.26], [47.51, -0.26]], 'cam.roll': [[0, -0.16], [47.51, 0.16]] },
      gear: [[0, 32], [16.79, 16], [24.47, 8], [30.23, 16]],         // speeds up with the song's brightness on bars 14-16, and answers down on 17
      ambient: [[0, 0.3], [11.03, 0.3], [12.95, 1]] },
    { at: 47.51, from: 39.83, via: 'shock', id: 'checks.twist',      // bars 26-42. One long wind-up, tightest on bar 36. The morph sits in the band's gap
      lanes: { scale: [[47.51, 1.7], [64.31, 0.36, 'hit']], 'swirl.a': [[47.51, 0], [64.31, 8, 'hit']], 'lens.c': [[47.51, 1], [64.31, 0.55]] },
      gear: [[47.51, 8], [55.19, 4], [64.31, 2], [70.07, 8]] },
    { at: 77.75, from: 70.07, via: 'fall', a: 1, id: 'dials.rooms',  // bars 43-53. Crossing at speed on bar 43, tone bright, picture radial. A chorus is for staying. The rest at 92.5 stops it
      lanes: { scale: [[77.75, 1.1], [91.19, 1.5]], rot: [[77.75, -0.3], [91.19, 0.3]] },
      gear: [[77.75, 4], [85.43, 8], [91.19, 16]] },
    { at: 98.87, from: 96.3, tail: 2, via: 'rise', id: 'rooms.hall', // bars 54-61. The verse looks like the verse, further on
      lanes: { 'f1.d': [[98.87, 0], [110.87, 0]], freq: [[98.87, 0.9], [110.87, 0.9]], 'bend1.a': [[98.87, 0.4], [110.87, 0.44]], 'cam.yaw': [[98.87, -0.26], [110.87, 0.26]], 'cam.roll': [[98.87, 0.16], [110.87, -0.16]] },
      gear: [[98.87, 8]] },
    { at: 112.79, from: 112.79, via: 'plain', tail: 0, id: 'rooms.dive', star: { landOn: 122.39, size: [2.6, 4], lead: 1 },   // bars 62-82. The one contrast, opening on the lift at bar 67
      ambient: [[112.79, 0.3], [122.39, 0.3], [124.31, 0.8], [143.03, 0.8], [151.19, 1]] },
    { at: 151.19, from: 143.03, via: 'rise', id: 'dials.rooms', countdown: { L: 173.75, mirror: true },   // bars 83-104. You saw it whole; now you watch it built, locking on chorus 2
      gear: [[151.19, 8]] },
    { at: 192.95, from: 185.27, via: 'fall', a: 1, id: 'checks.twist',   // bars 105-112. The biggest lift. The spring again, in half the time
      lanes: { scale: [[192.95, 1.5], [199, 0.55, 'hit']], 'swirl.a': [[192.95, 1], [199, 3, 'hit']] },
      gear: [[192.95, 8]] },
    { at: 206.87, via: 'iris', D: 12, id: 'dials.rooms',             // bars 113-121. Inside out on the climax, the dial at its biggest
      lanes: { scale: [[212.5, 1.0], [224.15, 1.7]], rot: [[212.5, 0.3], [224.15, -0.3]] },
      gear: [[206.87, 4], [216.47, 8]] },
    { at: 224.15, from: 217.0, via: 'rise', tail: 1, id: 'rooms.hall',   // bars 122-. The largest drop. The last chord shuts the hall again and goes in to one stripe
      lanes: { 'f1.d': [[226.07, 0], [229.9, -0.7]], freq: [[226.07, 0.5], [231.83, 0.3]], 'cam.yaw': [[226.07, 0.2], [231.83, 0]], 'cam.roll': [[226.07, -0.1], [231.83, 0]] },
      gear: [[224.15, 32]] },
  ],
};
```

**PPP, `f9ee57f6abe35539eae4fdecc1fdd65f`:**
```js
export default {
  hash: 'f9ee57f6abe35539eae4fdecc1fdd65f', name: 'ppp', v: 5,
  line: 'One dartboard shatters and builds itself twice; the floor tips under it; the chorus is one flower that comes back; the long vamp is one sheet growing until it turns inside out into the board again.',
  shots: [
    { at: 0, id: 'dials.board',                                      // bars 1-8. A whisper gets one slow move
      lanes: { scale: [[0, 1.75], [13, 1.46]], rot: [[0, -0.2], [13, 0.1]] }, gear: [[0, 32]],
      ambient: [[0, 0.3], [13.0, 0.3], [25.69, 1]] },
    { at: 13.1, from: 11.3, tail: 0, id: 'dials.board', countdown: { L: 25.69 }, gear: [[13.1, 8]] },   // bars 9-20. Shatters on the first crest. Last ring on bar 16, the strongest arrival. NEEDS release on the hit
    { at: 44.56, from: 34.27, via: 'rise', id: 'checks.floor',       // bars 27-39. Nearly square-on, the calmest picture since bar 16, so bar 32 has somewhere to go. Camera tips on bar 32, new axis on bar 36
      lanes: { 'cam.pitch': [[46, 0.05], [53.14, 0.4, 'hit'], [58.29, 1.2], [60.01, 1.3], [66, 1.6]], 'cam.yaw': [[46, -0.05], [60.01, -0.05, 'hit'], [66, 0.45]], scale: [[46, 1], [66, 1.5]] },
      gear: [[46, 12], [53.14, 6], [60.01, 6]], ambient: [[44.56, 1], [53.14, 1]] },
    { at: 66.87, from: 60.01, via: 'shock', id: 'waves.current', star: { landOn: 82.31, freq: [2.3, 1.2], size: [2.2, 2.8], lead: 1 },   // bars 40-65. Bold before the Cm. The flower opens on bar 49 and rolls dead centre on bar 51, the first home that holds. NEEDS the Star schedule
      ambient: [[66.87, 0.7], [104.62, 0.7], [111.49, 0.5]] },
    { at: 111.49, from: 104.62, via: 'rise', id: 'dials.board',      // bars 66-73. The biggest fall. The whisper again, the board bigger
      lanes: { scale: [[113, 1.4], [122.5, 1.2]], rot: [[113, 0.1], [122.5, -0.1]] }, gear: [[111.49, 32]],
      ambient: [[111.49, 0.5], [135.5, 0.5], [137.23, 1]] },
    { at: 124.5, from: 122.5, tail: 0, id: 'dials.board', countdown: { L: 137.23, grow: 1.5 }, gear: [[124.5, 8]] },   // bars 74-86. Half as big again: new information, not a mirror
    { at: 147.52, from: 142.38, via: 'rise', id: 'checks.floor',     // bars 87-111. The floor picks up where it stopped. Thins on the drop at bar 98
      lanes: { 'cam.pitch': [[150, 1.6], [166.4, 2.2], [178, 1.2]], 'cam.yaw': [[150, 0.45], [178, -0.3]], scale: [[150, 1.5], [178, 2.2]] },
      gear: [[150, 6], [166.4, 12], [176.7, 6]] },
    { at: 190.42, from: 183.56, via: 'shock', id: 'waves.current', star: { landOn: 199.0, freq: [2.3, 1.6], size: [2.2, 2.8], lead: 0.5, mirror: true },   // bars 112-127. The same flower. On the lift at 190.4, not the flat section edge at 188.7
      ambient: [[190.42, 0.7], [210.15, 0.7], [217.88, 1]] },
    { at: 217.88, from: 210.15, via: 'fall', a: 0.9, id: 'lattice.master',   // bars 128-181. One sheet growing for 90 s, its clock doubling every 16 bars. Something accumulates
      lanes: { scale: [[219, 0.55], [245.34, 0.9], [272.79, 1.4], [300.25, 2.1], [303, 2.2]], rot: [[219, -0.2], [303, 0.5]] },
      gear: [[219, 24], [245.34, 12], [272.79, 6], [300.25, 3]] },
    { at: 310.54, via: 'iris', D: 12, id: 'dials.board',             // bars 182-201. Inside out on the climax, and it opens on the board
      lanes: { scale: [[318, 0.9], [344.86, 1.4]], rot: [[318, -0.3], [344.86, 0.4]] }, gear: [[310.54, 4], [327.7, 8]] },
    { at: 344.86, from: 338.0, tail: 1, via: 'slide', id: 'dials.board',   // bars 202-. The whisper. One ring opens to fill the frame as the sound dies, and then nothing moves
      lanes: { scale: [[347, 1.4], [355.16, 1.8], [358.59, 5.5], [360, 5.6]], rot: [[347, 0.4], [360, 0.5]] }, gear: [[344.86, 32], [355.16, 64]],
      ambient: [[344.86, 1], [347, 0.3]] },
  ],
};
```

The scratch loader to start from: `/private/tmp/claude-501/-Users-evansmac-Downloads-eprojects-trippy-pattern-world/bc364b04-5eba-4685-8aaf-f2c74cd89858/scratchpad/dirtree/src/score/cut.js`, with `moves/cue.js` beside it. A lane should rewrite it; it has rough edges.

What it does, in case that goes:
1. Build plain gestures end to end, `arcs: []`, `fixedRange: true`.
2. Compile lanes to `evalTrack` knots, log for `scale`, `freq`, `cam.dist`. Interior velocity is the harmonic mean of its neighbours' slopes, so nothing overshoots and nothing stops at a knot; a `'hit'` knot leaves at 2.2 times the slope.
3. Compile `gear` to a `phiTrack`, shifting over at least a bar and 3 s.
4. Wear `via`.
5. Call `putCountdown` and `placeStar`, then set `score.ambient` from the lanes.

`direct()` exposes `score.kit = { cast, putCountdown, ... }` for it.

### What they're asked

Three questions, after watching each song both ways:
1. Is this what you mean, or nearer to it?
2. Which passages are better and which are worse? (`=` and `-` have the times.)
3. Is either song too busy or too still?

- **Yes:** Stage B.
- **Partly:** their notes change the data in minutes, and they look again.
- **No:** nothing is lost but one afternoon, and the timing lane can stand alone.

Second question to put when Relay exists: MGMT cut restless against MGMT cut as here. That answers "some songs should morph through patterns" directly, which no analysis can.

**Why this before the generator.** All three designs admit an algorithm can't tell which of three equal arrivals matters or judge cool. Two editors who never heard the song cut bars an analysis doesn't list. If hand cuts aren't what they mean, no generator aimed at them can be.

## 8. Tests to add to `tests/judge.mjs`

As `STAGE=direction`, pure functions over the saved capture like the others, PENDING until `score.sheet` or `G.peak` exists. Hits are `G.peak.hit`, the Fall and Iris hits, and `score.sheet.hits`. "Shows" is `shotlist.mjs`'s measure: rate of change within .25 s against the median of the 16 s around it, 1.5 or more counts. Move `shows` into a shared export.

| Row | Measure | Pass | Today |
|---|---|---|---|
| **Identity** | Gesture fingerprint with flags off against baseline; `tests/hash.mjs` | identical | |
| **Reads** | Hits that show | 70%+ | 22-33 |
| **Not everywhere** | Any bar line that shows, in the same film | under 35% | 22-34 |
| **Top three** | The top three jumps from `phrasing`, not chosen by the sheet, so it can't pick easy ones | 80% show | 0-1 of 3 on a change |
| **Peak on the hit** | Fastest frame within a beat of the hit | 60%+ | 0-29 |
| **Climax** | Biggest show of the film within a bar of the climax; nothing before it bigger | yes | no |
| **Prepared** | Motion in the 2 bars before a top-3 hit against the 2 after | at most .5 | .6-.9 |
| **Rank** | Spearman of hit size against show | .5+ | |
| **Not a metronome** | Spread (sd/mean) of gaps between hits; morphs within 15% of median | .5+; under 40% | PPP .15 by jumps; 43-67% |
| **Refrain** | Time in returning sections wearing their first visit's pattern | 60%+ | 3 of 17 sections |
| **One idea** | Top family's share, or top way of changing | 60%+ | 23-34 |
| **Energy on the eye** | r of energy with edge speed; loud third's edge speed over quiet third's | .4+; 1.3+ | -.16 to +.39 |
| **Pace across songs** | Changes a minute, most over least, across the four songs (in `tests/all.mjs`) | 2+ | 1.2 |
| **Loud is bold** | Fineness at ride 3-4 against ride 1 | no finer | MGMT finest at its loudest |
| **The song's let in** | `score.ambient` under .9 | under 30% of the film | 54-63 |
| **Never lost** | `score.refused` on a shipped cut | empty, or the owner has seen it | |
| **Flash, Jerk, One colour, Noise, Stasis** | Existing rows on every new film | as now | |

The row *not* to add: more changes when louder. A good cut fails it (section 2).

Then the owner, blind, with `?blind=1`. Which they'd watch again decides, and no number overrides that.

## 9. Lanes

Rules as in `NEXT.md`: edit only your files, each lane its own `--out lab-out/<lane>`, flags, pure functions, no lighting. The lead commits and announces a version when a gate passes. Tests run muted. Start from a commit, after what's in the tree has landed, with `tests/hash.mjs MODE=save` taken there.

MODES lanes M and J own `compose.js`, `direct.js`, `song-sheet.js`, `react.js`, `flags.js`, `rehearse.js`. Stage A's edits there are a few lines each, so they go in first, through the lead. Stage B and lane M can't both hold `compose.js` and `direct.js`: **the lead sequences B3, B4 and B5 before M's changes 3, 4, 8 and 10**, or those wait.

### Stage A: in front of the owner. 4 lanes.

| Lane | Owns | Must show |
|---|---|---|
| **A1 Hit** | New `src/score/land.js`. Edits: `morphclock.js` (`peaked`), `direct.js` (one call, `score.kit`), `flags.js` (`directing`), `rehearse.js` (the softening step, logged) | The table in section 2 reproduced behind `?peak=1`. Identity with the flag off. Flash and Jerk rows no worse. `tests/pops.mjs` and `tests/flat.mjs` clean. Fall behaviour unchanged |
| **A2 Cut** | New `src/score/cut.js`, `src/score/cuts/*`, `src/score/moves/cue.js`, `tests/cut.mjs`. Edits: `moves/index.js`, `compose.js` (`opts.cut`), `moves/slip.js`, `moves/star.js`, `moves/coin.js` (the options in section 6), `song-sheet.js` (the `pulse` lane) | Both cuts load with `score.refused` empty. Flash whole 0, tile at most 2. Strips. Seek lands on the same bytes as play. Both play through to the end. Identity without `opts.cut` |
| **A3 Compare** | `src/music/song.js`, `src/ui/songpanel.js`, `src/ui/ui.js`, `tests/compare.mjs`, and the arrival flight's tile flash in `stage.js` | Real keys in a real page: `d`, `D`, `=`, `-`. The clock unbroken across a switch. No pop on either side. Both films rehearsed before the button shows. A recording across a switch plays to its end. A song with no cut unchanged, no button, no key |
| **A4 Rows** | `tests/judge.mjs`, `tests/shotlist.mjs` | Rows on all four songs, today's numbers matching this file. A self-test where a fake film fails each row |

**Gate: the owner watches MGMT and PPP both ways.** The lead pushes and announces. Nothing past here starts until they answer.

### Stage B: a generator that writes cuts. 6 lanes, only on a yes.

| Lane | Owns | Must show |
|---|---|---|
| **B1 Listening** | New `src/music/phrasing.js`, `tests/phrasing.mjs` | The numbers in section 5 reproduced. `A` byte-identical. Recall of the editors' moments printed |
| **B2 Sheet** | New `src/score/treat.js`, `src/score/routines/*`, `tests/treat.mjs` | Sheets for all four songs, one screen each, with the idea line. Routines extracted from the approved cuts. Fitted back onto MGMT and PPP they land the same bars as the cuts on 70%+ of hits |
| **B3 Compose** | `src/score/compose.js` | Identity with the flag off. Hits on landings 80%+. Morph spread and refrain rows pass |
| **B4 Obey** | `src/score/direct.js` | `obey()` places what it's asked, with refusals and reasons. Quotas gone under the flag. Hoisting changes nothing with the flag off |
| **B5 Song** | `src/score/react.js`, `song-sheet.js`, and `beyond.js` for `plateBy: 'ride'` only | "The song's let in" passes. No pulses in a whisper. The tune never under its floor. Balance row no worse. Beyond on a Home song still looks as they liked it, with a sheet for them |
| **B6 Bar** | `tests/judge.mjs`, `tests/all.mjs` | All section 8 rows on all four songs, with a fifth song nobody tuned on |

**Gate: the owner, blind, generated-by-sheet against hand cut on a song not in the tuning set.**

### Stage C: the new vocabulary. 5 lanes, one file each.

| Lane | Owns | Must show |
|---|---|---|
| **C1 Ramp** | `slot.js` (`G.uTrack` in `arcU`), `tests/ramp.mjs` | Speed peak within a frame of the landing, under 1.2 ln/s, on 10 pairs |
| **C2 Relay** | New `moves/relay.js`, `tests/relay.mjs` | Whole-frame white .49-.51 throughout. Openings land on chord starts. The MGMT restless cut for the owner |
| **C3 Chill set** | New `moves/moire.js`, `vertigo.js`, `confocal.js` | Each on Wildflower with flash limits. Stills, then the owner |
| **C4 Riot set** | New `moves/ratchet.js`, `scissor.js`, `bellows.js` | Beats landed to a frame. Jerk under 3 |
| **C5 Shader** | `gl/chunks/moves.js`, behind `#ifdef`. Sky Roll first | FRAG hash unchanged in plain programs. Cost table. Stops if the knot still greys |

### Stage D: only if they want to cut their own.

Tap mode, one lane: `x` to ride the level with mouse height, click for a hit, hold for a build, snap to a bar within .6 beat, recompose at the end. It writes a sheet with `by: 'tap'`. No learning until there are enough taps to be worth it.

At most six lanes at once in any stage, on top of whichever MODES lanes run.

## 10. What to cut first

In this order. Stop as soon as there's time enough.

1. Stage D. It isn't started before the gate anyway.
2. Stage C shader work: Flutes, Chladni, then Sky Roll.
3. Bellows, Confocal, Scissor, Turntable.
4. The recurring chord image and the single ticks on instrument entries.
5. The register classifier, leaving the owner's key and travel as default. It's the thinnest guess in the plan.
6. PPP's cut after bar 53, leaving the generated film to carry on, so the comparison is only the first 90 s.
7. The `compose.js` integration beyond hits in `bonus`, ride in `lengthWanted`, and rhymes in `spreadPick`.

**Never cut:** the identity test, the flash guard, `score.refused`, the fastest frame on the hit, a compare key, the hand cuts. Those are how anyone will know whether this worked.
