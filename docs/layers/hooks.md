# Hook Layer

**Location:** `packages/core/src/components/base/`

The hook layer provides message interception, transformation, and mocking. Each component maintains its own `HookRegistry` for test isolation.

## Hook Lifecycle

1. **Registration (Phase 1):** Hooks are created from Steps during the registration phase, before any step executes.
2. **Matching:** When a message arrives at a component, the HookRegistry finds matching hooks by message type.
3. **Execution:** Matched hooks execute their handlers (assert, transform, mockResponse, etc.).
4. **Cleanup (Phase 3):** After all steps complete, hooks are cleared.

## Hook Interface

```typescript
interface Hook {
  id: string;
  stepId: string;
  testCaseId?: string;
  isMatch: (message: unknown) => boolean;
  step: Step;
  persistent: boolean;
  pending?: Deferred<unknown>;
  resolved?: boolean;
}
```

| Field | Purpose |
|-------|---------|
| `id` | Unique hook identifier |
| `stepId` | Links back to the Step that created this hook |
| `testCaseId` | Scopes the hook to a specific test case (for parallel isolation) |
| `isMatch` | Predicate that determines if an incoming message matches |
| `persistent` | If `true`, hook survives after first match (for `onX` hooks) |
| `pending` | Deferred promise for `waitX` steps - resolved when message arrives |
| `resolved` | Flag indicating the hook has already been resolved |

## HookRegistry

Each component has a `HookRegistry` that manages hook registration, matching, and cleanup.

```typescript
class HookRegistry {
  register(hook: Hook): void;
  findMatch(message: unknown, testCaseId?: string): Hook | undefined;
  findAllMatches(message: unknown, testCaseId?: string): Hook[];
  remove(hookId: string): void;
  clear(testCaseId?: string): void;
}
```

## Hook vs Wait

The distinction between `onX` and `waitX` methods:

| Aspect | `onX` (hook mode) | `waitX` (wait mode) |
|--------|-------------------|---------------------|
| Blocking | No | Yes - blocks step execution |
| Timing | Works regardless of message timing | Throws error if message arrives before step starts |
| Pending | No `pending` Deferred | Has `pending` Deferred |
| Use case | Register handler, continue | Assert message arrives in order |

### Strict Ordering

`waitX` steps enforce strict ordering. If a message arrives before the `waitX` step starts executing, a strict ordering violation error is thrown. Use `onX` if ordering doesn't matter.

```typescript
// Strict - throws if response arrives before this step
api.waitResponse('getUsers').assert((res) => res.code === 200);

// Non-strict - works regardless of timing
api.onResponse('getUsers').assert((res) => res.code === 200);
```

## Handlers

Handlers are operations attached to hooks via the builder API:

| Handler | Type | Description |
|---------|------|-------------|
| `assert` | Validation | Run a predicate on the payload; fail test if false |
| `transform` | Transformation | Transform the payload before passing to next handler |
| `delay` | Timing | Delay handler execution by N milliseconds |
| `drop` | Suppression | Drop the message entirely |
| `mockResponse` | Mocking | Return a mock response (sync server) |
| `mockEvent` | Mocking | Send an event to the connection (async server) |
| `proxy` | Forwarding | Forward message to backend (proxy mode) |

## Test Isolation

Hooks are scoped by `testCaseId` to support parallel test execution. When a test case completes, only its hooks are cleared, leaving other test cases' hooks intact.

```typescript
// Hooks are automatically scoped by TestCase
const tc = testCase('test', (test) => {
  // All hooks registered here are scoped to this test case's ID
  const api = test.use(client);
  api.onResponse('getUsers').assert((res) => res.code === 200);
});
```

## Files

| File | Purpose |
|------|---------|
| `hook.types.ts` | Hook interface and related types |
| `hook-registry.ts` | HookRegistry implementation |
| `step.types.ts` | Step interface, StepMode, Handler types |
| `step-builder.ts` | BaseStepBuilder with hook registration |
