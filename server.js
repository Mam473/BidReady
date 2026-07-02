import express from "express";
import cors from "cors";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import pg from "pg";
import multer from "multer";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { GoogleGenAI } from "@google/genai";

const execFileAsync = promisify(execFile);

const { Pool } = pg;
const app = express();
const PORT = 3001;

app.use(cors({
  origin: true,          // reflect any request origin — allows Replit dev domains
  credentials: false,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Payment-Reference"],
}));
app.options("*", cors());  // pre-flight for every route
app.use(express.json({ limit: "10mb" }));

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// ── Disk storage for company compliance documents ────────────────────────────
const DOCS_UPLOAD_DIR = path.join(process.cwd(), "uploads", "documents");
fs.mkdirSync(DOCS_UPLOAD_DIR, { recursive: true });

const docDiskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, DOCS_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
    const ext = path.extname(file.originalname) || ".pdf";
    cb(null, `${unique}${ext}`);
  },
});
const uploadCompanyDoc = multer({
  storage: docDiskStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isPdf =
      file.mimetype === "application/pdf" ||
      file.originalname.toLowerCase().endsWith(".pdf");
    cb(isPdf ? null : new Error("Only PDF files are accepted."), isPdf);
  },
});

// ─── Schema bootstrap — idempotent, runs once on every startup ─────────────
async function initSchema() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS tender_analyses (
        id            SERIAL PRIMARY KEY,
        tender_name   TEXT        NOT NULL,
        company_name  TEXT        NOT NULL,
        analysis      JSONB       NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_tender_analyses_company
        ON tender_analyses (company_name);
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id                SERIAL PRIMARY KEY,
        user_id           TEXT        NOT NULL DEFAULT 'anonymous',
        company_name      TEXT        NOT NULL DEFAULT 'Unknown',
        plan_name         TEXT        NOT NULL DEFAULT 'Unknown Plan',
        amount            INTEGER     NOT NULL,
        payment_reference TEXT        NOT NULL UNIQUE,
        payment_status    TEXT        NOT NULL DEFAULT 'pending',
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_payments_user_id
        ON payments (user_id);
      CREATE INDEX IF NOT EXISTS idx_payments_status
        ON payments (payment_status);
      CREATE INDEX IF NOT EXISTS idx_payments_reference
        ON payments (payment_reference);
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS company_documents (
        id          SERIAL PRIMARY KEY,
        name        TEXT        NOT NULL,
        type        TEXT        NOT NULL DEFAULT '',
        file_name   TEXT        NOT NULL,
        file_path   TEXT        NOT NULL,
        expiry_date DATE,
        uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_company_documents_uploaded
        ON company_documents (uploaded_at DESC);
    `);
    // ── Additive migrations for existing deployments ─────────────────────────
    await db.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS company_name TEXT NOT NULL DEFAULT 'Unknown'`);
    await db.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS plan_name    TEXT NOT NULL DEFAULT 'Unknown Plan'`);
    console.log("Database schema initialised.");
  } catch (err) {
    console.error("Schema init error:", err.message);
  }
}
initSchema();

function truncate(text, maxChars) {
  if (!text) return "";
  return text.length > maxChars ? text.slice(0, maxChars) + "…" : text;
}

// ─── 11 Required Document Categories ──────────────────────────────────────
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

// Validation baseline date for expiry checks
const BASELINE_DATE = new Date("2026-12-31");
const BASELINE_STR  = "2026-12-31";

// ─── Fast-path keyword matchers for permanent-MET categories ──────────────
// Checked against filename + first 600 chars of PDF — no AI call needed
const FAST_PATH_MATCHERS = [
  {
    category: "CAC Registration Documents",
    patterns: [/\bcac\b/i, /certificate of incorporation/i, /corporate affairs commission/i, /\bRC\s*\d{4,}/i, /\bincorporation\b/i],
  },
  {
    category: "Sworn Affidavit of Due Process",
    patterns: [/\baffidavit\b/i, /sworn\s+statement/i, /statutory\s+declaration/i, /due\s+process/i],
  },
  {
    category: "Evidence of Financial Capability",
    patterns: [/financial\s+capabilit/i, /\bbank\s+statement/i, /letter\s+of\s+credit/i, /financial\s+capacit/i, /net\s+worth/i],
  },
  {
    category: "Evidence of 3 Similar Jobs",
    patterns: [/similar\s+jobs/i, /similar\s+works/i, /letter\s+of\s+award/i, /completion\s+certificate/i, /previous\s+contract/i, /reference\s+letter/i],
  },
  {
    category: "Company Profile with CVs",
    patterns: [/company\s+profile/i, /curriculum\s+vitae/i, /\bcv\b(?!\s*\d)/i, /corporate\s+profile/i, /key\s+personnel/i, /organisational\s+profile/i],
  },
];

// ── FULL PDF EXTRACTOR ─────────────────────────────────────────────────────
// Reads EVERY page with no page-count limit. Awaits parse completion in full
// before returning so no trailing pages are dropped from the text string.
// ── cleanPdfText ───────────────────────────────────────────────────────────
// Preserves document structure (section headings, clause numbers, paragraph
// breaks) while stripping artefacts that pdf-parse inserts:
//   • Collapses runs of spaces/tabs within a line → single space
//   • Preserves single and double newlines (paragraphs / section breaks)
//   • Collapses 3+ consecutive blank lines → one blank line
//   • Removes null bytes and other control characters
function cleanPdfText(raw) {
  return raw
    .replace(/\x00/g, "")                      // null bytes
    .replace(/[^\S\n]+/g, " ")                  // horizontal whitespace → single space
    .replace(/\n{3,}/g, "\n\n")                 // 3+ blank lines → one blank line
    .trim();
}

async function extractFullText(buffer, mimeType = "", originalName = "") {
  const ext = (originalName.match(/\.([^.]+)$/) || [])[1]?.toLowerCase() || "";
  try {
    // PDF — extract all pages, preserve structure
    if (mimeType === "application/pdf" || ext === "pdf") {
      const data = await pdfParse(buffer);
      const cleaned = cleanPdfText(data.text || "");
      console.log(`[extract] PDF "${originalName}" — ${data.numpages} page(s), ${cleaned.length} chars extracted`);
      return cleaned;
    }
    // DOCX
    if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      ext === "docx"
    ) {
      const result = await mammoth.extractRawText({ buffer });
      const cleaned = cleanPdfText(result.value || "");
      console.log(`[extract] DOCX "${originalName}" — ${cleaned.length} chars extracted`);
      return cleaned;
    }
    // DOC / JPG / JPEG / PNG — text extraction not supported;
    // filename-based fast-path matching handles these documents
    return "";
  } catch (err) {
    console.warn(`Text extraction warning (${originalName}):`, err?.message);
    return "";
  }
}

// ── OVERLAPPING SLIDING WINDOW CHUNKER ────────────────────────────────────
// Splits `text` into windows of `windowSize` chars, stepping by
// (windowSize - overlap) chars per window. The 1,000-char overlap guarantees
// that any header or expiration date that straddles a page boundary appears
// intact in at least one complete chunk and is never sliced in half.
function buildChunks(text, windowSize = 4000, overlap = 1000) {
  if (!text) return [];
  const chunks = [];
  const step = windowSize - overlap;
  for (let i = 0; i < text.length; i += step) {
    chunks.push(text.slice(i, i + windowSize));
    if (i + windowSize >= text.length) break;
  }
  return chunks;
}

// ── FAST-PATH MATCH — scans every overlapping chunk of the full PDF text ──
// Checks the filename first (fast), then walks every chunk so no keyword
// match is missed because it happened to straddle a page boundary.
function fastPathMatch(filename, fullText) {
  const chunks = buildChunks(fullText);
  for (const { category, patterns } of FAST_PATH_MATCHERS) {
    if (
      patterns.some((rx) => rx.test(filename)) ||
      chunks.some((chunk) => patterns.some((rx) => rx.test(chunk)))
    ) {
      return category;
    }
  }
  return null;
}

// ─── Status evaluation — two strict rules ─────────────────────────────────
// RULE 1: Static/capability docs → always MET if present (no expiry check)
// RULE 2: Regulatory certs → strict date check against the submission deadline
//         (extracted from the tender document, or BASELINE_DATE as fallback)
function enforceStatusRules(requirements, baseline) {
  const competitionBaseline = (baseline instanceof Date && !isNaN(baseline))
    ? baseline
    : new Date(BASELINE_STR);
  const baselineStr = competitionBaseline.toISOString().split("T")[0];

  return requirements.map((req) => {
    if (req.status !== "MISSING") {
      const isStatic = ["CAC", "Affidavit", "Financial Capability", "Similar Jobs"].some(
        (keyword) => req.name.includes(keyword)
      );
      if (isStatic) {
        req.status   = "MET";
        req.feedback = "Document successfully verified and authenticated as active.";
      } else if (req.expiryDate) {
        const expDate = new Date(req.expiryDate);
        if (expDate < competitionBaseline) {
          req.status   = "EXPIRED";
          req.feedback = `CRITICAL VALIDATION FAILURE: This certificate expired on ${req.expiryDate} and is invalid for a submission deadline of ${baselineStr}.`;
        } else {
          req.status   = "MET";
          req.feedback = `Validated: Active and compliant until ${req.expiryDate}`;
        }
      } else {
        req.status   = "EXPIRED";
        req.feedback = "CRITICAL: Certificate text detected, but no valid upcoming expiration date could be extracted.";
      }
    }
    return req;
  });
}

// ─── Admin auth middleware ─────────────────────────────────────────────────
// Protects every route under /api/admin/
// Accepts:  Authorization: Bearer <password>
//        OR ?password=<password> query param
function requireAdmin(req, res, next) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return res.status(500).json({ error: "ADMIN_PASSWORD is not configured." });
  }

  const authHeader = req.headers["authorization"] || "";
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const queryToken  = req.query.password || "";
  const supplied    = headerToken || queryToken;

  if (!supplied || supplied !== adminPassword) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

app.use("/api/admin", requireAdmin);

// ─── Health ────────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// ─── Gemini Analysis — optimized 3-stage pipeline ─────────────────────────
app.post("/api/analyze", upload.array("files", 20), async (req, res) => {
  // ── HYBRID ACCESS GATE ────────────────────────────────────────────────────
  // Mode 1 — Admin: Authorization: Bearer <ADMIN_PASSWORD>
  // Mode 2 — Paid:  X-Payment-Reference header with a 'success' DB record
  // Anything else → 402 Payment Required
  const adminPassword = process.env.ADMIN_PASSWORD;
  const authHeader    = req.headers["authorization"] || "";
  const isAdmin       = adminPassword && authHeader === `Bearer ${adminPassword}`;

  if (!isAdmin) {
    // ── Extract payment reference from ALL possible locations ────────────
    const refFromHeader = (req.headers["x-payment-reference"] || "").trim();
    const refFromAuth   = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";
    const refFromBody   = (req.body?.paymentReference || "").trim();

    const payRef = refFromHeader || refFromBody || refFromAuth;

    if (!payRef) {
      return res.status(402).json({
        error: "Payment required. Please purchase a plan to unlock compliance analyses.",
      });
    }
    try {
      const payCheck = await db.query(
        `SELECT payment_status FROM payments WHERE payment_reference = $1 LIMIT 1`,
        [payRef]
      );
      const localRow = payCheck.rows[0];
      const localOk  = localRow?.payment_status === "success";
      console.log(`[gate] ref="${payRef}" db_rows=${payCheck.rows.length} db_status="${localRow?.payment_status || "none"}"`);

      if (!localOk) {
        // ── Fallback: live verification against Paystack API ──────────────
        const secretKey = process.env.PAYSTACK_SECRET_KEY;
        let paystackVerified = false;
        let paystackReason   = "PAYSTACK_SECRET_KEY not set";

        if (secretKey) {
          try {
            const verifyUrl = `https://api.paystack.co/transaction/verify/${encodeURIComponent(payRef)}`;
            console.log(`[gate] calling Paystack verify: ${verifyUrl}`);

            const verifyRes  = await fetch(verifyUrl, {
              method: "GET",
              headers: { Authorization: `Bearer ${secretKey}` },
            });
            const verifyData = await verifyRes.json();

            // Log the full Paystack response so we can see what's happening
            console.log(`[gate] Paystack HTTP ${verifyRes.status} — status="${verifyData?.data?.status}" msg="${verifyData?.message}"`);

            if (verifyData?.data?.status === "success") {
              paystackVerified = true;
              const { amount, customer, metadata } = verifyData.data;
              const nairaAmt    = Math.round(amount / 100);
              const companyName = resolveCompanyName(customer, metadata);
              const planName    = resolvePlanName(nairaAmt, metadata?.plan_name);

              await db.query(
                `INSERT INTO payments (user_id, plan_name, amount, payment_reference, payment_status)
                 VALUES ($1, $2, $3, $4, 'success')
                 ON CONFLICT (payment_reference)
                 DO UPDATE SET payment_status = 'success',
                               user_id        = $1,
                               plan_name      = $2,
                               amount         = $3,
                               updated_at     = NOW()`,
                [companyName, planName, nairaAmt, payRef]
              );
              console.log(`[gate] Paystack live-verified and saved: ${payRef} — ₦${nairaAmt} (${planName}) from ${companyName}`);
            } else {
              paystackReason = `Paystack returned status="${verifyData?.data?.status}" msg="${verifyData?.message}"`;
            }
          } catch (verifyErr) {
            paystackReason = verifyErr?.message;
            console.error("[gate] Paystack live verification threw:", verifyErr?.message);
          }
        }

        if (!paystackVerified) {
          console.warn(`[gate] 402 for ref="${payRef}" — reason: ${paystackReason}`);
          return res.status(402).json({
            error: "No confirmed payment found for this reference. Please complete your purchase.",
            detail: paystackReason,
          });
        }
      }
    } catch (err) {
      console.error("[gate] DB error:", err?.message);
      return res.status(500).json({ error: "Could not verify payment. Please try again." });
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not configured in Secrets." });
  }

  let companyProfile, tenderText, tenderName;
  try {
    companyProfile = JSON.parse(req.body.companyProfile || "{}");
    tenderText     = req.body.tenderText || "";
    tenderName     = req.body.tenderName || "Government Procurement Tender";
  } catch {
    return res.status(400).json({ error: "Invalid companyProfile JSON." });
  }

  if (!companyProfile.name || !tenderText) {
    return res.status(400).json({ error: "companyProfile and tenderText are required." });
  }

  const files = req.files || [];
  if (files.length === 0) {
    return res.status(400).json({ error: "At least one PDF file is required." });
  }

  try {
    // ── STAGE 1: Full parallel extraction — ALL pages, fully awaited ──────
    // extractFullText has no page limit. Promise.all waits for every file
    // to finish parsing before any result is used downstream.
    const scanned = await Promise.all(
      files.map(async (file) => {
        const fullText = await extractFullText(file.buffer, file.mimetype, file.originalname);
        return { file, fullText };
      })
    );

    // ── STAGE 2: Fast-path pre-classification (no AI needed) ─────────────
    // Build a response buffer seeded with MISSING for all 11 categories
    const responseBuffer = Object.fromEntries(
      ELEVEN_CATEGORIES.map((cat) => [cat, { name: cat, status: "MISSING", notes: "No matching document uploaded." }])
    );

    // fastPathMatch scans every overlapping chunk of the full extracted text
    const regulatoryFiles = [];

    for (const { file, fullText } of scanned) {
      const matched = fastPathMatch(file.originalname, fullText);
      if (matched) {
        // Rule 1: static/capability category — lock to MET immediately
        responseBuffer[matched] = {
          name: matched,
          status: "MET",
          notes: `Matched from uploaded file: ${file.originalname}`,
        };
      } else {
        // Queue for AI classification — carry the full extracted text forward
        // so Stage 3 needs zero additional PDF parses
        regulatoryFiles.push({ filename: file.originalname, fullText });
      }
    }

    // ── STAGE 3: AI classification — only unresolved regulatory cert files ─
    const unresolvedFastPath = FAST_PATH_MATCHERS
      .filter(({ category }) => responseBuffer[category].status === "MISSING")
      .map(({ category }) => category);

    if (regulatoryFiles.length > 0 || unresolvedFastPath.length > 0) {
      // Build doc block from pre-extracted text — no second PDF parse needed.
      // Each document is capped at 10,000 chars so the AI prompt stays within
      // a practical context limit while still covering multi-page bundles.
      const MAX_DOC_CHARS = 10000;
      const regExtracted = regulatoryFiles.map(({ filename, fullText }) => ({
        filename,
        text: fullText.length > MAX_DOC_CHARS ? fullText.slice(0, MAX_DOC_CHARS) : fullText,
      }));

      // Only include unresolved categories in the AI prompt
      const unresolvedCategories = ELEVEN_CATEGORIES.filter(
        (cat) => responseBuffer[cat].status === "MISSING"
      );

      const docBlock = regExtracted.length > 0
        ? regExtracted.map((d, i) => `--- Doc ${i + 1}: ${d.filename} ---\n${d.text}`).join("\n\n")
        : "No additional documents to classify.";

      const prompt = `You are BidReady AI. You are an expert procurement compliance analyst. Your job is to accurately extract procurement requirements from tender documents.

RULES (non-negotiable — apply to every field in your response):
• Never summarize.
• Never guess.
• If information cannot be found, return "Not Specified".
• Return only valid JSON.
• Preserve dates exactly as written in the source document, then convert to ISO format.
• Preserve figures exactly — do not round or approximate.
• Preserve percentages exactly.
• Preserve currencies exactly (NGN, USD, GBP, etc.).
• Merge duplicate information — do not repeat the same fact in multiple fields.
• Treat all mandatory requirements as critical.

COMPANY: ${companyProfile.name} (RC: ${companyProfile.rcNumber || "N/A"})
TENDER: ${truncate(tenderName, 100)}
TENDER EXCERPT: ${truncate(tenderText, 1500)}

━━━ STEP 0 — STRUCTURED METADATA EXTRACTION ━━━
Analyze the TENDER EXCERPT and extract the following 11 fields verbatim from the source text.
Apply all RULES above: never guess, never summarize, preserve every date/figure/currency/percentage exactly.
If a field cannot be found anywhere in the text, set its value to "Not Specified".

  procuringEntity      — The full official name of the organisation issuing this tender.
  tenderTitle          — The exact title of the tender as written in the document.
  tenderNumber         — The tender/reference/lot number exactly as printed.
  country              — Country where the procurement takes place.
  procurementMethod    — e.g. "Open Competitive Bidding", "Selective Tendering", "Request for Quotation".
  sector               — Industry or sector (e.g. "Construction", "ICT", "Health", "Education").
  contractType         — e.g. "Lump Sum", "Unit Rate", "Framework Agreement", "Consultancy".
  submissionDeadline   — Exact submission/closing date, converted to YYYY-MM-DD. Preserve the original date text in notes.
  closingTime          — Time of day bids must be received by (e.g. "12:00 noon", "16:00 WAT"). "Not Specified" if absent.
  submissionMethod     — How bids must be delivered (e.g. "Physical submission", "Email", "Online portal").
  bidValidity          — Number of days or weeks bids remain valid after the closing date (e.g. "90 days", "Not Specified").

Also extract the following 5 requirement categories from the TENDER EXCERPT.
For each item found, capture: name (verbatim), mandatory (true if explicitly required, false if optional), section (heading or clause reference where it appears, or "Not Specified").
If a category has no items, return an empty array for it.

  requiredDocuments            — All documents the bidder must submit with their bid package.
  eligibilityRequirements      — All mandatory eligibility or qualification criteria (turnover, experience, staff strength, etc.).
  mandatoryCertificates        — All certificates explicitly required (CAC, FIRS, PENCOM, NSITF, ITF, BPP, etc.).
  mandatoryRegistrations       — All registrations with regulatory bodies or professional associations required.
  bidSecurityRequirements      — Bid bond / bid security / earnest money deposit details — amount, currency, percentage, and acceptable form.

Also extract the following 4 qualification categories. Preserve the EXACT wording from the document — do not paraphrase, summarise, or infer.
If a category has no items found in the text, return an empty array for it.

  personnelRequirements  — All key personnel, staffing levels, professional roles or competency requirements stated.
  experienceRequirements — All past project experience, years of operation, or similar-works requirements stated.
  financialRequirements  — All financial thresholds: minimum turnover, working capital, bank references, annual revenue, etc.
  equipmentRequirements  — All plant, machinery, tools, vehicles, or technical equipment the bidder must own or have access to.

Also extract the following 8 evaluation and risk categories. Preserve the EXACT wording — never paraphrase, never infer.
If a category has no items found in the text, return an empty array for it.

  administrativeEvaluation   — All administrative/pass-fail checklist items used to screen bids before technical review.
  technicalEvaluation        — All technical scoring criteria, sub-criteria, and their allocated weights or marks.
  financialEvaluation        — All financial scoring criteria, price weighting methodology, or financial capacity checks.
  passMark                   — The minimum score or threshold a bidder must achieve to pass each stage (administrative, technical, financial).
  weightedScores             — Full breakdown of percentage weights allocated across evaluation stages (e.g. Technical 70%, Financial 30%).
  disqualificationRisks      — Any condition explicitly stated as grounds for automatic disqualification or rejection of a bid.
  importantDates             — All dates and deadlines in the document: site visits, pre-bid meetings, clarification deadlines, submission, opening, award. Preserve exact wording and convert each to YYYY-MM-DD.

━━━ STEP 1 — TENDER DOCUMENT IDENTIFICATION & DEADLINE EXTRACTION ━━━
First, identify the procurement document type and extract the submission deadline from the TENDER EXCERPT and any uploaded document text.

DOCUMENT TYPE — identify one of:
  • ITT  — Invitation to Tender: look for "Invitation to Tender", "ITT", "Bid Documents", "Tender Notice"
  • RFQ  — Request for Quotation: look for "Request for Quotation", "RFQ", "Quotation closing date"
  • EOI  — Expression of Interest: look for "Expression of Interest", "EOI"
  • TENDER — use as fallback if none of the above match clearly

DEADLINE EXTRACTION — aggressively scan for ALL of these phrases and any date near them:
  "Submission of Tender closing date"
  "Bid opening date"
  "Deadline for submission of Bids"
  "Tenders must be dropped in the tender box on or before"
  "Tenders must be submitted by"
  "Quotations must be received by"
  "EOI closing date"
  "Expressions of Interest must be submitted by"
  "Closing date for submission"
  "Submission deadline"
  "Closing date"
  or ANY date pattern adjacent to a submission/deadline/closing keyword.
→ If a clear submission deadline is found, extract it as tenderSubmissionDeadline in YYYY-MM-DD format.
→ This extracted deadline becomes the VALIDATION BASELINE for all certificate expiry checks below.
→ If no deadline is found, fall back to: ${BASELINE_STR}

━━━ STEP 2 — UNRESOLVED DOCUMENT CATEGORIES (classify these only) ━━━
${unresolvedCategories.map((c, i) => `${i + 1}. ${c}`).join("\n")}

━━━ UPLOADED DOCUMENTS FOR CLASSIFICATION ━━━
${docBlock}

━━━ STEP 3 — CLASSIFICATION RULES ━━━
Use the tenderSubmissionDeadline you extracted in Step 1 (or ${BASELINE_STR} if none found) as BASELINE below.

STATIC/CAPABILITY (no expiry check — status is FOUND or MISSING):
- CAC Registration Documents, Sworn Affidavit, Evidence of Financial Capability, Evidence of Similar Jobs, Company Profile with CVs
→ If a matching document is present: status = "FOUND". If absent: status = "MISSING".

REGULATORY CERTIFICATES (strict expiry extraction against BASELINE):
- Tax Clearance (FIRS), PENCOM, NSITF, ITF, BPP, Audited Financial Accounts
→ Search the ENTIRE document text for any expiry or validity date phrase:
  "valid until", "expiry date", "expires", "valid through", "valid to", "date of expiry",
  or any date pattern (DD/MM/YYYY, YYYY-MM-DD, "31 December 2025", etc.).
→ If a date on or after BASELINE is found: status = "FOUND", expiryDate = "<YYYY-MM-DD>".
→ If a date is found but BEFORE BASELINE: status = "FOUND", expiryDate = "<YYYY-MM-DD>" (server will mark EXPIRED).
→ STRICT RULE: If the document name/header is present but NO valid date can be extracted: status = "FOUND", omit expiryDate (server will mark EXPIRED — do NOT assume MET).
→ If no document at all was uploaded for this category: status = "MISSING", omit expiryDate.

Respond ONLY with valid JSON — no markdown, no extra text:
{
  "tenderMetadata": {
    "procuringEntity": "<verbatim or Not Specified>",
    "tenderTitle": "<verbatim or Not Specified>",
    "tenderNumber": "<verbatim or Not Specified>",
    "country": "<verbatim or Not Specified>",
    "procurementMethod": "<verbatim or Not Specified>",
    "sector": "<verbatim or Not Specified>",
    "contractType": "<verbatim or Not Specified>",
    "submissionDeadline": "<YYYY-MM-DD or Not Specified>",
    "closingTime": "<verbatim or Not Specified>",
    "submissionMethod": "<verbatim or Not Specified>",
    "bidValidity": "<verbatim or Not Specified>"
  },
  "tenderRequirements": {
    "requiredDocuments":       [{ "name": "<verbatim>", "mandatory": true, "section": "<clause or Not Specified>" }],
    "eligibilityRequirements": [{ "name": "<verbatim>", "mandatory": true, "section": "<clause or Not Specified>" }],
    "mandatoryCertificates":   [{ "name": "<verbatim>", "mandatory": true, "section": "<clause or Not Specified>" }],
    "mandatoryRegistrations":  [{ "name": "<verbatim>", "mandatory": true, "section": "<clause or Not Specified>" }],
    "bidSecurityRequirements": [{ "name": "<verbatim description>", "mandatory": true, "section": "<clause or Not Specified>" }]
  },
  "qualificationRequirements": {
    "personnelRequirements":  [{ "name": "<verbatim wording>", "mandatory": true, "section": "<clause or Not Specified>" }],
    "experienceRequirements": [{ "name": "<verbatim wording>", "mandatory": true, "section": "<clause or Not Specified>" }],
    "financialRequirements":  [{ "name": "<verbatim wording>", "mandatory": true, "section": "<clause or Not Specified>" }],
    "equipmentRequirements":  [{ "name": "<verbatim wording>", "mandatory": true, "section": "<clause or Not Specified>" }]
  },
  "evaluationCriteria": {
    "administrativeEvaluation": [{ "name": "<verbatim>", "section": "<clause or Not Specified>" }],
    "technicalEvaluation":      [{ "name": "<verbatim>", "weight": "<marks or % or Not Specified>", "section": "<clause or Not Specified>" }],
    "financialEvaluation":      [{ "name": "<verbatim>", "weight": "<marks or % or Not Specified>", "section": "<clause or Not Specified>" }],
    "passMark":                 [{ "name": "<verbatim pass/threshold statement>", "section": "<clause or Not Specified>" }],
    "weightedScores":           [{ "name": "<verbatim weight description>", "weight": "<% or score>", "section": "<clause or Not Specified>" }],
    "disqualificationRisks":    [{ "name": "<verbatim disqualification condition>", "section": "<clause or Not Specified>" }],
    "importantDates":           [{ "name": "<verbatim event description>", "date": "<YYYY-MM-DD or Not Specified>", "section": "<clause or Not Specified>" }]
  },
  "tenderType": "<ITT|RFQ|EOI|TENDER>",
  "tenderSubmissionDeadline": "<YYYY-MM-DD or omit if not found>",
  "requirements": [
    {
      "name": "<exact category name from the list above>",
      "status": "<FOUND|MISSING>",
      "expiryDate": "<YYYY-MM-DD or omit if not applicable>",
      "notes": "<one sentence: matched filename, extracted date, or reason for MISSING>"
    }
  ],
  "feedback": "<4-5 sentences of concrete procurement advice targeting the gaps>"
}
The "requirements" array must contain exactly ${unresolvedCategories.length} entries, one per unresolved category listed above.`;

      const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1" } });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: prompt,
      });

      const raw = response.text.trim();
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Gemini returned invalid JSON. Raw: " + truncate(raw, 200));

      const aiResult = JSON.parse(jsonMatch[0]);

      // ── Resolve effective submission deadline ─────────────────────────────
      // Use AI-extracted tenderSubmissionDeadline if valid, else fall back to
      // BASELINE_DATE so regulatory certificate checks are always meaningful.
      const extractedDeadlineStr = aiResult.tenderSubmissionDeadline || "";
      const extractedDeadline    = extractedDeadlineStr ? new Date(extractedDeadlineStr) : null;
      const effectiveBaseline    = (extractedDeadline && !isNaN(extractedDeadline))
        ? extractedDeadline
        : BASELINE_DATE;
      const effectiveBaselineStr = effectiveBaseline.toISOString().split("T")[0];

      const tenderType = aiResult.tenderType || "TENDER";
      if (extractedDeadlineStr) {
        console.log(`[analysis] ${tenderType} — submission deadline extracted: ${extractedDeadlineStr} → using as compliance baseline`);
      }

      // Merge AI results into the response buffer
      // Normalise AI's intermediate "FOUND" → "MET" before rule enforcement
      for (const req of (aiResult.requirements || [])) {
        if (responseBuffer[req.name] !== undefined) {
          responseBuffer[req.name] = {
            ...req,
            status: req.status === "FOUND" ? "MET" : req.status,
          };
        }
      }

      // Build final requirements list preserving the canonical order
      // enforceStatusRules applies Rule 1 (static → MET) and Rule 2 (date check)
      // Pass effectiveBaseline so certs are evaluated against the real tender deadline
      const finalRequirements = enforceStatusRules(
        ELEVEN_CATEGORIES.map((cat) => responseBuffer[cat]),
        effectiveBaseline
      );

      // Calculate score: start at 100, apply deductions
      let score = 100;
      for (const req of finalRequirements) {
        const isCritical = ["Tax Clearance Certificate (FIRS)", "PENCOM Compliance Certificate",
          "NSITF Certificate", "CAC Registration Documents", "Audited Financial Accounts Statement"].includes(req.name);
        if (req.status === "MISSING") score -= isCritical ? 15 : 5;
        else if (req.status === "EXPIRED") score -= 10;
      }
      score = Math.max(0, Math.min(100, score));

      const metCount     = finalRequirements.filter((r) => r.status === "MET").length;
      const missingCount = finalRequirements.filter((r) => r.status === "MISSING").length;
      const expiredCount = finalRequirements.filter((r) => r.status === "EXPIRED").length;
      const complianceLabel = score >= 70 ? "compliant" : score >= 40 ? "partially compliant" : "non-compliant";

      return res.json({
        success: true,
        result: {
          score,
          tenderType,
          tenderSubmissionDeadline: extractedDeadlineStr || null,
          complianceBaseline: effectiveBaselineStr,
          tenderMetadata: aiResult.tenderMetadata || null,
          tenderRequirements: aiResult.tenderRequirements || null,
          qualificationRequirements: aiResult.qualificationRequirements || null,
          evaluationCriteria: aiResult.evaluationCriteria || null,
          summary: `${companyProfile.name} is ${complianceLabel} with ${metCount} of 11 requirements met, ${missingCount} missing and ${expiredCount} expired.`,
          requirements: finalRequirements,
          feedback: aiResult.feedback || "Please address the missing and expired documents before submission.",
        },
      });
    }

    // All 11 categories resolved via fast-path — no AI call needed
    const finalRequirements = enforceStatusRules(
      ELEVEN_CATEGORIES.map((cat) => responseBuffer[cat])
    );

    let score = 100;
    for (const req of finalRequirements) {
      const isCritical = ["Tax Clearance Certificate (FIRS)", "PENCOM Compliance Certificate",
        "NSITF Certificate", "CAC Registration Documents", "Audited Financial Accounts Statement"].includes(req.name);
      if (req.status === "MISSING") score -= isCritical ? 15 : 5;
      else if (req.status === "EXPIRED") score -= 10;
    }
    score = Math.max(0, Math.min(100, score));

    const metCount     = finalRequirements.filter((r) => r.status === "MET").length;
    const missingCount = finalRequirements.filter((r) => r.status === "MISSING").length;
    const complianceLabel = score >= 70 ? "compliant" : score >= 40 ? "partially compliant" : "non-compliant";

    return res.json({
      success: true,
      result: {
        score,
        summary: `${companyProfile.name} is ${complianceLabel} with ${metCount} of 11 requirements met and ${missingCount} missing.`,
        requirements: finalRequirements,
        feedback: "All detected documents have been classified. Ensure all regulatory certificates remain valid before tender submission.",
      },
    });

  } catch (err) {
    console.error("Analysis error:", err?.message || err);
    res.status(500).json({ error: err?.message || "Analysis failed. Please try again." });
  }
});

// ─── Payment helpers ───────────────────────────────────────────────────────

// Derive a human-readable plan name from the Naira amount (already converted).
function resolvePlanName(nairaAmount, metadataPlanName) {
  if (metadataPlanName && metadataPlanName !== "unknown") return metadataPlanName;
  if (nairaAmount >= 20000) return "Consultant Plan";
  if (nairaAmount >= 8000)  return "SME Monthly Plan";
  return "Single Tender Analysis";
}

// Extract the company name from every location Paystack may include it.
function resolveCompanyName(customer, metadata) {
  return (
    customer?.metadata?.company_name ||
    metadata?.company_name ||
    metadata?.custom_fields?.find((f) => f.variable_name === "company_name")?.value ||
    customer?.email ||
    "RHOCOM TECHNOLOGY LTD"
  );
}

// ─── Payment: Initialize ───────────────────────────────────────────────────
app.post("/api/payment/initialize", async (req, res) => {
  const { planId, planName, amount, userId, email } = req.body;

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  const publicKey = process.env.PAYSTACK_PUBLIC_KEY;

  if (!secretKey || !publicKey) {
    return res.status(500).json({ error: "Paystack keys are not configured." });
  }
  if (!planName || !amount || !email) {
    return res.status(400).json({ error: "planName, amount, and email are required." });
  }

  try {
    const reference = `BIDREADY-${planId?.toUpperCase() || "PAY"}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount,
        reference,
        currency: "NGN",
        metadata: {
          plan_name: planName,
          user_id: userId || "anonymous",
          cancel_action: `${process.env.APP_URL || ""}/pricing`,
        },
      }),
    });

    const paystackData = await paystackRes.json();
    if (!paystackData.status) {
      throw new Error(paystackData.message || "Paystack initialization failed");
    }

    // Paystack sends amount in kobo — convert to Naira before persisting
    const nairaAmount = Math.round(amount / 100);
    await db.query(
      `INSERT INTO payments (user_id, plan_name, amount, payment_reference, payment_status)
       VALUES ($1, $2, $3, $4, 'pending')
       ON CONFLICT (payment_reference) DO NOTHING`,
      [userId || "anonymous", planName, nairaAmount, reference]
    );

    res.json({ reference, publicKey, email });
  } catch (err) {
    console.error("Payment init error:", err?.message || err);
    res.status(500).json({ error: err?.message || "Could not initialize payment." });
  }
});

// ─── Payment: Webhook ──────────────────────────────────────────────────────
app.post("/api/payment/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  const signature = req.headers["x-paystack-signature"];

  const hash = crypto
    .createHmac("sha512", secretKey)
    .update(req.body)
    .digest("hex");

  if (hash !== signature) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  if (event.event === "charge.success") {
    const { reference, amount, customer, metadata } = event.data;
    const nairaAmt   = Math.round(amount / 100);
    const companyName = resolveCompanyName(customer, metadata);
    const planName    = resolvePlanName(nairaAmt, metadata?.plan_name);
    try {
      await db.query(
        `UPDATE payments
         SET payment_status = 'success',
             user_id        = $2,
             plan_name      = $3,
             amount         = $4,
             updated_at     = NOW()
         WHERE payment_reference = $1`,
        [reference, companyName, planName, nairaAmt]
      );
      console.log(`Payment confirmed: ${reference} — ₦${nairaAmt} (${planName}) from ${companyName}`);
    } catch (err) {
      console.error("Webhook DB update error:", err?.message);
    }
  }

  res.sendStatus(200);
});

// ─── Payment: Client-side verify (called by PaymentSuccess page) ───────────
// Lets the frontend pre-confirm a Paystack reference immediately after redirect
// so the DB record is ready before the user clicks "Run Analysis".
app.get("/api/payment/verify/:reference", async (req, res) => {
  const payRef    = (req.params.reference || "").trim();
  const secretKey = process.env.PAYSTACK_SECRET_KEY;

  if (!payRef) return res.status(400).json({ verified: false, error: "No reference supplied." });

  try {
    // 1. Check local DB first
    const local = await db.query(
      `SELECT payment_status FROM payments WHERE payment_reference = $1 LIMIT 1`,
      [payRef]
    );
    if (local.rows.length > 0 && local.rows[0].payment_status === "success") {
      return res.json({ verified: true, source: "db" });
    }

    // 2. Fallback: live Paystack verification
    if (!secretKey) return res.json({ verified: false, error: "Paystack key not configured." });

    const paystackRes  = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(payRef)}`,
      { headers: { Authorization: `Bearer ${secretKey}` } }
    );
    const paystackData = await paystackRes.json();

    if (paystackData?.data?.status === "success") {
      const { amount, customer, metadata } = paystackData.data;
      // Paystack returns amount in kobo — store in Naira
      const nairaAmt    = Math.round(amount / 100);
      const companyName = resolveCompanyName(customer, metadata);
      const planName    = resolvePlanName(nairaAmt, metadata?.plan_name);

      await db.query(
        `INSERT INTO payments (user_id, plan_name, amount, payment_reference, payment_status)
         VALUES ($1, $2, $3, $4, 'success')
         ON CONFLICT (payment_reference)
         DO UPDATE SET payment_status = 'success',
                       user_id        = $1,
                       plan_name      = $2,
                       amount         = $3,
                       updated_at     = NOW()`,
        [companyName, planName, nairaAmt, payRef]
      );
      console.log(`Pre-verified and saved: ${payRef} — ₦${nairaAmt} (${planName}) from ${companyName}`);
      return res.json({ verified: true, source: "paystack" });
    }

    return res.json({ verified: false, error: "Payment not yet confirmed by Paystack." });
  } catch (err) {
    console.error("Verify route error:", err?.message);
    return res.status(500).json({ verified: false, error: "Verification check failed." });
  }
});

// ─── Admin: Stats ──────────────────────────────────────────────────────────
app.get("/api/admin/stats", async (req, res) => {
  try {
    const result = await db.query(`
      WITH rev AS (
        -- Global revenue across entire table; no company/session filter.
        SELECT COALESCE(SUM(amount), 0) AS raw
        FROM payments
        WHERE payment_status = 'success' OR payment_status = 'confirmed'
      )
      SELECT
        -- Retroactive kobo-to-Naira patch: if raw sum ≥ 500 000 the column
        -- still holds Paystack kobo values, so divide by 100.
        (CASE WHEN rev.raw >= 500000 THEN rev.raw / 100 ELSE rev.raw END)::bigint
          AS "totalRevenue",
        (SELECT COUNT(DISTINCT user_id)
           FROM payments
          WHERE payment_status = 'success' OR payment_status = 'confirmed')::int
          AS "payingCustomers",
        (SELECT COUNT(*) FROM payments)::int
          AS "totalTransactions",
        ROUND(
          (SELECT COUNT(*) FROM payments
            WHERE payment_status = 'success' OR payment_status = 'confirmed')
          * 100.0
          / NULLIF((SELECT COUNT(*) FROM payments), 0),
          1
        )::float
          AS "successRate"
      FROM rev
    `);
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Admin stats error:", err?.message);
    res.status(500).json({ error: "Could not load stats." });
  }
});

// ─── Admin: Transactions ───────────────────────────────────────────────────
app.get("/api/admin/transactions", async (req, res) => {
  try {
    // Return all rows globally — no company or session filters.
    // company_name and plan_name are persisted strings written at payment time.
    const result = await db.query(
      `SELECT
         id,
         COALESCE(company_name, user_id, 'Unknown') AS company_name,
         COALESCE(plan_name,    'Unknown Plan')      AS plan_name,
         -- Per-row retroactive fix: rows stored in raw Paystack kobo (≥ 500,000)
         -- are divided by 100 so the client always receives a Naira figure.
         CASE WHEN amount >= 500000 THEN amount / 100 ELSE amount END AS amount,
         payment_reference,
         payment_status,
         created_at
       FROM payments
       ORDER BY created_at ASC`
    );
    res.json({ transactions: result.rows });
  } catch (err) {
    console.error("Admin transactions error:", err?.message);
    res.status(500).json({ error: "Could not load transactions." });
  }
});

// ─── Support Chatbot ───────────────────────────────────────────────────────
const CHAT_SYSTEM = `You are the BidReady Support Agent — a senior corporate compliance officer specialising in Nigerian government procurement and contractor registration. You assist Nigerian SMEs and contractors in understanding and passing preliminary tender evaluations (PQ stages).

You have deep expertise in:
- CAC (Corporate Affairs Commission): Certificate of Incorporation, business name registration, certified true copies, and annual returns.
- PENCOM (National Pension Commission): Pension compliance certificates, remittance timelines, and how to obtain a clearance letter.
- NSITF (Nigeria Social Insurance Trust Fund): Employee compensation contribution certificates, registration requirements, and renewal timelines.
- ITF (Industrial Training Fund): 1% payroll levy contributions, exemptions for companies with fewer than 5 staff or annual turnover below ₦50m, and how to obtain ITF compliance certificates.
- FIRS Tax Clearance Certificate (TCC): Three-year tax clearance, VAT registration, company income tax filing timelines, and FIRS eTax portal procedures.
- BPP (Bureau of Public Procurement): Due process requirements, financial thresholds, and national competitive bidding rules.
- General tender document requirements: sworn affidavits, audited financial statements (3 years), evidence of similar jobs, key personnel CVs, and equipment lists.

Tone: Professional, concise, and practical. Always give specific, actionable guidance. If a question is outside procurement compliance, politely redirect to BidReady features. Never fabricate regulatory deadlines — state what is standard and recommend official sources for confirmation.`;

app.post("/api/chat", async (req, res) => {
  const { messages } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not configured." });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required." });
  }

  try {
    const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1" } });

    const primed = [
      {
        role: "user",
        parts: [{ text: `Please adopt the following role for our entire conversation:\n\n${CHAT_SYSTEM}` }],
      },
      {
        role: "model",
        parts: [{ text: "Understood. I am the BidReady Support Agent — a senior compliance expert for Nigerian government procurement. I'm ready to assist with CAC, PENCOM, NSITF, ITF, FIRS tax clearance, BPP requirements, and all tender document queries. How can I help you?" }],
      },
      ...messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
    ];

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: primed,
    });

    res.json({ reply: response.text.trim() });
  } catch (err) {
    console.error("Chat error:", err?.message || err);
    res.status(500).json({ error: err?.message || "Chat failed. Please try again." });
  }
});

// ─── Scanned-PDF OCR via pdftoppm + Gemini Vision ─────────────────────────
// Renders each page to PNG at 150 DPI (no system install needed — pdftoppm
// is already on PATH in the Replit NixOS environment), then sends each image
// to Gemini Vision in parallel. Returns the merged OCR text.
// Max 15 pages to keep latency and cost reasonable for tender documents.
const OCR_MAX_PAGES    = 15;
const OCR_DPI          = "150";
const OCR_TEXT_THRESHOLD = 200; // chars — below this we treat the PDF as scanned

async function ocrPdfWithGemini(buffer, apiKey, originalName) {
  const id      = crypto.randomBytes(8).toString("hex");
  const tmpPdf  = path.join(os.tmpdir(), `br_${id}.pdf`);
  const imgPfx  = path.join(os.tmpdir(), `br_${id}_pg`);

  try {
    // Write PDF buffer to a temp file so pdftoppm can read it
    fs.writeFileSync(tmpPdf, buffer);

    // Render pages → PNG  (-l caps at OCR_MAX_PAGES, -r sets DPI)
    await execFileAsync("pdftoppm", [
      "-png", "-r", OCR_DPI, "-l", String(OCR_MAX_PAGES), tmpPdf, imgPfx,
    ]);

    // Collect generated page images (sorted numerically)
    const pageFiles = fs
      .readdirSync(os.tmpdir())
      .filter((f) => f.startsWith(`br_${id}_pg`) && f.endsWith(".png"))
      .sort()
      .map((f) => path.join(os.tmpdir(), f));

    if (pageFiles.length === 0) throw new Error("pdftoppm produced no images");

    console.log(`[ocr] "${originalName}" — ${pageFiles.length} page(s) rendered at ${OCR_DPI} DPI`);

    // Send all page images to Gemini Vision in parallel
    const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1" } });
    const pageTexts = await Promise.all(
      pageFiles.map(async (imgPath, idx) => {
        const imgB64 = fs.readFileSync(imgPath).toString("base64");
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash-lite",
          contents: [{
            parts: [
              {
                text: "Extract every word of text visible in this document page image. Preserve line breaks and the original layout exactly. Output only the extracted text — no commentary, no markdown.",
              },
              { inlineData: { mimeType: "image/png", data: imgB64 } },
            ],
          }],
        });
        console.log(`[ocr] page ${idx + 1}/${pageFiles.length} extracted`);
        return response.text.trim();
      })
    );

    return pageTexts.join("\n\n");
  } finally {
    // Always clean up temp files
    for (const f of [tmpPdf, ...fs.readdirSync(os.tmpdir())
      .filter((f) => f.startsWith(`br_${id}`))
      .map((f) => path.join(os.tmpdir(), f))]) {
      try { fs.unlinkSync(f); } catch {}
    }
  }
}

// ─── Tender Document Analyzer ──────────────────────────────────────────────
// POST /api/tender/extract
// Accepts a single PDF or DOCX tender document, extracts all structured
// intelligence in one Gemini call, saves to DB, returns the full object.
app.post(
  "/api/tender/extract",
  upload.single("tenderDoc"),
  async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured." });

    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded. Send a PDF or DOCX as 'tenderDoc'." });

    const companyName = (req.body.companyName || "Unknown Company").trim();

    // ── Extract text from PDF or DOCX ──────────────────────────────────────
    let rawText = "";
    let usedOcr = false;
    try {
      const mime = file.mimetype;
      const name = file.originalname.toLowerCase();
      if (mime === "application/pdf" || name.endsWith(".pdf")) {
        const parsed = await pdfParse(file.buffer);
        const textLayer = cleanPdfText(parsed.text || "");
        console.log(`[tender/extract] PDF text layer: ${textLayer.length} chars`);

        if (textLayer.length >= OCR_TEXT_THRESHOLD) {
          // Searchable PDF — use the text layer directly
          rawText = textLayer;
        } else {
          // Sparse or no text layer — scanned PDF detected, run OCR automatically
          console.log(`[tender/extract] Scanned PDF detected (${textLayer.length} chars < ${OCR_TEXT_THRESHOLD} threshold) — running OCR on "${file.originalname}"`);
          rawText = await ocrPdfWithGemini(file.buffer, apiKey, file.originalname);
          usedOcr = true;
        }
      } else if (
        mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        name.endsWith(".docx")
      ) {
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        rawText = result.value || "";
      } else {
        return res.status(400).json({ error: "Unsupported file type. Upload a PDF or DOCX." });
      }
    } catch (parseErr) {
      console.error("[tender/extract] parse error:", parseErr.message);
      return res.status(422).json({ error: "Could not read the document. Ensure the file is not password-protected or corrupted." });
    }

    if (!rawText.trim()) {
      return res.status(422).json({ error: "No readable text could be extracted. The document may be fully image-based with no recognisable text." });
    }

    // Clean and structure the extracted text
    const structuredText = cleanPdfText(rawText);

    // Cap at 25 000 chars — covers full-length ITT/RFQ/EOI documents while
    // staying within Gemini's practical context window for a single call
    const MAX_CHARS = 25000;
    const docText = structuredText.length > MAX_CHARS
      ? structuredText.slice(0, MAX_CHARS) + "\n…[document truncated at 25 000 chars]"
      : structuredText;
    console.log(`[tender/extract] "${file.originalname}" — ${structuredText.length} chars (${docText.length === structuredText.length ? "full" : "truncated"})`);
    const tenderName = file.originalname.replace(/\.[^.]+$/, "");

    // ── Single Gemini extraction call ───────────────────────────────────────
    const prompt = `You are BidReady AI. You are an expert procurement compliance analyst. Your job is to accurately extract procurement requirements from tender documents.

RULES (non-negotiable):
• Never summarize. Never guess. Never paraphrase.
• If a field cannot be found, use "Not Specified".
• Return only valid JSON — no markdown, no code fences, no extra text.
• Preserve dates exactly as written, then convert to ISO YYYY-MM-DD.
• Preserve all figures, percentages, and currencies exactly.
• Treat all mandatory requirements as critical.

DOCUMENT TEXT:
${docText}

Extract and return the following JSON object:
{
  "tenderInfo": {
    "procuringEntity": "verbatim or Not Specified",
    "tenderTitle": "verbatim or Not Specified",
    "tenderNumber": "verbatim or Not Specified",
    "country": "verbatim or Not Specified",
    "procurementMethod": "verbatim or Not Specified",
    "sector": "verbatim or Not Specified",
    "contractType": "verbatim or Not Specified",
    "tenderType": "ITT | RFQ | EOI | TENDER"
  },
  "submissionDetails": {
    "submissionDeadline": "YYYY-MM-DD or Not Specified",
    "closingTime": "verbatim or Not Specified",
    "submissionMethod": "verbatim or Not Specified",
    "bidValidity": "verbatim or Not Specified",
    "submissionAddress": "verbatim or Not Specified"
  },
  "requiredDocuments": [
    { "name": "verbatim", "mandatory": true, "section": "clause or Not Specified" }
  ],
  "eligibilityRequirements": [
    { "name": "verbatim", "mandatory": true, "section": "clause or Not Specified" }
  ],
  "personnelRequirements": [
    { "name": "verbatim", "mandatory": true, "section": "clause or Not Specified" }
  ],
  "financialRequirements": [
    { "name": "verbatim", "mandatory": true, "section": "clause or Not Specified" }
  ],
  "equipmentRequirements": [
    { "name": "verbatim", "mandatory": true, "section": "clause or Not Specified" }
  ],
  "bidSecurity": [
    { "name": "verbatim description of amount/form/percentage", "mandatory": true, "section": "clause or Not Specified" }
  ],
  "evaluationCriteria": {
    "administrativeEvaluation": [{ "name": "verbatim", "section": "clause or Not Specified" }],
    "technicalEvaluation":      [{ "name": "verbatim", "weight": "% or marks or Not Specified", "section": "clause or Not Specified" }],
    "financialEvaluation":      [{ "name": "verbatim", "weight": "% or marks or Not Specified", "section": "clause or Not Specified" }],
    "passMark":                 [{ "name": "verbatim pass/threshold statement", "section": "clause or Not Specified" }],
    "weightedScores":           [{ "name": "verbatim", "weight": "% or score", "section": "clause or Not Specified" }]
  },
  "importantDates": [
    { "event": "verbatim event name", "date": "YYYY-MM-DD or Not Specified", "time": "verbatim or Not Specified", "section": "clause or Not Specified" }
  ],
  "disqualificationRisks": [
    { "name": "verbatim disqualification condition", "section": "clause or Not Specified" }
  ]
}`;

    let analysis;
    try {
      const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1" } });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: prompt,
      });
      const raw = response.text.trim();
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Gemini did not return valid JSON. Raw: " + truncate(raw, 300));
      analysis = JSON.parse(jsonMatch[0]);
    } catch (aiErr) {
      console.error("[tender/extract] AI error:", aiErr.message);
      return res.status(500).json({ error: "AI extraction failed: " + aiErr.message });
    }

    // ── Save to database ────────────────────────────────────────────────────
    try {
      await db.query(
        `INSERT INTO tender_analyses (tender_name, company_name, analysis) VALUES ($1, $2, $3)`,
        [tenderName, companyName, JSON.stringify(analysis)]
      );
    } catch (dbErr) {
      console.warn("[tender/extract] DB save failed (non-fatal):", dbErr.message);
    }

    console.log(`[tender/extract] ${tenderName} — ${analysis.tenderInfo?.tenderType || "TENDER"} extracted for ${companyName}`);

    return res.json({
      success: true,
      tenderName,
      fileName: file.originalname,
      usedOcr,
      analysis,
    });
  }
);

// GET /api/tender/analyses — list saved analyses for a company
app.get("/api/tender/analyses", async (req, res) => {
  const companyName = (req.query.company || "").trim();
  try {
    const rows = companyName
      ? await db.query(
          `SELECT id, tender_name, company_name, created_at FROM tender_analyses WHERE company_name = $1 ORDER BY created_at DESC LIMIT 20`,
          [companyName]
        )
      : await db.query(
          `SELECT id, tender_name, company_name, created_at FROM tender_analyses ORDER BY created_at DESC LIMIT 20`
        );
    res.json({ success: true, analyses: rows.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Company Documents endpoints ──────────────────────────────────────────────

// GET /api/documents — list all company compliance documents
app.get("/api/documents", async (_req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM company_documents ORDER BY uploaded_at DESC"
    );
    res.json(
      rows.map((r) => ({
        id: r.id.toString(),
        name: r.name,
        type: r.type,
        fileName: r.file_name,
        expiryDate: r.expiry_date
          ? new Date(r.expiry_date).toISOString().split("T")[0]
          : null,
        uploadedAt: r.uploaded_at.toISOString(),
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/documents — upload a compliance document (multipart field: "document")
app.post("/api/documents", uploadCompanyDoc.single("document"), async (req, res) => {
  try {
    if (!req.file)
      return res
        .status(400)
        .json({ error: "No file received. Send a PDF as the 'document' field." });

    const { name, type, expiryDate } = req.body;
    if (!name || !type)
      return res
        .status(400)
        .json({ error: "'name' and 'type' are required body fields." });

    const { rows } = await db.query(
      `INSERT INTO company_documents (name, type, file_name, file_path, expiry_date)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        name.trim(),
        type.trim(),
        req.file.originalname,
        req.file.path,
        expiryDate || null,
      ]
    );
    const r = rows[0];
    res.status(201).json({
      id: r.id.toString(),
      name: r.name,
      type: r.type,
      fileName: r.file_name,
      expiryDate: r.expiry_date
        ? new Date(r.expiry_date).toISOString().split("T")[0]
        : null,
      uploadedAt: r.uploaded_at.toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/documents/:id — remove a document from DB and disk
app.delete("/api/documents/:id", async (req, res) => {
  try {
    const { rows } = await db.query(
      "DELETE FROM company_documents WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    if (!rows.length)
      return res.status(404).json({ error: "Document not found." });
    // Best-effort disk cleanup — don't fail the request if file is already gone
    fs.unlink(rows[0].file_path, () => {});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function startServer(port, attempt = 1) {
  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`BidReady API running on http://0.0.0.0:${port}`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE" && attempt <= 5) {
      console.warn(`Port ${port} busy (attempt ${attempt}/5) — retrying in ${attempt * 500}ms…`);
      setTimeout(() => startServer(port, attempt + 1), attempt * 500);
    } else {
      console.error("Server failed to start:", err.message);
      process.exit(1);
    }
  });
}

startServer(PORT);
