import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * アプリ全体を保護するエラーバウンダリ。
 * レンダリングや useEffect で未捕捉の例外が発生しても、
 * 画面が真っ白になる代わりにフォールバック UI を表示する。
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] 未捕捉のエラーを検知しました:", error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const isQuota =
        this.state.error?.name === "QuotaExceededError" ||
        /quota/i.test(this.state.error?.message || "");

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-lg p-8 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center">
              <span className="material-symbols-outlined text-[28px] text-red-500">error</span>
            </div>
            <h1 className="text-lg font-bold text-slate-800 mb-2">
              予期しないエラーが発生しました
            </h1>
            <p className="text-sm text-slate-500 leading-relaxed mb-6">
              {isQuota
                ? "ブラウザの保存容量が上限に達しています。古い注文データなどを整理してから再度お試しください。"
                : "画面の表示中に問題が発生しました。ページを再読み込みしてください。"}
            </p>
            <button
              onClick={this.handleReload}
              className="px-6 py-3 text-sm font-bold text-white bg-[#1a1c9a] hover:bg-blue-800 rounded-xl shadow-sm transition-colors"
            >
              再読み込み
            </button>
            {this.state.error && (
              <p className="mt-4 text-[11px] text-slate-400 font-mono break-all">
                {this.state.error.name}: {this.state.error.message}
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
