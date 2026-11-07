// Shatter and heal: on the song's biggest arrival the sheet breaks like a mirror, and on the next section's downbeat the last shard locks back in.
//
// Cracks race out from one point, small shards near it and big ones at the edges, like a stone through a window: straight cracks out from the point, and cracks across them from spoke to spoke.
// No hole ever opens. Each shard is a window that stays where it is on the screen, and what's in it is the sheet, turned, slid and tipped a little like a loose tile, so the lines break direction
// at every crack. The tip is only foreshortening, through a short lens: nothing is lit and nothing shines, and it's never more than about 40 degrees. The shards drift with the tune while it holds.
// Through the last bar they swing back, from the edges in, faster and faster, and the one at the point locks on the hit. A shard at rest is exactly the sheet, so nothing's drawn at a crack and the
// frame after the last one is the plain sheet, to the bit.
//
// All of it is a pure function of the picture's clock: the layout from a seed, each shard's turn, slide and tip from the time. They go to the shader in the mode's own numbers and its table.
//   uW[4]        on (and the geometry share), the point x, y, how many spokes
//   uW[5]        how many rings across, the lens's distance, the angle the spokes are laid out from
//   table row 0  each shard's turn, slide x, y and tip, every frame
//   row 1        the line it tips about, and its pivot
//   row 2        each spoke's direction
//   row 3        where each ring crosses each spoke, ring by ring
// Fetched, not indexed out of the block: on this GPU a uniform read at an index worked out per pixel cost 5 ms a frame at 3024x1964.
import { rng, clamp } from '../../score/curves.js';

const TAU = Math.PI * 2;
export const NS = 10, NR = 4, CELLS = NS * (NR + 1);      // 50 shards
const RINGS = [0.13, 0.32, 0.6, 1.02];      // how far out each ring of cracks goes, in frame heights from the point, before the jitter
const LENS = 4;              // the distance of the lens the tips are seen through, in picture units: long, so a tip is mostly foreshortening and only a little perspective
const CRACK = 0.5;           // seconds for the cracks to reach the farthest shard
const OPEN = 0.42;           // seconds each shard takes to come loose
const HEAL_FROM = 1;         // bars before the lock that the first shard starts back

// ---------------------------------------------------------------- the layout
// Which shard a point is in: the same sum the shader does.
function cellOf(L, x, y) {
  const dx = x - L.cx, dy = y - L.cy, X = (a, b, c, e) => a * e - b * c, u = j => [Math.cos(L.ang[j]), Math.sin(L.ang[j])];
  let rel = (Math.atan2(dy, dx) - L.base) % TAU; if (rel < 0) rel += TAU;
  let j = Math.min(NS - 1, Math.max(0, Math.floor(rel / TAU * NS)));
  if (X(...u(j), dx, dy) < 0) j = j === 0 ? NS - 1 : j - 1;
  else { const jn = j + 1 === NS ? 0 : j + 1; if (X(...u(jn), dx, dy) >= 0) j = jn; }
  const j1 = j + 1 < NS ? j + 1 : 0, u0 = u(j), u1 = u(j1);
  let k = 0;
  for (let r = 0; r < NR; r++) {
    const A = [u0[0] * L.rad[r * NS + j], u0[1] * L.rad[r * NS + j]], B = [u1[0] * L.rad[r * NS + j1], u1[1] * L.rad[r * NS + j1]];
    if (X(B[0] - A[0], B[1] - A[1], dx - A[0], dy - A[1]) < 0) k = r + 1;
  }
  return k * NS + j;
}

export function layoutOf(seed, cx, cy, aspect = 16 / 9) {
  const r = rng(seed);
  const a0 = r() * TAU, ang = [];
  for (let j = 0; j < NS; j++) ang.push(a0 + (j + (r() - 0.5) * 0.62) * TAU / NS);
  const rad = new Float32Array(NR * NS);
  for (let k = 0; k < NR; k++) for (let j = 0; j < NS; j++) {
    let v = RINGS[k] * (0.74 + 0.52 * r());
    if (k) v = Math.max(v, rad[(k - 1) * NS + j] * 1.4);      // each ring outside the one before it on every spoke, so a ring's crack is outside the last one all the way across
    rad[k * NS + j] = v;
  }
  const L = { seed, cx, cy, ang, rad, base: a0 };
  // Each shard's middle and size on the frame, by looking.
  const sx = new Float64Array(CELLS), sy = new Float64Array(CELLS), n = new Float64Array(CELLS), GX = 192, GY = 108;
  for (let i = 0; i < GX; i++) for (let k = 0; k < GY; k++) {
    const x = (-1 + (2 * i + 1) / GX) * aspect, y = -1 + (2 * k + 1) / GY, c = cellOf(L, x, y);
    sx[c] += x; sy[c] += y; n[c]++;
  }
  const cell = [];
  for (let c = 0; c < CELLS; c++) {
    const k = Math.floor(c / NS), j = c % NS, mid = (ang[j] + (j + 1 < NS ? ang[j + 1] : ang[0] + TAU)) / 2, out = k < NR ? rad[k * NS + j] : rad[(NR - 1) * NS + j] * 1.5, inn = k ? rad[(k - 1) * NS + j] : 0;
    const x = n[c] ? sx[c] / n[c] : cx + Math.cos(mid) * (inn + out) / 2, y = n[c] ? sy[c] / n[c] : cy + Math.sin(mid) * (inn + out) / 2;
    cell.push({ x, y, area: n[c] * (4 * aspect) / (GX * GY), d: Math.hypot(x - cx, y - cy) });
  }
  // How each comes loose. Small ones near the point go furthest: they took the blow.
  const far = Math.max(...cell.map(c => c.d), 1e-3);
  cell.forEach((c, i) => {
    const inner = 1 - clamp(c.d / 1.7), sign = r() < 0.5 ? -1 : 1, ux = c.d > 1e-3 ? (c.x - cx) / c.d : 1, uy = c.d > 1e-3 ? (c.y - cy) / c.d : 0, out = 0.012 + 0.03 * inner, side = (r() - 0.5) * 0.03;
    c.rot = sign * (0.09 + 0.13 * r()) * (0.8 + 0.6 * inner);
    c.sx = ux * out - uy * side; c.sy = uy * out + ux * side;
    c.tip = 0.22 + 0.42 * r();
    const al = r() * Math.PI; c.ax = Math.cos(al); c.ay = Math.sin(al);
    c.crack = CRACK * Math.pow(c.d / far, 0.85);
    c.w = r() < 0.5 ? -1 : 1; c.ph = r() * TAU;
    c.i = i;
  });
  // Healing goes from the edges in: the farthest first, the one at the point last.
  [...cell].sort((a, b) => b.d - a.d).forEach((c, rank) => { c.rank = rank; });
  L.cell = cell;
  return L;
}

// ---------------------------------------------------------------- over time
const out3 = u => 1 - (1 - u) ** 3;
const swingBack = u => u * u * (2 - u);      // starts at rest and comes in at speed: it locks, it doesn't settle
// One shatter: { hit, back, bar, L }, on the picture's clock. Its shards' numbers at t into T (4 a shard), or false if it's not on. tune: the tune's slow line there, -1.5..1.5.
export function shardsAt(S, t, tune, T) {
  if (!S || t < S.hit || t >= S.back) return false;
  const B = S.bar, N = CELLS;
  for (const c of S.L.cell) {
    const crack = out3(clamp((t - S.hit - c.crack) / OPEN));
    const x = (c.rank + 1) / N, lock = S.back - 0.45 * B * HEAL_FROM * Math.pow(1 - x, 1.3), each = B * HEAL_FROM * (0.55 - 0.35 * c.rank / N);
    const heal = swingBack(clamp((t - (lock - each)) / each)), a = crack * (1 - heal), o = c.i * 4;
    if (a <= 0) { T[o] = T[o + 1] = T[o + 2] = T[o + 3] = 0; continue; }
    // Drifting while it hangs: slowly, and with the tune, each its own way.
    const since = t - S.hit, sway = 0.22 * Math.sin(0.55 * since + c.ph), lean = 0.16 * c.w * clamp(tune, -1.5, 1.5);
    T[o] = a * c.rot * (1 + sway + lean);
    T[o + 1] = a * (c.sx + 0.012 * c.w * Math.sin(0.4 * since + c.ph) + 0.01 * lean * c.ax);
    T[o + 2] = a * (c.sy + 0.012 * c.w * Math.cos(0.33 * since + c.ph) + 0.01 * lean * c.ay);
    T[o + 3] = a * Math.min(0.7, c.tip * (1 + 0.3 * sway));
  }
  return true;
}

// Into the mode's numbers. geo: the geometry share, which is 0 at the middle of a change of mode.
export function writeShatter(Ua, S, geo) {
  const L = S.L;
  Ua[0] = geo; Ua[1] = L.cx; Ua[2] = L.cy; Ua[3] = NS;
  Ua[4] = NR; Ua[5] = LENS; Ua[6] = L.base; Ua[7] = 0;
}

// The table: row 0 what each shard's doing, row 1 the line it tips about.
export function fillShatter(tex, L, T) {
  if (tex._matterL !== L) {
    for (const c of L.cell) tex.set(c.i, 1, c.ax, c.ay, c.x, c.y);
    for (let j = 0; j < NS; j++) tex.set(j, 2, Math.cos(L.ang[j]), Math.sin(L.ang[j]), 0, 0);
    for (let i = 0; i < NR * NS; i++) { const j = i % NS; tex.set(i, 3, L.rad[i] * Math.cos(L.ang[j]), L.rad[i] * Math.sin(L.ang[j]), 0, 0); }
    tex._matterL = L;
  }
  for (let i = 0; i < CELLS; i++) tex.set(i, 0, T[4 * i], T[4 * i + 1], T[4 * i + 2], T[4 * i + 3]);
}

// ---------------------------------------------------------------- the shader. Only in the mode's fuller programs: most of a film has nothing broken.
export const WARP = `
#ifdef WORLD_FULL
vec2 wMatterSpoke(int j){ return texelFetch(uWT,ivec2(j,2),0).xy; }
vec2 wMatterNode(int i){ return texelFetch(uWT,ivec2(i,3),0).xy; }
float wMatterX(vec2 a,vec2 b){ return a.x*b.y-a.y*b.x; }
#endif
vec2 worldWarp(vec2 p0,vec2 p){
#ifdef WORLD_FULL
  vec4 sh=uW[4];
  if(sh.x<=0.) return p;
  int NS=int(sh.w),NR=int(uW[5].x);
  vec2 d=p-sh.yz;
  // Which spoke it's past: the even layout's guess, then one either way, since none is jittered as far as half a sector
  int j=int(floor(mod(atan(d.y,d.x)-uW[5].z,TAU)/TAU*float(NS)));
  j=j<0?0:j>=NS?NS-1:j;
  if(wMatterX(wMatterSpoke(j),d)<0.) j=j==0?NS-1:j-1;
  else{ int jn=j+1==NS?0:j+1; if(wMatterX(wMatterSpoke(jn),d)>=0.) j=jn; }
  int j1=j+1==NS?0:j+1;
  int k=0;
  for(int r=0;r<6;r++){ if(r>=NR) break; vec2 A=wMatterNode(r*NS+j); if(wMatterX(wMatterNode(r*NS+j1)-A,d-A)<0.) k=r+1; }
  int cell=k*NS+j;
  float id=float(cell);
  if(dFdx(id)!=0.||dFdy(id)!=0.) gBreak=true;      // across a crack the phase jumps, and that one pixel's gradient isn't a real one: it would draw an outline
  vec4 T=texelFetch(uWT,ivec2(cell,0),0)*sh.x;
  if(T==vec4(0.)) return p;
  vec4 Pv=texelFetch(uWT,ivec2(cell,1),0);
  vec2 C=Pv.zw,ax=Pv.xy,ay=vec2(-ax.y,ax.x);
  vec2 q=rot(-T.x)*(p-C-T.yz);
  // A tile tipped about the line ax by T.w, seen through the lens: where on it this pixel looks
  float D=uW[5].y,ct=cos(T.w),st=sin(T.w),da=dot(q,ax),de=dot(q,ay);
  float be=de*D/max(D*ct+de*st,.2*D),al=da*(D-be*st)/D;
  return C+al*ax+be*ay;
#else
  return p;
#endif
}
`;
