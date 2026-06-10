/**
 * returnProcessing.ts
 *
 * 返却（一部／全部）の金額計算と注文への確定処理を共通化する。
 * 顧客の返却確定（ReturnConfirmation）と、倉庫検品完了時の確定（StaffDashboard）の
 * 双方から再利用できるように、計算（純粋関数）と適用（副作用）を分離している。
 */
import { calculateRentalPrice, getOrGenerateInvoiceBlocks } from "./billing";
import { isVehicleCategory } from "./productUtils";

export interface ReturnSplit {
  returningEverything: boolean;
  returnedItemsList: any[];
  remainingItemsList: any[];
  returned: { subtotal: number; tax: number; total: number };
  remaining: { subtotal: number; tax: number; total: number };
}

/**
 * 注文と返却数量（itemId -> 返却数）から、返却分／残存分の品目リストと金額を計算する。
 * 副作用なし。
 */
export function computeReturnSplit(
  order: any,
  returnQuantities: Record<string, number>,
  actualReturnDate: string
): ReturnSplit {
  const hasVehicle = (order.items || []).some(
    (i: any) => isVehicleCategory(i.category) && i.type === "rent"
  );

  const returnedItemsList: any[] = [];
  const remainingItemsList: any[] = [];

  let returnedTotalRentalPrice = 0;
  let returnedTotalBuyPrice = 0;
  let remainingTotalRentalPrice = 0;
  let remainingTotalBuyPrice = 0;

  (order.items || []).forEach((item: any) => {
    const returningQty = returnQuantities[item.id] || 0;
    const alreadyReturnedQty = item.returnedQuantity || 0;
    const currentRemainingQty = item.quantity - alreadyReturnedQty;
    const newRemainingQty = currentRemainingQty - returningQty;

    // 1. 返却される品目
    if (returningQty > 0) {
      if (item.type === "rent" && item.rentPrice) {
        const { totalPrice, breakdown } = calculateRentalPrice(
          item.rentPrice,
          order.rentalStartDate,
          actualReturnDate,
          hasVehicle,
          isVehicleCategory(item.category),
          item.rentPriceLongTerm
        );
        returnedTotalRentalPrice += totalPrice * returningQty;

        returnedItemsList.push({
          ...item,
          quantity: returningQty,
          returnedQuantity: returningQty,
          actualReturnDate,
          calculatedPrice: totalPrice,
          monthlyBreakdown: breakdown,
        });
      } else if (item.type === "buy") {
        returnedTotalBuyPrice += (item.buyPrice || 0) * returningQty;
        returnedItemsList.push({ ...item, quantity: returningQty, returnedQuantity: returningQty });
      }
    }

    // 2. 残存する品目
    if (newRemainingQty > 0 || item.type === "buy") {
      const remainingQtyToKeep = item.type === "rent" ? newRemainingQty : item.quantity;

      if (item.type === "rent" && item.rentPrice) {
        const { totalPrice, breakdown } = calculateRentalPrice(
          item.rentPrice,
          order.rentalStartDate,
          order.rentalEndDate,
          hasVehicle,
          isVehicleCategory(item.category),
          item.rentPriceLongTerm
        );
        remainingTotalRentalPrice += totalPrice * remainingQtyToKeep;

        remainingItemsList.push({
          ...item,
          quantity: remainingQtyToKeep,
          returnedQuantity: 0,
          calculatedPrice: totalPrice,
          monthlyBreakdown: breakdown,
        });
      } else if (item.type === "buy") {
        remainingTotalBuyPrice += (item.buyPrice || 0) * item.quantity;
        remainingItemsList.push({ ...item });
      }
    }
  });

  const returnedSubtotal = returnedTotalRentalPrice + returnedTotalBuyPrice;
  const returnedTax = Math.floor(returnedSubtotal * 0.1);
  const remainingSubtotal = remainingTotalRentalPrice + remainingTotalBuyPrice;
  const remainingTax = Math.floor(remainingSubtotal * 0.1);

  return {
    returningEverything: remainingItemsList.length === 0,
    returnedItemsList,
    remainingItemsList,
    returned: { subtotal: returnedSubtotal, tax: returnedTax, total: returnedSubtotal + returnedTax },
    remaining: { subtotal: remainingSubtotal, tax: remainingTax, total: remainingSubtotal + remainingTax },
  };
}

export interface FinalizeReturnDeps {
  updateOrder: (id: string, updates: any) => void | Promise<void>;
  addCustomOrder: (data: any) => void | Promise<any>;
}

export interface FinalizeReturnOptions {
  /** 検品で記録された不足・破損 */
  itemIssues?: any[];
  /** 残存注文に設定するステータス（既定: 一部返却） */
  remainingStatus?: string;
  /** 倉庫検品によって確定したことを示す */
  inspectedByWarehouse?: boolean;
  /** お客様の回収（返却）サイン。回収書 PDF に表示される。 */
  collectionSignature?: string;
}

/**
 * 返却を注文に確定させる。
 * - 全量返却: 元注文を「返却済」に更新。
 * - 一部返却: 元注文を残存分へ更新（既定ステータス「一部返却」）し、
 *   返却分を別注文（返却済）として作成する。
 */
export function finalizePartialReturn(
  order: any,
  returnQuantities: Record<string, number>,
  actualReturnDate: string,
  deps: FinalizeReturnDeps,
  options: FinalizeReturnOptions = {}
): ReturnSplit {
  const split = computeReturnSplit(order, returnQuantities, actualReturnDate);
  const { itemIssues, remainingStatus = "一部返却", inspectedByWarehouse, collectionSignature } = options;

  if (split.returningEverything) {
    const tempOrder = {
      ...order,
      items: split.returnedItemsList,
      subtotal: split.returned.subtotal,
      tax: split.returned.tax,
      total: split.returned.total,
      status: "返却済",
      actualReturnDate,
      invoiceBlocks: undefined,
    };
    const newInvoiceBlocks = getOrGenerateInvoiceBlocks(tempOrder);

    deps.updateOrder(order.id, {
      items: split.returnedItemsList,
      subtotal: split.returned.subtotal,
      tax: split.returned.tax,
      total: split.returned.total,
      status: "返却済",
      actualReturnDate,
      invoiceBlocks: newInvoiceBlocks,
      ...(itemIssues ? { itemIssues } : {}),
      ...(inspectedByWarehouse ? { inspectedByWarehouse: true } : {}),
      ...(collectionSignature ? { collectionSignature } : {}),
    });
  } else {
    const tempRemaining = {
      ...order,
      items: split.remainingItemsList,
      subtotal: split.remaining.subtotal,
      tax: split.remaining.tax,
      total: split.remaining.total,
      status: remainingStatus,
      invoiceBlocks: undefined,
    };
    const remainingInvoiceBlocks = getOrGenerateInvoiceBlocks(tempRemaining);

    deps.updateOrder(order.id, {
      items: split.remainingItemsList,
      subtotal: split.remaining.subtotal,
      tax: split.remaining.tax,
      total: split.remaining.total,
      status: remainingStatus,
      invoiceBlocks: remainingInvoiceBlocks,
      ...(itemIssues ? { itemIssues } : {}),
      ...(inspectedByWarehouse ? { inspectedByWarehouse: true } : {}),
    });

    const tempCustomOrder: any = {
      items: split.returnedItemsList,
      total: split.returned.total,
      subtotal: split.returned.subtotal,
      tax: split.returned.tax,
      deliveryLocation: order.deliveryLocation,
      deliveryDate: order.deliveryDate,
      siteName: order.siteName,
      constructionNumber: order.constructionNumber,
      companyName: order.companyName,
      personName: order.personName,
      rentalStartDate: order.rentalStartDate,
      rentalEndDate: order.rentalEndDate,
      actualReturnDate,
      date:
        new Date().toLocaleDateString("ja-JP") +
        " • " +
        new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
      status: "返却済",
    };
    if (itemIssues && itemIssues.length) tempCustomOrder.itemIssues = itemIssues;
    const customInvoiceBlocks = getOrGenerateInvoiceBlocks(tempCustomOrder);

    deps.addCustomOrder({
      ...tempCustomOrder,
      orderNumber: `${order.orderNumber}-R-${Math.floor(Math.random() * 1000)}`,
      invoiceBlocks: customInvoiceBlocks,
      ...(collectionSignature ? { collectionSignature } : {}),
      ...(inspectedByWarehouse ? { inspectedByWarehouse: true } : {}),
    });
  }

  return split;
}
