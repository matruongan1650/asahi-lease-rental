import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useOrders } from "../context/OrderContext";
import { useUser } from "../context/UserContext";
import OrderBus from "../lib/orderBus";
import { AppNotification, buildCustomerNotifications } from "../utils/notifications";
import { useNotificationReads } from "../lib/notificationReads";

function toneClass(tone: AppNotification["tone"]) {
  if (tone === "danger") return "text-red-600 bg-red-50 dark:bg-red-900/20";
  if (tone === "warning") return "text-amber-600 bg-amber-50 dark:bg-amber-900/20";
  if (tone === "success") return "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20";
  return "text-primary bg-blue-50 dark:bg-blue-900/20";
}

export default function CustomerNotificationBell() {
  const { orders } = useOrders();
  const { currentUser } = useUser();
  const [open, setOpen] = useState(false);
  const [inspections, setInspections] = useState<any[]>([]);

  useEffect(() => {
    return OrderBus.subscribe("returnInspections", (rows) => setInspections(rows || []));
  }, []);

  const myOrders = useMemo(
    () => (orders || []).filter((order: any) => currentUser && order.userId === currentUser.id),
    [orders, currentUser],
  );
  const notifications = useMemo(
    () => buildCustomerNotifications({ orders: myOrders, inspections }),
    [myOrders, inspections],
  );
  const { isRead, markRead, unreadCount } = useNotificationReads("customer:" + (currentUser?.id || "guest"));
  const unread = unreadCount(notifications);

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative p-2.5 rounded-full bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 transition-colors group">
        <span className="material-symbols-outlined text-slate-600 dark:text-slate-300 group-active:scale-95 transition-transform text-[22px]">notifications</span>
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 bg-red-500 rounded-full border border-slate-50 dark:border-slate-800 text-[9px] font-black text-white flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* 外側クリックで閉じる */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-12 right-0 w-80 max-w-[calc(100vw-32px)] bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 p-4 z-50 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-100 dark:border-slate-700">
              <h3 className="font-bold text-slate-900 dark:text-white">お知らせ{unread > 0 ? `（未読 ${unread}）` : ""}</h3>
              {unread > 0 && (
                <button onClick={() => markRead(notifications)} className="text-[11px] font-bold text-primary hover:underline">
                  すべて既読
                </button>
              )}
            </div>
            <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="text-sm text-slate-500 dark:text-slate-400 py-3 text-center">現在のお知らせはありません</div>
              ) : (
                notifications.map((item) => {
                  const read = isRead(item);
                  const body = (
                    <div className={`relative rounded-lg px-3 py-2 ${toneClass(item.tone)} ${read ? "opacity-50" : ""}`}>
                      {!read && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500" />}
                      <p className="font-black text-xs mb-0.5 pr-3">{item.title}</p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300">{item.body}</p>
                    </div>
                  );
                  return item.href ? (
                    <Link key={item.id} to={item.href} onClick={() => { markRead([item]); setOpen(false); }}>
                      {body}
                    </Link>
                  ) : (
                    <button key={item.id} className="text-left" onClick={() => markRead([item])}>{body}</button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
