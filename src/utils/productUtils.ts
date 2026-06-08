export const VEHICLE_CATEGORIES = ['軽トラック', '軽バン', '2tノーマル', '2tロング', '2t Wキャブノーマル'];

export function isVehicleCategory(category: string | undefined): boolean {
  if (!category) return false;
  // Also support '保安車両' just in case it's used somewhere
  if (category === '保安車両') return true; 
  return VEHICLE_CATEGORIES.includes(category);
}
