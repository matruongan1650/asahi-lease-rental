import React, { useEffect, useState } from "react";
import Icon from "../../components/staff/Icon";
import { confirmDialog } from "../../components/AppDialog";
import { loadDraft, saveDraft, clearDraft } from "./flowDraft";
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
  DAMAGE_REASONS,
  REASON_ICON,
  DamageReportSheet,
  reportPhotos,
  MapMock,
  Photo,
  InfoRow,
  formatYen
} from "../../components/staff/StaffUI";
import DocumentViewer from "../../components/DocumentViewer";
import { pushFieldReportsLocal, STAFF } from "../../context/MobileLiveContext";
import ProductQrScanner from "../../components/staff/ProductQrScanner";

export interface RecoveryFlowProps {
  o: {
    id: string;
    firestoreId?: string;
    site: string;
    company: string;
    addr: string;
    dist: string;
    eta: string;
    phone: string;
    contact: string;
    products: Array<{ id: string; qr: string; qrPayload?: string; name: string; expected: number; icon: string; image?: string }>;
    note?: string;
    rawOrder?: any;
  };
  onComplete: (id: string, signature?: string | null, photos?: any[], inspected?: any[], extra?: any) => void;
  onExit: () => void;
}

const RTN_STEPS = ["確認", "移動", "スキャン", "サイン", "完了"];

export default function RecoveryFlow({ o, onComplete, onExit }: RecoveryFlowProps) {
  const draftKey = "rcv:" + o.id;
  const draft = loadDraft(draftKey, {} as any);
  const [step, setStep] = useState<number>(() => Number(draft.step) || 0);
  const [prods, setProds] = useState<any[]>(
    () => {
      const base = o.products.map(p => ({ ...p, scanned: false, counted: p.expected, report: [], manualConfirm: false }));
      // 退避済みの scanned/counted/report/手動確認 を復元する。
      if (Array.isArray(draft.prods)) {
        const byId: Record<string, any> = {};
        draft.prods.forEach((d: any) => { if (d && d.id != null) byId[String(d.id)] = d; });
        return base.map((b) => {
          const d = byId[String(b.id)];
          return d ? { ...b, scanned: !!d.scanned, counted: d.counted != null ? Number(d.counted) : b.counted, report: Array.isArray(d.report) ? d.report : [], manualConfirm: !!d.manualConfirm } : b;
        });
      }
      return base;
    },
  );
  const [signed, setSigned] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | null>(null); // product id for damage sheet
  const [viewingDoc, setViewingDoc] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  // 受領者不在（現場が無人）でもサイン無しで回収完了できる経路（配送フローと同等）。
  const [absentMode, setAbsentMode] = useState<boolean>(() => !!draft.absentMode);
  const [absentNote, setAbsentNote] = useState<string>(() => draft.absentNote || "");

  const pushReports = () => {
    try {
      // 破損報告に加えて「数量不足（counted < expected）」も現場報告として送る。
      // これまで不足は UI 上「送信済み」と表示されるのに admin へ送られていなかった。
      const reportable = prods.map(p => {
        const shortage = Math.max(0, (Number(p.expected) || 0) - (Number(p.counted) || 0));
        const surplus = Math.max(0, (Number(p.counted) || 0) - (Number(p.expected) || 0));
        const rep = [...(p.report || [])];
        if (shortage > 0 && !rep.some((r: any) => r.reason === "数量不足")) {
          rep.push({ reason: "数量不足", qty: shortage });
        }
        // 契約数より多く回収した場合も差異として報告（管理者が確認・調整できるように）。
        if (surplus > 0 && !rep.some((r: any) => r.reason === "数量超過")) {
          rep.push({ reason: "数量超過", qty: surplus });
        }
        return { ...p, report: rep };
      });
      const hasIssues = reportable.some(p => p.report && p.report.length > 0);
      if (hasIssues) {
        pushFieldReportsLocal({
          source: "回収",
          ref: o.id,
          reporter: STAFF.kaishu.name,
          customer: o.company,
          site: o.site,
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
  };

  const confirmSign = () => {
    pushReports();
    next();
  };

  // 完了時に渡す付帯情報（受領者不在の根拠など）。
  const buildExtra = () => (absentMode ? { collectionUnsigned: true, absentReason: absentNote.trim() } : undefined);

  const markScanned = (product: any) => {
    // 同一商品が複数行ある注文では、1回のスキャンで全行を検品済みにしない（未検品の最初の1行だけ立てる）。
    // 全行を立てると物理的に1個しか確認していなくても検品ゲートを通過できてしまう。
    // qr の空文字どうしが一致して無関係な行まで検品済みになるのも防ぐ。
    setProds(ps => {
      const t = ps.find(p => (p.id === product.id || (p.qr && p.qr === product.qr)) && !p.scanned);
      return t ? ps.map(p => p === t ? { ...p, scanned: true } : p) : ps;
    });
    setScannerOpen(false);
  };

  // QRラベルが破損・読取不可の場合の手動確認（admin に QR未照合と分かるようタグ付け）。
  const markManual = (product: any) => {
    setProds(ps => ps.map(p => (p.id === product.id) ? { ...p, scanned: true, manualConfirm: true } : p));
  };

  const allScanned = prods.every(p => p.scanned);
  const issues = prods.filter(p => (p.report && p.report.length > 0) || p.counted !== p.expected);

  const next = () => {
    setStep(s => Math.min(RTN_STEPS.length - 1, s + 1));
  };
  // 一つ前の手順へ戻る（誤って進んでも訂正できる）。
  const back = () => setStep(s => Math.max(0, s - 1));

  // 進捗をローカルに退避（カメラ切替/省メモリで WebView 破棄されても復元）。サインは保存しない。
  useEffect(() => {
    if (step >= RTN_STEPS.length - 1) return;
    saveDraft(draftKey, {
      step,
      absentMode,
      absentNote,
      prods: prods.map(p => ({ id: p.id, scanned: !!p.scanned, counted: p.counted, report: p.report || [], manualConfirm: !!p.manualConfirm })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, absentMode, absentNote, prods]);

  // 入力済みデータがある状態で離脱する場合は確認（誤タップで全破棄を防ぐ）。
  const hasEnteredData = prods.some(p => p.scanned || (p.report && p.report.length > 0)) || !!signed || absentNote.trim().length > 0;
  const handleExit = async () => {
    if (hasEnteredData) {
      const ok = await confirmDialog("入力中の内容（スキャン・数量・報告など）が破棄されます。回収を中止しますか？", {
        okText: "中止する",
        cancelText: "続ける",
        danger: true,
      });
      if (!ok) return;
    }
    clearDraft(draftKey);
    onExit();
  };

  const saveReport = (report: any[]) => {
    setProds(ps => ps.map(p => p.id === sheet ? { ...p, report } : p));
    setSheet(null);
  };

  let body = null;
  let footer = null;

  if (step === 0) {
    body = (
      <>
        <SectionLabel>回収先</SectionLabel>
        <Card style={{ marginBottom: 14 }} pad={0}>
          <InfoRow icon="building" label="現場名 / 会社" value={o.site} sub={o.company} last />
          <InfoRow icon="mapPin" label="住所" value={o.addr} />
          <InfoRow
            icon="user"
            label="担当者"
            value={o.contact || "未設定"}
            action={
            <a
              href={`tel:${o.phone || "090-0000-0000"}`}
              onClick={e => !o.phone && e.preventDefault()}
              style={{ width: 40, height: 40, borderRadius: 11, background: "var(--success-tint)", color: "var(--success-bright)", display: "grid", placeItems: "center" }}
            >
              <Icon name="phone" size={18} />
            </a>
            }
          />
        </Card>

        {o.rawOrder && (
          <>
            <SectionLabel>契約・注文情報</SectionLabel>
            <Card style={{ marginBottom: 14 }} pad={6}>
              <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13.5 }}>
                  <span style={{ color: "var(--fg-muted)", fontWeight: 600 }}>注文番号</span>
                  <span style={{ fontWeight: 700, color: "var(--fg)", fontFamily: "var(--font-mono)" }}>{o.rawOrder.orderNumber || o.rawOrder.id}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13.5 }}>
                  <span style={{ color: "var(--fg-muted)", fontWeight: 600 }}>レンタル期間</span>
                  <span style={{ fontWeight: 700, color: "var(--fg)", fontFamily: "var(--font-mono)" }}>
                    {o.rawOrder.rentalStartDate ? o.rawOrder.rentalStartDate.replace(/-/g, "/") : "未定"} 〜 {o.rawOrder.rentalEndDate ? o.rawOrder.rentalEndDate.replace(/-/g, "/") : "未定"}
                  </span>
                </div>
                {o.rawOrder.actualReturnDate && (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13.5 }}>
                    <span style={{ color: "var(--danger-bright)", fontWeight: 600 }}>実際の返却日</span>
                    <span style={{ fontWeight: 700, color: "var(--danger-bright)", fontFamily: "var(--font-mono)" }}>{o.rawOrder.actualReturnDate.replace(/-/g, "/")}</span>
                  </div>
                )}
                {o.rawOrder.constructionNumber && (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13.5 }}>
                    <span style={{ color: "var(--fg-muted)", fontWeight: 600 }}>工事番号</span>
                    <span style={{ fontWeight: 700, color: "var(--fg)", fontFamily: "var(--font-mono)" }}>{o.rawOrder.constructionNumber}</span>
                  </div>
                )}
                
                <div style={{ borderTop: "1px dashed var(--border)", margin: "2px 0" }} />
                
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13.5 }}>
                  <span style={{ color: "var(--fg-muted)", fontWeight: 600 }}>小計</span>
                  <span style={{ fontWeight: 700, color: "var(--fg)", fontFamily: "var(--font-mono)" }}>{formatYen(o.rawOrder.subtotal || 0)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13.5 }}>
                  <span style={{ color: "var(--fg-muted)", fontWeight: 600 }}>消費税 (10%)</span>
                  <span style={{ fontWeight: 700, color: "var(--fg)", fontFamily: "var(--font-mono)" }}>{formatYen(o.rawOrder.tax || 0)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14.5, alignItems: "center", marginTop: 2 }}>
                  <span style={{ color: "var(--fg)", fontWeight: 800 }}>合計金額</span>
                  <span style={{ fontWeight: 800, color: "var(--brand-accent)", fontFamily: "var(--font-mono)", fontSize: 16 }}>{formatYen(o.rawOrder.total || 0)}</span>
                </div>
              </div>
            </Card>

            <div style={{ marginBottom: 14 }}>
              <Btn full variant="secondary" icon="fileCheck" size="sm" onClick={() => setViewingDoc(true)} style={{ background: "var(--surface-2)", color: "var(--fg)", border: "1px solid var(--border)" }}>
                回収書 PDFを表示
              </Btn>
            </div>
          </>
        )}

        <SectionLabel right={<span style={{ fontSize: 13, color: "var(--fg-muted)", fontWeight: 700 }}>{prods.reduce((a, b) => a + b.expected, 0)}点</span>}>回収予定品目</SectionLabel>
        <Card pad={6}>
          {prods.map((it, i) => (
            <div key={it.id} style={{ borderTop: i ? "1px solid var(--border)" : "none", padding: "0 10px" }}>
              <ItemRow icon={it.icon} image={it.image} name={it.name} sub={it.qr} qty={it.expected} />
            </div>
          ))}
        </Card>
        {o.note && (
          <div style={{ marginTop: 14, padding: 14, borderRadius: 14, background: "var(--warning-tint)", border: "1px solid var(--warning-bright)", display: "flex", gap: 10 }}>
            <Icon name="info" size={18} color="var(--warning-bright)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 13.5, color: "var(--fg)", lineHeight: 1.5, fontWeight: 600 }}>{o.note}</div>
          </div>
        )}
      </>
    );
    footer = <Btn full size="lg" icon="navigation" onClick={next}>回収を開始する</Btn>;
  }

  if (step === 1) {
    body = (
      <>
        <MapMock dest={o.site} eta={o.eta} dist={o.dist} />
        <Card style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--brand-tint)", color: "var(--brand-accent)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name="mapPin" size={22} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: "var(--fg)" }}>{o.site}</div>
              <div style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 2 }}>{o.addr}</div>
            </div>
          </div>
          <Btn full variant="secondary" icon="navigation" size="sm" onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(o.addr)}`)}>ナビアプリで開く</Btn>
        </Card>
      </>
    );
    footer = <Btn full size="lg" icon="scan" onClick={next}>現場に到着・スキャン開始</Btn>;
  }

  if (step === 2) {
    const scannedCount = prods.filter(p => p.scanned).length;
    body = (
      <>
        {/* Stylised QR Scanner Box */}
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
              ? <div style={{ background: "var(--success-tint)", border: "1px solid var(--success-bright)", color: "var(--success-bright)", borderRadius: 99, padding: "8px 16px", fontSize: 13.5, fontWeight: 800, display: "flex", alignItems: "center", gap: 7 }}><Icon name="checkCircle" size={17} />全品目スキャン完了</div>
              : <button onClick={() => setScannerOpen(true)} style={{ background: "var(--brand)", color: "#fff", border: "none", borderRadius: 99, padding: "11px 22px", fontSize: 15, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 6px 18px rgba(0,0,0,0.4)" }}><Icon name="scan" size={19} />QRをスキャン</button>}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "16px 2px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ width: 4, height: 16, borderRadius: 2, background: "var(--brand)" }} />
            <span style={{ fontSize: 15, fontWeight: 800, color: "var(--fg)" }}>確認リスト</span>
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

  if (step === 3) {
    body = (
      <>
        <SectionLabel>回収確認サイン</SectionLabel>
        <p style={{ fontSize: 13.5, color: "var(--fg-muted)", margin: "0 2px 14px", lineHeight: 1.55 }}>お客様（{o.contact}）に回収内容をご確認いただき、ご署名をお願いします。</p>
        <Card style={{ marginBottom: 14 }} pad={14}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
            <span style={{ color: "var(--fg-muted)", fontWeight: 600 }}>回収点数</span>
            <span style={{ fontWeight: 800, color: "var(--fg)", fontFamily: "var(--font-mono)" }}>{prods.reduce((a, b) => a + b.counted, 0)} / {prods.reduce((a, b) => a + b.expected, 0)} 点</span>
          </div>
          {issues.length > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginTop: 9 }}>
              <span style={{ color: "var(--fg-muted)", fontWeight: 600 }}>不足・破損</span>
              <span style={{ fontWeight: 800, color: "var(--danger-bright)" }}>{issues.length}件 報告</span>
            </div>
          )}
        </Card>
        {!absentMode && <SignaturePad onChange={setSigned} />}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px dashed var(--border)" }}>
          {!absentMode ? (
            <Btn full variant="ghost" size="sm" onClick={() => setAbsentMode(true)}>受領者が不在の場合</Btn>
          ) : (
            <Card pad={14} style={{ border: "1.5px solid var(--warning-bright)", background: "var(--warning-tint)" }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--fg)", marginBottom: 8, display: "flex", alignItems: "center", gap: 7 }}>
                <Icon name="info" size={16} color="var(--warning-bright)" />受領者不在で回収完了
              </div>
              <p style={{ fontSize: 12.5, color: "var(--fg-muted)", margin: "0 0 10px", lineHeight: 1.5 }}>サインの代わりに状況を記録します。可能なら現場写真も報告に添付してください。</p>
              <textarea value={absentNote} onChange={e => setAbsentNote(e.target.value)} placeholder="例: 担当者不在のため指定品を回収。立会無しで持ち帰りました。"
                style={{ width: "100%", minHeight: 64, borderRadius: 12, border: "1.5px solid var(--border-2)", background: "var(--surface)", color: "var(--fg)", padding: "11px 13px", fontSize: 14, fontFamily: "var(--font-jp)", outline: "none", boxSizing: "border-box", resize: "vertical" }} />
              <Btn full variant="ghost" size="sm" style={{ marginTop: 8 }} onClick={() => { setAbsentMode(false); setAbsentNote(""); }}>サイン入力に戻る</Btn>
            </Card>
          )}
        </div>
      </>
    );
    footer = absentMode
      ? <Btn full size="lg" variant="success" icon="check" disabled={!absentNote.trim()} onClick={confirmSign}>受領者不在で完了</Btn>
      : <Btn full size="lg" variant="success" icon="check" disabled={!signed} onClick={confirmSign}>サインを確定</Btn>;
  }

  if (step === 4) {
    body = (
      <div style={{ textAlign: "center", padding: "30px 10px 10px" }}>
        <div style={{ width: 92, height: 92, borderRadius: 99, background: "var(--success-tint)", border: "2px solid var(--success-bright)", display: "grid", placeItems: "center", margin: "0 auto 20px", animation: "pop .4s cubic-bezier(.2,0,0,1)" }}>
          <Icon name="check" size={48} color="var(--success-bright)" stroke={2.6} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "var(--fg)" }}>回収完了</div>
        <div style={{ fontSize: 14, color: "var(--fg-muted)", marginTop: 6 }}>倉庫へ持ち帰り後、入庫処理を行ってください</div>
        <Card style={{ marginTop: 22, textAlign: "left" }} pad={6}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px" }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surface-3)", display: "grid", placeItems: "center", color: "var(--fg-muted)", flexShrink: 0 }}><Icon name="package" size={18} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", fontWeight: 600 }}>回収点数</div>
              <div style={{ fontSize: 14.5, color: "var(--fg)", fontWeight: 700, marginTop: 1 }}>{prods.reduce((a, b) => a + b.counted, 0)} / {prods.reduce((a, b) => a + b.expected, 0)} 点</div>
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
              <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", fontWeight: 600 }}>確認サイン</div>
              <div style={{ fontSize: 14.5, color: absentMode ? "var(--warning-bright)" : "var(--fg)", fontWeight: 700, marginTop: 1 }}>{absentMode ? "受領者不在（記録あり）" : "取得済み"}</div>
            </div>
          </div>
        </Card>
      </div>
    );
    footer = <Btn full size="lg" icon="warehouse" onClick={() => { clearDraft(draftKey); onComplete(o.firestoreId || o.id, signed, prods.flatMap(p => p.report?.flatMap(r => r.photos || []) || []), prods, buildExtra()); }}>倉庫へ戻る</Btn>;
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)", minHeight: 0 }}>
      <TopBar title={step === 4 ? "完了" : o.site} sub={o.id} onBack={step === 4 ? undefined : handleExit} right={step < 4 && o.phone ? <IconBtn name="phone" onClick={() => window.open(`tel:${o.phone}`)} /> : null} />
      <div style={{ padding: "4px 16px 14px" }}><Stepper steps={RTN_STEPS} current={step} /></div>
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 16px 16px", minHeight: 0 }}>{body}</div>
      <div style={{ padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--border)", background: "var(--bg)", flexShrink: 0 }}>
        {step >= 1 && step <= 3 ? (
          <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
            <Btn variant="secondary" icon="arrowLeft" onClick={back} style={{ flex: "0 0 auto", minWidth: 104 }}>戻る</Btn>
            <div style={{ flex: 1, minWidth: 0 }}>{footer}</div>
          </div>
        ) : footer}
      </div>

      <DamageReportSheet open={!!sheet} product={prods.find(p => p && p.id === sheet)} onClose={() => setSheet(null)} onSave={saveReport} />
      <ProductQrScanner
        open={scannerOpen}
        title="回収品 QRスキャン"
        products={prods}
        description="この注文に含まれる商品のQRだけを照合します。"
        onClose={() => setScannerOpen(false)}
        onMatch={markScanned}
      />

      {viewingDoc && o.rawOrder && (
        <DocumentViewer order={o.rawOrder} type="回収書" onClose={() => setViewingDoc(false)} />
      )}
    </div>
  );
}
