# CLI Test Runner

**Status:** Not Started
**Priority:** Medium
**Package:** `@testurio/cli`

## Overview

A configurable test runner for Testurio scenarios with two execution modes: Vitest integration (recommended) and standalone.

## Goals

- Fast execution via Vitest's parallel worker pool
- Configurable via config files, CLI flags, and environment variables
- CI/CD ready with exit codes and multiple reporter formats
- Works with or without Vitest installed

## CLI Interface

```bash
# Run all tests (Vitest mode, default)
testurio run

# Run specific files/patterns
testurio run tests/integration/*.test.ts

# Run with options
testurio run --parallel --timeout 30000
testurio run -f "user API"               # filter by name
testurio run --reporter allure

# Standalone mode (without Vitest)
testurio run --standalone

# Other commands
testurio init      # create config file
testurio list      # list discovered test files
```

## Execution Modes

### Mode 1: Vitest Integration (Default)

Uses Vitest as the underlying runner. Provides:
- Vitest plugin for Testurio test file handling
- Custom reporter bridge to Testurio reporters
- Parallel execution, watch mode, and coverage via Vitest

```
@testurio/cli → Vitest Plugin → Vitest Runner → Reporter Bridge → Testurio Reporters
```

### Mode 2: Standalone

Lightweight runner for simple cases or minimal CI environments:
- esbuild for TypeScript transpilation
- tinypool for parallel execution
- Direct `TestScenario.run()` invocation

```
@testurio/cli → Test Discovery → esbuild → Worker Pool → Reporter Manager
```

## Configuration

```typescript
// testurio.config.ts
import { defineConfig } from '@testurio/cli';

export default defineConfig({
  root: '.',
  include: ['tests/**/*.test.ts', 'e2e/**/*.test.ts'],
  exclude: ['node_modules', 'dist'],
  parallel: true,
  concurrency: 4,
  timeout: 30000,
  failFast: false,
  retry: 0,
  reporters: [
    'console',
    ['json', { outputFile: 'results.json' }],
    ['allure', { outputDir: './allure-results' }],
  ],
  env: { NODE_ENV: 'test' },
  globalSetup: './tests/setup.ts',
  globalTeardown: './tests/teardown.ts',
});
```

### Configuration Resolution Priority

1. CLI flags (highest)
2. Environment variables (`TESTURIO_*`)
3. Config file
4. Defaults (lowest)

## Test File Format

```typescript
// tests/api.test.ts
import { TestScenario, testCase, Client, Server, HttpProtocol } from 'testurio';

export const scenario = new TestScenario({
  name: 'API Tests',
  components: [server, client],
});

export const tests = [
  testCase('GET /users', (test) => { /* ... */ }),
  testCase('POST /users', (test) => { /* ... */ }),
];

export default { scenario, tests };
```

## Reporters

| Reporter | Output |
|----------|--------|
| Console | Human-readable terminal output |
| JSON | Machine-readable JSON file |
| JUnit | XML for CI systems |
| Allure | Integration with `@testurio/reporter-allure` |
| Custom | Implement `Reporter` interface |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All tests passed |
| 1 | Some tests failed |
| 2 | Configuration error |
| 3 | No tests found |
| 130 | Interrupted (Ctrl+C) |

## Package Structure

```
packages/cli/
├── src/
│   ├── index.ts
│   ├── cli.ts
│   ├── config/        # Config loading and validation
│   ├── discovery/     # Test file discovery
│   ├── vitest/        # Vitest plugin and reporter bridge
│   ├── standalone/    # Standalone runner and workers
│   ├── reporters/     # Built-in reporters
│   └── utils/         # Colors, timer formatting
└── bin/
    └── testurio.ts
```

## Dependencies

- `cac` - CLI argument parsing
- `fast-glob` - File pattern matching
- `tinypool` - Worker pool (standalone mode)
- `esbuild` - TypeScript transpilation
- `picocolors` - Terminal colors
- `vitest` (optional peer) - For Vitest integration mode
- `testurio` (peer) - Core framework

## Implementation Phases

1. **Vitest Integration** - Plugin, test file detection, reporter bridge, CLI wrapper
2. **Standalone Runner** - CLI parser, config loading, discovery, sequential execution
3. **Parallel Execution** - Worker pool, test distribution, result aggregation
4. **Reporters** - JSON, JUnit, Allure integration, custom reporter API
5. **Advanced** - Retry logic, test filtering, coverage integration

## Open Questions

- Test file format: explicit exports vs auto-detection?
- Standalone coverage support or delegate to Vitest?
- CI sharding support (like Vitest `--shard`)?
