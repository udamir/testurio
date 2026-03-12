# Unified Service Component Pending Pattern

**Status:** Not Started
**Priority:** Medium

## Overview

Eliminate the dual pending/deferred pattern in `ServiceComponent` by using Hook's built-in `pending` field for all wait operations. Currently there are two parallel implementations of the deferred pattern that should be consolidated.

## Problem

After implementing the unified Hook pattern with `pending` for the Subscriber component, there are two parallel implementations:

### 1. BaseComponent (used by Subscriber)

```typescript
interface Hook<TMessage> {
  pending?: Deferred<TMessage>;
  resolved?: boolean;
}

// BaseComponent helper methods
protected resolveHook<T>(hook: Hook<T>, value: T): void
protected rejectHook<T>(hook: Hook<T>, error: Error): void
protected awaitHook<T>(hook: Hook<T>, timeout: number): Promise<T>
```

### 2. ServiceComponent (used by Client, Server, AsyncClient, AsyncServer)

```typescript
interface PendingRequest extends Deferred<unknown> {
  isWaiting: boolean;
}

protected _pendingRequests: Map<string, PendingRequest> = new Map();
protected createPending(stepId: string, isWaiting: boolean): PendingRequest
protected getPending(stepId: string): PendingRequest | undefined
```

This duplication leads to inconsistent patterns and extra state management.

## Solution

### Key Insight

With the three-phase execution model, `pending` is created in Phase 1 (hook registration), so it always exists before any response/message arrives. The old `isWaiting` flag is unnecessary because `hook.resolved` can be used for strict ordering validation.

### Strict Ordering via `waitX` vs `onX`

| Step Type | Strict | Behavior |
|-----------|--------|----------|
| `onResponse` / `onRequest` / `onEvent` | No | Handler works regardless of timing |
| `waitResponse` / `waitRequest` / `waitEvent` | Yes | Error if message arrives before step starts |

When a `waitX` step starts, if `hook.resolved` is already `true`, the message arrived first - this is a strict ordering violation.

## Changes Required

### ServiceComponent

Remove:
- `PendingRequest` interface
- `_pendingRequests` Map
- `createPending()`, `getPending()`, `setWaiting()`, `cleanupPending()`, `clearPendingRequests()`

### SyncClient

- Override `registerHook()` to set `withPending` for `onResponse`/`waitResponse`
- Update `executeRequest()` to resolve matching hooks instead of pending requests
- Update `executeResponseStep()` to use `findHookByStepId()` and `awaitHook()`

### SyncServer

- Override `registerHook()` to set `withPending` for `waitRequest`
- Update `handleIncomingRequest()` to resolve hook instead of pending
- Update `executeWaitRequest()` to use hook pattern

### AsyncClient

- Override `registerHook()` to set `withPending` for `waitEvent`/`waitDisconnect`
- Update `handleIncomingEvent()` to resolve hook
- Update `executeWaitEvent()` and `executeWaitDisconnect()` to use hook pattern

### AsyncServer

- Override `registerHook()` to set `withPending` for `waitMessage`/`waitConnection`/`waitDisconnect`
- Update all wait step handlers to use hook pattern

## Benefits

- **No breaking changes** - Public API remains identical
- **Same behavior** - Strict ordering violations still throw errors
- **Internal simplification** - Removes duplicate deferred management
- **Consistent pattern** - All components use the same hook-based approach

## Migration Notes

1. No breaking changes to public API
2. Same behavior for all `waitX` and `onX` methods
3. All changes are in protected/private methods
4. Uses existing `hook.resolved` flag instead of separate `isWaiting` tracking
