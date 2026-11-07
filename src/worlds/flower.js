// Flower Power, the first world. docs/MODES.md, section 3. Sixties psychedelia: flat hot inks and no black, thick bands swelling round a few big flowers, borders buzzing when the harmony pulls.
// A line's ink is what was sounding when it was born: its note on one side, its chord on the other. So the rings going out are the last bars of the song.
import { OFF } from '../pattern/layout.js';
import { pool, FLOW } from './flower/patterns.js';
import { ROWS, paint, chips } from './flower/inks.js';
import { flowClock, hearSong, buzzAt, whoaOf } from './flower/song.js';
import bud, { giveWay } from './flower/bud.js';

const FIELD = `
// A petal: round on top, with a cusp in each valley. soft rounds the cusp, which is what lets it go far from the flower, where cusps would only throw thorns at each other.
float wFlowerPetal(float x,float fat,float soft){ return pow((.5+.5*cos(x)+soft)/(1.+soft),.5*fat); }
vec4 wFlowerPole(int b,int i){ return i==0?uG[b+I_mBlobA]:i==1?uG[b+I_mBlobB]:i==2?uG[b+I_mBlobC]:i==3?uG[b+I_p1]:uG[b+I_p2]; }
// The flowers.
float wFlowerBlooms(int b,vec2 X,vec4 f,vec4 f2,float e){
  float a=f.w,n=f.y,kap=f2.y,be=f2.z,fat=f2.w,fade=uG[b+I_star2].y,sum=0.;
  for(int i=0;i<5;i++){
    vec4 P=wFlowerPole(b,i);
    float r=abs(P.z);
    if(r<1e-4||P.z<0.) continue;
    vec2 d=X-P.xy;
    float q=dot(d,d),er=e*r,D=q+er*er;
    // Each flower gives birth a little out of step with the others (.16 of a unit of S is about .4 of a ring), or the whole frame's share of each ink goes up and down together at the rate of the rings, and that's a whole-frame flash in the chroma.
    float l=.5*log(D)-log(r)+.16*mod(float(i)*2.,5.);
    // The petals: none at the very centre, so it's a bold round cap, and letting go far out, so the echoes melt together.
    if(a!=0.){ float qr=q/(r*r),u=q/D; l-=log(1.+a*u*u/(1.+qr*fade)*wFlowerPetal(n*(atan(d.y,d.x)+P.w)+kap*.5*log(q+1e-5),fat,.006+.012*qr)); }
    sum+=exp(-be*l);
  }
  float S=sum>0.?-log(sum)/be:0.;
  return S+f2.x*exp(S);                 // bands swell going out, but not without end: there are more of them far from a flower, and the gaps fill
}
// Whiplash and Flames, and what's on the way to or from them: only in the programs that draw them (W.fuller). With them in every program a Daisy paid up to 2.6 ms at 3024x1964 for code it never ran.
#ifdef WORLD_FULL
// Whiplash: the sheet is dragged round each pole, so what would be ovals sweeps into long S-curves between them.
vec2 wFlowerCurl(int b,vec2 X,float curl){
  for(int i=0;i<5;i++){
    vec4 P=wFlowerPole(b,i);
    if(P.z==0.) continue;
    vec2 d=X-P.xy; X=P.xy+rot(clamp(P.z*5.,-1.,1.)*curl*exp(-dot(d,d)/(1.2*P.z*P.z)))*d;
  }
  return X;
}
// Whiplash's lines: every pole adds, and the sinks take away. Lines pinch at the saddles.
float wFlowerWhip(int b,vec2 X,float e){
  float wh=0.;
  for(int i=0;i<5;i++){
    vec4 P=wFlowerPole(b,i);
    float r=abs(P.z);
    if(r<1e-4) continue;
    vec2 d=X-P.xy;
    float er=e*r;
    wh+=clamp(P.z*5.,-1.,1.)*.5*log(dot(d,d)+er*er+.0064);
  }
  return wh;
}
// Flames: a flower unrolled, so its radius runs up the frame and its petals along it, the cusps pointing up.
float wFlowerFlame(int b,vec2 X,float a,float kap,float fat,float lobes){ return X.y+log(1.+a*(.55+.45*sin(1.7*X.x+1.3))*wFlowerPetal(lobes*X.x+kap*X.y,fat,.004)); }
#endif
float worldField(int b,vec2 X,vec4 f){
  vec4 f2=uG[b+I_field2],sp=uG[b+I_spare];
  float lines=dot(uG[b].xy,X*uG[b+I_tune].x)/uG[b+I_star2].w;      // the stripes under the field, which it takes away. See patterns.js
#ifdef WORLD_FULL
  float curl=uG[b+I_star2].z;
  if(curl!=0.) X=wFlowerCurl(b,X,curl);
  if(sp.z>=1.) return wFlowerFlame(b,X,f.w,f2.y,f2.w,sp.w)-lines;
  if(sp.x>=1.) return wFlowerWhip(b,X,sp.y)-lines;
#endif
  float S=wFlowerBlooms(b,X,f,f2,sp.y);
#ifdef WORLD_FULL
  if(sp.x!=0.) S=mix(S,wFlowerWhip(b,X,sp.y),sp.x);
  if(sp.z!=0.) S=mix(S,wFlowerFlame(b,X,f.w,f2.y,f2.w,sp.w),sp.z);
#endif
  return S-lines;
}
`;
// Most pixels are one ink: only an edge has both to fetch. A texture fetch for a colour nobody's using cost a whole millisecond at 3024x1964.
const COLOR = `vec3 worldColor(int k0,int k1,float c){ ivec2 n=lineRows(k0,k1); if(c>=1.) return gamma(inkRow(n.x,0)); if(c<=0.) return gamma(inkRow(n.y,1)); return gamma(mix(inkRow(n.y,1),inkRow(n.x,0),c)); }
`;

// With no song, a made-up tune and slow changes.
const TUNE = [0, 1, 2, 0, 1, 7, 0, 2, 1, 0, 3, 1, 0, 2, 1, 2];
const CHANGES = [0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 3, 3, 5, 5, 1, 1];
const made = n => [TUNE[((n % 16) + 16) % 16], CHANGES[(((n >> 1) % 16) + 16) % 16]];
const inkOf = song => {
  if (!song) { made.id = 'made'; return made; }
  if (song.inkAt) return song.inkAt;
  const f = n => { const i = -n; return i >= 0 && i < song.rings ? [song.bloom[i], song.ground[i]] : made(n); };
  f.id = song.id;
  return song.inkAt = f;
};
const clamp01 = x => Math.max(0, Math.min(1, x));
const SWEEP = 1.2, SWEEP_LINES = 6;      // seconds from the line being born to the farthest showing: bands this bold are only about this many lines out from a flower to the corner

export default {
  id: 'flower', name: 'Flower Power', chips, pool, borrow: [], needs: ['voices'],
  glsl: { field: FIELD, color: COLOR },
  ink: { R: ROWS, fams: [0], roll: false, weights: [1, 0, 0, 0] },
  fuller: S => S[OFF['spare.a']] !== 0 || S[OFF['spare.c']] !== 0 || S[OFF['star._2']] !== 0,      // Whiplash's lines, Flames', and the curl
  table: {
    h: 2,
    fill(tex, ctx) {
      // The window of lines that can be showing: one flight's clock ahead of what's being born now, and everything out to the far corner. Read off what's drawn, so a change of world's old clock counts too.
      const S = ctx.change && ctx.x >= 0.5 ? ctx.B : ctx.A, nNow = Math.floor(S[OFF['f0.ph']]) - 4;
      // The buzz stops from the flowers out, over about a second. All at once it's the whole frame's chroma stepping, one half of a whole-frame flash, and the eye can't follow it anyway.
      // With no song it comes and goes on its own, more often gone.
      const song = ctx.tables, none = Math.pow(clamp01(0.5 + 0.5 * Math.sin(ctx.t * 0.13 - 1.2)), 3);
      return paint(tex, nNow - 12, song ? n => buzzAt(song, ctx.t - SWEEP * clamp01((n - nNow - 1) / SWEEP_LINES)) : () => none, inkOf(song));
    },
  },
  tables: (A, M) => hearSong(A, M),
  whoa: (A, M) => whoaOf(hearSong(A, M), M),
  // Its own director: one flow clock for the whole film, and each landing a Bud where it can be.
  direct(score, A, M) {
    if (!score.tau || !score.react) return score;
    const clock = flowClock(score, A);
    score.phi = t => clock(t);
    const g = score.gestures;
    // The whoa has nothing but rings moving: no landing in the bars before it. A landing there comes earlier if there's room, or else the gesture carries on through.
    const w = whoaOf(hearSong(A, M), M), QUIET = 10;
    if (w) for (let i = 0; i + 2 < g.length; i++) {
      const G = g[i], N = g[i + 1];
      if (!(G.t1 - (G.morph || 0) < w.t + 1 && G.t1 > w.t - QUIET)) continue;
      const bars = M?.bars ?? [], at = w.t - QUIET, bar = [...bars].reverse().find(b => b <= at) ?? at;
      if (bar - G.t0 - (G.morph || 0) >= 8) { G.t1 = bar; G.arcEnd = bar; N.t0 = bar; }
      else { G.t1 = N.t1; G.arcEnd = N.t1; G.morph = N.morph; g.splice(i + 1, 1); i--; }
    }
    // Every landing is a Bud (motion.xform), and a rehearsal can't take one away (motion.keep): a flight in these bold inks is the one ugly thing this world can do, so a flash in a Bud has to be fixed in the Bud. tests/flashworld.mjs holds it to the limit.
    for (const G of g) delete G.xform;
    return score;
  },
  // Lung: petal depth.
  uniforms(U, ctx) {
    // In a Bud the rings don't ease to rest and catch up, as other transformations' clocks do: they run on the one clock, right through it.
    if (ctx.kind === 'bud' && ctx.from && ctx.to) {
      const a = ctx.from.pattern.g.fams[0].ph, b = ctx.to.pattern.g.fams[0].ph;
      // A rehearsal that's watched a Bud flash can ask the rings to give way (bud.js, its levers): behind at the middle, where everything else is moving fastest, and paying it back at the ends, where nothing is. They land exactly on the clock.
      ctx.A[OFF['f0.ph']] = a + (b - a) * ctx.T - FLOW * ctx.score.phi(ctx.t, ctx.to) - (ctx.from.budRest ?? 0) * giveWay(ctx.x);
    }
    const s = ctx.at(ctx.c);
    if (s) { const k = 1 + 0.3 * Math.min(s.lung, 1.2); ctx.A[OFF['field.ph']] *= k; ctx.B[OFF['field.ph']] *= k; }
  },
  motion: { len: [18, 30], morph: [9, 12], xforms: { bud }, xform: 'bud', keep: ['bud'] },
  hear: { pulse: 1, melody: 1, tone: 0.4, harmony: 0.7, lung: 1 },
};
