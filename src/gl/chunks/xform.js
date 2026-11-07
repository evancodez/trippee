// A transformation whose time is local to each pixel (Shock): T arrives as a front, rim first or centre first. gDT is T's gradient, which the lines
// that are travelling need: where their two phases differ, the front itself crowds them, and that crowding is the ring of refraction you see. See docs/NEXT.md 2.3.
//   uF[F_XF]  x: 1 in from the rim, 2 out from the centre; y: progress; z: the front's width, as a share of progress; w: its reach, in picture units
//   uF[F_XF2] x, y: the centre; z: the front's width at the centre (the iris's radius, in an iris); w: how far the front itself pushes the sheet aside
export default `vec2 gDT=vec2(0.);
float xfU(vec2 p0){ vec4 x=uF[F_XF]; float R=length(p0-uF[F_XF2].xy)/x.w;
#ifdef WORLD_FRONT
  if(x.x>2.5) R=.5+.5*dot(p0-uF[F_XF2].xy,vec2(cos(uW[3].w),sin(uW[3].w)))/x.w;      // mode 3: a straight front, travelling along uW[3].w
#endif
#ifdef TIME
  if(x.x>3.5){ vec2 d=p0-uF[F_XF2].xy; R=.5+.5*(dot(d,uT[8].zw)+uT[9].z*sin(dot(d,uT[8].wz*vec2(1.,-1.))*uT[9].w+uT[8].x))/x.w; }      // a straight front, wandering: the past on one side of the frame and the future on the other. src/score/xform/span.js
#endif
  float W=mix(uF[F_XF2].z,x.z,min(R,1.));      // it's slow and wide at the rim and tightens on the centre, which turns in moments, on the hit
  if(x.x>1.5) R=1.-R; return clamp((x.y-(1.-R)*(1.-W))/W,0.,1.); }
float xfT(vec2 p0,float T){ if(uF[F_XF].x<.5) return T;
  float u=xfU(p0); T=u*u*u*(u*(u*6.-15.)+10.);
  gDT=vec2(dFdx(T),dFdy(T)); return T; }
// The front is a lens going by: it pushes the sheet aside as it passes, by nothing at all before it comes or after it's gone, so anything at all shows it, even two patterns that nearly agree.
vec2 xfPush(vec2 p0,vec2 p){ vec4 f=uF[F_XF2]; if(uF[F_XF].x<.5||f.w==0.) return p;
  float u=xfU(p0); vec2 d=p0-f.xy; float r=length(d); return p+d/max(r,1e-3)*smoothstep(0.,.25,r)*f.w*u*u*(1.-u)*(1.-u)*16.; }
`;
