'use strict';
/* CUBE X — script.js
   Part 1: puzzle engine (pure logic, no DOM). Part 2: Three.js app.
   Coordinates are doubled so even sizes work: a cubie's p[i] is in {-(n-1),-(n-3),…,n-1}.
   Notation: faces R L U D F B; t=1 clockwise (seen from outside the face), -1 counter-clockwise, 2 half.
   d = layer depth (1 = outer layer), w = wide (all layers 1..d). Face index k = axis*2 + (positive?0:1) = R,L,U,D,F,B. */
const FL = 'RLUDFB', FACES = { R: [0, 1], L: [0, -1], U: [1, 1], D: [1, -1], F: [2, 1], B: [2, -1] };
const rot = (v, a, s) => { const [x, y, z] = v;                    // +90° (s=1) or -90° about axis a, right-handed
  if (a === 0) return s > 0 ? [x, -z, y] : [x, z, -y];
  if (a === 1) return s > 0 ? [z, y, -x] : [-z, y, x];
  return s > 0 ? [-y, x, z] : [y, -x, z]; };
function makeCube(n) {
  const cs = [], r = []; for (let i = 0; i < n; i++) r.push(2 * i - n + 1);
  for (const x of r) for (const y of r) for (const z of r) {
    const p = [x, y, z], st = [];
    for (let a = 0; a < 3; a++) if (Math.abs(p[a]) === n - 1) st.push({ a, sg: p[a] > 0 ? 1 : -1, col: a * 2 + (p[a] > 0 ? 0 : 1) });
    if (st.length) cs.push({ p, h: p.slice(), e: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], st });
  }
  return cs;
}
const layerIdx = (c, n, f) => { const [a, sg] = FACES[f]; return sg > 0 ? (n - 1 - c.p[a]) / 2 : (c.p[a] + n - 1) / 2; };
const select = (cs, n, m) => cs.filter(c => { const i = layerIdx(c, n, m.f); return m.w ? i < m.d : i === m.d - 1; });
const angleSign = m => (FACES[m.f][1] > 0 ? -1 : 1) * (m.t < 0 ? -1 : 1);     // rotation sign about +axis (right-handed)
function commit(sel, m) { const a = FACES[m.f][0], s = angleSign(m), k = Math.abs(m.t) === 2 ? 2 : 1;
  for (const c of sel) for (let q = 0; q < k; q++) { c.p = rot(c.p, a, s); c.e = c.e.map(v => rot(v, a, s)); } }
const apply = (cs, n, m) => commit(select(cs, n, m), m);
const inv = m => ({ ...m, t: m.t === 2 ? 2 : -m.t });
const tok = m => { const w = m.w && m.d > 1; return (w ? (m.d > 2 ? m.d : '') : (m.d > 1 ? m.d : '')) + m.f + (w ? 'w' : '') + (m.t === 2 ? '2' : m.t < 0 ? "'" : ''); };
const faceIdx = v => { for (let a = 0; a < 3; a++) if (v[a]) return a * 2 + (v[a] > 0 ? 0 : 1); };
function solved(cs) { const f = [];                                   // every world face shows exactly one colour
  for (const c of cs) for (const s of c.st) { const k = faceIdx(c.e[s.a].map(x => x * s.sg));
    if (f[k] === undefined) f[k] = s.col; else if (f[k] !== s.col) return false; } return true; }
function solvedStrict(cs) {                                           // used with pictures: every cubie at its home cell, same orientation
  const E = cs[0].e; for (const c of cs) { const q = [0, 0, 0];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) q[j] += c.h[i] * E[i][j];
    if (q.some((x, j) => x !== c.p[j])) return false;
    if (c.e.some((v, i) => v.some((x, j) => x !== E[i][j]))) return false; } return true; }
function scramble(n, len, rnd = Math.random) { const out = []; let l = null, maxd = n === 2 ? 1 : n - 1;
  while (out.length < len) { const f = FL[rnd() * 6 | 0], d = 1 + (rnd() * maxd | 0);
    if (l && l.f === f && l.d === d) continue; l = { f, d, w: false, t: [1, -1, 2][rnd() * 3 | 0] }; out.push(l); } return out; }
if (typeof module !== 'undefined') module.exports = { FL, FACES, makeCube, select, commit, apply, inv, tok, solved, solvedStrict, scramble, angleSign };

if (typeof document !== 'undefined') (function () {
const $ = s => document.querySelector(s);
const DEF = { size: 3, speed: 1, sens: 1, damp: .12, auto: false, sound: true, haptic: true, quality: 1, theme: 'graphite', shuf: 25 };
let S = { ...DEF }; try { S = { ...DEF, ...JSON.parse(localStorage.getItem('cubex') || '{}') }; } catch (e) {}
if (![2, 3, 6, 8].includes(S.size)) S.size = 3;
const save = () => { try { localStorage.setItem('cubex', JSON.stringify(S)); } catch (e) {} };
const fail = msg => { $('#load').classList.add('err'); $('#loadmsg').textContent = msg; };
if (typeof THREE === 'undefined') return fail('The 3D engine (Three.js) could not be loaded. CUBE X needs an internet connection the first time to fetch it from cdnjs.');
let renderer; try { renderer = new THREE.WebGLRenderer({ canvas: $('#gl'), antialias: true, alpha: true, powerPreference: 'high-performance' }); }
catch (e) { return fail('WebGL is not available on this device or browser. Try another browser or enable hardware acceleration.'); }
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
document.documentElement.dataset.theme = S.theme;

/* ---------- feedback ---------- */
let ac; const tone = (f, d, v = .05, ty = 'sine', at = 0) => { if (!S.sound) return; try {
  ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume();
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + at; o.type = ty; o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + .006); g.gain.exponentialRampToValueAtTime(.0001, t + d);
  o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + d + .03); } catch (e) {} };
const sfx = { turn: () => tone(140 + Math.random() * 40, .07, .05, 'triangle'), btn: () => tone(520, .04, .02), err: () => tone(120, .2, .05, 'sawtooth'),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .35, .045, 'sine', i * .09)) };
const buzz = p => { if (S.haptic && navigator.vibrate) try { navigator.vibrate(p); } catch (e) {} };
let tt; const toast = (m, bad) => { if (S.notif === false && !bad) return; const t = $('#toast'); t.textContent = m; t.className = 'show' + (bad ? ' bad' : ''); clearTimeout(tt); tt = setTimeout(() => t.className = '', bad ? 4500 : 2800); };
const err = m => { toast(m, 1); sfx.err(); buzz(40); };

/* ---------- scene ---------- */
const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(38, 1, .1, 100);
scene.add(new THREE.HemisphereLight(0xffffff, 0x20232b, .62));
const key = new THREE.DirectionalLight(0xfff3e2, .62); key.position.set(5, 8, 6); scene.add(key);
const rim = new THREE.DirectionalLight(0x9db4ff, .22); rim.position.set(-6, 2, -5); scene.add(rim);
const sc = document.createElement('canvas'); sc.width = sc.height = 128; { const g = sc.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
const shadow = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
shadow.rotation.x = -Math.PI / 2; shadow.position.y = -2.75; scene.add(shadow);
const root = new THREE.Group(), pivot = new THREE.Group(); root.add(pivot); scene.add(root);

const COL = [0xd62828, 0xff7a00, 0xf4f4f4, 0xffd60a, 0x0fa958, 0x1565d8];
const BAS = [[[0, 0, -1], [0, 1, 0], [1, 0, 0]], [[0, 0, 1], [0, 1, 0], [-1, 0, 0]], [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
  [[1, 0, 0], [0, 0, 1], [0, -1, 0]], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, -1]]];   // [u, v, normal] per face
const V = a => new THREE.Vector3(a[0], a[1], a[2]), M4 = new THREE.Matrix4();
function rounded(sz, r) { const h = sz / 2, s = new THREE.Shape(); s.moveTo(-h + r, -h); s.lineTo(h - r, -h); s.quadraticCurveTo(h, -h, h, -h + r);
  s.lineTo(h, h - r); s.quadraticCurveTo(h, h, h - r, h); s.lineTo(-h + r, h); s.quadraticCurveTo(-h, h, -h, h - r);
  s.lineTo(-h, -h + r); s.quadraticCurveTo(-h, -h, -h + r, -h); return new THREE.ShapeGeometry(s, 4); }

let n = 0, U = 1, SZ = 1, cubes = [], res = [], imgRes = [], imgCv = [null, null, null, null, null, null], imgOn = false, stG, cmats;
const place = c => { c.g.position.set(c.p[0], c.p[1], c.p[2]).multiplyScalar(U / 2);
  c.g.quaternion.setFromRotationMatrix(M4.makeBasis(V(c.e[0]), V(c.e[1]), V(c.e[2]))); };
function clearCube() { for (const c of cubes) root.remove(c.g); pivot.rotation.set(0, 0, 0);
  imgRes.forEach(r => r.dispose()); res.forEach(r => r.dispose()); imgRes = []; res = []; cubes = []; }
function build(size) {
  clearCube(); n = size; U = 3 / n; SZ = U * .86;
  const bodyG = new THREE.BoxGeometry(U * .985, U * .985, U * .985), bodyM = new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: .55, metalness: .1 });
  stG = rounded(SZ, U * .13); cmats = COL.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: .36, metalness: .02, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  res.push(bodyG, bodyM, stG, ...cmats);
  cubes = makeCube(n);
  for (const c of cubes) { const g = new THREE.Group(); g.add(new THREE.Mesh(bodyG, bodyM));
    for (const s of c.st) { const k = s.a * 2 + (s.sg > 0 ? 0 : 1), b = BAS[k], m = new THREE.Mesh(stG, cmats[s.col]);
      m.quaternion.setFromRotationMatrix(M4.makeBasis(V(b[0]), V(b[1]), V(b[2]))); m.position.copy(V(b[2])).multiplyScalar(U * .4935); s.mesh = m; g.add(m); }
    c.g = g; g.userData.c = c; place(c); root.add(g); }
  applyImages(); $('#sizeLbl').textContent = `${n}×${n}×${n}`;
}
function applyImages() {
  imgRes.forEach(r => r.dispose()); imgRes = []; imgOn = imgCv.some(Boolean);
  const im = imgCv.map(c => { if (!c) return null; const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: .42 }); imgRes.push(t, m); return m; }), cell = {};
  for (const c of cubes) for (const s of c.st) { const k = s.a * 2 + (s.sg > 0 ? 0 : 1);
    if (!im[k]) { s.mesh.material = cmats[s.col]; s.mesh.geometry = stG; continue; }
    const [u, v] = BAS[k], i = (u[0] * c.h[0] + u[1] * c.h[1] + u[2] * c.h[2] + n - 1) / 2, j = (v[0] * c.h[0] + v[1] * c.h[1] + v[2] * c.h[2] + n - 1) / 2, ky = i + ',' + j;
    if (!cell[ky]) { const g = stG.clone(), p = g.attributes.position, uv = g.attributes.uv;
      for (let q = 0; q < p.count; q++) uv.setXY(q, (i + p.getX(q) / SZ + .5) / n, (j + p.getY(q) / SZ + .5) / n);
      uv.needsUpdate = true; cell[ky] = g; imgRes.push(g); }
    s.mesh.material = im[k]; s.mesh.geometry = cell[ky]; }
}
const isSolved = () => imgOn ? solvedStrict(cubes) : solved(cubes);

/* ---------- state / queue ---------- */
let Q = [], cur = null, hist = [], redo = [], base = 0, t0 = 0, tEnd = 0, scr = false, solving = false, stopFlag = false, solveTotal = 0, solveDone = 0, after = null, dirty = true, intro = 0, pulse = 0;
let depth = 1, wide = false, half = false, menuSpin = false, onSolved = () => {};
const dmax = () => n === 2 ? 1 : n - 1, movesN = () => Math.max(0, hist.length - base);
const locked = () => !!cur || Q.length > 0 || solving || intro < 1;
const ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const dur = () => (300 / S.speed) * (Q.length > 6 ? .4 : 1) * (solving ? .75 : 1) * (RM ? .4 : 1);
function play(m, mode) {
  if (solving || intro < 1) return false; if (Q.length > 80) { toast('Too many queued moves — please wait a moment.'); return false; }
  if (mode === 'user') { hist.push(m); redo = []; if (scr && !t0) { t0 = performance.now(); tEnd = 0; } }
  Q.push({ m, mode }); dirty = true; return true; }
const doUndo = () => { if (!hist.length || solving) return; const m = hist.pop(); redo.push(m); Q.push({ m: inv(m), mode: 'undo' }); dirty = true; };
const doRedo = () => { if (!redo.length || solving) return; const m = redo.pop(); hist.push(m); Q.push({ m, mode: 'redo' }); dirty = true; };
function step(now) {
  if (!cur && Q.length) { const it = Q.shift(), sel = select(cubes, n, it.m); if (!sel.length) return; cur = { it, sel, t: now, d: dur() }; sel.forEach(c => pivot.add(c.g)); }
  if (!cur && !Q.length && solving) { if (stopFlag) endSolve('stopped'); else if (hist.length) Q.push({ m: inv(hist[hist.length - 1]), mode: 'solve' }); else endSolve('done'); }
  if (!cur) return;
  const k = Math.min(1, (now - cur.t) / cur.d), m = cur.it.m;
  pivot.rotation.set(0, 0, 0); pivot.rotation['xyz'[FACES[m.f][0]]] = angleSign(m) * Math.abs(m.t) * Math.PI / 2 * ease(k);
  if (k < 1) return;
  pivot.rotation.set(0, 0, 0); cur.sel.forEach(c => root.add(c.g)); commit(cur.sel, m); cur.sel.forEach(place);   // exact integer snap
  const it = cur.it; cur = null; sfx.turn(); buzz(6); dirty = true;
  if (it.mode === 'solve') { hist.pop(); solveDone++; }
  if (after) { const f = after; after = null; f(); return; }
  if (!Q.length && !solving && scr && isSolved()) win();
}
function win() { scr = false; tEnd = performance.now(); burst(); pulse = 1; sfx.win(); buzz([30, 40, 70]); toast(`Solved! ${movesN()} moves · ${fmt(tEnd - (t0 || tEnd))}`); onSolved(); }
function shuffle(ms0) { if (locked()) return; const ms = ms0 || scramble(n, S.shuf); hist.push(...ms); base = hist.length; redo = []; t0 = tEnd = 0; scr = true;
  ms.forEach(m => Q.push({ m, mode: 'shuf' })); dirty = true; toast('Shuffling…'); }
function hard(sz) { Q = []; const f = () => { build(sz); hist = []; redo = []; base = 0; t0 = tEnd = 0; scr = false; depth = 1; intro = 0; dirty = true; };
  if (cur) after = f; else f(); }
function solve() {
  if (solving || locked()) return; if (isSolved()) return toast('The cube is already solved.');
  if (!hist.length) return err('This cube has no recorded moves to reverse. Use Reset to restore it.');
  solving = true; stopFlag = false; solveTotal = hist.length; solveDone = 0; $('#app').classList.add('solving'); $('#ai').classList.add('on'); $('#aic').textContent = 'Reversing recorded moves…'; }
function endSolve(r) { solving = false; $('#app').classList.remove('solving'); $('#ai').classList.remove('on');
  if (r === 'stopped') return toast('Solving stopped. The cube stays as it is — keep playing or press AI Solve to continue.');
  if (isSolved()) { scr = false; tEnd = performance.now(); burst(); pulse = 1; sfx.win(); buzz([30, 40, 70]); toast(`Solved and verified in ${solveDone} moves.`); }
  else err('Verification failed: the cube is not solved. Please use Reset.'); }

/* ---------- camera ---------- */
let th = .75, ph = 1.12, tth = th, tph = ph, zoom = 1, fit = 9, dist = 14;
const clampPh = v => Math.min(Math.PI - .12, Math.max(.12, v)), setZoom = z => zoom = Math.min(1.7, Math.max(.62, z));
const stage = $('#stage'), cv = $('#gl');
function resize() { const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, [1, 1.5, 2][S.quality])); renderer.setSize(w, h, false);
  cam.aspect = w / h; cam.updateProjectionMatrix(); fit = 8.6 / Math.min(1, cam.aspect); }
new ResizeObserver(resize).observe(stage);
function view(t, p) { tth = t + 2 * Math.PI * Math.round((th - t) / (2 * Math.PI)); tph = p; }
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function proj(v) { const q = v.clone().project(cam); return [(q.x + 1) / 2 * stage.clientWidth, (1 - q.y) / 2 * stage.clientHeight]; }
function pick(e) { const r = cv.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, cam);
  const hs = ray.intersectObjects(root.children.filter(o => o !== pivot), true); if (!hs.length) return null;
  const h = hs[0]; let o = h.object; while (o && !o.userData.c) o = o.parent; if (!o) return null;
  const nv = h.face.normal.clone().transformDirection(h.object.matrixWorld), g = i => Math.abs(nv.getComponent(i));
  const na = [0, 1, 2].reduce((a, b) => g(b) > g(a) ? b : a); return { c: o.userData.c, na, ns: Math.sign(nv.getComponent(na)), pt: h.point.clone() }; }
function dragMove(h, tx, ty) {                                       // turn a layer only if the drag clearly follows one grid direction
  const p0 = proj(h.pt), L = Math.hypot(tx, ty); let best = null;
  for (let t = 0; t < 3; t++) { if (t === h.na) continue; const q = h.pt.clone(); q.setComponent(t, q.getComponent(t) + .5);
    const p1 = proj(q), vx = p1[0] - p0[0], vy = p1[1] - p0[1], cs = (vx * tx + vy * ty) / ((Math.hypot(vx, vy) || 1) * L);
    if (!best || Math.abs(cs) > Math.abs(best.cs)) best = { t, cs }; }
  if (!best || Math.abs(best.cs) < .8) return null;
  const a = 3 - h.na - best.t, ea = [0, 0, 0], en = [0, 0, 0]; ea[a] = 1; en[h.na] = h.ns;
  const cr = [ea[1] * en[2] - ea[2] * en[1], ea[2] * en[0] - ea[0] * en[2], ea[0] * en[1] - ea[1] * en[0]];
  const s = Math.sign(best.cs) * cr[best.t], idx = (n - 1 - h.c.p[a]) / 2, sg = idx * 2 <= n - 1 ? 1 : -1, i2 = sg > 0 ? idx : n - 1 - idx;
  return { f: FL[a * 2 + (sg > 0 ? 0 : 1)], d: i2 + 1, w: false, t: s * (sg > 0 ? -1 : 1) }; }
const ptrs = new Map(); let dr = null, pd = 0;
cv.addEventListener('pointerdown', e => { if (e.button > 0) return; cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size === 2) { dr = null; const [a, b] = [...ptrs.values()]; pd = Math.hypot(a[0] - b[0], a[1] - b[1]); return; }
  dr = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, hit: locked() ? null : pick(e), done: false }; });
cv.addEventListener('pointermove', e => { if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pd) setZoom(zoom * pd / d); pd = d; return; }
  if (!dr || dr.done) return; const dx = e.clientX - dr.lx, dy = e.clientY - dr.ly; dr.lx = e.clientX; dr.ly = e.clientY;
  if (dr.hit) { const tx = e.clientX - dr.x, ty = e.clientY - dr.y; if (Math.hypot(tx, ty) < 14 / Math.min(1.6, S.sens)) return;
    const m = dragMove(dr.hit, tx, ty); dr.hit = null; if (m) { dr.done = true; play(m, 'user'); return; } }
  tth -= dx * .0065 * S.sens; tph = clampPh(tph - dy * .0065 * S.sens); });
const up = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pd = 0; if (!ptrs.size) dr = null; };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
cv.addEventListener('wheel', e => { e.preventDefault(); setZoom(zoom * Math.exp(e.deltaY * .0012)); }, { passive: false });

/* ---------- VFX ---------- */
const fx = [];
function burst() { if (S.fx === false) return; const N = 170, pos = new Float32Array(N * 3), vel = [];
  for (let i = 0; i < N; i++) { const a = Math.random() * 6.283, b = Math.acos(2 * Math.random() - 1), sp = 1.6 + Math.random() * 3;
    vel.push([Math.sin(b) * Math.cos(a) * sp, Math.cos(b) * sp, Math.sin(b) * Math.sin(a) * sp]); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ size: .075, color: 0xffe3a3, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(p); fx.push({ p, g, m, vel, t: 0 }); }

/* ---------- UI ---------- */
const fmt = ms => { const s = ms / 1000 | 0; return (s / 60 | 0) + ':' + String(s % 60).padStart(2, '0'); };
const NAMES = { F: 'Front', R: 'Right', U: 'Up', L: 'Left', D: 'Down', B: 'Back' };
const fc = $('#faces');
for (const f of 'FRULDB') for (const p of [0, 1]) { const b = document.createElement('button'); b.textContent = f + (p ? '′' : ''); b.dataset.f = f; b.dataset.p = p;
  b.setAttribute('aria-label', `${NAMES[f]} ${p ? 'counter-clockwise' : 'clockwise'}`); b.title = `${NAMES[f]} ${p ? 'counter-clockwise' : 'clockwise'} (${f}${p ? "'" : ''})`; fc.append(b); }
const mv = (f, s) => { sfx.btn(); play({ f, d: depth, w: wide && depth > 1, t: half ? 2 : s }, 'user'); };
fc.onclick = e => { const b = e.target.closest('button'); if (b) mv(b.dataset.f, b.dataset.p === '1' ? -1 : 1); };
const setDepth = d => { depth = Math.min(dmax(), Math.max(1, d)); dirty = true; };
$('#dm').onclick = () => setDepth(depth - 1); $('#dpl').onclick = () => setDepth(depth + 1);
$('#wide').onclick = e => { wide = !wide; e.currentTarget.setAttribute('aria-pressed', wide); };
$('#half').onclick = e => { half = !half; e.currentTarget.setAttribute('aria-pressed', half); };
$('#undo').onclick = () => { sfx.btn(); doUndo(); }; $('#redo').onclick = () => { sfx.btn(); doRedo(); };
$('#shuf').onclick = () => { sfx.btn(); shuffle(); }; $('#solve').onclick = () => { sfx.btn(); solve(); };
$('#stop').onclick = () => { stopFlag = true; $('#aic').textContent = 'Stopping after the current move…'; };
$('#zin').onclick = () => setZoom(zoom * .86); $('#zout').onclick = () => setZoom(zoom * 1.16); $('#vreset').onclick = () => { view(.75, 1.12); setZoom(1); };
function ui() { $('#mv').textContent = movesN(); $('#tm').textContent = fmt(t0 ? (tEnd || performance.now()) - t0 : 0);
  $('#undo').disabled = !hist.length || solving; $('#redo').disabled = !redo.length || solving;
  $('#dp').textContent = depth; $('#dm').disabled = depth <= 1; $('#dpl').disabled = depth >= dmax(); $('.lay').hidden = n === 2; $('#wide').hidden = n < 4;
  if (solving) { $('#aib').style.width = (solveTotal ? solveDone / solveTotal * 100 : 0) + '%'; if (!stopFlag) $('#aic').textContent = `${solveDone} done · ${Math.max(0, solveTotal - solveDone)} remaining`; }
  if (dirty) { dirty = false; $('#hist').textContent = hist.length ? hist.slice(-150).map(tok).join(' ') : 'No moves yet.'; } }
function seg(id, k, cast, fn) { const el = $(id), mark = () => [...el.children].forEach(b => b.setAttribute('aria-pressed', String(cast(b.dataset.v) === S[k])));
  el.onclick = e => { const b = e.target.closest('button'); if (!b) return; sfx.btn(); fn(cast(b.dataset.v)); mark(); }; mark(); }
const setSize = v => { if (v === n) return; if (solving) return err('Stop AI Solve before changing the cube size.'); if (hist.length && !confirm('Switching size starts a new cube and clears your move history. Continue?')) return; S.size = v; save(); hard(v); };
seg('#sizes', 'size', Number, setSize);
seg('#shufs', 'shuf', Number, v => { S.shuf = v; save(); });
seg('#themes', 'theme', String, v => { S.theme = v; save(); document.documentElement.dataset.theme = v; });
seg('#qual', 'quality', Number, v => { S.quality = v; save(); resize(); });
const rng = (id, k) => { const el = $(id); el.value = S[k]; el.oninput = () => { S[k] = +el.value; save(); }; };
const chk = (id, k) => { const el = $(id); el.checked = !!S[k]; el.onchange = () => { S[k] = el.checked; save(); if (k === 'auto' && RM) S.auto = el.checked = false; }; };
rng('#speed', 'speed'); rng('#sens', 'sens'); rng('#damp', 'damp'); chk('#auto', 'auto'); chk('#snd', 'sound'); chk('#hap', 'haptic');
$('#views').onclick = e => { const b = e.target.closest('button'); if (!b) return; sfx.btn(); const v = b.dataset.v;
  if (v === 'U') view(tth, .18); else if (v === 'D') view(tth, Math.PI - .18); else view({ F: 0, R: Math.PI / 2, B: Math.PI, L: -Math.PI / 2 }[v], 1.3); closeMenu(); };
$('#reset').onclick = () => { if (solving) return err('Stop AI Solve before resetting.'); if (hist.length && !confirm('Reset to a solved cube? Your move history will be cleared.')) return; hard(n); closeMenu(); };
if (!document.documentElement.requestFullscreen) $('#fs').hidden = true;
$('#fs').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => err('Fullscreen was blocked by the browser.'));
const menu = $('#menu'), scrim = $('#scrim'), mb = $('#menuBtn');
function openMenu() { menu.inert = false; menu.classList.add('on'); scrim.classList.add('on'); mb.setAttribute('aria-expanded', 'true'); setTimeout(() => $('#close').focus(), 60); }
function closeMenu() { if (!menu.classList.contains('on')) return; menu.classList.remove('on'); scrim.classList.remove('on'); menu.inert = true; mb.setAttribute('aria-expanded', 'false'); mb.focus(); }
mb.onclick = openMenu; $('#close').onclick = closeMenu; scrim.onclick = closeMenu;
addEventListener('keydown', e => { const k = e.key.toUpperCase(), tg = e.target; if (tg.matches && tg.matches('input[type=range],select,textarea,input[type=text]')) return;
  if (k === 'ESCAPE') return closeMenu(); if (document.body.dataset.screen !== 'game' || menu.classList.contains('on') || tg.matches('input[type=file]')) return;
  if ((e.ctrlKey || e.metaKey) && (k === 'Z' || k === 'Y')) { e.preventDefault(); (k === 'Y' || e.shiftKey) ? doRedo() : doUndo(); return; }
  if (!e.ctrlKey && !e.metaKey && !e.altKey && k.length === 1 && FL.includes(k) && !(e.target.tagName === 'BUTTON' && e.key === ' ')) { e.preventDefault(); mv(k, e.shiftKey ? -1 : 1); } });

/* ---------- custom image ---------- */
let pend = null, imgFace = 'ALL', fitMode = 'cover';
function drawFit(img, mode, sz) { const c = document.createElement('canvas'); c.width = c.height = sz; const g = c.getContext('2d'); g.fillStyle = '#101216'; g.fillRect(0, 0, sz, sz);
  const w = img.naturalWidth, h = img.naturalHeight; let dw = sz, dh = sz;
  if (mode === 'cover') { const s = Math.max(sz / w, sz / h); dw = w * s; dh = h * s; } else if (mode === 'contain') { const s = Math.min(sz / w, sz / h); dw = w * s; dh = h * s; }
  else if (mode === 'center') { const s = sz / 512; dw = w * s; dh = h * s; }
  g.drawImage(img, (sz - dw) / 2, (sz - dh) / 2, dw, dh); return c; }
const prev = () => { if (!pend) return; const g = $('#prev').getContext('2d'); g.clearRect(0, 0, 160, 160); g.drawImage(drawFit(pend, fitMode, 160), 0, 0); };
$('#file').onchange = e => { const f = e.target.files[0]; if (!f) return;
  if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) { e.target.value = ''; return err('Unsupported file. Please choose a PNG, JPEG or WebP image.'); }
  if (f.size > 15e6) { e.target.value = ''; return err('That image is too large (15 MB maximum).'); }
  const url = URL.createObjectURL(f), im = new Image();
  im.onload = () => { URL.revokeObjectURL(url); pend = im; prev(); $('#apply').disabled = false; toast('Image loaded — choose faces and press Apply.'); };
  im.onerror = () => { URL.revokeObjectURL(url); err('This image could not be read. Try a different file.'); }; im.src = url; };
$('#imgf').onclick = e => { const b = e.target.closest('button'); if (!b) return; imgFace = b.dataset.v; [...$('#imgf').children].forEach(x => x.setAttribute('aria-pressed', x === b)); };
$('#fit').onclick = e => { const b = e.target.closest('button'); if (!b) return; fitMode = b.dataset.v; [...$('#fit').children].forEach(x => x.setAttribute('aria-pressed', x === b)); prev(); };
[...$('#imgf').children][0].setAttribute('aria-pressed', 'true'); [...$('#fit').children][0].setAttribute('aria-pressed', 'true');
$('#apply').onclick = () => { if (!pend || solving) return; const c = drawFit(pend, fitMode, 512);
  (imgFace === 'ALL' ? [0, 1, 2, 3, 4, 5] : [FL.indexOf(imgFace)]).forEach(k => imgCv[k] = c);
  applyImages(); toast(imgFace === 'ALL' ? 'Image applied to all faces.' : `Image applied to the ${NAMES[imgFace]} face.`); closeMenu(); };
$('#rm').onclick = () => { imgCv = [null, null, null, null, null, null]; applyImages(); toast('Standard colours restored.'); };

/* ---------- loop ---------- */
let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame); const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (intro < 1) { intro = Math.min(1, intro + dt / (RM ? .2 : .9)); const e = 1 - Math.pow(1 - intro, 3); root.scale.setScalar(.55 + .45 * e); root.rotation.y = (1 - e) * -1.2; if (intro >= 1) { root.scale.setScalar(1); root.rotation.set(0, 0, 0); } }
  step(now);
  if (pulse > 0) { pulse = Math.max(0, pulse - dt / .7); root.scale.setScalar(1 + .06 * Math.sin(pulse * Math.PI)); }
  if ((S.auto || menuSpin) && !RM && !ptrs.size) tth += dt * .3;
  const k = 1 - Math.pow(1 - S.damp, dt * 60); th += (tth - th) * k; ph += (tph - ph) * k;
  dist += (fit * zoom * (intro < 1 ? 1.25 - .25 * intro : 1) - dist) * Math.min(1, k * 1.4);
  cam.position.set(dist * Math.sin(ph) * Math.sin(th), dist * Math.cos(ph), dist * Math.sin(ph) * Math.cos(th)); cam.lookAt(0, 0, 0);
  for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t += dt; const p = f.g.attributes.position, d = Math.pow(.04, dt);
    for (let j = 0; j < f.vel.length; j++) { const v = f.vel[j]; v[0] *= d; v[1] *= d; v[2] *= d; p.setXYZ(j, p.getX(j) + v[0] * dt, p.getY(j) + v[1] * dt, p.getZ(j) + v[2] * dt); }
    p.needsUpdate = true; f.m.opacity = Math.max(0, 1 - f.t / 1.4); if (f.t > 1.4) { scene.remove(f.p); f.g.dispose(); f.m.dispose(); fx.splice(i, 1); } }
  acc += dt; if (acc > .1 || dirty) { acc = 0; ui(); }
  renderer.render(scene, cam);
}
/* ---------- CUBE X v2: cinematic boot, screens, modes, stats ---------- */
{
const B = document.body, ux = $('#ux');
const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} return null; };
const ST0 = () => ({ solves: 0, ms: 0, moves: 0, sess: 0, best: {}, daily: {} });
let booting = true, mode = '', NAME = LS('cubexName') || '', ST = ST0();
try { ST = { ...ST0(), ...JSON.parse(LS('cubexStats') || '{}') }; } catch (e) {}
const saveST = () => LS('cubexStats', JSON.stringify(ST));
const bootSnd = S.sound; S.sound = false; B.classList.add('booting');
if (S.hud === false) B.classList.add('nohud'); shadow.visible = S.shadow !== false;
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = f => new Promise(r => { const t = () => f() ? r() : setTimeout(t, 40); t(); });
const fmt2 = ms => { const q = ms / 1000; return (q / 60 | 0) + ':' + (q % 60).toFixed(2).padStart(5, '0'); };
const MODES = { training: 'TRAINING', speed: 'SPEEDRUN', daily: 'DAILY', explorer: 'EXPLORER' };
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const hash = q => { let h = 1779033703 ^ q.length; for (let i = 0; i < q.length; i++) { h = Math.imul(h ^ q.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; } return h >>> 0; };
const mulberry = a => () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

/* modal */
const ask = (t, p, btns) => { $('#mdlT').textContent = t; $('#mdlP').innerHTML = p; const bx = $('#mdlB'); bx.textContent = '';
  btns.forEach(([l, c, f]) => { const b = document.createElement('button'); b.textContent = l; b.className = c || ''; b.onclick = () => { $('#mdl').hidden = true; if (f) f(); }; bx.append(b); }); $('#mdl').hidden = false; };

/* navigation */
const marks = [];
function go(s) { ux.querySelectorAll('.scr').forEach(e => e.classList.toggle('on', e.id === 's-' + s)); B.dataset.screen = s; menuSpin = s !== 'game';
  if (s === 'stats') renderStats(); if (s === 'set') marks.forEach(f => f()); if (s === 'home') $('#whoami').textContent = NAME; }
ux.onclick = e => { const b = e.target.closest('[data-go]'); if (b) { sfx.btn(); return go(b.dataset.go); }
  const m = e.target.closest('[data-mode]'); if (m && !m.disabled) { sfx.btn(); startMode(m.dataset.mode); } };
$('#crname').innerHTML = 'RUbixoWH1'.split('').map((c, i) => `<span style="--i:${i}">${c}</span>`).join('');

/* player name */
const clean = v => v.replace(/\s+/g, ' ').trim();
const nameErr = v => v.length < 2 ? 'Use at least 2 characters.' : v.length > 16 ? 'Maximum 16 characters.' : /^[\p{L}\p{N} _.\-]+$/u.test(v) ? '' : 'Only letters, numbers, spaces and _ . - are allowed.';
function setName(v, el) { v = clean(v); const e = nameErr(v); el.textContent = e; if (e) { err(e); return false; } NAME = v; LS('cubexName', v); $('#pn').textContent = v; $('#nm2').value = v; return true; }
$('#nok').onclick = () => { if (setName($('#nm').value, $('#nerr'))) { sfx.btn(); go('home'); } };
$('#nm').onkeydown = e => { if (e.key === 'Enter') $('#nok').click(); };
$('#nsave').onclick = () => { if (setName($('#nm2').value, $('#nerr2'))) toast('Player name updated.'); };

/* modes */
async function startMode(m) {
  if (solving) return; mode = m; B.dataset.mode = m; $('#modeLbl').textContent = MODES[m]; go('game');
  if (m === 'explorer') return toast('Explorer: free play, no clock.');
  hard(S.size); seg('#sizes', 'size', Number, setSize); await until(() => intro >= 1 && !cur);
  const sz = n; shuffle(m === 'daily' ? scramble(sz, 25, mulberry(hash(today() + sz))) : null);
  if (m === 'training') { ST.sess++; saveST(); }
  toast(m === 'daily' ? `Daily challenge ${today()} · ${sz}×${sz}` : m === 'speed' ? 'Timer starts on your first move.' : 'Scrambled — good luck!');
}
$('#homeBtn').onclick = () => { if (solving) return err('Stop AI Solve first.'); sfx.btn();
  if (scr && t0 && !tEnd && (mode === 'speed' || mode === 'daily')) ask('Abandon this run?', 'The timer is running. Leaving ends this attempt.', [['Keep playing'], ['Leave', 'danger', () => { hard(n); go('home'); }]]); else go('home'); };
onSolved = () => { if (booting || !mode || !t0) return; const t = tEnd - t0, mv = movesN(), k = mode + n; ST.solves++; ST.ms += t; ST.moves += mv; let pb = false;
  if (mode === 'speed' || mode === 'daily') { if (!ST.best[k] || t < ST.best[k]) { ST.best[k] = t; pb = true; } if (mode === 'daily') ST.daily[today()] = Math.min(ST.daily[today()] || 1e12, t); }
  saveST(); if (mode === 'speed' || mode === 'daily') { if (pb) sfx.win(); setTimeout(() => ask(pb ? 'NEW PERSONAL BEST' : 'SOLVED!', `<div class="big2">${fmt2(t)}</div>${n}×${n}×${n} · ${mv} moves<br>${NAME}${!pb && ST.best[k] ? ' · best ' + fmt2(ST.best[k]) : ''}`, [['Try again', 'pri', () => startMode(mode)], ['Main menu', '', () => go('home')]]), 900); } };

/* statistics */
function renderStats() { const r = [['Total solves', ST.solves], ['Average time', ST.solves ? fmt2(ST.ms / ST.solves) : '—'], ['Total moves', ST.moves], ['Training sessions', ST.sess], ['Daily challenges', Object.keys(ST.daily).length]];
  Object.entries(ST.best).sort().forEach(([k, v]) => { const z = k.replace(/\D/g, ''); r.push([(k[0] === 's' ? 'Speedrun ' : 'Daily ') + z + '×' + z, fmt2(v)]); });
  $('#statbox').innerHTML = ST.solves || ST.sess ? r.map(([a, b]) => `<div class="sr"><span>${a}</span><b>${b}</b></div>`).join('') : '<p class="empty">No data yet. Solve a cube in any mode and your real stats will appear here.</p>'; }

/* settings (every control writes S and does something) */
const CFG = [['Graphics', [['seg', 'quality', 'Render quality', [[0, 'Low'], [1, 'Medium'], [2, 'High']], Number, () => resize()], ['chk', 'shadow', 'Cube shadow', v => shadow.visible = v], ['chk', 'fx', 'Particle effects']]],
  ['Cube', [['seg', 'size', 'Default cube size', [[2, '2×2'], [3, '3×3'], [6, '6×6'], [8, '8×8']], Number, v => toast(`Default ${v}×${v} — used for new games.`)], ['rng', 'speed', 'Animation speed', .5, 2.5, .1], ['rng', 'sens', 'Rotation sensitivity', .5, 2, .1], ['seg', 'shuf', 'Scramble length', [[10, 'Short'], [25, 'Normal'], [50, 'Long']], Number]]],
  ['Audio & feel', [['chk', 'sound', 'Sound effects'], ['chk', 'haptic', 'Haptic feedback']]],
  ['Interface', [['chk', 'hud', 'Show timer & moves', v => B.classList.toggle('nohud', !v)], ['chk', 'notif', 'Show notifications']]]];
CFG.forEach(([title, items]) => { const card = document.createElement('div'); card.className = 'glass pad sc'; card.innerHTML = `<h2>${title}</h2>`;
  items.forEach(it => { const [t, k, lb] = it, row = document.createElement('div'); row.className = 'row';
    if (t === 'seg') { const [, , , o, cast, fn] = it; row.innerHTML = `<span>${lb}</span><div class="seg">${o.map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</div>`;
      const sg = row.lastChild, mk = () => [...sg.children].forEach(x => x.setAttribute('aria-pressed', String(cast(x.dataset.v) === S[k])));
      sg.onclick = e => { const x = e.target.closest('button'); if (!x) return; sfx.btn(); S[k] = cast(x.dataset.v); save(); mk(); if (fn) fn(S[k]); if (k !== 'size') toast('Setting saved.'); }; marks.push(mk); }
    else if (t === 'rng') { const [, , , lo, hi, st] = it; row.innerHTML = `<span>${lb}</span><input type="range" min="${lo}" max="${hi}" step="${st}">`; const inp = row.lastChild;
      inp.oninput = () => { S[k] = +inp.value; save(); }; inp.onchange = () => toast('Setting saved.'); marks.push(() => inp.value = S[k]); }
    else { const fn = it[3]; row.className = 'row sw'; row.innerHTML = `<span>${lb}</span><input type="checkbox">`; const inp = row.lastChild;
      inp.onchange = () => { S[k] = inp.checked; save(); if (fn) fn(S[k]); toast('Setting saved.'); }; marks.push(() => inp.checked = S[k] !== false); }
    card.append(row); }); $('#dcard').before(card); });
$('#rstats').onclick = () => ask('Reset statistics?', 'All local solves, records and daily history on this device will be erased.', [['Cancel'], ['Erase statistics', 'danger', () => { ST = ST0(); saveST(); toast('Statistics reset.'); }]]);
$('#rall').onclick = () => ask('Reset ALL local data?', 'Settings, player name and statistics on this device will be erased and the page will reload.', [['Cancel'], ['Erase everything', 'danger', () => { ['cubex', 'cubexName', 'cubexStats'].forEach(k => LS(k, null)); location.reload(); }]]);

/* cinematic boot: the AI really scrambles, then the cube is really solved (verified) */
const lb = $('#lbar'), lm = $('#loadmsg'), lp = $('#lpct');
const prog = (p, t) => { lb.style.width = p + '%'; lp.textContent = Math.round(p) + '%'; if (t) lm.textContent = t; };
function finishBoot() { if (!booting) return; booting = false; S.sound = bootSnd; solving = false; stopFlag = false; $('#app').classList.remove('solving'); $('#ai').classList.remove('on');
  hard(S.size); B.classList.remove('booting'); $('#load').classList.add('done'); $('#pn').textContent = NAME; $('#nm2').value = NAME;
  if (NAME) go('home'); else { go('reg'); setTimeout(() => $('#nm').focus(), 700); } }
async function boot() {
  try {
    prog(6, 'INITIALIZING CUBE X'); while (booting && intro < 1) await wait(40); prog(14); await wait(350);
    if (!booting) return; prog(16, 'AI SCRAMBLING CUBE'); const sh = S.shuf; S.shuf = 12; shuffle(); S.shuf = sh;
    while (booting && (cur || Q.length)) { prog(16 + (1 - (Q.length + (cur ? 1 : 0)) / 12) * 30); await wait(60); }
    if (!booting) return; prog(48, 'ANALYZING CUBE STATE'); await wait(750);
    if (!booting) return; prog(55, 'HUMAN SOLVING SEQUENCE'); solve();
    while (booting && solving) { prog(55 + (solveTotal ? solveDone / solveTotal : 0) * 42); await wait(60); }
    if (booting && !isSolved()) throw new Error('boot verify');
    prog(100, 'SYSTEM READY'); await wait(800);
  } catch (e) {}
  finishBoot();
}
$('#skip').onclick = finishBoot; setTimeout(finishBoot, 30000);
document.addEventListener('visibilitychange', () => { if (document.hidden) { stopFlag = false; } });
build(3); resize(); ui(); requestAnimationFrame(frame); boot();
}

})();
