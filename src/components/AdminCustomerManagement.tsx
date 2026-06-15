import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useUser, UserProfile } from "../context/UserContext";
import { useOrders, Order } from "../context/OrderContext";
import {
  Mail,
  Plus,
  RefreshCw,
  MapPin,
  DollarSign,
  AlertTriangle,
  Building2,
  ChevronLeft,
  ChevronRight,
  User,
  Key,
  Trash2,
  Upload,
  Edit2,
  FileText,
  Download,
  X,
  Eye,
} from "lucide-react";
import { Modal, Field, TextInput, Row, triggerToast, Btn } from "./AdminUI";
import { formatStatusWithReturnRequest } from "../utils/returnLabels";
import { isFullyReturned, isClosedOrder } from "../utils/orderStatus";

// --- Contract file types & helpers ---
interface ContractFile {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
  dataUrl: string; // base64 data URL
}

function getContractsKey(companyCode: string) {
  return `asahi.contracts.${companyCode}`;
}
function loadContracts(companyCode: string): ContractFile[] {
  try {
    return JSON.parse(localStorage.getItem(getContractsKey(companyCode)) || "[]");
  } catch { return []; }
}
function saveContracts(companyCode: string, files: ContractFile[]) {
  localStorage.setItem(getContractsKey(companyCode), JSON.stringify(files));
}
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export default function AdminCustomerManagement() {
  const { users, setProfile, addUser, updateUser, deleteUser } = useUser();
  const { orders } = useOrders();
  const navigate = useNavigate();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<string>("companyInfo");
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Local state for rental history filtering
  const [rentalSearch, setRentalSearch] = useState("");
  const [rentalStatusFilter, setRentalStatusFilter] = useState("");
  const [rentalStartDateFilter, setRentalStartDateFilter] = useState("");
  const [rentalEndDateFilter, setRentalEndDateFilter] = useState("");

  // Reset filters when selectedCustomerId changes
  useEffect(() => {
    setRentalSearch("");
    setRentalStatusFilter("");
    setRentalStartDateFilter("");
    setRentalEndDateFilter("");
  }, [selectedCustomerId]);

  // Form states for adding customer
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyAddress, setNewCompanyAddress] = useState("");
  const [newCompanyPhone, setNewCompanyPhone] = useState("");
  const [newCompanyFax, setNewCompanyFax] = useState("");
  const [newRegistrationNumber, setNewRegistrationNumber] = useState("");
  
  const [newLastName, setNewLastName] = useState("");
  const [newFirstName, setNewFirstName] = useState("");
  const [newContactPosition, setNewContactPosition] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");

  // Edit states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editCompanyAddress, setEditCompanyAddress] = useState("");
  const [editCompanyPhone, setEditCompanyPhone] = useState("");
  const [editCompanyFax, setEditCompanyFax] = useState("");
  const [editRegistrationNumber, setEditRegistrationNumber] = useState("");
  
  const [editLastName, setEditLastName] = useState("");
  const [editFirstName, setEditFirstName] = useState("");
  const [editContactPosition, setEditContactPosition] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");

  // Add Sub-user states
  const [isAddSubUserModalOpen, setIsAddSubUserModalOpen] = useState(false);
  const [subLastName, setSubLastName] = useState("");
  const [subFirstName, setSubFirstName] = useState("");
  const [subPosition, setSubPosition] = useState("");
  const [subEmail, setSubEmail] = useState("");
  const [subPhone, setSubPhone] = useState("");

  // Edit Sub-user states
  const [isEditSubUserModalOpen, setIsEditSubUserModalOpen] = useState(false);
  const [selectedSubUser, setSelectedSubUser] = useState<UserProfile | null>(null);
  const [editSubLastName, setEditSubLastName] = useState("");
  const [editSubFirstName, setEditSubFirstName] = useState("");
  const [editSubPosition, setEditSubPosition] = useState("");
  const [editSubEmail, setEditSubEmail] = useState("");
  const [editSubPhone, setEditSubPhone] = useState("");
  const [editSubPassword, setEditSubPassword] = useState("");

  // Bulk Add Sub-users
  const [isBulkAddModalOpen, setIsBulkAddModalOpen] = useState(false);

  // Contract files
  const [contracts, setContracts] = useState<ContractFile[]>([]);
  const [previewFile, setPreviewFile] = useState<ContractFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load contracts when selectedCustomerId changes
  useEffect(() => {
    if (selectedCustomerId) {
      setContracts(loadContracts(selectedCustomerId));
    }
  }, [selectedCustomerId]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedCustomerId || !e.target.files) return;
    const filesToAdd = Array.from(e.target.files);
    let processed = 0;
    const newContracts: ContractFile[] = [];

    filesToAdd.forEach(file => {
      // 10MB limit per file
      if (file.size > 10 * 1024 * 1024) {
        triggerToast(`${file.name} は10MBを超えています`, "warn");
        processed++;
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        newContracts.push({
          id: "CF_" + Date.now() + "_" + Math.random().toString(36).slice(-4),
          name: file.name,
          size: file.size,
          type: file.type,
          uploadedAt: new Date().toISOString(),
          dataUrl: reader.result as string,
        });
        processed++;
        if (processed === filesToAdd.length) {
          const updated = [...contracts, ...newContracts];
          setContracts(updated);
          saveContracts(selectedCustomerId, updated);
          triggerToast(`${newContracts.length} 件のファイルをアップロードしました`, "ok");
        }
      };
      reader.readAsDataURL(file);
    });
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [selectedCustomerId, contracts]);

  const handleDeleteContract = useCallback((fileId: string, fileName: string) => {
    if (!selectedCustomerId) return;
    if (window.confirm(`「${fileName}」を削除してもよろしいですか？`)) {
      const updated = contracts.filter(f => f.id !== fileId);
      setContracts(updated);
      saveContracts(selectedCustomerId, updated);
      triggerToast(`${fileName} を削除しました`, "ok");
    }
  }, [selectedCustomerId, contracts]);

  const handleDownloadContract = useCallback((file: ContractFile) => {
    const a = document.createElement("a");
    a.href = file.dataUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);
  const [bulkAddText, setBulkAddText] = useState("");

  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName.trim()) {
      triggerToast("会社名を入力してください", "warn");
      return;
    }

    const newUser: UserProfile = {
      id: "USR_" + Math.floor(1000 + Math.random() * 9000),
      lastName: newLastName || "担当者",
      firstName: newFirstName || "",
      position: newContactPosition || "担当",
      companyName: newCompanyName,
      address: newCompanyAddress || "未登録",
      companyPhone: newCompanyPhone || "",
      fax: newCompanyFax || "",
      registrationNumber: newRegistrationNumber || "",
      email: newEmail || "contact@example.com",
      phone: newPhone || "03-0000-0000",
      avatarUrl: "",
      role: "customer",
      companyType: "client_company",
    };

    addUser(newUser);
    
    // reset
    setNewCompanyName("");
    setNewCompanyAddress("");
    setNewCompanyPhone("");
    setNewCompanyFax("");
    setNewRegistrationNumber("");
    setNewLastName("");
    setNewFirstName("");
    setNewContactPosition("");
    setNewEmail("");
    setNewPhone("");
    setIsAddModalOpen(false);
    triggerToast(`顧客 ${newCompanyName} を追加しました`, "ok");
  };

  // Group by companyName for customers
  const customerUsers = users.filter((u) => u.companyType === "client_company");
  const uniqueCompanies = Array.from(
    new Set(customerUsers.map((u) => u.companyName)),
  );

  const customersData = uniqueCompanies.map((companyName, idx) => {
    const compUsers = customerUsers.filter(
      (u) => u.companyName === companyName,
    );
    const mainUser =
      compUsers.find((u) => u.role === "customer") || compUsers[0];
    const code = `C-100${idx + 1}`;

    // Compute stats from orders. 第一に userId で確実に紐付け（会社名の表記揺れ・編集に強い）、
    // 無い旧データは会社名／担当者名でフォールバック照合する。
    const companyOrders = orders.filter((o) =>
      compUsers.some((u) => u.id && (o as any).userId && (o as any).userId === u.id) ||
      (o.companyName && o.companyName.trim() === companyName.trim()) ||
      compUsers.some(
        (u) =>
          `${u.lastName} ${u.firstName}` === o.personName ||
          (u.companyName && o.companyName && u.companyName.trim() === o.companyName.trim()),
      ),
    );

    // Calculate stats based on real orders list
    const ongoingRentals = companyOrders.filter(
      (o) => ["確認済み", "準備中", "配送中", "配送済み", "レンタル中", "回収予定", "回収中", "一部返却"].includes(o.status)
    ).length;

    const registeredSites = Array.from(
      new Set(companyOrders.map((o) => o.siteName || o.deliveryLocation).filter(Boolean))
    ).length;

    const annualTotal = companyOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const uncollected = companyOrders.filter(o => o.status === "延滞").length;

    return {
      code,
      name: companyName,
      phonetic:
        companyName === "大成建設 株式会社"
          ? "タイセイケンセツ"
          : companyName === "清水建設 株式会社"
            ? "シミズケンセツ"
            : companyName === "鹿島建設 株式会社"
              ? "カジマケンセツ"
              : companyName === "戸田建設 株式会社"
                ? "トダケンセツ"
                : companyName === "西松建設 株式会社"
                  ? "ニシマツケンセツ"
                  : "",
      mainContact: `${mainUser.lastName} ${mainUser.firstName}`,
      mainUser,
      allUsers: compUsers,
      ongoingRentals,
      annualTotal,
      registeredSites,
      uncollected,
      status: uncollected > 0 ? "要確認" : "取引中",
      orders: companyOrders,
    };
  });

  const filteredCustomers = customersData.filter(
    (c) =>
      c.name.includes(searchQuery) ||
      c.code.includes(searchQuery) ||
      c.mainContact.includes(searchQuery),
  );

  const openEditModal = (customer: any) => {
    setEditCompanyName(customer.name);
    setEditCompanyAddress(customer.mainUser.address || "");
    setEditCompanyPhone(customer.mainUser.companyPhone || "");
    setEditCompanyFax(customer.mainUser.fax || "");
    setEditRegistrationNumber(customer.mainUser.registrationNumber || "");
    setEditLastName(customer.mainUser.lastName || "");
    setEditFirstName(customer.mainUser.firstName || "");
    setEditContactPosition(customer.mainUser.position || "");
    setEditEmail(customer.mainUser.email || "");
    setEditPhone(customer.mainUser.phone || "");
    setIsEditModalOpen(true);
  };

  const handleUpdateCustomer = (e: React.FormEvent, customer: any) => {
    e.preventDefault();
    if (!editCompanyName.trim()) {
      triggerToast("会社名を入力してください", "warn");
      return;
    }

    // Update main user
    updateUser(customer.mainUser.id, {
      companyName: editCompanyName,
      address: editCompanyAddress,
      companyPhone: editCompanyPhone,
      fax: editCompanyFax,
      registrationNumber: editRegistrationNumber,
      lastName: editLastName,
      firstName: editFirstName,
      position: editContactPosition,
      email: editEmail,
      phone: editPhone,
    });

    // If company name or details changed, update it for all users under this company
    if (
      editCompanyName !== customer.name ||
      editCompanyAddress !== customer.mainUser.address ||
      editCompanyPhone !== customer.mainUser.companyPhone ||
      editCompanyFax !== customer.mainUser.fax ||
      editRegistrationNumber !== customer.mainUser.registrationNumber
    ) {
      customer.allUsers.forEach((u: any) => {
        if (u.id !== customer.mainUser.id) {
          updateUser(u.id, { 
            companyName: editCompanyName,
            address: editCompanyAddress,
            companyPhone: editCompanyPhone,
            fax: editCompanyFax,
            registrationNumber: editRegistrationNumber
          });
        }
      });
    }

    setIsEditModalOpen(false);
    triggerToast(`顧客 ${editCompanyName} を更新しました`, "ok");
  };

  const handleAddSubUser = (e: React.FormEvent, companyName: string) => {
    e.preventDefault();
    if (!subLastName.trim()) {
      triggerToast("姓を入力してください", "warn");
      return;
    }

    const newPassword = Math.random().toString(36).slice(-8);

    const newUser: UserProfile = {
      id: "USR_" + Math.floor(1000 + Math.random() * 9000),
      lastName: subLastName,
      firstName: subFirstName,
      position: subPosition || "担当",
      companyName: companyName,
      email: subEmail || "staff@example.com",
      phone: subPhone || "03-0000-0000",
      password: newPassword,
      address: "未登録",
      avatarUrl: "",
      role: "customer_staff",
      companyType: "client_company",
    };

    addUser(newUser);
    
    // reset
    setSubLastName("");
    setSubFirstName("");
    setSubPosition("");
    setSubEmail("");
    setSubPhone("");
    setIsAddSubUserModalOpen(false);
    triggerToast(`担当者 ${subLastName} を追加しました（パスワード: ${newPassword}）`, "ok");
    alert(`${subLastName} ${subFirstName} の自動生成パスワードは\n\n${newPassword}\n\nです。必ず控えてください。`);
  };

  const handleBulkAddSubUsers = (e: React.FormEvent, companyName: string) => {
    e.preventDefault();
    if (!bulkAddText.trim()) return;

    const lines = bulkAddText.split('\n').filter(l => l.trim() !== '');
    let addedCount = 0;

    lines.forEach(line => {
      const parts = line.split(/[\t,]+/).map(s => s.trim());
      if (parts.length >= 1 && parts[0] !== '') {
        const fullName = parts[0];
        const nameParts = fullName.split(/\s+/);
        const lastName = nameParts[0] || "担当者";
        const firstName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";
        const position = parts[1] || "担当";
        const email = parts[2] || "staff@example.com";
        const phone = parts[3] || "03-0000-0000";

        const newPassword = Math.random().toString(36).slice(-8);

        const newUser: UserProfile = {
          id: "USR_" + Math.floor(10000 + Math.random() * 90000),
          lastName,
          firstName,
          position,
          companyName,
          email,
          phone,
          password: newPassword,
          address: "未登録",
          avatarUrl: "",
          role: "customer_staff",
          companyType: "client_company",
        };

        addUser(newUser);
        addedCount++;
      }
    });

    setBulkAddText("");
    setIsBulkAddModalOpen(false);
    triggerToast(`${addedCount} 名の担当者を追加しました`, "ok");
  };

  const openEditSubUserModal = (u: UserProfile) => {
    setSelectedSubUser(u);
    setEditSubLastName(u.lastName);
    setEditSubFirstName(u.firstName);
    setEditSubPosition(u.position || "");
    setEditSubEmail(u.email);
    setEditSubPhone(u.phone);
    setEditSubPassword("");
    setIsEditSubUserModalOpen(true);
  };

  const handleUpdateSubUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubUser) return;
    const updates: Partial<UserProfile> = {
      lastName: editSubLastName,
      firstName: editSubFirstName,
      position: editSubPosition,
      email: editSubEmail,
      phone: editSubPhone,
    };
    // パスワード欄に入力があった場合のみ変更（空欄なら現状維持）
    if (editSubPassword.trim()) {
      updates.password = editSubPassword.trim();
    }
    updateUser(selectedSubUser.id, updates);
    setIsEditSubUserModalOpen(false);
    triggerToast(`担当者 ${editSubLastName} を更新しました`, "ok");
  };

  const handleDeleteSubUser = (userId: string, userName: string) => {
    if (window.confirm(`${userName} を削除してもよろしいですか？`)) {
      deleteUser(userId);
      triggerToast(`${userName} を削除しました`, "ok");
    }
  };

  const handleResetPassword = (userId: string, userName: string) => {
    if (window.confirm(`${userName} のパスワードをリセットしますか？`)) {
      const newPassword = Math.random().toString(36).slice(-8); // Generate 8 char random password
      updateUser(userId, { password: newPassword });
      triggerToast(`新しいパスワード: ${newPassword}`, "ok");
      // Displaying it as alert to make sure user sees it and copies it
      alert(`${userName} の新しいパスワードは\n\n${newPassword}\n\nです。必ず控えてください。`);
    }
  };

  if (selectedCustomerId) {
    const customer = customersData.find((c) => c.code === selectedCustomerId);
    if (!customer) return null;

    const rentalOrders = customer.orders.filter(o => o.items.some(i => i.type === 'rent'));
    const purchaseOrders = customer.orders.filter(o => o.items.some(i => i.type === 'buy'));

    // Extract unique statuses dynamically
    const rentalStatuses = Array.from(new Set(rentalOrders.map((o) => o.status).filter(Boolean)));

    // Filtered rental orders
    const filteredRentalOrders = rentalOrders.filter((o) => {
      if (rentalSearch.trim()) {
        const query = rentalSearch.toLowerCase();
        const orderNo = (o.orderNumber || o.id || "").toLowerCase();
        const site = (o.siteName || o.deliveryLocation || "").toLowerCase();
        if (!orderNo.includes(query) && !site.includes(query)) {
          return false;
        }
      }
      if (rentalStatusFilter && o.status !== rentalStatusFilter) {
        return false;
      }
      if (rentalStartDateFilter || rentalEndDateFilter) {
        if (!o.date) return false;
        const datePart = o.date.split(" • ")[0]?.replace(/\//g, "-");
        if (datePart) {
          if (rentalStartDateFilter && datePart < rentalStartDateFilter) return false;
          if (rentalEndDateFilter && datePart > rentalEndDateFilter) return false;
        } else {
          return false;
        }
      }
      return true;
    });

    const handleLoginAsCustomer = () => {
      setProfile(customer.mainUser);
      navigate("/");
    };

    return (
      <div className="space-y-6 max-w-6xl mx-auto">
        {/* Customer Header */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => setSelectedCustomerId(null)}
              className="p-2 bg-white rounded-lg shadow-sm border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              <ChevronLeft size={20} className="text-slate-600" />
            </button>
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center font-bold border border-blue-100 shadow-sm">
              <Building2 size={24} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-slate-800 tracking-tight">
                  {customer.name}
                </h1>
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${customer.status === "要確認" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${customer.status === "要確認" ? "bg-amber-500" : "bg-emerald-500"}`}
                  ></span>
                  {customer.status}
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-0.5 font-medium">
                {customer.phonetic} • {customer.code}
              </p>
            </div>

            <div className="ml-auto flex gap-3">
              <button 
                onClick={() => openEditModal(customer)}
                className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold hover:bg-slate-50 shadow-sm flex items-center gap-2 transition-all"
              >
                <Edit2 size={18} />
                編集
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-50 p-5 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 text-slate-500 font-bold text-sm mb-2">
                <RefreshCw size={16} />
                進行中レンタル
              </div>
              <p className="text-3xl font-extrabold text-slate-800 tracking-tight">
                {customer.ongoingRentals}
                <span className="text-base font-bold text-slate-500 ml-1 tracking-normal">件</span>
              </p>
            </div>

            <div className="bg-slate-50 p-5 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 text-slate-500 font-bold text-sm mb-2">
                <MapPin size={16} />
                登録現場
              </div>
              <p className="text-3xl font-extrabold text-slate-800 tracking-tight">
                {customer.registeredSites}
                <span className="text-base font-bold text-slate-500 ml-1 tracking-normal">件</span>
              </p>
            </div>

            <div className="bg-slate-50 p-5 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 text-slate-500 font-bold text-sm mb-2">
                <DollarSign size={16} />
                年間取引額
              </div>
              <p className="text-3xl font-extrabold text-slate-800 tracking-tight">
                ¥{customer.annualTotal.toLocaleString()}
              </p>
            </div>

            <div className="bg-slate-50 p-5 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 text-red-600 font-bold text-sm mb-2">
                <AlertTriangle size={16} />
                未回収
              </div>
              <p className="text-3xl font-extrabold text-slate-800 tracking-tight">
                {customer.uncollected}
                <span className="text-base font-bold text-slate-500 ml-1 tracking-normal">件</span>
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-6 border-b border-slate-300 mb-6">
            {[
              { id: "companyInfo", label: "会社情報" },
              { id: "users", label: "ユーザ" },
              { id: "sites", label: "工事一覧" },
              { id: "rentalHistory", label: "レンタル履歴" },
              { id: "purchaseHistory", label: "購入履歴" },
              { id: "inspectionHistory", label: "検品履歴" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 text-sm font-bold border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-blue-700 text-blue-700"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="pt-2">
            {activeTab === "companyInfo" && (
              <>
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-4">
                    <Building2 size={18} className="text-slate-400" />
                    会社情報
                  </h2>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <tbody>
                        <tr className="border-b border-slate-100">
                          <td className="p-4 bg-slate-50 font-bold text-slate-600 w-1/3">
                            会社名
                          </td>
                          <td className="p-4 font-bold text-slate-900">
                            {customer.name}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="p-4 bg-slate-50 font-bold text-slate-600">
                            住所
                          </td>
                          <td className="p-4 font-bold text-slate-900">
                            {customer.mainUser.address || "未登録"}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="p-4 bg-slate-50 font-bold text-slate-600">
                            電話番号
                          </td>
                          <td className="p-4 font-bold text-slate-900 font-mono">
                            {customer.mainUser.companyPhone || "未登録"}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="p-4 bg-slate-50 font-bold text-slate-600">
                            FAX
                          </td>
                          <td className="p-4 font-bold text-slate-900 font-mono">
                            {customer.mainUser.fax || "未登録"}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="p-4 bg-slate-50 font-bold text-slate-600">
                            登録番号
                          </td>
                          <td className="p-4 font-bold text-slate-900 font-mono">
                            {customer.mainUser.registrationNumber || "未登録"}
                          </td>
                        </tr>
                        <tr>
                          <td className="p-4 bg-slate-50 font-bold text-slate-600">
                            ステータス
                          </td>
                          <td className="p-4 font-bold text-slate-900">
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1.5 ${customer.status === "要確認" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${customer.status === "要確認" ? "bg-amber-500" : "bg-emerald-500"}`}
                              ></span>
                              {customer.status}
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-4">
                    <User size={18} className="text-slate-400" />
                    連絡先
                  </h2>
                  <div className="border border-slate-200 rounded-lg overflow-hidden h-fit">
                    <table className="w-full text-sm">
                      <tbody>
                        <tr className="border-b border-slate-100">
                          <td className="p-4 bg-slate-50 font-bold text-slate-600 w-1/3">
                            担当者
                          </td>
                          <td className="p-4 font-bold text-slate-900">
                            {customer.mainContact}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="p-4 bg-slate-50 font-bold text-slate-600">
                            役職
                          </td>
                          <td className="p-4 font-bold text-slate-900">
                            {customer.mainUser.position || "担当"}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="p-4 bg-slate-50 font-bold text-slate-600">
                            電話番号
                          </td>
                          <td className="p-4 font-bold text-slate-900 font-mono">
                            {customer.mainUser.phone}
                          </td>
                        </tr>
                        <tr>
                          <td className="p-4 bg-slate-50 font-bold text-slate-600">
                            メール
                          </td>
                          <td className="p-4 font-bold text-slate-900 font-mono">
                            {customer.mainUser.email}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Contract Files Section */}
                <div className="col-span-2 mt-2">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                      <FileText size={18} className="text-slate-400" />
                      契約書ファイル
                      {contracts.length > 0 && (
                        <span className="ml-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
                          {contracts.length}
                        </span>
                      )}
                    </h2>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm"
                    >
                      <Upload size={16} />
                      ファイルを追加
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.txt,.csv"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </div>

                  {contracts.length === 0 ? (
                    <div className="border-2 border-dashed border-slate-200 rounded-xl p-10 text-center">
                      <FileText size={40} className="text-slate-300 mx-auto mb-3" />
                      <p className="text-sm font-bold text-slate-400 mb-1">
                        契約書ファイルがありません
                      </p>
                      <p className="text-xs text-slate-400">
                        PDF・Excel・Word・画像ファイルをアップロードできます（10MBまで）
                      </p>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="mt-4 px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-200 transition-colors inline-flex items-center gap-2"
                      >
                        <Upload size={16} />
                        ファイルを選択
                      </button>
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm text-left">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                            <th className="p-4 font-bold">ファイル名</th>
                            <th className="p-4 font-bold w-28">サイズ</th>
                            <th className="p-4 font-bold w-44">アップロード日</th>
                            <th className="p-4 font-bold text-center w-36">アクション</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {contracts.map((file) => {
                            const isPdf = file.type === "application/pdf";
                            const isImage = file.type.startsWith("image/");
                            const uploadDate = new Date(file.uploadedAt);
                            const dateStr = `${uploadDate.getFullYear()}/${String(uploadDate.getMonth() + 1).padStart(2, "0")}/${String(uploadDate.getDate()).padStart(2, "0")} ${String(uploadDate.getHours()).padStart(2, "0")}:${String(uploadDate.getMinutes()).padStart(2, "0")}`;

                            return (
                              <tr key={file.id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4">
                                  <div className="flex items-center gap-3">
                                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                      isPdf ? "bg-red-50 text-red-500" :
                                      isImage ? "bg-green-50 text-green-500" :
                                      file.name.match(/\.(xlsx?|csv)$/i) ? "bg-emerald-50 text-emerald-500" :
                                      file.name.match(/\.(docx?)$/i) ? "bg-blue-50 text-blue-500" :
                                      "bg-slate-100 text-slate-400"
                                    }`}>
                                      <FileText size={18} />
                                    </div>
                                    <span className="font-bold text-slate-800 truncate max-w-xs">
                                      {file.name}
                                    </span>
                                  </div>
                                </td>
                                <td className="p-4 text-slate-500 font-mono text-xs">
                                  {formatFileSize(file.size)}
                                </td>
                                <td className="p-4 text-slate-500 font-mono text-xs">
                                  {dateStr}
                                </td>
                                <td className="p-4">
                                  <div className="flex justify-center gap-1.5">
                                    {(isPdf || isImage) && (
                                      <button
                                        onClick={() => setPreviewFile(file)}
                                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                        title="プレビュー"
                                      >
                                        <Eye size={16} />
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleDownloadContract(file)}
                                      className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                                      title="ダウンロード"
                                    >
                                      <Download size={16} />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteContract(file.id, file.name)}
                                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                      title="削除"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* File Preview Modal */}
              {previewFile && (
                <div
                  className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-6"
                  onClick={() => setPreviewFile(null)}
                >
                  <div
                    className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
                      <div className="flex items-center gap-3">
                        <FileText size={20} className="text-blue-500" />
                        <span className="font-bold text-slate-800 truncate">{previewFile.name}</span>
                        <span className="text-xs text-slate-400 font-mono">{formatFileSize(previewFile.size)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDownloadContract(previewFile)}
                          className="p-2 text-slate-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="ダウンロード"
                        >
                          <Download size={18} />
                        </button>
                        <button
                          onClick={() => setPreviewFile(null)}
                          className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-100 min-h-[400px]">
                      {previewFile.type.startsWith("image/") ? (
                        <img
                          src={previewFile.dataUrl}
                          alt={previewFile.name}
                          className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-md"
                        />
                      ) : previewFile.type === "application/pdf" ? (
                        <iframe
                          src={previewFile.dataUrl}
                          className="w-full h-[70vh] rounded-lg border border-slate-200"
                          title={previewFile.name}
                        />
                      ) : (
                        <div className="text-center text-slate-400">
                          <FileText size={48} className="mx-auto mb-3" />
                          <p className="font-bold">プレビューに対応していないファイル形式です</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              </>
            )}

            {activeTab === "users" && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <User size={18} className="text-slate-400" />
                    ユーザ
                  </h2>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setIsBulkAddModalOpen(true)}
                      className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors flex items-center gap-1.5"
                    >
                      <Upload size={16} />
                      一括追加
                    </button>
                    <button 
                      onClick={() => setIsAddSubUserModalOpen(true)}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors flex items-center gap-1.5"
                    >
                      <Plus size={16} />
                      アカウント追加
                    </button>
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                        <th className="p-4 font-bold">氏名</th>
                        <th className="p-4 font-bold">役職</th>
                        <th className="p-4 font-bold">メール</th>
                        <th className="p-4 font-bold">電話</th>
                        <th className="p-4 font-bold text-center">アクション</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {customer.allUsers.map((u, i) => (
                        <tr
                          key={i}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="p-4 font-bold text-slate-900">
                            {u.lastName} {u.firstName}
                          </td>
                          <td className="p-4 text-slate-600">
                            {u.position || (u.role === "customer" ? "現場監督" : "担当")}
                          </td>
                          <td className="p-4 text-slate-600 font-mono text-sm">
                            {u.email}
                          </td>
                          <td className="p-4 text-slate-600 font-mono">
                            {u.phone}
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex justify-center gap-2">
                              <button 
                                onClick={() => handleResetPassword(u.id, `${u.lastName} ${u.firstName}`)}
                                className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors" 
                                title="パスワードリセット"
                              >
                                <Key size={16} />
                              </button>
                              <button 
                                onClick={() => openEditSubUserModal(u)}
                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" 
                                title="編集"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button 
                                onClick={() => handleDeleteSubUser(u.id, `${u.lastName} ${u.firstName}`)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" 
                                title="削除"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === "rentalHistory" && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <RefreshCw size={18} className="text-slate-400" />
                    レンタル履歴
                  </h2>
                  {rentalOrders.length > 0 && (
                    <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                      検索結果: {filteredRentalOrders.length}件 / 全体: {rentalOrders.length}件
                    </span>
                  )}
                </div>

                {/* Filter bar */}
                {rentalOrders.length > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500 block mb-1">契約番号・現場名</label>
                      <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                          search
                        </span>
                        <input
                          type="text"
                          placeholder="契約番号や現場名で検索..."
                          value={rentalSearch}
                          onChange={(e) => setRentalSearch(e.target.value)}
                          className="pl-9 pr-4 py-2 w-full bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-medium"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 block mb-1">契約状態</label>
                      <select
                        value={rentalStatusFilter}
                        onChange={(e) => setRentalStatusFilter(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 py-2.5 outline-none focus:border-blue-500 font-semibold text-xs cursor-pointer"
                      >
                        <option value="">すべて</option>
                        {rentalStatuses.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 block mb-1">注文日（開始）</label>
                      <input
                        type="date"
                        value={rentalStartDateFilter}
                        onChange={(e) => setRentalStartDateFilter(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 py-2 outline-none focus:border-blue-500 font-mono text-xs cursor-pointer h-[38px]"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 block mb-1">注文日（終了）</label>
                      <input
                        type="date"
                        value={rentalEndDateFilter}
                        onChange={(e) => setRentalEndDateFilter(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 py-2 outline-none focus:border-blue-500 font-mono text-xs cursor-pointer h-[38px]"
                      />
                    </div>
                  </div>
                )}

                <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                  {rentalOrders.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 font-bold">
                      レンタル履歴がありません
                    </div>
                  ) : filteredRentalOrders.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 font-bold">
                      検索条件に一致するレンタル履歴がありません
                    </div>
                  ) : (
                    <table className="w-full text-sm text-left">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                          <th className="p-4 font-bold">契約番号 / 注文日時</th>
                          <th className="p-4 font-bold">現場</th>
                          <th className="p-4 font-bold text-right">金額</th>
                          <th className="p-4 font-bold text-right">状態</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredRentalOrders.map((o) => (
                          <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-4">
                              <div className="font-bold text-blue-700 font-mono">
                                {o.orderNumber || o.id.slice(0, 8).toUpperCase()}
                              </div>
                              <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                                {o.date || "—"}
                              </div>
                            </td>
                            <td className="p-4 font-bold text-slate-800">
                              {o.siteName || "未登録"}
                            </td>
                            <td className="p-4 text-right font-bold text-slate-900 font-mono">
                              ¥{(o.total || 0).toLocaleString()}
                            </td>
                            <td className="p-4 text-right">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1 ${
                                o.status === "完了" || isFullyReturned(o.status) ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${
                                  o.status === "完了" || isFullyReturned(o.status) ? "bg-emerald-500" : "bg-blue-500"
                                }`}></span>{" "}
                                {formatStatusWithReturnRequest(o.status, o.returnRequestType)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {activeTab === "purchaseHistory" && (
              <div>
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-4">
                  <DollarSign size={18} className="text-slate-400" />
                  購入履歴
                </h2>
                <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                  {purchaseOrders.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 font-bold">
                      購入履歴がありません
                    </div>
                  ) : (
                    <table className="w-full text-sm text-left">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                          <th className="p-4 font-bold">伝票</th>
                          <th className="p-4 font-bold">日付</th>
                          <th className="p-4 font-bold text-right">金額</th>
                          <th className="p-4 font-bold text-right">状態</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {purchaseOrders.map((o) => (
                          <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-4 font-bold text-blue-700 font-mono">
                              {o.orderNumber || o.id.slice(0, 8).toUpperCase()}
                            </td>
                            <td className="p-4 text-slate-600 font-mono">
                              {o.date.split("•")[0]?.trim()}
                            </td>
                            <td className="p-4 text-right font-bold text-slate-900 font-mono">
                              ¥{(o.total || 0).toLocaleString()}
                            </td>
                            <td className="p-4 text-right">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1 ${
                                o.status === "完了" ? "bg-emerald-50 text-emerald-700" : "bg-indigo-50 text-indigo-700"
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${
                                  o.status === "完了" ? "bg-emerald-500" : "bg-indigo-500"
                                }`}></span>{" "}
                                {formatStatusWithReturnRequest(o.status, o.returnRequestType)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {activeTab === "inspectionHistory" && (
              <div>
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-4">
                  <FileText size={18} className="text-slate-400" />
                  検品履歴
                </h2>
                {(() => {
                  // Get orders for this company that have been returned and have inspection data
                  const inspectionOrders = customer.orders.filter(
                    (o: Order) => isFullyReturned(o.status) || (o.itemIssues && o.itemIssues.length > 0)
                  );
                  if (inspectionOrders.length === 0) {
                    return (
                      <div className="border-2 border-dashed border-slate-200 rounded-xl p-10 text-center">
                        <FileText size={40} className="text-slate-300 mx-auto mb-3" />
                        <p className="text-sm font-bold text-slate-400 mb-1">
                          検品履歴がありません
                        </p>
                        <p className="text-xs text-slate-400">
                          回収・返却時の検品レポートがここに表示されます
                        </p>
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-4">
                      {inspectionOrders.map((o: Order) => {
                        const hasIssues = o.itemIssues && o.itemIssues.length > 0;
                        const missingCount = o.itemIssues?.filter(i => i.type === "missing").reduce((s, i) => s + i.quantity, 0) || 0;
                        const brokenCount = o.itemIssues?.filter(i => i.type === "broken").reduce((s, i) => s + i.quantity, 0) || 0;
                        const rentItems = o.items?.filter(i => i.type === "rent") || [];
                        const totalQty = rentItems.reduce((s, i) => s + i.quantity, 0);
                        const okCount = totalQty - missingCount - brokenCount;

                        return (
                          <div key={o.id} className={`border rounded-xl overflow-hidden transition-colors ${
                            hasIssues ? "border-amber-200 bg-amber-50/20" : "border-slate-200 bg-white"
                          }`}>
                            {/* Header */}
                            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                              <div className="flex items-center gap-3">
                                <span className="font-mono font-bold text-blue-700 text-sm">
                                  {o.orderNumber || o.id.slice(0, 8).toUpperCase()}
                                </span>
                                <span className="text-xs text-slate-400 font-mono">{o.date}</span>
                                {o.siteName && (
                                  <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                                    <MapPin size={12} />
                                    {o.siteName}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {hasIssues ? (
                                  <span className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold inline-flex items-center gap-1.5">
                                    <AlertTriangle size={12} />
                                    異常あり
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold inline-flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                    正常
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Items Summary */}
                            <div className="px-5 py-3">
                              <div className="flex gap-6 text-sm mb-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-500 font-medium">総数量:</span>
                                  <span className="font-bold text-slate-800">{totalQty}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                  <span className="text-slate-500 font-medium">正常:</span>
                                  <span className="font-bold text-emerald-700">{okCount}</span>
                                </div>
                                {brokenCount > 0 && (
                                  <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                    <span className="text-slate-500 font-medium">破損:</span>
                                    <span className="font-bold text-amber-700">{brokenCount}</span>
                                  </div>
                                )}
                                {missingCount > 0 && (
                                  <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                    <span className="text-slate-500 font-medium">紛失:</span>
                                    <span className="font-bold text-red-700">{missingCount}</span>
                                  </div>
                                )}
                              </div>

                              {/* Items Table */}
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-slate-100 text-slate-500">
                                    <th className="pb-2 text-left font-bold">品目</th>
                                    <th className="pb-2 text-center font-bold w-16">数量</th>
                                    <th className="pb-2 text-center font-bold w-16">正常</th>
                                    <th className="pb-2 text-center font-bold w-16">破損</th>
                                    <th className="pb-2 text-center font-bold w-16">紛失</th>
                                    <th className="pb-2 text-left font-bold">備考</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                  {rentItems.map(item => {
                                    const itemIssues = o.itemIssues?.filter(iss => iss.itemId === item.id) || [];
                                    const itemMissing = itemIssues.find(i => i.type === "missing")?.quantity || 0;
                                    const itemBroken = itemIssues.find(i => i.type === "broken")?.quantity || 0;
                                    const itemOk = item.quantity - itemMissing - itemBroken;
                                    const itemNote = itemIssues[0]?.notes || "";
                                    const itemHasIssue = itemMissing > 0 || itemBroken > 0;

                                    return (
                                      <tr key={item.id} className={itemHasIssue ? "bg-amber-50/30" : ""}>
                                        <td className="py-2.5 pr-2 font-bold text-slate-800">
                                          {item.name}
                                        </td>
                                        <td className="py-2.5 text-center font-mono font-bold text-slate-600">
                                          {item.quantity}
                                        </td>
                                        <td className="py-2.5 text-center font-mono font-bold text-emerald-600">
                                          {itemOk}
                                        </td>
                                        <td className={`py-2.5 text-center font-mono font-bold ${itemBroken > 0 ? "text-amber-600" : "text-slate-300"}`}>
                                          {itemBroken}
                                        </td>
                                        <td className={`py-2.5 text-center font-mono font-bold ${itemMissing > 0 ? "text-red-600" : "text-slate-300"}`}>
                                          {itemMissing}
                                        </td>
                                        <td className="py-2.5 text-slate-500 truncate max-w-[200px]">
                                          {itemNote || "—"}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {activeTab === "sites" && (
              <div>
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-4">
                  <MapPin size={18} className="text-slate-400" />
                  工事一覧 (現場一覧)
                </h2>
                <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                  {(() => {
                    const sitesMap = new Map<string, {
                      siteName: string;
                      constructionNumber: string;
                      deliveryLocation: string;
                      rentalStartDate?: string;
                      rentalEndDate?: string;
                      ordersCount: number;
                      status: string;
                    }>();

                    customer.orders.forEach(o => {
                      const siteKey = o.siteName || o.constructionNumber || o.deliveryLocation || "未登録";
                      const existing = sitesMap.get(siteKey);
                      const isOrderActive = !isClosedOrder(o.status);

                      if (existing) {
                        existing.ordersCount += 1;
                        if (o.rentalStartDate) {
                          if (!existing.rentalStartDate || o.rentalStartDate < existing.rentalStartDate) {
                            existing.rentalStartDate = o.rentalStartDate;
                          }
                        }
                        if (o.rentalEndDate) {
                          if (!existing.rentalEndDate || o.rentalEndDate > existing.rentalEndDate) {
                            existing.rentalEndDate = o.rentalEndDate;
                          }
                        }
                        if (isOrderActive) {
                          existing.status = "稼働中";
                        }
                      } else {
                        sitesMap.set(siteKey, {
                          siteName: o.siteName || o.deliveryLocation || "未登録",
                          constructionNumber: o.constructionNumber || "—",
                          deliveryLocation: o.deliveryLocation || "—",
                          rentalStartDate: o.rentalStartDate,
                          rentalEndDate: o.rentalEndDate,
                          ordersCount: 1,
                          status: isOrderActive ? "稼働中" : "完了"
                        });
                      }
                    });

                    const customerSites = Array.from(sitesMap.values());

                    if (customerSites.length === 0) {
                      return (
                        <div className="p-12 text-center text-slate-400 font-medium bg-slate-50/50 rounded-b-2xl">
                          登録された工事・現場がありません。
                        </div>
                      );
                    }

                    return (
                      <table className="w-full text-sm text-left">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                            <th className="p-4">現場名</th>
                            <th className="p-4">工事番号</th>
                            <th className="p-4">納品場所 / 住所</th>
                            <th className="p-4">レンタル期間</th>
                            <th className="p-4 text-center">関連注文数</th>
                            <th className="p-4 text-right">状態</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {customerSites.map((site, i) => (
                            <tr key={i} className="hover:bg-slate-50 transition-colors">
                              <td className="p-4 font-bold text-slate-900">
                                {site.siteName}
                              </td>
                              <td className="p-4 font-mono font-bold text-slate-700">
                                {site.constructionNumber}
                              </td>
                              <td className="p-4 text-slate-600">
                                {site.deliveryLocation}
                              </td>
                              <td className="p-4 font-mono text-slate-600">
                                {site.rentalStartDate && site.rentalEndDate 
                                  ? `${site.rentalStartDate.replace(/-/g, "/")} 〜 ${site.rentalEndDate.replace(/-/g, "/")}`
                                  : site.rentalStartDate 
                                    ? `${site.rentalStartDate.replace(/-/g, "/")} 〜`
                                    : site.rentalEndDate 
                                      ? `〜 ${site.rentalEndDate.replace(/-/g, "/")}`
                                      : "—"
                                }
                              </td>
                              <td className="p-4 text-center font-mono font-bold text-slate-700">
                                {site.ordersCount}
                              </td>
                              <td className="p-4 text-right">
                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1.5 ${
                                  site.status === "稼働中" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"
                                }`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${
                                    site.status === "稼働中" ? "bg-blue-500" : "bg-emerald-500"
                                  }`}></span>{" "}
                                  {site.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Edit Customer Modal */}
        {selectedCustomerId && customersData.find(c => c.code === selectedCustomerId) && (
          <Modal
            open={isEditModalOpen}
            onClose={() => setIsEditModalOpen(false)}
            title="顧客情報を編集"
            width={460}
            footer={
              <>
                <Btn variant="secondary" onClick={() => setIsEditModalOpen(false)}>キャンセル</Btn>
                <Btn variant="primary" icon="check" onClick={(e: any) => handleUpdateCustomer(e, customersData.find(c => c.code === selectedCustomerId))}>更新</Btn>
              </>
            }
          >
            <form onSubmit={(e) => handleUpdateCustomer(e, customersData.find(c => c.code === selectedCustomerId))} className="space-y-4 max-h-[70vh] overflow-y-auto px-1">
              <div className="text-sm font-bold text-blue-800 bg-blue-50 p-2 rounded">会社情報</div>
              <Field label="会社名" required>
                <TextInput value={editCompanyName} onChange={e => setEditCompanyName(e.target.value)} />
              </Field>
              <Field label="住所">
                <TextInput value={editCompanyAddress} onChange={e => setEditCompanyAddress(e.target.value)} />
              </Field>
              <Row>
                <Field label="代表電話番号">
                  <TextInput value={editCompanyPhone} onChange={e => setEditCompanyPhone(e.target.value)} />
                </Field>
                <Field label="FAX">
                  <TextInput value={editCompanyFax} onChange={e => setEditCompanyFax(e.target.value)} />
                </Field>
              </Row>
              <Field label="登録番号">
                <TextInput value={editRegistrationNumber} onChange={e => setEditRegistrationNumber(e.target.value)} />
              </Field>

              <div className="text-sm font-bold text-blue-800 bg-blue-50 p-2 rounded mt-4">連絡先情報</div>
              <Row>
                <Field label="担当者 姓">
                  <TextInput value={editLastName} onChange={e => setEditLastName(e.target.value)} />
                </Field>
                <Field label="担当者 名">
                  <TextInput value={editFirstName} onChange={e => setEditFirstName(e.target.value)} />
                </Field>
              </Row>
              <Field label="役職">
                <TextInput value={editContactPosition} onChange={e => setEditContactPosition(e.target.value)} />
              </Field>
              <Field label="メールアドレス">
                <TextInput type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} />
              </Field>
              <Field label="電話番号 (直通)">
                <TextInput value={editPhone} onChange={e => setEditPhone(e.target.value)} />
              </Field>
            </form>
          </Modal>
        )}

        {/* Bulk Add Sub Users Modal */}
        <Modal
          open={isBulkAddModalOpen}
          onClose={() => setIsBulkAddModalOpen(false)}
          title="担当者を一括追加"
          width={560}
          footer={
            <>
              <Btn variant="secondary" onClick={() => setIsBulkAddModalOpen(false)}>キャンセル</Btn>
              <Btn variant="primary" icon="check" onClick={(e) => handleBulkAddSubUsers(e, customer.name)}>インポート</Btn>
            </>
          }
        >
          <div className="space-y-4">
            <div className="bg-blue-50 text-blue-800 text-sm p-3 rounded-lg flex items-start gap-2">
              <span className="material-symbols-outlined text-[20px]">info</span>
              <div>
                <p className="font-bold mb-1">ExcelやCSVから貼り付けてください</p>
                <p className="text-xs opacity-90">1行に1名分の情報を入力してください。項目は「タブ」または「カンマ」区切りに対応しています。<br/>順番: <b>氏名, 役職, メールアドレス, 電話番号</b></p>
                <p className="text-xs opacity-90 mt-1 font-mono bg-white bg-opacity-50 p-1 rounded inline-block">例: 山田 太郎, 現場監督, yamada@example.com, 090-1234-5678</p>
              </div>
            </div>
            <textarea
              className="w-full h-48 p-3 border border-slate-300 rounded-lg text-sm font-mono leading-relaxed focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
              placeholder="ここにデータを貼り付け..."
              value={bulkAddText}
              onChange={(e) => setBulkAddText(e.target.value)}
            />
          </div>
        </Modal>

      {/* Add Sub User Modal */}
        {selectedCustomerId && customersData.find(c => c.code === selectedCustomerId) && (
          <Modal
            open={isAddSubUserModalOpen}
            onClose={() => setIsAddSubUserModalOpen(false)}
            title="担当者（アカウント）を追加"
            width={460}
            footer={
              <>
                <Btn variant="secondary" onClick={() => setIsAddSubUserModalOpen(false)}>キャンセル</Btn>
                <Btn variant="primary" icon="check" onClick={(e: any) => handleAddSubUser(e, customersData.find(c => c.code === selectedCustomerId)!.name)}>追加</Btn>
              </>
            }
          >
            <form onSubmit={(e) => handleAddSubUser(e, customersData.find(c => c.code === selectedCustomerId)!.name)} className="space-y-4">
              <div className="text-sm font-bold text-slate-700 mb-2">
                会社名: {customersData.find(c => c.code === selectedCustomerId)?.name}
              </div>
              <Row>
                <Field label="担当者 姓" required>
                  <TextInput value={subLastName} onChange={e => setSubLastName(e.target.value)} placeholder="例：鈴木" />
                </Field>
                <Field label="担当者 名">
                  <TextInput value={subFirstName} onChange={e => setSubFirstName(e.target.value)} placeholder="例：一郎" />
                </Field>
              </Row>
              <Field label="役職">
                <TextInput value={subPosition} onChange={e => setSubPosition(e.target.value)} placeholder="例：現場監督" />
              </Field>
              <Field label="ログインメールアドレス">
                <TextInput type="email" value={subEmail} onChange={e => setSubEmail(e.target.value)} placeholder="staff@example.com" />
              </Field>
              <Field label="電話番号">
                <TextInput value={subPhone} onChange={e => setSubPhone(e.target.value)} placeholder="03-0000-0000" />
              </Field>
            </form>
          </Modal>
        )}

        {/* Edit Sub User Modal */}
        {selectedSubUser && (
          <Modal
            open={isEditSubUserModalOpen}
            onClose={() => setIsEditSubUserModalOpen(false)}
            title="担当者（アカウント）を編集"
            width={460}
            footer={
              <>
                <Btn variant="secondary" onClick={() => setIsEditSubUserModalOpen(false)}>キャンセル</Btn>
                <Btn variant="primary" icon="check" onClick={handleUpdateSubUser}>更新</Btn>
              </>
            }
          >
            <form onSubmit={handleUpdateSubUser} className="space-y-4">
              <Row>
                <Field label="担当者 姓" required>
                  <TextInput value={editSubLastName} onChange={e => setEditSubLastName(e.target.value)} />
                </Field>
                <Field label="担当者 名">
                  <TextInput value={editSubFirstName} onChange={e => setEditSubFirstName(e.target.value)} />
                </Field>
              </Row>
              <Field label="役職">
                <TextInput value={editSubPosition} onChange={e => setEditSubPosition(e.target.value)} placeholder="例：現場監督" />
              </Field>
              <Field label="ログインメールアドレス">
                <TextInput type="email" value={editSubEmail} onChange={e => setEditSubEmail(e.target.value)} />
              </Field>
              <Field label="電話番号">
                <TextInput value={editSubPhone} onChange={e => setEditSubPhone(e.target.value)} />
              </Field>
              <Field label="パスワード（お客様サイトのログイン用）">
                <TextInput
                  value={editSubPassword}
                  onChange={e => setEditSubPassword(e.target.value)}
                  placeholder={selectedSubUser?.password ? `現在: ${selectedSubUser.password} — 変更する場合のみ入力` : "未設定 — 設定する場合は入力"}
                />
              </Field>
            </form>
          </Modal>
        )}

      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex gap-4 items-center">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <span className="material-symbols-outlined text-slate-400 text-[18px]">
              search
            </span>
          </div>
          <input
            type="text"
            className="w-64 pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm font-medium"
            placeholder="検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg shadow-sm text-sm font-bold flex items-center gap-2 hover:bg-slate-50 transition-colors">
          <span className="material-symbols-outlined text-[18px]">tune</span>
          絞り込み
        </button>
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="ml-auto px-4 py-2 bg-blue-600 text-white rounded-lg shadow-sm text-sm font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors"
        >
          <Plus size={18} />
          顧客を追加
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center gap-3">
          <User size={18} className="text-slate-500" />
          <h2 className="font-bold text-slate-800">顧客一覧</h2>
          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.py-0.5 rounded-full">
            {filteredCustomers.length}社
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-100 bg-slate-50 text-slate-500">
                <th className="p-4 text-xs font-bold">顧客コード</th>
                <th className="p-4 text-xs font-bold">会社名</th>
                <th className="p-4 text-xs font-bold">担当者</th>
                <th className="p-4 text-xs font-bold text-center">進行中</th>
                <th className="p-4 text-xs font-bold text-right">年間取引額</th>
                <th className="p-4 text-xs font-bold">状態</th>
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCustomers.map((c) => (
                <tr
                  key={c.code}
                  className="hover:bg-blue-50/50 cursor-pointer transition-colors group"
                  onClick={() => setSelectedCustomerId(c.code)}
                >
                  <td className="p-4 font-mono font-bold text-blue-700">
                    {c.code}
                  </td>
                  <td className="p-4">
                    <p className="font-bold text-slate-900">{c.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {c.phonetic}
                    </p>
                  </td>
                  <td className="p-4 text-slate-700 font-medium">
                    {c.mainContact}
                  </td>
                  <td className="p-4 text-center font-mono font-bold text-slate-700">
                    {c.ongoingRentals}
                  </td>
                  <td className="p-4 text-right font-mono font-extrabold text-slate-800">
                    ¥{c.annualTotal.toLocaleString()}
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1.5 ${c.status === "要確認" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${c.status === "要確認" ? "bg-amber-500" : "bg-emerald-500"}`}
                      ></span>
                      {c.status}
                    </span>
                  </td>
                  <td className="p-4 pr-6 text-right">
                    <ChevronRight
                      size={18}
                      className="text-slate-300 group-hover:text-blue-500 transition-colors ml-auto"
                    />
                  </td>
                </tr>
              ))}
              {filteredCustomers.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="p-8 text-center text-slate-500 font-medium"
                  >
                    データが見つかりません。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Customer Modal */}
      <Modal
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="新規顧客を追加"
        width={460}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setIsAddModalOpen(false)}>キャンセル</Btn>
            <Btn variant="primary" icon="check" onClick={handleSaveCustomer}>保存</Btn>
          </>
        }
      >
        <form onSubmit={handleSaveCustomer} className="space-y-4 max-h-[70vh] overflow-y-auto px-1">
          <div className="text-sm font-bold text-blue-800 bg-blue-50 p-2 rounded">会社情報</div>
          <Field label="会社名" required>
            <TextInput value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)} placeholder="例：株式会社アサヒ建設" />
          </Field>
          <Field label="住所">
            <TextInput value={newCompanyAddress} onChange={e => setNewCompanyAddress(e.target.value)} placeholder="例：東京都渋谷区神南1-2-3" />
          </Field>
          <Row>
            <Field label="代表電話番号">
              <TextInput value={newCompanyPhone} onChange={e => setNewCompanyPhone(e.target.value)} placeholder="例：03-1234-5678" />
            </Field>
            <Field label="FAX">
              <TextInput value={newCompanyFax} onChange={e => setNewCompanyFax(e.target.value)} placeholder="例：03-1234-5679" />
            </Field>
          </Row>
          <Field label="登録番号">
            <TextInput value={newRegistrationNumber} onChange={e => setNewRegistrationNumber(e.target.value)} placeholder="例：T1234567890123" />
          </Field>

          <div className="text-sm font-bold text-blue-800 bg-blue-50 p-2 rounded mt-4">連絡先情報</div>
          <Row>
            <Field label="担当者 姓">
              <TextInput value={newLastName} onChange={e => setNewLastName(e.target.value)} placeholder="例：山田" />
            </Field>
            <Field label="担当者 名">
              <TextInput value={newFirstName} onChange={e => setNewFirstName(e.target.value)} placeholder="例：太郎" />
            </Field>
          </Row>
          <Field label="役職">
            <TextInput value={newContactPosition} onChange={e => setNewContactPosition(e.target.value)} placeholder="例：現場監督" />
          </Field>
          <Field label="メールアドレス">
            <TextInput type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="contact@example.com" />
          </Field>
          <Field label="電話番号 (直通)">
            <TextInput value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="例：090-1234-5678" />
          </Field>
        </form>
      </Modal>

    </div>
  );
}
