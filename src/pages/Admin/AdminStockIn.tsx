import React, { useMemo, useState } from "react";
import { Btn, Field, Modal, Row, SelectInput, TextInput, triggerToast } from "../../components/AdminUI";
import { useAdminCollection } from "../../context/AdminDataContext";
import OrderBus from "../../lib/orderBus";
import { usePagedList } from "../../hooks/usePagedList";

function StatCard({ icon, label, value, tone = "blue" }: { icon: string; label: string; value: string | number; tone?: "blue" | "emerald" | "amber" }) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
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

export default function AdminStockIn() {
  const { rows } = useAdminCollection("stockIn");
  const { rows: warehouseRows } = useAdminCollection("warehouse");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("すべて");

  const [itemSelect, setItemSelect] = useState("");
  const [customItem, setCustomItem] = useState("");
  const [qty, setQty] = useState(10);
  const [src, setSrc] = useState("");
  const [type, setType] = useState("新規購入");
  const [staff, setStaff] = useState("佐藤");

  const itemOptions = ["", ...warehouseRows.map((w: any) => w.name).filter(Boolean), "その他 (直接入力)"];
  const totalInQty = rows.reduce((sum: number, row: any) => sum + Number(row.qty || 0), 0);
  const todayCount = rows.filter((row: any) => String(row.date || "").slice(0, 10) === new Date().toISOString().slice(0, 10).replace(/-/g, "/")).length;
  const purchaseCount = rows.filter((row: any) => row.type === "新規購入").length;

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...rows]
      .filter((row: any) => typeFilter === "すべて" || row.type === typeFilter)
      .filter((row: any) => !q || [row.id, row.item, row.src, row.staff, row.type].some((v) => String(v || "").toLowerCase().includes(q)))
      .sort((a: any, b: any) => String(b.date || "").localeCompare(String(a.date || "")));
  }, [rows, query, typeFilter]);

  const paged = usePagedList(filteredRows, 50, [query, typeFilter]);

  const handleSaveStockIn = (e: React.FormEvent) => {
    e.preventDefault();
    const itemName = itemSelect === "その他 (直接入力)" ? customItem : itemSelect;
    if (!itemName.trim()) {
      triggerToast("品名を選択または入力してください", "warn");
      return;
    }
    if (qty <= 0) {
      triggerToast("数量は1以上にしてください", "warn");
      return;
    }

    const newId = "IN-" + Math.floor(7700 + Math.random() * 200);
    const dateStr = new Date().toISOString().replace("T", " ").substring(0, 16).replace(/-/g, "/");
    const stockInItem = {
      id: newId,
      item: itemName,
      qty: Number(qty) || 0,
      date: dateStr,
      src: src || (type === "新規購入" ? "新規購入" : "回収戻し"),
      type,
      staff
    };

    OrderBus.push("stockIn", stockInItem);
    const match = warehouseRows.find((w: any) => w.name === itemName);
    if (match) {
      OrderBus.patch("warehouse", match.id, {
        total: (match.total || 0) + Number(qty),
        available: (match.available || 0) + Number(qty)
      });
      triggerToast(`${itemName} を +${qty} 入庫しました`, "ok");
    } else {
      OrderBus.push("warehouse", {
        id: "W-" + Math.floor(10 + Math.random() * 80),
        name: itemName,
        loc: "A-01 (自動割当)",
        total: Number(qty),
        rented: 0,
        available: Number(qty),
        cat: "その他"
      });
      triggerToast(`${itemName} を倉庫に新規登録しました`, "ok");
    }

    setIsAddModalOpen(false);
    setItemSelect("");
    setCustomItem("");
    setQty(10);
    setSrc("");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div>
          <h2 className="text-[24px] font-black text-slate-900 tracking-tight">入庫管理</h2>
          <div className="mt-2 text-xs font-bold text-slate-500">購入・回収戻し・調整入庫を倉庫在庫へ反映</div>
        </div>
        <Btn icon="add" variant="primary" onClick={() => setIsAddModalOpen(true)}>入庫を登録</Btn>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard icon="login" label="入庫件数" value={`${rows.length}件`} />
        <StatCard icon="inventory_2" label="入庫数量" value={`${totalInQty.toLocaleString()}点`} tone="emerald" />
        <StatCard icon="today" label="本日登録" value={`${todayCount}件`} tone="amber" />
        <StatCard icon="shopping_cart" label="新規購入" value={`${purchaseCount}件`} tone="blue" />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-[0_6px_24px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50/70 p-3">
          <div className="flex flex-col sm:flex-row gap-2 justify-between">
            <div className="relative sm:min-w-[320px]">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[19px]">search</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="入庫番号・品名・参照を検索" className="h-[38px] w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm font-semibold outline-none focus:border-[#1a1c9a]/50" />
            </div>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-[38px] rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-700">
              {["すべて", "新規購入", "回収戻し", "その他"].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-white">
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">入庫</th>
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">品名</th>
                <th className="px-4 py-3 text-right text-[11px] font-black text-slate-500">数量</th>
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">区分 / 参照</th>
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
                        <td className="px-4 py-3 text-right font-mono text-sm font-black text-emerald-700">+{Number(row.qty || 0).toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <div className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">{row.type}</div>
                          <div className="mt-1 text-xs font-bold text-slate-500">{row.src || "—"}</div>
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-slate-700">{row.staff}</td>
                      </tr>
                    </React.Fragment>
                  );
                });
              })()}
            </tbody>
          </table>
          {filteredRows.length === 0 && <div className="py-12 text-center text-sm font-bold text-slate-400">入庫履歴がありません</div>}
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
        title="入庫を登録"
        width={460}
        footer={<><Btn variant="secondary" onClick={() => setIsAddModalOpen(false)}>キャンセル</Btn><Btn variant="primary" icon="check" onClick={handleSaveStockIn}>保存</Btn></>}
      >
        <form onSubmit={handleSaveStockIn} className="space-y-3">
          <Field label="対象品名" required>
            <SelectInput value={itemSelect} onChange={e => setItemSelect(e.target.value)} options={itemOptions.map(v => ({ v, l: v || "選択してください" }))} />
          </Field>
          {itemSelect === "その他 (直接入力)" && (
            <Field label="直接入力品名" required>
              <TextInput value={customItem} onChange={e => setCustomItem(e.target.value)} placeholder="例：新型カラーコーン 青" />
            </Field>
          )}
          <Row>
            <Field label="数量" required>
              <TextInput type="number" min="1" value={qty} onChange={e => setQty(Number(e.target.value))} />
            </Field>
            <Field label="入庫区分" required>
              <SelectInput value={type} onChange={e => setType(e.target.value)} options={["新規購入", "回収戻し", "その他"]} />
            </Field>
          </Row>
          <Field label="伝票参照">
            <TextInput value={src} onChange={e => setSrc(e.target.value)} placeholder="例：PO-2204 / RTN-0001" />
          </Field>
          <Field label="担当者" required>
            <TextInput value={staff} onChange={e => setStaff(e.target.value)} />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
