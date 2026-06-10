import React, { useState, useEffect } from "react";
import { useProducts } from "../context/ProductContext";
import { useVehicles } from "../context/VehicleContext";
import { Product } from "../types";
import { isVehicleCategory } from "../utils/productUtils";

export default function AdminProductManagement() {
  const { products, addProduct, updateProduct, deleteProduct } = useProducts();
  const { vehicles, addVehicle, updateVehicle, deleteVehicle } = useVehicles();
  
  const [activeSubTab, setActiveSubTab] = useState<"security" | "vehicles">("security");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSecurityCategory, setSelectedSecurityCategory] = useState("すべて");
  const [selectedVehicleCategory, setSelectedVehicleCategory] = useState("すべて");
  
  const securityProducts = (products || []).filter(p => p && !isVehicleCategory(p?.category));
  const securityCategories = ["すべて", ...Array.from(new Set(securityProducts.map(p => p?.category).filter(Boolean)))];
  const vehicleCategories = ["すべて", ...Array.from(new Set((vehicles || []).map(v => v.category).filter(Boolean)))];
  const categoriesList = Array.from(new Set([
    "ガス検知器", "セイフティブロック", "発電機", "カラーコーン", "その他",
    ...(products || []).map(p => p?.category).filter(Boolean)
  ]));

  // Filter functionality
  const filteredProducts = securityProducts.filter(p => {
    const matchesSearch = p?.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      p?.category?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      p?.id?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedSecurityCategory === "すべて" || p?.category === selectedSecurityCategory;
    
    return matchesSearch && matchesCategory;
  });
  
  const filteredVehicles = (vehicles || []).filter(v => {
    const matchesSearch = v?.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      v?.plate?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v?.category?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedVehicleCategory === "すべて" || v?.category === selectedVehicleCategory;
    
    return matchesSearch && matchesCategory;
  });

  const securityStock = securityProducts.reduce((acc, p) => acc + (p.stock || 0), 0);
  const vehicleStock = (vehicles || []).reduce((acc, v) => {
    const linkedProduct = (products || []).find(p => p && p.id === (v.productId || v.id));
    return acc + (v.stock || linkedProduct?.stock || 0);
  }, 0);


  // Modal State
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isGuaranteeChecked, setIsGuaranteeChecked] = useState(false);
  const [guaranteeType, setGuaranteeType] = useState<'flat' | 'tiered'>('tiered');

  // Bulk add & Spreadsheet states
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkItems, setBulkItems] = useState<any[]>([]);

  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<any | null>(null);

  // Re-parse when text changes to initialize spreadsheet rows
  useEffect(() => {
    if (bulkText) {
      setBulkItems(parseBulkText(bulkText));
    } else {
      setBulkItems([]);
    }
  }, [bulkText]);

  const handleAddProduct = () => {
    setEditingProduct(null);
    setIsGuaranteeChecked(false);
    setGuaranteeType('tiered');
    setIsProductModalOpen(true);
  };

  const handleEditProduct = (p: Product) => {
    setEditingProduct(p);
    setIsGuaranteeChecked(!!p.isGuarantee);
    setGuaranteeType(p.guaranteeType || 'tiered');
    setIsProductModalOpen(true);
  };

  const handleDeleteProduct = (id: string) => {
    if (window.confirm("このアイテムを削除してもよろしいですか？")) {
      deleteProduct(id);
    }
  };

  const saveProduct = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const productData: any = {
      name: formData.get("name"),
      category: formData.get("category"),
      stock: Number(formData.get("stock")),
      rentPrice: Number(formData.get("rentPrice")),
      rentPriceLongTerm: Number(formData.get("rentPriceLongTerm")),
      buyPrice: Number(formData.get("buyPrice")),
      image: formData.get("image") || "https://images.unsplash.com/photo-1544473244-f6895e69da8a?w=500&h=500&fit=crop",
      description: formData.get("description"),
      isGuarantee: isGuaranteeChecked,
      guaranteeType: isGuaranteeChecked ? guaranteeType : undefined,
      guaranteeRate: isGuaranteeChecked && guaranteeType === 'flat' ? Number(formData.get("guaranteeRate")) || 0 : undefined,
      guaranteeFees: isGuaranteeChecked && guaranteeType === 'tiered' ? {
        range1: Number(formData.get("guarantee_range1")) || 0,
        range2: Number(formData.get("guarantee_range2")) || 0,
        range3: Number(formData.get("guarantee_range3")) || 0,
        range4: Number(formData.get("guarantee_range4")) || 0,
        range5: Number(formData.get("guarantee_range5")) || 0,
        range6: Number(formData.get("guarantee_range6")) || 0,
      } : undefined,
    };

    if (editingProduct) {
      updateProduct(editingProduct.id, productData);
    } else {
      addProduct({
         id: formData.get("id") as string || "p-" + Math.random().toString(36).substring(7),
        ...productData
      } as Product);
    }
    setIsProductModalOpen(false);
  };

  const parseBulkText = (text: string) => {
    const lines = text.split("\n");
    const parsed: Array<{
      name: string;
      category: string;
      rentPrice: number;
      rentPriceLongTerm: number;
      buyPrice: number;
      stock: number;
      error?: string;
    }> = [];

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const delimiter = trimmed.includes("\t") ? "\t" : ",";
      const parts = trimmed.split(delimiter).map((p) => p.trim());

      const name = parts[0] || "";
      const category = parts[1] || "";

      if (
        name === "商品名" || name.toLowerCase() === "name" ||
        category === "カテゴリ" || category.toLowerCase() === "category"
      ) {
        return;
      }

      const rentPrice = Number(parts[2]) || 0;
      const rentPriceLongTerm = Number(parts[3]) || 0;
      const buyPrice = Number(parts[4]) || 0;
      const stock = Number(parts[5]) || 0;

      let error = "";
      if (!name) error = "商品名は必須です";
      else if (!category) error = "カテゴリは必須です";

      parsed.push({
        name,
        category,
        rentPrice,
        rentPriceLongTerm,
        buyPrice,
        stock,
        error: error || undefined,
      });
    });

    return parsed;
  };

  // Inline edit spreadsheet cell function
  const updateBulkItemCell = (index: number, field: string, value: any) => {
    setBulkItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const updated = { ...item, [field]: field.includes("Price") || field === "stock" ? Number(value) || 0 : value };
        
        // Inline validation checks
        if (!updated.name) updated.error = "商品名は必須です";
        else if (!updated.category) updated.error = "カテゴリは必須です";
        else delete updated.error;
        
        return updated;
      })
    );
  };

  const handleBulkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = bulkItems.filter((item) => !item.error);

    if (validItems.length === 0) {
      alert("登録可能な有効なデータがありません。");
      return;
    }

    validItems.forEach((item) => {
      addProduct({
        id: "p-" + Math.random().toString(36).substring(7),
        name: item.name,
        category: item.category,
        stock: item.stock,
        rentPrice: item.rentPrice,
        rentPriceLongTerm: item.rentPriceLongTerm,
        buyPrice: item.buyPrice,
        image: "https://images.unsplash.com/photo-1544473244-f6895e69da8a?w=500&h=500&fit=crop",
        description: "一括登録された保安用品",
      } as Product);
    });

    setIsBulkModalOpen(false);
    setBulkText("");
    setBulkItems([]);
    alert(`${validItems.length}件の保安用品を一括追加しました。`);
  };

  const handleAddVehicle = () => { setEditingVehicle(null); setIsVehicleModalOpen(true); };
  const handleEditVehicle = (v: any) => { setEditingVehicle(v); setIsVehicleModalOpen(true); };

  const handleDeleteVehicle = (id: string) => {
    if (window.confirm("この車両を削除してもよろしいですか？")) {
      deleteVehicle(id);
      const v = vehicles.find(vh => vh.id === id);
      if (v?.productId) deleteProduct(v.productId);
    }
  };

  const saveVehicle = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const category = formData.get("category") as string || "軽トラック";
    const rentPrice = Number(formData.get("rentPrice")) || 0;
    const rentPriceLongTerm = Number(formData.get("rentPriceLongTerm")) || 0;
    const buyPrice = Number(formData.get("buyPrice")) || 0;
    const stock = Number(formData.get("stock")) || 0;
    
    const vehicleData: any = {
      name: formData.get("name"),
      plate: formData.get("plate"),
      status: formData.get("status"),
      inspectionDate: formData.get("inspectionDate"),
      year: formData.get("year"),
      color: formData.get("color"),
      category: category,
      stock: stock,
    };

    if (editingVehicle) {
      updateVehicle(editingVehicle.id, vehicleData);
      const vProdId = editingVehicle.productId || editingVehicle.id;
      const linkedProduct = products.find(p => p && p.id === vProdId);
      if (linkedProduct) {
         updateProduct(vProdId, { name: vehicleData.name, category: vehicleData.category, rentPrice, rentPriceLongTerm, buyPrice, image: formData.get("image") as string || linkedProduct.image, stock });
      }
    } else {
      const vid = "veh_" + Date.now();
      const pid = "vprod_" + Date.now();

      addVehicle({ id: vid, productId: pid, category: category, statusColor: vehicleData.status === "使用中" ? "emerald" : vehicleData.status === "整備中" ? "orange" : "blue", ...vehicleData });
      addProduct({ id: pid, name: vehicleData.name, category: category, stock: stock, rentPrice: rentPrice, rentPriceLongTerm: rentPriceLongTerm, buyPrice: buyPrice, image: formData.get("image") as string || "https://imagedelivery.net/W-O2N6-kYOfvEexU-w0YSA/6ca65aee-8da0-466f-ff84-9de55ae2ee00/public" });
    }
    setIsVehicleModalOpen(false);
  };

  return (
    <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
      {/* Summary Header Wrapper (Scrolls with page) */}
      <div className="space-y-4">
        {/* Top Summary Bar (Compact & Gradient) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 bg-gradient-to-r from-white via-slate-50/50 to-white p-3 rounded-2xl border border-slate-200/60 shadow-[0_4px_20px_-2px_rgba(58,77,232,0.03)]">
          <div className="flex items-center justify-between px-3 py-1 hover:scale-[1.01] transition-transform duration-200">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[18px] text-blue-600 bg-blue-50/80 w-8 h-8 rounded-xl flex items-center justify-center shadow-sm border border-blue-100/30">security</span>
              <span className="text-slate-500 font-bold text-[13px] tracking-tight">保安用品</span>
            </div>
            <div className="text-2xl font-black font-display tracking-tight text-slate-800 flex items-baseline">
              {securityProducts.length}<span className="text-xs font-bold ml-1 text-slate-400">品目</span>
            </div>
          </div>
          <div className="flex items-center justify-between px-3 py-1 border-l border-slate-200/60 hover:scale-[1.01] transition-transform duration-200">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[18px] text-emerald-600 bg-emerald-50/80 w-8 h-8 rounded-xl flex items-center justify-center shadow-sm border border-emerald-100/30">local_shipping</span>
              <span className="text-slate-500 font-bold text-[13px] tracking-tight">保安車両</span>
            </div>
            <div className="text-2xl font-black font-display tracking-tight text-slate-800 flex items-baseline">
              {vehicles.length}<span className="text-xs font-bold ml-1 text-slate-400">台種</span>
            </div>
          </div>
          <div className="flex items-center justify-between px-3 py-1 lg:border-l border-slate-200/60 hover:scale-[1.01] transition-transform duration-200">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[18px] text-purple-600 bg-purple-50/80 w-8 h-8 rounded-xl flex items-center justify-center shadow-sm border border-purple-100/30">inventory_2</span>
              <span className="text-slate-500 font-bold text-[13px] tracking-tight">保安用品在庫</span>
            </div>
            <div className="text-2xl font-black font-display tracking-tight text-[#1a1c9a] flex items-baseline">
              {securityStock}<span className="text-xs font-bold ml-1 text-[#1a1c9a]/60">点</span>
            </div>
          </div>
          <div className="flex items-center justify-between px-3 py-1 border-l border-slate-200/60 hover:scale-[1.01] transition-transform duration-200">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[18px] text-amber-600 bg-amber-50/80 w-8 h-8 rounded-xl flex items-center justify-center shadow-sm border border-amber-100/30">garage</span>
              <span className="text-slate-500 font-bold text-[13px] tracking-tight">保安車両在庫</span>
            </div>
            <div className="text-2xl font-black font-display tracking-tight text-[#c25e00] flex items-baseline">
              {vehicleStock}<span className="text-xs font-bold ml-1 text-[#c25e00]/60">台</span>
            </div>
          </div>
        </div>


        {/* Tabs */}
        <div className="border-b border-slate-200/60">
          <div className="flex gap-8">
            <button 
              className={`pb-3 text-[15px] font-bold transition-colors cursor-pointer flex items-center ${activeSubTab === 'security' ? 'text-[#1a1c9a] border-b-[3px] border-[#1a1c9a]' : 'text-slate-500 hover:text-slate-800'}`}
              onClick={() => setActiveSubTab("security")}
            >
              保安用品
              <span className={`ml-2 px-2 py-0.5 text-xs rounded-full font-bold ${activeSubTab === 'security' ? 'bg-[#1a1c9a]/10 text-[#1a1c9a]' : 'bg-slate-200/60 text-slate-500'}`}>
                {securityProducts.length}
              </span>
            </button>
            <button 
              className={`pb-3 text-[15px] font-bold transition-colors cursor-pointer flex items-center ${activeSubTab === 'vehicles' ? 'text-[#1a1c9a] border-b-[3px] border-[#1a1c9a]' : 'text-slate-500 hover:text-slate-800'}`}
              onClick={() => setActiveSubTab("vehicles")}
            >
              保安車両
              <span className={`ml-2 px-2 py-0.5 text-xs rounded-full font-bold ${activeSubTab === 'vehicles' ? 'bg-[#1a1c9a]/10 text-[#1a1c9a]' : 'bg-slate-200/60 text-slate-500'}`}>
                {vehicles.length}
              </span>
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex flex-1 items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 max-w-[320px]">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">search</span>
              <input 
                type="text" 
                placeholder="商品名・カテゴリ・IDで検索" 
                className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-[#1a1c9a]/20 focus:border-[#1a1c9a]/40 outline-none transition-shadow"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select
              value={activeSubTab === 'security' ? selectedSecurityCategory : selectedVehicleCategory}
              onChange={(e) => {
                if (activeSubTab === 'security') {
                  setSelectedSecurityCategory(e.target.value);
                } else {
                  setSelectedVehicleCategory(e.target.value);
                }
              }}
              className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-[#1a1c9a]/20 focus:border-[#1a1c9a]/40 outline-none transition-shadow min-w-[140px] cursor-pointer"
            >
              {(activeSubTab === 'security' ? securityCategories : vehicleCategories).map(cat => (
                <option key={cat} value={cat}>
                  {cat === "すべて" ? "カテゴリー：すべて" : cat}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            {activeSubTab === 'security' && (
              <button 
                onClick={() => setIsBulkModalOpen(true)} 
                className="bg-white hover:bg-slate-50/80 text-slate-700 border border-slate-300 px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all shadow-sm cursor-pointer hover:shadow-md active:scale-98"
              >
                <span className="material-symbols-outlined text-[18px]">library_add</span>
                一括追加
              </button>
            )}
            <button 
              onClick={activeSubTab === 'security' ? handleAddProduct : handleAddVehicle} 
              className="bg-gradient-to-r from-[#1a1c9a] to-[#3a4de8] hover:to-[#2537c4] text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-[0_4px_12px_rgba(58,77,232,0.18)] transition-all hover:shadow-[0_6px_20px_rgba(58,77,232,0.28)] hover:-translate-y-0.5 active:translate-y-0 cursor-pointer active:scale-98"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              {activeSubTab === 'security' ? '保安用品 を追加' : '保安車両 を追加'}
            </button>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(58,77,232,0.02),0_1px_3px_rgba(0,0,0,0.01)] border border-slate-200/80 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <span className="material-symbols-outlined text-slate-400">{activeSubTab === 'security' ? 'security' : 'local_shipping'}</span>
            {activeSubTab === 'security' ? '保安用品 一覧' : '保安車両 一覧'}
            <span className="font-normal text-slate-400 text-sm ml-2">{activeSubTab === 'security' ? filteredProducts.length : filteredVehicles.length} 件</span>
          </h3>
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
             <span className="w-2 h-2 rounded-full bg-emerald-500"></span> OrderBus
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="p-4 text-xs font-bold text-slate-500 w-[300px]">商品</th>
                <th className="p-4 text-xs font-bold text-slate-500 w-[150px]">カテゴリ</th>
                <th className="p-4 text-xs font-bold text-slate-500 whitespace-nowrap">レンタル単価</th>
                <th className="p-4 text-xs font-bold text-slate-500 whitespace-nowrap">長期単価</th>
                <th className="p-4 text-xs font-bold text-slate-500 whitespace-nowrap">販売価格</th>
                <th className="p-4 text-xs font-bold text-slate-500">在庫</th>
                <th className="p-4 text-xs font-bold text-slate-500 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeSubTab === 'security' ? (
                filteredProducts.map(product => (
                  <tr key={product.id} className="hover:bg-slate-50/70 transition-colors duration-150">
                    <td className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-white rounded-xl flex-shrink-0 bg-contain bg-center bg-no-repeat border border-slate-200/80 p-1 overflow-hidden transition-transform hover:scale-105 duration-200 shadow-sm" style={{backgroundImage: `url("${product.image}")`}}></div>
                        <div>
                          <div className="font-bold text-slate-800 text-sm tracking-tight">{product.name}</div>
                          <div className="inline-block font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[10px] w-fit mt-1 border border-slate-200/40">{product.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="inline-block text-xs font-semibold bg-slate-100 text-slate-650 px-2.5 py-1 rounded-full border border-slate-200/40">
                        {product.category}
                      </span>
                    </td>
                    <td className="p-4 text-sm font-bold text-slate-800">
                      {product.rentPrice ? `¥${product.rentPrice.toLocaleString()}` : "—"}<span className="text-[10px] text-slate-400 font-normal ml-0.5">/日</span>
                    </td>
                    <td className="p-4 text-sm text-slate-600 font-medium">
                      {product.rentPriceLongTerm ? `¥${product.rentPriceLongTerm.toLocaleString()}` : "—"}<span className="text-[10px] text-slate-400 font-normal ml-0.5">/日</span>
                    </td>
                    <td className="p-4 text-sm text-slate-500 font-medium">
                      {product.buyPrice ? `¥${product.buyPrice.toLocaleString()}` : "—"}
                    </td>
                    <td className="p-4">
                      <span className="font-bold text-slate-800 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-150/60 shadow-sm">{product.stock || 0}</span>
                    </td>
                    <td className="p-4">
                      {product.isGuarantee ? (
                        product.guaranteeType === 'flat' ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
                            ¥{(product.guaranteeRate || 0).toLocaleString()} (比例)
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 cursor-help" title={`1〜50個: ¥${(product.guaranteeFees?.range1 || 0).toLocaleString()}\n51〜100個: ¥${(product.guaranteeFees?.range2 || 0).toLocaleString()}\n101〜150個: ¥${(product.guaranteeFees?.range3 || 0).toLocaleString()}\n151〜200個: ¥${(product.guaranteeFees?.range4 || 0).toLocaleString()}\n201〜250個: ¥${(product.guaranteeFees?.range5 || 0).toLocaleString()}\n251個〜: ¥${(product.guaranteeFees?.range6 || 0).toLocaleString()}`}>
                            数量別 (¥{(product.guaranteeFees?.range1 || 0).toLocaleString()}〜)
                          </span>
                        )
                      ) : (
                        <span className="text-slate-400 text-sm">—</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleEditProduct(product)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-650 hover:bg-slate-50 hover:text-slate-900 transition-colors text-xs font-bold cursor-pointer bg-white">
                          <span className="material-symbols-outlined text-[16px]">edit</span> 編集
                        </button>
                        <button onClick={() => handleDeleteProduct(product.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors text-xs font-bold bg-white cursor-pointer">
                          <span className="material-symbols-outlined text-[16px]">delete</span> 削除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                filteredVehicles.map(v => {
                  const linkedProduct = products.find(p => p && p.id === (v.productId || v.id));
                  return (
                  <tr key={v.id} className="hover:bg-slate-50/70 transition-colors duration-150">
                    <td className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-white rounded-xl flex-shrink-0 bg-contain bg-center bg-no-repeat border border-slate-200/80 p-1 overflow-hidden transition-transform hover:scale-105 duration-200 shadow-sm" style={{backgroundImage: `url("${linkedProduct?.image || ''}")`}}></div>
                        <div>
                          <div className="font-bold text-slate-800 text-sm tracking-tight flex items-center gap-1.5">
                            {v.name}
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100">
                              {v.plate}
                            </span>
                          </div>
                          <div className="inline-block font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[10px] w-fit mt-1 border border-slate-200/40">{v.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="inline-block text-xs font-semibold bg-slate-100 text-slate-650 px-2.5 py-1 rounded-full border border-slate-200/40">
                        {v.category}
                      </span>
                    </td>
                    <td className="p-4 text-sm font-bold text-slate-800">
                      {linkedProduct?.rentPrice ? `¥${linkedProduct.rentPrice.toLocaleString()}` : "—"}<span className="text-[10px] text-slate-400 font-normal ml-0.5">/日</span>
                    </td>
                    <td className="p-4 text-sm text-slate-650 font-medium">
                      {linkedProduct?.rentPriceLongTerm ? `¥${linkedProduct.rentPriceLongTerm.toLocaleString()}` : "—"}<span className="text-[10px] text-slate-400 font-normal ml-0.5">/日</span>
                    </td>
                    <td className="p-4 text-sm text-slate-500 font-medium">
                      {linkedProduct?.buyPrice ? `¥${linkedProduct.buyPrice.toLocaleString()}` : "—"}
                    </td>
                    <td className="p-4">
                      <span className="font-bold text-slate-800 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-150/60 shadow-sm">{v.stock || linkedProduct?.stock || 0}</span>
                    </td>
                    <td className="p-4 text-slate-400 text-sm">—</td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleEditVehicle(v)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-650 hover:bg-slate-50 hover:text-slate-900 transition-colors text-xs font-bold cursor-pointer bg-white">
                          <span className="material-symbols-outlined text-[16px]">edit</span> 編集
                        </button>
                        <button onClick={() => handleDeleteVehicle(v.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors text-xs font-bold bg-white cursor-pointer">
                          <span className="material-symbols-outlined text-[16px]">delete</span> 削除
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Product Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-[800px] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="px-8 py-5 border-b border-slate-200 flex justify-between items-center">
              <div><h2 className="text-[22px] font-bold text-slate-800">{editingProduct ? "商品を編集" : "保安用品を追加"}</h2></div>
              <button type="button" onClick={() => setIsProductModalOpen(false)} className="w-[38px] h-[38px] border rounded-xl">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-8">
              <form id="productForm" onSubmit={saveProduct} className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">商品名 *</label>
                  <input required defaultValue={editingProduct?.name || ""} name="name" className="w-full border rounded-xl p-3 text-sm outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">カテゴリ *</label>
                    <select required defaultValue={editingProduct?.category || "カラーコーン"} name="category" className="w-full border rounded-xl p-3 text-sm">
                      <option value="ガス検知器">ガス検知器</option>
                      <option value="セイフティブロック">セイフティブロック</option>
                      <option value="発電機">発電機</option>
                      <option value="カラーコーン">カラーコーン</option>
                      <option value="その他">その他</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">在庫数</label>
                    <input type="number" required defaultValue={editingProduct?.stock || 0} name="stock" className="w-full border rounded-xl p-3 text-sm" />
                  </div>
                </div>

                {/* 基本情報 */}
                <div className="bg-slate-50/50 rounded-2xl border border-slate-200/60 p-6 space-y-5 shadow-sm">
                  <div className="flex items-center gap-3 border-b border-slate-200/60 pb-3">
                    <span className="material-symbols-outlined text-[20px] text-blue-700 bg-blue-50 w-8 h-8 rounded-lg flex items-center justify-center">info</span>
                    <div>
                      <h4 className="font-bold text-slate-800 text-[15px]">基本情報</h4>
                      <p className="text-xs text-slate-400 mt-0.5 font-medium">商品のカテゴリ、名前、管理IDを管理します。</p>
                    </div>
                  </div>
                  <div className="space-y-5">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-2">商品名 <span className="text-red-500">*</span></label>
                      <input required defaultValue={editingProduct?.name || ""} name="name" className="w-full border border-slate-300 bg-white rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow" placeholder="例：レボリューションコーン赤白" />
                    </div>
                    <div className="flex gap-5">
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-500 mb-2 flex justify-between">
                          <span>カテゴリ <span className="text-red-500">*</span></span>
                        </label>
                        <div className="flex gap-2">
                          <select required defaultValue={editingProduct?.category || "カラーコーン"} name="category" className="flex-1 border border-slate-300 bg-white rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow">
                            {categoriesList.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                          <button type="button" className="font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-4 rounded-xl text-sm flex items-center gap-1 transition-colors">
                             <span className="material-symbols-outlined text-[18px]">add</span> 新規
                          </button>
                        </div>
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-500 mb-2">管理ID</label>
                        <input defaultValue={editingProduct?.id || ""} name="id" disabled={!!editingProduct} className="w-full border border-slate-300 bg-white rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow disabled:bg-slate-100 disabled:text-slate-500" placeholder="空欄で自動採番" />
                        <p className="text-xs text-slate-400 mt-1">{editingProduct ? "変更不可" : "空欄で自動採番"}</p>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-2">画像URL</label>
                      <input type="text" defaultValue={editingProduct?.image || ""} name="image" className="w-full border border-slate-300 bg-white rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow" placeholder="https://..." />
                    </div>
                  </div>
                </div>

                {/* 価格・在庫 */}
                <div className="bg-slate-50/50 rounded-2xl border border-slate-200/60 p-6 space-y-5 shadow-sm">
                  <div className="flex items-center gap-3 border-b border-slate-200/60 pb-3">
                    <span className="material-symbols-outlined text-[20px] text-emerald-700 bg-emerald-50 w-8 h-8 rounded-lg flex items-center justify-center">payments</span>
                    <div>
                      <h4 className="font-bold text-slate-800 text-[15px]">価格・在庫設定</h4>
                      <p className="text-xs text-slate-400 mt-0.5 font-medium">各種レンタル価格・販売価格および在庫数を設定します。</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-5 mb-5">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-2">レンタル単価（円/日）</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">¥</span>
                        <input type="number" defaultValue={editingProduct?.rentPrice || ""} name="rentPrice" className="w-full border border-slate-300 bg-white rounded-xl pl-7 pr-3 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow font-bold text-slate-700" placeholder="—" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-2">長期単価（円/日）</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">¥</span>
                        <input type="number" defaultValue={editingProduct?.rentPriceLongTerm || ""} name="rentPriceLongTerm" className="w-full border border-slate-300 bg-white rounded-xl pl-7 pr-3 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow font-bold text-slate-700" placeholder="—" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-2">販売価格（円）</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">¥</span>
                        <input type="number" defaultValue={editingProduct?.buyPrice || ""} name="buyPrice" className="w-full border border-slate-300 bg-white rounded-xl pl-7 pr-3 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow font-bold text-slate-700" placeholder="—" />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-5">
                    <div>
                       <label className="block text-xs font-bold text-slate-500 mb-2">在庫数</label>
                       <input type="number" required defaultValue={editingProduct?.stock || 0} name="stock" className="w-full border border-slate-300 bg-white rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow font-bold text-slate-700" />
                    </div>
                    <div>
                       <label className="block text-xs font-bold text-slate-500 mb-2">バッジ</label>
                       <select className="w-full border border-slate-300 bg-white rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow">
                         <option>レンタル</option>
                         <option>販売のみ</option>
                       </select>
                    </div>
                  </div>
                </div>

                {/* 保証料 */}
                <div className="bg-slate-50/50 rounded-2xl border border-slate-200/60 p-6 space-y-5 shadow-sm">
                  <div className="flex items-center gap-3 border-b border-slate-200/60 pb-3">
                    <span className="material-symbols-outlined text-[20px] text-purple-700 bg-purple-50 w-8 h-8 rounded-lg flex items-center justify-center">gavel</span>
                    <div>
                      <h4 className="font-bold text-slate-800 text-[15px]">保証料設定（準備費用）</h4>
                      <p className="text-xs text-slate-400 mt-0.5 font-medium">初回請求時のみに適用する保証準備費の設定を行います。</p>
                    </div>
                  </div>
                  <div className="mb-5">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        name="isGuarantee" 
                        checked={isGuaranteeChecked}
                        onChange={(e) => setIsGuaranteeChecked(e.target.checked)}
                        className="w-5 h-5 text-[#1a1c9a] rounded focus:ring-blue-500 border-slate-300 cursor-pointer" 
                      />
                      <span className="text-sm font-bold text-slate-800">この商品に保証料を設定する</span>
                    </label>
                  </div>
                  
                  {isGuaranteeChecked && (
                    <div className="mb-5 space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-2">保証料の計算タイプ</label>
                        <div className="flex gap-6">
                          <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                            <input 
                              type="radio" 
                              name="guaranteeType" 
                              value="flat" 
                              checked={guaranteeType === 'flat'} 
                              onChange={() => setGuaranteeType('flat')} 
                              className="text-[#1a1c9a] focus:ring-blue-500 cursor-pointer"
                            />
                            個数比例（1個あたり）
                          </label>
                          <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                            <input 
                              type="radio" 
                              name="guaranteeType" 
                              value="tiered" 
                              checked={guaranteeType === 'tiered'} 
                              onChange={() => setGuaranteeType('tiered')} 
                              className="text-[#1a1c9a] focus:ring-blue-500 cursor-pointer"
                            />
                            数量別（範囲一括）
                          </label>
                        </div>
                      </div>

                      {guaranteeType === 'flat' ? (
                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-2">保証料単価 (円/個)</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">¥</span>
                            <input 
                              name="guaranteeRate" 
                              defaultValue={editingProduct?.guaranteeRate || ""} 
                              type="number" 
                              className="w-full border border-slate-300 bg-white rounded-xl pl-7 pr-3 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow font-bold text-slate-700" 
                              placeholder="3000" 
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-slate-100 p-4 rounded-xl border border-slate-200/60 shadow-inner">
                          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                            <label className="block text-[11px] font-bold text-slate-500 mb-1.5">1〜50個</label>
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">¥</span>
                              <input name="guarantee_range1" defaultValue={editingProduct?.guaranteeFees?.range1 || ""} type="number" className="w-full border border-slate-200 rounded-lg pl-6 pr-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow font-bold text-slate-700" placeholder="0" />
                            </div>
                          </div>
                          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                            <label className="block text-[11px] font-bold text-slate-500 mb-1.5">51〜100個</label>
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">¥</span>
                              <input name="guarantee_range2" defaultValue={editingProduct?.guaranteeFees?.range2 || ""} type="number" className="w-full border border-slate-200 rounded-lg pl-6 pr-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow font-bold text-slate-700" placeholder="0" />
                            </div>
                          </div>
                          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                            <label className="block text-[11px] font-bold text-slate-500 mb-1.5">101〜150個</label>
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">¥</span>
                              <input name="guarantee_range3" defaultValue={editingProduct?.guaranteeFees?.range3 || ""} type="number" className="w-full border border-slate-200 rounded-lg pl-6 pr-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow font-bold text-slate-700" placeholder="0" />
                            </div>
                          </div>
                          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                            <label className="block text-[11px] font-bold text-slate-500 mb-1.5">151〜200個</label>
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">¥</span>
                              <input name="guarantee_range4" defaultValue={editingProduct?.guaranteeFees?.range4 || ""} type="number" className="w-full border border-slate-200 rounded-lg pl-6 pr-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow font-bold text-slate-700" placeholder="0" />
                            </div>
                          </div>
                          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                            <label className="block text-[11px] font-bold text-slate-500 mb-1.5">201〜250個</label>
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">¥</span>
                              <input name="guarantee_range5" defaultValue={editingProduct?.guaranteeFees?.range5 || ""} type="number" className="w-full border border-slate-200 rounded-lg pl-6 pr-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow font-bold text-slate-700" placeholder="0" />
                            </div>
                          </div>
                          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                            <label className="block text-[11px] font-bold text-slate-500 mb-1.5">251個〜</label>
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">¥</span>
                              <input name="guarantee_range6" defaultValue={editingProduct?.guaranteeFees?.range6 || ""} type="number" className="w-full border border-slate-200 rounded-lg pl-6 pr-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow font-bold text-slate-700" placeholder="0" />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <p className="text-[13px] text-slate-500 bg-slate-100/50 p-4 rounded-xl border border-slate-200/60 leading-relaxed">
                    ※ 初回レンタル時のみ適用される準備費用です。ご延長の際には保証料はかかりません。複数月レンタルの場合、初月の請求書にのみ計上されます。
                  </p>
                </div>

                {/* 詳細 */}
                <div className="bg-slate-50/50 rounded-2xl border border-slate-200/60 p-6 space-y-5 shadow-sm">
                  <div className="flex items-center gap-3 border-b border-slate-200/60 pb-3">
                    <span className="material-symbols-outlined text-[20px] text-amber-700 bg-amber-50 w-8 h-8 rounded-lg flex items-center justify-center">notes</span>
                    <div>
                      <h4 className="font-bold text-slate-800 text-[15px]">商品説明</h4>
                      <p className="text-xs text-slate-400 mt-0.5 font-medium">現場での用途や特徴などを詳細に入力します。</p>
                    </div>
                  </div>
                  <div>
                    <textarea name="description" defaultValue={editingProduct?.description || ""} className="w-full border border-slate-300 bg-white rounded-xl p-4 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow min-h-[120px]" placeholder="現場での用途や特徴など"></textarea>
                  </div>
                </div>

              </form>
            </div>
            <div className="px-8 py-5 border-t bg-white flex justify-end gap-4">
              <button form="productForm" type="submit" className="px-8 py-3 text-white bg-[#1a1c9a] font-bold rounded-xl">保存する</button>
            </div>
          </div>
        </div>
      )}

      {/* Vehicle Modal */}
      {isVehicleModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
           {/* Previous vehicle form implementation */}
          <div className="bg-white rounded-2xl w-full max-w-[800px] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="px-8 py-5 border-b border-slate-200 flex justify-between items-center bg-white sticky top-0 z-10 shrink-0">
              <div>
                <h2 className="text-[22px] font-bold text-slate-800 flex items-center gap-3">{editingVehicle ? "保安車両を編集" : "保安車両を追加"}</h2>
                <p className="text-slate-500 text-sm mt-1">{editingVehicle ? editingVehicle.id : "新規登録"}</p>
              </div>
              <button type="button" onClick={() => setIsVehicleModalOpen(false)} className="w-[38px] h-[38px] flex items-center justify-center rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-500 transition-colors border border-slate-200">
                <span className="material-symbols-outlined text-[24px]">close</span>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-8">
              <form id="vehicleForm" onSubmit={saveVehicle} className="space-y-8">
                {/* 車両データ */}
                <div className="bg-slate-50/50 rounded-2xl border border-slate-200/60 p-6 space-y-5 shadow-sm">
                  <div className="flex items-center gap-3 border-b border-slate-200/60 pb-3">
                    <span className="material-symbols-outlined text-[20px] text-emerald-700 bg-emerald-50 w-8 h-8 rounded-lg flex items-center justify-center">local_shipping</span>
                    <div>
                      <h4 className="font-bold text-slate-800 text-[15px]">車両データ</h4>
                      <p className="text-xs text-slate-400 mt-0.5 font-medium">車両のカテゴリ、モデル、ナンバー、運行状況を管理します。</p>
                    </div>
                  </div>
                  <div className="space-y-5">
                    <div>
                      <label className="block text-xs font-bold text-slate-505 mb-2">カテゴリ</label>
                      <select name="category" defaultValue={editingVehicle?.category || "軽トラック"} className="w-full border border-slate-300 bg-white rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none">
                        <option value="軽トラック">軽トラック</option>
                        <option value="軽バン">軽バン</option>
                        <option value="2tノーマル">2tノーマル</option>
                        <option value="2tロング">2tロング</option>
                        <option value="2t Wキャブノーマル">2t Wキャブノーマル</option>
                      </select>
                    </div>
                    <div className="flex gap-5">
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-500 mb-2">モデル／商品名 <span className="text-red-500">*</span></label>
                        <input required defaultValue={editingVehicle?.name || ""} name="name" className="w-full border border-slate-300 bg-white rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none" />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-500 mb-2">在庫数（台数） <span className="text-red-500">*</span></label>
                        <input type="number" required defaultValue={editingVehicle?.stock || 1} name="stock" className="w-full border border-slate-300 bg-white rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none font-bold text-slate-700" />
                      </div>
                    </div>
                    <div className="flex gap-5">
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-500 mb-2">代表ナンバー（識別用）</label>
                        <input defaultValue={editingVehicle?.plate || ""} name="plate" className="w-full border border-slate-300 bg-white rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none" placeholder="例：品川 500 さ 12-34" />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-500 mb-2">状況</label>
                        <select name="status" defaultValue={editingVehicle?.status || "使用中"} className="w-full border border-slate-300 bg-white rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none">
                          <option value="使用中">使用中</option>
                          <option value="整備中">整備中</option>
                          <option value="空き">空き</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 価格設定 */}
                <div className="bg-slate-50/50 rounded-2xl border border-slate-200/60 p-6 space-y-5 shadow-sm">
                  <div className="flex items-center gap-3 border-b border-slate-200/60 pb-3">
                    <span className="material-symbols-outlined text-[20px] text-blue-700 bg-blue-50 w-8 h-8 rounded-lg flex items-center justify-center">payments</span>
                    <div>
                      <h4 className="font-bold text-slate-800 text-[15px]">価格設定（表示用）</h4>
                      <p className="text-xs text-slate-400 mt-0.5 font-medium">レンタル注文時および請求書に適用される単価を設定します。</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-5 mb-5">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-2">レンタル単価（円/日）</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">¥</span>
                        <input type="number" defaultValue={editingVehicle ? (products.find(p => p && p.id === (editingVehicle.productId || editingVehicle.id))?.rentPrice || 3500) : 3500} name="rentPrice" className="w-full border border-slate-300 bg-white rounded-xl pl-7 pr-3 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none font-bold text-slate-700" placeholder="—" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-2">長期単価（円/日）</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">¥</span>
                        <input type="number" defaultValue={editingVehicle ? (products.find(p => p && p.id === (editingVehicle.productId || editingVehicle.id))?.rentPriceLongTerm || 2100) : 2100} name="rentPriceLongTerm" className="w-full border border-slate-300 bg-white rounded-xl pl-7 pr-3 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none font-bold text-slate-700" placeholder="—" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-2">販売価格（円）</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">¥</span>
                        <input type="number" defaultValue={editingVehicle ? (products.find(p => p && p.id === (editingVehicle.productId || editingVehicle.id))?.buyPrice || "") : ""} name="buyPrice" className="w-full border border-slate-300 bg-white rounded-xl pl-7 pr-3 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none font-bold text-slate-700" placeholder="—" />
                      </div>
                    </div>
                  </div>
                </div>
                 
                {/* メディア設定 */}
                <div className="bg-slate-50/50 rounded-2xl border border-slate-200/60 p-6 space-y-5 shadow-sm">
                  <div className="flex items-center gap-3 border-b border-slate-200/60 pb-3">
                    <span className="material-symbols-outlined text-[20px] text-purple-700 bg-purple-50 w-8 h-8 rounded-lg flex items-center justify-center">image</span>
                    <div>
                      <h4 className="font-bold text-slate-800 text-[15px]">メディア設定</h4>
                      <p className="text-xs text-slate-400 mt-0.5 font-medium">車両の紹介画像URLを管理します。</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">画像URL</label>
                    <input type="text" defaultValue={editingVehicle ? (products.find(p => p && p.id === (editingVehicle.productId || editingVehicle.id))?.image || "") : ""} name="image" className="w-full border border-slate-300 bg-white rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none" placeholder="https://" />
                  </div>
                </div>
                 
              </form>
            </div>
            <div className="px-8 py-5 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0">
              <button type="button" onClick={() => setIsVehicleModalOpen(false)} className="px-6 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 rounded-xl transition-colors">
                キャンセル
              </button>
              <button form="vehicleForm" type="submit" className="px-8 py-3 text-sm font-bold text-white bg-[#1a1c9a] hover:bg-blue-800 rounded-xl shadow-sm flex items-center gap-2 transition-colors">
                <span className="material-symbols-outlined text-[18px]">save</span>
                {editingVehicle ? "変更を保存" : "登録する"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Add Modal with Advanced Interactive Spreadsheet Cells */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-[1100px] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-[fadeIn_0.2s_ease-out]">
            <div className="px-8 py-5 border-b border-slate-200 flex justify-between items-center bg-white sticky top-0 z-10 shrink-0">
              <div>
                <h2 className="text-[20px] font-bold text-slate-800 flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-blue-600 bg-blue-50 w-8 h-8 rounded-full flex items-center justify-center">grid_on</span>
                  保安用品一括追加 (Live Spreadsheet UI)
                </h2>
                <p className="text-slate-500 text-xs mt-0.5">左側に入力したテキストが右側でスプレッドシート化されます。セルを直接クリックしてインライン修正が可能です。</p>
              </div>
              <button type="button" onClick={() => { setIsBulkModalOpen(false); setBulkText(""); setBulkItems([]); }} className="w-8 h-8 border rounded-full text-slate-400">✕</button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 bg-slate-50/50">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full items-stretch">
                
                {/* Left Side: Original Raw Textarea */}
                <div className="lg:col-span-4 flex flex-col space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-700">CSV/TSV テキストデータ入力</label>
                    <button 
                      type="button" 
                      onClick={() => {
                        setBulkText(
                          "LEDコーンバー 黄黒,カラーコーン,200,150,800,100\n" +
                          ",カラーコーン,150,100,500,200\n" + 
                          "クッションドラム 黄黒,その他,1500,1000,25000,20\n" +
                          "ポータブルガス検知器,ガス検知器,2500,1800,85000,15\n" +
                          "セイフティブロック 20m,,3500,2500,110000,8" 
                        );
                      }}
                      className="text-[11px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-1 rounded hover:bg-blue-100 cursor-pointer"
                    >
                      テスト用読込
                    </button>
                  </div>
                  <textarea 
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    className="w-full flex-1 min-h-[350px] font-mono text-xs p-3.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none resize-none bg-white shadow-inner"
                    placeholder="商品名,カテゴリ,レンタル単価,長期単価,販売価格,在庫数"
                  />
                </div>

                {/* Right Side: Interactive Live Inline Spreadsheet */}
                <div className="lg:col-span-8 flex flex-col">
                  <div className="text-xs font-bold text-slate-700 mb-3 flex items-center justify-between">
                    <span>リアルタイムスプレッドシート（直接編集可能）</span>
                    <span className="px-2 py-0.5 rounded bg-slate-200/80 font-mono text-slate-600 font-bold">{bulkItems.length} 件解析</span>
                  </div>

                  <div className="flex-1 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm flex flex-col min-h-[350px]">
                    {bulkItems.length > 0 ? (
                      <div className="overflow-auto max-h-[500px]">
                        <table className="w-full text-left border-collapse text-xs table-fixed">
                          <thead>
                            <tr className="bg-slate-100/90 border-b border-slate-200 sticky top-0 z-10">
                              <th className="p-2.5 font-bold text-slate-600 w-[50px] text-center">状態</th>
                              <th className="p-2.5 font-bold text-slate-600 w-[200px]">商品名 *</th>
                              <th className="p-2.5 font-bold text-slate-600 w-[120px]">カテゴリ *</th>
                              <th className="p-2.5 font-bold text-slate-600 w-[85px] text-right">日単価</th>
                              <th className="p-2.5 font-bold text-slate-600 w-[85px] text-right">長期</th>
                              <th className="p-2.5 font-bold text-slate-600 w-[85px] text-right">販売</th>
                              <th className="p-2.5 font-bold text-slate-600 w-[70px] text-right">在庫</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-150">
                            {bulkItems.map((row, idx) => (
                              <tr key={idx} className={row.error ? "bg-red-50/70" : "hover:bg-slate-50/50"}>
                                <td className="p-2 text-center">
                                  {row.error ? (
                                    <span className="material-symbols-outlined text-red-500 font-bold text-[18px]" title={row.error}>error</span>
                                  ) : (
                                    <span className="material-symbols-outlined text-emerald-500 font-bold text-[18px]">check_circle</span>
                                  )}
                                </td>
                                <td className="p-1">
                                  <input 
                                    type="text" 
                                    value={row.name} 
                                    onChange={(e) => updateBulkItemCell(idx, "name", e.target.value)}
                                    className={`w-full p-1.5 font-bold rounded outline-none border transition-colors ${row.error && !row.name ? "border-red-400 bg-red-50" : "border-transparent focus:border-blue-400 focus:bg-white"}`}
                                  />
                                </td>
                                <td className="p-1">
                                  <input 
                                    type="text" 
                                    value={row.category} 
                                    onChange={(e) => updateBulkItemCell(idx, "category", e.target.value)}
                                    className={`w-full p-1.5 rounded outline-none border text-slate-700 transition-colors ${row.error && !row.category ? "border-red-400 bg-red-50" : "border-transparent focus:border-blue-400 focus:bg-white"}`}
                                  />
                                </td>
                                <td className="p-1">
                                  <input 
                                    type="number" 
                                    value={row.rentPrice || ""} 
                                    onChange={(e) => updateBulkItemCell(idx, "rentPrice", e.target.value)}
                                    className="w-full p-1.5 rounded border border-transparent focus:border-blue-400 focus:bg-white outline-none text-right font-mono font-bold text-slate-700"
                                  />
                                </td>
                                <td className="p-1">
                                  <input 
                                    type="number" 
                                    value={row.rentPriceLongTerm || ""} 
                                    onChange={(e) => updateBulkItemCell(idx, "rentPriceLongTerm", e.target.value)}
                                    className="w-full p-1.5 rounded border border-transparent focus:border-blue-400 focus:bg-white outline-none text-right font-mono text-slate-600"
                                  />
                                </td>
                                <td className="p-1">
                                  <input 
                                    type="number" 
                                    value={row.buyPrice || ""} 
                                    onChange={(e) => updateBulkItemCell(idx, "buyPrice", e.target.value)}
                                    className="w-full p-1.5 rounded border border-transparent focus:border-blue-400 focus:bg-white outline-none text-right font-mono text-slate-600"
                                  />
                                </td>
                                <td className="p-1">
                                  <input 
                                    type="number" 
                                    value={row.stock || 0} 
                                    onChange={(e) => updateBulkItemCell(idx, "stock", e.target.value)}
                                    className="w-full p-1.5 rounded border border-transparent focus:border-blue-400 focus:bg-white outline-none text-right font-mono font-bold text-slate-800"
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                        <span className="material-symbols-outlined text-[36px] text-slate-300 mb-1">view_spreadsheet</span>
                        <p className="font-bold text-xs">データがありません</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="px-8 py-4 border-t border-slate-200 bg-white flex justify-between items-center shrink-0">
              <div className="text-xs font-bold text-slate-500">
                {bulkItems.length > 0 && (
                  <div className="flex gap-4">
                    <span className="text-emerald-600">正常アイテム: {bulkItems.filter(r => !r.error).length} 件</span>
                    {bulkItems.some(r => r.error) && <span className="text-red-500 font-bold">エラー項目: {bulkItems.filter(r => r.error).length} 件</span>}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setIsBulkModalOpen(false); setBulkText(""); setBulkItems([]); }} className="px-5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer">キャンセル</button>
                <button 
                  type="button" 
                  onClick={handleBulkSubmit}
                  disabled={bulkItems.filter(r => !r.error).length === 0}
                  className="px-6 py-2 text-xs font-bold text-white bg-[#1a1c9a] rounded-xl shadow-sm disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer disabled:cursor-not-allowed"
                >
                  {bulkItems.filter(r => r.error).length > 0 ? "エラーを除いて一括追加を実行" : "一括登録を実行"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
