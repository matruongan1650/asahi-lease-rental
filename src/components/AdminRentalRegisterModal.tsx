import React, { useEffect, useMemo, useState } from "react";
import { Modal, Btn, Field, Row, SelectInput, TextInput, triggerToast } from "./AdminUI";
import { useUser } from "../context/UserContext";
import { useProducts } from "../context/ProductContext";
import { calculateRentalPrice, computeGuaranteeFeeFlat } from "../utils/billing";
import { isVehicleCategory, getItemUnit } from "../utils/productUtils";
import ProductCombobox from "./ProductCombobox";

/**
 * AdminRentalRegisterModal — 既存/進行中のレンタル契約を「完全な注文」として登録するフォーム。
 * 顧客（client_company ユーザー）と商品マスタに連携し、会社・担当者・連絡先・単価・単位・保証料を
 * 自動で引き込む。送信時に各明細の課金（calculateRentalPrice）と保証料を計算した完全な注文ドラフトを
 * onCreate に渡す（在庫出庫・請求ブロック生成・保存は呼び出し側で実施）。
 */
type Line = { key: number; productId: string; qty: number };

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (draft: any) => void;
}

export default function AdminRentalRegisterModal({ open, onClose, onCreate }: Props) {
  const { users } = useUser();
  const { products } = useProducts();

  // 顧客 = client_company ユーザー。会社ごとにグルーピング。
  const customerUsers = useMemo(
    () => (users || []).filter((u: any) => u && u.companyType === "client_company"),
    [users],
  );
  const companies = useMemo(
    () => Array.from(new Set(customerUsers.map((u: any) => u.companyName).filter(Boolean))),
    [customerUsers],
  );
  // レンタル可能な商品（rentPrice > 0）。
  const rentables = useMemo(
    () => (products || []).filter((p: any) => p && Number(p.rentPrice) > 0),
    [products],
  );
  const productById = (id: string) => (products || []).find((p: any) => p && p.id === id);

  const [companyName, setCompanyName] = useState("");
  const [personUserId, setPersonUserId] = useState("");
  const [siteName, setSiteName] = useState("");
  const [constructionNumber, setConstructionNumber] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [rentalStartDate, setRentalStartDate] = useState("");
  const [rentalEndDate, setRentalEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<string>("レンタル中");
  const [lines, setLines] = useState<Line[]>([]);

  useEffect(() => {
    if (open) {
      setCompanyName(""); setPersonUserId(""); setSiteName(""); setConstructionNumber("");
      setDeliveryLocation(""); setDeliveryDate(""); setRentalStartDate(""); setRentalEndDate("");
      setNotes(""); setStatus("レンタル中");
      setLines([{ key: 1, productId: rentables[0]?.id || "", qty: 1 }]);
    }
    // rentables は products 由来。open 時の初期1行のためだけに参照（依存に入れると毎回リセットされるので除外）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 会社の担当者（contacts）。
  const contacts = useMemo(
    () => customerUsers.filter((u: any) => u.companyName === companyName),
    [customerUsers, companyName],
  );

  const onCompanyChange = (name: string) => {
    setCompanyName(name);
    const list = customerUsers.filter((u: any) => u.companyName === name);
    const first = list[0];
    setPersonUserId(first?.id || "");
    // 納品先が未入力なら会社/担当者の住所を初期値に。
    if (!deliveryLocation && first?.address) setDeliveryLocation(first.address);
  };
  const onPersonChange = (id: string) => {
    setPersonUserId(id);
    const u = customerUsers.find((x: any) => x.id === id);
    if (u && (!deliveryLocation || deliveryLocation.trim() === "") && u.address) setDeliveryLocation(u.address);
  };

  const addLine = () => setLines((ls) => [...ls, { key: Date.now(), productId: rentables[0]?.id || "", qty: 1 }]);
  const rmLine = (key: number) => setLines((ls) => ls.filter((l) => l.key !== key));
  const patchLine = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const validLines = lines.filter((l) => l.productId && Number(l.qty) > 0);
  // 在庫チェック: 登録時に deductOrderStock で在庫を引くため、在庫が足りない品目があれば登録不可にする。
  // 同一商品が複数行でも合算した要求数量で判定する。
  const requestedByProduct: Record<string, number> = {};
  validLines.forEach((l) => { requestedByProduct[l.productId] = (requestedByProduct[l.productId] || 0) + (Number(l.qty) || 0); });
  const stockShortProductIds = Object.keys(requestedByProduct).filter((pid) => {
    const p = productById(pid);
    return p && requestedByProduct[pid] > Number(p.stock || 0);
  });
  // 返却済/完了 は「過去契約の記録」として登録し在庫を出庫しないため、在庫不足でも登録を妨げない。
  const CLOSED_REG_STATUSES = ["返却済", "完了"];
  const deductsStock = !CLOSED_REG_STATUSES.includes(status);
  const hasStockShortage = deductsStock && stockShortProductIds.length > 0;
  const canSubmit = !!companyName && !!personUserId && !!rentalStartDate && !!rentalEndDate
    && rentalEndDate >= rentalStartDate && validLines.length > 0 && !hasStockShortage;

  const submit = () => {
    if (hasStockShortage) {
      const names = stockShortProductIds.map((pid) => productById(pid)?.name).filter(Boolean).join("、");
      triggerToast(`在庫が不足しているため登録できません：${names}。数量を減らすか先に入庫してください。`, "err");
      return;
    }
    if (!canSubmit) {
      triggerToast("会社・担当者・レンタル期間・品目を入力してください", "warn");
      return;
    }
    const person = customerUsers.find((u: any) => u.id === personUserId);
    const hasVehicle = validLines.some((l) => {
      const p = productById(l.productId);
      return p && isVehicleCategory(p.category);
    });
    const items = validLines.map((l) => {
      const p: any = productById(l.productId) || {};
      const qty = Number(l.qty) || 0;
      const { totalPrice, breakdown, totalBilledDays, totalActualDays } = calculateRentalPrice(
        Number(p.rentPrice) || 0, rentalStartDate, rentalEndDate, hasVehicle, isVehicleCategory(p.category), p.rentPriceLongTerm,
      );
      return {
        id: p.id,
        name: p.name,
        image: p.image,
        type: "rent" as const,
        category: p.category,
        unit: p.unit,
        rentPrice: p.rentPrice,
        rentPriceLongTerm: p.rentPriceLongTerm,
        quantity: qty,
        calculatedPrice: totalPrice,
        monthlyBreakdown: breakdown,
        rentalDays: totalActualDays,
        billedDays: totalBilledDays,
        guaranteeFeeFlat: computeGuaranteeFeeFlat(p, qty),
      };
    });

    onCreate({
      companyName,
      personName: `${person?.lastName || ""} ${person?.firstName || ""}`.trim() || person?.companyName || "",
      personLastName: person?.lastName,
      personFirstName: person?.firstName,
      userId: person?.id,
      userEmail: person?.email,
      userPhone: person?.phone,
      siteName,
      constructionNumber,
      deliveryLocation,
      deliveryDate,
      rentalStartDate,
      rentalEndDate,
      notes,
      status,
      items,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="レンタル契約を登録（既存・進行中の契約を管理対象に追加）"
      width={680}
      footer={<><Btn variant="secondary" onClick={onClose}>キャンセル</Btn><Btn variant="primary" icon="check" onClick={submit} disabled={!canSubmit}>登録する</Btn></>}
    >
      <div className="space-y-4">
        {/* 顧客・担当者（顧客マスタ連携） */}
        <Row>
          <Field label="顧客（会社）" required>
            <SelectInput
              value={companyName}
              onChange={(e) => onCompanyChange(e.target.value)}
              options={["", ...companies].map((c) => ({ v: c, l: c || "選択してください" }))}
            />
          </Field>
          <Field label="ご担当者" required hint={contacts.length === 0 ? "会社を選択すると候補が出ます" : undefined}>
            <SelectInput
              value={personUserId}
              onChange={(e) => onPersonChange(e.target.value)}
              options={[{ v: "", l: "選択してください" }, ...contacts.map((u: any) => ({ v: u.id, l: `${u.lastName || ""} ${u.firstName || ""}`.trim() || u.email || u.id }))]}
            />
          </Field>
        </Row>
        {personUserId && (() => {
          const u: any = customerUsers.find((x: any) => x.id === personUserId);
          if (!u) return null;
          return (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 flex flex-wrap gap-x-5 gap-y-1">
              <span>📧 {u.email || "—"}</span>
              <span>📞 {u.phone || "—"}</span>
              <span>🏢 {u.address || "—"}</span>
            </div>
          );
        })()}

        {/* 現場・工事 */}
        <Row>
          <Field label="現場名"><TextInput value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="例：品川駅前再開発 B工区" /></Field>
          <Field label="工事番号"><TextInput value={constructionNumber} onChange={(e) => setConstructionNumber(e.target.value)} placeholder="例：K-2026-014" /></Field>
        </Row>
        <Field label="納品先住所"><TextInput value={deliveryLocation} onChange={(e) => setDeliveryLocation(e.target.value)} placeholder="顧客を選ぶと住所が初期入力されます" /></Field>

        {/* 日付 */}
        <Row cols={3}>
          <Field label="納品日"><TextInput type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} /></Field>
          <Field label="レンタル開始日" required><TextInput type="date" value={rentalStartDate} onChange={(e) => setRentalStartDate(e.target.value)} /></Field>
          <Field label="レンタル終了日" required><TextInput type="date" value={rentalEndDate} onChange={(e) => setRentalEndDate(e.target.value)} /></Field>
        </Row>

        {/* 品目（商品マスタ連携） */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">品目（商品マスタから選択 → 単価・単位・保証料を自動連携）</span>
            <Btn size="sm" icon="add" onClick={addLine}>品目を追加</Btn>
          </div>
          <div className="space-y-2">
            {lines.map((l) => {
              const p: any = productById(l.productId);
              return (
                <div key={l.key} className="rounded-lg border border-slate-200 bg-white p-2">
                  {/* 入力行: 単価ヒントを行外に出すことで、数量・単位・削除が商品名入力と水平に揃う（items-end のズレ防止）。 */}
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <ProductCombobox
                        products={rentables}
                        value={p ? p.name : ""}
                        onPick={(prod) => patchLine(l.key, { productId: prod.id })}
                        placeholder="商品名で検索 / 一覧から選択"
                      />
                    </div>
                    <div className="w-24">
                      <TextInput type="number" min="1" value={l.qty} onChange={(e) => patchLine(l.key, { qty: Math.max(1, parseInt(e.target.value) || 1) })} />
                    </div>
                    <span className="pb-2 text-xs font-bold text-slate-500 w-6 text-center">{p ? getItemUnit(p) : ""}</span>
                    <button onClick={() => rmLine(l.key)} disabled={lines.length <= 1} className="mb-0.5 w-9 h-9 grid place-items-center rounded-lg border border-slate-200 text-slate-400 hover:text-rose-500 disabled:opacity-30">
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                  {p && (() => {
                    const stock = Number(p.stock || 0);
                    const requested = requestedByProduct[l.productId] || 0;
                    const short = requested > stock;
                    return (
                      <div className={`mt-1 text-[11px] ${short ? "text-rose-600 font-bold" : "text-slate-400"}`}>
                        ¥{Number(p.rentPrice).toLocaleString()}/日{p.rentPriceLongTerm ? `・長期 ¥${Number(p.rentPriceLongTerm).toLocaleString()}/日` : ""}{p.isGuarantee ? "・保証料あり" : ""}
                        <span className="ml-1">・ 在庫 {stock}点</span>
                        {short && <span className="ml-1">⚠ 在庫不足（要求 {requested}点 / 残 {stock}点）</span>}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>

        {hasStockShortage && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2.5 text-xs font-bold text-rose-700 flex items-start gap-2">
            <span className="material-symbols-outlined text-[16px] mt-px">warning</span>
            <span>在庫が不足している品目があるため登録できません（登録時に在庫から出庫されます）。数量を減らすか、先に入庫してください。</span>
          </div>
        )}

        {/* ステータス・備考 */}
        <Row>
          <Field label="登録ステータス" required>
            <SelectInput
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={[
                { v: "確認済み", l: "確認済み（これから配送手配）" },
                { v: "レンタル中", l: "レンタル中（既に納品済み・稼働中）" },
                { v: "回収予定", l: "回収予定（回収手配済み・稼働中）" },
                { v: "検品待ち", l: "検品待ち（回収済み・倉庫検品待ち）" },
                { v: "返却済", l: "返却済（返却完了・過去契約の記録／在庫は動かしません）" },
                { v: "完了", l: "完了（取引完了・過去契約の記録／在庫は動かしません）" },
              ]}
            />
          </Field>
          <Field label="備考"><TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="任意" /></Field>
        </Row>
      </div>
    </Modal>
  );
}
