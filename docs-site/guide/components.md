# Components

Components are the primary building blocks of Testurio tests. Each component represents a participant in a distributed system — a client sending requests, a server handling them, a message broker, or a database.

## The Three Roles

The `Server` and `AsyncServer` components serve **two distinct roles** depending on their configuration:

- **Mock** — Only `listenAddress` is set. The server handles requests directly using hooks (`.mockResponse()`, `.mockEvent()`). No real backend is involved.
- **Proxy** — Both `listenAddress` and `targetAddress` are set. The server forwards traffic to the backend while allowing hooks to inspect (`.assert()`), transform (`.transform()`, `.proxy()`), mock selectively (`.mockResponse()`), or drop (`.drop()`) messages in flight.

Combined with `Client` / `AsyncClient` (which always sends requests to a target), these form the three roles at the heart of every Testurio test:

| Role | Component | Configuration |
|------|-----------|---------------|
| **Client** | `Client`, `AsyncClient` | `targetAddress` only |
| **Mock** | `Server`, `AsyncServer` | `listenAddress` only |
| **Proxy** | `Server`, `AsyncServer` | `listenAddress` + `targetAddress` |

This model works identically across all protocols — HTTP, gRPC, WebSocket, and TCP.

## Component Overview

| Component | Protocol Type | Role |
|-----------|---------------|------|
| `Client` | Sync (HTTP, gRPC Unary) | Sends requests to a target server |
| `Server` | Sync | Mock server or proxy |
| `AsyncClient` | Async (WebSocket, TCP, gRPC Stream) | Sends messages over persistent connections |
| `AsyncServer` | Async | Mock async server or proxy |
| `Publisher` | MQ Adapter | Publishes messages to topics |
| `Subscriber` | MQ Adapter | Subscribes to and asserts on messages |
| `DataSource` | Direct SDK | Executes operations on databases/caches |

## Client

Sends synchronous requests to a target server. Used with HTTP and gRPC Unary protocols.

```typescript
import { Client, HttpProtocol } from 'testurio';

const client = new Client('api', {
  protocol: new HttpProtocol<UserApi>(),
  targetAddress: { host: 'localhost', port: 3000 },
});
```

**Options:**
- `protocol` — A sync protocol instance (`HttpProtocol`, `GrpcUnaryProtocol`)
- `targetAddress` — Server address to send requests to (`{ host, port }`)

**Step builder methods:**

| Method | Mode | Description |
|--------|------|-------------|
| `request(operationId, data)` | action | Send a request |
| `onResponse(operationId)` | hook | Register a non-blocking response handler |
| `waitResponse(operationId)` | wait | Block until the response arrives |

```typescript
const tc = testCase('example', (test) => {
  const api = test.use(client);

  api.request('getUser', { method: 'GET', path: '/users/1' });
  api.onResponse('getUser').assert((res) => res.code === 200);
});
```

## Server

Acts as a mock server or proxy. When only `listenAddress` is provided, it's a mock. When both `listenAddress` and `targetAddress` are provided, it acts as a proxy.

```typescript
import { Server, HttpProtocol } from 'testurio';

// Mock server
const mock = new Server('backend', {
  protocol: new HttpProtocol<UserApi>(),
  listenAddress: { host: 'localhost', port: 3000 },
});

// Proxy server
const proxy = new Server('gateway', {
  protocol: new HttpProtocol<UserApi>(),
  listenAddress: { host: 'localhost', port: 3001 },
  targetAddress: { host: 'localhost', port: 3000 },
});
```

**Options:**
- `protocol` — A sync protocol instance
- `listenAddress` — Address to listen on
- `targetAddress` — _(optional)_ Backend address for proxy mode

**Step builder methods:**

| Method | Mode | Description |
|--------|------|-------------|
| `onRequest(operationId, matcher?)` | hook | Handle incoming request |
| `waitRequest(operationId, matcher?)` | wait | Block until request arrives |

```typescript
const tc = testCase('example', (test) => {
  const mock = test.use(server);

  mock.onRequest('getUser', { method: 'GET', path: '/users/1' })
    .mockResponse(() => ({
      code: 200,
      body: { id: 1, name: 'Alice' },
    }));
});
```

## AsyncClient

Sends messages over persistent connections. Used with WebSocket, TCP, and gRPC streaming protocols.

```typescript
import { AsyncClient } from 'testurio';
import { WebSocketProtocol } from '@testurio/protocol-ws';

const ws = new AsyncClient('ws-client', {
  protocol: new WebSocketProtocol<ChatService>(),
  targetAddress: { host: 'localhost', port: 8080 },
});
```

**Options:**
- `protocol` — An async protocol instance (`WebSocketProtocol`, `TcpProtocol`, `GrpcStreamProtocol`)
- `targetAddress` — Server address to connect to

**Step builder methods:**

| Method | Mode | Description |
|--------|------|-------------|
| `sendMessage(messageType, data)` | action | Send a message |
| `onEvent(messageType)` | hook | Register a non-blocking event handler |
| `waitEvent(messageType, options?)` | wait | Block until event arrives |
| `waitDisconnect()` | wait | Block until connection closes |

```typescript
const tc = testCase('ping pong', (test) => {
  const ws = test.use(wsClient);

  ws.sendMessage('ping', { seq: 1 });
  ws.waitEvent('pong').timeout(2000).assert((msg) => msg.seq === 1);
});
```

## AsyncServer

Acts as a mock async server or proxy for persistent connections.

```typescript
import { AsyncServer } from 'testurio';
import { WebSocketProtocol } from '@testurio/protocol-ws';

const wsMock = new AsyncServer('ws-server', {
  protocol: new WebSocketProtocol<ChatService>(),
  listenAddress: { host: 'localhost', port: 8080 },
});
```

**Options:**
- `protocol` — An async protocol instance
- `listenAddress` — Address to listen on
- `targetAddress` — _(optional)_ Backend for proxy mode

**Step builder methods:**

| Method | Mode | Description |
|--------|------|-------------|
| `onMessage(messageType)` | hook | Handle incoming message |
| `waitMessage(messageType)` | wait | Block until message arrives |
| `waitConnection()` | wait | Block until a client connects |
| `waitDisconnect()` | wait | Block until a client disconnects |

```typescript
const tc = testCase('echo', (test) => {
  const server = test.use(wsMock);

  server.onMessage('ping').mockEvent('pong', (msg) => ({
    seq: msg.seq,
    timestamp: Date.now(),
  }));
});
```

## Publisher

Fire-and-forget message publishing to message queues (Kafka, RabbitMQ, Redis Pub/Sub).

```typescript
import { Publisher } from 'testurio';
import { KafkaAdapter } from '@testurio/adapter-kafka';

const pub = new Publisher<OrderTopics>('order-pub', {
  adapter: new KafkaAdapter({ brokers: ['localhost:9092'] }),
});
```

**Options:**
- `adapter` — MQ adapter instance
- `schema` — _(optional)_ Topic-based Zod schemas for validation

**Step builder methods:**

| Method | Mode | Description |
|--------|------|-------------|
| `publish(topic, data, options?)` | action | Publish a message to a topic |
| `publishBatch(topic, messages)` | action | Publish multiple messages |

```typescript
const tc = testCase('publish order', (test) => {
  const pub = test.use(publisher);

  pub.publish('order-created', {
    orderId: 'ORD-123',
    total: 99.99,
  });
});
```

## Subscriber

Subscribes to messages from message queues and provides assertion/wait capabilities.

```typescript
import { Subscriber } from 'testurio';
import { KafkaAdapter } from '@testurio/adapter-kafka';

const sub = new Subscriber<OrderTopics>('order-sub', {
  adapter: new KafkaAdapter({ brokers: ['localhost:9092'], groupId: 'test' }),
});
```

**Options:**
- `adapter` — MQ adapter instance
- `schema` — _(optional)_ Topic-based Zod schemas for validation

**Step builder methods:**

| Method | Mode | Description |
|--------|------|-------------|
| `onMessage(topic)` | hook | Register a non-blocking message handler |
| `waitMessage(topic, options?)` | wait | Block until a message arrives |

```typescript
const tc = testCase('receive order', (test) => {
  const sub = test.use(subscriber);

  sub.waitMessage('order-created')
    .assert('orderId should match', (msg) => msg.value.orderId === 'ORD-123');
});
```

## DataSource

Provides direct SDK access to databases and caches (Redis, PostgreSQL, MongoDB). No protocol abstraction — you work directly with the native client.

```typescript
import { DataSource } from 'testurio';
import { RedisAdapter } from '@testurio/adapter-redis';

const redis = new DataSource('cache', {
  adapter: new RedisAdapter({ host: 'localhost', port: 6379 }),
});
```

**Options:**
- `adapter` — DataSource adapter instance

**Step builder methods:**

| Method | Mode | Description |
|--------|------|-------------|
| `exec(description, fn)` | action | Execute operations on the data store |

```typescript
const tc = testCase('cache test', (test) => {
  const cache = test.use(redis);

  // Setup
  cache.exec('seed data', async (client) => {
    await client.set('user:1', JSON.stringify({ name: 'Alice' }));
  });

  // Assert
  cache.exec('verify', async (client) => client.get('user:1'))
    .assert('should be cached', (data) => data !== null);
});
```

## Component Ordering

In the `components` array, order matters:

1. **Non-network components** (DataSource, Publisher, Subscriber) — started first
2. **Servers** — started sequentially in array order
3. **Clients** — started in parallel after all servers are ready

```typescript
const scenario = new TestScenario({
  name: 'Full Stack Test',
  components: [
    redis,        // 1st: DataSource
    subscriber,   // 2nd: Subscriber
    mockServer,   // 3rd: Server
    proxy,        // 4th: Server (after mockServer)
    client,       // 5th: Client (parallel)
  ],
});
```

Shutdown happens in reverse order: clients first, then servers, then non-network components.
