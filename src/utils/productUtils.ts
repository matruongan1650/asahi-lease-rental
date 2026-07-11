// 車両カテゴリーの正規一覧。AdminVehicles の登録プリセット(VEHICLE_CATEGORY_PRESETS)と
// 必ず一致させること。ここに無い車両カテゴリーで車両を登録すると、連動商品(P-<id>)が
// 保安用品として扱われ在庫が二重計上される（棚卸/入出庫/倉庫で本来の防御フィルタが効かない）。
export const VEHICLE_CATEGORIES = ['軽トラック', '軽バン', '2tノーマル', '2tロング', '2t Wキャブノーマル', '2tトラック', '3tロング', '高所作業車'];

/** よく使う数量の単位（数え方）。商品マスタで選択/自由入力できる。 */
export const UNIT_OPTIONS = ['点', '個', '本', '台', '枚', '組', 'セット', '箱', 'm', '巻', '式'];

/** 数量の単位を取得（商品/明細の unit、未設定なら既定 "点"）。 */
export function getItemUnit(x: { unit?: string } | null | undefined): string {
  const u = x && typeof x.unit === 'string' ? x.unit.trim() : '';
  return u || '点';
}

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

/** 顧客サイトの車両カテゴリーカード用の代表画像。無いカテゴリーは商品画像でフォールバックする。 */
export const VEHICLE_CATEGORY_IMAGES: Record<string, string> = {
  '軽トラック': 'https://img1.kakaku.k-img.com/Images/prdnews/2021122%2F20211220190008_457_.jpg',
  '軽バン': 'https://www.carsensor.net/contents/article_images/_66941/every01.jpg',
  '2tノーマル': 'https://www.kaitoriou.net/page/wp-content/uploads/2021/10/aeee94831383a2fa7cc4b3acad0ece5d.png',
  '2tロング': 'https://www.trl-chiba.co.jp/images/car/t3-01-01.jpg',
  '2t Wキャブノーマル': 'https://www.imagiire.co.jp/files/topics/495_ext_05_0_L.png',
};

/** 車両カテゴリー用アイコン（ホームの横スクロールリスト用。未知は local_shipping）。 */
export const VEHICLE_CATEGORY_ICONS: Record<string, string> = {
  '軽トラック': 'local_shipping',
  '軽バン': 'airport_shuttle',
  '2tノーマル': 'directions_car',
  '2tロング': 'local_shipping',
  '2t Wキャブノーマル': 'rv_hookup',
  '2tトラック': 'local_shipping',
  '3tロング': 'local_shipping',
  '高所作業車': 'construction',
};

/** 車両カテゴリー用アイコンを返す。 */
export function getVehicleCategoryIcon(category: string | undefined): string {
  if (!category) return 'local_shipping';
  return VEHICLE_CATEGORY_ICONS[category] || 'local_shipping';
}

/**
 * 商品リストに実在する車両カテゴリー一覧を抽出する（正規一覧 VEHICLE_CATEGORIES の順、
 * リスト外の車両カテゴリー('保安車両'等)は末尾）。ハードコードの5件だと 2tトラック/3tロング/
 * 高所作業車 の商品がカテゴリー導線から到達不能になるため、保安用品と同様に動的化する(C6)。
 */
export function getVehicleCategories(
  products: ReadonlyArray<{ category?: string } | null | undefined> | null | undefined
): string[] {
  const present = new Set(
    (products || [])
      .map((p) => p?.category)
      .filter((c): c is string => !!c && isVehicleCategory(c))
  );
  const ordered = VEHICLE_CATEGORIES.filter((c) => present.has(c));
  const extras = Array.from(present).filter((c) => !VEHICLE_CATEGORIES.includes(c));
  return [...ordered, ...extras];
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
