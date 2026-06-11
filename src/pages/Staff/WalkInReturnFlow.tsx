import React, { useState } from "react";
import Icon from "../../components/staff/Icon";
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
  SignaturePad,
  QtyStepper,
  DamageReportSheet,
  reportPhotos,
  REASON_ICON,
  statusVariant
} from "../../components/staff/StaffUI";
import { useMobileLive, pushFieldReportsLocal, STAFF } from "../../context/MobileLiveContext";

export interface WalkInReturnFlowProps {
  onExit: () => void;
  onComplete: (prods: any[], order: any, signature?: string | null, extra?: any) => void;
}

const WIN_STEPS = ["受付", "検品", "サイン", "完了"];

function WalkinCard({ o, onClick }: any) {
  const isRecheck = o.stage === "recheck";
  return (
    <Card onClick={onClick} style={{ marginBottom: 12 }} accent>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 700, color: "var(--brand-accent)", marginBottom: 5, whiteSpace: "nowrap" }}>{o.id}</div>
          <div style={{ fontSize: 16.5, fontWeight: 800, color: "var(--fg)", lineHeight: 1.25 }}>{o.company}</div>
          <div style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 3 }}>{o.contact} ・ {o.rentalNo}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>
          <Badge variant={isRecheck ? "brand" : "warning"} icon={isRecheck ? "boxIn" : "clock"}>
            {isRecheck ? "最終検品" : "一次受付"}
          </Badge>
          <Badge variant="neutral">{o.time}</Badge>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)", color: "var(--fg-muted)", fontSize: 13 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}><Icon name="qr" size={15} />{o.products.length}品目</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}><Icon name="package" size={15} />{o.products.reduce((a: number, b: any) => a + b.expected, 0)}点</span>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 3, color: "var(--brand-accent)", fontWeight: 700 }}>検品開始<Icon name="chevronRight" size={16} /></span>
      </div>
    </Card>
  );
}

function InspectionHistoryCard({ rec }: any) {
  const shortages = (rec.products || []).filter((p: any) => p.shortage > 0);
  return (
    <Card style={{ marginBottom: 10 }} pad={13}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: "var(--fg)" }}>{rec.company || "—"}</div>
          <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", marginTop: 2 }}>{rec.orderNumber || rec.id}</div>
        </div>
        <Badge variant={rec.hasShortage ? "danger" : "success"} icon={rec.hasShortage ? "alert" : "checkCircle"}>
          {rec.hasShortage ? "要確認" : "検品OK"}
        </Badge>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 11, paddingTop: 11, borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, color: "var(--fg-muted)", display: "flex", alignItems: "center", gap: 5 }}>
          <Icon name="package" size={14} />{rec.totalCounted}/{rec.totalExpected} 点
        </span>
        <span style={{ fontSize: 12, color: "var(--fg-subtle)" }}>{rec.inspectedAt}</span>
        {rec.collectionSignature && <Badge variant="neutral" icon="signature">サイン</Badge>}
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--fg-subtle)" }}>{rec.inspector}</span>
      </div>
      {shortages.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--danger-bright)", display: "flex", flexDirection: "column", gap: 2 }}>
          {shortages.map((p: any, i: number) => (
            <div key={i}>・{p.name}: 不足 {p.shortage}（{p.counted}/{p.expected}）</div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function WalkInReturnFlow({ onExit, onComplete }: WalkInReturnFlowProps) {
  const ml = useMobileLive();
  const walkinList = ml.walkin || [];
  const [order, setOrder] = useState<any>(null);
  const [step, setStep] = useState(0);
  const [prods, setProds] = useState<any[]>([]);
  const [signed, setSigned] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);

  // 保安車両の返却記録（最終検品時のみ）: 走行距離・状態・燃料
  const [vehKm, setVehKm] = useState("");
  const [vehCondition, setVehCondition] = useState("");
  const [fuelFull, setFuelFull] = useState(true);
  const [fuelCost, setFuelCost] = useState("");
  const [fuelReceipt, setFuelReceipt] = useState<string | null>(null);

  const isRecheck = order?.stage === "recheck";
  const priorSignature = order?.receptionSignature || order?.fieldSignature || null;
  const hasVehicleItems = (order?.products || []).some((p: any) =>
    (p.category || "").includes("車") || ["軽トラック", "軽バン", "2tノーマル", "2tロング", "2t Wキャブノーマル"].some(c => (p.category || p.name || "").includes(c))
  );

  const buildExtra = () => {
    if (!isRecheck) return undefined;
    const extra: any = {};
    if (hasVehicleItems && (vehKm || vehCondition || !fuelFull)) {
      extra.vehicleCheckin = {
        km: vehKm,
        condition: vehCondition,
        fuelFull,
        recordedAt: new Date().toLocaleString("ja-JP"),
      };
    }
    if (hasVehicleItems && !fuelFull && Number(fuelCost) > 0) {
      extra.fuelCharge = {
        amount: Number(fuelCost),
        note: "燃料補給費（満タン返却不足分）",
        receiptPhoto: fuelReceipt || undefined,
      };
    }
    return Object.keys(extra).length ? extra : undefined;
  };

  const pick = (o: any) => {
    setOrder(o);
    setProds(o.products.map((p: any) => ({ ...p, scanned: false, counted: p.expected, report: p.report || [] })));
    setSigned(null);
    setVehKm(""); setVehCondition(""); setFuelFull(true); setFuelCost(""); setFuelReceipt(null);
    setStep(0);
  };

  const scanNext = () => {
    setProds(ps => {
      const i = ps.findIndex(p => !p.scanned);
      if (i < 0) return ps;
      const c = [...ps];
      c[i] = { ...c[i], scanned: true };
      return c;
    });
  };

  const allScanned = prods.length > 0 && prods.every(p => p.scanned);
  const issues = prods.filter(p => (p.report && p.report.length > 0) || p.counted < p.expected);
  
  const next = () => {
    setStep(s => Math.min(WIN_STEPS.length - 1, s + 1));
  };

  const saveReport = (report: any[]) => {
    setProds(ps => ps.map(p => p.id === sheet ? { ...p, report } : p));
    setSheet(null);
  };

  const confirmSign = () => {
    try {
      const hasIssues = prods.some(p => p.report && p.report.length > 0);
      if (order && hasIssues) {
        pushFieldReportsLocal({
          source: "持込返却",
          ref: order.id,
          reporter: STAFF.souko.name,
          customer: order.company,
          site: "—（来庫返却）",
          products: prods,
        }).then(ids => {
          if (ids && ids.length) {
            console.log("[FieldReport] pushed", ids);
          }
        });
      }
    } catch (e) {
      console.warn("pushReports failed", e);
    }
    next();
  };

  if (!order) {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)", minHeight: 0 }}>
        <TopBar title="持込返却 検品" sub="WALK-IN RETURN" onBack={onExit} />
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 16px 16px", minHeight: 0 }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, padding: 14, borderRadius: 14, background: "var(--brand-tint)", border: "1px solid transparent" }}>
            <Icon name="info" size={18} color="var(--brand-accent)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 13.5, color: "var(--fg)", lineHeight: 1.5, fontWeight: 600 }}>お客様が直接持ち込まれた返却品を検品します。受付伝票を選択してください。</div>
          </div>
          <SectionLabel right={<span style={{ fontSize: 12.5, color: "var(--fg-muted)", fontWeight: 700 }}>{walkinList.length}件</span>}>本日の受付</SectionLabel>
          {walkinList.length === 0 && (
            <div style={{ padding: "18px 0", textAlign: "center", color: "var(--fg-muted)", fontSize: 13, fontWeight: 600 }}>本日の受付はありません</div>
          )}
          {walkinList.map((o: any) => <WalkinCard key={o.id} o={o} onClick={() => pick(o)} />)}
          <button style={{ width: "100%", marginTop: 4, padding: "14px", borderRadius: 14, border: "1.5px dashed var(--border-strong)", background: "var(--surface-2)", color: "var(--brand-accent)", fontSize: 14.5, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "var(--font-jp)" }}>
            <Icon name="search" size={18} />レンタル番号で検索
          </button>

          {ml.returnInspections && ml.returnInspections.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <SectionLabel right={<span style={{ fontSize: 12.5, color: "var(--fg-muted)", fontWeight: 700 }}>{ml.returnInspections.length}件</span>}>検品履歴</SectionLabel>
              {ml.returnInspections.slice(0, 30).map((rec: any) => <InspectionHistoryCard key={rec.id} rec={rec} />)}
            </div>
          )}
        </div>
      </div>
    );
  }

  let body = null;
  let footer = null;

  if (step === 0) {
    body = (
      <>
        <SectionLabel>返却受付</SectionLabel>
        <Card style={{ marginBottom: 14 }} pad={6}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px" }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surface-3)", display: "grid", placeItems: "center", color: "var(--fg-muted)", flexShrink: 0 }}><Icon name="building" size={18} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", fontWeight: 600 }}>会社 / 担当者</div>
              <div style={{ fontSize: 14.5, color: "var(--fg)", fontWeight: 700, marginTop: 1 }}>
                {order.company}
                <div style={{ fontWeight: 500, color: "var(--fg-muted)", fontSize: 13 }}>{order.contact}</div>
              </div>
            </div>
          </div>
          <div style={{ borderTop: "1px solid var(--border)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px" }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surface-3)", display: "grid", placeItems: "center", color: "var(--fg-muted)", flexShrink: 0 }}><Icon name="clipboard" size={18} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", fontWeight: 600 }}>レンタル番号</div>
              <div style={{ fontSize: 14.5, color: "var(--fg)", fontWeight: 700, marginTop: 1 }}>{order.rentalNo}</div>
            </div>
          </div>
        </Card>
        <SectionLabel right={<span style={{ fontSize: 13, color: "var(--fg-muted)", fontWeight: 700 }}>{prods.reduce((a, b) => a + b.expected, 0)}点</span>}>返却予定品目</SectionLabel>
        <Card pad={6}>
          {prods.map((it, i) => (
            <div key={it.id} style={{ borderTop: i ? "1px solid var(--border)" : "none", padding: "0 10px" }}>
              <ItemRow icon={it.icon} name={it.name} sub={it.qr} qty={it.expected} />
            </div>
          ))}
        </Card>
        {order.note && (
          <div style={{ marginTop: 14, padding: 14, borderRadius: 14, background: "var(--warning-tint)", border: "1px solid var(--warning-bright)", display: "flex", gap: 10 }}>
            <Icon name="info" size={18} color="var(--warning-bright)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 13.5, color: "var(--fg)", lineHeight: 1.5, fontWeight: 600 }}>{order.note}</div>
          </div>
        )}
      </>
    );
    footer = <Btn full size="lg" icon="scan" onClick={next}>検品を開始</Btn>;
  }

  if (step === 1) {
    const scannedCount = prods.filter(p => p.scanned).length;
    body = (
      <>
        {/* Fake QR Scanner */}
        <div style={{ position: "relative", height: 200, borderRadius: 16, overflow: "hidden", background: "#0a0d14", border: "1px solid var(--border)", marginBottom: 14 }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 45%, #1a2233, #0a0d14 70%)" }} />
          <div style={{ position: "absolute", left: "50%", top: "45%", transform: "translate(-50%,-50%)", opacity: 0.25, color: "#fff" }}><Icon name="qr" size={84} /></div>
          <div style={{ position: "absolute", left: "50%", top: "45%", transform: "translate(-50%,-50%)", width: 130, height: 130 }}>
            {[["0","0","auto","auto"],["0","auto","auto","0"],["auto","0","0","auto"],["auto","auto","0","0"]].map((c, i) => (
              <span key={i} style={{ position: "absolute", top: c[0], right: c[1], bottom: c[2], left: c[3], width: 26, height: 26,
                borderTop: (c[0] === "0" ? "3px solid var(--brand-accent)" : "none"), borderBottom: (c[2] === "0" ? "3px solid var(--brand-accent)" : "none"),
                borderLeft: (c[3] === "0" ? "3px solid var(--brand-accent)" : "none"), borderRight: (c[1] === "0" ? "3px solid var(--brand-accent)" : "none"),
                borderRadius: 4 }} />
            ))}
            {!allScanned && <div style={{ position: "absolute", left: 6, right: 6, height: 2, background: "var(--brand-accent)", boxShadow: "0 0 8px var(--brand-accent)", borderRadius: 2, animation: "scanline 2s ease-in-out infinite" }} />}
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 12, display: "flex", justifyContent: "center" }}>
            {allScanned
              ? <div style={{ background: "var(--success-tint)", border: "1px solid var(--success-bright)", color: "var(--success-bright)", borderRadius: 99, padding: "8px 16px", fontSize: 13.5, fontWeight: 800, display: "flex", alignItems: "center", gap: 7 }}><Icon name="checkCircle" size={17} />全品目 検品完了</div>
              : <button onClick={scanNext} style={{ background: "var(--brand)", color: "#fff", border: "none", borderRadius: 99, padding: "11px 22px", fontSize: 15, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 6px 18px rgba(0,0,0,0.4)" }}><Icon name="scan" size={19} />QRをスキャン</button>}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "16px 2px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ width: 4, height: 16, borderRadius: 2, background: "var(--brand)" }} />
            <span style={{ fontSize: 15, fontWeight: 800, color: "var(--fg)" }}>検品リスト</span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--brand-accent)", fontFamily: "var(--font-mono)" }}>{scannedCount}/{prods.length}</span>
        </div>
        <div style={{ marginBottom: 12 }}><ProgressBar value={scannedCount} max={prods.length} /></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {prods.map(p => {
            const short = p.counted < p.expected;
            const hasIssue = (p.report && p.report.length > 0) || short;
            return (
              <Card key={p.id} pad={13} style={{ borderColor: p.scanned ? (hasIssue ? "var(--danger-bright)" : "var(--border)") : "var(--border)", opacity: p.scanned ? 1 : 0.5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: p.scanned ? (hasIssue ? "var(--danger-tint)" : "var(--success-tint)") : "var(--surface-3)", color: p.scanned ? (hasIssue ? "var(--danger-bright)" : "var(--success-bright)") : "var(--fg-subtle)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                    <Icon name={p.scanned ? (hasIssue ? "alert" : "checkCircle") : "qr"} size={20} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", marginTop: 1 }}>{p.qr} ・ 予定 {p.expected}</div>
                  </div>
                  {p.scanned
                    ? <QtyStepper value={p.counted} max={p.expected} onChange={v => setProds(ps => ps.map(x => x.id === p.id ? { ...x, counted: v } : x))} />
                    : <span style={{ fontSize: 12, color: "var(--fg-subtle)", fontWeight: 700 }}>未検品</span>}
                </div>
                {p.scanned && (
                  <div style={{ marginTop: 11, paddingTop: 11, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    {short && <Badge variant="warning" icon="minus">数量 {p.counted}/{p.expected}</Badge>}
                    {(p.report || []).map((e: any, ri: number) => <Badge key={ri} variant="danger" icon={REASON_ICON[e.reason] || "alert"}>{e.reason} {e.qty}</Badge>)}
                    {reportPhotos(p) > 0 && <Badge variant="neutral" icon="image">{reportPhotos(p)}</Badge>}
                    <button onClick={() => setSheet(p.id)} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", color: hasIssue ? "var(--danger-bright)" : "var(--brand-accent)", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "var(--font-jp)", whiteSpace: "nowrap" }}>
                      <Icon name="camera" size={15} />{(p.report && p.report.length) ? "報告を編集" : "不足・破損を報告"}
                    </button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </>
    );
    footer = (
      <>
        {issues.length > 0 && <div style={{ fontSize: 12.5, color: "var(--danger-bright)", fontWeight: 700, textAlign: "center", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Icon name="send" size={14} />{issues.length}件の不足・破損を管理者へ報告します</div>}
        <Btn full size="lg" iconRight="arrowRight" disabled={!allScanned} onClick={next}>サインへ進む</Btn>
      </>
    );
  }

  if (step === 2) {
    body = (
      <>
        <SectionLabel>{isRecheck ? "最終検品の確定" : "返却確認サイン"}</SectionLabel>
        <p style={{ fontSize: 13.5, color: "var(--fg-muted)", margin: "0 2px 14px", lineHeight: 1.55 }}>
          {isRecheck
            ? "倉庫の最終検品結果を確定します。確定すると注文が完了し、請求書が発行可能になります。"
            : `お客様（${order.contact}）に検品結果をご確認いただき、ご署名をお願いします。`}
        </p>
        <Card style={{ marginBottom: 14 }} pad={14}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
            <span style={{ color: "var(--fg-muted)", fontWeight: 600 }}>検品点数</span>
            <span style={{ fontWeight: 800, color: "var(--fg)", fontFamily: "var(--font-mono)" }}>{prods.reduce((a, b) => a + b.counted, 0)} / {prods.reduce((a, b) => a + b.expected, 0)} 点</span>
          </div>
          {issues.length > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginTop: 9 }}>
              <span style={{ color: "var(--fg-muted)", fontWeight: 600 }}>不足・破損</span>
              <span style={{ fontWeight: 800, color: "var(--danger-bright)" }}>{issues.length}件 報告</span>
            </div>
          )}
        </Card>

        {/* 保安車両の返却記録（最終検品時のみ） */}
        {isRecheck && hasVehicleItems && (
          <Card style={{ marginBottom: 14 }} pad={14}>
            <SectionLabel>保安車両 返却チェック</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-muted)", marginBottom: 5 }}>返却時 走行距離（km）</div>
                <input value={vehKm} onChange={e => setVehKm(e.target.value)} inputMode="numeric" placeholder="例: 35420"
                  style={{ width: "100%", borderRadius: 12, border: "1.5px solid var(--border-2)", background: "var(--surface)", color: "var(--fg)", padding: "11px 13px", fontSize: 14.5, fontFamily: "var(--font-mono)", outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-muted)", marginBottom: 5 }}>車両の状態（キズ・汚れ等）</div>
                <input value={vehCondition} onChange={e => setVehCondition(e.target.value)} placeholder="例: 異常なし / 左ドアに擦りキズ"
                  style={{ width: "100%", borderRadius: 12, border: "1.5px solid var(--border-2)", background: "var(--surface)", color: "var(--fg)", padding: "11px 13px", fontSize: 14, fontFamily: "var(--font-jp)", outline: "none", boxSizing: "border-box" }} />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", padding: "4px 2px" }}>
                <input type="checkbox" checked={fuelFull} onChange={e => setFuelFull(e.target.checked)} style={{ width: 19, height: 19 }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--fg)" }}>燃料は満タンで返却された</span>
              </label>
              {!fuelFull && (
                <div style={{ borderRadius: 14, border: "1px solid var(--danger)", background: "var(--danger-tint)", padding: 12 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--danger-bright)", marginBottom: 8 }}>
                    満タンではありません — お客様へ連絡のうえ給油し、給油レシートを請求書に添付します。
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-muted)", marginBottom: 5 }}>給油金額（円・税抜）</div>
                  <input value={fuelCost} onChange={e => setFuelCost(e.target.value)} inputMode="numeric" placeholder="例: 4200"
                    style={{ width: "100%", borderRadius: 12, border: "1.5px solid var(--border-2)", background: "var(--surface)", color: "var(--fg)", padding: "11px 13px", fontSize: 14.5, fontFamily: "var(--font-mono)", outline: "none", boxSizing: "border-box", marginBottom: 9 }} />
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-muted)", marginBottom: 5 }}>給油レシート写真</div>
                  <input type="file" accept="image/*" onChange={e => {
                    const f = e.target.files && e.target.files[0];
                    if (!f) return;
                    const r = new FileReader();
                    r.onload = () => setFuelReceipt(String(r.result || ""));
                    r.readAsDataURL(f);
                  }} style={{ fontSize: 13 }} />
                  {fuelReceipt && <img src={fuelReceipt} alt="給油レシート" style={{ marginTop: 8, width: 90, borderRadius: 10, border: "1px solid var(--border-2)" }} />}
                </div>
              )}
            </div>
          </Card>
        )}

        {isRecheck && priorSignature ? (
          <Card pad={14}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--fg-muted)", marginBottom: 8 }}>お客様サイン（{order.source === "field_recovery" ? "現場回収時" : "一次受付時"}に取得済み）</div>
            <img src={priorSignature} alt="サイン" style={{ width: "100%", maxHeight: 120, objectFit: "contain", background: "#fff", borderRadius: 12, border: "1px solid var(--border-2)" }} />
          </Card>
        ) : (
          <SignaturePad onChange={setSigned} />
        )}
      </>
    );
    footer = (
      <Btn full size="lg" variant="success" icon="check"
        disabled={(!signed && !(isRecheck && priorSignature)) || (isRecheck && hasVehicleItems && !fuelFull && !(Number(fuelCost) > 0))}
        onClick={confirmSign}>
        {isRecheck ? "最終検品を確定" : "サインを確定"}
      </Btn>
    );
  }

  if (step === 3) {
    body = (
      <div style={{ textAlign: "center", padding: "30px 10px 10px" }}>
        <div style={{ width: 92, height: 92, borderRadius: 99, background: "var(--success-tint)", border: "2px solid var(--success-bright)", display: "grid", placeItems: "center", margin: "0 auto 20px", animation: "pop .4s cubic-bezier(.2,0,0,1)" }}>
          <Icon name="check" size={48} color="var(--success-bright)" stroke={2.6} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "var(--fg)" }}>{isRecheck ? "最終検品完了・入庫済み" : "一次検品完了"}</div>
        {!isRecheck && <div style={{ fontSize: 13, color: "var(--warning-bright)", fontWeight: 700, marginTop: 4 }}>この後、倉庫で最終検品を行って確定します</div>}
        <div style={{ fontSize: 14, color: "var(--fg-muted)", marginTop: 6 }}>{order.id} ・ {order.company}</div>
        <Card style={{ marginTop: 22, textAlign: "left" }} pad={6}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px" }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surface-3)", display: "grid", placeItems: "center", color: "var(--fg-muted)", flexShrink: 0 }}><Icon name="boxIn" size={18} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", fontWeight: 600 }}>入庫点数</div>
              <div style={{ fontSize: 14.5, color: "var(--fg)", fontWeight: 700, marginTop: 1 }}>{prods.reduce((a, b) => a + b.counted, 0)} 点</div>
            </div>
          </div>
          <div style={{ borderTop: "1px solid var(--border)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px" }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surface-3)", display: "grid", placeItems: "center", color: "var(--fg-muted)", flexShrink: 0 }}><Icon name="alert" size={18} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", fontWeight: 600 }}>不足・破損の報告</div>
              <div style={{ fontSize: 14.5, color: "var(--fg)", fontWeight: 700, marginTop: 1 }}>{issues.length > 0 ? `${issues.length}件（管理者へ送信済み）` : "なし"}</div>
            </div>
          </div>
          <div style={{ borderTop: "1px solid var(--border)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px" }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surface-3)", display: "grid", placeItems: "center", color: "var(--fg-muted)", flexShrink: 0 }}><Icon name="signature" size={18} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", fontWeight: 600 }}>お客様サイン</div>
              <div style={{ fontSize: 14.5, color: "var(--fg)", fontWeight: 700, marginTop: 1 }}>取得済み</div>
            </div>
          </div>
        </Card>
      </div>
    );
    footer = <Btn full size="lg" icon="check" onClick={() => onComplete(prods, order, signed, buildExtra())}>完了</Btn>;
  }

  const stepLabels = isRecheck ? ["確認", "再検品", "確定", "完了"] : WIN_STEPS;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)", minHeight: 0 }}>
      <TopBar title={step === 3 ? "完了" : order.company} sub={(isRecheck ? "最終検品 ・ " : "一次受付 ・ ") + order.id} onBack={step === 3 ? undefined : (step === 0 ? () => setOrder(null) : onExit)} />
      <div style={{ padding: "4px 16px 14px" }}><Stepper steps={stepLabels} current={step} /></div>
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 16px 16px", minHeight: 0 }}>{body}</div>
      <div style={{ padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--border)", background: "var(--bg)", flexShrink: 0 }}>{footer}</div>
      <DamageReportSheet open={!!sheet} product={prods.find(p => p && p.id === sheet)} onClose={() => setSheet(null)} onSave={saveReport} />
    </div>
  );
}
