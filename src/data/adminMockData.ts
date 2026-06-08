import { PRODUCTS } from "./products";

// Helper to format currency
export const FMT = (n: number) => "¥" + n.toLocaleString("ja-JP");

/* ---------- KPIs ---------- */
export const KPIS = {
  totalSales: 48720000,
  totalSalesDelta: 12.4,
  rentalSales: 31450000,
  rentalSalesDelta: 8.1,
  productSales: 17270000,
  productSalesDelta: 21.0,
  avgDeal: 286000,
  avgDealDelta: 3.2,
  stockCount: 12840,
  stockDelta: -2.1,
  maintenance: 7,
  maintenanceDelta: 2,
};

/* Monthly sales trend for chart */
export const SALES_TREND = [
  { m: "1月", rental: 24.1, sale: 11.2 },
  { m: "2月", rental: 26.8, sale: 9.8 },
  { m: "3月", rental: 29.4, sale: 14.6 },
  { m: "4月", rental: 27.0, sale: 12.1 },
  { m: "5月", rental: 30.2, sale: 15.9 },
  { m: "6月", rental: 31.45, sale: 17.27 },
];

/* ---------- Recent Transactions ---------- */
export const RECENT_TX = [
  { id: "RN-7820", type: "レンタル", customer: "大成建設 株式会社", amount: 482000, date: "06/02", status: "進行中" },
  { id: "SL-3391", type: "販売", customer: "清水建設 株式会社", amount: 1240000, date: "06/02", status: "完了" },
  { id: "RN-7818", type: "レンタル", customer: "鹿島建設 株式会社", amount: 268000, date: "06/01", status: "進行中" },
  { id: "RT-5102", type: "回収", customer: "戸田建設 株式会社", amount: 0, date: "06/01", status: "完了" },
  { id: "SL-3388", type: "販売", customer: "前田建設工業", amount: 356000, date: "05/31", status: "請求済" },
  { id: "RN-7815", type: "レンタル", customer: "西松建設 株式会社", amount: 612000, date: "05/31", status: "延滞" },
];

/* ---------- Assets (保安品) ---------- */
export const ASSETS = [
  { id: "AS-CONE-1001", name: "カラーコーン 赤", cat: "コーン", state: "レンタル中", customer: "大成建設", since: "2026/05/02", due: "2026/06/01", qty: 40, loc: "現場", overdue: true },
  { id: "AS-FENCE-6001", name: "ガードフェンス", cat: "フェンス", state: "レンタル中", customer: "清水建設", since: "2026/05/20", due: "2026/06/18", qty: 24, loc: "現場", overdue: false },
  { id: "AS-LED-5120", name: "LED保安灯", cat: "照明", state: "レンタル中", customer: "鹿島建設", since: "2026/05/15", due: "2026/06/12", qty: 18, loc: "現場", overdue: false },
  { id: "AS-GEN-2500", name: "発電機 EF2500i", cat: "電動機器", state: "メンテナンス中", customer: "—", since: "2026/05/28", due: "2026/06/10", qty: 2, loc: "倉庫", overdue: false },
  { id: "AS-SIGN-4055", name: "工事看板 A型", cat: "看板", state: "在庫", customer: "—", since: "—", due: "—", qty: 54, loc: "倉庫 B-04", overdue: false },
  { id: "AS-TANK-3010", name: "単管バリケード", cat: "バリケード", state: "修正中", customer: "—", since: "2026/05/30", due: "2026/06/05", qty: 6, loc: "修理業者", overdue: false },
  { id: "AS-WEIGHT-700", name: "ウェイト 10kg", cat: "ウェイト", state: "在庫", customer: "—", since: "—", due: "—", qty: 300, loc: "倉庫 C-05", overdue: false },
  { id: "AS-ARROW-8030", name: "矢印板", cat: "看板", state: "レンタル中", customer: "前田建設", since: "2026/04/28", due: "2026/05/28", qty: 8, loc: "現場", overdue: true },
];

export const ASSET_STATES = ["全保安品", "レンタル中", "メンテナンス中", "修正中", "在庫"];

/* ---------- Stock In / Stock Out ---------- */
export const STOCK_IN = [
  { id: "IN-7781", item: "カラーコーン 赤", qty: 120, date: "2026/06/02 08:12", src: "回収 RT-5099", type: "回収戻し", staff: "佐藤" },
  { id: "IN-7783", item: "LED保安灯", qty: 32, date: "2026/06/02 09:05", src: "新規購入 PO-2204", type: "新規購入", staff: "佐藤" },
  { id: "IN-7779", item: "ガードフェンス", qty: 50, date: "2026/06/01 14:40", src: "新規購入 PO-2201", type: "新規購入", staff: "田村" },
];

export const STOCK_OUT = [
  { id: "OUT-9925", item: "単管バリケード", qty: 12, date: "2026/06/02 09:20", dst: "大成建設 / 品川現場", type: "レンタル", staff: "佐藤" },
  { id: "OUT-9920", item: "ガードフェンス", qty: 24, date: "2026/06/02 08:40", dst: "清水建設 / 豊洲現場", type: "レンタル", staff: "田村" },
  { id: "OUT-9918", item: "工事看板 A型", qty: 6, date: "2026/06/01 16:10", dst: "鹿島建設 / 新宿現場", type: "販売", staff: "佐藤" },
];

/* ---------- Rentals / Sales logs ---------- */
export const RENTALS = [
  { id: "RN-7820", customer: "大成建設 株式会社", site: "品川駅前再開発 B工区", start: "2026/06/02", end: "2026/07/02", items: 4, amount: 482000, status: "進行中", invoice: "INV-R-4410" },
  { id: "RN-7818", customer: "鹿島建設 株式会社", site: "新宿西口駅前広場改修", start: "2026/06/01", end: "2026/06/30", items: 3, amount: 268000, status: "進行中", invoice: "INV-R-4408" },
  { id: "RN-7815", customer: "西松建設 株式会社", site: "池袋東口商業ビル", start: "2026/04/28", end: "2026/05/28", items: 5, amount: 612000, status: "延滞", invoice: "INV-R-4405" },
  { id: "RN-7812", customer: "戸田建設 株式会社", site: "渋谷桜丘口地区", start: "2026/05/10", end: "2026/06/09", items: 6, amount: 720000, status: "進行中", invoice: "INV-R-4402" },
];

export const SALES = [
  { id: "SL-3391", customer: "清水建設 株式会社", site: "豊洲スマートシティ", date: "2026/06/02", items: 8, amount: 1240000, status: "完了", invoice: "INV-S-2210" },
  { id: "SL-3388", customer: "前田建設工業 株式会社", site: "池袋東口", date: "2026/05/31", items: 3, amount: 356000, status: "請求済", invoice: "INV-S-2208" },
  { id: "SL-3385", customer: "大林組 株式会社", site: "横浜みなとみらい", date: "2026/05/29", items: 12, amount: 2180000, status: "完了", invoice: "INV-S-2205" },
];

/* ---------- Stocktake ---------- */
export const STOCKTAKE = [
  { id: "INV-01", name: "カラーコーン 赤", loc: "A-01", system: 480, counted: 474, state: "差異あり" },
  { id: "INV-02", name: "コーンバー 2m", loc: "A-02", system: 210, counted: 210, state: "一致" },
  { id: "INV-03", name: "単管バリケード", loc: "B-01", system: 96, counted: 90, state: "差異あり" },
  { id: "INV-05", name: "ガードフェンス", loc: "C-02", system: 132, counted: 132, state: "一致" },
  { id: "INV-07", name: "LED保安灯", loc: "D-01", system: 88, counted: 85, state: "破損あり" },
];

/* ---------- Repairs ---------- */
export const REPAIRS = [
  { id: "RP-2041", asset: "単管バリケード", vendor: "オートサービス品川", status: "修理中", req: "2026/05/30", cost: 18500, warranty: true, issue: "脚部の溶接破損" },
  { id: "RP-2038", asset: "発電機 EF2500i", vendor: "ヤマハ販売店", status: "修理待ち", req: "2026/05/29", cost: null, warranty: false, issue: "始動不良" },
  { id: "RP-2035", asset: "LED投光器", vendor: "電materials工房", status: "完了", req: "2026/05/20", cost: 9800, warranty: true, issue: "点灯不良（LED交換）" },
  { id: "RP-2030", asset: "高所作業台車", vendor: "東京建機サービス", status: "完了", req: "2026/05/12", cost: 42000, warranty: false, issue: "油圧シリンダ交換" },
];

export const REPAIR_STATES = ["すべて", "修理待ち", "修理中", "完了"];

/* ---------- Maintenance ---------- */
export const MAINT = [
  { id: "MN-501", name: "発電機 ヤマハ EF2500i", cat: "電動機器", category: "電動機器", last: "2026/03/10", next: "2026/06/10", cycle: "3ヶ月", days: 8, status: "予定", icon: "battery" },
  { id: "MN-512", name: "LED投光器 大型 ×12", cat: "照明", category: "照明", last: "2026/02/28", next: "2026/05/28", cycle: "3ヶ月", days: -5, status: "超過", icon: "sun" },
  { id: "MN-530", name: "高所作業台車", cat: "車両系", category: "車両系", last: "2026/04/01", next: "2026/07/01", days: 29, status: "正常", icon: "car" },
  { id: "MN-544", name: "コンプレッサー 2台", cat: "電動機器", category: "電動機器", last: "2026/05/20", next: "2026/06/03", cycle: "2週間", days: 1, status: "予定", icon: "wrench" },
];

/* ---------- Vehicles ---------- */
export const VEHICLES = [
  {
    id: "1",
    productId: "1",
    name: "軽トラック",
    plate: "品川 800 あ 12-34",
    manufacturer: "スズキ / ダイハツ",
    category: "軽トラック",
    year: "2021年",
    color: "ホワイト",
    vin: "DA16T-7012345",
    engineModel: "R06A-998012",
    purchaseDate: "2021/04/12",
    purchasePrice: "¥1,200,000",
    status: "使用中" as const,
    statusColor: "emerald" as const,
    mileage: "84,210 km",
    
    // Legal fields
    inspectionDate: "2026/06/08",
    inspectionDaysRemaining: 6,
    insuranceDate: "2026/06/20",
    
    // Staff/Mobile fields
    nextInspectionDate: "2026/06/08",
    nextInspectionDaysRemaining: 6,
    shaken: { last: "2024/06/05", next: "2026/06/08", file: "車検証_品川800あ1234.pdf" },
    jibaiseki: { policyNo: "JB-2024-558102", expiry: "2026/06/20", file: "自賠責_2024.pdf" },
    nini: { company: "東京海上日動", policyNo: "TN-77120934", expiry: "2026/09/30", file: "任意保険_証券.pdf" },
    tax: { year: "2026年度", paid: false, file: null },
    driver: { name: "ミン トゥアン", license: "第123456789012号", licenseExpiry: "2026/07/15" },
    nextOil: { date: "2026/06/05", km: "85,000 km", lastKm: "80,100 km" },
    
    // Maintenance & repairs history
    maintenanceDesc: "定期点検 (オイル交換等)",
    maintenanceDate: "2026/06/15",
    alerts: [
      { id: 1, type: "danger" as const, title: "車検期限が近いです", subtitle: "残り6日", icon: "directions_car" },
      { id: 2, type: "warning" as const, title: "オイル交換の時期です", subtitle: "予定より超過しています", icon: "water_drop" }
    ],
    maintenanceHistory: [
      { date: "2026/03/10", item: "エンジンオイル交換", mileage: "80,100 km" },
      { date: "2025/12/02", item: "タイヤ交換（前2本）", mileage: "74,800 km" },
    ],
    repairHistory: [
      { title: "バックカメラ交換", shop: "オートサービス品川", date: "2025/11/20", price: "¥38,500", receipt: "領収書_1120.pdf" },
    ],
    documents: ["車検証", "自賠責保険証", "任意保険証券"],
    
    // Compatibility fields
    maint: [
      { date: "2026/03/10", item: "エンジンオイル交換", km: "80,100 km" },
      { date: "2025/12/02", item: "タイヤ交換（前2本）", km: "74,800 km" },
    ],
    repair: [
      { date: "2025/11/20", content: "バックカメラ交換", garage: "オートサービス品川", cost: "¥38,500", file: "領収書_1120.pdf" },
    ],
    docs: ["車検証.pdf", "自賠責保険証.pdf", "任意保険証券.pdf"]
  },
  {
    id: "2",
    productId: "2",
    name: "軽バン",
    plate: "品川 500 さ 56-78",
    manufacturer: "スズキ / ダイハツ",
    category: "軽バン",
    year: "2022年",
    color: "シルバー",
    vin: "XZU712-2034567",
    engineModel: "N04C-880234",
    purchaseDate: "2022/07/30",
    purchasePrice: "¥1,200,000",
    status: "使用中" as const,
    statusColor: "emerald" as const,
    mileage: "61,540 km",
    
    // Legal fields
    inspectionDate: "2026/06/22",
    inspectionDaysRemaining: 20,
    insuranceDate: "2026/07/01",
    
    // Staff/Mobile fields
    nextInspectionDate: "2026/06/22",
    nextInspectionDaysRemaining: 20,
    shaken: { last: "2024/06/18", next: "2026/06/22", file: "車検証_品川500さ5678.pdf" },
    jibaiseki: { policyNo: "JB-2024-559871", expiry: "2026/07/01", file: "自賠責_2024.pdf" },
    nini: { company: "三井住友海上", policyNo: "MS-44109823", expiry: "2026/08/15", file: "任意保険_証券.pdf" },
    tax: { year: "2026年度", paid: true, file: "自動車税_領収書.pdf" },
    driver: { name: "佐藤 健一", license: "第223344556677号", licenseExpiry: "2027/03/20" },
    nextOil: { date: "2026/07/10", km: "66,000 km", lastKm: "60,500 km" },
    
    // Maintenance & repairs history
    maintenanceDesc: "定期点検 (オイル交換等)",
    maintenanceDate: "2026/10/12",
    alerts: [],
    maintenanceHistory: [
      { date: "2026/04/01", item: "エンジンオイル交換", mileage: "60,500 km" }
    ],
    repairHistory: [
      { title: "サイドミラー交換", shop: "日野東京支店", date: "2025/08/22", price: "¥24,000", receipt: "領収書_0822.pdf" }
    ],
    documents: ["車検証", "自賠責保険証"],
    
    // Compatibility fields
    maint: [
      { date: "2026/04/01", item: "エンジンオイル交換", km: "60,500 km" }
    ],
    repair: [
      { date: "2025/08/22", content: "サイドミラー交換", garage: "日野東京支店", cost: "¥24,000", file: "領収書_0822.pdf" }
    ],
    docs: ["車検証.pdf", "自賠責保険証.pdf"]
  },
  {
    id: "3",
    productId: "3",
    name: "2tノーマル",
    plate: "練馬 100 か 90-12",
    manufacturer: "いすゞ / 日野",
    category: "2tノーマル",
    year: "2019年",
    color: "ブラック",
    vin: "KDH201-9056789",
    engineModel: "1KD-445120",
    purchaseDate: "2019/03/05",
    purchasePrice: "¥3,150,000",
    status: "整備中" as const,
    statusColor: "orange" as const,
    mileage: "112,880 km",
    
    // Legal fields
    inspectionDate: "2026/05/30",
    inspectionDaysRemaining: -3,
    insuranceDate: "2026/05/30",
    
    // Staff/Mobile fields
    nextInspectionDate: "2026/05/30",
    nextInspectionDaysRemaining: -3,
    shaken: { last: "2024/05/28", next: "2026/05/30", file: "車検証_練馬100か9012.pdf" },
    jibaiseki: { policyNo: "JB-2024-551200", expiry: "2026/05/30", file: "自賠責_2024.pdf" },
    nini: { company: "損保ジャパン", policyNo: "SJ-90213344", expiry: "2026/06/10", file: "任意保険_証券.pdf" },
    tax: { year: "2026年度", paid: false, file: null },
    driver: { name: "（未割当）", license: "—", licenseExpiry: null },
    nextOil: { date: "2026/05/25", km: "113,000 km", lastKm: "107,400 km" },
    
    // Maintenance & repairs history
    maintenanceDesc: "故障修理 (故障対応)",
    maintenanceDate: "2026/05/29",
    alerts: [
      { id: 1, type: "danger" as const, title: "車検が切れています", subtitle: "漏れなく点検してください", icon: "warning" }
    ],
    maintenanceHistory: [
      { date: "2026/02/14", item: "エンジンオイル交換", mileage: "107,400 km" }
    ],
    repairHistory: [
      { title: "車検整備（入庫中）", shop: "トヨタ練馬", date: "2026/05/29", price: "見積中", receipt: "見積書_0529.pdf" }
    ],
    documents: ["車検証", "自賠責保険証"],
    
    // Compatibility fields
    maint: [
      { date: "2026/02/14", item: "エンジンオイル交換", km: "107,400 km" }
    ],
    repair: [
      { date: "2026/05/29", content: "車検整備（入庫中）", garage: "トヨタ練馬", cost: "見積中", file: "見積書_0529.pdf" }
    ],
    docs: ["車検証.pdf", "自賠責保険証.pdf"]
  },
  {
    id: "4",
    productId: "4",
    name: "2tロング",
    plate: "品川 100 か 1004",
    manufacturer: "いすゞ / 日野",
    category: "2tロング",
    year: "2022年",
    color: "ホワイト",
    vin: "NPR85-800003",
    engineModel: "4JJ1-T",
    purchaseDate: "2022/04/12",
    purchasePrice: "¥4,500,000",
    status: "空車" as const,
    statusColor: "blue" as const,
    mileage: "45,000 km",
    
    // Legal fields
    inspectionDate: "2026/07/15",
    inspectionDaysRemaining: 43,
    insuranceDate: "2026/08/10",
    
    // Staff/Mobile fields
    nextInspectionDate: "2026/07/15",
    nextInspectionDaysRemaining: 43,
    shaken: { last: "2024/07/10", next: "2026/07/15", file: "車検証_品川100か1004.pdf" },
    jibaiseki: { policyNo: "JB-2024-551004", expiry: "2026/08/10", file: "自賠責_2024.pdf" },
    nini: { company: "東京海上日動", policyNo: "TN-77121004", expiry: "2026/09/30", file: "任意保険_証券.pdf" },
    tax: { year: "2026年度", paid: true, file: "自動車税_領収書.pdf" },
    driver: { name: "田村 直樹", license: "第334455667788号", licenseExpiry: "2028/05/12" },
    nextOil: { date: "2026/08/15", km: "50,000 km", lastKm: "45,000 km" },
    
    // Maintenance & repairs history
    maintenanceDesc: "定期点検 (オイル交換等)",
    maintenanceDate: "2026/07/10",
    alerts: [],
    maintenanceHistory: [],
    repairHistory: [],
    documents: ["車検証", "自賠責保険証"],
    
    // Compatibility fields
    maint: [],
    repair: [],
    docs: ["車検証.pdf", "自賠責保険証.pdf"]
  },
  {
    id: "5",
    productId: "5",
    name: "2t Wキャブノーマル",
    plate: "品川 100 か 1005",
    manufacturer: "いすゞ / 日野",
    category: "2t Wキャブノーマル",
    year: "2023年",
    color: "ホワイト",
    vin: "NPR85-800004",
    engineModel: "4JJ1-T",
    purchaseDate: "2023/04/12",
    purchasePrice: "¥4,500,000",
    status: "使用中" as const,
    statusColor: "emerald" as const,
    mileage: "35,000 km",
    
    // Legal fields
    inspectionDate: "2026/07/20",
    inspectionDaysRemaining: 48,
    insuranceDate: "2026/08/20",
    
    // Staff/Mobile fields
    nextInspectionDate: "2026/07/20",
    nextInspectionDaysRemaining: 48,
    shaken: { last: "2024/07/15", next: "2026/07/20", file: "車検証_品川100か1005.pdf" },
    jibaiseki: { policyNo: "JB-2024-551005", expiry: "2026/08/20", file: "自賠責_2024.pdf" },
    nini: { company: "東京海上日動", policyNo: "TN-77121005", expiry: "2026/09/30", file: "任意保険_証券.pdf" },
    tax: { year: "2026年度", paid: true, file: "自動車税_領収書.pdf" },
    driver: { name: "佐藤 健一", license: "第223344556677号", licenseExpiry: "2027/03/20" },
    nextOil: { date: "2026/08/20", km: "40,000 km", lastKm: "35,000 km" },
    
    // Maintenance & repairs history
    maintenanceDesc: "定期点検 (オイル交換等)",
    maintenanceDate: "2026/07/15",
    alerts: [],
    maintenanceHistory: [],
    repairHistory: [],
    documents: ["車検証", "自賠責保険証"],
    
    // Compatibility fields
    maint: [],
    repair: [],
    docs: ["車検証.pdf", "自賠責保険証.pdf"]
  }
];


/* ---------- Warehouse Inventory ---------- */
export const WAREHOUSE = [
  { id: "W-01", name: "カラーコーン 赤", loc: "A-01", total: 480, rented: 120, available: 360, cat: "コーン" },
  { id: "W-02", name: "コーンバー 2m", loc: "A-02", total: 210, rented: 40, available: 170, cat: "コーン" },
  { id: "W-03", name: "単管バリケード", loc: "B-01", total: 96, rented: 30, available: 66, cat: "バリケード" },
  { id: "W-04", name: "工事看板 A型", loc: "B-04", total: 54, rented: 12, available: 42, cat: "看板" },
  { id: "W-05", name: "ガードフェンス", loc: "C-02", total: 132, rented: 48, available: 84, cat: "フェンス" },
  { id: "W-06", name: "ウェイト 10kg", loc: "C-05", total: 300, rented: 80, available: 220, cat: "ウェイト" },
  { id: "W-07", name: "LED保安灯", loc: "D-01", total: 88, rented: 18, available: 70, cat: "照明" },
];

/* ---------- Customers ---------- */
export const CUSTOMERS = [
  { id: "C-1001", company: "大成建設 株式会社", kana: "タイセイケンセツ", contact: "田中 一郎", tel: "03-5479-1200", mail: "tanaka@taisei.example", sites: 3, activeRentals: 2, ytd: 8420000, status: "取引中" },
  { id: "C-1002", company: "清水建設 株式会社", kana: "シミズケンセツ", contact: "鈴木 健", tel: "03-3402-8855", mail: "suzuki@shimz.example", sites: 5, activeRentals: 1, ytd: 12640000, status: "取引中" },
  { id: "C-1003", company: "鹿島建設 株式会社", kana: "カジマケンセツ", contact: "高橋 誠", tel: "03-6388-4100", mail: "takahashi@kajima.example", sites: 2, activeRentals: 1, ytd: 5310000, status: "取引中" },
  { id: "C-1004", company: "戸田建設 株式会社", kana: "トダケンセツ", contact: "伊藤 大輔", tel: "03-3433-7800", mail: "ito@toda.example", sites: 4, activeRentals: 1, ytd: 4180000, status: "取引中" },
  { id: "C-1005", company: "西松建設 株式会社", kana: "ニシマツケンセツ", contact: "渡辺 隆", tel: "03-5949-2300", mail: "watanabe@nishimatsu.example", sites: 2, activeRentals: 1, ytd: 3020000, status: "要確認" },
];

export const CUSTOMER_SITES = [
  { name: "品川駅前再開発 B工区", addr: "東京都港区港南2-15-3", status: "施工中" },
  { name: "豊洲スマートシティ C街区", addr: "東京都江東区豊洲6-4-1", status: "施工中" },
  { name: "新木場物流センター", addr: "東京都江東区新木場2-1", status: "完了" },
];

/* ---------- Suppliers ---------- */
export const SUPPLIERS = [
  { id: "SP-201", name: "セフティ産業 株式会社", cat: "保安用品", tel: "03-3210-4400", payable: 1240000, assets: 1820, warranty: "1年", status: "取引中" },
  { id: "SP-202", name: "東京建機 株式会社", cat: "電動機器・車両系", tel: "03-5544-7700", payable: 680000, assets: 94, warranty: "2年", status: "取引中" },
  { id: "SP-203", name: "ライトテック工業", cat: "照明", tel: "06-6120-3300", payable: 0, assets: 220, warranty: "1年", status: "取引中" },
];

export const SUPPLIER_ASSETS = [
  { name: "カラーコーン 赤", qty: 600, po: "PO-2204", date: "2026/05/28", warranty: "2027/05/27" },
  { name: "単管バリケード", qty: 120, po: "PO-2190", date: "2026/03/15", warranty: "2027/03/14" },
  { name: "工事看板 A型", qty: 60, po: "PO-2175", date: "2026/01/20", warranty: "2027/01/19" },
];

/* ---------- Repair Vendors ---------- */
export const VENDORS = [
  { id: "V-301", name: "オートサービス品川", cat: "金属・溶接", tel: "03-3450-1100", contact: "山口 修", addr: "東京都品川区東品川3-1", jobs: 24, active: 2 },
  { id: "V-302", name: "ヤマハ販売店 東京", cat: "発電機・エンジン", tel: "03-3760-2200", contact: "中島 豊", addr: "東京都大田区蒲田5-2", jobs: 11, active: 1 },
  { id: "V-303", name: "東京建機サービス", cat: "車両系・油圧", tel: "042-330-8800", contact: "小川 健太", addr: "東京都立川市曙町1-5", jobs: 8, active: 0 },
];

export const VENDOR_HISTORY = [
  { id: "RP-2041", asset: "単管バリケード", date: "2026/05/30", cost: 18500, status: "修理中", warranty: true },
  { id: "RP-1998", asset: "ガードフェンス", date: "2026/04/12", cost: 22000, status: "完了", warranty: false },
  { id: "RP-1955", asset: "バリケード連結部", date: "2026/02/28", cost: 14500, status: "完了", warranty: true },
];

/* ---------- Calendar Events ---------- */
export const CAL_TYPES = {
  delivery: { label: "納品", color: "var(--color-primary)" },
  rental: { label: "レンタル", color: "#0e9c97" }, // teal
  maint: { label: "メンテナンス", color: "#e5961b" }, // warning
  stock: { label: "棚卸し", color: "#7a3ce0" }, // purple
  warranty: { label: "保証", color: "#dc3a28" }, // danger
};

export const CAL_EVENTS: Record<number, Array<{ t: keyof typeof CAL_TYPES; x: string }>> = {
  2: [{ t: "delivery", x: "大成建設 納品" }, { t: "rental", x: "RN-7820 開始" }],
  3: [{ t: "maint", x: "コンプレッサー点検" }],
  5: [{ t: "warranty", x: "AS-TANK 保証期限" }],
  9: [{ t: "rental", x: "RN-7812 返却" }],
  10: [{ t: "maint", x: "発電機 点検" }, { t: "delivery", x: "清水建設 納品" }],
  12: [{ t: "rental", x: "AS-LED 返却" }],
  15: [{ t: "stock", x: "月次棚卸し" }],
  18: [{ t: "rental", x: "AS-FENCE 返却" }],
  20: [{ t: "warranty", x: "自賠責 満期" }],
  22: [{ t: "delivery", x: "鹿島建設 納品" }],
  28: [{ t: "maint", x: "LED投光器 点検" }],
  30: [{ t: "rental", x: "RN-7818 返却" }],
};

export const ADMIN_USER = { name: "管理者 佐藤", role: "倉庫マネージャー", initials: "佐" };

/* ---------- Field Reports ---------- */
export const FIELD_REPORTS = [
  {
    id: "FR-5521", source: "回収", ref: "RTN-31188", date: "2026/06/02 15:10",
    reporter: "ミン トゥアン", customer: "戸田建設 株式会社", site: "渋谷桜丘口地区再開発",
    asset: "単管バリケード", qr: "AS-TANK-3010",
    entries: [{ reason: "破損あり", qty: 3, photos: 2, note: "脚部の溶接が破損" }, { reason: "数量不足", qty: 2, photos: 1, note: "" }],
    status: "未対応", linkedRepair: null,
  },
  {
    id: "FR-5519", source: "回収", ref: "RTN-31188", date: "2026/06/02 15:08",
    reporter: "ミン トゥアン", customer: "戸田建設 株式会社", site: "渋谷桜丘口地区再開発",
    asset: "LED保安灯", qr: "AS-LED-5120",
    entries: [{ reason: "汚損・要清掃", qty: 4, photos: 1, note: "泥汚れ" }],
    status: "未対応", linkedRepair: null,
  },
  {
    id: "FR-5510", source: "持込返却", ref: "WIN-44021", date: "2026/06/02 10:42",
    reporter: "佐藤 健一", customer: "東急建設 株式会社", site: "—（来庫返却）",
    asset: "ガードフェンス", qr: "AS-FENCE-6001",
    entries: [{ reason: "破損あり", qty: 1, photos: 3, note: "格子の歪み" }],
    status: "対応中", linkedRepair: "RP-2041",
  },
  {
    id: "FR-5498", source: "棚卸", ref: "INV-2026-06", date: "2026/06/01 18:20",
    reporter: "佐藤 健一", customer: "—", site: "東京中央倉庫",
    asset: "LED保安灯", qr: "AS-LED-5120",
    entries: [{ reason: "破損あり", qty: 3, photos: 1, note: "棚卸し時に発見" }],
    status: "対応済", linkedRepair: "RP-2035",
  },
];

export const FR_STATES = ["すべて", "未対応", "対応中", "対応済"];

/* ---------- Settings, Roles, Users ---------- */
export const PERM_MODULES = ["概要", "保安品・在庫", "取引", "修理・保証", "マスタ", "設定"];

export const ROLES = [
  { id: "admin", name: "管理者", desc: "全機能の編集・設定変更が可能", users: 2, perms: ["編集", "編集", "編集", "編集", "編集", "編集"] },
  { id: "whmgr", name: "倉庫マネージャー", desc: "在庫・保全・取引を管理", users: 3, perms: ["閲覧", "編集", "編集", "編集", "閲覧", "なし"] },
  { id: "driver", name: "配送・回収ドライバー", desc: "配送・回収ドライバー", users: 8, perms: ["なし", "閲覧", "閲覧", "閲覧", "なし", "なし"] },
  { id: "account", name: "経理", desc: "請求・買掛・売上の閲覧と編集", users: 2, perms: ["閲覧", "閲覧", "編集", "閲覧", "閲覧", "なし"] },
  { id: "viewer", name: "閲覧のみ", desc: "全データの閲覧のみ可能", users: 4, perms: ["閲覧", "閲覧", "閲覧", "閲覧", "閲覧", "なし"] },
];

export const USERS = [
  { id: "U-001", name: "佐藤 健一", initials: "佐", role: "倉庫マネージャー", dept: "東京中央倉庫", mail: "sato@asahi.example", status: "有効", last: "2026/06/02 16:40" },
  { id: "U-002", name: "管理者 山田", initials: "山", role: "管理者", dept: "本社 システム", mail: "yamada@asahi.example", status: "有効", last: "2026/06/02 09:15" },
  { id: "U-003", name: "ミン トゥアン", initials: "ミ", role: "配送・回収ドライバー", dept: "東京第一配送センター", mail: "minh@asahi.example", status: "有効", last: "2026/06/02 15:12" },
  { id: "U-004", name: "田村 直樹", initials: "田", role: "配送・回収ドライバー", dept: "東京第一配送センター", mail: "tamura@asahi.example", status: "有効", last: "2026/06/01 17:30" },
  { id: "U-005", name: "高橋 経子", initials: "高", role: "経理", dept: "本社 経理部", mail: "takahashi@asahi.example", status: "有効", last: "2026/05/31 11:05" },
  { id: "U-006", name: "(退職) Suzuki", initials: "鈴", role: "閲覧のみ", dept: "—", mail: "suzuki@asahi.example", status: "無効", last: "2026/03/10 10:00" },
];

// B2B mock orders for Taisei Construction (大成建設 株式会社) with multiple placing members in June 2026
export const B2B_MOCK_ORDERS = [
  {
    id: "b2b-ord-1",
    orderNumber: "#ORD-2026-7821",
    date: "2026/06/01 • 09:00",
    status: "レンタル中",
    staffStatus: "レンタル中",
    companyName: "大成建設 株式会社",
    personName: "田中 一郎",
    siteName: "品川駅前再開発 B工区",
    constructionNumber: "TAI-SHINA-001",
    rentalStartDate: "2026-06-01",
    rentalEndDate: "2026-06-15",
    deliveryDate: "2026-06-01",
    deliveryLocation: "東京都港区港南2-15-3",
    items: [
      {
        id: "c1",
        name: "レボリューションコーン赤白",
        image: "https://jp.images-monotaro.com/Monotaro3/pi/highreso/mono44627688-230815-02.jpg",
        rentPrice: 5,
        rentPriceLongTerm: 5,
        quantity: 30,
        type: "rent",
        category: "カラーコーン",
        rentalDays: 15,
        billedDays: 15,
        calculatedPrice: 75,
        monthlyBreakdown: [
          {
            monthStr: "2026-06",
            days: 15,
            discounted: false,
            price: 75
          }
        ],
        guaranteeFeeFlat: 100
      },
      {
        id: "c3",
        name: "コーンバー黒/黄",
        image: "https://jp.images-monotaro.com/Monotaro3/pi/highreso/mono21411454-230314-02.jpg",
        rentPrice: 5,
        rentPriceLongTerm: 5,
        quantity: 15,
        type: "rent",
        category: "コーンバー",
        rentalDays: 15,
        billedDays: 15,
        calculatedPrice: 75,
        monthlyBreakdown: [
          {
            monthStr: "2026-06",
            days: 15,
            discounted: false,
            price: 75
          }
        ],
        guaranteeFeeFlat: 30
      },
      {
        id: "c5",
        name: "A型バリケート",
        image: "https://jp.images-monotaro.com/Monotaro3/pi/highreso/mono31259840-230711-02.jpg",
        rentPrice: 20,
        rentPriceLongTerm: 10,
        quantity: 10,
        type: "rent",
        category: "バリケード",
        rentalDays: 15,
        billedDays: 15,
        calculatedPrice: 300,
        monthlyBreakdown: [
          {
            monthStr: "2026-06",
            days: 15,
            discounted: false,
            price: 300
          }
        ],
        guaranteeFeeFlat: 30
      }
    ],
    subtotal: 6535,
    tax: 653,
    total: 7188,
    invoiceBlocks: [
      {
        id: "block-b2b-ord-1-2026-06",
        monthPeriod: "2026-06",
        startDate: "2026/06/01",
        endDate: "2026/06/15",
        actualDays: 15,
        chargeableDays: 15,
        tierApplied: "Price_A",
        guaranteeFee: 160,
        baseSubtotal: 6375,
        subtotal: 6535,
        tax: 653,
        total: 7188,
        status: "pending",
        extraCosts: []
      }
    ]
  },
  {
    id: "b2b-ord-2",
    orderNumber: "#ORD-2026-7822",
    date: "2026/06/10 • 10:30",
    status: "レンタル中",
    staffStatus: "レンタル中",
    companyName: "大成建設 株式会社",
    personName: "渡辺 隆",
    siteName: "豊洲スマートシティ C街区",
    constructionNumber: "TAI-TOYO-002",
    rentalStartDate: "2026-06-10",
    rentalEndDate: "2026-06-25",
    deliveryDate: "2026-06-10",
    deliveryLocation: "東京都江東区豊洲6-4-1",
    items: [
      {
        id: "1",
        name: "軽トラック",
        image: "https://img1.kakaku.k-img.com/Images/prdnews/2021122%2F20211220190008_457_.jpg",
        rentPrice: 3500,
        rentPriceLongTerm: 2100,
        quantity: 1,
        type: "rent",
        category: "軽トラック",
        rentalDays: 16,
        billedDays: 16,
        calculatedPrice: 56000,
        monthlyBreakdown: [
          {
            monthStr: "2026-06",
            days: 16,
            discounted: false,
            price: 56000
          }
        ],
        guaranteeFeeFlat: 0
      },
      {
        id: "5",
        name: "2t Wキャブノーマル",
        image: "https://www.imagiire.co.jp/files/topics/495_ext_05_0_L.png",
        rentPrice: 7000,
        rentPriceLongTerm: 4000,
        quantity: 1,
        type: "rent",
        category: "2t Wキャブノーマル",
        rentalDays: 16,
        billedDays: 16,
        calculatedPrice: 112000,
        monthlyBreakdown: [
          {
            monthStr: "2026-06",
            days: 16,
            discounted: false,
            price: 112000
          }
        ],
        guaranteeFeeFlat: 0
      }
    ],
    subtotal: 168000,
    tax: 16800,
    total: 184800,
    invoiceBlocks: [
      {
        id: "block-b2b-ord-2-2026-06",
        monthPeriod: "2026-06",
        startDate: "2026/06/10",
        endDate: "2026/06/25",
        actualDays: 16,
        chargeableDays: 16,
        tierApplied: "Price_A",
        guaranteeFee: 0,
        baseSubtotal: 168000,
        subtotal: 168000,
        tax: 16800,
        total: 184800,
        status: "pending",
        extraCosts: []
      }
    ]
  },
  {
    id: "b2b-ord-3",
    orderNumber: "#ORD-2026-7823",
    date: "2026/06/05 • 14:15",
    status: "レンタル中",
    staffStatus: "レンタル中",
    companyName: "大成建設 株式会社",
    personName: "佐藤 健一",
    siteName: "品川駅前再開発 B工区",
    constructionNumber: "TAI-SHINA-001",
    rentalStartDate: "2026-06-05",
    rentalEndDate: "2026-06-30",
    deliveryDate: "2026-06-05",
    deliveryLocation: "東京都港区港南2-15-3",
    items: [
      {
        id: "c10",
        name: "ソーラーミラクルエイト",
        image: "https://tshop.r10s.jp/rune/cabinet/image122/tk-m8-so-mk2_1.jpg",
        rentPrice: 520,
        rentPriceLongTerm: 200,
        quantity: 5,
        type: "rent",
        category: "回転灯",
        rentalDays: 26,
        billedDays: 26,
        calculatedPrice: 5200,
        monthlyBreakdown: [
          {
            monthStr: "2026-06",
            days: 26,
            discounted: true,
            price: 5200
          }
        ],
        guaranteeFeeFlat: 0
      },
      {
        id: "c11",
        name: "折りたたみ矢印板",
        image: "https://shop.r10s.jp/h-impact/cabinet/kihon/1bn225.jpg",
        rentPrice: 250,
        rentPriceLongTerm: 100,
        quantity: 4,
        type: "rent",
        category: "矢印板",
        rentalDays: 26,
        billedDays: 26,
        calculatedPrice: 2600,
        monthlyBreakdown: [
          {
            monthStr: "2026-06",
            days: 26,
            discounted: true,
            price: 2600
          }
        ],
        guaranteeFeeFlat: 0
      },
      {
        id: "c5",
        name: "A型バリケート",
        image: "https://jp.images-monotaro.com/Monotaro3/pi/highreso/mono31259840-230711-02.jpg",
        rentPrice: 20,
        rentPriceLongTerm: 10,
        quantity: 8,
        type: "rent",
        category: "バリケード",
        rentalDays: 26,
        billedDays: 26,
        calculatedPrice: 260,
        monthlyBreakdown: [
          {
            monthStr: "2026-06",
            days: 26,
            discounted: true,
            price: 260
          }
        ],
        guaranteeFeeFlat: 24
      }
    ],
    subtotal: 38504,
    tax: 3850,
    total: 42354,
    invoiceBlocks: [
      {
        id: "block-b2b-ord-3-2026-06",
        monthPeriod: "2026-06",
        startDate: "2026/06/05",
        endDate: "2026/06/30",
        actualDays: 26,
        chargeableDays: 26,
        tierApplied: "Price_B",
        guaranteeFee: 24,
        baseSubtotal: 38480,
        subtotal: 38504,
        tax: 3850,
        total: 42354,
        status: "pending",
        extraCosts: []
      }
    ]
  }
];

// Pack all mock collections to simplify seeding
export const COLLECTIONS_MOCK_DATA: Record<string, any[]> = {
  products: PRODUCTS,
  assets: ASSETS,
  warehouse: WAREHOUSE,
  stocktake: STOCKTAKE,
  stockIn: STOCK_IN,
  stockOut: STOCK_OUT,
  repairs: REPAIRS,
  maintenance: MAINT,
  customers: CUSTOMERS,
  suppliers: SUPPLIERS,
  vendors: VENDORS,
  fieldReports: FIELD_REPORTS,
  vehicles: VEHICLES,
};
