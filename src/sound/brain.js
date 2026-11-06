// The musician. It looks at the picture a frame at a time and decides what to play next. The picture is a piano roll: a read line crosses
// the small copy once per cycle of the picture's own clock, columns are time and rows are pitch, so a pattern that returns to itself
// plays a phrase that returns to itself, and a pattern that bends plays a phrase that bends.
//
// Nothing here touches the clock. It only follows phi, and sets notes a moment ahead of when they're due.
import { rng, clamp, lerp, smoother } from '../score/curves.js';
import { FAMILY, familyOf, Key, within, voiceLead } from './theory.js';

const LOOKAHEAD = 0.2;      // seconds ahead that notes are set. Must be longer than the worst frame.
const BASS_ROWS = 5;        // the bottom of the picture is the bottom of the band
const TONICS = [0, 2, 3, 5, 7, 8, 10];   // signature roots that put the low notes where a bass likes them

const hash = (a, b = 0) => { let h = (a * 73856093) ^ (b * 19349663); h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return (h >>> 0) / 4294967296; };

function flowOf(pat) {
  const fl = pat?.flow;
  let sum = 0, mag = 0, up = false, down = false;
  if (fl) for (const k in fl) {
    const v = fl[k], ph = k.endsWith('.ph') && k[0] === 'f';
    if (!v) continue;
    if (ph) mag = Math.max(mag, Math.abs(v));
    sum += Math.sign(v);
    if (v > 0) up = true; else down = true;
  }
  return { mag: mag || 1, dir: sum === 0 && up ? 0 : Math.sign(sum) || 1, both: up && down };
}

// Where a walk through L notes has got to after i notes. Flows that oppose each other go up and back.
function walk(i, L, dir, both) {
  if (L <= 1) return 0;
  if (both || dir === 0) { const p = 2 * L - 2, w = i % p; return w < L ? w : p - w; }
  return dir < 0 ? L - 1 - (i % L) : i % L;
}

export class Brain {
  constructor(synth, seed = 1) {
    this.synth = synth;
    this.rand = rng(seed + 31);
    this.seed = seed;
    this.key = new Key(TONICS[(seed >>> 0) % TONICS.length]);
    this.log = [];
    this.logging = true;
    this.lastNow = null;
    this.track = [];
    this.still = 0;
    this.rate = 0;
    this.mPhi = 0;
    this.S = 16;
    this.next = null;
    this.k = 4;
    this.center = 62;
    this.ladderKey = '';
    this.pad = [52, 57, 60, 64];
    this.pat = null;
    this.progI = 0;
    this.chord = null;
    this.morphTo = null;
    this.moved = 0;
    this.nextChord = null;
    this.nextPad = null;
    this.bassChord = null;
    this.harmN = null;
    this.walked = 0;
    this.lastMain = -1;
    this.lastNote = null;
    this.arpDir = 1;
    this.repeats = 0;
    this.seenRipples = new WeakSet();
    this.smooth = { press: 0, bright: 0.5, white: 0.5, sheet: 0, cut: 400 };
    this.lastCtl = -1;
    this.stall = 0;
    this.started = false;
  }

  // ---------------------------------------------------------------- one frame
  frame(now, F) {
    if (!this.started) this._begin(now, F);
    const prev = this.lastNow;
    const dt = prev == null ? 0 : now - prev;
    // The context's clock moves in blocks, so wait until a little time has really passed before believing a rate.
    if (prev == null) { this.lastNow = now; this.lastPhi = F.phi; this.mPhi = F.phi; return; }
    if (dt < 0.012) return;
    const moved = F.phi !== this.lastPhi;
    this.lastNow = now; this.lastPhi = F.phi;
    if (dt > 1) { this.rate = 0; this.mPhi = F.phi; this.next = null; this.track.length = 0; return; }     // a gap: the tab was away
    // The tempo is read over the last second or so, not frame to frame, and it moves slowly, so a rough frame can't reach the notes.
    this.still = moved ? 0 : this.still + dt;
    const tr = this.track;
    tr.push(now, F.phi);
    while (tr.length > 4 && now - tr[2] > 1.2) tr.splice(0, 2);
    if (this.still > 0.12) { this.rate = 0; tr.length = 0; }     // it has stopped: paused, and the notes stop with it
    else if (tr.length >= 4 && now - tr[0] > 0.2) {
      const raw = (F.phi - tr[1]) / (now - tr[0]);
      this.rate = this.rate === 0 ? raw : this.rate + (raw - this.rate) * (1 - Math.exp(-dt / 0.5));
    }
    this._controls(now, F, dt);
    if (this.rate < 1e-3) {
      this.stall += dt;
      this.mPhi = F.phi; this.next = null;
      return;
    }
    this.stall = 0;
    // A slow phase-lock onto the picture's clock, so the notes don't pick up the frame jitter
    this.mPhi += this.rate * dt;
    const err = F.phi - this.mPhi, off = Math.abs(err) * this.S;
    if (off > 3) { this.mPhi = F.phi; this.next = null; }
    else this.mPhi += err * (1 - Math.exp(-dt / (off < 0.5 ? 3 : 0.6)));
    if (this.next == null) { this.next = Math.floor(this.mPhi * this.S) + 1; }
    for (let guard = 0; guard < 8; guard++) {
      const due = now + (this.next / this.S - this.mPhi) / this.rate;
      if (due > now + LOOKAHEAD) break;
      this._step(this.next, this.S, Math.max(due, now + 0.004), F);
      this.next++;
      this._gear(F);
    }
  }

  _begin(now, F) {
    this.started = true;
    const fam = familyOf(F.A);
    this.pat = F.A;
    this.fam = fam;
    this.progI = this._home(F.A, fam);
    this.chord = this.key.chord(fam.prog[this.progI]);
    this.bassChord = this.chord;
    this.pad = voiceLead(this.pad, this.chord.tones);
    this.pad.forEach((m, i) => this.synth.padVoice(i, m, now, 0.05));
    this.synth.droneNote(this._lowRoot(this.chord), now, 0.05);
    this.k = Math.max(F.tv / 2, F.th / 2 * (F.H / F.W), 0.5);
  }

  _home(pat, fam) { return Math.floor(hash(this._idHash(pat.id), 7) * fam.prog.length); }
  _idHash(id) { let h = 7; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0; return h; }
  _lowRoot(chord) { const r = chord.root; let m = 36 + ((r - 36 % 12 + 12) % 12); if (m > 43) m -= 12; return m; }

  // How big the shapes are, how fast the picture is moving: how fast the notes come.
  _wantedS(F, fam) {
    const flow = flowOf(F.A);
    let gear = this.k < 2 ? 8 : this.k < 6 ? 16 : 32;
    // Upright stripes turn every other step into a rest, so they need twice the steps to play the same number of notes.
    if (F.th / 2 * (F.H / F.W) > 2 * F.tv / 2 && gear < 32) gear *= 2;
    if (flow.mag >= 2) gear *= 2;
    if (fam.gear > 0) gear *= 2; if (fam.gear < 0) gear = Math.max(4, gear / 2);
    if (fam.top) gear = Math.min(gear, fam.top);
    // The flow knob, calm, the song's own speed: the clock itself can run fast or slow, and the gear keeps it playable.
    const r = Math.max(this.rate, 1e-3);
    while (gear * r > 7.2 && gear > 4) gear /= 2;
    while (gear * r < 1.1 && gear < 64) gear *= 2;
    return gear;
  }

  _gear(F) {
    // Only on a beat, so the grid never lurches
    const n = this.next;
    if (n % (this.S / 4) !== 0) return;
    const want = this._wantedS(F, this.fam || FAMILY.lines);
    if (want === this.S) return;
    const phase = n / this.S;
    this.S = want;
    this.next = Math.round(phase * want);
  }

  // ---------------------------------------------------------------- what's slowly changing, every frame
  _controls(now, F, dt) {
    const sm = this.smooth, ease = tau => 1 - Math.exp(-dt / tau);
    // element size, seen in the picture: edges per column and per row, as cycles per picture height
    const k = clamp(Math.max(F.tv / 2, F.th / 2 * (F.H / F.W)), 0.5, 18);
    this.k += (k - this.k) * ease(0.8);
    sm.press += (F.press - sm.press) * ease(0.12);
    sm.white += (F.white - sm.white) * ease(0.5);
    sm.sheet = F.sheet;

    const a = familyOf(F.A), b = F.B ? familyOf(F.B) : a, T = F.T;
    const mix = n => lerp(a[n], b[n], T);
    this.fam = T > 0.5 ? b : a;
    // bigger shapes lower, finer shapes higher, and the hand's zoom sweeps it straight away
    const center = lerp(48, 76, clamp((Math.log2(this.k) + 0.3) / 3.8)) + mix('reg') - clamp(F.journey, -3, 3) * 3.5;
    this.center += (center - this.center) * ease(1.2);
    this.span = mix('span');

    const breathe = Math.sin(this.lastPhi * Math.PI * 2 * 0.5) * mix('breathe');
    // white opens it, the press opens it a lot, the long slow swell of the whole thing underneath
    const open = Math.exp(1.1 * (sm.white - 0.5) + 1.2 * sm.press + breathe * 1.1);
    const cut = (260 + 1500 * mix('padCut') * mix('padCut') * 2.2) * open;
    sm.bright = clamp(mix('bright') + 0.5 * (sm.white - 0.5) + 0.45 * sm.press);
    const energy = 0.86 + 0.14 * Math.sin(this.lastPhi * Math.PI * 2 / 13);
    this.energy = energy;
    const stepsDelay = 3 / 32 / Math.max(this.rate, 0.02);
    const moire = F.sheet * clamp(2.5 + Math.abs(F.sheetRot) * 90, 0, 11);    // a beat, not a sour note
    this.moire = moire;

    if (now - this.lastCtl > 0.05) {
      this.lastCtl = now;
      const main = T > 0.5 ? b.main : a.main;
      const sends = {};
      for (const f of [a, b]) sends[f.main] = { delay: mix('delay') * (f === (T > 0.5 ? b : a) ? 1 : 0.6), verb: mix('verb') };
      sends.ping = { delay: 0.5, verb: 0.6 };
      if (!this.lastDelay || Math.abs(stepsDelay / this.lastDelay - 1) > 0.05) this.lastDelay = stepsDelay;
      this.synth.controls(now, {
        padCut: cut, padLevel: mix('pad') * 0.8 * (this.stall > 0.5 ? 0.45 : 1) * lerp(0.9, 1.05, energy), padVerb: 0.14 + mix('verb') * 0.5,
        drone: mix('drone') * 0.34 * (this.stall > 0.5 ? 0.4 : 1), moire, delay: this.lastDelay, feedback: 0.3 + mix('delay') * 0.28, sends,
      });
      this.main = main;
    }

    // Ripples are drops: each new one rings once, at the height it fell.
    if (F.ripples) {
      for (const r of F.ripples) {
        if (typeof r !== 'object' || this.seenRipples.has(r)) continue;
        this.seenRipples.add(r);
        if (r.radius > 0.25) continue;     // already spreading when it was first seen
        const lad = this._ladder();
        const y = clamp((r.y + 1) / 2);
        let m = lad[Math.round(y * (lad.length - 1))] + 12;
        while (m > 86) m -= 12;
        while (m < 60) m += 12;
        this._play({ voice: 'ping', midi: m, t: now + 0.01, vel: clamp(0.5 + Math.abs(r.height || 0) * 0.4, 0.3, 0.9), dur: 0.6, pan: clamp(r.x / 1.7, -0.8, 0.8), bright: 0.5 }, 'ripple');
      }
    }
    this.pw = clamp(sm.white, 0.14, 0.5);
    this.gateK = Math.pow(2, -1.7 * clamp(F.theta, -0.9, 0.9));
    this._harmony(now, F);
  }

  // ---------------------------------------------------------------- the chord
  _harmony(now, F) {
    const fam = familyOf(F.A), T = F.T;
    if (F.B) {
      if (this.morphTo !== F.B) {
        // A new pattern is on its way, and it brings its chord. The nearest voicing of that chord, ready to move into.
        this.morphTo = F.B;
        const nf = familyOf(F.B);
        this.nextProg = this._home(F.B, nf);
        this.nextChord = this.key.chord(nf.prog[this.nextProg]);
        if (this.nextChord.name === this.chord.name) { this.nextProg = (this.nextProg + 1) % nf.prog.length; this.nextChord = this.key.chord(nf.prog[this.nextProg]); }
        this.nextPad = voiceLead(this.pad, this.nextChord.tones);
        this.moved = 0;
        this.order = [0, 1, 2, 3].sort((p, q) => Math.abs(this.nextPad[p] - this.pad[p]) - Math.abs(this.nextPad[q] - this.pad[q]));
      }
      // One finger at a time as the patterns become each other
      while (this.moved < 4 && T > (this.moved + 1) / 5.2) {
        const i = this.order[this.moved++];
        this.synth.padVoice(i, this.nextPad[i], now, 1.6);
        this._padLog(now, i, this.pad[i], this.nextPad[i], F);
        this.pad[i] = this.nextPad[i];
      }
      if (T >= 0.5 && this.chord !== this.nextChord) { this.chord = this.nextChord; this.progI = this.nextProg; this.pat = F.B; }
      return;
    }
    if (this.morphTo) {
      if (this.moved < 4) for (; this.moved < 4; this.moved++) { const i = this.order[this.moved]; this.synth.padVoice(i, this.nextPad[i], now, 1); this._padLog(now, i, this.pad[i], this.nextPad[i], F); this.pad[i] = this.nextPad[i]; }
      if (this.chord !== this.nextChord) { this.chord = this.nextChord; this.progI = this.nextProg; }
      this.morphTo = null; this.pat = F.A;
    }
    if (this.pat !== F.A) {
      // Arrived without a morph
      this.pat = F.A;
      this.progI = this._home(F.A, fam);
      this._change(this.key.chord(fam.prog[this.progI]), now);
    }
  }

  _change(chord, t) {
    this.chord = chord;
    const v = voiceLead(this.pad, chord.tones);
    v.forEach((m, i) => { if (m !== this.pad[i]) { this.synth.padVoice(i, m, t + i * 0.09, 0.9); this._padLog(t + i * 0.09, i, this.pad[i], m); } });
    this.pad = v;
  }

  _ladder() {
    const lo = Math.round(this.center - this.span / 2), hi = lo + Math.round(this.span);
    const key = this.chord.name + lo + ':' + hi;
    if (key !== this.ladderKey) {
      this.ladderKey = key;
      this.lad = within(this.chord.ladder, clamp(lo, 40, 72), clamp(hi, 55, 88));
    }
    return this.lad;
  }

  // ---------------------------------------------------------------- one step of the read line
  _step(n, S, t, F) {
    const phase = n / S;
    if (n % S === 0) this.walked = 0;     // the walk starts again with the phrase, so a pattern that returns plays the same phrase
    const beatN = S / 8, barN = S / 2;
    const onBeat = n % Math.max(1, Math.round(beatN)) === 0, onBar = n % Math.max(1, Math.round(barN)) === 0;
    const stepDur = 1 / (S * this.rate);
    // the chord clock: only when nothing's morphing. A held pattern still goes somewhere.
    const fam0 = familyOf(F.A);
    if (!F.B && !this.morphTo && onBar) {
      const h = Math.floor(phase / fam0.harm + 1e-6);
      if (this.harmN == null) this.harmN = h;
      if (h !== this.harmN) {
        this.harmN = h;
        this.progI = (this.progI + 1) % fam0.prog.length;
        this._change(this.key.chord(fam0.prog[this.progI]), t);
      }
    }
    if (onBar && this.bassChord !== this.chord) {
      this.bassChord = this.chord;
      this.synth.droneNote(this._lowRoot(this.chord), t, 1.4);
    }

    // Which band this step belongs to. In a morph, more and more of the new one.
    const useB = F.B && hash(n, 91) < F.T;
    const fam = useB ? familyOf(F.B) : fam0;
    const flow = flowOf(useB ? F.B : F.A);

    // the read line: once across per cycle of the picture's clock, the way the flow goes
    const dirSign = flow.dir < 0 ? -1 : 1;
    const x = ((phase % 1) + 1) % 1, u = dirSign < 0 ? 1 - x : x;
    const col = Math.min(F.W - 1, Math.floor(u * F.W));
    const pan = (u * 2 - 1) * 0.55;
    const { grid, W, H } = F;
    const rows = H - BASS_ROWS;

    // White runs going up the column: each is one note, at its middle, however fat it is
    const runs = [];
    let start = -1;
    for (let y = BASS_ROWS; y <= H; y++) {
      const w = y < H && grid[y * W + col] > 127;
      if (w && start < 0) start = y;
      if (!w && start >= 0) { runs.push({ c: (start + y - 1) / 2, len: y - start }); start = -1; }
    }
    const sig = runs.map(r => r.c).join();

    const lad = this._ladder();
    const toMidi = c => lad[clamp(Math.round((c - BASS_ROWS) / (rows - 1) * (lad.length - 1)), 0, lad.length - 1)];
    const chordLad = within(this.chord.tones.slice(0, 3), lad[0], lad[lad.length - 1]);
    const longest = runs.reduce((m, r) => Math.max(m, r.len), 0);

    let cands;
    if (longest > rows * 0.62 && chordLad.length) {
      // A whole column of white says nothing about pitch. It's an upright stripe, and it walks the chord.
      const L = chordLad.length;
      cands = [{ midi: chordLad[walk(this.walked++, L, fam.dir ?? flow.dir, flow.both)], len: longest, strong: true }];
    } else {
      const seen = new Set();
      cands = [];
      for (const r of runs) {
        const midi = toMidi(r.c);
        if (midi == null || seen.has(midi)) continue;
        seen.add(midi);
        cands.push({ midi, len: r.len });
      }
    }

    const notes = this._choose(cands, fam, flow, n, S, onBeat, onBar, sig);
    this.lastSig = sig;
    const gate = fam.gate * this.gateK;
    const bright = this.smooth.bright;
    const pw = this.pw;
    for (const c of notes) {
      let midi = c.midi;
      // The strong beats land on the chord; what's between them may pass through the rest of the ladder
      if (onBar || (onBeat && S > 8)) midi = this._nearestTone(midi);
      const vel = clamp((onBar ? 0.92 : onBeat ? 0.8 : 0.66) * (0.72 + Math.min(c.len, 10) * 0.04) * this.energy * (0.94 + 0.12 * this.rand()), 0.25, 1);
      const dur = clamp(stepDur * gate * (0.85 + Math.min(c.len, 12) * 0.04), 0.05, fam.main === 'swell' ? 5 : 2.2);
      const tn = t + (this.rand() - 0.5) * 0.003;
      const base = { voice: fam.main, midi, t: tn, vel, dur, pan, bright, pw };
      if (this.moire > 0.5) {
        this._play({ ...base, cents: this.moire, vel: vel * 0.78 }, 'main', phase, S, F);
        this._play({ ...base, cents: -this.moire, vel: vel * 0.78 }, 'main', phase, S, F);
      } else this._play(base, 'main', phase, S, F);
    }
    this.lastMain = notes.length ? notes[0].midi : -1;
    if (notes.length) this.lastNote = notes[0].midi;

    // The bottom of the picture is the bass
    const every = Math.max(1, Math.round(fam.bassEvery * S));
    if (n % every === 0) {
      let sum = 0, top = 0;
      for (let y = 0; y < BASS_ROWS; y++) { const w = grid[y * W + col] > 127; if (w) { sum++; top = y; } }
      const held = fam.bassEvery >= 1 / 4;
      if (sum > 0 || (held && (onBar || fam.bassEvery >= 1 / 2))) {
        const root = this._lowRoot(this.bassChord);
        const figure = fam.bassEvery < 1 / 4 ? [0, 0, 12, 0, 7, 0, 10, 7] : [0, 0, 7, 0];
        let off = figure[Math.abs(Math.round(n / every) + (top % 2 ? 4 : 0)) % figure.length];
        // Only intervals that are in the key: the fifth or flat seven might not be
        if (!this.key.inKey(root + off)) off = 0;
        const dur = clamp(stepDur * every * (fam.low === 'sub' ? 1.05 : 0.8) * Math.sqrt(this.gateK), 0.08, 3.5);
        const voice = useB ? familyOf(F.B).low : fam0.low;
        this._play({ voice, midi: root + off, t, vel: clamp((onBar ? 0.9 : 0.72) * this.energy, 0.2, 1), dur, bright, low: true }, 'low', phase, S, F);
      }
    }
  }

  _nearestTone(m) {
    const tones = this.chord.tones.slice(0, 3);
    for (let d = 0; d < 6; d++) for (const s of [-1, 1]) if (tones.includes((((m + s * d) % 12) + 12) % 12)) return m + s * d;
    return m;
  }

  _nearOctave(m, near, reach) { while (m - near > reach) m -= 12; while (near - m > reach) m += 12; return m; }

  // Thin what the read line found down to a few notes, the way this family plays them.
  _choose(cands, fam, flow, n, S, onBeat, onBar, sig) {
    if (!cands.length) return [];
    cands.sort((a, b) => a.midi - b.midi);
    const max = fam.max;
    const spaced = list => {
      const out = [];
      for (const c of list) { if (out.every(o => Math.abs(o.midi - c.midi) >= 3)) out.push(c); if (out.length >= max) break; }
      return out;
    };
    if (fam.style === 'chord') {
      // Only when the column changes, or as a soft pulse on the beat. Checks alternate, so this alternates.
      if (sig === this.lastSig && !onBeat) return [];
      const bylen = [...cands].sort((a, b) => b.len - a.len);
      return spaced(bylen);
    }
    if (fam.style === 'sparse') {
      const loop = n % (S * 2);
      const speak = fam.keep * (onBeat ? 1.5 : 0.75) * this.energy * Math.min(1, 0.45 + 0.2 * cands.length);
      if (hash(loop, 3) > speak) return [];
      const start = Math.floor(hash(loop, 5) * cands.length);
      const said = spaced([...cands.slice(start), ...cands.slice(0, start)]);
      if (said.length && this.lastNote != null) said[0] = { ...said[0], midi: this._nearOctave(said[0].midi, this.lastNote, 9) };
      return said;
    }
    // arp: one per step, moving through what's there the way a hand does: to the nearest note on the way it's going, turning at the top and the
    // bottom. With nothing near, whatever the walk lands on comes by the nearest octave. So it's a line, not a scatter, and the picture still says which notes.
    let first = cands[walk(this.walked++, cands.length, fam.dir ?? flow.dir, flow.both)];
    const last = this.lastNote;
    if (last != null) {
      const above = cands.find(c => c.midi > last && c.midi - last <= 7);
      let below = null; for (const c of cands) if (c.midi < last && last - c.midi <= 7) below = c;
      const step = this.arpDir > 0 ? above ?? below : below ?? above;
      if (step) { this.arpDir = step === above ? 1 : -1; first = step; }
      else first = { ...first, midi: this._nearOctave(first.midi, last, 6) };
    }
    // Don't hammer one note
    if (first.midi === this.lastMain) { this.repeats++; if (this.repeats > 1 && !onBeat) { this.repeats = 0; return []; } } else this.repeats = 0;
    const out = [first];
    if (onBeat && max > 1 && (S > 8 || onBar)) for (const c of cands) { if (Math.abs(c.midi - first.midi) >= 5 && out.length < max) out.push(c); }
    return out;
  }

  _padLog(t, i, from, to, F) {
    if (this.logging) this.log.push({ t: +t.toFixed(3), m: to, from, v: 'pad', i, vel: 0, d: 0, r: 'pad', c: this.nextChord?.name ?? this.chord.name, pat: F?.A?.id ?? null });
  }

  _play(note, role, phase, S, F) {
    const ok = this.synth.note(note);
    if (ok && this.logging) {
      this.log.push({ t: +note.t.toFixed(3), m: note.midi, v: note.voice, vel: +note.vel.toFixed(2), d: +(note.dur || 0).toFixed(3), r: role, cents: note.cents || 0, bright: +(note.bright ?? 0).toFixed(2), S, ph: phase == null ? null : +phase.toFixed(3), c: this.chord.name, pat: F ? (F.A?.id) : null });
      if (this.log.length > 20000) this.log.splice(0, 5000);
    }
    return ok;
  }
}
