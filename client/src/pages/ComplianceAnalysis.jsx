import React from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, ArrowLeft, Cpu } from "lucide-react";

export default function ComplianceAnalysis() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-16 text-center">
      {/* Icon */}
      <div className="relative mb-6">
        <div className="w-24 h-24 rounded-full bg-violet-50 border-2 border-violet-100 flex items-center justify-center">
          <ShieldCheck className="w-12 h-12 text-violet-400" />
        </div>
        <span className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-amber-50 border-2 border-amber-200 flex items-center justify-center">
          <Cpu className="w-4 h-4 text-amber-500" />
        </span>
      </div>

      {/* Heading */}
      <h1 className="text-3xl font-extrabold text-slate-900 mb-3">
        Compliance Analysis Coming Next.
      </h1>
      <p className="text-slate-500 text-base max-w-md mb-8">
        The Compliance Matching Engine will automatically score your bid against
        all extracted requirements and surface exactly what's missing — so you
        can fix it before submission.
      </p>

      {/* Feature preview chips */}
      <div className="flex flex-wrap justify-center gap-2 mb-10">
        {[
          "Document gap detection",
          "Eligibility scoring",
          "Financial threshold check",
          "Personnel coverage",
          "Equipment audit",
          "Disqualification flag review",
        ].map((f) => (
          <span
            key={f}
            className="px-3 py-1 rounded-full text-xs font-semibold bg-violet-50 text-violet-600 border border-violet-200"
          >
            {f}
          </span>
        ))}
      </div>

      {/* Back button */}
      <button
        onClick={() => navigate("/tender-readiness")}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Dashboard
      </button>
    </div>
  );
}
