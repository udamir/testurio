/**
 * Protocol Buffers Codec Example
 *
 * This example demonstrates how to create a custom binary codec
 * using Protocol Buffers serialization for TCP protocols.
 *
 * Protocol Buffers provide strong schema enforcement, backward
 * compatibility, and efficient binary serialization.
 *
 * Dependencies:
 *   pnpm add protobufjs
 *
 * @see https://protobuf.dev/
 * @see https://github.com/protobufjs/protobuf.js
 */

import type { Codec, Message, WireFormat } from "testurio";
import { CodecError } from "testurio";

// Note: Install protobufjs before using this codec
// import * as protobuf from "protobufjs";

/**
 * Type mapping configuration for protobuf codec
 */
export type TypeMapping = "auto" | Record<string, string>;

/**
 * How message type is encoded in wire format
 */
export type TypeEncoding =
	| "envelope" // Wrap message in envelope with type field
	| "prefix" // Prefix message with type ID bytes
	| "none"; // No type encoding (single message type only)

/**
 * Protobuf codec options
 */
export interface ProtobufCodecOptions {
	/**
	 * Loaded protobuf Root object from protobufjs
	 */
	root: ProtobufRoot;

	/**
	 * Type mapping configuration:
	 * - "auto": Message.type matches protobuf message name
	 * - Record: Explicit mapping from Message.type to protobuf type
	 *
	 * @example
	 * ```typescript
	 * typeMapping: {
	 *   "OrderRequest": "mypackage.OrderRequest",
	 *   "OrderResponse": "mypackage.OrderResponse"
	 * }
	 * ```
	 */
	typeMapping?: TypeMapping;

	/**
	 * How to encode Message.type in wire format
	 * - "envelope": Wrap in { type: string, data: bytes } envelope
	 * - "prefix": Prepend 2-byte type ID (requires typeIds option)
	 * - "none": No type encoding (use defaultType option)
	 *
	 * @default "envelope"
	 */
	typeEncoding?: TypeEncoding;

	/**
	 * Type IDs for "prefix" encoding mode
	 * Maps Message.type to numeric ID
	 */
	typeIds?: Record<string, number>;

	/**
	 * Default protobuf type for "none" encoding mode
	 */
	defaultType?: string;

	/**
	 * Package prefix to prepend to type names in "auto" mode
	 */
	packagePrefix?: string;
}

/**
 * Minimal protobuf type interface (from protobufjs)
 */
interface ProtobufType {
	encode(message: unknown): { finish(): Uint8Array };
	decode(buffer: Uint8Array): unknown;
	verify(message: unknown): string | null;
}

/**
 * Minimal protobuf Root interface (from protobufjs)
 */
interface ProtobufRoot {
	lookupType(path: string): ProtobufType;
}

/**
 * Envelope message for type-prefixed encoding
 */
interface EnvelopeMessage {
	type: string;
	data: Uint8Array;
}

/**
 * Protocol Buffers codec for schema-based binary serialization.
 *
 * Provides strong typing and efficient serialization using .proto schemas.
 *
 * @example Basic usage with envelope encoding
 * ```typescript
 * import * as protobuf from "protobufjs";
 *
 * const root = await protobuf.load("./protos/messages.proto");
 * const codec = new ProtobufCodec({
 *   root,
 *   typeMapping: "auto",
 *   typeEncoding: "envelope",
 * });
 *
 * const tcpProtocol = new TcpProtocol({
 *   codec,
 *   lengthFieldLength: 4,
 * });
 * ```
 *
 * @example With explicit type mapping
 * ```typescript
 * const codec = new ProtobufCodec({
 *   root,
 *   typeMapping: {
 *     "OrderRequest": "orders.v1.OrderRequest",
 *     "OrderResponse": "orders.v1.OrderResponse",
 *   },
 *   typeEncoding: "envelope",
 * });
 * ```
 */
export class ProtobufCodec implements Codec<Uint8Array> {
	readonly name = "protobuf";
	readonly wireFormat: WireFormat = "binary";

	private readonly root: ProtobufRoot;
	private readonly typeMapping: TypeMapping;
	private readonly typeEncoding: TypeEncoding;
	private readonly typeIds?: Record<string, number>;
	private readonly reverseTypeIds?: Map<number, string>;
	private readonly defaultType?: string;
	private readonly packagePrefix: string;
	private readonly envelopeType?: ProtobufType;

	constructor(options: ProtobufCodecOptions) {
		this.root = options.root;
		this.typeMapping = options.typeMapping ?? "auto";
		this.typeEncoding = options.typeEncoding ?? "envelope";
		this.typeIds = options.typeIds;
		this.defaultType = options.defaultType;
		this.packagePrefix = options.packagePrefix ?? "";

		// Build reverse type ID mapping for decoding
		if (this.typeIds) {
			this.reverseTypeIds = new Map();
			for (const [type, id] of Object.entries(this.typeIds)) {
				this.reverseTypeIds.set(id, type);
			}
		}

		// For envelope encoding, we need an envelope message type
		// This should be defined in your .proto file:
		// message Envelope { string type = 1; bytes data = 2; }
		if (this.typeEncoding === "envelope") {
			try {
				this.envelopeType = this.root.lookupType("Envelope");
			} catch {
				// If no Envelope type, we'll use a simple format
			}
		}

		// Validate configuration
		if (this.typeEncoding === "prefix" && !this.typeIds) {
			throw new Error('ProtobufCodec: "prefix" encoding requires typeIds option');
		}
		if (this.typeEncoding === "none" && !this.defaultType) {
			throw new Error('ProtobufCodec: "none" encoding requires defaultType option');
		}
	}

	/**
	 * Encode a Message to protobuf binary format
	 */
	encode(message: Message): Uint8Array {
		try {
			const protoType = this.getProtoType(message.type);
			const encoded = protoType.encode(message.payload).finish();

			switch (this.typeEncoding) {
				case "envelope":
					return this.encodeWithEnvelope(message.type, encoded);
				case "prefix":
					return this.encodeWithPrefix(message.type, encoded);
				case "none":
				default:
					return encoded;
			}
		} catch (error) {
			throw CodecError.encodeError(this.name, error instanceof Error ? error : new Error(String(error)), message);
		}
	}

	/**
	 * Decode protobuf binary to Message
	 */
	decode(data: Uint8Array): Message {
		try {
			let type: string;
			let payloadData: Uint8Array;

			switch (this.typeEncoding) {
				case "envelope":
					({ type, payloadData } = this.decodeEnvelope(data));
					break;
				case "prefix":
					({ type, payloadData } = this.decodePrefix(data));
					break;
				case "none":
				default:
					type = this.defaultType!;
					payloadData = data;
			}

			const protoType = this.getProtoType(type);
			const payload = protoType.decode(payloadData);

			return { type, payload };
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

	/**
	 * Get protobuf type for message type
	 */
	private getProtoType(messageType: string): ProtobufType {
		let protoTypeName: string;

		if (this.typeMapping === "auto") {
			protoTypeName = this.packagePrefix + messageType;
		} else {
			protoTypeName = this.typeMapping[messageType];
			if (!protoTypeName) {
				throw new Error(`No protobuf type mapping for message type: ${messageType}`);
			}
		}

		return this.root.lookupType(protoTypeName);
	}

	/**
	 * Encode with envelope wrapper
	 */
	private encodeWithEnvelope(type: string, data: Uint8Array): Uint8Array {
		if (this.envelopeType) {
			const envelope: EnvelopeMessage = { type, data };
			return this.envelopeType.encode(envelope).finish();
		}

		// Simple envelope format: [type length (1 byte)][type string][data]
		const typeBytes = new TextEncoder().encode(type);
		const result = new Uint8Array(1 + typeBytes.length + data.length);
		result[0] = typeBytes.length;
		result.set(typeBytes, 1);
		result.set(data, 1 + typeBytes.length);
		return result;
	}

	/**
	 * Decode envelope wrapper
	 */
	private decodeEnvelope(data: Uint8Array): { type: string; payloadData: Uint8Array } {
		if (this.envelopeType) {
			const envelope = this.envelopeType.decode(data) as EnvelopeMessage;
			return { type: envelope.type, payloadData: envelope.data };
		}

		// Simple envelope format
		const typeLength = data[0];
		const type = new TextDecoder().decode(data.slice(1, 1 + typeLength));
		const payloadData = data.slice(1 + typeLength);
		return { type, payloadData };
	}

	/**
	 * Encode with type ID prefix
	 */
	private encodeWithPrefix(type: string, data: Uint8Array): Uint8Array {
		const typeId = this.typeIds![type];
		if (typeId === undefined) {
			throw new Error(`No type ID for message type: ${type}`);
		}

		const result = new Uint8Array(2 + data.length);
		result[0] = (typeId >> 8) & 0xff;
		result[1] = typeId & 0xff;
		result.set(data, 2);
		return result;
	}

	/**
	 * Decode type ID prefix
	 */
	private decodePrefix(data: Uint8Array): { type: string; payloadData: Uint8Array } {
		const typeId = (data[0] << 8) | data[1];
		const type = this.reverseTypeIds!.get(typeId);
		if (!type) {
			throw new Error(`Unknown type ID: 0x${typeId.toString(16).padStart(4, "0")}`);
		}
		return { type, payloadData: data.slice(2) };
	}
}

/**
 * Factory function to create ProtobufCodec
 */
export function createProtobufCodec(options: ProtobufCodecOptions): ProtobufCodec {
	return new ProtobufCodec(options);
}

// =============================================================================
// Usage Example (uncomment after installing protobufjs)
// =============================================================================

/*
import * as protobuf from "protobufjs";
import { TcpProtocol } from "@testurio/protocol-tcp";
import { AsyncClient, AsyncServer, TestScenario, testCase } from "testurio";

// Example proto file (messages.proto):
//
// syntax = "proto3";
//
// message Envelope {
//   string type = 1;
//   bytes data = 2;
// }
//
// message OrderRequest {
//   string order_id = 1;
//   repeated string items = 2;
//   int32 quantity = 3;
// }
//
// message OrderResponse {
//   string order_id = 1;
//   string status = 2;
//   double total = 3;
// }

async function main() {
  // Load proto definitions
  const root = await protobuf.load("./protos/messages.proto");

  // Create codec with envelope encoding
  const codec = new ProtobufCodec({
    root,
    typeMapping: "auto",
    typeEncoding: "envelope",
  });

  // Create TCP protocol with protobuf codec
  const tcpProtocol = new TcpProtocol({
    codec,
    lengthFieldLength: 4,  // Required for binary protocols
  });

  // Define server
  const server = new AsyncServer("order-server", {
    protocol: tcpProtocol,
    listenAddress: { host: "localhost", port: 9000 },
  });

  // Define client
  const client = new AsyncClient("order-client", {
    protocol: tcpProtocol,
    targetAddress: { host: "localhost", port: 9000 },
  });

  // Create test scenario
  const scenario = new TestScenario({
    name: "Protobuf Order Test",
    components: [server, client],
  });

  // Write test case
  const tc = testCase("should process order with protobuf", (test) => {
    const orderClient = test.use(client);
    const orderServer = test.use(server);

    // Client sends order request (will be encoded as protobuf)
    orderClient.sendMessage("OrderRequest", {
      orderId: "ORD-123",
      items: ["item-a", "item-b"],
      quantity: 2,
    });

    // Server receives and responds
    orderServer.onMessage("OrderRequest").mockResponse((msg) => ({
      type: "OrderResponse",
      payload: {
        orderId: msg.payload.orderId,
        status: "confirmed",
        total: 99.99,
      },
    }));

    // Client asserts on response
    orderClient.waitMessage("OrderResponse").assert((msg) => {
      return msg.payload.status === "confirmed";
    });
  });

  // Run test
  const result = await scenario.run(tc);
  console.log("Test result:", result.status);
}

main().catch(console.error);
*/
