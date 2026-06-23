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
  formatCount,
  PhotoCaptureButton
} from "../../components/staff/StaffUI";
import { uploadDataUrl } from "../../lib/imageUpload";
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
import { restoreOrderStock } from "../../utils/stockLedger";
import { computeCompensationCharge } from "../../utils/billing";
import { byOrderDateDesc } from "../../utils/orderSort";
import { usePagedList } from "../../hooks/usePagedList";
import DocumentViewer from "../../components/DocumentViewer";
import { buildStaffNotifications, AppNotification } from "../../utils/notifications";
import { useNotificationReads } from "../../lib/notificationReads";
import { useStaffNotificationAlerts, initStaffNotify } from "../../lib/staffNotify";
import { alertDialog } from "../../components/AppDialog";
import { loadDraft, saveDraft } from "./flowDraft";

const todayLabel = () => new Date().toLocaleDateString("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});

function StaffNotificationPopover({ items, isRead, markRead, onClose, onNavigate }: { items: AppNotification[]; isRead: (n: AppNotification) => boolean; markRead: (ns: AppNotification[]) => void; onClose: () => void; onNavigate?: (n: AppNotification) => void }) {
  const unread = items.reduce((c, n) => c + (isRead(n) ? 0 : 1), 0);
  const toneStyle = (tone: AppNotification["tone"]): React.CSSProperties => {
    if (tone === "danger") return { background: "var(--danger-tint)", color: "var(--danger-bright)", borderColor: "var(--danger-bright)" };
    if (tone === "warning") return { background: "var(--warning-tint)", color: "var(--warning-bright)", borderColor: "var(--warning-bright)" };
    if (tone === "success") return { background: "var(--success-tint)", color: "var(--success-bright)", borderColor: "var(--success-bright)" };
    return { background: "var(--brand-tint)", color: "var(--brand-accent)", borderColor: "transparent" };
  };

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 69 }} onClick={onClose} />
      <div style={{ position: "absolute", right: 0, top: 48, zIndex: 70, width: 318, maxWidth: "calc(100vw - 24px)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 18, boxShadow: "var(--shadow-pop)", padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 10, borderBottom: "1px solid var(--border)", marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: "var(--fg)" }}>通知{unread > 0 ? `（未読 ${unread}）` : ""}</div>
          {unread > 0 ? (
            <button onClick={() => markRead(items)} style={{ fontSize: 11.5, fontWeight: 800, color: "var(--brand-accent)", background: "none", border: "none", cursor: "pointer" }}>すべて既読</button>
          ) : (
            <Badge variant="neutral">{items.length}件</Badge>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "60vh", overflowY: "auto" }}>
          {items.length === 0 ? (
            <div style={{ padding: "20px 8px", textAlign: "center", color: "var(--fg-muted)", fontSize: 13, fontWeight: 700 }}>現在の通知はありません</div>
          ) : items.map((item) => {
            const read = isRead(item);
            const canNav = !!(item.target || item.relatedOrderId);
            return (
              <button key={item.id} onClick={() => { markRead([item]); if (canNav && onNavigate) { onNavigate(item); onClose(); } }} style={{ position: "relative", textAlign: "left", border: "1px solid", borderRadius: 13, padding: "10px 11px", cursor: "pointer", opacity: read ? 0.5 : 1, ...toneStyle(item.tone) }}>
                {!read && <span style={{ position: "absolute", top: 9, right: 9, width: 8, height: 8, borderRadius: 9999, background: "var(--danger-bright)" }} />}
                <div style={{ fontSize: 12.5, fontWeight: 900, paddingRight: 12 }}>{item.title}</div>
                <div style={{ fontSize: 11.5, color: "var(--fg-muted)", fontWeight: 700, marginTop: 3 }}>{item.body}</div>
                {canNav && <div style={{ fontSize: 11, fontWeight: 800, marginTop: 5, display: "flex", alignItems: "center", gap: 3, opacity: 0.85 }}>開く<Icon name="arrowRight" size={12} /></div>}
              </button>
            );
          })}
        </div>
      </div>
    </>
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
  // 危険色はトークンに統一（以前はハードコードの赤で danger 系 MetricCard/Badge と不一致だった）。
  const c = "var(--danger-bright)";
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
            <div style={{ fontSize: 12.5, color: "var(--fg-muted)", marginTop: 4, fontWeight: 700, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", wordBreak: "break-word" }}>{o.company}</div>
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
          <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-word" }}>{o.addr || "住所未設定"}</span>
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
            <div style={{ fontSize: 12.5, color: outdoorMode ? "rgba(255,255,255,0.7)" : "var(--fg-muted)", marginTop: 4, fontWeight: 700, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", wordBreak: "break-word" }}>{o.company}</div>
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
          <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-word" }}>{o.addr || o.dist || "住所未設定"}</span>
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
function StaffShowMore({ remaining, onClick }: { remaining: number; onClick: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
      <button
        onClick={onClick}
        style={{ padding: "10px 20px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--brand-strong)", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
      >
        さらに表示（残り {remaining} 件）
      </button>
    </div>
  );
}

function DeliveryRecoveryTab({ setFlow, doneDlv, doneRtn, outdoorMode }: any) {
  const ml = useMobileLive();
  const { orders } = useOrders();
  const [subTab, setSubTab] = useState("haisou");
  const [q, setQ] = useState("");
  const [viewingDoc, setViewingDoc] = useState<{ order: any; type: "納品書" | "回収書" } | null>(null);
  const deliveries = ml.liveDeliveries;
  const recoveries = ml.liveRecoveries;

  // 履歴は実データ（注文）から導出する。
  // 納品履歴: 配送完了済み（completeDelivery が staffStatus=配送完了 を設定）。
  // 回収履歴: 回収完了済み（completeRecovery が staffStatus=回収完了 を設定）。
  const deliveryHistory = (orders || []).filter(
    (o: any) => o && (o.staffStatus === "配送完了" || o.signature || o.deliverySignature)
  ).sort(byOrderDateDesc);
  const recoveryHistory = (orders || []).filter(
    (o: any) =>
      o &&
      (o.staffStatus === "回収完了" ||
        o.collectionSignature ||
        o.status === "完了" ||
        o.status === "返却済" ||
        o.status === "返却済み")
  ).sort(byOrderDateDesc);

  // 大量データでも重くならないよう各リストを段階表示（subTab 切替で先頭に戻す）。
  const qn = q.trim().toLowerCase();
  const matchQ = (o: any) => !qn || [o.orderNumber, o.id, o.companyName, o.company, o.siteName, o.site, o.deliveryLocation, o.address, o.addr].some((v) => String(v || "").toLowerCase().includes(qn));
  const dlvPage = usePagedList(deliveries.filter(matchQ), 50, subTab + "|" + qn);
  const rtnPage = usePagedList(recoveries.filter(matchQ), 50, subTab + "|" + qn);
  const dlvHistPage = usePagedList(deliveryHistory.filter(matchQ), 50, subTab + "|" + qn);
  const rtnHistPage = usePagedList(recoveryHistory.filter(matchQ), 50, subTab + "|" + qn);

  // 完了済み(doneDlv/doneRtn)はリストから外れるため、単純な引き算だと
  // 件数がマイナスになる。実際に残っているタスクを filter で数える。
  const pendingDlvCount = deliveries.filter((o: any) => !doneDlv.includes(o.id)).length;
  const pendingRtnCount = recoveries.filter((o: any) => !doneRtn.includes(o.id)).length;

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
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="注文番号・会社・現場・住所で検索"
          style={{ width: "100%", marginTop: 10, boxSizing: "border-box", border: "1px solid var(--border-2)", borderRadius: 12, padding: "10px 13px", fontSize: 14, fontWeight: 700, color: "var(--fg)", background: "var(--surface)", outline: "none" }} />
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px", minHeight: 0 }}>
        {subTab === "haisou" && (
          deliveries.length === 0 ? (
            <Empty icon="truck" title="配送予定はありません" sub="admin が配送予定にした注文がここに表示されます" />
          ) : (
            <>
              {dlvPage.shown.map(o => (
                <DeliveryCard key={o.id} o={o} done={doneDlv.includes(o.id)} outdoorMode={outdoorMode} onClick={() => setFlow({ type: "dlv", order: o })} />
              ))}
              {dlvPage.hasMore && <StaffShowMore remaining={dlvPage.remaining} onClick={dlvPage.showMore} />}
            </>
          )
        )}
        {subTab === "kaishu" && (
          recoveries.length === 0 ? (
            <Empty icon="package" title="回収予定はありません" sub="返却期限が近い注文、または回収予定の注文が表示されます" />
          ) : (
            <>
              {rtnPage.shown.map(o => (
                <RecoveryCard key={o.id} o={o} done={doneRtn.includes(o.id)} outdoorMode={outdoorMode} onClick={() => setFlow({ type: "rtn", order: o })} />
              ))}
              {rtnPage.hasMore && <StaffShowMore remaining={rtnPage.remaining} onClick={rtnPage.showMore} />}
            </>
          )
        )}
        {subTab === "nouhin_hist" && (
          deliveryHistory.length === 0 ? (
            <Empty icon="truck" title="納品履歴はありません" sub="配送を完了すると表示されます" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {dlvHistPage.shown.map((o: any) => (
                <HistoryCard key={o.id} order={o} kind="納品" date={o.deliveryDate || o.date} onViewDoc={() => setViewingDoc({ order: o, type: "納品書" })} />
              ))}
              {dlvHistPage.hasMore && <StaffShowMore remaining={dlvHistPage.remaining} onClick={dlvHistPage.showMore} />}
            </div>
          )
        )}
        {subTab === "kaishu_hist" && (
          recoveryHistory.length === 0 ? (
            <Empty icon="package" title="回収履歴はありません" sub="回収を完了すると表示されます" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {rtnHistPage.shown.map((o: any) => (
                <HistoryCard key={o.id} order={o} kind="回収" date={o.actualReturnDate || o.rentalEndDate || o.date} onViewDoc={() => setViewingDoc({ order: o, type: "回収書" })} />
              ))}
              {rtnHistPage.hasMore && <StaffShowMore remaining={rtnHistPage.remaining} onClick={rtnHistPage.showMore} />}
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
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--fg)", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-word" }}>{company}</div>
          <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", marginTop: 3, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-all" }}>{num}{site ? " ・ " + site : ""}</div>
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

function ProfileTab({ staff, user, onUpdateProfile, onLogout, doneDlv, doneRtn, deliveries, recoveries, outdoorMode, onToggleOutdoor }: any) {
  const [showHistory, setShowHistory] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<any>(user || {});
  const { orders } = useOrders();

  // 本日完了 = このセッションで完了にした件数（doneDlv/doneRtn）。残り業務 = ライブの未完了件数。
  const completedCount = doneDlv.length + doneRtn.length;
  const remainingCount = deliveries.length + recoveries.length;

  // 完了履歴は実データ（注文）から導出する（ライブリストは完了分を落とすため空になる）。
  // DeliveryRecoveryTab の deliveryHistory/recoveryHistory と同じ判定。
  const completedItems = [
    ...(orders || [])
      .filter((o: any) => o && (o.staffStatus === "配送完了" || o.signature || o.deliverySignature))
      .map((o: any) => ({ id: o.orderNumber || o.id, site: o.siteName || o.site || o.deliveryLocation || "—", kind: "配送", _d: o.deliveryDate || o.date || "" })),
    ...(orders || [])
      .filter((o: any) => o && (o.staffStatus === "回収完了" || o.collectionSignature || ["完了", "返却済", "返却済み"].includes(String(o.status || ""))))
      .map((o: any) => ({ id: o.orderNumber || o.id, site: o.siteName || o.site || "—", kind: "回収", _d: o.actualReturnDate || o.rentalEndDate || o.date || "" })),
  ]
    .sort((a: any, b: any) => String(b._d).localeCompare(String(a._d)))
    .slice(0, 50);

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
          {/* プロフィール画像をその場でカメラ撮影/選択（URL 手入力の代替）。 */}
          <PhotoCaptureButton
            onCapture={async (dataUrl) => {
              try { const url = await uploadDataUrl(dataUrl); setValue("avatarUrl", url); }
              catch { setValue("avatarUrl", dataUrl); }
            }}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 44, borderRadius: 12, border: "1px dashed var(--border-strong)", background: "var(--surface-2)", color: "var(--brand-accent)", fontSize: 13.5, fontWeight: 800, cursor: "pointer" }}
          >
            <Icon name="camera" size={16} />写真を撮影して設定
          </PhotoCaptureButton>
          {draft.avatarUrl ? (
            <img src={draft.avatarUrl} alt="" style={{ width: 64, height: 64, borderRadius: 14, objectFit: "cover", alignSelf: "center" }} />
          ) : null}
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
        <MetricCard label="本日完了" value={completedCount} unit="件" icon="checkCircle" tone="success" onClick={() => setShowHistory(true)} />
        <MetricCard label="残り業務" value={remainingCount} unit="件" icon="clock" tone="warning" />
      </div>

      <Btn full variant="secondary" icon="fileCheck" onClick={() => setShowHistory(true)}>
        完了履歴を見る
      </Btn>

      {/* 屋外モード: 直射日光でも読める高コントラスト表示の切替（現場ドライバー向け） */}
      <Card pad={14} style={{ marginTop: 10 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: outdoorMode ? "#00331a" : "var(--surface-3)", color: outdoorMode ? "#00FF66" : "var(--fg-muted)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Icon name="sun" size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: "var(--fg)" }}>屋外モード</div>
            <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2, fontWeight: 600 }}>直射日光でも見やすい高コントラスト表示</div>
          </div>
          <input type="checkbox" checked={!!outdoorMode} onChange={(e) => onToggleOutdoor && onToggleOutdoor(e.target.checked)} style={{ width: 22, height: 22, flexShrink: 0 }} />
        </label>
      </Card>

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
// 本日のルート: 配送・回収の全停車地を順に一覧し、Google マップで全ルートを一括ナビ。
// オフライン準備（写真の事前取得）も提供する（電波のある倉庫で取得 → 現場で参照）。
const ROUTE_CLAMP2: React.CSSProperties = { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-word" };
function RouteOverview({ deliveries, recoveries, doneDlv, doneRtn, outdoorMode, onBack, onOpenDlv, onOpenRcv }: any) {
  const stops = [
    ...(deliveries || []).filter((o: any) => !doneDlv.includes(o.id)).map((o: any) => ({ kind: "配送", color: "var(--brand-accent)", o })),
    ...(recoveries || []).filter((o: any) => !doneRtn.includes(o.id)).map((o: any) => ({ kind: "回収", color: "var(--success-bright)", o })),
  ];
  const addrs = stops.map((s) => s.o.addr).filter(Boolean);
  const openRoute = () => {
    if (!addrs.length) return;
    const enc = (a: string) => encodeURIComponent(a);
    let url: string;
    if (addrs.length === 1) url = `https://www.google.com/maps/dir/?api=1&destination=${enc(addrs[0])}&travelmode=driving`;
    else {
      const dest = enc(addrs[addrs.length - 1]);
      const wps = addrs.slice(0, -1).slice(0, 9).map(enc).join("|"); // Google の waypoints 上限に配慮(最大9)
      url = `https://www.google.com/maps/dir/?api=1&destination=${dest}&waypoints=${wps}&travelmode=driving`;
    }
    window.open(url, "_blank");
  };
  const [prefetch, setPrefetch] = useState<"idle" | "loading" | "done">("idle");
  const doPrefetch = async () => {
    setPrefetch("loading");
    const urls = Array.from(new Set(stops.flatMap((s) => (s.o.items || []).map((i: any) => i.image).filter((u: any) => typeof u === "string" && u))));
    await Promise.all(urls.map((u: any) => new Promise<void>((res) => { const img = new Image(); img.onload = () => res(); img.onerror = () => res(); img.src = u; })));
    setPrefetch("done");
  };
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: outdoorMode ? "#000" : "var(--bg)", minHeight: 0 }}>
      <TopBar title="本日のルート" sub={`${stops.length}件`} onBack={onBack} />
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 16px 16px", minHeight: 0 }}>
        {stops.length === 0 ? (
          <Empty icon="navigation" title="本日のルートはありません" sub="配送・回収の予定が入るとここに表示されます" />
        ) : (
          <>
            <Btn full size="lg" icon="navigation" style={{ marginBottom: 10 }} onClick={openRoute}>全ルートをマップで開く（{Math.min(addrs.length, 10)}地点{addrs.length > 10 ? "・先頭10件" : ""}）</Btn>
            <Btn full variant="secondary" icon={prefetch === "done" ? "checkCircle" : "download"} disabled={prefetch === "loading"} style={{ marginBottom: 14 }} onClick={doPrefetch}>
              {prefetch === "loading" ? "準備中…" : prefetch === "done" ? "オフライン準備完了" : "オフライン準備（写真を事前取得）"}
            </Btn>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {stops.map((s, i) => (
                <Card key={s.kind + s.o.id} pad={13} onClick={() => (s.kind === "配送" ? onOpenDlv(s.o) : onOpenRcv(s.o))}>
                  <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 99, background: s.color, color: "#fff", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 900, flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Badge variant={s.kind === "配送" ? "brand" : "success"}>{s.kind}</Badge>
                        {s.o.eta && <span style={{ fontSize: 12, color: "var(--fg-muted)", fontWeight: 700 }}>{s.o.eta}</span>}
                      </div>
                      <div style={{ fontSize: 14.5, fontWeight: 800, color: "var(--fg)", marginTop: 4, ...ROUTE_CLAMP2 }}>{s.o.site}</div>
                      <div style={{ fontSize: 12.5, color: "var(--fg-muted)", marginTop: 2, ...ROUTE_CLAMP2 }}>{s.o.addr}</div>
                    </div>
                    <Icon name="chevronRight" size={18} color="var(--fg-subtle)" />
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function UnifiedStaffApp({ outdoorMode: outdoorModeProp }: { outdoorMode: boolean }) {
  const ml = useMobileLive();
  const { orders, updateOrder, addCustomOrder } = useOrders();
  const { currentUser, updateUser, logout } = useUser();
  // 屋外モード（直射日光でも読める高コントラスト表示）。端末ごとに記憶する。
  const [outdoorMode, setOutdoorMode] = useState<boolean>(() => {
    try { return localStorage.getItem("asahi.staff.outdoor") === "1"; } catch { return !!outdoorModeProp; }
  });
  useEffect(() => {
    try { localStorage.setItem("asahi.staff.outdoor", outdoorMode ? "1" : "0"); } catch { /* ignore */ }
  }, [outdoorMode]);
  // 未送信(サーバ未確定)件数を定期取得して TopBar に表示する。
  const [pendingSync, setPendingSync] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setPendingSync(OrderBus.pendingCount()), 2000);
    return () => window.clearInterval(t);
  }, []);
  const [tab, setTab] = useState("home");
  const [subView, setSubView] = useState<string | null>(null);
  const [flow, setFlow] = useState<any>(null);
  const [showNotifications, setShowNotifications] = useState(false);

  // 「本日完了」は端末再起動でも当日分を維持する（以前はメモリのみで再起動毎に 0 に戻っていた）。
  // ユーザ別・JST日付別キーで保存し、日付が変われば自動的に空から開始する。
  const todayStrJst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const doneKey = `done:${currentUser?.id || "anon"}:${todayStrJst}`;
  const savedDone = loadDraft(doneKey, { dlv: [] as string[], rtn: [] as string[] });
  const [doneDlv, setDoneDlv] = useState<string[]>(() => Array.isArray(savedDone.dlv) ? savedDone.dlv : []);
  const [doneRtn, setDoneRtn] = useState<string[]>(() => Array.isArray(savedDone.rtn) ? savedDone.rtn : []);
  const doneKeyRef = useRef(doneKey);
  useEffect(() => {
    // JST 日付境界をまたいでアプリを開いたままにすると doneKey が変わる。その際は古い state を
    // 新キーで保存せず、新キーの保存値をロードして state をリセットする（前日の完了が新日へ持ち越されるのを防ぐ）。
    if (doneKeyRef.current !== doneKey) {
      const fresh = loadDraft(doneKey, { dlv: [] as string[], rtn: [] as string[] });
      setDoneDlv(Array.isArray(fresh.dlv) ? fresh.dlv : []);
      setDoneRtn(Array.isArray(fresh.rtn) ? fresh.rtn : []);
      doneKeyRef.current = doneKey;
      return;
    }
    saveDraft(doneKey, { dlv: doneDlv, rtn: doneRtn });
  }, [doneDlv, doneRtn, doneKey]);

  // 端末通知の権限 + チャンネルを起動時に確立しておく（初回アラートを取りこぼさない）。
  useEffect(() => { void initStaffNotify(); }, []);

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
          // 一次受付日（＝顧客が持ち込んだ日）を YYYY-MM-DD で保持する。
          // 返却分(-R)注文のレンタル課金は「この一次受付日」までで締める。
          // 最終検品が後日にずれても検品日まで課金を伸ばさない（過大請求防止）。
          receptionReturnDate: (() => {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          })(),
          // 一次受付検品(検品1回目)の担当者を記録。
          fieldInspector: staff.name,
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
          inspectionMemo: extra?.overallMemo || walkinOrder.inspectionMemo || "",
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
    // 関連注文を解決（あれば）。出庫前(deliveryConfirmedAt 無し)や既に在庫戻し済み(stockRestored)の
    // 注文は、ここで現物在庫を二重加算しないようガードする。
    // 注文に紐づかない持込（来客の直接返却など）は現物が戻っているので従来どおり加算する。
    const linkedOrder = walkinOrder && walkinOrder.orderId
      ? (orders || []).find((o: any) =>
          o.id === walkinOrder.orderId ||
          o.firestoreId === walkinOrder.orderId ||
          (walkinOrder.orderNumber && o.orderNumber === walkinOrder.orderNumber))
      : null;
    const shouldRestock = !linkedOrder || (((!!(linkedOrder as any).stockDeducted) || (!!(linkedOrder as any).deliveryConfirmedAt)) && !(linkedOrder as any).stockRestored);

    // 入庫 + 在庫調整。良品数 = 検品実数(counted) − 「現物が戻っているが不良」な報告分。
    // 「数量不足」は現物が戻っていない（counted に含まれない）ため差し引かない（二重控除防止）。
    // 不足は counted（expected − counted）で計上され、破損・汚損等は counted 内の不良として差し引く。
    const isShortageReason = (reason: any) => String(reason || "").includes("不足") || String(reason || "").includes("紛失");
    const defectiveQtyOf = (p: any) =>
      (p.report || []).filter((r: any) => !isShortageReason(r?.reason)).reduce((s: number, r: any) => s + Number(r?.qty || 0), 0);
    const goodQtyOf = (p: any) => Math.max(0, Number(p.counted || 0) - defectiveQtyOf(p));
    // 実際に在庫へ戻した数量（注文明細ID別）。一部返却の継続注文へ伝播し、stockDeductedQty 予算を減算する
    //（複数サイクルでの over-restock 防止。詳細は finalizePartialReturn / stockLedger.restoreOrderStock）。
    const restockedByItem: Record<string, number> = {};
    // 多端末で同じ最終検品を同時確定した際の二重入庫を防ぐ:
    // restock 直前にライブの注文を再取得し、既に stockRestored 済みならスキップする
    //（restoreOrderStock と同じライブガード。先に確定した端末のフラグが同期していれば二重加算しない）。
    const freshLinked = linkedOrder
      ? OrderBus.getAll<any>("orders").find((o: any) => o.id === (linkedOrder as any).id || o.firestoreId === (linkedOrder as any).firestoreId)
      : null;
    const liveAlreadyRestored = !!(freshLinked && (freshLinked as any).stockRestored);
    if (shouldRestock && !liveAlreadyRestored) {
      if (linkedOrder) {
        // 注文に紐づく返却: 在庫戻しを唯一の権威 restoreOrderStock に委譲する（インラインの cappedGoodOf を廃止）。
        // 出庫数(stockDeductedQty)を予算上限に、本サイクルの良品数(良品=counted−不良)だけ戻す。
        // 合成注文の items に「今回の良品数」を quantity、現在の残予算を stockDeductedQty として渡すと、
        // restoreOrderStock は back = min(quantity, stockDeductedQty) を戻す（issues は良品計算で控除済みのため空）。
        // id/firestoreId/orderNumber を持たせない＝resolveLiveOrder が null を返し、合成注文自身がガード対象になる
        //（stockRestored 未設定なので戻しが実行される）。実際に戻せた数は restockedByItem に積算される。
        const restockItems = valid
          .map((p: any) => {
            const oi = ((linkedOrder as any).items || []).find((x: any) => x.id === p.id || x.name === p.name);
            if (!oi) return null; // 注文に無い品目は予算が無いため戻さない（無制限戻しは no-linkedOrder 経路のみ）。
            const budget = oi.stockDeductedQty != null ? Math.max(0, Number(oi.stockDeductedQty)) : Number(oi.quantity || 0);
            return {
              id: oi.id,
              name: oi.name,
              type: oi.type || "rent",
              quantity: goodQtyOf(p),
              returnedQuantity: 0,
              stockDeductedQty: budget,
            };
          })
          .filter(Boolean);
        if (restockItems.length > 0) {
          restoreOrderStock({ items: restockItems, stockDeducted: true }, [], { collect: restockedByItem });
        }
      } else if (ml.addStockMove) {
        // 注文に紐づかない持込（来客の直接返却）: 現物が戻っているので従来どおり無制限に戻す。
        valid.forEach(p => {
          const good = goodQtyOf(p);
          if (good <= 0) return; // 全数が不良/不足なら在庫へ戻さない
          ml.addStockMove("入庫", { item: p.name, qty: good, ref: "持込返却", icon: isVehicle(p) ? "car" : "package" });
        });
        if (ml.adjustStock && ml.findProductByName) {
          valid.forEach(p => {
            const good = goodQtyOf(p);
            if (good <= 0) return;
            const fp = ml.findProductByName(p.name);
            if (fp) ml.adjustStock(fp.firestoreId || fp.id, good);
          });
        }
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
        // 返却分(-R)注文は「顧客が持ち込んだ日（一次受付日）」までで課金する。
        // 一次受付で記録した receptionReturnDate を優先し、
        // それを経ない経路（現場回収など receptionReturnDate 無し）は最終検品日にフォールバック。
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        const actualReturnDate = (walkinOrder as any).receptionReturnDate || todayStr;

        // 検品実数（counted）を返却数量として確定
        const returnQuantities: Record<string, number> = {};
        productsList.forEach((p: any) => {
          returnQuantities[p.id] = p.counted || 0;
        });

        // 不足・破損を itemIssues として記録。
        // 不足(missing)は counted の差分(expected−counted)で 1 回だけ計上する。
        // report の「数量不足/紛失」は counted と重複するため除外（二重計上防止）。
        // それ以外の report（破損あり・汚損・部品欠品 等）は破損(broken)として計上する。
        const itemIssues: any[] = [];
        productsList.forEach((p: any) => {
          const shortage = (p.expected || 0) - (p.counted || 0);
          if (shortage > 0) {
            itemIssues.push({ itemId: p.id, type: "missing", quantity: shortage, notes: "倉庫検品で不足を確認" });
          }
          (p.report || []).forEach((r: any) => {
            const reason = String(r?.reason || "");
            if (reason.includes("不足") || reason.includes("紛失")) return; // counted で計上済み
            itemIssues.push({
              itemId: p.id,
              type: "broken",
              quantity: r.qty || 1,
              notes: r.note || reason || "倉庫検品報告",
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
          // 倉庫最終検品で在庫を検品実数（counted）分すでに戻した場合のみ stockRestored を記録する。
          // 実際に戻していない（未出庫・既に戻し済み等で shouldRestock=false）注文に印を付けると、
          // 後続の正当な入庫が永久にブロックされるため、条件付きで設定する。
          if (shouldRestock) extraFields.stockRestored = true;
          // 最終検品(検品最終回)の担当者を注文に記録し、admin で確認できるようにする。
          extraFields.finalInspectedBy = staff.name;
          extraFields.finalInspectedAt = new Date().toISOString();
          // 破損・紛失の弁償費を自動計上（最終検品で確定）。請求書に ExtraCost として載る。
          const compensation = computeCompensationCharge({ items: targetOrder.items, itemIssues }, ml.products || []);
          if (compensation) extraFields.compensationCharge = compensation;

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
              // 今回戻した数を継続注文へ伝播し stockDeductedQty 予算を減算（複数サイクルの over-restock 防止）。
              restockedByItem,
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
        // 最終検品の担当者 = ログイン中のスタッフ（固定モックではなく実担当者を記録）。
        inspector: staff.name || "倉庫スタッフ",
        returningEverything: !!walkinOrder?.returningEverything,
        memo: extra?.overallMemo || walkinOrder?.inspectionMemo || "",
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

  // 【フック順序の固定】以下の集計とフック(useStaffNotificationAlerts)は、必ず
  // flow / subView による早期 return より前で実行する。早期 return の後ろにフックがあると、
  // 業務（flow）を開いた瞬間に「呼ばれるフック数が減る」ため React error #300 でクラッシュする。
  const deliveries = ml.liveDeliveries;
  const recoveries = ml.liveRecoveries;
  const walkinCount = ml.walkin ? ml.walkin.length : 0;

  const VL = ml.vehicles || [];
  const ML = ml.maint || [];
  const overdueVeh = VL.filter(v => (v.days ?? v.inspectionDaysRemaining ?? 0) < 0).length;
  const overdueMnt = ML.filter(m => m.days < 0).length;

  // 完了済み(doneDlv/doneRtn)はリストから外れるため、単純な引き算だと
  // 件数がマイナスになる。実際に残っているタスクを filter で数える。
  const pendingDlvCount = deliveries.filter((o: any) => !doneDlv.includes(o.id)).length;
  const pendingRtnCount = recoveries.filter((o: any) => !doneRtn.includes(o.id)).length;
  const completedTasks = doneDlv.length + doneRtn.length;
  // 完了済みはライブリストから外れるため、分母に完了分を足して
  // 「完了 / 総数」が 100% を超えない・分子が分母を超えないようにする。
  const totalTasks = deliveries.length + recoveries.length + completedTasks;
  // admin からの連絡（staffMessages）: 全員宛 or 自分宛、かつ直近7日分のみを新しい順に最大10件。
  // （無期限に溜めると通知一覧が際限なく膨らむため上限を設ける）。
  const MSG_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const myMessages = (ml.staffMessages || [])
    .filter((m: any) => {
      const t = String(m?.target ?? "all");
      if (!(t === "all" || t === "staff" || t === (currentUser?.id || ""))) return false;
      const ts = m?.createdAt ? new Date(m.createdAt).getTime() : nowMs;
      return !isNaN(ts) && nowMs - ts <= MSG_MAX_AGE_MS;
    })
    .sort((a: any, b: any) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime())
    .slice(0, 10);
  const staffNotifications = buildStaffNotifications({ deliveries, recoveries, walkin: ml.walkin || [], vehicles: VL, maintenance: ML, messages: myMessages });
  const notifReads = useNotificationReads("staff:" + (currentUser?.id || ""));
  const staffUnread = notifReads.unreadCount(staffNotifications);
  // 新しい業務通知を検知したら端末通知（音付き）を鳴らす（APK のみ。Web は no-op）。
  useStaffNotificationAlerts(staffNotifications);

  // ↓ ここから先は早期 return 可（全フック呼び出し済み）。
  if (flow) {
    if (flow.type === "dlv") {
      return (
        <DeliveryFlow
          o={flow.order}
          staffName={staff.name}
          onExit={() => setFlow(null)}
          onComplete={async (id, signature, photos, extra) => {
            // 完了集合は表示 id（live list の o.id = orderNumber）で記録する。
            // 受け取る id は firestoreId のことがあり、消費側 (o.id) と一致しないため。
            setDoneDlv(d => d.includes(flow.order.id) ? d : [...d, flow.order.id]);
            // お客様の受領サインと写真、保安車両の貸出記録 + 配送担当者(ログイン中スタッフ)を注文に保存。
            if (ml.completeDelivery) ml.completeDelivery(flow.order.firestoreId || id, signature, photos, { ...(extra || {}), deliveredBy: staff.name });
            setFlow(null);
            setTab("delivery_recovery");
            // サーバー反映を確認。電波不良なら送信待ち（自動再送）を明示してデータ消失の誤解を防ぐ。
            const ok = await OrderBus.flush(8000);
            if (!ok) void alertDialog("通信が不安定なため送信待ちです。電波の良い場所で自動的に再送信されます（記録は保持されています）。");
          }}
        />
      );
    } else if (flow.type === "rtn") {
      return (
        <RecoveryFlow
          o={flow.order}
          onExit={() => setFlow(null)}
          onComplete={async (id, signature, photos, inspected, extra) => {
            setDoneRtn(d => d.includes(flow.order.id) ? d : [...d, flow.order.id]);
            // お客様の回収サインと写真 + 現場検品結果（counted/report）を最終検品へ引き継ぐ + 回収担当者・不在記録を保存。
            if (ml.completeRecovery) ml.completeRecovery(flow.order.firestoreId || id, signature, photos, inspected, staff.name, extra);
            setFlow(null);
            setTab("delivery_recovery");
            const ok = await OrderBus.flush(8000);
            if (!ok) void alertDialog("通信が不安定なため送信待ちです。電波の良い場所で自動的に再送信されます（記録は保持されています）。");
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

  if (subView === "stocktake") return <WhStocktake onBack={() => setSubView(null)} staffName={staff.name} />;
  if (subView === "route") return <RouteOverview deliveries={deliveries} recoveries={recoveries} doneDlv={doneDlv} doneRtn={doneRtn} outdoorMode={outdoorMode} onBack={() => setSubView(null)} onOpenDlv={(o: any) => { setSubView(null); setFlow({ type: "dlv", order: o }); }} onOpenRcv={(o: any) => { setSubView(null); setFlow({ type: "rtn", order: o }); }} />;

  // 通知ベルはホームにしか無いため、他タブ作業中でも未読が分かるよう
  // ボトムナビの「ホーム」に未読件数バッジを出す（タップでホーム→ベル）。
  const tabs = [
    { key: "home", label: "ホーム", icon: "home", badge: staffUnread > 0 ? staffUnread : null },
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
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {/* 同期状態（オフライン/送信待ちを現場で気づけるように） */}
                {!ml.connected ? (
                  <span title="オフライン" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 900, color: "var(--danger-bright)", background: "var(--danger-tint)", border: "1px solid var(--danger-bright)", borderRadius: 99, padding: "3px 8px" }}><Icon name="alert" size={12} />オフライン</span>
                ) : null}
                {/* 送信待ち件数 + 今すぐ再送（電波の悪い現場でデータがサーバへ届いたか分かるように） */}
                {pendingSync > 0 ? (
                  <button onClick={() => OrderBus.retryPending()} title="今すぐ再送" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 900, color: "var(--warning-bright)", background: "var(--warning-tint)", border: "1px solid var(--warning-bright)", borderRadius: 99, padding: "3px 8px", cursor: "pointer" }}><Icon name="refresh" size={12} />送信待ち{pendingSync}</button>
                ) : null}
                <div style={{ position: "relative" }}>
                  <IconBtn name="bell" badge={staffUnread > 0} onClick={() => setShowNotifications(!showNotifications)} />
                  {showNotifications && <StaffNotificationPopover items={staffNotifications} isRead={notifReads.isRead} markRead={notifReads.markRead} onClose={() => setShowNotifications(false)} onNavigate={(n) => {
                    if (n.target === "walkin") { setFlow({ type: "walkin" }); return; }
                    if (n.target) setTab(n.target);
                  }} />}
                </div>
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
              <span style={{ color: "var(--brand-strong)", fontFamily: "var(--font-mono)" }}>{completedTasks} / {totalTasks} 件 ({totalTasks ? Math.min(100, Math.round((completedTasks / totalTasks) * 100)) : 0}%)</span>
            </div>
            <ProgressBar value={completedTasks} max={totalTasks} color="#10B981" />
          </Card>
        </div>

        {/* 次の業務（最優先タスクを1つだけ大きく提示）+ 本日のルート */}
        {(() => {
          const nextDlv = nextDeliveries[0];
          const nextRcv = nextRecoveries[0];
          const routeCount = deliveries.filter((o: any) => !doneDlv.includes(o.id)).length + recoveries.filter((o: any) => !doneRtn.includes(o.id)).length;
          const hero = nextDlv
            ? { label: "次の配送", color: "var(--brand-accent)", site: nextDlv.site, addr: nextDlv.addr, eta: nextDlv.eta, icon: "truck", action: () => setFlow({ type: "dlv", order: nextDlv }) }
            : nextRcv
              ? { label: "次の回収", color: "var(--success-bright)", site: nextRcv.site, addr: nextRcv.addr, eta: nextRcv.eta, icon: "package", action: () => setFlow({ type: "rtn", order: nextRcv }) }
              : walkinCount > 0
                ? { label: "対応待ち", color: "var(--warning-bright)", site: `持込返却 ${walkinCount}件の検品待ち`, addr: "", eta: "", icon: "clipboardCheck", action: () => setFlow({ type: "walkin" }) }
                : null;
          return (
            <>
              {hero && (
                <Card pad={0} style={{ marginBottom: 12, overflow: "hidden", border: `1.5px solid ${hero.color}` }}>
                  <div style={{ padding: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: hero.color, letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: 5 }}>
                      <Icon name={hero.icon} size={14} />{hero.label}{hero.eta ? ` ・ ${hero.eta}` : ""}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: "var(--fg)", marginTop: 5, lineHeight: 1.3, ...ROUTE_CLAMP2 }}>{hero.site}</div>
                    {hero.addr ? <div style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 3, ...ROUTE_CLAMP2 }}>{hero.addr}</div> : null}
                    <Btn full size="lg" icon={hero.icon} style={{ marginTop: 12 }} onClick={hero.action}>開始する</Btn>
                  </div>
                </Card>
              )}
              {routeCount > 0 && (
                <Btn full variant="secondary" icon="navigation" style={{ marginBottom: 18 }} onClick={() => setSubView("route")}>本日のルートを見る（{routeCount}件）</Btn>
              )}
            </>
          );
        })()}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
          <MetricCard label="配送予定" value={pendingDlvCount} unit="件" icon="truck" tone="brand" onClick={() => setTab("delivery_recovery")} />
          <MetricCard label="回収予定" value={pendingRtnCount} unit="件" icon="package" tone="success" onClick={() => setTab("delivery_recovery")} />
          <MetricCard label="持込返却" value={walkinCount} unit="件" icon="clipboardCheck" tone="warning" onClick={() => setFlow({ type: "walkin" })} />
          <MetricCard label="点検要対応" value={overdueVeh + overdueMnt} unit="件" icon="alert" tone={hasAlerts ? "danger" : "neutral"} onClick={() => setTab("inspect")} />
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
      </Screen>
    );
  } else if (tab === "delivery_recovery") {
    content = <DeliveryRecoveryTab setFlow={setFlow} doneDlv={doneDlv} doneRtn={doneRtn} outdoorMode={outdoorMode} />;
  } else if (tab === "stock") {
    content = <WhStock moves={ml.stockMoves} addMove={ml.addStockMove} onReturn={() => setFlow({ type: "walkin" })} staffName={staff.name} />;
  } else if (tab === "inspect") {
    content = <WhInspect staffName={staff.name} />;
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
        onToggleOutdoor={setOutdoorMode}
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

// 端末に記憶した屋外モードの初期値を読む（フレーム/ステータスバーの背景を内側と一致させる）。
function readOutdoorPref(): boolean {
  try { return localStorage.getItem("asahi.staff.outdoor") === "1"; } catch { return false; }
}

export default function StaffDashboard() {
  const outdoorMode = readOutdoorPref();
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
  const outdoorMode = readOutdoorPref();
  return (
    <MobileLiveProvider>
      <div
        data-theme="light"
        style={{
          width: "100vw",
          minHeight: "100dvh",
          height: "100dvh",
          overflow: "hidden",
          background: outdoorMode ? "#000000" : "var(--bg)",
          color: "var(--fg)",
          fontFamily: "\"Noto Sans JP\", sans-serif",
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <UnifiedStaffApp outdoorMode={outdoorMode} />
      </div>
    </MobileLiveProvider>
  );
}
