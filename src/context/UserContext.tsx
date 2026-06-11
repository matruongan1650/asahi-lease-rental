import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from "react";
import OrderBus from "../lib/orderBus";

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
  /** ログイン中ユーザー（未ログインなら null）。お客様サイトの認証ゲートで使用。 */
  currentUser: UserProfile | null;
  /** メールアドレス or ユーザーID + パスワードでログイン。成功時 true。 */
  login: (loginId: string, password: string) => boolean;
  logout: () => void;
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
  password: "1234",
};

// 初期シードユーザー。password はデモ用の初期値（admin の ユーザー管理 で変更可能）。
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
    password: "1234",
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
    password: "1234",
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
    password: "1234",
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
    password: "1234",
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
    password: "1234",
  },
  {
    id: "USR_004",
    lastName: "配送",
    firstName: "スタッフ",
    companyName: "ASAHI LEASE",
    email: "delivery@asahilease.co.jp",
    phone: "03-8765-4321",
    address: "東京都港区1-1-2",
    avatarUrl: "",
    role: "staff",
    companyType: "our_company",
    password: "1234",
  },
];

const SESSION_KEY = "asahi.sessionUserId";

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: ReactNode }) => {
  // ユーザーマスタは OrderBus の "users" ストアが正（クラウド同期で全端末共有）。
  const [users, setUsers] = useState<UserProfile[]>(
    () => OrderBus.getAll("users") as unknown as UserProfile[],
  );
  const [sessionUserId, setSessionUserId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  });
  // 旧仕様互換: setProfile で直接プロフィールを差し替えるケース用のフォールバック。
  const [fallbackProfile, setFallbackProfile] =
    useState<UserProfile>(defaultProfile);

  useEffect(() => {
    const unsub = OrderBus.subscribe("users", (data) => {
      setUsers(data as unknown as UserProfile[]);
    });

    // 初回マイグレーション/シード:
    //  1) 旧ローカル保存（app_users）があれば OrderBus へ移行（admin が作った既存アカウントを保持）
    //  2) それも無ければデモ初期ユーザー（パスワード初期値 "1234"）を seed
    if (OrderBus.getAll("users").length === 0) {
      let migrated: UserProfile[] | null = null;
      try {
        const saved = localStorage.getItem("app_users");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            migrated = parsed.filter(Boolean);
          }
        }
      } catch {
        /* ignore */
      }
      OrderBus.seedIfEmpty(
        "users",
        (migrated && migrated.length > 0 ? migrated : initialUsers) as any,
      );
    }

    return () => unsub();
  }, []);

  const currentUser =
    (sessionUserId && users.find((u) => u && u.id === sessionUserId)) || null;

  // profile: ログイン中はそのユーザー。未ログイン時は旧来のフォールバック
  // （admin 画面など認証ゲート外からの利用を壊さないため）。
  const profile = currentUser || fallbackProfile;

  const persistSession = (id: string | null) => {
    setSessionUserId(id);
    try {
      if (id) localStorage.setItem(SESSION_KEY, id);
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  };

  const login = (loginId: string, password: string): boolean => {
    const key = (loginId || "").trim().toLowerCase();
    if (!key) return false;
    const user = users.find(
      (u) =>
        u &&
        ((u.email || "").trim().toLowerCase() === key ||
          (u.id || "").trim().toLowerCase() === key),
    );
    if (!user) return false;
    if ((user.password || "") !== password) return false;
    persistSession(user.id);
    return true;
  };

  const logout = () => persistSession(null);

  // setProfile 互換: 既存ユーザーならマスタを更新しつつそのユーザーでセッションを張る
  // （admin の「代理ログイン」や Checkout の連絡先更新が従来どおり動く）。
  const setProfile = (p: UserProfile) => {
    if (p?.id && users.find((u) => u && u.id === p.id)) {
      OrderBus.patch("users", p.id, p as any);
      persistSession(p.id);
    } else {
      setFallbackProfile(p);
    }
  };

  const addUser = (user: UserProfile) => {
    OrderBus.push("users", user as any);
  };
  const updateUser = (id: string, updates: Partial<UserProfile>) => {
    OrderBus.patch("users", id, updates as any);
  };
  const deleteUser = (id: string) => {
    OrderBus.remove("users", id);
    if (sessionUserId === id) persistSession(null);
  };

  return (
    <UserContext.Provider
      value={{
        profile,
        setProfile,
        users,
        addUser,
        updateUser,
        deleteUser,
        currentUser,
        login,
        logout,
      }}
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
