// Recording and stills. The recorder never looks at the live canvas directly: it copies each finished frame onto a 2D canvas of
// one fixed size, so a window resize can't change the stream's size and the file always plays to its end.
const TYPES = [
  'video/mp4;codecs=avc1.64002A,mp4a.40.2', 'video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4',
  'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm',
];

const save = (blob, name) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
};

const stamp = () => {
  const d = new Date(), z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
};

export class Recorder {
  constructor(app) { this.app = app; this.rec = null; this.started = 0; this.autosave = true; this.last = null; }
  get on() { return !!this.rec; }
  seconds() { return this.rec ? (performance.now() - this.started) / 1000 : 0; }

  start() {
    if (this.rec) return;
    const app = this.app, src = app.canvas;
    const aspect = src.width / src.height;
    let H = 1080, W = Math.round(H * aspect / 2) * 2;
    if (W > 1920) { W = 1920; H = Math.round(W / aspect / 2) * 2; }
    const copy = this.copy = document.createElement('canvas');
    copy.width = W; copy.height = H;
    const g = copy.getContext('2d', { alpha: false });
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    // Whatever the window does from now on, the frame keeps this shape: cover, crop the rest.
    this.draw = () => {
      const sw = src.width, sh = src.height, a = W / H;
      let cw = sw, ch = sh;
      if (sw / sh > a) cw = Math.round(sh * a); else ch = Math.round(sw / a);
      g.drawImage(src, (sw - cw) >> 1, (sh - ch) >> 1, cw, ch, 0, 0, W, H);
      this.frames = (this.frames || 0) + 1;
    };
    this.draw();
    const stream = copy.captureStream(60);
    const audio = this.audioTracks();
    for (const tr of audio) stream.addTrack(tr);
    const mimeType = TYPES.find(t => MediaRecorder.isTypeSupported(t)) || '';
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 16e6, audioBitsPerSecond: 256e3 });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    this.mime = rec.mimeType || mimeType;
    this.hasAudio = audio.length > 0;
    this.finished = new Promise(res => {
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: this.mime.split(';')[0] });
        this.last = blob;
        const name = `trippee-${stamp()}.${this.mime.includes('mp4') ? 'mp4' : 'webm'}`;
        this.lastName = name;
        if (this.autosave) save(blob, name);
        res(blob);
      };
    });
    app.onFrame.push(this.draw);
    rec.start(1000);
    this.rec = rec; this.frames = 0; this.started = performance.now();
  }

  stop() {
    if (!this.rec) return Promise.resolve(null);
    const app = this.app, i = app.onFrame.indexOf(this.draw);
    if (i >= 0) app.onFrame.splice(i, 1);
    const f = this.finished;
    if (this.rec.state !== 'inactive') this.rec.stop();
    this.rec = null;
    return f;
  }

  audioTracks() {
    try { return this.app.song?.audioStream?.()?.getAudioTracks() ?? []; }
    catch (e) { console.warn('no song audio for the recording:', e); return []; }
  }

  // The drawing buffer only holds the picture in the task that drew it, so a still is taken in the frame callback.
  picture() {
    const app = this.app;
    return new Promise(res => {
      const once = () => {
        app.onFrame.splice(app.onFrame.indexOf(once), 1);
        app.canvas.toBlob(blob => {
          this.lastPicture = blob;
          if (this.autosave) save(blob, `trippee-${stamp()}.png`);
          res(blob);
        }, 'image/png');
      };
      app.onFrame.push(once);
    });
  }
}
