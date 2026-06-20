export type NotificationTone = "danger" | "warning" | "info" | "success";

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  tone: NotificationTone;
  href?: string;
  /** スタッフアプリ内のタブ遷移先トークン（タップで該当タブへ移動）。 */
  target?: string;
  /** 関連する注文ID（あればタップで該当タスクを開く補助に使う）。 */
  relatedOrderId?: string;
}

const CLOSED = ["返却済", "返却済み", "完了", "キャンセル"];

function dateOnly(raw: any): Date | null {
  if (!raw) return null;
  const text = String(raw).split("•")[0].trim().replace(/\//g, "-");
  // YYYY-MM-DD は new Date() だと UTC 0時として解釈され、ローカル(JST)の today と比較すると
  // 期限超過/返却期限の判定が日付境界で1日ずれる。明示的にローカル0時として構築する。
  const m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(text);
  return isNaN(d.getTime()) ? null : d;
}

function hasRentItems(order: any) {
  return (order?.items || []).some((item: any) => item?.type === "rent");
}

export function buildAdminNotifications({
  orders = [],
  fieldReports = [],
  products = [],
  vehicles = [],
  maintenance = [],
}: {
  orders?: any[];
  fieldReports?: any[];
  products?: any[];
  vehicles?: any[];
  maintenance?: any[];
}): AppNotification[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const list: AppNotification[] = [];

  const newOrders = orders.filter((o: any) => String(o.status || "") === "処理中");
  if (newOrders.length) {
    list.push({ id: "admin-new-orders", title: `新規注文 ${newOrders.length}件`, body: "受注確認と配送手配が必要です", tone: "info" });
  }

  const inspection = orders.filter((o: any) => String(o.status || "") === "検品待ち");
  if (inspection.length) {
    list.push({ id: "admin-inspection", title: `検品待ち ${inspection.length}件`, body: "返却・持込の最終確認が必要です", tone: "warning" });
  }

  const overdue = orders.filter((o: any) => {
    if (CLOSED.includes(String(o.status || "")) || !hasRentItems(o)) return false;
    const end = dateOnly(o.rentalEndDate);
    return !!end && end < today;
  });
  if (overdue.length) {
    list.push({ id: "admin-overdue", title: `返却期限超過 ${overdue.length}件`, body: "回収予定を確認してください", tone: "danger" });
  }

  const reports = fieldReports.filter((r: any) => !["対応済", "完了"].includes(String(r.status || "")));
  if (reports.length) {
    list.push({ id: "admin-field-reports", title: `現場報告 未対応 ${reports.length}件`, body: "破損・不足報告の処理が必要です", tone: "danger" });
  }

  // 在庫0（最も緊急）も低在庫通知に含める（以前は > 0 ガードで除外されていた）。
  const lowStock = products.filter((p: any) => Number(p.stock || 0) <= Number(p.minStock || 3));
  if (lowStock.length) {
    list.push({ id: "admin-low-stock", title: `低在庫 ${lowStock.length}品目`, body: "入庫・補充計画を確認してください", tone: "warning" });
  }

  const vehicleAlerts = vehicles.filter((v: any) => Number(v.inspectionDaysRemaining ?? 999) <= 30 || String(v.status || "") === "整備中" || (v.alerts || []).length > 0);
  const maintAlerts = maintenance.filter((m: any) => Number(m.days ?? 999) <= 7 || ["期限切れ", "超過"].includes(String(m.status || "")));
  if (vehicleAlerts.length + maintAlerts.length) {
    list.push({ id: "admin-maintenance", title: `車両・点検 要対応 ${vehicleAlerts.length + maintAlerts.length}件`, body: "車検・整備・メンテナンスを確認してください", tone: "warning" });
  }

  return list;
}

export function buildStaffNotifications({
  deliveries = [],
  recoveries = [],
  walkin = [],
  vehicles = [],
  maintenance = [],
  messages = [],
}: {
  deliveries?: any[];
  recoveries?: any[];
  walkin?: any[];
  vehicles?: any[];
  maintenance?: any[];
  /** admin から送られた個別連絡（staffMessages コレクション）。 */
  messages?: any[];
}): AppNotification[] {
  const list: AppNotification[] = [];

  // admin からの直接連絡を最優先で表示（タップで関連注文 or 指定タブへ）。
  for (const m of messages) {
    if (!m) continue;
    list.push({
      id: "staff-msg-" + String(m.id),
      title: m.title || "管理者からの連絡",
      body: m.body || "",
      tone: (m.tone as NotificationTone) || "info",
      target: m.target && m.target !== "all" && m.target !== "staff" ? String(m.target) : (m.relatedOrderId ? "delivery_recovery" : undefined),
      relatedOrderId: m.relatedOrderId ? String(m.relatedOrderId) : undefined,
    });
  }

  if (deliveries.length) {
    list.push({ id: "staff-deliveries", title: `配送予定 ${deliveries.length}件`, body: "本日対応する納品タスクがあります", tone: "info", target: "delivery_recovery" });
  }
  if (recoveries.length) {
    list.push({ id: "staff-recoveries", title: `回収予定 ${recoveries.length}件`, body: "返却・回収タスクを確認してください", tone: "warning", target: "delivery_recovery" });
  }
  if (walkin.length) {
    list.push({ id: "staff-walkin", title: `持込返却 ${walkin.length}件`, body: "一次受付または最終検品が必要です", tone: "warning", target: "walkin" });
  }

  const vehicleAlerts = vehicles.filter((v: any) => Number(v.days ?? v.inspectionDaysRemaining ?? 999) <= 30);
  const maintAlerts = maintenance.filter((m: any) => Number(m.days ?? 999) <= 7);
  if (vehicleAlerts.length + maintAlerts.length) {
    list.push({ id: "staff-inspection", title: `点検要対応 ${vehicleAlerts.length + maintAlerts.length}件`, body: "車両・保守点検を確認してください", tone: "danger", target: "inspect" });
  }

  return list;
}

export function buildCustomerNotifications({
  orders = [],
  inspections = [],
}: {
  orders?: any[];
  inspections?: any[];
}): AppNotification[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const list: AppNotification[] = [];

  const processing = orders.filter((o: any) => ["処理中", "確認済み", "準備中"].includes(String(o.status || "")));
  if (processing.length) {
    list.push({ id: "customer-processing", title: `注文処理中 ${processing.length}件`, body: "注文内容を確認・準備しています", tone: "info", href: "/orders" });
  }

  const delivery = orders.filter((o: any) => ["配送中", "配送済み", "レンタル中"].includes(String(o.status || "")));
  if (delivery.length) {
    list.push({ id: "customer-active", title: `利用中・配送中 ${delivery.length}件`, body: "納品状況とレンタル期間を確認できます", tone: "success", href: "/orders" });
  }

  const returnReady = orders.filter((o: any) => {
    if (CLOSED.includes(String(o.status || "")) || !hasRentItems(o)) return false;
    const end = dateOnly(o.rentalEndDate);
    if (!end) return false;
    const diff = Math.ceil((end.getTime() - today.getTime()) / 86400000);
    // 「返却期限が近い」は当日〜3日後のみ。期限超過(diff<0)はこの見出しに含めない（誤表示防止）。
    return diff >= 0 && diff <= 3;
  });
  if (returnReady.length) {
    list.push({ id: "customer-return-due", title: `返却期限が近い注文 ${returnReady.length}件`, body: "返却・延長手続きを確認してください", tone: "warning", href: "/return" });
  }

  const inspectionForOrders = inspections.filter((r: any) => orders.some((o: any) => o.id === r.orderId || o.orderNumber === r.orderNumber));
  if (inspectionForOrders.length) {
    list.push({ id: "customer-inspection", title: `検品結果 ${inspectionForOrders.length}件`, body: "返却後の検品内容を確認できます", tone: "info", href: "/orders" });
  }

  return list;
}
