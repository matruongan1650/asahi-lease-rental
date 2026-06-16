import { useState, useEffect, useCallback } from "react";

/**
 * AppDialog — アプリ内の確認・通知ダイアログ。
 * ブラウザ標準の window.confirm / alert（「shuyei.online の内容」表示）を置き換える。
 *
 *   if (await confirmDialog("削除しますか？", { danger: true })) { ... }
 *   await alertDialog("保存しました");
 *
 * <DialogHost /> をアプリのルートに 1 つだけ置く。
 */
type DialogReq = {
  id: number;
  kind: "confirm" | "alert";
  message: string;
  okText?: string;
  cancelText?: string;
  danger?: boolean;
  resolve: (v: boolean) => void;
};

export function confirmDialog(
  message: string,
  opts?: { okText?: string; cancelText?: string; danger?: boolean },
): Promise<boolean> {
  return new Promise((resolve) => {
    window.dispatchEvent(
      new CustomEvent("app-dialog", { detail: { kind: "confirm", message, ...opts, resolve } }),
    );
  });
}

export function alertDialog(message: string, opts?: { okText?: string }): Promise<void> {
  return new Promise((resolve) => {
    window.dispatchEvent(
      new CustomEvent("app-dialog", { detail: { kind: "alert", message, ...opts, resolve: () => resolve() } }),
    );
  });
}

export function DialogHost() {
  const [queue, setQueue] = useState<DialogReq[]>([]);
  const current = queue[0] || null;

  useEffect(() => {
    const onDlg = (e: any) => {
      const d = e.detail || {};
      setQueue((q) => [...q, { id: Date.now() + Math.random(), ...d }]);
    };
    window.addEventListener("app-dialog", onDlg);
    return () => window.removeEventListener("app-dialog", onDlg);
  }, []);

  const close = useCallback((v: boolean) => {
    setQueue((q) => {
      const head = q[0];
      if (head) head.resolve(v);
      return q.slice(1);
    });
  }, []);

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); close(true); }
      else if (e.key === "Escape") { e.preventDefault(); close(current.kind === "alert"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, close]);

  if (!current) return null;

  const isConfirm = current.kind === "confirm";
  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]"
      onClick={() => close(current.kind === "alert")}
    >
      <div
        className="w-full max-w-[380px] rounded-2xl bg-white dark:bg-slate-800 shadow-[0_24px_60px_rgba(15,23,42,0.3)] border border-slate-200 dark:border-slate-700 overflow-hidden animate-[slideUp_0.16s_ease]"
        onClick={(e) => e.stopPropagation()}
        data-theme="light"
      >
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                current.danger ? "bg-red-50 text-red-600" : "bg-[#e8f4f3] text-[#1e8c86]"
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">
                {current.danger ? "warning" : isConfirm ? "help" : "info"}
              </span>
            </div>
            <p className="flex-1 text-[14px] font-bold leading-relaxed text-slate-800 dark:text-slate-100 whitespace-pre-line pt-1.5">
              {current.message}
            </p>
          </div>
        </div>
        <div className="flex gap-2 border-t border-slate-100 dark:border-slate-700 px-4 py-3">
          {isConfirm && (
            <button
              onClick={() => close(false)}
              className="flex-1 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2.5 text-sm font-black text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
            >
              {current.cancelText || "キャンセル"}
            </button>
          )}
          <button
            autoFocus
            onClick={() => close(true)}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-black text-white transition-colors ${
              current.danger ? "bg-red-600 hover:bg-red-700" : "bg-[#1e8c86] hover:bg-[#16726d]"
            }`}
          >
            {current.okText || "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
