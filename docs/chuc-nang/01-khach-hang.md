# 顧客サイト（お客様向け Web：レンタル/販売ストア）

> [← Danh mục chức năng](../CHUC_NANG.md)

> 全ページが `useIsDesktop()` で PC/スマホを分岐する（`Home` → `HomeMobile` / `HomeDesktop` 等）。以下は主にモバイル実装を基準に記述。デスクトップ版は `src/pages/desktop/*Desktop.tsx` にロジックの対応版がある。データ層（Cart/Order/User の各 Context・`OrderBus`）は共通なので、**ロジックを直す時は必ず両方（mobile と desktop）を同期して直すこと**。
> `SALES_ENABLED = false`（`src/config/features.ts`）で運用中＝**レンタル専用**。購入トグル・販売価格・「今すぐ購入」は全ページで非表示。カートに入る `type` は `(!SALES_ENABLED || product.rentPrice) ? 'rent' : 'buy'` で実質常に `'rent'`。

## 商品閲覧・検索（ホーム / カテゴリー / 商品一覧 / 商品詳細）
- **Làm gì**: 商品をカテゴリ・グループ・検索・注目商品で絞って表示し、数量を選んでカートに入れる。商品詳細では日数を入れて概算料金を即時プレビュー。
- **File**: `src/pages/Home.tsx`(`HomeMobile`), `Categories.tsx`(`CategoriesMobile`), `ProductList.tsx`(`ProductListMobile`), `ProductDetail.tsx`(`ProductDetailMobile`); 補助 `src/utils/productUtils.ts`(`getSupplyCategories`,`getCategoryIcon`,`isVehicleCategory`), `src/context/ProductContext.tsx`, `FeaturedContext.tsx`。
- **Luồng / dữ liệu**:
  - `ProductList` は URL クエリで表示内容を切替: `?category=`, `?featured=true`, `?search=`, `?group=supplies`(車両以外) / `?group=vehicles`(車両)。`isVehicleCategory(p.category)` で supplies/vehicles を判定。
  - 保安車両カテゴリは固定5種（`軽トラック`/`軽バン`/`2tノーマル`/`2tロング`/`2t Wキャブノーマル`）をコードにハードコード。保安用品カテゴリは `getSupplyCategories(products)` で商品から動的に生成。
  - `ProductDetail` の料金プレビューは `calculateRentalPrice(rentPrice, start, end, isVeh, isVeh, rentPriceLongTerm)` を使い、`getMinDays(isVeh)` で最低日数（車両3日 / それ以外10日、内部の閾値は billing 側）に切り上げた `totalBilledDays` を表示。長期割引の閾値は `LONG_TERM_THRESHOLD_DAYS = 17`。
- **⚠️ Lưu ý**:
  - 数量入力は `Math.min(stock, ...)` で在庫クランプ。**在庫0のレンタル品はカート不可**（`ProductDetail` の `outOfStockRent`、`ProductList` の `在庫なし` 表示）。ただしカート投入時の `type` はレンタル固定。
  - `ProductDetail` は全フックの後で `if (!product)` 早期 return する（商品リスト未ロード＝クラウド同期前は「読み込み中」、ロード済みで該当なしのみ「見つかりません」。**削除済み/誤URL で先頭商品にフォールバックしない**）。
  - 各一覧ページの「カートに追加」は非ブロッキングの `triggerToast`（連続追加を妨げない）。`rentalDays:1` を仮で入れるが実日数は Checkout で上書きされる。

## カート（Cart / CartContext）
- **Làm gì**: 選択商品を保持し、数量変更・削除・概算合計（税込）を表示。会計へ進む前段。
- **File**: `src/pages/Cart.tsx`(`CartMobile`,`CartItemView`), `src/context/CartContext.tsx`(`CartProvider`,`useCart`)。
- **Luồng / dữ liệu**:
  - `CartItem` は `id/name/image/rentPrice/rentPriceLongTerm/buyPrice/quantity/type/category/unit` 等。`localStorage["cart_v3"]` に永続化（`safeSetJSON`）。`products` 変化時に最新価格を再ハイドレート。
  - 保証料 `guaranteeFeeFlat` はカート表示時に商品マスタの `isGuarantee`/`guaranteeType`(`'flat'`)/`guaranteeRate`/`guaranteeFees.range1〜6`（数量帯 ≤50/≤100/…/≤250/超）から算出し、item に付与。
  - 概算: `totalRentalPrice + totalBuyPrice + totalGuaranteeFee = subtotal`、`tax = Math.floor(subtotal * getTaxRate())`（10%）。カートには**日付がない**ため `calculateRentalPrice` を日付 undefined で呼び、最低日数分の暫定額。
- **⚠️ Lưu ý**:
  - **アカウント切替/ログアウトでカートを空にする**（`CartContext` の `prevUserIdRef` ロジック）。初回マウント（リロード）と `null→実ユーザー`（ユーザーキャッシュ遅延ハイドレーション）は切替扱いにしない。共有端末での誤発注防止なので**安易に消さないよう条件を崩さないこと**。
  - `addToCart`/`updateQuantity`/`setQuantityAmount` は在庫上限クランプ（在庫5に10入れても5に丸め）。StrictMode 二重呼び出しでの二重加算を避けるため mutate せず新オブジェクトで置換。
  - カートの合計は「概算」。**確定額は Checkout の日付選択後**。文言「実際の料金はご利用日数で確定」を消さない。

## チェックアウト（注文情報入力・見積書発行）
- **Làm gì**: 現場情報と各種日付を入力し、日数から確定料金を計算して注文内容を確認画面へ渡す。御見積書PDFも発行できる。
- **File**: `src/pages/Checkout.tsx`(`CheckoutMobile`); 補助 `src/utils/billing.ts`(`calculateRentalPrice`,`getTaxRate`), `src/utils/jpHolidays.ts`(`isBusinessDay`,`nextBusinessDay`,`nonBusinessDayReason`), `src/utils/pdfMultiPage.ts`(`elementToPdf`)。
- **Luồng / dữ liệu**:
  - 入力: `siteName`(現場名/必須), `constructionNumber`(工事番号/必須), `rentalStartDate`, `rentalEndDate`, `deliveryDate`(納品希望日/必須), `deliveryLocation`(必須), `notes`。会社名・担当者名は `profile` から**読み取り専用**（変更不可）。
  - 各明細に `calculateRentalPrice(...)` の結果を格納: `monthlyBreakdown`(月別分割), `calculatedPrice`(1点単価・保証料は含めない), `rentalDays=totalActualDays`, `billedDays=totalBilledDays`。合計は `subtotal(=レンタル+購入+保証料) → tax → total`。
  - `earliestDeliveryDate`: 当日14:00以降は翌営業日から。全日付は営業日（土日祝不可）チェック（`pickBusinessDate`）。`isDateRangeValid` は「開始≤終了」「納品≤開始」「各日付が最短以降＆営業日」を要求。
  - 「注文を確定する」→ `setProfile({...address:deliveryLocation})` 後 `navigate("/checkout-confirm", {state:{orderData}})`。`orderData` に `userId/userEmail/userPhone`(発注アカウント)を同梱。
- **⚠️ Lưu ý**:
  - `isFormValid` は `items` ではなく **`updatedItems`（数量1以上）** で判定（数量0行だけの ¥0 注文の作成防止）。
  - **料金計算・見積PDF は Checkout で完結**。`calculatedPrice` は「1点あたり」なので表示は `× quantity`。**保証料は `calculatedPrice` に含めず `subtotal` に別途加算**（他画面での二重計上に注意）。
  - 見積書PDFは非表示の `estimateRef` テンプレを `elementToPdf` でA4・複数ページ分割。発行前に `isFormValid` を要求。

## 注文確認・確定（CheckoutConfirm / OrderConfirmation / OrderContext.addOrder）
- **Làm gì**: 内容を最終確認して発注を確定し、注文番号を採番して完了画面を表示。
- **File**: `src/pages/CheckoutConfirm.tsx`(`CheckoutConfirmMobile`,`handleOrderConfirm`), `OrderConfirmation.tsx`(`OrderConfirmationMobile`), `src/context/OrderContext.tsx`(`addOrder`,`useOrders`)。
- **Luồng / dữ liệu**:
  - `CheckoutConfirm` は `location.state.orderData` が無ければ `<Navigate to="/cart">`。`addOrder(orderData)` → `clearCart()` → `navigate("/order-confirmation",{state:{order},replace:true})`。
  - `addOrder` が採番: `id = id-<Date.now()>-<rand6>`、`orderNumber = #ORD-<年>-<Date.now()下6桁>`、`date`(ja-JP)、`status="処理中"`。`setOrders` に前置し `OrderBus.push("orders", newOrder)` で **admin/staff へブロードキャスト**。
  - `OrderConfirmation` は `state.order` が無ければ `/orders` へリダイレクト（リロードで空¥0画面を出さない）。
- **⚠️ Lưu ý**:
  - `handleOrderConfirm` に `isSubmitting` 連打ガード（二重注文防止）。失敗時はスピナー解除＋再試行案内。
  - **ID/注文番号はミリ秒＋乱数で採番**（短い乱数だとソフト削除レコードと衝突し `ON DUPLICATE KEY` で「復活」する事故が起きるため。**桁を短くしないこと**）。
  - `OrderConfirmation` の明細は `calculatedPrice` 優先、無ければ最低請求日数（車両3/他10）でフォールバック計算。保証料は `subtotal` に内包されるので別行で明示（`items.reduce(guaranteeFeeFlat)`）。

## 注文履歴（OrderHistory）
- **Làm gì**: 本人の注文を「処理中 / 履歴」タブと検索で表示。ステータスに応じた進捗バーとラベルを描画。
- **File**: `src/pages/OrderHistory.tsx`(`OrderHistoryMobile`,`OrderCard`,`getOrderDisplayProps`); 補助 `src/utils/orderStatus.ts`(`isClosedOrder`), `returnLabels.ts`(`formatStatusWithReturnRequest`), `orderSort.ts`(`byOrderDateDesc`)。
- **Luồng / dữ liệu**:
  - **アカウント分離**: `orders.filter(o => currentUser && o.userId === currentUser.id)`（同一会社の別ユーザーの注文は出さない）。
  - タブ振り分け: 「処理中」= `!isClosedOrder(status) && status!=="一部返却"`；「履歴」= `isClosedOrder(status) || status==="一部返却"`。
  - `PAGE=30` の段階表示（`visibleCount`、「もっと見る」）。ステータスラベルは `formatStatusWithReturnRequest(status, returnRequestType)`（例「検品待ち 一括返却」）。
- **⚠️ Lưu ý**:
  - 完了/キャンセルが「処理中」に残る不具合の対策として**必ず `isClosedOrder` を使う**（`isFullyReturned` は完了/キャンセルを含まないため単独では不十分）。`一部返却` は履歴側に置く特例。

## 注文詳細・期間延長・帳票閲覧（OrderDetail）
- **Làm gì**: 1注文のステータス進捗・基本情報・明細・月別請求内訳・現場/検品写真を表示。レンタル操作（期間延長・返却手続き）と帳票（納品書/請求書/回収書）閲覧の起点。
- **File**: `src/pages/OrderDetail.tsx`(`OrderDetailMobile`,`OrderItem`); 補助 `src/utils/billing.ts`(`getOrGenerateInvoiceBlocks`,`computeExtension`), `extendRental.ts`(`canExtendOrder`,`validateExtensionDate`,`extensionMinDate`,`computeExtension`), `orderStatus.ts`(`isFullyReturned`,`isReturnEligible`), `components/DocumentViewer.tsx`。
- **Luồng / dữ liệu**:
  - **IDOR 対策（重要）**: `isPrivileged = role in {admin,staff}`。非特権は `!!currentUser?.id && !!found.userId && found.userId === currentUser.id` の時のみ `order` を返す（deny-by-default。`undefined===undefined` の素通りを防ぐ）。`ReturnItems` も同一ロジック。
  - ステッパー: `statuses=["ご注文","準備中","配送中","レンタル中","返却・完了"]`、`activeStep`/`statusColor` を status から算出。`isRentalActive`(キャンセル/返却済/完了以外) かつ `hasRentItems` の時のみ「レンタル操作」表示。
  - 期間延長: モーダルで `newEndDate` を入力→`extensionPreview`(useMemo, `computeExtension` で確定と同一計算)→`handleConfirmExtension` が `canExtendOrder`＋`validateExtensionDate` を検証し `updateOrder` で `rentalEndDate/items/subtotal/tax/total/invoiceBlocks` を更新。
  - 返却手続きボタンの表示条件 `canStartReturn = isReturnEligible(status) || status==="検品待ち" || status==="回収中"`（未納品を検品待ちへ送れないように）。
  - 帳票: 納品書は `activeStep>=3` から。請求書は返却済/一部返却/完了 または `blocks.length>0` で表示、複数期あれば月選択モーダル。回収書は返却後のみ。倉庫検品記録は `OrderBus.subscribe("returnInspections")` を購読し、`orderId`/`orderNumber`/`baseNum`(=orderNumber の `-R-` 前) で自注文分を照合表示。
- **⚠️ Lưu ý**:
  - **延長プレビューと確定額は必ず `computeExtension` で同一計算**（ズレ根絶／手動単価按分・入金済み印/手動費用の引き継ぎ込み）。返却手続き中（回収中/検品待ち等）は `canExtendOrder=false` で延長不可（返却中の再課金防止）。
  - 明細行合計は `calculatedPrice × qty`（無い旧注文は `monthlyBreakdown` 合計→`rentPrice×日数` の順でフォールバック）。
  - `月別請求内訳` の block は `getOrGenerateInvoiceBlocks(order)`。`status`=`accumulating/pending/paid`、単価は `Price_A`(通常)/`Price_B`(長期割引)。

## レンタル品返却フロー（ReturnOrders → ReturnItems → ReturnShipping → ReturnConfirmation）
- **Làm gì**: 返却対象注文の選択→返却品目/数量の選択（一括/一部）→返却方法・日付・写真→最終確認→送信。持込は倉庫検品キューへ、集荷はスタッフの回収タスクへ登録する。
- **File**: `src/pages/ReturnOrders.tsx`, `ReturnItems.tsx`, `ReturnShipping.tsx`, `ReturnConfirmation.tsx`(各 `*Mobile`); 補助 `orderStatus.ts`(`isReturnEligible`), `billing.ts`(`calculateRentalPrice`,`getTaxRate`), `lib/orderBus.ts`。
- **Luồng / dữ liệu**:
  - `ReturnOrders`: 本人（`o.userId===currentUser.id`）かつ `isReturnEligible(status)` かつ **未返却レンタル品が残る**(`item.type==='rent' && (returnedQuantity||0) < quantity`)注文のみ列挙。
  - `ReturnItems`: `returnType` = `all`(一括) / `partial`(一部)。`returnQuantities`(item.id→数量) を管理。一部返却は空欄を `-1` センチネルで保持し、`次へ` で `Math.max(0,...)` に正規化して渡す（合計の負値化・+1水増しを防ぐ）。**一部返却は「直接持ち込み」のみ**（業者集荷不可）と明記。
  - `ReturnShipping`: `method` = `direct`(持込) / `pickup`(集荷)。`returnType==="partial"` なら `direct` 固定・pickup ラジオ非表示。返却日レンジは `[rentalStartDate, max(rentalEndDate, 今日)]`（延滞でも本日まで選択可）。状態写真は最大5枚、`readImageAsDataUrl`(base64)で `Promise.allSettled`（1枚失敗で全滅させない）。
  - `ReturnConfirmation.handleSubmit`（核心）:
    - `actualReturnDate = pickupDate || 今日`。各 item を「返却分」「残存分」に割り、返却分は `calculateRentalPrice(..., start, actualReturnDate, ...)`、残存分は `..., start, rentalEndDate, ...` で再計算。
    - **全量返却判定は `totalRemainingQty === 0`（数量ベース）**。価格0品目をリストから落とす実装だと `length` では誤判定するため。
    - `usePickupFlow = (method==="pickup" && returningEverything)` → `updateOrder(status:"回収中", staffStatus:"回収予定", requestedReturn, rentalEndDate:pickupDate, notes に回収リクエスト)`。
    - それ以外（**持込＝全量・一部いずれも**）→ `OrderBus.push("walkinReturns", {... stage:"reception", returningEverything ...})` で倉庫の2段階検品キューへ、注文は `status:"検品待ち"`。
    - 最後に `OrderBus.flush(8000)` でサーバー反映を確認してから成功/送信待ちを出し `/orders` へ。
- **⚠️ Lưu ý**:
  - **返却時点では確定・請求分割しない**。持込は倉庫スタッフの最終検品（`StaffDashboard.completeReturn → finalizePartialReturn`）で確定する。ここで金額を確定させないこと。
  - `walkinReturns` の ID は決定的 `WIN-<英数字化した order.id>`（同時/二重送信を upsert で1件に集約、幽霊伝票・二重 `-R` 注文防止）。**削除→push の順にすると HTTP 競合で新チケットが消える**ため、既存同ID行は push の upsert に任せる。
  - 倉庫が既に一次受付済み（`stage==="recheck"` or `receptionAt` あり）のチケットは、お客様の再提出で上書きさせない（検品結果保護、アラート出して離脱）。
  - `pickup→walkin` / `walkin→pickup` 切替時に旧タスク残渣を掃除する分岐がある（`staffStatus`/`requestedReturn` のクリア、旧 walkin 行の削除）。

## マイページ・個人情報・認証（Profile / PersonalInfo / UserContext）
- **Làm gì**: プロフィール表示とメニュー起点、登録情報（会社名/氏名/メール/電話/住所/アバター）の編集、ログイン/ログアウト。
- **File**: `src/pages/Profile.tsx`(`ProfileMobile`,`ProfileMenuLink`), `PersonalInfo.tsx`(`PersonalInfoMobile`,`handleSave`), `src/context/UserContext.tsx`(`login`,`logout`,`setProfile`,`isEmailTaken`,`addUser`)。
- **Luồng / dữ liệu**:
  - `Profile` メニュー: 個人情報→`/personal-info`、注文履歴→`/orders`、レンタル品返却→`/return`。ロールバッジは `customer`→「企業代表者」、それ以外（`customer_staff`）→「注文担当者」。設定/ヘルプは準備中アラート。
  - `PersonalInfo.handleSave`: 姓名必須、メール形式チェック、`isEmailTaken(email, profile.id)` で重複拒否（重複メールは `login` が fail-closed になり自分がログイン不能になるため）。`customer_staff`(=`isSubUser`)は**会社名を変更不可**（会社マスタ共有項目の破壊防止）。保存後 `OrderBus.flush(8000)` で同期待ちを明示。
  - `UserContext`: users マスタは `OrderBus` の `"users"` ストアが正。セッションは `localStorage["asahi.sessionUserId"]`。`login(loginId,password,allowedRoles?)` は **一致が1件でない（0件/複数）と fail-closed**、空パスワード不可、`inactive` 不可、role 制限。成功時 `acquireUserToken` で署名付きトークン取得。
- **⚠️ Lưu ý**:
  - `profile` はログイン中なら `currentUser`、未ログインは `fallbackProfile`（admin 画面など認証ゲート外を壊さないため）。`setProfile` は既存ユーザーなら `OrderBus.patch("users")` ＋セッション張り直し（Checkout の連絡先更新もこの経路）。
  - **顧客サイトのログインは `customer`/`customer_staff` のみ許可**の想定（`login` の `allowedRoles` は呼び出し側＝認証ゲートで指定）。social/共有プレースホルダメール（`contact@example.com` 等）は `addUser` で一意な `usr-<id>@asahi.local` に置換される。
  - `logout` は次ユーザーへトークンが引き継がれないよう `setUserToken(null)` を必ず呼ぶ。

補足（データ層の共通ゴタチャ、修正時に踏みやすい点）:
- `OrderContext` は `localStorage["order_history_v3"]` へベストエフォート保存。容量超過時は `data:` 大文字列を除いた軽量版で再試行し、それでも失敗すればキャッシュを諦める（**サーバー(MySQL)が正本**、画像は次回ポーリングで再取得）。`setItem` 例外を握りつぶさないと画面全体がクラッシュする。
- `addCustomOrder` は呼び出し側が安定IDを与えればそれを使う（返却分 `-R` 注文は請求ブロックIDを id 基準で発番するため、ここで作り直すと `block-<id>` と `order.id` が食い違い消込が混線する）。返却分も `OrderBus.push("orders")` する（しないと admin 側で `-R` 注文が見えなくなる）。
- ファイルパス（すべて repo-relative）: 上記各 `src/pages/*.tsx` と `src/pages/desktop/*Desktop.tsx`、`src/context/{Order,User,Cart,Product,Featured}Context.tsx`、`src/utils/{billing,orderStatus,returnLabels,productUtils,extendRental,jpHolidays,orderSort,pdfMultiPage}.ts`、`src/lib/orderBus.ts`、`src/config/features.ts`。

---
