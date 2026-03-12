# Execution Layer

**Location:** `packages/core/src/execution/`

The execution layer orchestrates the entire test lifecycle: component startup/shutdown, step execution ordering, and result collection.

## Key Classes

### TestScenario

The top-level orchestrator. Owns all components and manages their lifecycle.

```typescript
const scenario = new TestScenario({
  name: 'User API Tests',
  components: [server, client],  // servers first, then clients
});

scenario.addReporter(new AllureReporter());
const result = await scenario.run(testCase1, testCase2);
```

**Responsibilities:**
- Start components in correct order (non-network first, then servers sequentially, then clients in parallel)
- Execute test cases sequentially
- Stop components in reverse order
- Collect and aggregate results
- Dispatch reporter events

**Lifecycle hooks:**
- `scenario.init(handler)` - Runs after all components start, before any test case
- `scenario.stop(handler)` - Runs after all test cases, before component shutdown

### TestCase

Represents a single test case with its steps and metadata.

```typescript
const tc = testCase('user creation', (test) => {
  const api = test.use(client);
  const mock = test.use(server);

  api.request('createUser', { method: 'POST', path: '/users', body: { name: 'Alice' } });
  mock.onRequest('createUser').mockResponse(() => ({ code: 201, body: { id: '1' } }));
  api.onResponse('createUser').assert((res) => res.code === 201);
});
```

**Lifecycle hooks:**
- `tc.before(handler)` - Runs before the test case steps
- `tc.after(handler)` - Runs after the test case steps

**Metadata (for reporting):**
- `tc.id(value)`, `tc.epic(value)`, `tc.feature(value)`, `tc.severity(value)`, `tc.tags(...values)`

### StepExecutor

Executes steps registered by the builder layer. Implements the three-phase execution model:

1. **Phase 1 - Register Hooks:** All hooks are registered on components before any step executes. This ensures hooks are ready before messages arrive.
2. **Phase 2 - Execute Steps:** Steps execute sequentially in registration order. Action steps fire immediately; wait steps block until their hook resolves.
3. **Phase 3 - Cleanup:** All hooks are cleared from components.

## Component Startup Order

```
1. Non-network components (DataSource) - start first
2. Servers - start sequentially in config order
3. Clients - start in parallel
```

## Component Shutdown Order

```
1. Clients - stop in parallel
2. Servers - stop in reverse config order
3. Non-network components - stop last
```

## Result Types

```typescript
interface TestResult {
  name: string;
  passed: boolean;
  testCases: TestCaseResult[];
  duration: number;
}

interface TestCaseResult {
  name: string;
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

## Files

| File               | Purpose                                      |
| ------------------ | -------------------------------------------- |
| `test-scenario.ts` | TestScenario class - lifecycle orchestration |
| `test-case.ts`     | TestCase class and `testCase()` factory      |
| `step-executor.ts` | Step execution engine                        |
| `types.ts`         | Result types and execution context           |
