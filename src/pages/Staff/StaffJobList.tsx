import React from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useOrders, Order } from "../../context/OrderContext";
import { ArrowLeft, Inbox, MapPin, Calendar, Package, ChevronRight } from "lucide-react";

export default function StaffJobList() {
  const { role } = useParams<{ role: string }>();
  const navigate = useNavigate();
  const { orders } = useOrders();

  let title = "";
  let filteredOrders: Order[] = [];

  if (role === "delivery") {
    title = "配達指示";
    // Orders confirmed by admin ready for delivery, or currently delivering
    filteredOrders = orders.filter(o => o.status === "確認済み" || o.status === "配送中");
  } else if (role === "collection") {
    title = "回収指示";
    // Orders delivered and needing collection
    filteredOrders = orders.filter(o => o.status === "配達完了" || o.status === "回収中");
  } else if (role === "warehouse") {
    title = "倉庫返却対応";
    // Similar to collection but maybe showing all delivered or searching
    filteredOrders = orders.filter(o => o.status === "配達完了" || o.status === "回収中");
  }

  return (
    <div className="bg-slate-50 min-h-screen text-slate-900 pb-20 font-sans">
      <div className="bg-white shadow-sm sticky top-0 z-20 px-4 py-3 flex items-center justify-between border-b border-slate-100">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-500 hover:text-slate-800 transition-colors">
            <ArrowLeft size={24} />
          </button>
          <div className="flex flex-col">
            <h1 className="text-[17px] font-extrabold tracking-tight text-slate-800 leading-tight">{title}</h1>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{filteredOrders.length} 件</span>
          </div>
        </div>
      </div>

      <div className="p-5 max-w-sm mx-auto space-y-4">
        {filteredOrders.length === 0 ? (
          <div className="text-center py-16 bg-white border border-slate-100 rounded-3xl shadow-sm">
            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-100">
              <Inbox size={32} className="text-slate-300" />
            </div>
            <p className="font-extrabold text-slate-700">タスクがありません</p>
            <p className="text-xs font-medium text-slate-500 mt-1">対象の注文はありません。</p>
          </div>
        ) : (
          filteredOrders.map(order => (
            <Link 
              key={order.id} 
              to={`/staff/${role}/job/${order.id}`}
              className="block bg-white p-5 rounded-3xl shadow-sm border border-slate-100 hover:border-blue-200 hover:shadow-md transition-all active:scale-[0.98] group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-50 to-transparent blur-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
              
              <div className="flex justify-between items-start mb-4 relative z-10">
                <div className="flex flex-col">
                  <span className="font-extrabold text-[17px] text-slate-800 font-mono tracking-tight">{order.orderNumber}</span>
                  <span className="text-xs font-bold text-slate-500 mt-0.5 max-w-[180px] truncate">{order.personName || "N/A"}</span>
                </div>
                <span className={`text-[10px] px-2.5 py-1 rounded-full font-extrabold tracking-widest uppercase border ${
                  order.status === "確認済み" ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                  order.status === "配送中" ? "bg-blue-50 text-blue-700 border-blue-200" :
                  order.status === "配送済み" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                  order.status === "回収中" ? "bg-orange-50 text-orange-700 border-orange-200" :
                  "bg-slate-50 text-slate-700 border-slate-200"
                }`}>
                  {order.status}
                </span>
              </div>
              
              <div className="space-y-2.5 relative z-10">
                <p className="text-xs text-slate-600 flex items-start gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <MapPin size={16} className="text-blue-400 shrink-0 mt-0.5" />
                  <span className="font-medium leading-relaxed line-clamp-2">{order.deliveryLocation || "店舗受取"}</span>
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <p className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5 p-2 rounded-lg bg-slate-50 border border-slate-100">
                    <Calendar size={14} className="text-slate-400" />
                    <span className="truncate">{order.rentalStartDate}</span>
                  </p>
                  <p className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5 p-2 rounded-lg bg-slate-50 border border-slate-100">
                    <Package size={14} className="text-slate-400" />
                    <span>{order.items.length} 品目</span>
                  </p>
                </div>
              </div>
              
              <div className="mt-4 pt-3 flex items-center justify-between border-t border-slate-50 relative z-10">
                  <span className="text-[11px] font-extrabold text-blue-500 uppercase tracking-widest">
                    {role === "delivery" ? "配達詳細を表示" : "回収詳細を表示"}
                  </span>
                 <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                   <ChevronRight size={16} />
                 </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
