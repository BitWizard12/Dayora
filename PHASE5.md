# Dayora Phase 5 — Firebase migration

Firebase Authentication, Cloud Firestore, Firebase Admin SDK and private Firebase Storage are now the active implementation. MongoDB/Mongoose/Atlas has been removed from runtime code, dependencies, fixtures and deployment configuration. The previous phase/deployment reports are preserved as explicitly obsolete history. This continues the existing application; `src/App.jsx`, completed dashboard/task/calendar/team/analytics pages, styles and motion tokens were not rebuilt.

## Architecture and preserved functionality

The existing authentication UI uses Firebase's web SDK with **in-memory persistence** for signup/login. It exchanges a recently authenticated ID token with Express, then signs out the browser SDK. Passwords/ID/refresh/session tokens are not stored in frontend localStorage/sessionStorage. Firebase Admin verifies identity, verified-email/disabled state and recent authentication before issuing server sessions. Firebase owns account passwords, verification/reset codes and their expiry.

Express maintains Firebase session cookies plus a random per-device cookie key and a Firestore registry. Production cookies are host-only `__Host-dayora` and `__Host-dayora-key`, HttpOnly, Secure, explicit SameSite, Path=/, with no Domain. Remembered login lasts **14 days**, Firebase's maximum session-cookie duration; ordinary login uses a browser-session cookie with a 12-hour server expiry. Requests recheck Firebase revocation/disabled/verified state and the trusted Firestore active/session-version boundary. Logout removes the current registry; logout-other-devices preserves only the current versioned registry; password changes/reset invalidate previous device registries before changing the password. Cross-tab session-change broadcasting and account-generation guards are preserved. Recognized provider outages return safe retryable errors.

Signup, login, restoration, verification/resend, forgot/reset password, password changes, account deactivation and profile updates retain their existing UI. The backend email/password exchange remains available for trusted smoke tooling and API compatibility; the browser uses ID-token exchange. Production exact-origin checks, CSRF checks, JSON mutation enforcement, HTTPS, CORS, safe errors/logging and health/readiness endpoints remain.

Application records live below `users/{firebaseUid}/workspaces/{workspaceUuid}/{collection}/{recordId}`. Each account has one private workspace. API `time-entries`/`profile-photo` names map to `timeEntries`/`profilePhotos`. The backend resolves scope from verified identity and its trusted user record, strips submitted scope/role fields, rejects foreign links/guessed-ID access, and rechecks account version during mutation transactions. React still uses `workspaceRepositories`, `httpWorkspaceAdapter`, `useRepository` and domain services/selectors, without Firestore SDK calls in UI components.

Read-only Firestore transactions provide workspace snapshots. Write transactions retain revision compare-and-swap, stale-edit 409 responses, relationship cleanup, task completion history and incremental changed-record persistence. A workspace order map preserves collection array ordering independently of Firestore's document-ID sorting. Existing UUID/stable IDs, embedded subtasks, timer segments, calendar topology, preferences, notifications and unknown legacy timestamps remain compatible. Dashboard/workload/time/project/analytics statistics continue using actual repository records.

Firestore/Storage client rules deny all direct access. Admin SDK bypasses rules, so server-side scoping and least-privilege IAM are mandatory. Roles are trusted Firestore account fields checked on every admin request, providing the requested secure server-side alternative to custom claims. Public signup cannot set roles. First-admin bootstrap requires an existing verified active account and explicit confirmation, refuses reuse and audits the grant. Administrative role/access changes revalidate the actor inside a guard transaction, retain the last active admin, invalidate target sessions and write audits together. Admin pages expose account metadata, not other users' private task content.

Firestore and Firebase Auth are separate services. Firestore deactivation is authoritative before Firebase disable/revoke. Synchronization failures return a retry marker and leave private application access blocked; failure behavior is tested. This is not a distributed atomic transaction.

Private profile/team images are validated raster uploads capped at 2 MiB, stored under UID-scoped Storage paths, and referenced by `media:<uuid>` metadata. Existing Avatar rendering resolves references to the authenticated image API. Neither public download-token URLs nor image base64 bodies persist in Firestore. Media metadata ownership, type/size checks, private responses and foreign-account denial are tested. Old/unreferenced image objects can remain after replacement or failed entity writes; a reviewed garbage-collection/retention job is future operational work. The Storage upload/Firestore entity write are not globally atomic.

Production rate limits use a shared Firestore transactional store; memory is available locally. Spark-compatible expiry index configuration is supplied without TTL policies or unnecessary composite indexes. Full-workspace snapshots and Firestore per-request limiting preserve existing contracts but need load/cost/quota testing before a larger deployment. Atomic record changes are bounded at 450 changed records/8 MiB, with document/order metadata size checks. Registry deletion is bounded; expiry/version checks immediately invalidate residual registries. Without TTL, trusted retention maintenance must remove abandoned expired registries/counters; see the Spark section in DEPLOYMENT.md. No live policy deployment, cleanup or billing change was performed.

## Migration and account continuity

Anonymous local import remains opt-in, requires an empty workspace, remaps linked record/subtask IDs together, preserves unknown history and keeps device backups. There is no automatic upload after signup/login.

A separate trusted offline migration accepts a reviewed JSON export and explicit old owner/workspace → existing verified Firebase UID mappings. It defaults to a dry run, validates source metadata/relationships, preserves stable record/subtask IDs and ordering, rewrites authoritative target ownership, and imports each workspace with its audit atomically. Optional old audits retain IDs/timestamps and mapped identities without granting roles. Multi-account/historical-audit imports are not globally atomic; partial progress must be reconciled explicitly. Password hashes, old sessions and account privileges are never imported. Old Argon2 accounts require a controlled re-registration/reset migration and reviewed UID mapping. No real old database export was supplied or migrated.

See `DEPLOYMENT.md` for the exact input schema, commands, IAM/Console configuration, trusted bootstrap and recovery procedure. `DAYORA-DATA.md` documents the active repository/schema conventions. The obsolete MongoDB reports remain historical references only.

## Dependency changes

Added production `firebase` and `firebase-admin`; added development `firebase-tools` and `@firebase/rules-unit-testing`. Removed `mongoose`, `argon2` and `mongodb-memory-server` and their obsolete lifecycle permissions. Compatible overrides patch `@grpc/grpc-js`, `@opentelemetry/core`, `basic-ftp`, `re2` and `uuid`; optional Firebase/protobuf/RE2 install scripts remain disabled. The patched Firebase CLI was checked and fresh Java 21 emulator startup was exercised.

`npm audit --omit=dev`: **zero reported vulnerabilities**. The full development audit still reports three high advisories in the Firebase CLI → chokidar → braces chain. No compatible patched braces release is currently selected; development CLI use remains a tracked dependency limitation. It is omitted from the deployed API dependency set. Audit results are point-in-time checks, not a security certification.

## Validation

Final verification passed after the last implementation changes. Tests use only fixed local demo emulators; integration fixtures intentionally clear demo emulator data. Rules tests use a separate demo project. No destructive live-project test was run.

- Unit/integration/rules: **49 passed**, zero failures/skips; final emulator runner exited 0.
- Authenticated Firebase browser suite: **8 passed**, including cookie persistence, memory-only token storage, image reload, verification/reset, isolated CRUD, migration, cross-tab switching, admin changes, responsive layouts and reduced motion; final emulator runner exited 0.
- Retained Phase 2–4 browser suite: 15 passed.
- Lint and normal production build: **passed**. Build uses the existing lazy page chunks and a separate Firebase Auth vendor chunk (~79.8 kB, ~23.5 kB gzip) without bundle-size warnings. Generated browser screenshots were visually checked for preserved dashboard layout.

Expected emulator permission-denied output is produced by deny-rule assertions. Reduced-motion/terminal-color notices and emulator socket resets during browser shutdown are diagnostic output, not application failures.

## Exact implementation file manifest

Modified existing files (39):

```text
.env.example
.gitignore
AGENTS.md
DAYORA-DATA.md
DEPLOYMENT.md
PHASE5.md
README.md
package.json
package-lock.json
render.yaml
vercel.json
vite.config.js
scripts/deployment-config.mjs
server/.env.example
server/admin.js
server/app.js
server/auth.js
server/bootstrap-admin.js
server/config.js
server/errors.js
server/index.js
server/mailTemplates.js
server/rateLimitStore.js
server/records.js
server/restore-check.js
server/verify.js
src/components/Avatar.jsx
src/services/authService.js
src/services/team.js
tests/admin.integration.test.js
tests/auth.integration.test.js
tests/backend-foundation.test.js
tests/bootstrap.integration.test.js
tests/production-readiness.test.js
tests/security.integration.test.js
tests/workspace.integration.test.js
tests/helpers/backend.js
tests/helpers/browser-server.js
tests/e2e/phase5.spec.js
```

Added files (17):

```text
firebase.json
firestore.rules
firestore.indexes.json
storage.rules
PHASE5-MONGODB-HISTORY.md
DEPLOYMENT-MONGODB-HISTORY.md
server/firebaseAdmin.js
server/firebaseAuthApi.js
server/firebaseRepositories.js
server/media.js
server/import-export.js
src/services/firebaseAuth.js
src/services/media.js
scripts/emulator-runner.mjs
tests/firebase-media.test.js
tests/firebase-migration.test.js
tests/firebase-rules.test.js
```

Removed obsolete files (3):

```text
server/database.js
server/models.js
server/indexes.js
```

Ignored generated output is separate from the source manifest: `dist/`, `artifacts/`, `test-results/`, `playwright-report/`, debug/verification logs, and the local Java 21 download/runtime under `.cache/`. No service-account key was created or committed.

## Remaining external work and limitations

Create/configure staging and production Firebase projects, Email/Password Auth, authorized domains, email abuse/password policies, default Firestore database, private Storage bucket, restricted Admin IAM credentials, required feature billing/budgets, rules/index deployment and real SMTP branding/delivery. TTL is not required or enabled by the active Spark-compatible configuration. Deploy the API/frontend with matching public project config, HTTPS same-site custom domains, exact CORS/CSP and production cookies. Run trusted first-admin bootstrap after a real ordinary account is verified.

Then validate actual account emails/password/session revocation, Storage IAM/images, Firestore contention/indexes/costs, browser cookies and deployed health/smoke tests. Supply/review any legacy export and reconcile records/audits/account identity mapping. Configure independent Firestore/Auth/Storage backups, restore into a separate restricted project, revoke restored sessions and verify staging recovery before production cutover.

No live Firebase deployment/IAM/rules/TTL/index activation, SMTP inbox delivery, cloud backup restoration, old database migration, Vercel/Render deployment or custom-domain behavior has been verified. The migration is locally validated; it is not claimed production-ready.

## Spark TTL follow-up — 2026-10-07

Removed both billing-dependent TTL declarations from the active index file while retaining the session-expiry collection-group index and rate-limit index exemption. Runtime authentication expiry, session-version revocation, transactional shared limiting, CSRF, ownership and deny-all rules are unchanged. New regressions prove the file contains no TTL request, expired session documents remain unreadable through authentication even while retained, and limiter-store failures deny API access without a memory fallback. Existing tests verify counter reset without TTL and cross-user isolation.

Modified files in this follow-up: `firestore.indexes.json`, `tests/auth.integration.test.js`, `tests/production-readiness.test.js`, `DAYORA-DATA.md`, `DEPLOYMENT.md`, `PHASE5.md`. No dependencies or environment requirements changed. Unit/integration/rules: **51 passed**; authenticated browser regressions: **8 passed**; lint and production build passed. Both emulator verification runners exited 0.

Spark support applies to the Auth/Firestore core within quotas. Expired-document retention needs reviewed maintenance; full photo functionality still requires Firebase Storage's eligible billing plan. See DEPLOYMENT.md for quota, retention, existing remote TTL policy behavior and production requirements. No deployment, live cleanup, policy disable or billing change was executed.

## SMTP delivery follow-up ? October 8, 2026

SMTP setup is validated at startup in development and production. Mandatory STARTTLS/implicit TLS, trusted certificates, bounded timeouts and sanitized delivery diagnostics protect every provider connection. Preview and branded Firebase action emails are preserved; signup/resend/reset share one mailer and Firebase alone controls action codes. smtp:verify never sends; smtp:test requires an explicit destination and confirmation and contains no account action. Both load backend environment consistently and operate without Firebase credentials. See EMAIL-VERIFICATION.md for the three-variable setup and provider requirements. Actual SMTP/inbox delivery requires real provider credentials and is not certified by emulator tests.

SMTP follow-up validation on October 8, 2026: 60 unit/integration/security-rule tests passed; all 8 authenticated browser tests passed; lint passed; production build passed using the supported same-origin VITE_API_URL setting. Browser runner exited 0. Tests did not send live SMTP email or mutate the real Firebase project. Ignored logs are artifacts/smtp-unit.log, artifacts/smtp-browser.log and artifacts/smtp-build.log.

## Resend SMTP configuration - October 8, 2026

Resend replaces the previous provider recommendation. Backend variables: MAIL_MODE=smtp; MAIL_FROM=Dayora <onboarding@resend.dev>; SMTP_URL=smtps://resend:YOUR_RESEND_API_KEY@smtp.resend.com:465. No real API key is stored in examples or frontend code. The Resend profile validates implicit TLS/465, username resend and a supplied key at startup and in smtp:verify/smtp:test. Existing transport abstraction, branded templates, preview mode, Firebase codes and safe failure handling remain intact. The onboarding sender is restricted to the Resend account email; sending to other users requires a verified domain and corresponding MAIL_FROM. EMAIL-VERIFICATION.md documents setup, optional test delivery and production sender requirements.

Resend follow-up validation on October 8, 2026: all 61 unit/integration/security-rule tests passed, including Resend TLS/login/key validation and verification-tool diagnostics; lint and production build passed. Build uses the existing supported same-origin VITE_API_URL setting. No live SMTP email was sent and real provider credentials were not added. Logs: artifacts/resend-unit.log and artifacts/resend-build.log.
