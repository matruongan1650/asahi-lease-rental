/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Categories from "./pages/Categories";
import ProductList from "./pages/ProductList";
import ProductDetail from "./pages/ProductDetail";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import CheckoutConfirm from "./pages/CheckoutConfirm";
import OrderConfirmation from "./pages/OrderConfirmation";
import OrderHistory from "./pages/OrderHistory";
import OrderDetail from "./pages/OrderDetail";
import AdminDashboard from "./pages/Admin/AdminDashboard";
import ReturnOrders from "./pages/ReturnOrders";
import ReturnItems from "./pages/ReturnItems";
import ReturnShipping from "./pages/ReturnShipping";
import ReturnConfirmation from "./pages/ReturnConfirmation";
import Profile from "./pages/Profile";
import PersonalInfo from "./pages/PersonalInfo";
import ErrorBoundary from "./components/ErrorBoundary";
import AdminAuthGate from "./components/AdminAuthGate";
import { DialogHost } from "./components/AppDialog";
import { ToastHost } from "./components/AdminUI";
import { CartProvider } from "./context/CartContext";
import { OrderProvider } from "./context/OrderContext";
import { FeaturedProvider } from "./context/FeaturedContext";
import { VehicleProvider } from "./context/VehicleContext";
import { UserProvider } from "./context/UserContext";
import { ProductProvider } from "./context/ProductContext";

import { AdminDataProvider } from "./context/AdminDataContext";

export default function App() {
  return (
    <ErrorBoundary>
    <UserProvider>
      <ProductProvider>
        <FeaturedProvider>
          <VehicleProvider>
          <OrderProvider>
            <CartProvider>
            <BrowserRouter>
              <Routes>
                <Route element={<Layout />}>
                <Route path="/" element={<Home />} />
                <Route path="/categories" element={<Categories />} />
                <Route path="/product/:id" element={<ProductDetail />} />
                <Route path="/products" element={<ProductList />} />
                <Route path="/cart" element={<Cart />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/checkout-confirm" element={<CheckoutConfirm />} />
                <Route path="/order-confirmation" element={<OrderConfirmation />} />
                <Route path="/orders" element={<OrderHistory />} />
                <Route path="/order/:id" element={<OrderDetail />} />
                <Route path="/return" element={<ReturnOrders />} />
                <Route path="/return/:orderId" element={<ReturnItems />} />
                <Route path="/return/:orderId/shipping" element={<ReturnShipping />} />
                <Route path="/return-confirmation" element={<ReturnConfirmation />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/personal-info" element={<PersonalInfo />} />
              </Route>
              {/* スタッフ業務は専用 APK 専用。Web からは /staff を提供しない（APK は staff-main.tsx の別エントリ）。 */}
              <Route path="/admin" element={<AdminAuthGate><AdminDataProvider><AdminDashboard /></AdminDataProvider></AdminAuthGate>} />
              {/* 不明なパス（/staff 含む）はトップへ。 */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
            <DialogHost />
            {/* triggerToast の購読先。お客様サイト(モバイル/デスクトップ共通)でもトーストを表示する。 */}
            <ToastHost />
            </CartProvider>
          </OrderProvider>
          </VehicleProvider>
        </FeaturedProvider>
      </ProductProvider>
    </UserProvider>
    </ErrorBoundary>
  );
}
