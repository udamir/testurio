# Testurio

A declarative E2E/integration testing framework for distributed systems with multi-protocol support.

[![npm version](https://badge.fury.io/js/testurio.svg)](https://www.npmjs.com/package/testurio)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Multi-Protocol Support** - HTTP, gRPC (Unary & Streaming), WebSocket, TCP
- **Declarative API** - Write tests in execution order with clear, readable syntax
- **Component-Based** - Define clients, mocks, and proxies as reusable components
- **Type-Safe** - Full TypeScript support with automatic type inference via `test.use(component)`
- **Flow Testing** - Test complete request flows through your distributed system
- **Flexible Mocking** - Mock responses, add delays, drop messages, or proxy through

## Installation

```bash
npm install testurio --save-dev
```

## Quick Start

### HTTP Example (Type-Safe)

```typescript
import { TestScenario, testCase, Client, Server, HttpAdapter } from 'testurio';

// Define components with adapters - types are automatically inferred
const httpClient = Client.create('api', {
  adapter: new HttpAdapter(),
  targetAddress: { host: 'localhost', port: 3000 },
});

const httpServer = Server.create('backend', {
  adapter: new HttpAdapter(),
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

  // Step 1: Mock handles request (register handler first)
  backend.onRequest('getUser', { method: 'GET', path: '/users/1' })
    .mockResponse(() => ({
      status: 200,
      body: { id: 1, name: 'Alice', email: 'alice@example.com' },
    }));

  // Step 2: Client sends request
  api.request('getUser', { method: 'GET', path: '/users/1' });

  // Step 3: Client receives and validates response
  api.onResponse('getUser').assert((res) => res.id === 1);
});

// Run the test
const result = await scenario.run(tc);
console.log(result.passed); // true
```

### gRPC Example

```typescript
import { TestScenario, testCase, Client, Server } from 'testurio';
import { GrpcUnaryAdapter } from '@testurio/adapter-grpc';

// Define gRPC components
const grpcClient = Client.create('api', {
  adapter: new GrpcUnaryAdapter({ schema: 'user.proto', serviceName: 'UserService' }),
  targetAddress: { host: 'localhost', port: 5000 },
});

const grpcServer = Server.create('backend', {
  adapter: new GrpcUnaryAdapter({ schema: 'user.proto' }),
  listenAddress: { host: 'localhost', port: 5000 },
});

const scenario = new TestScenario({
  name: 'gRPC User Service Test',
  components: [grpcServer, grpcClient],
});

const tc = testCase('GetUser RPC', (test) => {
  const api = test.use(grpcClient);
  const backend = test.use(grpcServer);

  // Step 1: Mock handles request
  backend.onRequest('GetUser').mockResponse((req) => ({
    status: 200,
    body: { user_id: req.payload.user_id, name: 'John Doe' },
  }));

  // Step 2: Send gRPC request
  api.request('GetUser', { payload: { user_id: 42 } });

  // Step 3: Handle response
  api.onResponse('GetUser').assert((res) => res.name === 'John Doe');
});
```

### WebSocket/Async Example

```typescript
import { TestScenario, testCase, AsyncClient, AsyncServer } from 'testurio';
import { WebSocketAdapter } from '@testurio/adapter-ws';

// Define WebSocket components
const wsClient = AsyncClient.create('client', {
  adapter: new WebSocketAdapter(),
  targetAddress: { host: 'localhost', port: 4000 },
});

const wsServer = AsyncServer.create('server', {
  adapter: new WebSocketAdapter(),
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
  client.sendMessage('Ping', { seq: 1 });

  // Step 2: Server responds with pong
  server.onMessage('Ping').mockEvent('Pong', (payload) => ({
    seq: payload.seq,
    timestamp: Date.now(),
  }));

  // Step 3: Client receives pong
  client.onEvent('Pong').assert((payload) => payload.seq === 1);
});
```

## Core Concepts

### Components

- **Client** - Sends requests to a target address
- **Mock** - Listens for requests and returns configured responses
- **Proxy** - Intercepts requests, can transform or forward them

### Protocols

| Protocol | Type | Use Case |
|----------|------|----------|
| `Http()` | Sync | REST APIs |
| `GrpcUnary()` | Sync | gRPC unary calls |
| `GrpcStream()` | Async | gRPC bidirectional streaming |
| `WebSocket()` | Async | WebSocket connections |
| `TcpProto()` | Async | Custom TCP protocols |

### Hook Methods

#### Sync Protocols (HTTP, gRPC Unary)

```typescript
backend.onRequest('messageType', options?)
  .mockResponse((req) => ({ status, headers, body }))  // Return response
  .delay(ms)                                           // Add latency
  .drop();                                             // Drop request
```

#### Async Protocols (WebSocket, TCP, gRPC Stream)

```typescript
backend.onMessage('MessageType')
  .mockEvent('ResponseType', (payload) => response)   // Send response event
  .proxy((payload) => transformedPayload)             // Forward/transform
  .delay(ms)                                          // Add latency
  .drop();                                            // Drop message
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
  // Type-safe component access (recommended)
  const api = test.use(httpClient);       // Returns typed SyncClientStepBuilder
  const backend = test.use(httpServer);   // Returns typed SyncServerStepBuilder
  const wsClient = test.use(asyncClient); // Returns typed AsyncClientStepBuilder
  const wsServer = test.use(asyncServer); // Returns typed AsyncServerStepBuilder

  // Legacy methods (deprecated - no type inference)
  const client = test.client('name');
  const server = test.server('name');
  const asyncClient = test.asyncClient<Messages>('name');
  const asyncServer = test.asyncServer<Messages>('name');

  // Utilities
  test.wait(ms);
  test.waitUntil(() => condition, { timeout });
});
```

### Client API

```typescript
// Sync (HTTP, gRPC Unary)
client.request('messageType', options, traceId?);
client.onResponse('messageType', traceId?).assert((res) => boolean);

// Async (WebSocket, TCP)
asyncClient.sendMessage('MessageType', payload, traceId?);
asyncClient.onEvent('ResponseType', matcher?).assert((payload) => boolean);
asyncClient.waitMessage('ResponseType', { timeout?, matcher? });
```

### Mock API

```typescript
// Sync
mock.onRequest('messageType', options?)
  .mockResponse((req) => response)
  .delay(ms)
  .drop();

// Async
asyncMock.onMessage('MessageType', matcher?)
  .mockEvent('ResponseType', (payload) => response)
  .delay(ms)
  .drop();
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
        C[Client, Server, AsyncClient, AsyncServer]
    end

    subgraph Adapters["ADAPTERS LAYER"]
        A[HttpAdapter, GrpcAdapter, WsAdapter, TcpAdapter]
    end

    Execution --> Builders
    Builders --> Hooks
    Hooks --> Components
    Components --> Adapters
```

| Layer | Responsibility |
|-------|----------------|
| **Execution** | Orchestrate test execution |
| **Builders** | Fluent API for building test steps |
| **Hooks** | Message interception for test steps |
| **Components** | High-level protocol abstractions |
| **Adapters** | Protocol-specific I/O operations |



## License

MIT 
