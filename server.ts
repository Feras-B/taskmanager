import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Prompt for parsing tasks
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

app.post("/api/parse-tasks", async (req, res) => {
  const { message, language = "ar" } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
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
    
    // Extract JSON part
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    let tasks = [];
    let cleanText = text;

    if (jsonMatch) {
      try {
        const jsonData = JSON.parse(jsonMatch[0]);
        tasks = jsonData.tasks || [];
        cleanText = text.replace(jsonMatch[0], "").trim();
      } catch (e) {
        console.error("Failed to parse JSON from AI response", e);
      }
    }

    res.json({
      reply: cleanText || "تم استلام مهامك بنجاح!",
      tasks: tasks.map((t: any) => ({
        ...t,
        id: Math.random().toString(36).substr(2, 9),
        completed: false,
        createdAt: new Date().toISOString()
      }))
    });
  } catch (error) {
    console.error("Gemini Error:", error);
    res.status(500).json({ error: "Failed to process message" });
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
