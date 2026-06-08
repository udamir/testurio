/**
 * R6 audit handle (task 034) — pin `RedisPubSubSubscriberAdapter.keyForCodec`
 * to the concrete `channel`.
 *
 * The codec dispatch key MUST be the channel the message arrived on. Even
 * when the subscription used a pattern (PSUBSCRIBE), the helper MUST NOT
 * return `pattern`, `pattern ?? channel`, or any glob mask. This test pins
 * that contract.
 */

import type { Redis } from "ioredis";
import { describe, expect, it } from "vitest";
import { RedisPubSubSubscriberAdapter } from "../../packages/adapter-redis/src/pubsub/pubsub.subscriber.adapter";
import { defaultJsonCodec } from "../../packages/core/src/codecs/json.codec";

function buildAdapter(usePatterns = false): RedisPubSubSubscriberAdapter {
	const redisStub = {
		status: "ready",
		on: () => redisStub,
		once: () => redisStub,
		subscribe: async () => {},
		psubscribe: async () => {},
		unsubscribe: async () => {},
		punsubscribe: async () => {},
		quit: async () => {},
	} as unknown as Redis;
	return new RedisPubSubSubscriberAdapter(redisStub, defaultJsonCodec, usePatterns);
}

interface PrivateKeyForCodec {
	keyForCodec(channel: string, pattern?: string): string;
}

describe("RedisPubSubSubscriberAdapter.keyForCodec (R1 audit)", () => {
	it("returns the concrete channel when no pattern is set", () => {
		const adapter = buildAdapter();
		const helper = adapter as unknown as PrivateKeyForCodec;

		expect(helper.keyForCodec("orders.created")).toBe("orders.created");
		expect(helper.keyForCodec("users.signup")).toBe("users.signup");
	});

	it("returns the concrete channel — NOT the pattern — when delivered via a glob subscription", () => {
		// PSUBSCRIBE delivers `(pattern, channel, message)`. The helper MUST
		// return the channel even though `pattern` is in scope.
		const adapter = buildAdapter(true);
		const helper = adapter as unknown as PrivateKeyForCodec;

		expect(helper.keyForCodec("orders.created", "orders.*")).toBe("orders.created");
		expect(helper.keyForCodec("orders.created", "orders.*")).not.toBe("orders.*");
		expect(helper.keyForCodec("user1.login", "user[12].login")).toBe("user1.login");
	});
});
