import { GoogleGenAI } from "@google/genai";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

function getGeminiApiKey() {
  const configuredKey = process.env.GEMINI_API_KEY?.trim();
  return configuredKey?.replace(/^(["'])(.*)\1$/, "$2").trim();
}

function cleanTranscript(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^(?:النص|التفريغ|transcript|transcription)\s*:\s*/i, "")
    .replace(/^\s*["']+|["']+\s*$/g, "")
    .trim();
}

async function readAudioBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (req.body instanceof Uint8Array) return Buffer.from(req.body);

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_AUDIO_BYTES) throw new Error("Audio is too large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
  }

  try {
    const audio = await readAudioBody(req);
    if (!audio.length) return res.status(400).json({ error: "Audio is required" });
    if (audio.length > MAX_AUDIO_BYTES) {
      return res.status(413).json({ error: "Audio is too large" });
    }

    const mimeType = String(req.headers["content-type"] || "audio/webm").split(";")[0];
    const language = req.headers["x-transcription-language"] === "en" ? "en" : "ar";
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{
        role: "user",
        parts: [
          {
            text: language === "ar"
              ? "فرّغ هذا التسجيل الصوتي إلى نص عربي فقط. لا تضف شرحاً أو علامات اقتباس."
              : "Transcribe this audio into English text only. Do not add commentary or quotation marks.",
          },
          {
            inlineData: {
              data: audio.toString("base64"),
              mimeType,
            },
          },
        ],
      }],
    });

    const text = cleanTranscript(response.text);
    if (!text) throw new Error("Transcription was empty");
    return res.status(200).json({ text });
  } catch (error) {
    console.error("Audio transcription error:", error);
    return res.status(500).json({ error: "Failed to transcribe audio" });
  }
}
