import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import {
  isGeminiQuotaError,
  isGeminiServiceUnavailableError,
  parseTasksLocally,
  parseTasksWithGemini,
  parseTasksWithOpenRouter,
} from "./lib/taskParser";
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
    const normalizedLanguage = language === "en" ? "en" : "ar";
    const normalizedSelectedDate = typeof selectedDate === "string" ? selectedDate : undefined;
    const localResult = parseTasksLocally(
      message.trim(),
      normalizedLanguage,
      normalizedSelectedDate,
    );
    if (localResult) {
      console.info("[parse-tasks] provider=local_parser");
      return res.json(localResult);
    }

    try {
      const result = await parseTasksWithGemini(
        message.trim(),
        normalizedLanguage,
        normalizedSelectedDate,
      );
      console.info("[parse-tasks] provider=gemini");
      return res.json(result);
    } catch (geminiError) {
      console.error("Gemini Error:", geminiError);
      const result = await parseTasksWithOpenRouter(
        message.trim(),
        normalizedLanguage,
        normalizedSelectedDate,
      );
      console.info("[parse-tasks] provider=openrouter");
      return res.json(result);
    }
  } catch (error) {
    console.error("Task parse providers failed:", error);
    console.info("[parse-tasks] provider=failed_all");
    return res.status(503).json({ error: "service_unavailable" });
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
