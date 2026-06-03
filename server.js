import express from "express";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

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

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

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
    const ai = new GoogleGenAI({ apiKey });

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
      model: "gemini-1.5-flash",
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

app.listen(PORT, "localhost", () => {
  console.log(`BidReady API running on http://localhost:${PORT}`);
});
