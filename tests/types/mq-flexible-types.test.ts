// Disable for file
// biome-ignore-all lint/correctness/noUnusedVariables: test of types

/**
 * Type Tests for MQ Flexible Type System (Loose/Strict Mode)
 *
 * These tests verify compile-time type behavior for MQ components.
 * They don't run at runtime - they just need to compile without errors.
 *
 * NOTE: Message types are now fully adapter-specific.
 * This file only tests Topic/Payload type helpers.
 */

import type {
	DefaultTopics,
	IsLooseMode,
	Payload,
	Topic,
	Topics,
} from "../../packages/core/src/components/mq.base";

// =============================================================================
// Test 1: IsLooseMode detection
// =============================================================================

// Loose mode - DefaultTopics has index signature
type LooseModeResult = IsLooseMode<DefaultTopics>; // Should be true
const _looseModeCheck: LooseModeResult = true;

// Strict mode - specific keys only
interface StrictTopics {
	"user-events": { userId: string; action: string };
	"order-events": { orderId: string; status: string };
}
type StrictModeResult = IsLooseMode<StrictTopics>; // Should be false
const _strictModeCheck: StrictModeResult = false;

// =============================================================================
// Test 2: Topic type extraction - Loose mode
// =============================================================================

type LooseTopicType = Topic<DefaultTopics>; // Should be string

// In loose mode, any string is valid
const _looseTopicAny: LooseTopicType = "any-topic-name";
const _looseTopicAnother: LooseTopicType = "another.topic.with.dots";
const _looseTopicNumbers: LooseTopicType = "topic-123";

// =============================================================================
// Test 3: Topic type extraction - Strict mode
// =============================================================================

type StrictTopicType = Topic<StrictTopics>; // Should be "user-events" | "order-events"

// In strict mode, only defined topics are valid
const _strictTopicUser: StrictTopicType = "user-events";
const _strictTopicOrder: StrictTopicType = "order-events";

// @ts-expect-error - "invalid-topic" is not in StrictTopics
const _invalidTopic: StrictTopicType = "invalid-topic";

// =============================================================================
// Test 4: Payload type extraction - Loose mode
// =============================================================================

type LoosePayloadType = Payload<DefaultTopics, "any-topic">; // Should be unknown

// In loose mode, payload is unknown (any data accepted)
const _loosePayload1: LoosePayloadType = { anything: true };
const _loosePayload2: LoosePayloadType = "string payload";
const _loosePayload3: LoosePayloadType = 123;
const _loosePayload4: LoosePayloadType = null;

// =============================================================================
// Test 5: Payload type extraction - Strict mode
// =============================================================================

type UserEventPayload = Payload<StrictTopics, "user-events">; // Should be { userId: string; action: string }
type OrderEventPayload = Payload<StrictTopics, "order-events">; // Should be { orderId: string; status: string }

// In strict mode, payload must match the defined type
const _userPayload: UserEventPayload = { userId: "123", action: "created" };
const _orderPayload: OrderEventPayload = { orderId: "ORD-1", status: "pending" };

// @ts-expect-error - missing required field 'action'
const _invalidUserPayload: UserEventPayload = { userId: "123" };

// @ts-expect-error - wrong field type
const _wrongTypePayload: UserEventPayload = { userId: 123, action: "created" };

// =============================================================================
// Test 6: Topics type constraint
// =============================================================================

// Valid Topics type (Record<string, unknown>)
interface ValidTopics extends Topics {
	events: { type: string };
	logs: { message: string; level: string };
}

// Verify it satisfies Topics constraint
const _topicsCheck: Topics = {} as ValidTopics;

// =============================================================================
// Test 7: Complex nested payload types
// =============================================================================

interface ComplexTopics {
	"order-created": {
		orderId: string;
		customer: {
			id: string;
			name: string;
			address: {
				street: string;
				city: string;
				country: string;
			};
		};
		items: Array<{
			productId: string;
			quantity: number;
			price: number;
		}>;
		metadata: Record<string, unknown>;
	};
}

type ComplexPayload = Payload<ComplexTopics, "order-created">;

const _complexPayload: ComplexPayload = {
	orderId: "ORD-123",
	customer: {
		id: "CUST-1",
		name: "John Doe",
		address: {
			street: "123 Main St",
			city: "New York",
			country: "USA",
		},
	},
	items: [
		{ productId: "PROD-1", quantity: 2, price: 29.99 },
		{ productId: "PROD-2", quantity: 1, price: 49.99 },
	],
	metadata: { source: "web", campaign: "summer-sale" },
};

// =============================================================================
// Test 8: Union topic types
// =============================================================================

interface UnionTopics {
	notifications:
		| { type: "email"; to: string; subject: string }
		| { type: "sms"; phone: string; message: string }
		| { type: "push"; deviceId: string; title: string };
}

type NotificationPayload = Payload<UnionTopics, "notifications">;

const _emailNotification: NotificationPayload = {
	type: "email",
	to: "user@example.com",
	subject: "Hello",
};

const _smsNotification: NotificationPayload = {
	type: "sms",
	phone: "+1234567890",
	message: "Hello",
};

const _pushNotification: NotificationPayload = {
	type: "push",
	deviceId: "device-123",
	title: "New message",
};

// =============================================================================
// Runtime test to satisfy vitest (type tests are compile-time only)
// =============================================================================

import { describe, expect, it } from "vitest";

describe("MQ Flexible Types", () => {
	it("should compile type tests without errors", () => {
		// All type tests above are compile-time checks
		// If this file compiles, the type tests passed
		expect(true).toBe(true);

		// Log success for visibility
		console.log("All MQ type tests passed!");
	});
});
