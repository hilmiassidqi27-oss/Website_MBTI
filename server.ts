import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

// Ensure data persistence directory exists
const DATA_DIR = path.join(process.cwd(), "data");
const SUBMISSIONS_FILE = path.join(DATA_DIR, "submissions.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.error("Error creating data directory:", err);
  }
}

function readJsonFile<T>(filePath: string, defaultValue: T): T {
  try {
    ensureDataDir();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
  }
  return defaultValue;
}

function writeJsonFile(filePath: string, data: any): boolean {
  try {
    ensureDataDir();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
    return false;
  }
}

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// REST API for Submissions
app.get("/api/submissions", (_req, res) => {
  const submissions = readJsonFile<any[]>(SUBMISSIONS_FILE, []);
  res.json({ success: true, data: submissions });
});

app.post("/api/submissions", (req, res) => {
  try {
    const newSubmission = req.body;
    if (!newSubmission || !newSubmission.id) {
      return res.status(400).json({ success: false, message: "Invalid submission data (id required)" });
    }

    const current = readJsonFile<any[]>(SUBMISSIONS_FILE, []);
    const existingIndex = current.findIndex((s) => s.id === newSubmission.id);

    if (existingIndex >= 0) {
      current[existingIndex] = { ...current[existingIndex], ...newSubmission };
    } else {
      current.unshift(newSubmission);
    }

    writeJsonFile(SUBMISSIONS_FILE, current);
    console.log(`[API Server] Saved submission ${newSubmission.id} (${newSubmission.name}) - Total: ${current.length}`);
    return res.json({ success: true, data: newSubmission, total: current.length });
  } catch (err: any) {
    console.error("API error saving submission:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Bulk sync submissions endpoint
app.post("/api/submissions/sync", (req, res) => {
  try {
    const incoming: any[] = req.body.submissions || [];
    if (!Array.isArray(incoming)) {
      return res.status(400).json({ success: false, message: "Expected submissions array" });
    }

    const current = readJsonFile<any[]>(SUBMISSIONS_FILE, []);
    const map = new Map<string, any>();

    // Current on server
    for (const item of current) {
      if (item && item.id) map.set(item.id, item);
    }
    // Merge incoming
    for (const item of incoming) {
      if (item && item.id) {
        if (!map.has(item.id) || (item.timestamp && map.get(item.id)?.timestamp <= item.timestamp)) {
          map.set(item.id, item);
        }
      }
    }

    const merged = Array.from(map.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    writeJsonFile(SUBMISSIONS_FILE, merged);

    return res.json({ success: true, total: merged.length, data: merged });
  } catch (err: any) {
    console.error("API sync error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/api/submissions/:id", (req, res) => {
  try {
    const { id } = req.params;
    const current = readJsonFile<any[]>(SUBMISSIONS_FILE, []);
    const filtered = current.filter((s) => s.id !== id);
    writeJsonFile(SUBMISSIONS_FILE, filtered);
    return res.json({ success: true, total: filtered.length });
  } catch (err: any) {
    console.error("API error deleting submission:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Settings API
app.get("/api/settings", (_req, res) => {
  const settings = readJsonFile<any>(SETTINGS_FILE, {});
  res.json({ success: true, data: settings });
});

app.post("/api/settings", (req, res) => {
  try {
    const newSettings = req.body || {};
    const current = readJsonFile<any>(SETTINGS_FILE, {});
    const merged = { ...current, ...newSettings, updatedAt: new Date().toISOString() };
    writeJsonFile(SETTINGS_FILE, merged);
    return res.json({ success: true, data: merged });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`PT. Dian Pandu Pratama MBTI Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
