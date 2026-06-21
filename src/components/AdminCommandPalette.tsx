import React, { useEffect, useMemo, useRef, useState } from "react";
import { AdminTab, menuGroups } from "./AdminSidebar";

interface AdminCommandPaletteProps {
  open: boolean;
  onClose: () => void;
  /** 許可タブのみ表示する（AdminDashboard の権限と一致）。未指定なら全タブ。 */
  allowedTabs?: Set<AdminTab>;
  /** 決定時の遷移。AdminDashboard の setActiveTab を渡す。 */
  onNavigate: (tab: AdminTab) => void;
}

type PaletteItem = { id: AdminTab; label: string; icon: string; group: string };

// コマンドパレット(#13): ⌘K/Ctrl+K で全管理タブへ素早くジャンプする。
// 見た目は AdminUI のトーン（角丸 / 影 / #fff8e7 アクセント）に合わせた軽量オーバーレイ。
export default function AdminCommandPalette({ open, onClose, allowedTabs, onNavigate }: AdminCommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // メニュー定義（単一情報源）を平坦化し、許可タブのみ残す。
  const allItems = useMemo<PaletteItem[]>(() => {
    const items: PaletteItem[] = [];
    menuGroups.forEach((g) => {
      g.items.forEach((it) => {
        if (allowedTabs && !allowedTabs.has(it.id)) return;
        items.push({ id: it.id, label: it.label, icon: it.icon, group: g.title });
      });
    });
    return items;
  }, [allowedTabs]);

  // インクリメンタル絞り込み（label / id を大文字小文字無視で部分一致）。
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((it) => it.label.toLowerCase().includes(q) || it.id.toLowerCase().includes(q));
  }, [allItems, query]);

  // 開いたら入力へフォーカスし、検索語・選択をリセットする。
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  // 絞り込み結果が変わったら選択を先頭へ戻す（範囲外を選ばない）。
  useEffect(() => {
    setActive(0);
  }, [query]);

  // 選択中の項目が常に見えるようスクロール追従。
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const choose = (item: PaletteItem | undefined) => {
    if (!item) return;
    onNavigate(item.id);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (filtered.length === 0 ? 0 : (i + 1) % filtered.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(filtered[active]);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[170] bg-[#173b38]/45 flex justify-center items-start pt-[12vh] px-6 transition-opacity duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        className="w-[560px] max-w-[94vw] max-h-[72vh] overflow-hidden bg-white rounded-lg shadow-[0_12px_48px_rgba(23,59,56,0.24)] border border-[#cfe6e3] flex flex-col animate-[scaleIn_0.18s_ease]"
      >
        {/* 検索入力 */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#e0f0ee] bg-[#fffdf6]">
          <span className="material-symbols-outlined text-[20px] text-[#1e8c86]">search</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="画面を検索…（label / id）"
            className="flex-1 bg-transparent outline-none text-sm font-semibold text-[#173b38] placeholder:text-[#9ec3bf]"
          />
          <span className="text-[10px] font-black text-[#7ca39f] border border-[#cfe6e3] rounded px-1.5 py-0.5 bg-white">ESC</span>
        </div>

        {/* 候補一覧 */}
        <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto py-1.5 admin-scrollbar">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-[#7ca39f] text-sm font-semibold">該当する画面がありません</div>
          ) : (
            filtered.map((item, i) => {
              const on = i === active;
              return (
                <button
                  key={item.id}
                  data-idx={i}
                  onClick={() => choose(item)}
                  onMouseMove={() => setActive(i)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors ${
                    on ? "bg-[#fff8e7] text-[#173b38]" : "text-[#46706c] hover:bg-[#f7fbfa]"
                  }`}
                >
                  <span
                    className={`material-symbols-outlined text-[19px] ${on ? "text-[#1e8c86]" : "text-[#8fbcb7]"}`}
                  >
                    {item.icon}
                  </span>
                  <span className={`text-sm ${on ? "font-black" : "font-semibold"}`}>{item.label}</span>
                  <span className="ml-auto text-[10px] font-bold text-[#9ec3bf] tracking-wide">{item.group}</span>
                </button>
              );
            })
          )}
        </div>

        {/* フッタ操作ヒント */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-[#e0f0ee] bg-[#fffdf6] text-[10px] font-bold text-[#7ca39f]">
          <span className="inline-flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">keyboard_arrow_up</span>
            <span className="material-symbols-outlined text-[14px]">keyboard_arrow_down</span>
            選択
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">keyboard_return</span>
            移動
          </span>
        </div>
      </div>
    </div>
  );
}
