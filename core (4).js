// =============================================================
//  સામાન્ય સાધનો: state, રોલ, ઢાંચો (header, મેનુ), router, modal
// =============================================================
import { ACADEMY, IS_TEST, LOGIN_DOMAIN } from "./config.js";
import { db, auth, signOut, addDoc, collection, serverTimestamp } from "./fb.js";

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const z2 = n => String(n).padStart(2, "0");
export const ymd = (d = new Date()) => `${d.getFullYear()}-${z2(d.getMonth() + 1)}-${z2(d.getDate())}`;
export const fmtD = s => (s ? String(s).split("-").reverse().join("/") : "");
export const money = n => "₹ " + Math.round(Number(n) || 0).toLocaleString("en-IN");
export const idToEmail = (id, ver = 1) => {
  id = String(id).trim().toLowerCase().replace(/\s+/g, "");
  return (ver > 1 ? `${id}.${ver}` : id) + "@" + LOGIN_DOMAIN;
};
export const genPwd = () => String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
export const waLink = (phone, text) => `https://wa.me/${phone ? "91" + String(phone).replace(/\D/g, "").slice(-10) : ""}?text=${encodeURIComponent(text)}`;
export const appUrl = () => location.href.split("#")[0];

// ---------- state ----------
export const S = {
  user: null,        // Firebase auth user
  me: null,          // authmap: { loginId, role, branchIds, active }
  profile: null,     // users/{loginId}
  branches: [],      // જે શાખા જોઈ શકે
  branchId: null,    // હાલ પસંદ કરેલી શાખા
  year: "2026-27",   // ચાલુ શૈક્ષણિક વર્ષ
  page: "home"
};

// ---------- ઝડપ માટે: ફોનમાં સચવાયેલી માહિતી ----------
const CK = uid => "gv_ctx_" + uid;
export function saveCtx() {
  if (!S.user) return;
  try { localStorage.setItem(CK(S.user.uid), JSON.stringify({ me: S.me, profile: S.profile, branches: S.branches, year: S.year })); } catch {}
}
export function readCtx(uid) { try { return JSON.parse(localStorage.getItem(CK(uid)) || "null"); } catch { return null; } }
// ---------- ઝડપ માટે: છેલ્લે જોયેલી સ્ક્રીનનો ફોટો (એપ ખોલતાં તરત દેખાય) ----------
export const SKEL = `<div class="skel"><i></i><i></i><i class="s"></i><i></i></div>`;
const PK = () => `gv_pg_${S.me?.loginId}_${S.branchId}_${location.hash || "#/home"}`;
let snapT = 0;
function snapNow() {
  try {
    const app = $("#app"); if (!app) return;
    localStorage.setItem("gv_snap", app.innerHTML);
    localStorage.setItem("gv_snap_role", getComputedStyle(document.documentElement).getPropertyValue("--role").trim());
    const v = $("#view");
    if (v && S.me && !v.querySelector(".skel")) localStorage.setItem(PK(), v.innerHTML);
  } catch {}
}
export function watchSnap() {
  new MutationObserver(() => { clearTimeout(snapT); snapT = setTimeout(snapNow, 400); })
    .observe($("#app"), { childList: true, subtree: true, characterData: true });
  addEventListener("pagehide", snapNow);
}
export function clearSnap() { try { Object.keys(localStorage).filter(k => k.startsWith("gv_pg_") || k.startsWith("gv_snap")).forEach(k => localStorage.removeItem(k)); } catch {} }

export function applyCtx(c) {
  S.me = c.me; S.profile = c.profile; S.year = c.year || S.year;
  S.branches = (c.branches || []).slice().sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || String(a.name).localeCompare(String(b.name)));
  const saved = localStorage.getItem("gv_branch");
  S.branchId = S.branches.some(b => b.id === saved) ? saved : S.branches[0]?.id || null;
}

// ---------- રોલ ----------
export const ROLES = {
  master:       { label: "Master",       color: "#14225A", admin: true },
  branchAdmin:  { label: "સંચાલક",       color: "#14225A", admin: true },
  receptionist: { label: "Receptionist", color: "#14225A" },
  accountant:   { label: "Accountant",   color: "#0F766E" },
  teacher:      { label: "શિક્ષક",        color: "#6D28D9" },
  student:      { label: "વિદ્યાર્થી",     color: "#C2410C" },
  parent:       { label: "વાલી",          color: "#15803D" }
};
export const isMaster = () => S.me?.role === "master";
export const isAdmin = () => ["master", "branchAdmin"].includes(S.me?.role);
// કયો રોલ કયા રોલનું લોગિન બનાવી શકે (ભાગ 2)
export const CAN_CREATE = {
  master: ["branchAdmin", "teacher", "receptionist", "accountant"],
  branchAdmin: ["teacher", "receptionist", "accountant"]
};
// લોગિન ID ની શરૂઆત: T1, S1 ...
export const ID_PREFIX = { branchAdmin: "S", receptionist: "S", accountant: "S", teacher: "T", student: "G", parent: "P" };

// ---------- મેનુ ----------
const NAV = {
  admin: [["home", "હોમ", "home"], ["students", "વિદ્યાર્થી", "users"], ["batches", "બેચ", "batch"], ["settings", "ગોઠવણ", "gear"]],
  staff: [["home", "હોમ", "home"]],
  teacher: [["home", "આજે", "home"]],
  student: [["home", "હોમ", "home"]],
  parent: [["home", "હોમ", "home"]]
};
// મેનુમાં ન દેખાય પણ ખૂલી શકે એવાં પાનાં
const EXTRA = { admin: ["admit", "student", "viewas"] };
const extraFor = r => (["master", "branchAdmin"].includes(r) ? EXTRA.admin : []);
const navFor = r => (["master", "branchAdmin"].includes(r) ? NAV.admin : r === "teacher" ? NAV.teacher : r === "student" ? NAV.student : r === "parent" ? NAV.parent : NAV.staff);

export const ICON = {
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M22 20a7 7 0 0 0-5-6.7"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  out: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  back: '<path d="M15 5 8 12l7 7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  cam: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  phone: '<path d="M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  print: '<path d="M7 9V4h10v5M7 17H4v-7h16v7h-3"/><path d="M7 14h10v6H7z"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3"/>',
  wa: '<path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/>',
  batch: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  rupee: '<path d="M7 5h10M7 9h10M8 5c5 0 5 8 0 8h-1l7 7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h0M12 11v6"/>',
  link: '<path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1"/>',
  dl: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  snd: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/>',
  mute: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="m17 9 5 6M22 9l-5 6"/>'
};
export const ic = (n, size = 22) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n] || ""}</svg>`;

// ---------- વાઇબ્રેશન (Android માં; iPhone માં બ્રાઉઝર સપોર્ટ કરતું નથી) ----------
const VIB = { tap: 8, ok: 18, err: [35, 50, 35], done: [20, 60, 40] };
export function buzz(kind = "tap") {
  try { if (localStorage.getItem("gv_vib") !== "off") navigator.vibrate?.(VIB[kind] || kind); } catch {}
}
// નાનાં બટન દબાવો એટલે હળવું "ટક"
document.addEventListener("click", e => {
  if (e.target.closest(".bottom a, .side-nav a, .chip, .tab, .seg button, .switch, .agree, .acts a, .tile, .fab, .srow, .btn.primary")) buzz("tap");
}, { capture: true, passive: true });

// ---------- અવાજ: ફોનનો ગુજરાતી કોમ્પ્યુટર અવાજ; ન હોય તો નાની ધૂન ----------
export const soundOn = () => { try { return localStorage.getItem("gv_snd") !== "off"; } catch { return true; } };
let actx = null;
export function chime(notes = [660, 880, 1320]) {
  if (!soundOn()) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    notes.forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * 0.13;
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.4);
    });
  } catch {}
}
function guVoice() {
  const vs = window.speechSynthesis?.getVoices() || [];
  return vs.find(v => /^gu/i.test(v.lang)) || null;
}
// બ્રાઉઝર પહેલા ટચ પછી જ અવાજ વગાડવા દે: ત્યાં સુધી રાહ જુએ
let pendingSay = null;
export function say(text, fallback = [660, 880, 1320]) {
  if (!soundOn()) return;
  const go = () => {
    const ss = window.speechSynthesis, v = guVoice();
    if (!ss || !v) return chime(fallback);
    ss.cancel();
    const u = new SpeechSynthesisUtterance(text); u.voice = v; u.lang = v.lang; u.rate = 0.95;
    ss.speak(u);
  };
  const run = () => (window.speechSynthesis && !window.speechSynthesis.getVoices().length
    ? (window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.onvoiceschanged = null; go(); }, setTimeout(go, 800))
    : go());
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) {
    pendingSay = run;
    addEventListener("pointerdown", () => { const f = pendingSay; pendingSay = null; f?.(); }, { once: true });
  } else run();
}
// દિવસમાં એક જ વાર સ્વાગત
export function welcomeOnce() {
  if (!S.me) return;
  const k = "gv_welcome_" + S.me.loginId, today = ymd();
  try { if (localStorage.getItem(k) === today) return; localStorage.setItem(k, today); } catch {}
  // વિદ્યાર્થી: "અટક નામ પિતા" માંથી નામ; સ્ટાફ: પહેલો શબ્દ; વાલી/Master: નામ વગર
  const parts = String(S.profile?.name || "").trim().split(/\s+/);
  const first = S.me.role === "student" ? (parts[1] || parts[0]) : ["parent", "master"].includes(S.me.role) ? "" : parts[0];
  say(`${first ? "નમસ્તે " + first + ", " : ""}ગાંડિવ એકેડેમીમાં આપનું સ્વાગત છે`);
}

// ---------- toast અને ભૂલ ----------
export function toast(msg, err = false) {
  buzz(err ? "err" : "ok");
  const t = $("#toast");
  t.textContent = msg; t.className = err ? "show err" : "show";
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.className = ""), 3500);
}
export function fail(e, fallback = "કંઈક ખોટું થયું. ફરી પ્રયત્ન કરો.") {
  console.error(e);
  const c = e?.code || "";
  const m = c.includes("permission") ? "આ કામની પરવાનગી નથી."
    : c.includes("unavailable") || c.includes("network") ? "નેટ નથી. નેટ આવે એટલે ફરી પ્રયત્ન કરો."
    : c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found") ? "ID અથવા પાસવર્ડ ખોટો છે."
    : c.includes("too-many-requests") ? "ઘણા પ્રયત્ન થયા. થોડી વાર પછી ફરી કરો."
    : c.includes("weak-password") ? "પાસવર્ડ ઓછામાં ઓછો 6 અક્ષરનો રાખો."
    : c.includes("requires-recent-login") ? "ફરી લોગિન કરીને પાસવર્ડ બદલો."
    : fallback;
  toast(m, true);
}
// બટન દબાવ્યા પછી કામ પૂરું થાય ત્યાં સુધી બંધ રાખે
export async function busy(btn, fn) {
  if (btn.disabled) return;
  const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = "રાહ જુઓ…";
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = old; }
}

// ---------- Audit Log ----------
export function audit(action, target, detail = "") {
  return addDoc(collection(db, "auditLogs"), {
    at: serverTimestamp(), by: S.me?.loginId || "", byName: S.profile?.name || "",
    branchId: S.branchId || "", action, target: String(target || ""), detail: String(detail || "")
  }).catch(e => console.warn("audit", e));
}

// ---------- modal ----------
export function modal(title, bodyHtml, { onOpen } = {}) {
  const d = $("#modal");
  d.innerHTML = `<div class="m-card"><div class="m-head"><h2>${esc(title)}</h2>
    <button type="button" class="icon-btn" data-close aria-label="બંધ કરો"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
    <div class="m-body">${bodyHtml}</div></div>`;
  d.querySelector("[data-close]").onclick = () => d.close();
  d.showModal();
  onOpen?.(d);
  return d;
}
export const closeModal = () => $("#modal").open && $("#modal").close();

// ---------- ઢાંચો ----------
const pages = {};
export const page = (name, fn) => (pages[name] = fn);

export function renderShell() {
  const r = S.me.role, meta = ROLES[r] || ROLES.receptionist;
  document.documentElement.style.setProperty("--role", meta.color);
  const nav = navFor(r);
  const brSel = S.branches.length > 1
    ? `<label class="sr" for="brsel">શાખા</label><select id="brsel" class="br-sel">${S.branches.map(b => `<option value="${b.id}" ${b.id === S.branchId ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select>`
    : S.branches[0] ? `<span class="br-name">${esc(S.branches[0].name)}</span>` : "";
  $("#app").innerHTML = `
  <div class="shell">
    <aside class="side">
      <div class="side-brand"><img src="logo.png" alt="ગાંડિવ એકેડેમીનો લોગો"><span>${esc(ACADEMY.name)}</span></div>
      <nav class="side-nav">${nav.map(([k, l, i]) => `<a href="#/${k}" data-nav="${k}">${ic(i, 20)}<span>${l}</span></a>`).join("")}
        <button type="button" class="side-out" id="sideOut">${ic("out", 20)}<span>બહાર નીકળો</span></button></nav>
    </aside>
    <div class="main">
      <header class="top">
        <img src="logo.png" alt="ગાંડિવ એકેડેમીનો લોગો" class="top-logo">
        <div class="top-who"><b>${esc(S.profile?.name || S.me.loginId)}</b><span>${brSel} ${IS_TEST ? '<em class="test-tag">ટેસ્ટિંગ</em>' : ""}</span></div>
        <span class="role-chip">${esc(meta.label)}</span>
        <button type="button" class="icon-btn" id="sndBtn" aria-label="${soundOn() ? "અવાજ બંધ કરો" : "અવાજ ચાલુ કરો"}">${ic(soundOn() ? "snd" : "mute")}</button>
        <button type="button" class="icon-btn top-out" id="topOut" aria-label="બહાર નીકળો">${ic("out")}</button>
      </header>
      <main id="view" class="view"></main>
    </div>
    <nav class="bottom">${nav.map(([k, l, i]) => `<a href="#/${k}" data-nav="${k}">${ic(i)}<span>${l}</span></a>`).join("")}</nav>
  </div>`;
  const out = async () => { if (confirm("બહાર નીકળવું છે?")) { clearSnap(); await signOut(auth); location.hash = ""; } };
  $("#sideOut").onclick = out; $("#topOut").onclick = out;
  $("#sndBtn").onclick = e => {
    const on = !soundOn();
    try { localStorage.setItem("gv_snd", on ? "on" : "off"); } catch {}
    e.currentTarget.innerHTML = ic(on ? "snd" : "mute");
    e.currentTarget.setAttribute("aria-label", on ? "અવાજ બંધ કરો" : "અવાજ ચાલુ કરો");
    if (on) chime([880, 1320]); else window.speechSynthesis?.cancel();
    toast(on ? "અવાજ ચાલુ." : "અવાજ બંધ. ફરી ચાલુ કરવા આ જ બટન દબાવો.");
  };
  const sel = $("#brsel");
  if (sel) sel.onchange = () => { S.branchId = sel.value; localStorage.setItem("gv_branch", S.branchId); route(); };
  window.onhashchange = route;
  route();
}

export function route() {
  const v = $("#view");
  if (!v || !S.me) return;   // લોગિન પાનું ખુલ્લું હોય ત્યારે કંઈ નહીં
  const name = (location.hash.replace(/^#\/?/, "").split("/")[0]) || "home";
  const allowed = navFor(S.me.role).map(n => n[0]).concat(extraFor(S.me.role));
  S.page = pages[name] && allowed.includes(name) ? name : "home";
  $$("[data-nav]").forEach(a => a.classList.toggle("on", a.dataset.nav === S.page));
  // પાનાનો છેલ્લો ફોટો તરત બતાવો, નવી માહિતી આવે એટલે બદલાઈ જાય
  let last = null; try { last = localStorage.getItem(PK()); } catch {}
  v.innerHTML = last || SKEL;
  Promise.resolve(pages[S.page](v)).catch(e => { fail(e); v.innerHTML = `<div class="empty">આ પાનું ખૂલ્યું નહીં. નેટ ચકાસીને ફરી ખોલો.</div>`; });
  window.scrollTo(0, 0);
}
