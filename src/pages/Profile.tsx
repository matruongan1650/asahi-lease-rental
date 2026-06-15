import { Link } from "react-router-dom";
import { useUser } from "../context/UserContext";
import CustomerNotificationBell from "../components/CustomerNotificationBell";

export default function Profile() {
  const { profile, logout } = useUser();

  const handleLogout = () => {
    if (window.confirm("ログアウトしますか？")) {
      logout();
    }
  };

  return (
    <>
      <div className="sticky top-0 z-50 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors duration-300">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="w-10"></div> 
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">マイページ</h1>
          <CustomerNotificationBell />
        </div>
      </div>

      <main className="flex flex-col w-full h-auto px-4 pt-6">
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-3 group cursor-pointer">
            <div className="bg-center bg-no-repeat bg-cover rounded-full h-24 w-24 border-4 border-white dark:border-slate-800 shadow-lg transition-transform group-hover:scale-105 duration-300" style={{ backgroundImage: `url("${profile.avatarUrl}")`}}></div>
            <div className="absolute bottom-1 right-1 h-5 w-5 bg-green-500 border-2 border-background-light dark:border-background-dark rounded-full"></div>
            <button className="absolute bottom-0 right-0 p-1.5 bg-primary rounded-full text-white border-2 border-background-light dark:border-background-dark shadow-md hover:bg-primary/90 transition-colors">
              <span className="material-symbols-outlined text-[14px] block">edit</span>
            </button>
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{profile.companyName ? `${profile.companyName} ` : ''}{profile.lastName} {profile.firstName}</h2>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-[10px] font-bold rounded-full border border-yellow-200 dark:border-yellow-700/50">
              {profile.role === "customer" ? "企業代表者" : "注文担当者"}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">ID: {profile.id}</span>
          </div>
          {profile.email && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{profile.email}</p>
          )}
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden mb-5">
          <ProfileMenuLink icon="person" iconColor="blue" title="個人情報" subtitle="登録情報の確認・変更" to="/personal-info" />
          <ProfileMenuLink icon="receipt_long" iconColor="orange" title="注文履歴" subtitle="過去のレンタル・購入履歴" to="/orders" />
          <ProfileMenuLink icon="assignment_return" iconColor="emerald" title="レンタル品返却" subtitle="借りている商品の返却" to="/return" />
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden mb-5">
          <ProfileMenuLink icon="settings" iconColor="slate" title="設定" />
          <ProfileMenuLink icon="help" iconColor="emerald" title="ヘルプ" />
        </div>

        <button onClick={handleLogout} className="w-full bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors flex items-center justify-center gap-2 mb-8 group active:scale-[0.98]">
          <span className="material-symbols-outlined text-red-500 group-hover:-translate-x-1 transition-transform">logout</span>
          <span className="font-bold text-red-500">ログアウト</span>
        </button>

        <div className="flex justify-center mb-8">
          <p className="text-[10px] text-slate-400">バージョン 1.0.4</p>
        </div>
      </main>
    </>
  );
}

function ProfileMenuLink({ icon, iconColor, title, subtitle, to }: { icon: string, iconColor: string, title: string, subtitle?: string, to?: string }) {
  
  const colors: Record<string, string> = {
    blue: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400",
    orange: "bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400",
    slate: "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300",
    emerald: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400",
    red: "bg-red-50 text-red-600",
    purple: "bg-purple-50 text-purple-600"
  };
  
  if (to) {
    return (
      <Link to={to} className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors border-b border-slate-100 dark:border-slate-700 last:border-0 group">
        <div className="flex items-center gap-4">
          <div className={`h-10 w-10 rounded-full ${colors[iconColor as keyof typeof colors]} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
            <span className="material-symbols-outlined">{icon}</span>
          </div>
          <div className="text-left">
            <span className="block text-sm font-bold text-slate-900 dark:text-white">{title}</span>
            {subtitle && <span className="block text-[10px] text-slate-500 dark:text-slate-400">{subtitle}</span>}
          </div>
        </div>
        <span className="material-symbols-outlined text-slate-400">chevron_right</span>
      </Link>
    );
  }

  return (
    <button className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors border-b border-slate-100 dark:border-slate-700 last:border-0 group">
      <div className="flex items-center gap-4">
        <div className={`h-10 w-10 rounded-full ${colors[iconColor as keyof typeof colors]} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
          <span className="material-symbols-outlined">{icon}</span>
        </div>
        <div className="text-left">
          <span className="block text-sm font-bold text-slate-900 dark:text-white">{title}</span>
          {subtitle && <span className="block text-[10px] text-slate-500 dark:text-slate-400">{subtitle}</span>}
        </div>
      </div>
      <span className="material-symbols-outlined text-slate-400">chevron_right</span>
    </button>
  );
}
