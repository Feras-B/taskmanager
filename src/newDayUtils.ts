import { addDaysToKey } from "./calendarUtils";
import { Task } from "./types";

export type NewDayAction = "move" | "keep" | "archive-only";

export function applyNewDayAction(
  tasks: Task[],
  sourceDate: string,
  selectedTaskIds: string[],
  action: NewDayAction,
  archivedAt = new Date().toISOString(),
) {
  const selectedIds = new Set(selectedTaskIds);
  const tomorrow = addDaysToKey(sourceDate, 1);
  const completed = tasks.filter(task => task.date === sourceDate && task.completed);
  const activeTasks = tasks
    .filter(task => !(task.date === sourceDate && task.completed))
    .map(task =>
      action === "move" && task.date === sourceDate && selectedIds.has(task.id)
        ? { ...task, date: tomorrow, reminderNotifiedAt: null }
        : task
    );

  return {
    activeTasks,
    archivedTasks: completed.map(task => ({ ...task, archivedAt })),
    movedCount: action === "move" ? selectedIds.size : 0,
    tomorrow,
  };
}
