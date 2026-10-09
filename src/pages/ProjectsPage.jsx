import { useState } from 'react'
import { motion } from 'motion/react'
import { ArrowUpRight, Plus, Sprout } from 'lucide-react'
import SectionTitle from '../components/SectionTitle'
import useWorkspace from '../hooks/useWorkspace'
import { formatDeadline } from '../utils/projects'
import { cardEntrance, staggerCards } from '../styles/motion'

export default function ProjectsPage({ projects, tasks, onProject, onCreate }) {
  const { workspace, canManage } = useWorkspace(), [filter, setFilter] = useState('All')
  const visible = projects.filter((project) => filter === 'All' || project.status === filter)
  return <section className="page-content"><SectionTitle title="Projects" description={workspace.type === 'team' ? 'Shared goals, clear progress, and the next step.' : 'Your ideas, with a little room to grow.'} actions={canManage && <button className="button button--primary" onClick={onCreate}><Plus size={18} /> Add Project</button>} />
    <label className="project-filter">Status<select aria-label="Filter projects by status" value={filter} onChange={(event) => setFilter(event.target.value)}>{['All', 'Pending', 'In progress', 'Completed'].map((status) => <option key={status}>{status}</option>)}</select></label>
    <motion.div className="project-card-grid" variants={staggerCards} initial="hidden" animate="visible">{visible.map((project) => {
      const linked = tasks.filter((task) => task.projectId === project.id), complete = linked.filter((task) => task.status === 'Done').length
      return <motion.article className="panel project-card" variants={cardEntrance} key={project.id}><div className="panel-heading"><span className={`project-symbol project-symbol--${project.color || 'sage'}`}>{project.initials}</span><span className="project-status">{project.status}</span></div><button className="project-card-title" onClick={() => onProject(project.id)}><h2>{project.name}</h2><ArrowUpRight size={20} /></button><p>{project.description || 'A fresh start. Add the next task and keep moving.'}</p><div className="project-card-progress"><span>{complete} of {linked.length} tasks complete</span><progress max="100" value={linked.length ? complete / linked.length * 100 : 0} /></div><div className="project-card-footer"><span>{formatDeadline(project.deadline)}</span><button className="text-link" onClick={() => onProject(project.id)}>View project</button></div></motion.article>
    })}</motion.div>
    {!visible.length && <div className="panel work-log-empty"><Sprout size={36} /><h2>A new idea starts here.</h2><p>{canManage ? 'Create a project to turn your plans into progress.' : 'Your team owner can create projects for the team.'}</p></div>}
  </section>
}
