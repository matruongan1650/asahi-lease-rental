import { Link } from "react-router-dom";
import { useUser } from "../../context/UserContext";
import CustomerNotificationBell from "../../components/CustomerNotificationBell";
import { confirmDialog, alertDialog } from "../../components/AppDialog";

/** PC 用 マイページ（お客様デスクトップサイト）。モバイル Profile と同じプロフィール・ログアウト処理を再利用。 */
export default function ProfileDesktop() {
  const { profile, logout } = useUser();

  const handleLogout = async () => {
    if (await confirmDialog("ログアウトしますか？", { okText: "ログアウト", danger: true })) {
      logout();
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <nav className="text-xs font-bold text-slate-400 mb-1">
            <Link to="/" className="hover:text-primary">ホーム</Link> <span className="mx-1">/</span> マイページ
          </nav>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">マイページ</h1>
        </div>
        <CustomerNotificationBell />
      </div>

      {/* Profile header card */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 mb-6">
        <div className="flex items-center gap-5">
          <div className="relative shrink-0">
            <div
              className="bg-center bg-no-repeat bg-cover rounded-full h-24 w-24 border-4 border-white shadow-md"
              style={{ backgroundImage: `url("${profile.avatarUrl}")` }}
            />
            <div className="absolute bottom-1 right-1 h-5 w-5 bg-green-500 border-2 border-white rounded-full" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-extrabold text-slate-900 mb-1.5 truncate">
              {profile.companyName ? `${profile.companyName} ` : ""}{profile.lastName} {profile.firstName}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 bg-yellow-100 text-yellow-700 text-[11px] font-bold rounded-full border border-yellow-200">
                {profile.role === "customer" ? "企業代表者" : "注文担当者"}
              </span>
              <span className="text-xs text-slate-500">ID: {profile.id}</span>
              {profile.email && <span className="text-xs text-slate-400">{profile.email}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Menu grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <ProfileMenuCard icon="person" iconColor="blue" title="個人情報" subtitle="登録情報の確認・変更" to="/personal-info" />
        <ProfileMenuCard icon="receipt_long" iconColor="orange" title="注文履歴" subtitle="過去のレンタル・購入履歴" to="/orders" />
        <ProfileMenuCard icon="assignment_return" iconColor="emerald" title="レンタル品返却" subtitle="借りている商品の返却" to="/return" />
        <ProfileMenuCard icon="settings" iconColor="slate" title="設定" subtitle="アプリの設定" onClick={() => void alertDialog("設定機能は準備中です。")} />
        <ProfileMenuCard icon="help" iconColor="emerald" title="ヘルプ" subtitle="お問い合わせ・サポート" onClick={() => void alertDialog("ヘルプは準備中です。ご不明な点はアサヒリース担当者までお問い合わせください。")} />
        <ProfileMenuCard icon="logout" iconColor="red" title="ログアウト" subtitle="アカウントからサインアウト" onClick={handleLogout} danger />
      </div>

      <div className="flex justify-center">
        <p className="text-[11px] text-slate-400">バージョン 1.0.4</p>
      </div>
    </div>
  );
}

function ProfileMenuCard({
  icon,
  iconColor,
  title,
  subtitle,
  to,
  onClick,
  danger,
}: {
  icon: string;
  iconColor: string;
  title: string;
  subtitle?: string;
  to?: string;
  onClick?: () => void;
  danger?: boolean;
}) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    orange: "bg-orange-50 text-orange-600",
    slate: "bg-slate-100 text-slate-600",
    emerald: "bg-emerald-50 text-emerald-600",
    red: "bg-red-50 text-red-600",
    purple: "bg-purple-50 text-purple-600",
  };

  const baseClasses =
    "w-full text-left flex items-center justify-between gap-4 rounded-2xl bg-white border border-slate-200 shadow-sm p-5 transition-colors group " +
    (danger ? "hover:bg-red-50 hover:border-red-200" : "hover:bg-slate-50 hover:border-slate-300");

  const inner = (
    <>
      <div className="flex items-center gap-4 min-w-0">
        <div className={`h-12 w-12 rounded-xl ${colors[iconColor]} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300`}>
          <span className="material-symbols-outlined">{icon}</span>
        </div>
        <div className="min-w-0">
          <span className={`block text-base font-bold ${danger ? "text-red-600" : "text-slate-900"} truncate`}>{title}</span>
          {subtitle && <span className="block text-xs text-slate-500 truncate">{subtitle}</span>}
        </div>
      </div>
      <span className={`material-symbols-outlined ${danger ? "text-red-300 group-hover:text-red-500" : "text-slate-400"} group-hover:translate-x-0.5 transition-transform`}>
        chevron_right
      </span>
    </>
  );

  if (to) {
    return (
      <Link to={to} className={baseClasses}>
        {inner}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={baseClasses}>
      {inner}
    </button>
  );
}
