# Dayora Voice MVP

## Product promise

Speak a thought, review the text, and turn it into useful work without leaving Dayora.

MVP means the smallest reliable version of that experience. It does not mean cloning every Wispr Flow feature or putting more controls on the dashboard.

## First-release user journey

1. Open the existing microphone button or press Alt+Shift+V.
2. Choose a supported recognition language and explicitly start dictation.
3. Stop, review and edit the transcript. Optionally apply saved literal vocabulary/snippet rules.
4. Copy it, insert it into the previous text field, add it to today's note, or open task review.
5. Close and reopen the panel without losing the draft in this tab.

Task creation still requires the existing task-editor submission. Notes use existing workspace repositories. No voice instruction autonomously creates/deletes records.

## MVP scope

| Capability | Current implementation |
| --- | --- |
| One unobtrusive entry point | Header microphone + keyboard shortcut |
| Start/stop recording | Browser speech recognition, explicitly activated |
| Transcript review | Editable draft and interim recognition status |
| Personal vocabulary | Literal word/phrase replacements, applied on request |
| Reusable snippets | Whole-draft spoken trigger expansion, applied on request |
| Useful destinations | Clipboard, previous field, existing task review, today's note |
| Draft protection | In-memory recovery across panel closure, route changes and cancelled task review |
| Recovery from destructive text edits | Undo clear / Undo text-rule application |
| Error handling | Denied permission, no speech, unavailable mic/network/language; text fallback |
| Calm design | Existing glass surfaces, miniature 3D orbit, collapsed personalization, reduced motion |
| Privacy | No audio recording/history stored by Dayora; browser provider may process audio online |

Draft recovery is intentionally limited to the current App session. Reloading, signing out or closing the tab clears it. It is not a backup or a cloud transcript history. Saved notes, tasks and preferences retain their existing repository behavior.

## Explicitly outside this MVP

- AI rewriting, tone selection, semantic cleanup and natural-language command execution.
- Dictation into other desktop apps or websites. That requires a separate desktop integration.
- Offline/on-device speech recognition guarantees.
- New meeting recorder, meeting-summary backend or parallel Notetaker interface; reuse existing Meetings.
- Audio library, transcript history, team analytics, subscription/billing screens or extra sidebar destinations.

The text replacements are not AI. Transcription punctuation and recognition quality depend on the browser service. A future optional AI cleanup step needs a separately verified authenticated backend, provider configuration, data-handling policy and explicit review of its output; it must preserve the original transcript.

## Acceptance criteria

- Recording never starts merely by opening the panel.
- Stop and close stop microphone recognition; late callbacks cannot alter a closed session.
- Recognized final text and typed edits survive panel closure and cancelled task review.
- Clear and text-rule application can be undone while the panel remains open.
- Task review creates nothing before submission. Note addition preserves existing unsaved note content.
- Errors preserve the draft and leave useful recovery actions.
- Password fields are excluded; changed/disconnected destination fields are not overwritten.
- No document/panel horizontal overflow at 1440, 1024, 768 and 390px.
- No extra main navigation destinations; all advanced voice controls stay inside the panel.

## Work started in this increment

Moved the draft into App session state instead of destroying it on VoicePanel unmount. Added explicit Clear/Undo controls and undo for text-rule application. Added browser regression for closing/reopening, cancelled task review, undo and clearing on reload. No additional persistent storage, recording history, provider dependency, backend or authentication change was introduced.

## Release gate

Automated checks use a simulated recognizer and memory-only workspace. They do not establish live microphone accuracy or authenticated remote persistence. Before calling this MVP release-ready, verify the real signed-in experience with microphone allow/deny, speech in the user's chosen languages, actual note/task persistence and reload/sign-out isolation. Resolve the existing production API-origin configuration separately; do not weaken its validation.

Keep all work local until release is explicitly authorized.

## Next increment: transcript review (November 11, 2026)

Added an opt-in **Tidy spacing** action in the existing voice editor. It prepares a read-only preview and leaves the original draft unchanged until **Apply spacing**. **Keep original**, closing the panel during preview, and **Undo** after applying preserve the original text. Destination actions and dictation are disabled while reviewing a preview.

This is local formatting, not AI rewriting. It preserves words, punctuation, paragraph breaks, list indentation, Markdown hard breaks, and fenced/indented code. No text leaves the browser for this operation. The review area uses the existing lavender/blue glass palette, blur and layered shadows; no new navigation or dashboard widget was added.

Validation: five voice unit tests and 16 voice/shell browser regressions passed. Coverage includes preview/apply/cancel/undo and 1440/1024/768/390px layouts. Lint retains the same three existing warnings. The default local build still fails existing API-origin validation; a process-only empty VITE_API_URL builds successfully without editing .env. Browser speech and workspace data are simulated in these regressions.

Optional AI rewriting is still pending. It needs a separate authenticated, rate-limited server endpoint, provider configuration, clear disclosure before sending draft text, cancellation/error handling, and original-versus-suggestion review. Do not send provider keys from the browser or repurpose meeting-summary routes. No authentication, backend, database, repository, or deployment changes were made in this increment.

## Following increment: optional AI rewriting

Implemented locally after the spacing increment; deployment and real-provider validation remain pending. See [DAYORA-VOICE-AI.md](DAYORA-VOICE-AI.md) for current behavior, verification and release requirements. The original MVP exclusions above describe the first release.
