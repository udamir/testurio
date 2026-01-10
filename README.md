# Testurio

A declarative E2E/integration testing framework for distributed systems with multi-protocol support.

[![npm version](https://badge.fury.io/js/testurio.svg)](https://www.npmjs.com/package/testurio)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/udamir/testurio)


> **Warning**
> This project is currently a work in progress. The API is not stable and may change without notice. Use at your own risk in production environments.

## Features

- **Multi-Protocol Support** - HTTP, gRPC (Unary & Streaming), WebSocket, TCP
- **DataSource Integration** - Direct SDK access to Redis, PostgreSQL, MongoDB
- **Declarative API** - Write tests in execution order with clear, readable syntax
- **Component-Based** - Define clients, mocks, proxies, and data sources as reusable components
- **Type-Safe** - Full TypeScript support with automatic type inference
- **Flow Testing** - Test complete request flows through your distributed system
- **Flexible Mocking** - Mock responses, add delays, drop messages, or proxy through

## Installation

```bash
npm install testurio --save-dev
```

## Quick Start

1. Register components of test scenario
2. Write test-case steps
3. Run test scenario, generate report

```typescript
import { TestScenario, testCase, Client, Server, HttpProtocol } from 'testurio';

// Define components with protocol
const httpClient = new Client('client', {
  protocol: new HttpProtocol(),
  targetAddress: { host: 'localhost', port: 3000 },
});

const httpServer = new Server('mock', {
  protocol: new HttpProtocol(),
  listenAddress: { host: 'localhost', port: 3000 },
});

// Create scenario
const scenario = new TestScenario({ name: 'User API Test' });

// Write test cases
const tc = testCase('Get user by ID', (test) => {
  const client = test.use(httpClient);  // use "httpClient" in test case
  const mock = test.use(httpServer);    // use "httpServer" in test case

  // Step 1: Client sends request
  client.request('getUsers', { method: 'GET', path: '/users' });

  // Step 2: Mock handles request
  mock
    .onRequest('getUsers', { method: 'GET', path: '/users' })
    .mockResponse(() => ({
      code: 200,
      body: [{ id: 1, name: 'Alice', email: 'alice@example.com' }],
    }));

  // Step 3: Client receives and validates response
  client
    .onResponse('getUsers')
    .assert((res) => res.body[0].id === 1);
});

// Run the test
const result = await scenario.run(tc);
console.log(result.passed); // true
```

## Roadmap

- [ ] **testurio-cli** - Type definition generation from API specifications
  - [ ] OpenAPI/Swagger → HTTP service definitions
  - [ ] AsyncAPI → WebSocket/async service definitions
  - [ ] Protobuf → gRPC service definitions
- [ ] **Message Queue Support** - Integration with message brokers
  - [ ] RabbitMQ (AMQP protocol)
  - [ ] Kafka (producer/consumer testing)
  - [ ] Redis (pub/sub)
- [x] **DataSource Support** - Database/cache integrations
  - [x] Redis (`@testurio/adapter-redis`)
  - [x] PostgreSQL (`@testurio/adapter-pg`)
  - [x] MongoDB (`@testurio/adapter-mongo`)

## Examples

### gRPC Example

```typescript
import { TestScenario, testCase, Server, Client } from 'testurio';
import { GrpcUnaryProtocol } from '@testurio/protocol-grpc';

// Define gRPC components with proto schema
const grpcClient = new Client('api', {
  protocol: new GrpcUnaryProtocol({ schema: 'user.proto', serviceName: 'UserService' }),
  targetAddress: { host: 'localhost', port: 5000 },
});

const grpcServer = new Server('backend', {
  protocol: new GrpcUnaryProtocol({ schema: 'user.proto' }),
  listenAddress: { host: 'localhost', port: 5000 },
});

const scenario = new TestScenario({
  name: 'gRPC User Service Test',
  components: [grpcServer, grpcClient],
});

const tc = testCase('GetUser RPC', (test) => {
  const api = test.use(grpcClient);
  const backend = test.use(grpcServer);

  // Step 1: Send gRPC request
  api.request('GetUser', { user_id: 42 });

  // Step 2: Mock handles request
  backend.onRequest('GetUser').mockResponse((req) => ({
    code: 200,
    body: { user_id: req.user_id, name: 'John Doe' },
  }));

  // Step 3: Handle response
  api.onResponse('GetUser').assert((res) => res.body.name === 'John Doe');
});
```

### WebSocket/Async Example

```typescript
import { TestScenario, testCase, AsyncClient, AsyncServer } from 'testurio';
import { WebSocketProtocol } from '@testurio/protocol-ws';

// Define WebSocket service types
interface WsMessages {
  clientMessages: {
    ping: { seq: number };
  };
  serverMessages: {
    pong: { seq: number; timestamp: number };
  };
}

// Define WebSocket components with typed protocol
const wsClient = new AsyncClient('client', {
  protocol: new WebSocketProtocol<WsMessages>(),
  targetAddress: { host: 'localhost', port: 4000 },
});

const wsServer = new AsyncServer('server', {
  protocol: new WebSocketProtocol<WsMessages>(),
  listenAddress: { host: 'localhost', port: 4000 },
});

const scenario = new TestScenario({
  name: 'WebSocket Echo Test',
  components: [wsServer, wsClient],
});

const tc = testCase('Ping-Pong', (test) => {
  const client = test.use(wsClient);
  const server = test.use(wsServer);

  // Step 1: Client sends ping
  client.sendMessage('ping', { seq: 1 });

  // Step 2: Server responds with pong
  server.onMessage('ping').mockEvent('pong', (payload) => ({
    seq: payload.seq,
    timestamp: Date.now(),
  }));

  // Step 3: Client receives pong
  client.onEvent('pong').assert((payload) => payload.seq === 1);
});
```

### DataSource Example

```typescript
import { TestScenario, testCase, DataSource, Client, Server, HttpProtocol } from 'testurio';
import { RedisAdapter } from '@testurio/adapter-redis';
import type { Redis } from 'ioredis';

// Create Redis DataSource
const cache = new DataSource('cache', {
  adapter: new RedisAdapter({ host: 'localhost', port: 6379 }),
});

// Create HTTP components
const server = new Server('backend', {
  protocol: new HttpProtocol(),
  listenAddress: { host: 'localhost', port: 3000 },
});

const client = new Client('api', {
  protocol: new HttpProtocol(),
  targetAddress: { host: 'localhost', port: 3000 },
});

const scenario = new TestScenario({
  name: 'Cache Integration Test',
  components: [cache, server, client],
});

const tc = testCase('should use cached data', (test) => {
  const redis = test.use(cache);
  const api = test.use(client);
  const mock = test.use(server);

  // Step 1: Setup cache
  redis.exec('populate cache', async (client) => {
    await client.set('user:123', JSON.stringify({ id: 123, name: 'John' }));
  });

  // Step 2: API request
  api.request('getUser', { method: 'GET', path: '/users/123' });
  mock.onRequest('getUser').mockResponse(() => ({
    code: 200,
    body: { id: 123, name: 'John' },
  }));

  // Step 3: Verify cache
  redis.exec('verify cache', async (client) => client.get('user:123'))
    .assert('user should be cached', (data) => data !== null);
});
```

### Type-Safe HTTP Example

Define service types to get full type safety across your tests:

```typescript
import { TestScenario, testCase, Client, Server, HttpProtocol } from 'testurio';

// HTTP Service Definition
interface HttpServiceDef {
  getUsers: {
    request: { method: 'GET'; path: '/users'; body?: never };
    response: { code: 200; body: User[] };
  };
  createUser: {
    request: { method: 'POST'; path: '/users'; body: CreateUserPayload };
    response: { code: 201; body: User };
  };
}

// WebSocket/Async Service Definition
interface WsServiceDef {
  clientMessages: {
    getUser: { userId: number };
    subscribe: { channel: string };
  };
  serverMessages: {
    user: { userId: number; name: string; email: string };
    subscribed: { subscriptionId: string; status: string };
  };
}

// Define components with protocol - types are automatically inferred
const httpClient = new Client('api', {
  protocol: new HttpProtocol<HttpServiceDef>(),
  targetAddress: { host: 'localhost', port: 3000 },
});

const httpServer = new Server('backend', {
  protocol: new HttpProtocol<HttpServiceDef>(),
  listenAddress: { host: 'localhost', port: 3000 },
});

// Create scenario with components
const scenario = new TestScenario({
  name: 'User API Test',
  components: [httpServer, httpClient],
});

// Write test cases with full type safety via test.use()
const tc = testCase('Get user by ID', (test) => {
  const api = test.use(httpClient);      // Fully typed step builder!
  const backend = test.use(httpServer);  // Fully typed step builder!

  // Step 1: Client sends request
  api.request('getUsers', { method: 'GET', path: '/users' });

  // Step 2: Mock handles request
  backend.onRequest('getUsers', { method: 'GET', path: '/users' })
    .mockResponse(() => ({
      code: 200,
      body: [{ id: 1, name: 'Alice', email: 'alice@example.com' }],
    }));

  // Step 3: Client receives and validates response
  api.onResponse('getUsers').assert((res) => res.body[0].id === 1);
});

// Run the test
const result = await scenario.run(tc);
console.log(result.passed); // true
```

## Core Concepts

### Components

Components are high-level abstractions that own protocol adapters and manage their lifecycle.

| Component       | Protocol Type | Role   | Description                                                    |
| --------------- | ------------- | ------ | -------------------------------------------------------------- |
| `Client`        | Sync          | Client | Sends HTTP/gRPC unary requests to a target server              |
| `Server`        | Sync          | Mock   | Listens for requests and returns configured responses          |
| `Server`        | Sync          | Proxy  | Intercepts requests, can transform, mock, or forward to target |
| `AsyncClient`   | Async         | Client | Sends messages over WebSocket/TCP/gRPC streaming connections   |
| `AsyncServer`   | Async         | Mock   | Listens for messages and sends response events                 |
| `AsyncServer`   | Async         | Proxy  | Intercepts messages, can transform or forward to target        |
| `DataSource`    | None          | Data   | Direct SDK access to databases/caches (Redis, PostgreSQL, MongoDB) |

**Server as Proxy**: When a `Server` or `AsyncServer` has both `listenAddress` and `targetAddress`, it acts as a proxy:

```typescript
// Server acting as mock (no targetAddress)
const mock = new Server('backend', {
  protocol: new HttpProtocol<ServiceDef>(),
  listenAddress: { host: 'localhost', port: 3000 },
});

// Server acting as proxy (has targetAddress)
const proxy = new Server('gateway', {
  protocol: new HttpProtocol<ServiceDef>(),
  listenAddress: { host: 'localhost', port: 3001 },
  targetAddress: { host: 'localhost', port: 3000 },  // forwards to backend
});
```

### Protocols

Protocols are stateless adapter factories. Components own the adapters and manage their lifecycle.

| Protocol             | Type  | Package                   | Use Case                     |
| -------------------- | ----- | ------------------------- | ---------------------------- |
| `HttpProtocol`       | Sync  | `testurio`                | REST APIs                    |
| `GrpcUnaryProtocol`  | Sync  | `@testurio/protocol-grpc` | gRPC unary calls             |
| `GrpcStreamProtocol` | Async | `@testurio/protocol-grpc` | gRPC bidirectional streaming |
| `WebSocketProtocol`  | Async | `@testurio/protocol-ws`   | WebSocket connections        |
| `TcpProtocol`        | Async | `@testurio/protocol-tcp`  | Custom TCP protocols         |

### DataSource Adapters

| Adapter            | Package                    | Client Type | Use Case                     |
| ------------------ | -------------------------- | ----------- | ---------------------------- |
| `RedisAdapter`     | `@testurio/adapter-redis`  | `Redis`     | Redis cache/key-value store  |
| `PostgresAdapter`  | `@testurio/adapter-pg`     | `Pool`      | PostgreSQL database          |
| `MongoAdapter`     | `@testurio/adapter-mongo`  | `Db`        | MongoDB database             |

### Custom Codecs

WebSocket and TCP protocols support custom message encoding/decoding via codecs. By default, JSON is used.

```typescript
import { JsonCodec } from 'testurio';
import { WebSocketProtocol } from '@testurio/protocol-ws';
import { TcpProtocol } from '@testurio/protocol-tcp';

// JSON codec with custom date handling
const jsonWithDates = new JsonCodec({
  reviver: (key, value) => {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return new Date(value);
    }
    return value;
  },
});

// Use with WebSocket
const wsProtocol = new WebSocketProtocol({
  codec: jsonWithDates,
});

// Use with TCP (binary codecs require length-prefixed framing)
const tcpProtocol = new TcpProtocol({
  codec: myBinaryCodec,
  lengthFieldLength: 4,  // Required for binary codecs
});
```

See [examples/custom-codecs](./examples/custom-codecs/) for MessagePack and Protobuf codec examples.

```typescript
// Sync protocols: createServer() / createClient() return adapters
const httpProtocol = new HttpProtocol<ServiceDef>();
const serverAdapter = await httpProtocol.createServer({ listenAddress });
const clientAdapter = await httpProtocol.createClient({ targetAddress });

// Async protocols: same pattern
const wsProtocol = new WebSocketProtocol<WsMessages>();
const serverAdapter = await wsProtocol.createServer({ listenAddress });
const clientAdapter = await wsProtocol.createClient({ targetAddress });
```

### Hook Methods

All hook methods accept an optional description parameter for better error messages and debugging.

#### Sync Protocols (HTTP, gRPC Unary)

```typescript
backend.onRequest('messageType', options?)
  .assert('request should have valid body', (req) => req.body !== null)  // With description
  .mockResponse('return user list', (req) => ({ code: 200, body: [] }))  // With description
  .delay('simulate network latency', 100)                                 // With description
  .proxy('add tracing header', (req) => ({ ...req, headers: { ...req.headers, 'X-Trace': '123' } }))
  .drop();

// Client assertions with descriptions
client.onResponse('getUsers')
  .assert('status should be 200', (res) => res.code === 200)
  .assert('body should be array', (res) => Array.isArray(res.body));
```

#### Async Protocols (WebSocket, TCP, gRPC Stream)

```typescript
backend.onMessage('MessageType')
  .assert('payload should have id', (payload) => payload.id !== undefined)
  .mockEvent('respond with confirmation', 'ResponseType', (payload) => response)
  .proxy('transform payload', (payload) => transformedPayload)
  .delay('simulate processing', 100)
  .drop();

// Client assertions with descriptions
asyncClient.onEvent('pong')
  .assert('seq should match', (payload) => payload.seq === 1);
```

## API Reference

### TestScenario

```typescript
const scenario = new TestScenario({
  name: string,
  components: ComponentConfig[],
});

// Lifecycle hooks
scenario.init((test) => { /* setup */ });
scenario.stop((test) => { /* teardown */ });

// Run tests
const result = await scenario.run(testCase);
const results = await scenario.runAll([testCase1, testCase2]);
```

### testCase

```typescript
const tc = testCase('Test name', (test) => {
  // Type-safe component access via test.use()
  const api = test.use(httpClient);       // Returns typed SyncClientStepBuilder
  const backend = test.use(httpServer);   // Returns typed SyncServerStepBuilder
  const wsClient = test.use(asyncClient); // Returns typed AsyncClientStepBuilder
  const wsServer = test.use(asyncServer); // Returns typed AsyncServerStepBuilder
  const db = test.use(dataSource);        // Returns typed DataSourceStepBuilder

  // Utilities
  test.wait(ms);
  test.waitUntil(() => condition, { timeout });
});
```

### Client API

```typescript
// Sync (HTTP, gRPC Unary)
client.request('messageType', options, traceId?);
client.onResponse('messageType', traceId?)
  .assert((res) => boolean)                         // Without description
  .assert('description', (res) => boolean);         // With description

// Async (WebSocket, TCP)
asyncClient.sendMessage('MessageType', payload, traceId?);
asyncClient.onEvent('ResponseType', matcher?)
  .assert((payload) => boolean)                     // Without description
  .assert('description', (payload) => boolean);    // With description
asyncClient.waitMessage('ResponseType', { timeout?, matcher? });
```

### Mock API

```typescript
// Sync - all methods accept optional description as first parameter
mock.onRequest('messageType', options?)
  .assert('description', (req) => boolean)         // Assert with description
  .mockResponse((req) => response)                 // Without description
  .mockResponse('description', (req) => response)  // With description
  .delay(ms)                                       // Without description
  .delay('description', ms)                        // With description
  .proxy((req) => transformedReq)                  // Without description
  .proxy('description', (req) => transformedReq)   // With description
  .drop();

// Async - all methods accept optional description as first parameter
asyncMock.onMessage('MessageType', matcher?)
  .assert('description', (payload) => boolean)                    // Assert with description
  .mockEvent('ResponseType', (payload) => response)               // Without description
  .mockEvent('description', 'ResponseType', (payload) => response) // With description
  .delay(ms)                                                      // Without description
  .delay('description', ms)                                       // With description
  .proxy((payload) => transformed)                                // Without description
  .proxy('description', (payload) => transformed)                 // With description
  .drop();
```

### DataSource API

```typescript
// Execute database operation
dataSource.exec(async (client) => {
  await client.set('key', 'value');
});

// With description (for better reports)
dataSource.exec('setup test data', async (client) => {
  await client.query('INSERT INTO users ...');
});

// Chain assertions
dataSource.exec(async (client) => client.get('key'))
  .assert((result) => result !== null)
  .assert('should have correct value', (result) => result === 'expected');

// With timeout
dataSource.exec('slow query', async (client) => {
  return client.query('SELECT * FROM large_table');
}, { timeout: 5000 });
```

## Best Practices

1. **Declare components first** - Get component references at the start of each test
2. **Write steps in execution order** - Request → Mock handles → Response
3. **Use traceId for multiple requests** - Correlate requests with responses explicitly
4. **Keep mock handlers simple** - Avoid complex logic in response handlers

## Architecture

```mermaid
graph TB
    subgraph Execution["EXECUTION LAYER"]
        E[TestScenario, TestCase, StepExecutor]
    end

    subgraph Builders["BUILDERS LAYER"]
        B[TestCaseBuilder, SyncClientStepBuilder,<br/>SyncServerStepBuilder, AsyncClientStepBuilder]
    end

    subgraph Hooks["HOOKS LAYER"]
        H[HookRegistry, SyncHookBuilder, message-matcher]
    end

    subgraph Components["COMPONENTS LAYER"]
        C[Client, Server, AsyncClient, AsyncServer, DataSource]
    end

    subgraph Protocols["PROTOCOLS LAYER"]
        P[HttpProtocol, GrpcUnaryProtocol,<br/>GrpcStreamProtocol, WebSocketProtocol, TcpProtocol]
    end

    subgraph Adapters["ADAPTERS LAYER"]
        A[ISyncServerAdapter, ISyncClientAdapter,<br/>IAsyncServerAdapter, IAsyncClientAdapter]
    end

    Execution --> Builders
    Builders --> Hooks
    Hooks --> Components
    Components --> Protocols
    Protocols --> Adapters
```

| Layer          | Responsibility                                               |
| -------------- | ------------------------------------------------------------ |
| **Execution**  | Orchestrate test execution                                   |
| **Builders**   | Fluent API for building test steps                           |
| **Hooks**      | Message interception for test steps                          |
| **Components** | High-level abstractions that own adapters and manage state   |
| **Protocols**  | Stateless adapter factories (`createServer`, `createClient`) |
| **Adapters**   | Protocol-specific I/O operations (owned by components)       |
| **DataSource** | Direct SDK access to databases/caches (no hooks, no protocols) |

## License

MIT 
