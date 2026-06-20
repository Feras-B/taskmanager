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
  Sparkles,
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
  X
} from 'lucide-react';
import { Task, ChatMessage, ScheduledEvent, TrashedTask } from './types';
import { parseScheduledEvent, scheduledEventTimestamp } from './dateParser';
import CalendarPanel from './CalendarPanel';
import { CalendarViewMode, toDateKey } from './calendarUtils';
import { applyNewDayAction, NewDayAction } from './newDayUtils';

type Language = 'ar' | 'en';
type AppSection = 'dashboard' | 'trash';

function normalizeTaskTime(time?: string) {
  if (!time) return null;
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

function taskTimestamp(task: Task) {
  const time = normalizeTaskTime(task.time);
  if (!time) return null;
  return new Date(`${task.date}T${time}:00`).getTime();
}

interface SpeechRecognitionResultEvent {
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
    welcome: 'أهلاً بك! أنا مساعدك الذكي لتنظيم المهام. أخبرني ماذا يدور في ذهنك اليوم، وسأقوم بترتيبه لك.',
    appName: 'منظم المهام',
    taskList: 'قائمة مهامك 📋',
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
    approved: 'تم اعتماد الخطة وإضافة المهام بنجاح! بالتوفيق في إنجازها. 👍',
    ignored: 'تم تجاهل الاقتراح. يمكنك إخباري بمهام أخرى إذا أردت.',
    error: 'عذراً، حدث خطأ أثناء معالجة طلبك. حاول مرة أخرى.',
    upcomingEvents: 'المواعيد القادمة',
    noUpcomingEvents: 'لا توجد مواعيد قادمة بعد.',
    noSpecificTime: 'بدون وقت محدد',
    completeEvent: 'إكمال الموعد',
    deleteEvent: 'حذف الموعد',
    listening: 'جاري الاستماع...',
    startListening: 'ابدأ الإدخال الصوتي',
    stopListening: 'إيقاف الاستماع',
    speechUnsupported: 'المتصفح لا يدعم الإدخال الصوتي. جرّب Google Chrome.',
    speechDenied: 'تم رفض إذن الميكروفون. فضلاً فعّل الميكروفون من إعدادات المتصفح.',
    speechNoSpeech: 'لم أسمع أي كلام. حاول مرة أخرى وتحدث بالقرب من الميكروفون.',
    speechUnclear: 'لم أتمكن من فهم الكلام بوضوح. حاول مرة أخرى.',
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
    categories: {
      work: 'عمل',
      personal: 'شخصي',
      health: 'صحة',
      social: 'اجتماعي',
      other: 'أخرى',
    },
  },
  en: {
    welcome: "Welcome! I'm your smart task assistant. Tell me what's on your mind today and I'll organize it for you.",
    appName: 'Task Manager',
    taskList: 'Your Tasks 📋',
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
    approved: 'Plan approved and tasks added successfully. Good luck! 👍',
    ignored: 'Suggestion ignored. You can tell me about other tasks whenever you are ready.',
    error: 'Sorry, something went wrong while processing your request. Please try again.',
    upcomingEvents: 'Upcoming Events',
    noUpcomingEvents: 'No upcoming events yet.',
    noSpecificTime: 'No specific time',
    completeEvent: 'Complete event',
    deleteEvent: 'Delete event',
    listening: 'Listening...',
    startListening: 'Start voice input',
    stopListening: 'Stop listening',
    speechUnsupported: 'This browser does not support voice input. Please try Google Chrome.',
    speechDenied: 'Microphone permission was denied. Please allow microphone access from browser settings.',
    speechNoSpeech: 'I did not hear anything. Please try again and speak closer to the microphone.',
    speechUnclear: 'I could not understand the speech clearly. Please try again.',
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
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem('chat_messages');
    return saved ? JSON.parse(saved) : [
      { 
        role: 'assistant', 
        content: translations[language].welcome
      }
    ];
  });
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
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
  const [activeSection, setActiveSection] = useState<AppSection>('dashboard');
  const [calendarView, setCalendarView] = useState<CalendarViewMode>('week');
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const speechTimeoutRef = useRef<number | null>(null);
  const speechHandledRef = useRef(false);
  const speechManualStopRef = useRef(false);
  const t = translations[language];

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
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
  }, [inputValue]);

  useEffect(() => {
    localStorage.setItem('chat_messages', JSON.stringify(messages));
  }, [messages]);

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
    };
  }, []);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage = inputValue;
    const detectedEvent = parseScheduledEvent(userMessage);
    if (detectedEvent) {
      setScheduledEvents(prev => [...prev, detectedEvent]);
    }
    setInputValue('');
    setSpeechError('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/parse-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, language }),
      });

      const data = await res.json();
      
      if (data.tasks && data.tasks.length > 0) {
        setPendingTasks(data.tasks.map((task: Task) => ({
          ...task,
          time: normalizeTaskTime(task.time) || undefined,
          timeNote: normalizeTaskTime(task.time) ? task.timeNote : task.timeNote || task.time,
          date: detectedEvent?.date || selectedDate,
          reminderMinutes: task.reminderMinutes ?? null,
          reminderNotifiedAt: task.reminderNotifiedAt ?? null,
        })));
      } else {
        setPendingTasks([]);
      }

      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.reply,
        tasks: data.tasks 
      }]);
    } catch (error) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: t.error
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

  const toggleListening = async () => {
    if (isListening) {
      speechManualStopRef.current = true;
      clearSpeechTimeout();
      recognitionRef.current?.stop();
      return;
    }

    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;

    if (!Recognition) {
      setSpeechError(t.speechUnsupported);
      return;
    }

    setSpeechError('');
    speechHandledRef.current = false;
    speechManualStopRef.current = false;

    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
      } catch (error) {
        const errorName = error instanceof DOMException ? error.name : '';
        setSpeechError(
          errorName === 'NotAllowedError' || errorName === 'SecurityError'
            ? t.speechDenied
            : t.speechUnclear
        );
        return;
      }
    }

    const recognition = new Recognition();
    recognition.lang = 'ar-SA';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => {
      setIsListening(true);
      setSpeechError('');
      clearSpeechTimeout();
      speechTimeoutRef.current = window.setTimeout(() => {
        if (speechHandledRef.current) return;
        speechHandledRef.current = true;
        setSpeechError(t.speechNoSpeech);
        setIsListening(false);
        recognition.stop();
      }, 8_000);
    };
    recognition.onresult = event => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      clearSpeechTimeout();
      speechHandledRef.current = true;
      if (transcript) {
        setInputValue(current => current.trim() ? `${current.trim()} ${transcript}` : transcript);
        setSpeechError('');
      } else {
        setSpeechError(t.speechUnclear);
      }
    };
    recognition.onerror = event => {
      clearSpeechTimeout();
      setIsListening(false);
      if (speechHandledRef.current || speechManualStopRef.current) return;

      speechHandledRef.current = true;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setSpeechError(t.speechDenied);
      } else if (event.error === 'no-speech') {
        setSpeechError(t.speechNoSpeech);
      } else {
        setSpeechError(t.speechUnclear);
      }
    };
    recognition.onend = () => {
      clearSpeechTimeout();
      setIsListening(false);
      recognitionRef.current = null;

      if (!speechHandledRef.current && !speechManualStopRef.current) {
        speechHandledRef.current = true;
        setSpeechError(t.speechNoSpeech);
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      clearSpeechTimeout();
      speechHandledRef.current = true;
      setSpeechError(t.speechUnclear);
      setIsListening(false);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'work': return '💼';
      case 'personal': return '🏠';
      case 'health': return '🥗';
      case 'social': return '🤝';
      default: return '✅';
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
    <div className="flex h-screen bg-zinc-50 font-sans overflow-hidden text-zinc-900 transition-colors duration-300 dark:bg-zinc-950 dark:text-zinc-50">
      {/* Sidebar - Desktop Only */}
      <aside className={`hidden lg:flex w-24 flex-col items-center py-8 bg-white border-zinc-200 transition-colors dark:bg-zinc-900 dark:border-zinc-800 ${language === 'ar' ? 'border-l' : 'border-r'}`}>
        <div className="w-12 h-12 bg-zinc-900 rounded-2xl flex items-center justify-center text-white mb-10 shadow-lg dark:bg-white dark:text-zinc-950">
          <Sparkles size={28} />
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
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        
        {/* Mobile Header */}
        <div className="lg:hidden p-4 bg-white border-b border-zinc-100 flex items-center justify-between transition-colors dark:bg-zinc-900 dark:border-zinc-800">
           <div className="flex items-center gap-2">
            <Sparkles className="text-zinc-800 dark:text-zinc-100" size={20} />
            <span className="font-bold">{t.appName}</span>
           </div>
           <div className="flex items-center gap-1">
            <button onClick={toggleLanguage} className="text-zinc-400 p-2 dark:text-zinc-300" title={t.changeLanguage}>
              <Languages size={20} />
            </button>
            <button onClick={toggleTheme} className="text-zinc-400 p-2 dark:text-zinc-300" title={isDarkMode ? t.lightMode : t.darkMode}>
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button onClick={() => setActiveSection(activeSection === 'trash' ? 'dashboard' : 'trash')} className="relative text-zinc-400 p-2 dark:text-zinc-300" title={t.trash}>
              <Trash2 size={20} />
              {trashedTasks.length > 0 && (
                <span className="absolute end-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] text-white">
                  {trashedTasks.length}
                </span>
              )}
            </button>
           </div>
        </div>

        {/* Tasks Section */}
        <section className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-12">
          {activeSection === 'dashboard' ? (
            <>
              <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="text-4xl font-bold text-zinc-900 mb-2 tracking-tight dark:text-zinc-50">{t.taskList}</h1>
                  <p className="text-zinc-500 text-lg dark:text-zinc-400">{t.todaySummary(todayTaskCount, todayEventCount)}</p>
                </div>
                <button
                  onClick={openNewDayModal}
                  className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                >
                  <CalendarPlus size={18} />
                  {t.newDay}
                </button>
              </header>

              <CalendarPanel
                language={language}
                selectedDate={selectedDate}
                view={calendarView}
                tasks={tasks}
                events={scheduledEvents}
                onSelectDate={setSelectedDate}
                onViewChange={setCalendarView}
              />

              <div className="grid grid-cols-1 gap-6 max-w-3xl">
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
                      className="group flex min-w-0 items-start gap-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition-colors dark:border-zinc-800 dark:bg-zinc-900"
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
                          className="p-1.5 text-zinc-400 transition-colors hover:text-emerald-500"
                          title={t.completeEvent}
                        >
                          <CheckCircle2 size={17} />
                        </button>
                        <button
                          onClick={() => deleteEvent(event.id)}
                          className="p-1.5 text-zinc-400 transition-colors hover:text-red-500"
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
                    className="group bg-white p-5 rounded-3xl border border-zinc-100 shadow-sm hover:shadow-xl hover:border-zinc-200 transition-all flex items-center gap-5 dark:bg-zinc-900 dark:border-zinc-800 dark:hover:border-zinc-700 dark:shadow-black/20"
                  >
                    <button 
                      onClick={() => toggleTask(task.id)}
                      className="text-zinc-200 hover:text-primary transition-colors transform hover:scale-110 active:scale-95 dark:text-zinc-700 dark:hover:text-primary"
                    >
                      <Circle size={28} />
                    </button>
                    <div className="flex-1">
                      <h3 className="font-semibold text-zinc-800 text-lg leading-tight dark:text-zinc-100">{task.title}</h3>
                      <div className="flex items-center gap-4 mt-2">
                        <span className="flex items-center gap-1.5 text-xs bg-zinc-100 px-3 py-1.5 rounded-full text-zinc-600 font-medium dark:bg-zinc-800 dark:text-zinc-300">
                          <span className="text-base">{getCategoryIcon(task.category)}</span>
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
                      <div className="mt-3 flex max-w-sm flex-wrap items-end gap-2">
                        <label className="min-w-44 flex-1">
                          <span className="mb-1 block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                            {t.reminder}
                          </span>
                          <select
                            value={task.reminderMinutes === null ? '' : String(task.reminderMinutes)}
                            onChange={event => void updateTaskReminder(task, event.target.value)}
                            disabled={taskTimestamp(task) === null}
                            className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-xs text-zinc-700 outline-none transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
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
                            className="shrink-0 rounded-md bg-primary/10 px-3 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary/15"
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
                    <button 
                      onClick={() => deleteTask(task.id)}
                      className="text-zinc-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-2 bg-zinc-50 rounded-xl dark:bg-zinc-800 dark:text-zinc-600 dark:hover:text-red-400"
                    >
                      <Trash2 size={20} />
                    </button>
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
                    className="bg-white/40 p-5 rounded-3xl border border-transparent opacity-50 flex items-center gap-5 grayscale hover:grayscale-0 transition-all dark:bg-zinc-900/40"
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
              <div className="py-24 text-center">
                <div className="inline-flex p-8 rounded-[40px] bg-white border border-zinc-100 shadow-sm text-zinc-300 mb-6 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-600">
                  <Calendar size={48} strokeWidth={1.5} />
                </div>
                <h3 className="text-2xl font-bold text-zinc-800 dark:text-zinc-100">{t.noTasksForDay}</h3>
                <p className="text-zinc-500 mt-2 dark:text-zinc-400">{t.emptyDescription}</p>
              </div>
            )}
              </div>
            </>
          ) : (
            <div className="max-w-3xl">
              <header className="mb-8">
                <h1 className="text-4xl font-bold text-zinc-900 mb-2 tracking-tight dark:text-zinc-50">{t.trash}</h1>
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
        <section className={`w-full md:w-96 lg:w-[450px] bg-white border-zinc-200 flex flex-col h-[55vh] md:h-full relative overflow-hidden shadow-[-10px_0_30px_rgba(0,0,0,0.02)] transition-colors dark:bg-zinc-900 dark:border-zinc-800 dark:shadow-black/20 ${language === 'ar' ? 'border-r' : 'border-l'}`}>
          <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-10 dark:bg-zinc-900/85 dark:border-zinc-800">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                <MessageSquare size={20} />
              </div>
              <div>
                <span className="font-bold text-zinc-900 block leading-none dark:text-zinc-50">{t.assistantTitle}</span>
                <span className="text-[10px] text-zinc-400 font-medium uppercase mt-1 inline-block dark:text-zinc-500">{t.online}</span>
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

          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-50/30 transition-colors dark:bg-zinc-950/35"
          >
            {messages.map((msg, i) => {
               const isLastMessage = i === messages.length - 1;
               const showActions = isLastMessage && msg.role === 'assistant' && pendingTasks.length > 0;

               return (
                <div key={i} className="space-y-3">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
                  >
                    <div className={`
                      max-w-[88%] whitespace-pre-wrap break-words [overflow-wrap:anywhere] p-4 rounded-3xl text-sm leading-relaxed shadow-sm
                      ${msg.role === 'user' 
                        ? 'bg-zinc-900 text-white rounded-tr-none dark:bg-primary' 
                        : 'bg-white text-zinc-800 rounded-tl-none border border-zinc-100 dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-700'}
                    `} dir={language === 'ar' ? 'rtl' : 'ltr'}>
                      {msg.content}
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

          <div className="p-4 sm:p-6 bg-white border-t border-zinc-100 transition-colors dark:bg-zinc-900 dark:border-zinc-800">
            <div className="flex w-full items-end gap-2.5 sm:gap-3">
              <button
                onClick={toggleListening}
                disabled={isLoading}
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border transition-all disabled:opacity-40 ${
                  isListening
                    ? 'border-red-400 bg-red-50 text-red-500 shadow-md shadow-red-500/15 dark:border-red-500/40 dark:bg-red-500/10'
                    : 'border-zinc-200 bg-zinc-50 text-zinc-500 hover:border-primary hover:text-primary dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400'
                }`}
                title={isListening ? t.stopListening : t.startListening}
                aria-label={isListening ? t.stopListening : t.startListening}
              >
                <Mic size={20} className={isListening ? 'animate-pulse' : ''} />
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
                  className={`block max-h-36 min-h-12 w-full resize-none overflow-y-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-[24px] border border-zinc-200 bg-zinc-50 px-5 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/5 transition-all text-sm leading-6 group-hover:bg-white dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:group-hover:bg-zinc-950 ${language === 'ar' ? 'text-right' : 'text-left'}`}
                />
              </div>
              <button
                onClick={handleSend}
                disabled={isLoading || !inputValue.trim() || isListening}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-md shadow-primary/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-30 disabled:hover:scale-100"
                aria-label={language === 'ar' ? 'إرسال' : 'Send'}
              >
                <Send size={20} />
              </button>
            </div>
            {isListening && (
              <div className="mt-3 flex items-center justify-center gap-2 text-xs font-semibold text-red-500">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                {t.listening}
              </div>
            )}
            {speechError && (
              <p className="mt-3 text-center text-xs font-medium text-red-500">{speechError}</p>
            )}
            {!isListening && !speechError && (
              <p className="text-[10px] text-center text-zinc-400 mt-4 font-medium dark:text-zinc-500">{t.inputHint}</p>
            )}
          </div>
        </section>
      </main>
      <AnimatePresence>
        {reminderToast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            className={`fixed bottom-5 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-xl shadow-black/10 dark:border-zinc-700 dark:bg-zinc-800 ${
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
            className={`fixed bottom-5 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-xl shadow-black/10 dark:border-zinc-700 dark:bg-zinc-800 ${
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
            className={`fixed bottom-20 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-xl shadow-black/10 dark:border-zinc-700 dark:bg-zinc-800 ${
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
        {showNewDayModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
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
                  className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  aria-label={t.cancel}
                >
                  <X size={20} />
                </button>
              </div>
              <div className="mt-5 max-h-64 space-y-2 overflow-y-auto pe-1 custom-scrollbar">
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
                        className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 px-3 py-3 transition-colors hover:border-primary/50 dark:border-zinc-700"
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
                  className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <CalendarPlus size={17} />
                  {t.moveToTomorrow}
                </button>
                <button
                  onClick={() => finishSelectedDay('keep')}
                  disabled={selectedNewDayTaskIds.length === 0}
                  className="rounded-lg bg-zinc-100 px-4 py-3 text-sm font-bold text-zinc-700 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  {t.keepOnToday}
                </button>
                <button
                  onClick={() => finishSelectedDay('archive-only')}
                  className="flex items-center justify-center gap-2 rounded-lg border border-zinc-200 px-4 py-3 text-sm font-bold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <Archive size={17} />
                  {t.archiveCompletedOnly}
                </button>
                <button
                  onClick={() => {
                    setShowNewDayModal(false);
                    setSelectedNewDayTaskIds([]);
                  }}
                  className="px-4 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
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
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
          >
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-lg font-bold text-zinc-900 dark:text-white">{t.editTaskTime}</h2>
                <button
                  onClick={closeTaskTimeEditor}
                  className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
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
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-800 outline-none focus:border-primary dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t.taskTime}</span>
                  <input
                    type="time"
                    value={taskTimeValue}
                    onChange={event => setTaskTimeValue(event.target.value)}
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-800 outline-none focus:border-primary dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
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
    </div>
  );
}
