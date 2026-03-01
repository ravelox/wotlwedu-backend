# Changelog

## 0.0.18 - 2026-02-28
- Normalize `item.workgroupId` inputs through the shared ID normalizer on list/create/update paths so placeholder values like `" undefined "` and `" null "` do not trigger inconsistent item-scoping behavior.

## 0.0.17 - 2026-02-28
- Add optional Helm ingress support to `k8s/`.
- Add optional per-environment Helm service/ingress overrides via `environment` and `environments.<name>.*` values.
- Make notification listing paginated and newest-first, and make unread counts use a database count instead of loading all unread rows.
- Clean up notification API response payloads to return `notification` consistently for create/update/status operations.
- Make item/list/image share acceptance re-check friendship and execute the copy/delete flow through a transaction-aware code path.
- Emit structured notification socket payloads (`kind`, `notificationId`, `unreadCount`, optional `notification`) for client-side delta updates instead of only firing a bare invalidation signal.

## 0.0.15 - 2026-02-27
- Make the update runner adapter-independent from runtime `WOTLWEDU_DB_TYPE` by forcing Sequelize for update execution (`model/util-updatedb.js` + `util/database.js`).
- This keeps update modules portable across configured runtime adapters while preserving existing Sequelize-based update implementations.

## 0.0.14 - 2026-02-27
- Protect `/organization` routes with capability checks (`view`, `add`, `edit`, `delete`) in the router layer.
- Harden Docker startup flow by always running `model/util-createdb` before `model/util-updatedb` so baseline tables are created when DB exists but schema is missing.
- Ignore macOS Finder metadata files via `.DS_Store` in `.gitignore`.

## 0.0.13 - 2026-02-27
- Add consistent `categoryId` projection/handling across category-enabled resources (`group`, `workgroup`, `image`, `item`, `list`, `election`).
- Enforce per-user category ownership when assigning `categoryId` on create/update (with explicit null clearing support).
- Add optional category-grouped response menus (`?collapsible=true`) for category-enabled collection endpoints.
- Normalize workgroup/organization ID inputs (`""`, `"undefined"`, `"null"`) to avoid false `421` errors from frontend placeholder values.

## 0.0.12 - 2026-02-14
- Support workgroup-scoped user listing via `GET /user?workgroupId=...` (used by the browser console when a workgroup scope is selected).

## 0.0.11 - 2026-02-14
- Make DB update modules safer/idempotent: avoid destructive `sync({ force: true })` and guard role/capability/user-role assignments against duplicates.
- Update README to reflect the actual DB update runner behavior (metadata-per-update-id + optional physical checks), not `database.version` gating.

## 0.0.10 - 2026-02-14
- Fix Sequelize Workgroup/WorkgroupMember association direction that could generate an invalid FK and prevent `workgroups` table creation.
- Fix auth middleware boolean parsing for admin flags (`true/false`, `0/1`, `"true"/"false"`) when using `raw: true` with SQL dialects.
- Allow authenticated users to read their own organization while keeping organization management endpoints restricted to admins.

## 0.0.9 - 2026-02-14
- Workgroup endpoints self-heal by creating missing `workgroups` tables on first access (useful for partially initialized DBs).

## 0.0.8 - 2026-02-14
- Make DB updates more resilient on partially migrated databases (re-apply when metadata exists but schema changes are missing).
- Ensure startup fails fast if database updates fail (docker entrypoint checks `util-updatedb` exit code).
- Prevent unhandled promise rejection in `/workgroup` listing when the table is missing.

## 0.0.7 - 2026-02-14
- Fix DB update runner startup crash when the database exists but is missing newer columns (avoid global `sequelize.sync()` before updates).

## 0.0.6 - 2026-02-14
- Add dedicated workgroup model/API (separate from election audience groups) and org-scoped access controls.
- Add organization/workgroup capabilities and grant them to the Root Role via `update-0008`.
- Add workgroup-scoped administration for items/images/lists/elections (admins can target a workgroup).
- Harden DB update runner to apply only `update-\\d+.js` and backfill metadata when updates are already applied.
- Add comprehensive curl examples for key endpoints (including organization/workgroup and scoped resources).

## 0.0.5 - 2026-02-13
- Add multi-tenant foundations with organizations and organization-scoped workgroups.
- Add explicit user classifications: `systemAdmin`, `organizationAdmin`, and `workgroupAdmin` (single admin workgroup via `adminGroupId`).
- Add organization management endpoints (`/organization`) and tenant-aware auth context/scope helpers in security middleware.
- Add database updates `update-0006` and `update-0007` for tenancy and system-admin schema/data migration.
- Remove legacy `TODO` file.

## 0.0.4 - 2026-02-12
- Add authenticated `/ai` route module with deterministic AI-assisted endpoints for recommendations, summaries, suggestions, moderation, categorization, metadata description, and assistant queries.
- Add `controllers/ai.js` and `util/ai.js` to provide self-hosted heuristic logic using existing models and `StatusResponse`.
- Document all `/ai/*` endpoints in OpenAPI and README, and add unit tests for text categorization, moderation, and list suggestion behavior.

## 0.0.3 - 2025-12-16
- Log backend version at startup and enforce presence of `WOTLWEDU_JWT_SECRET`.
- Reject login for inactive accounts to prevent issuing tokens for disabled users.
- Allow JWT auth header to include optional `Bearer` prefix.
