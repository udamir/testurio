# Builder Layer

**Location:** `packages/core/src/components/*/builders/` and `*step-builder.ts`

The builder layer provides a fluent API that users interact with inside `testCase()`. Builders translate the declarative DSL into `Step` objects consumed by the execution layer. Builders contain no execution logic.

## Base Step Builder

All step builders extend `BaseStepBuilder`, which provides step registration.

```typescript
abstract class BaseStepBuilder {
  protected phase: string;
  protected testCaseId?: string;
  protected component: Component;

  protected registerStep<T>(stepData: StepData, HookBuilderClass?): T | undefined;
}
```

The `registerStep` method creates a `Step` and adds it to the component's step list. If a `HookBuilderClass` is provided, a hook builder is returned for chaining handler methods.

## Component-Specific Builders

Each component type has its own step builder with methods matching its semantics.

### SyncClientStepBuilder

For `Client` components (HTTP, gRPC Unary):

```typescript
api.request('getUsers', { method: 'GET', path: '/users' });
api.onResponse('getUsers').assert((res) => res.code === 200);
api.waitResponse('getUsers').assert((res) => res.body.length > 0);
```

| Method                       | Mode   | Description                            |
| ---------------------------- | ------ | -------------------------------------- |
| `request(messageType, data)` | action | Send a request                         |
| `onResponse(messageType)`    | hook   | Register non-blocking response handler |
| `waitResponse(messageType)`  | wait   | Block until response arrives           |

### SyncServerStepBuilder

For `Server` components (mock server or proxy):

```typescript
mock.onRequest('createUser').mockResponse(() => ({ code: 201, body: { id: '1' } }));
mock.onRequest('getUser').proxy();
mock.waitRequest('deleteUser').assert((req) => req.params.id === '123');
```

| Method                     | Mode | Description                             |
| -------------------------- | ---- | --------------------------------------- |
| `onRequest(messageType)`   | hook | Handle incoming request (mock or proxy) |
| `waitRequest(messageType)` | wait | Block until request arrives             |

### AsyncClientStepBuilder

For `AsyncClient` components (WebSocket, TCP, gRPC Stream):

```typescript
ws.sendMessage('ping', { type: 'ping', seq: 1 });
ws.onMessage('pong').assert((msg) => msg.seq === 1);
ws.waitMessage('pong').assert((msg) => msg.payload !== undefined);
```

| Method                           | Mode   | Description                           |
| -------------------------------- | ------ | ------------------------------------- |
| `sendMessage(messageType, data)` | action | Send a message                        |
| `onMessage(messageType)`         | hook   | Register non-blocking message handler |
| `waitMessage(messageType)`       | wait   | Block until message arrives           |
| `waitDisconnect()`               | wait   | Block until connection closes         |

### AsyncServerStepBuilder

For `AsyncServer` components (mock async server or proxy):

```typescript
wsMock.onMessage('subscribe').mockEvent(() => ({ type: 'subscribed' }));
wsMock.waitMessage('ping').assert((msg) => msg !== undefined);
wsMock.waitConnection().assert((ctx) => ctx.headers !== undefined);
```

| Method                     | Mode | Description                    |
| -------------------------- | ---- | ------------------------------ |
| `onMessage(messageType)`   | hook | Handle incoming message        |
| `waitMessage(messageType)` | wait | Block until message arrives    |
| `waitConnection()`         | wait | Block until client connects    |
| `waitDisconnect()`         | wait | Block until client disconnects |

### DataSourceStepBuilder

For `DataSource` components:

```typescript
redis.exec('seed data', async (adapter) => {
  await adapter.set('key', 'value');
});
redis.exec('verify', async (adapter) => {
  const val = await adapter.get('key');
  expect(val).toBe('value');
});
```

| Method                  | Mode   | Description                                    |
| ----------------------- | ------ | ---------------------------------------------- |
| `exec(description, fn)` | action | Execute arbitrary operations on the data store |

### PublisherStepBuilder

For `Publisher` components:

```typescript
pub.publish('user.created', { topic: 'users', payload: { id: '1' } });
```

| Method                       | Mode   | Description                  |
| ---------------------------- | ------ | ---------------------------- |
| `publish(messageType, data)` | action | Publish a message to a topic |

### SubscriberStepBuilder

For `Subscriber` components:

```typescript
sub.onMessage('user.created').assert((msg) => msg.id === '1');
sub.waitMessage('user.created').assert((msg) => msg !== undefined);
```

| Method                     | Mode | Description                           |
| -------------------------- | ---- | ------------------------------------- |
| `onMessage(messageType)`   | hook | Register non-blocking message handler |
| `waitMessage(messageType)` | wait | Block until message arrives           |

## Hook Builders

When a step builder method returns a hook builder, users can chain handler methods:

| Handler                    | Description                                   |
| -------------------------- | --------------------------------------------- |
| `.assert(fn)`              | Validate payload with a predicate             |
| `.assert(description, fn)` | Validate with a named assertion               |
| `.transform(fn)`           | Transform the payload                         |
| `.delay(ms)`               | Delay execution                               |
| `.drop()`                  | Drop the message                              |
| `.mockResponse(fn)`        | Mock a response (server only)                 |
| `.mockEvent(fn)`           | Send an event to the connection (server only) |
| `.proxy()`                 | Forward to backend (proxy mode)               |

## Step Modes

Every step has a mode that determines execution behavior:

| Mode     | Registration               | Execution            | Examples                                              |
| -------- | -------------------------- | -------------------- | ----------------------------------------------------- |
| `action` | No hook                    | Execute immediately  | `request()`, `sendMessage()`, `publish()`, `exec()`   |
| `hook`   | Register hook              | Don't block          | `onResponse()`, `onRequest()`, `onMessage()`          |
| `wait`   | Register hook with pending | Block until resolved | `waitResponse()`, `waitMessage()`, `waitConnection()` |
