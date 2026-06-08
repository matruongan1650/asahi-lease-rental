import React, { useState } from "react";
import { useProducts } from "../context/ProductContext";
import { useVehicles } from "../context/VehicleContext";
import { Product } from "../types";
import { isVehicleCategory } from "../utils/productUtils";

export default function AdminProductManagement() {
  const { products, addProduct, updateProduct, deleteProduct } = useProducts();
  const { vehicles, addVehicle, updateVehicle, deleteVehicle } = useVehicles();
  
  const [activeSubTab, setActiveSubTab] = useState<"security" | "vehicles">("security");
  const [searchQuery, setSearchQuery] = useState("");
  
  const securityProducts = (products || []).filter(p => !isVehicleCategory(p?.category));
  // Filter functionality
  const filteredProducts = securityProducts.filter(p => 
    p?.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p?.category?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p?.id?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const filteredVehicles = (vehicles || []).filter(v => 
    v?.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    v?.plate?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v?.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalStock = securityProducts.reduce((acc, p) => acc + (p.stock || 0), 0);

  // Modal State
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isGuaranteeChecked, setIsGuaranteeChecked] = useState(false);

  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");

  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<any | null>(null);

  const handleAddProduct = () => {
    setEditingProduct(null);
    setIsGuaranteeChecked(false);
    setIsProductModalOpen(true);
  };

  const handleEditProduct = (p: Product) => {
    setEditingProduct(p);
    setIsGuaranteeChecked(!!p.isGuarantee);
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
      guaranteeFees: isGuaranteeChecked ? {
        range1: Number(formData.get("guarantee_range1")) || 0,
        range2: Number(formData.get("guarantee_range2")) || 0,
        range3: Number(formData.get("guarantee_range3")) || 0,
        range4: Number(formData.get("guarantee_range4")) || 0,
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

      // Skip CSV/TSV header lines
      if (
        name === "商品名" ||
        name.toLowerCase() === "name" ||
        category === "カテゴリ" ||
        category.toLowerCase() === "category"
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

  const handleBulkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseBulkText(bulkText);
    const validItems = parsed.filter((item) => !item.error);

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
    alert(`${validItems.length}件の保安用品を一括追加しました。`);
  };

  const handleAddVehicle = () => {
    setEditingVehicle(null);
    setIsVehicleModalOpen(true);
  };

  const handleEditVehicle = (v: any) => {
    setEditingVehicle(v);
    setIsVehicleModalOpen(true);
  };

  const handleDeleteVehicle = (id: string) => {
    if (window.confirm("この車両を削除してもよろしいですか？")) {
      deleteVehicle(id);
      const v = vehicles.find(vh => vh.id === id);
      if (v?.productId) {
         deleteProduct(v.productId);
      }
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
      const linkedProduct = products.find(p => p.id === vProdId);
      if (linkedProduct) {
         updateProduct(vProdId, { name: vehicleData.name, category: vehicleData.category, rentPrice, rentPriceLongTerm, buyPrice, image: formData.get("image") as string || linkedProduct.image, stock });
      }
    } else {
      const vid = "veh_" + Date.now();
      const pid = "vprod_" + Date.now();

      addVehicle({
        id: vid,
        productId: pid,
        category: category,
        statusColor: vehicleData.status === "使用中" ? "emerald" : vehicleData.status === "整備中" ? "orange" : "blue",
        ...vehicleData
      });
      // automatically sync to products list
      addProduct({
        id: pid,
        name: vehicleData.name,
        category: category,
        stock: stock,
        rentPrice: rentPrice,
        rentPriceLongTerm: rentPriceLongTerm,
        buyPrice: buyPrice,
        image: formData.get("image") as string || "https://imagedelivery.net/W-O2N6-kYOfvEexU-w0YSA/6ca65aee-8da0-466f-ff84-9de55ae2ee00/public" // Generic Van URL placeholder for now
      });
    }
    setIsVehicleModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-2 text-slate-500 mb-2 font-bold text-sm">
            <span className="material-symbols-outlined text-[20px] text-blue-600 bg-blue-50 w-8 h-8 rounded-full flex items-center justify-center">security</span>
            保安用品
          </div>
          <div className="text-4xl font-black text-slate-800 mt-4">
            {securityProducts.length}<span className="text-lg font-bold ml-1 text-slate-700">品目</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-2 text-slate-500 mb-2 font-bold text-sm">
            <span className="material-symbols-outlined text-[20px] text-emerald-600 bg-emerald-50 w-8 h-8 rounded-full flex items-center justify-center">local_shipping</span>
            保安車両
          </div>
          <div className="text-4xl font-black text-slate-800 mt-4">
            {vehicles.length}<span className="text-lg font-bold ml-1 text-slate-700">台種</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-2 text-slate-500 mb-2 font-bold text-sm">
            <span className="material-symbols-outlined text-[20px] text-purple-600 bg-purple-50 w-8 h-8 rounded-full flex items-center justify-center">inventory_2</span>
            保安用品 在庫合計
          </div>
          <div className="text-4xl font-black text-slate-800 mt-4">
            {totalStock}<span className="text-lg font-bold ml-1 text-slate-700">点</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex gap-8">
          <button 
            className={`pb-3 text-[15px] font-bold transition-colors ${activeSubTab === 'security' ? 'text-blue-700 border-b-[3px] border-blue-700' : 'text-slate-500 hover:text-slate-800'}`}
            onClick={() => setActiveSubTab("security")}
          >
            保安用品 ({securityProducts.length})
          </button>
          <button 
            className={`pb-3 text-[15px] font-bold transition-colors ${activeSubTab === 'vehicles' ? 'text-blue-700 border-b-[3px] border-blue-700' : 'text-slate-500 hover:text-slate-800'}`}
            onClick={() => setActiveSubTab("vehicles")}
          >
            保安車両 ({vehicles.length})
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex justify-between items-center gap-4 mt-6">
        <div className="relative flex-1 max-w-[400px]">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">search</span>
          <input 
            type="text" 
            placeholder="商品名・カテゴリ・IDで検索" 
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {activeSubTab === 'security' && (
            <button 
              onClick={() => setIsBulkModalOpen(true)} 
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">library_add</span>
              一括追加
            </button>
          )}
          <button 
            onClick={activeSubTab === 'security' ? handleAddProduct : handleAddVehicle} 
            className="bg-[#1a1c9a] hover:bg-blue-800 text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            {activeSubTab === 'security' ? '保安用品 を追加' : '保安車両 を追加'}
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mt-6">
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
              <tr className="bg-white border-b border-slate-100">
                <th className="p-4 text-xs font-bold text-slate-500 w-[300px]">商品</th>
                <th className="p-4 text-xs font-bold text-slate-500 w-[150px]">カテゴリ</th>
                <th className="p-4 text-xs font-bold text-slate-500 whitespace-nowrap">レンタル単価</th>
                <th className="p-4 text-xs font-bold text-slate-500 whitespace-nowrap">長期単価</th>
                <th className="p-4 text-xs font-bold text-slate-500 whitespace-nowrap">販売価格</th>
                <th className="p-4 text-xs font-bold text-slate-500">在庫</th>
                <th className="p-4 text-xs font-bold text-slate-500">保証料</th>
                <th className="p-4 text-xs font-bold text-slate-500 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeSubTab === 'security' ? (
                filteredProducts.map(product => (
                  <tr key={product.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-white rounded-lg flex-shrink-0 bg-contain bg-center bg-no-repeat border border-slate-200 p-1" style={{backgroundImage: `url("${product.image}")`}}></div>
                        <div>
                          <div className="font-bold text-slate-800 text-sm">{product.name}</div>
                          <div className="text-xs text-slate-400 font-mono mt-0.5">{product.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-slate-600">{product.category}</td>
                    <td className="p-4 text-sm font-bold text-slate-800">
                      {product.rentPrice ? `¥${product.rentPrice.toLocaleString()}/日` : "—"}
                    </td>
                    <td className="p-4 text-sm text-slate-600">
                      {product.rentPriceLongTerm ? `¥${product.rentPriceLongTerm.toLocaleString()}` : "—"}
                    </td>
                    <td className="p-4 text-sm text-slate-600">
                      {product.buyPrice ? `¥${product.buyPrice.toLocaleString()}` : "—"}
                    </td>
                    <td className="p-4">
                      <span className="font-bold text-slate-800">{product.stock || 0}</span>
                    </td>
                    <td className="p-4 text-slate-400 text-sm">—</td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleEditProduct(product)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors text-xs font-bold">
                          <span className="material-symbols-outlined text-[16px]">edit</span> 編集
                        </button>
                        <button onClick={() => handleDeleteProduct(product.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors text-xs font-bold bg-white">
                          <span className="material-symbols-outlined text-[16px]">delete</span> 削除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                filteredVehicles.map(v => {
                  const linkedProduct = products.find(p => p.id === (v.productId || v.id));
                  return (
                  <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-white rounded-lg flex-shrink-0 bg-contain bg-center bg-no-repeat border border-slate-200" style={{backgroundImage: `url("${linkedProduct?.image || ''}")`}}></div>
                        <div>
                          <div className="font-bold text-slate-800 text-sm flex items-center gap-2">
                            {v.name}
                            <span className="material-symbols-outlined text-[16px] text-orange-400">star</span>
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">{v.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-slate-600">{v.category}</td>
                    <td className="p-4 text-sm font-bold text-slate-800">
                      {linkedProduct?.rentPrice ? `¥${linkedProduct.rentPrice.toLocaleString()}/日` : "—"}
                    </td>
                    <td className="p-4 text-sm text-slate-600">
                      {linkedProduct?.rentPriceLongTerm ? `¥${linkedProduct.rentPriceLongTerm.toLocaleString()}` : "—"}
                    </td>
                    <td className="p-4 text-sm text-slate-600">
                      {linkedProduct?.buyPrice ? `¥${linkedProduct.buyPrice.toLocaleString()}` : "—"}
                    </td>
                    <td className="p-4">
                      <span className="font-bold text-slate-800">{v.stock || linkedProduct?.stock || 0}</span>
                    </td>
                    <td className="p-4 text-slate-400 text-sm">—</td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleEditVehicle(v)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors text-xs font-bold">
                          <span className="material-symbols-outlined text-[16px]">edit</span> 編集
                        </button>
                        <button onClick={() => handleDeleteVehicle(v.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors text-xs font-bold bg-white">
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
          {((activeSubTab === 'security' && filteredProducts.length === 0) || (activeSubTab === 'vehicles' && filteredVehicles.length === 0)) && (
            <div className="p-8 text-center text-slate-500">
              見つかりませんでした。
            </div>
          )}
        </div>
      </div>

      {/* Product Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-[800px] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="px-8 py-5 border-b border-slate-200 flex justify-between items-center bg-white sticky top-0 z-10 shrink-0">
              <div>
                <h2 className="text-[22px] font-bold text-slate-800 flex items-center gap-3">
                  {editingProduct ? "商品を編集" : "保安用品を追加"}
                </h2>
                <p className="text-slate-500 text-sm mt-1">{editingProduct ? editingProduct.id : "新規登録"}</p>
              </div>
              <button type="button" onClick={() => setIsProductModalOpen(false)} className="w-[38px] h-[38px] flex items-center justify-center rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-500 transition-colors">
                <span className="material-symbols-outlined text-[24px]">close</span>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-8">
              <form id="productForm" onSubmit={saveProduct} className="space-y-8">
                
                {/* Header preview in modal */}
                <div className="flex items-center gap-5 py-5 px-6 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="w-20 h-20 bg-white rounded-xl flex items-center justify-center border border-slate-200 overflow-hidden p-2">
                    {editingProduct?.image ? (
                       <img src={editingProduct.image} alt="" className="w-full h-full object-contain" />
                    ) : (
                       <span className="material-symbols-outlined text-slate-300 text-[32px]">image_not_supported</span>
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-xl leading-tight">{editingProduct?.name || "(商品名未入力)"}</h3>
                    <p className="text-sm text-slate-500 mt-1">保安用品 ・ {editingProduct?.category || "カラーコーン"}</p>
                  </div>
                </div>

                {/* 基本情報 */}
                <div>
                  <h4 className="flex items-center gap-2 font-bold text-slate-800 text-[15px] mb-5">
                    <span className="w-1.5 h-4 bg-[#1a1c9a] rounded-full inline-block"></span>
                    基本情報
                  </h4>
                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">商品名 <span className="text-red-500">*</span></label>
                      <input required defaultValue={editingProduct?.name || ""} name="name" className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow" placeholder="例：レボリューションコーン赤白" />
                    </div>
                    <div className="flex gap-5">
                      <div className="flex-1">
                        <label className="block text-sm font-bold text-slate-700 mb-2 flex justify-between">
                          <span>カテゴリ <span className="text-red-500">*</span></span>
                        </label>
                        <div className="flex gap-2">
                          <select required defaultValue={editingProduct?.category || "カラーコーン"} name="category" className="flex-1 border border-slate-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow">
                            <option value="ガス検知器">ガス検知器</option>
                            <option value="セイフティブロック">セイフティブロック</option>
                            <option value="発電機">発電機</option>
                            <option value="カラーコーン">カラーコーン</option>
                            <option value="その他">その他</option>
                          </select>
                          <button type="button" className="font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-4 rounded-xl text-sm flex items-center gap-1 transition-colors">
                             <span className="material-symbols-outlined text-[18px]">add</span> 新規
                          </button>
                        </div>
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm font-bold text-slate-700 mb-2">管理ID</label>
                        <input defaultValue={editingProduct?.id || ""} name="id" disabled={!!editingProduct} className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow disabled:bg-slate-50 disabled:text-slate-500" placeholder="空欄で自動採番" />
                        <p className="text-xs text-slate-400 mt-1">{editingProduct ? "変更不可" : "空欄で自動採番"}</p>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">画像URL</label>
                      <input type="text" defaultValue={editingProduct?.image || ""} name="image" className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow" placeholder="https://..." />
                    </div>
                  </div>
                </div>

                {/* 価格・在庫 */}
                <div>
                  <h4 className="flex items-center gap-2 font-bold text-slate-800 text-[15px] mb-5">
                    <span className="w-1.5 h-4 bg-[#1a1c9a] rounded-full inline-block"></span>
                    価格・在庫
                  </h4>
                  <div className="grid grid-cols-3 gap-5 mb-5">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">レンタル単価（円/日）</label>
                      <input type="number" defaultValue={editingProduct?.rentPrice || ""} name="rentPrice" className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow" placeholder="—" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">長期単価（円/日）</label>
                      <input type="number" defaultValue={editingProduct?.rentPriceLongTerm || ""} name="rentPriceLongTerm" className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow" placeholder="—" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">販売価格（円）</label>
                      <input type="number" defaultValue={editingProduct?.buyPrice || ""} name="buyPrice" className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow" placeholder="—" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-5">
                    <div>
                       <label className="block text-sm font-bold text-slate-700 mb-2">在庫数</label>
                       <input type="number" required defaultValue={editingProduct?.stock || 0} name="stock" className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow" />
                    </div>
                    <div>
                       <label className="block text-sm font-bold text-slate-700 mb-2">バッジ</label>
                       <select className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow">
                         <option>レンタル</option>
                         <option>販売のみ</option>
                       </select>
                    </div>
                  </div>
                </div>

                {/* 保証料 */}
                <div>
                  <h4 className="flex items-center gap-2 font-bold text-slate-800 text-[15px] mb-5">
                    <span className="w-1.5 h-4 bg-[#1a1c9a] rounded-full inline-block"></span>
                    保証料（数量別・円・初回のみ）
                  </h4>
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
                    <div className="grid grid-cols-2 gap-5 mb-5">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">1〜50個（円）</label>
                        <input name="guarantee_range1" defaultValue={editingProduct?.guaranteeFees?.range1 || ""} type="number" className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow" placeholder="0" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">51〜100個（円）</label>
                        <input name="guarantee_range2" defaultValue={editingProduct?.guaranteeFees?.range2 || ""} type="number" className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow" placeholder="0" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">101〜150個（円）</label>
                        <input name="guarantee_range3" defaultValue={editingProduct?.guaranteeFees?.range3 || ""} type="number" className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow" placeholder="0" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">151〜200個（円）</label>
                        <input name="guarantee_range4" defaultValue={editingProduct?.guaranteeFees?.range4 || ""} type="number" className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow" placeholder="0" />
                      </div>
                    </div>
                  )}
                  <p className="text-sm text-slate-500 bg-slate-50 p-5 rounded-xl border border-slate-200">
                    初回レンタル時のみ適用される準備費用です。ご延長のご場合は保証料はかかりません。複数月レンタルの場合、初月の請求書にのみ計上されます。
                  </p>
                </div>

                {/* 詳細 */}
                <div>
                  <h4 className="flex items-center gap-2 font-bold text-slate-800 text-[15px] mb-5">
                    <span className="w-1.5 h-4 bg-[#1a1c9a] rounded-full inline-block"></span>
                    詳細
                  </h4>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">商品説明</label>
                    <textarea name="description" defaultValue={editingProduct?.description || ""} className="w-full border border-slate-300 rounded-xl p-4 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow min-h-[120px]" placeholder="現場での用途や特徴など"></textarea>
                  </div>
                </div>

              </form>
            </div>
            
            <div className="px-8 py-5 border-t border-slate-200 bg-white flex justify-end gap-4 shrink-0">
              <button type="button" onClick={() => setIsProductModalOpen(false)} className="px-6 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 rounded-xl transition-colors">
                キャンセル
              </button>
              <button form="productForm" type="submit" className="px-8 py-3 text-sm font-bold text-white bg-[#1a1c9a] hover:bg-blue-800 rounded-xl shadow-sm flex items-center gap-2 transition-colors">
                <span className="material-symbols-outlined text-[18px]">save</span>
                {editingProduct ? "変更を保存" : "登録する"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vehicle Modal - Keep simple for now, can be expanded later to match */}
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
                <div>
                   <h4 className="flex items-center gap-2 font-bold text-slate-800 text-[15px] mb-5">
                     <span className="w-1.5 h-4 bg-[#1a1c9a] rounded-full inline-block"></span>
                     車両データ
                   </h4>
                   <div className="space-y-5">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">カテゴリ</label>
                        <select name="category" defaultValue={editingVehicle?.category || "軽トラック"} className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none">
                          <option value="軽トラック">軽トラック</option>
                          <option value="軽バン">軽バン</option>
                          <option value="2tノーマル">2tノーマル</option>
                          <option value="2tロング">2tロング</option>
                          <option value="2t Wキャブノーマル">2t Wキャブノーマル</option>
                        </select>
                      </div>
                      <div className="flex gap-5">
                        <div className="flex-1">
                          <label className="block text-sm font-bold text-slate-700 mb-2">モデル／商品名 <span className="text-red-500">*</span></label>
                          <input required defaultValue={editingVehicle?.name || ""} name="name" className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none" />
                        </div>
                        <div className="flex-1">
                          <label className="block text-sm font-bold text-slate-700 mb-2">在庫数（台数） <span className="text-red-500">*</span></label>
                          <input type="number" required defaultValue={editingVehicle?.stock || 1} name="stock" className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none" />
                        </div>
                      </div>
                      <div className="flex gap-5">
                        <div className="flex-1">
                          <label className="block text-sm font-bold text-slate-700 mb-2">代表ナンバー（識別用）</label>
                          <input defaultValue={editingVehicle?.plate || ""} name="plate" className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none" />
                        </div>
                        <div className="flex-1">
                          <label className="block text-sm font-bold text-slate-700 mb-2">状況</label>
                          <select name="status" defaultValue={editingVehicle?.status || "使用中"} className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none">
                            <option value="使用中">使用中</option>
                            <option value="整備中">整備中</option>
                            <option value="空き">空き</option>
                          </select>
                        </div>
                      </div>
                   </div>
                </div>

                <div>
                   <h4 className="flex items-center gap-2 font-bold text-slate-800 text-[15px] mb-5">
                     <span className="w-1.5 h-4 bg-[#1a1c9a] rounded-full inline-block"></span>
                     価格設定（表示用）
                   </h4>
                    <div className="grid grid-cols-3 gap-5 mb-5">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">レンタル単価（円/日）</label>
                        <input type="number" defaultValue={editingVehicle ? (products.find(p => p.id === (editingVehicle.productId || editingVehicle.id))?.rentPrice || 3500) : 3500} name="rentPrice" className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none" placeholder="—" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">長期単価（円/日）</label>
                        <input type="number" defaultValue={editingVehicle ? (products.find(p => p.id === (editingVehicle.productId || editingVehicle.id))?.rentPriceLongTerm || 2100) : 2100} name="rentPriceLongTerm" className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none" placeholder="—" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">販売価格（円）</label>
                        <input type="number" defaultValue={editingVehicle ? (products.find(p => p.id === (editingVehicle.productId || editingVehicle.id))?.buyPrice || "") : ""} name="buyPrice" className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none" placeholder="—" />
                      </div>
                    </div>
                </div>
                 
                 <div>
                   <label className="block text-sm font-bold text-slate-700 mb-2">画像URL</label>
                   <input type="text" defaultValue={editingVehicle ? (products.find(p => p.id === (editingVehicle.productId || editingVehicle.id))?.image || "") : ""} name="image" className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none" placeholder="https://" />
                 </div>
                 
              </form>
            </div>
            <div className="px-8 py-5 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0">
               <button type="button" onClick={() => setIsVehicleModalOpen(false)} className="px-6 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 rounded-xl transition-colors">
                 キャンセル
               </button>
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

      {/* Bulk Add Modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-[1000px] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-[fadeIn_0.2s_ease-out]">
            <div className="px-8 py-5 border-b border-slate-200 flex justify-between items-center bg-white sticky top-0 z-10 shrink-0">
              <div>
                <h2 className="text-[22px] font-bold text-slate-800 flex items-center gap-3">
                  <span className="material-symbols-outlined text-blue-600 bg-blue-50 w-8 h-8 rounded-full flex items-center justify-center">library_add</span>
                  保安用品を一括追加
                </h2>
                <p className="text-slate-500 text-sm mt-1">CSVまたはタブ区切りのテキストを貼り付けて、複数の商品を一括で登録します。</p>
              </div>
              <button type="button" onClick={() => { setIsBulkModalOpen(false); setBulkText(""); }} className="w-[38px] h-[38px] flex items-center justify-center rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-500 transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-[24px]">close</span>
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Column: Input Area */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <label className="block text-sm font-bold text-slate-700">コピーしたデータを貼り付け</label>
                    <button 
                      type="button" 
                      onClick={() => {
                        setBulkText(
                          "LEDコーンバー 黄黒,カラーコーン,200,150,800,100\n" +
                          "クッションドラム 黄黒,その他,1500,1000,25000,20\n" +
                          "ポータブルガス検知器,ガス検知器,2500,1800,85000,15\n" +
                          "セイフティブロック 20m,セイフティブロック,3500,2500,110000,8\n" +
                          "小型発電機 2.0kVA,発電機,1800,1200,65000,12"
                        );
                      }}
                      className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200 transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[14px]">terminal</span>
                      サンプルデータを読込
                    </button>
                  </div>
                  
                  <textarea 
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    className="w-full h-[320px] font-mono text-sm p-4 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none resize-none transition-shadow"
                    placeholder="[商品名], [カテゴリ], [レンタル単価], [長期単価], [販売価格], [在庫数]&#10;例:&#10;カラーコーン赤,カラーコーン,150,100,500,200&#10;LEDコーンバー 黄黒,カラーコーン,200,150,800,100"
                  />
                  
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-500 space-y-1">
                    <div className="font-bold text-slate-700 mb-1">【入力ルール】</div>
                    <p>・1行に1つの商品をカンマ ( , ) または タブで区切って入力してください。</p>
                    <p>・項目順：商品名, カテゴリ, レンタル単価, 長期単価, 販売価格, 在庫数</p>
                    <p>・レンタル単価、長期単価、販売価格、在庫数は半角数字で入力してください。</p>
                    <p>・画像のURLや説明文は、一括追加後に個別編集から変更できます。</p>
                  </div>
                </div>

                {/* Right Column: Live Preview Area */}
                <div className="flex flex-col h-full">
                  <div className="flex justify-between items-center mb-4 shrink-0">
                    <label className="block text-sm font-bold text-slate-700">プレビューと検証結果</label>
                    {bulkText && (
                      <span className="text-xs font-bold px-2 py-1 rounded bg-slate-100 text-slate-600">
                        解析件数: {parseBulkText(bulkText).length} 件
                      </span>
                    )}
                  </div>

                  <div className="flex-1 border border-slate-200 rounded-xl overflow-hidden flex flex-col bg-slate-50 min-h-[300px] lg:max-h-[500px]">
                    {bulkText && parseBulkText(bulkText).length > 0 ? (
                      <div className="overflow-auto flex-1 max-h-[460px]">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-100 border-b border-slate-200 sticky top-0">
                              <th className="p-3 font-bold text-slate-600 w-12 text-center">状態</th>
                              <th className="p-3 font-bold text-slate-600">商品名</th>
                              <th className="p-3 font-bold text-slate-600 w-24">カテゴリ</th>
                              <th className="p-3 font-bold text-slate-600 w-16 text-right">レンタル</th>
                              <th className="p-3 font-bold text-slate-600 w-16 text-right">長期</th>
                              <th className="p-3 font-bold text-slate-600 w-16 text-right">販売</th>
                              <th className="p-3 font-bold text-slate-600 w-12 text-right">在庫</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 bg-white">
                            {parseBulkText(bulkText).map((row, idx) => (
                              <tr key={idx} className={row.error ? "bg-red-50/50" : "hover:bg-slate-50"}>
                                <td className="p-3 text-center">
                                  {row.error ? (
                                    <span className="material-symbols-outlined text-red-500 font-bold text-[18px]" title={row.error}>error</span>
                                  ) : (
                                    <span className="material-symbols-outlined text-emerald-500 font-bold text-[18px]">check_circle</span>
                                  )}
                                </td>
                                <td className="p-3">
                                  <div className="font-bold text-slate-800">{row.name || "—"}</div>
                                  {row.error && <div className="text-[10px] text-red-500 font-bold mt-0.5">{row.error}</div>}
                                </td>
                                <td className="p-3 text-slate-600">{row.category || "—"}</td>
                                <td className="p-3 text-right font-mono font-bold text-slate-700">¥{row.rentPrice.toLocaleString()}</td>
                                <td className="p-3 text-right font-mono text-slate-500">¥{row.rentPriceLongTerm.toLocaleString()}</td>
                                <td className="p-3 text-right font-mono text-slate-500">¥{row.buyPrice.toLocaleString()}</td>
                                <td className="p-3 text-right font-mono font-bold text-slate-700">{row.stock}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400">
                        <span className="material-symbols-outlined text-[48px] text-slate-300 mb-2">find_in_page</span>
                        <p className="text-sm font-bold">検証プレビュー</p>
                        <p className="text-xs mt-1 text-slate-400 max-w-[280px]">左側の入力エリアに商品データを貼り付けると、リアルタイムに検証結果が表示されます。</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="px-8 py-5 border-t border-slate-200 bg-white flex justify-between items-center shrink-0">
              <div className="text-xs font-bold text-slate-500">
                {bulkText && (
                  <div className="flex gap-4">
                    <span className="text-emerald-600 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                      追加対象: {parseBulkText(bulkText).filter(r => !r.error).length} 件
                    </span>
                    {parseBulkText(bulkText).some(r => r.error) && (
                      <span className="text-red-500 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
                        エラー: {parseBulkText(bulkText).filter(r => r.error).length} 件（登録されません）
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button 
                  type="button" 
                  onClick={() => { setIsBulkModalOpen(false); setBulkText(""); }} 
                  className="px-6 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer border border-transparent"
                >
                  キャンセル
                </button>
                <button 
                  type="button"
                  onClick={handleBulkSubmit}
                  disabled={!bulkText || parseBulkText(bulkText).filter(r => !r.error).length === 0}
                  className="px-8 py-3 text-sm font-bold text-white bg-[#1a1c9a] hover:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-400 rounded-xl shadow-sm flex items-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[18px]">publish</span>
                  一括登録を実行
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
