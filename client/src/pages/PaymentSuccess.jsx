import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle, ArrowRight, Loader2 } from "lucide-react";

const PAYMENT_KEY  = "bidready_payment_ref";
const PAYSTACK_KEY = "paystack_reference";

export default function PaymentSuccess() {
  const { state, search } = useLocation();
  const navigate  = useNavigate();
  const [verifying, setVerifying] = useState(false);
  const [verified,  setVerified]  = useState(false);

  // ── Resolve reference from ALL possible sources ──────────────────────────
  // Priority: URL query params (Paystack redirect) → router state (inline flow)
  const urlParams  = new URLSearchParams(search);
  const urlRef     = (urlParams.get("reference") || urlParams.get("trxref") || "").trim();
  const stateRef   = (state?.reference || "").trim();
  const reference  = urlRef || stateRef;

  const plan = state?.plan || "Paid Plan";

  useEffect(() => {
    if (!reference) return;

    // Persist immediately to both localStorage keys so Analysis.jsx
    // finds the reference regardless of which key it checks first.
    localStorage.setItem(PAYMENT_KEY,  reference);
    localStorage.setItem(PAYSTACK_KEY, reference);

    // Optionally live-verify with our backend so the DB record is saved
    // before the user even clicks "Run Analysis".
    setVerifying(true);
    fetch(`/api/payment/verify/${encodeURIComponent(reference)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.verified) setVerified(true);
      })
      .catch(() => {})
      .finally(() => setVerifying(false));
  }, [reference]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 max-w-md w-full p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-9 h-9 text-green-500" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Payment Successful!</h1>
        <p className="text-slate-500 mt-2 text-sm">
          You now have full access to BidReady compliance analysis.
        </p>

        {reference ? (
          <div className="mt-3 bg-slate-50 rounded-xl px-4 py-3 text-left">
            <p className="text-xs text-slate-400 mb-1">Payment Reference</p>
            <code className="text-xs font-mono text-slate-700 break-all">{reference}</code>
            {verifying && (
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Confirming payment…
              </p>
            )}
            {verified && (
              <p className="text-xs text-green-600 mt-1 font-medium">✓ Payment confirmed</p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
            No reference detected — your access may have already been saved. Try running an analysis.
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
