import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
  type DocumentData
} from "firebase/firestore";
import { db, FIREBASE_ENABLED } from "./firebaseInit";
import OrderBus from "./orderBus";

export { db, FIREBASE_ENABLED };


// Keep existing collections & compatibility
export const ordersCol = collection(db, "orders");

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
  BATCH = 'batch',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path
  };
  console.error('[Firebase Error]', JSON.stringify(errInfo, null, 2));
  throw new Error(JSON.stringify(errInfo));
}

function removeUndefined(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(v => removeUndefined(v));
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => [k, removeUndefined(v)])
    );
  }
  return obj;
}

// ==========================================
// Compatibility Layer for Orders
// ==========================================

export async function pushOrder(order: Record<string, unknown>): Promise<string> {
  if (!FIREBASE_ENABLED) {
    // ローカル運用: クラウドへは書き込まない。
    // 注文の OrderBus への登録は呼び出し側 (OrderContext) が行うため、
    // ここでは ID を返すだけにして二重登録を防ぐ。
    return (order?.id as string) || "";
  }
  console.log("[Firebase] pushOrder called with order:", order);
  try {
    const sanitizedOrder = removeUndefined(order);
    const ref = await addDoc(ordersCol, {
      ...sanitizedOrder,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    console.log("[Firebase] pushOrder succeeded, doc ref ID:", ref.id);
    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, "orders");
    return "";
  }
}

export async function patchOrder(firestoreId: string, updates: Record<string, unknown>): Promise<void> {
  if (!FIREBASE_ENABLED) {
    // ローカル運用: OrderBus 上の注文を更新する。
    OrderBus.patch("orders", firestoreId, updates);
    return;
  }
  console.log(`[Firebase] patchOrder called for ID: ${firestoreId} with updates:`, updates);
  try {
    const sanitizedUpdates = removeUndefined(updates);
    await updateDoc(doc(db, "orders", firestoreId), {
      ...sanitizedUpdates,
      updatedAt: serverTimestamp()
    });
    console.log(`[Firebase] patchOrder succeeded for ID: ${firestoreId}`);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `orders/${firestoreId}`);
  }
}

export function subscribeOrders(callback: (orders: Array<Record<string, unknown>>) => void): () => void {
  if (!FIREBASE_ENABLED) {
    // ローカル運用: Firestore ではなく OrderBus の "orders" を購読する。
    // 即時に現在のデータでコールバックされ、変更時にも通知される。
    return OrderBus.subscribe("orders", callback as any);
  }
  console.log("[Firebase] subscribeOrders called");
  const q = query(ordersCol, orderBy("createdAt", "desc"));
  return onSnapshot(q, snap => {
    console.log(`[Firebase] subscribeOrders received snapshot with ${snap.docs.length} docs`);
    callback(snap.docs.map(d => ({ firestoreId: d.id, ...d.data() })));
  }, err => {
    try {
      handleFirestoreError(err, OperationType.LIST, "orders");
    } catch {
      // Silent catch for UI
    }
  });
}

// ==========================================
// Generic API for All Collections
// ==========================================

/**
 * Pushes a new document to any collection in Firestore.
 */
export async function pushDocument(collectionName: string, data: Record<string, unknown>): Promise<string> {
  console.log(`[Firebase] pushDocument called for: ${collectionName}`);
  try {
    const sanitizedData = removeUndefined(data);
    const colRef = collection(db, collectionName);
    const ref = await addDoc(colRef, {
      ...sanitizedData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, collectionName);
    return "";
  }
}

/**
 * Updates a document in any collection.
 */
export async function patchDocument(collectionName: string, docId: string, updates: Record<string, unknown>): Promise<void> {
  console.log(`[Firebase] patchDocument called for: ${collectionName}/${docId}`);
  try {
    const sanitizedUpdates = removeUndefined(updates);
    const docRef = doc(db, collectionName, docId);
    await updateDoc(docRef, {
      ...sanitizedUpdates,
      updatedAt: serverTimestamp()
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `${collectionName}/${docId}`);
  }
}

/**
 * Subscribes to changes in any collection.
 */
export function subscribeCollection(
  collectionName: string,
  callback: (docs: Array<Record<string, unknown>>) => void,
  orderField: string = "createdAt",
  direction: "asc" | "desc" = "desc"
): () => void {
  console.log(`[Firebase] subscribeCollection called for: ${collectionName}`);
  const colRef = collection(db, collectionName);
  const q = query(colRef, orderBy(orderField, direction));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ firestoreId: d.id, ...d.data() })));
  }, err => {
    try {
      handleFirestoreError(err, OperationType.LIST, collectionName);
    } catch {
      // Silent catch
    }
  });
}

/**
 * Runs batch write operations.
 */
export async function runBatchWrite(
  operations: Array<{
    type: "create" | "update" | "delete";
    collection: string;
    id?: string;
    data?: Record<string, unknown>;
  }>
): Promise<void> {
  console.log(`[Firebase] runBatchWrite with ${operations.length} operations`);
  try {
    const batch = writeBatch(db);
    operations.forEach(op => {
      if (op.type === "create") {
        const docRef = doc(collection(db, op.collection));
        batch.set(docRef, {
          ...removeUndefined(op.data || {}),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else if (op.type === "update" && op.id) {
        const docRef = doc(db, op.collection, op.id);
        batch.update(docRef, {
          ...removeUndefined(op.data || {}),
          updatedAt: serverTimestamp()
        });
      } else if (op.type === "delete" && op.id) {
        const docRef = doc(db, op.collection, op.id);
        batch.delete(docRef);
      }
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.BATCH, null);
  }
}

export { serverTimestamp };
