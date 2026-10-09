# Dayora final deployment

This is the current deployment guide for **dayora-five.vercel.app → Render**. No Render URL is known yet; do not substitute a guessed URL. Local credentials/environment files stay private. Firebase rules/indexes and SMTP are reported working by the owner; this patch does not redeploy them.

## Step 1 — push the reviewed latest main

Commit the repository-side deployment changes, then push main:

```powershell
git status --short
git diff --check
# Stage only the source/config/docs in the change manifest below.
git diff --cached
git commit -m "Prepare Dayora Render and Vercel deployment checks"
git push origin main
git rev-parse HEAD
```

The last command gives the exact commit Render must deploy. It will be newer than 1bf94c4 after this patch. Do not redeploy 422f0e9. No .env or credential file belongs in the commit.

## Step 2 — configure the Render service

Open **dayora-api → Settings**. Verify the correct linked GitHub repository, **branch main**, repository root (not server/), Node runtime and these exact settings:

| Setting | Value |
| --- | --- |
| Node | 22.20.0 |
| Build | npm ci --omit=dev |
| Start | npm run start:api |
| Health check | /api/health/ready |
| Auto deploy | On commit to main |
| PORT | Render supplies it; do not hardcode |

The Blueprint sets branch main and autoDeployTrigger=commit. A dashboard-managed service must have those settings updated in the dashboard; merely pushing render.yaml does not convert it into a Blueprint-managed service. Blueprint sync updates configuration, not an immutable commit pin. Verify the deploy event's commit explicitly.

Render's NODE_VERSION setting takes precedence over .node-version and package engines. Remove an old Node 26 service/group override or set NODE_VERSION=22.20.0. The repository also has .node-version and engines >=22.20.0 <23. See [Render Node selection](https://render.com/docs/node-version) and [Blueprint fields](https://render.com/docs/blueprint-spec).

## Step 3 — attach the existing environment group

1. Open **dayora-api → Environment**.
2. Find **Linked Environment Groups**, choose **Link Environment Group**, and select the existing **Dayora Production** group (use its actual dashboard name).
3. Verify the group now appears as linked to **dayora-api**. Having a group in the workspace alone does not attach it to the service.
4. Open that group and verify every key below has a nonempty value. Inspect secrets only in Render, not in chat or Git.
5. Inspect dayora-api's service-level variables for duplicate keys, blanks and stale values. Service-level values take precedence over group values; remove incorrect overrides or correct them. If this is a Blueprint-managed service, keep explicit YAML constants and the group consistent.
6. Save the environment configuration and deploy. Environment edits do not alter an already running instance until redeployed.

The group name is not hardcoded in render.yaml because its exact name is unknown. The Blueprint's sync:false keys support entering secrets at service creation; they do not attach an existing group. For Blueprint automation later, add a fromGroup reference only after confirming the actual group name. See [Render environment groups](https://render.com/docs/configure-environment-variables).

## Step 4 — verify Render variables

These are the definitive deployment keys checked by deploy:preflight.

**A. Required non-secret settings**

| Key | Production value/source |
| --- | --- |
| NODE_ENV | production |
| NODE_VERSION | 22.20.0; explicit deployment pin |
| FIREBASE_PROJECT_ID | Actual Firebase project ID, not app ID/project number |
| FIREBASE_WEB_API_KEY | Public Firebase web-app API key for that same project |
| APP_ORIGIN | https://dayora-five.vercel.app |
| TRUST_PROXY | 1 for the Render proxy |
| COOKIE_SAME_SITE | none for this direct cross-site deployment |
| RATE_LIMIT_STORE | firestore |
| MAIL_MODE | smtp |
| MAIL_FROM | Existing provider-verified Dayora sender; no example.com placeholder |

COOKIE_SAME_SITE and RATE_LIMIT_STORE have defaults in server code, but preflight requires explicit deployment values to avoid silently choosing the wrong topology. NODE_VERSION is required operationally for the pin, not parsed by server/config.js.

**B. Required backend secrets**

| Key | Source |
| --- | --- |
| FIREBASE_SERVICE_ACCOUNT_JSON | Actual Firebase Admin service-account JSON as one secret value, matching FIREBASE_PROJECT_ID |
| SMTP_URL | Existing SMTP URL with real provider credentials |

A mounted GOOGLE_APPLICATION_CREDENTIALS secret file is an alternative to JSON. A local Windows credential path does not exist on Render. Approved Google ADC runtimes can use their attached identity; K_SERVICE is not a credential and must not be invented on Render. Do not paste credential values into documentation or Vercel.

**C. Optional/platform settings**

- PORT: injected by Render, default 3001 outside Render.
- FIREBASE_STORAGE_BUCKET: optional; leave absent while Storage is unavailable. Core auth/projects/tasks/calendar/team/work-log/notes/analytics work without it. New photo uploads are disabled and show a clear message; initials remain available. Enable eligible private Storage and configure its exact bucket later. Do not point at a fake bucket.
- GOOGLE_APPLICATION_CREDENTIALS: alternative backend credential path, only if the secret file is actually mounted.
- DAYORA_API_URL: check tooling only, set after Render URL exists.
- VITE_*: frontend build settings, not needed on Render; do not copy frontend variables or secrets into arbitrary VITE_* keys.
- Firebase emulator hosts, VITE_FIREBASE_AUTH_EMULATOR_URL, preview mail and memory limiting: forbidden in production. Remove them rather than configuring localhost.

### Cookies and private images

For vercel.app → onrender.com, use **COOKIE_SAME_SITE=none**. Production code already sets Secure, HttpOnly, host-only __Host- cookies and Path=/. Lax does not send cookies on these cross-site fetches. Exact-origin CORS, JSON mutation checks and CSRF tokens remain enabled. [MDN cookie requirements](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).

None does not override browser blocking of third-party cookies. Test an actual browser before opening access. Later, app.example.com + api.example.com can use lax; a reviewed same-origin proxy is another option. If target browsers block this direct topology, same-site domains/proxy are a deployment requirement rather than relaxing security. [MDN CORS and third-party-cookie limits](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS).

Private avatars now fetch image blobs using authenticated credentialed CORS and revoke local blob URLs when unmounted. Server same-site resource policy, ownership checks, private no-store responses and deny-all Storage rules remain intact; photos do not become public. [MDN resource policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Resource-Policy).

### Before deploying: read-only preflight

In a trusted shell with the production settings and credentials already injected:

```powershell
npm.cmd run deploy:preflight
```

It loads ignored server/.env/root .env when present; shell/host environment takes precedence. It requires NODE_ENV=production and the explicit settings above. Do not change local development files just to run it. Override them in that shell/session or a child process.

It validates environment/SMTP syntax, public-variable allowlist, HTTPS origins/cookies/limiter, Firebase public key acceptance, Admin Auth and read-only Firestore access, and local health route wiring. No user records are written and no email is sent. It does not test SMTP delivery or Storage writes.

Until the API URL exists, run `npm.cmd run deploy:preflight -- --backend-only`. This explicitly defers both API-origin inputs for this backend check, including a local development HTTP URL. It still rejects unknown VITE_* secrets and emulator configuration. It prints **PENDING frontend API wiring** and can pass backend checks. That is not a fully deployable frontend. With a real API URL supplied, it also verifies exact connect-src/img-src CSP permissions.

## Step 5 — deploy the latest commit

Open **dayora-api → Manual Deploy → Deploy latest commit**. Use the current main tip from Step 1. If Render still selects old code, verify the repository/branch, GitHub access and deployment event; use **Clear build cache & deploy** when appropriate. Do not choose “deploy a specific commit” with an old hash.

Read the deploy event/logs for the exact commit, Node 22.20.0 and successful startup. The server binds 0.0.0.0 with Render's PORT and retains SIGTERM/SIGINT graceful shutdown. If the error still names FIREBASE_PROJECT_ID/FIREBASE_WEB_API_KEY, those effective service values are missing/blank/invalid; fix group linking/overrides, save, then redeploy. .env.example does not provision dashboard variables.

## Step 6 — capture the real URL and check health

Copy the actual Render public HTTPS origin after the service is live:

```powershell
$env:DAYORA_API_URL = Read-Host 'Paste the actual Render HTTPS origin'
$env:APP_ORIGIN = 'https://dayora-five.vercel.app'
npm.cmd run deploy:check-api
```

The checker makes unauthenticated GET/OPTIONS requests to liveness/readiness and workspace endpoints. It checks HTTPS, exact credentialed CORS, allowed workspace/CSRF headers, untrusted-origin rejection and safe JSON 401 errors. It sends no credentials/email and changes no user records; normal API rate-limit counters may advance. A cold Render service can take time to wake up. Keep the real URL for Steps 7–10.

## Step 7 — set Vercel production variables

Open **Vercel → Dayora project → Settings → Environment Variables**. Set these in **Production**, retaining their correct current Firebase values:

- VITE_FIREBASE_API_KEY
- VITE_FIREBASE_PROJECT_ID
- VITE_FIREBASE_AUTH_DOMAIN
- VITE_API_URL = the exact real Render HTTPS origin from Step 6

All Firebase web values must match the backend project. Never set Admin JSON, private keys, SMTP_URL or Resend credentials under VITE_*. Vercel-owned VITE_VERCEL_* metadata is allowed; arbitrary user VITE_* variables remain rejected. Keep https://dayora-five.vercel.app authorized in Firebase Auth.

## Step 8 — generate and commit the exact CSP

In the repository shell, using the real URL already captured:

```powershell
$env:VITE_API_URL = $env:DAYORA_API_URL
npm.cmd run deployment:configure
npm.cmd run build
git diff -- vercel.json
git add vercel.json
git commit -m "Wire Dayora production API CSP"
git push origin main
```

The generator changes only exact API connect-src/img-src destinations and retains other protections. Vite rejects HTTP/localhost API origins, unknown VITE_* keys and API origins absent from the committed CSP. Do not commit a placeholder URL. Until this step the checked-in CSP remains same-origin and deliberately cannot certify direct Render wiring.

## Step 9 — redeploy Vercel

Use **Deployments → production deployment → Redeploy** for the newest main revision, ensuring the new production variables apply. Node 22.x; build npm run build; output dist. Do not deploy firebase-test/regression output. Verify the served CSP contains the exact Render origin and that requests include cookies. The frontend API service already uses credentials:include.

## Step 10 — live smoke test

Read-only default network smoke (no test credentials or mutation switches):

```powershell
$env:SMOKE_API_URL = $env:DAYORA_API_URL
$env:SMOKE_FRONTEND_URL = 'https://dayora-five.vercel.app'
npm.cmd run deployment:smoke
```

This checks reachability, CSP and unauthenticated denial. Leave SMOKE_EMAIL/PASSWORD, SMOKE_CRUD and SMOKE_SIGNUP unset for read-only mode. Authenticated/CRUD options are opt-in and are not needed for this initial network check.

Then perform this single browser acceptance checklist with dedicated accounts:

- [ ] Frontend loads; no CSP/CORS errors.
- [ ] Signup and actual verification email; verify link.
- [ ] Login and Individual onboarding.
- [ ] Create a project/task; add a Work Log note and Daily Note.
- [ ] Reload persistence; logout/login persistence.
- [ ] Create a team; invite a second verified user; join once.
- [ ] Switch between personal/team; private records stay separate.
- [ ] Owner can invite/remove/manage; Member cannot invoke owner actions.
- [ ] Second user cannot read an unrelated workspace; removal denies access.
- [ ] Logout invalidates session.
- [ ] Password reset email/link works and invalidates prior sessions.
- [ ] Cross-site sessions work in the target browsers; test third-party-cookie blocking.
- [ ] Without Storage: photo inputs are disabled, details save; other features work.
- [ ] With Storage later: private photos reload and other users cannot fetch unrelated media.
- [ ] Calendar events persist after reload and remain workspace scoped.
- [ ] Timer start/pause/stop saves accurate time entries without duplicates.
- [ ] Work Log edits/deletes persist and respect workspace permissions.
- [ ] Daily Notes remain private to the selected workspace after switching.
- [ ] Dashboard and analytics totals reflect the actual saved records.

## Remaining manual work / blockers

No authenticated Render/Vercel management connector is available in this session. Repository changes cannot attach a dashboard group, inject its secrets or select a live deployment revision. Those clicks are Steps 2–5 and 7/9. The real Render URL is still pending, so final CSP generation, Vercel API URL and live health/smoke checks remain blocked on that URL. Real browser cookies and email delivery remain production acceptance work. Nothing requires a fake URL, weaker cookies, direct Firestore access or a production data reset.

## Change manifest and verification

Exact changed files (including new files):

```text
.env.example
.node-version
DAYORA-REFINEMENT-REPORT.md
DEPLOYMENT.md
FINAL-DEPLOYMENT.md
PHASE5.md
package-lock.json
package.json
render.yaml
scripts/check-api.mjs
scripts/deployment-config.mjs
scripts/deployment-preflight.mjs
server/.env.example
server/auth.js
server/config.js
server/errors.js
server/media.js
src/components/Avatar.jsx
src/components/MemberDialog.jsx
src/pages/ProfilePage.jsx
src/services/media.js
src/services/publicEnvironment.js
tests/deployment.test.js
tests/e2e/dayora-refinement.spec.js
tests/e2e/phase5.spec.js
tests/production-readiness.test.js
vite.config.js
```

Validation: 76 unit tests, 15 authenticated browser tests and 15 UI regression tests passed; lint and git diff --check passed. The final Vite production build passed with VITE_API_URL explicitly empty in its child process, using the current same-origin CSP. This validates the build, not the pending direct Render connection. The output was rebuilt in production mode after authenticated tests.

The backend-only production preflight passed Firebase Web API key verification, Admin Auth, read-only Firestore and health wiring with locally injected production settings. No email was sent and no user records were changed. Storage was absent and correctly reported disabled. Live API checks and final API/CSP wiring await the actual Render URL. Local .env files, Firebase rules/indexes, and backend credentials were not changed.
