// Flower Power's own shaders: the field its rings run on, what a family does inside a band, and the ink.
// All a pattern can be is numbers in these: field.a petals, field.b which motif each pole wears (four bits a pole), field.ph how much of its shape shows, field.scale how the petals wind, field._1 how flowers melt together, field._2 how fat a petal is, field.k0 lines per unit of log distance.
// blobs.beta tiles the sheet, blobs.t turns every other tile over, blobs.k says only every so many bands carry the second family, ribbon.a winds that family round the flowers, in beads to a flower.
export const FIELD = `
// A petal: round on top, with a cusp in each valley. soft rounds the cusp, which is what lets it go far from the flower, where cusps would only throw thorns at each other.
float wFlowerPetal(float x,float fat,float soft){ return pow((.5+.5*cos(x)+soft)/(1.+soft),.5*fat); }
vec4 wFlowerPole(int b,int i){ return i==0?uG[b+I_mBlobA]:i==1?uG[b+I_mBlobB]:i==2?uG[b+I_mBlobC]:i==3?uG[b+I_p1]:uG[b+I_p2]; }
#ifdef WORLD_FULL
// A motif is a shape anyone would know, as its radius in each direction v from its middle. Every ring is that shape again at another size, so a heart's echoes are all hearts. Exact unions of circles and straight sides, joined where they touch, so corners stay corners.
float wFlowerSpike(float a,float rho,float be){ float s=rho*sin(be); return s/(s*cos(a)+(1.-rho*cos(be))*sin(a)); }
float wFlowerMotif(int m,vec2 v,float th){
  vec2 w=vec2(abs(v.x),v.y);
  if(m==1){ if(w.y<-.125*w.x) return .834/dot(w,vec2(.759,-.651)); float B=dot(w,vec2(.52,.28)); return B+sqrt(max(B*B+.0356,0.)); }       // a heart: two lobes, and the straight sides that touch them, going down to a point
  if(m==2){ float be=PI/5.; return 1.15*wFlowerSpike(abs(mod(th-PI/2.+be,2.*be)-be),.5,be); }         // a star, five straight points
  if(m==3){ float ph=atan(w.y,w.x),up=1.95*pow(max(cos(ph-.72),0.),3.6),lo=1.28*pow(max(cos(ph+.86),0.),3.4),body=1./sqrt(60.*w.x*w.x+2.1*w.y*w.y); return max(max(up,lo),body); }      // a butterfly: two wings a side, and a body
  if(m==4){ float be=PI/12.,i=floor((th+be)/(2.*be)),tip=mod(i,2.)<.5?1.25:.98; return tip*wFlowerSpike(abs(mod(th+be,2.*be)-be),.66/tip,be); }       // a sun: a disc and straight rays, long and short
  if(m==5){ float R=(.8+.3*sqrt(abs(sin(4.*th))))/sqrt(w.x*w.x/1.9+w.y*w.y/.66); return w.y<0.?min(R,.42/-w.y):R; }        // a cloud: scallops over a flat bottom
  if(m==6){ float cap=1./sqrt(w.x*w.x/1.5+w.y*w.y/.95),stem=1./sqrt(w.x*w.x/.2+w.y*w.y/1.8); return w.y<0.?max(min(cap,.3/-w.y),stem):cap; }       // a mushroom: a dome, its underside, a stem
  if(m==7){ float y=abs(v.y); return (-1.006*y+sqrt(1.012*y*y+2.25))/.8; }      // an eye: two arcs meeting at the corners
  return 1.;
}
// Strokes, not an outline, so distance is what the rings go by: they run out from the lines of a peace sign, or a smile, and meet in the middle of whatever the lines have fenced off.
float wFlowerStroke(int m,vec2 d){
  vec2 w=vec2(abs(d.x),d.y); float rr=length(d),dr=abs(rr-1.);
  if(m==8){ if(rr>=1.) return dr; float t=dot(w,vec2(.7071,-.7071)); return min(dr,min(w.x,t>0.?abs(w.x*.7071+w.y*.7071):rr)); }      // a peace sign
  vec2 e=w-vec2(.36,.28); float eye=max(length(e*vec2(1.,.62))-.1,0.); vec2 s=d-vec2(0.,.12); float sr=length(s);       // a smile: two eyes and a mouth, inside a ring
  float mouth=s.y<-.2?abs(sr-.58):length(w-vec2(.55,-.05));
  return min(dr,min(eye,mouth));
}
#endif
// The flowers.
float wFlowerBlooms(int b,vec2 X,vec4 f,vec4 f2,float e){
  float a=f.w,n=f.y,kap=f2.y,be=f2.z,fat=f2.w,fade=uG[b+I_star2].y,sum=0.;
#ifdef WORLD_FULL
  int kinds=int(f.z);
#endif
  for(int i=0;i<5;i++){
    vec4 P=wFlowerPole(b,i);
    float r=abs(P.z);
    if(r<1e-4||P.z<0.) continue;
    vec2 d=X-P.xy;
    float q=dot(d,d),er=e*r,D=q+er*er;
    // Each flower gives birth a little out of step with the others (.16 of a unit of S is about .4 of a ring), or the whole frame's share of each ink goes up and down together at the rate of the rings, and that's a whole-frame flash in the chroma.
    float l=.5*log(D)-log(r)+.16*mod(float(i)*2.,5.);
    // The petals: none at the very centre, so it's a bold round cap, and letting go far out, so the echoes melt together.
    if(a!=0.){
      float qr=q/(r*r),u=q/D;
#ifdef WORLD_FULL
      int m=(kinds>>(4*i))&15;
      if(m>=8){ float dd=wFlowerStroke(m,rot(P.w)*d/r); l=mix(l,log(1.+dd/.35)-1.35,a); }
      else if(m>0){ float rho=sqrt(q)+1e-5; vec2 v=rot(P.w)*d/rho; float s=m==7?a*smoothstep(.5,1.4,rho/r):a*u*u/(1.+qr*fade); l-=log(1.+s*(wFlowerMotif(m,v,atan(v.y,v.x))-1.)); }
      else
#endif
      l-=log(1.+a*u*u/(1.+qr*fade)*wFlowerPetal(n*(atan(d.y,d.x)+P.w)+kap*.5*log(q+1e-5),fat,.006+.012*qr));
    }
    sum+=exp(-be*l);
  }
  float S=sum>0.?-log(sum)/be:0.;
  return S+f2.x*exp(S);                 // bands swell going out, but not without end: there are more of them far from a flower, and the gaps fill
}
// What most patterns never draw: only in the programs that draw it (W.fuller). With it in every program a Daisy paid up to 2.6 ms at 3024x1964 for code it never ran.
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
// Wallpaper: the sheet folded back and forth into tiles, mirrored at each wall, so nothing's ever cut. It's exactly the sheet out to half a tile from the middle: as the tiles get big their walls go off the frame, and one flower has the frame to itself.
vec2 wFlowerTile(vec2 X,float lat){ lat=max(lat,.08); return (.5-abs(fract(lat*X/2.+.25)*2.-1.))/lat; }
#endif
float worldField(int b,vec2 X,vec4 f){
  vec4 f2=uG[b+I_field2],sp=uG[b+I_spare];
  float lines=dot(uG[b].xy,X*uG[b+I_tune].x)/uG[b+I_star2].w;      // the stripes under the field, which it takes away. See patterns.js
#ifdef WORLD_FULL
  float lat=uG[b+I_mBlobs].y;
  if(lat>0.) X=wFlowerTile(X,lat);
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

// Inside a band. After each family's gradient, so whole cycles and half cycles added here draw no outline.
//   Every other tile turned over: half a cycle on the numbered family.
//   A second family only in every so many bands: it's closed in the others, so those bands are plain and these carry checks. It goes by the band's own number, so a band keeps its checks all the way out.
//   Beads: the second family wound round the flowers, whichever is nearest, by the angle of what they all add up to. Whole turns only, so there's no cut, and they go round each flower and meet in the saddles.
// All of it lets go as the geometry share does, as the rule for a change of world says.
export const PHASE = `void worldPhase(int K,int i,vec3 X){
#ifdef WORLD_FULL
  int b=K==1?SLOT:0,k=K*FAM+i;
  vec4 bl=uG[b+I_mBlobs];
  if(i==0&&bl.w!=0.&&bl.y>0.){ vec2 c=floor(max(bl.y,.08)*X.xy+.5); gPh[k]+=.5*bl.w*WGEO*mod(c.x+c.y,2.); }
  if(i==1&&gOn[k]){
    float m=uG[b+I_mRibbon].y;
    if(m!=0.){
      vec2 Z=vec2(0.); float be=uG[b+I_field2].z;
      for(int j=0;j<5;j++){ vec4 P=wFlowerPole(b,j); float r=abs(P.z); if(r<1e-4) continue; vec2 d=X.xy-P.xy; float q=dot(d,d)+1e-4,an=m*atan(d.y,d.x); Z+=pow(r*r/q,.5*be)*vec2(cos(an),sin(an)); }
      float x=atan(Z.y,Z.x)/TAU; vec2 g=vec2(dFdx(x),dFdy(x)); g-=round(g);
      float share=WGEO; gPh[k]=mix(gPh[k],x+uG[b+3*i].w,share); gGr[k]=mix(gGr[k],g,share); gGn[k]=max(length(gGr[k]),1e-5);
    }
  }
  if(i>=1&&bl.z>.5&&gOn[k]&&abs(gDu[k])<1.){
    int k0=K*FAM; float x=gPh[k0],s=tri(x)>gDu[k0]?floor(x):floor(x+.5);
    if(mod(s,bl.z)>=1.) gDu[k]=mix(gDu[k],-1.,WGEO);
  }
#endif
}
`;

// Most pixels are one ink: only an edge has both to fetch. A texture fetch for a colour nobody's using cost a whole millisecond at 3024x1964.
export const COLOR = `vec3 worldColor(int k0,int k1,float c){ ivec2 n=lineRows(k0,k1); if(c>=1.) return gamma(inkRow(n.x,0)); if(c<=0.) return gamma(inkRow(n.y,1)); return gamma(mix(inkRow(n.y,1),inkRow(n.x,0),c)); }
`;
