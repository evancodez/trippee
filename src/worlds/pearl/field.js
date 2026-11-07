// Pearl's shaders. A line is the least of it: what you see is a film of varying thickness, and the pattern only says how thick. All colour comes from one number, o, in nanometres, looked up in a table of real interference.
// Numbers a pattern can set (patterns.js): field.a which field, field.b a count, field.ph how much of its shape shows, field.scale the field's own slow time, field._1 how the contacts melt together, field._2 a size, field.k0 lines per unit of the field.
// uW numbers, slot A at 4 and slot B at 34 (each slot's are the pattern's own film, mixed by a bend's local time):
//   +0  x thickness, y wedge (nm per picture unit, along down), z how much a line's own phase moves it, w how much the two families' difference does
//   +1  x how much the second family alone moves it: a family that's closed has no lines at all, so it's a whole other pattern that exists only in colour. y what crossing a line adds. z terraces: a cell's own thickness. w ribs: fine silk in colour only
//   +2  x ribs per unit, y the pool (a big slow unevenness), z how far out of focus this pattern lets itself go, w echoes
//   +3  x a cell's share from the field, y barbs in the field's own angle, z,w unused
// The song's, one lot for both, at 24 to 31:
//   24  focus x,y, the focus band's normal x,y
//   25  x sharp half-width, y blur per unit of distance, z blur all over, w stereo: nm per unit sideways
//   26  x,y which way's down, z the pool's time, w the ribs' shimmer
//   27  x,y where the voice is, z its rings' strength, w cells of its table per picture unit
//   28  x thickness on top of the pattern's, from the song, y Newton's bump in a change, z bloom, w breath of light
//   29  x,y how far a sheen's wash has got, in table terms: front, width; z,w which way it runs
//   30  x echo's step in cycles, y how each fades, z how much softer, w unused
//   31  x how far out of focus a change's front goes, in picture units, y the strong beats' rings in nm, z,w unused
//   40..43  the pearls: x, y, radius, strength
export const FIELD = `
vec4 wPole(int b,int i){ return i==0?uG[b+I_mBlobA]:i==1?uG[b+I_mBlobB]:i==2?uG[b+I_mBlobC]:i==3?uG[b+I_p1]:uG[b+I_p2]; }
// Newton's rings. The gap between a lens and a flat grows as the square of the distance from where they touch, so each contact's rings crowd going out. It lets go a little far out, or the corners would be hairlines.
float wGap(int b,vec2 X,float be){
  float sum=0.;
  for(int i=0;i<5;i++){
    vec4 P=wPole(b,i); float r=abs(P.z);
    if(r<1e-4) continue;
    vec2 d=X-P.xy; float u=dot(d,d)/(r*r);
    sum+=exp(-be*u/(1.+.09*u));
  }
  return sum>0.?-log(sum)/be:0.;
}
// Watered silk: a grain that wanders, with eyes in it. It's a height, and the fringes of a moire follow its contours.
float wGrain(vec2 X,float A,float t){
  return X.y+A*(.62*sin(.83*X.x+.61*X.y+t)+.38*sin(1.9*X.x-1.27*X.y-1.31*t+1.7)+.2*sin(3.3*X.x+1.9*X.y+.73*t+.6));
}
#ifdef WORLD_FULL
float wHash(vec2 p){ p=fract(p*vec2(.1031,.1030)); p+=dot(p,p.yx+33.33); return fract((p.x+p.y)*p.x); }
// Soap bubbles: each a dome of film lying on the watered grain. Its rings bunch at the rim as a dome's height does, and a bubble's film is thin at the top and thick at the bottom. The later ones lie over the earlier.
float wBubbles(int b,vec2 X,float n,float A,float t){
  float S=wGrain(X,A,t);
  for(int i=0;i<5;i++){
    vec4 P=wPole(b,i); float r=abs(P.z);
    if(r<1e-4) continue;
    vec2 d=X-P.xy; float u=dot(d,d)/(r*r);
    if(u>=1.) continue;
    float e=1.-u,m=smoothstep(0.,.14,e);
    S=mix(S,n*(1.-sqrt(e))+1.3*d.y/r+float(i)*1.7+P.w,m);
  }
  return S;
}
// Fish scales, seigaiha: rows of circles each lying over the one above. A pixel belongs to the lowest that covers it, and the rings run out from that one's middle.
float wScales(int b,vec2 X,float lat,out float cell,out float ang){
  vec2 g=X/lat; float jy=ceil((g.y-1.)*2.),rho=1.;
  vec2 d=vec2(0.,1.); cell=0.;
  for(int n=0;n<3;n++){
    float j=jy+float(n),cy=j*.5,o=mod(j,2.),cx=2.*floor((g.x-o)*.5+.5)+o;
    d=g-vec2(cx,cy); float q=dot(d,d);
    if(q<1.){ rho=sqrt(q); cell=wHash(vec2(cx,j)+7.); break; }
  }
  ang=atan(d.x,d.y);
  return rho;
}
// Sunlight through water: three stirred waves, and the net is where they cancel. Its cells are the rings, closing on the middle of each mesh.
float wCaustic(vec2 X,float t){
  vec2 q=X*1.45;
  float v=sin(q.x+1.3*sin(q.y*.8+t))+sin(q.y*1.1+1.4*sin(q.x*.7-t*.8))+sin((q.x+q.y)*.7+1.2*sin((q.x-q.y)*.6+t*.6));
  return abs(v);
}
// Dew: drops lying on the lines, each a lens that turns what's under it over. Nothing's cut, so there's no outline: the lines crowd round each rim, as they do under a real drop.
vec2 wDew(vec2 X,float lat,float m,float rr){
  vec2 base=floor(X/lat-.5);
  for(int i=0;i<4;i++){
    vec2 id=base+vec2(float(i&1),float(i>>1)),h=vec2(wHash(id),wHash(id+3.1)),c=(id+.5+.34*(h-.5))*lat,d=X-c; float r=lat*rr*(.62+.38*h.x),u=dot(d,d)/(r*r);
    if(u<1.){ float e=1.-u; X=c+d*(1.-m*e*e*(3.-2.*e)); break; }
  }
  return X;
}
// Waves from a few points, added. Where they agree and where they cancel lies along hyperbolas, and that's a chorus drawn in space.
float wWaves(int b,vec2 X,float n,float t){
  float v=0.;
  for(int i=0;i<5;i++){ vec4 P=wPole(b,i); if(P.z==0.) continue; v+=P.z*sin(TAU*n*length(X-P.xy)-t+P.w); }
  return v;
}
// A jellyfish, or a veil-tailed goldfish: a motif's outline as radius by direction, so every echo out from it is it again. Slow lobes for what trails.
float wVeil(int b,vec2 X,float tail,float t){
  float sum=0.;
  for(int i=0;i<5;i++){
    vec4 P=wPole(b,i); float r=abs(P.z);
    if(r<1e-4) continue;
    vec2 d=rot(P.w)*(X-P.xy)/r; float ph=atan(d.y,d.x);
    float R=1.+.42*smoothstep(.2,-.9,d.y/(length(d)+1e-3))*(1.+tail*sin(7.*ph+t+float(i)*1.9));
    sum+=exp(-1.4*log(length(d)/R+.14));
  }
  return -log(max(sum,1e-5))/1.4;
}
// Agate, or abalone inlay: uneven cells, and bands going in parallel to each cell's sides. The distance to the nearest wall is F2-F1, and it's continuous, so nothing's cut.
float wCells(vec2 X,float lat,out float cell){
  vec2 g=X/lat,id=floor(g); float a=9.,c=9.; cell=0.;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
    vec2 q=id+vec2(float(i),float(j)),h=vec2(wHash(q+11.),wHash(q+29.)),d=g-q-.5-.8*(h-.5); float r=dot(d,d);
    if(r<a){ c=a; a=r; cell=h.x; } else if(r<c) c=r;
  }
  return sqrt(c)-sqrt(a);
}
// A strand of pearls: beads along slow curves, each with its dome of rings, on the grain.
float wStrand(int b,vec2 X,float lat,float n,float A,float t,out float cell){
  float S=wGrain(X,A,t); cell=.5;
  float row=floor(X.y/(lat*1.9)+.5);
  for(int j=-1;j<=1;j++){
    float R=row+float(j),cy=R*lat*1.9,sway=.34*lat*1.9*sin(X.x*.9+R*2.1+.3*t);
    float ix=floor(X.x/lat+.5);
    for(int i=-1;i<=1;i++){
      float kx=ix+float(i),h=wHash(vec2(kx,R)+5.),cx=kx*lat,r=lat*(.42+.12*h),yy=cy+.34*lat*1.9*sin(cx*.9+R*2.1+.3*t);
      vec2 d=X-vec2(cx,yy); float u=dot(d,d)/(r*r);
      if(u<1.){ float e=1.-u,m=smoothstep(0.,.2,e); S=mix(S,n*(1.-sqrt(e))+.7*d.y/r+h*2.,m); cell=h; }
    }
  }
  return S;
}
#endif
float wCellF[2]=float[2](0.,0.),wAngF[2]=float[2](0.,0.);
float worldField(int b,vec2 X,vec4 f){
  vec4 f2=uG[b+I_field2],st=uG[b+I_star2];
  float lines=dot(uG[b].xy,X*uG[b+I_tune].x)/st.w,kind=f.y,A=f.w,t=f2.y;       // the stripes under the field, which it takes away. See patterns.js
  if(kind<.5) return wGap(b,X,f2.z)-lines;
  if(kind<1.5) return wGrain(X,A,t)-lines;
#ifdef WORLD_FULL
  if(kind<2.5) return wBubbles(b,X,f.z,A,t)-lines;
  if(kind<3.5){ float c,an,lat=max(f2.w,.05),rho=wScales(b,X,lat,c,an); int s=b==0?0:1; wCellF[s]=c; wAngF[s]=an; return rho-lines; }
  if(kind<4.5) return wCaustic(X,t)-lines;
  if(kind<5.5) return dot(vec2(.28,.96),wDew(X,max(f2.w,.05),A,f.z))-lines;
  if(kind<6.5) return wWaves(b,X,f.z,t)-lines;
  if(kind<7.5) return wVeil(b,X,f.z,t)-lines;
  if(kind<8.5){ float c,rho=wCells(X,max(f2.w,.05),c); wCellF[b==0?0:1]=c; return rho-lines; }
  if(kind<9.5){ float c,v=wStrand(b,X,max(f2.w,.05),f.z,A,t,c); wCellF[b==0?0:1]=c; return v-lines; }
#endif
  return -lines;
}
`;

// How far a change has got here, on the pixel's own time. Colour and focus both go by it.
export const DEFS = `float wT=0.;
float wBlurNow=0.,wOrbO=0.,wOrbSharp=0.;
`;
export const WT = `float worldT(vec2 p0,float T){ wT=T; return T; }
`;

// The pearls: lenses floating in front of everything, the voice and its echoes. Each holds a sharp, enlarged piece of whatever's behind it, however melted that is, and its own film has rings bunching at the rim. Nothing's cut: at the rim a pearl does nothing at all.
export const WARP = `vec2 worldWarp(vec2 p0,vec2 p){
  for(int i=0;i<4;i++){
    vec4 o=uW[40+i];
    if(o.w<=.001) continue;
    vec2 d=p0-o.xy; float u=dot(d,d)/(o.z*o.z);
    if(u>=1.) continue;
    float e=1.-u,s=o.w*WGEO,g=e*e*(3.-2.*e);
    p-=d*s*.62*g;
    wOrbO+=s*(420.*(1.-sqrt(e))*smoothstep(0.,.1,e)+150.*d.y/o.z-200.*smoothstep(.0,.3,e));
    wOrbSharp=max(wOrbSharp,s*smoothstep(0.,.16,e));
  }
  return p;
}
`;

// Depth of field, for nothing: a band's filter is an exact box, so widening it blurs exactly, and past a cycle it's the true average. Hard in focus, melted out of it.
// In a change, what's changing is what's out of focus: the front is a band of gauze crossing the frame, so nothing's ever seen half way.
export const PREINK = `vec2 wP0(){ return (gl_FragCoord.xy-.5*uF[8].xy)/uF[8].y*2.; }
float wFocusOf(float lets){
  vec4 F=uW[24],G=uW[25]; vec2 p0=wP0();
  float d=max(abs(dot(p0-F.xy,F.zw))-G.x,0.),front=wT*(1.-wT)*4.;
  return (G.y*d*d/(1.+.6*d)+G.z*smoothstep(0.,.25,d))*lets*(1.-wOrbSharp)+uW[31].x*front*front;
}
void worldPreInk(int K){
  if(uW[0].x>.5){ wBlurNow=0.; return; }
#ifdef FLIGHT
  float lets=uW[(K==1?34:4)+2].z; int e=(K+1)*FAM;
#else
  float lets=mix(uW[6].z,uW[36].z,wT); int e=uF[0].y>.5?2*FAM:FAM;
#endif
  float bl=wFocusOf(lets)*WGEO,px=1.+bl*uF[8].y*.5;
  if(K<2) wBlurNow=bl;
  if(px<=1.001) return;
  for(int i=K*FAM;i<e;i++) if(gOn[i]){ gGn[i]*=px; gGr[i]*=px; }
}
`;

// What a family does that has no line: it's all in colour. Nothing to add to the phase yet.
export const COLOR = `const float wRows=5.;
// Filtered in the table itself: a fetch costs about a millisecond a frame at this size, and this used to take two for every look.
vec3 wLut(float o,int side){ return texture(uWT,vec2((clamp(o/16.,0.,254.99)+.5)/256.,(float(side)+.5)/wRows)).rgb; }
// One side of the film, in the sheens' two rows: a new sheen washes over the frame, so a pixel's in the one or the other, and only on the wash does it take both.
vec3 wSheen(float o,int side,float s){ if(s<=0.) return wLut(o,side); if(s>=1.) return wLut(o,side+2); return mix(wLut(o,side),wLut(o,side+2),s); }
// The same lines a moment ago, softer each time: the reverb, drawn. Each tap is a whole other pass of the filter.
float wTap(int k0,int k1,float th,int kk,float dp,float px){
  float x=gPh[kk]; gPh[kk]=x-dp;
  for(int k=k0;k<k1;k++) gGn[k]*=px;
  float v=inkBand(k0,k1,th);
  for(int k=k0;k<k1;k++) gGn[k]/=px;
  gPh[kk]=x;
  return v;
}
vec3 worldColor(int k0,int k1,float c){
  vec2 p0=wP0(); vec4 a,b,d,e; float cellF,angF;
  if(k1-k0<=FAM){ int n=k0==0?4:34; a=uW[n]; b=uW[n+1]; d=uW[n+2]; e=uW[n+3]; int s=k0==0?0:1; cellF=wCellF[s]; angF=wAngF[s]; }
  else { a=mix(uW[4],uW[34],wT); b=mix(uW[5],uW[35],wT); d=mix(uW[6],uW[36],wT); e=mix(uW[7],uW[37],wT); cellF=mix(wCellF[0],wCellF[1],wT); angF=mix(wAngF[0],wAngF[1],wT); }
  // Which family carries the lines: the first with any, in whichever slot's showing. In a bend a family with no partner is closing in A and opening in B, both at once, and each slot's own counts for its own share, so nothing steps where one of them ends.
  bool two=k1-k0>FAM;
  int k=k0; if(!gOn[k]&&two) k=k0+FAM;
  int k2=k+1; if(!gOn[k2]&&two) k2=k0+FAM+1;
  float x0=gPh[k],x1=gOn[k2]?gPh[k2]:0.,r0=tri(x0);
  if(two&&gOn[k0]&&gOn[k0+FAM]) r0=mix(tri(gPh[k0]),tri(gPh[k0+FAM]),wT);
  vec4 G=uW[26],V=uW[28];
  float o=a.x+V.x+a.y*dot(p0,G.xy)+uW[25].w*p0.x+a.z*r0;
  if(a.w!=0.) o+=a.w*tri(x0-x1);
  // The second family alone: a family that's closed has no lines at all, so this is a whole other pattern, in colour only.
  if(two){ float xa=gOn[k0+1]?gPh[k0+1]:0.,xb=gOn[k0+FAM+1]?gPh[k0+FAM+1]:xa; o+=mix((uW[5].x+uW[44].x)*tri(xa),(uW[35].x+uW[45].x)*tri(xb),wT); }
  else { float gh=b.x+uW[k0==0?44:45].x; if(gh!=0.) o+=gh*tri(x1); }
  // A big slow unevenness in the film that has nothing to do with the lines. It's what travels.
  float mel=min(wBlurNow*4.,1.);
  if(d.y!=0.){ float pt=G.z; vec2 q=p0*.85; o+=d.y*(1.+1.5*mel)*(sin(q.x*1.1+1.5*sin(q.y*.9+pt)+pt*.7)+.7*sin(q.y*1.7-1.2*sin(q.x*1.3-pt*.8)-pt*.6)); }
  // Terraces: the whole of a cell a thickness of its own. Mother of pearl.
  if(b.z!=0.){ float lt=two&&wT>.5?1.:0.,ca=floor(x0+.5)-lt*uW[46].x,cb=gOn[k2]?floor(x1+.5)-lt*uW[46].y:0.; o+=b.z*(fract(sin(ca*12.9898+cb*78.233)*43758.5453)-.5); }
  if(e.x!=0.) o+=e.x*(cellF-.5);
  if(e.y!=0.) o+=(1.-min(wBlurNow*8.,1.))*70.*sin(angF*e.y);
  // Silk's ribs, in colour only, and only where it's in focus: out of focus they average away, as they would.
  if(b.w!=0.){ float fine=exp(-wBlurNow*22.); if(fine>.02) o+=b.w*fine*sin(TAU*(dot(p0,vec2(.09,.995))*d.x)+G.w); }
  // The voice: what's been sung, going out from where it's sung now. Each ring is a moment of the song, and nothing's moved but the colour.
  vec4 vo=uW[27]; float light=0.;
  if(vo.z!=0.){ vec4 h=texture(uWT,vec2((min(length(p0-vo.xy)*vo.w,254.)+.5)/256.,4.5/wRows)); o+=vo.z*h.r+uW[31].y*h.b; light=h.g; }
  o+=wOrbO;
  // A change: Newton's rings run with the front.
  float fr=wT*(1.-wT)*4.; if(fr>0.) o+=V.y*fr*fr;
  // The reverb: each edge leaves softer copies of itself behind, and they only move the film. So every line has a train of colour after it.
#ifdef WORLD_CELLS
  float th=gTh[k0/FAM],px=1.+wBlurNow*uF[8].y*.5;
  if(d.w!=0.&&uW[0].x<.5&&gRnd[k0/FAM]==0.&&gSum[k0/FAM]==0.){
    vec4 E=uW[30]; float w=1.,sum=0.,soft=E.z*uF[8].y;
    int kk=abs(gDu[k])<1.?k:k2;
    for(int i=1;i<=2;i++){ w*=E.y; sum+=w*(wTap(k0,k1,th,kk,E.x*float(i),1.+soft*float(i)/px*.5)-.5); }
    o+=d.w*sum;
  }
#endif
  // A sheen's wash.
  vec4 W=uW[29]; float s=W.y>0.?clamp((W.x-dot(p0,W.zw))/W.y,0.,1.):W.x;
  s=s*s*(3.-2.*s);
  c=c+mel*.16*(1.-c);
  vec3 A=c>0.?wSheen(o,0,s):vec3(0.),B=c<1.?wSheen(o+b.y,1,s)*(1.-uW[31].z*(1.-mel)):vec3(0.),col=mix(B,A,c);      // the dark side deeper (uW[31].z), but not where it's melted, which stays soft
  // Bloom: a soft copy of the bright side, as light. It needs no second picture, since the filter's exact however wide. By screen, so a pastel stays a pastel and doesn't go out to white.
#ifdef WORLD_CELLS
  if(V.z!=0.&&uW[0].x<.5&&gRnd[k0/FAM]==0.&&gSum[k0/FAM]==0.){ float g=wTap(k0,k1,th,k,0.,1.+.09*uF[8].y/px); col=1.-(1.-col)*(1.-V.z*g*g*(c>0.?A:B)); }
#endif
  col=1.-(1.-col)*(1.-V.w-light-.16*min(wBlurNow*2.2,.3));
  return gamma(col);
}
`;
