// The scalar field: fieldS returns S, and family i adds fieldK[i]*S to its phase before the gradient. It dispatches on field.kind
// (0 off, 1 river, 2 arcade, 3 blaze) to field-impossible.js and field-riley.js. See docs/NEXT.md 2.4.
// field-impossible.js says it's there with #define FIELD_IMPOSSIBLE, and gives float fieldImpossible(int b,vec2 X,vec4 f).
// In a program built with NORILEY S is simply 0, so it folds away and with it the look-up of fieldK in every family.
export default `float fieldS(int b,vec2 X){
#ifdef NORILEY
  return 0.;
#else
  vec4 f=uG[b+I_field];
  if(f.x<.5) return 0.;
#ifdef FIELD_IMPOSSIBLE
  if(f.x<2.5) return fieldImpossible(b,X,f);
#endif
  return f.x>2.5?fieldRiley(b,X,f):0.;
#endif
}
`;
