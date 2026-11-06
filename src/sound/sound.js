// The picture plays. A mode of its own: while it's on a loaded song waits, and whatever's showing (the wander, or a held or static pattern)
// is the score. G turns it on and off. The AudioContext is only made when it's asked for, which is what makes it allowed to sound.
import { Synth } from './synth.js';
import { Brain } from './brain.js';
import { Reader, features } from './read.js';

const GHOST = t => (t * 76 / 60) / 8;
const FADE_IN = 2, FADE_OUT = 1.5, TAIL = 3, READ_MS = 90;
const store = {
  get(k) { try { return localStorage.getItem('trippee.' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('trippee.' + k, v); } catch { /* it just won't be remembered */ } },
};

export function init(app) {
  let ctx = null, synth = null, brain = null, reader = null, tap = null;
  let active = false, hooked = false, heard = false, sleepTimer = 0, volume = 0.8, hidden = false, lastRead = 0, picking = false;
  const cost = { sum: 0, n: 0 };
  const saved = +store.get('soundVolume');
  if (saved > 0 && saved <= 1) volume = saved;
  let song = null;     // the song we're standing in for
  const say = msg => app.ui?.say?.(msg);
  // Where a drag is. Dents go straight to the push texture and leave nothing in app.edits, so the music watches the pointer for itself.
  const comb = { on: false, x: 0, y: 0 };
  const seePointer = e => {
    const r = app.canvas.getBoundingClientRect();
    comb.x = (e.clientX - r.left - r.width / 2) / r.height * 2;
    comb.y = -(e.clientY - r.top - r.height / 2) / r.height * 2;
  };
  app.canvas.addEventListener('pointerdown', e => {
    const fx = app.hand?.effect?.();
    if (e.button !== 0 || e.altKey || (fx && fx !== 'comb')) return;
    comb.on = true; seePointer(e);
  });
  addEventListener('pointermove', e => { if (comb.on) seePointer(e); }, { passive: true });
  const combUp = () => { comb.on = false; };
  addEventListener('pointerup', combUp);
  addEventListener('pointercancel', combUp);

  const seed = () => { let v = 1; try { v = +localStorage.getItem('trippee.visit') || 1; } catch { /* the first key, then */ } return (v * 2053 + 11) >>> 0; };

  function ensure() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    synth = new Synth(ctx, seed());
    synth.output.connect(ctx.destination);
    synth.volume.gain.value = volume;
    reader = new Reader(app.R);
  }

  // A song waits while the picture plays. The film stays where it was and the wander takes the screen, on a clock of its own.
  // Pressed in the middle of a transformation, that transformation finishes first (stage.settle), quickly, since starting another from half way through it would pop.
  let standing = null;     // standing in, and still waiting for that
  function standIn() {
    const s = app.song, stage = app.stage;
    song = null;
    if (!s) return;
    const wasPlaying = !!s.playing;
    s.pause?.();
    if (!app.clock) return;
    const clock = app.clock, me = standing = { wasPlaying, clock };
    song = me;
    s.aside = true;
    stage.settle(app.pictureT(), () => {
      if (standing !== me) return;      // let go again before it got this far
      standing = null;
      if (s.playing) { song = null; s.aside = false; off(); return; }      // and someone has pressed play on it meanwhile, so it wins
      const t = app.pictureT(), snap = stage.snapshot(t);
      // The film's tables come along for a moment, so what the song was doing to the sheet dies away instead of stopping dead
      stage.score = { gestures: [{ t0: t, t1: t + 16, arcEnd: t + 16, pattern: snap.G.pattern, arcs: [], morph: 12 }], phi: GHOST, song: null, react: stage.score.react, ambient: stage.score.ambient, songFades: t, time: Object.assign(tt => tt, { c: stage.score.time?.c }) };
      stage.hold = false;
      stage._extend(t);
      app.clock = null;
      stage.morphFrom(snap, t, 3);
    });
  }

  function standDown() {
    if (!song) return;
    const { wasPlaying, clock } = song, stage = app.stage, s = app.song;
    song = null;
    if (s) s.aside = false;
    // It never got as far as leaving the film, so there's nothing to go back from
    if (standing) { standing = null; if (wasPlaying) s?.play?.(); return; }
    if (!s?.analysis || s.resting) return;    // it was ejected or ran out meanwhile: the wander just carries on
    stage.settle(app.pictureT(), () => {
      if (app.clock || active || !s.score) return;        // a song has started some other way, the picture's been asked to play again, or the song's been ejected while this waited its turn: any of those wins
      const snap = stage.snapshot(app.pictureT());
      stage.setScore(s.score);                // the latest take, if there's been another
      app.clock = clock;
      const t = clock();
      app.t = t;
      stage.morphFrom(snap, app.pictureT(t), 6);
      if (wasPlaying) s.play?.();
    });
  }

  // The read line is never drawn: the music reads the picture, and the picture is left alone.

  function tick() {
    if (!active) return;
    // Someone has started a song by hand (dropped one, pressed play): it wins, and this steps aside.
    if (!standing && (app.song?.playing || app.clock)) { song = null; if (app.song) app.song.aside = false; off(); return; }
    const t0 = performance.now();
    // About ten looks a second is plenty for a read line that moves a few columns a second.
    if (!reader.fence && t0 - lastRead > READ_MS) { lastRead = t0; reader.request(); }
    else if (reader.fence && !picking) { picking = true; requestAnimationFrame(pick); }   // just before the next render, when the GPU has nothing queued
    if (!reader.reads) return;
    brain.frame(ctx.currentTime, features(app, reader, comb));
    cost.sum += performance.now() - t0; cost.n++;
  }
  const pick = () => { picking = false; if (reader) reader.pickup(); };

  function on() {
    if (active) return api;
    clearTimeout(sleepTimer);
    ensure();
    if (ctx.state !== 'running') ctx.resume();
    standIn();
    brain = new Brain(synth, seed());
    active = true;
    if (!hooked) { app.onFrame.push(tick); hooked = true; }
    if (!heard) { heard = true; app.hand?.on?.('cleared', () => { if (brain) brain.touch.heal = 0; }); }   // z: the dents let go in a couple of seconds, so the echoes do
    synth.fadeTo(1, ctx.currentTime, FADE_IN);
    window.dispatchEvent(new CustomEvent('trippee:sound', { detail: { active: true } }));
    say('the picture is playing');
    return api;
  }

  function off() {
    if (!active) return api;
    active = false;
    brain?.letGo(ctx.currentTime + FADE_OUT);
    synth.fadeTo(0, ctx.currentTime, FADE_OUT);
    const i = app.onFrame.indexOf(tick);
    if (i >= 0) app.onFrame.splice(i, 1);
    hooked = false;
    standDown();
    // Once it's faded, stop asking the sound card for anything. A recording that's tapping it keeps it running.
    clearTimeout(sleepTimer);
    sleepTimer = setTimeout(() => { if (!active && ctx && !tap) ctx.suspend?.(); }, (FADE_OUT + TAIL) * 1000);
    window.dispatchEvent(new CustomEvent('trippee:sound', { detail: { active: false } }));
    say('the picture is quiet');
    return api;
  }

  const api = app.sound = {
    on, off,
    toggle() { return active ? off() : on(); },
    // Play was pressed on the song that's waiting: this stops, and the song plays whether it was playing before or not.
    handBack() { if (song) song.wasPlaying = true; return off(); },
    get active() { return active; },
    get volume() { return volume; },
    set volume(v) {
      volume = Math.max(0, Math.min(1, +v || 0));
      store.set('soundVolume', volume);
      if (synth) synth.volume.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
    },
    // A live copy of what's being played, for the recorder to mix in. Asking for it makes the context if need be.
    stream() {
      ensure();
      if (ctx.state !== 'running') ctx.resume();
      if (!tap) { tap = ctx.createMediaStreamDestination(); synth.output.connect(tap); }
      return tap.stream;
    },
    get log() { return brain?.log ?? []; },
    get cost() { return cost; },
    get context() { return ctx; },
    get synth() { return synth; },
    get brain() { return brain; },
    get reader() { return reader; },
  };

  // Away from the tab there's no picture, so there's nothing to read. It fades, and it's still there when you come back.
  document.addEventListener('visibilitychange', () => {
    if (!active) return;
    hidden = document.hidden;
    synth.fadeTo(hidden ? 0 : 1, ctx.currentTime, hidden ? 0.8 : 1.2);
  });

  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'g' || e.key === 'G') api.toggle();
  });
}
