/**
 * Codec Unit Tests
 *
 * Tests for codec interface and JsonCodec implementation.
 */

import type { Codec, Message } from "testurio";
import { CodecError, defaultJsonCodec, JsonCodec } from "testurio";
import { describe, expect, it } from "vitest";

describe("JsonCodec", () => {
	describe("basic functionality", () => {
		it("should have correct name and wireFormat", () => {
			const codec = new JsonCodec();
			expect(codec.name).toBe("json");
			expect(codec.wireFormat).toBe("text");
		});

		it("should encode message to JSON string", () => {
			const codec = new JsonCodec();
			const message: Message = { type: "test", payload: { data: "value" } };
			const encoded = codec.encode(message);

			expect(typeof encoded).toBe("string");
			expect(encoded).toBe(JSON.stringify(message));
		});

		it("should decode JSON string to message", () => {
			const codec = new JsonCodec();
			const message: Message = { type: "test", payload: { data: "value" } };
			const json = JSON.stringify(message);
			const decoded = codec.decode(json);

			expect(decoded).toEqual(message);
		});

		it("should handle complex nested objects", () => {
			const codec = new JsonCodec();
			const message: Message = {
				type: "complex",
				payload: {
					users: [
						{ id: 1, name: "Alice" },
						{ id: 2, name: "Bob" },
					],
					metadata: {
						timestamp: 1234567890,
						nested: { deep: { value: true } },
					},
				},
			};

			const encoded = codec.encode(message);
			const decoded = codec.decode(encoded);

			expect(decoded).toEqual(message);
		});

		it("should handle empty payload", () => {
			const codec = new JsonCodec();
			const message: Message = { type: "empty", payload: {} };

			const encoded = codec.encode(message);
			const decoded = codec.decode(encoded);

			expect(decoded).toEqual(message);
		});

		it("should handle null payload", () => {
			const codec = new JsonCodec();
			const message: Message = { type: "null", payload: null };

			const encoded = codec.encode(message);
			const decoded = codec.decode(encoded);

			expect(decoded).toEqual(message);
		});
	});

	describe("reviver option", () => {
		it("should apply reviver function during decode", () => {
			// Reviver that converts ISO date strings to Date objects
			const dateReviver = (_: string, value: unknown): unknown => {
				if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
					return new Date(value);
				}
				return value;
			};

			const codec = new JsonCodec({ reviver: dateReviver });
			const json = JSON.stringify({
				type: "event",
				payload: { timestamp: "2024-01-15T12:00:00.000Z" },
			});

			const decoded = codec.decode<{ type: string; payload: { timestamp: Date } }>(json);

			expect(decoded.payload.timestamp).toBeInstanceOf(Date);
			expect((decoded.payload.timestamp as Date).toISOString()).toBe("2024-01-15T12:00:00.000Z");
		});
	});

	describe("replacer option", () => {
		it("should apply replacer function during encode", () => {
			// Replacer that converts BigInt to string
			const bigintReplacer = (_key: string, value: unknown): unknown => {
				if (typeof value === "bigint") {
					return value.toString();
				}
				return value;
			};

			const codec = new JsonCodec({ replacer: bigintReplacer });
			const message: Message = {
				type: "bigint",
				payload: { value: BigInt(9007199254740991) },
			};

			const encoded = codec.encode(message);
			const decoded = JSON.parse(encoded);

			expect(decoded.payload.value).toBe("9007199254740991");
		});

		it("should handle replacer with BigInt (Date already converted to ISO string by JSON.stringify)", () => {
			// Note: JSON.stringify calls Date.toJSON() before the replacer sees it,
			// so the replacer receives the ISO string, not the Date object
			const bigintReplacer = (_key: string, value: unknown): unknown => {
				if (typeof value === "bigint") {
					return { __type: "BigInt", value: value.toString() };
				}
				return value;
			};

			const codec = new JsonCodec({ replacer: bigintReplacer });
			const message: Message = {
				type: "mixed",
				payload: {
					date: new Date("2024-01-15"),
					bigint: BigInt(12345),
				},
			};

			const encoded = codec.encode(message);
			const decoded = JSON.parse(encoded);

			// Date is automatically converted to ISO string by JSON.stringify
			expect(decoded.payload.date).toBe("2024-01-15T00:00:00.000Z");
			// BigInt is handled by our replacer
			expect(decoded.payload.bigint).toEqual({
				__type: "BigInt",
				value: "12345",
			});
		});
	});

	describe("error handling", () => {
		it("should throw CodecError on invalid JSON decode", () => {
			const codec = new JsonCodec();

			expect(() => codec.decode("not valid json")).toThrow(CodecError);
			expect(() => codec.decode("not valid json")).toThrow(/Failed to decode/);
		});

		it("should include codec name in error", () => {
			const codec = new JsonCodec();

			try {
				codec.decode("invalid");
				expect.fail("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(CodecError);
				expect((error as CodecError).codecName).toBe("json");
				expect((error as CodecError).operation).toBe("decode");
			}
		});
	});

	describe("defaultJsonCodec", () => {
		it("should be a pre-instantiated JsonCodec", () => {
			expect(defaultJsonCodec).toBeInstanceOf(JsonCodec);
			expect(defaultJsonCodec.name).toBe("json");
			expect(defaultJsonCodec.wireFormat).toBe("text");
		});

		it("should work for encoding and decoding", () => {
			const message: Message = { type: "default", payload: { test: true } };

			const encoded = defaultJsonCodec.encode(message);
			const decoded = defaultJsonCodec.decode(encoded);

			expect(decoded).toEqual(message);
		});
	});
});

describe("CodecError", () => {
	describe("constructor", () => {
		it("should create error with all properties", () => {
			const cause = new Error("Original error");
			const error = new CodecError("Test error", "json", "encode", {
				cause,
				data: { test: true },
			});

			expect(error.message).toBe("Test error");
			expect(error.codecName).toBe("json");
			expect(error.operation).toBe("encode");
			expect(error.cause).toBe(cause);
			expect(error.data).toEqual({ test: true });
			expect(error.name).toBe("CodecError");
		});

		it("should create error without optional properties", () => {
			const error = new CodecError("Simple error", "msgpack", "decode");

			expect(error.message).toBe("Simple error");
			expect(error.codecName).toBe("msgpack");
			expect(error.operation).toBe("decode");
			expect(error.cause).toBeUndefined();
			expect(error.data).toBeUndefined();
		});
	});

	describe("static factory methods", () => {
		it("should create encode error with encodeError()", () => {
			const cause = new Error("Stringify failed");
			const error = CodecError.encodeError("json", cause, { test: true });

			expect(error.message).toContain("Failed to encode");
			expect(error.message).toContain("json");
			expect(error.message).toContain("Stringify failed");
			expect(error.codecName).toBe("json");
			expect(error.operation).toBe("encode");
			expect(error.cause).toBe(cause);
			expect(error.data).toEqual({ test: true });
		});

		it("should create decode error with decodeError()", () => {
			const cause = new Error("Parse failed");
			const error = CodecError.decodeError("msgpack", cause, "invalid data");

			expect(error.message).toContain("Failed to decode");
			expect(error.message).toContain("msgpack");
			expect(error.message).toContain("Parse failed");
			expect(error.codecName).toBe("msgpack");
			expect(error.operation).toBe("decode");
			expect(error.cause).toBe(cause);
			expect(error.data).toBe("invalid data");
		});
	});

	describe("error instanceof checks", () => {
		it("should be instance of Error", () => {
			const error = new CodecError("Test", "json", "encode");
			expect(error instanceof Error).toBe(true);
		});

		it("should be instance of CodecError", () => {
			const error = new CodecError("Test", "json", "encode");
			expect(error instanceof CodecError).toBe(true);
		});
	});
});

describe("Custom Codec Implementation", () => {
	it("should work with custom codec implementation", () => {
		// Example: A codec that adds a prefix
		const prefixCodec: Codec<string> = {
			name: "prefix",
			wireFormat: "text",
			encode: <D>(data: D) => `PREFIX:${JSON.stringify(data)}`,
			decode: <D>(wire: string) => {
				if (!wire.startsWith("PREFIX:")) {
					throw new Error("Missing prefix");
				}
				return JSON.parse(wire.slice(7)) as D;
			},
		};

		const message: Message = { type: "test", payload: { value: 42 } };
		const encoded = prefixCodec.encode(message) as string;

		expect(encoded).toBe(`PREFIX:${JSON.stringify(message)}`);

		const decoded = prefixCodec.decode<Message>(encoded);
		expect(decoded).toEqual(message);
	});

	it("should work with async codec", async () => {
		// Example: An async codec (e.g., for compression)
		const asyncCodec: Codec<string> = {
			name: "async",
			wireFormat: "text",
			encode: async <D>(data: D) => {
				await new Promise((r) => setTimeout(r, 1));
				return JSON.stringify(data);
			},
			decode: async <D>(wire: string) => {
				await new Promise((r) => setTimeout(r, 1));
				return JSON.parse(wire) as D;
			},
		};

		const message: Message = { type: "async", payload: { value: "test" } };
		const encoded = await asyncCodec.encode(message);
		const decoded = await asyncCodec.decode<Message>(encoded);

		expect(decoded).toEqual(message);
	});

	it("should work with binary codec", () => {
		// Example: A simple binary codec using TextEncoder/Decoder
		const binaryCodec: Codec<Uint8Array> = {
			name: "binary",
			wireFormat: "binary",
			encode: <D>(data: D) => {
				const json = JSON.stringify(data);
				return new TextEncoder().encode(json);
			},
			decode: <D>(wire: Uint8Array) => {
				const json = new TextDecoder().decode(wire);
				return JSON.parse(json) as D;
			},
		};

		const message: Message = { type: "binary", payload: { bytes: [1, 2, 3] } };
		const encoded = binaryCodec.encode(message) as Uint8Array;

		expect(encoded).toBeInstanceOf(Uint8Array);

		const decoded = binaryCodec.decode<Message>(encoded);
		expect(decoded).toEqual(message);
	});
});
