# gRPC Protocol (`@testurio/protocol-grpc`)

**Location:** `packages/protocol-grpc/`

Provides gRPC support for Testurio with both unary (request/response) and streaming (bidirectional) modes.

## Protocols

### GrpcUnaryProtocol (Sync)

For gRPC unary calls. Used with `Client` and `Server` components.

```typescript
import { GrpcUnaryProtocol } from '@testurio/protocol-grpc';

const client = new Client('grpc-api', {
  protocol: new GrpcUnaryProtocol<MyGrpcService>({
    protoPath: './proto/service.proto',
    packageName: 'mypackage',
    serviceName: 'MyService',
  }),
  targetAddress: { host: 'localhost', port: 50051 },
});
```

### GrpcStreamProtocol (Async)

For gRPC bidirectional streaming. Used with `AsyncClient` and `AsyncServer` components.

```typescript
import { GrpcStreamProtocol } from '@testurio/protocol-grpc';

const client = new AsyncClient('stream', {
  protocol: new GrpcStreamProtocol<MyStreamService>({
    protoPath: './proto/stream.proto',
    packageName: 'mypackage',
    serviceName: 'StreamService',
  }),
  targetAddress: { host: 'localhost', port: 50051 },
});
```

## Configuration

| Option | Type | Description |
|--------|------|-------------|
| `protoPath` | `string` | Path to the `.proto` file |
| `packageName` | `string` | Protobuf package name |
| `serviceName` | `string` | gRPC service name |

## Type System

Supports both loose and strict typing modes:

```typescript
// Loose mode - any method name accepted
new GrpcUnaryProtocol({ protoPath: '...', packageName: '...', serviceName: '...' });

// Strict mode - only defined methods accepted
type MyService = {
  GetUser: {
    request: { id: string };
    response: { name: string; email: string };
  };
};
new GrpcUnaryProtocol<MyService>({ ... });
```

## Dependencies

- `@grpc/grpc-js` - gRPC client/server implementation
- `@grpc/proto-loader` - Protocol buffer loading
