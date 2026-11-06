# Paused on 2026-11-06

The owner asked to stop for now and pick this up later. This is what to read first.

## Where things are

- **`main` is v2.5 and is what to use.** Nothing unfinished is on it. Restore points are the tags `evan-snapshot-1`, `evan-snapshot-2`, `v2.3`, `v2.4`, `v2.4.1` and `v2.5`.
- **`wip/round-3` holds everything built since v2.5, unfinished.** Don't merge it as it is. It boots with 0 errors, and `tests/hash.mjs` passes 433 of 433 with no song and no world on. That doesn't cover films: a film can change without `hash` seeing it.
- No lanes, test browsers or keep-awake are left running. Lanes M and E2's independent checks were stopped before they finished, so those two reports are unchecked.

## Still waiting on the owner

1. Is the hand cut closer to what they mean than the generated film? (`d` switches, on MGMT or PPP.) **The generator that writes cuts for any song (docs/DIRECTION.md, Stage B) gets built only on a yes.** If it's partly right, change the cut data from their notes first.
2. Does Flower Power feel like real 60s psychedelia, or a colourful screensaver? Do the Buds feel like transformations? docs/MODES.md wants this answer before the next worlds, if they're around.
3. A rock song and a slow reverb-heavy song in `media/`. Flyer can't be proved without the first, and Dusk and Pearl want the second.
4. Later: whether the plain film takes the new music following (`?hear=1`), after a side-by-side. And whether colour may draw below full size to hold its frame rate (flag `gpuTiers`, off since v2.4.1). Measure that on a quiet machine first and bring them the real cost.

## What's on `wip/round-3`, and what stops it merging

**Flash repair. Fix this first, because it works against the owner's main complaint.**
- It made the generated film slower. PPP's `coins.spiral` at 188.7-243.6 s, a loud stretch, flows at 1/4 (was full), and MGMT's opening hall is at 1/4 (was 1/2). PPP takes 57 s to be ready against 23, both under load.
- Part of the cause is a measuring bug. The tile samplers skip pixels and alias on fine upright lines: at Wildflower 92.5-94.5 s a tile read 8 to 118 while all its pixels stayed 48 to 57. Reading every pixel on MGMT and PPP gives lower counts than the judge's sampler. So make the samplers read the whole tile (`tools/look.mjs`, `tests/judge.mjs`, `tests/flash.mjs`, `FlashSeen` in `src/music/rehearse.js`). That corrects a measurement and doesn't loosen a limit: prove real flashes are still caught.
- Then keep the guard's fixes to real flashes, local in time where it can, and never drop a loud gesture's flow to a crawl. Get load time back.
- Real second takes come from `prepareTake`. Disclosure's seed 81144 has a whole-frame flash at 37.25 s and tile 4 at 173.4 s.

**Song-based results between 16:47 and about 17:30 are suspect.** A bug of lane M's changed plain films in that window. Rerun anything from it before relying on it, including the flash, Wildflower and Disclosure numbers.

**Add a whole-film check to every release.** `hash` plays no song, which is how that bug got past it. `tests/filmprint.mjs` and `tests/filmprint-diff.mjs` are the checker's tools for this, not yet tidied or listed in `tests/all.mjs`. Hand cuts of MGMT and PPP matched v2.4 at 17:33, but later `frame.js` and `stage.js` edits weren't compared.

**Disclosure cut** (`src/score/cuts/74d3369b...js`, the restless end). The judge fails Jerk at 6.04x near 146 s (limit 3), a tile flash near 56 s, and 0 of 11 peaks on the hit. As film: 84.5-88 and 137.7-141 are cracked-glass hairlines, 0-14 is a plain board under rising drums, the same speck closes three times, and the dartboard holds about 41% of the film.

**Wildflower cut** (the chill end). 58-76 is near-identical fine hatching, 104-139 is one checkerboard with little visibly changing, and the quartered seams at 94.98 and 182.28 read as overlay: a huge check cell crossing a flight. The ball at 154-169 pays off.

**Small repairs that look right, once rechecked.** Seeks no longer erase a hero, strip seeks ease (`song.jump`), a knob held into a transformation no longer jumps (`G.overWas`), click steps are smaller. Full `pick` and `tools` weren't rerun after the last edits. A strip click takes 2 to 3.5 s to move the music, which may feel slow.

**Music following, behind flags** (docs/HEARING.md; `?hear=1`, or `?hear=1,2,6` for chosen ones). Follow rose (MGMT F .115 to .342, PPP .115 to .438) but misses the marks. Jerk is proven on MGMT only, at 2.96x. Flash on MGMT is 0 whole, 4 tile. Change 7 and `hear.html` have never been run. Changes 3, 4, 8 and 10 wait for the director's sheet.

**Flower Power and the engine.** Much better: no whole-frame flash in the mode's own film on MGMT, the library shows a world's patterns and clicks land, tools work, flights hold their colour, and it's cheaper. Left: a change of world is 13 s and still reads 1-3 flashes a second on a tile (limit 1). New fails are Jerk on true colour at 3.08x near 136.52 s and Breath on Wildflower. To please the flash limit the lane traded taste, and the owner should judge it: rings at half speed, a softer pulse, the buzz stopping over 1.2 s, more and narrower rings on Big Bloom, changed inks.

**Extras** (`src/music/extras.js`): on `main`, wired to `song.extrasReady()` on the branch. `shim` and `air` give no usable number, as its header says.

## The order after that

1. The flash measurement and guard, then the whole-film check. Recheck everything, then merge what holds to `main`.
2. Editor passes on Disclosure and Wildflower from the notes above, with whatever the owner said about MGMT and PPP.
3. Worlds, Stage 2 in docs/MODES.md: Dusk, Flyer, Pearl, Acid, Liquid Light. Then Stage 3: Station Point, Supergraphic, Cut, Polariscope.
4. Stage B of docs/DIRECTION.md, only on the owner's yes.
5. The freeze in docs/NEXT.md section 4.

## Lessons from this round

- Don't message a workflow lane mid-run. It starts a second copy of the lane editing the same files.
- Lanes sharing one tree can invalidate each other's results. Start each round from a commit, and be wary of measuring on a tree another lane is editing.
- An independent check found what the lanes' own tests missed each time. Keep it.
- A bug fix can quietly work against the brief. Read a repair's effect on the film, not only the test it was asked to pass.
