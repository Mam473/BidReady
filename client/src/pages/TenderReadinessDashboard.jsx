import React, { useMemo, useState } from "react";
import {
  FileCheck2,
  CalendarClock,
  ShieldAlert,
  ClipboardList,
  BadgeCheck,
  Clock,
  ArrowRight,
  Gauge,
  Building2,
  FileText,
  Calendar,
  AlertOctagon,
  ScanSearch,
  CheckSquare,
  Square,
  BookOpen,
  Shield,
  CircleDot,
  DollarSign,
  Minus,
  Users,
  Wrench,
  CheckCircle2,
  XCircle,
  BarChart3,
  ListChecks,
  Trophy,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

// ── Data helpers ─────────────────────────────────────────────────────────────

function useTenderAnalysis() {
  return useMemo(() => {
    try {
      const raw = localStorage.getItem("bidready_tender_analysis");
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, []);
}

function val(v) {
  return !v || v === "Not Specified" ? null : v;
}

// ── Info card — text value ────────────────────────────────────────────────────

function InfoCard({ icon: Icon, label, value, color = "brand", wide = false }) {
  const colors = {
    brand:  { bg: "bg-brand-50",   icon: "text-brand-500",  text: "text-brand-700"  },
    violet: { bg: "bg-violet-50",  icon: "text-violet-500", text: "text-violet-700" },
    slate:  { bg: "bg-slate-100",  icon: "text-slate-400",  text: "text-slate-600"  },
  };
  const c = colors[color] || colors.brand;
  const isEmpty = !value;

  return (
    <div className={`card p-5 flex flex-col gap-3 ${wide ? "sm:col-span-2 lg:col-span-1" : ""}`}>
      <div className={`w-9 h-9 rounded-xl ${c.bg} flex items-center justify-center shrink-0`}>
        <Icon className={`w-4 h-4 ${c.icon}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
        {isEmpty
          ? <div className="h-4 w-32 rounded-full bg-slate-100 animate-pulse" />
          : <p className="text-sm font-semibold text-slate-800 leading-snug line-clamp-2">{value}</p>
        }
      </div>
    </div>
  );
}

// ── Count card — numeric value ────────────────────────────────────────────────

function CountCard({ icon: Icon, label, count, color = "green" }) {
  const colors = {
    green: { bg: "bg-green-50",  icon: "text-green-500",  num: "text-green-700",  pill: "bg-green-100 text-green-700"  },
    amber: { bg: "bg-amber-50",  icon: "text-amber-500",  num: "text-amber-700",  pill: "bg-amber-100 text-amber-700"  },
    red:   { bg: "bg-red-50",    icon: "text-red-500",    num: "text-red-700",    pill: "bg-red-100 text-red-700"      },
  };
  const c = colors[color] || colors.green;
  const hasData = count !== null;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-9 h-9 rounded-xl ${c.bg} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${c.icon}`} />
        </div>
        {hasData && (
          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${c.pill}`}>
            {count}
          </span>
        )}
      </div>
      {hasData
        ? <p className={`text-3xl font-extrabold ${c.num} mb-1`}>{count}</p>
        : <div className="h-8 w-12 rounded-lg bg-slate-100 animate-pulse mb-1" />
      }
      <p className="text-xs text-slate-400 font-medium uppercase tracking-wide leading-tight">{label}</p>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onGoAnalyze }) {
  return (
    <div className="card p-8 flex flex-col items-center text-center gap-4">
      <div className="w-14 h-14 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center">
        <Gauge className="w-7 h-7 text-brand-400" />
      </div>
      <div>
        <p className="font-bold text-slate-700 text-base">No analysis loaded yet</p>
        <p className="text-sm text-slate-400 mt-1 max-w-xs">
          Upload a tender document in the Tender Analyzer to populate this dashboard with real data.
        </p>
      </div>
      <button onClick={onGoAnalyze} className="btn-primary text-sm">
        <ScanSearch className="w-4 h-4" />
        Go to Tender Analyzer
      </button>
    </div>
  );
}

// ── Required Documents section ───────────────────────────────────────────────

function RequiredDocumentsSection({ items = [] }) {
  if (items.length === 0) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
          <FileCheck2 className="w-4 h-4 text-brand-500" />
          <h3 className="text-sm font-semibold text-slate-700">Required Documents</h3>
          <span className="ml-auto text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">0</span>
        </div>
        <p className="text-sm text-slate-400 italic">No required documents found in the analysis.</p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
        <FileCheck2 className="w-4 h-4 text-brand-500" />
        <h3 className="text-sm font-semibold text-slate-700">Required Documents</h3>
        <span className="ml-auto text-xs font-bold text-brand-600 bg-brand-50 border border-brand-100 px-2.5 py-0.5 rounded-full">
          {items.length}
        </span>
      </div>

      {/* Scrollable list */}
      <div className="overflow-y-auto max-h-96 -mr-1 pr-1 space-y-2">
        {items.map((doc, i) => {
          const isMandatory = doc.mandatory === true || doc.mandatory === "true";
          const hasSection  = doc.section && doc.section !== "Not Specified";

          return (
            <div
              key={i}
              className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:border-brand-200 hover:bg-brand-50/30 transition-colors"
            >
              {/* Checkbox icon */}
              <div className="shrink-0 mt-0.5">
                {isMandatory
                  ? <CheckSquare className="w-4 h-4 text-brand-500" />
                  : <Square className="w-4 h-4 text-slate-300" />
                }
              </div>

              {/* Document info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 leading-snug">{doc.name}</p>
                {hasSection && (
                  <div className="flex items-center gap-1 mt-1">
                    <BookOpen className="w-3 h-3 text-slate-400 shrink-0" />
                    <p className="text-xs text-slate-400 truncate">{doc.section}</p>
                  </div>
                )}
              </div>

              {/* Mandatory badge */}
              <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${
                isMandatory
                  ? "bg-red-50 text-red-600 border border-red-200"
                  : "bg-slate-100 text-slate-500"
              }`}>
                {isMandatory ? "Mandatory" : "Optional"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Eligibility Requirements section ─────────────────────────────────────────

function EligibilityRequirementsSection({ items = [] }) {
  if (items.length === 0) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
          <Shield className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-slate-700">Eligibility Requirements</h3>
          <span className="ml-auto text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">0</span>
        </div>
        <p className="text-sm text-slate-400 italic">No eligibility requirements found in the analysis.</p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
        <Shield className="w-4 h-4 text-blue-500" />
        <h3 className="text-sm font-semibold text-slate-700">Eligibility Requirements</h3>
        <span className="ml-auto text-xs font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-0.5 rounded-full">
          {items.length}
        </span>
      </div>

      {/* Scrollable list */}
      <div className="overflow-y-auto max-h-96 -mr-1 pr-1 space-y-2">
        {items.map((req, i) => {
          const isMandatory = req.mandatory === true || req.mandatory === "true";
          const hasSection  = req.section && req.section !== "Not Specified";

          return (
            <div
              key={i}
              className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/30 transition-colors"
            >
              {/* Bullet */}
              <div className="shrink-0 mt-0.5">
                <CircleDot className="w-4 h-4 text-blue-400" />
              </div>

              {/* Requirement info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 leading-snug">{req.name}</p>
                {hasSection && (
                  <div className="flex items-center gap-1 mt-1">
                    <BookOpen className="w-3 h-3 text-slate-400 shrink-0" />
                    <p className="text-xs text-slate-400 truncate">{req.section}</p>
                  </div>
                )}
              </div>

              {/* Mandatory badge */}
              {isMandatory && (
                <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
                  Required
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Financial Requirements card ───────────────────────────────────────────────

const FINANCIAL_FIELDS = [
  { label: "Minimum Turnover",           keywords: ["turnover", "annual revenue", "annual turnover", "minimum revenue"] },
  { label: "Working Capital",            keywords: ["working capital", "net working capital"] },
  { label: "Audited Financial Statements", keywords: ["audited", "financial statement", "financial account", "financial report"] },
  { label: "Bank Reference",             keywords: ["bank reference", "bank letter", "banker", "bank confirmation"] },
  { label: "Financial Ratios",           keywords: ["ratio", "current ratio", "liquidity", "solvency", "financial ratio"] },
];

function extractFinancialField(items, keywords) {
  const match = items.find((item) =>
    keywords.some((kw) => item.name?.toLowerCase().includes(kw))
  );
  return match ? match.name : null;
}

function FinancialRequirementsCard({ items = [] }) {
  const fields = FINANCIAL_FIELDS.map(({ label, keywords }) => ({
    label,
    value: extractFinancialField(items, keywords),
  }));

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
        <DollarSign className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-slate-700">Financial Requirements</h3>
        {items.length > 0 && (
          <span className="ml-auto text-xs font-bold text-amber-600 bg-amber-50 border border-amber-100 px-2.5 py-0.5 rounded-full">
            {items.length} found
          </span>
        )}
      </div>

      {/* Field rows */}
      <div className="space-y-0">
        {fields.map(({ label, value }) => (
          <div
            key={label}
            className="flex flex-col sm:flex-row sm:items-start gap-1 py-3 border-b border-slate-50 last:border-0"
          >
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide sm:w-52 shrink-0 pt-0.5">
              {label}
            </span>
            {value ? (
              <p className="text-sm text-slate-800 font-medium leading-snug">{value}</p>
            ) : (
              <span className="flex items-center gap-1 text-sm text-slate-300 italic">
                <Minus className="w-3 h-3" /> Not Specified
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Raw items fallback — shows remaining items the keywords didn't bucket */}
      {items.length > 0 && (
        <details className="mt-3 group">
          <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600 font-medium select-none list-none flex items-center gap-1">
            <span className="group-open:hidden">▸</span>
            <span className="hidden group-open:inline">▾</span>
            View all {items.length} extracted items
          </summary>
          <div className="mt-3 overflow-y-auto max-h-56 -mr-1 pr-1 space-y-2">
            {items.map((req, i) => {
              const hasSection = req.section && req.section !== "Not Specified";
              return (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-amber-50/40 border border-amber-100">
                  <DollarSign className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 leading-snug">{req.name}</p>
                    {hasSection && (
                      <div className="flex items-center gap-1 mt-1">
                        <BookOpen className="w-3 h-3 text-slate-400 shrink-0" />
                        <p className="text-xs text-slate-400 truncate">{req.section}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}

// ── Personnel Requirements table ─────────────────────────────────────────────

function parsePersonnel(item) {
  const text = item.name || "";
  const lower = text.toLowerCase();

  // ── Position: everything before the first comma, parenthesis, or "with"
  const posMatch = text.match(/^([^,(]+?)(?:\s+with\b|\s*[,(]|$)/i);
  const position = posMatch ? posMatch[1].trim() : text;

  // ── Years of experience
  const yrsMatch = lower.match(/(\d+)\s*(?:\+\s*)?years?(?:\s+of(?:\s+relevant)?\s+experience)?/);
  const years = yrsMatch ? `${yrsMatch[1]}+ years` : "—";

  // ── Number required
  const numMatch = lower.match(
    /(?:minimum|min\.?|at\s+least|no\.?\s+of|number[:\s]+|×|x\s*)(\d+)|(\d+)\s+(?:no\.?s?|number|staff|personnel|required|positions?)/
  );
  const numRequired = numMatch ? (numMatch[1] || numMatch[2]) : "—";

  // ── Professional membership / certification
  const CERTS = [
    "PMP","PRINCE2","COREN","NSE","MNSE","RICS","ACCA","ICAN","CIPS",
    "CIOB","APM","PMI","MBA","MSc","M\.Sc","BSc","B\.Sc","HND","OND",
    "PhD","P\.hD","ASCE","ICE","RIBA","NEC","FIDIC","ISO","CPA","CFA",
  ];
  const certRx = new RegExp(`\\b(${CERTS.join("|")})\\b`, "i");
  const certMatch = text.match(certRx);
  const membership = certMatch ? certMatch[0].toUpperCase() : "—";

  // ── Qualification: degree-level keywords
  const qualRx = /\b(degree|bachelor|masters?|diploma|hnd|ond|phd|postgraduate|graduate|b\.?sc|m\.?sc|mba)\b/i;
  const qualMatch = text.match(qualRx);
  const qualification = qualMatch
    ? qualMatch[0].charAt(0).toUpperCase() + qualMatch[0].slice(1)
    : "—";

  return { position, qualification, years, membership, numRequired, section: item.section };
}

const PERSONNEL_COLS = [
  { key: "position",     label: "Position",              width: "min-w-[160px]" },
  { key: "qualification",label: "Qualification",         width: "min-w-[120px]" },
  { key: "years",        label: "Years of Experience",   width: "min-w-[130px]" },
  { key: "membership",   label: "Professional Membership", width: "min-w-[150px]" },
  { key: "numRequired",  label: "No. Required",          width: "min-w-[100px]" },
];

function PersonnelCell({ value }) {
  const isEmpty = !value || value === "—";
  return (
    <td className="px-4 py-3 text-sm align-top">
      {isEmpty
        ? <span className="text-slate-300 italic">—</span>
        : <span className="text-slate-800 font-medium">{value}</span>
      }
    </td>
  );
}

function PersonnelRequirementsTable({ items = [] }) {
  if (items.length === 0) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
          <Users className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-slate-700">Personnel Requirements</h3>
          <span className="ml-auto text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">0</span>
        </div>
        <p className="text-sm text-slate-400 italic">No personnel requirements found in the analysis.</p>
      </div>
    );
  }

  const rows = items.map(parsePersonnel);

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
        <Users className="w-4 h-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-slate-700">Personnel Requirements</h3>
        <span className="ml-auto text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full">
          {items.length}
        </span>
      </div>

      {/* Scrollable table */}
      <div className="overflow-x-auto overflow-y-auto max-h-96 rounded-xl border border-slate-100">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-slate-50 z-10">
            <tr>
              {PERSONNEL_COLS.map(({ key, label, width }) => (
                <th
                  key={key}
                  className={`px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 ${width}`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                {PERSONNEL_COLS.map(({ key }) => (
                  <PersonnelCell key={key} value={row[key]} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Section references below table */}
      {rows.some((r) => r.section && r.section !== "Not Specified") && (
        <div className="mt-3 space-y-1">
          {rows.map((row, i) =>
            row.section && row.section !== "Not Specified" ? (
              <div key={i} className="flex items-center gap-1.5 text-xs text-slate-400">
                <BookOpen className="w-3 h-3 shrink-0" />
                <span className="font-medium text-slate-500">{row.position}:</span>
                <span>{row.section}</span>
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}

// ── Equipment Requirements table ──────────────────────────────────────────────

function parseEquipment(item) {
  const text = item.name || "";
  const lower = text.toLowerCase();

  // ── Equipment Name: everything before the first comma, parenthesis, colon, or digit quantity
  const nameMatch = text.match(/^([^,(:\d]+?)(?:\s*[,(:–-]|\s+\d|\s+(?:minimum|min|at least|owned|leased|lease)|$)/i);
  const equipmentName = nameMatch ? nameMatch[1].trim() : text.trim();

  // ── Quantity: digits preceded/followed by quantity indicators
  const qtyMatch = lower.match(
    /(\d+)\s*(?:no\.?s?|units?|sets?|pieces?|nos?\.?|vehicles?|machines?)|(?:minimum|min\.?|at\s+least)\s+(\d+)/i
  );
  const quantity = qtyMatch ? (qtyMatch[1] || qtyMatch[2]) : "—";

  // ── Ownership requirement
  const ownsRx = /\b(own(?:ed|ership)?|outright\s+ownership|company.?owned|must\s+own|proof\s+of\s+ownership)\b/i;
  const ownership = ownsRx.test(lower) ? "Owned" : "—";

  // ── Lease allowed
  const leaseRx  = /\b(lease[d]?|rent(?:ed)?|hir(?:ed)?|access|available|sourced?)\b/i;
  const leaseAllowed = leaseRx.test(lower)
    ? "Yes"
    : ownership === "Owned"
    ? "No"
    : "—";

  return { equipmentName, quantity, ownership, leaseAllowed, section: item.section };
}

const EQUIPMENT_COLS = [
  { key: "equipmentName", label: "Equipment Name",        width: "min-w-[180px]" },
  { key: "quantity",      label: "Quantity",               width: "min-w-[90px]"  },
  { key: "ownership",     label: "Ownership Requirement",  width: "min-w-[150px]" },
  { key: "leaseAllowed",  label: "Lease Allowed",          width: "min-w-[110px]" },
];

function EquipmentCell({ col, value }) {
  const isEmpty = !value || value === "—";

  if (col === "leaseAllowed" && !isEmpty) {
    return (
      <td className="px-4 py-3 text-sm align-top">
        {value === "Yes"
          ? <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold"><CheckCircle2 className="w-3.5 h-3.5" /> Yes</span>
          : <span className="inline-flex items-center gap-1 text-red-500 font-semibold"><XCircle className="w-3.5 h-3.5" /> No</span>
        }
      </td>
    );
  }
  if (col === "ownership" && !isEmpty) {
    return (
      <td className="px-4 py-3 text-sm align-top">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">
          {value}
        </span>
      </td>
    );
  }
  return (
    <td className="px-4 py-3 text-sm align-top">
      {isEmpty
        ? <span className="text-slate-300 italic">—</span>
        : <span className="text-slate-800 font-medium">{value}</span>
      }
    </td>
  );
}

function EquipmentRequirementsTable({ items = [] }) {
  if (items.length === 0) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
          <Wrench className="w-4 h-4 text-orange-500" />
          <h3 className="text-sm font-semibold text-slate-700">Equipment Requirements</h3>
          <span className="ml-auto text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">0</span>
        </div>
        <p className="text-sm text-slate-400 italic">No equipment requirements found in the analysis.</p>
      </div>
    );
  }

  const rows = items.map(parseEquipment);

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
        <Wrench className="w-4 h-4 text-orange-500" />
        <h3 className="text-sm font-semibold text-slate-700">Equipment Requirements</h3>
        <span className="ml-auto text-xs font-bold text-orange-600 bg-orange-50 border border-orange-100 px-2.5 py-0.5 rounded-full">
          {items.length}
        </span>
      </div>

      {/* Scrollable table */}
      <div className="overflow-x-auto overflow-y-auto max-h-96 rounded-xl border border-slate-100">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-slate-50 z-10">
            <tr>
              {EQUIPMENT_COLS.map(({ key, label, width }) => (
                <th
                  key={key}
                  className={`px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 ${width}`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-orange-50/30 transition-colors">
                {EQUIPMENT_COLS.map(({ key }) => (
                  <EquipmentCell key={key} col={key} value={row[key]} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Section references */}
      {rows.some((r) => r.section && r.section !== "Not Specified") && (
        <div className="mt-3 space-y-1">
          {rows.map((row, i) =>
            row.section && row.section !== "Not Specified" ? (
              <div key={i} className="flex items-center gap-1.5 text-xs text-slate-400">
                <BookOpen className="w-3 h-3 shrink-0" />
                <span className="font-medium text-slate-500">{row.equipmentName}:</span>
                <span>{row.section}</span>
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}

// ── Evaluation Criteria section ───────────────────────────────────────────────

const EVAL_TABS = [
  { key: "administrativeEvaluation", label: "Administrative", short: "Admin",     icon: ListChecks },
  { key: "technicalEvaluation",      label: "Technical",      short: "Technical", icon: BarChart3  },
  { key: "financialEvaluation",      label: "Financial",      short: "Financial", icon: DollarSign },
  { key: "passMark",                 label: "Pass Mark",      short: "Pass Mark", icon: Trophy     },
  { key: "weightedScores",           label: "Weighted Scores",short: "Weighted",  icon: BarChart3  },
];

function EvalItemRow({ item, showWeight }) {
  const hasSection = item.section && item.section !== "Not Specified";
  const hasWeight  = showWeight && item.weight && item.weight !== "Not Specified";
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:border-teal-200 hover:bg-teal-50/20 transition-colors">
      <BarChart3 className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 leading-snug">{item.name}</p>
        {hasSection && (
          <div className="flex items-center gap-1 mt-1">
            <BookOpen className="w-3 h-3 text-slate-400 shrink-0" />
            <p className="text-xs text-slate-400 truncate">{item.section}</p>
          </div>
        )}
      </div>
      {hasWeight && (
        <span className="shrink-0 text-xs font-bold px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
          {item.weight}
        </span>
      )}
    </div>
  );
}

function EvaluationCriteriaSection({ ec = {} }) {
  const [activeTab, setActiveTab] = useState(0);

  const tabs = EVAL_TABS.map((t) => ({
    ...t,
    items: ec[t.key] || [],
  }));

  const totalItems = tabs.reduce((n, t) => n + t.items.length, 0);
  const active = tabs[activeTab];
  const showWeight = active.key === "technicalEvaluation"
    || active.key === "financialEvaluation"
    || active.key === "weightedScores";

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
        <BarChart3 className="w-4 h-4 text-teal-500" />
        <h3 className="text-sm font-semibold text-slate-700">Evaluation Criteria</h3>
        {totalItems > 0 && (
          <span className="ml-auto text-xs font-bold text-teal-600 bg-teal-50 border border-teal-100 px-2.5 py-0.5 rounded-full">
            {totalItems} criteria
          </span>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto pb-1 mb-4 -mx-1 px-1">
        {tabs.map((tab, i) => {
          const Icon = tab.icon;
          const isActive = i === activeTab;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(i)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors shrink-0 ${
                isActive
                  ? "bg-teal-500 text-white shadow-sm"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              <Icon className="w-3 h-3" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.short}</span>
              {tab.items.length > 0 && (
                <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  isActive ? "bg-white/25 text-white" : "bg-slate-200 text-slate-500"
                }`}>
                  {tab.items.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {active.items.length === 0 ? (
        <p className="text-sm text-slate-400 italic">
          No {active.label.toLowerCase()} criteria found in the analysis.
        </p>
      ) : (
        <div className="overflow-y-auto max-h-80 -mr-1 pr-1 space-y-2">
          {active.items.map((item, i) => (
            <EvalItemRow key={i} item={item} showWeight={showWeight} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Remaining placeholder building blocks ────────────────────────────────────

function SectionCard({ icon: Icon, title, children }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
        <Icon className="w-4 h-4 text-brand-500" />
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function PlaceholderRow({ wide = false }) {
  return (
    <div className={`h-3 rounded-full bg-slate-100 animate-pulse ${wide ? "w-4/5" : "w-3/5"}`} />
  );
}

function PlaceholderListItem({ badge = false }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-0">
      <div className="w-6 h-6 rounded-lg bg-slate-100 animate-pulse shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-2.5 bg-slate-100 rounded-full w-3/4 animate-pulse" />
        <div className="h-2 bg-slate-50 rounded-full w-1/2 animate-pulse" />
      </div>
      {badge && <div className="w-16 h-5 rounded-full bg-slate-100 animate-pulse shrink-0" />}
    </div>
  );
}

function PlaceholderTimelineItem() {
  return (
    <div className="flex gap-3 py-2.5 border-b border-slate-50 last:border-0">
      <div className="flex flex-col items-center pt-0.5">
        <div className="w-2 h-2 rounded-full bg-slate-200 animate-pulse" />
        <div className="w-0.5 flex-1 bg-slate-100 mt-1" />
      </div>
      <div className="flex-1 pb-1 space-y-1.5">
        <div className="h-2.5 bg-slate-100 rounded-full w-2/3 animate-pulse" />
        <div className="h-2 bg-slate-50 rounded-full w-1/3 animate-pulse" />
      </div>
      <div className="w-20 h-5 rounded-full bg-slate-100 animate-pulse shrink-0" />
    </div>
  );
}

function PlaceholderActionItem() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-brand-200 transition-colors">
      <div className="w-8 h-8 rounded-lg bg-slate-100 animate-pulse shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-2.5 bg-slate-100 rounded-full w-2/3 animate-pulse" />
        <div className="h-2 bg-slate-50 rounded-full w-2/5 animate-pulse" />
      </div>
      <ArrowRight className="w-4 h-4 text-slate-200 shrink-0" />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TenderReadinessDashboard() {
  const navigate  = useNavigate();
  const saved     = useTenderAnalysis();
  const analysis  = saved?.analysis || null;
  const ti        = analysis?.tenderInfo        || {};
  const sd        = analysis?.submissionDetails || {};
  const hasData   = !!analysis;

  const tenderTitle   = val(ti.tenderTitle)   || val(saved?.tenderName) || null;
  const procEntity    = val(ti.procuringEntity) || null;
  const deadline      = val(sd.submissionDeadline) || null;
  const docsCount     = hasData ? (analysis.requiredDocuments?.length    ?? 0) : null;
  const eligCount     = hasData ? (analysis.eligibilityRequirements?.length ?? 0) : null;
  const riskCount     = hasData ? (analysis.disqualificationRisks?.length   ?? 0) : null;

  const savedAt = saved?.savedAt
    ? new Date(saved.savedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Gauge className="w-5 h-5 text-brand-500" />
            <h1 className="text-xl font-bold text-slate-900">Tender Readiness Dashboard</h1>
          </div>
          <p className="text-sm text-slate-500">
            A readiness snapshot for your active tender.
            {!hasData && " Run an analysis in the Tender Analyzer to populate this dashboard."}
          </p>
        </div>

        {hasData && savedAt ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
            <BadgeCheck className="w-3 h-3" />
            Analysis loaded · {savedAt}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-slate-100 text-slate-400">
            <Clock className="w-3 h-3" />
            No analysis loaded
          </span>
        )}
      </div>

      {/* Empty state or summary cards */}
      {!hasData ? (
        <EmptyState onGoAnalyze={() => navigate("/tender-analyzer")} />
      ) : (
        <>
          {/* ── Row 1: Info cards — Tender Title, Procuring Entity, Deadline ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <InfoCard
              icon={FileText}
              label="Tender Title"
              value={tenderTitle}
              color="brand"
            />
            <InfoCard
              icon={Building2}
              label="Procuring Entity"
              value={procEntity}
              color="brand"
            />
            <InfoCard
              icon={Calendar}
              label="Submission Deadline"
              value={deadline}
              color="violet"
            />
          </div>

          {/* ── Row 2: Count cards — Docs, Eligibility, Risks ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <CountCard
              icon={FileCheck2}
              label="Required Documents"
              count={docsCount}
              color="green"
            />
            <CountCard
              icon={ClipboardList}
              label="Eligibility Requirements"
              count={eligCount}
              color="amber"
            />
            <CountCard
              icon={AlertOctagon}
              label="Disqualification Risks"
              count={riskCount}
              color="red"
            />
          </div>

          {/* ── Required Documents checklist ── */}
          <RequiredDocumentsSection items={analysis.requiredDocuments || []} />

          {/* ── Eligibility Requirements list ── */}
          <EligibilityRequirementsSection items={analysis.eligibilityRequirements || []} />

          {/* ── Financial Requirements card ── */}
          <FinancialRequirementsCard items={analysis.financialRequirements || []} />

          {/* ── Personnel Requirements table ── */}
          <PersonnelRequirementsTable items={analysis.personnelRequirements || []} />

          {/* ── Equipment Requirements table ── */}
          <EquipmentRequirementsTable items={analysis.equipmentRequirements || []} />

          {/* ── Evaluation Criteria ── */}
          <EvaluationCriteriaSection ec={analysis.evaluationCriteria || {}} />
        </>
      )}

      {/* ── Placeholder sections (always shown below) ─────────────────────── */}

      {/* Document compliance + Key dates */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard icon={FileCheck2} title="Document Compliance">
          <div className="space-y-0.5">
            {[...Array(5)].map((_, i) => (
              <PlaceholderListItem key={i} badge />
            ))}
          </div>
        </SectionCard>

        <SectionCard icon={CalendarClock} title="Key Dates">
          <div className="space-y-0.5">
            {[...Array(5)].map((_, i) => (
              <PlaceholderTimelineItem key={i} />
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Eligibility + Risk factors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard icon={ClipboardList} title="Eligibility & Qualification">
          <div className="space-y-2">
            <PlaceholderRow wide />
            <PlaceholderRow />
            <PlaceholderRow wide />
            <PlaceholderRow />
            <PlaceholderRow wide />
          </div>
          <div className="mt-4 pt-3 border-t border-slate-50 space-y-0.5">
            {[...Array(3)].map((_, i) => (
              <PlaceholderListItem key={i} badge />
            ))}
          </div>
        </SectionCard>

        <SectionCard icon={ShieldAlert} title="Risk Factors">
          <div className="space-y-2 mb-4">
            <PlaceholderRow wide />
            <PlaceholderRow />
          </div>
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50">
                <div className="w-4 h-4 rounded bg-slate-200 animate-pulse mt-0.5 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-2.5 bg-slate-200 rounded-full w-3/4 animate-pulse" />
                  <div className="h-2 bg-slate-100 rounded-full w-1/2 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Action items */}
      <SectionCard icon={ClipboardList} title="Action Items">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => (
            <PlaceholderActionItem key={i} />
          ))}
        </div>
      </SectionCard>

    </div>
  );
}
