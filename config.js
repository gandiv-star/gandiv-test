// =============================================================
//  ગાંડિવ એકેડેમી V2 — ગોઠવણ (config)
//  ટેસ્ટિંગ અને મૂળ એપ, બંનેની Firebase માહિતી અહીં છે.
// =============================================================

// મૂળ એપ (Production) — જૂનો પ્રોજેક્ટ, મફત Spark પ્લાન
const PROD = {
  apiKey: "AIzaSyAJfS23XNLbNLaKPvsdoY79Ce0APtC6Oyk",
  authDomain: "gandiv-academy-6d5b6.firebaseapp.com",
  projectId: "gandiv-academy-6d5b6",
  storageBucket: "gandiv-academy-6d5b6.firebasestorage.app",
  messagingSenderId: "577855749294",
  appId: "1:577855749294:web:5c89e4381d988daf71813f"
};

// ટેસ્ટિંગ એપ — gandiv-test પ્રોજેક્ટ
const TEST = {
  apiKey: "AIzaSyAZQnpZe4a8IQE-okqRJ03lFYsrHRQJEP0",
  authDomain: "gandiv-test.firebaseapp.com",
  projectId: "gandiv-test",
  storageBucket: "gandiv-test.firebasestorage.app",
  messagingSenderId: "38612188169",
  appId: "1:38612188169:web:0fdd411d5c09fa029c8cd8"
};

// વેબસાઇટના સરનામામાં "gandiv-test" હોય તો ટેસ્ટિંગ, નહીં તો મૂળ એપ
export const IS_TEST = /gandiv-test|localhost|127\.0\.0\.1/.test(location.href);
export const firebaseConfig = IS_TEST ? TEST : PROD;

// Master નો ઈમેઇલ (firestore.rules માં પણ આ જ)
export const MASTER_EMAILS = ["gandivacademy@gmail.com"];

// ID થી લોગિન (T1, G101...) માટે અંદરનું ઈમેઇલ-ડોમેન. આ સાચું ડોમેન નથી, ફક્ત ઓળખ માટે.
export const LOGIN_DOMAIN = "id.gandivacademy.app";

// એપ સુરક્ષા (App Check, reCAPTCHA v3 ની જાહેર "site key"). ખાલી = બંધ.
// mode: "watch" = ફક્ત નજર, "on" = Firebase માં ચાલુ (Enforce) કર્યું
export const APPCHECK = IS_TEST ? { key: "", mode: "" } : { key: "", mode: "" };

export const ACADEMY = {
  name: "ગાંડિવ એકેડેમી",
  tagline: "યુદ્ધ એજ કલ્યાણ",
  phone: "9974788382",
  // પોસ્ટર માટે (ટોપર્સ વગેરે)
  address: "\"ભાસ્કરરાવ ઠાકર કોમ્પલેક્ષ\", પહેલો માળ, ગાંધીબાગ રોડ, મહુવા",
  posterLine: "ધોરણ 7 થી 12 • સાયન્સ • કોમર્સ • JEE / NEET",
  // ફીની પહોંચનું મથાળું (કાગળની પહોંચ જેવું)
  trust: "ગાંડિવ ચેરિટેબલ ટ્રસ્ટ દ્વારા સંચાલિત",
  contacts: [["બાવળીયા સર", "9974788382"], ["ડી.કે. બાવળીયા", "9662678586"]],
  strip: "ધોરણ: 7 થી 12 (સાયન્સ, કોમર્સ) | NEET / GUJCET / JEE / NMMS / CET | જવાહર નવોદય પરીક્ષાની તૈયારી"
};
