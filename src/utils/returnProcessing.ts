/**
 * returnProcessing.ts
 *
 * 返却（一部／全部）の金額計算と注文への確定処理を共通化する。
 * 顧客の返却確定（ReturnConfirmation）と、倉庫検品完了時の確定（StaffDashboard）の
 * 双方から再利用できるように、計算（純粋関数）と適用（副作用）を分離している。
 */
import { calculateRentalPrice, getOrGenerateInvoiceBlocks, getTaxRate, regenerateBlocksPreservingState } from "./billing";
import { isVehicleCategory } from "./productUtils";

/**
 * 手動単価(priceOverride)の按分。返却で期間が短くなった returned 分に対し、
 * 当初期間の標準価格に対する override 比率を、短縮期間の標準価格(newTotal)へ適用する。
 * 例: 当初標準3万→override2.4万(=0.8)、半月返却で標準1.5万 → 1.5万×0.8=1.2万。
 * 当初標準が0/未override は按分せず newTotal をそのまま返す。
 */
export function prorateOverride(item: any, order: any, newTotal: number, hasVehicle: boolean): number {
  if (!item?.priceOverride || !(Number(item.calculatedPrice) > 0)) return newTotal;
  const naturalOld = calculateRentalPrice(
    item.rentPrice || 0,
    order.rentalStartDate,
    order.rentalEndDate,
    hasVehicle,
    isVehicleCategory(item.category),
    item.rentPriceLongTerm,
  ).totalPrice;
  return naturalOld > 0 ? Math.round(newTotal * (Number(item.calculatedPrice) / naturalOld)) : Number(item.calculatedPrice);
}

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
        // 手動単価(priceOverride)は返却で期間が短くなった分だけ実日数比で按分して維持する
        //（ユーザー方針=早期返却は日数比で減額。値引きが標準価格に戻り過大請求になるのを防ぐ）。
        const calc = prorateOverride(item, order, totalPrice, hasVehicle);
        returnedTotalRentalPrice += calc * returningQty;

        returnedItemsList.push({
          ...item,
          quantity: returningQty,
          returnedQuantity: returningQty,
          actualReturnDate,
          calculatedPrice: calc,
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
        // 残存側は期間(開始〜終了予定)が変わらないため、手動単価はそのまま維持する。
        const calc = (item.priceOverride && Number(item.calculatedPrice) > 0) ? Number(item.calculatedPrice) : totalPrice;
        remainingTotalRentalPrice += calc * remainingQtyToKeep;

        remainingItemsList.push({
          ...item,
          quantity: remainingQtyToKeep,
          returnedQuantity: 0,
          calculatedPrice: calc,
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
  /** 本サイクルで実際に在庫へ戻した数量（注文明細ID別）。一部返却の継続（残存）注文の
   *  stockDeductedQty 予算をこの分だけ減算し、次サイクル以降の戻し上限を正しく引き継ぐ
   *  （過剰受注×複数回部分返却での over-restock 防止）。 */
  restockedByItem?: Record<string, number>;
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
  const { itemIssues, remainingStatus = "一部返却", inspectedByWarehouse, collectionSignature, collectionPhotos, extraFields = {}, restockedByItem = {} } = options;
  // 分割後の各注文にも「元注文の最低課金日数基準(車両有無)」を刻む。車両と非車両が別注文に
  // 分かれても基準が 3日↔10日 でブレず、請求ブロックの明細と総額が一致する(C9)。
  const minDaysHasVehicle = (order.items || []).some(
    (i: any) => i && i.type === "rent" && isVehicleCategory(i.category),
  );
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
      // ブロック生成は「未クローズ」ステータスで行う。返却済で生成すると全ブロックが status:"paid" で
      // 生まれ、返却分の請求が最初から入金済み扱いになり AR/延滞に出ない(C8)。実際の入金状態は
      // 下の regenerateBlocksPreservingState が旧ブロックから引き継ぐ。
      status: "一部返却",
      minDaysHasVehicle,
      actualReturnDate,
      invoiceBlocks: undefined,
    };
    // 元注文の入金済み印・手動追加費用を月ごとに引き継いでから確定（返却で作り直しても消さない）。
    const newInvoiceBlocks = regenerateBlocksPreservingState(order.invoiceBlocks, getOrGenerateInvoiceBlocks(tempOrder));
    const ft = sumBlocks(newInvoiceBlocks);

    await deps.updateOrder(order.id, {
      items: split.returnedItemsList,
      subtotal: ft.subtotal,
      tax: ft.tax,
      total: ft.total,
      status: "返却済",
      minDaysHasVehicle, // 最低課金日数の基準を注文へ永続化（後続の延長・再生成でも 3⇔10 がブレない）
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
    // 継続（残存）注文の在庫予算を本サイクルの実戻し分だけ減算する（draw-down）。
    // stockDeductedQty は「出庫済みで未だ戻していない数量」を表す予算であり、複数サイクルの部分返却で
    // 据え置くと過剰受注時に出庫した以上に戻して over-restock になる。明細ID（無ければ名称）で突合し、
    // stockDeductedQty が未設定（旧データ）の品目は据え置く（次サイクルは quantity を上限に正しく動く）。
    const remainingItemsDrawnDown = split.remainingItemsList.map((it: any) => {
      const restocked = Number(restockedByItem[it.id] ?? restockedByItem[it.name] ?? 0);
      if (restocked <= 0 || it.stockDeductedQty == null) return it;
      return { ...it, stockDeductedQty: Math.max(0, Number(it.stockDeductedQty) - restocked) };
    });
    // 出庫済み在庫を本サイクルで全量戻し切った（残予算0）場合のみ、継続注文に stockRestored を立てて
    // 以後の二重入庫（admin 救済クローズ settleReturnStock 等）を明示的に防ぐ。残予算>0 なら正当な
    // 残数返却が残るため立てない（立てると次サイクルの正当な戻しがブロックされる）。
    const anyRestocked = Object.values(restockedByItem).some((v: any) => Number(v) > 0);
    const totalRemainingBudget = remainingItemsDrawnDown.reduce(
      (s: number, it: any) => s + (it.stockDeductedQty != null ? Math.max(0, Number(it.stockDeductedQty)) : Number(it.quantity || 0)),
      0,
    );
    const restoredBackstop = anyRestocked && totalRemainingBudget === 0 ? { stockRestored: true } : {};

    const tempRemaining = {
      ...order,
      items: remainingItemsDrawnDown,
      subtotal: split.remaining.subtotal,
      tax: split.remaining.tax,
      total: split.remaining.total,
      status: remainingStatus,
      minDaysHasVehicle,
      invoiceBlocks: undefined,
    };
    // 継続注文も元の入金済み印・手動追加費用を引き継ぐ（部分返却のたびに消さない）。
    const remainingInvoiceBlocks = regenerateBlocksPreservingState(order.invoiceBlocks, getOrGenerateInvoiceBlocks(tempRemaining));
    const rt = sumBlocks(remainingInvoiceBlocks);

    await deps.updateOrder(order.id, {
      items: remainingItemsDrawnDown,
      subtotal: rt.subtotal,
      tax: rt.tax,
      total: rt.total,
      status: remainingStatus,
      minDaysHasVehicle, // 継続注文にも基準を永続化（E4）
      // 一部回収後、継続注文の staffStatus=回収完了 が残ると回収一覧から永久に消える(C23/C5)。
      // 納品済み相当(配送完了)へ戻し、残数の回収タスクが再表示されるようにする。
      staffStatus: "配送完了",
      invoiceBlocks: remainingInvoiceBlocks,
      requestedReturn: {},
      // ★itemIssues は継続注文に載せない（返却分=-R 注文に既に保存済み）。載せると同じ破損/紛失を
      //   継続注文の現場報告からも弁償請求でき、二重請求になる（C15）。表示用途は -R 側で確認する。
      ...(inspectedByWarehouse ? { inspectedByWarehouse: true } : {}),
      ...(collectionSignature ? { collectionSignature } : {}),
      ...restoredBackstop,
      ...photoUpdate,
    });

    // 保証料は「継続レンタル側」の請求にのみ計上する（当初の注文数量ベースの金額を維持）。
    // 返却分（-R 注文）にも guaranteeFeeFlat を引き継ぐと初月請求で二重計上になるため 0 にする。
    const returnedItemsNoGuarantee = split.returnedItemsList.map((i: any) => ({
      ...i,
      guaranteeFeeFlat: 0,
    }));

    const tempCustomOrder: any = {
      // ブロック生成前に安定IDを与える。無いと block.id が `block-undefined-YYYY-MM` になり、
      // 別顧客の -R 注文と衝突して 請求管理 の選択・一括消込が混線する（C9）。addCustomOrder は
      // この id を尊重して同じ値で保存する。
      id: `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
      minDaysHasVehicle,
    };
    if (itemIssues && itemIssues.length) tempCustomOrder.itemIssues = itemIssues;
    // ブロック生成は「未クローズ」ステータスで行う。返却済で生成すると返却分の請求(レンタル料+弁償費)が
    // 最初から status:"paid" で生まれ、AR/延滞に一切出ない(C8)。保存自体は 返却済 のまま。
    const customInvoiceBlocks = getOrGenerateInvoiceBlocks({ ...tempCustomOrder, status: "一部返却" });
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
