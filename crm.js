// =============================================================
//  ફેઝ 1B ભાગ 4-A: CRM (પૂછપરછ → ફોલો-અપ → પ્રવેશ) + રેફરલ
//  crm/{શાખા}_{વર્ષ}      = { list: { lid: { n, m, std, sch, vil, src, ref:{sid,n}, st, nx, by, bn, at, up, log:[], sid, via } } }  ← 1 વાંચન
//  refBoard/{શાખા}_{વર્ષ} = { reward, camp:{t, until}, list: { G101: { n, q, j, rw } } }  ← વિદ્યાર્થીઓ પણ વાંચે (મોબાઇલ નંબર નહીં)
// =============================================================
import { db, doc, getDoc, setDoc, updateDoc, writeBatch, serverTimestamp } from "./fb.js";
import { $, $$, esc, S, isAdmin, toast, fail, busy, audit, page, ic, fmtD, ymd, waLink, modal, closeModal, buzz, chime, appUrl } from "./core.js";
import { ACADEMY } from "./config.js";
import { sendPush } from "./notify.js";

export const SRC = { office: "ઑફિસે આવ્યા", phone: "ફોન", insta: "Instagram", friend: "મિત્ર દ્વારા", ref: "ઓળખાણ (વિદ્યાર્થી)", pamph: "પત્રિકા", old: "જૂનો વિદ્યાર્થી", form: "ઓનલાઇન ફોર્મ" };
export const ST = { new: ["નવી", "blue"], think: ["વિચારશે", "warn"], visit: ["મુલાકાતે આવશે", "pink"], yes: ["પ્રવેશ લેશે", "ok"], joined: ["પ્રવેશ થયો ✓", "ok"], no: ["ના પાડી", "bad"] };
const OUT = [["noans", "📵", "ઉપાડ્યો નહીં", 1], ["think", "🤔", "વિચારશે", 3], ["visit", "🏫", "મુલાકાતે આવશે", 2], ["yes", "✅", "પ્રવેશ લેશે", 1], ["no", "❌", "ના પાડી", 0], ["other", "📝", "બીજું", 2]];
const STDS = ["7", "8", "9", "10", "11 સાયન્સ", "11 કોમર્સ", "12 સાયન્સ", "12 કોમર્સ"];
const crmRef = () => doc(db, "crm", `${S.branchId}_${S.year}`);
const boardRef = () => doc(db, "refBoard", `${S.branchId}_${S.year}`);
const rosterRef = () => doc(db, "rosters", `${S.branchId}_${S.year}`);
const arg = i => decodeURIComponent(location.hash.split("/")[i] || "");
const first = n => { const p = String(n || "").trim().split(/\s+/); return p.length > 1 ? p[1] : p[0]; };
const addD = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const tel = m => `tel:${String(m || "").replace(/\D/g, "").slice(-10)}`;
const norm10 = m => String(m || "").replace(/\D/g, "").slice(-10);
export const canCrm = () => isAdmin() || (["dataEntry", "receptionist", "accountant"].includes(S.me?.role) && S.profile?.noCrm !== true) || (S.me?.role === "teacher" && S.profile?.crm === true);
export const inviteLink = sid => appUrl().replace(/[^/]*$/, "") + `enquiry.html?b=${encodeURIComponent(S.branchId)}&r=${encodeURIComponent(sid)}`;
export const formLink = () => appUrl().replace(/[^/]*$/, "") + `enquiry.html?b=${encodeURIComponent(S.branchId)}`;

async function loadCrm() { const s = await getDoc(crmRef()); return s.exists() ? s.data().list || {} : {}; }
const leads = L => Object.entries(L).filter(([, x]) => x).map(([id, x]) => ({ id, ...x }));
const due = (x, today = ymd()) => !["joined", "no"].includes(x.st) && x.nx && x.nx <= today;

// રેફરલ બોર્ડ ફરી ગણો (CRM માંથી) — ઇનામ આપ્યાની નોંધ સાચવી રાખો
async function syncBoard(L) {
  const bs = await getDoc(boardRef()).catch(() => null), old = bs?.exists() ? bs.data().list || {} : {}, nw = {};
  Object.keys(old).forEach(k => { nw[k] = { ...old[k], q: 0, j: 0 }; });
  leads(L).forEach(x => { const r = x.ref?.sid; if (!r) return; nw[r] = nw[r] || { n: x.ref.n || r, q: 0, j: 0, rw: 0 }; nw[r].n = x.ref.n || nw[r].n; nw[r].q++; if (x.st === "joined") nw[r].j++; });
  await setDoc(boardRef(), { branchId: S.branchId, yearId: S.year, list: nw }, { merge: true });
}
// એક લીડ સાચવો
async function saveLead(id, data, logEntry) {
  const P = `list.${id}`, w = writeBatch(db), ref = crmRef();
  w.set(ref, { branchId: S.branchId, yearId: S.year }, { merge: true });
  const upd = {}; Object.entries(data).forEach(([k, v]) => { upd[`${P}.${k}`] = v; });
  upd[`${P}.up`] = Date.now();
  w.update(ref, upd);
  await w.commit();
  if (logEntry) { const L = await loadCrm(); const lg = [...(L[id]?.log || []), logEntry].slice(-30); await updateDoc(ref, { [`${P}.log`]: lg }); return { ...L, [id]: { ...L[id], log: lg } }; }
  return null;
}

// ================= CRM હોમ =================
page("crm", async v => {
  if (!canCrm()) { v.innerHTML = `<div class="empty">CRM ની પરવાનગી નથી. સંચાલકને વાત કરો.</div>`; return; }
  const L = leads(await loadCrm()), today = ymd(), ym = today.slice(0, 7);
  let f = sessionStorage.getItem("gv_crmf") || "today", q = "";
  const month = L.filter(x => ymd(new Date(x.at)).startsWith(ym)), joined = month.filter(x => x.st === "joined").length;
  const draw = () => {
    const by = { today: x => due(x), new: x => x.st === "new", think: x => x.st === "think", visit: x => x.st === "visit", yes: x => x.st === "yes", joined: x => x.st === "joined", no: x => x.st === "no", all: () => true };
    const list = L.filter(by[f]).filter(x => !q || String(x.n).includes(q) || norm10(x.m).includes(q.replace(/\D/g, "") || "~"))
      .sort((a, b) => f === "today" ? String(a.nx).localeCompare(String(b.nx)) : b.up - a.up);
    const cnt = k => L.filter(by[k]).length;
    v.innerHTML = `
      <div class="row-between"><h1 class="page-title" style="margin:0">પૂછપરછ (CRM)</h1><a class="btn primary" href="#/crm-new">${ic("plus", 18)} નવી</a></div>
      <div class="grid2 stat4">
        <div class="card"><span class="sub">આજના કૉલ</span><b>${cnt("today")}</b></div>
        <div class="card"><span class="sub">મુદત વીતી</span><b style="color:${L.filter(x => due(x) && x.nx < today).length ? "#DC2626" : "inherit"}">${L.filter(x => due(x) && x.nx < today).length}</b></div>
        <div class="card"><span class="sub">આ મહિને પૂછપરછ</span><b>${month.length}</b></div>
        <div class="card"><span class="sub">પ્રવેશ થયો</span><b style="color:#15803D">${joined}${month.length ? ` <small class="sub">• ${Math.round(joined * 100 / month.length)}%</small>` : ""}</b></div></div>
      <div class="hscroll">${[["today", "આજે"], ["new", "નવી"], ["think", "વિચારશે"], ["visit", "મુલાકાત"], ["yes", "પ્રવેશ લેશે"], ["joined", "પ્રવેશ થયો"], ["no", "ના પાડી"], ["all", "બધી"]]
        .map(([k, l]) => `<button type="button" class="chip ${f === k ? "on" : ""}" data-f="${k}">${l} ${cnt(k)}</button>`).join("")}</div>
      <label class="search">${ic("search", 20)}<span class="sr">શોધો</span><input id="cq" type="search" value="${esc(q)}" placeholder="નામ કે મોબાઇલથી શોધો" autocomplete="off"></label>
      <div class="card" style="gap:0">${list.map(x => { const late = due(x) && x.nx < today, d = late ? Math.round((new Date(today) - new Date(x.nx)) / 864e5) : 0;
        return `<div class="lrow"><a class="grow" href="#/lead/${encodeURIComponent(x.id)}"><b>${esc(x.n)}</b>
          <span class="sub" style="display:block">ધો. ${esc(x.std || "-")}${x.sch ? " • " + esc(x.sch) : ""} • ${esc(x.ref?.n ? "ઓળખાણ: " + x.ref.n : SRC[x.src] || "")}</span>
          <span class="pill ${late ? "bad" : ST[x.st]?.[1] || ""}">${late ? `${d} દિવસ મોડું` : esc(ST[x.st]?.[0] || "")}${(x.log || []).length ? ` • ${(x.log || []).length} કૉલ` : ""}</span></a>
          ${x.m ? `<a class="icon-btn call" href="${tel(x.m)}" aria-label="${esc(x.n)} ને કૉલ">${ic("phone", 20)}</a>` : ""}</div>`; }).join("")
        || `<p class="muted" style="margin:10px 0">${f === "today" ? "આજે કોઈ કૉલ બાકી નથી 🎉" : "કોઈ નથી."}</p>`}</div>
      <div class="grid2"><a class="btn line" href="#/refs">🏅 રેફરલ</a><a class="btn line" href="#/crm-rep">${ic("chart", 18)} રિપોર્ટ</a></div>
      <button type="button" class="btn line big" id="flink">${ic("wa", 18)} પૂછપરછ ફોર્મની લિંક મોકલો</button>`;
    $$("[data-f]", v).forEach(c => c.onclick = () => { f = c.dataset.f; sessionStorage.setItem("gv_crmf", f); draw(); });
    $("#cq").oninput = e => { q = e.target.value.trim(); const pos = e.target.selectionStart; draw(); const i = $("#cq"); i.focus(); i.setSelectionRange(pos, pos); };
    $("#flink").onclick = () => window.open(`https://wa.me/?text=${encodeURIComponent(`${ACADEMY.name}\n${ACADEMY.posterLine || ""}\nપ્રવેશની માહિતી માટે આ ફોર્મ ભરો 👇\n${formLink()}\n📞 ${ACADEMY.phone}`)}`, "_blank");
  };
  draw();
});

// ================= નવી / સુધારો =================
page("crm-new", async v => {
  if (!canCrm()) { location.hash = "#/home"; return; }
  const eid = arg(2), [L, rs] = await Promise.all([loadCrm(), getDoc(rosterRef()).catch(() => null)]);
  const kids = Object.entries((rs?.exists() && rs.data().list) || {}).map(([id, x]) => ({ id, ...x })).filter(k => k.x !== "cancelled");
  const old = eid ? L[eid] : null;
  if (eid && !old) { v.innerHTML = `<div class="empty">પૂછપરછ મળી નહીં.</div>`; return; }
  let std = old?.std || "", src = old?.src || "office", ref = old?.ref || null, nx = old?.nx || addD(1);
  const draw = () => {
    v.innerHTML = `
      <div class="row-between"><a class="btn line" href="${eid ? `#/lead/${encodeURIComponent(eid)}` : "#/crm"}">${ic("back", 18)} પાછા</a></div>
      <h1 class="page-title" style="margin:0">${old ? "પૂછપરછમાં ફેરફાર" : "નવી પૂછપરછ"}</h1>
      <form id="lf" class="card form" novalidate>
        <div class="field"><label for="ln">વિદ્યાર્થીનું નામ</label><input id="ln" value="${esc(old?.n || "")}" placeholder="અટક નામ પિતાનું નામ" autocomplete="off"></div>
        <div class="field"><label for="lm">વાલીનો મોબાઇલ</label><input id="lm" type="tel" inputmode="numeric" maxlength="14" value="${esc(old?.m || "")}" placeholder="10 આંકડા"><span id="dup" class="hint"></span></div>
        <div class="field"><span class="lbl">ધોરણ</span><div class="chips">${STDS.map(s => `<button type="button" class="chip ${std === s ? "on" : ""}" data-std="${esc(s)}">${esc(s)}</button>`).join("")}</div></div>
        <div class="grid2"><div class="field"><label for="ls">શાળા</label><input id="ls" value="${esc(old?.sch || "")}" placeholder="શાળાનું નામ"></div>
          <div class="field"><label for="lv">ગામ</label><input id="lv" value="${esc(old?.vil || "")}" placeholder="ગામ / વિસ્તાર"></div></div>
        <div class="field"><span class="lbl">ક્યાંથી જાણ થઈ?</span><div class="chips">${Object.entries(SRC).filter(([k]) => k !== "form" || src === "form").map(([k, l]) => `<button type="button" class="chip ${src === k ? "on" : ""}" data-src="${k}">${l}</button>`).join("")}</div></div>
        ${src === "friend" || src === "ref" ? `<div class="field"><span class="lbl">કોણ લાવ્યું? <span class="sub">(આપણો વિદ્યાર્થી હોય તો શોધો, નહીં તો નામ લખો)</span></span>
          ${ref ? `<div class="chips"><button type="button" class="chip on" id="rclr">${ref.sid ? "🎓 " : ""}${esc(ref.n)} ✕</button></div>` : `<label class="search">${ic("search", 20)}<span class="sr">શોધો</span><input id="rq" type="search" placeholder="વિદ્યાર્થીનું નામ" autocomplete="off"></label><div id="rres"></div>`}</div>` : ""}
        <div class="field"><span class="lbl">ફરી કૉલ ક્યારે?</span><div class="chips">${[[addD(0), "આજે"], [addD(1), "કાલે"], [addD(3), "3 દિવસ"], [addD(7), "1 અઠવાડિયું"]].map(([d, l]) => `<button type="button" class="chip ${nx === d ? "on" : ""}" data-nx="${d}">${l}</button>`).join("")}</div>
          <input id="lnx" type="date" value="${esc(nx)}" style="margin-top:8px"></div>
        <div class="field"><label for="lt">નોંધ <span class="sub">(વૈકલ્પિક)</span></label><textarea id="lt" rows="2" placeholder="દા.ત. ફી વિશે પૂછ્યું, પપ્પા સાથે વાત કરશે">${esc(old?.note || "")}</textarea></div>
        <button class="btn primary big" type="submit">${ic("check", 18)} સાચવો</button>
      </form>`;
    const keep = () => ({ n: $("#ln").value, m: $("#lm").value, s: $("#ls").value, vl: $("#lv").value, t: $("#lt").value });
    const put = k => { $("#ln").value = k.n; $("#lm").value = k.m; $("#ls").value = k.s; $("#lv").value = k.vl; $("#lt").value = k.t; dupCheck(); };
    const redraw = () => { const k = keep(); draw(); put(k); };
    $$("[data-std]", v).forEach(c => c.onclick = () => { std = c.dataset.std; $$("[data-std]", v).forEach(x => x.classList.toggle("on", x === c)); });
    $$("[data-src]", v).forEach(c => c.onclick = () => { src = c.dataset.src; if (src !== "friend" && src !== "ref") ref = null; redraw(); });
    $$("[data-nx]", v).forEach(c => c.onclick = () => { nx = c.dataset.nx; $("#lnx").value = nx; $$("[data-nx]", v).forEach(x => x.classList.toggle("on", x === c)); });
    $("#lnx").onchange = e => { nx = e.target.value; $$("[data-nx]", v).forEach(x => x.classList.toggle("on", x.dataset.nx === nx)); };
    $("#rclr", v)?.addEventListener("click", () => { ref = null; redraw(); });
    const rq = $("#rq", v);
    if (rq) rq.oninput = () => { const s = rq.value.trim();
      const r = s ? kids.filter(k => String(k.n).includes(s)).slice(0, 6) : [];
      $("#rres", v).innerHTML = r.map(k => `<button type="button" class="srow" data-rk="${esc(k.id)}" style="width:100%;background:none;border:0;border-top:1px solid var(--line);text-align:left;font:inherit"><span class="grow"><b>${esc(k.n)}</b><span class="sub" style="display:block">${esc(k.bn || "")}</span></span>${ic("plus", 18)}</button>`).join("")
        + (s ? `<button type="button" class="btn line" id="rfree" style="margin-top:6px">"${esc(s)}" (બહારની વ્યક્તિ) તરીકે રાખો</button>` : "");
      $$("[data-rk]", v).forEach(b => b.onclick = () => { const k = kids.find(x => x.id === b.dataset.rk); ref = { sid: k.id, n: k.n }; redraw(); });
      $("#rfree", v)?.addEventListener("click", () => { ref = { sid: "", n: s }; redraw(); });
    };
    const dupCheck = () => { const m = norm10($("#lm").value), el = $("#dup");
      const d = m.length === 10 ? leads(L).find(x => x.id !== eid && norm10(x.m) === m) : null;
      const s = m.length === 10 ? kids.find(k => norm10(k.m) === m) : null;
      el.innerHTML = d ? `⚠️ આ નંબર પહેલેથી છે: <a href="#/lead/${encodeURIComponent(d.id)}"><b>${esc(d.n)}</b> (${esc(ST[d.st]?.[0] || "")})</a>` : s ? `ℹ️ આ નંબર આપણા વિદ્યાર્થી <b>${esc(s.n)}</b> ના વાલીનો છે (ભાઈ/બહેન હશે).` : "";
      el.classList.toggle("warn", !!d); };
    $("#lm").oninput = dupCheck; dupCheck();
    $("#lf").onsubmit = ev => {
      ev.preventDefault();
      const n = $("#ln").value.trim(), m = norm10($("#lm").value);
      if (n.length < 2) return toast("વિદ્યાર્થીનું નામ લખો.", true);
      if (!/^[6-9]\d{9}$/.test(m)) return toast("વાલીનો 10 આંકડાનો સાચો મોબાઇલ લખો.", true);
      if (!std) return toast("ધોરણ પસંદ કરો.", true);
      const dupe = leads(L).find(x => x.id !== eid && norm10(x.m) === m && String(x.n).trim() === n);
      if (dupe) { toast("આ પૂછપરછ પહેલેથી છે.", true); location.hash = `#/lead/${encodeURIComponent(dupe.id)}`; return; }
      busy($('#lf [type="submit"]'), async () => {
        const id = eid || `a${Date.now().toString(36)}`;
        const data = { n, m, std, sch: $("#ls").value.trim(), vil: $("#lv").value.trim(), src, ref: ref || null, nx: $("#lnx").value || nx, note: $("#lt").value.trim(),
          ...(old ? {} : { st: "new", by: S.me.loginId, bn: S.profile?.name || "", at: Date.now(), log: [], via: "app" }) };
        try { await saveLead(id, data); L[id] = { ...(old || {}), ...data }; if (ref?.sid || old?.ref?.sid) await syncBoard(L); }
        catch (e2) { return fail(e2); }
        audit(old ? "crm.edit" : "crm.add", id, n); buzz("done");
        toast(old ? "સુધારો સચવાયો." : "પૂછપરછ સચવાઈ.");
        location.hash = `#/lead/${encodeURIComponent(id)}${old ? "" : "/new"}`;
      });
    };
  };
  draw();
});

// ================= એક પૂછપરછ: કૉલ, પરિણામ, ઇતિહાસ =================
page("lead", async v => {
  if (!canCrm()) { location.hash = "#/home"; return; }
  const id = arg(2), fresh = arg(3) === "new";
  let L = await loadCrm(), x = L[id];
  if (!x) { v.innerHTML = `<div class="empty">પૂછપરછ મળી નહીં.</div>`; return; }
  let out = "", nx = "";
  const info = () => `${ACADEMY.name}${ACADEMY.address ? "\n📍 " + ACADEMY.address : ""}\nનમસ્તે! ${first(x.n)} ના પ્રવેશની પૂછપરછ માટે આભાર 🙏\n${ACADEMY.posterLine || ""}\nવધુ માહિતી માટે ઑફિસે પધારો અથવા ફોન કરો: 📞 ${ACADEMY.phone}`;
  const draw = () => {
    const lg = [...(x.log || [])].reverse();
    v.innerHTML = `
      <div class="row-between"><a class="btn line" href="#/crm">${ic("back", 18)} CRM</a><a class="btn line" href="#/crm-new/${encodeURIComponent(id)}">${ic("edit", 18)} ફેરફાર</a></div>
      <div class="card" style="gap:6px"><div class="row-between"><h1 style="margin:0;font-size:22px">${esc(x.n)}</h1><span class="pill ${ST[x.st]?.[1] || ""}">${esc(ST[x.st]?.[0] || "")}</span></div>
        <span class="sub">ધો. ${esc(x.std || "-")}${x.sch ? " • " + esc(x.sch) : ""}${x.vil ? " • " + esc(x.vil) : ""}</span>
        <span class="sub">${esc(SRC[x.src] || "")}${x.ref?.n ? ` • લાવ્યું: <b>${esc(x.ref.n)}</b>` : ""} • નોંધ: ${esc(x.bn || "")}, ${fmtD(ymd(new Date(x.at)))}</span>
        ${x.note ? `<p class="dtxt" style="margin-top:4px">${esc(x.note)}</p>` : ""}
        ${x.nx && !["joined", "no"].includes(x.st) ? `<span class="sub">📅 ફરી કૉલ: <b>${x.nx === ymd() ? "આજે" : fmtD(x.nx)}</b></span>` : ""}
        <div class="grid2" style="margin-top:6px"><a class="btn primary" href="${tel(x.m)}">${ic("phone", 18)} કૉલ ${esc(norm10(x.m))}</a>
          <a class="btn wa" target="_blank" rel="noopener" href="${waLink(x.m, info())}">${ic("wa", 18)} માહિતી મોકલો</a></div></div>
      ${x.st === "joined" ? `<div class="card center"><b>🎉 પ્રવેશ થયો</b>${x.sid ? `<a class="btn line" href="#/student/${encodeURIComponent(x.sid)}">વિદ્યાર્થીની ફાઇલ (${esc(x.sid)})</a>` : ""}</div>`
        : `<div class="card" style="gap:8px"><h2>${fresh && !(x.log || []).length ? "કૉલ કર્યો? પરિણામ લખો" : "કૉલનું પરિણામ"}</h2>
          <div class="outs">${OUT.map(([k, e, l]) => `<button type="button" class="ob ${out === k ? "on" : ""} ${k === "yes" ? "okb" : k === "no" ? "nob" : ""}" data-o="${k}">${e} ${l}</button>`).join("")}</div>
          ${out ? `<div class="field"><label for="on">નોંધ</label><textarea id="on" rows="2" placeholder="દા.ત. શનિવારે ડેમો ક્લાસમાં આવશે"></textarea></div>
            ${out !== "no" ? `<div class="field"><span class="lbl">ફરી કૉલ</span><div class="chips">${[[addD(1), "કાલે"], [addD(3), "3 દિવસ"], [addD(7), "1 અઠવાડિયું"]].map(([d, l]) => `<button type="button" class="chip ${nx === d ? "on" : ""}" data-nx="${d}">${l}</button>`).join("")}</div>
              <input id="onx" type="date" value="${esc(nx)}" style="margin-top:8px"></div>` : ""}
            <button type="button" class="btn primary big" id="osave">${ic("check", 18)} સાચવો</button>` : ""}
          <a class="btn line big" href="#/admit/L:${encodeURIComponent(id)}">${ic("plus", 18)} પ્રવેશ કરો (ફોર્મ ભરેલું ખૂલશે)</a></div>`}
      <div class="card" style="gap:0"><h2 style="margin-bottom:4px">ઇતિહાસ • ${lg.length} કૉલ</h2>
        ${lg.map(g => `<div class="lgrow"><span class="nic" style="width:34px;height:34px;font-size:17px">${OUT.find(o => o[0] === g.o)?.[1] || "📝"}</span>
          <span class="grow"><b>${esc(OUT.find(o => o[0] === g.o)?.[2] || g.o)}</b>${g.note ? ` — ${esc(g.note)}` : ""}<span class="sub" style="display:block">${fmtD(ymd(new Date(g.at)))} • ${esc(g.bn || "")}</span></span></div>`).join("")
          || `<p class="muted" style="margin:8px 0">હજુ કોઈ કૉલ નથી.</p>`}</div>
      ${isAdmin() ? `<button type="button" class="btn line danger" id="ldel">પૂછપરછ કાઢી નાખો</button>` : ""}`;
    $$("[data-o]", v).forEach(b => b.onclick = () => { out = b.dataset.o; nx = out === "no" ? "" : addD(OUT.find(o => o[0] === out)[3]); draw(); $("#on", v)?.focus(); });
    $$("[data-nx]", v).forEach(c => c.onclick = () => { nx = c.dataset.nx; $("#onx").value = nx; $$("[data-nx]", v).forEach(y => y.classList.toggle("on", y === c)); });
    $("#onx", v)?.addEventListener("change", e => { nx = e.target.value; });
    $("#osave", v)?.addEventListener("click", e => busy(e.currentTarget, async () => {
      const note = $("#on", v)?.value.trim() || "";
      const st = out === "noans" || out === "other" ? (x.st === "new" ? "new" : x.st) : out;
      try {
        const L2 = await saveLead(id, { st, nx: out === "no" ? "" : nx }, { at: Date.now(), by: S.me.loginId, bn: S.profile?.name || "", o: out, note });
        L = L2 || L; x = { ...L[id], st, nx: out === "no" ? "" : nx };
      } catch (e2) { return fail(e2); }
      audit("crm.call", id, out); buzz("done"); toast("સચવાયું.");
      out = ""; nx = "";
      location.hash = "#/crm";
    }));
    $("#ldel", v)?.addEventListener("click", () => {
      const d = modal("પૂછપરછ કાઢી નાખવી છે?", `<p>${esc(x.n)}</p><div class="grid2"><button type="button" class="btn line" id="dn">રહેવા દો</button><button type="button" class="btn primary danger" id="dy">હા, કાઢો</button></div>`);
      $("#dn", d).onclick = () => closeModal();
      $("#dy", d).onclick = () => busy($("#dy", d), async () => {
        try { await updateDoc(crmRef(), { [`list.${id}`]: null }); const L3 = await loadCrm(); if (x.ref?.sid) await syncBoard(L3); } catch (e2) { return fail(e2); }
        audit("crm.delete", id, x.n); closeModal(); toast("કાઢી નાખી."); location.hash = "#/crm";
      });
    });
  };
  draw();
});

// ================= પ્રવેશ થયો (students.js માંથી બોલાવાય) =================
export async function crmJoined(leadId, sid, name) {
  try {
    await updateDoc(crmRef(), { [`list.${leadId}.st`]: "joined", [`list.${leadId}.sid`]: sid, [`list.${leadId}.nx`]: "", [`list.${leadId}.up`]: Date.now() });
    const L = await loadCrm(), x = L[leadId];
    if (x?.ref?.sid) {
      await syncBoard(L);
      sendPush([{ to: { sids: [x.ref.sid] }, tag: `refj_${leadId}`, link: "#/refer", title: "🎉 આભાર!",
        body: `અભિનંદન! તમારા મિત્ર ${first(name)} એ ગાંડિવ એકેડેમીમાં પ્રવેશ લીધો છે. તમારા સહકાર બદલ ખૂબ આભાર 🙏` }]);
    }
  } catch (e) { console.warn("crmJoined", e); }
}
// પ્રવેશ ફોર્મમાં પહેલેથી ભરવા માટે
export async function leadPrefill(leadId) { const L = await loadCrm().catch(() => ({})); return L[leadId] ? { id: leadId, ...L[leadId] } : null; }
// ડેશબોર્ડ માટે: આજના કૉલ
export async function crmDue() { if (!canCrm()) return 0; try { return leads(await loadCrm()).filter(x => due(x)).length; } catch { return 0; } }

// ================= રિપોર્ટ =================
page("crm-rep", async v => {
  if (!canCrm()) { location.hash = "#/home"; return; }
  const L = leads(await loadCrm());
  let ym = sessionStorage.getItem("gv_crmym") || ymd().slice(0, 7);
  const draw = () => {
    const M = ym === "all" ? L : L.filter(x => ymd(new Date(x.at)).startsWith(ym));
    const bySrc = {}; M.forEach(x => { const k = x.src || "office"; bySrc[k] = bySrc[k] || { q: 0, j: 0 }; bySrc[k].q++; if (x.st === "joined") bySrc[k].j++; });
    const calls = {}; L.forEach(x => (x.log || []).forEach(g => { if (ym !== "all" && !ymd(new Date(g.at)).startsWith(ym)) return; calls[g.bn || g.by] = calls[g.bn || g.by] || { c: 0, j: 0 }; calls[g.bn || g.by].c++; if (g.o === "yes") calls[g.bn || g.by].j++; }));
    const mx = Math.max(1, ...Object.values(bySrc).map(s => s.q));
    const months = [...new Set(L.map(x => ymd(new Date(x.at)).slice(0, 7)))].sort().reverse();
    v.innerHTML = `
      <div class="row-between"><a class="btn line" href="#/crm">${ic("back", 18)} CRM</a></div>
      <h1 class="page-title" style="margin:0">પૂછપરછ રિપોર્ટ</h1>
      <div class="hscroll">${[...new Set([ymd().slice(0, 7), ...months])].map(m => `<button type="button" class="chip ${ym === m ? "on" : ""}" data-ym="${m}">${["જાન્યુ", "ફેબ્રુ", "માર્ચ", "એપ્રિ", "મે", "જૂન", "જુલા", "ઑગ", "સપ્ટે", "ઑક્ટો", "નવે", "ડિસે"][+m.slice(5) - 1]} ${m.slice(0, 4)}</button>`).join("")}
        <button type="button" class="chip ${ym === "all" ? "on" : ""}" data-ym="all">આખું વર્ષ</button></div>
      <div class="grid2 stat4"><div class="card"><span class="sub">પૂછપરછ</span><b>${M.length}</b></div><div class="card"><span class="sub">પ્રવેશ</span><b style="color:#15803D">${M.filter(x => x.st === "joined").length}</b></div></div>
      <div class="card" style="gap:8px"><h2>ક્યાંથી કેટલા</h2>
        ${Object.entries(bySrc).sort((a, b) => b[1].q - a[1].q).map(([k, s]) => `<div><div class="row-between"><span>${esc(SRC[k] || k)}</span><span class="sub">${s.q} → <b style="color:#15803D">${s.j} પ્રવેશ</b></span></div>
          <div class="pgb" style="margin-top:4px"><i style="width:${s.q * 100 / mx}%;background:var(--role)"></i></div></div>`).join("") || `<p class="muted">કોઈ નથી.</p>`}</div>
      <div class="card" style="gap:0"><h2 style="margin-bottom:4px">કોણે કેટલા કૉલ</h2>
        ${Object.entries(calls).sort((a, b) => b[1].c - a[1].c).map(([n, c]) => `<div class="srow" style="min-height:44px"><span class="grow">${esc(n)}</span><span class="sub">${c.c} કૉલ • ${c.j} "પ્રવેશ લેશે"</span></div>`).join("") || `<p class="muted" style="margin:8px 0">કોઈ કૉલ નથી.</p>`}</div>`;
    $$("[data-ym]", v).forEach(c => c.onclick = () => { ym = c.dataset.ym; sessionStorage.setItem("gv_crmym", ym); draw(); });
  };
  draw();
});

// ================= રેફરલ: સંચાલક =================
page("refs", async v => {
  if (!canCrm()) { location.hash = "#/refer"; return; }
  const bs = await getDoc(boardRef()).catch(() => null), B = bs?.exists() ? bs.data() : {};
  const list = Object.entries(B.list || {}).map(([sid, x]) => ({ sid, ...x })).filter(x => x.q).sort((a, b) => b.j - a.j || b.q - a.q);
  v.innerHTML = `
    <div class="row-between"><a class="btn line" href="#/crm">${ic("back", 18)} CRM</a></div>
    <h1 class="page-title" style="margin:0">🏅 રેફરલ સ્ટાર્સ</h1>
    <div class="card" style="gap:0">${list.map((x, i) => `<div class="srow"><span class="rk" style="min-width:30px;text-align:center;font-weight:800">${i < 3 && x.j ? ["🥇", "🥈", "🥉"][i] : i + 1}</span>
      <span class="grow"><b>${esc(x.n)}</b><span class="sub" style="display:block">${x.q} પૂછપરછ • <b style="color:#15803D">${x.j} પ્રવેશ</b></span></span>
      ${x.j && isAdmin() ? `<button type="button" class="pill ${x.rw ? "ok" : "warn"}" data-rw="${esc(x.sid)}" style="border:0;font:inherit;font-size:12px">${x.rw ? "ઇનામ આપ્યું ✓" : "ઇનામ બાકી"}</button>` : x.j ? `<span class="pill ${x.rw ? "ok" : "warn"}">${x.rw ? "ઇનામ આપ્યું ✓" : "ઇનામ બાકી"}</span>` : ""}</div>`).join("")
      || `<p class="muted" style="margin:10px 0">હજુ કોઈ રેફરલ નથી. પૂછપરછમાં "મિત્ર દ્વારા / ઓળખાણ" પસંદ કરીને લાવનાર વિદ્યાર્થી પસંદ કરો.</p>`}</div>
    ${isAdmin() ? `<form id="rwf" class="card form" novalidate><h2>ઇનામ અને ઝુંબેશ <span class="sub">(વિદ્યાર્થીઓને દેખાશે)</span></h2>
      <div class="field"><label for="rwt">દરેક પ્રવેશ પર ઇનામ</label><input id="rwt" value="${esc(B.reward || "")}" placeholder="દા.ત. ₹500 ફીમાં રાહત"></div>
      <div class="field"><label for="cpt">ઝુંબેશ (વૈકલ્પિક)</label><input id="cpt" value="${esc(B.camp?.t || "")}" placeholder="દા.ત. નવું સત્ર: દરેક પ્રવેશ પર ખાસ ભેટ"></div>
      <div class="field"><label for="cpu">ઝુંબેશ ક્યાં સુધી</label><input id="cpu" type="date" value="${esc(B.camp?.until || "")}"></div>
      <button class="btn primary" type="submit">સાચવો</button></form>` : ""}`;
  $$("[data-rw]", v).forEach(b => b.onclick = async () => {
    if (b.disabled) return; b.disabled = true;
    const sid = b.dataset.rw, x = list.find(y => y.sid === sid), now = x.rw ? 0 : 1;
    try { await updateDoc(boardRef(), { [`list.${sid}.rw`]: now }); } catch (e) { b.disabled = false; return fail(e); }
    audit(now ? "ref.reward" : "ref.unreward", sid, x.n); x.rw = now; b.disabled = false;
    b.textContent = now ? "ઇનામ આપ્યું ✓" : "ઇનામ બાકી"; b.className = `pill ${now ? "ok" : "warn"}`; buzz("tap");
  });
  $("#rwf", v)?.addEventListener("submit", e => { e.preventDefault(); busy($('#rwf [type="submit"]'), async () => {
    try { await setDoc(boardRef(), { branchId: S.branchId, yearId: S.year, reward: $("#rwt").value.trim(), camp: { t: $("#cpt").value.trim(), until: $("#cpu").value } }, { merge: true }); }
    catch (e2) { return fail(e2); }
    audit("ref.settings", S.branchId); toast("સચવાયું. વિદ્યાર્થીઓના હોમ પર દેખાશે."); buzz("done");
  }); });
});

// ================= રેફરલ: વિદ્યાર્થી/વાલી =================
async function board() { try { const s = await getDoc(boardRef()); return s.exists() ? s.data() : {}; } catch { return {}; } }
const campOn = B => B.camp?.t && (!B.camp.until || B.camp.until >= ymd());
// હોમ પર "મિત્રને લાવો" કાર્ડ (વાલી: પહેલું બાળક)
export async function referCardHtml(sid) {
  if (!sid) return "";
  const B = await board(), me = B.list?.[sid] || { q: 0, j: 0 };
  return `<a class="card refcard" href="#/refer/${encodeURIComponent(sid)}"><div class="row-between"><h2>🎁 મિત્રને ગાંડિવમાં લાવો</h2>${ic("chev", 18)}</div>
    ${campOn(B) ? `<span class="camp">📣 ${esc(B.camp.t)}${B.camp.until ? ` • ${fmtD(B.camp.until)} સુધી` : ""}</span>` : ""}
    ${B.reward ? `<span>તમારો મિત્ર પ્રવેશ લે એટલે તમને મળશે: <b>${esc(B.reward)}</b></span>` : `<span>તમારા મિત્રોને ગાંડિવ એકેડેમી વિશે જણાવો.</span>`}
    ${me.q ? `<span class="sub">તમારા દ્વારા: ${me.q} પૂછપરછ • <b style="color:#15803D">${me.j} પ્રવેશ ✓</b></span>` : ""}</a>`;
}
page("refer", async v => {
  const sid = arg(2) || (S.me.role === "student" ? S.me.loginId : (S.profile?.childIds || [])[0]);
  const [B, ss] = await Promise.all([board(), getDoc(doc(db, "students", sid)).catch(() => null)]);
  const s = ss?.exists() ? ss.data() : { name: sid }, me = B.list?.[sid] || { q: 0, j: 0 };
  const top = Object.entries(B.list || {}).map(([k, x]) => ({ k, ...x })).filter(x => x.j).sort((a, b) => b.j - a.j).slice(0, 5);
  const nm = first(s.name), parent = S.me.role === "parent";
  const msg = `નમસ્તે! ${parent ? `મારું બાળક ${nm}` : `હું ${nm}`} ${ACADEMY.name}, મહુવામાં ભણ${parent ? "ે" : "ું"} છ${parent ? "ે" : "ું"}. અહીં ખૂબ સરસ ભણાવે છે 👍\n${ACADEMY.posterLine || ""}\nમાહિતી માટે આ ફોર્મ ભરો 👇\n${inviteLink(sid)}\n📞 ${ACADEMY.phone}`;
  v.innerHTML = `
    <div class="row-between"><a class="btn line" href="#/home">${ic("back", 18)} હોમ</a></div>
    <h1 class="page-title" style="margin:0">🎁 મિત્રને ગાંડિવમાં લાવો</h1>
    <div class="card refcard" style="gap:8px">
      ${campOn(B) ? `<span class="camp">📣 ${esc(B.camp.t)}${B.camp.until ? ` • ${fmtD(B.camp.until)} સુધી` : ""}</span>` : ""}
      ${B.reward ? `<span style="font-size:16px">તમારો મિત્ર પ્રવેશ લે એટલે તમને મળશે: <b>${esc(B.reward)}</b></span>` : ""}
      <span class="sub">તમારા દ્વારા: ${me.q} પૂછપરછ • <b style="color:#15803D">${me.j} પ્રવેશ</b>${me.j && me.rw ? " • ઇનામ મળ્યું ✓" : ""}</span>
      ${me.j < 3 ? `<div class="pgb"><i style="width:${Math.round(me.j * 100 / 3)}%;background:#F59E0B"></i></div><span class="sub">${3 - me.j} મિત્ર વધુ લાવો એટલે 🥉 રેફરલ સ્ટાર</span>` : `<span>🌟 તમે રેફરલ સ્ટાર છો! ખૂબ આભાર.</span>`}
      <a class="btn wa big" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">${ic("wa", 18)} WhatsApp પર આમંત્રણ મોકલો</a>
      <button type="button" class="btn line big" id="invp">${ic("cam", 18)} ફોટા સાથેનું આમંત્રણ પોસ્ટર (સ્ટેટ્સ માટે)</button>
      <span class="hint">તમારો મિત્ર આ લિંકથી ફોર્મ ભરે એટલે આપમેળે તમારા નામે નોંધાશે.</span></div>
    ${top.length ? `<div class="card" style="gap:0"><h2 style="margin-bottom:4px">🏅 રેફરલ સ્ટાર્સ</h2>${top.map((x, i) => `<div class="srow" style="min-height:44px"><span class="rk" style="min-width:30px;text-align:center">${["🥇", "🥈", "🥉", "4", "5"][i]}</span><span class="grow">${esc(first(x.n))} ${esc(String(x.n).split(" ")[0])}</span><span class="sub">${x.j} મિત્ર</span></div>`).join("")}</div>` : ""}`;
  $("#invp").onclick = e => busy(e.currentTarget, async () => {
    const [{ invitePoster, posterModal }, ps] = await Promise.all([import("./toppers.js"), getDoc(doc(db, "photos", sid)).catch(() => null)]);
    const photo = ps?.exists() ? ps.data().data : "";
    await posterModal({ title: "આમંત્રણ પોસ્ટર", hasPhoto: !!photo, adjKey: "gv_badj_" + sid, fileName: `ગાંડિવ_આમંત્રણ_${nm}`, text: msg,
      build: async (kind, adj) => [await invitePoster(kind, { name: `${nm} ${String(s.name).split(" ")[0]}`, std: s.std, photo, adj })] });
  });
});
