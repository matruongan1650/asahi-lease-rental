import React, { useMemo, useState, useEffect } from "react";
import { Badge, Btn, triggerToast } from "../../components/AdminUI";
import AdminOrderDrawer from "../../components/AdminOrderDrawer";
import AdminRentalRegisterModal from "../../components/AdminRentalRegisterModal";
import { useAdminOrders } from "../../context/AdminDataContext";
import { useServerQuery } from "../../lib/ordersQuery";
import { byOrderDateDesc } from "../../utils/orderSort";
import { formatStatusWithReturnRequest } from "../../utils/returnLabels";
import { settleReturnStock, deductOrderStock, stockFlagsForStatusChange } from "../../utils/stockLedger";
import { getOrGenerateInvoiceBlocks } from "../../utils/billing";
import { confirmDialog } from "../../components/AppDialog";
import OrderBus from "../../lib/orderBus";

type RentalQueue = "new" | "arranged" | "active" | "closed";

function orderKey(order: any) {
  return order?.firestoreId || order?.id || order?.orderNumber;
}

function normalizeText(value: any) {
  return String(value || "").toLowerCase();
}

function queueFor(status: string): RentalQueue {
  if (["処理中", "注文確認中", "未割当"].includes(status)) return "new";
  if (["確認済み", "配送予定", "準備中", "配送中", "割当済み"].includes(status)) return "arranged";
  if (["進行中", "レンタル中", "配送済み"].includes(status)) return "active";
  return "closed";
}

function StatCard({ icon, label, value, tone = "blue" }: { icon: string; label: string; value: string | number; tone?: "blue" | "emerald" | "amber" | "rose" }) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
  }[tone];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-black text-slate-500">{label}</div>
          <div className="mt-1 text-[26px] font-black text-slate-900 tracking-tight">{value}</div>
        </div>
        <span className={`material-symbols-outlined flex h-10 w-10 items-center justify-center rounded-lg text-[20px] ${toneClass}`}>
          {icon}
        </span>
      </div>
    </div>
  );
}

const QUEUE_STATUS: Record<RentalQueue, string[]> = {
  new: ["処理中", "注文確認中", "未割当"],
  arranged: ["確認済み", "配送予定", "準備中", "配送中", "割当済み"],
  active: ["進行中", "レンタル中", "配送済み"],
  closed: ["返却済", "返却済み", "完了", "キャンセル", "検品待ち", "一部返却", "回収予定", "回収中"],
};

function toRentalRow(o: any) {
  return {
    _raw: o,
    id: o.orderNumber || o.id,
    firestoreId: o.firestoreId || o.id,
    date: o.date || "",
    customer: o.companyName || `${o.personLastName || ""} ${o.personFirstName || ""}`.trim() || o.personName || "ゲスト",
    person: o.personName || `${o.personLastName || ""} ${o.personFirstName || ""}`.trim() || "—",
    site: o.siteName || "—",
    start: (o.rentalStartDate || "").replace(/-/g, "/") || "—",
    end: (o.rentalEndDate || "").replace(/-/g, "/") || "—",
    items: (o.items || []).length,
    amount: o.total || 0,
    status: o.status,
    returnRequestType: o.returnRequestType,
  };
}

export default function AdminRental() {
  const liveOrders = useAdminOrders(); // KPI(レンタル売上) + patchOrder 用
  const [queue, setQueue] = useState<RentalQueue>("new");
  const [searchInput, setSearchInput] = useState(""); // 入力用（即時）
  const [searchQuery, setSearchQuery] = useState(""); // クエリ用（デバウンス後。サーバー問い合わせのキー）
  // 1文字ごとにサーバーへ問い合わせないよう 280ms デバウンスする。
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput), 280);
    return () => clearTimeout(t);
  }, [searchInput]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [docDrawerOpen, setDocDrawerOpen] = useState(false);

  // 数万件でも 1 ページのみ取得（サーバー側でフィルタ＋ページング）。
  const { rows, total, statusCounts, hasMore, loading, loadMore, refresh } = useServerQuery(
    "orders",
    { hasType: "rent", statusIn: QUEUE_STATUS[queue], q: searchQuery, counts: true, pageSize: 50 },
    queue,
  );
  // サーバー順(作成日時降順)に加えクライアントでも安定ソート（loadMore の追記や rev 由来の乱れを吸収）。
  const displayRows = useMemo(() => [...rows].sort(byOrderDateDesc).map(toRentalRow), [rows]);

  // キュー件数バッジ = サーバーの status 別件数をキューへ集約。
  const queueCounts = useMemo(() => {
    const acc: Record<RentalQueue, number> = { new: 0, arranged: 0, active: 0, closed: 0 };
    for (const [st, c] of Object.entries(statusCounts)) acc[queueFor(String(st))] += Number(c) || 0;
    return acc;
  }, [statusCounts]);

  const handleAccept = async (row: any) => {
    const id = orderKey(row._raw);
    if (!id) { triggerToast("注文データが見つかりません", "err"); return; }
    // 在庫減算・配送手配を伴う破壊的操作のため確認する（誤クリック防止。却下と対称に）。
    const ok = await confirmDialog(`${row.id} を受注確定します。在庫を出庫し配送手配へ送ります。よろしいですか？`, { okText: "受注確定する", cancelText: "キャンセル" });
    if (!ok) return;
    // 受注確定 = 現物在庫を減算（出庫）。最新の注文を解決してから台帳を更新する。
    const raw = (OrderBus.getAll<any>("orders").find((o: any) => o.id === id || o.firestoreId === id || o.orderNumber === id)) || row._raw;
    const flags = deductOrderStock(raw);
    // 受注確定でのみ staffStatus:"配送予定" を付与 → スタッフ APK の配送タスクに配信される。
    liveOrders.patchOrder(id, { status: "確認済み", staffStatus: "配送予定", ...flags });
    triggerToast(`${row.id} を受注確定し、在庫を出庫・配送手配へ送りました`, "ok");
    setTimeout(refresh, 300);
  };

  // 受注待ちの注文を却下する。staffStatus は付けないためスタッフ APK には配信されない。
  const handleReject = async (row: any) => {
    const id = orderKey(row._raw);
    if (!id) { triggerToast("注文データが見つかりません", "err"); return; }
    const ok = await confirmDialog(`${row.id} を却下しますか？\nこの注文は配送手配されず、キャンセル扱いになります。`, {
      okText: "却下する",
      cancelText: "戻る",
      danger: true,
    });
    if (!ok) return;
    // ライブの注文で判定（stale 行対策）。既に出庫済みの注文を却下する場合は在庫を戻す
    //（受注確定で減算済みのまま却下すると在庫が永久に目減りする）。未出庫なら在庫は動かさない。
    const raw = OrderBus.getAll<any>("orders").find((o: any) => o.id === id || o.firestoreId === id) || row._raw;
    const flags = raw?.stockDeducted ? settleReturnStock(raw, "キャンセル") : {};
    liveOrders.patchOrder(id, { status: "キャンセル", staffStatus: "", ...flags });
    triggerToast(`${row.id} を却下しました`, "ok");
    setTimeout(refresh, 300);
  };

  const handleMoveToActive = (row: any) => {
    const id = orderKey(row._raw);
    if (!id) { triggerToast("注文データが見つかりません", "err"); return; }
    // staffStatus:"完了" は倉庫の貸出中カウントから除外されてしまう（在庫が水増し）。
    // 配送完了として稼働中にし、現物は貸出中のまま正しくカウントさせる。
    const raw = OrderBus.getAll<any>("orders").find((o: any) => o.id === id || o.firestoreId === id) || row._raw;
    const patch: any = { status: "レンタル中", staffStatus: "配送完了", deliveryConfirmedAt: new Date().toISOString() };
    // 確認済みで登録した契約は請求ブロック未生成(total=0)。稼働開始＝納品確定なので、ここで
    // 実際の請求ブロックと合計を確定する（テーブルの金額と売上KPIが 0 のままになるのを防ぐ）。
    if (!Number(raw?.total) && Array.isArray(raw?.items) && raw.items.length > 0) {
      const blocks = getOrGenerateInvoiceBlocks({ ...raw, ...patch });
      const t = (blocks || []).reduce(
        (a: any, b: any) => ({ subtotal: a.subtotal + (Number(b.subtotal) || 0), tax: a.tax + (Number(b.tax) || 0), total: a.total + (Number(b.total) || 0) }),
        { subtotal: 0, tax: 0, total: 0 },
      );
      patch.invoiceBlocks = blocks; patch.subtotal = t.subtotal; patch.tax = t.tax; patch.total = t.total;
    }
    liveOrders.patchOrder(id, patch);
    triggerToast(`${row.id} をレンタル中に更新しました`, "ok");
    setTimeout(refresh, 300);
  };

  const openDetail = (row: any) => setSelectedOrder(row._raw);

  // 既存/進行中のレンタル契約を「完全な注文」として登録して管理対象にする。
  // draft は AdminRentalRegisterModal が顧客マスタ・商品マスタと連携して作る完全なドラフト。
  const handleRentalContractCreate = (draft: any) => {
    const items = Array.isArray(draft.items) ? draft.items : [];
    if (items.length === 0) { triggerToast("品目を1件以上追加してください", "warn"); return; }

    const now = new Date();
    // 登録ステータスに応じて在庫の扱いと工程フラグを決める。
    const st = String(draft.status || "確認済み");
    const isClosedReg = ["返却済", "返却済み", "完了"].includes(st); // 過去契約の記録（在庫を動かさない）
    const isCollected = st === "検品待ち";                          // 回収済み・倉庫検品待ち（在庫はまだ出庫中）
    const delivered = st !== "確認済み";                            // 確認済み のみ未納品
    // 表示用の注文番号も一意にする（4桁ランダムは登録が増えると衝突し、resolveLiveOrder の
    // orderNumber フォールバックが別注文を誤解決して在庫フラグ・明細を破壊しうる）。既存と重複しない値を採る。
    const existingNums = new Set(OrderBus.getAll<any>("orders").map((o: any) => String(o.orderNumber || "")));
    let orderNumber = "";
    do { orderNumber = `RN-${now.getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`; } while (existingNums.has(orderNumber));
    // 安定・一意な注文ID。これが無いと getOrGenerateInvoiceBlocks がブロックIDを
    // `block-undefined-YYYY-MM` で発番し、同月に登録した別注文と衝突して一括消込が混線する。
    const orderId = `RN-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    // 在庫を出庫（フラグ未設定のオブジェクトに対して減算 → 確実に1回だけ引く）。
    const seed: any = {
      id: orderId,
      orderNumber,
      companyName: draft.companyName,
      personName: draft.personName,
      personLastName: draft.personLastName,
      personFirstName: draft.personFirstName,
      userId: draft.userId,
      userEmail: draft.userEmail,
      userPhone: draft.userPhone,
      siteName: draft.siteName,
      constructionNumber: draft.constructionNumber,
      deliveryLocation: draft.deliveryLocation,
      deliveryDate: draft.deliveryDate,
      items,
      notes: draft.notes,
      rentalStartDate: draft.rentalStartDate || "",
      rentalEndDate: draft.rentalEndDate || "",
      status: draft.status,
      orderType: "rent",
      date: now.toLocaleDateString("ja-JP") + " • " + now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
      createdAt: now.toISOString(),
    };
    // 在庫: 進行中(出庫中)の契約は減算する。返却済/完了 は「過去契約の記録」のため在庫を動かさず、
    // 「出庫済み＋入庫済み(=精算済み)」フラグのみ立てて以後の在庫操作（自動入庫等）を起こさない。
    let flags: any;
    let lifecycle: any;
    if (isClosedReg) {
      flags = { stockDeducted: true, stockDeductedAt: now.toISOString(), stockRestored: true };
      lifecycle = { staffStatus: "検品完了", deliveryConfirmedAt: now.toISOString(), actualReturnDate: draft.rentalEndDate || "" };
    } else {
      flags = deductOrderStock(seed); // 出庫（現物在庫を減算 + 出庫伝票）
      lifecycle = delivered
        ? {
            staffStatus: isCollected ? "回収完了" : "配送完了",
            deliveryConfirmedAt: now.toISOString(),
            ...(isCollected ? { collectionConfirmedAt: now.toISOString() } : {}),
          }
        : { staffStatus: "配送予定" };
    }
    const finalOrder: any = { ...seed, ...flags, ...lifecycle };
    // 確認済み（未納品）は通常フローと同じく「まだ請求しない」。請求ブロックは納品確定時に
    // 実際の納品日基準で生成される（completeDelivery）。ここで全期間を先に請求すると未納品なのに
    // 課金され、AR一覧に過大計上される。納品済み／履歴(返却済・完了)のみ請求ブロックを確定する。
    const shouldBill = delivered || isClosedReg;
    let blocks = shouldBill ? getOrGenerateInvoiceBlocks(finalOrder) : [];
    // 過去契約の移行登録（返却済/完了）は「精算済みの履歴」として全ブロックを入金済で確定する
    //（ユーザー裁定）。動的生成の既定が pending になったため(I2)、ここで明示的に付与する。
    if (isClosedReg && blocks.length > 0) {
      const paidStamp = now.toISOString();
      blocks = blocks.map((b: any) => ({ ...b, status: "paid", paidAt: paidStamp }));
    }
    const t = (blocks || []).reduce(
      (a: any, b: any) => ({ subtotal: a.subtotal + (Number(b.subtotal) || 0), tax: a.tax + (Number(b.tax) || 0), total: a.total + (Number(b.total) || 0) }),
      { subtotal: 0, tax: 0, total: 0 },
    );
    OrderBus.push("orders", { ...finalOrder, invoiceBlocks: blocks, subtotal: t.subtotal, tax: t.tax, total: t.total });
    // 「検品待ち（回収済み）」で登録した場合、倉庫の最終検品キューは walkinReturns チケット駆動のため
    // チケットも発行する。無いと在庫を出庫したまま注文が検品待ちで永久に詰む（R20 / R12 と同じ詰み）。
    if (isCollected) {
      const rentItems = items.filter((i: any) => i && i.type === "rent");
      OrderBus.push("walkinReturns", {
        id: "WIN-ADM-" + String(orderNumber).replace(/[^A-Za-z0-9]/g, "") + "-" + now.getTime().toString(36),
        orderId: orderId,
        orderNumber,
        company: draft.companyName || "",
        contact: draft.personName || "",
        rentalNo: orderNumber,
        time: now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) + " 登録",
        note: "既存契約の登録（回収済み） — 倉庫最終検品をお願いします。",
        source: "admin_recovery",
        receptionReturnDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
        stage: "recheck",
        fieldSignature: null,
        collectionUnsigned: true,
        collectionAbsentReason: "既存契約の登録（回収済み・受領サイン記録なし）",
        requestedReturn: {},
        returningEverything: true,
        products: rentItems.map((i: any, idx: number) => ({
          id: i.id || "P-" + idx,
          qr: "AS-" + (i.id || idx),
          name: i.name,
          expected: Number(i.quantity) || 0,
          counted: Number(i.quantity) || 0,
          report: [],
          icon: "package",
          image: i.image,
          category: i.category,
        })),
      } as any);
    }
    triggerToast(`レンタル契約 ${orderNumber} を「${st}」で登録しました`, "ok");
    setDocDrawerOpen(false);
    setTimeout(refresh, 300);
  };

  const queues = [
    { id: "new" as const, label: "受注待ち", icon: "inbox", count: queueCounts.new },
    { id: "arranged" as const, label: "手配中", icon: "local_shipping", count: queueCounts.arranged },
    { id: "active" as const, label: "稼働中", icon: "autorenew", count: queueCounts.active },
    { id: "closed" as const, label: "完了・取消", icon: "task_alt", count: queueCounts.closed },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div>
          <h2 className="text-[24px] font-black text-slate-900 tracking-tight">受注・レンタル</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              実注文データ連携
            </span>
            <span>{total.toLocaleString()} 件{loading ? "（読込中…）" : ""}</span>
          </div>
        </div>
        <Btn icon="add" variant="primary" onClick={() => setDocDrawerOpen(true)}>レンタル契約を登録</Btn>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard icon="inbox" label="受注待ち" value={`${queueCounts.new}件`} tone="amber" />
        <StatCard icon="local_shipping" label="手配中" value={`${queueCounts.arranged}件`} tone="blue" />
        <StatCard icon="autorenew" label="稼働中" value={`${queueCounts.active}件`} tone="emerald" />
        <StatCard icon="payments" label="レンタル売上" value={`¥${(liveOrders.kpis.rentalSales || 0).toLocaleString()}`} tone="blue" />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-[0_6px_24px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50/70 p-3">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            <div className="inline-flex w-full rounded-lg border border-slate-200 bg-white p-1 xl:w-auto overflow-x-auto">
              {queues.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setQueue(item.id)}
                  className={`flex h-[38px] flex-1 items-center justify-center gap-2 rounded-md px-4 text-sm font-black transition-colors xl:flex-none ${
                    queue === item.id ? "bg-[#1a1c9a] text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className="material-symbols-outlined text-[17px]">{item.icon}</span>
                  {item.label}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${queue === item.id ? "bg-white/18 text-white" : "bg-slate-100 text-slate-500"}`}>
                    {item.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="relative min-w-[280px]">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[19px]">search</span>
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="注文番号・顧客・現場を検索"
                className="h-[38px] w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm font-semibold outline-none focus:border-[#1a1c9a]/50 focus:ring-2 focus:ring-[#1a1c9a]/10"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-white">
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">注文</th>
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">顧客 / 現場</th>
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">担当者</th>
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">レンタル期間</th>
                <th className="px-4 py-3 text-right text-[11px] font-black text-slate-500">品目</th>
                <th className="px-4 py-3 text-right text-[11px] font-black text-slate-500">金額</th>
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">状態</th>
                <th className="px-4 py-3 text-right text-[11px] font-black text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayRows.map((row: any) => (
                <tr key={row.firestoreId || row.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <div className="font-mono text-sm font-black text-blue-700">{row.id}</div>
                    <div className="mt-1 font-mono text-[10px] font-bold text-slate-400">{row.date || "—"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-[260px] truncate text-sm font-black text-slate-900">{row.customer || "—"}</div>
                    <div className="mt-1 max-w-[260px] truncate text-xs font-bold text-slate-500">{row.site || "現場未設定"}</div>
                  </td>
                  <td className="px-4 py-3 max-w-[160px] truncate text-sm font-bold text-slate-700">{row.person || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-slate-600">{row.start} - {row.end}</td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-black text-slate-800">{row.items}</td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-black text-slate-900">¥{(row.amount || 0).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <Badge tone={queue === "new" ? "warning" : queue === "active" ? "ok" : "default"}>
                      {formatStatusWithReturnRequest(row.status, row.returnRequestType)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center justify-end gap-2">
                      {queue === "new" && (
                        <>
                          <Btn size="sm" variant="primary" icon="send" onClick={() => handleAccept(row)}>
                            受注確定
                          </Btn>
                          <button
                            onClick={() => handleReject(row)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-black text-rose-600 hover:bg-rose-100"
                          >
                            <span className="material-symbols-outlined text-[16px]">block</span>
                            却下
                          </button>
                        </>
                      )}
                      {queue === "arranged" && (
                        <Btn size="sm" variant="secondary" icon="play_arrow" onClick={() => handleMoveToActive(row)}>
                          稼働開始
                        </Btn>
                      )}
                      <button onClick={() => openDetail(row)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" title="詳細">
                        <span className="material-symbols-outlined text-[17px]">edit_note</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {total === 0 && !loading && (
            <div className="py-14 text-center">
              <span className="material-symbols-outlined text-[42px] text-slate-300">inbox</span>
              <div className="mt-2 text-sm font-black text-slate-700">該当するレンタル注文がありません</div>
            </div>
          )}
          {hasMore && (
            <div className="py-4 text-center border-t border-slate-100">
              <button
                onClick={loadMore}
                disabled={loading}
                className="px-5 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-sm font-black text-blue-700 active:scale-95 transition disabled:opacity-50"
              >
                さらに表示（残り {(total - displayRows.length).toLocaleString()} 件）
              </button>
            </div>
          )}
        </div>
      </div>

      <AdminOrderDrawer
        open={!!selectedOrder}
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onUpdateStatus={(id, status, staffStatus) => {
          // ドロワーの「手配する」(処理中→確認済み) も受注確定 → 出庫。返却系クローズは settleReturnStock で入庫。
          const raw = (OrderBus.getAll<any>("orders").find((o: any) => o.id === id || o.firestoreId === id)) || selectedOrder;
          const flags = stockFlagsForStatusChange(raw, status); // 稼働系への直接変更も未出庫なら出庫（二重計上防止, K7）
          liveOrders.patchOrder(id, { status, ...(staffStatus ? { staffStatus } : {}), ...flags });
          triggerToast("ステータスを更新しました", "ok");
          setTimeout(refresh, 300);
        }}
        onUpdateOrder={(id, updates) => {
          liveOrders.patchOrder(id, updates);
          setSelectedOrder((prev: any) => prev && (prev.firestoreId === id || prev.id === id) ? { ...prev, ...updates } : prev);
          setTimeout(refresh, 300);
        }}
      />

      <AdminRentalRegisterModal
        open={docDrawerOpen}
        onClose={() => setDocDrawerOpen(false)}
        onCreate={handleRentalContractCreate}
      />
    </div>
  );
}
