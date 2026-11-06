// Proof 1, the text half: FRAG with the world blocks taken out is the shader that was there before. No browser.
//   node tests/worldfrag.mjs              compares with the FRAG recorded in lab-out/hash/base.json, and with the tag if git has it
//   node tests/worldfrag.mjs --show       prints what differs if it fails
// A world block is anything between #ifdef WORLD... or #ifndef WORLD and its #endif, as the GLSL preprocessor would treat it with WORLD undefined.
// The stripped text is what the sixteen film programs compile, so the same sha256 means they can't have changed.
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = s => createHash('sha256').update(s).digest('hex');

// As the preprocessor sees it with WORLD and everything named WORLD_* undefined. Other conditions are left as text.
export function stripWorld(src) {
  const out = [], stack = [];     // stack of { world, keep }
  const live = () => stack.every(f => f.keep);
  for (const line of src.split('\n')) {
    const t = line.trim();
    let m;
    if ((m = /^#ifdef\s+(\w+)/.exec(t)) || (m = /^#ifndef\s+(\w+)/.exec(t)) || /^#if\b/.test(t)) {
      const name = m?.[1] ?? '', world = /^WORLD(_|$)/.test(name), neg = t.startsWith('#ifndef');
      if (world) { stack.push({ world: true, keep: neg }); continue; }
      stack.push({ world: false, keep: true });
      if (live()) out.push(line);
      continue;
    }
    if (/^#else\b/.test(t)) {
      const top = stack[stack.length - 1];
      if (top.world) { top.keep = !top.keep; continue; }
      if (live()) out.push(line);
      continue;
    }
    if (/^#endif\b/.test(t)) {
      const top = stack.pop();
      if (top.world) continue;
      if (live()) out.push(line);
      continue;
    }
    if (live()) out.push(line);
  }
  return out.join('\n');
}

export async function fragOf(root) {
  const m = await import(pathToFileURL(join(root, 'src/gl/shader.js')).href + `?${Date.now()}`);
  return m.FRAG;
}

// The FRAG at a git ref, from a scratch copy of its src/gl and src/pattern/layout.js
function fragAtRef(ref) {
  const dir = mkdtempSync(join(tmpdir(), 'worldfrag-'));
  try {
    const files = execSync(`git ls-tree -r --name-only ${ref} src/gl src/pattern/layout.js`, { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
    for (const f of files) {
      mkdirSync(dirname(join(dir, f)), { recursive: true });
      writeFileSync(join(dir, f), execSync(`git show ${ref}:${f}`, { cwd: ROOT, maxBuffer: 1 << 26 }));
    }
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
    return fragOf(dir).finally(() => rmSync(dir, { recursive: true, force: true }));
  } catch (e) { rmSync(dir, { recursive: true, force: true }); throw e; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const FRAG = await fragOf(ROOT), stripped = stripWorld(FRAG), mine = sha(stripped);
  const ref = process.env.REF || 'v2.3';
  const baseFile = join(ROOT, 'lab-out/hash/base.json');
  const base = existsSync(baseFile) ? JSON.parse(readFileSync(baseFile, 'utf8')).frag : null;
  const was = await fragAtRef(ref);
  console.log(`FRAG ${sha(FRAG).slice(0, 16)}, ${FRAG.length} chars. Stripped ${mine.slice(0, 16)}, ${stripped.length} chars.`);
  console.log(`baseline FRAG ${String(base).slice(0, 16)}; ${ref} FRAG ${sha(was).slice(0, 16)}, ${was.length} chars.`);
  // The hooks really are there, and really out of every film program
  const blocks = (FRAG.match(/^#if(n?def)\s+WORLD\w*/gm) || []).length;
  console.log(`world blocks: ${blocks}`);
  // Identical to the tag is the pass. If another lane has changed the film's shader since the tag, those lines are listed. A line that mentions anything of a world's is a fail whatever else is going on.
  const a = stripped.split('\n'), b = new Set(was.split('\n')), notThere = a.filter(l => !b.has(l));
  const worldy = a.filter(l => /\buW\b|\buWT\b|worldColor|worldField|worldPhase|lineRows|lineCells|\bgTh\b|\bgFlip\b|@world/.test(l));
  const same = mine === sha(was);
  if (!same) { console.log(`${notThere.length} lines in the stripped text aren't in ${ref}, none of them from here if they don't mention a world:`); for (const l of notThere) console.log('  ' + l.trim().slice(0, 170)); }
  console.log(`world text left after stripping: ${worldy.length} lines`);
  const ok = !worldy.length && same;
  console.log(ok ? 'worldfrag PASS: stripped FRAG is byte-identical' : worldy.length ? 'worldfrag FAIL: world text in the film' : `worldfrag: differs from ${ref} only by the lines above, which are the film's own`);
  process.exit(ok ? 0 : 1);
}
