/**
 * MessagePack Codec Example
 *
 * This example demonstrates how to create a custom binary codec
 * using MessagePack serialization for WebSocket and TCP protocols.
 *
 * MessagePack is a binary serialization format that is more compact
 * and faster than JSON, while still supporting similar data types.
 *
 * Dependencies:
 *   pnpm add msgpackr
 *
 * @see https://msgpack.org/
 * @see https://github.com/kriszyp/msgpackr
 */

import type { Codec, Message, WireFormat } from "testurio";
import { CodecError } from "testurio";

// Note: Install msgpackr before using this codec
// import { pack, unpack } from "msgpackr";

/**
 * MessagePack codec options
 */
export interface MessagePackCodecOptions {
	/**
	 * Use structured clone extension for additional types
	 * (Date, RegExp, Error, etc.)
	 */
	structuredClone?: boolean;

	/**
	 * Maximum buffer size for encoding (default: 64MB)
	 */
	maxBufferSize?: number;
}

/**
 * MessagePack codec for binary message serialization.
 *
 * Provides more compact serialization than JSON with support
 * for binary data types.
 *
 * @example Basic usage
 * ```typescript
 * import { pack, unpack } from "msgpackr";
 *
 * const codec = new MessagePackCodec({ pack, unpack });
 *
 * const wsProtocol = new WebSocketProtocol({
 *   codec,
 *   timeout: 5000,
 * });
 * ```
 *
 * @example With TCP protocol
 * ```typescript
 * const tcpProtocol = new TcpProtocol({
 *   codec: new MessagePackCodec({ pack, unpack }),
 *   lengthFieldLength: 4,  // Required for binary codecs
 * });
 * ```
 */
export class MessagePackCodec implements Codec<Uint8Array> {
	readonly name = "msgpack";
	readonly wireFormat: WireFormat = "binary";

	private readonly pack: (value: unknown) => Uint8Array;
	private readonly unpack: (buffer: Uint8Array) => unknown;

	/**
	 * Create a MessagePack codec
	 *
	 * @param packFn - MessagePack pack function (from msgpackr or similar library)
	 * @param unpackFn - MessagePack unpack function
	 * @param options - Optional configuration
	 */
	constructor(
		packFn: (value: unknown) => Uint8Array,
		unpackFn: (buffer: Uint8Array) => unknown,
		_options: MessagePackCodecOptions = {}
	) {
		this.pack = packFn;
		this.unpack = unpackFn;
	}

	/**
	 * Encode a Message to MessagePack binary format
	 */
	encode(message: Message): Uint8Array {
		try {
			return this.pack(message);
		} catch (error) {
			throw CodecError.encodeError(this.name, error instanceof Error ? error : new Error(String(error)), message);
		}
	}

	/**
	 * Decode MessagePack binary to Message
	 */
	decode(data: Uint8Array): Message {
		try {
			const parsed = this.unpack(data);

			// Validate Message structure
			if (!isValidMessage(parsed)) {
				throw new Error('Invalid message structure: missing "type" field');
			}

			return parsed;
		} catch (error) {
			if (error instanceof CodecError) {
				throw error;
			}
			throw CodecError.decodeError(
				this.name,
				error instanceof Error ? error : new Error(String(error)),
				`[${data.length} bytes]`
			);
		}
	}
}

/**
 * Type guard to validate Message structure
 */
function isValidMessage(value: unknown): value is Message {
	return (
		typeof value === "object" &&
		value !== null &&
		"type" in value &&
		typeof (value as Record<string, unknown>).type === "string"
	);
}

/**
 * Factory function to create MessagePackCodec with msgpackr library
 *
 * @example
 * ```typescript
 * import { pack, unpack } from "msgpackr";
 *
 * const codec = createMessagePackCodec(pack, unpack);
 * ```
 */
export function createMessagePackCodec(
	pack: (value: unknown) => Uint8Array,
	unpack: (buffer: Uint8Array) => unknown,
	options?: MessagePackCodecOptions
): MessagePackCodec {
	return new MessagePackCodec(pack, unpack, options);
}

// =============================================================================
// Usage Example (uncomment after installing msgpackr)
// =============================================================================

/*
import { pack, unpack } from "msgpackr";
import { WebSocketProtocol, AsyncClient } from "testurio";
import { TcpProtocol } from "@testurio/protocol-tcp";

// Create codec instance
const msgpackCodec = new MessagePackCodec(pack, unpack);

// Use with WebSocket protocol
const wsProtocol = new WebSocketProtocol({
  codec: msgpackCodec,
});

const wsClient = new AsyncClient("ws-client", {
  protocol: wsProtocol,
  targetAddress: { host: "localhost", port: 8080 },
});

// Use with TCP protocol (requires length-prefixed framing for binary)
const tcpProtocol = new TcpProtocol({
  codec: msgpackCodec,
  lengthFieldLength: 4,  // 4-byte length prefix for binary messages
});

const tcpClient = new AsyncClient("tcp-client", {
  protocol: tcpProtocol,
  targetAddress: { host: "localhost", port: 9000 },
});
*/
