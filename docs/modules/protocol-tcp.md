# TCP Protocol (`@testurio/protocol-tcp`)

**Location:** `packages/protocol-tcp/`

Provides raw TCP socket support for Testurio. Used with `AsyncClient` and `AsyncServer` components. Suitable for custom binary or text protocols over TCP.

## Usage

```typescript
import { TcpProtocol } from '@testurio/protocol-tcp';

const client = new AsyncClient('tcp', {
  protocol: new TcpProtocol<MyMessages>(),
  targetAddress: { host: 'localhost', port: 9000 },
});

const server = new AsyncServer('tcp-mock', {
  protocol: new TcpProtocol<MyMessages>(),
  listenAddress: { host: 'localhost', port: 9000 },
});
```

## Message Format

Messages are serialized as JSON by default with newline-delimited framing. Custom codecs can modify serialization.

## Features

- Persistent TCP connections
- Connection lifecycle events
- Newline-delimited message framing
- Proxy mode support

## Dependencies

- Node.js `net` module (built-in)
