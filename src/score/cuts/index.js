// Which songs have a hand cut, by song.hash (the first 32 hex of the file's SHA-256). A cut is only loaded when its song is.
const CUTS = {
  b348c58fdc8d0af2d7ecbe0b9d646db9: () => import('./b348c58fdc8d0af2d7ecbe0b9d646db9.js'),     // MGMT
  f9ee57f6abe35539eae4fdecc1fdd65f: () => import('./f9ee57f6abe35539eae4fdecc1fdd65f.js'),     // PPP
  '95b65702b9f8b1a927f5f6f889a911e2': () => import('./95b65702b9f8b1a927f5f6f889a911e2.js'),   // Wildflower, the chill end
  '74d3369b18c08b32b582f783e54cf61a': () => import('./74d3369b18c08b32b582f783e54cf61a.js'),   // Disclosure, the restless end
};
// Another cut of a song, instead of the one above, with ?cut=<name> in the address.
const OTHER = {
  restless: { b348c58fdc8d0af2d7ecbe0b9d646db9: () => import('./mgmt-restless.js') },          // MGMT, the restless end
  time: { b348c58fdc8d0af2d7ecbe0b9d646db9: () => import('./mgmt-time.js'), f9ee57f6abe35539eae4fdecc1fdd65f: () => import('./ppp-time.js') },      // MGMT and PPP, with the tricks in moves/time.js. Demos, not films
};
const asked = new URLSearchParams(globalThis.location?.search ?? '').get('cut');
const pick = hash => OTHER[asked]?.[hash] ?? CUTS[hash];
export const hasCut = hash => !!pick(hash);
export const cutFor = async hash => (pick(hash) ? (await pick(hash)()).default : null);
