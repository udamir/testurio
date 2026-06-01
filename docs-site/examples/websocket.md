# WebSocket Examples

Practical examples for testing WebSocket services with Testurio.

## Setup

```typescript
import { AsyncClient, AsyncServer, TestScenario, testCase } from 'testurio';
import { WebSocketProtocol } from '@testurio/protocol-ws';

interface ChatService {
  clientMessages: {
    join: { roomId: string; userId: string };
    message: { userId: string; text: string; timestamp: number };
    leave: { userId: string };
  };
  serverMessages: {
    joined: { roomId: string; userId: string; success: boolean };
    message: { userId: string; text: string; timestamp: number };
    userLeft: { userId: string };
    error: { code: number; message: string };
  };
}

const server = new AsyncServer('chat-backend', {
  protocol: new WebSocketProtocol<ChatService>(),
  listenAddress: { host: 'localhost', port: 8080 },
});

const client = new AsyncClient('chat-client', {
  protocol: new WebSocketProtocol<ChatService>(),
  targetAddress: { host: 'localhost', port: 8080 },
});

const scenario = new TestScenario({
  name: 'Chat WebSocket API',
  components: [server, client],
});
```

## Type-Safe Service Definition

The `ChatService` interface above splits messages into `clientMessages` (what the client sends) and `serverMessages` (what the server sends back). The compiler then enforces the direction of every step — you can't accidentally call `sendMessage('joined', ...)` from the client, and you can't `waitEvent('join')` on a client-only message.

```typescript
const ws   = test.use(client);
const mock = test.use(server);

// ✗ 'joined' is a server message — the client can't send it
ws.sendMessage('joined', { roomId: 'general', userId: 'alice', success: true });

// ✗ 'join' is a client message — the client doesn't receive it
ws.waitEvent('join');

// ✗ Missing required field
ws.sendMessage('join', { roomId: 'general' });
//                     ^^^^^^^^^^^^^^^^^^^^^ userId is required

// ✓ All directions and shapes match the definition
ws.sendMessage('join', { roomId: 'general', userId: 'alice' });
ws.waitEvent('joined').assert((msg) => msg.success);
```

On the server side the same definition flips: `onMessage` covers `clientMessages`, `mockEvent` / `sendEvent` / `broadcast` cover `serverMessages`. The mock callback receives the typed client payload and must return a typed server payload:

```typescript
mock.onMessage('join').mockEvent('joined', (msg) => ({
  roomId: msg.roomId,
  //          ^^^^^^ inferred from clientMessages.join
  userId: msg.userId,
  success: true,
  //  ^^^^^^^^^^^^^ required by serverMessages.joined
}));
```

See the [Type Safety guide](/guide/type-safety) for matchers, factories, and schema-first inference.

## Join a Room

```typescript
const tc = testCase('Join chat room', (test) => {
  const ws = test.use(client);
  const mock = test.use(server);

  // Server responds to join requests
  mock.onMessage('join').mockEvent('joined', (payload) => ({
    roomId: payload.roomId,
    userId: payload.userId,
    success: true,
  }));

  // Client sends join message
  ws.sendMessage('join', { roomId: 'general', userId: 'alice' });

  // Wait for confirmation
  ws.waitEvent('joined').timeout(2000).assert((msg) => {
    return msg.roomId === 'general' && msg.success === true;
  });
});
```

## Send and Receive Messages

```typescript
const tc = testCase('Message exchange', (test) => {
  const ws = test.use(client);
  const mock = test.use(server);

  // Server echoes messages
  mock.onMessage('message').mockEvent('message', (payload) => ({
    userId: payload.userId,
    text: `Echo: ${payload.text}`,
    timestamp: Date.now(),
  }));

  // Client sends message
  ws.sendMessage('message', {
    userId: 'alice',
    text: 'Hello, world!',
    timestamp: Date.now(),
  });

  // Verify echo
  ws.waitEvent('message').timeout(2000).assert((msg) => {
    return msg.text.includes('Echo:') && msg.text.includes('Hello');
  });
});
```

## Error Handling

```typescript
const tc = testCase('Handle server errors', (test) => {
  const ws = test.use(client);
  const mock = test.use(server);

  mock.onMessage('join').mockEvent('error', () => ({
    code: 404,
    message: 'Room not found',
  }));

  ws.sendMessage('join', { roomId: 'invalid-room', userId: 'bob' });

  ws.waitEvent('error').timeout(2000).assert((msg) => msg.code === 404);
});
```

## Multiple Clients

```typescript
const client1 = new AsyncClient('user-1', {
  protocol: new WebSocketProtocol<ChatService>(),
  targetAddress: { host: 'localhost', port: 8080 },
});

const client2 = new AsyncClient('user-2', {
  protocol: new WebSocketProtocol<ChatService>(),
  targetAddress: { host: 'localhost', port: 8080 },
});

const scenario = new TestScenario({
  name: 'Multi-client Chat',
  components: [server, client1, client2],
});

const tc = testCase('Two users exchange messages', (test) => {
  const user1 = test.use(client1);
  const user2 = test.use(client2);
  const mock = test.use(server);

  mock.onMessage('message').mockEvent('message', (payload) => ({
    userId: payload.userId,
    text: payload.text,
    timestamp: Date.now(),
  }));

  user1.sendMessage('message', {
    userId: 'alice',
    text: 'Hello Bob!',
    timestamp: Date.now(),
  });

  user2.waitEvent('message').timeout(2000).assert((msg) => {
    return msg.userId === 'alice' && msg.text === 'Hello Bob!';
  });
});
```

## Custom Path

```typescript
const server = new AsyncServer('ws-backend', {
  protocol: new WebSocketProtocol<ChatService>(),
  listenAddress: { host: 'localhost', port: 8080, path: '/ws/chat' },
});

const client = new AsyncClient('ws-client', {
  protocol: new WebSocketProtocol<ChatService>(),
  targetAddress: { host: 'localhost', port: 8080, path: '/ws/chat' },
});
```
