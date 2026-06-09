import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// 一度だけ実行: 既存の注文データ（admin/staff/customer 共通）をローカルから削除する。
// Firebase を無効化（ローカル運用）に切り替えたため、古いキャッシュをクリアして
// 注文を空の状態から始める。再実行したい場合は localStorage の "orders_reset_v1" を削除。
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
