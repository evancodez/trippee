// Blaze: S zigzags round the pole, field.a times, with its ridges wound by field.b, and field.ph turns them. Rings that take it (fieldK) become rings of zigzags. See docs/NEXT.md, Stage 4.
// It works out its own angle and radius rather than calling poleOf. A second call of that would be merged with the first by the compiler, and rounding moves on every pattern, used or not.
export default `#ifndef NORILEY
float fieldRiley(int b,vec2 X,vec4 f){ vec2 d=X-uG[b+I_p1].xy; return tri(f.y*atan(d.y,d.x)/TAU+f.z*.5*log(dot(d,d)+1e-9)+f.w); }
#endif
`;
