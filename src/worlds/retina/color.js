// Retina's colour stage. c is the film's own coverage, untouched: what's worked out here is only what colour each pixel of it wears.
//
//   the fringe   a couple of pixels along every edge: dark on the edge's black side, light on its white side, from how far the nearest edge is. The edge's distance is worked out the way
//                lineCells in src/gl/chunks/world.js finds it, from each family's own phase, so it's exact through duty and threshold and costs no second look at the picture.
//                Lines too fine for it get none (a fifth of a band at most), and the soft path (dots, quasicrystals) has no such edges and gets none.
//                The pair swaps behind a front from the middle out, on a chord change.
//   the inks     two zones fixed on the screen: a disc round the middle and everything else. Black prints in the zone's deep ink and white in its pale one. They come and go band by band,
//                with a front running across each band (the change of world's way, copied here under its own names), so a pixel is a whole ink or exactly the black and white, never a tint.
//                Going, the bands go in order from the middle with a little of each band's own hash, and none at the rim, so the last of the colour leaves the farthest corner exactly on the hit.
//
// uW[4]   x the inks arriving 0..1 (from the rim in), y leaving 0..1 (from the middle out), z the disc's radius
// uW[5-8] the middle's deep and pale inks, the outside's deep and pale
// uW[9]   x how much of the fringe, y which pair, z how far out the swap's front has got
// uW[10-13] the two fringe pairs, dark then light
export const COLOR = `
float rAcross=.5,rSoft=.02,rCell=0.,rWide=1e9;
// The nearest edge, in pixels, and which band this pixel is in and how far across it. As lineCells finds an edge (naming it here is what gives this program gTh).
// inkBand's XOR, as states: each family is +1 past tri-d>t, -1 past tri-d<-t, and 0 between, where the threshold has filled it (black when th>=0, white below). With none at 0 the
// product of the rest is the XOR. So a family's edge is only an edge where the colour across it differs: elsewhere the others have put one colour both sides, and there's nothing to fringe.
bool rWhite(int zeros,float prod,bool pos){ return pos?zeros==0&&prod>0.:zeros>0||prod>0.; }
float rEdge(int k0,int k1){
  float th=gTh[k0/FAM],best=1e9,prod=1.; bool got=false,pos=th>=0.; int zeros=0;
  rAcross=.5; rSoft=.02; rCell=0.; rWide=1e9;
  for(int k=k0;k<k1;k++){
    if(!gOn[k]) continue;
    float d=gDu[k],v=tri(gPh[k])-d,t=abs(th)*(1.-smoothstep(.85,1.,abs(d)));
    if(abs(v)>t) prod*=sign(v); else zeros++;
  }
  bool here=rWhite(zeros,prod,pos);
  for(int k=k0;k<k1;k++){
    if(!gOn[k]||abs(gDu[k])>=1.) continue;
    float x=gPh[k],d=gDu[k],v=tri(x)-d,t=abs(th)*(1.-smoothstep(.85,1.,abs(d))),g=max(gGn[k],1e-6),sv=v<0.?-1.:1.;
    if(!got){ bool w=pos?v>t:v>-t; rAcross=fract(w?x:x+.5); rSoft=clamp(1.5*g,.004,.25); rCell=w?floor(x):floor(x+.5)+.5; got=true; }
    // Its nearest edge, and this family's state across it. A zone thinner than a pixel is crossed in one go.
    bool past=abs(v)>t,thin=t/(2.*g)<1.;
    float sHere=past?sv:0.,sThere=thin?-sv:(past?0.:sv);
    int z=zeros-(sHere==0.?1:0)+(sThere==0.?1:0);
    float p=sHere==0.?prod:prod*sHere; if(sThere!=0.) p*=sThere;
    if(rWhite(z,p,pos)==here) continue;
    float e=abs(abs(v)-t)/(4.*g),narrow=min(1.-d-t,1.+d-t)*.5/g;      // the narrower band either side: whether there's room for a fringe at all
    if(e<best){ best=e; rWide=narrow; }
  }
  return best;
}
float rHash(float n){ n=fract(n*.1031); n*=n+33.33; n*=n+n; return fract(n); }
vec3 worldColor(int k0,int k1,float c){
  vec2 res=uF[8].xy,p=(gl_FragCoord.xy-.5*res)/res.y*2.;
  float r=length(p),far=clamp(r/length(vec2(res.x/res.y,1.)),0.,1.),e=rEdge(k0,k1),g=pow(c,.4545);
  bool soft=gRnd[k0/FAM]>0.||gSum[k0/FAM]>0.;
  vec4 D=uW[4],Fr=uW[9];
  vec3 col=film(c);
  if(Fr.x>0.&&!soft){
    float w=Fr.x*min(max(1.5,2.2*res.y/1080.),.2*rWide),f=w>.6?1.-smoothstep(w-.5,w+.5,e):0.;
    if(f>0.){
      bool sw=(r<Fr.z)!=(Fr.y>.5);
      vec3 dk=sw?uW[12].rgb:uW[10].rgb,lt=sw?uW[13].rgb:uW[11].rgb;
      col=mix(mix(uF[1].rgb,dk,f),mix(uF[2].rgb,lt,f),g);
    }
  }
  if(D.x>0.){
    // Each pixel's own moment: by how far out it is, a little of its band's hash, and how far across its band, so each band changes from one edge to the other.
    // The hash and the band count for nothing at the far end, so the last of the colour goes from the farthest corner exactly as it ends, on the hit.
#ifdef FLIGHT
    float h=0.,ac=.5,as=0.;      // a flight's two patterns are inked alike, by where a pixel is: by their bands they'd disagree, and the flight's own front would show it
#else
    float h=rHash(rCell),ac=rAcross,as=rSoft;
#endif
    float tIn=(1.-far)*(.75+.25*mix(h,1.,1.-far))+.25*far*ac,tOut=far*(.75+.25*mix(h,1.,far))+.25*(1.-far)*ac;
    // About a pixel of softness, from how fast each part moves across the screen: across a band it jumps, which is no reason to smear it
    float fw=.6*fwidth(far),aIn=max(fw+.1*far*as,1e-4),aOut=max(fw+.1*(1.-far)*as,1e-4);
    float inked=(1.-smoothstep(D.x*1.02-aIn,D.x*1.02+aIn,tIn))*smoothstep(D.y-aOut,D.y+aOut,tOut);
    if(inked>0.){
      float z=smoothstep(D.z-1./res.y,D.z+1./res.y,r);
      vec3 ink=mix(mix(uW[5].rgb,uW[7].rgb,z),mix(uW[6].rgb,uW[8].rgb,z),g);
      col=mix(col,ink,inked);
    }
  }
  return col;
}
`;
