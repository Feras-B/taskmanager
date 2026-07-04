import { GoogleGenAI } from "@google/genai";

function getGeminiApiKey() {
  const configuredKey = process.env.GEMINI_API_KEY?.trim();
  return configuredKey?.replace(/^(["'])(.*)\1$/, "$2").trim();
}

function cleanTranscript(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^(?:النص|التفريغ|transcript|transcription)\s*:\s*/i, "")
    .replace(/^\s*["']+|["']+\s*$/g, "")
    .trim();
}

export async function transcribeAudioWithGemini(
  audio: Buffer,
  mimeType: string,
  language: "ar" | "en",
) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  if (!audio.length) throw new Error("Audio is empty");

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
  return text;
}
