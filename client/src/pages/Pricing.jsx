import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Zap, Users, CheckCircle, ArrowRight, Lock } from "lucide-react";

const PLANS = [
  {
    id: "single",
    name: "Single Tender Analysis",
    price: 5000,
    amountKobo: 500000,
    icon: Zap,
    color: "from-blue-500 to-blue-600",
    badge: null,
    description: "One-off compliance check for a single tender",
    features: [
      "Full AI compliance score (0–100)",
      "MET / MISSING / EXPIRED checklist",
      "Actionable feedback report",
      "PDF export",
    ],
  },
  {
    id: "sme",
    name: "SME Monthly Plan",
    price: 8000,
    amountKobo: 800000,
    icon: Shield,
    color: "from-brand-500 to-brand-600",
    badge: "Most Popular",
    description: "Unlimited analyses for growing SMEs",
    features: [
      "Unlimited tender analyses",
      "Document expiry tracking",
      "Priority AI processing",
      "PDF export",
      "30-day renewal reminder",
    ],
  },
  {
    id: "consultant",
    name: "Consultant Plan",
    price: 20000,
    amountKobo: 2000000,
    icon: Users,
    color: "from-purple-500 to-purple-600",
    badge: "Best Value",
    description: "Full-featured plan for procurement consultants",
    features: [
      "Everything in SME Plan",
      "Multi-company management",
      "Admin analytics dashboard",
      "Dedicated support",
      "Custom compliance templates",
    ],
  },
];

export default function Pricing() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(null);

  const profile = (() => {
    try {
      return JSON.parse(localStorage.getItem("bidready_profile") || "{}");
    } catch {
      return {};
    }
  })();

  const paystackLoaded = typeof window !== "undefined" && typeof window.PaystackPop === "function";

  async function handlePay(plan) {
    if (!paystackLoaded) return;
    setLoading(plan.id);

    try {
      const res = await fetch("/api/payment/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: plan.id,
          planName: plan.name,
          amount: plan.amountKobo,
          userId: profile.rcNumber || "anonymous",
          email: profile.email || `${(profile.rcNumber || "user").toLowerCase()}@bidready.app`,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.reference) throw new Error(data.error || "Failed to initialize payment");

      setLoading(null);

      const popup = new window.PaystackPop();
      popup.newTransaction({
        key: data.publicKey,
        email: data.email,
        amount: plan.amountKobo,
        ref: data.reference,
        currency: "NGN",
        metadata: {
          plan_name: plan.name,
          user_id: profile.rcNumber || "anonymous",
          company_name: profile.name || "",
        },
        onSuccess(transaction) {
          localStorage.setItem("bidready_paid_plan", plan.id);
          localStorage.setItem("bidready_payment_ref", transaction.reference);
          navigate("/payment-success", {
            state: { plan: plan.name, reference: transaction.reference },
          });
        },
        onCancel() {
          setLoading(null);
        },
      });
    } catch (err) {
      alert(err.message);
      setLoading(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-slate-900">Simple, Transparent Pricing</h1>
        <p className="mt-2 text-slate-500 text-base">
          Choose the plan that fits your tendering needs. Pay securely with Paystack.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((plan) => {
          const Icon = plan.icon;
          const isPopular = !!plan.badge;
          return (
            <div
              key={plan.id}
              className={`relative rounded-2xl border bg-white shadow-sm flex flex-col overflow-hidden transition-shadow hover:shadow-md ${
                isPopular ? "border-brand-400 ring-2 ring-brand-400" : "border-slate-200"
              }`}
            >
              {plan.badge && (
                <div className="absolute top-0 left-0 right-0 flex justify-center">
                  <span className="bg-brand-500 text-white text-xs font-semibold px-4 py-1 rounded-b-lg">
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className={`bg-gradient-to-br ${plan.color} p-6 pt-8 text-white`}>
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-3">
                  <Icon className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-bold leading-tight">{plan.name}</h2>
                <p className="text-white/80 text-sm mt-1">{plan.description}</p>
                <div className="mt-4">
                  <span className="text-3xl font-extrabold">
                    ₦{plan.price.toLocaleString()}
                  </span>
                  {plan.id !== "single" && (
                    <span className="text-white/70 text-sm ml-1">/month</span>
                  )}
                </div>
              </div>

              <div className="flex-1 p-6 flex flex-col gap-4">
                <ul className="space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                      <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handlePay(plan)}
                  disabled={loading === plan.id || !paystackLoaded}
                  className={`mt-auto w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all ${
                    isPopular
                      ? "bg-brand-500 hover:bg-brand-600 text-white"
                      : "bg-slate-900 hover:bg-slate-700 text-white"
                  } disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  {loading === plan.id ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Initializing…
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      Pay with Paystack
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-slate-400 mt-8 flex items-center justify-center gap-1.5">
        <Lock className="w-3 h-3" />
        Payments are processed securely by Paystack. Your card details never touch our servers.
      </p>
    </div>
  );
}
