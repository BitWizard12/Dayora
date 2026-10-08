import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, ArrowUpRight, Check, ChevronDown, FileText, ListTodo, MessageSquare, Search, Settings as SettingsIcon, Sparkles } from 'lucide-react'

const faqs = [
  ['How do I create a new project?', 'Head to your Dashboard and choose Add Project. Give your project a name, set a due date, and invite teammates when you’re ready.'],
  ['Can I move a task between stages?', 'Absolutely. Drag a task card into another column, or open its menu to choose a new stage. Your changes save automatically.'],
  ['How do I add a team member?', 'Visit the Team page and select Invite member. They’ll be added to your workspace and ready to collaborate.'],
  ['Where can I find my project reports?', 'Open Analytics from the sidebar to see team productivity, project health, and task completion at a glance.'],
]
export default function HelpPage() {
  const [open, setOpen] = useState(0)
  const [search, setSearch] = useState('')
  const [sent, setSent] = useState(false)
  const matches = faqs.filter(([q, a]) => `${q} ${a}`.toLowerCase().includes(search.toLowerCase()))
  return <motion.section className="page-content" aria-label="Help">
    <div className="help-hero"><span className="help-spark"><Sparkles size={18} /></span><span className="eyebrow">HERE FOR YOU</span><h1>How can we help?</h1><p>Find your way around Dayora. We’re here when you need us.</p><label className="help-search"><Search size={18} /><input placeholder="Search for anything..." value={search} onChange={(e) => setSearch(e.target.value)} /><kbd>⌘ K</kbd></label></div>
    <div className="help-category-grid">{[['Getting started', 'A few helpful first steps.', '01', FileText], ['Projects & tasks', 'Keep your team’s work in sync.', '02', ListTodo], ['Your workspace', 'Make Dayora your own.', '03', SettingsIcon]].map(([title, subtitle, number, Icon]) => <button className="panel help-category" key={title} onClick={() => { setSearch(title.split(' ')[0]); setOpen(0) }}><span className="help-category__number">{number}</span><Icon size={19} /><strong>{title}</strong><span>{subtitle}</span><ArrowUpRight size={16} /></button>)}</div>
    <div className="help-lower"><article className="panel faq-panel"><div className="panel-heading"><div><h2>Frequently asked questions</h2><p>A good place to start.</p></div></div><div className="faq-list">{matches.map(([question, answer], index) => <div className={`faq-item ${open === index ? 'is-open' : ''}`} key={question}><button onClick={() => setOpen(open === index ? -1 : index)}>{question}<ChevronDown size={17} /></button><AnimatePresence>{open === index && <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>{answer}</motion.p>}</AnimatePresence></div>)}{matches.length === 0 && <p className="empty-search">No articles found. Try a different search.</p>}</div></article>
      <aside className="help-contact"><span className="contact-icon"><MessageSquare size={19} /></span><h2>Still have a question?</h2><p>We’re a real team who loves helping. Send us a note and we’ll get back to you.</p>{sent ? <div className="contact-sent"><Check size={16} /> Message sent — we’ll be in touch.</div> : <form onSubmit={(e) => { e.preventDefault(); setSent(true) }}><input required type="email" placeholder="Your email address" /><textarea required placeholder="How can we help?" rows="3" /><button className="button button--dark">Send a message <ArrowRight size={15} /></button></form>}</aside>
    </div>
  </motion.section>
}

