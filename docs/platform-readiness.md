# Platform Readiness

This document describes the default production architecture for `wotlwedu` and
the higher-isolation deployment tiers available for larger tenants.

## Default Architecture

The default cloud deployment is shared, stateless application replicas:

- Backend API pods are horizontally scalable and do not keep tenant state on
  local disk.
- Organizations share the same app deployment and database tables.
- Tenant isolation is enforced through `organizationId`, space scoping, role and
  capability checks, tenant-aware audit feeds, rate limits, and support tooling.
- Uploaded media should use S3-compatible object storage in production so app
  replicas do not require shared local disk.

Do not provision one Kubernetes deployment per organization for normal consumer
tenants. That model adds operational overhead and should be reserved for strict
isolation needs.

## Tenant Isolation Tiers

Small/default tenants:

- Shared app pods.
- Shared database tables scoped by `organizationId`.
- Shared object-storage bucket with tenant-aware key prefixes.

Larger tenants:

- Shared app pods.
- Dedicated database schema or database.
- Dedicated object-storage prefix or bucket.
- Tenant-specific quotas and dashboards.

Enterprise or regulatory tenants:

- Dedicated database.
- Optional dedicated app deployment.
- Dedicated object-storage bucket.
- Optional per-tenant encryption keys.
- Optional region/data-residency placement.

Dedicated per-organization pods are appropriate only for enterprise isolation,
strict compliance, custom integrations/configuration, data residency,
noisy-neighbor isolation, or very large tenants.

## Health And Readiness

The backend exposes unauthenticated platform endpoints:

- `GET /healthz`: liveness check. Returns `200` when the process is alive.
- `GET /readyz`: readiness check. Returns `200` only when required
  dependencies, currently the database, are reachable. Returns `503` otherwise.
- `GET /metrics`: Prometheus text-format metrics when
  `WOTLWEDU_METRICS_ENABLED=true`.

Kubernetes probes must use `/healthz` for startup/liveness and `/readyz` for
readiness. Static documentation files such as `/docs/openapi.yaml` are not
valid probes because they do not prove the app can reach its dependencies.

## Logs And Request Correlation

The backend emits structured JSON request logs. Each request receives an
`X-Request-Id` response header. If a caller supplies `X-Request-Id` or
`X-Correlation-Id`, that value is preserved; otherwise the API generates one.

Log aggregators should index:

- `timestamp`
- `level`
- `service`
- `requestId`
- `method`
- `path`
- `route`
- `statusCode`
- `durationMs`
- `userId`
- `organizationId`

Use `requestId` to correlate a frontend report, API logs, ingress logs, and
error-reporting events.

## Metrics

`GET /metrics` exposes basic process and HTTP counters:

- uptime
- total requests
- requests by route label
- responses by status class
- cumulative request duration
- error-handler count
- readiness check/failure counts

Scrape this endpoint from the cluster network. Disable it with
`WOTLWEDU_METRICS_ENABLED=false` if the deployment uses an OpenTelemetry sidecar
or a different metrics collector.

## Error Reporting

Set `WOTLWEDU_ERROR_REPORTING_WEBHOOK_URL` to POST sanitized server error
events to an external collector. The payload includes service/version,
timestamp, error name/message, request context, and optionally a stack trace.

Use:

- `WOTLWEDU_ERROR_REPORTING_TIMEOUT_MS` to cap webhook latency.
- `WOTLWEDU_ERROR_REPORTING_INCLUDE_STACK=true` only in trusted environments.

Production responses still redact `5xx` bodies; detailed errors stay in logs and
the configured reporting sink.

## Media Storage

Production deployments should set:

- `WOTLWEDU_MEDIA_STORAGE_PROVIDER=s3`
- `WOTLWEDU_S3_BUCKET`
- `WOTLWEDU_S3_REGION`
- `WOTLWEDU_S3_ENDPOINT` when using MinIO or another compatible provider
- `WOTLWEDU_MEDIA_KEY_PREFIX`
- `WOTLWEDU_MEDIA_PUBLIC_BASE_URL`

Use per-tenant key prefixes or buckets for higher tiers. Use provider-managed or
per-tenant encryption keys when regulatory requirements demand it.

## Stateless App Requirements

App replicas should be safe to scale horizontally:

- Store sessions in the database.
- Use the database-backed rate-limit store in production.
- Use object storage for media.
- Keep Socket.IO deployments behind sticky sessions or add a shared adapter
  before scaling websocket traffic across many pods.
- Keep secrets in Kubernetes Secrets or an external secret manager.
