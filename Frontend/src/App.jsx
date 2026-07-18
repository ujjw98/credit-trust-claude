import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AppShell from "./components/AppShell";
import RetailerShell from "./components/RetailerShell";

import PortalSelect from "./pages/PortalSelect";

import BusinessLogin from "./pages/business/Login";
import BusinessRegister from "./pages/business/Register";
import BusinessDashboard from "./pages/business/Dashboard";
import Retailers from "./pages/business/Retailers";
import RetailerProfile from "./pages/business/RetailerProfile";
import Invoices from "./pages/business/Invoices";
import BulkSettle from "./pages/business/BulkSettle";
import Disputes from "./pages/business/Disputes";
import Reports from "./pages/business/Reports";
import Profile from "./pages/business/Profile";
import Returns from "./pages/business/Returns";

import RetailerLogin from "./pages/retailer/Login";
import RetailerRegister from "./pages/retailer/Register";
import RetailerDashboard from "./pages/retailer/Dashboard";
import RetailerInvoices from "./pages/retailer/Invoices";
import RetailerDisputes from "./pages/retailer/Disputes";
import RetailerReturns from "./pages/retailer/Returns";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<PortalSelect />} />

          {/* Wholesaler auth */}
          <Route path="/login" element={<BusinessLogin />} />
          <Route path="/register" element={<BusinessRegister />} />

          {/* Wholesaler app */}
          <Route
            path="/app"
            element={
              <ProtectedRoute actorType="business">
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route index element={<BusinessDashboard />} />
            <Route path="retailers" element={<Retailers />} />
            <Route path="retailers/:id" element={<RetailerProfile />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="settle" element={<BulkSettle />} />
            <Route path="disputes" element={<Disputes />} />
            <Route path="returns" element={<Returns />} />
            <Route path="reports" element={<Reports />} />
            <Route path="profile" element={<Profile />} />
          </Route>

          {/* Retailer auth */}
          <Route path="/retailer-login" element={<RetailerLogin />} />
          <Route path="/retailer-register" element={<RetailerRegister />} />

          {/* Retailer app */}
          <Route
            path="/retailer-app"
            element={
              <ProtectedRoute actorType="retailer">
                <RetailerShell />
              </ProtectedRoute>
            }
          >
            <Route index element={<RetailerDashboard />} />
            <Route path="invoices" element={<RetailerInvoices />} />
            <Route path="returns" element={<RetailerReturns />} />
            <Route path="disputes" element={<RetailerDisputes />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
