import React, { FormEvent, ReactNode, useState } from "react";
import { useUser } from "../../context/UserContext";

function StaffLoginScreen({ onLogin }: { onLogin: (loginId: string, password: string) => string | null }) {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const message = onLogin(loginId, password);
    setError(message || "");
  };

  return (
    <div
      data-theme="light"
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 18,
        background: "linear-gradient(160deg, #0f766e 0%, #0f172a 100%)",
        fontFamily: "\"Noto Sans JP\", sans-serif",
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: "100%",
          maxWidth: 390,
          background: "#ffffff",
          borderRadius: 22,
          padding: 22,
          boxShadow: "0 24px 60px rgba(15, 23, 42, 0.28)",
          border: "1px solid rgba(15, 23, 42, 0.08)",
        }}
      >
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#0f766e", letterSpacing: 0, marginBottom: 6 }}>
            ASAHI STAFF
          </div>
          <h1 style={{ fontSize: 24, lineHeight: 1.2, fontWeight: 900, color: "#0f172a", margin: 0 }}>
            スタッフログイン
          </h1>
        </div>

        <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: "#475569", marginBottom: 6 }}>
          メールアドレス / 社員ID
        </label>
        <input
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          autoCapitalize="none"
          autoComplete="username"
          placeholder="delivery@asahilease.co.jp"
          style={{
            width: "100%",
            height: 48,
            borderRadius: 12,
            border: "1px solid #cbd5e1",
            padding: "0 13px",
            fontSize: 15,
            fontWeight: 700,
            outline: "none",
            boxSizing: "border-box",
            marginBottom: 14,
          }}
        />

        <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: "#475569", marginBottom: 6 }}>
          パスワード
        </label>
        <div style={{ position: "relative", marginBottom: 14 }}>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            style={{
              width: "100%",
              height: 48,
              borderRadius: 12,
              border: "1px solid #cbd5e1",
              padding: "0 46px 0 13px",
              fontSize: 15,
              fontWeight: 700,
              outline: "none",
              boxSizing: "border-box",
            }}
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
          style={{
            width: "100%",
            height: 50,
            border: 0,
            borderRadius: 14,
            background: "#0f766e",
            color: "#ffffff",
            fontSize: 15,
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          ログイン
        </button>
      </form>
    </div>
  );
}

export default function StaffAuthGate({ children }: { children: ReactNode }) {
  const { currentUser, users, login, usersLoaded } = useUser();

  const canUseStaffApp =
    currentUser &&
    currentUser.status !== "inactive" &&
    (currentUser.role === "staff" || currentUser.role === "admin");

  if (canUseStaffApp) return <>{children}</>;

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
    if (target.role !== "staff" && target.role !== "admin") return "スタッフ権限のアカウントでログインしてください。";
    if ((target.password || "") !== password) return "パスワードが違います。";

    // 一意な id でログイン（メール重複時に login() の fail-closed で締め出されるのを防ぐ）。
    if (!login(target.id, password)) return "ログインに失敗しました。";
    return null;
  };

  return <StaffLoginScreen onLogin={handleLogin} />;
}
