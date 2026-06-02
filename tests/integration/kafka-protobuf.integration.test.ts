/**
 * Kafka Protobuf Codec Integration Tests
 *
 * Verifies that the @testurio/adapter-kafka package roundtrips binary-codec
 * payloads correctly after the codec-passthrough refactor (task 027). Uses a
 * protobufjs-backed codec end-to-end against a real Redpanda container.
 *
 * These tests require Docker to be running. They will be skipped automatically
 * if Docker is not available.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { KafkaAdapter } from "@testurio/adapter-kafka";
import * as protobuf from "protobufjs";
import { type Codec, CodecError, Publisher, Subscriber, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";
import { getKafkaConfig, isKafkaAvailable } from "../containers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const root = await protobuf.load(path.resolve(__dirname, "../proto/mq-events.proto"));
const OrderEventType = root.lookupType("testurio.mq.OrderEvent");

interface OrderEventData {
	orderId: string;
	amount: number;
	status: string;
}

const orderProtobufCodec: Codec<Uint8Array> = {
	name: "orders-protobuf",
	wireFormat: "binary",
	encode(data) {
		try {
			const message = OrderEventType.fromObject(data as Record<string, unknown>);
			return OrderEventType.encode(message).finish();
		} catch (error) {
			throw CodecError.encodeError("orders-protobuf", error instanceof Error ? error : new Error(String(error)), data);
		}
	},
	decode(wire) {
		try {
			const bytes = typeof wire === "string" ? new TextEncoder().encode(wire) : wire;
			const message = OrderEventType.decode(bytes);
			return OrderEventType.toObject(message, { defaults: true }) as unknown as never;
		} catch (error) {
			if (error instanceof CodecError) throw error;
			throw CodecError.decodeError("orders-protobuf", error instanceof Error ? error : new Error(String(error)));
		}
	},
};

describe.skipIf(!isKafkaAvailable())("Kafka Protobuf Codec Integration", () => {
	it("should roundtrip a protobuf payload through Kafka", async () => {
		const kafka = getKafkaConfig();
		const adapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: `test-kafka-pb-${Date.now()}`,
			groupId: `test-group-pb-${Date.now()}`,
			fromBeginning: true,
			testMode: true,
		});

		const publisher = new Publisher("pub", { adapter, codec: orderProtobufCodec });
		const subscriber = new Subscriber("sub", { adapter, codec: orderProtobufCodec });

		const scenario = new TestScenario({
			name: "Kafka protobuf roundtrip",
			components: [subscriber, publisher],
		});

		const payload: OrderEventData = { orderId: "o-1", amount: 42, status: "NEW" };

		const tc = testCase("publish + receive protobuf-encoded OrderEvent", (test) => {
			const pub = test.use(publisher);
			const sub = test.use(subscriber);

			pub.publish("orders-pb", payload);

			sub.waitMessage("orders-pb").assert((msg) => {
				expect(msg.payload).toEqual(payload);
				return true;
			});
		});

		const result = await scenario.run(tc);
		if (!result.passed) {
			console.log("Test failed. Result:", JSON.stringify(result, null, 2));
		}
		expect(result.passed).toBe(true);
	});

	it("should surface a CodecError when payload bytes don't match the protobuf schema", async () => {
		const kafka = getKafkaConfig();
		// Use separate adapter instances so the bad-bytes publisher and protobuf
		// subscriber can coexist on the same topic without sharing a codec instance.
		const writerAdapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: `test-kafka-pb-bad-w-${Date.now()}`,
			groupId: `test-group-pb-bad-w-${Date.now()}`,
			fromBeginning: true,
			testMode: true,
		});
		const readerAdapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: `test-kafka-pb-bad-r-${Date.now()}`,
			groupId: `test-group-pb-bad-r-${Date.now()}`,
			fromBeginning: true,
			testMode: true,
		});

		// Publisher emits bytes that are guaranteed-invalid protobuf wire format:
		// `0x0a` = field 1, wire type 2 (length-delimited); next varint announces
		// length 0xff (continuation bit set, no body) → protobufjs throws on decode.
		const garbageBytesCodec: Codec<Uint8Array> = {
			name: "garbage",
			wireFormat: "binary",
			encode: () => new Uint8Array([0x0a, 0xff]),
			decode: () => null as never,
		};

		const publisher = new Publisher("pub", { adapter: writerAdapter, codec: garbageBytesCodec });
		const subscriber = new Subscriber("sub", { adapter: readerAdapter, codec: orderProtobufCodec });

		const scenario = new TestScenario({
			name: "Kafka protobuf decode-failure",
			components: [subscriber, publisher],
		});

		const tc = testCase("publish malformed bytes to a protobuf-subscribed topic", (test) => {
			const pub = test.use(publisher);
			const sub = test.use(subscriber);

			pub.publish("orders-pb-bad", { not: "a real order" });

			// Bad bytes never reach the hook — decode throws and the error is
			// tracked on the subscriber's unhandledErrors. Bounded wait so we
			// give the consumer time to receive + fail.
			sub.waitMessage("orders-pb-bad").timeout(8000);
		});

		await scenario.run(tc);

		const errors = subscriber.getUnhandledErrors();
		const codecErrors = errors.filter((e) => e instanceof CodecError);
		expect(codecErrors.length).toBeGreaterThan(0);
		expect(codecErrors[0]?.codecName).toBe("orders-protobuf");
	}, 30_000);
});
