# Dayora Firebase deployment and recovery

Firebase Authentication + Firestore are the active architecture. Express runs Firebase Admin; Vercel serves React; Render runs the API. Storage is required for the existing profile/team image upload feature. Atlas instructions in `DEPLOYMENT-MONGODB-HISTORY.md` are obsolete. Local emulator tests do not certify a deployed environment.

## Firebase Console and IAM

1. Create separate staging and production Firebase projects. Register a web app and copy only its public apiKey, projectId and authDomain into Vite variables.
2. Enable Authentication → Email/Password. Add your actual frontend domains to authorized domains. Configure email-enumeration protection and a password policy compatible with Dayora's 12–128 character form requirement. Verify policy behavior in staging; emulator behavior is not proof of provider enforcement.
3. Create the **default Firestore Native-mode database**, select its location deliberately, and deploy the deny-all rules below before opening the application. Do not create a MongoDB-compatible database. Provision Storage and record the exact Console bucket name; new buckets may use `PROJECT.firebasestorage.app`, older ones `PROJECT.appspot.com`.
4. Create a dedicated backend service identity with only the required Firebase Authentication administration, Firestore data and private Storage object permissions. Admin SDK bypasses Security Rules; do not grant these credentials to browsers or untrusted scripts. Use least privilege rather than project Owner. Verify actual IAM permissions against staging readiness, uploads, sessions, role changes and exports. Prefer an attached service identity/ADC on supported Google runtimes; Render uses secret `FIREBASE_SERVICE_ACCOUNT_JSON` or a protected credential file through `GOOGLE_APPLICATION_CREDENTIALS`.
5. Restrict bucket IAM/public access, keep direct Storage client rules denied, configure billing/budgets and usage alerts, and separately grant backup operators the required export/import/bucket permissions. Cloud services and TTL/export features can incur charges; confirm your project's billing eligibility in Console.

From a trusted local deployment shell with Firebase CLI access:

```powershell
npx.cmd firebase login
npm.cmd run firebase:deploy -- --project YOUR_STAGING_PROJECT
```

The command deploys `firestore.rules`, `firestore.indexes.json` and `storage.rules`. Repeat for production only after staging verification. No implicit default production project is stored in this repository. All client reads/writes are denied intentionally; Express is the only private data path. Admin access is controlled by trusted `users/{uid}.role`, not a browser-provided claim.

No composite query currently needs an index. `firestore.indexes.json` contains the session-expiry collection-group single-field index used by admin overview and the rate-limit expiry indexing exemption. It deliberately contains **no TTL policies**, so its field configurations do not request billing-dependent expiry cleanup. Wait for the session index to become active in Console and exercise the query in staging. Server checks reject expired sessions immediately and reset expired limiter counters transactionally. See [Firestore index deployment](https://firebase.google.com/docs/firestore/query-data/indexing).

### Spark compatibility for dayora-5a3ad

Both previous `ttl: true` declarations (sessions and rateLimits) requested paid TTL policies; removing only the rateLimits declaration would leave the same billing dependency on sessions. Firestore TTL is asynchronous cleanup, not an authentication or rate-limit mechanism. Spark can support this Auth/Firestore architecture without TTL while within its quotas. [Firebase documents that TTL requires billing](https://firebase.google.com/docs/firestore/quotas) and [TTL deletion can lag expiry](https://firebase.google.com/docs/firestore/ttl).

The local change does not deploy indexes, disable existing remote policies, delete data, change billing, or weaken rules. Firebase CLI 15.32.1 preserves an existing remote TTL policy when the matching field override omits `ttl`; omission prevents requesting a new policy but is not a remote TTL-disable command. Before a later index deployment, review the remote field-policy state and CLI proposed changes. If a policy was partially deployed, separately explain/review any explicit disable operation rather than assume this file removes it. Keep the session collection-group index; do not delete the expiresAt fields. A rules compilation success does not validate indexes/IAM/billing, and a 403 without a billing-specific explanation can also indicate missing deployment permissions. No live project state was queried during this change.

Production still requires verified Firebase server sessions, HTTPS/HttpOnly cookies, CSRF/exact-origin enforcement, authoritative UID/workspace scoping, trusted admin roles, default-deny rules and the shared Firestore rate limiter. There is no automatic memory-store fallback if Firestore quota or availability fails: API access fails closed, while liveness remains available. Maintain synchronized server clocks.

Without TTL, expired session registries and keys from abandoned IPs accumulate. Reused limiter keys reset in place; logout removes a registry, and account revocation removes up to 400 registries while invalidating all older versions. Plan periodic trusted maintenance and monitor storage. Any maintenance tool must target only `users/{uid}/sessions` and `rateLimits`, select expired records with a retention buffer, **transactionally re-read expiry before deletion** so renewed counters are retained, bound reads/deletes, and require reviewed project identity/explicit approval. Do not run blanket collection deletes. No live cleanup was performed and no automatic cleanup job is installed by this patch. Physical retention is operational work, not permission to accept expired credentials.

Spark currently provides 50,000 reads, 20,000 writes and 20,000 deletes daily, plus 1 GiB storage. Limiter requests each incur a transactional read/write (login/mail routes incur additional limiter operations); workspace polling and full snapshots also consume reads. Monitor actual usage and concurrency before inviting users. Quota exhaustion can make the application unavailable; the per-minute limiter is not a daily quota budget. See [current free quotas](https://firebase.google.com/docs/firestore/quotas). Managed backup/PITR/restore features also require billing; the recovery procedure below is conditional on that capability.

**Separate limitation:** Firebase Storage requires Blaze under its current billing policy. Existing production validation still requires a bucket for Dayora's photo feature; this patch does not bypass that requirement or silently disable uploads. Spark-compatible Firestore indexes therefore do not guarantee an entirely Spark-only Dayora deployment. Full photo functionality needs eligible Storage/billing; supporting production without photos would require an explicit, separately reviewed feature configuration. See [Firebase Storage billing requirements](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024).

## Email behavior

Dayora keeps its branded SMTP templates. Admin SDK creates Firebase verification/reset action codes; the backend sends Dayora links targeting the existing hash-route UI. The UI submits codes to Express, which applies them through Firebase Authentication. Set `MAIL_MODE=smtp`, provider-verified `MAIL_FROM`, secret `SMTP_URL`, and the exact frontend `APP_ORIGIN`. Configure SPF/DKIM/DMARC and check inbox/spam delivery. Firebase owns action-code validity and expiry; the old application's 24-hour/30-minute local token policy no longer applies. Production does not use preview mail. Configure Firebase Console templates/action URLs for any messages sent independently through Firebase tools, but those Console templates do not replace Dayora's SMTP template.

Run `npm run smtp:verify` in a trusted shell. It loads server/.env when present (root .env supplies missing values) and checks TLS/connectivity/authentication without sending, even if test variables exist. The separate `npm run smtp:test` command sends one harmless message only with both `SMTP_TEST_TO` and `SMTP_TEST_CONFIRM=SEND_TEST_EMAIL`. It contains no account action link. Neither provider acceptance nor local tests prove inbox delivery. See EMAIL-VERIFICATION.md for provider setup.

## Render API

Import `render.yaml` or configure a Node service: build `npm ci --omit=dev`, start `npm run start:api`, health `/api/health/ready`, Node 22.20+. Remove all old MongoDB URI/index/retry configuration and all emulator variables.

Set:

```text
NODE_ENV=production
FIREBASE_PROJECT_ID=your-real-project
FIREBASE_WEB_API_KEY=public-web-api-key-for-the-same-project
FIREBASE_SERVICE_ACCOUNT_JSON=<secret one-line service-account JSON>
FIREBASE_STORAGE_BUCKET=<exact Console bucket>
APP_ORIGIN=https://app.your-domain.com
TRUST_PROXY=1
COOKIE_SAME_SITE=lax
RATE_LIMIT_STORE=firestore
MAIL_MODE=smtp
MAIL_FROM=Dayora <hello@your-domain.com>
SMTP_URL=smtps://resend:YOUR_RESEND_API_KEY@smtp.resend.com:465
```

Admin credentials must match the configured project; production refuses missing credential configuration, emulator hosts, HTTP origins, preview mail and memory-only limiting. Review `TRUST_PROXY` for the actual proxy chain; do not copy it to a directly exposed server. Use HTTPS `api.your-domain.com` and HTTPS `app.your-domain.com`. Lax cookies work for these same-site subdomains. Separate unrelated Vercel/Render domains may require `SameSite=None` and remain subject to browser third-party-cookie restrictions; custom same-site domains are preferred.

Private image responses use `Cross-Origin-Resource-Policy: same-site`; photos require same-site app/API subdomains or an intentional same-origin API proxy. An unrelated-domain `SameSite=None` deployment alone does not enable photo rendering.

Liveness indicates the process is running; readiness makes bounded Auth/Firestore reads. Neither checks Storage, SMTP, rules or all required indexes. Run `npm run db:verify` with injected server environment for a read-only Auth/Firestore check and validate remaining services explicitly.

Firestore is the shared production rate-limit store. Counters are hashed and transactional across API instances. Every request adds database work; a hot key can cause contention and fail-closed errors. Use synchronized host clocks. This preserves small-deployment correctness but needs load/cost testing and potentially a Redis-compatible replacement for higher throughput. Development can use memory limiting. Firebase also controls direct Auth SDK signup/login quotas; API limiting does not replace Firebase abuse controls.

## Vercel frontend

Set only:

```text
VITE_API_URL=https://api.your-domain.com
VITE_FIREBASE_API_KEY=<public Firebase web apiKey>
VITE_FIREBASE_PROJECT_ID=<same real project>
VITE_FIREBASE_AUTH_DOMAIN=<Console web authDomain>
```

Do not set `VITE_FIREBASE_AUTH_EMULATOR_URL` or any Admin/private variable. Configure the values locally/in a trusted build environment, run `npm run deployment:configure`, review/commit `vercel.json`, then run `npm run build` and deploy with identical values. CSP permits the exact API origin for API requests/private images plus Firebase Auth's Identity Toolkit/Secure Token origins. Vercel build command is `npm run build`, output `dist`. Production requires the API origin or an intentionally configured same-origin `/api` reverse proxy; the development Vite proxy is not a Vercel production proxy.

Test HTTPS signup, actual verification email, login with/without Remember me, reload/session restoration, cookie flags, reset/password change, photo uploads, two-account isolation, cross-tab logout, role changes, CORS, CSRF, responsive pages and API outage behavior on staging. The test-only `firebase-test` bundle and regression development mode must never be deployed.

## First administrator

Create and verify an ordinary account through Dayora first. In a trusted server shell using the target project credentials:

```powershell
$env:ADMIN_BOOTSTRAP_EMAIL='verified-admin@your-domain.com'
$env:ADMIN_BOOTSTRAP_CONFIRM='GRANT_FIRST_ADMIN'
npm.cmd run admin:bootstrap
```

Alternatively set `ADMIN_BOOTSTRAP_UID`; UID takes precedence. The script requires a verified active existing Firebase identity, refuses any existing admin, updates the trusted role/session version in a Firestore guard transaction, writes an audit and revokes Firebase refresh tokens. Sign in again afterward. It does not create an account or accept a public signup role. Do not leave bootstrap environment settings enabled as a startup command. Further access changes require another authenticated administrator, current-password reauthentication and a reason; the final active admin is retained.

Firestore role/access, session revocation and audit commit together. Firebase Auth disable/revoke is a separate operation. If it fails after deactivation, application access remains blocked and the API returns `ACCOUNT_SYNC_PENDING`; retry the same authenticated administrative change and verify Firebase disabled state. No distributed atomicity is claimed.

## Reviewed migration from the obsolete database

Freeze old application writes and keep its database backup/export before cutover. The application no longer has a MongoDB driver or a live source database connection. Prepare an offline JSON export through trusted old-environment tooling, inspect it privately, and register/verify target Firebase accounts. The old Argon2 password hashes are not imported; use a controlled re-registration/reset process. Do not assume a Firestore import restores Firebase accounts/passwords.

Normalize the reviewed export to:

```json
{
  "version": 1,
  "accounts": [{
    "sourceOwnerId": "OLD_ACCOUNT_ID",
    "sourceWorkspaceId": "OLD_WORKSPACE_ID",
    "firebaseUid": "EXISTING_VERIFIED_FIREBASE_UID",
    "collections": {
      "projects": [{ "id": "STABLE_PROJECT_ID", "ownerId": "OLD_ACCOUNT_ID", "workspaceId": "OLD_WORKSPACE_ID", "createdAt": null, "updatedAt": null, "name": "Project", "description": "", "status": "Pending", "deadline": "" }],
      "tasks": [], "team": [], "events": [], "time-entries": [], "notifications": [], "settings": [], "profile-photo": []
    }
  }],
  "audits": []
}
```

Flatten the old stored record `data` fields into collection rows. Include all collections/records and explicit original owner/workspace fields. Optional historical audits have `id`, `actorId`, `targetId`, `action`, `changes`, `createdAt`; identity references must match reviewed account mappings (bootstrap actor is accepted). History keeps original IDs/timestamps, mapped identity fields and legacy source IDs; importing an audit does not grant a role. Credentials, passwords, session tokens and live session registries must not be included. Keep the JSON outside version control; `reviewed-export.json` is ignored.

```powershell
$env:MIGRATION_INPUT_FILE='C:\private\reviewed-export.json'
npm.cmd run firebase:import
# Review dry-run counts/ownership mapping before authorizing writes:
$env:FIREBASE_MIGRATION_CONFIRM='IMPORT_REVIEWED_EXPORT'
npm.cmd run firebase:import
```

Targets must be new empty Dayora workspaces with revision 0. Record/subtask IDs, links, order and unknown timestamps remain intact; ownership changes to the chosen Firebase UID/current workspace UUID. Base64 images are uploaded to that user's private Storage; only references persist. Each workspace and its import audit commit atomically, within 450 changed records/8 MiB. Historical audits import in create-only batches; multi-account/historical imports are not globally atomic. If a later account/batch fails, review already imported data and use a narrowed remaining export; do not blindly retry the entire file or overwrite existing history. Actual old database migration remains unverified until a real reviewed export is supplied and reconciled.

The separate anonymous local-data import keeps its existing explicit confirmation/remapping behavior. Signup/login never silently upload device data.

## Backup and recovery

Use a dedicated private Cloud Storage backup bucket with reviewed location/IAM/retention. Firestore export/import requires project billing and operator permissions. Export all relevant subcollections, users/profile metadata and audit records; a database export is not an Auth or image-object backup. Example trusted operator commands, with real reviewed project IDs/buckets substituted:

```text
gcloud firestore export gs://BACKUP_BUCKET/REVIEWED_PREFIX --project=SOURCE_PROJECT --database='(default)'
gcloud firestore import gs://BACKUP_BUCKET/REVIEWED_PREFIX --project=ISOLATED_STAGING_PROJECT --database='(default)'
```

Follow [Firebase's export/import procedure](https://firebase.google.com/docs/firestore/manage-data/export-import). Keep Auth identity exports/backups separately and plan UID-preserving import with supported credential formats; see [Firebase Auth import](https://firebase.google.com/docs/auth/admin/import-users). Back up Storage objects and metadata separately. Keep rules/indexes/TTL configuration in version control; exports do not replace their deployment. Evaluate scheduled backups/PITR and retention against your recovery targets in Console.

Restore into a separate restricted project first. Create/restore matching Firebase Auth UIDs, deploy deny-all rules/indexes, configure private image Storage and point a staging API at that project. Remove restored session registries, increment session versions and revoke refresh tokens through a trusted maintenance procedure before opening access; old cookies must not regain access. Never run emulator fixture clears against restored/live services. Use staging SMTP recipients, not real production reset/verification mail.

Run `npm run db:restore-check` with staging environment plus `RESTORE_CHECK_CONFIRM=READ_RESTORED_STAGING_FIREBASE` and `RESTORE_CHECK_PROJECT_ID` matching `FIREBASE_PROJECT_ID`. It reads identity presence, workspace/record ownership, relationships, media metadata and session counts. It rejects leftover session registries at CLI level. It does not verify image object contents, every field, rules/IAM deployment or a provider backup's completeness. Compare exported counts/sample records, task/project links, timer history, analytics, historical audits and image downloads; run authenticated staging browser smoke tests. Record the recovery time and reconciliation evidence before a controlled production cutover.

`npm run deployment:smoke` defaults to read-only checks. `SMOKE_EMAIL`/`SMOKE_PASSWORD` enable authenticated checks; CRUD additionally requires `SMOKE_CRUD=true` and `SMOKE_CONFIRM=USE_EMPTY_TEST_WORKSPACE`. Use a dedicated empty staging account. Signup requires its own explicit confirmation. Never run destructive smoke tests against real users.

No live Firebase IAM/rules/index/TTL deployment, SMTP inbox delivery, provider backup/restore, old database migration, custom-domain cookies or Vercel/Render deployment has been verified in this workspace.

## Resend SMTP configuration

Dayora uses Resend through the existing SMTP transport. Configure backend secrets only:

```dotenv
MAIL_MODE=smtp
MAIL_FROM=Dayora <onboarding@resend.dev>
SMTP_URL=smtps://resend:YOUR_RESEND_API_KEY@smtp.resend.com:465
```

Replace the key placeholder with a sending-capable Resend API key; percent-encode URL-special characters. Port 465 uses implicit TLS with certificate verification. The Resend profile rejects incorrect scheme/port/login and missing or unchanged placeholder keys before startup or SMTP verification. Preview stays the local default. No frontend configuration or Firebase action-code handling changes.

The onboarding sender is restricted to your Resend account email. Before sending to other users, verify your own domain in Resend with its required DNS records and change MAIL_FROM to a sender on that domain. See [Resend SMTP](https://resend.com/docs/send-with-smtp) and [testing-domain restrictions](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

After saving credentials, run npm run smtp:verify and restart the backend. Verification never sends email; smtp:test still requires SMTP_TEST_TO and SMTP_TEST_CONFIRM=SEND_TEST_EMAIL. With the onboarding sender, use your Resend account email as the test destination. Live authentication and inbox delivery require real credentials and have not been tested by automated checks.
