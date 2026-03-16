# gRPC Examples

Practical examples for testing gRPC services with Testurio.

## Unary RPC

```typescript
import { Client, Server, TestScenario, testCase } from 'testurio';
import { GrpcUnaryProtocol } from '@testurio/protocol-grpc';

interface UserService {
  GetUser: {
    request: { user_id: number };
    response: { id: number; name: string; email: string };
  };
  CreateUser: {
    request: { name: string; email: string };
    response: { id: number; name: string; email: string };
  };
}

const PROTO_PATH = 'proto/user-service.proto';
const SERVICE_NAME = 'user.v1.UserService';

const grpcServer = new Server('grpc-backend', {
  protocol: new GrpcUnaryProtocol<UserService>({
    protoPath: PROTO_PATH,
    serviceName: SERVICE_NAME,
  }),
  listenAddress: { host: 'localhost', port: 50051 },
});

const grpcClient = new Client('grpc-client', {
  protocol: new GrpcUnaryProtocol<UserService>({
    protoPath: PROTO_PATH,
    serviceName: SERVICE_NAME,
  }),
  targetAddress: { host: 'localhost', port: 50051 },
});

const scenario = new TestScenario({
  name: 'User gRPC Service',
  components: [grpcServer, grpcClient],
});
```

### Get User

```typescript
const tc = testCase('Get user by ID', (test) => {
  const client = test.use(grpcClient);
  const server = test.use(grpcServer);

  server.onRequest('GetUser', { user_id: 1 }).mockResponse(() => ({
    id: 1,
    name: 'Alice',
    email: 'alice@example.com',
  }));

  client.request('GetUser', { user_id: 1 });

  client.onResponse('GetUser').assert((res) => {
    return res.id === 1 && res.name === 'Alice';
  });
});
```

### Create User

```typescript
const tc = testCase('Create new user', (test) => {
  const client = test.use(grpcClient);
  const server = test.use(grpcServer);

  server.onRequest('CreateUser').mockResponse((req) => ({
    id: 100,
    name: req.name ?? 'Unknown',
    email: req.email ?? 'unknown@example.com',
  }));

  client.request('CreateUser', { name: 'Bob', email: 'bob@example.com' });

  client.onResponse('CreateUser').assert((res) => {
    return res.name === 'Bob' && res.email === 'bob@example.com';
  });
});
```

### Shared Mock Responses with `init()`

```typescript
scenario.init((test) => {
  const server = test.use(grpcServer);

  server.onRequest('GetUser', { user_id: 1 }).mockResponse(() => ({
    id: 1,
    name: 'Alice',
    email: 'alice@example.com',
  }));

  server.onRequest('CreateUser').mockResponse((req) => ({
    id: 100,
    name: req.name ?? 'Unknown',
    email: req.email ?? 'unknown@example.com',
  }));
});

// Test cases use the shared mocks
const tc = testCase('Get user by ID', (test) => {
  const client = test.use(grpcClient);

  client.request('GetUser', { user_id: 1 });
  client.onResponse('GetUser').assert((res) => res.name === 'Alice');
});
```

## Bidirectional Streaming

```typescript
import { AsyncClient, AsyncServer, TestScenario, testCase } from 'testurio';
import { GrpcStreamProtocol } from '@testurio/protocol-grpc';

interface ChatStream {
  clientMessages: {
    ChatMessage: { userId: string; text: string };
  };
  serverMessages: {
    ChatMessage: { userId: string; text: string; timestamp: number };
    SystemMessage: { text: string };
  };
}

const streamServer = new AsyncServer('chat-server', {
  protocol: new GrpcStreamProtocol<ChatStream>({
    protoPath: 'proto/chat.proto',
    serviceName: 'chat.v1.ChatService',
    methodName: 'Chat',
  }),
  listenAddress: { host: 'localhost', port: 50052 },
});

const streamClient = new AsyncClient('chat-client', {
  protocol: new GrpcStreamProtocol<ChatStream>({
    protoPath: 'proto/chat.proto',
    serviceName: 'chat.v1.ChatService',
    methodName: 'Chat',
  }),
  targetAddress: { host: 'localhost', port: 50052 },
});

const tc = testCase('Chat stream', (test) => {
  const client = test.use(streamClient);
  const server = test.use(streamServer);

  server.onMessage('ChatMessage').mockEvent('ChatMessage', (payload) => ({
    userId: payload.userId,
    text: `Echo: ${payload.text}`,
    timestamp: Date.now(),
  }));

  client.sendMessage('ChatMessage', { userId: 'alice', text: 'Hello!' });

  client.waitEvent('ChatMessage').timeout(2000).assert((msg) => {
    return msg.text.includes('Echo:');
  });
});
```

## Schema-First gRPC

```bash
testurio generate user-service.proto -o ./generated/user-service.schema.ts
```

```typescript
import { userServiceSchema } from './generated/user-service.schema';

const grpcServer = new Server('grpc-backend', {
  protocol: new GrpcUnaryProtocol({
    protoPath: PROTO_PATH,
    serviceName: SERVICE_NAME,
    schema: userServiceSchema,
  }),
  listenAddress: { host: 'localhost', port: 50051 },
});
```
