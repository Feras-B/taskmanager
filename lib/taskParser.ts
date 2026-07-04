import { GoogleGenAI } from "@google/genai";

const SYSTEM_INSTRUCTION = `أنت مساعد ذكي ومنظم للمهام. مهمتك هي مساعدة المستخدم في ترتيب يومه بطريقة ودودة وحوارية.
عندما يرسل المستخدم رسالة عن مهامه:
1. قم بتحليل المهام وتصنيفها.
2. اقترح خطة عمل مرتبة للمستخدم.
3. التزم بلهجة ودودة وداعمة وشجع المستخدم.
4. يجب أن ينتهي ردك دائماً بكتلة JSON تحتوي على المهام المقترحة ليتمكن النظام من معالجتها.

تنسيق الرد:
نص حواري مشجع باللغة العربية، يليه كتلة JSON واحدة بالتنسيق التالي:
{
  "tasks": [
    {
      "title": "عنوان المهمة بالعربية",
      "category": "work|personal|health|social|other",
      "priority": "low|medium|high",
      "time": "الوقت المقترح إن وجد"
    }
  ]
}`;

interface ParsedTask {
  title: string;
  category: "work" | "personal" | "health" | "social" | "other";
  priority: "low" | "medium" | "high";
  time?: string;
}

export async function parseTasksWithGemini(message: string, language: "ar" | "en") {
  const configuredKey = process.env.GEMINI_API_KEY?.trim();
  const apiKey = configuredKey?.replace(/^(["'])(.*)\1$/, "$2").trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "yomak-ai",
      },
    },
  });

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: message,
    config: {
      systemInstruction: `${SYSTEM_INSTRUCTION}

لغة الرد المطلوبة: ${language === "en" ? "English" : "العربية"}.
اكتب الرد وعناوين المهام باللغة المطلوبة، مع الحفاظ على قيم category وpriority بالإنجليزية كما هي في تنسيق JSON.`,
    },
  });

  const text = response.text || "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  let tasks: ParsedTask[] = [];
  let cleanText = text;

  if (jsonMatch) {
    try {
      const jsonData = JSON.parse(jsonMatch[0]) as { tasks?: ParsedTask[] };
      tasks = Array.isArray(jsonData.tasks) ? jsonData.tasks : [];
      cleanText = text.replace(jsonMatch[0], "").trim();
    } catch (error) {
      console.error("Failed to parse JSON from Gemini response:", error);
    }
  }

  return {
    reply: cleanText || (language === "en"
      ? "Your tasks were received successfully."
      : "تم استلام مهامك بنجاح!"),
    tasks: tasks.map(task => ({
      ...task,
      id: globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 11),
      completed: false,
      createdAt: new Date().toISOString(),
    })),
  };
}
