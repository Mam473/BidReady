import React, { useState, useRef, useCallback } from "react";
import {
  Upload, FileText, Loader2, AlertTriangle, CheckCircle2,
  Building2, Calendar, Clock, MapPin, Tag, FileCheck,
  Users, DollarSign, Wrench, Shield, BarChart3, XCircle,
  AlertOctagon, Sparkles, ChevronDown, ChevronUp, Download,
  ClipboardList,
} from "lucide-react";

function Badge({ text, variant = "default" }) {
  const cls = {
    default:   "bg-slate-100 text-slate-700",
    success:   "bg-emerald-100 text-emerald-700",
    danger:    "bg-red-100 text-red-700",
    warning:   "bg-amber-100 text-amber-700",
    info:      "bg-blue-100 text-blue-700",
    mandatory: "bg-red-50 text-red-600 border border-red-200",
  }[variant] || "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {text}
    </span>
  );
}

function SectionCard({ icon: Icon, title, iconColor = "text-brand-600", children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0`}>
            <Icon className={`w-4 h-4 ${iconColor}`} />
          </div>
          <h2 className="font-bold text-slate-900 text-sm">{title}</h2>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && <div className="px-5 pb-5 pt-1">{children}</div>}
    </div>
  );
}

function InfoRow({ label, value }) {
  const isEmpty = !value || value === "Not Specified";
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide sm:w-44 shrink-0">{label}</span>
      <span className={`text-sm ${isEmpty ? "text-slate-300 italic" : "text-slate-800 font-medium"}`}>
        {isEmpty ? "Not Specified" : value}
      </span>
    </div>
  );
}

function RequirementList({ items = [] }) {
  if (!items.length) return <p className="text-sm text-slate-400 italic">None found in document.</p>;
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-800">{item.name}</p>
            {item.section && item.section !== "Not Specified" && (
              <p className="text-xs text-slate-400 mt-0.5">{item.section}</p>
            )}
          </div>
          {item.mandatory && <Badge text="Mandatory" variant="mandatory" />}
        </li>
      ))}
    </ul>
  );
}

function EvalList({ items = [], showWeight = false }) {
  if (!items.length) return <p className="text-sm text-slate-400 italic">None found in document.</p>;
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
          <BarChart3 className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-800">{item.name}</p>
            {item.section && item.section !== "Not Specified" && (
              <p className="text-xs text-slate-400 mt-0.5">{item.section}</p>
            )}
          </div>
          {showWeight && item.weight && item.weight !== "Not Specified" && (
            <Badge text={item.weight} variant="info" />
          )}
        </li>
      ))}
    </ul>
  );
}

function DateList({ items = [] }) {
  if (!items.length) return <p className="text-sm text-slate-400 italic">No dates found in document.</p>;
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
          <Calendar className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800">{item.event}</p>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              {item.date && item.date !== "Not Specified" && (
                <span className="text-xs text-violet-600 font-semibold">{item.date}</span>
              )}
              {item.time && item.time !== "Not Specified" && (
                <span className="text-xs text-slate-500">{item.time}</span>
              )}
              {item.section && item.section !== "Not Specified" && (
                <span className="text-xs text-slate-400">{item.section}</span>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function RiskList({ items = [] }) {
  if (!items.length) return <p className="text-sm text-slate-400 italic">No disqualification conditions found.</p>;
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-100">
          <AlertOctagon className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-red-800">{item.name}</p>
            {item.section && item.section !== "Not Specified" && (
              <p className="text-xs text-red-400 mt-0.5">{item.section}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ProgressStep({ label, done, active }) {
  return (
    <div className={`flex items-center gap-2 text-sm ${active ? "text-brand-600 font-semibold" : done ? "text-emerald-600" : "text-slate-400"}`}>
      {done
        ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
        : active
        ? <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        : <div className="w-4 h-4 rounded-full border-2 border-slate-300 shrink-0" />}
      {label}
    </div>
  );
}

export default function TenderAnalyzer() {
  const [file, setFile]           = useState(null);
  const [dragOver, setDragOver]   = useState(false);
  const [step, setStep]           = useState("idle"); // idle | uploading | extracting | done | error
  const [result, setResult]       = useState(null);
  const [error, setError]         = useState(null);
  const fileRef                   = useRef();

  const profile = (() => {
    try { return JSON.parse(localStorage.getItem("bidready_profile") || "{}"); }
    catch { return {}; }
  })();

  function pickFile(f) {
    if (!f) return;
    const ok = f.type === "application/pdf" ||
      f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      f.name.toLowerCase().endsWith(".pdf") ||
      f.name.toLowerCase().endsWith(".docx");
    if (!ok) { setError("Only PDF and DOCX files are accepted."); return; }
    setFile(f);
    setError(null);
    setResult(null);
    setStep("idle");
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    pickFile(f);
  }

  async function runExtraction() {
    if (!file) return;
    setStep("uploading");
    setError(null);
    setResult(null);

    try {
      const fd = new FormData();
      fd.append("tenderDoc", file);
      fd.append("companyName", profile.name || "Unknown Company");

      setStep("extracting");
      const res = await fetch("/api/tender/extract", { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok || !data.success) throw new Error(data.error || "Extraction failed.");

      setResult(data);
      setStep("done");

      localStorage.setItem("bidready_tender_analysis", JSON.stringify({
        ...data,
        savedAt: new Date().toISOString(),
      }));
    } catch (err) {
      setError(err.message);
      setStep("error");
    }
  }

  const a = result?.analysis || {};
  const ti = a.tenderInfo || {};
  const sd = a.submissionDetails || {};
  const ec = a.evaluationCriteria || {};

  const tenderTypeColor = {
    ITT: "info", RFQ: "warning", EOI: "success", TENDER: "default",
  }[ti.tenderType] || "default";

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tender Analyzer</h1>
          <p className="text-slate-500 text-sm mt-1">
            Upload a tender document to extract all requirements, deadlines, and evaluation criteria instantly.
          </p>
        </div>
        {step === "done" && (
          <button
            onClick={() => { setFile(null); setResult(null); setStep("idle"); setError(null); }}
            className="btn-secondary text-sm"
          >
            <Upload className="w-4 h-4" /> Analyze Another
          </button>
        )}
      </div>

      {/* Upload zone */}
      {step !== "done" && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !file && fileRef.current?.click()}
          className={`rounded-2xl border-2 border-dashed transition-all cursor-pointer
            ${dragOver ? "border-brand-400 bg-brand-50" : file ? "border-emerald-300 bg-emerald-50 cursor-default" : "border-slate-200 bg-slate-50 hover:border-brand-300 hover:bg-brand-50/40"}`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />

          {!file ? (
            <div className="p-10 text-center">
              <div className="w-14 h-14 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center mx-auto mb-4">
                <Upload className="w-7 h-7 text-brand-500" />
              </div>
              <p className="font-semibold text-slate-700">Drop your tender document here</p>
              <p className="text-sm text-slate-400 mt-1">PDF or DOCX — ITT, RFQ, EOI supported</p>
              <button
                onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
                className="mt-4 btn-primary text-sm"
              >
                Browse Files
              </button>
            </div>
          ) : (
            <div className="p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{file.name}</p>
                  <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(0)} KB</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null); setError(null); setStep("idle"); }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">Extraction Failed</p>
            <p className="text-sm text-red-600 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Analyze button */}
      {file && step !== "done" && (
        <button
          onClick={runExtraction}
          disabled={step === "extracting" || step === "uploading"}
          className="btn-primary w-full justify-center text-base py-3"
        >
          {step === "extracting" || step === "uploading" ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Analyzing Document…</>
          ) : (
            <><Sparkles className="w-5 h-5" /> Extract Tender Intelligence</>
          )}
        </button>
      )}

      {/* Progress indicator */}
      {(step === "uploading" || step === "extracting") && (
        <div className="card p-5 space-y-3">
          <p className="text-sm font-bold text-slate-700 mb-2">Analysis in progress…</p>
          <ProgressStep label="Uploading document" done={step === "extracting"} active={step === "uploading"} />
          <ProgressStep label="Extracting text (PDF/DOCX parsing)" done={false} active={step === "extracting"} />
          <ProgressStep label="AI intelligence extraction — identifying all requirements, dates & evaluation criteria" done={false} active={step === "extracting"} />
          <ProgressStep label="Saving analysis to your session" done={false} active={false} />
          <p className="text-xs text-slate-400 mt-2">This usually takes 10–30 seconds depending on document length.</p>
        </div>
      )}

      {/* ── RESULTS DASHBOARD ── */}
      {step === "done" && result && (
        <div className="space-y-4">

          {/* Summary banner */}
          <div className="card p-5 bg-gradient-to-r from-brand-950 to-brand-800 text-white">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge text={ti.tenderType || "TENDER"} variant={tenderTypeColor} />
                  {ti.sector && ti.sector !== "Not Specified" && (
                    <Badge text={ti.sector} variant="default" />
                  )}
                </div>
                <h2 className="text-lg font-bold text-white leading-tight">
                  {ti.tenderTitle !== "Not Specified" ? ti.tenderTitle : result.tenderName}
                </h2>
                {ti.procuringEntity !== "Not Specified" && (
                  <p className="text-sm text-brand-200 mt-1">{ti.procuringEntity}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                {sd.submissionDeadline && sd.submissionDeadline !== "Not Specified" && (
                  <div className="bg-white/10 rounded-xl px-4 py-2 text-center">
                    <p className="text-xs text-brand-200 font-medium uppercase tracking-wide">Submission Deadline</p>
                    <p className="text-base font-bold text-white">{sd.submissionDeadline}</p>
                    {sd.closingTime && sd.closingTime !== "Not Specified" && (
                      <p className="text-xs text-brand-300">{sd.closingTime}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Analyze My Readiness CTA */}
          <div className="card p-5 border-2 border-brand-200 bg-brand-50 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
                <ClipboardList className="w-5 h-5 text-brand-700" />
              </div>
              <div>
                <p className="font-bold text-brand-900 text-sm">Ready to check your compliance?</p>
                <p className="text-xs text-brand-600 mt-0.5">
                  Use this tender's requirements to evaluate your documents against the full 11-point checklist.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                const savedAnalysis = JSON.parse(localStorage.getItem("bidready_tender_analysis") || "{}");
                const tenderPayload = {
                  name: ti.tenderTitle !== "Not Specified" ? ti.tenderTitle : result.tenderName,
                  content: `Procuring Entity: ${ti.procuringEntity}\nTender Number: ${ti.tenderNumber}\nDeadline: ${sd.submissionDeadline}`,
                  deadline: sd.submissionDeadline && sd.submissionDeadline !== "Not Specified" ? sd.submissionDeadline : new Date().toISOString().split("T")[0],
                  source: "tender-analyzer",
                };
                localStorage.setItem("bidready_active_tender", JSON.stringify(tenderPayload));
                window.location.href = "/analysis";
              }}
              className="btn-primary shrink-0"
            >
              <Sparkles className="w-4 h-4" />
              Analyze My Readiness
            </button>
          </div>

          {/* 1. Tender Information */}
          <SectionCard icon={Building2} title="Tender Information" iconColor="text-brand-600">
            <InfoRow label="Procuring Entity"    value={ti.procuringEntity} />
            <InfoRow label="Tender Title"        value={ti.tenderTitle} />
            <InfoRow label="Tender Number"       value={ti.tenderNumber} />
            <InfoRow label="Country"             value={ti.country} />
            <InfoRow label="Procurement Method" value={ti.procurementMethod} />
            <InfoRow label="Sector"              value={ti.sector} />
            <InfoRow label="Contract Type"       value={ti.contractType} />
            <InfoRow label="Document Type"       value={ti.tenderType} />
          </SectionCard>

          {/* 2. Submission Details */}
          <SectionCard icon={Clock} title="Submission Details" iconColor="text-violet-600">
            <InfoRow label="Submission Deadline" value={sd.submissionDeadline} />
            <InfoRow label="Closing Time"        value={sd.closingTime} />
            <InfoRow label="Submission Method"   value={sd.submissionMethod} />
            <InfoRow label="Submission Address"  value={sd.submissionAddress} />
            <InfoRow label="Bid Validity"        value={sd.bidValidity} />
          </SectionCard>

          {/* 3. Required Documents */}
          <SectionCard icon={FileCheck} title="Required Documents" iconColor="text-emerald-600">
            <RequirementList items={a.requiredDocuments} />
          </SectionCard>

          {/* 4. Eligibility Requirements */}
          <SectionCard icon={Shield} title="Eligibility Requirements" iconColor="text-blue-600">
            <RequirementList items={a.eligibilityRequirements} />
          </SectionCard>

          {/* 5. Personnel Requirements */}
          <SectionCard icon={Users} title="Personnel Requirements" iconColor="text-indigo-600">
            <RequirementList items={a.personnelRequirements} />
          </SectionCard>

          {/* 6. Financial Requirements */}
          <SectionCard icon={DollarSign} title="Financial Requirements" iconColor="text-amber-600">
            <RequirementList items={a.financialRequirements} />
          </SectionCard>

          {/* 7. Equipment Requirements */}
          <SectionCard icon={Wrench} title="Equipment Requirements" iconColor="text-orange-600">
            <RequirementList items={a.equipmentRequirements} />
          </SectionCard>

          {/* 8. Bid Security */}
          <SectionCard icon={Tag} title="Bid Security Requirements" iconColor="text-rose-600">
            <RequirementList items={a.bidSecurity} />
          </SectionCard>

          {/* 9. Evaluation Criteria */}
          <SectionCard icon={BarChart3} title="Evaluation Criteria" iconColor="text-teal-600">
            {(ec.weightedScores?.length > 0) && (
              <div className="mb-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Weighted Scores</p>
                <EvalList items={ec.weightedScores} showWeight />
              </div>
            )}
            {(ec.administrativeEvaluation?.length > 0) && (
              <div className="mb-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Administrative</p>
                <EvalList items={ec.administrativeEvaluation} />
              </div>
            )}
            {(ec.technicalEvaluation?.length > 0) && (
              <div className="mb-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Technical</p>
                <EvalList items={ec.technicalEvaluation} showWeight />
              </div>
            )}
            {(ec.financialEvaluation?.length > 0) && (
              <div className="mb-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Financial</p>
                <EvalList items={ec.financialEvaluation} showWeight />
              </div>
            )}
            {(ec.passMark?.length > 0) && (
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Pass Mark</p>
                <EvalList items={ec.passMark} />
              </div>
            )}
            {!ec.administrativeEvaluation?.length && !ec.technicalEvaluation?.length && !ec.financialEvaluation?.length && (
              <p className="text-sm text-slate-400 italic">No evaluation criteria found in document.</p>
            )}
          </SectionCard>

          {/* 10. Important Dates */}
          <SectionCard icon={Calendar} title="Important Dates" iconColor="text-violet-600">
            <DateList items={a.importantDates} />
          </SectionCard>

          {/* 11. Disqualification Risks */}
          <SectionCard icon={AlertOctagon} title="Immediate Disqualification Risks" iconColor="text-red-600" defaultOpen={true}>
            <RiskList items={a.disqualificationRisks} />
          </SectionCard>

        </div>
      )}
    </div>
  );
}
