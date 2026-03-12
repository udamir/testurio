# Sync Client Request Chain API

**Status:** Not Started (Partially Designed)
**Priority:** Low

## Overview

Add the ability to chain `onResponse()` directly to `request()` calls on sync clients, providing a more concise API when there are no steps between request and response handling.

## Problem

Currently, handling a response requires two separate steps with repeated message types:

```typescript
api.request('getUsers', { method: 'GET', path: '/users' });
api.onResponse('getUsers').assert((res) => res.body.length > 0);
```

## Proposed Solution

Allow `onResponse()` to be chained directly to `request()`:

```typescript
api.request('getUsers', { method: 'GET', path: '/users' })
   .onResponse()
   .assert((res) => res.body.length > 0);
```

## API Change

```typescript
// Current: request() returns void
request<K>(messageType: K, data: ExtractRequestData<P, K>): void;

// Proposed: request() returns SyncClientRequestBuilder
request<K>(messageType: K, data: ExtractRequestData<P, K>): SyncClientRequestBuilder<P, K>;

// New builder class
class SyncClientRequestBuilder<P, K> {
  onResponse(timeout?: number): SyncClientHookBuilder<ExtractClientResponse<P, K>>;
}
```

## Usage Examples

```typescript
// Simple assertion
api.request('getUsers', { method: 'GET', path: '/users' })
   .onResponse()
   .assert((res) => res.status === 200);

// Multiple assertions
api.request('getUsers', { method: 'GET', path: '/users' })
   .onResponse()
   .assert('status is 200', (res) => res.status === 200)
   .assert('has users', (res) => res.body.length > 0);

// Transform and assert
api.request('getUsers', { method: 'GET', path: '/users' })
   .onResponse()
   .transform((res) => res.body)
   .assert((users) => users.length > 0);

// Backwards compatible - still works without chaining
api.request('getUsers', { method: 'GET', path: '/users' });
api.onResponse('getUsers').assert((res) => res.body.length > 0);
```

## Key Properties

- **Separate steps in report** - `request()` and `onResponse()` remain separate steps
- **Reuses existing infrastructure** - `onResponse()` returns the existing `SyncClientHookBuilder`
- **No new handler types** - Uses existing assert, transform, etc.
- **Full type safety** - Response type inferred from `messageType`
- **Backwards compatible** - Ignoring the return value works fine

## Files to Modify

| File                          | Changes                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `sync-client.step-builder.ts` | Update `request()` return type, add `SyncClientRequestBuilder` |
| `sync-client/index.ts`        | Export new builder class                                       |
| New unit tests                | `sync-client-request-builder.test.ts`                          |
| New integration tests         | `sync-client-request-chain.integration.test.ts`                |
