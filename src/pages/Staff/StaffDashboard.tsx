import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import Icon from "../../components/staff/Icon";
import {
  TopBar,
  Badge,
  Card,
  ProgressBar,
  BottomNav,
  Screen,
  Empty,
  SectionLabel,
  IconBtn
} from "../../components/staff/StaffUI";
import {
  MobileLiveProvider,
  useMobileLive,
  STAFF
} from "../../context/MobileLiveContext";
import DeliveryFlow from "./DeliveryFlow";
import RecoveryFlow from "./RecoveryFlow";
import WalkInReturnFlow from "./WalkInReturnFlow";
import {
  WhStock,
  WhInspect,
  WhStocktake,
  isVehicle
} from "./WarehouseViews";
import { useOrders } from "../../context/OrderContext";
import OrderBus from "../../lib/orderBus";
import { finalizePartialReturn } from "../../utils/returnProcessing";
import DocumentViewer from "../../components/DocumentViewer";

// ---------------------------------------------------------------------------
// Premium Industrial Stat Tile Component
// ---------------------------------------------------------------------------

function StatTile({ label, value, unit, icon, variant = "neutral", outdoorMode, onClick }: any) {
  const colors = outdoorMode ? {
    fg: "#00FF66",
    bg: "#000000",
    iconColor: "#00FF66",
    border: "#00FF66"
  } : {
    neutral: {
      fg: "var(--fg)",
      bg: "var(--surface-2)",
      iconColor: "var(--fg-muted)",
      border: "var(--border)"
    },
    brand: {
      fg: "var(--brand-accent)",
      bg: "var(--brand-tint)",
      iconColor: "var(--brand-accent)",
      border: "var(--brand)"
    },
    success: {
      fg: "var(--success-bright)",
      bg: "rgba(31,157,87,0.12)",
      iconColor: "var(--success-bright)",
      border: "rgba(31,157,87,0.25)"
    },
    danger: {
      fg: "var(--danger-bright)",
      bg: "rgba(220,58,40,0.12)",
      iconColor: "var(--danger-bright)",
      border: "rgba(220,58,40,0.25)"
    },
    warning: {
      fg: "var(--warning-bright)",
      bg: "rgba(229,150,27,0.12)",
      iconColor: "var(--warning-bright)",
      border: "rgba(229,150,27,0.25)"
    }
  }[variant as "neutral" | "brand" | "success" | "danger" | "warning"] || {
    fg: "var(--fg)", bg: "var(--surface-2)", iconColor: "var(--fg-muted)", border: "var(--border)"
  };

  return (
    <div
      onClick={onClick}
      style={{
        background: outdoorMode ? "#000000" : "linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%)",
        border: outdoorMode ? `3px solid ${colors.border}` : `1px solid ${colors.border}`,
        borderTop: outdoorMode ? `3px solid ${colors.border}` : `3px solid ${colors.iconColor}`,
        borderRadius: "16px",
        padding: "16px 14px",
        boxShadow: outdoorMode ? "none" : "0 4px 20px rgba(0, 0, 0, 0.15)",
        cursor: onClick ? "pointer" : undefined,
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
      }}
      className="active:scale-95 transform"
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ 
          width: 38, height: 38, borderRadius: 10, 
          background: colors.bg, display: "grid", placeItems: "center",
          border: outdoorMode ? "1px solid #00FF66" : "none"
        }}>
          <Icon name={icon} size={20} color={colors.iconColor} />
        </div>
        {onClick && <Icon name="chevronRight" size={15} color="var(--fg-subtle)" style={{ opacity: 0.8 }} />}
      </div>
      <div style={{ fontSize: outdoorMode ? 34 : 32, fontWeight: 900, color: colors.fg, fontFamily: "var(--font-mono)", marginTop: 12, lineHeight: 1, letterSpacing: "-0.02em" }}>
        {value}
        <span style={{ fontSize: 13, fontWeight: 800, marginLeft: 4, fontFamily: "var(--font-jp)", color: outdoorMode ? "#FFF" : "var(--fg-subtle)", verticalAlign: "baseline" }}>{unit}</span>
      </div>
      <div style={{ fontSize: 12, color: outdoorMode ? "#FFF" : "var(--fg-muted)", marginTop: 8, fontWeight: 800, letterSpacing: "0.02em" }}>{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// High-Contrast Alert Row
// ---------------------------------------------------------------------------
function AlertRow({ title, sub, outdoorMode, onClick }: any) {
  const c = outdoorMode ? "#FF3333" : "#EF4444";
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 16px",
        borderRadius: "16px",
        background: outdoorMode ? "#000000" : "var(--surface)",
        border: outdoorMode ? `3px solid ${c}` : "1px solid rgba(239,68,68,0.2)",
        borderLeft: `6px solid ${c}`,
        marginBottom: 10,
        cursor: "pointer"
      }}
      className="active:scale-[0.99] transition-transform"
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: "var(--fg)" }}>{title}</div>
        <div style={{ fontSize: 12.5, color: "var(--fg-muted)", marginTop: 2, fontWeight: 500 }}>{sub}</div>
      </div>
      <Icon name="chevronRight" size={16} color={c} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thumb-Zone Ergonomic Delivery Card (🔵 Cobalt Language)
// ---------------------------------------------------------------------------
function DeliveryCard({ o, done, outdoorMode, onClick }: any) {
  return (
    <Card 
      onClick={onClick} 
      style={{ 
        marginBottom: 12, 
        opacity: done ? 0.4 : 1, 
        padding: "20px 16px",
        background: outdoorMode ? "#000000" : "var(--surface)",
        border: outdoorMode ? "3px solid #00FF66" : "1px solid var(--border-2)",
        borderLeft: outdoorMode ? "8px solid #00FF66" : "6px solid var(--brand)",
      }}
      className="active:scale-[0.97] transition-transform"
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 800, color: "var(--brand-accent)", letterSpacing: "0.02em" }}>{o.id}</span>
            {o.priority === "急ぎ" && !done && <Badge variant="warning">急ぎ</Badge>}
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "var(--fg)", letterSpacing: "-0.01em", lineHeight: 1.35 }}>{o.site}</div>
          <div style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 5, fontWeight: 700 }}>{o.company}</div>
        </div>
        <Badge variant={done ? "success" : "brand"}>{done ? "完了" : o.window}</Badge>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 12, borderTop: outdoorMode ? "2px solid #00FF66" : "1px solid var(--border-2)" }}>
        <span style={{ fontSize: outdoorMode ? 14 : 12.5, fontWeight: 800, color: outdoorMode ? "#00FF66" : "var(--fg-muted)" }}>
          📦 {o.items.reduce((a: number, b: any) => a + b.qty, 0)} 点 / {o.items.length} 品目
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", fontWeight: 600 }}>
          <Icon name="package" size={14} color="var(--fg-subtle)" />
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--fg)" }}>
            {(o.items || []).reduce((a: number, b: any) => a + (b.qty || 0), 0)}
          </span>点 / <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--fg)" }}>{(o.items || []).length}</span>品目
        </span>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 3, color: "var(--brand-accent)", fontWeight: 800 }}>
          {done ? "詳細を表示" : "業務を開始"}<Icon name="chevronRight" size={15} />
        </span>
      </div>
    </Card>
  );
}

function RecoveryCard({ o, done, outdoorMode, onClick }: any) {
  return (
    <Card 
      onClick={onClick} 
      style={{ 
        marginBottom: 12, 
        opacity: done ? 0.65 : 1, 
        padding: "16px",
        background: outdoorMode ? "#000000" : "var(--surface)",
        border: outdoorMode ? "3px solid #F59E0B" : "1px solid var(--border-2)",
        borderLeft: outdoorMode ? "8px solid #F59E0B" : (done ? "5px solid var(--border)" : "5px solid var(--success-bright)"),
        transition: "all 0.2s ease"
      }}
      className="active:scale-[0.97] transition-transform"
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 800, color: outdoorMode ? "#F59E0B" : "var(--brand-accent)", letterSpacing: "0.02em" }}>{o.id}</span>
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: outdoorMode ? "#FFFFFF" : "var(--fg)", letterSpacing: "-0.01em", lineHeight: 1.35 }}>{o.site}</div>
          <div style={{ fontSize: 13, color: outdoorMode ? "rgba(255,255,255,0.7)" : "var(--fg-muted)", marginTop: 5, fontWeight: 700 }}>{o.company}</div>
        </div>
        <Badge variant={done ? "success" : (outdoorMode ? "warning" : "neutral")} icon={done ? "check" : "clock"}>{done ? "完了" : o.window}</Badge>
      </div>
      <div style={{ 
        display: "flex", alignItems: "center", gap: 14, 
        marginTop: 14, paddingTop: 12, borderTop: outdoorMode ? "2px solid #F59E0B" : "1px solid var(--border-2)", 
        color: outdoorMode ? "#F59E0B" : "var(--fg-muted)", fontSize: 12.5
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 600, color: outdoorMode ? "#F59E0B" : "inherit" }}>
          <Icon name="mapPin" size={14} color={outdoorMode ? "#F59E0B" : "var(--fg-subtle)"} />
          {o.dist}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", fontWeight: 600, color: outdoorMode ? "#F59E0B" : "inherit" }}>
          <Icon name="qr" size={14} color={outdoorMode ? "#F59E0B" : "var(--fg-subtle)"} />
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: outdoorMode ? "#FFFFFF" : "var(--fg)" }}>{(o.products || []).length}</span>品目
        </span>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 3, color: outdoorMode ? "#F59E0B" : "var(--brand-accent)", fontWeight: 800 }}>
          {done ? "詳細を表示" : "業務を開始"}<Icon name="chevronRight" size={15} />
        </span>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Flow Views Wrapper
// ---------------------------------------------------------------------------
function DeliveryRecoveryTab({ setFlow, doneDlv, doneRtn, outdoorMode }: any) {
  const ml = useMobileLive();
  const { orders } = useOrders();
  const [subTab, setSubTab] = useState("haisou");
  const [viewingDoc, setViewingDoc] = useState<{ order: any; type: "納品書" | "回収書" } | null>(null);
  const deliveries = ml.liveDeliveries;
  const recoveries = ml.liveRecoveries;

  // 履歴は実データ（注文）から導出する。
  // 納品履歴: 配送完了済み（completeDelivery が staffStatus=配送完了 を設定）。
  // 回収履歴: 回収完了済み（completeRecovery が staffStatus=回収完了 を設定）。
  const deliveryHistory = (orders || []).filter(
    (o: any) => o && (o.staffStatus === "配送完了" || o.signature || o.deliverySignature)
  );
  const recoveryHistory = (orders || []).filter(
    (o: any) =>
      o &&
      (o.staffStatus === "回収完了" ||
        o.collectionSignature ||
        o.status === "完了" ||
        o.status === "返却済" ||
        o.status === "返却済み")
  );

  const pendingDlvCount = deliveries.length - doneDlv.length;
  const pendingRtnCount = recoveries.length - doneRtn.length;

  const TABS: [string, string, number][] = [
    ["haisou", "配送予定", pendingDlvCount],
    ["kaishu", "回収予定", pendingRtnCount],
    ["nouhin_hist", "納品履歴", deliveryHistory.length],
    ["kaishu_hist", "回収履歴", recoveryHistory.length],
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: outdoorMode ? "#000000" : "var(--bg)", minHeight: 0 }}>
      <TopBar title="配送・回収業務" sub="DELIVERY & RECOVERY" />

      <div style={{ padding: "0 16px 12px" }}>
        <div style={{ display: "flex", gap: 5, background: "var(--surface-2)", padding: 4, borderRadius: 12 }}>
          {TABS.map(([k, l, n]) => (
            <button
              key={k}
              onClick={() => setSubTab(k)}
              style={{
                flex: 1,
                padding: "9px 2px",
                borderRadius: 9,
                border: "none",
                background: subTab === k ? "var(--surface)" : "transparent",
                color: subTab === k ? "var(--fg)" : "var(--fg-muted)",
                fontWeight: 800,
                fontSize: 11.5,
                cursor: "pointer",
                boxShadow: subTab === k ? "var(--shadow-card)" : "none",
                fontFamily: "var(--font-jp)",
                whiteSpace: "nowrap",
              }}
            >
              {l}{n > 0 ? ` (${n})` : ""}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px", minHeight: 0 }}>
        {subTab === "haisou" && (
          deliveries.length === 0 ? (
            <Empty icon="truck" title="本日の配送予定はありません" />
          ) : (
            deliveries.map(o => (
              <DeliveryCard key={o.id} o={o} done={doneDlv.includes(o.id)} outdoorMode={outdoorMode} onClick={() => setFlow({ type: "dlv", order: o })} />
            ))
          )
        )}
        {subTab === "kaishu" && (
          recoveries.length === 0 ? (
            <Empty icon="package" title="本日の回収予定はありません" />
          ) : (
            recoveries.map(o => (
              <RecoveryCard key={o.id} o={o} done={doneRtn.includes(o.id)} outdoorMode={outdoorMode} onClick={() => setFlow({ type: "rtn", order: o })} />
            ))
          )
        )}
        {subTab === "nouhin_hist" && (
          deliveryHistory.length === 0 ? (
            <Empty icon="truck" title="納品履歴はありません" sub="配送を完了すると表示されます" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {deliveryHistory.map((o: any) => (
                <HistoryCard key={o.id} order={o} kind="納品" date={o.deliveryDate || o.date} onViewDoc={() => setViewingDoc({ order: o, type: "納品書" })} />
              ))}
            </div>
          )
        )}
        {subTab === "kaishu_hist" && (
          recoveryHistory.length === 0 ? (
            <Empty icon="package" title="回収履歴はありません" sub="回収を完了すると表示されます" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {recoveryHistory.map((o: any) => (
                <HistoryCard key={o.id} order={o} kind="回収" date={o.actualReturnDate || o.rentalEndDate || o.date} onViewDoc={() => setViewingDoc({ order: o, type: "回収書" })} />
              ))}
            </div>
          )
        )}
      </div>

      {viewingDoc && (
        <DocumentViewer order={viewingDoc.order} type={viewingDoc.type} onClose={() => setViewingDoc(null)} />
      )}
    </div>
  );
}

function HistoryCard({ order, kind, date, onViewDoc }: any) {
  const company = order.companyName || order.personName || "—";
  const site = order.siteName || order.deliveryLocation || "";
  const num = order.orderNumber || order.id;
  const hasSig =
    kind === "納品"
      ? order.signature || order.deliverySignature
      : order.collectionSignature || order.warehouseSignature;
  return (
    <Card pad={14}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: 11, background: "var(--success-tint)", color: "var(--success-bright)", display: "grid", placeItems: "center", flexShrink: 0 }}>
          <Icon name={kind === "納品" ? "truck" : "package"} size={22} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{company}</div>
          <div style={{ fontSize: 12, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{num}{site ? " ・ " + site : ""}</div>
        </div>
        <Badge variant="success">{kind}済</Badge>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 11, paddingTop: 11, borderTop: "1px solid var(--border)" }}>
        <span style={{ fontSize: 12.5, color: "var(--fg-muted)", display: "flex", alignItems: "center", gap: 5 }}>
          <Icon name="clock" size={14} />{date || "—"}
        </span>
        {hasSig && <Badge variant="neutral" icon="signature">サイン</Badge>}
        <button onClick={onViewDoc} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", color: "var(--brand-accent)", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "var(--font-jp)" }}>
          <Icon name="fileCheck" size={15} />{kind === "納品" ? "納品書" : "回収書"}
        </button>
      </div>
    </Card>
  );
}

function ProfileTab({ staff, doneDlv, doneRtn, deliveries, recoveries, outdoorMode }: any) {
  const [showHistory, setShowHistory] = useState(false);

  const completedItems = [
    ...deliveries.filter((o: any) => doneDlv.includes(o.id)).map((o: any) => ({ ...o, kind: "配送" })),
    ...recoveries.filter((o: any) => doneRtn.includes(o.id)).map((o: any) => ({ ...o, kind: "回収" }))
  ];

  if (showHistory) {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)", minHeight: 0 }}>
        <TopBar title="完了履歴" sub="HISTORY" onBack={() => setShowHistory(false)} />
        <div style={{ flex: 1, overflowY: "auto", padding: "16px", minHeight: 0 }}>
          {completedItems.length === 0 ? (
            <Empty icon="clipboardCheck" title="完了した業務はありません" sub="配送・回収を完了すると表示されます" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {completedItems.map((o, idx) => (
                <Card key={o.id + o.kind + idx} pad={14}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 11, background: "var(--success-tint)", color: "var(--success-bright)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                      <Icon name="checkCircle" size={22} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 800, color: "var(--fg)" }}>{o.site}</div>
                      <div style={{ fontSize: 12, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", marginTop: 2 }}>{o.id} ・ {o.kind}</div>
                    </div>
                    <Badge variant="success">完了</Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <Screen style={{ background: outdoorMode ? "#000" : "var(--bg)" }}>
      <TopBar title="マイページ" sub="PROFILE" />
      <Card pad={18} style={{ marginBottom: 16, textAlign: "center" }}>
        <div style={{ width: 72, height: 72, borderRadius: 99, background: "linear-gradient(135deg,var(--brand),var(--brand-strong))", display: "grid", placeItems: "center", color: "#fff", fontWeight: 800, fontSize: 28, margin: "0 auto 12px" }}>ミ</div>
        <div style={{ fontSize: 19, fontWeight: 800, color: "var(--fg)" }}>{staff.name}</div>
        <div style={{ fontSize: 13.5, color: "var(--fg-muted)", marginTop: 3 }}>{staff.role}</div>
        <div style={{ display: "inline-flex", gap: 8, marginTop: 12 }}>
          <Badge variant="brand" mono>{staff.id}</Badge>
          <Badge variant="neutral">{staff.team}</Badge>
        </div>
      </Card>
      
      <Card pad={14} style={{ background: outdoorMode ? "#000" : "var(--surface)", border: outdoorMode ? "3px solid #FFF" : "1px solid var(--border)", borderRadius: "16px" }}>
        <div style={{ fontSize: outdoorMode ? 16 : 14.5, fontWeight: 900, color: "#FFF" }}>
          ✅ 本日の業務完了インデックス: <span style={{ color: "#10B981", fontFamily: "var(--font-mono)", fontSize: 18 }}>{completedItems.length}</span> 件
        </div>
      </Card>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Central Dashboard Core View Setup
// ---------------------------------------------------------------------------
function UnifiedStaffApp({ outdoorMode, setOutdoorMode }: { outdoorMode: boolean, setOutdoorMode: (v: boolean) => void }) {
  const ml = useMobileLive();
  const { orders, updateOrder, addCustomOrder } = useOrders();
  const [tab, setTab] = useState("home");
  const [subView, setSubView] = useState<string | null>(null);
  const [flow, setFlow] = useState<any>(null);

  const [doneDlv, setDoneDlv] = useState<string[]>([]);
  const [doneRtn, setDoneRtn] = useState<string[]>([]);

  const staff = { name: "鈴木 健", role: "運行・倉庫総合管理責任者", team: "東京中央ベース", id: "STF-991" };

  const completeReturn = (productsList: any[], walkinOrder?: any, signature?: string | null) => {
    const valid = productsList.filter(p => p.counted > 0);
    // 入庫 + 在庫調整（既存処理）
    if (ml.addStockMove) {
      valid.forEach(p => ml.addStockMove("入庫", { item: p.name, qty: p.counted, ref: "持込返却", icon: isVehicle(p) ? "car" : "package" }));
      if (ml.adjustStock && ml.findProductByName) {
        valid.forEach(p => {
          const fp = ml.findProductByName(p.name);
          if (fp) ml.adjustStock(fp.firestoreId || fp.id, p.counted);
        });
      }
    }

    // 顧客の一部返却（orderId 付き）の場合は、検品結果で注文を確定する。
    if (walkinOrder && walkinOrder.orderId) {
      const targetOrder = (orders || []).find(
        (o: any) =>
          o.id === walkinOrder.orderId ||
          o.firestoreId === walkinOrder.orderId ||
          (walkinOrder.orderNumber && o.orderNumber === walkinOrder.orderNumber)
      );

      if (targetOrder) {
        const today = new Date();
        const actualReturnDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

        // 検品実数（counted）を返却数量として確定
        const returnQuantities: Record<string, number> = {};
        productsList.forEach((p: any) => {
          returnQuantities[p.id] = p.counted || 0;
        });

        // 不足・破損を itemIssues として記録
        const itemIssues: any[] = [];
        productsList.forEach((p: any) => {
          const shortage = (p.expected || 0) - (p.counted || 0);
          if (shortage > 0) {
            itemIssues.push({ itemId: p.id, type: "missing", quantity: shortage, notes: "倉庫検品で不足を確認" });
          }
          (p.report || []).forEach((r: any) => {
            itemIssues.push({
              itemId: p.id,
              type: r.reason === "破損" ? "broken" : "missing",
              quantity: r.qty || 1,
              notes: r.note || r.reason || "倉庫検品報告",
              photo: (r.photos && r.photos[0]) || undefined,
            });
          });
        });

        try {
          finalizePartialReturn(
            targetOrder,
            returnQuantities,
            actualReturnDate,
            { updateOrder, addCustomOrder },
            { itemIssues, remainingStatus: "一部返却", inspectedByWarehouse: true, collectionSignature: signature || undefined }
          );
        } catch (e) {
          console.error("[completeReturn] 注文の確定に失敗しました。", e);
        }
      }

      // 検品済みの walk-in 受付を削除
      try {
        OrderBus.remove("walkinReturns", walkinOrder.id);
      } catch (e) {
        console.warn("[completeReturn] walkinReturns 削除に失敗しました。", e);
      }
    }

    // 検品記録（持込返却の確認履歴）を保存する。
    // admin の返却履歴・倉庫スタッフの検品履歴の双方から参照できる永続レコード。
    try {
      const now = new Date();
      const recProducts = productsList.map((p: any) => ({
        id: p.id,
        name: p.name,
        expected: p.expected || 0,
        counted: p.counted || 0,
        shortage: Math.max(0, (p.expected || 0) - (p.counted || 0)),
        reports: p.report || [],
      }));
      OrderBus.push("returnInspections", {
        id:
          "RINS-" +
          (walkinOrder?.orderNumber || walkinOrder?.orderId || walkinOrder?.id || "")
            .toString()
            .replace(/[^0-9A-Za-z]/g, "") +
          "-" +
          Math.floor(Math.random() * 1000),
        orderId: walkinOrder?.orderId,
        orderNumber: walkinOrder?.orderNumber,
        company: walkinOrder?.company,
        contact: walkinOrder?.contact,
        inspectedAt: now.toLocaleString("ja-JP"),
        inspector: (STAFF as any)?.souko?.name || "倉庫スタッフ",
        returningEverything: !!walkinOrder?.returningEverything,
        products: recProducts,
        totalExpected: recProducts.reduce((a: number, p: any) => a + p.expected, 0),
        totalCounted: recProducts.reduce((a: number, p: any) => a + p.counted, 0),
        hasShortage: recProducts.some((p: any) => p.shortage > 0 || (p.reports && p.reports.length > 0)),
        collectionSignature: signature || undefined,
      } as any);
    } catch (e) {
      console.warn("[completeReturn] 検品記録の保存に失敗しました。", e);
    }

    setFlow(null);
    setTab("stock");
  };

  if (flow) {
    if (flow.type === "dlv") {
      return (
        <DeliveryFlow
          o={flow.order}
          onExit={() => setFlow(null)}
          onComplete={(id, signature, photos) => {
            setDoneDlv(d => d.includes(id) ? d : [...d, id]);
            // お客様の受領サインと写真を注文に保存（納品書 PDF / 受領記録に反映される）。
            if (ml.completeDelivery) ml.completeDelivery(flow.order.firestoreId || id, signature, photos);
            setFlow(null);
            setTab("delivery_recovery");
          }}
        />
      );
    } else if (flow.type === "rtn") {
      return (
        <RecoveryFlow
          o={flow.order}
          onExit={() => setFlow(null)}
          onComplete={(id, signature, photos) => {
            setDoneRtn(d => d.includes(id) ? d : [...d, id]);
            // お客様の回収サインと写真を注文に保存（回収書 PDF に反映される）。
            if (ml.completeRecovery) ml.completeRecovery(flow.order.firestoreId || id, signature, photos);
            setFlow(null);
            setTab("delivery_recovery");
          }}
        />
      );
    } else if (flow.type === "walkin") {
      return (
        <WalkInReturnFlow
          onExit={() => setFlow(null)}
          onComplete={completeReturn}
        />
      );
    }
  }

  if (subView === "stocktake") return <WhStocktake onBack={() => setSubView(null)} />;

  const deliveries = ml.liveDeliveries;
  const recoveries = ml.liveRecoveries;
  const walkinCount = ml.walkin ? ml.walkin.length : 0;

  const VL = ml.vehicles || [];
  const ML = ml.maint || [];
  const overdueVeh = VL.filter(v => (v.days ?? v.inspectionDaysRemaining ?? 0) < 0).length;
  const overdueMnt = ML.filter(m => m.days < 0).length;

  const pendingDlvCount = deliveries.length - doneDlv.length;
  const pendingRtnCount = recoveries.length - doneRtn.length;
  const totalTasks = deliveries.length + recoveries.length;
  const completedTasks = doneDlv.length + doneRtn.length;

  const tabs = [
    { key: "home", label: "ホーム", icon: "home" },
    { key: "delivery_recovery", label: "配送・回収", icon: "truck", badge: pendingDlvCount + pendingRtnCount || null },
    { key: "stock", label: "入出庫", icon: "layers" },
    { key: "inspect", label: "点検・車両", icon: "clipboardCheck", badge: overdueVeh + overdueMnt || null },
    { key: "profile", label: "マイページ", icon: "user" }
  ];

  let content = null;
  if (tab === "home") {
    content = (
      <Screen style={{ background: outdoorMode ? "#000000" : "var(--bg)" }}>
        
        {/* Top Header Section with Sticky Ergonomic Contrast Trigger */}
        <div style={{ padding: "12px 2px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <span style={{ fontSize: 12, fontWeight: 800, color: "var(--brand-accent)", letterSpacing: ".08em", fontFamily: "var(--font-mono)" }}>
                2026.06.08 (月)
              </span>
              <h1 style={{ fontSize: 24, fontWeight: 900, color: "var(--fg)", marginTop: 2, letterSpacing: "-0.01em" }}>
                現場運行・倉庫管理
              </h1>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <IconBtn name="bell" badge />
            </div>
            
            <button
              onClick={() => setOutdoorMode(!outdoorMode)}
              style={{
                background: outdoorMode ? "#00FF66" : "var(--surface)",
                color: outdoorMode ? "#000000" : "var(--brand-strong)",
                border: outdoorMode ? "3px solid #00FF66" : "1.5px solid var(--border-2)",
                borderRadius: 999,
                padding: "8px 14px",
                fontSize: "12px",
                fontWeight: 900,
                display: "flex",
                alignItems: "center",
                gap: "6px",
                cursor: "pointer"
              }}
              className="active:scale-95 transition-transform"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>sunny</span>
              {outdoorMode ? "屋外: ON" : "屋外モード"}
            </button>
          </div>

          {/* Premium Overview Hub Panel */}
          <Card pad={18} style={{
            background: "linear-gradient(135deg, var(--brand-tint) 0%, var(--surface) 100%)",
            border: "1px solid var(--border)",
            backdropFilter: "blur(20px)",
            marginBottom: 20
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div style={{ 
                  width: 50, height: 50, borderRadius: 14, 
                  background: "linear-gradient(135deg,var(--brand),var(--brand-strong))", 
                  display: "grid", placeItems: "center", color: "#fff", fontWeight: 800, fontSize: 20,
                  boxShadow: "0 4px 12px var(--brand-tint)"
                }}>鈴</div>
                <span style={{ position: "absolute", right: -2, bottom: -2, width: 14, height: 14, borderRadius: 99, background: "var(--success-bright)", border: "2.5px solid var(--bg)" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 19, fontWeight: 800, color: "var(--fg)", letterSpacing: "-0.01em" }}>{staff.name} さん</span>
                  <Badge variant="brand" mono>STF-991</Badge>
                </div>
                <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 3, fontWeight: 600 }}>{staff.team} ・ {staff.role}</div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: outdoorMode ? 14 : 13.5, fontWeight: 900 }}>
              <span style={{ color: outdoorMode ? "#FFF" : "var(--fg-muted)" }}>本日のタスク消化率</span>
              <span style={{ color: outdoorMode ? "#00FF66" : "var(--brand-strong)" }}>{completedTasks} / {totalTasks} 件 ({totalTasks ? Math.round((completedTasks/totalTasks)*100) : 0}%)</span>
            </div>
            <ProgressBar value={completedTasks} max={totalTasks} color={outdoorMode ? "#00FF66" : "#10B981"} />
          </Card>
        </div>

        {/* Spacious 2-Column Stats Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <StatTile label="配送予定" value={pendingDlvCount} unit="件" icon="truck" variant="brand" outdoorMode={outdoorMode} onClick={() => setTab("delivery_recovery")} />
          <StatTile label="回収予定" value={pendingRtnCount} unit="件" icon="package" variant="success" outdoorMode={outdoorMode} onClick={() => setTab("delivery_recovery")} />
        </div>

        {/* Alert Notifications Section */}
        <div style={{ marginBottom: 20 }}>
          <SectionLabel>要対応アラート</SectionLabel>
          {overdueVeh > 0 || overdueMnt > 0 ? (
            <>
              {overdueVeh > 0 && (
                <AlertRow 
                  icon="car" 
                  variant="danger" 
                  title="車検が期限切れです" 
                  sub={`対象 ${overdueVeh}台 ・ 至急点検を実施してください`} 
                  outdoorMode={outdoorMode}
                  onClick={() => setTab("inspect")} 
                />
              )}
              {overdueMnt > 0 && (
                <AlertRow 
                  icon="wrench" 
                  variant="danger" 
                  title="定期メンテナンス超過" 
                  sub={`対象 ${overdueMnt}件 ・ 機器の整備をお願いします`} 
                  outdoorMode={outdoorMode}
                  onClick={() => setTab("inspect")} 
                />
              )}
            </>
          ) : (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 16px",
              borderRadius: 16,
              background: "rgba(31,157,87,0.06)",
              border: "1px solid rgba(31,157,87,0.15)",
              color: "var(--success-bright)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
            }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(31,157,87,0.12)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                <Icon name="checkCircle" size={16} color="var(--success-bright)" />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--font-jp)" }}>現在、未対応の点検・警告はありません</span>
            </div>
          )}
        </div>

        {/* Tactile Big Target Bottom Action Button */}
        <button
          onClick={() => setFlow({ type: "walkin" })}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "16px 18px",
            borderRadius: 18,
            background: "linear-gradient(135deg, var(--brand) 0%, var(--brand-strong) 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
            cursor: "pointer",
            marginBottom: 24,
            boxShadow: "var(--shadow-teal-glow)",
            position: "relative",
            overflow: "hidden",
            transition: "all 0.2s ease"
          }}
          className="active:scale-[0.96] transition-transform duration-150"
        >
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(45deg, transparent, rgba(255,255,255,0.08) 40%, transparent 60%)" }} />
          <div style={{ 
            width: 44, height: 44, borderRadius: 12, 
            background: "rgba(255,255,255,0.15)", color: "#fff", 
            display: "grid", placeItems: "center", flexShrink: 0 
          }}>
            <Icon name="clipboardCheck" size={22} />
          </div>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#FFFFFF" }}>お客様持込返却 検品</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 2, fontWeight: 500 }}>直接ベースに来庫されたお客様の返却対応</div>
          </div>
          <div style={{ background: "var(--accent)", color: "var(--on-accent)", borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 900, boxShadow: "var(--shadow-accent-glow)" }}>
            {walkinCount}件
          </div>
        </button>

        {/* Structured Warehouse Quick Tools Grid */}
        <SectionLabel>倉庫管理・クイック操作</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, paddingBottom: 20 }}>
          {[
            ["boxIn", "入庫登録", "stock", "資材の受入登録"],
            ["boxOut", "出庫登録", "stock", "商品の配送準備"],
            ["layers", "倉庫棚卸し", "stocktake", "実在庫の確認"],
            ["car", "車両点検", "inspect", "整備状況の確認"]
          ].map(([ic, lb, t, desc]) => (
            <button
              key={lb}
              onClick={() => t === "stocktake" ? setSubView("stocktake") : setTab(t)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "16px 16px 14px",
                borderRadius: 16,
                background: "var(--surface)",
                border: "1px solid var(--border-2)",
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                textAlign: "left"
              }}
              className="active:scale-95 transition-transform"
            >
              <div style={{ 
                width: 38, height: 38, borderRadius: 10, 
                background: "var(--brand-tint)", color: "var(--brand-accent)", 
                display: "grid", placeItems: "center", marginBottom: 12
              }}>
                <Icon name={ic as any} size={18} />
              </div>
              <span style={{ fontSize: 14.5, fontWeight: 800, color: "var(--fg)", marginBottom: 4, letterSpacing: "-0.01em" }}>{lb}</span>
              <span style={{ fontSize: 11.5, color: "var(--fg-muted)", fontWeight: 500, lineHeight: 1.3 }}>{desc}</span>
            </button>
          ))}
        </div>
      </Screen>
    );
  } else if (tab === "delivery_recovery") {
    content = <DeliveryRecoveryTab setFlow={setFlow} doneDlv={doneDlv} doneRtn={doneRtn} outdoorMode={outdoorMode} />;
  } else if (tab === "stock") {
    content = <WhStock moves={ml.stockMoves} addMove={ml.addStockMove} onReturn={() => setFlow({ type: "walkin" })} />;
  } else if (tab === "inspect") {
    content = <WhInspect />;
  } else if (tab === "profile") {
    content = <ProfileTab staff={staff} doneDlv={doneDlv} doneRtn={doneRtn} deliveries={deliveries} recoveries={recoveries} outdoorMode={outdoorMode} />;
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0, background: outdoorMode ? "#000" : "inherit" }}>
      <div style={{ flex: 1, minHeight: 0 }}>{content}</div>
      <BottomNav tabs={tabs} active={tab} onChange={setTab} />
    </div>
  );
}

export default function StaffDashboard() {
  const [outdoorMode, setOutdoorMode] = useState(false);

  return (
    <MobileLiveProvider>
      <div style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px 16px",
        background: "radial-gradient(120% 80% at 50% 0%, #1E8C86, #0B1D1C 75%)",
        fontFamily: "\"Noto Sans JP\", sans-serif"
      }}>
        <div data-theme="light" style={{
          width: "100%",
          maxWidth: 412,
          height: 840,
          borderRadius: 40,
          border: "12px solid #14403D",
          boxShadow: "0 24px 48px rgba(4, 24, 22, 0.7)",
          overflow: "hidden",
          background: outdoorMode ? "#000000" : "var(--bg)",
          position: "relative",
          display: "flex",
          flexDirection: "column"
        }}>
          {/* OS Navigation Top-Bar */}
          <div style={{
            height: 32,
            background: outdoorMode ? "#000000" : "var(--bg)",
            color: "var(--fg-muted)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
            fontSize: 12,
            fontWeight: 700
          }}>
            <span style={{ color: outdoorMode ? "#00FF66" : "inherit" }}>17:05</span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span>5G</span>
              <div style={{ width: 20, height: 10, border: "1px solid var(--fg-muted)", borderRadius: 2, padding: 1, display: "flex" }}>
                <div style={{ width: "80%", height: "100%", background: "var(--fg-muted)" }} />
              </div>
            </div>
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <UnifiedStaffApp outdoorMode={outdoorMode} setOutdoorMode={setOutdoorMode} />
          </div>
        </div>
      </div>
    </MobileLiveProvider>
  );
}
