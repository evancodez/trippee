// A world's whoa: its one big moment, found in the song by its trigger, with a contact sheet and time-slices around it. docs/MODES.md section 3 (each world's "Whoa") and section 7. Muted.
//
//   WORLD=flower SONG=media/mgmt.mp3 node tools/lab.mjs tests/whoa.mjs --out lab-out/<lane>
//   WORLD=mirror ...     any world without a trigger of its own takes the song's strongest arrival
//   LIST=1 ...           says what each world's trigger finds in this song, and draws nothing
//   node tests/whoa.mjs --selftest
//
// Writes whoa-<world>-<song>.sheet.jpg and .slices.jpg, the close-up whoa-<world>-<song>-hit.sheet.jpg (a frame every 1/15 s across the moment), and whoa-<world>-<song>.json with what was found and why.
// No whoa rests on M.rests alone, because rests are rare (0, 0, 1 and 1 on the four test songs): each has a fallback that always exists, M.arrivals, or M.ending once the music lane has landed it, or the song's end.
// A world can bring its own: W.whoa(A, M, score) returning { t, before, after, why }. That takes precedence over the table here.
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

// What each trigger needs, from understand.js: M.runs [{t0,t1,c}], M.arrivals(min) strongest first [{bar,t,a,s}], M.rests [{a,b}], M.home.c, M.tension(c), M.bar, M.duration, optionally M.ending {t}, M.holds.
const arrivalsOf = (M, min = 0.3) => (M.arrivals?.(min) ?? []).map(x => ({ t: x.t, a: x.a }));
const ranked = (M, min) => { const a = arrivalsOf(M, min); return a.length ? a : arrivalsOf(M, 0); };
const songEnd = M => M.ending?.t ?? Math.max(0, (M.duration ?? 0) - (M.bar ?? 2) * 2);
const chordAt = (M, t) => M.runs?.find(r => r.t0 <= t && t < r.t1) ?? null;

// The strongest arrival with room before it for its build-up
const biggest = (M, before, after = 8) => { const a = ranked(M).filter(x => x.t > before && x.t < (M.duration ?? Infinity) - after); return a[0] ?? ranked(M)[0] ?? null; };
// The strongest arrival on the home chord, or one that resolves tension: what was pulling lets go
const resolving = (M, before) => {
  const home = M.home?.c, all = ranked(M).filter(x => x.t > before);
  const onHome = all.filter(x => chordAt(M, x.t + 0.05)?.c === home);
  const released = all.filter(x => { const was = chordAt(M, x.t - 0.2), now = chordAt(M, x.t + 0.05); return was && now && M.tension?.(was.c) > M.tension?.(now.c); });
  return onHome[0] ?? released[0] ?? all[0] ?? null;
};
// The longest time on one chord, ending at a rest if one follows, else at the next arrival after it, else where it ends
const longestChord = M => {
  const runs = [...(M.runs ?? [])].sort((p, q) => (q.t1 - q.t0) - (p.t1 - p.t0));
  const r = runs[0]; if (!r) return null;
  const rest = (M.rests ?? []).find(x => x.a >= r.t0 && x.a <= r.t1 + (M.bar ?? 2));
  if (rest) return { t: rest.a, why: `a rest at the end of ${r.t1 - r.t0 | 0} s on one chord` };
  const next = (M.arrivals?.(0) ?? []).filter(x => x.t >= r.t1 - 1).sort((p, q) => p.t - q.t)[0];
  return { t: next?.t ?? r.t1, why: `${(r.t1 - r.t0).toFixed(1)} s on one chord, then ${next ? 'the next arrival' : 'where it ends'}` };
};
const LONG = 40;       // a whoa that takes its time: this many seconds before it

export const TRIGGERS = {
  flower: { why: 'a cadence: the buzz stops dead on the strongest resolving arrival', before: 12, after: 6, find: M => resolving(M, 12) },
  dusk: { why: 'the band stops, or the song ends: a rest if there is one, else M.ending, else the song\'s end. Edges hold while tails die', before: 6, after: 8, find: M => { const r = (M.rests ?? [])[0]; return r ? { t: r.a, why: 'a rest' } : { t: songEnd(M), why: M.ending ? 'M.ending' : 'the end of the song' }; } },
  flyer: { why: 'the biggest arrival: the cone held back, then fires and every round edge goes square', before: 8, after: 5, find: M => biggest(M, 8) },
  pearl: { why: 'the biggest arrival, with the semitone river in the bars before it', before: 16, after: 10, find: M => biggest(M, 16, 10) },
  acid: { why: 'the longest time on one chord, then its rest or next arrival: trails collapse into one line', before: 16, after: 6, find: M => longestChord(M) ?? biggest(M, 16) },
  liquid: { why: 'eight bars of smoke unstirring into the chorus downbeat, the biggest arrival', before: 20, after: 5, find: M => biggest(M, 20) },
  station: { why: 'four bars of swing, closing on the strongest arrival at home', before: 12, after: 5, find: M => resolving(M, 12) },
  supergraphic: { why: 'forty seconds on a flat graphic, then the turn on the biggest arrival past that', before: LONG, after: 8, find: M => biggest(M, LONG) },
  cut: { why: 'the groove spreads ahead of the biggest arrival', before: 10, after: 5, find: M => biggest(M, 10) },
  polariscope: { why: 'a cadence lets the whole sheet go, over two bars, to calm magenta', before: 4, after: 10, find: M => resolving(M, 4) },
};
const ANY = { why: 'the strongest arrival in the song', before: 8, after: 6, find: M => biggest(M, 8) };

// A plain object out of the page's M, so a trigger can be run again here.
const mInPage = () => {
  const s = app.stage.score, M = s.react?.M ?? s.M;
  if (!M) return null;
  const tension = {}; for (const r of M.runs ?? []) tension[r.c] = M.tension?.(r.c);
  const arrivals = M.arrivals?.(0) ?? [];
  return { runs: M.runs ?? [], rests: M.rests ?? [], home: M.home ?? null, tensionOf: tension, arrivals, bar: M.bar, duration: M.duration ?? app.song?.duration, ending: M.ending ?? null, neutral: !!M.neutral };
};
export const fromPlain = P => ({ ...P, tension: c => P.tensionOf?.[c] ?? 0, arrivals: (min = 0) => (P.arrivals ?? []).filter(a => a.a >= min) });

export function findWhoa(worldId, M, own = null) {
  if (own) return { ...own, trigger: 'the world\'s own' };
  const T = TRIGGERS[worldId] ?? ANY, got = T.find(M) ?? null;
  if (!got) return { t: Math.max(0, (M.duration ?? 60) * 0.6), before: T.before, after: T.after, why: `${T.why}. Nothing found, so 60% through`, trigger: 'none' };
  return { t: got.t, before: T.before, after: T.after, why: got.why ? `${T.why}. Here: ${got.why}` : T.why, trigger: worldId in TRIGGERS ? worldId : 'any', strength: got.a };
}

export default async ({ page, log, save, sleep }) => {
  const { dropSong, enterWorld, watch } = await import('../tools/look.mjs');
  const songPath = process.env.SONG || 'media/mgmt.mp3', song = basename(songPath).replace(/\.\w+$/, ''), world = process.env.WORLD || 'mirror';
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  await dropSong(page, songPath, { resolvePath: resolve, sleep });
  if (process.env.LIST) {
    const P = fromPlain(await page.eval(mInPage));
    for (const id of [...Object.keys(TRIGGERS), '(any other)']) { const w = findWhoa(id, P); log(`${id}: ${w.t?.toFixed?.(2)} s, ${w.why}`); }
    return;
  }
  const entered = await enterWorld(page, world, log);
  const P = fromPlain(await page.eval(mInPage));
  const own = await page.eval(`(() => { const s = app.stage.score, W = s.world; return W?.whoa ? W.whoa(app.song.analysis ?? s.A, s.react?.M ?? s.M, s) : null; })()`);
  const w = findWhoa(entered?.id ?? world, P, own);
  const a = Math.max(0, w.t - (w.before ?? 8)), secs = Math.min(P.duration - a, (w.before ?? 8) + (w.after ?? 6));
  log(`Whoa, ${world} on ${song}: ${w.t.toFixed(2)} s. ${w.why}. Showing ${a.toFixed(1)} to ${(a + secs).toFixed(1)} s`);
  const base = `whoa-${world}-${song}`;
  const colour = world !== 'film';
  const seen = await watch(page, save, { name: base, seconds: secs, fps: 30, cols: 8, rows: Math.max(3, Math.ceil(secs / 3)), setup: `app.t=${a}`, colour });
  // and close up across the moment itself
  await watch(page, save, { name: `${base}-hit`, seconds: 2.4, fps: 30, cols: 12, rows: 3, setup: `app.t=${Math.max(0, w.t - 1.2)}`, colour });
  // How much the picture moves before and after, for the record. Reading it is the owner's job; "whoa" isn't a number.
  const per = secs / seen.diff.length, at = t => Math.round((t - a) / per);
  const part = (x, y) => { const s = seen.diff.slice(Math.max(1, at(x)), Math.max(2, at(y))); return s.length ? s.reduce((p, q) => p + q, 0) / s.length : 0; };
  const moved = { before: +part(w.t - 3, w.t - 0.1).toFixed(2), after: +part(w.t, w.t + 2).toFixed(2) };
  log(`Motion, mean |dL| a frame at 30 fps: ${moved.before} in the 3 s before, ${moved.after} in the 2 s after`);
  save(`${base}.json`, JSON.stringify({ world, song, ...w, moved, rests: P.rests.length, arrivals: (P.arrivals(0.3) ?? []).length }));
  const errs = page.logs.filter(l => /\[error\]|\[exception\]/.test(l));
  if (errs.length) log('page errors', errs.slice(0, 4));
};

// A made-up song, and a song with nothing in it: every trigger must find something in both, and none may need a rest.
export function selftest() {
  const song = { runs: [{ t0: 0, t1: 30, c: 1 }, { t0: 30, t1: 90, c: 3 }, { t0: 90, t1: 120, c: 0 }, { t0: 120, t1: 180, c: 1 }], rests: [], home: { c: 0 }, tensionOf: { 0: 0, 1: 0.4, 3: 0.8 },
    arrivals: [{ bar: 45, t: 90, a: 0.9 }, { bar: 60, t: 120, a: 0.5 }, { bar: 2, t: 4, a: 0.3 }].sort((x, y) => y.a - x.a), bar: 2, duration: 180, ending: null };
  const bare = { runs: [], rests: [], home: null, tensionOf: {}, arrivals: [], bar: 2, duration: 100, ending: null };
  let ok = true;
  const say = (good, line) => { if (!good) ok = false; console.log(`${good ? 'ok  ' : 'BAD '} ${line}`); };
  for (const id of [...Object.keys(TRIGGERS), 'mirror']) {
    const w = findWhoa(id, fromPlain(song)), b = findWhoa(id, fromPlain(bare));
    say(w.t > 0 && w.t <= 180 && b.t >= 0 && b.t <= 100, `${id}: ${w.t} s (${w.why}); on a song with nothing in it: ${b.t} s`);
  }
  say(findWhoa('flower', fromPlain(song)).t === 90, 'Flower lands on the arrival at home');
  say(findWhoa('dusk', fromPlain({ ...song, rests: [{ a: 70, b: 73 }] })).t === 70, 'Dusk takes a rest when there is one');
  say(findWhoa('dusk', fromPlain(song)).t === 176, 'Dusk with no rest takes the end of the song');
  say(findWhoa('dusk', fromPlain({ ...song, ending: { t: 171 } })).t === 171, 'Dusk takes M.ending once it exists');
  say(findWhoa('acid', fromPlain(song)).t === 90, 'Acid goes to the end of the longest chord, its next arrival');
  say(findWhoa('supergraphic', fromPlain(song)).t === 90, 'Supergraphic waits past its forty seconds');
  return ok;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(selftest() ? 0 : 1);
