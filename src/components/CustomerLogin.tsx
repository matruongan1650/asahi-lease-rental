import React, { useState } from "react";
import { useUser } from "../context/UserContext";

/**
 * お客様サイトのログイン画面。
 * admin（顧客 → ユーザ）で発行したアカウント（メールアドレス + パスワード）でログインする。
 * 未ログイン時に Layout がこの画面を表示する（認証ゲート）。
 */
export default function CustomerLogin() {
  const { login } = useUser();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!login(loginId, password)) {
      setError("メールアドレスまたはパスワードが正しくありません。");
      return;
    }
    setError("");
  };

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
                aria-label="パスワード表示切替"
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

          <button
            type="submit"
            className="w-full rounded-xl bg-primary py-3.5 text-base font-bold text-white shadow-lg shadow-primary/30 hover:bg-blue-600 active:scale-[0.98] transition-all"
          >
            ログイン
          </button>
        </form>

        <p className="mt-8 text-center text-xs leading-relaxed text-slate-400 dark:text-slate-500">
          アカウントをお持ちでない場合は、
          <br />
          アサヒリースの担当者までお問い合わせください。
        </p>
      </div>
    </div>
  );
}
