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

function StatTile({ label, value, unit, icon, variant = "neutral", outdoorMode, onClick }: any) {
  const colors = outdoorMode ? {
    fg: "#00FF66",
    bg: "#000000",
    iconColor: "#00FF66",
    border: "#00FF66"
  } : {
    neutral: { fg: "var(--fg)", bg: "var(--surface-2)", iconColor: "var(--fg-muted)", border: "var(--border)" },
    brand: { fg: "var(--brand-accent)", bg: "rgba(58,77,232,0.1)", iconColor: "var(--brand-accent)", border: "rgba(58,77,232,0.2)" },
    success: { fg: "var(--success-bright)", bg: "rgba(31,157,87,0.1)", iconColor: "var(--success-bright)", border: "rgba(31,157,87,0.2)" },
    danger: { fg: "var(--danger-bright)", bg: "rgba(220,58,40,0.1)", iconColor: "var(--danger-bright)", border: "rgba(220,58,40,0.2)" },
    warning: { fg: "var(--warning-bright)", bg: "rgba(229,150,27,0.1)", iconColor: "var(--warning-bright)", border: "rgba(229,150,27,0.2)" }
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
        borderTop: outdoorMode ? `3px solid ${colors.border}` : `3.5px solid ${colors.iconColor}`,
        borderRadius: "14px",
        padding: "14px 12px",
        boxShadow: outdoorMode ? "none" : "var(--shadow-card)",
        cursor: onClick ? "pointer" : undefined,
        transition: "transform 0.15s ease"
      }}
      className="active:scale-95"
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ 
          width: 34, height: 34, borderRadius: 8, 
          background: colors.bg, display: "grid", placeItems: "center",
          border: outdoorMode ? "1px solid #00FF66" : "none"
        }}>
          <Icon name={icon} size={18} color={colors.iconColor} />
        </div>
      </div>
      <div style={{ 
        fontSize: outdoorMode ? 32 : 29, 
        fontWeight: 900, 
        color: colors.fg, 
        fontFamily: "var(--font-mono)", 
        marginTop: 12, 
        lineHeight: 1 
      }}>
        {value}
        <span style={{ fontSize: 13, fontWeight: 900, marginLeft: 3, color: outdoorMode ? "#FFF" : "var(--fg-subtle)" }}>{unit}</span>
      </div>
      <div style={{ fontSize: outdoorMode ? 13 : 11.5, color: outdoorMode ? "#FFF" : "var(--fg-muted)", marginTop: 8, fontWeight: 900 }}>{label}</div>
    </div>
  );
}

function AlertRow({ icon, variant, title, sub, outdoorMode, onClick }: any) {
  const c = outdoorMode ? "#FF3333" : { danger: "var(--danger-bright)", warning: "var(--warning-bright)" }[variant as "danger" | "warning"];
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: 14,
        borderRadius: 14,
        background: outdoorMode ? "#000000" : "var(--surface)",
        border: outdoorMode ? `3px solid ${c}` : "1px solid var(--border-2)",
        borderLeft: `6px solid ${c}`,
        marginBottom: 9,
        cursor: "pointer"
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: outdoorMode ? 16 : 14.5, fontWeight: 900, color: "#FFFFFF" }}>{title}</div>
        <div style={{ fontSize: 12.5, color: outdoorMode ? "#00FF66" : "var(--fg-muted)", marginTop: 2, fontWeight: 700 }}>{sub}</div>
      </div>
      <Icon name="chevronRight" size={16} color={outdoorMode ? "#FF3333" : "var(--fg-subtle)"} />
    </div>
  );
}

function DeliveryCard({ o, done, outdoorMode, onClick }: any) {
  return (
    <Card 
      onClick={onClick} 
      style={{ 
        marginBottom: 12, 
        opacity: done ? 0.5 : 1, 
        padding: "18px 16px",
        background: outdoorMode ? "#000000" : "var(--surface)",
        border: outdoorMode ? "3px solid #00FF66" : "1px solid var(--border-2)",
        borderLeft: outdoorMode ? "8px solid #00FF66" : "5px solid var(--brand)",
      }}
      className="active:scale-[0.98] transition-transform"
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: outdoorMode ? 14 : 13, fontWeight: 900, color: outdoorMode ? "#00FF66" : "var(--brand-accent)" }}>{o.id}</span>
          <div style={{ fontSize: outdoorMode ? 19 : 17, fontWeight: 900, color: "#FFFFFF", marginTop: 4 }}>{o.site}</div>
          <div style={{ fontSize: 13, color: outdoorMode ? "#FFF" : "var(--fg-muted)", marginTop: 4, fontWeight: 700 }}>{o.company}</div>
        </div>
        <Badge variant={done ? "success" : "neutral"}>{done ? "完了" : o.window}</Badge>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 12, borderTop: outdoorMode ? "2px solid #00FF66" : "1px solid var(--border-2)" }}>
        <span style={{ fontSize: outdoorMode ? 13 : 12, fontWeight: 800, color: "#00FF66" }}>
          {o.items.reduce((a: number, b: any) => a + b.qty, 0)} 点 / {o.items.length} 品目
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 2, color: outdoorMode ? "#00FF66" : "var(--brand-accent)", fontWeight: 900, fontSize: outdoorMode ? 14 : 13 }}>
          {done ? "確認" : "配送開始 (タップ)"} <Icon name="chevronRight" size={16} />
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
        opacity: done ? 0.5 : 1, 
        padding: "18px 16px",
        background: outdoorMode ? "#000000" : "var(--surface)",
        border: outdoorMode ? "3px solid #FFFF00" : "1px solid var(--border-2)",
        borderLeft: outdoorMode ? "8px solid #FFFF00" : "5px solid var(--success-bright)",
      }}
      className="active:scale-[0.98] transition-transform"
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: outdoorMode ? 14 : 13, fontWeight: 900, color: outdoorMode ? "#FFFF00" : "var(--brand-accent)" }}>{o.id}</span>
          <div style={{ fontSize: outdoorMode ? 19 : 17, fontWeight: 900, color: "#FFFFFF", marginTop: 4 }}>{o.site}</div>
          <div style={{ fontSize: 13, color: outdoorMode ? "#FFF" : "var(--fg-muted)", marginTop: 4, fontWeight: 700 }}>{o.company}</div>
        </div>
        <Badge variant={done ? "success" : "neutral"}>{done ? "完了" : o.window}</Badge>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 12, borderTop: outdoorMode ? "2px solid #FFFF00" : "1px solid var(--border-2)" }}>
        <span style={{ fontSize: outdoorMode ? 13 : 12, fontWeight: 800, color: "#FFFF00" }}>{o.products.length} 品目</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 2, color: outdoorMode ? "#FFFF00" : "var(--brand-accent)", fontWeight: 900, fontSize: outdoorMode ? 14 : 13 }}>
          {done ? "確認" : "回収開始 (タップ)"} <Icon name="chevronRight" size={16} />
        </span>
      </div>
    </Card>
  );
}

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
      
      <div style={{ padding: "0 16px 12px" }}>
        <div style={{ display: "flex", gap: 7, background: outdoorMode ? "#111" : "var(--surface-2)", padding: 4, borderRadius: 12, border: outdoorMode ? "2px solid #FFF" : "none" }}>
          {[
            ["haisou", `配送予定 (${pendingDlvCount})`],
            ["kaishu", `回収予定 (${pendingRtnCount})`]
          ].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setSubTab(k)}
              style={{
                flex: 1,
                padding: "11px 0",
                borderRadius: 9,
                border: "none",
                background: subTab === k ? (outdoorMode ? "#00FF66" : "var(--surface)") : "transparent",
                color: subTab === k ? (outdoorMode ? "#000" : "var(--fg)") : "var(--fg-muted)",
                fontWeight: 900,
                fontSize: outdoorMode ? 14 : 13,
                cursor: "pointer"
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
      <Card pad={18} style={{ marginBottom: 16, textAlign: "center", border: outdoorMode ? "3px solid #FFF" : "1px solid var(--border)", background: outdoorMode ? "#000" : "var(--surface)" }}>
        <div style={{ width: 72, height: 72, borderRadius: 99, background: "#1a1c9a", display: "grid", placeItems: "center", color: "#fff", fontWeight: 900, fontSize: 28, margin: "0 auto 12px" }}>ミ</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#FFFFFF" }}>{staff.name}</div>
        <div style={{ fontSize: 13.5, color: outdoorMode ? "#00FF66" : "var(--fg-muted)", marginTop: 3, fontWeight: 700 }}>{staff.role}</div>
      </Card>
      
      <Card pad={6} style={{ background: outdoorMode ? "#000" : "var(--surface)", border: outdoorMode ? "3px solid #FFF" : "1px solid var(--border)" }}>
        <div style={{ padding: 12, fontSize: outdoorMode ? 15 : 14, fontWeight: 800, color: "#FFF" }}>
          業務完了総数: {completedItems.length} 件
        </div>
      </Card>
    </Screen>
  );
}

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
        <div style={{ padding: "12px 2px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <span style={{ fontSize: 12, fontWeight: 900, color: outdoorMode ? "#00FF66" : "var(--brand-accent)", fontFamily: "var(--font-mono)" }}>2026.06.08 (月)</span>
              <h1 style={{ fontSize: outdoorMode ? 26 : 24, fontWeight: 900, color: "#FFFFFF", marginTop: 2 }}>現場運行・倉庫管理</h1>
            </div>
            
            <button
              onClick={() => setOutdoorMode(!outdoorMode)}
              style={{
                background: outdoorMode ? "#00FF66" : "rgba(255,255,255,0.08)",
                color: outdoorMode ? "#000000" : "#FFFFFF",
                border: outdoorMode ? "3px solid #00FF66" : "1px solid var(--border)",
                borderRadius: "12px",
                padding: "6px 12px",
                fontSize: "11px",
                fontWeight: 900,
                display: "flex",
                alignItems: "center",
                gap: "5px",
                cursor: "pointer"
              }}
              className="active:scale-95 transition-transform"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>sunny</span>
              {outdoorMode ? "屋外: ON" : "屋外モード"}
            </button>
          </div>

          <Card pad={18} style={{ 
            background: outdoorMode ? "#000" : "linear-gradient(135deg, rgba(102,120,244,0.18), rgba(24,34,210,0.06))",
            border: outdoorMode ? "3px solid #FFF" : "1px solid var(--border-2)",
            marginBottom: 20
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "#1a1c9a", display: "grid", placeItems: "center", color: "#fff", fontWeight: 900, fontSize: 18 }}>鈴</div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#FFFFFF" }}>{staff.name} さん</div>
                <div style={{ fontSize: 12, color: outdoorMode ? "#00FF66" : "var(--fg-muted)", fontWeight: 700 }}>{staff.team}</div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: outdoorMode ? 14 : 13.5, fontWeight: 900 }}>
              <span style={{ color: outdoorMode ? "#FFF" : "var(--fg-muted)" }}>運行タスク完了状況</span>
              <span style={{ color: outdoorMode ? "#00FF66" : "var(--brand-accent)" }}>{completedTasks} / {totalTasks} 件</span>
            </div>
            <ProgressBar value={completedTasks} max={totalTasks} color={outdoorMode ? "#00FF66" : "var(--success-bright)"} />
          </Card>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <StatTile label="配送予定" value={pendingDlvCount} unit="件" icon="truck" variant="brand" outdoorMode={outdoorMode} onClick={() => setTab("delivery_recovery")} />
          <StatTile label="回収予定" value={pendingRtnCount} unit="件" icon="package" variant="success" outdoorMode={outdoorMode} onClick={() => setTab("delivery_recovery")} />
          <StatTile label="警告アラート" value={overdueVeh + overdueMnt} unit="件" icon="alert" variant="danger" outdoorMode={outdoorMode} onClick={() => setTab("inspect")} />
        </div>

        {(overdueVeh > 0 || overdueMnt > 0) && (
          <div style={{ marginBottom: 18 }}>
            <SectionLabel style={{ color: outdoorMode ? "#FF3333" : "inherit" }}>🚨 要対応アラート</SectionLabel>
            {overdueVeh > 0 && <AlertRow icon="car" variant="danger" title="車検切れ警告" sub={`対象: ${overdueVeh}台の車両`} outdoorMode={outdoorMode} onClick={() => setTab("inspect")} />}
          </div>
        )}

        <button
          onClick={() => setFlow({ type: "walkin" })}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "18px 20px",
            borderRadius: 20,
            background: outdoorMode ? "#000000" : "linear-gradient(135deg, var(--brand), var(--brand-strong))",
            border: outdoorMode ? "4px solid #00FF66" : "1px solid rgba(255,255,255,0.1)",
            cursor: "pointer",
            marginBottom: 24,
            boxShadow: outdoorMode ? "none" : "0 8px 24px rgba(58,77,232,0.3)"
          }}
          className="active:scale-[0.96] transition-transform"
        >
          <div style={{ width: 44, height: 44, borderRadius: 12, background: outdoorMode ? "#00FF66" : "rgba(255,255,255,0.2)", color: outdoorMode ? "#000" : "#fff", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Icon name="clipboardCheck" size={22} />
          </div>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ fontSize: outdoorMode ? 18 : 16, fontWeight: 900, color: "#fff" }}>お客様持込返却 検品</div>
            <div style={{ fontSize: 12, color: outdoorMode ? "#00FF66" : "rgba(255,255,255,0.8)", marginTop: 2, fontWeight: 700 }}>ベースに直接持ち込まれた機材의返却受領</div>
          </div>
          <Icon name="chevronRight" size={20} color="#fff" />
        </button>

        <SectionLabel>倉庫管理クイック操作</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, paddingBottom: 30 }}>
          {[
            ["boxIn", "入庫登録", "stock"],
            ["boxOut", "出庫登録", "stock"],
            ["layers", "倉庫棚卸し", "stocktake"],
            ["car", "車両点検", "inspect"]
          ].map(([ic, lb, t]) => (
            <button
              key={lb}
              onClick={() => t === "stocktake" ? setSubView("stocktake") : setTab(t)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "18px 14px",
                borderRadius: 16,
                background: outdoorMode ? "#000000" : "var(--surface)",
                border: outdoorMode ? "3px solid #FFF" : "1px solid var(--border-2)",
                cursor: "pointer"
              }}
              className="active:scale-95 transition-transform"
            >
              <div style={{ width: 36, height: 36, borderRadius: 10, background: outdoorMode ? "#FFF" : "var(--brand-tint)", color: outdoorMode ? "#000" : "var(--brand-accent)", display: "grid", placeItems: "center" }}>
                <Icon name={ic as any} size={18} />
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
