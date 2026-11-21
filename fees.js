// =============================================================
//  ભાગ 5: ફી અને પહોંચ
//  receipts/{શાખા}_{વર્ષ}_{નંબર}  — નંબર શાખા દીઠ અલગ, જાતે બદલી શકાય
//  feeDays/{શાખા}_{yyyy-mm}       — રોજનો વકરો (ડેશબોર્ડ 1 read માં)
//  feeSched/{શાખા}_{વર્ષ}         — હપ્તાની મુદત (ટકાવારીમાં)
// =============================================================
import {
  db, collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc,
  runTransaction, serverTimestamp, increment
} from "./fb.js";
import {
  $, $$, esc, S, isAdmin, canAdmit, toast, fail, busy, audit, page, ic, route,
  money, fmtD, ymd, waLink, modal, closeModal, buzz, say
} from "./core.js";
import { ACADEMY } from "./config.js";

export const MODES = [["cash", "રોકડ"], ["upi", "UPI"], ["cheque", "ચેક"], ["bank", "બેંક"]];
const modeName = m => (MODES.find(x => x[0] === m) || [, m])[1];
const num = v => Math.max(0, Math.round(Number(String(v ?? "").replace(/[^\d.]/g, "")) || 0));
export const isFeeStaff = () => canAdmit() || ["accountant", "receptionist"].includes(S.me?.role);
const rosterRef = () => doc(db, "rosters", `${S.branchId}_${S.year}`);
const metaRef = () => doc(db, "branchMeta", S.branchId);
const ridOf = (b, y, no) => `${b}_${y}_${no}`;
const hashArg = () => decodeURIComponent(location.hash.split("/")[2] || "");
const branchOf = id => S.branches.find(b => b.id === id) || {};
const cls = (std, bn) => esc(bn || ("ધો. " + (std || "")));

// ---------- રકમ શબ્દોમાં (ગુજરાતી) ----------
const W = ("શૂન્ય એક બે ત્રણ ચાર પાંચ છ સાત આઠ નવ દસ અગિયાર બાર તેર ચૌદ પંદર સોળ સત્તર અઢાર ઓગણીસ વીસ એકવીસ બાવીસ તેવીસ ચોવીસ પચ્ચીસ છવ્વીસ સત્તાવીસ અઠ્ઠાવીસ ઓગણત્રીસ ત્રીસ " +
  "એકત્રીસ બત્રીસ તેત્રીસ ચોત્રીસ પાંત્રીસ છત્રીસ સાડત્રીસ આડત્રીસ ઓગણચાલીસ ચાલીસ એકતાલીસ બેતાલીસ તેતાલીસ ચુંમાલીસ પિસ્તાલીસ છેતાલીસ સુડતાલીસ અડતાલીસ ઓગણપચાસ પચાસ " +
  "એકાવન બાવન ત્રેપન ચોપન પંચાવન છપ્પન સત્તાવન અઠ્ઠાવન ઓગણસાઠ સાઠ એકસઠ બાસઠ ત્રેસઠ ચોસઠ પાંસઠ છાસઠ સડસઠ અડસઠ ઓગણસિત્તેર સિત્તેર " +
  "એકોતેર બોતેર તોતેર ચુમોતેર પંચોતેર છોતેર સિત્યોતેર ઇઠ્યોતેર ઓગણએંસી એંસી એક્યાસી બ્યાસી ત્યાસી ચોર્યાસી પંચાસી છ્યાસી સિત્યાસી ઇઠ્યાસી નેવ્યાસી નેવું " +
  "એકાણું બાણું ત્રાણું ચોરાણું પંચાણું છન્નું સત્તાણું અઠ્ઠાણું નવ્વાણું").split(" ");
const HUN = ["", "એકસો", "બસો", "ત્રણસો", "ચારસો", "પાંચસો", "છસો", "સાતસો", "આઠસો", "નવસો"];
export function words(n) {
  n = num(n); if (!n) return "શૂન્ય રૂપિયા";
  const out = [], part = (v, w) => { if (v) out.push(W[v] + " " + w); };
  part(Math.floor(n / 1e7), "કરોડ"); n %= 1e7;
  part(Math.floor(n / 1e5), "લાખ"); n %= 1e5;
  part(Math.floor(n / 1e3), "હજાર"); n %= 1e3;
  if (Math.floor(n / 100)) out.push(HUN[Math.floor(n / 100)]); n %= 100;
  if (n) out.push(W[n]);
  return out.join(" ") + " રૂપિયા પૂરા";
}

// ---------- હપ્તાની મુદત ----------
const startYear = () => Number(String(S.year).slice(0, 4)) || new Date().getFullYear();
const defSched = () => ({
  annual: [{ d: `${startYear()}-06-30`, p: 100 }],
  half: [{ d: `${startYear()}-06-30`, p: 50 }, { d: `${startYear()}-12-31`, p: 100 }]
});
const SCH = {};
export async function loadSched(branchId = S.branchId) {
  const k = `${branchId}_${S.year}`;
  if (SCH[k]) return SCH[k];
  try { const s = await getDoc(doc(db, "feeSched", k)); SCH[k] = s.exists() ? s.data() : defSched(); }
  catch { SCH[k] = defSched(); }
  return SCH[k];
}
// આગળનો હપ્તો / મુદત વીતી
export function dueInfo(fee, sched) {
  const pay = num(fee?.pay), paid = num(fee?.paid), today = ymd();
  if (!pay || paid >= pay) return { done: !!pay, bal: Math.max(0, pay - paid) };
  const list = (fee?.sched?.length ? fee.sched : (fee?.plan === "છ-માસિક" ? sched?.half : sched?.annual) || [])
    .slice().sort((a, b) => String(a.d).localeCompare(String(b.d)))
    .map(x => ({ d: x.d, need: Math.round(pay * Math.min(100, num(x.p)) / 100) }));
  const past = list.filter(x => x.d < today && x.need > paid).pop();
  const next = list.find(x => x.d >= today && x.need > paid);
  return {
    bal: pay - paid,
    over: past ? { d: past.d, amt: past.need - paid } : null,
    next: next ? { d: next.d, amt: next.need - paid } : null
  };
}
export function dueLine(fee, sched, who = "") {
  if (!num(fee?.pay)) return "";
  const i = dueInfo(fee, sched);
  if (i.done) return `<span class="fee-small">ફી: ભરાઈ ગઈ ✓</span>`;
  if (i.over) return `<span class="fee-small due-over">ફી: ${money(i.over.amt)} ભરવાની મુદત ${fmtD(i.over.d)} વીતી ગઈ છે • કુલ બાકી ${money(i.bal)}</span>`;
  return `<span class="fee-small">ફી: ${money(i.bal)} બાકી${i.next ? ` • <b>${fmtD(i.next.d)} સુધીમાં ${money(i.next.amt)}</b>` : ""}${who === "student" ? " • વાલીને યાદ કરાવો" : ""}</span>`;
}

// ---------- પહોંચ (કાગળની પહોંચ જેવી) ----------
export function receiptHtml(r, nextTxt = "") {
  const br = branchOf(r.branchId);
  const u = x => `<u>${esc(x)}</u>`;
  return `<div class="rc" id="rcpt">
    <div class="rc-h">
      <div class="rc-top"><span><span class="rc-tag">FEES RECEIPT</span><br><b class="rc-trust">${esc(ACADEMY.trust || "")}</b></span>
        <span class="rc-con">${(ACADEMY.contacts || []).map(([n, p]) => `${esc(n)} • ${esc(p)}`).join("<br>")}</span></div>
      <div class="rc-t"><img src="logo.png" alt="" crossorigin="anonymous"><b>${esc(ACADEMY.name)}</b></div>
      <div class="rc-tl"><span>${esc(ACADEMY.tagline)}</span></div>
      <div class="rc-strip">${esc(ACADEMY.strip || "")}</div>
      <div class="rc-ad">${esc(br.address || "")}${br.phone ? " • " + esc(br.phone) : ""}</div>
    </div>
    <div class="rc-b">
      <div class="rc-l"><span>વિદ્યાર્થીનું નામ:</span><i>${esc(r.name)}</i><span>No.:</span><i class="rc-no">${esc(r.no)}</i></div>
      <div class="rc-l"><span>ધોરણ:</span><i>${esc(r.std)}</i><span>બેચ:</span><i>${esc(r.batchName || "")}</i></div>
      <div class="rc-l"><span>ગામ:</span><i>${esc(r.village || "")}</i><span>તારીખ:</span><i>${fmtD(r.date)}</i></div>
      <table class="rc-tb"><tr><th>ક્રમ</th><th>વિગત</th><th>રકમ</th></tr>
        <tr><td>૧.</td><td>${u(modeName(r.mode))}${r.ref ? ` (${esc(r.ref)})` : ""} દ્વારા રૂ. ${u(money(r.amount).replace("₹ ", ""))} જમા કરાવેલ છે.
          ${r.prevNo ? `<br>અગાઉ વાઉચર નં. ${u(r.prevNo)} માં ${u(money(r.prevPaid).replace("₹ ", ""))} રૂ. જમા છે.` : ""}</td><td>${money(r.amount)}</td></tr>
        <tr><td>૨.</td><td>${u(r.plan || "વાર્ષિક")} ફી રૂ. ${u(money(r.total).replace("₹ ", ""))} માંથી − રૂ. ${u(money(r.paidAfter).replace("₹ ", ""))}
          <span class="rc-oval">= ${u(money(r.balance).replace("₹ ", ""))} બાકી.</span></td><td></td></tr>
        <tr><td colspan="2"><b class="rc-red">શબ્દોમાં:</b> ${esc(words(r.amount))}</td><td>કુલ ${money(r.amount)}</td></tr></table>
      ${nextTxt ? `<p class="rc-next">${nextTxt}</p>` : ""}
      ${r.note ? `<p class="rc-next">Note: ${esc(r.note)}</p>` : ""}
      <div class="rc-s"><span>જમા કરાવનાર: <b>${esc(r.payer || "")}</b></span><span>જમા કરનાર: <b>${esc(r.byName || "")}</b> ✓</span></div>
    </div></div>`;
}

// ---------- પહોંચ બનાવો (transaction: નંબર બે વાર ન થાય) ----------
async function saveReceipt(st, f) {
  const no = num(f.no), amount = num(f.amount);
  const rref = doc(db, "receipts", ridOf(S.branchId, S.year, no));
  const sref = doc(db, "students", st.id);
  const ym = f.date.slice(0, 7), dd = f.date.slice(8, 10);
  return runTransaction(db, async tx => {
    const [rs, ss, ms] = await Promise.all([tx.get(rref), tx.get(sref), tx.get(metaRef())]);
    if (rs.exists()) throw Object.assign(new Error("dup"), { code: "gv/dup" });
    const s = ss.data(), fee = s.fee || {};
    const prevPaid = num(fee.paid), paidAfter = prevPaid + amount, total = num(fee.pay);
    const r = {
      branchId: S.branchId, yearId: S.year, no, date: f.date, studentId: st.id,
      name: s.name, std: s.std, batchName: s.batchName || "", village: s.village || "",
      amount, mode: f.mode, ref: f.mode === "cash" ? "" : (f.ref || ""), payer: f.payer || "", note: f.note || "",
      prevNo: fee.lastNo || "", prevPaid, plan: fee.plan || "વાર્ષિક", total, paidAfter, balance: Math.max(0, total - paidAfter),
      wa: s.mobWa || s.mobParent || "", legacy: !!f.legacy,
      by: S.me.loginId, byName: S.profile?.name || "", createdAt: serverTimestamp()
    };
    tx.set(rref, r);
    tx.update(sref, { "fee.paid": paidAfter, "fee.lastNo": no, "fee.lastDate": f.date, "fee.payer": r.payer, updatedAt: serverTimestamp() });
    tx.set(rosterRef(), { branchId: S.branchId, yearId: S.year, list: { [st.id]: { pd: paidAfter } } }, { merge: true });
    tx.set(doc(db, "feeDays", `${S.branchId}_${ym}`), { branchId: S.branchId, days: { [dd]: { [f.mode]: increment(amount), n: increment(1) } } }, { merge: true });
    const k = `rcpt_${S.year}`, last = num(ms.exists() ? ms.data()[k] : 0);
    if (no > last) tx.set(metaRef(), { [k]: no }, { merge: true });
    return { id: rref.id, ...r };
  });
}
async function deleteReceipt(r) {
  const rref = doc(db, "receipts", ridOf(r.branchId, r.yearId, r.no));
  const sref = doc(db, "students", r.studentId);
  const ym = r.date.slice(0, 7), dd = r.date.slice(8, 10);
  await runTransaction(db, async tx => {
    const [rs, ss, ms] = await Promise.all([tx.get(rref), tx.get(sref), tx.get(doc(db, "branchMeta", r.branchId))]);
    if (!rs.exists()) return;
    const fee = ss.data()?.fee || {}, paid = Math.max(0, num(fee.paid) - num(r.amount));
    tx.delete(rref);
    tx.update(sref, { "fee.paid": paid, ...(String(fee.lastNo) === String(r.no) ? { "fee.lastNo": r.prevNo || "" } : {}), updatedAt: serverTimestamp() });
    tx.set(doc(db, "rosters", `${r.branchId}_${r.yearId}`), { list: { [r.studentId]: { pd: paid } } }, { merge: true });
    tx.set(doc(db, "feeDays", `${r.branchId}_${ym}`), { branchId: r.branchId, days: { [dd]: { [r.mode]: increment(-num(r.amount)), n: increment(-1) } } }, { merge: true });
    const k = `rcpt_${r.yearId}`;
    if (num(ms.data()?.[k]) === num(r.no)) tx.set(doc(db, "branchMeta", r.branchId), { [k]: num(r.no) - 1 }, { merge: true });
  });
  audit("receipt.delete", rref.id, `${r.name} • ${r.amount}`);
}

// ================= ફી લો / જૂની પહોંચો =================
let SESSION = [];
async function payPage(v, old) {
  if (!isFeeStaff()) { location.hash = "#/home"; return; }
  const id = old ? "" : hashArg();
  const [rs, ms, sched] = await Promise.all([getDoc(rosterRef()), getDoc(metaRef()), loadSched()]);
  const roster = Object.entries((rs.exists() && rs.data().list) || {}).map(([k, r]) => ({ id: k, ...r })).filter(r => r.x !== "cancelled");
  const nextNo = () => num(ms.exists() ? ms.data()[`rcpt_${S.year}`] : 0) + 1 + SESSION.filter(x => x.no > num(ms.data()?.[`rcpt_${S.year}`])).length;
  let st = null, sdoc = null;
  const F = { no: "", date: old ? (sessionStorage.getItem("gv_olddate") || "") : ymd(), amount: "", mode: "cash", ref: "", payer: "", note: "" };
  F.no = String(nextNo());

  const pick = async sid => {
    st = roster.find(r => r.id === sid) || null; sdoc = null;
    if (st) { const d = await getDoc(doc(db, "students", sid)); sdoc = d.exists() ? d.data() : null; F.payer = sdoc?.fee?.payer || F.payer; }
    draw();
  };
  const draw = () => {
    const fee = sdoc?.fee || {}, info = dueInfo(fee, sched), bal = Math.max(0, num(fee.pay) - num(fee.paid));
    const quick = [info.over?.amt || info.next?.amt, Math.round(bal / 2), bal].filter((x, i, a) => x > 0 && a.indexOf(x) === i);
    v.innerHTML = `
      <div class="row-between"><div class="grow"><h1 class="page-title">${old ? "જૂની પહોંચો ચડાવો" : "ફી લો"}</h1>
        <span class="sub">${old ? `આ વખતે: ${SESSION.length} પહોંચ • ${money(SESSION.reduce((a, x) => a + x.amount, 0))}` : `${esc(branchOf(S.branchId).name || "")} • ${esc(S.year)}`}</span></div></div>
      ${old ? `<div class="note old">${ic("info", 20)}<div>કાગળની પહોંચ જેવો જ <b>નંબર અને તારીખ</b> લખો. પહોંચો નંબરના ક્રમમાં ચડાવો, જેથી "અગાઉ વાઉચર નં." સાચો આવે.</div></div>` : ""}
      <div class="card">
        <div class="grid2">
          <div class="field"><label for="p_no">પહોંચ નં.</label><input id="p_no" inputmode="numeric" value="${esc(F.no)}"></div>
          <div class="field"><label for="p_date">તારીખ</label><input id="p_date" type="date" value="${esc(F.date)}"></div>
        </div>
        ${st ? `<div class="sib" style="background:#F7F8FB">
            <div class="row-between"><div class="grow"><b>${esc(st.n)}</b><span class="sub" style="display:block">${esc(st.id)} • ${cls(st.s, st.bn)}${st.f ? " • ફોર્મ " + esc(st.f) : ""}</span></div>
              <button type="button" class="link-btn" id="chg">બદલો</button></div>
            <div class="kv"><span>${esc(fee.plan || "વાર્ષિક")} ફી</span><b>${money(fee.pay)}</b>
              <span>અગાઉ જમા</span><b>${money(fee.paid)}${fee.lastNo ? ` (પહોંચ ${esc(fee.lastNo)})` : ""}</b>
              <span>બાકી</span><b style="color:${bal ? "#DC2626" : "#16A34A"}">${money(bal)}</b></div>
            ${dueLine(fee, sched)}
          </div>`
        : `<div class="field"><label for="p_q">વિદ્યાર્થી</label><label class="search">${ic("search", 20)}<input id="p_q" type="search" placeholder="ફોર્મ નં., નામ, ID કે મોબાઇલ" autocomplete="off"></label></div>
           <div id="p_res" style="display:flex;flex-direction:column"></div>`}
        ${st ? `
        <div class="field"><label for="p_amt">જમા રકમ ₹</label><input id="p_amt" inputmode="numeric" value="${esc(F.amount)}" placeholder="${bal ? money(bal) + " સુધી" : ""}"></div>
        ${quick.length ? `<div class="chips">${quick.map(q => `<button type="button" class="chip" data-q="${q}">${money(q)}${q === bal ? " (પૂરી)" : q === info.over?.amt || q === info.next?.amt ? " (હપ્તો)" : ""}</button>`).join("")}</div>` : ""}
        <div class="field"><span class="lbl">દ્વારા</span><div class="chips" role="group">${MODES.map(([k, l]) => `<button type="button" class="chip ${F.mode === k ? "on" : ""}" data-m="${k}">${l}</button>`).join("")}</div></div>
        ${F.mode !== "cash" ? `<div class="field"><label for="p_ref">${F.mode === "cheque" ? "ચેક નંબર" : "Transaction / UTR નંબર"} (હોય તો)</label><input id="p_ref" value="${esc(F.ref)}"></div>` : ""}
        <div class="grid2"><div class="field"><label for="p_payer">જમા કરાવનાર</label><input id="p_payer" value="${esc(F.payer)}" placeholder="વાલીનું નામ"></div>
          <div class="field"><label for="p_note">Note (હોય તો)</label><input id="p_note" value="${esc(F.note)}"></div></div>` : ""}
      </div>
      ${st ? `<button type="button" class="btn primary big" id="p_save">${ic("check", 18)} ${old ? "સાચવો અને આગળની પહોંચ" : "જમા કરો"}</button>` : ""}
      ${old && SESSION.length ? `<div class="card" style="gap:0"><h2 style="margin-bottom:6px">હમણાં ચડાવેલી</h2>
        ${SESSION.slice().reverse().map(x => `<a class="srow" href="#/receipt/${encodeURIComponent(x.id)}"><span class="grow"><b>${esc(x.no)} • ${esc(x.name)}</b><span class="sub">${fmtD(x.date)} • ${esc(modeName(x.mode))}</span></span><b>${money(x.amount)}</b></a>`).join("")}
        <p class="hint">ભૂલ હોય તો લાઇન દબાવીને પહોંચ ભૂંસો અને ફરી ચડાવો.</p></div>` : ""}`;
    const keep = () => {
      F.no = $("#p_no").value; F.date = $("#p_date").value;
      if ($("#p_amt")) { F.amount = $("#p_amt").value; F.payer = $("#p_payer").value; F.note = $("#p_note").value; F.ref = $("#p_ref")?.value || ""; }
    };
    const q = $("#p_q");
    if (q) {
      q.oninput = () => {
        const t = q.value.trim().toLowerCase();
        $("#p_res").innerHTML = !t ? "" : roster.filter(r => [r.n, r.id, r.m, String(r.f)].some(x => String(x || "").toLowerCase().includes(t))).slice(0, 8)
          .map(r => `<button type="button" class="srow" data-pick="${esc(r.id)}" style="border:0;background:none;text-align:left;width:100%">
            <span class="grow"><b>${esc(r.n)}</b><span class="sub" style="display:block">${esc(r.id)} • ${cls(r.s, r.bn)}${r.f ? " • ફોર્મ " + esc(r.f) : ""}</span></span>
            <span class="fee-small">બાકી ${money(num(r.p) - num(r.pd))}</span></button>`).join("") || `<p class="muted center">મળ્યું નહીં.</p>`;
        $$("[data-pick]", v).forEach(b => b.onclick = () => { keep(); pick(b.dataset.pick); });
      };
      if (!old) q.focus();
    }
    $("#chg", v)?.addEventListener("click", () => { keep(); st = null; sdoc = null; draw(); });
    $$("[data-q]", v).forEach(b => b.onclick = () => { keep(); F.amount = b.dataset.q; draw(); });
    $$("[data-m]", v).forEach(b => b.onclick = () => { keep(); F.mode = b.dataset.m; draw(); });
    $("#p_save", v)?.addEventListener("click", e => {
      keep();
      if (!num(F.no)) return toast("પહોંચ નંબર લખો.", true);
      if (!F.date) return toast("તારીખ લખો.", true);
      if (!num(F.amount)) return toast("જમા રકમ લખો.", true);
      if (bal && num(F.amount) > bal && !confirm(`રકમ બાકી (${money(bal)}) કરતાં વધારે છે. છતાં જમા કરવી છે?`)) return;
      busy(e.currentTarget, async () => {
        try {
          const r = await saveReceipt(st, { ...F, legacy: old });
          audit(old ? "receipt.legacy" : "receipt.create", r.id, `${r.name} • ${r.amount}`);
          buzz("done");
          if (old) {
            sessionStorage.setItem("gv_olddate", F.date);
            SESSION.push(r); toast(`પહોંચ ${r.no} સચવાઈ ✓`);
            st = null; sdoc = null; F.no = String(num(F.no) + 1); F.amount = ""; F.ref = ""; F.note = ""; F.payer = ""; F.mode = "cash";
            draw(); $("#p_q")?.focus();
          } else {
            say(`${r.amount} રૂપિયા જમા થયા. આભાર`, [660, 990]);
            location.hash = `#/receipt/${encodeURIComponent(r.id)}`;
          }
        } catch (e2) {
          if (e2?.code === "gv/dup") toast(`પહોંચ નં. ${F.no} પહેલેથી છે. બીજો નંબર લખો.`, true);
          else fail(e2, "પહોંચ સચવાઈ નહીં. નેટ ચકાસો.");
        }
      });
    });
  };
  if (id) await pick(id); else draw();
}
page("pay", v => payPage(v, false));
page("oldpay", v => payPage(v, true));

// ================= પહોંચ જુઓ / મોકલો / છાપો / ભૂંસો =================
page("receipt", async v => {
  const rid = hashArg();
  const rs = await getDoc(doc(db, "receipts", rid));
  if (!rs.exists()) { v.innerHTML = `<div class="empty">આ પહોંચ મળી નહીં (કદાચ ભૂંસાઈ ગઈ છે).</div><a class="btn line" href="#/home">હોમ</a>`; return; }
  const r = rs.data();
  let nextTxt = "";
  try {
    const [ss, sched] = await Promise.all([getDoc(doc(db, "students", r.studentId)), loadSched(r.branchId)]);
    const i = dueInfo(ss.data()?.fee, sched);
    nextTxt = i.done ? "ફી પૂરી ભરાઈ ગઈ છે. આભાર 🙏" : i.over ? `${money(i.over.amt)} ભરવાની મુદત ${fmtD(i.over.d)} વીતી ગઈ છે.` : i.next ? `આગળનો હપ્તો: ${fmtD(i.next.d)} સુધીમાં ${money(i.next.amt)}` : "";
  } catch {}
  const canDel = isAdmin() || (isFeeStaff() && r.by === S.me.loginId);
  const back = isFeeStaff() ? `#/student/${encodeURIComponent(r.studentId)}` : "#/myfees";
  v.innerHTML = `
    <div class="row-between"><a class="btn line" href="${back}">${ic("back", 18)} પાછા</a><span class="sub">${r.legacy ? "જૂની પહોંચ" : ""}</span></div>
    ${receiptHtml(r, nextTxt)}
    <div class="grid2"><button type="button" class="btn wa" id="r_wa">${ic("wa", 18)} ${isFeeStaff() ? "વાલીને WhatsApp" : "શેર કરો"}</button>
      <button type="button" class="btn line" id="r_pr">${ic("print", 18)} છાપો / PDF</button></div>
    ${isFeeStaff() ? `<a class="btn line big" href="#/pay/${encodeURIComponent(r.studentId)}">${ic("rupee", 18)} આ વિદ્યાર્થીની બીજી ફી લો</a>` : ""}
    ${canDel ? `<button type="button" class="btn line danger big" id="r_del">આ પહોંચ ભૂંસો</button>` : ""}`;
  const text = `${ACADEMY.name}\nફી પહોંચ નં. ${r.no} • ${fmtD(r.date)}\n${r.name}: ${money(r.amount)} જમા (${modeName(r.mode)})\nબાકી: ${money(r.balance)}${nextTxt ? "\n" + nextTxt : ""}`;
  $("#r_wa").onclick = e => busy(e.currentTarget, () => shareReceipt(r, text));
  $("#r_pr").onclick = () => printReceipt(r, nextTxt);
  $("#r_del", v)?.addEventListener("click", e => {
    if (!confirm(`પહોંચ નં. ${r.no} (${money(r.amount)}) ભૂંસવી છે? વિદ્યાર્થીની જમા ફી પણ એટલી ઘટશે.`)) return;
    busy(e.currentTarget, async () => {
      try { await deleteReceipt(r); toast("પહોંચ ભૂંસાઈ ગઈ."); SESSION = SESSION.filter(x => x.no !== r.no); location.hash = back; }
      catch (e2) { fail(e2, "પહોંચ ભૂંસાઈ નહીં."); }
    });
  });
});

// પહોંચનું ચિત્ર બનાવીને WhatsApp/શેર (ન બને તો લખાણ)
let h2c = null;
function loadH2C() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  if (h2c) return h2c;
  h2c = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
    s.onload = () => res(window.html2canvas); s.onerror = rej; document.head.appendChild(s);
  });
  return h2c;
}
async function shareReceipt(r, text) {
  try {
    const h = await loadH2C();
    const canvas = await h($("#rcpt"), { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
    const file = new File([blob], `પહોંચ_${r.no}.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
    toast("પહોંચનું ચિત્ર ડાઉનલોડ થયું. WhatsApp માં ગેલેરીમાંથી મોકલો.");
  } catch (e) {
    if (e?.name === "AbortError") return;
    console.warn(e);
  }
  if (isFeeStaff() && r.wa) window.open(waLink(r.wa, text), "_blank");
}
function printReceipt(r, nextTxt) {
  let el = $("#print"); if (!el) { el = document.createElement("div"); el.id = "print"; document.body.appendChild(el); }
  el.innerHTML = `<section class="pr-rc">${receiptHtml(r, nextTxt).replace('id="rcpt"', "")}</section>`;
  const t = document.title; document.title = `પહોંચ_${r.no}_${r.name}`;
  setTimeout(() => { window.print(); document.title = t; }, 150);
}

// ================= વિદ્યાર્થીની ફાઇલ → ફી ટેબ =================
async function receiptsOf(studentId, branchId) {
  const cs = [where("studentId", "==", studentId)];
  if (isFeeStaff()) cs.unshift(where("branchId", "==", branchId));
  const q = await getDocs(query(collection(db, "receipts"), ...cs));
  return q.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.no - a.no);
}
export async function feeTab(el, id, s) {
  const [list, sched] = await Promise.all([receiptsOf(id, s.branchId), loadSched(s.branchId)]);
  const fee = s.fee || {}, bal = Math.max(0, num(fee.pay) - num(fee.paid));
  el.innerHTML = `
    <div class="card"><div class="kv"><span>${esc(fee.plan || "વાર્ષિક")} ફી</span><b>${money(fee.pay)}</b>
      <span>જમા</span><b style="color:#16A34A">${money(fee.paid)}</b><span>બાકી</span><b style="color:${bal ? "#DC2626" : "#16A34A"}">${money(bal)}</b></div>
      ${dueLine(fee, sched)}
      ${isFeeStaff() && s.status !== "cancelled" ? `<a class="btn primary big" href="#/pay/${encodeURIComponent(id)}">${ic("rupee", 18)} ફી લો</a>` : ""}
      ${isAdmin() ? `<button type="button" class="link-btn" id="own">${fee.sched?.length ? "આ વિદ્યાર્થીની ખાસ મુદત બદલો" : "આ વિદ્યાર્થી માટે ખાસ મુદત રાખો"}</button>` : ""}</div>
    <div class="card" style="gap:0"><h2 style="margin-bottom:6px">પહોંચો (${list.length})</h2>
      ${list.map(r => `<a class="srow" href="#/receipt/${encodeURIComponent(r.id)}"><span class="ph" style="background:#E6F4EA;color:#15803D">${ic("receipt", 20)}</span>
        <span class="grow"><b>પહોંચ ${esc(r.no)} • ${money(r.amount)}</b><span class="sub">${fmtD(r.date)} • ${esc(modeName(r.mode))} • ${esc(r.byName || "")}${r.legacy ? " • જૂની" : ""}</span></span></a>`).join("")
      || `<p class="muted center">હજુ કોઈ પહોંચ નથી.</p>`}</div>`;
  $("#own", el)?.addEventListener("click", () => schedEditor(fee.sched?.length ? fee.sched : (fee.plan === "છ-માસિક" ? sched.half : sched.annual), async rows => {
    await updateDoc(doc(db, "students", id), { "fee.sched": rows, updatedAt: serverTimestamp() });
    audit("fee.ownsched", id, JSON.stringify(rows)); toast("ખાસ મુદત સચવાઈ."); route();
  }, `${s.name}: ખાસ મુદત`));
}

// મુદતની લાઇનો બદલવાનું નાનું પાનું (modal)
function schedEditor(rows, onSave, title) {
  rows = (rows || []).map(x => ({ ...x }));
  const d = modal(title, `<div id="se"></div>`);
  const draw = () => {
    $("#se", d).innerHTML = `<div class="stack">
      ${rows.map((x, i) => `<div class="grid2" style="grid-template-columns:1fr 90px 40px;align-items:end">
        <div class="field"><label for="sd${i}">તારીખ સુધીમાં</label><input id="sd${i}" type="date" data-i="${i}" data-k="d" value="${esc(x.d)}"></div>
        <div class="field"><label for="sp${i}">કુલ ફીના %</label><input id="sp${i}" inputmode="numeric" data-i="${i}" data-k="p" value="${esc(x.p)}"></div>
        <button type="button" class="icon-btn" data-rm="${i}" aria-label="કાઢો">✕</button></div>`).join("")}
      <button type="button" class="btn line" id="se_add">+ મુદત ઉમેરો</button>
      <button type="button" class="btn primary big" id="se_ok">સાચવો</button></div>`;
    $$("[data-k]", d).forEach(inp => inp.oninput = () => { rows[+inp.dataset.i][inp.dataset.k] = inp.dataset.k === "p" ? num(inp.value) : inp.value; });
    $$("[data-rm]", d).forEach(b => b.onclick = () => { rows.splice(+b.dataset.rm, 1); draw(); });
    $("#se_add", d).onclick = () => { rows.push({ d: "", p: 100 }); draw(); };
    $("#se_ok", d).onclick = e => {
      const ok = rows.filter(x => x.d && num(x.p) > 0).map(x => ({ d: x.d, p: Math.min(100, num(x.p)) })).sort((a, b) => a.d.localeCompare(b.d));
      if (!ok.length) return toast("ઓછામાં ઓછી એક મુદત રાખો.", true);
      busy(e.currentTarget, async () => { try { await onSave(ok); closeModal(); } catch (e2) { fail(e2); } });
    };
  };
  draw();
}

// ================= હપ્તાની મુદત (શાખા) =================
page("sched", async v => {
  if (!isAdmin()) { location.hash = "#/fees"; return; }
  const k = `${S.branchId}_${S.year}`;
  delete SCH[k];
  const sc = await loadSched();
  const box = (key, title) => `<div class="card" style="gap:0"><div class="row-between"><h2>${title}</h2><button type="button" class="btn line" style="min-height:36px" data-ed="${key}">બદલો</button></div>
    ${(sc[key] || []).map(x => `<div class="srow"><span class="grow"><b>${fmtD(x.d)} સુધીમાં</b><span class="sub">કુલ ફીના ${esc(x.p)}%</span></span><b>${num(x.p) >= 100 ? "બાકીની બધી" : num(x.p) === 50 ? "અડધી" : esc(x.p) + "%"}</b></div>`).join("") || `<p class="muted">મુદત નથી.</p>`}</div>`;
  v.innerHTML = `
    <div class="row-between"><a class="btn line" href="#/fees">${ic("back", 18)} ફી</a></div>
    <h1 class="page-title">હપ્તાની મુદત</h1>
    <div class="note info">${ic("info", 20)}<div>"આ તારીખ સુધીમાં કુલ ફીના આટલા ટકા ભરાઈ જવા જોઈએ." વિદ્યાર્થી, વાલી અને સ્ટાફ બધાને આગળની મુદત દેખાશે; મુદત વીતે એટલે બાકી યાદીમાં લાલ.</div></div>
    ${box("annual", "વાર્ષિક")}${box("half", "છ-માસિક")}
    <p class="hint">ઉદા. ₹11,500 ફી, છ-માસિક (50% અને 100%) → પહેલી મુદતે ₹5,750 અને બીજી મુદતે ₹11,500. કોઈ વિદ્યાર્થીની ખાસ મુદત તેની ફાઇલ → ફી માં રાખી શકાય.</p>`;
  $$("[data-ed]", v).forEach(b => b.onclick = () => schedEditor(sc[b.dataset.ed], async rows => {
    const nx = { ...sc, [b.dataset.ed]: rows, branchId: S.branchId, yearId: S.year };
    await setDoc(doc(db, "feeSched", k), nx);
    SCH[k] = nx; audit("fee.sched", k, JSON.stringify(nx)); toast("મુદત સચવાઈ."); route();
  }, b.dataset.ed === "half" ? "છ-માસિક મુદત" : "વાર્ષિક મુદત"));
});

// ================= ફી ડેશબોર્ડ =================
page("fees", async v => {
  if (!isFeeStaff()) { location.hash = "#/home"; return; }
  const today = ymd(), ym = today.slice(0, 7);
  const [rs, ds, sched, tq] = await Promise.all([
    getDoc(rosterRef()), getDoc(doc(db, "feeDays", `${S.branchId}_${ym}`)), loadSched(),
    getDocs(query(collection(db, "receipts"), where("branchId", "==", S.branchId), where("date", "==", today)))
  ]);
  const roster = Object.entries((rs.exists() && rs.data().list) || {}).map(([id, r]) => ({ id, ...r })).filter(r => r.x !== "cancelled");
  const days = (ds.exists() && ds.data().days) || {};
  const sum = o => MODES.reduce((a, [k]) => a + num(o?.[k]), 0);
  const td = days[today.slice(8, 10)] || {};
  const mTot = Object.values(days).reduce((a, d) => a + sum(d), 0), mN = Object.values(days).reduce((a, d) => a + num(d.n), 0);
  const P = roster.reduce((a, r) => a + num(r.p), 0), PD = roster.reduce((a, r) => a + Math.min(num(r.pd), num(r.p) || num(r.pd)), 0);
  const dueRows = roster.filter(r => num(r.p) > num(r.pd)).map(r => ({ ...r, info: dueInfo({ pay: r.p, paid: r.pd, plan: r.pl }, sched) }));
  const todayList = tq.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.no - a.no);
  const flt = JSON.parse(sessionStorage.getItem("gv_fflt") || '{"t":"over","b":""}');
  const batches = [...new Map(dueRows.filter(r => r.b).map(r => [r.b, r.bn])).entries()];
  v.innerHTML = `
    <h1 class="page-title">ફી</h1>
    <div class="grid2">
      <div class="card" style="gap:2px"><span class="sub">આજે</span><b class="big-num">${money(sum(td))}</b><span class="sub">${num(td.n)} પહોંચ${sum(td) ? " • " + MODES.filter(([k]) => num(td[k])).map(([k, l]) => `${l} ${money(td[k]).replace("₹ ", "")}`).join(" • ") : ""}</span></div>
      <div class="card" style="gap:2px"><span class="sub">આ મહિને</span><b class="big-num">${money(mTot)}</b><span class="sub">${mN} પહોંચ</span></div>
    </div>
    <div class="card" style="gap:4px"><div class="row-between"><span class="sub">આખા વર્ષની બાકી ફી</span><b class="big-num" style="color:#DC2626">${money(Math.max(0, P - PD))}</b></div>
      <div class="bar"><i style="width:${P ? Math.round(PD * 100 / P) : 0}%"></i></div>
      <span class="sub">${P ? Math.round(PD * 100 / P) : 0}% જમા • ${dueRows.length} વિદ્યાર્થીની ફી બાકી • ${dueRows.filter(r => r.info.over).length} ની મુદત વીતી</span></div>
    <div class="grid2"><a class="btn primary" href="#/pay">${ic("rupee", 18)} ફી લો</a><a class="btn line" href="#/oldpay">${ic("receipt", 18)} જૂની પહોંચો</a></div>
    ${isAdmin() ? `<a class="btn line big" href="#/sched">${ic("batch", 18)} હપ્તાની મુદત</a>` : ""}
    <div class="card" style="gap:0"><h2 style="margin-bottom:6px">આજની પહોંચો (${todayList.length})</h2>
      ${todayList.map(r => `<a class="srow" href="#/receipt/${encodeURIComponent(r.id)}"><span class="grow"><b>${esc(r.no)} • ${esc(r.name)}</b><span class="sub">${esc(modeName(r.mode))} • ${esc(r.byName || "")}</span></span><b>${money(r.amount)}</b></a>`).join("") || `<p class="muted">આજે હજુ કોઈ પહોંચ નથી.</p>`}</div>
    <div class="card" style="gap:0"><h2>બાકી ફી</h2>
      <div class="hscroll" style="margin:6px 0">${[["over", `મુદત વીતી (${dueRows.filter(r => r.info.over).length})`], ["all", `બધી બાકી (${dueRows.length})`]].map(([k, l]) => `<button type="button" class="chip ${flt.t === k ? "on" : ""}" data-ft="${k}">${l}</button>`).join("")}</div>
      ${batches.length ? `<div class="hscroll" style="margin-bottom:6px">${[["", "બધી બેચ"], ...batches].map(([k, l]) => `<button type="button" class="chip ${flt.b === k ? "on" : ""}" data-fb="${esc(k)}">${esc(l)}</button>`).join("")}</div>` : ""}
      <div id="frows"></div></div>
    <button type="button" class="btn line big" id="fcsv">${ic("dl", 18)} આખા વર્ષની પહોંચો Excel માં</button>`;
  const drawDue = () => {
    sessionStorage.setItem("gv_fflt", JSON.stringify(flt));
    const rows = dueRows.filter(r => flt.t === "all" || r.info.over).filter(r => !flt.b || r.b === flt.b)
      .sort((a, b) => (b.info.over?.amt || 0) - (a.info.over?.amt || 0) || (num(b.p) - num(b.pd)) - (num(a.p) - num(a.pd)));
    $("#frows").innerHTML = rows.slice(0, 200).map(r => {
      const amt = r.info.over?.amt || r.info.bal;
      const msg = `${ACADEMY.name}\nનમસ્તે, ${r.n} ની ફી ${money(amt)} ${r.info.over ? `ભરવાની મુદત ${fmtD(r.info.over.d)} હતી.` : "બાકી છે."} કુલ બાકી ${money(r.info.bal)}.\nવહેલી તકે ભરી દેવા વિનંતી. આભાર 🙏`;
      return `<div class="srow"><a class="grow" href="#/student/${encodeURIComponent(r.id)}" style="color:inherit;text-decoration:none"><b>${esc(r.n)}</b>
        <span class="sub" style="display:block">${cls(r.s, r.bn)}${r.info.over ? ` • <span class="due-over">મુદત ${fmtD(r.info.over.d)}</span>` : ""}</span></a>
        <b style="color:#DC2626">${money(amt)}</b>
        ${r.m ? `<a class="icon-btn" style="color:#15803D" target="_blank" rel="noopener" href="${waLink(r.m, msg)}" aria-label="WhatsApp યાદી">${ic("wa", 20)}</a>` : ""}</div>`;
    }).join("") || `<p class="muted center">${flt.t === "over" ? "કોઈની મુદત વીતી નથી ✓" : "કોઈની ફી બાકી નથી ✓"}</p>`;
  };
  $$("[data-ft]", v).forEach(b => b.onclick = () => { flt.t = b.dataset.ft; $$("[data-ft]", v).forEach(x => x.classList.toggle("on", x === b)); drawDue(); });
  $$("[data-fb]", v).forEach(b => b.onclick = () => { flt.b = b.dataset.fb; $$("[data-fb]", v).forEach(x => x.classList.toggle("on", x === b)); drawDue(); });
  $("#fcsv").onclick = e => busy(e.currentTarget, async () => {
    try {
      const q = await getDocs(query(collection(db, "receipts"), where("branchId", "==", S.branchId), where("yearId", "==", S.year)));
      const L = q.docs.map(d => d.data()).sort((a, b) => a.no - b.no);
      const head = ["પહોંચ નં.", "તારીખ", "ID", "નામ", "ધોરણ", "બેચ", "રકમ", "દ્વારા", "Ref", "જમા કરાવનાર", "જમા કરનાર", "કુલ ફી", "બાકી", "જૂની"];
      const rows = L.map(r => [r.no, r.date, r.studentId, r.name, r.std, r.batchName, r.amount, modeName(r.mode), r.ref, r.payer, r.byName, r.total, r.balance, r.legacy ? "હા" : ""]);
      const csv = "﻿" + [head, ...rows].map(a => a.map(x => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      a.download = `ફી_પહોંચો_${branchOf(S.branchId).name || ""}_${S.year}.csv`; a.click();
    } catch (e2) { fail(e2); }
  });
  drawDue();
});

// ================= વિદ્યાર્થી / વાલી: મારી ફી =================
page("myfees", async v => {
  const ids = S.me.role === "student" ? [S.me.loginId] : (S.profile?.childIds || []);
  const sched = await loadSched();
  const kids = (await Promise.all(ids.map(async id => {
    const s = await getDoc(doc(db, "students", id)).catch(() => null);
    if (!s?.exists() || s.data().status === "cancelled") return null;
    return { id, s: s.data(), list: await receiptsOf(id, s.data().branchId).catch(() => []) };
  }))).filter(Boolean);
  v.innerHTML = `<h1 class="page-title">ફી અને પહોંચો</h1>` + (kids.map(k => `
    <div class="card" style="gap:6px"><b>${esc(k.s.name)}</b><span class="sub">${esc(k.id)} • ${cls(k.s.std, k.s.batchName)}</span>
      <div class="kv"><span>${esc(k.s.fee?.plan || "વાર્ષિક")} ફી</span><b>${money(k.s.fee?.pay)}</b><span>જમા</span><b>${money(k.s.fee?.paid)}</b></div>
      ${dueLine(k.s.fee, sched, S.me.role)}
      ${k.list.map(r => `<a class="srow" href="#/receipt/${encodeURIComponent(r.id)}"><span class="ph" style="background:#E6F4EA;color:#15803D">${ic("receipt", 20)}</span>
        <span class="grow"><b>પહોંચ ${esc(r.no)} • ${money(r.amount)}</b><span class="sub">${fmtD(r.date)} • ${esc(modeName(r.mode))}</span></span></a>`).join("") || `<p class="muted">હજુ કોઈ પહોંચ નથી.</p>`}
    </div>`).join("") || `<div class="empty">માહિતી નથી.</div>`);
});
