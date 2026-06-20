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
  PhotoTile,
  makePhoto,
  MapMock,
  Photo,
  PhotoCaptureButton,
  InfoRow,
  formatYen,
  DamageReportSheet
} from "../../components/staff/StaffUI";
import DocumentViewer from "../../components/DocumentViewer";
import { pushFieldReportsLocal, STAFF } from "../../context/MobileLiveContext";

export interface DeliveryFlowProps {
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
    items: Array<{ name: string; qty: number; icon: string; image?: string }>;
    note?: string;
    rawOrder?: any;
  };
  onComplete: (id: string, signature?: string | null, photos?: any[], extra?: any) => void;
  onExit: () => void;
  staffName?: string;
}

const DLV_STEPS = ["確認", "移動", "写真", "サイン", "完了"];

export default function DeliveryFlow({ o, onComplete, onExit, staffName }: DeliveryFlowProps) {
  const draftKey = "dlv:" + o.id;
  const draft = loadDraft(draftKey, {} as any);
  const [step, setStep] = useState<number>(() => Number(draft.step) || 0);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [signed, setSigned] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState(false);
  // 受領者不在（建設現場で担当者が居ない）でもサイン無しで完了できる経路。理由を記録し admin が確認できる。
  const [absentMode, setAbsentMode] = useState<boolean>(() => !!draft.absentMode);
  const [absentNote, setAbsentNote] = useState<string>(() => draft.absentNote || "");
  // 配送時の破損・不足を品目ごとに報告（回収フローと同等）。report が付いた品目は admin の現場報告へ送る。
  const [dlvItems, setDlvItems] = useState<any[]>(
    () => {
      const base = (o.items || []).map((it, i) => ({ ...it, id: `${it.name}-${i}`, qr: "", report: [] as any[] }));
      // 退避済みの報告(report)を復元する（数量はマスター由来なので base を優先）。
      if (Array.isArray(draft.dlvReports)) {
        const byId: Record<string, any[]> = {};
        draft.dlvReports.forEach((r: any) => { if (r && r.id) byId[String(r.id)] = r.report || []; });
        return base.map((b) => (byId[b.id] ? { ...b, report: byId[b.id] } : b));
      }
      return base;
    },
  );
  const [reportSheetId, setReportSheetId] = useState<string | null>(null);
  const reportedCount = dlvItems.filter((it) => it.report && it.report.length > 0).length;

  const saveReport = (report: any[]) => {
    setDlvItems((items) => items.map((it) => (it.id === reportSheetId ? { ...it, report } : it)));
    setReportSheetId(null);
  };

  const pushDeliveryReports = () => {
    try {
      const reportable = dlvItems.filter((it) => it.report && it.report.length > 0);
      if (reportable.length) {
        pushFieldReportsLocal({
          source: "配送",
          ref: o.id,
          reporter: staffName || STAFF.souko.name,
          customer: o.company,
          site: o.site,
          products: reportable,
        }).then((ids: string[]) => { if (ids && ids.length) console.log("[FieldReport][配送] pushed", ids); });
      }
    } catch (e) {
      console.warn("delivery report failed", e);
    }
  };

  // 保安車両の貸出記録（走行距離・状態）。注文に車両品目がある場合のみ入力。
  const [vehKm, setVehKm] = useState<string>(() => draft.vehKm || "");
  const [vehCondition, setVehCondition] = useState<string>(() => draft.vehCondition || "");
  const hasVehicleItems = ((o.rawOrder?.items || o.items || []) as any[]).some((i: any) =>
    ["軽トラック", "軽バン", "2tノーマル", "2tロング", "2t Wキャブノーマル", "車両"].some(c => ((i.category || i.name || "") + "").includes(c))
  );
  const buildExtra = () => {
    const extra: any = {};
    if (hasVehicleItems && (vehKm.trim() || vehCondition)) {
      extra.vehicleCheckout = {
        km: vehKm.trim(),
        condition: vehCondition,
        fuelFull: true,
        recordedAt: new Date().toLocaleString("ja-JP"),
      };
    }
    if (absentMode) {
      extra.deliveryUnsigned = true;
      extra.absentReason = absentNote.trim();
    }
    const issues = dlvItems
      .filter((it) => it.report && it.report.length > 0)
      .map((it) => ({ name: it.name, report: it.report }));
    if (issues.length) extra.deliveryIssues = issues;
    return Object.keys(extra).length ? extra : undefined;
  };

  const addPhoto = (dataUrl: string) => {
    setPhotos(p => [...p, makePhoto(p.length, dataUrl)]);
  };

  const next = () => {
    setStep(s => Math.min(DLV_STEPS.length - 1, s + 1));
  };
  // 一つ前の手順へ戻る（誤って進んでも訂正できる）。状態は保持される。
  const back = () => setStep(s => Math.max(0, s - 1));

  // 進捗をローカルに退避（カメラ/地図切替や省メモリで WebView が破棄されても復元できるように）。
  // 写真・サインは容量対策のため保存しない（構造化された進捗のみ）。
  useEffect(() => {
    if (step >= DLV_STEPS.length - 1) return; // 完了画面は保存しない
    saveDraft(draftKey, {
      step,
      absentMode,
      absentNote,
      vehKm,
      vehCondition,
      dlvReports: dlvItems
        .filter((it) => it.report && it.report.length > 0)
        .map((it) => ({ id: it.id, report: it.report })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, absentMode, absentNote, vehKm, vehCondition, dlvItems]);

  // 入力済みデータがある状態でフローを離脱する際は確認する（誤タップで全破棄を防ぐ）。
  const hasEnteredData =
    photos.length > 0 || !!signed || absentNote.trim().length > 0 || reportedCount > 0 || vehKm.trim().length > 0;
  const handleExit = async () => {
    if (hasEnteredData) {
      const ok = await confirmDialog("入力中の内容（写真・サイン・報告など）が破棄されます。配送を中止しますか？", {
        okText: "中止する",
        cancelText: "続ける",
        danger: true,
      });
      if (!ok) return;
    }
    clearDraft(draftKey);
    onExit();
  };

  let footer = null;
  let body = null;

  if (step === 0) {
    body = (
      <>
        <SectionLabel>お届け先</SectionLabel>
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
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13.5 }}>
                  <span style={{ color: "var(--fg-muted)", fontWeight: 600 }}>納品希望日</span>
                  <span style={{ fontWeight: 700, color: "var(--fg)", fontFamily: "var(--font-mono)" }}>{o.rawOrder.deliveryDate || "指定なし"}</span>
                </div>
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
                納品書 PDFを表示
              </Btn>
            </div>
          </>
        )}

        <SectionLabel right={<span style={{ fontSize: 13, color: "var(--fg-muted)", fontWeight: 700 }}>{o.items.reduce((a, b) => a + b.qty, 0)}点{reportedCount > 0 ? ` ・ 報告${reportedCount}件` : ""}</span>}>積込品目</SectionLabel>
        <Card pad={6}>
          {dlvItems.map((it, i) => {
            const hasIssue = it.report && it.report.length > 0;
            return (
              <div key={it.id} style={{ borderTop: i ? "1px solid var(--border)" : "none", padding: "0 10px", display: "flex", alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <ItemRow icon={it.icon} image={it.image} name={it.name} qty={it.qty} />
                </div>
                <button onClick={() => setReportSheetId(it.id)} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: hasIssue ? "var(--danger-bright)" : "var(--brand-accent)", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "var(--font-jp)", whiteSpace: "nowrap", padding: "0 4px" }}>
                  <Icon name={hasIssue ? "alert" : "flag"} size={15} />{hasIssue ? `報告済(${it.report.length})` : "問題"}
                </button>
              </div>
            );
          })}
        </Card>
        <p style={{ fontSize: 12, color: "var(--fg-muted)", margin: "8px 4px 0", lineHeight: 1.5 }}>破損・数量不足などがあれば各品目の「問題」から報告できます（管理者へ通知されます）。</p>
        {o.note && (
          <div style={{ marginTop: 14, padding: 14, borderRadius: 14, background: "var(--warning-tint)", border: "1px solid var(--warning-bright)", display: "flex", gap: 10 }}>
            <Icon name="info" size={18} color="var(--warning-bright)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 13.5, color: "var(--fg)", lineHeight: 1.5, fontWeight: 600 }}>{o.note}</div>
          </div>
        )}
      </>
    );
    footer = <Btn full size="lg" icon="navigation" onClick={next}>配送を開始する</Btn>;
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
    footer = <Btn full size="lg" icon="flag" onClick={next}>現場に到着</Btn>;
  }

  if (step === 2) {
    body = (
      <>
        <SectionLabel>現場写真の撮影</SectionLabel>
        <p style={{ fontSize: 13.5, color: "var(--fg-muted)", margin: "0 2px 14px", lineHeight: 1.55 }}>設置状況・搬入場所の写真を撮影してください。最低1枚の撮影が必要です。</p>
        <PhotoCaptureButton onCapture={addPhoto} style={{ width: "100%", padding: "22px", borderRadius: 16, border: "1.5px dashed var(--border-strong)", background: "var(--surface-2)", color: "var(--brand-accent)", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: 99, background: "var(--brand-tint)", display: "grid", placeItems: "center" }}><Icon name="camera" size={26} /></div>
          <span style={{ fontSize: 15, fontWeight: 800 }}>写真を撮影</span>
        </PhotoCaptureButton>
        {photos.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
            {photos.map(p => <PhotoTile key={p.id} photo={p} onRemove={() => setPhotos(x => x.filter(y => y.id !== p.id))} />)}
          </div>
        )}
      </>
    );
    footer = <Btn full size="lg" iconRight="arrowRight" disabled={photos.length === 0} onClick={next}>サインへ進む（{photos.length}枚）</Btn>;
  }

  if (step === 3) {
    body = (
      <>
        <SectionLabel>受領サイン</SectionLabel>
        <p style={{ fontSize: 13.5, color: "var(--fg-muted)", margin: "0 2px 14px", lineHeight: 1.55 }}>お客様（{o.contact}）に内容をご確認いただき、ご署名をお願いします。</p>
        <Card style={{ marginBottom: 14 }}>
          <ItemRow icon="package" name="お届け品目" sub={`${o.items.length}品目`} qty={o.items.reduce((a, b) => a + b.qty, 0)} />
        </Card>

        {/* 保安車両の貸出記録: 走行距離・車両状態（燃料は満タンで貸出） */}
        {hasVehicleItems && (
          <Card style={{ marginBottom: 14 }} pad={14}>
            <SectionLabel>保安車両 貸出チェック</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-muted)", marginBottom: 5 }}>貸出時 走行距離（km）</div>
                <input value={vehKm} onChange={e => setVehKm(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="例: 35180"
                  style={{ width: "100%", borderRadius: 12, border: "1.5px solid var(--border-2)", background: "var(--surface)", color: "var(--fg)", padding: "11px 13px", fontSize: 14.5, fontFamily: "var(--font-mono)", outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-muted)", marginBottom: 5 }}>車両の状態（キズ・汚れ等）</div>
                <input value={vehCondition} onChange={e => setVehCondition(e.target.value)} placeholder="例: 異常なし"
                  style={{ width: "100%", borderRadius: 12, border: "1.5px solid var(--border-2)", background: "var(--surface)", color: "var(--fg)", padding: "11px 13px", fontSize: 14, fontFamily: "var(--font-jp)", outline: "none", boxSizing: "border-box" }} />
              </div>
              <div style={{ fontSize: 12.5, color: "var(--fg-muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="info" size={15} />燃料は満タンで貸出します（満タン返却をご案内ください）
              </div>
            </div>
          </Card>
        )}

        {!absentMode && <SignaturePad onChange={setSigned} />}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px dashed var(--border)" }}>
          {!absentMode ? (
            <Btn full variant="ghost" size="sm" onClick={() => setAbsentMode(true)}>受領者が不在の場合</Btn>
          ) : (
            <Card pad={14} style={{ border: "1.5px solid var(--warning-bright)", background: "var(--warning-tint)" }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--fg)", marginBottom: 8, display: "flex", alignItems: "center", gap: 7 }}>
                <Icon name="info" size={16} color="var(--warning-bright)" />受領者不在で設置完了
              </div>
              <p style={{ fontSize: 12.5, color: "var(--fg-muted)", margin: "0 0 10px", lineHeight: 1.5 }}>サインの代わりに状況を記録します。現場写真を必ず撮影してください。</p>
              <textarea value={absentNote} onChange={e => setAbsentNote(e.target.value)} placeholder="例: 担当者不在のため指定の搬入場所に設置。鍵は管理人に預けました。"
                style={{ width: "100%", minHeight: 64, borderRadius: 12, border: "1.5px solid var(--border-2)", background: "var(--surface)", color: "var(--fg)", padding: "11px 13px", fontSize: 14, fontFamily: "var(--font-jp)", outline: "none", boxSizing: "border-box", resize: "vertical" }} />
              <Btn full variant="ghost" size="sm" style={{ marginTop: 8 }} onClick={() => { setAbsentMode(false); setAbsentNote(""); }}>サイン入力に戻る</Btn>
            </Card>
          )}
        </div>
      </>
    );
    footer = absentMode
      ? <Btn full size="lg" variant="success" icon="check" disabled={!absentNote.trim() || (hasVehicleItems && !vehKm.trim())} onClick={next}>受領者不在で完了</Btn>
      : <Btn full size="lg" variant="success" icon="check" disabled={!signed || (hasVehicleItems && !vehKm.trim())} onClick={next}>サインを確定</Btn>;
  }

  if (step === 4) {
    body = (
      <div style={{ textAlign: "center", padding: "30px 10px 10px" }}>
        <div style={{ width: 92, height: 92, borderRadius: 99, background: "var(--success-tint)", border: "2px solid var(--success-bright)", display: "grid", placeItems: "center", margin: "0 auto 20px", animation: "pop .4s cubic-bezier(.2,0,0,1)" }}>
          <Icon name="check" size={48} color="var(--success-bright)" stroke={2.6} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "var(--fg)" }}>配送完了</div>
        <div style={{ fontSize: 14, color: "var(--fg-muted)", marginTop: 6 }}>{o.id} ・ {o.site}</div>
        <Card style={{ marginTop: 22, textAlign: "left" }} pad={6}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px" }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surface-3)", display: "grid", placeItems: "center", color: "var(--fg-muted)", flexShrink: 0 }}><Icon name="clock" size={18} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", fontWeight: 600 }}>完了時刻</div>
              <div style={{ fontSize: 14.5, color: "var(--fg)", fontWeight: 700, marginTop: 1 }}>{new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</div>
            </div>
          </div>
          <div style={{ borderTop: "1px solid var(--border)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px" }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surface-3)", display: "grid", placeItems: "center", color: "var(--fg-muted)", flexShrink: 0 }}><Icon name="image" size={18} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", fontWeight: 600 }}>撮影写真</div>
              <div style={{ fontSize: 14.5, color: "var(--fg)", fontWeight: 700, marginTop: 1 }}>{photos.length}枚</div>
            </div>
          </div>
          <div style={{ borderTop: "1px solid var(--border)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px" }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surface-3)", display: "grid", placeItems: "center", color: "var(--fg-muted)", flexShrink: 0 }}><Icon name="signature" size={18} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", fontWeight: 600 }}>受領サイン</div>
              <div style={{ fontSize: 14.5, color: absentMode ? "var(--warning-bright)" : "var(--fg)", fontWeight: 700, marginTop: 1 }}>{absentMode ? "受領者不在（記録あり）" : "取得済み"}</div>
            </div>
          </div>
        </Card>
      </div>
    );
    footer = <Btn full size="lg" onClick={() => { clearDraft(draftKey); pushDeliveryReports(); onComplete(o.firestoreId || o.id, signed, photos, buildExtra()); }}>次の配送へ</Btn>;
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)", minHeight: 0 }}>
      <TopBar title={step === 4 ? "完了" : o.site} sub={o.id} onBack={step === 4 ? undefined : handleExit}
        right={step < 4 && o.phone ? <IconBtn name="phone" onClick={() => window.open(`tel:${o.phone}`)} /> : null} />
      <div style={{ padding: "4px 16px 14px" }}><Stepper steps={DLV_STEPS} current={step} /></div>
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 16px 16px", minHeight: 0 }}>{body}</div>
      <div style={{ padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--border)", background: "var(--bg)", flexShrink: 0 }}>
        {step >= 1 && step <= 3 ? (
          <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
            <Btn variant="secondary" icon="arrowLeft" onClick={back} style={{ flex: "0 0 auto", minWidth: 104 }}>戻る</Btn>
            <div style={{ flex: 1, minWidth: 0 }}>{footer}</div>
          </div>
        ) : footer}
      </div>

      {viewingDoc && o.rawOrder && (
        <DocumentViewer order={o.rawOrder} type="納品書" onClose={() => setViewingDoc(false)} />
      )}

      <DamageReportSheet
        open={!!reportSheetId}
        product={dlvItems.find((it) => it.id === reportSheetId)}
        onClose={() => setReportSheetId(null)}
        onSave={saveReport}
      />
    </div>
  );
}
