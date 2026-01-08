# Custom Codecs Examples

This directory contains example implementations of custom codecs for Testurio's WebSocket and TCP protocols.

## Overview

By default, Testurio uses JSON serialization for message encoding/decoding. Custom codecs allow you to use alternative serialization formats such as:

- **MessagePack** - Compact binary format, faster than JSON
- **Protocol Buffers** - Schema-enforced binary format with strong typing
- **Custom binary protocols** - Proprietary formats for legacy systems

## Available Examples

### MessagePack Codec

**File:** `msgpack-codec.ts`

A binary codec using MessagePack serialization. MessagePack is more compact and faster than JSON while supporting similar data types.

**Dependencies:**
```bash
pnpm add msgpackr
```

**Usage:**
```typescript
import { pack, unpack } from "msgpackr";
import { WebSocketProtocol } from "@testurio/protocol-ws";
import { MessagePackCodec } from "./msgpack-codec";

const codec = new MessagePackCodec(pack, unpack);

const wsProtocol = new WebSocketProtocol({
  codec,
});
```

### Protocol Buffers Codec

**File:** `protobuf-codec.ts`

A binary codec using Protocol Buffers for schema-enforced serialization. Provides strong typing and backward compatibility.

**Dependencies:**
```bash
pnpm add protobufjs
```

**Usage:**
```typescript
import * as protobuf from "protobufjs";
import { TcpProtocol } from "@testurio/protocol-tcp";
import { ProtobufCodec } from "./protobuf-codec";

const root = await protobuf.load("./protos/messages.proto");
const codec = new ProtobufCodec({
  root,
  typeMapping: "auto",
  typeEncoding: "envelope",
});

const tcpProtocol = new TcpProtocol({
  codec,
  lengthFieldLength: 4,  // Required for binary codecs
});
```

## Creating Your Own Codec

To create a custom codec, implement the `Codec` interface:

```typescript
import type { Codec, Message, WireFormat } from "testurio";
import { CodecError } from "testurio";

class MyCodec implements Codec<string | Uint8Array> {
  readonly name = "my-codec";
  readonly wireFormat: WireFormat = "binary"; // or "text"

  encode(message: Message): Uint8Array {
    try {
      // Your encoding logic here
      return new Uint8Array(/* ... */);
    } catch (error) {
      throw CodecError.encodeError(
        this.name,
        error instanceof Error ? error : new Error(String(error)),
        message
      );
    }
  }

  decode(data: Uint8Array): Message {
    try {
      // Your decoding logic here
      return { type: "...", payload: /* ... */ };
    } catch (error) {
      throw CodecError.decodeError(
        this.name,
        error instanceof Error ? error : new Error(String(error)),
        data
      );
    }
  }
}
```

## Important Notes

### Binary Codecs with TCP

When using binary codecs with TCP protocol, you **must** use length-prefixed framing:

```typescript
const tcpProtocol = new TcpProtocol({
  codec: myBinaryCodec,
  lengthFieldLength: 4,  // Required! Don't use delimiter framing with binary
});
```

Delimiter-based framing (the default) is designed for text protocols and may corrupt binary data.

### Wire Format

The `wireFormat` property tells the adapter how to handle the encoded data:

- `"text"` - Encoded data is a string (e.g., JSON)
- `"binary"` - Encoded data is `Uint8Array` (e.g., MessagePack, Protobuf)

WebSocket will use text or binary frames accordingly.

### Async Codecs

Codecs can be asynchronous. Both `encode()` and `decode()` can return `Promise`:

```typescript
class AsyncCodec implements Codec<Uint8Array> {
  async encode(message: Message): Promise<Uint8Array> {
    // Async encoding (e.g., compression)
    const compressed = await compress(JSON.stringify(message));
    return compressed;
  }

  async decode(data: Uint8Array): Promise<Message> {
    // Async decoding
    const decompressed = await decompress(data);
    return JSON.parse(decompressed);
  }
}
```

## See Also

- [Codec Types](../../packages/core/src/protocols/base/codec.types.ts) - Codec interface definition
- [JsonCodec](../../packages/core/src/protocols/base/json.codec.ts) - Default JSON codec implementation
