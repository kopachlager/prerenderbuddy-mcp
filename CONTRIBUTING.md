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

This project will not accept browser rendering, hosted monitoring, private API
access, telemetry, managed routing, cache management, or infrastructure
deployment features.
