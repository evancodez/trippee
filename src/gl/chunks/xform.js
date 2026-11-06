// A transformation whose time is local to each pixel (Shock). gDT is T's gradient. Stub, with gDT a constant so it costs nothing: the real one can't be const. See docs/NEXT.md 2.3.
export default `const vec2 gDT=vec2(0.);
float xfT(vec2 p0,float T){ return T; }
`;
