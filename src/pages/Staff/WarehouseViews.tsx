import React, { useState, useEffect } from "react";
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
  Sheet,
  QtyStepper,
  NumStepper,
  DamageReportSheet,
  reportQty,
  reportPhotos,
  REASON_ICON,
  statusVariant,
  Empty,
  PhotoTile,
  makePhoto,
  Overline
} from "../../components/staff/StaffUI";
import { useMobileLive, pushFieldReportsLocal, STAFF, VEHICLES, MAINTENANCE, WALKIN_RETURNS, daysUntil } from "../../context/MobileLiveContext";

export const isVehicle = (p: any) => {
  if (!p) return false;
  const name = p.name || "";
  const cat = p.category || "";
  return cat.includes("車両") || name.includes("エルフ") || name.includes("デュトロ") || name.includes("ハイエース") || name.includes("キャンター");
};

// ---------------------------------------------------------------------------
// 1. Vehicle Detail Sub-View (referenced from vehicle.jsx)
// ---------------------------------------------------------------------------

function VRow({ label, value, mono, danger, last }: any) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14, padding: "10px 0", borderTop: last ? "none" : "1px solid var(--border)" }}>
      <span style={{ fontSize: 13, color: "var(--fg-muted)", fontWeight: 600, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: danger ? "var(--danger-bright)" : "var(--fg)", fontFamily: mono ? "var(--font-mono)" : "var(--font-jp)", textAlign: "right", wordBreak: mono ? "normal" : "break-word", whiteSpace: mono ? "nowrap" : "normal" }}>{value}</span>
    </div>
  );
}

function VFile({ name }: { name?: string }) {
  if (!name) return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 12px", borderRadius: 10, background: "var(--surface-2)", border: "1px dashed var(--border-strong)", color: "var(--fg-subtle)", fontSize: 12.5, fontWeight: 700 }}>
      <Icon name="paperclip" size={14} />ファイル未登録
    </div>
  );
  return (
    <button style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 10, background: "var(--brand-tint)", border: "1px solid transparent", color: "var(--brand-accent)", fontSize: 12.5, fontWeight: 700, cursor: "pointer", maxWidth: "100%", fontFamily: "var(--font-jp)" }}>
      <Icon name="fileCheck" size={15} style={{ flexShrink: 0 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
      <Icon name="download" size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
    </button>
  );
}

function VSubCard({ title, icon, badge, children }: any) {
  return (
    <Card pad={14} style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: "var(--surface-3)", color: "var(--brand-accent)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name={icon} size={17} /></div>
        <span style={{ flex: 1, fontSize: 14.5, fontWeight: 800, color: "var(--fg)" }}>{title}</span>
        {badge}
      </div>
      {children}
    </Card>
  );
}

function VAlert({ variant, icon, title, sub }: any) {
  const c = { danger: "var(--danger-bright)", warning: "var(--warning-bright)", info: "var(--brand-accent)" }[variant as "danger"|"warning"|"info"];
  const bg = { danger: "var(--danger-tint)", warning: "var(--warning-tint)", info: "var(--brand-tint)" }[variant as "danger"|"warning"|"info"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, padding: 12, borderRadius: 12, background: bg, border: `1px solid ${c}`, marginBottom: 8 }}>
      <Icon name={icon} size={19} color={c} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--fg)" }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 1 }}>{sub}</div>
      </div>
    </div>
  );
}

function vehicleAlerts(v: any) {
  const a = [];
  const d = v.days || v.inspectionDaysRemaining || 0;
  if (d < 0) a.push({ variant: "danger", icon: "car", title: "車検が期限切れです", sub: `${-d}日超過 ・ 至急対応（${v.inspectionDate || v.next}）` });
  else if (d <= 7) a.push({ variant: "danger", icon: "car", title: "車検期限まで7日以内", sub: `残り${d}日（${v.inspectionDate || v.next}）` });
  else if (d <= 30) a.push({ variant: "warning", icon: "car", title: "車検期限が近づいています（30日前）", sub: `残り${d}日（${v.inspectionDate || v.next}）` });
  else if (d <= 90) a.push({ variant: "warning", icon: "car", title: "車検（90日前のお知らせ）", sub: `残り${d}日（${v.inspectionDate || v.next}）` });

  const jbExpiry = v.jibaiseki?.expiry || v.insuranceDate;
  const jb = daysUntil(jbExpiry);
  if (jb !== null && jb <= 30) a.push({ variant: jb < 0 ? "danger" : "warning", icon: "shield", title: jb < 0 ? "自賠責保険が失効しています" : "自賠責保険の満期が近づいています", sub: `満期 ${jbExpiry}（${jb < 0 ? `${-jb}日超過` : `残り${jb}日`}）` });
  
  const nnExpiry = v.nini?.expiry || "2026/09/30";
  const nn = daysUntil(nnExpiry);
  if (nn !== null && nn <= 30) a.push({ variant: nn < 0 ? "danger" : "warning", icon: "shield", title: nn < 0 ? "任意保険が失効しています" : "任意保険の満期が近づいています", sub: `満期 ${nnExpiry}（${nn < 0 ? `${-nn}日超過` : `残り${nn}日`}）` });

  if (v.tax && !v.tax.paid) a.push({ variant: "warning", icon: "yen", title: "自動車税が未払いです", sub: `${v.tax.year || "2026"} ・ 納付期限を確認してください` });

  const oilDate = v.nextOil?.date || "2026/06/05";
  const oil = daysUntil(oilDate);
  if (oil !== null && oil <= 7) a.push({ variant: oil < 0 ? "danger" : "warning", icon: "droplet", title: oil < 0 ? "オイル交換が予定日を過ぎています" : "オイル交換の時期です", sub: `予定 ${oilDate} / ${v.nextOil?.km || ""}` });

  return a;
}

export function VehicleDetail({ v, onBack, onRecordShaken }: any) {
  const [tab, setTab] = useState("info");
  const alerts = vehicleAlerts(v);
  const shakenColor = (v.days || v.inspectionDaysRemaining || 0) < 0 ? "var(--danger-bright)" : (v.days || v.inspectionDaysRemaining || 0) <= 30 ? "var(--warning-bright)" : "var(--success-bright)";

  const TABS = [["info", "基本"], ["legal", "法的"], ["history", "履歴"], ["docs", "資料"]];

  let body = null;

  if (tab === "info") {
    body = (
      <>
        {alerts.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <Overline style={{ marginBottom: 9 }}>自動アラート（{alerts.length}）</Overline>
            {alerts.map((al, i) => <VAlert key={i} {...al} />)}
          </div>
        )}
        <SectionLabel>基本情報</SectionLabel>
        <Card pad={14} style={{ paddingBottom: 12 }}>
          <VRow label="車両番号" value={v.plate} mono />
          <VRow label="メーカー" value={v.maker || v.manufacturer} />
          <VRow label="車種・モデル" value={v.model || v.name} />
          <VRow label="年式" value={v.year} />
          <VRow label="車体色" value={v.color} />
          <VRow label="車台番号" value={v.vin} mono />
          <VRow label="原動機型式" value={v.engineNo || v.engineModel} mono />
          <VRow label="購入日" value={v.buyDate || v.purchaseDate} mono />
          <VRow label="購入価格" value={v.buyPrice || v.purchasePrice} mono />
          <VRow label="走行距離" value={v.mileage} mono />
          <VRow label="状態" value={<Badge variant={statusVariant(v.status)}>{v.status}</Badge>} last />
        </Card>
      </>
    );
  }

  if (tab === "legal") {
    const jbExpiry = v.jibaiseki?.expiry || v.insuranceDate;
    const nnExpiry = v.nini?.expiry || "2026/09/30";
    const jb = daysUntil(jbExpiry), nn = daysUntil(nnExpiry);
    const shakenDays = v.days || v.inspectionDaysRemaining || 0;
    return (
      <div style={{ padding: "4px 0 20px" }}>
        <SectionLabel>車検</SectionLabel>
        <VSubCard title="自動車検査証" icon="car" badge={<Badge variant={shakenDays < 0 ? "danger" : shakenDays <= 30 ? "warning" : "success"}>{shakenDays < 0 ? `${-shakenDays}日超過` : `残り${shakenDays}日`}</Badge>}>
          <div style={{ padding: "2px 0 10px" }}>
            <VRow label="前回実施日" value={v.shaken?.last || "2024/06/05"} mono />
            <VRow label="有効期限" value={v.shaken?.next || v.inspectionDate} mono danger={shakenDays < 0} last />
          </div>
          <VFile name={v.shaken?.file} />
          <div style={{ marginTop: 12 }}>
            <Btn full size="sm" icon="clipboardCheck" onClick={onRecordShaken}>車検完了を記録</Btn>
          </div>
        </VSubCard>

        <div style={{ height: 6 }} />
        <SectionLabel>保険・税</SectionLabel>
        <VSubCard title="自賠責保険" icon="shield" badge={jb !== null && jb <= 30 ? <Badge variant={jb < 0 ? "danger" : "warning"}>{jb < 0 ? "失効" : `残り${jb}日`}</Badge> : null}>
          <div style={{ padding: "2px 0 10px" }}>
            <VRow label="証券番号" value={v.jibaiseki?.policyNo || "JB-2024-558102"} mono />
            <VRow label="満期日" value={jbExpiry} mono danger={jb !== null && jb < 0} last />
          </div>
          <VFile name={v.jibaiseki?.file} />
        </VSubCard>

        <VSubCard title="任意保険" icon="shield" badge={nn !== null && nn <= 30 ? <Badge variant={nn < 0 ? "danger" : "warning"}>{nn < 0 ? "失効" : `残り${nn}日`}</Badge> : null}>
          <div style={{ padding: "2px 0 10px" }}>
            <VRow label="保険会社" value={v.nini?.company || "東京海上日動"} />
            <VRow label="証券番号" value={v.nini?.policyNo || "TN-77120934"} mono />
            <VRow label="満期日" value={nnExpiry} mono danger={nn !== null && nn < 0} last />
          </div>
          <VFile name={v.nini?.file} />
        </VSubCard>

        <VSubCard title="自動車税" icon="yen" badge={<Badge variant={v.tax?.paid ? "success" : "warning"}>{v.tax?.paid ? "支払済" : "未払い"}</Badge>}>
          <div style={{ padding: "2px 0 10px" }}>
            <VRow label="年度" value={v.tax?.year || "2026年度"} />
            <VRow label="支払状況" value={v.tax?.paid ? "納付済み" : "未納付"} danger={v.tax && !v.tax.paid} last />
          </div>
          <VFile name={v.tax?.file} />
        </VSubCard>
      </div>
    );
  }

  if (tab === "history") {
    const maintList = v.maint || v.maintenanceHistory || [];
    const repairList = v.repair || v.repairHistory || [];
    body = (
      <>
        <SectionLabel right={<span style={{ fontSize: 12.5, color: "var(--fg-muted)", fontWeight: 700 }}>{maintList.length}件</span>}>整備・点検履歴</SectionLabel>
        <Card pad={6} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", padding: "8px 10px 6px", borderBottom: "1px solid var(--border)" }}>
            <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: "var(--fg-subtle)" }}>日付</span>
            <span style={{ flex: 1.4, fontSize: 11, fontWeight: 700, color: "var(--fg-subtle)" }}>項目</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-subtle)", textAlign: "right" }}>走行</span>
          </div>
          {maintList.map((m: any, i: number) => (
            <div key={i} style={{ display: "flex", alignItems: "center", padding: "11px 10px", borderTop: i ? "1px solid var(--border)" : "none" }}>
              <span style={{ flex: 1, fontSize: 12.5, fontFamily: "var(--font-mono)", color: "var(--fg-muted)" }}>{m.date}</span>
              <span style={{ flex: 1.4, fontSize: 13.5, fontWeight: 700, color: "var(--fg)" }}>{m.item}</span>
              <span style={{ fontSize: 12.5, fontFamily: "var(--font-mono)", color: "var(--fg)", textAlign: "right", whiteSpace: "nowrap" }}>{m.km || m.mileage}</span>
            </div>
          ))}
        </Card>

        <SectionLabel right={<span style={{ fontSize: 12.5, color: "var(--fg-muted)", fontWeight: 700 }}>{repairList.length}件</span>}>修理履歴</SectionLabel>
        {repairList.length === 0
          ? <Empty icon="wrench" title="修理履歴はありません" />
          : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {repairList.map((r: any, i: number) => (
                <Card key={i} pad={14}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 800, color: "var(--fg)" }}>{r.content || r.title}</div>
                      <div style={{ fontSize: 12.5, color: "var(--fg-muted)", marginTop: 3 }}>{r.garage || r.shop}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 12, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)" }}>{r.date}</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "var(--fg)", fontFamily: "var(--font-mono)", marginTop: 2 }}>{r.cost || r.price}</div>
                    </div>
                  </div>
                  {(r.file || r.receipt) && <div style={{ marginTop: 11, paddingTop: 11, borderTop: "1px solid var(--border)" }}><VFile name={r.file || r.receipt} /></div>}
                </Card>
              ))}
            </div>}
      </>
    );
  }

  if (tab === "docs") {
    const docList = v.docs || v.documents || [];
    body = (
      <>
        <SectionLabel right={<span style={{ fontSize: 12.5, color: "var(--fg-muted)", fontWeight: 700 }}>{docList.length}件</span>}>添付資料</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 16 }}>
          {docList.map((d: any, i: number) => (
            <button key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: 13, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)", cursor: "pointer", boxShadow: "var(--shadow-card)" }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--brand-tint)", color: "var(--brand-accent)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name="file" size={19} /></div>
              <span style={{ flex: 1, textAlign: "left", fontSize: 14.5, fontWeight: 700, color: "var(--fg)" }}>{typeof d === "string" ? d : d.name}</span>
              <Icon name="download" size={18} color="var(--fg-subtle)" />
            </button>
          ))}
        </div>
        <SectionLabel>車両写真</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 9 }}>
          {Array.from({ length: v.photos || 3 }).map((_, i) => <PhotoTile key={i} photo={makePhoto(i)} />)}
          <button style={{ aspectRatio: "1", borderRadius: 13, border: "1.5px dashed var(--border-strong)", background: "var(--surface-2)", color: "var(--brand-accent)", display: "grid", placeItems: "center", cursor: "pointer" }}><Icon name="camera" size={22} /></button>
        </div>
      </>
    );
  }

  const shakenDays = v.days || v.inspectionDaysRemaining || 0;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)", minHeight: 0 }}>
      <TopBar title={v.model || v.name} sub={v.plate} onBack={onBack} right={<IconBtn name="edit" />} />
      <div style={{ padding: "0 16px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13, padding: 14, borderRadius: 16, background: "linear-gradient(135deg, var(--surface-2), var(--surface))", border: "1px solid var(--border)" }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: "var(--brand-tint)", color: "var(--brand-accent)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name="car" size={28} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-subtle)" }}>次回車検</span>
              <Badge variant={shakenDays < 0 ? "danger" : shakenDays <= 30 ? "warning" : "success"}>{shakenDays < 0 ? `${-shakenDays}日超過` : `残り${shakenDays}日`}</Badge>
            </div>
            <div style={{ fontSize: 19, fontWeight: 800, color: shakenColor, fontFamily: "var(--font-mono)", marginTop: 3 }}>{v.shaken?.next || v.inspectionDate}</div>
          </div>
        </div>
      </div>
      <div style={{ padding: "0 16px 12px" }}>
        <div style={{ display: "flex", gap: 6, background: "var(--surface-2)", padding: 4, borderRadius: 12 }}>
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: "8px 0", borderRadius: 9, border: "none", background: tab === k ? "var(--surface)" : "transparent", color: tab === k ? "var(--fg)" : "var(--fg-muted)", fontWeight: 800, fontSize: 13, cursor: "pointer", boxShadow: tab === k ? "var(--shadow-card)" : "none", fontFamily: "var(--font-jp)" }}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 16px 20px", minHeight: 0 }}>{body}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. WhDashboard (Warehouse Home Dashboard)
// ---------------------------------------------------------------------------

interface WhDashboardProps {
  staff: any;
  go: (tab: string) => void;
  moves: any[];
  onReturn: () => void;
  veh: any[];
  mnt: any[];
  walkinCount: number | null;
}

function StatTile({ label, value, unit, icon, variant = "neutral", onClick }: any) {
  const c = { neutral: "var(--fg)", brand: "var(--brand-accent)", success: "var(--success-bright)", danger: "var(--danger-bright)", warning: "var(--warning-bright)" }[variant as "neutral"|"brand"|"success"|"danger"|"warning"];
  return (
    <div onClick={onClick} style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "13px 14px", boxShadow: "var(--shadow-card)", cursor: onClick ? "pointer" : undefined }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Icon name={icon} size={18} color={c} />
        {onClick && <Icon name="chevronRight" size={15} color="var(--fg-subtle)" style={{ marginLeft: "auto" }} />}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: c, fontFamily: "var(--font-mono)", marginTop: 8, lineHeight: 1 }}>{value}<span style={{ fontSize: 13, fontWeight: 700, marginLeft: 2, fontFamily: "var(--font-jp)", color: "var(--fg-subtle)" }}>{unit}</span></div>
      <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 5, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function AlertRow({ icon, variant, title, sub, onClick }: any) {
  const c = { danger: "var(--danger-bright)", warning: "var(--warning-bright)" }[variant as "danger"|"warning"];
  const bg = { danger: "var(--danger-tint)", warning: "var(--warning-tint)" }[variant as "danger"|"warning"];
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 12, padding: 13, borderRadius: 13, background: "var(--surface)", border: "1px solid var(--border)", marginBottom: 9, cursor: "pointer" }}>
      <div style={{ width: 40, height: 40, borderRadius: 11, background: bg, color: c, display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name={icon} size={20} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: "var(--fg)" }}>{title}</div>
        <div style={{ fontSize: 12.5, color: "var(--fg-muted)", marginTop: 1 }}>{sub}</div>
      </div>
      <Icon name="chevronRight" size={18} color="var(--fg-subtle)" />
    </div>
  );
}

export function WhDashboard({ staff, go, moves, onReturn, veh, mnt, walkinCount }: WhDashboardProps) {
  const ins = moves.filter(m => m.type === "入庫").reduce((a, b) => a + b.qty, 0);
  const outs = moves.filter(m => m.type === "出庫").reduce((a, b) => a + b.qty, 0);
  
  const VL = veh && veh.length ? veh : VEHICLES;
  const ML = mnt && mnt.length ? mnt : MAINTENANCE;

  const overdueVeh = VL.filter(v => {
    const days = v.days ?? v.inspectionDaysRemaining ?? 0;
    return days < 0;
  }).length;

  const soonVeh = VL.filter(v => {
    const days = v.days ?? v.inspectionDaysRemaining ?? 0;
    return days >= 0 && days <= 14;
  }).length;

  const overdueMnt = ML.filter(m => m.days < 0).length;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px 18px" }}>
        <div style={{ width: 46, height: 46, borderRadius: 99, background: "linear-gradient(135deg,var(--brand),var(--brand-strong))", display: "grid", placeItems: "center", color: "#fff", fontWeight: 800, fontSize: 18 }}>佐</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>おはようございます</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--fg)" }}>{staff.name} さん</div>
        </div>
        <IconBtn name="bell" badge />
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
          <StatTile label="本日入庫" value={ins} unit="点" icon="boxIn" variant="success" onClick={() => go("stock")} />
          <StatTile label="本日出庫" value={outs} unit="点" icon="boxOut" variant="brand" onClick={() => go("stock")} />
          <StatTile label="要対応" value={overdueVeh + overdueMnt} unit="件" icon="alert" variant="danger" onClick={() => go("inspect")} />
        </div>

        <SectionLabel>アラート</SectionLabel>
        {overdueVeh > 0 && <AlertRow icon="car" variant="danger" title="車検が期限切れです" sub={`対象 ${overdueVeh}台 ・ 至急対応してください`} onClick={() => go("inspect")} />}
        {overdueMnt > 0 && <AlertRow icon="wrench" variant="danger" title="定期メンテナンス超過" sub={`対象 ${overdueMnt}件 ・ 点検期限を過ぎています`} onClick={() => go("inspect")} />}
        {soonVeh > 0 && <AlertRow icon="clock" variant="warning" title="車検期限が近づいています" sub={`14日以内 ${soonVeh}台`} onClick={() => go("inspect")} />}

        <SectionLabel style={{ marginTop: 12 }}>本日の業務</SectionLabel>
        <button onClick={onReturn} style={{ width: "100%", display: "flex", alignItems: "center", gap: 13, padding: "15px 16px", borderRadius: 16, background: "linear-gradient(135deg, var(--brand), var(--brand-strong))", border: "none", cursor: "pointer", marginBottom: 18, boxShadow: "0 8px 22px var(--brand-tint)" }}>
          <div style={{ width: 46, height: 46, borderRadius: 13, background: "rgba(255,255,255,0.18)", color: "#fff", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name="clipboardCheck" size={24} /></div>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>持込返却 検品</div>
            <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.82)", marginTop: 2 }}>お客様持込の返却品を検品・入庫</div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.18)", color: "#fff", borderRadius: 99, padding: "4px 10px", fontSize: 12.5, fontWeight: 800, fontFamily: "var(--font-mono)" }}>{walkinCount != null ? walkinCount : WALKIN_RETURNS.length}</div>
          <Icon name="chevronRight" size={20} color="#fff" />
        </button>

        <SectionLabel>クイック操作</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[["boxIn", "入庫登録", "stock"], ["boxOut", "出庫登録", "stock"], ["layers", "棚卸し", "stocktake"], ["car", "点検記録", "inspect"]].map(([ic, lb, t]) => (
            <button key={lb} onClick={() => go(t)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "15px 14px", borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", cursor: "pointer", boxShadow: "var(--shadow-card)" }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: "var(--brand-tint)", color: "var(--brand-accent)", display: "grid", placeItems: "center" }}><Icon name={ic} size={20} /></div>
              <span style={{ fontSize: 14.5, fontWeight: 800, color: "var(--fg)", textAlign: "left" }}>{lb}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. WhStock (Warehouse Stock In / Out Register)
// ---------------------------------------------------------------------------

export function WhStock({ moves, addMove, onReturn }: any) {
  const [filter, setFilter] = useState("all");
  const [scan, setScan] = useState<string | null>(null); // "入庫" | "出庫"
  const [picked, setPicked] = useState<any>(null); // chosen product
  const [qty, setQty] = useState(10);
  
  const ml = useMobileLive();
  const liveProducts = ml.products || [];
  const list = moves.filter((m: any) => filter === "all" || m.type === filter);

  const openScan = (type: string) => { setScan(type); setPicked(null); setQty(10); };
  const scanProduct = () => {
    if (liveProducts.length === 0) { addMove(scan); setScan(null); return; }
    const idx = Math.floor(Math.random() * liveProducts.length);
    setPicked(liveProducts[idx]);
  };
  
  const confirmMove = () => {
    const isIn = scan === "入庫";
    if (picked && ml.adjustStock) ml.adjustStock(picked.firestoreId || picked.id, isIn ? qty : -qty);
    if (picked) addMove(scan!, { item: picked.name, qty, icon: isVehicle(picked) ? "car" : "package" });
    else addMove(scan!);
    setScan(null); setPicked(null);
  };

  return (
    <>
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
        <TopBar title="入出庫管理" sub="WAREHOUSE" right={<IconBtn name="clipboardCheck" onClick={onReturn} />} />
        
        <div style={{ padding: "0 16px 12px" }}>
          <div style={{ display: "flex", gap: 7, background: "var(--surface-2)", padding: 4, borderRadius: 12 }}>
            {[["all", "すべて"], ["入庫", "入庫"], ["出庫", "出庫"]].map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: "none", background: filter === k ? "var(--surface)" : "transparent", color: filter === k ? "var(--fg)" : "var(--fg-muted)", fontWeight: 800, fontSize: 13.5, cursor: "pointer", boxShadow: filter === k ? "var(--shadow-card)" : "none", fontFamily: "var(--font-jp)" }}>{l}</button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {list.map((m: any) => {
              const isIn = m.type === "入庫";
              return (
                <Card key={m.id} pad={13}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 11, background: isIn ? "var(--success-tint)" : "var(--brand-tint)", color: isIn ? "var(--success-bright)" : "var(--brand-accent)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name={isIn ? "boxIn" : "boxOut"} size={22} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.item}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", marginTop: 2 }}>{m.id} ・ {m.time} ・ {m.ref}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 17, fontWeight: 800, fontFamily: "var(--font-mono)", color: isIn ? "var(--success-bright)" : "var(--brand-accent)" }}>{isIn ? "+" : "−"}{m.qty}</div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        <div style={{ padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--border)", background: "var(--bg)", display: "flex", gap: 10 }}>
          <Btn full variant="success" icon="boxIn" onClick={() => openScan("入庫")}>入庫</Btn>
          <Btn full icon="boxOut" onClick={() => openScan("出庫")}>出庫</Btn>
        </div>
      </div>

      <Sheet open={!!scan} onClose={() => { setScan(null); setPicked(null); }} title={`${scan}スキャン`}>
        {!picked ? (
          <>
            {/* Fake QR Scanner */}
            <div style={{ position: "relative", height: 200, borderRadius: 16, overflow: "hidden", background: "#0a0d14", border: "1px solid var(--border)" }}>
              <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 45%, #1a2233, #0a0d14 70%)" }} />
              <div style={{ position: "absolute", left: "50%", top: "45%", transform: "translate(-50%,-50%)", opacity: 0.25, color: "#fff" }}><Icon name="qr" size={84} /></div>
              <div style={{ position: "absolute", left: "50%", top: "45%", transform: "translate(-50%,-50%)", width: 130, height: 130 }}>
                {[["0","0","auto","auto"],["0","auto","auto","0"],["auto","0","0","auto"],["auto","auto","0","0"]].map((c, i) => (
                  <span key={i} style={{ position: "absolute", top: c[0], right: c[1], bottom: c[2], left: c[3], width: 26, height: 26,
                    borderTop: (c[0] === "0" ? "3px solid var(--brand-accent)" : "none"), borderBottom: (c[2] === "0" ? "3px solid var(--brand-accent)" : "none"),
                    borderLeft: (c[3] === "0" ? "3px solid var(--brand-accent)" : "none"), borderRight: (c[1] === "0" ? "3px solid var(--brand-accent)" : "none"),
                    borderRadius: 4 }} />
                ))}
                <div style={{ position: "absolute", left: 6, right: 6, height: 2, background: "var(--brand-accent)", boxShadow: "0 0 8px var(--brand-accent)", borderRadius: 2, animation: "scanline 2s ease-in-out infinite" }} />
              </div>
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 12, display: "flex", justifyContent: "center" }}>
                <button onClick={scanProduct} style={{ background: "var(--brand)", color: "#fff", border: "none", borderRadius: 99, padding: "11px 22px", fontSize: 15, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 6px 18px rgba(0,0,0,0.4)" }}><Icon name="scan" size={19} />QRをスキャン</button>
              </div>
            </div>
            <p style={{ fontSize: 13, color: "var(--fg-muted)", textAlign: "center", margin: "14px 0 0", lineHeight: 1.5 }}>製品のQRコードをスキャンして{scan}処理を行います</p>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 18, padding: 12, borderRadius: 12, background: "var(--surface-2)" }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--surface-3)", color: "var(--brand-accent)", display: "grid", placeItems: "center" }}><Icon name={isVehicle(picked) ? "car" : "package"} size={20} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: "var(--fg)" }}>{picked.name}</div>
                <div style={{ fontSize: 12, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)" }}>現在庫 {picked.stock ?? 0} ・ {picked.category}</div>
              </div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", marginBottom: 9, textAlign: "center" }}>{scan}数量</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 8 }}>
              <button onClick={() => setQty(q => Math.max(1, q - 1))} style={{ width: 48, height: 48, borderRadius: 14, border: "1px solid var(--border-strong)", background: "var(--surface-2)", color: "var(--fg)", display: "grid", placeItems: "center", cursor: "pointer" }}><Icon name="minus" size={22} stroke={2.6} /></button>
              <input value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value.replace(/\D/g, "")) || 1))} inputMode="numeric" style={{ width: 96, textAlign: "center", fontSize: 34, fontWeight: 800, fontFamily: "var(--font-mono)", background: "transparent", border: "none", borderBottom: "2px solid var(--brand)", color: "var(--fg)", outline: "none", padding: "4px 0" }} />
              <button onClick={() => setQty(q => q + 1)} style={{ width: 48, height: 48, borderRadius: 14, border: "1px solid var(--border-strong)", background: "var(--surface-2)", color: "var(--fg)", display: "grid", placeItems: "center", cursor: "pointer" }}><Icon name="plus" size={22} stroke={2.6} /></button>
            </div>
            <div style={{ textAlign: "center", fontSize: 13, color: "var(--fg-muted)", marginBottom: 18 }}>{scan}後の在庫: <span style={{ fontWeight: 800, color: "var(--fg)", fontFamily: "var(--font-mono)" }}>{(picked.stock ?? 0) + (scan === "入庫" ? qty : -qty)}</span></div>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn variant="secondary" onClick={() => setPicked(null)}>戻る</Btn>
              <Btn full variant={scan === "入庫" ? "success" : "primary"} icon="check" onClick={confirmMove}>{scan}を確定</Btn>
            </div>
          </>
        )}
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------------------
// 4. WhInspect (Vehicle Shaken & Maintenance)
// ---------------------------------------------------------------------------

export function WhInspect() {
  const [tab, setTab] = useState("shaken");
  const ml = useMobileLive();
  const liveVeh = ml.vehicles && ml.vehicles.length > 0 ? ml.vehicles : null;
  const [veh, setVeh] = useState<any[]>(VEHICLES);
  const [mnt, setMnt] = useState<any[]>(MAINTENANCE);
  const [detail, setDetail] = useState<any>(null); // {kind, item}
  const [vehPlate, setVehPlate] = useState<string | null>(null);

  // Sync live vehicles
  useEffect(() => {
    if (liveVeh) setVeh(liveVeh);
  }, [liveVeh]);

  // Sync live maintenance
  const liveMnt = ml.maint || null;
  const mntIcon = (c: string) => ({ "電動機器": "battery", "照明": "sun", "車両系": "car" }[c] || "wrench");
  useEffect(() => {
    if (liveMnt) {
      setMnt(liveMnt.map(m => ({
        ...m,
        category: m.category || m.cat,
        cycle: m.cycle || "—",
        icon: m.icon || mntIcon(m.category || m.cat)
      })));
    }
  }, [liveMnt]);

  const recordShaken = (plate: string) => {
    const upd = { status: "使用中", days: 730, inspectionDaysRemaining: 730, inspectionDate: "2028/06/01", nextInspectionDate: "2028/06/01" };
    setVeh(vs => vs.map(v => v.plate === plate ? { ...v, ...upd, shaken: { ...v.shaken, last: "2026/06/02", next: "2028/06/01" } } : v));
    if (ml.recordVehicleShaken) {
      ml.recordVehicleShaken(plate, {
        ...upd,
        "shaken.last": "2026/06/02",
        "shaken.next": "2028/06/01"
      });
    }
    setVehPlate(null);
  };

  const recordMnt = (id: string) => {
    const item = mnt.find(m => m.id === id);
    setMnt(ms => ms.map(m => m.id === id ? { ...m, status: "正常", days: 90, last: "2026/06/02" } : m));
    if (ml.recordMaintenance && item) {
      ml.recordMaintenance(item.firestoreId || item.id, { status: "正常", days: 90, last: "2026/06/02" });
    }
    setDetail(null);
  };

  const openVeh = veh.find(v => v.plate === vehPlate);
  if (openVeh) {
    return <VehicleDetail v={openVeh} onBack={() => setVehPlate(null)} onRecordShaken={() => recordShaken(openVeh.plate)} />;
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <TopBar title="点検管理" sub="INSPECTION" />
      
      <div style={{ padding: "0 16px 12px" }}>
        <div style={{ display: "flex", gap: 7, background: "var(--surface-2)", padding: 4, borderRadius: 12 }}>
          {[["shaken", "車検・車両"], ["mainte", "定期メンテナンス"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: "none", background: tab === k ? "var(--surface)" : "transparent", color: tab === k ? "var(--fg)" : "var(--fg-muted)", fontWeight: 800, fontSize: 13.5, cursor: "pointer", boxShadow: tab === k ? "var(--shadow-card)" : "none", fontFamily: "var(--font-jp)" }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
        {tab === "shaken" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {veh.map(v => {
              const alertCount = vehicleAlerts(v).length;
              const days = v.days ?? v.inspectionDaysRemaining ?? 0;
              return (
                <Card key={v.plate} pad={14} onClick={() => setVehPlate(v.plate)}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
                      <div style={{ width: 42, height: 42, borderRadius: 11, background: "var(--surface-3)", color: "var(--fg-muted)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name="car" size={22} /></div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--fg)" }}>{v.model || v.name}</div>
                        <div style={{ fontSize: 12.5, color: "var(--fg-muted)", fontFamily: "var(--font-mono)", marginTop: 2 }}>{v.plate}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                      <Badge variant={statusVariant(v.status)}>{v.status}</Badge>
                      {alertCount > 0 && <Badge variant="danger" icon="alert">{alertCount}</Badge>}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                    <div><div style={{ fontSize: 11, color: "var(--fg-subtle)", fontWeight: 600 }}>次回車検</div><div style={{ fontSize: 14, fontWeight: 800, color: days < 0 ? "var(--danger-bright)" : "var(--fg)", fontFamily: "var(--font-mono)", marginTop: 1, whiteSpace: "nowrap" }}>{v.inspectionDate || v.nextInspectionDate || v.next}</div></div>
                    <div><div style={{ fontSize: 11, color: "var(--fg-subtle)", fontWeight: 600 }}>残り</div><div style={{ fontSize: 14, fontWeight: 800, color: days < 0 ? "var(--danger-bright)" : days <= 30 ? "var(--warning-bright)" : "var(--fg)", fontFamily: "var(--font-mono)", marginTop: 1, whiteSpace: "nowrap" }}>{days < 0 ? `${-days}日超過` : `${days}日`}</div></div>
                    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 3, color: "var(--brand-accent)", fontWeight: 700, fontSize: 13 }}>詳細<Icon name="chevronRight" size={16} /></div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {tab === "mainte" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {mnt.map(m => (
              <Card key={m.id} pad={14} onClick={() => setDetail({ kind: "mainte", item: m })}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 11, background: "var(--surface-3)", color: "var(--fg-muted)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name={m.icon} size={22} /></div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "var(--fg)" }}>{m.name}</div>
                      <div style={{ fontSize: 12.5, color: "var(--fg-muted)", marginTop: 2 }}>{m.category} ・ {m.cycle}周期</div>
                    </div>
                  </div>
                  <Badge variant={statusVariant(m.status)}>{m.status}</Badge>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                  <div><div style={{ fontSize: 11, color: "var(--fg-subtle)", fontWeight: 600 }}>前回点検</div><div style={{ fontSize: 14, fontWeight: 800, color: "var(--fg)", fontFamily: "var(--font-mono)", marginTop: 1, whiteSpace: "nowrap" }}>{m.last}</div></div>
                  <div><div style={{ fontSize: 11, color: "var(--fg-subtle)", fontWeight: 600 }}>次回予定</div><div style={{ fontSize: 14, fontWeight: 800, color: m.days < 0 ? "var(--danger-bright)" : "var(--fg)", fontFamily: "var(--font-mono)", marginTop: 1, whiteSpace: "nowrap" }}>{m.next}</div></div>
                  <div style={{ marginLeft: "auto" }}><div style={{ fontSize: 11, color: "var(--fg-subtle)", fontWeight: 600 }}>残り</div><div style={{ fontSize: 14, fontWeight: 800, color: m.days < 0 ? "var(--danger-bright)" : m.days <= 7 ? "var(--warning-bright)" : "var(--fg)", fontFamily: "var(--font-mono)", marginTop: 1, whiteSpace: "nowrap" }}>{m.days < 0 ? `${-m.days}日超過` : `${m.days}日`}</div></div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Sheet open={!!detail} onClose={() => setDetail(null)} title={detail?.kind === "shaken" ? "車検記録" : "メンテナンス記録"}>
        {detail?.kind === "shaken" && (
          <>
            <Card pad={14} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--fg)" }}>{detail.item.model}</div>
              <div style={{ fontSize: 13, color: "var(--fg-muted)", fontFamily: "var(--font-mono)", marginTop: 3 }}>{detail.item.plate}</div>
              <div style={{ display: "flex", gap: 20, marginTop: 12 }}>
                <div><div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>次回車検</div><div style={{ fontWeight: 800, color: detail.item.days < 0 ? "var(--danger-bright)" : "var(--fg)", fontFamily: "var(--font-mono)" }}>{detail.item.next}</div></div>
                <div><div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>走行距離</div><div style={{ fontWeight: 800, color: "var(--fg)", fontFamily: "var(--font-mono)" }}>{detail.item.mileage}</div></div>
              </div>
            </Card>
            <p style={{ fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.55, margin: "0 0 16px" }}>車検完了を記録すると、次回車検日が自動で更新されます。</p>
            <Btn full size="lg" icon="clipboardCheck" onClick={() => recordShaken(detail.item.plate)}>車検完了を記録</Btn>
          </>
        )}
        {detail?.kind === "mainte" && (
          <>
            <Card pad={14} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--fg)" }}>{detail.item.name}</div>
              <div style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 3 }}>{detail.item.category} ・ 点検周期 {detail.item.cycle}</div>
            </Card>
            <p style={{ fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.55, margin: "0 0 16px" }}>点検完了を記録すると、次回点検予定日が周期に基づき更新されます。</p>
            <Btn full size="lg" icon="clipboardCheck" onClick={() => recordMnt(detail.item.id)}>点検完了を記録</Btn>
          </>
        )}
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. WhStocktake (Warehouse Stocktake count)
// ---------------------------------------------------------------------------

export function WhStocktake({ onBack }: { onBack?: () => void }) {
  const ml = useMobileLive();
  const liveProducts = ml.products && ml.products.length > 0 ? ml.products : null;
  
  const initInv = () => {
    return liveProducts
      ? liveProducts.map((p, i) => ({
          id: p.id || p.firestoreId,
          firestoreId: p.firestoreId,
          name: p.name,
          qr: "AS-" + (p.id || i),
          loc: p.category ? p.category.slice(0, 1) + "-" + String(i + 1).padStart(2, "0") : "—",
          system: Number(p.stock) || 0,
          counted: null as number | null,
          icon: isVehicle(p) ? "car" : "package",
          report: [] as any[],
        }))
      : INVENTORY_FALLBACK;
  };

  const [inv, setInv] = useState<any[]>(initInv);
  const [edit, setEdit] = useState<string | null>(null);
  const [val, setVal] = useState("");
  const [dmg, setDmg] = useState<string | null>(null); // item id for damage report
  const [confirmed, setConfirmed] = useState(false);

  // Sync products before counting starts
  useEffect(() => {
    if (liveProducts && !confirmed && inv.every(i => i.counted === null)) {
      setInv(initInv());
    }
  }, [liveProducts]);

  const counted = inv.filter(i => i.counted !== null).length;
  const done = counted === inv.length;

  const openEdit = (i: any) => {
    setEdit(i.id);
    setVal(i.counted !== null ? String(i.counted) : String(i.system));
  };

  const save = () => {
    setInv(xs => xs.map(x => x.id === edit ? { ...x, counted: parseInt(val) || 0 } : x));
    setEdit(null);
  };

  const scanNext = () => {
    const n = inv.find(i => i.counted === null);
    if (n) openEdit(n);
  };

  const saveReport = (report: any[]) => {
    setInv(xs => xs.map(x => x.id === dmg ? { ...x, report } : x));
    setDmg(null);
  };

  const confirmStocktake = () => {
    if (ml.setStock) {
      inv.forEach(i => {
        const targetId = i.firestoreId || i.id;
        if (targetId && i.counted !== null && i.counted !== i.system) {
          ml.setStock(targetId, i.counted);
        }
      });
    }
    try {
      const prodsWithIssues = inv
        .filter(i => i.report && i.report.length > 0)
        .map(i => ({ name: i.name, qr: i.qr || i.id, report: i.report }));
      
      if (prodsWithIssues.length > 0) {
        pushFieldReportsLocal({
          source: "棚卸",
          ref: "INV-2026-06",
          reporter: STAFF.souko.name,
          customer: "—",
          site: "東京中央倉庫",
          products: prodsWithIssues,
        }).then(ids => {
          if (ids && ids.length) {
            console.log("[FieldReport] pushed", ids);
          }
        });
      }
    } catch (e) {
      console.warn("pushReports failed", e);
    }
  };

  const editItem = inv.find(i => i.id === edit);
  const editShort = editItem && editItem.counted !== null && editItem.counted < editItem.system;

  return (
    <>
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
        <TopBar title="棚卸し" sub="STOCKTAKING" onBack={onBack} />
        
        <div style={{ padding: "0 16px 14px" }}>
          {/* QR scanner styling */}
          <div style={{ position: "relative", height: 160, borderRadius: 16, overflow: "hidden", background: "#0a0d14", border: "1px solid var(--border)" }}>
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 45%, #1a2233, #0a0d14 70%)" }} />
            <div style={{ position: "absolute", left: "50%", top: "45%", transform: "translate(-50%,-50%)", opacity: 0.25, color: "#fff" }}><Icon name="qr" size={72} /></div>
            <div style={{ position: "absolute", left: "50%", top: "45%", transform: "translate(-50%,-50%)", width: 110, height: 110 }}>
              {[["0","0","auto","auto"],["0","auto","auto","0"],["auto","0","0","auto"],["auto","auto","0","0"]].map((c, i) => (
                <span key={i} style={{ position: "absolute", top: c[0], right: c[1], bottom: c[2], left: c[3], width: 20, height: 20,
                  borderTop: (c[0] === "0" ? "3px solid var(--brand-accent)" : "none"), borderBottom: (c[2] === "0" ? "3px solid var(--brand-accent)" : "none"),
                  borderLeft: (c[3] === "0" ? "3px solid var(--brand-accent)" : "none"), borderRight: (c[1] === "0" ? "3px solid var(--brand-accent)" : "none"),
                  borderRadius: 4 }} />
              ))}
              {!done && <div style={{ position: "absolute", left: 6, right: 6, height: 2, background: "var(--brand-accent)", boxShadow: "0 0 8px var(--brand-accent)", borderRadius: 2, animation: "scanline 2s ease-in-out infinite" }} />}
            </div>
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 10, display: "flex", justifyContent: "center" }}>
              {done
                ? <div style={{ background: "var(--success-tint)", border: "1px solid var(--success-bright)", color: "var(--success-bright)", borderRadius: 99, padding: "6px 14px", fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", gap: 7 }}><Icon name="checkCircle" size={16} />全品目カウント完了</div>
                : <button onClick={scanNext} style={{ background: "var(--brand)", color: "#fff", border: "none", borderRadius: 99, padding: "8px 18px", fontSize: 14, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.4)" }}><Icon name="scan" size={16} />QRをスキャン</button>}
            </div>
          </div>

          <Card pad={14} style={{ margin: "14px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 13.5, color: "var(--fg-muted)", fontWeight: 700 }}>進捗</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: "var(--brand-accent)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>{counted} / {inv.length} 品目</span>
            </div>
            <ProgressBar value={counted} max={inv.length} />
          </Card>
          
          <SectionLabel right={<span style={{ fontSize: 12.5, color: "var(--fg-muted)", fontWeight: 700 }}>QRで読取 または タップ入力</span>}>棚卸しリスト</SectionLabel>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {inv.map(i => {
              const diff = i.counted !== null ? i.counted - i.system : null;
              const short = diff !== null && diff < 0;
              const hasReport = i.report && i.report.length > 0;
              return (
                <Card key={i.id} pad={13} style={{ borderColor: hasReport ? "var(--danger-bright)" : "var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }} onClick={() => openEdit(i)}>
                    <div style={{ width: 42, height: 42, borderRadius: 11, background: i.counted === null ? "var(--surface-3)" : (diff === 0 ? "var(--success-tint)" : "var(--warning-tint)"), color: i.counted === null ? "var(--fg-muted)" : (diff === 0 ? "var(--success-bright)" : "var(--warning-bright)"), display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name={i.counted === null ? i.icon : (diff === 0 ? "checkCircle" : "alert")} size={21} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 800, color: "var(--fg)" }}>{i.name}</div>
                      <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", marginTop: 2 }}>{i.qr} ・ 棚番 {i.loc} ・ 帳簿 {i.system}</div>
                    </div>
                    {i.counted === null
                      ? <span style={{ fontSize: 12.5, color: "var(--brand-accent)", fontWeight: 800, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>入力<Icon name="chevronRight" size={15} /></span>
                      : <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--fg)" }}>{i.counted}</div>
                          {diff !== 0 ? <div style={{ fontSize: 11.5, fontWeight: 800, color: diff > 0 ? "var(--warning-bright)" : "var(--danger-bright)", whiteSpace: "nowrap" }}>差異 {diff > 0 ? "+" : ""}{diff}</div> : <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--success-bright)" }}>一致</div>}
                        </div>}
                  </div>
                  {i.counted !== null && (short || hasReport) && (
                    <div style={{ marginTop: 11, paddingTop: 11, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                      {short && <Badge variant="danger" icon="minus">不足 {-diff!}</Badge>}
                      {(i.report || []).map((e: any, ri: number) => <Badge key={ri} variant="danger" icon={REASON_ICON[e.reason] || "alert"}>{e.reason} {e.qty}</Badge>)}
                      {reportPhotos(i) > 0 && <Badge variant="neutral" icon="image">{reportPhotos(i)}</Badge>}
                      <button onClick={() => setDmg(i.id)} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", color: hasReport ? "var(--danger-bright)" : "var(--brand-accent)", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "var(--font-jp)", whiteSpace: "nowrap" }}>
                        <Icon name="camera" size={15} />{hasReport ? "報告を編集" : "不足・破損を報告"}
                      </button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>

        <div style={{ padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--border)", background: "var(--bg)" }}>
          {done ? (
            <Btn full size="lg" variant="success" icon="check" disabled={confirmed} onClick={() => { confirmStocktake(); setConfirmed(true); }}>
              {confirmed ? "棚卸し確定済み" : "棚卸しを確定"}
            </Btn>
          ) : (
            <Btn full size="lg" icon="scan" onClick={scanNext}>QRをスキャンして数える（残り {inv.length - counted}）</Btn>
          )}
        </div>
      </div>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title="実数量を入力">
        {editItem && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 18, padding: 12, borderRadius: 12, background: "var(--surface-2)" }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--surface-3)", color: "var(--brand-accent)", display: "grid", placeItems: "center" }}><Icon name={editItem.icon} size={20} /></div>
              <div><div style={{ fontSize: 15, fontWeight: 800, color: "var(--fg)" }}>{editItem.name}</div><div style={{ fontSize: 12, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)" }}>{editItem.qr} ・ 棚番 {editItem.loc} ・ 帳簿数 {editItem.system}</div></div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 14 }}>
              <button onClick={() => setVal(v => String(Math.max(0, (parseInt(v) || 0) - 1)))} style={{ width: 48, height: 48, borderRadius: 14, border: "1px solid var(--border-strong)", background: "var(--surface-2)", color: "var(--fg)", display: "grid", placeItems: "center", cursor: "pointer" }}><Icon name="minus" size={22} stroke={2.6} /></button>
              <input value={val} onChange={e => setVal(e.target.value.replace(/\D/g, ""))} inputMode="numeric" style={{ width: 110, textAlign: "center", fontSize: 34, fontWeight: 800, fontFamily: "var(--font-mono)", background: "transparent", border: "none", borderBottom: "2px solid var(--brand)", color: "var(--fg)", outline: "none", padding: "4px 0" }} />
              <button onClick={() => setVal(v => String((parseInt(v) || 0) + 1))} style={{ width: 48, height: 48, borderRadius: 14, border: "1px solid var(--border-strong)", background: "var(--surface-2)", color: "var(--fg)", display: "grid", placeItems: "center", cursor: "pointer" }}><Icon name="plus" size={22} stroke={2.6} /></button>
            </div>
            {(parseInt(val) || 0) < editItem.system && (
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
                <Badge variant="danger" icon="minus">帳簿より {editItem.system - (parseInt(val) || 0)} 不足</Badge>
              </div>
            )}
            <Btn full size="lg" icon="check" onClick={save}>確定</Btn>
            {(parseInt(val) || 0) < editItem.system && (
              <div style={{ marginTop: 10 }}>
                <Btn full variant="danger" icon="camera" onClick={() => { save(); setDmg(editItem.id); }}>不足・破損を報告する</Btn>
              </div>
            )}
          </>
        )}
      </Sheet>
      
      <DamageReportSheet open={!!dmg} product={inv.find(i => i.id === dmg)} onClose={() => setDmg(null)} onSave={saveReport} />
    </>
  );
}

const INVENTORY_FALLBACK = [
  { id: "INV-01", name: "レボリューションコーン赤白",  qr: "AS-CONE-1001", loc: "A-01", system: 480, counted: null as number | null, report: [], icon: "cone" },
  { id: "INV-02", name: "コーンバー黒/黄",    qr: "AS-BAR-2200",  loc: "A-02", system: 210, counted: null as number | null, report: [], icon: "minus" },
  { id: "INV-03", name: "単管バリケード",   qr: "AS-TANK-3010", loc: "B-01", system: 96,  counted: null as number | null, report: [], icon: "package" },
  { id: "INV-04", name: "工事看板 A型",     qr: "AS-SIGN-4055", loc: "B-04", system: 54,  counted: null as number | null, report: [], icon: "flag" },
  { id: "INV-05", name: "ガードフェンス",   qr: "AS-FENCE-6001", loc: "C-02", system: 132, counted: null as number | null, report: [], icon: "shield" },
  { id: "INV-06", name: "ウェイト 10kg",    qr: "AS-WEIGHT-700", loc: "C-05", system: 300, counted: null as number | null, report: [], icon: "weight" },
  { id: "INV-07", name: "LED保安灯",        qr: "AS-LED-5120",  loc: "D-01", system: 88,  counted: null as number | null, report: [], icon: "sun" },
  { id: "INV-08", name: "矢印板",           qr: "AS-ARROW-8030", loc: "D-03", system: 40,  counted: null as number | null, report: [], icon: "navigation" },
];
