import { calendarEntries, upcomingEntries } from './calendar.js'
import { projectPerformance, savedTrackedTime } from './analytics.js'
import { teamWorkload } from './team.js'

export const taskDistribution = (tasks) => ['To do', 'In progress', 'In review', 'Done'].map((status) => ({ status, count: tasks.filter((task) => task.status === status).length }))
export const selectProjectsByStatus = (projects, status) => projects.filter((project) => status === 'All' || project.status === status)
export const nearestProjectDeadline = (projects) => [...projects].filter((project) => project.deadline && project.status !== 'Completed').sort((a, b) => a.deadline.localeCompare(b.deadline))[0]
export const countOpenTasks = (tasks) => tasks.filter((task) => task.status !== 'Done').length
export function dashboardInsights({ events, tasks, projects, team, timeEntries }, now = Date.now()) {
  return { upcoming: upcomingEntries(calendarEntries(events, tasks, projects), now).slice(0, 5), workload: teamWorkload(tasks, team),
    projects: projectPerformance(tasks, projects, timeEntries), savedTime: savedTrackedTime(timeEntries) }
}

export function projectCreationWeek(projects, dayStart) {
  return Array.from({ length: 7 }, (_, index) => {
    const day = dayStart - (6 - index) * 86400000
    return { day: new Date(day).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Kolkata' }),
      count: projects.filter((project) => project.createdAt >= day && project.createdAt < day + 86400000).length }
  })
}
