# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-01-16

### Added

- Initial release
- PreviewClient for calculation previews
- TraceClient for trace access
- Error hierarchy with retryable flag
- Exponential backoff with jitter
- Per-attempt timeout and overall deadline
- AbortSignal cancellation support
- Idempotency key support
- PII-safe logging (SafeLogMeta allowlist)
- Mock clients for testing
- TypeScript strict mode with exactOptionalPropertyTypes

### Security

- HTTPS-only baseUrl validation
- No PII in logs (KVKK compliance)
- Request hash for replay safety
