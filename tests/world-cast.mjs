// What the modes cast: src/score/woah.js's tricks, in each mode's own film, read from W.woah in the mode's file. Muted, like every browser here.
//   STAGE=list  SONGS=mgmt,wildflower WORLDS=flower,dusk,flyer,pearl     each mode's film composed on each song: the tricks it casts, where, and on what. Quick: no world is drawn.
//   STAGE=sheet SONG=media/mgmt.mp3 WORLDS=flower,...                    into each mode as a person gets there, and every trick it casts as a row of frames from its own film, to look at. sheet-<world>-<song>.jpg
// The film's own (no mode) is listed first with STAGE=list, as the measure: one every 30 to 50 s, more on loud songs.
import { resolve, basename } from 'node:path';
import { dropSong, enterWorld } from '../tools/look.mjs';

const want = (process.env.STAGE || 'list').split(',');
const WORLDS = (process.env.WORLDS || 'flower,dusk,flyer,pearl').split(',');

export default async ({ page, log, save, sleep }) => {
  if (want.includes('list')) {
    const songs = (process.env.SONGS || 'mgmt,wildflower').split(',');
    for (const name of songs) {
      const r = await page.eval(async (name, worlds) => {
        const song = app.song;
        app.governor.enabled = false; app.R.drawScale = 1; app.manual = true;
        await song.load(`/media/${name}.mp3`, { seed: 7 });
        const A = song.analysis;
        await song.extrasReady().catch(() => null);
        const { compose } = await import(new URL('src/score/compose.js', location.href).href);
        const eng = await import(new URL('src/worlds/engine.js', location.href).href);
        const aspect = 16 / 9, out = [];
        const row = (id, F) => {
          const g = F.gestures, list = F.woah?.list ?? [];
          const gaps = list.slice(1).map((x, i) => +(x.at - list[i].at).toFixed(1));
          return { id, n: list.length, dur: +A.duration.toFixed(0), every: list.length ? +((A.duration - 13) / list.length).toFixed(1) : null, gaps: gaps.join(' '), stats: F.stats?.woah ?? '', list: list.map(x => `${x.id}@${x.at} ${x.t0}-${x.t1} on ${x.pattern}${x.why ? ' (' + x.why + ')' : ''}`), bare: g.filter(G => !G.moves?.length && !G.hero).length, gestures: g.length,
            bodies: g.map(G => +(G.t1 - (G.morph || 0) - G.t0).toFixed(1)).join(' '), k: g.filter(G => G.k != null).length, drive: g.filter(G => G.pattern.drive).length, moves: [...new Set(g.flatMap(G => (G.moves ?? []).filter(m => !m.woah).map(m => m.id)))].join(' ') };
        };
        out.push(row('film', compose(A, 7, { patterns: app.patterns, aspect })));
        for (const id of worlds) {
          const W = await eng.loadWorld(id);
          if (!W) { out.push({ id, missing: true }); continue; }
          try { out.push(row(id, compose(A, 7, { patterns: W._pool, aspect, world: W }))); } catch (e) { out.push({ id, threw: String(e?.stack ?? e).slice(0, 400) }); }
        }
        return out;
      }, name, WORLDS);
      for (const x of r) {
        log(`${name} ${x.id}: ${x.n} tricks in ${x.dur} s, one every ${x.every} s; gaps ${x.gaps}; bare gestures ${x.bare}/${x.gestures}${x.threw ? ' THREW ' + x.threw : ''}`);
        if (process.env.WHY) log(`    bodies ${x.bodies}; with k ${x.k}, drive ${x.drive}; its own moves: ${x.moves}`);
        for (const l of x.list ?? []) log('   ', l);
      }
    }
  }

  if (want.includes('sheet')) {
    const songPath = process.env.SONG || 'media/mgmt.mp3', song = basename(songPath).replace(/\.\w+$/, '');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
    await sleep(400);
    await dropSong(page, songPath, { resolvePath: resolve, sleep });
    for (const id of WORLDS) {
      await enterWorld(page, id, log);
      const r = await page.eval(async () => {
        const s = app.stage.score, list = s.woah?.list ?? [], tw = 240, th = 135, KS = [0.15, 0.35, 0.5, 0.65, 0.85], cols = KS.length;
        const cv = document.createElement('canvas'); cv.width = cols * tw; cv.height = Math.max(1, list.length) * th;
        const g = cv.getContext('2d'); g.font = '11px monospace';
        const rows = [];
        for (let r = 0; r < list.length; r++) {
          const x = list[r], seen = [];
          for (let c = 0; c < cols; c++) {
            const t = x.t0 + (x.t1 - x.t0) * KS[c];
            trippee.seek(t);
            for (let k = 0; k < 40 && app.lastFrame.N && !app.lastFrame.kind && app.lastFrame.morph; k++) { await new Promise(r => setTimeout(r, 4)); trippee.seek(t); }
            const f = app.lastFrame, X = c * tw, Y = r * th;
            g.drawImage(trippee.canvas, X, Y, tw, th);
            const worn = (f.G?.moves ?? []).filter(m => m.woah && t >= (m.from ?? 0) && t <= (m.to ?? 1e9)).map(m => m.id).join('+');
            const lab = `${t.toFixed(1)} ${x.id}${c === 0 ? ' ' + (f.G?.pattern?.id ?? '') : ''}`;
            g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(X, Y, g.measureText(lab).width + 6, 14); g.fillStyle = '#fff'; g.fillText(lab, X + 3, Y + 11);
            seen.push(worn || '-');
            await new Promise(r => setTimeout(r));
          }
          rows.push(`${x.id}@${x.at} ${x.t0}-${x.t1} on ${x.pattern}: worn ${seen.join(' ')}`);
        }
        return { sheet: list.length ? cv.toDataURL('image/jpeg', 0.85) : null, rows, world: app.stage.world?.id };
      });
      log(`${id} on ${song}: ${r.rows.length} tricks`);
      for (const l of r.rows) log('   ', l);
      if (r.sheet) save(`sheet-${id}-${song}.jpg`, r.sheet);
    }
    const errs = page.logs.filter(l => /\[error\]|\[exception\]/.test(l)); if (errs.length) log('page errors', errs.slice(0, 6).join('\n'));
  }
};
