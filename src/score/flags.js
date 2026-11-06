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
// ?direct=1 turns both on, ?peak=1 the timing alone.
export const directing = { peak: false, sheet: false };
{
  const q = new URLSearchParams(globalThis.location?.search ?? ''), all = q.get('direct') === '1';
  directing.peak = all || q.get('peak') === '1';
  directing.sheet = all;
}
