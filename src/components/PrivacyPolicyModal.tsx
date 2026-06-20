import React, { useEffect, useRef, useState } from "react";

/**
 * プライバシーポリシー（個人情報保護方針）モーダル。
 *
 * お客様サイトのログイン画面で利用し、「最後まで読んでから同意」を強制する。
 * - 本文を最後までスクロールしないと「同意する」ボタンは押せない。
 * - 同意するとバージョン付きで localStorage に記録し、次回以降は再読込不要。
 *
 * バージョンを更新（ポリシー改定）した場合は、既存の同意は無効となり再同意が必要。
 */
export const PRIVACY_POLICY_VERSION = "2026-06-01";
export const PRIVACY_CONSENT_KEY = "asahi.privacy_consent_v1";

export function hasAgreedToPrivacy(): boolean {
  try {
    return localStorage.getItem(PRIVACY_CONSENT_KEY) === PRIVACY_POLICY_VERSION;
  } catch {
    return false;
  }
}

export function recordPrivacyConsent(): void {
  try {
    localStorage.setItem(PRIVACY_CONSENT_KEY, PRIVACY_POLICY_VERSION);
  } catch {
    /* ignore */
  }
}

export function clearPrivacyConsent(): void {
  try {
    localStorage.removeItem(PRIVACY_CONSENT_KEY);
  } catch {
    /* ignore */
  }
}

function Section({ no, title, children }: { no: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-1.5 text-sm font-bold text-slate-900 dark:text-white">
        {no}. {title}
      </h3>
      <div className="text-xs leading-relaxed text-slate-600 dark:text-slate-300 space-y-1.5">{children}</div>
    </section>
  );
}

/**
 * @param open       表示状態
 * @param onClose    閉じる（×・背景タップ）
 * @param onAgree    「同意する」押下（最後まで読んだ後のみ活性）。省略時は閲覧のみ。
 */
export function PrivacyPolicyModal({
  open,
  onClose,
  onAgree,
}: {
  open: boolean;
  onClose: () => void;
  onAgree?: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [reachedEnd, setReachedEnd] = useState(false);

  // 開くたびに読了状態をリセットし、本文がそもそもスクロール不要な短さなら即時に読了扱い。
  useEffect(() => {
    if (!open) return;
    setReachedEnd(false);
    const el = bodyRef.current;
    if (!el) return;
    // レイアウト確定後に判定
    const id = window.setTimeout(() => {
      if (el.scrollHeight - el.clientHeight <= 8) setReachedEnd(true);
    }, 60);
    return () => window.clearTimeout(id);
  }, [open]);

  if (!open) return null;

  const handleScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= 24) setReachedEnd(true);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="プライバシーポリシー"
    >
      <div
        className="flex w-full max-w-[480px] max-h-[88vh] flex-col rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl animate-[sheetUp_0.25s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-5 py-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">プライバシーポリシー</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="閉じる"
          >
            <span className="material-symbols-outlined text-[22px]">close</span>
          </button>
        </div>

        {/* 本文（スクロール領域） */}
        <div
          ref={bodyRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-5 py-4"
        >
          <p className="mb-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            アサヒリース株式会社（以下「当社」）は、建設機材・保安用品のレンタル及び販売に関するサービス（以下「本サービス」）の提供にあたり、お客様の個人情報を以下のとおり適切に取り扱います。本サービスをご利用いただく前に、本ポリシーを最後までお読みください。
          </p>

          <Section no="1" title="事業者情報">
            <p>アサヒリース株式会社</p>
            <p>本ポリシーに関するお問い合わせ先は、第9項に記載の窓口までご連絡ください。</p>
          </Section>

          <Section no="2" title="取得する個人情報">
            <p>当社は、本サービスの提供に必要な範囲で、以下の情報を取得します。</p>
            <p>・氏名、会社名、部署名、役職、担当者名</p>
            <p>・メールアドレス、電話番号、住所、現場所在地</p>
            <p>・ご注文・レンタル・返却・請求に関する情報（数量、金額、期間、工事番号等）</p>
            <p>・ログインID、認証情報、操作・利用履歴</p>
            <p>・お問い合わせ内容、返却商品の状態を示す写真等</p>
          </Section>

          <Section no="3" title="利用目的">
            <p>取得した個人情報は、次の目的の達成に必要な範囲でのみ利用します。</p>
            <p>・本サービスのアカウント認証および提供</p>
            <p>・商品のレンタル・販売・配送・回収・返却・検品の手配および管理</p>
            <p>・見積、請求、入金管理その他の取引遂行</p>
            <p>・お問い合わせ対応、重要なお知らせの通知</p>
            <p>・サービスの維持、改善および不正利用の防止</p>
            <p>・法令に基づく対応</p>
          </Section>

          <Section no="4" title="第三者提供">
            <p>当社は、次の場合を除き、ご本人の同意なく個人情報を第三者に提供しません。</p>
            <p>・法令に基づく場合</p>
            <p>・人の生命、身体または財産の保護のために必要で、本人の同意取得が困難な場合</p>
            <p>・配送・回収等の履行に必要な範囲で運送・委託事業者に提供する場合</p>
          </Section>

          <Section no="5" title="業務の委託">
            <p>当社は、利用目的の達成に必要な範囲で個人情報の取扱いを外部に委託することがあります。この場合、委託先に対して適切な監督を行います。</p>
          </Section>

          <Section no="6" title="安全管理措置">
            <p>当社は、個人情報の漏えい、滅失またはき損の防止その他の安全管理のために、必要かつ適切な措置を講じます。通信は暗号化により保護し、アクセス権限を適切に管理します。</p>
          </Section>

          <Section no="7" title="Cookie・利用情報の取得">
            <p>本サービスでは、ログイン状態の保持や利便性向上のため、ブラウザのローカルストレージ等を利用します。これらは個人を直接特定するために第三者へ提供されることはありません。</p>
          </Section>

          <Section no="8" title="開示・訂正・利用停止等">
            <p>ご本人からの保有個人データの開示、内容の訂正・追加・削除、利用停止・消去等のご請求に対し、当社は法令に従い適切に対応します。お問い合わせ窓口までご連絡ください。</p>
          </Section>

          <Section no="9" title="お問い合わせ窓口">
            <p>本ポリシーおよび個人情報の取扱いに関するお問い合わせは、アサヒリース株式会社の担当者までご連絡ください。</p>
          </Section>

          <Section no="10" title="本ポリシーの改定">
            <p>当社は、法令の変更や運用の見直しに応じて本ポリシーを改定することがあります。重要な変更がある場合は、本サービス上で通知し、改めて同意をお願いすることがあります。</p>
            <p className="pt-1 text-[11px] text-slate-400">制定日：{PRIVACY_POLICY_VERSION}</p>
          </Section>

          <div className="h-2" />
        </div>

        {/* フッター */}
        {onAgree ? (
          <div className="border-t border-slate-200 dark:border-slate-700 px-5 py-4">
            {!reachedEnd && (
              <p className="mb-2 flex items-center justify-center gap-1 text-[11px] font-bold text-slate-400">
                <span className="material-symbols-outlined text-[15px]">arrow_downward</span>
                最後までお読みいただくと同意できます
              </p>
            )}
            <button
              type="button"
              disabled={!reachedEnd}
              onClick={() => {
                onAgree();
                onClose();
              }}
              className={`w-full rounded-xl py-3.5 text-sm font-bold text-white transition-colors ${
                reachedEnd ? "bg-primary hover:bg-primary/90" : "cursor-not-allowed bg-slate-300 dark:bg-slate-700"
              }`}
            >
              同意する
            </button>
          </div>
        ) : (
          <div className="border-t border-slate-200 dark:border-slate-700 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl bg-slate-100 dark:bg-slate-800 py-3.5 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              閉じる
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default PrivacyPolicyModal;
