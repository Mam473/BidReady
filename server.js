import express from "express";
import cors from "cors";
import crypto from "crypto";
import pg from "pg";
import { GoogleGenAI } from "@google/genai";

const { Pool } = pg;
const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const db = new Pool({ connectionString: process.env.DATABASE_URL });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function truncate(text, maxChars) {
  if (!text) return "";
  return text.length > maxChars ? text.slice(0, maxChars) + "…" : text;
}

function buildDocumentList(documents) {
  if (!documents || documents.length === 0)
    return "NONE — no compliance documents have been uploaded.";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return documents
    .map((d) => {
      let expiryStatus = "NO EXPIRY DATE SET";

      if (d.expiryDate) {
        const expiry = new Date(d.expiryDate);
        expiry.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
          expiryStatus = `EXPIRED (expired ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"} ago on ${d.expiryDate})`;
        } else if (diffDays === 0) {
          expiryStatus = `EXPIRED (expires today — ${d.expiryDate})`;
        } else if (diffDays <= 30) {
          expiryStatus = `EXPIRING SOON (${diffDays} day${diffDays === 1 ? "" : "s"} left — expires ${d.expiryDate})`;
        } else {
          expiryStatus = `VALID (expires ${d.expiryDate}, ${diffDays} days remaining)`;
        }
      }

      return `  • Document Name: "${d.name}"\n    Type: ${d.type || "General/Unspecified"}\n    Expiry Status: ${expiryStatus}`;
    })
    .join("\n\n");
}

// ─── Health ────────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// ─── Gemini Analysis ───────────────────────────────────────────────────────
app.post("/api/analyze", async (req, res) => {
  const { companyProfile, documents, tenderText, tenderName } = req.body;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not configured in Secrets." });
  }
  if (!companyProfile || !tenderText) {
    return res.status(400).json({ error: "companyProfile and tenderText are required." });
  }

  try {
    const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1" } });

    const today = new Date().toISOString().split("T")[0];
    const docList = buildDocumentList(documents);
    const tenderBlock = truncate(tenderText, 2000);

    const prompt = `You are a strict Nigerian government procurement compliance officer. Your job is to evaluate whether an SME meets the requirements of a specific tender based ONLY on the documents they have actually uploaded.

TODAY'S DATE: ${today}

━━━ COMPANY PROFILE ━━━
Company Name : ${companyProfile.name}
Industry     : ${companyProfile.industry}
RC Number    : ${companyProfile.rcNumber}

━━━ UPLOADED COMPLIANCE DOCUMENTS ━━━
The following is the COMPLETE list of documents this company has uploaded. Each entry shows the document name, its declared type, and its calculated expiry status based on today's date (${today}). If a document shows "EXPIRED", treat it as non-compliant — do NOT assume it is valid.

${docList}

━━━ TENDER REQUIREMENTS ━━━
Tender: ${truncate(tenderName || "Government Procurement Tender", 100)}

${tenderBlock}

━━━ EVALUATION RULES ━━━
Apply these rules strictly when setting each requirement's status:

1. MET — The company has uploaded a document of the correct type AND its expiry status is VALID or NO EXPIRY DATE SET.
2. EXPIRED — The company uploaded a document of the correct type BUT its expiry status is EXPIRED or EXPIRING SOON.
3. MISSING — No document of the required type was uploaded at all.

IMPORTANT:
- PENCOM Certificate: If uploaded but expired → EXPIRED. If absent → MISSING.
- NSITF Certificate: Same rule — if uploaded but expired → EXPIRED; if absent → MISSING.
- Tax Clearance Certificate: Must be valid as of today. If expired → EXPIRED.
- CAC Certificate of Incorporation: Does not expire. If uploaded → MET.
- Do NOT mark a document MET if its expiry status says EXPIRED.
- Do NOT invent documents not in the uploaded list above.

Scoring (start at 100):
- Deduct 15 pts per MISSING critical doc (Tax Clearance, PENCOM, NSITF, CAC, Audited Financials)
- Deduct 10 pts per EXPIRED document
- Deduct 5 pts per MISSING non-critical document

Respond with ONLY a valid JSON object — no markdown, no code fences, no extra text:
{
  "score": <integer 0-100>,
  "summary": "<one concise sentence overall assessment referencing the company name>",
  "requirements": [
    {
      "name": "<requirement name>",
      "status": "<MET|MISSING|EXPIRED>",
      "notes": "<specific explanation referencing the actual document name or absence>"
    }
  ],
  "feedback": "<4-5 sentences of concrete, actionable procurement advice specific to the gaps identified>"
}`;

    await delay(4000);

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
    });

    const raw = response.text.trim();

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Gemini did not return a valid JSON object. Raw: " + truncate(raw, 300));
    }

    const analysisResult = JSON.parse(jsonMatch[0]);
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
        `UPDATE payments
         SET payment_status = 'success'
         WHERE payment_reference = $1`,
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
       FROM payments
       ORDER BY created_at DESC
       LIMIT 50`
    );
    res.json({ transactions: result.rows });
  } catch (err) {
    console.error("Admin transactions error:", err?.message);
    res.status(500).json({ error: "Could not load transactions." });
  }
});

app.listen(PORT, "localhost", () => {
  console.log(`BidReady API running on http://localhost:${PORT}`);
});
