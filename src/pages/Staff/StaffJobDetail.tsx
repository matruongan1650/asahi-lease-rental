import React, { useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Icon from "../../components/staff/Icon";
import {
  Badge,
  Btn,
  Card,
  Empty,
  InfoRow,
  ItemRow,
  PhotoCaptureButton,
  PhotoTile,
  SectionLabel,
  SignaturePad,
  Stepper,
  makePhoto,
  statusVariant,
  type Photo,
} from "../../components/staff/StaffUI";
import ProductQrScanner from "../../components/staff/ProductQrScanner";
import { useOrders } from "../../context/OrderContext";
import { useProducts } from "../../context/ProductContext";
import { getProductQrCode } from "../../utils/productQr";
import { deductOrderStock, restoreOrderStock } from "../../utils/stockLedger";
import { computeCompensationCharge } from "../../utils/billing";

type Step = "check" | "issue" | "sign";

function isRecoveryRole(role?: string) {
  return role === "collection" || role === "warehouse";
}

export default function StaffJobDetail() {
  const { role, orderId } = useParams<{ role: string; orderId: string }>();
  const navigate = useNavigate();
  const { orders, updateOrder } = useOrders();
  const { products } = useProducts();
  const order = orders.find(o => o.id === orderId || (o as any).firestoreId === orderId || o.orderNumber === orderId);

  const recovery = isRecoveryRole(role);
  const [step, setStep] = useState<Step>("check");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [signature, setSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // 連打による二重送信・在庫の二重計上を同期的に防ぐ（setSubmitting の再描画前に効く）。
  const submittingRef = useRef(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannedItems, setScannedItems] = useState<Record<string, boolean>>({});
  // 行単位キー(`${item.id}-${index}`)で管理する。item.id だけだと同一商品が複数行のとき1エントリを共有し、
  // 片方の操作が両方に反映され、報告数量が1行分に頭打ちになる（不足の過少報告→過少請求・過剰入庫）。
  const [issues, setIssues] = useState<Record<string, { itemId: string; type: "missing" | "broken"; quantity: number; notes: string }>>({});

  const steps = recovery ? ["確認", "問題", "サイン"] : ["確認", "サイン"];
  const stepIndex = step === "check" ? 0 : step === "issue" ? 1 : recovery ? 2 : 1;

  const totalQty = useMemo(
    () => (order?.items || []).reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0),
    [order],
  );
  const scanProducts = useMemo(() => {
    return (order?.items || []).map((item: any, index: number) => {
      const master = products.find((product: any) => product && (product.id === item.id || product.name === item.name));
      const id = item.id || master?.id || `order-item-${index}`;
      return {
        ...item,
        id,
        // 同一商品が複数行でも一意な照合キー（1行=その明細分の確認）。item.id だけだと重複行が共有してしまう。
        scanKey: `${id}-${index}`,
        qr: master ? getProductQrCode(master) : getProductQrCode({ id } as any),
        qrPayload: master?.qrPayload,
      };
    });
  }, [order, products]);
  const scannedCount = scanProducts.filter(item => scannedItems[item.scanKey]).length;

  if (!order) {
    return (
      <div data-theme="light" style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-jp)" }}>
        <div style={{ maxWidth: 430, margin: "0 auto" }}>
          <Empty icon="clipboard" title="注文が存在しません" sub="一覧から業務を選択してください" />
        </div>
      </div>
    );
  }

  const updateIssue = (rowKey: string, itemId: string, updates: Partial<{ type: "missing" | "broken"; quantity: number; notes: string }>) => {
    setIssues(prev => ({
      ...prev,
      [rowKey]: {
        itemId,
        type: prev[rowKey]?.type || "missing",
        quantity: prev[rowKey]?.quantity || 1,
        notes: prev[rowKey]?.notes || "",
        ...updates,
      },
    }));
  };

  const removeIssue = (rowKey: string) => {
    setIssues(prev => {
      const next = { ...prev };
      delete next[rowKey];
      return next;
    });
  };

  const complete = async () => {
    if (submittingRef.current) return; // 連打ガード（在庫の二重計上を防止）
    submittingRef.current = true;
    setSubmitting(true);
    const ord: any = order;
    const photoUrls = photos.map(p => p.dataUrl).filter(Boolean);
    const updates: any = {};

    if (role === "delivery") {
      const now = new Date();
      updates.status = "レンタル中";
      updates.staffStatus = "配送完了";
      updates.deliveryConfirmedAt = now.toISOString();
      // レンタル開始日 = 実際の納品完了日。課金スナップショットを破棄して納品日基準で再計算させる。
      updates.rentalStartDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      if (Array.isArray(order.items)) {
        updates.items = order.items.map((it: any) =>
          it && it.type === "rent" ? { ...it, monthlyBreakdown: [], calculatedPrice: undefined } : it,
        );
      }
      updates.invoiceBlocks = [];
      if (photoUrls.length) updates.deliveryPhotos = photos;
      if (signature) {
        updates.signature = signature;
        updates.deliverySignature = signature;
      }
    } else {
      // 行単位の報告を itemId×type で合算して1エントリに集約（複数行の不足/破損を正しく合計する）。
      const issueArray = Object.values(issues).reduce((acc: { itemId: string; type: "missing" | "broken"; quantity: number; notes: string }[], v) => {
        const ex = acc.find((a) => a.itemId === v.itemId && a.type === v.type);
        if (ex) {
          ex.quantity += v.quantity;
          if (v.notes) ex.notes = [ex.notes, v.notes].filter(Boolean).join(" / ");
        } else {
          acc.push({ itemId: v.itemId, type: v.type, quantity: v.quantity, notes: v.notes });
        }
        return acc;
      }, []);
      if (role === "warehouse") {
        // 倉庫最終検品 = 返却確定（終端）。ここで在庫を戻す。
        updates.status = issueArray.length > 0 ? "一部返却" : "返却済み";
        updates.staffStatus = "検品完了";
      } else {
        // 現場回収（collection）は終端ではない。最終検品まで「検品待ち」で在庫を貸出中のまま保持する
        //（返却済みにすると貸出中カウントから外れるのに在庫は戻っておらず、総数が一時的に欠ける）。
        updates.status = "検品待ち";
        updates.staffStatus = "回収完了";
        updates.collectionConfirmedAt = new Date().toISOString();
      }
      updates.itemIssues = issueArray;
      if (photoUrls.length) updates[role === "warehouse" ? "warehousePhotos" : "collectionPhotos"] = photos;
      if (signature) updates[role === "warehouse" ? "warehouseSignature" : "collectionSignature"] = signature;
    }

    // ── 在庫台帳の同期（products.stock = 現物在庫）───────────────────────────
    // 在庫は「受注確定で出庫（減算）／倉庫最終検品で入庫（加算）」が正。
    // 配送ではもう減算しない（受注確定時に減算済み）。ただし受注確定前モデルの旧注文（未出庫）
    // 救済として deductOrderStock を冪等に呼ぶ（stockDeducted 済みなら何もしない）。
    // 現場回収（collection）は倉庫最終検品で計上するため、ここでは在庫を動かさない。
    if (role === "delivery") {
      Object.assign(updates, deductOrderStock(ord));
    } else if (role === "warehouse") {
      // 倉庫最終検品 = 返却確定。良品分のみ在庫へ戻し、stockRestored を注文へ記録する。
      Object.assign(updates, restoreOrderStock(ord, updates.itemIssues));
      // 破損・紛失の弁償費を自動計上（請求書に ExtraCost として載る）。
      const comp = computeCompensationCharge({ items: order.items, itemIssues: updates.itemIssues }, products);
      if (comp) updates.compensationCharge = comp;
    }

    try {
      await updateOrder(order.id, updates);
      navigate("/staff");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div data-theme="light" style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--fg)", fontFamily: "var(--font-jp)" }}>
      <div style={{ maxWidth: 430, margin: "0 auto", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <div style={{ position: "sticky", top: 0, zIndex: 20, background: "var(--bg)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", minHeight: 56 }}>
            <button onClick={() => navigate(-1)} style={{ width: 40, height: 40, borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--fg)", display: "grid", placeItems: "center", cursor: "pointer" }}>
              <Icon name="chevronLeft" size={22} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "var(--brand-accent)", fontFamily: "var(--font-mono)" }}>{recovery ? "RETURN JOB" : "DELIVERY JOB"}</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{order.orderNumber || order.id}</div>
            </div>
            <Badge variant={statusVariant(order.status)}>{order.status || "未設定"}</Badge>
          </div>
          <div style={{ padding: "0 16px 12px" }}><Stepper steps={steps} current={stepIndex} /></div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "4px 16px 16px" }}>
          {step === "check" && (
            <>
              <SectionLabel>注文・現場情報</SectionLabel>
              <Card pad={0} style={{ marginBottom: 14 }}>
                <InfoRow icon="building" label="取引先" value={order.companyName || order.personName || "未設定"} last />
                <InfoRow icon="mapPin" label="場所" value={order.deliveryLocation || order.siteName || "未設定"} />
                {order.constructionNumber && <InfoRow icon="clipboard" label="工事番号" value={order.constructionNumber} />}
                <InfoRow icon="calendar" label="レンタル期間" value={`${order.rentalStartDate || "未定"} 〜 ${order.rentalEndDate || "未定"}`} />
              </Card>

              <SectionLabel right={<span style={{ fontSize: 12.5, color: "var(--fg-muted)", fontWeight: 800 }}>{totalQty}点</span>}>品目確認</SectionLabel>
              <div style={{ marginBottom: 10 }}>
                <Btn full icon="scan" variant="secondary" onClick={() => setScannerOpen(true)}>
                  商品QRをスキャン（{scannedCount}/{scanProducts.length}）
                </Btn>
              </div>
              <Card pad={6}>
                {scanProducts.map((item: any, index: number) => (
                  <div key={item.scanKey} style={{ padding: "0 10px", borderTop: index ? "1px solid var(--border)" : "none" }}>
                    <ItemRow
                      icon="package"
                      image={item.image}
                      name={item.name}
                      sub={`${item.type === "rent" ? "レンタル" : "販売"} ・ ${item.qr}`}
                      qty={item.quantity || 1}
                      right={scannedItems[item.scanKey] ? <Badge variant="success" icon="check">読取済</Badge> : undefined}
                    />
                  </div>
                ))}
              </Card>
            </>
          )}

          {step === "issue" && (
            <>
              <SectionLabel>不足・破損の報告</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(order.items || []).map((item: any, index: number) => {
                  const rowKey = `${item.id}-${index}`;
                  const issue = issues[rowKey];
                  return (
                    <Card key={rowKey} pad={14} style={{ borderColor: issue ? "var(--danger-bright)" : "var(--border)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                        <Icon name="package" size={22} color="var(--brand-accent)" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 900, color: "var(--fg)", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-word" }}>{item.name}</div>
                          <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>予定 {item.quantity || 1}点</div>
                        </div>
                        <button onClick={() => issue ? removeIssue(rowKey) : updateIssue(rowKey, item.id, {})} style={{ border: "none", borderRadius: 999, padding: "8px 12px", background: issue ? "var(--danger-tint)" : "var(--surface-2)", color: issue ? "var(--danger-bright)" : "var(--brand-accent)", fontSize: 12.5, fontWeight: 900, cursor: "pointer" }}>
                          {issue ? "取消" : "問題あり"}
                        </button>
                      </div>
                      {issue && (
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)", display: "grid", gap: 10 }}>
                          <select value={issue.type} onChange={e => updateIssue(rowKey, item.id, { type: e.target.value as any })} style={{ width: "100%", border: "1px solid var(--border-2)", borderRadius: 12, padding: "10px", fontWeight: 800 }}>
                            <option value="missing">紛失・不足</option>
                            <option value="broken">破損</option>
                          </select>
                          <input value={issue.quantity} type="number" min={1} max={item.quantity || 1} onChange={e => updateIssue(rowKey, item.id, { quantity: Math.min(Number(item.quantity || 1), Math.max(1, Number(e.target.value) || 1)) })} style={{ width: "100%", border: "1px solid var(--border-2)", borderRadius: 12, padding: "10px", fontWeight: 800, boxSizing: "border-box" }} />
                          <input value={issue.notes} onChange={e => updateIssue(rowKey, item.id, { notes: e.target.value })} placeholder="メモ" style={{ width: "100%", border: "1px solid var(--border-2)", borderRadius: 12, padding: "10px", fontWeight: 700, boxSizing: "border-box" }} />
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </>
          )}

          {step === "sign" && (
            <>
              <SectionLabel>現場写真</SectionLabel>
              <PhotoCaptureButton
                onCapture={(dataUrl) => setPhotos(prev => [...prev, makePhoto(prev.length, dataUrl)])}
                style={{ width: "100%", borderRadius: 16, border: "1.5px dashed var(--border-strong)", background: "var(--surface-2)", color: "var(--brand-accent)", padding: 18, display: "grid", placeItems: "center", marginBottom: 12 }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 900 }}><Icon name="camera" size={20} />写真を撮影</span>
              </PhotoCaptureButton>
              {photos.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 16 }}>
                  {photos.map(photo => <PhotoTile key={photo.id} photo={photo} onRemove={() => setPhotos(prev => prev.filter(p => p.id !== photo.id))} />)}
                </div>
              )}

              <SectionLabel>{recovery ? "回収確認サイン" : "受領サイン"}</SectionLabel>
              <SignaturePad onChange={setSignature} />
            </>
          )}
        </div>

        <div style={{ padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--border)", background: "var(--bg)", display: "flex", gap: 10 }}>
          {step !== "check" && <Btn variant="secondary" onClick={() => setStep(step === "sign" && recovery ? "issue" : "check")}>戻る</Btn>}
          {step === "check" && <Btn full iconRight="arrowRight" disabled={scannedCount < scanProducts.length} onClick={() => setStep(recovery ? "issue" : "sign")}>確認して進む</Btn>}
          {step === "issue" && <Btn full iconRight="arrowRight" onClick={() => setStep("sign")}>サインへ進む</Btn>}
          {step === "sign" && <Btn full variant="success" icon="check" disabled={!signature || submitting} onClick={complete}>{submitting ? "保存中..." : "完了する"}</Btn>}
        </div>
        <ProductQrScanner
          open={scannerOpen}
          title="注文商品 QRスキャン"
          products={scanProducts}
          description="この注文に含まれる商品のQRだけを照合します。"
          onClose={() => setScannerOpen(false)}
          onMatch={(product) => {
            // 同一商品の複数行は、まだ読み取っていない最初の行だけを1つ読取済みにする（1スキャン=1行）。
            setScannedItems(prev => {
              const target = scanProducts.find((p: any) => p.id === product.id && !prev[p.scanKey]);
              if (!target) return prev;
              return { ...prev, [target.scanKey]: true };
            });
            setScannerOpen(false);
          }}
        />
      </div>
    </div>
  );
}
