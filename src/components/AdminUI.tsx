import React, { useState, useEffect, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// 1. Types & Constants
// ---------------------------------------------------------------------------

export interface BadgeProps {
  children: ReactNode;
  tone?: "default" | "ok" | "danger" | "warning";
}

export interface BtnProps {
  children?: ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: string;
  size?: "sm" | "md";
  danger?: boolean;
  disabled?: boolean;
}

export interface PanelProps {
  title?: string;
  icon?: string;
  sub?: string;
  action?: ReactNode;
  children: ReactNode;
  style?: React.CSSProperties;
  bodyPad?: number;
}

export interface KPIProps {
  label: string;
  value: string | number;
  delta?: number;
  icon: string;
  accent?: string;
  sub?: string;
}

export interface TabItem {
  id: string;
  label: string;
}

export interface TabsProps {
  tabs: (string | TabItem)[];
  active: string;
  onChange: (id: string) => void;
  counts?: Record<string, number>;
}

export interface TableColumn<T = any> {
  h: string;
  align?: "left" | "center" | "right";
  wrap?: boolean;
  cell: (row: T) => ReactNode;
}

export interface TableProps<T = any> {
  cols: TableColumn<T>[];
  rows: T[];
  onRow?: (row: T) => void;
}

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: string;
  width?: number;
  footer?: ReactNode;
  children: ReactNode;
}

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  width?: number;
  footer?: ReactNode;
  children: ReactNode;
}

export interface FieldProps {
  label: string;
  children: ReactNode;
  required?: boolean;
  hint?: string;
}

// Global Toast event trigger
export function triggerToast(msg: string, type: "ok" | "info" | "warn" | "err" = "ok") {
  window.dispatchEvent(
    new CustomEvent("app-toast", {
      detail: { msg, type, id: Date.now() + Math.random() }
    })
  );
}

// ---------------------------------------------------------------------------
// 2. Primtive Components
// ---------------------------------------------------------------------------

// Status Badges
const STATUS_MAP: Record<string, string[]> = {
  "進行中": ["var(--color-primary-light)", "var(--color-primary)", "var(--brand-accent)"],
  "レンタル中": ["rgba(58,77,232,0.1)", "var(--brand)", "var(--brand-accent)"],
  "完了": ["rgba(31,157,87,0.1)", "#1f9d57", "#34c77b"],
  "一致": ["rgba(31,157,87,0.1)", "#1f9d57", "#34c77b"],
  "正常": ["rgba(31,157,87,0.1)", "#1f9d57", "#34c77b"],
  "取引中": ["rgba(31,157,87,0.1)", "#1f9d57", "#34c77b"],
  "在庫": ["#ECEEF3", "#4E5667", "#9AA1B2"],
  "請求済": ["rgba(58,77,232,0.1)", "var(--brand)", "#8C9CFF"],
  "予定": ["rgba(229,150,27,0.1)", "#e5961b", "#f2b544"],
  "修理待ち": ["rgba(229,150,27,0.1)", "#e5961b", "#f2b544"],
  "メンテナンス中": ["rgba(229,150,27,0.1)", "#e5961b", "#f2b544"],
  "修理中": ["rgba(58,77,232,0.1)", "var(--brand)", "#8C9CFF"],
  "修正中": ["rgba(229,150,27,0.1)", "#e5961b", "#f2b544"],
  "要確認": ["rgba(229,150,27,0.1)", "#e5961b", "#f2b544"],
  "差異あり": ["rgba(229,150,27,0.1)", "#e5961b", "#f2b544"],
  "延滞": ["rgba(220,58,40,0.1)", "#dc3a28", "#ff6b5a"],
  "超過": ["rgba(220,58,40,0.1)", "#dc3a28", "#ff6b5a"],
  "破損あり": ["rgba(220,58,40,0.1)", "#dc3a28", "#ff6b5a"],
};

export function Badge({ children, tone }: BadgeProps) {
  const label = typeof children === "string" ? children : "";
  const config = STATUS_MAP[label] || 
    (tone === "danger" ? STATUS_MAP["延滞"] : tone === "ok" ? STATUS_MAP["完了"] : STATUS_MAP["在庫"]);

  const [bg, fg, dot] = config;

  return (
    <span
      className="inline-flex items-center gap-1.5 h-[22px] px-2.5 rounded-sm font-semibold text-xs whitespace-nowrap border border-transparent"
      style={{ background: bg, color: fg }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />
      {children}
    </span>
  );
}

// Button
export function Btn({ children, onClick, variant = "secondary", icon, size = "md", danger, disabled }: BtnProps & { danger?: boolean }) {
  const pad = size === "sm" ? "px-2.5" : "px-3.5";
  const h = size === "sm" ? "h-[30px]" : "h-[36px]";
  
  const baseStyle = "inline-flex items-center justify-center gap-1.5 font-bold text-xs cursor-pointer whitespace-nowrap rounded-md transition-transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed";
  
  const styles = {
    primary: "bg-blue-600 hover:bg-blue-700 text-white border border-blue-600 shadow-sm",
    secondary: "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200",
    ghost: "bg-transparent text-slate-500 hover:bg-slate-50 border border-transparent",
    danger: "bg-red-50 hover:bg-red-100 text-red-600 border border-red-100",
  };

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`${baseStyle} ${h} ${pad} ${danger ? styles.danger : styles[variant]}`}
    >
      {icon && <span className="material-symbols-outlined text-[16px]">{icon}</span>}
      {children}
    </button>
  );
}

// Panel Card
export function Panel({ title, icon, sub, action, children, style, bodyPad = 16 }: PanelProps) {
  return (
    <div
      className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col min-w-0"
      style={style}
    >
      {title && (
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          {icon && <span className="material-symbols-outlined text-[18px] text-slate-400">{icon}</span>}
          <div className="min-w-0">
            <h3 className="font-bold text-sm text-slate-800 leading-tight">{title}</h3>
            {sub && <p className="text-xs text-slate-400 mt-0.5 leading-tight">{sub}</p>}
          </div>
          <div className="flex-1" />
          {action}
        </div>
      )}
      <div style={{ padding: bodyPad }} className="flex-1 min-h-0">
        {children}
      </div>
    </div>
  );
}

// KPI Dashboard Card
export function KPI({ label, value, delta, icon, accent = "#2563eb", sub }: KPIProps) {
  const up = delta !== undefined && delta > 0;
  const flat = delta === 0 || delta === undefined;

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col justify-between min-w-0 h-[120px]">
      <div className="flex items-center gap-2 mb-2">
        <span
          className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ background: `${accent}15`, color: accent }}
        >
          <span className="material-symbols-outlined text-[16px]">{icon}</span>
        </span>
        <span className="text-xs font-semibold text-slate-500">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-black text-slate-800 tracking-tight font-mono">{value}</span>
        {!flat && (
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-bold ${
              up ? "text-emerald-600" : "text-red-600"
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">
              {up ? "arrow_upward" : "arrow_downward"}
            </span>
            {Math.abs(delta!)}%
          </span>
        )}
      </div>
      {sub && <div className="text-[10px] text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

// Tabs View Header
export function Tabs({ tabs, active, onChange, counts }: TabsProps) {
  return (
    <div className="flex gap-2 border-b border-slate-200 mb-4 overflow-x-auto no-scrollbar">
      {tabs.map((t) => {
        const id = typeof t === "string" ? t : t.id;
        const label = typeof t === "string" ? t : t.label;
        const on = id === active;
        const count = counts ? counts[id] : undefined;

        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`relative py-2.5 px-3.5 text-sm cursor-pointer whitespace-nowrap transition-colors ${
              on ? "text-blue-700 font-bold" : "text-slate-500 hover:text-slate-700 font-medium"
            }`}
          >
            {label}
            {count !== undefined ? <span className="font-mono text-xs font-semibold text-slate-400"> ({count})</span> : ""}
            {on && <span className="absolute left-2 right-2 bottom-0 h-[3px] rounded-t-sm bg-blue-600" />}
          </button>
        );
      })}
    </div>
  );
}

// Generic Data Table
export function Table({ cols, rows, onRow }: TableProps) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse min-w-[500px]">
        <thead>
          <tr className="border-b border-slate-200">
            {cols.map((c, i) => (
              <th
                key={i}
                style={{ textAlign: c.align || "left" }}
                className="text-[10.5px] font-bold tracking-wider text-slate-400 uppercase pb-2 px-3 whitespace-nowrap"
              >
                {c.h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, ri) => (
            <tr
              key={ri}
              onClick={onRow ? () => onRow(r) : undefined}
              className={`transition-colors ${onRow ? "cursor-pointer hover:bg-slate-50" : "hover:bg-slate-50/40"}`}
            >
              {cols.map((c, ci) => (
                <td
                  key={ci}
                  style={{ textAlign: c.align || "left" }}
                  className={`py-3 px-3 text-sm text-slate-700 align-middle ${
                    c.wrap ? "whitespace-normal" : "whitespace-nowrap"
                  }`}
                >
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="text-center py-10 text-slate-400 text-sm font-medium">
          該当するデータがありません
        </div>
      )}
    </div>
  );
}

// Avatar Icon
export function Avatar({ initials, size = 30, color = "#2563eb" }: { initials: string; size?: number; color?: string }) {
  return (
    <span
      className="rounded-full text-white inline-flex items-center justify-center font-bold flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: color,
        fontSize: `${size * 0.42}px`,
      }}
    >
      {initials}
    </span>
  );
}

// Drawer Side Slide Panel
export function Drawer({ open, onClose, title, sub, width = 560, footer, children }: DrawerProps) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[150] bg-slate-900/40 flex justify-end transition-opacity duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width }}
        className="max-w-[94vw] h-full bg-slate-50 flex flex-col shadow-xl animate-[drawerIn_0.22s_cubic-bezier(0.2,0,0,1)]"
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 bg-white flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="font-extrabold text-base text-slate-800 leading-tight">{title}</h2>
            {sub && <p className="text-xs text-slate-400 mt-0.5 leading-tight">{sub}</p>}
          </div>
          <button
            onClick={onClose}
            className="w-[32px] h-[32px] rounded-md border border-slate-200 bg-white text-slate-500 hover:text-slate-700 flex items-center justify-center cursor-pointer active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 min-h-0">
          {children}
        </div>
        {footer && (
          <div className="flex justify-end gap-2.5 px-5 py-3 border-t border-slate-200 bg-white flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// Modal Centered PopUp
export function Modal({ open, onClose, title, width = 440, footer, children }: ModalProps) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[160] bg-slate-900/40 grid place-items-center p-6 transition-opacity duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width }}
        className="max-w-[94vw] max-h-[88vh] overflow-y-auto bg-white rounded-xl shadow-xl flex flex-col animate-[scaleIn_0.18s_ease]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <span className="font-extrabold text-sm text-slate-800 leading-tight">{title}</span>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <div className="p-5 flex-1 min-h-0">
          {children}
        </div>
        {footer && (
          <div className="flex justify-end gap-2.5 px-5 py-3 border-t border-slate-100 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// Form Elements
export function Field({ label, children, required, hint }: FieldProps) {
  return (
    <div className="block mb-4">
      <div className="font-bold text-xs text-slate-500 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </div>
      {children}
      {hint && <div className="text-[10px] text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}

export const inputFieldClass =
  "w-full h-[38px] px-3 border border-slate-300 rounded-md bg-white text-slate-800 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 disabled:bg-slate-50 disabled:text-slate-400";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputFieldClass} ${props.className || ""}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`${inputFieldClass} h-auto py-2.5 px-3 resize-y leading-normal ${props.className || ""}`}
    />
  );
}

interface SelectOption {
  v: string | number;
  l: string;
}

export function SelectInput({
  options,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { options: (string | number | SelectOption)[] }) {
  return (
    <select
      {...props}
      className={`${inputFieldClass} cursor-pointer pr-8 ${props.className || ""}`}
    >
      {options.map((o, i) => {
        const val = typeof o === "object" ? o.v : o;
        const lab = typeof o === "object" ? o.l : String(o);
        return (
          <option key={i} value={val}>
            {lab}
          </option>
        );
      })}
    </select>
  );
}

export function Row({ children, cols = 2 }: { children: ReactNode; cols?: number }) {
  const colClass = {
    1: "grid-cols-1",
    2: "grid-cols-1 md:grid-cols-2",
    3: "grid-cols-1 md:grid-cols-3",
    4: "grid-cols-1 md:grid-cols-4",
  }[cols as 1 | 2 | 3 | 4] || "grid-cols-2";

  return <div className={`grid ${colClass} gap-3`}>{children}</div>;
}

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-6">
      <div className="font-bold text-xs text-slate-400 uppercase mb-3 flex items-center gap-2">
        <span className="w-[3px] h-[13px] rounded-sm bg-blue-600" />
        {title}
      </div>
      {children}
    </div>
  );
}

// Toolbar Filter Row
export function Toolbar({ children, right }: { children?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mb-4 flex-wrap">
      {children}
      <div className="flex-1" />
      {right}
    </div>
  );
}

// Shimmer Loader for Loading Skeletons
export function Shimmer({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 bg-[length:200%_100%] rounded-md ${className || ""}`}
      style={style}
    />
  );
}

// Toast Notification Manager
export function ToastHost() {
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    const onToast = (e: any) => {
      const t = e.detail;
      setItems((x) => [...x, t]);
      setTimeout(() => setItems((x) => x.filter((y) => y.id !== t.id)), 3200);
    };
    window.addEventListener("app-toast", onToast);
    return () => window.removeEventListener("app-toast", onToast);
  }, []);

  const ic = {
    ok: ["check_circle", "text-emerald-500"],
    info: ["info", "text-blue-500"],
    warn: ["warning", "text-amber-500"],
    err: ["cancel", "text-red-500"],
  };

  return (
    <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2.5">
      {items.map((t) => {
        const config = ic[t.type as keyof typeof ic] || ic.ok;
        return (
          <div
            key={t.id}
            className="flex items-center gap-2.5 bg-slate-900 text-white px-4 py-3 rounded-lg shadow-lg min-w-[240px] animate-[slideUp_0.18s_ease]"
          >
            <span className={`material-symbols-outlined ${config[1]} text-[20px]`}>{config[0]}</span>
            <span className="font-semibold text-xs leading-normal">{t.msg}</span>
          </div>
        );
      })}
    </div>
  );
}
