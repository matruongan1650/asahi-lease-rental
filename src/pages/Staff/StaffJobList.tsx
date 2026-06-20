import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Icon from "../../components/staff/Icon";
import { Badge, Card, Empty, InfoRow, MetricCard, SectionLabel, TopBar, statusVariant } from "../../components/staff/StaffUI";
import { useOrders, type Order } from "../../context/OrderContext";

function roleConfig(role?: string) {
  if (role === "collection") return { title: "回収指示", sub: "COLLECTION", icon: "package", statuses: ["回収予定", "回収中", "レンタル中", "一部返却"] };
  if (role === "warehouse") return { title: "倉庫返却対応", sub: "WAREHOUSE RETURN", icon: "warehouse", statuses: ["検品待ち", "回収完了", "一部返却"] };
  return { title: "配送指示", sub: "DELIVERY", icon: "truck", statuses: ["確認済み", "確認済", "配送中", "配送予定"] };
}

function isOrderMatched(order: Order, statuses: string[]) {
  const staffStatus = String((order as any).staffStatus || "");
  return statuses.includes(order.status) || statuses.includes(staffStatus);
}

export default function StaffJobList() {
  const { role } = useParams<{ role: string }>();
  const navigate = useNavigate();
  const { orders } = useOrders();
  const config = roleConfig(role);

  const filteredOrders = orders.filter(order => isOrderMatched(order, config.statuses));
  // 要注意 = 期限が近い/超過。実 Order に priority は無いので日付から判定する
  // （配送系は納品希望日、回収系は返却期限を基準に「本日・明日・超過」を急ぎとみなす）。
  const isRecoveryRole = role === "collection" || role === "warehouse";
  const _now = new Date();
  const dueSoon = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate() + 1).getTime();
  const urgentCount = filteredOrders.filter((o: any) => {
    const raw = isRecoveryRole ? o.rentalEndDate : (o.deliveryDate || o.rentalStartDate);
    if (!raw) return false;
    const t = new Date(String(raw).replace(/\//g, "-").slice(0, 10) + "T00:00:00").getTime();
    return !isNaN(t) && t <= dueSoon;
  }).length;

  return (
    <div data-theme="light" style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--fg)", fontFamily: "var(--font-jp)" }}>
      <div style={{ maxWidth: 430, margin: "0 auto", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <TopBar title={config.title} sub={config.sub} onBack={() => navigate("/staff")} />

        <div style={{ padding: "0 16px 18px", overflowY: "auto", flex: 1 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <MetricCard label="対象業務" value={filteredOrders.length} unit="件" icon={config.icon} tone="brand" />
            <MetricCard label="要注意" value={urgentCount} unit="件" icon="alert" tone={urgentCount ? "danger" : "neutral"} />
          </div>

          <SectionLabel right={<span style={{ fontSize: 12.5, color: "var(--fg-muted)", fontWeight: 800 }}>{filteredOrders.length}件</span>}>業務一覧</SectionLabel>
          {filteredOrders.length === 0 ? (
            <Empty icon={config.icon} title="対象の業務はありません" sub="admin でステータスが更新されるとここに表示されます" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filteredOrders.map(order => {
                const itemCount = (order.items || []).reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
                return (
                  <Link key={order.id} to={`/staff/${role || "delivery"}/job/${order.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                    <Card pad={0} style={{ borderLeft: "5px solid var(--brand)" }}>
                      <div style={{ padding: "13px 13px 0", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 900, color: "var(--brand-accent)" }}>{order.orderNumber || order.id}</div>
                          <div style={{ marginTop: 3, fontSize: 16, fontWeight: 900, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{order.siteName || order.deliveryLocation || "現場未設定"}</div>
                          <div style={{ marginTop: 3, fontSize: 12.5, color: "var(--fg-muted)", fontWeight: 700 }}>{order.companyName || order.personName || "顧客未設定"}</div>
                        </div>
                        <Badge variant={statusVariant(order.status)}>{order.status || "未設定"}</Badge>
                      </div>
                      <InfoRow icon="mapPin" label="納品・回収場所" value={order.deliveryLocation || "未設定"} />
                      <InfoRow icon="package" label="品目" value={`${itemCount}点 / ${(order.items || []).length}品目`} action={<Icon name="chevronRight" size={17} color="var(--brand-accent)" />} />
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
