# @testurio/protocol-grpc

gRPC protocol adapter for [Testurio](https://github.com/udamir/testurio) - supports both unary and streaming RPCs.

## Installation

```bash
npm install @testurio/protocol-grpc
```

## Usage

### Unary gRPC

```typescript
import { TestScenario, testCase, Server, Client } from 'testurio';
import { GrpcUnaryProtocol } from '@testurio/protocol-grpc';

const grpcClient = new Client('api', {
  protocol: new GrpcUnaryProtocol({ schema: 'user.proto', serviceName: 'UserService' }),
  targetAddress: { host: 'localhost', port: 5000 },
});

const grpcServer = new Server('backend', {
  protocol: new GrpcUnaryProtocol({ schema: 'user.proto' }),
  listenAddress: { host: 'localhost', port: 5000 },
});

const scenario = new TestScenario({
  name: 'gRPC User Service Test',
  components: [grpcServer, grpcClient],
});

const tc = testCase('GetUser RPC', (test) => {
  const api = test.use(grpcClient);
  const backend = test.use(grpcServer);

  api.request('GetUser', { user_id: 42 });

  backend.onRequest('GetUser').mockResponse((req) => ({
    code: 200,
    body: { user_id: req.user_id, name: 'John Doe' },
  }));

  api.onResponse('GetUser').assert((res) => res.body.name === 'John Doe');
});
```

### Streaming gRPC

```typescript
import { AsyncClient, AsyncServer } from 'testurio';
import { GrpcStreamProtocol } from '@testurio/protocol-grpc';

const streamClient = new AsyncClient('stream', {
  protocol: new GrpcStreamProtocol({ schema: 'chat.proto', serviceName: 'ChatService' }),
  targetAddress: { host: 'localhost', port: 5001 },
});

const streamServer = new AsyncServer('backend', {
  protocol: new GrpcStreamProtocol({ schema: 'chat.proto' }),
  listenAddress: { host: 'localhost', port: 5001 },
});
```

## Protocols

| Protocol             | Type  | Use Case                     |
| -------------------- | ----- | ---------------------------- |
| `GrpcUnaryProtocol`  | Sync  | gRPC unary calls             |
| `GrpcStreamProtocol` | Async | gRPC bidirectional streaming |

## License

MIT
