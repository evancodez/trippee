# What the reference does

Notes from studying the official full-album stream of Beach House's "7" (47:16, directed by San Charoenchai). It was
watched as moving picture with its sound, not as stills: the whole album scanned at 4x, plus real-time passages at 23 fps.
Measured per frame: pattern density (edge count), white fraction, optical flow along the centre row and column,
time-slices (kymographs), and the audio spectrum on the same clock.

## The numbers

| Measure | Result |
| --- | --- |
| Colour | None. Chroma stays near 0 of 255 (99th percentile 0.3). Grey exists only as moiré from very fine lines. |
| Balance | Median white fraction is 0.5 in most songs (0.3 in Black Car and Last Ride). The picture is usually half and half. |
| Hard cuts | None seen. Everything is one continuous movement. |
| Solid moments | 103 in 47 min (60 black, 43 white): the frame goes fully one colour. Median gap 26 s. Median length 1.5 s, longest 10.5 s. |
| Speed | About 15 to 30 px/s on a 320 px wide frame, so 5 to 10% of the frame per second. Slow. |
| Beat sync | Effectively none. Visual speed against audio transients at 0.1 to 2 s scale: \|r\| at most 0.21 (Black Car). |
| Energy sync | Weak across the album. Pattern density against loudness per song: r = 0.04 to 0.39. A 30 s passage in Black Car reached 0.9, but that doesn't generalise. |
| Structure sync | Real. Strong changes in the sound sit a median 3.0 s from a solid moment, against 7.9 s for random times. |
| Phrase sync | Real where it's used. In Pay No Mind the dots inflate over about 4 s and flip colour repeatedly, then swell every 4.7 s with a 0.5 s attack and a 4 s decay. |

## What that means

**It isn't audio-reactive. It's choreographed to the song.** Nothing pulses on a drum. It feels locked to the music
because it moves in long unbroken gestures and lands them at the song's structural moments, and because it has the song's
pace. Copying this means direction and form, not a band-to-parameter mapping.

The reference is hand-made, so it can't react exactly. An app that has heard the whole song can land every gesture exactly
and lock its flow to the tempo, which is how this can beat the original rather than imitate it.

## The grammar

**One family per song.** Each track keeps to one motif and explores it for its whole length:

| Song | Family |
| --- | --- |
| Dark Spring | Stripe fields bending, a striped sphere in a field, bow-tie pinches, moiré discs |
| Pay No Mind | Polka dots on curved surfaces, inflating and flipping colour, rolling sheets of dots |
| Lemon Glow | Checker with a band of squeezed columns, concentric target rings, swirled checker |
| L'Inconnue | Checkered ribbons crawling across white, twisting into cloth |
| Drunk in LA | Triangle lattice from micro to macro, a kaleidoscope star-lens at the centre, floors, then nested spiral squares |
| Dive | Nested chevrons, square rooms, radial bursts over checker floor, a checker diamond counter-rotating inside swirled checker, zigzags from hairline to huge |
| Black Car | Stripes seen through black voids, rooms built from lines, slivers growing into fields, zebra blobs floating in black |
| Lose Your Smile | Checker floors and walls, cloth, black voids with checker behind |
| Woo | Rings emitted from poles, the whole system tilting into a grazing landscape of pools, stripes crossed with rings |
| Girl of the Year | Stretched triangles like teeth in columns, dots, tunnels |
| Last Ride | Triangle walls, black voids, teeth columns, closing into black |

**The gesture.** A unit of about 26 s. Sparse elements come out of a solid, density or scale swings through a long arc,
then the frame resolves into a solid again.

**How one pattern becomes another.** Patterns are never crossfaded, and there is no grey mix.

1. **Duty sweep (the main one).** Elements shrink to nothing or grow until they merge, the frame goes solid, and the next
   pattern starts as specks out of that solid. It's a threshold sliding through a field. Example: triangles shrink to
   black at 961 s, huge shapes come out of the black, shrink to white at 978 s, a star-lens comes out of the white.
2. **Scale sweep.** Zoom in until one element fills the frame, or out until the lines go to moiré.
3. **Void closing.** A hard black shape grows until it covers everything (the black square at 1726 s).
4. **Sliver opening.** A hairline crack of the next pattern appears in the solid and widens (1729 to 1745 s).
5. **Emission.** Rings are born one at a time at a point and push the rest outward (Woo).

**Depth has no lighting.** There's no shading, gradient or highlight anywhere. Spheres, tubes, floors and rooms are
readable only from how the pattern foreshortens. The camera tilts slowly, for example from straight down to a grazing
horizon over about 40 s (2188 to 2232 s).

**Silhouettes are made by the pattern stopping.** Black voids and hard mattes reveal or hide fields, and two fields with
different orientation meet at an edge with no outline drawn.

**Scale is treated as a journey.** The same lattice goes from hairline to larger than the frame within one gesture. At
macro scale edges wobble like hand-cut paper, which gives the huge shapes their life.

**Moiré is welcome.** Fine lines are allowed to shimmer into grey discs and beats. It's the only soft thing in the film.

## Motion rules for this project

- Fully 1-bit in black and white mode. No grey except what fine lines produce.
- No drum-driven pulses, flashes or shakes. The user has rejected jarring hits before.
- The picture must keep travelling, with long eased moves and frequent transformations. A wobble on one static pattern
  is boring. The reference changes its whole structure about every 26 s.
- Transitions go through a shared solid or a hard-edged shape, never a blend.
- Attack may be quicker than decay, but it is still a swell of about 0.5 s, not a jump.
- Avoid full-frame flashing. Inverting the whole frame quickly is a photosensitivity risk, and the reference never needs
  it because it always passes through a solid slowly.
