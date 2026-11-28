// =============================================================
//  ફેઝ 1B ભાગ 5: મદદ (વાલી/વિદ્યાર્થી ↔ સંચાલક), આજની સૂચના, નામ વગર સૂચન
//  help/{sid}_{વર્ષ}        = { studentId, list: { tid: { cat, t, lv:{f,t}, st:"new|ans", at, up, by, bn, m: { mid: { at, by, bn, r, t } } } } }
//  helpIdx/{શાખા}_{વર્ષ}    = { list: { tid: { sid, n, cat, st, at, up, pv, fw } } }  ← ફક્ત સંચાલક વાંચે (1 વાંચન)
//  helpAnon/{શાખા}_{વર્ષ}   = { list: { aid: { cat, t, at } } }                      ← નામ વગર, ફક્ત સંચાલક વાંચે
//  helpFw/{શિક્ષક}_{વર્ષ}   = { list: { tid: { sid, n, cat, t, at, rep } } }          ← સંચાલકે મોકલેલા અભ્યાસના પ્રશ્નો
//  helpFaq/{શાખા}            = { list: [ { q, a } ] }
//  dayNotes/{શાખા}_{તારીખ}  = { list: { sid: { k, n, b, at, by } } }                 ← શિક્ષક હાજરી પાનાં પર જુએ
// =============================================================
import { db, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch, collection, query, where } from "./fb.js";
import { $, $$, esc, S, isAdmin, toast, fail, busy, audit, page, ic, fmtD, ymd, modal, closeModal, buzz, chime, route } from "./core.js";
import { ACADEMY } from "./config.js";
import { sendPush } from "./notify.js";

export const CAT = { fee: ["💰", "ફી"], study: ["📚", "અભ્યાસ"], time: ["🕘", "સમય / બેચ"], leave: ["📝", "રજા"], idea: ["💡", "સૂચન"], comp: ["😟", "ફરિયાદ"], other: ["💬", "બીજું"] };
export const DN = { late: ["⏰", "આજે મોડો આવશે"], early: ["🏃", "આજે વહેલો લઈ જવો છે"], absent: ["🏠", "આજે નહીં આવે"], leave: ["📝", "રજા મંજૂર"] };
const QUICK = ["✅ મંજૂર છે.", "📞 અમે તમને ફોન કરીશું.", "🙏 તમારી વાત ધ્યાનમાં લીધી છે, આભાર."];
const arg = i => decodeURIComponent(location.hash.split("/")[i] || "");
const fam = () => ["student", "parent"].includes(S.me?.role);
const first = n => { const p = String(n || "").trim().split(/\s+/); return p.length > 1 ? p[1] : p[0]; };
const ago = ms => { const m = Math.round((Date.now() - ms) / 6e4); return m < 60 ? `${Math.max(1, m)} મિનિટ પહેલાં` : m < 1440 ? `${Math.round(m / 60)} કલાક પહેલાં` : fmtD(ymd(new Date(ms))); };
const helpRef = sid => doc(db, "help", `${sid}_${S.year}`);
const idxRef = () => doc(db, "helpIdx", `${S.branchId}_${S.year}`);
const anonRef = () => doc(db, "helpAnon", `${S.branchId}_${S.year}`);
const fwRef = lid => doc(db, "helpFw", `${lid}_${S.year}`);
const faqRef = () => doc(db, "helpFaq", S.branchId);
const dnRef = d => doc(db, "dayNotes", `${S.branchId}_${d}`);
const get = async r => { try { const s = await getDoc(r); return s.exists() ? s.data() : {}; } catch { return {}; } };
const addDays = (d, n) => { const x = new Date(d + "T12:00"); x.setDate(x.getDate() + n); return ymd(x); };
const days = (f, t) => { const out = []; let d = f; while (d <= t && out.length < 31) { out.push(d); d = addDays(d, 1); } return out; };

// વાલીનાં બાળકો / વિદ્યાર્થી પોતે
async function myKids() {
  const ids = S.me.role === "student" ? [S.me.loginId] : (S.profile?.childIds || []);
  const ks = await Promise.all(ids.map(async id => { const s = await get(doc(db, "students", id)); return s.name ? { id, ...s } : null; }));
  return ks.filter(k => k && k.status !== "cancelled");
}

// ---------- હોમ પર નાનું કાર્ડ (વાલી/વિદ્યાર્થી) ----------
export function helpTileHtml() {
  return `<div class="grid2"><a class="tile" href="#/help">${ic("bell", 26)}<span>મદદ / સૂચન</span></a><a class="tile" href="#/help/today">${ic("clock", 26)}<span>આજની સૂચના</span></a></div>`;
}

// ================= વાલી/વિદ્યાર્થી: મદદ =================
page("help", async v => {
  if (!fam()) { location.hash = "#/helpdesk"; return; }
  const kids = await myKids(), focus = arg(2);
  if (!kids.length) { v.innerHTML = `<div class="empty">વિદ્યાર્થીની માહિતી મળી નહીં.</div>`; return; }
  const [H, faq] = await Promise.all([Promise.all(kids.map(k => get(helpRef(k.id)))), get(faqRef())]);
  const mine = kids.flatMap((k, i) => Object.entries(H[i].list || {}).filter(([, x]) => x).map(([tid, x]) => ({ tid, sid: k.id, kn: k.name, ...x }))).sort((a, b) => b.up - a.up);
  let kid = kids[0].id, cat = "", anon = false, dn = "";
  const dnKey = (sid, d = ymd()) => `gv_dn_${sid}_${d}`;
  const draw = () => {
    const sent = kids.map(k => ({ k, v: localStorage.getItem(dnKey(k.id)) })).filter(x => x.v);
    v.innerHTML = `
      <div class="row-between"><a class="btn line" href="#/home">${ic("back", 18)} હોમ</a><a class="btn line" href="tel:${esc(ACADEMY.phone)}">${ic("phone", 18)} ઑફિસ</a></div>
      ${kids.length > 1 ? `<div class="chips">${kids.map(k => `<button type="button" class="chip ${kid === k.id ? "on" : ""}" data-kid="${esc(k.id)}">${esc(first(k.name))}</button>`).join("")}</div>` : ""}
      <div class="card" id="today" style="gap:8px"><h2>🚸 આજની સૂચના</h2>
        <span class="sub">શિક્ષકને હાજરી વખતે દેખાશે.</span>
        <div class="chips">${["late", "early", "absent"].map(k => `<button type="button" class="chip ${dn === k ? "on" : ""}" data-dn="${k}">${DN[k][0]} ${DN[k][1]}</button>`).join("")}</div>
        ${dn ? `<button type="button" class="btn primary" id="dnsave">${ic("check", 18)} મોકલો</button>` : ""}
        ${sent.map(x => `<div class="row-between"><span class="sub">✓ ${esc(first(x.k.name))}: <b>${esc(DN[x.v]?.[1] || "")}</b></span><button type="button" class="link-btn" data-dnx="${esc(x.k.id)}">રદ કરો</button></div>`).join("")}</div>
      <form class="card form" id="hf" novalidate><h2>💬 નવી વાત</h2>
        <div class="chips">${Object.entries(CAT).map(([k, [e, l]]) => `<button type="button" class="chip ${cat === k ? "on" : ""}" data-cat="${k}">${e} ${l}</button>`).join("")}</div>
        ${cat === "leave" ? `<div class="grid2"><div class="field"><label for="lf">ક્યારથી</label><input id="lf" type="date" value="${ymd()}"></div><div class="field"><label for="lt">ક્યાં સુધી</label><input id="lt" type="date" value="${ymd()}"></div></div>` : ""}
        <div class="field"><label for="ht" class="sr">લખો</label><textarea id="ht" rows="3" maxlength="500" placeholder="${cat === "leave" ? "રજાનું કારણ લખો" : "તમારી વાત લખો"}"></textarea></div>
        ${["idea", "comp"].includes(cat) ? `<label class="chk"><input type="checkbox" id="anon" ${anon ? "checked" : ""}> 🔒 નામ વગર મોકલો <span class="sub">(સંચાલકને પણ નામ નહીં દેખાય, જવાબ નહીં આવે)</span></label>` : ""}
        <button class="btn primary big" type="submit">મોકલો</button></form>
      ${mine.length ? `<div class="card" style="gap:0"><h2 style="margin-bottom:4px">મારી વાત</h2>
        ${mine.map(x => `<a class="lrow" href="#/hticket/${encodeURIComponent(x.sid)}/${encodeURIComponent(x.tid)}"><span class="grow"><b>${CAT[x.cat]?.[0] || "💬"} ${esc(String(x.t).slice(0, 40))}${String(x.t).length > 40 ? "…" : ""}</b>
          <span class="sub" style="display:block">${kids.length > 1 ? esc(first(x.kn)) + " • " : ""}${ago(x.up)}</span></span>
          <span class="pill ${x.st === "ans" ? "ok" : "warn"}">${x.st === "ans" ? "જવાબ ✓" : "જોવાય છે"}</span></a>`).join("")}</div>` : ""}
      ${(faq.list || []).length ? `<div class="card" style="gap:0"><h2 style="margin-bottom:4px">❓ વારંવાર પૂછાતા પ્રશ્નો</h2>
        ${faq.list.map(f => `<details class="faq"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}</div>` : ""}`;
    if (focus === "today") $("#today", v)?.scrollIntoView({ block: "start" });
    $$("[data-kid]", v).forEach(c => c.onclick = () => { kid = c.dataset.kid; draw(); });
    $$("[data-dn]", v).forEach(c => c.onclick = () => { dn = dn === c.dataset.dn ? "" : c.dataset.dn; const t = $("#ht", v).value; draw(); $("#ht", v).value = t; });
    $$("[data-cat]", v).forEach(c => c.onclick = () => { cat = c.dataset.cat; anon = false; const t = $("#ht", v).value; draw(); $("#ht", v).value = t; $("#ht", v).focus(); });
    $("#anon", v)?.addEventListener("change", e => { anon = e.target.checked; });
    $("#dnsave", v)?.addEventListener("click", e => busy(e.currentTarget, async () => {
      const k = kids.find(x => x.id === kid);
      try { await setDoc(dnRef(ymd()), { branchId: S.branchId, date: ymd(), last: kid, list: { [kid]: { k: dn, n: k.name, b: k.batchId || "", at: Date.now(), by: S.me.loginId } } }, { merge: true }); }
      catch (e2) { return fail(e2); }
      localStorage.setItem(dnKey(kid), dn); buzz("done"); toast("શિક્ષકને જાણ થઈ જશે."); dn = ""; draw();
    }));
    $$("[data-dnx]", v).forEach(b => b.onclick = () => busy(b, async () => {
      const sid = b.dataset.dnx;
      try { await updateDoc(dnRef(ymd()), { last: sid, [`list.${sid}`]: null }); } catch (e2) { return fail(e2); }
      localStorage.removeItem(dnKey(sid)); toast("સૂચના રદ કરી."); draw();
    }));
    $("#hf").onsubmit = e => {
      e.preventDefault();
      const t = $("#ht", v).value.trim();
      if (!cat) return toast("શેના વિશે છે તે પસંદ કરો.", true);
      if (t.length < 3) return toast("તમારી વાત લખો.", true);
      const lv = cat === "leave" ? { f: $("#lf", v).value, t: $("#lt", v).value } : null;
      if (lv && (!lv.f || !lv.t || lv.t < lv.f)) return toast("રજાની તારીખ બરાબર પસંદ કરો.", true);
      busy($('#hf [type="submit"]', v), async () => {
        const k = kids.find(x => x.id === kid), now = Date.now();
        try {
          if (anon) {
            const aid = `a${now.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
            await setDoc(anonRef(), { branchId: S.branchId, yearId: S.year, last: aid, list: { [aid]: { cat, t, at: now } } }, { merge: true });
            sendPush([{ to: { admin: true }, tag: `help_${aid}`, link: "#/helpdesk", title: "🔒 નામ વગરનું " + CAT[cat][1], body: "એક વિદ્યાર્થીએ નામ વગર " + CAT[cat][1] + " મોકલ્યું છે. મદદ ઇનબોક્સમાં જુઓ." }]);
            toast("નામ વગર મોકલાયું. આભાર 🙏"); buzz("done"); cat = ""; anon = false; draw(); return;
          }
          const tid = `${kid}_${now.toString(36)}`;
          const x = { cat, t, lv, st: "new", at: now, up: now, by: S.me.loginId, bn: S.me.role === "parent" ? "વાલી" : first(k.name), m: {} };
          await setDoc(helpRef(kid), { branchId: S.branchId, yearId: S.year, studentId: kid, list: { [tid]: x } }, { merge: true });
          await setDoc(idxRef(), { branchId: S.branchId, yearId: S.year, last: tid, list: { [tid]: { sid: kid, n: k.name, cat, st: "new", at: now, up: now, pv: t.slice(0, 70) } } }, { merge: true });
          sendPush([{ to: { admin: true }, tag: `help_${tid}`, link: `#/hticket/${kid}/${tid}`, title: `${CAT[cat][0]} ${CAT[cat][1]}: ${first(k.name)}`, body: `${k.name}: ${t.slice(0, 90)}` }]);
          mine.unshift({ tid, sid: kid, kn: k.name, ...x });
        } catch (e2) { return fail(e2); }
        chime([523, 659, 784]); buzz("done"); toast("મોકલાયું. જવાબ આવશે એટલે નોટિફિકેશન આવશે."); cat = ""; draw();
      });
    };
  };
  draw();
});

// ================= એક વાત: વાતચીત (વાલી, સંચાલક, શિક્ષક) =================
page("hticket", async v => {
  const sid = arg(2), tid = arg(3), role = S.me.role, adm = isAdmin(), tch = role === "teacher";
  let x = null, fw = null;
  if (tch) { fw = (await get(fwRef(S.me.loginId))).list?.[tid]; if (fw) x = { cat: fw.cat, t: fw.t, at: fw.at, bn: fw.bn, m: fw.m || {}, st: fw.rep ? "ans" : "new" }; }
  else x = (await get(helpRef(sid))).list?.[tid];
  if (!x) { v.innerHTML = `<div class="empty">આ વાત મળી નહીં.</div>`; return; }
  const idx = adm ? (await get(idxRef())).list?.[tid] || {} : {};
  const name = adm ? idx.n : tch ? fw.n : "";
  let TEACH = null;
  const msgs = () => Object.entries(x.m || {}).filter(([, m]) => m).map(([mid, m]) => ({ mid, ...m })).sort((a, b) => a.at - b.at);
  const draw = () => {
    v.innerHTML = `
      <div class="row-between"><a class="btn line" href="${adm ? "#/helpdesk" : tch ? "#/home" : "#/help"}">${ic("back", 18)} પાછા</a>${name ? `<a class="btn line" href="#/student/${encodeURIComponent(sid)}">${esc(first(name))} ની ફાઇલ</a>` : ""}</div>
      <div class="card" style="gap:6px"><div class="row-between"><h2>${CAT[x.cat]?.[0] || "💬"} ${esc(CAT[x.cat]?.[1] || "")}</h2><span class="pill ${x.st === "ans" ? "ok" : "warn"}">${x.st === "ans" ? "જવાબ આપ્યો" : "નવી"}</span></div>
        ${name ? `<span class="sub">${esc(name)} • ${esc(x.bn || "")}</span>` : ""}
        ${x.lv ? `<span><b>📅 રજા: ${fmtD(x.lv.f)}${x.lv.t !== x.lv.f ? " થી " + fmtD(x.lv.t) : ""}</b></span>` : ""}
        <p class="dtxt" style="margin:0">${esc(x.t)}</p><span class="sub">${ago(x.at)}</span></div>
      ${msgs().map(m => `<div class="msg ${m.r === "fam" ? "me" : ""} ${m.r === "fam" && fam() ? "mine" : ""}"><p>${esc(m.t)}</p><span class="sub">${esc(m.r === "adm" ? "ગાંડિવ એકેડેમી" : m.r === "tch" ? "શિક્ષક" : m.bn)} • ${ago(m.at)}</span></div>`).join("")}
      <div class="card form" style="gap:8px">
        ${adm || tch ? `<div class="chips">${QUICK.map((q, i) => `<button type="button" class="chip" data-q="${i}">${esc(q)}</button>`).join("")}</div>` : ""}
        <textarea id="rt" rows="2" maxlength="500" placeholder="${fam() ? "વધુ કંઈ કહેવું હોય તો લખો" : "જવાબ લખો"}"></textarea>
        <button type="button" class="btn primary" id="rsend">${ic("check", 18)} ${fam() ? "મોકલો" : "જવાબ મોકલો"}</button>
        ${adm && x.cat === "leave" && x.lv && !x.lvOk ? `<button type="button" class="btn line" id="lvok">✅ રજા મંજૂર (હાજરીમાં આપમેળે "રજા")</button>` : ""}
        ${adm && x.lvOk ? `<span class="sub">✓ હાજરીમાં ${fmtD(x.lv.f)}${x.lv.t !== x.lv.f ? "–" + fmtD(x.lv.t) : ""} "રજા" ગોઠવાઈ છે.</span>` : ""}
        ${adm && x.cat === "study" ? `<button type="button" class="btn line" id="fwd">👩‍🏫 શિક્ષકને મોકલો${idx.fw ? ` <span class="sub">(${esc(Object.values(idx.fw).join(", "))})</span>` : ""}</button>` : ""}
      </div>`;
    $$("[data-q]", v).forEach(c => c.onclick = () => { $("#rt", v).value = QUICK[+c.dataset.q]; $("#rt", v).focus(); });
    $("#rsend", v).onclick = e => { const t = $("#rt", v).value.trim(); if (t.length < 2) return toast("લખો.", true); busy(e.currentTarget, () => reply(t)); };
    $("#lvok", v)?.addEventListener("click", e => busy(e.currentTarget, approveLeave));
    $("#fwd", v)?.addEventListener("click", e => busy(e.currentTarget, forward));
  };
  const reply = async t => {
    const now = Date.now(), mid = `m${now.toString(36)}`, r = adm ? "adm" : tch ? "tch" : "fam";
    const m = { at: now, by: S.me.loginId, bn: S.profile?.name || "", r, t };
    const st = r === "fam" ? "new" : "ans";
    try {
      const w = writeBatch(db);
      w.update(helpRef(sid), { [`list.${tid}.m.${mid}`]: m, [`list.${tid}.st`]: st, [`list.${tid}.up`]: now });
      w.update(idxRef(), { last: tid, [`list.${tid}.st`]: st, [`list.${tid}.up`]: now });
      if (tch) w.update(fwRef(S.me.loginId), { [`list.${tid}.rep`]: 1, [`list.${tid}.m.${mid}`]: m });
      await w.commit();
    } catch (e2) { return fail(e2); }
    x.m = { ...(x.m || {}), [mid]: m }; x.st = st;
    if (r === "fam") sendPush([{ to: { admin: true }, tag: `help_${tid}`, link: `#/hticket/${sid}/${tid}`, title: "💬 મદદ: નવો સંદેશ", body: t.slice(0, 100) }]);
    else sendPush([{ to: { sids: [sid] }, tag: `helpr_${tid}`, link: `#/hticket/${sid}/${tid}`, title: "💬 ગાંડિવ એકેડેમીનો જવાબ", body: t.slice(0, 120) },
      ...(tch ? [{ to: { admin: true }, tag: `helpt_${tid}`, link: `#/hticket/${sid}/${tid}`, title: "👩‍🏫 શિક્ષકે જવાબ આપ્યો", body: `${first(fw.n)}: ${t.slice(0, 90)}` }] : [])]);
    audit(r === "fam" ? "help.msg" : "help.reply", tid, x.cat); buzz("done"); toast("મોકલાયું."); draw();
  };
  const approveLeave = async () => {
    const st = await get(doc(db, "students", sid)), ds = days(x.lv.f, x.lv.t), now = Date.now();
    try {
      const w = writeBatch(db);
      ds.forEach(d => w.set(dnRef(d), { branchId: S.branchId, date: d, last: sid, list: { [sid]: { k: "leave", n: st.name || name, b: st.batchId || "", at: now, by: S.me.loginId } } }, { merge: true }));
      w.update(helpRef(sid), { [`list.${tid}.lvOk`]: 1 });
      await w.commit();
    } catch (e2) { return fail(e2); }
    x.lvOk = 1; audit("help.leaveOk", sid, `${x.lv.f}→${x.lv.t}`);
    await reply(`✅ ${fmtD(x.lv.f)}${x.lv.t !== x.lv.f ? " થી " + fmtD(x.lv.t) : ""} ની રજા મંજૂર છે. ગૃહકાર્ય ડાયરીમાં જોઈ લેજો.`);
  };
  const forward = async () => {
    if (TEACH === null) {
      try { const q = await getDocs(query(collection(db, "users"), where("branchId", "==", S.branchId), where("role", "==", "teacher"))); TEACH = q.docs.map(d => d.data()).filter(u => u.active !== false); }
      catch (e2) { return fail(e2); }
    }
    const d = modal("કયા શિક્ષકને મોકલવું?", `<div class="stack">${TEACH.map(u => `<button type="button" class="btn line" data-t="${esc(u.loginId)}">${esc(u.name)}</button>`).join("") || `<p class="muted">કોઈ શિક્ષક નથી.</p>`}</div>`);
    $$("[data-t]", d).forEach(b => b.onclick = () => busy(b, async () => {
      const u = TEACH.find(y => y.loginId === b.dataset.t);
      try {
        const w = writeBatch(db);
        w.set(fwRef(u.loginId), { branchId: S.branchId, yearId: S.year, teacher: u.loginId, list: { [tid]: { sid, n: name, cat: x.cat, t: x.t, at: x.at, bn: x.bn || "", rep: 0, m: {} } } }, { merge: true });
        w.update(idxRef(), { last: tid, [`list.${tid}.fw.${u.loginId}`]: u.name });
        await w.commit();
      } catch (e2) { return fail(e2); }
      idx.fw = { ...(idx.fw || {}), [u.loginId]: u.name };
      sendPush([{ to: { lids: [u.loginId] }, tag: `helpf_${tid}`, link: `#/hticket/${sid}/${tid}`, title: "📚 વિદ્યાર્થીનો પ્રશ્ન", body: `${first(name)}: ${String(x.t).slice(0, 90)}` }]);
      audit("help.forward", tid, u.loginId); closeModal(); toast(`${u.name} ને મોકલ્યું.`); draw();
    }));
  };
  draw();
});

// ================= સંચાલક: મદદ ઇનબોક્સ =================
export async function helpNewCount() {
  if (!isAdmin()) return 0;
  const [I, A] = await Promise.all([get(idxRef()), get(anonRef())]);
  const seen = +localStorage.getItem(`gv_anon_${S.branchId}`) || 0;
  return Object.values(I.list || {}).filter(x => x && x.st === "new").length + Object.values(A.list || {}).filter(a => a && a.at > seen).length;
}
page("helpdesk", async v => {
  if (!isAdmin()) { location.hash = "#/home"; return; }
  const [I, A, F] = await Promise.all([get(idxRef()), get(anonRef()), get(faqRef())]);
  const L = Object.entries(I.list || {}).filter(([, x]) => x).map(([tid, x]) => ({ tid, ...x })).sort((a, b) => b.up - a.up);
  const AN = Object.entries(A.list || {}).filter(([, x]) => x).map(([aid, x]) => ({ aid, ...x })).sort((a, b) => b.at - a.at);
  const seenKey = `gv_anon_${S.branchId}`, seen = +localStorage.getItem(seenKey) || 0;
  let f = sessionStorage.getItem("gv_hdf") || "new", faq = [...(F.list || [])];
  const draw = () => {
    const by = { new: x => x.st === "new", ans: x => x.st === "ans", all: () => true };
    const list = f === "anon" ? [] : L.filter(by[f]);
    v.innerHTML = `
      <h1 class="page-title" style="margin:0">💬 મદદ ઇનબોક્સ</h1>
      <div class="hscroll">${[["new", "નવી", L.filter(by.new).length], ["ans", "જવાબ આપ્યો", L.filter(by.ans).length], ["anon", "🔒 નામ વગર", AN.filter(a => a.at > seen).length || AN.length], ["all", "બધી", L.length]]
        .map(([k, l, n]) => `<button type="button" class="chip ${f === k ? "on" : ""}" data-f="${k}">${l} ${n}</button>`).join("")}</div>
      ${f === "anon" ? `<div class="card" style="gap:0">${AN.map(a => `<div class="lgrow"><span class="nic" style="width:34px;height:34px;font-size:17px">${CAT[a.cat]?.[0] || "💬"}</span>
          <span class="grow"><b>${esc(CAT[a.cat]?.[1] || "")}</b>${a.at > seen ? ` <span class="pill blue" style="display:inline-block">નવું</span>` : ""}<p class="dtxt" style="margin:4px 0">${esc(a.t)}</p><span class="sub">${ago(a.at)} • નામ વગર</span></span>
          <button type="button" class="icon-btn" data-adel="${esc(a.aid)}" aria-label="કાઢો">${ic("x", 18)}</button></div>`).join("") || `<p class="muted" style="margin:10px 0">કોઈ નથી.</p>`}</div>`
        : `<div class="card" style="gap:0">${list.map(x => `<a class="lrow" href="#/hticket/${encodeURIComponent(x.sid)}/${encodeURIComponent(x.tid)}"><span class="grow"><b>${CAT[x.cat]?.[0] || "💬"} ${esc(x.n)}</b>
          <span class="sub" style="display:block">${esc(CAT[x.cat]?.[1] || "")} • "${esc(x.pv || "")}" • ${ago(x.up)}${x.fw ? " • 👩‍🏫 " + esc(Object.values(x.fw).join(", ")) : ""}</span></span>
          <span class="pill ${x.st === "ans" ? "ok" : "blue"}">${x.st === "ans" ? "જવાબ ✓" : "નવી"}</span></a>`).join("") || `<p class="muted" style="margin:10px 0">${f === "new" ? "કોઈ નવી વાત નથી 🎉" : "કોઈ નથી."}</p>`}</div>`}
      <details class="card faqed"><summary><b>❓ વારંવાર પૂછાતા પ્રશ્નો</b> <span class="sub">(વાલીને મદદ પાનાં પર દેખાશે • ${faq.length})</span></summary>
        <div class="stack" style="margin-top:8px">${faq.map((q, i) => `<div class="faqrow"><input data-fq="${i}" value="${esc(q.q)}" placeholder="પ્રશ્ન"><textarea data-fa="${i}" rows="2" placeholder="જવાબ">${esc(q.a)}</textarea>
          <button type="button" class="link-btn" data-fx="${i}">કાઢો</button></div>`).join("")}
          <button type="button" class="btn line" id="fqadd">${ic("plus", 18)} પ્રશ્ન ઉમેરો</button>
          <button type="button" class="btn primary" id="fqsave">${ic("check", 18)} સાચવો</button></div></details>`;
    const keep = () => { faq = faq.map((q, i) => ({ q: $(`[data-fq="${i}"]`, v)?.value ?? q.q, a: $(`[data-fa="${i}"]`, v)?.value ?? q.a })); };
    $$("[data-f]", v).forEach(c => c.onclick = () => { keep(); f = c.dataset.f; sessionStorage.setItem("gv_hdf", f); draw(); if (f === "anon") localStorage.setItem(seenKey, String(Date.now())); });
    $("#fqadd", v).onclick = () => { keep(); faq.push({ q: "", a: "" }); draw(); $(".faqed", v).open = true; $(`[data-fq="${faq.length - 1}"]`, v)?.focus(); };
    $$("[data-fx]", v).forEach(b => b.onclick = () => { keep(); faq.splice(+b.dataset.fx, 1); draw(); $(".faqed", v).open = true; });
    $("#fqsave", v).onclick = e => { keep(); const clean = faq.map(q => ({ q: q.q.trim(), a: q.a.trim() })).filter(q => q.q && q.a);
      busy(e.currentTarget, async () => { try { await setDoc(faqRef(), { branchId: S.branchId, list: clean }); } catch (e2) { return fail(e2); }
        faq = clean; audit("help.faq", S.branchId, String(clean.length)); toast("સચવાયું."); buzz("done"); draw(); $(".faqed", v).open = true; }); };
    $$("[data-adel]", v).forEach(b => b.onclick = () => busy(b, async () => {
      const aid = b.dataset.adel;
      try { await updateDoc(anonRef(), { last: aid, [`list.${aid}`]: null }); } catch (e2) { return fail(e2); }
      const i = AN.findIndex(a => a.aid === aid); if (i >= 0) AN.splice(i, 1); draw();
    }));
    if (f === "anon") localStorage.setItem(seenKey, String(Date.now()));
  };
  draw();
});

// ================= શિક્ષક: મોકલેલા પ્રશ્નો (હોમ પર) =================
export async function teacherHelpHtml() {
  if (S.me?.role !== "teacher") return "";
  const L = Object.entries((await get(fwRef(S.me.loginId))).list || {}).filter(([, x]) => x && !x.rep);
  if (!L.length) return "";
  return `<div class="card" style="gap:0"><h2 style="margin-bottom:4px">📚 વિદ્યાર્થીના પ્રશ્ન • ${L.length}</h2>
    ${L.map(([tid, x]) => `<a class="lrow" href="#/hticket/${encodeURIComponent(x.sid)}/${encodeURIComponent(tid)}"><span class="grow"><b>${esc(x.n)}</b><span class="sub" style="display:block">"${esc(String(x.t).slice(0, 60))}"</span></span><span class="sub">→</span></a>`).join("")}</div>`;
}

// ================= હાજરી પાનાં માટે: આજની સૂચના =================
export async function dayNotes(date) { return (await get(dnRef(date))).list || {}; }
