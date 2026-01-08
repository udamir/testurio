/**
 * JSON Codec
 *
 * Default codec implementation using JSON serialization.
 * Supports custom reviver/replacer functions for advanced use cases.
 */

import type { Message } from "./base.types";
import type { Codec, WireFormat } from "./codec.types";
import { CodecError } from "./codec.types";

/**
 * JSON codec configuration options
 */
export interface JsonCodecOptions {
	/**
	 * Custom reviver function for JSON.parse().
	 * Use for transforming values during parsing (e.g., converting date strings to Date objects).
	 *
	 * @example Convert ISO date strings to Date objects
	 * ```typescript
	 * const codec = new JsonCodec({
	 *   reviver: (key, value) => {
	 *     if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
	 *       return new Date(value);
	 *     }
	 *     return value;
	 *   }
	 * });
	 * ```
	 */
	reviver?: (key: string, value: unknown) => unknown;

	/**
	 * Custom replacer function for JSON.stringify().
	 * Use for transforming values during serialization.
	 *
	 * @example Convert Date objects to ISO strings
	 * ```typescript
	 * const codec = new JsonCodec({
	 *   replacer: (key, value) => {
	 *     if (value instanceof Date) {
	 *       return value.toISOString();
	 *     }
	 *     return value;
	 *   }
	 * });
	 * ```
	 */
	replacer?: (key: string, value: unknown) => unknown;

	/**
	 * Indentation for pretty-printing (for debugging).
	 * Pass number for spaces or string for custom indent.
	 * Leave undefined for compact output (recommended for production).
	 */
	space?: string | number;
}

/**
 * JSON codec for text-based message serialization.
 *
 * This is the default codec used by WebSocket and TCP protocols
 * when no custom codec is specified.
 *
 * @example Basic usage (default)
 * ```typescript
 * const codec = new JsonCodec();
 * const encoded = codec.encode({ type: "ping", payload: { seq: 1 } });
 * // '{"type":"ping","payload":{"seq":1}}'
 * ```
 *
 * @example With date handling
 * ```typescript
 * const codec = new JsonCodec({
 *   reviver: (key, value) => {
 *     if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
 *       return new Date(value);
 *     }
 *     return value;
 *   }
 * });
 * ```
 */
export class JsonCodec implements Codec<string> {
	readonly name = "json";
	readonly wireFormat: WireFormat = "text";

	private readonly reviver?: (key: string, value: unknown) => unknown;
	private readonly replacer?: (key: string, value: unknown) => unknown;
	private readonly space?: string | number;

	constructor(options: JsonCodecOptions = {}) {
		this.reviver = options.reviver;
		this.replacer = options.replacer;
		this.space = options.space;
	}

	/**
	 * Encode a Message to JSON string
	 */
	encode(message: Message): string {
		try {
			return JSON.stringify(message, this.replacer, this.space);
		} catch (error) {
			throw CodecError.encodeError(this.name, error instanceof Error ? error : new Error(String(error)), message);
		}
	}

	/**
	 * Decode a JSON string to Message
	 */
	decode(data: string): Message {
		try {
			const parsed = JSON.parse(data, this.reviver) as unknown;

			// Validate basic Message structure
			if (!isValidMessage(parsed)) {
				throw new Error('Invalid message structure: missing "type" field');
			}

			return parsed;
		} catch (error) {
			// If already a CodecError, rethrow
			if (error instanceof CodecError) {
				throw error;
			}

			// Truncate large data for error message
			const truncatedData = data.length > 200 ? `${data.slice(0, 200)}...` : data;

			throw CodecError.decodeError(this.name, error instanceof Error ? error : new Error(String(error)), truncatedData);
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
 * Default JSON codec instance.
 * Use this when you need a simple JSON codec without custom options.
 */
export const defaultJsonCodec = new JsonCodec();
