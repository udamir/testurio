# @testurio/protocol-ws

WebSocket protocol adapter for [Testurio](https://github.com/udamir/testurio).

## Installation

```bash
npm install @testurio/protocol-ws
```

## Usage

```typescript
import { TestScenario, testCase, AsyncClient, AsyncServer } from 'testurio';
import { WebSocketProtocol } from '@testurio/protocol-ws';

interface WsMessages {
  clientMessages: {
    ping: { seq: number };
  };
  serverMessages: {
    pong: { seq: number; timestamp: number };
  };
}

const wsClient = new AsyncClient('client', {
  protocol: new WebSocketProtocol<WsMessages>(),
  targetAddress: { host: 'localhost', port: 4000 },
});

const wsServer = new AsyncServer('server', {
  protocol: new WebSocketProtocol<WsMessages>(),
  listenAddress: { host: 'localhost', port: 4000 },
});

const scenario = new TestScenario({
  name: 'WebSocket Echo Test',
  components: [wsServer, wsClient],
});

const tc = testCase('Ping-Pong', (test) => {
  const client = test.use(wsClient);
  const server = test.use(wsServer);

  client.sendMessage('ping', { seq: 1 });

  server.onMessage('ping').mockEvent('pong', (payload) => ({
    seq: payload.seq,
    timestamp: Date.now(),
  }));

  client.onEvent('pong').assert((payload) => payload.seq === 1);
});
```

## Custom Codecs

```typescript
import { JsonCodec } from 'testurio';
import { WebSocketProtocol } from '@testurio/protocol-ws';

const jsonWithDates = new JsonCodec({
  reviver: (key, value) => {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return new Date(value);
    }
    return value;
  },
});

const wsProtocol = new WebSocketProtocol({
  codec: jsonWithDates,
});
```

## License

MIT
