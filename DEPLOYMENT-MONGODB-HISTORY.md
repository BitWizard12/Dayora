# Obsolete MongoDB/Atlas history — superseded by the Firebase migration

# Dayora deployment runbook

Dayora's deployment code is locally tested. No Atlas cluster, SMTP provider, Render service, Vercel deployment, custom domain, monitoring integration or backup restoration was accessed during this work. External checks below remain launch requirements. Phases 1–5 and their private repository architecture are preserved.

## 1. Prepare environments and secrets

Use Node 22.20+ and `npm ci`. Create separate production and staging databases/services. Store backend credentials in the hosting provider's secret settings; do not commit them or place them in `VITE_*`. Local files such as `server/.env` are ignored. Commands below read injected environment variables; locally, use `node --env-file=server/.env <script>` instead when appropriate.

| Backend variable | Production value / behavior |
| --- | --- |
| `NODE_ENV` | Explicitly `production`; the backend entry point refuses an unset value |
| `PORT` | Supplied by Render; local default 3001 |
| `MONGODB_URI` | Secret Atlas SRV URI with a named database, e.g. `mongodb+srv://<encoded-user>:<encoded-password>@<cluster-host>/dayora?retryWrites=true&w=majority` |
| `APP_ORIGIN` | Exact frontend HTTPS origin, e.g. `https://app.<your-domain>`; no path, credentials, query or fragment |
| `TRUST_PROXY` | Explicit integer 0–5; normally 1 behind the expected Render reverse proxy. Do not use blanket trust or expose a direct bypass around the proxy |
| `COOKIE_SAME_SITE` | `lax` for HTTPS app/api subdomains of the same registrable domain; `none` only for intentionally cross-site hosting |
| `MAIL_MODE` | `smtp`; production rejects preview mail |
| `SMTP_URL` | Secret `smtps://<encoded-user>:<encoded-password>@<smtp-host>:465` or `smtp://...:587` with mandatory STARTTLS in production |
| `MAIL_FROM` | Explicit real provider-verified sender, e.g. `Dayora <hello@<your-domain>>`; example.com senders are rejected |
| `RATE_LIMIT_STORE` | `mongodb`; default in production and required there. Local development/test may use `memory` |
| `DB_CONNECT_ATTEMPTS` | 1–5, default 3; five-second connection selection per attempt and bounded retry delays |

The only public frontend environment setting is `VITE_API_URL=https://api.<your-domain>` (an exact HTTPS origin). Blank supports a reviewed same-origin `/api` deployment or the local Vite proxy. Other `VITE_*` keys are rejected. Password hashing, session lengths and token expiry are fixed server policies, not unvalidated runtime overrides: Argon2id 64 MiB/three passes, 12-hour browser sessions, 30-day remembered sessions, 24-hour verification and 30-minute reset links.

## 2. MongoDB Atlas

1. Create an Atlas project and production replica-set cluster with capacity/backup support appropriate to your workload. Choose a deployment region near the API. Create a separate staging cluster or database with separate credentials; a restore drill requires a separate target.
2. Create a dedicated database user. Grant access only to the named Dayora database. Application CRUD/transactions and rate-limit counters require read/write access; index provisioning also requires index permissions. Separate index/bootstrap maintenance credentials from runtime credentials if your operational policy requires narrower privileges.
3. In Network Access, allow the actual backend egress addresses or your approved private networking path. Do not leave broad public access as the default. Add a trusted maintenance host only for the required maintenance window.
4. Copy the driver SRV connection string into backend `MONGODB_URI`. Percent-encode username/password characters. Include the named `dayora` database; never leave the default database implicit. SRV enables TLS. Standard `mongodb://` production URIs require `tls=true`; TLS bypass options are rejected. Never print the URI in logs/screenshots.
5. With the production environment injected, run `node server/indexes.js`. It creates all required indexes without dropping existing indexes; repeating it is safe for already-valid indexes. A duplicate-email or conflicting-index error stops setup and must be investigated rather than bypassed. Production automatic indexing stays disabled.
6. Run `npm run db:verify`. It verifies connectivity, replica-set/sharded topology, all required unique/TTL indexes and a snapshot transaction read without changing user records. Production startup performs the same verification and refuses missing indexes or standalone topology.
7. Enable backups and agree on retention, recovery-point and recovery-time objectives. See the restore drill below before launch. Verify that your chosen Atlas tier supports the required backup/PITR features. [Atlas backup documentation](https://www.mongodb.com/docs/atlas/backup-restore-cluster/).

Indexes include normalized unique email, unique user/workspace ownership, session/token expiry TTL and user lookups, record `(ownerId, workspaceId, id)` uniqueness, administrative audit creation date and shared rate-bucket expiry TTL. TTL deletion is asynchronous: authentication and limiting enforce expiry in queries/updates independently of cleanup timing.

## 3. SMTP provider

1. Configure an SMTP provider, verify the sending domain/address and supply its host, port and authentication credentials through `SMTP_URL`. Set `MAIL_MODE=smtp` and the verified `MAIL_FROM` in the backend secret settings.
2. Publish the provider's exact SPF/DKIM records and an appropriate DMARC policy in DNS. Verify DNS and sender status in the provider dashboard. Do not copy placeholder credentials or generic SPF values from this repository.
3. Run `npm run smtp:verify` from a trusted shell with production environment variables. This verifies TLS connectivity/authentication only; it does **not** prove sender acceptance or inbox delivery. SMTP certificate verification remains enabled, TLS 1.2 is the minimum, and connect/greeting/socket timeouts are 10/10/20 seconds. [Nodemailer SMTP verification limits](https://nodemailer.com/smtp).
4. To send an explicit test message, set `SMTP_TEST_TO` to your intended test inbox and `SMTP_TEST_CONFIRM=SEND_TEST_EMAIL`, then run `npm run smtp:verify`. This sends a branded verification-template test with an intentionally invalid sample link. The command reports SMTP acceptance, not delivery. Inspect inbox/spam and provider events yourself. Clear these temporary variables afterward.
5. In staging, sign up real test accounts and confirm verification/resend/password-reset messages reach intended inboxes. Follow the actual links, confirm single use/expiry, verify password reset invalidates existing sessions, and check recovery through resend after an SMTP outage. Templates include Dayora, “Your Day, Your Way.”, an accessible plain-text alternative, expiry and security guidance. Links use fragments to avoid sending the token to static hosting/referrer logs.

Public auth requests retain generic responses even if an eligible account's mail dispatch fails. Alert on `mail_failed`/`mail_dispatch_failed`; the user can retry resend. Dispatch remains synchronous with bounded transport timeouts. No durable delivery queue or automatic retry worker was added. Provider acceptance can still be followed by a bounce; monitor delivery events.

## 4. Render API

1. Put the project in your chosen Git repository; no repository was initialized/pushed by this work. Create a Render Node web service or a Blueprint from `render.yaml`.
2. Build: `npm ci --omit=dev`. Pre-deploy: `node server/indexes.js`. Start: `npm run start:api`. `render.yaml` includes these values and `/api/health/ready`. Pre-deploy commands require a supported paid service. If unavailable, remove that Blueprint field and run the index command from a trusted maintenance environment before first startup. Do not enable auto-indexing as a workaround. [Render deploy stages and plan requirements](https://render.com/docs/deploys).
3. Supply every production backend variable in the table above. The server listens on `0.0.0.0` and Render's `PORT`. Native Argon2 installation must be allowed; its version remains pinned in the lockfile. No dev MongoDB launcher belongs in production.
4. Add the API custom domain `api.<your-domain>`, publish Render's exact DNS instructions and wait for verified HTTPS. Set `APP_ORIGIN` to the final frontend custom origin, not an arbitrary preview URL.
5. Check `/api/health/live` and `/api/health/ready`. Liveness reports the HTTP process; readiness actively pings the database and returns 503 on failure or shutdown. Health checks intentionally work without auth and without HTTPS enforcement for the host's internal probes. All application API routes require production HTTPS.
6. Confirm the proxy supplies the intended scheme/client IP and that no shorter untrusted path bypasses the configured proxy count. Exact-origin validation and session CSRF protect writes; CORS permits only the configured frontend origin with credentials. API requests use a shared MongoDB rate limiter (300/minute); login/password change share 15/15 minutes and signup/reset/verification share 10/15 minutes per normalized IP. A store failure blocks requests rather than disabling limits. Measure database overhead before increasing instance count.
7. On SIGTERM/SIGINT the API marks readiness unavailable, stops accepting connections, closes idle connections, drains requests and disconnects MongoDB, with a ten-second exit deadline. Startup/index/bootstrap/verification commands suppress raw driver errors and secret-bearing stack traces.

## 5. Vercel frontend and CSP

1. Choose `app.<your-domain>` and `api.<your-domain>`. Locally set the public `VITE_API_URL` for the final API origin (an ignored `.env.production` or environment variable is suitable). Run `npm run deployment:configure`. Review/commit the resulting `vercel.json`; it permits only `'self'` and that exact API origin in `connect-src`.
2. Create a Vercel project from the repository. Framework: Vite; build: `npm run build`; output: `dist`. Supply the **same** `VITE_API_URL` in Vercel production environment settings. A mismatched CSP stops the build with an instruction to regenerate headers. All backend secrets remain outside the frontend. Changing a Vite setting requires a rebuild.
3. Add `app.<your-domain>`, publish Vercel's exact DNS records and verify HTTPS. `vercel.json` includes SPA refresh rewrites, CSP, HSTS, frame denial, no-sniff, referrer and permissions policies. Static asset routes remain available. Dayora currently uses hash routes; refresh must preserve login/session restore and must never bypass the session gate. [Vite SPA deployment guidance](https://vercel.com/docs/frameworks/frontend/vite).
4. Check browser Network/Console for CSP/CORS failures and cookie blocking. Frontend fetches include credentials; CSRF lives only in memory. Session cookies use host-only `__Host-dayora`, Secure, HttpOnly, Path=/ and no Domain in production. Development uses `dayora-session` over local HTTP. No session/reset/verification/password material is placed in localStorage.
5. Verify anonymous users see Login, verified users restore their session, account changes clear cached private data in all open tabs, and ordinary users receive backend 403 responses on admin routes.

HTTPS app/api subdomains of the same registrable domain are cross-origin but same-site, so SameSite=Lax can support credentialed fetches. Separate `vercel.app` and `onrender.com` sites require SameSite=None; browser third-party-cookie blocking can still break authentication. Prefer same-site custom domains or a separately reviewed same-origin proxy. Use isolated staging domains and exact origins; arbitrary previews are not trusted.

## 6. First administrator

Sign up an ordinary account and verify its email first. In a trusted backend shell using the intended deployment environment, set `ADMIN_BOOTSTRAP_EMAIL` to that existing account and `ADMIN_BOOTSTRAP_CONFIRM=GRANT_FIRST_ADMIN`, then run:

```powershell
node server/bootstrap-admin.js
Remove-Item Env:ADMIN_BOOTSTRAP_EMAIL, Env:ADMIN_BOOTSTRAP_CONFIRM
```

The local equivalent is `npm run admin:bootstrap` with `server/.env`. Bootstrap refuses an unverified/inactive account, missing confirmation or any existing admin, serializes against concurrent admin access changes and writes an audit entry. Sign in again. Subsequent role/activation changes require an authenticated administrator, current password and recorded reason; self-access changes/final-admin removal are blocked. Admin routes expose account metadata and audits, not other users' private task/workspace records.

## 7. Backup restore drill

1. Enable Atlas scheduled backups/PITR where your tier supports it. Record retention and recovery targets. Schedule an actual drill; none was performed against Atlas here.
2. Restore a snapshot into a separate nonproduction cluster compatible with the snapshot version. Keep all production writes pointing to the original cluster. Do not restore over the live deployment for a drill. Follow [Atlas restoration guidance](https://www.mongodb.com/docs/atlas/backup/cloud-backup/restore-overview/).
3. Keep the restored target isolated from public app access and writes. Inject its URI into a trusted maintenance environment and run `node server/indexes.js` followed by `npm run db:verify`.
4. Set `RESTORE_CHECK_CONFIRM=READ_RESTORED_STAGING_DATABASE` and run `npm run db:restore-check`. This read-only scan checks counts, user/workspace ownership, embedded/top-level record metadata, project links and member assignments. It emits aggregate counts only and fails if sessions/account tokens remain. Run against a quiescent target; the scan is not a point-in-time snapshot of concurrent writes. It does not certify every legacy domain field or restore completeness without your expected baseline counts.
5. Through a trusted database maintenance process **after confirming the target is the separate restored cluster**, delete all restored documents from `sessions` and `accounttokens`; clear `ratebuckets` if needed for isolated testing. Do not revive previously revoked credentials. This repository deliberately provides no automatic destructive purge command. Repeat the check until session/token counts are zero, then open staging access with staging SMTP/domains.
6. Test login/new sessions and representative project/task/calendar/team/timer CRUD, deadlines/analytics/CSV and cross-user denial in staging. Compare expected counts and representative records with the backup baseline. Review audit continuity. Document recovery time, differences and findings.
7. A real cutover requires a maintenance plan: coordinate writes, finalize backup/catch-up strategy, switch only the intended backend URI, restart/verify indexes/readiness/isolation, and keep a rollback target. Never change a browser variable to a MongoDB URI. Revoke restored credentials/sessions again as required by the cutover policy. Mark restoration verified only after this drill succeeds.

## 8. Monitoring and capacity

Request logs contain generated request ID, method, **route template**, status and elapsed milliseconds. IDs/unknown URL segments, query strings, request bodies, cookies and credentials are not logged. CLI failures report safe operational messages. Mail logs contain purpose/status/duration only. Route-template logging intentionally groups unauthorized/unmatched requests as `<unmatched>`.

Configure actual alerts on your hosting/monitoring provider:

- sustained 5xx rates and readiness 503s; correlate `requestId` with safe `request_error` events;
- bursts of 429s by API/auth route and abnormal traffic volume;
- `database_connect_failed`, database command latency, connection pool/storage limits and unexpected process restarts;
- `mail_failed`/`mail_dispatch_failed`, SMTP duration and provider bounce/delivery failures;
- disk/storage growth, backup age/failures and tested recovery objectives.

Set thresholds from staging load measurements and expected traffic; no alert integration was provisioned here. Do not send secret-rich provider traces into application logs.

Workspace writes retain bounded revision-checked snapshots but now bulk-write only changed/removed records inside the transaction; unchanged records retain update timestamps. Reads still return snapshots when data changes. Visible clients poll every 30 seconds/focus; an unchanged revision returns a small response without reading every collection or updating React snapshots. This is not live collaboration. Limits remain 5,000 rows per collection and 12 MB input. Large-workspace read size, cross-document transaction duration, photo storage, per-request MongoDB limiter writes and SMTP throughput need representative load testing. Do not claim unlimited users; paginated APIs, object storage and a delivery queue remain future scaling options.

## 9. Deployment smoke tests

Run from a trusted machine with Node 22.20+. No credentials are embedded and no response bodies/cookies are printed.

```powershell
$env:SMOKE_API_URL='https://api.<your-domain>'
$env:SMOKE_FRONTEND_URL='https://app.<your-domain>'
npm run deployment:smoke
```

Default checks are read-only: backend liveness/readiness, frontend branding/security headers, and unauthorized workspace/admin rejection. It refuses redirects and unexpected HTTPS origins to protect test credentials. To verify auth, inject `SMOKE_EMAIL` and `SMOKE_PASSWORD` for a **dedicated verified nonadmin test account** from your secret manager, then rerun. It checks cookies, credentialed CORS, session restore, protected reads, admin rejection and logout.

For project/task CRUD, use an entirely empty dedicated test workspace and set `SMOKE_CRUD=true` and `SMOKE_CONFIRM=USE_EMPTY_TEST_WORKSPACE`. The script refuses nonempty workspaces, creates a temporary project/task, completes the task, verifies persistence across logout/login, then removes only its own generated IDs and signs out. If connectivity fails during cleanup, inspect/remove the named smoke records manually from that test account; do not assume cleanup succeeded.

Optional signup requires separate `SMOKE_SIGNUP_EMAIL`, `SMOKE_SIGNUP_PASSWORD`, `SMOKE_SIGNUP=true` and `SMOKE_SIGNUP_CONFIRM=CREATE_TEST_ACCOUNT`. It submits an ordinary signup request; generic acceptance cannot prove a new account was created. Check the inbox and verify it manually before authenticated tests. The test account remains registered; no account deletion/reset/administrator mutation is automated. Clear test environment variables afterward. Local tooling tests use `SMOKE_ALLOW_HTTP=true` only for localhost; this is rejected with NODE_ENV=production.

Node smoke checks do not enforce browser CSP, SameSite/third-party-cookie policy or render the UI. Complete real HTTPS browser checks on at least two browser contexts/devices before launch.

## 10. Final launch checklist and current status

- Run `npm test`, `npm run lint`, `npm run build`, `npm run test:e2e` and `npm run test:e2e:accounts`; review the current results in `PHASE5.md`.
- Verify Atlas URI/TLS/network permissions, transaction capability and required indexes using the real production environment.
- Verify actual verification/resend/reset delivery, replay/expiry behavior and new-password login through the deployed frontend.
- Run passive/authenticated/explicit CRUD smoke checks and inspect final temporary-record cleanup.
- In real HTTPS browsers, sign up two users; prove logout/relogin persistence, second-device synchronization, foreign-ID/link denial, CSRF/origin rejection, nonadmin denial and lack of admin private-content access.
- Check responsive screens/reduced motion, calendar/timer/analytics and cross-tab account changes on the live domain.
- Confirm real monitoring alerts and complete the isolated Atlas restore drill.

| Category | Verified status |
| --- | --- |
| Locally production-ready | Local production build/security/integration/browser checks are verified; actual production transport, capacity and operational readiness are not certified |
| Deployment-ready | Code, configs and tools prepared; requires real provider settings, exact CSP/domain configuration and external verification before launch |
| Deployed | No deployment was created or reached |
| Production-verified | No; Atlas, SMTP inbox delivery, HTTPS browsers, monitoring and restore drill remain pending |
