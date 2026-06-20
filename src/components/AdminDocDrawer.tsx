import React, { useState, useEffect } from "react";
import {
  Drawer,
  Btn,
  FormSection,
  Row,
  Field,
  SelectInput,
  TextInput,
  TextArea,
  triggerToast
} from "./AdminUI";
import { useAdminCollection } from "../context/AdminDataContext";
import { useUser } from "../context/UserContext";
import { useProducts } from "../context/ProductContext";
import { getTaxRate } from "../utils/billing";

export const ITEM_OPTS = [
  "カラーコーン 赤",
  "コーンバー 2m",
  "単管バリケード",
  "工事看板 A型",
  "ガードフェンス",
  "ウェイト 10kg",
  "LED保安灯",
  "矢印板"
];

export interface LineItem {
  id: number;
  name: string;
  qty: number;
  price: number;
}

export const DOC_META = {
  "rental-contract": { title: "レンタル契約の作成", sub: "新規レンタル契約書", code: "RN", unit: "日額", dateLabels: ["開始日", "終了日"], cta: "契約を作成", done: "レンタル契約を作成しました" },
  "rental-invoice": { title: "レンタル請求書の作成", sub: "請求書発行", code: "INV-R", unit: "単価", dateLabels: ["請求日", "支払期限"], cta: "請求書を発行", done: "請求書を発行しました" },
  "rental-delivery": { title: "レンタル納品書の作成", sub: "納品書発行", code: "DLV", unit: "単価", dateLabels: ["納品予定日", "回収予定日"], cta: "納品書を作成", done: "納品書を作成しました" },
  "sale-contract": { title: "販売契約の作成", sub: "新規販売契約書", code: "SL", unit: "単価", dateLabels: ["契約日", "納品予定日"], cta: "契約を作成", done: "販売契約を作成しました" },
  "sale-invoice": { title: "販売請求書の作成", sub: "請求書発行", code: "INV-S", unit: "単価", dateLabels: ["請求日", "支払期限"], cta: "請求書を発行", done: "請求書を発行しました" },
  "repair": { title: "修理を依頼", sub: "修理業者へ依頼", code: "RP", unit: "見積", dateLabels: ["依頼日", "希望完了日"], cta: "依頼を送信", done: "修理依頼を送信しました" },
};

interface LineItemsProps {
  items: LineItem[];
  setItems: React.Dispatch<React.SetStateAction<LineItem[]>>;
  unitLabel?: string;
}

export function LineItems({ items, setItems, unitLabel = "単価" }: LineItemsProps) {
  const add = () => setItems(x => [...x, { id: Date.now() + Math.random(), name: ITEM_OPTS[0], qty: 10, price: 1500 }]);
  const patch = (id: number, p: Partial<LineItem>) => setItems(x => x.map(i => i.id === id ? { ...i, ...p } : i));
  const rm = (id: number) => setItems(x => x.filter(i => i.id !== id));
  
  const total = items.reduce((a, i) => a + i.qty * i.price, 0);
  const tax = Math.round(total * getTaxRate());

  return (
    <div>
      <div className="border border-slate-200 rounded-md overflow-hidden bg-white">
        <div className="grid grid-cols-[1fr_70px_96px_96px_32px] gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase">
          <span>品目</span>
          <span className="text-center">数量</span>
          <span className="text-right">{unitLabel}</span>
          <span className="text-right">金額</span>
          <span />
        </div>
        
        {items.map(it => (
          <div key={it.id} className="grid grid-cols-[1fr_70px_96px_96px_32px] gap-2 px-3 py-2 border-b border-slate-100 items-center last:border-0">
            <SelectInput
              value={it.name}
              onChange={e => patch(it.id, { name: e.target.value })}
              options={ITEM_OPTS}
              className="h-8 py-0 px-2 text-xs"
            />
            <TextInput
              type="number"
              min="1"
              value={it.qty}
              onChange={e => patch(it.id, { qty: Math.max(1, parseInt(e.target.value) || 1) })}
              className="h-8 py-0 px-1 text-center font-mono text-xs"
            />
            <TextInput
              type="number"
              min="0"
              value={it.price}
              onChange={e => patch(it.id, { price: Math.max(0, parseInt(e.target.value) || 0) })}
              className="h-8 py-0 px-2 text-right font-mono text-xs"
            />
            <span className="text-right font-bold font-mono text-xs text-slate-800">
              ¥{(it.qty * it.price).toLocaleString("ja-JP")}
            </span>
            <button
              onClick={() => rm(it.id)}
              className="text-slate-400 hover:text-red-500 flex items-center justify-center cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">delete</span>
            </button>
          </div>
        ))}
        
        {items.length === 0 && (
          <div className="py-4 text-center text-xs font-semibold text-slate-400">
            品目を追加してください
          </div>
        )}
      </div>

      <button
        onClick={add}
        className="mt-2.5 inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-dashed border-slate-300 bg-white hover:bg-slate-50 text-blue-600 font-bold text-xs cursor-pointer active:scale-95 transition-transform"
      >
        <span className="material-symbols-outlined text-[15px]">add</span>
        品目を追加
      </button>

      <div className="mt-4 ml-auto w-[220px]">
        {[
          ["小計", total],
          [`消費税 (${Math.round(getTaxRate() * 100)}%)`, tax],
          ["合計", total + tax]
        ].map(([l, v], i) => (
          <div
            key={l}
            className={`flex justify-between py-1.5 ${
              i === 2 ? "border-t-2 border-slate-300 font-extrabold text-sm text-blue-700" : "border-t border-slate-100 text-xs text-slate-500 font-medium"
            }`}
          >
            <span>{l}</span>
            <span className="font-mono">¥{(v as number).toLocaleString("ja-JP")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface DocDrawerProps {
  open: boolean;
  kind: keyof typeof DOC_META | null;
  onClose: () => void;
  onCreate?: (doc: any) => void;
  presetCustomer?: string;
  presetItems?: LineItem[];
}

export default function AdminDocDrawer({
  open,
  kind,
  onClose,
  onCreate,
  presetCustomer = "",
  presetItems
}: DocDrawerProps) {
  const m = kind ? DOC_META[kind] : DOC_META["rental-contract"];
  const [customer, setCustomer] = useState(presetCustomer);
  const [site, setSite] = useState("");
  const [d1, setD1] = useState("");
  const [d2, setD2] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [note, setNote] = useState("");
  // レンタル契約登録時の初期ステータス（既存稼働中の登録 or 新規手配）。
  const [rentalStatus, setRentalStatus] = useState<"レンタル中" | "確認済み">("レンタル中");
  // 伝票番号は「開いた時に一度だけ」採番する。以前はレンダー毎に Math.random() で再計算され、
  // 入力中に番号が変わり、3桁乱数(900通り)で衝突して onCreate の id 重複(上書き)を起こしていた。
  const [docNo, setDocNo] = useState("");

  const vendorsCol = useAdminCollection("vendors");
  const { users } = useUser();
  const { products } = useProducts();
  // 顧客 = client_company ユーザー（"customers" ストアは存在せず常に空だった）。会社名で重複排除。
  const customerCompanies = React.useMemo(
    () => Array.from(new Set((users || []).filter((u: any) => u && u.companyType === "client_company").map((u: any) => u.companyName).filter(Boolean))),
    [users],
  );

  useEffect(() => {
    if (open) {
      setCustomer(presetCustomer || "");
      setSite("");
      
      // Default to the last day of the current calendar month for invoice dates
      if (kind === "rental-invoice" || kind === "sale-invoice") {
        const d = new Date();
        const lastDayThisMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        const y1 = lastDayThisMonth.getFullYear();
        const m1 = String(lastDayThisMonth.getMonth() + 1).padStart(2, "0");
        const d1Day = String(lastDayThisMonth.getDate()).padStart(2, "0");
        setD1(`${y1}-${m1}-${d1Day}`);

        // Default payment deadline to the last day of the next month (翌月末払い)
        const lastDayNextMonth = new Date(d.getFullYear(), d.getMonth() + 2, 0);
        const y2 = lastDayNextMonth.getFullYear();
        const m2 = String(lastDayNextMonth.getMonth() + 1).padStart(2, "0");
        const d2Day = String(lastDayNextMonth.getDate()).padStart(2, "0");
        setD2(`${y2}-${m2}-${d2Day}`);
      } else {
        setD1("");
        setD2("");
      }

      setItems(
        presetItems || [
          { id: 1, name: ITEM_OPTS[0], qty: 10, price: 1500 }
        ]
      );
      setNote("");
      // 開いた時に一度だけ採番（ミリ秒タイムスタンプ下6桁で衝突回避。表示中は固定）。
      setDocNo(m.code + "-" + String(Date.now()).slice(-6));
    }
  }, [open, kind, presetCustomer, presetItems]);

  if (!kind) return null;
  const isRepair = kind === "repair";

  const submit = () => {
    // 修理依頼は対象保安品・修理業者が必須（空のまま「一般顧客」で登録されるのを防ぐ）。
    if (isRepair && (!customer || !site)) {
      triggerToast("対象保安品・修理業者を選択してください", "warn");
      return;
    }
    // 品目ゼロでの契約/請求の作成を禁止（消費側で商品の無い注文が生成されるのを防ぐ）。修理は対象品で別途検証済み。
    if (!isRepair && items.length === 0) {
      triggerToast("品目を1件以上追加してください", "warn");
      return;
    }
    triggerToast(m.done + "（" + docNo + "）", "ok");
    if (onCreate) {
      onCreate({
        id: docNo,
        kind,
        customer: customer || "一般顧客",
        site: site || "—",
        items: items.length,
        lineItems: items, // 実際の明細（消費側で注文/請求の生成に使う）
        amount: items.reduce((a, i) => a + i.qty * i.price, 0) * (1 + getTaxRate()),
        date: d1 || new Date().toISOString().split("T")[0],
        dateStart: d1 || "",
        dateEnd: d2 || "",
        // レンタル契約はユーザー選択のステータスで登録（既存稼働中 or 手配中）。
        status: kind === "rental-contract" ? rentalStatus : (isRepair ? "修理待ち" : "進行中"),
      });
    }
    onClose();
  };

  const saveDraft = () => {
    triggerToast("下書きを保存しました", "info");
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={m.title}
      sub={m.sub}
      width={620}
      footer={
        <>
          <Btn variant="ghost" onClick={saveDraft}>下書き保存</Btn>
          <Btn variant="primary" icon="check" onClick={submit}>{m.cta}</Btn>
        </>
      }
    >
      <div className="flex items-center gap-2 px-3 py-2.5 bg-blue-50/50 rounded-lg border border-blue-100/50 mb-5">
        <span className="material-symbols-outlined text-[18px] text-blue-600">article</span>
        <span className="font-bold text-xs text-blue-700">伝票番号</span>
        <span className="ml-auto font-bold font-mono text-sm text-blue-700">{docNo}</span>
      </div>

      <FormSection title={isRepair ? "対象・業者" : "取引先"}>
        {isRepair ? (
          <Row>
            <Field label="対象保安品" required>
              <SelectInput
                value={customer}
                onChange={e => setCustomer(e.target.value)}
                options={["", ...products.map((p: any) => p.name)].map(v => ({ v, l: v || "選択してください" }))}
              />
            </Field>
            <Field label="修理業者" required>
              <SelectInput
                value={site}
                onChange={e => setSite(e.target.value)}
                options={["", ...vendorsCol.rows.map(v => v.name)].map(v => ({ v, l: v || "選択してください" }))}
              />
            </Field>
          </Row>
        ) : (
          <Row>
            <Field label="顧客" required>
              <SelectInput
                value={customer}
                onChange={e => setCustomer(e.target.value)}
                options={["", ...customerCompanies].map(v => ({ v, l: v || "選択してください" }))}
              />
            </Field>
            <Field label="現場 / 工事名">
              <TextInput
                value={site}
                onChange={e => setSite(e.target.value)}
                placeholder="例：品川駅前再開発 B工区"
              />
            </Field>
          </Row>
        )}
        <Row>
          <Field label={m.dateLabels[0]} required>
            <TextInput type="date" value={d1} onChange={e => setD1(e.target.value)} />
          </Field>
          {m.dateLabels[1] && (
            <Field label={m.dateLabels[1]}>
              <TextInput type="date" value={d2} onChange={e => setD2(e.target.value)} />
            </Field>
          )}
        </Row>
        {kind === "rental-contract" && (
          <Field label="登録ステータス">
            <SelectInput
              value={rentalStatus}
              onChange={e => setRentalStatus(e.target.value as "レンタル中" | "確認済み")}
              options={[
                { v: "レンタル中", l: "レンタル中（既に納品済み・稼働中の契約）" },
                { v: "確認済み", l: "確認済み（これから配送手配する）" },
              ]}
            />
          </Field>
        )}
      </FormSection>

      <FormSection title={isRepair ? "不具合内容" : "品目"}>
        {isRepair ? (
          <Field label="不具合・修理内容" required>
            <TextArea
              rows={3}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="例：脚部の溶接破損。3点。"
            />
          </Field>
        ) : (
          <LineItems items={items} setItems={setItems} unitLabel={m.unit} />
        )}
      </FormSection>

      {!isRepair && (
        <FormSection title="備考">
          <Field label="メモ（任意）">
            <TextArea
              rows={2}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="特記事項があれば入力"
            />
          </Field>
        </FormSection>
      )}
    </Drawer>
  );
}
