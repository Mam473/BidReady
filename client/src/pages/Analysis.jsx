import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3, CheckCircle2, XCircle, AlertTriangle, Download,
  Sparkles, FileText, Building2, Clock, Lock,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function ScoreGauge({ score }) {
  const radius = 80;
  const stroke = 12;
  const normalizedRadius = radius - stroke / 2;
  const circumference = normalizedRadius * Math.PI;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(t);
  }, [score]);

  const color = score >= 70 ? "#16a34a" : score >= 40 ? "#d97706" : "#dc2626";
  const label = score >= 70 ? "Compliant" : score >= 40 ? "Partially Compliant" : "Non-Compliant";
  const labelColor = score >= 70 ? "text-success-600" : score >= 40 ? "text-warning-600" : "text-danger-600";

  return (
    <div className="flex flex-col items-center">
      <svg height={radius * 2} width={radius * 2} className="transform -rotate-180">
        <circle
          className="gauge-track"
          cx={radius} cy={radius} r={normalizedRadius}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference / 2}
        />
        <circle
          className="gauge-fill"
          cx={radius} cy={radius} r={normalizedRadius}
          stroke={color}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={animated ? circumference / 2 + strokeDashoffset / 2 : circumference}
          style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.34,1.56,0.64,1)" }}
        />
      </svg>
      <div className="text-center -mt-14">
        <p className="text-5xl font-bold text-slate-900 tabular-nums">{score}</p>
        <p className="text-sm text-slate-500 font-medium">/ 100</p>
        <p className={`text-sm font-bold mt-1 ${labelColor}`}>{label}</p>
      </div>
    </div>
  );
}

function RequirementRow({ req, index }) {
  const statusConfig = {
    MET:     { icon: CheckCircle2,  cls: "badge-met",     iconCls: "text-success-500" },
    MISSING: { icon: XCircle,       cls: "badge-missing", iconCls: "text-danger-500"  },
    EXPIRED: { icon: AlertTriangle, cls: "badge-expired", iconCls: "text-warning-600" },
  };
  const { icon: Icon, cls, iconCls } = statusConfig[req.status] || statusConfig.MISSING;

  return (
    <div className={`flex items-start gap-4 p-4 rounded-xl border bg-white hover:shadow-sm transition-shadow animate-fade-in-up stagger-${Math.min(index + 1, 5)}`}>
      <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${iconCls}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <p className="font-semibold text-slate-900 text-sm">{req.name}</p>
          <span className={cls}>{req.status}</span>
        </div>
        {req.notes && <p className="text-xs text-slate-500 mt-1">{req.notes}</p>}
      </div>
    </div>
  );
}

export default function Analysis() {
  const navigate = useNavigate();
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [tender, setTender]   = useState(null);
  const [profile, setProfile] = useState(null);
  const [docs, setDocs]       = useState([]);

  const [isPaid, setIsPaid] = useState(
    () => !!localStorage.getItem("bidready_payment_verified")
  );
  const [paystackReady, setPaystackReady] = useState(false);

  useEffect(() => {
    const p = localStorage.getItem("bidready_profile");
    const t = localStorage.getItem("bidready_active_tender");
    const d = localStorage.getItem("bidready_documents");
    if (p) setProfile(JSON.parse(p));
    if (t) setTender(JSON.parse(t));
    if (d) setDocs(JSON.parse(d));
  }, []);

  useEffect(() => {
    if (typeof window.PaystackPop === "function") {
      setPaystackReady(true);
      return;
    }
    let script = document.querySelector('script[src*="js.paystack.co"]');
    if (!script) {
      script = document.createElement("script");
      script.src = "https://js.paystack.co/v1/inline.js";
      document.head.appendChild(script);
    }
    function onLoad() { setPaystackReady(true); }
    script.addEventListener("load", onLoad);
    return () => script.removeEventListener("load", onLoad);
  }, []);

  async function doAnalysis() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyProfile: profile,
          documents: docs,
          tenderText: tender.content,
          tenderName: tender.name,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Analysis failed");
      setResult(data.result);
      localStorage.setItem("bidready_last_analysis", JSON.stringify({
        ...data.result,
        tenderName: tender.name,
        companyProfile: profile,
        generatedAt: new Date().toISOString(),
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function runAnalysis() {
    if (!tender) {
      setError("No tender selected. Go to Tenders and click Analyse.");
      return;
    }
    if (!profile) {
      setError("No company profile found. Please complete onboarding.");
      return;
    }

    if (isPaid) {
      doAnalysis();
      return;
    }

    if (!paystackReady) {
      setError("Payment system is still loading. Please wait a moment and try again.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const email = profile.email ||
        `${(profile.rcNumber || "user").toLowerCase().replace(/\s+/g, "")}@bidready.app`;

      const initRes = await fetch("/api/payment/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: "single",
          planName: "Single Tender Audit",
          amount: 500000,
          userId: profile.rcNumber || "anonymous",
          email,
        }),
      });

      const initData = await initRes.json();
      if (!initRes.ok || !initData.reference) {
        throw new Error(initData.error || "Could not initialise payment. Please try again.");
      }

      setLoading(false);

      const popup = new window.PaystackPop();
      popup.newTransaction({
        key: initData.publicKey,
        email: initData.email,
        amount: 500000,
        ref: initData.reference,
        currency: "NGN",
        metadata: {
          plan_name: "Single Tender Audit",
          user_id: profile.rcNumber || "anonymous",
          company_name: profile.name || "",
        },
        onSuccess(transaction) {
          localStorage.setItem("bidready_payment_verified", "true");
          localStorage.setItem("bidready_payment_ref", transaction.reference);
          setIsPaid(true);
          doAnalysis();
        },
        onCancel() {},
      });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  function exportPDF() {
    if (!result) return;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 20;

    doc.setFillColor(7, 39, 74);
    doc.rect(0, 0, pageW, 40, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("BidReady", margin, 18);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Tender Compliance Report", margin, 26);
    doc.setFontSize(9);
    doc.text(`Generated: ${new Date().toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}`, margin, 34);

    doc.setTextColor(15, 23, 42);
    let y = 52;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Company Details", margin, y);
    y += 7;

    autoTable(doc, {
      startY: y,
      head: [],
      body: [
        ["Company Name", profile.name],
        ["Industry",     profile.industry],
        ["RC Number",    profile.rcNumber],
        ["Tender",       tender.name],
        ["Deadline",     new Date(tender.deadline).toLocaleDateString("en-GB", { dateStyle: "long" })],
      ],
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        0: { fontStyle: "bold", fillColor: [241, 245, 249], cellWidth: 50 },
        1: { cellWidth: "auto" },
      },
      margin: { left: margin, right: margin },
    });

    y = doc.lastAutoTable.finalY + 12;

    const scoreColor = result.score >= 70 ? [22, 163, 74] : result.score >= 40 ? [217, 119, 6] : [220, 38, 38];
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("Compliance Score", margin, y);
    y += 7;

    doc.setFillColor(...scoreColor);
    doc.roundedRect(margin, y, 50, 20, 3, 3, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(`${result.score}/100`, margin + 25, y + 13, { align: "center" });

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(result.summary || "", pageW - margin * 2 - 60), margin + 55, y + 8);
    y += 30;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Requirement Checklist", margin, y);
    y += 6;

    autoTable(doc, {
      startY: y,
      head: [["Requirement", "Status", "Notes"]],
      body: result.requirements.map((r) => [r.name, r.status, r.notes || ""]),
      theme: "striped",
      headStyles: { fillColor: [7, 39, 74], fontSize: 9, textColor: 255, fontStyle: "bold" },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 75 },
        1: { cellWidth: 22, halign: "center", fontStyle: "bold" },
        2: { cellWidth: "auto" },
      },
      didParseCell(data) {
        if (data.column.index === 1 && data.section === "body") {
          const v = data.cell.raw;
          data.cell.styles.textColor =
            v === "MET"     ? [22, 163, 74]  :
            v === "EXPIRED" ? [217, 119, 6]  : [220, 38, 38];
        }
      },
      margin: { left: margin, right: margin },
    });

    y = doc.lastAutoTable.finalY + 12;
    if (y > doc.internal.pageSize.getHeight() - 60) { doc.addPage(); y = 20; }

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("Procurement Feedback", margin, y);
    y += 7;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setFillColor(240, 247, 255);
    const feedbackLines = doc.splitTextToSize(result.feedback || "", pageW - margin * 2 - 10);
    const feedbackH = feedbackLines.length * 5 + 10;
    doc.roundedRect(margin, y, pageW - margin * 2, feedbackH, 3, 3, "F");
    doc.setTextColor(7, 39, 74);
    doc.text(feedbackLines, margin + 5, y + 7);

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `BidReady Compliance Report — Page ${i} of ${pageCount}`,
        pageW / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" }
      );
    }

    doc.save(`BidReady_Compliance_${profile.name.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`);
  }

  const met     = result?.requirements?.filter((r) => r.status === "MET")     || [];
  const missing = result?.requirements?.filter((r) => r.status === "MISSING") || [];
  const expired = result?.requirements?.filter((r) => r.status === "EXPIRED") || [];

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Compliance Analysis</h1>
          <p className="text-slate-500 text-sm mt-1">
            AI-powered evaluation against tender requirements
          </p>
        </div>
        <div className="flex items-center gap-2">
          {result && (
            <button onClick={exportPDF} className="btn-secondary">
              <Download className="w-4 h-4" />
              Export PDF
            </button>
          )}
          <button
            onClick={runAnalysis}
            disabled={loading || !tender}
            className="btn-primary"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                {isPaid ? "Analysing…" : "Initialising payment…"}
              </>
            ) : !isPaid ? (
              <>
                <Lock className="w-4 h-4" />
                ₦5,000 — Analyse Tender
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {result ? "Re-Analyse" : "Run Analysis"}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Payment gate banner — shown only when unpaid and tender is selected */}
      {!isPaid && tender && (
        <div className="card p-4 flex items-center gap-4 bg-amber-50 border-amber-200">
          <div className="w-9 h-9 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4 text-amber-700" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-amber-900 text-sm">One-time payment required</p>
            <p className="text-xs text-amber-700 mt-0.5">
              A secure ₦5,000 Paystack payment unlocks this analysis. Your card details never touch our servers.
            </p>
          </div>
        </div>
      )}

      {/* Context cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
            <Building2 className="w-4 h-4 text-brand-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Company</p>
            <p className="font-semibold text-slate-900 text-sm mt-0.5 truncate">{profile?.name || "—"}</p>
            <p className="text-xs text-slate-500">{profile?.rcNumber} · {docs.length} document{docs.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="card p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4 text-brand-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Active Tender</p>
            <p className="font-semibold text-slate-900 text-sm mt-0.5 truncate">
              {tender?.name || <span className="text-slate-400">None selected</span>}
            </p>
            {tender?.deadline && (
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(tender.deadline).toLocaleDateString("en-GB", { dateStyle: "medium" })}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* No tender warning */}
      {!tender && (
        <div className="card p-6 flex items-center gap-4">
          <AlertTriangle className="w-8 h-8 text-warning-500 shrink-0" />
          <div>
            <p className="font-semibold text-slate-900">No tender selected</p>
            <p className="text-sm text-slate-500 mt-0.5">
              Go to the{" "}
              <button onClick={() => navigate("/tenders")} className="text-brand-600 font-medium underline-offset-2 hover:underline">
                Tenders page
              </button>{" "}
              and click <strong>Analyse</strong> on a tender to begin.
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card p-4 bg-danger-50 border-danger-200 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-danger-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-danger-700 text-sm">Error</p>
            <p className="text-xs text-danger-600 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 rounded-full border-4 border-brand-100 border-t-brand-500 animate-spin mx-auto mb-4" />
          <p className="font-semibold text-slate-700">
            {isPaid ? "Analysing compliance…" : "Confirming payment…"}
          </p>
          <p className="text-sm text-slate-400 mt-1">
            {isPaid ? "Gemini AI is reviewing your tender requirements" : "Please complete the Paystack checkout"}
          </p>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-6 animate-fade-in-up">
          {/* Score + summary */}
          <div className="card p-6">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="shrink-0">
                <ScoreGauge score={result.score} />
              </div>
              <div className="flex-1 space-y-4 text-center sm:text-left">
                <div>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">Summary</p>
                  <p className="text-sm text-slate-700 leading-relaxed">{result.summary}</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Met",     count: met.length,     color: "success" },
                    { label: "Missing", count: missing.length, color: "danger"  },
                    { label: "Expired", count: expired.length, color: "warning" },
                  ].map(({ label, count, color }) => (
                    <div key={label} className={`rounded-xl p-3 bg-${color}-50 border border-${color}-500/20 text-center`}>
                      <p className={`text-2xl font-bold text-${color}-600`}>{count}</p>
                      <p className={`text-xs text-${color}-600 font-semibold mt-0.5`}>{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Requirements */}
          <div>
            <h2 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-brand-600" />
              Requirement Checklist
            </h2>
            <div className="space-y-2">
              {result.requirements.map((req, i) => (
                <RequirementRow key={i} req={req} index={i} />
              ))}
            </div>
          </div>

          {/* Feedback */}
          <div className="card p-6 bg-gradient-to-br from-brand-50 to-white border-brand-100">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-brand-600" />
              <h2 className="text-base font-bold text-brand-900">Procurement Feedback</h2>
            </div>
            <p className="text-sm text-brand-800 leading-relaxed">{result.feedback}</p>
          </div>

          {/* Export CTA */}
          <div className="card p-5 flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-slate-900 text-sm">Ready to submit your tender?</p>
              <p className="text-xs text-slate-500 mt-0.5">Download a full compliance report to share with your team</p>
            </div>
            <button onClick={exportPDF} className="btn-primary shrink-0">
              <Download className="w-4 h-4" />
              Export PDF Report
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
