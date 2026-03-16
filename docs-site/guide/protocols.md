# Protocols

Protocols are stateless adapter factories. They define how to create server and client adapters for a specific communication protocol. Components own the adapters and manage their lifecycle.

## Built-in: HTTP Protocol

The HTTP protocol is included in the core `testurio` package. It uses an Express-based server adapter and a `fetch`-based client adapter.

```typescript
import { HttpProtocol } from 'testurio';

// Loose mode
const protocol = new HttpProtocol();

// Explicit generic mode
const protocol = new HttpProtocol<UserApi>();

// Schema-first mode
const protocol = new HttpProtocol({ schema: userApiSchema });
```

Used with `Client` and `Server` components.

## gRPC Protocol

The `@testurio/protocol-grpc` package provides two protocol classes:

### GrpcUnaryProtocol

For synchronous unary RPC calls. Used with `Client` and `Server`.

```typescript
import { GrpcUnaryProtocol } from '@testurio/protocol-grpc';

const protocol = new GrpcUnaryProtocol({
  protoPath: 'user.proto',
  serviceName: 'UserService',
});

// With schema-first mode
const protocol = new GrpcUnaryProtocol({
  protoPath: 'user.proto',
  serviceName: 'UserService',
  schema: userServiceSchema,
});
```

**Options:**
- `protoPath` — Path to the `.proto` file
- `serviceName` — Name of the gRPC service
- `schema` — _(optional)_ Zod schemas for runtime validation

### GrpcStreamProtocol

For bidirectional streaming RPCs. Used with `AsyncClient` and `AsyncServer`.

```typescript
import { GrpcStreamProtocol } from '@testurio/protocol-grpc';

const protocol = new GrpcStreamProtocol({
  protoPath: 'chat.proto',
  serviceName: 'ChatService',
});
```

**Options:**
- `protoPath` — Path to the `.proto` file
- `serviceName` — Name of the gRPC service
- `schema` — _(optional)_ Zod schemas for runtime validation

## WebSocket Protocol

The `@testurio/protocol-ws` package provides the `WebSocketProtocol` class for bidirectional WebSocket messaging. Used with `AsyncClient` and `AsyncServer`.

```typescript
import { WebSocketProtocol } from '@testurio/protocol-ws';

const protocol = new WebSocketProtocol<ChatService>();

// With custom codec
import { JsonCodec } from 'testurio';

const protocol = new WebSocketProtocol<ChatService>({
  codec: new JsonCodec(),
});
```

**Options:**
- `codec` — _(optional)_ Message codec for encoding/decoding (defaults to JSON)
- `schema` — _(optional)_ Zod schemas for runtime validation

### Async Service Definition

```typescript
interface ChatService {
  clientMessages: {
    join: { roomId: string; userId: string };
    message: { text: string };
  };
  serverMessages: {
    joined: { roomId: string; success: boolean };
    message: { userId: string; text: string };
  };
}
```

## TCP Protocol

The `@testurio/protocol-tcp` package provides the `TcpProtocol` class for custom TCP protocols. Used with `AsyncClient` and `AsyncServer`.

```typescript
import { TcpProtocol } from '@testurio/protocol-tcp';

const protocol = new TcpProtocol<MyTcpService>();

// With binary codec (requires length-prefixed framing)
const protocol = new TcpProtocol<MyTcpService>({
  codec: myBinaryCodec,
  lengthFieldLength: 4,  // Required for binary codecs
});
```

**Options:**
- `codec` — _(optional)_ Message codec (defaults to JSON)
- `lengthFieldLength` — _(optional)_ Length field size in bytes for binary framing
- `schema` — _(optional)_ Zod schemas for runtime validation

## Protocol Comparison

| Protocol | Type | Package | Transport | Use Case |
|----------|------|---------|-----------|----------|
| `HttpProtocol` | Sync | `testurio` | HTTP/1.1 | REST APIs |
| `GrpcUnaryProtocol` | Sync | `@testurio/protocol-grpc` | HTTP/2 | gRPC unary calls |
| `GrpcStreamProtocol` | Async | `@testurio/protocol-grpc` | HTTP/2 | gRPC bidirectional streaming |
| `WebSocketProtocol` | Async | `@testurio/protocol-ws` | WebSocket | Real-time bidirectional messaging |
| `TcpProtocol` | Async | `@testurio/protocol-tcp` | Raw TCP | Custom binary/text protocols |

## Address Configuration

All protocols use the same `Address` type:

```typescript
interface Address {
  host: string;
  port: number;
  path?: string;  // Used by WebSocket and HTTP
}
```

## Custom Codecs

WebSocket and TCP protocols support custom codecs for message serialization:

```typescript
import { JsonCodec } from 'testurio';

// JSON with custom date handling
const codec = new JsonCodec({
  reviver: (key, value) => {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return new Date(value);
    }
    return value;
  },
});
```

See [Custom Codecs](/advanced/custom-codec) for implementing your own codec.
