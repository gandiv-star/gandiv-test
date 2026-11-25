// =============================================================
//  ફેઝ 1B ભાગ 1: ટાઇમટેબલ • ડાયરી • ગૃહકાર્ય • ગૃહકાર્ય તપાસ • લેક્ચર વિડિયો
//  ટાઇમટેબલ: batches/{id}.tt = { "1": [{ s:"07:00", e:"08:00", sub:"ગણિત", t:"T1", tn:"મહેતા સર" }], ... } (0=રવિ)
//  diary/{બેચ}_{yyyy-mm}  days.DD.{k} = { sub,t,tn,s,e, topic, hw, due, vid, pic, by, byName, at, chk:{G101:"n"|"h"}, chkBy }
//     k = તાસનો સમય "0700" — આખા મહિનાની ડાયરી એક જ document (ઓછું વાંચન)
//  diaryNotes/{બેચ}_{yyyy-mm}  days.DD.{k} = "શિક્ષકની ખાનગી નોંધ"  (ફક્ત સંચાલક વાંચે)
//  diaryPics/{બેચ}_{date}_{k} = { data } બોર્ડનો ફોટો (અલગ, જેથી ડાયરી હળવી રહે)
// =============================================================
import { db, collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, writeBatch, serverTimestamp } from "./fb.js";
import { $, $$, esc, S, isAdmin, toast, fail, busy, audit, page, ic, route, fmtD, ymd, z2, waLink, modal, closeModal, buzz, chime } from "./core.js";
import { ACADEMY } from "./config.js";

export const SUBJECTS = ["ગણિત", "વિજ્ઞાન", "અંગ્રેજી", "ગુજરાતી", "સામાજિક વિજ્ઞાન", "હિન્દી", "સંસ્કૃત", "ભૌતિક વિજ્ઞાન", "રસાયણ વિજ્ઞાન", "જીવ વિજ્ઞાન", "નામાના મૂળતત્વો", "આંકડાશાસ્ત્ર", "અર્થશાસ્ત્ર", "વાણિજ્ય વ્યવસ્થા", "કમ્પ્યુટર"];
// ધોરણ/પ્રવાહ પ્રમાણે ફક્ત જરૂરી વિષય (ટાઇમટેબલમાં વપરાયેલા વિષય પહેલાં)
const SUB_STD = ["ગણિત", "વિજ્ઞાન", "અંગ્રેજી", "ગુજરાતી", "સામાજિક વિજ્ઞાન", "હિન્દી", "સંસ્કૃત"];
const SUB_SCI = ["ભૌતિક વિજ્ઞાન", "રસાયણ વિજ્ઞાન", "જીવ વિજ્ઞાન", "ગણિત", "અંગ્રેજી", "ગુજરાતી", "કમ્પ્યુટર"];
const SUB_COM = ["નામાના મૂળતત્વો", "આંકડાશાસ્ત્ર", "અર્થશાસ્ત્ર", "વાણિજ્ય વ્યવસ્થા", "અંગ્રેજી", "ગુજરાતી", "કમ્પ્યુટર"];
export function subjectsFor(b) {
  const txt = `${b?.stream || ""} ${b?.name || ""} ${b?.course || ""}`.toLowerCase(), std = Number(b?.std) || 0;
  let base = SUBJECTS;
  if (std && std <= 10) base = SUB_STD;
  else if (/commerce|કોમર્સ/.test(txt)) base = SUB_COM;
  else if (/science|સાયન્સ|neet|jee|gujcet/.test(txt) || std >= 11) base = SUB_SCI;
  const used = [...new Set(Object.values(b?.tt || {}).flat().map(s => s?.sub).filter(Boolean))];
  return [...new Set([...used, ...base])];
}
const DAYS = ["રવિ", "સોમ", "મંગળ", "બુધ", "ગુરુ", "શુક્ર", "શનિ"];
const DAYS_FULL = ["રવિવાર", "સોમવાર", "મંગળવાર", "બુધવાર", "ગુરુવાર", "શુક્રવાર", "શનિવાર"];
const HW = { y: "કર્યું ✓", n: "નથી કર્યું ✗", h: "અડધું ½" };
const HW_NEXT = { y: "n", n: "h", h: "y" };
const arg = i => decodeURIComponent(location.hash.split("/")[i] || "");
const canAtt = () => isAdmin() || ["teacher", "receptionist", "accountant"].includes(S.me?.role);
const dRef = (bid, ym) => doc(db, "diary", `${bid}_${ym}`);
const nRef = (bid, ym) => doc(db, "diaryNotes", `${bid}_${ym}`);
const pRef = (bid, date, k) => doc(db, "diaryPics", `${bid}_${date}_${k}`);
const rosterRef = () => doc(db, "rosters", `${S.branchId}_${S.year}`);
const dow = date => new Date(date + "T00:00:00").getDay();
const addDays = (date, n) => { const d = new Date(date + "T00:00:00"); d.setDate(d.getDate() + n); return ymd(d); };
const shiftYm = (ym, k) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + k, 1); return `${d.getFullYear()}-${z2(d.getMonth() + 1)}`; };
const keyOf = s => (String(s || "").replace(":", "") || "0000").padStart(4, "0");
const hm = k => `${k.slice(0, 2)}:${k.slice(2)}`;
const nowHM = () => { const d = new Date(); return `${z2(d.getHours())}:${z2(d.getMinutes())}`; };
const plusMin = (t, n) => { const [h, m] = String(t || "07:00").split(":").map(Number), x = (h * 60 + m + n) % 1440; return `${z2(Math.floor(x / 60))}:${z2(x % 60)}`; };
const first = n => String(n || "").split(" ")[0];

export async function getDiary(bid, ym) { try { const s = await getDoc(dRef(bid, ym)); return s.exists() ? s.data() : null; } catch { return null; } }
// એક દિવસના તાસ (ટાઇમટેબલ પ્રમાણે, સમયના ક્રમે)
export const slotsFor = (b, date) => [...(b?.tt?.[dow(date)] || [])].sort((x, y) => String(x.s).localeCompare(String(y.s)));
// શિક્ષકના તાસ છે આ બેચમાં?
export const teachesIn = (b, id) => b.teacherId === id || Object.values(b.tt || {}).some(d => (d || []).some(s => s.t === id));

// ---------- YouTube ----------
export const ytId = u => (String(u || "").match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/) || [])[1] || "";
export const ytThumb = (id, label = "") => `<button type="button" class="ytb" data-yt="${esc(id)}" aria-label="વિડિયો ચલાવો${label ? ": " + esc(label) : ""}">
  <img src="https://i.ytimg.com/vi/${esc(id)}/hqdefault.jpg" alt="" loading="lazy"><span class="ytp">${ic("play", 30)}</span></button>`;
export function wireYt(root) {
  $$("[data-yt]", root).forEach(b => b.onclick = () => {
    const w = document.createElement("div"); w.className = "yt";
    w.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(b.dataset.yt)}?autoplay=1&rel=0&modestbranding=1" title="લેક્ચર વિડિયો" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
    b.replaceWith(w); buzz("tap");
  });
}
const dueLbl = (due, today = ymd()) => !due ? "" : due === today ? "આજે" : due === addDays(today, 1) ? "કાલે" : due < today ? fmtD(due) : `${DAYS[dow(due)]} ${+due.slice(8)}/${+due.slice(5, 7)}`;
// એ વિષયનો આગલો તાસ (14 દિવસમાં), ન મળે તો કાલે (રવિવાર છોડીને)
function nextClass(b, sub, date) {
  for (let i = 1; i <= 14; i++) { const d = addDays(date, i); if (slotsFor(b, d).some(s => s.sub === sub)) return d; }
  const d = addDays(date, 1); return dow(d) === 0 ? addDays(d, 1) : d;
}
// બોલીને લખો (Chrome માં મફત)
function wireMic(root) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  $$("[data-mic]", root).forEach(btn => {
    if (!SR) { btn.remove(); return; }
    btn.onclick = () => {
      const ta = $("#" + btn.dataset.mic, root), r = new SR();
      r.lang = "gu-IN"; r.interimResults = false; r.maxAlternatives = 1;
      btn.classList.add("on"); buzz("tap");
      r.onresult = e => { const t = e.results[0][0].transcript; ta.value = (ta.value ? ta.value.trim() + " " : "") + t; ta.dispatchEvent(new Event("input")); };
      r.onerror = () => toast("અવાજ સંભળાયો નહીં. ફરી પ્રયત્ન કરો.", true);
      r.onend = () => btn.classList.remove("on");
      try { r.start(); } catch { btn.classList.remove("on"); }
    };
  });
}
// ફોટો નાનો કરો (≈150 KB)
function shrink(file) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      let q = .7, out = c.toDataURL("image/jpeg", q);
      while (out.length > 600000 && q > .3) { q -= .1; out = c.toDataURL("image/jpeg", q); }
      res(out);
    };
    img.onerror = rej; img.src = url;
  });
}
async function loadTeachers() {
  try {
    const q = await getDocs(query(collection(db, "users"), where("branchId", "==", S.branchId), where("role", "==", "teacher")));
    return q.docs.map(d => d.data()).filter(u => u.active !== false).sort((a, b) => String(a.name).localeCompare(String(b.name), "gu"));
  } catch { return []; }
}
const commitSoft = async w => {
  const p = w.commit().then(() => true, e => { fail(e, "સચવાયું નહીં. ફરી પ્રયત્ન કરો."); return false; });
  const r = await Promise.race([p, new Promise(ok => setTimeout(() => ok("wait"), 2500))]);
  return r === false ? false : r === "wait" || !navigator.onLine ? "offline" : true;
};

// ================= ટાઇમટેબલ (સંચાલક) =================
page("tt", async v => {
  const bid = arg(2);
  const [bs, teachers] = await Promise.all([getDoc(doc(db, "batches", bid)), loadTeachers()]);
  if (!bs.exists()) { v.innerHTML = `<div class="empty">બેચ મળી નહીં.</div>`; return; }
  const b = { id: bid, ...bs.data() }, admin = isAdmin();
  const TT = JSON.parse(JSON.stringify(b.tt || {}));
  let day = +(sessionStorage.getItem("gv_ttday") || (new Date().getDay() || 1)), dirty = false;
  const order = [1, 2, 3, 4, 5, 6, 0];
  const draw = () => {
    const list = [...(TT[day] || [])].map((s, i) => ({ ...s, i })).sort((x, y) => String(x.s).localeCompare(String(y.s)));
    v.innerHTML = `
      <div class="row-between"><a class="btn line" href="#/batches">${ic("back", 18)} બેચ</a>${dirty ? `<span class="pill warn">સાચવવાનું બાકી</span>` : ""}</div>
      <div><h1 class="page-title" style="margin:0">ટાઇમટેબલ</h1><span class="sub">${esc(b.name)}${b.start ? " • " + esc(b.start) + (b.end ? "–" + esc(b.end) : "") : ""}</span></div>
      <div class="tabs" role="tablist">${order.map(d => `<button type="button" class="tab ${d === day ? "on" : ""}" data-day="${d}" role="tab" aria-selected="${d === day}">${DAYS[d]}${(TT[d] || []).length ? `<small class="tt-n">${TT[d].length}</small>` : ""}</button>`).join("")}</div>
      <div class="card" style="gap:0"><h2 style="margin-bottom:6px">${DAYS_FULL[day]}</h2>
        ${list.map(s => `<button type="button" class="srow ttrow" data-slot="${s.i}" ${admin ? "" : "disabled"}>
          <span class="tm">${esc(s.s)}<small>${esc(s.e || "")}</small></span>
          <span class="grow"><b>${esc(s.sub)}</b><span class="sub" style="display:block">${esc(s.tn || "શિક્ષક નક્કી નથી")}</span></span>${admin ? ic("edit", 18) : ""}</button>`).join("")
          || `<p class="muted" style="margin:8px 0">આ દિવસે કોઈ તાસ નથી.</p>`}
        ${admin ? `<button type="button" class="btn line" id="add" style="margin-top:8px">${ic("plus", 18)} તાસ ઉમેરો</button>` : ""}</div>
      ${admin && (TT[day] || []).length ? `<button type="button" class="btn line big" id="copy">"${DAYS_FULL[day]}" જેવું જ આખું અઠવાડિયું (સોમ–શનિ)</button>` : ""}
      ${admin ? `<div class="fbar" style="grid-template-columns:1fr"><button type="button" class="btn primary" id="save">${ic("check", 18)} ટાઇમટેબલ સાચવો</button></div>` : ""}`;
    $$("[data-day]", v).forEach(t => t.onclick = () => { day = +t.dataset.day; sessionStorage.setItem("gv_ttday", day); draw(); });
    $$("[data-slot]", v).forEach(r => r.onclick = () => slotForm(+r.dataset.slot));
    $("#add", v)?.addEventListener("click", () => slotForm(-1));
    $("#copy", v)?.addEventListener("click", () => {
      const d = modal("આખા અઠવાડિયામાં નકલ", `<p>${DAYS_FULL[day]} ના ${TT[day].length} તાસ સોમવાર થી શનિવાર બધા દિવસે મુકાશે. બીજા દિવસના હાલના તાસ બદલાઈ જશે.</p>
        <div class="grid2"><button type="button" class="btn line" data-close>રહેવા દો</button><button type="button" class="btn primary" id="cok">હા, નકલ કરો</button></div>`);
      $("[data-close].btn", d).onclick = () => closeModal();
      $("#cok", d).onclick = () => { [1, 2, 3, 4, 5, 6].forEach(x => { if (x !== day) TT[x] = JSON.parse(JSON.stringify(TT[day])); }); dirty = true; closeModal(); buzz("done"); draw(); };
    });
    $("#save", v)?.addEventListener("click", e => busy(e.currentTarget, async () => {
      Object.keys(TT).forEach(k => { if (!TT[k]?.length) delete TT[k]; });
      try {
        await updateDoc(doc(db, "batches", bid), { tt: TT, updatedAt: serverTimestamp() });
        audit("tt.save", bid, Object.values(TT).reduce((a, x) => a + x.length, 0) + " તાસ");
        dirty = false; buzz("done"); toast("ટાઇમટેબલ સચવાયું."); draw();
      } catch (e2) { fail(e2); }
    }));
  };
  const slotForm = i => {
    const cur = i >= 0 ? TT[day][i] : null, last = [...(TT[day] || [])].sort((x, y) => String(y.e).localeCompare(String(x.e)))[0];
    const s0 = cur?.s || last?.e || b.start || "07:00";
    const d = modal(cur ? "તાસમાં ફેરફાર" : "નવો તાસ", `
      <form id="sf" class="form" novalidate>
        <div class="grid2"><div class="field"><label for="ss">શરૂ</label><input id="ss" type="time" value="${esc(s0)}"></div>
          <div class="field"><label for="se">પૂરું</label><input id="se" type="time" value="${esc(cur?.e || plusMin(s0, 60))}"></div></div>
        <div class="field"><span class="lbl">વિષય</span><div class="chips">${subjectsFor(b).map(x => `<button type="button" class="chip ${cur?.sub === x ? "on" : ""}" data-sub="${esc(x)}">${esc(x)}</button>`).join("")}</div>
          <input id="sx" placeholder="બીજો વિષય હોય તો લખો" value="${esc(cur && !subjectsFor(b).includes(cur.sub) ? cur.sub : "")}" style="margin-top:8px"></div>
        <div class="field"><label for="st">શિક્ષક</label><select id="st"><option value="">— પછી નક્કી કરીશું —</option>
          ${teachers.map(t => `<option value="${esc(t.loginId)}" ${(cur ? cur.t : b.teacherId) === t.loginId ? "selected" : ""}>${esc(t.name)} (${esc(t.loginId)})</option>`).join("")}</select></div>
        <div class="grid2">${cur ? `<button type="button" class="btn line danger" id="sdel">તાસ કાઢો</button>` : `<span></span>`}<button class="btn primary" type="submit">બરાબર</button></div>
      </form>`);
    let sub = cur?.sub || "";
    $$("[data-sub]", d).forEach(c => c.onclick = () => { sub = c.dataset.sub; $("#sx", d).value = ""; $$("[data-sub]", d).forEach(x => x.classList.toggle("on", x === c)); });
    $("#sx", d).oninput = e => { if (e.target.value.trim()) { sub = ""; $$("[data-sub]", d).forEach(x => x.classList.remove("on")); } };
    $("#sdel", d)?.addEventListener("click", () => { TT[day].splice(i, 1); dirty = true; closeModal(); draw(); });
    $("#sf", d).onsubmit = e => {
      e.preventDefault();
      const s = $("#ss", d).value, en = $("#se", d).value, su = $("#sx", d).value.trim() || sub, tid = $("#st", d).value, t = teachers.find(x => x.loginId === tid);
      if (!s) return toast("શરૂ થવાનો સમય લખો.", true);
      if (en && en <= s) return toast("પૂરા થવાનો સમય શરૂ પછીનો રાખો.", true);
      if (!su) return toast("વિષય પસંદ કરો.", true);
      if ((TT[day] || []).some((x, j) => j !== i && x.s === s)) return toast("આ સમયે બીજો તાસ છે.", true);
      const slot = { s, e: en, sub: su, t: tid, tn: t?.name || "" };
      TT[day] = TT[day] || []; if (i >= 0) TT[day][i] = slot; else TT[day].push(slot);
      dirty = true; closeModal(); buzz("tap"); draw();
    };
  };
  draw();
});

// ================= ડાયરી: એક બેચ, એક દિવસ =================
// ગયો તાસ: એ જ વિષયનું છેલ્લું ગૃહકાર્ય (આ તારીખ પહેલાંનું)
function prevHw(docs, sub, date) {
  let best = null;
  docs.forEach(D => D && Object.entries(D.days || {}).forEach(([dd, day]) => {
    const dt = `${D.ym}-${dd}`; if (dt >= date) return;
    Object.entries(day || {}).forEach(([k, e]) => { if (e?.sub === sub && e.hw && (!best || dt > best.date || (dt === best.date && k > best.k))) best = { date: dt, k, e }; });
  }));
  return best;
}
page("diary", async v => {
  if (!canAtt()) { location.hash = "#/home"; return; }
  const bid = arg(2), date = arg(3) || ymd(), ym = date.slice(0, 7), dd = date.slice(8, 10), admin = isAdmin(), me = S.me.loginId;
  const [bs, D, P, N] = await Promise.all([getDoc(doc(db, "batches", bid)), getDiary(bid, ym), getDiary(bid, shiftYm(ym, -1)),
    admin ? getDoc(nRef(bid, ym)).then(s => s.exists() ? s.data() : null).catch(() => null) : null]);
  if (!bs.exists()) { v.innerHTML = `<div class="empty">બેચ મળી નહીં.</div>`; return; }
  const b = { id: bid, ...bs.data() };
  const day = D?.days?.[dd] || {}, notes = N?.days?.[dd] || {};
  const slots = slotsFor(b, date).map(s => ({ ...s, k: keyOf(s.s) }));
  Object.entries(day).forEach(([k, e]) => { if (!slots.some(s => s.k === k)) slots.push({ s: e.s || hm(k), e: e.e || "", sub: e.sub, t: e.t, tn: e.tn, k }); });
  if (!slots.length && b.teacherId) slots.push({ s: b.start || "", e: b.end || "", sub: "", t: b.teacherId, tn: b.teacherName || "", k: keyOf(b.start) });
  slots.sort((x, y) => x.k.localeCompare(y.k));
  const mineFirst = s => (s.t === me ? 0 : 1);
  if (S.me.role === "teacher") slots.sort((x, y) => mineFirst(x) - mineFirst(y) || x.k.localeCompare(y.k));
  const open = new Set(slots.filter(s => !day[s.k]?.at && (s.t === me || (!s.t && S.me.role === "teacher"))).map(s => s.k));
  const pics = {};
  const card = s => {
    const e = day[s.k] || {}, mine = s.t === me, editing = open.has(s.k), pv = s.sub ? prevHw([D, P], s.sub, date) : null;
    const nChk = pv ? Object.values(pv.e.chk || {}) : [];
    const head = `<div class="dhead"><span class="tm">${esc(s.s || "")}<small>${esc(s.e || "")}</small></span>
      <span class="grow"><b>${esc(s.sub || e.sub || "વિષય?")}</b><span class="sub" style="display:block">${esc(s.tn || e.tn || "")}${mine ? " • તમારો તાસ" : ""}</span></span>
      ${e.at && !editing ? `<span class="pill ok">✓ લખાયું</span>` : ""}</div>`;
    const check = pv ? `<a class="hwprev" href="#/hwchk/${encodeURIComponent(bid)}/${pv.date}/${pv.k}">
      <span class="grow"><span class="sub">ગયા તાસનું ગૃહકાર્ય (${fmtD(pv.date)})</span><b style="display:block">${esc(pv.e.hw)}</b></span>
      ${pv.e.chkBy ? `<span class="pill ${nChk.length ? "warn" : "ok"}">${nChk.length ? [nChk.filter(x => x === "n").length + " ✗", nChk.filter(x => x === "h").length + " ½"].filter(x => x[0] !== "0").join(" • ") : "બધાએ ✓"}</span>` : `<span class="btn line" style="min-height:38px">તપાસો</span>`}</a>` : "";
    if (!editing) return `<div class="card dslot">${head}
      ${e.at ? `${e.topic ? `<p class="dtxt"><span class="sub">આજે ભણાવ્યું</span>${esc(e.topic)}</p>` : ""}
        ${e.hw ? `<p class="dtxt"><span class="sub">ગૃહકાર્ય${e.due ? " • જમા: " + dueLbl(e.due, date) : ""}</span>${esc(e.hw)}</p>` : `<p class="sub">ગૃહકાર્ય નથી આપ્યું</p>`}
        ${admin && notes[s.k] ? `<p class="dtxt note-priv"><span class="sub">🔒 શિક્ષકની નોંધ</span>${esc(notes[s.k])}</p>` : ""}
        ${ytId(e.vid) ? ytThumb(ytId(e.vid), s.sub) : ""}
        ${e.pic ? `<button type="button" class="btn line" data-pic="${s.k}">${ic("cam", 18)} બોર્ડનો ફોટો જુઓ</button>` : ""}
        <span class="sub">${esc(e.byName || e.by || "")}</span>` : `<p class="muted" style="margin:0">હજુ લખાયું નથી.</p>`}
      ${check}
      <button type="button" class="btn ${e.at ? "line" : "primary"}" data-edit="${s.k}">${ic("edit", 18)} ${e.at ? "ફેરફાર કરો" : mine ? "ડાયરી લખો" : "લખો (બદલીમાં)"}</button></div>`;
    const due0 = e.due || (s.sub ? nextClass(b, s.sub, date) : addDays(date, 1));
    return `<form class="card dslot" data-form="${s.k}" novalidate>${head}
      ${!s.sub ? `<div class="field"><span class="lbl">વિષય</span><div class="chips">${subjectsFor(b).map(x => `<button type="button" class="chip" data-fsub="${esc(x)}">${esc(x)}</button>`).join("")}</div></div>` : ""}
      <div class="field"><label for="tp${s.k}">આજે શું ભણાવ્યું <span class="sub">(વિદ્યાર્થી/વાલી જુએ)</span></label>
        <div class="micwrap"><textarea id="tp${s.k}" rows="2" placeholder="પ્રકરણ 4: દ્વિઘાત સમીકરણ — સૂત્રની રીત">${esc(e.topic || "")}</textarea><button type="button" class="icon-btn mic" data-mic="tp${s.k}" aria-label="બોલીને લખો">${ic("mic", 20)}</button></div></div>
      <div class="field"><label for="hw${s.k}">ગૃહકાર્ય <span class="sub">(ન હોય તો ખાલી રાખો)</span></label>
        <div class="micwrap"><textarea id="hw${s.k}" rows="2" placeholder="સ્વાધ્યાય 4.3 ના દાખલા 1 થી 6">${esc(e.hw || "")}</textarea><button type="button" class="icon-btn mic" data-mic="hw${s.k}" aria-label="બોલીને લખો">${ic("mic", 20)}</button></div></div>
      <div class="field"><label for="du${s.k}">ગૃહકાર્ય જમા કરવાની તારીખ</label><input id="du${s.k}" type="date" value="${esc(due0)}" min="${date}"></div>
      <div class="field"><label for="vd${s.k}">લેક્ચર વિડિયો લિંક <span class="sub">(YouTube, વૈકલ્પિક)</span></label><input id="vd${s.k}" type="url" inputmode="url" value="${esc(e.vid || "")}" placeholder="https://youtu.be/..."></div>
      <div class="field"><span class="lbl">બોર્ડનો ફોટો (વૈકલ્પિક)</span><label class="btn line" style="justify-content:center">${ic("cam", 18)} <span data-pl="${s.k}">${e.pic ? "ફોટો છે ✓ — બદલો" : "ફોટો પાડો / પસંદ કરો"}</span>
        <input type="file" accept="image/*" capture="environment" data-file="${s.k}" hidden></label></div>
      <div class="field"><label for="nt${s.k}">🔒 શિક્ષકની નોંધ <span class="sub">(ફક્ત સંચાલક જુએ, વૈકલ્પિક)</span></label>
        <textarea id="nt${s.k}" rows="2" placeholder="વર્ગ, વિદ્યાર્થી કે અભ્યાસક્રમ વિશે ખાનગી વાત">${esc(admin ? notes[s.k] || "" : "")}</textarea>
        ${!admin && e.at ? `<span class="hint">પહેલાં લખેલી નોંધ સંચાલક પાસે સચવાયેલી છે. અહીં લખશો તો નવી નોંધ તેની જગ્યાએ જશે.</span>` : ""}</div>
      ${check}
      <div class="grid2">${e.at ? `<button type="button" class="btn line" data-cancel="${s.k}">રહેવા દો</button>` : `<span></span>`}<button class="btn primary" type="submit">${ic("check", 18)} સાચવો</button></div></form>`;
  };
  const draw = () => {
    v.innerHTML = `
      <div class="row-between"><a class="btn line" href="#/att">${ic("back", 18)} પાછા</a>
        <label class="field" style="margin:0"><span class="sr">તારીખ</span><input type="date" id="ddate" value="${date}" max="${ymd()}"></label></div>
      <div><h1 class="page-title" style="margin:0">ડાયરી • ${esc(b.name)}</h1><span class="sub">${DAYS_FULL[dow(date)]}, ${fmtD(date)}</span></div>
      ${slots.length ? slots.map(card).join("") : `<div class="empty">આ દિવસે ટાઇમટેબલમાં કોઈ તાસ નથી.${admin ? ` <a href="#/tt/${encodeURIComponent(bid)}">ટાઇમટેબલ ગોઠવો</a>` : ""}</div>`}
      <button type="button" class="btn line big" id="adhoc">${ic("plus", 18)} વધારાનો તાસ (ટાઇમટેબલ બહાર)</button>`;
    wireMic(v); wireYt(v);
    $("#ddate").onchange = e => { if (e.target.value) location.hash = `#/diary/${encodeURIComponent(bid)}/${e.target.value}`; };
    $$("[data-edit]", v).forEach(x => x.onclick = () => { open.add(x.dataset.edit); draw(); $(`[data-form="${x.dataset.edit}"]`, v)?.scrollIntoView({ block: "start" }); });
    $$("[data-cancel]", v).forEach(x => x.onclick = () => { open.delete(x.dataset.cancel); draw(); });
    $$("[data-pic]", v).forEach(x => x.onclick = () => busy(x, async () => {
      const s = await getDoc(pRef(bid, date, x.dataset.pic)).catch(() => null);
      if (!s?.exists()) return toast("ફોટો મળ્યો નહીં.", true);
      modal("બોર્ડનો ફોટો", `<img src="${s.data().data}" alt="બોર્ડનો ફોટો" style="width:100%;border-radius:12px">`);
    }));
    $$("[data-file]", v).forEach(inp => inp.onchange = async () => {
      const f = inp.files?.[0]; if (!f) return;
      try { pics[inp.dataset.file] = await shrink(f); $(`[data-pl="${inp.dataset.file}"]`, v).textContent = "ફોટો તૈયાર ✓"; buzz("tap"); }
      catch { toast("ફોટો ખૂલ્યો નહીં.", true); }
    });
    $$("[data-form]", v).forEach(form => {
      const k = form.dataset.form, s = slots.find(x => x.k === k);
      $$("[data-fsub]", form).forEach(c => c.onclick = () => { s.sub = c.dataset.fsub; $$("[data-fsub]", form).forEach(x => x.classList.toggle("on", x === c)); });
      form.onsubmit = ev => {
        ev.preventDefault();
        const topic = $(`#tp${k}`, form).value.trim(), hw = $(`#hw${k}`, form).value.trim(), due = hw ? $(`#du${k}`, form).value : "";
        const vid = $(`#vd${k}`, form).value.trim(), note = $(`#nt${k}`, form).value.trim();
        if (!s.sub) return toast("વિષય પસંદ કરો.", true);
        if (!topic && !hw) return toast("આજે શું ભણાવ્યું અથવા ગૃહકાર્ય લખો.", true);
        if (vid && !ytId(vid)) return toast("YouTube ની સાચી લિંક મૂકો (youtu.be/... અથવા youtube.com/watch?v=...).", true);
        busy($('[type="submit"]', form), async () => {
          const ref = dRef(bid, ym), w = writeBatch(db), P0 = `days.${dd}.${k}`, old = day[k] || {};
          w.set(ref, { branchId: S.branchId, yearId: S.year, batchId: bid, batchName: b.name, ym }, { merge: true });
          w.update(ref, { [`${P0}.sub`]: s.sub, [`${P0}.t`]: s.t || "", [`${P0}.tn`]: s.tn || "", [`${P0}.s`]: s.s || "", [`${P0}.e`]: s.e || "",
            [`${P0}.topic`]: topic, [`${P0}.hw`]: hw, [`${P0}.due`]: due, [`${P0}.vid`]: vid, [`${P0}.pic`]: !!(pics[k] || old.pic),
            [`${P0}.by`]: me, [`${P0}.byName`]: S.profile?.name || "", [`${P0}.at`]: serverTimestamp() });
          if (note || (admin && notes[k])) w.set(nRef(bid, ym), { branchId: S.branchId, batchId: bid, ym, days: { [dd]: { [k]: note } } }, { merge: true });
          if (pics[k]) w.set(pRef(bid, date, k), { branchId: S.branchId, batchId: bid, data: pics[k], at: serverTimestamp() });
          const r = await commitSoft(w);
          if (r === false) return;
          day[k] = { ...old, sub: s.sub, t: s.t, tn: s.tn, s: s.s, e: s.e, topic, hw, due, vid, pic: !!(pics[k] || old.pic), by: me, byName: S.profile?.name || "", at: 1 };
          if (admin) notes[k] = note; delete pics[k];
          audit(old.at ? "diary.edit" : "diary.add", `${bid}_${date}_${k}`, s.sub);
          open.delete(k); buzz("done"); chime([660, 880]);
          toast(r === "offline" ? "નેટ નથી: ફોનમાં સચવાયું, નેટ આવે એટલે મોકલાશે." : "ડાયરી સચવાઈ. વિદ્યાર્થી/વાલીને દેખાશે.");
          draw();
        });
      };
    });
    $("#adhoc").onclick = () => {
      const k = keyOf(nowHM()); if (slots.some(x => x.k === k)) return toast("આ સમયનો તાસ છે જ.", true);
      slots.push({ s: nowHM(), e: "", sub: "", t: me, tn: S.profile?.name || "", k }); open.add(k); draw();
      $(`[data-form="${k}"]`, v)?.scrollIntoView({ block: "start" });
    };
  };
  draw();
});

// ================= ગૃહકાર્ય તપાસ (હાજરી જેવું ટેપ) =================
page("hwchk", async v => {
  if (!canAtt()) { location.hash = "#/home"; return; }
  const bid = arg(2), date = arg(3), k = arg(4), ym = date.slice(0, 7), dd = date.slice(8, 10);
  const [bs, D, rs] = await Promise.all([getDoc(doc(db, "batches", bid)), getDiary(bid, ym), getDoc(rosterRef())]);
  const e = D?.days?.[dd]?.[k];
  if (!bs.exists() || !e) { v.innerHTML = `<div class="empty">ગૃહકાર્ય મળ્યું નહીં.</div>`; return; }
  const b = { id: bid, ...bs.data() };
  const kids = Object.entries((rs.exists() && rs.data().list) || {}).map(([id, x]) => ({ id, ...x }))
    .filter(x => x.b === bid && x.x !== "cancelled").sort((x, y) => String(x.n).localeCompare(String(y.n), "gu"));
  const M = {}; kids.forEach(x => M[x.id] = e.chk?.[x.id] || "y");
  const draw = () => {
    const c = { y: 0, n: 0, h: 0 }; kids.forEach(x => c[M[x.id]]++);
    v.innerHTML = `
      <div class="row-between"><a class="btn line" href="#/diary/${encodeURIComponent(bid)}/${ymd()}">${ic("back", 18)} ડાયરી</a><span class="sub">${e.chkBy ? "તપાસેલું બદલો છો" : ""}</span></div>
      <div><h1 class="page-title" style="margin:0">ગૃહકાર્ય તપાસ</h1><span class="sub">${esc(b.name)} • ${esc(e.sub)} • આપ્યું ${fmtD(date)}</span></div>
      <div class="card" style="gap:2px"><span class="sub">ગૃહકાર્ય</span><b>${esc(e.hw)}</b></div>
      ${!kids.length ? `<div class="empty">આ બેચમાં હજુ કોઈ વિદ્યાર્થી નથી.</div>` : `
      <div class="sumbar" style="grid-template-columns:repeat(3,1fr)"><div><b style="color:#15803D">${c.y}</b><span class="sub">કર્યું</span></div>
        <div><b style="color:#DC2626">${c.n}</b><span class="sub">નથી કર્યું</span></div><div><b style="color:#B45309">${c.h}</b><span class="sub">અડધું</span></div></div>
      <p class="hint" style="margin:0">નામ દબાવો: <b style="color:#15803D">કર્યું</b> → <b style="color:#DC2626">નથી કર્યું</b> → <b style="color:#B45309">અડધું</b> → કર્યું</p>
      <div class="attlist">${kids.map((x, i) => `<div class="att ${{ y: "", n: "ab", h: "lv" }[M[x.id]]}" data-sid="${esc(x.id)}" role="button" tabindex="0" aria-label="${esc(x.n)}: ${HW[M[x.id]]}">
        <span class="rn">${i + 1}</span><span class="grow"><b>${esc(x.n)}</b></span><span class="st">${HW[M[x.id]]}</span></div>`).join("")}</div>`}
      <div class="fbar" style="grid-template-columns:1fr"><button type="button" class="btn primary" id="save" ${kids.length ? "" : "disabled"}>${ic("check", 18)} સાચવો</button></div>`;
    $$("[data-sid]", v).forEach(el => {
      const tap = () => { const id = el.dataset.sid; M[id] = HW_NEXT[M[id]]; buzz(M[id] === "n" ? [25, 40, 25] : "tap"); const y = window.scrollY; draw(); window.scrollTo(0, y); };
      el.onclick = tap; el.onkeydown = ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); tap(); } };
    });
    $("#save", v)?.addEventListener("click", ev => busy(ev.currentTarget, async () => {
      const chk = {}; kids.forEach(x => { if (M[x.id] !== "y") chk[x.id] = M[x.id]; });
      const w = writeBatch(db), P0 = `days.${dd}.${k}`;
      w.update(dRef(bid, ym), { [`${P0}.chk`]: chk, [`${P0}.chkBy`]: S.me.loginId, [`${P0}.chkAt`]: serverTimestamp() });
      const r = await commitSoft(w); if (r === false) return;
      e.chk = chk; e.chkBy = S.me.loginId;
      audit("hw.check", `${bid}_${date}_${k}`, `${Object.values(chk).filter(x => x === "n").length} નથી કર્યું`);
      buzz("done"); chime([660, 880]); done(chk, r === "offline");
    }));
  };
  const done = async (chk, offline) => {
    // આ મહિને કેટલી વાર ગૃહકાર્ય નથી કર્યું
    const cur = await getDiary(bid, ym), cnt = {};
    Object.values(cur?.days || D.days || {}).forEach(dy => Object.values(dy || {}).forEach(x => Object.entries(x?.chk || {}).forEach(([sid, st]) => { if (st === "n" || st === "h") cnt[sid] = (cnt[sid] || 0) + 1; })));
    const who = kids.filter(x => chk[x.id]);
    v.innerHTML = `
      <div class="card"><div class="okhead"><span class="tick">${ic("check", 34)}</span>
        <h1>${kids.length - who.length} કર્યું • ${who.filter(x => chk[x.id] === "n").length} નથી કર્યું • ${who.filter(x => chk[x.id] === "h").length} અડધું</h1>
        <span class="sub">${esc(b.name)} • ${esc(e.sub)} • વાલીની એપમાં આપમેળે દેખાશે</span></div></div>
      ${offline ? `<div class="note old">${ic("info", 20)}<div><b>નેટ નથી:</b> ફોનમાં સચવાયું છે. નેટ આવે એટલે આપમેળે મોકલાઈ જશે.</div></div>` : ""}
      ${who.length ? `<div class="card" style="gap:0"><h2 style="margin-bottom:6px">વાલીને WhatsApp</h2>
        ${who.map(x => {
          const msg = `${ACADEMY.name}\nનમસ્તે, ${x.n} એ ${fmtD(date)} નું ${e.sub} નું ગૃહકાર્ય ${chk[x.id] === "n" ? "કર્યું નથી" : "અધૂરું કર્યું છે"}.\nગૃહકાર્ય: ${e.hw}\nઆ મહિને ${cnt[x.id] || 1} વાર. ઘરે ધ્યાન રાખવા વિનંતી 🙏`;
          return `<div class="srow"><span class="grow"><b>${esc(x.n)}</b><span class="sub ${chk[x.id] === "n" ? "due-over" : "late"}" style="display:block">${HW[chk[x.id]]} • આ મહિને ${cnt[x.id] || 1} વાર</span></span>
            ${x.m ? `<a class="btn wa" style="min-height:40px" target="_blank" rel="noopener" href="${waLink(x.m, msg)}" data-sent>${ic("wa", 18)} મોકલો</a>` : `<span class="sub">નંબર નથી</span>`}</div>`;
        }).join("")}</div>` : `<div class="card center"><b>બધાએ ગૃહકાર્ય કર્યું 🎉</b></div>`}
      <div class="grid2"><button type="button" class="btn line" id="reopen">ફરી ખોલો</button><a class="btn primary" href="#/diary/${encodeURIComponent(bid)}/${ymd()}">ડાયરી</a></div>`;
    $$("[data-sent]", v).forEach(a => a.addEventListener("click", () => setTimeout(() => { a.textContent = "✓ મોકલ્યું"; a.classList.replace("wa", "line"); }, 400)));
    $("#reopen").onclick = () => draw();
    window.scrollTo(0, 0);
  };
  draw();
});

// ================= શિક્ષક/સંચાલકના "આજે" માં ડાયરીનું કાર્ડ =================
export async function diaryHomeCard(batches, date = ymd()) {
  const me = S.me.loginId, teacher = S.me.role === "teacher", ym = date.slice(0, 7), dd = date.slice(8, 10);
  const rows = batches.map(b => {
    let sl = slotsFor(b, date);
    if (!sl.length && b.teacherId) sl = [{ s: b.start, sub: "", t: b.teacherId, tn: b.teacherName }];
    if (teacher) sl = sl.filter(s => s.t === me);
    return { b, sl };
  }).filter(r => r.sl.length);
  if (!rows.length) return "";
  const docs = await Promise.all(rows.map(r => getDiary(r.b.id, ym)));
  let left = 0;
  const html = rows.map((r, i) => {
    const day = docs[i]?.days?.[dd] || {};
    const done = r.sl.filter(s => day[keyOf(s.s)]?.at).length; left += r.sl.length - done;
    return `<a class="srow" href="#/diary/${encodeURIComponent(r.b.id)}/${date}"><span class="tm">${esc(r.sl[0].s || "—")}</span>
      <span class="grow"><b>${esc(r.b.name)}</b><span class="sub" style="display:block">${r.sl.map(s => esc(s.sub || "તાસ")).join(" • ")}</span></span>
      ${done === r.sl.length ? `<span class="pill ok">✓</span>` : `<span class="btn ${teacher ? "primary" : "line"}" style="min-height:38px">${teacher ? "લખો" : `${done}/${r.sl.length}`}</span>`}</a>`;
  }).join("");
  return `<div class="card" style="gap:0"><div class="row-between" style="margin-bottom:6px"><h2>${ic("edit", 20)} આજની ડાયરી</h2>${left ? `<span class="pill warn">${left} બાકી</span>` : `<span class="pill ok">બધી ✓</span>`}</div>${html}</div>`;
}

// ================= વિદ્યાર્થી/વાલીના હોમ માટે =================
// s = વિદ્યાર્થીનો document, sid = ID. પાછું: html (આજનું ગૃહકાર્ય, ન કર્યું, આજનો લેક્ચર, ટાઇમટેબલ)
export async function familyDiaryHtml(s, sid, shared = false) {
  if (!s?.batchId) return "";
  const today = ymd(), ym = today.slice(0, 7);
  const [bs, D, P] = await Promise.all([getDoc(doc(db, "batches", s.batchId)).catch(() => null), getDiary(s.batchId, ym), +today.slice(8) <= 7 ? getDiary(s.batchId, shiftYm(ym, -1)) : null]);
  const b = bs?.exists() ? bs.data() : null;
  const all = []; [P, D].forEach(X => X && Object.entries(X.days || {}).forEach(([dd, day]) => Object.entries(day || {}).forEach(([k, e]) => e?.at && all.push({ date: `${X.ym}-${dd}`, k, ...e }))));
  all.sort((x, y) => (y.date + y.k).localeCompare(x.date + x.k));
  const from7 = addDays(today, -7);
  const hw = all.filter(e => e.hw && ((e.due && e.due >= today) || (!e.due && e.date >= addDays(today, -1)))).sort((x, y) => String(x.due || x.date).localeCompare(String(y.due || y.date)));
  const miss = all.filter(e => e.date >= from7 && e.chk?.[sid]);
  const monthMiss = all.filter(e => e.date.startsWith(ym) && e.chk?.[sid]).length;
  const lec = shared ? [] : all.filter(e => ytId(e.vid) && e.date >= addDays(today, -3)).slice(0, 2);
  const tt = b && !shared ? slotsFor(b, today) : [];
  const name = first(String(s.name || "").split(" ")[1] || s.name);
  return `
    ${miss.length ? `<a class="card card-alert hwmiss" href="#/mydiary/${encodeURIComponent(sid)}">${ic("info", 22)}<span class="grow">
      <b>${miss.slice(0, 2).map(e => `${e.date === addDays(today, -1) ? "ગઈકાલનું" : fmtD(e.date) + " નું"} ${esc(e.sub)} ગૃહકાર્ય ${e.chk[sid] === "n" ? "નથી કર્યું" : "અધૂરું"}`).join(" • ")}</b>
      <span class="sub" style="display:block">${S.me.role === "parent" ? esc(name) + " • " : ""}આ મહિને ${monthMiss} વાર • ડાયરી જુઓ →</span></span></a>` : ""}
    ${hw.length ? `<div class="card" style="gap:0"><div class="row-between" style="margin-bottom:4px"><h2>${ic("book", 20)} ${S.me.role === "parent" ? esc(name) + " નું ગૃહકાર્ય" : "ગૃહકાર્ય"}</h2><span class="sub">${hw.length} વિષય</span></div>
      ${hw.slice(0, 6).map(e => `<div class="srow" style="min-height:52px"><span class="grow"><b>${esc(e.sub)}</b> — ${esc(e.hw)}</span>${e.due ? `<span class="pill">${dueLbl(e.due)}</span>` : ""}</div>`).join("")}</div>` : ""}
    ${lec.map(e => `<div class="card" style="gap:8px"><div class="row-between"><h2>${ic("play", 20)} ${e.date === today ? "આજનો લેક્ચર" : "લેક્ચર • " + fmtD(e.date)}</h2><span class="sub">${esc(e.sub)}${e.tn ? " • " + esc(e.tn) : ""}</span></div>
      ${ytThumb(ytId(e.vid), e.topic || e.sub)}${e.topic ? `<span class="sub">${esc(e.topic)}</span>` : ""}</div>`).join("")}
    ${tt.length ? `<div class="card" style="gap:0"><h2 style="margin-bottom:4px">${ic("clock", 20)} આજનું ટાઇમટેબલ</h2>
      ${tt.map(x => `<div class="srow" style="min-height:48px"><span class="tm">${esc(x.s)}<small>${esc(x.e || "")}</small></span><span class="grow"><b>${esc(x.sub)}</b>${x.tn ? `<span class="sub" style="display:block">${esc(x.tn)}</span>` : ""}</span></div>`).join("")}</div>` : ""}`;
}

// ================= ડાયરી અને બધા લેક્ચર (વિદ્યાર્થી/વાલી) =================
page("mydiary", async v => {
  const sid = arg(2) || S.me.loginId;
  const ss = await getDoc(doc(db, "students", sid)).catch(() => null);
  if (!ss?.exists() || !ss.data().batchId) { v.innerHTML = `<div class="empty">બેચ નક્કી નથી.</div>`; return; }
  const s = ss.data(), bid = s.batchId;
  let months = 2, sub = sessionStorage.getItem("gv_mdsub") || "", onlyVid = false;
  const docs = [];
  const load = async () => { const ym0 = ymd().slice(0, 7); const need = []; for (let i = docs.length; i < months; i++) need.push(getDiary(bid, shiftYm(ym0, -i))); docs.push(...await Promise.all(need)); };
  await load();
  const draw = () => {
    const all = []; docs.forEach(X => X && Object.entries(X.days || {}).forEach(([dd, day]) => Object.entries(day || {}).forEach(([k, e]) => e?.at && all.push({ date: `${X.ym}-${dd}`, k, ...e }))));
    all.sort((x, y) => (y.date + y.k).localeCompare(x.date + x.k));
    const subs = [...new Set(all.map(e => e.sub))];
    const list = all.filter(e => (!sub || e.sub === sub) && (!onlyVid || ytId(e.vid)));
    let lastD = "";
    v.innerHTML = `
      <div class="row-between"><a class="btn line" href="#/home">${ic("back", 18)} હોમ</a><span class="sub">${esc(s.name)}</span></div>
      <h1 class="page-title" style="margin:0">ગૃહકાર્ય અને લેક્ચર</h1>
      <div class="hscroll">${[["", "બધા વિષય"], ...subs.map(x => [x, x])].map(([k, l]) => `<button type="button" class="chip ${sub === k ? "on" : ""}" data-sub="${esc(k)}">${esc(l)}</button>`).join("")}</div>
      <label class="check"><input type="checkbox" id="ov" ${onlyVid ? "checked" : ""}> ફક્ત લેક્ચર વિડિયો</label>
      ${list.map(e => {
        const h = e.date !== lastD ? `<h2 class="dday">${DAYS_FULL[dow(e.date)]}, ${fmtD(e.date)}</h2>` : ""; lastD = e.date;
        const st = e.chk?.[sid], checked = !!e.chkBy;
        return `${h}<div class="card dslot" style="gap:6px"><div class="row-between"><b>${esc(e.sub)}</b><span class="sub">${esc(e.tn || "")}</span></div>
          ${e.topic ? `<p class="dtxt"><span class="sub">ભણાવ્યું</span>${esc(e.topic)}</p>` : ""}
          ${e.hw ? `<p class="dtxt"><span class="sub">ગૃહકાર્ય${e.due ? " • જમા " + dueLbl(e.due) : ""}</span>${esc(e.hw)}</p>
            ${checked ? `<span class="pill ${st === "n" ? "bad" : st === "h" ? "warn" : "ok"}" style="align-self:flex-start">${HW[st || "y"]}</span>` : ""}` : ""}
          ${ytId(e.vid) ? ytThumb(ytId(e.vid), e.topic || e.sub) : ""}</div>`;
      }).join("") || `<div class="empty">હજુ કંઈ લખાયું નથી.</div>`}
      ${months < 12 ? `<button type="button" class="btn line big" id="more">વધુ જૂનું જુઓ</button>` : ""}`;
    wireYt(v);
    $$("[data-sub]", v).forEach(c => c.onclick = () => { sub = c.dataset.sub; sessionStorage.setItem("gv_mdsub", sub); draw(); });
    $("#ov").onchange = e => { onlyVid = e.target.checked; draw(); };
    $("#more", v)?.addEventListener("click", e => busy(e.currentTarget, async () => { months += 2; await load(); draw(); }));
  };
  draw();
});
