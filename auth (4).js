// =============================================================
//  લોગિન, પહેલા લોગિન પર પાસવર્ડ બદલવો, અને શરૂઆત (boot)
// =============================================================
import { MASTER_EMAILS, ACADEMY, IS_TEST } from "./config.js";
import {
  auth, db, signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword,
  doc, getDoc, getDocs, setDoc, updateDoc, collection, serverTimestamp
} from "./fb.js";
import { $, esc, S, toast, fail, busy, renderShell, ic, saveCtx, readCtx, applyCtx, SKEL, clearSnap, watchSnap, welcomeOnce } from "./core.js";

const loginHtml = (msg = "") => `
<div class="login">
  <div class="login-top">
    <img src="logo.png" alt="ગાંડિવ એકેડેમીનો લોગો" class="login-logo">
    <h1>${esc(ACADEMY.name)}</h1>
    <p>${esc(ACADEMY.tagline)}</p>
    ${IS_TEST ? '<em class="test-tag">ટેસ્ટિંગ એપ</em>' : ""}
  </div>
  <form class="login-form" id="loginForm" novalidate>
    <h2>લોગિન કરો</h2>
    <div class="field"><label for="lid">તમારો ID (જેમ કે G101) અથવા ઈમેઇલ</label>
      <input id="lid" autocomplete="username" autocapitalize="characters" placeholder="G101" required></div>
    <div class="field"><label for="lpw">પાસવર્ડ</label>
      <input id="lpw" type="password" autocomplete="current-password" placeholder="••••••" required></div>
    ${msg ? `<p class="form-err" role="alert">${esc(msg)}</p>` : ""}
    <button class="btn primary big" type="submit" id="lbtn">લોગિન</button>
    <button class="link-btn" type="button" id="forgot">પાસવર્ડ ભૂલી ગયા?</button>
  </form>
</div>`;

export function showLogin(msg = "") {
  window.onhashchange = null; S.me = null;
  document.documentElement.style.setProperty("--role", "#14225A");
  $("#app").innerHTML = loginHtml(msg);
  $("#forgot").onclick = () => toast("તમારી શાખાના સંચાલકને કહો. તેઓ નવો કામચલાઉ પાસવર્ડ આપશે.");
  $("#loginForm").onsubmit = e => {
    e.preventDefault();
    const id = $("#lid").value.trim(), pw = $("#lpw").value;
    if (!id || !pw) return toast("ID અને પાસવર્ડ બંને લખો.", true);
    busy($("#lbtn"), async () => {
      try {
        let email = id;
        if (!id.includes("@")) {
          const ix = await getDoc(doc(db, "loginIndex", id.toUpperCase()));
          if (!ix.exists()) return toast("આ ID મળ્યો નહીં. સાચો ID લખો.", true);
          email = ix.data().email;
        }
        await signInWithEmailAndPassword(auth, email.toLowerCase(), pw);
      } catch (e) { fail(e, "લોગિન થયું નહીં. ફરી પ્રયત્ન કરો."); }
    });
  };
}

function showChangePassword() {
  $("#app").innerHTML = `
  <div class="login">
    <div class="login-top small">
      <img src="logo.png" alt="ગાંડિવ એકેડેમીનો લોગો" class="login-logo">
      <h1>નવો પાસવર્ડ રાખો</h1>
      <p>તમે પહેલી વાર લોગિન કર્યું છે. સલામતી માટે કામચલાઉ પાસવર્ડ બદલીને તમારો પોતાનો પાસવર્ડ રાખો.</p>
    </div>
    <form class="login-form" id="cpForm" novalidate>
      <div class="field"><label for="np1">નવો પાસવર્ડ (ઓછામાં ઓછા 6 અક્ષર)</label><input id="np1" type="password" autocomplete="new-password"></div>
      <div class="field"><label for="np2">ફરી એ જ પાસવર્ડ</label><input id="np2" type="password" autocomplete="new-password"></div>
      <p class="hint">આ પાસવર્ડ ફક્ત તમે જાણશો. સંચાલક પણ જોઈ શકશે નહીં.</p>
      <button class="btn primary big" type="submit" id="cpbtn">સાચવો અને આગળ વધો</button>
      <button class="link-btn" type="button" id="cpOut">${ic("out", 18)} બહાર નીકળો</button>
    </form>
  </div>`;
  $("#cpOut").onclick = () => signOut(auth);
  $("#cpForm").onsubmit = e => {
    e.preventDefault();
    const a = $("#np1").value, b = $("#np2").value;
    if (a.length < 6) return toast("પાસવર્ડ ઓછામાં ઓછો 6 અક્ષરનો રાખો.", true);
    if (a !== b) return toast("બંને પાસવર્ડ સરખા નથી.", true);
    busy($("#cpbtn"), async () => {
      try {
        await updatePassword(auth.currentUser, a);
        await updateDoc(doc(db, "users", S.me.loginId), { mustChangePassword: false, pwChangedAt: serverTimestamp() });
        S.profile.mustChangePassword = false;
        saveCtx();
        toast("પાસવર્ડ સચવાયો.");
        renderShell(); welcomeOnce();
      } catch (e) { fail(e); }
    });
  };
}

// Master નું પહેલું લોગિન: authmap અને profile આપમેળે બને
async function bootstrapMaster(user) {
  const me = { loginId: "MASTER", role: "master", branchIds: [], active: true, email: user.email };
  await setDoc(doc(db, "authmap", user.uid), me);
  await setDoc(doc(db, "users", "MASTER"), {
    loginId: "MASTER", role: "master", name: "Master", email: user.email, branchId: "",
    active: true, mustChangePassword: false, createdAt: serverTimestamp()
  });
  return me;
}

let pendingMsg = "";
const stop = async msg => { pendingMsg = msg; clearSnap(); await signOut(auth); };

// Firebase માંથી તાજી માહિતી: પહેલાં authmap, પછી બાકીનું બધું એકસાથે
async function fetchFresh(user) {
  const am = await getDoc(doc(db, "authmap", user.uid));
  let me = am.exists() ? am.data() : null;
  if (!me && MASTER_EMAILS.includes(String(user.email).toLowerCase())) me = await bootstrapMaster(user);
  if (!me || me.active === false) return { stop: "આ ખાતું ચાલુ નથી. શાખાના સંચાલકનો સંપર્ક કરો." };
  const [pr, st, br] = await Promise.all([
    getDoc(doc(db, "users", me.loginId)),
    getDoc(doc(db, "meta", "settings")),
    me.role === "master"
      ? getDocs(collection(db, "branches")).then(q => q.docs)
      : Promise.all((me.branchIds || []).map(id => getDoc(doc(db, "branches", id))))
  ]);
  const profile = pr.exists() ? pr.data() : { name: me.loginId };
  if (profile.active === false) return { stop: "આ ખાતું બંધ કરેલું છે." };
  return {
    me, profile,
    year: (st.exists() && st.data().currentYear) || S.year,
    branches: br.filter(d => d.exists()).map(d => ({ id: d.id, ...d.data() }))
  };
}
const sig = c => JSON.stringify([c.me, c.profile?.name, c.profile?.mustChangePassword, c.profile?.childIds, c.year, (c.branches || []).map(b => [b.id, b.name, b.active, b.order])]);
const errMsg = e => (e?.code?.includes("permission") ? "આ ખાતાને પરવાનગી નથી. સંચાલકનો સંપર્ક કરો." : "માહિતી લોડ ન થઈ. નેટ ચકાસીને ફરી પ્રયત્ન કરો.");

export function boot() {
  watchSnap();
  onAuthStateChanged(auth, async user => {
    S.user = user;
    if (!user) { const m = pendingMsg; pendingMsg = ""; return showLogin(m); }
    const cached = readCtx(user.uid);
    // ફોનમાં પહેલાંની માહિતી હોય તો તરત એપ ખોલો, અને પાછળથી ચકાસો
    if (cached?.me && !cached.profile?.mustChangePassword) {
      applyCtx(cached); renderShell(); welcomeOnce();
      fetchFresh(user).then(fresh => {
        if (fresh.stop) return stop(fresh.stop);
        const changed = sig(fresh) !== sig(cached);
        applyCtx(fresh); saveCtx();
        if (fresh.profile.mustChangePassword) return showChangePassword();
        if (changed) renderShell();
      }).catch(e => console.warn("background refresh", e));
      return;
    }
    $("#app").innerHTML = `<div class="splash"><img src="logo.png" alt="ગાંડિવ એકેડેમીનો લોગો">${SKEL}</div>`;
    try {
      const fresh = await fetchFresh(user);
      if (fresh.stop) return stop(fresh.stop);
      applyCtx(fresh); saveCtx();
      if (S.profile.mustChangePassword) return showChangePassword();
      renderShell(); welcomeOnce();
    } catch (e) { console.error(e); stop(errMsg(e)); }
  });
}
