/**
 * Redis Pub/Sub Protobuf Codec Integration Tests
 *
 * Verifies that the @testurio/adapter-redis Pub/Sub adapter roundtrips
 * binary-codec payloads correctly after the codec-passthrough refactor
 * (task 027). Uses a protobufjs-backed codec end-to-end against a real Redis
 * container.
 *
 * Redis Pub/Sub wraps every published payload in an envelope
 * (`{ payload, key, headers, timestamp }`) so the binary codec must encode
 * the *envelope*, with the inner protobuf message carried as raw bytes in
 * the envelope's `payload` field (see `tests/proto/mq-events.proto`).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { RedisPubSubAdapter } from "@testurio/adapter-redis";
import * as protobuf from "protobufjs";
import { type Codec, CodecError, Publisher, Subscriber, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";
import { getRedisConfig, isRedisAvailable } from "../containers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const root = await protobuf.load(path.resolve(__dirname, "../proto/mq-events.proto"));
const OrderEventType = root.lookupType("testurio.mq.OrderEvent");
const RedisEnvelopeType = root.lookupType("testurio.mq.RedisEnvelope");

interface OrderEventData {
	orderId: string;
	amount: number;
	status: string;
}

interface RedisEnvelopeShape {
	payload: unknown;
	key?: string;
	headers?: Record<string, string>;
	timestamp?: number;
}

/**
 * Codec that encodes the entire Redis envelope as a protobuf `RedisEnvelope`,
 * with the inner application payload (an `OrderEvent`) carried as raw bytes
 * in the envelope's `payload` field.
 */
const redisOrderEnvelopeCodec: Codec<Uint8Array> = {
	name: "redis-orders-protobuf",
	wireFormat: "binary",
	encode(envelope) {
		try {
			const e = envelope as RedisEnvelopeShape;
			const innerBytes = OrderEventType.encode(
				OrderEventType.fromObject(e.payload as Record<string, unknown>)
			).finish();
			const outerMessage = RedisEnvelopeType.fromObject({
				payload: innerBytes,
				key: e.key ?? "",
				headers: e.headers ?? {},
				timestamp: e.timestamp ?? 0,
			});
			return RedisEnvelopeType.encode(outerMessage).finish();
		} catch (error) {
			throw CodecError.encodeError(
				"redis-orders-protobuf",
				error instanceof Error ? error : new Error(String(error)),
				envelope
			);
		}
	},
	decode(wire) {
		try {
			const bytes = typeof wire === "string" ? new TextEncoder().encode(wire) : wire;
			const outerObj = RedisEnvelopeType.toObject(RedisEnvelopeType.decode(bytes), { defaults: true }) as {
				payload: Uint8Array;
				key?: string;
				headers?: Record<string, string>;
				timestamp?: number | { low: number; high: number };
			};
			const innerObj = OrderEventType.toObject(OrderEventType.decode(outerObj.payload), { defaults: true });
			const ts = outerObj.timestamp;
			const timestamp = typeof ts === "number" ? ts : ts ? ts.low : undefined;
			return {
				payload: innerObj,
				key: outerObj.key || undefined,
				headers: outerObj.headers && Object.keys(outerObj.headers).length > 0 ? outerObj.headers : undefined,
				timestamp,
			} as unknown as never;
		} catch (error) {
			if (error instanceof CodecError) throw error;
			throw CodecError.decodeError("redis-orders-protobuf", error instanceof Error ? error : new Error(String(error)));
		}
	},
};

describe.skipIf(!isRedisAvailable())("Redis Pub/Sub Protobuf Codec Integration", () => {
	it("should roundtrip a protobuf-encoded envelope through Redis Pub/Sub", async () => {
		const redis = getRedisConfig();
		const adapter = new RedisPubSubAdapter({
			host: redis.host,
			port: redis.port,
		});

		const publisher = new Publisher("pub", { adapter, codec: redisOrderEnvelopeCodec });
		const subscriber = new Subscriber("sub", { adapter, codec: redisOrderEnvelopeCodec });

		const scenario = new TestScenario({
			name: "Redis Pub/Sub protobuf roundtrip",
			components: [subscriber, publisher],
		});

		const payload: OrderEventData = { orderId: "o-1", amount: 42, status: "NEW" };

		const tc = testCase("publish + receive protobuf-encoded envelope", (test) => {
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

	it("should surface a CodecError when envelope bytes don't match the protobuf schema", async () => {
		const redis = getRedisConfig();
		const writerAdapter = new RedisPubSubAdapter({
			host: redis.host,
			port: redis.port,
		});
		const readerAdapter = new RedisPubSubAdapter({
			host: redis.host,
			port: redis.port,
		});

		// Publisher emits guaranteed-invalid protobuf wire format (see Kafka test).
		const garbageBytesCodec: Codec<Uint8Array> = {
			name: "garbage",
			wireFormat: "binary",
			encode: () => new Uint8Array([0x0a, 0xff]),
			decode: () => null as never,
		};

		const publisher = new Publisher("pub", { adapter: writerAdapter, codec: garbageBytesCodec });
		const subscriber = new Subscriber("sub", { adapter: readerAdapter, codec: redisOrderEnvelopeCodec });

		const scenario = new TestScenario({
			name: "Redis Pub/Sub protobuf decode-failure",
			components: [subscriber, publisher],
		});

		const tc = testCase("publish malformed bytes to a protobuf-subscribed channel", (test) => {
			const pub = test.use(publisher);
			const sub = test.use(subscriber);

			pub.publish("orders-pb-bad", { not: "a real order" });

			sub.waitMessage("orders-pb-bad").timeout(3000);
		});

		await scenario.run(tc);

		const errors = subscriber.getUnhandledErrors();
		const codecErrors = errors.filter((e) => e instanceof CodecError);
		expect(codecErrors.length).toBeGreaterThan(0);
		expect(codecErrors[0]?.codecName).toBe("redis-orders-protobuf");
	}, 20_000);
});
