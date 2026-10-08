import { Activity, CalendarDays, CircleHelp, LayoutDashboard, ListTodo, Settings as SettingsIcon, Users } from 'lucide-react'

export const initialTasks = [
  { id: 1, title: 'Saved filters for projects', team: 'Frontend', priority: 'Medium', due: 'In 6 days', comments: 2, assignees: ['HK', 'NC'], status: 'To do' },
  { id: 2, title: 'Write API endpoint docs', team: 'Backend', priority: 'Low', due: 'In 9 days', comments: 1, assignees: ['MS'], status: 'To do' },
  { id: 3, title: 'Onboarding email sequence', team: 'Marketing', priority: 'Low', due: 'In 12 days', comments: 0, assignees: ['LR', 'NB'], status: 'To do' },
  { id: 4, title: 'Cut LCP under 2 seconds', team: 'Frontend', priority: 'High', due: 'In 5 days', comments: 3, assignees: ['OM'], status: 'To do' },
  { id: 5, title: 'Design login & sign-up screens', team: 'Design', priority: 'High', due: 'In 2 days', comments: 4, assignees: ['PR', 'MK'], status: 'In progress' },
  { id: 6, title: 'Payment retry flow', team: 'Backend', priority: 'High', due: 'Today', comments: 5, assignees: ['MS', 'HK'], status: 'In progress' },
  { id: 7, title: 'Review mobile navigation', team: 'Design', priority: 'Medium', due: 'In 3 days', comments: 2, assignees: ['MK'], status: 'In progress' },
  { id: 8, title: 'Update customer success playbook', team: 'Marketing', priority: 'Low', due: 'In 8 days', comments: 1, assignees: ['NB'], status: 'In progress' },
  { id: 9, title: 'Audit workspace permissions', team: 'Backend', priority: 'Medium', due: 'Today', comments: 2, assignees: ['OM'], status: 'In review' },
  { id: 10, title: 'Q3 product launch page', team: 'Marketing', priority: 'High', due: 'Tomorrow', comments: 6, assignees: ['LR', 'NB'], status: 'In review' },
  { id: 11, title: 'Polish empty states', team: 'Design', priority: 'Low', due: 'In 4 days', comments: 1, assignees: ['PR'], status: 'In review' },
  { id: 12, title: 'Add invoice export', team: 'Frontend', priority: 'Medium', due: 'In 6 days', comments: 3, assignees: ['HK'], status: 'Done' },
  { id: 13, title: 'Set up error monitoring', team: 'Backend', priority: 'High', due: 'Yesterday', comments: 2, assignees: ['MS'], status: 'Done' },
]

export const initialProjects = [
  { name: 'Payments API v2', due: 'Oct 8, 2026', initials: 'MS', color: 'blue' },
  { name: 'Mobile Onboarding', due: 'Oct 12, 2026', initials: 'PR', color: 'peach' },
  { name: 'Design System Audit', due: 'Oct 15, 2026', initials: 'MK', color: 'lilac' },
]
export const people = [
  { name: 'Noah Castell', role: 'Product lead', initials: 'NC', color: 'sage', email: 'noah@dayora.team' },
  { name: 'Priya Raman', role: 'Product designer', initials: 'PR', color: 'peach', email: 'priya@dayora.team' },
  { name: 'Hana Kobayashi', role: 'Frontend engineer', initials: 'HK', color: 'lilac', email: 'hana@dayora.team' },
  { name: 'Mateo Silva', role: 'Backend engineer', initials: 'MS', color: 'blue', email: 'mateo@dayora.team' },
  { name: 'Liam Reyes', role: 'Marketing', initials: 'LR', color: 'yellow', email: 'liam@dayora.team' },
]
export const pages = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'tasks', label: 'Tasks', icon: ListTodo, badge: '13' },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'analytics', label: 'Analytics', icon: Activity },
  { id: 'team', label: 'Team', icon: Users },
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

