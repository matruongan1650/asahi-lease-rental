import { Outlet, useLocation, Link } from "react-router-dom";
import { cn } from "../lib/utils";
import { useCart } from "../context/CartContext";

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

  const hideNav = HIDE_NAV_ROUTES.some((route) =>
    location.pathname.startsWith(route)
  );

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
