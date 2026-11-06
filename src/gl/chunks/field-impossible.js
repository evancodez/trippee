// River and Arcade, reached through fields.js. Both are the parity of a reflection group, so every tile really is the same tile, and the only motion is one of the group's own isometries:
// whole cycles change nothing, there's no source, no sink and no reset. See docs/NEXT.md, Stage 4.
//   River   the triangle group (P,Q,2) in the band model of the hyperbolic plane. field.a P (plus the colouring, below), field.b Q, field.scale how much of the band shows, field.spin which way through the centre it flows.
//   Arcade  the modular group in the half plane, flowing along M=[[2,1],[1,1]]. field.scale its size, field._2 how far the frame's bottom edge stands off the real line.
// field.a's hundreds say which mirrors change colour: bits 1, 2, 4 turn off the mirror through the centre, the next one round, and the polygon's own edge. 0 is every chamber, a triangle.
// It's in field.a so that patterns with different colourings can't slide into each other: that would be a cut. A mirror that doesn't flip must not bring S to 0 either, so the distance only counts those that do.
// S is the signed distance to the nearest flipping mirror, times field._1 (one over the chamber's inradius, so S reaches 1 at its middle), and then 1-(1-s)^8. These are big shapes: on lines the threshold moves
// brightness in proportion, and here that would shrink a tile to a speck in a sea of the other colour, so a strong beat moves every edge by a few pixels and only right at solid does it go all the way.
// It's in the chamber's own units, so every tile fattens by the same true amount. Where a whole chamber gets under a few pixels it closes up to black, by how much the fold has shrunk it, rather than aliasing into grey.
// The River's half is out of every program for now (FIELD_RIVER): with it in, every pattern in the fuller programs took 3 to 4 times as long at 3024x1964, used or not, and neither constants in place of
// its trig nor a simpler loop changed that. The Arcade's half alone costs them about 10%. The River needs a program bit of its own in src/gl/renderer.js, and then RIVER_BUILT in families/impossible.js.
export default `#ifndef NORILEY
#define FIELD_IMPOSSIBLE
float fieldImpossible(int b,vec2 X,vec4 f){
  vec4 h=uG[b+I_field2];
  int off=int(f.y+.5)/100;
  float fA=(off&1)==0?-1.:1.,fB=(off&2)==0?-1.:1.,fC=(off&4)==0?-1.:1.;
  float par=1.,j=1.,e;
#ifdef FIELD_RIVER
  if(f.x<1.5){
    float P=f.y-float(off*100),a=PI/P,cb=cos(PI/f.z),sa=sin(a),ca=cos(a),s=sqrt(cb*cb-sa*sa),r=sa/s,cx=cb/s,L=4.*atanh(cx-r),r2=r*r;
    if((((int(P+.5)/2)&1)==0?fA:fB)*fC<0.) L*=2.;                           // the step to the next polygon is two mirrors, so with some colourings a whole cycle is two polygons
    float vm=1.5708*h.y,y=abs(X.y),v=vm*min(y,1.),u=vm*X.x;
    if(y>1.){ float room=.8*(1.5708-vm); v+=room*(1.-exp(-(y-1.)*vm/room)); }  // never out to the edge of the plane, however far the frame turns or the hand zooms out
    if(X.y<0.) v=-v;
    float ph=fract(f.w+.5)-.5;
    vec2 z;
    if(h.x==0.){ u+=ph*L; u-=L*round(u/L); float d=cosh(u)+cos(v); z=vec2(sinh(u),sin(v))/d; j=vm/d; }
    else {
      u=clamp(u,-9.,9.);
      float d=cosh(u)+cos(v); z=rot(h.x)*vec2(sinh(u),sin(v))/d; j=vm/d;
      float t=tanh(.5*ph*L),dx=1.+t*z.x,dy=t*z.y,q=dx*dx+dy*dy;
      z=vec2((z.x+t)*dx+t*z.y*z.y,z.y*(1.-t*t))/q; j*=(1.-t*t)/q;
    }
    vec2 nA=vec2(-sa,ca),C=vec2(cx,0.);
    for(int i=0;i<24;i++){
      bool m=false;
      if(z.y<0.){ z.y=-z.y; par*=fA; m=true; }
      float k=dot(z,nA); if(k>0.){ z-=2.*k*nA; par*=fB; m=true; }
      vec2 q=z-C; float q2=dot(q,q); if(q2<r2){ float w=r2/q2; z=C+q*w; j*=w; par*=fC; m=true; }
      if(!m) break;
    }
    e=9.;
    if(fA<0.) e=min(e,z.y);
    if(fB<0.) e=min(e,-dot(z,nA));
    if(fC<0.) e=min(e,length(z-C)-r);
  } else
#endif
  {
    float s=fract(f.w),A=sinh(s*.9624237)/1.118034,B=-sinh((s-1.)*.9624237)/1.118034;
    vec2 z=vec2(X.x*h.y+.5,(X.y+h.w)*h.y);
    float y0=h.y*(h.w-1.);
    if(X.y<-1.) z.y=y0*exp((X.y+1.)*h.y/y0);                                  // never down to the real line, however far the hand zooms out
    vec2 n=vec2((2.*A+B)*z.x+A,(2.*A+B)*z.y),d=vec2(A*z.x+A+B,A*z.y);
    float q=dot(d,d);
    z=vec2(n.x*d.x+n.y*d.y,n.y*d.x-n.x*d.y)/q; j=h.y/q;
    for(int i=0;i<48;i++){
      z.x-=round(z.x);
      if(z.x<0.){ z.x=-z.x; par*=fA; }
      float m=dot(z,z);
      if(m<1.){ z/=m; j/=m; par*=fC; } else break;
    }
    e=9.;
    if(fA<0.) e=min(e,z.x);
    if(fC<0.) e=min(e,min(.5-z.x,dot(z,z)-1.));
  }
  float fin=j*length(dFdx(X));
  e=1.-min(e*h.z,1.); e*=e; e*=e;
  return mix(par*(1.-e*e),-1.,smoothstep(.07,.2,fin));
}
#endif
`;
