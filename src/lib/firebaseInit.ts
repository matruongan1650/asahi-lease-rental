import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

/**
 * Global switch for Firebase cloud synchronization.
 * Set to true to link all portals (Admin, Staff, Customer) in real-time.
 */
export const FIREBASE_ENABLED = true;

const firebaseConfig = {
  apiKey: "AIzaSyBNm50HiPv9-qOdAZlpr50rxfz7aKtZMyw",
  authDomain: "asahi-4362c.firebaseapp.com",
  projectId: "asahi-4362c",
  storageBucket: "asahi-4362c.firebasestorage.app",
  messagingSenderId: "606315999570",
  appId: "1:606315999570:web:bfc80697ea26da90464a8b",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(app);
