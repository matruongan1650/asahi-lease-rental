import React, { useMemo, useState } from "react";
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
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannedItems, setScannedItems] = useState<Record<string, boolean>>({});
  const [issues, setIssues] = useState<Record<string, { type: "missing" | "broken"; quantity: number; notes: string }>>({});

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
        qr: master ? getProductQrCode(master) : getProductQrCode({ id } as any),
        qrPayload: master?.qrPayload,
      };
    });
  }, [order, products]);
  const scannedCount = scanProducts.filter(item => scannedItems[item.id]).length;

  if (!order) {
    return (
      <div data-theme="light" style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-jp)" }}>
        <div style={{ maxWidth: 430, margin: "0 auto" }}>
          <Empty icon="clipboard" title="注文が存在しません" sub="一覧から業務を選択してください" />
        </div>
      </div>
    );
  }

  const updateIssue = (itemId: string, updates: Partial<{ type: "missing" | "broken"; quantity: number; notes: string }>) => {
    setIssues(prev => ({
      ...prev,
      [itemId]: {
        type: prev[itemId]?.type || "missing",
        quantity: prev[itemId]?.quantity || 1,
        notes: prev[itemId]?.notes || "",
        ...updates,
      },
    }));
  };

  const removeIssue = (itemId: string) => {
    setIssues(prev => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const complete = async () => {
    setSubmitting(true);
    const photoUrls = photos.map(p => p.dataUrl).filter(Boolean);
    const updates: any = {};

    if (role === "delivery") {
      updates.status = "レンタル中";
      updates.staffStatus = "配送完了";
      // レンタル開始日 = 実際の納品完了日。課金スナップショットを破棄して納品日基準で再計算させる。
      const now = new Date();
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
      const issueArray = Object.entries(issues).map(([itemId, value]) => ({ itemId, ...value }));
      updates.status = issueArray.length > 0 ? "一部返却" : "返却済み";
      updates.staffStatus = role === "warehouse" ? "検品完了" : "回収完了";
      updates.itemIssues = issueArray;
      if (photoUrls.length) updates[role === "warehouse" ? "warehousePhotos" : "collectionPhotos"] = photos;
      if (signature) updates[role === "warehouse" ? "warehouseSignature" : "collectionSignature"] = signature;
    }

    await updateOrder(order.id, updates);
    setSubmitting(false);
    navigate("/staff");
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
                  <div key={item.id || index} style={{ padding: "0 10px", borderTop: index ? "1px solid var(--border)" : "none" }}>
                    <ItemRow
                      icon="package"
                      image={item.image}
                      name={item.name}
                      sub={`${item.type === "rent" ? "レンタル" : "販売"} ・ ${item.qr}`}
                      qty={item.quantity || 1}
                      right={scannedItems[item.id] ? <Badge variant="success" icon="check">読取済</Badge> : undefined}
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
                  const issue = issues[item.id];
                  return (
                    <Card key={item.id || index} pad={14} style={{ borderColor: issue ? "var(--danger-bright)" : "var(--border)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                        <Icon name="package" size={22} color="var(--brand-accent)" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14.5, fontWeight: 900, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                          <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>予定 {item.quantity || 1}点</div>
                        </div>
                        <button onClick={() => issue ? removeIssue(item.id) : updateIssue(item.id, {})} style={{ border: "none", borderRadius: 999, padding: "8px 12px", background: issue ? "var(--danger-tint)" : "var(--surface-2)", color: issue ? "var(--danger-bright)" : "var(--brand-accent)", fontSize: 12.5, fontWeight: 900, cursor: "pointer" }}>
                          {issue ? "取消" : "問題あり"}
                        </button>
                      </div>
                      {issue && (
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)", display: "grid", gap: 10 }}>
                          <select value={issue.type} onChange={e => updateIssue(item.id, { type: e.target.value as any })} style={{ width: "100%", border: "1px solid var(--border-2)", borderRadius: 12, padding: "10px", fontWeight: 800 }}>
                            <option value="missing">紛失・不足</option>
                            <option value="broken">破損</option>
                          </select>
                          <input value={issue.quantity} type="number" min={1} max={item.quantity || 1} onChange={e => updateIssue(item.id, { quantity: Number(e.target.value) || 1 })} style={{ width: "100%", border: "1px solid var(--border-2)", borderRadius: 12, padding: "10px", fontWeight: 800, boxSizing: "border-box" }} />
                          <input value={issue.notes} onChange={e => updateIssue(item.id, { notes: e.target.value })} placeholder="メモ" style={{ width: "100%", border: "1px solid var(--border-2)", borderRadius: 12, padding: "10px", fontWeight: 700, boxSizing: "border-box" }} />
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
          {step === "check" && <Btn full iconRight="arrowRight" onClick={() => setStep(recovery ? "issue" : "sign")}>確認して進む</Btn>}
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
            setScannedItems(prev => ({ ...prev, [product.id]: true }));
            setScannerOpen(false);
          }}
        />
      </div>
    </div>
  );
}
