import React, { useState, useEffect, useMemo } from "react";
import { confirmDialog } from "../../components/AppDialog";
import {
  Panel,
  Btn,
  Toolbar,
  Table,
  Badge,
  Modal,
  Drawer,
  Field,
  TextInput,
  SelectInput,
  Row,
  FormSection,
  triggerToast
} from "../../components/AdminUI";
import { useVehicles, VehicleDetail, type VehicleFile } from "../../context/VehicleContext";
import OrderBus from "../../lib/orderBus";

type VehicleStatusFilter = "all" | "空車" | "使用中" | "整備中" | "inspection";
type VehicleActionKind = "maintenance" | "repair" | "inspection";

const VEHICLE_IMAGE_FALLBACK = "https://imagedelivery.net/W-O2N6-kYOfvEexU-w0YSA/6ca65aee-8da0-466f-ff84-9de55ae2ee00/public";

function statusColor(status: VehicleDetail["status"]): VehicleDetail["statusColor"] {
  if (status === "使用中") return "emerald";
  if (status === "整備中") return "orange";
  return "blue";
}

function dateInputToSlash(value: string) {
  return value ? value.replace(/-/g, "/") : "";
}

function slashToDateInput(value: string | undefined) {
  return value ? value.replace(/\//g, "-") : "";
}

function formatDateSlash(date = new Date()) {
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function daysUntil(dateText: string | undefined): number {
  if (!dateText) return 999;
  // "YYYY-MM-DD" を UTC 解釈せずローカル日付として解釈（負オフセット TZ での ±1 日ズレ防止）。
  const date = new Date(dateText.replace(/\//g, "-") + "T00:00:00");
  if (Number.isNaN(date.getTime())) return 999;
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
}

function makeInspectionAlerts(vehicle: VehicleDetail, days: number, inspectionDate: string) {
  const rest = (vehicle.alerts || []).filter((alert) => !String(alert.title || "").includes("車検"));
  if (days <= 30) {
    return [
      {
        id: Date.now(),
        type: days < 0 ? "danger" as const : "warning" as const,
        title: days < 0 ? "車検期限超過" : "車検期限接近",
        subtitle: `${inspectionDate} / ${days < 0 ? `${Math.abs(days)}日超過` : `残り${days}日`}`,
        icon: "event_busy"
      },
      ...rest
    ];
  }
  return rest;
}

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

function syncLinkedProduct(vehicle: VehicleDetail, updates: Partial<VehicleDetail> = {}) {
  const merged = { ...vehicle, ...updates };
  const productId = merged.productId || "P-" + merged.id;
  const products = OrderBus.getAll<any>("products");
  const existing = products.find((p) => p?.id === productId);
  const image = firstVehicleImage(merged) || existing?.image || VEHICLE_IMAGE_FALLBACK;
  const payload = {
    name: merged.name,
    category: merged.category,
    // 既存の在庫を保持する。車両メタ編集フォームには stock 欄が無く merged.stock が undefined のため、
    // `|| 1` だと入出庫/棚卸で調整済みの商品在庫を毎回 1 に潰してしまう（価格と同じく existing を尊重）。
    stock: merged.stock != null ? Number(merged.stock) : (existing?.stock ?? 1),
    image,
    vehicleId: merged.id,
    plate: merged.plate,
    rentPrice: existing?.rentPrice ?? 3500,
    rentPriceLongTerm: existing?.rentPriceLongTerm ?? 2100,
    buyPrice: existing?.buyPrice ?? 0
  };
  if (existing) {
    OrderBus.patch("products", productId, payload);
  } else {
    OrderBus.push("products", { id: productId, ...payload });
  }
}

export default function AdminVehicles() {
  const { vehicles, addVehicle, updateVehicle, deleteVehicle } = useVehicles();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Selected vehicle for Drawer
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleDetail | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<VehicleDetail>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<VehicleStatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [calendarMode, setCalendarMode] = useState(false);
  const [vehicleAction, setVehicleAction] = useState<{ kind: VehicleActionKind; vehicle: VehicleDetail } | null>(null);
  const [actionDate, setActionDate] = useState(formatDateSlash());
  const [actionMileage, setActionMileage] = useState("");
  const [actionTitle, setActionTitle] = useState("");
  const [actionShop, setActionShop] = useState("");
  const [actionCost, setActionCost] = useState("");

  // Form states (Add Modal)
  const [newName, setNewName] = useState("軽トラック");
  const [newPlate, setNewPlate] = useState("");
  const [newCat, setNewCat] = useState("軽トラック");
  const [newMileage, setNewMileage] = useState("0 km");
  const [newStatus, setNewStatus] = useState<"空車" | "使用中" | "整備中">("空車");
  const [newInspectionDate, setNewInspectionDate] = useState("2027-01-01");
  const [newInsuranceDate, setNewInsuranceDate] = useState("2027-01-01");
  const [newManufacturer, setNewManufacturer] = useState("");
  const [newYear, setNewYear] = useState("");
  const [newColor, setNewColor] = useState("");
  const [newVin, setNewVin] = useState("");
  const [newEngineModel, setNewEngineModel] = useState("");
  const [newPurchaseDate, setNewPurchaseDate] = useState("");
  const [newPurchasePrice, setNewPurchasePrice] = useState("");

  // 追加モーダルの全項目を初期値へ戻す（部分リセットだとカテゴリ・車検満了日などが前回値のまま残る）。
  const resetAddForm = () => {
    setNewName("軽トラック");
    setNewPlate("");
    setNewCat("軽トラック");
    setNewMileage("0 km");
    setNewStatus("空車");
    setNewInspectionDate("2027-01-01");
    setNewInsuranceDate("2027-01-01");
    setNewManufacturer("");
    setNewYear("");
    setNewColor("");
    setNewVin("");
    setNewEngineModel("");
    setNewPurchaseDate("");
    setNewPurchasePrice("");
  };

  useEffect(() => {
    if (selectedVehicle) {
      setEditForm(selectedVehicle);
    }
  }, [selectedVehicle]);

  const vehicleCategories = useMemo(() => {
    return Array.from(new Set(vehicles.map((v) => v.category).filter(Boolean))).sort();
  }, [vehicles]);

  // カテゴリ候補: 既定プリセット＋実データのカテゴリ。編集時は現在値も必ず含める
  // （商品管理側で付けた "2tノーマル" 等が候補に無く、表示と保存値がズレるのを防ぐ）。
  const VEHICLE_CATEGORY_PRESETS = ["軽トラック", "軽バン", "2tトラック", "3tダンプ", "高所作業車"];
  const addCategoryOptions = Array.from(new Set([...VEHICLE_CATEGORY_PRESETS, ...vehicleCategories]));
  const editCategoryOptions = Array.from(new Set([...(editForm.category ? [editForm.category] : []), ...vehicleCategories, ...VEHICLE_CATEGORY_PRESETS]));

  const filteredVehicles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles.filter((v) => {
      const matchSearch =
        !q ||
        [v.id, v.name, v.plate, v.category, v.manufacturer, v.vin].some((value) =>
          String(value || "").toLowerCase().includes(q)
        );
      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "inspection" && Number(v.inspectionDaysRemaining || 999) <= 30) ||
        v.status === statusFilter;
      const matchCategory = categoryFilter === "all" || v.category === categoryFilter;
      return matchSearch && matchStatus && matchCategory;
    });
  }, [vehicles, search, statusFilter, categoryFilter]);

  const inspectionSchedule = useMemo(() => {
    return [...vehicles]
      .sort((a, b) => Number(a.inspectionDaysRemaining || 999) - Number(b.inspectionDaysRemaining || 999))
      .slice(0, 8);
  }, [vehicles]);

  const stats = useMemo(() => {
    return {
      total: vehicles.length,
      inUse: vehicles.filter((v) => v.status === "使用中").length,
      idle: vehicles.filter((v) => v.status === "空車").length,
      maintenance: vehicles.filter((v) => v.status === "整備中").length,
      inspectionSoon: vehicles.filter((v) => Number(v.inspectionDaysRemaining || 999) <= 30).length
    };
  }, [vehicles]);

  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlate.trim()) {
      triggerToast("ナンバープレートを入力してください", "warn");
      return;
    }

    const newId = "V-" + Math.floor(1000 + Math.random() * 9000);
    const inspectionDate = dateInputToSlash(newInspectionDate);
    const insuranceDate = dateInputToSlash(newInsuranceDate);
    const inspectionDaysRemaining = daysUntil(inspectionDate);
    const newVehicle: VehicleDetail = {
      id: newId,
      productId: "P-" + newId,
      name: newName,
      plate: newPlate,
      category: newCat,
      status: newStatus,
      statusColor: statusColor(newStatus),
      inspectionDate,
      inspectionDaysRemaining,
      insuranceDate,
      manufacturer: newManufacturer.trim(),
      year: newYear.trim(),
      color: newColor.trim(),
      vin: newVin.trim(),
      engineModel: newEngineModel.trim(),
      purchaseDate: newPurchaseDate ? dateInputToSlash(newPurchaseDate) : "",
      purchasePrice: newPurchasePrice.trim(),
      mileage: newMileage,
      maintenanceDesc: "新規登録",
      maintenanceDate: formatDateSlash(),
      alerts: [],
      maintenanceHistory: [],
      repairHistory: [],
      documents: ["車検証"],
      vehicleFiles: [],
      photos: []
    };

    addVehicle(newVehicle);
    syncLinkedProduct(newVehicle);
    triggerToast(`車両 ${newPlate} を登録しました`, "ok");
    setIsAddModalOpen(false);
    resetAddForm();
  };

  const handleUpdateVehicle = () => {
    if (!selectedVehicle) return;
    const inspectionDate = editForm.inspectionDate || selectedVehicle.inspectionDate;
    const inspectionDaysRemaining = daysUntil(inspectionDate);
    const updates = {
      ...editForm,
      inspectionDaysRemaining,
      alerts: makeInspectionAlerts(selectedVehicle, inspectionDaysRemaining, inspectionDate),
      statusColor: statusColor((editForm.status || selectedVehicle.status) as VehicleDetail["status"]),
    };
    updateVehicle(selectedVehicle.id, updates);
    syncLinkedProduct(selectedVehicle, updates);
    triggerToast(`車両 ${editForm.plate} を更新しました`, "ok");
    setIsEditing(false);
    
    // Update local state to reflect immediately
    setSelectedVehicle(prev => prev ? { ...prev, ...updates } as VehicleDetail : null);
  };

  const handleOpenAction = (kind: VehicleActionKind, vehicle: VehicleDetail) => {
    setVehicleAction({ kind, vehicle });
    setActionDate(kind === "inspection" ? slashToDateInput(vehicle.inspectionDate) : slashToDateInput(formatDateSlash()));
    setActionMileage(vehicle.mileage || "");
    setActionTitle(kind === "maintenance" ? "定期点検" : kind === "repair" ? "修理対応" : "車検更新");
    setActionShop(kind === "repair" ? "提携修理工場" : "");
    setActionCost("");
  };

  const handleSetStatus = (status: VehicleDetail["status"]) => {
    if (!selectedVehicle) return;
    const updates: Partial<VehicleDetail> = {
      status,
      statusColor: statusColor(status),
      maintenanceDesc: status === "整備中" ? "車庫管理から整備手配" : selectedVehicle.maintenanceDesc,
      maintenanceDate: status === "整備中" ? formatDateSlash() : selectedVehicle.maintenanceDate,
    };
    updateVehicle(selectedVehicle.id, updates);
    if (status === "整備中") {
      OrderBus.push("maintenance", {
        id: "MN-" + Math.floor(550 + Math.random() * 4000),
        name: selectedVehicle.name,
        cat: selectedVehicle.category,
        cycle: "臨時",
        last: formatDateSlash(),
        next: formatDateSlash(),
        days: 0,
        status: "予定"
      });
    }
    setSelectedVehicle((prev) => prev ? { ...prev, ...updates } : null);
    triggerToast(`${selectedVehicle.plate} を ${status} に更新しました`, "ok");
  };

  const handleSaveVehicleAction = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!vehicleAction) return;
    // 日付未入力のまま保存すると本日へ無言で補正され、車検満了日が本日＝期限切れアラート誤発火になる。
    if (!actionDate) {
      triggerToast(vehicleAction.kind === "inspection" ? "新しい車検満了日を入力してください" : "記録日を入力してください", "warn");
      return;
    }
    const vehicle = vehicleAction.vehicle;
    const dateSlash = dateInputToSlash(actionDate) || formatDateSlash();
    const mileage = actionMileage || vehicle.mileage;

    if (vehicleAction.kind === "maintenance") {
      const entry = { date: dateSlash, item: actionTitle || "定期点検", mileage };
      const updates: Partial<VehicleDetail> = {
        mileage,
        maintenanceDesc: entry.item,
        maintenanceDate: dateSlash,
        maintenanceHistory: [entry, ...(vehicle.maintenanceHistory || [])],
        status: "空車",
        statusColor: "blue"
      };
      updateVehicle(vehicle.id, updates);
      OrderBus.push("maintenance", {
        id: "MN-" + Math.floor(550 + Math.random() * 4000),
        name: vehicle.name,
        cat: vehicle.category,
        cycle: "記録",
        last: dateSlash,
        next: dateSlash,
        days: 0,
        status: "完了"
      });
      setSelectedVehicle((prev) => prev ? { ...prev, ...updates } : prev);
      triggerToast(`${vehicle.plate} のメンテナンスを記録しました`, "ok");
    }

    if (vehicleAction.kind === "repair") {
      const entry = {
        title: actionTitle || "修理対応",
        shop: actionShop || "提携修理工場",
        date: dateSlash,
        price: actionCost || "見積中",
        receipt: ""
      };
      const updates: Partial<VehicleDetail> = {
        mileage,
        status: "整備中",
        statusColor: "orange",
        maintenanceDesc: entry.title,
        maintenanceDate: dateSlash,
        repairHistory: [entry, ...(vehicle.repairHistory || [])]
      };
      updateVehicle(vehicle.id, updates);
      OrderBus.push("repairs", {
        id: "RP-" + Math.floor(1000 + Math.random() * 9000),
        asset: vehicle.name,
        vendor: entry.shop,
        status: "修理待ち",
        req: dateSlash,
        cost: actionCost ? Number(String(actionCost).replace(/[^\d]/g, "")) : null,
        warranty: false,
        issue: entry.title
      });
      setSelectedVehicle((prev) => prev ? { ...prev, ...updates } : prev);
      triggerToast(`${vehicle.plate} の修理を手配しました`, "ok");
    }

    if (vehicleAction.kind === "inspection") {
      const inspectionDate = dateSlash;
      const inspectionDaysRemaining = daysUntil(inspectionDate);
      const updates: Partial<VehicleDetail> = {
        inspectionDate,
        // 車検(inspectionDate)と自賠責保険(insuranceDate)は別物。車検更新で保険日を
        // 上書きしない（以前は insuranceDate を inspectionDate で潰していた）。
        inspectionDaysRemaining,
        alerts: makeInspectionAlerts(vehicle, inspectionDaysRemaining, inspectionDate),
        maintenanceHistory: [
          { date: formatDateSlash(), item: actionTitle || "車検更新", mileage },
          ...(vehicle.maintenanceHistory || [])
        ]
      };
      updateVehicle(vehicle.id, updates);
      setSelectedVehicle((prev) => prev ? { ...prev, ...updates } : prev);
      triggerToast(`${vehicle.plate} の車検日を更新しました`, "ok");
    }

    setVehicleAction(null);
  };

  const handleDeleteVehicle = async () => {
    if (!selectedVehicle) return;
    const plate = selectedVehicle.plate;
    if (!(await confirmDialog(`車両 ${plate} を削除しますか？`, { danger: true, okText: "削除" }))) return;
    deleteVehicle(selectedVehicle.id);
    if (selectedVehicle.productId) OrderBus.remove("products", selectedVehicle.productId);
    setSelectedVehicle(null);
    triggerToast(`車両 ${plate} を削除しました`, "ok");
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const valid = files.filter((file) => {
      if (!file.type.startsWith("image/")) {
        triggerToast(`${file.name} は画像ファイルではありません`, "warn");
        return false;
      }
      if (file.size > 8 * 1024 * 1024) {
        triggerToast(`${file.name} は8MBを超えています`, "warn");
        return false;
      }
      return true;
    });
    const uploaded = await Promise.all(valid.map(readImageAsDataUrl));
    setEditForm((prev) => ({ ...prev, photos: [...(prev.photos || []), ...uploaded] }));
    if (uploaded.length > 0) triggerToast(`${uploaded.length} 件の画像を追加しました`, "ok");
    e.target.value = "";
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const valid = files.filter((file) => {
      if (file.size > 8 * 1024 * 1024) {
        triggerToast(`${file.name} は8MBを超えています`, "warn");
        return false;
      }
      return true;
    });
    const uploaded = await Promise.all(valid.map(async (file) => makeVehicleFile(file, await readFileAsDataUrl(file))));
    setEditForm((prev) => ({
      ...prev,
      vehicleFiles: [...(prev.vehicleFiles || []), ...uploaded],
      documents: Array.from(new Set([...(prev.documents || []), ...uploaded.map((file) => file.name)]))
    }));
    if (uploaded.length > 0) triggerToast(`${uploaded.length} 件のファイルを追加しました`, "ok");
    e.target.value = "";
  };

  const cols = [
    {
      h: "車両 / ナンバー",
      wrap: true,
      cell: (r: VehicleDetail) => (
        <div>
          <div className="font-bold text-slate-800">{r.name}</div>
          <div className="font-mono text-[11px] text-slate-500 font-bold bg-slate-100 px-1.5 py-0.5 rounded inline-block mt-1">
            {r.plate}
          </div>
        </div>
      )
    },
    {
      h: "カテゴリー",
      cell: (r: VehicleDetail) => <span className="text-sm font-medium text-slate-600">{r.category}</span>
    },
    {
      h: "メーカー",
      cell: (r: VehicleDetail) => <span className="text-sm text-slate-500">{r.manufacturer}</span>
    },
    {
      h: "走行距離",
      align: "right" as const,
      cell: (r: VehicleDetail) => <span className="font-mono font-semibold text-slate-700">{r.mileage}</span>
    },
    {
      h: "車検満了日",
      cell: (r: VehicleDetail) => {
        const isWarning = r.inspectionDaysRemaining <= 30; // フィルタ/統計/アラート(<=30)と閾値を統一
        return (
          <div className="flex flex-col">
            <span className={`font-mono text-sm font-bold ${isWarning ? 'text-red-600' : 'text-slate-700'}`}>
              {r.inspectionDate}
            </span>
            {isWarning && <span className="text-[10px] text-red-500 font-bold mt-0.5">残り{r.inspectionDaysRemaining}日</span>}
          </div>
        );
      }
    },
    {
      h: "ステータス",
      align: "center" as const,
      cell: (r: VehicleDetail) => (
        <Badge
          tone={r.statusColor === "emerald" ? "ok" : r.statusColor === "blue" ? "default" : "warning"}
        >
          {r.status}
        </Badge>
      )
    }
  ];

  return (
    <div className="space-y-6">
      {/* Metrics Header */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-semibold">総車両数</p>
            <h4 className="text-2xl font-black text-slate-800 mt-1 font-mono">
              {stats.total}
            </h4>
          </div>
          <span className="material-symbols-outlined text-[32px] text-blue-100">directions_car</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-semibold">稼働中（使用中）</p>
            <h4 className="text-2xl font-black text-emerald-600 mt-1 font-mono">
              {stats.inUse}
            </h4>
          </div>
          <span className="material-symbols-outlined text-[32px] text-emerald-100">sync</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-semibold">空車（待機）</p>
            <h4 className="text-2xl font-black text-blue-600 mt-1 font-mono">
              {stats.idle}
            </h4>
          </div>
          <span className="material-symbols-outlined text-[32px] text-blue-100">local_parking</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-semibold">整備中</p>
            <h4 className="text-2xl font-black text-orange-600 mt-1 font-mono">
              {stats.maintenance}
            </h4>
          </div>
          <span className="material-symbols-outlined text-[32px] text-orange-100">build</span>
        </div>
      </div>

      <Toolbar
        right={
          <Btn icon="add" variant="primary" onClick={() => { resetAddForm(); setIsAddModalOpen(true); }}>
            車両を登録
          </Btn>
        }
      >
        <div className="flex gap-2 flex-wrap">
          <div className="relative w-full md:w-72">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#7ca39f] text-[18px]">search</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="車両名・ナンバー・車台番号で検索"
              className="w-full h-[36px] pl-9 pr-3 rounded-lg border border-[#b5dad6] bg-white text-sm font-semibold outline-none focus:border-[#2ba8a2]"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as VehicleStatusFilter)}
            className="h-[36px] rounded-lg border border-[#b5dad6] bg-white px-3 text-sm font-bold text-[#46706c] outline-none"
          >
            <option value="all">すべての状態</option>
            <option value="空車">空車</option>
            <option value="使用中">使用中</option>
            <option value="整備中">整備中</option>
            <option value="inspection">車検30日以内</option>
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-[36px] rounded-lg border border-[#b5dad6] bg-white px-3 text-sm font-bold text-[#46706c] outline-none"
          >
            <option value="all">すべての車種</option>
            {vehicleCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          <Btn
            size="sm"
            icon="calendar_today"
            variant={calendarMode ? "primary" : "ghost"}
            onClick={() => setCalendarMode((v) => !v)}
          >
            車検
          </Btn>
        </div>
      </Toolbar>

      {calendarMode && (
        <Panel title="車検スケジュール" icon="event_note" sub="期限が近い順に表示">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {inspectionSchedule.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelectedVehicle(v)}
                className="text-left rounded-lg border border-[#cfe6e3] bg-white p-3 hover:bg-[#e8f6f5] transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-black text-sm text-slate-800 truncate">{v.name}</div>
                  <Badge tone={Number(v.inspectionDaysRemaining || 999) <= 30 ? "danger" : "default"}>
                    残り{v.inspectionDaysRemaining}日
                  </Badge>
                </div>
                <div className="mt-2 text-xs font-bold text-slate-500 font-mono">{v.plate}</div>
                <div className="mt-1 text-[11px] font-bold text-slate-400">{v.inspectionDate}</div>
              </button>
            ))}
          </div>
        </Panel>
      )}

      <Panel title="車両・車庫管理" icon="directions_car" sub={`${filteredVehicles.length} 台を表示`}>
        <Table cols={cols} rows={filteredVehicles} onRow={setSelectedVehicle} />
      </Panel>

      {/* Vehicle Details Drawer */}
      <Drawer
        open={!!selectedVehicle}
        onClose={() => { setSelectedVehicle(null); setIsEditing(false); }}
        title="車両詳細"
        sub={selectedVehicle?.plate}
        width={700}
        footer={
          isEditing ? (
            <>
              <Btn variant="ghost" onClick={() => setIsEditing(false)}>キャンセル</Btn>
              <Btn variant="primary" icon="check" onClick={handleUpdateVehicle}>保存する</Btn>
            </>
          ) : (
            <Btn variant="primary" icon="edit" onClick={() => setIsEditing(true)}>編集する</Btn>
          )
        }
      >
        {selectedVehicle && (
          <div className="space-y-6">
            {!isEditing ? (
              // Read-only View
              <>
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400">
                    <span className="material-symbols-outlined text-[32px]">directions_car</span>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">{selectedVehicle.name}</h2>
                    <p className="text-sm text-slate-500 font-mono mt-1">{selectedVehicle.plate}</p>
                    <div className="mt-2">
                      <Badge tone={selectedVehicle.statusColor === "emerald" ? "ok" : selectedVehicle.statusColor === "blue" ? "default" : "warning"}>
                        {selectedVehicle.status}
                      </Badge>
                    </div>
                  </div>
                </div>

                <FormSection title="車庫操作">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
                    <Btn
                      icon="local_parking"
                      variant={selectedVehicle.status === "空車" ? "primary" : "secondary"}
                      disabled={selectedVehicle.status === "空車"}
                      onClick={() => handleSetStatus("空車")}
                    >
                      空車
                    </Btn>
                    <Btn
                      icon="sync"
                      variant={selectedVehicle.status === "使用中" ? "primary" : "secondary"}
                      disabled={selectedVehicle.status === "使用中"}
                      onClick={() => handleSetStatus("使用中")}
                    >
                      使用中
                    </Btn>
                    <Btn
                      icon="build"
                      variant={selectedVehicle.status === "整備中" ? "primary" : "secondary"}
                      disabled={selectedVehicle.status === "整備中"}
                      onClick={() => handleSetStatus("整備中")}
                    >
                      整備中
                    </Btn>
                    <Btn icon="event_available" variant="secondary" onClick={() => handleOpenAction("inspection", selectedVehicle)}>
                      車検更新
                    </Btn>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    <Btn icon="fact_check" variant="secondary" onClick={() => handleOpenAction("maintenance", selectedVehicle)}>
                      点検記録
                    </Btn>
                    <Btn icon="car_repair" variant="secondary" onClick={() => handleOpenAction("repair", selectedVehicle)}>
                      修理手配
                    </Btn>
                    <Btn icon="edit" variant="secondary" onClick={() => setIsEditing(true)}>
                      編集
                    </Btn>
                    <Btn icon="delete" variant="danger" onClick={handleDeleteVehicle}>
                      削除
                    </Btn>
                  </div>
                </FormSection>

                <FormSection title="基本情報">
                  <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                    <div>
                      <div className="text-xs text-slate-400 font-bold mb-1">メーカー</div>
                      <div className="text-sm font-semibold text-slate-800">{selectedVehicle.manufacturer}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 font-bold mb-1">年式</div>
                      <div className="text-sm font-semibold text-slate-800">{selectedVehicle.year}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 font-bold mb-1">車台番号 (VIN)</div>
                      <div className="text-sm font-semibold text-slate-800 font-mono">{selectedVehicle.vin}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 font-bold mb-1">走行距離</div>
                      <div className="text-sm font-semibold text-slate-800 font-mono">{selectedVehicle.mileage}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 font-bold mb-1">倉庫連携ID</div>
                      <div className="text-sm font-semibold text-slate-800 font-mono">{selectedVehicle.productId || selectedVehicle.id}</div>
                    </div>
                  </div>
                </FormSection>

                <FormSection title="法定・保険情報">
                  <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                    <div>
                      <div className="text-xs text-slate-400 font-bold mb-1">車検満了日</div>
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold text-slate-800 font-mono">{selectedVehicle.inspectionDate}</div>
                        <Badge tone={selectedVehicle.inspectionDaysRemaining <= 30 ? "danger" : "default"}>残り{selectedVehicle.inspectionDaysRemaining}日</Badge>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 font-bold mb-1">自賠責保険</div>
                      <div className="text-sm font-semibold text-slate-800 font-mono">{selectedVehicle.insuranceDate}</div>
                    </div>
                  </div>
                </FormSection>

                <FormSection title="添付ファイル・画像">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-slate-400 font-bold mb-2">ドキュメント</div>
                      {((selectedVehicle.documents || []).length > 0 || (selectedVehicle.vehicleFiles || []).length > 0) ? (
                        <div className="space-y-2">
                          {(selectedVehicle.documents || [])
                            .filter((doc) => !(selectedVehicle.vehicleFiles || []).some((file) => file.name === doc))
                            .map((doc, idx) => (
                            <div key={idx} className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-100 rounded-lg">
                              <span className="material-symbols-outlined text-[18px] text-slate-400">description</span>
                              <span className="text-xs font-semibold text-slate-700 truncate">{doc}</span>
                            </div>
                          ))}
                          {(selectedVehicle.vehicleFiles || []).map((file) => (
                            <a
                              key={file.id}
                              href={file.dataUrl}
                              download={file.name}
                              className="flex items-center gap-2 p-2 bg-[#fff8e7] border border-[#eadfb6] rounded-lg hover:bg-[#ffe47a]/30 transition-colors"
                            >
                              <span className="material-symbols-outlined text-[18px] text-[#8a6a00]">download</span>
                              <span className="text-xs font-bold text-slate-700 truncate flex-1">{file.name}</span>
                              <span className="text-[10px] font-bold text-slate-400">{formatBytes(file.size)}</span>
                            </a>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 italic">なし</div>
                      )}
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 font-bold mb-2">画像</div>
                      {selectedVehicle.photos && selectedVehicle.photos.length > 0 ? (
                        <div className="grid grid-cols-2 gap-2">
                          {selectedVehicle.photos.map((photo, idx) => (
                            <div key={idx} className="aspect-square bg-slate-100 rounded-lg flex items-center justify-center relative overflow-hidden border border-slate-200">
                              <img src={isRenderableImage(photo) ? photo : `https://placehold.co/400x400/e2e8f0/64748b?text=Image`} alt="Vehicle" className="object-cover w-full h-full" />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 italic">なし</div>
                      )}
                    </div>
                  </div>
                </FormSection>

                <FormSection title="メンテナンス・修理履歴">
                  {(selectedVehicle.maintenanceHistory.length > 0 || selectedVehicle.repairHistory.length > 0) ? (
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      {selectedVehicle.maintenanceHistory.map((m, i) => (
                        <div key={i} className="flex justify-between items-center p-3 border-b border-slate-100 last:border-0 bg-slate-50/50">
                          <div>
                            <div className="text-xs font-bold text-slate-800">{m.item}</div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">{m.date}</div>
                          </div>
                          <div className="text-xs font-bold text-slate-600 font-mono bg-white px-2 py-1 rounded shadow-sm border border-slate-200">
                            {m.mileage}
                          </div>
                        </div>
                      ))}
                      {selectedVehicle.repairHistory.map((r, i) => (
                        <div key={`repair-${i}`} className="flex justify-between items-center p-3 border-b border-slate-100 last:border-0 bg-slate-50/50">
                          <div>
                            <div className="text-xs font-bold text-slate-800">{r.title}</div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">{r.date} ・ {r.shop}</div>
                          </div>
                          <div className="text-xs font-bold text-slate-600 font-mono bg-white px-2 py-1 rounded shadow-sm border border-slate-200">
                            {r.price}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 italic">履歴はありません</div>
                  )}
                </FormSection>
              </>
            ) : (
              // Edit Form
              <div className="space-y-6">
                <FormSection title="基本情報">
                  <Row>
                    <Field label="車両名">
                      <TextInput value={editForm.name || ""} onChange={e => setEditForm({...editForm, name: e.target.value})} />
                    </Field>
                    <Field label="ナンバープレート">
                      <TextInput value={editForm.plate || ""} onChange={e => setEditForm({...editForm, plate: e.target.value})} />
                    </Field>
                  </Row>
                  <Row>
                    <Field label="カテゴリー">
                      <SelectInput value={editForm.category || ""} onChange={e => setEditForm({...editForm, category: e.target.value})} options={editCategoryOptions} />
                    </Field>
                    <Field label="ステータス">
                      <SelectInput value={editForm.status || "空車"} onChange={e => setEditForm({...editForm, status: e.target.value as any})} options={["空車", "使用中", "整備中"]} />
                    </Field>
                  </Row>
                  <Row>
                    <Field label="メーカー">
                      <TextInput value={editForm.manufacturer || ""} onChange={e => setEditForm({...editForm, manufacturer: e.target.value})} />
                    </Field>
                    <Field label="走行距離">
                      <TextInput value={editForm.mileage || ""} onChange={e => setEditForm({...editForm, mileage: e.target.value})} />
                    </Field>
                  </Row>
                  <Row>
                    <Field label="車台番号 (VIN)">
                      <TextInput value={editForm.vin || ""} onChange={e => setEditForm({...editForm, vin: e.target.value})} />
                    </Field>
                    <Field label="年式">
                      <TextInput value={editForm.year || ""} onChange={e => setEditForm({...editForm, year: e.target.value})} />
                    </Field>
                  </Row>
                  <Row>
                    <Field label="車体色">
                      <TextInput value={editForm.color || ""} onChange={e => setEditForm({...editForm, color: e.target.value})} />
                    </Field>
                    <Field label="原動機型式">
                      <TextInput value={editForm.engineModel || ""} onChange={e => setEditForm({...editForm, engineModel: e.target.value})} />
                    </Field>
                  </Row>
                  <Row>
                    <Field label="取得年月日">
                      <TextInput type="date" value={(editForm.purchaseDate || "").replace(/\//g, "-")} onChange={e => setEditForm({...editForm, purchaseDate: e.target.value.replace(/-/g, "/")})} />
                    </Field>
                    <Field label="取得価額">
                      <TextInput value={editForm.purchasePrice || ""} onChange={e => setEditForm({...editForm, purchasePrice: e.target.value})} />
                    </Field>
                  </Row>
                </FormSection>

                <FormSection title="法定・保険情報">
                  <Row>
                    <Field label="車検満了日">
                      <TextInput type="date" value={(editForm.inspectionDate || "").replace(/\//g, "-")} onChange={e => setEditForm({...editForm, inspectionDate: e.target.value.replace(/-/g, "/")})} />
                    </Field>
                    <Field label="自賠責保険 期限">
                      <TextInput type="date" value={(editForm.insuranceDate || "").replace(/\//g, "-")} onChange={e => setEditForm({...editForm, insuranceDate: e.target.value.replace(/-/g, "/")})} />
                    </Field>
                  </Row>
                </FormSection>

                <FormSection title="添付ファイル・画像">
                  <div className="space-y-4">
                    <Field label="ドキュメント">
                      <div className="space-y-2 mb-3">
                        {(editForm.documents || [])
                          .map((doc, originalIndex) => ({ doc, originalIndex }))
                          .filter(({ doc }) => !(editForm.vehicleFiles || []).some((file) => file.name === doc))
                          .map(({ doc, originalIndex }) => (
                          <div key={`${doc}-${originalIndex}`} className="flex gap-2">
                            <TextInput value={doc} onChange={e => {
                              const newDocs = [...(editForm.documents || [])];
                              newDocs[originalIndex] = e.target.value;
                              setEditForm({...editForm, documents: newDocs});
                            }} />
                            <Btn variant="danger" icon="delete" onClick={() => {
                              const newDocs = (editForm.documents || []).filter((_, idx) => idx !== originalIndex);
                              setEditForm({...editForm, documents: newDocs});
                            }} />
                          </div>
                        ))}
                        {(editForm.vehicleFiles || []).map((file, i) => (
                          <div key={file.id} className="flex items-center gap-2 rounded-lg border border-[#cfe6e3] bg-[#f7fbfa] px-3 py-2">
                            <span className="material-symbols-outlined text-[18px] text-[#1e8c86]">attach_file</span>
                            <span className="text-xs font-bold text-slate-700 truncate flex-1">{file.name}</span>
                            <span className="text-[10px] font-bold text-slate-400">{formatBytes(file.size)}</span>
                            <Btn variant="danger" icon="delete" onClick={() => {
                              const nextFiles = (editForm.vehicleFiles || []).filter((_, idx) => idx !== i);
                              const nextDocs = (editForm.documents || []).filter((name) => name !== file.name);
                              setEditForm({ ...editForm, vehicleFiles: nextFiles, documents: nextDocs });
                            }} />
                          </div>
                        ))}
                      </div>
                      <label className="inline-flex items-center justify-center gap-1.5 h-[31px] px-3 rounded-full bg-white hover:bg-[#fff8e7] text-[#1e8c86] border border-[#b5dad6] shadow-[0_2px_10px_rgba(43,168,162,0.08)] font-black text-xs cursor-pointer active:scale-[0.97]">
                        <span className="material-symbols-outlined text-[16px] leading-none">upload_file</span>
                        ファイルをアップロード
                        <input type="file" multiple className="hidden" onChange={handleFileUpload} />
                      </label>
                    </Field>

                    <Field label="車両画像">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
                        {(editForm.photos || []).map((photo, i) => (
                          <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-[#cfe6e3] bg-[#f7fbfa]">
                            <img
                              src={isRenderableImage(photo) ? photo : `https://placehold.co/400x400/e2e8f0/64748b?text=Image`}
                              alt="Vehicle"
                              className="w-full h-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const newPhotos = (editForm.photos || []).filter((_, idx) => idx !== i);
                                setEditForm({...editForm, photos: newPhotos});
                              }}
                              className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-white/90 text-[#d45233] border border-white shadow flex items-center justify-center cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                          </div>
                        ))}
                      </div>
                      <label className="inline-flex items-center justify-center gap-1.5 h-[31px] px-3 rounded-full bg-[#ffd23f] hover:bg-[#ffe47a] text-[#173b38] border border-[#e6b800] shadow-[0_4px_16px_rgba(255,210,63,0.28)] font-black text-xs cursor-pointer active:scale-[0.97]">
                        <span className="material-symbols-outlined text-[16px] leading-none">add_photo_alternate</span>
                        画像をアップロード
                        <input type="file" multiple accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                      </label>
                    </Field>
                  </div>
                </FormSection>

                <FormSection title="メンテナンス履歴">
                  <div className="space-y-2 mb-2">
                    {(editForm.maintenanceHistory || []).map((m, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <TextInput type="date" className="w-36" value={(m.date || "").replace(/\//g, "-")} onChange={e => {
                          const arr = [...(editForm.maintenanceHistory || [])];
                          arr[i] = {...arr[i], date: e.target.value.replace(/-/g, "/")};
                          setEditForm({...editForm, maintenanceHistory: arr});
                        }} />
                        <TextInput placeholder="メンテナンス項目" className="flex-1" value={m.item} onChange={e => {
                          const arr = [...(editForm.maintenanceHistory || [])];
                          arr[i] = {...arr[i], item: e.target.value};
                          setEditForm({...editForm, maintenanceHistory: arr});
                        }} />
                        <TextInput placeholder="走行距離" className="w-28" value={m.mileage} onChange={e => {
                          const arr = [...(editForm.maintenanceHistory || [])];
                          arr[i] = {...arr[i], mileage: e.target.value};
                          setEditForm({...editForm, maintenanceHistory: arr});
                        }} />
                        <Btn variant="danger" icon="delete" onClick={() => {
                          const arr = (editForm.maintenanceHistory || []).filter((_, idx) => idx !== i);
                          setEditForm({...editForm, maintenanceHistory: arr});
                        }} />
                      </div>
                    ))}
                  </div>
                  <Btn size="sm" icon="add" onClick={() => setEditForm({...editForm, maintenanceHistory: [...(editForm.maintenanceHistory || []), {date: "2026/01/01", item: "定期点検", mileage: "0 km"}]})}>履歴を追加</Btn>
                </FormSection>

              </div>
            )}
          </div>
        )}
      </Drawer>

      <Modal
        open={!!vehicleAction}
        onClose={() => setVehicleAction(null)}
        title={
          vehicleAction?.kind === "maintenance"
            ? "点検記録を追加"
            : vehicleAction?.kind === "repair"
              ? "修理を手配"
              : "車検日を更新"
        }
        width={500}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setVehicleAction(null)}>キャンセル</Btn>
            <Btn variant="primary" icon="check" onClick={() => handleSaveVehicleAction()}>保存</Btn>
          </>
        }
      >
        {vehicleAction && (
          <form onSubmit={handleSaveVehicleAction} className="space-y-3">
            <div className="rounded-lg border border-[#cfe6e3] bg-[#f7fbfa] px-3 py-2">
              <div className="text-[10px] font-black text-slate-400 mb-1">対象車両</div>
              <div className="font-black text-sm text-slate-800">{vehicleAction.vehicle.name}</div>
              <div className="mt-1 text-[11px] font-bold text-slate-400 font-mono">{vehicleAction.vehicle.plate}</div>
            </div>
            <Row>
              <Field label={vehicleAction.kind === "inspection" ? "新しい車検満了日" : "記録日"} required>
                <TextInput autoFocus type="date" value={actionDate} onChange={(e) => setActionDate(e.target.value)} />
              </Field>
              <Field label="走行距離">
                <TextInput value={actionMileage} onChange={(e) => setActionMileage(e.target.value)} placeholder="例：28,500 km" />
              </Field>
            </Row>
            <Field label={vehicleAction.kind === "repair" ? "修理内容" : vehicleAction.kind === "inspection" ? "更新内容" : "点検内容"} required>
              <TextInput value={actionTitle} onChange={(e) => setActionTitle(e.target.value)} />
            </Field>
            {vehicleAction.kind === "repair" && (
              <Row>
                <Field label="修理業者">
                  <TextInput value={actionShop} onChange={(e) => setActionShop(e.target.value)} placeholder="例：提携修理工場" />
                </Field>
                <Field label="見積・費用">
                  <TextInput value={actionCost} onChange={(e) => setActionCost(e.target.value)} placeholder="例：¥35,000" />
                </Field>
              </Row>
            )}
          </form>
        )}
      </Modal>

      <Modal
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="新規車両の登録"
        width={460}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setIsAddModalOpen(false)}>キャンセル</Btn>
            <Btn variant="primary" icon="check" onClick={handleSaveItem}>登録</Btn>
          </>
        }
      >
        <form onSubmit={handleSaveItem} className="space-y-3">
          <Field label="車両名" required>
            <TextInput value={newName} onChange={e => setNewName(e.target.value)} placeholder="例：軽トラック" />
          </Field>
          <Row>
            <Field label="ナンバープレート" required>
              <TextInput value={newPlate} onChange={e => setNewPlate(e.target.value)} placeholder="例：品川 580 あ 1234" />
            </Field>
            <Field label="カテゴリー" required>
              <SelectInput value={newCat} onChange={e => setNewCat(e.target.value)} options={addCategoryOptions} />
            </Field>
          </Row>
          <Row>
            <Field label="初期走行距離" required>
              <TextInput value={newMileage} onChange={e => setNewMileage(e.target.value)} />
            </Field>
            <Field label="ステータス" required>
              <SelectInput value={newStatus} onChange={e => setNewStatus(e.target.value as any)} options={["空車", "使用中", "整備中"]} />
            </Field>
          </Row>
          <Row>
            <Field label="車検満了日" required>
              <TextInput type="date" value={newInspectionDate} onChange={e => setNewInspectionDate(e.target.value)} />
            </Field>
            <Field label="自賠責保険 期限" required>
              <TextInput type="date" value={newInsuranceDate} onChange={e => setNewInsuranceDate(e.target.value)} />
            </Field>
          </Row>
          <Row>
            <Field label="メーカー">
              <TextInput value={newManufacturer} onChange={e => setNewManufacturer(e.target.value)} placeholder="例：スズキ" />
            </Field>
            <Field label="年式">
              <TextInput value={newYear} onChange={e => setNewYear(e.target.value)} placeholder="例：2025年" />
            </Field>
          </Row>
          <Row>
            <Field label="車体色">
              <TextInput value={newColor} onChange={e => setNewColor(e.target.value)} placeholder="例：ホワイト" />
            </Field>
            <Field label="車台番号 (VIN)">
              <TextInput value={newVin} onChange={e => setNewVin(e.target.value)} placeholder="例：DA16T-123456" />
            </Field>
          </Row>
          <Row>
            <Field label="原動機型式">
              <TextInput value={newEngineModel} onChange={e => setNewEngineModel(e.target.value)} placeholder="例：R06A" />
            </Field>
            <Field label="取得価額">
              <TextInput value={newPurchasePrice} onChange={e => setNewPurchasePrice(e.target.value)} placeholder="例：¥1,200,000" />
            </Field>
          </Row>
          <Field label="取得年月日">
            <TextInput type="date" value={newPurchaseDate} onChange={e => setNewPurchaseDate(e.target.value)} />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
