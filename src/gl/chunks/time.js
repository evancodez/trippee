// Time and illusion, in the shader. Only in programs built with TIME (src/gl/renderer.js), and those are only built when a frame first asks for one, so nothing else pays. All the motion is worked out in
// src/score/time-sheet.js and src/score/moves/time.js, and it's all a pure function of the score and t: there's no history buffer anywhere.
//
// A slit-scan with no frames kept: a frame is a pure function of t, so "the picture a moment ago" is only some numbers. The table holds how the camera and each family's phase differ at 48 moments, from what they are
// now. Each pixel picks its own moment and reads the table, so it's looking at the sheet as it was then, or as it's going to be. The lines stay exact: it all goes in before the gradient.
//   uT[0]  x: the map (0 off, 1 sweep, 2 target, 3 wave, 4 spiral, 5 cells), y: how many bands it's cut into (0 none), z: the wave's phase, w: unused
//   uT[1]  x, y: its centre; z, w: its direction
//   uT[2]  x: its reach, in picture units; y: the wave's or the cells' frequency; z: the cells' turn
//   uT[3]  x: Ghost: how far what's inside the figure has slid, in cycles; y: how many capsules; z: how far the sheet inside it has turned; w: how far it's zoomed. uT[9] x, y: about where
//   uT[4]  how much of that slide each family takes
//   uT[5]  x: Fringe: cycles of phase at height 1; y: how many bumps; z: the figure's turn; w: its size
//   uT[6]  how much of that each family takes
//   uT[7]  Snakes: x: how much shade; y: how dark the dark tone is; z: how light the light tone is; w: 0 one way, 1 the other. uT[8] x, y: which family runs along, and which across
//   T_B..  the table: two vec4 for each moment. (ln zoom, turn, x, y) and the four families' phases. All relative to now, so a moment at no delay is exactly nothing.
//   T_C..  capsules (ax, ay, bx, by), then their radii, four to a vec4.  T_G..  bumps (x, y, rx, ry) and (height, 0, 0, 0)
export const T_N = 48, T_B = 10, T_C = T_B + 2 * T_N, CAPS = 36, T_R = T_C + CAPS, T_G = T_R + 9, BUMPS = 20, T_ALL = T_G + 2 * BUMPS;      // 191 vec4: WebGL2 promises 224

export default `#ifdef TIME
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
  if(uT[3].y>0.){
    float m=aaOf(-figSD(p));
    gGhost=uT[3].x*m;
    if(m>0.&&(uT[3].z!=0.||uT[3].w!=0.)){ vec2 q=uT[9].xy; p=q+rot(uT[3].z*m)*(p-q)*(1.+uT[3].w*m); if(m<1.) gBreak=true; }       // the one pixel across the edge isn't a real gradient, or it would draw an outline
  }
  if(uT[5].x!=0.) gFringe=uT[5].x*figH(p);
  vec4 a=uT[0];
  if(a.x<.5) return p;
  vec4 m=uT[1]; vec2 d=p0-m.xy; float e;
  if(a.x<1.5) e=.5+.5*dot(d,m.zw)/uT[2].x;
  else if(a.x<2.5) e=length(d)/uT[2].x;
  else if(a.x<3.5) e=.5+.5*sin(dot(d,m.zw)*uT[2].y-a.z);
  else if(a.x<4.5){ e=fract(atan(d.y,d.x)/TAU*m.w+m.z*log(length(d)+.001)-a.z); if(fwidth(e)>.5) gBreak=true; }      // a spiral of time, with a seam where the past meets the future
  else { vec2 q=floor(rot(uT[2].z)*d*uT[2].y); e=mod(q.x+q.y,2.); if(dFdx(e)!=0.||dFdy(e)!=0.) gBreak=true; }        // cells, two moments interleaved
  if(a.y>0.){ float q=floor(e*a.y); if(dFdx(q)!=0.||dFdy(q)!=0.) gBreak=true; e=(q+.5)/a.y; }       // one pixel across a cut isn't a real gradient
  e=clamp(e,0.,1.)*${(T_N - 1).toFixed(1)};
  int k=int(min(e,${(T_N - 2).toFixed(1)})); float f=e-float(k);
  vec4 c=mix(uT[${T_B}+2*k],uT[${T_B}+2*k+2],f);
  gTimePh=mix(uT[${T_B}+2*k+1],uT[${T_B}+2*k+3],f);
  return rot(c.y)*p*exp(c.x)+c.zw;
}
// Fraser and Wilcox, and Kitaoka's Rotating Snakes. Black, dark, white, light, over and over: the eye reads a drift from black to dark, and white to light, in a picture that isn't moving at all, most of all when it's just been nudged.
// Each half cycle of the family that runs along keeps its own colour for its first half and takes a tone for its second, and the next row the other way about. It's coverage: how much of the pixel a line much finer than a pixel would have covered.
#ifndef FLIGHT
float timeTone(float c){
  vec4 s=uT[7]; int ka=int(uT[8].x),kb=int(uT[8].y);
  float H=band(2.*gPh[ka]+.25,.5,2.*gGn[ka]),P=band(gPh[kb],.5,gGn[kb]);
  H=mix(H,1.-H,P); H=mix(H,1.-H,s.w);
  return c*(1.-s.x*(1.-s.z)*H)+(1.-c)*s.x*s.y*H;
}
#endif
float timeSmooth(int K,int i){ return (K==0?gTimePh[i]:0.)+gFringe*uT[6][i]; }
float timeSlide(int i){ return gGhost*uT[4][i]; }
#endif
`;
