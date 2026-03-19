# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **AsyncServer `waitEvent()`** — Added strict `waitEvent()` step to `AsyncServer` for proxy mode. This is the strict counterpart to `onEvent()`: it blocks until a matching backend event arrives and throws a strict ordering violation if the event arrives before the step starts. Supports the full handler chain (assert, transform, proxy, drop, timeout, matcher).

- **Factory Step Parameters** — Action step methods now accept `T | (() => T)` factory functions in addition to static values. This allows step parameters to be resolved at execution time, enabling multi-step flows where data from one step (e.g., a token or session ID) is used by a later step.
  - `client.request('getProfile', () => ({ method: 'GET', path: '/profile', headers: { Authorization: `Bearer ${token}` } }))`
  - `ws.sendMessage('join', () => ({ room: 'general', sessionId }))`
  - `server.sendEvent('conn', 'authResult', () => ({ success: true, sessionId: extractedId }))`
  - `publisher.publish('orders', () => ({ orderId, status: 'confirmed' }))`
  - New exported types: `ValueOrFactory<T>`, `resolveValue<T>()`

### Fixed

- **AsyncServer `validate()` direction** — `onEvent().validate()` now correctly uses `"serverMessage"` direction for schema lookup instead of hardcoded `"clientMessage"`. Previously, event validation would fail with "No schema registered" or validate against the wrong schema.

## [0.6.0] - 2026-03-18

### Added

- **AsyncClient Connection Control** — Explicit connection lifecycle management for async protocols
  - **`autoConnect` option** — New option on `AsyncClientOptions` (default: `false`). Set to `true` or pass protocol-typed params for automatic connection on start.
  - **`connect()` builder step** — New action step on `AsyncClientStepBuilder` for explicit connection with optional protocol-typed params. Accepts static params or factory function for dynamic params (e.g., auth tokens from earlier steps).
  - **Reconnection support** — `connect()` after `disconnect()` creates a fresh connection, enabling reconnection flow testing.
  - **Protocol-typed connect params** — Each async protocol declares its own connect params type:
    - `WsConnectParams` — `headers`, `query`, `path`, `protocols` for WebSocket handshake
    - `GrpcStreamConnectParams` — `metadata` for gRPC stream auth
    - TCP — no protocol-specific params
  - **`ProtocolConnectParams<P>` type extractor** — Extract connect params type from protocol for type-safe `connect()` calls

### Breaking Changes

- **`AsyncClient` no longer auto-connects by default** — `autoConnect` defaults to `false`. Existing tests using `AsyncClient` must either add `autoConnect: true` to the options or add an explicit `connect()` step. This enables testing deferred connections, auth-gated connections, and reconnection flows.

## [0.5.0] - 2026-03-16

### Added

- **Documentation Portal** — Comprehensive VitePress documentation site with getting started guides, API reference for all packages, examples/cookbook, and development guides for custom protocols, adapters, reporters, and codecs. Deployed to GitHub Pages via GitHub Actions.

- **Runtime Schema Validation** — Validate request/response/message payloads at runtime using Zod-compatible schemas (any object with a `.parse()` method)
  - **Schema-first protocols** — Pass schemas to protocol constructors for automatic TypeScript type inference (`new HttpProtocol({ schema: zodSchemas })`). No manual generic parameters needed.
  - **Auto-validation** — Outgoing requests/messages and incoming responses/events are validated automatically at I/O boundaries when schemas are registered. Controlled via `validation: { validateRequests, validateResponses }` options.
  - **`.validate()` builder method** — Explicit per-step validation on hook builders. Supports no-arg (protocol schema lookup) and explicit schema overloads.
  - **`ValidationError` class** — Structured error with `componentName`, `operationId`, `direction`, and `cause` fields for clear diagnostics.
  - **`SchemaLike<T>` interface** — Framework-agnostic schema contract requiring only `.parse(data): T`. Compatible with Zod, Yup, or any validation library.
  - Supported across all component types: Client, Server, AsyncClient, AsyncServer, Publisher, Subscriber
  - Three typing modes: schema-first (runtime + compile-time), explicit generic (compile-time only), loose (any string)

- **Protocol generic restructuring** — All protocols now use `S = never` default generic with `Resolve*Type<S>` conditional types to support schema inference, explicit generics, and loose mode in a single generic parameter.

### Breaking Changes

- **`schema` renamed to `protoPath`** on all protocol options that accepted file paths (proto files, OpenAPI specs). The `schema` field now accepts typed Zod-compatible schema maps for runtime validation.

  **Migration:**
  ```typescript
  // Before
  new GrpcUnaryProtocol({ schema: 'user.proto', serviceName: 'UserService' })
  new GrpcStreamProtocol({ schema: 'chat.proto' })
  new TcpProtocol({ schema: 'protocol.proto' })

  // After
  new GrpcUnaryProtocol({ protoPath: 'user.proto', serviceName: 'UserService' })
  new GrpcStreamProtocol({ protoPath: 'chat.proto' })
  new TcpProtocol({ protoPath: 'protocol.proto' })
  ```

  `HttpProtocol` and `WebSocketProtocol` did not previously have a `schema` file path field and are unaffected by the rename.
- **Timeout configuration** — Removed `timeout` from options/parameters in `waitRequest()`, `onResponse()`, `waitResponse()`, `waitMessage()`, `waitMessageFrom()`, and `exec()`. Use `.timeout(ms)` chain method instead.
  - Before: `redis.exec(cb, { timeout: 5000 })`
  - After: `redis.exec(cb).timeout(5000)`
- **`ExecOptions` removed** — The `ExecOptions` interface has been removed from exports
- **`SyncServerHookBuilder.timeout()`** — Added missing `.timeout(ms)` method to sync server hook builder for consistency


## [0.4.1] - 2026-02-26
 
### Added

- **CLI: Protocol schema bridge exports** — Generated `.schema.ts` files now include a `{serviceName}Schema` export compatible with `SyncSchemaInput` (HTTP, gRPC Unary) and `{serviceName}StreamsSchema` compatible with `AsyncSchemaInput` (gRPC Streaming). These bridge objects compose individual Zod schemas into the structure expected by protocol constructors, enabling schema-first usage with automatic type inference.

### Fixed

- **CLI: File extension rename** — Default generated output changed from `.types.ts` to `.schema.ts` to better reflect the file's runtime content (Zod schemas + protocol schema bridge)
- **CLI: Naming standardization** — Internal properties and section comments renamed from plural "schemas" to singular "schema" (e.g., `// ===== Zod Schema =====`)
- **CLI: Doc comments updated** — Generated doc comments now show both "Schema-first (recommended)" and "Current usage (explicit generic)" patterns with accurate constructor signatures for the current API
- **CLI: Header schema naming** — Renamed generated header schema variables from `{operationId}HeadersSchema` (plural) to `{operationId}HeaderSchema` (singular) for consistency with the naming convention
- **CLI: Path parameter validation** — Protocol schema bridge now uses `z.string()` for OpenAPI operations with path parameters (e.g., `/pets/{petId}`) instead of `z.literal('/pets/{petId}')`, which would fail runtime validation when actual resolved paths like `/pets/123` are checked

## [0.4.0] - 2026-02-15

### Added

- **Custom Codec Support** for WebSocket and TCP protocols
  - New `Codec` interface for message encoding/decoding (`packages/core/src/protocols/base/codec.types.ts`)
  - `JsonCodec` - Default JSON codec with reviver/replacer support (`packages/core/src/protocols/base/json.codec.ts`)
  - `CodecError` - Dedicated error class for codec failures
  - `codec` option in `WsProtocolOptions` and `TcpProtocolOptions`
  - Example codecs: MessagePackCodec, ProtobufCodec (`examples/custom-codecs/`)
- **@testurio/cli package** (`packages/cli/`) - CLI tool for generating type-safe TypeScript schemas from API specifications
  - `testurio generate` command to generate Zod schemas and Testurio-compatible service types
  - `testurio init` command to scaffold a starter `testurio.config.ts`
  - Config system using cosmiconfig with Zod validation (`testurio.config.ts/js/json/yaml`)
  - `defineConfig` helper for type-safe configuration
  - Generates Zod schemas from OpenAPI 3.x specs via Orval programmatic API
  - Generates Zod schemas from `.proto` files via protobufjs

### Changed

- WebSocket adapters now use configurable codec instead of hardcoded JSON
- TCP adapters now use configurable codec instead of hardcoded JSON

### Documentation

- Added Custom Codecs section to README.md
- Added Codec Layer section to ARCHITECTURE.md
- Created examples/custom-codecs/ with MessagePack and Protobuf examples

## [0.3.1] - 2026-01-19

### Added

- **`@testurio/protocol-grpc`** - gRPC protocol package
  - `GrpcUnaryProtocol` - Synchronous unary request/response calls
  - `GrpcStreamProtocol` - Asynchronous bidirectional streaming
  - Proto schema loading with `@grpc/proto-loader`
  - gRPC credentials support
  - Metadata handling for gRPC calls
  - Type-safe gRPC service definitions

- **`@testurio/protocol-ws`** - WebSocket protocol package
  - `WebSocketProtocol` for async bidirectional messaging
  - Type-safe WebSocket service definitions
  - Custom codec support (JSON default, configurable)
  - Client and server message type definitions

- **`@testurio/protocol-tcp`** - TCP protocol package
  - `TcpProtocol` for custom binary/text protocols
  - Length-prefixed framing for binary protocols
  - Custom codec support
  - TCP client/server socket management
  - Type-safe TCP service definitions

- **`@testurio/reporter-allure`** - Allure TestOps integration
  - `AllureReporter` - Converts Testurio test results to Allure format
  - Environment info reporting
  - Attachment support for payloads
  - Label and link management
  - Test step conversion with status tracking
  - `FileSystemWriter` for result persistence

- **`@testurio/adapter-kafka`** - Apache Kafka adapter
  - `KafkaPublisherAdapter` - Publisher component integration
  - `KafkaSubscriberAdapter` - Subscriber component integration
  - KafkaJS-based implementation
  - Topic-based message publishing
  - Consumer group support
  - Partition and offset management

- **`@testurio/adapter-rabbitmq`** - RabbitMQ adapter
  - `RabbitMQPublisherAdapter` - Publisher component integration
  - `RabbitMQSubscriberAdapter` - Subscriber component integration
  - Exchange and routing key support
  - Topic pattern matching (e.g., `orders.#`, `*.created`)
  - AMQP delivery tag tracking
  - Redelivery detection

- **`@testurio/adapter-redis`** - Redis adapter
  - `RedisAdapter` - DataSource component integration
  - Direct Redis client access via ioredis
  - Redis Pub/Sub support
  - Key-value operations

- **`@testurio/adapter-pg`** - PostgreSQL adapter
  - `PostgresAdapter` - DataSource component integration
  - node-postgres (pg) based implementation
  - Pool and PoolClient support
  - Direct SQL query execution
  - Transaction support

- **`@testurio/adapter-mongo`** - MongoDB adapter
  - `MongoAdapter` - DataSource component integration
  - Official MongoDB Node.js driver based implementation
  - Collection and database operations
  - Direct database access

## [0.3.0] - 2026-01-09

### Added

- Flexible Protocol Types feature
  - Loose mode: Accept any string as message type
  - Strict mode: Constrain to defined operation IDs
- DataSource component for database/cache integration
- Redis, PostgreSQL, MongoDB adapters

### Changed

- Protocol type system refactored for better type inference

## [0.2.0] - 2026-01-08

### Added

- gRPC streaming support (`GrpcStreamProtocol`)
- TCP protocol (`TcpProtocol`)
- WebSocket protocol (`WebSocketProtocol`)
- Proxy mode for Server and AsyncServer components

## [0.1.0] - 2026-01-07

### Added

- Initial release
- HTTP protocol support
- gRPC unary protocol support
- Client/Server components
- AsyncClient/AsyncServer components
- TestScenario and testCase APIs
- Hook system for message interception
