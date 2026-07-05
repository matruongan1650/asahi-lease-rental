import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./lib/taxSync"; // 設定の消費税率を請求計算へ反映（side-effect）
import { installNumberInputWheelGuard } from "./utils/numberInputWheelGuard";
import ErrorBoundary from "./components/ErrorBoundary";

// 数値入力上のマウスホイールで値が誤変更され、ページがスクロールしない問題を防ぐ。
installNumberInputWheelGuard();
import StaffAuthGate from "./components/staff/StaffAuthGate";
import { OrderProvider } from "./context/OrderContext";
import { ProductProvider } from "./context/ProductContext";
import { VehicleProvider } from "./context/VehicleContext";
import { UserProvider } from "./context/UserContext";
import { StaffStandaloneApp } from "./pages/Staff/StaffDashboard";
import { DialogHost } from "./components/AppDialog";
import "./index.css";

function StaffRoot() {
  return (
    <ErrorBoundary>
      <UserProvider>
        <ProductProvider>
          <VehicleProvider>
            <OrderProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={<Navigate to="/staff" replace />} />
                  <Route path="/staff" element={<StaffAuthGate><StaffStandaloneApp /></StaffAuthGate>} />
                  {/* orphan なスタッフ個別ジョブ画面(StaffJobList/StaffJobDetail/StaffVehicleDetail)は
                      本体アプリからリンクされず、完了処理が本体と乖離して claim/最終検品/請求を壊すため撤去。
                      URL 直打ちは下の * ルートで /staff へリダイレクトされる。 */}
                  <Route path="*" element={<Navigate to="/staff" replace />} />
                </Routes>
              </BrowserRouter>
              <DialogHost />
            </OrderProvider>
          </VehicleProvider>
        </ProductProvider>
      </UserProvider>
    </ErrorBoundary>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StaffRoot />
  </StrictMode>,
);
