// The effects bar: what the mouse does on the picture, and the modes the picture can be in. It comes up when the mouse moves and fades
// when it stops. The icons are plain line drawings in the bar's own black and white.
import { EFFECTS } from '../tools/effects.js';

const AWAKE_MS = 2200;
const NEAR = 124;       // how close to the bottom of the window the pointer has to be, with an effect in use, to bring the bar back
const svg = body => `<svg viewBox="0 0 22 22" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICONS = {
  ripple: svg('<circle cx="11" cy="11" r="1.6" fill="currentColor"/><circle cx="11" cy="11" r="5.2"/><circle cx="11" cy="11" r="9"/>'),
  hand: svg('<g fill="currentColor" stroke="none"><rect x="5.2" y="6.2" width="2.5" height="8" rx="1.25"/><rect x="8.2" y="3" width="2.5" height="11" rx="1.25"/><rect x="11.2" y="2.2" width="2.5" height="12" rx="1.25"/><rect x="14.2" y="4" width="2.5" height="10" rx="1.25"/><rect x="5.2" y="10.5" width="11.5" height="9.5" rx="3.6"/><rect x="15.6" y="11.8" width="2.5" height="6.8" rx="1.25" transform="rotate(38 16.8 15.2)"/></g>'),
  twist: svg('<path d="M11 11c.9-.9 2.4-.3 2.4 1.1 0 1.8-2.2 2.8-3.9 1.9-2.2-1.1-2.5-4-.9-5.8 2-2.2 5.8-2 7.6.3 2.1 2.7 1.3 6.8-1.5 8.8-3.3 2.3-8 1.3-10.2-1.9"/>'),
  pinch: svg('<path d="M3.5 3c5 4.6 5 11.4 0 16M18.5 3c-5 4.6-5 11.4 0 16M11 3v16"/><path d="M7.4 3.6c1.7 4.7 1.7 10.1 0 14.800M14.6 3.600c-1.7 4.7-1.7 10.1 0 14.8"/>'),
  bulge: svg('<path d="M7 3C.6 7.6.6 14.4 7 19M15 3c6.4 4.6 6.4 11.4 0 16M11 3v16"/><path d="M9 3C6.2 7.7 6.2 14.3 9 19M13 3c2.8 4.7 2.8 11.3 0 16"/>'),
  comb: svg('<path stroke-width="2.4" d="M3 5.500h16"/><path d="M4.5 6v12M7.8 6v12M11 6v12M14.2 6v12M17.5 6v12"/>'),
  static: svg('<rect x="4.5" y="10" width="13" height="9" rx="1"/><path d="M7.5 10V7a3.5 3.5 0 0 1 7 0v3"/>'),
  sound: svg('<path d="M2.5 11h2.200l1.8-5.5 3 11 3-14 2.8 13 1.7-4.500h2.5"/>'),
  camo: svg('<circle cx="11" cy="6.4" r="3.2"/><path d="M4 19.6c.6-4.7 3.4-7.5 7-7.5s6.4 2.8 7 7.5"/><path d="M2 12.6h2.4M17.6 12.6H20M2 16.2h1.6M18.4 16.2H20"/>'),
  beyond: svg('<path d="M11 11c-1.8-2.8-3.4-4-5.2-4a4 4 0 0 0 0 8c1.8 0 3.4-1.2 5.2-4Zm0 0c1.8 2.8 3.4 4 5.2 4a4 4 0 0 0 0-8c-1.8 0-3.4 1.2-5.2 4Z"/>'),
};

export class EffectsBar {
  constructor(app, hand, el, say) {
    this.app = app; this.hand = hand; this.el = el; this.say = say;
    const button = (id, name, key, tip) => `<button data-fx="${id}" title="${tip}${key ? ` (${key})` : ''}" aria-label="${name}">${ICONS[id] || ''}<span><b>${key || ''}</b>${name}</span></button>`;
    el.innerHTML = EFFECTS.map(e => button(e.id, e.name, e.key, e.tip)).join('')
      + '<i class="rule"></i>'
      + button('static', 'static', 'l', 'what is showing stays, and only flows. no automatic changes')
      + button('sound', 'make music', 'g', 'the picture plays itself: synths and arpeggios read off whatever is showing. a song waits while it does')
      + button('camo', 'you', 'y', 'camouflage: the webcam puts you in the picture, only while you move, and on the strong beats of a song. nothing leaves this machine')
      + button('beyond', 'world', 'v', 'black and white, colour, and the worlds. b is colour');
    el.hidden = false;
    this.buttons = Object.fromEntries([...el.querySelectorAll('[data-fx]')].map(b => [b.dataset.fx, b]));
    for (const e of EFFECTS) this.buttons[e.id].onclick = () => this.choose(e.id);
    this.buttons.static.onclick = () => this.toggleStatic();
    this.buttons.sound.onclick = () => this.toggleMode(app.sound, 'sound');
    this.buttons.camo.onclick = () => this.toggleCamo();
    this.buttons.beyond.dataset.world = '1';
    this.buttons.beyond.onclick = () => this.toggleStrip();

    this.lastMove = -1e9; this.over = false;
    addEventListener('pointermove', e => {
      this.over = !!e.target?.closest?.('#fx, #worlds');
      // In use, an effect has the picture to itself: the bar only comes up when the pointer goes to where it is, with nothing else floating about.
      const quiet = !!hand.effect() && !this.over && innerHeight - e.clientY > NEAR;
      document.body.classList.toggle('fx-quiet', quiet);
      if (quiet) { if (el.classList.contains('awake') && performance.now() - this.lastMove > 500) this.wake(false); return; }
      this.lastMove = performance.now();
      this.refresh();
      this.wake(true);
    }, { passive: true });
    app.onFrame.push(() => {
      if (el.classList.contains('awake') && !this.over && !hand.dragging && performance.now() - this.lastMove > AWAKE_MS) this.wake(false);
    });
    hand.on('effect', () => this.refresh());
    hand.on('static', () => this.refresh());
    hand.on('wander', () => this.refresh());
    addEventListener('trippee:sound', () => this.refresh());
    addEventListener('trippee:worlds', () => this.refresh());
    addEventListener('trippee:camo', () => this.refresh());
    addEventListener('keyup', () => this.refresh());     // sound and beyond have their own keys
    this.refresh();
  }

  wake(on) { this.el.classList.toggle('awake', on); }

  choose(id) {
    const now = this.hand.setEffect(id);
    const e = EFFECTS.find(x => x.id === now);
    this.say(e ? `${e.name}: ${e.tip}` : 'the plain hand', e ? 3200 : 1400);
    this.refresh();
  }

  // The strip's only loaded when it's first asked for, and nothing of the worlds with it.
  strip() {
    return this._strip ??= import('./worlds.js').then(({ WorldStrip }) => new WorldStrip(this.app, this.say));
  }
  async toggleStrip() { (await this.strip()).show(); }
  async nextWorld() { (await this.strip()).next(); }

  key(k) {
    const e = EFFECTS.find(x => x.key === k);
    if (e) this.choose(e.id);
    return !!e;
  }

  toggleStatic() {
    const on = !this.hand.isStatic();
    this.hand.setStatic(on);
    this.say(on ? 'static: it stays, and only flows' : 'static off', on ? 2400 : 1400);
    this.refresh();
  }

  // Camouflage: nothing of it is loaded, and no camera asked for, until it's first turned on.
  async toggleCamo() { const m = await import('../tools/webcam.js'); await m.toggle(this.app); this.refresh(); }

  toggleMode(m, name) {
    if (!m) return;
    m.toggle?.();
    this.refresh();
  }

  refresh() {
    const { app, hand, buttons: B } = this;
    const fx = hand.effect();
    for (const e of EFFECTS) B[e.id].classList.toggle('now', fx === e.id);
    const st = hand.isStatic();
    B.static.classList.toggle('now', st);
    B.static.querySelector('span').innerHTML = `<b>l</b>${st ? 'static on' : 'static'}`;
    for (const name of ['sound', 'beyond']) {
      const m = app[name];
      B[name].hidden = !m;
      B[name].classList.toggle('now', !!m && modeOn(m));
    }
    if (app.stage.world) B.beyond.classList.add('now');
    B.camo.classList.toggle('now', !!app.camo?.on());
  }
}

// sound and beyond each say it their own way
function modeOn(m) {
  if (typeof m.isOn === 'function') return !!m.isOn();
  for (const k of ['active', 'playing', 'enabled', 'on']) if (typeof m[k] === 'boolean') return m[k];
  return false;
}
