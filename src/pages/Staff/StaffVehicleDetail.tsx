import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useVehicles } from "../../context/VehicleContext";
import { ArrowLeft, Edit2, Car, Download, UploadCloud, AlertTriangle, PenTool, Image, FileText, CheckCircle2, MoreVertical, Search, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function StaffVehicleDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { vehicles, updateVehicle } = useVehicles();

  const [activeTab, setActiveTab] = useState<"basic" | "legal" | "history" | "docs">("basic");
  
  const [isEditingLegal, setIsEditingLegal] = useState(false);
  const [editForm, setEditForm] = useState({
    inspectionDate: "",
    insuranceDate: "",
    insurancePolicyNo: ""
  });

  // Get real vehicle from context
  const foundVehicle = vehicles.find(v => v.id === id);

  if (!foundVehicle) {
    return <div className="text-slate-500 p-5 text-center mt-10">Vehicle not found</div>;
  }

  // Handle edit toggle
  const handleEditLegal = () => {
    if (!isEditingLegal) {
      setEditForm({
        inspectionDate: foundVehicle.inspectionDate,
        insuranceDate: foundVehicle.insuranceDate,
        insurancePolicyNo: "JB-2024-558102" // Mock static value
      });
    }
    setIsEditingLegal(!isEditingLegal);
  };

  const handleSaveLegal = () => {
    updateVehicle(foundVehicle.id, {
      inspectionDate: editForm.inspectionDate,
      insuranceDate: editForm.insuranceDate,
      // We could ideally save policy no as well, but it's not in our context yet
    });
    setIsEditingLegal(false);
  };

  const vehicle = {
    ...foundVehicle,
    alerts: foundVehicle.alerts.length > 0 ? foundVehicle.alerts : [
        { id: 3, type: "warning", title: "自動車税が未払いです", subtitle: "2026年度 ・ 納付期限を確認してください", icon: <AlertTriangle size={18} /> }
    ],
    basicInfo: [
      { label: "Biển số (車両番号)", value: foundVehicle.plate },
      { label: "Nhà sx (メーカー)", value: foundVehicle.manufacturer },
      { label: "Model (車種・モデル)", value: foundVehicle.name },
      { label: "Năm sx (年式)", value: foundVehicle.year },
      { label: "Màu xe (車体色)", value: foundVehicle.color },
      { label: "Số khung (車台番号)", value: foundVehicle.vin },
      { label: "Số máy (原動機)", value: foundVehicle.engineModel },
      { label: "Ngày mua (購入日)", value: foundVehicle.purchaseDate },
      { label: "Giá mua (購入価格)", value: foundVehicle.purchasePrice },
      { label: "Số km (走行距離)", value: foundVehicle.mileage },
      { label: "Trạng thái (状態)", value: foundVehicle.status, isBadge: true },
    ],
    legalInfo: {
      inspection: {
        title: "Đăng kiểm (自動車検査証)",
        daysRemaining: foundVehicle.inspectionDaysRemaining,
        lastDate: "2024/06/05",
        expiryDate: foundVehicle.inspectionDate,
        file: `車検証_${foundVehicle.plate.replace(/[^0-9]/g, '')}.pdf`
      },
      insurance: {
        title: "Bảo hiểm (自賠責保険)",
        daysRemaining: foundVehicle.inspectionDaysRemaining + 12,
        policyNo: "JB-2024-558102",
        expiryDate: foundVehicle.insuranceDate,
        file: "自賠責_2024.pdf"
      }
    },
    maintenanceHistory: foundVehicle.maintenanceHistory,
    repairHistory: foundVehicle.repairHistory,
    documents: foundVehicle.documents,
    nextInspectionDaysRemaining: foundVehicle.inspectionDaysRemaining,
    nextInspectionDate: foundVehicle.inspectionDate,
  };

  const tabs = [
    { id: "basic", label: "Cơ bản" },
    { id: "legal", label: "Pháp lý" },
    { id: "history", label: "Lịch sử" },
    { id: "docs", label: "Tài liệu" },
  ];

  return (
    <div className="bg-slate-50 min-h-screen text-slate-900 pb-24 font-sans">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-20 px-4 py-3 flex justify-between items-center border-b border-slate-100">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-500 hover:text-slate-800 transition-colors">
          <ArrowLeft size={24} />
        </button>
        <div className="flex flex-col items-center">
          <h1 className="text-sm font-extrabold tracking-tight font-mono text-slate-800">{vehicle.plate}</h1>
          <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-full mt-0.5">
            {vehicle.name}
          </span>
        </div>
        <button className="p-2 -mr-2 text-slate-500 hover:text-blue-600 transition-colors">
          <Edit2 size={20} />
        </button>
      </div>

      <div className="p-5 space-y-5 max-w-md mx-auto">
        {/* Next Inspection Card */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-5 shadow-lg shadow-blue-200 flex items-center gap-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white rounded-full blur-3xl opacity-10 -translate-y-1/2 translate-x-1/2"></div>
          <div className="w-14 h-14 bg-white/20 backdrop-blur-md text-white rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
            <Car size={28} />
          </div>
          <div className="relative z-10 w-full">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-blue-100 font-bold uppercase tracking-widest">Hạn Đăng Kiểm</span>
              <span className="text-[10px] bg-orange-500/20 text-orange-200 border border-orange-400/30 font-extrabold px-2 py-0.5 rounded-full backdrop-blur-sm shadow-sm">
                Còn {vehicle.nextInspectionDaysRemaining} ngày
              </span>
            </div>
            <h2 className="text-2xl font-mono font-extrabold text-white tracking-widest">{vehicle.nextInspectionDate}</h2>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex bg-slate-200/50 rounded-2xl p-1 relative">
          <div 
            className="absolute top-1 bottom-1 bg-white rounded-xl shadow-sm transition-all duration-300 ease-out" 
            style={{ 
              width: `calc(25% - 2px)`, 
              left: `calc(${(tabs.findIndex(t => t.id === activeTab)) * 25}% + 4px)` 
            }}
          />
          {tabs.map(tab => (
            <button
               key={tab.id}
               onClick={() => setActiveTab(tab.id as any)}
               className={`flex-1 py-2.5 text-xs font-bold rounded-xl relative z-10 transition-colors ${
                 activeTab === tab.id 
                   ? "text-blue-600" 
                   : "text-slate-500"
               }`}
             >
               {tab.label}
             </button>
           ))}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === "basic" && (
            <motion.div key="basic" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
              {/* Auto Alerts */}
              {vehicle.alerts.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-bold text-slate-400 mb-3 uppercase tracking-widest">
                    Cảnh báo tự động ({vehicle.alerts.length})
                  </h3>
                  <div className="space-y-3">
                    {vehicle.alerts.map((alert: any) => (
                      <div key={alert.id} className={`p-4 rounded-2xl border flex items-start gap-3 ${
                        alert.type === "danger" 
                          ? "bg-red-50 border-red-100" 
                          : "bg-orange-50 border-orange-100"
                      }`}>
                        <div className={alert.type === "danger" ? "text-red-500 mt-0.5" : "text-orange-500 mt-0.5"}>
                           {alert.icon || <AlertTriangle size={18} />}
                        </div>
                        <div>
                          <h4 className={`text-sm font-bold mb-1 ${alert.type === "danger" ? "text-red-800" : "text-orange-800"}`}>{alert.title}</h4>
                          <p className={`text-[11px] font-medium leading-relaxed ${
                            alert.type === "danger" ? "text-red-600" : "text-orange-600"
                          }`}>{alert.subtitle}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Basic Info */}
              <div>
                <h3 className="text-[10px] font-bold text-slate-400 mb-3 uppercase tracking-widest">Thông tin cơ bản</h3>
                <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm">
                  <div className="space-y-4">
                    {vehicle.basicInfo.map((info, idx) => (
                      <div key={idx} className="flex justify-between items-center border-b border-slate-50 pb-4 last:border-0 last:pb-0">
                        <span className="text-xs text-slate-500 font-bold">{info.label}</span>
                        {info.isBadge ? (
                          <span className="text-[10px] bg-emerald-50 text-emerald-600 font-extrabold px-2.5 py-1 rounded-full border border-emerald-100 uppercase tracking-widest">
                            {info.value}
                          </span>
                        ) : (
                          <span className="text-[13px] text-slate-800 font-semibold font-mono">{info.value}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "legal" && (
            <motion.div key="legal" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
              {/* Action Bar for Editing */}
              <div className="flex justify-end mb-1">
                {!isEditingLegal ? (
                  <button 
                    onClick={handleEditLegal}
                    className="text-xs bg-white text-blue-600 border border-blue-100 px-4 py-2.5 rounded-xl font-bold transition-all shadow-sm flex items-center gap-1.5 hover:bg-blue-50 active:scale-95"
                  >
                    <Edit2 size={14} /> Chỉnh sửa
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button 
                      onClick={handleEditLegal}
                      className="text-xs bg-white text-slate-500 border border-slate-200 px-4 py-2.5 rounded-xl font-bold transition-all hover:bg-slate-50 active:scale-95"
                    >
                      Hủy
                    </button>
                    <button 
                      onClick={handleSaveLegal}
                      className="text-xs bg-blue-600 text-white px-4 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-blue-200 flex items-center gap-1.5 hover:bg-blue-700 active:scale-95"
                    >
                      <CheckCircle2 size={14} /> Lưu lại
                    </button>
                  </div>
                )}
              </div>

              {/* Inspection */}
              <div>
                <h3 className="text-[10px] font-bold text-slate-400 mb-3 uppercase tracking-widest">Đăng kiểm</h3>
                <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm">
                  <div className="flex justify-between items-center mb-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center border border-blue-100">
                        <FileText size={20} />
                      </div>
                      <span className="text-sm font-bold text-slate-800">{vehicle.legalInfo.inspection.title}</span>
                    </div>
                    {!isEditingLegal && (
                      <span className="text-[10px] bg-orange-50 text-orange-600 font-extrabold px-2.5 py-1 rounded-full border border-orange-100">
                        Còn {vehicle.legalInfo.inspection.daysRemaining} ngày
                      </span>
                    )}
                  </div>

                  <div className="space-y-4 mb-5 bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500 font-bold">Lần thực hiện trước</span>
                      <span className="text-[13px] text-slate-800 font-mono font-semibold">{vehicle.legalInfo.inspection.lastDate}</span>
                    </div>
                    <div className="flex justify-between items-center pt-3 border-t border-slate-200/60">
                      <span className="text-xs text-slate-500 font-bold">Ngày hết hạn</span>
                      {isEditingLegal ? (
                        <input 
                          type="date"
                          value={editForm.inspectionDate.replace(/\//g, '-')}
                          onChange={e => setEditForm({...editForm, inspectionDate: e.target.value.replace(/-/g, '/')})}
                          className="bg-white border border-blue-300 text-slate-800 text-[13px] rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all font-mono font-bold"
                        />
                      ) : (
                        <span className="text-[13px] text-slate-800 font-mono font-semibold">{vehicle.legalInfo.inspection.expiryDate}</span>
                      )}
                    </div>
                  </div>

                  {!isEditingLegal ? (
                    <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-3 hover:bg-slate-50 cursor-pointer transition-colors shadow-sm active:scale-[0.98]">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <FileText size={18} className="text-blue-500 shrink-0" />
                        <span className="text-xs font-bold text-slate-700 truncate">{vehicle.legalInfo.inspection.file}</span>
                      </div>
                      <Download size={18} className="text-slate-400 shrink-0 ml-2 hover:text-blue-500" />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center border-2 border-dashed border-blue-200 bg-blue-50/50 rounded-xl p-5 cursor-pointer transition-colors text-slate-500 hover:bg-blue-50 group">
                      <UploadCloud size={24} className="mb-2 text-blue-400 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-bold text-blue-700">Tải lên giấy đăng kiểm mới</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Insurance & Tax */}
              <div>
                <h3 className="text-[10px] font-bold text-slate-400 mb-3 uppercase tracking-widest">Bảo hiểm</h3>
                <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm">
                  <div className="flex justify-between items-center mb-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center border border-emerald-100">
                        <ShieldCheck size={20} />
                      </div>
                      <span className="text-sm font-bold text-slate-800">{vehicle.legalInfo.insurance.title}</span>
                    </div>
                    {!isEditingLegal && (
                      <span className="text-[10px] bg-emerald-50 text-emerald-600 font-extrabold px-2.5 py-1 rounded-full border border-emerald-100">
                        Còn {vehicle.legalInfo.insurance.daysRemaining} ngày
                      </span>
                    )}
                  </div>

                  <div className="space-y-4 mb-5 bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500 font-bold">Số hợp đồng</span>
                      {isEditingLegal ? (
                        <input 
                          type="text"
                          value={editForm.insurancePolicyNo}
                          onChange={e => setEditForm({...editForm, insurancePolicyNo: e.target.value})}
                          className="bg-white border border-blue-300 text-slate-800 text-[13px] rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all font-mono font-bold w-32 text-right"
                        />
                      ) : (
                        <span className="text-[13px] text-slate-800 font-mono font-semibold">{vehicle.legalInfo.insurance.policyNo}</span>
                      )}
                    </div>
                    <div className="flex justify-between items-center pt-3 border-t border-slate-200/60">
                      <span className="text-xs text-slate-500 font-bold">Ngày hết hạn</span>
                      {isEditingLegal ? (
                        <input 
                          type="date"
                          value={editForm.insuranceDate.replace(/\//g, '-')}
                          onChange={e => setEditForm({...editForm, insuranceDate: e.target.value.replace(/-/g, '/')})}
                          className="bg-white border border-blue-300 text-slate-800 text-[13px] rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all font-mono font-bold"
                        />
                      ) : (
                        <span className="text-[13px] text-slate-800 font-mono font-semibold">{vehicle.legalInfo.insurance.expiryDate}</span>
                      )}
                    </div>
                  </div>

                  {!isEditingLegal ? (
                    <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-3 hover:bg-slate-50 cursor-pointer transition-colors shadow-sm active:scale-[0.98]">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <FileText size={18} className="text-emerald-500 shrink-0" />
                        <span className="text-xs font-bold text-slate-700 truncate">{vehicle.legalInfo.insurance.file}</span>
                      </div>
                      <Download size={18} className="text-slate-400 shrink-0 ml-2 hover:text-emerald-500" />
                    </div>
                  ) : (
                     <div className="flex flex-col items-center justify-center border-2 border-dashed border-emerald-200 bg-emerald-50/50 rounded-xl p-5 cursor-pointer transition-colors text-slate-500 hover:bg-emerald-50 group">
                      <UploadCloud size={24} className="mb-2 text-emerald-400 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-bold text-emerald-700">Tải lên bảo hiểm mới</span>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "history" && (
            <motion.div key="history" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
              {/* Maintenance History */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lịch sử bảo dưỡng</h3>
                  <span className="text-[10px] bg-slate-200 text-slate-600 font-bold px-2 py-0.5 rounded">{vehicle.maintenanceHistory.length} mục</span>
                </div>
                
                <div className="bg-white border border-slate-100 shadow-sm rounded-3xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Ngày</th>
                        <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Hạng mục</th>
                        <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right whitespace-nowrap">Số Km</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vehicle.maintenanceHistory.map((item, idx) => (
                        <tr key={idx} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                          <td className="py-4 px-4 text-[12px] text-slate-500 font-mono font-medium">{item.date}</td>
                          <td className="py-4 px-4 text-[13px] text-slate-800 font-bold leading-snug">{item.item}</td>
                          <td className="py-4 px-4 text-[12px] text-slate-600 font-mono font-medium text-right">{item.mileage}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Repair History */}
              <div>
                <div className="flex justify-between items-center mb-3 mt-8">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lịch sử Sửa chữa</h3>
                  <span className="text-[10px] bg-slate-200 text-slate-600 font-bold px-2 py-0.5 rounded">{vehicle.repairHistory.length} mục</span>
                </div>
                
                <div className="space-y-4">
                  {vehicle.repairHistory.map((item, idx) => (
                    <div key={idx} className="bg-white border border-slate-100 shadow-sm rounded-3xl p-5">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h4 className="text-sm font-bold text-slate-800 leading-snug mb-1">{item.title}</h4>
                          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{item.shop}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] text-slate-500 font-mono font-medium mb-1">{item.date}</p>
                          <p className="text-[15px] text-slate-800 font-mono font-extrabold">{item.price}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between border border-slate-100 bg-slate-50 rounded-xl p-3 hover:bg-slate-100 cursor-pointer transition-colors active:scale-[0.98]">
                        <div className="flex items-center gap-3">
                          <FileText size={16} className="text-slate-400" />
                          <span className="text-xs font-bold text-slate-700">{item.receipt}</span>
                        </div>
                        <Download size={16} className="text-slate-400" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "docs" && (
            <motion.div key="docs" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              {/* Attached Docs */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tệp đính kèm</h3>
                  <span className="text-[10px] bg-slate-200 text-slate-600 font-bold px-2 py-0.5 rounded">{vehicle.documents.length} tệp</span>
                </div>
                
                <div className="bg-white border border-slate-100 shadow-sm rounded-3xl p-2 space-y-1">
                  {vehicle.documents.map((doc, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-white rounded-2xl p-3 hover:bg-slate-50 cursor-pointer transition-colors active:scale-[0.98]">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-50 text-slate-500 rounded-xl flex items-center justify-center border border-slate-100">
                          <FileText size={20} />
                        </div>
                        <span className="text-sm font-bold text-slate-700">{doc}</span>
                      </div>
                      <Download size={20} className="text-slate-400 mr-2" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Photos */}
              <div>
                <h3 className="text-[10px] font-bold text-slate-400 mb-3 uppercase tracking-widest mt-6">Hình ảnh xe</h3>
                <div className="bg-white border border-slate-100 shadow-sm rounded-3xl p-4">
                  <div className="grid grid-cols-2 gap-3">
                    {[1, 2, 3].map((item, idx) => (
                      <div key={idx} className="aspect-square rounded-2xl border border-slate-100 flex items-center justify-center relative overflow-hidden group cursor-pointer bg-slate-50">
                        <Image size={32} className="text-slate-300 group-hover:text-slate-400 transition-colors" />
                        <span className="absolute bottom-2 left-2 text-[10px] font-mono font-bold bg-white/90 backdrop-blur-sm text-slate-700 px-2 py-0.5 rounded shadow-sm">12:03</span>
                      </div>
                    ))}
                    
                    <div className="aspect-square bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 hover:text-blue-500 hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-colors gap-2 group active:scale-95">
                      <UploadCloud size={28} className="group-hover:scale-110 transition-transform" />
                      <span className="text-[11px] font-bold text-slate-500 group-hover:text-blue-600">Thêm ảnh</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
