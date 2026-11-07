// Mitosis: a grid of fat dots, every one of them dividing at once, for ever.
//
// Each cell's dot is two half-dots pulled apart along a diagonal and blended at the waist. Going into the hit it stretches into a peanut and its waist pinches; on the hit the waist parts,
// and the two halves go on out to where the next, finer grid wants them. The view pushes in by root two and turns an eighth of a turn about a fixed point over the same step, so by the end
// of it the halves sit exactly where their parent sat, at the same size. A whole step changes nothing at all: it's a Shepard tone of cell division.
//
// Why it's exact. Parents are discs of radius R0 on the integer grid. Split along (1, sigma), the daughters are discs of R0/sqrt2 on Z2 +- (1/4, sigma/4), which is the parent grid turned
// sigma*45 degrees, shrunk by sqrt2 and moved. That similarity has a fixed point, (0, 1/2) for either sigma, and that's where the frame's middle is. So in lattice coordinates
//   Y = P + 2^(-z/2) R(sigma z pi/4) (L - P)
// with z going 0 to 1 over the step, and the daughters at z = 1 are the parents at z = 0.
// The area of black never changes as they divide (each half has half of it), so a division can't flash: the size of each half-dot is solved for that, blend and all.
//
// A step's numbers, in a slot:
//   field.kind 4, field.a 0, field.b cells to a picture unit, field.ph z (how far the view has pushed in, 0..1)
//   field.spin e (how far apart the halves are, 0..1), field.scale rho (each half's radius), field._1 kb (the blend at the waist), field._2 the lean of the split
//   star._1 sigma (+1 or -1: which diagonal, and which way the view turns)
// Under the field the sheet is plain stripes, which the field takes away again, so wherever the field can't be drawn (the middle of a change of mode) the dots go into stripes and never into a solid.
import { OFF } from '../../pattern/layout.js';
import { evalTrack, smoother } from '../../score/curves.js';
import { surged, handClock } from '../../score/moves/surge.js';

export const R0 = 0.37;          // the parent's radius, in cells: black is pi*R0^2 = 43% of the sheet
export const KB = 0.12;          // the waist's round, in cells: the two halves are joined by a round fillet this big, which lets go after the hit
export const W = 0.5;            // where in a step the hit falls
const LAM = 0.22;                // the share of the push-in that goes steadily, so the view never stops travelling. The rest surges after each hit
export const KK = 8;             // cycles of the field to a cell. Steep, so the song moving the threshold or a line's weight moves a dot's edge by a pixel at most: its size is its own, and the division is the beat
export const LINES = 2.2;        // the stripes under the field
const AX = Math.SQRT1_2;         // how far apart the halves end up, in cells
const NOSONG = 0.42;             // steps a second with no song
const FIL = 1 - Math.SQRT1_2;    // a round union of two things in one place is the thing this share of the round bigger

// ---------------------------------------------------------------- the shape, and keeping its area
// Two discs joined by a round: the union, filleted where both are within r. Its edges stay circles and arcs, so the waist pinches cleanly and never curls, and it parts by itself, on the hit.
export const roundUnion = (a, b, r) => (r <= 0 ? Math.min(a, b) : Math.max(r, Math.min(a, b)) - Math.hypot(Math.max(r - a, 0), Math.max(r - b, 0)));
// The area of two discs of radius rho, delta apart, joined by a round of k: four times the quarter, column by column, each column's height found by halving.
function areaOf(rho, delta, k) {
  if (k <= 0) { const d = Math.min(delta, 2 * rho); return 2 * Math.PI * rho * rho - (2 * rho * rho * Math.acos(d / (2 * rho)) - (d / 2) * Math.sqrt(Math.max(0, 4 * rho * rho - d * d))); }      // two discs and their lens
  const h = delta / 2, x1 = h + rho + k, N = 40, dx = x1 / N;
  let a = 0;
  for (let i = 0; i < N; i++) {
    const x = (i + 0.5) * dx, f = y => roundUnion(Math.hypot(x - h, y) - rho, Math.hypot(x + h, y) - rho, k);
    if (f(0) >= 0) continue;
    let lo = 0, hi = rho + k;
    for (let n = 0; n < 12; n++) { const m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; }
    a += (lo + hi) / 2;
  }
  return 4 * a * dx;
}
const AREA = Math.PI * R0 * R0;
const solveRho = (e, k) => { let lo = 0.1, hi = R0 + 0.05; for (let n = 0; n < 18; n++) { const m = (lo + hi) / 2; if (areaOf(m, AX * e, k) < AREA) lo = m; else hi = m; } return (lo + hi) / 2; };
// The hit: where the waist parts, the round held. The middle of the waist is FIL*KB out from each disc then.
export const E_HIT = (() => { let lo = 0.3, hi = 1; for (let n = 0; n < 26; n++) { const m = (lo + hi) / 2; if (AX * m / 2 - solveRho(m, KB) < FIL * KB) lo = m; else hi = m; } return (lo + hi) / 2; })();
// Going into the hit the halves come apart fastest a little past half way, and slow into it: so the waist pinches gradually, under a few pixels only for the last frame or two, and parts on the hit.
// After it they fly apart, fastest soon after, and come to rest at the next grid while the round lets go. All of it C2, through the hit and the whole step.
const pathAt = u => {
  if (u < W) return [E_HIT * smoother(Math.pow(u / W, 1.4)), KB];
  const q = (u - W) / (1 - W);
  return [E_HIT + (1 - E_HIT) * smoother(Math.pow(q, 0.7)), KB * (1 - smoother(q))];
};
// Each half's radius along that path, so the area holds: worked out once, by where in the step.
const TN = 64, RHO = new Float32Array(TN + 1);
for (let i = 0; i <= TN; i++) { const [e, k] = pathAt(i / TN); RHO[i] = solveRho(e, k); }
RHO[0] = R0 - FIL * KB;      // exactly: the two halves in one place, rounded, are the parent
RHO[TN] = R0 * Math.SQRT1_2;   // and exactly the next grid's parent at the end
const read = u => { const x = Math.min(TN, Math.max(0, u * TN)), i = Math.min(TN - 1, Math.floor(x)); return RHO[i] + (RHO[i + 1] - RHO[i]) * (x - i); };

// The shape at u, 0..1 through a step.
// The waist is held to the hit exactly: before it the round is never less than keeps the middle of the waist MU*(time to the hit) inside, so it thins to nothing as the square root of the
// time left, a few pixels for the last frame or two, and parts on the hit whatever the rounding in the tables. After it the round is never more than leaves the waist parted.
const MU = 0.035, GAP = 0.002;
export function shapeAt(u) {
  const [e, k0] = pathAt(u), rho = read(u), d = AX * e / 2;
  const kb = u < W ? Math.max(k0, (d - rho + MU * (W - u) / W) / FIL) : Math.min(k0, Math.max(0, (d - rho - GAP) / FIL));
  // The push-in: some of it steadily, and the rest surging after the hit, peaking a little after it and at rest again before the next one.
  const v = Math.max(0, (u - 0.38) / 0.62), z = LAM * u + (1 - LAM) * smoother(Math.pow(v, 0.8));
  return { e, kb, rho, z };
}

// Into a slot: the step at s, sigma, steps a second.
export function writeStep(out, s, sigma) {
  const k = Math.floor(s), u = s - k, sh = shapeAt(u);
  out[OFF['field.ph']] = sh.z; out[OFF['field.spin']] = sh.e; out[OFF['field.scale']] = sh.rho; out[OFF['field._1']] = sh.kb; out[OFF['field._2']] = 0;
  out[OFF['star._1']] = sigma;
}

// Which diagonal a step goes by: sigma0, flipped at each step in flips (whole steps, where it can't show).
export const sigmaOf = (m, s) => { const k = Math.floor(s); let n = 0; for (const f of m.flips) if (k >= f) n++; return (n % 2 ? -1 : 1) * m.sigma0; };

// A dot pattern's drive. With a schedule (src/worlds/matter/direct.js), it's the song's; with none, it marches on the clock.
export function cellsDrive(out, { t, phi, G }) {
  const m = G?.mitosis;
  if (m) {
    const s = evalTrack(m.knots, t);
    writeStep(out, s, sigmaOf(m, s));
    return;
  }
  // Picked by hand in a song, a step on each of its strong beats. With no song, a step about every two and a half seconds on the wander's clock, surging into each hit. Either way the diagonal goes the other way every eight.
  const P = globalThis.app?.stage?.score?.react?.pulses, song = P && P.length > 1;
  const s = (song ? handClock({ t, phi, G }) : surged(phi * PHI_STEPS, 1.6)) + W;
  writeStep(out, s, Math.floor(s / 8) % 2 ? -1 : 1);
}
const PHI_STEPS = NOSONG / (76 / 60 / 8);      // the wander's phi goes at 76 bpm, an eighth of a cycle a beat

// ---------------------------------------------------------------- the shader: the dots, as a field
export const FIELD = `
float wMatterRound(float a,float b,float r){ return r<=0.?min(a,b):max(r,min(a,b))-length(max(vec2(r-a,r-b),0.)); }
// Each site's two halves, from the four sites round this point: a fat half reaches past its own cell, never past the next.
float wMatterCells(vec2 Y,float e,float rho,float kb,float ang){
  vec2 ax=vec2(cos(ang),sin(ang))*(.35355339*e),c=floor(Y);
  float d=1e9;
  for(int i=0;i<4;i++){
    vec2 q=Y-c-vec2(float(i&1),float(i>>1));
    d=min(d,wMatterRound(length(q-ax)-rho,length(q+ax)-rho,kb));
  }
  return d;
}
float worldField(int b,vec2 X,vec4 f){
  vec4 f2=uG[b+I_field2];
  float fq=uG[b+I_tune].x,sg=uG[b+I_star2].y,z=f.w;
  vec2 L=X*fq*f.z;                                         // in cells, the frame's middle at the fixed point
  vec2 Y=vec2(0.,.5)+exp2(-.5*z)*(rot(sg*z*.78539816)*L);
  float sd=wMatterCells(Y,f2.x,f2.y,f2.z,(sg>0.?.78539816:-.78539816)+f2.w);
  return .25+clamp(sd*${KK.toFixed(2)},-.24,.24)-dot(uG[b].xy,X*fq);      // black inside, white out, and the stripes under it taken away
}
`;
