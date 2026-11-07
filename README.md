# trippee

An op-art pattern machine in black and white. It wanders through the patterns on its own, makes a film for a song you give it, or plays its own music from what's on screen. It runs in the browser on WebGL2. There's no build step and nothing to install except Node, which serves the files.

```bash
node tools/serve.mjs
```

Then open http://localhost:5300 in Chrome.

Every change of pattern is a morph: the lines of one bend and weave into the next, with no solid frames and no empty black.

Flickering line patterns can trigger seizures in people with photosensitive epilepsy. Press `m` for calm mode: slower flow and no fine lines.

## The bar

Move the mouse and a bar comes up along the bottom. It fades about two seconds after the mouse stops.

| Key | Button | What it does |
|---|---|---|
| `1` | ripple | click drops a ring. Hold and move to rain them |
| `2` | hand | a hand comes up through the sheet. Hold to make a fist |
| `3` | twist | drag to wind the lines round the cursor |
| `4` | pinch | hold to draw the lines in |
| `5` | bulge | hold to swell the lines out |
| `6` | comb | drag to comb the lines. Dents stay and slowly relax |
| `l` | static | what's showing stays and only flows |
| `g` | make music | the picture plays itself |
| `b` | colour | the pattern printed twice, in two inks |

Choosing an effect again goes back to the plain hand.

**Static** stops the automatic changes until you turn it off, with or without a song. Knobs, zoom and every effect still work. Pick a pattern and it morphs there and stays.

**The hand** is an outline that wears whatever pattern is showing. It stays up through a morph, in static, in colour and during a song. The wrist follows the cursor.

**Colour** prints the pattern a second time, slightly moved, and colour only appears where the two printings disagree. Fully closed it's exactly black and white. `shift+b` goes to the next inks. During a song the plates open with the loud sections.

**Make music** reads a small copy of the picture, left to right, and turns the white into notes in one key: arpeggios, a pad and a bass. Each family of patterns has its own instrument, and a morph changes the chord halfway through. Zoom moves the pitch, line weight changes how long notes last, and ripples ping. A loaded song pauses while it plays. Press `g` again or play on the song panel and the song carries on from where it was. Nothing makes a sound until you turn it on.

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

## Other keys

| Key | |
|---|---|
| `p` | patterns: every pattern by family. Hover one to see it play, click to go to it |
| `k` | knobs for the current pattern, plus speed, rotation and lines. Double-click a knob to let it go |
| `s` | song |
| `r` | start or stop recording. Saves an mp4 at 1080p, with the song or the picture's music, whichever is sounding |
| `c` | save a picture |
| `space` | pause |
| `n`, arrows | next or previous pattern |
| `w` | go back to wandering |
| `z` | clear what the hand has done |
| `m` | calm |
| `f` | fullscreen |
| `h` | hide the interface |
| `e` | with a song on: how hard the picture follows it, on or off |
| `?` | all of this, on screen |

## Frame rate

The hand, colour and flights between patterns each cost something, and each is only compiled into the shader while it's in use. If the frame rate stays under 55 fps it draws fewer pixels and stretches them to fit, down to half size, and it remembers a size for each combination. So a plain picture stays sharp and only draws smaller while something heavy is on. The canvas and any recording keep their size throughout.

## Adding patterns

A pattern is plain data in `src/pattern/families/`. There's no shader to write. `docs/ENGINE.md` explains the format and how a frame is made. `docs/STUDY.md` has measurements of the film this is based on.

## Testing

`tools/lab.mjs` runs the real app in a muted Chrome and drives it with real input:

```bash
STAGE=boot,static,hand,music node tools/lab.mjs tests/v2.mjs --out lab-out/me    # the bar and every mode, together
STAGE=film node tools/lab.mjs tests/v2.mjs --out lab-out/me                      # a song's film, measured frame by frame
STAGE=fps node tools/lab.mjs tests/v2.mjs --size 1920,1080 --out lab-out/me      # frame rate on the heaviest case
node tools/lab.mjs tests/integrate.mjs --out lab-out/me                          # boot, a real song, a recording
```

Songs for testing go in `media/`, which git ignores. Never commit songs or video.
