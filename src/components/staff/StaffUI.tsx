import React, { useState, useRef, useEffect } from "react";
import Icon from "./Icon";

/* ---------- Types ---------- */
export interface TopBarProps {
  title: string;
  sub?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  accent?: boolean;
}

export interface IconBtnProps {
  name: string;
  onClick?: () => void;
  badge?: boolean;
  size?: number;
}

export interface BadgeProps {
  children: React.ReactNode;
  variant?: "neutral" | "brand" | "success" | "warning" | "danger";
  icon?: string;
  mono?: boolean;
}

export interface BtnProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  icon?: string;
  iconRight?: string;
  full?: boolean;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  style?: React.CSSProperties;
}

export interface CardProps {
  children: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
  pad?: number;
  accent?: boolean;
  className?: string;
}

export interface SectionLabelProps {
  children: React.ReactNode;
  right?: React.ReactNode;
  style?: React.CSSProperties;
}

export interface StepperProps {
  steps: string[];
  current: number;
}

export interface BottomNavProps {
  tabs: Array<{ key: string; label: string; icon: string; badge?: number | null }>;
  active: string;
  onChange: (key: string) => void;
}

export interface ScreenProps {
  children: React.ReactNode;
  footer?: React.ReactNode;
  scrollPad?: number;
  style?: React.CSSProperties;
}

export interface ProgressBarProps {
  value: number;
  max: number;
  color?: string;
}

export interface ItemRowProps {
  icon?: string;
  image?: string;
  name: string;
  qty: number;
  qtyUnit?: string;
  right?: React.ReactNode;
  sub?: string;
  tint?: string;
}

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export interface Photo {
  id: number;
  bg?: string;
  dataUrl?: string;
  time: string;
}

export interface PhotoTileProps {
  photo: Photo;
  onRemove?: () => void;
}

export interface EmptyProps {
  icon: string;
  title: string;
  sub?: string;
}

export interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  icon: string;
  tone?: "brand" | "success" | "warning" | "danger" | "neutral";
  sub?: string;
  onClick?: () => void;
}

export interface SegmentItem {
  key: string;
  label: string;
  count?: number | null;
}

export interface SegmentControlProps {
  items: SegmentItem[];
  active: string;
  onChange: (key: string) => void;
}

export interface InfoRowProps {
  icon?: string;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  action?: React.ReactNode;
  last?: boolean;
}

export const formatYen = (value: number) => `¥${Math.round(Number(value) || 0).toLocaleString("ja-JP")}`;
export const formatCount = (value: number | string) => Number(value || 0).toLocaleString("ja-JP");

/* ---------- Top bar ---------- */
export function TopBar({ title, sub, onBack, right, accent }: TopBarProps) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 14px", minHeight: 56,
      background: accent ? "transparent" : "var(--bg)",
      position: "sticky", top: 0, zIndex: 20,
    }}>
      {onBack && (
        <button onClick={onBack} style={{
          width: 40, height: 40, flexShrink: 0, borderRadius: 12,
          background: "var(--surface-2)", border: "1px solid var(--border)",
          color: "var(--fg)", display: "grid", placeItems: "center", cursor: "pointer",
        }}>
          <Icon name="chevronLeft" size={22} />
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {sub && <div style={{ fontSize: 11, fontWeight: 700, color: "var(--brand-accent)", letterSpacing: ".08em", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>{sub}</div>}
        <div style={{ fontSize: 18, fontWeight: 800, color: "var(--fg)", letterSpacing: "-0.01em", lineHeight: 1.2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-word" }}>{title}</div>
      </div>
      {right}
    </div>
  );
}

export function IconBtn({ name, onClick, badge, size = 40 }: IconBtnProps) {
  return (
    <button onClick={onClick} style={{
      width: size, height: size, flexShrink: 0, borderRadius: 12, position: "relative",
      background: "var(--surface-2)", border: "1px solid var(--border)",
      color: "var(--fg)", display: "grid", placeItems: "center", cursor: "pointer",
    }}>
      <Icon name={name} size={21} />
      {badge && <span style={{ position: "absolute", top: 7, right: 7, width: 8, height: 8, borderRadius: 99, background: "var(--danger-bright)", border: "2px solid var(--bg)" }} />}
    </button>
  );
}

/* ---------- Badge / tag ---------- */
export const BADGE_MAP = {
  neutral: ["var(--surface-3)", "var(--fg-muted)", "var(--border)"],
  brand:   ["var(--brand-tint)", "var(--brand-accent)", "transparent"],
  success: ["var(--success-tint)", "var(--success-bright)", "transparent"],
  warning: ["var(--warning-tint)", "var(--warning-bright)", "transparent"],
  danger:  ["var(--danger-tint)", "var(--danger-bright)", "transparent"],
};

export function Badge({ children, variant = "neutral", icon, mono }: BadgeProps) {
  const [bg, fg, bd] = BADGE_MAP[variant] || BADGE_MAP.neutral;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "4px 9px", borderRadius: 999, background: bg, color: fg,
      border: `1px solid ${bd}`, fontSize: 12, fontWeight: 700, lineHeight: 1.2,
      fontFamily: mono ? "var(--font-mono)" : "var(--font-jp)", whiteSpace: "nowrap",
    }}>
      {icon && <Icon name={icon} size={13} stroke={2.4} />}
      {children}
    </span>
  );
}

export function MetricCard({ label, value, unit, icon, tone = "neutral", sub, onClick }: MetricCardProps) {
  const palette = {
    brand: ["var(--brand-tint)", "var(--brand-accent)", "var(--brand)"],
    success: ["var(--success-tint)", "var(--success-bright)", "var(--success-bright)"],
    warning: ["var(--warning-tint)", "var(--warning-bright)", "var(--warning-bright)"],
    danger: ["var(--danger-tint)", "var(--danger-bright)", "var(--danger-bright)"],
    neutral: ["var(--surface-2)", "var(--fg)", "var(--border-strong)"],
  }[tone];
  const [bg, fg, line] = palette;

  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        minWidth: 0,
        textAlign: "left",
        border: `1px solid ${tone === "neutral" ? "var(--border)" : "transparent"}`,
        borderTop: `4px solid ${line}`,
        background: "var(--surface)",
        borderRadius: 16,
        padding: "13px 13px 12px",
        boxShadow: "var(--shadow-card)",
        cursor: onClick ? "pointer" : "default",
        fontFamily: "var(--font-jp)",
      }}
      className={onClick ? "active:scale-[0.97] transition-transform" : undefined}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: bg, color: fg, display: "grid", placeItems: "center", flexShrink: 0 }}>
          <Icon name={icon} size={18} />
        </span>
        {onClick && <Icon name="chevronRight" size={15} color="var(--fg-subtle)" />}
      </div>
      <div style={{ marginTop: 10, fontSize: 28, lineHeight: 1, fontWeight: 900, color: fg, fontFamily: "var(--font-mono)", letterSpacing: "0" }}>
        {value}
        {unit && <span style={{ marginLeft: 3, fontSize: 12.5, color: "var(--fg-subtle)", fontFamily: "var(--font-jp)", fontWeight: 800 }}>{unit}</span>}
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: "var(--fg-muted)", fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      {sub && <div style={{ marginTop: 3, fontSize: 11.5, color: "var(--fg-subtle)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
    </button>
  );
}

export function SegmentControl({ items, active, onChange }: SegmentControlProps) {
  return (
    <div style={{ display: "flex", gap: 5, background: "var(--surface-2)", padding: 4, borderRadius: 14, border: "1px solid var(--border)" }}>
      {items.map(item => {
        const on = active === item.key;
        return (
          <button
            key={item.key}
            onClick={() => onChange(item.key)}
            style={{
              flex: 1,
              minWidth: 0,
              padding: "9px 4px",
              minHeight: 44,
              borderRadius: 10,
              border: "none",
              background: on ? "var(--surface)" : "transparent",
              color: on ? "var(--fg)" : "var(--fg-muted)",
              fontWeight: 900,
              fontSize: 12,
              cursor: "pointer",
              boxShadow: on ? "var(--shadow-card)" : "none",
              fontFamily: "var(--font-jp)",
              whiteSpace: "nowrap",
            }}
          >
            <span>{item.label}</span>
            {item.count ? <span style={{ marginLeft: 3, fontFamily: "var(--font-mono)", color: on ? "var(--brand-accent)" : "var(--fg-subtle)" }}>({item.count})</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function InfoRow({ icon, label, value, sub, action, last }: InfoRowProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 12px", borderTop: last ? "none" : "1px solid var(--border)" }}>
      {icon && (
        <span style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surface-3)", color: "var(--brand-accent)", display: "grid", placeItems: "center", flexShrink: 0 }}>
          <Icon name={icon} size={18} />
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 14.5, color: "var(--fg)", fontWeight: 800, marginTop: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
        {sub && <div style={{ fontSize: 12.5, color: "var(--fg-muted)", fontWeight: 600, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
      </div>
      {action}
    </div>
  );
}

export function statusVariant(s: string) {
  if (["完了", "正常", "受領済", "確認済", "使用中", "支払済", "確認済み", "完了済み"].includes(s)) return "success";
  if (["急ぎ", "期限間近", "予定", "未確認", "整備中", "未払い", "準備中", "検品待ち"].includes(s)) return "warning";
  if (["期限切れ", "超過", "不足", "破損あり", "要対応", "廃車予定", "一部返却"].includes(s)) return "danger";
  if (["進行中", "配送中", "回収中", "レンタル中"].includes(s)) return "brand";
  return "neutral";
}

/* ---------- Button ----------
   Flip7 デザイン: ピル型（999px）。primary はゴールドCTA＋グロー、
   success はティール、danger はコーラル。押下時 scale(0.95)。 */
export function Btn({ children, onClick, variant = "primary", icon, iconRight, full, size = "md", disabled, style }: BtnProps) {
  const pad = size === "lg" ? "16px 22px" : size === "sm" ? "9px 16px" : "13px 20px";
  const fs = size === "lg" ? 17 : size === "sm" ? 14 : 15.5;
  const minH = size === "lg" ? 56 : size === "sm" ? 44 : 50;
  const base: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9,
    padding: pad, minHeight: minH, fontSize: fs, fontWeight: 800, borderRadius: 999, cursor: disabled ? "not-allowed" : "pointer",
    width: full ? "100%" : undefined, border: "1px solid transparent", fontFamily: "var(--font-jp)",
    letterSpacing: "0.02em", transition: "transform .12s cubic-bezier(.34,1.56,.64,1), filter .12s", opacity: disabled ? 0.45 : 1,
  };
  const variants = {
    primary:   { background: "linear-gradient(180deg, #FFE47A, var(--accent) 45%, var(--accent-strong))", color: "var(--on-accent)", boxShadow: disabled ? "none" : "var(--shadow-accent-glow)" },
    secondary: { background: "var(--surface)", color: "var(--brand-strong)", border: "1.5px solid var(--border-2)", boxShadow: "var(--shadow-card)" },
    ghost:     { background: "transparent", color: "var(--brand-accent)" },
    danger:    { background: "linear-gradient(180deg, var(--danger), #D45233)", color: "#FFF8E7", boxShadow: disabled ? "none" : "var(--shadow-coral-glow)" },
    success:   { background: "linear-gradient(180deg, var(--brand), var(--brand-strong))", color: "var(--on-brand)", boxShadow: disabled ? "none" : "var(--shadow-teal-glow)" },
  };
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={disabled ? undefined : "active:scale-95"}
      style={{ ...base, ...variants[variant], ...style }}
    >
      {icon && <Icon name={icon} size={fs + 3} stroke={2.4} />}
      {children}
      {iconRight && <Icon name={iconRight} size={fs + 3} stroke={2.4} />}
    </button>
  );
}

/* ---------- Card ----------
   Flip7 デザイン: 白背景・角丸24px・ティールグロー影・左6pxのアクセントバー。 */
export function Card({ children, onClick, style, pad = 16, accent, className }: CardProps) {
  // タップ可能な Card は MetricCard と同じく押下フィードバックを付ける。
  const cls = [onClick ? "active:scale-[0.99] transition-transform" : "", className].filter(Boolean).join(" ") || undefined;
  return (
    <div onClick={onClick} className={cls} role={onClick ? "button" : undefined} style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 24, padding: pad, boxShadow: "var(--shadow-card)",
      cursor: onClick ? "pointer" : undefined, position: "relative", overflow: "hidden",
      ...style,
    }}>
      {accent && <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, background: "linear-gradient(180deg, var(--brand), var(--brand-strong))" }} />}
      {children}
    </div>
  );
}

/* ---------- Section label ----------
   Flip7 デザイン: 遊び心のある破線アンダーライン付きセクション見出し。 */
export function SectionLabel({ children, right, style }: SectionLabelProps) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      margin: "2px 2px 12px", paddingBottom: 7,
      borderBottom: "3px dashed var(--border-2)",
      ...style,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ width: 6, height: 18, borderRadius: 3, background: "linear-gradient(180deg, var(--accent), var(--accent-strong))" }} />
        <span style={{ fontSize: 15, fontWeight: 800, color: "var(--fg)", letterSpacing: "0.02em" }}>{children}</span>
      </div>
      {right}
    </div>
  );
}

export function Overline({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", ...style }}>{children}</div>;
}

/* ---------- Stepper ---------- */
export function Stepper({ steps, current }: StepperProps) {
  return (
    <div style={{ padding: "4px 2px 2px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {steps.map((s, i) => {
          const done = i < current, now = i === current;
          return (
            <React.Fragment key={i}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0, width: 30 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 99, display: "grid", placeItems: "center",
                  background: done ? "var(--brand)" : now ? "var(--brand-tint)" : "var(--surface-2)",
                  border: now ? "2px solid var(--brand)" : `1px solid ${done ? "var(--brand)" : "var(--border)"}`,
                  color: done ? "var(--on-brand)" : now ? "var(--brand-accent)" : "var(--fg-subtle)",
                  fontSize: 12, fontWeight: 800,
                }}>
                  {done ? <Icon name="check" size={15} stroke={3} /> : i + 1}
                </div>
              </div>
              {i < steps.length - 1 && <div style={{ flex: 1, height: 2, borderRadius: 2, background: i < current ? "var(--brand)" : "var(--border)" }} />}
            </React.Fragment>
          );
        })}
      </div>
      {/* 現在のステップ名を表示（番号だけだと現在地が分かりづらいため）。 */}
      {steps[current] != null && (
        <div style={{ textAlign: "center", marginTop: 7, fontSize: 11.5, fontWeight: 800, color: "var(--fg)" }}>
          <span style={{ color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", marginRight: 6 }}>{current + 1}/{steps.length}</span>
          {steps[current]}
        </div>
      )}
    </div>
  );
}

/* ---------- Bottom nav ----------
   Flip7 デザイン: アクティブタブはゴールドのピルハイライト。 */
export function BottomNav({ tabs, active, onChange }: BottomNavProps) {
  return (
    <div style={{
      display: "flex", borderTop: "1px solid var(--border)", background: "var(--surface)",
      // 端末のジェスチャー/ホームインジケータ分の余白を確保（Android 15+ のエッジツーエッジでタブが隠れるのを防ぐ）。
      padding: "8px 6px calc(6px + env(safe-area-inset-bottom))", flexShrink: 0, boxShadow: "var(--shadow-pop)",
    }}>
      {tabs.map(t => {
        const on = t.key === active;
        return (
          <button key={t.key} onClick={() => onChange(t.key)} style={{
            flex: 1, background: "none", border: "none", cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "3px 0",
            color: on ? "var(--brand-strong)" : "var(--fg-subtle)", position: "relative",
          }}>
            <span style={{
              display: "grid", placeItems: "center", width: 46, height: 28, borderRadius: 999,
              background: on ? "linear-gradient(180deg, #FFE47A, var(--accent))" : "transparent",
              color: on ? "var(--on-accent)" : "inherit",
              boxShadow: on ? "var(--shadow-accent-glow)" : "none",
              transition: "background .15s, box-shadow .15s",
            }}>
              <Icon name={t.icon} size={21} stroke={on ? 2.4 : 2} />
            </span>
            <span style={{ fontSize: 11, fontWeight: on ? 800 : 600, fontFamily: "var(--font-jp)" }}>{t.label}</span>
            {t.badge ? <span style={{ position: "absolute", top: -2, right: "50%", marginRight: -22, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 99, background: "var(--danger)", color: "#fff", fontSize: 10, fontWeight: 800, display: "grid", placeItems: "center", fontFamily: "var(--font-mono)", border: "2px solid var(--surface)" }}>{t.badge > 99 ? "99+" : t.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Screen wrapper ---------- */
export function Screen({ children, footer, scrollPad = 16, style }: ScreenProps) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)", minHeight: 0, ...style }}>
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch", padding: `0 ${scrollPad}px ${footer ? 12 : scrollPad}px` }}>
        {children}
      </div>
      {footer && (
        <div style={{ padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--border)", background: "var(--bg)", flexShrink: 0 }}>
          {footer}
        </div>
      )}
    </div>
  );
}

/* ---------- Progress bar ---------- */
export function ProgressBar({ value, max, color = "var(--brand)" }: ProgressBarProps) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ height: 8, borderRadius: 99, background: "var(--surface-3)", overflow: "hidden" }}>
      <div style={{ width: pct + "%", height: "100%", borderRadius: 99, background: color, transition: "width .4s cubic-bezier(.2,0,0,1)" }} />
    </div>
  );
}

/* ---------- Item row ---------- */
export function ItemRow({ icon, image, name, qty, qtyUnit = "個", right, sub, tint = "var(--brand-accent)" }: ItemRowProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0" }}>
      <div style={{ width: 40, height: 40, borderRadius: 11, background: "var(--surface-3)", display: "grid", placeItems: "center", color: tint, flexShrink: 0, overflow: "hidden" }}>
        {image ? (
          <img src={image} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <Icon name={icon || "package"} size={21} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--fg)", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-word" }}>{name}</div>
        {sub && <div style={{ fontSize: 12.5, color: "var(--fg-muted)", marginTop: 1 }}>{sub}</div>}
      </div>
      {right !== undefined ? right : (
        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--fg)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
          {qty}<span style={{ fontSize: 12, color: "var(--fg-subtle)", marginLeft: 2, fontFamily: "var(--font-jp)" }}>{qtyUnit}</span>
        </div>
      )}
    </div>
  );
}

/* ---------- Bottom sheet ---------- */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;

    let disposed = false;
    let nativeBackHandle: { remove: () => Promise<void> } | null = null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };

    window.addEventListener("keydown", handleKeyDown);
    import("@capacitor/app")
      .then(({ App }) => App.addListener("backButton", () => onCloseRef.current()))
      .then(handle => {
        if (disposed) {
          void handle.remove();
          return;
        }
        nativeBackHandle = handle;
      })
      .catch(() => {
        // Browser preview does not need Capacitor's native back-button listener.
      });
    return () => {
      disposed = true;
      window.removeEventListener("keydown", handleKeyDown);
      void nativeBackHandle?.remove();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: "absolute", inset: 0, zIndex: 60, display: "flex", flexDirection: "column", justifyContent: "flex-end", background: "var(--scrim)", animation: "fadeIn .16s ease" }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "var(--surface)", borderTopLeftRadius: 32, borderTopRightRadius: 32,
        borderTop: "1px solid var(--border)", padding: "12px 18px calc(20px + env(safe-area-inset-bottom))",
        maxHeight: "82%", overflowY: "auto", boxShadow: "var(--shadow-pop)", animation: "sheetUp .22s cubic-bezier(.2,0,0,1)",
      }}>
        <div style={{ width: 40, height: 4, borderRadius: 99, background: "var(--border-strong)", margin: "0 auto 14px" }} />
        {title && <div style={{ fontSize: 18, fontWeight: 800, color: "var(--fg)", marginBottom: 14 }}>{title}</div>}
        {children}
      </div>
    </div>
  );
}

/* ---------- Signature pad ---------- */
export interface SignaturePadProps {
  onChange: (dataUrl: string | null) => void;
  onClear?: () => void;
}

// 全画面の署名オーバーレイ。狭いインライン枠より遥かに広く署名でき、指でも書きやすい。
// （アプリは portrait 固定のため真の横向きにはしないが、全画面で十分な記入領域を確保する）。
function FullscreenSignature({ onDone, onClose }: { onDone: (url: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [has, setHas] = useState(false);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const r = c.getBoundingClientRect();
    c.width = r.width * 2; c.height = r.height * 2;
    const ctx = c.getContext("2d");
    if (ctx) { ctx.scale(2, 2); ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#000000"; }
  }, []);
  const pos = (e: any) => { const c = ref.current; if (!c) return { x: 0, y: 0 }; const r = c.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: t.clientX - r.left, y: t.clientY - r.top }; };
  const start = (e: any) => { e.preventDefault(); drawing.current = true; const ctx = ref.current?.getContext("2d"); if (ctx) { const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); } };
  const move = (e: any) => { if (!drawing.current) return; e.preventDefault(); const ctx = ref.current?.getContext("2d"); if (ctx) { const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); if (!has) setHas(true); } };
  const end = () => { drawing.current = false; };
  const clear = () => { const c = ref.current; const ctx = c?.getContext("2d"); if (c && ctx) { ctx.clearRect(0, 0, c.width, c.height); setHas(false); } };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: 15, fontWeight: 900, color: "var(--fg)" }}>署名（全画面）</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--fg-muted)", cursor: "pointer", display: "grid", placeItems: "center" }}><Icon name="x" size={22} /></button>
      </div>
      <div style={{ flex: 1, padding: 16, minHeight: 0 }}>
        <div style={{ position: "relative", height: "100%", borderRadius: 16, border: "2px solid var(--border-strong)", background: "#ffffff", overflow: "hidden" }}>
          <canvas ref={ref} style={{ width: "100%", height: "100%", display: "block", touchAction: "none", cursor: "crosshair" }} onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end} onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
          {!has && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none", color: "#94a3b8", fontSize: 18, fontWeight: 700 }}>こちらに大きくご署名ください</div>}
        </div>
      </div>
      <div style={{ padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", display: "flex", gap: 10, borderTop: "1px solid var(--border)" }}>
        <Btn variant="secondary" icon="refresh" onClick={clear} style={{ flex: "0 0 auto", minWidth: 116 }}>書き直す</Btn>
        <Btn full size="lg" variant="success" icon="check" disabled={!has} onClick={() => { const c = ref.current; if (c) onDone(c.toDataURL("image/png")); }}>署名を確定</Btn>
      </div>
    </div>
  );
}

export function SignaturePad({ onChange }: SignaturePadProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [has, setHas] = useState(false);
  const [big, setBig] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  // preview を依存に含める。全画面署名 → 書き直す でインライン canvas が再マウントされた際に
  // 再度サイズ設定/スケールしないと、新しい canvas が既定の 300x150・scale 無しになり
  // 線が極細・指の位置とズレる（再マウント時に必ず初期化し直す）。
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const r = c.getBoundingClientRect();
    c.width = r.width * 2; c.height = r.height * 2;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.scale(2, 2);
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#000000"; // Always black for signature
    }
  }, [preview]);

  const pos = (e: any) => {
    const c = ref.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  };

  const start = (e: any) => {
    e.preventDefault();
    drawing.current = true;
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (ctx) {
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    }
  };

  const move = (e: any) => {
    if (!drawing.current) return;
    e.preventDefault();
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (ctx) {
      const p = pos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      if (!has) {
        setHas(true);
      }
    }
  };

  const end = () => { 
    if (drawing.current) {
      drawing.current = false; 
      const c = ref.current;
      if (c) {
        onChange(c.toDataURL("image/png"));
      }
    }
  };

  const clear = () => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (c && ctx) {
      ctx.clearRect(0, 0, c.width, c.height);
      setHas(false);
      onChange(null);
    }
  };

  return (
    <div>
      {preview ? (
        <div style={{ position: "relative", borderRadius: 16, border: "2px solid var(--border-strong)", background: "#ffffff", overflow: "hidden" }}>
          <img src={preview} alt="署名" style={{ width: "100%", height: 200, objectFit: "contain", display: "block" }} />
          <button onClick={() => { setPreview(null); onChange(null); clear(); }} style={{ position: "absolute", bottom: 12, right: 12, padding: "8px 14px", borderRadius: 10, background: "#f1f5f9", border: "1px solid #cbd5e1", color: "#475569", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, zIndex: 10 }}>
            <Icon name="refresh" size={16} />書き直す
          </button>
        </div>
      ) : (
        <div style={{ position: "relative", borderRadius: 16, border: "2px solid var(--border-strong)", background: "#ffffff", overflow: "hidden", boxShadow: "inset 0 2px 10px rgba(0,0,0,0.05)" }}>
          <canvas
            ref={ref}
            style={{ width: "100%", height: 200, display: "block", touchAction: "none", cursor: "crosshair" }}
            onMouseDown={start}
            onMouseMove={move}
            onMouseUp={end}
            onMouseLeave={end}
            onTouchStart={start}
            onTouchMove={move}
            onTouchEnd={end}
          />
          {!has && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none", color: "#94a3b8", fontSize: 16, fontWeight: 700 }}>こちらにご署名ください</div>}
          <button onClick={clear} style={{ position: "absolute", bottom: 12, right: 12, padding: "8px 14px", borderRadius: 10, background: "#f1f5f9", border: "1px solid #cbd5e1", color: "#475569", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, zIndex: 10 }}>
            <Icon name="refresh" size={16} />書き直す
          </button>
        </div>
      )}
      <button onClick={() => setBig(true)} style={{ marginTop: 8, width: "100%", padding: "10px", borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--brand-accent)", fontSize: 13.5, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontFamily: "var(--font-jp)" }}>
        <Icon name="signature" size={16} />全画面で大きく署名する
      </button>
      {big && <FullscreenSignature onDone={(url) => { setPreview(url); onChange(url); setBig(false); }} onClose={() => setBig(false)} />}
    </div>
  );
}

/* ---------- Photo capture button & tile ---------- */
export const PHOTO_BGS = [
  "linear-gradient(135deg,#3a4a5e,#1f2a38)", "linear-gradient(135deg,#4a3f2e,#2a2218)",
  "linear-gradient(135deg,#2e4a3e,#18281f)", "linear-gradient(135deg,#3e2e4a,#241828)",
];

export function makePhoto(i = 0, dataUrl?: string): Photo {
  return {
    id: Date.now() + Math.random(),
    bg: PHOTO_BGS[i % PHOTO_BGS.length],
    dataUrl,
    time: new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })
  };
}

export function PhotoCaptureButton({ onCapture, style, children }: { onCapture: (dataUrl: string) => void, style?: React.CSSProperties, children?: React.ReactNode }) {
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          onCapture(ev.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };
  return (
    <label style={{ cursor: "pointer", ...style }}>
      <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleFile} />
      {children}
    </label>
  );
}

export function PhotoTile({ photo, onRemove }: PhotoTileProps) {
  return (
    <div style={{ position: "relative", aspectRatio: "1", borderRadius: 13, overflow: "hidden", background: photo.bg || "var(--surface-3)", border: "1px solid var(--border)" }}>
      {photo.dataUrl ? (
        <img src={photo.dataUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="Captured" />
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "rgba(255,255,255,0.5)" }}>
          <Icon name="image" size={26} />
        </div>
      )}
      <div style={{ position: "absolute", left: 6, bottom: 6, fontSize: 10, fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.85)", background: "rgba(0,0,0,0.4)", padding: "2px 6px", borderRadius: 6 }}>{photo.time}</div>
      {onRemove && (
        <button onClick={onRemove} style={{ position: "absolute", top: 5, right: 5, width: 24, height: 24, borderRadius: 99, background: "rgba(0,0,0,0.55)", border: "none", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}>
          <Icon name="x" size={14} stroke={2.6} />
        </button>
      )}
    </div>
  );
}

/* ---------- Empty state ---------- */
export function Empty({ icon, title, sub }: EmptyProps) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--fg-subtle)" }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: "var(--surface-2)", display: "grid", placeItems: "center", margin: "0 auto 14px", color: "var(--fg-muted)" }}>
        <Icon name={icon} size={26} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--fg-muted)" }}>{title}</div>
      {sub && <div style={{ fontSize: 13, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

/* ---------- Stepper Controls ----------
   Flip7 デザイン: カウンターは角丸スクエア。マイナス＝コーラル、プラス＝ティール。 */
function stepBtnStyle(dis: boolean, kind: "minus" | "plus", size: number): React.CSSProperties {
  const coral = kind === "minus";
  return {
    width: size,
    height: size,
    borderRadius: 12,
    border: `1.5px solid ${dis ? "var(--border)" : coral ? "var(--danger)" : "var(--brand)"}`,
    background: dis ? "var(--surface-2)" : coral ? "var(--danger-tint)" : "var(--brand-tint)",
    color: dis ? "var(--fg-disabled)" : coral ? "var(--danger-bright)" : "var(--brand-strong)",
    display: "grid",
    placeItems: "center",
    cursor: dis ? "default" : "pointer",
    transition: "transform .1s",
  };
}

export function QtyStepper({ value, max, onChange, shortBelow }: { value: number; max: number; onChange: (v: number) => void; shortBelow?: number }) {
  const btn = (dir: number, ic: "minus" | "plus", dis: boolean) => (
    <button disabled={dis} onClick={() => onChange(Math.max(0, value + dir))} style={stepBtnStyle(dis, ic, 40)}>
      <Icon name={ic} size={18} stroke={2.6} />
    </button>
  );
  // 不足のときだけ赤。max は入力上限であって不足閾値ではない（以前は value<max で常に赤になっていた）。
  const isShort = shortBelow !== undefined && value < shortBelow;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {btn(-1, "minus", value <= 0)}
      <span style={{ minWidth: 30, textAlign: "center", fontSize: 17, fontWeight: 800, fontFamily: "var(--font-mono)", color: isShort ? "var(--danger-bright)" : "var(--fg)" }}>{value}</span>
      {btn(1, "plus", value >= max)}
    </div>
  );
}

export function NumStepper({ value, onChange, min = 1, max = 999, danger }: { value: number; onChange: (v: number) => void; min?: number; max?: number; danger?: boolean }) {
  const btn = (dir: number, ic: "minus" | "plus", dis: boolean) => (
    <button disabled={dis} onClick={() => onChange(Math.min(max, Math.max(min, value + dir)))} style={stepBtnStyle(dis, ic, 40)}>
      <Icon name={ic} size={17} stroke={2.8} />
    </button>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      {btn(-1, "minus", value <= min)}
      <span style={{ minWidth: 26, textAlign: "center", fontSize: 16, fontWeight: 800, fontFamily: "var(--font-mono)", color: danger ? "var(--danger-bright)" : "var(--fg)" }}>{value}</span>
      {btn(1, "plus", value >= max)}
    </div>
  );
}

/* ---------- Map View Mock ---------- */
export interface MapMockProps {
  height?: number;
  dest: string;
  eta: string;
  dist: string;
  arrived?: boolean;
}

export function MapMock({ height = 230, eta, dist, arrived }: MapMockProps) {
  return (
    <div style={{ position: "relative", height, borderRadius: 16, overflow: "hidden", border: "1px solid var(--border)", background: "var(--surface-2)" }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg, var(--surface-3), var(--surface-2))" }} />
      <svg viewBox="0 0 320 230" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.5 }}>
        <g stroke="var(--border-strong)" strokeWidth="8" strokeLinecap="round" fill="none">
          <path d="M-10 60 H330" /><path d="M-10 150 H330" />
          <path d="M70 -10 V240" /><path d="M210 -10 V240" />
        </g>
        <g stroke="var(--border)" strokeWidth="3" fill="none" opacity="0.7">
          <path d="M-10 110 H330" /><path d="M140 -10 V240" /><path d="M270 -10 V240" />
        </g>
        <g fill="var(--surface)" opacity="0.35">
          <rect x="78" y="68" width="54" height="74" rx="3" /><rect x="148" y="68" width="54" height="74" rx="3" />
          <rect x="218" y="68" width="44" height="74" rx="3" />
        </g>
      </svg>
      <svg viewBox="0 0 320 230" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <path d="M40 200 L40 150 L140 150 L140 60 L240 60" fill="none" stroke="var(--brand)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" style={{ filter: "drop-shadow(0 1px 3px var(--brand-tint))" }} />
        <path d="M40 200 L40 150 L140 150 L140 60 L240 60" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 9" opacity="0.7" />
      </svg>
      <div style={{ position: "absolute", left: "12.5%", top: "87%", transform: "translate(-50%,-50%)" }}>
        <span style={{ display: "block", width: 16, height: 16, borderRadius: 99, background: "var(--brand)", border: "3px solid #fff", boxShadow: "0 0 0 6px var(--brand-tint)" }} />
      </div>
      <div style={{ position: "absolute", left: "75%", top: "26%", transform: "translate(-50%,-100%)", color: arrived ? "var(--success-bright)" : "var(--danger-bright)" }}>
        <Icon name="mapPin" size={36} stroke={2.2} style={{ filter: "drop-shadow(0 3px 4px rgba(0,0,0,0.4))", fill: arrived ? "var(--success-bright)" : "var(--danger-bright)", fillOpacity: 0.18 }} />
      </div>
      {!arrived && (eta || dist) && (
        <div style={{ position: "absolute", left: 12, top: 12, display: "flex", gap: 8 }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 11, padding: "7px 11px", boxShadow: "var(--shadow-card)" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--brand-accent)", fontFamily: "var(--font-mono)", lineHeight: 1 }}>{eta}</div>
            <div style={{ fontSize: 10.5, color: "var(--fg-subtle)", marginTop: 2 }}>到着予定</div>
          </div>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 11, padding: "7px 11px", boxShadow: "var(--shadow-card)" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--fg)", fontFamily: "var(--font-mono)", lineHeight: 1 }}>{dist}</div>
            <div style={{ fontSize: 10.5, color: "var(--fg-subtle)", marginTop: 2 }}>残り距離</div>
          </div>
        </div>
      )}
      {arrived && (
        <div style={{ position: "absolute", left: "50%", bottom: 14, transform: "translateX(-50%)", background: "var(--success-tint)", border: "1px solid var(--success-bright)", color: "var(--success-bright)", borderRadius: 99, padding: "8px 16px", fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", gap: 7, backdropFilter: "blur(4px)" }}>
          <Icon name="checkCircle" size={18} />現場に到着しました
        </div>
      )}
    </div>
  );
}

/* ---------- Damage report sheet ---------- */
export const DAMAGE_REASONS = ["破損あり", "数量不足", "汚損・要清掃", "部品欠品", "その他"];
export const REASON_ICON: Record<string, string> = { "破損あり": "alert", "数量不足": "minus", "汚損・要清掃": "refresh", "部品欠品": "package", "その他": "info" };

export interface DamageReportSheetProps {
  open: boolean;
  product?: { id: string; name: string; qr?: string; icon?: string; report?: any[]; expected?: number; quantity?: number };
  onClose: () => void;
  onSave: (entries: any[]) => void;
}

// 音声入力ボタン: 手袋・現場でメモを打つのが大変なため、話してメモを入れる。
// webkitSpeechRecognition 対応端末のみ表示（progressive enhancement・非対応では非表示）。
function MicButton({ onText }: { onText: (t: string) => void }) {
  const SR = typeof window !== "undefined" ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;
  const [rec, setRec] = useState(false);
  const recRef = useRef<any>(null);
  // アンマウント時（シート閉/エントリ削除）に録音を確実に停止する（マイクが点きっぱなしになるのを防ぐ）。
  useEffect(() => () => { try { recRef.current?.stop(); } catch { /* ignore */ } }, []);
  if (!SR) return null;
  const toggle = () => {
    if (rec) { try { recRef.current?.stop(); } catch { /* ignore */ } return; }
    try {
      const r = new SR();
      r.lang = "ja-JP"; r.interimResults = false; r.maxAlternatives = 1;
      r.onresult = (ev: any) => { const t = ev.results?.[0]?.[0]?.transcript; if (t) onText(String(t)); };
      r.onend = () => setRec(false);
      r.onerror = () => setRec(false);
      recRef.current = r;
      r.start();
      setRec(true);
    } catch { setRec(false); }
  };
  return (
    <button type="button" onClick={toggle} title="音声でメモ入力" style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 10, border: "1px solid var(--border-strong)", background: rec ? "var(--danger-tint)" : "var(--surface-2)", color: rec ? "var(--danger-bright)" : "var(--brand-accent)", display: "grid", placeItems: "center", cursor: "pointer" }}>
      <Icon name="mic" size={18} />
    </button>
  );
}

export function DamageReportSheet({ open, product, onClose, onSave }: DamageReportSheetProps) {
  const [entries, setEntries] = useState<any[]>([]);

  useEffect(() => {
    if (open && product) {
      setEntries((product.report || []).map(e => ({ ...e, photos: [...(e.photos || [])] })));
    }
  }, [open, product]);

  if (!product) return null;
  const used = entries.map(e => e.reason);
  const remaining = DAMAGE_REASONS.filter(r => !used.includes(r));
  const totalQty = entries.reduce((a, e) => a + e.qty, 0);
  // 報告数量はレンタル数量（予定数）を上限にする。区分をまたいだ合計も予定数を超えない
  //（不足・破損の合計が貸出数を超えると弁償費が過大計上されるため）。
  const capQty = (() => { const c = Number(product.expected ?? product.quantity); return Number.isFinite(c) && c > 0 ? c : 999; })();

  const addEntry = (reason: string) => setEntries(es => [...es, { key: Date.now() + reason, reason, qty: 1, photos: [], note: "" }]);
  const removeEntry = (key: string) => setEntries(es => es.filter(e => e.key !== key));
  // updates は部分オブジェクト or 現在のエントリを受け取る関数。後者は最新値ベースで更新でき、
  // 音声入力（非同期で結果が返る）が、その間に手入力された note を古い値で上書きするのを防ぐ。
  const patchEntry = (key: string, updates: any) => setEntries(es => es.map(e => e.key === key ? { ...e, ...(typeof updates === "function" ? updates(e) : updates) } : e));
  const addPhotoToEntry = (key: string, dataUrl: string) => setEntries(es => es.map(e => e.key === key ? { ...e, photos: [...e.photos, makePhoto(e.photos.length, dataUrl)] } : e));
  const rmPhotoFromEntry = (key: string, pid: number) => setEntries(es => es.map(e => e.key === key ? { ...e, photos: e.photos.filter((p: any) => p.id !== pid) } : e));

  return (
    <Sheet open={open} onClose={onClose} title="不足・破損の報告">
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 16, padding: 12, borderRadius: 12, background: "var(--surface-2)" }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--surface-3)", color: "var(--brand-accent)", display: "grid", placeItems: "center" }}><Icon name={product.icon || "package"} size={20} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: "var(--fg)" }}>{product.name}</div>
          <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)" }}>{product.qr}</div>
        </div>
        {totalQty > 0 && <Badge variant="danger">計 {totalQty}個</Badge>}
      </div>

      {entries.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
          {entries.map(e => (
            <div key={e.key} style={{ borderRadius: 14, border: "1px solid var(--danger-bright)", background: "var(--danger-tint)", padding: 13 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--danger-bright)", color: "#fff", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name={REASON_ICON[e.reason] || "alert"} size={16} /></div>
                <span style={{ flex: 1, fontSize: 15, fontWeight: 800, color: "var(--fg)" }}>{e.reason}</span>
                <button onClick={() => removeEntry(e.key)} style={{ width: 30, height: 30, borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--fg-muted)", display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 }}><Icon name="trash" size={15} /></button>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px 12px" }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--fg-muted)" }}>個数</span>
                <NumStepper value={e.qty} min={1} max={Math.max(1, capQty - (totalQty - e.qty))} onChange={v => patchEntry(e.key, { qty: v })} danger />
              </div>
              <Overline style={{ marginBottom: 8 }}>写真（{e.reason}）</Overline>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 7, marginBottom: 11 }}>
                {e.photos.map((p: any) => <PhotoTile key={p.id} photo={p} onRemove={() => rmPhotoFromEntry(e.key, p.id)} />)}
                <PhotoCaptureButton onCapture={data => addPhotoToEntry(e.key, data)} style={{ aspectRatio: "1", borderRadius: 11, border: "1.5px dashed var(--border-strong)", background: "var(--surface)", color: "var(--danger-bright)", display: "grid", placeItems: "center", cursor: "pointer" }}>
                  <Icon name="camera" size={20} />
                </PhotoCaptureButton>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input value={e.note} onChange={ev => patchEntry(e.key, { note: ev.target.value })} placeholder="メモ（任意・音声入力可）" style={{ flex: 1, minWidth: 0, borderRadius: 10, border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--fg)", padding: "9px 12px", fontSize: 13.5, fontFamily: "var(--font-jp)", outline: "none" }} />
                <MicButton onText={t => patchEntry(e.key, (cur: any) => ({ note: (cur.note ? cur.note + " " : "") + t }))} />
              </div>
            </div>
          ))}
        </div>
      )}

      {remaining.length > 0 && (
        <>
          <Overline style={{ marginBottom: 9 }}>{entries.length > 0 ? "区分を追加" : "区分を選択"}</Overline>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
            {remaining.map(r => (
              <button key={r} onClick={() => addEntry(r)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 99, border: "1.5px solid var(--border-strong)", background: "var(--surface-2)", color: "var(--fg-muted)", fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-jp)" }}>
                <Icon name="plus" size={14} stroke={2.6} />{r}
              </button>
            ))}
          </div>
        </>
      )}

      {entries.length === 0 && (
        <p style={{ fontSize: 12.5, color: "var(--fg-subtle)", margin: "0 0 18px", lineHeight: 1.5 }}>区分ごとに個数と写真を記録できます。複数の区分を追加できます。</p>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        {(product.report && product.report.length > 0) && <Btn variant="secondary" icon="x" onClick={() => onSave([])}>報告を取消</Btn>}
        <Btn full variant="primary" icon="send" onClick={() => onSave(entries)} disabled={entries.length === 0}>管理者へ報告</Btn>
      </div>
    </Sheet>
  );
}

export function reportQty(p: any) { return (p.report || []).reduce((a: number, e: any) => a + e.qty, 0); }
export function reportPhotos(p: any) { return (p.report || []).reduce((a: number, e: any) => a + (e.photos || []).length, 0); }
