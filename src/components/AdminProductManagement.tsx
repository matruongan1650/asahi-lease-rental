import React, { useState, useEffect } from "react";
import { confirmDialog, alertDialog } from "./AppDialog";
import QRCode from "qrcode";
import { useProducts } from "../context/ProductContext";
import { useVehicles, type VehicleDetail, type VehicleFile } from "../context/VehicleContext";
import { Product } from "../types";
import { isVehicleCategory, SUPPLY_CATEGORY_ICONS, UNIT_OPTIONS, VEHICLE_CATEGORIES } from "../utils/productUtils";
import { getProductQrCode, getProductQrPayload, makeProductQrFields } from "../utils/productQr";
import { SALES_ENABLED } from "../config/features";
import { usePagedList } from "../hooks/usePagedList";

const PRODUCT_IMAGE_FALLBACK = "https://images.unsplash.com/photo-1544473244-f6895e69da8a?w=500&h=500&fit=crop";
const VEHICLE_IMAGE_FALLBACK = "https://imagedelivery.net/W-O2N6-kYOfvEexU-w0YSA/6ca65aee-8da0-466f-ff84-9de55ae2ee00/public";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function readImageAsDataUrl(file: File): Promise<string> {
  const original = await readFileAsDataUrl(file);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxSide = 1280;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(original);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.86));
    };
    img.onerror = () => resolve(original);
    img.src = original;
  });
}

function makeVehicleFile(file: File, dataUrl: string): VehicleFile {
  return {
    id: "VF-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    name: file.name,
    size: file.size,
    type: file.type || "application/octet-stream",
    uploadedAt: new Date().toISOString(),
    dataUrl
  };
}

function formatBytes(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

function isRenderableImage(src: string | undefined) {
  return !!src && (src.startsWith("http") || src.startsWith("data:image/"));
}

function firstVehicleImage(vehicle: Partial<VehicleDetail>) {
  return (vehicle.photos || []).find((photo) => isRenderableImage(photo));
}

function statusColor(status: VehicleDetail["status"]): VehicleDetail["statusColor"] {
  if (status === "使用中") return "emerald";
  if (status === "整備中") return "orange";
  return "blue";
}

export default function AdminProductManagement() {
  const { products, addProduct, updateProduct, deleteProduct } = useProducts();
  const { vehicles, addVehicle, updateVehicle, deleteVehicle } = useVehicles();
  
  const [activeSubTab, setActiveSubTab] = useState<"security" | "vehicles">("security");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSecurityCategory, setSelectedSecurityCategory] = useState("すべて");
  const [selectedVehicleCategory, setSelectedVehicleCategory] = useState("すべて");
  
  // 車両連動商品(vehicleId 付き)はカテゴリ名が車両プリセットからずれても保安用品タブへ混入させない
  //（他の在庫4画面と同じ二重計上防止の二段防御）(K12)。
  const securityProducts = (products || []).filter(p => p && !(p as any).vehicleId && !isVehicleCategory(p?.category));
  const securityCategories = ["すべて", ...Array.from(new Set(securityProducts.map(p => p?.category).filter(Boolean)))];
  const vehicleCategories = ["すべて", ...Array.from(new Set((vehicles || []).map(v => v.category).filter(Boolean)))];
  // 保安用品のカテゴリー一覧（実データ）:
  // 標準カテゴリー（SUPPLY_CATEGORY_ICONS）＋ 実際の商品から抽出したカテゴリー。
  // 車両カテゴリーは保安用品フォームでは除外する。
  const categoriesList = Array.from(new Set([
    ...Object.keys(SUPPLY_CATEGORY_ICONS),
    ...((products || []).map(p => p?.category).filter(Boolean) as string[]).map(c => c.trim()),
  ])).filter(c => c && !isVehicleCategory(c));

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
    // 商品マスタ(products.stock)が唯一の真実。v.stock は登録時の値で固定される古いミラーのため、
    // 出庫中でも登録台数を表示してしまう（編集ダイアログ 1342 行と同じ優先順位に統一）(K1)。
    return acc + (linkedProduct?.stock ?? v.stock ?? 0);
  }, 0);
  const lowStockSecurityCount = securityProducts.filter(p => Number(p.stock || 0) <= 5).length;
  const vehicleMaintenanceCount = (vehicles || []).filter(v => v.status === "整備中").length;
  const currentRowsCount = activeSubTab === "security" ? filteredProducts.length : filteredVehicles.length;
  const activeCategories = activeSubTab === "security" ? securityCategories : vehicleCategories;
  const activeCategory = activeSubTab === "security" ? selectedSecurityCategory : selectedVehicleCategory;
  const activeStockTotal = activeSubTab === "security" ? securityStock : vehicleStock;

  // ページネーション: 全件描画を避け 24件ずつ段階表示。検索/カテゴリ/タブ切替で先頭に戻す。
  const pagedProducts = usePagedList(filteredProducts, 24, [searchQuery, selectedSecurityCategory, activeSubTab]);
  const pagedVehicles = usePagedList(filteredVehicles, 24, [searchQuery, selectedVehicleCategory, activeSubTab]);


  // Modal State
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  // 二重送信ガード: 保存処理中はフラグを立て、送信ボタンを無効化する。
  const [productSaving, setProductSaving] = useState(false);
  // カテゴリ選択肢: 保存済みの生カテゴリ（trim 前・リスト外の旧値）を必ず含める。含めないと
  // uncontrolled select が defaultValue を解決できず先頭の「カラーコーン」へ無言で差し替わり、
  // 価格だけ直した保存でカテゴリが化ける(K4)。
  const productCategoryOptions = Array.from(new Set([
    ...(editingProduct?.category ? [String(editingProduct.category)] : []),
    ...categoriesList,
  ]));
  const [qrProduct, setQrProduct] = useState<Product | null>(null);
  const [qrImage, setQrImage] = useState("");
  const [isGuaranteeChecked, setIsGuaranteeChecked] = useState(false);
  const [guaranteeType, setGuaranteeType] = useState<'flat' | 'tiered'>('tiered');
  const [productImageDraft, setProductImageDraft] = useState("");

  // Bulk add & Spreadsheet states
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  // 一括追加の対象（保安用品 / 保安車両）。モーダルを開いた時点のサブタブで固定する。
  const [bulkMode, setBulkMode] = useState<"security" | "vehicles">("security");
  const [bulkText, setBulkText] = useState("");
  const [bulkItems, setBulkItems] = useState<any[]>([]);

  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<VehicleDetail | null>(null);
  const [vehicleImageDraft, setVehicleImageDraft] = useState("");
  const [vehiclePhotosDraft, setVehiclePhotosDraft] = useState<string[]>([]);
  const [vehicleFilesDraft, setVehicleFilesDraft] = useState<VehicleFile[]>([]);
  const [vehicleDocsDraft, setVehicleDocsDraft] = useState<string[]>([]);

  // 車両カテゴリー候補（正規一覧 + 編集中車両の既存カテゴリーを保持）。
  const vehicleCategoryOptions = Array.from(new Set([
    ...VEHICLE_CATEGORIES,
    ...(editingVehicle?.category ? [editingVehicle.category] : []),
  ]));

  // Re-parse when text changes to initialize spreadsheet rows
  useEffect(() => {
    if (bulkText) {
      setBulkItems(bulkMode === "vehicles" ? parseBulkVehicleText(bulkText) : parseBulkText(bulkText));
    } else {
      setBulkItems([]);
    }
  }, [bulkText, bulkMode]);

  useEffect(() => {
    let active = true;
    if (!qrProduct) {
      setQrImage("");
      return;
    }
    QRCode.toDataURL(getProductQrPayload(qrProduct), {
      margin: 1,
      width: 320,
      errorCorrectionLevel: "M",
      color: { dark: "#111827", light: "#ffffff" },
    }).then((url) => {
      if (active) setQrImage(url);
    }).catch(() => {
      if (active) setQrImage("");
    });
    return () => {
      active = false;
    };
  }, [qrProduct]);

  const handleAddProduct = () => {
    setEditingProduct(null);
    setProductSaving(false);
    setIsGuaranteeChecked(false);
    setGuaranteeType('tiered');
    setProductImageDraft("");
    setIsProductModalOpen(true);
  };

  const handleEditProduct = (p: Product) => {
    setEditingProduct(p);
    setProductSaving(false);
    setIsGuaranteeChecked(!!p.isGuarantee);
    setGuaranteeType(p.guaranteeType || 'tiered');
    setProductImageDraft(p.image || "");
    setIsProductModalOpen(true);
  };

  const handleDeleteProduct = async (id: string) => {
    if (await confirmDialog("このアイテムを削除してもよろしいですか？", { danger: true, okText: "削除" })) {
      deleteProduct(id);
    }
  };

  const saveProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // 二重送信ガード: 保存中の再送信は無視する。
    if (productSaving) return;
    setProductSaving(true);
    const formData = new FormData(e.currentTarget);
    const productId = (editingProduct?.id || String(formData.get("id") || "").trim() || "p-" + Math.random().toString(36).substring(7));
    // 管理IDの重複ガード: 既存IDで登録すると OrderBus.push（全置換 upsert）が既存商品のマスタを
    // 黙って上書きする（車両連動 vprod_ の乗っ取り含む）(K2)。
    if (!editingProduct && (products || []).some((p: any) => p && String(p.id) === productId)) {
      void alertDialog(`管理ID「${productId}」は既に使用されています。別のIDを入力するか、空欄で自動採番してください。`);
      setProductSaving(false);
      return;
    }
    // 同名商品の警告: 同名が併存すると入出庫・在庫調整の名称フォールバックが別商品へ誤爆しうる(K9)。
    const newName = String(formData.get("name") || "").trim();
    const dupName = (products || []).some((p: any) => p && String(p.id) !== productId && String(p.name || "").trim() === newName);
    if (dupName) {
      const ok = await confirmDialog(`同名の商品「${newName}」が既に存在します。このまま保存しますか？（同名商品は入出庫の取り違えの原因になります）`, { okText: "保存する", cancelText: "やめる" });
      if (!ok) { setProductSaving(false); return; }
    }
    const qrFields = makeProductQrFields({ ...(editingProduct || {}), id: productId } as Product);
    // 在庫はフォームのプリフィル値（モーダルを開いた時点のスナップショット）を無条件に書き戻さない。
    // 開いている間に受注確定/入庫で動いた live 在庫を巻き戻すため、ユーザーが在庫欄を変更した時だけ
    // 書き込む（車両編集パスの stockPatch と同じ方針）(K3)。
    const stockInput = Number(formData.get("stock"));
    const stockPrefill = Number(editingProduct?.stock || 0);
    const productData: any = {
      name: newName,
      category: String(formData.get("category") || "").trim(), // trim 保存でカテゴリの空白重複を防ぐ(K4)
      ...((!editingProduct || stockInput !== stockPrefill) ? { stock: stockInput } : {}),
      rentPrice: Number(formData.get("rentPrice")),
      rentPriceLongTerm: Number(formData.get("rentPriceLongTerm")),
      // 販売無効時は入力欄を隠すため、既存の販売価格をそのまま保持（再有効化で復活）。
      buyPrice: SALES_ENABLED ? Number(formData.get("buyPrice")) : (editingProduct?.buyPrice ?? undefined),
      compensationPrice: Number(formData.get("compensationPrice")) || undefined,
      unit: (formData.get("unit") || "").toString().trim() || undefined,
      image: productImageDraft || formData.get("image") || PRODUCT_IMAGE_FALLBACK,
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
      ...qrFields,
    };

    if (editingProduct) {
      updateProduct(editingProduct.id, productData);
    } else {
      addProduct({
         id: productId,
        ...productData
      } as Product);
    }
    setIsProductModalOpen(false);
    setProductSaving(false);
  };

  const handleProductImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      void alertDialog(`${file.name} は画像ファイルではありません。`);
      e.target.value = "";
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      void alertDialog(`${file.name} は8MBを超えています。`);
      e.target.value = "";
      return;
    }
    setProductImageDraft(await readImageAsDataUrl(file));
    e.target.value = "";
  };

  // 簡易CSV分割: ダブルクォート内の区切り文字を分割しない（Excel 出力の "コーンバー,2m" 等で
  // 列がずれたまま「正常」判定で登録されるのを防ぐ）。"" は " に戻す(K6)。
  const splitBulkLine = (line: string, delimiter: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === delimiter && !inQ) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((p) => p.trim());
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
      const parts = splitBulkLine(trimmed, delimiter); // クォート対応(K6)

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
      // 販売無効時は販売価格列を持たない（列構成: 商品名,カテゴリ,日単価,長期単価,在庫数）。
      const buyPrice = SALES_ENABLED ? (Number(parts[4]) || 0) : 0;
      const stock = Number(parts[SALES_ENABLED ? 5 : 4]) || 0;

      let error = "";
      if (!name) error = "商品名は必須です";
      else if (!category) error = "カテゴリは必須です";
      // 車両カテゴリーは保安車両タブで登録する。ここで作ると vehicleId 無しの孤立商品になり
      // 在庫集計が二重計上される（productUtils.ts の不変条件）。
      else if (isVehicleCategory(category)) error = "車両カテゴリーは保安車両タブから登録してください";

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

  // 保安車両の一括テキストを解析する。
  // 列構成: 車両名,カテゴリ,ナンバー,レンタル単価,長期単価,[販売価格,]台数
  // カテゴリは正規一覧(VEHICLE_CATEGORIES)に含まれる必要がある（連動商品の在庫二重計上を防ぐ）。
  const parseBulkVehicleText = (text: string) => {
    const lines = text.split("\n");
    const parsed: Array<{
      name: string;
      category: string;
      plate: string;
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
      const parts = splitBulkLine(trimmed, delimiter); // クォート対応(K6)

      const name = parts[0] || "";
      const category = parts[1] || "";
      const plate = parts[2] || "";

      // ヘッダー行はスキップ
      if (
        name === "車両名" || name === "商品名" || name.toLowerCase() === "name" ||
        category === "カテゴリ" || category.toLowerCase() === "category"
      ) {
        return;
      }

      const rentPrice = Number(parts[3]) || 0;
      const rentPriceLongTerm = Number(parts[4]) || 0;
      // 販売無効時は販売価格列を持たない（列構成: 車両名,カテゴリ,ナンバー,レンタル単価,長期単価,台数）。
      const buyPrice = SALES_ENABLED ? (Number(parts[5]) || 0) : 0;
      const stock = Number(parts[SALES_ENABLED ? 6 : 5]) || 0;

      let error = "";
      if (!name) error = "車両名は必須です";
      else if (!category) error = "カテゴリは必須です";
      else if (!VEHICLE_CATEGORIES.includes(category)) error = "車両カテゴリーから選択してください";

      parsed.push({
        name,
        category,
        plate,
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

        // Inline validation checks（モード別）。判定は trim 値で行う — 生値のままだと
        // 「軽トラック 」(空白付き)が車両カテゴリガードをすり抜けて保安用品に登録される(K5)。
        const nm = String(updated.name || "").trim();
        const cat = String(updated.category || "").trim();
        if (bulkMode === "vehicles") {
          if (!nm) updated.error = "車両名は必須です";
          else if (!cat) updated.error = "カテゴリは必須です";
          else if (!VEHICLE_CATEGORIES.includes(cat)) updated.error = "車両カテゴリーから選択してください";
          else delete updated.error;
        } else {
          if (!nm) updated.error = "商品名は必須です";
          else if (!cat) updated.error = "カテゴリは必須です";
          else if (isVehicleCategory(cat)) updated.error = "車両カテゴリーは保安車両タブから登録してください";
          else delete updated.error;
        }

        return updated;
      })
    );
  };

  const handleBulkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // 登録直前に name/category を trim して再検証する（プレビューのセル編集は生値で保持されるため）(K5)。
    const normalized = bulkItems.map((item) => ({
      ...item,
      name: String(item.name || "").trim(),
      category: String(item.category || "").trim(),
    }));
    const validItems = normalized.filter((item) => item.name && item.category && !isVehicleCategory(item.category) && !item.error);

    if (validItems.length === 0) {
      void alertDialog("登録可能な有効なデータがありません。");
      return;
    }

    validItems.forEach((item) => {
      const id = "p-" + Math.random().toString(36).substring(7);
      addProduct({
        id,
        name: item.name,
        category: item.category,
        stock: item.stock,
        rentPrice: item.rentPrice,
        rentPriceLongTerm: item.rentPriceLongTerm,
        buyPrice: SALES_ENABLED ? item.buyPrice : undefined,
        image: PRODUCT_IMAGE_FALLBACK,
        description: "一括登録された保安用品",
        ...makeProductQrFields({ id } as Product),
      } as Product);
    });

    setIsBulkModalOpen(false);
    setBulkText("");
    setBulkItems([]);
    void alertDialog(`${validItems.length}件の保安用品を一括追加しました。`);
  };

  // 保安車両を一括追加する。単体追加(saveVehicle)と同じく車両＋連動商品(P)を生成する。
  const handleBulkVehicleSubmit = () => {
    const validItems = bulkItems.filter((item) => !item.error);

    if (validItems.length === 0) {
      void alertDialog("登録可能な有効なデータがありません。");
      return;
    }

    validItems.forEach((item, i) => {
      // 同一ミリ秒でも衝突しないよう index と乱数を付与する。
      const stamp = `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`;
      const vid = "veh_" + stamp;
      const pid = "vprod_" + stamp;

      addVehicle({
        id: vid,
        productId: pid,
        name: item.name,
        plate: item.plate || "",
        status: "空車",
        statusColor: statusColor("空車"),
        inspectionDate: "",
        year: "",
        color: "",
        category: item.category,
        stock: item.stock,
        photos: [],
        vehicleFiles: [],
        documents: [],
        inspectionDaysRemaining: 999,
        insuranceDate: "",
        manufacturer: "",
        vin: "",
        engineModel: "",
        purchaseDate: "",
        purchasePrice: "",
        mileage: "",
        maintenanceDesc: "",
        maintenanceDate: "",
        alerts: [],
        maintenanceHistory: [],
        repairHistory: [],
      } as VehicleDetail);

      addProduct({
        id: pid,
        name: item.name,
        category: item.category,
        stock: item.stock,
        rentPrice: item.rentPrice,
        rentPriceLongTerm: item.rentPriceLongTerm,
        buyPrice: SALES_ENABLED ? item.buyPrice : undefined,
        image: VEHICLE_IMAGE_FALLBACK,
        description: "一括登録された保安車両",
        vehicleId: vid,
        ...makeProductQrFields({ id: pid } as Product),
      } as Product & { vehicleId: string });
    });

    setIsBulkModalOpen(false);
    setBulkText("");
    setBulkItems([]);
    void alertDialog(`${validItems.length}件の保安車両を一括追加しました。`);
  };

  const resetVehicleDrafts = () => {
    setVehicleImageDraft("");
    setVehiclePhotosDraft([]);
    setVehicleFilesDraft([]);
    setVehicleDocsDraft([]);
  };

  const handleAddVehicle = () => {
    setEditingVehicle(null);
    resetVehicleDrafts();
    setIsVehicleModalOpen(true);
  };

  const handleEditVehicle = (v: VehicleDetail) => {
    const linkedProduct = products.find(p => p && p.id === (v.productId || v.id));
    const photos = v.photos || [];
    setEditingVehicle(v);
    setVehiclePhotosDraft(photos);
    setVehicleFilesDraft(v.vehicleFiles || []);
    setVehicleDocsDraft(v.documents || []);
    setVehicleImageDraft(linkedProduct?.image || firstVehicleImage(v) || "");
    setIsVehicleModalOpen(true);
  };

  const handleDeleteVehicle = async (id: string) => {
    if (await confirmDialog("この車両を削除してもよろしいですか？", { danger: true, okText: "削除" })) {
      deleteVehicle(id);
      const v = vehicles.find(vh => vh.id === id);
      if (v?.productId) deleteProduct(v.productId);
    }
  };

  const handleVehicleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const valid = files.filter((file) => {
      if (!file.type.startsWith("image/")) {
        void alertDialog(`${file.name} は画像ファイルではありません。`);
        return false;
      }
      if (file.size > 8 * 1024 * 1024) {
        void alertDialog(`${file.name} は8MBを超えています。`);
        return false;
      }
      return true;
    });
    const uploaded = await Promise.all(valid.map(readImageAsDataUrl));
    setVehiclePhotosDraft((prev) => [...prev, ...uploaded]);
    setVehicleImageDraft((prev) => prev || uploaded[0] || "");
    e.target.value = "";
  };

  const handleVehicleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const valid = files.filter((file) => {
      if (file.size > 8 * 1024 * 1024) {
        void alertDialog(`${file.name} は8MBを超えています。`);
        return false;
      }
      return true;
    });
    const uploaded = await Promise.all(valid.map(async (file) => makeVehicleFile(file, await readFileAsDataUrl(file))));
    setVehicleFilesDraft((prev) => [...prev, ...uploaded]);
    setVehicleDocsDraft((prev) => Array.from(new Set([...prev, ...uploaded.map((file) => file.name)])));
    e.target.value = "";
  };

  const saveVehicle = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const category = formData.get("category") as string || "軽トラック";
    const rentPrice = Number(formData.get("rentPrice")) || 0;
    const rentPriceLongTerm = Number(formData.get("rentPriceLongTerm")) || 0;
    // 販売無効時は入力欄を隠すため、既存の販売価格を保持（再有効化で復活）。
    const buyPrice = SALES_ENABLED
      ? (Number(formData.get("buyPrice")) || 0)
      : (editingVehicle ? (products.find((p) => p && p.id === (editingVehicle.productId || editingVehicle.id))?.buyPrice ?? 0) : 0);
    const stock = Number(formData.get("stock")) || 0;
    const status = (formData.get("status") as VehicleDetail["status"]) || "空車";
    const name = String(formData.get("name") || "");
    const plate = String(formData.get("plate") || "");
    // このモーダルには 車検満了日/年式/車体色 の入力が無く formData.get は null を返す。
    // String(null)="" で保存すると編集の度にこれらを消してしまう（車検アラート消失＝法令リスク）。
    // フォームに項目が無い(null)場合は既存値を保持する。
    const inspectionDate = String(formData.get("inspectionDate") ?? editingVehicle?.inspectionDate ?? "");
    const year = String(formData.get("year") ?? editingVehicle?.year ?? "");
    const color = String(formData.get("color") ?? editingVehicle?.color ?? "");
    const basePhotos = vehiclePhotosDraft.length > 0
      ? vehiclePhotosDraft
      : (vehicleImageDraft ? [vehicleImageDraft] : []);
    const image = vehicleImageDraft || basePhotos[0] || (formData.get("image") as string) || VEHICLE_IMAGE_FALLBACK;
    const mergedPhotos = image ? [image, ...basePhotos.filter((photo) => photo !== image)] : basePhotos;
    
    const vehicleData: Partial<VehicleDetail> = {
      name,
      plate,
      status,
      statusColor: statusColor(status),
      inspectionDate,
      year,
      color,
      category: category,
      stock: stock,
      photos: mergedPhotos,
      vehicleFiles: vehicleFilesDraft,
      documents: vehicleDocsDraft,
    };

    if (editingVehicle) {
      updateVehicle(editingVehicle.id, vehicleData);
      const vProdId = editingVehicle.productId || editingVehicle.id;
      const linkedProduct = products.find(p => p && p.id === vProdId);
      if (linkedProduct) {
         // 在庫は「フォーム値が live と異なる時だけ」書き込む。プリフィルのまま保存しても
         // live 在庫（出庫/入庫/棚卸の結果）を巻き戻さないようにする。
         const liveStock = Number((linkedProduct as any).stock ?? 0);
         const stockPatch = stock !== liveStock ? { stock } : {};
         updateProduct(vProdId, { name: vehicleData.name, category: vehicleData.category, rentPrice, rentPriceLongTerm, buyPrice, image, ...stockPatch, ...makeProductQrFields({ ...linkedProduct, id: vProdId }) });
      } else {
         addProduct({ id: vProdId, name: String(vehicleData.name || ""), category: category, stock, rentPrice, rentPriceLongTerm, buyPrice, image, vehicleId: editingVehicle.id, ...makeProductQrFields({ id: vProdId } as Product) } as Product & { vehicleId: string });
      }
    } else {
      const vid = "veh_" + Date.now();
      const pid = "vprod_" + Date.now();

      addVehicle({
        id: vid,
        productId: pid,
        category: category,
        inspectionDaysRemaining: 999,
        insuranceDate: "",
        manufacturer: "",
        vin: "",
        engineModel: "",
        purchaseDate: "",
        purchasePrice: "",
        mileage: "",
        maintenanceDesc: "",
        maintenanceDate: "",
        alerts: [],
        maintenanceHistory: [],
        repairHistory: [],
        ...vehicleData
      } as VehicleDetail);
      addProduct({ id: pid, name: String(vehicleData.name || ""), category: category, stock: stock, rentPrice: rentPrice, rentPriceLongTerm: rentPriceLongTerm, buyPrice: buyPrice, image, vehicleId: vid, ...makeProductQrFields({ id: pid } as Product) } as Product & { vehicleId: string });
    }
    setIsVehicleModalOpen(false);
    resetVehicleDrafts();
  };

  return (
    <div className="space-y-5 animate-[fadeIn_0.3s_ease-out]">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div>
          <h2 className="text-[24px] font-black text-slate-900 tracking-tight">商品管理</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              在庫・車庫・棚卸と連動
            </span>
            <span>{currentRowsCount} 件表示</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setBulkMode(activeSubTab); setBulkText(""); setBulkItems([]); setIsBulkModalOpen(true); }}
            className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <span className="material-symbols-outlined text-[17px]">upload_file</span>
            一括追加
          </button>
          <button
            onClick={activeSubTab === "security" ? handleAddProduct : handleAddVehicle}
            className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-[#1a1c9a] px-4 text-xs font-black text-white shadow-[0_6px_18px_rgba(26,28,154,0.20)] hover:bg-[#2537c4]"
          >
            <span className="material-symbols-outlined text-[17px]">add</span>
            {activeSubTab === "security" ? "保安用品を追加" : "保安車両を追加"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { icon: "security", label: "保安用品", value: securityProducts.length, unit: "品目", tone: "blue" },
          { icon: "inventory_2", label: "用品在庫", value: securityStock, unit: "点", tone: "emerald" },
          { icon: "local_shipping", label: "保安車両", value: vehicles.length, unit: "台種", tone: "amber" },
          { icon: "build", label: "要確認", value: activeSubTab === "security" ? lowStockSecurityCount : vehicleMaintenanceCount, unit: activeSubTab === "security" ? "品目" : "台", tone: "rose" },
        ].map(card => (
          <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-black text-slate-500">{card.label}</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-[26px] font-black text-slate-900 tracking-tight">{card.value.toLocaleString()}</span>
                  <span className="text-xs font-bold text-slate-400">{card.unit}</span>
                </div>
              </div>
              <span className={`material-symbols-outlined flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[20px] ${
                card.tone === "blue" ? "bg-blue-50 text-blue-700" :
                card.tone === "emerald" ? "bg-emerald-50 text-emerald-700" :
                card.tone === "amber" ? "bg-amber-50 text-amber-700" :
                "bg-rose-50 text-rose-700"
              }`}>
                {card.icon}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-[0_6px_24px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50/70 p-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="inline-flex w-full rounded-lg border border-slate-200 bg-white p-1 lg:w-auto">
              {[
                { id: "security" as const, label: "保安用品", icon: "security", count: securityProducts.length },
                { id: "vehicles" as const, label: "保安車両", icon: "local_shipping", count: vehicles.length },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveSubTab(tab.id)}
                  className={`flex h-[38px] flex-1 items-center justify-center gap-2 rounded-md px-4 text-sm font-black transition-colors lg:flex-none ${
                    activeSubTab === tab.id ? "bg-[#1a1c9a] text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className="material-symbols-outlined text-[17px]">{tab.icon}</span>
                  {tab.label}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${activeSubTab === tab.id ? "bg-white/18 text-white" : "bg-slate-100 text-slate-500"}`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative min-w-[260px]">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[19px]">search</span>
                <input
                  type="text"
                  placeholder={activeSubTab === "security" ? "商品名・カテゴリ・ID" : "車両名・ナンバー・カテゴリ"}
                  className="h-[38px] w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm font-semibold outline-none focus:border-[#1a1c9a]/50 focus:ring-2 focus:ring-[#1a1c9a]/10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <select
                value={activeCategory}
                onChange={(e) => {
                  if (activeSubTab === "security") setSelectedSecurityCategory(e.target.value);
                  else setSelectedVehicleCategory(e.target.value);
                }}
                className="h-[38px] rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 outline-none focus:border-[#1a1c9a]/50 focus:ring-2 focus:ring-[#1a1c9a]/10"
              >
                {activeCategories.map(cat => (
                  <option key={cat} value={cat}>{cat === "すべて" ? "すべてのカテゴリ" : cat}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[19px] text-slate-400">{activeSubTab === "security" ? "category" : "garage"}</span>
            <span className="text-sm font-black text-slate-800">{activeSubTab === "security" ? "保安用品一覧" : "保安車両一覧"}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-500">{currentRowsCount} 件</span>
          </div>
          <div className="text-xs font-bold text-slate-500">
            合計在庫 <span className="font-black text-slate-900">{activeStockTotal.toLocaleString()}</span> {activeSubTab === "security" ? "点" : "台"}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-collapse text-left">
            <thead className="bg-white">
              <tr className="border-b border-slate-100">
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">品目</th>
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">カテゴリ</th>
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">QR</th>
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">価格</th>
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">{activeSubTab === "security" ? "在庫" : "台数"}</th>
                <th className="px-4 py-3 text-[11px] font-black text-slate-500">{activeSubTab === "security" ? "保証料" : "管理情報"}</th>
                <th className="px-4 py-3 text-right text-[11px] font-black text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeSubTab === "security" ? (
                pagedProducts.shown.map(product => (
                  <tr key={product.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 bg-white bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url("${product.image || PRODUCT_IMAGE_FALLBACK}")` }} />
                        <div className="min-w-0">
                          <div className="max-w-[280px] truncate text-sm font-black text-slate-900">{product.name}</div>
                          <div className="mt-1 font-mono text-[10px] font-bold text-slate-400">{product.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{product.category}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setQrProduct(product)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50" title="QRを表示">
                        <span className="material-symbols-outlined text-[16px]">qr_code_2</span>
                        <span className="font-mono">{getProductQrCode(product)}</span>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-black text-slate-900">{product.rentPrice ? `¥${product.rentPrice.toLocaleString()}` : "—"}<span className="ml-0.5 text-[10px] font-bold text-slate-400">/日</span></div>
                      <div className="mt-0.5 text-xs font-bold text-slate-500">長期 {product.rentPriceLongTerm ? `¥${product.rentPriceLongTerm.toLocaleString()}` : "—"}{SALES_ENABLED && ` / 販売 ${product.buyPrice ? `¥${product.buyPrice.toLocaleString()}` : "—"}`}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex min-w-12 justify-center rounded-lg px-3 py-1 text-sm font-black ${
                        Number(product.stock || 0) <= 0 ? "bg-red-50 text-red-700" :
                        Number(product.stock || 0) <= 5 ? "bg-amber-50 text-amber-700" :
                        "bg-emerald-50 text-emerald-700"
                      }`}>
                        {product.stock || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {product.isGuarantee ? (
                        product.guaranteeType === "flat" ? (
                          <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700">¥{(product.guaranteeRate || 0).toLocaleString()}</span>
                        ) : (
                          <span className="inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-black text-indigo-700">数量別</span>
                        )
                      ) : (
                        <span className="text-xs font-bold text-slate-400">なし</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleEditProduct(product)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" title="編集">
                          <span className="material-symbols-outlined text-[17px]">edit</span>
                        </button>
                        <button onClick={() => setQrProduct(product)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-white text-blue-700 hover:bg-blue-50" title="QR">
                          <span className="material-symbols-outlined text-[17px]">qr_code_2</span>
                        </button>
                        <button onClick={() => handleDeleteProduct(product.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50" title="削除">
                          <span className="material-symbols-outlined text-[17px]">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                pagedVehicles.shown.map(v => {
                  const linkedProduct = products.find(p => p && p.id === (v.productId || v.id));
                  const vehicleImage = linkedProduct?.image || firstVehicleImage(v) || VEHICLE_IMAGE_FALLBACK;
                  return (
                    <tr key={v.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 bg-white bg-cover bg-center" style={{ backgroundImage: `url("${vehicleImage}")` }} />
                          <div className="min-w-0">
                            <div className="max-w-[280px] truncate text-sm font-black text-slate-900">{v.name}</div>
                            <div className="mt-1 flex items-center gap-2">
                              <span className="rounded bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] font-black text-amber-700">{v.plate || "ナンバー未設定"}</span>
                              <span className="font-mono text-[10px] font-bold text-slate-400">{v.id}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex w-fit rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{v.category}</span>
                          <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-black ${
                            v.status === "使用中" ? "bg-emerald-50 text-emerald-700" :
                            v.status === "整備中" ? "bg-amber-50 text-amber-700" :
                            "bg-blue-50 text-blue-700"
                          }`}>
                            {v.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {linkedProduct ? (
                          <button onClick={() => setQrProduct(linkedProduct)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50" title="QRを表示">
                            <span className="material-symbols-outlined text-[16px]">qr_code_2</span>
                            <span className="font-mono">{getProductQrCode(linkedProduct)}</span>
                          </button>
                        ) : (
                          <span className="text-xs font-bold text-slate-400">商品未連携</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-black text-slate-900">{linkedProduct?.rentPrice ? `¥${linkedProduct.rentPrice.toLocaleString()}` : "—"}<span className="ml-0.5 text-[10px] font-bold text-slate-400">/日</span></div>
                        <div className="mt-0.5 text-xs font-bold text-slate-500">長期 {linkedProduct?.rentPriceLongTerm ? `¥${linkedProduct.rentPriceLongTerm.toLocaleString()}` : "—"}{SALES_ENABLED && ` / 販売 ${linkedProduct?.buyPrice ? `¥${linkedProduct.buyPrice.toLocaleString()}` : "—"}`}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex min-w-12 justify-center rounded-lg bg-blue-50 px-3 py-1 text-sm font-black text-blue-700">{linkedProduct?.stock ?? v.stock ?? 0}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-600">写真 {(v.photos || []).length}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-600">書類 {(v.vehicleFiles || []).length}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => handleEditVehicle(v)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" title="編集">
                            <span className="material-symbols-outlined text-[17px]">edit</span>
                          </button>
                          {linkedProduct && (
                            <button onClick={() => setQrProduct(linkedProduct)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-white text-blue-700 hover:bg-blue-50" title="QR">
                              <span className="material-symbols-outlined text-[17px]">qr_code_2</span>
                            </button>
                          )}
                          <button onClick={() => handleDeleteVehicle(v.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50" title="削除">
                            <span className="material-symbols-outlined text-[17px]">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          {currentRowsCount === 0 && (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <span className="material-symbols-outlined text-[42px] text-slate-300">inventory_2</span>
              <div className="mt-2 text-sm font-black text-slate-700">該当する商品がありません</div>
              <div className="mt-1 text-xs font-bold text-slate-400">検索条件またはカテゴリを変更してください。</div>
            </div>
          )}
          {/* もっと見る: 表示件数を24件ずつ増やす */}
          {(activeSubTab === "security" ? pagedProducts.hasMore : pagedVehicles.hasMore) && (
            <div className="flex justify-center border-t border-slate-100 px-4 py-4">
              <button
                onClick={activeSubTab === "security" ? pagedProducts.showMore : pagedVehicles.showMore}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-5 py-2 text-sm font-black text-blue-700 hover:bg-slate-100"
              >
                <span className="material-symbols-outlined text-[17px]">expand_more</span>
                もっと見る（残り {activeSubTab === "security" ? pagedProducts.remaining : pagedVehicles.remaining} 件）
              </button>
            </div>
          )}
        </div>
      </div>

      {qrProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-[420px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-[18px] font-black text-slate-900">商品QRコード</h2>
                <p className="mt-0.5 truncate font-mono text-xs font-bold text-slate-500">{qrProduct.id}</p>
              </div>
              <button type="button" onClick={() => setQrProduct(null)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="p-5">
              <div className="rounded-lg border border-slate-200 bg-white p-4 text-center">
                <div className="mx-auto flex h-[250px] w-[250px] items-center justify-center rounded-lg bg-white">
                  {qrImage ? <img src={qrImage} alt={`${qrProduct.name} QR`} className="h-full w-full object-contain" /> : <span className="material-symbols-outlined text-[44px] text-slate-300">qr_code_2</span>}
                </div>
                <div className="mt-3 text-sm font-black text-slate-900">{qrProduct.name}</div>
                <div className="mt-1 font-mono text-xs font-black text-blue-700">{getProductQrCode(qrProduct)}</div>
                <div className="mt-1 break-all font-mono text-[10px] font-bold text-slate-400">{getProductQrPayload(qrProduct)}</div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    updateProduct(qrProduct.id, makeProductQrFields(qrProduct));
                    setQrProduct({ ...qrProduct, ...makeProductQrFields(qrProduct) });
                  }}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-xs font-black text-slate-700 hover:bg-slate-50"
                >
                  <span className="material-symbols-outlined text-[17px]">save</span>
                  QRを保存
                </button>
                <a
                  href={qrImage || undefined}
                  download={`${getProductQrCode(qrProduct)}.png`}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#1a1c9a] text-xs font-black text-white hover:bg-[#2537c4]"
                >
                  <span className="material-symbols-outlined text-[17px]">download</span>
                  PNG保存
                </a>
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-black text-slate-700 hover:bg-white"
              >
                <span className="material-symbols-outlined text-[17px]">print</span>
                QRラベルを印刷
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-[760px] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/70">
              <div><h2 className="text-[22px] font-bold text-slate-800">{editingProduct ? "商品を編集" : "保安用品を追加"}</h2></div>
              <button type="button" onClick={() => setIsProductModalOpen(false)} className="w-[34px] h-[34px] border border-slate-200 rounded-lg bg-white text-slate-500 hover:bg-slate-50">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 bg-slate-50/40">
              <form id="productForm" onSubmit={saveProduct} className="space-y-4">

                {/* 基本情報 */}
                <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-5 shadow-sm">
                  <div className="flex items-center gap-3 border-b border-slate-200/60 pb-3">
                    <span className="material-symbols-outlined text-[20px] text-blue-700 bg-blue-50 w-8 h-8 rounded-lg flex items-center justify-center">info</span>
                    <div>
                      <h4 className="font-bold text-slate-800 text-[15px]">基本情報</h4>
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
                            {productCategoryOptions.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-500 mb-2">単位（数え方）</label>
                        <input defaultValue={editingProduct?.unit || ""} name="unit" list="product-unit-options" className="w-full border border-slate-300 bg-white rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow" placeholder="例：個・本・台（未設定なら 点）" />
                        <datalist id="product-unit-options">
                          {UNIT_OPTIONS.map((u) => <option key={u} value={u} />)}
                        </datalist>
                        <p className="text-xs text-slate-400 mt-1">数量の単位。一覧から選ぶか自由入力。</p>
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-500 mb-2">管理ID</label>
                        <input defaultValue={editingProduct?.id || ""} name="id" disabled={!!editingProduct} className="w-full border border-slate-300 bg-white rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow disabled:bg-slate-100 disabled:text-slate-500" placeholder="空欄で自動採番" />
                        <p className="text-xs text-slate-400 mt-1">{editingProduct ? "変更不可" : "空欄で自動採番"}</p>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-2">商品画像</label>
                      <div className="flex flex-col sm:flex-row gap-4">
                        <div className="w-28 h-28 rounded-2xl border border-slate-200 bg-white overflow-hidden flex items-center justify-center shrink-0">
                          {productImageDraft ? (
                            <img src={productImageDraft} alt="商品画像" className="w-full h-full object-contain" />
                          ) : (
                            <span className="material-symbols-outlined text-slate-300 text-[36px]">image</span>
                          )}
                        </div>
                        <div className="flex-1 space-y-3">
                          <div className="flex flex-wrap gap-2">
                            <label className="inline-flex items-center justify-center gap-1.5 h-[38px] px-4 rounded-xl bg-[#1a1c9a] hover:bg-[#2537c4] text-white font-bold text-xs cursor-pointer shadow-sm">
                              <span className="material-symbols-outlined text-[17px]">add_photo_alternate</span>
                              画像をアップロード
                              <input type="file" accept="image/*" className="hidden" onChange={handleProductImageUpload} />
                            </label>
                            {productImageDraft && (
                              <button type="button" onClick={() => setProductImageDraft("")} className="inline-flex items-center gap-1.5 h-[38px] px-3 rounded-xl border border-slate-200 bg-white text-slate-600 font-bold text-xs hover:bg-slate-50">
                                <span className="material-symbols-outlined text-[16px]">close</span>
                                クリア
                              </button>
                            )}
                          </div>
                          <input
                            type="text"
                            value={productImageDraft}
                            onChange={(e) => setProductImageDraft(e.target.value)}
                            name="image"
                            className="w-full border border-slate-300 bg-white rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow"
                            placeholder="画像URL またはアップロード画像"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 価格・在庫 */}
                <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-5 shadow-sm">
                  <div className="flex items-center gap-3 border-b border-slate-200/60 pb-3">
                    <span className="material-symbols-outlined text-[20px] text-emerald-700 bg-emerald-50 w-8 h-8 rounded-lg flex items-center justify-center">payments</span>
                    <div>
                      <h4 className="font-bold text-slate-800 text-[15px]">価格・在庫設定</h4>
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
                    {SALES_ENABLED && (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-2">販売価格（円）</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">¥</span>
                        <input type="number" defaultValue={editingProduct?.buyPrice || ""} name="buyPrice" className="w-full border border-slate-300 bg-white rounded-xl pl-7 pr-3 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow font-bold text-slate-700" placeholder="—" />
                      </div>
                    </div>
                    )}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-2">弁償価格（円/個）<span className="ml-1 font-medium text-slate-400">破損・紛失時の弁償単価</span></label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">¥</span>
                        <input type="number" defaultValue={editingProduct?.compensationPrice || ""} name="compensationPrice" className="w-full border border-slate-300 bg-white rounded-xl pl-7 pr-3 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow font-bold text-slate-700" placeholder="販売価格を使用" />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-5">
                    <div>
                       <label className="block text-xs font-bold text-slate-500 mb-2">在庫数</label>
                       <input type="number" required defaultValue={editingProduct?.stock || 0} name="stock" className="w-full border border-slate-300 bg-white rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow font-bold text-slate-700" />
                    </div>
                  </div>
                </div>

                {/* 保証料 */}
                <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-5 shadow-sm">
                  <div className="flex items-center gap-3 border-b border-slate-200/60 pb-3">
                    <span className="material-symbols-outlined text-[20px] text-purple-700 bg-purple-50 w-8 h-8 rounded-lg flex items-center justify-center">gavel</span>
                    <div>
                      <h4 className="font-bold text-slate-800 text-[15px]">保証料設定（準備費用）</h4>
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
                </div>

                {/* 詳細 */}
                <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-5 shadow-sm">
                  <div className="flex items-center gap-3 border-b border-slate-200/60 pb-3">
                    <span className="material-symbols-outlined text-[20px] text-amber-700 bg-amber-50 w-8 h-8 rounded-lg flex items-center justify-center">notes</span>
                    <div>
                      <h4 className="font-bold text-slate-800 text-[15px]">商品説明</h4>
                    </div>
                  </div>
                  <div>
                    <textarea name="description" defaultValue={editingProduct?.description || ""} className="w-full border border-slate-300 bg-white rounded-xl p-4 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-shadow min-h-[120px]" placeholder="現場での用途や特徴など"></textarea>
                  </div>
                </div>

              </form>
            </div>
            <div className="px-6 py-4 border-t bg-white flex justify-end gap-3">
              <button type="button" onClick={() => setIsProductModalOpen(false)} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 rounded-lg">キャンセル</button>
              <button form="productForm" type="submit" disabled={productSaving} className="inline-flex items-center gap-2 px-6 py-2.5 text-white bg-[#1a1c9a] font-bold rounded-lg disabled:bg-slate-300 disabled:cursor-not-allowed">
                <span className="material-symbols-outlined text-[17px]">save</span>
                {productSaving ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vehicle Modal */}
      {isVehicleModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-[760px] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/70 sticky top-0 z-10 shrink-0">
              <div>
                <h2 className="text-[22px] font-bold text-slate-800 flex items-center gap-3">{editingVehicle ? "保安車両を編集" : "保安車両を追加"}</h2>
                <p className="text-slate-500 text-sm mt-1">{editingVehicle ? editingVehicle.id : "新規登録"}</p>
              </div>
              <button type="button" onClick={() => setIsVehicleModalOpen(false)} className="w-[34px] h-[34px] flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 transition-colors">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 bg-slate-50/40">
              <form id="vehicleForm" onSubmit={saveVehicle} className="space-y-4">
                {/* 車両データ */}
                <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-5 shadow-sm">
                  <div className="flex items-center gap-3 border-b border-slate-200/60 pb-3">
                    <span className="material-symbols-outlined text-[20px] text-emerald-700 bg-emerald-50 w-8 h-8 rounded-lg flex items-center justify-center">local_shipping</span>
                    <div>
                      <h4 className="font-bold text-slate-800 text-[15px]">車両データ</h4>
                    </div>
                  </div>
                  <div className="space-y-5">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-2">カテゴリ</label>
                      <select name="category" defaultValue={editingVehicle?.category || VEHICLE_CATEGORIES[0]} className="w-full border border-slate-300 bg-white rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none">
                        {vehicleCategoryOptions.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-5">
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-500 mb-2">モデル／商品名 <span className="text-red-500">*</span></label>
                        <input required defaultValue={editingVehicle?.name || ""} name="name" className="w-full border border-slate-300 bg-white rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none" />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-500 mb-2">在庫数（台数） <span className="text-red-500">*</span></label>
                        {/* 在庫は商品マスタの live 値を初期表示（editingVehicle.stock は古いミラーで、
                            出庫中でも登録時の値を出して保存時に live 在庫を巻き戻してしまう）。 */}
                        <input type="number" required defaultValue={editingVehicle ? (products.find((p) => p && p.id === (editingVehicle.productId || editingVehicle.id))?.stock ?? editingVehicle?.stock ?? 1) : 1} name="stock" className="w-full border border-slate-300 bg-white rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none font-bold text-slate-700" />
                      </div>
                    </div>
                    <div className="flex gap-5">
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-500 mb-2">代表ナンバー（識別用）</label>
                        <input defaultValue={editingVehicle?.plate || ""} name="plate" className="w-full border border-slate-300 bg-white rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none" placeholder="例：品川 500 さ 12-34" />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-500 mb-2">状況</label>
                        <select name="status" defaultValue={editingVehicle?.status || "空車"} className="w-full border border-slate-300 bg-white rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none">
                          <option value="使用中">使用中</option>
                          <option value="整備中">整備中</option>
                          <option value="空車">空車</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 価格設定 */}
                <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-5 shadow-sm">
                  <div className="flex items-center gap-3 border-b border-slate-200/60 pb-3">
                    <span className="material-symbols-outlined text-[20px] text-blue-700 bg-blue-50 w-8 h-8 rounded-lg flex items-center justify-center">payments</span>
                    <div>
                      <h4 className="font-bold text-slate-800 text-[15px]">価格設定</h4>
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
                    {SALES_ENABLED && (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-2">販売価格（円）</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">¥</span>
                        <input type="number" defaultValue={editingVehicle ? (products.find(p => p && p.id === (editingVehicle.productId || editingVehicle.id))?.buyPrice || "") : ""} name="buyPrice" className="w-full border border-slate-300 bg-white rounded-xl pl-7 pr-3 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none font-bold text-slate-700" placeholder="—" />
                      </div>
                    </div>
                    )}
                  </div>
                </div>

                {/* メディア設定 */}
                <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-5 shadow-sm">
                  <div className="flex items-center gap-3 border-b border-slate-200/60 pb-3">
                    <span className="material-symbols-outlined text-[20px] text-purple-700 bg-purple-50 w-8 h-8 rounded-lg flex items-center justify-center">image</span>
                    <div>
                      <h4 className="font-bold text-slate-800 text-[15px]">メディア設定</h4>
                    </div>
                  </div>
                  <div className="space-y-5">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-2">代表画像</label>
                      <div className="flex flex-col sm:flex-row gap-4">
                        <div className="w-32 h-32 rounded-2xl border border-slate-200 bg-white overflow-hidden flex items-center justify-center shrink-0">
                          {vehicleImageDraft ? (
                            <img src={vehicleImageDraft} alt="車両代表画像" className="w-full h-full object-cover" />
                          ) : (
                            <span className="material-symbols-outlined text-slate-300 text-[40px]">directions_car</span>
                          )}
                        </div>
                        <div className="flex-1 space-y-3">
                          <div className="flex flex-wrap gap-2">
                            <label className="inline-flex items-center justify-center gap-1.5 h-[38px] px-4 rounded-xl bg-[#1a1c9a] hover:bg-[#2537c4] text-white font-bold text-xs cursor-pointer shadow-sm">
                              <span className="material-symbols-outlined text-[17px]">add_photo_alternate</span>
                              画像をアップロード
                              <input type="file" multiple accept="image/*" className="hidden" onChange={handleVehicleImageUpload} />
                            </label>
                            {vehicleImageDraft && (
                              <button type="button" onClick={() => setVehicleImageDraft("")} className="inline-flex items-center gap-1.5 h-[38px] px-3 rounded-xl border border-slate-200 bg-white text-slate-600 font-bold text-xs hover:bg-slate-50">
                                <span className="material-symbols-outlined text-[16px]">close</span>
                                代表解除
                              </button>
                            )}
                          </div>
                          <input
                            type="text"
                            value={vehicleImageDraft}
                            onChange={(e) => setVehicleImageDraft(e.target.value)}
                            name="image"
                            className="w-full border border-slate-300 bg-white rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                            placeholder="画像URL またはアップロード画像"
                          />
                        </div>
                      </div>
                    </div>

                    {vehiclePhotosDraft.length > 0 && (
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-2">登録画像</label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {vehiclePhotosDraft.map((photo, i) => (
                            <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-white">
                              <img
                                src={isRenderableImage(photo) ? photo : "https://placehold.co/400x400/e2e8f0/64748b?text=Image"}
                                alt="車両画像"
                                className="w-full h-full object-cover"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const next = vehiclePhotosDraft.filter((_, idx) => idx !== i);
                                  setVehiclePhotosDraft(next);
                                  if (vehicleImageDraft === photo) setVehicleImageDraft(next[0] || "");
                                }}
                                className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-white/90 text-red-600 border border-white shadow flex items-center justify-center cursor-pointer"
                              >
                                <span className="material-symbols-outlined text-[16px]">delete</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setVehicleImageDraft(photo)}
                                className="absolute left-1.5 bottom-1.5 px-2 py-1 rounded-lg bg-white/90 text-[10px] font-bold text-slate-700 border border-white shadow"
                              >
                                代表
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-2">添付ファイル</label>
                      <div className="space-y-2 mb-3">
                        {vehicleFilesDraft.map((file, i) => (
                          <div key={file.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <span className="material-symbols-outlined text-[18px] text-[#1a1c9a]">attach_file</span>
                            <span className="text-xs font-bold text-slate-700 truncate flex-1">{file.name}</span>
                            <span className="text-[10px] font-bold text-slate-400">{formatBytes(file.size)}</span>
                            <button
                              type="button"
                              onClick={() => {
                                const nextFiles = vehicleFilesDraft.filter((_, idx) => idx !== i);
                                setVehicleFilesDraft(nextFiles);
                                setVehicleDocsDraft((prev) => prev.filter((name) => name !== file.name));
                              }}
                              className="w-8 h-8 rounded-lg text-red-600 hover:bg-red-50 flex items-center justify-center"
                            >
                              <span className="material-symbols-outlined text-[17px]">delete</span>
                            </button>
                          </div>
                        ))}
                        {vehicleFilesDraft.length === 0 && (
                          <div className="text-xs font-bold text-slate-400 bg-white border border-dashed border-slate-300 rounded-xl p-4 text-center">
                            車検証・保険証・整備書類などをアップロードできます。
                          </div>
                        )}
                      </div>
                      <label className="inline-flex items-center justify-center gap-1.5 h-[38px] px-4 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-bold text-xs cursor-pointer shadow-sm">
                        <span className="material-symbols-outlined text-[17px]">upload_file</span>
                        ファイルをアップロード
                        <input type="file" multiple className="hidden" onChange={handleVehicleFileUpload} />
                      </label>
                    </div>
                  </div>
                </div>
                 
              </form>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0">
              <button type="button" onClick={() => setIsVehicleModalOpen(false)} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">
                キャンセル
              </button>
              <button form="vehicleForm" type="submit" className="px-6 py-2.5 text-sm font-bold text-white bg-[#1a1c9a] hover:bg-blue-800 rounded-lg shadow-sm flex items-center gap-2 transition-colors">
                <span className="material-symbols-outlined text-[17px]">save</span>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Add Modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-[1100px] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200 animate-[fadeIn_0.2s_ease-out]">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/70 sticky top-0 z-10 shrink-0">
              <div>
                <h2 className="text-[20px] font-bold text-slate-800 flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-blue-600 bg-blue-50 w-8 h-8 rounded-lg flex items-center justify-center">grid_on</span>
                  {bulkMode === "vehicles" ? "保安車両一括追加" : "保安用品一括追加"}
                </h2>
              </div>
              <button type="button" onClick={() => { setIsBulkModalOpen(false); setBulkText(""); setBulkItems([]); }} className="w-8 h-8 border border-slate-200 rounded-lg bg-white text-slate-400 hover:bg-slate-50">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 bg-slate-50/40">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full items-stretch">
                
                {/* Left Side: Original Raw Textarea */}
                <div className="lg:col-span-4 flex flex-col space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-700">CSV/TSV テキストデータ入力</label>
                  </div>
                  <textarea
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    className="w-full flex-1 min-h-[350px] font-mono text-xs p-3.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none resize-none bg-white shadow-inner"
                    placeholder={bulkMode === "vehicles"
                      ? (SALES_ENABLED ? "車両名,カテゴリ,ナンバー,レンタル単価,長期単価,販売価格,台数" : "車両名,カテゴリ,ナンバー,レンタル単価,長期単価,台数")
                      : (SALES_ENABLED ? "商品名,カテゴリ,レンタル単価,長期単価,販売価格,在庫数" : "商品名,カテゴリ,レンタル単価,長期単価,在庫数")}
                  />
                  {bulkMode === "vehicles" && (
                    <p className="text-[11px] font-bold text-slate-400 leading-relaxed">
                      カテゴリは {VEHICLE_CATEGORIES.join(" / ")} のいずれか。台数は在庫として連動商品に反映されます。
                    </p>
                  )}
                </div>

                {/* Right Side: Interactive Live Inline Spreadsheet */}
                <div className="lg:col-span-8 flex flex-col">
                  <div className="text-xs font-bold text-slate-700 mb-3 flex items-center justify-between">
                    <span>登録前プレビュー</span>
                    <span className="px-2 py-0.5 rounded bg-slate-200/80 font-mono text-slate-600 font-bold">{bulkItems.length} 件解析</span>
                  </div>

                  <div className="flex-1 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm flex flex-col min-h-[350px]">
                    {bulkItems.length > 0 ? (
                      <div className="overflow-auto max-h-[500px]">
                        {bulkMode === "vehicles" ? (
                        <table className="w-full text-left border-collapse text-xs table-fixed">
                          <thead>
                            <tr className="bg-slate-100/90 border-b border-slate-200 sticky top-0 z-10">
                              <th className="p-2.5 font-bold text-slate-600 w-[50px] text-center">状態</th>
                              <th className="p-2.5 font-bold text-slate-600 w-[180px]">車両名 *</th>
                              <th className="p-2.5 font-bold text-slate-600 w-[130px]">カテゴリ *</th>
                              <th className="p-2.5 font-bold text-slate-600 w-[120px]">ナンバー</th>
                              <th className="p-2.5 font-bold text-slate-600 w-[80px] text-right">日単価</th>
                              <th className="p-2.5 font-bold text-slate-600 w-[80px] text-right">長期</th>
                              {SALES_ENABLED && <th className="p-2.5 font-bold text-slate-600 w-[80px] text-right">販売</th>}
                              <th className="p-2.5 font-bold text-slate-600 w-[70px] text-right">台数</th>
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
                                  <select
                                    value={row.category}
                                    onChange={(e) => updateBulkItemCell(idx, "category", e.target.value)}
                                    className={`w-full p-1.5 rounded outline-none border text-slate-700 bg-white transition-colors ${row.error && (!row.category || !VEHICLE_CATEGORIES.includes(row.category)) ? "border-red-400 bg-red-50" : "border-transparent focus:border-blue-400"}`}
                                  >
                                    {!row.category && <option value="">（未選択）</option>}
                                    {row.category && !VEHICLE_CATEGORIES.includes(row.category) && (
                                      <option value={row.category}>{row.category}（無効）</option>
                                    )}
                                    {VEHICLE_CATEGORIES.map((c) => (
                                      <option key={c} value={c}>{c}</option>
                                    ))}
                                  </select>
                                </td>
                                <td className="p-1">
                                  <input
                                    type="text"
                                    value={row.plate || ""}
                                    onChange={(e) => updateBulkItemCell(idx, "plate", e.target.value)}
                                    className="w-full p-1.5 rounded border border-transparent focus:border-blue-400 focus:bg-white outline-none text-slate-600"
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
                                {SALES_ENABLED && (
                                <td className="p-1">
                                  <input
                                    type="number"
                                    value={row.buyPrice || ""}
                                    onChange={(e) => updateBulkItemCell(idx, "buyPrice", e.target.value)}
                                    className="w-full p-1.5 rounded border border-transparent focus:border-blue-400 focus:bg-white outline-none text-right font-mono text-slate-600"
                                  />
                                </td>
                                )}
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
                        ) : (
                        <table className="w-full text-left border-collapse text-xs table-fixed">
                          <thead>
                            <tr className="bg-slate-100/90 border-b border-slate-200 sticky top-0 z-10">
                              <th className="p-2.5 font-bold text-slate-600 w-[50px] text-center">状態</th>
                              <th className="p-2.5 font-bold text-slate-600 w-[200px]">商品名 *</th>
                              <th className="p-2.5 font-bold text-slate-600 w-[120px]">カテゴリ *</th>
                              <th className="p-2.5 font-bold text-slate-600 w-[85px] text-right">日単価</th>
                              <th className="p-2.5 font-bold text-slate-600 w-[85px] text-right">長期</th>
                              {SALES_ENABLED && <th className="p-2.5 font-bold text-slate-600 w-[85px] text-right">販売</th>}
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
                                {SALES_ENABLED && (
                                <td className="p-1">
                                  <input
                                    type="number"
                                    value={row.buyPrice || ""}
                                    onChange={(e) => updateBulkItemCell(idx, "buyPrice", e.target.value)}
                                    className="w-full p-1.5 rounded border border-transparent focus:border-blue-400 focus:bg-white outline-none text-right font-mono text-slate-600"
                                  />
                                </td>
                                )}
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
                        )}
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

            <div className="px-6 py-4 border-t border-slate-200 bg-white flex justify-between items-center shrink-0">
              <div className="text-xs font-bold text-slate-500">
                {bulkItems.length > 0 && (
                  <div className="flex gap-4">
                    <span className="text-emerald-600">正常アイテム: {bulkItems.filter(r => !r.error).length} 件</span>
                    {bulkItems.some(r => r.error) && <span className="text-red-500 font-bold">エラー項目: {bulkItems.filter(r => r.error).length} 件</span>}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setIsBulkModalOpen(false); setBulkText(""); setBulkItems([]); }} className="px-5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer">キャンセル</button>
                <button
                  type="button"
                  onClick={(e) => bulkMode === "vehicles" ? handleBulkVehicleSubmit() : handleBulkSubmit(e)}
                  disabled={bulkItems.filter(r => !r.error).length === 0}
                  className="px-6 py-2 text-xs font-bold text-white bg-[#1a1c9a] rounded-lg shadow-sm disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer disabled:cursor-not-allowed"
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
