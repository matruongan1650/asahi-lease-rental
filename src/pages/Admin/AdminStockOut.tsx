import React, { useMemo, useState } from "react";
import { Btn, Field, Modal, Row, SelectInput, TextInput, triggerToast } from "../../components/AdminUI";
import { useAdminCollection } from "../../context/AdminDataContext";
import OrderBus from "../../lib/orderBus";
import { usePagedList } from "../../hooks/usePagedList";

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
          <div className="mt-1 text-[24px] font-black text-slate-900 tracking-tight">{value}</div>
        </div>
        <span className={`material-symbols-outlined flex h-10 w-10 items-center justify-center rounded-lg text-[20px] ${toneClass}`}>{icon}</span>
      </div>
    </div>
  );
}

export default function AdminStockOut() {
  const { rows } = useAdminCollection("stockOut");
  const { rows: warehouseRows } = useAdminCollection("warehouse");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [actionKind, setActionKind] = useState<"レンタル" | "販売">("レンタル");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("すべて");
  const [monthFilter, setMonthFilter] = useState("すべて");
  const months = useMemo(
    () => Array.from(new Set(rows.map((r: any) => String(r.date || "").slice(0, 7)).filter(Boolean))).sort().reverse(),
    [rows],
  );

  const [itemSelect, setItemSelect] = useState("");
  const [qty, setQty] = useState(10);
  const [dst, setDst] = useState("");
  const [staff, setStaff] = useState("佐藤");

  const itemOptions = ["", ...warehouseRows.map((w: any) => w.name).filter(Boolean)];
  const totalOutQty = rows.reduce((sum: number, row: any) => sum + Number(row.qty || 0), 0);
  const availableTotal = warehouseRows.reduce((sum: number, row: any) => sum + Number(row.available || 0), 0);
  const rentalOutCount = rows.filter((row: any) => row.type === "レンタル").length;
  const saleOutCount = rows.filter((row: any) => row.type === "販売").length;

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...rows]
      .filter((row: any) => typeFilter === "すべて" || row.type === typeFilter)
      .filter((row: any) => monthFilter === "すべて" || String(row.date || "").slice(0, 7) === monthFilter)
      .filter((row: any) => !q || [row.id, row.item, row.dst, row.staff, row.type].some((v) => String(v || "").toLowerCase().includes(q)))
      .sort((a: any, b: any) => String(b.date || "").localeCompare(String(a.date || "")));
  }, [rows, query, typeFilter, monthFilter]);

  const paged = usePagedList(filteredRows, 50, [query, typeFilter, monthFilter]);

  const handleOpenModal = (kind: "レンタル" | "販売") => {
    setActionKind(kind);
    setIsAddModalOpen(true);
  };

  const handleSaveStockOut = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemSelect.trim()) {
      triggerToast("品名を選択してください", "warn");
      return;
    }
    if (qty <= 0) {
      triggerToast("数量は1以上にしてください", "warn");
      return;
    }

    const match = warehouseRows.find((w: any) => w.name === itemSelect);
    if (!match) {
      triggerToast("選択された品目が倉庫に見つかりません", "err");
      return;
    }
    if (Number(match.available || 0) < qty) {
      triggerToast(`在庫不足です (利用可能: ${match.available}点)`, "warn");
      return;
    }

    const newId = "OUT-" + Math.floor(9900 + Math.random() * 90);
    const dateStr = new Date().toISOString().replace("T", " ").substring(0, 16).replace(/-/g, "/");
    const stockOutItem = {
      id: newId,
      item: itemSelect,
      qty: Number(qty) || 0,
      date: dateStr,
      dst: dst || "現場未設定",
      type: actionKind,
      staff
    };

    OrderBus.push("stockOut", stockOutItem);
    OrderBus.patch("warehouse", match.id, {
      available: Number(match.available || 0) - Number(qty),
      rented: actionKind === "レンタル" ? Number(match.rented || 0) + Number(qty) : Number(match.rented || 0),
      total: actionKind === "販売" ? Number(match.total || 0) - Number(qty) : Number(match.total || 0)
    });

    triggerToast(`${itemSelect} を -${qty} 出庫しました`, "ok");
    setIsAddModalOpen(false);
    setItemSelect("");
    setQty(10);
    setDst("");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div>
          <h2 className="text-[24px] font-black text-slate-900 tracking-tight">出庫管理</h2>
          <div className="mt-2 text-xs font-bold text-slate-500">レンタル出荷・販売出荷を倉庫在庫へ反映</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn icon="autorenew" onClick={() => handleOpenModal("レンタル")}>レンタル出庫</Btn>
          <Btn icon="payments" variant="primary" onClick={() => handleOpenModal("販売")}>販売出庫</Btn>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard icon="logout" label="出庫件数" value={`${rows.length}件`} />
        <StatCard icon="inventory_2" label="出庫数量" value={`${totalOutQty.toLocaleString()}点`} tone="blue" />
        <StatCard icon="autorenew" label="レンタル出庫" value={`${rentalOutCount}件`} tone="emerald" />
        <StatCard icon="warehouse" label="利用可能在庫" value={`${availableTotal.toLocaleString()}点`} tone={availableTotal > 0 ? "amber" : "rose"} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-[0_6px_24px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50/70 p-3">
          <div className="flex flex-col sm:flex-row gap-2 justify-between">
            <div className="relative sm:min-w-[320px]">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[19px]">search</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="出庫番号・品名・現場を検索" className="h-[38px] w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm font-semibold outline-none focus:border-[#1a1c9a]/50" />
            </div>
            <div className="flex gap-2">
              <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="h-[38px] rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-700">
                <option value="すべて">全期間</option>
                {months.map((m) => <option key={m} value={m}>{m.replace("/", "年") + "月"}</option>)}
              </select>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-[38px] rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-700">
                {["すべて", "レンタル", "販売"].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-white">
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">出庫</th>
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">品名</th>
                <th className="px-4 py-3 text-right text-[11px] font-black text-slate-500">数量</th>
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">区分 / 納品先</th>
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">担当</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(() => {
                let lastDay = "";
                return paged.shown.map((row: any) => {
                  const day = String(row.date || "").split(" ")[0] || "日付なし";
                  const showHeader = day !== lastDay;
                  lastDay = day;
                  return (
                    <React.Fragment key={row.id}>
                      {showHeader && (
                        <tr className="bg-slate-50/80">
                          <td colSpan={5} className="px-4 py-2 text-[11px] font-black text-slate-500 sticky left-0">📅 {day}</td>
                        </tr>
                      )}
                      <tr className="hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <div className="font-mono text-sm font-black text-blue-700">{row.id}</div>
                          <div className="mt-1 font-mono text-[10px] font-bold text-slate-400">{row.date}</div>
                        </td>
                        <td className="px-4 py-3 text-sm font-black text-slate-900">{row.item}</td>
                        <td className="px-4 py-3 text-right font-mono text-sm font-black text-blue-700">-{Number(row.qty || 0).toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <div className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${row.type === "販売" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>{row.type}</div>
                          <div className="mt-1 text-xs font-bold text-slate-500">{row.dst || "—"}</div>
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-slate-700">{row.staff}</td>
                      </tr>
                    </React.Fragment>
                  );
                });
              })()}
            </tbody>
          </table>
          {filteredRows.length === 0 && <div className="py-12 text-center text-sm font-bold text-slate-400">出庫履歴がありません</div>}
          {paged.hasMore && (
            <div className="py-4 text-center border-t border-slate-100">
              <button onClick={paged.showMore} className="px-5 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-sm font-black text-blue-700">さらに表示（残り {paged.remaining} 件）</button>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={`${actionKind}出庫を登録`}
        width={460}
        footer={<><Btn variant="secondary" onClick={() => setIsAddModalOpen(false)}>キャンセル</Btn><Btn variant="primary" icon="check" onClick={handleSaveStockOut}>保存</Btn></>}
      >
        <form onSubmit={handleSaveStockOut} className="space-y-3">
          <Field label="対象品名" required>
            <SelectInput value={itemSelect} onChange={e => setItemSelect(e.target.value)} options={itemOptions.map(v => ({ v, l: v || "選択してください" }))} />
          </Field>
          <Row>
            <Field label="数量" required>
              <TextInput type="number" min="1" value={qty} onChange={e => setQty(Number(e.target.value))} />
            </Field>
            <Field label="納品先・工事現場" required>
              <TextInput value={dst} onChange={e => setDst(e.target.value)} placeholder="例：大成建設 / 品川現場" />
            </Field>
          </Row>
          <Field label="担当者" required>
            <TextInput value={staff} onChange={e => setStaff(e.target.value)} />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
