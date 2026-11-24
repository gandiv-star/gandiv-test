// =============================================================
//  ભાગ 6: હાજરી (ઓફલાઇન ચાલે) — હાજર / ગેરહાજર / મોડો / રજા
//  attendance/{બેચ}_{yyyy-mm} = આખા મહિનાની હાજરી એક document માં
//    days: { "24": { s: {G101:"a", G103:"l", G104:"h"}, t: {G103:"16:20"}, r: {G103:"કારણ"}, n: 40, by, byName } }
//    days: { "25": { hol: true, by } }  ← આખા વર્ગની રજા
//  "હાજર" સાચવતા નથી: યાદીમાં હોય અને s માં ન હોય = હાજર (ઓછું લખાણ, ઝડપ)
// =============================================================
import { db, collection, doc, getDoc, getDocs, query, where, writeBatch, serverTimestamp } from "./fb.js";
import { $, $$, esc, S, isAdmin, toast, fail, busy, audit, page, ic, route, fmtD, ymd, z2, waLink, modal, closeModal, buzz, chime } from "./core.js";
import { ACADEMY } from "./config.js";
import { isBday } from "./home.js";

const ST = { p: "હાજર", a: "ગેરહાજર", l: "મોડો", h: "રજા" };
const NEXT = { p: "a", a: "l", l: "h", h: "p" };
const DAYS = ["ર", "સો", "મં", "બુ", "ગુ", "શુ", "શ"];
const MONTHS = ["જાન્યુ.", "ફેબ્રુ.", "માર્ચ", "એપ્રિલ", "મે", "જૂન", "જુલાઈ", "ઑગસ્ટ", "સપ્ટે.", "ઑક્ટો.", "નવે.", "ડિસે."];
const MONTHS_FULL = ["જાન્યુઆરી", "ફેબ્રુઆરી", "માર્ચ", "એપ્રિલ", "મે", "જૂન", "જુલાઈ", "ઑગસ્ટ", "સપ્ટેમ્બર", "ઑક્ટોબર", "નવેમ્બર", "ડિસેમ્બર"];
export const canAtt = () => isAdmin() || ["teacher", "receptionist", "accountant"].includes(S.me?.role);
const attRef = (batchId, ym) => doc(db, "attendance", `${batchId}_${ym}`);
const rosterRef = () => doc(db, "rosters", `${S.branchId}_${S.year}`);
const arg = i => decodeURIComponent(location.hash.split("/")[i] || "");
const nowHM = () => { const d = new Date(); return `${z2(d.getHours())}:${z2(d.getMinutes())}`; };
const mins = hm => { const [h, m] = String(hm || "").split(":").map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };
export const lateBy = (t, start) => { const a = mins(t), b = mins(start); return a != null && b != null ? Math.max(0, a - b) : 0; };
const wd = date => DAYS[new Date(date + "T00:00:00").getDay()];
const ymLabel = ym => { const [y, m] = ym.split("-"); return `${MONTHS_FULL[+m - 1]} ${y}`; };
const shiftYm = (ym, k) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + k, 1); return `${d.getFullYear()}-${z2(d.getMonth() + 1)}`; };

async function loadBatches() {
  const q = await getDocs(query(collection(db, "batches"), where("branchId", "==", S.branchId), where("yearId", "==", S.year)));
  return q.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => b.active !== false)
    .sort((a, b) => String(a.start || "99").localeCompare(String(b.start || "99")) || String(a.name).localeCompare(String(b.name)));
}
async function loadRoster() {
  const r = await getDoc(rosterRef());
  return Object.entries((r.exists() && r.data().list) || {}).map(([id, x]) => ({ id, ...x })).filter(x => x.x !== "cancelled");
}
const getAtt = async (batchId, ym) => { try { const s = await getDoc(attRef(batchId, ym)); return s.exists() ? s.data() : null; } catch { return null; } };

// એક દિવસનો સાર
function daySum(day, ids) {
  if (!day) return null;
  if (day.hol) return { hol: true };
  const s = day.s || {}, c = { p: 0, a: 0, l: 0, h: 0 };
  ids.forEach(id => c[s[id] || "p"]++);
  return c;
}

// ================= આજની હાજરી (શિક્ષકનું "આજે" / સંચાલકની "હાજરી") =================
export async function attHome(v) {
  if (!canAtt()) { location.hash = "#/home"; return; }
  const ME = S.me, PROF = S.profile;
  if (!S.branchId) { v.innerHTML = `<div class="empty">શાખા પસંદ નથી.</div>`; return; }
  const date = sessionStorage.getItem("gv_attdate") || ymd();
  const ym = date.slice(0, 7), dd = date.slice(8, 10), isToday = date === ymd();
  const [batches, roster] = await Promise.all([loadBatches(), loadRoster()]);
  const mine = ME.role === "teacher" ? batches.filter(b => b.teacherId === ME.loginId) : batches;
  const showAll = ME.role !== "teacher" || sessionStorage.getItem("gv_attall") === "1";
  const list = showAll ? batches : mine;
  const atts = await Promise.all(list.map(b => getAtt(b.id, ym)));
  const prevAtts = isAdmin() ? await Promise.all(list.map(b => getAtt(b.id, shiftYm(ym, -1)))) : [];
  const tot = { p: 0, a: 0, l: 0, h: 0 }; let taken = 0;
  const rows = list.map((b, i) => {
    const ids = roster.filter(r => r.b === b.id).map(r => r.id);
    const sm = daySum(atts[i]?.days?.[dd], ids);
    if (sm && !sm.hol) { taken++; Object.keys(tot).forEach(k => tot[k] += sm[k]); }
    return { b, ids, sm };
  });
  const tp = tot.p + tot.l + tot.a;
  // છેલ્લા 30 દિવસમાં વારંવાર ગેરહાજર (સંચાલક માટે)
  let often = [];
  if (isAdmin()) {
    const from = ymd(new Date(Date.now() - 30 * 864e5)), cnt = {};
    [...atts, ...prevAtts].forEach((a, i) => {
      if (!a) return; const b = list[i % list.length];
      Object.entries(a.days || {}).forEach(([d, day]) => {
        const full = `${a.ym}-${d}`; if (full < from || full > ymd() || day.hol) return;
        Object.entries(day.s || {}).forEach(([sid, st]) => { if (st === "a") cnt[sid] = (cnt[sid] || 0) + 1; });
      });
    });
    often = Object.entries(cnt).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 15)
      .map(([sid, n]) => ({ r: roster.find(x => x.id === sid), n })).filter(x => x.r);
  }
  if (S.me?.loginId !== ME.loginId || !v.isConnected) return; // વચ્ચે બહાર નીકળ્યા/પાનું બદલાયું
  const d0 = new Date(date + "T00:00:00");
  v.innerHTML = `
    ${ME.role === "teacher" ? `<div class="card hello"><h1>નમસ્તે, ${esc(String(PROF?.name || "").split(" ")[0])} 🙏</h1>
      <p>${["રવિવાર", "સોમવાર", "મંગળવાર", "બુધવાર", "ગુરુવાર", "શુક્રવાર", "શનિવાર"][d0.getDay()]}, ${d0.getDate()} ${MONTHS_FULL[d0.getMonth()]} • ${list.length} બેચ</p></div>`
      : `<h1 class="page-title">${isToday ? "આજની હાજરી" : "હાજરી: " + fmtD(date)}</h1>`}
    ${(() => { const ids = new Set(mine.map(b => b.id)), bd = roster.filter(r => isBday(r.d) && (ME.role !== "teacher" || ids.has(r.b)));
      return ME.role === "teacher" && bd.length ? `<a class="bday" href="#/bday"><span style="font-size:28px">🎂</span><span class="grow"><b>આજે ${bd.length} વિદ્યાર્થીનો જન્મદિવસ</b><span class="sub" style="display:block">${bd.slice(0, 3).map(r => esc(r.n)).join(" • ")}</span></span></a>` : ""; })()}
    <div class="row-between" style="gap:8px">
      <label class="field" style="flex:1;margin:0"><span class="sr">તારીખ</span><input type="date" id="adate" value="${date}" max="${ymd()}"></label>
      ${isToday ? "" : `<button type="button" class="btn line" id="atoday">આજે</button>`}
    </div>
    ${taken ? `<div class="grid2" style="grid-template-columns:repeat(3,1fr)">
      <div class="card center" style="gap:0;padding:10px"><b class="big-num" style="color:#15803D">${tp ? Math.round((tot.p + tot.l) * 100 / tp) : 0}%</b><span class="sub">હાજર</span></div>
      <div class="card center" style="gap:0;padding:10px"><b class="big-num" style="color:#F97316">${tot.l}</b><span class="sub">મોડા</span></div>
      <div class="card center" style="gap:0;padding:10px"><b class="big-num" style="color:#DC2626">${tot.a}</b><span class="sub">ગેરહાજર</span></div></div>` : ""}
    ${rows.map(({ b, ids, sm }) => `<a class="bt ${sm ? "" : "todo"}" href="#/take/${encodeURIComponent(b.id)}/${date}">
      <span class="tm">${esc(b.start || "—")}</span>
      <span class="grow"><b>${esc(b.name)}</b><span class="sub" style="display:block">${sm?.hol ? "વર્ગ નહીં (રજા)" : sm ? `${sm.p + sm.l}/${ids.length} હાજર${sm.l ? ` • ${sm.l} મોડા` : ""}${sm.a ? ` • ${sm.a} ગેર.` : ""}` : `${ids.length} વિદ્યાર્થી${b.teacherName && ME.role !== "teacher" ? " • " + esc(b.teacherName) : ""}`}</span></span>
      ${sm ? `<span class="pill ok">✓</span>` : `<span class="btn ${ME.role === "teacher" ? "primary" : "line"}" style="min-height:40px">હાજરી લો</span>`}</a>`).join("")
      || `<div class="empty">${ME.role === "teacher" ? "તમને હજુ કોઈ બેચ સોંપાઈ નથી. સંચાલકને કહો." : "હજુ કોઈ બેચ નથી."}</div>`}
    ${ME.role === "teacher" ? `<button type="button" class="link-btn" id="aall">${showAll ? "ફક્ત મારી બેચ બતાવો" : "બીજા શિક્ષકની બેચ (તેઓ ન હોય ત્યારે)"}</button>` : ""}
    <div class="note info">${ic("info", 20)}<div>નેટ ન હોય તો પણ હાજરી લઈ શકાય. ફોનમાં સચવાશે અને નેટ આવે એટલે આપમેળે મોકલાઈ જશે.</div></div>
    ${often.length ? `<div class="card" style="gap:0"><h2 style="margin-bottom:6px">વારંવાર ગેરહાજર (છેલ્લા 30 દિવસ)</h2>
      ${often.map(({ r, n }) => `<div class="srow"><a class="grow" href="#/attrep/${encodeURIComponent(r.id)}/${ym}" style="color:inherit;text-decoration:none"><b>${esc(r.n)}</b><span class="sub" style="display:block">${esc(r.bn || "ધો. " + r.s)} • ${n} દિવસ</span></a>
        ${r.m ? `<a class="icon-btn" style="color:#15803D" target="_blank" rel="noopener" aria-label="WhatsApp" href="${waLink(r.m, `${ACADEMY.name}\nનમસ્તે, ${r.n} છેલ્લા 30 દિવસમાં ${n} દિવસ ગેરહાજર રહ્યા છે. કૃપા કરી નિયમિત મોકલો 🙏`)}">${ic("wa", 20)}</a>` : ""}</div>`).join("")}</div>` : ""}
    ${list.length ? `<div class="card" style="gap:0"><h2 style="margin-bottom:6px">માસિક રિપોર્ટ</h2>
      ${list.map(b => `<a class="srow" href="#/battrep/${encodeURIComponent(b.id)}/${ym}"><span class="grow"><b>${esc(b.name)}</b></span><span class="sub">${esc(MONTHS[+ym.slice(5) - 1])} →</span></a>`).join("")}</div>` : ""}`;
  $("#adate").onchange = e => { if (e.target.value) { sessionStorage.setItem("gv_attdate", e.target.value); route(); } };
  $("#atoday", v)?.addEventListener("click", () => { sessionStorage.removeItem("gv_attdate"); route(); });
  $("#aall", v)?.addEventListener("click", () => { sessionStorage.setItem("gv_attall", showAll ? "0" : "1"); route(); });
}
page("att", attHome);

// ================= હાજરી લો =================
page("take", async v => {
  if (!canAtt()) { location.hash = "#/home"; return; }
  const batchId = arg(2), date = arg(3) || ymd();
  const ym = date.slice(0, 7), dd = date.slice(8, 10);
  const [bs, roster, att] = await Promise.all([getDoc(doc(db, "batches", batchId)), loadRoster(), getAtt(batchId, ym)]);
  if (!bs.exists()) { v.innerHTML = `<div class="empty">બેચ મળી નહીં.</div>`; return; }
  const b = { id: batchId, ...bs.data() };
  const kids = roster.filter(r => r.b === batchId).sort((x, y) => String(x.n).localeCompare(String(y.n), "gu"));
  const old = att?.days?.[dd];
  const M = {}, T = { ...(old?.t || {}) }, Rn = { ...(old?.r || {}) }, MAN = { ...(old?.t || {}) }; // MAN = ઘડિયાળમાંથી જાતે પસંદ કરેલો સમય
  kids.forEach(k => M[k.id] = old?.s?.[k.id] || "p");
  const draw = () => {
    const c = { p: 0, a: 0, l: 0, h: 0 }; kids.forEach(k => c[M[k.id]]++);
    v.innerHTML = `
      <div class="row-between"><a class="btn line" href="#/att">${ic("back", 18)} પાછા</a><span class="sub">${old ? (old.hol ? "રજા તરીકે સચવાયેલ" : "સચવાયેલી હાજરી બદલો છો") : ""}</span></div>
      <div><h1 class="page-title" style="margin:0">${esc(b.name)}</h1><span class="sub">${fmtD(date)} (${wd(date)})${b.start ? " • બેચ સમય " + esc(b.start) : ""}</span></div>
      ${!kids.length ? `<div class="empty">આ બેચમાં હજુ કોઈ વિદ્યાર્થી નથી. "વિદ્યાર્થી → બેચ ગોઠવો" માંથી ઉમેરો.</div>` : `
      <div class="sumbar">
        <div><b style="color:#15803D">${c.p}</b><span class="sub">હાજર</span></div><div><b style="color:#F97316">${c.l}</b><span class="sub">મોડા</span></div>
        <div><b style="color:#DC2626">${c.a}</b><span class="sub">ગેરહાજર</span></div><div><b style="color:#92400E">${c.h}</b><span class="sub">રજા</span></div></div>
      <p class="hint" style="margin:0">નામ દબાવતા જાઓ: <b style="color:#15803D">હાજર</b> → <b style="color:#DC2626">ગેરહાજર</b> → <b style="color:#F97316">મોડો</b> (અત્યારનો સમય) → <b style="color:#92400E">રજા</b> → હાજર. બીજો સમય જોઈએ તો "સમય બદલો ✎".</p>
      <div class="attlist">${kids.map((k, i) => {
        const st = M[k.id];
        return `<div class="att ${{ p: "", a: "ab", l: "lt", h: "lv" }[st]}" data-sid="${esc(k.id)}" role="button" tabindex="0" aria-label="${esc(k.n)}: ${ST[st]}">
          <span class="rn">${i + 1}</span>
          <span class="grow"><b>${esc(k.n)}</b>${st === "l" ? `<span class="sub late">${lateBy(T[k.id], b.start) ? lateBy(T[k.id], b.start) + " મિનિટ મોડો • " : ""}<button type="button" class="link-btn" data-tm="${esc(k.id)}">સમય બદલો ✎</button>${Rn[k.id] ? " • " + esc(Rn[k.id]) : ""}</span>` : ""}</span>
          <span class="st">${st === "l" ? "મોડો " + esc(T[k.id] || "") : ST[st]}</span></div>`;
      }).join("")}</div>`}
      <div class="fbar"><button type="button" class="btn line" id="hol">આજે રજા</button>
        <button type="button" class="btn primary" id="save" ${kids.length ? "" : "disabled"}>${ic("check", 18)} હાજરી સાચવો</button></div>`;
    $$("[data-sid]", v).forEach(el => {
      const tap = e => {
        if (e.target.closest("[data-tm]")) return;
        const id = el.dataset.sid, n = NEXT[M[id]];
        M[id] = n; buzz(n === "a" ? [25, 40, 25] : "tap");
        if (n === "l") T[id] = (date === ymd() || !T[id]) ? (date === ymd() ? nowHM() : (T[id] || b.start || nowHM())) : T[id];
        const y = window.scrollY; draw(); window.scrollTo(0, y);
      };
      el.onclick = tap;
      el.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tap(e); } };
    });
    $$("[data-tm]", v).forEach(btn => btn.onclick = e => { e.stopPropagation(); clock(btn.dataset.tm); });
    $("#save").onclick = e => save(e.currentTarget, false);
    $("#hol").onclick = e => { if (confirm(`${fmtD(date)} ના દિવસે ${b.name} નો વર્ગ નથી (રજા) તરીકે સાચવવું છે?`)) save(e.currentTarget, true); };
  };
  // ઘડિયાળ: આવ્યાનો સમય — બેચનો કલાક પહેલેથી, સીધો મિનિટનો કાંટો ફેરવો (કલાક બદલવો હોય તો કલાક દબાવો)
  const clock = id => {
    const k = kids.find(x => x.id === id);
    const init = (MAN[id] && T[id]) || b.start || T[id] || nowHM();
    let [H, Mi] = init.split(":").map(Number);
    if (!Number.isFinite(H)) { H = new Date().getHours(); Mi = 0; }
    let mode = "m";
    const d = modal(`${k.n}: ક્યારે આવ્યા?`, `
      <div class="stack">
        <div class="clk-top">
          <button type="button" class="clk-v" id="ch"></button><b class="clk-c">:</b><button type="button" class="clk-v on" id="cm"></button>
          <span class="clk-ap"><button type="button" id="am">AM</button><button type="button" id="pm">PM</button></span>
        </div>
        <p class="hint center" id="tmh" style="margin:0"></p>
        <svg id="dial" class="dial" viewBox="0 0 260 260" role="slider" aria-label="ઘડિયાળ" tabindex="0"></svg>
        <p class="hint center" id="dhint" style="margin:0"></p>
        ${date === ymd() ? `<button type="button" class="link-btn" id="tnow">હમણાંનો સમય (${nowHM()})</button>` : ""}
        <label class="field"><span class="lbl">કારણ (હોય તો)</span><input id="tmr" value="${esc(Rn[id] || "")}" placeholder="જેમ કે શાળામાંથી મોડું છૂટ્યું"></label>
        <div class="grid2"><button type="button" class="btn line" id="tmx">મોડો કાઢો</button><button type="button" class="btn primary late-btn" id="tmok"></button></div>
      </div>`);
    const val = () => `${z2(H)}:${z2(Mi)}`;
    const svg = $("#dial", d);
    const pos = (i, n, r) => { const a = (i / n) * 2 * Math.PI - Math.PI / 2; return [130 + r * Math.cos(a), 130 + r * Math.sin(a)]; };
    const show = () => {
      const h12 = H % 12 || 12;
      $("#ch", d).textContent = z2(h12); $("#cm", d).textContent = z2(Mi);
      $("#ch", d).classList.toggle("on", mode === "h"); $("#cm", d).classList.toggle("on", mode === "m");
      $("#am", d).classList.toggle("on", H < 12); $("#pm", d).classList.toggle("on", H >= 12);
      // કાંટા: કલાક (ટૂંકો, આછો) અને મિનિટ (લાંબો, નારંગી)
      const hp = pos((H % 12) + Mi / 60, 12, 62), mp = pos(Mi, 60, 96);
      const sel = mode === "m" ? mp : pos(H % 12, 12, 96);
      const nums = mode === "m"
        ? Array.from({ length: 12 }, (_, i) => { const [x, y] = pos(i * 5, 60, 104); return `<text x="${x}" y="${y}" class="${i * 5 === Mi ? "on" : ""}">${z2(i * 5)}</text>`; }).join("")
        : Array.from({ length: 12 }, (_, i) => { const n = i || 12, [x, y] = pos(i, 12, 104); return `<text x="${x}" y="${y}" class="${(H % 12) === i ? "on" : ""}">${n}</text>`; }).join("");
      svg.innerHTML = `<circle cx="130" cy="130" r="126" class="face"/>
        <line x1="130" y1="130" x2="${hp[0]}" y2="${hp[1]}" class="hh ${mode === "h" ? "act" : ""}"/>
        ${mode === "m" ? `<line x1="130" y1="130" x2="${mp[0]}" y2="${mp[1]}" class="mh"/>` : ""}
        <circle cx="${sel[0]}" cy="${sel[1]}" r="20" class="knob"/>${nums}<circle cx="130" cy="130" r="5" class="ctr"/>`;
      $("#dhint", d).textContent = mode === "m" ? "મિનિટનો કાંટો ફેરવો કે આંકડો દબાવો • કલાક બદલવો હોય તો ઉપર કલાક દબાવો" : "કલાક પસંદ કરો (પછી આપમેળે મિનિટ પર જશે)";
      const m = lateBy(val(), b.start);
      $("#tmh", d).innerHTML = b.start ? `બેચ ${esc(b.start)} થી → <b class="late">${m} મિનિટ મોડો</b>` : "";
      $("#tmok", d).innerHTML = `${ic("check", 18)} મોડો: ${val()}`;
    };
    // આંગળી ફેરવો / દબાવો
    const pick = (e, end) => {
      const r = svg.getBoundingClientRect(), x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
      let ang = Math.atan2(y, x) + Math.PI / 2; if (ang < 0) ang += 2 * Math.PI;
      if (mode === "m") { const nm = Math.round(ang / (2 * Math.PI) * 60) % 60; if (nm !== Mi) { Mi = nm; buzz("tap"); } }
      else { const nh = Math.round(ang / (2 * Math.PI) * 12) % 12; H = (H >= 12 ? 12 : 0) + nh; if (end) mode = "m"; }
      show();
    };
    let drag = false;
    svg.addEventListener("pointerdown", e => { drag = true; svg.setPointerCapture?.(e.pointerId); pick(e, false); });
    svg.addEventListener("pointermove", e => { if (drag) pick(e, false); });
    svg.addEventListener("pointerup", e => { if (drag) { drag = false; pick(e, true); } });
    svg.addEventListener("keydown", e => {
      if (e.key === "ArrowRight" || e.key === "ArrowUp") { Mi = (Mi + 1) % 60; show(); e.preventDefault(); }
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") { Mi = (Mi + 59) % 60; show(); e.preventDefault(); }
    });
    $("#ch", d).onclick = () => { mode = "h"; show(); };
    $("#cm", d).onclick = () => { mode = "m"; show(); };
    $("#am", d).onclick = () => { if (H >= 12) H -= 12; show(); };
    $("#pm", d).onclick = () => { if (H < 12) H += 12; show(); };
    $("#tnow", d)?.addEventListener("click", () => { [H, Mi] = nowHM().split(":").map(Number); mode = "m"; show(); });
    $("#tmok", d).onclick = () => { T[id] = val(); MAN[id] = 1; Rn[id] = $("#tmr", d).value.trim(); M[id] = "l"; closeModal(); draw(); };
    $("#tmx", d).onclick = () => { M[id] = "p"; delete T[id]; delete MAN[id]; delete Rn[id]; closeModal(); draw(); };
    show();
  };
  const save = (btn, hol) => busy(btn, async () => {
    const s = {}, t = {}, r = {};
    if (!hol) kids.forEach(k => { const st = M[k.id]; if (st !== "p") s[k.id] = st; if (st === "l") { t[k.id] = T[k.id] || nowHM(); if (Rn[k.id]) r[k.id] = Rn[k.id]; } });
    const day = hol ? { hol: true, by: S.me.loginId, byName: S.profile?.name || "", at: serverTimestamp() }
      : { s, t, r, n: kids.length, by: S.me.loginId, byName: S.profile?.name || "", at: serverTimestamp() };
    const w = writeBatch(db), ref = attRef(batchId, ym);
    w.set(ref, { branchId: S.branchId, yearId: S.year, batchId, batchName: b.name, start: b.start || "", ym }, { merge: true });
    w.update(ref, { [`days.${dd}`]: day });
    // નેટ ન હોય તો commit રાહ જુએ — ફોનમાં તો સચવાઈ જ ગયું છે, એટલે 2.5 સેકન્ડ પછી આગળ વધો
    let offline = !navigator.onLine;
    const p = w.commit().then(() => true, e => { fail(e, "હાજરી મોકલાઈ નહીં. ફરી સાચવો."); return false; });
    const res = await Promise.race([p, new Promise(ok => setTimeout(() => ok("wait"), 2500))]);
    if (res === false) return;
    if (res === "wait") offline = true;
    audit(hol ? "att.holiday" : (old ? "att.edit" : "att.take"), `${batchId}_${date}`, hol ? "રજા" : `${Object.values(s).filter(x => x === "a").length} ગેર, ${Object.values(s).filter(x => x === "l").length} મોડા`);
    buzz("done"); chime([660, 880]);
    done(hol, s, t, r, offline);
  });
  // સચવાઈ ગયા પછી: વાલીને WhatsApp
  const done = async (hol, s, t, r, offline) => {
    const c = { p: 0, a: 0, l: 0, h: 0 }; kids.forEach(k => c[s[k.id] || "p"]++);
    // આ મહિનાની ગણતરી (સંદેશમાં "આ મહિને 4 વાર")
    const cur = await getAtt(batchId, ym).catch(() => null);
    const month = {}; Object.values(cur?.days || {}).forEach(dy => Object.entries(dy.s || {}).forEach(([sid, st]) => { month[sid] = month[sid] || { a: 0, l: 0 }; if (st === "a" || st === "l") month[sid][st]++; }));
    const who = kids.filter(k => s[k.id] === "a" || s[k.id] === "l");
    v.innerHTML = `
      <div class="card"><div class="okhead"><span class="tick">${ic("check", 34)}</span>
        <h1>${hol ? "રજા સચવાઈ" : `${c.p} હાજર • ${c.l} મોડા • ${c.a} ગેરહાજર • ${c.h} રજા`}</h1>
        <span class="sub">${esc(b.name)} • ${fmtD(date)}${hol ? "" : " • વાલીની એપમાં આપમેળે દેખાશે"}</span></div></div>
      ${offline ? `<div class="note old">${ic("info", 20)}<div><b>નેટ નથી:</b> હાજરી ફોનમાં સચવાઈ છે. નેટ આવે એટલે આપમેળે મોકલાઈ જશે. એપ બંધ કરી શકો છો.</div></div>` : ""}
      ${who.length ? `<div class="card" style="gap:0"><h2 style="margin-bottom:6px">વાલીને WhatsApp (ઇચ્છો તો)</h2>
        ${who.map(k => {
          const st = s[k.id], m = month[k.id] || { a: 0, l: 0 }, late = lateBy(t[k.id], b.start);
          const msg = st === "a"
            ? `${ACADEMY.name}\nનમસ્તે, આજે ${fmtD(date)} ના રોજ ${k.n} ${b.name}${b.start ? " (" + b.start + ")" : ""} માં ગેરહાજર છે. આ મહિને ${m.a} વાર ગેરહાજર. 🙏`
            : `${ACADEMY.name}\nનમસ્તે, આજે ${fmtD(date)} ના રોજ ${k.n} ${b.name}${b.start ? " (" + b.start + ")" : ""} માં ${late ? late + " મિનિટ " : ""}મોડા (${t[k.id]}) આવ્યા.${r[k.id] ? " કારણ: " + r[k.id] + "." : ""} આ મહિને ${m.l} વાર મોડા. સમયસર મોકલવા વિનંતી 🙏`;
          return `<div class="srow"><span class="grow"><b>${esc(k.n)}</b><span class="sub ${st === "a" ? "due-over" : "late"}" style="display:block">${st === "a" ? `ગેરહાજર • આ મહિને ${m.a} વાર` : `મોડા ${esc(t[k.id])}${late ? ` (${late} મિ.)` : ""} • આ મહિને ${m.l} વાર`}</span></span>
            ${k.m ? `<a class="btn wa" style="min-height:40px" target="_blank" rel="noopener" href="${waLink(k.m, msg)}" data-sent>${ic("wa", 18)} મોકલો</a>` : `<span class="sub">નંબર નથી</span>`}</div>`;
        }).join("")}</div>` : ""}
      <div class="grid2"><a class="btn line" href="#/take/${encodeURIComponent(batchId)}/${date}" id="reopen">બદલવી છે? ફરી ખોલો</a><a class="btn primary" href="#/att">બીજી બેચ</a></div>`;
    $$("[data-sent]", v).forEach(a => a.addEventListener("click", () => setTimeout(() => { a.textContent = "✓ મોકલ્યું"; a.classList.replace("wa", "line"); }, 400)));
    $("#reopen").onclick = e => { e.preventDefault(); route(); };
    window.scrollTo(0, 0);
  };
  draw();
});

// ================= કેલેન્ડર અને માસિક રિપોર્ટ =================
// એક વિદ્યાર્થીનો મહિનો: { list: [{d, st, t, r, late}], c: {p,a,l,h,hol}, pct, lateMin }
export function studentMonth(att, sid, ym) {
  const out = { list: [], c: { p: 0, a: 0, l: 0, h: 0, hol: 0 }, lateMin: 0 };
  Object.entries(att?.days || {}).sort().forEach(([d, day]) => {
    const date = `${ym}-${d}`;
    if (day.hol) { out.c.hol++; out.list.push({ d: date, st: "hol" }); return; }
    // વિદ્યાર્થી એ દિવસે યાદીમાં હતો? (s માં હોય, અથવા પછીથી જોડાયો હોય તો પણ હાજર ગણીએ)
    const st = day.s?.[sid] || "p", t = day.t?.[sid] || "", late = st === "l" ? lateBy(t, att.start) : 0;
    out.c[st]++; out.lateMin += late;
    out.list.push({ d: date, st, t, r: day.r?.[sid] || "", late });
  });
  const base = out.c.p + out.c.l + out.c.a;
  out.pct = base ? Math.round((out.c.p + out.c.l) * 100 / base) : null;
  return out;
}
export function calHtml(m, ym) {
  const [y, mo] = ym.split("-").map(Number), first = new Date(y, mo - 1, 1).getDay(), n = new Date(y, mo, 0).getDate();
  const by = Object.fromEntries(m.list.map(x => [x.d.slice(8), x]));
  const lead = (first + 6) % 7; // સોમવારથી શરૂ
  let cells = "";
  for (let i = 0; i < lead; i++) cells += `<i class="e"></i>`;
  for (let d = 1; d <= n; d++) {
    const x = by[z2(d)], cls = x ? ({ p: "p", a: "a", l: "l", h: "h", hol: "h" }[x.st]) : "";
    cells += `<i class="${cls}" title="${x ? (x.st === "hol" ? "વર્ગ નહીં" : ST[x.st]) : ""}">${d}${x?.st === "l" && x.t ? `<small>${esc(x.t)}</small>` : ""}</i>`;
  }
  return `<div class="cal">${["સો", "મં", "બુ", "ગુ", "શુ", "શ", "ર"].map(d => `<span>${d}</span>`).join("")}${cells}</div>
    <div class="cal-leg"><span>🟩 હાજર ${m.c.p}</span><span>🟧 મોડા ${m.c.l}</span><span>🟥 ગેરહાજર ${m.c.a}</span><span>🟨 રજા ${m.c.h + m.c.hol}</span></div>`;
}
// આજનું કાર્ડ (વાલી/વિદ્યાર્થી): ગેરહાજર = લાલ, મોડો = નારંગી
export function todayCard(att, sid, name) {
  const day = att?.days?.[ymd().slice(8, 10)];
  if (!day || day.hol) return "";
  const st = day.s?.[sid];
  if (st === "a") return `<div class="card-alert red"><span class="ph" style="background:#DC2626;color:#fff">!</span><div class="grow"><b class="due-over">આજે ${esc(name)} ક્લાસમાં ગેરહાજર છે</b><span class="sub" style="display:block">${esc(att.batchName || "")}${att.start ? " • " + esc(att.start) : ""}${day.byName ? " • લેનાર: " + esc(day.byName) : ""}</span></div></div>`;
  if (st === "l") { const t = day.t?.[sid] || "", late = lateBy(t, att.start); return `<div class="card-alert org"><span class="ph" style="background:#F97316;color:#fff">${ic("clock", 22)}</span><div class="grow"><b class="late">આજે ${esc(name)} ${late ? late + " મિનિટ " : ""}મોડા આવ્યા</b><span class="sub" style="display:block">આવ્યા ${esc(t)}${att.start ? " • બેચ " + esc(att.start) : ""} • ${esc(att.batchName || "")}</span></div></div>`; }
  return "";
}
export async function loadStudentAtt(s, ym = ymd().slice(0, 7)) { return s?.batchId ? getAtt(s.batchId, ym) : null; }

// વિદ્યાર્થીનો માસિક રિપોર્ટ: #/attrep/G101/2026-11
page("attrep", async v => {
  const sid = arg(2), ym = arg(3) || ymd().slice(0, 7);
  const ss = await getDoc(doc(db, "students", sid));
  if (!ss.exists()) { v.innerHTML = `<div class="empty">વિદ્યાર્થી મળ્યો નહીં.</div>`; return; }
  const s = ss.data(), att = await loadStudentAtt(s, ym), m = studentMonth(att, sid, ym);
  const yms = [-2, -1, 0].map(k => shiftYm(ymd().slice(0, 7), k));
  const lates = m.list.filter(x => x.st === "l"), offs = m.list.filter(x => x.st === "a" || x.st === "h");
  const txt = `${ACADEMY.name}\nહાજરી રિપોર્ટ: ${s.name} • ${ymLabel(ym)}\nહાજર ${m.c.p} • મોડા ${m.c.l} • ગેરહાજર ${m.c.a} • રજા ${m.c.h}${m.pct != null ? ` • ${m.pct}%` : ""}` +
    (lates.length ? `\nમોડા: ${lates.map(x => `${fmtD(x.d).slice(0, 5)} ${x.t}`).join(", ")}` : "") +
    (m.c.a ? `\nગેરહાજર: ${m.list.filter(x => x.st === "a").map(x => fmtD(x.d).slice(0, 5)).join(", ")}` : "");
  v.innerHTML = `
    <div class="row-between"><a class="btn line" href="${canAtt() ? `#/student/${encodeURIComponent(sid)}` : "#/home"}">${ic("back", 18)} પાછા</a></div>
    <div><h1 class="page-title" style="margin:0">માસિક હાજરી રિપોર્ટ</h1><span class="sub">${esc(s.name)} • ${esc(s.batchName || "ધો. " + s.std)}</span></div>
    <div class="hscroll">${yms.map(x => `<a class="chip ${x === ym ? "on" : ""}" href="#/attrep/${encodeURIComponent(sid)}/${x}">${MONTHS[+x.slice(5) - 1]}</a>`).join("")}</div>
    <div class="grid2" style="grid-template-columns:repeat(4,1fr)">${[[m.c.p, "હાજર", "#15803D"], [m.c.l, "મોડા", "#F97316"], [m.c.a, "ગેરહાજર", "#DC2626"], [m.pct != null ? m.pct + "%" : "—", "ટકા", "var(--navy)"]]
      .map(([n, l, c]) => `<div class="card center" style="gap:0;padding:10px 4px"><b class="big-num" style="color:${c};font-size:22px">${n}</b><span class="sub">${l}</span></div>`).join("")}</div>
    ${!att ? `<div class="empty">${ymLabel(ym)} માં હજુ હાજરી લેવાઈ નથી.</div>` : `
    <div class="card"><h2>${ymLabel(ym)}</h2>${calHtml(m, ym)}</div>
    <div class="card" style="gap:0"><div class="row-between"><h2>મોડા આવ્યાની યાદી</h2>${m.lateMin ? `<span class="pill late-pill">કુલ ${m.lateMin} મિનિટ</span>` : ""}</div>
      ${lates.length ? `<table class="tbl"><tr><th>તારીખ</th><th>બેચ સમય</th><th>આવ્યા</th><th>મોડા</th></tr>
        ${lates.map(x => `<tr><td>${fmtD(x.d).slice(0, 5)} ${wd(x.d)}</td><td>${esc(att.start || "—")}</td><td class="late"><b>${esc(x.t)}</b></td><td>${x.late ? x.late + " મિ." : "—"}${x.r ? `<br><small>${esc(x.r)}</small>` : ""}</td></tr>`).join("")}</table>`
        : `<p class="muted">આ મહિને એક પણ વાર મોડા નથી ✓</p>`}</div>
    <div class="card" style="gap:0"><h2>ગેરહાજર / રજા</h2>
      ${offs.length ? `<table class="tbl"><tr><th>તારીખ</th><th>સ્થિતિ</th></tr>
        ${offs.map(x => `<tr><td>${fmtD(x.d).slice(0, 5)} ${wd(x.d)}</td><td class="${x.st === "a" ? "due-over" : ""}"><b>${ST[x.st]}</b></td></tr>`).join("")}</table>` : `<p class="muted">આ મહિને એક પણ દિવસ ગેરહાજર નથી ✓</p>`}</div>
    <div class="grid2"><a class="btn wa" target="_blank" rel="noopener" href="${waLink(canAtt() ? (s.mobWa || s.mobParent) : "", txt)}">${ic("wa", 18)} WhatsApp</a>
      <button type="button" class="btn line" id="rpr">${ic("print", 18)} PDF</button></div>`}`;
  $("#rpr", v)?.addEventListener("click", () => printNode(v, `હાજરી_${s.name}_${ym}`));
});

// બેચનો માસિક રિપોર્ટ: #/battrep/<batch>/2026-11
page("battrep", async v => {
  if (!canAtt()) { location.hash = "#/home"; return; }
  const batchId = arg(2), ym = arg(3) || ymd().slice(0, 7);
  const [bs, roster, att] = await Promise.all([getDoc(doc(db, "batches", batchId)), loadRoster(), getAtt(batchId, ym)]);
  const b = bs.exists() ? bs.data() : { name: "" };
  const flt = sessionStorage.getItem("gv_brf") || "all";
  const rows = roster.filter(r => r.b === batchId).map(r => ({ r, m: studentMonth(att, r.id, ym) }))
    .sort((x, y) => String(x.r.n).localeCompare(String(y.r.n), "gu"));
  const yms = [-2, -1, 0].map(k => shiftYm(ymd().slice(0, 7), k));
  const taken = Object.values(att?.days || {}).filter(d => !d.hol).length;
  v.innerHTML = `
    <div class="row-between"><a class="btn line" href="#/att">${ic("back", 18)} પાછા</a><span class="sub">${taken} દિવસ હાજરી લેવાઈ</span></div>
    <div><h1 class="page-title" style="margin:0">બેચનો માસિક રિપોર્ટ</h1><span class="sub">${esc(b.name)} • ${ymLabel(ym)}</span></div>
    <div class="hscroll">${yms.map(x => `<a class="chip ${x === ym ? "on" : ""}" href="#/battrep/${encodeURIComponent(batchId)}/${x}">${MONTHS[+x.slice(5) - 1]}</a>`).join("")}</div>
    <div class="hscroll">${[["all", "બધા"], ["l", "ફક્ત મોડા"], ["a", "ફક્ત ગેરહાજર"], ["low", "75% થી ઓછા"]].map(([k, l]) => `<button type="button" class="chip ${flt === k ? "on" : ""}" data-bf="${k}">${l}</button>`).join("")}</div>
    <div class="card" style="padding:8px"><table class="tbl" id="btbl"></table></div>
    <p class="hint">નામ દબાવો → તે વિદ્યાર્થીનો પૂરો રિપોર્ટ (મોડા આવ્યાની તારીખ-સમય સાથે).</p>
    <div class="grid2"><button type="button" class="btn line" id="bcsv">${ic("dl", 18)} Excel</button><button type="button" class="btn line" id="bpr">${ic("print", 18)} PDF</button></div>`;
  const draw = () => {
    const L = rows.filter(({ m }) => flt === "all" || (flt === "l" ? m.c.l : flt === "a" ? m.c.a : m.pct != null && m.pct < 75));
    $("#btbl").innerHTML = `<tr><th>નામ</th><th>હાજર</th><th>મોડા</th><th>ગેર.</th><th>%</th></tr>` +
      (L.map(({ r, m }) => `<tr><td><a href="#/attrep/${encodeURIComponent(r.id)}/${ym}">${esc(r.n)}</a></td><td>${m.c.p}</td>
        <td class="late"><b>${m.c.l}</b>${m.lateMin ? `<br><small>${m.lateMin} મિ.</small>` : ""}</td><td class="due-over"><b>${m.c.a}</b></td>
        <td style="color:${m.pct != null && m.pct < 75 ? "#DC2626" : "#15803D"};font-weight:700">${m.pct ?? "—"}</td></tr>`).join("")
      || `<tr><td colspan="5" class="muted center">કોઈ નથી.</td></tr>`);
  };
  $$("[data-bf]", v).forEach(x => x.onclick = () => { sessionStorage.setItem("gv_brf", x.dataset.bf); route(); });
  $("#bcsv").onclick = () => {
    const head = ["ID", "નામ", "હાજર", "મોડા", "મોડા મિનિટ", "ગેરહાજર", "રજા", "%", "મોડા આવ્યાની વિગત", "ગેરહાજર તારીખો"];
    const L = rows.map(({ r, m }) => [r.id, r.n, m.c.p, m.c.l, m.lateMin, m.c.a, m.c.h, m.pct ?? "",
      m.list.filter(x => x.st === "l").map(x => `${fmtD(x.d).slice(0, 5)} ${x.t}`).join("; "), m.list.filter(x => x.st === "a").map(x => fmtD(x.d).slice(0, 5)).join("; ")]);
    const csv = "﻿" + [head, ...L].map(a => a.map(x => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `હાજરી_${b.name}_${ym}.csv`; a.click();
  };
  $("#bpr").onclick = () => printNode(v, `હાજરી_${b.name}_${ym}`);
  draw();
});

// પાનું છાપો / PDF (બટન વગર)
function printNode(v, title) {
  let el = $("#print"); if (!el) { el = document.createElement("div"); el.id = "print"; document.body.appendChild(el); }
  const c = v.cloneNode(true); c.querySelectorAll("button, .btn, .hscroll, .hint").forEach(x => x.remove());
  el.innerHTML = `<section class="pr-att"><h2>${esc(ACADEMY.name)}</h2>${c.innerHTML}</section>`;
  const t = document.title; document.title = title;
  setTimeout(() => { window.print(); document.title = t; }, 150);
}
