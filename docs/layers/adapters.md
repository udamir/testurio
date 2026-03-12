# Adapter Layer

**Location:** Protocol and adapter packages

Adapters handle protocol-specific I/O operations. They are created by protocols/adapters and owned by components.

## Sync Adapters

### ISyncServerAdapter

Handles incoming synchronous requests:

```typescript
interface ISyncServerAdapter {
  onRequest<TReq, TRes>(
    handler: (messageType: string, request: TReq) => Promise<TRes | null>
  ): void;
  stop(): Promise<void>;
}
```

### ISyncClientAdapter

Sends synchronous requests:

```typescript
interface ISyncClientAdapter {
  request<TReq, TRes>(
    messageType: string,
    data: TReq,
    timeout?: number
  ): Promise<TRes>;
  close(): Promise<void>;
}
```

## Async Adapters

### IAsyncServerAdapter

Handles persistent connections:

```typescript
interface IAsyncServerAdapter {
  onConnection(handler: (connection: IAsyncClientAdapter) => void): void;
  stop(): Promise<void>;
}
```

### IAsyncClientAdapter

Bidirectional messaging over persistent connections:

```typescript
interface IAsyncClientAdapter<TContext = unknown> {
  readonly id: string;
  readonly context?: TContext;
  readonly isConnected: boolean;
  send(message: Message): Promise<void>;
  close(): Promise<void>;
  onMessage(handler: (message: Message) => void): void;
  onClose(handler: () => void): void;
  onError(handler: (error: Error) => void): void;
}
```

## Message Queue Adapters

### IMQPublisherAdapter

Publishes messages to topics:

```typescript
interface IMQPublisherAdapter<TOptions, TBatchMessage> {
  readonly isConnected: boolean;
  publish(topic: string, payload: unknown, options?: TOptions): Promise<void>;
  publishBatch(topic: string, messages: TBatchMessage[]): Promise<void>;
  close(): Promise<void>;
}
```

### IMQSubscriberAdapter

Subscribes to messages from topics:

```typescript
interface IMQSubscriberAdapter<TMessage> {
  readonly id: string;
  readonly isConnected: boolean;
  subscribe(topic: string): Promise<void>;
  unsubscribe(topic: string): Promise<void>;
  getSubscribedTopics(): string[];
  onMessage(handler: (topic: string, message: TMessage) => void): void;
  onError(handler: (error: Error) => void): void;
  onDisconnect(handler: () => void): void;
  close(): Promise<void>;
  startConsuming?(): Promise<void>;
}
```

## DataSource Adapters

### IDataSourceAdapter

Direct SDK access to data stores:

```typescript
interface IDataSourceAdapter<TClient> {
  readonly type: string;
  connect(): Promise<void>;
  getClient(): TClient;
  disconnect(): Promise<void>;
}
```

## Implemented Adapters

### Sync Protocol Adapters

| Adapter           | Package                  | Technology    |
| ----------------- | ------------------------ | ------------- |
| HTTP Server       | `packages/core`          | Express       |
| HTTP Client       | `packages/core`          | Node fetch    |
| gRPC Unary Server | `packages/protocol-grpc` | @grpc/grpc-js |
| gRPC Unary Client | `packages/protocol-grpc` | @grpc/grpc-js |

### Async Protocol Adapters

| Adapter            | Package                  | Technology    |
| ------------------ | ------------------------ | ------------- |
| WebSocket Server   | `packages/protocol-ws`   | ws            |
| WebSocket Client   | `packages/protocol-ws`   | ws            |
| TCP Server         | `packages/protocol-tcp`  | Node.js net   |
| TCP Client         | `packages/protocol-tcp`  | Node.js net   |
| gRPC Stream Server | `packages/protocol-grpc` | @grpc/grpc-js |
| gRPC Stream Client | `packages/protocol-grpc` | @grpc/grpc-js |

### Message Queue Adapters

| Adapter       | Package                     | Technology |
| ------------- | --------------------------- | ---------- |
| Kafka         | `packages/adapter-kafka`    | kafkajs    |
| RabbitMQ      | `packages/adapter-rabbitmq` | amqplib    |
| Redis Pub/Sub | `packages/adapter-redis`    | ioredis    |

### DataSource Adapters

| Adapter    | Package                  | Technology |
| ---------- | ------------------------ | ---------- |
| Redis      | `packages/adapter-redis` | ioredis    |
| PostgreSQL | `packages/adapter-pg`    | pg         |
| MongoDB    | `packages/adapter-mongo` | mongodb    |
