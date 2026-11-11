# Dayora D1 — layout and production glass correction

Changes remain local on `feature/dayora-flow-3d-redesign`. No commit, push, merge or deployment. This report supersedes the earlier D1 verification results.

## Root causes reproduced

1. **Displaced shell in full-page captures.** The previous layout combined a document-height dashboard with a fixed sidebar and sticky header. At document scrollY 1810, both still measured top 18px in the live viewport, but a full-page screenshot painted them near the bottom. See `artifacts/d1-layout-before-scrolled-full.png`. This screenshot artifact was reproducible; it did not establish that the live viewport had displaced the sidebar.
2. **Actual overflow from an escaping absolute label.** In the first production preview of the scroll-pane layout, a 1000px body produced 1768px document scroll height. An absolute `.sr-only` label inside main used body as its containing block. Giving the main scroll pane `position: relative` kept the label inside its clip and immediately reduced document height to 1000px. A regression assertion now covers absolute descendant containment.
3. **Production blur was missing.** The refresh CSS was imported and theme tokens applied. But the standard `backdrop-filter` came before its prefixed counterpart. Production minification retained only `-webkit-backdrop-filter`, which Chromium ignored: computed blur was `none`. Reordering the declarations preserved the standard property. Rebuilt production cards compute 20px blur on desktop and 16px on mobile; sidebar/header use 24px. Earlier development-only checks missed this.

## Files changed in this correction

- `src/App.jsx`: reset only the main content pane on route changes.
- `src/styles/design-refresh.css`: viewport-height grid shell; desktop sidebar/header in normal layout; independent content/sidebar scrolling; responsive fixed drawer; proper containing block; corrected blur declaration order. Refined empty states, progress typography, tracked-time presentation, deadline wrapping and tracker fields. Retained atmospheric gradients and the reflective, pointer-reactive CSS 3D hero.
- `tests/e2e/design-shell.spec.js`: seven regression tests for shell geometry, scrolling, route layouts, absolute descendants, drawers, short-screen dialogs, task actions and motion preferences.
- `tests/helpers/design-preview.html` and `tests/helpers/design-preview.jsx`: test-only entry point rendering the real App and routes with empty memory-only repositories. Never imported by the production entry point.

Existing package, main.jsx, Dashboard.jsx, GlassOrbit.jsx and earlier report changes were preserved. Authentication, Supabase configuration, .env, repositories, backend, database, calendar operations, meeting logic and Work Log persistence were not edited. No live records were changed.

## Validation

- Lint succeeds with three existing WorkspaceGate/MeetingsPage warnings.
- Targeted unit tests (`phase4`, `tasks`, `timer`, `repositories`): **23 passed**.
- New Playwright suite against the compiled production preview: **7 passed in 26.6 seconds**. Also exercised in development. An initial test expectation was corrected to the existing Meetings heading, `AI Meeting Assistant`.
- Checked 1440, 1024, 768 and 390px. Header top: 18px desktop, 12px tablet/mobile. Main begins below it at 94px / 88px. Document height equals viewport height. No document or main horizontal overflow. Content scrolling leaves the shell stationary.
- Independent sidebar scrolling, mobile drawer navigation, Escape dismissal and reachable dialog actions at 390x600 verified.
- Tasks, Projects, Calendar, Meetings, Work Log, Analytics, Settings and Dashboard checked on desktop and mobile. Route changes reset content scroll.
- Task creation and updated overview checked using a disposable memory-only record. No fabricated records appear in real workspaces.
- Reduced motion disables ambient animation; normal motion enables float and pointer response. No WebGL dependency added.
- Production desktop, tablet, mobile and scrolled screenshots actually inspected. Compiled CSS and computed blur checked.
- `git diff --check` passes.

## Build and authentication limitations

Normal `npm.cmd run build` still fails the existing local VITE_API_URL HTTPS-origin validation. A process-only empty `VITE_API_URL` override successfully builds the normal production bundle; no .env or deployment configuration was changed.

A temporary multi-entry build under `.cache/d1-layout-build` compiled the real production entry and test-only preview for production CSS and browser regressions. Diagnostic scripts/config were removed afterward.

**No live authenticated dashboard was available.** Playwright reached sign-in in the real app; access to the user's open browser window timed out. Dashboard screenshots use the real App through an isolated test context, not a verified server session. Live login, remote persistence, populated production records, recording and AI backend flows were not verified.

## Screenshots

- Before reproduction: `artifacts/d1-layout-before-scrolled-full.png`
- Production after: `artifacts/d1-shell-production-{1440,1024,768,390}.png`
- Shell at top and after content scroll: `artifacts/d1-shell-top-{1440,1024,768,390}.png`, `artifacts/d1-shell-bottom-{1440,1024,768,390}.png`
- Drawers: `artifacts/d1-shell-drawer-{1024,768,390}.png`

Rerun development regression with `node node_modules/@playwright/test/cli.js test tests/e2e/design-shell.spec.js`.
