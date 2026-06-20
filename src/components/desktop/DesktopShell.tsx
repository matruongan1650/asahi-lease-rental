import React, { useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { useUser } from "../../context/UserContext";
import { confirmDialog } from "../AppDialog";

/**
 * DesktopShell — お客様サイトの PC 専用シェル（ヘッダー上部ナビ + フッター）。
 * スマホは従来のモバイルアプリ（Layout のボトムナビ）。PC ではこのシェルで横幅広く表示する。
 *
 * アプリシェル構造: 上部ナビは固定高さ、コンテンツは内側の 1 つのスクロールコンテナで縦スクロール。
 * これにより、各ページ内の `sticky top-0` サブヘッダーがナビの直下に貼り付き（ナビと重ならない）、
 * ページ遷移時のスクロール位置リセットも一元管理できる。
 */
const NAV = [
  { to: "/", label: "ホーム", match: (p: string) => p === "/" },
  { to: "/products", label: "商品一覧", match: (p: string) => p.startsWith("/products") || p.startsWith("/product/") || p.startsWith("/categories") },
  { to: "/orders", label: "注文履歴", match: (p: string) => p.startsWith("/orders") || p.startsWith("/order/") },
  { to: "/return", label: "返却", match: (p: string) => p.startsWith("/return") },
];

// 全お客様ページに専用デスクトップレイアウトを用意済み。各ページが自前で最大幅を制御するため
// シェルは全ルートを横幅いっぱいで描画する（未知ルートのみ中央寄せのフォールバック）。
function isFullWidthRoute(path: string): boolean {
  return (
    path === "/" ||
    path === "/products" ||
    path.startsWith("/product/") ||
    path === "/cart" ||
    path === "/categories" ||
    path === "/checkout" ||
    path === "/checkout-confirm" ||
    path === "/order-confirmation" ||
    path === "/orders" ||
    path.startsWith("/order/") ||
    path.startsWith("/return") ||
    path === "/profile" ||
    path === "/personal-info"
  );
}

export default function DesktopShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { totalItems } = useCart();
  const { profile, logout } = useUser();
  const scrollRef = useRef<HTMLDivElement>(null);
  const fullWidth = isFullWidthRoute(location.pathname);

  // ページ遷移ごとにスクロールコンテナを先頭へ戻す（各ページの window.scrollTo は効かないため一元化）。
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [location.pathname]);

  const handleLogout = async () => {
    if (await confirmDialog("ログアウトしますか？", { okText: "ログアウト", danger: true })) logout();
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50 text-slate-900 overflow-hidden">
      {/* Header（固定高さ・常時表示） */}
      <header className="shrink-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-[22px]">construction</span>
            </div>
            <div className="leading-tight">
              <div className="text-base font-extrabold tracking-tight text-slate-900">アサヒリース</div>
              <div className="text-[10px] font-bold text-slate-400">レンタル・販売ポータル</div>
            </div>
          </Link>

          <nav className="flex items-center gap-1">
            {NAV.map((item) => {
              const active = item.match(location.pathname);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`px-3.5 py-2 rounded-lg text-sm font-bold transition-colors ${
                    active ? "bg-primary/10 text-primary" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => navigate("/cart")}
              className="relative w-10 h-10 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-600 transition-colors"
              title="カート"
            >
              <span className="material-symbols-outlined text-[22px]">shopping_cart</span>
              {totalItems > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full border-2 border-white text-white text-[10px] font-bold flex items-center justify-center">
                  {totalItems}
                </span>
              )}
            </button>
            <div className="group relative">
              <button className="flex items-center gap-2 pl-2 pr-3 h-10 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
                <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px]">person</span>
                </div>
                <span className="text-sm font-bold text-slate-700 max-w-[140px] truncate">
                  {profile?.lastName || profile?.companyName || "アカウント"}
                </span>
                <span className="material-symbols-outlined text-[18px] text-slate-400">expand_more</span>
              </button>
              <div className="absolute right-0 top-11 w-48 rounded-xl border border-slate-200 bg-white shadow-lg p-1.5 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <Link to="/profile" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50">
                  <span className="material-symbols-outlined text-[18px] text-slate-400">account_circle</span>マイページ
                </Link>
                <Link to="/personal-info" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50">
                  <span className="material-symbols-outlined text-[18px] text-slate-400">badge</span>登録情報
                </Link>
                <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-rose-600 hover:bg-rose-50">
                  <span className="material-symbols-outlined text-[18px]">logout</span>ログアウト
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Scroll container（このコンテナだけが縦スクロール。内側の sticky はナビ直下に貼り付く） */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        {/* Page content。横幅広いページは自前で最大幅制御、それ以外は中央寄せの集中カラム。 */}
        {fullWidth ? (
          <main>{children}</main>
        ) : (
          <main className="max-w-2xl mx-auto w-full px-4 sm:px-6 py-6">{children}</main>
        )}

      {/* Footer */}
      <footer className="mt-12 border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-4 gap-8 text-sm">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-primary text-[22px]">construction</span>
              <span className="text-base font-extrabold text-slate-900">アサヒリース 株式会社</span>
            </div>
            <p className="text-slate-500 leading-relaxed max-w-md">保安用品・保安車両のレンタルおよび販売。現場の安全を、確かな品質と迅速な対応でサポートします。</p>
          </div>
          <div>
            <div className="font-bold text-slate-800 mb-3">メニュー</div>
            <ul className="space-y-2 text-slate-500">
              <li><Link to="/products" className="hover:text-primary">商品一覧</Link></li>
              <li><Link to="/orders" className="hover:text-primary">注文履歴</Link></li>
              <li><Link to="/return" className="hover:text-primary">返却手続き</Link></li>
              <li><Link to="/profile" className="hover:text-primary">マイページ</Link></li>
            </ul>
          </div>
          <div>
            <div className="font-bold text-slate-800 mb-3">お問い合わせ</div>
            <ul className="space-y-2 text-slate-500">
              <li className="flex items-center gap-2"><span className="material-symbols-outlined text-[18px]">call</span>03-1234-5678</li>
              <li className="flex items-center gap-2"><span className="material-symbols-outlined text-[18px]">schedule</span>平日 9:00〜18:00</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-100 py-4 text-center text-xs text-slate-400">© {new Date().getFullYear()} ASAHI LEASE Co., Ltd.</div>
      </footer>
      </div>
    </div>
  );
}
