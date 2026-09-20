# Changelog

## 0.1.0 — 2026-09-20

- Initial TypeScript SDK generated from Trackee's public OpenAPI contract.
- Isolated clients, environment configuration, typed errors, cancellation, and configurable timeouts.
- Read request retries with Retry-After support; explicit opt-in for other methods.
- ESM and CommonJS builds with TypeScript declarations and no runtime dependencies.

### Known security issues

- Automatic redirects can forward the `x-access-key` header to a different origin. A transport fix is pending.
- Development dependencies have outstanding audit advisories. These dependencies are not installed by SDK consumers.
