# Custom Codecs Examples

Examples of custom codecs for Testurio's WebSocket and TCP protocols.

## Overview

By default, Testurio uses JSON serialization. Custom codecs allow alternative formats:

- **MessagePack** - Compact binary format
- **Protocol Buffers** - Schema-enforced binary format
- **Custom formats** - Any serialization you need

## Examples

### MessagePack Codec

```typescript
import { pack, unpack } from "msgpackr";
import { WebSocketProtocol } from "@testurio/protocol-ws";
import { createMessagePackCodec } from "./msgpack-codec";

const codec = createMessagePackCodec(pack, unpack);

const protocol = new WebSocketProtocol({ codec });
```

### Protocol Buffers Codec

```typescript
import * as protobuf from "protobufjs";
import { TcpProtocol } from "@testurio/protocol-tcp";
import { createProtobufCodec } from "./protobuf-codec";

const root = await protobuf.load("messages.proto");
const codec = createProtobufCodec(root, {
  typeMapping: {
    "OrderRequest": "mypackage.OrderRequest",
    "OrderResponse": "mypackage.OrderResponse",
  }
});

const protocol = new TcpProtocol({
  codec,
  lengthFieldLength: 4,  // Required for binary codecs
});
```

## Creating Your Own Codec

Implement the `Codec` interface:

```typescript
import type { Codec, Message } from "testurio";
import { CodecError } from "testurio";

const myCodec: Codec<Uint8Array> = {
  name: "my-codec",
  wireFormat: "binary",

  encode(message: Message): Uint8Array {
    // Your encoding logic
  },

  decode(data: Uint8Array): Message {
    // Your decoding logic
  },
};
```

## Important Notes

- **Binary codecs + TCP**: Use `lengthFieldLength: 4` (not delimiter framing)
- **Wire format**: `"text"` for strings, `"binary"` for Uint8Array
- **Async codecs**: `encode`/`decode` can return Promise

## See Also

- [Codec Types](../../packages/core/src/protocols/base/codec.types.ts)
- [JsonCodec](../../packages/core/src/protocols/base/json.codec.ts)
