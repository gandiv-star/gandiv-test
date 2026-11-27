// =============================================================
//  ફેઝ 1B ભાગ 4-A: CRM (પૂછપરછ → ફોલો-અપ → પ્રવેશ) + રેફરલ
//  crm/{શાખા}_{વર્ષ}      = { list: { lid: { n, m, std, sch, vil, src, ref:{sid,n}, st, nx, by, bn, at, up, log:[], sid, via } } }  ← 1 વાંચન
//  demos/{શાખા}_{વર્ષ}    = { list: { lid: { n, bid, bn, d, att } } }  ← શિક્ષક હાજરી પાનાં પર "આવ્યો/ન આવ્યો" (મોબાઇલ નંબર નહીં)
//  refBoard/{શાખા}_{વર્ષ} = { reward, camp:{t, until}, list: { G101: { n, q, j, rw } } }  ← વિદ્યાર્થીઓ પણ વાંચે (મોબાઇલ નંબર નહીં)
// =============================================================
import { db, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch, collection, query, where } from "./fb.js";
import { $, $$, esc, S, isAdmin, toast, fail, busy, audit, page, ic, fmtD, ymd, waLink, modal, closeModal, buzz, chime, appUrl } from "./core.js";
import { ACADEMY } from "./config.js";
import { sendPush } from "./notify.js";

export const SRC = { office: "ઑફિસે આવ્યા", phone: "ફોન", insta: "Instagram", friend: "મિત્ર દ્વારા", ref: "ઓળખાણ (વિદ્યાર્થી)", pamph: "પત્રિકા", qr: "QR પોસ્ટર", old: "જૂનો વિદ્યાર્થી", form: "ઓનલાઇન ફોર્મ" };
export const ST = { new: ["નવી", "blue"], think: ["વિચારશે", "warn"], demo: ["ડેમો ક્લાસ", "pink"], visit: ["મુલાકાતે આવશે", "pink"], yes: ["પ્રવેશ લેશે", "ok"], joined: ["પ્રવેશ થયો ✓", "ok"], no: ["ના પાડી", "bad"] };
const OUT = [["noans", "📵", "ઉપાડ્યો નહીં", 1], ["think", "🤔", "વિચારશે", 3], ["demo", "🎓", "ડેમો ક્લાસ", 1], ["visit", "🏫", "મુલાકાતે આવશે", 2], ["yes", "✅", "પ્રવેશ લેશે", 1], ["no", "❌", "ના પાડી", 0], ["other", "📝", "બીજું", 2]];
export const WHY = { fee: "ફી વધારે", inst: "બીજે જોડાયા", far: "દૂર પડે", time: "સમય ન ફાવે", other: "બીજું" };
const GDAY = ["રવિવાર", "સોમવાર", "મંગળવાર", "બુધવાર", "ગુરુવાર", "શુક્રવાર", "શનિવાર"];
const dayName = d => GDAY[new Date(d + "T12:00").getDay()];
const rupee = n => "₹" + Number(n || 0).toLocaleString("en-IN");
const STDS = ["7", "8", "9", "10", "11 સાયન્સ", "11 કોમર્સ", "12 સાયન્સ", "12 કોમર્સ"];
const crmRef = () => doc(db, "crm", `${S.branchId}_${S.year}`);
const boardRef = () => doc(db, "refBoard", `${S.branchId}_${S.year}`);
const demoRef = () => doc(db, "demos", `${S.branchId}_${S.year}`);
async function loadDemos() { try { const s = await getDoc(demoRef()); return s.exists() ? s.data().list || {} : {}; } catch { return {}; } }
async function loadBatches() { const q = await getDocs(query(collection(db, "batches"), where("branchId", "==", S.branchId), where("yearId", "==", S.year))); return q.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => b.active !== false).sort((a, b) => String(a.name).localeCompare(String(b.name), "gu")); }
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
  const [L0, D] = await Promise.all([loadCrm(), loadDemos()]), L = leads(L0), today = ymd(), ym = today.slice(0, 7), tmr = addD(1);
  const demosOn = d => Object.entries(D).filter(([lid, y]) => y && y.d === d && L0[lid] && L0[lid].st !== "no").map(([lid, y]) => ({ lid, ...y, m: L0[lid].m }));
  let f = sessionStorage.getItem("gv_crmf") || "today", q = "";
  const month = L.filter(x => ymd(new Date(x.at)).startsWith(ym)), joined = month.filter(x => x.st === "joined").length;
  const draw = () => {
    const by = { today: x => due(x), new: x => x.st === "new", think: x => x.st === "think", demo: x => x.st === "demo", visit: x => x.st === "visit", yes: x => x.st === "yes", joined: x => x.st === "joined", no: x => x.st === "no", all: () => true };
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
      <div class="hscroll">${[["today", "આજે"], ["new", "નવી"], ["think", "વિચારશે"], ["demo", "ડેમો"], ["visit", "મુલાકાત"], ["yes", "પ્રવેશ લેશે"], ["joined", "પ્રવેશ થયો"], ["no", "ના પાડી"], ["all", "બધી"]]
        .map(([k, l]) => `<button type="button" class="chip ${f === k ? "on" : ""}" data-f="${k}">${l} ${cnt(k)}</button>`).join("")}</div>
      ${[[today, "આજે"], [tmr, "કાલે"]].map(([d, l]) => { const ds = demosOn(d); return ds.length ? `<div class="card democard" style="gap:0"><h2 style="margin-bottom:2px">🎓 ${l} ${ds.length} ડેમો ક્લાસ</h2>
        ${ds.map(y => `<div class="lrow"><a class="grow" href="#/lead/${encodeURIComponent(y.lid)}"><b>${esc(y.n)}</b><span class="sub" style="display:block">${esc(y.bn)}${y.t ? " • " + esc(y.t) : ""}${y.att === "y" ? " • <b style='color:#15803D'>આવ્યો ✓</b>" : y.att === "n" ? " • <b style='color:#DC2626'>ન આવ્યો</b>" : ""}</span></a>
          ${d === tmr ? `<a class="btn wa" style="min-height:40px;padding:0 12px" target="_blank" rel="noopener" href="${waLink(y.m, `${ACADEMY.name}\nનમસ્તે! યાદ અપાવીએ છીએ કે ${first(y.n)} નો *ડેમો ક્લાસ આવતીકાલે* છે 🎓\n📅 ${fmtD(y.d)}, ${dayName(y.d)}${y.t ? " • ⏰ " + y.t : ""}\n📚 ${y.bn}\n${ACADEMY.address ? "📍 " + ACADEMY.address + "\n" : ""}📞 ${ACADEMY.phone}`)}">${ic("wa", 16)} યાદ</a>` : ""}</div>`).join("")}</div>` : ""; }).join("")}
      <label class="search">${ic("search", 20)}<span class="sr">શોધો</span><input id="cq" type="search" value="${esc(q)}" placeholder="નામ કે મોબાઇલથી શોધો" autocomplete="off"></label>
      <div class="card" style="gap:0">${list.map(x => { const late = due(x) && x.nx < today, d = late ? Math.round((new Date(today) - new Date(x.nx)) / 864e5) : 0;
        return `<div class="lrow"><a class="grow" href="#/lead/${encodeURIComponent(x.id)}"><b>${esc(x.n)}</b>
          <span class="sub" style="display:block">ધો. ${esc(x.std || "-")}${x.sch ? " • " + esc(x.sch) : ""} • ${esc(x.ref?.n ? "ઓળખાણ: " + x.ref.n : SRC[x.src] || "")}</span>
          <span class="pill ${late ? "bad" : ST[x.st]?.[1] || ""}">${late ? `${d} દિવસ મોડું` : esc(ST[x.st]?.[0] || "")}${(x.log || []).length ? ` • ${(x.log || []).length} કૉલ` : ""}</span></a>
          ${x.m ? `<a class="icon-btn call" href="${tel(x.m)}" aria-label="${esc(x.n)} ને કૉલ">${ic("phone", 20)}</a>` : ""}</div>`; }).join("")
        || `<p class="muted" style="margin:10px 0">${f === "today" ? "આજે કોઈ કૉલ બાકી નથી 🎉" : "કોઈ નથી."}</p>`}</div>
      <div class="grid2"><a class="btn line" href="#/refs">🏅 રેફરલ</a><a class="btn line" href="#/crm-rep">${ic("chart", 18)} રિપોર્ટ</a>
        <a class="btn line" href="#/nextyr">📅 આવતા વર્ષની યાદી</a><button type="button" class="btn line" id="qrp">▦ QR પોસ્ટર</button></div>
      <button type="button" class="btn line big" id="flink">${ic("wa", 18)} પૂછપરછ ફોર્મની લિંક મોકલો</button>`;
    $$("[data-f]", v).forEach(c => c.onclick = () => { f = c.dataset.f; sessionStorage.setItem("gv_crmf", f); draw(); });
    $("#cq").oninput = e => { q = e.target.value.trim(); const pos = e.target.selectionStart; draw(); const i = $("#cq"); i.focus(); i.setSelectionRange(pos, pos); };
    $("#qrp").onclick = e => busy(e.currentTarget, async () => {
      const { qrPoster, posterModal } = await import("./toppers.js"), link = formLink() + "&s=qr";
      await posterModal({ title: "પ્રવેશ QR પોસ્ટર", fileName: "ગાંડિવ_પ્રવેશ_QR", text: `${ACADEMY.name}\nપ્રવેશની માહિતી માટે ફોર્મ ભરો 👇\n${link}`,
        build: async kind => [await qrPoster(kind, { link, year: S.year })] });
    });
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
        <div class="field"><label for="lf2">આ વિદ્યાર્થીને કહેલી કુલ ફી <span class="sub">(વૈકલ્પિક, ફક્ત આપણી નોંધ)</span></label><input id="lf2" type="number" inputmode="numeric" min="0" value="${esc(old?.fee || "")}" placeholder="₹"></div>
        <div class="field"><label for="lt">નોંધ <span class="sub">(વૈકલ્પિક)</span></label><textarea id="lt" rows="2" placeholder="દા.ત. ફી વિશે પૂછ્યું, પપ્પા સાથે વાત કરશે">${esc(old?.note || "")}</textarea></div>
        <button class="btn primary big" type="submit">${ic("check", 18)} સાચવો</button>
      </form>`;
    const keep = () => ({ n: $("#ln").value, m: $("#lm").value, s: $("#ls").value, vl: $("#lv").value, t: $("#lt").value, f: $("#lf2").value });
    const put = k => { $("#ln").value = k.n; $("#lm").value = k.m; $("#ls").value = k.s; $("#lv").value = k.vl; $("#lt").value = k.t; $("#lf2").value = k.f; dupCheck(); };
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
        const data = { n, m, std, sch: $("#ls").value.trim(), vil: $("#lv").value.trim(), src, ref: ref || null, nx: $("#lnx").value || nx, note: $("#lt").value.trim(), fee: Math.max(0, Math.round(Number($("#lf2").value) || 0)),
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
  let [L, D] = await Promise.all([loadCrm(), loadDemos()]), x = L[id];
  if (!x) { v.innerHTML = `<div class="empty">પૂછપરછ મળી નહીં.</div>`; return; }
  let out = "", nx = "", why = "", dm = { bid: "", bn: "", d: addD(1) }, BT = null;
  const info = () => `${ACADEMY.name}${ACADEMY.address ? "\n📍 " + ACADEMY.address : ""}\nનમસ્તે! ${first(x.n)} ના પ્રવેશની પૂછપરછ માટે આભાર 🙏\n${ACADEMY.posterLine || ""}\nધોરણ, બેચ, શિક્ષકો અને ફીની વિગત માટે ઑફિસે પધારો અથવા ફોન કરો: 📞 ${ACADEMY.phone}`;
  const feeMsg = () => `${ACADEMY.name}\nનમસ્તે! ${first(x.n)} (ધોરણ ${x.std}) ની આખા વર્ષની ફી: *${rupee(x.fee)}*\nવધુ માહિતી અને પ્રવેશ માટે ઑફિસે પધારો 🙏\n${ACADEMY.address ? "📍 " + ACADEMY.address + "\n" : ""}📞 ${ACADEMY.phone}`;
  const demoMsg = d => `${ACADEMY.name}\nનમસ્તે! ${first(x.n)} માટે *ડેમો ક્લાસ* ગોઠવ્યો છે 🎓\n📅 ${fmtD(d.d)}, ${dayName(d.d)}${d.t ? " • ⏰ " + d.t : ""}\n📚 ${d.bn}\n${ACADEMY.address ? "📍 " + ACADEMY.address + "\n" : ""}સમયસર પધારજો. 📞 ${ACADEMY.phone}`;
  const draw = () => {
    const lg = [...(x.log || [])].reverse(), dd = D[id];
    v.innerHTML = `
      <div class="row-between"><a class="btn line" href="#/crm">${ic("back", 18)} CRM</a><a class="btn line" href="#/crm-new/${encodeURIComponent(id)}">${ic("edit", 18)} ફેરફાર</a></div>
      <div class="card" style="gap:6px"><div class="row-between"><h1 style="margin:0;font-size:22px">${esc(x.n)}</h1><span class="pill ${ST[x.st]?.[1] || ""}">${esc(ST[x.st]?.[0] || "")}</span></div>
        <span class="sub">ધો. ${esc(x.std || "-")}${x.sch ? " • " + esc(x.sch) : ""}${x.vil ? " • " + esc(x.vil) : ""}</span>
        <span class="sub">${esc(SRC[x.src] || "")}${x.ref?.n ? ` • લાવ્યું: <b>${esc(x.ref.n)}</b>` : ""} • નોંધ: ${esc(x.bn || "")}, ${fmtD(ymd(new Date(x.at)))}</span>
        ${x.note ? `<p class="dtxt" style="margin-top:4px">${esc(x.note)}</p>` : ""}
        ${x.st === "no" && x.why ? `<span class="sub">❌ કારણ: <b>${esc(WHY[x.why] || "")}${x.whyT ? " — " + esc(x.whyT) : ""}</b></span>` : ""}
        ${dd ? `<span class="sub">🎓 ડેમો: <b>${esc(dd.bn)}</b>, ${fmtD(dd.d)} (${dayName(dd.d)}) • ${dd.att === "y" ? `<b style="color:#15803D">આવ્યો ✓</b>` : dd.att === "n" ? `<b style="color:#DC2626">ન આવ્યો</b>` : "બાકી"}</span>` : ""}
        ${x.fee ? `<span class="sub">💰 કહેલી ફી: <b>${rupee(x.fee)}</b></span>` : ""}
        ${x.nx && !["joined", "no"].includes(x.st) ? `<span class="sub">📅 ફરી કૉલ: <b>${x.nx === ymd() ? "આજે" : fmtD(x.nx)}</b></span>` : ""}
        <div class="grid2" style="margin-top:6px"><a class="btn primary" href="${tel(x.m)}">${ic("phone", 18)} કૉલ ${esc(norm10(x.m))}</a>
          <a class="btn wa" target="_blank" rel="noopener" href="${waLink(x.m, info())}">${ic("wa", 18)} માહિતી મોકલો</a></div>
        ${dd && dd.d >= ymd() || x.fee ? `<div class="grid2">${dd && dd.d >= ymd() ? `<a class="btn line" target="_blank" rel="noopener" href="${waLink(x.m, demoMsg(dd))}">🎓 ડેમોની યાદ</a>` : ""}${x.fee ? `<a class="btn line" target="_blank" rel="noopener" href="${waLink(x.m, feeMsg())}">💰 ફી મોકલો</a>` : ""}</div>` : ""}</div>
      ${x.st === "joined" ? `<div class="card center"><b>🎉 પ્રવેશ થયો</b>${x.sid ? `<a class="btn line" href="#/student/${encodeURIComponent(x.sid)}">વિદ્યાર્થીની ફાઇલ (${esc(x.sid)})</a>` : ""}</div>`
        : `<div class="card" style="gap:8px"><h2>${fresh && !(x.log || []).length ? "કૉલ કર્યો? પરિણામ લખો" : "કૉલનું પરિણામ"}</h2>
          <div class="outs">${OUT.map(([k, e, l]) => `<button type="button" class="ob ${out === k ? "on" : ""} ${k === "yes" ? "okb" : k === "no" ? "nob" : ""}" data-o="${k}">${e} ${l}</button>`).join("")}</div>
          ${out === "demo" ? `<div class="field"><span class="lbl">કઈ બેચમાં?</span><div class="chips">${BT === null ? `<span class="sub">લોડ થાય છે…</span>` : BT.map(b => `<button type="button" class="chip ${dm.bid === b.id ? "on" : ""}" data-db="${esc(b.id)}">${esc(b.name)}</button>`).join("") || `<span class="sub">કોઈ બેચ નથી.</span>`}</div></div>
            <div class="field"><span class="lbl">ક્યારે?</span><div class="chips">${[[addD(0), "આજે"], [addD(1), "કાલે"], [addD(2), "પરમ દિવસે"]].map(([d, l]) => `<button type="button" class="chip ${dm.d === d ? "on" : ""}" data-dd="${d}">${l}</button>`).join("")}</div>
              <input id="ddt" type="date" value="${esc(dm.d)}" style="margin-top:8px"></div>` : ""}
          ${out === "no" ? `<div class="field"><span class="lbl">ના પાડવાનું કારણ</span><div class="chips">${Object.entries(WHY).map(([k, l]) => `<button type="button" class="chip ${why === k ? "on" : ""}" data-why="${k}">${l}</button>`).join("")}</div>
            ${why === "other" ? `<input id="wht" style="margin-top:8px" placeholder="કારણ લખો" maxlength="60">` : ""}</div>` : ""}
          ${out ? `<div class="field"><label for="on">નોંધ</label><textarea id="on" rows="2" placeholder="${out === "demo" ? "દા.ત. પપ્પા સાથે આવશે" : "દા.ત. પપ્પા સાથે વાત કરીને કહેશે"}"></textarea></div>
            ${out !== "no" && out !== "demo" ? `<div class="field"><span class="lbl">ફરી કૉલ</span><div class="chips">${[[addD(1), "કાલે"], [addD(3), "3 દિવસ"], [addD(7), "1 અઠવાડિયું"]].map(([d, l]) => `<button type="button" class="chip ${nx === d ? "on" : ""}" data-nx="${d}">${l}</button>`).join("")}</div>
              <input id="onx" type="date" value="${esc(nx)}" style="margin-top:8px"></div>` : ""}
            <button type="button" class="btn primary big" id="osave">${ic("check", 18)} સાચવો</button>` : ""}
          <a class="btn line big" href="#/admit/L:${encodeURIComponent(id)}">${ic("plus", 18)} પ્રવેશ કરો (ફોર્મ ભરેલું ખૂલશે)</a></div>`}
      <div class="card" style="gap:0"><h2 style="margin-bottom:4px">ઇતિહાસ • ${lg.length} કૉલ</h2>
        ${lg.map(g => `<div class="lgrow"><span class="nic" style="width:34px;height:34px;font-size:17px">${OUT.find(o => o[0] === g.o)?.[1] || "📝"}</span>
          <span class="grow"><b>${esc(OUT.find(o => o[0] === g.o)?.[2] || g.o)}</b>${g.note ? ` — ${esc(g.note)}` : ""}<span class="sub" style="display:block">${fmtD(ymd(new Date(g.at)))} • ${esc(g.bn || "")}</span></span></div>`).join("")
          || `<p class="muted" style="margin:8px 0">હજુ કોઈ કૉલ નથી.</p>`}</div>
      ${isAdmin() ? `<button type="button" class="btn line danger" id="ldel">પૂછપરછ કાઢી નાખો</button>` : ""}`;
    const keepNote = () => $("#on", v)?.value || "";
    const redraw = () => { const n = keepNote(), w = $("#wht", v)?.value; draw(); if ($("#on", v)) $("#on", v).value = n; if (w != null && $("#wht", v)) $("#wht", v).value = w; };
    $$("[data-o]", v).forEach(b => b.onclick = async () => {
      out = b.dataset.o; nx = out === "no" ? "" : addD(OUT.find(o => o[0] === out)[3]); why = "";
      draw(); $("#on", v)?.focus();
      if (out === "demo" && BT === null) { BT = await loadBatches().catch(() => []);
        const std = String(x.std || "").match(/\d+/)?.[0], m = BT.filter(b2 => String(b2.std || "") === std || new RegExp(`(^|\\D)${std}(\\D|$)`).test(b2.name));
        if (m.length) BT = [...m, ...BT.filter(b2 => !m.includes(b2))];
        if (m.length === 1) { dm.bid = m[0].id; dm.bn = m[0].name; dm.t = m[0].start || ""; }
        redraw(); }
    });
    $$("[data-db]", v).forEach(c => c.onclick = () => { const b2 = BT.find(y => y.id === c.dataset.db); dm.bid = b2.id; dm.bn = b2.name; dm.t = b2.start || ""; redraw(); });
    $$("[data-dd]", v).forEach(c => c.onclick = () => { dm.d = c.dataset.dd; redraw(); });
    $("#ddt", v)?.addEventListener("change", e => { dm.d = e.target.value; redraw(); });
    $$("[data-why]", v).forEach(c => c.onclick = () => { why = c.dataset.why; redraw(); $("#wht", v)?.focus(); });
    $$("[data-nx]", v).forEach(c => c.onclick = () => { nx = c.dataset.nx; $("#onx").value = nx; $$("[data-nx]", v).forEach(y => y.classList.toggle("on", y === c)); });
    $("#onx", v)?.addEventListener("change", e => { nx = e.target.value; });
    $("#osave", v)?.addEventListener("click", e => {
      let note = $("#on", v)?.value.trim() || "";
      if (out === "demo" && !dm.bid) return toast("ડેમો માટે બેચ પસંદ કરો.", true);
      if (out === "demo" && !dm.d) return toast("ડેમોની તારીખ પસંદ કરો.", true);
      if (out === "no" && !why) return toast("ના પાડવાનું કારણ પસંદ કરો.", true);
      const whyT = why === "other" ? ($("#wht", v)?.value.trim() || "") : "";
      if (out === "no" && why === "other" && !whyT) return toast("કારણ લખો.", true);
      busy(e.currentTarget, async () => {
        const st = out === "noans" || out === "other" ? (x.st === "new" ? "new" : x.st) : out;
        const nxt = out === "no" ? "" : out === "demo" ? dm.d : nx;
        const upd = { st, nx: nxt };
        if (out === "no") { upd.why = why; upd.whyT = whyT; note = [WHY[why] + (whyT ? ": " + whyT : ""), note].filter(Boolean).join(" • "); }
        if (out === "demo") note = [`${dm.bn}, ${fmtD(dm.d)}`, note].filter(Boolean).join(" • ");
        try {
          if (out === "demo") {
            await setDoc(demoRef(), { branchId: S.branchId, yearId: S.year, list: { [id]: { n: x.n, bid: dm.bid, bn: dm.bn, d: dm.d, t: dm.t || "", att: "" } } }, { merge: true });
            D[id] = { n: x.n, ...dm, att: "" };
          }
          const L2 = await saveLead(id, upd, { at: Date.now(), by: S.me.loginId, bn: S.profile?.name || "", o: out, note });
          L = L2 || L; x = { ...L[id], ...upd };
        } catch (e2) { return fail(e2); }
        audit("crm.call", id, out); buzz("done"); toast("સચવાયું.");
        if (out === "demo") { out = ""; draw(); window.open(waLink(x.m, demoMsg(D[id])), "_blank"); return; }
        out = ""; nx = "";
        location.hash = "#/crm";
      });
    });
    $("#ldel", v)?.addEventListener("click", () => {
      const d = modal("પૂછપરછ કાઢી નાખવી છે?", `<p>${esc(x.n)}</p><div class="grid2"><button type="button" class="btn line" id="dn">રહેવા દો</button><button type="button" class="btn primary" id="dy" style="background:#DC2626;color:#fff">હા, કાઢો</button></div>`);
      $("#dn", d).onclick = () => closeModal();
      $("#dy", d).onclick = () => busy($("#dy", d), async () => {
        try { await updateDoc(crmRef(), { [`list.${id}`]: null }); if (D[id]) await updateDoc(demoRef(), { [`list.${id}`]: null }).catch(() => {}); const L3 = await loadCrm(); if (x.ref?.sid) await syncBoard(L3); } catch (e2) { return fail(e2); }
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
      ${(() => { const no = M.filter(x => x.st === "no"), W = {}, T = []; no.forEach(x => { const k = x.why || "other"; W[k] = (W[k] || 0) + 1; if (x.whyT) T.push(x.whyT); });
        return no.length ? `<div class="card" style="gap:0"><h2 style="margin-bottom:4px">❌ ના પાડવાનાં કારણો • ${no.length}</h2>
          ${Object.entries(W).sort((a, b) => b[1] - a[1]).map(([k, c]) => `<div class="srow" style="min-height:42px"><span class="grow">${esc(WHY[k] || k)}</span><b>${c}</b></div>`).join("")}
          ${T.length ? `<p class="sub" style="margin:6px 0 0">બીજાં: ${T.map(esc).join(", ")}</p>` : ""}</div>` : ""; })()}
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

// ================= આવતા વર્ષની યાદી (ફરી પ્રવેશ + નાનાં ભાઈ/બહેન) =================
async function addLeads(map) {
  const w = writeBatch(db), upd = {};
  w.set(crmRef(), { branchId: S.branchId, yearId: S.year }, { merge: true });
  Object.entries(map).forEach(([id, x]) => { upd[`list.${id}`] = x; });
  w.update(crmRef(), upd); await w.commit();
}
page("nextyr", async v => {
  if (!canCrm()) { location.hash = "#/home"; return; }
  const [L, rs] = await Promise.all([loadCrm(), getDoc(rosterRef()).catch(() => null)]);
  const y0 = Number(String(S.year).slice(0, 4)) || new Date().getFullYear(), ny = `${y0 + 1}-${String(y0 + 2).slice(2)}`;
  const def = `${y0 + 1}-03-01` > ymd() ? `${y0 + 1}-03-01` : addD(1);
  const R = Object.entries((rs?.exists() && rs.data().list) || {}).map(([id, r]) => ({ id, ...r }))
    .filter(r => r && r.x !== "cancelled" && +String(r.s).match(/\d+/)?.[0] >= 7 && +String(r.s).match(/\d+/)?.[0] <= 11)
    .map(r => ({ ...r, cur: +String(r.s).match(/\d+/)[0] })).sort((a, b) => a.cur - b.cur || String(a.n).localeCompare(String(b.n), "gu"));
  let f = 0, nx = def, SIB = null;
  const base = (n, m, std, extra) => ({ n, m: norm10(m), std: String(std), sch: "", vil: "", src: "old", ref: null, st: "new", nx, by: S.me.loginId, bn: S.profile?.name || "", at: Date.now(), up: Date.now(), log: [], via: "nextyr", note: "", fee: 0, ...extra });
  const stuLead = r => base(r.n, r.m, r.cur + 1, { vil: r.v || "", old: r.id, note: `આપણો વિદ્યાર્થી (${r.id}) • હાલ ધો. ${r.cur}${r.bn ? ", " + r.bn : ""} • ${ny} માટે ફરી પ્રવેશ` });
  const sibLead = sb => base(sb.n, sb.m, sb.nxt, { sch: sb.c || "", vil: sb.v || "", sibOf: sb.sid, note: `${sb.of} (${sb.sid}) નાં ભાઈ/બહેન • હાલ ધો. ${sb.cur}${sb.c ? ", " + sb.c : ""}` });
  const draw = () => {
    const list = R.filter(r => !f || r.cur === f), left = list.filter(r => !L["n_" + r.id]);
    const stds = [...new Set(R.map(r => r.cur))];
    v.innerHTML = `
      <div class="row-between"><a class="btn line" href="#/crm">${ic("back", 18)} CRM</a></div>
      <div><h1 class="page-title" style="margin:0">આવતા વર્ષની યાદી</h1><span class="sub">${ny} માટે ફરી પ્રવેશ • ધો. 7–11 ના આપણા વિદ્યાર્થીઓ</span></div>
      <div class="card" style="gap:6px"><span class="lbl">CRM માં ઉમેરો ત્યારે ફોન ક્યારે કરવો?</span><input id="nyd" type="date" value="${esc(nx)}"></div>
      <div class="hscroll"><button type="button" class="chip ${!f ? "on" : ""}" data-f="0">બધા ${R.length}</button>${stds.map(s2 => `<button type="button" class="chip ${f === s2 ? "on" : ""}" data-f="${s2}">ધો. ${s2} • ${R.filter(r => r.cur === s2).length}</button>`).join("")}</div>
      <div class="card" style="gap:0">${list.map(r => { const added = L["n_" + r.id];
        return `<div class="lrow"><span class="grow"><b>${esc(r.n)}</b><span class="sub" style="display:block">ધો. ${r.cur} → <b>${r.cur + 1}</b>${r.bn ? " • " + esc(r.bn) : ""}</span></span>
          ${added ? `<a class="pill ok" href="#/lead/n_${encodeURIComponent(r.id)}">ઉમેરાયું ✓</a>` : `<button type="button" class="btn line" style="min-height:40px" data-add="${esc(r.id)}">ઉમેરો</button>`}</div>`; }).join("") || `<p class="muted" style="margin:10px 0">કોઈ વિદ્યાર્થી નથી.</p>`}</div>
      ${left.length ? `<button type="button" class="btn primary big" id="addall">${ic("plus", 18)} બધાને એક સાથે ઉમેરો (${left.length})</button>` : ""}
      <div class="card" style="gap:0"><h2 style="margin-bottom:4px">👦👧 નાનાં ભાઈ/બહેન</h2>
        ${SIB === null ? `<p class="sub" style="margin:4px 0 8px">પ્રવેશ ફોર્મમાં લખેલાં ભાઈ/બહેન, જે હાલ ધો. 6–11 માં છે.</p>${isAdmin() ? `<button type="button" class="btn line" id="sibf">ભાઈ/બહેન શોધો</button>` : `<p class="muted">આ યાદી ફક્ત સંચાલક જોઈ શકે.</p>`}`
          : SIB.map(sb => { const added = L[sb.key];
            return `<div class="lrow"><span class="grow"><b>${esc(sb.n)}</b><span class="sub" style="display:block">${esc(sb.of)} નાં ભાઈ/બહેન • હાલ ધો. ${sb.cur}${sb.c ? " • " + esc(sb.c) : ""}</span></span>
              ${added ? `<a class="pill ok" href="#/lead/${encodeURIComponent(sb.key)}">ઉમેરાયું ✓</a>` : `<button type="button" class="btn line" style="min-height:40px" data-sib="${esc(sb.key)}">ઉમેરો</button>`}</div>`; }).join("") || `<p class="muted" style="margin:8px 0">ધો. 6–11 માં ભણતાં ભાઈ/બહેન મળ્યાં નહીં.</p>`}</div>`;
    $("#nyd").onchange = e => { nx = e.target.value || def; };
    $$("[data-f]", v).forEach(c => c.onclick = () => { f = +c.dataset.f; draw(); });
    $$("[data-add]", v).forEach(b => b.onclick = () => busy(b, async () => {
      const r = R.find(y => y.id === b.dataset.add), x = stuLead(r);
      try { await addLeads({ ["n_" + r.id]: x }); } catch (e) { return fail(e); }
      L["n_" + r.id] = x; audit("crm.nextyr", r.id, r.n); buzz("tap"); draw();
    }));
    $("#addall", v)?.addEventListener("click", e => {
      if (!confirm(`${left.length} વિદ્યાર્થીઓ CRM માં ઉમેરવા છે? (ફોન તારીખ: ${fmtD(nx)})`)) return;
      busy(e.currentTarget, async () => {
        const map = {}; left.forEach(r => { map["n_" + r.id] = stuLead(r); });
        try { await addLeads(map); } catch (e2) { return fail(e2); }
        Object.assign(L, map); audit("crm.nextyr.all", S.branchId, String(left.length)); buzz("done"); toast(`${left.length} ઉમેરાયા.`); draw();
      });
    });
    $("#sibf", v)?.addEventListener("click", e => busy(e.currentTarget, async () => {
      try {
        const q = await getDocs(query(collection(db, "students"), where("branchId", "==", S.branchId), where("yearId", "==", S.year)));
        SIB = [];
        q.docs.forEach(d => { const s = d.data(); if (s.status === "cancelled") return;
          (s.siblings || []).forEach((sb, i) => { const cur = +String(sb.s || "").match(/\d+/)?.[0];
            if (sb.st === "ના" || !sb.n || !(cur >= 6 && cur <= 11)) return;
            SIB.push({ key: `s_${d.id}_${i}`, n: String(sb.n).trim(), cur, nxt: cur + 1, c: sb.c || "", m: s.mobParent || "", v: s.village || "", of: s.name, sid: d.id }); }); });
        SIB.sort((a, b) => a.cur - b.cur);
      } catch (e2) { return fail(e2); }
      draw();
    }));
    $$("[data-sib]", v).forEach(b => b.onclick = () => busy(b, async () => {
      const sb = SIB.find(y => y.key === b.dataset.sib), x = sibLead(sb);
      try { await addLeads({ [sb.key]: x }); } catch (e) { return fail(e); }
      L[sb.key] = x; audit("crm.sibling", sb.sid, sb.n); buzz("tap"); draw();
    }));
  };
  draw();
});

// ================= ડેમો: હાજરી પાનાં માટે (શિક્ષક) =================
export async function demoList(batchId, date) {
  const D = await loadDemos();
  return Object.entries(D).filter(([, y]) => y && y.bid === batchId && y.d === date).map(([lid, y]) => ({ lid, n: y.n, att: y.att || "" }));
}
export function demoCardHtml(list) {
  if (!list?.length) return "";
  return `<div class="card democard" style="gap:0"><h2 style="margin-bottom:2px">🎓 ડેમો ક્લાસ</h2><p class="sub" style="margin:0 0 4px">નવો વિદ્યાર્થી ફક્ત જોવા આવ્યો છે. આવ્યો કે નહીં તે દબાવો.</p>
    ${list.map(y => `<div class="lrow"><span class="grow"><b>${esc(y.n)}</b> <span class="sub">(ડેમો)</span></span>
      <span class="seg" style="width:170px"><button type="button" class="${y.att === "y" ? "on" : ""}" data-demo="${esc(y.lid)}" data-v="y">આવ્યો</button><button type="button" class="${y.att === "n" ? "on" : ""}" data-demo="${esc(y.lid)}" data-v="n">ન આવ્યો</button></span></div>`).join("")}</div>`;
}
export function wireDemo(root, list) {
  $$("[data-demo]", root).forEach(b => b.onclick = async e => {
    e.stopPropagation();
    const lid = b.dataset.demo, val = b.dataset.v, it = list.find(y => y.lid === lid);
    $$(`[data-demo="${lid}"]`, root).forEach(y => y.classList.toggle("on", y === b)); buzz("tap");
    if (it) it.att = val;
    try { await updateDoc(demoRef(), { [`list.${lid}.att`]: val }); audit("demo.att", lid, val); } catch (e2) { fail(e2); }
  });
}
