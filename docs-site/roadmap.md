# Roadmap

Upcoming features and improvements planned for Testurio.

## CLI Test Runner

**Status:** Not Started | **Priority:** Medium | **Package:** `@testurio/cli`

A configurable test runner for Testurio scenarios with two execution modes:

- **Vitest Integration (default)** - Uses Vitest as the underlying runner with a custom plugin and reporter bridge. Provides parallel execution, watch mode, and coverage.
- **Standalone Mode** - Lightweight runner using esbuild and tinypool for simple cases or minimal CI environments.

Key features:
- Configurable via `testurio.config.ts`, CLI flags, and environment variables
- Multiple reporter formats (Console, JSON, JUnit, Allure)
- CI/CD ready with meaningful exit codes
- Test file discovery and pattern filtering

## Real-Time Execution Reporting

**Status:** Not Started | **Priority:** Medium

Real-time console reporting that displays test progress during execution, similar to Vitest's output. Provides step-level visibility with spinners, colors, and status indicators.

- **Interactive mode (TTY)** - Animated spinners, color-coded step status, live progress
- **CI mode (non-TTY)** - Plain text output with pass/fail markers
- **Minimal mode** - One line per test case

Requires a new `onStepStart` event on the `TestReporter` interface for step-level progress tracking.

## Unified Service Component Pending Pattern

**Status:** Not Started | **Priority:** Medium

Internal refactor to consolidate the dual pending/deferred pattern in `ServiceComponent`. Currently there are two parallel implementations of deferred resolution (one in `BaseComponent` used by Subscriber, one in `ServiceComponent` used by Client/Server/AsyncClient/AsyncServer). This will unify them using Hook's built-in `pending` field.

- No breaking changes to public API
- Removes duplicate deferred management
- All components use the same hook-based approach

## Sync Client Request Chain API

**Status:** Not Started | **Priority:** Low

Chain `onResponse()` directly to `request()` calls for a more concise API:

```typescript
// Current
api.request('getUsers', { method: 'GET', path: '/users' });
api.onResponse('getUsers').assert((res) => res.body.length > 0);

// Proposed
api.request('getUsers', { method: 'GET', path: '/users' })
   .onResponse()
   .assert((res) => res.body.length > 0);
```

Fully backwards compatible - the existing two-step pattern continues to work.

## AsyncAPI Support

**Status:** Not Started | **Priority:** Low | **Package:** `@testurio/cli`

Generate WebSocket/async service definitions from AsyncAPI specifications, extending the CLI's schema generation capabilities alongside existing OpenAPI and Protobuf support.
