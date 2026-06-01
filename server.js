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
    console.error("Analysis error:", err);
    res.status(500).json({ error: err.message || "Analysis failed." });
  }
});

app.listen(PORT, "localhost", () => {
  console.log(`BidReady API running on http://localhost:${PORT}`);
});
