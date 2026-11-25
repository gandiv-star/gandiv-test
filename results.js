// =============================================================
//  ફેઝ 1B ભાગ 2: ટેસ્ટ • ગુણ • પરિણામ • પ્રગતિ • પરિણામપત્રક • ટોપર્સ પોસ્ટર
//  tests/{tid}            = { branchId, yearId, batchId, batchName, sub, date, max, name, type, term, by, byName, marks:{G101: 23 | "ab"}, n, avg, hi }
//  testIdx/{બેચ}_{વર્ષ}   = { list: { tid: { sub, name, date, max, type, term, n, avg, hi, top } } }   ← યાદી 1 વાંચનમાં
//  results/{G101}_{વર્ષ}  = { list: { tid: { sub, name, date, max, type, term, m, avg, hi, n, rank } }, terms: { key: { name, remark, att } } }
//     ← વિદ્યાર્થી/વાલી ફક્ત પોતાનું જ વાંચે. ક્રમ (rank) ફક્ત ટોપર (≥ 80%) ને જ સચવાય.
//  terms/{બેચ}_{key}      = { name, remarks:{G101:"..."} }   પરિણામપત્રકની ટિપ્પણી
//  branchMeta/{શાખા}.topPct = ટોપર મર્યાદા (મૂળ 80)
// =============================================================
import { db, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, writeBatch, serverTimestamp } from "./fb.js";
import { $, $$, esc, S, isAdmin, toast, fail, busy, audit, page, ic, fmtD, ymd, z2, waLink, modal, closeModal, buzz, chime } from "./core.js";
import { ACADEMY } from "./config.js";
import { SUBJECTS, teachesIn } from "./diary.js";
import { loadFonts, loadImg } from "./home.js";
import { studentMonth } from "./att.js";

const branchName = id => S.branches.find(b => b.id === id)?.name || "";
const TYPES = [["weekly", "સાપ્તાહિક ટેસ્ટ"], ["monthly", "માસિક ટેસ્ટ"], ["term", "સત્ર પરીક્ષા"], ["prelim", "પ્રિલિમ"]];
const TYPE = Object.fromEntries(TYPES);
const TERMS = ["પ્રથમ સત્ર પરીક્ષા", "દ્વિતીય સત્ર પરીક્ષા", "પ્રિલિમ 1", "પ્રિલિમ 2"];
const arg = i => decodeURIComponent(location.hash.split("/")[i] || "");
const canAtt = () => isAdmin() || ["teacher", "receptionist", "accountant"].includes(S.me?.role);
const idxRef = bid => doc(db, "testIdx", `${bid}_${S.year}`);
const resRef = sid => doc(db, "results", `${sid}_${S.year}`);
const rosterRef = () => doc(db, "rosters", `${S.branchId}_${S.year}`);
const metaRef = () => doc(db, "branchMeta", S.branchId);
export const termKey = name => { let h = 0; for (const c of String(name)) h = (h * 31 + c.codePointAt(0)) >>> 0; return "t" + h.toString(36); };
const pct = (m, max) => (typeof m === "number" && max ? Math.round(m * 1000 / max) / 10 : null);
const num = x => (Number.isInteger(x) ? String(x) : String(Math.round(x * 10) / 10));
const first = n => { const p = String(n || "").trim().split(/\s+/); return p.length > 1 ? p[1] : p[0]; };
const short = n => { const p = String(n || "").trim().split(/\s+/); return p.length >= 2 ? `${p[1]} ${p[0]}` : n; };

async function topPct() { try { const s = await getDoc(metaRef()); return Number(s.data()?.topPct) || 80; } catch { return 80; } }
async function rosterKids(bid) {
  const rs = await getDoc(rosterRef()).catch(() => null);
  return Object.entries((rs?.exists() && rs.data().list) || {}).map(([id, x]) => ({ id, ...x }))
    .filter(x => x.b === bid && x.x !== "cancelled").sort((a, b) => String(a.n).localeCompare(String(b.n), "gu"));
}
async function myBatches() {
  const q = await getDocs(query(collection(db, "batches"), where("branchId", "==", S.branchId), where("yearId", "==", S.year)));
  let list = q.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => b.active !== false).sort((a, b) => String(a.name).localeCompare(String(b.name), "gu"));
  if (S.me.role === "teacher") { const m = list.filter(b => teachesIn(b, S.me.loginId)); if (m.length) list = m; }
  return list;
}
// ગુણ પરથી આંકડા અને ક્રમ (સરખા ગુણ = સરખો ક્રમ)
function stats(t, top = 80) {
  const got = Object.entries(t.marks || {}).filter(([, m]) => typeof m === "number");
  const sorted = got.map(([id, m]) => ({ id, m })).sort((a, b) => b.m - a.m);
  const rank = {}; sorted.forEach((x, i) => { rank[x.id] = i && x.m === sorted[i - 1].m ? rank[sorted[i - 1].id] : i + 1; });
  const avg = got.length ? Math.round(got.reduce((a, [, m]) => a + m, 0) * 10 / got.length) / 10 : 0;
  const hi = sorted[0]?.m ?? 0;
  const tops = sorted.filter(x => pct(x.m, t.max) >= top);
  return { n: got.length, ab: Object.values(t.marks || {}).filter(m => m === "ab").length, avg, hi, sorted, rank, tops,
    low: sorted.filter(x => pct(x.m, t.max) < 35) };
}

// ================= ટેસ્ટની યાદી =================
page("tests", async v => {
  if (!canAtt()) { location.hash = "#/home"; return; }
  const batches = await myBatches();
  if (!batches.length) { v.innerHTML = `<div class="empty">હજુ કોઈ બેચ નથી.</div>`; return; }
  let bid = sessionStorage.getItem("gv_tbatch"); if (!batches.some(b => b.id === bid)) bid = batches[0].id;
  const draw = async () => {
    const b = batches.find(x => x.id === bid);
    const ix = await getDoc(idxRef(bid)).then(s => s.exists() ? s.data().list || {} : {}).catch(() => ({}));
    const list = Object.entries(ix).filter(([, t]) => t).map(([id, t]) => ({ id, ...t })).sort((a, c) => (c.date + c.id).localeCompare(a.date + a.id));
    const terms = [...new Set(list.filter(t => t.term).map(t => t.term))];
    v.innerHTML = `
      <h1 class="page-title" style="margin:0">ટેસ્ટ અને પરિણામ</h1>
      <div class="hscroll">${batches.map(x => `<button type="button" class="chip ${x.id === bid ? "on" : ""}" data-bt="${esc(x.id)}">${esc(x.name)}</button>`).join("")}</div>
      <button type="button" class="btn primary big" id="newt">${ic("plus", 18)} નવી ટેસ્ટ</button>
      ${terms.length ? `<div class="card" style="gap:0"><h2 style="margin-bottom:4px">${ic("receipt", 20)} પરિણામપત્રક</h2>
        ${terms.map(n => `<a class="srow" href="#/rcard/${encodeURIComponent(bid)}/${encodeURIComponent(n)}"><span class="grow"><b>${esc(n)}</b><span class="sub" style="display:block">${list.filter(t => t.term === n).map(t => esc(t.sub)).join(" • ")}</span></span>${ic("chev", 18)}</a>`).join("")}</div>` : ""}
      <div class="card" style="gap:0"><h2 style="margin-bottom:4px">${esc(b.name)} • ${list.length} ટેસ્ટ</h2>
        ${list.map(t => `<a class="srow" href="#/${t.n ? "result" : "marks"}/${encodeURIComponent(t.id)}">
          <span class="tm" style="min-width:48px">${+t.date.slice(8)}<small>${["જાન્યુ", "ફેબ્રુ", "માર્ચ", "એપ્રિ", "મે", "જૂન", "જુલા", "ઑગ", "સપ્ટે", "ઑક્ટો", "નવે", "ડિસે"][+t.date.slice(5, 7) - 1]}</small></span>
          <span class="grow"><b>${esc(t.sub)} • ${esc(t.name)}</b><span class="sub" style="display:block">${esc(t.term || TYPE[t.type] || "")} • કુલ ${t.max}${t.n ? ` • સરેરાશ ${num(t.avg)}` : ""}</span></span>
          ${t.n ? `${t.top ? `<span class="pill ok">🏆 ${t.top}</span>` : ""}` : `<span class="pill warn">ગુણ ભરો</span>`}</a>`).join("") || `<p class="muted" style="margin:8px 0">હજુ કોઈ ટેસ્ટ નથી.</p>`}</div>`;
    $$("[data-bt]", v).forEach(c => c.onclick = () => { bid = c.dataset.bt; sessionStorage.setItem("gv_tbatch", bid); draw(); });
    $("#newt").onclick = () => newTest(b);
  };
  await draw();
});

function newTest(b) {
  const today = ymd(), last = JSON.parse(localStorage.getItem("gv_lasttest") || "{}");
  let sub = (b.tt && Object.values(b.tt).flat().find(s => s.t === S.me.loginId)?.sub) || last.sub || "", type = last.type || "weekly", term = "";
  const d = modal("નવી ટેસ્ટ", `
    <form id="tf" class="form" novalidate>
      <p class="sub" style="margin:0">${esc(b.name)}</p>
      <div class="field"><span class="lbl">વિષય</span><div class="chips">${SUBJECTS.map(x => `<button type="button" class="chip ${sub === x ? "on" : ""}" data-sub="${esc(x)}">${esc(x)}</button>`).join("")}</div>
        <input id="tsx" placeholder="બીજો વિષય હોય તો લખો" style="margin-top:8px"></div>
      <div class="grid2"><div class="field"><label for="tdt">તારીખ</label><input id="tdt" type="date" value="${today}"></div>
        <div class="field"><label for="tmx">કુલ ગુણ</label><input id="tmx" type="number" inputmode="decimal" min="1" step="0.5" value="${esc(last.max || "")}" placeholder="25"></div></div>
      <div class="field"><span class="lbl">પ્રકાર</span><div class="chips">${TYPES.map(([k, l]) => `<button type="button" class="chip ${type === k ? "on" : ""}" data-ty="${k}">${l}</button>`).join("")}</div></div>
      <div class="field" id="termf" ${type === "term" || type === "prelim" ? "" : "hidden"}><span class="lbl">કઈ પરીક્ષા? <span class="sub">(પરિણામપત્રકમાં બધા વિષય સાથે આવશે)</span></span>
        <div class="chips">${TERMS.map(x => `<button type="button" class="chip" data-term="${esc(x)}">${esc(x)}</button>`).join("")}</div>
        <input id="ttx" placeholder="બીજું નામ" style="margin-top:8px"></div>
      <div class="field"><label for="tnm">ટેસ્ટનું નામ / પ્રકરણ</label><input id="tnm" placeholder="ટેસ્ટ 6 — પ્રકરણ 4"></div>
      <button class="btn primary big" type="submit">ટેસ્ટ બનાવો અને ગુણ ભરો →</button>
    </form>`);
  $$("[data-sub]", d).forEach(c => c.onclick = () => { sub = c.dataset.sub; $("#tsx", d).value = ""; $$("[data-sub]", d).forEach(x => x.classList.toggle("on", x === c)); });
  $$("[data-ty]", d).forEach(c => c.onclick = () => { type = c.dataset.ty; $$("[data-ty]", d).forEach(x => x.classList.toggle("on", x === c)); $("#termf", d).hidden = !(type === "term" || type === "prelim"); });
  $$("[data-term]", d).forEach(c => c.onclick = () => { term = c.dataset.term; $("#ttx", d).value = ""; $$("[data-term]", d).forEach(x => x.classList.toggle("on", x === c)); });
  $("#tf", d).onsubmit = e => {
    e.preventDefault();
    const su = $("#tsx", d).value.trim() || sub, date = $("#tdt", d).value, max = Number($("#tmx", d).value);
    const tm = type === "term" || type === "prelim" ? ($("#ttx", d).value.trim() || term) : "";
    const name = $("#tnm", d).value.trim() || (tm || TYPE[type]);
    if (!su) return toast("વિષય પસંદ કરો.", true);
    if (!date) return toast("તારીખ લખો.", true);
    if (!(max > 0) || max > 1000) return toast("કુલ ગુણ સાચા લખો.", true);
    if ((type === "term" || type === "prelim") && !tm) return toast("કઈ પરીક્ષા છે તે પસંદ કરો.", true);
    busy($('[type="submit"]', d), async () => {
      const tid = `${b.id}_${date.replace(/-/g, "")}_${Date.now().toString(36).slice(-5)}`;
      const t = { branchId: S.branchId, yearId: S.year, batchId: b.id, batchName: b.name, sub: su, date, max, name, type, term: tm,
        by: S.me.loginId, byName: S.profile?.name || "", marks: {}, n: 0, avg: 0, hi: 0, createdAt: serverTimestamp() };
      const w = writeBatch(db);
      w.set(doc(db, "tests", tid), t);
      w.set(idxRef(b.id), { branchId: S.branchId, yearId: S.year, batchId: b.id, list: { [tid]: { sub: su, name, date, max, type, term: tm, n: 0, avg: 0, hi: 0, top: 0, by: S.me.loginId } } }, { merge: true });
      try { await w.commit(); } catch (e2) { return fail(e2); }
      localStorage.setItem("gv_lasttest", JSON.stringify({ sub: su, type, max }));
      audit("test.add", tid, `${su} • ${name}`);
      closeModal(); buzz("done"); location.hash = `#/marks/${encodeURIComponent(tid)}`;
    });
  };
}

// ================= ગુણ ભરો =================
page("marks", async v => {
  if (!canAtt()) { location.hash = "#/home"; return; }
  const tid = arg(2);
  const ts = await getDoc(doc(db, "tests", tid)).catch(() => null);
  if (!ts?.exists()) { v.innerHTML = `<div class="empty">ટેસ્ટ મળી નહીં.</div>`; return; }
  const t = ts.data();
  const [kids, att, top] = await Promise.all([rosterKids(t.batchId),
    getDoc(doc(db, "attendance", `${t.batchId}_${t.date.slice(0, 7)}`)).then(s => s.exists() ? s.data() : null).catch(() => null), topPct()]);
  const day = att?.days?.[t.date.slice(8)] || {};
  const M = {}; kids.forEach(k => { M[k.id] = k.id in (t.marks || {}) ? t.marks[k.id] : (day.s?.[k.id] === "a" || day.s?.[k.id] === "h" ? "ab" : ""); });
  const filled = () => kids.filter(k => M[k.id] !== "").length;
  v.innerHTML = `
    <div class="row-between"><a class="btn line" href="#/tests">${ic("back", 18)} ટેસ્ટ</a>${t.n ? `<a class="btn line" href="#/result/${encodeURIComponent(tid)}">પરિણામ</a>` : ""}</div>
    <div><h1 class="page-title" style="margin:0">ગુણ ભરો</h1><span class="sub">${esc(t.batchName)} • ${esc(t.sub)} • ${esc(t.name)} • ${fmtD(t.date)}</span></div>
    <div class="card row-between" style="flex-direction:row;padding:12px 16px"><span>કુલ ગુણ <b style="font-size:20px">${num(t.max)}</b></span><span class="sub" id="cnt"></span></div>
    ${Object.values(day.s || {}).some(x => x === "a" || x === "h") && !t.n ? `<p class="hint" style="margin:0">એ દિવસે હાજરીમાં ગેરહાજર/રજા હતા તેમને "ગેરહાજર" મૂક્યા છે.</p>` : ""}
    ${!kids.length ? `<div class="empty">આ બેચમાં હજુ કોઈ વિદ્યાર્થી નથી.</div>` : `
    <div class="card mklist" style="gap:0">${kids.map((k, i) => `<div class="mkrow" data-row="${esc(k.id)}">
      <span class="rn">${i + 1}</span><label class="grow" for="mk_${esc(k.id)}"><b>${esc(k.n)}</b></label>
      <input id="mk_${esc(k.id)}" class="mkin" data-mk="${esc(k.id)}" type="text" inputmode="decimal" enterkeyhint="next" autocomplete="off" value="${M[k.id] === "ab" ? "" : esc(M[k.id])}" ${M[k.id] === "ab" ? "hidden" : ""} aria-label="${esc(k.n)} ના ગુણ">
      <button type="button" class="mkab ${M[k.id] === "ab" ? "on" : ""}" data-ab="${esc(k.id)}">${M[k.id] === "ab" ? "ગેરહાજર" : "ગેર."}</button></div>`).join("")}</div>`}
    <div class="fbar" style="grid-template-columns:1fr"><button type="button" class="btn primary" id="save" ${kids.length ? "" : "disabled"}>${ic("check", 18)} સાચવો અને પરિણામ જુઓ</button></div>`;
  const upd = () => { $("#cnt").textContent = `${filled()} / ${kids.length} ભર્યા`; };
  const check = inp => {
    const raw = inp.value.trim().replace(",", "."), id = inp.dataset.mk;
    if (raw === "") { M[id] = ""; inp.classList.remove("bad"); upd(); return true; }
    const n = Number(raw), okk = !isNaN(n) && n >= 0 && n <= t.max && Math.round(n * 2) === n * 2;
    inp.classList.toggle("bad", !okk); if (okk) M[id] = n; upd(); return okk;
  };
  $$("[data-mk]", v).forEach((inp, i, all) => {
    inp.oninput = () => check(inp);
    inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); if (!check(inp)) return toast(`0 થી ${num(t.max)} વચ્ચે ગુણ લખો (અડધો ગુણ .5 ચાલે).`, true); const nx = all.slice(i + 1).find(x => !x.hidden); nx ? nx.focus() : $("#save").focus(); } };
    inp.onfocus = () => inp.select();
  });
  $$("[data-ab]", v).forEach(btn => btn.onclick = () => {
    const id = btn.dataset.ab, inp = $(`[data-mk="${CSS.escape(id)}"]`, v), on = M[id] !== "ab";
    M[id] = on ? "ab" : ""; inp.hidden = on; if (!on) { inp.value = ""; inp.focus(); }
    btn.classList.toggle("on", on); btn.textContent = on ? "ગેરહાજર" : "ગેર."; buzz("tap"); upd();
  });
  upd();
  $("#save", v)?.addEventListener("click", e => {
    const bad = $$("[data-mk]", v).filter(i => !i.hidden && !check(i));
    if (bad.length) { bad[0].focus(); return toast(`${bad.length} ગુણ ખોટા છે: 0 થી ${num(t.max)} વચ્ચે લખો.`, true); }
    const empty = kids.filter(k => M[k.id] === "");
    const go = () => busy(e.currentTarget, async () => {
      const marks = {}; kids.forEach(k => { if (M[k.id] !== "") marks[k.id] = M[k.id]; });
      const r = await saveMarks(tid, t, marks, kids, top);
      if (r) { buzz("done"); chime([660, 880, 990]); location.hash = `#/result/${encodeURIComponent(tid)}`; }
    });
    if (!empty.length) return go();
    const d = modal("બધાના ગુણ નથી ભર્યા", `<p>${empty.length} વિદ્યાર્થીના ગુણ બાકી છે: ${empty.slice(0, 5).map(k => esc(first(k.n))).join(", ")}${empty.length > 5 ? "…" : ""}. તેમના ગુણ પછી ભરી શકાશે.</p>
      <div class="grid2"><button type="button" class="btn line" id="mback">પાછા જાઓ</button><button type="button" class="btn primary" id="mgo">હમણાં સાચવો</button></div>`);
    $("#mback", d).onclick = () => { closeModal(); $(`[data-mk="${CSS.escape(empty[0].id)}"]`, v)?.focus(); };
    $("#mgo", d).onclick = () => { closeModal(); go(); };
  });
});

// ગુણ સાચવો: ટેસ્ટ + યાદી + દરેક વિદ્યાર્થીનું પોતાનું પરિણામ (એક સાથે)
async function saveMarks(tid, t, marks, kids, top) {
  const T = { ...t, marks }, st = stats(T, top);
  const w = writeBatch(db);
  w.update(doc(db, "tests", tid), { marks, n: st.n, avg: st.avg, hi: st.hi, updatedAt: serverTimestamp(), updatedBy: S.me.loginId });
  w.set(idxRef(t.batchId), { branchId: S.branchId, yearId: S.year, batchId: t.batchId,
    list: { [tid]: { sub: t.sub, name: t.name, date: t.date, max: t.max, type: t.type, term: t.term || "", n: st.n, avg: st.avg, hi: st.hi, top: st.tops.length, by: t.by } } }, { merge: true });
  kids.forEach(k => {
    const m = k.id in marks ? marks[k.id] : null, p = pct(m, t.max);
    w.set(resRef(k.id), { branchId: S.branchId, yearId: S.year, studentId: k.id,
      list: { [tid]: { sub: t.sub, name: t.name, date: t.date, max: t.max, type: t.type, term: t.term || "", m, avg: st.avg, hi: st.hi, n: st.n,
        rank: p != null && p >= top ? st.rank[k.id] : null } } }, { merge: true });
  });
  try {
    const p = w.commit();
    const r = await Promise.race([p.then(() => true), new Promise(ok => setTimeout(() => ok("wait"), 2500))]);
    if (r === "wait") toast("નેટ ધીમું છે: ફોનમાં સચવાયું, નેટ આવે એટલે મોકલાશે.");
    audit("test.marks", tid, `${st.n} ગુણ • સરેરાશ ${st.avg}`);
    return true;
  } catch (e) { fail(e); return false; }
}

// ================= પરિણામ (શિક્ષક/સંચાલક) =================
page("result", async v => {
  if (!canAtt()) { location.hash = "#/home"; return; }
  const tid = arg(2);
  const ts = await getDoc(doc(db, "tests", tid)).catch(() => null);
  if (!ts?.exists()) { v.innerHTML = `<div class="empty">ટેસ્ટ મળી નહીં.</div>`; return; }
  const t = ts.data();
  const [kids, top0] = await Promise.all([rosterKids(t.batchId), topPct()]);
  let top = top0;
  const name = Object.fromEntries(kids.map(k => [k.id, k]));
  const draw = () => {
    const st = stats(t, top), canDel = isAdmin() || t.by === S.me.loginId;
    v.innerHTML = `
      <div class="row-between"><a class="btn line" href="#/tests">${ic("back", 18)} ટેસ્ટ</a><a class="btn line" href="#/marks/${encodeURIComponent(tid)}">${ic("edit", 18)} ગુણ બદલો</a></div>
      <div><h1 class="page-title" style="margin:0">${esc(t.sub)} • ${esc(t.name)}</h1><span class="sub">${esc(t.batchName)} • ${fmtD(t.date)} • કુલ ${num(t.max)}${t.term ? " • " + esc(t.term) : ""}</span></div>
      <div class="grid2 stat4">
        <div class="card"><span class="sub">સરેરાશ</span><b>${num(st.avg)} / ${num(t.max)}</b><span class="sub">${pct(st.avg, t.max) ?? 0}%</span></div>
        <div class="card"><span class="sub">સૌથી વધુ</span><b>${num(st.hi)}</b><span class="sub">${st.sorted.filter(x => x.m === st.hi).map(x => esc(first(name[x.id]?.n))).slice(0, 2).join(", ")}</span></div>
        <div class="card"><span class="sub">🏆 ${top}% થી વધુ</span><b style="color:#15803D">${st.tops.length}</b><span class="sub">ટોપર્સ</span></div>
        <div class="card"><span class="sub">35% થી ઓછા</span><b style="color:${st.low.length ? "#DC2626" : "inherit"}">${st.low.length}</b><span class="sub">${st.ab ? st.ab + " ગેરહાજર" : "ધ્યાન આપો"}</span></div></div>
      ${st.tops.length ? `<button type="button" class="btn primary big" id="poster">🏆 ટોપર્સ પોસ્ટર • ગ્રુપમાં મોકલો</button>`
        : st.n ? `<div class="note old">${ic("info", 20)}<div>આ ટેસ્ટમાં કોઈ ${top}% થી ઉપર નથી, એટલે ગ્રુપ માટે પોસ્ટર નથી.</div></div>` : ""}
      <div class="card" style="gap:0"><div class="row-between" style="margin-bottom:4px"><h2>ક્રમ પ્રમાણે</h2><span class="sub">${st.n} / ${kids.length}</span></div>
        ${st.sorted.map(x => { const p = pct(x.m, t.max), r = st.rank[x.id], k = name[x.id] || { n: x.id };
          return `<div class="srow rkrow ${p >= top ? "top" : p < 35 ? "low" : ""}"><span class="rk">${r <= 3 ? ["🥇", "🥈", "🥉"][r - 1] : r}</span>
            <span class="grow"><b>${esc(k.n)}</b><span class="sub" style="display:block">${p}%${p >= top ? " • 🏆 ટોપર" : ""}</span></span>
            <b class="mkv">${num(x.m)}</b>${k.m ? `<a class="icon-btn wa1" target="_blank" rel="noopener" href="${waLink(k.m, msgFor(t, k, x.m, st, top))}" aria-label="${esc(k.n)} ના વાલીને WhatsApp">${ic("wa", 20)}</a>` : ""}</div>`; }).join("")}
        ${kids.filter(k => t.marks?.[k.id] === "ab").map(k => `<div class="srow rkrow"><span class="rk">—</span><span class="grow"><b>${esc(k.n)}</b><span class="sub" style="display:block">ગેરહાજર</span></span>
            ${k.m ? `<a class="icon-btn wa1" target="_blank" rel="noopener" href="${waLink(k.m, msgFor(t, k, "ab", st, top))}" aria-label="WhatsApp">${ic("wa", 20)}</a>` : ""}</div>`).join("")}
        ${kids.filter(k => !(k.id in (t.marks || {}))).length ? `<p class="hint">${kids.filter(k => !(k.id in (t.marks || {}))).length} ના ગુણ હજુ ભર્યા નથી.</p>` : ""}</div>
      <button type="button" class="btn line big" id="waall">${ic("wa", 18)} દરેક વાલીને એક પછી એક WhatsApp</button>
      ${isAdmin() ? `<div class="card row-between" style="flex-direction:row"><span>ટોપર મર્યાદા</span><span><input id="tp" type="number" min="50" max="100" value="${top}" style="width:76px;text-align:center"> %</span></div>` : ""}
      ${canDel ? `<button type="button" class="btn line danger" id="tdel">ટેસ્ટ ભૂંસો</button>` : ""}`;
    $$(".wa1", v).forEach(a => a.addEventListener("click", () => a.classList.add("sent")));
    $("#poster", v)?.addEventListener("click", e => busy(e.currentTarget, () => topperPoster(t, st, name, top)));
    $("#waall").onclick = () => waQueue(t, st, kids, top);
    $("#tp", v)?.addEventListener("change", async e => {
      const n = Math.max(50, Math.min(100, Number(e.target.value) || 80));
      try { await setDoc(metaRef(), { topPct: n }, { merge: true }); top = n; toast(`ટોપર મર્યાદા ${n}%. ક્રમ સુધારવા "ગુણ બદલો → સાચવો" દબાવો.`); draw(); } catch (e2) { fail(e2); }
    });
    $("#tdel", v)?.addEventListener("click", () => {
      const d = modal("ટેસ્ટ ભૂંસવી છે?", `<p>${esc(t.sub)} • ${esc(t.name)} અને તેના બધા ગુણ ભૂંસાઈ જશે. વાલીની એપમાંથી પણ જતું રહેશે.</p>
        <div class="grid2"><button type="button" class="btn line" id="dno">રહેવા દો</button><button type="button" class="btn primary danger" id="dyes">હા, ભૂંસો</button></div>`);
      $("#dno", d).onclick = () => closeModal();
      $("#dyes", d).onclick = () => busy($("#dyes", d), async () => {
        const w = writeBatch(db);
        w.delete(doc(db, "tests", tid));
        w.set(idxRef(t.batchId), { list: { [tid]: null } }, { merge: true });
        kids.forEach(k => w.set(resRef(k.id), { branchId: S.branchId, studentId: k.id, list: { [tid]: null } }, { merge: true }));
        try { await w.commit(); } catch (e2) { return fail(e2); }
        audit("test.delete", tid, `${t.sub} • ${t.name}`); closeModal(); toast("ટેસ્ટ ભૂંસાઈ."); location.hash = "#/tests";
      });
    });
  };
  draw();
});
function msgFor(t, k, m, st, top) {
  const nm = short(k.n);
  if (m === "ab") return `${ACADEMY.name}\n${t.sub} • ${t.name} (${fmtD(t.date)})\n${nm} આ ટેસ્ટમાં ગેરહાજર હતા. વર્ગની સરેરાશ ${num(st.avg)}/${num(t.max)}.`;
  const p = pct(m, t.max);
  return `${ACADEMY.name}\n${t.sub} • ${t.name} (${fmtD(t.date)}) નું પરિણામ\n${nm}: ${num(m)} / ${num(t.max)} (${p}%)` +
    (p >= top ? `\n🏆 ${top}% ક્લબ • વર્ગમાં ${st.rank[k.id]} મો ક્રમ` : "") +
    `\nવર્ગની સરેરાશ ${num(st.avg)} • સૌથી વધુ ${num(st.hi)}` + (p < 35 ? `\nવધુ મહેનતની જરૂર છે. ઘરે ધ્યાન રાખવા વિનંતી 🙏` : p >= top ? `\nખૂબ અભિનંદન 🎉` : "");
}
// બધા વાલીને એક પછી એક (WhatsApp ખૂલે, પાછા આવો એટલે આગળનું)
function waQueue(t, st, kids, top) {
  const q = kids.filter(k => k.m && k.id in (t.marks || {}));
  if (!q.length) return toast("મોકલવા માટે કોઈ નંબર નથી.", true);
  let i = 0;
  const d = modal("વાલીને પરિણામ", `<p class="sub" id="wqs"></p><div id="wqn" style="font-weight:700;font-size:18px"></div>
    <a class="btn wa big" id="wqgo" target="_blank" rel="noopener">${ic("wa", 18)} મોકલો</a><button type="button" class="btn line" id="wqskip">છોડો, આગળ</button>`);
  const show = () => {
    if (i >= q.length) { closeModal(); toast("બધાને મોકલાઈ ગયું ✓"); return; }
    const k = q[i]; $("#wqs", d).textContent = `${i + 1} / ${q.length}`; $("#wqn", d).textContent = k.n;
    $("#wqgo", d).href = waLink(k.m, msgFor(t, k, t.marks[k.id], st, top));
  };
  $("#wqgo", d).addEventListener("click", () => setTimeout(() => { i++; show(); }, 600));
  $("#wqskip", d).onclick = () => { i++; show(); };
  show();
}

// ================= ટોપર્સ પોસ્ટર (1080 × 1350) =================
async function topperPoster(t, st, name, top) {
  await loadFonts();
  const logo = await loadImg("logo.png");
  const tops = st.tops, per = 30, pages = Math.ceil(tops.length / per), files = [];
  for (let pg = 0; pg < pages; pg++) {
    const list = tops.slice(pg * per, pg * per + per);
    const c = document.createElement("canvas"); c.width = 1080; c.height = 1350;
    const x = c.getContext("2d"); x.scale(3, 3); const W = 360, H = 450, GU = '"Baloo Bhai 2","Noto Sans Gujarati",sans-serif';
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#0B1440"); g.addColorStop(.55, "#1E2A78"); g.addColorStop(1, "#3B1C6E"); x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (let k = 0; k < 60; k++) { x.fillStyle = `rgba(255,215,120,${.15 + (k % 5) * .08})`; x.beginPath(); x.arc((k * 97) % W, (k * 53) % 120 + (k % 3) * 140, (k % 3) + .6, 0, 7); x.fill(); }
    const tx = (s, X, Y, size, fill, o = {}) => { x.save(); let z = size; x.font = `${o.w || 800} ${z}px ${GU}`; while (o.max && x.measureText(s).width > o.max && z > 7) { z -= .5; x.font = `${o.w || 800} ${z}px ${GU}`; } x.textAlign = o.al || "center"; x.textBaseline = "middle"; if (o.sh) { x.shadowColor = "rgba(0,0,0,.4)"; x.shadowBlur = 6; } x.fillStyle = fill; x.fillText(s, X, Y); x.restore(); };
    if (logo) { x.save(); x.beginPath(); x.arc(W / 2, 34, 20, 0, 7); x.clip(); x.drawImage(logo, W / 2 - 20, 14, 40, 40); x.restore(); }
    tx(ACADEMY.name + (branchName(S.branchId) ? ", " + branchName(S.branchId) : ""), W / 2, 66, 13, "#FDE68A", { max: 320 });
    tx(`🏆 ${top}% ક્લબ`, W / 2, 92, 26, "#FFFFFF", { sh: 1 });
    tx(`${t.sub} • ${t.name}`, W / 2, 116, 13, "#E0E7FF", { w: 600, max: 330 });
    tx(`${t.batchName} • ${fmtD(t.date)} • કુલ ગુણ ${num(t.max)}`, W / 2, 133, 10, "#C7D2FE", { w: 600, max: 330 });
    const two = list.length > 12, rows = two ? Math.ceil(list.length / 2) : list.length, avail = 262, rh = Math.min(44, avail / rows), top0 = 152 + (avail - rows * rh) / 2;
    list.forEach((it, j) => {
      const col = two ? (j < rows ? 0 : 1) : 0, row = two ? j % rows : j, X = two ? 14 + col * 170 : 30, w = two ? 162 : 300, Y = top0 + row * rh;
      const r = st.rank[it.id];
      x.fillStyle = r === 1 ? "rgba(253,224,71,.28)" : "rgba(255,255,255,.10)"; x.beginPath(); x.roundRect ? x.roundRect(X, Y, w, rh - 3, 6) : x.rect(X, Y, w, rh - 3); x.fill();
      const fs = Math.min(two ? 12 : 17, rh * .5);
      tx(r <= 3 ? ["🥇", "🥈", "🥉"][r - 1] : String(r), X + 6 + fs * .6, Y + (rh - 3) / 2, fs, "#FDE68A", { al: "center" });
      tx(short(name[it.id]?.n || it.id), X + 12 + fs * 1.4, Y + (rh - 3) / 2, fs, "#FFFFFF", { al: "left", max: w - 74 });
      tx(`${num(it.m)}  •  ${pct(it.m, t.max)}%`, X + w - 8, Y + (rh - 3) / 2, fs * .92, "#A7F3D0", { al: "right", w: 700 });
    });
    tx(pages > 1 ? `ભાગ ${pg + 1} / ${pages}` : `વર્ગની સરેરાશ ${num(st.avg)} / ${num(t.max)}`, W / 2, 425, 10, "#C7D2FE", { w: 600 });
    tx("ખૂબ ખૂબ અભિનંદન! 🎉  — ગાંડિવ એકેડેમી પરિવાર", W / 2, 440, 11, "#FDE68A");
    files.push(await new Promise(res => c.toBlob(b => res(new File([b], `ટોપર્સ_${t.sub}_${t.date}${pages > 1 ? "_" + (pg + 1) : ""}.jpg`, { type: "image/jpeg" })), "image/jpeg", .92)));
  }
  const text = `${ACADEMY.name}\n🏆 ${t.sub} • ${t.name} (${fmtD(t.date)})\n${top}% થી વધુ ગુણ મેળવનાર ${tops.length} વિદ્યાર્થીઓને અભિનંદન 🎉`;
  const prev = modal("ટોપર્સ પોસ્ટર", `${files.map(f => `<img src="${URL.createObjectURL(f)}" alt="ટોપર્સ પોસ્ટર" style="width:100%;border-radius:12px;margin-bottom:8px">`).join("")}
    <button type="button" class="btn wa big" id="psh">${ic("wa", 18)} ગ્રુપમાં મોકલો (Share)</button><button type="button" class="btn line" id="psv">${ic("dl", 18)} ફોનમાં સાચવો</button>
    <p class="hint">Share દબાવો → WhatsApp → તમારું ગ્રુપ પસંદ કરો.</p>`);
  $("#psv", prev).onclick = () => files.forEach(f => { const a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); });
  $("#psh", prev).onclick = async () => {
    try { if (navigator.canShare?.({ files })) { await navigator.share({ files, text }); return; } } catch (e) { if (e?.name === "AbortError") return; }
    $("#psv", prev).click(); toast("પોસ્ટર સચવાયું. WhatsApp ગ્રુપમાં ગેલેરીમાંથી મોકલો.");
  };
  buzz("done");
}

// ================= પરિણામપત્રક (સત્ર/પ્રિલિમ) — સ્ટાફ =================
async function attPct(bid, from, to, ids) {
  const yms = []; let [y, m] = from.slice(0, 7).split("-").map(Number); const end = to.slice(0, 7);
  for (let k = 0; k < 14; k++) { const ym = `${y}-${z2(m)}`; yms.push(ym); if (ym >= end) break; m++; if (m > 12) { m = 1; y++; } }
  const docs = await Promise.all(yms.map(ym => getDoc(doc(db, "attendance", `${bid}_${ym}`)).then(s => s.exists() ? s.data() : null).catch(() => null)));
  const out = {};
  ids.forEach(id => { let p = 0, base = 0; docs.forEach((a, i) => { if (!a) return; const r = studentMonth(a, id, yms[i]); p += r.c.p + r.c.l; base += r.c.p + r.c.l + r.c.a; }); out[id] = base ? Math.round(p * 100 / base) : null; });
  return out;
}
function rcardHtml({ s, rows, term, att, remark, rank, top, branch }) {
  const tot = rows.reduce((a, r) => a + r.max, 0), got = rows.reduce((a, r) => a + (typeof r.m === "number" ? r.m : 0), 0), p = tot ? Math.round(got * 1000 / tot) / 10 : 0;
  const allAb = rows.every(r => r.m === "ab" || r.m == null);
  return `<div class="rcd">
    <div class="rcd-h"><img src="logo.png" alt=""><div><span class="rcd-tr">${esc(ACADEMY.trust || "ગાંડિવ ચેરિટેબલ ટ્રસ્ટ દ્વારા સંચાલિત")}</span><b>${esc(ACADEMY.name)}${branch ? ", " + esc(branch) : ""}</b><span>પરિણામપત્રક — ${esc(term)} ${esc(S.year)}</span></div></div>
    <div class="rcd-kv"><span><i>નામ:</i> ${esc(s.n || s.name)}</span><span><i>ID:</i> ${esc(s.id)}</span><span><i>બેચ:</i> ${esc(s.bn || s.batchName || "")}</span><span><i>હાજરી:</i> ${att != null ? att + "%" : "—"}</span></div>
    <table class="rcd-t"><thead><tr><th>વિષય</th><th>કુલ ગુણ</th><th>મેળવેલ</th><th>ટકા</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r.sub)}</td><td>${num(r.max)}</td><td>${r.m === "ab" ? "ગેરહાજર" : r.m == null ? "—" : num(r.m)}</td><td>${typeof r.m === "number" ? pct(r.m, r.max) + "%" : "—"}</td></tr>`).join("")}
      <tr class="tot"><td>કુલ</td><td>${num(tot)}</td><td>${allAb ? "—" : num(got)}</td><td>${allAb ? "—" : p + "%"}</td></tr></tbody></table>
    <div class="rcd-kv"><span><i>પરિણામ:</i> ${allAb ? "—" : p >= 35 ? "પાસ" : "વધુ મહેનત જરૂરી"}</span>${rank && p >= top ? `<span><i>🏆 ${top}% ક્લબ • વર્ગમાં ક્રમ:</i> ${rank}</span>` : ""}</div>
    <div class="rcd-rm"><i>ટિપ્પણી:</i> ${esc(remark || "")}</div>
    <div class="rcd-sg"><span>વર્ગ શિક્ષક</span><span>સંચાલક</span><span>વાલીની સહી</span></div></div>`;
}
page("rcard", async v => {
  if (!canAtt()) { location.hash = "#/home"; return; }
  const bid = arg(2), term = arg(3), key = termKey(term);
  const [bs, ix, kids, top, tr] = await Promise.all([getDoc(doc(db, "batches", bid)), getDoc(idxRef(bid)), rosterKids(bid), topPct(),
    getDoc(doc(db, "terms", `${bid}_${key}`)).then(s => s.exists() ? s.data() : null).catch(() => null)]);
  const ids = Object.entries((ix.exists() && ix.data().list) || {}).filter(([, t]) => t && t.term === term).sort((a, b) => (a[1].date + a[1].sub).localeCompare(b[1].date + b[1].sub)).map(([id]) => id);
  const tests = (await Promise.all(ids.map(id => getDoc(doc(db, "tests", id)).catch(() => null)))).filter(s => s?.exists()).map(s => ({ id: s.id, ...s.data() }));
  if (!tests.length) { v.innerHTML = `<div class="empty">આ પરીક્ષાની કોઈ ટેસ્ટ મળી નહીં.</div>`; return; }
  const from = `${S.year.slice(0, 4)}-06-01`, to = tests.reduce((a, t) => t.date > a ? t.date : a, "");
  const att = await attPct(bid, from, to, kids.map(k => k.id));
  const rem = { ...(tr?.remarks || {}) };
  // કુલ પરથી ક્રમ
  const totals = kids.map(k => { const g = tests.reduce((a, t) => a + (typeof t.marks?.[k.id] === "number" ? t.marks[k.id] : 0), 0), mx = tests.reduce((a, t) => a + t.max, 0);
    return { id: k.id, g, p: mx ? g * 100 / mx : 0, any: tests.some(t => typeof t.marks?.[k.id] === "number") }; }).filter(x => x.any).sort((a, b) => b.g - a.g);
  const rank = {}; totals.forEach((x, i) => { rank[x.id] = i && x.g === totals[i - 1].g ? rank[totals[i - 1].id] : i + 1; });
  const cardOf = k => rcardHtml({ s: k, rows: tests.map(t => ({ sub: t.sub, max: t.max, m: t.marks?.[k.id] })), term, att: att[k.id], remark: rem[k.id], rank: rank[k.id], top, branch: branchName(S.branchId) });
  v.innerHTML = `
    <div class="row-between"><a class="btn line" href="#/tests">${ic("back", 18)} ટેસ્ટ</a><button type="button" class="btn primary" id="prall">${ic("print", 18)} બધાં છાપો / PDF</button></div>
    <div><h1 class="page-title" style="margin:0">પરિણામપત્રક</h1><span class="sub">${esc(bs.data()?.name || "")} • ${esc(term)} • ${tests.map(t => esc(t.sub)).join(", ")}</span></div>
    <p class="hint" style="margin:0">દરેક પરિણામપત્રક નીચે ટિપ્પણી લખો અને "ટિપ્પણી સાચવો" દબાવો. પછી વાલીની એપમાં પણ દેખાશે.</p>
    ${kids.map(k => `<div class="card" style="gap:8px" data-k="${esc(k.id)}"><div class="rcwrap">${cardOf(k)}</div>
      <label class="field" style="margin:0"><span class="sr">ટિપ્પણી</span><textarea rows="2" data-rm="${esc(k.id)}" placeholder="${esc(first(k.n))} માટે ટિપ્પણી (દા.ત. ગણિતમાં ખૂબ સારું, અંગ્રેજીમાં વધુ મહેનત)">${esc(rem[k.id] || "")}</textarea></label>
      <div class="grid2"><button type="button" class="btn line" data-sh="${esc(k.id)}">${ic("wa", 18)} વાલીને મોકલો</button><button type="button" class="btn line" data-pr1="${esc(k.id)}">${ic("print", 18)} છાપો</button></div></div>`).join("")}
    <div class="fbar" style="grid-template-columns:1fr"><button type="button" class="btn primary" id="rsave">${ic("check", 18)} ટિપ્પણી સાચવો</button></div>`;
  const kOf = id => kids.find(k => k.id === id);
  $$("[data-rm]", v).forEach(ta => ta.oninput = () => { rem[ta.dataset.rm] = ta.value.trim(); $(`[data-k="${CSS.escape(ta.dataset.rm)}"] .rcd-rm`, v).innerHTML = `<i>ટિપ્પણી:</i> ${esc(ta.value.trim())}`; });
  const printIt = list => {
    let el = $("#print"); if (!el) { el = document.createElement("div"); el.id = "print"; document.body.appendChild(el); }
    el.innerHTML = list.map(k => `<section class="pf">${cardOf(k)}</section>`).join("");
    const tt = document.title; document.title = `પરિણામપત્રક_${term}`; setTimeout(() => { window.print(); document.title = tt; }, 200);
  };
  $("#prall").onclick = () => printIt(kids);
  $$("[data-pr1]", v).forEach(b => b.onclick = () => printIt([kOf(b.dataset.pr1)]));
  $$("[data-sh]", v).forEach(b => b.onclick = () => busy(b, async () => {
    const k = kOf(b.dataset.sh), el = $(`[data-k="${CSS.escape(k.id)}"] .rcd`, v);
    const text = `${ACADEMY.name}\n${k.n} નું પરિણામપત્રક • ${term}`;
    try {
      const h = await loadH2C(), cv = await h(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const f = await new Promise(res => cv.toBlob(bb => res(new File([bb], `પરિણામપત્રક_${k.id}.png`, { type: "image/png" })), "image/png"));
      if (navigator.canShare?.({ files: [f] })) { await navigator.share({ files: [f], text }); return; }
    } catch (e) { if (e?.name === "AbortError") return; }
    if (k.m) window.open(waLink(k.m, text + "\nગાંડિવ એપમાં ટેસ્ટ → પરિણામપત્રક જુઓ."), "_blank");
  }));
  $("#rsave").onclick = e => busy(e.currentTarget, async () => {
    const w = writeBatch(db);
    w.set(doc(db, "terms", `${bid}_${key}`), { branchId: S.branchId, yearId: S.year, batchId: bid, name: term, remarks: rem, updatedAt: serverTimestamp() }, { merge: true });
    kids.forEach(k => w.set(resRef(k.id), { branchId: S.branchId, yearId: S.year, studentId: k.id,
      terms: { [key]: { name: term, top, remark: rem[k.id] || "", att: att[k.id] ?? null, rank: totals.find(x => x.id === k.id)?.p >= top ? rank[k.id] : null } } }, { merge: true }));
    try { await w.commit(); } catch (e2) { return fail(e2); }
    audit("term.remarks", `${bid}_${key}`, term); buzz("done"); toast("ટિપ્પણી સચવાઈ. વાલીની એપમાં પણ દેખાશે.");
  });
});
let h2c = null;
function loadH2C() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  return h2c || (h2c = new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"; s.onload = () => res(window.html2canvas); s.onerror = rej; document.head.appendChild(s); }));
}

// ================= વિદ્યાર્થી/વાલી =================
export async function getResults(sid) { try { const s = await getDoc(resRef(sid)); return s.exists() ? s.data() : null; } catch { return null; } }
const resList = R => Object.entries(R?.list || {}).filter(([, t]) => t).map(([id, t]) => ({ id, ...t })).sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
// હોમ: છેલ્લા 10 દિવસનું નવું પરિણામ
export async function familyResultHtml(sid, nm = "") {
  const R = await getResults(sid), from = (() => { const d = new Date(); d.setDate(d.getDate() - 10); return ymd(d); })();
  const fresh = resList(R).filter(t => t.date >= from && t.n && t.m != null).slice(0, 3);
  if (!fresh.length) return "";
  return `<a class="card rescard" href="#/myresults/${encodeURIComponent(sid)}"><div class="row-between"><h2>${ic("trophy", 20)} નવું પરિણામ${nm ? " • " + esc(nm) : ""}</h2>${ic("chev", 18)}</div>
    ${fresh.map(t => { const p = pct(t.m, t.max);
      return `<div class="resrow"><span class="grow"><b>${esc(t.sub)}</b> <span class="sub">• ${esc(t.name)}</span>
        <span class="sub" style="display:block">${t.rank ? `🏆 ટોપર • વર્ગમાં ક્રમ ${t.rank}` : `વર્ગની સરેરાશ ${num(t.avg)} • સૌથી વધુ ${num(t.hi)}`}</span></span>
        <span class="resm">${t.m === "ab" ? `<span class="sub">ગેરહાજર</span>` : `<b>${num(t.m)}</b><small>/${num(t.max)}</small><span class="pill ${p >= 80 ? "ok" : p < 35 ? "bad" : ""}">${p}%</span>`}</span></div>`; }).join("")}</a>`;
}
page("myresults", async v => {
  const sid = arg(2) || S.me.loginId;
  const [R, ss] = await Promise.all([getResults(sid), getDoc(doc(db, "students", sid)).catch(() => null)]);
  const s = ss?.exists() ? ss.data() : { name: sid };
  const all = resList(R).filter(t => t.n);
  const subs = [...new Set(all.map(t => t.sub))];
  let sub = sessionStorage.getItem("gv_rsub") || ""; if (sub && !subs.includes(sub)) sub = "";
  const terms = Object.entries(R?.terms || {}).filter(([, x]) => x);
  const draw = () => {
    const list = all.filter(t => !sub || t.sub === sub), withM = list.filter(t => typeof t.m === "number").slice(0, 8).reverse();
    const avgOf = s0 => { const x = all.filter(t => t.sub === s0 && typeof t.m === "number"); return x.length ? Math.round(x.reduce((a, t) => a + pct(t.m, t.max), 0) / x.length) : null; };
    v.innerHTML = `
      <div class="row-between"><a class="btn line" href="#/home">${ic("back", 18)} હોમ</a><span class="sub">${esc(s.name)}</span></div>
      <h1 class="page-title" style="margin:0">ટેસ્ટ અને પરિણામ</h1>
      ${terms.length ? `<div class="card" style="gap:0">${terms.map(([k, x]) => `<a class="srow" href="#/myrcard/${encodeURIComponent(sid)}/${k}"><span class="grow"><b>📄 ${esc(x.name)} — પરિણામપત્રક</b></span>${ic("chev", 18)}</a>`).join("")}</div>` : ""}
      ${all.length ? `<div class="hscroll">${[["", "બધા વિષય"], ...subs.map(x => [x, `${x}${avgOf(x) != null ? " " + avgOf(x) + "%" : ""}`])].map(([k, l]) => `<button type="button" class="chip ${sub === k ? "on" : ""}" data-sub="${esc(k)}">${esc(l)}</button>`).join("")}</div>
      ${withM.length >= 2 ? `<div class="card" style="gap:6px"><div class="row-between"><h2>${sub ? esc(sub) + "માં " : ""}પ્રગતિ</h2><span class="sub">છેલ્લી ${withM.length} ટેસ્ટ (%)</span></div>
        <div class="pbar">${withM.map(t => { const p = pct(t.m, t.max); return `<div class="pcol"><span class="pv">${Math.round(p)}</span><div class="pb ${p >= 80 ? "hi" : p < 35 ? "lo" : ""}" style="height:${Math.max(4, p)}%"></div><span class="pl">${+t.date.slice(8)}/${+t.date.slice(5, 7)}</span></div>`; }).join("")}</div></div>` : ""}` : ""}
      ${list.map(t => { const p = pct(t.m, t.max);
        return `<div class="card" style="gap:4px"><div class="row-between"><b>${esc(t.sub)} • ${esc(t.name)}</b><span class="sub">${fmtD(t.date)}</span></div>
          <div class="row-between"><span style="font-size:22px;font-weight:800">${t.m === "ab" ? "ગેરહાજર" : t.m == null ? "—" : `${num(t.m)} <small class="sub">/ ${num(t.max)}</small>`}</span>${p != null ? `<span class="pill ${p >= 80 ? "ok" : p < 35 ? "bad" : ""}">${p}%</span>` : ""}</div>
          <span class="sub">વર્ગની સરેરાશ ${num(t.avg)} • સૌથી વધુ ${num(t.hi)}${t.rank ? ` • 🏆 ટોપર • ક્રમ ${t.rank}` : ""}</span></div>`; }).join("") || `<div class="empty">હજુ કોઈ પરિણામ નથી.</div>`}`;
    $$("[data-sub]", v).forEach(c => c.onclick = () => { sub = c.dataset.sub; sessionStorage.setItem("gv_rsub", sub); draw(); });
  };
  draw();
});
page("myrcard", async v => {
  const sid = arg(2), key = arg(3);
  const [R, ss] = await Promise.all([getResults(sid), getDoc(doc(db, "students", sid)).catch(() => null)]);
  const tm = R?.terms?.[key], s = ss?.exists() ? { id: sid, ...ss.data() } : { id: sid, name: sid };
  if (!tm) { v.innerHTML = `<div class="empty">પરિણામપત્રક હજુ તૈયાર નથી.</div>`; return; }
  const rows = resList(R).filter(t => t.term === tm.name).sort((a, b) => (a.date + a.sub).localeCompare(b.date + b.sub)).map(t => ({ sub: t.sub, max: t.max, m: t.m }));
  v.innerHTML = `<div class="row-between"><a class="btn line" href="#/myresults/${encodeURIComponent(sid)}">${ic("back", 18)} પાછા</a><button type="button" class="btn line" id="pr">${ic("print", 18)} છાપો / PDF</button></div>
    <div class="rcwrap">${rcardHtml({ s, rows, term: tm.name, att: tm.att, remark: tm.remark, rank: tm.rank, top: tm.top || 80, branch: branchName(S.branchId) })}</div>`;
  $("#pr").onclick = () => { let el = $("#print"); if (!el) { el = document.createElement("div"); el.id = "print"; document.body.appendChild(el); } el.innerHTML = `<section class="pf">${$(".rcwrap", v).innerHTML}</section>`; setTimeout(() => window.print(), 150); };
});
