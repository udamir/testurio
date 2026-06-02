/**
 * RabbitMQ Protobuf Codec Integration Tests
 *
 * Verifies that the @testurio/adapter-rabbitmq package roundtrips binary-codec
 * payloads correctly after the codec-passthrough refactor (task 027). Uses a
 * protobufjs-backed codec end-to-end against a real RabbitMQ container.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { RabbitMQAdapter } from "@testurio/adapter-rabbitmq";
import * as protobuf from "protobufjs";
import { type Codec, CodecError, Publisher, Subscriber, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";
import { getRabbitMQConfig, isRabbitMQAvailable } from "../containers";

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
		const message = OrderEventType.fromObject(data as Record<string, unknown>);
		return OrderEventType.encode(message).finish();
	},
	decode(wire) {
		const bytes = typeof wire === "string" ? new TextEncoder().encode(wire) : wire;
		const message = OrderEventType.decode(bytes);
		return OrderEventType.toObject(message, { defaults: true }) as unknown as never;
	},
};

describe.skipIf(!isRabbitMQAvailable())("RabbitMQ Protobuf Codec Integration", () => {
	it("should roundtrip a protobuf payload through RabbitMQ", async () => {
		const rabbitmq = getRabbitMQConfig();
		const adapter = new RabbitMQAdapter({
			url: rabbitmq.amqpUrl,
			exchange: `orders-protobuf-test-${Date.now()}`,
			exchangeType: "topic",
		});

		const publisher = new Publisher("pub", { adapter, codec: orderProtobufCodec });
		const subscriber = new Subscriber("sub", { adapter, codec: orderProtobufCodec });

		const scenario = new TestScenario({
			name: "RabbitMQ protobuf roundtrip",
			components: [subscriber, publisher],
		});

		const payload: OrderEventData = { orderId: "o-1", amount: 42, status: "NEW" };

		const tc = testCase("publish + receive protobuf-encoded OrderEvent", (test) => {
			const pub = test.use(publisher);
			const sub = test.use(subscriber);

			pub.publish("orders.created", payload);

			sub.waitMessage("orders.created").assert((msg) => {
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
		const rabbitmq = getRabbitMQConfig();
		const exchange = `orders-protobuf-bad-test-${Date.now()}`;
		const writerAdapter = new RabbitMQAdapter({
			url: rabbitmq.amqpUrl,
			exchange,
			exchangeType: "topic",
		});
		const readerAdapter = new RabbitMQAdapter({
			url: rabbitmq.amqpUrl,
			exchange,
			exchangeType: "topic",
		});

		// Publisher emits guaranteed-invalid protobuf wire format (see Kafka test).
		const garbageBytesCodec: Codec<Uint8Array> = {
			name: "garbage",
			wireFormat: "binary",
			encode: () => new Uint8Array([0x0a, 0xff]),
			decode: () => null as never,
		};

		const publisher = new Publisher("pub", { adapter: writerAdapter, codec: garbageBytesCodec });
		const subscriber = new Subscriber("sub", { adapter: readerAdapter, codec: orderProtobufCodec });

		const scenario = new TestScenario({
			name: "RabbitMQ protobuf decode-failure",
			components: [subscriber, publisher],
		});

		const tc = testCase("publish malformed bytes to a protobuf-subscribed routing key", (test) => {
			const pub = test.use(publisher);
			const sub = test.use(subscriber);

			pub.publish("orders.bad", { not: "a real order" });

			// Bad bytes never reach the hook — decode throws and the error is
			// tracked on the subscriber's unhandledErrors.
			sub.waitMessage("orders.bad").timeout(5000);
		});

		await scenario.run(tc);

		const errors = subscriber.getUnhandledErrors();
		const codecErrors = errors.filter((e) => e instanceof CodecError);
		expect(codecErrors.length).toBeGreaterThan(0);
		expect(codecErrors[0]?.codecName).toBe("orders-protobuf");
	}, 30_000);
});
