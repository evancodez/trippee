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
directing.pace = new URLSearchParams(globalThis.location?.search ?? '').get('pace') !== '0';      // src/score/pace.js: how often a film changes, and with what. On unless ?pace=0
{
  const q = new URLSearchParams(globalThis.location?.search ?? ''), all = q.get('direct') === '1';
  directing.peak = q.get('peak') !== '0';
  directing.sheet = all;
}

// How a film hears (docs/MODES.md section 6). Off means the film is exactly the film, byte for byte. setAllFlags can't reach these, so a test that turns everything on is still about today's film.
// Each is one numbered change from that table. A world can say its own: score.world.hear.on[id].
//   ?hear=1         everything in HEAR_READY     ?hear=1,2,6  exactly those     ?hear=6  just that one     ?hear=1,1  just 1, since ?hear=1 means them all
//   ?hear=all ?hear=0   the obvious
export const HEAR_READY = [1, 2];
export const hearing = { 1: false, 2: false, 5: false, 6: false, 7: false, 9: false, 11: false, morph: false };      // morph: not in the plan's table. A transformation walks as well (hearing 1 has to be on)
export const hearOn = (score, id) => score?.world?.hear?.on?.[id] ?? hearing[id] ?? false;
export function hearFrom(q) {
  for (const id in hearing) hearing[id] = false;
  if (!q || q === '0') return hearing;
  const list = q === 'all' ? Object.keys(hearing) : q === '1' ? HEAR_READY : q.split(',').map(x => x.trim()).filter(Boolean);
  for (const id of list) if (id in hearing) hearing[id] = true;
  return hearing;
}
hearFrom(new URLSearchParams(globalThis.location?.search ?? '').get('hear'));
