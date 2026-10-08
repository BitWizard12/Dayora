# Dayora data architecture

Firebase Authentication, Express/Firebase Admin, Firestore and private Storage are the active Phase 5 implementation. Earlier phase UI, domain selectors, repository commands and animations remain intact. MongoDB/Atlas is obsolete; see the retained history files for the previous implementation.

## Repository boundary

React consumes `workspaceRepositories` through `useRepository`. Components submit fields/commands; reusable repositories/services generate UUIDs, validate inputs, own persistence and publish stable snapshots. Components never access localStorage or Firestore directly. `createWorkspaceRepositories({ ownerId, workspaceId }, adapter)` remains the entry point. `httpWorkspaceAdapter` retains its HTTP snapshot/command contract, serialized writes, revision polling and stale-response/session-generation guards.

The authenticated session gate resolves the account, creates fresh scoped repositories, and unmounts the prior account UI on logout, expiry or account switching. Production requires authentication. Anonymous mode exists only in development regression mode. `localStorageAdapter.js` remains available for that mode and explicit local-data import; its namespaces are not an authorization boundary.

## Firestore structure

```text
users/{firebaseUid}                         trusted profile, role, active, workspaceId, sessionVersion
  workspaces/{workspaceUuid}                ownerId, workspaceId, revision, recordOrder, name, createdAt
    projects/{recordId}
    tasks/{recordId}
    events/{recordId}
    team/{recordId}
    timeEntries/{recordId}
    notifications/{recordId}
    settings/{recordId}
    profilePhotos/{recordId}
  sessions/{sha256RandomDeviceKey}           cookieHash, csrf, version, expiresAt
  media/{imageUuid}                         private Storage object metadata
adminAudits/{auditUuid}                     trusted account/migration changes
system/adminGuard                          serializes administrator changes/bootstrap
rateLimits/{prefix-sha256Key}               shared counters and enforced expiresAt
```

Each registered user has one private workspace. API names `time-entries` and `profile-photo` map to Firestore `timeEntries` and `profilePhotos`. Identity is the Firebase UID resolved from a verified server session. The server obtains workspaceId from its own user record, ignores submitted ownership, queries only that path, and validates all project/member links within the same workspace. Administrators receive account metadata and audit records; their role does not expose other users' private workspace content.

Firestore and Storage client rules deny everything, including authenticated/admin-claim clients. All intentional reads/writes go through Express. Firebase Admin bypasses rules, so backend authorization and restricted IAM are mandatory.

## Records and domain behavior

Flat records retain `id`, `ownerId`, `workspaceId`, `createdAt`, `updatedAt`. New record/subtask IDs are UUIDs. Existing stable IDs remain valid; numeric local legacy IDs are qualified by collection. JSON timestamps are epoch milliseconds; unknown legacy timestamps remain `null`.

- Projects retain name, description, status, date-only deadline and display attributes.
- Tasks retain descriptions, priorities, ordering (`position`), projectId, dueDate, assigneeIds, display fields, embedded UUID subtasks and completedAt. Stored statuses remain `To do`, `In progress`, `In review`, `Done`; UI labels are unchanged. Completion history is recorded on a real status transition; unknown legacy completions are not invented.
- Events are flat records with wall-clock date/time, IANA timeZone, DST choice, validated startsAt/endsAt and optional projectId. Calendar task/project deadlines are derived, never duplicated as persistent events. Timezone conversion and DST validation stay centralized in existing calendar services.
- Team members are workspace records, not registered accounts. Assignments resolve stable member IDs; ambiguous legacy initials remain unresolved. Member rename/removal updates task assignment displays atomically.
- Time entries retain projectId, label, startedAt, endedAt, runningSince, segments and duration. At most one active timer is allowed. Timestamp segments determine duration and daily totals. Project deletion retains historical session labels/IDs, while clearing project links from tasks/events/notifications.
- Settings/profile-photo records retain IDs and scoped metadata. Photos persist as `media:<uuid>`, resolving to a session-protected API URL. Uploads use Storage; no base64 image bodies persist in Firestore.

Task filtering/search, subtask progress, Today/Upcoming/Overdue/Completed views, calendar projections, team workload, dashboard and Recharts analytics remain derived from actual repository records. CSV export retains formula neutralization. UI components remain independent of Firebase database APIs.

## Concurrency and limits

Firestore read-only transactions produce consistent workspace snapshots. Workspace `recordOrder` retains each collection's original array order independently of Firestore document-ID sorting; task positions still drive Kanban ordering. Mutation transactions recheck the authoritative account state/version, compare the workspace revision, validate relationships/media, and write only changed/deleted records plus a new revision/order map. Stale revisions return 409 and trigger the existing refresh behavior. Unchanged timestamps remain unchanged. Project/member cleanup and imports commit together.

Atomic commands are conservatively capped at 450 changed records and 8 MiB serialized write payload; individual records are capped below Firestore's document limit. Large imports require reviewed smaller workspace datasets or a separately designed bulk migration. Reads still load a full workspace; this is intentionally compatible with existing repositories, not a large-workspace pagination design.

Session-version increments invalidate all prior sessions immediately. Physical deletion is limited to 400 registries per transaction; any remaining invalid registries cannot authenticate. Spark-compatible index configuration does not enable TTL: expired registries and abandoned rate-limit keys remain until trusted maintenance removes them. Every session request enforces expiry/version, and rate-limit transactions reset expired counters in place without requiring deletion. Admin overview queries only unexpired registries and filters active account versions. Admin access changes use the same version boundary and guard transaction. Auth and Firestore are different services: disabling Firebase Auth follows the authoritative Firestore deactivation, with a retry marker on failure. There is no claim of a cross-service atomic transaction.

## Migration

Anonymous local import remains opt-in into an empty account workspace. It remaps record/subtask IDs and linked references together, preserves unknown dates, leaves local backup keys intact, and never runs automatically after signup.

`server/import-export.js` is a separate trusted offline migration for reviewed former database exports. It requires one-to-one old owner/workspace to existing verified Firebase account mappings, defaults to a read-only dry run, rejects inconsistent metadata/foreign links, and preserves record/subtask IDs and ordering. Target owner/workspace metadata is rewritten to the verified Firebase UID/current workspace UUID. Each workspace and its import audit commit atomically; a multi-account export is not one global transaction. It never imports password hashes, sessions, account roles or unreviewed administrative privileges.

Local canonical keys remain `dayora:v1:<ownerId>:<workspaceId>:<collection>` with schemaVersion 1 envelopes. The old `fernly-*` keys are migration backups. No incompatible local schema change or automatic deletion is introduced.
