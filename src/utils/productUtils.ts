export const VEHICLE_CATEGORIES = ['軽トラック', '軽バン', '2tノーマル', '2tロング', '2t Wキャブノーマル'];

export function isVehicleCategory(category: string | undefined): boolean {
  if (!category) return false;
  // Also support '保安車両' just in case it's used somewhere
  if (category === '保安車両') return true;
  return VEHICLE_CATEGORIES.includes(category);
}

/**
 * 保安用品カテゴリーごとの Material Symbols アイコン名。
 * ここに無い（管理画面で新規追加された）カテゴリーは getCategoryIcon の
 * デフォルトアイコンが使われる。
 */
export const SUPPLY_CATEGORY_ICONS: Record<string, string> = {
  'カラーコーン': 'change_history',
  'コーンバー': 'remove',
  'バリケード': 'fence',
  '工事灯': 'traffic',
  '矢印板': 'arrow_forward',
  '工事看板': 'signpost',
  'ウェイト': 'fitness_center',
  '車両衝突緩衝材': 'health_and_safety',
  '歩行者用マット': 'texture',
  '回転灯': 'emergency',
  'ガス検知器': 'gas_meter',
  'セイフティブロック': 'vertical_align_top',
  '発電機': 'bolt',
  'その他': 'category',
};

/** カテゴリー名に対応するアイコンを返す（未知のカテゴリーは汎用アイコン）。 */
export function getCategoryIcon(category: string | undefined): string {
  if (!category) return 'category';
  return SUPPLY_CATEGORY_ICONS[category] || 'category';
}

/**
 * 商品リストから保安用品（車両以外）のカテゴリー一覧を重複なしで抽出する。
 * 管理画面で商品を追加するとここに自動的に反映される。
 */
export function getSupplyCategories(
  products: ReadonlyArray<{ category?: string } | null | undefined> | null | undefined
): string[] {
  return Array.from(
    new Set(
      (products || [])
        .map((p) => p?.category)
        .filter((c): c is string => !!c && !isVehicleCategory(c))
    )
  );
}
