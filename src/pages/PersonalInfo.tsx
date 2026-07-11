import React, { useState, useRef } from "react";
import { alertDialog } from "../components/AppDialog";
import { useNavigate } from "react-router-dom";
import OrderBus from "../lib/orderBus";
import { useUser } from "../context/UserContext";
import { useIsDesktop } from "../hooks/useIsDesktop";
import PersonalInfoDesktop from "./desktop/PersonalInfoDesktop";

export default function PersonalInfo() {
  return useIsDesktop() ? <PersonalInfoDesktop /> : <PersonalInfoMobile />;
}

function PersonalInfoMobile() {
  const navigate = useNavigate();
  const { profile, updateUser, isEmailTaken } = useUser();
  const [formData, setFormData] = useState(profile);
  const [isSaving, setIsSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, avatarUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  // 会社担当者(customer_staff)は会社名を変更できない（会社マスタの共有項目を個人が書き換えて
  // 会社グループが壊れるのを防ぐ）。会社情報の変更は会社代表(customer)または管理者のみ。
  const isSubUser = profile.role === "customer_staff";

  const handleSave = async () => {
    const email = (formData.email || "").trim();
    // 必須・形式・重複チェック（重複メールにすると login が fail-closed で自分がログイン不能になるため必須）。
    if (!(formData.lastName || "").trim() || !(formData.firstName || "").trim()) {
      void alertDialog("姓・名を入力してください。");
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      void alertDialog("メールアドレスの形式が正しくありません。");
      return;
    }
    if (isEmailTaken(email, profile.id)) {
      void alertDialog("このメールアドレスは既に使われています。別のアドレスを入力してください。");
      return;
    }
    setIsSaving(true);
    // 画面で編集できるフィールドのみ差分パッチする。formData はマウント時スナップショットのため、
    // レコード全体を書き戻すと編集中に admin が行ったパスワード再設定・停止(status)まで巻き戻して
    // しまう(C20)。updateUser は OrderBus.patch なので 409 再ベースも編集フィールド単位で効く。
    updateUser(profile.id, {
      lastName: formData.lastName || "",
      firstName: formData.firstName || "",
      email,
      phone: formData.phone || "",
      address: formData.address || "",
      avatarUrl: formData.avatarUrl || "",
      ...(isSubUser ? {} : { companyName: formData.companyName || "" }),
    });
    // クラウド同期の確定を待ち、成功/送信待ちを明示する（失敗を成功と誤認させない）。
    const ok = await OrderBus.flush(8000);
    setIsSaving(false);
    void alertDialog(ok ? "保存しました。" : "保存しましたが、通信が不安定なため同期待ちです。電波の良い場所で自動的に再送信されます。");
    navigate(-1);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark max-w-[480px] mx-auto text-slate-900 dark:text-white pb-[80px]">
      <header className="sticky top-0 z-50 flex items-center justify-between p-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <span className="material-symbols-outlined text-[24px]">arrow_back</span>
        </button>
        <h1 className="text-lg font-bold">個人情報</h1>
        <div className="w-10"></div>
      </header>

      <main className="p-4 flex flex-col gap-4">
        <div className="flex flex-col items-center mb-6 mt-4">
          <div className="relative mb-3 group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <div className="bg-center bg-no-repeat bg-cover rounded-full h-24 w-24 border-4 border-white dark:border-slate-800 shadow-lg" style={{ backgroundImage: `url("${formData.avatarUrl}")`}}></div>
            <button className="absolute bottom-0 right-0 p-1.5 bg-primary rounded-full text-white shadow-md hover:bg-primary/90 transition-colors">
              <span className="material-symbols-outlined text-[14px] block">photo_camera</span>
            </button>
            <input 
              type="file" 
              accept="image/*" 
              capture="user"
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleImageChange} 
            />
          </div>
          <span className="text-xs text-primary font-bold">写真を変更</span>
        </div>

        <div className="flex flex-col gap-4 bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">会社名</label>
            <input
              name="companyName"
              value={formData.companyName}
              onChange={handleChange}
              readOnly={isSubUser}
              className={`w-full border border-slate-200 dark:border-slate-700 rounded-lg h-12 px-4 shadow-sm outline-none focus:ring-2 focus:ring-primary/20 ${isSubUser ? "bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-not-allowed" : "bg-slate-50 dark:bg-slate-900"}`}
            />
            {isSubUser && (
              <p className="mt-1 text-[11px] text-slate-400">会社名の変更は会社のご担当責任者または管理者へご依頼ください。</p>
            )}
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-500 mb-1">姓</label>
              <input 
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg h-12 px-4 shadow-sm outline-none focus:ring-2 focus:ring-primary/20" 
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-500 mb-1">名</label>
              <input 
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg h-12 px-4 shadow-sm outline-none focus:ring-2 focus:ring-primary/20" 
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">メールアドレス</label>
            <input 
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg h-12 px-4 shadow-sm outline-none focus:ring-2 focus:ring-primary/20" 
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">電話番号</label>
            <input 
              name="phone"
              type="tel"
              value={formData.phone}
              onChange={handleChange}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg h-12 px-4 shadow-sm outline-none focus:ring-2 focus:ring-primary/20" 
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">住所（納品・回収場所）</label>
            <input 
              name="address"
              value={formData.address}
              onChange={handleChange}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg h-12 px-4 shadow-sm outline-none focus:ring-2 focus:ring-primary/20" 
            />
          </div>
        </div>
        
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="mt-4 bg-primary text-white h-12 rounded-xl font-bold hover:bg-primary/90 active:scale-[0.98] transition-transform shadow-md disabled:opacity-60"
        >
          {isSaving ? "保存中…" : "保存する"}
        </button>
      </main>
    </div>
  );
}
