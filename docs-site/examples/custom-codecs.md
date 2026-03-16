# Custom Codec Examples

Codecs handle message serialization for async protocols (WebSocket, TCP) and message queues. The built-in `JsonCodec` handles JSON. Custom codecs support binary formats like MessagePack or Protocol Buffers.

## Codec Interface

```typescript
import type { Codec, Message, WireFormat } from 'testurio';

interface Codec<T = unknown> {
  name: string;
  wireFormat: WireFormat; // 'text' | 'binary'
  encode(message: Message): T;
  decode(data: T): Message;
}
```

## MessagePack Codec

Uses the `msgpackr` library for compact binary serialization:

```bash
npm install msgpackr
```

```typescript
import type { Codec, Message, WireFormat } from 'testurio';
import { CodecError } from 'testurio';
import { pack, unpack } from 'msgpackr';

function createMessagePackCodec(): Codec<Uint8Array> {
  return {
    name: 'msgpack',
    wireFormat: 'binary' as WireFormat,

    encode(message: Message): Uint8Array {
      try {
        return pack(message);
      } catch (error) {
        throw CodecError.encodeError(
          'msgpack',
          error instanceof Error ? error : new Error(String(error)),
          message,
        );
      }
    },

    decode(data: Uint8Array): Message {
      try {
        const parsed = unpack(data);
        if (typeof parsed !== 'object' || parsed === null || !('type' in parsed)) {
          throw new Error('Invalid message: missing "type" field');
        }
        return parsed as Message;
      } catch (error) {
        if (error instanceof CodecError) throw error;
        throw CodecError.decodeError(
          'msgpack',
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    },
  };
}
```

### Usage

```typescript
import { WebSocketProtocol } from '@testurio/protocol-ws';

const codec = createMessagePackCodec();

const server = new AsyncServer('ws-backend', {
  protocol: new WebSocketProtocol<ChatService>({ codec }),
  listenAddress: { host: 'localhost', port: 8080 },
});

const client = new AsyncClient('ws-client', {
  protocol: new WebSocketProtocol<ChatService>({ codec }),
  targetAddress: { host: 'localhost', port: 8080 },
});
```

## Protocol Buffers Codec

Uses `protobufjs` for Protocol Buffer serialization:

```bash
npm install protobufjs
```

```typescript
import type { Codec, Message, WireFormat } from 'testurio';
import { CodecError } from 'testurio';
import * as protobuf from 'protobufjs';

async function createProtobufCodec(
  protoFile: string,
  messageType: string,
): Promise<Codec<Uint8Array>> {
  const root = await protobuf.load(protoFile);
  const ProtoType = root.lookupType(messageType);

  return {
    name: 'protobuf',
    wireFormat: 'binary' as WireFormat,

    encode(message: Message): Uint8Array {
      try {
        return ProtoType.encode(message).finish();
      } catch (error) {
        throw CodecError.encodeError(
          'protobuf',
          error instanceof Error ? error : new Error(String(error)),
          message,
        );
      }
    },

    decode(data: Uint8Array): Message {
      try {
        return ProtoType.decode(data) as unknown as Message;
      } catch (error) {
        throw CodecError.decodeError(
          'protobuf',
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    },
  };
}
```

### Usage

```typescript
import { TcpProtocol } from '@testurio/protocol-tcp';

const codec = await createProtobufCodec('messages.proto', 'app.CommandMessage');

const server = new AsyncServer('tcp-backend', {
  protocol: new TcpProtocol<CommandService>({ codec }),
  listenAddress: { host: 'localhost', port: 9000 },
});
```

## Length-Prefixed JSON Codec

A simple custom codec that prefixes JSON payloads with a 4-byte length header:

```typescript
import type { Codec, Message, WireFormat } from 'testurio';

const lengthPrefixedCodec: Codec<Buffer> = {
  name: 'length-prefixed-json',
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
```

## Error Handling

Use `CodecError` for consistent error reporting:

```typescript
import { CodecError } from 'testurio';

// Encode errors include the message that failed
throw CodecError.encodeError('mycodec', originalError, failedMessage);

// Decode errors include only the codec name and cause
throw CodecError.decodeError('mycodec', originalError);
```

`CodecError` extends `Error` with:
- `codecName` — which codec produced the error
- `cause` — the underlying error
- `direction` — `'encode'` or `'decode'`
