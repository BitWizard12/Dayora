# Dayora

**Your Day, Your Way.** Dayora continues the existing React/Vite application: dashboard, projects, Kanban/tasks, subtasks, calendar, team, timer, analytics and administrator account management. Existing styling, motion tokens and repository contracts are retained.

Firebase Authentication and Cloud Firestore are the active account/database architecture. Express verifies Firebase server-session cookies and owns every private read/write. Firebase Storage holds private profile/team pictures. MongoDB/Mongoose/Atlas is obsolete; historical reports are retained in `PHASE5-MONGODB-HISTORY.md` and `DEPLOYMENT-MONGODB-HISTORY.md`.

## Local setup

Install Node 22.20+ and Java 21+ for Firebase emulators, then:

```powershell
npm.cmd ci
Copy-Item .env.example .env
Copy-Item server/.env.example server/.env
npm.cmd run firebase:emulators
```

Keep that terminal open. In another terminal run `npm.cmd run dev:all` and open the Vite URL. The examples deliberately use the `demo-dayora` project and local Auth/Firestore/Storage emulators. No live Firebase credentials are needed. Signup, then open the verification link from ignored `server/.mail-preview`. Emulator data is temporary. Stopping/restarting emulators loses data unless you explicitly configure emulator export/import. Do not use a real project or real credentials for tests. A locally cached Java 21 runtime under ignored `.cache/java21` is supported by the test runner; other machines must install Java themselves.

## Checks

```powershell
npm.cmd test
npm.cmd run test:e2e
npm.cmd run test:e2e:accounts
npm.cmd run lint
npm.cmd run build
```

`npm test` starts or reuses the fixed local demo emulators and runs unit/integration/rules tests sequentially. It clears **demo-dayora emulator data**, so do not use that project for valuable local development data during tests. Account browser tests do the same and build an explicit `firebase-test` bundle; never deploy that bundle. Install Playwright Chromium with `npx.cmd playwright install chromium` if missing. The retained Phase 2–4 browser suite uses development-only regression mode. Normal production builds require authentication and refuse emulator configuration.

If you copied the local `.env`, remove `VITE_FIREBASE_AUTH_EMULATOR_URL` or use a separate production environment before `npm run build`. Configure real Firebase public web values for a deployable build; an unconfigured build can compile but cannot authenticate. `npm run deployment:configure` updates CSP for an exact HTTPS API origin.

## Architecture and operations

Read `DAYORA-DATA.md` for repository boundaries, `PHASE5.md` for the Firebase migration/change manifest and validation, and `DEPLOYMENT.md` for Firebase Console, Vercel, Render, bootstrap, migration and backup procedures. No cloud project was created, no existing database was migrated, and no external deployment/SMTP/restore was verified by local tests.

Registered accounts start with empty private workspaces. Anonymous device data is uploaded only through the existing explicit confirmation flow, and local backups remain on the device. A trusted reviewed-export migration command separately preserves old database record IDs while mapping old account IDs to existing Firebase UIDs. It defaults to a dry run.
