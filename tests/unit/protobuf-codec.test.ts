/**
 * ProtobufCodec unit tests (task 034 Phase 4).
 *
 * Covers:
 * - Matcher kinds (string / RegExp / predicate)
 * - Ordering (first-match-wins; predicate-throws-as-no-match with cause, R7)
 * - Error paths + Uint8Array subject truncation (M-5)
 * - Construction-time validation + `includePaths` (R4)
 * - `decodeOptions` default (A9)
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ProtobufCodec } from "@testurio/codec-protobuf";
import { CodecError } from "testurio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PROTO_PATH = path.resolve(__dirname, "../proto/mq-events.proto");

interface OrderEvent {
	orderId: string;
	amount: number;
	status: string;
}

describe("ProtobufCodec", () => {
	describe("matcher kinds", () => {
		it("resolves via exact-string matcher", () => {
			const codec = new ProtobufCodec({
				proto: PROTO_PATH,
				bindings: [{ match: "orders.v1", type: "testurio.mq.OrderEvent" }],
			});
			const bytes = codec.encode({ orderId: "o-1", amount: 42, status: "NEW" }, "orders.v1");
			expect(bytes).toBeInstanceOf(Uint8Array);
			expect(codec.decode<OrderEvent>(bytes, "orders.v1")).toEqual({
				orderId: "o-1",
				amount: 42,
				status: "NEW",
			});
		});

		it("resolves via RegExp matcher", () => {
			const codec = new ProtobufCodec({
				proto: PROTO_PATH,
				bindings: [{ match: /^orders\.v\d+$/, type: "testurio.mq.OrderEvent" }],
			});
			const bytes = codec.encode({ orderId: "o-1", amount: 1, status: "NEW" }, "orders.v42");
			expect(codec.decode<OrderEvent>(bytes, "orders.v42")).toMatchObject({ orderId: "o-1" });
		});

		it("resolves via predicate matcher", () => {
			const codec = new ProtobufCodec({
				proto: PROTO_PATH,
				bindings: [
					{
						match: (k) => k.startsWith("orders."),
						type: "testurio.mq.OrderEvent",
					},
				],
			});
			const bytes = codec.encode({ orderId: "o-1", amount: 1, status: "NEW" }, "orders.created");
			expect(codec.decode<OrderEvent>(bytes, "orders.created")).toMatchObject({ orderId: "o-1" });
		});
	});

	describe("ordering", () => {
		it("first match wins — more specific entry placed first", () => {
			const codec = new ProtobufCodec({
				proto: PROTO_PATH,
				bindings: [
					{ match: "orders.priority", type: "testurio.mq.OrderEvent" },
					{ match: /^orders\..+$/, type: "testurio.mq.UserEvent" },
				],
			});
			// Decoding via OrderEvent must succeed for "orders.priority".
			const bytes = codec.encode({ orderId: "o-1", amount: 1, status: "NEW" }, "orders.priority");
			expect(codec.decode<OrderEvent>(bytes, "orders.priority")).toMatchObject({ orderId: "o-1" });
		});

		it("predicate that throws is treated as no-match; scan continues", () => {
			const codec = new ProtobufCodec({
				proto: PROTO_PATH,
				bindings: [
					{
						match: () => {
							throw new Error("boom");
						},
						type: "testurio.mq.OrderEvent",
					},
					{ match: "orders.v1", type: "testurio.mq.OrderEvent" },
				],
			});
			const bytes = codec.encode({ orderId: "o-1", amount: 1, status: "NEW" }, "orders.v1");
			expect(codec.decode<OrderEvent>(bytes, "orders.v1")).toMatchObject({ orderId: "o-1" });
		});

		it("R7: when all predicates throw and no entry matches, the last throw is reachable via CodecError.cause chain", () => {
			const codec = new ProtobufCodec({
				proto: PROTO_PATH,
				bindings: [
					{
						match: () => {
							throw new Error("first predicate");
						},
						type: "testurio.mq.OrderEvent",
					},
					{
						match: () => {
							throw new Error("second predicate");
						},
						type: "testurio.mq.UserEvent",
					},
				],
			});
			try {
				codec.encode({ orderId: "o-1", amount: 1, status: "NEW" }, "unknown");
				expect.fail("should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(CodecError);
				// The CodecError wraps a "No binding entry matched..." Error whose
				// own `cause` is the **last** predicate throw (R7).
				const wrapped = (err as CodecError).cause;
				expect(wrapped).toBeInstanceOf(Error);
				expect(wrapped?.message).toMatch(/No binding entry matched/);
				const predicateThrow = (wrapped as Error & { cause?: Error }).cause;
				expect(predicateThrow).toBeInstanceOf(Error);
				expect(predicateThrow?.message).toBe("second predicate");
			}
		});
	});

	describe("errors", () => {
		it("throws CodecError on encode when key is undefined", () => {
			const codec = new ProtobufCodec({
				proto: PROTO_PATH,
				bindings: [{ match: "orders.v1", type: "testurio.mq.OrderEvent" }],
			});
			expect(() => codec.encode({ foo: 1 })).toThrow(CodecError);
		});

		it("throws CodecError on encode when no entry matches", () => {
			const codec = new ProtobufCodec({
				proto: PROTO_PATH,
				bindings: [{ match: "orders.v1", type: "testurio.mq.OrderEvent" }],
			});
			expect(() => codec.encode({ foo: 1 }, "unknown")).toThrow(/No binding entry matched key='unknown'/);
		});

		it("throws CodecError on decode when key is undefined", () => {
			const codec = new ProtobufCodec({
				proto: PROTO_PATH,
				bindings: [{ match: "orders.v1", type: "testurio.mq.OrderEvent" }],
			});
			expect(() => codec.decode(new Uint8Array([0x0a]))).toThrow(CodecError);
		});

		it("throws CodecError on decode when no entry matches", () => {
			const codec = new ProtobufCodec({
				proto: PROTO_PATH,
				bindings: [{ match: "orders.v1", type: "testurio.mq.OrderEvent" }],
			});
			expect(() => codec.decode(new Uint8Array([0x0a]), "unknown")).toThrow(/No binding entry matched key='unknown'/);
		});

		it("error message describes every entry's matcher and target type", () => {
			const codec = new ProtobufCodec({
				proto: PROTO_PATH,
				bindings: [
					{ match: "orders.v1", type: "testurio.mq.OrderEvent" },
					{ match: /^users\..+/, type: "testurio.mq.UserEvent" },
					{ match: () => false, type: "testurio.mq.UserEvent" },
				],
			});
			try {
				codec.encode({ foo: 1 }, "nope");
				expect.fail("should have thrown");
			} catch (err) {
				expect((err as Error).message).toMatch(/"orders\.v1"/);
				expect((err as Error).message).toMatch(/\/\^users\\\.\.\+\//);
				expect((err as Error).message).toMatch(/<predicate>/);
				expect((err as Error).message).toMatch(/testurio\.mq\.OrderEvent/);
			}
		});

		it("M-5: decode error truncates Uint8Array subject to byteLength + hex preview", () => {
			const codec = new ProtobufCodec({
				proto: PROTO_PATH,
				bindings: [{ match: "orders.v1", type: "testurio.mq.OrderEvent" }],
			});
			const longBuffer = new Uint8Array(1024);
			for (let i = 0; i < longBuffer.length; i++) longBuffer[i] = i & 0xff;
			try {
				codec.decode(longBuffer, "unknown");
				expect.fail("should have thrown");
			} catch (err) {
				const data = (err as CodecError).data;
				expect(typeof data).toBe("string");
				expect(data).toMatch(/^<Uint8Array len=1024 0x[0-9a-f]+…?>$/);
				expect(data).not.toMatch(/\\x/); // never the raw bytes
			}
		});
	});

	describe("construction", () => {
		it("throws at construction when a binding type name is wrong", () => {
			expect(
				() =>
					new ProtobufCodec({
						proto: PROTO_PATH,
						bindings: [{ match: "orders.v1", type: "testurio.mq.NotARealType" }],
					})
			).toThrow();
		});

		it("R4: accepts proto: string[] (multi-file load)", () => {
			const codec = new ProtobufCodec({
				proto: [PROTO_PATH],
				bindings: [{ match: "orders.v1", type: "testurio.mq.OrderEvent" }],
			});
			const bytes = codec.encode({ orderId: "o-1", amount: 1, status: "NEW" }, "orders.v1");
			expect(bytes).toBeInstanceOf(Uint8Array);
		});

		describe("R4: includePaths resolves cross-directory imports", () => {
			const tmpRoot = path.join(tmpdir(), `testurio-codec-protobuf-${Date.now()}`);
			const basePath = path.join(tmpRoot, "schemas");
			const sharedPath = path.join(basePath, "shared");
			const eventsPath = path.join(basePath, "events");

			beforeAll(() => {
				mkdirSync(sharedPath, { recursive: true });
				mkdirSync(eventsPath, { recursive: true });
				writeFileSync(
					path.join(sharedPath, "common.proto"),
					'syntax = "proto3";\npackage shared;\nmessage Common { string id = 1; }\n'
				);
				writeFileSync(
					path.join(eventsPath, "main.proto"),
					'syntax = "proto3";\nimport "shared/common.proto";\npackage events;\nmessage Wrapper { shared.Common inner = 1; }\n'
				);
			});

			afterAll(() => {
				if (existsSync(tmpRoot)) {
					rmSync(tmpRoot, { recursive: true, force: true });
				}
			});

			it("loads a proto that imports cross-directory when includePaths covers the base", () => {
				const codec = new ProtobufCodec({
					proto: path.join(eventsPath, "main.proto"),
					includePaths: [basePath],
					bindings: [{ match: "wrapper", type: "events.Wrapper" }],
				});
				const bytes = codec.encode({ inner: { id: "x-1" } }, "wrapper");
				expect(bytes).toBeInstanceOf(Uint8Array);
				expect(codec.decode<{ inner: { id: string } }>(bytes, "wrapper")).toEqual({
					inner: { id: "x-1" },
				});
			});
		});
	});

	describe("decodeOptions", () => {
		it("A9: bytes fields round-trip as Uint8Array under the default decodeOptions", () => {
			const codec = new ProtobufCodec({
				proto: PROTO_PATH,
				bindings: [{ match: "redis", type: "testurio.mq.RedisEnvelope" }],
			});
			const payload = new Uint8Array([1, 2, 3, 4, 5]);
			const bytes = codec.encode(
				{
					payload,
					key: "k",
					headers: { h: "v" },
					timestamp: 42,
				},
				"redis"
			);
			const decoded = codec.decode<{ payload: unknown }>(bytes, "redis");
			expect(decoded.payload).toBeInstanceOf(Uint8Array);
			expect(Array.from(decoded.payload as Uint8Array)).toEqual([1, 2, 3, 4, 5]);
		});
	});
});
