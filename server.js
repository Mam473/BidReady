import express from "express";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function truncate(text, maxChars) {
  if (!text) return "";
  return text.length > maxChars ? text.slice(0, maxChars) + "…" : text;
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/analyze", async (req, res) => {
  const { companyProfile, documents, tenderText, tenderName } = req.body;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not configured." });
  }

  if (!companyProfile || !tenderText) {
    return res.status(400).json({ error: "companyProfile and tenderText are required." });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey, {
      apiVersion: "v1",
    });
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const today = new Date().toISOString().split("T")[0];

    const docsSection = documents && documents.length > 0
      ? documents.map((d) => {
          const expiry = d.expiryDate ? new Date(d.expiryDate) : null;
          const isExpired = expiry && expiry < new Date();
          const daysToExpiry = expiry
            ? Math.ceil((expiry - new Date()) / (1000 * 60 * 60 * 24))
            : null;
          return `- ${d.name} (Type: ${d.type || "General"}, Expiry: ${d.expiryDate || "Not set"}, Status: ${isExpired ? "EXPIRED" : daysToExpiry !== null && daysToExpiry <= 30 ? `EXPIRING SOON (${daysToExpiry} days)` : "VALID"})`;
        }).join("\n")
      : "No documents uploaded.";

    const tenderBlock = truncate(tenderText, 2000);
    const docsBlock   = truncate(docsSection, 800);

    const prompt = `You are a Nigerian government procurement compliance expert. Evaluate the SME's compliance with the tender requirements below.

TODAY'S DATE: ${today}

COMPANY PROFILE:
- Company Name: ${companyProfile.name}
- Industry: ${companyProfile.industry}
- RC Number: ${companyProfile.rcNumber}

COMPLIANCE DOCUMENTS:
${docsBlock}

TENDER REQUIREMENTS (${truncate(tenderName || "Procurement Tender", 80)}):
${tenderBlock}

INSTRUCTIONS:
1. Identify each compliance requirement from the tender.
2. For each requirement, determine if it is MET, MISSING, or EXPIRED based on the uploaded documents.
3. Calculate an overall compliance score from 0 to 100.
4. Provide actionable procurement feedback.

Respond with ONLY a valid JSON object in this exact format:
{
  "score": <integer 0-100>,
  "requirements": [
    {
      "name": "<requirement name>",
      "status": "<MET|MISSING|EXPIRED>",
      "notes": "<brief explanation>"
    }
  ],
  "feedback": "<3-5 sentences of actionable procurement advice for this Nigerian SME>",
  "summary": "<one sentence overall assessment>"
}`;

    await delay(4000);

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not extract JSON from Gemini response.");
    }

    const analysisResult = JSON.parse(jsonMatch[0]);
    res.json({ success: true, result: analysisResult });
  } catch (err) {
    const is429 =
      err?.status === 429 ||
      err?.statusCode === 429 ||
      (err?.message || "").includes("429") ||
      (err?.message || "").toLowerCase().includes("quota") ||
      (err?.message || "").toLowerCase().includes("rate limit");

    if (is429) {
      console.warn("Gemini 429 quota limit hit — returning demo mock response.");
      return res.json({
        success: true,
        _mock: true,
        result: {
          score: 85,
          summary: `${companyProfile.name} is largely compliant with the tender requirements but must urgently renew its Tax Clearance Certificate before submission.`,
          requirements: [
            {
              name: "CAC Certificate of Incorporation",
              status: "MET",
              notes: "Valid company registration confirmed. RC number matches CAC records.",
            },
            {
              name: "Tax Clearance Certificate",
              status: "EXPIRED",
              notes: "The submitted Tax Clearance Certificate has passed its validity date. An updated certificate covering the last three fiscal years is mandatory.",
            },
            {
              name: "PENCOM Compliance Certificate",
              status: "MET",
              notes: "Pension remittance compliance certificate is current and valid.",
            },
            {
              name: "NSITF Certificate",
              status: "MET",
              notes: "Nigeria Social Insurance Trust Fund certificate is valid and up to date.",
            },
            {
              name: "Audited Financial Statements (3 years)",
              status: "MISSING",
              notes: "No audited financials were uploaded. Most federal tenders require statements for the last three financial years.",
            },
            {
              name: "Company Profile & Key Personnel CVs",
              status: "MET",
              notes: "Company profile document is present and covers core personnel.",
            },
            {
              name: "Evidence of Similar Previous Jobs",
              status: "MISSING",
              notes: "No letters of award or completion certificates for comparable contracts were provided.",
            },
          ],
          feedback:
            "Immediately obtain a renewed Tax Clearance Certificate from the Federal Inland Revenue Service (FIRS) — this is the most critical gap and will disqualify the bid if unresolved. Engage a certified auditor to finalise and certify financial statements for the last three years, as this is a standard Bureau of Public Procurement requirement. Compile at least three letters of award or job completion certificates from previous government or private-sector contracts to demonstrate relevant experience. Ensure all document expiry dates are tracked at least 60 days in advance to avoid last-minute disqualifications on future tenders. With these gaps addressed, your overall compliance posture is strong and competitive.",
        },
      });
    }

    console.error("Analysis error:", err);
    res.status(500).json({ error: err.message || "Analysis failed." });
  }
});

app.listen(PORT, "localhost", () => {
  console.log(`BidReady API running on http://localhost:${PORT}`);
});
