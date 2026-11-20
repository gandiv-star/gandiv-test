// Firebase શરૂઆત અને જરૂરી ફંક્શન
import { firebaseConfig } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, initializeAuth, inMemoryPersistence, signInWithEmailAndPassword, signOut,
  onAuthStateChanged, createUserWithEmailAndPassword, updatePassword, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, onSnapshot,
  query, where, runTransaction, serverTimestamp, writeBatch, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// ફોનમાં ડેટા સચવાય: નેટ ન હોય ત્યારે પણ એપ ચાલે
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

// બીજાનું ખાતું બનાવતી વખતે પોતાનું લોગિન ન બદલાય તે માટે અલગ app
let _sec = null;
export function secondaryAuth() {
  if (!_sec) _sec = initializeAuth(initializeApp(firebaseConfig, "secondary"), { persistence: inMemoryPersistence });
  return _sec;
}

export {
  signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword,
  updatePassword, sendPasswordResetEmail,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, onSnapshot,
  query, where, runTransaction, serverTimestamp, writeBatch, arrayUnion
};
