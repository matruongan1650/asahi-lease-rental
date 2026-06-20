import React, { FormEvent, ReactNode, useEffect, useState } from "react";
import { useUser } from "../context/UserContext";

/**
 * 管理画面の「事前アクセスコード」。ログイン画面の前段ゲート（2段構え）。
 * 運用ではビルド時に VITE_ADMIN_GATE_CODE を設定して変更すること（既定値は変更推奨）。
 */
const ADMIN_GATE_CODE = (import.meta as any).env?.VITE_ADMIN_GATE_CODE || "asahi-admin-2026";
const GATE_KEY = "asahi.admin_gate_v1";

function AccessCodeScreen({ onUnlock }: { onUnlock: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [showCode, setShowCode] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (code === ADMIN_GATE_CODE) {
      try { sessionStorage.setItem(GATE_KEY, "1"); } catch { /* ignore */ }
      onUnlock();
    } else {
      setError("アクセスコードが違います。");
    }
  };
  return (
    <div
      data-theme="light"
      style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 18, background: "linear-gradient(160deg, #0f172a 0%, #1e293b 100%)", fontFamily: "\"Noto Sans JP\", sans-serif" }}
    >
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 400, background: "#ffffff", borderRadius: 22, padding: 24, boxShadow: "0 24px 60px rgba(15,23,42,0.3)", border: "1px solid rgba(15,23,42,0.08)" }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#475569", marginBottom: 6 }}>ASAHI ADMIN</div>
          <h1 style={{ fontSize: 22, lineHeight: 1.2, fontWeight: 900, color: "#0f172a", margin: 0 }}>アクセスコード</h1>
          <p style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginTop: 8 }}>管理画面に入るにはアクセスコードを入力してください。</p>
        </div>
        <div style={{ position: "relative", marginBottom: 14 }}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            type={showCode ? "text" : "password"}
            autoFocus
            autoComplete="off"
            placeholder="アクセスコード"
            style={{ width: "100%", height: 48, borderRadius: 12, border: "1px solid #cbd5e1", padding: "0 46px 0 13px", fontSize: 15, fontWeight: 700, outline: "none", boxSizing: "border-box" }}
          />
          <button
            type="button"
            onClick={() => setShowCode((v) => !v)}
            aria-pressed={showCode}
            aria-label={showCode ? "アクセスコードを隠す" : "アクセスコードを表示"}
            style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", height: 36, width: 36, display: "grid", placeItems: "center", border: 0, background: "transparent", color: "#64748b", cursor: "pointer", borderRadius: 10, padding: 0 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20, lineHeight: 1 }}>
              {showCode ? "visibility_off" : "visibility"}
            </span>
          </button>
        </div>
        {error && (
          <div style={{ borderRadius: 12, background: "#fef2f2", color: "#b91c1c", fontSize: 12, fontWeight: 800, padding: "10px 12px", marginBottom: 14 }}>{error}</div>
        )}
        <button type="submit" style={{ width: "100%", height: 50, border: 0, borderRadius: 14, background: "#0f172a", color: "#fff", fontSize: 15, fontWeight: 900, cursor: "pointer" }}>次へ</button>
      </form>
    </div>
  );
}

/**
 * AdminAuthGate — /admin への入口を保護する。
 * 2段構え: ① 事前アクセスコード → ② 管理者ログイン（role==="admin"）。
 */
function AdminLoginScreen({ onLogin }: { onLogin: (loginId: string, password: string) => string | null }) {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(onLogin(loginId, password) || "");
  };

  return (
    <div
      data-theme="light"
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 18,
        background: "linear-gradient(160deg, #1e3a8a 0%, #0f172a 100%)",
        fontFamily: "\"Noto Sans JP\", sans-serif",
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: "100%",
          maxWidth: 400,
          background: "#ffffff",
          borderRadius: 22,
          padding: 24,
          boxShadow: "0 24px 60px rgba(15, 23, 42, 0.28)",
          border: "1px solid rgba(15, 23, 42, 0.08)",
        }}
      >
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#1d4ed8", marginBottom: 6 }}>ASAHI ADMIN</div>
          <h1 style={{ fontSize: 24, lineHeight: 1.2, fontWeight: 900, color: "#0f172a", margin: 0 }}>管理者ログイン</h1>
        </div>

        <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: "#475569", marginBottom: 6 }}>
          メールアドレス / ID
        </label>
        <input
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          autoCapitalize="none"
          autoComplete="username"
          placeholder="admin@asahilease.co.jp"
          style={{ width: "100%", height: 48, borderRadius: 12, border: "1px solid #cbd5e1", padding: "0 13px", fontSize: 15, fontWeight: 700, outline: "none", boxSizing: "border-box", marginBottom: 14 }}
        />

        <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: "#475569", marginBottom: 6 }}>パスワード</label>
        <div style={{ position: "relative", marginBottom: 14 }}>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            style={{ width: "100%", height: 48, borderRadius: 12, border: "1px solid #cbd5e1", padding: "0 46px 0 13px", fontSize: 15, fontWeight: 700, outline: "none", boxSizing: "border-box" }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-pressed={showPassword}
            aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}
            style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", height: 36, width: 36, display: "grid", placeItems: "center", border: 0, background: "transparent", color: "#64748b", cursor: "pointer", borderRadius: 10, padding: 0 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20, lineHeight: 1 }}>
              {showPassword ? "visibility_off" : "visibility"}
            </span>
          </button>
        </div>

        {error && (
          <div style={{ borderRadius: 12, background: "#fef2f2", color: "#b91c1c", fontSize: 12, fontWeight: 800, padding: "10px 12px", marginBottom: 14 }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          style={{ width: "100%", height: 50, border: 0, borderRadius: 14, background: "#1d4ed8", color: "#ffffff", fontSize: 15, fontWeight: 900, cursor: "pointer" }}
        >
          ログイン
        </button>
      </form>
    </div>
  );
}

function AdminLoadingScreen() {
  return (
    <div data-theme="light" style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "linear-gradient(160deg, #1e3a8a 0%, #0f172a 100%)", fontFamily: "\"Noto Sans JP\", sans-serif", color: "#e2e8f0" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 34, height: 34, margin: "0 auto 14px", border: "3px solid rgba(255,255,255,0.25)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <div style={{ fontSize: 13, fontWeight: 800 }}>読み込み中…</div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export default function AdminAuthGate({ children }: { children: ReactNode }) {
  const { currentUser, users, login, usersLoaded, setProfile } = useUser();
  const [gateOk, setGateOk] = useState(() => {
    try { return sessionStorage.getItem(GATE_KEY) === "1"; } catch { return false; }
  });

  // 代理ログイン（顧客として表示）から /admin へ戻ったら、保存しておいた管理者セッションへ自動復帰する。
  // （これがないと顧客セッションのまま「管理者ログイン」画面に飛ばされる）
  useEffect(() => {
    if (!gateOk || !usersLoaded) return;
    let ret: string | null = null;
    try { ret = localStorage.getItem("asahi.adminReturnId"); } catch { /* ignore */ }
    if (!ret) return;
    if (currentUser?.role === "admin") {
      // 復帰完了 → 後始末。
      try { localStorage.removeItem("asahi.adminReturnId"); } catch { /* ignore */ }
      return;
    }
    const adminUser = users.find((u: any) => u && u.id === ret && u.role === "admin");
    if (adminUser) {
      setProfile(adminUser as any); // 管理者セッションへ復帰
    } else {
      try { localStorage.removeItem("asahi.adminReturnId"); } catch { /* ignore */ }
    }
  }, [gateOk, usersLoaded, currentUser, users, setProfile]);

  // ① 事前アクセスコード（ログイン画面より前）。
  if (!gateOk) return <AccessCodeScreen onUnlock={() => setGateOk(true)} />;

  // セッションが残っているのに users 未読込の瞬間は、ログイン画面に飛ばさず読込中を表示する。
  // （戻る・再読込でユーザーマスタ取得前に「ログイン画面へ戻された＝ログアウトされた」ように見える問題を防ぐ）
  const hasSession = (() => { try { return !!localStorage.getItem("asahi.sessionUserId"); } catch { return false; } })();
  if (!usersLoaded && hasSession) return <AdminLoadingScreen />;

  // ② 管理者としてログイン済みなら管理画面へ。
  const canUseAdmin = currentUser && currentUser.status !== "inactive" && currentUser.role === "admin";
  if (canUseAdmin) return <>{children}</>;

  // 代理ログインからの復帰待ち（顧客セッションだが復帰用 ID あり）→ ログイン画面でなく読込中を表示。
  const pendingAdminRestore = (() => { try { return !!localStorage.getItem("asahi.adminReturnId"); } catch { return false; } })();
  if (pendingAdminRestore) return <AdminLoadingScreen />;

  const handleLogin = (loginId: string, password: string) => {
    // 起動直後（users 未読込）は誤った「見つかりません」を返さず、読込待ちを促す。
    if (!usersLoaded) return "読み込み中です。少し待ってから再度お試しください。";
    const key = (loginId || "").trim().toLowerCase();
    const target = users.find(
      (u) =>
        u &&
        ((u.email || "").trim().toLowerCase() === key ||
          (u.id || "").trim().toLowerCase() === key ||
          (u.employeeCode || "").trim().toLowerCase() === key),
    );

    if (!target) return "アカウントが見つかりません。";
    if (target.status === "inactive") return "このアカウントは停止中です。";
    if (target.role !== "admin") return "管理者権限のアカウントでログインしてください。";
    if ((target.password || "") !== password) return "パスワードが違います。";

    // 一意な id でログイン（メール重複時に login() の fail-closed で締め出されるのを防ぐ）。
    if (!login(target.id, password)) return "ログインに失敗しました。";
    return null;
  };

  return <AdminLoginScreen onLogin={handleLogin} />;
}
