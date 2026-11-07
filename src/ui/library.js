// Every pattern by family, as real thumbnails. They're drawn by a second small renderer on a canvas nobody sees, one pattern
// at a time between frames, so the main picture never hitches. The tile under the pointer plays.
import { Renderer, FOLD } from '../gl/renderer.js';
import { OFF } from '../pattern/layout.js';
import { frame } from '../score/frame.js';

const TW = 264, TH = 148;
const BODY = { pol0: 0, pol1: 0, inDur: 1, outDur: 1 };
const scoreFor = (p, world) => ({ gestures: [{ t0: 0, t1: 26, arcEnd: 26, pattern: p, ...BODY, ...(p.gesture || {}) }], phi: t => t * 0.3, ...(world ? { world } : null) });

export class Library {
  constructor(app, hand, el) {
    this.app = app; this.hand = hand; this.el = el;
    this.tiles = new Map(); this.queue = []; this.R = null; this.hover = null;
    el.innerHTML = `<header><span>patterns</span><span><button data-wander></button>&nbsp;&nbsp;&nbsp;<button data-close>close</button></span></header><div class="scroll"></div>`;
    this.wanderBtn = el.querySelector('[data-wander]');
    this.wanderBtn.onclick = () => { hand.wander(); this.mark(); };
    el.querySelector('[data-close]').onclick = () => this.show(false);
    const scroll = this.scroll = el.querySelector('.scroll');
    for (const fam of app.families) {
      const h = document.createElement('h3'); h.textContent = fam; scroll.appendChild(h);
      const grid = document.createElement('div'); grid.className = 'grid'; scroll.appendChild(grid);
      for (const p of app.patterns.filter(q => q.family === fam)) this.tile(p, grid, p.id);
    }
    // A world's own patterns are only ever shown while it's on, and never join the library's. See sync().
    this.films = [...scroll.children];
    this.worldNow = null;
    this.shelves = new Map();
    app.onFrame?.push(() => { if (this.open && this.worldNow !== (app.stage.world ?? null)) this.sync(); });
    hand.on('pattern', () => this.mark());
    hand.on('going', p => this.mark(p));
    hand.on('wander', () => { this.heading = null; this.mark(); });
    this.mark();
  }

  // One pattern's tile. to: what a click asks for, its id in the library, the pattern itself in a world, whose patterns no id can find.
  tile(p, grid, to, world = null) {
    const b = document.createElement('button');
    b.className = 'tile'; b.title = p.name;
    const c = document.createElement('canvas'); c.width = TW; c.height = TH;
    const s = document.createElement('span'); s.textContent = p.name.toLowerCase();
    b.append(c, s); grid.appendChild(b);
    b.onclick = () => { this.hand.go(to); this.mark(p); };
    b.onpointerenter = () => this.play(p);
    b.onpointerleave = () => { if (this.hover?.p === p) this.stopPlaying(true); };
    const t = { b, c, g: c.getContext('2d', { alpha: false }), p, done: false, world };
    this.tiles.set(p.id, t);
    return t;
  }

  // While a world with patterns of its own is on, those are the patterns: a click on one is a click on what can be shown. Its tiles are made the first time it's asked for, and drawn by this same small renderer, in the world's own programs.
  sync() {
    const W = this.app.stage.world ?? null, own = W?._pool?.length ? W : null, was = this.worldNow?._pool?.length ? this.worldNow : null;
    this.worldNow = W;
    if (own !== was) {
      for (const n of this.films) n.hidden = !!own;
      for (const [K, shelf] of this.shelves) for (const n of shelf.nodes) n.hidden = K !== own;
      if (own && !this.shelves.has(own)) {
        const h = document.createElement('h3'); h.textContent = own.name.toLowerCase();
        const grid = document.createElement('div'); grid.className = 'grid';
        this.scroll.prepend(h, grid);
        this.shelves.set(own, { nodes: [h, grid], tiles: own._pool.map(p => this.tile(p, grid, p, own)) });
        this.drawShelf(own);
      }
      this.scroll.scrollTop = 0;
    }
    this.mark();
  }

  async drawShelf(W) {
    const shelf = this.shelves.get(W);
    if (!shelf || !this.R) return;
    await this.R.whenReady();
    await this.R.prepareWorld(W);
    const wp = this.R.worldPrograms.get(W);
    if (wp.failed) return;
    shelf.ready = true;
    this.queue.unshift(...shelf.tiles.filter(t => !t.done));      // ahead of the library's, which are out of sight for now
    if (!this.pumping) this.pump();
  }

  get open() { return !this.el.hidden; }
  show(on = !this.open) {
    this.el.hidden = !on;
    if (on) { this.sync(); this.mark(); this.begin(); const here = this.tiles.get(this.app.lastFrame?.G?.pattern?.id); here?.b.scrollIntoView({ block: 'nearest' }); }
  }

  mark(p) {
    if (p) this.heading = p;
    const cur = this.app.lastFrame?.G?.pattern;
    if (!p && this.heading === cur) this.heading = null;
    const id = (this.heading ?? cur)?.id;
    for (const t of this.tiles.values()) t.b.classList.toggle('here', t.p.id === id);
    const held = this.hand.isHeld();
    this.wanderBtn.textContent = 'wander';
    this.wanderBtn.classList.toggle('on', !held);
  }

  // The second renderer only exists once someone wants to look.
  async begin() {
    if (this.started) return;
    this.started = true;
    try {
      const cv = document.createElement('canvas');
      this.R = new Renderer(cv);
      this.R.resize(TW, TH, 1);
      await this.R.whenReady();
    } catch (e) { console.warn('thumbnails unavailable', e); return; }
    this.queue = [...this.tiles.values()].filter(t => !t.world);
    // nearest the visible part first would be nicer; top to bottom reads as it arrives
    this.pump();
    for (const W of this.shelves.keys()) this.drawShelf(W);
  }

  drawTile(t, time) {
    frame(scoreFor(t.p, t.world), time, this.R, null);
    this.R.draw();
    t.g.drawImage(this.R.canvas, 0, 0);
  }

  pump() {
    const t = this.queue.shift();
    this.pumping = !!t;
    if (!t) return;
    if (!t.done) {
      try {
        this.drawTile(t, 13); t.done = true;
        if (this.R.slotA[OFF['sf.on']] > 0.5 && !(this.R.variant & FOLD)) { t.done = false; this.queue.push(t); }      // what a fold's drawn with isn't built yet: it's drawn plain for now, and again once it is
      } catch (e) { console.warn('thumbnail failed', t.p.id, e); }
    }
    this.lastDraw = performance.now();
    // one per pause; never two in a row, whatever the frame rate
    setTimeout(() => requestAnimationFrame(() => this.pump()), 24);
  }

  play(p) {
    const t = this.tiles.get(p.id);
    if (!this.R?.ready || (t.world && !this.shelves.get(t.world)?.ready)) return;
    this.stopPlaying(false);
    const start = performance.now();
    const run = now => {
      if (this.hover !== h) return;
      // the whole long move in about nine seconds, and back
      const s = (now - start) / 1000, w = (0.5 + s / 9) % 2, u = w < 1 ? w : 2 - w;
      if (!t.skip) { try { frame(this.scoreForPlay(t.p, u, s, t.world), 0, this.R, null); this.R.draw(); t.g.drawImage(this.R.canvas, 0, 0); } catch { /* the still stays */ } }
      t.skip = !t.skip;
      requestAnimationFrame(run);
    };
    const h = this.hover = { p, t };
    requestAnimationFrame(run);
  }

  scoreForPlay(p, u, s, world) {
    return { gestures: [{ t0: -u * 26, t1: 26 - u * 26, arcEnd: 26 - u * 26, pattern: p, ...BODY, ...(p.gesture || {}) }], phi: () => 3.9 + s * 0.3, ...(world ? { world } : null) };
  }

  stopPlaying(redraw) {
    const h = this.hover;
    this.hover = null;
    if (redraw && h && this.R?.ready) requestAnimationFrame(() => { if (!this.hover) { try { this.drawTile(h.t, 13); } catch { /* keep what's there */ } } });
  }
}
