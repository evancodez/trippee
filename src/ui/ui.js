// Everything on top of the picture. Nothing is on screen until asked for, and all of it fades when the mouse stops.
import { hand, init as startHand } from '../tools/input.js';
import { Recorder } from '../tools/record.js';
import { Library } from './library.js';
import { Knobs } from './knobs.js';
import { SongPanel } from './songpanel.js';
import { EffectsBar } from './effects.js';

const IDLE_MS = 3500;
const store = {
  get(k) { try { return localStorage.getItem('trippee.' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('trippee.' + k, v); } catch { /* it just won't be remembered */ } },
};

export function init(app) {
  startHand(app);
  const root = document.getElementById('ui') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'ui' }));
  const box = (id, html = '') => {
    const d = document.createElement('div');
    d.id = id; d.className = 'box'; d.hidden = true; d.innerHTML = html;
    root.appendChild(d);
    return d;
  };

  const library = new Library(app, hand, box('library'));
  const knobs = new Knobs(app, hand, box('knobs'));
  const song = new SongPanel(app, hand, box('song'));
  const recorder = new Recorder(app);
  const ui = app.ui = { library, knobs, song, recorder, hand };

  // ------------------------------------------------------------------------ the bar: only when the pointer is at the bottom edge
  const bar = box('bar', `<span class="name" data-name></span>
    <button data-a="library">patterns</button><button data-a="knobs">knobs</button><button data-a="song">song</button>
    <button data-a="record">record</button><button data-a="picture">picture</button><button data-a="calm">calm</button>
    <button data-a="full">fullscreen</button><button data-a="help">keys</button>`);
  const help = box('help', `<header><span>the hand</span><button data-close>close</button></header>
    <dl>
      <dt>move</dt><dd>a ball under the sheet</dd>
      <dt>drag</dt><dd>comb the lines. dents stay and relax slowly</dd>
      <dt>scroll, pinch</dt><dd>zoom about the cursor, hairline to huge</dd>
      <dt>sideways, shift scroll</dt><dd>the threshold. past each solid is the next pattern</dd>
      <dt>alt drag</dt><dd>lift a copy of the sheet. up and down turns it, sideways slides it. it locks where the fringes close</dd>
      <dt>alt scroll</dt><dd>turn the copy very finely</dd>
      <dt>alt double-click</dt><dd>lay the copy back down</dd>
      <dt>drop a song</dt><dd>anywhere. on a pattern you're holding, it uses yours</dd>
      <hr>
      <dt>1 ripple</dt><dd>click drops a ring. hold and move to rain them</dd>
      <dt>2 hand</dt><dd>a hand comes up through the sheet. hold to make a fist</dd>
      <dt>3 twist</dt><dd>drag to wind the lines round the cursor</dd>
      <dt>4 pinch &nbsp;5 bulge</dt><dd>hold to draw the lines in, or swell them out</dd>
      <dt>6 comb</dt><dd>drag to comb. the same number again goes back to the plain hand</dd>
      <dt>l</dt><dd>static: it stays and only flows, until you turn it off</dd>
      <dt>b</dt><dd>colour: the pattern printed twice, in two inks. shift b for the next inks</dd>
      <dt>g</dt><dd>make music: the picture plays itself. a song waits while it does</dd>
      <hr>
      <dt>p</dt><dd>patterns</dd>
      <dt>k</dt><dd>knobs: the pattern's own, and speed, rotation, lines</dd>
      <dt>s</dt><dd>song</dd>
      <dt>r &nbsp; c</dt><dd>record, picture</dd>
      <dt>space</dt><dd>pause</dd>
      <dt>n, arrows</dt><dd>next or previous pattern</dd>
      <dt>w</dt><dd>wander</dd>
      <dt>z</dt><dd>clear what the hand has done</dd>
      <dt>m</dt><dd>calm: slower flow, no fine lines</dd>
      <dt>f &nbsp; h</dt><dd>fullscreen, hide the interface</dd>
    </dl>`);
  const note = box('note');
  const rec = box('rec', `<span data-t></span><button data-stop>stop</button>`);
  const dropMark = document.createElement('div');
  dropMark.id = 'drop'; dropMark.hidden = true; dropMark.innerHTML = '<span>drop the song</span>';
  root.appendChild(dropMark);

  // ------------------------------------------------------------------------ first run
  const hints = box('hints', `<p>move · drag · scroll · 1-6 effects · l static · b colour · g make music · drop a song · p patterns · ? keys</p>
    <p>flickering line patterns can trigger seizures in people with photosensitive epilepsy.<span class="acts"><button data-calm>calm</button><button data-ok>got it</button></span></p>`);
  const fxBar = new EffectsBar(app, hand, box('fx'), (...a) => ui.say?.(...a));
  ui.effects = fxBar;
  const dismiss = () => { hints.hidden = true; store.set('seen', '1'); placeBar(); };
  hints.querySelector('[data-ok]').onclick = dismiss;
  hints.querySelector('[data-calm]').onclick = () => hand.setCalm(!hand.calm);
  // It comes back each time until it's answered, but it never stays long enough to get in the way.
  if (store.get('seen') !== '1') { hints.hidden = false; setTimeout(() => { hints.hidden = true; placeBar(); }, 45000); }
  if (store.get('calm') === '1') hand.setCalm(true);

  const markCalm = on => {
    hints.querySelector('[data-calm]').classList.toggle('on', on);
    bar.querySelector('[data-a="calm"]').classList.toggle('on', on);
  };
  hand.on('calm', on => { markCalm(on); store.set('calm', on ? '1' : '0'); });
  markCalm(hand.calm);

  // ------------------------------------------------------------------------ actions
  const toggleHelp = () => { help.hidden = !help.hidden; };
  help.querySelector('[data-close]').onclick = toggleHelp;
  const toggleRecord = async () => {
    if (recorder.on) { rec.hidden = true; await recorder.stop(); say('saved'); return; }
    try { recorder.start(); rec.hidden = false; } catch (e) { console.error('record failed', e); say('recording is not available here'); }
  };
  rec.querySelector('[data-stop]').onclick = toggleRecord;
  const picture = async () => { await recorder.picture(); say('picture saved'); };
  const fullscreen = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); };
  const actions = {
    library: () => library.show(), knobs: () => knobs.show(), song: () => song.show(),
    record: toggleRecord, picture, calm: () => hand.setCalm(!hand.calm), full: fullscreen, help: toggleHelp,
  };
  bar.querySelectorAll('[data-a]').forEach(b => { b.onclick = () => actions[b.dataset.a](); });

  let noteTimer = 0;
  function say(text, ms = 1800) {
    note.textContent = text; note.hidden = false;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { note.hidden = true; }, ms);
  }
  ui.say = say;

  // ------------------------------------------------------------------------ fading
  // The first-run lines get a proper look before anything can fade: the warning has to be seen.
  const firstRead = hints.hidden ? 0 : performance.now() + 14000;
  let lastMove = performance.now(), pointer = { x: 0, y: 0, target: null };
  const wake = () => { lastMove = performance.now(); document.body.classList.remove('idle'); };
  function placeBar() {
    const nearBottom = innerHeight - pointer.y < 124;     // it sits just above the effects bar
    const blocked = !hints.hidden || song.open;
    bar.hidden = !(nearBottom && !blocked);
    if (!bar.hidden) bar.querySelector('[data-name]').textContent = (app.lastFrame?.G?.pattern?.name || '').toLowerCase();
  }
  addEventListener('pointermove', e => {
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.target = e.target;
    wake();
    placeBar();
  }, { passive: true });
  addEventListener('pointerdown', wake, { passive: true });
  addEventListener('keydown', wake);

  app.onFrame.push(() => {
    const overBox = pointer.target && pointer.target !== app.canvas && pointer.target.closest?.('.box');
    if (performance.now() - lastMove > IDLE_MS && performance.now() > firstRead && !hand.dragging && !overBox) document.body.classList.add('idle');
    if (hand.readout) {
      const r = hand.readout;
      note.textContent = `${r.deg >= 0 ? '' : '-'}${Math.abs(r.deg).toFixed(2)}°${r.locked ? '  locked' : ''}`;
      note.hidden = false; note.dataset.sheet = '1';
    } else if (note.dataset.sheet) { note.hidden = true; delete note.dataset.sheet; }
    if (recorder.on) {
      const s = recorder.seconds() | 0;
      rec.querySelector('[data-t]').textContent = `recording  ${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`;
    }
  });

  // A button keeps the focus after a click, and then Space would press it again instead of pausing.
  root.addEventListener('click', () => { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); });

  // ------------------------------------------------------------------------ keys
  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.repeat) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    switch (e.key.toLowerCase()) {
      case 'p': library.show(); break;
      case 'l': fxBar.toggleStatic(); break;
      case '1': case '2': case '3': case '4': case '5': case '6': fxBar.key(e.key); break;
      case 'k': knobs.show(); break;
      case 's': song.show(); break;
      case 'r': toggleRecord(); break;
      case 'c': picture(); break;
      case 'f': fullscreen(); break;
      case 'h': document.body.classList.toggle('bare'); break;
      case 'm': hand.setCalm(!hand.calm); say(hand.calm ? 'calm' : 'calm off'); break;
      case '?': case '/': toggleHelp(); break;
      case 'escape':
        library.show(false); knobs.show(false); help.hidden = true;
        if (song.state !== 'listening') song.show(false);
        break;
    }
  });

  // ------------------------------------------------------------------------ drop a song anywhere
  let drags = 0;
  const isFile = e => [...(e.dataTransfer?.types || [])].includes('Files');
  addEventListener('dragenter', e => { if (isFile(e)) { drags++; dropMark.hidden = false; document.body.classList.remove('idle'); e.preventDefault(); } });
  addEventListener('dragover', e => { if (isFile(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; lastMove = performance.now(); } });
  addEventListener('dragleave', e => { if (isFile(e) && --drags <= 0) { drags = 0; dropMark.hidden = true; } });
  addEventListener('drop', e => {
    e.preventDefault();
    drags = 0; dropMark.hidden = true;
    const f = e.dataTransfer?.files?.[0];
    if (f) song.load(f);
  });
}
