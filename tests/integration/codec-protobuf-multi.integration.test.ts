/**
 * ProtobufCodec multi-binding integration test (task 034 Phase 4 / D-7).
 *
 * One Publisher + one Subscriber + one ProtobufCodec dispatching three
 * matcher kinds (string / RegExp / predicate) across four topics:
 *   - orders.v1     — string matcher
 *   - users.v1      — RegExp matcher
 *   - users.v2      — RegExp matcher
 *   - audit.signup  — predicate matcher (A13 — exercised end-to-end)
 *
 * Also covers the no-match throw scenario (D-7 case 2).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { KafkaAdapter } from "@testurio/adapter-kafka";
import { ProtobufCodec } from "@testurio/codec-protobuf";
import { Publisher, Subscriber, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";
import { getKafkaConfig, isKafkaAvailable } from "../containers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROTO_PATH = path.resolve(__dirname, "../proto/mq-events.proto");

interface OrderEvent {
	orderId: string;
	amount: number;
	status: string;
}
interface UserEvent {
	userId: string;
	action: string;
}
interface MyTopics {
	"orders.v1": OrderEvent;
	"users.v1": UserEvent;
	"users.v2": UserEvent;
	"audit.signup": UserEvent;
}

describe.skipIf(!isKafkaAvailable())("ProtobufCodec multi-binding (Kafka)", () => {
	it("routes encode/decode via mixed matcher kinds (string, RegExp, predicate)", async () => {
		const kafka = getKafkaConfig();
		const codec = new ProtobufCodec({
			proto: PROTO_PATH,
			bindings: [
				{ match: "orders.v1", type: "testurio.mq.OrderEvent" },
				{ match: /^users\.v\d+$/, type: "testurio.mq.UserEvent" },
				{ match: (k) => k.startsWith("audit."), type: "testurio.mq.UserEvent" },
			],
		});

		const ts = Date.now();
		const adapter = new KafkaAdapter({
			clientId: `codec-pb-multi-${ts}`,
			brokers: kafka.brokers,
			defaultSubscribeParams: { groupId: `codec-pb-multi-${ts}`, fromBeginning: true },
			testMode: true,
		});

		const pub = new Publisher<MyTopics>("pub", { adapter, codec });
		const sub = new Subscriber<MyTopics>("sub", { adapter, codec, autoSubscribe: true });

		const scenario = new TestScenario({ name: "pb-multi", components: [sub, pub] });

		const tc = testCase("four topics, three matcher kinds, one codec", (test) => {
			const p = test.use(pub);
			const s = test.use(sub);

			// Publish first (matches the existing protobuf integration tests'
			// idiom; the framework collects auto-subscribe topics from
			// `waitMessage` declarations at TC build time, so by the time
			// steps run the subscriber is already attached).
			p.publish("orders.v1", { orderId: "o-1", amount: 42, status: "NEW" });
			p.publish("users.v1", { userId: "u-1", action: "LOGIN" });
			p.publish("users.v2", { userId: "u-2", action: "LOGOUT" });
			p.publish("audit.signup", { userId: "u-3", action: "SIGNUP" });

			s.waitMessage("orders.v1")
				.timeout(30_000)
				.assert((m) => m.payload.orderId === "o-1" && m.payload.amount === 42 && m.payload.status === "NEW");
			s.waitMessage("users.v1")
				.timeout(30_000)
				.assert((m) => m.payload.userId === "u-1" && m.payload.action === "LOGIN");
			s.waitMessage("users.v2")
				.timeout(30_000)
				.assert((m) => m.payload.userId === "u-2" && m.payload.action === "LOGOUT");
			// Predicate matcher exercised end-to-end (closes C-4).
			s.waitMessage("audit.signup")
				.timeout(30_000)
				.assert((m) => m.payload.userId === "u-3" && m.payload.action === "SIGNUP");
		});

		const result = await scenario.run(tc);
		if (!result.passed) {
			console.log("Multi-binding test failed:", JSON.stringify(result, null, 2));
		}
		expect(result.passed, result.error).toBe(true);
	}, 60_000);

	it("throws CodecError when no entry matches the topic key", async () => {
		const kafka = getKafkaConfig();
		const codec = new ProtobufCodec({
			proto: PROTO_PATH,
			bindings: [{ match: "orders.v1", type: "testurio.mq.OrderEvent" }],
		});

		const ts = Date.now();
		const adapter = new KafkaAdapter({
			clientId: `codec-pb-nm-${ts}`,
			brokers: kafka.brokers,
			defaultSubscribeParams: { groupId: `codec-pb-nm-${ts}`, fromBeginning: true },
			testMode: true,
		});
		const pub = new Publisher("pub", { adapter, codec });
		const scenario = new TestScenario({ name: "pb-no-binding", components: [pub] });

		const tc = testCase("publish to unbound topic", (test) => {
			test.use(pub).publish("unmapped.v1", { foo: "bar" });
		});

		const result = await scenario.run(tc);
		expect(result.passed).toBe(false);
		// Surface the No-binding error message — it can land on the test-case
		// error, on a step error, or on the scenario error depending on how
		// the framework propagates the publish failure.
		const serialized = JSON.stringify(result);
		expect(serialized).toMatch(/No binding entry matched key='unmapped\.v1'/);
	}, 30_000);
});
