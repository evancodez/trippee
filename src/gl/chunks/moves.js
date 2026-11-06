// Ways of moving, in the shader: a coordinate carry before the surface, and the slip added to a family's phase after its gradient.
// Stubs until their lanes land: amount 0 means skipped, so they compile away. See docs/NEXT.md 2.2.
export default `vec2 moveCarry(int b,vec2 p){ return p; }
float moveSlip(int b,vec2 X,vec3 b1){ return 0.; }
`;
