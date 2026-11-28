// =============================================================
//  ફેઝ 1B ભાગ 3: નોટિસ બોર્ડ • ફોન નોટિફિકેશન • આપમેળે સૂચના
//  noticeIdx/{શાખા}_{વર્ષ}         = { list: { nid: { k, t, b, at, by, bn, aud, pin, pic, n } } }  ← બધા માટેની નોટિસ (1 વાંચન)
//  noticeIdx/{શાખા}_{વર્ષ}_staff   = સ્ટાફની નોટિસ + અમુક વિદ્યાર્થીને મોકલેલી નોટિસની નકલ
//  inbox/{G101}_{વર્ષ}             = { list: { nid: {...} } }  ← અમુક વિદ્યાર્થીને જ મોકલેલી નોટિસ (ખાનગી)
//  noticeReads/{nid}               = { r: { loginId: [sids] } }  ← કોણે વાંચી
//  noticePics/{nid}                = { data }  ← ફોટો
//  pushReg/{શાખા}                  = { u: { loginId: { t: {token: ms}, s: [sids], r: role } } }  ← ફોન નોટિફિકેશનનાં સરનામાં
//  મોકલવાનું: Apps Script web app (મફત) — PUSH.url, PUSH.vapid (config.js)
// =============================================================
import { db, auth, app, doc, getDoc, setDoc, writeBatch, serverTimestamp } from "./fb.js";
import { $, $$, esc, S, isAdmin, isMaster, toast, fail, busy, audit, page, ic, fmtD, ymd, waLink, modal, closeModal, buzz, chime } from "./core.js";
import { ACADEMY, PUSH } from "./config.js";

export const KINDS = { rja: ["રજા", "🏖️", "ok"], exam: ["પરીક્ષા", "📝", "blue"], fee: ["ફી", "💰", "warn"], event: ["કાર્યક્રમ", "🎉", "pink"], gen: ["સામાન્ય", "📢", ""] };
const FAMILY = () => ["student", "parent"].includes(S.me?.role);
const idxRef = (staff = false) => doc(db, "noticeIdx", `${S.branchId}_${S.year}${staff ? "_staff" : ""}`);
const inboxRef = sid => doc(db, "inbox", `${sid}_${S.year}`);
const readsRef = nid => doc(db, "noticeReads", nid);
const picRef = nid => doc(db, "noticePics", nid);
const rosterRef = () => doc(db, "rosters", `${S.branchId}_${S.year}`);
const arg = i => decodeURIComponent(location.hash.split("/")[i] || "");
const first = n => { const p = String(n || "").trim().split(/\s+/); return p.length > 1 ? p[1] : p[0]; };
const when = ms => { const d = new Date(ms), t = new Date(); const sameDay = d.toDateString() === t.toDateString();
  return sameDay ? `આજે ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : fmtD(ymd(d)); };
export const canNotice = () => isAdmin() || (["teacher", "receptionist", "accountant"].includes(S.me?.role) && S.profile?.noNotice !== true);

// ---------- મારા વિદ્યાર્થી (વાલી: બાળકો, વિદ્યાર્થી: પોતે) અને તેમની બેચ ----------
let kidsCache = null;
async function myKids() {
  if (kidsCache?.who === S.me.loginId) return kidsCache.list;
  const ids = S.me.role === "student" ? [S.me.loginId] : (S.profile?.childIds || []);
  const list = (await Promise.all(ids.map(id => getDoc(doc(db, "students", id)).then(s => s.exists() ? { id, ...s.data() } : null).catch(() => null)))).filter(Boolean);
  kidsCache = { who: S.me.loginId, list }; return list;
}
// મારા માટેની નોટિસ (નવી પહેલાં, ચોંટાડેલી સૌથી ઉપર)
export async function myNotices() {
  const rows = [];
  const take = (L, extra = {}) => Object.entries(L || {}).forEach(([id, n]) => n && rows.push({ id, ...n, ...extra }));
  if (FAMILY()) {
    const kids = await myKids(), bids = new Set(kids.map(k => k.batchId));
    const [pub, ...inb] = await Promise.all([getDoc(idxRef()).catch(() => null), ...kids.map(k => getDoc(inboxRef(k.id)).catch(() => null))]);
    take(pub?.exists() ? Object.fromEntries(Object.entries(pub.data().list || {}).filter(([, n]) => n && (n.aud?.type === "all" || (n.aud?.batches || []).some(b => bids.has(b))))) : {});
    inb.forEach(s => s?.exists() && take(s.data().list));
  } else {
    const [pub, stf] = await Promise.all([getDoc(idxRef()).catch(() => null), getDoc(idxRef(true)).catch(() => null)]);
    take(pub?.exists() ? pub.data().list : {}); take(stf?.exists() ? stf.data().list : {});
  }
  const seen = new Set(); return rows.filter(n => !seen.has(n.id) && seen.add(n.id)).sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || b.at - a.at);
}
const seenKey = () => "gv_nseen_" + S.me.loginId;
const seenSet = () => { try { return new Set(JSON.parse(localStorage.getItem(seenKey()) || "[]")); } catch { return new Set(); } };
function markSeen(ids) {
  const s = seenSet(); ids.forEach(i => s.add(i));
  try { localStorage.setItem(seenKey(), JSON.stringify([...s].slice(-400))); } catch {}
}
// વાંચ્યું તેની નોંધ (મોકલનારને ગણતરી માટે)
async function markRead(n) {
  if (n.by === S.me.loginId) return;
  const sids = FAMILY() ? (await myKids()).map(k => k.id) : [];
  try { await setDoc(readsRef(n.id), { branchId: S.branchId, r: { [S.me.loginId]: sids.length ? sids : ["staff"] } }, { merge: true }); } catch {}
}

// ---------- 🔔 ઉપરની ઘંટડી ----------
let bellBusy = false;
export async function refreshBell() {
  const b = $("#bellBtn"); if (!b || bellBusy || !S.me) return; bellBusy = true;
  try {
    const list = await myNotices(), seen = seenSet(), n = list.filter(x => !seen.has(x.id) && x.by !== S.me.loginId).length;
    const bd = $(".bdg", b); bd.textContent = n > 9 ? "9+" : n; bd.hidden = !n;
    b.setAttribute("aria-label", n ? `${n} નવી નોટિસ` : "નોટિસ");
  } catch {} finally { bellBusy = false; }
}
window.addEventListener("gv:shell", () => { refreshBell(); pushAuto(); });

// હોમ પર: ન વાંચેલી નવી નોટિસ (વધુમાં વધુ 2) + નોટિફિકેશન ચાલુ કરવાનું કાર્ડ
export async function homeNoticeHtml() {
  let html = "";
  try {
    const seen = seenSet(), list = (await myNotices()).filter(n => !seen.has(n.id) && n.by !== S.me.loginId).slice(0, 2);
    html = list.map(n => `<a class="card ncard" href="#/notice/${encodeURIComponent(n.id)}"><span class="nic">${KINDS[n.k]?.[1] || "📢"}</span>
      <span class="grow"><span class="sub">${esc(KINDS[n.k]?.[0] || "નોટિસ")} • ${when(n.at)}</span><b style="display:block">${esc(n.t)}</b>
      <span class="ntxt">${esc(n.b)}</span></span>${ic("chev", 18)}</a>`).join("");
  } catch {}
  return pushAskHtml() + html;
}

// ================= નોટિસ બોર્ડ =================
page("notices", async v => {
  const list = await myNotices(), seen = seenSet();
  let f = sessionStorage.getItem("gv_nf") || "";
  const draw = () => {
    const L = list.filter(n => !f || n.k === f);
    v.innerHTML = `
      ${isAdmin() ? `<a class="btn line big" href="#/helpdesk">💬 મદદ ઇનબોક્સ (વાલી / વિદ્યાર્થીની વાત)</a>` : ""}
      <div class="row-between"><h1 class="page-title" style="margin:0">નોટિસ</h1>${canNotice() ? `<a class="btn primary" href="#/notice-new">${ic("plus", 18)} નવી નોટિસ</a>` : ""}</div>
      ${pushAskHtml()}
      <div class="hscroll">${[["", "બધી"], ...Object.entries(KINDS).map(([k, x]) => [k, x[1] + " " + x[0]])].map(([k, l]) => `<button type="button" class="chip ${f === k ? "on" : ""}" data-nf="${k}">${l}</button>`).join("")}</div>
      <div class="card" style="gap:0">${L.map(n => `<a class="nrow ${seen.has(n.id) || n.by === S.me.loginId ? "" : "new"}" href="#/notice/${encodeURIComponent(n.id)}">
        <span class="nic">${KINDS[n.k]?.[1] || "📢"}</span>
        <span class="grow"><b>${n.pin ? "📌 " : ""}${esc(n.t)}</b><span class="ntxt">${esc(n.b)}</span>
          <span class="sub" style="display:block">${when(n.at)} • ${esc(n.bn || "")}${!FAMILY() ? ` • ${audLabel(n.aud)}` : ""}${n.pic ? " • 📎 ફોટો" : ""}</span></span></a>`).join("")
        || `<p class="muted" style="margin:10px 0">હજુ કોઈ નોટિસ નથી.</p>`}</div>`;
    $$("[data-nf]", v).forEach(c => c.onclick = () => { f = c.dataset.nf; sessionStorage.setItem("gv_nf", f); draw(); });
    wirePushAsk(v);
  };
  draw();
});
const audLabel = a => !a ? "" : a.type === "all" ? "આખી શાખા" : a.type === "staff" ? "ફક્ત સ્ટાફ" : a.type === "batches" ? (a.bnames || []).join(", ") : `${(a.sids || []).length} વિદ્યાર્થી`;

// ================= એક નોટિસ =================
page("notice", async v => {
  const nid = arg(2), list = await myNotices(), n = list.find(x => x.id === nid);
  if (!n) { v.innerHTML = `<div class="empty">નોટિસ મળી નહીં. <a href="#/notices">બધી નોટિસ</a></div>`; return; }
  markSeen([nid]); markRead(n); refreshBell();
  const mine = n.by === S.me.loginId, canEdit = isMaster() || isAdmin() || mine;
  v.innerHTML = `
    <div class="row-between"><a class="btn line" href="#/notices">${ic("back", 18)} નોટિસ</a>${canEdit && !FAMILY() ? `<a class="btn line" href="#/notice-new/${encodeURIComponent(nid)}">${ic("edit", 18)} સુધારો</a>` : ""}</div>
    <div class="card ndetail"><span class="pill ${KINDS[n.k]?.[2] || ""}" style="align-self:flex-start">${KINDS[n.k]?.[1] || ""} ${esc(KINDS[n.k]?.[0] || "નોટિસ")}</span>
      <h1 style="margin:4px 0 0;font-size:22px">${n.pin ? "📌 " : ""}${esc(n.t)}</h1>
      <p class="nbody">${esc(n.b).replace(/\n/g, "<br>")}</p>
      <div id="npic"></div>
      <span class="sub">${esc(n.bn || "")} • ${when(n.at)}${n.ed ? " • સુધારેલી" : ""}</span></div>
    <div id="nstat"></div>`;
  if (n.pic) getDoc(picRef(nid)).then(s => { if (s.exists()) $("#npic", v).innerHTML = `<img src="${s.data().data}" alt="નોટિસનો ફોટો" class="npic">`; }).catch(() => {});
  if (!FAMILY() && (mine || isAdmin()) && n.aud?.type !== "staff") readStats(n, $("#nstat", v));
});
async function readStats(n, el) {
  const [rs, ro] = await Promise.all([getDoc(readsRef(n.id)).catch(() => null), getDoc(rosterRef()).catch(() => null)]);
  const covered = new Set(Object.values(rs?.exists() ? rs.data().r || {} : {}).flat());
  const kids = Object.entries((ro?.exists() && ro.data().list) || {}).map(([id, x]) => ({ id, ...x })).filter(k => k.x !== "cancelled" &&
    (n.aud?.type === "all" || (n.aud?.batches || []).includes(k.b) || (n.aud?.sids || []).includes(k.id)));
  const rd = kids.filter(k => covered.has(k.id)), not = kids.filter(k => !covered.has(k.id)), pct = kids.length ? Math.round(rd.length * 100 / kids.length) : 0;
  const msg = `${ACADEMY.name}\n${KINDS[n.k]?.[1] || "📢"} ${n.t}\n${n.b}`;
  el.innerHTML = `<div class="card" style="gap:8px"><h2>કોણે વાંચી?</h2>
    <div class="row-between" style="gap:10px"><div class="pgb"><i style="width:${pct}%"></i></div><b>${rd.length} / ${kids.length}</b></div>
    ${not.length ? `<details><summary class="sub">${not.length} એ હજુ નથી વાંચી • યાદી જુઓ</summary>
      ${not.map(k => `<div class="srow"><span class="grow">${esc(k.n)}<span class="sub" style="display:block">${esc(k.bn || "")}</span></span>
        ${k.m ? `<a class="icon-btn wa1" target="_blank" rel="noopener" href="${waLink(k.m, msg)}" aria-label="${esc(k.n)} ના વાલીને WhatsApp">${ic("wa", 20)}</a>` : ""}</div>`).join("")}</details>` : `<span class="sub">બધાએ વાંચી લીધી ✓</span>`}</div>`;
  $$(".wa1", el).forEach(a => a.addEventListener("click", () => a.classList.add("sent")));
}

// ================= નવી / સુધારેલી નોટિસ =================
page("notice-new", async v => {
  if (!canNotice()) { v.innerHTML = `<div class="empty">તમને નોટિસ મોકલવાની પરવાનગી નથી. સંચાલકને વાત કરો.</div>`; return; }
  const eid = arg(2), teacher = S.me.role === "teacher";
  const { collection, getDocs, query, where } = await import("./fb.js");
  const [bq, ro, all] = await Promise.all([getDocs(query(collection(db, "batches"), where("branchId", "==", S.branchId), where("yearId", "==", S.year))),
    getDoc(rosterRef()).catch(() => null), eid ? myNotices() : []]);
  const { teachesIn } = await import("./diary.js");
  let batches = bq.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => b.active !== false).sort((a, b) => String(a.name).localeCompare(String(b.name), "gu"));
  if (teacher) batches = batches.filter(b => teachesIn(b, S.me.loginId));
  const kids = Object.entries((ro?.exists() && ro.data().list) || {}).map(([id, x]) => ({ id, ...x })).filter(k => k.x !== "cancelled" && (!teacher || batches.some(b => b.id === k.b)))
    .sort((a, b) => String(a.n).localeCompare(String(b.n), "gu"));
  const old = eid ? all.find(x => x.id === eid) : null;
  if (eid && !old) { v.innerHTML = `<div class="empty">નોટિસ મળી નહીં.</div>`; return; }
  const types = teacher ? [["batches", "મારી બેચ"], ["sids", "અમુક વિદ્યાર્થી"]] : [["all", "આખી શાખા"], ["batches", "અમુક બેચ"], ["sids", "અમુક વિદ્યાર્થી"], ["staff", "ફક્ત સ્ટાફ"]];
  let k = old?.k || "gen", type = old?.aud?.type || types[0][0], selB = new Set(old?.aud?.batches || (teacher && batches.length === 1 ? [batches[0].id] : [])),
    selS = new Set(old?.aud?.sids || []), pin = !!old?.pin, push = !old, pic = null, q = "";
  const count = () => type === "all" ? kids.length : type === "batches" ? kids.filter(x => selB.has(x.b)).length : type === "sids" ? selS.size : 0;
  const draw = () => {
    v.innerHTML = `
      <div class="row-between"><a class="btn line" href="#/notices">${ic("back", 18)} નોટિસ</a></div>
      <h1 class="page-title" style="margin:0">${old ? "નોટિસ સુધારો" : "નવી નોટિસ"}</h1>
      <form id="nf" class="card form" novalidate>
        <div class="field"><span class="lbl">પ્રકાર</span><div class="chips">${Object.entries(KINDS).map(([kk, x]) => `<button type="button" class="chip ${k === kk ? "on" : ""}" data-k="${kk}">${x[1]} ${x[0]}</button>`).join("")}</div></div>
        <div class="field"><label for="nt">શીર્ષક</label><input id="nt" maxlength="80" value="${esc(old?.t || "")}" placeholder="આવતીકાલે ક્લાસ બંધ રહેશે"></div>
        <div class="field"><label for="nb">સંદેશ</label><textarea id="nb" rows="4" maxlength="1200" placeholder="પૂરી વિગત લખો">${esc(old?.b || "")}</textarea></div>
        <div class="field"><span class="lbl">કોને મોકલવી?</span><div class="chips">${types.map(([t, l]) => `<button type="button" class="chip ${type === t ? "on" : ""}" data-ty="${t}">${l}</button>`).join("")}</div>
          ${type === "batches" ? `<div class="chips" style="margin-top:8px">${batches.map(b => `<button type="button" class="chip ${selB.has(b.id) ? "on" : ""}" data-b="${esc(b.id)}">${esc(b.name)}</button>`).join("")}</div>` : ""}
          ${type === "sids" ? `<label class="search" style="margin-top:8px">${ic("search", 20)}<span class="sr">વિદ્યાર્થી શોધો</span><input id="nq" type="search" value="${esc(q)}" placeholder="નામથી શોધો" autocomplete="off"></label>
            <div id="nsel" class="chips" style="margin-top:6px">${[...selS].map(id => `<button type="button" class="chip on" data-rs="${esc(id)}">${esc(kids.find(x => x.id === id)?.n || id)} ✕</button>`).join("")}</div>
            <div id="nres"></div>` : ""}</div>
        <div class="field"><span class="lbl">ફોટો (વૈકલ્પિક)</span><label class="btn line" style="justify-content:center">${ic("cam", 18)} <span id="npl">${pic ? "ફોટો તૈયાર ✓" : old?.pic ? "ફોટો છે ✓ — બદલો" : "ફોટો પસંદ કરો"}</span><input type="file" accept="image/*" id="nfile" hidden></label></div>
        <label class="check"><input type="checkbox" id="npin" ${pin ? "checked" : ""}> 📌 બધી નોટિસમાં સૌથી ઉપર રાખો</label>
        ${type !== "staff" ? `<label class="check"><input type="checkbox" id="npush" ${push ? "checked" : ""}> 🔔 ફોન પર નોટિફિકેશન મોકલો</label>` : ""}
        <button class="btn primary big" type="submit">${old ? "સાચવો" : `મોકલો${type !== "staff" ? ` • ${count()} વિદ્યાર્થી/વાલી` : ""}`}</button>
        ${old ? `<button type="button" class="btn line danger" id="ndel">નોટિસ કાઢી નાખો</button>` : ""}
      </form>`;
    $$("[data-k]", v).forEach(c => c.onclick = () => { k = c.dataset.k; $$("[data-k]", v).forEach(x => x.classList.toggle("on", x === c)); });
    $$("[data-ty]", v).forEach(c => c.onclick = () => { const t = $("#nt").value, b = $("#nb").value; type = c.dataset.ty; draw(); $("#nt").value = t; $("#nb").value = b; });
    $$("[data-b]", v).forEach(c => c.onclick = () => { const id = c.dataset.b; selB.has(id) ? selB.delete(id) : selB.add(id); c.classList.toggle("on"); $('#nf [type="submit"]').textContent = `મોકલો • ${count()} વિદ્યાર્થી/વાલી`; });
    $$("[data-rs]", v).forEach(c => c.onclick = () => { selS.delete(c.dataset.rs); const t = $("#nt").value, b = $("#nb").value; draw(); $("#nt").value = t; $("#nb").value = b; });
    const nq = $("#nq", v);
    if (nq) nq.oninput = () => { q = nq.value.trim();
      const r = q ? kids.filter(x => String(x.n).includes(q) && !selS.has(x.id)).slice(0, 8) : [];
      $("#nres", v).innerHTML = r.map(x => `<button type="button" class="srow" data-as="${esc(x.id)}" style="width:100%;background:none;border:0;border-top:1px solid var(--line);text-align:left;font:inherit"><span class="grow"><b>${esc(x.n)}</b><span class="sub" style="display:block">${esc(x.bn || "")}</span></span>${ic("plus", 18)}</button>`).join("");
      $$("[data-as]", v).forEach(b => b.onclick = () => { selS.add(b.dataset.as); const t = $("#nt").value, bb = $("#nb").value; q = ""; draw(); $("#nt").value = t; $("#nb").value = bb; $("#nq")?.focus(); });
    };
    $("#nfile").onchange = async e => { const f = e.target.files?.[0]; if (!f) return; try { pic = await shrink(f); $("#npl").textContent = "ફોટો તૈયાર ✓"; } catch { toast("ફોટો ખૂલ્યો નહીં.", true); } };
    $("#npin").onchange = e => { pin = e.target.checked; };
    $("#npush", v)?.addEventListener("change", e => { push = e.target.checked; });
    $("#ndel", v)?.addEventListener("click", () => {
      const d = modal("નોટિસ કાઢી નાખવી છે?", `<p>${esc(old.t)}</p><div class="grid2"><button type="button" class="btn line" id="dn">રહેવા દો</button><button type="button" class="btn primary danger" id="dy">હા, કાઢો</button></div>`);
      $("#dn", d).onclick = () => closeModal();
      $("#dy", d).onclick = () => busy($("#dy", d), async () => {
        const w = writeBatch(db), a = old.aud || {};
        if (a.type === "all" || a.type === "batches") w.set(idxRef(), { list: { [eid]: null } }, { merge: true });
        if (a.type === "staff" || a.type === "sids") w.set(idxRef(true), { list: { [eid]: null } }, { merge: true });
        (a.sids || []).forEach(sid => w.set(inboxRef(sid), { branchId: S.branchId, studentId: sid, list: { [eid]: null } }, { merge: true }));
        try { await w.commit(); } catch (e2) { return fail(e2); }
        audit("notice.delete", eid, old.t); closeModal(); toast("નોટિસ કાઢી નાખી."); location.hash = "#/notices";
      });
    });
    $("#nf").onsubmit = ev => {
      ev.preventDefault();
      const t = $("#nt").value.trim(), b = $("#nb").value.trim();
      if (!t) return toast("શીર્ષક લખો.", true);
      if (!b) return toast("સંદેશ લખો.", true);
      if (type === "batches" && !selB.size) return toast("બેચ પસંદ કરો.", true);
      if (type === "sids" && !selS.size) return toast("વિદ્યાર્થી પસંદ કરો.", true);
      busy($('#nf [type="submit"]'), async () => {
        const nid = eid || `${S.branchId}_${Date.now().toString(36)}`;
        const aud = { type, batches: type === "batches" ? [...selB] : [], bnames: type === "batches" ? batches.filter(x => selB.has(x.id)).map(x => x.name) : [], sids: type === "sids" ? [...selS] : [] };
        const n = { k, t, b, at: old?.at || Date.now(), by: old?.by || S.me.loginId, bn: old?.bn || S.profile?.name || "", aud, pin, pic: !!(pic || old?.pic), n: count(), ...(old ? { ed: Date.now() } : {}) };
        const w = writeBatch(db), pub = type === "all" || type === "batches";
        if (old) { const oa = old.aud || {}; // પ્રકાર બદલાય તો જૂની જગ્યાએથી કાઢો
          if ((oa.type === "all" || oa.type === "batches") && !pub) w.set(idxRef(), { list: { [nid]: null } }, { merge: true });
          if ((oa.type === "staff" || oa.type === "sids") && pub) w.set(idxRef(true), { list: { [nid]: null } }, { merge: true });
          (oa.sids || []).filter(s => !selS.has(s)).forEach(sid => w.set(inboxRef(sid), { branchId: S.branchId, studentId: sid, list: { [nid]: null } }, { merge: true })); }
        w.set(pub ? idxRef() : idxRef(true), { branchId: S.branchId, yearId: S.year, list: { [nid]: n } }, { merge: true });
        if (type === "sids") selS.forEach(sid => w.set(inboxRef(sid), { branchId: S.branchId, yearId: S.year, studentId: sid, list: { [nid]: n } }, { merge: true }));
        if (pic) w.set(picRef(nid), { branchId: S.branchId, data: pic, at: serverTimestamp() });
        try { await w.commit(); } catch (e2) { return fail(e2); }
        audit(old ? "notice.edit" : "notice.add", nid, t);
        if (push && type !== "staff") sendPush([{ to: type === "all" ? { all: true } : type === "batches" ? { batches: [...selB] } : { sids: [...selS] },
          title: `${KINDS[k][1]} ${t}`, body: b.slice(0, 180), link: `#/notice/${nid}`, tag: nid }]);
        markSeen([nid]); buzz("done"); chime([784, 988, 1319]);
        toast(old ? "નોટિસ સુધારાઈ." : push && type !== "staff" ? "નોટિસ મોકલાઈ. ફોન પર નોટિફિકેશન જશે." : "નોટિસ મોકલાઈ.");
        location.hash = `#/notice/${encodeURIComponent(nid)}`;
      });
    };
  };
  draw();
});
function shrink(file) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const k = Math.min(1, 1400 / Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      let q = .75, out = c.toDataURL("image/jpeg", q); while (out.length > 700000 && q > .3) { q -= .1; out = c.toDataURL("image/jpeg", q); } res(out); };
    img.onerror = rej; img.src = url;
  });
}

// ================= ફોન નોટિફિકેશન =================
const pushReady = () => !!(PUSH?.vapid && PUSH?.url && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window);
function pushAskHtml() {
  if (!pushReady() || Notification.permission !== "default" || !S.me || S.me.role === "dataEntry") return "";
  if (sessionStorage.getItem("gv_pushlater")) return "";
  return `<div class="card pushask"><span class="nic">🔔</span><span class="grow"><b>ફોન પર નોટિફિકેશન ચાલુ કરો</b>
    <span class="sub" style="display:block">${FAMILY() ? "ગેરહાજરી, પરિણામ, ફી અને નોટિસ તરત જાણવા" : "નોટિસ અને જરૂરી સૂચના તરત જાણવા"}</span></span>
    <button type="button" class="btn primary" data-pushon>ચાલુ કરો</button><button type="button" class="icon-btn" data-pushno aria-label="પછી">${ic("x", 18)}</button></div>`;
}
export function wirePushAsk(root) {
  $$("[data-pushon]", root).forEach(b => b.onclick = () => busy(b, async () => {
    const ok = await enablePush(true);
    if (ok) { b.closest(".pushask")?.remove(); toast("નોટિફિકેશન ચાલુ ✓"); chime([784, 988, 1319]); }
    else toast(Notification.permission === "denied" ? "ફોનમાં નોટિફિકેશન બંધ છે. Chrome → ⋮ → Settings → Notifications માંથી ચાલુ કરો." : "નોટિફિકેશન ચાલુ ન થયું. ફરી પ્રયત્ન કરો.", true);
  }));
  $$("[data-pushno]", root).forEach(b => b.onclick = () => { sessionStorage.setItem("gv_pushlater", "1"); b.closest(".pushask")?.remove(); });
}
async function enablePush(ask = false) {
  if (!pushReady() || !S.me) return false;
  try {
    if (Notification.permission === "default" && ask) { const p = await Notification.requestPermission(); if (p !== "granted") return false; }
    if (Notification.permission !== "granted") return false;
    const m = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js");
    const reg = await navigator.serviceWorker.ready;
    const token = await m.getToken(m.getMessaging(app), { vapidKey: PUSH.vapid, serviceWorkerRegistration: reg });
    if (!token) return false;
    const sids = FAMILY() ? (await myKids()).map(k => k.id) : [];
    for (const bid of (FAMILY() ? [...new Set((await myKids()).map(k => k.branchId))] : [S.branchId])) {
      await setDoc(doc(db, "pushReg", bid), { branchId: bid, u: { [S.me.loginId]: { t: { [token]: Date.now() }, s: sids, r: S.me.role } } }, { merge: true });
    }
    localStorage.setItem("gv_push_" + S.me.loginId, ymd());
    return true;
  } catch (e) { console.warn("push", e); return false; }
}
// દર લોગિન પર (દિવસમાં એક વાર) ચૂપચાપ સરનામું તાજું કરો
function pushAuto() {
  if (!pushReady() || Notification.permission !== "granted" || !S.me) return;
  if (localStorage.getItem("gv_push_" + S.me.loginId) === ymd()) return;
  setTimeout(() => enablePush(false), 4000);
}
// મોકલો: messages = [{ to: {all|batches|sids|staff}, title, body, link, tag }]
export async function sendPush(messages) {
  if (!PUSH?.url || !messages?.length) return;
  try {
    const idToken = await auth.currentUser?.getIdToken(); if (!idToken) return;
    fetch(PUSH.url, { method: "POST", body: JSON.stringify({ idToken, branchId: S.branchId, year: S.year, messages: messages.slice(0, 400) }) }).catch(() => {});
  } catch {}
}
// એપ ખુલ્લી હોય ત્યારે આવેલું નોટિફિકેશન: મધુર ટ્યુન + સંદેશ
if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", e => {
  const n = e.data?.gvPush; if (!n) return;
  chime([659, 784, 988, 1319]); buzz([40, 60, 40]); toast(`🔔 ${n.title}`); refreshBell();
});

// ================= આપમેળે સૂચના (હાજરી, ગૃહકાર્ય, પરિણામ, ફી) =================
const dm = d => fmtD(d).slice(0, 5);
export function autoAttendance({ kids, s, t, prev, date, batchName }) {
  if (date !== ymd()) return; // જૂના દિવસ સુધારો તો ફરી ન મોકલો
  const msgs = [];
  kids.forEach(k => { const st = s[k.id], was = prev?.s?.[k.id];
    if (st === was || !(st === "a" || st === "l")) return;
    msgs.push({ to: { sids: [k.id] }, tag: `att_${k.id}_${date}`, link: `#/home`,
      title: st === "a" ? "ગેરહાજરી" : "મોડા આવ્યા",
      body: st === "a" ? `${first(k.n)} આજે (${dm(date)}) ${batchName} ના ક્લાસમાં ગેરહાજર છે.` : `${first(k.n)} આજે (${dm(date)}) ${batchName} ના ક્લાસમાં ${t[k.id] || ""} વાગ્યે મોડા આવ્યા.` }); });
  sendPush(msgs);
}
export function autoHomework({ kids, chk, prev, e, date }) {
  const msgs = kids.filter(k => chk[k.id] && chk[k.id] !== prev?.[k.id]).map(k => ({ to: { sids: [k.id] }, tag: `hw_${k.id}_${date}`, link: `#/mydiary/${k.id}`,
    title: "ગૃહકાર્ય બાકી",
    body: `${first(k.n)} એ ${dm(date)} નું ${e.sub} નું ગૃહકાર્ય ${chk[k.id] === "n" ? "કર્યું નથી" : "અધૂરું કર્યું છે"}: ${e.hw}` }));
  sendPush(msgs);
}
export function autoResult({ t, marks, prev, kids, rank, top }) {
  const pc = m => Math.round(m * 1000 / t.max) / 10;
  const msgs = kids.filter(k => k.id in marks && marks[k.id] !== prev?.[k.id]).map(k => { const m = marks[k.id];
    return { to: { sids: [k.id] }, tag: `res_${k.id}`, link: `#/myresults/${k.id}`, title: `${t.sub} નું પરિણામ`,
      body: m === "ab" ? `${first(k.n)} ${t.sub} ની ટેસ્ટ (${dm(t.date)}) માં ગેરહાજર હતા.`
        : `${first(k.n)} ને ${t.sub} ની ટેસ્ટ${t.name && t.name !== "ટેસ્ટ" ? ` (${t.name})` : ""} માં ${t.max} માંથી ${m} ગુણ મળ્યા છે.${pc(m) >= top ? ` વર્ગમાં ${rank[k.id]} મો ક્રમ. અભિનંદન! 🎉` : ""}` }; });
  sendPush(msgs);
}
export function autoReceipt(r) {
  if (r.legacy) return;
  sendPush([{ to: { sids: [r.studentId] }, tag: `fee_${r.no}`, link: "#/myfees", title: "ફી મળી",
    body: `${first(r.name)} ની ₹${Number(r.amount).toLocaleString("en-IN")} ફી મળી છે. પહોંચ નં. ${r.no}. આભાર 🙏` }]);
}
