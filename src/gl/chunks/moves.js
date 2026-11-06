// Ways of moving, in the shader: a coordinate carry before the surface, and the slip added to a family's phase after its gradient.
// A carry at amount 0 is skipped, so it compiles away. See docs/NEXT.md 2.2.
//
// The slip: the picture is cut into bands, and in each band one family slides along it by a whole isometry, so lines never thin. It's added after the gradient, so a jump draws no outline,
// and a whole number of cycles is no change at all, which is how a band locks.
//   n*u      Lock: each band one share further on than the last. At u = 1/2 a checker nobody drew; at 1, nothing.
//   table    Tumblers: how far each of the eight nearest bands has slipped, in cycles, worked out in src/score/moves/slip.js. Any band past those is whole. The numbers are
//            slip.left, step, ease, seed and spare.a..d. (A gesture wears this or a coin with ribs, which reads spare too.)
// A GPU pays for what a program declares on every pixel, drawn from or not, so all the slip's arithmetic is out here and only a look-up in here, and a program built with NOSLIP has none of it.
//
// The star sphere, a carry: the sheet is wrapped on a ball by stereographic projection, the ball is rolled by a quaternion, and every point is folded by the icosahedron's fifteen mirrors into
// one chamber, whose middle sits at the south pole, and unwrapped. At R = 1/k = 40 the chamber covers the frame and this is exactly nothing. As R falls its walls come in, and each is a
// crease with the pattern mirrored in it. Conformal, with lines never thinner than they were, so a bold pattern stays bold. It's a carrier, not a look. src/score/moves/star.js says how it moves.
export default `#ifdef NOSTAR
vec2 moveCarry(int b,vec2 p){ return p; }
#else
const vec3 N3=vec3(-.5,-.809017,.309017);
const mat3 CH=mat3(.008722,-.991278,-.131496,-.991278,.008722,-.131496,.131496,.131496,-.982557);  // the chamber's middle to the south pole; columns
vec2 moveCarry(int b,vec2 p){ float K=uG[b+I_star].x; if(K<=0.) return p;
  vec4 q=normalize(vec4(uG[b+I_star].yzw,uG[b+I_star2].x));
  vec2 z=p*K; float n=1.+dot(z,z); vec3 P=vec3(2.*z,n-2.)/n;
  P+=2.*cross(q.xyz,cross(q.xyz,P)+q.w*P); P=transpose(CH)*P;
  for(int i=0;i<5;i++){ P.xy=abs(P.xy); P-=2.*min(dot(P,N3),0.)*N3; }   // five reach the chamber from anywhere on the ball
  P=CH*P; return P.xy/max(1.-P.z,1e-4)/K; }
#endif
#ifdef NOSLIP
float moveSlip(int b,inout vec2 X,inout vec3 b1){ return 0.; }
#else
float slipOf(int b,float n){ float i=abs(n); int k=int(i); return n*uG[b+I_slip].z+(i>7.5?0.:k<4?uG[b+I_slip2][k]:uG[b+I_spare][k-4]); }
// Where a cut lies on the across family's own edge and the cells either side happen to match, that family's anti-aliased edge would be drawn with nothing to draw: a hairline between two
// cells of one colour. So on just those pixels it's read from wholly inside this band, and there's no line there at all. Where they differ, its edge is the edge. A pixel and a half, because
// the gradient of a pixel read further in widens its neighbour's filter. b1 and X are what that family reads next.
float moveSlip(int b,inout vec2 X,inout vec3 b1){
  vec4 s=uG[b+I_slip]; if(s.x<.5) return 0.;
  vec2 dir=vec2(cos(s.w),sin(s.w));
  float e=s.y*(s.x<1.5?dot(X,dir):s.x<2.5?b1.x:s.x<3.5?b1.y+2.:b1.z+.5);   // 1 straight, 2 rings, 3 log rings, 4 sectors (tumblers only)
  float w=s.x<3.5?fwidth(e):s.y*(fwidth(X.x)+fwidth(X.y))/(TAU*b1.x);     // an angle's fwidth is its wrap's on one line
  float m=floor(e),f=e-m,n=s.x>3.5?mod(m,s.y):m,l=slipOf(b,n);
  if(f<1.5*w||f>1.-1.5*w){
    bool lo=f<1.5*w;
    float o=lo?n-1.:n+1.; if(s.x>3.5) o=mod(o,s.y);
    vec4 M=uG[b+I_slipM]; int i=M.x>.5?0:M.y>.5?1:M.z>.5?2:3;
    vec4 fa=uG[b+3*i],fb=uG[b+3*i+1];
    float x=dot(fa.xy,X)*uG[b+I_tune].x+dot(fb.xyz,b1)+fa.w;
    if((abs(fract(x+l)-.5)<.25)!=(abs(fract(x+slipOf(b,o))-.5)<.25)){
      float q=(m+(lo?1.5*w:1.-1.5*w))/s.y;
      if(s.x<1.5) X+=dir*(q-dot(X,dir)); else if(s.x<2.5) b1.x=q; else if(s.x<3.5) b1.y=q-2.; else b1.z=q-.5;
    }
  }
  return l;
}
#endif
`;
