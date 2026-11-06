// The extras are listened for off the main thread too, after the main analysis, from the stereo song.
import { extras, buffersOf } from './extras.js';

self.onmessage = async e => {
  try {
    const { L, R, A } = e.data;
    const X = await extras(L, R, A, p => self.postMessage({ progress: p }));
    self.postMessage({ result: X }, [...buffersOf(X)]);
  } catch (err) {
    self.postMessage({ error: String(err && err.stack || err) });
  }
};
