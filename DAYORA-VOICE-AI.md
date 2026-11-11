# Dayora optional AI rewriting — November 11, 2026

Implemented locally on `feature/dayora-flow-3d-redesign`. This increment has not been committed, pushed or deployed.

## Experience

Voice studio contains one collapsed **Rewrite with AI** section. Users choose Polish my words, Make concise, or Professional tone. Opening the panel or section does not send a draft. **Generate suggestion** explicitly sends the draft to the server and OpenAI, as disclosed beside the button.

The original remains unchanged alongside a read-only suggestion until **Use suggestion**. **Keep original** discards the suggestion; **Undo** restores the original after applying. Recording and destination actions are blocked while generating/reviewing. Cancel or closing the panel aborts the client request and late responses are ignored. Suggestions and rewrite history are not persisted by Dayora. Existing note/task review actions still require separate user actions.

## Server and client

- `server/voice.js`: new `POST /api/voice/rewrite`, separate from Meetings. Supabase verifies the bearer token via `getUser(token)` before any provider call. A supplied workspace header must match the verified user. No table access, schema changes or authentication-flow changes.
- Strict input requires explicit consent, a known style, and 1–10,000 characters; extra fields are rejected. Verified users get 12 requests per 15 minutes through the existing rate-limit store, in addition to existing application limits.
- OpenAI receives only the submitted draft and bounded editing instructions. `store: false`, output-token limits, a 25-second provider deadline, completion/refusal/size validation, and client-disconnect cancellation are applied. These measures do not guarantee semantic accuracy or provider retention behavior; users must review suggestions. Provider errors and credentials are not returned or logged as draft content.
- `src/services/voiceRewrite.js`: bearer-authenticated client requests without cookies, a 35-second fetch deadline, abort support, validated output and useful errors for unavailable API, missing configuration, expired session and limits.
- `src/components/VoicePanel.jsx` / `src/styles/voice.css`: optional controls reuse the glass palette and existing review area, without dashboard widgets or extra navigation.
- `server/index.js` registers the route; `server/.env.example` documents optional `OPENAI_VOICE_MODEL` (defaults to the existing meeting provider's default model, `gpt-4o-mini`). Uses backend-only `OPENAI_API_KEY` and existing Supabase URL/publishable key.

## Validation

- 15 targeted server/service tests passed, including existing voice and meeting validation, auth rejection/outage, workspace mismatch, consent/size/style validation, per-user limits, provider failures/refusal/incomplete output, and client errors.
- 19 browser regressions passed: shell, existing voice features, explicit generation, preview/apply/discard/undo, cancellation/late response and 1440/1024/768/390px containment and control reachability.
- Browser tests use isolated in-memory workspace data, a mocked session boundary and mocked AI endpoint. Server tests use the real application/router with mocked Supabase verification and provider responses. They do not establish real token verification, provider availability, output quality or billing behavior.
- Desktop and mobile screenshots inspected: `artifacts/dayora-voice-ai-{1440,1024,768,390}.png`.
- Lint passes with the same three existing WorkspaceGate/Meetings warnings. Build succeeds with the process-only empty `VITE_API_URL` override; the existing local API-origin configuration still needs separate correction. No `.env` changes.

## Release requirements

The frontend alone is insufficient. Deploy the new route in the API service as well, verify its existing startup prerequisites, backend-only provider key, Supabase configuration and allowed frontend origin. Verify the frontend's HTTPS API origin/CSP. The existing frontend tracks the feature branch; the API previously tracked `main`, so do not assume pushing this branch updates the API. Do not merge or change backend deployment settings implicitly.

Before release, verify a real signed-in synthetic rewrite, cancellation, provider failure/limit behavior and non-English/mixed-language examples. No real user transcript or provider request was sent during implementation.

## References checked

- [Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser): remote token verification.
- [OpenAI Chat Completions request](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create.md): server request parameters and completion handling.
