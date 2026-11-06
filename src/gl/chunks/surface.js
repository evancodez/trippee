// Surfaces: where a pixel lands on a quadric or in a room.
export default `// ---------------------------------------------------------------- surfaces: where this pixel lands, with no lighting at all
vec3 hitQuadric(int b,vec3 ro,vec3 rd,inout float cover){
  vec4 a0=uG[b+I_q0],a1=uG[b+I_q1],a2=uG[b+I_q2];
  mat4 Q=mat4(a0.x,a0.y,a0.z,a0.w, a0.y,a1.x,a1.y,a1.z, a0.z,a1.y,a1.w,a2.x, a0.w,a1.z,a2.x,a2.y);
  vec4 O=vec4(ro,1.),D=vec4(rd,0.),Qd=Q*D;
  float A=dot(D,Qd),B=dot(O,Qd),C=dot(O,Q*O);
  float disc=B*B-A*C;
  cover*=aaOf(disc);
  float q=-(B+(B<0.?-1.:1.)*sqrt(max(disc,0.)));
  float t1=abs(A)>1e-7?q/A:1e9,t2=abs(q)>1e-7?C/q:1e9;
  float tn=min(t1,t2),tf=max(t1,t2);
  float t=tn>1e-3?tn:tf;
  if(t<=1e-3||t>=1e8) cover=0.;
  return ro+max(t,0.)*rd;
}

#ifdef WORLD_SURFACE
//@world:surface
#endif
vec3 surface(int b,vec2 p,inout float cover,inout float parity){
  vec4 sf=uG[b+I_surf],cam=uG[b+I_cam];
  if(sf.x<.5) return vec3(p,0.);
#ifdef WORLD_SURFACE
  if(sf.x>2.5) return worldSurface(b,p,cover,parity);
#endif
  float d=cam.w;
  mat2 Rp=rot(cam.x),Ry=rot(cam.y),Rr=rot(cam.z);
  vec3 rd=normalize(vec3(p,-max(d,.05)));
  rd.xy=Rr*rd.xy;
  if(sf.x<1.5){
    vec3 ro=vec3(0.,0.,d);
    rd.yz=Rp*rd.yz; ro.yz=Rp*ro.yz;
    rd.xy=Ry*rd.xy; ro.xy=Ry*ro.xy;
    vec3 h=hitQuadric(b,ro,rd,cover);
    if(sf.y<.5) return h;
    if(sf.y<1.5){ return vec3(atan(h.y,h.x)/TAU*sf.z+sf.w,h.z,0.); }                 // round the z axis: tunnel
    if(sf.y<2.5){ float R=max(length(h),1e-4);                                     // Mercator: conformal, so squares stay square
      float lon=atan(h.x,h.z)+sf.w, lat=asin(clamp(h.y/R,-1.,1.));
      return vec3(lon/TAU*sf.z, log(tan(lat*.5+PI*.25)+1e-5)/TAU*sf.z, 0.); }
    return vec3(atan(h.z,h.x)/TAU*sf.z+sf.w,h.y,0.);                               // round the y axis: tube
  }
  // a room: walls meeting with no outline drawn, only the pattern changing direction
  vec4 q2=uG[b+I_q2],rm=uG[b+I_room];
  float hw=q2.z,hh=q2.w;
  rd=normalize(vec3(p,-max(d*.4,.05)));
  rd.yz=Rp*rd.yz; rd.xz=Ry*rd.xz; rd.xy=Rr*rd.xy;
  float tx=(rd.x>0.?hw:-hw)/max(abs(rd.x),1e-5)*(rd.x>0.?1.:1.);
  tx=hw/max(abs(rd.x),1e-5);
  float ty=hh/max(abs(rd.y),1e-5);
  float tz=rd.z<0.?rm.x/max(-rd.z,1e-5):1e9;
  if(tz<min(tx,ty)){
    if(rm.z<.5) cover*=0.;
    vec3 h=rd*tz;
    return vec3(h.xy,0.);
  }
  if(tx<ty){ vec3 h=rd*tx; parity=rm.y>.5&&rd.x>0.?-parity:parity; return vec3(h.y,-h.z,0.); }
  vec3 h=rd*ty;
  vec2 fl=rot(rm.w)*vec2(h.x,-h.z);
  return vec3(fl,0.);
}

`;
