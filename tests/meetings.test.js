import test from 'node:test'
import assert from 'node:assert/strict'
import { validateMeetingDraft } from '../server/meetings.js'

test('meeting drafts apply safe defaults', () => {
  const result = validateMeetingDraft({ title: 'Planning' })
  assert.equal(result.title, 'Planning')
  assert.equal(result.type, 'in-person')
  assert.deepEqual(result.attendees, [])
  assert.equal(result.projectId, null)
})

test('meeting drafts reject invalid types, blank titles, and extra fields', () => {
  assert.throws(() => validateMeetingDraft({ title: 'Planning', type: 'webinar' }))
  assert.throws(() => validateMeetingDraft({ title: '   ' }))
  assert.throws(() => validateMeetingDraft({ title: 'Planning', admin: true }))
})
