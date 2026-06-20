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
  SegmentControl,
  Empty,
  MetricCard,
} from "../../components/staff/StaffUI";
import { useMobileLive, pushFieldReportsLocal, STAFF } from "../../context/MobileLiveContext";
import ProductQrScanner from "../../components/staff/ProductQrScanner";
import OrderBus from "../../lib/orderBus";
import { confirmDialog } from "../../components/AppDialog";

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
          <Badge variant="neutral">{o.time} {o.returningEverything ? '(全量)' : '(一部)'}</Badge>
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

function InspectionHistoryCard({ rec, onReinspect }: any) {
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
      {rec.memo && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--fg-muted)", lineHeight: 1.5, display: "flex", gap: 5 }}>
          <Icon name="info" size={13} style={{ flexShrink: 0, marginTop: 1 }} />{rec.memo}
        </div>
      )}
      {onReinspect && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--border)", display: "flex", justifyContent: "flex-end" }}>
          <button onClick={() => onReinspect(rec)} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", color: "var(--brand-accent)", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "var(--font-jp)" }}>
            <Icon name="refresh" size={14} />再検品（差し戻し）
          </button>
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
  const [confirmingFinal, setConfirmingFinal] = useState(false);
  const [prods, setProds] = useState<any[]>([]);
  const [signed, setSigned] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  // 検品全体の自由記述メモ（特定品目に紐づかない所見）。
  const [overallMemo, setOverallMemo] = useState("");
  const [listTab, setListTab] = useState("queue");
  const [walkSearch, setWalkSearch] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);

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
    const extra: any = {};
    // 全体メモは受付・最終検品どちらの段階でも保存する。
    if (overallMemo.trim()) extra.overallMemo = overallMemo.trim();
    if (!isRecheck) return Object.keys(extra).length ? extra : undefined;
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
    // 現場検品の結果（counted/report）が引き継がれていればそれを初期値にする（無ければ expected）。
    setProds(o.products.map((p: any) => ({ ...p, scanned: false, counted: (p.counted != null ? p.counted : p.expected), report: p.report || [], manualConfirm: false })));
    setSigned(null);
    setOverallMemo("");
    setVehKm(""); setVehCondition(""); setFuelFull(true); setFuelCost(""); setFuelReceipt(null);
    setStep(0);
  };

  // 実カメラで読み取った QR と一致した品目のみ検品済みにする（以前は順番に立てる偽スキャナだった）。
  const markScanned = (product: any) => {
    setProds(ps => ps.map(p => (p.id === product.id || (p.qr && p.qr === product.qr)) ? { ...p, scanned: true } : p));
  };

  // QRラベルが破損・読取不可の場合の手動確認（admin に QR未照合と分かるようタグ付け）。
  const markManual = (product: any) => {
    setProds(ps => ps.map(p => p.id === product.id ? { ...p, scanned: true, manualConfirm: true } : p));
  };

  // 履歴から検品をやり直す（差し戻し）: 最終検品キューへ recheck 伝票を再投入する。
  const reinspect = async (rec: any) => {
    const ok = await confirmDialog("この検品をやり直しますか？最終検品キューに再追加されます。", {
      okText: "再検品する", cancelText: "キャンセル",
    });
    if (!ok) return;
    OrderBus.push("walkinReturns", {
      id: "WIN-RE-" + String(rec.orderNumber || rec.orderId || rec.id || "").replace(/[^A-Za-z0-9]/g, "") + "-" + Math.floor(Math.random() * 900 + 100),
      orderId: rec.orderId,
      orderNumber: rec.orderNumber,
      company: rec.company || "",
      contact: rec.contact || "",
      rentalNo: rec.orderNumber,
      time: new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) + " 再検品",
      note: "履歴からの差し戻し（再検品）",
      source: "reinspect",
      stage: "recheck",
      returningEverything: !!rec.returningEverything,
      products: (rec.products || []).map((p: any) => ({
        id: p.id, name: p.name, qr: p.qr || "", expected: p.expected || 0, counted: 0, report: [], icon: "package",
      })),
    } as any);
    setListTab("recheck");
  };

  const allScanned = prods.length > 0 && prods.every(p => p.scanned);
  const issues = prods.filter(p => (p.report && p.report.length > 0) || p.counted !== p.expected);
  
  const next = () => {
    setStep(s => Math.min(WIN_STEPS.length - 1, s + 1));
  };

  const saveReport = (report: any[]) => {
    setProds(ps => ps.map(p => p.id === sheet ? { ...p, report } : p));
    setSheet(null);
  };

  const confirmSign = () => {
    try {
      // 破損報告に加えて「数量不足(counted < expected)」も現場報告に含める。これまで不足のみのケースは
      // フッター/完了画面では「管理者へ送信済み」と表示されるのに、実際には何も送られていなかった（RecoveryFlow と統一）。
      const reportable = prods.map(p => {
        const shortage = Math.max(0, (Number(p.expected) || 0) - (Number(p.counted) || 0));
        const surplus = Math.max(0, (Number(p.counted) || 0) - (Number(p.expected) || 0));
        const rep = [...(p.report || [])];
        if (shortage > 0 && !rep.some((r: any) => r.reason === "数量不足")) {
          rep.push({ reason: "数量不足", qty: shortage });
        }
        if (surplus > 0 && !rep.some((r: any) => r.reason === "数量超過")) {
          rep.push({ reason: "数量超過", qty: surplus });
        }
        return { ...p, report: rep };
      });
      const hasIssues = reportable.some(p => p.report && p.report.length > 0);
      if (order && hasIssues) {
        pushFieldReportsLocal({
          source: "持込返却",
          ref: order.id,
          reporter: STAFF.souko.name,
          customer: order.company,
          site: "—（来庫返却）",
          products: reportable,
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
    const receptionList = walkinList.filter((w: any) => w.stage !== "recheck");
    const recheckList = walkinList.filter((w: any) => w.stage === "recheck");
    const visibleWalkin = listTab === "reception" ? receptionList : listTab === "recheck" ? recheckList : walkinList;
    const showHistory = listTab === "history";

    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)", minHeight: 0 }}>
        <TopBar title="持込返却 検品" sub="WALK-IN RETURN" onBack={onExit} />
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 16px 16px", minHeight: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
            <MetricCard label="受付待ち" value={receptionList.length} unit="件" icon="clock" tone="warning" onClick={() => setListTab("reception")} />
            <MetricCard label="最終検品" value={recheckList.length} unit="件" icon="boxIn" tone="brand" onClick={() => setListTab("recheck")} />
            <MetricCard label="履歴" value={ml.returnInspections?.length || 0} unit="件" icon="fileCheck" tone="neutral" onClick={() => setListTab("history")} />
          </div>
          <SegmentControl
            active={listTab}
            onChange={setListTab}
            items={[
              { key: "queue", label: "すべて", count: walkinList.length },
              { key: "reception", label: "一次受付", count: receptionList.length },
              { key: "recheck", label: "最終検品", count: recheckList.length },
              { key: "history", label: "履歴", count: ml.returnInspections?.length || 0 },
            ]}
          />

          <div style={{ marginTop: 14 }}>
            {showHistory ? (
              <>
                <SectionLabel right={<span style={{ fontSize: 12.5, color: "var(--fg-muted)", fontWeight: 700 }}>{ml.returnInspections?.length || 0}件</span>}>検品履歴</SectionLabel>
                {(!ml.returnInspections || ml.returnInspections.length === 0) ? (
                  <Empty icon="fileCheck" title="検品履歴はありません" sub="最終検品を完了するとここに保存されます" />
                ) : (
                  ml.returnInspections.slice(0, 30).map((rec: any) => <InspectionHistoryCard key={rec.id} rec={rec} onReinspect={reinspect} />)
                )}
              </>
            ) : (
              <>
                <SectionLabel right={<span style={{ fontSize: 12.5, color: "var(--fg-muted)", fontWeight: 700 }}>{visibleWalkin.length}件</span>}>受付伝票</SectionLabel>
                <div style={{ position: "relative", marginBottom: 12 }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--fg-subtle)", pointerEvents: "none" }}><Icon name="search" size={18} /></span>
                  <input value={walkSearch} onChange={(e) => setWalkSearch(e.target.value)} placeholder="レンタル番号・会社名で検索"
                    style={{ width: "100%", padding: "12px 14px 12px 40px", borderRadius: 12, border: "1px solid var(--border-2)", background: "var(--surface)", color: "var(--fg)", fontFamily: "var(--font-jp)", fontSize: 15, outline: "none" }} />
                </div>
                {(() => {
                  const q = walkSearch.trim().toLowerCase();
                  const shown = q ? visibleWalkin.filter((o: any) => [o.id, o.rentalNo, o.company, o.contact].some((v: any) => String(v || "").toLowerCase().includes(q))) : visibleWalkin;
                  return shown.length === 0 ? (
                    <Empty icon="clipboardCheck" title={q ? "該当する伝票がありません" : "受付伝票はありません"} sub={q ? "別のレンタル番号・会社名で検索してください" : "お客様の持込返却または現場回収後の最終検品がここに表示されます"} />
                  ) : (
                    shown.map((o: any) => <WalkinCard key={o.id} o={o} onClick={() => pick(o)} />)
                  );
                })()}
              </>
            )}
          </div>
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
        {/* お客様が返却受付時に送付した状態写真（dataURL 文字列の配列） */}
        {Array.isArray(order.photos) && order.photos.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <SectionLabel right={<span style={{ fontSize: 12.5, color: "var(--fg-muted)", fontWeight: 700 }}>{order.photos.length}枚</span>}>お客様からの状態写真</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {order.photos.map((url: string, i: number) => (
                typeof url === "string" && url.startsWith("data:") ? (
                  <img key={i} src={url} alt={`お客様写真 ${i + 1}`} style={{ aspectRatio: "1", width: "100%", objectFit: "cover", borderRadius: 12, border: "1px solid var(--border-2)", background: "#fff" }} />
                ) : null
              ))}
            </div>
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
              : <button onClick={() => setScannerOpen(true)} style={{ background: "var(--brand)", color: "#fff", border: "none", borderRadius: 99, padding: "11px 22px", fontSize: 15, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 6px 18px rgba(0,0,0,0.4)" }}><Icon name="scan" size={19} />QRをスキャン</button>}
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
            const over = p.counted > p.expected;
            const hasIssue = (p.report && p.report.length > 0) || short || over;
            return (
              <Card key={p.id} pad={13} style={{ borderColor: p.scanned ? (hasIssue ? "var(--danger-bright)" : "var(--border)") : "var(--border)", opacity: p.scanned ? 1 : 0.5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: p.scanned ? (hasIssue ? "var(--danger-tint)" : "var(--success-tint)") : "var(--surface-3)", color: p.scanned ? (hasIssue ? "var(--danger-bright)" : "var(--success-bright)") : "var(--fg-subtle)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                    <Icon name={p.scanned ? (hasIssue ? "alert" : "checkCircle") : "qr"} size={20} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--fg)", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-word" }}>{p.name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", marginTop: 1 }}>{p.qr} ・ 予定 {p.expected}</div>
                  </div>
                  {p.scanned
                    ? <QtyStepper value={p.counted} max={p.expected + 20} onChange={v => setProds(ps => ps.map(x => x.id === p.id ? { ...x, counted: v } : x))} />
                    : <button onClick={() => markManual(p)} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 4, background: "var(--surface-3)", border: "1px solid var(--border-2)", borderRadius: 9, color: "var(--brand-accent)", fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "var(--font-jp)", padding: "7px 9px", whiteSpace: "nowrap" }}><Icon name="edit" size={13} />手動で確認</button>}
                </div>
                {p.scanned && (
                  <div style={{ marginTop: 11, paddingTop: 11, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    {short && <Badge variant="warning" icon="minus">数量 {p.counted}/{p.expected}</Badge>}
                    {over && <Badge variant="warning" icon="plus">超過 {p.counted}/{p.expected}</Badge>}
                    {p.manualConfirm && <Badge variant="neutral" icon="edit">手動確認</Badge>}
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

        {/* 検品全体の自由記述メモ（特定品目に紐づかない所見・申し送り） */}
        <Card style={{ marginBottom: 14 }} pad={14}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--fg-muted)", marginBottom: 7 }}>検品メモ（任意）</div>
          <textarea value={overallMemo} onChange={e => setOverallMemo(e.target.value)} placeholder="例: 梱包を解いて返却。次回も同梱で対応希望。"
            style={{ width: "100%", minHeight: 60, borderRadius: 12, border: "1.5px solid var(--border-2)", background: "var(--surface)", color: "var(--fg)", padding: "11px 13px", fontSize: 14, fontFamily: "var(--font-jp)", outline: "none", boxSizing: "border-box", resize: "vertical" }} />
        </Card>

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
    footer = confirmingFinal ? (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 12.5, color: "var(--warning-bright)", fontWeight: 800, textAlign: "center" }}>確定すると在庫・請求に反映され、取り消せません。よろしいですか？</div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="secondary" onClick={() => setConfirmingFinal(false)}>戻る（修正）</Btn>
          <Btn full size="lg" variant="success" icon="check" onClick={() => onComplete(prods, order, signed, buildExtra())}>確定する</Btn>
        </div>
      </div>
    ) : (
      <Btn full size="lg" icon="check" onClick={() => setConfirmingFinal(true)}>完了</Btn>
    );
  }

  const stepLabels = isRecheck ? ["確認", "再検品", "確定", "完了"] : WIN_STEPS;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)", minHeight: 0 }}>
      <TopBar title={step === 3 ? "完了" : order.company} sub={(isRecheck ? "最終検品 ・ " : "一次受付 ・ ") + order.id} onBack={step === 3 ? undefined : (step === 0 ? () => setOrder(null) : () => setStep(s => Math.max(0, s - 1)))} />
      <div style={{ padding: "4px 16px 14px" }}><Stepper steps={stepLabels} current={step} /></div>
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 16px 16px", minHeight: 0 }}>{body}</div>
      <div style={{ padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--border)", background: "var(--bg)", flexShrink: 0 }}>{footer}</div>
      <DamageReportSheet open={!!sheet} product={prods.find(p => p && p.id === sheet)} onClose={() => setSheet(null)} onSave={saveReport} />
      <ProductQrScanner
        open={scannerOpen}
        title="返却品 QRスキャン"
        products={prods}
        description="この伝票に含まれる返却品のQRだけを照合します。"
        onClose={() => setScannerOpen(false)}
        onMatch={(product) => { markScanned(product); setScannerOpen(false); }}
      />
    </div>
  );
}
