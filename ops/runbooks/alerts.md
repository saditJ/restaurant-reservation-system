# Alert Runbooks

This document captures the initial alerting rules that map to the new telemetry signals. Adjust thresholds once you have baseline traffic.

## Prometheus Rule Snippets

```yaml
- alert: ReserveApiP95LatencyHigh
  expr: histogram_quantile(0.95, sum by (le)(rate(http_request_duration_seconds_bucket{route!~"/metrics"}[5m]))) > 0.4
  for: 5m
  labels:
    severity: page
  annotations:
    summary: "API p95 latency degraded"
    runbook_url: "https://grafana.example.com/d/reserve-api"

- alert: ReserveApi5xxRate
  expr: sum(rate(http_request_duration_seconds_count{status_code=~"5.."}[5m]))
        /
        sum(rate(http_request_duration_seconds_count[5m])) > 0.05
  for: 3m
  labels:
    severity: page
  annotations:
    summary: "5xx rate above 5%"
    runbook_url: "https://grafana.example.com/d/reserve-api"

- alert: ReserveApiQuotaNearCap
  expr: (sum_over_time(rate_limit_allows_total{keyId=~".+"}[30d])
        /
        scalar(100000)) > 0.85
  for: 10m
  labels:
    severity: warn
  annotations:
    summary: "Tenant quota consumption above 85%"
    runbook_url: "https://grafana.example.com/d/reserve-api"
```

> Replace `scalar(100000)` with either a recording rule that scrapes the real cap per tenant or a constant derived from your `QUOTA_MONTHLY_DEFAULT`.

## Response Playbooks

### p95 Latency High
- **Check** the `Reserve API Observability` dashboard (panels 1 & 2) for traffic spikes or hot routes.
- **Compare** recent deploys; roll back if latency spike aligns with a release.
- **Inspect** slow routes with `prisma` traces in your OTLP backend to identify heavy queries.

### 5xx Rate Spike
- **Verify** if the spike is localized to specific HTTP methods/routes via panel 3.
- **Inspect** recent logs / trace spans for correlated error codes.
- **Mitigate** by draining problematic tenants or disabling experimental features until the error budget recovers.

### Quota Nearing Cap
- **Identify** the offending API key via `rate_limit_drops_total` + `rate_limit_allows_total` breakdown (panels 4 & 5).
- **Notify** the tenant before throttling; consider raising caps temporarily if the increase is legitimate.
- **Confirm** that automated clean-up jobs (idempotency cache, waitlist) are running to avoid artificial usage inflation.
