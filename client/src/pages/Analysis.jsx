import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3, CheckCircle2, XCircle, AlertTriangle, Download,
  Sparkles, FileText, Building2, Clock, Upload, X, FolderOpen,
  ShieldCheck, Lock, CreditCard,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const ELEVEN_CATEGORIES = [
  "CAC Registration Documents",
  "Sworn Affidavit of Due Process",
  "Evidence of Financial Capability",
  "Evidence of 3 Similar Jobs",
  "Company Profile with CVs",
  "Tax Clearance Certificate (FIRS)",
  "PENCOM Compliance Certificate",
  "NSITF Certificate",
  "ITF Compliance Certificate",
  "BPP Federal Contractor Certificate",
  "Audited Financial Accounts Statement",
];

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

// ─── Access mode constants ─────────────────────────────────────────────────
// 'admin'  — admin token present in localStorage
// 'paid'   — confirmed payment reference present in localStorage or URL
// 'locked' — neither; uploader is blocked
const ADMIN_KEY   = "bidready_admin_token";
const PAYMENT_KEY = "bidready_payment_ref";

function resolveAccessMode() {
  const adminToken = (localStorage.getItem(ADMIN_KEY) || "").trim();
  if (adminToken) return { mode: "admin", token: adminToken, ref: null };

  // Check URL query string first (?reference=...) then localStorage
  const urlRef = new URLSearchParams(window.location.search).get("reference") || "";
  const storedRef = (localStorage.getItem(PAYMENT_KEY) || "").trim();
  const payRef = urlRef || storedRef;

  if (urlRef && !storedRef) {
    // Persist URL ref so it survives navigation
    localStorage.setItem(PAYMENT_KEY, urlRef);
  }
  if (payRef) return { mode: "paid", token: null, ref: payRef };

  return { mode: "locked", token: null, ref: null };
}

export default function Analysis() {
  const navigate = useNavigate();
  const [result, setResult]               = useState(null);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState(null);
  const [tender, setTender]               = useState(null);
  const [profile, setProfile]             = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [dragOver, setDragOver]           = useState(false);
  const fileRef                           = useRef();

  const [access, setAccess] = useState(() => resolveAccessMode());

  useEffect(() => {
    const p = localStorage.getItem("bidready_profile");
    const t = localStorage.getItem("bidready_active_tender");
    if (p) setProfile(JSON.parse(p));
    if (t) setTender(JSON.parse(t));
    // Re-evaluate access in case storage changed since first render
    setAccess(resolveAccessMode());
  }, []);

  // Every new drop/selection completely replaces the file list and wipes
  // any previous analysis result so no stale data leaks into the next run.
  function addFiles(newFiles) {
    const pdfs = Array.from(newFiles).filter((f) => f.type === "application/pdf");
    if (pdfs.length === 0) {
      setError("Only PDF files are accepted. Please upload PDF documents.");
      return;
    }
    // Hard-reset: discard old file references and any prior requirements state
    setResult(null);
    setError(null);
    setUploadedFiles(pdfs);
    // Clear the input value so the same file path can be re-selected next time
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeFile(name) {
    setUploadedFiles((prev) => {
      const next = prev.filter((f) => f.name !== name);
      // If the list becomes empty, also wipe the result
      if (next.length === 0) setResult(null);
      return next;
    });
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
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
    if (uploadedFiles.length === 0) {
      setError("Please upload at least one PDF document before running analysis.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Build FormData — each File object from the live uploadedFiles array is
      // appended directly as a multipart stream to /api/analyze so the server
      // receives the full, untruncated binary of every newly selected file.
      const formData = new FormData();
      formData.append("companyProfile", JSON.stringify(profile));
      formData.append("tenderText", tender.content);
      formData.append("tenderName", tender.name);
      uploadedFiles.forEach((f) => formData.append("files", f));

      // Re-resolve access fresh at call time — reads the latest localStorage
      // and URL params so the header is never stale from an earlier render.
      const freshAccess = resolveAccessMode();
      // Sync state if it drifted (e.g. reference was saved after initial mount)
      if (freshAccess.mode !== access.mode || freshAccess.ref !== access.ref) {
        setAccess(freshAccess);
      }

      const accessHeaders = {};
      if (freshAccess.mode === "admin") {
        accessHeaders["Authorization"] = `Bearer ${freshAccess.token}`;
      } else if (freshAccess.mode === "paid") {
        accessHeaders["X-Payment-Reference"] = freshAccess.ref;
      } else {
        setLoading(false);
        setError("No payment reference found. Please complete a purchase or log in as admin.");
        return;
      }

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: accessHeaders,
        body: formData,
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

  // Calculate total pages across all uploaded files for the loading message
  const totalFilesLabel = uploadedFiles.length === 1
    ? `1 document`
    : `${uploadedFiles.length} documents`;

  const isLocked = access.mode === "locked";

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
            disabled={loading || !tender || uploadedFiles.length === 0 || isLocked}
            className="btn-primary"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Analysing…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                ✨ Run Compliance Analysis
              </>
            )}
          </button>
        </div>
      </div>

      {/* Access mode banners */}
      {access.mode === "admin" && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200">
          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
          <p className="text-sm font-semibold text-emerald-800">
            Admin Mode: Free Audits Enabled
          </p>
        </div>
      )}
      {access.mode === "paid" && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200">
          <CreditCard className="w-5 h-5 text-blue-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-blue-800">Paid Access Unlocked</p>
            <p className="text-xs text-blue-600 mt-0.5 font-mono">{access.ref}</p>
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
            <p className="text-xs text-slate-500">{profile?.rcNumber}</p>
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

      {/* ── BULK FILE BUNDLE UPLOADER ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <FolderOpen className="w-4 h-4 text-brand-600" />
          <h2 className="text-base font-bold text-slate-900">Upload Document Bundle</h2>
          <span className="text-xs text-slate-400 font-normal ml-1">— drop your entire compliance folder at once</span>
        </div>

        {/* Lock overlay — shown when no valid access token or payment ref */}
        {isLocked ? (
          <div className="relative rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 overflow-hidden">
            {/* Blurred preview of the upload zone */}
            <div className="p-10 text-center select-none pointer-events-none opacity-30 blur-[2px]">
              <div className="w-16 h-16 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center mx-auto mb-4">
                <Upload className="w-8 h-8 text-brand-500" />
              </div>
              <p className="font-bold text-slate-700 text-base">Drag & Drop Your File Bundle Here</p>
              <p className="text-sm text-slate-400 mt-1.5">Upload your compliance PDFs for AI classification</p>
            </div>

            {/* Lock message overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-white/80 backdrop-blur-[1px]">
              <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center shadow-lg">
                <Lock className="w-7 h-7 text-white" />
              </div>
              <div className="text-center px-6">
                <p className="text-lg font-bold text-slate-900">Tender Analysis Locked</p>
                <p className="text-sm text-slate-500 mt-1.5 max-w-xs">
                  Please select a pricing package to unlock your compliance workspace.
                </p>
              </div>
              <button
                onClick={() => navigate("/pricing")}
                className="flex items-center gap-2 bg-slate-900 hover:bg-slate-700 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-all shadow"
              >
                <CreditCard className="w-4 h-4" />
                View Pricing Plans
              </button>
            </div>
          </div>
        ) : (
        /* Drop zone */
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 ${
            dragOver
              ? "border-brand-400 bg-brand-50 scale-[1.01] shadow-lg"
              : "border-slate-200 hover:border-brand-300 hover:bg-brand-50/40"
          }`}
        >
          {/* Hidden input — value cleared after every selection so the same
              file can be re-dropped without the browser ignoring the event */}
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
            }}
          />
          <div className="w-16 h-16 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center mx-auto mb-4">
            <Upload className="w-8 h-8 text-brand-500" />
          </div>
          <p className="font-bold text-slate-700 text-base">Drag & Drop Your File Bundle Here</p>
          <p className="text-sm text-slate-400 mt-1.5 max-w-md mx-auto">
            Select all your compliance PDFs at once — BidReady AI will automatically identify and classify all 11 document categories
          </p>
          <div className="flex flex-wrap justify-center gap-1.5 mt-4">
            {ELEVEN_CATEGORIES.map((cat) => (
              <span key={cat} className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{cat}</span>
            ))}
          </div>
          <p className="text-xs text-brand-500 font-semibold mt-4">Click to browse or drag & drop · PDF files only</p>
        </div>
        )}

        {/* Uploaded files list — only visible when unlocked */}
        {!isLocked && uploadedFiles.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {uploadedFiles.length} file{uploadedFiles.length !== 1 ? "s" : ""} ready for analysis
            </p>
            {uploadedFiles.map((file) => (
              <div
                key={file.name}
                className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-100 hover:border-brand-200 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-brand-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{file.name}</p>
                  <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB · PDF</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removeFile(file.name); }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-danger-500 hover:bg-danger-50 transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

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
          <p className="font-semibold text-slate-700">Running Compliance Analysis…</p>
          <p className="text-sm text-slate-400 mt-1">
            Extracting all pages from {totalFilesLabel} and running AI classification — this may take a moment for large bundles
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
              11-Document Requirement Checklist
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
