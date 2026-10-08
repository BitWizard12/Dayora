
import { memo, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, pointerWithin, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, Clock3, GripVertical, Plus } from 'lucide-react'
import { taskStages } from '../data/seed'
import SectionTitle from '../components/SectionTitle'
import Avatar from '../components/Avatar'
import { filterTasks, priorities, subtaskProgress, taskLabels, todayDate } from '../services/tasks'
import { workspaceRepositories } from '../repositories/workspaceRepositories'
import '../styles/tasks.css'
import { cardEntrance } from '../styles/motion'
import { taskAssignees } from '../services/team'
const Card = memo(function Card({ task, projects, team, onOpen, onComplete, reduced }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, transition: reduced ? null : { duration: 180, easing: 'ease' } })
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? .3 : 1 }}><motion.article className={`task-card ${task.status === 'Done' ? 'task-card--completed' : ''}`} variants={cardEntrance} initial={reduced ? false : 'hidden'} animate="visible" exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.18 }}>
    <div className="task-card__top"><span className="team-tag">{task.team}</span><span className={`priority priority--${task.priority.toLowerCase()}`}><span />{task.priority}</span><button className="icon-btn task-drag" aria-label={`Drag ${task.title}`} {...attributes} {...listeners}><GripVertical size={16} /></button></div>
    <button className="task-title-button task-card__title" onClick={() => onOpen(task.id)}>{task.title}</button>
    {task.projectId && <p className="task-project">{projects.find((item) => item.id === task.projectId)?.name || 'Deleted project'}</p>}
    {task.subtasks.length > 0 && <div className="task-progress"><span>{task.subtasks.filter((item) => item.completed).length}/{task.subtasks.length} subtasks</span><progress aria-label={`${task.title} subtask completion`} max="100" value={subtaskProgress(task)} /></div>}
    <div className="task-card__bottom"><span className={`task-due ${task.dueDate && task.dueDate < todayDate() && task.status !== 'Done' ? 'task-due--soon' : ''}`}><Clock3 size={13} />{task.dueDate || task.due || 'No deadline'}</span><div className="avatar-stack">{taskAssignees(task, team).map((member, index) => <Avatar key={member.id} initials={member.initials} photo={member.photo} color={member.color || ['sage', 'peach', 'lilac', 'blue'][index % 4]} small />)}</div><button className="icon-btn task-complete" aria-label={`${task.status === 'Done' ? 'Reopen' : 'Complete'} ${task.title}`} onClick={() => onComplete(task)}><Check size={16} /></button></div>
  </motion.article></div>
})
function Column({ stage, cards, children, onCreate }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  return <section ref={setNodeRef} className={`task-column ${isOver ? 'task-column--over' : ''}`} aria-label={taskLabels[stage]}><div className="task-column__heading"><h2>{taskLabels[stage]}</h2><span>{cards.length}</span><button className="icon-btn icon-btn--tiny" aria-label={`Add task to ${taskLabels[stage]}`} onClick={() => onCreate(stage)}><Plus size={16} /></button></div><SortableContext items={cards.map((item) => item.id)} strategy={verticalListSortingStrategy}><div className="task-column__cards">{children}</div></SortableContext>{!cards.length && <div className="empty-column">Drop tasks here</div>}</section>
}
export default function TaskBoard({ tasks, projects, team = [], onOpen, onCreate }) {
  const [filters, setFilters] = useState({ view: 'All', search: '', status: '', priority: '', project: '', deadline: '' })
  const [active, setActive] = useState(null)
  const [error, setError] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const [today, setToday] = useState(todayDate)
  useEffect(() => { const timer = setInterval(() => setToday(todayDate()), 60000); return () => clearInterval(timer) }, [])
  const reduced = useReducedMotion()
  const keyboardCoordinates = (event, { context, currentCoordinates }) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) return
    event.preventDefault()
    const current = tasks.find((task) => task.id === (context.over?.id || context.active.id))
    const stage = current?.status || context.over?.id
    const cards = filterTasks(tasks, filters, today).filter((task) => task.status === stage)
    const index = Math.max(0, cards.findIndex((task) => task.id === current?.id))
    let target
    if (event.code === 'ArrowUp' || event.code === 'ArrowDown') target = cards[index + (event.code === 'ArrowDown' ? 1 : -1)]?.id
    else {
      const next = taskStages[taskStages.indexOf(stage) + (event.code === 'ArrowRight' ? 1 : -1)]
      const adjacent = filterTasks(tasks, filters, today).filter((task) => task.status === next)
      target = adjacent[Math.min(index, adjacent.length - 1)]?.id || next
    }
    const rect = context.droppableRects.get(target)
    if (rect && context.collisionRect) return { x: currentCoordinates.x + rect.left - context.collisionRect.left, y: currentCoordinates.y + rect.top - context.collisionRect.top }
  }
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }))
  const shown = useMemo(() => filterTasks(tasks, filters, today), [tasks, filters, today])
  const change = (key, value) => setFilters((previous) => ({ ...previous, [key]: value }))
  const collision = (args) => {
    if (args.pointerCoordinates) return pointerWithin(args).length ? closestCorners(args) : []
    const hits = closestCorners(args)
    const first = hits[0]
    if (taskStages.includes(first?.id) && !shown.some((task) => task.status === first.id)) return hits
    return closestCorners({ ...args, droppableContainers: args.droppableContainers.filter((container) => !taskStages.includes(container.id) && container.id !== args.active.id) })
  }
  const command = async (action, message) => { try { await action(); setError(''); setAnnouncement(message) } catch (err) { setError(err.message) } }
  return <section className="page-content" aria-label="Tasks"><SectionTitle title="Tasks" description="Make room for focused work. Drag a card or open its details to change stages." actions={<button className="button button--primary" onClick={() => onCreate('To do')}><Plus size={17} /> New Task</button>} />
    <div className="task-toolbar"><div className="filter-pills" role="group" aria-label="Daily task views">{['All', 'Today', 'Upcoming', 'Overdue', 'Completed'].map((view) => <button aria-pressed={filters.view === view} className={filters.view === view ? 'is-selected' : ''} key={view} onClick={() => change('view', view)}>{view}</button>)}</div><p aria-live="polite">{shown.length} tasks shown</p></div>
    <div className="task-filters"><label>Search tasks<input value={filters.search} onChange={(event) => change('search', event.target.value)} placeholder="Search titles, descriptions, subtasks" /></label><label>Status<select value={filters.status} onChange={(event) => change('status', event.target.value)}><option value="">All statuses</option>{Object.entries(taskLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Priority<select value={filters.priority} onChange={(event) => change('priority', event.target.value)}><option value="">All priorities</option>{priorities.map((value) => <option key={value}>{value}</option>)}</select></label><label>Project<select value={filters.project} onChange={(event) => change('project', event.target.value)}><option value="">All projects</option><option value="none">No project</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Deadline<input type="date" value={filters.deadline} onChange={(event) => change('deadline', event.target.value)} /></label><button className="button button--outline" onClick={() => setFilters({ view: 'All', search: '', status: '', priority: '', project: '', deadline: '' })}>Clear filters</button></div>
    {error && <p role="alert">{error}</p>}<p className="sr-only" role="status">{announcement}</p>
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={({ active }) => setActive(tasks.find((task) => task.id === active.id))} onDragCancel={() => setActive(null)} onDragEnd={({ active, over }) => { setActive(null); if (!over || active.id === over.id) return; const target = tasks.find((task) => task.id === over.id); const status = target?.status || over.id; command(() => workspaceRepositories.tasks.reorder(active.id, status, target?.id), `Task moved to ${taskLabels[status]}.`) }}><div className="task-board">{taskStages.map((stage) => { const cards = shown.filter((task) => task.status === stage); return <Column key={stage} stage={stage} cards={cards} onCreate={onCreate}><AnimatePresence>{cards.map((task) => <Card key={task.id} task={task} projects={projects} team={team} reduced={reduced} onOpen={onOpen} onComplete={(item) => command(() => workspaceRepositories.tasks.move(item.id, item.status === 'Done' ? 'To do' : 'Done'), item.status === 'Done' ? 'Task reopened.' : 'Task completed.')} />)}</AnimatePresence></Column> })}</div><DragOverlay dropAnimation={reduced ? null : undefined}>{active && <div className="task-card task-card--overlay">{active.title}</div>}</DragOverlay></DndContext>
  </section>
}
