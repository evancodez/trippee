// A carry after the view: coordinates only, amount 0 means skipped. See docs/NEXT.md 2.2 (the Coin) and 2.4.
//
// The lathe: this pixel is on a turned shape seen from one side. Height shows as a shift along the lean, so where a surface of revolution has height h(r), a ring of radius R is drawn
// as a circle of radius R with its centre moved k h(R) that way. Lines crowd on one side and open on the other, and nothing tears. With h = r that's a cone, solved exactly for
// |X - k r u| = r rather than iterated, so a steep one keeps its shape.
//
// carry.xy (lathe.k, lathe.w) is the lean as a vector: its length is k, its direction u. So a slide between two of them goes straight across rather than spinning round, and no angle
// ever has to wrap. k stays under 1, and the move keeps it well under. The cone can have ribs running up it, with h = r + (b sin fr + c cos fr) / f: spare.xyz is f, b, c, again a
// vector so nothing wraps. They're two Newton steps from the cone, which is enough: the move keeps k(1 + |(b, c)|) under .82.
//
// Metamorphosis: two shears, one after the other, each by a wave of the other coordinate. A shear only ever slides a row along itself, so nothing folds or tears and every shape keeps its
// area, whatever the amount. meta.k is how many cells of the wave fit in a unit, so with the wave as long as a check's cell every cell grows the same hooks, and each fits into the next.
// The amount can vary over the frame, as Escher's scroll does: star._1 is how many waves of it per unit, across the frame and staying on it as the sheet pans, star._2 how far along they are, and
// so a square turns into a creature as it travels. Still shears, because each one's amount depends only on what it shears by. (The star's two unused numbers: a gesture isn't both.)
// Everything here dies away with meta.amt alone, whatever the others do, so a slide to or from a pattern with none has no jump at either end.
// metaE is .22 sin(s+.4) + .09 sin(2s+2.2) + .05 sin(3s+.9), written out to need only one sin and one cos: a GPU pays for this on every pixel, drawn from or not. A program built with NORILEY has none of it.
export default `#ifndef NORILEY
float metaE(float s){ s*=TAU; float S=sin(s),C=cos(s),S2=2.*S*C,C2=1.-2.*S*S; return .2026*S+.0857*C-.053*S2+.0728*C2+.0311*(S*C2+C*S2)+.0392*(C*C2-S*S2); }
float metaA(float a,vec4 w,float s){ return a*(.56+.44*cos(TAU*(w.y*s+w.z))); }
#endif
vec2 carryX(int b,vec2 X){
#ifndef NOCARRY
  vec4 c=uG[b+I_carry];
  if(c.x!=0.||c.y!=0.){
    float k=length(c.xy); vec2 u=c.xy/k; float d=dot(X,u),q=1.-k*k,r=(sqrt(k*k*d*d+q*dot(X,X))-k*d)/q,h=r;
    vec4 s=uG[b+I_spare];
    if(s.y!=0.||s.z!=0.){
      float f=max(s.x,1e-3);
      for(int i=0;i<2;i++){ float a=f*r,S=sin(a),C=cos(a); vec2 Y=X-k*(r+(s.y*S+s.z*C)/f)*u; float n=max(length(Y),1e-5); r-=(n-r)/(-k*(1.+s.y*C-s.z*S)*dot(Y,u)/n-1.); }
      h=r+(s.y*sin(f*r)+s.z*cos(f*r))/f;
    }
    X-=k*h*u;
  }
#ifndef NORILEY
  if(c.z!=0.){ vec4 w=uG[b+I_star2],v=uG[b+I_view]; float a=c.z/max(c.w,1.); X.x+=metaA(a,w,X.y-v.w)*metaE(c.w*X.y); X.y+=metaA(a,w,X.x-v.z)*metaE(c.w*X.x); }
#endif
#endif
  return X;
}
`;
