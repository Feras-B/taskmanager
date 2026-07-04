import { GoogleGenAI } from "@google/genai";

const SYSTEM_INSTRUCTION = `أنت مساعد سعودي ودود لتنظيم المهام.
عندما يرسل المستخدم رسالة عن مهامه:
1. قم بتحليل المهام وتصنيفها.
2. اجعل الرد قصيراً جداً وطبيعياً، بجملة أو جملتين فقط.
3. استخدم لهجة سعودية بسيطة مثل: "أبشر، رتبتها لك." أو "تمام، أضفتها لك."
4. لا تستخدم العربية الرسمية ولا تكتب شرحاً طويلاً.
5. استخرج كل مهمة أو موعد مستقل في عنصر منفصل، حتى لو احتوت الرسالة على عدة جمل وتواريخ.
6. افهم تعبيرات التاريخ مثل: بكرة، بعد بكرة، الأسبوع الجاي، بعد أسبوعين، بعد شهر، بتاريخ 26، يوم الاثنين، والساعة 5.
7. أعد date لكل مهمة بصيغة YYYY-MM-DD. استخدم تاريخ التقويم المرجعي لحساب التواريخ النسبية.
8. عند قول "بتاريخ 26" بدون شهر، استخدم شهر وسنة تاريخ التقويم المرجعي. إذا بقي التاريخ غامضاً فلا تخمّن؛ ضع سؤالاً قصيراً في clarification ولا تضف المهمة الغامضة.
9. بعد الرد القصير، أضف كائن JSON واحداً للمعالجة الداخلية.

تنسيق الرد:
نص حواري مشجع باللغة العربية، يليه كتلة JSON واحدة بالتنسيق التالي:
{
  "tasks": [
    {
      "title": "عنوان المهمة بالعربية",
      "category": "work|personal|health|social|other",
      "priority": "low|medium|high",
      "date": "YYYY-MM-DD",
      "time": "HH:MM إن وجد"
    }
  ],
  "clarification": null
}`;

function cleanVisibleReply(text: string, language: "ar" | "en") {
  const cleaned = text
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .replace(/\{[\s\S]*\}/g, "")
    .replace(/^\s*["']+|["']+\s*$/g, "")
    .replace(/\n{2,}/g, " ")
    .trim();

  if (!cleaned || /["']?tasks["']?\s*:/.test(cleaned)) {
    return language === "en" ? "Got it." : "تمام، استلمتها.";
  }

  return cleaned.length > 180 ? `${cleaned.slice(0, 177).trim()}...` : cleaned;
}

interface ParsedTask {
  title: string;
  category: "work" | "personal" | "health" | "social" | "other";
  priority: "low" | "medium" | "high";
  date?: string;
  time?: string;
}

export function isGeminiQuotaError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
    code?: unknown;
    message?: unknown;
    error?: { code?: unknown; message?: unknown; status?: unknown };
  };
  const status = candidate.status
    ?? candidate.statusCode
    ?? candidate.code
    ?? candidate.error?.code;
  const message = [
    candidate.message,
    candidate.error?.message,
    candidate.error?.status,
  ].filter(value => typeof value === "string").join(" ");

  return Number(status) === 429 || /429|quota|resource_exhausted/i.test(message);
}

export async function parseTasksWithGemini(
  message: string,
  language: "ar" | "en",
  selectedDate?: string,
) {
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
      retryOptions: {
        attempts: 1,
      },
    },
  });

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: message,
    config: {
      systemInstruction: `${SYSTEM_INSTRUCTION}

تاريخ التقويم المرجعي: ${selectedDate || new Date().toISOString().slice(0, 10)}.
لغة الرد المطلوبة: ${language === "en" ? "English" : "العربية"}.
اكتب الرد وعناوين المهام باللغة المطلوبة، مع الحفاظ على قيم category وpriority بالإنجليزية كما هي في تنسيق JSON.
إذا كان clarification مطلوباً، اجعله سؤالاً واحداً قصيراً باللغة المطلوبة.`,
    },
  });

  const text = response.text || "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  let tasks: ParsedTask[] = [];
  let cleanText = text;
  let clarification = "";

  if (jsonMatch) {
    try {
      const jsonData = JSON.parse(jsonMatch[0]) as {
        tasks?: ParsedTask[];
        clarification?: unknown;
      };
      tasks = Array.isArray(jsonData.tasks) ? jsonData.tasks : [];
      clarification = typeof jsonData.clarification === "string"
        ? jsonData.clarification.trim()
        : "";
      cleanText = text.replace(jsonMatch[0], "").trim();
    } catch (error) {
      console.error("Failed to parse JSON from Gemini response:", error);
    }
  }

  const reply = clarification || (tasks.length > 0
    ? language === "en" ? "Done, I organized it for you." : "أبشر، رتبتها لك."
    : cleanVisibleReply(cleanText, language));

  return {
    reply,
    tasks: tasks.map(task => ({
      ...task,
      id: globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 11),
      completed: false,
      createdAt: new Date().toISOString(),
    })),
  };
}
