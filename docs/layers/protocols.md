# Protocol Layer

**Location:** `packages/core/src/protocols/`, `packages/protocol-*/`

Protocols are stateless adapter factories. They create server and client adapters but hold no state themselves. Components own the adapters created by protocols.

## Protocol Interfaces

### ISyncProtocol

For request/response protocols (HTTP, gRPC Unary):

```typescript
interface ISyncProtocol<M extends SyncOperations> {
  readonly type: string;
  readonly $types: M;
  createServer(config: ServerProtocolConfig): Promise<ISyncServerAdapter>;
  createClient(config: ClientProtocolConfig): Promise<ISyncClientAdapter>;
  createMessageTypeMatcher?(messageType: string, payload: unknown): MessageMatcher | string;
}
```

### IAsyncProtocol

For bidirectional/streaming protocols (WebSocket, TCP, gRPC Stream):

```typescript
interface IAsyncProtocol<M extends AsyncMessages> {
  readonly type: string;
  readonly $types: M;
  createServer(config: ServerProtocolConfig): Promise<IAsyncServerAdapter>;
  createClient(config: ClientProtocolConfig): Promise<IAsyncClientAdapter>;
}
```

### IMQAdapter

For message queue integrations (Kafka, RabbitMQ, Redis Pub/Sub):

```typescript
interface IMQAdapter<TMessage, TOptions, TBatchMessage> {
  readonly type: string;
  createPublisher(codec: Codec): Promise<IMQPublisherAdapter<TOptions, TBatchMessage>>;
  createSubscriber(codec: Codec): Promise<IMQSubscriberAdapter<TMessage>>;
  dispose(): Promise<void>;
}
```

### IDataSourceAdapter

For data store integrations (Redis, PostgreSQL, MongoDB):

```typescript
interface IDataSourceAdapter<TClient> {
  readonly type: string;
  connect(): Promise<void>;
  getClient(): TClient;
  disconnect(): Promise<void>;
}
```

## Implemented Protocols

| Protocol         | Package                      | Type       | Adapter                                  |
| ---------------- | ---------------------------- | ---------- | ---------------------------------------- |
| HTTP             | `packages/core` (built-in)   | Sync       | Express-based server, fetch-based client |
| gRPC Unary       | `@testurio/protocol-grpc`    | Sync       | @grpc/grpc-js                            |
| gRPC Stream      | `@testurio/protocol-grpc`    | Async      | @grpc/grpc-js                            |
| WebSocket        | `@testurio/protocol-ws`      | Async      | ws library                               |
| TCP              | `@testurio/protocol-tcp`     | Async      | Node.js net module                       |
| Kafka            | `@testurio/adapter-kafka`    | MQ         | kafkajs                                  |
| RabbitMQ         | `@testurio/adapter-rabbitmq` | MQ         | amqplib                                  |
| Redis Pub/Sub    | `@testurio/adapter-redis`    | MQ         | ioredis                                  |
| Redis DataSource | `@testurio/adapter-redis`    | DataSource | ioredis                                  |
| PostgreSQL       | `@testurio/adapter-pg`       | DataSource | pg                                       |
| MongoDB          | `@testurio/adapter-mongo`    | DataSource | mongodb                                  |

## Protocol Configuration

```typescript
interface ServerProtocolConfig {
  listenAddress: Address;
  targetAddress?: Address;  // For proxy mode
}

interface ClientProtocolConfig {
  targetAddress: Address;
}

interface Address {
  host: string;
  port: number;
  path?: string;  // For WebSocket, HTTP
}
```

## Codec System

Message queue adapters use codecs for serialization:

```typescript
interface Codec {
  encode(data: unknown): Buffer;
  decode(data: Buffer): unknown;
}
```

The built-in `JsonCodec` handles JSON serialization. Custom codecs can be implemented for other formats.

## Creating a New Protocol

To add a new protocol:

1. Implement the appropriate adapter interfaces (`ISyncServerAdapter`/`ISyncClientAdapter` or `IAsyncServerAdapter`/`IAsyncClientAdapter`)
2. Create a protocol class implementing `ISyncProtocol` or `IAsyncProtocol`
3. The protocol's `createServer()` and `createClient()` methods instantiate the adapters
4. Package as a separate `@testurio/protocol-*` package
