import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export default function RoleSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleSwitch = (path: string) => {
    setIsOpen(false);
    navigate(path);
  };

  // Do not show on print or specific pages if needed
  // For now, always show as an overlay toggle

  return (
    <div className="fixed bottom-24 right-4 z-[999]">
      {isOpen && (
        <div className="absolute bottom-16 right-0 bg-white rounded-xl shadow-xl border border-slate-200 p-2 w-48 flex flex-col gap-1 overflow-hidden transform origin-bottom-right transition-all animate-in fade-in slide-in-from-bottom-4">
          <div className="px-3 py-2 text-xs font-bold text-slate-500 bg-slate-50 rounded-lg mb-1 uppercase tracking-widest text-center">
            権限切り替え
          </div>
          <button 
            onClick={() => handleSwitch("/")} 
            className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-100 rounded-lg text-sm text-left transition-colors"
          >
            <span className="material-symbols-outlined text-blue-500">person</span>
            <span className="font-medium text-slate-700">お客様</span>
          </button>
          <button 
            onClick={() => handleSwitch("/staff")} 
            className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-100 rounded-lg text-sm text-left transition-colors"
          >
            <span className="material-symbols-outlined text-purple-500">badge</span>
            <span className="font-medium text-slate-700">スタッフ</span>
          </button>
          <button 
            onClick={() => handleSwitch("/admin")} 
            className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-100 rounded-lg text-sm text-left transition-colors"
          >
            <span className="material-symbols-outlined text-red-500">admin_panel_settings</span>
            <span className="font-medium text-slate-700">管理者</span>
          </button>
        </div>
      )}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-transform active:scale-95 ${isOpen ? 'bg-slate-800 text-white' : 'bg-white text-slate-800 border-2 border-slate-200 hover:border-slate-300'}`}
      >
        <span className="material-symbols-outlined text-[28px]">
          {isOpen ? 'close' : 'swap_vert'}
        </span>
      </button>
    </div>
  );
}
