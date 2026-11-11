import { test, expect } from '@playwright/test'

// Exercises the real App and routes with an empty, memory-only repository.
// Deliberately does not claim to test authentication or remote persistence.
const preview = '/tests/helpers/design-preview.html'
test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }) })

test('the real application entry loads the same glass cascade before sign-in', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.auth-card, .app-shell').first()).toBeVisible()
  // A CSS-only probe checks the real main.jsx import graph without fabricating
  // an authentication session or querying any remote workspace records.
  const styles = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.className = 'app-shell'
    probe.innerHTML = '<aside class="sidebar"></aside><div class="app-main"><header class="topbar"></header><main id="main"><article class="panel"></article></main></div>'
    document.body.append(probe)
    const read = el => {
      const css = getComputedStyle(el)
      return { display: css.display, position: css.position, backdrop: css.backdropFilter, background: css.backgroundImage }
    }
    const result = { shell: read(probe), header: read(probe.querySelector('.topbar')), panel: read(probe.querySelector('.panel')) }
    probe.remove()
    return result
  })
  expect(styles.shell.display).toBe('grid')
  expect(styles.shell.background).toContain('radial-gradient')
  expect(styles.header.position).toBe('relative')
  expect(styles.header.backdrop).toContain('blur(')
  expect(styles.panel.backdrop).toContain('blur(')
})

for (const width of [1440, 1024, 768, 390]) {
  test(`shell stays at the top while content scrolls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(preview)
    await expect(page.locator('.glass-orbit')).toBeVisible()
    const orb = await page.locator('.glass-orbit__sphere').boundingBox()
    expect(orb.width).toBeGreaterThan(100)
    expect(orb.height).toBeGreaterThan(100)
    await expect(page.locator('.glass-orbit__sphere')).toBeVisible()
    const geometry = () => page.evaluate(() => {
      const header = document.querySelector('.topbar').getBoundingClientRect()
      const main = document.querySelector('#main')
      return { headerY: header.y, headerBottom: header.bottom, mainY: main.getBoundingClientRect().y,
        windowY: scrollY, mainScroll: main.scrollTop,
        overflow: document.documentElement.scrollWidth > innerWidth || main.scrollWidth > main.clientWidth,
        documentHeight: document.documentElement.scrollHeight, viewportHeight: innerHeight }
    })
    const before = await geometry()
    expect(before.headerY).toBeGreaterThanOrEqual(0)
    expect(before.headerY).toBeLessThan(25)
    expect(before.mainY).toBeGreaterThanOrEqual(before.headerBottom)
    expect(before.overflow).toBe(false)
    expect(before.documentHeight).toBe(before.viewportHeight)
    // Even visually hidden absolute labels must remain inside the scroll pane.
    expect(await page.locator('#main').evaluate(main => [...main.querySelectorAll('*')]
      .filter(el => getComputedStyle(el).position === 'absolute' && el.offsetParent && !main.contains(el.offsetParent))
      .map(el => el.className))).toEqual([])
    expect(await page.locator('.analytics-card').evaluate(el => getComputedStyle(el).backdropFilter)).toContain('blur(')
    await page.screenshot({ path: `artifacts/d1-shell-top-${width}.png`, fullPage: true })
    await page.locator('#main').evaluate(el => el.scrollTo(0, el.scrollHeight))
    const after = await geometry()
    expect(after.windowY).toBe(0)
    expect(after.mainScroll).toBeGreaterThan(0)
    expect(after.headerY).toBe(before.headerY)
    expect(after.overflow).toBe(false)
    await page.screenshot({ path: `artifacts/d1-shell-bottom-${width}.png`, fullPage: true })
    if (width <= 1024) {
      await page.getByRole('button', { name: 'Open menu', exact: true }).click()
      await expect(page.locator('.sidebar')).toBeInViewport()
      await page.keyboard.press('Escape')
      await expect(page.locator('.sidebar')).not.toBeInViewport()
    } else {
      expect(await page.locator('.sidebar').evaluate(el => el.getBoundingClientRect().y)).toBe(18)
    }
  })
}

test('navigation resets only the content pane and all routes remain contained', async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(preview)
    await expect(page.locator('.glass-orbit')).toBeVisible()
    for (const route of ['tasks', 'projects', 'calendar', 'meetings', 'work-log', 'analytics', 'settings', 'dashboard']) {
      await page.locator('#main').evaluate(el => el.scrollTop = el.scrollHeight)
      await page.evaluate(route => { window.location.hash = route }, route)
      const title = { 'work-log': 'Work Log', meetings: 'AI Meeting Assistant' }[route] || route[0].toUpperCase() + route.slice(1)
      await expect(page.locator('main h1')).toHaveText(title)
      await expect.poll(() => page.locator('#main').evaluate(el => el.scrollTop)).toBe(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      expect(await page.locator('#main').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    }
  }
})

test('sidebar scroll is independent and dialogs remain reachable on short screens', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 600 })
  await page.goto(preview)
  await expect(page.locator('.glass-orbit')).toBeVisible()
  await page.locator('.sidebar-profile').scrollIntoViewIfNeeded()
  await expect(page.locator('.sidebar-profile')).toBeInViewport()
  expect(await page.locator('.sidebar').evaluate(el => el.scrollTop)).toBeGreaterThan(0)
  expect(await page.locator('#main').evaluate(el => el.scrollTop)).toBe(0)
  await page.setViewportSize({ width: 390, height: 600 })
  await page.getByRole('button', { name: 'Add Project', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Create project', exact: true }).scrollIntoViewIfNeeded()
  await expect(dialog.getByRole('button', { name: 'Create project', exact: true })).toBeInViewport()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
})

test('hero controls use existing commands and motion respects preference', async ({ page }) => {
  await page.goto(preview)
  await page.getByRole('button', { name: 'Create a task', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Task name', { exact: true }).fill('Layout regression task')
  await dialog.getByRole('button', { name: 'Create task', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('.hero-overview')).toContainText('1 open tasks')
  expect(await page.locator('.glass-orbit__float').evaluate(el => getComputedStyle(el).animationName)).toBe('none')
  await page.getByRole('button', { name: 'Find your focus' }).click()
  await expect(page.locator('main h1')).toHaveText('Tasks')
  await expect(page.locator('.task-card')).toHaveCount(1)
  await page.goto(preview)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(page.locator('.glass-orbit')).toBeVisible()
  const bounds = await page.locator('.glass-orbit').boundingBox()
  await page.mouse.move(bounds.x + bounds.width * .8, bounds.y + bounds.height * .3)
  await expect.poll(() => page.locator('.glass-orbit__scene').evaluate(el => getComputedStyle(el).transform)).not.toBe('none')
  expect(await page.locator('.glass-orbit__float').evaluate(el => getComputedStyle(el).animationName)).toBe('orbit-float')
})
