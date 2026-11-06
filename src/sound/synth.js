// The instruments. Only Web Audio, no samples. Everything is built on whatever context it's given, so the same graph runs live and
// through an OfflineAudioContext for measuring. Every note is scheduled ahead at an exact time and cleans up after itself.
//
//   voices -> mix -> saturation -> tone -> glue -> limiter -> ceiling -> fade -> volume -> out
//   voices -> delay (ping-pong, in time with the flow), reverb (a made-up room) -> tone
import { rng, clamp } from '../score/curves.js';

export const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

const curve = (fn, n = 2049) => { const c = new Float32Array(n); for (let i = 0; i < n; i++) c[i] = fn(i / (n - 1) * 2 - 1); return c; };
const MAX_LIVE = 30;

// A band-limited pulse of a given width. The browser takes harmonics away as the pitch goes up, so there's no aliasing.
function pulseWave(ctx, d) {
  const N = 48, re = new Float32Array(N), im = new Float32Array(N);
  for (let n = 1; n < N; n++) re[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * d);
  return ctx.createPeriodicWave(re, im);
}

// A generated hall: decaying noise that darkens as it goes, a little different in each ear.
function impulse(ctx, seconds, seed) {
  const sr = ctx.sampleRate, n = Math.floor(seconds * sr), b = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const r = rng(seed + ch * 101), d = b.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, u = t / seconds;
      const env = Math.pow(1 - u, 1.6) * Math.exp(-t * 2.3) * Math.min(1, t / 0.012);
      const a = 0.42 * Math.exp(-t * 1.5) + 0.035;     // the one-pole closes with time: the tail is dark
      lp += a * ((r() * 2 - 1) - lp);
      d[i] = lp * env;
    }
  }
  return b;
}

export class Synth {
  constructor(ctx, seed = 1) {
    this.ctx = ctx;
    this.ends = [];
    const G = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const BQ = (type, f, q = 0.707, gain = 0) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gain; return b; };
    this.G = G; this.BQ = BQ;

    // ---------------------------------------------------------- the end of the chain
    this.mix = G(0.6);     // the saturation's own small-signal gain is 1.66, so unity through it, and it only colours what's loud
    const sat = ctx.createWaveShaper();
    sat.curve = curve(x => Math.tanh(x * 1.5) / Math.tanh(1.5));
    sat.oversample = '2x';
    const shelf = BQ('highshelf', 5200, 0.707, -5), top = BQ('lowpass', 11500, 0.5), floor = BQ('highpass', 26, 0.6);
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -14; glue.knee.value = 10; glue.ratio.value = 2; glue.attack.value = 0.025; glue.release.value = 0.3;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.14;
    const trim = G(0.5);   // takes off the make-up gain both compressors add, so a quiet passage stays quiet
    const ceil = ctx.createWaveShaper();
    ceil.curve = curve(x => 0.94 * Math.tanh(x * 1.25) / Math.tanh(1.25));
    this.fade = G(0);
    this.volume = G(1);
    this.wet = G(1);
    this.mix.connect(sat); sat.connect(shelf);
    this.wet.connect(shelf);
    shelf.connect(top); top.connect(floor); floor.connect(glue); glue.connect(lim); lim.connect(trim); trim.connect(ceil); ceil.connect(this.fade); this.fade.connect(this.volume);
    this.output = this.volume;
    this.analyser = null;

    // ---------------------------------------------------------- delay: ping-pong, darkened on every repeat, always in time
    this.delayIn = G(1);
    const dHP = BQ('highpass', 220, 0.6), dL = ctx.createDelay(2.5), dR = ctx.createDelay(2.5);
    const fbL = G(0.42), fbR = G(0.42), lpL = BQ('lowpass', 2900, 0.5), lpR = BQ('lowpass', 2300, 0.5);
    const merge = ctx.createChannelMerger(2);
    dL.delayTime.value = 0.59; dR.delayTime.value = 0.59;
    this.delayOut = G(0.8);
    this.delayIn.connect(dHP); dHP.connect(dL);
    dL.connect(lpL); lpL.connect(fbL); fbL.connect(dR);
    dR.connect(lpR); lpR.connect(fbR); fbR.connect(dL);
    dL.connect(merge, 0, 0); dR.connect(merge, 0, 1);
    merge.connect(this.delayOut); this.delayOut.connect(this.wet);
    this.dL = dL; this.dR = dR; this.fbs = [fbL, fbR];

    // ---------------------------------------------------------- reverb
    this.verbIn = G(1);
    const pre = ctx.createDelay(0.2); pre.delayTime.value = 0.024;
    const vHP = BQ('highpass', 170, 0.6), vLP = BQ('lowpass', 5200, 0.5);
    const conv = ctx.createConvolver();
    conv.buffer = impulse(ctx, 4.6, seed + 17);
    this.verbOut = G(1.1);
    this.verbIn.connect(pre); pre.connect(vHP); vHP.connect(vLP); vLP.connect(conv); conv.connect(this.verbOut); this.verbOut.connect(this.wet);
    const dv = G(0.18); this.delayOut.connect(dv); dv.connect(this.verbIn);

    // ---------------------------------------------------------- one shared bus per kind of voice, with its own sends
    this.bus = {};
    const arpHP = BQ('highpass', 95, 0.6);
    this.arpTrim = G(1.2);
    arpHP.connect(this.arpTrim); this.arpTrim.connect(this.mix);
    this.arpBus = arpHP;
    for (const [name, trimV] of Object.entries({ glass: 1, bell: 1, pluck: 1, analog: 1, stab: 1, pulse: 1, swell: 1, ping: 1 })) {
      const b = G(trimV), d = G(0), v = G(0);
      b.connect(arpHP); b.connect(d); b.connect(v); d.connect(this.delayIn); v.connect(this.verbIn);
      this.bus[name] = { in: b, delay: d, verb: v };
    }
    this.lowBus = G(0.34);
    this.lowBus.connect(this.mix);

    this.pulses = [0.5, 0.4, 0.3, 0.22, 0.14].map(d => ({ d, wave: pulseWave(ctx, d) }));
    this._pad();
  }

  // ---------------------------------------------------------------- the slow pad and the drone: always running, only their levels move
  _pad() {
    const ctx = this.ctx, G = this.G, BQ = this.BQ;
    this.padIn = G(1);
    this.padLP = BQ('lowpass', 600, 0.9);
    this.padLP2 = BQ('lowpass', 1400, 0.6);
    this.padLevel = G(0);
    this.padIn.connect(this.padLP); this.padLP.connect(this.padLP2); this.padLP2.connect(this.padLevel);
    // A slow chorus: two short delays, swept, one to each ear. It's what makes four notes feel like a section.
    const dA = ctx.createDelay(0.05), dB = ctx.createDelay(0.05), merge = ctx.createChannelMerger(2);
    dA.delayTime.value = 0.014; dB.delayTime.value = 0.019;
    const mk = (hz, depth, target) => { const o = ctx.createOscillator(), g = G(depth); o.frequency.value = hz; o.connect(g); g.connect(target); o.start(); };
    mk(0.23, 0.0032, dA.delayTime); mk(0.17, 0.0038, dB.delayTime);
    this.padLevel.connect(dA); this.padLevel.connect(dB);
    dA.connect(merge, 0, 0); dB.connect(merge, 0, 1);
    this.padOut = G(1);
    merge.connect(this.padOut);
    const hp = BQ('highpass', 70, 0.6);
    this.padTrim = G(0.62);
    this.padOut.connect(hp); hp.connect(this.padTrim); this.padTrim.connect(this.mix);
    this.padVerb = G(0.25); this.padOut.connect(this.padVerb); this.padVerb.connect(this.verbIn);
    this.pad = [];
    for (let i = 0; i < 4; i++) {
      const v = { oscs: [], gain: G(0.06) };
      for (const [type, det] of [['sawtooth', -7 - i], ['sawtooth', 7 + i], ['triangle', 0]]) {
        const o = ctx.createOscillator(); o.type = type; o.detune.value = det; o.frequency.value = 220;
        const g = G(type === 'triangle' ? 1.4 : 1);
        o.connect(g); g.connect(v.gain); o.start(); v.oscs.push(o);
      }
      v.gain.connect(this.padIn);
      this.pad.push(v);
    }
    // Drone: a sine for the weight and a triangle a fifth up, closed down low.
    this.droneLevel = G(0);
    this.droneA = ctx.createOscillator(); this.droneA.type = 'sine'; this.droneA.frequency.value = 55;
    this.droneB = ctx.createOscillator(); this.droneB.type = 'triangle'; this.droneB.frequency.value = 82.5;
    const bg = G(0.2), dlp = BQ('lowpass', 420, 0.8);
    this.droneA.connect(this.droneLevel); this.droneB.connect(bg); bg.connect(dlp); dlp.connect(this.droneLevel);
    this.droneLevel.connect(this.lowBus);
    this.droneA.start(); this.droneB.start();
  }

  padVoice(i, midi, t, glide = 0.7) { for (const o of this.pad[i].oscs) o.frequency.setTargetAtTime(mtof(midi), t, glide / 3); }
  droneNote(midi, t, glide = 1.2) {
    this.droneA.frequency.setTargetAtTime(mtof(midi), t, glide / 3);
    this.droneB.frequency.setTargetAtTime(mtof(midi + 7), t, glide / 3);
  }

  // The things that change slowly. Nothing here can jump: each slides over at least a good fraction of a second.
  controls(t, c) {
    const to = (p, v, tau) => p.setTargetAtTime(v, t, tau);
    if (c.padCut != null) { to(this.padLP.frequency, clamp(c.padCut, 90, 4200), 0.18); to(this.padLP2.frequency, clamp(c.padCut * 2.2, 200, 7000), 0.18); }
    if (c.padLevel != null) to(this.padLevel.gain, c.padLevel, 0.5);
    if (c.padVerb != null) to(this.padVerb.gain, c.padVerb, 0.8);
    if (c.drone != null) to(this.droneLevel.gain, c.drone, 0.9);
    if (c.moire != null) for (const v of this.pad) { to(v.oscs[0].detune, -7 - c.moire, 0.2); to(v.oscs[1].detune, 7 + c.moire, 0.2); }
    if (c.delay != null) { const d = clamp(c.delay, 0.09, 1.3); to(this.dL.delayTime, d, 0.25); to(this.dR.delayTime, d * 1.002, 0.25); }
    if (c.feedback != null) for (const f of this.fbs) to(f.gain, clamp(c.feedback, 0, 0.62), 0.5);
    if (c.sends) for (const name in c.sends) {
      const b = this.bus[name], s = c.sends[name];
      if (!b) continue;
      to(b.delay.gain, s.delay, 0.4); to(b.verb.gain, s.verb, 0.4);
    }
  }

  fadeTo(v, t, seconds) {
    const g = this.fade.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(v, t, Math.max(seconds / 3.2, 0.01));
  }

  // ---------------------------------------------------------------- note builders
  _end(oscs, nodes, stopAt) {
    this.ends.push(stopAt);
    for (const o of oscs) o.stop(stopAt);
    oscs[0].onended = () => { for (const n of [...oscs, ...nodes]) { try { n.disconnect(); } catch { /* gone */ } } };
  }

  _out(bus, pan) {
    const out = this.G(0);
    let last = out;
    if (pan && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); out.connect(p); last = p; this._pan = p; } else this._pan = null;
    last.connect(bus);
    return out;
  }

  _osc(type, freq, t, cents = 0) {
    const o = this.ctx.createOscillator();
    if (type.wave) o.setPeriodicWave(type.wave); else o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (cents) o.detune.setValueAtTime(cents, t);
    o.start(t);
    return o;
  }

  // voice, midi, t (seconds, context time), vel 0..1, dur (seconds), pan -1..1, bright 0..1, pw (pulse width), cents
  note({ voice, midi, t, vel = 0.7, dur = 0.3, pan = 0, bright = 0.5, pw = 0.5, cents = 0, low = false }) {
    // How many are still ringing at the moment this one starts
    let live = 0;
    for (let i = this.ends.length - 1; i >= 0; i--) { if (this.ends[i] > t) live++; else this.ends.splice(i, 1); }
    if (live > MAX_LIVE + (low ? 8 : 0)) return false;
    const fn = this['_' + voice];
    if (!fn) return false;
    fn.call(this, { midi, f: mtof(midi), t, vel, dur, pan, bright, pw, cents });
    return true;
  }

  _pulseFor(pw) {
    let best = this.pulses[0];
    for (const p of this.pulses) if (Math.abs(p.d - pw) < Math.abs(best.d - pw)) best = p;
    return best;
  }

  // A warm subtractive voice: a pair of detuned saws and a pulse, into a resonant low-pass with its own envelope.
  _analog({ f, t, vel, dur, pan, bright, pw, cents }, { lvl = 0.17, bus = 'analog', sus = 0.55, a = 0.006, q = 2.6, env = 1 } = {}) {
    const out = this._out(this.bus[bus].in, pan), p = this._pan;
    const A = this._osc('sawtooth', f, t, -6 + cents), B = this._osc('sawtooth', f, t, 6 + cents), C = this._osc(this._pulseFor(pw), f, t, cents);
    const gC = this.G(0.7), lp = this.BQ('lowpass', 1000, q + bright * 2.4);
    A.connect(lp); B.connect(lp); C.connect(gC); gC.connect(lp); lp.connect(out);
    const base = clamp(f * (1.3 + 3.2 * bright), 150, 3400), peak = clamp(base * (1 + env * (0.9 + 2.2 * bright)), 200, 6200);
    lp.frequency.setValueAtTime(peak, t);
    lp.frequency.setTargetAtTime(base, t + 0.003, 0.05 + 0.1 * Math.min(dur, 1));
    const g = out.gain, v = lvl * vel;
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(v, t + a);
    g.setTargetAtTime(v * sus, t + a, 0.14);
    const end = t + a + Math.max(dur, 0.03);
    g.setTargetAtTime(0, end, 0.09);
    this._end([A, B, C], [gC, lp, out, p].filter(Boolean), end + 0.7);
  }

  _stab(n) { this._analog(n, { lvl: 0.1, bus: 'stab', sus: 0.3, a: 0.004, q: 3.2, env: 1.5 }); }
  _pulse(n) { this._analog({ ...n, bright: n.bright * 0.6 }, { lvl: 0.16, bus: 'pulse', sus: 0.4, a: 0.008, q: 3.4, env: 0.7 }); }

  // Glass: a sine with a thin FM edge and a soft octave, gone quickly. For arps over the pad.
  _glass({ f, t, vel, dur, pan, bright, cents }) {
    const out = this._out(this.bus.glass.in, pan), p = this._pan;
    const car = this._osc('sine', f, t, cents), mod = this._osc('sine', f * 3, t, cents), oct = this._osc('sine', f * 4.003, t, cents), tri = this._osc('triangle', f, t, -cents);
    const idx = this.G(0), gO = this.G(0.12), gT = this.G(0.5), body = this.G(1);
    mod.connect(idx); idx.connect(car.frequency);
    car.connect(body); oct.connect(gO); gO.connect(body); tri.connect(gT); gT.connect(body); body.connect(out);
    const I = f * (1.1 + 2.2 * bright) * vel;
    idx.gain.setValueAtTime(I, t);
    idx.gain.setTargetAtTime(I * 0.12, t + 0.002, 0.11);
    gO.gain.setValueAtTime(0.12, t);
    gO.gain.setTargetAtTime(0.01, t + 0.002, 0.16);
    const g = out.gain, v = 0.15 * vel, tau = 0.14 + 0.28 * Math.min(1, dur * 2);
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(v, t + 0.003);
    g.setTargetAtTime(0, t + 0.003, tau);
    this._end([car, mod, oct, tri], [idx, gO, gT, body, out, p].filter(Boolean), t + tau * 7);
  }

  // Bell: FM at a slightly inharmonic ratio, with a slower ringing partial.
  _bell({ f, t, vel, dur, pan, bright, cents }) {
    const out = this._out(this.bus.bell.in, pan), p = this._pan;
    const car = this._osc('sine', f, t, cents), mod = this._osc('sine', f * 3.51, t, cents), hi = this._osc('sine', f * 2, t, cents + 3);
    const idx = this.G(0), gH = this.G(0), body = this.G(1);
    mod.connect(idx); idx.connect(car.frequency); car.connect(body); hi.connect(gH); gH.connect(body); body.connect(out);
    const I = f * (0.8 + 1.8 * bright) * vel;
    idx.gain.setValueAtTime(I, t);
    idx.gain.setTargetAtTime(I * 0.05, t + 0.002, 0.16);
    gH.gain.setValueAtTime(0.16, t);
    gH.gain.setTargetAtTime(0, t, 0.5);
    const g = out.gain, v = 0.15 * vel, tau = 0.45 + 0.5 * Math.min(1.5, dur);
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(v, t + 0.004);
    g.setTargetAtTime(0, t + 0.004, tau);
    this._end([car, mod, hi], [idx, gH, body, out, p].filter(Boolean), t + tau * 7);
  }

  // A soft pluck: a triangle and a little saw through a filter that closes fast.
  _pluck({ f, t, vel, dur, pan, bright, cents }) {
    const out = this._out(this.bus.pluck.in, pan), p = this._pan;
    const A = this._osc('triangle', f, t, cents), B = this._osc('sawtooth', f, t, 5 + cents), gB = this.G(0.55), lp = this.BQ('lowpass', 1000, 1.4);
    A.connect(lp); B.connect(gB); gB.connect(lp); lp.connect(out);
    const base = clamp(f * 1.8, 160, 2600), peak = clamp(f * (5 + 10 * bright), 800, 6500);
    lp.frequency.setValueAtTime(peak, t);
    lp.frequency.setTargetAtTime(base, t + 0.001, 0.085);
    const g = out.gain, v = 0.24 * vel, tau = 0.18 + 0.32 * Math.min(1, dur);
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(v, t + 0.002);
    g.setTargetAtTime(0, t + 0.002, tau);
    this._end([A, B], [gB, lp, out, p].filter(Boolean), t + tau * 7);
  }

  // A swell: slow in, slow out, opening as it comes.
  _swell({ f, t, vel, dur, pan, bright, pw, cents }) {
    const out = this._out(this.bus.swell.in, pan), p = this._pan;
    const A = this._osc('sawtooth', f, t, -8 + cents), B = this._osc('sawtooth', f, t, 8 + cents), C = this._osc('triangle', f, t, cents);
    const lp = this.BQ('lowpass', 300, 1.1);
    A.connect(lp); B.connect(lp); C.connect(lp); lp.connect(out);
    const a = clamp(dur * 0.45, 0.25, 2.6), top = clamp(f * (3 + 6 * bright), 300, 3200);
    lp.frequency.setValueAtTime(clamp(f * 0.9, 120, 800), t);
    lp.frequency.linearRampToValueAtTime(top, t + a);
    lp.frequency.setTargetAtTime(clamp(f, 120, 900), t + a, dur * 0.3 + 0.2);
    const g = out.gain, v = 0.085 * vel, rel = dur * 0.25 + 0.3;
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(v, t + a);
    g.setTargetAtTime(0, t + a, rel);
    this._end([A, B, C], [lp, out, p].filter(Boolean), t + a + rel * 6);
  }

  // A drop: a sine that falls onto its note, with a soft FM tick. What a ripple sounds like.
  _ping({ f, t, vel, pan, bright, cents }) {
    const out = this._out(this.bus.ping.in, pan), p = this._pan;
    const car = this._osc('sine', f, t, cents), mod = this._osc('sine', f * 2, t, cents), idx = this.G(0);
    mod.connect(idx); idx.connect(car.frequency); car.connect(out);
    car.frequency.setValueAtTime(f * 1.5, t);
    car.frequency.setTargetAtTime(f, t, 0.018);
    idx.gain.setValueAtTime(f * (0.5 + bright), t);
    idx.gain.setTargetAtTime(0, t, 0.05);
    const g = out.gain, v = 0.2 * vel, tau = 0.32;
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(v, t + 0.003);
    g.setTargetAtTime(0, t + 0.003, tau);
    this._end([car, mod], [idx, out, p].filter(Boolean), t + tau * 7);
  }

  // Bass: a triangle with a sine under it and a little saw for edge, always in the middle.
  _bass({ f, t, vel, dur, bright }) {
    const out = this.G(0);
    out.connect(this.lowBus);
    const A = this._osc('triangle', f, t), B = this._osc('sine', f, t), C = this._osc('sawtooth', f, t, 4);
    const gC = this.G(0.22), lp = this.BQ('lowpass', 400, 1.4);
    A.connect(lp); B.connect(lp); C.connect(gC); gC.connect(lp); lp.connect(out);
    const base = clamp(f * (2 + 3 * bright), 90, 700), peak = clamp(base * 2.2, 200, 1400);
    lp.frequency.setValueAtTime(peak, t);
    lp.frequency.setTargetAtTime(base, t + 0.002, 0.08);
    const g = out.gain, v = 0.3 * vel;
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(v, t + 0.008);
    g.setTargetAtTime(v * 0.72, t + 0.008, 0.2);
    const end = t + 0.008 + Math.max(dur, 0.05);
    g.setTargetAtTime(0, end, 0.07);
    this._end([A, B, C], [gC, lp, out], end + 0.5);
  }

  // Sub: nothing but weight.
  _sub({ f, t, vel, dur }) {
    const out = this.G(0);
    out.connect(this.lowBus);
    const A = this._osc('sine', f, t), B = this._osc('triangle', f * 2, t), gB = this.G(0.16);
    A.connect(out); B.connect(gB); gB.connect(out);     // the octave is what lets it be heard on small speakers
    const g = out.gain, v = 0.34 * vel, a = Math.min(0.12, 0.03 + dur * 0.05);
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(v, t + a);
    g.setTargetAtTime(v * 0.8, t + a, 0.5);
    const end = t + a + Math.max(dur, 0.1);
    g.setTargetAtTime(0, end, 0.18);
    this._end([A, B], [gB, out], end + 1.2);
  }
}
