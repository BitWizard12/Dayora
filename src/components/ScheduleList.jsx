import { CalendarDays, CheckSquare, Flag } from 'lucide-react'
import { calendarKinds } from '../services/calendar'
const icons = { meeting: CalendarDays, task: CheckSquare, project: Flag }
export default function ScheduleList({ entries, onEntry, empty = 'Nothing scheduled. A little room to plan ahead.' }) {
  return <div className="phase4-schedule">{entries.length ? entries.map((entry) => { const Icon = icons[entry.kind]; return <button key={entry.id} className={`schedule-entry schedule-entry--${entry.kind}`} onClick={() => onEntry(entry)}><span className="schedule-icon"><Icon size={17} /></span><span><strong>{entry.title}</strong><small>{calendarKinds[entry.kind]} · {entry.date} · {entry.displayTime}</small></span></button> }) : <p className="empty-search">{empty}</p>}</div>
}
