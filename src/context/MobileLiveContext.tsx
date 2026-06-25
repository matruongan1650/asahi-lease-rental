import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo, useRef } from "react";
import OrderBus from "../lib/orderBus";
import { getProductQrCode } from "../utils/productQr";
import { deductOrderStock } from "../utils/stockLedger";
import { useUser } from "./UserContext";

// スタッフ自己割当(claim)の有効期限。これを超えた claim は無視して全員へ再表示する
// （担当者がアプリを閉じたまま/クラッシュした場合に注文が永久にロックされ誰も対応できなくなるのを防ぐ）。
const CLAIM_TTL_MS = 10 * 60 * 60 * 1000; // 10時間（1シフト相当）
// その注文を「他のスタッフが対応開始済み」かどうか。true ならスタッフ一覧から隠す。
// admin は MobileLive を使わない（この context はスタッフ専用）ため管理画面は全件表示のまま。
function isClaimedByOther(o: any, myId: string): boolean {
  const by = o?.claimedBy;
  if (!by || by === myId) return false; // 未claim または 自分のclaim → 表示する
  const at = Date.parse(o?.claimedAt || "");
  if (!Number.isNaN(at) && Date.now() - at > CLAIM_TTL_MS) return false; // 期限切れ → 全員へ再表示
  return true; // 他スタッフが対応中 → 隠す
}

// ---------------------------------------------------------------------------
// Mock Data (matching project reference)
// ---------------------------------------------------------------------------

export const STAFF = {
  haisou:  { name: "ミン トゥアン", role: "配送ドライバー", team: "東京第一配送センター", id: "DRV-204" },
  kaishu:  { name: "ミン トゥアン", role: "回収ドライバー", team: "東京第一配送センター", id: "DRV-204" },
  souko:   { name: "佐藤 健一", role: "倉庫スタッフ", team: "東京中央倉庫", id: "WHS-118" },
};

export const DELIVERIES = [
  {
    id: "DLV-20614", window: "09:00–10:00", priority: "通常",
    company: "大成建設 株式会社", site: "品川駅前再開発 B工区",
    addr: "東京都港区港南2-15-3", dist: "4.2km", eta: "12分",
    phone: "03-5479-1200", contact: "現場監督 田中様",
    items: [
      { name: "レボリューションコーン赤白", qty: 40, icon: "cone" },
      { name: "コーンバー黒/黄", qty: 20, icon: "minus" },
      { name: "LED投光器 充電式", qty: 12, icon: "package" },
      { name: "セフティフラッシュ", qty: 6, icon: "flag" },
    ],
    note: "搬入口は南側ゲート。10時以降は車両進入不可のため厳守。",
    status: "未着手",
  },
  {
    id: "DLV-20617", window: "10:30–11:30", priority: "急ぎ",
    company: "清水建設 株式会社", site: "豊洲スマートシティ C街区",
    addr: "東京都江東区豊洲6-4-1", dist: "8.7km", eta: "21分",
    phone: "03-3402-8855", contact: "工事課 鈴木様",
    items: [
      { name: "ガードフェンス", qty: 24, icon: "shield" },
      { name: "ウェイト 10kg", qty: 30, icon: "weight" },
      { name: "LED保安灯", qty: 18, icon: "sun" },
    ],
    note: "搬入時に検収印が必要。受領書を忘れずに。",
    status: "未着手",
  },
  {
    id: "DLV-20620", window: "13:00–14:00", priority: "通常",
    company: "鹿島建設 株式会社", site: "新宿西口駅前広場改修",
    addr: "東京都新宿区西新宿1-1", dist: "11.3km", eta: "28分",
    phone: "03-6388-4100", contact: "安全管理 高橋様",
    items: [
      { name: "樹脂製バリケード", qty: 16, icon: "package" },
      { name: "矢印板", qty: 8, icon: "navigation" },
      { name: "注意看板", qty: 10, icon: "alert" },
    ],
    note: "",
    status: "未着手",
  },
];

export const RECOVERIES = [
  {
    id: "RTN-31188", window: "14:30–15:30",
    company: "戸田建設 株式会社", site: "渋谷桜丘口地区再開発",
    addr: "東京都渋谷区桜丘町1-2", dist: "6.5km", eta: "16分",
    phone: "03-3433-7800", contact: "現場監督 伊藤様",
    note: "雨天により一部製品に泥汚れあり。確認のうえ回収。",
    products: [
      { id: "P-1001", qr: "AS-CONE-1001", name: "レボリューションコーン赤白", expected: 40, icon: "cone" },
      { id: "P-1002", qr: "AS-BAR-2200",  name: "コーンバー黒/黄", expected: 20, icon: "minus" },
      { id: "P-1003", qr: "AS-TANK-3010", name: "ガードフェンス", expected: 12, icon: "shield" },
      { id: "P-1004", qr: "AS-SIGN-4055", name: "セフティフラッシュ", expected: 6, icon: "flag" },
      { id: "P-1005", qr: "AS-LED-5120",  name: "LED保安灯", expected: 8, icon: "sun" },
    ],
  },
  {
    id: "RTN-31192", window: "16:00–17:00",
    company: "前田建設工業 株式会社", site: "池袋東口商業ビル新築",
    addr: "東京都豊島区南池袋1-28", dist: "9.1km", eta: "23分",
    phone: "03-5949-2300", contact: "工事課 渡辺様",
    note: "",
    products: [
      { id: "P-2001", qr: "AS-FENCE-6001", name: "ガードフェンス", expected: 24, icon: "shield" },
      { id: "P-2002", qr: "AS-WEIGHT-700", name: "ウェイト 10kg", expected: 30, icon: "weight" },
      { id: "P-2003", qr: "AS-ARROW-8030", name: "矢印板", expected: 8, icon: "navigation" },
    ],
  },
];

// 車両（vehicles）・メンテナンス（maintenance）はモックを使わず、実データ（OrderBus / admin 管理）のみを使用する。

export const STOCK_MOVES = [
  { id: "IN-7781",  type: "入庫", item: "レボリューションコーン赤白", qty: 120, time: "08:12", ref: "RTN-31170 回収分", icon: "cone" },
  { id: "OUT-9920", type: "出庫", item: "ガードフェンス",   qty: 24,  time: "08:40", ref: "DLV-20617 配送分", icon: "shield" },
  { id: "IN-7783",  type: "入庫", item: "LED保安灯",        qty: 32,  time: "09:05", ref: "RTN-31175 回収分", icon: "sun" },
  { id: "OUT-9925", type: "出庫", item: "単管バリケード",   qty: 12,  time: "09:20", ref: "DLV-20614 配送分", icon: "package" },
];

// 持込返却（持込対応）はモックを使わず、実データのみ（顧客が直接持ち込んだ返却で作成された
// walkinReturns）を使用する。以前のモック WALKIN_RETURNS 定数は削除済み。

// 実日付（ローカル深夜0時）基準で残り日数を数える。
// 以前は固定日 2026/06/02 を基準にしていたため、車検・保険・点検の「残り日数」が
// 日が経つほどズレていた（admin 側は実日付基準で不一致だった）。
export function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  const now = new Date();
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const [y, m, d] = dateStr.split("/").map(Number);
  const expiry = new Date(y, m - 1, d).getTime();
  return Math.round((expiry - t) / 86400000);
}

// ---------------------------------------------------------------------------
// Context Implementation
// ---------------------------------------------------------------------------

interface MobileLiveContextProps {
  connected: boolean;
  liveDeliveries: any[];
  liveRecoveries: any[];
  completeDelivery: (id: string, signature?: string | null, photos?: any[], extra?: any) => void;
  completeRecovery: (id: string, signature?: string | null, photos?: any[], inspected?: any[], staffName?: string, extra?: any) => void;
  vehicles: any[];
  recordVehicleShaken: (plate: string, updates: any) => void;
  products: any[];
  findProductByName: (name: string) => any;
  adjustStock: (firestoreId: string, delta: number) => void;
  setStock: (firestoreId: string, value: number) => void;
  maint: any[];
  walkin: any[];
  returnInspections: any[];
  stockMoves: any[];
  recordMaintenance: (id: string, updates: any) => void;
  addStockMove: (type: string, details?: { item: string; qty: number; ref?: string; icon?: string }, operator?: string) => void;
  pushFieldReports: (reports: any[]) => void;
  /** 直前に完了した現場回収を取り消す（誤操作の訂正）。最終検品キューも削除し状態を戻す。 */
  undoRecovery: (orderId: string) => void;
  /** 車両の稼働状態を変更。整備中にした場合は admin の整備キューにも登録する。 */
  setVehicleStatus: (plate: string, status: string) => void;
  /** 現場棚卸セッションを admin の棚卸履歴へ記録する。 */
  recordStocktakeSession: (session: Record<string, any>) => void;
  /** admin からスタッフへの連絡（staffMessages）。通知に表示する。 */
  staffMessages: any[];
}

const MobileLiveContext = createContext<MobileLiveContextProps | null>(null);

export function MobileLiveProvider({ children }: { children: React.ReactNode }) {
  // ログイン中スタッフのID。配送/回収ジョブの claim（自己割当）所有者として使う。
  const { currentUser } = useUser();
  const myId = currentUser?.id || "";
  const [rawOrders, setRawOrders] = useState<any[]>([]);
  const [connected, setConnected] = useState(false);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [maint, setMaint] = useState<any[]>([]);
  const [walkin, setWalkin] = useState<any[]>([]);
  const [returnInspections, setReturnInspections] = useState<any[]>([]);
  const [stockInRows, setStockIn] = useState<any[]>([]);
  const [stockOutRows, setStockOut] = useState<any[]>([]);
  const [staffMessages, setStaffMessages] = useState<any[]>([]);
  const completedDeliveryIdsRef = useRef<Set<string>>(new Set());

  // Subscriptions & Seeding
  useEffect(() => {
    // Orders subscription
    const unsubOrders = OrderBus.subscribe("orders", (ordersList) => {
      setRawOrders(ordersList);
      setConnected(true);
    });

    // Products subscription
    const unsubProducts = OrderBus.subscribe("products", (rows) => {
      if (rows.length) setProducts(rows);
    });

    // 車両は実データのみ（admin の車庫管理で登録されたもの）。モックは seed しない。
    const unsubVehicles = OrderBus.subscribe("vehicles", (rows) => {
      setVehicles(rows);
    });

    // メンテナンスは実データのみ（admin で登録されたもの）。モックは seed しない。
    const unsubMaint = OrderBus.subscribe("maintenance", (rows) => {
      setMaint(rows);
    });

    // 持込返却は実データのみ（顧客の一部返却で作成された walkinReturns）。モックは seed しない。
    // 追加・削除の両方を反映するため常に setWalkin する。
    const unsubWalkin = OrderBus.subscribe("walkinReturns", (rows) => {
      setWalkin(rows);
    });

    // 持込返却の検品記録（確認履歴）。
    const unsubReturnInsp = OrderBus.subscribe("returnInspections", (rows) => {
      setReturnInspections(rows);
    });

    // Stock moves subscription
    const unsubStockIn = OrderBus.subscribe("stockIn", setStockIn);
    const unsubStockOut = OrderBus.subscribe("stockOut", setStockOut);

    // admin → スタッフ への連絡（個別指示・差し戻し等）。通知に表示する。
    const unsubMessages = OrderBus.subscribe("staffMessages", setStaffMessages);

    return () => {
      unsubOrders();
      unsubProducts();
      unsubVehicles();
      unsubMaint();
      unsubWalkin();
      unsubReturnInsp();
      unsubStockIn();
      unsubStockOut();
      unsubMessages();
    };
  }, []);

  // Derive Deliveries
  // 配送タスクは実データ（実際の注文）のみから生成する。モックは使用しない。
  // 返却済・検品待ち・一部返却・配送済みの注文は「これから配送する」対象ではないため除外する
  // （-R 返却分注文などが staffStatus 未設定のまま配送予定に出る「幽霊タスク」を防ぐ）。
  const DELIVERY_EXCLUDED_STATUS = ["完了", "キャンセル", "返却済", "返却済み", "一部返却", "検品待ち", "配送済み", "レンタル中"];
  // スタッフ（APK）へは「受注確定」後のみ配信する。
  // 受注確定 = admin が status:"確認済み" + staffStatus:"配送予定" にした注文。
  // 顧客が出した直後の "処理中"（staffStatus 未設定）や却下/キャンセル分は配送タスクに出さない。
  const DELIVERY_CONFIRMED_STATUS = ["確認済み", "確認済", "準備中", "配送予定", "配送中"];
  // 注文が多いと毎レンダーでの再計算が重い。入力（rawOrders）が変わった時だけ再計算する。
  const liveDeliveries = useMemo(() => [
    ...rawOrders
      .filter(o => {
        if (isClaimedByOther(o, myId)) return false; // 他スタッフが対応開始済み → この端末の一覧から隠す
        if (!o.status || DELIVERY_EXCLUDED_STATUS.includes(o.status)) return false;
        const ss = String((o as any).staffStatus || "");
        // 受注確定済みのみ: status が確定系、または staffStatus が配送系/割当済み。
        return DELIVERY_CONFIRMED_STATUS.includes(o.status) || ss === "配送予定" || ss === "配送中" || ss === "割当済み";
      })
      .map(o => ({
        id: o.orderNumber || o.id || o.firestoreId,
        firestoreId: o.firestoreId || o.id,
        window: o.deliveryDate ? o.deliveryDate.replace(/-/g, "/") : "未定",
        priority: "通常",
        company: o.companyName || ((o.personLastName || "") + " " + (o.personFirstName || "")).trim() || o.personName || "ゲスト",
        site: o.siteName || "現場",
        addr: o.deliveryLocation || "住所未設定",
        dist: "—",
        eta: "—",
        phone: "",
        contact: ((o.personLastName || "") + " " + (o.personFirstName || "")).trim() || o.personName || o.companyName || "",
        items: (o.items || []).map((i: any) => ({ name: i.name, qty: i.quantity || 1, icon: i.category === "カラーコーン" ? "cone" : "package", image: i.image })),
        note: o.note || o.memo || "",
        status: "未着手",
        rawOrder: o,
      }))
  ].sort((a, b) => {
    // 納品希望日が近い順（未定は最後）。急ぎの配送を上に表示。
    const ta = a.rawOrder?.deliveryDate ? Date.parse(a.rawOrder.deliveryDate) : NaN;
    const tb = b.rawOrder?.deliveryDate ? Date.parse(b.rawOrder.deliveryDate) : NaN;
    return (Number.isNaN(ta) ? Infinity : ta) - (Number.isNaN(tb) ? Infinity : tb);
  }), [rawOrders, myId]);

  // Derive Recoveries
  // 回収タスクは実データ（実際の注文）のみから生成する。モックは使用しない。
  // 返却済・検品待ち・完了などの注文や、未返却のレンタル品が残っていない注文は
  // 回収対象ではないため除外（-R 返却分注文が回収予定に出る「幽霊タスク」を防ぐ）。
  // 未確定（処理中/注文確認中）の注文は回収タスクにも出さない（受注確定後のみスタッフへ）。
  const RECOVERY_EXCLUDED_STATUS = ["完了", "キャンセル", "返却済", "返却済み", "検品待ち", "処理中", "注文確認中"];
  const liveRecoveries = useMemo(() => [
    ...rawOrders
      .filter(o => {
        if (isClaimedByOther(o, myId)) return false; // 他スタッフが対応開始済み → この端末の一覧から隠す
        if (!o.rentalEndDate) return false;
        if (o.status && RECOVERY_EXCLUDED_STATUS.includes(o.status)) return false;
        if (o.staffStatus === "回収完了") return false;
        // 【回収可否】未納品（まだ配送タスク段階）の注文は回収できない。納品が完了して初めて回収対象になる。
        // deliveryConfirmedAt が立つ、または staffStatus/status が納品後の段階のものだけを回収候補にする。
        const isDelivered = Boolean(o.deliveryConfirmedAt)
          || ["配送完了", "回収予定", "回収中", "回収完了"].includes(String(o.staffStatus || ""))
          || ["レンタル中", "回収中", "一部返却"].includes(String(o.status || ""));
        if (!isDelivered) return false;
        const requestedReturn = o.requestedReturn || {};
        const hasRequestedReturn = Object.values(requestedReturn).some((v: any) => Number(v) > 0);
        // 未返却のレンタル品が 1 つも無ければ回収するものが無い
        const hasUnreturnedRent = (o.items || []).some(
          (i: any) => {
            if (!i || i.type !== "rent") return false;
            const remaining = Math.max(0, (Number(i.quantity) || 0) - (Number(i.returnedQuantity) || 0));
            if (remaining <= 0) return false;
            return !hasRequestedReturn || Number(requestedReturn[i.id] || 0) > 0;
          }
        );
        if (!hasUnreturnedRent) return false;
        // JST日付境界で残日数を計算する。new Date("YYYY-MM-DD") は UTC 0時、new Date() は端末ローカル時刻で
        // 9時間ずれ、Math.floor と相まって回収窓が1日早/遅れる。"/"区切りでローカル0時にし、今日のローカル0時と比較する。
        const end = new Date(String(o.rentalEndDate).replace(/-/g, "/")).getTime();
        const nowD = new Date();
        const t0 = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate()).getTime();
        const daysLeft = Math.floor((end - t0) / 86400000);
        return daysLeft <= 7 || o.staffStatus === "回収予定";
      })
      .map(o => ({
        id: (o.orderNumber || o.firestoreId || "").replace("ORD", "RTN"),
        firestoreId: o.firestoreId || o.id,
        window: o.rentalEndDate ? o.rentalEndDate.replace(/-/g, "/") : "未定",
        returnRequestType: o.returnRequestType,
        company: o.companyName || ((o.personLastName || "") + " " + (o.personFirstName || "")).trim() || o.personName || "ゲスト",
        site: o.siteName || "現場",
        addr: o.deliveryLocation || "住所未設定",
        dist: "—",
        eta: "—",
        phone: "",
        contact: ((o.personLastName || "") + " " + (o.personFirstName || "")).trim() || o.personName || o.companyName || "",
        note: "",
        products: (o.items || [])
          .filter((i: any) => {
            if (!i || i.type !== "rent") return false;
            const requestedReturn = o.requestedReturn || {};
            const hasRequestedReturn = Object.values(requestedReturn).some((v: any) => Number(v) > 0);
            const remaining = Math.max(0, (Number(i.quantity) || 0) - (Number(i.returnedQuantity) || 0));
            return remaining > 0 && (!hasRequestedReturn || Number(requestedReturn[i.id] || 0) > 0);
          })
          .map((i: any, idx: number) => {
          const requestedReturn = o.requestedReturn || {};
          const hasRequestedReturn = Object.values(requestedReturn).some((v: any) => Number(v) > 0);
          const remaining = Math.max(0, (Number(i.quantity) || 0) - (Number(i.returnedQuantity) || 0));
          const requestedQty = Math.max(0, Number(requestedReturn[i.id] || 0));
          const expectedQty = hasRequestedReturn ? Math.min(requestedQty, remaining) : remaining;
          const master = products.find((p: any) => p && (p.id === i.id || p.name === i.name));
          const id = i.id || master?.id || "P-" + idx;
          return {
            id,
            qr: master ? getProductQrCode(master) : getProductQrCode({ id } as any),
            qrPayload: master?.qrPayload,
            name: i.name,
            expected: expectedQty,
            icon: i.category === "カラーコーン" ? "cone" : "package",
            image: i.image,
            category: i.category
          };
        }),
        rawOrder: o,
      }))
  ].sort((a, b) => {
    // 返却期限が近い順（未定は最後）。期限切れ・間近の回収を上に表示。
    const ta = a.rawOrder?.rentalEndDate ? Date.parse(a.rawOrder.rentalEndDate) : NaN;
    const tb = b.rawOrder?.rentalEndDate ? Date.parse(b.rawOrder.rentalEndDate) : NaN;
    return (Number.isNaN(ta) ? Infinity : ta) - (Number.isNaN(tb) ? Infinity : tb);
  }), [rawOrders, products, myId]);

  const isVehicle = (p: any) => {
    if (!p) return false;
    const name = p.name || "";
    const cat = p.category || "";
    return cat.includes("車両") || cat.includes("トラック") || cat.includes("バン") || name.includes("エルフ") || name.includes("デュトロ") || name.includes("ハイエース") || name.includes("キャンター");
  };

  const completeDelivery = (id: string, signature?: string | null, photos?: any[], extra?: any) => {
    const ordersList0 = OrderBus.getAll<any>("orders");
    const target0 = ordersList0.find(o => o.id === id || o.firestoreId === id || o.orderNumber === id);
    if (!target0) return;
    const deliveryKey = target0?.firestoreId || target0?.id || id;
    if (completedDeliveryIdsRef.current.has(deliveryKey)) return;
    if (target0 && (target0.staffStatus === "配送完了" || target0.deliverySignature || target0.signature)) return;
    completedDeliveryIdsRef.current.add(deliveryKey);

    // 配送完了後はレンタル中（実際に貸出中）へ。顧客には「現在レンタル中」と表示される。
    const now = new Date();
    const deliveredDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    // レンタル開始日 = 実際に納品が完了した日。課金はこの日から開始する。
    const updates: any = { staffStatus: "配送完了", status: "レンタル中", rentalStartDate: deliveredDate, deliveryConfirmedAt: now.toISOString() };
    updates.invoiceBlocks = [];
    // 受領サインは Order スキーマ上の deliverySignature と、既存表示が参照する signature の両方に保存
    if (signature) {
      updates.signature = signature;
      updates.deliverySignature = signature;
    }
    if (photos && photos.length > 0) updates.deliveryPhotos = photos;
    // 保安車両: 貸出時の走行距離・車両状態の記録（満タンで貸出）
    if (extra && extra.vehicleCheckout) updates.vehicleCheckout = extra.vehicleCheckout;
    // 受領者不在で完了した場合: サイン無しの根拠（理由）を記録し admin が後追いできるようにする。
    if (extra && extra.deliveryUnsigned) {
      updates.deliveryUnsigned = true;
      updates.deliveryAbsentReason = extra.absentReason || "";
    }
    // 配送時に報告された破損・不足を注文へ記録（admin の現場報告にも別途 push 済み）。
    if (extra && extra.deliveryIssues && extra.deliveryIssues.length) {
      updates.deliveryIssues = extra.deliveryIssues;
    }
    // 配送担当者（誰が納品したか）を記録 — admin で確認できるようにする。
    if (extra && extra.deliveredBy) {
      updates.deliveredBy = extra.deliveredBy;
      updates.deliveredAt = now.toISOString();
    }

    // 在庫は受注確定で出庫済み。配送では減算しない。
    // 受注確定前モデルの旧注文（未出庫）救済として deductOrderStock を冪等に呼ぶ
    //（stockDeducted 済みなら何もしない）。出庫伝票（stockOut）も stockLedger 側で作成される。
    Object.assign(updates, deductOrderStock(target0));
    // 開始日が変わるため請求スナップショット(monthlyBreakdown/calculatedPrice)を破棄し納品日基準で再計算させる。
    // deductOrderStock は target0.items に stockDeductedQty を書き込むため、items の再構築は減算「後」に行う。
    // 減算前に作ると stockDeductedQty を落とし、返却時の入庫キャップが数量へフォールバックして過大入庫になる。
    if (target0 && Array.isArray(target0.items)) {
      updates.items = target0.items.map((it: any) =>
        it && it.type === "rent" ? { ...it, monthlyBreakdown: [], calculatedPrice: undefined } : it,
      );
    }
    OrderBus.patch("orders", deliveryKey, updates);
  };

  const completeRecovery =(id: string, signature?: string | null, photos?: any[], inspected?: any[], staffName?: string, extra?: any) => {
    // 現場回収の完了 = 注文の終了ではない。
    // 持ち帰った品は倉庫で「最終検品（再検品）」を行ってから確定・請求書発行する。
    // そのため在庫計上もここでは行わず、最終検品完了時（completeReturn）に行う。
    // inspected = 現場検品の結果（品目ごとの counted / report）。最終検品へ引き継ぎ、
    // 現場で見つかった不足・破損が最終検品で再入力されなくても弁償・在庫に反映されるようにする。
    const inspMap: Record<string, any> = {};
    (inspected || []).forEach((p: any) => { if (p) inspMap[String(p.id || p.name || "")] = p; });
    const ordersList = OrderBus.getAll<any>("orders");
    const targetOrder = ordersList.find(o => o.id === id || o.firestoreId === id || o.orderNumber === id);
    if (!targetOrder) return;
    // 二度押しガード: 既に回収完了済みなら何もしない（再実行で statusBeforeRecovery が「検品待ち」に
    // 壊れ、undoRecovery が誤った状態へ戻すのを防ぐ）。
    if (targetOrder.staffStatus === "回収完了") return;
    const recoveryKey = targetOrder?.firestoreId || targetOrder?.id || id;

    const now = new Date();
    // 取消(undoRecovery)で正しく戻せるよう、回収前の status を控えておく（既存値があれば上書きしない）。
    const updates: any = { staffStatus: "回収完了", status: "検品待ち", statusBeforeRecovery: targetOrder.statusBeforeRecovery || targetOrder.status || "レンタル中", collectionConfirmedAt: now.toISOString() };
    if (signature) updates.collectionSignature = signature;
    if (photos && photos.length > 0) updates.collectionPhotos = photos;
    // 回収担当者（誰が回収したか）と、回収時の現場検品(1次検品)担当者を記録する。
    // 現場回収と現場検品は同一スタッフが行うため collectedBy = fieldInspectedBy。
    if (staffName) {
      updates.collectedBy = staffName;
      updates.fieldInspectedBy = staffName;
      updates.collectedAt = now.toISOString();
    }
    // 受領者不在でサイン無し完了した場合: 根拠（理由）を記録し admin が後追いできるようにする。
    if (extra && extra.collectionUnsigned) {
      updates.collectionUnsigned = true;
      updates.collectionAbsentReason = extra.absentReason || "";
    }
    OrderBus.patch("orders", recoveryKey, updates);

    // 倉庫の最終検品キューへ登録（stage: "recheck"）
    if (targetOrder) {
      const requestedReturn = targetOrder.requestedReturn || {};
      const hasRequestedReturn = Object.values(requestedReturn).some((v: any) => Number(v) > 0);
      const recoveryProducts = (targetOrder.items || [])
        .filter((i: any) => {
          if (!i || i.type !== "rent") return false;
          const remaining = Math.max(0, (Number(i.quantity) || 0) - (Number(i.returnedQuantity) || 0));
          return remaining > 0 && (!hasRequestedReturn || Number(requestedReturn[i.id] || 0) > 0);
        })
        .map((i: any, idx: number) => {
          const remaining = Math.max(0, (Number(i.quantity) || 0) - (Number(i.returnedQuantity) || 0));
          const requestedQty = Math.max(0, Number(requestedReturn[i.id] || 0));
          const expectedQty = hasRequestedReturn ? Math.min(requestedQty, remaining) : remaining;
          const master = products.find((p: any) => p && (p.id === i.id || p.name === i.name));
          const itemId = i.id || master?.id || "P-" + idx;
          // 現場検品結果を引き継ぐ: 現場の counted（実回収数）と report（破損等）を最終検品の初期値にする。
          const field = inspMap[String(itemId)] || inspMap[String(i.name)];
          const fieldCounted = field && field.counted != null ? Number(field.counted) : undefined;
          return {
            id: itemId,
            qr: master ? getProductQrCode(master) : getProductQrCode({ id: itemId } as any),
            qrPayload: master?.qrPayload,
            name: i.name,
            expected: expectedQty,
            // 現場で回収できた数（未指定なら expected）。最終検品で確認・調整する。
            counted: fieldCounted != null ? Math.min(fieldCounted, expectedQty) : expectedQty,
            report: Array.isArray(field?.report) ? field.report : [],
            icon: "package",
            image: i.image,
            category: i.category,
          };
        });
      const totalRemaining = (targetOrder.items || [])
        .filter((i: any) => i && i.type === "rent")
        .reduce((sum: number, i: any) => sum + Math.max(0, (Number(i.quantity) || 0) - (Number(i.returnedQuantity) || 0)), 0);
      const totalExpected = recoveryProducts.reduce((sum: number, p: any) => sum + (Number(p.expected) || 0), 0);
      const returningEverything = totalRemaining > 0 && totalExpected >= totalRemaining;
      // 同じ注文の既存伝票があれば先に削除（二重登録＝幽霊伝票の防止）
      try {
        OrderBus.getAll<any>("walkinReturns")
          .filter(w => w && (w.orderId === targetOrder.id || (targetOrder.orderNumber && w.orderNumber === targetOrder.orderNumber)))
          .forEach(w => OrderBus.remove("walkinReturns", w.id));
      } catch { /* ignore */ }
      OrderBus.push("walkinReturns", {
        id: "WIN-" + String(targetOrder.orderNumber || targetOrder.id).replace(/[^A-Za-z0-9]/g, "") + "-" + Math.floor(Math.random() * 900 + 100),
        orderId: targetOrder.id,
        orderNumber: targetOrder.orderNumber,
        firestoreId: targetOrder.firestoreId,
        company: targetOrder.companyName || "",
        contact: targetOrder.personName || "",
        rentalNo: targetOrder.orderNumber,
        time: now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) + " 持帰り",
        note: "現場回収分の倉庫最終検品",
        source: "field_recovery",
        stage: "recheck",
        fieldSignature: signature || null,
        // 現場で撮影した写真（dataURL のみ抽出）— 倉庫の最終検品画面で参照できる
        photos: (photos || [])
          .map((p: any) => (typeof p === "string" ? p : (p && p.dataUrl) || null))
          .filter((u: any) => typeof u === "string" && u.startsWith("data:")),
        requestedReturn,
        returningEverything,
        products: recoveryProducts,
      } as any);
    }
  };

  const recordVehicleShaken = (plate: string, updates: any) => {
    const vehs = OrderBus.getAll<any>("vehicles");
    const v = vehs.find(x => x.plate === plate);
    if (v) OrderBus.patch("vehicles", v.id || v.plate, updates);
  };

  const undoRecovery = (orderId: string) => {
    const ordersList = OrderBus.getAll<any>("orders");
    const target = ordersList.find(o => o.id === orderId || o.firestoreId === orderId || o.orderNumber === orderId);
    if (!target) return;
    const key = target.firestoreId || target.id || orderId;
    // 回収完了 → 回収予定 に戻す。最終検品キュー(recheck)も削除し、完了前の状態へ復元する。
    OrderBus.patch("orders", key, {
      staffStatus: "回収予定",
      status: target.statusBeforeRecovery || "レンタル中",
      collectionConfirmedAt: null,
      collectionSignature: null,
      collectionPhotos: null,
      collectedBy: null,
      fieldInspectedBy: null,
      collectionUnsigned: null,
      collectionAbsentReason: null,
    });
    try {
      OrderBus.getAll<any>("walkinReturns")
        .filter(w => w && w.stage === "recheck" && (w.orderId === target.id || (target.orderNumber && w.orderNumber === target.orderNumber)))
        .forEach(w => OrderBus.remove("walkinReturns", w.id));
    } catch { /* ignore */ }
  };

  const setVehicleStatus = (plate: string, status: string) => {
    const vehs = OrderBus.getAll<any>("vehicles");
    const v = vehs.find(x => x.plate === plate || x.id === plate);
    if (!v) return;
    OrderBus.patch("vehicles", v.id || v.plate, { status });
    // 整備中に変更したら admin の整備キューにも登録（重複「予定」は作らない）。
    if (status === "整備中") {
      const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const today = jst.toISOString().slice(0, 10);
      const exists = OrderBus.getAll<any>("maintenance").some(
        (m: any) => m && (m.plate === v.plate || m.name === (v.model || v.name)) && m.status === "予定",
      );
      if (!exists) {
        OrderBus.push("maintenance", {
          id: "MNT-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 5),
          name: v.model || v.name || v.plate,
          plate: v.plate,
          cat: v.category || "車両",
          status: "予定",
          last: today,
          note: "現場で整備中に変更(STAFFアプリ)",
        } as any);
      }
    }
  };

  const recordStocktakeSession = (session: Record<string, any>) => {
    OrderBus.push("stocktake", session as any);
  };

  const findProductByName = (name: string) => {
    return products.find(p => p && p.name === name);
  };

  const adjustStock = (firestoreId: string, delta: number) => {
    const prods = OrderBus.getAll<any>("products");
    const p = prods.find(x => x && (x.id === firestoreId || x.firestoreId === firestoreId));
    // 0 未満にしない（手動出庫/取消で在庫数を上回る減算をしても負値にしない。stockLedger.adjustProductStock と同方針）。
    if (p) OrderBus.patch("products", p.id, { stock: Math.max(0, (p.stock || 0) + delta) });
    else console.warn(`[adjustStock] 商品が見つからず在庫調整がスキップされました: id=${firestoreId}, delta=${delta}`);
  };

  const setStock = (firestoreId: string, value: number) => {
    const prods = OrderBus.getAll<any>("products");
    const p = prods.find(x => x && (x.id === firestoreId || x.firestoreId === firestoreId));
    if (p) OrderBus.patch("products", p.id, { stock: value });
  };

  const recordMaintenance = (id: string, updates: any) => {
    OrderBus.patch("maintenance", id, updates);
  };

  const addStockMove = (type: string, details?: { item: string; qty: number; ref?: string; icon?: string }, operator?: string) => {
    const { item, qty, ref, icon } = details || ({} as { item?: string; qty?: number; ref?: string; icon?: string });
    if (!item) return; // 品目未指定（QR未スキャン等の不正呼び出し）でのクラッシュ／空レコード生成を防ぐ
    const isIn = type === "入庫";
    const now = new Date();
    // 実際の日時を記録する（以前は日付が固定値になっていた）。形式: YYYY/MM/DD HH:MM。
    const date = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")} ${now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`;
    // 衝突しにくいID。約999通り(IN/OUT-9000..9998)では入出庫が数百件で重複し、サーバ upsert で
    // 同一IDの古い在庫履歴を上書き(消失)するため、タイムスタンプ+乱数で採番する。
    const id = `${isIn ? "IN" : "OUT"}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    // 実際にログインしているスタッフ名を記録（未指定時のみモックにフォールバック）。
    const staffName = operator || STAFF.souko.name;
    // 区分は発生元（ref）から推定: 配送→レンタル(出庫) / 回収・返却→回収戻し(入庫) / それ以外→手動。
    const r = ref || "";
    let category = "手動" + type;
    if (!isIn && /配送|レンタル/.test(r)) category = "レンタル";
    else if (!isIn && /販売/.test(r)) category = "販売";
    else if (isIn && /回収|返却/.test(r)) category = "回収戻し";
    const doc = { id, item, qty, date, type: category, staff: staffName, seq: now.getTime(), icon: icon || "package" };
    if (isIn) {
      (doc as any).src = ref || "手動入庫";
      OrderBus.push("stockIn", doc);
    } else {
      (doc as any).dst = ref || "手動出庫";
      OrderBus.push("stockOut", doc);
    }
  };

  const pushFieldReports = (reports: any[]) => {
    reports.forEach(r => OrderBus.push("fieldReports", { ...r, status: "未対応" }));
  };

  const stockMoves = useMemo(() => [
    ...stockInRows.map(r => ({ id: r.id, type: "入庫", item: r.item, qty: r.qty, date: r.date || "", time: (r.date || "").slice(-5), ref: r.src || r.type || "", icon: r.icon || "boxIn", seq: r.seq || 0 })),
    ...stockOutRows.map(r => ({ id: r.id, type: "出庫", item: r.item, qty: r.qty, date: r.date || "", time: (r.date || "").slice(-5), ref: r.dst || r.type || "", icon: r.icon || "boxOut", seq: r.seq || 0 })),
  ].sort((a, b) => (b.seq || 0) - (a.seq || 0)), [stockInRows, stockOutRows]);

  return (
    <MobileLiveContext.Provider value={{
      connected, liveDeliveries, liveRecoveries, completeDelivery, completeRecovery,
      vehicles, recordVehicleShaken, products, findProductByName, adjustStock, setStock,
      maint, walkin, returnInspections, stockMoves, recordMaintenance, addStockMove, pushFieldReports,
      undoRecovery, setVehicleStatus, recordStocktakeSession, staffMessages
    }}>
      {children}
    </MobileLiveContext.Provider>
  );
}

export function useMobileLive() {
  const context = useContext(MobileLiveContext);
  if (!context) {
    throw new Error("useMobileLive must be used within a MobileLiveProvider");
  }
  return context;
}

// Global hook for recovery / inventory flow damage reporting
export function pushFieldReportsLocal({ source, ref, reporter, customer, site, products }: any) {
  const withIssues = (products || []).filter((p: any) => p.report && p.report.length > 0);
  const ids: string[] = [];
  withIssues.forEach((p: any) => {
    const entries = p.report.map((e: any) => {
      // スタッフが撮影した実画像（dataURL）を抽出して admin の現場報告でも表示できるようにする。
      const photoUrls = (e.photos || [])
        .map((ph: any) => (typeof ph === "string" ? ph : (ph && ph.dataUrl) || null))
        .filter((u: any) => typeof u === "string" && u.startsWith("data:"));
      return {
        reason: e.reason,
        qty: e.qty,
        photos: (e.photos || []).length, // 互換: 件数
        photoUrls, // 実画像
        note: e.note || "",
      };
    });
    // 複数商品を同時に報告すると Date.now() が同一ミリ秒・乱数も 0-9 のみで衝突し得る
    //（衝突すると 2件目が同期されず admin に届かない／React key 重複）。十分な乱数桁で一意化する。
    const id = "FR-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    ids.push(id);
    OrderBus.push("fieldReports", {
      id,
      source, ref, reporter, customer, site,
      asset: p.name, qr: p.qr || "", entries,
      status: "未対応", date: new Date().toLocaleString("ja-JP"),
    });
  });
  return Promise.resolve(ids);
}
