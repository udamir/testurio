# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2025-02-15

### Added

- **Custom Codec Support** for WebSocket and TCP protocols
  - New `Codec` interface for message encoding/decoding (`packages/core/src/protocols/base/codec.types.ts`)
  - `JsonCodec` - Default JSON codec with reviver/replacer support (`packages/core/src/protocols/base/json.codec.ts`)
  - `CodecError` - Dedicated error class for codec failures
  - `codec` option in `WsProtocolOptions` and `TcpProtocolOptions`
  - Example codecs: MessagePackCodec, ProtobufCodec (`examples/custom-codecs/`)

### Changed

- WebSocket adapters now use configurable codec instead of hardcoded JSON
- TCP adapters now use configurable codec instead of hardcoded JSON

### Documentation

- Added Custom Codecs section to README.md
- Added Codec Layer section to ARCHITECTURE.md
- Created examples/custom-codecs/ with MessagePack and Protobuf examples

## [0.3.1] - 2025-01-19

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

## [0.3.0] - 2025-01-09

### Added

- Flexible Protocol Types feature
  - Loose mode: Accept any string as message type
  - Strict mode: Constrain to defined operation IDs
- DataSource component for database/cache integration
- Redis, PostgreSQL, MongoDB adapters

### Changed

- Protocol type system refactored for better type inference

## [0.2.0] - 2025-01-08

### Added

- gRPC streaming support (`GrpcStreamProtocol`)
- TCP protocol (`TcpProtocol`)
- WebSocket protocol (`WebSocketProtocol`)
- Proxy mode for Server and AsyncServer components

## [0.1.0] - 2025-01-07

### Added

- Initial release
- HTTP protocol support
- gRPC unary protocol support
- Client/Server components
- AsyncClient/AsyncServer components
- TestScenario and testCase APIs
- Hook system for message interception
