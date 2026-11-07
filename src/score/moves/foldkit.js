// What the fold moves share: mirrors as numbers, and the numbers as slot numbers. See src/gl/chunks/fold.js for what each does.
import { OFF } from '../../pattern/layout.js';

// A mirror, for sf.m0...: a|z|^2 - 2 b.z + c = 0, |b|^2 - ac = 1. What's where it comes out positive gets reflected.
export const lineM = (nx, ny, d) => { const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n; return [0, -nx, -ny, -2 * d]; };     // reflects what's past n.z = d
export const lineAt = (turns, d) => lineM(Math.cos(turns * Math.PI * 2), Math.sin(turns * Math.PI * 2), d);
export const circleOut = (cx, cy, r) => { const a = 1 / r, x = cx * a, y = cy * a; return [a, x, y, (x * x + y * y - 1) / a]; };     // reflects what's outside it, in
export const circleIn = (cx, cy, r) => { const a = -1 / r, x = cx * a, y = cy * a; return [a, x, y, (x * x + y * y - 1) / a]; };     // reflects what's inside it, out

export function writeChain(out, mirrors, reps = 1) {
  out[OFF['sf.on']] = 1; out[OFF['sf.reps']] = reps; out[OFF['sf.n']] = mirrors.length;
  mirrors.forEach(([a, x, y, c], i) => { out[OFF[`m${i}.a`]] = a; out[OFF[`m${i}.x`]] = x; out[OFF[`m${i}.y`]] = y; out[OFF[`m${i}.c`]] = c; });
}
export function writeFan(out, { x = 0, y = 0, al = 0, rot = 0 }) {
  out[OFF['sf.on']] = 1; out[OFF['fan.x']] = x; out[OFF['fan.y']] = y; out[OFF['fan.al']] = al; out[OFF['fan.rot']] = rot;
}
export function writeLog(out, { a, b, off = 0, tw = 0 }) {
  out[OFF['sf.on']] = 1; out[OFF['lf.a']] = a; out[OFF['lf.b']] = b; out[OFF['lf.off']] = off; out[OFF['lf.tw']] = tw;
}
export function writeFeedback(out, { S, turn = 0, rx = 16 / 9, ry = 1, x = 0, y = 0, tau = 0 }) {
  out[OFF['sf.on']] = 1; out[OFF['sf.S']] = S; out[OFF['sf.turn']] = turn; out[OFF['sf.rx']] = rx; out[OFF['sf.ry']] = ry; out[OFF['sf.dx']] = x; out[OFF['sf.dy']] = y; out[OFF['sf.tau']] = tau;
}
export function writeMobius(out, [ax, ay], [bx, by], [cx, cy], [dx, dy]) {
  out[OFF['sf.on']] = 1;
  out[OFF['mob.ax']] = ax; out[OFF['mob.ay']] = ay; out[OFF['mob.bx']] = bx; out[OFF['mob.by']] = by;
  out[OFF['mob.cx']] = cx; out[OFF['mob.cy']] = cy; out[OFF['mob.dx']] = dx; out[OFF['mob.dy']] = dy;
}
