/**
 * numberInputWheelGuard — type="number" の入力上でマウスホイールを回すと、
 * 値が誤って増減し、かつページがスクロールしない（ホイールが入力に吸われる）問題を防ぐ。
 *
 * フォーカス中の数値入力にホイールが来たら blur してブラウザのスピン挙動を無効化する。
 * これにより値は変わらず、ページ（モーダル）が通常どおりスクロールする。
 * passive リスナーなのでスクロール自体はブロックしない。アプリ起動時に一度だけ登録する。
 */
let _installed = false;

export function installNumberInputWheelGuard(): void {
  if (_installed || typeof document === "undefined") return;
  _installed = true;
  document.addEventListener(
    "wheel",
    () => {
      const el = document.activeElement as HTMLInputElement | null;
      if (el && el.tagName === "INPUT" && el.type === "number") {
        el.blur();
      }
    },
    { passive: true },
  );
}
