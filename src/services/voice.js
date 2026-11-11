import { logDate } from './workLog.js'

export const voiceDefaults = { language: 'en-IN', snippets: '', vocabulary: '' }
export const voiceLanguages = [['en-IN', 'English (India)'], ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['hi-IN', 'Hindi'], ['mr-IN', 'Marathi'], ['ml-IN', 'Malayalam'], ['es-ES', 'Spanish'], ['fr-FR', 'French']]

function rules(value) {
  return String(value || '').split('\n').map(line => {
    const index = line.indexOf('=')
    return index > 0 ? [line.slice(0, index).trim(), line.slice(index + 1).trim()] : null
  }).filter(pair => pair?.[0] && pair[1])
}

// Exact spoken phrases, not semantic rewriting. Punctuation/corrections come
// from the browser recognizer; Dayora never labels this local step as AI.
export function prepareVoiceText(value, preferences = voiceDefaults) {
  let text = String(value).trim()
  const snippet = rules(preferences.snippets).find(([trigger]) => trigger.toLocaleLowerCase() === text.replace(/[.!?]+$/, '').trim().toLocaleLowerCase())
  if (snippet) return snippet[1]
  for (const [heard, replacement] of rules(preferences.vocabulary)) {
    const escaped = heard.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    text = text.replace(new RegExp(`(^|[^\\p{L}\\p{N}_])(${escaped})(?=$|[^\\p{L}\\p{N}_])`, 'giu'), (_, prefix) => prefix + replacement)
  }
  return text
}

export function voiceTaskDraft(text) {
  const clean = String(text).trim()
  if (!clean) throw new Error('Add some text first.')
  const firstLine = clean.split('\n')[0]
  return { title: firstLine.slice(0, 200), description: clean.length > 200 || clean.includes('\n') ? clean : '' }
}

export function captureVoiceTarget(element) {
  if (!element || !(element.tagName === 'TEXTAREA' || element.tagName === 'INPUT' && ['text', 'search', 'url', 'tel'].includes(element.type)) || element.disabled || element.readOnly) return null
  return { element, start: element.selectionStart ?? element.value.length, end: element.selectionEnd ?? element.value.length, value: element.value }
}

export function insertVoiceText(target, text) {
  const element = target?.element
  if (!element?.isConnected || element.disabled || element.readOnly || element.value !== target.value) throw new Error('The original field changed. Close this panel, select the field again, and retry.')
  const value = target.value.slice(0, target.start) + text + target.value.slice(target.end)
  if (element.maxLength >= 0 && value.length > element.maxLength) throw new Error('This text is too long for that field.')
  const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

export function createVoiceWorkspace(repositories) {
  return {
    preferences: repositories.valueRepository('dayora-voice-preferences', voiceDefaults),
    async appendToNote(text) {
      if (!String(text).trim()) throw new Error('Add some text first.')
      await repositories.flushDrafts()
      const repo = repositories.dailyNotes
      await repo.load()
      const date = logDate(Date.now())
      const previous = repo.forDate(repo.getSnapshot().data, date)?.note || ''
      const next = [previous, text.trim()].filter(Boolean).join('\n\n')
      if (next.length > 10000) throw new Error('Today’s note is full. Copy this text to keep it elsewhere.')
      await repo.save(date, next)
    },
  }
}

export function createSpeechSession({ language, onText, onState, onError }, environment = globalThis) {
  const Recognition = environment.SpeechRecognition || environment.webkitSpeechRecognition
  if (!Recognition) throw new Error('Live dictation is unavailable in this browser. You can still type, paste, and use the actions below.')
  const recognition = new Recognition()
  recognition.lang = language
  recognition.continuous = true
  recognition.interimResults = true
  let disposed = false
  let failed = false
  recognition.onstart = () => { if (!disposed) onState('listening') }
  recognition.onresult = event => {
    if (disposed || failed) return
    let final = '', interim = ''
    for (let i = 0; i < event.results.length; i++) {
      if (event.results[i].isFinal) final += event.results[i][0].transcript + ' '
      else interim += event.results[i][0].transcript + ' '
    }
    onText(final.trim(), interim.trim())
  }
  recognition.onerror = event => {
    if (disposed || failed) return
    failed = true
    const messages = { 'not-allowed': 'Microphone access was denied. Allow it in browser settings to dictate.', 'audio-capture': 'No microphone is available. Check your microphone settings.', 'no-speech': 'No speech was detected. Try again when you’re ready.', network: 'The speech service could not connect. Check your connection or type your text.', 'language-not-supported': 'This language is unavailable in your browser’s speech service.' }
    onError(messages[event.error] || 'Dictation stopped. Your draft is still here.')
    onState('idle')
    recognition.abort()
  }
  recognition.onend = () => { if (!disposed) onState('idle') }
  return {
    start() { recognition.start() },
    stop() { recognition.stop() },
    dispose() { disposed = true; recognition.onresult = recognition.onerror = recognition.onstart = recognition.onend = null; recognition.abort() },
  }
}
