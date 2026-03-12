# Flexible Type System

Testurio provides a flexible type system that supports both loose (untyped) and strict (fully typed) usage patterns.

## Loose Mode

Use protocols without a type parameter. Any string is accepted as a message type, and payloads are untyped.

```typescript
// No type parameter - loose mode
const client = new Client('api', {
  protocol: new HttpProtocol(),
  targetAddress: { host: 'localhost', port: 3000 },
});

// Any string accepted as operation ID
api.request('anything', { method: 'GET', path: '/whatever' });
api.onResponse('anything').assert((res) => res.code === 200);
```

Loose mode is useful for:
- Quick prototyping
- Testing third-party APIs without defining types
- Simple tests where type safety isn't needed

## Strict Mode

Provide a type parameter to the protocol. Only defined operation IDs are accepted, and payloads are fully typed.

```typescript
// Define service operations
type UserService = {
  getUsers: {
    request: { method: 'GET'; path: '/users' };
    response: { code: 200; body: Array<{ id: string; name: string }> };
  };
  createUser: {
    request: { method: 'POST'; path: '/users'; body: { name: string } };
    response: { code: 201; body: { id: string; name: string } };
  };
};

// Type parameter enables strict mode
const client = new Client('api', {
  protocol: new HttpProtocol<UserService>(),
  targetAddress: { host: 'localhost', port: 3000 },
});

// Only 'getUsers' and 'createUser' are valid operation IDs
api.request('getUsers', { method: 'GET', path: '/users' });
// api.request('invalid', ...) // TypeScript error

// Response type is inferred
api.onResponse('getUsers').assert((res) => {
  // res.body is typed as Array<{ id: string; name: string }>
  return res.body.length > 0;
});
```

## Sync Protocol Types

For `Client` and `Server` (HTTP, gRPC Unary):

```typescript
type SyncOperations = {
  [operationId: string]: {
    request: { method: string; path: string; body?: unknown; query?: unknown };
    response: { code: number; body: unknown };
  };
};
```

## Async Protocol Types

For `AsyncClient` and `AsyncServer` (WebSocket, TCP, gRPC Stream):

```typescript
type AsyncMessages = {
  client: { [messageType: string]: unknown };  // Client-to-server messages
  server: { [messageType: string]: unknown };  // Server-to-client messages
};
```

## MQ Types

For `Publisher` and `Subscriber`:

```typescript
type MQMessages = {
  [messageType: string]: unknown;  // Message type to payload mapping
};
```

## Type Helpers

The core package provides type helpers for extracting types from protocol definitions:

| Helper                        | Purpose                                          |
| ----------------------------- | ------------------------------------------------ |
| `SyncOperationId<P>`          | Extract valid operation IDs from a sync protocol |
| `ExtractRequestData<P, K>`    | Extract request data type for an operation       |
| `ExtractClientResponse<P, K>` | Extract response type for an operation           |
| `AsyncClientMessageType<P>`   | Extract client message types from async protocol |
| `IsSyncLooseMode<P>`          | Check if protocol is in loose mode               |
| `IsAsyncLooseMode<P>`         | Check if protocol is in loose mode               |

## Type Inference via `test.use()`

The `test.use(component)` method returns a correctly-typed step builder:

```typescript
const tc = testCase('example', (test) => {
  const api = test.use(client);   // Returns SyncClientStepBuilder<UserService>
  const mock = test.use(server);  // Returns SyncServerStepBuilder<UserService>
  const ws = test.use(wsClient);  // Returns AsyncClientStepBuilder<ChatMessages>

  // Full type inference - no manual type annotations needed
  api.request('getUsers', { method: 'GET', path: '/users' });
});
```
