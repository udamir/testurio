# Testurio Architecture

Testurio is a declarative E2E/integration testing framework for distributed systems with multi-protocol support (HTTP, gRPC, WebSocket, TCP, message queues, databases).

## Monorepo Structure

```
packages/
├── core/              # testurio - Core framework (includes HTTP protocol)
├── protocol-grpc/     # @testurio/protocol-grpc - gRPC unary and streaming
├── protocol-ws/       # @testurio/protocol-ws - WebSocket
├── protocol-tcp/      # @testurio/protocol-tcp - TCP / custom protocols
├── adapter-redis/     # @testurio/adapter-redis - Redis DataSource & Pub/Sub
├── adapter-kafka/     # @testurio/adapter-kafka - Kafka Pub/Sub
├── adapter-rabbitmq/  # @testurio/adapter-rabbitmq - RabbitMQ Pub/Sub
├── adapter-mongo/     # @testurio/adapter-mongo - MongoDB DataSource
├── adapter-pg/        # @testurio/adapter-pg - PostgreSQL DataSource
└── reporter-allure/   # @testurio/reporter-allure - Allure TestOps reporting
```

All protocol and adapter packages depend on the core package.

## Architectural Layers

The framework has six distinct layers, each with a single responsibility:

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

| Layer          | Location                                               | Responsibility                                            |
| -------------- | ------------------------------------------------------ | --------------------------------------------------------- |
| **Execution**  | `packages/core/src/execution/`                         | Test orchestration (TestScenario, TestCase, StepExecutor) |
| **Builders**   | `packages/core/src/components/*/builders/`             | Fluent API for building test steps                        |
| **Hooks**      | `packages/core/src/components/base/`                   | Message interception, transformation, mocking             |
| **Components** | `packages/core/src/components/`                        | High-level abstractions owning adapters                   |
| **Protocols**  | `packages/core/src/protocols/`, `packages/protocol-*/` | Stateless adapter factories                               |
| **Adapters**   | Protocol and adapter packages                          | Protocol-specific I/O operations                          |

See [layers/](layers/) for detailed documentation of each layer.

## Component Types

| Component     | Protocol Type                       | Role                                                      |
| ------------- | ----------------------------------- | --------------------------------------------------------- |
| `Client`      | Sync (HTTP, gRPC Unary)             | Sends requests to a target server                         |
| `Server`      | Sync                                | Mock server or proxy                                      |
| `AsyncClient` | Async (WebSocket, TCP, gRPC Stream) | Sends messages over persistent connections                |
| `AsyncServer` | Async                               | Mock server or proxy for async protocols                  |
| `DataSource`  | None (direct SDK)                   | Direct access to data stores (Redis, PostgreSQL, MongoDB) |
| `Publisher`   | MQ Adapter                          | Fire-and-forget message publishing                        |
| `Subscriber`  | MQ Adapter                          | Subscribes to and asserts on messages                     |

See [layers/components.md](layers/components.md) for detailed component documentation.

## Design Principles

1. **Stateless Protocols** - Protocols are adapter factories with no state. Components own adapters and manage their lifecycle.
2. **Component Ownership** - Components own their adapters and manage their lifecycle (start/stop).
3. **Hook Isolation** - Each component has its own `HookRegistry` for test isolation. Hooks are scoped by `testCaseId`.
4. **Server as Proxy** - When `Server`/`AsyncServer` has both `listenAddress` and `targetAddress`, it acts as a transparent proxy with hook interception.
5. **Declarative Only** - Inside `testCase()`, only builder methods are used. No imperative code.
6. **Three-Phase Execution** - Steps execute in three phases: register hooks, execute steps, cleanup.

## Flexible Type System

The framework supports two typing modes:

- **Loose mode** - Use protocol without a type parameter (e.g., `new HttpProtocol()`). Any string is accepted as a message type.
- **Strict mode** - Use protocol with a type parameter (e.g., `new HttpProtocol<ServiceDef>()`). Only defined operation IDs are accepted.
- **Schema-first mode** - Use CLI-generated protocol schemas (e.g., `new HttpProtocol({ schema: petStoreSchema })`). Types are inferred from the schema with runtime validation.

The CLI (`@testurio/cli`) generates `.schema.ts` files containing:
- Zod schemas for request/response validation
- Protocol schema bridge exports (`{serviceName}Schema`) compatible with `SyncSchemaInput` / `AsyncSchemaInput`
- TypeScript service interfaces for legacy explicit generic usage

See [type-system.md](type-system.md) for details.

## Validation Subsystem

Runtime schema validation operates at the Component layer, using Zod-compatible schemas (any object with a `.parse()` method) registered on protocols or components.

### Schema Sources

| Component Type | Schema Source | Schema Structure |
|---------------|--------------|------------------|
| `Client`, `Server` | `protocol.schema` | `SyncSchemaInput` — `{ [operationId]: { request?: SchemaLike, response?: SchemaLike } }` |
| `AsyncClient`, `AsyncServer` | `protocol.schema` | `AsyncSchemaInput` — `{ clientMessages?: { [type]: SchemaLike }, serverMessages?: { [type]: SchemaLike } }` |
| `Publisher`, `Subscriber` | `options.schema` (component-level only) | `MQSchemaInput` — `{ [topic]: SchemaLike }` |
| `DataSource` | N/A | Excluded — native SDK pass-through |

### Validation Flow

```
Schema Registration:
  Protocol constructor → protocol.schema field
  MQ component constructor → options.schema (component-level)

Auto-Validation (at I/O boundaries):
  Outgoing data → autoValidate() → schema.parse(payload) → send
  Incoming data → autoValidate() → schema.parse(payload) → deliver to hooks

Explicit Validation (in handler chain):
  .validate()        → lookup schema from protocol/component registry
  .validate(schema)  → use provided schema directly
```

### Key Types

- **`SchemaLike<T>`** — Interface requiring `.parse(data: unknown): T`. Compatible with Zod, Yup, or any validation library.
- **`ValidationError`** — Extends `Error` with `componentName`, `operationId`, `direction`, and `cause` fields.
- **`SyncValidationOptions`** — Controls auto-validation for Client/Server: `{ validateRequests?: boolean, validateResponses?: boolean }`.
- **`AsyncValidationOptions`** — Controls auto-validation for AsyncClient/AsyncServer: `{ validateMessages?: boolean, validateEvents?: boolean }`.
- **`MQValidationOptions`** — Controls auto-validation for Publisher/Subscriber: `{ validateMessages?: boolean }`.

### Three Typing Modes

Protocols use `S = never` as the generic default, with `Resolve*Type<S>` conditional types:

| Mode | Generic Arg | `schema` Field | Result |
|------|------------|----------------|--------|
| Schema-first | None | Provided | Types inferred from schema via `InferSyncService<S>` / `InferAsyncMessages<S>` |
| Explicit generic | `<ServiceDef>` | None | Types come from explicit generic (no runtime validation) |
| Loose | None | None | Any string accepted as operation/message type |

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

See [test-lifecycle.md](test-lifecycle.md) for the full lifecycle documentation.

## Documentation Index

| Document                               | Description                                         |
| -------------------------------------- | --------------------------------------------------- |
| [layers/](layers/)                     | Detailed documentation for each architectural layer |
| [modules/](modules/)                   | Per-package documentation                           |
| [test-lifecycle.md](test-lifecycle.md) | Test execution lifecycle and phases                 |
| [type-system.md](type-system.md)       | Flexible type system (loose/strict modes)           |
| [testing/](testing/)                   | Testing guidelines, coverage, testcontainers        |
| [roadmap/](roadmap/)                   | Planned features and their design documents         |
