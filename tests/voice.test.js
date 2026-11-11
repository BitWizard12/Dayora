import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareVoiceText, tidyVoiceSpacing, voiceTaskDraft, createSpeechSession, createVoiceWorkspace } from '../src/services/voice.js'
import { createWorkspaceRepositories } from '../src/repositories/workspaceRepositories.js'
import { logDate } from '../src/services/workLog.js'

test('spoken rules preserve unrelated words, support Unicode, and only expand entire snippet triggers', () => {
  const rules = { snippets: 'my sign = Regards, Sam', vocabulary: 'day aura = Dayora\nराम = Ram\na.b = API' }
  assert.equal(prepareVoiceText('MY SIGN.', rules), 'Regards, Sam')
  assert.equal(prepareVoiceText('Use my sign tomorrow', rules), 'Use my sign tomorrow')
  assert.equal(prepareVoiceText('day aura and राम and a.b; not xa.b', rules), 'Dayora and Ram and API; not xa.b')
  assert.equal(prepareVoiceText('  keep the original meaning  ', {}), 'keep the original meaning')
})

test('long voice drafts retain their full content for task review', () => {
  const text = 'x'.repeat(230)
  assert.equal(voiceTaskDraft(text).title.length, 200)
  assert.equal(voiceTaskDraft(text).description, text)
  assert.deepEqual(voiceTaskDraft('Call Sam'), { title: 'Call Sam', description: '' })
  assert.throws(() => voiceTaskDraft(' '), /some text/)
})

test('spacing cleanup preserves language, punctuation, paragraph breaks and code', () => {
  const source = '\nCall   राम at  10:30.\r\n\r\nUse https://example.com/a?q=one+two.\r\n'
  const expected = 'Call राम at 10:30.\n\nUse https://example.com/a?q=one+two.'
  assert.equal(tidyVoiceSpacing(source), expected)
  assert.equal(tidyVoiceSpacing(expected), expected)
  const code = '  - Keep   this  \n    const x = "two  spaces";\n```js\nconst y = "keep  these";  \n```\nAfter   code'
  assert.equal(tidyVoiceSpacing(code), '  - Keep this  \n    const x = "two  spaces";\n```js\nconst y = "keep  these";  \n```\nAfter code')
  assert.equal(tidyVoiceSpacing('~~~text\nkeep  spaces\n~~~\nNext   line'), '~~~text\nkeep  spaces\n~~~\nNext line')
  assert.equal(tidyVoiceSpacing('Already tidy.\n\nAnother paragraph.'), 'Already tidy.\n\nAnother paragraph.')
})

test('speech sessions collect final results once, stop, report denial, and ignore late callbacks after disposal', () => {
  let instance
  class Recognition {
    constructor() { instance = this }
    start() { this.onstart() }
    stop() { this.onend() }
    abort() { this.aborted = true }
  }
  const received = [], states = [], errors = []
  const session = createSpeechSession({ language: 'hi-IN', onText: (...args) => received.push(args), onState: state => states.push(state), onError: error => errors.push(error) }, { SpeechRecognition: Recognition })
  session.start()
  assert.equal(instance.lang, 'hi-IN')
  const final = Object.assign([{ transcript: 'Hello' }], { isFinal: true })
  instance.onresult({ results: [final, [{ transcript: 'world' }]] })
  instance.onresult({ results: [final] })
  assert.deepEqual(received, [['Hello', 'world'], ['Hello', '']])
  session.stop()
  instance.onerror({ error: 'not-allowed' })
  assert.match(errors[0], /denied/)
  assert.equal(instance.aborted, true)
  const callback = instance.onresult
  session.dispose()
  callback({ results: [final] })
  assert.equal(received.length, 2)
  assert.equal(instance.onresult, null)
  assert.ok(states.includes('listening') && states.includes('idle'))
  assert.throws(() => createSpeechSession({}, {}), /unavailable/)
})

test('voice preferences and note additions use scoped repositories and preserve existing notes', async () => {
  const data = new Map()
  const adapter = { read: async key => structuredClone(data.get(key)), write: async (key, value) => data.set(key, structuredClone(value)) }
  const scope = { ownerId: 'voice-user', workspaceId: 'voice-space', actorId: 'voice-user' }
  const repos = createWorkspaceRepositories(scope, adapter)
  const voice = createVoiceWorkspace(repos)
  await voice.preferences.load()
  await voice.preferences.setValue({ language: 'hi-IN', snippets: 'hi = hello', vocabulary: '' })
  await repos.dailyNotes.save(logDate(Date.now()), 'Existing note')
  await voice.appendToNote('New thought')
  assert.equal(repos.dailyNotes.getSnapshot().data[0].note, 'Existing note\n\nNew thought')
  assert.equal(repos.dailyNotes.getSnapshot().data[0].ownerId, scope.ownerId)
  assert.equal(repos.dailyNotes.getSnapshot().data.length, 1)
  const reloaded = createVoiceWorkspace(createWorkspaceRepositories(scope, adapter))
  await reloaded.preferences.load()
  assert.equal(reloaded.preferences.getSnapshot().data[0].value.language, 'hi-IN')
  const other = createWorkspaceRepositories({ ownerId: 'other', workspaceId: 'voice-space' }, adapter)
  assert.deepEqual(await other.dailyNotes.load(), [])
  await assert.rejects(voice.appendToNote('x'.repeat(10001)), /full/)
  assert.equal(repos.dailyNotes.getSnapshot().data[0].note, 'Existing note\n\nNew thought')
})
