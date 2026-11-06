// The song: drop a file anywhere, watch it being listened to, then a thin strip of its sections with a playhead. The music
// builder's app.song does the real work; everything here asks first, because it may not have arrived.
const clock = s => { s = Math.max(0, s | 0); return `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`; };

export class SongPanel {
  constructor(app, hand, el) {
    this.app = app; this.hand = hand; this.el = el;
    this.state = 'empty'; this.seed = 7; this.useMine = false; this.file = null; this.result = null;
    el.innerHTML = `
      <div class="row">
        <button data-pick>choose a song</button>
        <button data-play hidden>play</button>
        <button data-take hidden>another take</button>
        <button data-mine>use the pattern on screen</button>
        <button data-eject hidden>eject</button>
        <span class="grow quiet" data-name>or drop one anywhere</span>
        <span class="quiet" data-time></span>
        <button data-close>close</button>
      </div>
      <div class="progress" data-progress hidden><i></i></div>
      <div class="strip" data-strip hidden><div class="head"></div></div>
      <div class="row balance">
        <span class="quiet">the picture follows</span>
        <label>melody <input type="range" min="0" max="2" step="0.01" data-react="reactMelody"></label>
        <label>pulse <input type="range" min="0" max="2" step="0.01" data-react="reactPulse"></label>
        <label>tone <input type="range" min="0" max="2" step="0.01" data-react="reactTone"></label>
      </div>
      <input type="file" accept="audio/*,video/*" hidden data-file>`;
    const $ = s => el.querySelector(s);
    this.$ = $;
    this.head = $('.head');
    // How much the melody, the pulse and the tone each move the picture. Kept between visits; 1 is the balance as composed.
    const edits = app.edits;
    for (const input of el.querySelectorAll('[data-react]')) {
      const key = input.dataset.react;
      let saved = null;
      try { saved = localStorage.getItem('trippee.' + key); } catch { /* it just won't be remembered */ }
      const v = saved === null || !Number.isFinite(+saved) ? 1 : +saved;
      input.value = v; edits[key] = v;
      input.oninput = () => { edits[key] = +input.value; try { localStorage.setItem('trippee.' + key, input.value); } catch {} };
      input.ondblclick = () => { input.value = 1; input.oninput(); };
    }
    $('[data-pick]').onclick = () => $('[data-file]').click();
    $('[data-file]').onchange = e => { const f = e.target.files?.[0]; if (f) this.load(f); e.target.value = ''; };
    $('[data-close]').onclick = () => this.show(false);
    $('[data-play]').onclick = () => { if (app.song?.aside) app.sound?.handBack?.(); else hand.togglePause(); };
    $('[data-take]').onclick = () => this.take();
    $('[data-mine]').onclick = () => this.toggleMine();
    $('[data-eject]').onclick = () => this.eject();
    $('[data-strip]').onclick = e => {
      const b = e.currentTarget.getBoundingClientRect(), d = this.duration();
      // seeking is a cut in the music, so the picture bends into the new place. A song that's waiting just moves its place.
      if (d) { const at = (e.clientX - b.left) / b.width * d; if (this.app.song?.aside) this.app.song.seek(at); else this.hand.veil(() => this.app.song?.seek?.(at)); }
    };
    app.onFrame.push(() => this.update());
  }

  get open() { return !this.el.hidden; }
  show(on = !this.open) { this.el.hidden = !on; }
  duration() { const s = this.app.song; return s?.duration ?? this.result?.duration ?? 0; }
  available() { return typeof this.app.song?.load === 'function'; }

  toggleMine() {
    this.useMine = !this.useMine;
    this.$('[data-mine]').classList.toggle('on', this.useMine);
    // already playing: the film changes to match
    if (this.state === 'ready') this.compose();
  }

  // A pattern the hand has been working on is what "your pattern" means; otherwise the song chooses its own family.
  options() {
    const o = { seed: this.seed, onProgress: p => this.progress(p), autoplay: true };
    if (this.useMine) o.pattern = this.hand.mine();
    return o;
  }

  async load(file) {
    this.show(true);
    this.file = file;
    this.$('[data-name]').textContent = file.name || 'song';
    if (!this.available()) { this.say('the song part is still being built'); return; }
    // dropped on a pattern you've been holding: it uses yours
    if (this.hand.isHeld() && !this.useMine && !this.app.stage.score.song) { this.useMine = true; this.$('[data-mine]').classList.add('on'); }
    // A song already playing stops under a solid, and the picture wanders while the new one is listened to.
    if (this.state === 'ready') await new Promise(res => this.hand.veil(() => { this.app.song.eject(); res(); }, { close: 0.9, open: 1.8 }));
    this.state = 'listening';
    this.$('[data-progress]').hidden = false;
    this.$('[data-strip]').hidden = true;
    this.$('[data-time]').textContent = '';
    this.progress(0);
    try {
      this.result = await this.app.song.load(file, this.options());
      if (!this.result) return;         // another song was dropped while this one was being listened to
      this.state = 'ready';
      this.$('[data-progress]').hidden = true;
      this.buildStrip();
      for (const b of ['play', 'take', 'eject']) this.$(`[data-${b}]`).hidden = false;
      this.$('[data-pick]').textContent = 'another song';
      this.$('[data-name]').textContent = file.name || 'song';
      this.hand.emit('song', this.result);
    } catch (e) {
      console.error('song failed', e);
      this.state = 'empty';
      this.$('[data-progress]').hidden = true;
      this.say('that file could not be read');
    }
  }

  // Another film of the same song: the old one closes to a solid and the new one opens from it, while the music carries on.
  take() {
    this.seed = (this.seed * 2654435761 >>> 0) % 100000 + 1;
    this.hand.veil(() => { this.app.song.rebuild({ seed: this.seed }); this.buildStrip(); });
  }

  compose() {
    const pattern = this.useMine ? this.hand.mine() : null;
    this.hand.veil(() => { this.app.song.rebuild({ pattern }); this.buildStrip(); });
  }

  eject() {
    this.hand.veil(() => {
      this.app.song.eject();
      this.state = 'empty'; this.result = null; this.file = null;
      for (const b of ['play', 'take', 'eject']) this.$(`[data-${b}]`).hidden = true;
      this.$('[data-strip]').hidden = true;
      this.$('[data-pick]').textContent = 'choose a song';
      this.$('[data-time]').textContent = '';
      this.say('or drop one anywhere');
      this.hand.emit('song', null);
    });
  }

  progress(p) {
    const v = typeof p === 'number' ? p : (p?.progress ?? p?.p ?? 0);
    this.$('[data-progress] i').style.width = (Math.min(1, Math.max(0, v)) * 100) + '%';
    this.$('[data-name]').textContent = `listening  ${Math.round(v * 100)}%`;
  }

  say(text) { this.$('[data-name]').textContent = text; }

  buildStrip() {
    const strip = this.$('[data-strip]'), d = this.duration(), song = this.app.song;
    strip.hidden = false;
    strip.querySelectorAll('.sec, .mark').forEach(n => n.remove());
    if (!d) return;
    const secs = song?.analysis?.segments || [];
    secs.forEach((sec, i) => {
      const t0 = sec.t0 ?? 0, t1 = sec.t1 ?? secs[i + 1]?.t0 ?? d;
      const n = document.createElement('div');
      const label = sec.label ?? '';
      const name = typeof label === 'number' ? String.fromCharCode(97 + label % 26) : String(label).toLowerCase();
      n.className = 'sec' + ((typeof label === 'number' ? label : String(label).charCodeAt(0)) % 2 ? ' odd' : '');
      n.style.left = (t0 / d * 100) + '%'; n.style.width = ((t1 - t0) / d * 100) + '%';
      n.innerHTML = name ? `<span>${name}</span>` : '';
      n.title = name;
      strip.insertBefore(n, this.head);
    });
  }

  update() {
    if (!this.open || this.state !== 'ready') return;
    const s = this.app.song, d = this.duration(), t = s?.resting ? d : s?.aside ? s.time() : this.app.t;
    if (d) {
      this.head.style.left = Math.min(100, t / d * 100) + '%';
      this.$('[data-time]').textContent = `${clock(t)} / ${clock(d)}`;
    }
    this.$('[data-play]').textContent = this.app.song?.playing ? 'pause' : 'play';
  }
}
