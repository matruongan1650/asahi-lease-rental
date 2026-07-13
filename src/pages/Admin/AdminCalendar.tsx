import React, { useState, useEffect, useMemo } from "react";
import { confirmDialog } from "../../components/AppDialog";
import OrderBus from "../../lib/orderBus";
import { useOrderBusStore } from "../../lib/useOrderBus";
import {
  Panel,
  Btn,
  Toolbar,
  Modal,
  Field,
  TextInput,
  SelectInput,
  Row,
  triggerToast
} from "../../components/AdminUI";
import { useAdminData } from "../../context/AdminDataContext";
import { CAL_TYPES } from "../../data/adminMockData";
import AdminOrderDrawer from "../../components/AdminOrderDrawer";
import { formatStatusWithReturnRequest } from "../../utils/returnLabels";
import { deductOrderStock, settleReturnStock, stockFlagsForStatusChange } from "../../utils/stockLedger";
import { closeOrderBillingPatch } from "../../utils/billing";

type CalEvent = {
  t: string;
  x: string;
  id?: string;
  isCustom?: boolean;
  dateStr?: string;
  fullDate?: Date;
  order?: any;
  orderId?: string;
  customer?: string;
  site?: string;
  status?: string;
  amount?: number;
  description?: string;
};

function normalizeDateParts(value: any): { y: number; m: number; d: number } | null {
  if (!value) return null;
  const match = String(value).match(/(\d{4})[^\d](\d{1,2})[^\d](\d{1,2})/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

function dateKey(value: any): string {
  const parts = normalizeDateParts(value);
  if (!parts) return "";
  return `${parts.y}-${String(parts.m).padStart(2, "0")}-${String(parts.d).padStart(2, "0")}`;
}

export default function AdminCalendar() {
  const [filter, setFilter] = useState<string[]>(Object.keys(CAL_TYPES));
  const { raw: rawOrders, cols, patchOrder } = useAdminData();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  // Dynamic Date state
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  // Form states
  const [newEvKind, setNewEvKind] = useState("delivery");
  const [newEvTitle, setNewEvTitle] = useState("");
  const [newEvDate, setNewEvDate] = useState(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });

  // カレンダーのカスタム予定はサーバー同期する（以前は localStorage のみ＝他端末・APK に
  // 反映されずキャッシュ削除で消えていた）。OrderBus の "calendarEvents" ストアを正本とする。
  const [calEventRows] = useOrderBusStore<any>("calendarEvents");
  const customEvents = useMemo(() => {
    const map: Record<string, Array<{ id: string; t: string; x: string }>> = {};
    (calEventRows || []).forEach((ev: any) => {
      const date = ev?.date;
      if (!date) return;
      (map[date] ||= []).push({ id: String(ev.id), t: ev.t, x: ev.x });
    });
    return map;
  }, [calEventRows]);

  // 旧 localStorage の予定を一度だけサーバーへ移行（端末ごとに1回）。
  useEffect(() => {
    const MIG = "asahi.calendar_events_migrated_to_bus";
    if (localStorage.getItem(MIG)) return;
    try {
      const saved = localStorage.getItem("asahi.custom_calendar_events_v2");
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, Array<any>>;
        Object.entries(parsed).forEach(([date, evs]) => {
          (evs || []).forEach((ev: any) => {
            OrderBus.push("calendarEvents", { id: ev?.id, date, t: ev?.t, x: ev?.x });
          });
        });
      }
    } catch { /* ignore */ }
    try {
      localStorage.setItem(MIG, "1");
      localStorage.removeItem("asahi.custom_calendar_events_v2");
      localStorage.removeItem("asahi.custom_calendar_events");
    } catch { /* ignore */ }
  }, []);

  const toggle = (k: string) => {
    setFilter(f => f.includes(k) ? f.filter(x => x !== k) : [...f, k]);
  };

  const currentYearNum = currentMonth.getFullYear();
  const currentMonthNum = currentMonth.getMonth() + 1;

  // Check if date falls in current month and get day
  const dayOf = (s: any): number | null => {
    const parts = normalizeDateParts(s);
    if (parts && parts.y === currentYearNum && parts.m === currentMonthNum) {
      return parts.d;
    }
    return null;
  };

  const ev: Record<number, Array<CalEvent>> = {};
  const addEvent = (d: number | null, t: string, x: string, dateStr?: string, extra: Partial<CalEvent> = {}) => {
    if (!d) return;
    if (!ev[d]) ev[d] = [];
    ev[d].push({ t, x, dateStr, fullDate: new Date(currentYearNum, currentMonthNum - 1, d), ...extra });
  };

  (rawOrders || []).forEach(o => {
    // キャンセル注文の納品/レンタル開始/返却予定はカレンダーに出さない（存在しない配送・回収の
    // 予定でトラックが手配される・今後の予定が水増しされるのを防ぐ。返却済/完了は履歴として残す。C26）。
    if (String(o.status || "") === "キャンセル") return;
    const cust = o.companyName || o.personName || "ゲスト";
    const site = o.siteName || o.deliveryLocation || "—";
    const orderNo = o.orderNumber || o.id || "注文";
    const orderInfo = {
      order: o,
      orderId: o.firestoreId || o.id,
      customer: cust,
      site,
      status: formatStatusWithReturnRequest(o.status, o.returnRequestType),
      amount: o.total || 0,
    };

    addEvent(dayOf(o.deliveryDate), "delivery", `${orderNo} 納品`, o.deliveryDate, {
      ...orderInfo,
      description: `${cust} / ${site}`,
    });

    if ((o.items || []).some((item: any) => item.type === "rent")) {
      addEvent(dayOf(o.rentalStartDate), "rental", `${orderNo} レンタル開始`, o.rentalStartDate, {
        ...orderInfo,
        description: `${cust} / ${site}`,
      });
      addEvent(dayOf(o.rentalEndDate), "rental", `${orderNo} 返却予定`, o.rentalEndDate, {
        ...orderInfo,
        description: `${cust} / ${site}`,
      });
      if (o.actualReturnDate && dateKey(o.actualReturnDate) !== dateKey(o.rentalEndDate)) {
        addEvent(dayOf(o.actualReturnDate), "rental", `${orderNo} 返却済`, o.actualReturnDate, {
          ...orderInfo,
          description: `${cust} / ${site}`,
        });
      }
    }
  });

  (cols.maintenance || []).forEach((m: any) => {
    const nextDate = m.next || m.nextDate || m.nextMaintenanceDate || m.dueDate;
    addEvent(dayOf(nextDate), "maint", `${m.name || m.assetName || "設備"} 点検`, nextDate);
  });

  (cols.vehicles || []).forEach((v: any) => {
    const shakenNext = v.inspectionDate || v.nextInspectionDate || (v.shaken && v.shaken.next);
    addEvent(dayOf(shakenNext), "warranty", `${v.plate || v.model} 車検`, shakenNext);
  });

  const baseCal: Record<number, Array<CalEvent>> = {};
    
  Object.entries(ev).forEach(([dStr, evs]) => {
    const d = parseInt(dStr);
    if (!baseCal[d]) baseCal[d] = [];
    baseCal[d] = [...baseCal[d], ...evs];
  });
  
  const CAL: Record<number, Array<CalEvent>> = { ...baseCal };
  Object.entries(customEvents).forEach(([dateStr, evs]) => {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const y = parseInt(parts[0]);
      const m = parseInt(parts[1]);
      const d = parseInt(parts[2]);
      if (y === currentYearNum && m === currentMonthNum) {
        if (!CAL[d]) CAL[d] = [];
        evs.forEach(customEv => {
          if (!(CAL[d] as any[]).find(existing => existing.x === customEv.x && existing.t === customEv.t && (existing as any).id === (customEv as any).id)) {
            CAL[d].push({ ...customEv, isCustom: true, dateStr, fullDate: new Date(y, m - 1, d) });
          }
        });
      }
    }
  });

  const firstDay = new Date(currentYearNum, currentMonthNum - 1, 1);
  const lastDay = new Date(currentYearNum, currentMonthNum, 0);
  const firstDow = firstDay.getDay(); 
  const daysInMonth = lastDay.getDate();
  const cells: (number | null)[] = [];
  
  const padLeft = firstDow === 0 ? 6 : firstDow - 1;
  for (let i = 0; i < padLeft; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const isCurrentMonthReal = currentYearNum === today.getFullYear() && currentMonthNum === (today.getMonth() + 1);
  const startDayForUpcoming = isCurrentMonthReal ? today.getDate() : 1;

  const upcoming = Object.entries(CAL)
    .flatMap(([d, evs]) => 
      evs.filter(e => filter.includes(e.t)).map(e => ({ d: parseInt(d), ...e }))
    )
    .filter(e => e.d >= startDayForUpcoming)
    .sort((a, b) => a.d - b.d)
    .slice(0, 8);

  const handleAddEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEvTitle.trim()) {
      triggerToast("予定を入力してください", "warn");
      return;
    }
    if (!newEvDate) {
      triggerToast("日付を選択してください", "warn");
      return;
    }

    OrderBus.push("calendarEvents", { date: newEvDate, t: newEvKind, x: newEvTitle });

    triggerToast("予定を追加しました", "ok");
    setIsAddModalOpen(false);
    setNewEvTitle("");
  };

  const nextMonth = () => setCurrentMonth(new Date(currentYearNum, currentMonthNum, 1));
  const prevMonth = () => setCurrentMonth(new Date(currentYearNum, currentMonthNum - 2, 1));
  const goToToday = () => setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));

  const handleDeleteCustomEvent = async () => {
    if (!selectedEvent || !selectedEvent.isCustom || !selectedEvent.dateStr || !selectedEvent.id) return;
    if (await confirmDialog(`「${selectedEvent.x}」を削除しますか？`, { danger: true, okText: "削除" })) {
      OrderBus.remove("calendarEvents", String(selectedEvent.id));
      triggerToast("予定を削除しました", "ok");
      setSelectedEvent(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters Toolbar */}
      <Toolbar
        right={
          <Btn icon="add" variant="primary" onClick={() => setIsAddModalOpen(true)}>
            予定を追加
          </Btn>
        }
      >
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-4 mr-4">
            <h2 className="text-lg md:text-xl font-bold tracking-wider text-slate-800 w-[140px]">
              {currentYearNum}年 {currentMonthNum}月
            </h2>
            <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
              <button onClick={prevMonth} className="px-3 py-1.5 hover:bg-slate-50 transition-colors text-slate-600 border-r border-slate-200 flex items-center justify-center">
                <span className="material-symbols-outlined text-sm">chevron_left</span>
              </button>
              <button onClick={goToToday} className="px-3 py-1.5 hover:bg-slate-50 transition-colors text-xs font-bold text-slate-600 border-r border-slate-200">今日</button>
              <button onClick={nextMonth} className="px-3 py-1.5 hover:bg-slate-50 transition-colors text-slate-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-sm">chevron_right</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {Object.entries(CAL_TYPES).map(([k, v]) => {
              const on = filter.includes(k);
              return (
                <button
                  key={k}
                  onClick={() => toggle(k)}
                  className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-bold cursor-pointer transition-colors ${
                    on
                      ? "bg-blue-50 border-blue-200 text-blue-600"
                      : "bg-white border-slate-200 text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: on ? v.color : "var(--color-neutral-300)" }}
                  />
                  {v.label}
                </button>
              );
            })}
          </div>
        </div>
      </Toolbar>

      {/* Main Grid split */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        {/* Month View Grid */}
        <Panel title="カレンダー" icon="calendar_today" bodyPad={0}>
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
            {["月", "火", "水", "木", "金", "土", "日"].map((w, i) => (
              <div
                key={w}
                className={`text-center py-2 font-bold text-xs ${
                  i >= 5 ? "text-red-500" : "text-slate-500"
                }`}
              >
                {w}
              </div>
            ))}
          </div>
          
          <div className="grid grid-cols-7 bg-slate-200 gap-[1px]">
            {cells.map((d, i) => {
              const evs = d ? (CAL[d] || []).filter(e => filter.includes(e.t)) : [];
              const isTodayReal = isCurrentMonthReal && d === today.getDate();
              
              return (
                <div
                  key={i}
                  className={`min-h-[100px] p-2 flex flex-col justify-between ${
                    d ? (isTodayReal ? "bg-blue-50/70" : "bg-white") : "bg-slate-50"
                  }`}
                >
                  {d ? (
                    <>
                      <div className="flex items-start justify-between">
                        <div
                          className={`text-[11px] font-bold font-mono ${
                            isTodayReal ? "text-blue-700 font-extrabold bg-blue-100/50 w-6 h-6 flex items-center justify-center rounded-full -ml-1 -mt-1" : "text-slate-400"
                          }`}
                        >
                          {d}
                        </div>
                      </div>
                      <div className="flex-1 mt-1 flex flex-col gap-1 overflow-hidden">
                        {evs.slice(0, 4).map((e, ei) => {
                          const typeConfig = CAL_TYPES[e.t as keyof typeof CAL_TYPES];
                          return (
                            <div
                              key={ei}
                              onClick={() => setSelectedEvent(e)}
                              style={{ borderLeftColor: typeConfig.color }}
                              className="text-[9.5px] font-bold text-slate-700 border-l-2 bg-slate-50 hover:bg-slate-100 cursor-pointer rounded-sm px-1.5 py-0.5 truncate leading-tight transition-colors shadow-sm"
                            >
                              {e.x}
                            </div>
                          );
                        })}
                        {evs.length > 4 && (
                          <div className="text-[9px] font-semibold text-slate-400 text-right pr-1">
                            +{evs.length - 4} 件
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div />
                  )}
                </div>
              );
            })}
          </div>
        </Panel>

        {/* Side upcoming events */}
        <Panel title={isCurrentMonthReal ? "今後の予定" : `${currentMonthNum}月の予定`} icon="schedule">
          <div className="flex flex-col gap-1">
            {upcoming.map((e, i) => {
              const typeConfig = CAL_TYPES[e.t as keyof typeof CAL_TYPES];
              return (
                <div
                  key={i}
                  onClick={() => setSelectedEvent(e)}
                  className="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50 px-2 -mx-2 rounded-lg transition-colors"
                >
                  <div className="w-[36px] text-center flex-shrink-0">
                    <div className={`font-extrabold font-mono text-base leading-none ${isCurrentMonthReal && e.d === today.getDate() ? 'text-blue-600' : 'text-slate-800'}`}>
                      {e.d}
                    </div>
                    <div className="font-semibold text-[9.5px] text-slate-400 mt-1 leading-none">{currentMonthNum}月</div>
                  </div>
                  <span
                    className="w-[3px] self-stretch rounded-full"
                    style={{ background: typeConfig.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-xs text-slate-800 truncate leading-tight">{e.x}</div>
                    {e.description && (
                      <div className="text-[10px] text-slate-400 font-semibold mt-1 truncate">{e.description}</div>
                    )}
                    <div
                      className="text-[10px] font-semibold mt-1 leading-none"
                      style={{ color: typeConfig.color }}
                    >
                      {typeConfig.label}
                    </div>
                  </div>
                </div>
              );
            })}
            {upcoming.length === 0 && (
              <div className="text-center py-8 text-xs font-semibold text-slate-400">
                表示予定のイベントがありません
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* Add Event Modal */}
      <Modal
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="新規予定を追加"
        width={440}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setIsAddModalOpen(false)}>キャンセル</Btn>
            <Btn variant="primary" icon="check" onClick={handleAddEvent}>保存</Btn>
          </>
        }
      >
        <form onSubmit={handleAddEvent} className="space-y-4">
          <Field label="予定タイトル" required>
            <TextInput value={newEvTitle} onChange={e => setNewEvTitle(e.target.value)} placeholder="例：大成建設 納品" />
          </Field>
          <Row>
            <Field label="区分" required>
              <SelectInput value={newEvKind} onChange={e => setNewEvKind(e.target.value)} options={Object.entries(CAL_TYPES).map(([k, v]) => ({ v: k, l: v.label }))} />
            </Field>
            <Field label="日付" required>
              <TextInput type="date" value={newEvDate} onChange={e => setNewEvDate(e.target.value)} />
            </Field>
          </Row>
        </form>
      </Modal>

      {/* Event Details Modal */}
      <Modal
        open={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        title="予定の詳細"
        width={400}
        footer={
          <div className="flex justify-between w-full">
            {selectedEvent?.isCustom ? (
              <Btn variant="danger" icon="delete" onClick={handleDeleteCustomEvent}>
                削除
              </Btn>
            ) : <div />}
            <div className="flex gap-2">
              {selectedEvent?.order && (
                <Btn
                  variant="primary"
                  icon="open_in_new"
                  onClick={() => {
                    setSelectedOrder(selectedEvent.order);
                    setSelectedEvent(null);
                  }}
                >
                  注文詳細を開く
                </Btn>
              )}
              <Btn variant="secondary" onClick={() => setSelectedEvent(null)}>
                閉じる
              </Btn>
            </div>
          </div>
        }
      >
        {selectedEvent && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full"
                style={{ background: CAL_TYPES[selectedEvent.t as keyof typeof CAL_TYPES]?.color || "#cbd5e1" }}
              />
              <span className="font-bold text-slate-500 text-sm">
                {CAL_TYPES[selectedEvent.t as keyof typeof CAL_TYPES]?.label || "その他"}
              </span>
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800">{selectedEvent.x}</h3>
              <p className="text-sm text-slate-500 mt-2">
                日付: {selectedEvent.fullDate ? `${selectedEvent.fullDate.getFullYear()}年 ${selectedEvent.fullDate.getMonth() + 1}月 ${selectedEvent.fullDate.getDate()}日` : selectedEvent.dateStr || "—"}
              </p>
            </div>
            {selectedEvent.order && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm space-y-2">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-400 font-bold">注文番号</span>
                  <span className="font-mono font-bold text-blue-700">{selectedEvent.order.orderNumber || selectedEvent.order.id}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-400 font-bold">顧客</span>
                  <span className="font-bold text-slate-800 text-right">{selectedEvent.customer || "—"}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-400 font-bold">現場</span>
                  <span className="font-semibold text-slate-700 text-right">{selectedEvent.site || "—"}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-400 font-bold">状態</span>
                  <span className="font-bold text-slate-700 text-right">{selectedEvent.status || "—"}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-400 font-bold">金額</span>
                  <span className="font-mono font-bold text-slate-900">¥{Number(selectedEvent.amount || 0).toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <AdminOrderDrawer
        open={!!selectedOrder}
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onUpdateStatus={(id, status, staffStatus) => {
          // ドロワーの「手配する」(処理中→確認済み) も受注確定 → 出庫。返却系クローズは settleReturnStock で入庫。
          // （他画面 AdminRental/AdminWarehouse と同じく在庫台帳を必ず通す）
          const raw = OrderBus.getAll<any>("orders").find((o: any) => o.id === id || o.firestoreId === id) || selectedOrder;
          const flags = stockFlagsForStatusChange(raw, status); // 稼働系への直接変更も未出庫なら出庫（二重計上防止, K7）
          // クローズ時は発生済みの延滞課金（未永続の roll-forward 分）を確定してから閉じる(M2)。
          const billingClose = closeOrderBillingPatch(raw, status);
          patchOrder(id, { status, ...(staffStatus ? { staffStatus } : {}), ...flags, ...billingClose });
          triggerToast("ステータスを更新しました", "ok");
        }}
        onUpdateOrder={(id, updates) => {
          patchOrder(id, updates);
          setSelectedOrder((prev: any) =>
            prev && (prev.firestoreId === id || prev.id === id) ? { ...prev, ...updates } : prev
          );
        }}
      />
    </div>
  );
}
