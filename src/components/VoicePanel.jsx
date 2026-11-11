import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, Mic, Square, ArrowUpRight, NotebookPen, SlidersHorizontal } from 'lucide-react'
import Modal from './Modal'
import GlassOrbit from './GlassOrbit'
import useRepository from '../hooks/useRepository'
import { workspaceRepositories } from '../repositories/workspaceRepositories'
import { createSpeechSession, createVoiceWorkspace, insertVoiceText, prepareVoiceText, tidyVoiceSpacing, voiceDefaults, voiceLanguages, voiceTaskDraft } from '../services/voice'

export default function VoicePanel({ draft, onDraftChange, target, onClose, onTaskDraft, onMeetings }) {
  const workspace = useMemo(() => createVoiceWorkspace(workspaceRepositories), [])
  const preferences = useRepository(workspace.preferences)
  const saved = preferences.data[0]?.value || voiceDefaults
  const [options, setOptions] = useState(null)
  const settings = options || saved
  const text = draft
  const setText = onDraftChange
  const [interim, setInterim] = useState('')
  const [beforeEdit, setBeforeEdit] = useState(null)
  const [review, setReview] = useState(null)
  const [state, setState] = useState('idle'), [error, setError] = useState(''), [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const session = useRef(null)
  const recording = state !== 'idle'
  const supported = !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  useEffect(() => () => session.current?.dispose(), [])

  const record = () => {
    if (recording) { setState('stopping'); session.current?.stop(); return }
    setError(''); setMessage(''); setInterim(''); setReview(null); setBeforeEdit(null)
    session.current?.dispose()
    const prefix = text.trim()
    try {
      session.current = createSpeechSession({ language: settings.language, onState: setState,
        onText: (final, partial) => { setText([prefix, final].filter(Boolean).join(' ')); setInterim(partial) },
        onError: (reason) => { setError(reason); setInterim(''); setState('idle') },
      })
      setState('starting'); session.current.start()
    } catch (err) { setError(err.message); setState('idle') }
  }
  const run = async (action, success) => {
    setBusy(true); setError(''); setMessage('')
    try { await action(); if (success) setMessage(success) } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const ready = text.trim() && !recording && !busy && !review
  const applyRules = () => { setBeforeEdit(text); setText(prepareVoiceText(text, settings)); setMessage('Text rules applied. Undo restores your original draft.') }
  const previewSpacing = () => {
    const result = tidyVoiceSpacing(text)
    setError('')
    if (result === text) { setMessage('Spacing already looks tidy. Your words are unchanged.'); return }
    setMessage(''); setReview({ original: text, result })
  }
  return <Modal title="Voice studio" description="One quiet place for your thoughts." onClose={onClose}><div className="voice-panel">
    <div className="voice-intro"><div className="voice-mini-orbit"><GlassOrbit /></div><div><span className="eyebrow">LESS TYPING. MORE CLARITY.</span><h3>Speak your next step.</h3><p>Capture a thought, then choose where it belongs.</p></div></div>
    <div className="voice-record-row"><button className={`button ${recording ? 'voice-recording' : 'button--primary'}`} onClick={record} disabled={!supported || busy || !!review || state === 'stopping'}>{recording ? <Square size={16} /> : <Mic size={17} />}{state === 'starting' ? 'Starting…' : state === 'stopping' ? 'Finishing…' : recording ? 'Stop recording' : 'Start dictation'}</button><label className="voice-language"><span className="sr-only">Dictation language</span><select aria-label="Dictation language" value={settings.language} disabled={recording || !!review} onChange={event => setOptions({ ...settings, language: event.target.value })}>{voiceLanguages.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label></div>
    <p className="voice-privacy">Starts only when you choose. Your browser’s speech service may process audio online. Dayora does not store audio from this panel.</p>
    {!supported && <p className="voice-hint">Live dictation isn’t supported here. Type or paste below to use the same actions.</p>}
    <div className="voice-editor-tools"><span>Draft stays in this tab until you reload or sign out.</span><button disabled={!ready} onClick={previewSpacing}>Tidy spacing</button>{beforeEdit !== null && <button disabled={recording || busy || !!review} onClick={() => { setText(beforeEdit); setBeforeEdit(null); setMessage('Original draft restored.') }}>Undo</button>}{text && <button disabled={recording || busy || !!review} onClick={() => { setBeforeEdit(text); setText(''); setMessage('') }}>Clear draft</button>}</div>
    <label className="voice-editor">Your draft<textarea data-initial-focus aria-label="Voice draft" rows={6} maxLength={10000} value={text} disabled={recording || busy || !!review} placeholder="Your words appear here. You can also type or paste a thought…" onChange={event => { setText(event.target.value); setBeforeEdit(null); setMessage('') }} /></label>
    {review && <section className="voice-review" aria-label="Spacing review"><div className="voice-review-heading"><Check size={16} /><h4>Review tidier spacing</h4></div><p>Only spacing changes. No AI, rewritten words, or automatic saves.</p><label className="voice-editor">Preview<textarea aria-label="Spacing preview" rows={5} value={review.result} readOnly /></label><div className="voice-actions"><button className="button button--primary" onClick={() => { setBeforeEdit(review.original); setText(review.result); setReview(null); setMessage('Spacing applied. Undo restores your original draft.') }}>Apply spacing</button><button className="button button--outline" onClick={() => { setReview(null); setMessage('Original draft kept.') }}>Keep original</button></div></section>}
    <p className="voice-status" role="status">{recording ? interim || (state === 'starting' ? 'Waiting for microphone…' : state === 'stopping' ? 'Finishing your words…' : 'Listening…') : message || `${text.trim() ? text.trim().split(/\s+/).length : 0} words · Review before using`}</p>
    <div className="voice-actions"><button className="button button--primary" disabled={!ready} onClick={() => onTaskDraft(voiceTaskDraft(text))}>Draft a task<ArrowUpRight size={16} /></button><button className="button button--outline" disabled={!ready} onClick={() => run(() => workspace.appendToNote(text), 'Added to today’s note.')}><NotebookPen size={16} /> Add to today’s note</button>{target && <button className="button button--outline" disabled={!ready} onClick={() => run(() => { insertVoiceText(target, text); onClose() })}>Insert into previous field</button>}<button className="button button--outline" disabled={!ready} onClick={() => run(() => navigator.clipboard.writeText(text), 'Copied. Paste it wherever you need.')}><Copy size={15} /> Copy</button></div>
    <details className="voice-options"><summary><SlidersHorizontal size={15} /> Personalize your voice tools</summary><p>One rule per line: <code>spoken phrase = replacement</code>. Snippets expand only when the whole draft matches their trigger; vocabulary replaces matching words. These are text rules, not AI rewriting.</p><label>Spoken shortcuts<textarea aria-label="Spoken shortcuts" rows={3} maxLength={4000} disabled={recording} value={settings.snippets} placeholder="my signature = Best regards, …" onChange={event => setOptions({ ...settings, snippets: event.target.value })} /></label><label>Vocabulary replacements<textarea aria-label="Vocabulary replacements" rows={3} maxLength={4000} disabled={recording} value={settings.vocabulary} placeholder="day aura = Dayora" onChange={event => setOptions({ ...settings, vocabulary: event.target.value })} /></label><div className="voice-actions"><button className="button button--outline" disabled={!ready} onClick={applyRules}>Apply text rules</button><button className="button button--outline" disabled={busy || recording || preferences.status !== 'ready'} onClick={() => run(async () => { await workspace.preferences.setValue(settings); setOptions(null) }, 'Voice preferences saved.')}><Check size={15} /> Save preferences</button></div></details>
    <button className="voice-meetings" disabled={recording || busy} onClick={onMeetings}>Looking for meeting transcripts? Open Meetings <ArrowUpRight size={14} /></button>
    {(error || preferences.error) && <p role="alert" className="voice-error">{error || preferences.error.message}</p>}
  </div></Modal>
}
