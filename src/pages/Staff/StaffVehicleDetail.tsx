import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Icon from "../../components/staff/Icon";
import {
  Badge,
  Btn,
  Card,
  Empty,
  InfoRow,
  MetricCard,
  Overline,
  PhotoTile,
  SectionLabel,
  SegmentControl,
  TopBar,
  makePhoto,
  statusVariant,
} from "../../components/staff/StaffUI";
import { useVehicles } from "../../context/VehicleContext";
import { daysUntil } from "../../context/MobileLiveContext";

type VehicleTab = "basic" | "legal" | "history" | "docs";

function toInputDate(value?: string) {
  return String(value || "").replace(/\//g, "-");
}

function fromInputDate(value: string) {
  return value.replace(/-/g, "/");
}

function daysTone(days: number | null | undefined) {
  if (days == null) return "neutral";
  if (days < 0) return "danger";
  if (days <= 30) return "warning";
  return "success";
}

function FileChip({ name, dataUrl }: { name?: string; dataUrl?: string }) {
  // 実体（dataUrl）があるときだけダウンロード可能。無いときは「参照のみ」で押せないようにする
  // （以前は実体が無くてもダウンロードアイコン付きの押せるボタンに見えて、押しても何も起きなかった）。
  const downloadable = !!(name && dataUrl);
  const open = () => {
    if (!dataUrl) return;
    try {
      const [meta, b64] = dataUrl.split(",");
      const mime = (meta.match(/data:([^;]+)/) || [])[1] || "application/octet-stream";
      const bin = atob(b64 || "");
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const blob = new Blob([arr], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name || "file";
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      window.open(dataUrl, "_blank");
    }
  };
  return (
    <button
      type="button"
      onClick={downloadable ? open : undefined}
      disabled={!downloadable}
      style={{
        width: "100%",
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "11px 12px",
        borderRadius: 13,
        border: `1px ${name ? "solid" : "dashed"} var(--border-strong)`,
        background: name ? "var(--surface)" : "var(--surface-2)",
        color: name ? "var(--fg)" : "var(--fg-subtle)",
        cursor: downloadable ? "pointer" : "default",
        fontFamily: "var(--font-jp)",
      }}
    >
      <Icon name={name ? "fileCheck" : "paperclip"} size={17} color={name ? "var(--brand-accent)" : "var(--fg-subtle)"} />
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left", fontSize: 12.5, fontWeight: 800 }}>
        {name || "ファイル未登録"}
      </span>
      {downloadable && <Icon name="download" size={16} color="var(--fg-subtle)" />}
    </button>
  );
}

export default function StaffVehicleDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { vehicles, updateVehicle } = useVehicles();
  const vehicle = vehicles.find(v => v.id === id || v.productId === id);

  const [activeTab, setActiveTab] = useState<VehicleTab>("basic");
  const [editingLegal, setEditingLegal] = useState(false);
  const [editForm, setEditForm] = useState({ inspectionDate: "", insuranceDate: "" });

  const alerts = useMemo(() => {
    if (!vehicle) return [];
    const list = [...(vehicle.alerts || [])];
    // 保存値ではなく inspectionDate から毎回再計算（時間経過で車検切れになった車両のアラートを出す）。
    const days = daysUntil(vehicle.inspectionDate) ?? (vehicle.inspectionDaysRemaining ?? null);
    if (days !== null && days < 0 && !list.some(a => a.title.includes("車検"))) {
      list.unshift({ id: 1, type: "danger" as const, title: "車検が期限切れです", subtitle: `${Math.abs(days)}日超過 ・ 至急対応してください`, icon: "alert" });
    }
    if (days !== null && days >= 0 && days <= 30 && !list.some(a => a.title.includes("車検"))) {
      list.unshift({ id: 2, type: "warning" as const, title: "車検期限が近づいています", subtitle: `残り${days}日 ・ 有効期限 ${vehicle.inspectionDate || "未登録"}`, icon: "clock" });
    }
    return list;
  }, [vehicle]);

  if (!vehicle) {
    return (
      <div data-theme="light" style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-jp)" }}>
        <TopBar title="車両が見つかりません" sub="VEHICLE" onBack={() => navigate(-1)} />
        <div style={{ padding: 16 }}>
          <Empty icon="car" title="該当する車両がありません" sub="admin の車庫管理で登録状態を確認してください" />
        </div>
      </div>
    );
  }

  const tabs = [
    { key: "basic", label: "基本" },
    { key: "legal", label: "法的" },
    { key: "history", label: "履歴" },
    { key: "docs", label: "資料" },
  ];

  const startEditLegal = () => {
    setEditForm({
      inspectionDate: vehicle.inspectionDate || "",
      insuranceDate: vehicle.insuranceDate || "",
    });
    setEditingLegal(true);
    setActiveTab("legal");
  };

  const saveLegal = () => {
    // 車検日を変えたら残り日数も再計算する（admin と同じ）。
    // これを忘れると metric・色・連動アラート/通知が古い日数のまま残る。
    const updates: any = {
      inspectionDate: editForm.inspectionDate,
      insuranceDate: editForm.insuranceDate,
    };
    const insp = String(editForm.inspectionDate || "").replace(/\//g, "-").slice(0, 10);
    if (insp) {
      const now = new Date();
      const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const exp = new Date(insp + "T00:00:00").getTime();
      if (!isNaN(exp)) updates.inspectionDaysRemaining = Math.ceil((exp - t0) / 86400000);
    }
    updateVehicle(vehicle.id, updates);
    setEditingLegal(false);
  };

  const inspectionDays = daysUntil(vehicle.inspectionDate) ?? (vehicle.inspectionDaysRemaining ?? 0);
  const docs = vehicle.documents || [];
  const files = vehicle.vehicleFiles || [];
  const photos = vehicle.photos || [];

  return (
    <div data-theme="light" style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--fg)", fontFamily: "var(--font-jp)" }}>
      <div style={{ maxWidth: 430, margin: "0 auto", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <TopBar
          title={vehicle.plate || vehicle.name}
          sub={vehicle.name}
          onBack={() => navigate(-1)}
          right={<button onClick={startEditLegal} style={{ width: 40, height: 40, borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--fg)", display: "grid", placeItems: "center", cursor: "pointer" }}><Icon name="edit" size={18} /></button>}
        />

        <div style={{ padding: "0 16px 16px", overflowY: "auto", flex: 1 }}>
          <Card pad={16} style={{ marginBottom: 12, borderRadius: 20, background: "linear-gradient(135deg,var(--brand-tint),var(--surface))" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
              <span style={{ width: 54, height: 54, borderRadius: 16, background: "var(--brand-tint)", color: "var(--brand-accent)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                <Icon name="car" size={28} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 18, fontWeight: 900, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{vehicle.name}</span>
                  <Badge variant={statusVariant(vehicle.status)}>{vehicle.status}</Badge>
                </div>
                <div style={{ marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 900, color: "var(--brand-accent)" }}>{vehicle.plate || "ナンバー未登録"}</div>
              </div>
            </div>
          </Card>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <MetricCard label="車検期限" value={inspectionDays < 0 ? Math.abs(inspectionDays) : inspectionDays} unit={inspectionDays < 0 ? "日超過" : "日"} icon="car" tone={daysTone(inspectionDays) as any} onClick={() => setActiveTab("legal")} />
            <MetricCard label="自動アラート" value={alerts.length} unit="件" icon="alert" tone={alerts.length ? "danger" : "success"} onClick={() => setActiveTab("basic")} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <SegmentControl items={tabs} active={activeTab} onChange={(key) => setActiveTab(key as VehicleTab)} />
          </div>

          {activeTab === "basic" && (
            <>
              {alerts.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <SectionLabel>自動アラート</SectionLabel>
                  {alerts.map(alert => (
                    <div key={alert.id} style={{ display: "flex", gap: 11, padding: 12, borderRadius: 14, marginBottom: 8, border: `1px solid ${alert.type === "danger" ? "var(--danger-bright)" : "var(--warning-bright)"}`, background: alert.type === "danger" ? "var(--danger-tint)" : "var(--warning-tint)" }}>
                      <Icon name={alert.icon || "alert"} size={19} color={alert.type === "danger" ? "var(--danger-bright)" : "var(--warning-bright)"} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 900, color: "var(--fg)" }}>{alert.title}</div>
                        <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2, lineHeight: 1.45 }}>{alert.subtitle}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <SectionLabel>基本情報</SectionLabel>
              <Card pad={0}>
                <InfoRow label="メーカー" icon="building" value={vehicle.manufacturer || "未登録"} last />
                <InfoRow label="年式 / 色" icon="calendar" value={`${vehicle.year || "—"} / ${vehicle.color || "—"}`} />
                <InfoRow label="車台番号" icon="idCard" value={vehicle.vin || "未登録"} />
                <InfoRow label="原動機型式" icon="gauge" value={vehicle.engineModel || "未登録"} />
                <InfoRow label="購入日 / 価格" icon="yen" value={`${vehicle.purchaseDate || "—"} / ${vehicle.purchasePrice || "—"}`} />
                <InfoRow label="走行距離" icon="gauge" value={vehicle.mileage || "未登録"} />
              </Card>
            </>
          )}

          {activeTab === "legal" && (
            <>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 10 }}>
                {editingLegal ? (
                  <>
                    <Btn size="sm" variant="secondary" onClick={() => setEditingLegal(false)}>キャンセル</Btn>
                    <Btn size="sm" icon="check" onClick={saveLegal}>保存</Btn>
                  </>
                ) : (
                  <Btn size="sm" variant="secondary" icon="edit" onClick={startEditLegal}>編集</Btn>
                )}
              </div>

              <SectionLabel>車検・保険</SectionLabel>
              <Card pad={14} style={{ marginBottom: 12 }}>
                <Overline style={{ marginBottom: 10 }}>自動車検査証</Overline>
                <InfoRow label="有効期限" icon="car" value={editingLegal ? (
                  <input
                    type="date"
                    value={toInputDate(editForm.inspectionDate)}
                    onChange={e => setEditForm(prev => ({ ...prev, inspectionDate: fromInputDate(e.target.value) }))}
                    style={{ width: "100%", border: "1px solid var(--border-2)", borderRadius: 10, padding: "8px 10px", fontFamily: "var(--font-mono)", fontWeight: 800 }}
                  />
                ) : (vehicle.inspectionDate || "未登録")} last />
                <div style={{ marginTop: 10 }}>{(() => { const f = files.find((x: any) => /車検|inspection|shaken/i.test(x.name || "")); return <FileChip name={f?.name || `車検証_${vehicle.plate || vehicle.id}.pdf`} dataUrl={f?.dataUrl} />; })()}</div>
              </Card>

              <Card pad={14}>
                <Overline style={{ marginBottom: 10 }}>自賠責保険</Overline>
                <InfoRow label="満期日" icon="shield" value={editingLegal ? (
                  <input
                    type="date"
                    value={toInputDate(editForm.insuranceDate)}
                    onChange={e => setEditForm(prev => ({ ...prev, insuranceDate: fromInputDate(e.target.value) }))}
                    style={{ width: "100%", border: "1px solid var(--border-2)", borderRadius: 10, padding: "8px 10px", fontFamily: "var(--font-mono)", fontWeight: 800 }}
                  />
                ) : (vehicle.insuranceDate || "未登録")} last />
                <div style={{ marginTop: 10 }}>{(() => { const f = files.find((x: any) => /保険|insurance|jibai|nini/i.test(x.name || "")); return <FileChip name={f?.name || "自賠責保険証.pdf"} dataUrl={f?.dataUrl} />; })()}</div>
              </Card>
            </>
          )}

          {activeTab === "history" && (
            <>
              <SectionLabel right={<span style={{ fontSize: 12.5, color: "var(--fg-muted)", fontWeight: 800 }}>{vehicle.maintenanceHistory?.length || 0}件</span>}>整備・点検履歴</SectionLabel>
              {(vehicle.maintenanceHistory || []).length === 0 ? (
                <Empty icon="wrench" title="整備履歴はありません" />
              ) : (
                <Card pad={6} style={{ marginBottom: 16 }}>
                  {(vehicle.maintenanceHistory || []).map((item, index) => (
                    <InfoRow key={index} icon="wrench" label={item.date} value={item.item} sub={item.mileage} last={index === 0} />
                  ))}
                </Card>
              )}

              <SectionLabel right={<span style={{ fontSize: 12.5, color: "var(--fg-muted)", fontWeight: 800 }}>{vehicle.repairHistory?.length || 0}件</span>}>修理履歴</SectionLabel>
              {(vehicle.repairHistory || []).length === 0 ? (
                <Empty icon="wrench" title="修理履歴はありません" />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {(vehicle.repairHistory || []).map((item, index) => (
                    <Card key={index} pad={14}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14.5, fontWeight: 900, color: "var(--fg)" }}>{item.title}</div>
                          <div style={{ fontSize: 12.5, color: "var(--fg-muted)", marginTop: 3 }}>{item.shop}</div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 12, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)" }}>{item.date}</div>
                          <div style={{ fontSize: 14, color: "var(--fg)", fontWeight: 900, marginTop: 2 }}>{item.price}</div>
                        </div>
                      </div>
                      <div style={{ marginTop: 10 }}><FileChip name={item.receipt} /></div>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === "docs" && (() => {
            // 実体ファイル（dataUrl 付き = ダウンロード可）を優先表示し、実体の無いドキュメント名は参照のみ表示。
            const fileNames = new Set(files.map((f: any) => f.name));
            const nameOnly = docs.filter((d: string) => !fileNames.has(d));
            const total = files.length + nameOnly.length;
            return (
            <>
              <SectionLabel right={<span style={{ fontSize: 12.5, color: "var(--fg-muted)", fontWeight: 800 }}>{total}件</span>}>添付資料</SectionLabel>
              {total === 0 ? (
                <Empty icon="file" title="添付資料はありません" />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  {files.map((f: any, index: number) => <FileChip key={`f-${index}`} name={f.name} dataUrl={f.dataUrl} />)}
                  {nameOnly.map((doc: string, index: number) => <FileChip key={`d-${doc}-${index}`} name={doc} />)}
                </div>
              )}

              <SectionLabel right={<span style={{ fontSize: 12.5, color: "var(--fg-muted)", fontWeight: 800 }}>{photos.length}枚</span>}>車両写真</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 9, marginBottom: 20 }}>
                {photos.length > 0
                  ? photos.map((url, index) => (
                    <div key={index} style={{ aspectRatio: "1", borderRadius: 13, overflow: "hidden", border: "1px solid var(--border)", background: "var(--surface-2)" }}>
                      <img src={url} alt={`車両写真 ${index + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                  ))
                  : null}
                <label style={{ aspectRatio: "1", borderRadius: 13, border: "1.5px dashed var(--border-strong)", background: "var(--surface-2)", color: "var(--brand-accent)", display: "grid", placeItems: "center", cursor: "pointer" }}>
                  <Icon name="camera" size={22} />
                  <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = () => { if (typeof reader.result === "string") updateVehicle(vehicle.id, { photos: [...photos, reader.result] }); };
                    reader.readAsDataURL(f);
                    e.target.value = "";
                  }} />
                </label>
              </div>
            </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
