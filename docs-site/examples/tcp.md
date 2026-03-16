# TCP Examples

Practical examples for testing TCP-based protocols with Testurio.

## Setup

```typescript
import { AsyncClient, AsyncServer, TestScenario, testCase } from 'testurio';
import { TcpProtocol, type TcpServiceDefinition } from '@testurio/protocol-tcp';

interface CommandService extends TcpServiceDefinition {
  clientMessages: {
    Command: { command: string; payload: string };
    Ping: { seq: number };
  };
  serverMessages: {
    Response: { status: string; data: string };
    Pong: { seq: number };
    Error: { code: number; message: string };
  };
}

const server = new AsyncServer('tcp-backend', {
  protocol: new TcpProtocol<CommandService>(),
  listenAddress: { host: 'localhost', port: 9000 },
});

const client = new AsyncClient('tcp-client', {
  protocol: new TcpProtocol<CommandService>(),
  targetAddress: { host: 'localhost', port: 9000 },
});

const scenario = new TestScenario({
  name: 'TCP Command Protocol',
  components: [server, client],
});
```

## Command and Response

```typescript
const tc = testCase('Execute command', (test) => {
  const tcp = test.use(client);
  const mock = test.use(server);

  mock.onMessage('Command').mockEvent('Response', (payload) => ({
    status: 'ok',
    data: `Executed: ${payload.command}`,
  }));

  tcp.sendMessage('Command', { command: 'status', payload: 'all' });

  tcp.waitEvent('Response').timeout(2000).assert((msg) => {
    return msg.status === 'ok' && msg.data.includes('Executed');
  });
});
```

## Ping-Pong

```typescript
const tc = testCase('Ping-pong exchange', (test) => {
  const tcp = test.use(client);
  const mock = test.use(server);

  mock.onMessage('Ping').mockEvent('Pong', (payload) => ({
    seq: payload.seq,
  }));

  tcp.sendMessage('Ping', { seq: 42 });

  tcp.waitEvent('Pong').timeout(2000).assert((msg) => msg.seq === 42);
});
```

## Error Handling

```typescript
const tc = testCase('Handle error response', (test) => {
  const tcp = test.use(client);
  const mock = test.use(server);

  mock.onMessage('Command').mockEvent('Error', () => ({
    code: 400,
    message: 'Invalid command',
  }));

  tcp.sendMessage('Command', { command: 'invalid', payload: '' });

  tcp.waitEvent('Error').timeout(2000).assert((msg) => msg.code === 400);
});
```

## Custom Binary Codec

TCP supports custom codecs for binary protocols:

```typescript
import type { Codec, Message, WireFormat } from 'testurio';

const lengthPrefixedCodec: Codec<Buffer> = {
  name: 'length-prefixed',
  wireFormat: 'binary' as WireFormat,

  encode(message: Message): Buffer {
    const json = JSON.stringify(message);
    const payload = Buffer.from(json);
    const header = Buffer.alloc(4);
    header.writeUInt32BE(payload.length);
    return Buffer.concat([header, payload]);
  },

  decode(data: Buffer): Message {
    const length = data.readUInt32BE(0);
    const json = data.subarray(4, 4 + length).toString();
    return JSON.parse(json);
  },
};

const server = new AsyncServer('tcp-backend', {
  protocol: new TcpProtocol<CommandService>({ codec: lengthPrefixedCodec }),
  listenAddress: { host: 'localhost', port: 9000 },
});

const client = new AsyncClient('tcp-client', {
  protocol: new TcpProtocol<CommandService>({ codec: lengthPrefixedCodec }),
  targetAddress: { host: 'localhost', port: 9000 },
});
```
