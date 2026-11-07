// A song: decode it, listen to it once in a worker, compose a film, and hold the picture to the audio's output clock.
// Without a song none of this runs and the stage wanders.
import { compose } from '../score/compose.js';
import { ANALYSIS_VERSION, SR, analyse } from './analysis.js';
import { rehearse, warmRehearsal, getRig, drawn, Eyes, FlashSeen } from './rehearse.js';
import { flag, hearing } from '../score/flags.js';
import { cutFor } from '../score/cuts/index.js';
import { auditCut } from '../score/cut.js';

const VISUAL_LEAD = 0.025;      // the picture a touch ahead: an edge seen just before it's heard reads as on time
const END_HOLD = 2.5;           // seconds the film's last picture holds after the song has finished
const ARRIVE = 7, FLIP = 6;     // seconds: a song's film flying in, and one film of a compared song flying into the other
const HUSH = 0.45, HUSH_BACK = 2.5;      // seconds the song lets go of the sheet before a jump back in the music, and takes to come back after it
const FLIGHT_MOST = 10, FLIGHT_FPS = 60, FLIGHT_H = 180;     // a flight that flashes takes longer, up to this: it's the first thing anyone sees of a song, and past this it was mostly running into flashes in the film itself, which no flight can help. At the judge's rate and size, and by its count (FlashSeen.real): there's only the one flight to look at, and smaller and slower it passed flights the judge doesn't

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
  app.R.whenAllReady().then(() => warmRehearsal()).catch(() => {});
  let ctx = null, buffer = null, source = null, gain = null;
  let startedAt = 0, offset = 0, playing = false, loadToken = 0;
  let tEst = 0, lastPerf = 0, needSnap = true;
  let duration = 0, analysis = null, score = null, opts = {};
  let endedAt = 0, resting = false;
  const lead = { value: VISUAL_LEAD };
  const sitOut = new Set();     // patterns that made a jump in a rehearsal
  // A song with a hand cut has two films (docs/DIRECTION.md section 7), and for any other song all of these stay as they are. Which one's showing never touches the clock or the sound.
  let films = null;             // { auto, cut }: auto is the generated film, the latest take of it. cut is null until it's composed
  let showing = 'auto', comparing = null, cutComing = false;
  let passage = 0;              // song seconds: where the last switch happened, or the last seek, which is where D goes back to
  let autoRehearsal = null, cutRehearsal = null;

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

  let takeToken = 0;
  let extrasOf = null;      // what a world that needs the extras is waiting on, for this song. Nothing's imported until one asks.
  const composeNow = (o, keepFamily) => {
    opts = { ...opts, ...o };
    const aspect = app.canvas.width && app.canvas.height ? app.canvas.width / app.canvas.height : 16 / 9;
    // A world's film is drawn from the world's own patterns, and with none on from the library as ever.
    const W = app.stage.world, from = W?._pool?.length ? W._pool : app.patterns;
    const allowed = from.filter(p => !sitOut.has(p.id));
    // A pattern picked by hand before this world came on isn't one of its own, and a film can't be built round it.
    const foreign = W?._pool?.length && opts.pattern && !from.some(p => p === opts.pattern || p.id === opts.pattern);
    score = compose(analysis, opts.seed ?? 7, { family: keepFamily ?? opts.family, pattern: foreign ? undefined : opts.pattern, patterns: allowed.length ? allowed : from, aspect, ...(W ? { world: W } : null) });
    song.score = score;
    return score;
  };
  // Play it through once out of sight. A pattern that jumps sits this song out, and the film is composed again without it.
  // arriving: this film is about to fly in. What that does to its opening (stage._clearRunway) is done first, so what's rehearsed is what's shown.
  const rehearseNow = async (onProgress, stale = null, gentle = false, arriving = false) => {
    // The film that's shown is always one that's been rehearsed all the way through: the last try can't send it back to be composed again.
    const guarded = flag('flashGuard'), tryN = guarded ? 5 : 3;
    for (let tries = 0; tries < tryN; tries++) {
      let r;
      const last = guarded && tries === tryN - 1;
      if (arriving && guarded && !score.world) app.stage._clearRunway(0, ARRIVE, score);
      try { r = await rehearse(score, Math.min(analysis.duration, 1200), onProgress, { lastTry: last, stale, gentle, keep: typeof opts.pattern === 'string' ? opts.pattern : opts.pattern?.id ?? null }); }
      catch (e) { if (e.message !== 'stale') console.warn('rehearsal skipped:', e); return; }
      song.rehearsal = r;
      const mine = typeof opts.pattern === 'string' ? opts.pattern : opts.pattern?.id;
      const fresh = r.bad.filter(id => id !== mine && !sitOut.has(id));
      if (!fresh.length || last) return;
      console.warn('rehearsal: sitting out ' + JSON.stringify(r.jumps.slice(0, 6)));
      for (const id of fresh) sitOut.add(id);
      // the same family: one bad pattern shouldn't change what kind of film this is
      composeNow({}, score.family);
    }
  };

  // A pick makes a new film in the middle of the picture, with no time to rehearse it first. So once the click has landed the rest of it is rehearsed behind what's showing, taking very little at a time:
  // only what's still ahead can change, and another pick starts over.
  let behindToken = 0;
  const REHEARSE_AFTER = 10000;
  const rehearseBehind = () => {
    const mine = ++behindToken, sc = score, stale = () => mine !== behindToken || sc !== score;
    setTimeout(async () => {
      if (stale()) return;
      try { song.rehearsal = await rehearse(sc, Math.min(analysis.duration, 1200), () => {}, { stale, gentle: true }); if (sc.runway) keep(sc); } catch (e) { if (e.message !== 'stale') console.warn('rehearsal skipped:', e); }
    }, REHEARSE_AFTER);
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
  // A flight out of whatever's showing can't be rehearsed with the film: nobody knows what will be showing. So it's looked at just before it goes, out of sight, the way the rehearsal watches
  // a film's own transformations, and one that flashes goes slower until it doesn't. Asks nothing of the film: it's a copy of it that's flown, unless this film looks after itself (sc.runway).
  const flightLength = async (snap, sc, t, dur, stale = () => false) => {
    if (!flag('flashGuard') || sc.world || app.stage.world) return dur;
    const R = await getRig(), H = FLIGHT_H, aspect = sc.aspect ?? (app.canvas.width / app.canvas.height || 16 / 9), W = Math.max(8, Math.round(H * aspect)), px = new Uint8Array(W * H * 4);
    let best = dur, least = Infinity, breath = performance.now();
    for (let D = dur; ; D = Math.min(Math.round(D * 1.4), FLIGHT_MOST)) {
      const look = { ...sc, flownPast: null, handover: app.stage.flightFrom(snap, t, D, true) };
      if (sc.runway) sc.runway(t, D);
      else { look.gestures = sc.gestures.map(G => ({ ...G, plan: null, planFor: null, planning: null })); app.stage._clearRunway(t, D, look); }
      const n = Math.ceil(D * FLIGHT_FPS), seen = new FlashSeen(n, W, H, FLIGHT_FPS, false, !sc.cut), eyes = new Eyes(R, W, H, 32, () => new Promise(res => setTimeout(res)));
      for (let i = 0; i < n; i++) {
        const f = drawn(R, look, t + i / FLIGHT_FPS, W, H), o = { from: f.from, G: f.G, kind: f.kind };
        if (eyes.read(p => seen.take(i, p, o, look.gestures))) await eyes.flush();
        if (performance.now() - breath > 4) { await new Promise(res => setTimeout(res)); breath = performance.now(); if (stale()) { eyes.free(); return best; } }
      }
      await eyes.flush();
      eyes.free();
      const over = seen.real().frames.length;
      if (over < least) { least = over; best = D; }
      if (!over || D >= FLIGHT_MOST) break;
    }
    return best;
  };

  // What the song's doing to the sheet is a function of its time. A jump back in the music is a cut, and the whole frame can't take that between two frames: it lets go first, quickly, and comes back over the flight.
  let hush = null;
  const hushTo = (to, secs, then) => { hush = { t0: performance.now(), secs, from: app.edits.reactAmt ?? 1, to, then }; };
  const unhushed = () => (hush ? hush.to || hush.from : app.edits.reactAmt ?? 1);      // what it comes back to, whichever way it's going just now
  let jumpTo = null, jumpAt = 0;
  const JUMP_STUCK = 8000;     // ms: longer than settling and letting go can take. One move running straight into another has been seen at 3.5 s
  app.onFrame.push(() => {
    if (!hush) return;
    const h = hush, u = Math.min(1, (performance.now() - h.t0) / (h.secs * 1000));
    app.edits.reactAmt = h.from + (h.to - h.from) * u * u * (3 - 2 * u);
    if (u < 1) return;
    hush = null;
    h.then?.();
  });

  // h: the layer that follows the song, off and on, with the song going on. Nothing's composed or rehearsed: it eases over a second, in the picture's own time, so it can't pop. See src/score/hear.js.
  const HEAR_EASE = 1;
  app.edits.hear = hearing.on ? 1 : 0;
  let hearGoing = null;
  const hearTo = on => { hearing.on = on; hearGoing = { t0: performance.now(), from: app.edits.hear, to: on ? 1 : 0 }; return on; };
  app.onFrame.push(() => {
    if (!hearGoing) return;
    const q = hearGoing, u = Math.min(1, (performance.now() - q.t0) / (HEAR_EASE * 1000));
    app.edits.hear = q.from + (q.to - q.from) * u * u * (3 - 2 * u);
    if (u >= 1) hearGoing = null;
  });

  // The film that's meant to be showing.
  const shown = () => (films ? (showing === 'cut' && films.cut) || films.auto : score);

  // A film being compared has to be the same film each time it comes round, and a flight into it does things to it: it clears the way, so the stage's own way of clearing it would lose whatever
  // was due in the next few seconds, for good. So this remembers it as it stands, and each flight into it starts from that. A change that's under way or due before the flight lands is flown past:
  // the flight goes straight to where that was going, and the same passage goes on playing.
  const keep = sc => {
    const own = [...sc.gestures], saved = own.map(G => ({ ...G }));
    sc.runway = (t, dur) => {
      own.forEach((G, k) => { for (const key of Object.keys(G)) if (!(key in saved[k])) delete G[key]; Object.assign(G, saved[k]); });
      const g = sc.gestures;
      g.length = 0; g.push(...own);
      let i = Math.max(0, g.findLastIndex(G => G.t0 <= t));
      while (g[i + 1] && g[i].t1 - (g[i].morph || 0) < t + dur + 0.25) { const G = g[i], N = g[i + 1]; G.t1 = t; G.morph = 0; N.t0 = t; i++; }
    };
  };

  const wake = () => {
    resting = false; endedAt = 0;
    app.stage.settle(app.pictureT(), () => {
      const snap = app.stage.snapshot(app.pictureT());
      app.stage.setScore(shown());
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
    // Two films and a key between them: null for a song with no hand cut, and until both have been rehearsed. In a world, or with the picture making its own music, it stands aside.
    get compare() { return comparing && !app.stage.world && !song.aside ? comparing : null; },
    get compareComing() { return cutComing; },
    set lead(v) { lead.value = v; needSnap = true; },

    async load(src, { seed = 7, onProgress = () => {}, family, pattern, autoplay = false } = {}) {
      const token = ++loadToken;
      films = null; showing = 'auto'; comparing = null; cutComing = false; passage = 0; autoRehearsal = cutRehearsal = null;
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
      extrasOf = null;
      song.analysis = A; song.hash = hash;
      opts = { seed, family, pattern };
      if (app.stage.world?.needs?.length) await song.extrasReady().catch(e => console.warn('the extras could not be heard:', e));      // a world that's on and hears them
      if (token !== loadToken) return null;
      composeNow(opts);
      app.governor?.quiet(3);    // the rehearsal holds up the frame loop for a moment; that's not the pixels' fault
      await rehearseNow(p => onProgress(0.98 + 0.02 * p), null, false, true);
      if (token !== loadToken) return null;
      const cut = await cutFor(hash).catch(e => { console.warn('the hand cut could not be loaded:', e); return null; });
      if (token !== loadToken) return null;
      // Here, not behind the picture: composing takes a moment all at once, and nothing's waiting yet.
      if (cut) { const made = composeCut(cut); if (made) { films = { auto: score, cut: made }; cutComing = true; } }
      // Something on its way somewhere gets there first. A film has to come out of one pattern, or it would pop.
      if (!app.manual && app.stage.morphing(app.pictureT())) await new Promise(res => app.stage.settle(app.pictureT(), res, 2.5));
      if (token !== loadToken) return null;
      const opening = score.gestures[0], before = [opening.t1, opening.morph];
      song.arrival = await flightLength(app.stage.snapshot(app.pictureT()), score, 0, ARRIVE, () => token !== loadToken);
      if (token !== loadToken) return null;
      // A longer flight takes what it needs from the film's opening: a first gesture goes, or its morph is cut short. The film that's been rehearsed isn't the one that would be shown, so that much is looked at again.
      app.stage._clearRunway(0, song.arrival, score);
      if (flag('flashGuard') && (opening.t1 !== before[0] || opening.morph !== before[1])) {
        const looked = await rehearse(score, Math.min(score.gestures[1]?.t1 ?? opening.t1, analysis.duration), () => {}, { lastTry: true, opening: song.arrival, stale: () => token !== loadToken }).catch(e => { if (e.message !== 'stale') console.warn('rehearsal skipped:', e); return null; });
        if (token !== loadToken) return null;
        if (song.rehearsal?.flash && looked?.flash) song.rehearsal.flash.opening = looked.flash;
      }
      const snap = app.stage.snapshot(app.pictureT());
      app.stage.setScore(score);
      app.clock = clock;
      app.t = 0;
      lastPerf = 0; tEst = 0; needSnap = true;
      app.stage.morphFrom(snap, 0, song.arrival, { clocked: true });
      onProgress(1);
      if (autoplay) song.play();
      if (cutComing) rehearseCut(cut, token);
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
      passage = Math.max(0, Math.min(duration, t));
      if (resting) { offset = Math.max(0, Math.min(duration - 0.02, t)); song.play(); return; }
      const was = playing;
      offset = Math.max(0, Math.min(duration, t));
      stopSource();
      playing = false;
      needSnap = true;
      if (was) startSource();
      else tEst = offset;
      if (app.manual) { app.t = offset; }
      else { app.edits.hearJumped = true; app.reclock = true; }     // the song's camera doesn't jump with it: src/score/hear.js. And the frame that's drawn next is at the new time (main.js render)
    },
    // A seek by hand, in the middle of the film: a jump in the music. The song lets go of the sheet first and comes back over the flight, as D does. The last click wins.
    jump(t) {
      if (resting || !score) { app.ui.hand.veil(() => song.seek(t)); return; }
      const going = jumpTo !== null && performance.now() - jumpAt < JUMP_STUCK;
      jumpTo = t;
      if (going) return;
      jumpAt = performance.now();      // not for a click that only changes where: if one is stuck, clicks at it mustn't keep it alive
      const level = unhushed(), token = loadToken;
      app.stage.settle(app.pictureT(), () => hushTo(0, HUSH, () => {
        const at = jumpTo;
        jumpTo = null;
        if (at === null) { hushTo(level, HUSH_BACK); return; }      // somebody else has taken it: back, not left silent
        if (token !== loadToken) { app.edits.reactAmt = level; return; }
        app.ui.hand.veil(() => { song.seek(at); hushTo(level, HUSH_BACK); });
      }));
    },
    time() { return heard(); },
    contextState() { return ctx?.state ?? 'none'; },
    // A live copy of the song's sound, for recording. Nothing until there's a song, and a recording wants no silent track.
    audioStream() {
      if (!buffer || !ctx) return null;
      if (!tap) { tap = ctx.createMediaStreamDestination(); gain.connect(tap); }
      return tap.stream;
    },

    // Another take, made properly: composed and rehearsed out of sight just as a song arriving is, while the film that's showing carries on. It answers with a function that shows it,
    // to be called where the picture's ready to change (hand.veil), or null if a later take got in first or the song's gone.
    async prepareTake({ seed, family, pattern } = {}) {
      if (!analysis) return null;
      const mine = ++takeToken, token = loadToken, next = {};
      if (seed !== undefined) next.seed = seed;
      if (family !== undefined) { next.family = family; next.pattern = undefined; }
      if (pattern !== undefined) next.pattern = pattern;
      composeNow(next);
      const stale = () => mine !== takeToken || token !== loadToken;
      await rehearseNow(() => {}, stale, true);
      if (stale()) return null;
      return () => { if (films) { films.auto = score; toAuto(); } if (!resting && !song.aside) app.stage.setScore(score); return score; };
    },

    // What the worlds hear that the film doesn't (src/music/extras.js), once per song. It's in analysis.x from then on. Nothing of it is here until a world asks: stage.setWorld waits on it for a world's `needs`.
    extrasReady() { return extrasOf ??= import('./extras.js').then(({ listenExtras }) => listenExtras(buffer, analysis, song.hash)).then(X => (analysis.x = X)); },

    // The same song, another film, right now. The clock doesn't stop.
    // quiet: no rehearsal behind it, for a pick, which happens right there in the middle of the picture.
    rebuild({ seed, family, pattern, quiet = false } = {}) {
      if (!analysis) return null;
      const next = {};
      if (seed !== undefined) next.seed = seed;
      if (family !== undefined) { next.family = family; next.pattern = undefined; }
      if (pattern !== undefined) next.pattern = pattern;
      takeToken++;      // anything still on its way is out of date now
      composeNow(next);
      if (films) { films.auto = score; toAuto(); }
      if (!resting && !song.aside) app.stage.setScore(score);
      if (quiet) { rehearseBehind(); return score; }
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
      films = null; showing = 'auto'; comparing = null; cutComing = false; passage = 0; autoRehearsal = cutRehearsal = null;
      song.analysis = null; song.score = null;
      app.clock = null;
      // A new score: nothing of the film's (its reactions, its clock) stays on the wander.
      app.stage.score = { song: null, gestures: [], phi: t => (t * 76 / 60) / 8, handover: app.stage.score.handover };
      app.stage.hold = false;
      app.stage._extend?.(app.t);
    },
  };

  // ---------------------------------------------------------------- the compare
  function composeCut(cut) {
    const aspect = app.canvas.width && app.canvas.height ? app.canvas.width / app.canvas.height : 16 / 9;
    try { const made = compose(analysis, opts.seed ?? 7, { patterns: app.patterns, aspect, cut }); if (made.cut) return made; console.warn('the hand cut was not laid:', made.refused); return null; }
    catch (e) { console.warn('the hand cut could not be composed:', e); return null; }
  }
  const toAuto = () => { if (showing === 'cut') { song.rehearsal = autoRehearsal ?? song.rehearsal; showing = 'auto'; } };
  // Rehearsed behind what's showing, taking very little of each frame. This is what the button and the keys wait for. What the guard does to it stays on it, and the patterns it picks are its own: nothing here touches the generated film.
  async function rehearseCut(cut, token) {
    const stale = () => token !== loadToken, film = films.cut;
    try { cutRehearsal = await rehearse(film, Math.min(analysis.duration, 1200), () => {}, { lastTry: true, stale, gentle: true }); }
    catch (e) { if (e.message !== 'stale') console.warn('the hand cut could not be rehearsed:', e); if (!stale()) { cutComing = false; films.cut = null; } return; }
    if (stale()) return;
    auditCut(film, cutRehearsal);
    keep(film);
    comparing = makeCompare(cut, film, token);
    cutComing = false;
    app.ui?.say?.(comparing.blind ? 'two films ready: d switches' : 'the hand cut is ready: d switches', 3000);
  }
  function makeCompare(cut, film, token) {
    const hash = song.hash, KEY = 'trippee.compare.' + hash, blind = new URLSearchParams(location.search).get('blind') === '1';
    const read = k => { try { return localStorage.getItem(k); } catch { return null; } };
    const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* it just won't be remembered */ } };
    // Blind: A and B, assigned once per song by a stored coin. ? reveals them.
    let coin = read(KEY + '.coin');
    if (blind && coin !== 'cut' && coin !== 'auto') { coin = Math.random() < 0.5 ? 'cut' : 'auto'; write(KEY + '.coin', coin); }
    const letter = f => (f === coin ? 'A' : 'B');
    let revealed = false, wanted = 'auto', goBack = false, flipping = false, lineSaid = false;
    const name = f => (f === 'cut' ? 'hand cut' : 'generated');
    const swap = f => {
      if (f !== showing) {
        if (f === 'cut') { autoRehearsal = song.rehearsal; song.rehearsal = cutRehearsal; showing = 'cut'; } else toAuto();
      }
      const sc = shown();
      song.score = sc;
      if (!resting && !song.aside) app.stage.setScore(sc);
    };
    const c = {
      hash, blind, line: cut.line,
      get film() { return showing; },
      get wanted() { return wanted; },
      get passage() { return passage; },
      get label() { return blind && !revealed ? `film ${letter(showing)}` : blind ? `film ${letter(showing)}: ${name(showing)}` : name(showing); },
      get flight() { return c.lastFlight; },
      lastFlight: null,
      score: f => (f === 'cut' ? films.cut : films.auto),
      // d: the other film, through a flight, with the clock going on. D: and back to where the last switch happened, so the same passage plays in it. Pressed quickly, only where it ends up counts.
      async flip(back = false) {
        if (!films?.cut) return;
        wanted = wanted === 'cut' ? 'auto' : 'cut';
        if (back) goBack = true;
        if (flipping) return;
        flipping = true;
        if (!films.auto.runway) keep(films.auto);
        const stage = app.stage, stale = () => token !== loadToken;
        // Where it's about to fly, looked at first. In a rest there's no flight: it comes back into whichever film it's told when it's played.
        let dur = FLIP;
        if (!resting && !app.stage.staticG) {
          const to = wanted === 'cut' ? films.cut : films.auto, at = goBack ? passage : heard();
          dur = await flightLength(stage.snapshot(app.pictureT()), to, to.time ? to.time(at) : at, FLIP, stale);
          if (stale()) { flipping = false; return; }
        }
        const go = () => {
          const f = wanted, b = goBack;
          goBack = false;
          if (stale() || (f === showing && !b)) { flipping = false; return; }
          c.lastFlight = dur;
          if (resting) { flipping = false; swap(f); if (b) song.seek(passage); return; }
          const amt = unhushed();
          const fly = () => {
            flipping = false;
            app.ui.hand.veil(() => {
              swap(f);
              if (b) { song.seek(passage); hushTo(amt, HUSH_BACK); } else passage = heard();
              c.onShow?.(f, b);
            }, { dur });
          };
          if (b) hushTo(0, HUSH, fly); else fly();
        };
        if (resting) go(); else stage.settle(app.pictureT(), go);
      },
      // = and -: yes and no, against the film and the time. It costs nothing, and it's what gets read back.
      mark(yes) {
        const log = c.marks(), m = { film: showing, ...(blind ? { letter: letter(showing) } : null), t: +heard().toFixed(2), yes: !!yes, at: Date.now() };
        log.push(m);
        write(KEY, JSON.stringify(log));
        return m;
      },
      marks() { try { return JSON.parse(read(KEY)) ?? []; } catch { return []; } },
      reveal() { if (!blind) return null; revealed = true; return `A is the ${name(coin)}, B is the ${name(coin === 'cut' ? 'auto' : 'cut')}`; },
      // The idea, in a sentence, the first time the cut comes up. Never in a blind test.
      lineOnce() { if (blind || lineSaid || !cut.line) return null; lineSaid = true; return cut.line; },
    };
    return c;
  }

  app.stage.rebuild = o => song.rebuild(o);
  song.hearTo = hearTo;
  if (window.trippee) window.trippee.song = (src, o) => song.load(src, o);
}
