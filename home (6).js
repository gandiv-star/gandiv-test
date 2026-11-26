// =============================================================
//  ભાગ 7: Master/સંચાલકનું ડેશબોર્ડ, શોધ, જન્મદિવસનાં પોસ્ટર (4 ડિઝાઇન, canvas થી)
// =============================================================
import { db, collection, doc, getDoc, getDocs, query, where, updateDoc } from "./fb.js";
import { $, $$, esc, S, isAdmin, isMaster, canAdmit, toast, page, ic, route, money, fmtD, ymd, z2, waLink, buzz, say } from "./core.js";
import { ACADEMY } from "./config.js";
import { dueInfo, loadSched } from "./fees.js";
import { homeNoticeHtml, wirePushAsk } from "./notify.js";

const rosterRef = () => doc(db, "rosters", `${S.branchId}_${S.year}`);
const branchName = id => S.branches.find(b => b.id === id)?.name || "";
const isStaffish = () => canAdmit() || ["teacher", "receptionist", "accountant"].includes(S.me?.role);
const mmdd = d => String(d || "").slice(5, 10);
export const isBday = dob => !!dob && mmdd(dob) === ymd().slice(5, 10);
export const ageOn = dob => { if (!dob) return null; const [y, m, d] = dob.split("-").map(Number), t = new Date(); let a = t.getFullYear() - y; if (t.getMonth() + 1 < m || (t.getMonth() + 1 === m && t.getDate() < d)) a--; return a > 0 && a < 40 ? a : null; };
const shortName = n => { const p = String(n || "").trim().split(/\s+/); return p.length >= 2 ? `${p[1]} ${p[0]}` : p[0] || ""; };

// ---------- ગુજરાતી નામ અંગ્રેજીમાં લખીને શોધી શકાય ("ravi" → રવિ) ----------
const CONS = { ક: "k", ખ: "kh", ગ: "g", ઘ: "gh", ઙ: "n", ચ: "ch", છ: "chh", જ: "j", ઝ: "jh", ઞ: "n", ટ: "t", ઠ: "th", ડ: "d", ઢ: "dh", ણ: "n", ત: "t", થ: "th", દ: "d", ધ: "dh", ન: "n", પ: "p", ફ: "f", બ: "b", ભ: "bh", મ: "m", ય: "y", ર: "r", લ: "l", ળ: "l", વ: "v", શ: "sh", ષ: "sh", સ: "s", હ: "h" };
const VOW = { અ: "a", આ: "a", ઇ: "i", ઈ: "i", ઉ: "u", ઊ: "u", એ: "e", ઐ: "ai", ઓ: "o", ઔ: "au", ઋ: "ru", "ઍ": "e", "ઑ": "o" };
const MAT = { "ા": "a", "િ": "i", "ી": "i", "ુ": "u", "ૂ": "u", "ે": "e", "ૈ": "ai", "ો": "o", "ૌ": "au", "ૃ": "ru", "ૅ": "e", "ૉ": "o" };
function roman(s) {
  let out = "", ch = [...String(s || "")];
  ch.forEach((c, i) => {
    const nx = ch[i + 1];
    if (CONS[c]) out += CONS[c] + (MAT[nx] || nx === "્" ? "" : "a");
    else if (MAT[c]) out += MAT[c];
    else if (VOW[c]) out += VOW[c];
    else if (c === "ં" || c === "ઁ") out += "n";
    else if (c !== "્") out += c;
  });
  return out;
}
// "હાડપિંજર" — સ્વર વગરનું રૂપ, જેથી rav/ravi/raavi બધું મળે
const skel = s => String(s || "").toLowerCase()
  .replace(/chh|ch/g, "c").replace(/sh/g, "s").replace(/ph/g, "f").replace(/kh/g, "k").replace(/gh/g, "g")
  .replace(/th/g, "t").replace(/dh/g, "d").replace(/bh/g, "b").replace(/jh/g, "j").replace(/w/g, "v").replace(/z/g, "j")
  .replace(/ee/g, "i").replace(/oo/g, "u").replace(/[^a-z0-9]/g, "").replace(/[ah]/g, "").replace(/(.)\1+/g, "$1");
export function nameMatch(name, q, en = "") {
  q = String(q || "").trim().toLowerCase(); if (!q) return false;
  if (String(name).toLowerCase().includes(q) || String(en).toLowerCase().includes(q)) return true;
  if (!/[a-z\u0A80-\u0AFF]/.test(q) || q.length < 2) return false;
  // દરેક શબ્દ અલગથી મળવો જોઈએ ("jay patel" = "પટેલ જય")
  const hay = [skel(roman(name)), skel(en)], words = q.split(/\s+/).map(w => skel(/[a-z]/.test(w) ? w : roman(w))).filter(w => w.length >= 1);
  if (!words.length || words.join("").length < 2) return false;
  return hay.some(h => h && words.every(w => h.includes(w)));
}

// ================= ડેશબોર્ડ (Master / સંચાલક) =================
const onHome = () => ["", "home"].includes(location.hash.replace(/^#\/?/, "").split("/")[0]);
export async function dashboard(v) {
  if (!S.branches.length) {
    v.innerHTML = `<div class="card hello"><h1>નમસ્તે, ${esc(S.profile?.name || "")}</h1><p>${esc(ACADEMY.name)}</p></div>
      <div class="card warn"><h2>પહેલું પગલું: શાખા ઉમેરો</h2><p>હજુ કોઈ શાખા નથી. ગોઠવણમાં જઈને મહુવા શાખા ઉમેરો.</p><a class="btn primary" href="#/settings">ગોઠવણ ખોલો</a></div>`;
    return;
  }
  const ME = S.me.loginId, today = ymd(), ym = today.slice(0, 7), dd = today.slice(8, 10);
  const pym = (() => { const d = new Date(+ym.slice(0, 4), +ym.slice(5) - 2, 1); return `${d.getFullYear()}-${z2(d.getMonth() + 1)}`; })();
  const [rs, bq, fd, sched] = await Promise.all([
    getDoc(rosterRef()),
    getDocs(query(collection(db, "batches"), where("branchId", "==", S.branchId), where("yearId", "==", S.year))),
    getDoc(doc(db, "feeDays", `${S.branchId}_${ym}`)).catch(() => null), loadSched()
  ]);
  const roster = Object.entries((rs.exists() && rs.data().list) || {}).map(([id, r]) => ({ id, ...r })).filter(r => r.x !== "cancelled");
  const batches = bq.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => b.active !== false).sort((a, b) => String(a.start || "99").localeCompare(String(b.start || "99")));
  const grab = id => getDoc(doc(db, "attendance", id)).then(s => s.exists() ? s.data() : null).catch(() => null);
  const [cur, prev] = await Promise.all([Promise.all(batches.map(b => grab(`${b.id}_${ym}`))), Promise.all(batches.map(b => grab(`${b.id}_${pym}`)))]);
  if (S.me?.loginId !== ME || !v.isConnected || !onHome()) return;
  const ids = b => roster.filter(r => r.b === b.id).map(r => r.id);
  // જૂની યાદીમાં જન્મ તારીખ ન હોય તો એક વાર વિદ્યાર્થી ફાઇલોમાંથી ભરી દો
  if (isAdmin() && roster.some(r => !("d" in r))) {
    const fk = `gv_rfix_${S.branchId}_${S.year}`;
    if (!sessionStorage.getItem(fk)) {
      sessionStorage.setItem(fk, "1");
      getDocs(query(collection(db, "students"), where("branchId", "==", S.branchId))).then(async qs => {
        const up = {};
        qs.forEach(d => { const r = roster.find(x => x.id === d.id); if (r && !("d" in r)) { const x = d.data(); up[`list.${d.id}.d`] = x.dob || ""; up[`list.${d.id}.e`] = x.nameEn || ""; } });
        if (!Object.keys(up).length) return;
        await updateDoc(rosterRef(), up);
        if (S.me?.loginId === ME && v.isConnected && onHome()) dashboard(v);
      }).catch(e => console.warn("roster fix", e));
    }
  }
  // આજની હાજરી
  const tot = { p: 0, a: 0, l: 0 }; const pending = [];
  batches.forEach((b, i) => {
    const day = cur[i]?.days?.[dd];
    if (!day) { if (ids(b).length) pending.push(b); return; }
    if (day.hol) return;
    ids(b).forEach(id => { const st = day.s?.[id] || "p"; if (tot[st] != null) tot[st]++; });
  });
  const base = tot.p + tot.l + tot.a, pct = base ? Math.round((tot.p + tot.l) * 100 / base) : null;
  // ફી
  const days = (fd?.exists() && fd.data().days) || {}, td = days[dd] || {};
  const tMoney = ["cash", "upi", "cheque", "bank"].reduce((a, k) => a + (Number(td[k]) || 0), 0);
  const P = roster.reduce((a, r) => a + (Number(r.p) || 0), 0), PD = roster.reduce((a, r) => a + Math.min(Number(r.pd) || 0, Number(r.p) || Number(r.pd) || 0), 0);
  const over = roster.filter(r => Number(r.p) > Number(r.pd) && dueInfo({ pay: r.p, paid: r.pd, plan: r.pl }, sched).over);
  // વારંવાર ગેરહાજર (30 દિવસ, 3+ વાર)
  const from = ymd(new Date(Date.now() - 30 * 864e5)), cnt = {};
  [...cur, ...prev].forEach(a => a && Object.entries(a.days || {}).forEach(([d, day]) => {
    const full = `${a.ym}-${d}`; if (full < from || full > today || day.hol) return;
    Object.entries(day.s || {}).forEach(([sid, st]) => { if (st === "a") cnt[sid] = (cnt[sid] || 0) + 1; });
  }));
  const often = Object.values(cnt).filter(n => n >= 3).length;
  const loginsDue = roster.filter(r => r.l === 0).length;
  const bdays = isMaster() ? [] : roster.filter(r => isBday(r.d)); // જન્મદિવસ: સંચાલક જુએ, માસ્ટર નહીં
  // આ અઠવાડિયું (સોમ–શનિ)
  const t0 = new Date(today + "T00:00:00"), mon = new Date(t0); mon.setDate(t0.getDate() - ((t0.getDay() + 6) % 7));
  const week = ["સો", "મં", "બુ", "ગુ", "શુ", "શ"].map((lbl, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i); const ds = ymd(d), dym = ds.slice(0, 7), ddd = ds.slice(8, 10);
    const c = { p: 0, a: 0, l: 0 };
    batches.forEach((b, j) => { const a = dym === ym ? cur[j] : dym === pym ? prev[j] : null, day = a?.days?.[ddd]; if (!day || day.hol) return; ids(b).forEach(id => { const st = day.s?.[id] || "p"; if (c[st] != null) c[st]++; }); });
    const n = c.p + c.l + c.a; return { lbl, pct: n ? Math.round((c.p + c.l) * 100 / n) : null, future: ds > today };
  });
  const lakh = n => n >= 1e5 ? `₹ ${(n / 1e5).toFixed(1).replace(/\.0$/, "")} લાખ` : money(n);
  const todo = [
    pending.length && [pending.length, "#DC2626", pending.length === 1 ? pending[0].name : `${pending.length} બેચ`, `હાજરી હજુ લેવાઈ નથી${pending.length === 1 && pending[0].start ? ` (${pending[0].start})` : ""}`, "#/att"],
    over.length && [over.length, "#F97316", "ફીની મુદત વીતી", "WhatsApp યાદી મોકલો", "#/fees"],
    often && [often, "#6D28D9", "વારંવાર ગેરહાજર", "30 દિવસમાં 3+ વાર", "#/att"],
    loginsDue && [loginsDue, "#0E7490", "લોગિન બનાવવાના બાકી", "જૂનાં ફોર્મ", "#/old"]
  ].filter(Boolean);
  const noticeHtml = await homeNoticeHtml().catch(() => "");
  if (S.me?.loginId !== ME || !v.isConnected || !onHome()) return;
  const d0 = new Date();
  v.innerHTML = `
    <div class="row-between"><div><h1 class="page-title" style="margin:0">નમસ્તે, ${esc(String(S.profile?.name || "").split(" ")[0])}</h1>
      <span class="sub">${["રવિવાર", "સોમવાર", "મંગળવાર", "બુધવાર", "ગુરુવાર", "શુક્રવાર", "શનિવાર"][d0.getDay()]}, ${d0.getDate()} ${["જાન્યુઆરી", "ફેબ્રુઆરી", "માર્ચ", "એપ્રિલ", "મે", "જૂન", "જુલાઈ", "ઑગસ્ટ", "સપ્ટેમ્બર", "ઑક્ટોબર", "નવેમ્બર", "ડિસેમ્બર"][d0.getMonth()]} • ${esc(branchName(S.branchId))}</span></div>
      <a class="icon-btn boxed" href="#/search" aria-label="શોધો">${ic("search")}</a></div>
    ${noticeHtml}
    <div class="dash">
      <a href="#/att"><span class="sub">આજની હાજરી</span><b style="color:${pct == null ? "var(--muted)" : pct < 75 ? "#DC2626" : "#15803D"}">${pct == null ? "—" : pct + "%"}</b><span class="sub">${base ? `${tot.a} ગેરહાજર • ${tot.l} મોડા` : "હજુ લેવાઈ નથી"}</span></a>
      <a href="#/fees"><span class="sub">આજનો ફી વકરો</span><b>${money(tMoney)}</b><span class="sub">${Number(td.n) || 0} પહોંચ</span></a>
      <a href="#/students"><span class="sub">કુલ વિદ્યાર્થી</span><b>${roster.length}</b><span class="sub">${batches.length} બેચ</span></a>
      <a href="#/fees"><span class="sub">બાકી ફી (વર્ષ)</span><b style="color:#DC2626">${lakh(Math.max(0, P - PD))}</b><span class="sub">${over.length} ની મુદત વીતી</span></a>
    </div>
    ${todo.length ? `<div class="card" style="gap:0"><h2 style="margin-bottom:4px">આજે કરવાનું</h2>
      ${todo.map(([n, c, t, s, h]) => `<a class="todo" href="${h}"><span class="n" style="background:${c}">${n}</span><span class="grow"><b>${esc(t)}</b><span class="sub" style="display:block">${esc(s)}</span></span><span class="sub">→</span></a>`).join("")}</div>`
      : `<div class="card center"><b>આજે કંઈ બાકી નથી ✓</b></div>`}
    ${bdays.length ? `<a class="bday" href="#/bday"><span style="font-size:30px">🎂</span><span class="grow"><b>આજે ${bdays.length} જન્મદિવસ</b><span class="sub" style="display:block">${bdays.slice(0, 3).map(r => `${esc(shortName(r.n))} (${esc(r.bn || "ધો. " + r.s)})`).join(" • ")}</span></span><span class="btn line" style="min-height:38px">શુભેચ્છા</span></a>` : ""}
    <div class="qa"><a href="#/admit"><span>${ic("plus", 24)}</span>નવો પ્રવેશ</a><a href="#/pay"><span>${ic("rupee", 24)}</span>ફી લો</a><a href="#/att"><span>${ic("check", 24)}</span>હાજરી</a><a href="#/tests"><span>${ic("trophy", 24)}</span>ટેસ્ટ</a><a href="#/batches"><span>${ic("batch", 24)}</span>બેચ</a></div>
    <div class="card" style="gap:6px"><div class="row-between"><h2>આ અઠવાડિયાની હાજરી</h2><span class="sub">સો–શ</span></div>
      <div class="wk">${week.map(w => `<div><i style="height:${w.pct == null ? 3 : Math.max(6, w.pct * .8)}px;background:${w.pct == null ? "#E2E8F0" : w.pct < 75 ? "#F97316" : "#15803D"}"></i><span class="sub">${w.pct == null ? "" : w.pct + "%"}</span><span class="sub">${w.lbl}</span></div>`).join("")}</div></div>
    <div class="grid2">
      <a class="tile" href="#/old">${ic("dl", 26)}<span>જૂનો ડેટા</span></a>
      <a class="tile" href="#/settings">${ic("gear", 26)}<span>ગોઠવણ અને લોગિન</span></a>
    </div>`;
  wirePushAsk(v);
}

// ================= શોધ =================
page("search", async v => {
  if (!isStaffish()) { location.hash = "#/home"; return; }
  const roster = await getDoc(rosterRef()).then(s => Object.entries((s.exists() && s.data().list) || {}).map(([id, r]) => ({ id, ...r })));
  const last = sessionStorage.getItem("gv_q") || "";
  v.innerHTML = `
    <label class="search">${ic("search", 20)}<span class="sr">શોધો</span><input id="sq" type="search" value="${esc(last)}" placeholder="નામ (ગુજરાતી કે English), ID, મોબાઇલ, ફોર્મ કે પહોંચ નં." autocomplete="off" enterkeyhint="search"></label>
    <div id="sres" class="stack"></div>
    <p class="hint">ઉદા.: <b>ravi</b>, <b>રવિ</b>, <b>G101</b>, <b>98989</b>, <b>ફોર્મ 45</b> કે <b>પહોંચ 313</b></p>`;
  let tk = 0;
  const run = async () => {
    const q = $("#sq").value.trim(); sessionStorage.setItem("gv_q", q);
    const my = ++tk, el = $("#sres");
    if (!q) { el.innerHTML = ""; return; }
    const digits = q.replace(/\D/g, ""), qn = q.toLowerCase();
    const st = roster.filter(r => nameMatch(r.n, q, r.e) || String(r.id).toLowerCase() === qn || String(r.id).toLowerCase().startsWith(qn)
      || (digits.length >= 4 && String(r.m || "").includes(digits)) || (digits && String(r.f) === digits && /ફોર્મ|form|^\d+$/i.test(q)))
      .sort((a, b) => (a.x === "cancelled") - (b.x === "cancelled") || String(a.n).localeCompare(String(b.n), "gu")).slice(0, 30);
    let rc = null;
    if (digits && digits.length <= 6 && isStaffish() && !["teacher"].includes(S.me.role)) {
      try { const d = await getDoc(doc(db, "receipts", `${S.branchId}_${S.year}_${Number(digits)}`)); rc = d.exists() ? { id: d.id, ...d.data() } : null; } catch {}
    }
    if (my !== tk) return;
    el.innerHTML = (st.length ? `<div class="card" style="gap:0"><h2 style="margin-bottom:4px">વિદ્યાર્થી (${st.length})</h2>${st.map(r => `
        <a class="srow" href="#/student/${encodeURIComponent(r.id)}"><span class="ph">${esc(String(r.n || "?")[0])}</span>
          <span class="grow"><b>${esc(r.n)}</b><span class="sub" style="display:block">${esc(r.id)} • ${esc(r.bn || "ધો. " + r.s)}${r.f ? " • ફોર્મ " + esc(r.f) : ""}${r.m ? " • " + esc(r.m) : ""}${r.x === "cancelled" ? " • રદ" : ""}</span></span>
          ${S.me.role === "teacher" ? "" : `<span class="fee-small"><span class="dot" style="background:${Number(r.pd) >= Number(r.p) ? "#16A34A" : "#DC2626"}"></span> ${Number(r.pd) >= Number(r.p) ? "ભરાઈ" : money(Number(r.p) - Number(r.pd))}</span>`}</a>`).join("")}</div>` : "")
      + (rc ? `<div class="card" style="gap:0"><h2 style="margin-bottom:4px">પહોંચ</h2><a class="srow" href="#/receipt/${encodeURIComponent(rc.id)}"><span class="ph" style="background:#E6F4EA;color:#15803D">${ic("receipt", 20)}</span>
          <span class="grow"><b>પહોંચ ${esc(rc.no)} • ${money(rc.amount)}</b><span class="sub" style="display:block">${esc(rc.name)} • ${fmtD(rc.date)}</span></span></a></div>` : "")
      || `<div class="empty">"${esc(q)}" માટે કંઈ મળ્યું નહીં.</div>`;
  };
  $("#sq").oninput = () => { clearTimeout(run.t); run.t = setTimeout(run, 150); };
  $("#sq").focus(); run();
});

// ================= જન્મદિવસ =================
// આજના જન્મદિવસની યાદી (સ્ટાફ)
page("bday", async v => {
  const sid = decodeURIComponent(location.hash.split("/")[2] || "");
  if (sid) return posterPage(v, sid);
  if (!isStaffish()) { location.hash = "#/home"; return; }
  const roster = await getDoc(rosterRef()).then(s => Object.entries((s.exists() && s.data().list) || {}).map(([id, r]) => ({ id, ...r })).filter(r => r.x !== "cancelled"));
  const mine = S.me.role === "teacher" ? await getDocs(query(collection(db, "batches"), where("branchId", "==", S.branchId), where("teacherId", "==", S.me.loginId))).then(q => q.docs.map(d => d.id)).catch(() => null) : null;
  const L = roster.filter(r => isBday(r.d) && (!mine || mine.includes(r.b)));
  const sent = JSON.parse(localStorage.getItem("gv_bsent_" + ymd()) || "[]");
  v.innerHTML = `<h1 class="page-title">આજના જન્મદિવસ 🎂</h1>
    ${L.map(r => `<a class="srow card" href="#/bday/${encodeURIComponent(r.id)}" style="flex-direction:row"><span class="ph">${esc(String(r.n)[0])}</span>
      <span class="grow"><b>${esc(r.n)}</b><span class="sub" style="display:block">${esc(r.bn || "ધો. " + r.s)}${ageOn(r.d) ? ` • ${ageOn(r.d)} વર્ષ` : ""}</span></span>
      ${sent.includes(r.id) ? `<span class="pill ok">✓ મોકલ્યું</span>` : `<span class="btn line" style="min-height:36px">પોસ્ટર</span>`}</a>`).join("")
    || `<div class="empty">આજે કોઈનો જન્મદિવસ નથી.</div>`}
    <p class="hint">જન્મ તારીખ પ્રવેશ ફોર્મમાંથી લેવાય છે. ખૂટતી હોય તો વિદ્યાર્થીની ફાઇલ → ફેરફાર માં ઉમેરો.</p>`;
});

const DESIGNS = [["A", "ફુગ્ગા પાર્ટી 🎈"], ["B", "ગોલ્ડન રોયલ ✨"], ["C", "ગુજરાતી ઉત્સવ 🪔"], ["D", "પોલરોઇડ નિયોન 🎮"]];
async function posterPage(v, sid) {
  const [ss, ps] = await Promise.all([getDoc(doc(db, "students", sid)), getDoc(doc(db, "photos", sid)).catch(() => null)]);
  if (!ss.exists()) { v.innerHTML = `<div class="empty">વિદ્યાર્થી મળ્યો નહીં.</div>`; return; }
  const s = ss.data(), photo = ps?.exists() ? ps.data().data : "";
  let di = Number(localStorage.getItem("gv_bdesign_" + sid) || 0) % 4;
  const own = ["student", "parent"].includes(S.me.role);
  v.innerHTML = `
    <div class="row-between"><a class="btn line" href="${own ? "#/home" : "#/bday"}">${ic("back", 18)} પાછા</a><span class="sub">${esc(shortName(s.name))}${ageOn(s.dob) ? ` • ${ageOn(s.dob)} વર્ષ` : ""}</span></div>
    <div class="hscroll" role="group" aria-label="ડિઝાઇન">${DESIGNS.map(([k, l], i) => `<button type="button" class="chip ${i === di ? "on" : ""}" data-di="${i}">${l}</button>`).join("")}</div>
    <div class="poster-wrap"><button type="button" class="icon-btn pv" id="pprev" aria-label="પાછલી ડિઝાઇન">‹</button>
      <img id="pimg" alt="જન્મદિવસનું પોસ્ટર" class="poster-img"><button type="button" class="icon-btn pv" id="pnext" aria-label="આગળની ડિઝાઇન">›</button></div>
    <p class="hint center" style="margin:0">ડાબે-જમણે ફેરવીને ગમતી ડિઝાઇન પસંદ કરો</p>
    ${photo ? `<div class="card" style="gap:8px;padding:12px"><b style="font-size:15px">ફોટો ગોઠવો <span class="sub" style="font-weight:400">— ચહેરો બરાબર વચ્ચે લાવો</span></b>
      <div class="adj">${[["z-", "−", "નાનો"], ["z+", "+", "મોટો"], ["up", "↑", "ઉપર"], ["dn", "↓", "નીચે"], ["lf", "←", "ડાબે"], ["rt", "→", "જમણે"], ["rs", "↺", "મૂળ"]]
        .map(([k, t, l]) => `<button type="button" data-adj="${k}" aria-label="${l}"><b>${t}</b><span>${l}</span></button>`).join("")}</div></div>` : ""}
    <div class="grid2"><button type="button" class="btn wa" id="pshare">${ic("wa", 18)} ${own ? "સ્ટેટ્સ / શેર" : "વાલીને મોકલો"}</button>
      <button type="button" class="btn line" id="psave">${ic("dl", 18)} પોસ્ટર સાચવો</button></div>`;
  let canvas = null, tok = 0;
  const AK = "gv_badj_" + sid, A0 = { z: 1, dx: 0, dy: 0 };
  let adj = (() => { try { return { ...A0, ...JSON.parse(localStorage.getItem(AK) || "{}") }; } catch { return { ...A0 }; } })();
  const draw = async () => {
    const my = ++tok;
    $$("[data-di]", v).forEach(b => b.classList.toggle("on", +b.dataset.di === di));
    localStorage.setItem("gv_bdesign_" + sid, di);
    const cv = await makePoster(DESIGNS[di][0], { name: s.name, photo, age: ageOn(s.dob), branch: branchName(s.branchId) || "", adj });
    if (my !== tok) return; canvas = cv;
    if ($("#pimg")) $("#pimg").src = canvas.toDataURL("image/jpeg", .92);
  };
  $$("[data-di]", v).forEach(b => b.onclick = () => { di = +b.dataset.di; buzz("tap"); draw(); });
  $$("[data-adj]", v).forEach(b => b.onclick = () => {
    const k = b.dataset.adj, st = .04;
    if (k === "z-") adj.z = Math.max(.6, +(adj.z - .1).toFixed(2)); else if (k === "z+") adj.z = Math.min(2.5, +(adj.z + .1).toFixed(2));
    else if (k === "up") adj.dy -= st; else if (k === "dn") adj.dy += st; else if (k === "lf") adj.dx -= st; else if (k === "rt") adj.dx += st;
    else adj = { ...A0 };
    localStorage.setItem(AK, JSON.stringify(adj)); buzz("tap"); draw();
  });
  $("#pprev").onclick = () => { di = (di + 3) % 4; draw(); };
  $("#pnext").onclick = () => { di = (di + 1) % 4; draw(); };
  let x0 = null; const img = $("#pimg");
  img.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; }, { passive: true });
  img.addEventListener("touchend", e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 40) { di = (di + (dx < 0 ? 1 : 3)) % 4; draw(); } });
  const file = () => new Promise(res => canvas.toBlob(b => res(new File([b], `જન્મદિવસ_${shortName(s.name)}.jpg`, { type: "image/jpeg" })), "image/jpeg", .92));
  const markSent = () => { const k = "gv_bsent_" + ymd(), a = JSON.parse(localStorage.getItem(k) || "[]"); if (!a.includes(sid)) a.push(sid); localStorage.setItem(k, JSON.stringify(a)); };
  $("#psave").onclick = async () => { const f = await file(), a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); toast("પોસ્ટર ફોનમાં સચવાયું."); };
  $("#pshare").onclick = async () => {
    const text = own ? `🎂 ${ACADEMY.name}` : `${ACADEMY.name}\n${shortName(s.name)} ને જન્મદિવસની હાર્દિક શુભેચ્છા 🎂🎉\nઉજ્જવળ ભવિષ્ય માટે શુભકામનાઓ – ગાંડિવ એકેડેમી પરિવાર`;
    try {
      const f = await file();
      if (navigator.canShare?.({ files: [f] })) { await navigator.share({ files: [f], text }); markSent(); return; }
    } catch (e) { if (e?.name === "AbortError") return; }
    if (!own && (s.mobWa || s.mobParent)) { window.open(waLink(s.mobWa || s.mobParent, text), "_blank"); markSent(); }
    else $("#psave").click();
  };
  await draw();
}

// ---------- પોસ્ટર canvas પર દોરો (1080 × 1920, WhatsApp સ્ટેટ્સ માપ) ----------
let fontsReady = null;
export function loadFonts() {
  if (fontsReady) return fontsReady;
  if (!document.querySelector("#poster-fonts")) {
    const l = document.createElement("link"); l.id = "poster-fonts"; l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Baloo+Bhai+2:wght@600;800&family=Pacifico&family=Playfair+Display:ital,wght@1,700&display=swap";
    document.head.appendChild(l);
  }
  fontsReady = Promise.race([
    Promise.all(['800 40px "Baloo Bhai 2"', '600 20px "Baloo Bhai 2"', '40px "Pacifico"', 'italic 700 40px "Playfair Display"'].map(f => document.fonts.load(f, "Happy જન્મદિવસ"))).catch(() => {}),
    new Promise(r => setTimeout(r, 2500))
  ]);
  return fontsReady;
}
const IMG = new Map();
export const loadImg = src => { if (!src) return Promise.resolve(null); if (IMG.size > 6) IMG.clear();
  if (!IMG.has(src)) IMG.set(src, new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; })); return IMG.get(src); };
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const GU = '"Baloo Bhai 2","Noto Sans Gujarati",sans-serif';

export async function makePoster(kind, { name, photo, age, branch, adj }) {
  await loadFonts();
  const [ph, logo] = await Promise.all([loadImg(photo), loadImg("logo.png")]);
  const c = document.createElement("canvas"); c.width = 1080; c.height = 1920;
  const x = c.getContext("2d"); x.scale(3, 3);
  const R = rng(kind.charCodeAt(0) * 99);
  const avoid = (zones, pad = 0) => { for (let k = 0; k < 40; k++) { const px = R() * 360, py = R() * 640; if (!zones.some(z => px > z[0] - pad && px < z[2] + pad && py > z[1] - pad && py < z[3] + pad)) return [px, py]; } return [R() * 360, R() * 40]; };
  const rr = (X, Y, W, H, r) => { x.beginPath(); x.roundRect ? x.roundRect(X, Y, W, H, r) : x.rect(X, Y, W, H); };
  const text = (t, X, Y, font, fill, o = {}) => {
    x.save(); let size = o.size || 20; const fam = o.fam || GU, wgt = o.w || "800", st = o.style || "";
    x.font = `${st} ${wgt} ${size}px ${fam}`;
    while (o.max && x.measureText(t).width > o.max && size > 10) { size--; x.font = `${st} ${wgt} ${size}px ${fam}`; }
    x.textAlign = o.align || "center"; x.textBaseline = "middle";
    if (o.shadow) { x.shadowColor = o.shadow[0]; x.shadowBlur = o.shadow[1]; x.shadowOffsetY = o.shadow[2] || 0; }
    if (o.stroke) { x.lineWidth = o.stroke[1]; x.strokeStyle = o.stroke[0]; x.lineJoin = "round"; x.strokeText(t, X, Y); }
    x.fillStyle = fill; x.fillText(t, X, Y); x.restore();
  };
  const photoIn = (clip) => { // clip() બનાવે path
    x.save(); clip(); x.clip();
    const b = clip.box;
    if (ph) { // ચહેરો ઉપર હોય — માથું ન કપાય માટે ઉપરથી ગોઠવો; વપરાશકર્તા નાનો/મોટો/ખસેડી શકે
      const a = adj || {}, z = a.z || 1, s = Math.max(b[2] / ph.width, b[3] / ph.height) * z, w = ph.width * s, h = ph.height * s;
      x.fillStyle = "#fff"; x.fillRect(...b);
      const top = h > b[3] ? (b[3] - h) * .12 : (b[3] - h) / 2;
      x.drawImage(ph, b[0] + (b[2] - w) / 2 + (a.dx || 0) * b[2], b[1] + top + (a.dy || 0) * b[3], w, h); }
    else { const g = x.createLinearGradient(0, b[1], 0, b[1] + b[3]); g.addColorStop(0, "#E0E7FF"); g.addColorStop(1, "#C7D2FE"); x.fillStyle = g; x.fillRect(...b);
      x.fillStyle = "#94A3B8"; x.beginPath(); x.arc(b[0] + b[2] / 2, b[1] + b[3] * .4, b[2] * .18, 0, 7); x.fill();
      x.beginPath(); x.ellipse(b[0] + b[2] / 2, b[1] + b[3] * 1.02, b[2] * .36, b[3] * .32, 0, 0, 7); x.fill();
      text(String(name || "?").trim()[0] || "", b[0] + b[2] / 2, b[1] + b[3] * .4, "", "#fff", { size: b[2] * .2 }); }
    x.restore();
  };
  const star = (X, Y, s, col) => { x.save(); x.translate(X, Y); x.fillStyle = col; x.beginPath(); x.moveTo(0, -s); x.lineTo(s * .22, -s * .22); x.lineTo(s, 0); x.lineTo(s * .22, s * .22); x.lineTo(0, s); x.lineTo(-s * .22, s * .22); x.lineTo(-s, 0); x.lineTo(-s * .22, -s * .22); x.closePath(); x.fill(); x.restore(); };
  const foot = (bg, fg) => {
    x.save(); x.fillStyle = bg; rr(16, 568, 328, 56, 16); x.fill();
    if (logo) { x.save(); x.beginPath(); x.arc(47, 596, 19, 0, 7); x.clip(); x.drawImage(logo, 28, 577, 38, 38); x.restore(); }
    text("ગાંડિવ એકેડેમી પરિવાર", 76, 588, "", fg, { size: 15, align: "left", max: 250 });
    text(`${ACADEMY.tagline}${branch ? " • " + branch : ""}`, 76, 607, "", fg, { size: 11, w: "600", align: "left", max: 250 }); x.restore();
  };
  const dn = String(name || "");

  if (kind === "A") {
    let g = x.createLinearGradient(0, 0, 220, 640); g.addColorStop(0, "#FF4F8B"); g.addColorStop(.45, "#C026D3"); g.addColorStop(1, "#6D28D9"); x.fillStyle = g; x.fillRect(0, 0, 360, 640);
    const cols = ["#FDE047", "#fff", "#22D3EE", "#FB923C", "#A3E635"];
    for (let i = 0; i < 80; i++) { const [px, py] = avoid([[60, 180, 300, 400], [20, 395, 340, 560], [0, 560, 360, 640]]); x.save(); x.translate(px, py); x.rotate(R() * 3); x.fillStyle = cols[i % 5]; x.globalAlpha = .9; R() > .5 ? x.fillRect(-3, -6, 6, 12) : (x.beginPath(), x.arc(0, 0, 4, 0, 7), x.fill()); x.restore(); }
    const balloon = (bx, by, s, col, rot) => {
      x.save(); x.translate(bx, by); x.rotate(rot); x.scale(s, s);
      x.strokeStyle = "rgba(255,255,255,.7)"; x.lineWidth = 1.2; x.beginPath(); x.moveTo(0, 38); x.bezierCurveTo(-8, 60, 8, 72, 0, 100); x.stroke();
      const rg = x.createRadialGradient(-10, -14, 2, 0, 0, 40); rg.addColorStop(0, "rgba(255,255,255,.8)"); rg.addColorStop(.3, col); rg.addColorStop(1, col);
      x.fillStyle = rg; x.beginPath(); x.ellipse(0, 0, 30, 38, 0, 0, 7); x.fill(); x.fillStyle = col; x.beginPath(); x.moveTo(-4, 37); x.lineTo(4, 37); x.lineTo(0, 44); x.fill(); x.restore();
    };
    balloon(28, 66, 1.1, "#FACC15", -.2); balloon(66, 100, .9, "#22D3EE", -.1); balloon(326, 62, 1.1, "#FB7185", .2); balloon(290, 110, .85, "#A3E635", .1);
    g = x.createLinearGradient(0, 120, 0, 175); g.addColorStop(0, "#FFFBEB"); g.addColorStop(1, "#FDE68A");
    text("Happy Birthday", 180, 146, "", g, { fam: '"Pacifico",cursive', w: "400", size: 42, max: 320, stroke: ["#9D174D", 3], shadow: ["rgba(0,0,0,.25)", 8, 3] });
    // ફોટો: મેઘધનુષી રિંગ
    x.save(); x.fillStyle = "rgba(255,255,255,.3)"; x.beginPath(); x.arc(180, 288, 112, 0, 7); x.fill(); x.restore();
    const cg = x.createConicGradient ? x.createConicGradient(0, 180, 288) : null;
    if (cg) { ["#FDE047", "#FB923C", "#F472B6", "#22D3EE", "#FDE047"].forEach((cc, i) => cg.addColorStop(i / 4, cc)); x.fillStyle = cg; } else x.fillStyle = "#FDE047";
    x.save(); x.shadowColor = "rgba(0,0,0,.35)"; x.shadowBlur = 30; x.shadowOffsetY = 12; x.beginPath(); x.arc(180, 288, 102, 0, 7); x.fill(); x.restore();
    x.fillStyle = "#fff"; x.beginPath(); x.arc(180, 288, 94, 0, 7); x.fill();
    const clipA = () => { x.beginPath(); x.arc(180, 288, 89, 0, 7); }; clipA.box = [91, 199, 178, 178]; photoIn(clipA);
    text("🎂", 180, 392, "", "#000", { size: 30, fam: "sans-serif", w: "400" });
    // રિબન
    x.fillStyle = "#FDE047"; x.beginPath(); x.moveTo(20, 416); x.lineTo(44, 416); x.lineTo(44, 460); x.lineTo(20, 460); x.lineTo(34, 438); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(340, 416); x.lineTo(316, 416); x.lineTo(316, 460); x.lineTo(340, 460); x.lineTo(326, 438); x.closePath(); x.fill();
    x.fillStyle = "#fff"; x.fillRect(40, 408, 280, 54);
    text(dn, 180, 436, "", "#6D28D9", { size: 23, max: 260 });
    text("જન્મદિવસની હાર્દિક શુભેચ્છા", 180, 494, "", "#fff", { size: 26, max: 330, shadow: ["rgba(0,0,0,.3)", 10, 3] });
    text("તમારાં બધાં સપનાં સાચાં પડે, ખૂબ આગળ વધો! ✨", 180, 528, "", "#fff", { size: 14, w: "600", max: 330 });
    foot("rgba(255,255,255,.95)", "#4C1D95");
  }

  if (kind === "B") {
    let g = x.createRadialGradient(180, 190, 10, 180, 220, 460); g.addColorStop(0, "#23306E"); g.addColorStop(.55, "#0F173F"); g.addColorStop(1, "#05081C"); x.fillStyle = g; x.fillRect(0, 0, 360, 640);
    for (let i = 0; i < 32; i++) { const [px, py] = avoid([[20, 40, 340, 150], [70, 180, 300, 440], [20, 440, 340, 560], [0, 560, 360, 640]]); star(px, py, 3 + R() * 6, ["#FDE68A", "#FBBF24", "#fff"][i % 3]); }
    x.fillStyle = "#D4AF37"; x.fillRect(0, 0, 360, 6); x.fillRect(0, 634, 360, 6);
    x.save(); x.strokeStyle = "#D4AF37"; x.setLineDash([2, 5]); x.lineWidth = 1.5; rr(12, 12, 336, 616, 18); x.stroke(); x.restore();
    const gold = (y0, y1) => { const gg = x.createLinearGradient(0, y0, 0, y1); gg.addColorStop(0, "#FFF4C2"); gg.addColorStop(.45, "#E9C46A"); gg.addColorStop(.55, "#C9962B"); gg.addColorStop(1, "#FFE08A"); return gg; };
    text("Happy Birthday", 180, 88, "", gold(60, 115), { fam: '"Playfair Display",serif', style: "italic", w: "700", size: 48, max: 320, shadow: ["rgba(233,196,106,.35)", 14] });
    text("✦  ✦  ✦", 180, 134, "", "#E9C46A", { size: 16, fam: "sans-serif", w: "400" });
    // કમાન આકારની ફ્રેમ
    const arch = (X, Y, W, H) => { x.beginPath(); x.moveTo(X, Y + H); x.lineTo(X, Y + W / 2); x.arc(X + W / 2, Y + W / 2, W / 2, Math.PI, 0); x.lineTo(X + W, Y + H - 14); x.quadraticCurveTo(X + W, Y + H, X + W - 14, Y + H); x.lineTo(X + 14, Y + H); x.quadraticCurveTo(X, Y + H, X, Y + H - 14); x.closePath(); };
    x.save(); x.shadowColor = "rgba(233,196,106,.5)"; x.shadowBlur = 40; x.fillStyle = gold(190, 426); arch(82, 190, 196, 236); x.fill(); x.restore();
    const clipB = () => arch(87, 195, 186, 226); clipB.box = [87, 195, 186, 226]; photoIn(clipB);
    if (age) {
      x.save(); x.shadowColor = "rgba(0,0,0,.4)"; x.shadowBlur = 16; x.shadowOffsetY = 6; x.fillStyle = gold(376, 446); x.beginPath(); x.arc(269, 411, 35, 0, 7); x.fill(); x.restore();
      text(String(age), 269, 404, "", "#0F173F", { fam: '"Playfair Display",serif', size: 28, w: "700" }); text("વર્ષ", 269, 428, "", "#0F173F", { size: 11 });
    }
    text(dn, 180, 466, "", gold(452, 480), { size: 26, max: 320 });
    const lg = x.createLinearGradient(120, 0, 240, 0); lg.addColorStop(0, "rgba(212,175,55,0)"); lg.addColorStop(.5, "#D4AF37"); lg.addColorStop(1, "rgba(212,175,55,0)"); x.fillStyle = lg; x.fillRect(120, 486, 120, 1);
    text("જન્મદિવસની હાર્દિક શુભેચ્છા", 180, 508, "", "#fff", { size: 21, max: 320 });
    text("ઉજ્જવળ ભવિષ્ય માટે અઢળક શુભકામનાઓ 🌟", 180, 534, "", "#E9C46A", { size: 13, w: "600", max: 320 });
    const fg = x.createLinearGradient(16, 0, 344, 0); fg.addColorStop(0, "#1E2A6B"); fg.addColorStop(1, "#0F173F"); foot(fg, "#FFE08A");
  }

  if (kind === "C") {
    let g = x.createLinearGradient(0, 0, 0, 640); g.addColorStop(0, "#FFF7E6"); g.addColorStop(.6, "#FFE4B5"); g.addColorStop(1, "#FDBA74"); x.fillStyle = g; x.fillRect(0, 0, 360, 640);
    // તોરણ
    x.strokeStyle = "#7C2D12"; x.lineWidth = 3; x.beginPath(); x.moveTo(0, 10); x.quadraticCurveTo(180, 34, 360, 10); x.stroke();
    for (let i = 0; i < 13; i++) {
      const px = 14 + i * 27, py = 10 + 21.6 * (1 - ((px - 180) / 180) ** 2);
      x.fillStyle = i % 2 ? "#15803D" : "#16A34A"; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px - 9, py + 22, px, py + 44); x.quadraticCurveTo(px + 9, py + 22, px, py); x.fill();
      [[13, 6, 8, "#F97316"], [13, 6, 4.5, "#FDBA74"], [13, 22, 6, "#FACC15"]].forEach(([dx, dy, r, cc]) => { x.fillStyle = cc; x.beginPath(); x.arc(px + dx, py + dy, r, 0, 7); x.fill(); });
    }
    text("જન્મદિવસની હાર્દિક શુભેચ્છા", 180, 106, "", "#9D174D", { size: 27, max: 330 });
    // રંગોળી
    x.save(); x.translate(180, 300);
    [[140, 24, "#F472B6", 14, 7], [118, 18, "#F97316", 12, 6], [96, 12, "#FACC15", 10, 5]].forEach(([r, n, cc, rx, ry]) => { for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n; x.save(); x.rotate(a); x.fillStyle = cc; x.beginPath(); x.ellipse(r, 0, rx, ry, 0, 0, 7); x.fill(); x.restore(); } });
    x.strokeStyle = "#9D174D"; x.setLineDash([3, 6]); x.lineWidth = 1.5; x.beginPath(); x.arc(0, 0, 132, 0, 7); x.stroke(); x.restore();
    x.save(); x.shadowColor = "rgba(124,45,18,.35)"; x.shadowBlur = 24; x.shadowOffsetY = 8; x.fillStyle = "#9D174D"; x.beginPath(); x.arc(180, 300, 100, 0, 7); x.fill(); x.restore();
    x.fillStyle = "#FDE68A"; x.beginPath(); x.arc(180, 300, 95, 0, 7); x.fill();
    const clipC = () => { x.beginPath(); x.arc(180, 300, 90, 0, 7); }; clipC.box = [90, 210, 180, 180]; photoIn(clipC);
    text(dn, 180, 462, "", "#7C2D12", { size: 27, max: 330 });
    text("ઈશ્વર તમને સદા સુખી, તંદુરસ્ત અને સફળ રાખે 🙏", 180, 494, "", "#9A3412", { size: 14, w: "600", max: 330 });
    const diya = X => { x.save(); x.translate(X, 506); x.fillStyle = "#FBBF24"; x.beginPath(); x.moveTo(23, 4); x.quadraticCurveTo(31, 14, 23, 22); x.quadraticCurveTo(15, 14, 23, 4); x.fill();
      x.fillStyle = "#FEF3C7"; x.beginPath(); x.moveTo(23, 10); x.quadraticCurveTo(27, 16, 23, 20); x.quadraticCurveTo(19, 16, 23, 10); x.fill();
      x.fillStyle = "#B45309"; x.beginPath(); x.moveTo(4, 26); x.lineTo(42, 26); x.quadraticCurveTo(38, 42, 23, 42); x.quadraticCurveTo(8, 42, 4, 26); x.fill(); x.restore(); };
    diya(40); diya(274); text("🎂", 180, 530, "", "#000", { size: 28, fam: "sans-serif", w: "400" });
    foot("#7C2D12", "#FDE68A");
  }

  if (kind === "D") {
    let g = x.createLinearGradient(0, 0, 240, 640); g.addColorStop(0, "#0B1023"); g.addColorStop(.55, "#1B1150"); g.addColorStop(1, "#3B0B4F"); x.fillStyle = g; x.fillRect(0, 0, 360, 640);
    for (let i = 0; i < 30; i++) { const [px, py] = avoid([[20, 40, 340, 160], [50, 160, 310, 470], [20, 460, 340, 560], [0, 560, 360, 640]]); star(px, py, 3 + R() * 5, ["#22D3EE", "#F472B6", "#FDE047", "#fff"][i % 4]); }
    text("HAPPY", 180, 78, "", "#fff", { size: 52, w: "800", max: 320, shadow: ["#F472B6", 22] });
    text("HAPPY", 180, 78, "", "#fff", { size: 52, w: "800", max: 320, shadow: ["#C026D3", 8] });
    text("BIRTHDAY", 180, 128, "", "#fff", { size: 52, w: "800", max: 330, shadow: ["#22D3EE", 22] });
    text("BIRTHDAY", 180, 128, "", "#fff", { size: 52, w: "800", max: 330, shadow: ["#0891B2", 8] });
    x.save(); x.translate(180, 318); x.rotate(-5 * Math.PI / 180);
    x.shadowColor = "rgba(0,0,0,.5)"; x.shadowBlur = 30; x.shadowOffsetY = 14; x.fillStyle = "#fff"; x.fillRect(-118, -145, 236, 290); x.shadowColor = "transparent";
    const clipD = () => { x.beginPath(); x.rect(-106, -133, 212, 220); }; clipD.box = [-106, -133, 212, 220]; photoIn(clipD);
    text(dn, 0, 118, "", "#1B1150", { size: 19, max: 210 });
    x.rotate(8 * Math.PI / 180); x.fillStyle = "rgba(253,224,71,.85)"; x.fillRect(-35, -160, 70, 24); x.restore();
    text("🎉", 286, 172, "", "#000", { size: 38, fam: "sans-serif", w: "400" }); text("🎈", 48, 420, "", "#000", { size: 38, fam: "sans-serif", w: "400" });
    const badge = age ? `LEVEL ${age} UNLOCKED 🎮` : "BIRTHDAY STAR ⭐";
    x.save(); x.font = `800 16px ${GU}`; const bw = x.measureText(badge).width + 36; x.shadowColor = "rgba(34,211,238,.7)"; x.shadowBlur = 14;
    x.strokeStyle = "#22D3EE"; x.lineWidth = 2; rr(180 - bw / 2, 470, bw, 34, 17); x.stroke(); x.restore();
    text(badge, 180, 488, "", "#22D3EE", { size: 16 });
    text("જન્મદિવસની હાર્દિક શુભેચ્છા", 180, 532, "", "#fff", { size: 21, max: 330 });
    foot("rgba(255,255,255,.08)", "#fff");
  }
  return c;
}

// જન્મદિવસનું કાર્ડ (વિદ્યાર્થી/વાલી હોમ) + દિવસમાં એક વાર અવાજ
export function bdayCard(s, sid, who = "student") {
  if (!isBday(s?.dob)) return "";
  const nm = String(s.name || "").trim().split(/\s+/)[1] || s.name;
  const k = `gv_bsay_${sid}_${ymd()}`;
  try { if (!localStorage.getItem(k)) { localStorage.setItem(k, "1"); setTimeout(() => say(who === "student" ? `જન્મદિવસની હાર્દિક શુભેચ્છા, ${nm}` : `આજે ${nm} નો જન્મદિવસ છે. હાર્દિક શુભેચ્છા`), 1500); } } catch {}
  return `<a class="bday" href="#/bday/${encodeURIComponent(sid)}"><span style="font-size:30px">🎂</span><span class="grow"><b>${who === "student" ? `જન્મદિવસની હાર્દિક શુભેચ્છા, ${esc(nm)}!` : `આજે ${esc(nm)} નો જન્મદિવસ છે 🎉`}</b>
    <span class="sub" style="display:block">${who === "student" ? "તમારું પોસ્ટર તૈયાર છે → સ્ટેટ્સમાં મૂકો" : "પોસ્ટર તૈયાર છે → સ્ટેટ્સમાં મૂકો"}</span></span></a>`;
}
