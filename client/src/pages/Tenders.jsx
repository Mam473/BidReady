import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload, FileText, Trash2, Clock, Calendar, Plus,
  X, AlertCircle, BarChart3, Timer,
} from "lucide-react";

function useCountdown(deadlineIso) {
  const [time, setTime] = useState(getTimeLeft(deadlineIso));

  function getTimeLeft(iso) {
    if (!iso) return null;
    const diff = new Date(iso) - Date.now();
    if (diff <= 0) return { expired: true };
    const days    = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours   = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return { days, hours, minutes, seconds, expired: false };
  }

  useEffect(() => {
    if (!deadlineIso) return;
    const id = setInterval(() => setTime(getTimeLeft(deadlineIso)), 1000);
    return () => clearInterval(id);
  }, [deadlineIso]);

  return time;
}

function CountdownBanner({ tender }) {
  const t = useCountdown(tender.deadline);
  if (!t) return null;

  const urgency = t.expired ? "expired"
    : t.days <= 2 ? "critical"
    : t.days <= 7 ? "urgent"
    : "normal";

  const styles = {
    expired:  "bg-danger-50  border-danger-500/30  text-danger-700",
    critical: "bg-danger-50  border-danger-500/30  text-danger-700",
    urgent:   "bg-warning-50 border-warning-500/30 text-warning-700",
    normal:   "bg-brand-50   border-brand-400/30   text-brand-700",
  };

  const iconStyles = {
    expired:  "bg-danger-100  text-danger-600",
    critical: "bg-danger-100  text-danger-600",
    urgent:   "bg-warning-100 text-warning-600",
    normal:   "bg-brand-100   text-brand-600",
  };

  return (
    <div className={`rounded-2xl border p-4 flex items-start gap-3 ${styles[urgency]} animate-scale-in`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconStyles[urgency]}`}>
        <Timer className="w-5 h-5" />
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-sm">
            {t.expired ? "Deadline Passed" : "Submission Deadline"}
          </p>
          <span className="text-xs opacity-70">
            {new Date(tender.deadline).toLocaleDateString("en-GB", {
              weekday: "short", day: "numeric", month: "short", year: "numeric",
            })}
          </span>
        </div>
        {t.expired ? (
          <p className="text-xs mt-0.5 opacity-80">This tender's deadline has passed.</p>
        ) : (
          <div className="flex items-center gap-3 mt-1.5">
            {[
              { val: t.days,    label: "days" },
              { val: t.hours,   label: "hrs" },
              { val: t.minutes, label: "min" },
              { val: t.seconds, label: "sec" },
            ].map(({ val, label }) => (
              <div key={label} className="text-center">
                <span className="font-bold text-lg tabular-nums leading-none">{String(val).padStart(2, "0")}</span>
                <p className="text-xs opacity-60">{label}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Tenders() {
  const navigate = useNavigate();
  const [tenders, setTenders] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", deadline: "", content: "", fileName: "" });
  const [errors, setErrors] = useState({});
  const [dragOver, setDragOver] = useState(false);
  const [activeTender, setActiveTender] = useState(null);
  const fileRef = useRef();

  useEffect(() => {
    const stored = localStorage.getItem("bidready_tenders");
    if (stored) {
      const parsed = JSON.parse(stored);
      setTenders(parsed);
      if (parsed.length > 0) setActiveTender(parsed[0].id);
    }
  }, []);

  function saveTenders(updated) {
    setTenders(updated);
    localStorage.setItem("bidready_tenders", JSON.stringify(updated));
  }

  function handleFile(file) {
    if (!file || file.type !== "application/pdf") {
      alert("Please upload a PDF file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const mockText = `PROCUREMENT REQUIREMENTS — ${file.name.replace(".pdf", "").toUpperCase()}

1. ELIGIBILITY REQUIREMENTS
   1.1 The bidder must be a registered company with CAC with a valid Certificate of Incorporation.
   1.2 Provide evidence of Tax Clearance Certificate for the last three (3) years.
   1.3 PENCOM Clearance Certificate must be current and valid.
   1.4 NSITF Compliance Certificate is mandatory.
   1.5 ITF Certificate must be submitted.
   1.6 Audited Financial Statements for the past three (3) years must be provided.

2. TECHNICAL REQUIREMENTS
   2.1 Minimum of 5 years experience in the relevant sector.
   2.2 Evidence of similar jobs carried out within the last 5 years.
   2.3 Company profile with key personnel CVs.
   2.4 ISO 9001 certification (where applicable).

3. FINANCIAL REQUIREMENTS
   3.1 Minimum annual turnover of ₦50,000,000.
   3.2 Evidence of financial capacity (bank statement for last 12 months).
   3.3 Bank reference letter.

4. OTHER REQUIREMENTS
   4.1 Sworn affidavit of due process compliance.
   4.2 Company must not be on any government exclusion/blacklist.
   4.3 Evidence of payment of tender fee.

FILE: ${file.name}`;

      setForm((f) => ({
        ...f,
        name: f.name || file.name.replace(".pdf", ""),
        fileName: file.name,
        content: mockText,
      }));
      setShowModal(true);
    };
    reader.readAsDataURL(file);
  }

  function validate() {
    const e = {};
    if (!form.name.trim()) e.name = "Tender name is required";
    if (!form.deadline) e.deadline = "Submission deadline is required";
    else if (new Date(form.deadline) <= new Date()) e.deadline = "Deadline must be in the future";
    return e;
  }

  function handleSave() {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    const tender = {
      id: Date.now().toString(),
      name: form.name.trim(),
      deadline: new Date(form.deadline).toISOString(),
      content: form.content || "General procurement requirements — please review tender document.",
      fileName: form.fileName || `${form.name}.pdf`,
      uploadedAt: new Date().toISOString(),
    };
    const updated = [tender, ...tenders];
    saveTenders(updated);
    setActiveTender(tender.id);
    setShowModal(false);
    setForm({ name: "", deadline: "", content: "", fileName: "" });
    setErrors({});
  }

  function handleDelete(id) {
    const updated = tenders.filter((t) => t.id !== id);
    saveTenders(updated);
    if (activeTender === id) setActiveTender(updated[0]?.id || null);
  }

  function handleAnalyse(tender) {
    localStorage.setItem("bidready_active_tender", JSON.stringify(tender));
    navigate("/analysis");
  }

  const active = tenders.find((t) => t.id === activeTender);

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tenders</h1>
          <p className="text-slate-500 text-sm mt-1">
            Upload procurement requirement documents for AI compliance analysis
          </p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Add Tender
        </button>
      </div>

      {/* Active tender countdown */}
      {active && <CountdownBanner tender={active} />}

      {/* Tender list */}
      {tenders.length > 0 ? (
        <div className="space-y-3">
          {tenders.map((tender, i) => (
            <div
              key={tender.id}
              className={`card p-4 flex items-center gap-4 animate-fade-in-up stagger-${Math.min(i + 1, 5)} cursor-pointer hover:shadow-md transition-all ${
                activeTender === tender.id ? "ring-2 ring-brand-400" : ""
              }`}
              onClick={() => setActiveTender(tender.id)}
            >
              <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-brand-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 text-sm truncate">{tender.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <p className="text-xs text-slate-500">
                    Deadline: {new Date(tender.deadline).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); handleAnalyse(tender); }}
                  className="btn-primary py-2 px-3 text-xs"
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  Analyse
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(tender.id); }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-danger-500 hover:bg-danger-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-200 ${
            dragOver ? "border-brand-400 bg-brand-50 scale-[1.01]" : "border-slate-200 hover:border-brand-300 hover:bg-brand-50/50"
          }`}
        >
          <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
          <div className="w-14 h-14 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center mx-auto mb-4">
            <Upload className="w-7 h-7 text-brand-500" />
          </div>
          <p className="font-semibold text-slate-700">Drop a tender PDF here or click to browse</p>
          <p className="text-sm text-slate-400 mt-1.5">Upload a government procurement requirement document to begin compliance analysis</p>
        </div>
      )}

      {/* Upload zone when there are existing tenders */}
      {tenders.length > 0 && (
        <div
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 ${
            dragOver ? "border-brand-400 bg-brand-50" : "border-slate-200 hover:border-brand-300 hover:bg-brand-50/50"
          }`}
        >
          <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
          <Upload className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
          <p className="text-sm text-slate-500 font-medium">Drop another tender PDF here</p>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 animate-scale-in">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-900">Add Tender</h2>
              <button
                onClick={() => { setShowModal(false); setForm({ name: "", deadline: "", content: "", fileName: "" }); setErrors({}); }}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {form.fileName && (
              <div className="flex items-center gap-2 mb-4 p-3 bg-brand-50 rounded-xl border border-brand-100">
                <FileText className="w-4 h-4 text-brand-600" />
                <span className="text-sm text-brand-700 font-medium truncate">{form.fileName}</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="label">Tender / Project Name</label>
                <input
                  type="text"
                  className={`input ${errors.name ? "border-danger-500" : ""}`}
                  placeholder="e.g. Supply of Medical Equipment 2024"
                  value={form.name}
                  onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors({ ...errors, name: "" }); }}
                />
                {errors.name && <p className="text-xs text-danger-600 mt-1">{errors.name}</p>}
              </div>

              <div>
                <label className="label">Submission Deadline</label>
                <input
                  type="datetime-local"
                  className={`input ${errors.deadline ? "border-danger-500" : ""}`}
                  value={form.deadline}
                  min={new Date().toISOString().slice(0, 16)}
                  onChange={(e) => { setForm({ ...form, deadline: e.target.value }); setErrors({ ...errors, deadline: "" }); }}
                />
                {errors.deadline && <p className="text-xs text-danger-600 mt-1">{errors.deadline}</p>}
              </div>

              {!form.fileName && (
                <div>
                  <label className="label">Tender Requirements <span className="text-slate-400 font-normal">(optional)</span></label>
                  <textarea
                    className="input resize-none"
                    rows={4}
                    placeholder="Paste key requirements or upload a PDF above…"
                    value={form.content}
                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                  />
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setShowModal(false); setForm({ name: "", deadline: "", content: "", fileName: "" }); setErrors({}); }}
                  className="btn-secondary flex-1 justify-center"
                >
                  Cancel
                </button>
                <button onClick={handleSave} className="btn-primary flex-1 justify-center">
                  Save Tender
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
