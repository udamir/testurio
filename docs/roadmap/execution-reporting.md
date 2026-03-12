# Execution Reporting (Real-Time Progress)

**Status:** Not Started
**Priority:** Medium

## Overview

Real-time execution reporting that displays test progress in the console during execution, similar to Vitest's output. Provides step-level visibility with spinners, colors, and status indicators.

## Output Modes

### Interactive Mode (TTY)

```
 Running test scenario: User API Tests

 ◐ user creation flow
   ├─ api         → POST /users           ◐ sending...
   ├─ backend     ← POST /users           ✓ mocked
   └─ api         ← POST /users           ⏳ waiting

 ✓ user deletion flow (245ms)
   ├─ api         → DELETE /users/123     ✓ 204 (45ms)
   ├─ backend     ← DELETE /users/123     ✓ handled
   └─ api         ← DELETE /users/123     ✓ asserted

 ✗ user update flow (312ms)
   ├─ api         → PUT /users/123        ✓ sent (23ms)
   ├─ backend     ← PUT /users/123        ✓ handled
   └─ api         ← PUT /users/123        ✗ assertion failed
      AssertionError: Expected status 200, got 500

 Tests:  1 failed | 2 passed | 3 total
 Time:   1.234s
```

### CI Mode (Non-TTY)

```
[PASS] user creation flow (189ms)
  [OK] api → POST /users (45ms)
  [OK] backend ← POST /users
  [OK] api ← POST /users (12ms)

[FAIL] user update flow (312ms)
  [OK] api → PUT /users/123 (23ms)
  [ERR] api ← PUT /users/123
    AssertionError: Expected status 200, got 500
```

### Minimal Mode

```
✓ user creation flow (189ms)
✗ user update flow (312ms)
  → AssertionError: Expected status 200, got 500

1 failed | 1 passed | 2 total (1.234s)
```

## Architecture

```
TestScenario
  └─ ProgressReporter (implements TestReporter)
       ├─ ExecutionState (tracks current execution state)
       ├─ TerminalRenderer (TTY - ANSI codes, spinners)
       └─ StreamRenderer (CI - plain text)
```

## Extended Reporter Interface

Requires a new `onStepStart` event on the existing `TestReporter` interface:

```typescript
interface TestReporter {
  // ... existing events
  onStepStart?(step: StepStartInfo): void;  // NEW
}

interface StepStartInfo {
  stepNumber: number;
  totalSteps: number;
  type: StepType;
  componentName?: string;
  messageType?: string;
  description?: string;
}
```

## Core Components

| Component          | Purpose                                         |
| ------------------ | ----------------------------------------------- |
| `ProgressReporter` | Main reporter class implementing `TestReporter` |
| `ExecutionState`   | Tracks test case and step state for rendering   |
| `TerminalRenderer` | Interactive TTY rendering with ANSI codes       |
| `StreamRenderer`   | Plain text CI rendering                         |
| `Spinner`          | Animated spinner for in-progress items          |

## Configuration

```typescript
scenario.addReporter(new ProgressReporter({
  mode: 'auto',         // 'auto' | 'interactive' | 'ci' | 'minimal' | 'silent'
  showSteps: true,       // Show individual step progress
  showDuration: true,    // Show timing information
  spinner: 'dots',       // 'dots' | 'line' | 'arc' | 'bounce' | 'braille'
  theme: 'default',      // Color theme
}));

// Shorthand
scenario.useProgressReporter();
```

## Integration Points

### StepExecutor Changes

The `executeSteps` function needs an `onStepStart` callback alongside the existing `onStepComplete`:

```typescript
executeSteps(steps, context, {
  onStepStart: (step, index) => { /* notify reporters */ },
  onStepComplete: (result, index) => { /* notify reporters */ },
});
```

### TestScenario Changes

Forward step start events to all reporters.

## Implementation Phases

1. **Core Infrastructure** - Terminal utilities, spinner, icons, `ExecutionState`
2. **Renderers** - `StreamRenderer` (CI), `TerminalRenderer` (interactive)
3. **ProgressReporter** - Main class, mode auto-detection, `TestScenario` integration
4. **Polish** - Configuration options, themes, shorthand methods, tests

## Backward Compatibility

- Existing reporters continue to work unchanged
- `onStepStart` is optional - existing reporters ignore it
- Opt-in feature via `scenario.addReporter(new ProgressReporter())`
