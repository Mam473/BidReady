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

// Quick scan: parse only the first 3 pages, return up to 600 chars
async function quickScanPDF(buffer) {
  try {
    const data = await pdfParse(buffer, { max: 3 });
    return data.text.replace(/\s+/g, " ").trim().slice(0, 600);
  } catch {
    return "";
  }
}

// Regulatory extract: first 5 pages, up to 2,000 chars for date detection
async function extractRegulatoryCert(buffer) {
  try {
    const data = await pdfParse(buffer, { max: 5 });
    return data.text.replace(/\s+/g, " ").trim().slice(0, 2000);
  } catch {
    return "";
  }
}

// Try to fast-path classify a file by filename + quick-scan text
function fastPathMatch(filename, scanText) {
  const haystack = `${filename} ${scanText}`;
  for (const { category, patterns } of FAST_PATH_MATCHERS) {
    if (patterns.some((rx) => rx.test(haystack))) {
      return category;
    }
  }
  return null;
}

// ─── Server-side date math post-processing ─────────────────────────────────
function applyDateMath(requirements) {
  const alwaysMetSet = new Set(FAST_PATH_MATCHERS.map((m) => m.category));
  return requirements.map((req) => {
    if (alwaysMetSet.has(req.name) && req.status !== "MISSING") {
      return { ...req, status: "MET" };
    }
    if (!alwaysMetSet.has(req.name) && req.status === "MET") {
      const dateMatch = (req.notes || "").match(
        /(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|\d{1,2}\s+\w+\s+\d{4})/
      );
      if (dateMatch) {
        const parsed = new Date(dateMatch[0]);
        if (!isNaN(parsed) && parsed < BASELINE_DATE) {
          return { ...req, status: "EXPIRED" };
        }
      }
    }
    return req;
  });
}

// ─── Health ────────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// ─── Gemini Analysis — optimized 3-stage pipeline ─────────────────────────
app.post("/api/analyze", upload.array("files", 20), async (req, res) => {
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
    // ── STAGE 1: Parallel quick scan — first 3 pages, 200 chars/page ─────
    const scanned = await Promise.all(
      files.map(async (file) => {
        const scanText = await quickScanPDF(file.buffer);
        return { file, scanText };
      })
    );

    // ── STAGE 2: Fast-path pre-classification (no AI needed) ─────────────
    // Build a response buffer seeded with MISSING for all 11 categories
    const responseBuffer = Object.fromEntries(
      ELEVEN_CATEGORIES.map((cat) => [cat, { name: cat, status: "MISSING", notes: "No matching document uploaded." }])
    );

    // Files that matched a fast-path category are resolved immediately
    const fastPathSet = new Set(FAST_PATH_MATCHERS.map((m) => m.category));
    const regulatoryFiles = [];

    for (const { file, scanText } of scanned) {
      const matched = fastPathMatch(file.originalname, scanText);
      if (matched) {
        // Mark MET immediately — no date extraction, no AI
        responseBuffer[matched] = {
          name: matched,
          status: "MET",
          notes: `Matched from uploaded file: ${file.originalname}`,
        };
      } else {
        // Queue for regulatory cert extraction + AI classification
        regulatoryFiles.push({ file, scanText });
      }
    }

    // ── STAGE 3: AI classification — only unresolved regulatory cert files ─
    // How many fast-path categories still need resolution via AI
    const unresolvedFastPath = FAST_PATH_MATCHERS
      .filter(({ category }) => responseBuffer[category].status === "MISSING")
      .map(({ category }) => category);

    if (regulatoryFiles.length > 0 || unresolvedFastPath.length > 0) {
      // Extract regulatory cert text in parallel (first 5 pages, 2,000 chars)
      const regExtracted = await Promise.all(
        regulatoryFiles.map(async ({ file }) => {
          const text = await extractRegulatoryCert(file.buffer);
          return { filename: file.originalname, text };
        })
      );

      // Only include unresolved categories in the AI prompt
      const unresolvedCategories = ELEVEN_CATEGORIES.filter(
        (cat) => responseBuffer[cat].status === "MISSING"
      );

      const docBlock = regExtracted.length > 0
        ? regExtracted.map((d, i) => `--- Doc ${i + 1}: ${d.filename} ---\n${d.text}`).join("\n\n")
        : "No additional documents to classify.";

      const prompt = `You are a Nigerian government procurement compliance AI.

VALIDATION BASELINE DATE: ${BASELINE_STR}
COMPANY: ${companyProfile.name} (RC: ${companyProfile.rcNumber || "N/A"})
TENDER: ${truncate(tenderName, 100)}
TENDER EXCERPT: ${truncate(tenderText, 1500)}

━━━ UNRESOLVED DOCUMENT CATEGORIES (classify these only) ━━━
${unresolvedCategories.map((c, i) => `${i + 1}. ${c}`).join("\n")}

━━━ UPLOADED DOCUMENTS FOR CLASSIFICATION ━━━
${docBlock}

━━━ RULES ━━━
For each unresolved category above:
- Regulatory certs (Tax Clearance, PENCOM, NSITF, ITF, BPP, Audited Financials): extract expiry date from text. If expiry < ${BASELINE_STR} → EXPIRED. If valid or no expiry found → MET. If no doc → MISSING.
- Audited Financial Accounts: present → MET, absent → MISSING.
- Any permanent category still listed (CAC, Affidavit, Financial Capability, Similar Jobs, Company Profile): MET if a doc matches, else MISSING.

SCORING for missing/expired among the unresolved set:
- Deduct 15 pts per MISSING critical (Tax Clearance, PENCOM, NSITF, Audited Financials)
- Deduct 10 pts per EXPIRED
- Deduct 5 pts per MISSING non-critical

Respond ONLY with valid JSON — no markdown, no extra text:
{
  "partial_score_adjustment": <integer, negative or 0, reflecting deductions for unresolved categories only>,
  "requirements": [
    {"name": "<exact category name>", "status": "<MET|MISSING|EXPIRED>", "notes": "<brief explanation with filename or expiry date>"}
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

      // Merge AI results into the response buffer
      for (const req of (aiResult.requirements || [])) {
        if (responseBuffer[req.name] !== undefined) {
          responseBuffer[req.name] = req;
        }
      }

      // Build final requirements list preserving the canonical order
      const finalRequirements = applyDateMath(
        ELEVEN_CATEGORIES.map((cat) => responseBuffer[cat])
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
          summary: `${companyProfile.name} is ${complianceLabel} with ${metCount} of 11 requirements met, ${missingCount} missing and ${expiredCount} expired.`,
          requirements: finalRequirements,
          feedback: aiResult.feedback || "Please address the missing and expired documents before submission.",
        },
      });
    }

    // All 11 categories resolved via fast-path — no AI call needed
    const finalRequirements = applyDateMath(
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`BidReady API running on http://0.0.0.0:${PORT}`);
});
