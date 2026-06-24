import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle, ArrowRight } from "lucide-react";

const PAYMENT_KEY = "bidready_payment_ref";

export default function PaymentSuccess() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const plan = state?.plan || "Selected Plan";
  const reference = state?.reference || "";

  // Persist the reference immediately so Analysis.jsx can read it from
  // localStorage regardless of how the user navigates to that page.
  useEffect(() => {
    if (reference) {
      localStorage.setItem(PAYMENT_KEY, reference);
    }
  }, [reference]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 max-w-md w-full p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-9 h-9 text-green-500" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Payment Successful!</h1>
        <p className="text-slate-500 mt-2 text-sm">
          You're now on the <strong>{plan}</strong>. You have full access to BidReady.
        </p>
        {reference && (
          <p className="mt-3 text-xs text-slate-400">
            Reference: <code className="bg-slate-100 px-2 py-0.5 rounded">{reference}</code>
          </p>
        )}
        <div className="mt-6 flex flex-col gap-3">
          <button
            onClick={() => navigate("/analysis")}
            className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white py-3 rounded-xl text-sm font-semibold transition-colors"
          >
            Run Compliance Analysis
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => navigate("/documents")}
            className="w-full py-3 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Go to Documents
          </button>
        </div>
      </div>
    </div>
  );
}
