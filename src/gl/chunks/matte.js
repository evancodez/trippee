// Poles, and the frame-level mattes.
export default `// ---------------------------------------------------------------- a pole: distance and angle, round, square or diamond
vec3 poleOf(vec4 P,vec2 x){
  vec2 d=x-P.xy; d.y*=P.w;
  float l2=length(d),rho;
  if(P.z>0.) rho=mix(l2,max(abs(d.x),abs(d.y)),P.z);
  else if(P.z<0.) rho=mix(l2,(abs(d.x)+abs(d.y))*.70711,-P.z);
  else rho=l2;
  rho=max(rho,1e-4);
  return vec3(rho,log(rho),atan(d.y,d.x)/TAU);
}

float matteOf(int b,vec2 p){
  vec4 m=uG[b+I_matte],sf0=uG[b+I_surf];
  if(sf0.x>.5&&sf0.x<1.5&&sf0.y>.5){ vec4 v=uG[b+I_view]; p=rot(-v.y)*p/max(v.x,1e-5)+v.zw; }   // it stays on the lens with the surface
  if(m.x<.5) return 1.;
  vec4 m2=uG[b+I_matte2],m3=uG[b+I_matte3];
  vec2 q=rot(-m3.x)*(p-m2.xy);
  float sd;
  if(m.x<1.5){
    float e=max(m.z,.5);
    float r=pow(pow(abs(q.x)/max(m2.z,1e-4),e)+pow(abs(q.y)/max(m2.w,1e-4),e),1./e);
    sd=(1.-r)*min(m2.z,m2.w);
  } else {
    // a crack: the wobbling line |g| < eps opening into a field
    float g=q.y-.18*sin(q.x*2.1+m3.y+1.3)-.09*sin(q.x*5.3-m3.y*.7)-.05*sin(q.x*9.1+m3.y*.4+2.);
    sd=m3.w-abs(g);
  }
  if(m.w!=0.) sd+=m.w*boil(p*3.,m3.y,1.1);
  if(m3.z>.5) sd=-sd;
  return aaOf(sd);
}

`;
