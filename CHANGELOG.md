# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.3] - unreleased

### Fixed

- **`.assert()` predicates may now omit a return value without a type error.** An expect-only body such as `.assert((res) => { expect(res.code).toBe(200); })` already passed at runtime but failed to type-check, forcing a trailing `return true;`. The predicate return type now accepts `void`, so expect-only assertions compile as written.

- **`Client.request().retry(...)` no longer crashes the runner on retry exhaustion when a downstream `onResponse` / `waitResponse` step is registered.** Previously, the `RetryTimeoutError` (or rethrown attempt error under `retryOnError: false`) propagated cleanly as a failed step but left the matching response-hook pending in a rejected-without-observer state, which Node escalated to `unhandledRejection` — terminating the runner mid-scenario and dropping subsequent test cases. The framework now marks the rejection as observed before triggering it; existing `awaitHook` consumers continue to receive the original error unchanged.

## [0.7.2] - 2026-06-09

### Added

- **`Subscriber` is now always per-test-case isolated** — Constructor takes the `IMQAdapter` **factory** directly; the framework materializes a fresh subscriber adapter per test case. Eliminates the cross-TC offset leak and the sequential-different-topics breakage that existed in master. **Zero-config default**: omit `defaultSubscribeParams.groupId` and the framework auto-generates `testurio-${randomSuffix(8)}` per TC so every test case gets its own consumer group. Opt out via `new KafkaAdapter({ ..., defaultSubscribeParams: { groupId: 'shared' } })` to share one group across TCs (Kafka partition-assignment semantics).

  ```typescript
  const kafka = new KafkaAdapter({ brokers: ['localhost:9092'] });
  const events = new Subscriber('events', { adapter: kafka });
  // Each TC gets a unique consumer group automatically.
  ```

- **`SubscriberStepBuilder.subscribe(topic?, params?)` and `unsubscribe(topic?)`** — Imperative declarative builder methods. Single topic, array, or empty-array shortcut (subscribes to all hook-derived topics for the TC / unsubscribes from all currently-held). `params` is `Partial<P>` for adapter-specific overrides (e.g. `ev.subscribe('orders', { fromBeginning: true })`).

- **`KafkaSubscribeParams` and `KafkaAdapterConfig.defaultSubscribeParams`** — Per-subscribe params shape (`groupId?`, `fromBeginning?`) plus adapter-wide defaults bag. Per-call subscribe-level overrides flow through `ev.subscribe('topic', { fromBeginning: true })`.

- **`SubscriberOptions.autoSubscribe: boolean`** — Whether the per-TC adapter auto-subscribes to topics referenced by `onMessage` / `waitMessage` / `waitMessageFrom` hooks. Defaults to `true`. (The v1 `Array<Topic>` form is removed — see Breaking Changes below.)

- **`KafkaAdapterConfig.groupJoinTimeoutMs`** — Configurable per-adapter timeout for the Kafka subscriber to await the `consumer.events.GROUP_JOIN` event after `consumer.run()`. Default `30000` ms (production) and `5000` ms (`testMode: true`). On expiry the activation rejects with `ConsumerJoinTimeoutError`.

- **`Component.afterHooksRegistered?(testCaseId)`** — Optional lifecycle hook on the `Component` interface, called between hook registration and step execution for every test case. Receives the originating `testCaseId` so per-TC components can branch on it. Rejections propagate exactly like hook-registration failures and abort the test case.

- **`ConsumerJoinTimeoutError`** — Named export from `@testurio/adapter-kafka`. Thrown when the Kafka subscriber adapter cannot confirm `GROUP_JOIN` within the configured timeout (initial subscribe AND the disconnect-reconnect restart path on new topics). Carries `timeoutMs` for diagnostics.

- **Optional dispatch `key?: string` on `Codec.encode` / `Codec.decode`** — Lets a single codec instance pick a payload schema per call without keeping per-topic codec instances. Existing codecs continue to compile because the parameter is optional and unobserved. For MQ adapters the key is the concrete destination topic; HTTP / WS / TCP adapters can leave it undefined or pass an adapter-specific dispatch identifier in a follow-up.

- **MQ adapters pass the concrete topic to the codec on every call.** Kafka, RabbitMQ, and Redis Pub/Sub all dispatch through `codec.encode(payload, topic)` and `codec.decode(wire, topic)`. The key is always the broker-side concrete identity — Kafka topic name, RabbitMQ routing key, Redis channel — never a subscription pattern, glob mask, or AMQP wildcard string. Dispatching codecs (such as the new `ProtobufCodec`) can rely on this invariant when matching bindings.

- **New package `@testurio/codec-protobuf`** — First-class `ProtobufCodec` with ordered entries-array bindings: each entry pairs a matcher (`string` exact / `RegExp` / predicate `(key) => boolean`) with a fully-qualified protobuf type name. First match wins. One codec instance handles every topic — exact, RegExp, and predicate matchers can mix freely. Unmapped keys throw `CodecError` listing every configured entry. Ships a typed `defineBindings<TopicMap, Registry>()` helper that catches topic ↔ wire-type mismatches at codec-construction-site type-check, plus an `includePaths` option for `protoc -I include/path` semantics when loading `.proto` files with cross-package imports.

- **`ProtobufCodec` `keepCase?: boolean` option** — Top-level field-naming control forwarded to protobufjs's parser at `.proto` load time, applied symmetrically to both decode output and encode input. Defaults to `false` (protobufjs's native `camelCase`, e.g. `{ orderId }`); set `keepCase: true` to preserve the original `.proto` field names verbatim (conventionally `snake_case`, e.g. `{ order_id }`).

### Changed (BREAKING) — Subscriber per-test-case isolation

- **`SubscriberOptions.adapter` is now an `IMQAdapter` factory** (was `IMQSubscriberAdapter`). Pass the broker adapter directly — the framework materializes a fresh subscriber adapter per test case. Migration: `new Subscriber('x', { adapter: await kafka.createSubscriber() })` → `new Subscriber('x', { adapter: kafka })`.

- **`SubscriberOptions.autoSubscribe` no longer accepts `Array<Topic>`** — only `boolean` (default `true`). Migration: rely on hooks (`onMessage` / `waitMessage` derive their topics automatically). The remaining flag controls whether the per-TC adapter auto-subscribes to hook-derived topics.

- **`KafkaAdapterConfig.groupId` and `KafkaAdapterConfig.fromBeginning` removed.** Replaced by nested `defaultSubscribeParams: { groupId?, fromBeginning? }`. **`groupId` is now optional** — omit it and the framework auto-generates `testurio-${randomSuffix(8)}` per test case. Migration: `new KafkaAdapter({ brokers, groupId: 'x', fromBeginning: true })` → `new KafkaAdapter({ brokers, defaultSubscribeParams: { groupId: 'x', fromBeginning: true } })`.

- **`IMQSubscriberAdapter.startConsuming?()` removed from the interface.** Folded into `IMQSubscriberAdapter.subscribe(topic, params?)` — the first call activates the adapter's delivery loop. `IMQSubscriberAdapter.subscribe` and `unsubscribe` both widen to `string | string[]`.

- **Persistent / scenario-level Subscriber hooks removed.** `Subscriber.registerHook` now throws when `step.testCaseId === undefined` — that covers hooks registered outside a `testCase()` body AND hooks registered inside `scenario.init` / `scenario.stop` handlers. **There is no scenario-level subscription primitive in testurio.** Migration: move the hook into a `testCase()` body.

### Changed

- **CLI: `testurio generate` now reports every OpenAPI spec issue in one aggregated, location-tagged error.** Each broken field is listed with its JSON pointer in a single pass — no more fix-rerun-repeat against opaque messages.

- **`JsonCodec.encode` and `JsonCodec.decode` signatures widen to accept (and ignore) the optional dispatch-key argument.** No behaviour change; existing callers compile unchanged.

### Fixed

- **`@testurio/codec-protobuf` no longer crashes with `TypeError: protobuf.Root is not a constructor` under native Node ESM.** The codec imported protobufjs via `import * as protobuf`, whose namespace places the real CommonJS module on `.default` under Node's ESM loader (cjs-module-lexer doesn't detect protobufjs's dynamically-assigned `Root`). Switched to a default import (`import protobuf from "protobufjs"`), which resolves correctly across native ESM, the CJS build, and the bundled test runner.

- **Redis Pub/Sub subscriber no longer leaks a Redis connection per test case.** `RedisPubsubSubscriberAdapter.close()` now releases the connection it owns; previously each test case left one Redis client open until process exit.

- **Subscriber adapter errors and disconnects now fail only the originating test case.** Previously a single subscriber-side error failed the whole scenario and a single disconnect rejected every pending wait across every test case; now each test case runs on its own adapter and observes only its own failure.

- **CLI: YAML / JSON parse errors from `testurio generate` now include the file path and `line:column`.**

  ```
  error: Failed to parse YAML at ./api/openapi.yaml:15:1
    Missing closing "quote at line 15, column 1
  ```

- **CLI: Orval failures from `testurio generate` now surface Orval's own error message instead of a generic placeholder.** Pass `--verbose` for the full diagnostic.

## [0.6.5] - 2026-06-05

### Added

- **Testurio-native `expect()`** — Self-contained matcher API with zero dependencies on `jest`, `vitest`, or `chai`. Sync matchers only: `toBe`, `toEqual`, `toStrictEqual`, `toBeTruthy`, `toBeFalsy`, `toBeNull`, `toBeUndefined`, `toBeDefined`, `toBeGreaterThan(OrEqual)`, `toBeLessThan(OrEqual)`, `toBeCloseTo`, `toMatch`, `toContain`, `toMatchObject`, `toHaveLength`, `toHaveProperty`, plus `.not` negation on every matcher. Failure throws `ExpectAssertionError` whose `.message` is self-formatted with the matcher name, the user's source link (`at file:line:col`), an `Expected:`/`Received:` block, and (for collection matchers) a multi-line ANSI-colored `Diff:`.

  ```typescript
  import { expect } from "testurio";

  api.onResponse("getUser").assert((res) => {
    expect(res.code).toBe(200);              // no `return true;` needed
    expect(res.body).toMatchObject({ id: 1 });
  });
  ```

  Asymmetric matchers (`expect.any`), async chaining (`.resolves`/`.rejects`), snapshot, mock, and `expect.extend` are deliberately excluded from this MVP. The diff renderer emits ANSI codes unconditionally — reporters that don't render ANSI can strip via `replace(/\x1b\[\d+m/g, "")`.

### Fixed

- **Sync `Client`: fire-and-forget `request()` no longer leaks the request promise's rejection as a Node `unhandledRejection`**. Previously, when no `onResponse`/`waitResponse` step was registered for a request (or every matching hook lacked a `step`), `Client.executeRequest()` left the request promise unobserved.

- **`AllureReporter.includePayloads` now actually attaches request/response payloads**. Previously the option was effectively a no-op — `convertStep` read from `step.metadata` but no component, executor, or projection ever wrote to it. 
  
- **`AllureReporter` surfaces both `request` AND `response` on the same step** — `extractPayload` now collects every recognized payload key on `step.metadata` instead of returning only the first match. Server hook steps that stamp both keys now produce both parameter rows / both attachments.

- **Kafka `startConsuming` now awaits `GROUP_JOIN`** — `KafkaSubscriberAdapter.startConsuming()` previously called `consumer.run()` and resolved immediately, before the consumer had joined its group. With `fromBeginning: false`, a `.waitMessage(...)` step placed after the action that publishes would miss the message — the consumer joined hundreds of ms later, started fetching from `latest`, and the message at the pre-join offset was never delivered. The method now registers a one-shot `consumer.events.GROUP_JOIN` listener, calls `consumer.run()`, and only resolves after the listener fires (or rejects with `ConsumerJoinTimeoutError` if the configured timeout elapses). Idempotent — repeat calls early-return.

- **CLI: OpenAPI generator output is now a single unified `operations` artifact**. Previously the generator emitted three near-duplicate artifacts per spec (an `operations` map for types, a `{service}Schema` Protocol Schema bridge for runtime validation, and a hand-built `{Service}` interface). The duplication was the source of multiple drift bugs (case mismatch between emitters, body-less slots using different fallbacks, etc.). 
  
- **CLI: OpenAPI generator now includes all response status codes** The operations map's `response` field previously emitted only the first 2xx status, silently dropping every 4xx/5xx (and alternative 2xx) defined in the spec. Multi-response operations now emit `z.discriminatedUnion('code', [...])` with one `z.object({ code: z.literal(N), body: ... })` per status code, producing the inferred type `{ code: 200; body: ... } | { code: 400; body: never } | ...`. Single-response operations still use a plain `z.object(...)` (no union overhead).

- **CLI: OpenAPI generator body-less slots are now consistent and dual-mode compatible** Body-less request slots (e.g. `GET` operations) and body-less response slots (`204 No Content`, or no `2xx` defined) emit `body: z.never().optional()` uniformly across the generated output. The `.optional()` modifier is required for the schema to be usable at both runtime and design-time: at runtime, `parse({ method, path })` (the typical no-body shape) succeeds; at design-time, the inferred `body?: undefined` lets consumers omit the field. A stray body with content is still rejected (`expected never, received ...`). Without `.optional()` every body-less payload would fail auto-validation at runtime and refuse to compile at the consumer call site.

- **CLI: OpenAPI generator no longer skips operations missing `operationId`** Previously the generator logged a warning and dropped every operation without an explicit `operationId`, producing an empty schema for any spec that omits the optional field. The CLI now synthesizes a deterministic id from `{path + method}` (e.g. `GET /v1/accounts/{account-id}` → `v1getAccountsAccountId`) and applies it to the spec before both Orval and the parser run, so the two pipelines agree on naming. Explicit operationIds are preserved unchanged. Collisions hard-fail with both endpoints named in the error message.

## [0.6.4] - 2026-06-02

### Fixed

- **MQ adapters: binary codec payloads no longer corrupted** All three MQ subscribers (Kafka, RabbitMQ, Redis Pub/Sub) previously called `.toString()` on the raw payload before invoking `codec.decode(...)`, which UTF-8-stringified non-text bytes and silently broke any binary codec (protobuf, msgpack, Avro). The Redis Pub/Sub publisher had the symmetric bug on the encode side. Adapters now pass raw transport bytes directly to the codec; text/binary normalization is the codec's responsibility.


## [0.6.3] - 2026-06-01

### Added

- **Step Polling / Retry** — Step-level `.retry(predicate, timeoutMs | options)` modifier on `Client.request(...)` (HTTP / gRPC unary) and `DataSource.exec(...)`. Retry-while semantics: predicate returns `true` to keep retrying, `false` to stop. Three call forms: `.retry(pred)`, `.retry(pred, timeoutMs)`, `.retry(pred, { timeout, interval, retryOnError })`. Defaults: `timeout = 5000 ms`, `interval = 1000 ms`, `retryOnError = true`. Throws `RetryTimeoutError` carrying `attempts`, `elapsedMs`, `lastResult`, and `lastError` when the overall timeout elapses.
  ```typescript
  api.request('getStatus', { method: 'GET', path: '/status' })
     .retry((res) => res.body.ready === false, 3000);

  ds.exec('wait for row', (c) => c.query<Row>({ query: 'SELECT * FROM t' }))
    .retry((rows) => rows.length === 0)
    .assert('row exists', (rows) => rows.length > 0);
  ```
  New exported types: `RetryPredicate<T>`, `RetryOptions`, `RetryPolicy<T>`, `RetryTimeoutError`, `TimeoutError`. Data factories on `request(...)` and exec callbacks re-resolve on every attempt; `onResponse`/`waitResponse` hooks (sync client) and chained handlers (DataSource) only see the terminal result.

- **ClickHouse DataSource adapter** — New `@testurio/adapter-clickhouse` package exposing a thin `query`/`insert`/`command`/`ping`/`raw` wrapper over the official `@clickhouse/client` HTTP client. Lifecycle managed by `TestScenario`

- **Wait Event Correlation** — Parallel send + filtered wait pattern for async components. Send multiple messages and correlate responses using matchers, regardless of arrival order:
  ```typescript
  api.sendMessage('new_order', { price: 1.9, amount: 4000 });
  api.sendMessage('new_order', { price: 0.99, amount: 7000 });
  api.waitEvent('order_confirm', { matcher: (r) => r.price === 1.9 }).assert(...);
  api.waitEvent('order_confirm', { matcher: (r) => r.price === 0.99 }).assert(...);
  ```
  Works for both `AsyncClient.waitEvent()` and `AsyncServer.waitMessage()`.

- **AsyncServer `waitEvent()`** — Added strict `waitEvent()` step to `AsyncServer` for proxy mode. This is the strict counterpart to `onEvent()`: it blocks until a matching backend event arrives and throws a strict ordering violation if the event arrives before the step starts. Supports the full handler chain (assert, transform, proxy, drop, timeout, matcher).

- **Factory Step Parameters** — Action step methods now accept `T | (() => T)` factory functions in addition to static values. This allows step parameters to be resolved at execution time, enabling multi-step flows where data from one step (e.g., a token or session ID) is used by a later step.
  - `client.request('getProfile', () => ({ method: 'GET', path: '/profile', headers: { Authorization: `Bearer ${token}` } }))`
  - `ws.sendMessage('join', () => ({ room: 'general', sessionId }))`
  - `server.sendEvent('conn', 'authResult', () => ({ success: true, sessionId: extractedId }))`
  - `publisher.publish('orders', () => ({ orderId, status: 'confirmed' }))`
  - New exported types: `ValueOrFactory<T>`, `resolveValue<T>()`

### Fixed

- **AsyncServer `validate()` direction** — `onEvent().validate()` now correctly uses `"serverMessage"` direction for schema lookup instead of hardcoded `"clientMessage"`. Previously, event validation would fail with "No schema registered" or validate against the wrong schema.

- **Hook matching skips resolved hooks** — `findMatchingHook` and `findMatchingHookWithConnection` now skip already-resolved hooks. Previously, when two hooks matched the same message type, the second event would re-match the first (already-resolved) hook instead of routing to the second. This fix enables correct FIFO ordering for same-type waits.

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
