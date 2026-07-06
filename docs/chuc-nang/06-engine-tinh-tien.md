# 課金・請求・在庫台帳エンジン（共通ロジック）

> [← Danh mục chức năng](../CHUC_NANG.md)

課金計算（日数・長期割引・最低課金日数）、月次請求ブロックの生成・状態保持、返却/延長時の再計算、請求書 PDF 出力、現物在庫台帳（出庫/入庫）を担う共通ロジック層。管理画面・顧客サイト・スタッフAPK の全経路がこれらの純粋関数を共有し、プレビューと確定・表示と請求のズレを防ぐ。

## レンタル料計算エンジン（calculateRentalPrice）
- **Làm gì**: レンタル開始〜終了日から、月ごとに分割した金額内訳・請求日数・実日数を算出する中心関数。1品目1単位あたりの料金を返す（数量は掛けない）。
- **File**: `src/utils/billing.ts` (`calculateRentalPrice`, `daysBetween`, `parseDateLocal`, `getMinDays`, `LONG_TERM_THRESHOLD_DAYS`).
- **Luồng / dữ liệu**: 月境界ごとに `RentalPeriodDetailed{monthStr, days, discounted, price}` を積む。`daysBetween` は両端含み（+1）。累計日数 `cumActual >= LONG_TERM_THRESHOLD_DAYS(=17)` で長期単価 `rentPriceLongTerm`（Tier B）へ切替。最低課金日数（`getMinDays`: 車両=3 / 非車両=10）は**最初の月ブロックのみ**適用。返り値 `{totalPrice, breakdown, totalBilledDays, totalActualDays}`。
- **⚠️ Lưu ý**: 日付が空/不正/end<start のときは「最低課金日数×単価」のプレビュー値を返す（¥0 でなく minDays 分）。`parseDateLocal` はスラッシュ・ゼロ埋め無し（`2026/6/8`）を許容。正規化しないと breakdown 空＝¥0 事故になる。`hasVehicle`（注文全体に車両があるか）と `isVehicleItem` は別引数だが、最低課金日数は前者のみで決まる。

## 課金終了日の決定（billingEndDate）
- **Làm gì**: 請求の締め日を決める。返却済みなら実返却日、期限超過の未返却なら「本日」まで自動延長（＝自動で延長料金が発生）。
- **File**: `src/utils/billing.ts` (`billingEndDate`, `ACTIVE_RENTAL_STATUSES`).
- **Luồng / dữ liệu**: `order.actualReturnDate` があれば最優先。無ければ、status が `ACTIVE_RENTAL_STATUSES`（配送済み/レンタル中/回収予定/回収中）または `staffStatus==="配送完了"` のとき、返却予定日 < 本日 なら本日まで延長。非アクティブ（処理中・キャンセル等）は `rentalEndDate` のまま。
- **⚠️ Lưu ý**: この自動延長は `ensureMonthlyBreakdowns` / `getOrGenerateInvoiceBlocks` 経由で「未確定注文のみ」効く。キャッシュ済みブロックがある確定注文は `appendRolledForwardMonths` が別途当月まで追記する（先取り請求はしない）。

## 月別内訳の補完・上書き整合（ensureMonthlyBreakdowns）
- **Làm gì**: 各品目に `monthlyBreakdown` が無ければ再計算で補完し、管理者の手動単価上書き（priceOverride/calculatedPrice）を月別内訳へ比例配分して整合させる。
- **File**: `src/utils/billing.ts` (`ensureMonthlyBreakdowns`).
- **Luồng / dữ liệu**: `needsRecompute = breakdown空 || !hasCachedBlocks`。未確定注文は `rentPrice + billingEndDate` から常に作り直す（さかのぼり登録・自動延長・月集合変化を反映）。最低課金基準は `order.minDaysHasVehicle`（分割注文で刻んだ凍結値）を優先。`calculatedPrice != null` のとき、breakdown 合計を `calculatedPrice` へスケール（端数は最終月で吸収）。
- **⚠️ Lưu ý**: **確定注文（invoiceBlocks が存在）は frozen**。breakdown が空のときだけ補完し、`calculatedPrice`/`rentalDays`/`billedDays` は既存値を温存する。作り直すと frozen ブロック合計・PDF 明細・手動単価がズレる。元 items は変更せずコピーを返す。

## 月次請求ブロック生成（getOrGenerateInvoiceBlocks）
- **Làm gì**: 注文から月ごとの請求ブロック `InvoiceBlock` 群を生成/取得する。請求書・総括表・AR 集計の全てがこれを基準にする。
- **File**: `src/utils/billing.ts` (`getOrGenerateInvoiceBlocks`, `appendRolledForwardMonths`, `recalculateInvoiceBlock`).
- **Luồng / dữ liệu**: キャッシュ済み（`order.invoiceBlocks` あり）なら再計算せず、数値を丸め直し → `injectCompensationCharge` / `injectDeliveryCharge` で自動費用注入 → `appendRolledForwardMonths` で当月まで追記。未キャッシュなら `ensureMonthlyBreakdowns` → 月集合を作り、各月ブロックを組む。買切品（buy）は `orderMonthKey` の月に計上。`status`: 完了/全量返却=`paid`、当月以降=`accumulating`、過去=`pending`。燃料補給費（`order.fuelCharge`, id=`fuel-refill`）は最終ブロックへ。
- **⚠️ Lưu ý**: `appendRolledForwardMonths` は**append-only**（既存キャッシュ月は不変）でクローズ注文は凍結。追記は「当月まで」に限定し将来月を先取りしない。追記中間月には自動費用を二重計上しないよう除去する。`orderMonthKey` は `slice(0,7)` を使わず正規表現で "YYYY-MM" を作る（`2026/6/8` でも壊れない）。

## 請求ブロックの再計算（recalculateInvoiceBlock）
- **Làm gì**: 1 ブロックの `subtotal/tax/total` を、基本額＋保証料＋追加費用（課税/非課税）から再計算する。
- **File**: `src/utils/billing.ts` (`recalculateInvoiceBlock`).
- **Luồng / dữ liệu**: 課税対象 = `baseSubtotal + guaranteeFee + 課税ExtraCost`。税額 = `Math.trunc(課税額 × getTaxRate())`。`subtotal` は全 ExtraCost（非課税含む）合算、`total = 課税額 + 非課税ExtraCost + tax`。
- **⚠️ Lưu ý**: 税は `Math.floor` ではなく **`Math.trunc`**（0方向切り捨て）。値引/返金でマイナス課税額が混ざるブロックで floor だと ¥1 過大控除になる。正値では floor と同値。

## 入金状態・手動費用の引き継ぎ（regenerateBlocksPreservingState）
- **Làm gì**: 返却・延長・編集でブロックを作り直しても、admin が付けた入金済み印と手動追加費用を月ごとに引き継ぎ、過少請求・二重請求を防ぐ。
- **File**: `src/utils/billing.ts` (`regenerateBlocksPreservingState`, `AUTO_EXTRA_COST_IDS`).
- **Luồng / dữ liệu**: 旧ブロックを `monthPeriod` で突合。手動 ExtraCost（`fuel-refill`/`compensation-charge`/`delivery-fee` **以外**）を新ブロックへ再付与（同 id は二重付与しない）→ `recalculateInvoiceBlock`。`status`/`paidAt` を継承（`opts.closing=true` なら継承しない＝新サイクル未入金）。新スパンから消えた月の手動費用は最後の新ブロックへ退避。
- **⚠️ Lưu ý**: 返却/延長の確定経路では**必須**（呼ばないと入金済み月が未収に戻る・手動費用が消える）。closing フラグはクローズ遷移時のみ true。新スパンが空だと退避先が無く手動費用を失う → 警告 console.warn を出す。入金済み月が消えると警告する。

## 弁償費・配送料の自動注入（injectCompensationCharge / injectDeliveryCharge）
- **Làm gì**: 破損・紛失の弁償費と配送料を請求ブロックへ ExtraCost として計上する（請求漏れ防止）。
- **File**: `src/utils/billing.ts` (`computeCompensationCharge`, `injectCompensationCharge`, `injectDeliveryCharge`).
- **Luồng / dữ liệu**: `computeCompensationCharge(order, products)` は `order.itemIssues`（missing/broken）× 単価（`compensationPrice ?? buyPrice ?? item.buyPrice`）で算出、報告数量はレンタル数量を上限にクランプ。結果を `order.compensationCharge` に保存（最終検品時に固定）。弁償費（id=`compensation-charge`）は最終ブロック、配送料（`order.delivery`, id=`delivery-fee`）は**先頭ブロックのみ**へ注入。
- **⚠️ Lưu ý**: いずれも冪等（既にあれば再追加しない＝admin の金額編集を保持）。admin が削除した場合は `compensationDismissed` / `deliveryDismissed` / `fuelDismissed` フラグで再注入を抑止（削除の尊重）。配送料は複数月で二重計上しないよう先頭のみ。

## 現物在庫台帳：出庫（deductOrderStock）
- **Làm gì**: 受注確定時にレンタル品・販売品の現物在庫（`products.stock`）を減算し、出庫伝票（stockOut）を残す。
- **File**: `src/utils/stockLedger.ts` (`deductOrderStock`, `adjustProductStock`, `resolveLiveOrder`, `wasDeducted`).
- **Luồng / dữ liệu**: `resolveLiveOrder` で OrderBus 上の最新注文を解決し `stockDeducted`/`stockDeductedAt` を先に patch（連打ガード）。品目ごとに `adjustProductStock(-qty)`。実際に引けた分を `it.stockDeductedQty` に記録（過剰受注で 0 クランプされた分を返却時に水増ししないため）。stockOut 伝票に `qty=actual` を push。
- **⚠️ Lưu ý**: 冪等（`stockDeducted` または旧データの `deliveryConfirmedAt` で二重減算防止）。`products` に無い品目（車両等）は在庫対象外で `stockDeductedQty=0` を明示記録（これが無いと戻し時に quantity フォールバックで幽霊在庫が発生）。在庫不足のまま確定すると console.warn。返り値のフラグは呼び出し側で注文へマージする必要がある。

## 現物在庫台帳：入庫（restoreOrderStock / settleReturnStock）
- **Làm gì**: 倉庫最終検品時に**良品分のみ**在庫へ加算し入庫伝票（stockIn）を残す。回収完了だけでは戻さない。
- **File**: `src/utils/stockLedger.ts` (`restoreOrderStock`, `settleReturnStock`, `issuesByItemId`).
- **Luồng / dữ liệu**: 戻し量 = `min(stillOut, stockDeductedQty予算) - issues[id]`（`stillOut = quantity - returnedQuantity`）。紛失・破損分（issues）と販売品は戻さない。`opts.collect` に品目別の実戻し数を積算（部分返却の draw-down 用）。`settleReturnStock` は未クローズ→クローズ初回遷移でのみ在庫を動かす救済経路。
- **⚠️ Lưu ý**: 冪等（未出庫なら何もしない・`stockRestored` 済みは二重加算しない）。**戻し上限は quantity ではなく `stockDeductedQty`**（過剰受注 0 クランプ分を戻さない）。商品が見つからず戻せない分は collect に積算しない（幽霊減算防止）＋console.warn。`settleReturnStock`: 納品済み（`deliveryConfirmedAt` あり）のキャンセルは在庫を戻さない（倉庫に無い在庫の水増し防止）。納品前キャンセル（出庫取消）のみ `includeBuy` で販売品も戻す。closed→closed 遷移は在庫を動かさない。

## 返却分割の計算・確定（computeReturnSplit / finalizePartialReturn）
- **Làm gì**: 返却数量から「返却分／残存分」の品目リストと金額を計算（純粋関数）し、注文へ確定する。全量返却は元注文を返却済へ、一部返却は残存へ更新＋返却分を別注文（-R）として作成。
- **File**: `src/utils/returnProcessing.ts` (`computeReturnSplit`, `finalizePartialReturn`, `prorateOverride`).
- **Luồng / dữ liệu**: 返却数は貸出中残数（`quantity - returnedQuantity`）を上限にクランプ。紛失（missing）分は残存レンタルから除外（課金停止＋弁償費との二重課金防止）、破損（broken）は返却数に含む。返却分の金額は `calculateRentalPrice(..., actualReturnDate)`、残存分は元の `rentalEndDate` まで。手動単価は `prorateOverride` で日数比按分（早期返却で値引きが標準価格に戻り過大請求になるのを防ぐ）。確定時は `regenerateBlocksPreservingState` で入金状態を引き継ぎ、注文合計は `sumBlocks`（ブロック合計＝弁償費含む）から取る。
- **⚠️ Lưu ý**: ブロック生成は必ず「未クローズ（一部返却）」ステータスで行う（返却済で生成すると全ブロック `status:"paid"` で生まれ AR/延滞に出ない＝C8）。保存自体は返却済のまま。保証料（`guaranteeFeeFlat`）は継続側のみ、-R 側は 0（二重計上防止＝C15）。itemIssues は -R 注文のみに載せる（継続注文に載せると二重弁償請求）。継続注文は `staffStatus="配送完了"` に戻す（回収一覧から消えないよう＝C23/C5）。-R 注文には安定 `id` と `orderNumber=${orderNumber}-R-${タイムスタンプ下6桁}` を付与（ブロック id 衝突・混線防止）。継続注文は `restockedByItem` で `stockDeductedQty` を draw-down（複数回部分返却の over-restock 防止）。

## 期間延長（computeExtension / canExtendOrder）
- **Làm gì**: レンタル終了日の延長で items・請求ブロック・合計を再計算する（純粋関数、保存しない）。プレビューと確定が同じ関数を使い金額ズレを根絶。
- **File**: `src/utils/extendRental.ts` (`computeExtension`, `canExtendOrder`, `validateExtensionDate`, `extensionMinDate`).
- **Luồng / dữ liệu**: `canExtendOrder`: `isReturnEligible` かつ `requestedReturn` に集荷依頼が無く rent 品目がある。`validateExtensionDate`: 現在の終了日以降、かつ延滞中は本日以降のみ。`computeExtension`: 各 rent 品目を `calculateRentalPrice(..., newEndDate)` で再計算、手動単価は `prorateOverride`、`regenerateBlocksPreservingState` で入金状態継承、合計はブロックがあればブロック合計を採用。
- **⚠️ Lưu ý**: 返却手続き進行中（回収中/検品待ち/`requestedReturn` あり）は延長不可（E6）。延滞注文を本日より前へ延長できない（請求済みブロックと明細の不一致防止＝P1）。最低課金基準は `order.minDaysHasVehicle` 優先（分割注文で 3⇔10 がブレない＝P2/C9）。

## 請求書グルーピング（groupOrdersByCompany）
- **Làm gì**: 注文を「会社 → 担当者（renter）→ 注文」の階層に集計し、各層の小計・税・合計・保証料を算出する。請求総括表・請求書 PDF の入力。
- **File**: `src/utils/rentalInvoiceGrouping.ts` (`groupOrdersByCompany`, `orderSubtotal`, `aggregateTotals`, `normalizeName`).
- **Luồng / dữ liệu**: `companyNameOf` / `personNameOf` は `normalizeName`（全角スペース→半角・連続空白統合）で名寄せ。金額は `getOrGenerateInvoiceBlocks` の合計。`monthPeriod` 指定時はその月ブロックを持つ注文/担当者/会社のみ収集。ソートは会社名・担当者名の ja ロケール順。
- **⚠️ Lưu ý**: **キャンセル注文は請求対象外**（`status==="キャンセル"` を skip）。`safeBlocks` は items 未定義や生成例外を握りつぶして空配列を返す（PDF 生成が落ちない）。ブロックが無い注文は `o.subtotal/tax/total` と品目の `guaranteeFeeFlat` からフォールバック集計。

## 請求書 PDF テンプレート（invoiceTemplatesAdmin）
- **Làm gì**: 請求総括表（会社ごとの表紙）・現場別請求書（注文 1 件）・請求一覧表（全取引先）を HTML で生成し PDF 化する。明細多数時は高さ推定で自動改ページ。
- **File**: `src/utils/invoiceTemplatesAdmin.ts` (`buildCompanySummary`, `renderOrderInvoicePage`, `getInvoiceLineRows`, `buildCompanyInvoice`, `buildAggregatedBreakdown`, `issue*Invoice`, `packByHeight`).
- **Luồng / dữ liệu**: `getInvoiceLineRows(order, monthPeriod?)` が明細行（区分=日額/販売/保証料/その他）を作る。金額は `getOrGenerateInvoiceBlocks` の当月ブロック基準、日額単価 = `breakdown.price / days`。`packByHeight` で全角=1・半角≈0.55 の実効文字幅から折り返し行数を推定し A4（`INVOICE_BODY_BUDGET_PX=540` / `SUMMARY_BODY_BUDGET_PX=640`）に詰める。総括表の総額は 1 枚目のみ、2 枚目以降は「一枚目記載」。発行元・振込先は `companyInfo.ts` から。税率ラベルは `getTaxRate()` に連動。
- **⚠️ Lưu ý**: 全期間（月未指定）の日額単価は**請求日数 `billedDays`** 基準（実日数 `rentalDays` で割ると最低課金日数が隠れ単価が膨らむ）。当月ブロックはあるが breakdown に当月が無い（自動延長で後から月が生えた）場合、`rentPrice` から再計算し金額を `block.baseSubtotal` へ按分整合して明細空欄を防ぐ。受注番号は `receiptNumber`（手入力）優先、無ければ `orderNumber`。総括表の「単価（税抜）」列は実際は注文の税抜合計（手本 PDF に合わせた見出しの流用）。

## PDF 多ページ描画（pdfMultiPage）
- **Làm gì**: HTML 要素群を html2canvas でラスタライズし jsPDF で A4 PDF 化する。1 ページを超えるセクションを行の途中で切らずに自動改ページ。
- **File**: `src/utils/pdfMultiPage.ts` (`renderSectionsToPdf`, `elementToPdf`, `appendCanvasToPdf`, `findSafeCutY`, `mountOffscreen`, `savePdf`).
- **Luồng / dữ liệu**: `A4_PX_WIDTH=794 / A4_PX_HEIGHT=1123`、scale=2 で撮影。`findSafeCutY` は理想切断 Y から上方向へ「暗い画素 2% 未満の行（＝行間余白）」を探し、そこで切る（1 ページの約 22% まで遡る）。`renderSectionsToPdf` は撮影前に `document.fonts.ready`（Noto Sans JP）を待つ。`savePdf` はモバイルで Web Share、PC でダウンロード。
- **⚠️ Lưu ý**: **html2canvas-pro** を使う（旧 html2canvas は Tailwind v4 の `oklch()/oklab()/color-mix()` を解釈できず PDF 生成が全滅）。末尾 2mm 端数（`TAIL_EPSILON_PX`）は新ページを作らない（空白偶数ページの量産防止）。CORS 汚染で getImageData が失敗したら安全切断を諦め idealY で切る。`elementToPdf` は画像（署名・写真）の decode 完了を待つ（空白防止）。

## 自社情報・車両判定・単位（companyInfo / productUtils）
- **Làm gì**: 発行元（自社）情報・振込先の単一の正、車両カテゴリー判定、数量単位・カテゴリーアイコンのユーティリティ。
- **File**: `src/utils/companyInfo.ts` (`COMPANY`, `BANK`); `src/utils/productUtils.ts` (`isVehicleCategory`, `VEHICLE_CATEGORIES`, `getItemUnit`, `getSupplyCategories`, `getCategoryIcon`).
- **Luồng / dữ liệu**: `COMPANY`/`BANK` は請求書・納品書・回収書など全帳票が参照（変更は 1 ファイルで完結）。`isVehicleCategory` は課金の最低課金日数判定（3日）と在庫二重計上防止フィルタに使われる。`getItemUnit` は未設定時 "点"。
- **⚠️ Lưu ý**: `VEHICLE_CATEGORIES` は AdminVehicles の `VEHICLE_CATEGORY_PRESETS` と**必ず一致**させる（不一致だと連動商品 P-<id> が保安用品扱いになり在庫が二重計上される）。`isVehicleCategory` は `'保安車両'` も true として扱う。

---
