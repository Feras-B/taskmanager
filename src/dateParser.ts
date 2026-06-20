import { ScheduledEvent } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

const arabicMonths: Record<string, number> = {
  يناير: 0,
  فبراير: 1,
  مارس: 2,
  أبريل: 3,
  ابريل: 3,
  مايو: 4,
  يونيو: 5,
  يوليو: 6,
  أغسطس: 7,
  اغسطس: 7,
  سبتمبر: 8,
  أكتوبر: 9,
  اكتوبر: 9,
  نوفمبر: 10,
  ديسمبر: 11,
};

const englishMonths: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

const arabicWeekdays: Record<string, number> = {
  الأحد: 0,
  الاحد: 0,
  الإثنين: 1,
  الاثنين: 1,
  الثلاثاء: 2,
  الأربعاء: 3,
  الاربعاء: 3,
  الخميس: 4,
  الجمعة: 5,
  السبت: 6,
};

const periodTimes: Array<[RegExp, string]> = [
  [/(?:الصباح|صباحاً|صباحا)/, "09:00"],
  [/(?:الظهر|ظهراً|ظهرا)/, "12:00"],
  [/(?:العصر|عصراً|عصرا)/, "16:00"],
  [/(?:المساء|مساءً|مساء)/, "19:00"],
  [/(?:الليل|ليلاً|ليلا)/, "21:00"],
];

function normalizeDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  return new Date(startOfDay(date).getTime() + days * DAY_MS);
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function detectDate(message: string, now: Date) {
  if (/(?:بعد\s+(?:بكرة|بكرا)|عقب\s+(?:بكرة|بكرا))/.test(message)) {
    return addDays(now, 2);
  }

  if (/(?:بكرة|بكرا|غداً|غدا)/.test(message)) {
    return addDays(now, 1);
  }

  if (/(?:بعد\s+أسبوع|بعد\s+اسبوع|الأسبوع\s+(?:الجاي|القادم)|الاسبوع\s+(?:الجاي|القادم))/.test(message)) {
    return addDays(now, 7);
  }

  if (/(?:الشهر\s+(?:الجاي|القادم)|next\s+month)/i.test(message)) {
    const date = startOfDay(now);
    date.setMonth(date.getMonth() + 1);
    return date;
  }

  if (/(?:in\s+a\s+week|next\s+week)/i.test(message)) {
    return addDays(now, 7);
  }

  for (const [weekday, weekdayNumber] of Object.entries(arabicWeekdays)) {
    const weekdayPattern = new RegExp(`${weekday}\\s+(?:الجاي|القادم)`);
    if (weekdayPattern.test(message)) {
      const today = startOfDay(now);
      const daysAhead = (weekdayNumber - today.getDay() + 7) % 7 || 7;
      return addDays(today, daysAhead);
    }
  }

  const monthNames = Object.keys(arabicMonths).join("|");
  const explicitDate = message.match(new RegExp(`(?:بتاريخ\\s*)?(\\d{1,2})\\s+(${monthNames})(?:\\s+(\\d{4}))?`));
  if (explicitDate) {
    const day = Number(explicitDate[1]);
    const month = arabicMonths[explicitDate[2]];
    let year = explicitDate[3] ? Number(explicitDate[3]) : now.getFullYear();
    let date = new Date(year, month, day);

    if (!explicitDate[3] && date <= startOfDay(now)) {
      year += 1;
      date = new Date(year, month, day);
    }

    if (date.getMonth() === month && date.getDate() === day && date > startOfDay(now)) {
      return date;
    }
  }

  const englishMonthNames = Object.keys(englishMonths).join("|");
  const englishDate = message.match(new RegExp(`(?:on\\s+)?(${englishMonthNames})\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?`, "i"));
  if (englishDate) {
    const month = englishMonths[englishDate[1].toLowerCase()];
    const day = Number(englishDate[2]);
    let year = englishDate[3] ? Number(englishDate[3]) : now.getFullYear();
    let date = new Date(year, month, day);

    if (!englishDate[3] && date <= startOfDay(now)) {
      year += 1;
      date = new Date(year, month, day);
    }

    if (date.getMonth() === month && date.getDate() === day && date > startOfDay(now)) {
      return date;
    }
  }

  return null;
}

function detectTime(message: string) {
  const clockMatch = message.match(/(?:الساعة|ساعه)\s*(\d{1,2})(?::(\d{1,2}))?\s*(ص|م|صباحاً|صباحا|مساءً|مساء)?/);
  if (clockMatch) {
    let hour = Number(clockMatch[1]);
    const minute = Number(clockMatch[2] || 0);
    const marker = clockMatch[3] || "";
    const hasPmMarker = marker === "م" || marker.startsWith("مساء");
    const hasAmMarker = marker === "ص" || marker.startsWith("صباح");

    if (hasPmMarker && hour < 12) hour += 12;
    if (hasAmMarker && hour === 12) hour = 0;

    if (!hasAmMarker && !hasPmMarker) {
      if (/(?:العصر|المساء|الليل)/.test(message) && hour < 12) hour += 12;
    }

    if (hour <= 23 && minute <= 59) {
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }

  for (const [pattern, time] of periodTimes) {
    if (pattern.test(message)) return time;
  }

  return null;
}

function extractTitle(message: string) {
  const monthNames = Object.keys(arabicMonths).join("|");
  const englishMonthNames = Object.keys(englishMonths).join("|");
  return message
    .replace(/(?:بعد\s+(?:بكرة|بكرا)|عقب\s+(?:بكرة|بكرا)|بكرة|بكرا|غداً|غدا)/g, "")
    .replace(/(?:بعد\s+أسبوع|بعد\s+اسبوع|الأسبوع\s+(?:الجاي|القادم)|الاسبوع\s+(?:الجاي|القادم))/g, "")
    .replace(/(?:الشهر\s+(?:الجاي|القادم)|next\s+month|in\s+a\s+week|next\s+week)/gi, "")
    .replace(new RegExp(`(?:الأحد|الاحد|الإثنين|الاثنين|الثلاثاء|الأربعاء|الاربعاء|الخميس|الجمعة|السبت)\\s+(?:الجاي|القادم)`, "g"), "")
    .replace(new RegExp(`(?:بتاريخ\\s*)?\\d{1,2}\\s+(?:${monthNames})(?:\\s+\\d{4})?`, "g"), "")
    .replace(new RegExp(`(?:on\\s+)?(?:${englishMonthNames})\\s+\\d{1,2}(?:,?\\s+\\d{4})?`, "gi"), "")
    .replace(/(?:الساعة|ساعه)\s*\d{1,2}(?::\d{1,2})?\s*(?:ص|م|صباحاً|صباحا|مساءً|مساء)?/g, "")
    .replace(/(?:الصباح|صباحاً|صباحا|الظهر|ظهراً|ظهرا|العصر|عصراً|عصرا|المساء|مساءً|مساء|الليل|ليلاً|ليلا)/g, "")
    .replace(/^\s*(?:عندي|لدي|ذكرني|ذكّرني|تذكير|موعدي)\s*/g, "")
    .replace(/^\s*(?:i\s+have|remind\s+me\s+to)\s*/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[،,\s]+|[،,\s]+$/g, "")
    .trim();
}

export function parseScheduledEvent(originalMessage: string, now = new Date()): ScheduledEvent | null {
  const message = normalizeDigits(originalMessage.trim());
  const date = detectDate(message, now);
  if (!date) return null;

  return {
    id: globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 11),
    title: extractTitle(message) || message,
    date: toDateKey(date),
    time: detectTime(message),
    reminderMinutes: null,
    reminderNotifiedAt: null,
    originalMessage,
    createdAt: new Date().toISOString(),
    status: "upcoming",
  };
}

export function scheduledEventTimestamp(event: ScheduledEvent) {
  return new Date(`${event.date}T${event.time || "23:59"}:00`).getTime();
}
