/**
 * Codec Types
 *
 * Defines interfaces for data encoding/decoding.
 * Codecs convert between data objects and wire formats.
 * Used by both protocol adapters and MQ adapters.
 */

/**
 * Wire format type - indicates the encoded data format
 */
export type WireFormat = "text" | "binary";

/**
 * Codec interface for data serialization/deserialization.
 *
 * Codecs are used by adapters to convert between data objects and wire formats.
 * Works with any data type - protocol messages, MQ payloads, etc.
 *
 * @template W - Wire format type (string for text, Uint8Array for binary)
 * @template D - Data type being encoded/decoded (defaults to unknown)
 *
 * @example Text codec (JSON)
 * ```typescript
 * const jsonCodec: Codec<string> = {
 *   name: "json",
 *   wireFormat: "text",
 *   encode: (data) => JSON.stringify(data),
 *   decode: (wire) => JSON.parse(wire),
 * };
 * ```
 *
 * @example Binary codec (MessagePack)
 * ```typescript
 * const msgpackCodec: Codec<Uint8Array> = {
 *   name: "msgpack",
 *   wireFormat: "binary",
 *   encode: (data) => msgpack.encode(data),
 *   decode: (wire) => msgpack.decode(wire),
 * };
 * ```
 *
 * @example Typed codec for specific data
 * ```typescript
 * const orderCodec: Codec<string, Order> = {
 *   name: "json",
 *   wireFormat: "text",
 *   encode: (order) => JSON.stringify(order),
 *   decode: (wire) => JSON.parse(wire) as Order,
 * };
 * ```
 */
export interface Codec<W extends string | Uint8Array = string | Uint8Array> {
	/**
	 * Human-readable codec name for error messages and debugging.
	 * @example "json", "msgpack", "protobuf"
	 */
	readonly name: string;

	/**
	 * Wire format indicator.
	 * - "text": Codec produces/consumes strings
	 * - "binary": Codec produces/consumes Uint8Array
	 *
	 * Used by adapters for transport optimization (e.g., WebSocket frame type).
	 */
	readonly wireFormat: WireFormat;

	/**
	 * Encode data to wire format.
	 *
	 * @param data - The data to encode
	 * @returns Encoded data (string or Uint8Array) or Promise thereof
	 * @throws CodecError if encoding fails
	 */
	encode<D = unknown>(data: D): W | Promise<W>;

	/**
	 * Decode wire format data to object.
	 *
	 * @param wire - The wire format data to decode
	 * @returns Decoded data or Promise thereof
	 * @throws CodecError if decoding fails
	 */
	decode<D = unknown>(wire: W): D | Promise<D>;
}

/**
 * Codec operation type
 */
export type CodecOperation = "encode" | "decode";

/**
 * Error thrown when codec encoding or decoding fails.
 *
 * Provides detailed information about the failure including
 * the codec name, operation type, and original error.
 *
 * @example
 * ```typescript
 * try {
 *   const message = codec.decode(invalidData);
 * } catch (error) {
 *   if (error instanceof CodecError) {
 *     console.log(`Codec ${error.codecName} failed to ${error.operation}`);
 *     console.log(`Original error: ${error.cause}`);
 *   }
 * }
 * ```
 */
export class CodecError extends Error {
	/**
	 * Name of the codec that failed
	 */
	readonly codecName: string;

	/**
	 * Operation that failed ("encode" or "decode")
	 */
	readonly operation: CodecOperation;

	/**
	 * The data that caused the error (for debugging)
	 * May be truncated for large payloads
	 */
	readonly data?: unknown;

	/**
	 * The original error that caused this error
	 */
	cause?: Error;

	constructor(
		message: string,
		codecName: string,
		operation: CodecOperation,
		options?: {
			cause?: Error;
			data?: unknown;
		}
	) {
		super(message);
		this.name = "CodecError";
		this.codecName = codecName;
		this.operation = operation;
		this.data = options?.data;
		if (options?.cause) {
			this.cause = options.cause;
		}
	}

	/**
	 * Create a CodecError for an encode operation failure
	 */
	static encodeError(codecName: string, cause: Error, data?: unknown): CodecError {
		return new CodecError(`Failed to encode message with ${codecName} codec: ${cause.message}`, codecName, "encode", {
			cause,
			data,
		});
	}

	/**
	 * Create a CodecError for a decode operation failure
	 */
	static decodeError(codecName: string, cause: Error, data?: unknown): CodecError {
		return new CodecError(`Failed to decode message with ${codecName} codec: ${cause.message}`, codecName, "decode", {
			cause,
			data,
		});
	}
}
