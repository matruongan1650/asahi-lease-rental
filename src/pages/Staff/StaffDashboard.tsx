import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Icon from "../../components/staff/Icon";
import {
  TopBar,
  IconBtn,
  Badge,
  Btn,
  Card,
  ProgressBar,
  BottomNav,
  Screen,
  Empty,
  statusVariant,
  SectionLabel
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

// ---------------------------------------------------------------------------
// 1. Premium Stats and Alert helper components (Japanese Aesthetics)
// ---------------------------------------------------------------------------

function StatTile({ label, value, unit, icon, variant = "neutral", onClick }: any) {
  const colors = {
    neutral: {
      fg: "var(--fg)",
      bg: "var(--surface-2)",
      iconColor: "var(--fg-muted)",
      border: "var(--border)"
    },
    brand: {
      fg: "var(--brand-accent)",
      bg: "rgba(58,77,232,0.12)",
      iconColor: "var(--brand-accent)",
      border: "rgba(58,77,232,0.25)"
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
    fg: "var(--fg)",
    bg: "var(--surface-2)",
    iconColor: "var(--fg-muted)",
    border: "var(--border)"
  };

  return (
    <div
      onClick={onClick}
      style={{
        background: "linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%)",
        border: `1px solid ${colors.border}`,
        borderTop: `3px solid ${colors.iconColor}`,
        borderRadius: "16px",
        padding: "16px 14px",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)",
        cursor: onClick ? "pointer" : undefined,
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ 
          width: 38, height: 38, borderRadius: 10, 
          background: colors.bg, display: "grid", placeItems: "center"
        }}>
          <Icon name={icon} size={20} color={colors.iconColor} />
        </div>
        {onClick && <Icon name="chevronRight" size={15} color="var(--fg-subtle)" style={{ opacity: 0.8 }} />}
      </div>
      <div style={{ fontSize: 32, fontWeight: 900, color: colors.fg, fontFamily: "var(--font-mono)", marginTop: 12, lineHeight: 1, letterSpacing: "-0.02em" }}>
        {value}
        <span style={{ fontSize: 13, fontWeight: 800, marginLeft: 4, fontFamily: "var(--font-jp)", color: "var(--fg-subtle)", verticalAlign: "baseline" }}>{unit}</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 8, fontWeight: 800, letterSpacing: "0.02em" }}>{label}</div>
    </div>
  );
}

function AlertRow({ icon, variant, title, sub, onClick }: any) {
  const c = { danger: "var(--danger-bright)", warning: "var(--warning-bright)" }[variant as "danger" | "warning"];
  const bg = { danger: "var(--danger-tint)", warning: "var(--warning-tint)" }[variant as "danger" | "warning"];

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: 14,
        borderRadius: 14,
        background: "var(--surface)",
        border: "1px solid var(--border-2)",
        borderLeft: `5px solid ${c}`,
        marginBottom: 9,
        cursor: "pointer",
        boxShadow: "var(--shadow-card)"
      }}
    >
      <div style={{ width: 40, height: 40, borderRadius: 10, background: bg, color: c, display: "grid", placeItems: "center", flexShrink: 0 }}>
        <Icon name={icon} size={19} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: "var(--fg)" }}>{title}</div>
        <div style={{ fontSize: 12.5, color: "var(--fg-muted)", marginTop: 2, fontWeight: 500 }}>{sub}</div>
      </div>
      <Icon name="chevronRight" size={16} color="var(--fg-subtle)" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Structured Task list cards (Clean & Balanced Padding)
// ---------------------------------------------------------------------------

function DeliveryCard({ o, done, onClick }: any) {
  return (
    <Card 
      onClick={onClick} 
      style={{ 
        marginBottom: 12, 
        opacity: done ? 0.65 : 1, 
        padding: "16px",
        borderLeft: done ? "5px solid var(--border)" : "5px solid var(--brand)",
        transition: "all 0.2s ease"
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 800, color: "var(--brand-accent)", letterSpacing: "0.02em" }}>{o.id}</span>
            {o.priority === "急ぎ" && !done && <Badge variant="warning">急ぎ</Badge>}
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "var(--fg)", letterSpacing: "-0.01em", lineHeight: 1.35 }}>{o.site}</div>
          <div style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 5, fontWeight: 700 }}>{o.company}</div>
        </div>
        <Badge variant={done ? "success" : "neutral"} icon={done ? "check" : "clock"}>{done ? "完了" : o.window}</Badge>
      </div>
      <div style={{ 
        display: "flex", alignItems: "center", gap: 14, 
        marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border-2)", 
        color: "var(--fg-muted)", fontSize: 12.5
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 600 }}>
          <Icon name="mapPin" size={14} color="var(--fg-subtle)" />
          {o.dist}
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

function RecoveryCard({ o, done, onClick }: any) {
  return (
    <Card 
      onClick={onClick} 
      style={{ 
        marginBottom: 12, 
        opacity: done ? 0.65 : 1, 
        padding: "16px",
        borderLeft: done ? "5px solid var(--border)" : "5px solid var(--success-bright)",
        transition: "all 0.2s ease"
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 800, color: "var(--brand-accent)", letterSpacing: "0.02em" }}>{o.id}</span>
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "var(--fg)", letterSpacing: "-0.01em", lineHeight: 1.35 }}>{o.site}</div>
          <div style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 5, fontWeight: 700 }}>{o.company}</div>
        </div>
        <Badge variant={done ? "success" : "neutral"} icon={done ? "check" : "clock"}>{done ? "完了" : o.window}</Badge>
      </div>
      <div style={{ 
        display: "flex", alignItems: "center", gap: 14, 
        marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border-2)", 
        color: "var(--fg-muted)", fontSize: 12.5
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 600 }}>
          <Icon name="mapPin" size={14} color="var(--fg-subtle)" />
          {o.dist}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", fontWeight: 600 }}>
          <Icon name="qr" size={14} color="var(--fg-subtle)" />
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--fg)" }}>{(o.products || []).length}</span>品目
        </span>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 3, color: "var(--brand-accent)", fontWeight: 800 }}>
          {done ? "詳細を表示" : "業務を開始"}<Icon name="chevronRight" size={15} />
        </span>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 3. Tab Sub-Views (Delivery/Recovery Tab, ProfileTab)
// ---------------------------------------------------------------------------

function DeliveryRecoveryTab({ setFlow, doneDlv, doneRtn }: any) {
  const ml = useMobileLive();
  const [subTab, setSubTab] = useState("haisou");
  const deliveries = ml.liveDeliveries;
  const recoveries = ml.liveRecoveries;

  const pendingDlvCount = deliveries.length - doneDlv.length;
  const pendingRtnCount = recoveries.length - doneRtn.length;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)", minHeight: 0 }}>
      <TopBar title="配送・回収業務" sub="DELIVERY & RECOVERY" />
      
      <div style={{ padding: "0 16px 12px" }}>
        <div style={{ display: "flex", gap: 7, background: "var(--surface-2)", padding: 4, borderRadius: 12 }}>
          {[
            ["haisou", `配送予定 (${pendingDlvCount})`],
            ["kaishu", `回収予定 (${pendingRtnCount})`]
          ].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setSubTab(k)}
              style={{
                flex: 1,
                padding: "9px 0",
                borderRadius: 9,
                border: "none",
                background: subTab === k ? "var(--surface)" : "transparent",
                color: subTab === k ? "var(--fg)" : "var(--fg-muted)",
                fontWeight: 800,
                fontSize: 13,
                cursor: "pointer",
                boxShadow: subTab === k ? "var(--shadow-card)" : "none",
                fontFamily: "var(--font-jp)"
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px", minHeight: 0 }}>
        {subTab === "haisou" ? (
          <div>
            {deliveries.length === 0 ? (
              <Empty icon="truck" title="本日の配送予定はありません" />
            ) : (
              deliveries.map(o => (
                <DeliveryCard key={o.id} o={o} done={doneDlv.includes(o.id)} onClick={() => setFlow({ type: "dlv", order: o })} />
              ))
            )}
          </div>
        ) : (
          <div>
            {recoveries.length === 0 ? (
              <Empty icon="package" title="本日の回収予定はありません" />
            ) : (
              recoveries.map(o => (
                <RecoveryCard key={o.id} o={o} done={doneRtn.includes(o.id)} onClick={() => setFlow({ type: "rtn", order: o })} />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileTab({ staff, doneDlv, doneRtn, deliveries, recoveries }: any) {
  const [showHistory, setShowHistory] = useState(false);

  const completedItems = [
    ...deliveries.filter((o: any) => doneDlv.includes(o.id)).map((o: any) => ({ ...o, kind: "配送", icon: "truck" })),
    ...recoveries.filter((o: any) => doneRtn.includes(o.id)).map((o: any) => ({ ...o, kind: "回収", icon: "package" }))
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
    <Screen>
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
      
      <Card pad={6} style={{ marginBottom: 16 }}>
        {[
          { icon: "truck", label: "運行状況", value: "オンライン", onClick: undefined },
          { icon: "clipboardCheck", label: "完了履歴を表示", value: `${completedItems.length} 件`, onClick: () => setShowHistory(true) },
          { icon: "settings", label: "アプリ設定", value: "", onClick: undefined }
        ].map((item, i) => (
          <div 
            key={item.label} 
            onClick={item.onClick}
            style={{ display: "flex", alignItems: "center", gap: 13, padding: "13px 10px", borderTop: i ? "1px solid var(--border)" : "none", cursor: item.onClick ? "pointer" : undefined }}
          >
            <Icon name={item.icon as any} size={19} color="var(--fg-muted)" />
            <span style={{ flex: 1, fontSize: 14.5, fontWeight: 700, color: "var(--fg)" }}>{item.label}</span>
            <span style={{ fontSize: 13, color: "var(--fg-muted)", fontWeight: 600 }}>{item.value}</span>
            {item.onClick && <Icon name="chevronRight" size={16} color="var(--fg-subtle)" style={{ marginLeft: "auto" }} />}
          </div>
        ))}
      </Card>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// 4. Main Unified Staff Dashboard view (Cobalt Aesthetics Redesign)
// ---------------------------------------------------------------------------

function UnifiedStaffApp() {
  const ml = useMobileLive();
  const { orders, updateOrder, addCustomOrder } = useOrders();
  const [tab, setTab] = useState("home");
  const [subView, setSubView] = useState<string | null>(null);
  const [flow, setFlow] = useState<any>(null); // { type: "dlv" | "rtn" | "walkin", order?: any }

  const [doneDlv, setDoneDlv] = useState<string[]>([]);
  const [doneRtn, setDoneRtn] = useState<string[]>([]);

  // Deep Link from router orderId if provided
  const { orderId } = useParams<{ role: string; orderId: string }>();
  useEffect(() => {
    if (orderId) {
      const dlvOrder = ml.liveDeliveries.find(d => d.id === orderId);
      if (dlvOrder) {
        setFlow({ type: "dlv", order: dlvOrder });
        setTab("delivery_recovery");
      } else {
        const rtnOrder = ml.liveRecoveries.find(r => r.id === orderId);
        if (rtnOrder) {
          setFlow({ type: "rtn", order: rtnOrder });
          setTab("delivery_recovery");
        }
      }
    }
  }, [orderId, ml.liveDeliveries, ml.liveRecoveries]);

  // Combined staff user
  const staff = {
    name: "鈴木 健",
    role: "運行・倉庫総合管理責任者",
    team: "東京中央ベース",
    id: "STF-991"
  };

  const completeReturn = (productsList: any[], walkinOrder?: any) => {
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
            { itemIssues, remainingStatus: "一部返却", inspectedByWarehouse: true }
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

  // Handle Full-Screen Subviews like Stocktake
  if (subView === "stocktake") {
    return <WhStocktake onBack={() => setSubView(null)} />;
  }

  const deliveries = ml.liveDeliveries;
  const recoveries = ml.liveRecoveries;
  const walkinCount = ml.walkin ? ml.walkin.length : 0;

  // Calculate Warehouse stats
  const VL = ml.vehicles || [];
  const ML = ml.maint || [];
  const overdueVeh = VL.filter(v => {
    const days = v.days ?? v.inspectionDaysRemaining ?? 0;
    return days < 0;
  }).length;
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
      <Screen>
        {/* Modern Date Header Banner */}
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
          </div>

          {/* Premium User Information & Progress Card */}
          <Card pad={18} style={{ 
            background: "linear-gradient(135deg, rgba(58,77,232,0.16) 0%, rgba(24,34,210,0.04) 100%)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "18px",
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

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--fg-muted)" }}>本日の運行タスク進捗</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: "var(--brand-accent)", fontFamily: "var(--font-mono)", letterSpacing: "0.02em" }}>
                {completedTasks} <span style={{ fontSize: 12, color: "var(--fg-subtle)", fontFamily: "var(--font-jp)", fontWeight: 500 }}>/</span> {totalTasks} <span style={{ fontSize: 12, color: "var(--fg-subtle)", fontFamily: "var(--font-jp)", fontWeight: 500 }}>完了</span> 
                <span style={{ fontSize: 12, background: "var(--brand-tint)", color: "var(--brand-accent)", padding: "2px 7px", borderRadius: 6, marginLeft: 6, fontWeight: 800 }}>
                  {totalTasks ? Math.round((completedTasks/totalTasks)*100) : 0}%
                </span>
              </span>
            </div>
            <ProgressBar value={completedTasks} max={totalTasks} color="var(--success-bright)" />
          </Card>
        </div>

        {/* Spacious 2-Column Stats Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <StatTile label="配送予定" value={pendingDlvCount} unit="件" icon="truck" variant="brand" onClick={() => setTab("delivery_recovery")} />
          <StatTile label="回収予定" value={pendingRtnCount} unit="件" icon="package" variant="success" onClick={() => setTab("delivery_recovery")} />
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
                  onClick={() => setTab("inspect")} 
                />
              )}
              {overdueMnt > 0 && (
                <AlertRow 
                  icon="wrench" 
                  variant="danger" 
                  title="定期メンテナンス超過" 
                  sub={`対象 ${overdueMnt}件 ・ 機器の整備をお願いします`} 
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

        {/* Premium Walk-in Returns CTA Card */}
        <SectionLabel>持込対応</SectionLabel>
        <button
          onClick={() => setFlow({ type: "walkin" })}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "16px 18px",
            borderRadius: 18,
            background: "linear-gradient(135deg, var(--brand) 0%, #1a2bc4 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
            cursor: "pointer",
            marginBottom: 24,
            boxShadow: "0 8px 30px rgba(58,77,232,0.22)",
            position: "relative",
            overflow: "hidden",
            transition: "all 0.2s ease"
          }}
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
          <div style={{ 
            background: "#FFFFFF", color: "var(--brand-strong)", 
            borderRadius: 99, padding: "3px 10px", fontSize: 12.5, 
            fontWeight: 850, fontFamily: "var(--font-mono)", marginRight: 4,
            boxShadow: "0 2px 6px rgba(0,0,0,0.15)"
          }}>
            {walkinCount} 件
          </div>
          <Icon name="chevronRight" size={18} color="#fff" style={{ opacity: 0.8 }} />
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
              onClick={() => {
                if (t === "stocktake") {
                  setSubView("stocktake");
                } else {
                  setTab(t);
                }
              }}
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
    content = <DeliveryRecoveryTab setFlow={setFlow} doneDlv={doneDlv} doneRtn={doneRtn} />;
  } else if (tab === "stock") {
    content = (
      <WhStock
        moves={ml.stockMoves}
        addMove={ml.addStockMove}
        onReturn={() => setFlow({ type: "walkin" })}
      />
    );
  } else if (tab === "inspect") {
    content = <WhInspect />;
  } else if (tab === "profile") {
    content = (
      <ProfileTab
        staff={staff}
        doneDlv={doneDlv}
        doneRtn={doneRtn}
        deliveries={deliveries}
        recoveries={recoveries}
      />
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0 }}>{content}</div>
      <BottomNav tabs={tabs} active={tab} onChange={setTab} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. Container & Provider Setup
// ---------------------------------------------------------------------------

export default function StaffDashboard() {
  return (
    <MobileLiveProvider>
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px 16px",
          background: "radial-gradient(120% 80% at 50% 0%, #11131c, #06070b 70%)",
          fontFamily: "\"Noto Sans JP\", sans-serif"
        }}
      >
        {/* Sleek mobile device frame */}
        <div
          style={{
            width: "100%",
            maxWidth: 412,
            height: 840,
            borderRadius: 40,
            border: "12px solid #252a33",
            boxShadow: "0 24px 48px rgba(0,0,0,0.8), inset 0 2px 4px rgba(255,255,255,0.1)",
            overflow: "hidden",
            background: "var(--bg)",
            position: "relative",
            display: "flex",
            flexDirection: "column"
          }}
        >
          {/* Status bar mock */}
          <div
            style={{
              height: 32,
              background: "var(--bg)",
              color: "var(--fg-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 24px",
              fontSize: 12,
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
              letterSpacing: ".02em",
              userSelect: "none"
            }}
          >
            <span>17:05</span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <Icon name="gauge" size={13} stroke={2.4} />
              <span>5G</span>
              <div style={{ width: 20, height: 10, border: "1px solid var(--fg-muted)", borderRadius: 2, padding: 1, display: "flex" }}>
                <div style={{ width: "80%", height: "100%", background: "var(--fg-muted)" }} />
              </div>
            </div>
          </div>
          
          {/* Main App Content Area */}
          <div data-theme="dark" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <UnifiedStaffApp />
          </div>
        </div>
      </div>
    </MobileLiveProvider>
  );
}
