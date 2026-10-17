import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioLines, Check, ChevronDown, Clock3, FileAudio, FileText, LoaderCircle, Mic, Pause, Play, Plus, Sparkles, Square, Trash2, UploadCloud } from 'lucide-react'
import SectionTitle from '../components/SectionTitle'
import useWorkspace from '../hooks/useWorkspace'
import { api, apiUpload } from '../services/api'
import { formatDuration } from '../utils/timer'
import '../styles/meetings.css'

const emptyMinutes = { summary: '', discussionPoints: [], decisions: [], unresolvedQuestions: [], actionItems: [] }
const prettyType = (type) => type === 'in-person' ? 'In person' : type === 'online' ? 'Online' : 'Uploaded recording'
const readableDate = (value) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(value || Date.now())
const durationText = (ms) => formatDuration(Math.max(0, ms || 0))

export default function MeetingsPage({ projects = [], onCreateTask, onSaveWorkLog }) {
  const { workspace } = useWorkspace()
  const [meetings, setMeetings] = useState([])
  const [title, setTitle] = useState('')
  const [type, setType] = useState('in-person')
  const [attendees, setAttendees] = useState('')
  const [agenda, setAgenda] = useState('')
  const [projectId, setProjectId] = useState('')
  const [consent, setConsent] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [activeId, setActiveId] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [liveText, setLiveText] = useState('')
  const [editingMinutesId, setEditingMinutesId] = useState('')
  const [minutesDraft, setMinutesDraft] = useState(emptyMinutes)
  const recorderRef = useRef(null)
  const recognitionRef = useRef(null)
  const fileRefs = useRef({})

  const load = useCallback(async () => {
    const result = await api('/meetings', { workspaceId: workspace.id })
    setMeetings(result.meetings || [])
  }, [workspace.id])

  useEffect(() => {
    let mounted = true
    setLoading(true)
    load().catch((reason) => { if (mounted) setError(reason.message || 'Could not load meetings.') }).finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [load])

  useEffect(() => {
    if (!meetings.some((meeting) => meeting.status === 'processing')) return undefined
    const poll = window.setInterval(() => { load().catch(() => {}) }, 3000)
    return () => window.clearInterval(poll)
  }, [meetings, load])

  useEffect(() => {
    if (!activeId) return undefined
    const timer = window.setInterval(() => {
      const session = recorderRef.current
      if (session) setElapsed(session.elapsedMs + (session.runningSince ? Date.now() - session.runningSince : 0))
    }, 500)
    return () => window.clearInterval(timer)
  }, [activeId])

  const createMeeting = async (event) => {
    event.preventDefault(); setError(''); setNotice('')
    try {
      const result = await api('/meetings', { method: 'POST', workspaceId: workspace.id, body: {
        title, type, attendees: attendees.split(',').map((name) => name.trim()).filter(Boolean), agenda, projectId: projectId || null,
      } })
      setMeetings((current) => [result.meeting, ...current])
      setTitle(''); setAttendees(''); setAgenda(''); setProjectId('')
      setNotice('Meeting created. You can record it or upload an existing recording.')
    } catch (reason) { setError(reason.message || 'Could not create meeting.') }
  }

  const patchMeeting = async (id, patch) => {
    const result = await api('/meetings/' + id, { method: 'PATCH', workspaceId: workspace.id, body: patch })
    setMeetings((current) => current.map((item) => item.id === id ? result.meeting : item))
    return result.meeting
  }

  const finishRecording = async (session) => {
    const endedAt = Date.now(), segments = [...session.segments]
    if (session.runningSince) segments.push({ start: session.runningSince, end: endedAt })
    const elapsedMs = session.elapsedMs + (session.runningSince ? endedAt - session.runningSince : 0)
    const blob = new Blob(session.chunks, { type: session.recorder.mimeType || 'audio/webm' })
    setBusy(session.meeting.id); setNotice('Uploading the recording for transcription…'); setError('')
    try {
      if (!blob.size) throw new Error('The browser produced an empty recording. Try again or upload an existing file.')
      await apiUpload('/meetings/' + session.meeting.id + '/transcribe-upload', blob, { workspaceId: workspace.id, filename: 'meeting.' + (blob.type.includes('mp4') ? 'mp4' : 'webm') })
      await patchMeeting(session.meeting.id, { endedAt, timerElapsedMs: elapsedMs, timerState: 'stopped' })
      setNotice('Recording uploaded. Transcription is processing; this page will update automatically.')
      try { await onSaveWorkLog?.({ title: session.meeting.title, projectId: session.meeting.projectId, startedAt: session.startedAt, endedAt, segments, duration: elapsedMs }) }
      catch { setNotice('Transcript saved. The meeting time could not be added to Work Log; please check the Work Log.') }
    } catch (reason) {
      setError(reason.message || 'Recording could not be transcribed. Dayora does not retain the original audio; try again or upload it again.')
      await patchMeeting(session.meeting.id, { endedAt, timerElapsedMs: elapsedMs, timerState: 'stopped', status: 'failed' }).catch(() => {})
    } finally {
      session.stream.getTracks().forEach((track) => track.stop())
      if (recognitionRef.current) { try { recognitionRef.current.stop() } catch {} recognitionRef.current = null }
      if (recorderRef.current === session) recorderRef.current = null
      setActiveId(''); setBusy(''); setElapsed(0)
      await load().catch(() => {})
    }
  }

  const startRecording = async (meeting) => {
    setError(''); setNotice('')
    if (!consent) { setError('Confirm that participants have been informed and appropriate consent has been obtained before recording.'); return }
    if (!navigator.mediaDevices) { setError('This browser does not support recording. Try a current desktop browser or upload a recording.'); return }
    let stream, recorder
    try {
      if (meeting.type === 'online') {
        if (!navigator.mediaDevices.getDisplayMedia) throw new Error('Tab-audio capture is not supported in this browser. Upload the meeting recording instead.')
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        if (!stream.getAudioTracks().length) throw new Error('No shared audio was detected. When sharing a browser tab, enable “Share tab audio”.')
      } else stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!window.MediaRecorder) throw new Error('MediaRecorder is not supported in this browser. Upload an existing recording instead.')
      recorder = new MediaRecorder(stream)
      const now = Date.now()
      const session = { meeting, recorder, stream, chunks: [], startedAt: now, runningSince: now, elapsedMs: 0, segments: [] }
      recorder.ondataavailable = (event) => { if (event.data?.size) session.chunks.push(event.data) }
      recorder.onstop = () => { void finishRecording(session) }
      recorder.start(1000); recorderRef.current = session
      setActiveId(meeting.id); setElapsed(0); setLiveText('')
      await patchMeeting(meeting.id, { status: 'recording', startedAt: now, endedAt: null, timerElapsedMs: 0, timerState: 'running' })
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      if (SpeechRecognition && meeting.type !== 'online') {
        try {
          const recognition = new SpeechRecognition()
          recognition.continuous = true; recognition.interimResults = true; recognition.lang = 'en-IN'
          recognition.onresult = (event) => {
            let words = ''
            for (let index = 0; index < event.results.length; index++) words += event.results[index][0].transcript + (event.results[index].isFinal ? ' ' : '')
            setLiveText(words)
          }
          recognitionRef.current = recognition; recognition.start()
        } catch { setLiveText('Live preview is unavailable; the recording will be transcribed when stopped.') }
      } else setLiveText('Recording is active. The saved transcript is generated when you stop.')
      setNotice(meeting.type === 'online' ? 'Recording shared tab audio. Keep the browser sharing indicator visible.' : 'Recording started. You can pause or stop at any time.')
    } catch (reason) {
      if (recorder && recorder.state !== 'inactive') { try { recorder.stop() } catch {} }
      stream?.getTracks().forEach((track) => track.stop())
      if (recorderRef.current?.meeting.id === meeting.id) recorderRef.current = null
      setActiveId('')
      setError(reason.message || 'Could not start recording. Check browser permissions.')
    }
  }

  const pauseRecording = async () => {
    const session = recorderRef.current
    if (!session || !session.runningSince) return
    const now = Date.now()
    session.elapsedMs += now - session.runningSince; session.segments.push({ start: session.runningSince, end: now }); session.runningSince = null
    session.recorder.pause(); setElapsed(session.elapsedMs)
    await patchMeeting(session.meeting.id, { timerElapsedMs: session.elapsedMs, timerState: 'paused' }).catch((reason) => setError(reason.message))
  }
  const resumeRecording = async () => {
    const session = recorderRef.current
    if (!session || session.runningSince) return
    session.runningSince = Date.now(); session.recorder.resume()
    await patchMeeting(session.meeting.id, { timerState: 'running' }).catch((reason) => setError(reason.message))
  }
  const stopRecording = () => {
    const session = recorderRef.current
    if (!session || session.recorder.state === 'inactive') return
    if (session.recorder.state === 'paused') session.recorder.resume()
    session.recorder.stop()
  }

  const uploadFile = async (meeting, file) => {
    if (!file) return
    setError(''); setNotice(''); setBusy(meeting.id)
    try {
      if (file.size > 24 * 1024 * 1024) throw new Error('Please upload a recording smaller than 24 MB.')
      await apiUpload('/meetings/' + meeting.id + '/transcribe-upload', file, { workspaceId: workspace.id, filename: file.name })
      setNotice('Recording uploaded. Transcription is processing; this page will update automatically.')
      await load()
    } catch (reason) { setError(reason.message || 'Upload or transcription failed.') }
    finally { setBusy(''); if (fileRefs.current[meeting.id]) fileRefs.current[meeting.id].value = '' }
  }

  const generateMinutes = async (meeting) => {
    setError(''); setNotice(''); setBusy(meeting.id)
    try {
      const result = await api('/meetings/' + meeting.id + '/summarize', { method: 'POST', workspaceId: workspace.id, body: {} })
      setMeetings((current) => current.map((item) => item.id === meeting.id ? result.meeting : item))
      setNotice('AI minutes generated. Review them before sharing or creating tasks.')
    } catch (reason) { setError(reason.message || 'Could not generate minutes.') }
    finally { setBusy('') }
  }

  const editMinutes = (meeting) => { setEditingMinutesId(meeting.id); setMinutesDraft(meeting.minutes || emptyMinutes) }
  const saveMinutes = async (meeting) => {
    setBusy(meeting.id); setError('')
    try {
      const minutes = { ...minutesDraft, actionItems: (minutesDraft.actionItems || []).map((item) => ({
        ...item, id: item.id || crypto.randomUUID(), description: item.description || '', assignee: item.assignee || null,
        dueDate: item.dueDate || null, priority: item.priority || 'Medium', linkedTaskId: item.linkedTaskId || null, completed: Boolean(item.completed),
      })) }
      await patchMeeting(meeting.id, { minutes })
      setEditingMinutesId(''); setNotice('Your meeting minutes have been saved.')
    } catch (reason) { setError(reason.message || 'Could not save minutes.') }
    finally { setBusy('') }
  }

  const createTask = async (meeting, item) => {
    if (!onCreateTask) return
    setBusy(meeting.id); setError('')
    try {
      const task = await onCreateTask({ ...item, projectId: meeting.projectId || null })
      const current = meetings.find((record) => record.id === meeting.id)
      const minutes = { ...(current.minutes || emptyMinutes), actionItems: (current.minutes?.actionItems || []).map((action) => action.id === item.id ? { ...action, linkedTaskId: task.id } : action) }
      await patchMeeting(meeting.id, { minutes })
      setNotice('Task created and linked to this meeting.')
    } catch (reason) { setError(reason.message || 'Could not create a task from this action item.') }
    finally { setBusy('') }
  }

  const deleteMeeting = async (meeting) => {
    if (!window.confirm('Delete this meeting, transcript, and minutes? This cannot be undone.')) return
    try { await api('/meetings/' + meeting.id, { method: 'DELETE', workspaceId: workspace.id }); setMeetings((current) => current.filter((item) => item.id !== meeting.id)) }
    catch (reason) { setError(reason.message || 'Could not delete meeting.') }
  }

  return <section className="page-content meetings-page">
    <SectionTitle title="AI Meeting Assistant" description="Record or upload a meeting, transcribe the discussion, and turn reviewed minutes into action." actions={<span className="meeting-ai-label"><Sparkles size={15} /> AI-powered</span>} />
    {error && <div className="meeting-message meeting-message--error" role="alert">{error}</div>}
    {notice && <div className="meeting-message" role="status">{notice}</div>}
    <div className="meeting-privacy"><AudioLines size={20} /><div><strong>Your recordings are processed, not stored as media.</strong><p>Dayora saves the transcript and minutes in this workspace. The original recording is sent to the configured transcription provider and is not retained by Dayora. Get participant consent before recording.</p></div></div>

    <form className="panel meeting-create" onSubmit={createMeeting}>
      <div className="meeting-create-heading"><div><span className="meeting-eyebrow">NEW MEETING</span><h2>Start with the details</h2></div><span className="meeting-create-icon"><Plus size={20} /></span></div>
      <div className="meeting-form-grid">
        <label>Meeting title<input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Weekly project review" /></label>
        <label>Meeting type<select value={type} onChange={(event) => setType(event.target.value)}><option value="in-person">In-person</option><option value="online">Online meeting / shared tab audio</option><option value="uploaded">Upload an existing recording</option></select></label>
        <label>Attendees<input value={attendees} onChange={(event) => setAttendees(event.target.value)} placeholder="Names separated by commas" /></label>
        <label>Project (optional)<select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">No project</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
        <label className="meeting-wide">Agenda<textarea value={agenda} onChange={(event) => setAgenda(event.target.value)} rows={2} placeholder="What should the meeting cover?" /></label>
      </div>
      <button className="button button--primary" type="submit"><Plus size={16} /> Create meeting</button>
    </form>

    <div className="meeting-consent"><label><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> I confirm participants have been informed and appropriate consent has been obtained before recording.</label><span>Required for live capture</span></div>
    <div className="meeting-list-heading"><div><h2>Your meetings</h2><p>Meeting records are private to the selected workspace.</p></div><span>{meetings.length} {meetings.length === 1 ? 'meeting' : 'meetings'}</span></div>
    {loading && <div className="panel meeting-empty" role="status"><LoaderCircle className="meeting-spin" size={22} /> Loading meetings…</div>}
    {!loading && !meetings.length && <div className="panel meeting-empty"><Mic size={30} /><h3>Your meeting space is ready</h3><p>Create a meeting above, then record it or upload an existing file to begin.</p></div>}
    <div className="meeting-list">{meetings.map((meeting) => <article className="panel meeting-card" key={meeting.id}>
      <div className="meeting-card-header"><div className="meeting-card-icon"><FileText size={19} /></div><div className="meeting-card-title"><div><span className="meeting-type">{prettyType(meeting.type)}</span><span className={'meeting-status meeting-status--' + (meeting.status || 'scheduled')}>{meeting.status || 'scheduled'}</span></div><h3>{meeting.title}</h3><p>{readableDate(meeting.createdAt)}{meeting.attendees?.length ? ' · ' + meeting.attendees.join(', ') : ''}</p></div><button className="icon-btn" aria-label={'Delete ' + meeting.title} onClick={() => deleteMeeting(meeting)}><Trash2 size={17} /></button></div>
      {meeting.agenda && <div className="meeting-meta"><strong>Agenda</strong><p>{meeting.agenda}</p></div>}
      {meeting.status === 'failed' && meeting.processingError && <div className="meeting-message meeting-message--error">{meeting.processingError}</div>}
      {meeting.projectId && <p className="meeting-project">Project: {projects.find((project) => project.id === meeting.projectId)?.name || 'Project'}</p>}
      {activeId === meeting.id ? <div className="meeting-recording-panel"><div className="meeting-recording-state"><span className="meeting-recording-dot" /><strong>{recorderRef.current?.runningSince ? 'Recording in progress' : 'Recording paused'}</strong><span>{durationText(elapsed)}</span></div><p>{liveText || 'Audio is being captured. The final transcript is created when you stop.'}</p><div className="meeting-controls">{recorderRef.current?.runningSince ? <button className="button button--secondary" type="button" onClick={pauseRecording}><Pause size={15} /> Pause</button> : <button className="button button--secondary" type="button" onClick={resumeRecording}><Play size={15} /> Resume</button>}<button className="button button--primary" type="button" onClick={stopRecording}><Square size={14} /> Stop and transcribe</button></div></div> : <div className="meeting-actions">
        {meeting.type !== 'uploaded' && <button className="button button--secondary" type="button" disabled={Boolean(activeId) || Boolean(busy)} onClick={() => startRecording(meeting)}><Mic size={15} /> Record live</button>}
        <button className="button button--secondary" type="button" disabled={Boolean(busy)} onClick={() => fileRefs.current[meeting.id]?.click()}><UploadCloud size={15} /> Upload audio/video</button>
        <input ref={(node) => { fileRefs.current[meeting.id] = node }} className="meeting-file-input" type="file" accept="audio/*,video/*,.mp3,.wav,.m4a,.aac,.ogg,.webm,.mp4,.mov,.mkv" onChange={(event) => uploadFile(meeting, event.target.files?.[0])} />
        <button className="button button--primary" type="button" disabled={Boolean(busy) || !meeting.transcript} onClick={() => generateMinutes(meeting)}><Sparkles size={15} /> {busy === meeting.id ? 'Processing…' : 'Generate minutes'}</button>
      </div>}
      {busy === meeting.id && <p className="meeting-processing" role="status"><LoaderCircle className="meeting-spin" size={16} /> Processing may take a little time. Please keep this page open.</p>}
      {meeting.transcript && <details className="meeting-transcript"><summary><FileAudio size={16} /> Transcript <ChevronDown size={15} /></summary><p className="meeting-transcript-text">{meeting.transcript}</p>{meeting.transcriptSegments?.length > 0 && <div className="meeting-segments">{meeting.transcriptSegments.slice(0, 200).map((segment, index) => <p key={index}><time>{durationText(segment.start)}</time>{segment.text}</p>)}</div>}</details>}
      {meeting.minutes && <section className="meeting-minutes"><div className="meeting-minutes-heading"><div><span className="meeting-eyebrow">AI-GENERATED DRAFT</span><h4>Minutes of Meeting</h4></div><button className="button button--secondary" type="button" onClick={() => editMinutes(meeting)}><FileText size={14} /> Edit minutes</button></div>
        {editingMinutesId === meeting.id ? <div className="meeting-minutes-editor">
          <label>Summary<textarea rows={4} value={minutesDraft.summary || ''} onChange={(event) => setMinutesDraft((draft) => ({ ...draft, summary: event.target.value }))} /></label>
          {['discussionPoints', 'decisions', 'unresolvedQuestions'].map((field) => <label key={field}>{field === 'discussionPoints' ? 'Discussion points' : field === 'decisions' ? 'Decisions' : 'Unresolved questions'}<textarea rows={3} value={(minutesDraft[field] || []).join('\n')} onChange={(event) => setMinutesDraft((draft) => ({ ...draft, [field]: event.target.value.split('\n').filter(Boolean) }))} placeholder="One item per line" /></label>)}
          <div className="meeting-controls"><button className="button button--primary" type="button" disabled={Boolean(busy)} onClick={() => saveMinutes(meeting)}><Check size={15} /> Save minutes</button><button className="button button--secondary" type="button" onClick={() => setEditingMinutesId('')}>Cancel</button></div>
        </div> : <><p className="meeting-summary">{meeting.minutes.summary || 'No summary was returned.'}</p>
          {['discussionPoints', 'decisions', 'unresolvedQuestions'].map((field) => meeting.minutes[field]?.length ? <div className="meeting-minutes-section" key={field}><h5>{field === 'discussionPoints' ? 'Discussion points' : field === 'decisions' ? 'Decisions' : 'Unresolved questions'}</h5><ul>{meeting.minutes[field].map((item, index) => <li key={index}>{item}</li>)}</ul></div> : null)}
          {meeting.minutes.actionItems?.length > 0 && <div className="meeting-minutes-section"><h5>Action items</h5><div className="meeting-action-items">{meeting.minutes.actionItems.map((item) => <div className="meeting-action-item" key={item.id}><div><strong>{item.title}</strong><p>{item.description || 'Follow-up action'}{item.assignee ? ' · ' + item.assignee : ''}{item.dueDate ? ' · Due ' + item.dueDate : ''}</p></div>{item.linkedTaskId ? <span className="meeting-task-linked"><Check size={14} /> Task linked</span> : <button className="button button--secondary" type="button" disabled={Boolean(busy) || !onCreateTask} onClick={() => createTask(meeting, item)}><Plus size={14} /> Create task</button>}</div>)}</div></div>}
          <p className="meeting-review-note">AI-generated minutes may contain mistakes. Review and correct them before sharing.</p>
        </>}
      </section>}
    </article>)}</div>
    <p className="meeting-footer-note"><Clock3 size={14} /> Online capture requires sharing a tab or screen with audio enabled. Microphone-only recording cannot hear remote participants through headphones.</p>
  </section>
}
