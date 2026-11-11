import { test, expect } from '@playwright/test'
const preview = '/tests/helpers/design-preview.html'

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    window.__starts = 0; window.__aborts = 0
    window.SpeechRecognition = class {
      constructor() { window.__speech = this }
      start() { window.__starts++; this.onstart?.() }
      stop() { this.onend?.() }
      abort() { window.__aborts++ }
    }
  })
  await page.goto(preview)
  await expect(page.locator('.glass-orbit__sphere')).toBeVisible()
})

test('recording is explicit, drafts are editable, and task creation requires review', async ({ page }) => {
  await page.getByRole('button', { name: 'Open voice studio' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toHaveAccessibleName('Voice studio')
  expect(await page.evaluate(() => window.__starts)).toBe(0)
  await dialog.getByRole('button', { name: 'Start dictation' }).click()
  await page.evaluate(() => window.__speech.onresult({ results: [Object.assign([{ transcript: 'Review launch plan' }], { isFinal: true })] }))
  await dialog.getByRole('button', { name: 'Stop recording' }).click()
  await expect(dialog.getByLabel('Voice draft')).toHaveValue('Review launch plan')
  await dialog.getByRole('button', { name: 'Draft a task' }).click()
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Create a task')
  await expect(page.getByRole('dialog').getByLabel('Task name', { exact: true })).toHaveValue('Review launch plan')
  await expect(page.locator('.hero-overview')).toContainText('0 open tasks')
  await page.getByRole('dialog').getByRole('button', { name: 'Create task', exact: true }).click()
  await expect(page.locator('.hero-overview')).toContainText('1 open tasks')
  expect(await page.evaluate(() => window.__aborts)).toBeGreaterThan(0)
})

test('voice note additions preserve unsaved existing text and insertion honors the selected field', async ({ page }) => {
  const note = page.locator('#daily-note')
  await note.fill('Existing thought')
  await page.getByRole('button', { name: 'Open voice studio' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Voice draft').fill('New thought')
  await dialog.getByRole('button', { name: 'Add to today’s note' }).click()
  await expect(dialog.getByRole('status')).toHaveText('Added to today’s note.')
  await page.keyboard.press('Escape')
  await expect(note).toHaveValue('Existing thought\n\nNew thought')
  await note.focus()
  await note.evaluate(el => el.setSelectionRange(0, 8))
  await page.getByRole('button', { name: 'Open voice studio' }).click()
  await dialog.getByLabel('Voice draft').fill('Updated')
  await dialog.getByRole('button', { name: 'Insert into previous field' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(note).toHaveValue('Updated thought\n\nNew thought')
})

test('personalization persists when reopened and text rules are opt-in', async ({ page }) => {
  await page.getByRole('button', { name: 'Open voice studio' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('summary').click()
  await dialog.getByLabel('Spoken shortcuts').fill('my signature = Regards, Alex')
  await dialog.getByLabel('Vocabulary replacements').fill('day aura = Dayora')
  await dialog.getByRole('button', { name: 'Save preferences' }).click()
  await expect(dialog.getByRole('status')).toHaveText('Voice preferences saved.')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Open voice studio' }).click()
  await dialog.locator('summary').click()
  await expect(dialog.getByLabel('Spoken shortcuts')).toHaveValue('my signature = Regards, Alex')
  await dialog.getByLabel('Voice draft').fill('day aura')
  await dialog.getByRole('button', { name: 'Apply text rules' }).click()
  await expect(dialog.getByLabel('Voice draft')).toHaveValue('Dayora')
  await dialog.getByLabel('Voice draft').fill('my signature')
  await dialog.getByRole('button', { name: 'Apply text rules' }).click()
  await expect(dialog.getByLabel('Voice draft')).toHaveValue('Regards, Alex')
})

test('denial keeps the draft and closing cancels the recognition session', async ({ page }) => {
  await page.keyboard.press('Alt+Shift+V')
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Voice draft').fill('Keep this')
  await dialog.getByRole('button', { name: 'Start dictation' }).click()
  await page.evaluate(() => window.__speech.onerror({ error: 'not-allowed' }))
  await expect(dialog.getByRole('alert')).toContainText('denied')
  await expect(dialog.getByLabel('Voice draft')).toHaveValue('Keep this')
  await dialog.getByRole('button', { name: 'Start dictation' }).click()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  expect(await page.evaluate(() => window.__aborts)).toBeGreaterThan(1)
})

test('unsupported browsers have a usable text fallback', async ({ page }) => {
  await page.evaluate(() => { window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined })
  await page.getByRole('button', { name: 'Open voice studio' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Start dictation' })).toBeDisabled()
  await expect(dialog).toContainText('isn’t supported here')
  await dialog.getByLabel('Voice draft').fill('Typed fallback')
  await expect(dialog.getByRole('button', { name: 'Draft a task' })).toBeEnabled()
})

test('drafts survive closure and task-review cancellation; clear and text rules can be undone', async ({ page }) => {
  await page.getByRole('button', { name: 'Open voice studio' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Voice draft').fill('Keep this thought')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Open voice studio' }).click()
  await expect(dialog.getByLabel('Voice draft')).toHaveValue('Keep this thought')
  await dialog.getByRole('button', { name: 'Draft a task' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Open voice studio' }).click()
  await expect(dialog.getByLabel('Voice draft')).toHaveValue('Keep this thought')
  await dialog.getByRole('button', { name: 'Clear draft', exact: true }).click()
  await expect(dialog.getByLabel('Voice draft')).toHaveValue('')
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(dialog.getByLabel('Voice draft')).toHaveValue('Keep this thought')
  await dialog.locator('summary').click()
  await dialog.getByLabel('Vocabulary replacements').fill('thought = idea')
  await dialog.getByRole('button', { name: 'Apply text rules' }).click()
  await expect(dialog.getByLabel('Voice draft')).toHaveValue('Keep this idea')
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(dialog.getByLabel('Voice draft')).toHaveValue('Keep this thought')
  await page.reload()
  await page.getByRole('button', { name: 'Open voice studio' }).click()
  await expect(page.getByRole('dialog').getByLabel('Voice draft')).toHaveValue('')
})

test('the voice panel and launcher fit desktop, tablet and mobile', async ({ page }) => {
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.getByRole('button', { name: 'Open voice studio' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect.poll(() => dialog.evaluate(el => Number(getComputedStyle(el).opacity))).toBe(1)
    await expect.poll(() => page.locator('.modal-backdrop').evaluate(el => Number(getComputedStyle(el).opacity))).toBe(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await page.screenshot({ path: `artifacts/dayora-voice-${width}.png` })
    await page.keyboard.press('Escape')
  }
})
