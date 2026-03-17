# Core Concepts

This page covers the fundamental concepts you need to understand to use Testurio effectively.

## The Three Roles

Every Testurio test is built around three primary roles:

| Role | What it does | Component |
|------|-------------|-----------|
| **Client** | Sends requests/messages and asserts on responses | `Client`, `AsyncClient` |
| **Mock** | Intercepts requests, validates payloads, returns controlled responses | `Server` (listenAddress only), `AsyncServer` |
| **Proxy** | Forwards traffic to a backend while allowing inspection, transformation, and selective mocking | `Server` (listenAddress + targetAddress), `AsyncServer` |

```typescript
// Client — sends requests
const api = new Client('api', {
  protocol: new HttpProtocol(),
  targetAddress: { host: 'localhost', port: 3000 },
});

// Mock — returns controlled responses
const mock = new Server('mock', {
  protocol: new HttpProtocol(),
  listenAddress: { host: 'localhost', port: 3000 },
});

// Proxy — forwards to backend with interception
const proxy = new Server('proxy', {
  protocol: new HttpProtocol(),
  listenAddress: { host: 'localhost', port: 3001 },
  targetAddress: { host: 'localhost', port: 3000 }, // ← makes it a proxy
});
```

These three roles work the same way across all protocols (HTTP, gRPC, WebSocket, TCP). Additional components — `Publisher`, `Subscriber`, and `DataSource` — supplement the model for message queues and databases.

## Components

Components represent participants in your distributed system. Each component wraps a protocol adapter and manages its lifecycle (start/stop).

| Component | Protocol Type | Role |
|-----------|---------------|------|
| `Client` | Sync (HTTP, gRPC Unary) | Sends requests to a target server |
| `Server` | Sync | Mock server or proxy (depends on config) |
| `AsyncClient` | Async (WebSocket, TCP, gRPC Stream) | Sends messages over persistent connections |
| `AsyncServer` | Async | Mock async server or proxy (depends on config) |
| `Publisher` | MQ Adapter | Publishes messages to topics |
| `Subscriber` | MQ Adapter | Subscribes to and asserts on messages |
| `DataSource` | Direct SDK | Executes operations on databases/caches |

Components are created once and reused across test cases within a scenario.

## Protocols

Protocols are **stateless adapter factories**. They know how to create server and client adapters but hold no state themselves. The component owns the adapter.

```typescript
// The protocol creates adapters; the Client component owns them
const client = new Client('api', {
  protocol: new HttpProtocol<UserApi>(),
  targetAddress: { host: 'localhost', port: 3000 },
});
```

| Protocol | Type | Package |
|----------|------|---------|
| `HttpProtocol` | Sync | `testurio` (built-in) |
| `GrpcUnaryProtocol` | Sync | `@testurio/protocol-grpc` |
| `GrpcStreamProtocol` | Async | `@testurio/protocol-grpc` |
| `WebSocketProtocol` | Async | `@testurio/protocol-ws` |
| `TcpProtocol` | Async | `@testurio/protocol-tcp` |

## Test Scenario

A `TestScenario` groups components and manages their lifecycle. It starts servers before clients, and stops them in reverse order.

```typescript
const scenario = new TestScenario({
  name: 'My Test Suite',
  components: [server, client],  // servers first, then clients
});
```

Component startup order:
1. Non-network components (DataSource, Publisher, Subscriber)
2. Servers (sequentially, in array order)
3. Clients (in parallel)

## Test Case

A `testCase()` declares the steps of a single test. Inside the callback, you use `test.use(component)` to get a typed step builder for each component:

```typescript
const tc = testCase('my test', (test) => {
  const api = test.use(client);     // SyncClientStepBuilder
  const mock = test.use(server);    // SyncServerStepBuilder

  api.request('getUsers', { method: 'GET', path: '/users' });
  mock.onRequest('getUsers').mockResponse(() => ({ code: 200, body: [] }));
  api.onResponse('getUsers').assert((res) => res.code === 200);
});
```

::: warning Declarative only
Inside `testCase()`, only use builder methods. No imperative code — no `await`, no `if/else`, no loops. Steps are collected during the builder phase and executed later.
:::

## Step Modes

Every step has a **mode** that controls when and how it executes:

| Mode | Behavior | Examples |
|------|----------|---------|
| `action` | Executes immediately (sends a request, publishes a message) | `request()`, `connect()`, `sendMessage()`, `disconnect()`, `publish()`, `exec()` |
| `hook` | Registers a handler that fires when a matching message arrives. Does not block. | `onRequest()`, `onResponse()`, `onMessage()` |
| `wait` | Blocks execution until a matching message arrives or times out. | `waitResponse()`, `waitMessage()`, `waitConnection()` |

## Three-Phase Execution

When you call `scenario.run(tc)`, the test case executes in three phases:

1. **Phase 1 — Register hooks**: All hooks from all steps are registered on their components _before_ any step executes. This ensures mock handlers are in place before requests are sent.

2. **Phase 2 — Execute steps**: Steps run sequentially in declaration order. Action steps fire immediately. Hook steps are no-ops (already registered). Wait steps block until their hook resolves.

3. **Phase 3 — Cleanup**: All hooks are cleared from components.

This model means you can write steps in logical message flow order without worrying about timing.

## Hooks

Hooks are the mechanism for intercepting and responding to messages. You build them using the fluent API:

```typescript
// Server hook: intercept request and return a mock response
mock.onRequest('getUser').mockResponse(() => ({ code: 200, body: { id: 1 } }));

// Client hook: assert on the response
api.onResponse('getUser').assert((res) => res.body.id === 1);

// Async server hook: respond to a message with an event
wsMock.onMessage('ping').mockEvent('pong', (msg) => ({ seq: msg.seq }));
```

Available hook handlers:

| Handler | Description |
|---------|-------------|
| `.assert(fn)` | Validate the payload; fail the test if false |
| `.assert(description, fn)` | Assert with a named description for error messages |
| `.mockResponse(fn)` | Return a mock response (sync server only) |
| `.mockEvent(type, fn)` | Send an event back (async server only) |
| `.transform(fn)` | Transform the payload before forwarding |
| `.delay(ms)` | Add a delay before processing |
| `.drop()` | Drop the message entirely |
| `.proxy(fn)` | Forward to backend with optional transformation (proxy mode) |
| `.validate()` | Validate payload against the registered schema |

## Typing Modes

Testurio supports three ways to type your protocols:

### Loose Mode
No type parameter — any string accepted as operation ID:
```typescript
new HttpProtocol()
```

### Explicit Generic Mode
Provide a TypeScript interface — only defined operations accepted:
```typescript
new HttpProtocol<UserApi>()
```

### Schema-First Mode
Provide Zod schemas — types inferred automatically with runtime validation:
```typescript
new HttpProtocol({ schema: userApiSchema })
```

## Proxy Mode

When a `Server` or `AsyncServer` has both `listenAddress` and `targetAddress`, it acts as a proxy:

```typescript
const proxy = new Server('gateway', {
  protocol: new HttpProtocol(),
  listenAddress: { host: 'localhost', port: 3001 },
  targetAddress: { host: 'localhost', port: 3000 },  // forwards to backend
});
```

In proxy mode, hooks intercept messages flowing through the proxy, allowing you to inspect, transform, mock, or drop traffic.

## Next Steps

- [Components Guide](/guide/components) — Deep dive into each component type
- [Protocols Guide](/guide/protocols) — Protocol configuration and options
- [Hooks & Mocking](/guide/hooks) — Full hook API and patterns
