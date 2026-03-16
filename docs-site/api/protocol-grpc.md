# @testurio/protocol-grpc

gRPC protocol support for Testurio with unary (request/response) and streaming (bidirectional) modes.

```bash
npm install @testurio/protocol-grpc --save-dev
```

**Peer dependency:** `@grpc/grpc-js`, `@grpc/proto-loader`

## GrpcUnaryProtocol

Synchronous gRPC unary calls. Used with `Client` and `Server` components.

```typescript
import { GrpcUnaryProtocol } from '@testurio/protocol-grpc';

const protocol = new GrpcUnaryProtocol({
  protoPath: './proto/user.proto',
  packageName: 'user',
  serviceName: 'UserService',
});
```

### Constructor Options

| Option | Type | Description |
|--------|------|-------------|
| `protoPath` | `string` | Path to the `.proto` file |
| `packageName` | `string` | Protobuf package name |
| `serviceName` | `string` | gRPC service name |
| `schema` | `SyncSchemaInput` | _(optional)_ Zod schemas for runtime validation |

### Usage

```typescript
const client = new Client('grpc', {
  protocol: new GrpcUnaryProtocol<MyService>({
    protoPath: './proto/user.proto',
    packageName: 'user',
    serviceName: 'UserService',
  }),
  targetAddress: { host: 'localhost', port: 50051 },
});

const server = new Server('grpc-mock', {
  protocol: new GrpcUnaryProtocol<MyService>({
    protoPath: './proto/user.proto',
    packageName: 'user',
    serviceName: 'UserService',
  }),
  listenAddress: { host: 'localhost', port: 50051 },
});
```

### Type Definition

```typescript
interface UserService {
  GetUser: {
    request: { user_id: number };
    response: { user_id: number; name: string; email: string };
  };
  CreateUser: {
    request: { name: string; email: string };
    response: { user_id: number; name: string; email: string };
  };
}
```

## GrpcStreamProtocol

Bidirectional gRPC streaming. Used with `AsyncClient` and `AsyncServer` components.

```typescript
import { GrpcStreamProtocol } from '@testurio/protocol-grpc';

const protocol = new GrpcStreamProtocol({
  protoPath: './proto/chat.proto',
  packageName: 'chat',
  serviceName: 'ChatService',
});
```

### Constructor Options

| Option | Type | Description |
|--------|------|-------------|
| `protoPath` | `string` | Path to the `.proto` file |
| `packageName` | `string` | Protobuf package name |
| `serviceName` | `string` | gRPC service name |
| `schema` | `AsyncSchemaInput` | _(optional)_ Zod schemas for runtime validation |

### Usage

```typescript
const client = new AsyncClient('stream', {
  protocol: new GrpcStreamProtocol<ChatMessages>({
    protoPath: './proto/chat.proto',
    packageName: 'chat',
    serviceName: 'ChatService',
  }),
  targetAddress: { host: 'localhost', port: 50051 },
});
```

## Typing Modes

```typescript
// Loose — any method name accepted
new GrpcUnaryProtocol({ protoPath: '...', packageName: '...', serviceName: '...' });

// Explicit generic — only defined methods accepted
new GrpcUnaryProtocol<UserService>({ ... });

// Schema-first — types inferred, runtime validation
new GrpcUnaryProtocol({ ..., schema: userServiceSchema });
```
