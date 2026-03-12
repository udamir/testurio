# Component Layer

**Location:** `packages/core/src/components/`

Components are the primary building blocks of Testurio tests. Each component represents a participant in a distributed system (client, server, data store, message broker).

## Component Hierarchy

```
BaseComponent
├── ServiceComponent (protocol-based)
│   ├── Client (SyncClient)
│   ├── Server (SyncServer)
│   ├── AsyncClient
│   └── AsyncServer
├── DataSource
├── Publisher
└── Subscriber
```

### BaseComponent

Abstract base class for all components. Provides:
- Step registration
- Hook management (register, match, resolve, cleanup)
- Three-phase execution model helpers

### ServiceComponent

Extends `BaseComponent` for protocol-based components. Provides:
- Protocol ownership and adapter lifecycle
- Message type matching via protocol
- `createHookMatcher()` for finding matching hooks

## Component Types

### Client (SyncClient)

**Location:** `packages/core/src/components/sync-client/`

Sends synchronous requests to a target server. Used with HTTP and gRPC Unary protocols.

```typescript
const client = new Client('api', {
  protocol: new HttpProtocol<MyService>(),
  targetAddress: { host: 'localhost', port: 3000 },
});
```

**Configuration:**
- `protocol` - Sync protocol instance
- `targetAddress` - Server address to send requests to

**Step builder methods:** `request()`, `onResponse()`, `waitResponse()`

### Server (SyncServer)

**Location:** `packages/core/src/components/sync-server/`

Acts as a mock server or proxy. When both `listenAddress` and `targetAddress` are provided, acts as a proxy with hook interception.

```typescript
// Mock server
const mock = new Server('mock', {
  protocol: new HttpProtocol<MyService>(),
  listenAddress: { host: 'localhost', port: 3000 },
});

// Proxy server
const proxy = new Server('proxy', {
  protocol: new HttpProtocol<MyService>(),
  listenAddress: { host: 'localhost', port: 3000 },
  targetAddress: { host: 'localhost', port: 4000 },
});
```

**Configuration:**
- `protocol` - Sync protocol instance
- `listenAddress` - Address to listen on
- `targetAddress` (optional) - Backend to forward requests to (proxy mode)

**Step builder methods:** `onRequest()`, `waitRequest()`

### AsyncClient

**Location:** `packages/core/src/components/async-client/`

Sends messages over persistent connections. Used with WebSocket, TCP, and gRPC streaming protocols.

```typescript
const ws = new AsyncClient('ws', {
  protocol: new WebSocketProtocol<MyMessages>(),
  targetAddress: { host: 'localhost', port: 8080, path: '/ws' },
});
```

**Configuration:**
- `protocol` - Async protocol instance
- `targetAddress` - Server address to connect to

**Step builder methods:** `sendMessage()`, `onMessage()`, `waitMessage()`, `waitDisconnect()`

### AsyncServer

**Location:** `packages/core/src/components/async-server/`

Acts as a mock async server or proxy. Handles persistent connections.

```typescript
const wsMock = new AsyncServer('ws-mock', {
  protocol: new WebSocketProtocol<MyMessages>(),
  listenAddress: { host: 'localhost', port: 8080 },
});
```

**Configuration:**
- `protocol` - Async protocol instance
- `listenAddress` - Address to listen on
- `targetAddress` (optional) - Backend for proxy mode

**Step builder methods:** `onMessage()`, `waitMessage()`, `waitConnection()`, `waitDisconnect()`

### DataSource

**Location:** `packages/core/src/components/datasource/`

Provides direct SDK access to data stores. No protocol abstraction - uses adapters directly.

```typescript
const redis = new DataSource('redis', {
  adapter: new RedisAdapter({ url: 'redis://localhost:6379' }),
});
```

**Configuration:**
- `adapter` - DataSource adapter instance (Redis, PostgreSQL, MongoDB)

**Step builder methods:** `exec(description, fn)`

### Publisher

**Location:** `packages/core/src/components/publisher/`

Fire-and-forget message publishing to message queues.

```typescript
const pub = new Publisher('events', {
  adapter: new KafkaAdapter({ brokers: ['localhost:9092'] }),
  codec: new JsonCodec(),
});
```

**Configuration:**
- `adapter` - MQ adapter instance (Kafka, RabbitMQ, Redis)
- `codec` - Message serialization codec

**Step builder methods:** `publish(messageType, data)`

### Subscriber

**Location:** `packages/core/src/components/subscriber/`

Subscribes to messages from message queues and provides assertion/wait capabilities.

```typescript
const sub = new Subscriber('listener', {
  adapter: new KafkaAdapter({ brokers: ['localhost:9092'] }),
  codec: new JsonCodec(),
  topics: ['users'],
});
```

**Configuration:**
- `adapter` - MQ adapter instance
- `codec` - Message deserialization codec
- `topics` - Topics to subscribe to

**Step builder methods:** `onMessage()`, `waitMessage()`

## Proxy Mode

When `Server` or `AsyncServer` has both `listenAddress` and `targetAddress`, it operates as a proxy:

```
Client → Proxy (hooks intercept here) → Backend Server
```

Hooks can:
- Inspect and assert on proxied messages
- Transform messages before forwarding
- Mock responses without forwarding
- Drop messages
- Add delays

```typescript
const proxy = new Server('proxy', {
  protocol: new HttpProtocol(),
  listenAddress: { host: 'localhost', port: 3000 },
  targetAddress: { host: 'localhost', port: 4000 },
});

// In test case:
proxy.onRequest('getUsers').proxy();  // Forward to backend
proxy.onRequest('deleteUser').mockResponse(() => ({ code: 403 }));  // Block
```
