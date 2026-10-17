import { Activity, CalendarDays, CircleHelp, LayoutDashboard, ListTodo, Settings as SettingsIcon, FolderKanban, NotebookPen, Mic } from 'lucide-react'

export const initialTasks = []
export const initialProjects = []
export const people = []

export const pages = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'tasks', label: 'Tasks', icon: ListTodo },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'work-log', label: 'Work Log', icon: NotebookPen },
  { id: 'meetings', label: 'Meetings', icon: Mic },
  { id: 'analytics', label: 'Analytics', icon: Activity },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
  { id: 'help', label: 'Help', icon: CircleHelp },
]

export const taskStages = ['To do', 'In progress', 'In review', 'Done']
export const weekData = [
  { day: 'Mon', done: 68, planned: 82 }, { day: 'Tue', done: 78, planned: 76 },
  { day: 'Wed', done: 92, planned: 86 }, { day: 'Thu', done: 74, planned: 90 },
  { day: 'Fri', done: 86, planned: 78 }, { day: 'Sat', done: 58, planned: 66 },
  { day: 'Sun', done: 62, planned: 72 },
]
export const activityData = [
  { day: 'Mon', tasks: 18, completed: 12 }, { day: 'Tue', tasks: 24, completed: 18 },
  { day: 'Wed', tasks: 21, completed: 17 }, { day: 'Thu', tasks: 29, completed: 22 },
  { day: 'Fri', tasks: 25, completed: 20 }, { day: 'Sat', tasks: 15, completed: 11 },
  { day: 'Sun', tasks: 19, completed: 15 },
]
