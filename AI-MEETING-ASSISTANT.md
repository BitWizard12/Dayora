# Dayora AI Meeting Assistant

## Features
- Workspace-scoped meeting records with title, type, attendees, agenda, project, transcript, and editable minutes.
- In-person microphone recording and online tab/screen audio capture when the browser supports it and the user shares audio.
- Bounded audio/video uploads, transcription, and optional FFmpeg audio extraction from video.
- AI-generated summary, discussion points, decisions, unresolved questions, and suggested action items.
- Convert action items to Dayora tasks and link the task IDs to the meeting.
- Save meeting elapsed time to the existing Work Log.

## Server configuration
Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY on the Express/Render service to the same Supabase project used by the frontend. Then add OPENAI_API_KEY as a secret environment variable on the Express/Render service. Never add it to Vite variables, Git, or the browser. Optional variables:
- OPENAI_TRANSCRIPTION_MODEL (defaults to whisper-1)
- OPENAI_MEETING_MODEL (defaults to gpt-4o-mini)

Without a key, manual meeting records still work, while transcription and AI summary endpoints return a setup-required error. AI calls may incur provider charges; they are user-triggered and rate-limited.

## Upload limits and retention
- Uploads are limited to 24 MB; compress or split longer recordings before upload. Transcription runs asynchronously after the upload is accepted.
- Supported formats: MP3, WAV, M4A, AAC, OGG, WebM, MP4, MOV, and MKV. Video audio extraction requires ffmpeg on the backend host; if unavailable, upload audio only.
- Original media is processed in memory or a temporary directory and removed after processing. Dayora stores metadata, transcript text/segments, and minutes in the user-scoped meetings collection in the existing Supabase dayora_collections table.
- Transcript text is capped at 100,000 characters and timestamp segments at 100 to keep each Supabase record within size limits.
- Browser capture requires explicit user action and participant consent. Online capture requires tab/screen sharing with audio enabled; microphone-only recording cannot capture remote audio heard only through headphones.
- Browser live speech preview uses the Web Speech API when available. The server-generated transcript after stopping is the persisted transcript of record.
- AI minutes are a draft. Review names, decisions, assignees, and due dates before sharing.

## Security
- Endpoints require the existing authenticated Dayora session and CSRF protection for mutations.
- Every request validates the Supabase access token and checks that the requested workspace ID matches the signed-in user's own workspace. Project and task references are checked against that same user's existing Supabase collections. Queries use the user's bearer token and publishable key, so Supabase row-level security remains active; no service-role key is required.
- The AI provider key is used server-side only. Raw recordings are not stored in Firestore or Firebase Storage.
- Deleting a meeting removes its transcript and minutes. Tasks already created from action items remain as independent Dayora tasks.

## Deployment
1. Merge this feature branch only after reviewing the pull request and verifying frontend/backend checks.
2. Add OPENAI_API_KEY in Render's service environment. Optionally configure model names.
3. Ensure ffmpeg is available on Render if video uploads are needed. Audio-only uploads do not need ffmpeg.
4. Deploy frontend and API from the same commit.
5. Test recording, upload transcription, AI minutes generation, task creation, and Work Log persistence in a real browser.

No provider credentials are included in this repository.
