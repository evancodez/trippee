// The helpers every world program has, just before main(). They only ever run in world programs: this file isn't loaded until a world is chosen. See docs/MODES.md, section 4.
//   uW[0]  x the coverage draw, y how much of the beat reaches the threshold, z a change's progress on its own half, w how wide a band's share of that is
//   uW[1]  x how much a line's gradient counts, in the sound's own programs only, y unused, z which way a change is going (-1 draining, +1 arriving, 0 none), w a flight's x
//   uW[2]  how much each family counts towards a line's number
//   uW[3]  x how many rows (ink.R), y the roll (ink.roll), z the geometry share (1, except near the middle of a change), w which way a straight front travels
//   uW[4..33] slot A's numbers, uW[34..63] slot B's. Yours: the engine never touches them.
export const MACROS = `#define WEIGHTS uW[2]
#define WROWS uW[3].x
#define WROLL uW[3].y
#define WGEO uW[3].z
`;

export default `vec3 film(float c){ return mix(uF[1].rgb,uF[2].rgb,pow(c,.4545)); }      // exactly what the film draws
vec3 gamma(vec3 v){ return pow(max(v,vec3(0.)),vec3(.4545)); }
vec3 inkRow(int row,int side){ return texelFetch(uWT,ivec2(row,side),0).rgb; }

#ifdef WORLD_CELLS
// Which line is on each side of the nearest edge: x the side c calls white, y the side it calls black. Hard, because coverage is the anti-aliasing.
// For each family floor(x) numbers the nearest white band and floor(x+.5) the nearest black one (band() has p centred on .5 and q on 0). tri(x)>d says which this pixel is in, and so which number counts.
// The edge inkBand really draws is at |tri(x)-d|=t, so the nearest one is the smallest (|tri(x)-d|-t)/(4g), and that's negative in the zone a threshold has filled: there the pixel belongs to the cell across that family's edge.
// The sum of the numbers is a cell's number, parity of the sides says which of the two cells is the white one. Exact on the band path, through duty, threshold and XOR. Dots and quasicrystals (round, sum) have no such edges.
vec2 lineCells(int k0,int k1,vec4 weight){
  float T=abs(gTh[k0/FAM]),here=0.,swap=0.,best=1e9;
  bool odd=gFlip[k0/FAM];
  for(int k=k0;k<k1;k++){
    if(!gOn[k]) continue;
    float x=gPh[k],d=gDu[k],w=weight[k%FAM],v=tri(x)-d,a=floor(x),b=floor(x+.5);
    bool s=v>0.;
    if(!s) odd=!odd;
    if(abs(d)>=1.) continue;      // closed, or a constant: it has no edges, so no numbers
    here+=w*(s?a:b);
    float e=(abs(v)-T*(1.-smoothstep(.85,1.,abs(d))))/(4.*gGn[k]);
    if(e<best){ best=e; swap=w*(s?b-a:a-b); }
  }
  return odd?vec2(here+swap,here):vec2(here,here+swap);
}
ivec2 lineRows(int k0,int k1){ vec2 n=lineCells(k0,k1,WEIGHTS); return ivec2(mod(n,WROWS)); }      // the row for the white side, the row for the black side
#endif
#ifdef FLIGHT
float wAcross=.5,wSoft=.02;
// The band of the run's first family with edges, white and black numbered apart, cut where inkBand cuts it: threshold and duty both.
float wBand(int k0,int k1){
  float th=gTh[k0/FAM];
  for(int k=k0;k<k1;k++){
    if(!gOn[k]||abs(gDu[k])>=1.) continue;
    float x=gPh[k],d=gDu[k],v=tri(x)-d,t=abs(th)*(1.-smoothstep(.85,1.,abs(d)));
    bool w=th>=0.?v>t:v>-t;
    wAcross=fract(w?x:x+.5); wSoft=clamp(1.5*gGn[k],.004,.25);
    return w?floor(x):floor(x+.5)+.5;
  }
  return 0.;
}
// A change of ink runs across a band, one edge to the other, so a pixel is one ink or the other and never a tint of the two. s: how far along this band's change is. wBand says where this pixel is across it.
float wFront(float s){ float S=s*(1.+2.*wSoft)-wSoft; return smoothstep(wAcross-wSoft,wAcross+wSoft,S); }
float wSmooth(float x){ x=clamp(x,0.,1.); return x*x*x*(x*(x*6.-15.)+10.); }
float wHash(float n){ n=fract(n*.1031); n*=n+33.33; n*=n+n; return fract(n); }
// How far along one band is, out of x: bands near the focus go first, with a hash of the band's number so that they don't go as one ring.
float wShare(float x,float w,float cell,vec2 p,vec2 focus){ return wSmooth((x*(1.+w)-(.6*clamp(length(p-focus)/2.4,0.,1.)+.4*wHash(cell)))/w); }
// A change of world's own order (modes9): each band in its own time (the hash of its number), over slow blobs that stay where they are, so the new inks come in band by band along the pattern's own lines, in patches all over the picture.
// It was the distance from the focus, and out of a corner's focus that was a disc growing over the picture. Nothing here jumps where a flight's outer pattern changes but the band's hash, as before.
float wNoise(vec2 q){ vec2 i=floor(q),f=fract(q); f=f*f*(3.-2.*f); float n=i.x+57.*i.y; return mix(mix(wHash(n),wHash(n+1.),f.x),mix(wHash(n+57.),wHash(n+58.),f.x),f.y); }
float wShare(float x,float w,float cell,vec2 p){ return wSmooth((x*(1.+w)-(.6*clamp((wNoise(p*1.1+vec2(3.7,1.3))-.15)/.7,0.,1.)+.4*wHash(cell)))/w); }
#endif
`;
