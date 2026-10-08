
import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import SectionTitle from '../components/SectionTitle'
import ScheduleList from '../components/ScheduleList'
import { calendarDates, calendarEntries, calendarKinds, dateInZone, defaultTimeZone, entriesOnDate, filterCalendar, shiftDate, upcomingEntries } from '../services/calendar'
import { cardEntrance } from '../styles/motion'
import useNow from '../hooks/useNow'

const zones = [...new Set([defaultTimeZone, 'UTC', Intl.DateTimeFormat().resolvedOptions().timeZone, ...(Intl.supportedValuesOf?.('timeZone') || ['America/New_York', 'Europe/London'])])]
export default function CalendarPage({ events, tasks, projects, onCreate, onEntry }) {
  const now = useNow(), reduced = useReducedMotion()
  const [zone, setZone] = useState(defaultTimeZone), [anchor, setAnchor] = useState(() => dateInZone()), [view, setView] = useState('Month')
  const [search, setSearch] = useState(''), [kind, setKind] = useState(''), [projectId, setProjectId] = useState('')
  const today = dateInZone(now, zone)
  const entries = useMemo(() => filterCalendar(calendarEntries(events, tasks, projects, zone), { search, kind, projectId }), [events, tasks, projects, zone, search, kind, projectId])
  const dates = useMemo(() => calendarDates(anchor, view), [anchor, view])
  const heading = new Intl.DateTimeFormat('en', { timeZone: 'UTC', month: 'long', year: 'numeric', ...(view === 'Month' ? {} : { day: 'numeric' }) }).format(new Date(`${anchor}T12:00:00Z`))
  const navigate = (amount) => setAnchor(shiftDate(anchor, view === 'Month' ? { months: amount } : { days: amount * (view === 'Week' ? 7 : 1) }))
  return <section className="page-content" aria-label="Calendar"><SectionTitle title="Calendar" description="A clear view of meetings, task deadlines, and project milestones." actions={<button className="button button--primary" onClick={() => onCreate(anchor, zone)}><Plus size={17} /> New event</button>} />
    <div className="phase4-filters"><label>Search calendar<input placeholder="Search events and deadlines" value={search} onChange={(e) => setSearch(e.target.value)} /></label><label>Entry type<select value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All entries</option>{Object.entries(calendarKinds).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Calendar project<select value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">All projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label>Display timezone<select value={zone} onChange={(e) => setZone(e.target.value)}>{zones.map((item) => <option key={item}>{item}</option>)}</select></label></div>
    <div className="panel calendar-panel"><div className="calendar-toolbar"><div className="calendar-toolbar__month"><button className="icon-btn" aria-label={`Previous ${view.toLowerCase()}`} onClick={() => navigate(-1)}><ChevronLeft size={18} /></button><h2 aria-live="polite">{heading}</h2><button className="icon-btn" aria-label={`Next ${view.toLowerCase()}`} onClick={() => navigate(1)}><ChevronRight size={18} /></button><button className="button button--soft button--small" onClick={() => setAnchor(today)}>Today</button></div><div className="view-switch" role="group" aria-label="Calendar view">{['Month', 'Week', 'Day'].map((item) => <button aria-pressed={view === item} className={view === item ? 'is-selected' : ''} key={item} onClick={() => setView(item)}>{item}</button>)}</div></div>
      <div className="calendar-legend">{Object.entries(calendarKinds).map(([value, label]) => <span key={value}><i className={`entry-dot entry-dot--${value}`} />{label}</span>)}</div>
      <AnimatePresence mode="wait" initial={false}><motion.div key={`${anchor}-${view}-${zone}`} className={`calendar-grid calendar-phase4 calendar-view--${view.toLowerCase()}`} variants={cardEntrance} initial={reduced ? false : 'hidden'} animate="visible" exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .15 }}>
        {view === 'Month' && <div className="calendar-weekdays">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}</div>}
        <div className="calendar-days">{dates.map((date) => { const items = entriesOnDate(entries, date); return <div key={date} data-date={date} className={`calendar-day ${date.slice(0, 7) !== anchor.slice(0, 7) ? 'calendar-day--muted' : ''} ${date === today ? 'calendar-day--today' : ''}`}><button className="calendar-date-button" aria-label={`View ${date}`} aria-current={date === today ? 'date' : undefined} onClick={() => { setAnchor(date); setView('Day') }}>{view === 'Month' ? Number(date.slice(-2)) : new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))}</button>
          {(view === 'Month' ? items.slice(0, 3) : items).map((entry) => <button key={entry.id} className={`calendar-event calendar-event--${entry.color || 'sage'} calendar-entry--${entry.kind} ${entry.completed ? 'calendar-entry--completed' : ''}`} aria-label={`${calendarKinds[entry.kind]}: ${entry.title}`} title={`${entry.title} · ${entry.displayTime}`} onClick={() => onEntry(entry)}><i className={`entry-dot entry-dot--${entry.kind}`} />{entry.date < date ? 'Continues · ' : entry.displayTime !== 'Deadline' && entry.displayTime !== 'All day' ? `${entry.displayTime} · ` : ''}{entry.title}</button>)}
          {view === 'Month' && items.length > 3 && <button className="calendar-more" onClick={() => { setAnchor(date); setView('Day') }}>+{items.length - 3} more</button>}{view !== 'Month' && <button className="text-link calendar-add" aria-label={`Add event on ${date}`} onClick={() => onCreate(date, zone)}><Plus size={13} />Add event</button>}
        </div> })}</div>
      </motion.div></AnimatePresence>
    </div><div className="calendar-lower"><article className="panel phase4-panel"><div className="panel-heading"><div><h2>Today's schedule</h2><p>{today} · {zone}</p></div></div><ScheduleList entries={entriesOnDate(entries, today)} onEntry={onEntry} /></article><article className="panel phase4-panel"><div className="panel-heading"><div><h2>Upcoming</h2><p>Your next meetings and deadlines.</p></div></div><ScheduleList entries={upcomingEntries(entries, now, zone).slice(0, 8)} onEntry={onEntry} /></article></div>
  </section>
}
