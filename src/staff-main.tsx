import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import StaffAuthGate from "./components/staff/StaffAuthGate";
import { OrderProvider } from "./context/OrderContext";
import { ProductProvider } from "./context/ProductContext";
import { VehicleProvider } from "./context/VehicleContext";
import { UserProvider } from "./context/UserContext";
import { StaffStandaloneApp } from "./pages/Staff/StaffDashboard";
import StaffJobDetail from "./pages/Staff/StaffJobDetail";
import StaffJobList from "./pages/Staff/StaffJobList";
import StaffVehicleDetail from "./pages/Staff/StaffVehicleDetail";
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
                  <Route path="/staff/vehicle/:id" element={<StaffAuthGate><StaffVehicleDetail /></StaffAuthGate>} />
                  <Route path="/staff/:role" element={<StaffAuthGate><StaffJobList /></StaffAuthGate>} />
                  <Route path="/staff/:role/job/:orderId" element={<StaffAuthGate><StaffJobDetail /></StaffAuthGate>} />
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
