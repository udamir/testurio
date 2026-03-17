# @testurio/protocol-ws

WebSocket protocol support for Testurio. Provides bidirectional messaging over persistent connections.

```bash
npm install @testurio/protocol-ws --save-dev
```

**Peer dependency:** `ws`

## WebSocketProtocol

Used with `AsyncClient` and `AsyncServer` components.

```typescript
import { WebSocketProtocol } from '@testurio/protocol-ws';

const protocol = new WebSocketProtocol<ChatService>();
```

### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `codec` | `Codec` | `JsonCodec` | Message serialization codec |
| `schema` | `AsyncSchemaInput` | — | Zod schemas for runtime validation |

### Usage

```typescript
const client = new AsyncClient('ws', {
  protocol: new WebSocketProtocol<ChatService>(),
  targetAddress: { host: 'localhost', port: 8080, path: '/ws' },
});

const server = new AsyncServer('ws-mock', {
  protocol: new WebSocketProtocol<ChatService>(),
  listenAddress: { host: 'localhost', port: 8080 },
});
```

### Type Definition

```typescript
interface ChatService {
  clientMessages: {
    join: { roomId: string; userId: string };
    message: { text: string; timestamp: number };
    leave: { userId: string };
  };
  serverMessages: {
    joined: { roomId: string; success: boolean };
    message: { userId: string; text: string; timestamp: number };
    userLeft: { userId: string };
    error: { code: number; message: string };
  };
}
```

### Features

- Full-duplex communication
- Connection lifecycle events (`waitDisconnect`)
- Manual connection control via `autoConnect: false` and `connect()` step
- Protocol-typed connect params (`WsConnectParams`): `headers`, `query`, `path`, `protocols`
- Path-based routing via `targetAddress.path` or `connect({ path })` override
- Custom codec support (JSON by default)
- Proxy mode support
- Schema-first runtime validation

### WsConnectParams

Connection parameters passed via `connect()` during the WebSocket handshake:

```typescript
ws.connect({
  headers: { Authorization: 'Bearer token' },
  query: { version: '2' },
  path: '/ws/v2',
  protocols: ['graphql-ws'],
});
```

| Field | Type | Description |
|-------|------|-------------|
| `headers` | `Record<string, string>` | HTTP headers for WebSocket handshake |
| `query` | `Record<string, string>` | URL query parameters |
| `path` | `string` | URL path override (overrides `targetAddress.path`) |
| `protocols` | `string[]` | WebSocket subprotocols |

### Typing Modes

```typescript
// Loose mode
new WebSocketProtocol()

// Explicit generic
new WebSocketProtocol<ChatService>()

// Schema-first
new WebSocketProtocol({ schema: chatSchema })
```
