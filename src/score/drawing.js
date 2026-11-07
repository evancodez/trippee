// The film being drawn right now. A pattern's own drive (a riot move, a fold or a sheet in space picked with no list of hits) marches on the song's strong beats, and all it's handed is a gesture,
// a time and phi, so it reads the beats off the film. That used to be the film on the screen: but a song's first rehearsal runs before its film is up, with the picture that was there before it, so
// the rehearsal saw the drive on another clock from the one it plays on, and a transformation's plan made then whipped the lines across on screen (PPP 179 to 183 s, a tile flashing 20 times a second).
// frame() says which film it's drawing, and so does anything else that draws one ahead of time. Outside those it's the film on the screen, as it always was.
export const drawing = { score: null };
export const drawnScore = () => drawing.score ?? globalThis.app?.stage?.score;
// Draw with `score` as the film, and put back whatever was there.
export function drawingFor(score, fn) {
  const was = drawing.score;
  drawing.score = score;
  try { return fn(); } finally { drawing.score = was; }
}
