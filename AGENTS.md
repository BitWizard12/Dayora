# Dayora development constraints

- Continue the existing React/Vite application and preserve completed phases, components, styling, animations, and working interactions.
- Phase 5 uses Firebase Authentication, Firestore, Firebase Admin SDK and private Firebase Storage through Express. MongoDB/Atlas is obsolete. Preserve completed frontend phases.
- Put data reads, writes, imports, record creation, and mutation commands in reusable services/repositories. UI components must not call localStorage or generate record IDs.
- The current local adapter is `src/services/localStorageAdapter.js`. React consumes repository snapshots through `src/hooks/useRepository.js`.
- Use `createWorkspaceRepositories(scope, adapter)` as the workspace data entry point. All collections are scoped by `ownerId` and `workspaceId`.
- New records require UUIDs and ownership metadata. Preserve existing stable IDs and links when migrating data. Calendar events and time entries are flat collections; UI grouping is a derived view.
- Dashboard statistics must use actual repository records. Do not invent creation history for legacy records whose timestamps are unknown.
- The final product name is Dayora. Keep the existing directory/package location; a rename or restart is unnecessary.
- Derive ownership from verified Firebase server sessions on every query and mutation. Local ownership fields/storage namespaces are not a security boundary. Keep direct Firestore/Storage client access denied.
- Run appropriate unit and browser regression checks when changing persistence, timer behavior, or entity operations.
