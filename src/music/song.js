// A song: decode it, listen to it once in a worker, compose a film, and hold the picture to the audio's output clock.
// Without a song none of this runs and the stage wanders.
import { compose } from '../score/compose.js';
import { ANALYSIS_VERSION, SR, analyse } from './analysis.js';
import { rehearse } from './rehearse.js';

const VISUAL_LEAD = 0.025;      // the picture a touch ahead: an edge seen just before it's heard reads as on time
const END_HOLD = 2.5;           // seconds the film's last picture holds after the song has finished

// ---------------------------------------------------------------- the analysis cache: a song is only analysed once
const DB = 'trippee', STORE = 'analysis';
const openDB = () => new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function cacheGet(key) {
  try {
    const db = await openDB();
    return await new Promise(res => { const q = db.transaction(STORE).objectStore(STORE).get(key); q.onsuccess = () => res(q.result ?? null); q.onerror = () => res(null); });
  } catch { return null; }
}
async function cachePut(key, value) {
  try {
    const db = await openDB();
    await new Promise(res => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(value, key); tx.oncomplete = () => res(); tx.onerror = () => res(); });
  } catch { /* a private window: fine, it just listens again next time */ }
}
async function hashOf(bytes) {
  try {
    const d = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(d)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    const v = new Uint8Array(bytes); let h = 0x811c9dc5;
    for (let i = 0; i < v.length; i += Math.max(1, v.length >> 20)) { h ^= v[i]; h = Math.imul(h, 0x01000193); }
    return `f${(h >>> 0).toString(16)}-${v.length}`;
  }
}

// In a worker, so the picture keeps travelling. If workers aren't available, on this thread.
function listen(samples, onProgress) {
  return new Promise((res, rej) => {
    let w;
    try { w = new Worker(new URL('./analyse.worker.js', import.meta.url), { type: 'module' }); }
    catch { analyse(samples, onProgress).then(res, rej); return; }
    w.onmessage = e => {
      if (e.data.progress !== undefined) onProgress(e.data.progress);
      else if (e.data.result) { w.terminate(); res(e.data.result); }
      else if (e.data.error) { w.terminate(); rej(new Error(e.data.error)); }
    };
    w.onerror = e => { w.terminate(); rej(new Error(e.message || 'worker failed')); };
    w.postMessage(samples, [samples.buffer]);
  });
}

async function toBytes(src) {
  if (src instanceof ArrayBuffer) return src;
  if (typeof src === 'string' || src instanceof URL) {
    const r = await fetch(src);
    if (!r.ok) throw new Error(`can't fetch ${src}: ${r.status}`);
    return r.arrayBuffer();
  }
  if (src && typeof src.arrayBuffer === 'function') return src.arrayBuffer();
  throw new Error('song: give it a File, Blob, ArrayBuffer or URL');
}

// ---------------------------------------------------------------- the song object
export function init(app) {
  let ctx = null, buffer = null, source = null, gain = null;
  let startedAt = 0, offset = 0, playing = false, loadToken = 0;
  let tEst = 0, lastPerf = 0, needSnap = true;
  let duration = 0, analysis = null, score = null, opts = {};
  let endedAt = 0, resting = false;
  const lead = { value: VISUAL_LEAD };
  const sitOut = new Set();     // patterns that made a jump in a rehearsal

  const context = () => { if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' }); gain = ctx.createGain(); gain.connect(ctx.destination); } return ctx; };
  let tap = null;     // what a recording hears: the same mix the speakers get

  // What's coming out of the speakers now, in song seconds. getOutputTimestamp already allows for the output latency.
  const heard = () => {
    if (!ctx) return offset;
    if (!playing) return offset;
    let now = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
    const ts = ctx.getOutputTimestamp?.();
    if (ts && ts.contextTime > 0 && ts.performanceTime > 0) {
      // The timestamp is the better clock, but it can be stale after a long idle. Believe it only when it's close to the plain one.
      const fine = ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
      if (Math.abs(fine - now) < 0.15) now = fine;
    }
    return Math.min(duration, Math.max(0, now - startedAt + offset));
  };
  const stopSource = () => { if (source) { source.onended = null; try { source.stop(); } catch {} source.disconnect(); source = null; } };
  const startSource = () => {
    stopSource();
    source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.onended = () => { playing = false; offset = duration; source = null; endedAt = performance.now(); };
    const at = ctx.currentTime + 0.03;
    source.start(at, Math.max(0, offset));
    startedAt = at;
    playing = true;
    needSnap = true;
  };
  // The picture's clock: free-running between frames, gently pulled to what's heard, so nothing jitters.
  const clock = () => {
    const now = performance.now(), dt = lastPerf ? Math.min(0.1, (now - lastPerf) / 1000) : 0;
    lastPerf = now;
    const target = heard() + (playing ? lead.value : 0);
    if (!playing) { tEst = target; return tEst; }
    if (needSnap) { tEst = target; needSnap = false; return tEst; }
    tEst += dt;
    const err = target - tEst;
    if (Math.abs(err) > 0.25) tEst = target;
    else tEst += Math.max(-0.002, Math.min(0.002, err * 0.05));
    return tEst;
  };

  const composeNow = (o, keepFamily) => {
    opts = { ...opts, ...o };
    const aspect = app.canvas.width && app.canvas.height ? app.canvas.width / app.canvas.height : 16 / 9;
    const allowed = app.patterns.filter(p => !sitOut.has(p.id));
    score = compose(analysis, opts.seed ?? 7, { family: keepFamily ?? opts.family, pattern: opts.pattern, patterns: allowed.length ? allowed : app.patterns, aspect });
    song.score = score;
    return score;
  };
  // Play it through once out of sight. A pattern that jumps sits this song out, and the film is composed again without it.
  const rehearseNow = async onProgress => {
    for (let tries = 0; tries < 3; tries++) {
      let r;
      try { r = await rehearse(score, Math.min(analysis.duration, 1200), onProgress); }
      catch (e) { console.warn('rehearsal skipped:', e); return; }
      song.rehearsal = r;
      const mine = typeof opts.pattern === 'string' ? opts.pattern : opts.pattern?.id;
      const fresh = r.bad.filter(id => id !== mine && !sitOut.has(id));
      if (!fresh.length) return;
      console.warn('rehearsal: sitting out ' + JSON.stringify(r.jumps.slice(0, 6)));
      for (const id of fresh) sitOut.add(id);
      // the same family: one bad pattern shouldn't change what kind of film this is
      composeNow({}, score.family);
    }
  };

  // The song has finished. The film's last pattern bends into the wander, so the picture never just stops. The song stays loaded:
  // play or a seek goes back to the film.
  const rest = () => {
    resting = true; endedAt = 0;
    const stage = app.stage;
    stage.settle(app.pictureT(), () => {
      const t = app.t, snap = stage.snapshot(app.pictureT());
      stage.score = { gestures: [{ t0: t, t1: t + 16, arcEnd: t + 16, pattern: snap.G.pattern, arcs: [], morph: 12 }], phi: x => (x * 76 / 60) / 8, song: null };
      stage.hold = false;
      stage._extend(t);
      app.clock = null;
      stage.morphFrom(snap, t, 3);
    });
  };
  const wake = () => {
    resting = false; endedAt = 0;
    app.stage.settle(app.pictureT(), () => {
      const snap = app.stage.snapshot(app.pictureT());
      app.stage.setScore(score);
      app.clock = clock;
      needSnap = true;
      app.stage.morphFrom(snap, Math.max(0, offset), 6);
    });
  };
  app.onFrame.push(() => { if (endedAt && !resting && performance.now() - endedAt > END_HOLD * 1000) rest(); });

  const song = app.song = {
    analysis: null, score: null, fromCache: false, analyseSeconds: 0, hash: null, rehearsal: null,
    aside: false,     // the picture is making its own music, and this song waits
    get playing() { return playing; },
    get resting() { return resting; },
    get duration() { return duration; },
    get lead() { return lead.value; },
    set lead(v) { lead.value = v; needSnap = true; },

    async load(src, { seed = 7, onProgress = () => {}, family, pattern, autoplay = false } = {}) {
      const token = ++loadToken;
      onProgress(0.01);
      const bytes = await toBytes(src);
      const hash = await hashOf(bytes);
      const key = `${ANALYSIS_VERSION}:${hash}`;
      const a = context();
      const decoded = await a.decodeAudioData(bytes.slice(0));
      if (token !== loadToken) return null;
      const t0 = performance.now();
      let A = await cacheGet(key);
      song.fromCache = !!A;
      if (!A) {
        // Mono, 22050 Hz
        const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * SR), SR);
        const s = off.createBufferSource(); s.buffer = decoded; s.connect(off.destination); s.start();
        const mono = (await off.startRendering()).getChannelData(0);
        A = await listen(mono.slice(0), p => onProgress(0.02 + 0.96 * p));
        A.hash = hash;
        await cachePut(key, A);
      }
      if (token !== loadToken) return null;
      song.analyseSeconds = (performance.now() - t0) / 1000;
      stopSource();
      endedAt = 0; resting = false;
      buffer = decoded; duration = decoded.duration; offset = 0; playing = false; analysis = A;
      song.analysis = A; song.hash = hash;
      opts = { seed, family, pattern };
      composeNow(opts);
      app.governor?.quiet(3);    // the rehearsal holds up the frame loop for a moment; that's not the pixels' fault
      await rehearseNow(p => onProgress(0.98 + 0.02 * p));
      if (token !== loadToken) return null;
      // Something on its way somewhere gets there first. A film has to come out of one pattern, or it would pop.
      if (!app.manual && app.stage.morphing(app.pictureT())) await new Promise(res => app.stage.settle(app.pictureT(), res, 2.5));
      if (token !== loadToken) return null;
      const snap = app.stage.snapshot(app.pictureT());
      app.stage.setScore(score);
      app.clock = clock;
      app.t = 0;
      lastPerf = 0; tEst = 0; needSnap = true;
      app.stage.morphFrom(snap, 0, 7, { clocked: true });
      onProgress(1);
      if (autoplay) song.play();
      return song;
    },

    play() {
      if (!buffer) return;
      context();
      if (ctx.state === 'suspended') ctx.resume();
      if (offset >= duration - 0.01) offset = 0;
      if (resting) wake();
      if (!playing) startSource();
    },
    pause() {
      if (!playing) return;
      offset = heard();
      stopSource();
      playing = false;
      needSnap = true;
    },
    seek(t) {
      if (resting) { offset = Math.max(0, Math.min(duration - 0.02, t)); song.play(); return; }
      const was = playing;
      offset = Math.max(0, Math.min(duration, t));
      stopSource();
      playing = false;
      needSnap = true;
      if (was) startSource();
      else tEst = offset;
      if (app.manual) { app.t = offset; }
    },
    time() { return heard(); },
    contextState() { return ctx?.state ?? 'none'; },
    // A live copy of the song's sound, for recording. Nothing until there's a song, and a recording wants no silent track.
    audioStream() {
      if (!buffer || !ctx) return null;
      if (!tap) { tap = ctx.createMediaStreamDestination(); gain.connect(tap); }
      return tap.stream;
    },

    // The same song, another film. The clock doesn't stop.
    // quiet: no rehearsal behind it, for a pick, which happens right there in the middle of the picture.
    rebuild({ seed, family, pattern, quiet = false } = {}) {
      if (!analysis) return null;
      const next = {};
      if (seed !== undefined) next.seed = seed;
      if (family !== undefined) { next.family = family; next.pattern = undefined; }
      if (pattern !== undefined) next.pattern = pattern;
      composeNow(next);
      if (!resting && !song.aside) app.stage.setScore(score);
      if (quiet) return score;
      // It's called from under a solid, so it answers now; what this rehearsal learns is for the next take.
      rehearse(score, Math.min(analysis.duration, 1200)).then(r => {
        song.rehearsal = r;
        const mine = typeof opts.pattern === 'string' ? opts.pattern : opts.pattern?.id;
        for (const id of r.bad) if (id !== mine) sitOut.add(id);
      }).catch(() => {});
      return score;
    },

    // Forget the song: back to the wander.
    eject() {
      loadToken++;
      stopSource();
      endedAt = 0; resting = false;
      playing = false; buffer = null; analysis = null; score = null; duration = 0; offset = 0; song.aside = false;
      song.analysis = null; song.score = null;
      app.clock = null;
      // A new score: nothing of the film's (its reactions, its clock) stays on the wander.
      app.stage.score = { song: null, gestures: [], phi: t => (t * 76 / 60) / 8, handover: app.stage.score.handover };
      app.stage.hold = false;
      app.stage._extend?.(app.t);
    },
  };

  app.stage.rebuild = o => song.rebuild(o);
  if (window.trippee) window.trippee.song = (src, o) => song.load(src, o);
}
