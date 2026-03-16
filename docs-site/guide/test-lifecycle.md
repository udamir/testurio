# Test Lifecycle

This page describes the full lifecycle of a Testurio test execution, from scenario startup to result collection.

## Overview

```
TestScenario.run(testCases)
  │
  ├── 1. Component Startup
  │     ├── Non-network components (DataSource, Publisher, Subscriber)
  │     ├── Servers (sequential, in config order)
  │     └── Clients (parallel)
  │
  ├── 2. Init Hook (if defined)
  │
  ├── 3. For each TestCase:
  │     ├── Before hook (if defined)
  │     ├── Phase 1: Register all hooks
  │     ├── Phase 2: Execute steps sequentially
  │     ├── Phase 3: Cleanup hooks
  │     ├── After hook (if defined)
  │     └── Collect results
  │
  ├── 4. Stop Hook (if defined)
  │
  └── 5. Component Shutdown
        ├── Clients (parallel)
        ├── Servers (reverse order)
        └── Non-network components
```

## Component Startup

Components start in a specific order to ensure servers are ready before clients connect:

1. **Non-network components** start first — DataSource, Publisher, and Subscriber establish their database/broker connections
2. **Servers** start sequentially in the order defined in the `components` array — sequential startup prevents port conflicts
3. **Clients** start in parallel after all servers are ready

```typescript
const scenario = new TestScenario({
  name: 'Test',
  components: [
    redis,      // DataSource - starts 1st
    mockServer, // Server - starts 2nd
    proxy,      // Server - starts 3rd (after mockServer)
    client,     // Client - starts 4th (parallel with other clients)
  ],
});
```

## Init and Stop Hooks

Optional setup and teardown that run at the scenario level:

```typescript
// Runs after all components start, before any test case
scenario.init((test) => {
  const db = test.use(redis);
  db.exec('seed database', async (client) => {
    await client.set('config', JSON.stringify({ feature: true }));
  });
});

// Runs after all test cases, before component shutdown
scenario.stop((test) => {
  const db = test.use(redis);
  db.exec('cleanup', async (client) => {
    await client.flushall();
  });
});
```

## Test Case Execution

Each test case executes in three phases:

### Phase 1: Register Hooks

All hooks from all steps are registered on their respective components **before** any step executes. This ensures handlers are in place when messages arrive.

### Phase 2: Execute Steps

Steps execute sequentially in registration order:

| Step Type | Behavior |
|-----------|----------|
| `action` | Executes immediately (sends request, publishes message) |
| `hook` | Already registered in Phase 1 — skipped (no-op) |
| `wait` | Blocks until the corresponding hook resolves or times out |

### Phase 3: Cleanup

After all steps complete (or on failure):
- All hooks are cleared from components
- Pending promises are rejected if unresolved
- Results are collected

### Before/After Hooks

Per-test-case setup and teardown:

```typescript
const tc = testCase('my test', (test) => {
  // ... test steps
})
  .before((test) => {
    const db = test.use(redis);
    db.exec('setup', async (client) => { /* seed data */ });
  })
  .after((test) => {
    const db = test.use(redis);
    db.exec('cleanup', async (client) => { /* delete data */ });
  });
```

## Component Shutdown

Components stop in reverse order:

1. **Clients** stop in parallel (close connections)
2. **Servers** stop in reverse config order (stop listening)
3. **Non-network components** stop last (disconnect from databases/brokers)

## Test Case Metadata

Test cases support metadata for reporting:

```typescript
const tc = testCase('Get user', (test) => { /* ... */ })
  .id('TC-001')
  .epic('User Management')
  .feature('User API')
  .story('Get User')
  .severity('critical')
  .tags('api', 'smoke')
  .issue('BUG-123')
  .description('Verifies user retrieval by ID');
```

## Running Tests

```typescript
// Run a single test case
const result = await scenario.run(testCase1);

// Run multiple test cases
const result = await scenario.run(testCase1, testCase2, testCase3);
```

## Result Types

```typescript
interface TestResult {
  name: string;           // Scenario name
  passed: boolean;        // All test cases passed
  testCases: TestCaseResult[];
  duration: number;       // Total duration in ms
}

interface TestCaseResult {
  name: string;           // Test case name
  passed: boolean;
  steps: TestStepResult[];
  duration: number;
  error?: Error;
}

interface TestStepResult {
  stepNumber: number;
  type: string;
  description: string;
  passed: boolean;
  duration: number;
  error?: string;
}
```

## Error Handling

| Error Type | Description |
|------------|-------------|
| **Assertion failure** | Test case fails, remaining steps may be skipped |
| **Timeout** | Wait step fails with timeout error |
| **Strict ordering violation** | Error if message arrives before `waitX` step starts |
| **ValidationError** | Schema validation failed on a payload |

## Timeout Configuration

| Scope | Default | Configuration |
|-------|---------|---------------|
| Wait step | 5000ms | `.timeout(10000)` on any wait step |
| Request | None | N/A |
