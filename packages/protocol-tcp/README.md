# @testurio/protocol-tcp

TCP protocol adapter for [Testurio](https://github.com/udamir/testurio) - supports custom protocol implementations.

## Installation

```bash
npm install @testurio/protocol-tcp
```

## Usage

```typescript
import { TestScenario, testCase, AsyncClient, AsyncServer } from 'testurio';
import { TcpProtocol } from '@testurio/protocol-tcp';

interface TcpMessages {
  clientMessages: {
    request: { id: number; data: string };
  };
  serverMessages: {
    response: { id: number; result: string };
  };
}

const tcpClient = new AsyncClient('client', {
  protocol: new TcpProtocol<TcpMessages>(),
  targetAddress: { host: 'localhost', port: 5000 },
});

const tcpServer = new AsyncServer('server', {
  protocol: new TcpProtocol<TcpMessages>(),
  listenAddress: { host: 'localhost', port: 5000 },
});

const scenario = new TestScenario({
  name: 'TCP Protocol Test',
  components: [tcpServer, tcpClient],
});

const tc = testCase('Request-Response', (test) => {
  const client = test.use(tcpClient);
  const server = test.use(tcpServer);

  client.sendMessage('request', { id: 1, data: 'hello' });

  server.onMessage('request').mockEvent('response', (payload) => ({
    id: payload.id,
    result: 'processed',
  }));

  client.onEvent('response').assert((payload) => payload.result === 'processed');
});
```

## Custom Codecs

For binary protocols, use length-prefixed framing:

```typescript
import { TcpProtocol } from '@testurio/protocol-tcp';

const tcpProtocol = new TcpProtocol({
  codec: myBinaryCodec,
  lengthFieldLength: 4, // Required for binary codecs
});
```

## License

MIT
