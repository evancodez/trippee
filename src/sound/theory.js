// Harmony. One key signature for the whole session: every note anyone plays comes out of the same seven pitch classes, so nothing can
// ever be a wrong note. The modes are rotations of it (dorian on the second degree, lydian on the fourth, aeolian on the sixth), and each
// family lives on a different one, which is the slow modal movement. What the picture plays is a pentatonic ladder on the current chord.
const IONIAN = [0, 2, 4, 5, 7, 9, 11];

// Degrees (0 is the signature's own root): root, the pad's four notes, the five-note ladder for the picture to play.
const CHORDS = {
  I:    { root: 0, tones: [0, 2, 4, 6], ladder: [0, 1, 2, 4, 5] },    // maj7   over major pentatonic
  ii:   { root: 1, tones: [1, 3, 5, 0], ladder: [1, 3, 4, 5, 0] },    // m7     over minor pentatonic
  iii:  { root: 2, tones: [2, 4, 6, 1], ladder: [2, 4, 5, 6, 1] },    // m7     over minor pentatonic
  IV:   { root: 3, tones: [3, 5, 0, 2], ladder: [3, 4, 5, 0, 1] },    // maj7   over major pentatonic
  IVL:  { root: 3, tones: [3, 5, 2, 6], ladder: [3, 4, 5, 0, 1] },    // maj7#11, the lydian shell
  V:    { root: 4, tones: [4, 6, 1, 2], ladder: [4, 5, 6, 1, 2] },    // 6 with no 7th, so no tritone pulling anywhere
  vi:   { root: 5, tones: [5, 0, 2, 4], ladder: [5, 0, 1, 2, 4] },    // m7     over minor pentatonic
  iiQ:  { root: 1, tones: [1, 4, 0, 3], ladder: [1, 3, 4, 5, 0] },    // stacked fourths: wide and undecided
  iiiQ: { root: 2, tones: [2, 5, 1, 4], ladder: [2, 4, 5, 6, 1] },
  viQ:  { root: 5, tones: [5, 1, 4, 0], ladder: [5, 0, 1, 2, 4] },
};

// main      the voice that plays what the read line finds
// style     arp: one found note per step, walked through. chord: all of them at once when the column changes. sparse: only some.
// keep      for sparse, how much of what it finds gets played
// reg, span the register relative to what the element size asks for, and how wide the ladder is, in semitones
// gear      -1 slower than the element size asks for, +1 faster. top: the fastest grid it will play at, for voices that ring
// low       the bottom of the picture plays this, every bassEvery of a clock cycle
// harm      clock cycles per chord
// pad, padCut, breathe, drone, delay, verb: levels and sizes of the rest of the band
// gate      note length in steps, before the threshold
export const FAMILY = {
  lines:   { prog: ['ii', 'V', 'ii', 'IV', 'vi', 'V'], main: 'glass', style: 'arp', max: 2, reg: 2, span: 24, gear: 0, low: 'bass', bassEvery: 1 / 2, harm: 2, pad: 0.8, padCut: 0.42, breathe: 0.12, drone: 0, delay: 0.3, verb: 0.24, gate: 1.3, bright: 0.55 },
  dots:    { prog: ['IVL', 'V', 'vi', 'IVL', 'I'], main: 'pluck', style: 'sparse', keep: 0.6, max: 2, top: 16, reg: 4, span: 24, gear: 0, low: 'sub', bassEvery: 1 / 2, harm: 2, pad: 0.5, padCut: 0.32, breathe: 0.08, drone: 0, delay: 0.55, verb: 0.3, gate: 1.6, bright: 0.45 },
  lattice: { prog: ['I', 'vi', 'IV', 'ii'], main: 'bell', style: 'arp', max: 2, top: 16, reg: 6, span: 24, gear: 0, low: 'sub', bassEvery: 1 / 2, harm: 2, pad: 0.5, padCut: 0.3, breathe: 0.1, drone: 0, delay: 0.35, verb: 0.42, gate: 2, bright: 0.38 },
  checks:  { prog: ['vi', 'IV', 'vi', 'V', 'iii', 'IV'], main: 'stab', style: 'chord', max: 3, top: 16, reg: 0, span: 19, gear: 0, low: 'bass', bassEvery: 1 / 16, harm: 1, pad: 0.34, padCut: 0.28, breathe: 0.05, drone: 0, delay: 0.2, verb: 0.15, gate: 0.65, bright: 0.5 },
  rooms:   { prog: ['iii', 'vi', 'iii', 'I'], main: 'pulse', style: 'arp', max: 1, top: 16, reg: -7, span: 17, gear: 0, low: 'bass', bassEvery: 1 / 8, harm: 2, pad: 0.7, padCut: 0.16, breathe: 0.18, drone: 0.6, delay: 0.3, verb: 0.34, gate: 0.7, bright: 0.22 },
  poles:   { prog: ['IVL', 'V', 'ii', 'I'], main: 'analog', style: 'arp', dir: 1, max: 2, reg: 2, span: 29, gear: 0, low: 'bass', bassEvery: 1 / 4, harm: 2, pad: 0.55, padCut: 0.38, breathe: 0.1, drone: 0, delay: 0.32, verb: 0.24, gate: 0.9, bright: 0.6 },
  voids:   { prog: ['iiQ', 'viQ', 'iiiQ', 'viQ'], main: 'bell', style: 'sparse', keep: 0.3, max: 1, top: 16, reg: 0, span: 36, gear: -1, low: 'sub', bassEvery: 1, harm: 3, pad: 0.8, padCut: 0.24, breathe: 0.2, drone: 0.2, delay: 0.5, verb: 0.75, gate: 3, bright: 0.3 },
  bodies:  { prog: ['vi', 'IV', 'ii', 'vi'], main: 'swell', style: 'sparse', keep: 0.35, max: 1, top: 8, reg: -5, span: 24, gear: -1, low: 'sub', bassEvery: 1 / 2, harm: 3, pad: 0.7, padCut: 0.2, breathe: 0.3, drone: 0.85, delay: 0.2, verb: 0.5, gate: 5, bright: 0.25 },
  waves:   { prog: ['V', 'ii', 'vi', 'I'], main: 'pluck', style: 'sparse', keep: 0.45, max: 2, top: 16, reg: 0, span: 24, gear: 0, low: 'sub', bassEvery: 1 / 2, harm: 2, pad: 1, padCut: 0.34, breathe: 0.7, drone: 0.15, delay: 0.42, verb: 0.45, gate: 1.6, bright: 0.35 },
};
// the pattern files call some of these by their singular
FAMILY.body = FAMILY.bodies; FAMILY.check = FAMILY.checks; FAMILY.pole = FAMILY.poles; FAMILY.void = FAMILY.voids; FAMILY.room = FAMILY.rooms; FAMILY.wave = FAMILY.waves; FAMILY.dot = FAMILY.dots;
export const familyOf = pat => FAMILY[pat?.family] || FAMILY.lines;

export class Key {
  constructor(tonic) {
    this.tonic = tonic;                               // pitch class of the signature's root
    this.pcs = IONIAN.map(s => (tonic + s) % 12);     // the seven
  }
  pc(deg) { return this.pcs[((deg % 7) + 7) % 7]; }
  inKey(midi) { return this.pcs.includes(((midi % 12) + 12) % 12); }
  chord(name) {
    const c = CHORDS[name] || CHORDS.ii;
    return { name, root: this.pc(c.root), tones: c.tones.map(d => this.pc(d)), ladder: c.ladder.map(d => this.pc(d)) };
  }
}

// Every midi note with one of these pitch classes between lo and hi
export function within(pcs, lo, hi) {
  const out = [];
  for (let m = Math.ceil(lo); m <= hi; m++) if (pcs.includes(((m % 12) + 12) % 12)) out.push(m);
  return out;
}

// Voice leading: of all the ways to lay these four pitch classes out in the pad's range, the one where the fewest fingers move,
// without muddy close intervals low down.
export function voiceLead(prev, tones, lo = 47, hi = 74) {
  const options = tones.map(pc => within([pc], lo, hi));
  let best = null, bestCost = 1e9;
  const pick = [0, 0, 0, 0];
  const walk = i => {
    if (i < 4) { for (const m of options[i % options.length]) { pick[i] = m; walk(i + 1); } return; }
    const s = [...pick].sort((a, b) => a - b);
    let cost = 0;
    for (let k = 0; k < 4; k++) { const d = Math.abs(s[k] - prev[k]); cost += d + Math.max(0, d - 4) * 3; }
    for (let k = 0; k < 3; k++) { const d = s[k + 1] - s[k]; if (d < 2) cost += 30; else if (d < 3 && s[k] < 60) cost += 8; }
    if (s[3] - s[0] > 22) cost += 6;
    if (s[3] - s[0] < 9) cost += 5;
    if (cost < bestCost) { bestCost = cost; best = s; }
  };
  walk(0);
  return best;
}
