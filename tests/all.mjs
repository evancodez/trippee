// Everything, in one go: the table in docs/NEXT.md section 4. Writes lab-out/final/report.txt, report.json, and each step's log in lab-out/final/logs.
//
//   node tests/all.mjs                       the lot, about an hour. Run it alone: frame rates mean nothing with other browsers open.
//   node tests/all.mjs --only judge,hash     just those steps. --list names them.
//   node tests/all.mjs --songs ppp,mgmt      the judge on those songs only
//   node tests/all.mjs --quick               smaller samples (10 patterns for frame rates, 40 s of film, fewer pairs), for a check and not a verdict
//   node tests/all.mjs --baseline            keep this run's flat.mjs count and each song's largest luminance step as what "no new failures" and "no worse than baseline" mean
//
// PASS means measured and fine. FAIL means measured and not. PENDING means what it measures hasn't landed yet (a stub, or the test file doesn't exist).
// Exits 1 if anything failed. Thresholds are in tests/judge.mjs and here, and are first guesses.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const flag = n => argv.includes('--' + n);
const OUT = join(ROOT, opt('out', 'lab-out/final')), LOGS = join(OUT, 'logs');
mkdirSync(LOGS, { recursive: true });
const QUICK = flag('quick'), BASE = flag('baseline');
const URLARG = opt('url', null);
const SONGS = opt('songs', 'ppp,wildflower,disclosure,mgmt').split(',');
const FLAT_BASE = join(ROOT, 'lab-out', 'judge', 'flat.json');
const KEEP_GOING_MIN = 90;

// Runs a test through the lab, with sound muted as always. Resolves to its exit code and everything it printed.
function lab(name, script, { env = {}, size = null, minutes = 30, out = null } = {}) {
  const dir = out || join(OUT, name);
  const args = ['tools/lab.mjs', script, '--out', dir];
  if (size) args.push('--size', size);
  if (URLARG) args.push('--url', URLARG);
  return new Promise(res => {
    const t0 = Date.now();
    process.stdout.write(`  ${name} ... `);
    const p = spawn('node', args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    p.stdout.on('data', d => { text += d; }); p.stderr.on('data', d => { text += d; });
    const kill = setTimeout(() => { text += `\nKILLED after ${minutes} minutes\n`; p.kill('SIGTERM'); }, minutes * 60000);
    p.on('close', code => {
      clearTimeout(kill);
      const secs = (Date.now() - t0) / 1000;
      writeFileSync(join(LOGS, `${name}.log`), text);
      console.log(`exit ${code}, ${secs.toFixed(0)} s`);
      res({ name, code, text, secs });
    });
  });
}

const rows = [], consoleBad = [];
const add = (test, status, value, detail = '') => { rows.push({ test, status, value, detail }); console.log(`${status.padEnd(7)} ${test}: ${value}${detail ? '  ' + String(detail).slice(0, 300) : ''}`); };
const merge = (test, status, value, detail) => {
  const r = rows.find(x => x.test === test);
  if (!r) return add(test, status, value, detail);
  const rank = { PENDING: 0, PASS: 1, FAIL: 2 };
  if (rank[status] > rank[r.status]) r.status = status;
  if (value) r.value = r.value ? `${r.value}; ${value}` : value;
  if (detail) r.detail = r.detail ? `${r.detail}\n        ${detail}` : detail;
  console.log(`${status.padEnd(7)} ${test}: ${value}${detail ? '  ' + String(detail).slice(0, 300) : ''}`);
};
const noteConsole = run => {
  const bad = run.text.split('\n').filter(l => /^\s*page (error|exception):/.test(l));
  if (bad.length) consoleBad.push(`${run.name}: ${bad.length}, first ${bad[0].trim().slice(0, 200)}`);
};
const failLines = t => t.split('\n').filter(l => /\bFAIL\b|DIFFERENT|lab failed|KILLED/.test(l));
// A test with no verdict of its own: it passes if it ran, said nothing failed and logged no page errors.
const plain = async (test, name, script, o = {}) => {
  if (!existsSync(join(ROOT, script))) { merge(test, 'PENDING', `${name}: no ${script} yet`); return null; }
  const r = await lab(name, script, o);
  noteConsole(r);
  const f = failLines(r.text);
  merge(test, r.code || f.length ? 'FAIL' : 'PASS', `${name}${r.code || f.length ? ' failed' : ' passed'}`, f.slice(0, 6).join(' | '));
  return r;
};
const jsonLines = t => t.split('\n').map(l => { const m = /(\{.*\})\s*$/.exec(l); if (!m) return null; try { return { line: l, o: JSON.parse(m[1]) }; } catch { return null; } }).filter(Boolean);

const steps = {
  async hash() {
    // Today's pixels against the last baseline saved with MODE=save, for the record: a lane that meant to change pixels saves a new TAG
    const tag = process.env.HASH_TAG || (existsSync(join(ROOT, 'lab-out/hash/stage1.json')) ? 'stage1' : 'base');
    const r = await lab('hash', 'tests/hash.mjs', { env: { MODE: 'check', TAG: tag }, minutes: 5 });
    noteConsole(r);
    const same = /Beyond snap\(0\) byte-identical to black and white: (\d+)\/(\d+)/.exec(r.text);
    if (same) merge('Beyond', same[1] === same[2] ? 'PASS' : 'FAIL', `plate.y 0 byte-identical ${same[1]}/${same[2]}`);
    add(`Hashes against ${tag}`, r.code ? (tag === 'base' ? 'PENDING' : 'FAIL') : 'PASS', r.text.split('\n').find(l => /hash (PASS|FAIL)|DIFFER /.test(l))?.trim() || '', tag === 'base' && r.code ? 'expected to differ once pixels have moved on from bf1a9d2: save TAG=stage1 at the end of Stage 1' : '');
  },
  async flagsoff() {
    if (!existsSync(join(ROOT, 'lab-out/hash/stage1.json'))) { add('Flags off', 'PENDING', 'no post-Stage-1 baseline: MODE=save TAG=stage1 node tools/lab.mjs tests/hash.mjs'); return; }
    const r = await lab('flagsoff', 'tests/hash.mjs', { env: { MODE: 'check', TAG: 'stage1', FLAGS: 'off' }, minutes: 5 });
    noteConsole(r);
    add('Flags off', r.code ? 'FAIL' : 'PASS', r.text.split('\n').find(l => /hash (PASS|FAIL)/.test(l))?.trim() || '', r.code ? r.text.split('\n').filter(l => /DIFFER|mean /.test(l)).slice(0, 6).join(' | ') : '');
  },
  async boot() {
    await plain('Boot', 'integrate', 'tests/integrate.mjs', { minutes: 10 });
    await plain('Boot', 'v2-boot', 'tests/v2.mjs', { env: { STAGE: 'boot' }, minutes: 10 });
  },
  async pops() {
    const r = await lab('pops', 'tests/pops.mjs', { env: { N: QUICK ? '40' : (process.env.N || '400') }, minutes: 45 });
    noteConsole(r);
    const all = jsonLines(r.text).map(x => x.o).filter(o => o.start != null && o.steady != null);
    const med = +(/median biggest step ([\d.]+)/.exec(r.text)?.[1] ?? NaN);
    const popped = all.filter(o => Math.max(o.start, o.end) > Math.max(2 * o.steady, 4));
    const stepped = isNaN(med) ? [] : all.filter(o => o.step > (o.medStep != null ? 3 * o.medStep + 2 : 3 * med + 2));
    add('Pops', r.code || popped.length || stepped.length ? 'FAIL' : 'PASS', `${popped.length} pops, ${stepped.length} big steps among the worst ${all.length} shown`, [...popped.slice(0, 5), ...stepped.slice(0, 5)].map(o => `${o.a}>${o.b} ${o.kind} start ${o.start} end ${o.end} steady ${o.steady} step ${o.step}`).join(' | '));
  },
  async fps() {
    const top = QUICK ? '10' : '999';
    for (const [name, env, size] of [['fps-1080', { GOV: '0', TOP: top }, '1920,1080'], ['fps-retina', { W: '1512', H: '982', DSF: '2', GOV: '0', TOP: top }, '1512,982']]) {
      const r = await lab(name, 'tests/fps.mjs', { env, size, minutes: 30 });
      noteConsole(r);
      const lines = jsonLines(r.text).filter(x => x.o.p95 != null);
      const over = lines.filter(x => x.o.p95 > 17.5);
      merge('Frame rate', r.code || over.length || !lines.length ? 'FAIL' : 'PASS', `${name}: ${lines.length} patterns, worst p95 ${Math.max(0, ...lines.map(x => x.o.p95))} ms`, over.slice(0, 8).map(x => x.line.trim().slice(0, 100)).join(' | '));
    }
    const secs = QUICK ? '40' : '100';
    const f = await lab('film-realtime', 'tests/film.mjs', { env: { SONG: 'media/ppp.mp3', SECS: secs }, size: '1920,1080', minutes: 10 });
    noteConsole(f);
    const m = /real time (\{.*\})/.exec(f.text); const o = m ? JSON.parse(m[1]) : null;
    if (!o) merge('Frame rate', 'FAIL', 'the film in real time gave no numbers', f.text.slice(-300));
    else merge('Frame rate', o.fps >= 58 && o.p99 <= 20 && o.max <= 50 && o.tier === 0 ? 'PASS' : 'FAIL', `film ${secs} s: ${o.fps} fps, p99 ${o.p99}, max ${o.max}, tier ${o.tier}`, 'want fps >= 58, p99 <= 20, max <= 50, tier unchanged');
  },
  async flat() {
    const r = await lab('flat', 'tests/flat.mjs', { minutes: 15 });
    noteConsole(r);
    const n = +(/with a flat shape over [\d.]+% of the frame (\d+)/.exec(r.text)?.[1] ?? NaN);
    if (BASE && !isNaN(n)) { mkdirSync(dirname(FLAT_BASE), { recursive: true }); writeFileSync(FLAT_BASE, JSON.stringify({ count: n, saved: new Date().toISOString() })); }
    const was = existsSync(FLAT_BASE) ? JSON.parse(readFileSync(FLAT_BASE, 'utf8')).count : null;
    merge('One colour', isNaN(n) || (was != null ? n > was : n > 12) ? 'FAIL' : 'PASS', `flat.mjs: ${n} morphs pass through a flat shape${was != null ? `, baseline ${was}` : ', no baseline'}`);
  },
  async judge() {
    const dir = join(OUT, 'judge'), perSong = {};
    for (const s of SONGS) {
      const env = { SONG: `media/${s}.mp3`, ...(BASE ? { BASELINE: 'save' } : {}), ...(QUICK ? { STAGE: 'boot,film,purity,variety,closure,countdown,rest,wave', BALANCE_STEP: '2' } : {}) };
      const r = await lab(`judge-${s}`, 'tests/judge.mjs', { env, minutes: KEEP_GOING_MIN, out: dir });
      noteConsole(r);
      const file = join(dir, `judge-${s}.json`);
      if (r.code || !existsSync(file)) { merge('Judge ran', 'FAIL', `${s}: exit ${r.code}`, r.text.slice(-400)); continue; }
      merge('Judge ran', 'PASS', s);
      perSong[s] = JSON.parse(readFileSync(file, 'utf8'));
    }
    const names = [...new Set(Object.values(perSong).flatMap(j => j.rows.map(r => r.test)))];
    for (const test of names) {
      if (test === 'Console') continue;   // gathered with everything else below
      if (test === 'Breath') continue;    // its own rule, below
      for (const s in perSong) {
        const r = perSong[s].rows.find(x => x.test === test);
        if (r) merge(test, r.status, `${s}: ${r.value}`, r.status === 'FAIL' ? `${s}: ${r.detail}` : '');
      }
    }
    // Breath passes on 3 songs of 4
    const br = Object.entries(perSong).map(([s, j]) => ({ s, r: j.rows.find(x => x.test === 'Breath') })).filter(x => x.r);
    if (br.length) {
      const measured = br.filter(x => x.r.status !== 'PENDING');
      if (!measured.length) add('Breath', 'PENDING', br.map(x => `${x.s} ${x.r.value}`).join('; '), 'understand() has not landed');
      else { const ok = measured.filter(x => x.r.status === 'PASS'); add('Breath', ok.length >= Math.min(3, measured.length) ? 'PASS' : 'FAIL', `${ok.length}/${measured.length} songs`, measured.map(x => `${x.s}: ${x.r.value}`).join('; ')); }
    }
    for (const s in perSong) for (const e of perSong[s].errors || []) consoleBad.push(`judge ${s}: ${e.slice(0, 200)}`);
    for (const s in perSong) { const g = perSong[s].rows.find(x => x.test === 'Console'); if (g?.status === 'FAIL') consoleBad.push(`judge ${s}: ${g.value}`); }
  },
  async interact() {
    await plain('Interaction', 'pick', 'tests/pick.mjs', { minutes: 20 });
    await plain('Interaction', 'tools', 'tests/tools.mjs', { minutes: 20 });
    await plain('Interaction', 'toolsound', 'tests/toolsound.mjs', { minutes: 20 });
    await plain('Interaction', 'hand', 'tests/hand.mjs', { minutes: 10 });
    await plain('Interaction', 'effects', 'tests/effects.mjs', { minutes: 15 });
  },
  async others() {
    await plain('Other tests', 'beyond', 'tests/beyond.mjs', { minutes: 5 });
    await plain('Other tests', 'sound', 'tests/sound.mjs', { minutes: 5 });
    await plain('Other tests', 'songend', 'tests/songend.mjs', { minutes: 10 });
    await plain('Other tests', 'v2-modes', 'tests/v2.mjs', { env: { STAGE: 'static,hand,music,clock,film' }, minutes: 15 });
    await plain('Other tests', 'understand', 'tests/understand.mjs', { minutes: 5 });
  },
};

if (flag('list')) { console.log(Object.keys(steps).join(' ')); process.exit(0); }
const only = opt('only', null)?.split(',');
const t0 = Date.now();
for (const name of Object.keys(steps)) {
  if (only && !only.includes(name)) continue;
  console.log(`\n--- ${name}`);
  try { await steps[name](); } catch (e) { add(name, 'FAIL', 'the step itself broke', e.message); }
}
add('Console', consoleBad.length ? 'FAIL' : 'PASS', `${consoleBad.length} steps with page errors`, consoleBad.slice(0, 10).join('\n        '));

// In the order of the table
const ORDER = ['Pops', 'Console', 'Frame rate', 'One colour', 'Noise', 'Stasis', 'Jerk on pulses', 'Flash', 'Balance', 'Breath', 'Wave', 'Rest', 'Closure', 'Countdown reads', 'Purity', 'Beyond', 'Variety', 'Boot', 'Boot (first probe)', 'Flags off', 'Interaction'];
rows.sort((a, b) => { const i = ORDER.indexOf(a.test), j = ORDER.indexOf(b.test); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j); });
const counts = { PASS: 0, FAIL: 0, PENDING: 0 }; rows.forEach(r => counts[r.status]++);
let rev = '?'; try { rev = execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim() + (execSync('git status --short src', { cwd: ROOT, encoding: 'utf8' }).trim() ? ' with uncommitted changes' : ''); } catch { /* no matter */ }
const report = [
  `trippee, the final report. ${new Date().toISOString()}, ${rev}${QUICK ? ', QUICK samples: a check, not a verdict' : ''}${URLARG ? `, from ${URLARG}` : ''}`,
  `${counts.PASS} pass, ${counts.FAIL} fail, ${counts.PENDING} pending, in ${((Date.now() - t0) / 60000).toFixed(0)} minutes`,
  'No test here proves a move feels musical. Watch it with a song.',
  '',
  ...rows.map(r => `${r.status.padEnd(7)} ${r.test}: ${r.value}${r.detail ? `\n        ${r.detail}` : ''}`),
  '',
  `Each song's sheet, slices and flagged stretches are in ${join(OUT, 'judge')}. Logs are in ${LOGS}.`,
].join('\n');
writeFileSync(join(OUT, 'report.txt'), report + '\n');
writeFileSync(join(OUT, 'report.json'), JSON.stringify({ rows, counts, rev, when: new Date().toISOString(), quick: QUICK }, null, 1));
console.log('\n' + report);
process.exit(counts.FAIL ? 1 : 0);
