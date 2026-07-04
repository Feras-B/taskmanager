import type { Request, Response } from "express";
import { parseTasksWithGemini } from "../lib/taskParser";

export default async function handler(req: Request, res: Response) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message, language = "ar" } = req.body || {};
  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    const result = await parseTasksWithGemini(
      message.trim(),
      language === "en" ? "en" : "ar",
    );
    return res.status(200).json(result);
  } catch (error) {
    console.error("Gemini API error:", error);
    return res.status(500).json({
      error: process.env.GEMINI_API_KEY
        ? "Failed to process message"
        : "GEMINI_API_KEY is not configured",
    });
  }
}
