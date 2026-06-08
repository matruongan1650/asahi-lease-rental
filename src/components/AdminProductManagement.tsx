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
  
  const securityProducts = (products || []).filter(p => !isVehicleCategory(p?.category));
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
      const linkedProduct = products.find(p => p.id === vProdId);
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
          <button className={`pb-3 text-[15px] font-bold ${activeSubTab === 'security' ? 'text-blue-700 border-b-[3px] border-blue-700' : 'text-slate-500'}`} onClick={() => setActiveSubTab("security")}>保安用品 ({securityProducts.length})</button>
          <button className={`pb-3 text-[15px] font-bold ${activeSubTab === 'vehicles' ? 'text-blue-700 border-b-[3px] border-blue-700' : 'text-slate-500'}`} onClick={() => setActiveSubTab("vehicles")}>保安車両 ({vehicles.length})</button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex justify-between items-center gap-4 mt-6">
        <div className="relative flex-1 max-w-[400px]">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">search</span>
          <input type="text" placeholder="検索..." className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-xl text-sm outline-none" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}/>
        </div>
        <div className="flex gap-2">
          {activeSubTab === 'security' && (
            <button onClick={() => setIsBulkModalOpen(true)} className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-sm cursor-pointer">
              <span className="material-symbols-outlined text-[18px]">library_add</span>一括追加
            </button>
          )}
          <button onClick={activeSubTab === 'security' ? handleAddProduct : handleAddVehicle} className="bg-[#1a1c9a] hover:bg-blue-800 text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-sm cursor-pointer">
            <span className="material-symbols-outlined text-[18px]">add</span>追加
          </button>
        </div>
      </div>

      {/* Main Table View */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mt-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-white border-b border-slate-100">
                <th className="p-4 text-xs font-bold text-slate-500">商品</th>
                <th className="p-4 text-xs font-bold text-slate-500">カテゴリ</th>
                <th className="p-4 text-xs font-bold text-slate-500">レンタル単価</th>
                <th className="p-4 text-xs font-bold text-slate-500">長期単価</th>
                <th className="p-4 text-xs font-bold text-slate-500">販売価格</th>
                <th className="p-4 text-xs font-bold text-slate-500">在庫</th>
                <th className="p-4 text-xs font-bold text-slate-500 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeSubTab === 'security' ? (
                filteredProducts.map(product => (
                  <tr key={product.id} className="hover:bg-slate-50">
                    <td className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-white rounded-lg border p-1 bg-contain bg-center bg-no-repeat" style={{backgroundImage: `url("${product.image}")`}}></div>
                        <div>
                          <div className="font-bold text-slate-800 text-sm">{product.name}</div>
                          <div className="text-xs text-slate-400 font-mono">{product.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-slate-600">{product.category}</td>
                    <td className="p-4 text-sm font-bold text-slate-800">¥{product.rentPrice?.toLocaleString()}/日</td>
                    <td className="p-4 text-sm text-slate-600">¥{product.rentPriceLongTerm?.toLocaleString()}</td>
                    <td className="p-4 text-sm text-slate-600">¥{product.buyPrice?.toLocaleString()}</td>
                    <td className="p-4 font-bold text-slate-800">{product.stock || 0}</td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleEditProduct(product)} className="px-3 py-1.5 rounded-lg border text-xs font-bold">編集</button>
                        <button onClick={() => handleDeleteProduct(product.id)} className="px-3 py-1.5 rounded-lg border text-xs font-bold text-red-600 bg-white">削除</button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                filteredVehicles.map(v => {
                  const linkedProduct = products.find(p => p.id === (v.productId || v.id));
                  return (
                    <tr key={v.id} className="hover:bg-slate-50">
                      <td className="p-4">
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 bg-white rounded-lg border bg-contain bg-center bg-no-repeat" style={{backgroundImage: `url("${linkedProduct?.image || ''}")`}}></div>
                          <div><div className="font-bold text-slate-800 text-sm">{v.name}</div><div className="text-xs text-slate-400">{v.id}</div></div>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-slate-600">{v.category}</td>
                      <td className="p-4 text-sm font-bold text-slate-800">¥{linkedProduct?.rentPrice?.toLocaleString()}/日</td>
                      <td className="p-4 text-sm text-slate-600">¥{linkedProduct?.rentPriceLongTerm?.toLocaleString()}</td>
                      <td className="p-4 text-sm text-slate-600">¥{linkedProduct?.buyPrice?.toLocaleString()}</td>
                      <td className="p-4 font-bold text-slate-800">{v.stock || 0}</td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => handleEditVehicle(v)} className="px-3 py-1.5 rounded-lg border text-xs font-bold">編集</button>
                          <button onClick={() => handleDeleteVehicle(v.id)} className="px-3 py-1.5 rounded-lg border text-xs font-bold text-red-600 bg-white">削除</button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

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
                <div className="grid grid-cols-3 gap-4">
                  <div><label className="block text-sm font-bold text-slate-700 mb-2">レンタル単価</label><input type="number" defaultValue={editingProduct?.rentPrice || ""} name="rentPrice" className="w-full border rounded-xl p-3 text-sm"/></div>
                  <div><label className="block text-sm font-bold text-slate-700 mb-2">長期単価</label><input type="number" defaultValue={editingProduct?.rentPriceLongTerm || ""} name="rentPriceLongTerm" className="w-full border rounded-xl p-3 text-sm"/></div>
                  <div><label className="block text-sm font-bold text-slate-700 mb-2">販売価格</label><input type="number" defaultValue={editingProduct?.buyPrice || ""} name="buyPrice" className="w-full border rounded-xl p-3 text-sm"/></div>
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
          <div className="bg-white rounded-2xl w-full max-w-[800px] flex flex-col shadow-2xl p-6">
            <form onSubmit={saveVehicle} className="space-y-4">
              <h3 className="text-lg font-bold">車両登録</h3>
              <input required name="name" placeholder="車両名" defaultValue={editingVehicle?.name || ""} className="w-full border rounded-xl p-3" />
              <input name="plate" placeholder="ナンバープレート" defaultValue={editingVehicle?.plate || ""} className="w-full border rounded-xl p-3" />
              <button type="submit" className="w-full py-3 bg-[#1a1c9a] text-white font-bold rounded-xl">保存</button>
            </form>
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
