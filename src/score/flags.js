// Everything new reads a flag here, so a failure gets switched off, not debugged at 5 am. Unlisted or true means on. A film composed with a flag
// off is exactly the film without that feature.
export const flags = {
  // how the song reaches the picture
  understand: true, weight: true, tuneRings: true, lensMap: true, lung: true, conductor: true, rests: true,
  // ways of moving
  slip: true, star: true, coin: true, snap: true,
  // transformations
  shock: true, fall: true, iris: true,
  // fields and worlds
  river: true, arcade: true, blaze: true, octagrid: true, metamorphosis: true, labyrinth: true,
  // the director
  direct: true, countdown: true, lock: true, heroRiley: true, onTheHit: true, lookRuns: true,
  // the film's rehearsal: patterns kept out of films, the good part of each long move, which way a flight goes
  pool: true, range: true, flightWay: true, flashGuard: true,
  // the governor going by what the GPU says each frame took, not only by the frame rate. Off for now: on, it draws below full size more often, and that's the owner's call once it's measured on a quiet machine
  gpuTiers: false,
  // pattern music: tools you can hear, and reading colour by its nearest ink
  toolsound: true, readInks: true,
};
export const flag = id => flags[id] !== false;
export const setFlag = (id, on) => { flags[id] = !!on; };
export const setAllFlags = on => { for (const id in flags) flags[id] = !!on; };

// How a film is directed (docs/DIRECTION.md). Off means the film is exactly the film. setAllFlags can't reach these, so a test that turns everything on is still about today's film.
// The timing is on: a change crosses at speed on the song's big moment, not coming to rest on it. ?peak=0 turns it off. ?direct=1 is the sheet too.
export const directing = { peak: true, sheet: false };
directing.folds = new URLSearchParams(globalThis.location?.search ?? '').get('folds') === '1';      // src/score/moves/foldfilm.js: a generated film wears the fold set on its long stays. Off unless ?folds=1 for now, so the film is exactly the film
directing.pace = new URLSearchParams(globalThis.location?.search ?? '').get('pace') !== '0';      // src/score/pace.js: how often a film changes, and with what. On unless ?pace=0
directing.woah = new URLSearchParams(globalThis.location?.search ?? '').get('woah') !== '0';      // src/score/woah.js: a film goes through the tricks, by the music. On unless ?woah=0
directing.woahOnly = new URLSearchParams(globalThis.location?.search ?? '').get('woahOnly')?.split(',') ?? null;      // ?woahOnly=forever,slit: only those, for looking at them
directing.cam = new URLSearchParams(globalThis.location?.search ?? '').get('cam') !== '0';      // src/score/camera.js: a camera that travels. On unless ?cam=0
directing.strata = new URLSearchParams(globalThis.location?.search ?? '').get('strata') === '1';      // src/score/moves/space.js: a sheet's sets of lines lift off to heights of their own on a build and lock back on its landing. Off unless ?strata=1, so the film is exactly the film
{
  const q = new URLSearchParams(globalThis.location?.search ?? ''), all = q.get('direct') === '1';
  directing.peak = q.get('peak') !== '0';
  directing.sheet = all;
}

// How a film hears. Two things.
// How hard the picture follows the song (src/score/hear.js): on by default. ?hear=0 starts without it, the e key flips it while a song plays. Off, the film is exactly the film. setAllFlags can't reach it, so a test that turns everything on is still about today's film.
// And the numbered changes in docs/MODES.md section 6 that aren't part of that, each on its own, which do change how a film's composed. A world can say its own: score.world.hear.on[id].
//   ?hear=0         without it   ?hear=1  with it, which is also what you get from nothing   ?hear=6,5  with it, and those   ?hear=all  with it and all of those
export const HEAR_READY = [];
export const hearing = { on: true, 5: false, 6: false, 7: false, 9: false, 11: false, morph: false };      // morph: not in the plan's table. A transformation walks as well
export const hearOn = (score, id) => score?.world?.hear?.on?.[id] ?? hearing[id] ?? false;
export function hearFrom(q) {
  for (const id in hearing) hearing[id] = false;
  hearing.on = q !== '0';
  if (!q || q === '0' || q === '1') return hearing;
  const list = q === 'all' ? Object.keys(hearing) : q.split(',').map(x => x.trim()).filter(Boolean);
  for (const id of list) if (id in hearing) hearing[id] = true;
  hearing.on = q !== '0';
  return hearing;
}
hearFrom(new URLSearchParams(globalThis.location?.search ?? '').get('hear'));
