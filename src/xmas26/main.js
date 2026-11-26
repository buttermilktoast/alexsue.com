// alexsue.com/xmas26: the Sue family's 2026 card. The printed card sits under a 3D tree of the
// year's photos. Ported from the design draft (merryroll repo: plans/xmas26-design.html); the scene
// code is unchanged, and the data now comes from the MerryRoll API (data.js).
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import "./style.css";
import { initAnalytics } from "../analytics.js";
import { API_BASE, YEAR, TREE_PHOTOS, fetchCard, photosFromApi, createPhotoHistory, cardFaces, dayOf, previewLabel, cleanName, codeFromSearch, recipientFromApi, withoutCode, durationText, reactionsFromApi, createReactionMemory, postReaction, splitReactions, moreSummary, reactionTally, REACTION_EMOJI, REACTION_NAMES } from "./data.js";
import { HAND, DISPLAY, BODY, SAMPLE_PHOTOS, paintSample, sampleCard, rng, hash, lin, drawCover, sizeOf } from "./samples.js";

// A personal link (?to=auntiesu) greets that person and shows the family's note to them.
const TO = codeFromSearch(location.search);
initAnalytics(TO ? { pageLocation: withoutCode(location.href) } : {});

const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);
// The deployed commit, as on the dashboard's footer (VITE_GIT_COMMIT from the deploy workflow).
const COMMIT = import.meta.env.VITE_GIT_COMMIT || "development";
$("version").textContent = `version ${COMMIT === "development" ? COMMIT : COMMIT.slice(0, 7)}`;
$("version").title = COMMIT;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// The day a photo was taken. A photo without a date goes at the end of the year.
const dateOf = (p) => p.date || (p.date = dayOf(p.takenAt) ?? new Date(YEAR, 11, 31));
const fmtDate = (p) => `${MONTHS[dateOf(p).getMonth()]} ${dateOf(p).getDate()}`;
let photoHistory;

function fitFont(c, text, family, size, maxW) {
  let s = size; c.font = `${s}px ${family}`;
  while (s > 14 && c.measureText(text).width > maxW) { s -= 2; c.font = `${s}px ${family}`; }
}
const fullSrc = (p) => p.url || p.full || (p.full = p.source.toDataURL ? p.source.toDataURL("image/jpeg", 0.9) : p.source.src);

// A round ▶ over a video's still frame.
function drawPlay(c, x, y, r) {
  c.save();
  c.fillStyle = "rgba(0,0,0,0.45)"; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.strokeStyle = "rgba(255,255,255,0.9)"; c.lineWidth = 2.5; c.stroke();
  c.fillStyle = "#fff"; c.beginPath();
  c.moveTo(x - r * 0.3, y - r * 0.45); c.lineTo(x + r * 0.5, y); c.lineTo(x - r * 0.3, y + r * 0.45); c.closePath(); c.fill();
  c.restore();
}

// A polaroid: photo on top, the place hand-written underneath, the month in the corner.
const PW = 256, PH = 312;
function polaroidCanvas(p, cv = document.createElement("canvas")) {
  cv.width = PW; cv.height = PH;
  const c = cv.getContext("2d"), pad = 14, sz = PW - pad * 2;
  c.fillStyle = lin(c, 0, 0, PW, PH, [[0, "#faf6ee"], [1, "#ece4d4"]]); c.fillRect(0, 0, PW, PH);
  drawCover(c, p.source, pad, pad, sz, sz);
  c.strokeStyle = "rgba(0,0,0,0.12)"; c.strokeRect(pad + 0.5, pad + 0.5, sz - 1, sz - 1);
  if (p.video) drawPlay(c, pad + sz / 2, pad + sz / 2, 30);
  if (photoHistory.isNew(p)) {
    c.beginPath(); c.arc(pad + 26, pad + 26, 17, 0, Math.PI * 2);
    c.fillStyle = "#f3b65b"; c.fill();
    c.strokeStyle = "#2a241c"; c.lineWidth = 5; c.stroke();
  }
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
controls.enableDamping = true; controls.dampingFactor = 0.08;
// Pinch or scroll zooms toward the fingers or cursor, and two fingers (or right/shift-drag) move the
// view: up and down the tree (keepOnTree), or around the card in card view (keepOnCard).
controls.enablePan = true; controls.zoomToCursor = true;
const TREE_MIN_DIST = 1.6;
controls.minDistance = TREE_MIN_DIST; controls.maxDistance = 16; controls.minPolarAngle = 0.5; controls.maxPolarAngle = 1.85;
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
  // Polaroids shrink from 30 photos and bottom out at TREE_PHOTOS.max; past that the tree only gets denser.
  const size = THREE.MathUtils.clamp(1 - (0.45 * (N - 30)) / (TREE_PHOTOS.max - 30), 0.55, 1);
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
    pols.push({ mesh, photo, texture: tex, theta: p.th, y: p.y, t, home: { pos: mesh.position.clone(), quat: mesh.quaternion.clone(), scale }, boost: 1, delay: 1.05 + (i / Math.max(1, N - 1)) * 2.3 });
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
// With the words and buttons hidden (setChromeHidden), there's nothing to keep the tree clear of.
let chromeHidden = false;
function framing() {
  const w = innerWidth, h = innerHeight, aspect = w / h, narrow = aspect < 0.9;
  // The months are the dock's top row, or its only bottom row on a phone on its side (the tools go
  // to the right there), so they mark where the tree has to stop.
  const mast = document.querySelector(".mast").getBoundingClientRect(), dock = $("months").getBoundingClientRect();
  const topRes = chromeHidden ? 0.04 : narrow ? Math.min(0.4, (mast.bottom + 8) / h) : 0.03;
  const botRes = chromeHidden ? 0.04 : Math.min(0.3, (h - dock.top + 6) / h);
  const usable = Math.max(0.4, 1 - topRes - botRes);
  const dH = (TOP_Y - BOTTOM_Y) / (usable * 2 * tanHalf());
  const dW = ((CONTENT_W / 2) / (tanHalf() * aspect)) * (narrow ? 0.86 : 1);
  const dist = Math.max(dH, dW), visH = 2 * dist * tanHalf();
  const centerFromTop = (topRes + (1 - botRes)) / 2;
  return { dist, targetY: (TOP_Y + BOTTOM_Y) / 2 + (centerFromTop - 0.5) * visH, polar: 1.42 };
}
// `side` slides the view to the camera's right (card view on a phone on its side, so the card sits
// clear of the tools column); everywhere else it's 0 and the view stays on the trunk.
function place(targetY, radius, polar, azim, side = 0) {
  const t = controls.target.set(side * Math.cos(azim), targetY, -side * Math.sin(azim));
  camera.position.set(t.x + radius * Math.sin(polar) * Math.sin(azim), targetY + radius * Math.cos(polar), t.z + radius * Math.sin(polar) * Math.cos(azim));
  camera.lookAt(controls.target);
}
function current() {
  const t = controls.target, off = camera.position.clone().sub(t), r = off.length(), azim = Math.atan2(off.x, off.z);
  return { targetY: t.y, radius: r, polar: Math.acos(THREE.MathUtils.clamp(off.y / r, -1, 1)), azim, side: t.x * Math.cos(azim) - t.z * Math.sin(azim) };
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
  const side = to.side || 0;
  await tween(dur, (k) => place(from.targetY + (to.targetY - from.targetY) * k, from.radius + (to.radius - from.radius) * k, from.polar + (to.polar - from.polar) * k, from.azim + dA * k, from.side + (side - from.side) * k));
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
  if (ms > 0 && !REDUCE) idleTimer = setTimeout(() => { if (!overlayOpen() && !cardMode) controls.autoRotate = true; }, ms);
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
  const o = hit(ev.clientX, ev.clientY) ?? (ev.pointerType !== "mouse" && !cardMode ? nearestPhoto(ev.clientX, ev.clientY) : null);
  if (!o) return;
  if (o.userData.card) cardMode && cardZoomed() ? fitCard() : showCard(); else openLightbox(o.userData.index);
});
// A fingertip is wider than a polaroid on a full tree: a tap that just misses one, on the side of
// the tree facing us, opens the nearest.
const toCam = new THREE.Vector3(), onScreen = new THREE.Vector3();
function nearestPhoto(x, y, reach = 28) {
  const b = canvas.getBoundingClientRect();
  let best = null, bestD = reach;
  for (const { mesh } of pols) {
    if (!mesh.visible) continue;
    toCam.copy(camera.position).sub(mesh.position);
    if (toCam.x * mesh.position.x + toCam.z * mesh.position.z <= 0) continue;   // the far side of the tree
    onScreen.copy(mesh.position).project(camera);
    const d = Math.hypot(b.left + ((onScreen.x + 1) / 2) * b.width - x, b.top + ((1 - onScreen.y) / 2) * b.height - y);
    if (d < bestD) { bestD = d; best = mesh; }
  }
  return best;
}
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
  flipping = true; holdRotation(cardMode ? 0 : 7000);
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
  setCardMode(false);
  const buttons = [...$("months").children];
  if (activeMonth === i) { activeMonth = -1; monthLit.clear(); buttons.forEach((b) => b.setAttribute("aria-pressed", "false")); updateHint(); flyHome(); holdRotation(); return; }
  activeMonth = i; buttons.forEach((b, k) => b.setAttribute("aria-pressed", String(k === i)));
  monthLit = new Set(pols.map((p, k) => (dateOf(p.photo).getMonth() === i ? k : -1)).filter((k) => k >= 0));
  updateHint();
  const first = [...monthLit][0];
  holdRotation(12000);
  if (first !== undefined) flyToPhoto(first, 0.62);
}

let lbIndex = -1, lastFocus = null;
const fullLoads = new Map();
function preloadFull(p) {
  const u = fullSrc(p);
  if (!fullLoads.has(u)) { const i = new Image(); i.src = u; fullLoads.set(u, i.decode().then(() => u, () => null)); }
  return fullLoads.get(u);
}
// dir: +1 for the next photo (it comes in from the right), -1 for the previous one, 0 to open one.
function openLightbox(i, dir = 0) {
  if (!introDone) finishIntro();
  closePicker(false);
  setCardMode(false);
  // Going past either end goes round to the other: say so, or it looks like the year started over.
  if (!$("lightbox").hidden && photos.length > 1 && (i < 0 || i >= photos.length)) flashNote(i < 0 ? "Round to the last photo" : "Back to the first photo");
  resetPhotoGesture();
  lbIndex = (i + photos.length) % photos.length;
  const p = photos[lbIndex];
  // Show the thumbnail the tree already loaded so the photo changes with its caption, then swap in the
  // full copy once it's decoded. Warm the neighbours' full copies so prev/next is instant.
  const img = $("lb-img"), at = lbIndex, quick = p.thumb || fullSrc(p);
  stopVideo();
  img.src = quick; img.alt = p.caption || p.place || (p.video ? "Video" : "Photo");
  if (p.video) {
    // A video: its still frame until it plays. Muted so phones let it start by itself; the controls unmute.
    // Nothing loads until it's opened (preload="none" and no src), so the tree never downloads video.
    const v = $("lb-video");
    v.poster = fullSrc(p); v.src = p.video; v.muted = true; v.setAttribute("aria-label", img.alt);
    v.hidden = false; img.hidden = true;
    v.play().catch(() => {}); // autoplay refused: the poster and controls stay
  } else if (quick !== fullSrc(p)) preloadFull(p).then((u) => { if (u && lbIndex === at) img.src = u; }); // a failed load keeps the thumbnail
  [1, -1].forEach((d) => preloadFull(photos[(lbIndex + d + photos.length) % photos.length]));
  // The caption is hand-written on the polaroid and the place goes underneath; with no caption, the place takes its spot.
  $("lb-caption").textContent = p.caption || p.place || ""; $("lb-date").textContent = fmtDate(p);
  $("lb-place").textContent = p.caption ? p.place || "" : "";
  // $("lb-by").textContent = p.addedBy ? `Added by ${p.addedBy}` : "";   // off for now, with #lb-by in index.html
  $("lb-count").textContent = `${lbIndex + 1} of ${photos.length}`;
  renderReactions(p);
  // The next photo slides in from the side it's on, so a swipe and the arrows tell the same story.
  const fig = $("lb-figure"); fig.style.animation = "none";
  if (dir && !REDUCE) fig.animate([{ transform: `translateX(${dir * 45}%) rotate(${-1.2 + dir * 4}deg)`, opacity: 0 }, { transform: BASE_TILT, opacity: 1 }], { duration: 340, easing: "cubic-bezier(.2, .8, .2, 1)" });
  else { void fig.offsetWidth; fig.style.animation = ""; }
  const lb = $("lightbox");
  if (lb.hidden) { lastFocus = document.activeElement; lb.hidden = false; $("lb-next").focus(); teachSwipe(); }
  fitLightbox();
  markPhotoViewed(lbIndex);
  hintLearned = true; updateHint();   // they've found the photos; the tree's how-to can go
  if (!tapped) { tapped = true; remember(TAPPED_KEY); }   // and so can the "Tap a photo" ring
  holdRotation(0);
  if ($("collage").hidden) flyToPhoto(lbIndex, 0.48);
}
// Size the photo to the room that's actually left, so the ✕, caption, reactions and ‹ › row always fit.
// CSS can't: vh on a phone is the height with the browser's toolbars hidden, and the caption wraps.
// The polaroid narrows to the photo's shape. Measured twice, since a narrower polaroid can wrap the caption.
const POLAROID_PAD = 14;
function fitLightbox() {
  const lb = $("lightbox");
  if (lbIndex < 0 || lb.hidden) return;
  const p = photos[lbIndex], fig = $("lb-figure"), img = $("lb-img"), vid = $("lb-video");
  const cs = getComputedStyle(lb), px = (v) => parseFloat(v) || 0;
  const side = px(getComputedStyle(fig).paddingLeft) || POLAROID_PAD;
  // A phone on its side lays the place, reactions and arrows beside the photo instead of under it (style.css).
  const beside = cs.flexDirection === "row", meta = document.querySelector(".lb-meta");
  const roomW = Math.min(600, lb.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight) - (beside ? meta.offsetWidth + px(cs.columnGap) : 0)) - side * 2;
  const roomH = lb.clientHeight - px(cs.paddingTop) - px(cs.paddingBottom) - (beside ? 0 : px(cs.rowGap));
  const ratio = p.w > 0 && p.h > 0 ? p.w / p.h : img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 4 / 3;
  fig.classList.add("fitted");
  for (let pass = 0; pass < 2; pass++) {
    const chrome = side + fig.querySelector("figcaption").offsetHeight + (beside ? 0 : meta.offsetHeight);
    const h = Math.max(120, Math.min(620, roomH - chrome));
    const w = Math.max(Math.min(roomW, 240), Math.min(roomW, h * ratio));   // never so narrow the caption has no room
    fig.style.width = `${w + side * 2}px`;
    img.style.height = vid.style.height = `${Math.round(Math.min(h, w / ratio))}px`;
  }
  if (zoom.s > 1) setZoom(zoom.s, zoom.x, zoom.y);   // the box changed size: keep a zoomed photo covering it
}
$("lb-img").addEventListener("load", fitLightbox);   // a sample photo's shape is only known once it loads

// ---------------------------------------------------------------------------------------------
// Emoji reactions under the lightbox photo: tap one to add it, tap again to take it back. Counts are
// anonymous; this browser remembers its own taps. The API says which emoji are on (none when the
// family turns reactions off, or for the sample photos), and the row stays hidden without them.
//
// Most visitors are on a phone, so the row is one line that never grows: the six quick emoji and a
// "more" chip. The chip opens a sheet with the rest; once any of those are used on a photo, it shows
// the top two and their total instead of its add-a-face icon, and the sheet has each one's count.
// ---------------------------------------------------------------------------------------------
let reactionKeys = [], moreKeys = [];
const reacted = createReactionMemory(), reactBusy = new Set();
const ADD_FACE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M20.5 12A8.5 8.5 0 1 1 12 3.5"/><path d="M8.5 14.5q3.5 3.5 7 0"/><circle cx="9" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1" fill="currentColor" stroke="none"/><path d="M19.5 1.5v6M16.5 4.5h6"/></svg>`;
function reactButton(k, className, onClick) {
  const b = document.createElement("button"); b.type = "button"; b.className = className; b.dataset.key = k;
  const e = document.createElement("span"); e.className = "e"; e.textContent = REACTION_EMOJI[k]; e.setAttribute("aria-hidden", "true");
  const n = document.createElement("span"); n.className = "n"; n.setAttribute("aria-hidden", "true");
  b.append(e, n);
  b.addEventListener("click", onClick);
  b.addEventListener("animationend", () => b.classList.remove("pop"));
  return b;
}
function buildReactions(keys) {
  const { quick, more } = splitReactions(keys);
  reactionKeys = keys; moreKeys = more;
  const row = $("lb-react"); row.replaceChildren(...quick.map((k) => reactButton(k, "react", () => toggleReaction(k))));
  $("rp-grid").replaceChildren(...more.map((k) => reactButton(k, "rp-item", () => { closePicker(); toggleReaction(k); })));
  if (!more.length) return;   // an API that offers only the quick ones: no chip, no sheet
  const b = document.createElement("button"); b.type = "button"; b.className = "react more"; b.id = "react-more";
  b.setAttribute("aria-haspopup", "dialog"); b.setAttribute("aria-expanded", "false");
  b.innerHTML = `${ADD_FACE}<span class="stack" aria-hidden="true"></span><span class="n" aria-hidden="true"></span>`;
  b.addEventListener("click", openPicker);
  b.addEventListener("animationend", () => b.classList.remove("pop"));
  row.append(b);
}
const restartPop = (b) => { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); };
function showCounts(b, p) {
  const k = b.dataset.key, n = p.reactions?.[k] ?? 0;
  b.querySelector(".n").textContent = n ? String(n) : "";
  b.setAttribute("aria-pressed", String(reacted.has(p.id, k)));
  b.setAttribute("aria-label", `${REACTION_NAMES[k]}${n ? `, ${n}` : ""}`);
}
function renderReactions(p, pop = null) {
  const row = $("lb-react");
  row.hidden = !reactionKeys.length;
  // Says tapping is welcome and anonymous, until this browser's first reaction shows it knows.
  $("lb-react-hint").hidden = row.hidden || reacted.any();
  if (row.hidden) return;
  for (const b of row.querySelectorAll(".react[data-key]")) { showCounts(b, p); if (b.dataset.key === pop) restartPop(b); }
  const more = $("react-more");
  if (!more) return;
  const { top, total } = moreSummary(moreKeys, p.reactions ?? {});
  more.classList.toggle("used", total > 0);
  more.classList.toggle("mine", moreKeys.some((k) => reacted.has(p.id, k)));
  more.querySelector(".stack").replaceChildren(...top.map((k) => Object.assign(document.createElement("span"), { textContent: REACTION_EMOJI[k] })));
  more.querySelector(".n").textContent = total ? String(total) : "";
  more.setAttribute("aria-label", total ? `More reactions, ${total} so far` : "More reactions");
  if (moreKeys.includes(pop)) restartPop(more);
  for (const b of $("rp-grid").children) showCounts(b, p);
}
function openPicker() {
  const p = photos[lbIndex];
  if (!p) return;
  renderReactions(p);
  $("react-pick").hidden = false; $("react-more").setAttribute("aria-expanded", "true");
  ($("rp-grid").querySelector('[aria-pressed="true"]') ?? $("rp-grid").firstElementChild)?.focus({ preventScroll: true });
}
function closePicker(refocus = true) {
  if ($("react-pick").hidden) return;
  $("react-pick").hidden = true; $("react-more")?.setAttribute("aria-expanded", "false");
  if (refocus) $("react-more")?.focus({ preventScroll: true });
}
$("rp-close").addEventListener("click", () => closePicker());
$("react-pick").addEventListener("click", (e) => { if (e.target === e.currentTarget) closePicker(); });   // a tap above the sheet
async function toggleReaction(k) {
  const p = photos[lbIndex], busy = `${p?.id}#${k}`;
  if (!p || reactBusy.has(busy)) return;
  const on = !reacted.has(p.id, k), before = p.reactions ?? {};
  reactBusy.add(busy);
  // Show it at once; the API's counts replace the guess, and a failure puts it back.
  reacted.set(p.id, k, on);
  p.reactions = { ...before, [k]: Math.max(0, (before[k] ?? 0) + (on ? 1 : -1)) };
  renderReactions(p, on ? k : null); fitLightbox(); showTally(photos.indexOf(p));
  try {
    p.reactions = await postReaction({ pickId: p.id, emoji: k, on, to: TO });
  } catch (e) {
    console.warn("Reaction not saved:", e.message);
    reacted.set(p.id, k, !on); p.reactions = before;
  } finally {
    reactBusy.delete(busy);
    showTally(photos.indexOf(p));
    if (photos[lbIndex] === p) { renderReactions(p); fitLightbox(); }
  }
}

/** Stops the lightbox video and drops its download, so a closed or skipped video stops using data. */
function stopVideo() {
  const v = $("lb-video");
  if (v.hidden) return;
  v.pause(); v.removeAttribute("src"); v.removeAttribute("poster"); v.load();
  v.hidden = true; $("lb-img").hidden = false;
}
function closeLightbox() {
  clearTimeout(teachTimer); $("lb-next").classList.remove("beckon");
  closePicker(false);
  stopVideo();
  resetPhotoGesture();
  $("lb-note").classList.remove("show");
  $("lightbox").hidden = true; lbIndex = -1;
  if ($("collage").hidden) { flyHome(); holdRotation(5000); }
  lastFocus?.focus?.();
}
$("lb-close").addEventListener("click", closeLightbox);
$("lb-prev").addEventListener("click", () => stepLightbox(-1));
$("lb-next").addEventListener("click", () => stepLightbox(1));

let noteTimer = 0;
function flashNote(text, ms = 1800) {
  const n = $("lb-note"); n.textContent = text; n.classList.add("show");
  clearTimeout(noteTimer); noteTimer = setTimeout(() => n.classList.remove("show"), ms);
}

// ---------------------------------------------------------------------------------------------
// Lightbox gestures, on one handler so they can't fight. A sideways drag carries the photo with the
// finger and lets go onto the next one; a drag down puts it back on the tree; a pinch, a double tap
// or the wheel zooms the photo inside its polaroid, and a zoomed photo pans instead. The buttons, the
// reactions and a video's control strip keep their own taps and drags. The whole lightbox takes
// these (touch-action: none), so a pinch zooms the photo, not the page under it.
// ---------------------------------------------------------------------------------------------
const lbEl = $("lightbox"), figEl = $("lb-figure");
const SLOP = 10, ZOOM_MAX = 4, VIDEO_CONTROLS = 56, BASE_TILT = "rotate(-1.2deg)";
const zoom = { s: 1, x: 0, y: 0 }, pointers = new Map();
let gesture = null, leaving = false, swallowClick = false, lastTap = null;
const canZoom = () => $("lb-video").hidden;   // photos zoom; a video has its own player

function setZoom(s, x, y, animate = false) {
  const img = $("lb-img"), box = $("lb-photo");
  s = THREE.MathUtils.clamp(s, 1, ZOOM_MAX);
  const mx = (box.clientWidth * (s - 1)) / 2, my = (box.clientHeight * (s - 1)) / 2;   // as far as it can go and still cover the box
  zoom.s = s; zoom.x = THREE.MathUtils.clamp(x, -mx, mx); zoom.y = THREE.MathUtils.clamp(y, -my, my);
  img.style.transition = animate && !REDUCE ? "transform 0.25s cubic-bezier(.2, .8, .2, 1)" : "";
  img.style.transform = s > 1 ? `translate(${zoom.x}px, ${zoom.y}px) scale(${s})` : "";
  lbEl.classList.toggle("zoomed", s > 1);
}
function fromMiddle(x, y) { const r = $("lb-photo").getBoundingClientRect(); return { x: x - (r.left + r.width / 2), y: y - (r.top + r.height / 2) }; }
// Zoom keeping the spot under the fingers or cursor where it is.
function zoomAt(cx, cy, s, animate = false) {
  const p = fromMiddle(cx, cy), k = THREE.MathUtils.clamp(s, 1, ZOOM_MAX) / zoom.s;
  setZoom(s, p.x - (p.x - zoom.x) * k, p.y - (p.y - zoom.y) * k, animate);
}
function resetPhotoGesture() {
  figEl.getAnimations().forEach((a) => a.cancel());
  figEl.style.transform = "";
  lbEl.style.removeProperty("--pull"); lbEl.classList.remove("settling");
  setZoom(1, 0, 0);
  gesture = null; pointers.clear(); leaving = false; lastTap = null;
}
// A drag that didn't go far enough: the photo springs back and the backdrop comes back.
function settle() {
  const from = figEl.style.transform;
  figEl.style.transform = "";
  lbEl.classList.add("settling"); lbEl.style.removeProperty("--pull");
  setTimeout(() => lbEl.classList.remove("settling"), 260);
  if (from && !REDUCE) figEl.animate([{ transform: from }, { transform: BASE_TILT }], { duration: 240, easing: "cubic-bezier(.2, .8, .2, 1)" });
}
// The arrows, the arrow keys and a swipe all come here. A swipe throws the photo off the way it was going first.
async function stepLightbox(dir, dragged = false) {
  if (lbIndex < 0 || leaving) return;
  learnedSwipe();
  if (dragged && !REDUCE) {
    leaving = true;
    await figEl.animate([{ transform: figEl.style.transform || BASE_TILT }, { transform: `translateX(${-dir * innerWidth}px) rotate(${-1.2 - dir * 8}deg)`, opacity: 0 }],
      { duration: 200, easing: "cubic-bezier(.4, 0, 1, 1)", fill: "forwards" }).finished.catch(() => {});
    if (lbIndex < 0) return;   // closed meanwhile
  }
  openLightbox(lbIndex + dir, dir);
}
async function pullClose() {
  if (!REDUCE) {
    leaving = true;
    lbEl.classList.add("settling"); lbEl.style.setProperty("--pull", "1");
    await figEl.animate([{ transform: figEl.style.transform || BASE_TILT }, { transform: `translateY(${innerHeight * 0.5}px) scale(0.85) ${BASE_TILT}`, opacity: 0 }],
      { duration: 220, easing: "cubic-bezier(.4, 0, 1, 1)", fill: "forwards" }).finished.catch(() => {});
  }
  if (lbIndex >= 0) closeLightbox();
}
function twoFingers() { const [a, b] = [...pointers.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) }; }
function capture(id) { try { lbEl.setPointerCapture(id); } catch { /* already up */ } }

lbEl.addEventListener("pointerdown", (e) => {
  swallowClick = false;
  if (e.pointerType === "mouse") pointers.clear();   // a mouse is one pointer, whatever was missed
  if (leaving || pointers.size >= 2 || (e.pointerType === "mouse" && e.button !== 0)) return;
  if (e.target.closest("button, a, input, .lb-react, .react-pick")) return;
  if (e.target.tagName === "VIDEO" && e.clientY > e.target.getBoundingClientRect().bottom - VIDEO_CONTROLS) return;   // its scrubber
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) {
    gesture = { mode: "tap", id: e.pointerId, x0: e.clientX, y0: e.clientY, onPhoto: e.target === $("lb-img"), trail: [] };
  } else if (canZoom()) {
    if (gesture?.mode === "swipe" || gesture?.mode === "pull") settle();
    const m = twoFingers();
    gesture = { mode: "pinch", m0: fromMiddle(m.x, m.y), d0: Math.max(m.d, 1), z0: { ...zoom } };
    pointers.forEach((_, id) => capture(id));
    swallowClick = true;
  }
});
lbEl.addEventListener("pointermove", (e) => {
  const pt = pointers.get(e.pointerId);
  if (!pt || !gesture) return;
  pt.x = e.clientX; pt.y = e.clientY;
  if (gesture.mode === "pinch") {
    if (pointers.size < 2) return;
    const m = twoFingers(), p = fromMiddle(m.x, m.y), z = gesture.z0;
    const s = THREE.MathUtils.clamp(z.s * (m.d / gesture.d0), 1, ZOOM_MAX), k = s / z.s;
    setZoom(s, p.x - (gesture.m0.x - z.x) * k, p.y - (gesture.m0.y - z.y) * k);   // follows the fingers as they move, too
    return;
  }
  if (e.pointerId !== gesture.id) return;
  const dx = e.clientX - gesture.x0, dy = e.clientY - gesture.y0;
  gesture.trail.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
  if (gesture.trail.length > 6) gesture.trail.shift();
  if (gesture.mode === "tap") {
    if (Math.hypot(dx, dy) < SLOP) return;
    gesture.mode = zoom.s > 1 ? "pan" : Math.abs(dx) > Math.abs(dy) ? "swipe" : "pull";
    gesture.z0 = { ...zoom };
    swallowClick = true; capture(e.pointerId);
    figEl.getAnimations().forEach((a) => a.finish());   // an entrance still playing would hold the photo still
  }
  if (gesture.mode === "pan") setZoom(zoom.s, gesture.z0.x + dx, gesture.z0.y + dy);
  else if (gesture.mode === "swipe") figEl.style.transform = `translateX(${dx}px) rotate(${-1.2 + dx * 0.012}deg)`;
  else {
    const y = dy > 0 ? dy : dy * 0.25;   // upward only gives a little
    figEl.style.transform = `translateY(${y}px) scale(${1 - Math.min(Math.max(y, 0), 400) / 1600}) ${BASE_TILT}`;
    lbEl.style.setProperty("--pull", clamp01(y / 320).toFixed(3));
  }
});
function endPointer(e) {
  if (!pointers.delete(e.pointerId) || !gesture) return;
  const g = gesture, cancelled = e.type === "pointercancel";
  if (g.mode === "pinch") {
    // One finger left on the photo carries on as a pan.
    const [rest] = pointers;
    gesture = rest ? { mode: "pan", id: rest[0], x0: rest[1].x, y0: rest[1].y, z0: { ...zoom }, trail: [] } : null;
    if (zoom.s < 1.05) setZoom(1, 0, 0, true);
    return;
  }
  if (e.pointerId !== g.id) return;
  gesture = null;
  const dx = e.clientX - g.x0, dy = e.clientY - g.y0, a = g.trail[0], b = g.trail.at(-1);
  const dt = a && b ? b.t - a.t : 0, vx = dt > 0 ? (b.x - a.x) / dt : 0, vy = dt > 0 ? (b.y - a.y) / dt : 0;   // px per ms
  if (g.mode === "swipe") {
    const far = Math.abs(dx) > Math.max(60, figEl.offsetWidth * 0.25), flick = Math.abs(vx) > 0.5 && Math.abs(dx) > 20 && Math.sign(vx) === Math.sign(dx);
    if (!cancelled && photos.length > 1 && (far || flick)) stepLightbox(dx < 0 ? 1 : -1, true); else settle();
  } else if (g.mode === "pull") {
    if (!cancelled && (dy > 110 || (vy > 0.6 && dy > 30))) pullClose(); else settle();
  } else if (g.mode === "tap" && !cancelled && g.onPhoto && canZoom()) {
    // A double tap (or double click) zooms in on that spot, or back out.
    if (lastTap && e.timeStamp - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
      lastTap = null;
      if (zoom.s > 1) setZoom(1, 0, 0, true); else zoomAt(e.clientX, e.clientY, 2.5, true);
    } else lastTap = { t: e.timeStamp, x: e.clientX, y: e.clientY };
  }
}
lbEl.addEventListener("pointerup", endPointer);
lbEl.addEventListener("pointercancel", endPointer);
// A tap on the dim backdrop closes it, but not the click that ends a drag.
lbEl.addEventListener("click", (e) => { if (swallowClick) { swallowClick = false; return; } if (e.target === lbEl) closeLightbox(); });
$("lb-photo").addEventListener("wheel", (e) => {
  if (!canZoom()) return;
  e.preventDefault();
  const d = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
  zoomAt(e.clientX, e.clientY, zoom.s * Math.exp(-d * (e.ctrlKey ? 0.01 : 0.002)));   // ctrlKey: a trackpad pinch
}, { passive: false });
// Safari on a Mac pinches with gesture events, not ctrl+wheel. (On a phone the pointers above do it.)
let gestureFrom = 1;
lbEl.addEventListener("gesturestart", (e) => { e.preventDefault(); gestureFrom = zoom.s; });
lbEl.addEventListener("gesturechange", (e) => { e.preventDefault(); if (!pointers.size && canZoom()) zoomAt(e.clientX, e.clientY, gestureFrom * e.scale); });

const collagePhotos = [];

function updateNewPhotoCount() {
  const count = photos.filter(photoHistory.isNew).length;
  const badge = $("new-photo-count");
  badge.textContent = count ? `${count} new` : "";
  badge.hidden = !count;
  $("new-hint").hidden = !count;   // says what the gold dot on a polaroid means
  stripFade($("tools"));
}

function markPhotoViewed(i) {
  const photo = photos[i];
  if (!photoHistory.markViewed(photo)) return;
  collagePhotos[i].badge.hidden = true;
  labelCollage(i);
  const { texture } = pols[i];
  polaroidCanvas(photo, texture.image);
  texture.needsUpdate = true;
  updateNewPhotoCount();
}

// Under each polaroid in "All photos": every emoji it has had, with its count, most first; this
// browser's own taps are marked as in the lightbox. Kept current as reactions are added or taken back.
function showTally(i) {
  const c = collagePhotos[i], p = photos[i];
  if (!c || !p) return;
  c.tally.replaceChildren(...reactionTally(reactionKeys, p.reactions).map(({ k, n }) => {
    const s = document.createElement("span"); s.classList.toggle("mine", reacted.has(p.id, k));
    s.append(REACTION_EMOJI[k], Object.assign(document.createElement("b"), { textContent: String(n) }));
    return s;
  }));
  labelCollage(i);
}
function labelCollage(i) {
  const { button, badge, label } = collagePhotos[i];
  const r = reactionTally(reactionKeys, photos[i].reactions).map(({ k, n }) => `${REACTION_NAMES[k]} ${n}`).join(", ");
  button.setAttribute("aria-label", `${badge.hidden ? "" : "New. "}${label}${r ? `. Reactions: ${r}` : ""}`);
}

function buildCollage() {
  const body = $("collage-body"); body.replaceChildren();
  collagePhotos.length = 0;
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
      const isNew = photoHistory.isNew(p);
      const label = [p.caption || (p.video ? "Video" : "Photo"), p.caption && p.video ? "video" : "", p.place, fmtDate(p)].filter(Boolean).join(", ");
      const badge = document.createElement("span"); badge.className = "new-photo-badge";
      badge.textContent = "New"; badge.hidden = !isNew; badge.setAttribute("aria-hidden", "true");
      b.append(badge);
      const tally = document.createElement("span"); tally.className = "tally"; tally.setAttribute("aria-hidden", "true");
      collagePhotos[i] = { button: b, badge, label, tally };
      const img = document.createElement("img"); img.loading = "lazy"; img.alt = ""; img.src = p.thumb || fullSrc(p);
      if (p.video) {
        const badge = document.createElement("span"); badge.className = "play"; badge.setAttribute("aria-hidden", "true");
        badge.textContent = p.duration ? `▶ ${durationText(p.duration)}` : "▶"; b.append(badge);
      }
      const cap = document.createElement("span"); cap.className = "cap";
      const pl = document.createElement("span"); pl.className = "place"; pl.textContent = p.place || "";
      const dt = document.createElement("span"); dt.className = "date"; dt.textContent = fmtDate(p);
      cap.append(pl, dt); b.append(img, cap, tally);
      showTally(i);
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
// screen, facing whichever side is nearer the current view (showCard overrides that with the front).
// A phone on its side hides the masthead and months in card view (style.css), so the card gets 86%
// of the height, in the room left of the tools column: `side` is how far right of the card to look.
const SIDEWAYS = matchMedia("(orientation: landscape) and (max-height: 500px)");
// The share of the screen's width the tools column takes, with a gap, in card view on a phone on its side.
function cardReserve() {
  return SIDEWAYS.matches ? clamp01((innerWidth - $("tools").getBoundingClientRect().left + 8) / innerWidth) : 0;
}
function cardView() {
  const { w, h } = cardMesh.userData, aspect = innerWidth / innerHeight, c = current(), res = cardReserve();
  const radius = Math.max((w / 2) / (tanHalf() * aspect * (1 - res) * 0.92), (h / 2) / (tanHalf() * (SIDEWAYS.matches ? 0.86 : 0.74)), TREE_MIN_DIST);
  const off = (a) => Math.abs(((((a - c.azim + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI);
  const front = card.rotation.y, azim = off(front) <= off(front + Math.PI) ? front : front + Math.PI;
  return { targetY: card.userData.baseY, radius, polar: 1.53, azim, side: radius * tanHalf() * aspect * res };
}
// Card view: the dock's card button reads "Flip it" and "Back to the tree" appears, and the camera
// holds still on the card instead of drifting back into the slow turn.
let cardMode = false;
function setCardMode(on) {
  if (cardMode === on) return;
  cardMode = on;
  $("btn-flip-label").textContent = on ? "Flip it" : "See our card";
  $("btn-tree").hidden = !on;
  $("app").classList.toggle("card-mode", on);
  // Zooming in on the card: one finger pans once zoomed in (cardGestures).
  controls.minDistance = on ? cardView().radius / CARD_ZOOM : TREE_MIN_DIST;
  if (on && card) card.position.y = card.userData.baseY;   // hold still to be read, no bobbing
  cardGestures(); updateHint();   // cardGestures skips the hint when the zoom state hasn't changed
  stripFade($("tools"));
}
// The first tap flies in to the card's front; once there, each tap flips it (fitting it back first if zoomed in).
async function showCard() {
  if (!introDone) finishIntro();
  holdRotation(0);
  if (cardMode) { if (cardZoomed()) await fitCard(); flipCard(); return; }
  setCardMode(true);
  await flyTo({ ...cardView(), azim: card.rotation.y }, 0.9);
}

// ---------------------------------------------------------------------------------------------
// Zooming in on the card, in card view only: pinch (or scroll) toward a spot, up to CARD_ZOOM× the
// fitted size. The 2026 front is 1389 px wide, sharp to about 2× on a phone; past that it softens. Zoomed in, one finger (or the
// mouse) slides over the card instead of turning it, and can't slide past its edges; a tap fits it
// back. Leaving card view puts the tree's own limits back.
// ---------------------------------------------------------------------------------------------
const CARD_ZOOM = 3;
const FINE_POINTER = matchMedia("(pointer: fine)").matches;
const TREE_HINT = FINE_POINTER ? "Drag to turn it, scroll to zoom. Tap a photo, or the card." : "Drag to turn, pinch to zoom. Tap a photo or the card.";
// The masthead's one line of help says what the view in front of you does: the card's gestures in card
// view, what a month button did, and on the tree the how-to, until a photo has been opened. It fades
// rather than going, so the masthead (and the room framing() keeps for it) doesn't change height.
let hintLearned = false;
function updateHint() {
  const el = $("hint");
  let text = "";
  if (cardMode) {
    text = cardZoomed() ? `Drag to look around. ${FINE_POINTER ? "Click" : "Tap"} to fit it back.`
      : FINE_POINTER ? "Scroll to zoom in. Click the card to flip it." : "Pinch to zoom in. Tap the card to flip it.";
  } else if (activeMonth >= 0) {
    const n = monthLit.size, m = MONTHS_LONG[activeMonth];
    text = `${n === 1 ? `${m}'s photo is` : `${m}'s ${n} photos are`} lit up. Tap ${MONTHS[activeMonth]} again for the whole year.`;
  } else if (!hintLearned) text = TREE_HINT;
  if (text) el.textContent = text;
  el.classList.toggle("quiet", !text);
}
updateHint();

// ---------------------------------------------------------------------------------------------
// "Tap a photo". The masthead's how-to was too easy to miss on a phone, and a slowly turning tree reads
// as something to watch, not something to tap. Until this browser has opened a photo, a ring rides on one
// polaroid facing us near the middle of the screen, and moves on to another as the tree turns that one
// away. It's only a picture: taps go straight through it to the tree.
// ---------------------------------------------------------------------------------------------
const TAPPED_KEY = "xmas26-tapped", SWIPED_KEY = "xmas26-swiped";
const remembered = (k) => { try { return localStorage.getItem(k) === "1"; } catch { return false; } };
const remember = (k) => { try { localStorage.setItem(k, "1"); } catch { /* private window: shown again next visit */ } };
let tapped = remembered(TAPPED_KEY);
const coachEl = $("coach"), coachV = new THREE.Vector3();
const coach = { i: -1, x: 0, y: 0, r: 30, after: 0 };
/** How squarely a polaroid faces the camera, around the trunk: 1 head on, 0 side on, below 0 the far side. */
function facing(mesh) {
  toCam.copy(camera.position).sub(mesh.position).normalize();
  return (toCam.x * mesh.position.x + toCam.z * mesh.position.z) / Math.hypot(mesh.position.x, mesh.position.z);
}
function toScreen(v) { v.project(camera); return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight }; }
// The room between the masthead (and the label above the ring) and the dock.
function coachRoom() {
  return { top: document.querySelector(".mast").getBoundingClientRect().bottom + 70, bottom: $("dock").getBoundingClientRect().top - 30, left: 40, right: innerWidth - 40 };
}
const inRoom = (s, room) => s.y > room.top && s.y < room.bottom && s.x > room.left && s.x < room.right;
function pickCoach(room) {
  const cx = innerWidth / 2, cy = (room.top + room.bottom) / 2;
  let best = -1, bestD = Infinity;
  pols.forEach(({ mesh }, i) => {
    if (facing(mesh) < 0.75) return;
    const s = toScreen(coachV.copy(mesh.position));
    if (!inRoom(s, room)) return;
    const d = Math.hypot(s.x - cx, (s.y - cy) * 0.6);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}
function updateCoach(now) {
  if (!introDone) coach.after = now + 1200;   // let the tree settle first
  const show = !tapped && introDone && now > coach.after && !cardMode && !flying && activeMonth < 0 && !overlayOpen()
    && $("hello").hidden && $("note").hidden && $("waitlist").hidden;
  if (!show) { if (coach.i >= 0) { coach.i = -1; coachEl.classList.add("off"); } return; }
  const room = coachRoom(), was = coach.i;
  if (coach.i < 0 || facing(pols[coach.i].mesh) < 0.45 || !inRoom(toScreen(coachV.copy(pols[coach.i].mesh.position)), room)) coach.i = pickCoach(room);
  if (coach.i < 0) { coachEl.classList.add("off"); return; }
  const m = pols[coach.i].mesh, s = toScreen(coachV.copy(m.position));
  coachV.copy(m.position); coachV.y += (m.geometry.parameters.height / 2) * m.scale.y;
  const r = Math.max(26, Math.abs(s.y - toScreen(coachV).y) * 1.4);   // a little wider than the polaroid
  // Follow closely, and glide (rather than jump) when it moves on to another photo.
  const k = was < 0 ? 1 : 0.25;
  coach.x += (s.x - coach.x) * k; coach.y += (s.y - coach.y) * k; coach.r += (r - coach.r) * k;
  coachEl.style.transform = `translate(${coach.x.toFixed(1)}px, ${coach.y.toFixed(1)}px)`;
  coachEl.style.setProperty("--r", `${coach.r.toFixed(1)}px`);
  coachEl.classList.remove("off");
}

// The first photo opened on a visit, until this browser has gone from one photo to the next, shows how:
// the photo leans toward the next one and back, as a finger would push it, › pulses, and the note says so.
let swiped = remembered(SWIPED_KEY), taught = false, teachTimer = 0;
function teachSwipe() {
  if (swiped || taught || photos.length < 2) return;
  taught = true;
  clearTimeout(teachTimer);
  teachTimer = setTimeout(() => {
    if (lbIndex < 0 || swiped || gesture || zoom.s > 1) return;
    flashNote(FINE_POINTER ? "Use › or the arrow keys for the next photo" : "Swipe for the next photo", 4000);
    $("lb-next").classList.add("beckon");
    teachTimer = setTimeout(() => $("lb-next").classList.remove("beckon"), 3600);
    if (!REDUCE && !FINE_POINTER) {
      figEl.animate([
        { transform: BASE_TILT },
        { transform: "translateX(-24%) rotate(-3.4deg)", offset: 0.3 },
        { transform: BASE_TILT, offset: 0.6 },
        { transform: "translateX(-9%) rotate(-2deg)", offset: 0.75 },
        { transform: BASE_TILT },
      ], { duration: 1500, easing: "cubic-bezier(.45, 0, .2, 1)" });
    }
  }, 800);   // after the photo's own entrance
}
function learnedSwipe() {
  clearTimeout(teachTimer); $("lb-next").classList.remove("beckon");
  if (!swiped) { swiped = true; remember(SWIPED_KEY); }
}

const cardZoomed =() => cardMode && current().radius < cardView().radius * 0.92;
function fitCard() { holdRotation(0); return flyTo(cardView(), 0.5); }
let zoomedBefore = null;
function cardGestures() {
  const zoomed = cardZoomed();
  if (zoomed === zoomedBefore && cardMode) return;
  zoomedBefore = zoomed;
  controls.touches.ONE = zoomed ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
  controls.mouseButtons.LEFT = zoomed ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
  updateHint();
}
const cardRight = new THREE.Vector3(), shift = new THREE.Vector3();
/**
 * Keeps the card filling the screen like a photo viewer: a pan stops where the card's edge meets the
 * screen's edge, and zooming back out slides it back to the middle. On a phone on its side, "the
 * screen" is the part left of the tools column, so the middle is that part's middle.
 */
function keepOnCard() {
  if (!cardMode || flying || !cardMesh) return;
  const { w, h } = cardMesh.userData, t = controls.target, c = current(), res = cardReserve();
  const halfH = c.radius * tanHalf(), halfW = halfH * camera.aspect * (1 - res);   // the part of the card in view
  const mid = halfH * camera.aspect * res;   // how far right of the card's centre the view's centre sits when it's fitted
  const roomU = Math.max(0, w / 2 - halfW), roomV = Math.max(0, h / 2 - halfH);
  cardRight.set(Math.cos(c.azim), 0, -Math.sin(c.azim));   // the camera's right; the card is centred on the y axis
  const v = t.y - card.userData.baseY, u = THREE.MathUtils.clamp(c.side, mid - roomU, mid + roomU);
  const dv = THREE.MathUtils.clamp(v, -roomV, roomV) - v;
  // Back onto the line through the card, at the clamped distance to the side (drops any drift toward or away from it).
  shift.copy(cardRight).multiplyScalar(u).sub(t).setY(dv);
  if (Math.abs(shift.x) + Math.abs(shift.y) + Math.abs(shift.z) < 1e-9) return;
  t.add(shift); camera.position.add(shift);
}
/**
 * On the tree, a two-finger drag (or a zoom toward a spot) slides the view up and down the trunk,
 * from the star to the card. It stays on the trunk, so turning it still spins the tree in place
 * rather than swinging around a point off to one side. The closest you can get follows the tree's
 * width at that height, so a zoom stops at the photos instead of going through them.
 */
function keepOnTree() {
  if (cardMode || flying || !introDone) return;
  const t = controls.target;
  // From the card to the star in the middle of the screen, never off into the floor or the sky; the
  // home view's height always fits, so letting go after a turn never jumps.
  const home = framing().targetY, lo = Math.min(CARD_Y, home), hi = Math.max(TREE_T + 0.3, home);
  shift.set(-t.x, THREE.MathUtils.clamp(t.y, lo, hi) - t.y, -t.z);
  if (shift.x || shift.y || shift.z) { t.add(shift); camera.position.add(shift); }
  const across = R_B + (R_T - R_B) * clamp01((t.y - TREE_B) / (TREE_T - TREE_B));
  controls.minDistance = Math.max(TREE_MIN_DIST, (t.y < TREE_B ? 0 : across) + 0.45);   // 2.4 at the bottom: where a tapped photo flies to
}
controls.addEventListener("change", () => { if (cardMode) { keepOnCard(); cardGestures(); } else keepOnTree(); });
function leaveCard() { setCardMode(false); flyHome(); holdRotation(3000); }
$("btn-flip").addEventListener("click", showCard);
$("btn-tree").addEventListener("click", leaveCard);
// Pinching well out from the card counts as leaving it. Zooming in doesn't: that's reading it.
controls.addEventListener("end", () => { if (cardMode && current().radius > cardView().radius + 1) { setCardMode(false); holdRotation(); } });
$("btn-replay").addEventListener("click", () => { setCardMode(false); activeMonth = -1; monthLit.clear(); buildMonths(); updateHint(); startIntro(); });

// The months and (on a phone) the tools scroll sideways; fade the edge that has more to show.
function stripFade(el) {
  const l = el.scrollLeft > 2, r = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
  el.classList.toggle("more-l", l); el.classList.toggle("more-r", r);
}
for (const id of ["months", "tools"]) $(id).addEventListener("scroll", (e) => stripFade(e.currentTarget), { passive: true });
// Hide the words and buttons so nothing covers the tree (on a phone the masthead sits over its top).
// If the view is at home, it glides to the new home that uses the whole screen; a zoomed-in view stays put.
// Not remembered: the next visit opens with the greeting.
function setChromeHidden(on) {
  const home = framing(), c = current();
  const atHome = introDone && !cardMode && !flying && !overlayOpen()
    && Math.abs(c.radius - home.dist) < home.dist * 0.04 && Math.abs(c.targetY - home.targetY) < 0.1;
  chromeHidden = on;
  $("app").classList.toggle("bare", on);
  const btn = $("btn-chrome"), label = on ? "Show the words and buttons" : "Hide the words and buttons";
  btn.setAttribute("aria-pressed", String(on)); btn.title = label;
  if (atHome) flyHome(0.6);
}
$("btn-chrome").addEventListener("click", () => setChromeHidden(!chromeHidden));

let snowOn = true;
$("btn-snow").addEventListener("click", (e) => { snowOn = !snowOn; e.currentTarget.setAttribute("aria-pressed", String(snowOn)); if (!snowOn) snowCtx.clearRect(0, 0, snowCv.width, snowCv.height); });

document.addEventListener("keydown", (e) => {
  if (!$("lightbox").hidden) {
    if (!$("react-pick").hidden) { if (e.key === "Escape") closePicker(); }   // the sheet's own keys only
    else if (e.key === "ArrowRight") stepLightbox(1);
    else if (e.key === "ArrowLeft") stepLightbox(-1);
    else if (e.key === "Escape") { if (zoom.s > 1) setZoom(1, 0, 0, true); else closeLightbox(); }
  } else if (e.key === "Escape") {
    if (!$("hello").hidden) $("hello-skip").click();
    else if (!$("note").hidden) closeNote();
    else if (!$("waitlist").hidden) $("wl-close").click();
    else if (!$("collage").hidden) $("collage-close").click();
  } else if (e.key.toLowerCase() === "h" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.target.closest("input, textarea")
    && $("collage").hidden && $("hello").hidden && $("note").hidden && $("waitlist").hidden) {
    setChromeHidden(!chromeHidden);
  }
});

const loadImg = (url) => new Promise((res, rej) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = rej; i.src = url; });

// ---------------------------------------------------------------------------------------------
// Get the app: the launch waitlist (merryroll SPEC §5.6). The API stores the email, where it came
// from and when, nothing else, and answers the same for a new or repeat address.
// ---------------------------------------------------------------------------------------------
const WAITLIST_URL = `${API_BASE}/waitlist`;
const EMAIL_OK = /^[^\s@]+@[^\s@.][^\s@]*\.[^\s@]{2,}$/;
let wlReturn = null;
function openWaitlist(from) {
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

// ---------------------------------------------------------------------------------------------
// Who's opening the card: asked once, before the tree appears. The name stays in this browser to
// greet them, and each new name is posted to the API. Skipping is remembered too ("" in storage),
// counted once (anonymously), and leaves an "add your name" link in the greeting for later.
// ---------------------------------------------------------------------------------------------
const NAME_KEY = "xmas26-name";
const storedName = () => { try { return localStorage.getItem(NAME_KEY); } catch { return null; } };
const storeName = (name) => { try { localStorage.setItem(NAME_KEY, name); } catch { /* private window: ask again next time */ } };
/** `name` is null before anyone's asked, "" after a skip (offer to add one), else the name. */
function greet(name) {
  const add = name === "";
  $("who").textContent = add ? "add your name" : name || "";
  $("who").title = add ? "Add your name" : "Change your name";
  $("who").classList.toggle("add", add);
  $("who-sep").textContent = add ? " · " : ", ";
  $("who-wrap").hidden = !name && !add;
}
let helloDone = null;
function openHello(change = false) {
  $("hello-name").value = storedName() || "";
  $("hello-skip").textContent = change ? "Cancel" : "Skip";
  $("hello").hidden = false; $("hello-name").focus();
  return new Promise((res) => (helloDone = res));
}
function closeHello() {
  const wasChange = $("hello-skip").textContent === "Cancel";
  $("hello").hidden = true; helloDone?.(); helloDone = null;
  if (wasChange) $("who").focus();
}
$("hello-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = cleanName($("hello-name").value), before = storedName();
  if (!name) return $("hello-skip").click();
  storeName(name); greet(name);
  if (name !== before) {
    fetch(`${API_BASE}/visitors`, {
      method: "POST", headers: { "content-type": "application/json" }, keepalive: true,
      body: JSON.stringify({ name, source: "xmas26", website: $("hello-website").value }),
    }).catch(() => {});
  }
  closeHello();
});
$("hello-skip").addEventListener("click", () => {
  if (storedName() === null) {   // the first skip, not Cancel on a change: count it, with nothing about who
    storeName("");
    fetch(`${API_BASE}/visitors`, {
      method: "POST", headers: { "content-type": "application/json" }, keepalive: true,
      body: JSON.stringify({ skipped: true, source: "xmas26", website: $("hello-website").value }),
    }).catch(() => {});
  }
  if (!recipient) greet(storedName() ?? "");
  closeHello();
});
$("who").addEventListener("click", () => (recipient ? recipient.message && openNote(true) : openHello(true)));

// A personal link: no question to ask. The name comes from the family, and their note opens first.
let recipient = null, noteDone = null, noteReopened = false;
function openNote(again = false) {
  noteReopened = again;
  $("note-title").textContent = `Mele Kalikimaka, ${recipient.name}`;
  $("note-msg").textContent = recipient.message;
  $("note-open").textContent = again ? "Close" : "Open the card";
  $("note").hidden = false; holdRotation(0); $("note-open").focus();
  return new Promise((res) => (noteDone = res));
}
function closeNote() {
  $("note").hidden = true; holdRotation(3000); noteDone?.(); noteDone = null;
  if (noteReopened) $("who").focus();
}
$("note-open").addEventListener("click", closeNote);
function greetRecipient(r) {
  recipient = r; greet(r.name);
  $("who").title = r.message ? "Read your note" : "";
  $("who").disabled = !r.message;
  return r.message ? openNote() : null;
}

function setPhotos(list) {
  photos = list; activeMonth = -1; monthLit.clear();
  setCardMode(false); updateHint();
  buildTree(photos); buildMonths(); buildCollage(); stripFade($("months"));
  updateNewPhotoCount();
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
  if (introDone && !flying && !overlayOpen()) {
    const v = cardMode ? cardView() : { ...framing(), radius: framing().dist, azim: current().azim };
    place(v.targetY, v.radius, v.polar, v.azim, v.side);
  }
  stripFade($("months")); stripFade($("tools"));
  fitLightbox();
}
addEventListener("resize", resize);

function frame(now) {
  requestAnimationFrame(frame);
  const t = now / 1000, e = (now - introStart) / 1000;
  runTweens(now);
  updateIntro(e);
  animateLights(t, e);
  animatePolaroids(t);
  if (card && !flipping && !REDUCE && !cardMode) card.position.y = card.userData.baseY + Math.sin(t * 0.9) * 0.025;
  if (!flying) controls.update();
  renderer.render(scene, camera);
  updateCoach(now);
  drawSnow(t);
}

// ---------------------------------------------------------------------------------------------
// Boot: the family's year from the API. Until the collection has photos and the card images are set,
// the painted samples stand in, and the masthead says which parts are samples.
// ---------------------------------------------------------------------------------------------
async function loadYear(paintedPhotos, paintedCard) {
  let data = null;
  try { data = await fetchCard({ to: TO }); } catch (e) { console.warn("Showing the sample year:", e.message); }

  let list = [];
  const picks = photosFromApi(data?.photos);
  if (picks.length) {
    const loaded = await Promise.all(picks.map((p) => loadImg(p.thumb).then((source) => ({ ...p, source }), () => null)));
    list = loaded.filter(Boolean);
  }
  const urls = cardFaces(data?.card);
  const [front, back] = await Promise.all([urls.front, urls.back].map((u) => (u ? loadImg(u).catch(() => null) : null)));
  return {
    recipient: recipientFromApi(data?.recipient),
    picks,
    photos: list.length ? list : paintedPhotos,
    card: { front: front || paintedCard.front, back: back || paintedCard.back },
    label: previewLabel({ realPhotos: list.length > 0, realFront: !!front, realBack: !!back }),
    reactions: list.length ? reactionsFromApi(data?.reactions) : [],   // the sample photos can't be reacted to
  };
}

(async () => {
  // Ask while the year loads, so the question costs no extra wait. A personal link waits to see who it's for.
  greet(storedName());
  let hello = !TO && storedName() === null ? openHello() : null;
  const fonts = Promise.all([`36px ${HAND}`, `100px ${DISPLAY}`, `600 34px ${BODY}`].map((f) => document.fonts.load(f)));
  await Promise.race([fonts, new Promise((r) => setTimeout(r, 2000))]);
  const painted = SAMPLE_PHOTOS.map((p) => ({ ...p, source: paintSample(p) }));
  const year = await loadYear(painted, sampleCard(painted));
  $("draft").hidden = !year.label;
  $("draft").textContent = year.label ?? "";
  buildCard(year.card.front, year.card.back);
  resize();
  if (year.recipient) hello = greetRecipient(year.recipient);
  else if (TO && storedName() === null) hello = openHello();   // a code we don't know: ask, like everyone else
  await hello;
  photoHistory = createPhotoHistory(year.picks);
  buildReactions(year.reactions);
  setPhotos(year.photos);
  requestAnimationFrame(frame);
  $("loading").classList.add("gone");
  setTimeout(() => ($("loading").hidden = true), 700);
})();
