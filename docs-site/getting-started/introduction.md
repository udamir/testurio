# Introduction

## What is Testurio?

Testurio is a **declarative E2E/integration testing framework** for distributed systems. It lets you write tests that describe the expected message flow between components — clients, servers, proxies, message queues, and databases — using a clear, readable syntax.

Instead of manually wiring up HTTP servers, managing WebSocket connections, or polling message queues, you declare what each component should do and Testurio orchestrates the execution for you.

## The Three Roles

At its core, Testurio is built around three component roles. Every test you write uses one or more of these:

### Client

Sends requests or messages to a target server and asserts on the responses.

```
Client ──request──→ Server
Client ←─response── Server
```

### Mock

A server component that intercepts incoming requests, validates payloads, and returns controlled responses — no real backend needed.

```
Client ──request──→ Mock Server
Client ←─mock resp─ Mock Server
```

### Proxy

A server component that sits between the client and a real backend. It forwards all messages while letting you inspect, transform, mock selectively, or drop traffic in flight.

```
Client ──→ Proxy ──→ Backend
Client ←── Proxy ←── Backend
              ↕
     inspect / transform / mock / drop
```

The difference between **Mock** and **Proxy** is just configuration — a `Server` with only `listenAddress` is a mock; add `targetAddress` and it becomes a proxy:

```typescript
// Mock — handles requests directly
const mock = new Server('mock', {
  protocol: new HttpProtocol(),
  listenAddress: { host: 'localhost', port: 3000 },
});

// Proxy — forwards to backend
const proxy = new Server('proxy', {
  protocol: new HttpProtocol(),
  listenAddress: { host: 'localhost', port: 3001 },
  targetAddress: { host: 'localhost', port: 3000 },
});
```

This same model applies across all protocols (HTTP, gRPC, WebSocket, TCP) and to async components (`AsyncClient`, `AsyncServer`).

## When to Use Testurio

Testurio is designed for testing **distributed system interactions**:

- **API contract testing** — Verify that clients and servers agree on request/response formats
- **Proxy and middleware testing** — Intercept, inspect, and transform messages flowing through a proxy
- **Message queue flows** — Test publish/subscribe patterns with Kafka, RabbitMQ, or Redis Pub/Sub
- **Multi-service integration** — Validate end-to-end flows across multiple services and protocols
- **Schema validation** — Enforce Zod schemas at runtime to catch payload mismatches early

## Key Features

### Multi-Protocol Support

Test HTTP, gRPC (unary and streaming), WebSocket, and TCP protocols with a unified API. The same component model and test structure works across all protocols.

### Declarative API

Write test steps in the order messages flow through your system. No imperative setup, teardown, or callback management:

```typescript
const tc = testCase('Get users', (test) => {
  const api = test.use(client);
  const mock = test.use(server);

  api.request('getUsers', { method: 'GET', path: '/users' });
  mock.onRequest('getUsers').mockResponse(() => ({ code: 200, body: [] }));
  api.onResponse('getUsers').assert((res) => res.code === 200);
});
```

### Type-Safe

Full TypeScript support with automatic type inference. Define service types once and get compile-time checks on operation IDs, request payloads, and response shapes.

### Schema Validation

Use Zod-compatible schemas for runtime payload validation. Schemas serve double duty: TypeScript type inference and automatic validation at I/O boundaries.

### Message Queue & DataSource Support

First-class Publisher, Subscriber, and DataSource components for testing message-driven architectures with Kafka, RabbitMQ, Redis, PostgreSQL, and MongoDB.

### Proxy Mode

Server components can act as transparent proxies when given both a `listenAddress` and `targetAddress`. Use hooks to inspect, transform, mock, or drop messages flowing through the proxy.

## How It Works

A Testurio test has four parts:

1. **Define components** — Create clients, servers, publishers, subscribers, and data sources with their protocol/adapter configuration
2. **Create a scenario** — Group components into a `TestScenario` that manages their lifecycle
3. **Write test cases** — Use `testCase()` to declare steps in message flow order
4. **Run** — `scenario.run(tc)` starts components, executes steps, and returns results

```typescript
import { TestScenario, testCase, Client, Server, HttpProtocol } from 'testurio';

const client = new Client('api', {
  protocol: new HttpProtocol(),
  targetAddress: { host: 'localhost', port: 3000 },
});

const server = new Server('mock', {
  protocol: new HttpProtocol(),
  listenAddress: { host: 'localhost', port: 3000 },
});

const scenario = new TestScenario({
  name: 'My API Test',
  components: [server, client],
});

const tc = testCase('health check', (test) => {
  const api = test.use(client);
  const mock = test.use(server);

  api.request('health', { method: 'GET', path: '/health' });
  mock.onRequest('health').mockResponse(() => ({ code: 200, body: { status: 'ok' } }));
  api.onResponse('health').assert((res) => res.code === 200);
});

const result = await scenario.run(tc);
console.log(result.passed); // true
```

## Next Steps

- [Installation](/getting-started/installation) — Set up Testurio in your project
- [Quick Start](/getting-started/quick-start) — Build your first test step by step
- [Core Concepts](/getting-started/core-concepts) — Understand the component model, protocols, and execution lifecycle
