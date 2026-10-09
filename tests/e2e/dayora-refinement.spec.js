import { test, expect } from '@playwright/test'
import { isolateLoginClient } from '../helpers/browser-client.js'

const password = 'dayora browser password 123'
async function settle(page) {
  await expect.poll(() => page.locator('.route-content, .stat-card, .onboarding-choice, .auth-card, article.panel, .time-tracker').evaluateAll((elements) => elements.every((element) => Number(getComputedStyle(element).opacity) >= .99))).toBe(true)
}
async function login(page, email, onboarding = false) {
  await page.goto('/#login')
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  if (!onboarding) await expect(page.locator('main h1')).toHaveText('Dashboard')
}
async function addProject(page, name) {
  await page.getByRole('button', { name: 'Add Project', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Project name').fill(name)
  await dialog.getByLabel('Deadline').fill('2026-10-20')
  await dialog.getByRole('button', { name: 'Create project', exact: true }).click()
  await expect(dialog).not.toBeVisible()
}
async function selectWorkspace(page, name) {
  const select = page.getByLabel('Active workspace')
  if (!await select.isVisible()) await page.getByRole('button', { name: /Open menu/ }).click()
  await select.selectOption({ label: name })
  await expect(select).toHaveValue(await select.locator('option').filter({ hasText: name }).getAttribute('value'))
  if (await page.getByRole('button', { name: 'Close navigation', exact: true }).isVisible()) await page.getByRole('button', { name: 'Close navigation', exact: true }).click()
}
test.beforeEach(async ({ page, context }, testInfo) => { await isolateLoginClient(context, testInfo.title); await page.emulateMedia({ reducedMotion: 'reduce' }) })

test('first-time Individual onboarding persists and keeps the personal workspace', async ({ page }) => {
  await login(page, 'onboarder@example.com', true)
  await expect(page.getByText('HOW WILL YOU USE DAYORA?', { exact: true })).toBeVisible()
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await settle(page)
    await page.screenshot({ path: `artifacts/dayora-onboarding-${width}.png`, fullPage: true })
  }
  await page.getByRole('button', { name: /^Individual Plan/ }).click()
  await expect(page.locator('main h1')).toHaveText('Dashboard')
  expect((await (await page.request.get('/api/auth/session')).json()).user.onboardingComplete).toBe(true)
  await page.reload()
  await expect(page.locator('main h1')).toHaveText('Dashboard')
  expect((await (await page.request.get('/api/workspaces')).json()).workspaces).toHaveLength(1)
})

test('first-time Team onboarding creates a real workspace without removing the personal space', async ({ page }) => {
  await login(page, 'newteamuser@example.com', true)
  await page.getByRole('button', { name: /^Team Organize/ }).click()
  await page.getByRole('button', { name: /^Create a Team/ }).click()
  await page.getByLabel('Team name', { exact: true }).fill('New team space')
  await page.getByRole('button', { name: 'Create team workspace', exact: true }).click()
  await expect(page.locator('main h1')).toHaveText('Dashboard')
  await expect(page.getByLabel('Active workspace')).toHaveValue(await page.getByLabel('Active workspace').locator('option').filter({ hasText: 'New team space' }).getAttribute('value'))
  expect((await (await page.request.get('/api/workspaces')).json()).workspaces).toHaveLength(2)
})

test('create, invite, join and switch shared teams; private data and member permissions stay separate', async ({ page, browser }) => {
  await login(page, 'teamowner@example.com')
  await addProject(page, 'Owner private project')
  await page.getByRole('button', { name: 'Create or join a team', exact: true }).click()
  await page.getByRole('button', { name: /^Create a Team/ }).click()
  await page.getByLabel('Team name', { exact: true }).fill('Campion Robotics')
  await page.getByRole('button', { name: 'Create team workspace', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.locator('.project-open')).toHaveCount(0)
  await addProject(page, 'Shared robotics project')
  await page.goto('/#team')
  await page.getByRole('button', { name: 'Create private invite', exact: true }).click()
  const code = await page.locator('.invite-result code').innerText()
  await expect(page.getByRole('region', { name: 'Account members', exact: true })).toContainText('TeamOwner')
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await settle(page)
    await page.screenshot({ path: `artifacts/dayora-shared-team-${width}.png`, fullPage: true })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' }), second = await context.newPage()
  await second.emulateMedia({ reducedMotion: 'reduce' })
  await login(second, 'teammember@example.com')
  await second.getByRole('button', { name: 'Create or join a team', exact: true }).click()
  await second.getByRole('button', { name: /^Join a Team/ }).click()
  await second.getByLabel('Invite code', { exact: true }).fill(code)
  await second.getByRole('button', { name: 'Join team workspace', exact: true }).click()
  await expect(second.getByRole('dialog')).not.toBeVisible()
  await expect(second.locator('.project-open')).toContainText('Shared robotics project')
  await expect(second.getByRole('button', { name: 'Add Project', exact: true })).toHaveCount(0)
  await second.goto('/#team')
  await expect(second.getByRole('region', { name: 'Account members', exact: true })).toContainText('TeamMember')
  await expect(second.getByRole('button', { name: 'Create private invite', exact: true })).toHaveCount(0)
  await second.reload()
  await expect(second.getByLabel('Active workspace')).toHaveValue(await second.getByLabel('Active workspace').locator('option').filter({ hasText: 'Campion Robotics' }).getAttribute('value'))
  await selectWorkspace(second, "TeamMember's Space")
  await second.goto('/#projects')
  await expect(second.locator('.project-card')).toHaveCount(0)
  await selectWorkspace(page, "TeamOwner's Space")
  await page.goto('/#projects')
  await expect(page.locator('.project-card')).toContainText('Owner private project')
  await expect(page.locator('.project-card')).not.toContainText('Shared robotics project')
  await selectWorkspace(page, 'Campion Robotics')
  await page.goto('/#team')
  await page.getByRole('button', { name: 'Remove TeamMember', exact: true }).click()
  await page.getByRole('button', { name: 'Remove from team', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await second.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(second.getByLabel('Active workspace').locator('option')).toHaveCount(1)
  await context.close()
})

test('running and saved timer notes, task associations and Daily Note persist through reload', async ({ page }) => {
  await login(page, 'visual@example.com')
  await addProject(page, 'Dayora launch')
  await page.goto('/#tasks')
  await page.getByRole('button', { name: 'New Task', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Task name').fill('Final deployment')
  await dialog.getByRole('combobox', { name: 'Project', exact: true }).selectOption({ label: 'Dayora launch' })
  await dialog.getByRole('button', { name: 'Create task', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await page.goto('/#work-log')
  await page.getByLabel('Timer activity title').fill('Launch preparation')
  await page.getByLabel('Task to track').selectOption({ label: 'Final deployment' })
  await page.getByLabel('Timer work note').fill('Configured Firebase authentication')
  await page.getByRole('button', { name: 'Start tracking', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
  await page.getByLabel('Timer work note').fill('Tested email verification')
  await page.getByRole('button', { name: 'Save session note', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Save session note', exact: true })).toBeEnabled()
  await page.reload()
  await expect(page.getByLabel('Timer work note')).toHaveValue('Tested email verification')
  await expect(page.getByRole('timer', { name: 'Current session elapsed time' })).not.toHaveText('00:00:00')
  await page.getByRole('button', { name: 'Stop & save', exact: true }).click()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('textbox', { name: 'What I did', exact: true }).fill('Configured Firebase and tested verification')
  await dialog.getByRole('button', { name: 'Save work log', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('.log-entry')).toContainText('Configured Firebase and tested verification')
  await page.getByRole('button', { name: 'Edit work log Launch preparation', exact: true }).click()
  await dialog.getByRole('textbox', { name: 'What I did', exact: true }).fill('Ready for deployment')
  await dialog.getByRole('button', { name: 'Save work log', exact: true }).click()
  await page.getByLabel('Today’s note', { exact: true }).fill('Continue tomorrow: check the production launch')
  await expect(page.locator('.save-indicator')).toHaveText('Saved')
  await page.reload()
  await expect(page.getByLabel('Today’s note', { exact: true })).toHaveValue('Continue tomorrow: check the production launch')
  await expect(page.locator('.log-entry')).toContainText('Ready for deployment')
  await page.goto('/#analytics')
  const state = await (await page.request.get('/api/workspace')).json()
  expect(state.collections['time-entries'][0].taskId).toBe(state.collections.tasks[0].id)
  expect(state.collections['time-entries'][0].note).toBe('Ready for deployment')
  await expect(page.getByTestId('analytics-tracked')).not.toHaveText('00:00:00')
})

test('delayed workspace switches cannot restore old account data after sign-out', async ({ page }) => {
  await login(page, 'teamowner@example.com')
  await page.goto('/#settings')
  const user = (await (await page.request.get('/api/auth/session')).json()).user
  let release, received, finished
  const held = new Promise((resolve) => { release = resolve }), captured = new Promise((resolve) => { received = resolve }), delivered = new Promise((resolve) => { finished = resolve })
  await page.route('**/api/workspaces/selection', async (route) => {
    const response = await route.fetch(); received(); await held
    await route.fulfill({ response }).catch(() => {}).finally(finished)
  })
  await page.getByLabel('Active workspace').selectOption(user.workspaceId)
  await captured
  await page.getByRole('button', { name: 'Security', exact: true }).click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.getByLabel('Email address', { exact: true }).fill('teammember@example.com')
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.locator('main h1')).toHaveText('Dashboard')
  release(); await delivered
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.locator('.topbar-account')).toContainText('TeamMember')
  await expect(page.locator('.project-open')).toHaveCount(0)
  await expect(page.locator('main')).not.toContainText('Unable to save or load')
})

test('all requested viewport widths fit; capture dashboard, board, calendar, analytics, work log, auth and team', async ({ page }) => {
  test.setTimeout(180000)
  const errors = []; page.on('pageerror', (error) => errors.push(error.message))
  const widths = [1920, 1440, 1366, 1024, 768, 430, 390, 360, 320]
  const visualWidths = [1440, 1024, 768, 390]
  await page.goto('/#login')
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (visualWidths.includes(width)) { await settle(page); await page.screenshot({ path: `artifacts/dayora-auth-${width}.png`, fullPage: true }) }
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await login(page, 'visual@example.com')
  for (const route of ['dashboard', 'tasks', 'projects', 'calendar', 'analytics', 'work-log', 'team', 'settings']) {
    await page.goto(`/#${route}`); await expect(page.locator('main h1')).toBeVisible()
    for (const width of widths) {
      await page.setViewportSize({ width, height: 1000 })
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      if (visualWidths.includes(width)) { await settle(page); await page.screenshot({ path: `artifacts/dayora-${route}-${width}.png`, fullPage: true }) }
    }
  }
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.getByRole('button', { name: /Open menu/ }).click()
  await expect(page.getByLabel('Active workspace')).toBeVisible()
  await page.screenshot({ path: 'artifacts/dayora-workspace-drawer-390.png', fullPage: true })
  await page.getByRole('button', { name: 'Close navigation', exact: true }).click()
  expect(errors).toEqual([])
})
