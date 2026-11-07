// With a song: static holds the camera where it was, a pick wears the camera, and nothing throws. Numbers only. Muted.
export default async ({ page, log }) => {
  await page.eval(`app.manual=true;window.__done=false;trippee.song('/media/${process.env.SONG || 'mgmt'}.mp3',{autoplay:false,seed:7}).then(()=>window.__done=true);0`);
  for (let i = 0; i < 3000; i++) { if (await page.eval('window.__done')) break; await new Promise(r => setTimeout(r, 200)); }
  log(await page.eval(async () => {
    const { OFF } = await import(new URL('src/pattern/layout.js', location.href).href);
    const T = window.trippee, st = app.stage, out = []; app.song.pause?.(); app.ui?.song?.show?.(false); app.manual = true; app.governor.enabled = false;
    const nums = () => { const A = app.R.slotA, v = k => +A[OFF[k]].toFixed(4); return `t${app.t.toFixed(2)} ${app.lastFrame.G.pattern.id} ${app.lastFrame.kind ?? '-'} s${v('scale')} r${v('rot')} tx${v('tx')} ty${v('ty')} p${v('cam.pitch')} k${v('surf.kind')}`; };
    T.seek(112); for (let i = 0; i < 60; i++) T.step(1 / 60);
    out.push('moving ' + nums());
    st.setStatic(true, app.pictureT());
    for (let i = 0; i < 30; i++) T.step(1 / 60);
    out.push('static .5 s ' + nums());
    for (let i = 0; i < 180; i++) T.step(1 / 60);
    out.push('static 3.5 s ' + nums());
    for (let i = 0; i < 240; i++) T.step(1 / 60);
    out.push('static 7.5 s ' + nums());
    st.setStatic(false, app.pictureT());
    for (let i = 0; i < 600; i++) T.step(1 / 60);
    out.push('released 10 s ' + nums());
    const pick = app.patterns.find(p => p.id === 'lattice.master') ?? app.patterns[0];
    st.go(pick.id, app.pictureT());
    for (let i = 0; i < 300; i++) T.step(1 / 60);
    out.push('picked 5 s ' + nums());
    for (let i = 0; i < 480; i++) T.step(1 / 60);
    out.push('picked 13 s ' + nums());
    for (let i = 0; i < 300; i++) T.step(1 / 60);
    out.push('picked 18 s ' + nums());
    return out.join('\n');
  }));
  log('errors', JSON.stringify(page.logs.filter(l => /\[error\]|\[exception\]/.test(l)).slice(0, 5)));
};
