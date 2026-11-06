// The world strip: one row above the effects bar. Black and white, colour, then each world there's a file for, with its ink chips. Pointing at one starts building it, so that clicking it goes straight into the change.
// This file only loads when the world button is first pressed, or v.
import { available } from '../worlds/index.js';
import { palettes } from '../beyond/beyond.js';

const CSS = `
#worlds { left: 50%; transform: translateX(-50%); bottom: 112px; padding: 5px 7px; display: flex; flex-wrap: wrap; justify-content: center; gap: 2px; max-width: calc(100vw - 32px); }
#library:not([hidden]) ~ #worlds { left: calc(50% + 164px); max-width: calc(100vw - 360px); }
#song:not([hidden]) ~ #worlds { bottom: 230px; }
#hints:not([hidden]) ~ #worlds { bottom: 188px; }
#worlds button { margin: 0; padding: 4px 8px 3px; line-height: 1.4; font-size: 10px; color: var(--quiet); text-align: center; }
#worlds button i { display: flex; justify-content: center; gap: 2px; height: 10px; margin-bottom: 4px; }
#worlds button i u { display: block; width: 10px; height: 10px; outline: 1px solid rgba(255,255,255,.4); outline-offset: -1px; }
#ui #worlds button:hover { background: transparent; color: var(--ink); box-shadow: inset 0 0 0 1px var(--ink); }
#ui #worlds button.now { background: var(--ink); color: var(--paper); }
#worlds button.wait { opacity: .6; }
`;
const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;
const chips = list => `<i>${list.map(c => `<u style="background:${rgb(c)}"></u>`).join('')}</i>`;
const P = palettes[0];

export class WorldStrip {
  constructor(app, say) {
    this.app = app; this.say = say;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    const root = document.getElementById('ui');
    const el = this.el = document.createElement('div');
    el.id = 'worlds'; el.className = 'box'; el.hidden = true;
    root.appendChild(el);
    this.worlds = [];
    this.built = this.build();
    addEventListener('pointerdown', e => { if (this.open && !e.target?.closest?.('#worlds, [data-world]')) this.show(false); }, { passive: true });
    addEventListener('keydown', e => { if (e.key === 'Escape') this.show(false); });
    app.onFrame.push(() => { if (this.open) this.mark(); });
  }

  get open() { return !this.el.hidden; }

  async build() {
    this.worlds = await available({ test: new URLSearchParams(location.search).get('worlds') === 'test' });
    const row = (id, name, list, tip) => `<button data-w="${id}" title="${tip}" aria-label="${name}">${chips(list)}${name}</button>`;
    this.el.innerHTML = row('film', 'black and white', [[0, 0, 0], [255, 255, 255]], 'the film as it is')
      + row('colour', 'colour', [P.dark, P.light], 'the pattern printed twice, in two inks. shift+b for the next inks')
      + this.worlds.map(W => row(W.id, W.name.toLowerCase(), W.chips ?? [], W.name)).join('');
    for (const b of this.el.querySelectorAll('[data-w]')) {
      const id = b.dataset.w, W = this.worlds.find(x => x.id === id);
      b.onclick = () => this.choose(id);
      if (W) b.onpointerenter = () => this.app.R.prepareWorld(W);
    }
    this.seen = null;
    this.mark();
  }

  show(on = !this.open) {
    this.el.hidden = !on;
    if (on) this.mark();
    dispatchEvent(new Event('trippee:worlds'));
  }

  // What's on: the world, or the plates, or neither.
  current() { return this.app.stage.world?.id ?? (this.app.beyond?.active ? 'colour' : 'film'); }

  mark() {
    const now = this.current();
    if (now === this.seen) return;
    this.seen = now;
    for (const b of this.el.querySelectorAll('[data-w]')) b.classList.toggle('now', b.dataset.w === now);
  }

  async choose(id) {
    const { app, say } = this, stage = app.stage;
    if (id === this.current()) return;
    if (id === 'colour') {
      const { colourNow } = await import('../worlds/engine.js');
      say('colour', 1400);
      await colourNow(app);
    } else if (id === 'film') {
      say('black and white', 1400);
      app.beyond?.off();
      if (stage.world) await stage.setWorld(null);
    } else {
      const W = this.worlds.find(x => x.id === id);
      say(W.needs?.length && app.song?.analysis && !app.song.extrasReady ? `${W.name.toLowerCase()}: still listening` : W.name.toLowerCase(), 1800);
      await stage.setWorld(id);
    }
    this.mark();
    dispatchEvent(new Event('trippee:worlds'));
  }

  // v: the next world, then round through the film.
  async next() {
    await this.built;
    if (!this.worlds.length) { this.say('no worlds yet', 1400); return; }
    const ids = ['film', ...this.worlds.map(W => W.id)], at = ids.indexOf(this.app.stage.world?.id ?? 'film');
    await this.choose(ids[(at + 1) % ids.length]);
  }
}
