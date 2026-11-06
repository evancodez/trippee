// The scalar field: fieldS returns S, and family i adds fieldK[i]*S to its phase before the gradient. It will dispatch on field.kind
// (0 off, 1 river, 2 arcade, 3 blaze) to field-impossible.js and field-riley.js. Stub. See docs/NEXT.md 2.4.
export default `float fieldS(int b,vec2 X){ return 0.; }
`;
