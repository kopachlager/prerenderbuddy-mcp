# Contributing

Focused fixes, tests, documentation corrections, and transparent diagnostic
improvements are welcome.

Before opening a pull request:

```bash
npm ci
npm test
npm run test:coverage
npm run check
npm run pack:check
```

Public diagnostics inspect HTTP responses without executing JavaScript.
Workspace features use only the documented Prerender Buddy Developer API,
with its plan, scope, ownership and approval checks. This package does not
provide direct database or infrastructure access, browser rendering, telemetry,
managed crawler routing, cache management, or hosted monitoring jobs.
