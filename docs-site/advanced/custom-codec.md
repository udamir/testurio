# Custom Codec

How to create a custom codec for serializing messages in async protocols (WebSocket, TCP) and message queues.

## Codec Interface

```typescript
interface Codec<T = unknown> {
  name: string;
  wireFormat: WireFormat; // 'text' | 'binary'
  encode(message: Message): T;
  decode(data: T): Message;
}
```

| Field | Description |
|-------|-------------|
| `name` | Identifier for error reporting |
| `wireFormat` | `'text'` for string-based, `'binary'` for Buffer/Uint8Array |
| `encode` | Serialize a `Message` object to wire format |
| `decode` | Deserialize wire format back to a `Message` object |

## Message Type

The `Message` type that codecs work with:

```typescript
interface Message {
  type: string;
  [key: string]: unknown;
}
```

Every message must have a `type` field. The codec must preserve this field during encode/decode.

## Built-in JsonCodec

The default codec uses JSON serialization:

```typescript
const JsonCodec: Codec<string> = {
  name: 'json',
  wireFormat: 'text',
  encode: (message) => JSON.stringify(message),
  decode: (data) => JSON.parse(data),
};
```

## Creating a Custom Codec

### 1. Implement the Interface

```typescript
import type { Codec, Message, WireFormat } from 'testurio';
import { CodecError } from 'testurio';

const myCodec: Codec<Buffer> = {
  name: 'my-codec',
  wireFormat: 'binary' as WireFormat,

  encode(message: Message): Buffer {
    try {
      // Your serialization logic
      return serialize(message);
    } catch (error) {
      throw CodecError.encodeError(
        'my-codec',
        error instanceof Error ? error : new Error(String(error)),
        message,
      );
    }
  },

  decode(data: Buffer): Message {
    try {
      const result = deserialize(data);
      // Ensure result has 'type' field
      if (!result.type) throw new Error('Missing "type" field');
      return result;
    } catch (error) {
      if (error instanceof CodecError) throw error;
      throw CodecError.decodeError(
        'my-codec',
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  },
};
```

### 2. Use with a Protocol

```typescript
import { WebSocketProtocol } from '@testurio/protocol-ws';
import { TcpProtocol } from '@testurio/protocol-tcp';

// WebSocket with custom codec
new WebSocketProtocol<MyService>({ codec: myCodec });

// TCP with custom codec
new TcpProtocol<MyService>({ codec: myCodec });
```

## Error Handling

Use `CodecError` for consistent error reporting:

```typescript
import { CodecError } from 'testurio';

// Encode error — includes the failed message
throw CodecError.encodeError('codec-name', originalError, failedMessage);

// Decode error — includes the codec name and cause
throw CodecError.decodeError('codec-name', originalError);
```

`CodecError` extends `Error` with:
- `codecName` — which codec produced the error
- `cause` — the underlying error
- `direction` — `'encode'` or `'decode'`

## Best Practices

1. **Always validate the `type` field** — decoded messages must have `type: string`
2. **Wrap errors in `CodecError`** — provides consistent error context
3. **Use `wireFormat` correctly** — `'binary'` for `Buffer`/`Uint8Array`, `'text'` for strings
4. **Keep codecs stateless** — a single codec instance may be shared across components
5. **Match codec on both sides** — server and client must use the same codec
