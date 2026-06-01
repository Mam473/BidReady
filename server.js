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

app.post("/api/analyze", (req, res) => {
  const { companyProfile } = req.body;
  const companyName = companyProfile?.name || "Your Company";

  console.log(`[DEMO MODE] Returning mock analysis for: ${companyName}`);

  res.json({
    success: true,
    _mock: true,
    result: {
      score: 85,
      summary: `${companyName} is largely compliant with the tender requirements but must urgently renew its Tax Clearance Certificate before submission.`,
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
});

app.listen(PORT, "localhost", () => {
  console.log(`BidReady API running on http://localhost:${PORT}`);
});
