// The hand's zoom and spin as one frame-level view, so a flight's element can't slip out from under the camera. h: zoom (0 = off), spin, x, y.
export default `vec2 handView(vec2 p){ vec4 h=uF[F_HANDV]; return h.x==0.?p:rot(-h.y)*p*h.x+h.zw; }
`;
