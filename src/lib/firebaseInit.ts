import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { DATA_BACKEND } from "./dataBackend";

/**
 * Firebase を使うかどうかは dataBackend.ts の DATA_BACKEND で一元管理する。
 * DATA_BACKEND === "firebase" のときだけ Firestore に接続する。
 * （現在は "vercel" バックエンドを使用するため false）
 */
export const FIREBASE_ENABLED = DATA_BACKEND === "firebase";

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
