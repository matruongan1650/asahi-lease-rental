import React, { useMemo, useState } from "react";
import { Btn, Field, Modal, Row, SelectInput, TextInput, triggerToast } from "../../components/AdminUI";
import { useAdminCollection } from "../../context/AdminDataContext";
import { useUser } from "../../context/UserContext";
import OrderBus from "../../lib/orderBus";
import { usePagedList } from "../../hooks/usePagedList";
import { isVehicleCategory } from "../../utils/productUtils";

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
  // 在庫は products.stock（現物在庫）が唯一の正。以前は未シードの "warehouse" コレクションを
  // 参照していたため出庫が実在庫に反映されなかった（常に「倉庫に見つかりません」）。products へ統一。
  const { rows: products } = useAdminCollection("products");
  const supplyProducts = useMemo(
    // 車両に連動する商品(P-<id>, vehicleId 付き)は保安用品から除外する。
    // カテゴリー名が車両プリセットからずれても二重計上しないための堅牢なフィルタ。
    () => (products || []).filter((p: any) => p && !p.vehicleId && !isVehicleCategory(p.category)),
    [products],
  );
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
  const { currentUser } = useUser();
  const loginName = currentUser ? (`${currentUser.lastName || ""} ${currentUser.firstName || ""}`.trim() || currentUser.email || "") : "";
  const [staff, setStaff] = useState(loginName || "佐藤");

  const itemOptions = ["", ...supplyProducts.map((p: any) => p.name).filter(Boolean)];
  const totalOutQty = rows.reduce((sum: number, row: any) => sum + Number(row.qty || 0), 0);
  const availableTotal = supplyProducts.reduce((sum: number, p: any) => sum + Number(p.stock || 0), 0);
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
    saveStockOut(false);
  };
  // keepOpen=true: 同じ出庫先の複数品目を連続登録（納品先/担当者は維持、品名・数量のみクリア）。
  const saveStockOut = (keepOpen: boolean) => {
    if (!itemSelect.trim()) {
      triggerToast("品名を選択してください", "warn");
      return;
    }
    if (qty <= 0) {
      triggerToast("数量は1以上にしてください", "warn");
      return;
    }

    const match = supplyProducts.find((p: any) => p.name === itemSelect);
    if (!match) {
      triggerToast("選択された品目が見つかりません", "err");
      return;
    }
    // 在庫チェックと書き込みは「最新在庫」を基準に行う。レンダー時のスナップショット(match.stock)で
    // 判定・減算すると、別端末/受注確定の減算と競合してオーバーセル(二重出庫)や在庫ドリフトを招くため。
    const fresh = OrderBus.getAll<any>("products").find((p: any) => String(p?.id || "") === String(match.id));
    const onHand = Number((fresh?.stock ?? match.stock) || 0);
    if (onHand < qty) {
      triggerToast(`在庫不足です (現在庫: ${onHand}点)`, "warn");
      return;
    }

    const now = Date.now();
    const newId = "OUT-" + now.toString().slice(-8) + "-" + Math.floor(Math.random() * 900 + 100);
    const dateStr = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace("T", " ").substring(0, 16).replace(/-/g, "/"); // JST（他の入出庫画面と統一）
    const stockOutItem = {
      id: newId,
      item: itemSelect,
      qty: Number(qty) || 0,
      date: dateStr,
      dst: dst || "現場未設定",
      type: actionKind,
      staff,
      seq: now,
      icon: "boxOut",
    };

    OrderBus.push("stockOut", stockOutItem);
    OrderBus.patch("products", match.id, { stock: Math.max(0, onHand - Number(qty)) });

    triggerToast(`${itemSelect} を -${qty} 出庫しました`, "ok");
    setItemSelect("");
    setQty(10);
    if (!keepOpen) {
      setDst("");
      setIsAddModalOpen(false);
    }
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
        onSubmit={() => saveStockOut(false)}
        title={`${actionKind}出庫を登録`}
        width={460}
        footer={<><Btn variant="secondary" onClick={() => setIsAddModalOpen(false)}>キャンセル</Btn><Btn variant="secondary" icon="add" onClick={() => saveStockOut(true)}>保存して続ける</Btn><Btn variant="primary" icon="check" onClick={() => saveStockOut(false)}>保存</Btn></>}
      >
        <form onSubmit={handleSaveStockOut} className="space-y-3">
          <Field label="対象品名" required>
            <SelectInput autoFocus value={itemSelect} onChange={e => setItemSelect(e.target.value)} options={itemOptions.map(v => ({ v, l: v || "選択してください" }))} />
            {itemSelect && (() => {
              const sel = supplyProducts.find((p: any) => p.name === itemSelect);
              const onHand = Number(sel?.stock || 0);
              const short = Number(qty) > onHand;
              return (
                <div className={`mt-1.5 text-xs font-bold rounded-lg px-3 py-2 ${short ? "bg-red-50 text-red-600 border border-red-200" : "bg-slate-50 text-slate-600 border border-slate-200"}`}>
                  現在庫: {onHand}点{short ? ` ・ 数量(${qty})が在庫を超えています` : ""}
                </div>
              );
            })()}
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
