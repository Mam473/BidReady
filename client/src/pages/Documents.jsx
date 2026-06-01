import React, { useState, useEffect, useRef } from "react";
import {
  Upload, FileText, Trash2, AlertTriangle, CheckCircle2,
  Clock, Calendar, Plus, X, ShieldCheck,
} from "lucide-react";

const DOC_TYPES = [
  "Tax Clearance Certificate",
  "CAC Certificate of Incorporation",
  "PENCOM Certificate",
  "NSITF Certificate",
  "ITF Certificate",
  "Industrial Training Fund",
  "Audited Financial Statement",
  "Company Profile",
  "Professional License",
  "ISO Certification",
  "Other",
];

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function DocStatusBadge({ expiryDate }) {
  const days = daysUntil(expiryDate);
  if (days === null) return <span className="badge-met">No Expiry</span>;
  if (days < 0) return <span className="badge-expired flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Expired</span>;
  if (days <= 30) return <span className="badge-expired flex items-center gap-1"><Clock className="w-3 h-3" />Expiring {days}d</span>;
  return <span className="badge-met flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Valid</span>;
}

export default function Documents() {
  const [docs, setDocs] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", type: "", expiryDate: "" });
  const [errors, setErrors] = useState({});
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    const stored = localStorage.getItem("bidready_documents");
    if (stored) setDocs(JSON.parse(stored));
  }, []);

  function saveDocs(updated) {
    setDocs(updated);
    localStorage.setItem("bidready_documents", JSON.stringify(updated));
  }

  function handleFile(file) {
    if (!file || file.type !== "application/pdf") {
      alert("Please upload a PDF file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setForm((f) => ({
        ...f,
        name: f.name || file.name.replace(".pdf", ""),
        fileName: file.name,
        fileData: e.target.result,
      }));
      setShowModal(true);
    };
    reader.readAsDataURL(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }

  function validate() {
    const e = {};
    if (!form.name.trim()) e.name = "Document name is required";
    if (!form.type) e.type = "Document type is required";
    return e;
  }

  function handleSave() {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    const doc = {
      id: Date.now().toString(),
      name: form.name.trim(),
      type: form.type,
      expiryDate: form.expiryDate || null,
      fileName: form.fileName || `${form.name}.pdf`,
      uploadedAt: new Date().toISOString(),
    };
    saveDocs([...docs, doc]);
    setShowModal(false);
    setForm({ name: "", type: "", expiryDate: "" });
    setErrors({});
  }

  function handleDelete(id) {
    saveDocs(docs.filter((d) => d.id !== id));
  }

  const expiringSoon = docs.filter((d) => {
    const days = daysUntil(d.expiryDate);
    return days !== null && days >= 0 && days <= 30;
  });
  const expired = docs.filter((d) => {
    const days = daysUntil(d.expiryDate);
    return days !== null && days < 0;
  });

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Compliance Documents</h1>
          <p className="text-slate-500 text-sm mt-1">
            Upload and manage your government compliance certificates
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="btn-primary"
        >
          <Plus className="w-4 h-4" />
          Add Document
        </button>
      </div>

      {/* Expiry banner */}
      {(expiringSoon.length > 0 || expired.length > 0) && (
        <div className="rounded-2xl bg-warning-50 border border-warning-500/30 p-4 flex items-start gap-3 animate-scale-in">
          <div className="w-9 h-9 rounded-xl bg-warning-500/20 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-warning-600" />
          </div>
          <div>
            <p className="font-semibold text-warning-700 text-sm">Document Expiry Alert</p>
            <p className="text-warning-600 text-xs mt-0.5">
              {expired.length > 0 && `${expired.length} document${expired.length > 1 ? "s" : ""} expired. `}
              {expiringSoon.length > 0 && `${expiringSoon.length} document${expiringSoon.length > 1 ? "s" : ""} expiring within 30 days.`}
              {" "}Renew before submitting tenders.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {[...expired, ...expiringSoon].map((d) => (
                <span key={d.id} className="text-xs bg-warning-500/20 text-warning-700 px-2 py-0.5 rounded-full font-medium">
                  {d.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Documents", value: docs.length, color: "brand" },
          { label: "Valid", value: docs.filter(d => { const days = daysUntil(d.expiryDate); return days === null || days > 30; }).length, color: "success" },
          { label: "Expiring / Expired", value: expiringSoon.length + expired.length, color: "warning" },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4 text-center">
            <p className={`text-2xl font-bold text-${color}-600`}>{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Upload drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${
          dragOver
            ? "border-brand-400 bg-brand-50 scale-[1.01]"
            : "border-slate-200 hover:border-brand-300 hover:bg-brand-50/50"
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => handleFile(e.target.files[0])}
        />
        <div className="w-12 h-12 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center mx-auto mb-3">
          <Upload className="w-6 h-6 text-brand-500" />
        </div>
        <p className="font-semibold text-slate-700 text-sm">Drop a PDF here or click to browse</p>
        <p className="text-xs text-slate-400 mt-1">Supports Tax Clearance, CAC Certificates, PENCOM, NSITF, and more</p>
      </div>

      {/* Document list */}
      {docs.length > 0 ? (
        <div className="space-y-3">
          {docs.map((doc, i) => (
            <div
              key={doc.id}
              className={`card p-4 flex items-center gap-4 animate-fade-in-up stagger-${Math.min(i + 1, 5)} hover:shadow-md transition-shadow`}
            >
              <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-brand-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 text-sm truncate">{doc.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">{doc.type}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {doc.expiryDate && (
                  <div className="hidden sm:flex items-center gap-1 text-xs text-slate-400">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(doc.expiryDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </div>
                )}
                <DocStatusBadge expiryDate={doc.expiryDate} />
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-danger-500 hover:bg-danger-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-12 text-center">
          <ShieldCheck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="font-semibold text-slate-500">No documents yet</p>
          <p className="text-sm text-slate-400 mt-1">Upload your compliance certificates to get started</p>
        </div>
      )}

      {/* Add Document Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 animate-scale-in">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-900">Add Compliance Document</h2>
              <button
                onClick={() => { setShowModal(false); setForm({ name: "", type: "", expiryDate: "" }); setErrors({}); }}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
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
                <label className="label">Document Name</label>
                <input
                  type="text"
                  className={`input ${errors.name ? "border-danger-500" : ""}`}
                  placeholder="e.g. Tax Clearance Certificate 2024"
                  value={form.name}
                  onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors({ ...errors, name: "" }); }}
                />
                {errors.name && <p className="text-xs text-danger-600 mt-1">{errors.name}</p>}
              </div>

              <div>
                <label className="label">Document Type</label>
                <select
                  className={`input ${errors.type ? "border-danger-500" : ""}`}
                  value={form.type}
                  onChange={(e) => { setForm({ ...form, type: e.target.value }); setErrors({ ...errors, type: "" }); }}
                >
                  <option value="">Select type…</option>
                  {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                {errors.type && <p className="text-xs text-danger-600 mt-1">{errors.type}</p>}
              </div>

              <div>
                <label className="label">Expiry Date <span className="text-slate-400 font-normal">(optional)</span></label>
                <input
                  type="date"
                  className="input"
                  value={form.expiryDate}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setShowModal(false); setForm({ name: "", type: "", expiryDate: "" }); setErrors({}); }}
                  className="btn-secondary flex-1 justify-center"
                >
                  Cancel
                </button>
                <button onClick={handleSave} className="btn-primary flex-1 justify-center">
                  Save Document
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
