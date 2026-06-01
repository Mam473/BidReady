import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Building2, Hash, Briefcase, ArrowRight, CheckCircle2 } from "lucide-react";

const INDUSTRIES = [
  "Construction & Infrastructure",
  "Information Technology",
  "Healthcare & Pharmaceuticals",
  "Agriculture & Agro-processing",
  "Oil & Gas Services",
  "Consulting & Professional Services",
  "Education & Training",
  "Manufacturing & Supply",
  "Transportation & Logistics",
  "Other",
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", industry: "", rcNumber: "" });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  function validate() {
    const e = {};
    if (!form.name.trim()) e.name = "Company name is required";
    if (!form.industry) e.industry = "Please select your industry";
    if (!form.rcNumber.trim()) e.rcNumber = "RC Number is required";
    else if (!/^RC\d{4,8}$/i.test(form.rcNumber.trim()))
      e.rcNumber = "Enter a valid RC number (e.g. RC123456)";
    return e;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    setTimeout(() => {
      localStorage.setItem(
        "bidready_profile",
        JSON.stringify({
          name: form.name.trim(),
          industry: form.industry,
          rcNumber: form.rcNumber.trim().toUpperCase(),
          createdAt: new Date().toISOString(),
        })
      );
      navigate("/documents");
    }, 600);
  }

  const STEPS = ["Company Profile", "Documents", "Tenders", "Analysis"];

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 flex items-center justify-center px-4 py-12">
      {/* Background pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-brand-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-brand-400/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md animate-fade-in-up">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-500 shadow-2xl mb-5">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">BidReady</h1>
          <p className="text-brand-300 mt-2 text-sm">
            AI-powered tender compliance for Nigerian SMEs
          </p>
        </div>

        {/* Progress steps */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((step, i) => (
            <React.Fragment key={step}>
              <div className="flex flex-col items-center gap-1">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  i === 0 ? "bg-brand-400 text-white ring-2 ring-brand-300/50" : "bg-white/10 text-white/40"
                }`}>
                  {i + 1}
                </div>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px max-w-8 ${i === 0 ? "bg-brand-400/50" : "bg-white/10"}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900">Company Profile</h2>
            <p className="text-sm text-slate-500 mt-1">
              Set up your profile once. BidReady uses it to evaluate every tender.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Company Name */}
            <div>
              <label className="label">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-brand-500" />
                  Company Name
                </span>
              </label>
              <input
                type="text"
                className={`input ${errors.name ? "border-danger-500 focus:ring-danger-500" : ""}`}
                placeholder="e.g. Apex Solutions Ltd"
                value={form.name}
                onChange={(e) => {
                  setForm({ ...form, name: e.target.value });
                  setErrors({ ...errors, name: "" });
                }}
              />
              {errors.name && <p className="text-xs text-danger-600 mt-1">{errors.name}</p>}
            </div>

            {/* Industry */}
            <div>
              <label className="label">
                <span className="flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-brand-500" />
                  Industry
                </span>
              </label>
              <select
                className={`input ${errors.industry ? "border-danger-500 focus:ring-danger-500" : ""}`}
                value={form.industry}
                onChange={(e) => {
                  setForm({ ...form, industry: e.target.value });
                  setErrors({ ...errors, industry: "" });
                }}
              >
                <option value="">Select your industry…</option>
                {INDUSTRIES.map((ind) => (
                  <option key={ind} value={ind}>{ind}</option>
                ))}
              </select>
              {errors.industry && <p className="text-xs text-danger-600 mt-1">{errors.industry}</p>}
            </div>

            {/* RC Number */}
            <div>
              <label className="label">
                <span className="flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-brand-500" />
                  CAC RC Number
                </span>
              </label>
              <input
                type="text"
                className={`input font-mono uppercase ${errors.rcNumber ? "border-danger-500 focus:ring-danger-500" : ""}`}
                placeholder="RC123456"
                value={form.rcNumber}
                onChange={(e) => {
                  setForm({ ...form, rcNumber: e.target.value });
                  setErrors({ ...errors, rcNumber: "" });
                }}
              />
              {errors.rcNumber && <p className="text-xs text-danger-600 mt-1">{errors.rcNumber}</p>}
              <p className="text-xs text-slate-400 mt-1">Corporate Affairs Commission registration number</p>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="btn-primary w-full justify-center py-3 text-base mt-2"
            >
              {saving ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Setting up…
                </>
              ) : (
                <>
                  Get Started
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Features */}
          <div className="mt-6 pt-6 border-t border-slate-100 space-y-2">
            {["AI compliance scoring against tender requirements",
              "Document expiry tracking & alerts",
              "Actionable procurement feedback"].map((f) => (
              <div key={f} className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-success-500 mt-0.5 shrink-0" />
                <span className="text-xs text-slate-500">{f}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-brand-400 mt-5">
          Data stored locally in your browser — secure and private.
        </p>
      </div>
    </div>
  );
}
