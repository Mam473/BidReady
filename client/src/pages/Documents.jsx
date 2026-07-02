import React, { useState, useEffect, useRef } from "react";
import {
  Upload, FileText, Trash2, AlertTriangle, CheckCircle2,
  Clock, Calendar, Plus, X, ShieldCheck, Loader2, Lock,
} from "lucide-react";

// ── Access gate (mirrors Analysis.jsx) ───────────────────────────────────────
const ADMIN_KEY    = "bidready_admin_token";
const PAYMENT_KEY  = "bidready_payment_ref";
const PAYSTACK_KEY = "paystack_reference";

function resolveAccessMode() {
  const adminToken = (localStorage.getItem(ADMIN_KEY) || "").trim();
  if (adminToken) return "unlocked";
  const ref =
    (localStorage.getItem(PAYMENT_KEY)  || "").trim() ||
    (localStorage.getItem(PAYSTACK_KEY) || "").trim();
  return ref ? "unlocked" : "locked";
}

const API = "/api/documents";

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
  if (days < 0)
    return (
      <span className="badge-expired flex items-center gap-1">
        <AlertTriangle className="w-3 h-3" />Expired
      </span>
    );
  if (days <= 30)
    return (
      <span className="badge-expired flex items-center gap-1">
        <Clock className="w-3 h-3" />Expiring {days}d
      </span>
    );
  return (
    <span className="badge-met flex items-center gap-1">
      <CheckCircle2 className="w-3 h-3" />Valid
    </span>
  );
}

function syncLocalStorage(docs) {
  localStorage.setItem("bidready_documents", JSON.stringify(docs));
}

const EMPTY_FORM = { name: "", type: "", expiryDate: "", fileObj: null };

export default function Documents() {
  const [docs, setDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [dragOver, setDragOver] = useState(false);
  const [accessMode, setAccessMode] = useState(() => resolveAccessMode());
  const isLocked = accessMode === "locked";

  // ── The file input lives at this level, OUTSIDE the dropzone div,
  //    so its click event cannot bubble back up into the dropzone onClick.
  const fileRef = useRef();

  useEffect(() => { fetchDocs(); setAccessMode(resolveAccessMode()); }, []);

  async function fetchDocs() {
    try {
      const res = await fetch(API);
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      setDocs(data);
      syncLocalStorage(data);
    } catch {
      // Graceful fallback — use localStorage if backend unreachable
      const stored = localStorage.getItem("bidready_documents");
      if (stored) {
        try { setDocs(JSON.parse(stored)); } catch { /* ignore */ }
      }
    } finally {
      setLoadingDocs(false);
    }
  }

  // ── File validation and modal opening ────────────────────────────────────
  function handleFile(file) {
    if (!file) return;
    if (file.type !== "application/pdf") {
      alert("Please upload a PDF file.");
      resetInput();
      return;
    }
    setForm({
      name: file.name.replace(/\.pdf$/i, ""),
      type: "",
      expiryDate: "",
      fileObj: file,
    });
    setErrors({});
    setShowModal(true);
    // Reset immediately so the same file can be selected again later
    resetInput();
  }

  function resetInput() {
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }

  // ── Upload to backend ─────────────────────────────────────────────────────
  async function handleSave() {
    const errs = {};
    if (!form.name.trim()) errs.name = "Document name is required";
    if (!form.type)        errs.type = "Document type is required";
    if (!form.fileObj)     errs.file = "Please attach a PDF file";
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSaving(true);
    try {
      // Build a clean multipart/form-data payload.
      // Field name "document" matches uploadCompanyDoc.single("document") in server.js.
      const fd = new FormData();
      fd.append("document", form.fileObj, form.fileObj.name);
      fd.append("name", form.name.trim());
      fd.append("type", form.type);
      if (form.expiryDate) fd.append("expiryDate", form.expiryDate);

      const res = await fetch(API, { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const saved = await res.json();
      const updated = [saved, ...docs];
      setDocs(updated);
      syncLocalStorage(updated);
      closeModal();
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDelete(id) {
    if (!window.confirm("Remove this document?")) return;
    try {
      const res = await fetch(`${API}/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      const updated = docs.filter((d) => d.id !== id);
      setDocs(updated);
      syncLocalStorage(updated);
    } catch (err) {
      alert(`Could not delete: ${err.message}`);
    }
  }

  function closeModal() {
    setShowModal(false);
    setForm(EMPTY_FORM);
    setErrors({});
    resetInput();
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

      {/*
        ── Hidden file input at TOP LEVEL — OUTSIDE the dropzone div.
           Placing it here breaks the event-propagation loop that caused the
           double-dialog bug: fileRef.current.click() in the dropzone onClick
           now dispatches a click on a sibling element, not a child, so the
           resulting click event cannot re-bubble back into the dropzone div.
      */}
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => handleFile(e.target.files[0])}
      />

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Compliance Documents</h1>
          <p className="text-slate-500 text-sm mt-1">
            Upload and manage your government compliance certificates
          </p>
        </div>
        <button
          onClick={() => !isLocked && setShowModal(true)}
          disabled={isLocked}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
          Add Document
        </button>
      </div>

      {/* ── Expiry banner ── */}
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

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Documents", value: docs.length, color: "brand" },
          {
            label: "Valid",
            value: docs.filter((d) => {
              const days = daysUntil(d.expiryDate);
              return days === null || days > 30;
            }).length,
            color: "success",
          },
          { label: "Expiring / Expired", value: expiringSoon.length + expired.length, color: "warning" },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4 text-center">
            <p className={`text-2xl font-bold text-${color}-600`}>{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/*
        ── Upload drop zone ──
        The <input> is intentionally NOT nested inside this div.
        onClick calls fileRef.current.click() to open the file picker without
        any risk of the click event re-triggering this div's handler.
      */}
      <div className="relative">
        <div
          onDrop={isLocked ? undefined : handleDrop}
          onDragOver={isLocked ? undefined : (e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={isLocked ? undefined : () => setDragOver(false)}
          onClick={isLocked ? undefined : () => fileRef.current.click()}
          role="button"
          tabIndex={isLocked ? -1 : 0}
          onKeyDown={isLocked ? undefined : (e) => (e.key === "Enter" || e.key === " ") && fileRef.current.click()}
          aria-disabled={isLocked}
          className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200 select-none ${
            isLocked
              ? "border-slate-200 bg-slate-50/60 opacity-60 pointer-events-none cursor-default"
              : dragOver
              ? "border-brand-400 bg-brand-50 scale-[1.01] cursor-pointer"
              : "border-slate-200 hover:border-brand-300 hover:bg-brand-50/50 cursor-pointer"
          }`}
        >
          <div className="w-12 h-12 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center mx-auto mb-3">
            <Upload className="w-6 h-6 text-brand-500" />
          </div>
          <p className="font-semibold text-slate-700 text-sm">Drop a PDF here or click to browse</p>
          <p className="text-xs text-slate-400 mt-1">
            Supports Tax Clearance, CAC Certificates, PENCOM, NSITF, and more
          </p>
        </div>

        {/* ── Access lock overlay ── */}
        {isLocked && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl">
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 shadow-sm max-w-xs text-center">
              <Lock className="w-4 h-4 text-slate-400 shrink-0" />
              <p className="text-xs font-medium text-slate-500 leading-snug">
                Analysis Lock Active: Please select a premium plan to activate this workspace uploader.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Document list ── */}
      {loadingDocs ? (
        <div className="card p-12 flex items-center justify-center gap-3">
          <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
          <p className="text-sm text-slate-500">Loading documents…</p>
        </div>
      ) : docs.length > 0 ? (
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
                    {new Date(doc.expiryDate).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
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

      {/* ── Add / Edit Document Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 animate-scale-in">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-900">Add Compliance Document</h2>
              <button
                onClick={closeModal}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* File picker (shown when modal opened via + button without a prior drop) */}
            {!form.fileObj ? (
              <button
                type="button"
                onClick={() => fileRef.current.click()}
                className={`w-full mb-4 flex items-center gap-3 p-3 border-2 border-dashed rounded-xl transition-all text-left ${
                  errors.file
                    ? "border-danger-400 bg-danger-50"
                    : "border-brand-200 hover:border-brand-400 hover:bg-brand-50"
                }`}
              >
                <Upload className="w-4 h-4 text-brand-500 shrink-0" />
                <span className="text-sm text-brand-600 font-medium">Click to attach a PDF file</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 mb-4 p-3 bg-brand-50 rounded-xl border border-brand-100">
                <FileText className="w-4 h-4 text-brand-600 shrink-0" />
                <span className="text-sm text-brand-700 font-medium truncate flex-1">{form.fileObj.name}</span>
                <button
                  onClick={() => { setForm((f) => ({ ...f, fileObj: null })); resetInput(); }}
                  className="text-slate-400 hover:text-red-500 transition-colors shrink-0"
                  aria-label="Remove file"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {errors.file && <p className="text-xs text-danger-600 -mt-2 mb-3">{errors.file}</p>}

            <div className="space-y-4">
              <div>
                <label className="label">Document Name</label>
                <input
                  type="text"
                  className={`input ${errors.name ? "border-danger-500" : ""}`}
                  placeholder="e.g. Tax Clearance Certificate 2024"
                  value={form.name}
                  onChange={(e) => {
                    setForm({ ...form, name: e.target.value });
                    setErrors({ ...errors, name: "" });
                  }}
                />
                {errors.name && <p className="text-xs text-danger-600 mt-1">{errors.name}</p>}
              </div>

              <div>
                <label className="label">Document Type</label>
                <select
                  className={`input ${errors.type ? "border-danger-500" : ""}`}
                  value={form.type}
                  onChange={(e) => {
                    setForm({ ...form, type: e.target.value });
                    setErrors({ ...errors, type: "" });
                  }}
                >
                  <option value="">Select type…</option>
                  {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                {errors.type && <p className="text-xs text-danger-600 mt-1">{errors.type}</p>}
              </div>

              <div>
                <label className="label">
                  Expiry Date{" "}
                  <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="date"
                  className="input"
                  value={form.expiryDate}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={closeModal} className="btn-secondary flex-1 justify-center">
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-primary flex-1 justify-center disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Uploading…
                    </>
                  ) : (
                    "Save Document"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
