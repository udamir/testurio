# @testurio/protocol-tcp

Raw TCP socket protocol support for Testurio. Suitable for custom binary or text protocols over TCP.

```bash
npm install @testurio/protocol-tcp --save-dev
```

**No external dependencies** — uses Node.js built-in `net` module.

## TcpProtocol

Used with `AsyncClient` and `AsyncServer` components.

```typescript
import { TcpProtocol } from '@testurio/protocol-tcp';

const protocol = new TcpProtocol<MyTcpService>();
```

### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `codec` | `Codec` | `JsonCodec` | Message serialization codec |
| `lengthFieldLength` | `number` | — | Length field size in bytes for binary framing |
| `schema` | `AsyncSchemaInput` | — | Zod schemas for runtime validation |

### Usage

```typescript
const client = new AsyncClient('tcp', {
  protocol: new TcpProtocol<MyService>(),
  targetAddress: { host: 'localhost', port: 9000 },
});

const server = new AsyncServer('tcp-mock', {
  protocol: new TcpProtocol<MyService>(),
  listenAddress: { host: 'localhost', port: 9000 },
});
```

### Type Definition

```typescript
import type { TcpServiceDefinition } from '@testurio/protocol-tcp';

interface MyService extends TcpServiceDefinition {
  clientMessages: {
    Request: { id: string; action: string; data: string };
  };
  serverMessages: {
    Response: { id: string; result: string; timestamp: number };
  };
}
```

### Binary Codecs

For binary protocols, set `lengthFieldLength` to enable length-prefixed framing:

```typescript
const protocol = new TcpProtocol({
  codec: myBinaryCodec,
  lengthFieldLength: 4,  // 4-byte length prefix
});
```

### Features

- Persistent TCP connections
- JSON-based messaging by default (newline-delimited)
- Custom codec support for binary protocols
- Length-prefixed framing for binary codecs
- Connection lifecycle events
- Proxy mode support

### Typing Modes

```typescript
// Loose mode
new TcpProtocol()

// Explicit generic
new TcpProtocol<MyService>()

// Schema-first
new TcpProtocol({ schema: mySchema })
```
