import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..", "web");
const indexHtmlPath = path.join(webRoot, "index.html");

const app = express();
app.use(express.json({ limit: "256kb" }));

const SUPPORTERS_FIELDS = [
  "payment_at", "amount_paid", "payment_successful", "refund", "supporter_id",
  "recurring_donor", "supporter_name", "email", "receipt_number", "financial_year",
  "payment_method", "anonymous_donation", "project", "fee_amount", "mobile_phone",
  "supporter_type", "acquisition_date", "recurring_donor_status", "membership_status"
];

async function invoke(req, capability, input) {
  const gatewayUrl = process.env.KNOWI_GATEWAY_URL;
  const token = req.headers["x-knowi-capability-token"];
  try {
    const response = await fetch(gatewayUrl + "/v1/capabilities", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Knowi-Capability-Token": token || ""
      },
      body: JSON.stringify({ capability, input })
    });
    let json = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    return { status: response.status, json };
  } catch {
    return { status: 502, json: { error: "Failed to reach the gateway" } };
  }
}

function parseViewer(headerValue) {
  if (!headerValue) return null;
  try {
    const normalized = headerValue.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(normalized, "base64").toString("utf8");
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object") {
      return { id: parsed.id, name: parsed.name, email: parsed.email };
    }
  } catch {
    return null;
  }
  return null;
}

app.get("/api/supporters", async (req, res) => {
  try {
    let rows = [];
    let columns = null;
    let offset = 0;
    let truncated = true;
    let iterations = 0;

    while (truncated && iterations < 10) {
      const result = await invoke(req, "data.query", {
        binding: "supporters",
        fields: SUPPORTERS_FIELDS,
        limit: 50000,
        offset,
        sort: [{ field: "payment_at", direction: "desc" }]
      });

      if (result.status < 200 || result.status >= 300) {
        return res.status(result.status).json(result.json || { error: "Request failed" });
      }

      const data = result.json || {};
      columns = data.columns || columns;
      rows = rows.concat(Array.isArray(data.rows) ? data.rows : []);
      truncated = Boolean(data.truncated) && data.nextOffset !== undefined && data.nextOffset !== null;
      offset = data.nextOffset;
      iterations++;
    }

    const viewer = parseViewer(req.headers["x-knowi-app-user"]);
    res.json({ columns: columns || SUPPORTERS_FIELDS, rows, viewer });
  } catch {
    res.status(500).json({ error: "Failed to load supporters data" });
  }
});

app.use(express.static(webRoot));

app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found" });
  res.sendFile(indexHtmlPath);
});

const port = Number(process.env.PORT);
app.listen(port, "0.0.0.0");
