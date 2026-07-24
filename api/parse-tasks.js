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

function cleanVisibleReply(text, language) {
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

function parseModelText(text, language) {
  const safeText = typeof text === "string" ? text : "";
  const jsonMatch = safeText.match(/\{[\s\S]*\}/);
  let tasks = [];
  let cleanText = safeText;
  let clarification = "";

  if (jsonMatch) {
    try {
      const jsonData = JSON.parse(jsonMatch[0]);
      tasks = Array.isArray(jsonData.tasks) ? jsonData.tasks : [];
      clarification = typeof jsonData.clarification === "string"
        ? jsonData.clarification.trim()
        : "";
      cleanText = safeText.replace(jsonMatch[0], "").trim();
    } catch (error) {
      console.error("Failed to parse JSON from AI response:", error);
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

function isGeminiQuotaError(error) {
  if (!error || typeof error !== "object") return false;
  const status = error.status ?? error.statusCode ?? error.code ?? error.error?.code;
  const message = [
    error.message,
    error.error?.message,
    error.error?.status,
  ].filter(value => typeof value === "string").join(" ");
  return Number(status) === 429 || /429|quota|resource_exhausted/i.test(message);
}

function isGeminiServiceUnavailableError(error) {
  if (!error || typeof error !== "object") return false;
  const status = error.status ?? error.statusCode ?? error.code ?? error.error?.code;
  const message = [
    error.message,
    error.error?.message,
    error.error?.status,
  ].filter(value => typeof value === "string").join(" ");
  return Number(status) === 503
    || /503|service unavailable|unavailable|retryable|fetch failed|network|econnreset|etimedout/i.test(message);
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function referenceDate(selectedDate) {
  if (typeof selectedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
    return new Date(`${selectedDate}T12:00:00`);
  }
  return new Date();
}

function addDays(date, days) {
  return new Date(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() + days * DAY_MS);
}

function localDateForText(text, selectedDate) {
  const base = referenceDate(selectedDate);
  if (/(?:بعد\s+(?:بكرة|بكرا)|عقب\s+(?:بكرة|بكرا))/i.test(text)) return dateKey(addDays(base, 2));
  if (/(?:بكرة|بكرا|غداً|غدا|tomorrow)/i.test(text)) return dateKey(addDays(base, 1));
  if (/(?:بعد\s+أسبوعين|بعد\s+اسبوعين|in\s+two\s+weeks)/i.test(text)) return dateKey(addDays(base, 14));
  if (/(?:بعد\s+أسبوع|بعد\s+اسبوع|الأسبوع\s+(?:الجاي|القادم)|الاسبوع\s+(?:الجاي|القادم)|next\s+week|in\s+a\s+week)/i.test(text)) return dateKey(addDays(base, 7));
  if (/(?:بعد\s+شهر|الشهر\s+(?:الجاي|القادم)|next\s+month)/i.test(text)) {
    const date = new Date(base);
    date.setMonth(date.getMonth() + 1);
    return dateKey(date);
  }
  const dayOnly = text.match(/(?:بتاريخ\s*)?(\d{1,2})(?!\s*:)/);
  if (dayOnly) {
    const day = Number(dayOnly[1]);
    const date = new Date(base.getFullYear(), base.getMonth(), day);
    if (day >= 1 && day <= 31 && date.getMonth() === base.getMonth()) return dateKey(date);
  }
  return typeof selectedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)
    ? selectedDate
    : dateKey(base);
}

function localTimeForText(text) {
  const match = text.match(/(?:الساعة|ساعه|at)\s*(\d{1,2})(?::(\d{1,2}))?\s*(ص|م|am|pm|صباحاً|صباحا|مساءً|مساء)?/i);
  if (!match) return undefined;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const marker = String(match[3] || "").toLowerCase();
  if ((marker === "م" || marker === "pm" || marker.startsWith("مساء")) && hour < 12) hour += 12;
  if ((marker === "ص" || marker === "am" || marker.startsWith("صباح")) && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return undefined;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function localTitleForText(text) {
  return text
    .replace(/(?:بعد\s+(?:بكرة|بكرا)|عقب\s+(?:بكرة|بكرا)|بكرة|بكرا|غداً|غدا|tomorrow)/gi, "")
    .replace(/(?:بعد\s+أسبوعين|بعد\s+اسبوعين|بعد\s+أسبوع|بعد\s+اسبوع|الأسبوع\s+(?:الجاي|القادم)|الاسبوع\s+(?:الجاي|القادم)|in\s+two\s+weeks|next\s+week|in\s+a\s+week)/gi, "")
    .replace(/(?:بعد\s+شهر|الشهر\s+(?:الجاي|القادم)|next\s+month)/gi, "")
    .replace(/(?:الساعة|ساعه|at)\s*\d{1,2}(?::\d{1,2})?\s*(?:ص|م|am|pm|صباحاً|صباحا|مساءً|مساء)?/gi, "")
    .replace(/(?:بتاريخ\s*)?\d{1,2}(?!\s*:)/g, "")
    .replace(/^\s*(?:عندي|لدي|ذكرني|ذكّرني|تذكير|i\s+have|remind\s+me\s+to)\s*/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[،,\s]+|[،,\s]+$/g, "")
    .trim();
}

function parseTasksLocally(message, language, selectedDate) {
  const normalized = message.trim();
  if (!normalized) return null;
  const hasTaskCue = /(?:عندي|لدي|ذكرني|ذكّرني|تذكير|موعد|اجتماع|مكالمة|تمرين|بكرة|بكرا|بعد|بتاريخ|الساعة|today|tomorrow|meeting|call|remind|task|appointment|next|on\s+\w+)/i.test(normalized);
  if (!hasTaskCue) return null;
  const parts = normalized
    .split(/\s*(?:،|,| و(?=(?:بعد|بكرة|بكرا|بتاريخ|عندي|لدي|موعد|اجتماع|مكالمة|تمرين|روح|اذهب))| and (?=(?:tomorrow|next|on|i have|call|meeting)))\s*/i)
    .map(part => part.trim())
    .filter(Boolean);
  const candidates = parts.length > 1 ? parts : [normalized];
  const tasks = candidates
    .map(part => {
      const title = localTitleForText(part) || part;
      if (title.length < 2) return null;
      return {
        title,
        category: "other",
        priority: "medium",
        date: localDateForText(part, selectedDate),
        time: localTimeForText(part),
        id: globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 11),
        completed: false,
        createdAt: new Date().toISOString(),
      };
    })
    .filter(Boolean);
  if (tasks.length === 0) return null;
  return {
    reply: language === "en" ? "Done, I saved it locally." : "تم، حفظتها لك.",
    tasks,
    source: "local",
  };
}

async function parseTasksWithGemini(message, language, selectedDate) {
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

  return parseModelText(response.text || "", language);
}

async function parseTasksWithOpenRouter(message, language, selectedDate) {
  const configuredKey = process.env.OPENROUTER_API_KEY?.trim();
  const apiKey = configuredKey?.replace(/^(["'])(.*)\1$/, "$2").trim();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const model = process.env.OPENROUTER_MODEL?.trim() || "openrouter/free";
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://yomak-ai.vercel.app",
      "X-Title": "Yomak AI",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `${SYSTEM_INSTRUCTION}

تاريخ التقويم المرجعي: ${selectedDate || new Date().toISOString().slice(0, 10)}.
لغة الرد المطلوبة: ${language === "en" ? "English" : "العربية"}.
اكتب الرد وعناوين المهام باللغة المطلوبة، مع الحفاظ على قيم category وpriority بالإنجليزية كما هي في تنسيق JSON.
إذا كان clarification مطلوباً، اجعله سؤالاً واحداً قصيراً باللغة المطلوبة.
أعد JSON بنفس البنية المطلوبة فقط بعد الرد القصير، ولا تستخدم markdown أو code fences.`,
        },
        { role: "user", content: message },
      ],
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      typeof data.error?.message === "string"
        ? data.error.message
        : `OpenRouter request failed with status ${response.status}`,
    );
    error.status = response.status;
    error.error = data.error;
    throw error;
  }

  const text = data.choices?.[0]?.message?.content;
  return parseModelText(typeof text === "string" ? text : "", language);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body = req.body || {};
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  }
  const { message, language = "ar", selectedDate } = body;

  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Message is required" });
  }

  const normalizedLanguage = language === "en" ? "en" : "ar";
  const normalizedSelectedDate = typeof selectedDate === "string" ? selectedDate : undefined;
  const localResult = parseTasksLocally(
    message.trim(),
    normalizedLanguage,
    normalizedSelectedDate,
  );
  if (localResult) {
    console.info("[parse-tasks] provider=local_parser");
    return res.status(200).json(localResult);
  }

  try {
    const geminiResult = await parseTasksWithGemini(
      message.trim(),
      normalizedLanguage,
      normalizedSelectedDate,
    );
    console.info("[parse-tasks] provider=gemini");
    return res.status(200).json(geminiResult);
  } catch (geminiError) {
    console.error("Gemini API error:", geminiError);
    const shouldTryOpenRouter = isGeminiQuotaError(geminiError)
      || isGeminiServiceUnavailableError(geminiError);

    if (!shouldTryOpenRouter) {
      console.warn("Gemini failed with a non-retryable error; trying OpenRouter fallback once.");
    }

    try {
      const openRouterResult = await parseTasksWithOpenRouter(
        message.trim(),
        normalizedLanguage,
        normalizedSelectedDate,
      );
      console.info("[parse-tasks] provider=openrouter");
      return res.status(200).json(openRouterResult);
    } catch (openRouterError) {
      console.error("OpenRouter API error:", openRouterError);
    }

    const fallbackLocalResult = parseTasksLocally(
      message.trim(),
      normalizedLanguage,
      normalizedSelectedDate,
    );
    if (fallbackLocalResult) {
      console.info("[parse-tasks] provider=local_parser");
      return res.status(200).json(fallbackLocalResult);
    }

    console.info("[parse-tasks] provider=failed_all");
    return res.status(503).json({ error: "service_unavailable" });
  }
}
