export interface Task {
  id: string;
  title: string;
  category: "work" | "personal" | "health" | "social" | "other";
  priority: "low" | "medium" | "high";
  time?: string;
  timeNote?: string;
  date: string;
  reminderMinutes: number | null;
  reminderNotifiedAt: string | null;
  completed: boolean;
  createdAt: string;
  archivedAt?: string;
}

export interface TrashedTask extends Task {
  trashedAt: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  tasks?: Task[];
}

export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  isTemporary: boolean;
}

export interface ScheduledEvent {
  id: string;
  title: string;
  date: string;
  time: string | null;
  reminderMinutes: number | null;
  reminderNotifiedAt: string | null;
  originalMessage: string;
  createdAt: string;
  status: "upcoming" | "completed";
}
