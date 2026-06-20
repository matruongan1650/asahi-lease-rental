import React, { useState } from "react";
import { useUser } from "../context/UserContext";
import { PrivacyPolicyModal, hasAgreedToPrivacy, recordPrivacyConsent, clearPrivacyConsent } from "./PrivacyPolicyModal";

const CUSTOMER_ROLES = ["customer", "customer_staff"];

/**
 * お客様サイトのログイン画面。
 * admin（顧客 → ユーザ）で発行したアカウント（メールアドレス + パスワード）でログインする。
 * 未ログイン時に Layout がこの画面を表示する（認証ゲート）。
 *
 * ログイン前にプライバシーポリシーへの同意（最後まで読了）が必須。
 */
export default function CustomerLogin() {
  const { login, logout, currentUser, usersLoaded } = useUser();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState<boolean>(() => hasAgreedToPrivacy());
  const [policyOpen, setPolicyOpen] = useState(false);

  // 社内アカウント(admin/staff)がお客様サイトを開いた場合は、セッションを破棄せず案内だけ表示する。
  // （logout するとブラウザ共有セッションのため /admin のログインまで失われ、管理者が締め出される）。
  const isInternalAccount = Boolean(currentUser && currentUser.role && !CUSTOMER_ROLES.includes(currentUser.role));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // プライバシーポリシー未同意ではログイン不可（UI でも無効化しているが二重防御）。
    if (!agreed) {
      setError("プライバシーポリシーをお読みのうえ、同意してください。");
      setPolicyOpen(true);
      return;
    }
    // ユーザーマスタ読込前は誤った「見つかりません」を出さず、読込待ちを促す。
    if (!usersLoaded) {
      setError("読み込み中です。少し待ってからもう一度お試しください。");
      return;
    }
    // お客様サイトでは customer / customer_staff のみログイン可（社内アカウントは拒否）。
    if (!login(loginId, password, CUSTOMER_ROLES)) {
      setError("メールアドレスまたはパスワードが正しくありません。");
      return;
    }
    setError("");
  };

  if (isInternalAccount) {
    return (
      <div className="relative flex h-full min-h-screen w-full flex-col items-center justify-center gap-4 px-6 text-center max-w-[480px] mx-auto bg-background-light dark:bg-background-dark shadow-xl text-slate-900 dark:text-white">
        <span className="material-symbols-outlined text-[44px] text-primary">admin_panel_settings</span>
        <h1 className="text-lg font-extrabold">社内アカウントでログイン中です</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          この社内アカウントではお客様サイトをご利用いただけません。<br />管理画面からご利用ください。
        </p>
        <a href="/admin" className="f7-cta inline-flex items-center justify-center px-6">管理画面へ移動</a>
        {/* お客様としてログインしたい場合は、共有セッションを一旦ログアウトしてログイン画面へ。 */}
        <button
          type="button"
          onClick={logout}
          className="mt-1 inline-flex items-center justify-center gap-1.5 text-sm font-bold text-slate-500 hover:text-primary underline underline-offset-2"
        >
          <span className="material-symbols-outlined text-[18px]">logout</span>
          ログアウトしてお客様としてログイン
        </button>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
          ※ ログアウトすると管理画面のログインも解除されます。
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-screen w-full flex-col overflow-x-hidden max-w-[480px] mx-auto bg-background-light dark:bg-background-dark shadow-xl text-slate-900 dark:text-white">
      <div className="flex flex-1 flex-col justify-center px-6 py-12">
        {/* ロゴ・タイトル */}
        <div className="text-center mb-10">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <span className="material-symbols-outlined text-[36px] text-primary">
              construction
            </span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            アサヒリース
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            レンタル・販売ポータル
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-300">
              メールアドレス / ユーザーID
            </label>
            <input
              type="text"
              autoComplete="username"
              required
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="例：tanaka@taisei.example.com"
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-3.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-shadow"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-300">
              パスワード
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="パスワードを入力"
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-3.5 pr-12 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-shadow"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                aria-pressed={showPassword}
                aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}
              >
                <span className="material-symbols-outlined text-[20px]">
                  {showPassword ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
              <span className="material-symbols-outlined text-[18px] text-red-500">
                error
              </span>
              <p className="text-xs font-bold text-red-600 dark:text-red-400">
                {error}
              </p>
            </div>
          )}

          {/* プライバシーポリシー同意（読了必須） */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3.5">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => {
                  if (e.target.checked) {
                    // 未読の場合はチェックさせず、まずポリシーを開いて読了させる。
                    if (!agreed) {
                      setPolicyOpen(true);
                      return;
                    }
                  } else {
                    // 同意を取り消したら永続化された同意記録も消す（再読込で勝手に再チェックされないように）。
                    setAgreed(false);
                    clearPrivacyConsent();
                  }
                }}
                className="mt-0.5 size-5 shrink-0 rounded border-slate-300 text-primary focus:ring-primary/30"
              />
              <span className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setPolicyOpen(true);
                  }}
                  className="font-bold text-primary underline underline-offset-2"
                >
                  プライバシーポリシー
                </button>
                を最後まで読み、内容に同意します。
              </span>
            </label>
            {!agreed && (
              <p className="mt-2 pl-8 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                ※ ログインには同意が必要です。
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={!agreed || !usersLoaded}
            className={`f7-cta w-full ${(!agreed || !usersLoaded) ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {usersLoaded ? "ログイン" : "読み込み中…"}
          </button>
        </form>

        <PrivacyPolicyModal
          open={policyOpen}
          onClose={() => setPolicyOpen(false)}
          onAgree={() => {
            setAgreed(true);
            recordPrivacyConsent();
            setError("");
          }}
        />

        <p className="mt-8 text-center text-xs leading-relaxed text-slate-400 dark:text-slate-500">
          アカウントをお持ちでない場合は、
          <br />
          アサヒリースの担当者までお問い合わせください。
        </p>
      </div>
    </div>
  );
}
