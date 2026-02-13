# Changelog

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
