# WebSocket Protocol (`@testurio/protocol-ws`)

**Location:** `packages/protocol-ws/`

Provides WebSocket support for Testurio. Used with `AsyncClient` and `AsyncServer` components.

## Usage

```typescript
import { WebSocketProtocol } from '@testurio/protocol-ws';

const client = new AsyncClient('ws', {
  protocol: new WebSocketProtocol<MyMessages>(),
  targetAddress: { host: 'localhost', port: 8080, path: '/ws' },
});

const server = new AsyncServer('ws-mock', {
  protocol: new WebSocketProtocol<MyMessages>(),
  listenAddress: { host: 'localhost', port: 8080 },
});
```

## Type System

```typescript
// Loose mode
new WebSocketProtocol();

// Strict mode
type ChatMessages = {
  client: {
    join: { room: string; user: string };
    message: { text: string };
  };
  server: {
    joined: { room: string; members: string[] };
    message: { from: string; text: string };
  };
};
new WebSocketProtocol<ChatMessages>();
```

## Message Format

Messages are serialized as JSON by default. The message type is determined by a configurable field in the message payload.

## Features

- Full-duplex communication
- Connection lifecycle events (connect, disconnect)
- Path-based routing via `targetAddress.path`
- Proxy mode support

## Dependencies

- `ws` - WebSocket implementation
