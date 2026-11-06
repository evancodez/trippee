// Tiny static server: `node tools/serve.mjs [port]`, then open http://localhost:5300
// No dependencies, and nothing is sent anywhere. Audio files stay on this machine.
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const port = +(process.argv[2] || process.env.PORT || 5300);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.bin': 'application/octet-stream', '.glsl': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
};

createServer((req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (path.endsWith(sep) || path.endsWith('/')) path += 'index.html';
  const file = join(root, path);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  try {
    const st = statSync(file);
    if (!st.isFile()) throw new Error('not a file');
    const headers = { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' };
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (range) {
      const start = +range[1] || 0, end = range[2] ? +range[2] : st.size - 1;
      res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${st.size}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1 });
      createReadStream(file, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { ...headers, 'content-length': st.size, 'accept-ranges': 'bytes' });
      createReadStream(file).pipe(res);
    }
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(port, '127.0.0.1', () => console.log(`trippee: http://localhost:${port}`));
