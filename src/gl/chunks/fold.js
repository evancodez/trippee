// Space folding: mirrors in front of the sheet, one slot at a time, before its surface and its view. Only a program built with FOLD has any of this (src/gl/renderer.js), so nothing else pays for it, and all of it is a pure function of the slot's numbers.
// A fold is continuous: what's past a mirror is the reflection of what's before it, so the two sides agree along the crease. So any chain of folds is continuous, wherever the mirrors are and however they move, and a mirror parked off the frame is exactly nothing. That is why
// none of this can pop, and "the number of mirrors can't change" doesn't hold here. And a reflection in a line changes no size at all, so a sheet folded a hundred times has the same bold lines it started with. In order:
//   feedback  the frame holds a smaller, turned picture of itself, which holds another. uG[sfD]: S (0 off), turn per level, the screen's half width and height. uG[sfD2]: centre, tau (how far along one level the camera has flown: whole numbers change nothing), unused. A level's edge is a real jump, and it's a seam.
//   mobius    the Riemann sphere rolling: z -> (az+b)/(cz+d). uG[sfM]: a, b. uG[sfM2]: c, d. All zero off.
//   fan       mirrors through one centre, at every multiple of `al`, for any real al: an exact kaleidoscope only at pi/n, and always continuous, because the angle is folded after |th| and both sides of th = pi are the same. uG[sfF]: centre, al (0 off), its turn.
//   log       the radius folds between two circles, again and again, in and out for ever. uG[sfL]: ln of the inner circle, ln of the outer (equal: off), how far the circles have flown, the twist. A twist needs the fan on, or it tears where th wraps.
//   chain     up to 8 generalised mirrors, a line or a circle: reflect what's on the far side, in order, up to `reps` times round. uG[sfM0+i]: a, bx, by, c. f = a|z|^2 - 2 b.z + c, with |b|^2 - ac = 1, and where f > 0 z becomes (z + b f) / (1 + a f). A line has a = 0.
// par: every reflection also inverts the sheet, so each room is the negative of the next and the mirrors show as an edge. The phase jumps there, but gPh takes it after the gradient, so it's only the edge's own pixels: gFoldE takes those to their true coverage in main.js.
export default `#ifdef FOLD
float gFoldE=0.;
bool gFS=false;
vec2 spaceFold(int b,vec2 z,inout float par){
  vec4 s=uG[b+I_sf];
  gFS=false;
  if(s.x<.5) return z;
  bool flip=s.y>.5;
  float jac=1.,e=0.,lv=0.,pxs=.5*uF[8].y;
  vec4 d=uG[b+I_sfD];
  if(d.x>0.){
    vec4 d2=uG[b+I_sfD2];
    vec2 c=d2.xy;
    float zm=pow(d.x,d2.z);
    z=c+zm*(rot(d.y*d2.z)*(z-c)); jac*=zm;
    mat2 R=rot(-d.y);
    for(int i=0;i<14;i++){
      vec2 q=R*(z-c)/d.x;
      if(abs(q.x)>d.z||abs(q.y)>d.w) break;
      z=c+q; jac/=d.x; lv+=1.;
    }
    if(flip&&mod(lv,2.)>.5) par=-par;
  }
  vec4 M=uG[b+I_sfM],N=uG[b+I_sfM2];
  if(dot(M,M)+dot(N,N)>0.){
    vec2 u=vec2(M.x*z.x-M.y*z.y,M.x*z.y+M.y*z.x)+M.zw,v=vec2(N.x*z.x-N.y*z.y,N.x*z.y+N.y*z.x)+N.zw;
    float vv=max(dot(v,v),1e-9);
    z=vec2(u.x*v.x+u.y*v.y,u.y*v.x-u.x*v.y)/vv;
    vec2 ad=vec2(M.x*N.z-M.y*N.w,M.x*N.w+M.y*N.z),bc=vec2(M.z*N.x-M.w*N.y,M.z*N.y+M.w*N.x);
    jac*=length(ad-bc)/vv;
  }
  vec4 f=uG[b+I_sfF],l=uG[b+I_sfL];
  if(f.z>0.||l.y>l.x){
    vec2 c=rot(f.w)*(z-f.xy);
    float r=max(length(c),1e-6),th=atan(c.y,c.x),r0=r;
    if(f.z>0.){
      float ath=abs(th),m=mod(ath,2.*f.z);
      float sec=floor(ath/f.z);
      if(m>f.z) m=2.*f.z-m;
      if(flip){
        if(mod(sec,2.)>.5) par=-par;
        if(th<0.) par=-par;
        e=max(e,clamp(.5-min(min(m,f.z-m),min(ath,PI-ath))*r/jac*pxs,0.,.5));
      }
      th=m;
    }
    if(l.y>l.x){
      float lr=log(r),rho=lr+l.z-l.w*th,D=l.y-l.x,x=rho-l.x,mm=mod(x,2.*D);
      float rr=l.y-abs(mm-D);
      if(flip){
        if(mod(floor(x/D),2.)>.5) par=-par;
        e=max(e,clamp(.5-min(mod(x,D),D-mod(x,D))*r/sqrt(1.+l.w*l.w)/jac*pxs,0.,.5));
      }
      th+=l.w*(lr+l.z*0.);
      r=exp(rr);
      jac*=r/r0*sqrt(1.+l.w*l.w);
    }
    z=f.xy+rot(-f.w)*(r*vec2(cos(th),sin(th)));
  }
  int n=int(s.w),reps=int(s.z);
  for(int k=0;k<reps;k++){
    bool any=false;
    for(int i=0;i<n;i++){
      vec4 m=uG[b+I_sfm0+i];
      float fz=m.x*dot(z,z)-2.*dot(m.yz,z)+m.w,g=1.+m.x*fz;
      if(flip) e=max(e,clamp(.5-abs(fz)/(2.*sqrt(max(g,1e-6)))/jac*pxs,0.,.5));
      if(fz>0.){ g=max(g,1e-5); z=(z+m.yz*fz)/g; jac/=g; if(flip) par=-par; any=true; }
    }
    if(!any) break;
  }
  gFS=dFdx(lv)!=0.||dFdy(lv)!=0.;
  if(e>0.) gFoldE=gFoldE+e-2.*gFoldE*e;
  return z;
}
#endif
`;
