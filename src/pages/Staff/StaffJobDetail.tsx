import React, { useRef, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useOrders } from "../../context/OrderContext";
import SignatureCanvas from "react-signature-canvas";
import { ArrowLeft, User, MapPin, Package, Camera, PenTool, CheckCircle2, ChevronRight, X, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function StaffJobDetail() {
  const { role, orderId } = useParams<{ role: string; orderId: string }>();
  const navigate = useNavigate();
  const { orders, updateOrder } = useOrders();
  const order = orders.find(o => o.id === orderId);

  const signatureRef = useRef<SignatureCanvas>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [step, setStep] = useState<"check" | "issue" | "sign">("check");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Issues tracking [itemId]: { missing: 0, broken: 0 }
  const [issues, setIssues] = useState<Record<string, { type: "missing" | "broken", quantity: number, notes: string }>>({});

  useEffect(() => {
    if (order?.itemIssues) {
      const existing: Record<string, { type: "missing" | "broken", quantity: number, notes: string }> = {};
      order.itemIssues.forEach(i => {
        existing[i.itemId] = { type: i.type, quantity: i.quantity, notes: i.notes };
      });
      setIssues(existing);
    }
  }, [order]);

  if (!order) {
    return <div className="p-4 text-center mt-10 text-slate-500">注文が存在しません。</div>;
  }

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPhotoUrl(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearSignature = () => {
    signatureRef.current?.clear();
  };

  const handleComplete = async () => {
    setIsSubmitting(true);
    let signatureData = null;
    if (!signatureRef.current?.isEmpty()) {
      signatureData = signatureRef.current?.getCanvas().toDataURL("image/png");
    }

    const updates: any = {};
    
    if (role === "delivery") {
      updates.status = "配送済み"; // Delivered
      updates.staffStatus = "配送完了";
      updates.deliveryPhoto = photoUrl;
      updates.deliverySignature = signatureData;
    } else if (role === "collection" || role === "warehouse") {
      updates.status = "返却済み"; // Returned
      updates.staffStatus = "回収完了";
      
      const issueArray = Object.entries(issues).map(([itemId, val]) => ({
        itemId, ...val
      }));
      updates.itemIssues = issueArray;

      if (issueArray.length > 0 && updates.status === "返却済み") {
        updates.status = "一部返却"; // Partially returned / Has issues
      }

      if (role === "collection") {
        updates.collectionPhoto = photoUrl;
        updates.collectionSignature = signatureData;
      } else {
        updates.warehousePhoto = photoUrl;
        updates.warehouseSignature = signatureData;
      }
    }

    await updateOrder(order.id, updates);
    setIsSubmitting(false);
    navigate(`/staff`);
  };

  const handleIssueChange = (itemId: string, field: "type" | "quantity" | "notes", value: any) => {
    setIssues(prev => {
      const current = prev[itemId] || { type: "missing", quantity: 1, notes: "" };
      return {
        ...prev,
        [itemId]: { ...current, [field]: value }
      };
    });
  };

  const handleRemoveIssue = (itemId: string) => {
    setIssues(prev => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const currentStepIndex = step === "check" ? 1 : step === "issue" ? 2 : (role === "collection" || role === "warehouse" ? 3 : 2);
  const totalSteps = (role === "collection" || role === "warehouse") ? 3 : 2;

  return (
    <div className="bg-slate-50 min-h-screen text-slate-900 pb-24 font-sans">
      <div className="bg-white shadow-sm sticky top-0 z-20 px-4 py-3 flex justify-between items-center border-b border-slate-100">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-500 hover:text-slate-800 transition-colors">
          <ArrowLeft size={24} />
        </button>
        <div className="flex flex-col items-center">
          <h1 className="text-sm font-extrabold tracking-tight font-mono text-slate-800">{order.orderNumber}</h1>
          <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-full mt-0.5">
            {role === 'delivery' ? '配達' : '回収'}
          </span>
        </div>
        <div className="w-10"></div> {/* Spacer for center alignment */}
      </div>

      <div className="p-5 max-w-md mx-auto">
        {/* Progress Steps Header */}
        <div className="flex bg-slate-200/50 rounded-2xl p-1 mb-6 relative">
          <div 
            className="absolute top-1 bottom-1 bg-white rounded-xl shadow-sm transition-all duration-300 ease-out" 
            style={{ 
              width: `calc(${100/totalSteps}% - 4px)`, 
              left: `calc(${(currentStepIndex - 1) * (100/totalSteps)}% + 2px)` 
            }}
          />
          <button 
            onClick={() => setStep("check")} 
            className={`flex-1 py-2.5 text-xs font-bold rounded-xl relative z-10 transition-colors flex flex-col items-center ${step === "check" ? "text-blue-600" : "text-slate-500"}`}
          >
            <span>検品</span>
          </button>
          {(role === "collection" || role === "warehouse") && (
            <button 
              onClick={() => setStep("issue")} 
              className={`flex-1 py-2.5 text-xs font-bold rounded-xl relative z-10 transition-colors flex flex-col items-center ${step === "issue" ? "text-orange-600" : "text-slate-500"}`}
            >
              <span>問題報告</span>
            </button>
          )}
          <button 
            onClick={() => setStep("sign")} 
            className={`flex-1 py-2.5 text-xs font-bold rounded-xl relative z-10 transition-colors flex flex-col items-center ${step === "sign" ? "text-emerald-600" : "text-slate-500"}`}
          >
            <span>受領サイン</span>
          </button>
        </div>

        <AnimatePresence mode="wait">
          {step === "check" && (
            <motion.div key="check" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full blur-2xl opacity-60 -translate-y-1/2 translate-x-1/2"></div>
                <h2 className="text-[10px] font-bold text-blue-500 mb-3 uppercase tracking-widest flex items-center gap-1.5 relative z-10">
                  <User size={12} strokeWidth={3} /> 顧客情報
                </h2>
                <div className="relative z-10">
                  <p className="font-extrabold text-lg text-slate-800">{order.personName}</p>
                  {order.companyName && <p className="text-xs font-medium text-slate-500 mt-0.5">{order.companyName}</p>}
                  
                  <div className="bg-slate-50 rounded-2xl p-3.5 mt-4 border border-slate-100 flex items-start gap-2.5">
                    <MapPin size={18} className="text-blue-400 mt-0.5 shrink-0" />
                    <p className="text-sm font-medium text-slate-700 leading-relaxed">
                      {order.deliveryLocation || "店舗受取"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
                <h2 className="text-[10px] font-bold text-slate-400 mb-4 uppercase tracking-widest flex items-center gap-1.5">
                  <Package size={12} strokeWidth={3} /> 品目リスト
                </h2>
                <ul className="space-y-4">
                  {order.items.map((item, idx) => (
                    <li key={idx} className="flex justify-between items-center pb-4 border-b border-slate-50 last:border-0 last:pb-0">
                      <div className="pr-3 flex-1">
                        <p className="font-bold text-sm text-slate-800 leading-snug">{item.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5 bg-slate-100 inline-block px-1.5 py-0.5 rounded">
                          {item.type === "rent" ? "レンタル" : "販売"}
                        </p>
                      </div>
                      <div className="flex items-center justify-center w-10 h-10 bg-slate-50 text-slate-700 rounded-xl font-bold border border-slate-100">
                        x{item.quantity}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              
              <div className="pt-2 flex flex-col gap-3">
                {role === "delivery" && order.status === "確認済み" && (
                  <button 
                    onClick={async () => {
                      await updateOrder(order.id, { status: "配送中" });
                    }}
                    className="w-full bg-blue-50 text-blue-600 border border-blue-200 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-blue-100 active:scale-[0.98] transition-all"
                  >
                    配達を開始する
                  </button>
                )}
                <button 
                  onClick={() => setStep((role === "collection" || role === "warehouse") ? "issue" : "sign")}
                  disabled={role === "delivery" && order.status === "確認済み"}
                  className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${role === "delivery" && order.status === "確認済み" ? "bg-slate-100 text-slate-400" : "bg-slate-900 text-white shadow-lg shadow-slate-200 hover:bg-slate-800"}`}
                >
                  確認して進む <ChevronRight size={18} />
                </button>
              </div>
            </motion.div>
          )}

          {step === "issue" && (
            <motion.div key="issue" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              <div className="bg-gradient-to-br from-orange-50 to-amber-50 p-5 rounded-3xl border border-orange-100">
                <div className="flex items-center gap-2 mb-2 text-orange-600">
                  <AlertTriangle size={20} />
                  <h2 className="text-sm font-bold">不足・破損の報告</h2>
                </div>
                <p className="text-orange-800/80 text-xs font-medium mb-5 leading-relaxed">回収時に不足・破損のある品目を記録します。</p>
                
                <div className="space-y-3">
                  {order.items.map((item, idx) => {
                    const hasIssue = !!issues[item.id];
                    return (
                      <div key={idx} className={`bg-white p-4 rounded-2xl transition-all border ${hasIssue ? 'border-orange-300 shadow-md shadow-orange-100/50' : 'border-slate-100'}`}>
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1">
                            <p className="font-bold text-sm text-slate-800 leading-snug">{item.name}</p>
                            <p className="text-[10px] font-bold text-slate-500 mt-1">SL: {item.quantity}</p>
                          </div>
                          <button 
                            onClick={() => hasIssue ? handleRemoveIssue(item.id) : handleIssueChange(item.id, "type", "missing")}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${hasIssue ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                          >
                            {hasIssue ? <><X size={14} /> 修正</> : "問題あり"}
                          </button>
                        </div>
                        
                        <AnimatePresence>
                          {hasIssue && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                              <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1.5 block">不具合種別</label>
                                    <select 
                                      value={issues[item.id].type} 
                                      onChange={e => handleIssueChange(item.id, "type", e.target.value)}
                                      className="w-full text-sm font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:ring-2 focus:ring-orange-200 focus:border-orange-400 outline-none transition-all"
                                    >
                                      <option value="missing">紛失・不足</option>
                                      <option value="broken">破損</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1.5 block">不具合数量</label>
                                    <input 
                                      type="number" 
                                      min="1" 
                                      max={item.quantity}
                                      value={issues[item.id].quantity}
                                      onChange={e => handleIssueChange(item.id, "quantity", parseInt(e.target.value))}
                                      className="w-full text-sm font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:ring-2 focus:ring-orange-200 focus:border-orange-400 outline-none transition-all"
                                    />
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1.5 block">詳細・メモ</label>
                                  <input 
                                    type="text" 
                                    placeholder="状況を入力してください..."
                                    value={issues[item.id].notes}
                                    onChange={e => handleIssueChange(item.id, "notes", e.target.value)}
                                    className="w-full text-sm font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-orange-200 focus:border-orange-400 outline-none transition-all"
                                  />
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })}
                </div>
              </div>
              
              <div className="pt-2 grid grid-cols-2 gap-3">
                <button 
                  onClick={() => setStep("check")}
                  className="bg-white border border-slate-200 text-slate-600 py-4 rounded-2xl font-bold flex items-center justify-center gap-1 active:scale-[0.98] transition-all"
                >
                  <ArrowLeft size={18} /> 戻る
                </button>
                <button 
                  onClick={() => setStep("sign")}
                  className="bg-slate-900 text-white shadow-lg shadow-slate-200 py-4 rounded-2xl font-bold flex items-center justify-center gap-1 active:scale-[0.98] transition-all"
                >
                  次へ <ChevronRight size={18} />
                </button>
              </div>
            </motion.div>
          )}

          {step === "sign" && (
            <motion.div key="sign" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-4">
              
              {/* Photo Upload */}
              <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm relative">
                <h2 className="text-[10px] font-bold text-slate-400 mb-3 uppercase tracking-widest flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Camera size={12} strokeWidth={3} /> 現場写真
                  </div>
                  <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">任意</span>
                </h2>
                {photoUrl ? (
                  <div className="relative group rounded-2xl overflow-hidden border border-slate-200">
                    <img src={photoUrl} alt="Captured" className="w-full h-44 object-cover" />
                    <button 
                      onClick={() => setPhotoUrl(null)} 
                      className="absolute top-2 right-2 bg-black/50 text-white p-2 rounded-full backdrop-blur-md"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 text-slate-400 cursor-pointer active:bg-blue-50 active:border-blue-200 transition-colors">
                    <Camera size={28} className="mb-2 opacity-50" />
                    <span className="text-xs font-bold">写真を撮影 (カメラ起動)</span>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoCapture} />
                  </label>
                )}
              </div>

              {/* Signature */}
              <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm relative">
                <h2 className="text-[10px] font-bold text-slate-400 mb-3 uppercase tracking-widest flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <PenTool size={12} strokeWidth={3} /> お客様のご署名
                  </div>
                  <span className="text-[9px] bg-red-50 text-red-600 font-extrabold px-2 py-0.5 rounded-full border border-red-100">必須</span>
                </h2>
                <div className="border border-slate-200 rounded-2xl bg-white overflow-hidden relative shadow-inner">
                  <SignatureCanvas 
                    ref={signatureRef} 
                    penColor="#0f172a"
                    canvasProps={{ width: 500, height: 180, className: 'w-full h-44 cursor-crosshair' }}
                  />
                  <div className="absolute top-0 bottom-0 left-0 right-0 pointer-events-none border-b border-dashed border-slate-200/50 translate-y-3/4 mx-4"></div>
                  <button 
                    onClick={clearSignature}
                    className="absolute top-2 right-2 bg-slate-100 text-slate-500 px-2 py-1 rounded-lg text-[10px] font-extrabold active:bg-slate-200 transition-colors"
                  >
                    署名をクリア
                  </button>
                </div>
                <p className="text-[10px] text-center text-slate-400 mt-3 font-medium">上記の枠内にご署名ください</p>
              </div>

              <div className="pt-2 grid grid-cols-3 gap-3">
                <button 
                  onClick={() => setStep((role === "collection" || role === "warehouse") ? "issue" : "check")}
                  className="bg-white border border-slate-200 text-slate-600 py-4 rounded-2xl font-bold flex items-center justify-center active:scale-[0.98] transition-all"
                >
                  <ArrowLeft size={18} />
                </button>
                <button 
                  onClick={handleComplete}
                  disabled={isSubmitting}
                  className="col-span-2 bg-emerald-500 text-white shadow-lg shadow-emerald-200/50 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100 relative overflow-hidden"
                >
                  {isSubmitting ? (
                    <span className="animate-pulse">保存中...</span>
                  ) : (
                    <>完了 <CheckCircle2 size={18} /></>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
