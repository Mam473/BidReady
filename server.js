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

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

// Categories that are permanently MET when found — no expiry check
const ALWAYS_MET_CATEGORIES = [
  "CAC Registration Documents",
  "Sworn Affidavit of Due Process",
  "Evidence of Financial Capability",
  "Evidence of 3 Similar Jobs",
  "Company Profile with CVs",
];

// Validation baseline date for expiry checks
const BASELINE_DATE = new Date("2026-12-31");
const BASELINE_STR  = "2026-12-31";

// ─── Server-side date math post-processing ─────────────────────────────────
function applyDateMath(requirements) {
  return requirements.map((req) => {
    const isAlwaysMet = ALWAYS_MET_CATEGORIES.some((cat) =>
      req.name.toLowerCase().includes(cat.toLowerCase().split(" ")[0]) ||
      cat.toLowerCase().includes(req.name.toLowerCase().split(" ")[0])
    );

    if (isAlwaysMet && req.status !== "MISSING") {
      return { ...req, status: "MET" };
    }

    if (!isAlwaysMet && req.status === "MET") {
      const notes = req.notes || "";
      const dateMatch = notes.match(/(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|\d{1,2}\s+\w+\s+\d{4})/);
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

// ─── Gemini Analysis (multipart file bundle) ──────────────────────────────
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
    // Extract text from each uploaded PDF (8,000-char window per file)
    const extractedDocs = await Promise.all(
      files.map(async (file) => {
        try {
          const data = await pdfParse(file.buffer);
          const text = truncate(data.text.replace(/\s+/g, " ").trim(), 8000);
          return { filename: file.originalname, text };
        } catch {
          return { filename: file.originalname, text: `[Could not extract text from ${file.originalname}]` };
        }
      })
    );

    const docBlock = extractedDocs
      .map((d, i) => `--- Document ${i + 1}: ${d.filename} ---\n${d.text}`)
      .join("\n\n");

    const tenderBlock = truncate(tenderText, 3000);

    const prompt = `You are a strict Nigerian government procurement compliance AI. Your task is:
1. Auto-classify each uploaded document into one of the 11 required categories below.
2. Evaluate overall compliance of the company against the tender requirements.

VALIDATION BASELINE DATE: ${BASELINE_STR}

COMPANY PROFILE:
Company Name : ${companyProfile.name}
Industry     : ${companyProfile.industry || "N/A"}
RC Number    : ${companyProfile.rcNumber || "N/A"}

━━━ 11 REQUIRED DOCUMENT CATEGORIES ━━━
${ELEVEN_CATEGORIES.map((c, i) => `${i + 1}. ${c}`).join("\n")}

━━━ UPLOADED DOCUMENTS (auto-classify each) ━━━
${docBlock}

━━━ TENDER REQUIREMENTS ━━━
Tender: ${truncate(tenderName, 120)}
${tenderBlock}

━━━ CLASSIFICATION & EVALUATION RULES ━━━
For each of the 11 categories, determine whether it is MET, MISSING, or EXPIRED:

PERMANENT MET CATEGORIES (mark MET if the document content matches — do NOT apply expiry logic):
- CAC Registration Documents: any CAC certificate, certificate of incorporation, business name registration
- Sworn Affidavit of Due Process: any sworn statement, affidavit, statutory declaration
- Evidence of Financial Capability: bank statement, letter of credit, financial capacity proof
- Evidence of 3 Similar Jobs: letters of award, completion certificates, contracts for similar projects
- Company Profile with CVs: company profile document, staff CVs, personnel records

REGULATORY CERTIFICATES (apply expiry logic — baseline date is ${BASELINE_STR}):
- Tax Clearance Certificate (FIRS): extract any expiry/validity date from the document text. If expiry date < ${BASELINE_STR} → EXPIRED. If valid → MET. If not found → MISSING.
- PENCOM Compliance Certificate: same expiry rule.
- NSITF Certificate: same expiry rule.
- ITF Compliance Certificate: same expiry rule.
- BPP Federal Contractor Certificate: same expiry rule.
- Audited Financial Accounts Statement: check if accounts are for the last 3 years relative to ${BASELINE_STR}. If present → MET, else → MISSING.

If a category has no matching uploaded document → MISSING.

SCORING (start at 100):
- Deduct 15 pts per MISSING critical doc (Tax Clearance, PENCOM, NSITF, CAC, Audited Financials)
- Deduct 10 pts per EXPIRED document
- Deduct 5 pts per MISSING non-critical document

Respond with ONLY a valid JSON object — no markdown, no code fences, no extra text:
{
  "score": <integer 0-100>,
  "summary": "<one concise sentence referencing the company name and overall compliance posture>",
  "requirements": [
    {
      "name": "<one of the 11 category names exactly>",
      "status": "<MET|MISSING|EXPIRED>",
      "notes": "<specific explanation — reference the matched filename, extracted expiry date if applicable, or reason for MISSING>"
    }
  ],
  "feedback": "<4-5 sentences of concrete, actionable procurement advice specific to the gaps found>"
}

The "requirements" array MUST contain exactly 11 entries, one per category, in the same order listed above.`;

    await delay(3000);

    const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1" } });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
    });

    const raw = response.text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Gemini did not return valid JSON. Raw: " + truncate(raw, 300));
    }

    const analysisResult = JSON.parse(jsonMatch[0]);

    // Enforce server-side date math rules
    if (Array.isArray(analysisResult.requirements)) {
      analysisResult.requirements = applyDateMath(analysisResult.requirements);
    }

    res.json({ success: true, result: analysisResult });
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
