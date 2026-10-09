import { memo, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, ArrowUpRight, CalendarDays, Clock3, Download, Ellipsis, MoreHorizontal, Plus } from 'lucide-react'
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts'
import SectionTitle from '../components/SectionTitle'
import AnimatedNumber from '../components/AnimatedNumber'
import TimeTracker from '../components/TimeTracker'
import { cardEntrance, staggerCards } from '../styles/motion'
import { formatDeadline, projectMetrics } from '../utils/projects'
import { todayBounds } from '../utils/timer'
import '../styles/dashboard.css'
import ScheduleList from '../components/ScheduleList'
import Avatar from '../components/Avatar'
import useNow from '../hooks/useNow'
import { formatDuration } from '../utils/timer'
import { countOpenTasks, dashboardInsights, nearestProjectDeadline, projectCreationWeek, selectProjectsByStatus, taskDistribution } from '../services/dashboardSelectors'
import DailyNote from '../components/DailyNote'
import useWorkspace from '../hooks/useWorkspace'
import useAuth from '../hooks/useAuth'
import { accountWorkload } from '../services/team'

function Dashboard({ projects, tasks, events, team, timeEntries, onEntry, onMember, onNavigate, onModal, onProject }) {
  const { workspace, canManage, members } = useWorkspace()
  const { user } = useAuth()
  const [activeDay, setActiveDay] = useState(6)
  const [filter, setFilter] = useState('All')
  const [showAll, setShowAll] = useState(false)
  const reduced = useReducedMotion()
  const [dayStart] = useState(() => todayBounds(Date.now()).start)
  const now = useNow()
  const insights = useMemo(() => dashboardInsights({ events, tasks, projects, team, timeEntries }, now), [events, tasks, projects, team, timeEntries, now])
  const workload = workspace.type === 'team' ? accountWorkload(tasks, members) : insights.workload
  const metrics = useMemo(() => projectMetrics(projects), [projects])
  const taskData = useMemo(() => taskDistribution(tasks), [tasks])
  const completion = tasks.length ? Math.round(taskData.at(-1).count / tasks.length * 100) : 0
  const weekData = useMemo(() => projectCreationWeek(projects, dayStart), [projects, dayStart])
  const maximum = Math.max(1, ...weekData.map((d) => d.count))
  const nearest = useMemo(() => nearestProjectDeadline(projects), [projects])
  const filtered = selectProjectsByStatus(projects, filter)
  const stats = [
    { label: 'Total Projects', value: metrics.total, note: 'All projects in your workspace', tone: 'sage', filter: 'All' },
    { label: 'Ended Projects', value: metrics.completed, note: 'Completed projects', filter: 'Completed' },
    { label: 'Running Projects', value: metrics.running, note: 'Currently in progress', filter: 'In progress' },
    { label: 'Pending Projects', value: metrics.pending, note: 'Waiting to get started', filter: 'Pending' },
  ]
  const chooseFilter = (value) => { setFilter(value); setShowAll(true); document.getElementById('dashboard-projects')?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'center' }) }
  return <section className="page-content" aria-label="Dashboard">
    <SectionTitle title="Dashboard" description={workspace.type === 'team' ? 'Everything your team is building, in one clear place.' : 'Your plans, your focus, your next little step.'} actions={canManage && <><button className="button button--primary" onClick={() => onModal('project')}><Plus size={17} /> Add Project</button><button className="button button--outline" onClick={() => onModal('import')}><Download size={16} /> Import Data</button></>} />
    <div className="dashboard-welcome"><div><span className="eyebrow">{workspace.type === 'team' ? workspace.name : 'MAKE TODAY YOURS'}</span><h2>{user ? `A fresh perspective, ${user.name.split(' ')[0]}.` : 'A little clarity for your day.'}</h2><p>{workspace.type === 'team' ? 'A shared space for ideas to become progress.' : 'Make space for the work that matters to you.'}</p></div><span className="welcome-leaf" aria-hidden="true">✦</span></div>
    <motion.div variants={staggerCards} initial="hidden" animate="visible">
      <div className="stats-grid">{stats.map((stat) => <motion.article key={stat.label} className={`stat-card ${stat.tone ? 'stat-card--sage' : ''}`} variants={cardEntrance} whileHover={reduced ? undefined : { y: -2 }}>
        <div className="stat-card__top"><h2>{stat.label}</h2><button className="round-link" aria-label={`Show ${stat.label.toLowerCase()}`} onClick={() => chooseFilter(stat.filter)}><ArrowUpRight size={17} /></button></div><AnimatedNumber className="stat-card__number" value={stat.value} /><p className="stat-card__caption">{stat.note}</p>
      </motion.article>)}</div>
      <div className="dashboard-grid">
        <motion.article variants={cardEntrance} className="panel analytics-card">
          <div className="panel-heading"><div><h2>Project Analytics</h2><p>Projects created over the last seven days. Existing projects without creation dates aren't included.</p></div><button className="icon-btn" aria-label="Open analytics" onClick={() => onNavigate('analytics')}><Ellipsis size={20} /></button></div>
          <div className="week-chart" role="group" aria-label="Projects created by day">{weekData.map((day, index) => <button key={index} className={`week-chart__day ${index === activeDay ? 'is-active' : ''}`} aria-pressed={index === activeDay} aria-label={`${day.day}, ${day.count} projects created`} onClick={() => setActiveDay(index)}>
            <span className="week-chart__value">{index === activeDay ? day.count : ''}</span><span className="week-chart__bar"><motion.i className="week-chart__filled" initial={{ height: 0 }} animate={{ height: `${day.count / maximum * 100}%` }} transition={{ duration: reduced ? 0 : 0.55 }} /></span><span className="week-chart__label">{day.day[0]}</span>
          </button>)}</div>
        </motion.article>
        <motion.article variants={cardEntrance} className="panel reminder-card">
          <div className="reminder-card__top"><span className="reminder-icon"><CalendarDays size={17} /></span><span className="eyebrow">NEXT PROJECT DEADLINE</span><button className="icon-btn" aria-label="Add calendar event" onClick={() => onModal('event')}><Plus size={18} /></button></div>
          <h2>{nearest?.name || 'A little room to plan ahead.'}</h2><p className="reminder-time"><Clock3 size={14} />{nearest ? formatDeadline(nearest.deadline) : 'No upcoming project deadlines'}</p>
          <div className="reminder-card__bottom"><span className="project-status">{nearest?.status || 'Your workspace is clear'}</span><button className="button button--dark" onClick={() => nearest ? onProject(nearest.id) : onModal('project')}>{nearest ? 'View project' : 'Create project'}<ArrowRight size={14} /></button></div>
        </motion.article>
      </div>
      <div className="dashboard-bottom">
        <motion.article variants={cardEntrance} className="panel projects-panel" id="dashboard-projects">
          <div className="panel-heading"><div><h2>{workspace.type === 'team' ? 'Projects' : 'My Projects'}</h2><p>{workspace.type === 'team' ? 'Your team’s work' : 'Plans taking shape'}</p></div>{canManage && <button className="button button--soft button--small" onClick={() => onModal('project')}><Plus size={15} /> New</button>}</div>
          <label className="project-filter">Status<select aria-label="Filter projects by status" value={filter} onChange={(e) => setFilter(e.target.value)}>{['All', 'Pending', 'In progress', 'Completed'].map((status) => <option key={status}>{status}</option>)}</select></label>
          <ul className="project-list">{(showAll ? filtered : filtered.slice(0, 4)).map((project) => <motion.li layout={!reduced} key={project.id}>
            <button className="project-open" onClick={() => onProject(project.id)}><span className={`project-symbol project-symbol--${project.color || 'sage'}`}>{project.initials || 'NC'}</span><span className="project-list__name"><strong>{project.name}</strong><span>Due date: <time dateTime={project.deadline}>{formatDeadline(project.deadline)}</time></span></span><span className={`project-status project-status--${project.status === 'Completed' ? 'green' : project.status === 'Pending' ? 'yellow' : 'blue'}`}>{project.status}</span><MoreHorizontal size={18} /></button>
            <div className="project-task-progress"><progress aria-label={`${project.name} task progress`} max="100" value={insights.projects.find((item) => item.id === project.id)?.progress || 0} /><span>{insights.projects.find((item) => item.id === project.id)?.completed || 0}/{insights.projects.find((item) => item.id === project.id)?.total || 0} tasks completed</span></div>
          </motion.li>)}</ul>
          {!filtered.length && <p className="empty-search">No projects in this view. Create a project or change the status filter.</p>}
          <button className="text-link" onClick={() => { setShowAll(!showAll); setFilter('All') }}>{showAll ? 'Show fewer projects' : 'View all projects'}<ArrowRight size={14} /></button>
        </motion.article>
        <motion.article variants={cardEntrance} className="panel activity-panel">
          <div className="panel-heading"><div><h2>{workspace.type === 'team' ? 'Team activity' : 'My Progress'}</h2><p>Current task distribution</p></div><button className="icon-btn" aria-label="Open tasks" onClick={() => onNavigate('tasks')}><ArrowUpRight size={17} /></button></div>
          <div className="activity-summary"><AnimatedNumber value={completion} className="activity-completion" /><strong>%</strong><span>{taskData.at(-1).count} of {tasks.length} tasks completed</span></div>
          <div className="dashboard-progress" role="progressbar" aria-label="Task completion" aria-valuenow={completion} aria-valuemin={0} aria-valuemax={100}><motion.i initial={{ width: 0 }} animate={{ width: `${completion}%` }} transition={{ duration: reduced ? 0 : 0.6 }} /></div>
          <div className="mini-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={taskData} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}><defs><linearGradient id="miniFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} /><stop offset="95%" stopColor="var(--accent)" stopOpacity={0} /></linearGradient></defs><Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload.status} contentStyle={{ borderRadius: 12, border: '1px solid var(--line)' }} /><Area name="Tasks" isAnimationActive={!reduced} animationDuration={650} type="monotone" dataKey="count" stroke="var(--accent)" strokeWidth={2.5} fill="url(#miniFill)" /></AreaChart></ResponsiveContainer></div>
          <div className="mini-chart__labels">{taskData.map((d) => <span key={d.status}>{d.status}</span>)}</div>
        </motion.article>
      </div>
      <div className="dashboard-timer-row"><TimeTracker projects={projects} tasks={tasks} /><div className="dashboard-personal-column"><DailyNote /><motion.article variants={cardEntrance} className="panel dashboard-quick-actions"><h2>Keep things moving</h2><p>A little progress, every day.</p><button className="button button--outline" onClick={() => onModal('task')}><Plus size={15} /> Create task</button><button className="button button--outline" onClick={() => onModal('event')}><CalendarDays size={15} /> Add event</button><button className="button button--outline" onClick={() => onNavigate('work-log')}>Open my work log<ArrowRight size={15} /></button><button className="button button--outline" onClick={() => onNavigate('tasks')}>Review {countOpenTasks(tasks)} open tasks<ArrowRight size={15} /></button></motion.article></div></div>
      <div className="dashboard-phase4"><motion.article variants={cardEntrance} className="panel phase4-panel"><div className="panel-heading"><div><h2>Upcoming calendar</h2><p>Meetings and deadlines from your workspace.</p></div><button className="text-link" onClick={() => onNavigate('calendar')}>Calendar <ArrowRight size={14} /></button></div><ScheduleList entries={insights.upcoming} onEntry={onEntry} /></motion.article><motion.article variants={cardEntrance} className="panel phase4-panel"><div className="panel-heading"><div><h2>Team workload</h2><p>Open tasks from actual assignments.</p></div><button className="text-link" onClick={() => onNavigate('team')}>Team <ArrowRight size={14} /></button></div>{workload.slice(0, 4).map((member) => <div className="progress-row" key={member.id}><Avatar initials={member.initials} color={member.color} photo={member.photo} /><button className="progress-row__name phase4-person-link" onClick={() => workspace.type === 'team' ? onNavigate('team') : onMember(member.id)}><strong>{member.name}</strong><span>{member.completed}/{member.total} completed</span></button><b>{member.pending} open</b></div>)}<p className="saved-time-note">Saved tracked time: <strong>{formatDuration(insights.savedTime)}</strong></p></motion.article></div>
    </motion.div>
  </section>
}

export default memo(Dashboard)
