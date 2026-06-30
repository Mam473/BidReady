import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Onboarding from "./pages/Onboarding.jsx";
import Documents from "./pages/Documents.jsx";
import Tenders from "./pages/Tenders.jsx";
import Analysis from "./pages/Analysis.jsx";
import TenderAnalyzer from "./pages/TenderAnalyzer.jsx";
import TenderReadinessDashboard from "./pages/TenderReadinessDashboard.jsx";
import Pricing from "./pages/Pricing.jsx";
import PaymentSuccess from "./pages/PaymentSuccess.jsx";
import Admin from "./pages/Admin.jsx";

function RequireProfile({ children }) {
  const profile = localStorage.getItem("bidready_profile");
  if (!profile) return <Navigate to="/onboarding" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/payment-success" element={<PaymentSuccess />} />
        <Route
          path="/"
          element={
            <RequireProfile>
              <Layout />
            </RequireProfile>
          }
        >
          <Route index element={<Navigate to="/documents" replace />} />
          <Route path="documents" element={<Documents />} />
          <Route path="tenders" element={<Tenders />} />
          <Route path="tender-analyzer" element={<TenderAnalyzer />} />
          <Route path="analysis" element={<Analysis />} />
          <Route path="pricing" element={<Pricing />} />
          <Route path="admin" element={<Admin />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
