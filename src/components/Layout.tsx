import { Outlet, useLocation, Link } from "react-router-dom";
import { cn } from "../lib/utils";
import { useCart } from "../context/CartContext";
import { useUser } from "../context/UserContext";
import CustomerLogin from "./CustomerLogin";
import { useIsDesktop } from "../hooks/useIsDesktop";
import DesktopShell from "./desktop/DesktopShell";

// List of routes where the bottom navigation should NOT be visible
const HIDE_NAV_ROUTES = [
  "/checkout",
  "/order-confirmation",
  "/order/",
  "/return",
  "/return-confirmation",
];

export default function Layout() {
  const location = useLocation();
  const { totalItems } = useCart();
  const { currentUser, usersLoaded } = useUser();
  const isDesktop = useIsDesktop();

  const hideNav = HIDE_NAV_ROUTES.some((route) =>
    location.pathname.startsWith(route)
  );

  // 認証ゲート: 未ログインならログイン画面を表示（admin が発行したアカウントでログイン）。
  // 社内アカウント(admin/staff)はお客様サイトを利用不可（注文が社内 userId に誤って紐づくのを防ぐ）。
  const role = currentUser?.role;
  const isCustomerRole = !role || role === "customer" || role === "customer_staff";
  if (!currentUser || !isCustomerRole) {
    // 起動直後はユーザーマスタ同期前で currentUser が一時的に null になる。永続セッションがあるのに
    // ログイン画面を一瞬出す「ログイン画面フラッシュ」を防ぐため、セッションIDがありユーザー未ロードの間は
    // ローディング表示にする（同期完了後に本来の画面へ）。
    let hasPersistedSession = false;
    try { hasPersistedSession = !!localStorage.getItem("asahi.sessionUserId"); } catch { /* ignore */ }
    if (!currentUser && hasPersistedSession && !usersLoaded) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background-light dark:bg-background-dark">
          <div className="h-9 w-9 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      );
    }
    // shuyei.online（ルート）は常にお客様サイトの入口。管理者セッションが残っていても /admin へ
    // 自動転送せず、お客様ログイン画面を表示する（管理者は CustomerLogin の「管理画面へ移動」から /admin へ）。
    return <CustomerLogin />;
  }

  // PC（≥1024px）はお客様向けデスクトップサイト、スマホは従来のモバイルアプリ。
  if (isDesktop) {
    return (
      <DesktopShell>
        <Outlet />
      </DesktopShell>
    );
  }

  return (
    <div className="relative flex h-full min-h-screen w-full flex-col overflow-x-hidden max-w-[480px] mx-auto bg-background-light dark:bg-background-dark shadow-xl text-slate-900 dark:text-white">
      <Outlet />
      
      {!hideNav && (
        <>
          <div className="h-[72px] w-full"></div> {/* Spacer */}
          <nav className="fixed bottom-0 left-0 right-0 z-30 h-[72px] w-full bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 pb-safe">
            <div className="flex h-full items-center justify-around px-2 max-w-md mx-auto">
              <NavItem to="/" icon="home" label="ホーム" active={location.pathname === "/"} />
              <NavItem to="/categories" icon="grid_view" label="カテゴリー" active={location.pathname.startsWith("/categories")} />
              <NavItem to="/orders" icon="receipt_long" label="注文" active={location.pathname.startsWith("/orders")} />
              <NavItem to="/cart" icon="shopping_cart" label="カート" active={location.pathname === "/cart"} badge={totalItems > 0 ? totalItems : undefined} />
              <NavItem to="/profile" icon="person" label="アカウント" active={location.pathname === "/profile"} />
            </div>
          </nav>
        </>
      )}
    </div>
  );
}

function NavItem({ to, icon, label, active, badge }: { to: string, icon: string, label: string, active: boolean, badge?: number }) {
  return (
    <Link to={to} className={cn("flex flex-col items-center justify-center gap-1 w-full h-full relative group transition-colors", active ? "text-primary" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300")}>
      <div className="relative">
        <span className={cn("material-symbols-outlined text-[26px] transition-transform group-active:scale-90", active && "fill-1")}>
          {icon}
        </span>
        {badge !== undefined && badge > 0 && (
          <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white border-2 border-white dark:border-background-dark animate-pulse">
            {badge}
          </span>
        )}
      </div>
      <span className="text-[10px] font-bold tracking-wide">{label}</span>
      {active && <span className="absolute top-0 w-8 h-0.5 bg-primary rounded-b-full shadow-[0_0_10px_rgba(19,109,236,0.5)]"></span>}
    </Link>
  );
}
