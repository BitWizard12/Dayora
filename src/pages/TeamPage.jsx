
import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Plus } from 'lucide-react'
import Avatar from '../components/Avatar'
import SectionTitle from '../components/SectionTitle'
import { departments, teamWorkload } from '../services/team'
import { cardEntrance, staggerCards } from '../styles/motion'
import TeamMembership from '../components/TeamMembership'
import useWorkspace from '../hooks/useWorkspace'
export default function TeamPage({ team, tasks, onMember }) {
  const { workspace, canManage } = useWorkspace()
  const [query, setQuery] = useState(''), [department, setDepartment] = useState('')
  const reduced = useReducedMotion()
  const workload = useMemo(() => teamWorkload(tasks, team), [tasks, team])
  const members = workload.filter((person) => (!department || person.department === department) && `${person.name} ${person.role} ${person.email}`.toLowerCase().includes(query.toLowerCase()))
  const maximum = Math.max(1, ...workload.map((person) => person.pending))
  return <section className="page-content" aria-label="Team"><SectionTitle title="Team" description={workspace.type === 'team' ? 'Your people, your projects, your shared progress.' : 'Your workspace contacts. Create or join a team from the workspace switcher.'} actions={canManage && <button className="button button--primary" onClick={() => onMember()}><Plus size={17} /> Add {workspace.type === 'team' ? 'contact' : 'member'}</button>} />
    {workspace.type === 'team' && <><TeamMembership tasks={tasks} /><div className="contact-section-heading"><h2>Team contacts & profiles</h2><p>Reference profiles for assignments. These records do not grant account access.</p></div></>}
    <div className="team-summary"><div className="team-summary__copy"><span className="eyebrow">YOUR PEOPLE</span><h2>Great work is a team sport.</h2><p>Make space for good ideas and the people who make them happen.</p></div><div className="team-summary__avatars">{team.slice(0, 5).map((person) => <Avatar key={person.id} initials={person.initials} color={person.color} photo={person.photo} />)}</div><div className="team-summary__stat"><strong>{team.length}</strong><span>contact profiles</span></div></div>
    <div className="phase4-filters"><label>Search team<input placeholder="Search name, email, or role" value={query} onChange={(e) => setQuery(e.target.value)} /></label><label>Department<select value={department} onChange={(e) => setDepartment(e.target.value)}><option value="">All departments</option>{departments.map((value) => <option key={value}>{value}</option>)}</select></label></div>
    <motion.div className="member-grid" variants={staggerCards} initial="hidden" animate="visible">{members.map((person) => <motion.article key={person.id} className="panel member-card" variants={cardEntrance} layout={!reduced} whileHover={reduced ? undefined : { y: -2 }}><button className="member-card-open" aria-label={`View ${person.name}`} onClick={() => onMember(person.id)}><Avatar initials={person.initials} color={person.color} photo={person.photo} /><span><strong>{person.name}</strong><small>{person.role}</small></span></button><p className="member-email">{person.email}</p><span className="team-tag">{person.department}</span><div className="member-stats"><span><b>{person.total}</b> assigned</span><span><b>{person.completed}</b> completed</span><span><b>{person.pending}</b> open</span></div><div className="member-workload"><span>Open workload</span><motion.i initial={{ width: 0 }} animate={{ width: `${person.pending / maximum * 100}%` }} transition={{ duration: reduced ? 0 : .4 }} /></div><label className="member-progress">Completion {person.progress}%<progress aria-label={`${person.name} completion`} value={person.progress} max="100" /></label></motion.article>)}</motion.div>
    {!members.length && <p className="empty-search">No contacts match these filters.</p>}<p className="team-footer">Showing {members.length} of {team.length} contacts. Open a profile to manage assignments.</p>
  </section>
}
