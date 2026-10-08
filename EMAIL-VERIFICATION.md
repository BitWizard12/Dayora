# Firebase email verification diagnosis and repair

## Root cause

The frontend and backend targeted `dayora-5a3ad`, but `server/.env` contained a different, malformed `FIREBASE_WEB_API_KEY`. A read-only production probe using an intentionally invalid synthetic action code distinguished the failure: Firebase rejected the backend key itself, while the frontend key reached action-code validation. The backend previously mapped both responses to the same expired/invalid-action message.

The local backend key now matches the working Firebase web-app configuration. No credentials or action codes are recorded in this document. No existing account was manually verified, no production verification code was consumed during diagnosis, and nothing was deployed.

The root `.env.example` also contained a malformed backend key. Both example keys now use matching descriptive placeholders, so copying that template cannot silently reproduce the original mismatch.

## Flow audit

1. Express uses Admin SDK `generateEmailVerificationLink(email)` and extracts the generated link's `oobCode`.
2. This is a Firebase email action code, not a custom authentication token or Dayora session token.
3. The email template encodes it as `token`; the frontend sends `{token}` to Express.
4. Express translates that field into `{oobCode}` for the production Identity Toolkit `accounts:update` endpoint. Password reset uses `accounts:resetPassword`.
5. The custom `/#verify-email?token=...` URL intentionally targets Dayora's handler, rather than Firebase's hosted handler.
6. Hash parsing lives in the testable `parseAuthRoute` service and handles both verification and password reset.
7. Templates encode once with `encodeURIComponent`; URLSearchParams decodes once. Tests include punctuation that would otherwise corrupt query strings.
8. Resend generates another Firebase action link for an unverified, enabled identity. Dayora does not implement its own invalidation or guarantee that older codes survive another issuance. Firebase controls validity and expiry; the newest email is the supported path. Successful codes cannot be replayed.
9. Admin link generation was correct; its credentials are independent of the invalid REST Web API key. Generating another link could not fix that configuration.
10. Production uses Google's HTTPS endpoint; only explicit demo/localhost emulator configuration selects the emulator endpoint. The REST contract is identical and tested for both.
11. Frontend and backend local project IDs match. The corrected Web API key is accepted by live Firebase. Backend startup and `db:verify` now also validate that key with a read-only public project-configuration request. Its returned `projectId` is a numeric project number, so it must not be compared directly to a Firebase project-name string. Acceptance validates key availability, not ownership of an arbitrary configured project: deployments must still align Admin credentials and both web configurations.
12. After consumption, Express checks Admin's authoritative `emailVerified` state before recording verification metadata. The UI returns to login; login obtains a fresh SDK ID token and Express still independently enforces verified email, account status, session validity and workspace ownership.

## Operational requirements

Keep `FIREBASE_WEB_API_KEY` set to the web-app API key for the same Firebase project as Admin and frontend configuration. A browser-only HTTP-referrer restriction is inappropriate for the backend's REST calls; use an appropriately restricted server key if separate keys are required. Enable Identity Toolkit and Email/Password authentication. Keep SMTP/preview delivery and origins configured correctly. Preview mail is development-only.

`db:verify` previously proved Admin/Firestore connectivity only. It now checks the Web API key too. Startup refuses a rejected key with an actionable, sanitized diagnostic. API configuration failures are distinct from expired codes, credentials, throttling and service outages. Keys, upstream response bodies and action codes are never included in these diagnostics.

These changes do not alter session expiry enforcement, rate limits, Firestore rules, private workspace boundaries or provider-controlled single-use expiry. They do not depend on paid Firestore TTL. An already-running process must restart to reload changed environment variables.

## Automated verification

Tests cover production/emulator REST request shape; rejected/restricted keys; expired and reused codes; transport outages; throttling; read-only key checks; encoded verification/reset links; emulator signup/resend/verification/login/reset; and browser signup, rendered resend-email navigation, code replay rejection, immediate login without reloading, password reset, private workspaces and account regressions. Production diagnostics are read-only; automated account mutations use the isolated `demo-dayora` emulators.

Executed on October 7, 2026: all 56 unit/integration/security-rule tests passed; all 8 authenticated browser tests passed, including the revised verification flow; lint passed. The corrected live `npm run db:verify` passed without modifying user records. A harmless synthetic-code request to the running development API reached normal action-code validation. Browser fixtures now use port 3101, leaving the running development API on port 3001 undisturbed.

The production build passed with `VITE_API_URL` explicitly set to the empty, supported same-origin configuration. The ordinary local build initially refused the development HTTP API URL in `.env`; its HTTPS production guard remains intact. Deployments using a separate API origin must supply the actual HTTPS production origin and matching CSP rather than shipping localhost configuration.

## Changed source and configuration files

- `server/.env` (ignored local configuration; corrected public Web API key only)
- `.env.example`
- `server/firebaseAuthApi.js`
- `server/index.js`
- `server/verify.js`
- `server/auth.js`
- `server/errors.js`
- `src/services/authRoutes.js` (new)
- `src/pages/AuthPage.jsx`
- `tests/firebase-auth-api.test.js` (new)
- `tests/auth.integration.test.js`
- `tests/helpers/browser-server.js`
- `tests/e2e/phase5.spec.js`
- `playwright.phase5.config.js`
- `vite.config.js`
- `package.json`
- `EMAIL-VERIFICATION.md` (new)

Generated build files and ignored local test logs are verification artifacts, not source changes.

## SMTP delivery setup ? October 8, 2026

Preview remains the default for local development and writes private JSON files under server/.mail-preview, independently of the shell working directory. SMTP sends branded verification and reset templates through the same createMailer abstraction. Signup and resend both request Firebase verification codes; password reset requests Firebase reset codes. Firebase remains authoritative for code validity, expiry and consumption. No authentication handlers or templates were replaced.

Set exactly these three backend variables in the environment file used by your backend (server/.env for dev:api/dev:all; root .env for start:api, or hosting secrets):

```dotenv
MAIL_MODE=smtp
MAIL_FROM=Dayora <onboarding@resend.dev>
SMTP_URL=smtps://resend:YOUR_RESEND_API_KEY@smtp.resend.com:465
```

Existing APP_ORIGIN must continue to identify your actual frontend. Keep all Firebase settings intact. Do not put SMTP variables into VITE_* variables, source control or frontend hosting configuration. Do not maintain conflicting copies in root .env and server/.env: Node's explicitly loaded server file takes precedence over dotenv's root fallback; injected process environment takes precedence over both.

Dayora uses Resend SMTP: host smtp.resend.com, port 465, implicit TLS, username resend, and a Resend API key as the password. Create a sending-capable API key in the Resend dashboard and replace YOUR_RESEND_API_KEY in the backend environment; percent-encode the key when necessary. The placeholder is rejected at startup. No real key is included in the examples. Reference: [Resend SMTP settings](https://resend.com/docs/send-with-smtp).

The requested onboarding@resend.dev sender is a starter/test sender: it can send only to the email address associated with your Resend account. For verification/reset emails to other Dayora users, add and verify your own domain using Resend-provided DNS records, then change MAIL_FROM to Dayora <hello@your-verified-domain>. Keep the same SMTP host/login/key. smtp:verify checks connection and authentication; it cannot certify sender permissions or recipient eligibility. The verification tooling explains the onboarding restriction without displaying credentials or recipient addresses. Reference: [Resend testing-domain restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

The existing provider-neutral abstraction remains compatible with other standard SMTP services. The selected Resend profile enforces smtps://, port 465, username resend and a supplied API-key password; other hosts retain their existing TLS rules. Use the host, SMTP-specific login/password, allowed sender and port supplied by that provider; Gmail requires an eligible account and an app password rather than the normal account password. Dayora supports smtp:// with enforced STARTTLS and smtps:// with implicit TLS. TLS 1.2 or newer and trusted certificates are required in every SMTP environment. URL paths/query options cannot weaken TLS. Timeouts bound connection, greeting and socket operations.

After pasting credentials, restart the backend to activate SMTP. No further code editing is required. Optional read-only check: npm run smtp:verify. It never sends mail, needs no Firebase connection and closes its transport. Optional actual inbox check in PowerShell:

```powershell
$env:SMTP_TEST_TO = 'your-intended-test-inbox'
$env:SMTP_TEST_CONFIRM = 'SEND_TEST_EMAIL'
npm.cmd run smtp:test
Remove-Item Env:SMTP_TEST_TO, Env:SMTP_TEST_CONFIRM
```

Test mail contains no Firebase code or action link. A successful verify checks connectivity/TLS/authentication, not sender acceptance or inbox placement. Actual sending can still fail due to sender policy or provider restrictions.

Startup rejects missing/invalid SMTP URLs and invalid/placeholder senders with sanitized messages. Delivery logs report SMTP_AUTH_FAILED, SMTP_CONNECTION_FAILED, SMTP_TIMEOUT, SMTP_SENDER_REJECTED, SMTP_RECIPIENT_REJECTED, SMTP_TEMPORARY_FAILURE or SMTP_UNAVAILABLE, with fixed actionable text. Logs exclude credentials, URLs, recipients, provider response bodies and action codes. Signup/resend/reset retain neutral public responses to prevent account enumeration. A mail failure does not verify an account or roll back signup; retry resend after correcting provider configuration. There is no automatic retry queue: resend generates a fresh Firebase code. Monitor mail_failed events and provider delivery reports.

Real provider authentication, sender acceptance and inbox delivery remain unverified until genuine credentials are configured. Automated tests use injected transports and isolated Firebase emulators; no live email is sent during tests.

SMTP follow-up validation on October 8, 2026: 60 unit/integration/security-rule tests passed; all 8 authenticated browser tests passed; lint passed; production build passed using the supported same-origin VITE_API_URL setting. Browser runner exited 0. Tests did not send live SMTP email or mutate the real Firebase project. Ignored logs are artifacts/smtp-unit.log, artifacts/smtp-browser.log and artifacts/smtp-build.log.

Resend follow-up validation on October 8, 2026: all 61 unit/integration/security-rule tests passed, including Resend TLS/login/key validation and verification-tool diagnostics; lint and production build passed. Build uses the existing supported same-origin VITE_API_URL setting. No live SMTP email was sent and real provider credentials were not added. Logs: artifacts/resend-unit.log and artifacts/resend-build.log.
