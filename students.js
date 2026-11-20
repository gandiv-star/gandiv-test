// =============================================================
//  ભાગ 3: વિદ્યાર્થી — યાદી, પ્રવેશ ફોર્મ (4 પગલાં), ફાઇલ, વિદ્યાર્થી તરીકે જુઓ
//  ઝડપ માટે: આખી યાદી એક જ document (rosters/{શાખા}_{વર્ષ}) માં — 1 read
//  ફોટો અલગ document (photos/{ID}) માં, જેથી યાદી હળવી રહે
// =============================================================
import {
  db, collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where,
  runTransaction, serverTimestamp, writeBatch, arrayUnion
} from "./fb.js";
import {
  $, $$, esc, S, isAdmin, toast, fail, busy, audit, page, ic, route, renderShell, buzz, say,
  money, fmtD, ymd, waLink, appUrl, modal, closeModal
} from "./core.js";
import { ACADEMY } from "./config.js";
import { createLogin, resetLogin, showCreds } from "./admin.js";

const STDS = ["7", "8", "9", "10", "11", "12"];
const COURSES = ["NEET", "GUJCET", "JEE", "NMMS", "CET"];
const RULES = [
  "દરેક વિદ્યાર્થીએ સંસ્થાના નિયમો તથા શિસ્તનું ચુસ્તપણે પાલન કરવાનું રહેશે.",
  "દરેક બેચની સમય મર્યાદા સિવાય વધુ અભ્યાસ માટે Extra લેક્ચરની ગોઠવણી કરવામાં આવે તો ફરજિયાત હાજરી આપવાની રહેશે.",
  "તમારો ફોટો સંસ્થાના પ્રચાર માટે ઉપયોગ કરી શકાશે.",
  "દરેક વિદ્યાર્થીએ 100% હાજરી આપવાની રહેશે તથા સંસ્થાની મંજૂરી વગર ગેરહાજર રહેવું નહી.",
  "અભ્યાસક્રમ પૂર્ણ થાય ત્યાં સુધી નિયમિત હાજરી આપવી ગેરહાજર રહેવા માટે અગાઉથી જાણ કરવી ત્રણ કે તેથી વધારે દિવસ લેખિત રજાની મંજૂરી મળ્યા સિવાય ગેરહાજર રહેશે તો પ્રવેશ આપોઆપ રદ થશે.",
  "H.W, અસાઈમેન્ટ ફરજીયાત નિયમિત કરવાના રહેશે અને નિયમિત લેવાથી ટેસ્ટમાં સંપૂર્ણ તૈયારી સાથે આવવું તથા ટેસ્ટ ગંભીરતાપૂર્વક આપવી.",
  "વિદ્યાર્થીના હિતમાં સંસ્થા કોઈ પણ પ્રકારનો નિર્ણય કે એક્શન લેવા મુક્ત રહેશે.",
  "ભરેલ ફી કોઈ પણ સંજોગોમાં પરત મળવાપાત્ર નથી.",
  "સંસ્થામાં સંપૂર્ણ શિસ્તપૂર્વક તમામ સ્ટાફ મિત્રો સાથે વ્યવહાર કરવાનો રહેશે.",
  "ક્લાસમાં કોઈ વ્યસન વાળી વસ્તુ, સોપારી કે ચ્વિંગમનુ સેવન કરવુ નહી આ બાબતે સંસ્થા કડક એક્શન લેવા મુક્ત રહેશે."
];
const STEPS = ["1. વિદ્યાર્થી", "2. શાળા, સરનામું", "3. પરિવાર", "4. ફી, નિયમો"];

const branchName = id => S.branches.find(b => b.id === id)?.name || "";
const curBranch = () => S.branches.find(b => b.id === S.branchId) || {};
const rosterRef = () => doc(db, "rosters", `${S.branchId}_${S.year}`);
const metaRef = () => doc(db, "branchMeta", S.branchId);
const num = v => Math.max(0, Math.round(Number(String(v ?? "").replace(/[^\d.]/g, "")) || 0));
const mob10 = v => String(v || "").replace(/\D/g, "").slice(-10);
const initial = n => esc((String(n || "?").trim()[0]) || "?");
const hashArg = () => decodeURIComponent(location.hash.split("/")[2] || "");
// બેચનું નામ હોય તો એ જ (તેમાં ધોરણ આવી જાય), નહીં તો "ધો. 10"
const cls = (std, bn) => esc(bn || ("ધો. " + (std || "")));
const feeCalc = f => { const total = num(f.adm) + num(f.tui); return { total, pay: Math.max(0, total - num(f.sch)) }; };

// ફીની નાની લાઇન (ભાર વગર)
function feeTag(pay, paid) {
  pay = num(pay); paid = num(paid);
  if (!pay) return `<span class="fee-small">ફી નક્કી નથી</span>`;
  const due = pay - paid;
  const [c, t] = due <= 0 ? ["#16A34A", "ભરાઈ ગઈ"] : paid > 0 ? ["#D97706", `બાકી ${money(due)}`] : ["#DC2626", `બાકી ${money(due)}`];
  return `<span class="fee-small"><span class="dot" style="background:${c}"></span> ${t}</span>`;
}
// યાદીમાં રાખવાની ટૂંકી માહિતી
const rosterEntry = s => ({
  n: s.name, s: s.std, b: s.batchId || "", bn: s.batchName || "", v: s.village || "",
  m: s.mobParent || "", p: num(s.fee?.pay), pd: num(s.fee?.paid), f: s.formNo || "", x: s.status || "active"
});

// ================= યાદી =================
page("students", async v => {
  if (!S.branchId) { v.innerHTML = `<div class="empty">પહેલાં ગોઠવણમાં શાખા ઉમેરો.</div>`; return; }
  const snap = await getDoc(rosterRef());
  const list = Object.entries((snap.exists() && snap.data().list) || {}).map(([id, r]) => ({ id, ...r }));
  const flt = JSON.parse(sessionStorage.getItem("gv_sflt") || "{}");
  const batches = [...new Map(list.filter(r => r.b).map(r => [r.b, r.bn])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  v.innerHTML = `
    <div class="row-between"><h1 class="page-title">વિદ્યાર્થીઓ</h1><span class="pill" id="cnt"></span></div>
    <label class="search">${ic("search", 20)}<span class="sr">શોધો</span><input id="q" type="search" value="${esc(flt.q || "")}" placeholder="નામ, ID, ગામ કે મોબાઇલથી શોધો" autocomplete="off"></label>
    <div class="hscroll" role="group" aria-label="ધોરણ">${["", ...STDS].map(s => `<button type="button" class="chip ${(flt.s || "") === s ? "on" : ""}" data-fs="${s}">${s ? "ધો. " + s : "બધા"}</button>`).join("")}</div>
    ${batches.length ? `<div class="hscroll" role="group" aria-label="બેચ">${[["", "બધી બેચ"], ...batches].map(([id, n]) => `<button type="button" class="chip ${(flt.b || "") === id ? "on" : ""}" data-fb="${esc(id)}">${esc(n)}</button>`).join("")}</div>` : ""}
    <div class="card" style="gap:0" id="rows"></div>
    <div class="row-between">
      <button type="button" class="btn line" id="csv">${ic("dl", 18)} Excel માં લો</button>
      ${isAdmin() ? `<a class="fab" href="#/admit">${ic("plus", 20)} નવો પ્રવેશ</a>` : ""}
    </div>`;
  const draw = () => {
    const q = $("#q").value.trim().toLowerCase();
    sessionStorage.setItem("gv_sflt", JSON.stringify({ ...flt, q }));
    const rows = list.filter(r => r.x !== "cancelled")
      .filter(r => !flt.s || r.s === flt.s)
      .filter(r => !flt.b || r.b === flt.b)
      .filter(r => !q || [r.n, r.id, r.v, r.m, String(r.f)].some(x => String(x || "").toLowerCase().includes(q)))
      .sort((a, b) => Number(a.s) - Number(b.s) || String(a.n).localeCompare(String(b.n), "gu"));
    $("#cnt").textContent = `કુલ ${rows.length}`;
    $("#rows").innerHTML = rows.map(r => `<a class="srow" href="#/student/${encodeURIComponent(r.id)}">
        <span class="ph">${initial(r.n)}</span>
        <span class="grow"><b>${esc(r.n)}</b><span class="sub">${esc(r.id)} • ${cls(r.s, r.bn)}${r.v ? " • " + esc(r.v) : ""}</span></span>
        ${feeTag(r.p, r.pd)}</a>`).join("")
      || `<p class="muted center">${list.length ? "આ શોધમાં કોઈ વિદ્યાર્થી નથી." : "હજુ કોઈ પ્રવેશ નથી. \"નવો પ્રવેશ\" દબાવો."}</p>`;
    window.__rows = rows;
  };
  $("#q").oninput = draw;
  $$("[data-fs]", v).forEach(b => b.onclick = () => { flt.s = b.dataset.fs; $$("[data-fs]", v).forEach(x => x.classList.toggle("on", x === b)); draw(); });
  $$("[data-fb]", v).forEach(b => b.onclick = () => { flt.b = b.dataset.fb; $$("[data-fb]", v).forEach(x => x.classList.toggle("on", x === b)); draw(); });
  $("#csv").onclick = () => {
    const head = ["ID", "ફોર્મ નં.", "નામ", "ધોરણ", "બેચ", "ગામ", "વાલી મોબાઇલ", "ફી", "ભરેલી", "બાકી"];
    const lines = (window.__rows || []).map(r => [r.id, r.f, r.n, r.s, r.bn, r.v, r.m, r.p, r.pd, r.p - r.pd]);
    const csv = "﻿" + [head, ...lines].map(a => a.map(x => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `vidyarthi_${branchName(S.branchId)}_${S.year}.csv`; a.click();
  };
  draw();
});

// ================= પ્રવેશ ફોર્મ =================
// F = ફોર્મની બધી માહિતી. ડ્રાફ્ટ ફોનમાં સચવાય.
const DK = () => `gv_adm_draft_${S.branchId}`;
let F = null, STEP = 0, EDIT = null, META = {}, BATCHES = [];

page("admit", async v => {
  if (!isAdmin()) { location.hash = "#/students"; return; }
  if (!S.branchId) { v.innerHTML = `<div class="empty">પહેલાં શાખા ઉમેરો.</div>`; return; }
  const editId = hashArg();
  const [ms, bs, old, ph] = await Promise.all([
    getDoc(metaRef()),
    getDocs(query(collection(db, "batches"), where("branchId", "==", S.branchId), where("yearId", "==", S.year))),
    editId ? getDoc(doc(db, "students", editId)) : null,
    editId ? getDoc(doc(db, "photos", editId)) : null
  ]);
  META = ms.exists() ? ms.data() : {};
  BATCHES = bs.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => b.active !== false);
  if (editId) {
    if (!old?.exists()) { v.innerHTML = `<div class="empty">આ વિદ્યાર્થી મળ્યો નહીં.</div>`; return; }
    EDIT = editId; F = { ...old.data(), photo: ph?.exists() ? ph.data().data : "" };
    F.fee = F.fee || {}; F.siblings = F.siblings || [];
  } else {
    EDIT = null;
    let d = null; try { d = JSON.parse(localStorage.getItem(DK()) || "null"); } catch {}
    F = d || blank();
    if (!F.legacy) F.formDate = F.formDate || ymd();
  }
  STEP = 0;
  drawStep();
});

function blank() {
  return {
    legacy: false, formNo: "", formDate: ymd(), photo: "", name: "", std: "", batchId: "", batchName: "", courses: [],
    caste: "", dob: "", school: "", schoolFrom: "", schoolTo: "", address: "", village: "",
    taluka: META.taluka || "", district: META.district || "",
    prevTuition: "", prevWhere: "", prevStd: "",
    mobParent: "", mobStudent: "", waSame: true, mobWa: "",
    mother: "", fatherEdu: "", fatherJob: "", motherEdu: "", motherJob: "", siblings: [],
    fee: { adm: "", tui: "", sch: "", plan: "વાર્ષિક" }, note: "", rules: false
  };
}
const saveDraft = () => { if (!EDIT) try { localStorage.setItem(DK(), JSON.stringify(F)); } catch {} };

const fld = (k, label, { type = "text", ph = "", val, mode = "", req = false } = {}) =>
  `<div class="field"><label for="f_${k}">${label}${req ? " *" : ""}</label><input id="f_${k}" data-k="${k}" type="${type}" ${mode ? `inputmode="${mode}"` : ""} value="${esc(val ?? F[k] ?? "")}" placeholder="${esc(ph)}"></div>`;
const seg = (k, a, b, val) => `<div class="seg" role="group"><button type="button" class="${val === a ? "on" : ""}" data-seg="${k}" data-v="${esc(a)}">${esc(a)}</button><button type="button" class="${val === b ? "on" : ""}" data-seg="${k}" data-v="${esc(b)}">${esc(b)}</button></div>`;
const sugg = (k, items) => (items || []).length ? `<div class="sugg"><span class="sub">પહેલાં લખેલી:</span>${items.slice(-8).reverse().map(x => `<button type="button" data-sg="${k}" data-v="${esc(x)}">${esc(x)}</button>`).join("")}</div>` : "";

function drawStep() {
  const v = $("#view"); if (!v) return;
  const title = EDIT ? "પ્રવેશમાં ફેરફાર" : "નવો પ્રવેશ";
  const sub = `${esc(F.name || branchName(S.branchId) + " શાખા")} • પગલું ${STEP + 1} / 4`;
  v.innerHTML = `
    <div class="row-between"><div class="grow"><h1 class="page-title">${title}</h1><span class="sub">${sub}</span></div>
      ${EDIT ? "" : `<span class="pill" id="dr">Draft સચવાય છે</span>`}</div>
    <div class="steps">${STEPS.map((t, i) => `<div class="${i < STEP ? "done" : i === STEP ? "on" : ""}"><i></i>${t}</div>`).join("")}</div>
    <form id="af" class="stack" novalidate>${[step1, step2, step3, step4][STEP]()}</form>
    <div class="fbar">
      <button type="button" class="btn line" id="back">${STEP ? "પાછળ" : "રદ કરો"}</button>
      <button type="button" class="btn primary" id="next">${STEP < 3 ? "આગળ: " + STEPS[STEP + 1].slice(3) : `${ic("check", 18)} ${EDIT ? "ફેરફાર સાચવો" : "પ્રવેશ પાકો કરો"}`}</button>
    </div>
    ${!EDIT && STEP === 0 ? `<button type="button" class="link-btn" id="clr">ફોર્મ ખાલી કરીને નવેસરથી ભરો</button>` : ""}`;
  wire(v);
  window.scrollTo(0, 0);
}

function step1() {
  const stdB = BATCHES.filter(b => !F.std || b.std === F.std || (!b.std && b.course));
  return `
  ${EDIT ? "" : `<div class="card"><button type="button" class="switch ${F.legacy ? "on" : ""}" id="legacy" aria-pressed="${F.legacy}">
    <span class="grow" style="text-align:left"><b>જૂનું કાગળનું ફોર્મ ચડાવું છું</b><span class="sub">ચાલુ કરો તો ફોર્મ ક્રમાંક અને તારીખ જાતે લખી શકાય</span></span><i></i></button></div>`}
  <div class="card">
    <div class="grid2">
      ${F.legacy || EDIT ? fld("formNo", "ફોર્મ ક્રમાંક", { mode: "numeric", req: true }) : `<div class="field"><label>ફોર્મ ક્રમાંક</label><input value="આપમેળે: ${num(META[`form_${S.year}`]) + 1}" disabled></div>`}
      ${fld("formDate", "તારીખ", { type: "date" })}
    </div>
    <div class="photo-pick">
      <label class="photo-box" for="f_photo">${F.photo ? `<img src="${F.photo}" alt="વિદ્યાર્થીનો ફોટો">` : `${ic("cam", 26)}ફોટો પાડો<br>કે પસંદ કરો`}</label>
      <input id="f_photo" type="file" accept="image/*" class="sr">
      <p class="hint">પાસપોર્ટ સાઇઝ ફોટાનો મોબાઇલથી ફોટો પાડી લો. આપમેળે નાનો થઈને સચવાશે, અને વિદ્યાર્થી તથા વાલીની એપમાં પણ દેખાશે. પછીથી પણ ઉમેરી શકાય.${F.photo ? ` <button type="button" class="link-btn" id="rmph">ફોટો કાઢો</button>` : ""}</p>
    </div>
    ${fld("name", "વિદ્યાર્થીનું પૂરું નામ", { ph: "અટક, નામ, પિતાનું નામ", req: true })}
    <div class="field"><span class="lbl">કયા ધોરણમાં એડમિશન લેવાનું છે *</span><div class="chips" role="group">${STDS.map(s => `<button type="button" class="chip ${F.std === s ? "on" : ""}" data-std="${s}">${s}</button>`).join("")}</div></div>
    <div class="field"><span class="lbl">બેચ</span>${stdB.length ? `<div class="chips" role="group">${stdB.map(b => `<button type="button" class="chip ${F.batchId === b.id ? "on" : ""}" data-bt="${b.id}">${esc(b.name)}${b.start ? ` (${esc(b.start)}${b.end ? "-" + esc(b.end) : ""})` : ""}</button>`).join("")}</div>` : `<p class="hint">${F.std ? "આ ધોરણની બેચ નથી. પછીથી પણ પસંદ કરી શકાય." : "પહેલાં ધોરણ પસંદ કરો."}</p>`}</div>
    <div class="field"><span class="lbl">કોર્સ (હોય તો)</span><div class="chips" role="group">${COURSES.map(c => `<button type="button" class="chip ${(F.courses || []).includes(c) ? "on" : ""}" data-crs="${c}">${c}</button>`).join("")}</div></div>
    <div class="grid2">${fld("caste", "જ્ઞાતિ", { ph: "જાતે લખો" })}${fld("dob", "જન્મ તારીખ", { type: "date" })}</div>
    ${sugg("caste", META.caste)}
  </div>`;
}
function step2() {
  return `
  <div class="card"><h2>શાળા</h2>
    ${fld("school", "શાળાનું નામ")}${sugg("school", META.school)}
    <div class="grid2">${fld("schoolFrom", "શાળાનો સમય: થી", { type: "time" })}${fld("schoolTo", "વાગ્યા સુધી", { type: "time" })}</div>
  </div>
  <div class="card"><h2>સરનામું</h2>
    ${fld("address", "રહેઠાણનું પૂરું સરનામું")}${fld("village", "ગામ / સોસાયટી")}${sugg("village", META.village)}
    <div class="grid2">${fld("taluka", "તાલુકો")}${fld("district", "જિલ્લો")}</div>
  </div>
  <div class="card"><h2>પહેલા ટ્યુશન ક્લાસીસમાં જતા હતા?</h2>
    ${seg("prevTuition", "હા", "ના", F.prevTuition)}
    ${F.prevTuition === "હા" ? `<div class="grid2">${fld("prevWhere", "કયા ક્લાસીસમાં")}${fld("prevStd", "કયા ધોરણ માટે")}</div>` : ""}
  </div>`;
}
function step3() {
  return `
  <div class="card"><h2>મોબાઇલ નંબર</h2>
    ${fld("mobParent", "વાલીનો મોબાઇલ નંબર", { type: "tel", mode: "numeric", req: true })}
    <div id="pinfo">${F.parentHit ? parentNote(F.parentHit) : ""}</div>
    ${fld("mobStudent", "વિદ્યાર્થીનો મોબાઇલ નંબર (હોય તો)", { type: "tel", mode: "numeric" })}
    <div class="field"><span class="lbl">WhatsApp મોબાઇલ નંબર</span>${seg("waSame", "વાલીનો જ", "બીજો નંબર", F.waSame ? "વાલીનો જ" : "બીજો નંબર")}</div>
    ${F.waSame ? "" : fld("mobWa", "WhatsApp નંબર", { type: "tel", mode: "numeric" })}
  </div>
  <div class="card"><h2>પરિવારની માહિતી</h2>
    ${fld("mother", "વિદ્યાર્થીના માતાનું નામ")}
    <div class="grid2">${fld("fatherEdu", "પિતાનો અભ્યાસ")}${fld("fatherJob", "પિતાનો વ્યવસાય")}</div>
    <div class="grid2">${fld("motherEdu", "માતાનો અભ્યાસ")}${fld("motherJob", "માતાનો વ્યવસાય")}</div>
  </div>
  <div class="card"><h2>ભાઈ / બહેન</h2>
    ${(F.siblings || []).map((s, i) => `<div class="sib">
      <div class="row-between"><b>${i + 1}.</b><button type="button" class="link-btn" data-rmsib="${i}">કાઢો</button></div>
      <div class="field"><label for="sb_n${i}">નામ</label><input id="sb_n${i}" data-sib="${i}" data-sk="n" value="${esc(s.n || "")}"></div>
      <div class="row-between"><span class="sub">ભણે છે?</span><div class="seg" style="width:150px">${["હા", "ના"].map(x => `<button type="button" class="${s.st === x ? "on" : ""}" data-sibst="${i}" data-v="${x}">${x}</button>`).join("")}</div></div>
      ${s.st === "ના" ? "" : `<div class="grid2"><div class="field"><label for="sb_s${i}">કેટલામાં ધોરણમાં?</label><input id="sb_s${i}" data-sib="${i}" data-sk="s" value="${esc(s.s || "")}"></div>
      <div class="field"><label for="sb_c${i}">કઈ શાળામાં?</label><input id="sb_c${i}" data-sib="${i}" data-sk="c" value="${esc(s.c || "")}"></div></div>`}
    </div>`).join("")}
    ${(F.siblings || []).length < 3 ? `<button type="button" class="btn line" id="addsib">${ic("plus", 18)} ભાઈ/બહેન ઉમેરો (3 સુધી)</button>` : ""}
  </div>`;
}
const parentNote = p => `<div class="note info">${ic("link", 20)}<div><b>આ નંબર પહેલેથી છે</b><br>${esc((p.childNames || []).join(", ") || p.name)} ના વાલી <b>${esc(p.loginId)}</b>. આ વિદ્યાર્થી પણ એ જ વાલી સાથે જોડાશે, એટલે વાલી એક જ લોગિનથી બધાં બાળકો જોઈ શકશે.</div></div>`;

function step4() {
  const f = F.fee || (F.fee = {});
  // ધોરણ પ્રમાણે છેલ્લી વાર વપરાયેલી ફી પહેલેથી
  const def = (META.fees || {})[F.std] || {};
  if (!EDIT && f.adm === "" && f.tui === "" && (def.adm || def.tui)) { f.adm = def.adm || ""; f.tui = def.tui || ""; }
  const { total, pay } = feeCalc(f);
  const fr = (k, label, op) => `<div class="fr"><label for="fe_${k}">${label}</label><em>${op}</em><input id="fe_${k}" data-fee="${k}" inputmode="numeric" value="${esc(f[k] ?? "")}" placeholder="₹"></div>`;
  return `
  <div class="card"><h2>ફી (Office Use)</h2>
    <div class="feet">
      ${fr("adm", "પ્રવેશ ફી / સ્ટેશનરી ખર્ચ", "")}
      ${fr("tui", "અભ્યાસ ફી", "+")}
      <div class="fr"><span>ટોટલ ફી</span><em>=</em><output id="ftot">${money(total)}</output></div>
      ${fr("sch", "સ્કોલરશિપ", "−")}
      <div class="fr tot"><span><b>ચૂકવવાની થતી ટોટલ ફી</b></span><em>=</em><b id="fpay">${money(pay)}</b></div>
    </div>
    <div class="field"><span class="lbl">ફી ભરવાની રીત</span>${seg("plan", "વાર્ષિક", "છ-માસિક", f.plan || "વાર્ષિક")}</div>
    ${fld("note", "Note (હોય તો)")}
    ${def.adm || def.tui ? `<p class="hint">ધો. ${esc(F.std)} ની છેલ્લી વપરાયેલી ફી પહેલેથી ભરી છે; જરૂર પડે તો બદલો.</p>` : ""}
    ${EDIT && num(f.paid) ? `<p class="hint">અત્યાર સુધી ભરેલી: ${money(f.paid)}</p>` : ""}
  </div>
  <div class="card"><div class="row-between"><h2>નિયમો (${RULES.length})</h2><button type="button" class="link-btn" id="allr">બધા વાંચો</button></div>
    <ol class="rules" id="rl">${RULES.map(r => `<li>${esc(r)}</li>`).join("")}</ol>
    <button type="button" class="agree ${F.rules ? "on" : ""}" id="agree" aria-pressed="${!!F.rules}">
      <span class="bx">${F.rules ? ic("check", 18) : ""}</span>
      <span>ઉપરોક્ત તમામ નિયમો વાલી અને વિદ્યાર્થીએ વાંચ્યા છે તથા સંપૂર્ણપણે મંજૂર છે. નિયમોમાં જે કંઈ ફેરફાર થાય તે બંધનકર્તા રહેશે.</span></button>
    <p class="hint">ફોર્મ સ્વીકારનાર: ${esc(F.acceptedByName || S.profile?.name || "")}</p>
  </div>`;
}

function wire(v) {
  const form = $("#af", v);
  form.addEventListener("input", e => {
    const t = e.target;
    if (t.dataset.k) F[t.dataset.k] = t.value;
    if (t.dataset.sib) F.siblings[+t.dataset.sib][t.dataset.sk] = t.value;
    if (t.dataset.fee) {
      F.fee[t.dataset.fee] = t.value;
      const { total, pay } = feeCalc(F.fee);
      $("#ftot").textContent = money(total); $("#fpay").textContent = money(pay);
    }
    saveDraft();
  });
  const re = () => { saveDraft(); drawStep(); };
  $("#legacy", v)?.addEventListener("click", () => { F.legacy = !F.legacy; if (!F.legacy) F.formNo = ""; re(); });
  $$("[data-std]", v).forEach(b => b.onclick = () => { if (F.std !== b.dataset.std) { F.std = b.dataset.std; F.batchId = ""; F.batchName = ""; } re(); });
  $$("[data-bt]", v).forEach(b => b.onclick = () => { const x = BATCHES.find(y => y.id === b.dataset.bt); const same = F.batchId === x.id; F.batchId = same ? "" : x.id; F.batchName = same ? "" : x.name; re(); });
  $$("[data-crs]", v).forEach(b => b.onclick = () => { const c = b.dataset.crs, a = F.courses || (F.courses = []); a.includes(c) ? a.splice(a.indexOf(c), 1) : a.push(c); re(); });
  $$("[data-sg]", v).forEach(b => b.onclick = () => { F[b.dataset.sg] = b.dataset.v; re(); });
  $$("[data-seg]", v).forEach(b => b.onclick = () => {
    const k = b.dataset.seg, val = b.dataset.v;
    if (k === "waSame") F.waSame = val === "વાલીનો જ"; else if (k === "plan") F.fee.plan = val; else F[k] = val;
    re();
  });
  $("#f_photo", v)?.addEventListener("change", async e => {
    const file = e.target.files[0]; if (!file) return;
    try { F.photo = await shrink(file); re(); } catch { toast("ફોટો ખૂલ્યો નહીં. બીજો ફોટો પસંદ કરો.", true); }
  });
  $("#rmph", v)?.addEventListener("click", () => { F.photo = ""; re(); });
  $("#addsib", v)?.addEventListener("click", () => { F.siblings.push({ n: "", st: "હા", s: "", c: "" }); re(); });
  $$("[data-rmsib]", v).forEach(b => b.onclick = () => { F.siblings.splice(+b.dataset.rmsib, 1); re(); });
  $$("[data-sibst]", v).forEach(b => b.onclick = () => { F.siblings[+b.dataset.sibst].st = b.dataset.v; re(); });
  $("#allr", v)?.addEventListener("click", () => $("#rl").classList.add("open"));
  $("#agree", v)?.addEventListener("click", () => { F.rules = !F.rules; re(); });
  $("#clr", v)?.addEventListener("click", () => { if (confirm("ભરેલું બધું ભૂંસાઈ જશે. નવેસરથી ભરવું છે?")) { localStorage.removeItem(DK()); F = blank(); re(); } });
  // વાલીનો નંબર: પહેલેથી હોય તો ઓળખો
  const mp = $("#f_mobParent", v);
  if (mp) mp.addEventListener("change", () => findParent(mob10(mp.value)));
  $("#back", v).onclick = () => {
    if (STEP) { STEP--; drawStep(); return; }
    location.hash = EDIT ? `#/student/${encodeURIComponent(EDIT)}` : "#/students";
  };
  $("#next", v).onclick = e => {
    const err = check(STEP);
    if (err) return toast(err, true);
    if (STEP < 3) { STEP++; drawStep(); return; }
    busy(e.currentTarget, () => saveAdmission().catch(e2 => fail(e2, "પ્રવેશ સચવાયો નહીં. નેટ ચકાસીને ફરી પ્રયત્ન કરો.")));
  };
}

function check(step) {
  if (step === 0) {
    if ((F.legacy || EDIT) && !num(F.formNo)) return "ફોર્મ ક્રમાંક લખો.";
    if (!String(F.name || "").trim()) return "વિદ્યાર્થીનું નામ લખો.";
    if (!F.std) return "ધોરણ પસંદ કરો.";
  }
  if (step === 2) {
    if (mob10(F.mobParent).length !== 10) return "વાલીનો 10 આંકડાનો મોબાઇલ નંબર લખો.";
    if (F.mobStudent && mob10(F.mobStudent).length !== 10) return "વિદ્યાર્થીનો મોબાઇલ નંબર 10 આંકડાનો લખો.";
    if (!F.waSame && mob10(F.mobWa).length !== 10) return "WhatsApp નંબર 10 આંકડાનો લખો.";
  }
  if (step === 3) {
    if (!F.rules) return "નિયમો મંજૂર છે તેની ✓ કરો.";
  }
  return "";
}

async function findParent(m) {
  F.parentHit = null;
  const box = $("#pinfo");
  if (m.length === 10 && !EDIT) {
    try {
      const q = await getDocs(query(collection(db, "users"), where("branchId", "==", S.branchId), where("role", "==", "parent"), where("mobile", "==", m)));
      const p = q.docs[0]?.data();
      if (p) F.parentHit = { loginId: p.loginId, name: p.name, childNames: p.childNames || [] };
    } catch (e) { console.warn(e); }
  }
  saveDraft();
  if (box) box.innerHTML = F.parentHit ? parentNote(F.parentHit) : "";
}

// ફોટો નાનો કરો: 240x300, JPEG — લગભગ 15-25 KB
function shrink(file) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const W = 240, H = 300, c = document.createElement("canvas"); c.width = W; c.height = H;
      const r = Math.max(W / img.width, H / img.height), w = img.width * r, h = img.height * r;
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
      g.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = rej; img.src = url;
  });
}

// ---------- સાચવો ----------
async function saveAdmission() {
  const mobParent = mob10(F.mobParent);
  const { total, pay } = feeCalc(F.fee);
  const fee = { adm: num(F.fee.adm), tui: num(F.fee.tui), total, sch: num(F.fee.sch), pay, plan: F.fee.plan || "વાર્ષિક", paid: num(F.fee.paid) };
  const data = {
    branchId: S.branchId, yearId: S.year, legacy: !!F.legacy,
    formDate: F.formDate || ymd(), name: F.name.trim(), std: F.std, batchId: F.batchId || "", batchName: F.batchName || "",
    courses: F.courses || [], caste: (F.caste || "").trim(), dob: F.dob || "",
    school: (F.school || "").trim(), schoolFrom: F.schoolFrom || "", schoolTo: F.schoolTo || "",
    address: F.address || "", village: (F.village || "").trim(), taluka: F.taluka || "", district: F.district || "",
    prevTuition: F.prevTuition || "", prevWhere: F.prevTuition === "હા" ? F.prevWhere || "" : "", prevStd: F.prevTuition === "હા" ? F.prevStd || "" : "",
    mobParent, mobStudent: mob10(F.mobStudent), waSame: !!F.waSame, mobWa: F.waSame ? mobParent : mob10(F.mobWa),
    mother: F.mother || "", fatherEdu: F.fatherEdu || "", fatherJob: F.fatherJob || "", motherEdu: F.motherEdu || "", motherJob: F.motherJob || "",
    siblings: (F.siblings || []).filter(s => String(s.n || "").trim()),
    fee, note: F.note || "", rules: true, hasPhoto: !!F.photo, updatedAt: serverTimestamp()
  };
  const metaUpd = {
    caste: arrayUnion(...[data.caste].filter(Boolean)), school: arrayUnion(...[data.school].filter(Boolean)),
    village: arrayUnion(...[data.village].filter(Boolean)),
    taluka: data.taluka, district: data.district, fees: { [data.std]: { adm: fee.adm, tui: fee.tui } }
  };
  if (!data.caste) delete metaUpd.caste; if (!data.school) delete metaUpd.school; if (!data.village) delete metaUpd.village;

  if (EDIT) {
    const id = EDIT;
    data.formNo = num(F.formNo);
    const b = writeBatch(db);
    b.update(doc(db, "students", id), data);
    b.set(doc(db, "photos", id), { branchId: S.branchId, parentId: F.parentId || "", data: F.photo || "" });
    b.set(rosterRef(), { branchId: S.branchId, yearId: S.year, list: { [id]: rosterEntry({ ...F, ...data }) } }, { merge: true });
    b.update(doc(db, "users", id), { name: data.name, mobile: data.mobStudent || mobParent });
    b.set(metaRef(), metaUpd, { merge: true });
    await b.commit();
    audit("student.edit", id, data.name);
    toast("ફેરફાર સચવાયો.");
    location.hash = `#/student/${encodeURIComponent(id)}`;
    return;
  }

  // 1) ફોર્મ ક્રમાંક: આપમેળે અથવા જૂના ફોર્મનો
  const fk = `form_${S.year}`;
  data.formNo = await runTransaction(db, async tx => {
    const ms = await tx.get(metaRef());
    const last = num(ms.exists() ? ms.data()[fk] : 0);
    const n = F.legacy ? num(F.formNo) : last + 1;
    tx.set(metaRef(), { [fk]: Math.max(last, n) }, { merge: true });
    return n;
  });
  // 2) વાલી: પહેલેથી છે કે નવો?
  if (!F.parentHit) await findParent(mobParent);
  let parent = F.parentHit, parentCreds = null;
  // 3) વિદ્યાર્થીનું લોગિન
  const st = await createLogin({ role: "student", name: data.name, mobile: data.mobStudent || mobParent, branchId: S.branchId, extra: { std: data.std } });
  const id = st.loginId;
  if (!parent) {
    parentCreds = await createLogin({
      role: "parent", name: `${data.name} ના વાલી`, mobile: mobParent, branchId: S.branchId,
      extra: { childIds: [id], childNames: [data.name] }
    });
    parent = { loginId: parentCreds.loginId, name: parentCreds.name, childNames: [data.name], isNew: true };
  } else {
    await updateDoc(doc(db, "users", parent.loginId), { childIds: arrayUnion(id), childNames: arrayUnion(data.name) });
  }
  // 4) વિદ્યાર્થીની ફાઇલ, ફોટો, યાદી, સૂચનો — એકસાથે
  const full = {
    ...data, loginId: id, parentId: parent.loginId, status: "active",
    acceptedBy: S.me.loginId, acceptedByName: S.profile?.name || "", createdAt: serverTimestamp()
  };
  const b = writeBatch(db);
  b.set(doc(db, "students", id), full);
  if (F.photo) b.set(doc(db, "photos", id), { branchId: S.branchId, parentId: parent.loginId, data: F.photo });
  b.set(rosterRef(), { branchId: S.branchId, yearId: S.year, list: { [id]: rosterEntry(full) } }, { merge: true });
  b.update(doc(db, "users", id), { parentId: parent.loginId, studentId: id });
  b.set(metaRef(), metaUpd, { merge: true });
  await b.commit();
  audit("student.admit", id, `${data.name} • ફોર્મ ${data.formNo}`);
  localStorage.removeItem(DK());
  showDone(full, st, parent, parentCreds);
}

function showDone(s, st, parent, pc) {
  buzz("done"); say(`${String(s.name).split(" ")[1] || s.name} નો પ્રવેશ પાકો થયો. અભિનંદન!`, [523, 659, 784, 1047]);
  const v = $("#view");
  const msg = [
    `${ACADEMY.name}`, `નમસ્તે, ${s.name} નો પ્રવેશ ધો. ${s.std} માં થયો છે. (ફોર્મ ક્રમાંક ${s.formNo})`, `એપ: ${appUrl()}`, ``,
    `વિદ્યાર્થી ID: ${st.loginId}`, `કામચલાઉ પાસવર્ડ: ${st.pwd}`,
    ...(pc ? [``, `વાલી ID: ${pc.loginId}`, `કામચલાઉ પાસવર્ડ: ${pc.pwd}`] : [``, `વાલી ID: ${parent.loginId} (પહેલેથી છે, એ જ પાસવર્ડ)`]),
    ``, `પહેલા લોગિન પર તમારો પોતાનો પાસવર્ડ રાખજો.`
  ].join("\n");
  v.innerHTML = `
    <div class="card"><div class="okhead"><span class="tick">${ic("check", 34)}</span><h1>${esc(s.name)}</h1>
      <span class="sub">પ્રવેશ થયો • ${cls(s.std, s.batchName)} • ફોર્મ ${esc(s.formNo)} • ${fmtD(s.formDate)}</span></div></div>
    <div class="card"><h2>લોગિન માહિતી</h2>
      <div class="idcard"><div class="row-between"><span>વિદ્યાર્થી</span><b>${esc(st.loginId)}</b></div><div class="row-between"><span class="sub">કામચલાઉ પાસવર્ડ</span><b>${esc(st.pwd)}</b></div></div>
      ${pc ? `<div class="idcard"><div class="row-between"><span>વાલી</span><b>${esc(pc.loginId)}</b></div><div class="row-between"><span class="sub">કામચલાઉ પાસવર્ડ</span><b>${esc(pc.pwd)}</b></div></div>`
           : `<div class="idcard"><div class="row-between"><span>વાલી (પહેલેથી છે)</span><b>${esc(parent.loginId)}</b></div><span class="sub">વાલીના એ જ લોગિનમાં હવે બધાં બાળકો દેખાશે. નવો પાસવર્ડ નહીં.</span></div>`}
      <p class="hint">આ પાસવર્ડ ફરી દેખાશે નહીં. અત્યારે જ WhatsApp પર મોકલો. પહેલા લોગિન પર પોતાનો પાસવર્ડ રાખવો ફરજિયાત.</p>
      <a class="btn wa big" target="_blank" rel="noopener" href="${waLink(s.mobWa || s.mobParent, msg)}">${ic("wa", 20)} વાલીને WhatsApp પર મોકલો</a>
      <button type="button" class="btn line big" id="cpy">કોપી કરો</button>
    </div>
    <div class="grid2"><button type="button" class="btn line" id="pdf">${ic("print", 18)} પ્રવેશ ફોર્મ PDF</button>
      <a class="btn primary" href="#/student/${encodeURIComponent(st.loginId)}">વિદ્યાર્થીની ફાઇલ</a></div>
    <a class="btn line big" href="#/admit" id="again">${ic("plus", 18)} બીજો પ્રવેશ</a>`;
  $("#cpy").onclick = () => navigator.clipboard?.writeText(msg).then(() => toast("કોપી થયું."), () => toast("કોપી ન થયું.", true));
  $("#pdf").onclick = () => printForm({ ...s, loginId: st.loginId, parentId: parent.loginId }, F.photo);
  $("#again").onclick = e => { if (location.hash === "#/admit") { e.preventDefault(); route(); } };
  window.scrollTo(0, 0);
}

// ================= વિદ્યાર્થીની ફાઇલ =================
page("student", async v => {
  const id = hashArg();
  const [ss, ps, us] = await Promise.all([getDoc(doc(db, "students", id)), getDoc(doc(db, "photos", id)), getDoc(doc(db, "users", id))]);
  if (!ss.exists()) { v.innerHTML = `<div class="empty">આ વિદ્યાર્થી મળ્યો નહીં.</div><a class="btn line" href="#/students">યાદીમાં પાછા</a>`; return; }
  const s = ss.data(), photo = ps.exists() ? ps.data().data : "", u = us.exists() ? us.data() : null;
  const tab = sessionStorage.getItem("gv_ftab") || "info";
  const off = s.status === "cancelled";
  const kv = rows => `<div class="kv">${rows.filter(r => r[1]).map(([a, b]) => `<span>${a}</span><b>${b}</b>`).join("")}</div>`;
  v.innerHTML = `
    <div class="row-between"><a class="btn line" href="#/students">${ic("back", 18)} યાદી</a>
      ${isAdmin() ? `<a class="btn line" href="#/admit/${encodeURIComponent(id)}">${ic("edit", 18)} ફેરફાર</a>` : ""}</div>
    <div class="card">
      <div class="prof"><span class="ph lg">${photo ? `<img src="${photo}" alt="${esc(s.name)} નો ફોટો">` : initial(s.name)}</span>
        <div class="grow"><h1>${esc(s.name)}</h1><span class="sub">${esc(id)} • ${cls(s.std, s.batchName)} • ${esc(branchName(s.branchId))}</span>
          <span style="margin-top:4px">${off ? `<span class="pill">પ્રવેશ રદ</span>` : feeTag(s.fee?.pay, s.fee?.paid)}</span></div></div>
      <div class="acts">
        <a href="tel:${esc(s.mobParent)}"><span>${ic("phone")}</span>વાલીને ફોન</a>
        <a href="${waLink(s.mobWa || s.mobParent, "")}" target="_blank" rel="noopener"><span>${ic("wa")}</span>WhatsApp</a>
        <a href="#" id="pdf"><span>${ic("print")}</span>ફોર્મ PDF</a>
        <a href="#/viewas/${encodeURIComponent(id)}"><span>${ic("eye")}</span>વિદ્યાર્થી તરીકે જુઓ</a>
      </div>
    </div>
    <div class="tabs" role="tablist">${[["info", "માહિતી"], ["fee", "ફી"], ["att", "હાજરી"], ["marks", "ગુણ"]].map(([k, l]) => `<button type="button" role="tab" class="tab ${k === tab ? "on" : ""}" data-ft="${k}" aria-selected="${k === tab}">${l}</button>`).join("")}</div>
    ${tab === "info" ? `
    <div class="card"><h2>વિદ્યાર્થી</h2>${kv([
      ["ફોર્મ ક્રમાંક", `${esc(s.formNo)} • ${fmtD(s.formDate)}${s.legacy ? " (જૂનું ફોર્મ)" : ""}`],
      ["જન્મ તારીખ", fmtD(s.dob)], ["જ્ઞાતિ", esc(s.caste)], ["કોર્સ", esc((s.courses || []).join(", "))],
      ["શાળા", esc(s.school) + (s.schoolFrom ? ` (${esc(s.schoolFrom)}–${esc(s.schoolTo)})` : "")],
      ["સરનામું", esc([s.address, s.village, s.taluka, s.district].filter(Boolean).join(", "))],
      ["પહેલાં ટ્યુશન", s.prevTuition === "હા" ? `હા • ${esc(s.prevWhere)} ${s.prevStd ? "(ધો. " + esc(s.prevStd) + ")" : ""}` : esc(s.prevTuition)]
    ])}</div>
    <div class="card"><h2>પરિવાર</h2>${kv([
      ["વાલી લોગિન", `${esc(s.parentId)} • ${esc(s.mobParent)}`], ["વિદ્યાર્થીનો મોબાઇલ", esc(s.mobStudent)],
      ["WhatsApp", s.waSame ? "" : esc(s.mobWa)], ["માતા", esc(s.mother)],
      ["પિતા", esc([s.fatherEdu, s.fatherJob].filter(Boolean).join(" • "))], ["માતા (અભ્યાસ/વ્યવસાય)", esc([s.motherEdu, s.motherJob].filter(Boolean).join(" • "))],
      ["ભાઈ/બહેન", (s.siblings || []).map(x => esc(x.n) + (x.st === "હા" && x.s ? ` (ધો. ${esc(x.s)}${x.c ? ", " + esc(x.c) : ""})` : "")).join("<br>")]
    ])}</div>
    ${s.note ? `<div class="card"><h2>Note</h2><p style="margin:0">${esc(s.note)}</p></div>` : ""}
    ${isAdmin() ? `<div class="card"><h2>લોગિન</h2>
      <p class="sub">વિદ્યાર્થી ID: <b>${esc(id)}</b>${u?.active === false ? " • બંધ" : ""} • વાલી ID: <b>${esc(s.parentId)}</b></p>
      <div class="grid2"><button type="button" class="btn line" id="rp">${ic("key", 18)} પાસવર્ડ રીસેટ</button>
      <button type="button" class="btn line ${off ? "" : "danger"}" id="cx">${off ? "પ્રવેશ ફરી ચાલુ" : "પ્રવેશ રદ / બંધ"}</button></div></div>` : ""}`
    : tab === "fee" ? `<div class="card"><h2>ફી</h2>${kv([
      ["પ્રવેશ ફી / સ્ટેશનરી", money(s.fee?.adm)], ["અભ્યાસ ફી", money(s.fee?.tui)], ["ટોટલ ફી", money(s.fee?.total)],
      ["સ્કોલરશિપ", money(s.fee?.sch)], ["ચૂકવવાની થતી", `<span class="big-num">${money(s.fee?.pay)}</span>`], ["રીત", esc(s.fee?.plan)],
      ["ભરેલી", money(s.fee?.paid)], ["બાકી", money(num(s.fee?.pay) - num(s.fee?.paid))]
    ])}<p class="hint">ફી લેવી અને પહોંચ આગળના ભાગ (ભાગ 5) માં ચાલુ થશે.</p></div>`
    : `<div class="empty">${tab === "att" ? "હાજરી ભાગ 6 માં ચાલુ થશે." : "ગુણ આગળના ભાગમાં ચાલુ થશે."}</div>`}`;
  $$("[data-ft]", v).forEach(b => b.onclick = () => { sessionStorage.setItem("gv_ftab", b.dataset.ft); route(); });
  $("#pdf").onclick = e => { e.preventDefault(); printForm({ ...s, loginId: id }, photo); };
  $("#rp", v)?.addEventListener("click", () => {
    const d = modal("કોનો પાસવર્ડ રીસેટ કરવો છે?", `<div class="stack">
      <button type="button" class="btn line big" data-rs="${esc(id)}">વિદ્યાર્થી (${esc(id)})</button>
      <button type="button" class="btn line big" data-rs="${esc(s.parentId)}">વાલી (${esc(s.parentId)})</button>
      <p class="hint">જૂનો પાસવર્ડ બંધ થશે અને નવો કામચલાઉ પાસવર્ડ મળશે.</p></div>`);
    $$("[data-rs]", d).forEach(b => b.onclick = () => busy(b, async () => {
      try {
        const x = await getDoc(doc(db, "users", b.dataset.rs));
        if (!x.exists()) return toast("લોગિન મળ્યો નહીં.", true);
        const res = await resetLogin(x.data()); closeModal(); showCreds(res, "નવો પાસવર્ડ");
      } catch (e2) { fail(e2); }
    }));
  });
  $("#cx", v)?.addEventListener("click", e => {
    const on = off;
    if (!confirm(on ? "પ્રવેશ ફરી ચાલુ કરવો છે?" : `${s.name} નો પ્રવેશ રદ કરવો છે? વિદ્યાર્થીનું લોગિન બંધ થશે. (માહિતી ભૂંસાશે નહીં)`)) return;
    busy(e.currentTarget, async () => {
      try {
        const st = on ? "active" : "cancelled";
        const b = writeBatch(db);
        b.update(doc(db, "students", id), { status: st, updatedAt: serverTimestamp() });
        b.set(rosterRef(), { list: { [id]: { x: st } } }, { merge: true });
        b.update(doc(db, "users", id), { active: on });
        if (u?.uid) b.update(doc(db, "authmap", u.uid), { active: on });
        await b.commit(); audit(on ? "student.restore" : "student.cancel", id, s.name);
        toast(on ? "પ્રવેશ ફરી ચાલુ થયો." : "પ્રવેશ રદ થયો."); route();
      } catch (e2) { fail(e2); }
    });
  });
});

// ================= વિદ્યાર્થીનું હોમ (વિદ્યાર્થી પોતે અને "વિદ્યાર્થી તરીકે જુઓ") =================
export function studentHomeHtml(s, photo = "") {
  const due = num(s.fee?.pay) - num(s.fee?.paid);
  return `
    <div class="card hello"><div class="prof"><span class="ph lg">${photo ? `<img src="${photo}" alt="${esc(s.name)} નો ફોટો">` : initial(s.name)}</span>
      <div class="grow"><h1>નમસ્તે, ${esc(String(s.name || "").split(" ")[1] || s.name)} 👋</h1>
      <p>${cls(s.std, s.batchName)} • ${esc(branchName(s.branchId))}</p></div></div></div>
    <div class="grid2">
      <a class="tile soon">${ic("batch", 28)}<span>સમયપત્રક</span></a>
      <a class="tile soon">${ic("check", 28)}<span>મારી હાજરી</span></a>
      <a class="tile soon">${ic("edit", 28)}<span>ટેસ્ટ, ગુણ</span></a>
      <a class="tile soon">${ic("info", 28)}<span>સૂચનાઓ</span></a>
    </div>
    ${num(s.fee?.pay) ? `<span class="fee-small">${due > 0 ? `ફી: ${money(due)} બાકી • વાલીને યાદ કરાવો` : "ફી: ભરાઈ ગઈ ✓"}</span>` : ""}
    <p class="muted center">હાજરી, ટેસ્ટ અને સૂચનાઓ આગળના ભાગમાં ઉમેરાશે.</p>`;
}

page("viewas", async v => {
  const id = hashArg();
  const [ss, ps] = await Promise.all([getDoc(doc(db, "students", id)), getDoc(doc(db, "photos", id)).catch(() => null)]);
  if (!ss.exists()) { v.innerHTML = `<div class="empty">વિદ્યાર્થી મળ્યો નહીં.</div>`; return; }
  const s = ss.data(), photo = ps?.exists() ? ps.data().data : "";
  document.documentElement.style.setProperty("--role", "#C2410C");
  $("#app").innerHTML = `
    <div class="viewas" role="status">${ic("eye", 20)}<b>તમે ${esc(id)} ની એપ જુઓ છો (ફક્ત જોવા માટે)</b><button type="button" id="vx">બંધ કરો</button></div>
    <div class="main">
      <header class="top"><img src="logo.png" alt="ગાંડિવ એકેડેમીનો લોગો" class="top-logo"><div class="top-who"><b>${esc(s.name)}</b><span>${cls(s.std, s.batchName)} • ${esc(branchName(s.branchId))}</span></div><span class="role-chip">વિદ્યાર્થી</span></header>
      <main class="view viewonly" inert>${studentHomeHtml(s, photo)}
        <div class="note old">${ic("info", 20)}<div>આ સ્ક્રીનમાં કોઈ બટન કામ નહીં કરે, બદલાવ સચવાશે નહીં. વિદ્યાર્થીને શું દેખાય છે તે ચકાસવા માટે જ.</div></div></main>
    </div>`;
  $("#vx").onclick = () => { location.hash = `#/student/${encodeURIComponent(id)}`; renderShell(); };
  window.addEventListener("hashchange", function back() { window.removeEventListener("hashchange", back); if ($(".viewas")) renderShell(); });
});

// ================= પ્રવેશ ફોર્મ છાપો / PDF (કાગળના ફોર્મ જેવું) =================
export function printForm(s, photo) {
  const br = S.branches.find(b => b.id === s.branchId) || curBranch();
  const L = (label, val, w = "") => `<div class="pl ${w}"><span>${label} :</span><b>${esc(val ?? "")}</b></div>`;
  const sib = [0, 1, 2].map(i => s.siblings?.[i] || {});
  let el = $("#print"); if (!el) { el = document.createElement("div"); el.id = "print"; document.body.appendChild(el); }
  el.innerHTML = `
  <section class="pf">
    <div class="pf-head"><img src="logo.png" alt=""><div><h1>${esc(ACADEMY.name)}</h1><p>પ્રવેશ ફોર્મ • ${esc(ACADEMY.tagline)}</p></div>
      <div class="pf-no">ફોર્મ ક્રમાંક : <b>${esc(s.formNo)}</b><br>તારીખ : <b>${fmtD(s.formDate)}</b><br>ID : <b>${esc(s.loginId || "")}</b></div></div>
    <div class="pf-top"><div class="pf-fields">
      ${L("વિદ્યાર્થીનું પૂરું નામ", s.name)}
      ${L("શાળાનું નામ", s.school)}
      ${L("શાળાનો સમય", s.schoolFrom ? `${s.schoolFrom} થી ${s.schoolTo} વાગ્યા સુધી` : "")}
      ${L("કયા ધોરણમાં એડમિશન લેવાનું છે", `ધો. ${s.std}${s.batchName ? " • બેચ " + s.batchName : ""}${(s.courses || []).length ? " • " + s.courses.join(", ") : ""}`)}
      <div class="pf-row">${L("જ્ઞાતિ", s.caste)}${L("જન્મ તારીખ", fmtD(s.dob))}</div>
      ${L("રહેઠાણનું પૂરું સરનામું", s.address)}
      <div class="pf-row">${L("ગામ/સોસાયટી", s.village)}${L("તાલુકો", s.taluka)}${L("જિલ્લો", s.district)}</div>
    </div><div class="pf-photo">${photo ? `<img src="${photo}" alt="">` : "ફોટો"}</div></div>
    <table class="pf-t"><tr><th>વાલીનો મોબાઇલ નંબર</th><td>${esc(s.mobParent)}</td></tr><tr><th>વિદ્યાર્થીનો મોબાઇલ નંબર</th><td>${esc(s.mobStudent)}</td></tr><tr><th>WhatsApp મોબાઇલ નંબર</th><td>${esc(s.mobWa || s.mobParent)}</td></tr></table>
    ${L("પહેલા ટ્યુશન ક્લાસીસમાં જતા હતા (હા/ના)", s.prevTuition === "હા" ? `હા • ${s.prevWhere || ""} માં ધોરણ ${s.prevStd || ""} ના અભ્યાસ માટે` : s.prevTuition)}
    <h3>પરિવારની માહિતી</h3>
    ${L("વિદ્યાર્થીના માતાનું નામ", s.mother)}
    <table class="pf-t"><tr><th>ક્રમ</th><th>વિદ્યાર્થીના ભાઈ/બહેનનું નામ</th><th>ભણે છે? હા/ના</th><th>કેટલામાં ધોરણમાં?</th><th>કઈ શાળામાં?</th></tr>
      ${sib.map((x, i) => `<tr><td>${i + 1}.</td><td>${esc(x.n || "")}</td><td>${esc(x.n ? x.st || "" : "")}</td><td>${esc(x.s || "")}</td><td>${esc(x.c || "")}</td></tr>`).join("")}</table>
    <div class="pf-row">${L("પિતાનો અભ્યાસ", s.fatherEdu)}${L("પિતાનો વ્યવસાય", s.fatherJob)}</div>
    <div class="pf-row">${L("માતાનો અભ્યાસ", s.motherEdu)}${L("માતાનો વ્યવસાય", s.motherJob)}</div>
    <div class="pf-row pf-sign"><span>વિદ્યાર્થીની સહી ____________</span><span>વાલીની સહી ____________</span></div>
    <p class="pf-foot">સરનામું: ${esc(ACADEMY.name)}, ${esc(br.address || "")} • ${esc(br.phone || ACADEMY.phone || "")}</p>
  </section>
  <section class="pf">
    <h2 class="pf-c">નિયમો</h2>
    <ol class="pf-rules">${RULES.map(r => `<li>${esc(r)}</li>`).join("")}</ol>
    <p>• નિયમોમાં જે કંઈ ફેરફાર થાય તે મને બંધનકર્તા રહેશે.<br>• ઉપરોક્ત તમામ નિયમો મેં વાંચ્યા છે તથા તે મને સંપૂર્ણપણે મંજૂર છે. ${s.rules ? "✓ (એપમાં મંજૂર)" : ""}</p>
    <p class="pf-r">આપનો વિશ્વાસું ____________</p>
    <h3>Office Use Only</h3>
    <div class="pf-office"><table class="pf-t">
      <tr><th>પ્રવેશ ફી/સ્ટેશનરી ખર્ચ</th><td></td><td>${money(s.fee?.adm)}</td></tr>
      <tr><th>અભ્યાસ ફી</th><td>+</td><td>${money(s.fee?.tui)}</td></tr>
      <tr><th>ટોટલ ફી</th><td>=</td><td>${money(s.fee?.total)}</td></tr>
      <tr><th>સ્કોલરશિપ</th><td>−</td><td>${money(s.fee?.sch)}</td></tr>
      <tr><th>ચુકવવાની થતી ટોટલ ફી.</th><td>=</td><td><b>${money(s.fee?.pay)}</b></td></tr></table>
      <div class="pf-note"><b>Note</b><br>${esc(s.fee?.plan || "")}${s.note ? "<br>" + esc(s.note) : ""}</div></div>
    <p class="pf-r">ફોર્મ સ્વીકારનારની સહી: ${esc(s.acceptedByName || "")} ____________</p>
  </section>`;
  const t = document.title; document.title = `પ્રવેશ_ફોર્મ_${s.formNo}_${s.name}`;
  setTimeout(() => { window.print(); document.title = t; }, 150);
}

// ================= વિદ્યાર્થી / વાલીનું હોમ (ભાગ 7 માં વધુ) =================
export async function familyHome(v) {
  if (S.me.role === "student") {
    const [ss, ps] = await Promise.all([getDoc(doc(db, "students", S.me.loginId)), getDoc(doc(db, "photos", S.me.loginId)).catch(() => null)]);
    v.innerHTML = ss.exists() ? studentHomeHtml(ss.data(), ps?.exists() ? ps.data().data : "") : `<div class="card hello"><h1>નમસ્તે, ${esc(S.profile?.name || "")}</h1></div>`;
    return;
  }
  // વાલી: બધાં બાળકો
  const ids = S.profile?.childIds || [];
  const kids = (await Promise.all(ids.map(async id => {
    const [x, p] = await Promise.all([getDoc(doc(db, "students", id)).catch(() => null), getDoc(doc(db, "photos", id)).catch(() => null)]);
    return x?.exists() ? { id, ...x.data(), photo: p?.exists() ? p.data().data : "" } : null;
  }))).filter(k => k && k.status !== "cancelled");
  v.innerHTML = `
    <div class="card hello"><h1>નમસ્તે 🙏</h1><p>${esc(branchName(S.branchId))} • ${kids.length > 1 ? `${kids.length} બાળકો` : "વાલી"}</p></div>
    ${kids.map(k => {
      const due = num(k.fee?.pay) - num(k.fee?.paid);
      return `<div class="card"><div class="prof"><span class="ph lg">${k.photo ? `<img src="${k.photo}" alt="${esc(k.name)} નો ફોટો">` : initial(k.name)}</span>
        <div class="grow"><b>${esc(k.name)}</b><span class="sub">${esc(k.id)} • ${cls(k.std, k.batchName)}</span></div></div>
        ${num(k.fee?.pay) ? `<span class="fee-small">${due > 0 ? `ફી: ${money(due)} બાકી` : "ફી: ભરાઈ ગઈ ✓"}</span>` : ""}</div>`;
    }).join("") || `<div class="empty">હજુ કોઈ બાળક જોડાયેલું નથી.</div>`}
    <p class="muted center">હાજરી, ગેરહાજરીની જાણ અને પરિણામ આગળના ભાગમાં ઉમેરાશે.</p>`;
}
