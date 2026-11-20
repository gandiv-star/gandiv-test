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
  admin: [["home", "હોમ", "home"], ["batches", "બેચ", "users"], ["settings", "ગોઠવણ", "gear"]],
  staff: [["home", "હોમ", "home"]],
  teacher: [["home", "આજે", "home"]],
  student: [["home", "હોમ", "home"]],
  parent: [["home", "હોમ", "home"]]
};
const navFor = r => (["master", "branchAdmin"].includes(r) ? NAV.admin : r === "teacher" ? NAV.teacher : r === "student" ? NAV.student : r === "parent" ? NAV.parent : NAV.staff);

export const ICON = {
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M22 20a7 7 0 0 0-5-6.7"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  out: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  back: '<path d="M15 5 8 12l7 7"/>'
};
export const ic = (n, size = 22) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n] || ""}</svg>`;

// ---------- toast અને ભૂલ ----------
export function toast(msg, err = false) {
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
        <button type="button" class="icon-btn top-out" id="topOut" aria-label="બહાર નીકળો">${ic("out")}</button>
      </header>
      <main id="view" class="view"></main>
    </div>
    <nav class="bottom">${nav.map(([k, l, i]) => `<a href="#/${k}" data-nav="${k}">${ic(i)}<span>${l}</span></a>`).join("")}</nav>
  </div>`;
  const out = async () => { if (confirm("બહાર નીકળવું છે?")) { await signOut(auth); location.hash = ""; } };
  $("#sideOut").onclick = out; $("#topOut").onclick = out;
  const sel = $("#brsel");
  if (sel) sel.onchange = () => { S.branchId = sel.value; localStorage.setItem("gv_branch", S.branchId); route(); };
  window.onhashchange = route;
  route();
}

export function route() {
  const v = $("#view");
  if (!v || !S.me) return;   // લોગિન પાનું ખુલ્લું હોય ત્યારે કંઈ નહીં
  const name = (location.hash.replace(/^#\/?/, "").split("/")[0]) || "home";
  const allowed = navFor(S.me.role).map(n => n[0]);
  S.page = pages[name] && allowed.includes(name) ? name : "home";
  $$("[data-nav]").forEach(a => a.classList.toggle("on", a.dataset.nav === S.page));
  v.innerHTML = `<div class="loading">લોડ થાય છે…</div>`;
  Promise.resolve(pages[S.page](v)).catch(e => { fail(e); v.innerHTML = `<div class="empty">આ પાનું ખૂલ્યું નહીં. નેટ ચકાસીને ફરી ખોલો.</div>`; });
  window.scrollTo(0, 0);
}
