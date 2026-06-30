import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  ArrowLeft,
  Cpu,
  Building2,
  FileText,
  ClipboardList,
  BarChart3,
  Lightbulb,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Hash,
  Briefcase,
  Calendar,
  ChevronRight,
  CircleDot,
  Layers,
  Users,
  Wrench,
  DollarSign,
  ListChecks,
  Zap,
  BookOpen,
} from "lucide-react";

// ── localStorage helpers ──────────────────────────────────────────────────────
function loadProfile() {
  try { return JSON.parse(localStorage.getItem("bidready_profile") || "{}"); }
  catch { return {}; }
}
function loadDocuments() {
  try { return JSON.parse(localStorage.getItem("bidready_documents") || "[]"); }
  catch { return []; }
}
function loadAnalysis() {
  try { return JSON.parse(localStorage.getItem("bidready_tender_analysis") || "null"); }
  catch { return null; }
}
function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
}

// ── Shared primitives ─────────────────────────────────────────────────────────
function SectionCard({ icon: Icon, title, subtitle, badge, color = "violet", children }) {
  const accent = {
    violet: "text-violet-500 bg-violet-50",
    blue:   "text-blue-500 bg-blue-50",
    amber:  "text-amber-500 bg-amber-50",
    emerald:"text-emerald-500 bg-emerald-50",
    indigo: "text-indigo-500 bg-indigo-50",
    rose:   "text-rose-500 bg-rose-50",
  }[color] || "text-violet-500 bg-violet-50";

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${accent}`}>
            <Icon className="w-3.5 h-3.5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-700 leading-tight">{title}</h3>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {badge && (
          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 shrink-0">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function PulseRow({ wide }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="w-3 h-3 rounded-full bg-slate-200 animate-pulse shrink-0" />
      <div className={`h-2.5 rounded-full bg-slate-100 animate-pulse ${wide ? "w-3/4" : "w-1/2"}`} />
    </div>
  );
}

function PulseBar() {
  return (
    <div className="space-y-2">
      {[80, 60, 75, 50].map((w, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-2 bg-slate-100 animate-pulse rounded-full flex-1" style={{ maxWidth: `${w}%` }} />
          <div className="h-2 w-8 bg-slate-100 animate-pulse rounded-full" />
        </div>
      ))}
    </div>
  );
}

function ComingSoonBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
      <Zap className="w-2.5 h-2.5" /> Coming next
    </span>
  );
}

// ── 1. Company Compliance Profile ─────────────────────────────────────────────
function CompanyProfileSection({ profile, docs }) {
  const validDocs    = docs.filter((d) => { const n = daysUntil(d.expiryDate); return n === null || n > 30; });
  const expiringDocs = docs.filter((d) => { const n = daysUntil(d.expiryDate); return n !== null && n > 0 && n <= 30; });
  const expiredDocs  = docs.filter((d) => { const n = daysUntil(d.expiryDate); return n !== null && n <= 0; });

  const infoRows = [
    { icon: Building2,  label: "Company Name",  value: profile.name     || "—" },
    { icon: Briefcase,  label: "Industry",       value: profile.industry || "—" },
    { icon: Hash,       label: "RC Number",      value: profile.rcNumber || "—" },
    { icon: Calendar,   label: "Registered",     value: profile.createdAt ? new Date(profile.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—" },
  ];

  return (
    <SectionCard icon={Building2} title="Company Compliance Profile" subtitle="Your registered company details & documents" color="violet">
      <div className="space-y-4">
        {/* Info rows */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {infoRows.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
              <Icon className="w-3.5 h-3.5 text-violet-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-slate-400">{label}</p>
                <p className="text-sm font-semibold text-slate-800 truncate">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Document summary */}
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Document Vault</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-center">
              <p className="text-2xl font-extrabold text-emerald-600">{validDocs.length}</p>
              <p className="text-xs text-emerald-600 font-medium mt-0.5">Valid</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-center">
              <p className="text-2xl font-extrabold text-amber-600">{expiringDocs.length}</p>
              <p className="text-xs text-amber-600 font-medium mt-0.5">Expiring</p>
            </div>
            <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-center">
              <p className="text-2xl font-extrabold text-red-600">{expiredDocs.length}</p>
              <p className="text-xs text-red-600 font-medium mt-0.5">Expired</p>
            </div>
          </div>
        </div>

        {/* Document list preview (max 5) */}
        {docs.length > 0 ? (
          <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
            {docs.slice(0, 8).map((doc, i) => {
              const days = daysUntil(doc.expiryDate);
              const status = days === null ? { cls: "bg-slate-100 text-slate-500", label: "No Expiry" }
                : days <= 0  ? { cls: "bg-red-100 text-red-600",   label: "Expired"     }
                : days <= 30 ? { cls: "bg-amber-100 text-amber-600", label: `${days}d`   }
                : { cls: "bg-emerald-100 text-emerald-600", label: "Valid"  };
              return (
                <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors">
                  <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-xs text-slate-700 flex-1 truncate">{doc.name || doc.type}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${status.cls}`}>{status.label}</span>
                </div>
              );
            })}
            {docs.length > 8 && (
              <p className="text-xs text-slate-400 text-center py-1">+{docs.length - 8} more documents</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic text-center py-3">No documents uploaded yet</p>
        )}
      </div>
    </SectionCard>
  );
}

// ── 2. Tender Requirements ────────────────────────────────────────────────────
function TenderRequirementsSection({ tenderData }) {
  const analysis = tenderData?.analysis || {};
  const info     = analysis.tenderInfo || {};
  const sd       = analysis.submissionDetails || {};

  const counts = [
    { icon: FileText,    label: "Required Documents",   n: (analysis.requiredDocuments    || []).length, color: "bg-green-50 text-green-600 border-green-200"   },
    { icon: ListChecks,  label: "Eligibility Criteria", n: (analysis.eligibilityRequirements || []).length, color: "bg-blue-50 text-blue-600 border-blue-200"    },
    { icon: DollarSign,  label: "Financial Criteria",   n: (analysis.financialRequirements   || []).length, color: "bg-amber-50 text-amber-600 border-amber-200" },
    { icon: Users,       label: "Personnel Required",   n: (analysis.personnelRequirements   || []).length, color: "bg-indigo-50 text-indigo-600 border-indigo-200"},
    { icon: Wrench,      label: "Equipment Required",   n: (analysis.equipmentRequirements   || []).length, color: "bg-orange-50 text-orange-600 border-orange-200"},
    { icon: AlertTriangle, label: "Risk Factors",       n: (analysis.disqualificationRisks  || []).length, color: "bg-red-50 text-red-600 border-red-200"        },
  ];

  return (
    <SectionCard
      icon={ClipboardList}
      title="Tender Requirements"
      subtitle={tenderData ? (info.tenderTitle || tenderData.tenderName || "Loaded tender") : "No tender analysis found"}
      badge={tenderData ? "Loaded" : "No data"}
      color="blue"
    >
      {tenderData ? (
        <div className="space-y-4">
          {/* Quick info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { label: "Procuring Entity", value: info.procuringEntity || "—" },
              { label: "Deadline",         value: sd.submissionDeadline || "—" },
            ].map(({ label, value }) => (
              <div key={label} className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <p className="text-xs text-slate-400">{label}</p>
                <p className="text-sm font-semibold text-slate-800 truncate">{value}</p>
              </div>
            ))}
          </div>

          {/* Requirement category counts */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {counts.map(({ icon: Icon, label, n, color }) => (
              <div key={label} className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-center ${color}`}>
                <Icon className="w-4 h-4" />
                <p className="text-xl font-extrabold leading-none">{n}</p>
                <p className="text-xs font-medium leading-tight">{label}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-50 border border-blue-100">
            <Cpu className="w-4 h-4 text-blue-400 shrink-0" />
            <p className="text-xs text-blue-600">
              Compliance Matching Engine will compare each requirement against your profile and documents.
            </p>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 space-y-3">
          <ClipboardList className="w-10 h-10 text-slate-200 mx-auto" />
          <p className="text-sm text-slate-400">No tender analysis found.</p>
          <p className="text-xs text-slate-300">Run the Tender Analyzer first, then return here.</p>
        </div>
      )}
    </SectionCard>
  );
}

// ── Company Documents section ─────────────────────────────────────────────────
function statusOf(expiryDate) {
  if (!expiryDate) return { label: "No Expiry",  cls: "bg-slate-100 text-slate-500 border-slate-200",   dot: "bg-slate-400"   };
  const days = Math.ceil((new Date(expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
  if (days < 0)   return { label: "Expired",      cls: "bg-red-50 text-red-600 border-red-200",           dot: "bg-red-500"     };
  if (days <= 30) return { label: `Expiring (${days}d)`, cls: "bg-amber-50 text-amber-600 border-amber-200", dot: "bg-amber-400" };
  return           { label: "Valid",             cls: "bg-emerald-50 text-emerald-600 border-emerald-200", dot: "bg-emerald-500" };
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function CompanyDocumentsSection({ docs }) {
  const valid    = docs.filter((d) => { const s = statusOf(d.expiryDate); return s.label === "Valid" || s.label === "No Expiry"; });
  const expiring = docs.filter((d) => statusOf(d.expiryDate).label.startsWith("Expiring"));
  const expired  = docs.filter((d) => statusOf(d.expiryDate).label === "Expired");

  return (
    <SectionCard
      icon={FileText}
      title="Company Compliance Documents"
      subtitle="Uploaded documents from your Document Vault"
      badge={docs.length > 0 ? `${docs.length} uploaded` : "None uploaded"}
      color="violet"
    >
      {docs.length === 0 ? (
        /* ── Empty state ── */
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="w-14 h-14 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center">
            <FileText className="w-7 h-7 text-slate-200" />
          </div>
          <p className="text-sm font-semibold text-slate-400">Not Uploaded</p>
          <p className="text-xs text-slate-300 text-center max-w-xs">
            No compliance documents found. Upload your documents in the Documents section first.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary strip */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-center">
              <p className="text-xl font-extrabold text-emerald-600">{valid.length}</p>
              <p className="text-xs text-emerald-600 font-medium mt-0.5">Valid</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-center">
              <p className="text-xl font-extrabold text-amber-600">{expiring.length}</p>
              <p className="text-xs text-amber-600 font-medium mt-0.5">Expiring Soon</p>
            </div>
            <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-center">
              <p className="text-xl font-extrabold text-red-600">{expired.length}</p>
              <p className="text-xs text-red-600 font-medium mt-0.5">Expired</p>
            </div>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[2rem_1fr_110px_110px_120px] gap-3 px-3 py-2">
            <span />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Document Name</span>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Uploaded</span>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Expires</span>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Status</span>
          </div>
          <div className="h-px bg-slate-100" />

          {/* Rows — scrollable */}
          <div className="max-h-[400px] overflow-y-auto pr-1 space-y-0.5">
            {docs.map((doc, i) => {
              const st = statusOf(doc.expiryDate);
              return (
                <div
                  key={doc.id || i}
                  className="grid grid-cols-[2rem_1fr_110px_110px_120px] gap-3 items-start px-3 py-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100"
                >
                  {/* Index */}
                  <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0 mt-0.5">
                    {i + 1}
                  </span>

                  {/* Name + type */}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 leading-snug truncate">{doc.name}</p>
                    {doc.type && doc.type !== doc.name && (
                      <p className="text-xs text-slate-400 truncate mt-0.5">{doc.type}</p>
                    )}
                  </div>

                  {/* Uploaded */}
                  <p className="text-xs text-slate-500 mt-0.5">{fmtDate(doc.uploadedAt)}</p>

                  {/* Expires */}
                  <p className="text-xs text-slate-500 mt-0.5">{doc.expiryDate ? fmtDate(doc.expiryDate) : <span className="text-slate-300 italic">None</span>}</p>

                  {/* Status */}
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border whitespace-nowrap w-fit ${st.cls}`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${st.dot}`} />
                    {st.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Footer note */}
          <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5 text-violet-400 shrink-0" />
            <p className="text-xs text-slate-400">
              These documents will be matched against tender requirements when the Compliance Engine runs.
            </p>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ── Compliance matching engine ────────────────────────────────────────────────

// High-signal acronyms and keywords that uniquely identify a document type
const HIGH_SIGNAL = [
  "cac","pencom","nsitf","itf","firs","tax","bpp","nafdac","son","ncc","npc",
  "iso","nis","coren","toprec","naoc","naddc","dpr","nesrea","nnpc","cbn",
  "smedan","nipc","immigration","customs","police","sec","nse","lasimra",
  "bid","bond","security","guarantee","irrevocable","letter","insurance",
  "indemnity","professional","profile","experience","audited","financial",
  "incorporation","registration","annual","turnover","statement","joint",
  "venture","power","attorney","sworn","affidavit","certificate",
];

const STOPWORDS = new Set([
  "a","an","the","of","for","and","or","in","on","to","with","by","at",
  "is","are","be","been","as","from","that","this","must","shall","will",
  "not","all","any","each","no","its","it","has","have","been","been",
  "copy","copies","valid","current","original","certified","true","duly",
  "signed","stamped","dated","recent","year","years","three","two","one",
  "per","their","submitted","submit","provide","provided","evidence","proof",
]);

function tokenise(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

// Returns a confidence score 0–N for how well companyDoc matches requiredName
function matchScore(requiredTokens, companyDoc) {
  const haystack = tokenise(`${companyDoc.name} ${companyDoc.type}`);
  let score = 0;
  for (const tok of requiredTokens) {
    if (haystack.includes(tok)) {
      score += HIGH_SIGNAL.includes(tok) ? 3 : 1;
    } else if (haystack.some((h) => h.includes(tok) || tok.includes(h))) {
      score += HIGH_SIGNAL.includes(tok) ? 1.5 : 0.5;
    }
  }
  return score;
}

// COMPLIANCE_STATUS values: Available | Missing | Expired | Expiring Soon | Cannot Determine
function matchDocumentStatus(requiredDoc, companyDocs) {
  if (!companyDocs || companyDocs.length === 0) return "Missing";

  const tokens = tokenise(requiredDoc.name);
  if (tokens.length === 0) return "Cannot Determine";

  // Score every company doc
  const scored = companyDocs
    .map((d) => ({ doc: d, score: matchScore(tokens, d) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return "Missing";

  const best = scored[0];

  // Require a minimum confidence before calling it a match
  const minScore = tokens.some((t) => HIGH_SIGNAL.includes(t)) ? 2 : 2.5;

  if (best.score < minScore) return "Cannot Determine";

  // Match found — check expiry
  const expiry = best.doc.expiryDate;
  if (!expiry) return "Available"; // no expiry tracked = treat as valid

  const days = Math.ceil((new Date(expiry) - new Date()) / (1000 * 60 * 60 * 24));
  if (days < 0)   return "Expired";
  if (days <= 30) return "Expiring Soon";
  return "Available";
}

const COMPLIANCE_BADGE = {
  "Available":        { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", icon: "✓" },
  "Missing":          { cls: "bg-red-50 text-red-600 border-red-200",             dot: "bg-red-500",     icon: "✗" },
  "Expired":          { cls: "bg-rose-50 text-rose-700 border-rose-200",          dot: "bg-rose-500",    icon: "!" },
  "Expiring Soon":    { cls: "bg-amber-50 text-amber-700 border-amber-200",       dot: "bg-amber-400",   icon: "⚠" },
  "Cannot Determine": { cls: "bg-slate-100 text-slate-500 border-slate-200",      dot: "bg-slate-400",   icon: "?" },
};

// ── Required Documents table (with compliance matching) ───────────────────────
function RequiredDocumentsTable({ tenderData, docs }) {
  const items     = tenderData?.analysis?.requiredDocuments || [];
  const mandatory = items.filter((d) => d.mandatory === true || d.mandatory === "true");
  const optional  = items.filter((d) => d.mandatory !== true && d.mandatory !== "true");

  // Pre-compute compliance status for every item
  const withStatus = items.map((doc) => ({
    ...doc,
    complianceStatus: matchDocumentStatus(doc, docs),
  }));
  const mandatoryWithStatus = withStatus.filter((d) => d.mandatory === true || d.mandatory === "true");
  const optionalWithStatus  = withStatus.filter((d) => d.mandatory !== true && d.mandatory !== "true");

  // Counts for summary strip
  const available  = withStatus.filter((d) => d.complianceStatus === "Available").length;
  const missing    = withStatus.filter((d) => d.complianceStatus === "Missing").length;
  const expired    = withStatus.filter((d) => d.complianceStatus === "Expired").length;
  const expiring   = withStatus.filter((d) => d.complianceStatus === "Expiring Soon").length;
  const unclear    = withStatus.filter((d) => d.complianceStatus === "Cannot Determine").length;

  if (!tenderData) {
    return (
      <SectionCard icon={FileText} title="Document Compliance Match" subtitle="Required documents vs. your uploads" color="blue">
        <div className="text-center py-10 space-y-2">
          <FileText className="w-10 h-10 text-slate-200 mx-auto" />
          <p className="text-sm text-slate-400">No tender analysis found.</p>
          <p className="text-xs text-slate-300">Run the Tender Analyzer first, then return here.</p>
        </div>
      </SectionCard>
    );
  }

  if (items.length === 0) {
    return (
      <SectionCard icon={FileText} title="Document Compliance Match" subtitle="Required documents vs. your uploads" color="blue">
        <div className="text-center py-10 space-y-2">
          <CheckCircle2 className="w-10 h-10 text-slate-200 mx-auto" />
          <p className="text-sm text-slate-400">No required documents were extracted for this tender.</p>
        </div>
      </SectionCard>
    );
  }

  function DocRow({ doc, index }) {
    const isMandatory = doc.mandatory === true || doc.mandatory === "true";
    const hasSection  = doc.section && doc.section !== "Not Specified";
    const badge       = COMPLIANCE_BADGE[doc.complianceStatus] || COMPLIANCE_BADGE["Cannot Determine"];

    // Row background tint based on compliance status
    const rowBg =
      doc.complianceStatus === "Available"     ? "hover:bg-emerald-50/40" :
      doc.complianceStatus === "Missing"       ? "bg-red-50/30 hover:bg-red-50/50 border-red-100/60" :
      doc.complianceStatus === "Expired"       ? "bg-rose-50/30 hover:bg-rose-50/50 border-rose-100/60" :
      doc.complianceStatus === "Expiring Soon" ? "bg-amber-50/30 hover:bg-amber-50/50 border-amber-100/60" :
      "hover:bg-slate-50";

    return (
      <div className={`grid grid-cols-[2rem_1fr_auto] sm:grid-cols-[2rem_1fr_110px_150px_160px] gap-3 items-start px-4 py-3 rounded-xl transition-colors border border-transparent ${rowBg}`}>
        {/* Row number */}
        <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0 mt-0.5">
          {index + 1}
        </span>

        {/* Document name */}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800 leading-snug">{doc.name}</p>
          {hasSection && (
            <span className="inline-flex items-center gap-1 text-xs text-violet-500 mt-0.5">
              <BookOpen className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate max-w-[200px]" title={doc.section}>{doc.section}</span>
            </span>
          )}
        </div>

        {/* Mandatory — hidden on mobile, shown on sm+ */}
        <div className="hidden sm:flex justify-center">
          {isMandatory ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-50 text-red-600 border border-red-200 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
              Mandatory
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
              Optional
            </span>
          )}
        </div>

        {/* Compliance status — always visible */}
        <div className="sm:col-span-1 col-span-1 flex justify-end sm:justify-center">
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border whitespace-nowrap ${badge.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${badge.dot}`} />
            {doc.complianceStatus}
          </span>
        </div>
      </div>
    );
  }

  return (
    <SectionCard
      icon={ShieldCheck}
      title="Document Compliance Match"
      subtitle="Each tender requirement checked against your uploaded documents"
      badge={`${items.length} requirements`}
      color="blue"
    >
      {/* Compliance summary strip */}
      <div className="grid grid-cols-5 gap-2 mb-4">
        {[
          { label: "Available",        n: available, cls: "bg-emerald-50 border-emerald-100 text-emerald-600" },
          { label: "Missing",          n: missing,   cls: "bg-red-50 border-red-100 text-red-600"             },
          { label: "Expired",          n: expired,   cls: "bg-rose-50 border-rose-100 text-rose-700"          },
          { label: "Expiring Soon",    n: expiring,  cls: "bg-amber-50 border-amber-100 text-amber-600"       },
          { label: "Unverified",       n: unclear,   cls: "bg-slate-50 border-slate-100 text-slate-500"       },
        ].map(({ label, n, cls }) => (
          <div key={label} className={`p-2 sm:p-3 rounded-xl border text-center ${cls}`}>
            <p className="text-lg sm:text-xl font-extrabold leading-none">{n}</p>
            <p className="text-[10px] sm:text-xs font-medium mt-0.5 leading-tight">{label}</p>
          </div>
        ))}
      </div>

      {/* Column headers */}
      <div className="hidden sm:grid grid-cols-[2rem_1fr_110px_150px_160px] gap-3 px-4 py-2">
        <span />
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Document Name</span>
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wide text-center">Required</span>
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wide text-center">Compliance</span>
      </div>
      <div className="h-px bg-slate-100 mb-1" />

      {/* Rows — scrollable */}
      <div className="max-h-[500px] overflow-y-auto pr-1 space-y-0.5">
        {/* Mandatory group */}
        {mandatoryWithStatus.length > 0 && (
          <>
            <p className="text-xs font-bold text-red-500 uppercase tracking-wide px-4 py-2">
              Mandatory ({mandatoryWithStatus.length})
            </p>
            {mandatoryWithStatus.map((doc, i) => (
              <DocRow key={`m-${i}`} doc={doc} index={i} />
            ))}
          </>
        )}

        {/* Optional group */}
        {optionalWithStatus.length > 0 && (
          <>
            <div className="h-px bg-slate-100 my-2" />
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide px-4 py-2">
              Optional ({optionalWithStatus.length})
            </p>
            {optionalWithStatus.map((doc, i) => (
              <DocRow key={`o-${i}`} doc={doc} index={mandatoryWithStatus.length + i} />
            ))}
          </>
        )}
      </div>

      {/* Legend + note */}
      <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
        <div className="flex flex-wrap gap-2">
          {Object.entries(COMPLIANCE_BADGE).map(([label, { cls, dot }]) => (
            <span key={label} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />{label}
            </span>
          ))}
        </div>
        <p className="text-xs text-slate-400">
          <span className="font-semibold text-slate-500">Unverified</span> means the document name was too generic to match confidently. Review manually.
        </p>
      </div>
    </SectionCard>
  );
}

// ── 3. Compliance Results ─────────────────────────────────────────────────────
const RESULT_CATEGORIES = [
  { icon: FileText,    label: "Documents",   desc: "Required vs. uploaded documents matched", color: "text-green-500",  bg: "bg-green-50  border-green-100"  },
  { icon: ListChecks,  label: "Eligibility", desc: "Registration, certifications & licences",  color: "text-blue-500",  bg: "bg-blue-50   border-blue-100"   },
  { icon: DollarSign,  label: "Financial",   desc: "Turnover, bonding & insurance thresholds",  color: "text-amber-500", bg: "bg-amber-50  border-amber-100"  },
  { icon: Users,       label: "Personnel",   desc: "Key staff roles vs. CV database",          color: "text-indigo-500",bg: "bg-indigo-50 border-indigo-100" },
  { icon: Wrench,      label: "Equipment",   desc: "Owned & leased assets vs. requirements",   color: "text-orange-500",bg: "bg-orange-50 border-orange-100" },
];

function ComplianceResultsSection() {
  return (
    <SectionCard icon={ShieldCheck} title="Compliance Results" subtitle="Per-category match analysis" color="emerald">
      <div className="space-y-3">
        {RESULT_CATEGORIES.map(({ icon: Icon, label, desc, color, bg }) => (
          <div key={label} className={`flex items-center gap-3 p-3 rounded-xl border ${bg}`}>
            <Icon className={`w-4 h-4 shrink-0 ${color}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-sm font-semibold text-slate-700">{label}</p>
                <ComingSoonBadge />
              </div>
              <p className="text-xs text-slate-400 truncate">{desc}</p>
              {/* Placeholder progress bar */}
              <div className="mt-2 h-1.5 rounded-full bg-white/80 border border-slate-200 overflow-hidden">
                <div className="h-full w-0 rounded-full bg-slate-200 animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ── 4. Readiness Score ────────────────────────────────────────────────────────
const GAUGE_R = 54;
const GAUGE_CIRC = 2 * Math.PI * GAUGE_R;

function ReadinessScoreSection() {
  const score  = 82;
  const offset = GAUGE_CIRC - (score / 100) * GAUGE_CIRC;

  return (
    <SectionCard icon={BarChart3} title="Readiness Score" subtitle="Powered by Compliance Engine (placeholder)" color="indigo">
      <div className="flex flex-col sm:flex-row items-center gap-6">
        {/* Gauge */}
        <div className="relative w-32 h-32 shrink-0">
          <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
            <circle cx="60" cy="60" r={GAUGE_R} fill="none" stroke="#e2e8f0" strokeWidth="10" />
            <circle
              cx="60" cy="60" r={GAUGE_R}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={GAUGE_CIRC}
              strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 1s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-extrabold text-slate-900 leading-none">{score}%</span>
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wide mt-1">Score</span>
          </div>
        </div>

        {/* Right */}
        <div className="flex-1 w-full space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 flex-1 min-w-[90px] text-center">
              <p className="text-xs text-amber-500 font-semibold">Status</p>
              <p className="text-sm font-bold text-amber-700 mt-0.5">Nearly Ready</p>
            </div>
            <div className="p-3 rounded-xl bg-red-50 border border-red-100 flex-1 min-w-[90px] text-center">
              <p className="text-xs text-red-500 font-semibold">Critical Issues</p>
              <p className="text-sm font-bold text-red-700 mt-0.5">3 flagged</p>
            </div>
          </div>

          {/* Mini category bars — placeholders */}
          <div className="space-y-2">
            {[
              { label: "Documents",   pct: 90 },
              { label: "Eligibility", pct: 75 },
              { label: "Financial",   pct: 80 },
              { label: "Personnel",   pct: 70 },
            ].map(({ label, pct }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-20 shrink-0">{label}</span>
                <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs font-semibold text-slate-400 w-8 text-right">{pct}%</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-1.5 p-2.5 rounded-lg bg-indigo-50 border border-indigo-100">
            <Cpu className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <p className="text-xs text-indigo-600">Live scores will be computed once the Compliance Engine runs.</p>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

// ── 5. Action Plan ────────────────────────────────────────────────────────────
const PLACEHOLDER_ACTIONS = [
  { priority: "High",   label: "Upload missing PENCOM Certificate",              cat: "Documents",   color: "border-red-200 bg-red-50",    pill: "bg-red-100 text-red-600"     },
  { priority: "High",   label: "Renew expired Tax Clearance Certificate",         cat: "Documents",   color: "border-red-200 bg-red-50",    pill: "bg-red-100 text-red-600"     },
  { priority: "Medium", label: "Verify minimum turnover threshold is met",         cat: "Financial",   color: "border-amber-200 bg-amber-50",pill: "bg-amber-100 text-amber-700" },
  { priority: "Medium", label: "Confirm lead engineer CV is attached",            cat: "Personnel",   color: "border-amber-200 bg-amber-50",pill: "bg-amber-100 text-amber-700" },
  { priority: "Low",    label: "Cross-check equipment ownership documentation",   cat: "Equipment",   color: "border-blue-200 bg-blue-50",  pill: "bg-blue-100 text-blue-700"   },
  { priority: "Low",    label: "Review ISO certification scope vs. requirements", cat: "Eligibility", color: "border-slate-200 bg-slate-50",pill: "bg-slate-100 text-slate-600" },
];

function ActionPlanSection() {
  return (
    <SectionCard icon={Lightbulb} title="Action Plan" subtitle="Steps to reach full compliance (placeholder)" badge="6 items" color="amber">
      <div className="space-y-2">
        {PLACEHOLDER_ACTIONS.map((a, i) => (
          <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${a.color}`}>
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold bg-white border border-current shrink-0 mt-0.5 text-slate-500">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-700 leading-snug">{a.label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{a.cat}</p>
            </div>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${a.pill}`}>{a.priority}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100">
        <Zap className="w-4 h-4 text-amber-400 shrink-0" />
        <p className="text-xs text-amber-700">
          The Compliance Engine will generate a personalised, prioritised action plan from your actual gap analysis.
        </p>
      </div>
    </SectionCard>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ComplianceAnalysis() {
  const navigate   = useNavigate();
  const [profile,  setProfile]  = useState({});
  const [docs,     setDocs]     = useState([]);
  const [tenderData, setTender] = useState(null);

  useEffect(() => {
    setProfile(loadProfile());
    setDocs(loadDocuments());
    setTender(loadAnalysis());
  }, []);

  return (
    <div className="space-y-5 max-w-5xl mx-auto px-1 pb-10">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <button
            onClick={() => navigate("/tender-readiness")}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Readiness Dashboard
          </button>
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-violet-500" />
              </div>
              <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center">
                <Cpu className="w-2.5 h-2.5 text-amber-500" />
              </span>
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 leading-tight">Compliance Matching Engine</h1>
              <p className="text-sm text-slate-400">Company profile vs. tender requirements — gap analysis</p>
            </div>
          </div>
        </div>

        {/* Engine status */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs font-bold text-amber-600">Engine: Pending Implementation</span>
        </div>
      </div>

      {/* ── How it works banner ── */}
      <div className="card p-4 bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-100">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 shrink-0">
            {[Building2, ChevronRight, ClipboardList, ChevronRight, ShieldCheck, ChevronRight, Lightbulb].map((Icon, i) => (
              <Icon key={i} className={`w-4 h-4 ${i % 2 === 1 ? "text-slate-300" : "text-violet-400"}`} />
            ))}
          </div>
          <p className="text-xs text-slate-500 flex-1">
            The engine loads your <span className="font-semibold text-violet-600">Company Profile</span> &amp; documents,
            compares them against <span className="font-semibold text-violet-600">Tender Requirements</span>,
            and produces a <span className="font-semibold text-violet-600">Readiness Score</span> with a personalised{" "}
            <span className="font-semibold text-violet-600">Action Plan</span>.
          </p>
          <ComingSoonBadge />
        </div>
      </div>

      {/* ── 5 sections — 2-col grid on large screens ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 1. Company profile (tall — spans left column) */}
        <div className="lg:row-span-2">
          <CompanyProfileSection profile={profile} docs={docs} />
        </div>

        {/* 2. Tender requirements */}
        <TenderRequirementsSection tenderData={tenderData} />

        {/* 3. Readiness Score */}
        <ReadinessScoreSection />
      </div>

      {/* Company Documents — full width */}
      <CompanyDocumentsSection docs={docs} />

      {/* Required Documents — full width */}
      <RequiredDocumentsTable tenderData={tenderData} docs={docs} />

      {/* Compliance Results — full width */}
      <ComplianceResultsSection />

      {/* Action Plan — full width */}
      <ActionPlanSection />

      {/* ── Footer CTA ── */}
      <div className="flex flex-col items-center gap-2 pt-4 pb-2">
        <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200">
          <Cpu className="w-5 h-5 text-violet-400 shrink-0" />
          <p className="text-sm text-slate-500">
            Compliance Matching Engine implementation coming in the next build sprint.
            All sections above will populate with real gap analysis data.
          </p>
        </div>
      </div>

    </div>
  );
}
