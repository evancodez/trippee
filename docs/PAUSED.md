# Where things stand

Written 2026-11-07, evening, when the owner asked to wind down: "yeah if you could wind down about now ill have you continue later". Read this first when picking the work up. Nothing runs until the owner says continue.

## Live

`main` is **v2.7**, tag `v2.7`, commit 177dadc. It is deployed at https://trippee-five.vercel.app, and every push to `main` redeploys it. The owner's own preview of `main` runs at `localhost:5300`.

v2.7 has:
- the travelling camera, many more tricks, and smooth keys and clicks
- "another take" working
- `h` hides the interface and `e` follows the song hard; ripples are rare and depend on the song
- Matter and Retina on `v`, next to Flower Power
- Strata in the library, and in films with `?strata=1`
- Camouflage on `y`
- Dusk, Flyer and Pearl out of the strip; their files are kept

Restore points are the tags: `v2.6.1`, `v2.6`, `evan-snapshot-1`, `evan-snapshot-2` and earlier.

## The owner's latest notes, in their words

- "main issue is stuttering and performance issues in song mode and possibly other modes. Gotta fix that."
- "the infinite recurring picture in picture I think look cool but the way it transitions in and out is bad because it just becomes small at the end then kinda instantly disappears and there are other transitions that are like not smooth/trippy and instead feel like an effect is simply coming into existence rather than merging or whatever into existence."
- "the other modes besides the original three are kinda bad and id scrap them for now just focus on improving flower power and maybe adding a cooler color mode that does more with colors in some way that makes it even trippier." The original three are black and white, colour (Beyond, `b`) and Flower Power.
- "matter and retina look cool, strata is good but ride and stuff like that is super dope and I think you could make even cooler trippier things by messing with it in interesting ways as well as separate pattern options."
- The ripple was "only too crazy when you say follow the song hard". Black and white "looks really cool as it was". Leave the plain film alone.

## Next: v2.8, on `wip/round-8` (not uploaded)

`wip/round-8` is v2.7 with five lanes merged in. Their reports are in `.wt/reports/round8-*.txt`.
- **perf8:** the rehearsal behind a playing song no longer makes the page wait on the GPU. Hitches go from about 61 frames over 50 ms in 172 s to 2 in 144 s. Compose is 30 ms shorter. A heavy trick is drawn smaller within a few frames. A second press of "another take" now waits for its rehearsal. The fix for the opening re-check wiping the song layer's dips is in. Films are byte-identical.
- **trans8:** screen (the picture-in-picture) grows in from the frame's own edge and ends by flying into its last window. The camera's turn holds under a screen. Fan and crumple are eased. Disclosure's worst tile goes from 6 to 4.
- **colour8:** Flower Power is bolder, with flowering film patterns, Swirl, Puff and twisting Buds. Prism is new. Dusk, Flyer and Pearl are out.
- **space8:** Dome, Planet, Canyon and Skim are in the library. Dome and Planet are cast in films unless `?sky=0`; Canyon only with `?sky=all`.
- `v` cycles: film, Flower Power, Prism, Retina, Matter.

Checks on `wip/round-8`: hash 433 identical, boot 0 errors, and `v` steps through every mode.

**Blocking, found at merge: `b` inside a mode stalls.**
- In `tests/worlds.mjs STAGE=strip`, once `v` has visited Prism, `b` in the next mode starts its change late and is still changing 20 s later.
- It passes with `'prism'` taken out of WORLDS, and passes on v2.7 and after the first three merges. So something Prism leaves behind stalls a later change.
- It is not colour8's warm-up commit b8c13fc: that was reverted in d6312c1, and it still fails. Put that warm-up back, in a robust form, once the stall is fixed.
- Fixer 1's unfinished, untested edits toward this are on `wip/round-8-fixer1-partial`.

**Still to do before v2.8 ships:**
1. The `b` stall above.
2. Forever still opens from a dot and shrinks back to one, which is the owner's complaint. trans8's side-entry attempt flickered more and was reverted.
3. A change of mode is 4.5 to 6 s of the plain film's flight, then the new colours inside a disc growing from a corner. It must merge in instead (src/worlds/engine.js).
4. An independent check against live v2.7: flashes on four songs, the real-time stutter probe (scratchpad perf8/stutter.mjs), modes, the tricks above, and the 3D patterns. Then upload as v2.8.

## Known, not blocking

- Tile flicker on three songs is still above v2.6.1 (PPP 4 vs 3, Disclosure 4 vs 2, Wildflower 4 vs 3); see round8-trans8.txt.
- Prism's own lane calls it "not next level": the flash fixes left many frames as two or three neighbouring hues.
- The remaining slow frames are the GPU drawing heavy tricks at full size: 20 to 55 ms at 3024x1964.

## Waiting on the owner

1. Whether heavy tricks may be drawn smaller from the start: the existing flag `gpuTiers`, off. It means fewer stutters during heavy effects, and softer detail while they're up.
2. Whether Prism stays, after they see it.
3. A rock song and a slow reverb-heavy song in `media/`, for testing.

## Later ideas

These are in `.wt/reports/next-level-plan.md`:
- Time Well
- The Reveal
- Paper
- Marbling
- Retina part 2
- Matter part 2

More sheet-in-space worlds too, as the owner asked.

## How the work is set up

- Lanes work in `.wt/<lane>` worktrees (excluded from git), on `lane/<lane>` branches, each with its own server and `LAB_URL`.
- Run lab tests with `LAB_SLOTS=2` while the owner is using the machine.
- The lead merges, checks independently, and only then pushes `main`, which deploys to Vercel.
- Never play sound out loud in testing, never commit songs or video, and leave port 5173 alone.
