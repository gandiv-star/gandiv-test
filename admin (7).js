// =============================================================
//  ભાગ 2: Master / સંચાલક — શાખા, વર્ષ, લોગિન, બેચ  +  હોમ
// =============================================================
import {
  db, secondaryAuth, createUserWithEmailAndPassword, signOut,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, query, where,
  runTransaction, serverTimestamp, writeBatch
} from "./fb.js";
import {
  $, $$, esc, S, ROLES, CAN_CREATE, ID_PREFIX, isMaster, isAdmin, toast, fail, busy, audit,
  modal, closeModal, page, idToEmail, genPwd, waLink, appUrl, ic, route, renderShell, saveCtx
} from "./core.js";
import { ACADEMY, APPCHECK } from "./config.js";

const branchName = id => S.branches.find(b => b.id === id)?.name || "";
const STDS = ["7", "8", "9", "10", "11", "12"];
const STREAMS = ["Science", "Commerce", "Arts"];
const COURSES = ["NEET", "GUJCET", "JEE", "NMMS", "CET"];
const chips = (name, items, val, multi = false) => `<div class="chips" role="group">${items.map(x => {
  const on = multi ? (val || []).includes(x) : val === x;
  return `<button type="button" class="chip ${on ? "on" : ""}" data-chip="${name}" data-v="${esc(x)}" aria-pressed="${on}">${esc(x)}</button>`;
}).join("")}</div>`;
function wireChips(root, multiNames = []) {
  $$("[data-chip]", root).forEach(b => b.onclick = () => {
    const name = b.dataset.chip, multi = multiNames.includes(name);
    if (!multi) $$(`[data-chip="${name}"]`, root).forEach(x => { x.classList.remove("on"); x.setAttribute("aria-pressed", "false"); });
    const on = multi ? !b.classList.contains("on") : true;
    b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
  });
}
const chipVal = (root, name) => $(`[data-chip="${name}"].on`, root)?.dataset.v || "";
const chipVals = (root, name) => $$(`[data-chip="${name}"].on`, root).map(b => b.dataset.v);

// ================= હોમ (ભાગ 7 માં પૂરું ડેશબોર્ડ) =================
page("home", async v => {
  const r = S.me.role, name = esc(S.profile?.name || "");
  if (isAdmin()) return (await import("./home.js")).dashboard(v);
  if (r === "student" || r === "parent") return (await import("./students.js")).familyHome(v);
  if (r === "dataEntry") return (await import("./students.js")).entryPage(v);
  if (r === "teacher") return (await import("./att.js")).attHome(v);
  v.innerHTML = `<div class="card hello"><h1>નમસ્તે, ${name}</h1><p>${esc(ROLES[r]?.label || "")} • ${esc(branchName(S.branchId))}</p></div>
    <p class="muted center">તમારું હોમ આગળના ભાગમાં તૈયાર થશે.</p>`;
});

// ================= ગોઠવણ =================
page("settings", async v => {
  const tab = sessionStorage.getItem("gv_settab") || "branches";
  const tabs = [["branches", "શાખાઓ"], ["logins", "લોગિન"], ["year", "વર્ષ"], ...(isMaster() ? [["backup", "બેકઅપ"]] : [])];
  v.innerHTML = `<h1 class="page-title">ગોઠવણ</h1>
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" class="tab ${k === tab ? "on" : ""}" data-tab="${k}" aria-selected="${k === tab}">${l}</button>`).join("")}</div>
    <div id="tabBody"></div>`;
  $$("[data-tab]", v).forEach(b => b.onclick = () => { sessionStorage.setItem("gv_settab", b.dataset.tab); route(); });
  const body = $("#tabBody", v);
  if (tab === "branches") return branchesTab(body);
  if (tab === "logins") return loginsTab(body);
  if (tab === "backup" && isMaster()) return backupTab(body);
  return yearTab(body);
});

// ---------- શાખાઓ ----------
async function branchesTab(el) {
  const counts = {};
  await Promise.all(S.branches.map(async b => {
    try {
      const [bs, us] = await Promise.all([
        getDocs(query(collection(db, "batches"), where("branchId", "==", b.id), where("yearId", "==", S.year))),
        getDocs(query(collection(db, "users"), where("branchId", "==", b.id), where("role", "in", ["branchAdmin", "teacher", "receptionist", "accountant", "dataEntry"])))
      ]);
      counts[b.id] = { batches: bs.docs.filter(d => d.data().active !== false).length, staff: us.docs.filter(d => d.data().active !== false && !["student", "parent"].includes(d.data().role)).length };
    } catch { counts[b.id] = { batches: "-", staff: "-" }; }
  }));
  el.innerHTML = `
    ${S.branches.map(b => `<div class="card">
      <div class="row-between"><h2>${esc(b.name)}</h2><span class="pill ${b.active === false ? "" : "ok"}">${b.active === false ? "બંધ" : "ચાલુ"}</span></div>
      <p class="muted">${esc(b.address || "")}${b.phone ? " • " + esc(b.phone) : ""}</p>
      <div class="stats3"><div><span>બેચ</span><b>${counts[b.id]?.batches ?? "-"}</b></div><div><span>સ્ટાફ</span><b>${counts[b.id]?.staff ?? "-"}</b></div><div><span>વિદ્યાર્થી</span><b>-</b></div></div>
      ${isMaster() ? `<button type="button" class="btn line" data-edit="${b.id}">ફેરફાર કરો</button>` : ""}
    </div>`).join("") || `<div class="empty">હજુ કોઈ શાખા નથી.</div>`}
    ${isMaster() ? `<button type="button" class="btn line big" id="addBranch">+ નવી શાખા ઉમેરો</button>` : ""}`;
  $("#addBranch", el)?.addEventListener("click", () => branchForm());
  $$("[data-edit]", el).forEach(b => b.onclick = () => branchForm(S.branches.find(x => x.id === b.dataset.edit)));
}

function branchForm(b = null) {
  const d = modal(b ? "શાખામાં ફેરફાર" : "નવી શાખા", `
    <form id="bf" class="form" novalidate>
      <div class="field"><label for="bn">શાખાનું નામ</label><input id="bn" value="${esc(b?.name || "")}" placeholder="મહુવા"></div>
      <div class="field"><label for="ba">સરનામું</label><textarea id="ba" rows="2">${esc(b?.address || "")}</textarea></div>
      <div class="field"><label for="bp">ફોન</label><input id="bp" type="tel" inputmode="numeric" value="${esc(b?.phone || "")}"></div>
      <div class="field"><label for="bo">ક્રમ (યાદીમાં કયા સ્થાને)</label><input id="bo" type="number" value="${esc(b?.order ?? (S.branches.length + 1))}"></div>
      ${b ? `<label class="check"><input type="checkbox" id="bact" ${b.active === false ? "" : "checked"}> શાખા ચાલુ છે</label>` : ""}
      <button class="btn primary big" type="submit" id="bsave">સાચવો</button>
    </form>`);
  $("#bf", d).onsubmit = e => {
    e.preventDefault();
    const data = { name: $("#bn", d).value.trim(), address: $("#ba", d).value.trim(), phone: $("#bp", d).value.replace(/\D/g, "").slice(-10), order: Number($("#bo", d).value) || 99 };
    if (!data.name) return toast("શાખાનું નામ લખો.", true);
    busy($("#bsave", d), async () => {
      try {
        if (b) {
          data.active = $("#bact", d).checked;
          await updateDoc(doc(db, "branches", b.id), { ...data, updatedAt: serverTimestamp() });
          Object.assign(b, data); audit("branch.update", b.id, data.name);
        } else {
          const ref = await addDoc(collection(db, "branches"), { ...data, active: true, createdAt: serverTimestamp() });
          S.branches.push({ id: ref.id, ...data, active: true });
          if (!S.branchId) { S.branchId = ref.id; localStorage.setItem("gv_branch", ref.id); }
          audit("branch.create", ref.id, data.name);
        }
        saveCtx(); closeModal(); toast("શાખા સચવાઈ.");
        renderShell();
      } catch (e) { fail(e); }
    });
  };
}

// ---------- વર્ષ ----------
// ---------- બેકઅપ અને સુરક્ષા (ફક્ત માસ્ટર) ----------
async function backupTab(el) {
  let b = null;
  try { const d = await getDoc(doc(db, "meta", "backup")); b = d.exists() ? d.data() : null; } catch {}
  const z = n => String(n).padStart(2, "0"), dk = d => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  const at = b?.at?.toDate ? b.at.toDate() : b?.at ? new Date(b.at) : null;
  const age = at ? (Date.now() - at) / 36e5 : 1e9, stale = age > 50, bad = b && (b.ok === false || stale);
  const when = at ? `${dk(at) === dk(new Date()) ? "આજે" : at.getDate() + "/" + (at.getMonth() + 1)} ${z(at.getHours())}:${z(at.getMinutes())}` : "";
  const C = b?.counts || {}, n = k => Number(C[k]) || 0;
  const days = [...Array(7)].map((_, i) => { const d = new Date(Date.now() - (6 - i) * 864e5), k = dk(d), v = b?.days?.[k]; return [d.getDate(), v]; });
  const ac = APPCHECK.key ? (APPCHECK.mode === "on" ? ["ok", "ચાલુ ✓"] : ["warn", "હાલ: ફક્ત નજર"]) : ["", "હજુ ગોઠવવાનું બાકી"];
  el.innerHTML = `
    <div class="card">
      <div class="bk-head"><span class="bk-ic ${!b ? "" : bad ? "bad" : "ok"}">${ic(bad ? "x" : "check", 22)}</span>
        <div class="grow"><b>${!b ? "Drive બેકઅપ હજુ ગોઠવાયો નથી" : bad ? (b.ok === false ? "છેલ્લો બેકઅપ નિષ્ફળ" : "2 દિવસથી બેકઅપ નથી થયો") : "Drive બેકઅપ ચાલુ છે"}</b>
        <span class="sub" style="display:block">${b ? `છેલ્લો: ${when}${b.size ? " • " + (b.size / 1048576).toFixed(1) + " MB" : ""}` : "ગોઠવણ પછી રોજ રાત્રે 2 વાગ્યે આપમેળે થશે"}</span></div></div>
      ${bad ? `<div class="card-alert" style="margin:0">${b.ok === false ? `કારણ: ${esc(b.err || "-")}<br>` : ""}આનો ફોટો Claude ને મોકલો.</div>` : ""}
      ${b ? `<div class="grid2 bk-n"><div><span class="sub">વિદ્યાર્થી</span><b>${n("students")}</b></div><div><span class="sub">પહોંચ</span><b>${n("receipts")}</b></div>
        <div><span class="sub">હાજરી મહિના</span><b>${n("attendance")}</b></div><div><span class="sub">ફોટા</span><b>${n("photos")}</b></div></div>
        <span class="sub">છેલ્લા 7 દિવસ</span>
        <div class="bk-days">${days.map(([d, v]) => `<span class="${v === true ? "ok" : v === false ? "bad" : ""}">${d}<br>${v === true ? "✓" : v === false ? "✗" : "–"}</span>`).join("")}</div>
        <div class="grid2">${b.folderUrl ? `<a class="btn line" href="${esc(b.folderUrl)}" target="_blank" rel="noopener">${ic("dl", 18)} Drive ફોલ્ડર</a>` : ""}
          ${b.sheetUrl ? `<a class="btn line" href="${esc(b.sheetUrl)}" target="_blank" rel="noopener">${ic("receipt", 18)} Sheet ખોલો</a>` : ""}</div>
        <span class="sub">Firebase વાંચન: ${Number(b.reads) || 0} / 50,000 (રોજની મફત મર્યાદા)</span>` : ""}
    </div>
    <div class="card">
      <div class="bk-head"><span class="bk-ic ${ac[0]}">${ic("lock", 22)}</span>
        <div class="grow"><b>એપ સુરક્ષા (App Check)</b><span class="sub" style="display:block">ફક્ત ગાંડિવ એપ જ ડેટા જોઈ શકે</span></div></div>
      <span class="pill ${ac[0]}" style="align-self:flex-start">${ac[1]}</span>
      ${APPCHECK.key ? `<span class="sub" style="font-size:11px">This site is protected by reCAPTCHA and the Google Privacy Policy and Terms of Service apply.</span>` : ""}
    </div>`;
}

async function yearTab(el) {
  const y0 = Number(S.year.slice(0, 4));
  const opts = [y0 - 1, y0, y0 + 1].map(y => `${y}-${String(y + 1).slice(2)}`);
  el.innerHTML = `<div class="card">
      <div class="row-between"><h2>ચાલુ શૈક્ષણિક વર્ષ</h2><b class="big-num">${esc(S.year)}</b></div>
      <p class="muted">જૂન થી મે. નવી બેચ અને ફી આ વર્ષ પ્રમાણે સચવાય છે.</p>
      ${isMaster() ? `<div class="field"><label for="ysel">વર્ષ બદલો</label><select id="ysel">${opts.map(o => `<option ${o === S.year ? "selected" : ""}>${o}</option>`).join("")}</select></div>
      <button type="button" class="btn primary" id="ysave">સાચવો</button>
      <p class="hint">"નવું વર્ષ શરૂ કરો" (બધા વિદ્યાર્થીને આગલા ધોરણમાં ચડાવવા) વિદ્યાર્થીના ભાગ પછી ઉમેરાશે.</p>` : `<p class="hint">વર્ષ ફક્ત Master બદલી શકે.</p>`}
    </div>`;
  $("#ysave", el)?.addEventListener("click", e => busy(e.currentTarget, async () => {
    const y = $("#ysel", el).value;
    if (y === S.year) return toast("આ જ વર્ષ ચાલુ છે.");
    if (!confirm(`ચાલુ વર્ષ ${y} કરવું છે?`)) return;
    try { await setDoc(doc(db, "meta", "settings"), { currentYear: y, updatedAt: serverTimestamp() }, { merge: true }); S.year = y; saveCtx(); audit("year.set", y); toast("વર્ષ બદલાયું."); route(); }
    catch (e2) { fail(e2); }
  }));
}

// ---------- લોગિન ----------
async function loginsTab(el) {
  if (!S.branchId) { el.innerHTML = `<div class="empty">પહેલાં શાખા ઉમેરો.</div>`; return; }
  const qs = await getDocs(query(collection(db, "users"), where("branchId", "==", S.branchId), where("role", "in", ["branchAdmin", "teacher", "receptionist", "accountant", "dataEntry"])));
  const users = qs.docs.map(d => d.data()).filter(u => !["student", "parent"].includes(u.role))
    .sort((a, b) => (a.active === false) - (b.active === false) || String(a.loginId).localeCompare(String(b.loginId), "en", { numeric: true }));
  const roles = CAN_CREATE[S.me.role] || [];
  el.innerHTML = `
    <div class="card"><h2>${esc(branchName(S.branchId))}ના લોગિન</h2>
      ${users.map(u => `<div class="urow ${u.active === false ? "off" : ""}">
        <span class="avatar">${ic("user", 20)}</span>
        <div class="grow"><b>${esc(u.name)}</b><span class="muted">ID: ${esc(u.loginId)}${u.mobile ? " • " + esc(u.mobile) : ""}${u.active === false ? " • બંધ" : ""}</span></div>
        <span class="pill role" style="--c:${ROLES[u.role]?.color || "#14225A"}">${esc(ROLES[u.role]?.label || u.role)}</span>
        ${canManage(u) ? `<button type="button" class="icon-btn" data-more="${esc(u.loginId)}" aria-label="${esc(u.name)} માટે વિકલ્પ">⋮</button>` : ""}
      </div>`).join("") || `<p class="muted">હજુ કોઈ લોગિન નથી.</p>`}
    </div>
    ${roles.length ? `<form class="card form" id="nl" novalidate>
      <h2>નવો લોગિન બનાવો</h2>
      <div class="field"><span class="lbl">રોલ</span>${chips("role", roles.map(r => ROLES[r].label), ROLES[roles.includes("teacher") ? "teacher" : roles[0]].label)}</div>
      <div class="field"><label for="un">પૂરું નામ</label><input id="un" autocomplete="off"></div>
      <div class="field"><label for="um">મોબાઇલ</label><input id="um" type="tel" inputmode="numeric" maxlength="10"></div>
      <p class="hint">ID અને કામચલાઉ પાસવર્ડ આપમેળે બનશે. પહેલા લોગિન પર પાસવર્ડ બદલવો ફરજિયાત.</p>
      <button class="btn primary big" type="submit" id="nlb">લોગિન બનાવો</button>
    </form>` : ""}`;
  wireChips(el);
  $$("[data-more]", el).forEach(b => b.onclick = () => userMenu(users.find(u => u.loginId === b.dataset.more)));
  $("#nl", el)?.addEventListener("submit", e => {
    e.preventDefault();
    const label = chipVal(el, "role"), role = roles.find(r => ROLES[r].label === label);
    const name = $("#un", el).value.trim(), mobile = $("#um", el).value.replace(/\D/g, "");
    if (!role) return toast("રોલ પસંદ કરો.", true);
    if (name.length < 2) return toast("પૂરું નામ લખો.", true);
    if (mobile && mobile.length !== 10) return toast("મોબાઇલ નંબર 10 આંકડાનો લખો.", true);
    busy($("#nlb", el), async () => {
      try { const res = await createLogin({ role, name, mobile, branchId: S.branchId }); showCreds(res, "લોગિન બન્યો"); }
      catch (e2) { fail(e2, "લોગિન બન્યો નહીં. ફરી પ્રયત્ન કરો."); }
    });
  });
}

const canManage = u => u.loginId !== S.me.loginId && u.role !== "master" && (isMaster() || (CAN_CREATE[S.me.role] || []).includes(u.role));

function userMenu(u) {
  const d = modal(u.name, `
    <p class="muted">ID: ${esc(u.loginId)} • ${esc(ROLES[u.role]?.label || u.role)}</p>
    <div class="stack">
      <button type="button" class="btn line big" id="rp">નવો કામચલાઉ પાસવર્ડ આપો</button>
      <button type="button" class="btn line big ${u.active === false ? "" : "danger"}" id="tg">${u.active === false ? "લોગિન ફરી ચાલુ કરો" : "લોગિન બંધ કરો"}</button>
    </div>`);
  $("#rp", d).onclick = e => {
    if (!confirm(`${u.name} નો જૂનો પાસવર્ડ બંધ થઈ જશે. નવો કામચલાઉ પાસવર્ડ આપવો છે?`)) return;
    busy(e.currentTarget, async () => {
      try { const res = await resetLogin(u); closeModal(); showCreds(res, "નવો પાસવર્ડ"); }
      catch (e2) { fail(e2); }
    });
  };
  $("#tg", d).onclick = e => {
    const on = u.active === false;
    if (!confirm(on ? "લોગિન ફરી ચાલુ કરવો છે?" : "લોગિન બંધ કરવો છે? તે વ્યક્તિ એપ વાપરી નહીં શકે.")) return;
    busy(e.currentTarget, async () => {
      try {
        const b = writeBatch(db);
        b.update(doc(db, "users", u.loginId), { active: on, updatedAt: serverTimestamp() });
        if (u.uid) b.update(doc(db, "authmap", u.uid), { active: on });
        await b.commit(); audit(on ? "user.activate" : "user.deactivate", u.loginId);
        closeModal(); toast(on ? "લોગિન ચાલુ થયો." : "લોગિન બંધ થયો."); route();
      } catch (e2) { fail(e2); }
    });
  };
}

// નવો લોગિન: ID ક્રમ → Firebase ખાતું → authmap, users, loginIndex
// નવો ID ક્રમ (T1, S1, G101, P1 ...)
export function reserveId(prefix) {
  return runTransaction(db, async tx => {
    const ref = doc(db, "counters", "loginIds");
    const snap = await tx.get(ref);
    const n = ((snap.exists() && snap.data()[prefix]) || (prefix === "G" ? 100 : 0)) + 1;
    tx.set(ref, { [prefix]: n }, { merge: true });
    return prefix + n;
  });
}
export async function createLogin({ role, name, mobile = "", branchId, extra = {}, loginId: fixedId = "" }) {
  const loginId = fixedId || await reserveId(ID_PREFIX[role]);
  const pwd = genPwd(), email = idToEmail(loginId);
  const sec = secondaryAuth();
  const cred = await createUserWithEmailAndPassword(sec, email, pwd);
  const uid = cred.user.uid;
  await signOut(sec).catch(() => {});
  const b = writeBatch(db);
  b.set(doc(db, "authmap", uid), { loginId, role, branchIds: [branchId], active: true });
  b.set(doc(db, "users", loginId), {
    loginId, role, name, mobile, branchId, uid, ver: 1, active: true, mustChangePassword: true,
    createdAt: serverTimestamp(), createdBy: S.me.loginId, ...extra
  });
  b.set(doc(db, "loginIndex", loginId), { email });
  await b.commit();
  audit("user.create", loginId, `${role} ${name}`);
  return { loginId, pwd, name, mobile };
}

// પાસવર્ડ રીસેટ (મફત પ્લાનમાં): એ જ ID માટે નવું ખાતું, જૂનું બંધ
export async function resetLogin(u) {
  const ver = (u.ver || 1) + 1, pwd = genPwd(), email = idToEmail(u.loginId, ver);
  const sec = secondaryAuth();
  const cred = await createUserWithEmailAndPassword(sec, email, pwd);
  const uid = cred.user.uid;
  await signOut(sec).catch(() => {});
  const am = u.uid ? await getDoc(doc(db, "authmap", u.uid)) : null;
  const base = am?.exists() ? am.data() : { loginId: u.loginId, role: u.role, branchIds: [u.branchId] };
  const b = writeBatch(db);
  b.set(doc(db, "authmap", uid), { ...base, active: u.active !== false });
  if (u.uid) b.update(doc(db, "authmap", u.uid), { active: false, replacedBy: uid });
  b.update(doc(db, "users", u.loginId), { uid, ver, mustChangePassword: true, pwResetAt: serverTimestamp() });
  b.set(doc(db, "loginIndex", u.loginId), { email });
  await b.commit();
  audit("user.reset", u.loginId);
  return { loginId: u.loginId, pwd, name: u.name, mobile: u.mobile };
}

export function showCreds({ loginId, pwd, name, mobile }, title) {
  const text = `${ACADEMY.name}\nનમસ્તે ${name},\nએપ: ${appUrl()}\nID: ${loginId}\nકામચલાઉ પાસવર્ડ: ${pwd}\nપહેલા લોગિન પર તમારો પોતાનો પાસવર્ડ રાખજો.`;
  const d = modal(title, `
    <div class="creds"><div><span>ID</span><b>${esc(loginId)}</b></div><div><span>કામચલાઉ પાસવર્ડ</span><b>${esc(pwd)}</b></div></div>
    <p class="hint">આ પાસવર્ડ ફરી દેખાશે નહીં. અત્યારે જ મોકલો અથવા લખી લો.</p>
    <div class="stack">
      <a class="btn wa big" target="_blank" rel="noopener" href="${waLink(mobile, text)}">${ic("share", 20)} WhatsApp પર મોકલો</a>
      <button type="button" class="btn line big" id="cpy">કોપી કરો</button>
      <button type="button" class="btn primary big" id="done">બરાબર</button>
    </div>`);
  $("#cpy", d).onclick = () => navigator.clipboard?.writeText(text).then(() => toast("કોપી થયું."), () => toast("કોપી ન થયું.", true));
  $("#done", d).onclick = () => closeModal();
  d.addEventListener("close", () => route(), { once: true });
}

// ================= બેચ =================
page("batches", async v => {
  if (!S.branchId) { v.innerHTML = `<div class="empty">પહેલાં ગોઠવણમાં શાખા ઉમેરો.</div>`; return; }
  const [bs, us] = await Promise.all([
    getDocs(query(collection(db, "batches"), where("branchId", "==", S.branchId), where("yearId", "==", S.year))),
    getDocs(query(collection(db, "users"), where("branchId", "==", S.branchId), where("role", "==", "teacher")))
  ]);
  const teachers = us.docs.map(d => d.data()).filter(u => u.role === "teacher" && u.active !== false);
  const stdOrder = s => (STDS.includes(s) ? Number(s) : 50);
  const batches = bs.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.active === false) - (b.active === false) || stdOrder(a.std) - stdOrder(b.std) || String(a.start).localeCompare(String(b.start)));
  v.innerHTML = `<div class="row-between"><h1 class="page-title">બેચ</h1><span class="muted">${esc(branchName(S.branchId))} • ${esc(S.year)}</span></div>
    <div class="card">${batches.map(b => `<button type="button" class="brow ${b.active === false ? "off" : ""}" data-b="${b.id}">
        <span class="std">${esc(b.course || b.std)}</span>
        <span class="grow"><b>${esc(b.name)}</b><span class="muted">${esc(b.start || "")}${b.end ? " – " + esc(b.end) : ""}${b.teacherName ? " • " + esc(b.teacherName) : ""}${b.active === false ? " • બંધ" : ""}</span></span>
      </button>`).join("") || `<p class="muted">આ વર્ષની હજુ કોઈ બેચ નથી.</p>`}</div>
    ${isAdmin() ? `<button type="button" class="btn primary big" id="nb">+ નવી બેચ</button>` : ""}`;
  $("#nb", v)?.addEventListener("click", () => batchForm(null, teachers));
  $$("[data-b]", v).forEach(x => x.onclick = () => isAdmin() && batchForm(batches.find(b => b.id === x.dataset.b), teachers));
});

function batchForm(b, teachers) {
  const d = modal(b ? "બેચમાં ફેરફાર" : "નવી બેચ", `
    <form id="btf" class="form" novalidate>
      <div class="field"><label for="btn_">બેચનું નામ</label><input id="btn_" value="${esc(b?.name || "")}" placeholder="ધો. 10 A"></div>
      <div class="field"><span class="lbl">ધોરણ</span>${chips("std", STDS, b?.std || "")}</div>
      <div class="field"><span class="lbl">પ્રવાહ (ધો. 11–12 માટે)</span>${chips("stream", STREAMS, b?.stream || "")}</div>
      <div class="field"><span class="lbl">કોર્સ (વૈકલ્પિક)</span>${chips("course", COURSES, b?.course || "")}</div>
      <div class="grid2"><div class="field"><label for="bs">શરૂ</label><input id="bs" type="time" value="${esc(b?.start || "")}"></div>
        <div class="field"><label for="be">પૂરું</label><input id="be" type="time" value="${esc(b?.end || "")}"></div></div>
      <div class="field"><label for="bt">શિક્ષક</label><select id="bt"><option value="">— પછી નક્કી કરીશું —</option>${teachers.map(t => `<option value="${esc(t.loginId)}" ${b?.teacherId === t.loginId ? "selected" : ""}>${esc(t.name)} (${esc(t.loginId)})</option>`).join("")}</select></div>
      ${b ? `<label class="check"><input type="checkbox" id="bact" ${b.active === false ? "" : "checked"}> બેચ ચાલુ છે</label>` : ""}
      <button class="btn primary big" type="submit" id="bsv">બેચ સાચવો</button>
    </form>`);
  wireChips(d);
  // એક જ chip ફરી દબાવો તો પસંદગી નીકળી જાય (પ્રવાહ/કોર્સ વૈકલ્પિક છે)
  $$('[data-chip="stream"],[data-chip="course"]', d).forEach(c => c.addEventListener("click", () => {
    if (c.dataset.was === "1") { c.classList.remove("on"); c.setAttribute("aria-pressed", "false"); }
    $$(`[data-chip="${c.dataset.chip}"]`, d).forEach(x => (x.dataset.was = x.classList.contains("on") ? "1" : "0"));
  }));
  $$('[data-chip="stream"].on,[data-chip="course"].on', d).forEach(c => (c.dataset.was = "1"));
  $("#btf", d).onsubmit = e => {
    e.preventDefault();
    const tId = $("#bt", d).value, t = teachers.find(x => x.loginId === tId);
    const data = {
      name: $("#btn_", d).value.trim(), std: chipVal(d, "std"), stream: chipVal(d, "stream"), course: chipVal(d, "course"),
      start: $("#bs", d).value, end: $("#be", d).value, teacherId: tId, teacherName: t?.name || ""
    };
    if (!data.name) return toast("બેચનું નામ લખો.", true);
    if (!data.std && !data.course) return toast("ધોરણ અથવા કોર્સ પસંદ કરો.", true);
    if (data.start && data.end && data.end <= data.start) return toast("પૂરા થવાનો સમય શરૂ પછીનો રાખો.", true);
    busy($("#bsv", d), async () => {
      try {
        if (b) {
          data.active = $("#bact", d).checked;
          await updateDoc(doc(db, "batches", b.id), { ...data, updatedAt: serverTimestamp() }); audit("batch.update", b.id, data.name);
        } else {
          const ref = await addDoc(collection(db, "batches"), { ...data, branchId: S.branchId, yearId: S.year, active: true, createdAt: serverTimestamp(), createdBy: S.me.loginId });
          audit("batch.create", ref.id, data.name);
        }
        closeModal(); toast("બેચ સચવાઈ."); route();
      } catch (e2) { fail(e2); }
    });
  };
}
