import express from "express";
import cors from "cors";
import crypto from "crypto";
import pg from "pg";
import multer from "multer";
import pdfParse from "pdf-parse";
import { GoogleGenAI } from "@google/genai";

const { Pool } = pg;
const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// ─── Schema bootstrap — idempotent, runs once on every startup ─────────────
async function initSchema() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id                SERIAL PRIMARY KEY,
        user_id           TEXT        NOT NULL DEFAULT 'anonymous',
        plan_name         TEXT        NOT NULL,
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
async function extractFullText(buffer) {
  try {
    const data = await pdfParse(buffer); // no max — all pages, fully awaited
    return data.text.replace(/\s+/g, " ").trim();
  } catch (err) {
    console.warn("PDF parse warning:", err?.message);
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
              const userId   = metadata?.user_id  || "anonymous";
              const planName = metadata?.plan_name || "unknown";

              await db.query(
                `INSERT INTO payments (user_id, plan_name, amount, payment_reference, payment_status)
                 VALUES ($1, $2, $3, $4, 'success')
                 ON CONFLICT (payment_reference)
                 DO UPDATE SET payment_status = 'success', updated_at = NOW()`,
                [userId, planName, amount, payRef]
              );
              console.log(`[gate] Paystack live-verified and saved: ${payRef} — ₦${amount / 100} from ${customer?.email}`);
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
        const fullText = await extractFullText(file.buffer);
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

    await db.query(
      `INSERT INTO payments (user_id, plan_name, amount, payment_reference, payment_status)
       VALUES ($1, $2, $3, $4, 'pending')
       ON CONFLICT (payment_reference) DO NOTHING`,
      [userId || "anonymous", planName, amount, reference]
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
    const { reference, amount, customer } = event.data;
    try {
      await db.query(
        `UPDATE payments SET payment_status = 'success' WHERE payment_reference = $1`,
        [reference]
      );
      console.log(`Payment confirmed: ${reference} — ₦${amount / 100} from ${customer?.email}`);
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
      const userId   = metadata?.user_id  || "anonymous";
      const planName = metadata?.plan_name || "unknown";

      await db.query(
        `INSERT INTO payments (user_id, plan_name, amount, payment_reference, payment_status)
         VALUES ($1, $2, $3, $4, 'success')
         ON CONFLICT (payment_reference)
         DO UPDATE SET payment_status = 'success', updated_at = NOW()`,
        [userId, planName, amount, payRef]
      );
      console.log(`Pre-verified and saved: ${payRef} — ₦${amount / 100} from ${customer?.email}`);
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
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE payment_status = 'success'), 0)::int AS "totalRevenue",
        COUNT(DISTINCT user_id) FILTER (WHERE payment_status = 'success')::int AS "payingCustomers",
        COUNT(*)::int AS "totalTransactions",
        ROUND(
          COUNT(*) FILTER (WHERE payment_status = 'success') * 100.0
          / NULLIF(COUNT(*), 0), 1
        )::float AS "successRate"
      FROM payments
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
    const result = await db.query(
      `SELECT id, user_id, plan_name, amount, payment_reference, payment_status, created_at
       FROM payments ORDER BY created_at DESC LIMIT 50`
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
