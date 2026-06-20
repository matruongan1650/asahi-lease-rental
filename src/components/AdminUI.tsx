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
  "進行中": ["#e8f6f5", "#1e8c86", "#2ba8a2"],
  "レンタル中": ["#e8f6f5", "#1e8c86", "#2ba8a2"],
  "完了": ["rgba(39,174,96,0.12)", "#1f8f50", "#27ae60"],
  "一致": ["rgba(39,174,96,0.12)", "#1f8f50", "#27ae60"],
  "正常": ["rgba(39,174,96,0.12)", "#1f8f50", "#27ae60"],
  "確認済": ["rgba(39,174,96,0.12)", "#1f8f50", "#27ae60"],
  "取引中": ["rgba(39,174,96,0.12)", "#1f8f50", "#27ae60"],
  "使用中": ["#e8f6f5", "#1e8c86", "#2ba8a2"],
  "空車": ["rgba(93,173,226,0.14)", "#2f79a8", "#5dade2"],
  "在庫": ["#fff8e7", "#5f5a42", "#ffd23f"],
  "要補充": ["rgba(255,210,63,0.22)", "#8a6a00", "#ffd23f"],
  "在庫なし": ["rgba(239,108,74,0.14)", "#d45233", "#ef6c4a"],
  "高稼働": ["#e8f6f5", "#1e8c86", "#2ba8a2"],
  "請求済": ["rgba(93,173,226,0.14)", "#2f79a8", "#5dade2"],
  "予定": ["rgba(255,210,63,0.22)", "#8a6a00", "#ffd23f"],
  "修理待ち": ["rgba(255,210,63,0.22)", "#8a6a00", "#ffd23f"],
  "メンテナンス中": ["rgba(255,210,63,0.22)", "#8a6a00", "#ffd23f"],
  "整備中": ["rgba(255,210,63,0.22)", "#8a6a00", "#ffd23f"],
  "修理中": ["rgba(93,173,226,0.14)", "#2f79a8", "#5dade2"],
  "修正中": ["rgba(255,210,63,0.22)", "#8a6a00", "#ffd23f"],
  "要確認": ["rgba(255,210,63,0.22)", "#8a6a00", "#ffd23f"],
  "差異あり": ["rgba(255,210,63,0.22)", "#8a6a00", "#ffd23f"],
  "延滞": ["rgba(239,108,74,0.14)", "#d45233", "#ef6c4a"],
  "超過": ["rgba(239,108,74,0.14)", "#d45233", "#ef6c4a"],
  "破損あり": ["rgba(239,108,74,0.14)", "#d45233", "#ef6c4a"],
};

export function Badge({ children, tone }: BadgeProps) {
  const label = typeof children === "string" ? children : "";
  const config = STATUS_MAP[label] || 
    (tone === "danger" ? STATUS_MAP["延滞"] : tone === "warning" ? STATUS_MAP["要確認"] : tone === "ok" ? STATUS_MAP["完了"] : STATUS_MAP["在庫"]);

  const [bg, fg, dot] = config;

  return (
    <span
      className="inline-flex items-center gap-1.5 h-[25px] px-2.5 rounded-full font-black text-xs whitespace-nowrap border border-white/70"
      style={{ background: bg, color: fg }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />
      {children}
    </span>
  );
}

// Button
export function Btn({ children, onClick, variant = "secondary", icon, size = "md", danger, disabled }: BtnProps & { danger?: boolean }) {
  const pad = size === "sm" ? "px-3" : "px-4";
  const h = size === "sm" ? "h-[31px]" : "h-[37px]";
  
  const baseStyle = "inline-flex items-center justify-center gap-1.5 font-black text-xs cursor-pointer whitespace-nowrap rounded-full transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed";
  
  const styles = {
    primary: "bg-[#ffd23f] hover:bg-[#ffe47a] text-[#173b38] border border-[#e6b800] shadow-[0_4px_16px_rgba(255,210,63,0.28)]",
    secondary: "bg-white hover:bg-[#fff8e7] text-[#1e8c86] border border-[#b5dad6] shadow-[0_2px_10px_rgba(43,168,162,0.08)]",
    ghost: "bg-transparent text-[#46706c] hover:bg-[#e8f6f5] border border-transparent",
    danger: "bg-[rgba(239,108,74,0.12)] hover:bg-[rgba(239,108,74,0.18)] text-[#d45233] border border-[rgba(239,108,74,0.24)]",
  };

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`${baseStyle} ${h} ${pad} ${danger ? styles.danger : styles[variant]}`}
    >
      {icon && <span className="material-symbols-outlined text-[16px] leading-none">{icon}</span>}
      {children}
    </button>
  );
}

// Panel Card
export function Panel({ title, icon, sub, action, children, style, bodyPad = 16 }: PanelProps) {
  return (
    <div
      className="admin-panel relative bg-white border border-[#cfe6e3] rounded-lg shadow-[0_4px_20px_rgba(43,168,162,0.10)] flex flex-col min-w-0 overflow-hidden"
      style={style}
    >
      <span className="absolute left-0 top-0 bottom-0 w-1 bg-[#2ba8a2]" />
      {title && (
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#e0f0ee] bg-[#fff8e7]/65">
          {icon && (
            <span className="w-8 h-8 rounded-lg bg-white border border-[#b5dad6] text-[#1e8c86] flex items-center justify-center material-symbols-outlined text-[18px] shadow-[0_2px_8px_rgba(43,168,162,0.08)]">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h3 className="font-black text-sm text-[#173b38] leading-tight">{title}</h3>
            {sub && <p className="text-xs text-[#7ca39f] mt-0.5 leading-tight">{sub}</p>}
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
export function KPI({ label, value, delta, icon, accent = "#2BA8A2", sub }: KPIProps) {
  const up = delta !== undefined && delta > 0;
  const flat = delta === 0 || delta === undefined;

  return (
    <div className="relative bg-white border border-[#cfe6e3] rounded-lg shadow-[0_4px_20px_rgba(43,168,162,0.10)] p-4 flex flex-col justify-between min-w-0 h-[118px] overflow-hidden">
      <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: accent }} />
      <div className="flex items-center gap-2 mb-2">
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${accent}15`, color: accent }}
        >
          <span className="material-symbols-outlined text-[16px]">{icon}</span>
        </span>
        <span className="text-xs font-black text-[#46706c]">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-black text-[#173b38] tracking-tight font-mono">{value}</span>
        {!flat && (
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-bold ${
              up ? "text-[#1f8f50]" : "text-[#d45233]"
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">
              {up ? "arrow_upward" : "arrow_downward"}
            </span>
            {Math.abs(delta!)}%
          </span>
        )}
      </div>
      {sub && <div className="text-[10px] text-[#7ca39f] mt-1">{sub}</div>}
    </div>
  );
}

// Tabs View Header
export function Tabs({ tabs, active, onChange, counts }: TabsProps) {
  return (
    <div className="flex gap-1.5 border border-[#cfe6e3] bg-[#fffdf6] rounded-lg p-1 mb-4 overflow-x-auto no-scrollbar shadow-[0_2px_12px_rgba(43,168,162,0.06)]">
      {tabs.map((t) => {
        const id = typeof t === "string" ? t : t.id;
        const label = typeof t === "string" ? t : t.label;
        const on = id === active;
        const count = counts ? counts[id] : undefined;

        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`relative h-[34px] px-3.5 text-sm cursor-pointer whitespace-nowrap transition-all rounded-md ${
              on ? "text-[#173b38] font-black bg-[#ffd23f] shadow-[0_3px_12px_rgba(255,210,63,0.25)]" : "text-[#46706c] hover:text-[#173b38] hover:bg-[#e8f6f5] font-bold"
            }`}
          >
            {label}
            {count !== undefined ? <span className={`font-mono text-xs font-semibold ${on ? "text-[#6a5200]" : "text-[#7ca39f]"}`}> ({count})</span> : ""}
          </button>
        );
      })}
    </div>
  );
}

// Generic Data Table
export function Table({ cols, rows, onRow }: TableProps) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-[#cfe6e3] bg-white shadow-[0_2px_12px_rgba(43,168,162,0.05)]">
      <table className="w-full border-collapse min-w-[500px]">
        <thead className="bg-[#fff8e7]">
          <tr className="border-b border-[#eadfb6]">
            {cols.map((c, i) => (
              <th
                key={i}
                style={{ textAlign: c.align || "left" }}
                className="text-[10.5px] font-black tracking-wider text-[#5f5a42] uppercase py-2.5 px-3 whitespace-nowrap"
              >
                {c.h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e0f0ee] bg-white">
          {rows.map((r, ri) => (
            <tr
              key={ri}
              onClick={onRow ? () => onRow(r) : undefined}
              className={`transition-colors ${onRow ? "cursor-pointer hover:bg-[#e8f6f5]/70" : "hover:bg-[#f7fbfa]"}`}
            >
              {cols.map((c, ci) => (
                <td
                  key={ci}
                  style={{ textAlign: c.align || "left" }}
                  className={`py-3 px-3 text-sm text-[#334f4c] align-middle ${
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
        <div className="text-center py-10 text-[#7ca39f] text-sm font-semibold">
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
      className="rounded-lg text-white inline-flex items-center justify-center font-black flex-shrink-0 shadow-[0_4px_14px_rgba(43,168,162,0.18)]"
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
      className="fixed inset-0 z-[150] bg-[#173b38]/45 flex justify-end transition-opacity duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width }}
        className="max-w-[94vw] h-full bg-[#eff8f7] flex flex-col shadow-[0_12px_48px_rgba(23,59,56,0.28)] animate-[drawerIn_0.22s_cubic-bezier(0.2,0,0,1)]"
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#cfe6e3] bg-[#fffdf6] flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-base text-[#173b38] leading-tight">{title}</h2>
            {sub && <p className="text-xs text-[#7ca39f] mt-0.5 leading-tight">{sub}</p>}
          </div>
          <button
            onClick={onClose}
            className="w-[34px] h-[34px] rounded-lg border border-[#cfe6e3] bg-white text-[#46706c] hover:text-[#173b38] hover:bg-[#fff8e7] flex items-center justify-center cursor-pointer active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 min-h-0">
          {children}
        </div>
        {footer && (
          <div className="flex justify-end gap-2.5 px-5 py-3 border-t border-[#cfe6e3] bg-[#fffdf6] flex-shrink-0">
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
      className="fixed inset-0 z-[160] bg-[#173b38]/45 grid place-items-center p-6 transition-opacity duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width }}
        className="max-w-[94vw] max-h-[88vh] overflow-hidden bg-white rounded-lg shadow-[0_12px_48px_rgba(23,59,56,0.24)] border border-[#cfe6e3] flex flex-col animate-[scaleIn_0.18s_ease]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e0f0ee] bg-[#fffdf6] flex-shrink-0">
          <span className="font-black text-sm text-[#173b38] leading-tight">{title}</span>
          <button
            onClick={onClose}
            className="text-[#7ca39f] hover:text-[#173b38] flex items-center justify-center cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <div className="p-5 flex-1 min-h-0 overflow-y-auto">
          {children}
        </div>
        {footer && (
          <div className="flex justify-end gap-2.5 px-5 py-3 border-t border-[#e0f0ee] bg-[#fffdf6] flex-shrink-0">
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
      <div className="font-black text-xs text-[#46706c] mb-1.5">
        {label}
        {required && <span className="text-[#ef6c4a] ml-1">*</span>}
      </div>
      {children}
      {hint && <div className="text-[10px] text-[#7ca39f] mt-1">{hint}</div>}
    </div>
  );
}

export const inputFieldClass =
  "w-full h-[38px] px-3 border border-[#b5dad6] rounded-lg bg-[#fff8e7] text-[#173b38] text-sm outline-none focus:border-[#2ba8a2] focus:ring-2 focus:ring-[#2ba8a2]/15 disabled:bg-[#f4f7f6] disabled:text-[#8fbcb7]";

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
      <div className="font-black text-xs text-[#46706c] uppercase mb-3 pb-2 flex items-center gap-2 border-b border-dashed border-[#b5dad6]">
        <span className="w-[3px] h-[13px] rounded-sm bg-[#2ba8a2]" />
        {title}
      </div>
      {children}
    </div>
  );
}

// Toolbar Filter Row
export function Toolbar({ children, right }: { children?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mb-4 flex-wrap rounded-lg border border-[#cfe6e3] bg-[#fffdf6] px-3 py-2 shadow-[0_2px_12px_rgba(43,168,162,0.06)]">
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
      className={`animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-[#d2e8e6] via-[#eff8f7] to-[#d2e8e6] bg-[length:200%_100%] rounded-md ${className || ""}`}
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
    ok: ["check_circle", "text-[#27ae60]"],
    info: ["info", "text-[#5dade2]"],
    warn: ["warning", "text-[#ffd23f]"],
    err: ["cancel", "text-[#ef6c4a]"],
  };

  return (
    <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2.5">
      {items.map((t) => {
        const config = ic[t.type as keyof typeof ic] || ic.ok;
        return (
          <div
            key={t.id}
            className="flex items-center gap-2.5 bg-[#173b38] text-white px-4 py-3 rounded-lg shadow-[0_8px_28px_rgba(23,59,56,0.26)] min-w-[240px] animate-[slideUp_0.18s_ease]"
          >
            <span className={`material-symbols-outlined ${config[1]} text-[20px]`}>{config[0]}</span>
            <span className="font-semibold text-xs leading-normal">{t.msg}</span>
          </div>
        );
      })}
    </div>
  );
}
