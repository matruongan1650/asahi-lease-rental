import React, { useMemo, useState } from "react";
import {
  Badge,
  Btn,
  Field,
  KPI,
  Modal,
  Panel,
  Table,
  Tabs,
  TextInput,
  Toolbar,
  triggerToast
} from "../../components/AdminUI";
import { useAdminCollection } from "../../context/AdminDataContext";
import { useVehicles } from "../../context/VehicleContext";
import { useUser } from "../../context/UserContext";
import OrderBus from "../../lib/orderBus";
import { getCategoryIcon, isVehicleCategory } from "../../utils/productUtils";

type StocktakeTab = "all" | "supplies" | "vehicles" | "diff" | "history";

type StocktakeFile = {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
  dataUrl: string;
};

type StocktakeRow = {
  id: string;
  productId: string;
  vehicleId?: string;
  name: string;
  category: string;
  assetType: "保安用品" | "保安車両";
  image?: string;
  loc: string;
  plate?: string;
  status?: string;
  system: number;
  counted: number;
  diff: number;
  state: "未確認" | "差異なし" | "差異あり";
};

const DEFAULT_COUNTER = "佐藤";

function formatDateTime() {
  // JST(UTC+9)で記録する。toISOString() は UTC のため、00:00–09:00 JST の操作が前日付・9時間ずれで
  // 記録され棚卸履歴/最終棚卸日が誤る。+9h シフトしてから ISO 文字列化することで JST 壁時計を得る。
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace("T", " ").substring(0, 16).replace(/-/g, "/");
}

function zoneForCategory(category: string) {
  if (["カラーコーン", "コーンバー", "ウェイト"].some((x) => category.includes(x))) return "A";
  if (["バリケード", "フェンス", "マット"].some((x) => category.includes(x))) return "B";
  if (["工事灯", "矢印板", "看板", "回転灯"].some((x) => category.includes(x))) return "C";
  if (["発電機", "照明", "電動機器", "ガス"].some((x) => category.includes(x))) return "D";
  return "S";
}

function locationForProduct(product: any) {
  if (product?.location) return String(product.location);
  const zone = zoneForCategory(product?.category || "その他");
  const n = String(product?.id || "").match(/\d+/)?.[0] || "1";
  return `${zone}-${n.padStart(2, "0")}`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function readImageAsDataUrl(file: File): Promise<string> {
  const original = await readFileAsDataUrl(file);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxSide = 1280;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(original);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.86));
    };
    img.onerror = () => resolve(original);
    img.src = original;
  });
}

function makeStocktakeFile(file: File, dataUrl: string): StocktakeFile {
  return {
    id: "STF-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    name: file.name,
    size: file.size,
    type: file.type || "application/octet-stream",
    uploadedAt: new Date().toISOString(),
    dataUrl
  };
}

function formatBytes(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

function downloadText(filename: string, text: string, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  // 一部ブラウザ（Safari/Firefox 等）は DOM に追加しないと click() でダウンロードが発火しない。
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // click 直後に revoke するとダウンロードが中断されることがあるため遅延させる。
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AdminStocktake() {
  const { rows: products } = useAdminCollection("products");
  const { rows: stocktakeHistory } = useAdminCollection("stocktake");
  const { vehicles, updateVehicle } = useVehicles();
  const { currentUser } = useUser();

  const [tab, setTab] = useState<StocktakeTab>("all");
  const [query, setQuery] = useState("");
  // 棚卸の担当者は、ログイン中の管理者/スタッフ名を初期値にする（誰が棚卸したか履歴で正しく残す）。
  const loginName = currentUser ? (`${currentUser.lastName || ""} ${currentUser.firstName || ""}`.trim() || currentUser.email || "") : "";
  const [counter, setCounter] = useState(loginName || DEFAULT_COUNTER);
  const [note, setNote] = useState("");
  const [countDraft, setCountDraft] = useState<Record<string, number>>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [files, setFiles] = useState<StocktakeFile[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const baseRows = useMemo<StocktakeRow[]>(() => {
    const supplyRows = (products || [])
      .filter((p: any) => p && !isVehicleCategory(p.category))
      .map((p: any): StocktakeRow => {
        const system = Number(p.stock || 0);
        // 実際にカウント入力された行のみ判定する。未入力は「未確認」とし、
        // 差異なし(=確認済み一致)と区別する（以前は未入力でも差異なし扱いだった）。
        const isCounted = Object.prototype.hasOwnProperty.call(countDraft, p.id);
        const counted = countDraft[p.id] ?? system;
        const diff = counted - system;
        return {
          id: String(p.id || ""),
          productId: String(p.id || ""),
          name: p.name || "名称未設定",
          category: p.category || "その他",
          assetType: "保安用品",
          image: p.image,
          loc: locationForProduct(p),
          system,
          counted,
          diff,
          state: !isCounted ? "未確認" : diff === 0 ? "差異なし" : "差異あり"
        };
      });

    const vehicleRows = (vehicles || []).map((v): StocktakeRow => {
      const productId = v.productId || v.id;
      const linkedProduct = (products || []).find((p: any) => p?.id === productId);
      const system = Number(v.stock ?? linkedProduct?.stock ?? 1);
      const vkey = `vehicle:${v.id}`;
      const isCounted = Object.prototype.hasOwnProperty.call(countDraft, vkey);
      const counted = countDraft[vkey] ?? system;
      const diff = counted - system;
      return {
        id: `vehicle:${v.id}`,
        productId,
        vehicleId: v.id,
        name: v.name,
        category: v.category,
        assetType: "保安車両",
        image: linkedProduct?.image || v.photos?.[0],
        loc: v.status === "使用中" ? "貸出・稼働中" : v.status === "整備中" ? "整備区画" : "車庫",
        plate: v.plate,
        status: v.status,
        system,
        counted,
        diff,
        state: !isCounted ? "未確認" : diff === 0 ? "差異なし" : "差異あり"
      };
    });

    return [...supplyRows, ...vehicleRows].sort((a, b) => {
      if (a.state !== b.state) return a.state === "差異あり" ? -1 : 1;
      if (a.assetType !== b.assetType) return a.assetType.localeCompare(b.assetType);
      return a.loc.localeCompare(b.loc) || a.name.localeCompare(b.name);
    });
  }, [products, vehicles, countDraft]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return baseRows.filter((row) => {
      const matchTab =
        tab === "all" ||
        (tab === "supplies" && row.assetType === "保安用品") ||
        (tab === "vehicles" && row.assetType === "保安車両") ||
        (tab === "diff" && row.diff !== 0);
      const matchSearch =
        !q ||
        [row.id, row.productId, row.name, row.category, row.loc, row.plate].some((value) =>
          String(value || "").toLowerCase().includes(q)
        );
      return matchTab && matchSearch;
    });
  }, [baseRows, tab, query]);

  const diffRows = baseRows.filter((row) => row.diff !== 0);
  const supplyDiff = diffRows.filter((row) => row.assetType === "保安用品").length;
  const vehicleDiff = diffRows.filter((row) => row.assetType === "保安車両").length;
  const latestSession = [...(stocktakeHistory || [])].sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0];

  const setCount = (row: StocktakeRow, value: number) => {
    const next = Math.max(0, Number(value || 0));
    setCountDraft((prev) => ({ ...prev, [row.id]: next }));
  };

  const resetDraft = () => {
    setCountDraft({});
    setPhotos([]);
    setFiles([]);
    setNote("");
    triggerToast("棚卸入力を現在の帳簿数に戻しました", "info");
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    const valid = picked.filter((file) => {
      if (!file.type.startsWith("image/")) {
        triggerToast(`${file.name} は画像ファイルではありません`, "warn");
        return false;
      }
      if (file.size > 8 * 1024 * 1024) {
        triggerToast(`${file.name} は8MBを超えています`, "warn");
        return false;
      }
      return true;
    });
    const uploaded = await Promise.all(valid.map(readImageAsDataUrl));
    setPhotos((prev) => [...prev, ...uploaded]);
    if (uploaded.length > 0) triggerToast(`${uploaded.length} 件の棚卸写真を追加しました`, "ok");
    e.target.value = "";
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    const valid = picked.filter((file) => {
      if (file.size > 8 * 1024 * 1024) {
        triggerToast(`${file.name} は8MBを超えています`, "warn");
        return false;
      }
      return true;
    });
    const uploaded = await Promise.all(valid.map(async (file) => makeStocktakeFile(file, await readFileAsDataUrl(file))));
    setFiles((prev) => [...prev, ...uploaded]);
    if (uploaded.length > 0) triggerToast(`${uploaded.length} 件の棚卸ファイルを追加しました`, "ok");
    e.target.value = "";
  };

  const finalizeStocktake = () => {
    const date = formatDateTime();
    const sessionId = "ST-" + Date.now();
    const items = baseRows.map((row) => ({
      id: row.id,
      productId: row.productId,
      vehicleId: row.vehicleId,
      name: row.name,
      category: row.category,
      assetType: row.assetType,
      location: row.loc,
      plate: row.plate,
      system: row.system,
      counted: row.counted,
      diff: row.diff
    }));

    OrderBus.push("stocktake", {
      id: sessionId,
      date,
      counter,
      note,
      totalItems: baseRows.length,
      diffItems: diffRows.length,
      supplyDiff,
      vehicleDiff,
      photos,
      files,
      items
    });

    diffRows.forEach((row) => {
      if (row.vehicleId) {
        // 車両行は車両自身の在庫だけを調整する。共有商品マスタ(products.stock)は上書きしない。
        // （1台の点検カウントで商品全体の在庫が 1 等に潰れる／同一商品を指す複数車両行が
        //   互いの結果を上書きする＝在庫破壊、を防ぐ。）
        updateVehicle(row.vehicleId, { stock: row.counted });
      } else {
        // 消耗品/商品行のみ商品マスタの在庫を確定値に更新する。
        OrderBus.patch("products", row.productId, { stock: row.counted });
      }
      OrderBus.push("stockMoves", {
        id: "ADJ-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        productId: row.productId,
        vehicleId: row.vehicleId,
        item: row.name,
        qty: row.diff,
        date,
        location: row.loc,
        type: "棚卸調整",
        note: `帳簿 ${row.system} → 実数 ${row.counted}`,
        staff: counter,
        stocktakeId: sessionId
      });
    });

    setConfirmOpen(false);
    setCountDraft({});
    setPhotos([]);
    setFiles([]);
    setNote("");
    triggerToast(`棚卸を確定しました（差異 ${diffRows.length} 件）`, "ok");
  };

  const exportCsv = () => {
    const header = ["種別", "ID", "品名", "カテゴリ", "保管場所", "帳簿数", "実数", "差異", "状態"];
    const lines = [
      header.join(","),
      ...baseRows.map((row) => [
        row.assetType,
        row.productId,
        row.name,
        row.category,
        row.loc,
        row.system,
        row.counted,
        row.diff,
        row.state
      ].map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
    ];
    // UTF-8 BOM を付与（Excel で開いたときに日本語が文字化けしないように）。
    // 改行は CRLF（Excel 標準）。
    const csv = "\uFEFF" + lines.join("\r\n");
    downloadText(`stocktake-${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv;charset=utf-8");
    triggerToast("棚卸CSVを出力しました", "ok");
  };

  const cols = [
    {
      h: "対象",
      wrap: true,
      cell: (row: StocktakeRow) => (
        <div className="flex items-center gap-3 min-w-[230px]">
          <div className="w-10 h-10 rounded-lg bg-[#e8f6f5] border border-[#cfe6e3] flex items-center justify-center overflow-hidden text-[#1e8c86] flex-shrink-0">
            {row.image ? (
              <img src={row.image} alt={row.name} className="w-full h-full object-cover" />
            ) : (
              <span className="material-symbols-outlined text-[20px]">{row.assetType === "保安車両" ? "directions_car" : getCategoryIcon(row.category)}</span>
            )}
          </div>
          <div className="min-w-0">
            <div className="font-black text-slate-800 truncate">{row.name}</div>
            <div className="text-[10px] font-bold text-slate-400 mt-0.5">
              {row.assetType} ・ {row.category}{row.plate ? ` ・ ${row.plate}` : ""}
            </div>
          </div>
        </div>
      )
    },
    {
      h: "連携ID / 場所",
      wrap: true,
      cell: (row: StocktakeRow) => (
        <div>
          <div className="font-mono text-xs font-black text-slate-700">{row.productId}</div>
          <div className="text-[10px] font-bold text-slate-400 mt-0.5">{row.loc}</div>
        </div>
      )
    },
    { h: "帳簿", align: "right" as const, cell: (row: StocktakeRow) => <span className="font-mono font-black text-slate-700">{row.system}</span> },
    {
      h: "実数",
      align: "right" as const,
      cell: (row: StocktakeRow) => (
        <input
          type="number"
          min="0"
          value={row.counted}
          onChange={(e) => setCount(row, Number(e.target.value))}
          onClick={(e) => e.stopPropagation()}
          className="w-20 h-8 rounded-lg border border-[#b5dad6] bg-white px-2 text-right font-mono font-black text-sm outline-none focus:border-[#2ba8a2]"
        />
      )
    },
    {
      h: "差異",
      align: "right" as const,
      cell: (row: StocktakeRow) => (
        <span className={`font-mono font-black ${row.diff === 0 ? "text-[#1f8f50]" : row.diff > 0 ? "text-[#1e8c86]" : "text-[#d45233]"}`}>
          {row.diff > 0 ? "+" : ""}{row.diff}
        </span>
      )
    },
    { h: "状態", align: "center" as const, cell: (row: StocktakeRow) => <Badge tone={row.state === "差異あり" ? "warning" : row.state === "未確認" ? "default" : "ok"}>{row.state}</Badge> }
  ];

  const historyCols = [
    { h: "棚卸ID", cell: (r: any) => <span className="font-mono font-black text-[#1e8c86]">{r.id}</span> },
    { h: "日時", cell: (r: any) => <span className="font-mono text-xs font-bold text-slate-500">{r.date || r.createdAt || "—"}</span> },
    { h: "担当", cell: (r: any) => <span className="font-bold text-slate-700">{r.counter || "—"}</span> },
    { h: "対象", align: "right" as const, cell: (r: any) => <span className="font-mono font-black">{r.totalItems || 0}</span> },
    { h: "差異", align: "right" as const, cell: (r: any) => <span className="font-mono font-black text-[#d45233]">{r.diffItems || 0}</span> },
    {
      h: "添付",
      align: "right" as const,
      cell: (r: any) => <span className="font-mono text-xs font-bold text-slate-500">写真{(r.photos || []).length} / ファイル{(r.files || []).length}</span>
    }
  ];

  const tabs = [
    { id: "all", label: "すべて" },
    { id: "supplies", label: "保安用品" },
    { id: "vehicles", label: "保安車両" },
    { id: "diff", label: "差異あり" },
    { id: "history", label: "履歴" }
  ];

  const counts = {
    all: baseRows.length,
    supplies: baseRows.filter((row) => row.assetType === "保安用品").length,
    vehicles: baseRows.filter((row) => row.assetType === "保安車両").length,
    diff: diffRows.length,
    history: stocktakeHistory.length
  };

  return (
    <div className="space-y-4">
      <Tabs tabs={tabs} active={tab} onChange={(id) => setTab(id as StocktakeTab)} counts={counts} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
        <KPI label="棚卸対象" value={`${baseRows.length} 件`} icon="list_alt" />
        <KPI label="差異あり" value={`${diffRows.length} 件`} icon="error" accent="#EF6C4A" />
        <KPI label="保安用品差異" value={`${supplyDiff} 件`} icon="inventory_2" accent="#FFD23F" />
        <KPI label="最終棚卸" value={latestSession?.date ? String(latestSession.date).slice(5, 10) : "未実施"} icon="event_note" accent="#5DADE2" />
      </div>

      {tab !== "history" && (
        <>
          <Toolbar
            right={
              <div className="flex gap-2 flex-wrap">
                <Btn icon="refresh" variant="secondary" onClick={resetDraft}>リセット</Btn>
                <Btn icon="download" variant="secondary" onClick={exportCsv}>CSV出力</Btn>
                <Btn icon="check" variant="primary" onClick={() => setConfirmOpen(true)}>棚卸確定</Btn>
              </div>
            }
          >
            <div className="relative w-full md:w-72">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#7ca39f] text-[18px]">search</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="品名・棚番・連携IDで検索"
                className="w-full h-[36px] pl-9 pr-3 rounded-lg border border-[#b5dad6] bg-white text-sm font-semibold outline-none focus:border-[#2ba8a2]"
              />
            </div>
            <TextInput value={counter} onChange={(e) => setCounter(e.target.value)} className="md:w-40" placeholder="担当者" />
          </Toolbar>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
            <Panel title="棚卸入力" icon="checklist" sub={`${filteredRows.length} 件を表示`}>
              <Table cols={cols} rows={filteredRows} />
            </Panel>

            <div className="space-y-4">
              <Panel title="証跡・メモ" icon="attach_file">
                <Field label="棚卸メモ">
                  <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="例：Aゾーン完了、B-12 差異確認中" />
                </Field>
                <div className="flex flex-wrap gap-2 mb-4">
                  <label className="inline-flex items-center justify-center gap-1.5 h-[31px] px-3 rounded-full bg-[#ffd23f] hover:bg-[#ffe47a] text-[#173b38] border border-[#e6b800] font-black text-xs cursor-pointer">
                    <span className="material-symbols-outlined text-[16px]">add_photo_alternate</span>
                    写真
                    <input type="file" multiple accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                  </label>
                  <label className="inline-flex items-center justify-center gap-1.5 h-[31px] px-3 rounded-full bg-white hover:bg-[#fff8e7] text-[#1e8c86] border border-[#b5dad6] font-black text-xs cursor-pointer">
                    <span className="material-symbols-outlined text-[16px]">upload_file</span>
                    ファイル
                    <input type="file" multiple className="hidden" onChange={handleFileUpload} />
                  </label>
                </div>
                {photos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {photos.map((photo, idx) => (
                      <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-[#cfe6e3]">
                        <img src={photo} alt="棚卸写真" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== idx))}
                          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-white/90 text-[#d45233] border border-white shadow flex items-center justify-center cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[14px]">delete</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {files.length > 0 && (
                  <div className="space-y-2">
                    {files.map((file, idx) => (
                      <div key={file.id} className="flex items-center gap-2 rounded-lg border border-[#cfe6e3] bg-[#f7fbfa] px-3 py-2">
                        <span className="material-symbols-outlined text-[18px] text-[#1e8c86]">attach_file</span>
                        <span className="text-xs font-bold text-slate-700 truncate flex-1">{file.name}</span>
                        <span className="text-[10px] font-bold text-slate-400">{formatBytes(file.size)}</span>
                        <button
                          type="button"
                          onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-[#d45233] cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="連携先" icon="hub">
                <div className="space-y-2 text-xs font-bold text-slate-600">
                  <div className="rounded-lg bg-[#e8f6f5] px-3 py-2">確定後、差異は `products.stock` に反映されます。</div>
                  <div className="rounded-lg bg-[#fff8e7] px-3 py-2">保安車両は `vehicles.stock` と連携 product に反映されます。</div>
                  <div className="rounded-lg bg-white border border-[#cfe6e3] px-3 py-2">調整履歴は `stockMoves` と `stocktake` に保存されます。</div>
                </div>
              </Panel>
            </div>
          </div>
        </>
      )}

      {tab === "history" && (
        <Panel title="棚卸履歴" icon="history" sub="確定済みの棚卸セッション">
          <Table cols={historyCols} rows={stocktakeHistory} />
        </Panel>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="棚卸を確定"
        width={520}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setConfirmOpen(false)}>キャンセル</Btn>
            <Btn variant="primary" icon="check" onClick={finalizeStocktake}>確定して反映</Btn>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <div className="rounded-lg border border-[#cfe6e3] bg-[#f7fbfa] px-3 py-2">
            <div className="font-black text-slate-800">差異 {diffRows.length} 件を在庫へ反映します。</div>
            <div className="text-xs text-slate-500 mt-1">確定後は `products` / `vehicles` / `stockMoves` / `stocktake` に保存されます。</div>
          </div>
          {diffRows.slice(0, 8).map((row) => (
            <div key={row.id} className="flex items-center justify-between rounded-lg border border-[#e0f0ee] px-3 py-2">
              <div className="font-bold text-slate-700 truncate">{row.name}</div>
              <div className="font-mono font-black text-[#d45233]">{row.system} → {row.counted}</div>
            </div>
          ))}
          {diffRows.length > 8 && <div className="text-xs text-slate-400 font-bold">他 {diffRows.length - 8} 件</div>}
        </div>
      </Modal>
    </div>
  );
}
