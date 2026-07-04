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

  const configuredKey = process.env.GEMINI_API_KEY?.trim();
  const apiKey = configuredKey?.replace(/^(["'])(.*)\1$/, "$2").trim();
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
  }

  try {
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
      contents: message.trim(),
      config: {
        systemInstruction: `${SYSTEM_INSTRUCTION}

تاريخ التقويم المرجعي: ${typeof selectedDate === "string"
  ? selectedDate
  : new Date().toISOString().slice(0, 10)}.
لغة الرد المطلوبة: ${language === "en" ? "English" : "العربية"}.
اكتب الرد وعناوين المهام باللغة المطلوبة، مع الحفاظ على قيم category وpriority بالإنجليزية كما هي في تنسيق JSON.
إذا كان clarification مطلوباً، اجعله سؤالاً واحداً قصيراً باللغة المطلوبة.`,
      },
    });

    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    let tasks = [];
    let cleanText = text;
    let clarification = "";

    if (jsonMatch) {
      try {
        const jsonData = JSON.parse(jsonMatch[0]);
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

    return res.status(200).json({
      reply,
      tasks: tasks.map(task => ({
        ...task,
        id: globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 11),
        completed: false,
        createdAt: new Date().toISOString(),
      })),
    });
  } catch (error) {
    console.error("Gemini API error:", error);
    return res.status(500).json({ error: "Failed to process message" });
  }
}
