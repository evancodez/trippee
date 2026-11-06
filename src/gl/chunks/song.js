// The song in the sheet, as a field over the frame: line weight only, by the threshold and each family's duty, so nothing folds and nothing moves that isn't a line getting fatter or thinner.
//   gBeat   strong beats, as rings of weight. Each comes in from the rim, closes on the focus exactly on its beat, and goes out again, smaller. Inside the last little disc it is all one moment.
//   gTune   what the harmony and the tune are doing, as rings going out from the focus and never coming back: a carrier of fat and thin lines as wide as the harmony's pull, and the tune's own
//           pitch written along the radius, so high notes go out as fat lines and low ones as thin, each at the moment it was played.
// All of it reads tables filled by src/score/song-sheet.js. All zero, and this costs one comparison. See docs/NEXT.md 2.5.
export default `#define WT(i) uF[F_WT+(i)/4][(i)%4]
#define TS(i) uF[F_TENS+(i)/4][(i)%4]
#define MS(i) uF[F_MELS+(i)/4][(i)%4]
float gBeat=0.,gTune=0.;
float wAt(float s){ float f=clamp(s*8.+32.,0.,62.99); int i=int(f); return mix(WT(i),WT(i+1),f-float(i)); }
void songField(vec2 p){ vec4 w=uF[F_WEIGHT],u=uF[F_TUNE],fo=uF[F_FOCUS]; if(w.x==0.&&w.y==0.&&u.x==0.&&fo.z==0.) return;
  float r=length(p-fo.xy);
  if(w.z>0.){ float s=max(r-.28,0.)*1.52*w.z; gBeat=max(wAt(s),.6*wAt(-s))*(.6/max(r,.28)); }       // a ring gathers itself as it closes, as any wave going in does
  if(u.x!=0.){ float f=clamp(r*u.w,0.,14.99); int k=int(f); gTune=u.x*mix(TS(k),TS(k+1),f-float(k))*sin(TAU*(r*u.y-u.z)); }
  if(fo.z!=0.){ float f=clamp(r*fo.w,0.,30.99); int k=int(f); gTune+=fo.z*mix(MS(k),MS(k+1),f-float(k)); }
  gTune*=smoothstep(.2,.6,r); }       // the focus itself belongs to the beat
`;
