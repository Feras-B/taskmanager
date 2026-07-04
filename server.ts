import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { isGeminiQuotaError, parseTasksWithGemini } from "./lib/taskParser";
import { transcribeAudioWithGemini } from "./lib/audioTranscription";

dotenv.config({ path: ".env.local" });
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

app.post("/api/parse-tasks", async (req, res) => {
  const { message, language = "ar", selectedDate } = req.body || {};

  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    const result = await parseTasksWithGemini(
      message.trim(),
      language === "en" ? "en" : "ar",
      typeof selectedDate === "string" ? selectedDate : undefined,
    );
    res.json(result);
  } catch (error) {
    console.error("Gemini Error:", error);
    if (isGeminiQuotaError(error)) {
      return res.status(429).json({ error: "quota_exceeded" });
    }
    res.status(500).json({
      error: process.env.GEMINI_API_KEY
        ? "Failed to process message"
        : "GEMINI_API_KEY is not configured",
    });
  }
});

app.post(
  "/api/transcribe-audio",
  express.raw({ type: ["audio/*", "application/octet-stream"], limit: "10mb" }),
  async (req, res) => {
    const audio = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!audio.length) return res.status(400).json({ error: "Audio is required" });

    try {
      const mimeType = String(req.headers["content-type"] || "audio/webm").split(";")[0];
      const language = req.headers["x-transcription-language"] === "en" ? "en" : "ar";
      const text = await transcribeAudioWithGemini(audio, mimeType, language);
      return res.json({ text });
    } catch (error) {
      console.error("Audio transcription error:", error);
      if (isGeminiQuotaError(error)) {
        return res.status(429).json({ error: "quota_exceeded" });
      }
      return res.status(500).json({
        error: process.env.GEMINI_API_KEY
          ? "Failed to transcribe audio"
          : "GEMINI_API_KEY is not configured",
      });
    }
  },
);

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
