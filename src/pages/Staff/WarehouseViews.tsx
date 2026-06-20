import React, { useState, useEffect, useRef } from "react";
import Icon from "../../components/staff/Icon";
import { usePagedList } from "../../hooks/usePagedList";
import {
  TopBar,
  IconBtn,
  Badge,
  Btn,
  Card,
  SectionLabel,
  Stepper,
  ProgressBar,
  ItemRow,
  Sheet,
  QtyStepper,
  NumStepper,
  DamageReportSheet,
  reportQty,
  reportPhotos,
  REASON_ICON,
  statusVariant,
  Empty,
  PhotoTile,
  PhotoCaptureButton,
  makePhoto,
  Overline,
  MetricCard,
  SegmentControl,
  formatCount
} from "../../components/staff/StaffUI";
import ProductQrScanner from "../../components/staff/ProductQrScanner";
import { useMobileLive, pushFieldReportsLocal, STAFF, daysUntil } from "../../context/MobileLiveContext";
import { getProductQrCode } from "../../utils/productQr";
import { confirmDialog } from "../../components/AppDialog";

/** ファイル(画像/PDF)を dataURL 文字列で読み込む（車検証・自賠責・修理レシート等の添付用）。 */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });
}

function ItemThumb({ src, icon, size = 42, radius = 11, bg, col }: { src?: string | null; icon: string; size?: number; radius?: number; bg?: string; col?: string }) {
  const [err, setErr] = React.useState(false);
  const bgFinal = bg || "var(--surface-3)";
  const colFinal = col || "var(--fg-muted)";
  if (src && !err) {
    return (
      <div style={{ width: size, height: size, borderRadius: radius, overflow: "hidden", flexShrink: 0, background: bgFinal }}>
        <img src={src} alt="" onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: radius, background: bgFinal, color: colFinal, display: "grid", placeItems: "center", flexShrink: 0 }}>
      <Icon name={icon} size={Math.round(size * 0.52)} />
    </div>
  );
}

export const isVehicle = (p: any) => {
  if (!p) return false;
  const name = p.name || "";
  const cat = p.category || "";
  return cat.includes("車両") || name.includes("エルフ") || name.includes("デュトロ") || name.includes("ハイエース") || name.includes("キャンター");
};

// ---------------------------------------------------------------------------
// 1. Vehicle Detail Sub-View (referenced from vehicle.jsx)
// ---------------------------------------------------------------------------

function VRow({ label, value, mono, danger, last }: any) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14, padding: "10px 0", borderTop: last ? "none" : "1px solid var(--border)" }}>
      <span style={{ fontSize: 13, color: "var(--fg-muted)", fontWeight: 600, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: danger ? "var(--danger-bright)" : "var(--fg)", fontFamily: mono ? "var(--font-mono)" : "var(--font-jp)", textAlign: "right", wordBreak: mono ? "normal" : "break-word", whiteSpace: mono ? "nowrap" : "normal" }}>{value}</span>
    </div>
  );
}

function VFile({ name, dataUrl }: { name?: string; dataUrl?: string }) {
  if (!name) return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 12px", borderRadius: 10, background: "var(--surface-2)", border: "1px dashed var(--border-strong)", color: "var(--fg-subtle)", fontSize: 12.5, fontWeight: 700 }}>
      <Icon name="paperclip" size={14} />ファイル未登録
    </div>
  );
  const style: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 10, background: "var(--brand-tint)", border: "1px solid transparent", color: "var(--brand-accent)", fontSize: 12.5, fontWeight: 700, cursor: "pointer", maxWidth: "100%", fontFamily: "var(--font-jp)", textDecoration: "none" };
  const inner = (
    <>
      <Icon name="fileCheck" size={15} style={{ flexShrink: 0 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
      <Icon name="download" size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
    </>
  );
  // dataURL がある添付（スタッフが撮影/選択した実ファイル）はダウンロード可能なリンクにする。
  return dataUrl
    ? <a href={dataUrl} download={name} target="_blank" rel="noreferrer" style={style}>{inner}</a>
    : <button style={style}>{inner}</button>;
}

function VSubCard({ title, icon, badge, children }: any) {
  return (
    <Card pad={14} style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: "var(--surface-3)", color: "var(--brand-accent)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name={icon} size={17} /></div>
        <span style={{ flex: 1, fontSize: 14.5, fontWeight: 800, color: "var(--fg)" }}>{title}</span>
        {badge}
      </div>
      {children}
    </Card>
  );
}

function VAlert({ variant, icon, title, sub }: any) {
  const c = { danger: "var(--danger-bright)", warning: "var(--warning-bright)", info: "var(--brand-accent)" }[variant as "danger"|"warning"|"info"];
  const bg = { danger: "var(--danger-tint)", warning: "var(--warning-tint)", info: "var(--brand-tint)" }[variant as "danger"|"warning"|"info"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, padding: 12, borderRadius: 12, background: bg, border: `1px solid ${c}`, marginBottom: 8 }}>
      <Icon name={icon} size={19} color={c} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--fg)" }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 1 }}>{sub}</div>
      </div>
    </div>
  );
}

// 次回車検の「正準日付」と「残日数」。車検を記録すると shaken.next / nextInspectionDate が更新されるが、
// 旧 inspectionDate が残る端末データがある。表示日付と残日数を必ず同じ日付から算出して
// 「次回車検 2026/06/12 ・ 残り 730日」のような不整合（過去日なのに残日数が巨大）を防ぐ。
// 残日数はストアの古いスナップショットではなく daysUntil で当日基準に再計算する。
function shakenInfo(v: any): { date: string; days: number } {
  const date = v.shaken?.next || v.nextInspectionDate || v.inspectionDate || v.next || "";
  const live = daysUntil(date);
  return { date, days: live == null ? (v.days ?? v.inspectionDaysRemaining ?? 0) : live };
}

function vehicleAlerts(v: any) {
  const a = [];
  const { date: shakenDate, days: d } = shakenInfo(v);
  if (d < 0) a.push({ variant: "danger", icon: "car", title: "車検が期限切れです", sub: `${-d}日超過 ・ 至急対応（${shakenDate}）` });
  else if (d <= 7) a.push({ variant: "danger", icon: "car", title: "車検期限まで7日以内", sub: `残り${d}日（${shakenDate}）` });
  else if (d <= 30) a.push({ variant: "warning", icon: "car", title: "車検期限が近づいています（30日前）", sub: `残り${d}日（${shakenDate}）` });
  else if (d <= 90) a.push({ variant: "warning", icon: "car", title: "車検（90日前のお知らせ）", sub: `残り${d}日（${shakenDate}）` });

  const jbExpiry = v.jibaiseki?.expiry || v.insuranceDate;
  const jb = daysUntil(jbExpiry);
  if (jb !== null && jb <= 30) a.push({ variant: jb < 0 ? "danger" : "warning", icon: "shield", title: jb < 0 ? "自賠責保険が失効しています" : "自賠責保険の満期が近づいています", sub: `満期 ${jbExpiry}（${jb < 0 ? `${-jb}日超過` : `残り${jb}日`}）` });
  
  // 未設定の車両に幽霊アラートを出さないため、既定日は使わない（フィールドが無ければ null → アラートなし）。
  const nnExpiry = v.nini?.expiry;
  const nn = nnExpiry ? daysUntil(nnExpiry) : null;
  if (nn !== null && nn <= 30) a.push({ variant: nn < 0 ? "danger" : "warning", icon: "shield", title: nn < 0 ? "任意保険が失効しています" : "任意保険の満期が近づいています", sub: `満期 ${nnExpiry}（${nn < 0 ? `${-nn}日超過` : `残り${nn}日`}）` });

  if (v.tax && !v.tax.paid) a.push({ variant: "warning", icon: "yen", title: "自動車税が未払いです", sub: `${v.tax.year || "2026"} ・ 納付期限を確認してください` });

  const oilDate = v.nextOil?.date;
  const oil = oilDate ? daysUntil(oilDate) : null;
  if (oil !== null && oil <= 7) a.push({ variant: oil < 0 ? "danger" : "warning", icon: "droplet", title: oil < 0 ? "オイル交換が予定日を過ぎています" : "オイル交換の時期です", sub: `予定 ${oilDate} / ${v.nextOil?.km || ""}` });

  return a;
}

export function VehicleDetail({ v, onBack, onRecordShaken, onUpdate, onSetStatus, staffName }: any) {
  const [tab, setTab] = useState("info");
  const [shNextInput, setShNextInput] = useState(""); // 法的タブの次回車検日入力
  const [editLegal, setEditLegal] = useState(false); // 保険・税・走行距離の編集モード
  const [legalDraft, setLegalDraft] = useState<any>({});
  const [addMnt, setAddMnt] = useState(false);
  const [mItem, setMItem] = useState("");
  const [mKm, setMKm] = useState("");
  const [addRep, setAddRep] = useState(false);
  const [rTitle, setRTitle] = useState("");
  const [rShop, setRShop] = useState("");
  const [rCost, setRCost] = useState("");
  const [rReceipt, setRReceipt] = useState<{ name: string; dataUrl: string } | null>(null);
  const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`; })();
  const saveMnt = () => {
    if (!mItem.trim() || !onUpdate) return;
    const rec = { id: "MNT-" + Date.now(), date: todayStr, item: mItem.trim(), km: mKm.trim(), mileage: mKm.trim(), by: staffName || "" };
    // 表示が読む既存フィールド（maint 優先, 無ければ maintenanceHistory）に書き戻す。
    const mKey = v.maint ? "maint" : "maintenanceHistory";
    onUpdate({ [mKey]: [rec, ...(v[mKey] || [])] });
    setMItem(""); setMKm(""); setAddMnt(false);
  };
  const saveRep = () => {
    if (!rTitle.trim() || !onUpdate) return;
    const rec = { id: "REP-" + Date.now(), date: todayStr, content: rTitle.trim(), title: rTitle.trim(), garage: rShop.trim(), shop: rShop.trim(), cost: Number(rCost) || 0, by: staffName || "", file: rReceipt?.name || "", receipt: rReceipt?.name || "", receiptUrl: rReceipt?.dataUrl || "" };
    const rKey = v.repair ? "repair" : "repairHistory";
    onUpdate({ [rKey]: [rec, ...(v[rKey] || [])] });
    setRTitle(""); setRShop(""); setRCost(""); setRReceipt(null); setAddRep(false);
  };
  // 法的タブ（保険・税・走行距離）の編集を開始: 現在値で draft を初期化。
  const openLegalEdit = () => {
    setTab("legal");
    setLegalDraft({
      mileage: v.mileage || "",
      jbExpiry: v.jibaiseki?.expiry || v.insuranceDate || "",
      jbPolicy: v.jibaiseki?.policyNo || "",
      nnCompany: v.nini?.company || "",
      nnPolicy: v.nini?.policyNo || "",
      nnExpiry: v.nini?.expiry || "",
      taxYear: v.tax?.year || "",
      taxPaid: !!v.tax?.paid,
    });
    setEditLegal(true);
  };
  const saveLegal = () => {
    if (!onUpdate) { setEditLegal(false); return; }
    onUpdate({
      mileage: legalDraft.mileage || v.mileage,
      jibaiseki: { ...(v.jibaiseki || {}), expiry: legalDraft.jbExpiry || undefined, policyNo: legalDraft.jbPolicy || undefined },
      nini: { ...(v.nini || {}), company: legalDraft.nnCompany || undefined, policyNo: legalDraft.nnPolicy || undefined, expiry: legalDraft.nnExpiry || undefined },
      tax: { ...(v.tax || {}), year: legalDraft.taxYear || undefined, paid: !!legalDraft.taxPaid },
    });
    setEditLegal(false);
  };
  const legalInputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", border: "1px solid var(--border-2)", borderRadius: 10, padding: "9px 11px", fontSize: 13.5, fontWeight: 700, color: "var(--fg)", background: "var(--surface)", outline: "none", fontFamily: "var(--font-jp)" };
  const alerts = vehicleAlerts(v);
  const { date: shNext, days: shDays } = shakenInfo(v);
  const shakenColor = shDays < 0 ? "var(--danger-bright)" : shDays <= 30 ? "var(--warning-bright)" : "var(--success-bright)";

  const TABS = [["info", "基本"], ["legal", "法的"], ["history", "履歴"], ["docs", "資料"]];

  let body = null;

  if (tab === "info") {
    body = (
      <>
        {alerts.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <Overline style={{ marginBottom: 9 }}>自動アラート（{alerts.length}）</Overline>
            {alerts.map((al, i) => <VAlert key={i} {...al} />)}
          </div>
        )}
        <SectionLabel>基本情報</SectionLabel>
        <Card pad={14} style={{ paddingBottom: 12 }}>
          <VRow label="車両番号" value={v.plate} mono />
          <VRow label="メーカー" value={v.maker || v.manufacturer} />
          <VRow label="車種・モデル" value={v.model || v.name} />
          <VRow label="年式" value={v.year} />
          <VRow label="車体色" value={v.color} />
          <VRow label="車台番号" value={v.vin} mono />
          <VRow label="原動機型式" value={v.engineNo || v.engineModel} mono />
          <VRow label="購入日" value={v.buyDate || v.purchaseDate} mono />
          <VRow label="購入価格" value={v.buyPrice || v.purchasePrice} mono />
          <VRow label="走行距離" value={v.mileage} mono />
          <VRow label="状態" value={<Badge variant={statusVariant(v.status)}>{v.status}</Badge>} last />
        </Card>

        <div style={{ height: 6 }} />
        <SectionLabel>稼働状態の変更</SectionLabel>
        <Card pad={12}>
          <div style={{ display: "flex", gap: 8 }}>
            {["使用中", "空車", "整備中"].map((s) => (
              <button key={s} onClick={() => v.status !== s && (onSetStatus ? onSetStatus(s) : (onUpdate && onUpdate({ status: s })))} disabled={v.status === s}
                style={{ flex: 1, padding: "10px 6px", borderRadius: 12, border: "1px solid " + (v.status === s ? "var(--brand-accent)" : "var(--border)"), background: v.status === s ? "var(--brand-tint)" : "var(--surface)", color: v.status === s ? "var(--brand-accent)" : "var(--fg-muted)", fontSize: 13, fontWeight: 800, cursor: v.status === s ? "default" : "pointer", fontFamily: "var(--font-jp)" }}>
                {s}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 11.5, color: "var(--fg-muted)", margin: "9px 2px 0", lineHeight: 1.5 }}>整備に入れる/戻す等、稼働状態をこの場で更新できます（admin と同期）。</p>
        </Card>
      </>
    );
  }

  if (tab === "legal") {
    const jbExpiry = v.jibaiseki?.expiry || v.insuranceDate;
    const nnExpiry = v.nini?.expiry;
    const jb = jbExpiry ? daysUntil(jbExpiry) : null, nn = nnExpiry ? daysUntil(nnExpiry) : null;
    const shakenDays = shDays;
    // body に代入してメイン return（TopBar・次回車検サマリ・タブ切替）と一緒に描画する。
    // 以前は early return していたため、法的タブを開くとヘッダー・タブ・戻るが消えて戻れなくなっていた。
    body = (
      <>
        <SectionLabel right={
          editLegal
            ? <button onClick={saveLegal} style={{ background: "none", border: "none", color: "var(--success-bright)", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "var(--font-jp)" }}>保存</button>
            : <button onClick={openLegalEdit} style={{ background: "none", border: "none", color: "var(--brand-accent)", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "var(--font-jp)" }}>編集</button>
        }>車検</SectionLabel>
        <VSubCard title="自動車検査証" icon="car" badge={<Badge variant={shakenDays < 0 ? "danger" : shakenDays <= 30 ? "warning" : "success"}>{shakenDays < 0 ? `${-shakenDays}日超過` : `残り${shakenDays}日`}</Badge>}>
          <div style={{ padding: "2px 0 10px" }}>
            <VRow label="前回実施日" value={v.shaken?.last || "未登録"} mono />
            <VRow label="有効期限" value={shNext || "未登録"} mono danger={shakenDays < 0} last />
          </div>
          <VFile name={typeof v.shaken?.file === "object" ? v.shaken?.file?.name : v.shaken?.file} dataUrl={typeof v.shaken?.file === "object" ? v.shaken?.file?.dataUrl : undefined} />
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--fg-muted)", marginBottom: 5 }}>次回車検日（車検証の有効期限・未入力なら1年後）</div>
            <input type="date" value={shNextInput} onChange={e => setShNextInput(e.target.value)} style={{ ...legalInputStyle, fontFamily: "var(--font-mono)", marginBottom: 8 }} />
            <Btn full size="sm" icon="clipboardCheck" onClick={() => onRecordShaken && onRecordShaken(shNextInput)}>車検完了を記録</Btn>
          </div>
        </VSubCard>

        <div style={{ height: 6 }} />
        <SectionLabel>保険・税</SectionLabel>
        <VSubCard title="自賠責保険" icon="shield" badge={jb !== null && jb <= 30 ? <Badge variant={jb < 0 ? "danger" : "warning"}>{jb < 0 ? "失効" : `残り${jb}日`}</Badge> : null}>
          {editLegal ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "4px 0 6px" }}>
              <input value={legalDraft.jbPolicy} onChange={e => setLegalDraft((d: any) => ({ ...d, jbPolicy: e.target.value }))} placeholder="証券番号" style={legalInputStyle} />
              <div><div style={{ fontSize: 11, color: "var(--fg-muted)", fontWeight: 700, marginBottom: 4 }}>満期日</div><input type="date" value={legalDraft.jbExpiry} onChange={e => setLegalDraft((d: any) => ({ ...d, jbExpiry: e.target.value }))} style={{ ...legalInputStyle, fontFamily: "var(--font-mono)" }} /></div>
            </div>
          ) : (
            <div style={{ padding: "2px 0 10px" }}>
              <VRow label="証券番号" value={v.jibaiseki?.policyNo || "未登録"} mono />
              <VRow label="満期日" value={jbExpiry || "未登録"} mono danger={jb !== null && jb < 0} last />
            </div>
          )}
          <VFile name={typeof v.jibaiseki?.file === "object" ? v.jibaiseki?.file?.name : v.jibaiseki?.file} dataUrl={typeof v.jibaiseki?.file === "object" ? v.jibaiseki?.file?.dataUrl : undefined} />
        </VSubCard>

        <VSubCard title="任意保険" icon="shield" badge={nn !== null && nn <= 30 ? <Badge variant={nn < 0 ? "danger" : "warning"}>{nn < 0 ? "失効" : `残り${nn}日`}</Badge> : null}>
          {editLegal ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "4px 0 6px" }}>
              <input value={legalDraft.nnCompany} onChange={e => setLegalDraft((d: any) => ({ ...d, nnCompany: e.target.value }))} placeholder="保険会社" style={legalInputStyle} />
              <input value={legalDraft.nnPolicy} onChange={e => setLegalDraft((d: any) => ({ ...d, nnPolicy: e.target.value }))} placeholder="証券番号" style={legalInputStyle} />
              <div><div style={{ fontSize: 11, color: "var(--fg-muted)", fontWeight: 700, marginBottom: 4 }}>満期日</div><input type="date" value={legalDraft.nnExpiry} onChange={e => setLegalDraft((d: any) => ({ ...d, nnExpiry: e.target.value }))} style={{ ...legalInputStyle, fontFamily: "var(--font-mono)" }} /></div>
            </div>
          ) : (
            <div style={{ padding: "2px 0 10px" }}>
              <VRow label="保険会社" value={v.nini?.company || "未登録"} />
              <VRow label="証券番号" value={v.nini?.policyNo || "未登録"} mono />
              <VRow label="満期日" value={nnExpiry || "未登録"} mono danger={nn !== null && nn < 0} last />
            </div>
          )}
          <VFile name={typeof v.nini?.file === "object" ? v.nini?.file?.name : v.nini?.file} dataUrl={typeof v.nini?.file === "object" ? v.nini?.file?.dataUrl : undefined} />
        </VSubCard>

        <VSubCard title="自動車税" icon="yen" badge={<Badge variant={v.tax?.paid ? "success" : "warning"}>{v.tax?.paid ? "支払済" : "未払い"}</Badge>}>
          {editLegal ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "4px 0 6px" }}>
              <input value={legalDraft.taxYear} onChange={e => setLegalDraft((d: any) => ({ ...d, taxYear: e.target.value }))} placeholder="年度（例: 2026年度）" style={legalInputStyle} />
              <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", padding: "2px" }}>
                <input type="checkbox" checked={!!legalDraft.taxPaid} onChange={e => setLegalDraft((d: any) => ({ ...d, taxPaid: e.target.checked }))} style={{ width: 18, height: 18 }} />
                <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--fg)" }}>納付済み</span>
              </label>
            </div>
          ) : (
            <div style={{ padding: "2px 0 10px" }}>
              <VRow label="年度" value={v.tax?.year || "2026年度"} />
              <VRow label="支払状況" value={v.tax?.paid ? "納付済み" : "未納付"} danger={v.tax && !v.tax.paid} last />
            </div>
          )}
          <VFile name={typeof v.tax?.file === "object" ? v.tax?.file?.name : v.tax?.file} dataUrl={typeof v.tax?.file === "object" ? v.tax?.file?.dataUrl : undefined} />
        </VSubCard>

        {editLegal && (
          <VSubCard title="走行距離" icon="car">
            <div style={{ padding: "4px 0 6px" }}>
              <input value={legalDraft.mileage} onChange={e => setLegalDraft((d: any) => ({ ...d, mileage: e.target.value }))} placeholder="走行距離（例: 35,180 km）" style={legalInputStyle} />
            </div>
          </VSubCard>
        )}
      </>
    );
  }

  if (tab === "history") {
    const maintList = v.maint || v.maintenanceHistory || [];
    const repairList = v.repair || v.repairHistory || [];
    body = (
      <>
        <SectionLabel right={<button onClick={() => setAddMnt(a => !a)} style={{ background: "none", border: "none", color: "var(--brand-accent)", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "var(--font-jp)" }}>{addMnt ? "閉じる" : "+ 追加"}</button>}>整備・点検履歴（{maintList.length}）</SectionLabel>
        {addMnt && (
          <Card pad={12} style={{ marginBottom: 12 }}>
            <input value={mItem} onChange={e => setMItem(e.target.value)} placeholder="整備項目（例: オイル交換）" style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--border-2)", borderRadius: 11, padding: "10px 12px", fontSize: 14, fontWeight: 700, color: "var(--fg)", background: "var(--surface)", outline: "none", fontFamily: "var(--font-jp)" }} />
            <input value={mKm} onChange={e => setMKm(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="走行距離（km・任意）" style={{ width: "100%", boxSizing: "border-box", marginTop: 8, border: "1px solid var(--border-2)", borderRadius: 11, padding: "10px 12px", fontSize: 14, fontWeight: 700, color: "var(--fg)", background: "var(--surface)", outline: "none", fontFamily: "var(--font-mono)" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <Btn full size="sm" variant="secondary" onClick={() => setAddMnt(false)}>キャンセル</Btn>
              <Btn full size="sm" disabled={!mItem.trim()} onClick={saveMnt}>記録する（{todayStr}）</Btn>
            </div>
          </Card>
        )}
        <Card pad={6} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", padding: "8px 10px 6px", borderBottom: "1px solid var(--border)" }}>
            <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: "var(--fg-subtle)" }}>日付</span>
            <span style={{ flex: 1.4, fontSize: 11, fontWeight: 700, color: "var(--fg-subtle)" }}>項目</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-subtle)", textAlign: "right" }}>走行</span>
          </div>
          {maintList.map((m: any, i: number) => (
            <div key={i} style={{ display: "flex", alignItems: "center", padding: "11px 10px", borderTop: i ? "1px solid var(--border)" : "none" }}>
              <span style={{ flex: 1, fontSize: 12.5, fontFamily: "var(--font-mono)", color: "var(--fg-muted)" }}>{m.date}</span>
              <span style={{ flex: 1.4, fontSize: 13.5, fontWeight: 700, color: "var(--fg)" }}>{m.item}</span>
              <span style={{ fontSize: 12.5, fontFamily: "var(--font-mono)", color: "var(--fg)", textAlign: "right", whiteSpace: "nowrap" }}>{m.km || m.mileage}</span>
            </div>
          ))}
        </Card>

        <SectionLabel right={<button onClick={() => setAddRep(a => !a)} style={{ background: "none", border: "none", color: "var(--brand-accent)", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "var(--font-jp)" }}>{addRep ? "閉じる" : "+ 追加"}</button>}>修理履歴（{repairList.length}）</SectionLabel>
        {addRep && (
          <Card pad={12} style={{ marginBottom: 12 }}>
            <input value={rTitle} onChange={e => setRTitle(e.target.value)} placeholder="修理内容（例: ブレーキパッド交換）" style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--border-2)", borderRadius: 11, padding: "10px 12px", fontSize: 14, fontWeight: 700, color: "var(--fg)", background: "var(--surface)", outline: "none", fontFamily: "var(--font-jp)" }} />
            <input value={rShop} onChange={e => setRShop(e.target.value)} placeholder="修理業者（任意）" style={{ width: "100%", boxSizing: "border-box", marginTop: 8, border: "1px solid var(--border-2)", borderRadius: 11, padding: "10px 12px", fontSize: 14, fontWeight: 700, color: "var(--fg)", background: "var(--surface)", outline: "none", fontFamily: "var(--font-jp)" }} />
            <input value={rCost} onChange={e => setRCost(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="費用（円・任意）" style={{ width: "100%", boxSizing: "border-box", marginTop: 8, border: "1px solid var(--border-2)", borderRadius: 11, padding: "10px 12px", fontSize: 14, fontWeight: 700, color: "var(--fg)", background: "var(--surface)", outline: "none", fontFamily: "var(--font-mono)" }} />
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, padding: "10px 12px", borderRadius: 11, border: "1px dashed var(--border-strong)", background: "var(--surface-2)", color: rReceipt ? "var(--success-bright)" : "var(--brand-accent)", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "var(--font-jp)" }}>
              <Icon name="file" size={16} />{rReceipt ? rReceipt.name : "領収書を添付（任意）"}
              <input type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={async (e) => { const f = e.target.files && e.target.files[0]; if (f) { try { const dataUrl = await readFileAsDataUrl(f); setRReceipt({ name: f.name, dataUrl }); } catch { /* ignore */ } } e.currentTarget.value = ""; }} />
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <Btn full size="sm" variant="secondary" onClick={() => { setAddRep(false); setRReceipt(null); }}>キャンセル</Btn>
              <Btn full size="sm" disabled={!rTitle.trim()} onClick={saveRep}>記録する（{todayStr}）</Btn>
            </div>
          </Card>
        )}
        {repairList.length === 0
          ? <Empty icon="wrench" title="修理履歴はありません" />
          : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {repairList.map((r: any, i: number) => (
                <Card key={i} pad={14}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 800, color: "var(--fg)" }}>{r.content || r.title}</div>
                      <div style={{ fontSize: 12.5, color: "var(--fg-muted)", marginTop: 3 }}>{r.garage || r.shop}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 12, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)" }}>{r.date}</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "var(--fg)", fontFamily: "var(--font-mono)", marginTop: 2 }}>{r.cost || r.price}</div>
                    </div>
                  </div>
                  {(r.file || r.receipt) && <div style={{ marginTop: 11, paddingTop: 11, borderTop: "1px solid var(--border)" }}><VFile name={r.file || r.receipt} dataUrl={r.receiptUrl} /></div>}
                </Card>
              ))}
            </div>}
      </>
    );
  }

  if (tab === "docs") {
    const docList = v.documents || v.docs || [];
    const docKey = v.documents ? "documents" : "docs";
    body = (
      <>
        <SectionLabel right={<span style={{ fontSize: 12.5, color: "var(--fg-muted)", fontWeight: 700 }}>{docList.length}件</span>}>添付資料</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 12 }}>
          {docList.map((d: any, i: number) => {
            const dataUrl = typeof d === "object" ? (d.dataUrl || d.url) : (typeof d === "string" && d.startsWith("data:") ? d : "");
            const nm = typeof d === "string" ? (d.startsWith("data:") ? `資料${i + 1}` : d) : (d.name || `資料${i + 1}`);
            return (
            <button key={i} onClick={() => dataUrl && window.open(dataUrl, "_blank")} style={{ display: "flex", alignItems: "center", gap: 12, padding: 13, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)", cursor: dataUrl ? "pointer" : "default", boxShadow: "var(--shadow-card)" }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--brand-tint)", color: "var(--brand-accent)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name="file" size={19} /></div>
              <span style={{ flex: 1, textAlign: "left", fontSize: 14.5, fontWeight: 700, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nm}</span>
              <Icon name={dataUrl ? "download" : "file"} size={18} color="var(--fg-subtle)" />
            </button>
            );
          })}
        </div>
        {onUpdate && (
          <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px", borderRadius: 12, border: "1.5px dashed var(--border-strong)", background: "var(--surface-2)", color: "var(--brand-accent)", fontSize: 13.5, fontWeight: 800, cursor: "pointer", fontFamily: "var(--font-jp)", marginBottom: 16 }}>
            <Icon name="file" size={16} />車検証・自賠責証などを添付
            <input type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={async (e) => {
              const f = e.target.files && e.target.files[0];
              if (f) { try { const dataUrl = await readFileAsDataUrl(f); onUpdate({ [docKey]: [{ name: f.name, dataUrl }, ...docList] }); } catch { /* ignore */ } }
              e.currentTarget.value = "";
            }} />
          </label>
        )}
        <SectionLabel>車両写真</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 9 }}>
          {/* 実際の車両写真（v.photos は URL/dataURL 配列）。撮影で追加・タップで削除できる。 */}
          {(Array.isArray(v.photos) ? v.photos : []).map((src: any, i: number) => (
            <PhotoTile key={i} photo={makePhoto(i, typeof src === "string" ? src : (src?.dataUrl || src?.url || ""))}
              onRemove={onUpdate ? () => onUpdate({ photos: (Array.isArray(v.photos) ? v.photos : []).filter((_: any, j: number) => j !== i) }) : undefined} />
          ))}
          <PhotoCaptureButton onCapture={(dataUrl) => onUpdate && onUpdate({ photos: [...(Array.isArray(v.photos) ? v.photos : []), dataUrl] })}
            style={{ aspectRatio: "1", borderRadius: 13, border: "1.5px dashed var(--border-strong)", background: "var(--surface-2)", color: "var(--brand-accent)", display: "grid", placeItems: "center", cursor: "pointer" }}>
            <Icon name="camera" size={22} />
          </PhotoCaptureButton>
        </div>
      </>
    );
  }

  const shakenDays = shDays;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)", minHeight: 0 }}>
      <TopBar title={v.model || v.name} sub={v.plate} onBack={onBack} right={<IconBtn name="edit" onClick={openLegalEdit} />} />
      <div style={{ padding: "0 16px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13, padding: 14, borderRadius: 16, background: "linear-gradient(135deg, var(--surface-2), var(--surface))", border: "1px solid var(--border)" }}>
          <ItemThumb src={(v.photos || [])[0] || v.image} icon="car" size={52} radius={14} bg="var(--brand-tint)" col="var(--brand-accent)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-subtle)" }}>次回車検</span>
              <Badge variant={shakenDays < 0 ? "danger" : shakenDays <= 30 ? "warning" : "success"}>{shakenDays < 0 ? `${-shakenDays}日超過` : `残り${shakenDays}日`}</Badge>
            </div>
            <div style={{ fontSize: 19, fontWeight: 800, color: shakenColor, fontFamily: "var(--font-mono)", marginTop: 3 }}>{shNext}</div>
          </div>
        </div>
      </div>
      <div style={{ padding: "0 16px 12px" }}>
        <div style={{ display: "flex", gap: 6, background: "var(--surface-2)", padding: 4, borderRadius: 12 }}>
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: "8px 0", borderRadius: 9, border: "none", background: tab === k ? "var(--surface)" : "transparent", color: tab === k ? "var(--fg)" : "var(--fg-muted)", fontWeight: 800, fontSize: 13, cursor: "pointer", boxShadow: tab === k ? "var(--shadow-card)" : "none", fontFamily: "var(--font-jp)" }}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 16px 20px", minHeight: 0 }}>{body}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. WhDashboard (Warehouse Home Dashboard)
// ---------------------------------------------------------------------------

interface WhDashboardProps {
  staff: any;
  go: (tab: string) => void;
  moves: any[];
  onReturn: () => void;
  veh: any[];
  mnt: any[];
  walkinCount: number | null;
}

function StatTile({ label, value, unit, icon, variant = "neutral", onClick }: any) {
  const c = { neutral: "var(--fg)", brand: "var(--brand-accent)", success: "var(--success-bright)", danger: "var(--danger-bright)", warning: "var(--warning-bright)" }[variant as "neutral"|"brand"|"success"|"danger"|"warning"];
  return (
    <div onClick={onClick} style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "13px 14px", boxShadow: "var(--shadow-card)", cursor: onClick ? "pointer" : undefined }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Icon name={icon} size={18} color={c} />
        {onClick && <Icon name="chevronRight" size={15} color="var(--fg-subtle)" style={{ marginLeft: "auto" }} />}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: c, fontFamily: "var(--font-mono)", marginTop: 8, lineHeight: 1 }}>{value}<span style={{ fontSize: 13, fontWeight: 700, marginLeft: 2, fontFamily: "var(--font-jp)", color: "var(--fg-subtle)" }}>{unit}</span></div>
      <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 5, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function AlertRow({ icon, variant, title, sub, onClick }: any) {
  const c = { danger: "var(--danger-bright)", warning: "var(--warning-bright)" }[variant as "danger"|"warning"];
  const bg = { danger: "var(--danger-tint)", warning: "var(--warning-tint)" }[variant as "danger"|"warning"];
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 12, padding: 13, borderRadius: 13, background: "var(--surface)", border: "1px solid var(--border)", marginBottom: 9, cursor: "pointer" }}>
      <div style={{ width: 40, height: 40, borderRadius: 11, background: bg, color: c, display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name={icon} size={20} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: "var(--fg)" }}>{title}</div>
        <div style={{ fontSize: 12.5, color: "var(--fg-muted)", marginTop: 1 }}>{sub}</div>
      </div>
      <Icon name="chevronRight" size={18} color="var(--fg-subtle)" />
    </div>
  );
}

export function WhDashboard({ staff, go, moves, onReturn, veh, mnt, walkinCount }: WhDashboardProps) {
  const ins = moves.filter(m => m.type === "入庫").reduce((a, b) => a + b.qty, 0);
  const outs = moves.filter(m => m.type === "出庫").reduce((a, b) => a + b.qty, 0);
  
  const VL = veh && veh.length ? veh : [];
  const ML = mnt && mnt.length ? mnt : [];

  const overdueVeh = VL.filter(v => {
    const days = shakenInfo(v).days;
    return days < 0;
  }).length;

  const soonVeh = VL.filter(v => {
    const days = shakenInfo(v).days;
    return days >= 0 && days <= 14;
  }).length;

  const overdueMnt = ML.filter(m => (daysUntil(m.next) ?? m.days ?? 0) < 0).length;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px 18px" }}>
        <div style={{ width: 46, height: 46, borderRadius: 99, background: "linear-gradient(135deg,var(--brand),var(--brand-strong))", display: "grid", placeItems: "center", color: "#fff", fontWeight: 800, fontSize: 18 }}>佐</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>おはようございます</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--fg)" }}>{staff.name} さん</div>
        </div>
        <IconBtn name="bell" badge />
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
          <StatTile label="本日入庫" value={ins} unit="点" icon="boxIn" variant="success" onClick={() => go("stock")} />
          <StatTile label="本日出庫" value={outs} unit="点" icon="boxOut" variant="brand" onClick={() => go("stock")} />
          <StatTile label="要対応" value={overdueVeh + overdueMnt} unit="件" icon="alert" variant="danger" onClick={() => go("inspect")} />
        </div>

        <SectionLabel>アラート</SectionLabel>
        {overdueVeh > 0 && <AlertRow icon="car" variant="danger" title="車検が期限切れです" sub={`対象 ${overdueVeh}台 ・ 至急対応してください`} onClick={() => go("inspect")} />}
        {overdueMnt > 0 && <AlertRow icon="wrench" variant="danger" title="定期メンテナンス超過" sub={`対象 ${overdueMnt}件 ・ 点検期限を過ぎています`} onClick={() => go("inspect")} />}
        {soonVeh > 0 && <AlertRow icon="clock" variant="warning" title="車検期限が近づいています" sub={`14日以内 ${soonVeh}台`} onClick={() => go("inspect")} />}

        <SectionLabel style={{ marginTop: 12 }}>本日の業務</SectionLabel>
        <button onClick={onReturn} style={{ width: "100%", display: "flex", alignItems: "center", gap: 13, padding: "15px 16px", borderRadius: 16, background: "linear-gradient(135deg, var(--brand), var(--brand-strong))", border: "none", cursor: "pointer", marginBottom: 18, boxShadow: "0 8px 22px var(--brand-tint)" }}>
          <div style={{ width: 46, height: 46, borderRadius: 13, background: "rgba(255,255,255,0.18)", color: "#fff", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name="clipboardCheck" size={24} /></div>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>持込返却 検品</div>
            <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.82)", marginTop: 2 }}>お客様持込の返却品を検品・入庫</div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.18)", color: "#fff", borderRadius: 99, padding: "4px 10px", fontSize: 12.5, fontWeight: 800, fontFamily: "var(--font-mono)" }}>{walkinCount != null ? walkinCount : 0}</div>
          <Icon name="chevronRight" size={20} color="#fff" />
        </button>

        <SectionLabel>クイック操作</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[["boxIn", "入庫登録", "stock"], ["boxOut", "出庫登録", "stock"], ["layers", "棚卸し", "stocktake"], ["car", "点検記録", "inspect"]].map(([ic, lb, t]) => (
            <button key={lb} onClick={() => go(t)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "15px 14px", borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", cursor: "pointer", boxShadow: "var(--shadow-card)" }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: "var(--brand-tint)", color: "var(--brand-accent)", display: "grid", placeItems: "center" }}><Icon name={ic} size={20} /></div>
              <span style={{ fontSize: 14.5, fontWeight: 800, color: "var(--fg)", textAlign: "left" }}>{lb}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. WhStock (Warehouse Stock In / Out Register)
// ---------------------------------------------------------------------------

export function WhStock({ moves, addMove, onReturn, staffName }: any) {
  const [filter, setFilter] = useState("all");
  const [scan, setScan] = useState<string | null>(null); // "入庫" | "出庫"
  const [picked, setPicked] = useState<any>(null); // chosen product
  const [qty, setQty] = useState(10);
  const [q, setQ] = useState("");
  const [moveDetail, setMoveDetail] = useState<any>(null);
  const reversingRef = useRef(false);

  const ml = useMobileLive();
  const liveProducts = ml.products || [];
  const qn = q.trim().toLowerCase();
  const list = moves.filter((m: any) =>
    (filter === "all" || m.type === filter) &&
    (!qn || `${m.item || ""} ${m.id || ""} ${m.ref || ""} ${m.date || ""}`.toLowerCase().includes(qn)),
  );
  const paged = usePagedList(list, 50, filter + "|" + qn);
  // 「本日入庫/出庫」は当日分のみ集計（以前は全期間合計を本日として表示していた）。
  const _now = new Date();
  const todayPrefix = `${_now.getFullYear()}/${String(_now.getMonth() + 1).padStart(2, "0")}/${String(_now.getDate()).padStart(2, "0")}`;
  const todaysMoves = moves.filter((m: any) => String(m.date || "").startsWith(todayPrefix));
  const inQty = todaysMoves.filter((m: any) => m.type === "入庫").reduce((sum: number, m: any) => sum + Number(m.qty || 0), 0);
  const outQty = todaysMoves.filter((m: any) => m.type === "出庫").reduce((sum: number, m: any) => sum + Number(m.qty || 0), 0);
  const stockTotal = liveProducts.reduce((sum: number, p: any) => sum + Number(p.stock || 0), 0);

  const openScan = (type: string) => { setScan(type); setPicked(null); setQty(10); };
  
  const movingRef = useRef(false);
  const confirmMove = () => {
    // 二度押しガード: 確定はモーダルを閉じるが再レンダーは非同期のため、低速端末での連打で
    // adjustStock(delta) が二重に走り在庫が二重増減するのを防ぐ。
    if (movingRef.current) return;
    movingRef.current = true;
    try {
      const isIn = scan === "入庫";
      if (picked && ml.adjustStock) ml.adjustStock(picked.firestoreId || picked.id, isIn ? qty : -qty);
      if (picked) addMove(scan!, { item: picked.name, qty, icon: isVehicle(picked) ? "car" : "package" }, staffName);
      else addMove(scan!, undefined, staffName);
      setScan(null); setPicked(null);
    } finally {
      setTimeout(() => { movingRef.current = false; }, 600);
    }
  };

  // 取消可能なのは「この画面で手動登録した入出庫」のみ。レンタル/販売/回収戻し等の自動記録は
  // 在庫台帳(stockLedger/受注確定)が在庫を管理しており、ここで adjustStock すると二重補正で在庫が壊れる。
  // さらに、同一履歴に対する取消が既に存在する場合は不可（多重取消＝在庫破壊を防ぐ／取消レコード自体も取消不可）。
  const canReverse = (m: any) => {
    if (!m) return false;
    const ref = String(m.ref || "");
    if (!ref.includes("手動")) return false; // 手動登録のみ
    const already = (ml.stockMoves || []).some((x: any) => String(x.ref || "").includes("取消（" + m.id + "）"));
    return !already;
  };

  // 入出庫の取消: 元の在庫効果を打ち消し、反対方向の補正レコードを履歴に残す（誤登録の訂正）。
  // 二度押しガード + 上記 canReverse ガード。商品が名前で見つからない場合は在庫を触らず中止（誤調整防止）。
  const reverseMove = (m: any) => {
    if (reversingRef.current) return;
    if (!canReverse(m)) { setMoveDetail(null); return; }
    const isIn = m.type === "入庫";
    const prod = ml.findProductByName ? ml.findProductByName(m.item) : null;
    if (!prod) { setMoveDetail(null); return; }
    reversingRef.current = true;
    try {
      if (ml.adjustStock) ml.adjustStock(prod.firestoreId || prod.id, isIn ? -Number(m.qty || 0) : Number(m.qty || 0));
      addMove(isIn ? "出庫" : "入庫", { item: m.item, qty: Number(m.qty || 0), ref: "取消（" + m.id + "）", icon: isIn ? "boxOut" : "boxIn" }, staffName);
      setMoveDetail(null);
    } finally {
      setTimeout(() => { reversingRef.current = false; }, 800);
    }
  };

  return (
    <>
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
        <TopBar title="入出庫管理" sub="WAREHOUSE" right={<IconBtn name="clipboardCheck" onClick={onReturn} />} />
        
        <div style={{ padding: "0 16px 12px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
            <MetricCard label="現在庫" value={formatCount(stockTotal)} unit="点" icon="warehouse" tone="neutral" />
            <MetricCard label="本日入庫" value={formatCount(inQty)} unit="点" icon="boxIn" tone="success" onClick={() => setFilter("入庫")} />
            <MetricCard label="本日出庫" value={formatCount(outQty)} unit="点" icon="boxOut" tone="brand" onClick={() => setFilter("出庫")} />
          </div>
          <SegmentControl
            active={filter}
            onChange={setFilter}
            items={[
              { key: "all", label: "すべて", count: moves.length },
              { key: "入庫", label: "入庫", count: moves.filter((m: any) => m.type === "入庫").length },
              { key: "出庫", label: "出庫", count: moves.filter((m: any) => m.type === "出庫").length },
            ]}
          />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="品名・ID・日付で検索"
            style={{ width: "100%", marginTop: 10, boxSizing: "border-box", border: "1px solid var(--border-2)", borderRadius: 12, padding: "10px 13px", fontSize: 14, fontWeight: 700, color: "var(--fg)", background: "var(--surface)", outline: "none" }} />
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
          {list.length === 0 ? (
            <Empty icon="layers" title="入出庫履歴はありません" sub="QRスキャンで入庫または出庫を登録できます" />
          ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {paged.shown.map((m: any) => {
              const isIn = m.type === "入庫";
              return (
                <Card key={m.id} pad={13}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => setMoveDetail(m)}>
                    <ItemThumb src={liveProducts.find((p: any) => p.name === m.item)?.image} icon={isIn ? "boxIn" : "boxOut"} size={42} radius={11} bg={isIn ? "var(--success-tint)" : "var(--brand-tint)"} col={isIn ? "var(--success-bright)" : "var(--brand-accent)"} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: "var(--fg)", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-word" }}>{m.item}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", marginTop: 2 }}>{m.id} ・ {m.time} ・ {m.ref}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 17, fontWeight: 800, fontFamily: "var(--font-mono)", color: isIn ? "var(--success-bright)" : "var(--brand-accent)" }}>{isIn ? "+" : "−"}{m.qty}</div>
                    </div>
                  </div>
                </Card>
              );
            })}
            {paged.hasMore && (
              <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
                <button onClick={paged.showMore} style={{ padding: "10px 20px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--brand-strong)", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>さらに表示（残り {paged.remaining} 件）</button>
              </div>
            )}
          </div>
          )}
        </div>

        <div style={{ padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--border)", background: "var(--bg)", display: "flex", gap: 10 }}>
          <Btn full variant="success" icon="boxIn" onClick={() => openScan("入庫")}>入庫</Btn>
          <Btn full icon="boxOut" onClick={() => openScan("出庫")}>出庫</Btn>
        </div>
      </div>

      <Sheet open={!!scan} onClose={() => { setScan(null); setPicked(null); }} title={`${scan}スキャン`}>
        {!picked ? (
          <>
            <div style={{ borderRadius: 16, border: "1px dashed var(--border-strong)", background: "var(--surface-2)", padding: 18, textAlign: "center" }}>
              <Icon name="qr" size={42} color="var(--brand-accent)" />
              <div style={{ marginTop: 8, fontSize: 14.5, fontWeight: 800, color: "var(--fg)" }}>商品QRを読み取っています</div>
              <div style={{ marginTop: 4, fontSize: 12.5, fontWeight: 700, color: "var(--fg-muted)", lineHeight: 1.5 }}>カメラが使えない場合は下の入力欄にQRコードまたは商品IDを入力してください。</div>
            </div>
            <p style={{ fontSize: 13, color: "var(--fg-muted)", textAlign: "center", margin: "14px 0 0", lineHeight: 1.5 }}>製品のQRコードをスキャンして{scan}処理を行います</p>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 18, padding: 12, borderRadius: 12, background: "var(--surface-2)" }}>
              <ItemThumb src={picked.image} icon={isVehicle(picked) ? "car" : "package"} size={40} radius={10} bg="var(--surface-3)" col="var(--brand-accent)" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: "var(--fg)" }}>{picked.name}</div>
                <div style={{ fontSize: 12, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)" }}>現在庫 {picked.stock ?? 0} ・ {picked.category}</div>
              </div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", marginBottom: 9, textAlign: "center" }}>{scan}数量</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 8 }}>
              <button onClick={() => setQty(q => Math.max(1, q - 1))} style={{ width: 48, height: 48, borderRadius: 14, border: "1px solid var(--border-strong)", background: "var(--surface-2)", color: "var(--fg)", display: "grid", placeItems: "center", cursor: "pointer" }}><Icon name="minus" size={22} stroke={2.6} /></button>
              <input value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value.replace(/\D/g, "")) || 1))} inputMode="numeric" style={{ width: 96, textAlign: "center", fontSize: 34, fontWeight: 800, fontFamily: "var(--font-mono)", background: "transparent", border: "none", borderBottom: "2px solid var(--brand)", color: "var(--fg)", outline: "none", padding: "4px 0" }} />
              <button onClick={() => setQty(q => q + 1)} style={{ width: 48, height: 48, borderRadius: 14, border: "1px solid var(--border-strong)", background: "var(--surface-2)", color: "var(--fg)", display: "grid", placeItems: "center", cursor: "pointer" }}><Icon name="plus" size={22} stroke={2.6} /></button>
            </div>
            <div style={{ textAlign: "center", fontSize: 13, color: "var(--fg-muted)", marginBottom: 18 }}>{scan}後の在庫: <span style={{ fontWeight: 800, color: "var(--fg)", fontFamily: "var(--font-mono)" }}>{(picked.stock ?? 0) + (scan === "入庫" ? qty : -qty)}</span></div>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn variant="secondary" onClick={() => setPicked(null)}>戻る</Btn>
              <Btn full variant={scan === "入庫" ? "success" : "primary"} icon="check" onClick={confirmMove}>{scan}を確定</Btn>
            </div>
          </>
        )}
      </Sheet>
      <ProductQrScanner
        open={!!scan && !picked}
        title={`${scan || ""} QRスキャン`}
        products={liveProducts}
        description={`商品QRを読み取り、${scan || ""}数量を登録します。`}
        onClose={() => { setScan(null); setPicked(null); }}
        onMatch={(product) => setPicked(product)}
      />

      <Sheet open={!!moveDetail} onClose={() => setMoveDetail(null)} title="入出庫の詳細">
        {moveDetail && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14, padding: 12, borderRadius: 12, background: "var(--surface-2)" }}>
              <ItemThumb src={liveProducts.find((p: any) => p.name === moveDetail.item)?.image} icon={moveDetail.type === "入庫" ? "boxIn" : "boxOut"} size={42} radius={11} bg={moveDetail.type === "入庫" ? "var(--success-tint)" : "var(--brand-tint)"} col={moveDetail.type === "入庫" ? "var(--success-bright)" : "var(--brand-accent)"} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: "var(--fg)" }}>{moveDetail.item}</div>
                <div style={{ fontSize: 12, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)" }}>{moveDetail.type} {moveDetail.qty} ・ {moveDetail.date}</div>
              </div>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--fg-muted)", fontFamily: "var(--font-mono)", margin: "0 2px 14px", lineHeight: 1.6 }}>ID: {moveDetail.id}<br />区分: {moveDetail.ref || "—"}</div>
            {canReverse(moveDetail) ? (
              <>
                <p style={{ fontSize: 12.5, color: "var(--fg-muted)", margin: "0 2px 12px", lineHeight: 1.5 }}>誤登録の場合は取消できます。元の在庫変動を打ち消し、反対方向の補正レコードを履歴に残します。</p>
                <Btn full variant="danger" icon="minus" onClick={() => reverseMove(moveDetail)}>この入出庫を取消（在庫を戻す）</Btn>
              </>
            ) : (
              <div style={{ fontSize: 12.5, color: "var(--fg-muted)", margin: "0 2px", lineHeight: 1.5, padding: 12, borderRadius: 11, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                この履歴は自動記録（レンタル/回収戻し等）または取消済みのため、この画面からは取消できません。手動登録した入出庫のみ取消できます。
              </div>
            )}
          </>
        )}
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------------------
// 4. WhInspect (Vehicle Shaken & Maintenance)
// ---------------------------------------------------------------------------

export function WhInspect({ staffName }: any) {
  const [tab, setTab] = useState("shaken");
  const ml = useMobileLive();
  const liveVeh = ml.vehicles && ml.vehicles.length > 0 ? ml.vehicles : null;
  const [veh, setVeh] = useState<any[]>([]);
  const [mnt, setMnt] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null); // {kind, item}
  const [vehPlate, setVehPlate] = useState<string | null>(null);
  const [shakenNext, setShakenNext] = useState(""); // 車検シートで入力する次回車検日(YYYY-MM-DD)
  const [mntResult, setMntResult] = useState("合格"); // メンテシートの結果（合格/要整備）
  const [vehSearch, setVehSearch] = useState(""); // 車両リスト検索

  // Sync live vehicles
  useEffect(() => {
    if (liveVeh) setVeh(liveVeh);
  }, [liveVeh]);

  // Sync live maintenance
  const liveMnt = ml.maint || null;
  const mntIcon = (c: string) => ({ "電動機器": "battery", "照明": "sun", "車両系": "car" }[c] || "wrench");
  useEffect(() => {
    if (liveMnt) {
      setMnt(liveMnt.map(m => ({
        ...m,
        category: m.category || m.cat,
        cycle: m.cycle || "—",
        icon: m.icon || mntIcon(m.category || m.cat)
      })));
    }
  }, [liveMnt]);

  const fmtD = (d: Date) =>
    `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  const addCycleDate = (from: Date, cycle: string) => {
    const d = new Date(from);
    if (cycle.includes("2週")) d.setDate(d.getDate() + 14);
    else if (cycle.includes("1ヶ月")) d.setMonth(d.getMonth() + 1);
    else if (cycle.includes("6ヶ月")) d.setMonth(d.getMonth() + 6);
    else if (cycle.includes("1年")) d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 3); // 3ヶ月 既定
    return d;
  };

  // 車検完了の記録。nextDateStr が渡されればその実際の有効期限を使う（無ければ1年後）。
  // 誤って別車両/誤日付で確定すると次回車検が上書きされるため、確定前に必ず確認する。
  const recordShaken = async (plate: string, nextDateStr?: string) => {
    const now = new Date();
    const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let next: Date;
    const m = nextDateStr ? nextDateStr.replace(/\//g, "-").match(/^(\d{4})-(\d{1,2})-(\d{1,2})/) : null;
    if (m) next = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    else next = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    const ok = await confirmDialog(`「${(veh.find(v => v.plate === plate)?.model) || plate}」の次回車検を ${fmtD(next)} で記録しますか？`, { okText: "記録する", cancelText: "キャンセル" });
    if (!ok) return;
    // 残日数は「日付（深夜0時）」基準で計算する。時刻成分による ±1 日のズレ（admin 表示との不一致）を防ぐ。
    const days = Math.round((new Date(next.getFullYear(), next.getMonth(), next.getDate()).getTime() - t0.getTime()) / 86400000);
    // 車検記録は稼働ステータス（使用中/空車/整備中）を変えない（以前は無条件で使用中に上書きしていた）。
    const upd: any = {
      days,
      inspectionDaysRemaining: days,
      inspectionDate: fmtD(next),
      nextInspectionDate: fmtD(next),
    };
    const current = veh.find(v => v.plate === plate);
    // ドット付きキー（"shaken.last"）は OrderBus の浅いマージでネストされず同期されないため、
    // ネストした shaken オブジェクトを渡す。
    const shaken = { ...(current?.shaken || {}), last: fmtD(now), next: fmtD(next) };
    setVeh(vs => vs.map(v => v.plate === plate ? { ...v, ...upd, shaken } : v));
    if (ml.recordVehicleShaken) {
      ml.recordVehicleShaken(plate, { ...upd, shaken });
    }
    setVehPlate(null);
    setDetail(null);
  };

  // 定期点検の記録。result="合格"なら次回予定を周期で更新、"要整備"なら整備が必要としてフラグし日付は進めない。
  const recordMnt = async (id: string, result: string = "合格") => {
    const item = mnt.find(m => m.id === id);
    const isPass = result === "合格";
    const ok = await confirmDialog(
      isPass ? `「${item?.name || id}」を点検合格として記録しますか？次回予定日が更新されます。` : `「${item?.name || id}」を要整備として記録しますか？整備が必要として登録されます。`,
      { okText: "記録する", cancelText: "キャンセル" },
    );
    if (!ok) return;
    const today = new Date();
    const hist = Array.isArray(item?.history) ? [...item.history] : [];
    hist.unshift({
      id: "INS-" + Date.now(),
      date: fmtD(today),
      result,
      inspector: staffName || STAFF.souko.name,
      note: isPass ? "倉庫スタッフによる定期点検" : "点検で要整備を確認",
    });
    let upd: any;
    if (isPass) {
      const next = addCycleDate(today, item?.cycle || "3ヶ月");
      // 残日数は日付（深夜0時）基準。時刻成分による ±1 日のズレを防ぐ。
      const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
      const nextMid = new Date(next.getFullYear(), next.getMonth(), next.getDate()).getTime();
      const days = Math.round((nextMid - t0) / 86400000);
      upd = { status: "正常", days, last: fmtD(today), next: fmtD(next), history: hist };
    } else {
      // 要整備: 次回予定日は進めない。最終点検日を残し、状態を要整備にする。
      upd = { status: "要整備", last: fmtD(today), history: hist };
    }
    setMnt(ms => ms.map(m => m.id === id ? { ...m, ...upd } : m));
    if (ml.recordMaintenance && item) {
      ml.recordMaintenance(item.firestoreId || item.id, upd);
    }
    setDetail(null);
  };

  // 車両レコードの汎用更新（状態変更・整備/修理履歴の追加など）。ローカル即時反映 + サーバ同期。
  const updateVeh = (plate: string, updates: any) => {
    setVeh(vs => vs.map(v => v.plate === plate ? { ...v, ...updates } : v));
    if (ml.recordVehicleShaken) ml.recordVehicleShaken(plate, updates);
  };

  // 稼働状態の変更。整備中にした場合は admin の整備キューにも登録する（ローカルも即時反映）。
  const setVehStatusLocal = (plate: string, status: string) => {
    setVeh(vs => vs.map(v => v.plate === plate ? { ...v, status } : v));
    if (ml.setVehicleStatus) ml.setVehicleStatus(plate, status);
    else updateVeh(plate, { status });
  };

  const openVeh = veh.find(v => v.plate === vehPlate);
  if (openVeh) {
    return <VehicleDetail v={openVeh} onBack={() => setVehPlate(null)} onRecordShaken={(d?: string) => recordShaken(openVeh.plate, d)} onUpdate={(updates: any) => updateVeh(openVeh.plate, updates)} onSetStatus={(s: string) => setVehStatusLocal(openVeh.plate, s)} staffName={staffName} />;
  }

  const vehicleAlertsCount = veh.reduce((sum, v) => sum + vehicleAlerts(v).length, 0);
  const maintenanceOverdue = mnt.filter(m => (daysUntil(m.next) ?? Number(m.days || 0)) < 0).length;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <TopBar title="点検管理" sub="INSPECTION" />
      
      <div style={{ padding: "0 16px 12px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <MetricCard label="車両アラート" value={vehicleAlertsCount} unit="件" icon="car" tone={vehicleAlertsCount ? "danger" : "success"} onClick={() => setTab("shaken")} />
          <MetricCard label="整備超過" value={maintenanceOverdue} unit="件" icon="wrench" tone={maintenanceOverdue ? "danger" : "neutral"} onClick={() => setTab("mainte")} />
        </div>
        <SegmentControl
          active={tab}
          onChange={setTab}
          items={[
            { key: "shaken", label: "車検・車両", count: veh.length },
            { key: "mainte", label: "メンテ", count: mnt.length },
          ]}
        />
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
        {tab === "shaken" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {veh.length > 0 && (
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--fg-subtle)", pointerEvents: "none" }}><Icon name="search" size={18} /></span>
                <input value={vehSearch} onChange={(e) => setVehSearch(e.target.value)} placeholder="車両番号・車種・メーカーで検索"
                  style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px 11px 40px", borderRadius: 12, border: "1px solid var(--border-2)", background: "var(--surface)", color: "var(--fg)", fontFamily: "var(--font-jp)", fontSize: 14.5, outline: "none" }} />
              </div>
            )}
            {veh.length === 0 && <Empty icon="car" title="登録された車両がありません" sub="admin の車庫管理で登録された車両が表示されます" />}
            {(() => {
              const q = vehSearch.trim().toLowerCase();
              const shown = q ? veh.filter(v => [v.plate, v.model, v.name, v.maker, v.manufacturer].some((x: any) => String(x || "").toLowerCase().includes(q))) : veh;
              return q && shown.length === 0 ? <Empty icon="search" title="該当する車両がありません" sub="別の番号・車種で検索してください" /> : shown.map(v => {
              const alertCount = vehicleAlerts(v).length;
              const { date: nextShakenDate, days } = shakenInfo(v);
              return (
                <Card key={v.plate} pad={14} onClick={() => setVehPlate(v.plate)}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
                      <ItemThumb src={(v.photos || [])[0] || v.image} icon="car" size={42} radius={11} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--fg)" }}>{v.model || v.name}</div>
                        <div style={{ fontSize: 12.5, color: "var(--fg-muted)", fontFamily: "var(--font-mono)", marginTop: 2 }}>{v.plate}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                      <Badge variant={statusVariant(v.status)}>{v.status}</Badge>
                      {alertCount > 0 && <Badge variant="danger" icon="alert">{alertCount}</Badge>}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                    <div><div style={{ fontSize: 11, color: "var(--fg-subtle)", fontWeight: 600 }}>次回車検</div><div style={{ fontSize: 14, fontWeight: 800, color: days < 0 ? "var(--danger-bright)" : "var(--fg)", fontFamily: "var(--font-mono)", marginTop: 1, whiteSpace: "nowrap" }}>{nextShakenDate}</div></div>
                    <div><div style={{ fontSize: 11, color: "var(--fg-subtle)", fontWeight: 600 }}>残り</div><div style={{ fontSize: 14, fontWeight: 800, color: days < 0 ? "var(--danger-bright)" : days <= 30 ? "var(--warning-bright)" : "var(--fg)", fontFamily: "var(--font-mono)", marginTop: 1, whiteSpace: "nowrap" }}>{days < 0 ? `${-days}日超過` : `${days}日`}</div></div>
                    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 3, color: "var(--brand-accent)", fontWeight: 700, fontSize: 13 }}>詳細<Icon name="chevronRight" size={16} /></div>
                  </div>
                </Card>
              );
            });
            })()}
          </div>
        )}

        {tab === "mainte" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {mnt.length === 0 && <Empty icon="wrench" title="メンテナンス記録がありません" sub="admin の点検・整備データが表示されます" />}
            {mnt.map(m => { const md = daysUntil(m.next) ?? (m.days ?? 0); return (
              <Card key={m.id} pad={14} onClick={() => { setMntResult("合格"); setDetail({ kind: "mainte", item: m }); }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
                    <ItemThumb src={m.image} icon={m.icon} size={42} radius={11} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "var(--fg)" }}>{m.name}</div>
                      <div style={{ fontSize: 12.5, color: "var(--fg-muted)", marginTop: 2 }}>{m.category} ・ {m.cycle}周期</div>
                    </div>
                  </div>
                  <Badge variant={statusVariant(m.status)}>{m.status}</Badge>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                  <div><div style={{ fontSize: 11, color: "var(--fg-subtle)", fontWeight: 600 }}>前回点検</div><div style={{ fontSize: 14, fontWeight: 800, color: "var(--fg)", fontFamily: "var(--font-mono)", marginTop: 1, whiteSpace: "nowrap" }}>{m.last}</div></div>
                  <div><div style={{ fontSize: 11, color: "var(--fg-subtle)", fontWeight: 600 }}>次回予定</div><div style={{ fontSize: 14, fontWeight: 800, color: md < 0 ? "var(--danger-bright)" : "var(--fg)", fontFamily: "var(--font-mono)", marginTop: 1, whiteSpace: "nowrap" }}>{m.next}</div></div>
                  <div style={{ marginLeft: "auto" }}><div style={{ fontSize: 11, color: "var(--fg-subtle)", fontWeight: 600 }}>残り</div><div style={{ fontSize: 14, fontWeight: 800, color: md < 0 ? "var(--danger-bright)" : md <= 7 ? "var(--warning-bright)" : "var(--fg)", fontFamily: "var(--font-mono)", marginTop: 1, whiteSpace: "nowrap" }}>{md < 0 ? `${-md}日超過` : `${md}日`}</div></div>
                </div>
              </Card>
            ); })}
          </div>
        )}
      </div>

      <Sheet open={!!detail} onClose={() => setDetail(null)} title={detail?.kind === "shaken" ? "車検記録" : "メンテナンス記録"}>
        {detail?.kind === "shaken" && (
          <>
            <Card pad={14} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--fg)" }}>{detail.item.model}</div>
              <div style={{ fontSize: 13, color: "var(--fg-muted)", fontFamily: "var(--font-mono)", marginTop: 3 }}>{detail.item.plate}</div>
              <div style={{ display: "flex", gap: 20, marginTop: 12 }}>
                <div><div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>次回車検</div><div style={{ fontWeight: 800, color: (daysUntil(detail.item.next) ?? detail.item.days ?? 0) < 0 ? "var(--danger-bright)" : "var(--fg)", fontFamily: "var(--font-mono)" }}>{detail.item.next}</div></div>
                <div><div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>走行距離</div><div style={{ fontWeight: 800, color: "var(--fg)", fontFamily: "var(--font-mono)" }}>{detail.item.mileage}</div></div>
              </div>
            </Card>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-muted)", marginBottom: 5 }}>次回車検日（車検証の有効期限・未入力なら1年後）</div>
              <input type="date" value={shakenNext} onChange={e => setShakenNext(e.target.value)} style={{ width: "100%", boxSizing: "border-box", borderRadius: 12, border: "1.5px solid var(--border-2)", background: "var(--surface)", color: "var(--fg)", padding: "11px 13px", fontSize: 14.5, fontFamily: "var(--font-mono)", outline: "none" }} />
            </div>
            <Btn full size="lg" icon="clipboardCheck" onClick={() => recordShaken(detail.item.plate, shakenNext)}>車検完了を記録</Btn>
          </>
        )}
        {detail?.kind === "mainte" && (
          <>
            <Card pad={14} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--fg)" }}>{detail.item.name}</div>
              <div style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 3 }}>{detail.item.category} ・ 点検周期 {detail.item.cycle}</div>
            </Card>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-muted)", marginBottom: 6 }}>点検結果</div>
              <SegmentControl active={mntResult} onChange={setMntResult} items={[{ key: "合格", label: "合格" }, { key: "要整備", label: "要整備" }]} />
            </div>
            <p style={{ fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.55, margin: "0 0 16px" }}>{mntResult === "合格" ? "合格として記録すると、次回点検予定日が周期に基づき更新されます。" : "要整備として記録すると、整備が必要として登録され、次回予定日は更新されません。"}</p>
            <Btn full size="lg" variant={mntResult === "合格" ? "primary" : "danger"} icon="clipboardCheck" onClick={() => recordMnt(detail.item.id, mntResult)}>{mntResult === "合格" ? "点検合格を記録" : "要整備を記録"}</Btn>
          </>
        )}
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. WhStocktake (Warehouse Stocktake count)
// ---------------------------------------------------------------------------

export function WhStocktake({ onBack, staffName }: { onBack?: () => void; staffName?: string }) {
  const ml = useMobileLive();
  const liveProducts = ml.products && ml.products.length > 0 ? ml.products : null;
  
  const initInv = () => {
    return liveProducts
      ? liveProducts.map((p) => ({
          id: p.id || p.firestoreId,
          firestoreId: p.firestoreId,
          name: p.name,
          image: p.image || null,
          qr: getProductQrCode(p),
          qrPayload: p.qrPayload,
          // 実際の棚番フィールドを優先。未設定なら合成値ではなく「未設定」を表示（配列順で変わる偽の棚番を出さない）。
          loc: p.location || p.bin || p.shelf || "未設定",
          system: Number(p.stock) || 0,
          counted: null as number | null,
          icon: isVehicle(p) ? "car" : "package",
          report: [] as any[],
        }))
      : INVENTORY_FALLBACK;
  };

  const [inv, setInv] = useState<any[]>(initInv);
  const [edit, setEdit] = useState<string | null>(null);
  const [val, setVal] = useState("");
  const [dmg, setDmg] = useState<string | null>(null); // item id for damage report
  const [confirmed, setConfirmed] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [stQuery, setStQuery] = useState("");
  const [stFilter, setStFilter] = useState<"all" | "uncounted" | "diff">("all");
  const [exOpen, setExOpen] = useState(false);
  const [exName, setExName] = useState("");
  const [exQty, setExQty] = useState("1");

  // Sync products before counting starts
  useEffect(() => {
    if (liveProducts && !confirmed && inv.every(i => i.counted === null)) {
      setInv(initInv());
    }
  }, [liveProducts]);

  const counted = inv.filter(i => i.counted !== null).length;
  const done = inv.length > 0 && counted === inv.length;
  const diffCount = inv.filter(i => i.counted !== null && i.counted !== i.system).length;

  const openEdit = (i: any) => {
    setEdit(i.id);
    setVal(i.counted !== null ? String(i.counted) : String(i.system));
  };

  const save = () => {
    setInv(xs => xs.map(x => x.id === edit ? { ...x, counted: parseInt(val) || 0 } : x));
    setEdit(null);
  };

  const scanNext = () => setScanOpen(true);

  const saveReport = (report: any[]) => {
    setInv(xs => xs.map(x => x.id === dmg ? { ...x, report } : x));
    setDmg(null);
  };

  const confirmStocktake = () => {
    const diffItems = inv.filter(i => i.counted !== null && i.counted !== i.system);
    if (ml.setStock) {
      diffItems.forEach(i => {
        const targetId = i.firestoreId || i.id;
        if (targetId) ml.setStock(targetId, i.counted);
      });
    }
    // #9 監査証跡: 差異のある品目ごとに入出庫(棚卸調整)を残す。なぜ帳簿在庫が変わったか追えるようにする。
    if (ml.addStockMove) {
      diffItems.forEach(i => {
        const diff = (Number(i.counted) || 0) - (Number(i.system) || 0);
        if (diff === 0) return;
        ml.addStockMove(diff > 0 ? "入庫" : "出庫", { item: i.name, qty: Math.abs(diff), ref: `棚卸調整(帳簿${i.system}→実${i.counted})`, icon: i.icon || "package" }, staffName);
      });
    }
    // #8 現場棚卸セッションを admin の棚卸履歴へ永続化する。
    if (ml.recordStocktakeSession) {
      const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
      ml.recordStocktakeSession({
        id: "ST-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 5),
        date: jst.toISOString().slice(0, 19).replace("T", " "),
        counter: staffName || STAFF.souko.name,
        note: "現場棚卸(STAFFアプリ)",
        totalItems: inv.length,
        countedItems: inv.filter(i => i.counted !== null).length,
        diffItems: diffItems.length,
        items: inv.filter(i => i.counted !== null).map(i => ({
          id: i.id, name: i.name, loc: i.loc,
          system: i.system, counted: i.counted, diff: (Number(i.counted) || 0) - (Number(i.system) || 0),
          report: i.report || [],
        })),
      });
    }
    try {
      const prodsWithIssues = inv
        .filter(i => i.report && i.report.length > 0)
        .map(i => ({ name: i.name, qr: i.qr || i.id, report: i.report }));
      
      if (prodsWithIssues.length > 0) {
        pushFieldReportsLocal({
          source: "棚卸",
          ref: "INV-2026-06",
          reporter: staffName || STAFF.souko.name,
          customer: "—",
          site: "東京中央倉庫",
          products: prodsWithIssues,
        }).then(ids => {
          if (ids && ids.length) {
            console.log("[FieldReport] pushed", ids);
          }
        });
      }
    } catch (e) {
      console.warn("pushReports failed", e);
    }
  };

  const editItem = inv.find(i => i.id === edit);
  const editShort = editItem && editItem.counted !== null && editItem.counted < editItem.system;

  return (
    <>
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
        <TopBar title="棚卸し" sub="STOCKTAKING" onBack={onBack} />
        
        <div style={{ padding: "0 16px 14px" }}>
          {/* QR scanner styling */}
          <div style={{ position: "relative", height: 160, borderRadius: 16, overflow: "hidden", background: "#0a0d14", border: "1px solid var(--border)" }}>
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 45%, #1a2233, #0a0d14 70%)" }} />
            <div style={{ position: "absolute", left: "50%", top: "45%", transform: "translate(-50%,-50%)", opacity: 0.25, color: "#fff" }}><Icon name="qr" size={72} /></div>
            <div style={{ position: "absolute", left: "50%", top: "45%", transform: "translate(-50%,-50%)", width: 110, height: 110 }}>
              {[["0","0","auto","auto"],["0","auto","auto","0"],["auto","0","0","auto"],["auto","auto","0","0"]].map((c, i) => (
                <span key={i} style={{ position: "absolute", top: c[0], right: c[1], bottom: c[2], left: c[3], width: 20, height: 20,
                  borderTop: (c[0] === "0" ? "3px solid var(--brand-accent)" : "none"), borderBottom: (c[2] === "0" ? "3px solid var(--brand-accent)" : "none"),
                  borderLeft: (c[3] === "0" ? "3px solid var(--brand-accent)" : "none"), borderRight: (c[1] === "0" ? "3px solid var(--brand-accent)" : "none"),
                  borderRadius: 4 }} />
              ))}
              {!done && <div style={{ position: "absolute", left: 6, right: 6, height: 2, background: "var(--brand-accent)", boxShadow: "0 0 8px var(--brand-accent)", borderRadius: 2, animation: "scanline 2s ease-in-out infinite" }} />}
            </div>
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 10, display: "flex", justifyContent: "center" }}>
              {done
                ? <div style={{ background: "var(--success-tint)", border: "1px solid var(--success-bright)", color: "var(--success-bright)", borderRadius: 99, padding: "6px 14px", fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", gap: 7 }}><Icon name="checkCircle" size={16} />全品目カウント完了</div>
                : <button onClick={scanNext} style={{ background: "var(--brand)", color: "#fff", border: "none", borderRadius: 99, padding: "8px 18px", fontSize: 14, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.4)" }}><Icon name="scan" size={16} />QRをスキャン</button>}
            </div>
          </div>

          <Card pad={14} style={{ margin: "14px 0" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 13.5, color: "var(--fg-muted)", fontWeight: 800 }}>棚卸し進捗</span>
              <span style={{ fontSize: 14, fontWeight: 900, color: "var(--brand-accent)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>{counted} / {inv.length} 品目</span>
            </div>
            <ProgressBar value={counted} max={inv.length} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 12.5, fontWeight: 800 }}>
              <span style={{ color: "var(--fg-muted)" }}>差異</span>
              <span style={{ color: diffCount > 0 ? "var(--danger-bright)" : "var(--success-bright)" }}>{diffCount}件</span>
            </div>
          </Card>
          
          <SectionLabel right={<span style={{ fontSize: 12.5, color: "var(--fg-muted)", fontWeight: 700 }}>QRで読取 または タップ入力</span>}>棚卸しリスト</SectionLabel>
          <input value={stQuery} onChange={(e) => setStQuery(e.target.value)} placeholder="品名・QR・棚番で検索"
            style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--border-2)", borderRadius: 12, padding: "9px 12px", fontSize: 13.5, fontWeight: 700, color: "var(--fg)", background: "var(--surface)", outline: "none" }} />
          <div style={{ display: "flex", gap: 7, marginTop: 8 }}>
            {([["all", "すべて"], ["uncounted", "未カウント"], ["diff", "差異あり"]] as const).map(([k, lbl]) => (
              <button key={k} onClick={() => setStFilter(k)} style={{ padding: "6px 13px", borderRadius: 999, border: "1px solid " + (stFilter === k ? "var(--brand-accent)" : "var(--border)"), background: stFilter === k ? "var(--brand-tint)" : "var(--surface)", color: stFilter === k ? "var(--brand-accent)" : "var(--fg-muted)", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "var(--font-jp)" }}>{lbl}</button>
            ))}
          </div>
          {/* 商品マスタ読込後のみ表示。読込前に EX 行(counted 付き)を足すと live 商品の初回同期(every counted===null 条件)が阻害されるため。 */}
          {liveProducts && <button onClick={() => setExOpen(o => !o)} style={{ marginTop: 8, width: "100%", padding: "8px", borderRadius: 11, border: "1px dashed var(--border-strong)", background: "var(--surface-2)", color: "var(--brand-accent)", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "var(--font-jp)" }}>{exOpen ? "閉じる" : "+ リストにない商品を記録"}</button>}
          {exOpen && liveProducts && (
            <Card pad={12} style={{ marginTop: 8 }}>
              <input value={exName} onChange={e => setExName(e.target.value)} placeholder="商品名（マスタ未登録）" style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--border-2)", borderRadius: 11, padding: "10px 12px", fontSize: 14, fontWeight: 700, color: "var(--fg)", background: "var(--surface)", outline: "none", fontFamily: "var(--font-jp)" }} />
              <input value={exQty} onChange={e => setExQty(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="数量" style={{ width: "100%", boxSizing: "border-box", marginTop: 8, border: "1px solid var(--border-2)", borderRadius: 11, padding: "10px 12px", fontSize: 14, fontWeight: 700, color: "var(--fg)", background: "var(--surface)", outline: "none", fontFamily: "var(--font-mono)" }} />
              <Btn full size="sm" style={{ marginTop: 10 }} disabled={!exName.trim()} onClick={() => {
                const qn = Number(exQty) || 0;
                setInv(prev => [{ id: "EX-" + Date.now(), name: exName.trim(), image: null, qr: "", loc: "リスト外", system: 0, counted: qn, icon: "package", report: [{ reason: "予定外（リスト外）", qty: qn }] }, ...prev]);
                setExName(""); setExQty("1"); setExOpen(false);
              }}>追加（差異・現場報告に計上）</Btn>
            </Card>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {inv.filter((it) => {
              const qn = stQuery.trim().toLowerCase();
              if (qn && !(`${it.name || ""} ${it.qr || ""} ${it.loc || ""}`.toLowerCase().includes(qn))) return false;
              if (stFilter === "uncounted") return it.counted === null;
              if (stFilter === "diff") return it.counted !== null && it.counted !== it.system;
              return true;
            }).map(i => {
              const diff = i.counted !== null ? i.counted - i.system : null;
              const short = diff !== null && diff < 0;
              const hasReport = i.report && i.report.length > 0;
              return (
                <Card key={i.id} pad={13} style={{ borderColor: hasReport ? "var(--danger-bright)" : "var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }} onClick={() => openEdit(i)}>
                    <ItemThumb src={i.counted === null ? (i.image ?? undefined) : undefined} icon={i.counted === null ? i.icon : (diff === 0 ? "checkCircle" : "alert")} size={42} radius={11} bg={i.counted === null ? "var(--surface-3)" : (diff === 0 ? "var(--success-tint)" : "var(--warning-tint)")} col={i.counted === null ? "var(--fg-muted)" : (diff === 0 ? "var(--success-bright)" : "var(--warning-bright)")} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 800, color: "var(--fg)" }}>{i.name}</div>
                      <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", marginTop: 2 }}>{i.qr} ・ 棚番 {i.loc} ・ 帳簿 {i.system}</div>
                    </div>
                    {i.counted === null
                      ? <span style={{ fontSize: 12.5, color: "var(--brand-accent)", fontWeight: 800, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>入力<Icon name="chevronRight" size={15} /></span>
                      : <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--fg)" }}>{i.counted}</div>
                          {diff !== 0 ? <div style={{ fontSize: 11.5, fontWeight: 800, color: diff > 0 ? "var(--warning-bright)" : "var(--danger-bright)", whiteSpace: "nowrap" }}>差異 {diff > 0 ? "+" : ""}{diff}</div> : <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--success-bright)" }}>一致</div>}
                        </div>}
                  </div>
                  {i.counted !== null && (short || hasReport) && (
                    <div style={{ marginTop: 11, paddingTop: 11, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                      {short && <Badge variant="danger" icon="minus">不足 {-diff!}</Badge>}
                      {(i.report || []).map((e: any, ri: number) => <Badge key={ri} variant="danger" icon={REASON_ICON[e.reason] || "alert"}>{e.reason} {e.qty}</Badge>)}
                      {reportPhotos(i) > 0 && <Badge variant="neutral" icon="image">{reportPhotos(i)}</Badge>}
                      <button onClick={() => setDmg(i.id)} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", color: hasReport ? "var(--danger-bright)" : "var(--brand-accent)", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "var(--font-jp)", whiteSpace: "nowrap" }}>
                        <Icon name="camera" size={15} />{hasReport ? "報告を編集" : "不足・破損を報告"}
                      </button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>

        <div style={{ padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--border)", background: "var(--bg)" }}>
          {done ? (
            confirmed ? (
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ flex: 1, textAlign: "center", color: "var(--success-bright)", fontWeight: 800, fontSize: 14 }}>棚卸し確定済み ✓</div>
                <Btn size="lg" variant="secondary" onClick={() => { setInv(initInv()); setConfirmed(false); setStQuery(""); setStFilter("all"); }}>新規棚卸し</Btn>
              </div>
            ) : (
              <Btn full size="lg" variant="success" icon="check" onClick={() => { confirmStocktake(); setConfirmed(true); }}>棚卸しを確定</Btn>
            )
          ) : (
            <Btn full size="lg" icon="scan" onClick={scanNext}>QRをスキャンして数える（残り {inv.length - counted}）</Btn>
          )}
        </div>
      </div>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title="実数量を入力">
        {editItem && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 18, padding: 12, borderRadius: 12, background: "var(--surface-2)" }}>
              <ItemThumb src={editItem.image} icon={editItem.icon} size={40} radius={10} bg="var(--surface-3)" col="var(--brand-accent)" />
              <div><div style={{ fontSize: 15, fontWeight: 800, color: "var(--fg)" }}>{editItem.name}</div><div style={{ fontSize: 12, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)" }}>{editItem.qr} ・ 棚番 {editItem.loc} ・ 帳簿数 {editItem.system}</div></div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 14 }}>
              <button onClick={() => setVal(v => String(Math.max(0, (parseInt(v) || 0) - 1)))} style={{ width: 48, height: 48, borderRadius: 14, border: "1px solid var(--border-strong)", background: "var(--surface-2)", color: "var(--fg)", display: "grid", placeItems: "center", cursor: "pointer" }}><Icon name="minus" size={22} stroke={2.6} /></button>
              <input value={val} onChange={e => setVal(e.target.value.replace(/\D/g, ""))} inputMode="numeric" style={{ width: 110, textAlign: "center", fontSize: 34, fontWeight: 800, fontFamily: "var(--font-mono)", background: "transparent", border: "none", borderBottom: "2px solid var(--brand)", color: "var(--fg)", outline: "none", padding: "4px 0" }} />
              <button onClick={() => setVal(v => String((parseInt(v) || 0) + 1))} style={{ width: 48, height: 48, borderRadius: 14, border: "1px solid var(--border-strong)", background: "var(--surface-2)", color: "var(--fg)", display: "grid", placeItems: "center", cursor: "pointer" }}><Icon name="plus" size={22} stroke={2.6} /></button>
            </div>
            {(parseInt(val) || 0) < editItem.system && (
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
                <Badge variant="danger" icon="minus">帳簿より {editItem.system - (parseInt(val) || 0)} 不足</Badge>
              </div>
            )}
            <Btn full size="lg" icon="check" onClick={save}>確定</Btn>
            {(parseInt(val) || 0) < editItem.system && (
              <div style={{ marginTop: 10 }}>
                <Btn full variant="danger" icon="camera" onClick={() => { save(); setDmg(editItem.id); }}>不足・破損を報告する</Btn>
              </div>
            )}
          </>
        )}
      </Sheet>
      
      <DamageReportSheet open={!!dmg} product={inv.find(i => i.id === dmg)} onClose={() => setDmg(null)} onSave={saveReport} />
      <ProductQrScanner
        open={scanOpen}
        title="棚卸 QRスキャン"
        products={inv}
        description="商品QRを読み取り、該当商品の実数量入力を開きます。"
        onClose={() => setScanOpen(false)}
        onMatch={(product) => {
          setScanOpen(false);
          openEdit(product);
        }}
      />
    </>
  );
}

const INVENTORY_FALLBACK = [
  { id: "INV-01", name: "レボリューションコーン赤白",  qr: "AS-CONE-1001", loc: "A-01", system: 480, counted: null as number | null, report: [], icon: "cone" },
  { id: "INV-02", name: "コーンバー黒/黄",    qr: "AS-BAR-2200",  loc: "A-02", system: 210, counted: null as number | null, report: [], icon: "minus" },
  { id: "INV-03", name: "単管バリケード",   qr: "AS-TANK-3010", loc: "B-01", system: 96,  counted: null as number | null, report: [], icon: "package" },
  { id: "INV-04", name: "工事看板 A型",     qr: "AS-SIGN-4055", loc: "B-04", system: 54,  counted: null as number | null, report: [], icon: "flag" },
  { id: "INV-05", name: "ガードフェンス",   qr: "AS-FENCE-6001", loc: "C-02", system: 132, counted: null as number | null, report: [], icon: "shield" },
  { id: "INV-06", name: "ウェイト 10kg",    qr: "AS-WEIGHT-700", loc: "C-05", system: 300, counted: null as number | null, report: [], icon: "weight" },
  { id: "INV-07", name: "LED保安灯",        qr: "AS-LED-5120",  loc: "D-01", system: 88,  counted: null as number | null, report: [], icon: "sun" },
  { id: "INV-08", name: "矢印板",           qr: "AS-ARROW-8030", loc: "D-03", system: 40,  counted: null as number | null, report: [], icon: "navigation" },
];
