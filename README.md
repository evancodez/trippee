# trippee

A black-and-white op-art pattern machine that makes a film for a song. It runs in the browser on WebGL2. There's no build step and nothing to install except Node, which serves the files.

```bash
node tools/serve.mjs
```

Then open http://localhost:5300 in Chrome.

With no song it wanders through the patterns on its own. Every change of pattern is a morph: the lines of one bend and weave into the next, with no solid frames and no empty black.

Flickering line patterns can trigger seizures in people with photosensitive epilepsy. Press `m` for calm mode: slower flow and no fine lines.

## Songs

Drop an audio file anywhere on the window, or press `s` and choose one. It listens to the song for a few seconds, composes a film and starts playing. The film is worked out from the song's beats and sections, and each morph arrives exactly on one of the song's big moments.

In the song panel:

- **the strip** shows the song's sections. Click it to seek.
- **another take** makes a different film of the same song. The music keeps playing.
- **use the pattern on screen** builds the film from the pattern you're looking at, including whatever you've done to it with the knobs and zoom.
- **eject** goes back to wandering.

Songs stay on your machine. The analysis is cached in the browser so a song is only listened to once.

## Using your hands

| Do this | And this happens |
|---|---|
| move | a ball pushes up under the sheet |
| drag | comb the lines. Dents stay and slowly relax |
| scroll, pinch | zoom about the cursor, from hairlines to huge |
| scroll sideways, shift+scroll | thinner or fatter lines |
| alt+drag | lift a copy of the sheet. Up and down turns it, sideways slides it. It locks where the fringes close |
| alt+scroll | turn the copy very finely |
| alt+double-click | lay the copy back down |

## Keys

| Key | |
|---|---|
| `p` | patterns: every pattern by family. Hover one to see it play, click to go to it |
| `k` | knobs for the current pattern, plus speed, rotation and lines. Double-click a knob to let it go |
| `s` | song |
| `r` | start or stop recording. Saves an mp4 at 1080p, with the song's sound |
| `c` | save a picture |
| `space` | pause |
| `n`, arrows | next or previous pattern |
| `w` | go back to wandering |
| `z` | clear what the hand has done |
| `m` | calm |
| `f` | fullscreen |
| `h` | hide the interface |
| `?` | all of this, on screen |

Move the mouse to the bottom edge for a bar with the same things. The interface fades when the mouse stops.

## Frame rate

If the frame rate stays under 55 fps, it draws fewer pixels and stretches them to fit, in steps down to half size. It goes back up during a solid frame. The canvas and any recording keep their size throughout.

## Adding patterns

A pattern is plain data in `src/pattern/families/`. There's no shader to write. `docs/ENGINE.md` explains the format and how a frame is made. `docs/STUDY.md` has measurements of the film this is based on.

## Testing

`tools/lab.mjs` runs the real app in Chrome and drives it with real input:

```bash
node tools/lab.mjs tests/integrate.mjs --out lab-out/me     # boot, a real song, a recording
node tools/lab.mjs tests/hand.mjs --out lab-out/me          # every verb
node tools/lab.mjs tests/fps.mjs --size 1920,1080 --out lab-out/me
```

Songs for testing go in `media/`, which git ignores. Never commit songs or video.
