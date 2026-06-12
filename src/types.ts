/**
 * types.ts
 *
 * 全ての TypeScript インターフェースおよび型の定義。
 * アサヒリース販売・レンタルシステム全体で共有されます。
 */

// ==========================================
// 1. 商品関連の型 (Product Types)
// ==========================================

export interface WarrantyFees {
  enabled: boolean;
  '1_50': number;   // 1〜50日目の日額保証料
  '51_100': number; // 51〜100日目の日額保証料
  '101_150': number; // 101〜150日目の日額保証料
  '151_200': number; // 151〜200日目の日額保証料
}

export interface Product {
  id: string;
  name: string;
  image: string;
  rentPrice?: number;         // 単価A (15日以下など)
  rentPriceLongTerm?: number; // 単価B (17日以上割引など)
  buyPrice?: number;
  badge?: string;
  badgeColor?: string;
  stock: number;
  category: string;
  featured?: boolean;
  description?: string;
  specs?: Record<string, string>;
  isGuarantee?: boolean;
  guaranteeType?: 'flat' | 'tiered';
  guaranteeRate?: number;
  guaranteeFees?: {
    range1: number;
    range2: number;
    range3: number;
    range4: number;
    range5?: number;
    range6?: number;
  };
  warrantyFees?: WarrantyFees;
}

// ==========================================
// 2. カート関連の型 (Cart Types)
// ==========================================

export interface MonthlyBreakdown {
  monthStr: string; // e.g. "2024-04"
  days: number;
  discounted: boolean;
  price: number;
}

export interface CartItem {
  id: string;
  name: string;
  image: string;
  rentPrice?: number;
  rentPriceLongTerm?: number;
  buyPrice?: number;
  quantity: number;
  returnedQuantity?: number;
  rentalDays?: number;
  billedDays?: number;
  type: 'rent' | 'buy';
  category?: string;
  actualReturnDate?: string;
  calculatedPrice?: number;
  monthlyBreakdown?: MonthlyBreakdown[];
  guaranteeFeeFlat?: number;
}

// ==========================================
// 3. 注文関連の型 (Order Types)
// ==========================================

export type OrderStatus =
  | '処理中'       // Processing
  | '確認済み'     // Confirmed
  | '準備中'       // Preparing
  | '配送中'       // Delivering
  | '配送済み'     // Delivered
  | 'レンタル中'   // Renting
  | '回収予定'     // Recovery scheduled
  | '回収中'       // Recovering
  | '検品待ち'     // Awaiting warehouse inspection (walk-in partial return)
  | '返却済み'     // Returned
  | '一部返却'     // Partially returned
  | '完了'         // Completed
  | 'キャンセル';  // Cancelled

export type StaffStatus = '未割当' | '割当済み' | '配送中' | '完了';

export interface ItemIssue {
  itemId: string;
  type: 'missing' | 'broken';
  quantity: number;
  notes: string;
  photo?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  date: string;
  status: OrderStatus | string;
  returnRequestType?: "full" | "partial";
  items: CartItem[];
  total: number;
  subtotal: number;
  tax: number;
  deliveryLocation: string;
  deliveryDate: string;
  siteName?: string;
  constructionNumber?: string;
  companyName?: string;
  personName?: string;
  rentalStartDate?: string;
  rentalEndDate?: string;
  actualReturnDate?: string;
  firestoreId?: string;
  staffStatus?: StaffStatus | string;
  staffNote?: string;
  assignedStaff?: string;
  deliveryPhoto?: string;
  deliverySignature?: string;
  collectionPhoto?: string;
  collectionSignature?: string;
  warehousePhoto?: string;
  warehouseSignature?: string;
  itemIssues?: ItemIssue[];
  notes?: string;
  invoiceBlocks?: InvoiceBlock[];
  inspectedByWarehouse?: boolean;
}

export interface ExtraCost {
  id: string;
  itemName: string;
  amount: number;
  isTaxable: boolean;
  attachmentUrl?: string;
  note?: string;
}

export interface InvoiceBlock {
  id: string;
  monthPeriod: string; // YYYY-MM
  startDate: string;   // YYYY/MM/DD
  endDate: string;     // YYYY/MM/DD
  actualDays: number;
  chargeableDays: number;
  tierApplied: 'Price_A' | 'Price_B';
  guaranteeFee: number;
  baseSubtotal: number; // Subtotal before extra costs
  subtotal: number;     // Total subtotal (baseSubtotal + extra costs)
  tax: number;
  total: number;
  status: 'accumulating' | 'pending' | 'paid' | string;
  extraCosts?: ExtraCost[];
}

// ==========================================
// 4. ユーザー関連の型 (User Types)
// ==========================================

export type UserRole = 'admin' | 'staff' | 'customer' | 'customer_staff';
export type CompanyType = 'our_company' | 'client_company';

export interface UserProfile {
  id: string;
  lastName: string;
  firstName: string;
  companyName: string;
  email: string;
  phone: string;
  address: string;
  avatarUrl: string;
  role?: UserRole;
  companyType?: CompanyType;
}

// ==========================================
// 5. 車両関連の型 (Vehicle Types)
// ==========================================

export type VehicleStatus = '使用中' | '空車' | '整備中';

export interface VehicleAlert {
  id: number;
  type: 'warning' | 'danger' | 'info';
  title: string;
  subtitle: string;
  icon: string;
}

export interface MaintenanceRecord {
  date: string;
  item: string;
  mileage: string;
}

export interface RepairRecord {
  title: string;
  shop: string;
  date: string;
  price: string;
  receipt: string;
}

export interface VehicleDetail {
  id: string; // The product id or unique vehicle id
  productId: string;
  name: string;
  stock?: number;
  plate: string;
  category: string;
  status: VehicleStatus;
  statusColor: 'emerald' | 'orange' | 'blue';
  
  // Legal
  inspectionDate: string; // "2026/06/08"
  inspectionDaysRemaining: number;
  insuranceDate: string;
  
  // Basic Info
  manufacturer: string;
  year: string;
  color: string;
  vin: string; // Vehicle Identification Number
  engineModel: string;
  purchaseDate: string;
  purchasePrice: string;
  mileage: string;
  
  maintenanceDesc?: string;
  maintenanceDate?: string;
  
  alerts: VehicleAlert[];
  maintenanceHistory: MaintenanceRecord[];
  repairHistory: RepairRecord[];
  documents: string[];
}

// ==========================================
// 6. 取引先関連の型 (Business Entity Types)
// ==========================================

export interface Customer {
  id: string;
  companyName: string;
  presidentName?: string;
  phone: string;
  email: string;
  address: string;
  postalCode?: string;
  creditLimit?: number;
  notes?: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson?: string;
  phone: string;
  email: string;
  address: string;
  postalCode?: string;
  bankAccount?: string;
  notes?: string;
}

export interface Vendor {
  id: string;
  name: string;
  contactPerson?: string;
  phone: string;
  email: string;
  address: string;
  specialty?: string; // e.g. "板金", "タイヤ", "エンジン系"
  notes?: string;
}

// ==========================================
// 7. 倉庫・在庫関連の型 (Warehouse & Inventory Types)
// ==========================================

export interface Warehouse {
  id: string;
  name: string;
  location: string;
  managerName?: string;
  layoutImageUrl?: string;
}

export interface StocktakeRecord {
  id: string;
  date: string;
  warehouseId: string;
  productId: string;
  systemStock: number;
  actualStock: number;
  diff: number;
  checkedBy: string;
  notes?: string;
}

export interface StockMove {
  id: string;
  productId: string;
  quantity: number;
  type: 'in' | 'out' | 'move';
  fromWarehouseId?: string;
  toWarehouseId?: string;
  date: string;
  operatorId: string;
  notes?: string;
}

// ==========================================
// 8. 保全・メンテナンスの型 (Maintenance Types)
// ==========================================

export interface MaintenanceTask {
  id: string;
  vehicleId?: string;
  productId?: string;
  title: string;
  description: string;
  checklist: { item: string; checked: boolean }[];
  dueDate: string;
  status: 'pending' | 'in_progress' | 'completed';
  assignedStaffId?: string;
  completedAt?: string;
  notes?: string;
  photos?: string[];
}

export interface MaintenanceSchedule {
  id: string;
  targetId: string; // vehicleId or productId
  targetType: 'vehicle' | 'product';
  intervalMonths: number;
  lastDate: string;
  nextDueDate: string;
}

// ==========================================
// 9. 帳票書類関連の型 (Document Types)
// ==========================================

export interface Invoice {
  id: string;
  invoiceNumber: string;
  orderId: string;
  issueDate: string;
  dueDate: string;
  billingMonth: string; // "2026-06"
  subtotal: number;
  tax: number;
  total: number;
  status: 'unpaid' | 'paid' | 'overdue';
}

export interface Contract {
  id: string;
  contractNumber: string;
  orderId: string;
  createdAt: string;
  status: 'active' | 'terminated';
  pdfUrl?: string;
}

export interface DeliveryNote {
  id: string;
  deliveryNoteNumber: string;
  orderId: string;
  deliveredAt: string;
  deliveredBy: string;
  signatureUrl?: string;
}

export interface CollectionNote {
  id: string;
  collectionNoteNumber: string;
  orderId: string;
  collectedAt: string;
  collectedBy: string;
  signatureUrl?: string;
}

export interface RepairInvoice {
  id: string;
  repairInvoiceNumber: string;
  orderId: string;
  issueDate: string;
  cost: number;
  description: string;
  status: 'unpaid' | 'paid';
}

// ==========================================
// 10. 財務関連の型 (Financial Types)
// ==========================================

export interface PaymentVoucher {
  id: string;
  voucherNumber: string;
  date: string;
  customerId: string;
  amount: number;
  paymentMethod: 'bank_transfer' | 'cash' | 'credit_card';
  notes?: string;
}

export interface ExpenseVoucher {
  id: string;
  voucherNumber: string;
  date: string;
  payee: string; // supplier or vendor
  amount: number;
  category: string; // e.g. "車両修理", "仕入れ"
  notes?: string;
}

export interface AccountsReceivable {
  customerId: string;
  companyName: string;
  outstandingAmount: number;
  lastPaymentDate?: string;
}

export interface AccountsPayable {
  supplierId?: string;
  vendorId?: string;
  name: string;
  outstandingAmount: number;
  lastPaymentDate?: string;
}

// ==========================================
// 11. アラート・通知関連の型 (Alert/Notification Types)
// ==========================================

export interface SystemAlert {
  id: string;
  type: 'maintenance_due' | 'low_stock' | 'overdue_rental' | 'warranty_expiry';
  severity: 'info' | 'warning' | 'danger';
  title: string;
  message: string;
  targetId?: string;
  date: string;
  read: boolean;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  date: string;
  read: boolean;
  link?: string;
}

// ==========================================
// 12. 現場報告書の型 (Field Report Types)
// ==========================================

export interface FieldReport {
  id: string;
  orderId: string;
  reportedAt: string;
  reporterId: string;
  reporterName: string;
  damagePhotoUrl?: string;
  damageDescription: string;
  estimatedRepairCost?: number;
  status: 'pending' | 'resolved';
}

// ==========================================
// 13. カレンダー関連の型 (Calendar Types)
// ==========================================

export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // YYYY-MM-DD
  end?: string;  // YYYY-MM-DD
  allDay?: boolean;
  color?: string; // hex or tailwind class
  type: 'delivery' | 'rental' | 'maintenance' | 'stocktake' | 'warranty';
  targetId?: string; // orderId or vehicleId etc.
}
