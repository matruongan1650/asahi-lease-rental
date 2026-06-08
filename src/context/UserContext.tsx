import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from "react";

export interface UserProfile {
  id: string;
  lastName: string;
  firstName: string;
  companyName: string;
  email: string;
  phone: string;
  address: string;
  avatarUrl: string;
  role?: "admin" | "staff" | "customer" | "customer_staff";
  companyType?: "our_company" | "client_company";
  password?: string;
  position?: string;
  fax?: string;
  registrationNumber?: string;
  companyPhone?: string;
}

interface UserContextType {
  profile: UserProfile;
  setProfile: (profile: UserProfile) => void;
  users: UserProfile[];
  addUser: (user: UserProfile) => void;
  updateUser: (id: string, updates: Partial<UserProfile>) => void;
  deleteUser: (id: string) => void;
}

const defaultProfile: UserProfile = {
  id: "USR_001",
  lastName: "ミン",
  firstName: "トゥアン",
  companyName: "株式会社ビルドテック",
  email: "tuan.minh@example.com",
  phone: "090-1234-5678",
  address: "東京都渋谷区神南1-2-3",
  avatarUrl:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuAuFpsreLwVkapqiTBN2olOSvumTfpBhRsLdbNZmwHIVxbM8B9k5GyO1hiEyi0t7u17F_5GgL1XLOokHGMnX5khiYbV3g0xlxBFg7-u99_JxwTreYt-Axk0WS3uodyirJadDvx8KAv2RUesxyuC8pDx6zYz7h4gxRduw5XbsG8MTC_AVCEysVLpT2KmJeSRvgQbaG3tqWX5tXFakk-SAqTv6AXQhHfswOujLodZsAqdlCZleOOiU2tYPRAXNcxWYq4L3ZVW1gGOdwE",
  role: "customer",
  companyType: "client_company",
};

const initialUsers: UserProfile[] = [
  defaultProfile,
  {
    id: "USR_002",
    lastName: "田中",
    firstName: "一郎",
    companyName: "大成建設 株式会社",
    email: "tanaka@taisei.example.com",
    phone: "03-5479-1200",
    address: "東京都新宿区",
    avatarUrl: "",
    role: "customer",
    companyType: "client_company",
  },
  {
    id: "USR_002_1",
    lastName: "山本",
    firstName: "花子",
    companyName: "大成建設 株式会社",
    email: "yamamoto.h@taisei.example.com",
    phone: "03-0000-0001",
    address: "東京都新宿区",
    avatarUrl: "",
    role: "customer_staff",
    companyType: "client_company",
  },
  {
    id: "USR_005",
    lastName: "鈴木",
    firstName: "健",
    companyName: "清水建設 株式会社",
    email: "suzuki.k@shimizu.example.com",
    phone: "03-1234-5678",
    address: "東京都中央区",
    avatarUrl: "",
    role: "customer",
    companyType: "client_company",
  },
  {
    id: "USR_006",
    lastName: "高橋",
    firstName: "誠",
    companyName: "鹿島建設 株式会社",
    email: "takahashi.m@kajima.example.com",
    phone: "03-8765-4321",
    address: "東京都港区",
    avatarUrl: "",
    role: "customer",
    companyType: "client_company",
  },
  {
    id: "USR_003",
    lastName: "管理者",
    firstName: "佐藤",
    companyName: "ASAHI LEASE",
    email: "admin@asahilease.co.jp",
    phone: "03-1234-5678",
    address: "東京都港区1-1-1",
    avatarUrl: "",
    role: "admin",
    companyType: "our_company",
  },
  {
    id: "USR_004",
    lastName: "Nhân viên",
    firstName: "Giao hàng",
    companyName: "ASAHI LEASE",
    email: "delivery@asahilease.co.jp",
    phone: "03-8765-4321",
    address: "東京都港区1-1-2",
    avatarUrl: "",
    role: "staff",
    companyType: "our_company",
  },
];

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [users, setUsers] = useState<UserProfile[]>(() => {
    const saved = localStorage.getItem("app_users");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return initialUsers;
      }
    }
    return initialUsers;
  });

  useEffect(() => {
    localStorage.setItem("app_users", JSON.stringify(users));
    if (users.length > 0 && !users.find((u) => u.id === profile.id)) {
      setProfile(users[0]);
    }
  }, [users]);

  const addUser = (user: UserProfile) => setUsers((prev) => [user, ...prev]);
  const updateUser = (id: string, updates: Partial<UserProfile>) =>
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, ...updates } : u)),
    );
  const deleteUser = (id: string) =>
    setUsers((prev) => prev.filter((u) => u.id !== id));

  return (
    <UserContext.Provider
      value={{ profile, setProfile, users, addUser, updateUser, deleteUser }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within UserProvider");
  }
  return context;
};
