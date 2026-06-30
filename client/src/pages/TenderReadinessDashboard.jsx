import React from "react";
import {
  FileCheck2,
  CalendarClock,
  ShieldAlert,
  ClipboardList,
  AlertTriangle,
  BadgeCheck,
  Clock,
  TrendingUp,
  ArrowRight,
  Gauge,
} from "lucide-react";

// ── Placeholder building blocks ─────────────────────────────────────────────

function StatCard({ icon: Icon, label, color = "brand" }) {
  const colors = {
    brand:  { bg: "bg-brand-50",   icon: "text-brand-500",  bar: "bg-brand-200"  },
    green:  { bg: "bg-green-50",   icon: "text-green-500",  bar: "bg-green-200"  },
    amber:  { bg: "bg-amber-50",   icon: "text-amber-500",  bar: "bg-amber-200"  },
    red:    { bg: "bg-red-50",     icon: "text-red-500",    bar: "bg-red-200"    },
  };
  const c = colors[color] || colors.brand;
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-9 h-9 rounded-xl ${c.bg} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${c.icon}`} />
        </div>
        <div className={`h-2 w-16 rounded-full ${c.bar} animate-pulse`} />
      </div>
      <div className={`h-7 w-20 rounded-lg ${c.bar} animate-pulse mb-2`} />
      <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</p>
    </div>
  );
}

function PlaceholderRow({ wide = false }) {
  return (
    <div className={`h-3 rounded-full bg-slate-100 animate-pulse ${wide ? "w-4/5" : "w-3/5"}`} />
  );
}

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

// ── Gauge ring placeholder ───────────────────────────────────────────────────

function ReadinessGauge() {
  return (
    <div className="flex flex-col items-center justify-center py-4">
      <div className="relative w-28 h-28">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r="50" fill="none" stroke="#e2e8f0" strokeWidth="12" />
          <circle
            cx="60" cy="60" r="50"
            fill="none"
            stroke="#cbd5e1"
            strokeWidth="12"
            strokeDasharray="314"
            strokeDashoffset="94"
            strokeLinecap="round"
            className="animate-pulse"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="w-10 h-6 rounded-lg bg-slate-100 animate-pulse mb-1" />
          <div className="w-6 h-2 rounded-full bg-slate-100 animate-pulse" />
        </div>
      </div>
      <p className="text-xs text-slate-400 font-medium mt-2">Overall Readiness Score</p>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function TenderReadinessDashboard() {
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
            A full readiness snapshot for your active tender. Run an analysis in the Tender Analyzer to populate this dashboard.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-slate-100 text-slate-400">
          <Clock className="w-3 h-3" />
          No analysis loaded
        </span>
      </div>

      {/* Top stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp}   label="Readiness Score"    color="brand" />
        <StatCard icon={BadgeCheck}   label="Documents Ready"    color="green" />
        <StatCard icon={AlertTriangle} label="Outstanding Items" color="amber" />
        <StatCard icon={CalendarClock} label="Days to Deadline"  color="red"   />
      </div>

      {/* Readiness gauge + Document compliance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Gauge */}
        <div className="card p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
            <Gauge className="w-4 h-4 text-brand-500" />
            <h3 className="text-sm font-semibold text-slate-700">Readiness Score</h3>
          </div>
          <ReadinessGauge />
          <div className="mt-4 space-y-2">
            {["Documents", "Eligibility", "Financial", "Technical"].map((label) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-20 shrink-0">{label}</span>
                <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full w-0 bg-slate-200 rounded-full animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Document compliance */}
        <SectionCard icon={FileCheck2} title="Document Compliance">
          <div className="space-y-0.5">
            {[...Array(5)].map((_, i) => (
              <PlaceholderListItem key={i} badge />
            ))}
          </div>
        </SectionCard>

        {/* Key dates */}
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

      {/* Action items — full width */}
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
