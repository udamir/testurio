/**
 * MessagePack Codec Example
 *
 * Demonstrates how to create a binary codec using MessagePack.
 * This is a simplified example - install msgpackr for actual use.
 *
 * Usage:
 *   pnpm add msgpackr
 *
 *   import { pack, unpack } from "msgpackr";
 *   const codec = createMessagePackCodec(pack, unpack);
 */

import type { Codec, Message, WireFormat } from "testurio";
import { CodecError } from "testurio";

/**
 * Create a MessagePack codec from pack/unpack functions
 *
 * @example
 * ```typescript
 * import { pack, unpack } from "msgpackr";
 * import { WebSocketProtocol } from "@testurio/protocol-ws";
 *
 * const codec = createMessagePackCodec(pack, unpack);
 * const protocol = new WebSocketProtocol({ codec });
 * ```
 */
export function createMessagePackCodec(
	pack: (value: unknown) => Uint8Array,
	unpack: (buffer: Uint8Array) => unknown
): Codec<Uint8Array> {
	return {
		name: "msgpack",
		wireFormat: "binary" as WireFormat,

		encode(message: Message): Uint8Array {
			try {
				return pack(message);
			} catch (error) {
				throw CodecError.encodeError("msgpack", error instanceof Error ? error : new Error(String(error)), message);
			}
		},

		decode(data: Uint8Array): Message {
			try {
				const parsed = unpack(data);
				if (!isMessage(parsed)) {
					throw new Error('Invalid message: missing "type" field');
				}
				return parsed;
			} catch (error) {
				if (error instanceof CodecError) throw error;
				throw CodecError.decodeError("msgpack", error instanceof Error ? error : new Error(String(error)));
			}
		},
	};
}

function isMessage(value: unknown): value is Message {
	return typeof value === "object" && value !== null && "type" in value && typeof (value as Message).type === "string";
}
