/**
 * Message Matcher Tests
 */

import type { Hook, Message, PayloadMatcher } from "testurio";
import { matchHook, matchHttpPath, matchMessageType, matchPayload } from "testurio";
import { describe, expect, it } from "vitest";

// Helper to create a minimal hook for testing
function createHook(messageTypes: string | string[], matcher?: PayloadMatcher): Hook {
	return {
		id: "test-hook",
		componentName: "test",
		phase: "test",
		messageTypes,
		matcher,
		handlers: [],
		persistent: false,
	};
}

describe("MessageMatcher", () => {
	describe("matchMessageType", () => {
		it("should match single message type", () => {
			expect(matchMessageType("Order", "Order")).toBe(true);
		});

		it("should not match different message type", () => {
			expect(matchMessageType("Order", "Trade")).toBe(false);
		});

		it("should match when message type is in array", () => {
			expect(matchMessageType(["Order", "Trade"], "Order")).toBe(true);
			expect(matchMessageType(["Order", "Trade"], "Trade")).toBe(true);
		});

		it("should not match when message type is not in array", () => {
			expect(matchMessageType(["Order", "Trade"], "Quote")).toBe(false);
		});
	});

	describe("matchPayload", () => {
		it("should match by traceId", () => {
			const matcher: PayloadMatcher = { type: "traceId", value: "trace-123" };
			const message: Message = {
				type: "Order",
				payload: {},
				traceId: "trace-123",
			};

			expect(matchPayload(matcher, message)).toBe(true);
		});

		it("should not match wrong traceId", () => {
			const matcher: PayloadMatcher = { type: "traceId", value: "trace-123" };
			const message: Message = {
				type: "Order",
				payload: {},
				traceId: "trace-456",
			};

			expect(matchPayload(matcher, message)).toBe(false);
		});

		it("should match by function", () => {
			const matcher: PayloadMatcher = {
				type: "function",
				fn: (payload) => (payload as { amount: number }).amount > 100,
			};
			const message: Message = { type: "Order", payload: { amount: 200 } };

			expect(matchPayload(matcher, message)).toBe(true);
		});

		it("should not match when function returns false", () => {
			const matcher: PayloadMatcher = {
				type: "function",
				fn: (payload) => (payload as { amount: number }).amount > 100,
			};
			const message: Message = { type: "Order", payload: { amount: 50 } };

			expect(matchPayload(matcher, message)).toBe(false);
		});

		it("should handle function matcher errors", () => {
			const matcher: PayloadMatcher = {
				type: "function",
				fn: () => {
					throw new Error("Test error");
				},
			};
			const message: Message = { type: "Order", payload: {} };

			expect(matchPayload(matcher, message)).toBe(false);
		});

		it("should match by traceId", () => {
			const matcher: PayloadMatcher = { type: "traceId", value: "req-123" };
			const message: Message = {
				type: "request",
				payload: {},
				traceId: "req-123",
			};

			expect(matchPayload(matcher, message)).toBe(true);
		});
	});

	describe("matchHook", () => {
		it("should match when message type matches and no payload matcher", () => {
			const hook = createHook("Order");
			const message: Message = { type: "Order", payload: {} };

			expect(matchHook(hook, message)).toBe(true);
		});

		it("should not match when message type does not match", () => {
			const hook = createHook("Order");
			const message: Message = { type: "Trade", payload: {} };

			expect(matchHook(hook, message)).toBe(false);
		});

		it("should match when message type and payload matcher both match", () => {
			const hook = createHook("Order", { type: "traceId", value: "trace-123" });
			const message: Message = {
				type: "Order",
				payload: {},
				traceId: "trace-123",
			};

			expect(matchHook(hook, message)).toBe(true);
		});

		it("should not match when message type matches but payload matcher does not", () => {
			const hook = createHook("Order", { type: "traceId", value: "trace-123" });
			const message: Message = {
				type: "Order",
				payload: {},
				traceId: "trace-456",
			};

			expect(matchHook(hook, message)).toBe(false);
		});

		it("should match with array of message types", () => {
			const hook = createHook(["Order", "Trade"]);
			const message: Message = { type: "Trade", payload: {} };

			expect(matchHook(hook, message)).toBe(true);
		});
	});

	describe("matchHttpPath (from http-adapter)", () => {
		it("should match exact paths", () => {
			expect(matchHttpPath("/api/users", "/api/users")).toBe(true);
		});

		it("should not match different paths", () => {
			expect(matchHttpPath("/api/users", "/api/orders")).toBe(false);
		});

		it("should match path with single parameter", () => {
			expect(matchHttpPath("/api/users/123", "/api/users/{id}")).toBe(true);
		});

		it("should match path with multiple parameters", () => {
			expect(matchHttpPath("/api/users/123/orders/456", "/api/users/{userId}/orders/{orderId}")).toBe(true);
		});

		it("should not match if segment count differs", () => {
			expect(matchHttpPath("/api/users", "/api/users/{id}")).toBe(false);
			expect(matchHttpPath("/api/users/123/orders", "/api/users/{id}")).toBe(false);
		});

		it("should match complex paths", () => {
			expect(matchHttpPath("/api/v1/users/123/posts", "/api/v1/users/{id}/posts")).toBe(true);
		});
	});
});
