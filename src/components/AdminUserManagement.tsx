import React, { useState } from "react";
import { useUser, UserProfile } from "../context/UserContext";
import { confirmDialog, alertDialog } from "./AppDialog";

export default function AdminUserManagement() {
  const { users, addUser, updateUser, isEmailTaken, deleteUser } = useUser();
  const [activeSubTab, setActiveSubTab] = useState<
    "our_company" | "client_company"
  >("our_company");
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const displayUsers = users.filter((u) =>
    activeSubTab === "our_company"
      ? u.companyType === "our_company"
      : u.companyType === "client_company" || !u.companyType,
  );

  // 実在する取引先企業の一覧（ユーザーマスタから抽出）。会社選択用。
  const clientCompanies = Array.from(
    new Set(
      users
        .filter((u) => u.companyType === "client_company" || !u.companyType)
        .map((u) => (u.companyName || "").trim())
        .filter(Boolean),
    ),
  );

  const handleEdit = (u: UserProfile) => {
    setEditingUser(u);
    setIsModalOpen(true);
  };

  const handleAdd = () => {
    setEditingUser({
      id: "",
      lastName: "",
      firstName: "",
      companyName: activeSubTab === "our_company" ? "ASAHI LEASE" : "",
      email: "",
      phone: "",
      address: "",
      avatarUrl: "",
      role: activeSubTab === "our_company" ? "staff" : "customer_staff",
      companyType: activeSubTab,
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (await confirmDialog("このアカウントを削除してもよろしいですか？", { danger: true, okText: "削除" })) {
      deleteUser(id);
    }
  };

  const saveUser = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const roleVal = formData.get("role") as
      | "admin"
      | "staff"
      | "customer"
      | "customer_staff";

    const userData: any = {
      lastName: formData.get("lastName"),
      firstName: formData.get("firstName"),
      companyName: formData.get("companyName"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      address: formData.get("address"),
      avatarUrl: formData.get("avatarUrl") || "",
      // 取引先(client)の編集フォームには position/team/employeeCode/status の入力が無い。
      // FormData.get は欄が無いと null を返すため、?? で既存値を温存する（編集で勝手に
      // status が active へ戻る／部署・社員番号が空になる不具合を防ぐ）。
      position: (formData.get("position") as string | null) ?? editingUser?.position ?? "",
      team: (formData.get("team") as string | null) ?? editingUser?.team ?? "",
      employeeCode: (formData.get("employeeCode") as string | null) ?? editingUser?.employeeCode ?? "",
      status: (formData.get("status") as string | null) ?? editingUser?.status ?? "active",
      role: roleVal,
      companyType: activeSubTab,
    };

    // メール重複はログインID衝突（双方ログイン不可）になるため拒否。
    const emailVal = (userData.email as string | null) || "";
    if (emailVal.trim() && isEmailTaken(emailVal, editingUser?.id)) {
      void alertDialog("このメールアドレスは既に他のアカウントで使用されています。");
      return;
    }

    // パスワード: 入力があれば設定/変更。新規作成で空欄なら自動生成して通知する。
    const passwordInput = ((formData.get("password") as string) || "").trim();
    if (passwordInput) {
      userData.password = passwordInput;
    } else if (!editingUser?.id) {
      userData.password = Math.random().toString(36).slice(-8);
    }

    if (editingUser?.id) {
      updateUser(editingUser.id, userData);
    } else {
      // ID は addUser 側で一意性を担保（employeeCode 重複や同時作成での衝突を再採番で防止）。
      const saved = addUser({
        id: userData.employeeCode || "",
        ...userData,
      } as UserProfile);
      if (!passwordInput) {
        void alertDialog(
          `${userData.lastName} ${userData.firstName} のログイン情報\n\nログインID: ${saved.email}\nパスワード: ${userData.password}\n\n必ず控えて本人に共有してください。`,
        );
      }
    }
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex bg-white rounded-lg p-1 shadow-sm border border-slate-200 w-fit">
        <button
          onClick={() => setActiveSubTab("our_company")}
          className={`px-4 py-2 text-sm font-bold rounded-md transition-colors ${activeSubTab === "our_company" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        >
          社内スタッフ
        </button>
        <button
          onClick={() => setActiveSubTab("client_company")}
          className={`px-4 py-2 text-sm font-bold rounded-md transition-colors ${activeSubTab === "client_company" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        >
          取引先企業 (パートナー)
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
          <h3 className="font-bold text-slate-800">
            {activeSubTab === "our_company"
              ? "社内スタッフ管理"
              : "取引先ユーザー管理"}{" "}
            ({displayUsers.length})
          </h3>
          <button
            onClick={handleAdd}
            className="text-sm bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded-lg font-bold transition-colors"
          >
            + アカウント追加
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b">
                  ID
                </th>
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b">
                  氏名 & メール
                </th>
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b">
                  会社・所属
                </th>
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b">
                  Profile
                </th>
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b">
                  役割・権限
                </th>
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b text-center">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayUsers.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3 text-sm text-slate-500 font-mono">
                    {u.id}
                  </td>
                  <td className="p-3">
                    <p className="text-sm font-bold text-slate-800">
                      {u.lastName} {u.firstName}
                    </p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </td>
                  <td className="p-3">
                    <span className="text-sm font-medium text-slate-800">
                      {u.companyName}
                    </span>
                    {u.team && <p className="text-xs text-slate-500 mt-0.5">{u.team}</p>}
                  </td>
                  <td className="p-3">
                    <p className="text-sm font-bold text-slate-800">{u.position || "—"}</p>
                    <p className="text-xs text-slate-500">{u.employeeCode || u.id}</p>
                  </td>
                  <td className="p-3 text-sm font-medium text-slate-700">
                    {u.role === "admin" ? (
                      <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs font-bold">
                        管理者
                      </span>
                    ) : u.role === "staff" ? (
                      <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">
                        一般スタッフ
                      </span>
                    ) : u.role === "customer" ? (
                      <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-xs font-bold">
                        代表者
                      </span>
                    ) : (
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs font-bold">
                        注文担当者
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => handleEdit(u)}
                      className="text-slate-400 hover:text-blue-600 p-1 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        edit
                      </span>
                    </button>
                    <button
                      onClick={() => handleDelete(u.id)}
                      className="text-slate-400 hover:text-red-500 p-1 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        delete
                      </span>
                    </button>
                  </td>
                </tr>
              ))}
              {displayUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    データが存在しません。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && editingUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-800 mb-4">
              {editingUser.id ? "アカウント情報を編集" : "新規アカウント作成"}
            </h3>
            <form onSubmit={saveUser} className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-bold text-slate-700 mb-1">
                    姓 (Last Name)
                  </label>
                  <input
                    required
                    defaultValue={editingUser.lastName}
                    name="lastName"
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-bold text-slate-700 mb-1">
                    名 (First Name)
                  </label>
                  <input
                    required
                    defaultValue={editingUser.firstName}
                    name="firstName"
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">
                  会社名
                </label>
                {activeSubTab === "client_company" ? (
                  <>
                    <input
                      required
                      defaultValue={editingUser.companyName}
                      name="companyName"
                      list="client-company-list"
                      placeholder="既存の取引先から選択（または新規入力）"
                      className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                    />
                    <datalist id="client-company-list">
                      {clientCompanies.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                    <p className="text-[11px] text-slate-400 mt-1">
                      登録済みの取引先企業から選択できます。
                    </p>
                  </>
                ) : (
                  <input
                    required
                    defaultValue={editingUser.companyName}
                    name="companyName"
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                  />
                )}
              </div>

              {activeSubTab === "our_company" ? (
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">
                    役割・権限
                  </label>
                  <select
                    name="role"
                    defaultValue={editingUser.role}
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white"
                  >
                    <option value="staff">一般スタッフ (配送/倉庫)</option>
                    <option value="admin">管理者 (Admin)</option>
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">
                    パートナー企業での役割
                  </label>
                  <select
                    name="role"
                    defaultValue={
                      editingUser.role === "customer_staff"
                        ? "customer_staff"
                        : "customer"
                    }
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white"
                  >
                    <option value="customer">企業代表者 (管理権限)</option>
                    <option value="customer_staff">一般注文担当者</option>
                  </select>
                </div>
              )}

              {activeSubTab === "our_company" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">
                      社員ID
                    </label>
                    <input
                      defaultValue={editingUser.employeeCode || editingUser.id}
                      name="employeeCode"
                      placeholder="STF-001"
                      className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">
                      ステータス
                    </label>
                    <select
                      name="status"
                      defaultValue={editingUser.status || "active"}
                      className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white"
                    >
                      <option value="active">有効</option>
                      <option value="inactive">停止中</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">
                      拠点・チーム
                    </label>
                    <input
                      defaultValue={editingUser.team || ""}
                      name="team"
                      placeholder="東京中央ベース"
                      className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">
                      職種・担当
                    </label>
                    <input
                      defaultValue={editingUser.position || ""}
                      name="position"
                      placeholder="配送・回収担当"
                      className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">
                  メールアドレス
                </label>
                <input
                  required
                  type="email"
                  defaultValue={editingUser.email}
                  name="email"
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">
                  電話番号
                </label>
                <input
                  required
                  type="tel"
                  defaultValue={editingUser.phone}
                  name="phone"
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">
                  住所・拠点住所
                </label>
                <input
                  defaultValue={editingUser.address}
                  name="address"
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">
                  プロフィール画像URL
                </label>
                <input
                  defaultValue={editingUser.avatarUrl || ""}
                  name="avatarUrl"
                  placeholder="https://..."
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">
                  パスワード{" "}
                  <span className="font-normal text-slate-400">
                    （ログイン用）
                  </span>
                </label>
                <input
                  type="text"
                  name="password"
                  defaultValue=""
                  placeholder={
                    editingUser.id
                      ? editingUser.password
                        ? `設定済み（現在: ${editingUser.password}）— 変更する場合のみ入力`
                        : "未設定 — 設定する場合は入力"
                      : "空欄なら自動生成して表示します"
                  }
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  ログインID はメールアドレスです。
                </p>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm"
                >
                  保存する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
