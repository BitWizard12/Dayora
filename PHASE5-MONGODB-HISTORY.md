# Obsolete MongoDB/Atlas history — superseded by the Firebase migration

# Dayora Phase 5

Phase 5 continues the existing application. Milestones 5.1–5.4 are implemented and locally validated. Milestone 5.5 adds deployment configuration and local production-build checks; external production verification remains pending. A successful local build is not a production security certification.

## Milestone 5.1 — foundation

Added modular Express configuration, database connectivity, structured safe errors, credential-free request logs, liveness/readiness endpoints, environment examples, and Vite's development API proxy. Visible branding uses Dayora and “Your Day, Your Way.” Existing legacy storage keys remain migration identifiers.

Install dependencies with `npm ci`. Copy `server/.env.example` to `server/.env`, configure a MongoDB replica set or Atlas URI, and run `npm run dev:all`. `npm run dev` and `npm run dev:api` also run separately. Production injects environment variables and uses `npm run start:api`.

MongoDB credentials and SMTP credentials belong only in the backend environment, never in `VITE_*` variables. Actual environment files and development mail previews are ignored.

Validation and later milestones are recorded below as implemented.

Foundation validation: configuration/health/origin/error test passed; lint and production build passed.

## Milestone 5.2 — authentication

Added verification-gated signup/login, Argon2id (64 MiB, three iterations, one lane), random opaque server sessions stored as SHA-256 hashes, persistent-login expiry, single-use verification/reset tokens, logout, logout-other-devices, password change, and profile updates. Cookie security is Secure/HttpOnly/SameSite in production; development HTTP uses HttpOnly/SameSite=Lax. Mutations require an exact allowed Origin and authenticated mutations also require the session's in-memory CSRF token. No credentials/session tokens are written to browser storage. Auth pages and account profile/security controls reuse existing styling and animation tokens. Public registration rejects extra fields, including role/ownership.

Authentication integration test passed against an isolated real MongoDB replica set: admin signup rejection, email normalization, unverified login rejection, verification/reset token replay rejection, hashed tokens, HttpOnly/SameSite cookies, missing CSRF rejection, session invalidation and expiry, safe public user responses, and generic reset responses. Authentication production build passed. SMTP delivery and HTTPS Secure cookies require deployment configuration and have not yet been exercised against an external service.

## Milestone 5.3 — account persistence

HTTP workspace adapter preserves repository commands and stable subscribed snapshots. Account workspaces have no demo seeds. The server derives scope from the session, strips supplied ownership, validates linked projects/members and record fields, recomputes event instants, stamps current completion timestamps, and stores flat records in separate MongoDB collections. Subtasks remain embedded and ordering remains a task field, preserving existing models. Each private workspace has one owner; no sharing/membership feature is needed yet.

Snapshot reads and revision-checked writes use MongoDB transactions. Member removal/rename and project-link cleanup are atomic. Historical time entries retain removed project IDs. Concurrent stale writes return 409 and refresh the client rather than silently overwriting another device. Clients refresh on window focus and every 30 seconds while visible; this is polling, not real-time collaboration. Login/logout/password changes notify other tabs through BroadcastChannel without transmitting credentials or workspace data. Account changes immediately clear repository snapshots and configure fresh account scope. Aborted requests and session-generation checks prevent delayed responses from restoring a previous account.

Explicit local migration is available through “Review local import” when stored anonymous records exist. It requires an empty account workspace, retains local backups, remaps imported IDs/links, derives account ownership, preserves unknown dates, and commits all imported collections atomically. Nothing is automatically uploaded after signup.

Two workspace integration tests passed: scope spoofing, guessed foreign IDs, foreign references, stale revisions, atomic rename/remove cleanup, task completion, event/time persistence, project deletion, and explicit migration/refusal. Lint and production build passed.

## Milestone 5.4 — administration

Separate lazy-loaded admin dashboard provides registered/active/signed-in counts, verified/admin counts, health, searchable paginated account metadata, activation/role changes and paginated audit logs. Backend authentication and role checks protect every admin route. Admins have no other-user workspace endpoint and normal workspace access still resolves only their own scope.

Account mutations require the administrator's current password and a recorded reason. Self-access changes are rejected; a transaction guard serializes role changes and retains the final active administrator. Account changes invalidate sessions; deactivation also revokes reset/verification tokens. Private records remain retained. First-admin bootstrap only promotes an existing verified active account, requires explicit server-side confirmation, refuses when an admin already exists, and writes an audit event.

Admin integration test passed for nonadmin denial, metadata-only listing, private-record isolation, password reauthentication, self-change rejection, session revocation, role changes and audit persistence. Lint and production build passed.

## Milestone 5.5 — deployment preparation and validation

Added Vercel frontend configuration/security headers, Render backend blueprint, explicit production HTTPS/SMTP validation, Secure cookies, exact-origin credentialed CORS, origin/CSRF checks, API/auth limits, safe errors, database index command, graceful SIGINT/SIGTERM shutdown, environment examples and secret ignores. The backend and frontend remain independently deployable. Native Argon2 installation is explicitly approved at its locked version; MongoDB test downloads are disabled during dependency installation and only needed when running tests without a system binary. The development runner uses Node's child-process API without the advisory-affected shell runner dependency.

### Database schema and indexes

| Collection / model | Contents and indexes |
| --- | --- |
| Users | UUID `_id`, unique normalized email, Argon2id hash, verification/active flags, user/admin role, unique private workspace ID, name/about/job title/photo, creation and last-login dates |
| Sessions | SHA-256 token `_id`, indexed user ID, session CSRF token, creation/expiry; TTL expiry index; expiry also enforced on every request |
| Account tokens | SHA-256 token `_id`, indexed user ID, verify/reset purpose, creation/expiry; TTL expiry index; transactionally consumed once |
| Workspaces | UUID `_id`, unique owner ID, name, revision and creation date; owner is authoritative and no sharing grants exist |
| record_projects / record_tasks / record_events / record_teams / record_time_entries / record_notifications / record_settings / record_profile_photos | Separate collections with scoped metadata and validated compatible JSON `data`; unique `(ownerId, workspaceId, id)` index; tasks embed UUID subtasks and numeric position |
| Administrative audits | UUID ID, actor/target IDs, action, before/after account-access fields, reason and indexed creation date; no passwords or private task content |
| Admin guard | Singleton transaction revision serializing bootstrap/access changes |
| Rate buckets | Shared MongoDB fixed-window counters keyed by namespace/hashed IP; TTL expiry index; expiry enforced atomically using database time |

New account records use UUIDs. Local stable IDs remain unchanged on the device; import maps them to fresh UUIDs in the destination account. Record payloads intentionally retain the existing frontend schema. Server validators whitelist fields, limit sizes, validate statuses/deadlines/relationships/photos/timer segments, and derive ownership and timestamps. Session/token records use cryptographic hash IDs rather than public UUIDs.

### Authentication details

- Password length: 12–128 characters; Argon2id uses 64 MiB, three passes and one lane. Login includes a dummy hash verification for nonexistent accounts. Email is trimmed/lowercased and unique; verification gates access. Signup/reset/resend responses do not disclose account availability.
- Session IDs: 32 random bytes; only their SHA-256 hashes are stored. Nonpersistent login has a browser-session cookie and 12-hour server expiry. Persistent login has a 30-day cookie and absolute server expiry. Sessions rotate on login and cannot be minted from a stale password following a concurrent reset.
- Verification expires after 24 hours; reset after 30 minutes. Only token hashes are stored. Consumption and associated mutations are atomic. Reset/password change invalidates sessions; password change also revokes outstanding account tokens. Logout-other-devices retains the current session.
- Production uses a host-only `__Host-dayora` cookie with Secure, HttpOnly, Path=/ and configured SameSite. No cookie Domain is set. Development uses a separate cookie name over local HTTP.
- CSRF values remain in frontend memory and are tied to the server session. Authenticated mutation endpoints require them. All mutations, including login/signup/reset, require the exact configured Origin. CORS alone is not treated as authorization. JSON-only inputs and strict auth payloads reject injected roles/scopes.
- Account changes invalidate the target's sessions. Existing sessions are checked against active/verified users on every request. Admin role is fetched from the server, never accepted from signup or browser storage.

### Anonymous migration

1. Keep the old browser profile/device with its local records. Sign up and verify the destination account. The new account initially contains no demo records.
2. Sign in on that device. Select **Review local import**, inspect the collection counts and destination explanation, then explicitly confirm **Import into my empty workspace**.
3. The server refuses nonempty accounts and stale revisions. The import remaps IDs/project/member/subtask references, derives destination ownership and preserves unknown history. The transaction rolls back on invalid data.
4. Original legacy and canonical local backups remain on that device. Do not hand an old browser profile to another person: anonymous backups are device data, not authenticated private storage.

Partial migrations omit missing collections; they never manufacture demo records. Orphan project references without an imported source are cleared during ID mapping; historical session labels remain. Existing CSV import continues through repository commands and server validation.

### First administrator

Create and verify an ordinary account first. Use a trusted backend shell with that deployment's environment (never the browser). For local development:

```powershell
$env:ADMIN_BOOTSTRAP_EMAIL='your-verified-account@example.com'
$env:ADMIN_BOOTSTRAP_CONFIRM='GRANT_FIRST_ADMIN'
npm run admin:bootstrap
Remove-Item Env:ADMIN_BOOTSTRAP_EMAIL, Env:ADMIN_BOOTSTRAP_CONFIRM
```

With production environment variables already injected, run `node server/bootstrap-admin.js` instead. Bootstrap refuses an unverified/inactive account, missing confirmation or any existing administrator. It records an audit entry. Sign in again; **Dayora Admin** appears in the sidebar. Subsequent account changes use the authenticated admin dashboard and require the administrator's current password and a reason. Self-access changes are blocked. Concurrent demotions were tested to retain one active administrator. Admins cannot grant themselves another account's workspace access.

### Deployment instructions

1. **Atlas:** provision a supported replica-set cluster and dedicated least-privilege database credential. Restrict network access to the backend's outbound addresses where available; use the Atlas TLS connection URI with correctly encoded credentials. Set a named Dayora database. Transactions require a replica set, not a standalone MongoDB server. Do not use a test database or the browser-test launcher in production.
2. **Render API:** use `render.yaml` or create a Node web service with `npm ci --omit=dev` and `npm run start:api`. Set `NODE_ENV=production`, `MONGODB_URI`, exact HTTPS `APP_ORIGIN`, real `SMTP_URL`, verified `MAIL_FROM`, `MAIL_MODE=smtp`, `TRUST_PROXY=1` only when behind the expected single trusted proxy, and `COOKIE_SAME_SITE=lax` for same-site custom domains. The host supplies `PORT`. The API binds the supplied port; liveness/readiness paths are `/api/health/live` and `/api/health/ready`.
3. **Indexes:** before starting the production API, run `node server/indexes.js` from the trusted production shell. Production automatic indexing is disabled; this command creates required indexes without dropping existing ones. Production startup checks required unique/TTL indexes and refuses to serve if any are missing. The local equivalent is `npm run db:indexes` with `server/.env` configured.
4. **Vercel frontend:** deploy the repository with `npm run build` and `dist` output (`vercel.json`). Set only `VITE_API_URL=https://api.your-domain.example`; Vite variables are public. Rebuild after changing it. Do not put MongoDB/SMTP credentials in Vercel frontend variables. Tighten `connect-src` in the included CSP to the exact API domain for your deployment.
5. **Domains/cookies:** use `app.your-domain.example` and `api.your-domain.example` on HTTPS so they are same-site; cross-origin fetches already include credentials. Distinct `vercel.app`/`onrender.com` sites require `COOKIE_SAME_SITE=none` and HTTPS, but browser third-party-cookie blocking can still prevent sessions. Prefer same-site custom domains or a reviewed same-origin API proxy. Configure one exact frontend Origin; arbitrary preview domains are deliberately not trusted. Use separate staging services/databases/email configuration for previews.
6. **Mail:** configure SPF/DKIM/DMARC and the SMTP provider's verified sender. SMTP accepts only smtp/smtps URLs, ignores URL query configuration, validates certificates, requires TLS in production and applies connection/socket timeouts. Test verification, resend, reset, failure/retry and spam-folder behavior. Preview mail is refused in production and never returned by production APIs.
7. **Monitoring:** alert on readiness failures, sustained 5xx/429s, process restarts, database latency/storage and SMTP failures. Request logs include correlation IDs, method/path/status/duration; query strings, bodies, passwords and session tokens are omitted. Shutdown stops accepting requests, drains existing requests and disconnects MongoDB, with a ten-second fallback deadline.

### Backups and restoration

Choose an Atlas tier with the required backup/PITR support, define retention and recovery objectives, and enable scheduled backups. Before release, restore a snapshot into a separate nonproduction cluster compatible with the backup's MongoDB version. Inject the restored URI into a staging API; verify owner/workspace indexes, counts, references, login and representative CRUD. Delete restored sessions and account tokens through a trusted database maintenance process before granting access, so a restore cannot revive previously revoked credentials. Keep production writes pointed at the original cluster throughout the drill. Document the verified recovery time, then perform any real cutover through an approved maintenance window. Atlas tier-specific backup availability and an actual restoration drill are not verified here.

### Validation

- Existing Phase 2–4 browser suite: **15 passed**, covering entity CRUD, task/subtask operations, drag/keyboard sorting, timer timestamp accuracy/pause/reload, deadlines/timezones, assignment cleanup, analytics/CSV, persistence, responsiveness and reduced motion.
- Account production-build browser suite: **7 passed**. Uses real HTTP routes and an isolated MongoDB replica set, not mocked repository responses. Covers signup/verification/reset, protected routes, private projects/tasks/checklists/team/events/timer/analytics, two independently authenticated browser contexts, logout/relogin, delayed session responses, account switching across shared browser tabs, direct foreign-ID denial, nonadmin denial, explicit migration/backups, admin changes, profile edits, responsiveness and reduced motion.
- Original Phase 5 unit/integration suite: **34 passed**. The production-readiness follow-up below adds eight tests. Original lint/build/audit/visual checks are retained as historical results.
- Security integration tests cover token replay/expiry, CSRF, Origin rejection, role injection, scope spoofing, private reads/links, stale revisions, atomic cleanup/import, session revocation, Argon2 hashes, rate limits, Secure/HttpOnly/SameSite flags, persistent expiry, HTTPS/CORS headers, safe JSON errors, concurrent admin demotions, audit logs and server bootstrap.
- Commands: `npm test`, `npm run lint`, `npm run build`, `npm run test:e2e`, `npm run test:e2e:accounts`. `playwright.production.config.js` now aliases the Phase 5 production account configuration. Regression bypass exists only with Vite DEV + mode=regression and is removed from normal production builds.
- Temporary replica sets detect the installed Windows MongoDB 9.0 binary. For another installed version set `MONGOMS_SYSTEM_BINARY` and `MONGOMS_VERSION`; without a binary, the test tool downloads one. Playwright's Chrome path must be adjusted outside this Windows machine.

### Unverified production requirements and practical limits

No Atlas credentials, real SMTP configuration, cloud deployment access or custom domains were supplied. Actual Atlas connectivity, SMTP delivery, HTTPS browser cookies, real cross-origin deployment communication, monitoring alerts and backup restoration remain unverified. No deployment was published and no production database or real user account was changed.

Production rate limits now use shared MongoDB counters with atomic expiry, fail-closed behavior and TTL cleanup; memory remains a local/test fallback only. SMTP dispatch is synchronous; a failed dispatch leaves a pending account/token, preserves generic public responses and emits safe operational failure events. The resend workflow permits recovery, but a durable delivery queue is not implemented. Profile email changes and two-factor authentication are not implemented; verified email is read-only and the security page accurately says MFA is unavailable. Team profiles are records, not invitations or shared-account grants.

Workspace writes preserve the existing collection snapshot contract, validate up to 5,000 rows per collection and accept at most a 12 MB request. Transactions now bulk-write only changed/removed records and retain unchanged update timestamps. The client polls every 30 seconds/focus with its known revision, receiving a small response when unchanged. Large-workspace performance, paginated entity APIs and true real-time synchronization require further load testing/optimization before scaling. Historical completion trends retain the Phase 4 current-state model and unknown legacy dates. These limits do not justify calling this deployment production-ready.

## Production-readiness follow-up

See [DEPLOYMENT.md](DEPLOYMENT.md) for the current authoritative deployment runbook. Production startup requires explicit NODE_ENV, proxy configuration, real sender, HTTPS origin, TLS MongoDB and shared MongoDB rate limits. Configuration and operational errors identify the action/field without emitting raw secret-bearing driver/SMTP messages. Database connection attempts are bounded; startup verifies replica-set transaction support and indexes. Readiness actively pings MongoDB and fails during shutdown. API writes require JSON, exact Origin and session CSRF; the shared frontend client supplies JSON for bodyless logout commands too.

Branded HTML/plain-text verification/reset templates include expiry and security guidance. SMTP failures preserve generic auth responses and emit credential-free failure events. `smtp:verify` checks connection/authentication; actual test sending requires explicit recipient/confirmation and does not claim inbox delivery. `db:verify` checks connectivity/topology/indexes/transaction reads. The idempotent index command now verifies its result. Admin bootstrap retains its server-only safeguards and suppresses raw operational errors.

Vercel configuration includes SPA refresh handling/HSTS and narrowly scoped CSP. `deployment:configure` writes the exact public API origin into CSP; build validation rejects unexpected VITE_* keys, non-HTTPS API origins and a missing CSP destination. Render includes index pre-deployment (on supported plans), shared limiter configuration, production start and readiness checks.

`deployment:smoke` defaults to passive health/frontend/unauthorized checks. Dedicated verified nonadmin credentials enable login/session/logout checks; explicit empty-workspace confirmation enables temporary project/task CRUD and cleanup. Signup has a separate explicit opt-in. `db:restore-check` requires staging confirmation and performs a read-only aggregate/ownership/relationship/index scan; it refuses remaining restored sessions/tokens. No destructive restore purge or external deployment is automated.

Final validation: **42 unit/integration tests passed**, including eight new production-readiness tests; **15 retained Phase 2–4 browser tests and seven production-account browser tests passed**. Lint and production build passed without bundle-size warnings. Three negative build checks also verified rejection of extra public VITE_* keys, HTTP API origins and missing CSP destinations. The first browser run detected bodyless logout being rejected by JSON enforcement; the shared API client was corrected before final verification. Database-index idempotency, bounded retries, fail-closed readiness/limiting, cross-instance counter atomicity, mail-outage privacy, incremental writes/revision checks, restore integrity and real-API smoke CRUD/cleanup are covered. Tests use isolated local replica sets; they do not establish Atlas/SMTP/cloud success. Tooling emitted only existing FORCE_COLOR/reduced-motion notices. No dependencies were added in this follow-up.

Current status: local checks verified; deployment code/configuration prepared; **not deployed and not production-verified**. Actual provider settings, custom domains/CSP configuration, SMTP inbox delivery, Atlas connectivity, HTTPS browser checks, alerts, load testing and backup restoration remain required. No real credentials, external database changes, test emails or cloud deployments were used.

### Exact files modified in this follow-up

- `.env.example`
- `server/.env.example`
- `package.json`
- `render.yaml`
- `vercel.json`
- `vite.config.js`
- `server/config.js`
- `server/database.js`
- `server/models.js`
- `server/app.js`
- `server/auth.js`
- `server/mail.js`
- `server/index.js`
- `server/indexes.js`
- `server/bootstrap-admin.js`
- `server/records.js`
- `src/services/api.js`
- `src/services/httpWorkspaceAdapter.js`
- `tests/security.integration.test.js`
- `README.md`
- `PHASE5.md`

### Exact files added in this follow-up

- `DEPLOYMENT.md`
- `server/operations.js`
- `server/rateLimitStore.js`
- `server/mailTemplates.js`
- `server/verify.js`
- `server/restore-check.js`
- `scripts/deployment-config.mjs`
- `scripts/smoke.mjs`
- `tests/production-readiness.test.js`

References: [Express security](https://expressjs.com/en/advanced/best-practice-security/), [OWASP sessions](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [Render Express deployment](https://render.com/docs/deploy-node-express-app), [Render health checks](https://render.com/docs/health-checks), [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [Atlas backup/restore](https://www.mongodb.com/docs/atlas/backup-restore-cluster/).

## Exact source/configuration files changed

Modified:

- `.gitignore`
- `index.html`
- `package.json`
- `package-lock.json`
- `vite.config.js`
- `playwright.config.js`
- `playwright.production.config.js`
- `README.md`
- `DAYORA-DATA.md`
- `src/main.jsx`
- `src/App.jsx`
- `src/components/Header.jsx`
- `src/components/Sidebar.jsx`
- `src/pages/SettingsPage.jsx`
- `src/data/seed.js`
- `src/repositories/createRepository.js`
- `src/repositories/workspaceRepositories.js`

Added:

- `.env.example`
- `render.yaml`
- `vercel.json`
- `playwright.phase5.config.js`
- `PHASE5.md`
- `scripts/dev.mjs`
- `server/.env.example`
- `server/config.js`
- `server/errors.js`
- `server/database.js`
- `server/app.js`
- `server/index.js`
- `server/models.js`
- `server/mail.js`
- `server/auth.js`
- `server/records.js`
- `server/admin.js`
- `server/bootstrap-admin.js`
- `server/indexes.js`
- `src/services/api.js`
- `src/services/authService.js`
- `src/services/adminService.js`
- `src/services/httpWorkspaceAdapter.js`
- `src/services/anonymousMigration.js`
- `src/hooks/useAuth.js`
- `src/components/SessionGate.jsx`
- `src/components/AnonymousMigration.jsx`
- `src/pages/AuthPage.jsx`
- `src/pages/ProfilePage.jsx`
- `src/pages/AdminPage.jsx`
- `src/styles/auth.css`
- `tests/backend-foundation.test.js`
- `tests/auth.integration.test.js`
- `tests/workspace.integration.test.js`
- `tests/admin.integration.test.js`
- `tests/security.integration.test.js`
- `tests/bootstrap.integration.test.js`
- `tests/helpers/backend.js`
- `tests/helpers/browser-server.js`
- `tests/e2e/phase5.spec.js`

Generated `dist/`, `test-results/`, `node_modules/` and `artifacts/phase5-*.png` are build/dependency/QA artifacts and are not additional application source changes. Original Phase 2–4 page components, their styles and reports were retained. No original application component was deleted.
