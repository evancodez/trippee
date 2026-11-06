// Listening happens off the main thread, so the picture keeps travelling while a song is being worked out.
import { analyse } from './analysis.js';

self.onmessage = async e => {
  try {
    const A = await analyse(e.data, p => self.postMessage({ progress: p }));
    const buffers = Object.values(A).filter(x => ArrayBuffer.isView(x)).map(x => x.buffer);
    self.postMessage({ result: A }, buffers);
  } catch (err) {
    self.postMessage({ error: String(err && err.stack || err) });
  }
};
