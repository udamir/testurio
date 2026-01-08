/**
 * Protocol Buffers Codec Example
 *
 * Simple example showing how to wrap protobufjs for use with Testurio.
 *
 * Usage:
 *   pnpm add protobufjs
 */

import type { Codec, Message, WireFormat } from "testurio";
import { CodecError } from "testurio";

/**
 * Create a simple protobuf codec for a single message type
 *
 * @example
 * ```typescript
 * import * as protobuf from "protobufjs";
 *
 * const root = await protobuf.load("order.proto");
 * const OrderType = root.lookupType("Order");
 *
 * const codec = createProtobufCodec(OrderType);
 * ```
 */
export function createProtobufCodec(protoType: {
	encode(msg: unknown): { finish(): Uint8Array };
	decode(buf: Uint8Array): unknown;
}): Codec<Uint8Array> {
	return {
		name: "protobuf",
		wireFormat: "binary" as WireFormat,

		encode(message: Message): Uint8Array {
			try {
				return protoType.encode(message).finish();
			} catch (error) {
				throw CodecError.encodeError("protobuf", error instanceof Error ? error : new Error(String(error)), message);
			}
		},

		decode(data: Uint8Array): Message {
			try {
				return protoType.decode(data) as Message;
			} catch (error) {
				throw CodecError.decodeError("protobuf", error instanceof Error ? error : new Error(String(error)));
			}
		},
	};
}
