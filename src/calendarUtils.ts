export type CalendarViewMode = "today" | "week" | "month";

export function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromDateKey(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`);
}

export function addDaysToKey(dateKey: string, days: number) {
  const date = fromDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function addMonthsToKey(dateKey: string, months: number) {
  const date = fromDateKey(dateKey);
  date.setMonth(date.getMonth() + months);
  return toDateKey(date);
}

export function getWeekDates(dateKey: string) {
  const date = fromDateKey(dateKey);
  date.setDate(date.getDate() - date.getDay());
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(date);
    day.setDate(date.getDate() + index);
    return toDateKey(day);
  });
}

export function getMonthGrid(dateKey: string) {
  const date = fromDateKey(dateKey);
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  first.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(first);
    day.setDate(first.getDate() + index);
    return toDateKey(day);
  });
}
