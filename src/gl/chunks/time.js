// Time and illusion, in the shader. Only in programs built with TIME (src/gl/renderer.js), and those are only built when a frame first asks for one, so nothing else pays. All the motion is worked out in
// src/score/time-sheet.js and src/score/moves/time.js, and it's all a pure function of the score and t: there's no history buffer anywhere.
//
// A slit-scan with no frames kept: a frame is a pure function of t, so "the picture a moment ago" is only some numbers. The table holds how the camera and each family's phase differ at 64 moments, from what they are
// now. Each pixel picks its own moment and reads the table, so it's looking at the sheet as it was then, or as it's going to be. The lines stay exact: it all goes in before the gradient.
//   uT[0]  x: the map (0 off, 1 sweep, 2 target, 3 wave, 4 interlace), y: how many bands it's cut into (0 none), z: the wave's phase, w: unused
//   uT[1]  x, y: its centre; z, w: its direction
//   uT[2]  x: its reach, in picture units; y: the wave's frequency
//   uT[3]  x: Ghost: how far what's inside the figure has slid, in cycles; y: how many capsules; z, w: unused
//   uT[4]  how much of that slide each family takes
//   uT[5]  x: Fringe: cycles of phase at height 1; y: how many bumps; z: the figure's turn; w: its size
//   uT[6]  how much of that each family takes
//   uT[7]  x: Fence: slits a picture unit; y: how far it's slid, in slits; z: how many frames are interlaced; w: unused. uT[8] is its direction, and a lens: x, y: direction
//   T_B..  the table: two vec4 for each moment. (ln zoom, turn, x, y) and the four families' phases. All relative to now, so a moment at no delay is exactly nothing.
//   T_C..  capsules (ax, ay, bx, by), then their radii, four to a vec4.  T_G..  bumps (x, y, rx, ry) and (height, 0, 0, 0)
export const T_N = 64, T_B = 10, T_C = T_B + 2 * T_N, CAPS = 16, T_R = T_C + CAPS, T_G = T_R + 4, BUMPS = 24, T_ALL = T_G + 2 * BUMPS;

export default `#ifdef TIME
uniform vec4 uT[${T_ALL}];
vec4 gTimePh=vec4(0.);
float gGhost=0.,gFringe=0.;
float tSmin(float a,float b,float k){ float h=max(k-abs(a-b),0.)/k; return min(a,b)-h*h*k*.25; }
// A figure as a shape: capsules, run together. It says nothing about how it looks: the pattern does that.
float figSD(vec2 p){
  int n=int(uT[3].y); float d=1e3;
  for(int i=0;i<n;i++){ vec4 s=uT[${T_C}+i]; vec2 pa=p-s.xy,ba=s.zw-s.xy; float h=clamp(dot(pa,ba)/max(dot(ba,ba),1e-6),0.,1.); d=tSmin(d,length(pa-ba*h)-uT[${T_R}+i/4][i%4],.05); }
  return d;
}
// A figure as a height: soft bumps. Only a moire ever shows it.
float figH(vec2 p){
  float h=0.; int n=int(uT[5].y); vec2 q=rot(-uT[5].z)*p/uT[5].w;
  for(int i=0;i<n;i++){ vec4 g=uT[${T_G}+2*i]; vec2 d=(q-g.xy)/g.zw; float e=dot(d,d); if(e<16.) h+=uT[${T_G}+2*i+1].x*exp(-e); }
  return h;
}
vec2 timeWarp(vec2 p0,vec2 p){
  if(uT[3].x!=0.) gGhost=uT[3].x*aaOf(-figSD(p));
  if(uT[5].x!=0.) gFringe=uT[5].x*figH(p);
  vec4 a=uT[0];
  if(a.x<.5) return p;
  vec4 m=uT[1]; vec2 d=p0-m.xy; float e;
  if(a.x<1.5) e=.5+.5*dot(d,m.zw)/uT[2].x;
  else if(a.x<2.5) e=length(d)/uT[2].x;
  else if(a.x<3.5) e=.5+.5*sin(dot(d,m.zw)*uT[2].y-a.z);
  else { float n=uT[7].z,j=floor(dot(d,uT[8].xy)*uT[7].x*n); e=(mod(j,n)+.5)/n; float jj=j; if(dFdx(jj)!=0.||dFdy(jj)!=0.) gBreak=true; }
  if(a.y>0.){ float q=floor(e*a.y); if(dFdx(q)!=0.||dFdy(q)!=0.) gBreak=true; e=(q+.5)/a.y; }       // one pixel across a cut isn't a real gradient
  e=clamp(e,0.,1.)*${(T_N - 1).toFixed(1)};
  int k=int(min(e,${(T_N - 2).toFixed(1)})); float f=e-float(k);
  vec4 c=mix(uT[${T_B}+2*k],uT[${T_B}+2*k+2],f);
  gTimePh=mix(uT[${T_B}+2*k+1],uT[${T_B}+2*k+3],f);
  return rot(c.y)*p*exp(c.x)+c.zw;
}
float timeSmooth(int K,int i){ return (K==0?gTimePh[i]:0.)+gFringe*uT[6][i]; }
float timeSlide(int i){ return gGhost*uT[4][i]; }
// The fence: slits, moving over a picture that doesn't. Negative: no fence.
float timeFence(vec2 p0){
  vec4 z=uT[7]; if(z.x<=0.) return -1.;
  float x=dot(p0-uT[1].xy,uT[8].xy)*z.x-z.y,g=max(fwidth(x),1e-4),h=1./z.z;
  return band(x+.5-.5*h,h,g);
}
float fenced(float c,float tf,vec2 p0){ return c*tf; }
#else
#endif
`;
