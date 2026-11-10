// The painted sample year and sample card: the page shows them until the family collection has
// photos and the card images are set (see data.js). Moved out of main.js unchanged.

export const HAND = '"Nanum Pen Script", "Bradley Hand", cursive';
export const DISPLAY = '"Gloock", Georgia, serif';
export const BODY = '"Hanken Grotesk", system-ui, sans-serif';

export const SAMPLE_PHOTOS = [
  ["2026-01-01", "Lanikai", "New Year's Day swim", "beach", "Alex"],
  ["2026-01-18", "Mānoa Falls", "Muddy, and worth it", "falls", "Laura"],
  ["2026-02-14", "Home", "Valentine's pancakes", "kitchen", "Laura"],
  ["2026-02-28", "Diamond Head", "Sunrise from the top", "ridge", "Alex"],
  ["2026-03-04", "Kyoto", "Temple steps at sunrise", "torii", "Laura"],
  ["2026-03-06", "Kyoto", "Lanterns down the alley", "lanterns", "Alex"],
  ["2026-03-08", "Arashiyama", "The bamboo forest", "bamboo", "Laura"],
  ["2026-04-05", "Kailua", "Easter egg hunt", "garden", "Laura"],
  ["2026-04-26", "Ala Moana", "Picnic at the beach park", "beach", "Alex"],
  ["2026-05-10", "Home", "Mother's Day lei", "flowers", "Alex"],
  ["2026-05-23", "North Shore", "Honu came to say hi", "sea", "Laura"],
  ["2026-06-14", "Waimea Valley", "Waterfall swim", "falls", "Alex"],
  ["2026-06-30", "Ko Olina", "Lagoon day", "lagoon", "Laura"],
  ["2026-07-04", "Waikīkī", "Fireworks from the sand", "fireworks", "Alex"],
  ["2026-07-12", "Lanikai", "Sunset swim", "sunset", "Laura"],
  ["2026-07-19", "Kualoa", "Hiking the valley", "ridge", "Alex"],
  ["2026-08-03", "Mānoa", "Rainbow after school", "rainbow", "Laura"],
  ["2026-08-17", "Kaimukī", "First day of school", "city", "Alex"],
  ["2026-09-07", "Haleʻiwa", "Shave ice, two scoops", "shaveice", "Laura"],
  ["2026-09-20", "Kailua", "Bike ride to the beach", "beach", "Alex"],
  ["2026-10-11", "Tantalus", "Lookout at golden hour", "sunset", "Laura"],
  ["2026-10-31", "Home", "The Halloween crew", "pumpkin", "Alex"],
  ["2026-11-08", "Kāneʻohe", "Sandbar morning", "lagoon", "Laura"],
  ["2026-11-26", "Home", "Thanksgiving table", "kitchen", "Alex"],
  ["2026-12-05", "Honolulu Hale", "Christmas lights downtown", "lights", "Laura"],
  ["2026-12-13", "Home", "The tree goes up", "tree", "Alex"],
].map(([takenAt, place, caption, scene, addedBy], i) => ({ id: `s${i}`, takenAt, place, caption, scene, addedBy }));

// ---------------------------------------------------------------------------------------------
// Sample images, painted on canvas: what the page shows until the family's own photos are in.
// ---------------------------------------------------------------------------------------------
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash(s) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

export function lin(c, x0, y0, x1, y1, stops) { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; }
function sky(c, w, h, cols, to = 1) { c.fillStyle = lin(c, 0, 0, 0, h * to, cols.map((col, i) => [i / (cols.length - 1), col])); c.fillRect(0, 0, w, h); }
function band(c, w, y, hh, top, bottom) { c.fillStyle = lin(c, 0, y, 0, y + hh, [[0, top], [1, bottom]]); c.fillRect(0, y, w, hh); }
function disc(c, x, y, rad, col, blur = 0) { c.save(); c.shadowColor = col; c.shadowBlur = blur; c.fillStyle = col; c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill(); c.restore(); }
function ell(c, x, y, rx, ry, col, rot = 0) { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); c.fill(); }
function ridge(c, w, y, amp, col, r, floor, step = 18) {
  c.fillStyle = col; c.beginPath(); c.moveTo(0, floor);
  let yy = y + (r() - 0.5) * amp;
  for (let x = 0; x <= w + step; x += step) { yy += (r() - 0.5) * amp * 0.7; yy = Math.min(y + amp, Math.max(y - amp, yy)); c.lineTo(x, yy); }
  c.lineTo(w, floor); c.closePath(); c.fill();
}
function sand(c, w, h, y, a, b) { c.fillStyle = lin(c, 0, y, 0, h, [[0, a], [1, b]]); c.beginPath(); c.moveTo(0, y + 6); c.quadraticCurveTo(w * 0.5, y - 14, w, y + 10); c.lineTo(w, h); c.lineTo(0, h); c.fill(); }
function clouds(c, w, y, r) {
  c.save(); c.fillStyle = "rgba(255,255,255,0.82)";
  for (let i = 0; i < 3; i++) { const x = r() * w, yy = y * (0.5 + r()), s = 14 + r() * 22; for (let j = 0; j < 5; j++) { c.beginPath(); c.arc(x + j * s * 0.7, yy - (j % 2) * s * 0.35, s * (0.55 + r() * 0.3), 0, Math.PI * 2); c.fill(); } }
  c.restore();
}
function foam(c, w, y, r) {
  c.save(); c.strokeStyle = "rgba(255,255,255,0.75)"; c.lineWidth = 3; c.beginPath(); c.moveTo(0, y);
  for (let x = 0; x <= w; x += 16) c.lineTo(x, y + Math.sin(x * 0.05 + r() * 2) * 3);
  c.stroke(); c.restore();
}
function bokeh(c, w, h, cols, n, r, min = 4, max = 22, alpha = 0.55) {
  c.save(); c.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i++) {
    const col = cols[Math.floor(r() * cols.length)], rad = min + r() * (max - min), x = r() * w, y = r() * h;
    const g = c.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)");
    c.globalAlpha = alpha * (0.4 + r() * 0.6); c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  c.restore();
}
function palm(c, x, base, hgt, col, r) {
  c.save(); c.strokeStyle = col; c.lineCap = "round";
  const lean = (r() - 0.5) * hgt * 0.5, tx = x + lean, ty = base - hgt;
  c.lineWidth = hgt * 0.035; c.beginPath(); c.moveTo(x, base); c.quadraticCurveTo(x + lean * 0.15, base - hgt * 0.5, tx, ty); c.stroke();
  c.lineWidth = hgt * 0.022;
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI + i * (Math.PI / 7) + (r() - 0.5) * 0.25, len = hgt * (0.32 + r() * 0.14);
    c.beginPath(); c.moveTo(tx, ty);
    c.quadraticCurveTo(tx + Math.cos(a) * len * 0.6, ty + Math.sin(a) * len * 0.6 - len * 0.2, tx + Math.cos(a) * len, ty + Math.sin(a) * len * 0.4 + len * 0.3);
    c.stroke();
  }
  c.restore();
}

const PAINT = {
  beach(c, w, h, r) {
    sky(c, w, h, ["#4fa9dc", "#a9def0", "#e3f4f6"], 0.55); clouds(c, w, h * 0.3, r);
    band(c, w, h * 0.5, h * 0.2, "#1f7fae", "#3fb6c9"); foam(c, w, h * 0.64, r);
    sand(c, w, h, h * 0.7, "#ecd9aa", "#d6bb80");
    if (r() > 0.3) palm(c, r() > 0.5 ? w * 0.13 : w * 0.87, h * 0.9, h * 0.66, "#21402c", r);
  },
  sunset(c, w, h, r) {
    sky(c, w, h, ["#251d45", "#86406b", "#ec7f5a", "#ffcf87"], 0.64);
    const sx = w * (0.3 + r() * 0.4); disc(c, sx, h * 0.63, h * 0.08, "#fff0c2", 50);
    band(c, w, h * 0.64, h * 0.36, "#3a3557", "#1b1931");
    c.fillStyle = "rgba(255,196,140,0.6)";
    for (let i = 0; i < 12; i++) { const ww = Math.max(4, w * (0.16 - i * 0.011)); c.fillRect(sx - ww / 2 + (r() - 0.5) * 12, h * 0.655 + i * h * 0.026, ww, 2); }
    palm(c, w * 0.1, h * 1.02, h * 0.8, "#130f20", r); if (r() > 0.4) palm(c, w * 0.9, h * 1.04, h * 0.6, "#130f20", r);
  },
  lagoon(c, w, h, r) {
    sky(c, w, h, ["#6ec3e6", "#d3eff4"], 0.42); clouds(c, w, h * 0.2, r);
    ridge(c, w, h * 0.36, h * 0.06, "#2f6a40", r, h * 0.46);
    band(c, w, h * 0.45, h * 0.55, "#29b6bd", "#a6ecd9");
    sand(c, w, h, h * 0.84, "#f1e2b8", "#e2cb92"); palm(c, w * 0.82, h * 0.92, h * 0.7, "#24432d", r);
  },
  sea(c, w, h, r) {
    sky(c, w, h, ["#63cde0", "#1b7aa3", "#0b3b5e"]);
    c.save(); c.globalAlpha = 0.18; c.fillStyle = "#ffffff";
    for (let i = 0; i < 5; i++) { const x = r() * w; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 30, 0); c.lineTo(x + 90 + r() * 60, h); c.lineTo(x + 40, h); c.fill(); }
    c.restore();
    const tx = w * (0.4 + r() * 0.2), ty = h * (0.48 + r() * 0.1), s = Math.min(w, h) * 0.17;
    ell(c, tx - s * 0.9, ty - s * 0.5, s * 0.45, s * 0.14, "#5d6b3c", -0.5); ell(c, tx - s * 0.9, ty + s * 0.5, s * 0.45, s * 0.14, "#5d6b3c", 0.5);
    ell(c, tx + s * 0.7, ty - s * 0.55, s * 0.3, s * 0.1, "#5d6b3c", 0.6); ell(c, tx + s * 0.7, ty + s * 0.55, s * 0.3, s * 0.1, "#5d6b3c", -0.6);
    ell(c, tx - s * 1.15, ty, s * 0.28, s * 0.22, "#7a8650"); ell(c, tx, ty, s, s * 0.72, "#6b5233"); ell(c, tx, ty, s * 0.8, s * 0.56, "#8a6a3f");
    bokeh(c, w, h, ["rgba(255,255,255,0.9)"], 14, r, 2, 6, 0.6);
  },
  falls(c, w, h, r) {
    sky(c, w, h, ["#a6c9c4", "#e2ece2"], 0.4);
    ridge(c, w, h * 0.16, h * 0.08, "#4a7a52", r, h); ridge(c, w, h * 0.3, h * 0.1, "#2c5537", r, h);
    const fx = w * (0.4 + r() * 0.2);
    c.fillStyle = lin(c, 0, h * 0.24, 0, h * 0.82, [[0, "rgba(255,255,255,0.95)"], [1, "rgba(215,238,238,0.85)"]]); c.fillRect(fx - w * 0.045, h * 0.24, w * 0.09, h * 0.58);
    disc(c, fx, h * 0.8, w * 0.13, "rgba(255,255,255,0.4)", 40);
    ridge(c, w, h * 0.7, h * 0.05, "#1f4229", r, h); ell(c, fx, h * 0.86, w * 0.22, h * 0.05, "#3d7f80");
  },
  ridge(c, w, h, r) {
    sky(c, w, h, ["#7fb4dc", "#cfe1e8", "#f4c9a0"], 0.62); disc(c, w * (0.6 + r() * 0.3), h * 0.4, h * 0.05, "#fff3d6", 30);
    ridge(c, w, h * 0.42, h * 0.16, "#3f7a4c", r, h, 14); ridge(c, w, h * 0.6, h * 0.08, "#2b5a36", r, h); ridge(c, w, h * 0.82, h * 0.04, "#1c3d26", r, h);
  },
  rainbow(c, w, h, r) {
    sky(c, w, h, ["#7d93a8", "#c7d3d6"], 0.7);
    c.save(); c.globalAlpha = 0.5; c.lineWidth = Math.max(4, h * 0.018);
    ["#e5534b", "#f0a33a", "#f4e15b", "#5fbf6a", "#4c8fd6", "#7b5cc8"].forEach((col, i) => { c.strokeStyle = col; c.beginPath(); c.arc(w * 0.62, h * 0.9, h * 0.62 - i * c.lineWidth, Math.PI, Math.PI * 2); c.stroke(); });
    c.restore();
    ridge(c, w, h * 0.62, h * 0.06, "#4f8a4a", r, h); ridge(c, w, h * 0.8, h * 0.03, "#2f6435", r, h);
  },
  torii(c, w, h, r) {
    sky(c, w, h, ["#f2c6a0", "#f7e3c8"], 0.7); ridge(c, w, h * 0.55, h * 0.04, "#8c9a7a", r, h);
    band(c, w, h * 0.78, h * 0.22, "#b8a488", "#9c8a70");
    const cx = w * 0.5, gw = w * 0.42, top = h * 0.24, foot = h * 0.82;
    c.fillStyle = "#c43a2b";
    c.fillRect(cx - gw / 2, top + h * 0.04, gw * 0.08, foot - top); c.fillRect(cx + gw / 2 - gw * 0.08, top + h * 0.04, gw * 0.08, foot - top);
    c.fillRect(cx - gw * 0.62, top, gw * 1.24, h * 0.045); c.fillRect(cx - gw * 0.52, top + h * 0.11, gw * 1.04, h * 0.03);
    c.fillStyle = "#1f1a18"; c.fillRect(cx - gw * 0.66, top - h * 0.02, gw * 1.32, h * 0.025);
    c.strokeStyle = "rgba(90,70,50,0.45)"; c.lineWidth = 2;
    for (let i = 0; i < 6; i++) { const y = foot + i * h * 0.03; c.beginPath(); c.moveTo(cx - gw * 0.3 - i * 8, y); c.lineTo(cx + gw * 0.3 + i * 8, y); c.stroke(); }
  },
  lanterns(c, w, h, r) {
    sky(c, w, h, ["#120d18", "#2a1a22"]);
    c.fillStyle = "#1a1216"; c.fillRect(0, 0, w * 0.18, h); c.fillRect(w * 0.82, 0, w * 0.18, h);
    for (let row = 0; row < 6; row++) {
      const k = 1 - row * 0.14, y = h * (0.28 + row * 0.07), sz = w * 0.07 * k;
      [w * 0.5 - w * 0.3 * k, w * 0.5 + w * 0.3 * k].forEach((x) => { disc(c, x, y, sz * 1.6, "rgba(255,140,60,0.25)", 30); ell(c, x, y, sz * 0.8, sz, "#ff8a3d"); ell(c, x, y, sz * 0.5, sz * 0.75, "#ffc078"); });
    }
    band(c, w, h * 0.78, h * 0.22, "#2b1d1d", "#120c0e"); bokeh(c, w, h * 0.3, ["#ffb066"], 10, r, 3, 10, 0.4);
  },
  bamboo(c, w, h, r) {
    sky(c, w, h, ["#d8ecc0", "#86b86f"]);
    c.save(); c.globalAlpha = 0.25; c.fillStyle = "#fffbe0"; c.beginPath(); c.moveTo(w * 0.35, 0); c.lineTo(w * 0.55, 0); c.lineTo(w * 0.75, h); c.lineTo(w * 0.45, h); c.fill(); c.restore();
    for (let i = 0; i < 14; i++) {
      const x = r() * w, sw = 6 + r() * 14, col = ["#3f7a3a", "#4e8b40", "#2e6330", "#6a9d4c"][i % 4];
      c.fillStyle = col; c.fillRect(x, 0, sw, h);
      c.fillStyle = "rgba(0,0,0,0.25)"; for (let y = r() * 60; y < h; y += 50 + r() * 30) c.fillRect(x, y, sw, 3);
    }
  },
  garden(c, w, h, r) {
    sky(c, w, h, ["#bfe3f0", "#e8f5f0"], 0.4); band(c, w, h * 0.4, h * 0.6, "#78b655", "#4a8a36");
    for (let i = 0; i < 9; i++) {
      const x = w * (0.08 + r() * 0.84), y = h * (0.55 + r() * 0.38), s = 10 + r() * 12;
      ell(c, x, y, s * 0.75, s, ["#f6a5c0", "#f9d86b", "#9fd3f4", "#c7a6f2", "#ffb27a"][i % 5]);
      c.fillStyle = "rgba(255,255,255,0.7)"; c.fillRect(x - s * 0.7, y - 2, s * 1.4, 3);
    }
  },
  flowers(c, w, h, r) {
    sky(c, w, h, ["#7a5236", "#53351f"]);
    c.strokeStyle = "rgba(0,0,0,0.15)"; c.lineWidth = 2; for (let y = 10; y < h; y += 26) { c.beginPath(); c.moveTo(0, y + r() * 6); c.lineTo(w, y + r() * 6); c.stroke(); }
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.32;
    for (let i = 0; i < 46; i++) { const a = (i / 46) * Math.PI * 2, rr = R + (r() - 0.5) * 12; const col = ["#f7a1c4", "#fff3b0", "#ffffff", "#f28aa8"][i % 4]; disc(c, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 12 + r() * 5, col); disc(c, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 3, "#f1c232"); }
  },
  fireworks(c, w, h, r) {
    sky(c, w, h, ["#070a1d", "#1b1f45"]);
    c.save(); c.globalCompositeOperation = "lighter"; c.lineCap = "round";
    for (let b = 0; b < 4; b++) {
      const x = w * (0.15 + r() * 0.7), y = h * (0.15 + r() * 0.35), R = 30 + r() * 50, col = ["#ff6b6b", "#ffd166", "#7bdff2", "#c77dff"][b];
      c.strokeStyle = col; c.lineWidth = 2;
      for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; c.beginPath(); c.moveTo(x + Math.cos(a) * R * 0.2, y + Math.sin(a) * R * 0.2); c.lineTo(x + Math.cos(a) * R, y + Math.sin(a) * R); c.stroke(); }
    }
    c.restore();
    c.fillStyle = "#05060f"; for (let x = 0; x < w; x += 22) { const bh = h * (0.08 + r() * 0.16); c.fillRect(x, h * 0.78 - bh, 20, bh); }
    band(c, w, h * 0.78, h * 0.22, "#0b1030", "#04050c");
  },
  city(c, w, h, r) {
    sky(c, w, h, ["#9fd0ec", "#e4f2f6"], 0.7);
    for (let x = -10; x < w; x += 48 + r() * 30) {
      const bh = h * (0.25 + r() * 0.35), bw = 40 + r() * 30; c.fillStyle = ["#d8cfc0", "#c2b8a6", "#e9e2d4"][Math.floor(r() * 3)]; c.fillRect(x, h * 0.75 - bh, bw, bh);
      c.fillStyle = "rgba(60,90,120,0.45)"; for (let y = h * 0.75 - bh + 10; y < h * 0.72; y += 16) for (let wx = x + 6; wx < x + bw - 8; wx += 12) c.fillRect(wx, y, 6, 8);
    }
    band(c, w, h * 0.75, h * 0.25, "#6c6f70", "#4b4e50");
    c.fillStyle = "#f3c13a"; c.fillRect(w * 0.18, h * 0.62, w * 0.5, h * 0.16); c.fillStyle = "#2f3d4a"; for (let i = 0; i < 5; i++) c.fillRect(w * 0.21 + i * w * 0.09, h * 0.645, w * 0.06, h * 0.05);
    disc(c, w * 0.27, h * 0.79, h * 0.035, "#1d1d1d"); disc(c, w * 0.6, h * 0.79, h * 0.035, "#1d1d1d");
  },
  shaveice(c, w, h, r) {
    sky(c, w, h, ["#ffe2ea", "#dff2ff"]);
    const cx = w / 2, base = h * 0.86, top = h * 0.5, cw = w * 0.24;
    c.fillStyle = "#ffffff"; c.beginPath(); c.moveTo(cx - cw, top); c.lineTo(cx + cw, top); c.lineTo(cx + cw * 0.7, base); c.lineTo(cx - cw * 0.7, base); c.fill();
    [["#ef476f", -0.66], ["#ffd166", 0], ["#3a86ff", 0.66]].forEach(([col, k]) => { ell(c, cx + k * cw * 0.66, top - h * 0.02, cw * 0.48, h * 0.17, col); });
    ell(c, cx, top - h * 0.14, cw * 0.5, h * 0.11, "#ffd166");
  },
  kitchen(c, w, h, r) {
    sky(c, w, h, ["#b5875c", "#7d5532"]);
    c.strokeStyle = "rgba(0,0,0,0.12)"; c.lineWidth = 2; for (let y = 0; y < h; y += 30) { c.beginPath(); c.moveTo(0, y + r() * 8); c.lineTo(w, y + r() * 8); c.stroke(); }
    const cx = w / 2, cy = h * 0.56, R = Math.min(w, h) * 0.36;
    ell(c, cx, cy + 8, R * 1.05, R * 0.62, "rgba(0,0,0,0.25)"); ell(c, cx, cy, R, R * 0.6, "#fbf8f2");
    for (let i = 0; i < 5; i++) ell(c, cx, cy - i * 11, R * 0.58, R * 0.24, i % 2 ? "#d99a4e" : "#c98538");
    ell(c, cx, cy - 56, R * 0.14, R * 0.07, "#fff1a8"); disc(c, cx + R * 0.7, cy - R * 0.4, 8, "#c0392b");
  },
  pumpkin(c, w, h, r) {
    sky(c, w, h, ["#1b1029", "#3a1d3f"]); band(c, w, h * 0.72, h * 0.28, "#24161c", "#140c10");
    for (let i = 0; i < 3; i++) {
      const x = w * (0.25 + i * 0.25), y = h * (0.68 + (i % 2) * 0.05), s = Math.min(w, h) * (0.13 + r() * 0.05);
      disc(c, x, y, s * 1.4, "rgba(255,140,40,0.18)", 30);
      for (let k = -2; k <= 2; k++) ell(c, x + k * s * 0.3, y, s * 0.45, s * 0.8, k % 2 ? "#e8771f" : "#f38b2a");
      c.fillStyle = "#4b6b2a"; c.fillRect(x - 3, y - s * 0.95, 6, s * 0.25);
    }
  },
  lights(c, w, h, r) {
    sky(c, w, h, ["#0b0f24", "#1d1a3a"]);
    c.fillStyle = "#0a0b16"; c.fillRect(w * 0.2, h * 0.3, w * 0.6, h * 0.7); c.beginPath(); c.moveTo(w * 0.15, h * 0.32); c.lineTo(w * 0.5, h * 0.14); c.lineTo(w * 0.85, h * 0.32); c.fill();
    bokeh(c, w, h, ["#ffcf7a", "#ff8a65", "#9ee6ff", "#ffffff", "#7dffb3"], 70, r, 3, 18, 0.7);
  },
  tree(c, w, h, r) {
    sky(c, w, h, ["#2a1a10", "#3d2616"]); bokeh(c, w, h, ["#ffb35c"], 20, r, 8, 30, 0.35);
    const cx = w / 2;
    for (let i = 0; i < 4; i++) { const y = h * (0.18 + i * 0.16), hw = w * (0.12 + i * 0.07); c.fillStyle = i % 2 ? "#1f5a34" : "#2b6b3f"; c.beginPath(); c.moveTo(cx, y); c.lineTo(cx + hw, y + h * 0.24); c.lineTo(cx - hw, y + h * 0.24); c.fill(); }
    for (let i = 0; i < 26; i++) disc(c, cx + (r() - 0.5) * w * 0.5 * (0.3 + r()), h * (0.25 + r() * 0.55), 3, ["#ffd36b", "#ff6b6b", "#ffffff"][i % 3], 10);
    disc(c, cx, h * 0.17, 9, "#ffd36b", 24);
    c.fillStyle = "#c0392b"; c.fillRect(cx - w * 0.2, h * 0.86, w * 0.14, h * 0.1); c.fillStyle = "#2e86de"; c.fillRect(cx + w * 0.06, h * 0.84, w * 0.13, h * 0.12);
  },
};
const PORTRAIT = new Set(["falls", "bamboo", "tree", "lanterns", "shaveice"]);

function finish(c, w, h, r) {
  const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.78);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(25,12,0,0.38)"); c.fillStyle = g; c.fillRect(0, 0, w, h);
  const img = c.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 16; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  c.putImageData(img, 0, 0);
}
export function paintSample(p) {
  const portrait = PORTRAIT.has(p.scene), w = portrait ? 360 : 480, h = portrait ? 480 : 360;
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const c = cv.getContext("2d"), r = rng(hash(p.id + p.scene));
  (PAINT[p.scene] || PAINT.beach)(c, w, h, r); finish(c, w, h, r);
  return cv;
}

export const sizeOf = (src) => ({ w: src.naturalWidth || src.width, h: src.naturalHeight || src.height });
export function drawCover(c, src, x, y, w, h) {
  const s = sizeOf(src), k = Math.max(w / s.w, h / s.h), sw = w / k, sh = h / k;
  c.drawImage(src, (s.w - sw) / 2, (s.h - sh) / 2, sw, sh, x, y, w, h);
}
// Sample card: a stand-in for the printed card's front and back until the real images exist.
export function sampleCard(photos) {
  const W = 1400, H = 1014;
  const front = document.createElement("canvas"); front.width = W; front.height = H;
  let c = front.getContext("2d");
  c.fillStyle = "#0f2a22"; c.fillRect(0, 0, W, H);
  const pick = (scene) => photos.find((p) => p.scene === scene) || photos[0];
  drawCover(c, pick("sunset").source, 56, 56, 760, 560);
  drawCover(c, pick("torii").source, 56, 640, 368, 318);
  drawCover(c, pick("tree").source, 448, 640, 368, 318);
  c.strokeStyle = "#d6b25e"; c.lineWidth = 3; c.strokeRect(24, 24, W - 48, H - 48);
  c.fillStyle = "#f4ead6"; c.textBaseline = "alphabetic"; c.textAlign = "left";
  c.font = `112px ${DISPLAY}`; c.fillText("Mele", 870, 300); c.fillText("Kalikimaka", 870, 420);
  c.fillStyle = "#d6b25e"; c.font = `210px ${DISPLAY}`; c.fillText("2026", 862, 650);
  c.fillStyle = "#f4ead6"; c.font = `600 34px ${BODY}`; c.fillText("THE SUE FAMILY", 876, 740);
  c.fillStyle = "rgba(244,234,214,0.55)"; c.font = `28px ${BODY}`; c.fillText("Sample card front", 876, 930);

  const back = document.createElement("canvas"); back.width = W; back.height = H;
  c = back.getContext("2d");
  c.fillStyle = "#f4ede0"; c.fillRect(0, 0, W, H);
  c.strokeStyle = "#c9a85a"; c.lineWidth = 3; c.strokeRect(24, 24, W - 48, H - 48);
  c.fillStyle = "#2a241c"; c.font = `66px ${HAND}`;
  ["Aloha from our ʻohana to yours.", "More beach days, more pancakes,", "and more of you in 2027.", "", "Alex & Laura"].forEach((line, i) => c.fillText(line, 110, 250 + i * 86));
  c.setLineDash([14, 10]); c.strokeStyle = "#8a7a60"; c.lineWidth = 3; c.strokeRect(940, 300, 330, 330); c.setLineDash([]);
  c.fillStyle = "#8a7a60"; c.textAlign = "center"; c.font = `600 40px ${BODY}`; c.fillText("QR", 1105, 480);
  c.font = `30px ${BODY}`; c.fillText("alexsue.com/xmas26", 1105, 690);
  c.font = `26px ${BODY}`; c.fillStyle = "rgba(42,36,28,0.5)"; c.fillText("Sample card back", W / 2, 930);
  return { front, back };
}

