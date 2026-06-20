import { ChevronLeft, ChevronRight } from "lucide-react";
import { ScheduledEvent, Task } from "./types";
import {
  addDaysToKey,
  addMonthsToKey,
  CalendarViewMode,
  fromDateKey,
  getMonthGrid,
  getWeekDates,
  toDateKey,
} from "./calendarUtils";

interface CalendarPanelProps {
  language: "ar" | "en";
  selectedDate: string;
  view: CalendarViewMode;
  tasks: Task[];
  events: ScheduledEvent[];
  onSelectDate: (date: string) => void;
  onViewChange: (view: CalendarViewMode) => void;
}

export default function CalendarPanel({
  language,
  selectedDate,
  view,
  tasks,
  events,
  onSelectDate,
  onViewChange,
}: CalendarPanelProps) {
  const locale = language === "ar" ? "ar-SA" : "en-US";
  const today = toDateKey(new Date());
  const selected = fromDateKey(selectedDate);
  const visibleDates = view === "month" ? getMonthGrid(selectedDate) : getWeekDates(selectedDate);
  const month = selected.getMonth();
  const dateCounts = new Map<string, number>();

  tasks.forEach(task => dateCounts.set(task.date, (dateCounts.get(task.date) || 0) + 1));
  events
    .filter(event => event.status === "upcoming")
    .forEach(event => dateCounts.set(event.date, (dateCounts.get(event.date) || 0) + 1));

  const move = (direction: number) => {
    if (view === "month") {
      onSelectDate(addMonthsToKey(selectedDate, direction));
    } else if (view === "week") {
      onSelectDate(addDaysToKey(selectedDate, direction * 7));
    } else {
      onSelectDate(addDaysToKey(selectedDate, direction));
    }
  };

  const viewLabels = language === "ar"
    ? { today: "اليوم", week: "الأسبوع", month: "الشهر" }
    : { today: "Today", week: "Week", month: "Month" };
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2026, 5, 21 + index))
  );

  return (
    <section className="mb-8 border-y border-zinc-200 py-5 dark:border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900">
          {(["today", "week", "month"] as CalendarViewMode[]).map(option => (
            <button
              key={option}
              onClick={() => {
                onViewChange(option);
                if (option === "today") onSelectDate(today);
              }}
              className={`px-3 py-2 text-xs font-semibold transition-colors ${
                view === option
                  ? "rounded-md bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
              }`}
            >
              {viewLabels[option]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => move(-1)}
            className="p-2 text-zinc-500 hover:text-primary dark:text-zinc-400"
            aria-label={language === "ar" ? "السابق" : "Previous"}
          >
            {language === "ar" ? <ChevronRight size={19} /> : <ChevronLeft size={19} />}
          </button>
          <div className="min-w-36 text-center text-sm font-bold text-zinc-800 dark:text-zinc-100">
            {new Intl.DateTimeFormat(locale, {
              month: "long",
              year: "numeric",
              ...(view === "today" ? { day: "numeric" } : {}),
            }).format(selected)}
          </div>
          <button
            onClick={() => move(1)}
            className="p-2 text-zinc-500 hover:text-primary dark:text-zinc-400"
            aria-label={language === "ar" ? "التالي" : "Next"}
          >
            {language === "ar" ? <ChevronLeft size={19} /> : <ChevronRight size={19} />}
          </button>
        </div>
      </div>

      {view === "today" ? (
        <button
          onClick={() => onSelectDate(selectedDate)}
          className="mt-5 flex w-full items-center justify-between border-s-4 border-primary bg-primary/5 px-4 py-3 text-start"
        >
          <span className="font-semibold text-zinc-800 dark:text-zinc-100">
            {new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(selected)}
          </span>
          <span className="text-xs font-medium text-primary">
            {dateCounts.get(selectedDate) || 0}
          </span>
        </button>
      ) : (
        <div className={`mt-5 grid grid-cols-7 ${view === "month" ? "gap-px bg-zinc-200 dark:bg-zinc-800" : "gap-2"}`}>
          {view === "month" && weekdays.map(day => (
            <div key={day} className="bg-zinc-50 py-2 text-center text-[11px] font-semibold text-zinc-400 dark:bg-zinc-950">
              {day}
            </div>
          ))}
          {visibleDates.map(dateKey => {
            const date = fromDateKey(dateKey);
            const selectedDay = dateKey === selectedDate;
            const outsideMonth = view === "month" && date.getMonth() !== month;
            const count = dateCounts.get(dateKey) || 0;
            return (
              <button
                key={dateKey}
                onClick={() => onSelectDate(dateKey)}
                className={`relative min-h-16 p-2 text-start transition-colors ${
                  view === "month" ? "bg-white dark:bg-zinc-950" : "rounded-lg border border-zinc-200 dark:border-zinc-800"
                } ${selectedDay ? "ring-2 ring-inset ring-primary" : "hover:bg-zinc-50 dark:hover:bg-zinc-900"} ${
                  outsideMonth ? "text-zinc-300 dark:text-zinc-700" : "text-zinc-700 dark:text-zinc-200"
                }`}
              >
                <span className={`text-xs font-semibold ${dateKey === today ? "text-primary" : ""}`}>
                  {date.getDate()}
                </span>
                {count > 0 && (
                  <span className="absolute bottom-2 end-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
