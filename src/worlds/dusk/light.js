// Dusk's colour: a low sun, film stock, and time since an edge passed. docs/MODES.md, section 3.
// c stays exact for everything that reads the picture. What's shown is worked out beside it: each family's phase gives one crisp edge a cycle and a long exact tail behind it, and that's how much light this spot of film has had.
// That exposure goes through the evening's stock (eight colours in the block, four low in the frame and four high), so the same bands are honey at four o'clock and sodium and slate at night.
// The sun is in the stage too: it burns through whatever's in front of it, sets behind what the field says is solid, is doubled in the lake, and on each strong beat a ring of light goes out from it.
//
//   uW[4]      sun: x, y, radius, how much of it there is
//   uW[5]      tail length in cycles, halation, how deep the strip chart is, how far the frame's light is lifted
//   uW[6]      age, waterline (off the frame: no lake), how much lake, the ripple's time
//   uW[7]      two rings of light: radius, height, radius, height
//   uW[8]      the dusk line: how strong its leak. How the sun lies on water: x .. uW[8].y the sun's path. z tremolo depth, w ribs to a cycle
//   uW[9]      the song's heave, whether the sun's a disc here or only light, how wide its path, unused
//   uW[10..17] the stock
//   uW[18..25] the strip chart: the last few seconds of the song, a cycle's worth, newest first
//   uW[34]     how many windows are lit, the eclipse, where the moon is against the sun, how much light the stock takes
//   And uW[9].w: how many lamps are on. At night there are lights on the hills, along the lines, and they come on one at a time.
export const DEFS = `float wSky[2]=float[2](1.,1.);
float wAlong[2]=float[2](0.,0.);     // how far along its line this pixel is. A hill says, as each goes by at its own speed. Anything else goes by the sheet
bool wHasAlong[2]=bool[2](false,false);
`;

// The lake: below the waterline everything's the sheet above it, a little flattened, with ripples that come closer together going out.
export const WARP = `vec2 wLakeOf(vec2 q,float wl,float t){
  float u=wl-q.y;
  if(u<=0.) return q;
  float l=log(u+.05);
  return vec2(q.x+u*(.09*sin(7.*l+t)+.022*sin(17.*l-1.7*t+q.x*2.)),wl+u*(.84+.06*sin(11.*l-.8*t)));
}
vec2 worldWarp(vec2 p0,vec2 p){
  float r=uW[6].z*WGEO,wl=uW[6].y;
  if(r<=0.||p0.y>=wl) return p;
  return mix(p,p+wLakeOf(p0,wl,uW[6].w)-p0,r);
}
`;

export const COLOR = `float wTail(float y,float g,float L){
  float e=exp(-1./L),D=1.-e,m=L-e/D,a=y-.5*g,b=y+.5*g,fa=fract(a),fb=fract(b);
  return clamp(((floor(b)-floor(a))*m+(L*(exp(-fa/L)-exp(-fb/L))-(fb-fa)*e)/D)/g,0.,1.);
}
vec3 wBez(float t,vec3 a,vec3 b,vec3 c,vec3 d){ float s=1.-t; return s*s*(s*a+3.*t*b)+t*t*(3.*s*c+t*d); }
float wChart(float f){ float x=clamp(f,0.,.999)*31.; int i=int(x),j=i+1; return mix(uW[18+i/4][i%4],uW[18+j/4][j%4],x-float(i)); }
float wNoise(float x){ x=fract(x*.1031); x*=x+33.33; x*=x+x; return fract(x); }
vec3 worldColor(int k0,int k1,float c){
  vec2 q=(gl_FragCoord.xy-.5*uF[8].xy)/uF[8].y*2.;
  vec4 Tl=uW[5];
  float E=0.,f0=1.,g0=0.,y0=0.,y1=0.;
  int n=0;
  for(int k=k0;k<k1;k++){
    if(!gOn[k]) continue;
    float d=gDu[k],op=1.-smoothstep(.82,1.,abs(d));
    if(op<=0.) continue;
    n++;
    if(n>2) continue;
    // Each family's tail runs from the edge where its white band starts. Closing up, its tail shortens as its white does, so it thins out and doesn't fade.
    float y=gPh[k]-.25-.25*d,g=gGn[k],f=fract(y),v=wTail(y,g,max(Tl.x*op*op,.03));
    if(n==2) y1=y;
    if(n==1){
      f0=f; g0=g; y0=y;
      v*=1.+Tl.z*(wChart(f)-.5);                                // the strip chart: the song's last few seconds, riding the line
      if(uW[8].z>0.) v*=1.+uW[8].z*cos(6.2832*uW[8].w*f)*(1.-f);   // the tremolo's ribs, written in space and never flickered
    }
    v=min(v,1.)*op;
    E=E+v-2.*E*v;
  }
  // c has the last say on shape. Plain lines only a little: it's the second edge of a cycle. Three or more families, dots, or a flight, it's what's holding the picture together.
  int kk=k0/FAM;
  float K=n>2?.5:n==2?.14:.06;
  if(gRnd[kk]>0.||gSum[kk]>0.){ K=.72; E=mix(E,.5,.4); }
#ifdef FLIGHT
  K=mix(K,.66,smoothstep(0.,.12,uW[1].w)*smoothstep(1.,.88,uW[1].w));
#endif
  float X=pow(E,1.3*uW[34].w)*(1.-K)+K*clamp(c,0.,1.);
  // A lit window: every cell of two families is its own room, and they come on one at a time.
  if(uW[34].x>0.&&n==2){ float h=wNoise(floor(y0)*7.31+floor(y1)*13.17+3.); X=mix(X,.62+.38*X,smoothstep(h,h+.03,uW[34].x)); }
  X=X+(1.-X)*Tl.w;
  // The sun, seen where it is or in the lake.
  vec4 S=uW[4],Ag=uW[6];
  vec2 qs=wLakeOf(q,Ag.y,Ag.w);
  float under=Ag.z*smoothstep(0.,2./uF[8].y,Ag.y-q.y);
  if(under<.001) qs=q;
  vec2 ds=qs-S.xy;
  float dd=length(ds),R=max(S.z,.01),sky=mix(wSky[0],wSky[1],uF[0].y>.5?uF[0].x:0.);
  float glow=S.w*(.3*exp(-dd*dd/(R*R*18.))+.34*exp(-dd/(R*3.)));
  float disc=S.w*sky*uW[9].y*smoothstep(R*1.02,R*.97,dd);
  // An eclipse: a moon goes over it, and the frame's light goes with it. Only a ring of the sun's left, and then the first of it again.
  float ec=uW[34].y;
  if(ec>0.){
    sky=mix(sky,1.,smoothstep(0.,.4,ec)); disc=S.w*sky*uW[9].y*smoothstep(R*1.02,R*.97,dd);
    float mo=length(ds-vec2(uW[34].z,0.)),gone=smoothstep(R*1.02,R*.98,mo);
    disc*=1.-gone;
    glow*=1.-.85*ec;
    X*=1.-.66*ec;
    X+=sky*ec*ec*(.8*exp(-(dd-R)*(dd-R)/(R*R*.03))+.34*exp(-max(dd-R,0.)/(R*.8)))*(1.-gone);
  }
  X+=(1.-X)*glow*(.3+.7*sky);
  X=mix(X,.8+.2*X,disc);
  // The strong beat: a ring of light goes out from the sun.
  vec4 Rg=uW[7];
  X+=(Rg.y*exp(-(dd-Rg.x)*(dd-Rg.x)/.09)+Rg.w*exp(-(dd-Rg.z)*(dd-Rg.z)/.09))*(.3+.7*X);
  // Under the sun, on water: its path.
  if(uW[8].y>0.&&q.y<S.y){ float w=uW[9].z*(.2+.75*(S.y-q.y)),pa=q.x-S.x; X+=uW[8].y*exp(-pa*pa/(w*w))*(.25+.75*X); }
  // The dusk line: where a change is passing there's a band of red light from the film's own edge.
  if(uW[8].x>0.&&uF[F_XF].x>.5){ float u=xfU(q); u=4.*u*(1.-u); X+=uW[8].x*u*u*(1.-X); }
  X=clamp(X,0.,1.);
  float hi=clamp(.5+.5*q.y,0.,1.);
  vec3 col=mix(wBez(X,uW[10].rgb,uW[11].rgb,uW[12].rgb,uW[13].rgb),wBez(X,uW[14].rgb,uW[15].rgb,uW[16].rgb,uW[17].rgb),hi);
  // Halation: light that went through the film and came back red, just ahead of a bright edge.
  col+=Tl.y*exp(-(1.-f0)/clamp(7.*g0,.03,.12))*(1.-X)*smoothstep(.2,.05,g0)*vec3(.42,.08,.04);
  // The lamps. Each has its place on its line, somewhere in the dark part of the hill, and comes on when the evening reaches it. Going by with what they're on, and as big as what they're on is near.
  if(uW[9].w>0.&&n>0){
    int kl=(uF[0].y>.5&&uF[0].x>.5)?1:0;
#ifdef FLIGHT
    kl=k0/FAM;
#endif
    float al=wHasAlong[kl]?wAlong[kl]:gX[kl].x,da=max(length(vec2(dFdx(al),dFdy(al))),1e-5),rw=floor(y0),per=.42;
    if(!wHasAlong[kl]) da=max(da,.5/uF[8].y);
    float a2=al/per+wNoise(rw*5.7+2.)*7.,cl=floor(a2),h1=wNoise(rw*17.3+cl*3.1),h2=wNoise(rw*9.1+cl*7.7);
    if(h1<uW[9].w&&g0<.02){
      float fp=.56+.34*h2,dx=(fract(a2)-.3-.4*h2)*per/da,dy=(f0-fp)/max(g0,1e-5),rr=clamp(.05*per/da,uF[8].y*.0035,uF[8].y*.014),dl=sqrt(dx*dx+dy*dy);
      float on=smoothstep(h1,h1+.015,uW[9].w);
      col+=on*(smoothstep(rr,rr*.72,dl)*vec3(1.,.74,.42)*.9+exp(-dl/(rr*2.4))*vec3(.5,.26,.1)*.5);
    }
  }
  // The water is a little darker and cooler than what it's showing.
  if(under>0.){ col*=mix(vec3(1.),vec3(.8,.74,.78),under); }
  // Eastmancolor fading: cyan and yellow go first, and magenta's what's left.
  col=mix(col,col*vec3(1.,.82,.9)+vec3(.05,.012,.04),Ag.x);
  // Grain, which also keeps a long slow gradient from banding. It stays where it is.
  float gr=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
  return col+(gr-.5)*.012;
}
`;
