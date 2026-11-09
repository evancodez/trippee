# Where things stand

Written 2026-11-09 when v3.0 shipped. The owner said: "continue until you finish 3.0 then stop". Nothing runs until the owner says to continue.

## Live

`main` is **v3.0**, tag `v3.0`. It is deployed at https://trippee-five.vercel.app, and every push to `main` redeploys it. The owner's own preview of `main` runs at `localhost:5300`. Restore points are the tags `v2.9`, `v2.8`, `v2.7`, `v2.6.1` and earlier.

## What v3.0 added (since v2.8)

v2.9:
- Forever opens ring by ring out of the sheet instead of from a dot.
- The screen's (picture-in-picture's) first window is cut from the sheet.
- Pearls are only cast on flat sheets.
- Disclosure gets no planet or dome.
- Flower Power is built while a song loads, so the first `v` doesn't freeze.

v3.0:
- **Forever into the next pattern.** When a forever runs up to a change, its tunnel flies on and the camera goes through a ring into the next pattern. That pattern starts at a readable size (about 100 px), not a dot. See `xform/window.js`.
- **Mode changes flow colour to colour.** From one mode to another there is no black-and-white middle any more: the new mode's colours take over in patches mid-flight. It lands on a section beat or a bar when a song plays. See `src/worlds/engine.js` (writeOne, over) and the renderer's `wp2`.
- **Prism is a ladder round the colour wheel.** Each band sits one step round the wheel from its neighbour, so the whole spectrum is in the pattern. The colours flow out a band on every strong beat and turn round at each section. See `src/worlds/prism/*`.
- **Time Well**, a screen where every window is another moment of the song. It's in the library and behind `?well=1`, but not cast: on PPP in Flower its tiles still flash 2 to 3 times a second.
- PPP seed 14 loads again.
- A mode no longer gets stuck waiting for a program something else built.
- The strip test waits for changes instead of checking at a fixed time.

## Known, not fixed

- The first `v` into Prism, Retina or Matter during a song still freezes briefly, as in v2.9. The warm-up only runs while a song is paused, because each first draw holds the picture for 0.2 to 0.8 s, and holding frames during playback is the stutter the owner complained about.
  - Option for the owner: warm every mode during the song's load. Ready would come 10 to 15 s later on a cold start.
- Time Well's flicker. See `.wt/reports/round12-wellfix12.txt` for what was tried and the next ideas: cap level times the delay's rate, and ease the delay on the way out.
- Forever's way in still flickers where the sheet turns under the fan's mirrors (Wildflower seed 1, 102 to 104 s). This predates v3.0. The likely fix is to turn the fan with the sheet (foldkit fanIn); see round12-tunnelfix12.txt.
- The forever handover shows a corner tile flashing twice a second at 110.3 s, measured at 12 fps. At 60 fps it reads as 1.
- Arriving in Retina or Matter still shows mostly black and white, which is their own palette.
- `b` inside a mode still drains to the film before Beyond opens.
- Each change between two modes draws twice in its middle 28%, which is about 2.5 times the GPU time for roughly 3.6 s.
- The relay.rooms to folds glide pop hasn't been reproduced since round 10.
- Load times are noisy: 30 to 70 s cold on the lab machine.

## Waiting on the owner

1. Whether heavy tricks may be drawn smaller from the start: the existing flag `gpuTiers`, off.
2. Whether to warm all modes during the song's load (see above).
3. A rock song and a slow reverb-heavy song in `media/`, for testing.

## Later ideas

These are in `.wt/reports/next-level-plan.md`:
- The Reveal
- Paper
- Marbling
- Retina part 2
- Matter part 2
- more sheet-in-space worlds

## How the work is set up

- Lanes work in `.wt/<lane>` worktrees (excluded from git), on `lane/<lane>` branches, each with its own server and `LAB_URL`.
- Run lab tests with `LAB_SLOTS=2` while the owner is using the machine.
- The lead merges, checks independently, and only then pushes `main`, which deploys to Vercel.
- Never play sound out loud in testing, never commit songs or video, and leave port 5173 alone.
- Reports from each round are in `.wt/reports/round*-*.txt`.
