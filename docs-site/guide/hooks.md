# Hooks & Mocking

Hooks are Testurio's mechanism for intercepting, asserting on, transforming, and mocking messages flowing through components.

## How Hooks Work

1. Inside `testCase()`, you call builder methods like `onRequest()`, `onResponse()`, or `onMessage()` to declare hooks
2. During **Phase 1**, all hooks are registered on their components before any step executes
3. When a matching message arrives at a component, the hook's handlers execute
4. During **Phase 3**, all hooks are cleared

This ensures mock handlers are always in place before requests are sent.

## Hook vs Wait

Testurio provides two patterns for handling messages:

| Pattern | Methods | Blocking | Use Case |
|---------|---------|----------|----------|
| `onX` | `onRequest`, `onResponse`, `onMessage`, `onEvent` | No | Register handler, continue execution |
| `waitX` | `waitRequest`, `waitResponse`, `waitMessage`, `waitEvent` | Yes | Block until message arrives or times out |

```typescript
// Non-blocking: hook fires whenever the response arrives
api.onResponse('getUser').assert((res) => res.code === 200);

// Blocking: execution pauses until the response arrives
api.waitResponse('getUser').assert((res) => res.code === 200);
```

::: warning Strict ordering
`waitX` steps enforce strict ordering. If a message arrives before the `waitX` step starts executing, a strict ordering violation error is thrown. Use `onX` if message timing isn't guaranteed.
:::

## Handler Methods

Hook builders provide a fluent API for chaining handlers:

### `.assert(fn)` / `.assert(description, fn)`

Validate the payload. If the predicate returns `false`, the test fails.

```typescript
api.onResponse('getUser')
  .assert((res) => res.code === 200)
  .assert('body should have name', (res) => res.body.name !== undefined);
```

### `.mockResponse(fn)` / `.mockResponse(description, fn)`

Return a mock response instead of forwarding to a real server. **Sync server only.**

```typescript
mock.onRequest('getUser').mockResponse(() => ({
  code: 200,
  body: { id: 1, name: 'Alice' },
}));

// With access to request data
mock.onRequest('createUser').mockResponse((req) => ({
  code: 201,
  body: { id: 2, name: req.body.name },
}));
```

### `.mockEvent(eventType, fn)` / `.mockEvent(description, eventType, fn)`

Send an event back to the client in response to a message. **Async server only.**

```typescript
wsMock.onMessage('ping').mockEvent('pong', (msg) => ({
  seq: msg.seq,
  timestamp: Date.now(),
}));
```

### `.transform(fn)`

Transform the payload before it continues through the pipeline. Useful in proxy mode to modify messages in flight.

```typescript
proxy.onMessage('Request').transform((msg) => ({
  ...msg,
  data: `[ENRICHED] ${msg.data}`,
}));
```

### `.delay(ms)` / `.delay(description, ms)`

Add a delay before processing the message. Useful for testing timeout behavior.

```typescript
mock.onRequest('getUser')
  .delay(500)  // 500ms delay
  .mockResponse(() => ({ code: 200, body: {} }));
```

### `.drop()`

Drop the message entirely — don't process or forward it.

```typescript
proxy.onRequest('deleteUser').drop();
```

### `.proxy(fn?)` / `.proxy(description, fn?)`

Forward the message to the backend server. Used in proxy mode. Optionally transform the message before forwarding.

```typescript
// Forward unchanged
proxy.onRequest('getUser').proxy();

// Forward with header injection
proxy.onRequest('getUser').proxy((req) => ({
  ...req,
  headers: { ...req.headers, 'X-Trace-Id': '123' },
}));
```

### `.validate()` / `.validate(schema)`

Validate the payload against the protocol-registered schema or an explicit schema.

```typescript
// Validate using the protocol's registered schema
api.onResponse('getUser').validate();

// Validate with a custom schema
const UserSchema = z.object({ id: z.number(), name: z.string() });
api.onResponse('getUser').validate(UserSchema);
```

### `.timeout(ms)`

Set a timeout for wait steps. If the message doesn't arrive within the timeout, the step fails.

```typescript
api.waitResponse('getUser')
  .timeout(5000)
  .assert((res) => res.code === 200);
```

## Chaining Handlers

Handlers can be chained together and execute in order:

```typescript
mock.onRequest('createUser')
  .assert('body should be valid', (req) => req.body.name !== undefined)
  .delay(100)
  .mockResponse((req) => ({
    code: 201,
    body: { id: 1, name: req.body.name },
  }));
```

## Sync Protocol Hooks

For `Client` and `Server` (HTTP, gRPC Unary):

```typescript
// Server hooks
mock.onRequest('operationId', matcher?)
  .assert(fn)
  .mockResponse(fn)
  .delay(ms)
  .proxy(fn?)
  .drop();

// Client hooks
api.onResponse('operationId')
  .assert(fn)
  .validate();
```

## Async Protocol Hooks

For `AsyncClient` and `AsyncServer` (WebSocket, TCP, gRPC Stream):

```typescript
// Server hooks
wsMock.onMessage('messageType')
  .assert(fn)
  .mockEvent('responseType', fn)
  .transform(fn)
  .delay(ms)
  .proxy(fn?)
  .drop();

// Client hooks
wsClient.onEvent('eventType')
  .assert(fn)
  .validate();
```

## MQ Hooks

For `Subscriber`:

```typescript
sub.onMessage('topic')
  .assert(fn)
  .transform(fn)
  .drop();

sub.waitMessage('topic')
  .assert(fn)
  .timeout(5000);
```
