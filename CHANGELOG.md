# Changelog

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
