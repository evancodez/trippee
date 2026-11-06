// node diff.mjs <dir> <song> <which> <tagA> <tagB>: which frames of a film differ between two trees, and how much
import { readFileSync } from 'node:fs';
const [dir, song, which, a, b] = process.argv.slice(2);
const A = JSON.parse(readFileSync(`${dir}/${song}.${which}.${a}.json`)), B = JSON.parse(readFileSync(`${dir}/${song}.${which}.${b}.json`));
const n = Math.min(A.frames.length, B.frames.length);
let same = 0; const spans = []; let cur = null, worst = 0;
for (let i = 0; i < n; i++) {
  const x = A.frames[i], y = B.frames[i], eq = x.s === y.s;
  let d = 0; for (let k = 0; k < x.thumb.length; k++) d += Math.abs(x.thumb[k] - y.thumb[k]); d /= x.thumb.length;
  if (eq) { same++; cur = null; } else { worst = Math.max(worst, d); if (!cur) spans.push(cur = { a: x.t, b: x.t, d, ids: new Set([x.id + '>' + y.id]) }); else { cur.b = x.t; cur.d = Math.max(cur.d, d); cur.ids.add(x.id + '>' + y.id); } }
}
console.log(`${song} ${which} ${a} vs ${b}: ${same} of ${n} frames byte-identical, load ${A.loadS.toFixed(1)} vs ${B.loadS.toFixed(1)} s, rehearsal ${(A.reh||0).toFixed(1)} vs ${(B.reh||0).toFixed(1)} s, arrival ${A.arrival} vs ${B.arrival}`);
for (const s of spans) console.log(`  differ ${s.a}-${s.b} worst mean thumb diff ${s.d.toFixed(1)}/255 ${[...s.ids].slice(0, 3).join(' ')}`);
const pr = G => `${G.t0}-${G.t1} m${G.morph} ${G.id}${G.hero ? ' H:' + G.hero : ''}${G.xform ? ' X:' + G.xform : ''}${G.moves.length ? ' [' + G.moves.join(',') + ']' : ''}${G.rise != null ? (G.rise ? ' rise' : ' dive') : ''}${G.calm ? ' calm' : ''}${G.phiScale ? ' phi' + G.phiScale : ''}${G.peak ? ' q' + G.peak : ''}`;
const la = A.gestures.map(pr), lb = B.gestures.map(pr), sa = new Set(la), sb = new Set(lb);
const gone = la.filter(x => !sb.has(x)), added = lb.filter(x => !sa.has(x));
console.log(`  gestures ${la.length} vs ${lb.length}; only in ${a}: ${gone.length}, only in ${b}: ${added.length}`);
for (const g of gone) console.log(`   - ${g}`);
for (const g of added) console.log(`   + ${g}`);
const kinds = L => { const c = {}; for (const G of L.gestures) for (const k of [G.hero, G.xform, ...G.moves.filter(m => m !== 'cue')].filter(Boolean)) c[k] = (c[k] || 0) + 1; return JSON.stringify(c); };
console.log(`  kinds ${a}: ${kinds(A)}`); console.log(`  kinds ${b}: ${kinds(B)}`);
console.log(`  fixes ${a}: ${JSON.stringify(A.fixes)}`); console.log(`  fixes ${b}: ${JSON.stringify(B.fixes)}`);
console.log(`  left ${a}: ${JSON.stringify(A.left)}  left ${b}: ${JSON.stringify(B.left)}`);
