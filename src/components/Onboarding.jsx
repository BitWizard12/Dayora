import { useState } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, Leaf, Users, Plus, KeyRound } from 'lucide-react'
import { workspaceService } from '../services/workspaceService'
import { cardEntrance, staggerCards } from '../styles/motion'
import useAuth from '../hooks/useAuth'

export default function Onboarding({ onComplete, teamOnly = false }) {
  const { user } = useAuth()
  const [step, setStep] = useState(teamOnly ? 'team' : 'choice'), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const run = async (operation) => { setBusy(true); setError(''); try { const next = await operation(); await onComplete(next) } catch (err) { setError(err.message) } finally { setBusy(false) } }
  const content = <motion.div className="onboarding-content" variants={staggerCards} initial="hidden" animate="visible">
    <span className="eyebrow">{step === 'choice' ? 'HOW WILL YOU USE DAYORA?' : 'A SPACE FOR YOUR TEAM'}</span>
    <h1>{step === 'choice' ? `Welcome to Dayora, ${user.name.split(' ')[0]}.` : step === 'team' ? 'Good work starts together.' : step === 'create' ? 'Create your team.' : 'Join your team.'}</h1>
    <p>{step === 'choice' ? 'Choose how you want to work. Your personal space is always yours.' : 'Shared projects, a clear plan, and progress you can see.'}</p>
    {(step === 'choice' || step === 'team') && <div className="onboarding-choices">
      <motion.button variants={cardEntrance} className="onboarding-choice" disabled={busy} onClick={() => step === 'choice' ? run(async () => { await workspaceService.completeIndividual() }) : setStep('create')}>
        <span className="choice-icon">{step === 'choice' ? <Leaf size={26} /> : <Plus size={26} />}</span><h2>{step === 'choice' ? 'Individual' : 'Create a Team'}</h2><p>{step === 'choice' ? 'Plan your day, track your focus and build better routines.' : 'Give your team a home. You’ll become its owner.'}</p><strong>{step === 'choice' ? 'Individual workspace' : 'Start your team'}<ArrowRight size={18} /></strong>
      </motion.button>
      <motion.button variants={cardEntrance} className="onboarding-choice" disabled={busy} onClick={() => setStep(step === 'choice' ? 'team' : 'join')}>
        <span className="choice-icon">{step === 'choice' ? <Users size={26} /> : <KeyRound size={26} />}</span><h2>{step === 'choice' ? 'Team' : 'Join a Team'}</h2><p>{step === 'choice' ? 'Organize projects, tasks and progress together.' : 'Use the private invitation your team owner shared with you.'}</p><strong>{step === 'choice' ? 'Team workspace' : 'Enter your invite'}<ArrowRight size={18} /></strong>
      </motion.button>
    </div>}
    {(step === 'create' || step === 'join') && <form className="modal-form onboarding-form" onSubmit={(event) => { event.preventDefault(); const input = new FormData(event.currentTarget); run(() => step === 'create' ? workspaceService.create(input.get('name')) : workspaceService.join(input.get('token'))) }}>
      {step === 'create' ? <label>Team name<input name="name" required maxLength={100} placeholder="Campion Robotics" autoFocus /></label> : <label>Invite code<input name="token" required maxLength={43} placeholder="Paste your private invite code" autoComplete="off" autoFocus /></label>}
      <button className="button button--primary" disabled={busy}>{busy ? 'Opening your space…' : step === 'create' ? 'Create team workspace' : 'Join team workspace'}<ArrowRight size={17} /></button>
    </form>}
    {error && <p role="alert">{error}</p>}
    {step !== 'choice' && (!teamOnly || step !== 'team') && <button className="text-link" disabled={busy} onClick={() => setStep(step === 'team' ? 'choice' : 'team')}>Back</button>}
    <p className="onboarding-footnote">You can create or join a team later from the workspace switcher.</p>
  </motion.div>
  return teamOnly ? content : <div className="onboarding-shell"><aside className="onboarding-brand"><span className="brand">Dayora.</span><h2>A little clarity.<br />A lot of possibility.</h2><p>Your Day, Your Way.</p><div className="onboarding-orbit" aria-hidden="true" /></aside>{content}</div>
}
