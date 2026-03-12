# Test Execution Lifecycle

This document describes the full lifecycle of a Testurio test execution, from scenario setup to result collection.

## Overview

```
TestScenario.run(testCases)
  │
  ├── 1. Component Startup
  │     ├── Non-network components (DataSource)
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

## 1. Component Startup

Components start in a specific order to ensure servers are ready before clients connect:

1. **Non-network components** start first (DataSource, Publisher, Subscriber). These establish database connections and message broker connections.
2. **Servers** start sequentially in the order defined in the `components` array. Sequential startup prevents port conflicts.
3. **Clients** start in parallel after all servers are ready.

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

## 2. Init Hook

Optional setup that runs after all components start but before any test case:

```typescript
scenario.init((test) => {
  const db = test.use(redis);
  db.exec('seed database', async (client) => {
    await client.set('config', JSON.stringify({ feature: true }));
  });
});
```

## 3. Test Case Execution

Each test case executes in three phases.

### Phase 1: Register Hooks

All hooks from all steps are registered on their respective components **before** any step executes. This ensures hooks are in place when messages arrive.

```typescript
const tc = testCase('example', (test) => {
  const api = test.use(client);
  const mock = test.use(server);

  // These three statements register steps during the builder phase.
  // During Phase 1, hooks from onRequest and onResponse are registered.
  api.request('getUsers', { method: 'GET', path: '/users' });
  mock.onRequest('getUsers').mockResponse(() => ({ code: 200, body: [] }));
  api.onResponse('getUsers').assert((res) => res.code === 200);
});
```

### Phase 2: Execute Steps

Steps execute sequentially in registration order:

| Step                  | Mode     | Behavior                        |
| --------------------- | -------- | ------------------------------- |
| `api.request(...)`    | `action` | Sends HTTP request immediately  |
| `mock.onRequest(...)` | `hook`   | Already registered; no blocking |
| `api.onResponse(...)` | `hook`   | Already registered; no blocking |

For `wait` mode steps:

| Step                    | Mode   | Behavior                                     |
| ----------------------- | ------ | -------------------------------------------- |
| `api.waitResponse(...)` | `wait` | Blocks until the response arrives or timeout |

### Phase 3: Cleanup

After all steps complete (or on failure):
- All hooks are cleared from components
- Pending promises are rejected if unresolved
- Results are collected

### Before/After Hooks

```typescript
const tc = testCase('example', (test) => { /* ... */ })
  .before((test) => {
    const db = test.use(redis);
    db.exec('setup', async (client) => { /* seed data */ });
  })
  .after((test) => {
    const db = test.use(redis);
    db.exec('cleanup', async (client) => { /* delete data */ });
  });
```

## 4. Stop Hook

Optional teardown that runs after all test cases but before component shutdown:

```typescript
scenario.stop((test) => {
  const db = test.use(redis);
  db.exec('cleanup', async (client) => {
    await client.flushall();
  });
});
```

## 5. Component Shutdown

Components stop in reverse order:

1. **Clients** stop in parallel (close connections)
2. **Servers** stop in reverse config order (stop listening)
3. **Non-network components** stop last (disconnect from databases/brokers)

## Step Execution Detail

### Action Steps

Execute immediately and may trigger side effects:

```
request('getUsers', data)
  → Client adapter sends HTTP request
  → Response is stored, matching hooks are resolved
```

### Hook Steps

Already registered in Phase 1. During Phase 2, they are skipped (no-op). Their handlers execute when a matching message arrives during another step's execution.

```
onRequest('getUsers').mockResponse(fn)
  → Hook registered in Phase 1
  → When request arrives, handler executes and returns mock response
```

### Wait Steps

Block execution until their hook resolves:

```
waitResponse('getUsers')
  → Hook registered in Phase 1 with a Deferred promise
  → Phase 2: step execution blocks on the Deferred
  → When response arrives, Deferred resolves
  → Handlers (assert, transform) execute on the resolved value
  → If timeout expires, Deferred rejects with timeout error
```

## Timeout Behavior

| Scope     | Default | Configuration                         |
| --------- | ------- | ------------------------------------- |
| Wait step | 5000ms  | `waitResponse('x', traceId, timeout)` |
| Test case | None    | Via TestScenario config               |

## Error Handling

- **Assertion failure:** Test case fails, remaining steps may be skipped (fail-fast)
- **Timeout:** Wait step fails with timeout error
- **Strict ordering violation:** Error thrown if message arrives before `waitX` step starts
- **Unhandled errors:** Tracked on the component, reported in results

## Reporter Events

Reporters receive events throughout the lifecycle:

| Event                | When                                   |
| -------------------- | -------------------------------------- |
| `onStart`            | Scenario execution begins              |
| `onTestCaseStart`    | Test case execution begins             |
| `onStepComplete`     | Each step completes (pass or fail)     |
| `onTestCaseComplete` | Test case finishes with result         |
| `onComplete`         | All test cases finished, final results |
| `onError`            | Unhandled error occurs                 |

## Port Allocation

To avoid port conflicts between test files, each file uses a dedicated port range:

| Test File                                | Port Range |
| ---------------------------------------- | ---------- |
| `sync-chain.integration.test.ts`         | 13xxx      |
| `proxy-multi-client.integration.test.ts` | 15xxx      |

Follow this pattern when adding new integration tests.
