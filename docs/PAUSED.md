# Where things stand

Written at v2.6, 2026-11-07. Read this first when picking the work up.

`main` is what the owner uses, at `localhost:5300`. Lanes work in `.wt/<lane>` worktrees (excluded from git) on `lane/<lane>` branches, each with its own server and `LAB_URL`, and the lead merges them into a working branch, checks independently, and only then brings it to `main`. Restore points are the tags, including `evan-snapshot-1`, `evan-snapshot-2`, `v2.4.1`, `v2.5.1`.

## The owner's note that set this version

"its not nearly reactive enough to music it feels too static/limited in response to beats melody moments etc and stays on an individual pattern too long almost always. Sometimes fair to hold on it but only if you're doing cool stuff/it fits." And of Flower Power: "it should work through other patterns too and stuff. And like add other shit and stuff".

So restraint in docs/DIRECTION.md (long holds, withholding, few patterns) is wrong where it conflicts. Use its diagnosis and vocabulary, not its caution. Guard fixes must not calm or slow a passage across a song: keep the energy and report the flash.

## Waiting on the owner

1. How v2.6 feels with sound. Nobody on this job can hear it.
2. Their pulse, melody and tone slider numbers, if they find settings they like.
3. Whether the cut generator (docs/DIRECTION.md, Stage B) is still wanted, now that the generated film has its own pace. It's built only on a yes.
4. A rock song and a slow reverb-heavy song in `media/`. Flyer can't be proved without the first, and Dusk and Pearl want the second.
5. Whether colour may draw below full size to hold its frame rate (flag `gpuTiers`, off since v2.4.1). Measure on a quiet machine first.

## Known problems at v2.6

Limits are unchanged, so these rows fail. We kept the film's energy instead of dulling it.

- **Flash, generated film:** MGMT 0 whole, 4 tile (near 150.2 s). PPP 1 whole (59.5, 141, 326 s), 3 tile (171 s). Wildflower and Disclosure weren't rescanned after the last fixes; before them both read 1 whole, 3 tile.
- **Jerk:** 4.08x on MGMT (the end of the rest, 93.76 s), 4.22x on PPP. Limit 3x. Breath fails narrowly on MGMT.
- **Fast stripes:** PPP 50-53 s, left because slowing them would dull it.
- **Hand cuts** are still the old slow ones, and with reaction on they fail `tests/cut.mjs` on flashes (MGMT whole at 185.67 s). Disclosure's has a jerk near 146 s and cracked-glass hairlines at 84.5-88 and 137.7-141. Wildflower's has fine hatching at 58-76 and quartered seams at 94.98 and 182.28.
- **Flower Power:** hairline seams on Bead Bloom, library clicks are always dives, Tunnel and Daisy Floor are out of the rotation because they only have flights, and its flashes weren't rescanned after the last fixes.
- **Generated takes:** pace was only flash-scanned on seed 7.

## The order from here

1. What the owner says about v2.6, first.
2. Recut the hand cuts at the new speed, and rework Disclosure and Wildflower from the notes above.
3. Worlds, Stage 2 in docs/MODES.md: Dusk, Flyer, Pearl, Acid, Liquid Light. Then Stage 3: Station Point, Supergraphic, Cut, Polariscope. Each gets Flower Power's range from the start: a wide pool including film patterns in its colours, new motifs, several ways of changing, things nothing else does.
4. Stage B of docs/DIRECTION.md, only on the owner's yes.
5. The freeze in docs/NEXT.md section 4.

## Lessons

- Don't message a workflow lane mid-run. It starts a second copy of the lane editing the same files.
- `tests/hash.mjs` plays no song. Use `tests/filmprint.mjs` for films, and try the real keys in a real page before a release: `d` popped through every other test.
- An independent check has found real problems every round. Keep it.
- A bug fix can quietly work against the brief. Read a repair's effect on the film, not only the test it was asked to pass.
