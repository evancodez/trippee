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
  river: true, arcade: true, blaze: true,
  // the director
  direct: true, countdown: true, lock: true,
  // the film's rehearsal: patterns kept out of films, the good part of each long move, which way a flight goes
  pool: true, range: true, flightWay: true,
  // pattern music: tools you can hear, and reading colour by its nearest ink
  toolsound: true, readInks: true,
};
export const flag = id => flags[id] !== false;
export const setFlag = (id, on) => { flags[id] = !!on; };
export const setAllFlags = on => { for (const id in flags) flags[id] = !!on; };
