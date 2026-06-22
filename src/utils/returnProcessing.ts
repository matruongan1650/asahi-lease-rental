/**
 * returnProcessing.ts
 *
 * 返却（一部／全部）の金額計算と注文への確定処理を共通化する。
 * 顧客の返却確定（ReturnConfirmation）と、倉庫検品完了時の確定（StaffDashboard）の
 * 双方から再利用できるように、計算（純粋関数）と適用（副作用）を分離している。
 */
import { calculateRentalPrice, getOrGenerateInvoiceBlocks, getTaxRate } from "./billing";
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
  actualReturnDate: string,
  itemIssues: any[] = []
): ReturnSplit {
  const hasVehicle = (order.items || []).some(
    (i: any) => isVehicleCategory(i.category) && i.type === "rent"
  );

  // 紛失(missing)した数量は顧客の手元に残らないため、残存レンタルから差し引く。
  // （差し引かないと、紛失分が残存注文でレンタル料を計上され続け、かつ弁償費も請求されて二重課金になる）
  // 破損(broken)は返却数(counted)に含まれて手元から離れるため、ここでは差し引かない。
  const missingByItem: Record<string, number> = {};
  (itemIssues || []).forEach((iss: any) => {
    if (iss && iss.type === "missing") {
      missingByItem[iss.itemId] = (missingByItem[iss.itemId] || 0) + Number(iss.quantity || 0);
    }
  });

  const returnedItemsList: any[] = [];
  const remainingItemsList: any[] = [];

  let returnedTotalRentalPrice = 0;
  let returnedTotalBuyPrice = 0;
  let remainingTotalRentalPrice = 0;
  let remainingTotalBuyPrice = 0;

  (order.items || []).forEach((item: any) => {
    const alreadyReturnedQty = item.returnedQuantity || 0;
    const currentRemainingQty = item.quantity - alreadyReturnedQty;
    // 返却数は「貸出中の残数」を上限にクランプする。倉庫最終検品の QtyStepper は expected+20 まで
    // 入力できるため、数量超過（誤カウント/別物混入）があってもレンタル料が過大請求にならないようにする
    //（超過分は数量超過レポートで扱う。弁償費側 computeCompensationCharge は既にクランプ済み）。
    const returningQty = Math.min(returnQuantities[item.id] || 0, Math.max(0, currentRemainingQty));
    const newRemainingQty = currentRemainingQty - returningQty;

    // 1. 返却される品目
    if (returningQty > 0) {
      // rentPrice が 0/未設定の rent 品目も「返却品」として確実に振り分ける（数量・返却判定が狂わないように）。
      // 価格 0 の品目は計算結果も 0 になるだけで、リストから脱落させない。
      if (item.type === "rent") {
        const { totalPrice, breakdown } = calculateRentalPrice(
          item.rentPrice || 0,
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

    // 2. 残存する品目（rent / buy とも「返却後に残る数」= newRemainingQty を使う）
    //    紛失分は残存から除外（手元に残らない＝レンタル課金を止める。弁償費で別途請求される）。
    const missingQty = missingByItem[item.id] || 0;
    const remainingQtyToKeep = Math.max(0, newRemainingQty - missingQty);
    if (remainingQtyToKeep > 0) {
      if (item.type === "rent") {
        const { totalPrice, breakdown } = calculateRentalPrice(
          item.rentPrice || 0,
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
        // 販売品の残存も「残った数量」で計算（以前は元の数量で計算し過大請求になっていた）。
        remainingTotalBuyPrice += (item.buyPrice || 0) * remainingQtyToKeep;
        remainingItemsList.push({ ...item, quantity: remainingQtyToKeep });
      }
    }
  });

  const taxRate = getTaxRate();
  const returnedSubtotal = returnedTotalRentalPrice + returnedTotalBuyPrice;
  const returnedTax = Math.floor(returnedSubtotal * taxRate);
  const remainingSubtotal = remainingTotalRentalPrice + remainingTotalBuyPrice;
  const remainingTax = Math.floor(remainingSubtotal * taxRate);

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
  /** 現場回収・持込受付時の写真。admin / customer の注文詳細に表示する。 */
  collectionPhotos?: any[];
  /** 確定する注文（全量返却時は元注文、一部返却時は -R 注文）へ追加保存するフィールド。
   *  保安車両の返却記録（vehicleCheckin）や燃料補給費（fuelCharge）など。
   *  fuelCharge は請求書ブロック生成時に extraCosts として計上される。 */
  extraFields?: Record<string, any>;
}

/**
 * 返却を注文に確定させる。
 * - 全量返却: 元注文を「返却済」に更新。
 * - 一部返却: 元注文を残存分へ更新（既定ステータス「一部返却」）し、
 *   返却分を別注文（返却済）として作成する。
 */
export async function finalizePartialReturn(
  order: any,
  returnQuantities: Record<string, number>,
  actualReturnDate: string,
  deps: FinalizeReturnDeps,
  options: FinalizeReturnOptions = {}
): Promise<ReturnSplit> {
  const split = computeReturnSplit(order, returnQuantities, actualReturnDate, options.itemIssues || []);
  const { itemIssues, remainingStatus = "一部返却", inspectedByWarehouse, collectionSignature, collectionPhotos, extraFields = {} } = options;
  const photoUpdate = collectionPhotos && collectionPhotos.length > 0 ? { collectionPhotos } : {};
  // 請求ブロックには弁償費・燃料費などの ExtraCost が注入されるため、注文の subtotal/tax/total は
  // ブロック合計から取る（split.* のままだと弁償費が注文合計に反映されず、明細と総額が食い違う）。
  const sumBlocks = (blocks: any[]) => (blocks || []).reduce(
    (a, b) => ({ subtotal: a.subtotal + (Number(b.subtotal) || 0), tax: a.tax + (Number(b.tax) || 0), total: a.total + (Number(b.total) || 0) }),
    { subtotal: 0, tax: 0, total: 0 },
  );

  // 全量が紛失(missing)で解決したケース（返却品ゼロ・残存ゼロ）は、注文をクローズせず素通りすると
  // 永久に未返却のまま残るため、スキップせず下の returningEverything 経路でクローズ(返却済)させる。
  const hasMissingIssues = (itemIssues || []).some(
    (i: any) => i?.type === "missing" && Number(i?.quantity || 0) > 0,
  );
  if (split.returnedItemsList.length === 0 && !(split.returningEverything && hasMissingIssues)) {
    console.warn("[finalizePartialReturn] No returned items matched the order. Skipping return finalization.", {
      orderId: order?.id,
      orderNumber: order?.orderNumber,
      returnQuantities,
    });
    return split;
  }

  if (split.returningEverything) {
    const tempOrder = {
      ...order,
      ...extraFields,
      items: split.returnedItemsList,
      subtotal: split.returned.subtotal,
      tax: split.returned.tax,
      total: split.returned.total,
      status: "返却済",
      actualReturnDate,
      invoiceBlocks: undefined,
    };
    const newInvoiceBlocks = getOrGenerateInvoiceBlocks(tempOrder);
    const ft = sumBlocks(newInvoiceBlocks);

    await deps.updateOrder(order.id, {
      items: split.returnedItemsList,
      subtotal: ft.subtotal,
      tax: ft.tax,
      total: ft.total,
      status: "返却済",
      actualReturnDate,
      invoiceBlocks: newInvoiceBlocks,
      requestedReturn: {},
      ...extraFields,
      ...(itemIssues ? { itemIssues } : {}),
      ...(inspectedByWarehouse ? { inspectedByWarehouse: true } : {}),
      ...(collectionSignature ? { collectionSignature } : {}),
      ...photoUpdate,
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
    const rt = sumBlocks(remainingInvoiceBlocks);

    await deps.updateOrder(order.id, {
      items: split.remainingItemsList,
      subtotal: rt.subtotal,
      tax: rt.tax,
      total: rt.total,
      status: remainingStatus,
      invoiceBlocks: remainingInvoiceBlocks,
      requestedReturn: {},
      ...(itemIssues ? { itemIssues } : {}),
      ...(inspectedByWarehouse ? { inspectedByWarehouse: true } : {}),
      ...(collectionSignature ? { collectionSignature } : {}),
      ...photoUpdate,
    });

    // 保証料は「継続レンタル側」の請求にのみ計上する（当初の注文数量ベースの金額を維持）。
    // 返却分（-R 注文）にも guaranteeFeeFlat を引き継ぐと初月請求で二重計上になるため 0 にする。
    const returnedItemsNoGuarantee = split.returnedItemsList.map((i: any) => ({
      ...i,
      guaranteeFeeFlat: 0,
    }));

    const tempCustomOrder: any = {
      ...extraFields,
      items: returnedItemsNoGuarantee,
      total: split.returned.total,
      subtotal: split.returned.subtotal,
      tax: split.returned.tax,
      deliveryLocation: order.deliveryLocation,
      deliveryDate: order.deliveryDate,
      siteName: order.siteName,
      constructionNumber: order.constructionNumber,
      companyName: order.companyName,
      personName: order.personName,
      // 発注者を引き継ぐ（-R 返却注文が所有者スコープを持ち、本人の注文履歴に表示され、
      // かつ他社が URL 直打ちで覗けないようにする）。
      userId: order.userId,
      userEmail: order.userEmail,
      userPhone: order.userPhone,
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
    const ct = sumBlocks(customInvoiceBlocks);

    await deps.addCustomOrder({
      ...tempCustomOrder,
      subtotal: ct.subtotal,
      tax: ct.tax,
      total: ct.total,
      // 同一注文を複数回 一部返却するとランダム3桁(0-999)は衝突し得るため、
      // 連番ではなくミリ秒タイムスタンプ基準の一意サフィックスにする（逐次 await なので必ず一意）。
      orderNumber: `${order.orderNumber}-R-${Date.now().toString().slice(-6)}`,
      invoiceBlocks: customInvoiceBlocks,
      ...(collectionSignature ? { collectionSignature } : {}),
      ...(inspectedByWarehouse ? { inspectedByWarehouse: true } : {}),
      ...photoUpdate,
    });
  }

  return split;
}
