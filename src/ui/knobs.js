// The current pattern's axes, and three that every pattern has. A knob you haven't touched follows the pattern's own move and
// stays alive; touch it and it holds; double-click lets it go, and it eases back to wherever the pattern has got to.
const fmt = v => {
  const a = Math.abs(v);
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  return v.toFixed(3);
};

const GENERAL = hand => [
  { id: 'speed', name: 'speed', min: 0.1, max: 6, log: true, get: () => hand.speed, set: v => { hand.speed = v; }, def: 1, moved: () => Math.abs(hand.speed - 1) > 1e-3, reset: () => { hand.speed = 1; } },
  { id: 'rotation', name: 'rotation', min: -1.2, max: 1.2, get: () => hand.spinRate, set: v => { hand.spinRate = Math.abs(v) < 0.015 ? 0 : v; }, def: 0, moved: () => hand.spinRate !== 0, reset: () => { hand.spinRate = 0; } },
  // How many lines. On a pattern of rings and spokes there's nothing for freq to multiply, so it's how big the view is: more lines is further away.
  hand.linesPath() === 'freq' ? { id: 'lines', name: 'lines', path: 'freq', min: 0.2, max: 8, log: true } : { id: 'lines', name: 'lines', min: 0.2, max: 8, log: true, get: () => hand.natural('scale') / hand.liveValue('scale'), set: v => hand.setKnob('scale', hand.natural('scale') / v), def: 1, moved: () => hand.knobValue('scale') !== null, reset: () => hand.releaseKnob('scale'), via: 'scale' },
];

export class Knobs {
  constructor(app, hand, el) {
    this.app = app; this.hand = hand; this.el = el; this.rows = [];
    el.innerHTML = `<header><span data-name></span><button data-close>close</button></header><div data-rows></div><p style="margin:18px 0 0"><button data-clear>clear the hand</button></p>`;
    this.rowsEl = el.querySelector('[data-rows]');
    this.nameEl = el.querySelector('[data-name]');
    el.querySelector('[data-close]').onclick = () => this.show(false);
    el.querySelector('[data-clear]').onclick = () => hand.clear();
    hand.on('pattern', () => { if (this.open) this.build(); });
    app.onFrame.push(() => { if (this.open) this.update(); });
  }

  get open() { return !this.el.hidden; }
  show(on = !this.open) { this.el.hidden = !on; if (on) this.build(); }

  build() {
    const { app, hand } = this, pat = app.lastFrame?.G?.pattern;
    this.pat = pat;
    this.nameEl.textContent = (pat?.name || '').toLowerCase();
    this.rowsEl.innerHTML = '';
    this.rows = [];
    const seen = new Set(), axes = [];
    for (const a of pat?.axes || []) { if (a.path) { seen.add(a.path); axes.push(a); } }
    const gen = GENERAL(hand).filter(a => !seen.has(a.path ?? a.via));
    for (const a of axes) this.row(a);
    if (axes.length) { const h = document.createElement('h3'); h.textContent = 'every pattern'; this.rowsEl.appendChild(h); }
    for (const a of gen) this.row(a);
  }

  row(a) {
    const hand = this.hand;
    const el = document.createElement('div');
    el.className = 'knob';
    el.innerHTML = `<div class="row"><span>${(a.name || a.id).toLowerCase()}</span><span class="val"></span></div><div class="track"><div class="line"></div><div class="fill"></div><div class="tick"></div><div class="thumb"></div></div>`;
    const min = a.min ?? 0, max = a.max ?? 1, log = a.log && min > 0;
    const toU = v => { const u = log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min); return Math.min(1, Math.max(0, u)); };
    const fromU = u => {
      let v = log ? min * Math.pow(max / min, u) : min + (max - min) * u;
      if (a.step) v = Math.round(v / a.step) * a.step;
      if (a.int) v = Math.round(v);
      return v;
    };
    const r = {
      a, el, toU, fromU,
      val: el.querySelector('.val'), fill: el.querySelector('.fill'), thumb: el.querySelector('.thumb'), tick: el.querySelector('.tick'), track: el.querySelector('.track'),
      get: () => (a.get ? a.get() : hand.liveValue(a.path)),
      def: () => (a.get ? a.def : hand.natural(a.path)),
      moved: () => (a.get ? a.moved() : hand.knobValue(a.path) !== null),
      set: v => (a.set ? a.set(v) : hand.setKnob(a.path, v)),
      reset: () => (a.reset ? a.reset() : hand.releaseKnob(a.path)),
    };
    let startU = 0, startX = 0, fine = false;
    el.onpointerdown = e => {
      if (e.button !== 0) return;
      el.setPointerCapture(e.pointerId);
      const b = r.track.getBoundingClientRect();
      fine = e.shiftKey;
      startX = e.clientX; startU = fine ? toU(r.get()) : (e.clientX - b.left) / b.width;
      r.set(fromU(Math.min(1, Math.max(0, startU))));
      el.onpointermove = ev => {
        const w = r.track.getBoundingClientRect().width;
        const u = startU + (ev.clientX - startX) / w * (fine ? 0.1 : 1);
        r.set(fromU(Math.min(1, Math.max(0, u))));
      };
    };
    el.onpointerup = el.onpointercancel = () => { el.onpointermove = null; };
    el.ondblclick = () => r.reset();
    this.rowsEl.appendChild(el);
    this.rows.push(r);
    return r;
  }

  update() {
    for (const r of this.rows) {
      const v = r.get(), u = r.toU(v), d = r.toU(r.def());
      r.val.textContent = fmt(v);
      r.fill.style.width = (u * 100) + '%';
      r.thumb.style.left = (u * 100) + '%';
      r.tick.style.left = (d * 100) + '%';
      r.el.classList.toggle('moved', r.moved());
    }
  }
}
