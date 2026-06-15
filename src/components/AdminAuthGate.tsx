import React, { FormEvent, ReactNode, useState } from "react";
import { useUser } from "../context/UserContext";

/**
 * AdminAuthGate — /admin への入口を保護する。
 * ログイン済みでも role が "admin" でなければ管理画面を見せない。
 * （これまで /admin は無防備で、顧客アカウントでも URL 直打ちで開けてしまっていた。）
 */
function AdminLoginScreen({ onLogin }: { onLogin: (loginId: string, password: string) => string | null }) {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

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
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          style={{ width: "100%", height: 48, borderRadius: 12, border: "1px solid #cbd5e1", padding: "0 13px", fontSize: 15, fontWeight: 700, outline: "none", boxSizing: "border-box", marginBottom: 14 }}
        />

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

export default function AdminAuthGate({ children }: { children: ReactNode }) {
  const { currentUser, users, login } = useUser();

  const canUseAdmin = currentUser && currentUser.status !== "inactive" && currentUser.role === "admin";
  if (canUseAdmin) return <>{children}</>;

  const handleLogin = (loginId: string, password: string) => {
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

    if (!login(target.email || target.id, password)) return "ログインに失敗しました。";
    return null;
  };

  return <AdminLoginScreen onLogin={handleLogin} />;
}
