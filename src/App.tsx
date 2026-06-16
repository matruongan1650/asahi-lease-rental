/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { BrowserRouter, Route, Routes } from "react-router-dom";
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
import StaffDashboard from "./pages/Staff/StaffDashboard";
import StaffJobList from "./pages/Staff/StaffJobList";
import StaffJobDetail from "./pages/Staff/StaffJobDetail";
import StaffVehicleDetail from "./pages/Staff/StaffVehicleDetail";
import AdminDashboard from "./pages/Admin/AdminDashboard";
import ReturnOrders from "./pages/ReturnOrders";
import ReturnItems from "./pages/ReturnItems";
import ReturnShipping from "./pages/ReturnShipping";
import ReturnConfirmation from "./pages/ReturnConfirmation";
import Profile from "./pages/Profile";
import PersonalInfo from "./pages/PersonalInfo";
import ErrorBoundary from "./components/ErrorBoundary";
import StaffAuthGate from "./components/staff/StaffAuthGate";
import AdminAuthGate from "./components/AdminAuthGate";
import { DialogHost } from "./components/AppDialog";
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
              <Route path="/staff" element={<StaffAuthGate><StaffDashboard /></StaffAuthGate>} />
              <Route path="/staff/vehicle/:id" element={<StaffAuthGate><StaffVehicleDetail /></StaffAuthGate>} />
              <Route path="/staff/:role" element={<StaffAuthGate><StaffJobList /></StaffAuthGate>} />
              <Route path="/staff/:role/job/:orderId" element={<StaffAuthGate><StaffJobDetail /></StaffAuthGate>} />
              <Route path="/admin" element={<AdminAuthGate><AdminDataProvider><AdminDashboard /></AdminDataProvider></AdminAuthGate>} />
            </Routes>
          </BrowserRouter>
            <DialogHost />
            </CartProvider>
          </OrderProvider>
          </VehicleProvider>
        </FeaturedProvider>
      </ProductProvider>
    </UserProvider>
    </ErrorBoundary>
  );
}
