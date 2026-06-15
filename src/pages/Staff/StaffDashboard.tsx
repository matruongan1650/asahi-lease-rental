import React, { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import Icon from "../../components/staff/Icon";
import {
  TopBar,
  Badge,
  Btn,
  Card,
  ProgressBar,
  BottomNav,
  Screen,
  Empty,
  SectionLabel,
  IconBtn,
  MetricCard,
  SegmentControl,
  formatCount
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
import { useUser, UserProfile } from "../../context/UserContext";
import OrderBus from "../../lib/orderBus";
import { finalizePartialReturn } from "../../utils/returnProcessing";
import DocumentViewer from "../../components/DocumentViewer";
import { buildStaffNotifications, AppNotification } from "../../utils/notifications";

const todayLabel = () => new Date().toLocaleDateString("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});

function StaffNotificationPopover({ items }: { items: AppNotification[] }) {
  const toneStyle = (tone: AppNotification["tone"]): React.CSSProperties => {
    if (tone === "danger") return { background: "var(--danger-tint)", color: "var(--danger-bright)", borderColor: "var(--danger-bright)" };
    if (tone === "warning") return { background: "var(--warning-tint)", color: "var(--warning-bright)", borderColor: "var(--warning-bright)" };
    if (tone === "success") return { background: "var(--success-tint)", color: "var(--success-bright)", borderColor: "var(--success-bright)" };
    return { background: "var(--brand-tint)", color: "var(--brand-accent)", borderColor: "transparent" };
  };

  return (
    <div style={{ position: "absolute", right: 0, top: 48, zIndex: 70, width: 318, maxWidth: "calc(100vw - 24px)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 18, boxShadow: "var(--shadow-pop)", padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 10, borderBottom: "1px solid var(--border)", marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: "var(--fg)" }}>通知</div>
        <Badge variant={items.length ? "warning" : "neutral"}>{items.length}件</Badge>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.length === 0 ? (
          <div style={{ padding: "20px 8px", textAlign: "center", color: "var(--fg-muted)", fontSize: 13, fontWeight: 700 }}>現在の通知はありません</div>
        ) : items.map((item) => (
          <div key={item.id} style={{ border: "1px solid", borderRadius: 13, padding: "10px 11px", ...toneStyle(item.tone) }}>
            <div style={{ fontSize: 12.5, fontWeight: 900 }}>{item.title}</div>
            <div style={{ fontSize: 11.5, color: "var(--fg-muted)", fontWeight: 700, marginTop: 3 }}>{item.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const sumQty = (items: any[] = [], key = "qty") => items.reduce((total, item) => total + Number(item?.[key] || 0), 0);

function ActionStrip({ items }: { items: Array<{ icon: string; label: string; sub: string; tone?: string; onClick: () => void }> }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {items.map(item => (
        <button
          key={item.label}
          onClick={item.onClick}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            minHeight: 74,
            padding: "13px",
            borderRadius: 16,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-card)",
            cursor: "pointer",
            textAlign: "left",
            fontFamily: "var(--font-jp)",
          }}
          className="active:scale-[0.97] transition-transform"
        >
          <span style={{ width: 38, height: 38, borderRadius: 11, background: item.tone || "var(--brand-tint)", color: item.tone ? "var(--fg)" : "var(--brand-accent)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Icon name={item.icon} size={20} />
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 14, fontWeight: 900, color: "var(--fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</span>
            <span style={{ display: "block", marginTop: 3, fontSize: 11.5, lineHeight: 1.25, color: "var(--fg-muted)", fontWeight: 600 }}>{item.sub}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

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
  const totalQty = sumQty(o.items || []);
  return (
    <Card 
      onClick={onClick} 
      style={{ 
        marginBottom: 10, 
        opacity: done ? 0.62 : 1, 
        padding: "15px",
        background: outdoorMode ? "#000000" : "var(--surface)",
        border: outdoorMode ? "3px solid #00FF66" : "1px solid var(--border)",
        borderLeft: outdoorMode ? "8px solid #00FF66" : "5px solid var(--brand)",
        borderRadius: 18,
      }}
      className="active:scale-[0.97] transition-transform"
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", gap: 11, minWidth: 0 }}>
          <span style={{ width: 42, height: 42, borderRadius: 12, background: "var(--brand-tint)", color: "var(--brand-accent)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Icon name="truck" size={22} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 900, color: "var(--brand-accent)", letterSpacing: "0" }}>{o.id}</span>
              {o.priority === "急ぎ" && !done && <Badge variant="warning">急ぎ</Badge>}
            </div>
            <div style={{ fontSize: 16.5, fontWeight: 900, color: "var(--fg)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis" }}>{o.site}</div>
            <div style={{ fontSize: 12.5, color: "var(--fg-muted)", marginTop: 4, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.company}</div>
          </div>
        </div>
        <Badge variant={done ? "success" : "brand"}>{done ? "完了" : o.window}</Badge>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 13 }}>
        <div style={{ borderRadius: 12, background: "var(--surface-2)", padding: "9px 10px" }}>
          <div style={{ fontSize: 10.5, color: "var(--fg-subtle)", fontWeight: 800 }}>品目</div>
          <div style={{ marginTop: 2, fontSize: 13.5, color: "var(--fg)", fontWeight: 900, fontFamily: "var(--font-mono)" }}>{formatCount(totalQty)}点 / {formatCount((o.items || []).length)}品</div>
        </div>
        <div style={{ borderRadius: 12, background: "var(--surface-2)", padding: "9px 10px" }}>
          <div style={{ fontSize: 10.5, color: "var(--fg-subtle)", fontWeight: 800 }}>担当</div>
          <div style={{ marginTop: 2, fontSize: 13.5, color: "var(--fg)", fontWeight: 900, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{o.contact || "未設定"}</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, paddingTop: 12, borderTop: outdoorMode ? "2px solid #00FF66" : "1px solid var(--border)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, color: "var(--fg-muted)", fontSize: 12.5, fontWeight: 700 }}>
          <Icon name="mapPin" size={14} color="var(--fg-subtle)" />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.addr || "住所未設定"}</span>
        </span>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 3, color: "var(--brand-accent)", fontWeight: 900, whiteSpace: "nowrap", fontSize: 12.5 }}>
          {done ? "詳細を表示" : "業務を開始"}<Icon name="chevronRight" size={15} />
        </span>
      </div>
    </Card>
  );
}

function RecoveryCard({ o, done, outdoorMode, onClick }: any) {
  const totalExpected = sumQty(o.products || [], "expected");
  return (
    <Card 
      onClick={onClick} 
      style={{ 
        marginBottom: 10, 
        opacity: done ? 0.65 : 1, 
        padding: "15px",
        background: outdoorMode ? "#000000" : "var(--surface)",
        border: outdoorMode ? "3px solid #F59E0B" : "1px solid var(--border)",
        borderLeft: outdoorMode ? "8px solid #F59E0B" : (done ? "5px solid var(--border)" : "5px solid var(--success-bright)"),
        transition: "all 0.2s ease",
        borderRadius: 18,
      }}
      className="active:scale-[0.97] transition-transform"
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", gap: 11, minWidth: 0 }}>
          <span style={{ width: 42, height: 42, borderRadius: 12, background: "var(--success-tint)", color: "var(--success-bright)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Icon name="package" size={22} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 900, color: outdoorMode ? "#F59E0B" : "var(--brand-accent)", letterSpacing: "0" }}>{o.id}</span>
              {o.returnRequestType === "partial" && <Badge variant="warning">一部返却</Badge>}
              {o.returnRequestType === "full" && <Badge variant="brand">一括返却</Badge>}
            </div>
            <div style={{ fontSize: 16.5, fontWeight: 900, color: outdoorMode ? "#FFFFFF" : "var(--fg)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis" }}>{o.site}</div>
            <div style={{ fontSize: 12.5, color: outdoorMode ? "rgba(255,255,255,0.7)" : "var(--fg-muted)", marginTop: 4, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.company}</div>
          </div>
        </div>
        <Badge variant={done ? "success" : (outdoorMode ? "warning" : "neutral")} icon={done ? "check" : "clock"}>{done ? "完了" : o.window}</Badge>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 13 }}>
        <div style={{ borderRadius: 12, background: "var(--surface-2)", padding: "9px 10px" }}>
          <div style={{ fontSize: 10.5, color: "var(--fg-subtle)", fontWeight: 800 }}>回収予定</div>
          <div style={{ marginTop: 2, fontSize: 13.5, color: "var(--fg)", fontWeight: 900, fontFamily: "var(--font-mono)" }}>{formatCount(totalExpected)}点 / {formatCount((o.products || []).length)}品</div>
        </div>
        <div style={{ borderRadius: 12, background: "var(--surface-2)", padding: "9px 10px" }}>
          <div style={{ fontSize: 10.5, color: "var(--fg-subtle)", fontWeight: 800 }}>担当</div>
          <div style={{ marginTop: 2, fontSize: 13.5, color: "var(--fg)", fontWeight: 900, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{o.contact || "未設定"}</div>
        </div>
      </div>
      <div style={{ 
        display: "flex", alignItems: "center", gap: 14, 
        marginTop: 12, paddingTop: 12, borderTop: outdoorMode ? "2px solid #F59E0B" : "1px solid var(--border)", 
        color: outdoorMode ? "#F59E0B" : "var(--fg-muted)", fontSize: 12.5
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 600, color: outdoorMode ? "#F59E0B" : "inherit" }}>
          <Icon name="mapPin" size={14} color={outdoorMode ? "#F59E0B" : "var(--fg-subtle)"} />
          <span style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.addr || o.dist || "住所未設定"}</span>
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

  const tabs = [
    { key: "haisou", label: "配送", count: pendingDlvCount },
    { key: "kaishu", label: "回収", count: pendingRtnCount },
    { key: "nouhin_hist", label: "納品履歴", count: deliveryHistory.length },
    { key: "kaishu_hist", label: "回収履歴", count: recoveryHistory.length },
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: outdoorMode ? "#000000" : "var(--bg)", minHeight: 0 }}>
      <TopBar title="配送・回収業務" sub="DELIVERY & RECOVERY" />

      <div style={{ padding: "0 16px 12px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <MetricCard label="未完了配送" value={pendingDlvCount} unit="件" icon="truck" tone="brand" onClick={() => setSubTab("haisou")} />
          <MetricCard label="未完了回収" value={pendingRtnCount} unit="件" icon="package" tone="success" onClick={() => setSubTab("kaishu")} />
        </div>
        <SegmentControl items={tabs} active={subTab} onChange={setSubTab} />
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px", minHeight: 0 }}>
        {subTab === "haisou" && (
          deliveries.length === 0 ? (
            <Empty icon="truck" title="配送予定はありません" sub="admin が配送予定にした注文がここに表示されます" />
          ) : (
            deliveries.map(o => (
              <DeliveryCard key={o.id} o={o} done={doneDlv.includes(o.id)} outdoorMode={outdoorMode} onClick={() => setFlow({ type: "dlv", order: o })} />
            ))
          )
        )}
        {subTab === "kaishu" && (
          recoveries.length === 0 ? (
            <Empty icon="package" title="回収予定はありません" sub="返却期限が近い注文、または回収予定の注文が表示されます" />
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

function ProfileTab({ staff, user, onUpdateProfile, onLogout, doneDlv, doneRtn, deliveries, recoveries, outdoorMode }: any) {
  const [showHistory, setShowHistory] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<any>(user || {});

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

  if (editing) {
    const setValue = (key: string, value: string) => setDraft((d: any) => ({ ...d, [key]: value }));
    const save = () => {
      onUpdateProfile({
        lastName: draft.lastName || "",
        firstName: draft.firstName || "",
        email: draft.email || "",
        phone: draft.phone || "",
        address: draft.address || "",
        avatarUrl: draft.avatarUrl || "",
        team: draft.team || "",
        position: draft.position || "",
        employeeCode: draft.employeeCode || "",
      });
      setEditing(false);
    };

    return (
      <Screen style={{ background: outdoorMode ? "#000" : "var(--bg)" }}>
        <TopBar title="プロフィール編集" sub="PROFILE" onBack={() => setEditing(false)} />
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            ["lastName", "姓"],
            ["firstName", "名"],
            ["email", "メール"],
            ["phone", "電話番号"],
            ["team", "拠点・チーム"],
            ["position", "職種・担当"],
            ["employeeCode", "社員ID"],
            ["address", "住所・拠点住所"],
            ["avatarUrl", "プロフィール画像URL"],
          ].map(([key, label]) => (
            <label key={key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--fg-muted)", fontWeight: 800 }}>{label}</span>
              <input
                value={draft[key] || ""}
                onChange={(e) => setValue(key, e.target.value)}
                style={{
                  height: 44,
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--fg)",
                  padding: "0 12px",
                  fontSize: 14,
                  fontWeight: 700,
                  outline: "none",
                  fontFamily: "var(--font-jp)",
                }}
              />
            </label>
          ))}
          <Btn full variant="primary" icon="check" onClick={save}>保存する</Btn>
        </div>
      </Screen>
    );
  }

  return (
    <Screen style={{ background: outdoorMode ? "#000" : "var(--bg)" }}>
      <TopBar title="マイページ" sub="PROFILE" />
      <Card pad={18} style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt={staff.name} style={{ width: 64, height: 64, borderRadius: 18, objectFit: "cover", flexShrink: 0 }} />
          ) : (
            <div style={{ width: 64, height: 64, borderRadius: 18, background: "linear-gradient(135deg,var(--brand),var(--brand-strong))", display: "grid", placeItems: "center", color: "#fff", fontWeight: 900, fontSize: 24, flexShrink: 0 }}>{staff.name.slice(0, 1)}</div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: 900, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{staff.name}</div>
            <div style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 4, fontWeight: 700 }}>{staff.role}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <Badge variant="brand" mono>{staff.id}</Badge>
          <Badge variant="neutral">{staff.team}</Badge>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <MetricCard label="本日完了" value={completedItems.length} unit="件" icon="checkCircle" tone="success" onClick={() => setShowHistory(true)} />
        <MetricCard label="残り業務" value={(deliveries.length + recoveries.length) - completedItems.length} unit="件" icon="clock" tone="warning" />
      </div>

      <Btn full variant="secondary" icon="fileCheck" onClick={() => setShowHistory(true)}>
        完了履歴を見る
      </Btn>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <Btn full variant="secondary" icon="user" onClick={() => { setDraft(user || {}); setEditing(true); }}>
          編集
        </Btn>
        <Btn full variant="danger" icon="logout" onClick={onLogout}>
          ログアウト
        </Btn>
      </div>
    </Screen>
  );
}

function staffInfoFromUser(user: UserProfile | null) {
  const name = user ? `${user.lastName || ""} ${user.firstName || ""}`.trim() : "スタッフ";
  return {
    name: name || user?.email || "スタッフ",
    role: user?.position || (user?.role === "admin" ? "管理者" : "配送・倉庫スタッフ"),
    team: user?.team || user?.companyName || "ASAHI LEASE",
    id: user?.employeeCode || user?.id || "STAFF",
  };
}

// ---------------------------------------------------------------------------
// Central Dashboard Core View Setup
// ---------------------------------------------------------------------------
function UnifiedStaffApp({ outdoorMode }: { outdoorMode: boolean }) {
  const ml = useMobileLive();
  const { orders, updateOrder, addCustomOrder } = useOrders();
  const { currentUser, updateUser, logout } = useUser();
  const [tab, setTab] = useState("home");
  const [subView, setSubView] = useState<string | null>(null);
  const [flow, setFlow] = useState<any>(null);
  const [showNotifications, setShowNotifications] = useState(false);

  const [doneDlv, setDoneDlv] = useState<string[]>([]);
  const [doneRtn, setDoneRtn] = useState<string[]>([]);
  // 最終検品の確定が二重送信されるのを防ぐ（連打で -R 注文が複数作られ在庫が二重計上されるのを防止）。
  const finalizingRef = useRef(false);

  const staff = staffInfoFromUser(currentUser);

  const completeReturn = async (productsList: any[], walkinOrder?: any, signature?: string | null, extra?: any) => {
    const valid = productsList.filter(p => p.counted > 0);

    // ── 2段階検品 ──────────────────────────────────────────
    // stage "reception"（お客様持込の一次受付検品）: ここでは確定しない。
    // 受付結果（数量・サイン）を保存して「最終検品（recheck）」キューへ回す。
    // 在庫計上・注文確定・請求書発行は最終検品の完了時のみ行う。
    if (walkinOrder && walkinOrder.stage !== "recheck") {
      try {
        OrderBus.patch("walkinReturns", walkinOrder.id, {
          stage: "recheck",
          receptionAt: new Date().toLocaleString("ja-JP"),
          receptionSignature: signature || null,
          fieldSignature: signature || walkinOrder.fieldSignature || null,
          products: productsList.map((p: any) => ({
            ...p,
            // 受付で数えた実数を最終検品の expected にする
            expected: p.counted ?? p.expected ?? 0,
            counted: 0,
            report: p.report || [],
          })),
          note: (walkinOrder.note ? walkinOrder.note + " / " : "") + "一次受付検品済み — 倉庫最終検品待ち",
        } as any);
      } catch (e) {
        console.warn("[completeReturn] 一次検品の保存に失敗しました。", e);
      }
      setFlow(null);
      setTab("stock");
      return;
    }

    // ── 最終検品（recheck）: 確定処理 ─────────────────────
    // 二重送信ガード: 既に確定処理中なら無視する。
    if (finalizingRef.current) return;
    finalizingRef.current = true;
    try {
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
          // サインは最終検品時のものが無ければ、一次受付／現場回収時のサインを使う
          const effectiveSignature = signature || walkinOrder.receptionSignature || walkinOrder.fieldSignature || undefined;
          // 保安車両の返却記録・燃料補給費（請求書 extraCosts に計上）
          const extraFields: Record<string, any> = {};
          if (extra?.vehicleCheckin) extraFields.vehicleCheckin = extra.vehicleCheckin;
          if (extra?.fuelCharge && Number(extra.fuelCharge.amount) > 0) extraFields.fuelCharge = extra.fuelCharge;

          await finalizePartialReturn(
            targetOrder,
            returnQuantities,
            actualReturnDate,
            { updateOrder, addCustomOrder },
            {
              itemIssues,
              remainingStatus: "一部返却",
              inspectedByWarehouse: true,
              collectionSignature: effectiveSignature,
              collectionPhotos: Array.isArray(walkinOrder.photos) ? walkinOrder.photos : [],
              extraFields,
            }
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
        collectionSignature: signature || walkinOrder?.receptionSignature || walkinOrder?.fieldSignature || undefined,
        // お客様送付／現場撮影の写真（dataURL）を検品記録として永続化（admin・お客様の履歴で表示）
        customerPhotos: (Array.isArray(walkinOrder?.photos) ? walkinOrder.photos : [])
          .filter((u: any) => typeof u === "string" && u.startsWith("data:")),
      } as any);
    } catch (e) {
      console.warn("[completeReturn] 検品記録の保存に失敗しました。", e);
    }

    setFlow(null);
    setTab("stock");
    } finally {
      finalizingRef.current = false;
    }
  };

  if (flow) {
    if (flow.type === "dlv") {
      return (
        <DeliveryFlow
          o={flow.order}
          onExit={() => setFlow(null)}
          onComplete={(id, signature, photos, extra) => {
            setDoneDlv(d => d.includes(id) ? d : [...d, id]);
            // お客様の受領サインと写真、保安車両の貸出記録を注文に保存。
            if (ml.completeDelivery) ml.completeDelivery(flow.order.firestoreId || id, signature, photos, extra);
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
  const staffNotifications = buildStaffNotifications({ deliveries, recoveries, walkin: ml.walkin || [], vehicles: VL, maintenance: ML });

  const tabs = [
    { key: "home", label: "ホーム", icon: "home" },
    { key: "delivery_recovery", label: "配送・回収", icon: "truck", badge: pendingDlvCount + pendingRtnCount || null },
    { key: "stock", label: "入出庫", icon: "layers" },
    { key: "inspect", label: "点検・車両", icon: "clipboardCheck", badge: overdueVeh + overdueMnt || null },
    { key: "profile", label: "マイページ", icon: "user" }
  ];

  let content = null;
  if (tab === "home") {
    const nextDeliveries = deliveries.filter((o: any) => !doneDlv.includes(o.id)).slice(0, 2);
    const nextRecoveries = recoveries.filter((o: any) => !doneRtn.includes(o.id)).slice(0, 2);
    const hasAlerts = overdueVeh > 0 || overdueMnt > 0;

    content = (
      <Screen style={{ background: outdoorMode ? "#000000" : "var(--bg)" }}>
        <div style={{ padding: "12px 2px 16px" }}>
          <TopBar
            title="本日の業務"
            sub={todayLabel()}
            accent
            right={
              <div style={{ position: "relative" }}>
                <IconBtn name="bell" badge={staffNotifications.length > 0} onClick={() => setShowNotifications(!showNotifications)} />
                {showNotifications && <StaffNotificationPopover items={staffNotifications} />}
              </div>
            }
          />

          <Card pad={18} style={{
            background: "linear-gradient(135deg, var(--brand-tint), var(--surface))",
            border: "1px solid var(--border)",
            marginTop: 8,
            marginBottom: 14,
            borderRadius: 20,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 15 }}>
              <div style={{ width: 52, height: 52, borderRadius: 15, background: "linear-gradient(135deg,var(--brand),var(--brand-strong))", display: "grid", placeItems: "center", color: "#fff", fontWeight: 900, fontSize: 20, flexShrink: 0 }}>
                {staff.name.slice(0, 1)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 18, fontWeight: 900, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{staff.name} さん</span>
                  <Badge variant="brand" mono>{staff.id}</Badge>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--fg-muted)", marginTop: 4, fontWeight: 700 }}>{staff.team} ・ {staff.role}</div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13, fontWeight: 900 }}>
              <span style={{ color: "var(--fg-muted)" }}>業務進捗</span>
              <span style={{ color: "var(--brand-strong)", fontFamily: "var(--font-mono)" }}>{completedTasks} / {totalTasks} 件 ({totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0}%)</span>
            </div>
            <ProgressBar value={completedTasks} max={totalTasks} color="#10B981" />
          </Card>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
          <MetricCard label="配送予定" value={pendingDlvCount} unit="件" icon="truck" tone="brand" onClick={() => setTab("delivery_recovery")} />
          <MetricCard label="回収予定" value={pendingRtnCount} unit="件" icon="package" tone="success" onClick={() => setTab("delivery_recovery")} />
          <MetricCard label="持込返却" value={walkinCount} unit="件" icon="clipboardCheck" tone="warning" onClick={() => setFlow({ type: "walkin" })} />
          <MetricCard label="点検要対応" value={overdueVeh + overdueMnt} unit="件" icon="alert" tone={hasAlerts ? "danger" : "neutral"} onClick={() => setTab("inspect")} />
        </div>

        <SectionLabel>優先タスク</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
          {hasAlerts ? (
            <>
              {overdueVeh > 0 && <AlertRow title="車検が期限切れです" sub={`対象 ${overdueVeh}台 ・ 点検管理で確認してください`} outdoorMode={outdoorMode} onClick={() => setTab("inspect")} />}
              {overdueMnt > 0 && <AlertRow title="定期メンテナンス超過" sub={`対象 ${overdueMnt}件 ・ 点検記録が必要です`} outdoorMode={outdoorMode} onClick={() => setTab("inspect")} />}
            </>
          ) : null}
          {nextDeliveries.map((o: any) => <DeliveryCard key={`home-${o.id}`} o={o} done={false} outdoorMode={outdoorMode} onClick={() => setFlow({ type: "dlv", order: o })} />)}
          {nextRecoveries.map((o: any) => <RecoveryCard key={`home-${o.id}`} o={o} done={false} outdoorMode={outdoorMode} onClick={() => setFlow({ type: "rtn", order: o })} />)}
          {!hasAlerts && nextDeliveries.length === 0 && nextRecoveries.length === 0 && (
            <Empty icon="checkCircle" title="すぐ対応する業務はありません" sub="配送・回収・点検の予定が入るとここに表示されます" />
          )}
        </div>

        <SectionLabel>クイック操作</SectionLabel>
        <ActionStrip
          items={[
            { icon: "clipboardCheck", label: "持込返却", sub: "一次受付・最終検品", onClick: () => setFlow({ type: "walkin" }) },
            { icon: "boxIn", label: "入出庫", sub: "入庫・出庫を登録", onClick: () => setTab("stock") },
            { icon: "layers", label: "棚卸し", sub: "実在庫の確認", onClick: () => setSubView("stocktake") },
            { icon: "car", label: "点検・車両", sub: "車検と整備状況", onClick: () => setTab("inspect") },
          ]}
        />
      </Screen>
    );
  } else if (tab === "delivery_recovery") {
    content = <DeliveryRecoveryTab setFlow={setFlow} doneDlv={doneDlv} doneRtn={doneRtn} outdoorMode={outdoorMode} />;
  } else if (tab === "stock") {
    content = <WhStock moves={ml.stockMoves} addMove={ml.addStockMove} onReturn={() => setFlow({ type: "walkin" })} />;
  } else if (tab === "inspect") {
    content = <WhInspect />;
  } else if (tab === "profile") {
    content = (
      <ProfileTab
        staff={staff}
        user={currentUser}
        onUpdateProfile={(updates: Partial<UserProfile>) => currentUser && updateUser(currentUser.id, updates)}
        onLogout={logout}
        doneDlv={doneDlv}
        doneRtn={doneRtn}
        deliveries={deliveries}
        recoveries={recoveries}
        outdoorMode={outdoorMode}
      />
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0, background: outdoorMode ? "#000" : "inherit" }}>
      <div style={{ flex: 1, minHeight: 0 }}>{content}</div>
      <BottomNav tabs={tabs} active={tab} onChange={setTab} />
    </div>
  );
}

export default function StaffDashboard() {
  const outdoorMode = false;
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }));
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);

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
            <span style={{ color: outdoorMode ? "#00FF66" : "inherit" }}>{clock}</span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span>5G</span>
              <div style={{ width: 20, height: 10, border: "1px solid var(--fg-muted)", borderRadius: 2, padding: 1, display: "flex" }}>
                <div style={{ width: "80%", height: "100%", background: "var(--fg-muted)" }} />
              </div>
            </div>
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <UnifiedStaffApp outdoorMode={outdoorMode} />
          </div>
        </div>
      </div>
    </MobileLiveProvider>
  );
}

export function StaffStandaloneApp() {
  return (
    <MobileLiveProvider>
      <div
        data-theme="light"
        style={{
          width: "100vw",
          minHeight: "100dvh",
          height: "100dvh",
          overflow: "hidden",
          background: "var(--bg)",
          color: "var(--fg)",
          fontFamily: "\"Noto Sans JP\", sans-serif",
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <UnifiedStaffApp outdoorMode={false} />
      </div>
    </MobileLiveProvider>
  );
}
