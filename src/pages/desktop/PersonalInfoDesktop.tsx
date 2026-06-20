import React, { useState, useRef } from "react";
import { alertDialog } from "../../components/AppDialog";
import { Link, useNavigate } from "react-router-dom";
import { useUser } from "../../context/UserContext";

/** PC 用 個人情報編集（お客様デスクトップサイト）。モバイル PersonalInfo と同じ保存処理・権限ロジックを再利用。 */
export default function PersonalInfoDesktop() {
  const navigate = useNavigate();
  const { profile, setProfile } = useUser();
  const [formData, setFormData] = useState(profile);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData((prev) => ({ ...prev, avatarUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  // 会社担当者(customer_staff)は会社名を変更できない（会社マスタの共有項目を個人が書き換えて
  // 会社グループが壊れるのを防ぐ）。会社情報の変更は会社代表(customer)または管理者のみ。
  const isSubUser = profile.role === "customer_staff";

  const handleSave = () => {
    setProfile({
      ...formData,
      companyName: isSubUser ? profile.companyName : formData.companyName,
    });
    void alertDialog("保存しました。");
    navigate(-1);
  };

  const inputClass =
    "w-full bg-slate-50 border border-slate-200 rounded-xl h-12 px-4 shadow-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors";

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <nav className="text-xs font-bold text-slate-400 mb-1">
        <Link to="/" className="hover:text-primary">
          ホーム
        </Link>{" "}
        <span className="mx-1">/</span> 個人情報
      </nav>
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">個人情報</h1>
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-primary transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>戻る
        </button>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-8">
        {/* Avatar / photo upload */}
        <div className="flex items-center gap-6 pb-6 mb-6 border-b border-slate-100">
          <div
            className="relative group cursor-pointer shrink-0"
            onClick={() => fileInputRef.current?.click()}
          >
            <div
              className="bg-center bg-no-repeat bg-cover rounded-full h-24 w-24 border-4 border-white shadow-lg ring-1 ring-slate-200"
              style={{ backgroundImage: `url("${formData.avatarUrl}")` }}
            />
            <button className="absolute bottom-0 right-0 p-1.5 bg-primary rounded-full text-white shadow-md hover:bg-primary/90 transition-colors">
              <span className="material-symbols-outlined text-[16px] block">photo_camera</span>
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
          <div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-sm text-primary font-bold hover:underline"
            >
              写真を変更
            </button>
            <p className="text-xs text-slate-400 mt-1">クリックして画像を選択（JPG / PNG）</p>
          </div>
        </div>

        {/* Form fields */}
        <div className="flex flex-col gap-5">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">会社名</label>
            <input
              name="companyName"
              value={formData.companyName}
              onChange={handleChange}
              readOnly={isSubUser}
              className={`${inputClass} ${isSubUser ? "bg-slate-100 text-slate-500 cursor-not-allowed" : ""}`}
            />
            {isSubUser && (
              <p className="mt-1.5 text-[11px] text-slate-400">
                会社名の変更は会社のご担当責任者または管理者へご依頼ください。
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">姓</label>
              <input name="lastName" value={formData.lastName} onChange={handleChange} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">名</label>
              <input name="firstName" value={formData.firstName} onChange={handleChange} className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">メールアドレス</label>
              <input name="email" type="email" value={formData.email} onChange={handleChange} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">電話番号</label>
              <input name="phone" type="tel" value={formData.phone} onChange={handleChange} className={inputClass} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">住所（納品・回収場所）</label>
            <input name="address" value={formData.address} onChange={handleChange} className={inputClass} />
          </div>
        </div>

        {/* Action area */}
        <div className="flex items-center justify-end gap-3 mt-8 pt-6 border-t border-slate-100">
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-3 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-primary text-white font-bold hover:bg-blue-600 active:scale-[0.98] transition-transform shadow-lg shadow-primary/20"
          >
            <span className="material-symbols-outlined text-[20px]">save</span>保存する
          </button>
        </div>
      </div>
    </div>
  );
}
