// The picture plays. Run: node tools/lab.mjs tests/sound.mjs --out lab-out/sound   (sound is muted by the lab, nothing is ever heard)
// Offline: steps the real picture frame by frame, feeds the real read line and musician, and renders every note through the real
// graph in an OfflineAudioContext, then measures it and draws a piano roll and a spectrogram of each pattern.
// PATTERNS=a,b,c  SECONDS=26  STAGE=offline,live,hand,flow,keylog
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const sleep = ms => new Promise(r => setTimeout(r, ms));

export default async ({ page, log, save, out }) => {
  const stage = process.env.STAGE || 'offline,flow,live';
  const want = s => stage.split(',').includes(s);
  const SECONDS = +(process.env.SECONDS || 26);
  const IDS = (process.env.PATTERNS || 'lines.river,lines.bowtie,checks.floor,checks.target,dots.sheet,dots.inflate,pole.rosette,pole.dipole,lattice.master,rooms.nested,void.door,body.planet,waves.swell').split(',');

  await page.eval(() => {
    window.__render = async function (id, seconds, { seed = 12, edits = null, speed = 1, arcs = true, stem = null, wander = false, fps: fpsIn = 30, morph = null } = {}) {
      const [{ Synth }, { Brain }, { Reader, features }] = await Promise.all([import('/src/sound/synth.js'), import('/src/sound/brain.js'), import('/src/sound/read.js')]);
      if (morph) trippee.morph(morph[0], morph[1], morph[2], morph[3]);
      else if (!wander) trippee.load(id, { arcs });
      const sr = 44100, tail = 3;
      const off = new OfflineAudioContext(2, sr * (seconds + tail), sr);
      const synth = new Synth(off, seed);
      synth.output.connect(off.destination);
      synth.fadeTo(1, 0, 0.3);
      if (stem) { if (stem !== 'pad') synth.padTrim.gain.value = 0; if (stem !== 'arp') synth.arpTrim.gain.value = 0; if (stem !== 'low') synth.lowBus.gain.value = 0; }
      const brain = new Brain(synth, seed);
      const reader = window.__reader ||= new Reader(app.R);
      const fps = fpsIn, dt = 1 / fps, marks = []; let lastPat = null, lastT = 0, lastChord = null;
      const base = app.stage.score.phi;
      const phi0 = 0;
      if (speed !== 1) app.stage.score.phi = (t, G) => base(t, G) * speed;
      let t = 0;
      const pics = [];
      const thumb = document.createElement('canvas'); thumb.width = 192; thumb.height = 108;
      const tg = thumb.getContext('2d');
      for (let i = 0; t < seconds; i++, t += dt) {
        if (edits) edits(app.edits, t);
        trippee.step(dt);
        reader.now();
        const Fr = features(app, reader);
        brain.frame(t, Fr);
        const label = Fr.A.id + (Fr.B ? '>' + Fr.B.id : '');
        if (label !== lastPat) { marks.push({ t: +t.toFixed(2), what: label }); lastPat = label; }
        if (lastT < 0.5 && Fr.T >= 0.5) marks.push({ t: +t.toFixed(2), what: 'T=0.5' });
        lastT = Fr.T;
        if (brain.chord && brain.chord.name !== lastChord) { marks.push({ t: +t.toFixed(2), what: 'chord ' + brain.chord.name + ' pad ' + brain.pad.join(',') }); lastChord = brain.chord.name; }
        if (i % Math.round(fps * seconds / 6) === 0) { tg.drawImage(app.canvas, 0, 0, 192, 108); pics.push(thumb.toDataURL('image/jpeg', 0.7)); }
      }
      app.stage.score.phi = base;
      const buf = await off.startRendering();
      const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length;
      // measurements, skipping the first second of fade-in
      const from = sr * 1;
      let peak = 0, sum = 0, clip = 0, side = 0;
      for (let i = from; i < n; i++) { const a = Math.abs(L[i]), b = Math.abs(R[i]); if (a > peak) peak = a; if (b > peak) peak = b; if (a >= 0.999 || b >= 0.999) clip++; sum += (L[i] * L[i] + R[i] * R[i]) / 2; side += (L[i] - R[i]) * (L[i] - R[i]) / 4; }
      const rms = Math.sqrt(sum / (n - from));
      // windowed loudness: the worst 400ms, so a sudden loud event would show
      let maxWin = 0, minWin = 1e9; const win = Math.floor(sr * 0.4), wins = [];
      for (let w = from; w + win < sr * seconds; w += win) { let s = 0; for (let i = w; i < w + win; i++) s += L[i] * L[i] + R[i] * R[i]; s = Math.sqrt(s / (2 * win)); wins.push(+(20 * Math.log10(s + 1e-9)).toFixed(1)); if (s > maxWin) maxWin = s; if (s < minWin) minWin = s; }
      // spectrogram on a log frequency axis
      const N = 2048, hop = 1024, frames = Math.floor((n - N) / hop);
      const bins = 200, fLo = 30, fHi = 16000;
      const S = new Float32Array(frames * bins);
      const re = new Float64Array(N), im = new Float64Array(N);
      const han = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
      const rev = new Uint32Array(N); { const b = Math.log2(N); for (let i = 0; i < N; i++) { let r = 0; for (let j = 0; j < b; j++) if (i & (1 << j)) r |= 1 << (b - 1 - j); rev[i] = r; } }
      const bands = [[20, 120], [120, 500], [500, 2000], [2000, 6000], [6000, 20000]], E = [0, 0, 0, 0, 0];
      for (let fr = 0; fr < frames; fr++) {
        for (let i = 0; i < N; i++) { const j = rev[i]; re[j] = (L[fr * hop + i] + R[fr * hop + i]) * 0.5 * han[i]; im[j] = 0; }
        for (let size = 2; size <= N; size *= 2) {
          const h = size / 2, st = -2 * Math.PI / size;
          for (let i = 0; i < N; i += size) for (let j = 0; j < h; j++) {
            const a = st * j, c = Math.cos(a), s = Math.sin(a), k = i + j, m = k + h;
            const tr = re[m] * c - im[m] * s, ti = re[m] * s + im[m] * c;
            re[m] = re[k] - tr; im[m] = im[k] - ti; re[k] += tr; im[k] += ti;
          }
        }
        for (let k = 1; k < N / 2; k++) {
          const f = k * sr / N, p = re[k] * re[k] + im[k] * im[k];
          bands.forEach(([a, b], bi) => { if (f >= a && f < b) E[bi] += p; });
          const y = Math.floor(Math.log(f / fLo) / Math.log(fHi / fLo) * bins);
          if (y >= 0 && y < bins) S[fr * bins + y] = Math.max(S[fr * bins + y], p);
        }
      }
      const total = E.reduce((a, b) => a + b, 0) || 1;
      const notes = brain.log;
      // the picture: thumbnails, then piano roll, then spectrogram
      const Wd = 1100, rollH = 220, specH = 200, thumbH = 92;
      const c = document.createElement('canvas'); c.width = Wd; c.height = thumbH + rollH + specH + 20;
      const g = c.getContext('2d');
      g.fillStyle = '#101014'; g.fillRect(0, 0, c.width, c.height);
      const imgs = await Promise.all(pics.map(p => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = p; })));
      imgs.slice(0, 6).forEach((im, i) => g.drawImage(im, i * Wd / 6, 0, Wd / 6 - 2, thumbH));
      const colors = { glass: '#7fd8ff', bell: '#ffd27f', pluck: '#9fffb0', analog: '#ff9fd0', stab: '#ff8a70', pulse: '#c0a0ff', swell: '#a0c0ff', ping: '#fff', bass: '#ff5050', sub: '#ff5050' };
      const toX = tt => tt / (seconds + tail) * Wd;
      const y0 = thumbH + 6, mLo = 24, mHi = 96, toY = m => y0 + rollH - (m - mLo) / (mHi - mLo) * rollH;
      g.strokeStyle = '#2a2a33'; for (let m = 36; m <= 96; m += 12) { g.beginPath(); g.moveTo(0, toY(m)); g.lineTo(Wd, toY(m)); g.stroke(); }
      for (const nt of notes) { g.fillStyle = colors[nt.v] || '#fff'; g.globalAlpha = 0.45 + nt.vel * 0.55; g.fillRect(toX(nt.t), toY(nt.m) - 1.5, Math.max(2, toX(nt.d)), 3); }
      g.globalAlpha = 1;
      g.fillStyle = '#ddd'; g.font = '12px monospace'; g.fillText(id + '  ' + notes.filter(x => x.r === 'main').length + ' main notes', 6, y0 + 12);
      const yS = y0 + rollH + 8, img = g.createImageData(Wd, specH);
      for (let x = 0; x < Wd; x++) {
        const fr = Math.min(frames - 1, Math.floor(x / Wd * frames));
        for (let y = 0; y < specH; y++) {
          const b = Math.floor((1 - y / specH) * bins), p = S[fr * bins + Math.min(bins - 1, b)];
          const db = 10 * Math.log10(p + 1e-9), v = Math.max(0, Math.min(1, (db + 40) / 70));
          const o = (y * Wd + x) * 4;
          img.data[o] = 255 * Math.min(1, v * 1.6); img.data[o + 1] = 255 * v * v; img.data[o + 2] = 255 * (0.25 + 0.75 * v) * (1 - v * 0.6) * (v > 0.02 ? 1 : 0); img.data[o + 3] = 255;
        }
      }
      g.putImageData(img, 0, yS);
      synth.fadeTo(0, 0, 0.01);
      return {
        id, family: app.byId[id]?.family, marks, wins, peak: +peak.toFixed(3), rmsDb: +(20 * Math.log10(rms + 1e-9)).toFixed(1), peakDb: +(20 * Math.log10(peak + 1e-9)).toFixed(1), clip,
        sideRatio: +(Math.sqrt(side / (n - from)) / (rms + 1e-9)).toFixed(2), loudestWinDb: +(20 * Math.log10(maxWin + 1e-9)).toFixed(1), quietestWinDb: +(20 * Math.log10(minWin + 1e-9)).toFixed(1),
        bands: E.map(v => +(10 * Math.log10(v / total + 1e-9)).toFixed(1)), notes, png: c.toDataURL('image/png'), tonic: brain.key.tonic, pcs: brain.key.pcs, inKey: notes.every(nt => brain.key.inKey(nt.m)),
      };
    };
  });

  const stat = (notes, seconds) => {
    const main = notes.filter(n => n.r === 'main');
    const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    const bySteps = new Map(); for (const n of main) bySteps.set(n.t.toFixed(2), (bySteps.get(n.t.toFixed(2)) || 0) + 1);
    return {
      mainPerS: +(main.length / seconds).toFixed(2), lowPerS: +(notes.filter(n => n.r === 'low').length / seconds).toFixed(2),
      meanMidi: +mean(main.map(n => n.m)).toFixed(1), lo: main.length ? Math.min(...main.map(n => n.m)) : null, hi: main.length ? Math.max(...main.map(n => n.m)) : null,
      maxPerStep: Math.max(0, ...bySteps.values()), S: [...new Set(main.map(n => n.S))].join('/'), voices: [...new Set(notes.filter(n => n.r !== 'pad').map(n => n.v))].join(','), chords: [...new Set(notes.map(n => n.c))].join(' '),
      distinct: new Set(main.map(n => n.m)).size,
    };
  };

  if (want('offline')) {
    const rows = [];
    for (const id of IDS) {
      const t0 = Date.now();
      const r = await page.eval(`__render(${JSON.stringify(id)}, ${SECONDS})`);
      save(`roll-${id}.png`, r.png);
      writeFileSync(join(out, `notes-${id}.json`), JSON.stringify(r.notes));
      const s = stat(r.notes, SECONDS);
      rows.push({ id, ...s, peakDb: r.peakDb, rmsDb: r.rmsDb, clip: r.clip, loudest: r.loudestWinDb, quietest: r.quietestWinDb, side: r.sideRatio, bands: r.bands, inKey: r.inKey });
      log(id.padEnd(16), JSON.stringify({ ...rows[rows.length - 1], id: undefined }), `(${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }
    log('all in key:', rows.every(r => r.inKey), 'no clipping:', rows.every(r => r.clip === 0));
  }

  // Plain patterns, so the read can be checked against what it should do.
  if (want('plain')) {
    await page.eval(async () => {
      const add = (id, family, g, flow = { 'f0.ph': 1 }) => { const p = { id, name: id, family, g, flow, arcs: [] }; app.byId[id] = p; };
      const K = await import('/src/pattern/kit.js');
      add('t.vert', 'lines', { fams: [{ x: 3 }] });
      add('t.vertfine', 'lines', { fams: [{ x: 7 }] });
      add('t.horiz', 'lines', { fams: [{ y: 3 }] });
      add('t.diag', 'lines', { fams: [{ x: 2.5, y: 2.5 }] });
      add('t.check', 'checks', { fams: [{ x: 2.5 }, { y: 2.5 }] }, { 'f0.ph': 1 });
      add('t.dots', 'dots', { fams: [{ x: 2.5 }, { y: 2.5 }], round: 1, theta: 0.55 }, { 'f0.ph': 1 });
      add('t.rings', 'pole', { fams: [{ r1: 3 }] }, { 'f0.ph': -1 });
      add('t.big', 'lines', { fams: [{ x: 0.5, y: 0.5 }] });
      add('t.fine', 'lines', { fams: [{ x: 6, y: 6 }] });
    });
    const rows = {};
    for (const id of ['t.vert', 't.vertfine', 't.horiz', 't.diag', 't.check', 't.dots', 't.rings', 't.big', 't.fine']) {
      const r = await page.eval(`__render(${JSON.stringify(id)}, 14)`);
      save(`plain-${id}.png`, r.png);
      writeFileSync(join(out, `plain-${id}.json`), JSON.stringify(r.notes));
      rows[id] = { ...stat(r.notes, 14), peakDb: r.peakDb, rmsDb: r.rmsDb };
      log(id.padEnd(12), JSON.stringify(rows[id]));
    }
  }

  // One pattern becoming another: the chord must arrive with it, one voice at a time.
  if (want('morph')) {
    for (const [a, b] of [['lines.river', 'checks.floor'], ['dots.sheet', 'pole.rosette'], ['body.planet', 'lattice.master']]) {
      const r = await page.eval(`__render('morph', 26, { morph: [${JSON.stringify(a)}, ${JSON.stringify(b)}, 16, 2] })`);
      save(`morph-${a}-${b}.png`, r.png);
      const pad = r.notes.filter(n => n.r === 'pad');
      log(a, '>', b, JSON.stringify(r.marks));
      log('  pad moves', JSON.stringify(pad.map(n => `${n.t}s v${n.i} ${n.from}>${n.m}`)));
      log('  voices over time', JSON.stringify([0, 6, 10, 12, 14, 18, 22].map(t0 => [t0, [...new Set(r.notes.filter(n => n.r === 'main' && n.t >= t0 && n.t < t0 + 4).map(n => n.v))].join('+')])));
      log('  ', JSON.stringify({ peakDb: r.peakDb, rmsDb: r.rmsDb, clip: r.clip, inKey: r.inKey }));
    }
  }

  // The endless wander: what it's like to leave it on.
  if (want('wander')) {
    const secs = +(process.env.WANDER || 180);
    const r = await page.eval(`__render('wander', ${secs}, { wander: true, fps: 20 })`);
    save('wander.png', r.png);
    writeFileSync(join(out, 'wander.json'), JSON.stringify({ marks: r.marks, wins: r.wins, notes: r.notes }));
    const main = r.notes.filter(n => n.r === 'main');
    const per = 15, series = [];
    for (let t = 0; t < secs; t += per) { const w = main.filter(n => n.t >= t && n.t < t + per); series.push({ t, perS: +(w.length / per).toFixed(1), mean: w.length ? +(w.reduce((s, n) => s + n.m, 0) / w.length).toFixed(0) : 0, v: [...new Set(w.map(n => n.v))].join('+') }); }
    log(JSON.stringify(series));
    const sorted = [...r.wins].sort((a, b) => a - b);
    log('wander', JSON.stringify({ peakDb: r.peakDb, rmsDb: r.rmsDb, clip: r.clip, inKey: r.inKey, bands: r.bands, loudestWin: r.loudestWinDb, quietestWin: r.quietestWinDb, medianWin: sorted[sorted.length >> 1], tonic: r.tonic, pcs: r.pcs }));
    const pad = r.notes.filter(n => n.r === 'pad');
    log('pad moves', pad.length, 'mean semitones', +(pad.reduce((s, n) => s + Math.abs(n.m - n.from), 0) / Math.max(1, pad.length)).toFixed(2), 'max', Math.max(...pad.map(n => Math.abs(n.m - n.from))));
    log('marks', JSON.stringify(r.marks.filter(m => !m.what.startsWith('T=')).slice(0, 40)));
  }

  // The hand as an instrument, live, with real mouse and wheel through CDP. Muted by the lab.
  if (want('hand')) {
    const mouse = (type, x, y, o = {}) => page.send('Input.dispatchMouseEvent', { type, x, y, button: o.button ?? 'none', buttons: o.buttons ?? 0, clickCount: o.clickCount ?? 0, modifiers: o.modifiers ?? 0, deltaX: o.deltaX ?? 0, deltaY: o.deltaY ?? 0, pointerType: 'mouse' });
    const wheel = async (dx, dy, n, o = {}) => { for (let i = 0; i < n; i++) { await mouse('mouseWheel', 640, 360, { deltaX: dx, deltaY: dy, ...o }); await sleep(40); } };
    const window_ = async ms => {
      const a = await page.eval(() => app.sound.context.currentTime);
      await sleep(ms);
      return page.eval(a => {
        const n = app.sound.log.filter(x => x.t > a && x.r === 'main'), b = app.sound.brain, mean = l => l.length ? +(l.reduce((s, v) => s + v, 0) / l.length).toFixed(2) : 0;
        return { notes: n.length, midi: mean(n.map(x => x.m)), dur: mean(n.map(x => x.d)), bright: mean(n.map(x => x.bright)), cents: mean(n.map(x => Math.abs(x.cents))), S: b.S, k: +b.k.toFixed(2), center: +b.center.toFixed(1), cut: +app.sound.synth.padLP.frequency.value.toFixed(0), press: +b.smooth.press.toFixed(2), moire: +b.moire.toFixed(1), gate: +b.gateK.toFixed(2) };
      }, a);
    };
    await page.eval(() => { trippee.load('lines.river', { arcs: false }); trippee.run(); app.sound.on(); });
    await sleep(2500);
    log('rest      ', JSON.stringify(await window_(6000)));
    await wheel(0, 200, 30);       // zoom one way
    await sleep(800);
    log('zoom a    ', JSON.stringify(await window_(6000)));
    await wheel(0, -200, 70);      // and all the way back past it
    await sleep(800);
    log('zoom b    ', JSON.stringify(await window_(6000)));
    await page.eval(() => app.hand.clear());
    await sleep(2500);
    await mouse('mouseMoved', 300, 300);
    for (let i = 0; i < 80; i++) { await mouse('mouseMoved', 300 + i * 8, 300 + Math.sin(i / 6) * 120); await sleep(40); }
    log('press     ', JSON.stringify(await window_(1200)));
    await sleep(3500);
    log('press gone', JSON.stringify(await window_(3000)));
    await wheel(0, 40, 30, { modifiers: 8 });
    await sleep(700);
    log('thick (duty)', JSON.stringify(await window_(5000)));
    await wheel(0, -40, 60, { modifiers: 8 });
    await sleep(700);
    log('thin (duty) ', JSON.stringify(await window_(5000)));
    await page.eval(() => app.hand.clear());
    await sleep(2000);
    await mouse('mousePressed', 640, 360, { button: 'left', buttons: 1, clickCount: 1, modifiers: 1 });
    for (let i = 0; i < 25; i++) { await mouse('mouseMoved', 640, 360 - i * 3, { buttons: 1, modifiers: 1 }); await sleep(30); }
    await mouse('mouseReleased', 640, 285, { button: 'left', buttons: 0, clickCount: 1, modifiers: 1 });
    await sleep(800);
    log('sheet     ', JSON.stringify(await window_(5000)));
    await page.eval(() => app.hand.dropSheet());
    await sleep(1500);
    // Ripples: the real tool, a real click
    await page.eval(() => app.hand.fx.select('ripple'));
    const before = await page.eval(() => app.sound.log.filter(x => x.v === 'ping').length);
    for (const [x, y] of [[300, 200], [900, 500], [640, 120]]) { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: 1 }); await sleep(120); await mouse('mouseReleased', x, y, { button: 'left', buttons: 0, clickCount: 1 }); await sleep(900); }
    log('ripple pings', JSON.stringify(await page.eval(() => app.sound.log.filter(x => x.v === 'ping').slice(-4).map(x => ({ t: x.t, m: x.m, vel: x.vel })))), 'before', before);
    await page.eval(() => app.hand.fx.select(null));
    // Pause: the sequencer stops with the picture and the pad sinks
    const n0 = await page.eval(async () => { app.paused = true; await new Promise(r => setTimeout(r, 1500)); return app.sound.log.length; });
    await sleep(2500);
    log('paused: new notes', await page.eval(n => app.sound.log.length - n, n0), 'pad level', await page.eval(() => +app.sound.synth.padLevel.gain.value.toFixed(3)));
    await page.eval(() => { app.paused = false; });
    await sleep(2500);
    log('resumed, notes', await page.eval(n => app.sound.log.length - n, n0), 'pad level', await page.eval(() => +app.sound.synth.padLevel.gain.value.toFixed(3)));
    // A song: pauses while this is on, comes back when it's off; playing it by hand wins
    await page.eval(() => app.song.load('/media/ppp.mp3', { autoplay: true }));
    await sleep(1500);
    log('song on', await page.eval(() => ({ sound: app.sound.active, song: app.song.playing, t: +app.song.time().toFixed(1), clock: !!app.clock })));
    await page.eval(() => app.sound.on());
    await sleep(2000);
    const during = await page.eval(() => ({ sound: app.sound.active, song: app.song.playing, songT: +app.song.time().toFixed(2), clock: !!app.clock, t: +app.t.toFixed(1) }));
    await sleep(2000);
    log('sound on over song', JSON.stringify(during), JSON.stringify(await page.eval(() => ({ songT: +app.song.time().toFixed(2), t: +app.t.toFixed(1), notes: app.sound.log.length }))));
    await page.shot('hand-song-standin');
    await page.eval(() => app.sound.off());
    await sleep(1500);
    log('sound off again', JSON.stringify(await page.eval(() => ({ sound: app.sound.active, song: app.song.playing, songT: +app.song.time().toFixed(2), clock: !!app.clock, t: +app.t.toFixed(1) }))));
    await page.eval(() => app.sound.on());
    await sleep(800);
    await page.eval(() => app.song.play());
    await sleep(500);
    log('play by hand wins', JSON.stringify(await page.eval(() => ({ sound: app.sound.active, song: app.song.playing }))));
    await page.eval(() => app.song.eject());
    const stream = await page.eval(() => { const s = app.sound.stream(); return { tracks: s.getAudioTracks().length, kind: s.getAudioTracks()[0]?.kind }; });
    log('stream', JSON.stringify(stream));
  }

  if (want('stems')) {
    for (const id of IDS) for (const st of ['pad', 'arp', 'low']) {
      const r = await page.eval(`__render(${JSON.stringify(id)}, 14, { stem: '${st}' })`);
      log(id.padEnd(16), st.padEnd(4), JSON.stringify({ peakDb: r.peakDb, rmsDb: r.rmsDb, bands: r.bands }));
    }
  }

  if (want('flow')) {
    // The same pattern at three speeds of the picture's clock: the notes must follow, and the gear must keep them playable.
    for (const speed of [0.5, 1, 2, 4]) {
      const r = await page.eval(`__render('lines.river', 16, { speed: ${speed} })`);
      const s = stat(r.notes, 16);
      log('flow x' + speed, JSON.stringify({ mainPerS: s.mainPerS, S: s.S, lowPerS: s.lowPerS }));
    }
  }

  // What it costs the picture: the same stretch with it off and on.
  if (want('fps')) {
    const measure = secs => page.eval(secs => new Promise(res => { let n = 0, t0 = performance.now(), worst = 0, last = t0; const f = () => { const now = performance.now(); worst = Math.max(worst, now - last); last = now; n++; if (now - t0 > secs * 1000) { app.onFrame.splice(app.onFrame.indexOf(f), 1); res({ fps: +(n / secs).toFixed(1), worstMs: +worst.toFixed(1) }); } }; app.onFrame.push(f); }), secs);
    await page.eval(() => { trippee.load('lines.river', { arcs: false }); trippee.run(); });
    await sleep(1500);
    log('off', JSON.stringify(await measure(8)));
    await page.eval(() => { app.sound.on(); app.sound.cost.sum = 0; app.sound.cost.n = 0; });
    await sleep(1500);
    log('on ', JSON.stringify(await measure(8)), 'tick ms', JSON.stringify(await page.eval(() => ({ mean: +(app.sound.cost.sum / app.sound.cost.n).toFixed(3), n: app.sound.cost.n }))));
    await page.eval(() => app.sound.off());
    await sleep(1500);
    log('off', JSON.stringify(await measure(8)));
    for (let i = 0; i < 2; i++) {
      await page.eval(() => app.sound.on()); await sleep(2500);
      log('on ', JSON.stringify(await measure(6)), 'scale', await page.eval(() => app.R.drawScale));
      await page.eval(() => app.sound.off()); await sleep(2500);
      log('off', JSON.stringify(await measure(6)), 'scale', await page.eval(() => app.R.drawScale));
    }
    // Steadiness of the rhythm: how far each live note is from the grid it should be on
    const ioi = await page.eval(async () => {
      app.sound.on();
      await new Promise(r => setTimeout(r, 16000));
      const n = app.sound.log.filter(x => x.r === 'main' && x.t > 3);
      const t = [...new Set(n.map(x => x.t.toFixed(3)))].map(Number).sort((a, b) => a - b);
      const gaps = t.slice(1).map((v, i) => v - t[i]).sort((a, b) => a - b), step = gaps[gaps.length >> 2], err = [];
      // jitter: how much a gap differs from the one before it, where both are one or the same number of steps
      const fps = []; const g2 = t.slice(1).map((v, i) => v - t[i]);
      for (let i = 1; i < g2.length; i++) { if (Math.round(g2[i] / step) === Math.round(g2[i - 1] / step)) err.push(Math.abs(g2[i] - g2[i - 1]) * 1000); }
      err.sort((a, b) => a - b);
      const slope = step;
      app.sound.off();
      return { steps: t.length, stepMs: +(slope * 1000).toFixed(1), medianErrMs: +err[err.length >> 1].toFixed(2), p95ErrMs: +err[Math.floor(err.length * 0.95)].toFixed(2), maxErrMs: +err[err.length - 1].toFixed(2) };
    });
    log('rhythm', JSON.stringify(ioi));
  }

  if (want('live')) {
    // The real thing, in real time, through the key. Muted by the lab.
    const res = await page.eval(async () => {
      trippee.run();
      app.hand?.go?.('lines.river');
      return { before: app.sound.active };
    });
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'g', code: 'KeyG', text: 'g', windowsVirtualKeyCode: 71 });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'g', code: 'KeyG', windowsVirtualKeyCode: 71 });
    await sleep(500);
    log('after G:', await page.eval(() => ({ active: app.sound.active, state: app.sound.context?.state })));
    const fpsOn = await page.eval(async () => {
      const a = new AnalyserNode(app.sound.context, { fftSize: 2048 }); app.sound.synth.output.connect(a); window.__an = a;
      let peak = 0, sum = 0, cnt = 0; const d = new Float32Array(2048);
      window.__meter = setInterval(() => { a.getFloatTimeDomainData(d); for (const v of d) { peak = Math.max(peak, Math.abs(v)); sum += v * v; cnt++; } window.__lv = { peak, rms: Math.sqrt(sum / cnt) }; }, 40);
      return new Promise(res => { let n = 0, t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 12000) { const i = app.onFrame.indexOf(f); app.onFrame.splice(i, 1); res({ fps: n / 12, notes: app.sound.log.length }); } }; app.onFrame.push(f); });
    });
    log('live with sound on:', JSON.stringify(fpsOn), 'levels', JSON.stringify(await page.eval('window.__lv')));
    await page.shot('live');
    const notes = await page.eval(() => app.sound.log.slice(-14));
    log('last notes', JSON.stringify(notes.map(n => `${n.v}:${n.m}`)));
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'g', code: 'KeyG', text: 'g', windowsVirtualKeyCode: 71 });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'g', code: 'KeyG', windowsVirtualKeyCode: 71 });
    await sleep(2200);
    log('after second G:', await page.eval(() => ({ active: app.sound.active, state: app.sound.context?.state, rms: (() => { const d = new Float32Array(2048); __an.getFloatTimeDomainData(d); return Math.sqrt(d.reduce((s, v) => s + v * v, 0) / 2048); })() })));
  }
};
