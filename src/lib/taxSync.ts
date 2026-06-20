/**
 * taxSync.ts — systemSettings.taxRate（管理画面の設定）を請求計算の税率へ反映する。
 * side-effect import（main.tsx / staff-main.tsx）で読み込むだけで有効になる。
 * 設定が無ければ既定 10% のまま（挙動は変わらない）。
 */
import OrderBus from "./orderBus";
import { setTaxRate } from "../utils/billing";

function applyTaxRateFromSettings(): void {
  try {
    const global = OrderBus.getAll<any>("systemSettings").find((r: any) => r && r.id === "global");
    const pct = Number(global?.taxRate);
    if (pct > 0 && pct < 100) {
      setTaxRate(pct / 100); // "10" → 0.10, "8" → 0.08
    }
  } catch {
    /* ignore */
  }
}

// 設定の変更（サーバー同期含む）に追従する。
OrderBus.subscribe("systemSettings", applyTaxRateFromSettings);
applyTaxRateFromSettings();
