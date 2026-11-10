// alexsue.com/xmas26: the Sue family's 2026 card. The printed card sits under a 3D tree of the
// year's photos. Ported from the design draft (merryroll repo: plans/xmas26-design.html); the scene
// code is unchanged, and the data now comes from the MerryRoll API (data.js).
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import "./style.css";
import { initAnalytics } from "../analytics.js";
import { API_BASE, YEAR, fetchCard, photosFromApi, cardFaces, dayOf, previewLabel } from "./data.js";
import { HAND, DISPLAY, BODY, SAMPLE_PHOTOS, paintSample, sampleCard, rng, hash, lin, drawCover, sizeOf } from "./samples.js";

initAnalytics();

const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// The day a photo was taken. A photo without a date goes at the end of the year.
const dateOf = (p) => p.date || (p.date = dayOf(p.takenAt) ?? new Date(YEAR, 11, 31));
const fmtDate = (p) => `${MONTHS[dateOf(p).getMonth()]} ${dateOf(p).getDate()}`;

function fitFont(c, text, family, size, maxW) {
  let s = size; c.font = `${s}px ${family}`;
  while (s > 14 && c.measureText(text).width > maxW) { s -= 2; c.font = `${s}px ${family}`; }
}
const fullSrc = (p) => p.url || p.full || (p.full = p.source.toDataURL ? p.source.toDataURL("image/jpeg", 0.9) : p.source.src);

// A polaroid: photo on top, the place hand-written underneath, the month in the corner.
const PW = 256, PH = 312;
function polaroidCanvas(p) {
  const cv = document.createElement("canvas"); cv.width = PW; cv.height = PH;
  const c = cv.getContext("2d"), pad = 14, sz = PW - pad * 2;
  c.fillStyle = lin(c, 0, 0, PW, PH, [[0, "#faf6ee"], [1, "#ece4d4"]]); c.fillRect(0, 0, PW, PH);
  drawCover(c, p.source, pad, pad, sz, sz);
  c.strokeStyle = "rgba(0,0,0,0.12)"; c.strokeRect(pad + 0.5, pad + 0.5, sz - 1, sz - 1);
  const mid = pad + sz + (PH - pad - sz) / 2 + 2, month = MONTHS[dateOf(p).getMonth()];
  c.textBaseline = "middle"; c.fillStyle = "#8a5a2b"; c.textAlign = "right"; c.font = `26px ${HAND}`; c.fillText(month, PW - pad - 2, mid + 2);
  const monthW = c.measureText(month).width;
  c.fillStyle = "#26211a"; c.textAlign = "left"; fitFont(c, p.place || "", HAND, 36, sz - monthW - 14); c.fillText(p.place || "", pad + 2, mid);
  return cv;
}

// ---------------------------------------------------------------------------------------------
// Three.js scene
// ---------------------------------------------------------------------------------------------
const canvas = $("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x08130f, 0.032);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 100);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enablePan = false;
controls.minDistance = 1.6; controls.maxDistance = 16; controls.minPolarAngle = 0.5; controls.maxPolarAngle = 1.85;
controls.autoRotateSpeed = 0.55;

scene.add(new THREE.AmbientLight(0xfff1dc, 0.85));
const key = new THREE.DirectionalLight(0xffe2b0, 0.9); key.position.set(3, 5, 4); scene.add(key);
const rim = new THREE.DirectionalLight(0x7fc7ff, 0.35); rim.position.set(-4, 2, -3); scene.add(rim);

// The tree: a cone that the photos spiral up, Jan at the bottom, Dec at the top.
const TREE_B = -0.2, TREE_T = 3.3, R_B = 1.95, R_T = 0.2;
const CARD_Y = -1.12, CARD_H = 1.1;
const TOP_Y = TREE_T + 0.85, BOTTOM_Y = CARD_Y - CARD_H / 2 - 0.2, CONTENT_W = R_B * 2 + 0.5;

function helixPoint(t, turns, rScale = 1, yShift = 0) {
  const y = Math.min(TREE_T, TREE_B + t * (TREE_T - TREE_B) + yShift);
  const tt = (y - TREE_B) / (TREE_T - TREE_B);
  const r = (R_B + (R_T - R_B) * tt) * rScale, th = t * turns * Math.PI * 2;
  return { x: r * Math.sin(th), y, z: r * Math.cos(th), th };
}
function helixLength(turns, n = 600) {
  let len = 0, prev = helixPoint(0, turns);
  for (let i = 1; i <= n; i++) { const p = helixPoint(i / n, turns); len += Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z); prev = p; }
  return len;
}

const glowTex = (() => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 64; const c = cv.getContext("2d");
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.25, "rgba(255,255,255,0.75)"); g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
})();

let photos = [], pols = [], tree = null, garland = null, star = null, card = null, cardMesh = null;
const paperMat = new THREE.MeshLambertMaterial({ color: 0xe9e2d4 });

function disposeTree(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose();
    [].concat(o.material || []).forEach((m) => { if (m !== paperMat) { if (m.map && m.map !== glowTex) m.map.dispose(); m.dispose(); } });
  });
}

function buildTree(list) {
  if (tree) { scene.remove(tree); disposeTree(tree); }
  tree = new THREE.Group(); scene.add(tree);
  pols = [];
  const N = list.length;
  const size = THREE.MathUtils.clamp(1 - (N - 30) / 110, 0.55, 1);
  const spacing = 0.66 * size;
  let turns = 1.6;
  while (turns < 7.5 && helixLength(turns) < N * spacing) turns += 0.1;

  // Equal spacing along the helix, so the top isn't crowded.
  const S = 1500, cum = [0];
  let prev = helixPoint(0, turns);
  for (let i = 1; i <= S; i++) { const p = helixPoint(i / S, turns); cum.push(cum[i - 1] + Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z)); prev = p; }
  const total = cum[S];
  const geo = new THREE.BoxGeometry(0.42, 0.42 * (PH / PW), 0.005);

  let j = 0;
  list.forEach((photo, i) => {
    const target = ((i + 0.5) / N) * total;
    while (j < S && cum[j] < target) j++;
    const t = j / S, p = helixPoint(t, turns);
    const tex = new THREE.CanvasTexture(polaroidCanvas(photo));
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const front = new THREE.MeshBasicMaterial({ map: tex });
    const mesh = new THREE.Mesh(geo, [paperMat, paperMat, paperMat, paperMat, front, paperMat]);
    mesh.position.set(p.x, p.y, p.z);
    mesh.lookAt(p.x * 2, p.y, p.z * 2);
    mesh.rotateX(-0.2);
    const r = rng(hash(photo.id));
    mesh.rotateZ((r() - 0.5) * 0.24);
    const scale = size * (1 - 0.3 * t);
    mesh.scale.setScalar(scale);
    mesh.userData.index = i;
    tree.add(mesh);
    pols.push({ mesh, photo, theta: p.th, y: p.y, t, home: { pos: mesh.position.clone(), quat: mesh.quaternion.clone(), scale }, boost: 1, delay: 1.05 + (i / Math.max(1, N - 1)) * 2.3 });
  });

  // Fairy lights on their own strand, half a turn-pitch above the photos.
  const pitch = (TREE_T - TREE_B) / turns, L = Math.round(turns * 40);
  const pos = new Float32Array(L * 3), col = new Float32Array(L * 3), base = new Float32Array(L * 3), meta = [];
  const palette = [[1, 0.72, 0.36], [1, 0.86, 0.62], [1, 0.72, 0.36], [0.95, 0.35, 0.3], [0.55, 0.9, 0.75], [1, 0.95, 0.85]];
  const lr = rng(7);
  const wire = [];
  for (let k = 0; k < L; k++) {
    const p = helixPoint(k / (L - 1), turns, 0.97, pitch * 0.5);
    pos.set([p.x, p.y, p.z], k * 3);
    const pc = palette[Math.floor(lr() * palette.length)]; base.set(pc, k * 3);
    meta.push({ phase: lr() * Math.PI * 2, speed: 1.2 + lr() * 2.4, h: (p.y - TREE_B) / (TREE_T - TREE_B) });
  }
  for (let k = 0; k <= 400; k++) { const p = helixPoint(k / 400, turns, 0.97, pitch * 0.5); wire.push(new THREE.Vector3(p.x, p.y, p.z)); }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute("position", new THREE.BufferAttribute(pos, 3)); lg.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const points = new THREE.Points(lg, new THREE.PointsMaterial({ size: 0.13, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  tree.add(points);
  tree.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(wire), new THREE.LineBasicMaterial({ color: 0x2c4a36, transparent: true, opacity: 0.7 })));
  garland = { points, col, base, meta };

  // A haze of needles so the cone reads as a tree between the photos.
  const D = 1800, dp = new Float32Array(D * 3), dc = new Float32Array(D * 3), dr = rng(11);
  for (let k = 0; k < D; k++) {
    const tt = Math.pow(dr(), 0.8), y = TREE_B - 0.15 + tt * (TREE_T - TREE_B + 0.2);
    const rad = (R_B + (R_T - R_B) * Math.min(1, Math.max(0, (y - TREE_B) / (TREE_T - TREE_B)))) * Math.sqrt(dr()) * 0.92, a = dr() * Math.PI * 2;
    dp.set([rad * Math.sin(a), y, rad * Math.cos(a)], k * 3);
    const g = 0.25 + dr() * 0.3; dc.set([0.12 * g, 0.55 * g, 0.32 * g], k * 3);
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute("position", new THREE.BufferAttribute(dp, 3)); dg.setAttribute("color", new THREE.BufferAttribute(dc, 3));
  tree.add(new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.06, map: glowTex, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })));

  // The star.
  const shape = new THREE.Shape();
  for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 + Math.PI / 2, rr = k % 2 ? 0.1 : 0.24; k ? shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  const sg = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 2 }); sg.center();
  star = new THREE.Group(); star.position.set(0, TREE_T + 0.38, 0);
  star.add(new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0xf6c768, emissive: 0xf2a83a, emissiveIntensity: 0.9, metalness: 0.5, roughness: 0.35 })));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc46b, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }));
  halo.scale.setScalar(1.5); star.add(halo);
  tree.add(star);

  // A warm pool of light on the floor, under the card.
  const fl = document.createElement("canvas"); fl.width = fl.height = 128; const fc = fl.getContext("2d");
  const fg = fc.createRadialGradient(64, 64, 0, 64, 64, 64); fg.addColorStop(0, "rgba(255,190,110,0.55)"); fg.addColorStop(1, "rgba(255,190,110,0)"); fc.fillStyle = fg; fc.fillRect(0, 0, 128, 128);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(fl), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = BOTTOM_Y + 0.12; tree.add(floor);
}

// The card: last year's rounded slab, now the present under the tree.
function makeTexture(src) { const t = src.getContext ? new THREE.CanvasTexture(src) : new THREE.Texture(src); t.needsUpdate = true; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; }
function buildCard(frontSrc, backSrc) {
  const keepRot = card ? card.rotation.y : 0;
  if (card) { scene.remove(card); disposeTree(card); }
  const s = sizeOf(frontSrc), aspect = s.w / s.h, h = aspect >= 1 ? CARD_H : CARD_H * 1.25, w = h * aspect;
  const edge = new THREE.MeshStandardMaterial({ color: 0xd1b15a, roughness: 0.4, metalness: 0.3 });
  cardMesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, 0.03, 2, 0.012), [edge, edge, edge, edge,
    new THREE.MeshBasicMaterial({ map: makeTexture(frontSrc) }), new THREE.MeshBasicMaterial({ map: makeTexture(backSrc) })]);
  cardMesh.userData = { card: true, w, h };
  card = new THREE.Group(); card.add(cardMesh); card.position.set(0, CARD_Y + (CARD_H - h) / 2 + (h > CARD_H ? 0.08 : 0), 0); card.rotation.y = keepRot;
  card.userData.baseY = card.position.y;
  scene.add(card);
}

// ---------------------------------------------------------------------------------------------
// Camera framing and motion
// ---------------------------------------------------------------------------------------------
const tanHalf = () => Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
function framing() {
  const w = innerWidth, h = innerHeight, aspect = w / h, narrow = aspect < 0.9;
  const mast = document.querySelector(".mast").getBoundingClientRect(), dock = $("dock").getBoundingClientRect();
  const topRes = narrow ? Math.min(0.4, (mast.bottom + 8) / h) : 0.03, botRes = Math.min(0.3, (h - dock.top + 6) / h);
  const usable = Math.max(0.4, 1 - topRes - botRes);
  const dH = (TOP_Y - BOTTOM_Y) / (usable * 2 * tanHalf());
  const dW = ((CONTENT_W / 2) / (tanHalf() * aspect)) * (narrow ? 0.86 : 1);
  const dist = Math.max(dH, dW), visH = 2 * dist * tanHalf();
  const centerFromTop = (topRes + (1 - botRes)) / 2;
  return { dist, targetY: (TOP_Y + BOTTOM_Y) / 2 + (centerFromTop - 0.5) * visH, polar: 1.42 };
}
function place(targetY, radius, polar, azim) {
  controls.target.set(0, targetY, 0);
  camera.position.set(radius * Math.sin(polar) * Math.sin(azim), targetY + radius * Math.cos(polar), radius * Math.sin(polar) * Math.cos(azim));
  camera.lookAt(controls.target);
}
function current() {
  const off = camera.position.clone().sub(controls.target), r = off.length();
  return { targetY: controls.target.y, radius: r, polar: Math.acos(THREE.MathUtils.clamp(off.y / r, -1, 1)), azim: Math.atan2(off.x, off.z) };
}

const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOut = (p) => 1 - Math.pow(1 - p, 3);
const easeBack = (p) => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const tweens = new Set();
function tween(dur, fn, curve = ease) {
  return new Promise((res) => tweens.add({ t0: performance.now(), dur: REDUCE ? 1 : dur * 1000, fn, curve, res }));
}
function runTweens(now) {
  for (const tw of tweens) { const p = Math.min(1, (now - tw.t0) / tw.dur); tw.fn(tw.curve(p)); if (p >= 1) { tweens.delete(tw); tw.res(); } }
}

let flying = 0;
async function flyTo(to, dur = 1.2) {
  const from = current();
  let dA = to.azim - from.azim; dA = ((((dA + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
  flying++; controls.enabled = false;
  await tween(dur, (k) => place(from.targetY + (to.targetY - from.targetY) * k, from.radius + (to.radius - from.radius) * k, from.polar + (to.polar - from.polar) * k, from.azim + dA * k));
  if (--flying === 0) controls.enabled = introDone;
}
function flyHome(dur = 1.1) { const f = framing(); return flyTo({ ...f, radius: f.dist, azim: current().azim }, dur); }
function flyToPhoto(i, closeness = 0.5) {
  const p = pols[i], f = framing();
  return flyTo({ targetY: p.y, radius: Math.max(2.4, f.dist * closeness), polar: 1.48, azim: p.theta });
}

let idleTimer = 0;
function holdRotation(ms = 7000) {
  controls.autoRotate = false; clearTimeout(idleTimer);
  if (ms > 0 && !REDUCE) idleTimer = setTimeout(() => { if (!overlayOpen()) controls.autoRotate = true; }, ms);
}
controls.addEventListener("start", () => holdRotation());
const overlayOpen = () => !$("lightbox").hidden || !$("collage").hidden;

// ---------------------------------------------------------------------------------------------
// The opening: start on the card, pull back as the photos fly out of it and onto the tree,
// light the strand from the bottom up, then the star.
// ---------------------------------------------------------------------------------------------
let introStart = 0, introDone = false;
const INTRO_END = 4.6;
function startIntro() {
  introDone = false; controls.enabled = false; controls.autoRotate = false;
  introStart = performance.now() - (REDUCE ? 1e6 : 0);
  pols.forEach((p) => (p.mesh.visible = false));
}
const cardQuat = new THREE.Quaternion();
function updateIntro(e) {
  if (introDone) return;
  const f = framing(), aspect = innerWidth / innerHeight;
  const closeR = (0.95 / 0.82) / (tanHalf() * Math.min(aspect, 1.5)) + 0.4;
  const k = ease(clamp01((e - 0.5) / 3.1));
  place(CARD_Y + (f.targetY - CARD_Y) * k, closeR + (f.dist - closeR) * k, 1.53 + (f.polar - 1.53) * k, -0.05 + 0.4 * k);
  const from = new THREE.Vector3(0, CARD_Y, 0.05);
  for (const p of pols) {
    const q = clamp01((e - p.delay) / 1.15);
    if (q <= 0) { p.mesh.visible = false; continue; }
    p.mesh.visible = true;
    const a = easeOut(q), h = p.home.pos;
    const ctrl = new THREE.Vector3(h.x * 1.6, (h.y + CARD_Y) / 2 + 1.2, h.z * 1.6);
    p.mesh.position.set(
      (1 - a) * (1 - a) * from.x + 2 * (1 - a) * a * ctrl.x + a * a * h.x,
      (1 - a) * (1 - a) * from.y + 2 * (1 - a) * a * ctrl.y + a * a * h.y,
      (1 - a) * (1 - a) * from.z + 2 * (1 - a) * a * ctrl.z + a * a * h.z);
    p.mesh.quaternion.slerpQuaternions(cardQuat, p.home.quat, a);
    p.mesh.scale.setScalar(p.home.scale * (0.25 + 0.75 * a));
  }
  if (e >= INTRO_END) finishIntro();
}
function finishIntro() {
  introDone = true;
  for (const p of pols) { p.mesh.visible = true; p.mesh.position.copy(p.home.pos); p.mesh.quaternion.copy(p.home.quat); }
  if (!flying) { const f = framing(), c = current(); place(f.targetY, f.dist, f.polar, c.azim); controls.enabled = true; }
  controls.autoRotate = !REDUCE && !overlayOpen();
}

// ---------------------------------------------------------------------------------------------
// Picking: tap a photo to open it, tap the card to flip it.
// ---------------------------------------------------------------------------------------------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let hover = -1, down = null;
function hit(x, y) {
  const b = canvas.getBoundingClientRect(); ndc.set(((x - b.left) / b.width) * 2 - 1, -((y - b.top) / b.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects([...pols.map((p) => p.mesh).filter((m) => m.visible), cardMesh], false);
  return hits[0]?.object;
}
canvas.addEventListener("pointerdown", (ev) => {
  down = { x: ev.clientX, y: ev.clientY, t: performance.now() };
  if (!introDone) finishIntro();
});
canvas.addEventListener("pointerup", (ev) => {
  if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 7 || performance.now() - down.t > 500) return;
  down = null;
  const o = hit(ev.clientX, ev.clientY);
  if (!o) return;
  if (o.userData.card) showCard(); else openLightbox(o.userData.index);
});
canvas.addEventListener("pointermove", (ev) => {
  if (ev.pointerType !== "mouse") return;
  const o = hit(ev.clientX, ev.clientY);
  hover = o && !o.userData.card ? o.userData.index : -1;
  canvas.classList.toggle("pointing", !!o);
});
canvas.addEventListener("pointerleave", () => { hover = -1; canvas.classList.remove("pointing"); });

let flipping = false;
async function flipCard() {
  if (flipping || !card) return;
  flipping = true; holdRotation();
  const from = card.rotation.y;
  await tween(1.0, (k) => { card.rotation.y = from + Math.PI * k; card.position.y = card.userData.baseY + Math.sin(k * Math.PI) * 0.18; });
  flipping = false;
}

// ---------------------------------------------------------------------------------------------
// Months, lightbox, collage
// ---------------------------------------------------------------------------------------------
let activeMonth = -1, monthLit = new Set();
function buildMonths() {
  const nav = $("months"); nav.replaceChildren();
  const counts = new Array(12).fill(0); photos.forEach((p) => counts[dateOf(p).getMonth()]++);
  MONTHS.forEach((m, i) => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = m;
    b.setAttribute("aria-pressed", "false"); b.disabled = !counts[i];
    b.setAttribute("aria-label", counts[i] ? `${MONTHS_LONG[i]}, ${counts[i]} photo${counts[i] > 1 ? "s" : ""}` : `${MONTHS_LONG[i]}, no photos`);
    b.addEventListener("click", () => selectMonth(i));
    nav.append(b);
  });
}
function selectMonth(i) {
  if (!introDone) finishIntro();
  const buttons = [...$("months").children];
  if (activeMonth === i) { activeMonth = -1; monthLit.clear(); buttons.forEach((b) => b.setAttribute("aria-pressed", "false")); flyHome(); holdRotation(); return; }
  activeMonth = i; buttons.forEach((b, k) => b.setAttribute("aria-pressed", String(k === i)));
  monthLit = new Set(pols.map((p, k) => (dateOf(p.photo).getMonth() === i ? k : -1)).filter((k) => k >= 0));
  const first = [...monthLit][0];
  holdRotation(12000);
  if (first !== undefined) flyToPhoto(first, 0.62);
}

let lbIndex = -1, lastFocus = null;
function openLightbox(i) {
  if (!introDone) finishIntro();
  lbIndex = (i + photos.length) % photos.length;
  const p = photos[lbIndex];
  const img = $("lb-img"); img.src = fullSrc(p); img.alt = p.caption || p.place || "Photo";
  $("lb-place").textContent = p.place || ""; $("lb-date").textContent = fmtDate(p);
  $("lb-caption").textContent = p.caption || ""; $("lb-by").textContent = p.addedBy ? `Added by ${p.addedBy}` : "";
  $("lb-count").textContent = `${lbIndex + 1} of ${photos.length}`;
  const fig = $("lb-figure"); fig.style.animation = "none"; void fig.offsetWidth; fig.style.animation = "";
  const lb = $("lightbox");
  if (lb.hidden) { lastFocus = document.activeElement; lb.hidden = false; $("lb-next").focus(); }
  holdRotation(0);
  if ($("collage").hidden) flyToPhoto(lbIndex, 0.48);
}
function closeLightbox() {
  $("lightbox").hidden = true; lbIndex = -1;
  if ($("collage").hidden) { flyHome(); holdRotation(5000); }
  lastFocus?.focus?.();
}
$("lb-close").addEventListener("click", closeLightbox);
$("lb-prev").addEventListener("click", () => openLightbox(lbIndex - 1));
$("lb-next").addEventListener("click", () => openLightbox(lbIndex + 1));
$("lightbox").addEventListener("click", (e) => { if (e.target === $("lightbox")) closeLightbox(); });
let swipe = null;
$("lb-figure").addEventListener("pointerdown", (e) => (swipe = e.clientX));
$("lb-figure").addEventListener("pointerup", (e) => {
  if (swipe === null) return; const dx = e.clientX - swipe; swipe = null;
  if (Math.abs(dx) > 50) openLightbox(lbIndex + (dx < 0 ? 1 : -1));
});

function buildCollage() {
  const body = $("collage-body"); body.replaceChildren();
  $("collage-title").textContent = `${photos.length} photos from ${YEAR}`;
  const byMonth = new Map();
  photos.forEach((p, i) => { const m = dateOf(p).getMonth(); if (!byMonth.has(m)) byMonth.set(m, []); byMonth.get(m).push(i); });
  for (const [m, idx] of byMonth) {
    const sec = document.createElement("section"); sec.className = "month";
    const h = document.createElement("h3"); h.textContent = MONTHS_LONG[m];
    const n = document.createElement("span"); n.textContent = `${idx.length} photo${idx.length > 1 ? "s" : ""}`; h.append(n);
    const grid = document.createElement("div"); grid.className = "grid";
    idx.forEach((i) => {
      const p = photos[i], b = document.createElement("button"); b.type = "button"; b.className = "pol";
      b.style.setProperty("--rot", `${((rng(hash(p.id))() - 0.5) * 4).toFixed(2)}deg`);
      b.setAttribute("aria-label", `${p.caption || "Photo"}, ${p.place || ""}, ${fmtDate(p)}`);
      const img = document.createElement("img"); img.loading = "lazy"; img.alt = ""; img.src = p.thumb || fullSrc(p);
      const cap = document.createElement("span"); cap.className = "cap";
      const pl = document.createElement("span"); pl.className = "place"; pl.textContent = p.place || "";
      const dt = document.createElement("span"); dt.className = "date"; dt.textContent = fmtDate(p);
      cap.append(pl, dt); b.append(img, cap);
      b.addEventListener("click", () => openLightbox(i));
      grid.append(b);
    });
    sec.append(h, grid); body.append(sec);
  }
  const cta = document.createElement("aside"); cta.className = "cta";
  cta.innerHTML = `<p><span>Want a page like this?</span>Make one for your own family.</p><button class="pill primary" type="button">Get the app</button>`;
  cta.querySelector("button").addEventListener("click", (e) => openWaitlist(e.currentTarget));
  body.append(cta);
}
$("btn-all").addEventListener("click", () => { $("collage").hidden = false; holdRotation(0); $("collage-close").focus(); });
$("collage-close").addEventListener("click", () => { $("collage").hidden = true; holdRotation(3000); $("btn-all").focus(); });

// Fly in until the card fills the screen: 92% of the width on a phone, 74% of the height on a wide
// screen. Face whichever side is nearer the current view, then flip to show the other side.
function cardView() {
  const { w, h } = cardMesh.userData, aspect = innerWidth / innerHeight, c = current();
  const radius = Math.max((w / 2) / (tanHalf() * aspect * 0.92), (h / 2) / (tanHalf() * 0.74), controls.minDistance);
  const off = (a) => Math.abs(((((a - c.azim + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI);
  const front = card.rotation.y, azim = off(front) <= off(front + Math.PI) ? front : front + Math.PI;
  return { targetY: card.userData.baseY, radius, polar: 1.53, azim };
}
async function showCard() {
  if (!introDone) finishIntro();
  holdRotation(12000);
  const c = current(), v = cardView();
  if (Math.abs(c.radius - v.radius) > 0.3 || Math.abs(c.targetY - v.targetY) > 0.15) await flyTo(v, 0.9);
  flipCard();
}
$("btn-flip").addEventListener("click", showCard);
$("btn-replay").addEventListener("click", () => { activeMonth = -1; monthLit.clear(); buildMonths(); startIntro(); });
let snowOn = true;
$("btn-snow").addEventListener("click", (e) => { snowOn = !snowOn; e.currentTarget.setAttribute("aria-pressed", String(snowOn)); if (!snowOn) snowCtx.clearRect(0, 0, snowCv.width, snowCv.height); });

document.addEventListener("keydown", (e) => {
  if (!$("lightbox").hidden) {
    if (e.key === "ArrowRight") openLightbox(lbIndex + 1);
    else if (e.key === "ArrowLeft") openLightbox(lbIndex - 1);
    else if (e.key === "Escape") closeLightbox();
  } else if (e.key === "Escape") {
    if (!$("waitlist").hidden) $("wl-close").click();
    else if (!$("collage").hidden) $("collage-close").click();
    else if (!$("sheet").hidden) $("sheet-close").click();
  }
});

// ---------------------------------------------------------------------------------------------
// Try your own card and photos (nothing leaves the browser)
// ---------------------------------------------------------------------------------------------
const own = { front: null, back: null };
let samples = [], sampleCardImgs = null;
const loadImg = (url) => new Promise((res, rej) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = rej; i.src = url; });
$("btn-own").addEventListener("click", () => { $("waitlist").hidden = true; $("sheet").hidden = false; $("sheet-close").focus(); });
$("sheet-close").addEventListener("click", () => { $("sheet").hidden = true; $("btn-own").focus(); });
async function setCardFace(side, file) {
  if (!file) return;
  own[side] = await loadImg(URL.createObjectURL(file));
  $(`own-${side}-state`).textContent = "✓ Added";
  buildCard(own.front || sampleCardImgs.front, own.back || sampleCardImgs.back);
}
$("own-front").addEventListener("change", (e) => setCardFace("front", e.target.files[0]));
$("own-back").addEventListener("change", (e) => setCardFace("back", e.target.files[0]));
$("own-photos").addEventListener("change", async (e) => {
  const files = [...e.target.files].filter((f) => f.type.startsWith("image/"));
  if (!files.length) return;
  $("own-photos-state").textContent = "Loading…";
  const list = await Promise.all(files.map(async (f, i) => {
    const url = URL.createObjectURL(f), img = await loadImg(url);
    const place = f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+\d+$/, "").trim();
    return { id: `own${i}-${f.name}`, source: img, full: url, place, caption: "", date: new Date(f.lastModified), addedBy: "" };
  }));
  list.sort((a, b) => a.date - b.date);
  $("own-photos-state").textContent = `✓ ${list.length} added`;
  setPhotos(list); $("sheet").hidden = true;
});
$("own-reset").addEventListener("click", () => {
  own.front = own.back = null;
  ["front", "back", "photos"].forEach((s) => { $(`own-${s}-state`).textContent = "Choose"; $(`own-${s}`).value = ""; });
  buildCard(sampleCardImgs.front, sampleCardImgs.back); setPhotos(samples); $("sheet").hidden = true;
});

// ---------------------------------------------------------------------------------------------
// Get the app: the launch waitlist (merryroll SPEC §5.6). The API stores the email, where it came
// from and when, nothing else, and answers the same for a new or repeat address.
// ---------------------------------------------------------------------------------------------
const WAITLIST_URL = `${API_BASE}/waitlist`;
const EMAIL_OK = /^[^\s@]+@[^\s@.][^\s@]*\.[^\s@]{2,}$/;
let wlReturn = null;
function openWaitlist(from) {
  $("sheet").hidden = true;
  wlReturn = from; $("waitlist").hidden = false; holdRotation(0);
  ($("wl-form").hidden ? $("wl-close") : $("wl-email")).focus();
}
$("btn-app").addEventListener("click", (e) => openWaitlist(e.currentTarget));
$("wl-close").addEventListener("click", () => { $("waitlist").hidden = true; holdRotation(3000); wlReturn?.focus?.(); });
$("wl-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("wl-email"), msg = $("wl-msg"), btn = $("wl-submit"), email = input.value.trim();
  msg.className = "wl-msg"; msg.textContent = "";
  if (!EMAIL_OK.test(email)) {
    msg.classList.add("err"); msg.textContent = "That doesn't look like an email address. Check it and try again.";
    input.setAttribute("aria-invalid", "true"); input.focus(); return;
  }
  input.removeAttribute("aria-invalid");
  btn.disabled = true; btn.textContent = "Sending…";
  try {
    if (WAITLIST_URL) {
      const r = await fetch(WAITLIST_URL, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, source: "xmas26", website: $("wl-website").value }),
      });
      if (r.status === 400) { msg.classList.add("err"); msg.textContent = "That doesn't look like an email address. Check it and try again."; input.focus(); return; }
      if (!r.ok) throw new Error(`status ${r.status}`);
    } else {
      await new Promise((r) => setTimeout(r, 600));
    }
    $("wl-form").hidden = true;
    msg.classList.add("ok"); msg.textContent = "You're on the list ✓ We'll email you when MerryRoll is out.";
    $("wl-close").focus();
  } catch {
    msg.classList.add("err"); msg.textContent = "We couldn't add you just now. Check your connection and try again.";
  } finally {
    btn.disabled = false; btn.textContent = "Notify me";
  }
});

function setPhotos(list) {
  photos = list; activeMonth = -1; monthLit.clear();
  buildTree(photos); buildMonths(); buildCollage();
  $("lede").textContent = `${photos.length} moments from our year, hung on the tree.`;
  startIntro();
}

// ---------------------------------------------------------------------------------------------
// Snow (2D, over everything), lights, render loop
// ---------------------------------------------------------------------------------------------
const snowCv = $("snow"), snowCtx = snowCv.getContext("2d");
let flakes = [];
function initSnow() {
  const w = innerWidth, h = innerHeight, dpr = Math.min(devicePixelRatio, 2);
  snowCv.width = w * dpr; snowCv.height = h * dpr; snowCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const n = REDUCE ? 50 : Math.min(260, Math.max(90, Math.floor((w * h) / 9000)));
  flakes = Array.from({ length: n }, () => { const z = Math.random(); return { x: Math.random() * w, y: Math.random() * h, r: 0.6 + z * 2.2, vy: (0.3 + z * 1.1) * (REDUCE ? 0.3 : 1), vx: -0.2 + Math.random() * 0.4, a: 0.25 + z * 0.5, ph: Math.random() * 6 }; });
}
function drawSnow(t) {
  if (!snowOn) return;
  const w = innerWidth, h = innerHeight;
  snowCtx.clearRect(0, 0, w, h); snowCtx.fillStyle = "#ffffff";
  for (const f of flakes) {
    snowCtx.globalAlpha = f.a; snowCtx.beginPath(); snowCtx.arc(f.x, f.y, f.r, 0, Math.PI * 2); snowCtx.fill();
    f.y += f.vy; f.x += f.vx + Math.sin(t * 0.8 + f.ph) * 0.25;
    if (f.y > h + 4) { f.y = -4; f.x = Math.random() * w; }
    if (f.x > w + 4) f.x = -4; else if (f.x < -4) f.x = w + 4;
  }
  snowCtx.globalAlpha = 1;
}

function animateLights(t, e) {
  if (!garland) return;
  const { col, base, meta, points } = garland;
  for (let k = 0; k < meta.length; k++) {
    const m = meta[k];
    const on = introDone ? 1 : clamp01((e - (1.2 + m.h * 2.6)) / 0.35);
    const tw = REDUCE ? 0.9 : 0.55 + 0.45 * Math.sin(t * m.speed + m.phase);
    const v = on * tw;
    col[k * 3] = base[k * 3] * v; col[k * 3 + 1] = base[k * 3 + 1] * v; col[k * 3 + 2] = base[k * 3 + 2] * v;
  }
  points.geometry.attributes.color.needsUpdate = true;
  const s = introDone ? 1 : easeBack(clamp01((e - 3.75) / 0.7));
  star.scale.setScalar(Math.max(0.0001, s));
  star.rotation.y = REDUCE ? 0 : t * 0.5;
}

function animatePolaroids(t) {
  if (!introDone) return;
  pols.forEach((p, i) => {
    const goal = (i === hover ? 1.1 : 1) * (monthLit.has(i) ? 1.22 + (REDUCE ? 0 : Math.sin(t * 3) * 0.03) : 1) * (i === lbIndex ? 1.15 : 1);
    p.boost += (goal - p.boost) * 0.12;
    p.mesh.scale.setScalar(p.home.scale * p.boost);
  });
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); initSnow();
  if (introDone && !flying && !overlayOpen()) { const f = framing(), c = current(); place(f.targetY, f.dist, f.polar, c.azim); }
}
addEventListener("resize", resize);

function frame(now) {
  requestAnimationFrame(frame);
  const t = now / 1000, e = (now - introStart) / 1000;
  runTweens(now);
  updateIntro(e);
  animateLights(t, e);
  animatePolaroids(t);
  if (card && !flipping && !REDUCE) card.position.y = card.userData.baseY + Math.sin(t * 0.9) * 0.025;
  if (!flying) controls.update();
  renderer.render(scene, camera);
  drawSnow(t);
}

// ---------------------------------------------------------------------------------------------
// Boot: the family's year from the API. Until the collection has photos and the card images are set,
// the painted samples stand in, and the masthead says which parts are samples.
// ---------------------------------------------------------------------------------------------
async function loadYear(paintedPhotos, paintedCard) {
  let data = null;
  try { data = await fetchCard(); } catch (e) { console.warn("Showing the sample year:", e.message); }

  let list = [];
  const picks = photosFromApi(data?.photos);
  if (picks.length) {
    const loaded = await Promise.all(picks.map((p) => loadImg(p.thumb).then((source) => ({ ...p, source }), () => null)));
    list = loaded.filter(Boolean);
  }
  const urls = cardFaces(data?.card);
  const [front, back] = await Promise.all([urls.front, urls.back].map((u) => (u ? loadImg(u).catch(() => null) : null)));
  return {
    photos: list.length ? list : paintedPhotos,
    card: { front: front || paintedCard.front, back: back || paintedCard.back },
    label: previewLabel({ realPhotos: list.length > 0, realFront: !!front, realBack: !!back }),
  };
}

(async () => {
  const fonts = Promise.all([`36px ${HAND}`, `100px ${DISPLAY}`, `600 34px ${BODY}`].map((f) => document.fonts.load(f)));
  await Promise.race([fonts, new Promise((r) => setTimeout(r, 2000))]);
  const painted = SAMPLE_PHOTOS.map((p) => ({ ...p, source: paintSample(p) }));
  const year = await loadYear(painted, sampleCard(painted));
  // "Back to our year" in Try your own returns here.
  samples = year.photos;
  sampleCardImgs = year.card;
  $("draft").hidden = !year.label;
  $("draft").textContent = year.label ?? "";
  buildCard(sampleCardImgs.front, sampleCardImgs.back);
  resize();
  setPhotos(samples);
  requestAnimationFrame(frame);
  $("loading").classList.add("gone");
  setTimeout(() => ($("loading").hidden = true), 700);
})();
