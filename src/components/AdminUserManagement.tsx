import React, { useState } from "react";
import { useUser, UserProfile } from "../context/UserContext";

export default function AdminUserManagement() {
  const { users, addUser, updateUser, deleteUser } = useUser();
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

  const handleDelete = (id: string) => {
    if (window.confirm("Thực sự muốn xoá tài khoản này?")) {
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
      role: roleVal,
      companyType: activeSubTab,
    };

    if (editingUser?.id) {
      updateUser(editingUser.id, userData);
    } else {
      addUser({
        id: "USR_" + Date.now(),
        ...userData,
        avatarUrl: "",
      } as UserProfile);
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
          Nhân viên công ty (Nội bộ)
        </button>
        <button
          onClick={() => setActiveSubTab("client_company")}
          className={`px-4 py-2 text-sm font-bold rounded-md transition-colors ${activeSubTab === "client_company" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        >
          Công ty khách (Đối tác)
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
          <h3 className="font-bold text-slate-800">
            {activeSubTab === "our_company"
              ? "Quản lý nhân viên nội bộ"
              : "Quản lý nhân sự công ty khách"}{" "}
            ({displayUsers.length})
          </h3>
          <button
            onClick={handleAdd}
            className="text-sm bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded-lg font-bold transition-colors"
          >
            + Thêm tài khoản
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
                  Tên & Email
                </th>
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b">
                  Công ty
                </th>
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b">
                  Vai trò
                </th>
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b text-center">
                  Tùy chỉnh
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
                  </td>
                  <td className="p-3 text-sm font-medium text-slate-700">
                    {u.role === "admin" ? (
                      <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs font-bold">
                        Quản trị viên
                      </span>
                    ) : u.role === "staff" ? (
                      <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">
                        Nhân viên
                      </span>
                    ) : u.role === "customer" ? (
                      <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-xs font-bold">
                        Tài khoản chính
                      </span>
                    ) : (
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs font-bold">
                        Nhân viên khách
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
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    Không có dữ liệu.
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
              {editingUser.id ? "Chỉnh sửa tài khoản" : "Tạo tài khoản mới"}
            </h3>
            <form onSubmit={saveUser} className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-bold text-slate-700 mb-1">
                    Họ (Last Name)
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
                    Tên (First Name)
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
                  Công ty
                </label>
                <input
                  required
                  defaultValue={editingUser.companyName}
                  name="companyName"
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                />
              </div>

              {activeSubTab === "our_company" ? (
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">
                    Vai trò
                  </label>
                  <select
                    name="role"
                    defaultValue={editingUser.role}
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white"
                  >
                    <option value="staff">Nhân viên (Giao nhận/Kho)</option>
                    <option value="admin">Quản trị viên (Admin)</option>
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">
                    Vai trò trong công ty đối tác
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
                    <option value="customer">Tài khoản chính (Chủ quản)</option>
                    <option value="customer_staff">Nhân viên đặt hàng</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">
                  Email đăng nhập
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
                  Số điện thoại
                </label>
                <input
                  required
                  type="tel"
                  defaultValue={editingUser.phone}
                  name="phone"
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm"
                >
                  Lưu tài khoản
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
