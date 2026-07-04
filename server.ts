import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { parseTasksWithGemini } from "./lib/taskParser";

dotenv.config({ path: ".env.local" });
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

app.post("/api/parse-tasks", async (req, res) => {
  const { message, language = "ar" } = req.body || {};

  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    const result = await parseTasksWithGemini(
      message.trim(),
      language === "en" ? "en" : "ar",
    );
    res.json(result);
  } catch (error) {
    console.error("Gemini Error:", error);
    res.status(500).json({
      error: process.env.GEMINI_API_KEY
        ? "Failed to process message"
        : "GEMINI_API_KEY is not configured",
    });
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
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "127.0.0.1", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
