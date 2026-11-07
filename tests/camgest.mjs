// The gestures of each film, as a list, and what each pattern's numbers allow a camera. No picture.
export default async ({ page, log, save, sleep }) => {
  const songs = (process.env.SONGS || 'mgmt,ppp,wildflower,disclosure').split(','), seed = +(process.env.SEED || 7), url = await page.eval('location.href');
  for (let k = 0; k < songs.length; k++) {
    const song = songs[k];
    if (k) { await page.goto(url); for (let i = 0; i < 200; i++) { let ok = false; try { ok = await page.eval('window.trippee?.ready===true'); } catch { } if (ok) break; await sleep(250); } }
    await page.eval(`app.manual=true;window.__done=false;window.__err=null;trippee.song('/media/${song}.mp3',{autoplay:false,seed:${seed}}).then(()=>window.__done=true,e=>window.__err=String(e));0`);
    for (let i = 0; i < 3000; i++) { if (await page.eval('window.__done||!!window.__err')) break; await sleep(200); }
    const r = await page.eval(async () => {
      const { fillSlot, fineness } = await import(new URL('src/score/slot.js', location.href).href);
      const { OFF, SLOT_FLOATS } = await import(new URL('src/pattern/layout.js', location.href).href);
      const s = new Float32Array(SLOT_FLOATS), S = app.song.score, out = [];
      for (const G of S.gestures) { const t = (G.t0 + G.t1) / 2; fillSlot(s, G, t, G.pattern, { phi: 0 });
        const fams = []; for (let i = 0; i < 4; i++) if (s[OFF[`f${i}.on`]] > 0.5 && Math.abs(s[OFF[`f${i}.d`]]) < 1.01) { const g = n => +s[OFF[`f${i}.${n}`]].toFixed(1); fams.push(`${g('x') || g('y') ? 'P' : ''}${g('r1') ? 'r' : ''}${g('l1') ? 'l' : ''}${g('t1') ? 't' : ''}${g('r2') || g('l2') || g('t2') ? '2' : ''}`); }
        const w = []; for (const n of ['fold.n', 'swirl.a', 'swirl.log', 'bulge.a', 'squeeze.a', 'bowtie.a', 'bend1.a', 'ripple.a', 'zig.a', 'teeth.a', 'conf.amt', 'droste.lnS', 'ribbon.on', 'blobs.on', 'matte.kind', 'slip.kind', 'star.k', 'field.kind', 'lathe.k', 'meta.amt']) if (Math.abs(s[OFF[n]]) > 1e-4) w.push(n.split('.')[0]);
        out.push(`${G.t0.toFixed(0).padStart(4)}-${G.t1.toFixed(0).padEnd(4)} ${G.pattern.id.padEnd(22)} k${fineness(s).toFixed(1).padStart(5)} s${s[OFF.scale].toFixed(2)} ${s[OFF['surf.kind']]}${s[OFF['surf.map']]} [${fams.join(' ')}] ${w.join(',')} ${G.hero ? 'HERO ' + G.hero : ''} ${(G.moves || []).map(m => m.id + (m.seq ? ':' + m.seq : '')).join(',')} ${G.xform?.id ?? ''}`); }
      return { out, seg: app.song.analysis.segments.map(x => `${x.t0.toFixed(0)}:${x.label}`).join(' ') };
    });
    log(song, r.seg); log(r.out.join('\n'));
  }
};
