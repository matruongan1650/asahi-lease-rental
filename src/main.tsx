import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './lib/taxSync'; // 設定の消費税率を請求計算へ反映（side-effect）
import { installNumberInputWheelGuard } from './utils/numberInputWheelGuard';

// 数値入力上のマウスホイールで値が誤変更され、ページがスクロールしない問題を防ぐ（在庫数等の入力対策）。
installNumberInputWheelGuard();

// 一度だけ実行: 既存の注文データ（admin/staff/customer 共通）をローカルから削除する。
// XServer 実データ運用へ移行したため、古いキャッシュをクリアする。
// 再実行したい場合は localStorage の "orders_reset_v1" を削除。
try {
  if (!localStorage.getItem('orders_reset_v1')) {
    localStorage.removeItem('order_history_v3'); // 顧客側 (OrderContext)
    localStorage.removeItem('asahi.orders');     // admin/staff 側 (OrderBus)
    localStorage.removeItem('asahi.seeded_b2b_orders'); // seed ガードフラグ
    localStorage.setItem('orders_reset_v1', '1');
  }
} catch (e) {
  console.warn('[main] 注文キャッシュのクリアに失敗しました。', e);
}

// 一度だけ実行: 過去に seed されたメンテナンスのモックデータを削除する。
// メンテ(maintenance)は実データ運用。車両(保安車両)は admin/顧客 双方で表示する必要があるため
// クリア対象から除外し、VehicleContext で再 seed する。再実行したい場合は "vehicles_maint_reset_v1" を削除。
try {
  if (!localStorage.getItem('vehicles_maint_reset_v1')) {
    localStorage.removeItem('asahi.maintenance');
    localStorage.setItem('vehicles_maint_reset_v1', '1');
  }
} catch (e) {
  console.warn('[main] メンテキャッシュのクリアに失敗しました。', e);
}

// 一度だけ実行: 過去に seed された持込返却（持込対応）のモックデータを削除する。
// 持込返却は実データ運用（顧客が直接持ち込んだ返却のみ）へ移行したため、古い seed を消す。
// 再実行したい場合は "walkin_reset_v1" を削除。
try {
  if (!localStorage.getItem('walkin_reset_v1')) {
    localStorage.removeItem('asahi.walkinReturns');
    localStorage.setItem('walkin_reset_v1', '1');
  }
} catch (e) {
  console.warn('[main] 持込返却キャッシュのクリアに失敗しました。', e);
}

// 一度だけ実行: 実データ運用への完全移行（モック全廃）に伴い、
// 過去に seed されたモックコレクションと注文キャッシュをローカルから削除する。
// サーバー(MySQL)側は別途クリア済み。再実行したい場合は "mock_purge_v1" を削除。
try {
  if (!localStorage.getItem('mock_purge_v1')) {
    [
      'asahi.assets', 'asahi.warehouse', 'asahi.stocktake',
      'asahi.stockIn', 'asahi.stockOut', 'asahi.repairs',
      'asahi.customers', 'asahi.suppliers', 'asahi.vendors',
      'asahi.fieldReports', 'asahi.stockMoves',
      'asahi.orders', 'asahi.walkinReturns', 'asahi.returnInspections',
      'order_history_v3',
    ].forEach((k) => localStorage.removeItem(k));
    localStorage.setItem('mock_purge_v1', '1');
  }
} catch (e) {
  console.warn('[main] モックデータの一括クリアに失敗しました。', e);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
