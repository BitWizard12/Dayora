# Dayora Voice Studio — initial implementation

Implemented locally on feature/dayora-flow-3d-redesign. No commit, push, merge or deployment.

## Product experience
One microphone button in the existing header opens Voice studio. Alt+Shift+V is an alternative when no dialog is open. No new sidebar route, dashboard widget, or competing meeting recorder was introduced.

The panel reuses the existing glass palette, modal focus trap, reduced-motion settings and a miniature GlassOrbit. Optional personalization stays inside a collapsed disclosure. The dialog scrolls on mobile.

## Delivered
- Explicit start/stop browser dictation with final/interim text, selectable recognition language, editable final draft, and visible microphone/network/unsupported-browser errors.
- No auto-recording, background restart, or stored audio. Closing the panel aborts recognition and ignores late callbacks.
- Draft a task through the existing task editor: review is required, and nothing is created until the existing Create task action is submitted. Long drafts retain their full text as the description.
- Append to today's note using existing workspace repositories, flushing pending edits first. DailyNote now clears a successfully saved local draft only when it still matches that save, allowing external additions to appear without discarding later edits.
- Insert text into the previously focused supported input/textarea selection. Password fields are excluded, changed/disconnected targets are rejected, field length limits are respected, and native input events preserve React form behavior.
- Copy text for use elsewhere.
- Saved language, spoken shortcut expansions and vocabulary replacements through workspace value repositories. Rules apply only when requested. Snippets require a full trigger match; vocabulary uses Unicode-aware word boundaries and escaped literal matching.
- Link to existing Meetings, preserving its current workflow.

## Scope and limitations
This is an initial in-app voice toolkit, not complete Wispr Flow parity. No AI rewriting, semantic correction, writing styles, autonomous voice commands, system-wide typing, offline recognizer, or new Notetaker backend was implemented. Punctuation and transcription quality are controlled by the browser speech provider. Personalization currently applies rules to text after recognition; it does not train or bias the recognizer.

SpeechRecognition/webkitSpeechRecognition availability and supported languages depend on the browser. Browser services may process audio online; this is disclosed before recording. Dayora does not capture audio blobs or store audio from this panel. Type/paste fallback remains available where recognition is unsupported. The MVP reliability increment now preserves the draft in App memory across panel closure and cancelled task review; reload or sign-out clears it. Clear and text-rule application support Undo. See DAYORA-VOICE-MVP.md for the current acceptance criteria.

## Files
- src/services/voice.js: recognition lifecycle, literal text rules, scoped workspace operations, field insertion and task draft preparation.
- src/components/VoicePanel.jsx and src/styles/voice.css: lazy-loaded voice panel and compact glass styling.
- src/App.jsx, src/components/Header.jsx: launcher, shortcut, captured field target and reviewed task handoff.
- src/components/TaskDialog.jsx: optional initial title/description for a new draft; existing edit/save commands retained.
- src/components/DailyNote.jsx: successful-save draft reconciliation.
- src/components/Modal.jsx: optional subtitle with previous default preserved.
- src/styles/application.css: voice stylesheet import.
- tests/voice.test.js, tests/e2e/voice.spec.js, playwright.voice.config.js: service and browser regression coverage.

Authentication, Supabase/Firebase configuration, backend services, database schema and existing repository implementations were not changed. No dependency added. Existing uncommitted design work was retained.

## Validation
- 27 unit tests passed: voice, repositories, tasks, timer and phase4 suites.
- 14 Playwright tests passed: eight existing shell checks and six voice scenarios. Responsive screenshots retaken after waiting for modal entrance opacity to reach 1; the responsive scenario passed again.
- Simulated recognition tests cover explicit start, final/interim handling, task review, permission denial, disposal, unsupported fallback, note preservation, field insertion and saved text rules. Tests use only isolated memory repositories and never modify live user records.
- Visually inspected settled screenshots at 1440px and 390px; automated layout checks also passed at 1024px and 768px.
- Lint succeeds with the same three pre-existing WorkspaceGate/MeetingsPage warnings.
- Normal build remains blocked by existing VITE_API_URL HTTPS-origin validation. A process-only empty VITE_API_URL override builds successfully; no .env changes.
- git diff --check passes.

No live microphone transcription accuracy or authenticated remote-workspace verification was performed. The browser suite uses a simulated recognizer; real microphone/permission/provider behavior still needs a manual acceptance check in the user's browser.

Screenshots: artifacts/dayora-voice-{1440,1024,768,390}.png

Rerun browser checks: node node_modules/@playwright/test/cli.js test --config playwright.voice.config.js
