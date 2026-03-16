# Architecture Deep Dive

Testurio's architecture is organized into six distinct layers, each with a single responsibility. Messages flow down through the layers on the way out and back up on the way in.

## Layer Diagram

```
┌──────────────────────────────────────────────────────────┐
│  Execution Layer                                         │
│  TestScenario, TestCase, StepExecutor                    │
│  Orchestrates component lifecycle and step execution     │
├──────────────────────────────────────────────────────────┤
│  Builder Layer                                           │
│  StepBuilders (Fluent API)                               │
│  Translates user DSL into Step objects                   │
├──────────────────────────────────────────────────────────┤
│  Hook Layer                                              │
│  HookRegistry, Hook matching                             │
│  Intercepts, transforms, and mocks messages              │
├──────────────────────────────────────────────────────────┤
│  Component Layer                                         │
│  Client, Server, AsyncClient, AsyncServer,               │
│  DataSource, Publisher, Subscriber                       │
│  High-level abstractions owning adapters                 │
├──────────────────────────────────────────────────────────┤
│  Protocol Layer                                          │
│  ISyncProtocol, IAsyncProtocol, IMQAdapter               │
│  Stateless adapter factories                             │
├──────────────────────────────────────────────────────────┤
│  Adapter Layer                                           │
│  HTTP, gRPC, WebSocket, TCP, Kafka, RabbitMQ,            │
│  Redis, PostgreSQL, MongoDB adapters                     │
│  Protocol-specific I/O operations                        │
└──────────────────────────────────────────────────────────┘
```

## Layers

### Execution Layer

**Location:** `packages/core/src/execution/`

Orchestrates the entire test lifecycle:

- **TestScenario** — Manages component lifecycle (start/stop) and runs test cases
- **TestCase** — Collects steps via the builder DSL
- **StepExecutor** — Executes steps in the correct three-phase order

The execution layer starts components in order (non-network first, then servers, then clients), runs each test case through three phases, and shuts down in reverse order.

### Builder Layer

**Location:** `packages/core/src/components/*/builders/`

Translates the user's declarative DSL into internal `Step` objects:

```typescript
// User writes this fluent API:
api.request('getUser', { method: 'GET', path: '/users/1' });
mock.onRequest('getUser').mockResponse(() => ({ code: 200, body: {} }));

// Builder converts to Step objects internally
```

Each component type has its own builder:
- `SyncClientBuilder` — for `Client` (request, onResponse)
- `SyncServerBuilder` — for `Server` (onRequest)
- `AsyncClientBuilder` — for `AsyncClient` (sendMessage, waitEvent)
- `AsyncServerBuilder` — for `AsyncServer` (onMessage, waitMessage)
- `DataSourceBuilder` — for `DataSource` (exec)
- `PublisherBuilder` — for `Publisher` (publish)
- `SubscriberBuilder` — for `Subscriber` (waitMessage)

### Hook Layer

**Location:** `packages/core/src/components/base/`

Handles message interception, transformation, and mocking:

- **HookRegistry** — Stores hooks per component, scoped by `testCaseId`
- **Hook matching** — Routes messages to the correct hook based on message type and matcher
- **Hook handlers** — assert, mockResponse, mockEvent, transform, delay, drop, proxy, validate, timeout

Each component has its own `HookRegistry` for test isolation. Hooks are registered in Phase 1 and cleaned up in Phase 3.

### Component Layer

**Location:** `packages/core/src/components/`

High-level abstractions that own adapters and manage their lifecycle:

| Component | Protocol Type | Role |
|-----------|---------------|------|
| `Client` | Sync | Sends requests |
| `Server` | Sync | Mock server or proxy |
| `AsyncClient` | Async | Sends messages over persistent connections |
| `AsyncServer` | Async | Mock server or proxy for async protocols |
| `DataSource` | None | Direct SDK access to data stores |
| `Publisher` | MQ | Publishes messages to topics |
| `Subscriber` | MQ | Subscribes to and asserts on messages |

### Protocol Layer

**Location:** `packages/core/src/protocols/`, `packages/protocol-*/`

Stateless adapter factories. Protocols create adapters but hold no state:

- **ISyncProtocol** — Creates `ISyncServerAdapter` and `ISyncClientAdapter`
- **IAsyncProtocol** — Creates `IAsyncServerAdapter` and `IAsyncClientAdapter`
- **IMQAdapter** — Creates `IMQPublisherAdapter` and `IMQSubscriberAdapter`

### Adapter Layer

**Location:** Protocol and adapter packages

Protocol-specific I/O operations. Each adapter handles the actual network communication:

| Adapter | Technology |
|---------|------------|
| HTTP Server/Client | Express / Node fetch |
| gRPC Unary/Stream | @grpc/grpc-js |
| WebSocket Server/Client | ws |
| TCP Server/Client | Node.js net |
| Kafka | kafkajs |
| RabbitMQ | amqplib |
| Redis | ioredis |
| PostgreSQL | pg |
| MongoDB | mongodb |

## Design Principles

### 1. Stateless Protocols

Protocols are adapter factories with no state. Components own adapters and manage their lifecycle. This means the same protocol instance can be shared across multiple components without side effects.

### 2. Component Ownership

Components own their adapters and manage start/stop. `TestScenario` calls `start()` and `stop()` on components, which in turn manage their adapters.

### 3. Hook Isolation

Each component has its own `HookRegistry`. Hooks are scoped by `testCaseId`, ensuring test cases don't interfere with each other.

### 4. Server as Proxy

When `Server` or `AsyncServer` has both `listenAddress` and `targetAddress`, it automatically acts as a proxy — forwarding messages to the target while allowing hook interception.

### 5. Declarative Only

Inside `testCase()`, only builder methods are used. No imperative code, no async/await, no conditionals. This constraint enables the three-phase execution model.

### 6. Three-Phase Execution

Each test case runs in three phases:

1. **Phase 1: Register hooks** — All builder calls register hooks in the HookRegistry
2. **Phase 2: Execute steps** — Steps run in order, hooks intercept messages
3. **Phase 3: Cleanup** — Hooks are removed for test isolation

## Test Execution Flow

```
TestScenario.run(testCases)
  ├── Start non-network components (DataSource)
  ├── Start servers (sequential, in config order)
  ├── Start clients (parallel)
  ├── For each TestCase:
  │   ├── Phase 1: Register all hooks
  │   ├── Phase 2: Execute steps in order
  │   └── Phase 3: Cleanup hooks
  ├── Stop clients (parallel)
  ├── Stop servers (reverse order)
  └── Stop non-network components
```

## Validation Flow

Schema validation operates at the Component layer:

```
Schema Registration:
  Protocol constructor → protocol.schema
  MQ component constructor → options.schema

Auto-Validation (at I/O boundaries):
  Outgoing → schema.parse(payload) → send
  Incoming → schema.parse(payload) → deliver to hooks

Explicit Validation (in handler chain):
  .validate()        → lookup schema from registry
  .validate(schema)  → use provided schema directly
```

## Monorepo Structure

```
packages/
├── core/              # testurio — Core framework (includes HTTP)
├── protocol-grpc/     # @testurio/protocol-grpc
├── protocol-ws/       # @testurio/protocol-ws
├── protocol-tcp/      # @testurio/protocol-tcp
├── adapter-redis/     # @testurio/adapter-redis
├── adapter-kafka/     # @testurio/adapter-kafka
├── adapter-rabbitmq/  # @testurio/adapter-rabbitmq
├── adapter-mongo/     # @testurio/adapter-mongo
├── adapter-pg/        # @testurio/adapter-pg
├── cli/               # @testurio/cli
└── reporter-allure/   # @testurio/reporter-allure
```

All protocol, adapter, and reporter packages depend on the core package.
