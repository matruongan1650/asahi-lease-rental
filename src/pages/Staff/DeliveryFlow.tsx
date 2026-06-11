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
  PhotoTile,
  makePhoto,
  MapMock,
  Photo
} from "../../components/staff/StaffUI";
import DocumentViewer from "../../components/DocumentViewer";

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
}

const DLV_STEPS = ["確認", "移動", "写真", "サイン", "完了"];

export default function DeliveryFlow({ o, onComplete, onExit }: DeliveryFlowProps) {
  const [step, setStep] = useState(0);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [signed, setSigned] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState(false);

  // 保安車両の貸出記録（走行距離・状態）。注文に車両品目がある場合のみ入力。
  const [vehKm, setVehKm] = useState("");
  const [vehCondition, setVehCondition] = useState("");
  const hasVehicleItems = ((o.rawOrder?.items || o.items || []) as any[]).some((i: any) =>
    ["軽トラック", "軽バン", "2tノーマル", "2tロング", "2t Wキャブノーマル", "車両"].some(c => ((i.category || i.name || "") + "").includes(c))
  );
  const buildExtra = () => {
    if (!hasVehicleItems || (!vehKm && !vehCondition)) return undefined;
    return {
      vehicleCheckout: {
        km: vehKm,
        condition: vehCondition,
        fuelFull: true,
        recordedAt: new Date().toLocaleString("ja-JP"),
      },
    };
  };

  const addPhoto = () => {
    setPhotos(p => [...p, makePhoto(p.length)]);
  };

  const next = () => {
    setStep(s => Math.min(DLV_STEPS.length - 1, s + 1));
  };

  let footer = null;
  let body = null;

  if (step === 0) {
    body = (
      <>
        <SectionLabel>お届け先</SectionLabel>
        <Card style={{ marginBottom: 14 }} pad={6}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px" }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surface-3)", display: "grid", placeItems: "center", color: "var(--fg-muted)", flexShrink: 0 }}><Icon name="building" size={18} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", fontWeight: 600 }}>現場名 / 会社</div>
              <div style={{ fontSize: 14.5, color: "var(--fg)", fontWeight: 700, marginTop: 1 }}>
                {o.site}
                <div style={{ fontWeight: 500, color: "var(--fg-muted)", fontSize: 13 }}>{o.company}</div>
              </div>
            </div>
          </div>
          <div style={{ borderTop: "1px solid var(--border)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px" }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surface-3)", display: "grid", placeItems: "center", color: "var(--fg-muted)", flexShrink: 0 }}><Icon name="mapPin" size={18} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", fontWeight: 600 }}>住所</div>
              <div style={{ fontSize: 14.5, color: "var(--fg)", fontWeight: 700, marginTop: 1 }}>{o.addr}</div>
            </div>
          </div>
          <div style={{ borderTop: "1px solid var(--border)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px" }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surface-3)", display: "grid", placeItems: "center", color: "var(--fg-muted)", flexShrink: 0 }}><Icon name="user" size={18} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", fontWeight: 600 }}>担当者</div>
              <div style={{ fontSize: 14.5, color: "var(--fg)", fontWeight: 700, marginTop: 1 }}>{o.contact}</div>
            </div>
            <a
              href={`tel:${o.phone || "090-0000-0000"}`}
              onClick={e => !o.phone && e.preventDefault()}
              style={{ width: 40, height: 40, borderRadius: 11, background: "var(--success-tint)", color: "var(--success-bright)", display: "grid", placeItems: "center" }}
            >
              <Icon name="phone" size={18} />
            </a>
          </div>
        </Card>

        {o.rawOrder && (
          <>
            <SectionLabel>契約・注文情報</SectionLabel>
            <Card style={{ marginBottom: 14 }} pad={6}>
              <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                  <span style={{ color: "var(--fg-muted)", fontWeight: 600 }}>注文番号</span>
                  <span style={{ fontWeight: 700, color: "var(--fg)", fontFamily: "var(--font-mono)" }}>{o.rawOrder.orderNumber || o.rawOrder.id}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                  <span style={{ color: "var(--fg-muted)", fontWeight: 600 }}>レンタル期間</span>
                  <span style={{ fontWeight: 700, color: "var(--fg)", fontFamily: "var(--font-mono)" }}>
                    {o.rawOrder.rentalStartDate ? o.rawOrder.rentalStartDate.replace(/-/g, "/") : "未定"} 〜 {o.rawOrder.rentalEndDate ? o.rawOrder.rentalEndDate.replace(/-/g, "/") : "未定"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                  <span style={{ color: "var(--fg-muted)", fontWeight: 600 }}>納品希望日</span>
                  <span style={{ fontWeight: 700, color: "var(--fg)", fontFamily: "var(--font-mono)" }}>{o.rawOrder.deliveryDate || "指定なし"}</span>
                </div>
                {o.rawOrder.constructionNumber && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                    <span style={{ color: "var(--fg-muted)", fontWeight: 600 }}>工事番号</span>
                    <span style={{ fontWeight: 700, color: "var(--fg)", fontFamily: "var(--font-mono)" }}>{o.rawOrder.constructionNumber}</span>
                  </div>
                )}
                
                <div style={{ borderTop: "1px dashed var(--border)", margin: "2px 0" }} />
                
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                  <span style={{ color: "var(--fg-muted)", fontWeight: 600 }}>小計</span>
                  <span style={{ fontWeight: 700, color: "var(--fg)", fontFamily: "var(--font-mono)" }}>¥{o.rawOrder.subtotal?.toLocaleString() || "0"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                  <span style={{ color: "var(--fg-muted)", fontWeight: 600 }}>消費税 (10%)</span>
                  <span style={{ fontWeight: 700, color: "var(--fg)", fontFamily: "var(--font-mono)" }}>¥{o.rawOrder.tax?.toLocaleString() || "0"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14.5, alignItems: "center", marginTop: 2 }}>
                  <span style={{ color: "var(--fg)", fontWeight: 800 }}>合計金額</span>
                  <span style={{ fontWeight: 800, color: "var(--brand-accent)", fontFamily: "var(--font-mono)", fontSize: 16 }}>¥{o.rawOrder.total?.toLocaleString() || "0"}</span>
                </div>
              </div>
            </Card>
            
            <div style={{ marginBottom: 14 }}>
              <Btn full variant="secondary" icon="receipt_long" size="sm" onClick={() => setViewingDoc(true)} style={{ background: "var(--surface-2)", color: "var(--fg)", border: "1px solid var(--border)" }}>
                納品書 PDFを表示
              </Btn>
            </div>
          </>
        )}

        <SectionLabel right={<span style={{ fontSize: 13, color: "var(--fg-muted)", fontWeight: 700 }}>{o.items.reduce((a, b) => a + b.qty, 0)}点</span>}>積込品目</SectionLabel>
        <Card pad={6}>
          {o.items.map((it, i) => (
            <div key={i} style={{ borderTop: i ? "1px solid var(--border)" : "none", padding: "0 10px" }}>
              <ItemRow icon={it.icon} image={it.image} name={it.name} qty={it.qty} />
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
        <SectionLabel>現場写真의 撮影</SectionLabel>
        <p style={{ fontSize: 13.5, color: "var(--fg-muted)", margin: "0 2px 14px", lineHeight: 1.55 }}>設置状況・搬入場所の写真を撮影してください。最低1枚の撮影が必要です。</p>
        <button onClick={addPhoto} style={{ width: "100%", padding: "22px", borderRadius: 16, border: "1.5px dashed var(--border-strong)", background: "var(--surface-2)", color: "var(--brand-accent)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: 99, background: "var(--brand-tint)", display: "grid", placeItems: "center" }}><Icon name="camera" size={26} /></div>
          <span style={{ fontSize: 15, fontWeight: 800 }}>写真を撮影</span>
        </button>
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
                <input value={vehKm} onChange={e => setVehKm(e.target.value)} inputMode="numeric" placeholder="例: 35180"
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

        <SignaturePad onChange={setSigned} />
      </>
    );
    footer = <Btn full size="lg" variant="success" icon="check" disabled={!signed || (hasVehicleItems && !vehKm)} onClick={next}>サインを確定</Btn>;
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
              <div style={{ fontSize: 14.5, color: "var(--fg)", fontWeight: 700, marginTop: 1 }}>取得済み</div>
            </div>
          </div>
        </Card>
      </div>
    );
    footer = <Btn full size="lg" onClick={() => onComplete(o.firestoreId || o.id, signed, photos, buildExtra())}>次の配送へ</Btn>;
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)", minHeight: 0 }}>
      <TopBar title={step === 4 ? "完了" : o.site} sub={o.id} onBack={step === 4 ? undefined : onExit}
        right={step < 4 ? <IconBtn name="phone" onClick={() => window.open(`tel:${o.phone || "090-0000-0000"}`)} /> : null} />
      <div style={{ padding: "4px 16px 14px" }}><Stepper steps={DLV_STEPS} current={step} /></div>
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 16px 16px", minHeight: 0 }}>{body}</div>
      <div style={{ padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--border)", background: "var(--bg)", flexShrink: 0 }}>{footer}</div>

      {viewingDoc && o.rawOrder && (
        <DocumentViewer order={o.rawOrder} type="納品書" onClose={() => setViewingDoc(false)} />
      )}
    </div>
  );
}
