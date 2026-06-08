/**
 * R6 audit handle (task 034) — pin `RabbitMQSubscriberAdapter.keyForCodec`
 * to `msg.fields.routingKey`.
 *
 * The codec dispatch key MUST be the broker-delivered routing key, never a
 * subscription pattern, never `findMatchingPattern(routingKey)`, never an
 * AMQP wildcard string like `"orders.*"`. This test pins that contract.
 */

import type { ChannelModel, ConsumeMessage } from "amqplib";
import { describe, expect, it } from "vitest";
import { RabbitMQSubscriberAdapter } from "../../packages/adapter-rabbitmq/src/rabbitmq.subscriber.adapter";
import { defaultJsonCodec } from "../../packages/core/src/codecs/json.codec";

function buildAdapter(): RabbitMQSubscriberAdapter {
	const connectionStub = {} as unknown as ChannelModel;
	return new RabbitMQSubscriberAdapter(connectionStub, defaultJsonCodec);
}

function buildMessage(routingKey: string, fields?: Partial<ConsumeMessage["fields"]>): ConsumeMessage {
	return {
		fields: {
			deliveryTag: 1,
			redelivered: false,
			exchange: "events",
			routingKey,
			consumerTag: "consumer-1",
			...fields,
		},
		properties: {
			headers: {},
		},
		content: Buffer.alloc(0),
	} as unknown as ConsumeMessage;
}

interface PrivateKeyForCodec {
	keyForCodec(msg: ConsumeMessage): string;
}

describe("RabbitMQSubscriberAdapter.keyForCodec (R1 audit)", () => {
	it("returns the concrete msg.fields.routingKey", () => {
		const adapter = buildAdapter();
		const helper = adapter as unknown as PrivateKeyForCodec;

		expect(helper.keyForCodec(buildMessage("orders.created"))).toBe("orders.created");
		expect(helper.keyForCodec(buildMessage("users.signup"))).toBe("users.signup");
	});

	it("returns the concrete routing key even when delivered via an AMQP wildcard subscription", () => {
		// The adapter may be bound to `"orders.*"` but the broker delivers the
		// concrete routing key. The helper MUST return that concrete key — never
		// the matched subscription pattern.
		const adapter = buildAdapter();
		const helper = adapter as unknown as PrivateKeyForCodec;

		const message = buildMessage("orders.updated");
		expect(helper.keyForCodec(message)).toBe("orders.updated");
		expect(helper.keyForCodec(message)).not.toBe("orders.*");
	});
});
