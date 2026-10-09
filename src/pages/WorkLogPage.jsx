import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { Clock3, Pencil, Sprout } from 'lucide-react'
import SectionTitle from '../components/SectionTitle'
import TimeTracker from '../components/TimeTracker'
import WorkLogDialog from '../components/WorkLogDialog'
import DailyNote from '../components/DailyNote'
import useNow from '../hooks/useNow'
import useAuth from '../hooks/useAuth'
import useWorkspace from '../hooks/useWorkspace'
import { focusedToday, groupWorkLog, logDate, sessionDuration } from '../services/workLog'
import { formatDuration } from '../utils/timer'
import { cardEntrance, staggerCards } from '../styles/motion'

const clock = (timestamp) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }).format(timestamp)
export default function WorkLogPage({ entries, projects, tasks }) {
  const { user } = useAuth(), { workspace, members } = useWorkspace()
  const [editing, setEditing] = useState(null), [view, setView] = useState('mine')
  const now = useNow(), today = logDate(now)
  const own = entries.filter((entry) => !entry.authorId || entry.authorId === user?.id)
  const visible = view === 'team' ? entries : own
  const groups = useMemo(() => groupWorkLog(visible), [visible])
  const sessionsToday = own.filter((entry) => logDate(entry.startedAt) === today).length
  return <section className="page-content" aria-label="Work Log"><SectionTitle title="Work Log" description="A record of your focus, and the work behind it." />
    <div className="work-log-summary"><div className="panel"><span>My focus today</span><strong>{formatDuration(focusedToday(own, now))}</strong><small>Active time, excluding pauses · IST</small></div><div className="panel"><span>My sessions today</span><strong>{sessionsToday}</strong><small>Small steps add up.</small></div></div>
    <div className="work-log-tools"><TimeTracker projects={projects} tasks={tasks} /><DailyNote /></div>
    <div className="work-log-heading"><h2>{view === 'mine' ? 'My daily log' : 'Team daily log'}</h2>{workspace.type === 'team' && <label>Show<select aria-label="Work log view" value={view} onChange={(event) => setView(event.target.value)}><option value="mine">My sessions</option><option value="team">Team sessions</option></select></label>}</div>
    <motion.div variants={staggerCards} initial="hidden" animate="visible">{groups.map((group) => <section className="log-day" key={group.date}><h3>{group.date === today ? 'Today' : new Intl.DateTimeFormat('en-IN', { dateStyle: 'full', timeZone: 'Asia/Kolkata' }).format(Date.parse(`${group.date}T12:00:00+05:30`))}</h3><div className="log-entries">{group.records.map((entry) => <motion.article variants={cardEntrance} className="panel log-entry" key={entry.id}>
      <div className="log-entry-time"><Clock3 size={18} /><span>{clock(entry.startedAt)} – {entry.endedAt === null ? entry.runningSince === null ? 'Paused' : 'Now' : clock(entry.endedAt)}</span><strong>{formatDuration(sessionDuration(entry, now))}</strong></div>
      <div className="log-entry-copy"><h4>{entry.title || entry.label || 'Focus session'}</h4><p className="log-links">{projects.find((project) => project.id === entry.projectId)?.name || (entry.projectId ? entry.label : 'Personal focus')}{entry.taskId && <> · {tasks.find((task) => task.id === entry.taskId)?.title || 'Archived task'}</>}{view === 'team' && <> · {members.find((member) => member.id === entry.authorId)?.name || 'Former member'}</>}</p><p className="log-note">{entry.note || 'Add a note to remember what moved forward.'}</p></div>
      {(!entry.authorId || entry.authorId === user?.id) && <button className="icon-btn" aria-label={`Edit work log ${entry.title || entry.label}`} onClick={() => setEditing(entry)}><Pencil size={18} /></button>}
    </motion.article>)}</div></section>)}</motion.div>
    {!groups.length && <div className="panel work-log-empty"><Sprout size={36} /><h2>Make a little room for focus.</h2><p>Start your first session above. Your time and notes will find a home here.</p></div>}
    {editing && <WorkLogDialog entry={editing} projects={projects} tasks={tasks} onClose={() => setEditing(null)} />}
  </section>
}
