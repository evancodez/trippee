// The lab: runs the real app in a real, GPU-backed headless Chrome and lets a script look at it.
//
//   node tools/lab.mjs <script.mjs> [--size 1280,720] [--url http://localhost:5300/] [--out lab-out] [--headed]
//
//   --strict-autoplay keeps Chrome's normal rule that sound needs a user gesture first
//
// The script is an ES module whose default export receives { page, save, sleep, out, log }:
//   page.eval(fnOrExpr, ...args)  evaluates in the page (async is fine) and returns the JSON result
//   page.shot(name)               saves a screenshot of the whole page to <out>/<name>.png
//   save(name, dataUrlOrBuffer)   writes a file to <out>
// Each run gets its own Chrome, profile and debugging port, so runs can overlap safely.
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';

const argv = process.argv.slice(2);
const opt = (name, d) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : d; };
const flag = name => argv.includes('--' + name);
const script = argv[0];
if (!script) { console.error('usage: node tools/lab.mjs <script.mjs> [--size W,H] [--url URL] [--out DIR] [--headed]'); process.exit(2); }

const CHROMES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
];
const chrome = process.env.CHROME || CHROMES.find(existsSync);
if (!chrome) { console.error('no Chrome found; set CHROME=/path/to/chrome'); process.exit(2); }

// Only so many test browsers at once, or the machine crawls for whoever is actually using it. Later runs wait their turn.
const LAB_SLOTS = +(process.env.LAB_SLOTS || 3);
const slotDir = join(tmpdir(), 'trippee-lab-slots');
mkdirSync(slotDir, { recursive: true });
async function takeSlot() {
  for (;;) {
    for (let i = 0; i < LAB_SLOTS; i++) {
      const f = join(slotDir, `slot${i}`);
      try { writeFileSync(f, String(process.pid), { flag: 'wx' }); return f; }
      catch {
        // a slot whose owner has died is free
        try { const pid = +readFileSync(f, 'utf8'); process.kill(pid, 0); }
        catch { try { rmSync(f, { force: true }); } catch {} }
      }
    }
    await new Promise(r => setTimeout(r, 1000));
  }
}
// A run that was killed can't close its Chrome, and those pile up and starve the GPU for everyone. The profile folder names its lab.
function reapOrphans() {
  try {
    const out = execSync('ps -axo pid=,command=', { encoding: 'utf8', maxBuffer: 1 << 24 });
    for (const line of out.split('\n')) {
      const m = /^\s*(\d+)\s.*--user-data-dir=\S*trippee-lab-(\d+)-/.exec(line);
      if (!m || line.includes('--type=')) continue;
      try { process.kill(+m[2], 0); } catch { try { process.kill(+m[1], 'SIGKILL'); } catch {} }
    }
  } catch { /* never mind */ }
}
reapOrphans();
const slot = await takeSlot();
process.on('exit', () => { try { rmSync(slot, { force: true }); } catch {} });

const freePort = () => new Promise(res => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = resolve(opt('out', 'lab-out'));
mkdirSync(out, { recursive: true });
const [w, h] = opt('size', '1280,720').split(',').map(Number);
const url = opt('url', 'http://localhost:5300/');
const port = await freePort();
const profile = mkdtempSync(join(tmpdir(), `trippee-lab-${process.pid}-`));
const proc = spawn(chrome, [
  ...(flag('headed') ? [] : ['--headless=new']),
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${w},${h}`,
  '--mute-audio', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-first-run', '--no-default-browser-check',
  ...(flag('strict-autoplay') ? [] : ['--autoplay-policy=no-user-gesture-required']), '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank',
], { stdio: 'ignore' });

let done = false;
const finish = code => { if (done) return; done = true; try { proc.kill('SIGKILL'); } catch {} sleep(150).then(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(code); }); };
process.on('SIGINT', () => finish(130));
process.on('SIGTERM', () => finish(143));
process.on('SIGHUP', () => finish(129));

for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${port}/json/version`); break; } catch { await sleep(200); } }
const created = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(created.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0;
const pending = new Map(), listeners = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method) for (const l of listeners) l(m);
};
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

const logs = [];
listeners.push(m => {
  if (m.method === 'Runtime.consoleAPICalled') {
    const text = m.params.args.map(a => a.value ?? a.description ?? '').join(' ');
    logs.push(`[${m.params.type}] ${text}`);
    if (m.params.type === 'error' || m.params.type === 'warning') console.log(`  page ${m.params.type}: ${text.slice(0, 600)}`);
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    const text = `${d.text} ${d.exception?.description || ''}`;
    logs.push('[exception] ' + text);
    console.log('  page exception: ' + text.slice(0, 900));
  }
});
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });

const save = (name, data) => {
  const file = join(out, name);
  if (typeof data === 'string' && data.startsWith('data:')) writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
  else writeFileSync(file, data);
  return file;
};
const page = {
  async eval(fn, ...args) {
    const expression = typeof fn === 'function' ? `(${fn})(...${JSON.stringify(args)})` : fn;
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: 3600000 });
    if (r.result?.exceptionDetails) throw new Error('page: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
    return r.result?.result?.value;
  },
  async shot(name) {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    return save(name.endsWith('.png') ? name : name + '.png', Buffer.from(r.result.data, 'base64'));
  },
  async goto(u) { await send('Page.navigate', { url: u }); await sleep(300); },
  send, logs,
};

try {
  await page.goto(url);
  for (let i = 0; i < 120; i++) {
    if (await page.eval('typeof window.trippee !== "undefined" && window.trippee.ready === true')) break;
    await sleep(250);
  }
  const mod = await import(pathToFileURL(resolve(script)).href);
  await mod.default({ page, save, sleep, out, log: console.log });
  finish(0);
} catch (e) {
  console.error('lab failed:', e.message);
  finish(1);
}
