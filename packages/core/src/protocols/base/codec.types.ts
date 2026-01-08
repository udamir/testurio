/**
 * Codec Types
 *
 * Defines interfaces for message encoding/decoding.
 * Codecs convert between Message objects and wire formats.
 */

import type { Message } from "./base.types";

/**
 * Wire format type - indicates the encoded data format
 */
export type WireFormat = "text" | "binary";

/**
 * Codec interface for message serialization/deserialization.
 *
 * Codecs are used by protocol adapters to convert between
 * the framework's Message type and wire formats.
 *
 * @template T - Wire format type (string for text, Uint8Array for binary)
 *
 * @example Text codec (JSON)
 * ```typescript
 * const jsonCodec: Codec<string> = {
 *   name: "json",
 *   wireFormat: "text",
 *   encode: (msg) => JSON.stringify(msg),
 *   decode: (data) => JSON.parse(data),
 * };
 * ```
 *
 * @example Binary codec (MessagePack)
 * ```typescript
 * const msgpackCodec: Codec<Uint8Array> = {
 *   name: "msgpack",
 *   wireFormat: "binary",
 *   encode: (msg) => msgpack.encode(msg),
 *   decode: (data) => msgpack.decode(data),
 * };
 * ```
 */
export interface Codec<T extends string | Uint8Array = string | Uint8Array> {
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
	 * Encode a Message object to wire format.
	 *
	 * @param message - The Message to encode
	 * @returns Encoded data (string or Uint8Array) or Promise thereof
	 * @throws CodecError if encoding fails
	 */
	encode(message: Message): T | Promise<T>;

	/**
	 * Decode wire format data to a Message object.
	 *
	 * @param data - The wire format data to decode
	 * @returns Decoded Message or Promise thereof
	 * @throws CodecError if decoding fails
	 */
	decode(data: T): Message | Promise<Message>;
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
