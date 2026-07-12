import React, { useMemo, useState } from "react";
import { Btn, Field, Modal, Row, SelectInput, TextInput, triggerToast } from "../../components/AdminUI";
import { useAdminCollection } from "../../context/AdminDataContext";
import { useUser } from "../../context/UserContext";
import OrderBus from "../../lib/orderBus";
import { usePagedList } from "../../hooks/usePagedList";
import { isVehicleCategory } from "../../utils/productUtils";

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
  // 在庫は products.stock（現物在庫）が唯一の正。以前は未シードの "warehouse" コレクションを
  // 参照していたため入庫が実在庫に反映されなかった。products へ統一する。
  const { rows: products } = useAdminCollection("products");
  const supplyProducts = useMemo(
    // 車両に連動する商品(P-<id>, vehicleId 付き)は保安用品から除外する。
    // カテゴリー名が車両プリセットからずれても二重計上しないための堅牢なフィルタ。
    () => (products || []).filter((p: any) => p && !p.vehicleId && !isVehicleCategory(p.category)),
    [products],
  );
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("すべて");
  const [monthFilter, setMonthFilter] = useState("すべて");
  // データの存在する月（YYYY/MM）を新しい順に。大量データを月単位で絞り込めるようにする。
  const months = useMemo(
    () => Array.from(new Set(rows.map((r: any) => String(r.date || "").slice(0, 7)).filter(Boolean))).sort().reverse(),
    [rows],
  );

  const [itemSelect, setItemSelect] = useState("");
  const [customItem, setCustomItem] = useState("");
  const [qty, setQty] = useState(10);
  const [src, setSrc] = useState("");
  const [type, setType] = useState("新規購入");
  const { currentUser } = useUser();
  const loginName = currentUser ? (`${currentUser.lastName || ""} ${currentUser.firstName || ""}`.trim() || currentUser.email || "") : "";
  const [staff, setStaff] = useState(loginName || "佐藤");

  // 選択肢は商品IDを値にする。名前文字列で特定すると同名商品（別カテゴリ/重複登録）の在庫を
  // 誤って増減する(K9)。同名がある場合はカテゴリを付けて区別表示する。
  const dupNames = (() => {
    const seen = new Map<string, number>();
    supplyProducts.forEach((p: any) => { const k = String(p.name || "").trim(); seen.set(k, (seen.get(k) || 0) + 1); });
    return new Set(Array.from(seen.entries()).filter(([, n]) => n > 1).map(([k]) => k));
  })();
  const itemOptions = [
    { v: "", l: "選択してください" },
    ...supplyProducts.filter((p: any) => p.name).map((p: any) => ({
      v: "id:" + p.id,
      l: dupNames.has(String(p.name).trim()) ? p.name + "（" + (p.category || p.id) + "）" : p.name,
    })),
    { v: "custom", l: "その他 (直接入力)" },
  ];
  const totalInQty = rows.reduce((sum: number, row: any) => sum + Number(row.qty || 0), 0);
  const todayCount = rows.filter((row: any) => String(row.date || "").slice(0, 10) === new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, "/")).length; // JST 当日（toISOString は UTC のため早朝に前日扱いになるのを防ぐ）
  const purchaseCount = rows.filter((row: any) => row.type === "新規購入").length;

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...rows]
      .filter((row: any) => typeFilter === "すべて" || row.type === typeFilter)
      .filter((row: any) => monthFilter === "すべて" || String(row.date || "").slice(0, 7) === monthFilter)
      .filter((row: any) => !q || [row.id, row.item, row.src, row.staff, row.type].some((v) => String(v || "").toLowerCase().includes(q)))
      .sort((a: any, b: any) => String(b.date || "").localeCompare(String(a.date || "")));
  }, [rows, query, typeFilter, monthFilter]);

  const paged = usePagedList(filteredRows, 50, [query, typeFilter, monthFilter]);

  const savingRef = React.useRef(false); // 在庫書き込みの二重送信ガード
  const handleSaveStockIn = (e: React.FormEvent) => {
    e.preventDefault();
    saveStockIn(false);
  };
  // keepOpen=true: 同じ納品の複数品目を連続登録する（区分/担当者/伝票は維持、品名・数量のみクリア）。
  const saveStockIn = (keepOpen: boolean) => {
    const selectedProduct = itemSelect.startsWith("id:")
      ? supplyProducts.find((p: any) => String(p.id) === itemSelect.slice(3))
      : null;
    const itemName = itemSelect === "custom" ? customItem : String(selectedProduct?.name || "");
    if (!itemName.trim()) {
      triggerToast("品名を選択または入力してください", "warn");
      return;
    }
    if (qty <= 0) {
      triggerToast("数量は1以上にしてください", "warn");
      return;
    }
    // 二重送信ガード: 連打/Enter+クリックで在庫が二重入庫されるのを防ぐ（再レンダーまでボタンは押下可能）。
    if (savingRef.current) return;
    savingRef.current = true;
    setTimeout(() => { savingRef.current = false; }, 800);

    const now = Date.now();
    const newId = "IN-" + now.toString().slice(-8) + "-" + Math.floor(Math.random() * 900 + 100);
    const dateStr = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace("T", " ").substring(0, 16).replace(/-/g, "/"); // JST（他の入出庫画面と統一）
    const stockInItem = {
      id: newId,
      item: itemName,
      qty: Number(qty) || 0,
      date: dateStr,
      src: src || (type === "新規購入" ? "新規購入" : "回収戻し"),
      type,
      staff,
      seq: now,
      icon: "boxIn",
    };

    OrderBus.push("stockIn", stockInItem);
    const match = selectedProduct; // ID で特定（同名商品への誤爆防止, K9）
    if (match) {
      // 書き込み直前に最新在庫を再読込（レンダー時のスナップショットは古く、別端末/受注確定の
      // 在庫変動を絶対値で上書きしてしまうため）。
      const fresh = OrderBus.getAll<any>("products").find((p: any) => String(p?.id || "") === String(match.id));
      const base = Number((fresh?.stock ?? match.stock) || 0);
      OrderBus.patch("products", match.id, { stock: base + Number(qty) });
      triggerToast(`${itemName} を +${qty} 入庫しました`, "ok");
    } else {
      // 商品マスタに該当なし（その他/直接入力）。履歴は残すが実在庫は調整しない。
      triggerToast(`${itemName} の入庫を記録しました（商品マスタ未登録のため在庫は未調整。先に商品登録してください）`, "warn");
    }

    setItemSelect("");
    setCustomItem("");
    setQty(10);
    if (!keepOpen) {
      setSrc("");
      setIsAddModalOpen(false);
    }
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
            <div className="flex gap-2">
              <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="h-[38px] rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-700">
                <option value="すべて">全期間</option>
                {months.map((m) => <option key={m} value={m}>{m.replace("/", "年") + "月"}</option>)}
              </select>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-[38px] rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-700">
                {["すべて", "新規購入", "回収戻し", "その他"].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
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
        onSubmit={() => saveStockIn(false)}
        title="入庫を登録"
        width={460}
        footer={<><Btn variant="secondary" onClick={() => setIsAddModalOpen(false)}>キャンセル</Btn><Btn variant="secondary" icon="add" onClick={() => saveStockIn(true)}>保存して続ける</Btn><Btn variant="primary" icon="check" onClick={() => saveStockIn(false)}>保存</Btn></>}
      >
        <form onSubmit={handleSaveStockIn} className="space-y-3">
          <Field label="対象品名" required>
            <SelectInput autoFocus value={itemSelect} onChange={e => setItemSelect(e.target.value)} options={itemOptions} />
          </Field>
          {itemSelect === "custom" && (
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
