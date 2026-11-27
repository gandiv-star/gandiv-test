// =============================================================
//  ટોપર્સ પોસ્ટર — 3 ડિઝાઇન (1080 × 1350, WhatsApp/Instagram માપ)
//  ગાંડિવની ઓળખ: લોગો, ધોરણ 7–12, સાયન્સ/કોમર્સ, JEE/NEET, સરનામું, ફોન
// =============================================================
import { ACADEMY } from "./config.js";
import { loadFonts, loadImg } from "./home.js";
import { $, $$, esc, modal, toast, buzz, ic } from "./core.js";

export const TDESIGNS = [["gold", "ગોલ્ડ ટ્રોફી 🏆"], ["fest", "ઉત્સવ 🎉"], ["star", "સ્ટાર ⭐"]];
const GU = '"Baloo Bhai 2","Noto Sans Gujarati",sans-serif';
const W = 360, H = 450;
const LINE = ACADEMY.posterLine || "ધોરણ 7 થી 12 • સાયન્સ • કોમર્સ • JEE / NEET";
const ADDR = ACADEMY.address || "";
const meta = it => [it.date ? `ટેસ્ટ તારીખ: ${it.date}` : "", it.std || ""].filter(Boolean).join("  •  ");
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// it = { title, sub, chapter, std, list: [{ name, m, max, pct, rank }] }
export async function topperPoster(kind, it, page = 0, per = 24) {
  await loadFonts();
  const [logo, ph] = await Promise.all([loadImg("logo.png"), loadImg(it.photo)]);
  const c = document.createElement("canvas"); c.width = 1080; c.height = 1350;
  const x = c.getContext("2d"); x.scale(3, 3);
  const R = rng(kind.length * 977 + it.list.length);
  const rr = (X, Y, w, h, r) => { x.beginPath(); if (x.roundRect) x.roundRect(X, Y, w, h, r); else x.rect(X, Y, w, h); };
  const tx = (s, X, Y, size, fill, o = {}) => {
    x.save(); let z = size; const f = () => `${o.st || ""} ${o.w || 800} ${z}px ${o.fam || GU}`; x.font = f();
    while (o.max && x.measureText(s).width > o.max && z > 6) { z -= .5; x.font = f(); }
    x.textAlign = o.al || "center"; x.textBaseline = "middle";
    if (o.sh) { x.shadowColor = o.sh; x.shadowBlur = o.blur ?? 6; x.shadowOffsetY = o.oy ?? 1; }
    if (o.stroke) { x.lineJoin = "round"; x.lineWidth = o.stroke[1]; x.strokeStyle = o.stroke[0]; x.strokeText(s, X, Y); }
    x.fillStyle = fill; x.fillText(s, X, Y); x.restore(); return z;
  };
  const gold = (y0, y1) => { const g = x.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, "#FFF3B0"); g.addColorStop(.45, "#F5C542"); g.addColorStop(1, "#B7791F"); return g; };
  const logoAt = (cx, cy, r, ring = "#F5C542") => {
    x.save(); x.beginPath(); x.arc(cx, cy, r + 2, 0, 7); x.fillStyle = ring; x.fill();
    x.beginPath(); x.arc(cx, cy, r, 0, 7); x.clip(); x.fillStyle = "#111"; x.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    if (logo) x.drawImage(logo, cx - r, cy - r, 2 * r, 2 * r); x.restore();
  };
  const trophy = (cx, top, s) => { // સોનેરી ટ્રોફી (emoji વગર, દરેક ફોનમાં સરખી)
    x.save(); x.translate(cx, top); x.scale(s, s);
    const g = gold(0, 60); x.fillStyle = g; x.strokeStyle = "#8A5A12"; x.lineWidth = 1.2;
    x.beginPath(); x.moveTo(-18, 0); x.lineTo(18, 0); x.bezierCurveTo(18, 26, 10, 34, 0, 36); x.bezierCurveTo(-10, 34, -18, 26, -18, 0); x.fill(); x.stroke();
    x.lineWidth = 3.2; x.strokeStyle = g; x.beginPath(); x.arc(-19, 10, 8, Math.PI * .5, Math.PI * 1.5); x.stroke(); x.beginPath(); x.arc(19, 10, 8, -Math.PI * .5, Math.PI * .5); x.stroke();
    x.fillStyle = g; x.fillRect(-3, 35, 6, 9); rr(-12, 44, 24, 6, 2); x.fill(); rr(-16, 50, 32, 7, 2); x.fill();
    x.fillStyle = "rgba(255,255,255,.55)"; x.beginPath(); x.ellipse(-8, 12, 3, 9, -.2, 0, 7); x.fill();
    x.restore();
  };
  const star = (cx, cy, r, fill) => { x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * .45 : r; x.lineTo(cx + rad * Math.cos(a), cy + rad * Math.sin(a)); } x.closePath(); x.fillStyle = fill; x.fill(); };
  const medal = (cx, cy, r, rank, txtc) => {
    const col = rank === 1 ? ["#FFE27A", "#D4A017"] : rank === 2 ? ["#F1F5F9", "#94A3B8"] : rank === 3 ? ["#FBCFA0", "#B45309"] : ["#E0E7FF", "#6366F1"];
    const g = x.createRadialGradient(cx - r * .3, cy - r * .3, 1, cx, cy, r); g.addColorStop(0, col[0]); g.addColorStop(1, col[1]);
    x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fillStyle = g; x.fill(); x.lineWidth = 1; x.strokeStyle = "rgba(0,0,0,.25)"; x.stroke();
    tx(String(rank), cx, cy + .5, r * 1.05, txtc || "#3B2604", { w: 800 });
  };
  // ફોટો ગોળમાં (માથું ન કપાય: ઉપરથી ગોઠવો; નાનો/મોટો/ખસેડી શકાય)
  const photoCircle = (cx, cy, r, ring, ini = "") => {
    x.save(); x.beginPath(); x.arc(cx, cy, r + 4, 0, 7); x.fillStyle = ring; x.shadowColor = "rgba(0,0,0,.35)"; x.shadowBlur = 12; x.fill(); x.restore();
    x.save(); x.beginPath(); x.arc(cx, cy, r, 0, 7); x.clip();
    if (ph) { const a = it.adj || {}, z = a.z || 1, k = Math.max(2 * r / ph.width, 2 * r / ph.height) * z, w = ph.width * k, h = ph.height * k;
      x.fillStyle = "#fff"; x.fillRect(cx - r, cy - r, 2 * r, 2 * r);
      const top = h > 2 * r ? (2 * r - h) * .12 : (2 * r - h) / 2;
      x.drawImage(ph, cx - w / 2 + (a.dx || 0) * 2 * r, cy - r + top + (a.dy || 0) * 2 * r, w, h); }
    else { const g = x.createLinearGradient(cx - r, cy - r, cx + r, cy + r); g.addColorStop(0, "#E0E7FF"); g.addColorStop(1, "#C7D2FE"); x.fillStyle = g; x.fillRect(cx - r, cy - r, 2 * r, 2 * r);
      x.fillStyle = "#3730A3"; x.font = `800 ${r * .8}px ${GU}`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(ini, cx, cy + 2); }
    x.restore();
  };
  const ini = n => String(n || "").trim().slice(0, 1);
  const rankTxt = r => `🏅 વર્ગમાં ક્રમ ${r}`;
  const pageList = it.list.slice(page * per, page * per + per);
  // ---- નામોની યાદી (ડિઝાઇન પ્રમાણે રંગ) ----
  const names = (y0, y1, st) => {
    const n = pageList.length, two = n > 10, rows = two ? Math.ceil(n / 2) : n, avail = y1 - y0;
    if (n === 1) { // એક જ ટોપર: મોટું સ્પોટલાઇટ
      const p = pageList[0], cy = y0 + avail / 2;
      st.solo(p, cy); return;
    }
    const rh = Math.min(two ? 26 : 34, avail / rows), top = y0 + (avail - rows * rh) / 2;
    pageList.forEach((p, j) => {
      const col = two ? (j < rows ? 0 : 1) : 0, row = two ? j % rows : j;
      const w = two ? 158 : 280, X = two ? 18 + col * 166 : (W - 280) / 2, Y = top + row * rh, h = rh - 4;
      st.row(p, X, Y, w, h, two);
    });
  };
  const footer = (y, dark) => { // બ્રાન્ડની પટ્ટી
    const fg = dark ? "#FFFFFF" : "#14225A", sub = dark ? "#FDE68A" : "#8E1B1B";
    logoAt(40, y + 31, 22, dark ? "#F5C542" : "#14225A");
    tx(ACADEMY.name, 70, y + 16, 17, fg, { al: "left", max: 175 });
    tx(LINE, 70, y + 33, 8.6, sub, { al: "left", w: 700, max: 186 });
    if (ADDR) tx(ADDR, 70, y + 47, 7.4, dark ? "rgba(255,255,255,.85)" : "#334155", { al: "left", w: 600, max: 280 });
    const ph = `📞 ${ACADEMY.phone}`; x.save(); x.font = `800 10px ${GU}`; const pw = x.measureText(ph).width + 16; x.restore();
    rr(W - 14 - pw, y + 8, pw, 18, 9); x.fillStyle = dark ? "#F5C542" : "#14225A"; x.fill();
    tx(ph, W - 14 - pw / 2, y + 17.5, 10, dark ? "#14225A" : "#FFFFFF");
  };
  const sh = s => String(s);
  const markTxt = p => `${sh(p.m)}/${sh(p.max)}`;

  if (kind === "gold") {
    const g = x.createRadialGradient(W / 2, 90, 10, W / 2, 200, 420); g.addColorStop(0, "#22357F"); g.addColorStop(.6, "#0D1A4A"); g.addColorStop(1, "#060C26");
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.save(); x.globalAlpha = .13; x.fillStyle = "#F5C542"; for (let i = 0; i < 16; i++) { const a = -Math.PI / 2 + (i - 7.5) * .17; x.beginPath(); x.moveTo(W / 2, 70); x.lineTo(W / 2 + 500 * Math.cos(a - .04), 70 + 500 * Math.sin(a - .04) * -1 * -1); x.lineTo(W / 2 + 500 * Math.cos(a + .04), 70 + 500 * Math.sin(a + .04)); x.fill(); } x.restore();
    for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(255,226,122,${.2 + R() * .6})`; x.beginPath(); x.arc(R() * W, R() * 360, R() * 1.3 + .3, 0, 7); x.fill(); }
    x.strokeStyle = gold(0, H); x.lineWidth = 2.5; rr(7, 7, W - 14, H - 14, 14); x.stroke(); x.lineWidth = .8; rr(12, 12, W - 24, H - 24, 11); x.stroke();
    trophy(W / 2, 22, .78);
    tx("અભિનંદન!", W / 2, 80, 30, gold(66, 96), { sh: "rgba(0,0,0,.6)", blur: 8 });
    x.fillStyle = gold(100, 103); x.fillRect(W / 2 - 50, 101, 100, 1.2);
    tx(it.sub + (it.chapter ? "  •  " + it.chapter : ""), W / 2, 118, 15, "#FFFFFF", { max: 300 });
    tx(meta(it), W / 2, 137, 9.5, "rgba(255,255,255,.8)", { w: 600 });
    names(152, 360, {
      solo(p, cy) {
        x.save(); x.shadowColor = "rgba(245,197,66,.7)"; x.shadowBlur = 26; x.beginPath(); x.arc(W / 2, cy - 30, 62, 0, 7); x.fillStyle = gold(cy - 92, cy + 32); x.fill(); x.restore();
        photoCircle(W / 2, cy - 30, 56, gold(cy - 90, cy + 30), ini(p.name));
        const ry = cy + 46; x.fillStyle = gold(ry - 14, ry + 14); x.beginPath(); x.moveTo(30, ry - 14); x.lineTo(W - 30, ry - 14); x.lineTo(W - 42, ry); x.lineTo(W - 30, ry + 14); x.lineTo(30, ry + 14); x.lineTo(42, ry); x.closePath(); x.fill();
        tx(p.name, W / 2, ry + 1, 19, "#3B2604", { max: 250 });
        tx(`${markTxt(p)}`, W / 2, ry + 34, 26, gold(ry + 20, ry + 48), { sh: "rgba(0,0,0,.5)" });
        tx(`${p.pct}%  •  ${rankTxt(p.rank)}`, W / 2, ry + 56, 11, "#FDE68A", { w: 700 });
      },
      row(p, X, Y, w, h, two) {
        rr(X, Y, w, h, h / 2); const gg = x.createLinearGradient(X, 0, X + w, 0); gg.addColorStop(0, "rgba(245,197,66,.26)"); gg.addColorStop(1, "rgba(255,255,255,.06)"); x.fillStyle = gg; x.fill();
        x.lineWidth = .7; x.strokeStyle = "rgba(245,197,66,.65)"; x.stroke();
        const fs = Math.min(two ? 11 : 14, h * .5);
        medal(X + h / 2 + 1, Y + h / 2, h / 2 - 2, p.rank);
        tx(p.name, X + h + 5, Y + h / 2 + .5, fs, "#FFFFFF", { al: "left", max: w - h - (two ? 46 : 62) });
        tx(markTxt(p), X + w - 9, Y + h / 2 + .5, fs * .92, "#FDE68A", { al: "right" });
      }
    });
    x.fillStyle = "rgba(255,255,255,.07)"; x.fillRect(12, 368, W - 24, 70);
    x.fillStyle = gold(366, 370); x.fillRect(12, 366, W - 24, 1.5);
    footer(368, true);
  }

  if (kind === "fest") {
    x.fillStyle = "#FFFBF2"; x.fillRect(0, 0, W, H);
    const cols = ["#F43F5E", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899"];
    for (let i = 0; i < 110; i++) { const px = R() * W, py = R() * 360; if (py > 140 && py < 360 && px > 30 && px < W - 30 && R() < .8) continue;
      x.save(); x.translate(px, py); x.rotate(R() * 6); x.fillStyle = cols[i % 6]; x.globalAlpha = .85; R() < .5 ? x.fillRect(-3, -1.3, 6, 2.6) : (x.beginPath(), x.arc(0, 0, 1.8, 0, 7), x.fill()); x.restore(); }
    // ધ્વજ-તોરણ
    x.strokeStyle = "#B45309"; x.lineWidth = .8; x.beginPath(); x.moveTo(0, 10); x.quadraticCurveTo(W / 2, 34, W, 10); x.stroke();
    for (let i = 0; i < 14; i++) { const t = (i + .5) / 14, px = t * W, py = 10 + 24 * 4 * t * (1 - t) * .9; x.fillStyle = cols[i % 6]; x.beginPath(); x.moveTo(px - 8, py); x.lineTo(px + 8, py); x.lineTo(px, py + 15); x.closePath(); x.fill(); }
    // રિબન બેનર
    const by = 58; x.fillStyle = "#0F1E5A"; x.beginPath(); x.moveTo(36, by - 8); x.lineTo(W - 36, by - 8); x.lineTo(W - 36, by + 30); x.lineTo(36, by + 30); x.fill();
    x.fillStyle = "#0A153F"; x.beginPath(); x.moveTo(18, by); x.lineTo(40, by); x.lineTo(40, by + 38); x.lineTo(18, by + 38); x.lineTo(28, by + 19); x.fill();
    x.beginPath(); x.moveTo(W - 18, by); x.lineTo(W - 40, by); x.lineTo(W - 40, by + 38); x.lineTo(W - 18, by + 38); x.lineTo(W - 28, by + 19); x.fill();
    tx("અભિનંદન!", W / 2, by + 11, 25, gold(by - 4, by + 24));
    tx(it.sub + (it.chapter ? "  •  " + it.chapter : ""), W / 2, by + 60, 16, "#0F1E5A", { max: 300 });
    tx(meta(it), W / 2, by + 85, 9, "#64748B", { w: 600 });
    names(152, 360, {
      solo(p, cy) {
        rr(36, cy - 92, W - 72, 196, 18); x.fillStyle = "#FFFFFF"; x.shadowColor = "rgba(15,30,90,.18)"; x.shadowBlur = 14; x.fill(); x.shadowBlur = 0;
        x.lineWidth = 1.5; x.strokeStyle = "#F59E0B"; x.stroke();
        photoCircle(W / 2, cy - 30, 50, "#F59E0B", ini(p.name));
        star(W / 2 + 40, cy - 70, 14, "#F43F5E"); tx(String(p.rank), W / 2 + 40, cy - 69, 10, "#FFFFFF");
        tx(p.name, W / 2, cy + 38, 21, "#0F1E5A", { max: 250 });
        tx(markTxt(p), W / 2, cy + 66, 26, "#B91C1C");
        tx(`${p.pct}%  •  ${rankTxt(p.rank)}`, W / 2, cy + 88, 11, "#0F1E5A", { w: 700 });
      },
      row(p, X, Y, w, h, two) {
        rr(X, Y, w, h, 8); x.fillStyle = "#FFFFFF"; x.shadowColor = "rgba(15,30,90,.14)"; x.shadowBlur = 6; x.shadowOffsetY = 1; x.fill(); x.shadowBlur = 0; x.shadowOffsetY = 0;
        x.fillStyle = cols[(p.rank - 1) % 6]; rr(X, Y, 4, h, 2); x.fill();
        const fs = Math.min(two ? 11 : 14, h * .5);
        medal(X + 6 + h / 2, Y + h / 2, h / 2 - 3, p.rank);
        tx(p.name, X + h + 10, Y + h / 2 + .5, fs, "#0F1E5A", { al: "left", max: w - h - (two ? 50 : 66) });
        tx(markTxt(p), X + w - 8, Y + h / 2 + .5, fs * .92, "#B91C1C", { al: "right" });
      }
    });
    x.fillStyle = "#0F1E5A"; x.fillRect(0, 368, W, 82); x.fillStyle = "#F59E0B"; x.fillRect(0, 366, W, 2.5);
    footer(373, true);
  }

  if (kind === "star") {
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#5B21B6"); g.addColorStop(.55, "#C026D3"); g.addColorStop(1, "#F97316"); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.save(); x.globalAlpha = .09; x.fillStyle = "#FFFFFF"; for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12; x.beginPath(); x.moveTo(W / 2, 70); x.lineTo(W / 2 + 600 * Math.cos(a), 70 + 600 * Math.sin(a)); x.lineTo(W / 2 + 600 * Math.cos(a + .13), 70 + 600 * Math.sin(a + .13)); x.fill(); } x.restore();
    for (let i = 0; i < 26; i++) star(R() * W, R() * 360, R() * 3 + 1.2, `rgba(255,255,255,${.35 + R() * .5})`);
    star(W / 2, 46, 30, "#FDE047"); star(W / 2, 46, 20, "#FACC15");
    tx("Star Performers", W / 2, 92, 22, "#FFFFFF", { fam: '"Pacifico",cursive', w: 400, sh: "rgba(0,0,0,.35)" });
    tx("અભિનંદન!", W / 2, 116, 13, "#FEF08A", { w: 800 });
    tx(it.sub + (it.chapter ? "  •  " + it.chapter : ""), W / 2, 134, 13.5, "#FFFFFF", { max: 300 });
    tx(meta(it), W / 2, 148, 9, "rgba(255,255,255,.85)", { w: 600 });
    names(156, 352, {
      solo(p, cy) {
        const gg = x.createLinearGradient(W / 2 - 60, cy - 90, W / 2 + 60, cy + 30); gg.addColorStop(0, "#FDE047"); gg.addColorStop(1, "#FB923C");
        photoCircle(W / 2, cy - 30, 56, gg, ini(p.name));
        star(W / 2 + 46, cy - 72, 16, "#FDE047"); tx(String(p.rank), W / 2 + 46, cy - 71, 11, "#7C2D12");
        rr(40, cy + 32, W - 80, 66, 33); x.fillStyle = "#FFFFFF"; x.shadowColor = "rgba(0,0,0,.25)"; x.shadowBlur = 14; x.fill(); x.shadowBlur = 0;
        tx(p.name, W / 2, cy + 50, 19, "#4C1D95", { max: 250 });
        tx(`${markTxt(p)}  •  ${p.pct}%  •  ક્રમ ${p.rank}`, W / 2, cy + 77, 15, "#C2410C", { max: 250 });
      },
      row(p, X, Y, w, h, two) {
        rr(X, Y, w, h, h / 2); x.fillStyle = "#FFFFFF"; x.shadowColor = "rgba(0,0,0,.18)"; x.shadowBlur = 5; x.fill(); x.shadowBlur = 0;
        const fs = Math.min(two ? 11 : 14, h * .5);
        x.beginPath(); x.arc(X + h / 2, Y + h / 2, h / 2 - 2, 0, 7); const gg = x.createLinearGradient(X, Y, X + h, Y + h); gg.addColorStop(0, "#7C3AED"); gg.addColorStop(1, "#F97316"); x.fillStyle = gg; x.fill();
        tx(String(p.rank), X + h / 2, Y + h / 2 + .5, fs, "#FFFFFF");
        tx(p.name, X + h + 5, Y + h / 2 + .5, fs, "#4C1D95", { al: "left", max: w - h - (two ? 46 : 62) });
        tx(markTxt(p), X + w - 10, Y + h / 2 + .5, fs * .92, "#C2410C", { al: "right" });
      }
    });
    rr(10, 362, W - 20, 80, 14); x.fillStyle = "#FFFFFF"; x.fill();
    footer(367, false);
  }
  return c;
}

// ---------- પોસ્ટર જોવું/પસંદ કરવું/શેર (મોડલ) ----------
// build(kind, adj) => Promise<canvas[]>. photo હોય તો ગોઠવણ બટન. adjKey = જન્મદિવસ સાથે એક જ ગોઠવણ
export async function posterModal({ title, build, hasPhoto, adjKey, fileName, text }) {
  let di = Math.max(0, TDESIGNS.findIndex(d => d[0] === localStorage.getItem("gv_tdesign"))), files = [], tok = 0;
  const A0 = { z: 1, dx: 0, dy: 0 };
  let adj = (() => { try { return { ...A0, ...JSON.parse(localStorage.getItem(adjKey) || "{}") }; } catch { return { ...A0 }; } })();
  const d = modal(title, `
    <div class="hscroll">${TDESIGNS.map(([k, l], i) => `<button type="button" class="chip" data-td="${i}">${l}</button>`).join("")}</div>
    <div id="pvw" class="pvw"><div class="skel" style="aspect-ratio:4/5;border-radius:12px"></div></div>
    ${hasPhoto ? `<div class="adj">${[["z-", "−", "નાનો"], ["z+", "+", "મોટો"], ["up", "↑", "ઉપર"], ["dn", "↓", "નીચે"], ["lf", "←", "ડાબે"], ["rt", "→", "જમણે"], ["rs", "↺", "મૂળ"]]
      .map(([k, t, l]) => `<button type="button" data-adj="${k}" aria-label="ફોટો ${l}"><b>${t}</b><span>${l}</span></button>`).join("")}</div>` : ""}
    <button type="button" class="btn wa big" id="psh">${ic("wa", 18)} WhatsApp / ગ્રુપમાં મોકલો</button>
    <button type="button" class="btn line" id="psv">${ic("dl", 18)} ફોનમાં સાચવો</button>`);
  const draw = async () => {
    const my = ++tok; $$("[data-td]", d).forEach((c, i) => c.classList.toggle("on", i === di));
    const cs = await build(TDESIGNS[di][0], adj); if (my !== tok) return;
    files = await Promise.all(cs.map((c, i) => new Promise(res => c.toBlob(b => res(new File([b], `${fileName}${cs.length > 1 ? "_" + (i + 1) : ""}.jpg`, { type: "image/jpeg" })), "image/jpeg", .92))));
    $("#pvw", d).innerHTML = cs.map(c => `<img src="${c.toDataURL("image/jpeg", .85)}" alt="${esc(title)}">`).join("");
    let x0 = null; $$("#pvw img", d).forEach(img => {
      img.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; }, { passive: true });
      img.addEventListener("touchend", e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 40) { di = (di + (dx < 0 ? 1 : TDESIGNS.length - 1)) % TDESIGNS.length; localStorage.setItem("gv_tdesign", TDESIGNS[di][0]); draw(); } });
    });
  };
  $$("[data-td]", d).forEach(c => c.onclick = () => { di = +c.dataset.td; localStorage.setItem("gv_tdesign", TDESIGNS[di][0]); buzz("tap"); draw(); });
  $$("[data-adj]", d).forEach(b => b.onclick = () => {
    const k = b.dataset.adj, st = .04;
    if (k === "z-") adj.z = Math.max(.6, +(adj.z - .1).toFixed(2)); else if (k === "z+") adj.z = Math.min(2.5, +(adj.z + .1).toFixed(2));
    else if (k === "up") adj.dy -= st; else if (k === "dn") adj.dy += st; else if (k === "lf") adj.dx -= st; else if (k === "rt") adj.dx += st; else adj = { ...A0 };
    try { localStorage.setItem(adjKey, JSON.stringify(adj)); } catch {} buzz("tap"); draw();
  });
  $("#psv", d).onclick = () => files.forEach(f => { const a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); });
  $("#psh", d).onclick = async () => {
    try { if (files.length && navigator.canShare?.({ files })) { await navigator.share({ files, text }); return; } } catch (e) { if (e?.name === "AbortError") return; }
    $("#psv", d).click(); toast("પોસ્ટર સચવાયું. WhatsApp માં ગેલેરીમાંથી મોકલો.");
  };
  await draw();
}

// ---------- મિત્રને આમંત્રણ પોસ્ટર (ફોટા સાથે, સ્ટેટ્સ માટે) ----------
export async function invitePoster(kind, it) {
  await loadFonts();
  const [logo, ph] = await Promise.all([loadImg("logo.png"), loadImg(it.photo)]);
  const c = document.createElement("canvas"); c.width = 1080; c.height = 1350;
  const x = c.getContext("2d"); x.scale(3, 3);
  const R = rng(it.name.length * 131 + kind.length);
  const rr = (X, Y, w, h, r) => { x.beginPath(); if (x.roundRect) x.roundRect(X, Y, w, h, r); else x.rect(X, Y, w, h); };
  const tx = (s, X, Y, size, fill, o = {}) => { x.save(); let z = size; const f = () => `${o.w || 800} ${z}px ${o.fam || GU}`; x.font = f();
    while (o.max && x.measureText(s).width > o.max && z > 6) { z -= .5; x.font = f(); }
    x.textAlign = o.al || "center"; x.textBaseline = "middle"; if (o.sh) { x.shadowColor = o.sh; x.shadowBlur = 6; } x.fillStyle = fill; x.fillText(s, X, Y); x.restore(); };
  const T = { gold: { bg: ["#22357F", "#060C26"], fg: "#FFFFFF", ac: "#F5C542", sub: "#FDE68A", dark: true },
    fest: { bg: ["#FFFBF2", "#FFEFD5"], fg: "#0F1E5A", ac: "#F59E0B", sub: "#B91C1C", dark: false },
    star: { bg: ["#5B21B6", "#F97316"], fg: "#FFFFFF", ac: "#FDE047", sub: "#FEF08A", dark: true } }[kind] || {};
  const g = kind === "gold" ? x.createRadialGradient(W / 2, 120, 10, W / 2, 220, 420) : x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, T.bg[0]); g.addColorStop(1, T.bg[1]); x.fillStyle = g; x.fillRect(0, 0, W, H);
  const cols = ["#F43F5E", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899"];
  for (let i = 0; i < 70; i++) { const px = R() * W, py = R() * 360; x.save(); x.translate(px, py); x.rotate(R() * 6);
    x.fillStyle = kind === "fest" ? cols[i % 6] : `rgba(255,236,150,${.25 + R() * .5})`; x.globalAlpha = kind === "fest" ? .8 : 1;
    kind === "fest" ? x.fillRect(-3, -1.2, 6, 2.4) : (x.beginPath(), x.arc(0, 0, R() * 1.4 + .4, 0, 7), x.fill()); x.restore(); }
  // ઉપર લોગો + નામ
  x.save(); x.beginPath(); x.arc(W / 2, 34, 20, 0, 7); x.fillStyle = T.ac; x.fill(); x.beginPath(); x.arc(W / 2, 34, 18, 0, 7); x.clip(); x.fillStyle = "#111"; x.fillRect(W / 2 - 18, 16, 36, 36); if (logo) x.drawImage(logo, W / 2 - 18, 16, 36, 36); x.restore();
  tx(ACADEMY.name, W / 2, 68, 15, T.ac);
  // ફોટો
  const cy = 150, r = 56;
  x.save(); x.beginPath(); x.arc(W / 2, cy, r + 5, 0, 7); x.fillStyle = T.ac; x.shadowColor = "rgba(0,0,0,.35)"; x.shadowBlur = 14; x.fill(); x.restore();
  x.save(); x.beginPath(); x.arc(W / 2, cy, r, 0, 7); x.clip();
  if (ph) { const a = it.adj || {}, z = a.z || 1, k = Math.max(2 * r / ph.width, 2 * r / ph.height) * z, w = ph.width * k, h = ph.height * k;
    x.fillStyle = "#fff"; x.fillRect(W / 2 - r, cy - r, 2 * r, 2 * r); const top = h > 2 * r ? (2 * r - h) * .12 : (2 * r - h) / 2;
    x.drawImage(ph, W / 2 - w / 2 + (a.dx || 0) * 2 * r, cy - r + top + (a.dy || 0) * 2 * r, w, h); }
  else { x.fillStyle = "#E0E7FF"; x.fillRect(W / 2 - r, cy - r, 2 * r, 2 * r); x.fillStyle = "#3730A3"; x.font = `800 44px ${GU}`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(String(it.name).slice(0, 1), W / 2, cy + 2); }
  x.restore();
  tx(`હું ${it.name}`, W / 2, 230, 22, T.fg, { max: 320, sh: T.dark ? "rgba(0,0,0,.4)" : "" });
  tx(`ગાંડિવ એકેડેમીમાં ભણું છું${it.std ? ` (ધોરણ ${it.std})` : ""}`, W / 2, 254, 13, T.sub, { w: 700, max: 320 });
  // સંદેશ
  rr(30, 274, W - 60, 46, 23); x.fillStyle = T.dark ? "rgba(255,255,255,.14)" : "#0F1E5A"; x.fill();
  tx("તમે પણ જોડાઓ! 🎓", W / 2, 297, 19, T.dark ? T.ac : "#FFFFFF");
  tx(LINE, W / 2, 338, 10.5, T.fg, { w: 700, max: 330 });
  tx("માહિતી માટે ફોન કરો અથવા ઑફિસે પધારો", W / 2, 354, 9.5, T.dark ? "rgba(255,255,255,.8)" : "#475569", { w: 600 });
  // નીચે બ્રાન્ડ
  x.fillStyle = T.dark ? "rgba(0,0,0,.25)" : "#0F1E5A"; x.fillRect(0, 368, W, 82);
  const y = 372;
  x.save(); x.beginPath(); x.arc(40, y + 31, 22, 0, 7); x.fillStyle = T.ac; x.fill(); x.beginPath(); x.arc(40, y + 31, 20, 0, 7); x.clip(); x.fillStyle = "#111"; x.fillRect(20, y + 11, 40, 40); if (logo) x.drawImage(logo, 20, y + 11, 40, 40); x.restore();
  tx(ACADEMY.name, 70, y + 16, 17, "#FFFFFF", { al: "left", max: 175 });
  if (ADDR) tx(ADDR, 70, y + 34, 7.6, "rgba(255,255,255,.85)", { al: "left", w: 600, max: 280 });
  const phn = `📞 ${ACADEMY.phone}`; x.save(); x.font = `800 11px ${GU}`; const pw = x.measureText(phn).width + 18; x.restore();
  rr(70, y + 46, pw, 20, 10); x.fillStyle = T.ac; x.fill(); tx(phn, 70 + pw / 2, y + 56.5, 11, "#14225A");
  return c;
}

// ---------- પ્રવેશ QR પોસ્ટર (ઑફિસ, શાળા પાસે, પત્રિકા, સ્ટેટ્સ) ----------
export async function qrPoster(kind, it) {
  await loadFonts();
  const [{ drawQR }, logo] = await Promise.all([import("./qr.js"), loadImg("logo.png")]);
  const c = document.createElement("canvas"); c.width = 1080; c.height = 1350;
  const x = c.getContext("2d"); x.scale(3, 3);
  const R = rng(97 + kind.length);
  const rr = (X, Y, w, h, r) => { x.beginPath(); if (x.roundRect) x.roundRect(X, Y, w, h, r); else x.rect(X, Y, w, h); };
  const tx = (s, X, Y, size, fill, o = {}) => { x.save(); let z = size; const f = () => `${o.w || 800} ${z}px ${o.fam || GU}`; x.font = f();
    while (o.max && x.measureText(s).width > o.max && z > 6) { z -= .5; x.font = f(); }
    x.textAlign = o.al || "center"; x.textBaseline = "middle"; x.fillStyle = fill; x.fillText(s, X, Y); x.restore(); };
  const T = { gold: { bg: ["#22357F", "#060C26"], fg: "#FFFFFF", ac: "#F5C542", sub: "#FDE68A", dark: true },
    fest: { bg: ["#FFFBF2", "#FFEFD5"], fg: "#0F1E5A", ac: "#F59E0B", sub: "#B91C1C", dark: false },
    star: { bg: ["#5B21B6", "#F97316"], fg: "#FFFFFF", ac: "#FDE047", sub: "#FEF08A", dark: true } }[kind] || {};
  const g = kind === "gold" ? x.createRadialGradient(W / 2, 120, 10, W / 2, 220, 420) : x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, T.bg[0]); g.addColorStop(1, T.bg[1]); x.fillStyle = g; x.fillRect(0, 0, W, H);
  const cols = ["#F43F5E", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899"];
  for (let i = 0; i < 50; i++) { const px = R() * W, py = R() * 120; x.save(); x.translate(px, py); x.rotate(R() * 6);
    x.fillStyle = kind === "fest" ? cols[i % 6] : `rgba(255,236,150,${.25 + R() * .5})`; x.globalAlpha = kind === "fest" ? .8 : 1;
    kind === "fest" ? x.fillRect(-3, -1.2, 6, 2.4) : (x.beginPath(), x.arc(0, 0, R() * 1.4 + .4, 0, 7), x.fill()); x.restore(); }
  // ઉપર: લોગો + નામ + લાઇન
  x.save(); x.beginPath(); x.arc(W / 2, 34, 21, 0, 7); x.fillStyle = T.ac; x.fill(); x.beginPath(); x.arc(W / 2, 34, 19, 0, 7); x.clip(); x.fillStyle = "#111"; x.fillRect(W / 2 - 19, 15, 38, 38); if (logo) x.drawImage(logo, W / 2 - 19, 15, 38, 38); x.restore();
  tx(ACADEMY.name, W / 2, 72, 24, T.ac);
  tx(LINE, W / 2, 94, 10.5, T.fg, { w: 700, max: 330 });
  // પટ્ટી
  rr(40, 108, W - 80, 34, 17); x.fillStyle = T.dark ? T.ac : "#0F1E5A"; x.fill();
  const y0 = Number(String(it.year || "").slice(0, 4)), yl = y0 ? `${y0 + 1}-${String(y0 + 2).slice(2)}` : "";
  tx(`પ્રવેશ ચાલુ છે${yl ? " • " + yl : ""}`, W / 2, 125.5, 15, T.dark ? "#14225A" : "#FFFFFF", { max: W - 100 });
  // QR
  const qs = 176, qx = (W - qs) / 2, qy = 154;
  rr(qx - 8, qy - 8, qs + 16, qs + 16, 14); x.fillStyle = "#FFFFFF"; x.fill();
  x.save(); x.strokeStyle = T.ac; x.lineWidth = 2.5; rr(qx - 8, qy - 8, qs + 16, qs + 16, 14); x.stroke(); x.restore();
  drawQR(x, it.link, qx, qy, qs, "#0F1E5A", "#FFFFFF");
  tx("📱 કૅમેરાથી સ્કેન કરો", W / 2, 352, 15, T.fg);
  tx("પ્રવેશની માહિતી માટે ફોર્મ ભરો, અમે ફોન કરીશું", W / 2, 370, 9.5, T.dark ? "rgba(255,255,255,.85)" : "#475569", { w: 600 });
  // નીચે બ્રાન્ડ
  x.fillStyle = T.dark ? "rgba(0,0,0,.28)" : "#0F1E5A"; x.fillRect(0, 384, W, 66);
  if (ADDR) tx("📍 " + ADDR, W / 2, 400, 8.6, "rgba(255,255,255,.9)", { w: 600, max: W - 24 });
  const phn = `📞 ${ACADEMY.phone}`; x.save(); x.font = `800 13px ${GU}`; const pw = x.measureText(phn).width + 22; x.restore();
  rr((W - pw) / 2, 412, pw, 24, 12); x.fillStyle = T.ac; x.fill(); tx(phn, W / 2, 424.5, 13, "#14225A");
  return c;
}
