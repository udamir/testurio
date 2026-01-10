/**
 * JSON Codec
 *
 * Default codec implementation using JSON serialization.
 * Supports custom reviver/replacer functions for advanced use cases.
 * Works with any data type - protocol messages, MQ payloads, etc.
 */

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
 * JSON codec for text-based data serialization.
 *
 * This is the default codec used by protocols and MQ adapters
 * when no custom codec is specified.
 *
 * @template D - Data type being encoded/decoded (defaults to unknown)
 *
 * @example Basic usage
 * ```typescript
 * const codec = new JsonCodec();
 * const encoded = codec.encode({ orderId: "123" });
 * // '{"orderId":"123"}'
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
 *
 * @example Typed codec
 * ```typescript
 * interface Order { orderId: string; amount: number; }
 * const orderCodec = new JsonCodec<Order>();
 * const order = orderCodec.decode('{"orderId":"123","amount":100}');
 * // order is typed as Order
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
	 * Encode data to JSON string
	 */
	encode<D>(data: D): string {
		try {
			return JSON.stringify(data, this.replacer, this.space);
		} catch (error) {
			throw CodecError.encodeError(this.name, error instanceof Error ? error : new Error(String(error)), data);
		}
	}

	/**
	 * Decode a JSON string to data
	 */
	decode<D>(wire: string): D {
		try {
			return JSON.parse(wire, this.reviver) as D;
		} catch (error) {
			// If already a CodecError, rethrow
			if (error instanceof CodecError) {
				throw error;
			}

			// Truncate large data for error message
			const truncatedData = wire.length > 200 ? `${wire.slice(0, 200)}...` : wire;

			throw CodecError.decodeError(this.name, error instanceof Error ? error : new Error(String(error)), truncatedData);
		}
	}
}

/**
 * Default JSON codec instance.
 * Use this when you need a simple JSON codec without custom options.
 */
export const defaultJsonCodec = new JsonCodec();
