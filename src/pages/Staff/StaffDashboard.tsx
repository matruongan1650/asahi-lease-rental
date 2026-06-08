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
  SectionLabel
} from "../../components/staff/StaffUI";
import {
  MobileLiveProvider,
  useMobileLive
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
    neutral: { fg: "var(--fg)", bg: "var(--surface-2)", iconColor: "var(--fg-muted)", border: "var(--border)" },
    brand: { fg: "#2563EB", bg: "rgba(37,99,235,0.1)", iconColor: "#2563EB", border: "rgba(37,99,235,0.2)" },
    success: { fg: "#10B981", bg: "rgba(16,185,129,0.1)", iconColor: "#10B981", border: "rgba(16,185,129,0.2)" },
    danger: { fg: "#EF4444", bg: "rgba(239,68,68,0.1)", iconColor: "#EF4444", border: "rgba(239,68,68,0.2)" },
    warning: { fg: "#F59E0B", bg: "rgba(245,158,11,0.1)", iconColor: "#F59E0B", border: "rgba(245,158,11,0.2)" }
  }[variant as "neutral" | "brand" | "success" | "danger" | "warning"] || {
    fg: "var(--fg)", bg: "var(--surface-2)", iconColor: "var(--fg-muted)", border: "var(--border)"
  };

  return (
    <div
      onClick={onClick}
      style={{
        flex: 1,
        background: outdoorMode ? "#000000" : "var(--surface)",
        border: outdoorMode ? `3px solid ${colors.border}` : `1px solid ${colors.border}`,
        borderTop: outdoorMode ? `3px solid ${colors.border}` : `4px solid ${colors.iconColor}`,
        borderRadius: "16px",
        padding: "16px 12px",
        boxShadow: outdoorMode ? "none" : "0 4px 12px rgba(0,0,0,0.15)",
        cursor: onClick ? "pointer" : undefined,
        transition: "all 0.2s ease"
      }}
      className="active:scale-95 transform"
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ 
          width: 36, height: 36, borderRadius: "10px", 
          background: colors.bg, display: "grid", placeItems: "center",
          border: outdoorMode ? "1px solid #00FF66" : "none"
        }}>
          <Icon name={icon} size={20} color={colors.iconColor} />
        </div>
      </div>
      <div style={{ 
        fontSize: outdoorMode ? 34 : 30, 
        fontWeight: 900, 
        color: colors.fg, 
        fontFamily: "var(--font-mono)", 
        marginTop: 12, 
        lineHeight: 1 
      }}>
        {value}
        <span style={{ fontSize: 13, fontWeight: 900, marginLeft: 2, color: outdoorMode ? "#FFF" : "var(--fg-subtle)" }}>{unit}</span>
      </div>
      <div style={{ fontSize: outdoorMode ? 14 : 12, color: outdoorMode ? "#FFF" : "var(--fg-muted)", marginTop: 8, fontWeight: 800 }}>{label}</div>
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
        <div style={{ fontSize: outdoorMode ? 16 : 14.5, fontWeight: 900, color: "#FFFFFF" }}>{title}</div>
        <div style={{ fontSize: 12.5, color: outdoorMode ? "#00FF66" : "var(--fg-muted)", marginTop: 3, fontWeight: 700 }}>{sub}</div>
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
        borderLeft: outdoorMode ? "8px solid #00FF66" : "6px solid #2563EB",
      }}
      className="active:scale-[0.97] transition-transform"
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: outdoorMode ? 14 : 13, fontWeight: 900, color: outdoorMode ? "#00FF66" : "#2563EB" }}>{o.id}</span>
          <div style={{ fontSize: outdoorMode ? 20 : 18, fontWeight: 900, color: "#FFFFFF", marginTop: 4, letterSpacing: "-0.01em" }}>{o.site}</div>
          <div style={{ fontSize: 13, color: outdoorMode ? "#FFF" : "var(--fg-muted)", marginTop: 4, fontWeight: 700 }}>{o.company}</div>
        </div>
        <Badge variant={done ? "success" : "brand"}>{done ? "完了" : o.window}</Badge>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 12, borderTop: outdoorMode ? "2px solid #00FF66" : "1px solid var(--border-2)" }}>
        <span style={{ fontSize: outdoorMode ? 14 : 12.5, fontWeight: 800, color: outdoorMode ? "#00FF66" : "var(--fg-muted)" }}>
          📦 {o.items.reduce((a: number, b: any) => a + b.qty, 0)} 点 / {o.items.length} 品目
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 2, color: outdoorMode ? "#00FF66" : "#2563EB", fontWeight: 900, fontSize: outdoorMode ? 14 : 13.5 }}>
          {done ? "確認" : "配送業務を開始"} <Icon name="chevronRight" size={16} />
        </span>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Thumb-Zone Ergonomic Recovery Card (🟡 Amber Language)
// ---------------------------------------------------------------------------
function RecoveryCard({ o, done, outdoorMode, onClick }: any) {
  return (
    <Card 
      onClick={onClick} 
      style={{ 
        marginBottom: 12, 
        opacity: done ? 0.4 : 1, 
        padding: "20px 16px",
        background: outdoorMode ? "#000000" : "var(--surface)",
        border: outdoorMode ? "3px solid #F59E0B" : "1px solid var(--border-2)",
        borderLeft: outdoorMode ? "8px solid #F59E0B" : "6px solid #F59E0B",
      }}
      className="active:scale-[0.97] transition-transform"
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: outdoorMode ? 14 : 13, fontWeight: 900, color: "#F59E0B" }}>{o.id}</span>
          <div style={{ fontSize: outdoorMode ? 20 : 18, fontWeight: 900, color: "#FFFFFF", marginTop: 4, letterSpacing: "-0.01em" }}>{o.site}</div>
          <div style={{ fontSize: 13, color: outdoorMode ? "#FFF" : "var(--fg-muted)", marginTop: 4, fontWeight: 700 }}>{o.company}</div>
        </div>
        <Badge variant={done ? "success" : "warning"}>{done ? "完了" : o.window}</Badge>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 12, borderTop: outdoorMode ? "2px solid #F59E0B" : "1px solid var(--border-2)" }}>
        <span style={{ fontSize: outdoorMode ? 14 : 12.5, fontWeight: 800, color: outdoorMode ? "#F59E0B" : "var(--fg-muted)" }}>
          🔄 {o.products.length} 品目回収
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 2, color: "#F59E0B", fontWeight: 900, fontSize: outdoorMode ? 14 : 13.5 }}>
          {done ? "確認" : "回収業務を開始"} <Icon name="chevronRight" size={16} />
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
  const [subTab, setSubTab] = useState("haisou");
  const deliveries = ml.liveDeliveries;
  const recoveries = ml.liveRecoveries;

  const pendingDlvCount = deliveries.length - doneDlv.length;
  const pendingRtnCount = recoveries.length - doneRtn.length;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: outdoorMode ? "#000000" : "var(--bg)", minHeight: 0 }}>
      <TopBar title="配送・回収業務" sub="DELIVERY & RECOVERY" />
      
      {/* Thumb-friendly sub-tab filters located at lower ergonomic flow block */}
      <div style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", gap: 8, background: outdoorMode ? "#111" : "var(--surface-2)", padding: 4, borderRadius: "14px", border: outdoorMode ? "2px solid #FFF" : "1px solid var(--border)" }}>
          {[
            ["haisou", `配送予定 (${pendingDlvCount})`],
            ["kaishu", `回収予定 (${pendingRtnCount})`]
          ].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setSubTab(k)}
              style={{
                flex: 1,
                padding: "12px 0",
                borderRadius: "10px",
                border: "none",
                background: subTab === k ? (outdoorMode ? "#00FF66" : "var(--surface)") : "transparent",
                color: subTab === k ? (outdoorMode ? "#000" : "var(--fg)") : "var(--fg-muted)",
                fontWeight: 900,
                fontSize: outdoorMode ? 15 : 13.5,
                cursor: "pointer",
                transition: "all 0.15s ease"
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
                <DeliveryCard key={o.id} o={o} done={doneDlv.includes(o.id)} outdoorMode={outdoorMode} onClick={() => setFlow({ type: "dlv", order: o })} />
              ))
            )}
          </div>
        ) : (
          <div>
            {recoveries.length === 0 ? (
              <Empty icon="package" title="本日の回収予定はありません" />
            ) : (
              recoveries.map(o => (
                <RecoveryCard key={o.id} o={o} done={doneRtn.includes(o.id)} outdoorMode={outdoorMode} onClick={() => setFlow({ type: "rtn", order: o })} />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileTab({ staff, doneDlv, doneRtn, deliveries, recoveries, outdoorMode }: any) {
  const completedItems = [
    ...deliveries.filter((o: any) => doneDlv.includes(o.id)).map((o: any) => ({ ...o, kind: "配送" })),
    ...recoveries.filter((o: any) => doneRtn.includes(o.id)).map((o: any) => ({ ...o, kind: "回収" }))
  ];

  return (
    <Screen style={{ background: outdoorMode ? "#000" : "var(--bg)" }}>
      <TopBar title="マイページ" sub="PROFILE" />
      <Card pad={20} style={{ marginBottom: 16, textAlign: "center", border: outdoorMode ? "3px solid #FFF" : "1px solid var(--border)", background: outdoorMode ? "#000" : "var(--surface)", borderRadius: "20px" }}>
        <div style={{ width: 76, height: 76, borderRadius: "99px", background: "#1a1c9a", display: "grid", placeItems: "center", color: "#fff", fontWeight: 900, fontSize: 30, margin: "0 auto 12px" }}>ミ</div>
        <div style={{ fontSize: 21, fontWeight: 900, color: "#FFFFFF" }}>{staff.name}</div>
        <div style={{ fontSize: 13.5, color: outdoorMode ? "#00FF66" : "var(--fg-muted)", marginTop: 4, fontWeight: 700 }}>{staff.role}</div>
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
  const [tab, setTab] = useState("home");
  const [subView, setSubView] = useState<string | null>(null);
  const [flow, setFlow] = useState<any>(null);

  const [doneDlv, setDoneDlv] = useState<string[]>([]);
  const [doneRtn, setDoneRtn] = useState<string[]>([]);

  const staff = { name: "鈴木 健", role: "運行・倉庫総合管理責任者", team: "東京中央ベース", id: "STF-991" };

  const completeReturn = (productsList: any[]) => {
    const valid = productsList.filter(p => p.counted > 0);
    if (ml.addStockMove) {
      valid.forEach(p => ml.addStockMove("入庫", { item: p.name, qty: p.counted, ref: "持込返却", icon: isVehicle(p) ? "car" : "package" }));
      if (ml.adjustStock && ml.findProductByName) {
        valid.forEach(p => {
          const fp = ml.findProductByName(p.name);
          if (fp) ml.adjustStock(fp.firestoreId || fp.id, p.counted);
        });
      }
    }
    setFlow(null);
    setTab("stock");
  };

  if (flow) {
    if (flow.type === "dlv") return <DeliveryFlow o={flow.order} onExit={() => setFlow(null)} onComplete={(id) => { setDoneDlv(d => [...d, id]); if (ml.completeDelivery) ml.completeDelivery(flow.order.firestoreId || id); setFlow(null); setTab("delivery_recovery"); }} />;
    if (flow.type === "rtn") return <RecoveryFlow o={flow.order} onExit={() => setFlow(null)} onComplete={(id) => { setDoneRtn(d => [...d, id]); if (ml.completeRecovery) ml.completeRecovery(flow.order.firestoreId || id); setFlow(null); setTab("delivery_recovery"); }} />;
    if (flow.type === "walkin") return <WalkInReturnFlow onExit={() => setFlow(null)} onComplete={completeReturn} />;
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
              <span style={{ fontSize: 12, fontWeight: 900, color: outdoorMode ? "#00FF66" : "#2563EB", fontFamily: "var(--font-mono)" }}>2026.06.08 (月)</span>
              <h1 style={{ fontSize: outdoorMode ? 26 : 23, fontWeight: 900, color: "#FFFFFF", marginTop: 2 }}>現場運行・倉庫管理</h1>
            </div>
            
            <button
              onClick={() => setOutdoorMode(!outdoorMode)}
              style={{
                background: outdoorMode ? "#00FF66" : "rgba(255,255,255,0.06)",
                color: outdoorMode ? "#000000" : "#FFFFFF",
                border: outdoorMode ? "3px solid #00FF66" : "1px solid var(--border)",
                borderRadius: "12px",
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
            background: outdoorMode ? "#000" : "linear-gradient(135deg, rgba(37,99,235,0.15), rgba(16,185,129,0.04))",
            border: outdoorMode ? "3px solid #FFF" : "1px solid var(--border-2)",
            borderRadius: "20px",
            marginBottom: 20
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{ width: 46, height: 46, borderRadius: "12px", background: "#1a1c9a", display: "grid", placeItems: "center", color: "#fff", fontWeight: 900, fontSize: 18 }}>鈴</div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#FFFFFF" }}>{staff.name} 責任者</div>
                <div style={{ fontSize: 12, color: outdoorMode ? "#00FF66" : "var(--fg-muted)", fontWeight: 700 }}>{staff.team}</div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: outdoorMode ? 14 : 13.5, fontWeight: 900 }}>
              <span style={{ color: outdoorMode ? "#FFF" : "var(--fg-muted)" }}>本日のタスク消化率</span>
              <span style={{ color: outdoorMode ? "#00FF66" : "#2563EB" }}>{completedTasks} / {totalTasks} 件 ({totalTasks ? Math.round((completedTasks/totalTasks)*100) : 0}%)</span>
            </div>
            <ProgressBar value={completedTasks} max={totalTasks} color={outdoorMode ? "#00FF66" : "#10B981"} />
          </Card>
        </div>

        {/* Dynamic Matrix Grid Stats */}
        <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
          <StatTile label="配送予定" value={pendingDlvCount} unit="件" icon="truck" variant="brand" outdoorMode={outdoorMode} onClick={() => setTab("delivery_recovery")} />
          <StatTile label="回収予定" value={pendingRtnCount} unit="件" icon="package" variant="success" outdoorMode={outdoorMode} onClick={() => setTab("delivery_recovery")} />
          <StatTile label="警告検知" value={overdueVeh + overdueMnt} unit="件" icon="alert" variant="danger" outdoorMode={outdoorMode} onClick={() => setTab("inspect")} />
        </div>

        {/* Intelligent Operational Alerts Block */}
        {(overdueVeh > 0 || overdueMnt > 0) && (
          <div style={{ marginBottom: 20 }}>
            <SectionLabel style={{ color: outdoorMode ? "#FF3333" : "inherit" }}>🚨 要対応アラート</SectionLabel>
            {overdueVeh > 0 && <AlertRow title="車両の車検期限切れ警告" sub={`対象 ${overdueVeh}台 ・ 至急ベース内点検ドックへ回送してください`} outdoorMode={outdoorMode} onClick={() => setTab("inspect")} />}
          </div>
        )}

        {/* Tactile Big Target Bottom Action Button */}
        <button
          onClick={() => setFlow({ type: "walkin" })}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "20px",
            borderRadius: "22px",
            background: outdoorMode ? "#000000" : "linear-gradient(135deg, #1A1C9A, #0A0C5A)",
            border: outdoorMode ? "4px solid #00FF66" : "1px solid rgba(255,255,255,0.1)",
            cursor: "pointer",
            marginBottom: 24,
            boxShadow: outdoorMode ? "none" : "0 10px 25px rgba(26,28,154,0.3)"
          }}
          className="active:scale-[0.96] transition-transform duration-150"
        >
          <div style={{ width: 46, height: 46, borderRadius: "12px", background: outdoorMode ? "#00FF66" : "rgba(255,255,255,0.15)", color: outdoorMode ? "#000" : "#fff", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Icon name="clipboardCheck" size={24} />
          </div>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ fontSize: outdoorMode ? 18 : 16, fontWeight: 900, color: "#fff" }}>お客様持込返却 の検品</div>
            <div style={{ fontSize: 12, color: outdoorMode ? "#00FF66" : "rgba(255,255,255,0.75)", marginTop: 2, fontWeight: 700 }}>返却カウンターへ直接来庫された機材の受領処理</div>
          </div>
          <div style={{ background: "#FFF", color: "#1A1C9A", borderRadius: "8px", padding: "2px 8px", fontSize: 12, fontWeight: 900, fontMemo: "true" } as any}>
            {walkinCount}件
          </div>
        </button>

        {/* Structured Grid Control Panel */}
        <SectionLabel>倉庫・ロジスティクス操作</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, paddingBottom: 34 }}>
          {[
            ["boxIn", "入庫データ登録", "stock"],
            ["boxOut", "出庫データ登録", "stock"],
            ["layers", "倉庫内棚卸し", "stocktake"],
            ["car", "車両安全点検", "inspect"]
          ].map(([ic, lb, t]) => (
            <button
              key={lb}
              onClick={() => t === "stocktake" ? setSubView("stocktake") : setTab(t)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "18px 14px",
                borderRadius: "18px",
                background: outdoorMode ? "#000000" : "var(--surface)",
                border: outdoorMode ? "3px solid #FFF" : "1px solid var(--border-2)",
                cursor: "pointer"
              }}
              className="active:scale-95 transition-transform"
            >
              <div style={{ width: 38, height: 38, borderRadius: "10px", background: outdoorMode ? "#FFF" : "var(--brand-tint)", color: outdoorMode ? "#000" : "var(--brand-accent)", display: "grid", placeItems: "center" }}>
                <Icon name={ic as any} size={20} />
              </div>
              <span style={{ fontSize: outdoorMode ? 15 : 14, fontWeight: 900, color: "#FFFFFF" }}>{lb}</span>
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
        background: "radial-gradient(120% 80% at 50% 0%, #11131c, #06070b 70%)",
        fontFamily: "\"Noto Sans JP\", sans-serif"
      }}>
        <div style={{
          width: "100%",
          maxWidth: 412,
          height: 840,
          borderRadius: 40,
          border: "12px solid #252a33",
          boxShadow: "0 24px 48px rgba(0,0,0,0.8)",
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
          
          <div data-theme="dark" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <UnifiedStaffApp outdoorMode={outdoorMode} setOutdoorMode={setOutdoorMode} />
          </div>
        </div>
      </div>
    </MobileLiveProvider>
  );
}
