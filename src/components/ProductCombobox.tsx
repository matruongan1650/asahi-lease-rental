import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getItemUnit } from "../utils/productUtils";

/**
 * ProductCombobox — 商品を「入力して検索 ＋ 一覧から選択」できるコンボボックス。
 * - 入力すると商品名で絞り込み、候補をクリックで選択（onPick）。
 * - onChange を渡すと自由入力も確定する（注文編集の任意品名向け）。未指定なら選択専用
 *   （フォーカスを外すと未選択の入力は value に戻す）。
 * - 候補リストは document.body へ Portal して position:fixed で表示する。
 *   モーダル本体(overflow-y-auto)やテーブル(overflow-x-auto)・カード(overflow-hidden)など
 *   の親に切り取られない（以前は候補が下端で見切れて選べない不具合があった）。
 */
interface Props {
  products: any[];
  value: string;                       // 表示中のテキスト（選択済み商品名など）
  onPick: (product: any) => void;      // 候補を選択したとき
  onChange?: (text: string) => void;   // 自由入力を確定（任意品名を許可する場合）
  placeholder?: string;
  className?: string;
}

const PANEL_MAX_H = 224; // max-h-56 (14rem)

export default function ProductCombobox({ products, value, onPick, onChange, placeholder, className }: Props) {
  const [text, setText] = useState(value || "");
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ left: number; top: number; bottom: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 外部 value が変わったら同期（別行の選択や初期化を反映）。
  useEffect(() => { setText(value || ""); }, [value]);

  const filtered = useMemo(() => {
    const q = String(text || "").trim().toLowerCase();
    const list = (products || []).filter((p: any) => p && p.name);
    if (!q) return list.slice(0, 50);
    return list.filter((p: any) => String(p.name).toLowerCase().includes(q)).slice(0, 50);
  }, [products, text]);

  const updateRect = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ left: r.left, top: r.top, bottom: r.bottom, width: r.width });
  }, []);

  // 開いている間は、親要素のスクロールやリサイズで候補位置を追従させる（capture でどの祖先のスクロールも拾う）。
  useEffect(() => {
    if (!open) return;
    updateRect();
    const onMove = () => updateRect();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, updateRect]);

  const base = "w-full border border-slate-300 bg-white rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

  // 下に収まらず上に余裕があるなら上方向に開く。
  const openUp = !!rect && rect.bottom + 4 + PANEL_MAX_H > window.innerHeight && rect.top - 4 - PANEL_MAX_H > 0;
  const panelStyle: React.CSSProperties = rect
    ? {
        position: "fixed",
        left: rect.left,
        width: rect.width,
        zIndex: 200, // モーダル(z-[120]/z-[160])より上
        ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      }
    : { display: "none" };

  return (
    <div>
      <input
        ref={inputRef}
        value={text}
        placeholder={placeholder || "商品名で検索 / 選択"}
        className={className || base}
        onFocus={() => { setOpen(true); updateRect(); }}
        onChange={(e) => { setText(e.target.value); onChange?.(e.target.value); setOpen(true); }}
        onBlur={() => {
          // 候補クリック(onMouseDown)を拾えるよう遅延。選択専用(onChange無し)で未選択なら value へ戻す。
          setTimeout(() => {
            setOpen(false);
            if (!onChange) setText(value || "");
          }, 160);
        }}
      />
      {open && rect && createPortal(
        <div style={panelStyle} className="max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-400">該当する商品がありません</div>
          ) : (
            filtered.map((p: any) => (
              <button
                key={p.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setText(p.name); onPick(p); setOpen(false); }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-blue-50"
              >
                <span className="truncate font-medium text-slate-800">{p.name}</span>
                <span className="shrink-0 text-[11px] text-slate-400">
                  {Number(p.rentPrice) > 0 ? `¥${Number(p.rentPrice).toLocaleString()}/日` : ""}
                  {Number(p.rentPrice) > 0 ? `・${getItemUnit(p)}` : getItemUnit(p)}
                </span>
              </button>
            ))
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
