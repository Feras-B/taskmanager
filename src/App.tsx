/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  CheckCircle2, 
  Circle, 
  Clock, 
  Calendar, 
  Trash2, 
  MessageSquare, 
  ListChecks,
  LayoutDashboard,
  Bell,
  Moon,
  Sun,
  Languages,
  Mic,
  CalendarClock,
  CalendarPlus,
  RotateCcw,
  Archive,
  X,
  Plus,
  History,
  ShieldCheck,
  Pencil,
  Settings,
  Square
} from 'lucide-react';
import { Task, ChatMessage, ChatConversation, ScheduledEvent, TrashedTask } from './types';
import { parseScheduledEvent, scheduledEventTimestamp } from './dateParser';
import CalendarPanel from './CalendarPanel';
import { CalendarViewMode, toDateKey } from './calendarUtils';
import { applyNewDayAction, NewDayAction } from './newDayUtils';

type Language = 'ar' | 'en';
type AppSection = 'dashboard' | 'trash';
type MobileView = 'chat' | 'tasks' | 'calendar' | 'more';
type VoiceState = 'idle' | 'listening' | 'recording' | 'processing' | 'error';

function safeMessageText(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function cleanAssistantMessage(content: unknown, language: Language) {
  const safeText = safeMessageText(content);
  if (!safeText) return '';

  const cleaned = safeText
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .replace(/\{[\s\S]*\}/g, '')
    .replace(/^\s*["']+|["']+\s*$/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (language === 'ar' && cleaned.startsWith('أهلاً بك!')) {
    return 'هلا! وش تبغى ترتب؟';
  }

  if (cleaned) {
    const firstSentence = cleaned.match(/^(.{1,180}?[.!؟])(?:\s|$)/)?.[1];
    return firstSentence || (cleaned.length > 180 ? `${cleaned.slice(0, 177).trim()}...` : cleaned);
  }
  return language === 'ar' ? 'تمام، وش تبغى ترتب؟' : 'Sure, what would you like to organize?';
}

function createChat(language: Language, isTemporary: boolean): ChatConversation {
  const now = new Date().toISOString();
  return {
    id: globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 11),
    title: language === 'ar' ? 'محادثة جديدة' : 'New Chat',
    messages: [{
      role: 'assistant',
      content: language === 'ar'
        ? 'هلا! قل لي وش عندك اليوم وبرتبه لك.'
        : "Hi! Tell me what you have today and I'll organize it.",
    }],
    createdAt: now,
    updatedAt: now,
    isTemporary,
  };
}

function generateChatTitle(message: string, language: Language) {
  const cleaned = message
    .trim()
    .replace(/^(?:عندي|لدي|أريد|اريد|i have|i need|please)\s+/i, '');
  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 4);
  const title = words.join(' ').slice(0, 42).trim();
  return title || (language === 'ar' ? 'محادثة جديدة' : 'New Chat');
}

function normalizeStoredChat(chat: Partial<ChatConversation>, language: Language): ChatConversation | null {
  if (!chat.id || !Array.isArray(chat.messages)) return null;
  const now = new Date().toISOString();
  return {
    id: chat.id,
    title: typeof chat.title === 'string' && chat.title.trim()
      ? chat.title
      : language === 'ar' ? 'محادثة جديدة' : 'New Chat',
    messages: chat.messages.filter(message =>
      message &&
      (message.role === 'user' || message.role === 'assistant') &&
      typeof message.content === 'string'
    ),
    createdAt: chat.createdAt || now,
    updatedAt: chat.updatedAt || chat.createdAt || now,
    isTemporary: false,
  };
}

function normalizeTaskTime(time?: unknown) {
  if (typeof time !== 'string' || !time.trim()) return null;
  const normalized = time.trim().toLowerCase();
  const match = normalized.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|ص|م)?/);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const marker = match[3];

  if ((marker === 'pm' || marker === 'م') && hour < 12) hour += 12;
  if ((marker === 'am' || marker === 'ص') && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function normalizeTaskDate(value: unknown, fallback: string) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? fallback : value;
}

function taskTimestamp(task: Task) {
  const time = normalizeTaskTime(task.time);
  if (!time) return null;
  return new Date(`${task.date}T${time}:00`).getTime();
}

interface SpeechRecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{
    0: { transcript: string };
    isFinal: boolean;
  }>;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

const translations = {
  ar: {
    welcome: 'هلا! قل لي وش عندك اليوم وبرتبه لك.',
    appName: 'منظم المهام',
    taskList: 'مهامك',
    remaining: (count: number) => `لديك ${count} مهام متبقية بانتظارك.`,
    activeTasks: 'المهام النشطة',
    completedTasks: 'المهام المنجزة',
    highPriority: 'مهم جداً',
    emptyTitle: 'يومك مازال صفحة بيضاء!',
    emptyDescription: 'أي شيء يدور في خاطرك؟ أخبرني في الشات وسأقوم بترتيبه لك.',
    assistantTitle: 'مساعدك للإنتاجية',
    online: 'نشط الآن',
    approve: 'اعتمد الخطة ✅',
    edit: 'عدّل',
    ignore: 'تجاهل هذا الاقتراح',
    editPrompt: 'أبشر، وش اللي حاب تعدله بالخطة؟',
    placeholder: 'تحدث معي كأنك تحدث صديقك...',
    inputHint: 'سأقوم بتنظيم مهامك واقتراح وقت لكل منها.',
    lightMode: 'الوضع الفاتح',
    darkMode: 'الوضع الداكن',
    changeLanguage: 'Switch to English',
    newDayMessage: 'بداية يوم جديد وموفق بإذن الله! كيف يمكنني مساعدتك اليوم؟',
    approved: 'تمام، أضفت المهام لك.',
    ignored: 'تم، تجاهلت الاقتراح.',
    error: 'صار خطأ بسيط، حاول مرة ثانية.',
    upcomingEvents: 'المواعيد القادمة',
    noUpcomingEvents: 'لا توجد مواعيد قادمة بعد.',
    noSpecificTime: 'بدون وقت محدد',
    completeEvent: 'إكمال الموعد',
    deleteEvent: 'حذف الموعد',
    listening: 'جاري الاستماع...',
    recording: 'جاري التسجيل... اضغط إيقاف لما تخلص',
    processingVoice: 'جاري معالجة الصوت...',
    cancelRecording: 'إلغاء التسجيل',
    safariVoiceHint: 'اضغط تسجيل، تكلم، ثم اضغط إيقاف.',
    startListening: 'ابدأ الإدخال الصوتي',
    stopListening: 'إيقاف الاستماع',
    speechUnsupported: 'المتصفح لا يدعم الإدخال الصوتي. جرّب Google Chrome.',
    speechDenied: 'تم رفض إذن الميكروفون. فضلاً فعّل الميكروفون من إعدادات المتصفح.',
    speechNoSpeech: 'لم أسمع أي كلام. حاول مرة أخرى وتحدث بالقرب من الميكروفون.',
    speechUnclear: 'لم أتمكن من فهم الكلام بوضوح. حاول مرة أخرى.',
    transcriptionFailed: 'ما قدرت أسمعك بوضوح، تقدر تكتب المهمة.',
    eventSaved: 'تم حفظ الموعد ضمن المواعيد القادمة.',
    reminder: 'التذكير',
    noReminder: 'بدون تذكير',
    atEventTime: 'وقت الموعد',
    minutesBefore: (minutes: number) => `قبل ${minutes} دقائق`,
    oneHourBefore: 'قبل ساعة',
    oneDayBefore: 'قبل يوم',
    reminderNeedsTime: 'يرجى إضافة وقت للموعد لتفعيل التذكيرات.',
    notificationsDenied: 'تم رفض إذن الإشعارات. ستظهر التذكيرات داخل التطبيق فقط.',
    notificationsUnsupported: 'متصفحك لا يدعم إشعارات النظام. ستظهر التذكيرات داخل التطبيق فقط.',
    reminderTitle: 'تذكير بموعد',
    reminderDue: (title: string) => `حان موعد: ${title}`,
    dismiss: 'إغلاق',
    todaySummary: (tasks: number, events: number) => `اليوم عندك ${tasks} مهام و${events} مواعيد.`,
    selectedDayTasks: 'مهام اليوم المحدد',
    selectedDayEvents: 'مواعيد اليوم المحدد',
    trash: 'سلة المحذوفات',
    trashEmpty: 'سلة المحذوفات فارغة.',
    restore: 'استعادة',
    permanentDelete: 'حذف نهائي',
    permanentDeleteConfirm: 'هل تريد حذف هذه المهمة نهائياً؟ لا يمكن التراجع عن ذلك.',
    taskMovedToTrash: 'تم نقل المهمة إلى سلة المحذوفات.',
    undo: 'تراجع',
    newDay: 'يوم جديد',
    newDayConfirmTitle: 'بدء يوم جديد',
    newDayConfirm: 'اختر المهام غير المكتملة التي تريد التعامل معها. سيتم أرشفة المهام المكتملة لهذا اليوم.',
    moveToTomorrow: 'نقل المهام المحددة إلى الغد',
    keepOnToday: 'إبقاء المهام المحددة في هذا اليوم',
    archiveCompletedOnly: 'أرشفة المهام المكتملة فقط',
    selectAll: 'تحديد الكل',
    noIncompleteTasks: 'لا توجد مهام غير مكتملة في هذا اليوم.',
    cancel: 'إلغاء',
    archivedMessage: 'تم أرشفة المهام المكتملة وبدء يوم جديد.',
    newDayResult: (archived: number, moved: number) => `تم أرشفة ${archived} ونقل ${moved} من المهام إلى الغد.`,
    archivedTasks: 'المهام المؤرشفة',
    noTasksForDay: 'لا توجد مهام لهذا اليوم.',
    taskReminderNeedsTime: 'فضلاً أضف وقتًا للمهمة لتفعيل التذكير.',
    addTime: 'إضافة وقت',
    editTaskTime: 'تحديد تاريخ ووقت المهمة',
    taskDate: 'التاريخ',
    taskTime: 'الوقت',
    save: 'حفظ',
    timeNote: 'ملاحظة الوقت',
    newChat: 'محادثة جديدة',
    chatHistory: 'سجل المحادثات',
    temporaryChat: 'محادثة مؤقتة',
    temporaryChatNotice: 'هذه المحادثة مؤقتة ولن يتم حفظها',
    deleteChat: 'حذف المحادثة',
    deleteChatConfirm: 'هل أنت متأكد من حذف هذه المحادثة؟',
    noChatHistory: 'لا توجد محادثات محفوظة بعد.',
    addTask: 'إضافة مهمة',
    editTask: 'تعديل المهمة',
    taskTitle: 'عنوان المهمة',
    category: 'التصنيف',
    priority: 'الأولوية',
    notes: 'ملاحظات',
    optional: 'اختياري',
    low: 'منخفضة',
    medium: 'متوسطة',
    high: 'عالية',
    manualReminderNeedsTime: 'يجب إضافة وقت صالح عند اختيار تذكير.',
    offlineNotice: 'أنت غير متصل، سيتم حفظ المهام على جهازك.',
    chatFallback: 'حدث خطأ في المحادثة، لكن يمكنك إضافة المهمة يدويًا.',
    voiceFallback: 'ما اشتغل المايك، تقدر تكتب المهمة.',
    addFromText: 'إضافة من النص',
    taskSaved: 'تم حفظ المهمة على جهازك.',
    mobileChat: 'المحادثة',
    mobileTasks: 'المهام',
    mobileCalendar: 'التقويم',
    mobileAdd: 'إضافة',
    mobileMore: 'الإعدادات',
    categories: {
      work: 'عمل',
      personal: 'شخصي',
      health: 'صحة',
      social: 'اجتماعي',
      other: 'أخرى',
    },
  },
  en: {
    welcome: "Hi! Tell me what you have today and I'll organize it.",
    appName: 'Yomak AI',
    taskList: 'Your Tasks',
    remaining: (count: number) => `You have ${count} task${count === 1 ? '' : 's'} remaining.`,
    activeTasks: 'Active tasks',
    completedTasks: 'Completed tasks',
    highPriority: 'High priority',
    emptyTitle: 'Your day is a blank page!',
    emptyDescription: "What's on your mind? Tell me in the chat and I'll organize it for you.",
    assistantTitle: 'Productivity Assistant',
    online: 'Online now',
    approve: 'Approve plan ✓',
    edit: 'Edit',
    ignore: 'Ignore this suggestion',
    editPrompt: 'Sure, what would you like to change in the plan?',
    placeholder: "Talk to me like you'd talk to a friend...",
    inputHint: 'I will organize your tasks and suggest a time for each one.',
    lightMode: 'Light mode',
    darkMode: 'Dark mode',
    changeLanguage: 'التبديل إلى العربية',
    newDayMessage: 'A fresh day is ready! How can I help you today?',
    approved: 'Done, I added the tasks.',
    ignored: 'Done, I ignored the suggestion.',
    error: 'Something went wrong. Please try again.',
    upcomingEvents: 'Upcoming Events',
    noUpcomingEvents: 'No upcoming events yet.',
    noSpecificTime: 'No specific time',
    completeEvent: 'Complete event',
    deleteEvent: 'Delete event',
    listening: 'Listening...',
    recording: "Recording... tap stop when you're done",
    processingVoice: 'Processing voice...',
    cancelRecording: 'Cancel recording',
    safariVoiceHint: 'Tap record, speak, then stop.',
    startListening: 'Start voice input',
    stopListening: 'Stop listening',
    speechUnsupported: 'This browser does not support voice input. Please try Google Chrome.',
    speechDenied: 'Microphone permission was denied. Please allow microphone access from browser settings.',
    speechNoSpeech: 'I did not hear anything. Please try again and speak closer to the microphone.',
    speechUnclear: 'I could not understand the speech clearly. Please try again.',
    transcriptionFailed: "I couldn't hear clearly. You can type the task.",
    eventSaved: 'The event was saved under upcoming events.',
    reminder: 'Reminder',
    noReminder: 'No reminder',
    atEventTime: 'At event time',
    minutesBefore: (minutes: number) => `${minutes} minutes before`,
    oneHourBefore: '1 hour before',
    oneDayBefore: '1 day before',
    reminderNeedsTime: 'Please add a time to enable reminders.',
    notificationsDenied: 'Notification permission was denied. Reminders will appear inside the app only.',
    notificationsUnsupported: 'Your browser does not support system notifications. Reminders will appear inside the app only.',
    reminderTitle: 'Event reminder',
    reminderDue: (title: string) => `Reminder: ${title}`,
    dismiss: 'Dismiss',
    todaySummary: (tasks: number, events: number) => `Today you have ${tasks} task${tasks === 1 ? '' : 's'} and ${events} event${events === 1 ? '' : 's'}.`,
    selectedDayTasks: 'Tasks for selected day',
    selectedDayEvents: 'Events for selected day',
    trash: 'Trash',
    trashEmpty: 'Trash is empty.',
    restore: 'Restore',
    permanentDelete: 'Delete permanently',
    permanentDeleteConfirm: 'Permanently delete this task? This cannot be undone.',
    taskMovedToTrash: 'Task moved to trash.',
    undo: 'Undo',
    newDay: 'Start New Day',
    newDayConfirmTitle: 'Start a new day',
    newDayConfirm: 'Select the unfinished tasks you want to manage. Completed tasks for this day will be archived.',
    moveToTomorrow: 'Move selected tasks to tomorrow',
    keepOnToday: 'Keep selected tasks on this day',
    archiveCompletedOnly: 'Archive completed tasks only',
    selectAll: 'Select all',
    noIncompleteTasks: 'There are no unfinished tasks for this day.',
    cancel: 'Cancel',
    archivedMessage: 'Completed tasks were archived and a new day was started.',
    newDayResult: (archived: number, moved: number) => `Archived ${archived} task${archived === 1 ? '' : 's'} and moved ${moved} to tomorrow.`,
    archivedTasks: 'Archived tasks',
    noTasksForDay: 'No tasks for this day.',
    taskReminderNeedsTime: 'Please add a time to enable reminders.',
    addTime: 'Add time',
    editTaskTime: 'Set task date and time',
    taskDate: 'Date',
    taskTime: 'Time',
    save: 'Save',
    timeNote: 'Time note',
    newChat: 'New Chat',
    chatHistory: 'Chat history',
    temporaryChat: 'Temporary Chat',
    temporaryChatNotice: 'This chat is temporary and will not be saved',
    deleteChat: 'Delete chat',
    deleteChatConfirm: 'Are you sure you want to delete this chat?',
    noChatHistory: 'No saved chats yet.',
    addTask: 'Add Task',
    editTask: 'Edit Task',
    taskTitle: 'Task title',
    category: 'Category',
    priority: 'Priority',
    notes: 'Notes',
    optional: 'Optional',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    manualReminderNeedsTime: 'A valid time is required when a reminder is selected.',
    offlineNotice: 'You are offline. Tasks will be saved on this device.',
    chatFallback: 'Chat processing failed, but you can add the task manually.',
    voiceFallback: 'Mic did not work. You can type the task.',
    addFromText: 'Add from text',
    taskSaved: 'Task saved on this device.',
    mobileChat: 'Chat',
    mobileTasks: 'Tasks',
    mobileCalendar: 'Calendar',
    mobileAdd: 'Add',
    mobileMore: 'Settings',
    categories: {
      work: 'Work',
      personal: 'Personal',
      health: 'Health',
      social: 'Social',
      other: 'Other',
    },
  },
};

export default function App() {
  const todayKey = toDateKey(new Date());
  const [language, setLanguage] = useState<Language>(() => {
    return localStorage.getItem('language') === 'en' ? 'en' : 'ar';
  });
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem('tasks');
    const storedTasks = saved ? JSON.parse(saved) as Array<Partial<Task>> : [];
    return storedTasks.map(task => ({
      ...task,
      date: task.date || todayKey,
      time: normalizeTaskTime(task.time) || undefined,
      timeNote: normalizeTaskTime(task.time) ? task.timeNote : task.timeNote || task.time,
      reminderMinutes: task.reminderMinutes ?? null,
      reminderNotifiedAt: task.reminderNotifiedAt ?? null,
    })) as Task[];
  });
  const [trashedTasks, setTrashedTasks] = useState<TrashedTask[]>(() => {
    const saved = localStorage.getItem('trashed_tasks');
    const storedTasks = saved ? JSON.parse(saved) as Array<Partial<TrashedTask>> : [];
    return storedTasks.map(task => ({
      ...task,
      date: task.date || todayKey,
      time: normalizeTaskTime(task.time) || undefined,
      timeNote: normalizeTaskTime(task.time) ? task.timeNote : task.timeNote || task.time,
      reminderMinutes: task.reminderMinutes ?? null,
      reminderNotifiedAt: task.reminderNotifiedAt ?? null,
    })) as TrashedTask[];
  });
  const [archivedTasks, setArchivedTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem('archived_tasks');
    const storedTasks = saved ? JSON.parse(saved) as Array<Partial<Task>> : [];
    return storedTasks.map(task => ({
      ...task,
      date: task.date || todayKey,
      time: normalizeTaskTime(task.time) || undefined,
      timeNote: normalizeTaskTime(task.time) ? task.timeNote : task.timeNote || task.time,
      reminderMinutes: task.reminderMinutes ?? null,
      reminderNotifiedAt: task.reminderNotifiedAt ?? null,
    })) as Task[];
  });
  const [scheduledEvents, setScheduledEvents] = useState<ScheduledEvent[]>(() => {
    const saved = localStorage.getItem('scheduled_events');
    const events = saved ? JSON.parse(saved) as Array<Partial<ScheduledEvent>> : [];
    return events.map(event => ({
      ...event,
      reminderMinutes: event.reminderMinutes ?? null,
      reminderNotifiedAt: event.reminderNotifiedAt ?? null,
    })) as ScheduledEvent[];
  });
  const [chats, setChats] = useState<ChatConversation[]>(() => {
    const savedChats = localStorage.getItem('chats');
    if (savedChats) {
      try {
        const parsed = JSON.parse(savedChats) as Array<Partial<ChatConversation>>;
        const normalChats = parsed
          .map(chat => normalizeStoredChat(chat, language))
          .filter((chat): chat is ChatConversation => Boolean(chat));
        if (normalChats.length > 0) return normalChats;
      } catch (error) {
        console.error('Failed to restore saved chats:', error);
      }
    }

    const legacyMessages = localStorage.getItem('chat_messages');
    if (legacyMessages) {
      const messages = JSON.parse(legacyMessages) as ChatMessage[];
      const migrated = createChat(language, false);
      const firstUserMessage = messages.find(message => message.role === 'user')?.content;
      return [{
        ...migrated,
        title: firstUserMessage ? generateChatTitle(firstUserMessage, language) : migrated.title,
        messages,
      }];
    }

    return [createChat(language, false)];
  });
  const [activeChatId, setActiveChatId] = useState(() => {
    const savedId = localStorage.getItem('active_chat_id');
    return savedId && chats.some(chat => chat.id === savedId) ? savedId : chats[0].id;
  });
  const [temporaryChat, setTemporaryChat] = useState<ChatConversation | null>(null);
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [speechError, setSpeechError] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [reminderToast, setReminderToast] = useState('');
  const [undoTask, setUndoTask] = useState<TrashedTask | null>(null);
  const [newDayToast, setNewDayToast] = useState('');
  const [showNewDayModal, setShowNewDayModal] = useState(false);
  const [selectedNewDayTaskIds, setSelectedNewDayTaskIds] = useState<string[]>([]);
  const [editingTaskTimeId, setEditingTaskTimeId] = useState<string | null>(null);
  const [taskTimeDate, setTaskTimeDate] = useState(todayKey);
  const [taskTimeValue, setTaskTimeValue] = useState('');
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingManualTaskId, setEditingManualTaskId] = useState<string | null>(null);
  const [manualTitle, setManualTitle] = useState('');
  const [manualDate, setManualDate] = useState(todayKey);
  const [manualTime, setManualTime] = useState('');
  const [manualCategory, setManualCategory] = useState<Task['category']>('other');
  const [manualPriority, setManualPriority] = useState<Task['priority']>('medium');
  const [manualReminder, setManualReminder] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [manualFormError, setManualFormError] = useState('');
  const [chatFallbackText, setChatFallbackText] = useState('');
  const [taskSavedToast, setTaskSavedToast] = useState('');
  const [activeSection, setActiveSection] = useState<AppSection>('dashboard');
  const [mobileView, setMobileView] = useState<MobileView>('chat');
  const [calendarView, setCalendarView] = useState<CalendarViewMode>('week');
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingCancelledRef = useRef(false);
  const speechTimeoutRef = useRef<number | null>(null);
  const speechHandledRef = useRef(false);
  const speechManualStopRef = useRef(false);
  const speechTranscriptRef = useRef('');
  const t = translations[language];
  const isSafariOrIOS = /iP(?:hone|ad|od)|Safari/i.test(navigator.userAgent)
    && !/Chrome|Chromium|Edg/i.test(navigator.userAgent);
  const activeChat = temporaryChat || chats.find(chat => chat.id === activeChatId) || chats[0];
  const messages = activeChat?.messages || [];

  const updateChatMessages = (
    chatId: string,
    isTemporary: boolean,
    updater: (messages: ChatMessage[]) => ChatMessage[],
    titleSource?: string,
  ) => {
    const updatedAt = new Date().toISOString();
    const updateChat = (chat: ChatConversation) => {
      const currentMessages = Array.isArray(chat.messages) ? chat.messages : [];
      const hasUserMessage = currentMessages.some(message => message.role === 'user');
      return {
        ...chat,
        title: titleSource && !hasUserMessage
          ? generateChatTitle(titleSource, language)
          : chat.title,
        messages: updater(currentMessages),
        updatedAt,
      };
    };

    if (isTemporary) {
      setTemporaryChat(current => current?.id === chatId ? updateChat(current) : current);
      return;
    }

    setChats(current => current.map(chat => chat.id === chatId ? updateChat(chat) : chat));
  };

  const updateCurrentChat = (
    updater: (messages: ChatMessage[]) => ChatMessage[],
    titleSource?: string,
  ) => {
    if (!activeChat) {
      const replacement = createChat(language, false);
      const updatedMessages = updater(replacement.messages);
      const chat = {
        ...replacement,
        title: titleSource ? generateChatTitle(titleSource, language) : replacement.title,
        messages: updatedMessages,
      };
      setChats(current => [chat, ...current]);
      setActiveChatId(chat.id);
      return;
    }
    updateChatMessages(activeChat.id, Boolean(temporaryChat), updater, titleSource);
  };

  const setMessages = (updater: (messages: ChatMessage[]) => ChatMessage[]) => {
    updateCurrentChat(updater);
  };

  const resetManualTaskForm = () => {
    setEditingManualTaskId(null);
    setManualTitle('');
    setManualDate(selectedDate);
    setManualTime('');
    setManualCategory('other');
    setManualPriority('medium');
    setManualReminder('');
    setManualNotes('');
    setManualFormError('');
  };

  const openManualTaskForm = (title = '', task?: Task) => {
    if (task) {
      setEditingManualTaskId(task.id);
      setManualTitle(task.title);
      setManualDate(task.date);
      setManualTime(normalizeTaskTime(task.time) || '');
      setManualCategory(task.category);
      setManualPriority(task.priority);
      setManualReminder(task.reminderMinutes === null ? '' : String(task.reminderMinutes));
      setManualNotes(task.notes || task.timeNote || '');
    } else {
      resetManualTaskForm();
      setManualTitle(title);
      setManualDate(selectedDate);
    }
    setManualFormError('');
    setShowTaskForm(true);
  };

  const closeManualTaskForm = () => {
    setShowTaskForm(false);
    resetManualTaskForm();
  };

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      setNotificationMessage(t.notificationsUnsupported);
      return;
    }
    if (Notification.permission === 'granted') return;
    const permission = await Notification.requestPermission();
    if (permission === 'denied') setNotificationMessage(t.notificationsDenied);
  };

  const saveManualTask = async () => {
    const title = manualTitle.trim();
    const reminderMinutes = manualReminder === '' ? null : Number(manualReminder);
    if (!title || !manualDate) return;
    if (reminderMinutes !== null && !manualTime) {
      setManualFormError(t.manualReminderNeedsTime);
      return;
    }

    const now = new Date().toISOString();
    const task: Task = {
      id: editingManualTaskId || globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 11),
      title,
      category: manualCategory,
      priority: manualPriority,
      time: manualTime || undefined,
      notes: manualNotes.trim() || undefined,
      date: manualDate,
      reminderMinutes,
      reminderNotifiedAt: null,
      completed: editingManualTaskId
        ? tasks.find(item => item.id === editingManualTaskId)?.completed || false
        : false,
      createdAt: editingManualTaskId
        ? tasks.find(item => item.id === editingManualTaskId)?.createdAt || now
        : now,
    };

    setTasks(current => editingManualTaskId
      ? current.map(item => item.id === editingManualTaskId ? task : item)
      : [task, ...current]
    );
    setSelectedDate(manualDate);
    setActiveSection('dashboard');
    setTaskSavedToast(t.taskSaved);
    setChatFallbackText('');
    closeManualTaskForm();

    if (reminderMinutes !== null) {
      await requestNotificationPermission();
    }
  };

  const addTaskFromText = (text: string) => {
    const title = text.trim();
    if (!title) return;
    const task: Task = {
      id: globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 11),
      title,
      category: 'other',
      priority: 'medium',
      date: selectedDate,
      reminderMinutes: null,
      reminderNotifiedAt: null,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    setTasks(current => [task, ...current]);
    setTaskSavedToast(t.taskSaved);
    setChatFallbackText('');
  };

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem('language', language);
  }, [language]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    const updateAppHeight = () => {
      const height = viewport?.height || window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${height}px`);
    };

    updateAppHeight();
    viewport?.addEventListener('resize', updateAppHeight);
    viewport?.addEventListener('scroll', updateAppHeight);
    window.addEventListener('resize', updateAppHeight);

    return () => {
      viewport?.removeEventListener('resize', updateAppHeight);
      viewport?.removeEventListener('scroll', updateAppHeight);
      window.removeEventListener('resize', updateAppHeight);
      document.documentElement.style.removeProperty('--app-height');
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('tasks', JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem('trashed_tasks', JSON.stringify(trashedTasks));
  }, [trashedTasks]);

  useEffect(() => {
    localStorage.setItem('archived_tasks', JSON.stringify(archivedTasks));
  }, [archivedTasks]);

  useEffect(() => {
    localStorage.setItem('scheduled_events', JSON.stringify(scheduledEvents));
  }, [scheduledEvents]);

  useEffect(() => {
    localStorage.setItem('chats', JSON.stringify(chats));
    localStorage.removeItem('chat_messages');
  }, [chats]);

  useEffect(() => {
    if (!temporaryChat) {
      localStorage.setItem('active_chat_id', activeChatId);
    }
  }, [activeChatId, temporaryChat]);

  useEffect(() => {
    const checkReminders = () => {
      const now = Date.now();
      const dueEvents = scheduledEvents.filter(event => {
        if (
          event.status !== 'upcoming' ||
          !event.time ||
          event.reminderMinutes === null ||
          event.reminderNotifiedAt
        ) {
          return false;
        }

        const eventTime = scheduledEventTimestamp(event);
        const reminderTime = eventTime - event.reminderMinutes * 60 * 1000;
        return now >= reminderTime && now <= eventTime + 60 * 1000;
      });
      const dueTasks = tasks.filter(task => {
        const eventTime = taskTimestamp(task);
        if (
          task.completed ||
          eventTime === null ||
          task.reminderMinutes === null ||
          task.reminderNotifiedAt
        ) {
          return false;
        }

        const reminderTime = eventTime - task.reminderMinutes * 60 * 1000;
        return now >= reminderTime && now <= eventTime + 60 * 1000;
      });

      if (dueEvents.length === 0 && dueTasks.length === 0) return;

      const notifiedEventIds = new Set(dueEvents.map(event => event.id));
      const notifiedTaskIds = new Set(dueTasks.map(task => task.id));
      const notifiedAt = new Date().toISOString();

      [...dueEvents, ...dueTasks].forEach(item => {
        const message = t.reminderDue(item.title);
        setReminderToast(message);

        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(t.reminderTitle, {
            body: message,
            tag: `scheduled-item-${item.id}`,
          });
        }
      });

      setScheduledEvents(current => current.map(event =>
        notifiedEventIds.has(event.id)
          ? { ...event, reminderNotifiedAt: notifiedAt }
          : event
      ));
      setTasks(current => current.map(task =>
        notifiedTaskIds.has(task.id)
          ? { ...task, reminderNotifiedAt: notifiedAt }
          : task
      ));
    };

    checkReminders();
    const intervalId = window.setInterval(checkReminders, 15_000);
    return () => window.clearInterval(intervalId);
  }, [scheduledEvents, tasks, t]);

  useEffect(() => {
    if (!reminderToast) return;
    const timeoutId = window.setTimeout(() => setReminderToast(''), 6_000);
    return () => window.clearTimeout(timeoutId);
  }, [reminderToast]);

  useEffect(() => {
    if (!undoTask) return;
    const timeoutId = window.setTimeout(() => setUndoTask(null), 6_000);
    return () => window.clearTimeout(timeoutId);
  }, [undoTask]);

  useEffect(() => {
    if (!newDayToast) return;
    const timeoutId = window.setTimeout(() => setNewDayToast(''), 6_000);
    return () => window.clearTimeout(timeoutId);
  }, [newDayToast]);

  useEffect(() => {
    if (!taskSavedToast) return;
    const timeoutId = window.setTimeout(() => setTaskSavedToast(''), 5_000);
    return () => window.clearTimeout(timeoutId);
  }, [taskSavedToast]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
  }, [inputValue]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      if (speechTimeoutRef.current !== null) {
        window.clearTimeout(speechTimeoutRef.current);
      }
      recognitionRef.current?.stop();
      if (mediaRecorderRef.current?.state === 'recording') {
        recordingCancelledRef.current = true;
        mediaRecorderRef.current.stop();
      }
      mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage = inputValue;
    let targetChat = activeChat;
    let targetIsTemporary = Boolean(temporaryChat);

    if (!targetChat) {
      targetChat = createChat(language, false);
      targetIsTemporary = false;
      setChats(current => [targetChat as ChatConversation, ...current]);
      setActiveChatId(targetChat.id);
    }

    const targetChatId = targetChat.id;
    const detectedEvent = parseScheduledEvent(userMessage);
    if (detectedEvent) {
      setScheduledEvents(prev => [...prev, detectedEvent]);
    }
    setInputValue('');
    setSpeechError('');
    setVoiceState('idle');
    setChatFallbackText('');
    updateChatMessages(
      targetChatId,
      targetIsTemporary,
      prev => [...prev, { role: 'user', content: userMessage }],
      userMessage,
    );
    setIsLoading(true);

    try {
      const res = await fetch('/api/parse-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, language, selectedDate }),
      });

      const responseText = await res.text();
      let data: { reply?: string; tasks?: unknown; error?: string };

      try {
        data = JSON.parse(responseText);
      } catch (error) {
        console.error('Chat API returned invalid JSON:', error, responseText);
        throw new Error('Invalid chat API response');
      }

      if (!res.ok) {
        console.error('Chat API request failed:', res.status, data.error || responseText);
        throw new Error(data.error || `Chat API failed with status ${res.status}`);
      }

      try {
        if (Array.isArray(data.tasks) && data.tasks.length > 0) {
          setPendingTasks(data.tasks.map((rawTask) => {
            const task = rawTask as Partial<Task>;
            if (typeof task.title !== 'string') {
              throw new Error('Task payload is missing a title');
            }

            const normalizedTime = normalizeTaskTime(task.time);
            return {
              id: task.id || globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 11),
              title: task.title,
              category: task.category || 'other',
              priority: task.priority || 'medium',
              time: normalizedTime || undefined,
              timeNote: normalizedTime ? task.timeNote : task.timeNote || (typeof task.time === 'string' ? task.time : undefined),
              date: normalizeTaskDate(task.date, detectedEvent?.date || selectedDate),
              reminderMinutes: task.reminderMinutes ?? null,
              reminderNotifiedAt: task.reminderNotifiedAt ?? null,
              completed: false,
              createdAt: task.createdAt || new Date().toISOString(),
            } satisfies Task;
          }));
        } else {
          setPendingTasks([]);
        }
      } catch (taskError) {
        console.error('Failed to parse extracted tasks; chat reply will still be shown:', taskError, data.tasks);
        setPendingTasks([]);
      }

      updateChatMessages(targetChatId, targetIsTemporary, prev => [...prev, {
        role: 'assistant', 
        content: typeof data.reply === 'string' && data.reply.trim()
          ? cleanAssistantMessage(data.reply, language)
          : language === 'ar' ? 'تمام، استلمتها.' : 'Got it.',
        tasks: Array.isArray(data.tasks) ? data.tasks as Task[] : undefined,
      }]);
    } catch (error) {
      console.error('Failed to process chat message:', error);
      setChatFallbackText(userMessage);
      updateChatMessages(targetChatId, targetIsTemporary, prev => [...prev, {
        role: 'assistant', 
        content: t.chatFallback
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const approvePlan = () => {
    if (pendingTasks.length > 0) {
      setTasks(prev => [...pendingTasks, ...prev]);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: t.approved
      }]);
      setPendingTasks([]);
    }
  };

  const ignorePlan = () => {
    setPendingTasks([]);
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: t.ignored
    }]);
  };

  const startNewChat = (isTemporary: boolean) => {
    setInputValue('');
    setPendingTasks([]);
    setSpeechError('');
    setVoiceState('idle');
    setShowChatHistory(false);

    const chat = createChat(language, isTemporary);
    if (isTemporary) {
      setTemporaryChat(chat);
      return;
    }

    setTemporaryChat(null);
    setChats(prev => [chat, ...prev]);
    setActiveChatId(chat.id);
  };

  const openSavedChat = (chatId: string) => {
    setTemporaryChat(null);
    setActiveChatId(chatId);
    setPendingTasks([]);
    setInputValue('');
    setSpeechError('');
    setShowChatHistory(false);
  };

  const deleteChat = (chatId: string) => {
    if (!window.confirm(t.deleteChatConfirm)) return;

    setChats(current => {
      const remaining = current.filter(chat => chat.id !== chatId);
      if (remaining.length > 0) {
        if (activeChatId === chatId && !temporaryChat) {
          setActiveChatId(remaining[0].id);
        }
        return remaining;
      }

      const replacement = createChat(language, false);
      setActiveChatId(replacement.id);
      return [replacement];
    });
    setPendingTasks([]);
  };

  const openNewDayModal = () => {
    const incompleteIds = tasks
      .filter(task => task.date === selectedDate && !task.completed)
      .map(task => task.id);
    setSelectedNewDayTaskIds(incompleteIds);
    setShowNewDayModal(true);
  };

  const finishSelectedDay = (action: NewDayAction) => {
    const sourceDate = selectedDate;
    const result = applyNewDayAction(tasks, sourceDate, selectedNewDayTaskIds, action);

    setArchivedTasks(prev => [
      ...result.archivedTasks,
      ...prev,
    ]);
    setTasks(result.activeTasks);
    const resultMessage = t.newDayResult(result.archivedTasks.length, result.movedCount);
    setMessages(prev => [...prev, { role: 'assistant', content: resultMessage }]);
    setNewDayToast(resultMessage);
    setPendingTasks([]);
    setSelectedNewDayTaskIds([]);
    setShowNewDayModal(false);
  };

  const toggleTheme = () => {
    setIsDarkMode(prev => !prev);
  };

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'ar' ? 'en' : 'ar');
  };

  const toggleTask = (id: string) => {
    setTasks(prev => prev.map(task => 
      task.id === id ? { ...task, completed: !task.completed } : task
    ));
  };

  const deleteTask = (id: string) => {
    const task = tasks.find(item => item.id === id);
    if (!task) return;
    const trashedTask: TrashedTask = { ...task, trashedAt: new Date().toISOString() };
    setTasks(prev => prev.filter(item => item.id !== id));
    setTrashedTasks(prev => [trashedTask, ...prev]);
    setUndoTask(trashedTask);
  };

  const restoreTask = (id: string) => {
    const task = trashedTasks.find(item => item.id === id);
    if (!task) return;
    const { trashedAt: _trashedAt, ...restoredTask } = task;
    setTasks(prev => [restoredTask, ...prev]);
    setTrashedTasks(prev => prev.filter(item => item.id !== id));
    if (undoTask?.id === id) setUndoTask(null);
  };

  const permanentlyDeleteTask = (id: string) => {
    if (!window.confirm(t.permanentDeleteConfirm)) return;
    setTrashedTasks(prev => prev.filter(item => item.id !== id));
    if (undoTask?.id === id) setUndoTask(null);
  };

  const completeEvent = (id: string) => {
    setScheduledEvents(prev => prev.map(event =>
      event.id === id ? { ...event, status: 'completed' } : event
    ));
  };

  const deleteEvent = (id: string) => {
    setScheduledEvents(prev => prev.filter(event => event.id !== id));
  };

  const updateEventReminder = async (event: ScheduledEvent, value: string) => {
    const reminderMinutes = value === '' ? null : Number(value);

    if (reminderMinutes !== null && !event.time) {
      setNotificationMessage(t.reminderNeedsTime);
      return;
    }

    setScheduledEvents(prev => prev.map(item =>
      item.id === event.id
        ? { ...item, reminderMinutes, reminderNotifiedAt: null }
        : item
    ));

    if (reminderMinutes === null) {
      setNotificationMessage('');
      return;
    }

    if (!('Notification' in window)) {
      setNotificationMessage(t.notificationsUnsupported);
      return;
    }

    if (Notification.permission === 'granted') {
      setNotificationMessage('');
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationMessage(permission === 'denied' ? t.notificationsDenied : '');
  };

  const updateTaskReminder = async (task: Task, value: string) => {
    const reminderMinutes = value === '' ? null : Number(value);

    if (reminderMinutes !== null && taskTimestamp(task) === null) {
      setNotificationMessage(t.taskReminderNeedsTime);
      return;
    }

    setTasks(prev => prev.map(item =>
      item.id === task.id
        ? { ...item, reminderMinutes, reminderNotifiedAt: null }
        : item
    ));

    if (reminderMinutes === null) {
      setNotificationMessage('');
      return;
    }

    if (!('Notification' in window)) {
      setNotificationMessage(t.notificationsUnsupported);
      return;
    }

    if (Notification.permission === 'granted') {
      setNotificationMessage('');
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationMessage(permission === 'denied' ? t.notificationsDenied : '');
  };

  const openTaskTimeEditor = (task: Task) => {
    setEditingTaskTimeId(task.id);
    setTaskTimeDate(task.date);
    setTaskTimeValue(normalizeTaskTime(task.time) || '');
  };

  const closeTaskTimeEditor = () => {
    setEditingTaskTimeId(null);
    setTaskTimeValue('');
  };

  const saveTaskTime = () => {
    if (!editingTaskTimeId || !taskTimeDate || !taskTimeValue) return;
    setTasks(prev => prev.map(task =>
      task.id === editingTaskTimeId
        ? {
            ...task,
            date: taskTimeDate,
            time: taskTimeValue,
            reminderNotifiedAt: null,
          }
        : task
    ));
    setSelectedDate(taskTimeDate);
    closeTaskTimeEditor();
    setNotificationMessage('');
  };

  const clearSpeechTimeout = () => {
    if (speechTimeoutRef.current !== null) {
      window.clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = null;
    }
  };

  const stopMediaStream = () => {
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    mediaStreamRef.current = null;
  };

  const transcribeRecordedAudio = async (audio: Blob) => {
    if (!audio.size) {
      setSpeechError(t.transcriptionFailed);
      setVoiceState('error');
      return;
    }

    setVoiceState('processing');
    setSpeechError('');

    try {
      const response = await fetch('/api/transcribe-audio', {
        method: 'POST',
        headers: {
          'Content-Type': audio.type || 'application/octet-stream',
          'X-Transcription-Language': language,
        },
        body: audio,
      });
      const data = await response.json() as { text?: unknown; error?: unknown };
      const transcript = safeMessageText(data.text).trim();

      if (!response.ok || !transcript) {
        throw new Error(safeMessageText(data.error) || 'Audio transcription failed');
      }

      setInputValue(current => current.trim() ? `${current.trim()} ${transcript}` : transcript);
      setVoiceState('idle');
    } catch (error) {
      console.error('Audio transcription failed:', error);
      setSpeechError(t.transcriptionFailed);
      setVoiceState('error');
    }
  };

  const startMediaRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setSpeechError(t.voiceFallback);
      setVoiceState('error');
      return;
    }

    setVoiceState('processing');
    setSpeechError('');
    recordingCancelledRef.current = false;
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const supportedType = [
        'audio/mp4',
        'audio/webm;codecs=opus',
        'audio/webm',
      ].find(type => typeof MediaRecorder.isTypeSupported === 'function'
        && MediaRecorder.isTypeSupported(type));
      const recorder = supportedType
        ? new MediaRecorder(stream, { mimeType: supportedType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = event => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        stopMediaStream();
        mediaRecorderRef.current = null;
        setSpeechError(t.voiceFallback);
        setVoiceState('error');
      };
      recorder.onstart = () => {
        setVoiceState('recording');
        setSpeechError('');
      };
      recorder.onstop = () => {
        const wasCancelled = recordingCancelledRef.current;
        const chunks = audioChunksRef.current;
        const mimeType = recorder.mimeType || supportedType || 'application/octet-stream';
        audioChunksRef.current = [];
        mediaRecorderRef.current = null;
        stopMediaStream();

        if (wasCancelled) {
          setVoiceState('idle');
          return;
        }

        void transcribeRecordedAudio(new Blob(chunks, { type: mimeType }));
      };
      recorder.start(250);
    } catch (error) {
      console.error('Microphone recording failed:', error);
      stopMediaStream();
      setSpeechError(t.voiceFallback);
      setVoiceState('error');
    }
  };

  const stopVoiceInput = () => {
    if (voiceState === 'recording' && mediaRecorderRef.current?.state === 'recording') {
      recordingCancelledRef.current = false;
      mediaRecorderRef.current.stop();
      setVoiceState('processing');
      return;
    }

    if (isListening) {
      speechManualStopRef.current = true;
      clearSpeechTimeout();
      recognitionRef.current?.stop();
      setIsListening(false);
      setVoiceState('processing');
    }
  };

  const cancelListening = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      recordingCancelledRef.current = true;
      mediaRecorderRef.current.stop();
    }
    speechManualStopRef.current = true;
    speechHandledRef.current = true;
    speechTranscriptRef.current = '';
    clearSpeechTimeout();
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
    setVoiceState('idle');
    setSpeechError('');
  };

  const toggleListening = async () => {
    if (isListening || voiceState === 'recording') {
      stopVoiceInput();
      return;
    }

    if (isSafariOrIOS) {
      await startMediaRecording();
      return;
    }

    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;

    if (!Recognition) {
      await startMediaRecording();
      return;
    }

    setSpeechError('');
    setVoiceState('processing');
    speechHandledRef.current = false;
    speechManualStopRef.current = false;
    speechTranscriptRef.current = '';

    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
      } catch (error) {
        const errorName = error instanceof DOMException ? error.name : '';
        setSpeechError(
          errorName === 'NotAllowedError' || errorName === 'SecurityError'
            ? t.speechDenied
            : t.voiceFallback
        );
        setVoiceState('error');
        return;
      }
    }

    const recognition = new Recognition();
    recognition.lang = language === 'ar' ? 'ar-SA' : 'en-US';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onstart = () => {
      setIsListening(true);
      setVoiceState('listening');
      setSpeechError('');
      clearSpeechTimeout();
      speechTimeoutRef.current = window.setTimeout(() => {
        if (speechHandledRef.current) return;
        speechHandledRef.current = true;
        setSpeechError(t.speechNoSpeech);
        setIsListening(false);
        setVoiceState('error');
        recognition.stop();
      }, 8_000);
    };
    recognition.onresult = event => {
      clearSpeechTimeout();
      const finalSegments: string[] = [];
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript?.trim();
        if (result?.isFinal && transcript) finalSegments.push(transcript);
      }

      if (finalSegments.length > 0) {
        speechHandledRef.current = true;
        speechTranscriptRef.current = [
          speechTranscriptRef.current,
          ...finalSegments,
        ].filter(Boolean).join(' ').trim();
        setSpeechError('');
      }
    };
    recognition.onerror = event => {
      clearSpeechTimeout();
      setIsListening(false);
      if (speechManualStopRef.current || speechTranscriptRef.current) return;

      speechHandledRef.current = true;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        if (event.error === 'not-allowed') {
          setSpeechError(t.speechDenied);
          setVoiceState('error');
        } else {
          void startMediaRecording();
        }
      } else if (event.error === 'no-speech') {
        setSpeechError(t.speechNoSpeech);
        setVoiceState('error');
      } else {
        void startMediaRecording();
      }
    };
    recognition.onend = () => {
      clearSpeechTimeout();
      setIsListening(false);
      recognitionRef.current = null;
      const transcript = speechTranscriptRef.current.trim();

      if (transcript) {
        setInputValue(current => current.trim() ? `${current.trim()} ${transcript}` : transcript);
        speechTranscriptRef.current = '';
        setSpeechError('');
        setVoiceState('idle');
        return;
      }

      if (!speechHandledRef.current && !speechManualStopRef.current) {
        speechHandledRef.current = true;
        setSpeechError(t.speechNoSpeech);
        setVoiceState('error');
      } else if (speechManualStopRef.current) {
        setVoiceState('idle');
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      clearSpeechTimeout();
      speechHandledRef.current = true;
      setIsListening(false);
      await startMediaRecording();
    }
  };

  const pendingList = tasks.filter(task => task.date === selectedDate && !task.completed);
  const completedList = tasks.filter(task => task.date === selectedDate && task.completed);
  const newDayIncompleteTasks = tasks.filter(task => task.date === selectedDate && !task.completed);
  const upcomingEvents = scheduledEvents
    .filter(event =>
      event.status === 'upcoming' &&
      event.date === selectedDate
    )
    .sort((a, b) => scheduledEventTimestamp(a) - scheduledEventTimestamp(b));
  const todayTaskCount = tasks.filter(task => task.date === todayKey && !task.completed).length;
  const todayEventCount = scheduledEvents.filter(event =>
    event.date === todayKey && event.status === 'upcoming'
  ).length;

  const formatEventDate = (event: ScheduledEvent) => {
    const date = new Date(`${event.date}T12:00:00`);
    return new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
  };

  const formatEventTime = (time: string | null) => {
    if (!time) return t.noSpecificTime;
    const date = new Date(`2000-01-01T${time}:00`);
    return new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  };

  const reminderOptions = [
    { value: '', label: t.noReminder },
    { value: '0', label: t.atEventTime },
    { value: '10', label: t.minutesBefore(10) },
    { value: '30', label: t.minutesBefore(30) },
    { value: '60', label: t.oneHourBefore },
    { value: '1440', label: t.oneDayBefore },
  ];

  return (
    <div
      className="flex max-w-full overflow-hidden bg-zinc-50 font-sans text-zinc-900 transition-colors duration-300 dark:bg-zinc-950 dark:text-zinc-50"
      style={{ height: 'var(--app-height, 100dvh)' }}
    >
      {/* Sidebar - Desktop Only */}
      <aside className={`hidden lg:flex w-24 flex-col items-center py-8 bg-white border-zinc-200 transition-colors dark:bg-zinc-900 dark:border-zinc-800 ${language === 'ar' ? 'border-l' : 'border-r'}`}>
        <div className="mb-10 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white shadow-sm">
          <ListChecks size={26} />
        </div>
        <nav className="flex flex-col gap-8 flex-1">
          <button
            onClick={() => setActiveSection('dashboard')}
            className={`p-3 rounded-2xl transition-colors ${activeSection === 'dashboard' ? 'text-primary bg-primary/10 dark:bg-primary/15' : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-200'}`}
            title={t.taskList}
          >
            <LayoutDashboard size={24} />
          </button>
          <button
            onClick={() => setActiveSection('trash')}
            className={`relative p-3 rounded-2xl transition-colors ${activeSection === 'trash' ? 'text-primary bg-primary/10 dark:bg-primary/15' : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-200'}`}
            title={t.trash}
          >
            <Trash2 size={24} />
            {trashedTasks.length > 0 && (
              <span className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {trashedTasks.length}
              </span>
            )}
          </button>
          <button
            onClick={toggleTheme}
            className="p-3 text-zinc-400 hover:text-zinc-600 rounded-2xl transition-colors dark:text-zinc-500 dark:hover:text-zinc-200"
            title={isDarkMode ? t.lightMode : t.darkMode}
          >
            {isDarkMode ? <Sun size={24} /> : <Moon size={24} />}
          </button>
          <button
            onClick={toggleLanguage}
            className="p-3 text-zinc-400 hover:text-zinc-600 rounded-2xl transition-colors dark:text-zinc-500 dark:hover:text-zinc-200"
            title={t.changeLanguage}
          >
            <Languages size={24} />
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
        
        {/* Mobile Header */}
        <div className="flex min-h-14 shrink-0 items-center border-b border-zinc-100 bg-white px-4 py-2 transition-colors dark:border-zinc-800 dark:bg-zinc-900 md:hidden">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
              <ListChecks size={18} />
            </span>
            <span className="font-bold">{t.appName}</span>
          </div>
        </div>

        {/* Tasks Section */}
        <section className={`${mobileView === 'chat' ? 'hidden md:block' : 'block'} min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-28 pt-5 custom-scrollbar sm:px-6 md:p-6 lg:p-12`}>
          {activeSection === 'dashboard' ? (
            <>
              <header className="mb-5 flex flex-wrap items-start justify-between gap-3 sm:mb-6 sm:gap-4">
                <div>
                  <h1 className="mb-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50 sm:text-3xl lg:mb-2 lg:text-4xl">{t.taskList}</h1>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 sm:text-base lg:text-lg">{t.todaySummary(todayTaskCount, todayEventCount)}</p>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  <button
                    onClick={() => openManualTaskForm()}
                    className="hidden min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-primary/90 md:flex"
                  >
                    <Plus size={18} />
                    {t.addTask}
                  </button>
                  <button
                    onClick={openNewDayModal}
                    className="flex min-h-11 items-center gap-2 rounded-lg bg-zinc-900 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                  >
                    <CalendarPlus size={18} />
                    {t.newDay}
                  </button>
                </div>
              </header>

              {!isOnline && (
                <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                  {t.offlineNotice}
                </div>
              )}

              <div className={mobileView === 'tasks' ? 'hidden md:block' : 'block'}>
                <CalendarPanel
                  language={language}
                  selectedDate={selectedDate}
                  view={calendarView}
                  tasks={tasks}
                  events={scheduledEvents}
                  onSelectDate={setSelectedDate}
                  onViewChange={setCalendarView}
                />
              </div>

              <div className="grid max-w-3xl grid-cols-1 gap-5 sm:gap-6">
            {/* Upcoming Events */}
            <div className="space-y-4 mb-6">
              <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2 mb-6 dark:text-zinc-500">
                <CalendarClock size={14} /> {t.selectedDayEvents}
              </h2>
              {notificationMessage && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                  {notificationMessage}
                </div>
              )}
              {upcomingEvents.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {upcomingEvents.map(event => (
                    <motion.div
                      key={event.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="group flex min-w-0 items-start gap-3 rounded-lg border border-zinc-200 bg-white p-3.5 shadow-sm transition-colors dark:border-zinc-800 dark:bg-zinc-900 sm:p-4"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <CalendarClock size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="break-words font-semibold text-zinc-800 dark:text-zinc-100">{event.title}</h3>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                          <span>{formatEventDate(event)}</span>
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            {formatEventTime(event.time)}
                          </span>
                        </div>
                        <label className="mt-3 block">
                          <span className="mb-1 block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                            {t.reminder}
                          </span>
                          <select
                            value={event.reminderMinutes === null ? '' : String(event.reminderMinutes)}
                            onChange={e => void updateEventReminder(event, e.target.value)}
                            disabled={!event.time}
                            className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-xs text-zinc-700 outline-none transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                          >
                            {reminderOptions.map(option => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        {!event.time && (
                          <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-300">
                            {t.reminderNeedsTime}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                        <button
                          onClick={() => completeEvent(event.id)}
                          className="flex h-11 w-11 items-center justify-center text-zinc-400 transition-colors hover:text-emerald-500"
                          title={t.completeEvent}
                        >
                          <CheckCircle2 size={17} />
                        </button>
                        <button
                          onClick={() => deleteEvent(event.id)}
                          className="flex h-11 w-11 items-center justify-center text-zinc-400 transition-colors hover:text-red-500"
                          title={t.deleteEvent}
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-400 dark:text-zinc-500">{t.noUpcomingEvents}</p>
              )}
            </div>

            {/* Pending Tasks */}
            <div className="space-y-4">
              <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2 mb-6 dark:text-zinc-500">
                <Clock size={14} /> {t.selectedDayTasks}
              </h2>
              <AnimatePresence mode="popLayout" initial={false}>
                {pendingList.map((task) => (
                  <motion.div
                    key={task.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    className="group flex items-start gap-3 rounded-lg border border-zinc-100 bg-white p-3.5 shadow-sm transition-all hover:border-zinc-200 hover:shadow-xl dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20 dark:hover:border-zinc-700 sm:gap-5 sm:rounded-3xl sm:p-5"
                  >
                    <button 
                      onClick={() => toggleTask(task.id)}
                      className="flex h-11 w-11 shrink-0 items-center justify-center text-zinc-200 transition-colors hover:text-primary active:scale-95 dark:text-zinc-700 dark:hover:text-primary"
                    >
                      <Circle size={28} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words text-base font-semibold leading-snug text-zinc-800 [overflow-wrap:anywhere] dark:text-zinc-100 sm:text-lg">{task.title}</h3>
                      <div className="mt-2 flex flex-wrap items-center gap-2 sm:gap-4">
                        <span className="flex items-center gap-1.5 text-xs bg-zinc-100 px-3 py-1.5 rounded-full text-zinc-600 font-medium dark:bg-zinc-800 dark:text-zinc-300">
                          {t.categories[task.category]}
                        </span>
                        {task.time && (
                          <span className="text-xs text-zinc-400 font-medium flex items-center gap-1.5 bg-zinc-50 px-2 py-1 rounded-md dark:bg-zinc-950 dark:text-zinc-500">
                            <Clock size={12} /> {task.time}
                          </span>
                        )}
                        {task.priority === 'high' && (
                          <span className="text-xs text-red-500 font-bold bg-red-50 px-2 py-0.5 rounded border border-red-100 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-300">{t.highPriority}</span>
                        )}
                      </div>
                      {task.timeNote && (
                        <p className="mt-2 break-words text-xs text-zinc-500 dark:text-zinc-400">
                          <span className="font-semibold">{t.timeNote}:</span> {task.timeNote}
                        </p>
                      )}
                      {task.notes && (
                        <p className="mt-2 break-words text-xs text-zinc-500 dark:text-zinc-400">{task.notes}</p>
                      )}
                      <div className="mt-3 flex max-w-sm flex-wrap items-end gap-2">
                        <label className="min-w-44 flex-1">
                          <span className="mb-1 block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                            {t.reminder}
                          </span>
                          <select
                            value={task.reminderMinutes === null ? '' : String(task.reminderMinutes)}
                            onChange={event => void updateTaskReminder(task, event.target.value)}
                            disabled={taskTimestamp(task) === null}
                            className="min-h-11 w-full rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-xs text-zinc-700 outline-none transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                          >
                            {reminderOptions.map(option => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        {taskTimestamp(task) === null && (
                          <button
                            onClick={() => openTaskTimeEditor(task)}
                            className="min-h-11 shrink-0 rounded-md bg-primary/10 px-3 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary/15"
                          >
                            {t.addTime}
                          </button>
                        )}
                      </div>
                      {taskTimestamp(task) === null && (
                        <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-300">
                          {t.taskReminderNeedsTime}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-center gap-1 opacity-100 transition-opacity sm:flex-row sm:opacity-0 sm:group-hover:opacity-100">
                      <button
                        onClick={() => openManualTaskForm('', task)}
                        className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-50 text-zinc-400 transition-colors hover:text-primary dark:bg-zinc-800 dark:text-zinc-500"
                        title={t.editTask}
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-50 text-zinc-400 transition-colors hover:text-red-500 dark:bg-zinc-800 dark:text-zinc-500 dark:hover:text-red-400"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Completed Tasks */}
            {completedList.length > 0 && (
              <div className="space-y-4 mt-12">
                <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2 mb-6 opacity-40 dark:text-zinc-500">
                  <CheckCircle2 size={14} /> {t.completedTasks}
                </h2>
                {completedList.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 rounded-lg border border-transparent bg-white/40 p-3.5 opacity-50 grayscale transition-all hover:grayscale-0 dark:bg-zinc-900/40 sm:gap-5 sm:rounded-3xl sm:p-5"
                  >
                    <button 
                      onClick={() => toggleTask(task.id)}
                      className="text-emerald-500"
                    >
                      <CheckCircle2 size={28} />
                    </button>
                    <div className="flex-1">
                      <h3 className="font-medium text-zinc-500 line-through text-lg dark:text-zinc-400">{task.title}</h3>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {pendingList.length === 0 && completedList.length === 0 && (
              <div className="py-12 text-center sm:py-24">
                <div className="mb-4 inline-flex rounded-2xl border border-zinc-100 bg-white p-5 text-zinc-300 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-600 sm:mb-6 sm:rounded-[40px] sm:p-8">
                  <Calendar className="h-9 w-9 sm:h-12 sm:w-12" strokeWidth={1.5} />
                </div>
                <h3 className="text-xl font-bold text-zinc-800 dark:text-zinc-100 sm:text-2xl">{t.noTasksForDay}</h3>
                <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-500 dark:text-zinc-400 sm:text-base">{t.emptyDescription}</p>
              </div>
            )}
              </div>
            </>
          ) : (
            <div className="max-w-3xl">
              <header className="mb-6">
                <div className="mb-4 flex gap-2 md:hidden">
                  <button onClick={toggleTheme} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-white px-3 text-sm font-semibold shadow-sm dark:bg-zinc-900">
                    {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
                    {isDarkMode ? t.lightMode : t.darkMode}
                  </button>
                  <button onClick={toggleLanguage} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-white px-3 text-sm font-semibold shadow-sm dark:bg-zinc-900">
                    <Languages size={18} />
                    {language === 'ar' ? 'English' : 'العربية'}
                  </button>
                </div>
                <h1 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50 sm:text-4xl">{t.trash}</h1>
                <p className="text-zinc-500 dark:text-zinc-400">{trashedTasks.length}</p>
              </header>
              {trashedTasks.length === 0 ? (
                <div className="py-24 text-center text-zinc-400 dark:text-zinc-500">
                  <Trash2 className="mx-auto mb-4" size={44} strokeWidth={1.5} />
                  <p>{t.trashEmpty}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {trashedTasks.map(task => (
                    <div key={task.id} className="flex flex-wrap items-center gap-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                      <div className="min-w-0 flex-1">
                        <h3 className="break-words font-semibold text-zinc-800 dark:text-zinc-100">{task.title}</h3>
                        <p className="mt-1 text-xs text-zinc-400">{task.date}</p>
                      </div>
                      <button
                        onClick={() => restoreTask(task.id)}
                        className="flex items-center gap-1.5 rounded-md bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                      >
                        <RotateCcw size={15} />
                        {t.restore}
                      </button>
                      <button
                        onClick={() => permanentlyDeleteTask(task.id)}
                        className="flex items-center gap-1.5 rounded-md bg-red-50 px-3 py-2 text-xs font-bold text-red-600 dark:bg-red-500/10 dark:text-red-300"
                      >
                        <Trash2 size={15} />
                        {t.permanentDelete}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {archivedTasks.length > 0 && (
                <div className="mt-12 border-t border-zinc-200 pt-6 dark:border-zinc-800">
                  <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-400">
                    <Archive size={14} /> {t.archivedTasks} ({archivedTasks.length})
                  </h2>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Improved Chat Section */}
        <section className={`${mobileView === 'chat' ? 'flex' : 'hidden md:flex'} relative h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-zinc-200 bg-white shadow-[-10px_0_30px_rgba(0,0,0,0.02)] transition-colors dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20 md:w-96 lg:w-[450px] ${language === 'ar' ? 'md:border-r' : 'md:border-l'}`}>
          <div className="sticky top-0 z-10 border-b border-zinc-100 bg-white/90 px-4 py-4 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <MessageSquare size={20} />
                </div>
                <div className="min-w-0">
                  <span className="block truncate font-bold leading-none text-zinc-900 dark:text-zinc-50">
                    {activeChat?.title || t.newChat}
                  </span>
                  <span className="mt-1 inline-block text-[10px] font-medium uppercase text-zinc-400 dark:text-zinc-500">
                    {temporaryChat ? t.temporaryChat : t.online}
                  </span>
                </div>
              </div>
              {isLoading && (
                <div className="flex gap-1">
                  <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1 h-1 bg-primary rounded-full" />
                  <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1 h-1 bg-primary rounded-full" />
                  <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1 h-1 bg-primary rounded-full" />
                </div>
              )}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button
                onClick={() => startNewChat(false)}
                className="flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-2 py-2 text-[11px] font-bold text-white transition-colors hover:bg-primary/90"
                title={t.newChat}
              >
                <Plus size={15} />
                <span className="hidden truncate sm:inline">{t.newChat}</span>
              </button>
              <button
                onClick={() => startNewChat(true)}
                className={`flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[11px] font-bold transition-colors ${
                  temporaryChat
                    ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'
                    : 'border-zinc-200 text-zinc-600 hover:border-amber-300 hover:text-amber-700 dark:border-zinc-700 dark:text-zinc-300'
                }`}
                title={t.temporaryChat}
              >
                <ShieldCheck size={15} />
                <span className="hidden truncate sm:inline">{t.temporaryChat}</span>
              </button>
              <button
                onClick={() => setShowChatHistory(current => !current)}
                className={`flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[11px] font-bold transition-colors ${
                  showChatHistory
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-zinc-200 text-zinc-600 hover:border-primary hover:text-primary dark:border-zinc-700 dark:text-zinc-300'
                }`}
                title={t.chatHistory}
              >
                <History size={15} />
                <span className="hidden truncate sm:inline">{t.chatHistory}</span>
              </button>
            </div>
          </div>

          <AnimatePresence>
            {showChatHistory && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="shrink-0 overflow-hidden border-b border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/60"
              >
                <div className="max-h-52 space-y-1 overflow-y-auto p-3 custom-scrollbar">
                  {chats.length > 0 ? chats
                    .slice()
                    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                    .map(chat => (
                      <div
                        key={chat.id}
                        className={`group flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                          !temporaryChat && chat.id === activeChatId
                            ? 'border-primary/30 bg-primary/10'
                            : 'border-transparent bg-white hover:border-zinc-200 dark:bg-zinc-900 dark:hover:border-zinc-700'
                        }`}
                      >
                        <button
                          onClick={() => openSavedChat(chat.id)}
                          className="min-w-0 flex-1 text-start"
                        >
                          <span className="block truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">{chat.title}</span>
                          <span className="mt-0.5 block text-[10px] text-zinc-400">
                            {new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            }).format(new Date(chat.updatedAt))}
                          </span>
                        </button>
                        <button
                          onClick={() => deleteChat(chat.id)}
                          className="shrink-0 p-1.5 text-zinc-400 opacity-100 transition-colors hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100"
                          title={t.deleteChat}
                          aria-label={t.deleteChat}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )) : (
                    <p className="px-3 py-5 text-center text-xs text-zinc-400">{t.noChatHistory}</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {temporaryChat && (
            <div className="flex shrink-0 items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
              <ShieldCheck size={14} />
              {t.temporaryChatNotice}
            </div>
          )}

          <div 
            ref={scrollRef}
            className="flex-1 space-y-4 overflow-y-auto bg-slate-50/30 p-4 custom-scrollbar transition-colors dark:bg-zinc-950/35 sm:space-y-6 sm:p-6"
          >
            {messages.map((msg, i) => {
               const safeContent = safeMessageText(msg?.content);
               const messageRole = msg?.role === 'user' ? 'user' : 'assistant';
               const isLastMessage = i === messages.length - 1;
               const showActions = isLastMessage && messageRole === 'assistant' && pendingTasks.length > 0;
               if (!safeContent) return null;

               return (
                <div key={i} className="space-y-3">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${messageRole === 'user' ? 'justify-start' : 'justify-end'}`}
                  >
                    <div className={`
                      max-w-[90%] whitespace-pre-wrap break-words [overflow-wrap:anywhere] p-3.5 sm:p-4 rounded-3xl text-sm leading-relaxed shadow-sm
                      ${messageRole === 'user'
                        ? 'bg-zinc-900 text-white rounded-tr-none dark:bg-primary' 
                        : 'bg-white text-zinc-800 rounded-tl-none border border-zinc-100 dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-700'}
                    `} dir={language === 'ar' ? 'rtl' : 'ltr'}>
                      {messageRole === 'assistant'
                        ? cleanAssistantMessage(safeContent, language)
                        : safeContent}
                    </div>
                  </motion.div>
                  
                  {showActions && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`flex flex-col gap-2 ${language === 'ar' ? 'pr-4 mr-8' : 'pl-4 ml-8'}`}
                    >
                      <div className="flex gap-2">
                        <button 
                          onClick={approvePlan}
                          className="flex-1 py-3 bg-primary text-white rounded-2xl font-bold text-xs hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                        >
                          {t.approve}
                        </button>
                        <button 
                          onClick={() => {
                            setPendingTasks([]);
                            setMessages(prev => [...prev, { role: 'assistant', content: t.editPrompt }]);
                          }}
                          className="px-4 py-3 bg-zinc-200 text-zinc-700 rounded-2xl font-bold text-xs hover:bg-zinc-300 transition-all dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                        >
                          {t.edit}
                        </button>
                      </div>
                      <button 
                        onClick={ignorePlan}
                        className="w-full py-2 text-zinc-400 hover:text-zinc-600 font-medium text-[10px] transition-colors dark:text-zinc-500 dark:hover:text-zinc-300"
                      >
                        {t.ignore}
                      </button>
                    </motion.div>
                  )}
                </div>
               );
            })}
          </div>

          <div className="mb-[calc(4.5rem+env(safe-area-inset-bottom))] shrink-0 border-t border-zinc-100 bg-white p-3 transition-colors dark:border-zinc-800 dark:bg-zinc-900 sm:p-4 md:mb-0 md:p-6">
            {chatFallbackText && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/20 dark:bg-amber-500/10">
                <p className="text-xs font-medium text-amber-800 dark:text-amber-200">{t.chatFallback}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => addTaskFromText(chatFallbackText)}
                    className="rounded-md bg-primary px-3 py-2 text-xs font-bold text-white"
                  >
                    {t.addFromText}
                  </button>
                  <button
                    onClick={() => openManualTaskForm(chatFallbackText)}
                    className="rounded-md border border-amber-300 px-3 py-2 text-xs font-bold text-amber-800 dark:border-amber-500/30 dark:text-amber-200"
                  >
                    {t.addTask}
                  </button>
                </div>
              </div>
            )}
            <div className="flex w-full items-end gap-2 sm:gap-3">
              <button
                onClick={toggleListening}
                disabled={isLoading || voiceState === 'processing'}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-all disabled:opacity-40 sm:h-12 sm:w-12 ${
                  isListening || voiceState === 'recording'
                    ? 'border-red-400 bg-red-50 text-red-500 shadow-md shadow-red-500/15 dark:border-red-500/40 dark:bg-red-500/10'
                    : 'border-zinc-200 bg-zinc-50 text-zinc-500 hover:border-primary hover:text-primary dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400'
                }`}
                title={isListening || voiceState === 'recording' ? t.stopListening : t.startListening}
                aria-label={isListening || voiceState === 'recording' ? t.stopListening : t.startListening}
              >
                {isListening || voiceState === 'recording'
                  ? <Square size={16} fill="currentColor" />
                  : <Mic size={20} />}
              </button>
              <div className="group min-w-0 flex-1">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder={t.placeholder}
                  dir={language === 'ar' ? 'rtl' : 'ltr'}
                  className={`block max-h-32 min-h-11 w-full resize-none overflow-y-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-[22px] border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-base leading-6 transition-all focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/5 group-hover:bg-white dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:group-hover:bg-zinc-950 sm:max-h-36 sm:min-h-12 sm:rounded-[24px] sm:px-5 sm:py-3 sm:text-sm ${language === 'ar' ? 'text-right' : 'text-left'}`}
                />
              </div>
              <button
                onClick={handleSend}
                disabled={isLoading || !inputValue.trim() || isListening || voiceState === 'recording'}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-md shadow-primary/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-30 disabled:hover:scale-100 sm:h-12 sm:w-12"
                aria-label={language === 'ar' ? 'إرسال' : 'Send'}
              >
                <Send size={20} />
              </button>
            </div>
            {(isListening || voiceState === 'recording') && (
              <div className="mt-2 flex min-h-11 items-center justify-between gap-3 rounded-lg bg-red-50 px-3 text-xs font-semibold text-red-600 dark:bg-red-500/10 dark:text-red-300">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  {voiceState === 'recording' ? t.recording : t.listening}
                </span>
                <button
                  onClick={cancelListening}
                  className="flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-bold hover:bg-red-100 dark:hover:bg-red-500/10"
                >
                  <X size={15} />
                  {t.cancelRecording}
                </button>
              </div>
            )}
            {voiceState === 'processing' && (
              <div className="mt-2 flex min-h-10 items-center justify-center gap-2 text-xs font-semibold text-primary">
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                {t.processingVoice}
              </div>
            )}
            {voiceState === 'error' && speechError && (
              <p className="mt-2 text-center text-xs font-medium text-red-500">{speechError}</p>
            )}
            {isSafariOrIOS && voiceState === 'idle' && !speechError && (
              <p className="mt-2 text-center text-[11px] text-zinc-400 dark:text-zinc-500">
                {t.safariVoiceHint}
              </p>
            )}
          </div>
        </section>

        <nav
          className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-zinc-200 bg-white/95 px-1 pt-1 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-900/95 md:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          aria-label={language === 'ar' ? 'التنقل الرئيسي' : 'Main navigation'}
        >
          {[
            { id: 'chat' as const, label: t.mobileChat, icon: MessageSquare },
            { id: 'tasks' as const, label: t.mobileTasks, icon: CheckCircle2 },
            { id: 'calendar' as const, label: t.mobileCalendar, icon: Calendar },
          ].map(item => {
            const Icon = item.icon;
            const active = mobileView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveSection('dashboard');
                  setMobileView(item.id);
                }}
                className={`relative flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[10px] font-semibold transition-colors ${
                  active ? 'text-primary' : 'text-zinc-400 dark:text-zinc-500'
                }`}
              >
                <Icon size={21} />
                <span className="max-w-full truncate">{item.label}</span>
              </button>
            );
          })}
          <button
            onClick={() => openManualTaskForm()}
            className="flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[10px] font-semibold text-primary"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white shadow-md shadow-primary/20">
              <Plus size={19} />
            </span>
            <span className="max-w-full truncate">{t.mobileAdd}</span>
          </button>
          <button
            onClick={() => {
              setActiveSection('trash');
              setMobileView('more');
            }}
            className={`relative flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[10px] font-semibold transition-colors ${
              mobileView === 'more' ? 'text-primary' : 'text-zinc-400 dark:text-zinc-500'
            }`}
          >
            <Settings size={21} />
            <span className="max-w-full truncate">{t.mobileMore}</span>
            {trashedTasks.length > 0 && (
              <span className="absolute end-[22%] top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] text-white">
                {trashedTasks.length}
              </span>
            )}
          </button>
        </nav>
      </main>
      <AnimatePresence>
        {reminderToast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            className={`fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-xl shadow-black/10 dark:border-zinc-700 dark:bg-zinc-800 md:bottom-5 ${
              language === 'ar' ? 'right-5' : 'left-5'
            }`}
            role="alert"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Bell size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t.reminderTitle}</p>
              <p className="mt-0.5 break-words text-sm font-medium text-zinc-900 dark:text-zinc-100">{reminderToast}</p>
            </div>
            <button
              onClick={() => setReminderToast('')}
              className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
            >
              {t.dismiss}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {undoTask && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className={`fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-xl shadow-black/10 dark:border-zinc-700 dark:bg-zinc-800 md:bottom-5 ${
              language === 'ar' ? 'left-5' : 'right-5'
            }`}
            role="status"
          >
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{t.taskMovedToTrash}</span>
            <button
              onClick={() => restoreTask(undoTask.id)}
              className="flex items-center gap-1 text-sm font-bold text-primary"
            >
              <RotateCcw size={15} />
              {t.undo}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {newDayToast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className={`fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-xl shadow-black/10 dark:border-zinc-700 dark:bg-zinc-800 md:bottom-20 ${
              language === 'ar' ? 'right-5' : 'left-5'
            }`}
            role="status"
          >
            <CalendarPlus className="shrink-0 text-primary" size={18} />
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{newDayToast}</span>
            <button
              onClick={() => setNewDayToast('')}
              className="shrink-0 p-1 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100"
              aria-label={t.dismiss}
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {taskSavedToast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className={`fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-lg border border-emerald-200 bg-white px-4 py-3 shadow-xl shadow-black/10 dark:border-emerald-500/20 dark:bg-zinc-800 md:bottom-20 ${
              language === 'ar' ? 'left-5' : 'right-5'
            }`}
            role="status"
          >
            <CheckCircle2 className="shrink-0 text-emerald-500" size={18} />
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{taskSavedToast}</span>
            <button
              onClick={() => setTaskSavedToast('')}
              className="shrink-0 p-1 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100"
              aria-label={t.dismiss}
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showNewDayModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              className="max-h-[92dvh] w-full max-w-md overflow-hidden rounded-t-lg border border-zinc-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl dark:border-zinc-700 dark:bg-zinc-900 sm:rounded-lg sm:p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{t.newDayConfirmTitle}</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">{t.newDayConfirm}</p>
                </div>
                <button
                  onClick={() => {
                    setShowNewDayModal(false);
                    setSelectedNewDayTaskIds([]);
                  }}
                  className="flex h-11 w-11 shrink-0 items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  aria-label={t.cancel}
                >
                  <X size={20} />
                </button>
              </div>
              <div className="mt-4 max-h-[42dvh] space-y-2 overflow-y-auto pe-1 custom-scrollbar sm:mt-5 sm:max-h-64">
                {newDayIncompleteTasks.length > 0 ? (
                  <>
                    <label className="mb-3 flex cursor-pointer items-center gap-3 rounded-lg bg-zinc-100 px-3 py-2.5 text-sm font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                      <input
                        type="checkbox"
                        checked={selectedNewDayTaskIds.length === newDayIncompleteTasks.length}
                        onChange={event => setSelectedNewDayTaskIds(
                          event.target.checked ? newDayIncompleteTasks.map(task => task.id) : []
                        )}
                        className="h-4 w-4 accent-primary"
                      />
                      {t.selectAll}
                    </label>
                    {newDayIncompleteTasks.map(task => (
                      <label
                        key={task.id}
                        className="flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 px-3 py-3 transition-colors hover:border-primary/50 dark:border-zinc-700"
                      >
                        <input
                          type="checkbox"
                          checked={selectedNewDayTaskIds.includes(task.id)}
                          onChange={event => setSelectedNewDayTaskIds(current =>
                            event.target.checked
                              ? [...current, task.id]
                              : current.filter(id => id !== task.id)
                          )}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                        />
                        <span className="min-w-0">
                          <span className="block break-words text-sm font-semibold text-zinc-800 dark:text-zinc-100">{task.title}</span>
                          {task.time && (
                            <span className="mt-1 block text-xs text-zinc-400">{task.time}</span>
                          )}
                        </span>
                      </label>
                    ))}
                  </>
                ) : (
                  <p className="rounded-lg bg-zinc-100 px-4 py-4 text-sm text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    {t.noIncompleteTasks}
                  </p>
                )}
              </div>
              <div className="mt-6 grid gap-2">
                <button
                  onClick={() => finishSelectedDay('move')}
                  disabled={selectedNewDayTaskIds.length === 0}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <CalendarPlus size={17} />
                  {t.moveToTomorrow}
                </button>
                <button
                  onClick={() => finishSelectedDay('keep')}
                  disabled={selectedNewDayTaskIds.length === 0}
                  className="min-h-12 rounded-lg bg-zinc-100 px-4 py-3 text-sm font-bold text-zinc-700 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  {t.keepOnToday}
                </button>
                <button
                  onClick={() => finishSelectedDay('archive-only')}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-zinc-200 px-4 py-3 text-sm font-bold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <Archive size={17} />
                  {t.archiveCompletedOnly}
                </button>
                <button
                  onClick={() => {
                    setShowNewDayModal(false);
                    setSelectedNewDayTaskIds([]);
                  }}
                  className="min-h-11 px-4 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  {t.cancel}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {editingTaskTimeId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
          >
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              className="w-full max-w-sm rounded-t-lg border border-zinc-200 bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl dark:border-zinc-700 dark:bg-zinc-900 sm:rounded-lg"
            >
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-lg font-bold text-zinc-900 dark:text-white">{t.editTaskTime}</h2>
                <button
                  onClick={closeTaskTimeEditor}
                  className="flex h-11 w-11 items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  aria-label={t.cancel}
                >
                  <X size={19} />
                </button>
              </div>
              <div className="mt-5 grid gap-4">
                <label>
                  <span className="mb-1.5 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t.taskDate}</span>
                  <input
                    type="date"
                    value={taskTimeDate}
                    onChange={event => setTaskTimeDate(event.target.value)}
                    className="min-h-12 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-base text-zinc-800 outline-none focus:border-primary dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 sm:text-sm"
                  />
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t.taskTime}</span>
                  <input
                    type="time"
                    value={taskTimeValue}
                    onChange={event => setTaskTimeValue(event.target.value)}
                    className="min-h-12 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-base text-zinc-800 outline-none focus:border-primary dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 sm:text-sm"
                  />
                </label>
              </div>
              <div className="mt-6 flex gap-2">
                <button
                  onClick={saveTaskTime}
                  disabled={!taskTimeDate || !taskTimeValue}
                  className="flex-1 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t.save}
                </button>
                <button
                  onClick={closeTaskTimeEditor}
                  className="rounded-lg bg-zinc-100 px-4 py-3 text-sm font-bold text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  {t.cancel}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showTaskForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
          >
            <motion.form
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              onSubmit={event => {
                event.preventDefault();
                void saveManualTask();
              }}
              className="max-h-[94dvh] w-full max-w-lg overflow-y-auto rounded-t-lg border border-zinc-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl custom-scrollbar dark:border-zinc-700 dark:bg-zinc-900 sm:max-h-[calc(100vh-2rem)] sm:rounded-lg sm:p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
                  {editingManualTaskId ? t.editTask : t.addTask}
                </h2>
                <button
                  type="button"
                  onClick={closeManualTaskForm}
                  className="flex h-11 w-11 shrink-0 items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  aria-label={t.cancel}
                >
                  <X size={20} />
                </button>
              </div>

              {!isOnline && (
                <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                  {t.offlineNotice}
                </p>
              )}

              <div className="mt-5 grid gap-4">
                <label>
                  <span className="mb-1.5 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t.taskTitle}</span>
                  <input
                    type="text"
                    value={manualTitle}
                    onChange={event => setManualTitle(event.target.value)}
                    required
                    autoFocus
                    className="min-h-12 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-base text-zinc-800 outline-none focus:border-primary dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 sm:text-sm"
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    <span className="mb-1.5 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t.taskDate}</span>
                    <input
                      type="date"
                      value={manualDate}
                      onChange={event => setManualDate(event.target.value)}
                      required
                      className="min-h-12 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-base text-zinc-800 outline-none focus:border-primary dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 sm:text-sm"
                    />
                  </label>
                  <label>
                    <span className="mb-1.5 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                      {t.taskTime} <span className="font-normal">({t.optional})</span>
                    </span>
                    <input
                      type="time"
                      value={manualTime}
                      onChange={event => {
                        setManualTime(event.target.value);
                        setManualFormError('');
                      }}
                      className="min-h-12 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-base text-zinc-800 outline-none focus:border-primary dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 sm:text-sm"
                    />
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    <span className="mb-1.5 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t.category}</span>
                    <select
                      value={manualCategory}
                      onChange={event => setManualCategory(event.target.value as Task['category'])}
                      className="min-h-12 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-base text-zinc-800 outline-none focus:border-primary dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 sm:text-sm"
                    >
                      {Object.entries(t.categories).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="mb-1.5 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t.priority}</span>
                    <select
                      value={manualPriority}
                      onChange={event => setManualPriority(event.target.value as Task['priority'])}
                      className="min-h-12 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-base text-zinc-800 outline-none focus:border-primary dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 sm:text-sm"
                    >
                      <option value="low">{t.low}</option>
                      <option value="medium">{t.medium}</option>
                      <option value="high">{t.high}</option>
                    </select>
                  </label>
                </div>

                <label>
                  <span className="mb-1.5 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t.reminder}</span>
                  <select
                    value={manualReminder}
                    onChange={event => {
                      setManualReminder(event.target.value);
                      setManualFormError('');
                    }}
                    className="min-h-12 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-base text-zinc-800 outline-none focus:border-primary dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 sm:text-sm"
                  >
                    {reminderOptions.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="mb-1.5 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    {t.notes} <span className="font-normal">({t.optional})</span>
                  </span>
                  <textarea
                    value={manualNotes}
                    onChange={event => setManualNotes(event.target.value)}
                    rows={3}
                    className="min-h-24 w-full resize-y rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-base text-zinc-800 outline-none focus:border-primary dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 sm:text-sm"
                  />
                </label>
              </div>

              {manualFormError && (
                <p className="mt-3 text-xs font-medium text-red-500">{manualFormError}</p>
              )}

              <div className="sticky bottom-0 -mx-4 mt-6 flex gap-2 border-t border-zinc-100 bg-white px-4 pb-1 pt-3 dark:border-zinc-800 dark:bg-zinc-900 sm:static sm:mx-0 sm:border-0 sm:p-0">
                <button
                  type="submit"
                  disabled={!manualTitle.trim() || !manualDate}
                  className="min-h-12 flex-1 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t.save}
                </button>
                <button
                  type="button"
                  onClick={closeManualTaskForm}
                  className="min-h-12 rounded-lg bg-zinc-100 px-4 py-3 text-sm font-bold text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  {t.cancel}
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
