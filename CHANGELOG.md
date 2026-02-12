# Changelog

## 0.0.4 - 2026-02-12
- Add authenticated `/ai` route module with deterministic AI-assisted endpoints for recommendations, summaries, suggestions, moderation, categorization, metadata description, and assistant queries.
- Add `controllers/ai.js` and `util/ai.js` to provide self-hosted heuristic logic using existing models and `StatusResponse`.
- Document all `/ai/*` endpoints in OpenAPI and README, and add unit tests for text categorization, moderation, and list suggestion behavior.

## 0.0.3 - 2025-12-16
- Log backend version at startup and enforce presence of `WOTLWEDU_JWT_SECRET`.
- Reject login for inactive accounts to prevent issuing tokens for disabled users.
- Allow JWT auth header to include optional `Bearer` prefix.
