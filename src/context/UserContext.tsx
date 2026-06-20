import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from "react";
import OrderBus from "../lib/orderBus";
import { acquireUserToken, setUserToken } from "../lib/dataBackend";

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
  team?: string;
  employeeCode?: string;
  status?: "active" | "inactive" | string;
  fax?: string;
  registrationNumber?: string;
  companyPhone?: string;
}

interface UserContextType {
  profile: UserProfile;
  setProfile: (profile: UserProfile) => void;
  users: UserProfile[];
  /** users マスタが（ローカルキャッシュ or サーバー初回スナップショットで）読み込み済みか。
   *  起動直後（空のうち）にログインを試すと誤って「アカウントが見つかりません」になるため、ゲートで使う。 */
  usersLoaded: boolean;
  /** ユーザーを追加する。ID/メールの一意化を行い、実際に保存されたレコードを返す。 */
  addUser: (user: UserProfile) => UserProfile;
  updateUser: (id: string, updates: Partial<UserProfile>) => void;
  /** 指定メールが他ユーザー（exceptId 以外）で既に使われているか判定する。 */
  isEmailTaken: (email: string, exceptId?: string) => boolean;
  deleteUser: (id: string) => void;
  /** ログイン中ユーザー（未ログインなら null）。お客様サイトの認証ゲートで使用。 */
  currentUser: UserProfile | null;
  /**
   * メールアドレス or ユーザーID + パスワードでログイン。成功時 true。
   * allowedRoles を渡すと、その役割以外のアカウントはログインを拒否する
   * （お客様サイトで社内アカウント(admin/staff)のログインを防ぐ等）。
   */
  login: (loginId: string, password: string, allowedRoles?: string[]) => boolean;
  logout: () => void;
}

/** admin の作成フォームが空欄時に入れていた共有プレースホルダ。これらは一意でないためログインID衝突の原因になる。 */
const SHARED_PLACEHOLDER_EMAILS = new Set([
  "contact@example.com",
  "staff@example.com",
]);

/** 衝突しない一意のユーザーIDを生成する（既存ユーザーと重複しないことを保証）。 */
function makeUniqueUserId(existing: UserProfile[]): string {
  const taken = new Set(existing.map((u) => String(u?.id || "")));
  const rand = () =>
    typeof crypto !== "undefined" && typeof (crypto as any).randomUUID === "function"
      ? (crypto as any).randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  let id = `USR_${rand()}`;
  while (taken.has(id)) id = `USR_${rand()}`;
  return id;
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
    employeeCode: "STF-004",
    team: "東京中央ベース",
    position: "配送・回収・倉庫スタッフ",
    status: "active",
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

  // users が（ローカルキャッシュ/シード/サーバースナップショットで）1件でも入れば読み込み済みとみなす。
  const usersLoaded = users.length > 0;

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

  const login = (
    loginId: string,
    password: string,
    allowedRoles?: string[],
  ): boolean => {
    const key = (loginId || "").trim().toLowerCase();
    if (!key) return false;
    // 空パスワードは不可（パスワード未設定アカウントへの素通りログインを防ぐ）。
    if (!password) return false;

    // メール or ID が一致するアカウントを全件取得。
    // 一意に定まらない（0件 or 複数）場合は fail-closed。
    // → 重複メール/重複IDの混入時に「別アカウントにログインしてしまう」事故を防ぐ。
    const matches = users.filter(
      (u) =>
        u &&
        ((u.email || "").trim().toLowerCase() === key ||
          (u.id || "").trim().toLowerCase() === key),
    );
    if (matches.length !== 1) return false;

    const user = matches[0];
    // 保存パスワードが空のアカウントはログイン不可（作成漏れの素通りを防ぐ）。
    if (!user.password) return false;
    if (user.password !== password) return false;
    // 停止中アカウントは不可（admin/staff ゲートと同じ扱いを login に集約）。
    if ((user.status || "active") === "inactive") return false;
    // 役割制限（お客様サイトでは customer / customer_staff のみ許可など）。
    if (allowedRoles && !allowedRoles.includes(user.role || "customer")) return false;

    persistSession(user.id);
    // サーバが呼び出し元を信頼できるよう、署名付きユーザートークンを取得して保持する（非同期・失敗は無害）。
    void acquireUserToken(loginId, password);
    return true;
  };

  const logout = () => {
    // 次のユーザーへトークンが引き継がれないようクリアする。
    setUserToken(null);
    persistSession(null);
  };

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
    // 最新の users ストアを直接参照（同一tick内の連続追加=一括登録でも重複を検出するため）。
    const list = OrderBus.getAll("users") as unknown as UserProfile[];

    // ① 一意なID。未指定 or 既存と重複する場合は衝突しないIDを再採番する。
    //    （ランダム4桁IDの衝突で「別アカウントにログイン」「サーバ側で別アカウントを上書き」する事故を防ぐ）
    const idTaken =
      user.id && list.some((u) => u && String(u.id) === String(user.id));
    const id = !user.id || idTaken ? makeUniqueUserId(list) : user.id;

    // ② 一意なログインID(メール)。空欄/共有プレースホルダ/既存重複は一意な代替に置換する。
    //    （同一メールだと login() が fail-closed となりログインできなくなるため）
    const emailNorm = (user.email || "").trim().toLowerCase();
    const emailDup =
      !!emailNorm &&
      list.some((u) => u && (u.email || "").trim().toLowerCase() === emailNorm);
    const email =
      !emailNorm || SHARED_PLACEHOLDER_EMAILS.has(emailNorm) || emailDup
        ? `usr-${id.toLowerCase()}@asahi.local`
        : user.email;

    const record = { ...user, id, email } as UserProfile;
    OrderBus.push("users", record as any);
    return record;
  };
  const updateUser = (id: string, updates: Partial<UserProfile>) => {
    OrderBus.patch("users", id, updates as any);
  };
  /** 指定メールが他ユーザー（exceptId 以外）で既に使われているか。編集時のログインID衝突防止に使う。 */
  const isEmailTaken = (email: string, exceptId?: string): boolean => {
    const norm = (email || "").trim().toLowerCase();
    if (!norm) return false;
    const list = OrderBus.getAll("users") as unknown as UserProfile[];
    return list.some(
      (u) =>
        u &&
        String(u.id) !== String(exceptId) &&
        (u.email || "").trim().toLowerCase() === norm,
    );
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
        usersLoaded,
        addUser,
        updateUser,
        isEmailTaken,
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
